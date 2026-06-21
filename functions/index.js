const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const crypto = require('crypto');
const https = require('https');

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const LINE_CHANNEL_ACCESS_TOKEN = defineSecret('LINE_CHANNEL_ACCESS_TOKEN');
const LINE_CHANNEL_SECRET       = defineSecret('LINE_CHANNEL_SECRET');

const ALLOWED_EMAILS    = ['19980531mg@gmail.com', 'forpin1014@gmail.com'];
const PENDING_EXPIRY_MS = 10 * 60 * 1000;

// Module-level TTL cache — avoids full collection scans on every webhook event
let _cache = { customers: null, products: null, cachedAt: 0 };
const CACHE_TTL_MS = 5 * 60 * 1000;

async function getCachedCollections() {
  if (Date.now() - _cache.cachedAt < CACHE_TTL_MS && _cache.customers) return _cache;
  const [custSnap, prodSnap] = await Promise.all([
    db.collection('customers').get(),
    db.collection('products').get(),
  ]);
  _cache = {
    customers: custSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    products:  prodSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    cachedAt:  Date.now(),
  };
  return _cache;
}

// ── 傳送 LINE 推播（前端 onCall） ─────────────────────────────────────────────
exports.sendLineMessage = onCall({ secrets: [LINE_CHANNEL_ACCESS_TOKEN] }, async (request) => {
  const email = request.auth?.token?.email;
  if (!email || !ALLOWED_EMAILS.includes(email))
    throw new HttpsError('permission-denied', '只有管理員才能傳送通知');

  const { lineUserId, message } = request.data || {};
  if (!lineUserId || !message)
    throw new HttpsError('invalid-argument', '缺少 lineUserId 或 message');

  try {
    await linePost('/v2/bot/message/push',
      { to: lineUserId, messages: [{ type: 'text', text: message }] },
      LINE_CHANNEL_ACCESS_TOKEN.value(), true);
  } catch (e) {
    logger.error('LINE push failed', e.message);
    throw new HttpsError('internal', `LINE 推播失敗: ${e.message}`);
  }
  return { success: true };
});

// ── 依 LINE 顯示名稱比對客人（客人首次登入用）────────────────────────────────
exports.matchCustomerByLineName = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', '需要登入');
  const { displayName } = request.data || {};
  if (!displayName || typeof displayName !== 'string' || displayName.length > 100)
    throw new HttpsError('invalid-argument', '無效的顯示名稱');

  const nd   = normalizeStr(displayName);
  const snap = await db.collection('customers').get();
  const candidates = [];

  for (const d of snap.docs) {
    const c = d.data();
    if (c.lineUserId || c.isStock || !c.lineName) continue;
    const nl        = normalizeStr(c.lineName);
    const threshold = Math.max(nl.length, nd.length) <= 4 ? 1 : 2;
    const isSimilar = nl === nd || nl.includes(nd) || nd.includes(nl) ||
                      levenshtein(nl, nd) <= threshold;
    if (isSimilar)
      candidates.push({ id: d.id, lineName: c.lineName, communityNickname: c.communityNickname ?? null });
    if (candidates.length >= 3) break;
  }

  return { candidates };
});

// ── 客人暱稱比對（CustomerPage onCall）— 伺服器端比對，避免把全部客戶資料傳到瀏覽器
exports.findCustomerMatches = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', '需要登入');
  const { nickname } = request.data || {};
  if (!nickname || typeof nickname !== 'string' || nickname.length > 100)
    throw new HttpsError('invalid-argument', '無效的暱稱');

  const nq   = normalizeStr(nickname);
  const snap = await db.collection('customers').get();
  const matches = [];

  for (const d of snap.docs) {
    const c = d.data();
    if (c.lineUserId || !c.communityNickname) continue;
    const nc        = normalizeStr(c.communityNickname);
    const threshold = Math.max(nc.length, nq.length) <= 4 ? 1 : 2;
    const isSimilar = nc === nq || nc.includes(nq) || nq.includes(nc) ||
                      levenshtein(nc, nq) <= threshold;
    if (isSimilar) matches.push({ id: d.id, communityNickname: c.communityNickname });
    if (matches.length >= 5) break;
  }

  return { matches };
});

// ── LINE Webhook（接收訊息） ────────────────────────────────────────────────────
exports.lineWebhook = onRequest(
  { secrets: [LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN], invoker: 'public' },
  async (req, res) => {
    try {
      // Verify LINE signature before processing anything
      const sig = req.headers['x-line-signature'];
      const secret = LINE_CHANNEL_SECRET.value().replace(/[^\x20-\x7E]/g, '').trim();
      const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body), 'utf8');
      const computedSig = crypto.createHmac('SHA256', secret).update(rawBody).digest('base64');
      if (!sig || sig !== computedSig) {
        logger.warn('Invalid LINE signature, ignoring');
        res.status(200).send('OK');
        return;
      }

      const adminSnap = await db.doc('settings/adminLine').get();
      const adminData = adminSnap.data() || {};
      const adminLineUserIds = adminData.adminLineUserIds || [];
      const token = LINE_CHANNEL_ACCESS_TOKEN.value();

      for (const event of req.body.events || []) {
        if (event.type !== 'message' || event.message?.type !== 'text') continue;

        // Idempotency: atomic check-and-set prevents duplicate processing on LINE retries
        const eventId = event.webhookEventId;
        if (eventId) {
          const isDup = await db.runTransaction(async tx => {
            const ref  = db.doc(`processedEvents/${eventId}`);
            const snap = await tx.get(ref);
            if (snap.exists) return true;
            tx.set(ref, { at: Date.now() });
            return false;
          });
          if (isDup) continue;
        }

        const senderId   = event.source?.userId;
        const text       = event.message.text?.trim();
        const replyToken = event.replyToken;
        if (!senderId || !text) continue;

        // !setup：任何人可觸發，需到 web 確認（5 分鐘有效期）
        if (text === '!setup') {
          await db.doc('settings/adminLine').set({
            pendingLineUserId: senderId,
            pendingLineUserIdAt: Date.now(),
          }, { merge: true });
          await replyLine(replyToken, '✅ 已收到綁定申請！\n請到 GPick 後台的「設定」頁面確認身份，即可啟用快速下單功能。\n\n⏰ 綁定申請 5 分鐘內有效。', token);
          continue;
        }

        if (!adminLineUserIds.includes(senderId)) continue;

        if (text === '取消') {
          await db.doc('settings/adminLine').update({
            pendingOrder: admin.firestore.FieldValue.delete(),
          });
          await replyLine(replyToken, '❌ 已取消', token);
          continue;
        }

        const pending = adminData.pendingOrder;
        if (pending && pending.adminUserId === senderId && Date.now() < pending.expiresAt) {
          const num = parseInt(text, 10);
          if (!isNaN(num) && num > 0) {
            await handleSelection(senderId, num, replyToken, token, pending);
            continue;
          }
          await db.doc('settings/adminLine').update({
            pendingOrder: admin.firestore.FieldValue.delete(),
          });
        }

        await handleOrderMessage(senderId, text, replyToken, token);
      }
    } catch (e) {
      logger.error('webhook error', e);
    }
    res.status(200).send('OK');
  }
);

// ── 解析並處理新訂單訊息 ──────────────────────────────────────────────────────
async function handleOrderMessage(senderId, text, replyToken, token) {
  const lines  = text.split('\n').map(l => l.trim()).filter(Boolean);
  const orders = parseOrderLines(lines);

  if (orders.length === 0) {
    await replyLine(replyToken,
      '❓ 格式不符，範例：\nAmy 龍角散抹茶 2\n\n或多項：\nAmy\n龍角散抹茶 2\nEVE白盒 3', token);
    return;
  }

  const { customers, products } = await getCachedCollections();

  const customerQuery      = orders[0].customerQuery;
  const customerCandidates = findCustomerCandidates(customerQuery, customers);

  if (customerCandidates.length === 0) {
    await replyLine(replyToken, `找不到客人「${customerQuery}」`, token);
    return;
  }

  if (customerCandidates.length > 1) {
    const list = customerCandidates.map((c, i) =>
      `${numEmoji(i + 1)} ${c.communityNickname || c.lineName}`).join('\n');
    await savePending(senderId, {
      step: 'awaitCustomerSelection',
      customerCandidates: customerCandidates.map(c => ({
        id: c.id, name: c.communityNickname || c.lineName,
      })),
      pendingProductItems: orders.map(o => ({ productQuery: o.productQuery, quantity: o.quantity })),
      confirmedOrders: [],
      errors: [],
    });
    await replyLine(replyToken,
      `找到多位相符客人：\n${list}\n\n請回覆數字選擇，或傳「取消」放棄`, token);
    return;
  }

  await processProductItems(
    senderId, customerCandidates[0],
    orders.map(o => ({ productQuery: o.productQuery, quantity: o.quantity })),
    products, [], [], replyToken, token,
  );
}

// ── 逐一處理商品項目，遇到多個候選時暫停等待選擇 ─────────────────────────────
async function processProductItems(senderId, customer, items, products, confirmedOrders, errors, replyToken, token) {
  const remaining = [...items];

  while (remaining.length > 0) {
    const item       = remaining.shift();
    const candidates = findProductCandidates(item.productQuery, products);

    if (candidates.length === 0) {
      errors.push(`找不到商品「${item.productQuery}」`);
      continue;
    }

    if (candidates.length > 1) {
      const list = candidates.map((p, i) =>
        `${numEmoji(i + 1)} ${p.product.name}${p.variant ? `（${p.variant}）` : ''}`).join('\n');
      await savePending(senderId, {
        step: 'awaitProductSelection',
        resolvedCustomerId:   customer.id,
        resolvedCustomerName: customer.communityNickname || customer.lineName,
        productCandidates: candidates.map(p => ({
          productId: p.product.id, name: p.product.name, variant: p.variant,
        })),
        currentItemQuantity:   item.quantity,
        remainingProductItems: remaining,
        confirmedOrders,
        errors,
      });
      await replyLine(replyToken,
        `找到多個相符商品：\n${list}\n\n請回覆數字選擇，或傳「取消」放棄`, token);
      return;
    }

    const match = candidates[0];
    if (match.product.variants?.length > 0 && !match.variant) {
      errors.push(
        `❓「${match.product.name}」有以下款式，請補充後重傳：\n` +
        match.product.variants.map((v, i) => `${i + 1}. ${v}`).join('\n')
      );
      continue;
    }

    confirmedOrders.push({
      customerId:   customer.id,
      customerName: customer.communityNickname || customer.lineName,
      productId:    match.product.id,
      productName:  match.product.name,
      variant:      match.variant || null,
      quantity:     item.quantity,
    });
  }

  await finalizeOrders(confirmedOrders, errors, replyToken, token);
}

// ── 處理管理員的選擇數字 ──────────────────────────────────────────────────────
async function handleSelection(senderId, num, replyToken, token, pending) {
  if (pending.step === 'awaitCustomerSelection') {
    const candidates = pending.customerCandidates;
    if (num < 1 || num > candidates.length) {
      await replyLine(replyToken, `請回覆 1 到 ${candidates.length} 之間的數字`, token);
      return;
    }
    const selected         = candidates[num - 1];
    const { products }     = await getCachedCollections();
    await processProductItems(
      senderId,
      { id: selected.id, communityNickname: selected.name, lineName: selected.name },
      pending.pendingProductItems, products,
      pending.confirmedOrders || [], pending.errors || [],
      replyToken, token,
    );

  } else if (pending.step === 'awaitProductSelection') {
    const candidates = pending.productCandidates;
    if (num < 1 || num > candidates.length) {
      await replyLine(replyToken, `請回覆 1 到 ${candidates.length} 之間的數字`, token);
      return;
    }
    const selected     = candidates[num - 1];
    const newConfirmed = [
      ...(pending.confirmedOrders || []),
      {
        customerId:   pending.resolvedCustomerId,
        customerName: pending.resolvedCustomerName,
        productId:    selected.productId,
        productName:  selected.name,
        variant:      selected.variant,
        quantity:     pending.currentItemQuantity,
      },
    ];

    if (pending.remainingProductItems?.length > 0) {
      const { products } = await getCachedCollections();
      await processProductItems(
        senderId,
        { id: pending.resolvedCustomerId, communityNickname: pending.resolvedCustomerName, lineName: pending.resolvedCustomerName },
        pending.remainingProductItems, products,
        newConfirmed, pending.errors || [],
        replyToken, token,
      );
    } else {
      await finalizeOrders(newConfirmed, pending.errors || [], replyToken, token);
    }
  }
}

// ── 建立訂單並回覆確認 ────────────────────────────────────────────────────────
async function finalizeOrders(confirmedOrders, errors, replyToken, token) {
  await db.doc('settings/adminLine').update({
    pendingOrder: admin.firestore.FieldValue.delete(),
  });

  if (confirmedOrders.length > 0) {
    const batch = db.batch();
    for (const o of confirmedOrders) {
      const ref = db.collection('orders').doc();
      batch.set(ref, {
        id: ref.id, productId: o.productId, variant: o.variant || null,
        customerId: o.customerId, quantity: o.quantity, quantityBought: 0,
        status: 'PENDING', notificationStatus: 'UNNOTIFIED',
        isArchived: false, timestamp: Date.now(),
      });
    }
    await batch.commit();
  }

  let reply = '';
  if (confirmedOrders.length > 0) {
    reply += `✅ 已建立訂單\n${confirmedOrders.map(o =>
      `${o.customerName}｜${o.productName}${o.variant ? `（${o.variant}）` : ''} x${o.quantity}`
    ).join('\n')}`;
  }
  if (errors.length > 0) reply += `${reply ? '\n\n' : ''}⚠️ 以下無法建立：\n${errors.join('\n')}`;
  if (!reply) reply = '⚠️ 沒有成功建立任何訂單';

  await replyLine(replyToken, reply, token);
}

// ── 儲存待確認狀態 ────────────────────────────────────────────────────────────
async function savePending(senderId, data) {
  await db.doc('settings/adminLine').set({
    pendingOrder: { ...data, adminUserId: senderId, expiresAt: Date.now() + PENDING_EXPIRY_MS },
  }, { merge: true });
}

// ── 解析訊息行 ────────────────────────────────────────────────────────────────
function parseOrderLines(lines) {
  const orders = [];
  let currentCustomer = null;

  for (const line of lines) {
    const tokens    = line.split(/\s+/);
    const lastToken = tokens[tokens.length - 1];
    const qty       = parseInt(lastToken, 10);

    if (!isNaN(qty) && qty > 0 && tokens.length >= 2) {
      if (currentCustomer) {
        orders.push({ customerQuery: currentCustomer, productQuery: tokens.slice(0, -1).join(' '), quantity: qty });
      } else if (tokens.length >= 3) {
        const [customerQuery, ...productParts] = tokens.slice(0, -1);
        orders.push({ customerQuery, productQuery: productParts.join(' '), quantity: qty });
      }
    } else {
      currentCustomer = line;
    }
  }
  return orders;
}

// ── 客人模糊比對（有優先順序）────────────────────────────────────────────────
function findCustomerCandidates(query, customers) {
  const nq = normalizeStr(query);
  if (!nq) return [];

  const scored = [];
  for (const c of customers) {
    const nn = normalizeStr(c.communityNickname || '');
    const nl = normalizeStr(c.lineName || '');
    let score = -1;
    if (nn === nq || nl === nq)                               score = 3;
    else if (nn.startsWith(nq) || nl.startsWith(nq))         score = 2;
    else if (nn.includes(nq)   || nl.includes(nq))           score = 1;
    else if ((nn && levenshtein(nn, nq) <= 1) ||
             (nl && levenshtein(nl, nq) <= 1))                score = 0;
    if (score >= 0) scored.push({ customer: c, score });
  }

  scored.sort((a, b) => b.score - a.score);
  if (scored.length === 0) return [];
  const topScore = scored[0].score;
  if (topScore === 3) return scored.filter(s => s.score === 3).map(s => s.customer);
  return scored.filter(s => s.score === topScore).map(s => s.customer);
}

// ── 商品模糊比對 ──────────────────────────────────────────────────────────────
function findProductCandidates(query, products) {
  const nq = normalizeStr(query);
  if (!nq) return [];

  const scored = [];
  for (const product of products) {
    const np       = normalizeStr(product.name);
    const variants = product.variants || [];
    let matchedVariant = null;
    for (const v of variants) {
      const nv = normalizeStr(v);
      if (nv && nq.includes(nv)) { matchedVariant = v; break; }
    }
    const queryBase = matchedVariant
      ? normalizeStr(nq.replace(normalizeStr(matchedVariant), ''))
      : nq;

    let score = -1;
    if (np === nq || (queryBase && np === queryBase))                     score = 3;
    else if (np.includes(nq) || (queryBase && np.includes(queryBase)))   score = 2;
    else if (nq.includes(np) && np.length >= 2)                          score = 2;
    else if (np.length >= 2 && nq.length >= 2 && levenshtein(np, nq) <= 1) score = 1;

    if (score >= 0) scored.push({ product, variant: matchedVariant, score });
  }

  scored.sort((a, b) => b.score - a.score);
  if (scored.length === 0) return [];
  const topScore = scored[0].score;
  if (topScore === 3) return scored.filter(s => s.score === 3);
  return scored.filter(s => s.score === topScore);
}

// ── 字串正規化 ────────────────────────────────────────────────────────────────
function normalizeStr(s) {
  return (s || '').trim().toLowerCase().replace(/\s+/g, '');
}

// ── Levenshtein 距離 ──────────────────────────────────────────────────────────
function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : Math.min(dp[i-1][j-1], dp[i-1][j], dp[i][j-1]) + 1;
  return dp[a.length][b.length];
}

// ── LINE API ──────────────────────────────────────────────────────────────────
function linePost(path, body, token, throwOnError = false) {
  return new Promise((resolve, reject) => {
    const cleanToken = token.replace(/[^\x20-\x7E]/g, '').trim();
    const buf = Buffer.from(JSON.stringify(body), 'utf8');
    const req = https.request(
      {
        hostname: 'api.line.me', path, method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': buf.length,
          'Authorization': `Bearer ${cleanToken}`,
        },
      },
      (res) => {
        let data = '';
        res.on('data', c => { data += c; });
        res.on('end', () => {
          if (res.statusCode !== 200)
            logger.warn(`linePost ${path} responded ${res.statusCode}: ${data}`);
          if (throwOnError && res.statusCode !== 200)
            reject(new Error(`${res.statusCode}: ${data}`));
          else
            resolve();
        });
      }
    );
    req.on('error', throwOnError ? reject : (e) => { logger.error('linePost error', e); resolve(); });
    req.write(buf);
    req.end();
  });
}

async function replyLine(replyToken, text, token) {
  try {
    await linePost('/v2/bot/message/reply', { replyToken, messages: [{ type: 'text', text }] }, token);
  } catch (e) {
    logger.error('replyLine failed', e);
  }
}

function numEmoji(n) {
  return (['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣'])[n - 1] || `${n}.`;
}
