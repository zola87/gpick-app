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

const ALLOWED_EMAILS = ['19980531mg@gmail.com', 'forpin1014@gmail.com'];

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
      candidates.push({ id: d.id, lineName: c.lineName, nickname: c.nickname ?? null });
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
    if (c.lineUserId || !c.nickname) continue;
    const nc        = normalizeStr(c.nickname);
    const threshold = Math.max(nc.length, nq.length) <= 4 ? 1 : 2;
    const isSimilar = nc === nq || nc.includes(nq) || nq.includes(nc) ||
                      levenshtein(nc, nq) <= threshold;
    if (isSimilar) matches.push({ id: d.id, nickname: c.nickname });
    if (matches.length >= 5) break;
  }

  return { matches };
});

// ── LINE Webhook — 僅擷取客人回報的匯款後五碼（不做下單解析）──────────────────
exports.lineWebhook = onRequest(
  { secrets: [LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN], invoker: 'public' },
  async (req, res) => {
    try {
      const sig = req.headers['x-line-signature'];
      const secret = LINE_CHANNEL_SECRET.value().replace(/[^\x20-\x7E]/g, '').trim();
      const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body), 'utf8');
      const computedSig = crypto.createHmac('SHA256', secret).update(rawBody).digest('base64');
      if (!sig || sig !== computedSig) {
        logger.warn('Invalid LINE signature, ignoring');
        res.status(200).send('OK');
        return;
      }

      const token = LINE_CHANNEL_ACCESS_TOKEN.value();

      for (const event of req.body.events || []) {
        if (event.type !== 'message' && event.type !== 'postback') continue;
        if (event.type === 'message' && event.message?.type !== 'text') continue;

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
        const replyToken = event.replyToken;
        if (!senderId) continue;

        // 客人點擊「保留／不保留」快速回覆按鈕
        if (event.type === 'postback') {
          const data = event.postback?.data || '';
          const m = data.match(/^carry:(keep|drop):(.+)$/);
          if (!m) continue;
          const [, decision, orderId] = m;
          const orderRef = db.collection('orders').doc(orderId);
          const orderSnap = await orderRef.get();
          if (!orderSnap.exists) continue;
          // 確認這筆訂單真的是按按鈕的這位客人本人的，避免任何人拿到別人的 orderId 就能亂改保留狀態
          const orderCustSnap = await db.collection('customers').doc(orderSnap.data().customerId).get();
          if (!orderCustSnap.exists || orderCustSnap.data().lineUserId !== senderId) continue;
          await orderRef.update({
            carryOverDecision: decision === 'keep' ? 'keep' : 'declined',
            carryOverDecidedAt: Date.now(),
          });
          await replyLine(replyToken,
            decision === 'keep' ? '✅ 好的，會繼續幫你保留下次連線繼續找！' : '已收到，這項就不保留了，謝謝你的回覆 🙏',
            token);
          continue;
        }

        const text = event.message.text?.trim();
        if (!text) continue;

        // 比對「不被其他數字包夾的 5 個連續數字」，例如「後五碼 12345」「12345」
        const match = text.match(/(?<!\d)\d{5}(?!\d)/);
        if (!match) continue;

        const custSnap = await db.collection('customers').where('lineUserId', '==', senderId).limit(1).get();
        if (custSnap.empty) continue;

        const customerDoc = custSnap.docs[0];
        // 已經被後台確認收到匯款的，不要再讓任何巧合的5碼文字（電話、運單號等）把確認狀態打回去
        if (customerDoc.data().paymentConfirmed) continue;

        await customerDoc.ref.update({
          lastFiveDigits: match[0],
          paymentReportedAt: Date.now(),
          paymentConfirmed: false,
        });

        await replyLine(replyToken, `✅ 已收到您的匯款回報（後五碼 ${match[0]}）\n主購確認入帳後會再通知您 💌`, token);
      }
    } catch (e) {
      logger.error('webhook error', e);
    }
    res.status(200).send('OK');
  }
);

// ── 後台確認收到匯款 → 寫入確認狀態並推播賣貨便連結給客人 ─────────────────────
exports.confirmPaymentReceived = onCall({ secrets: [LINE_CHANNEL_ACCESS_TOKEN] }, async (request) => {
  const email = request.auth?.token?.email;
  if (!email || !ALLOWED_EMAILS.includes(email))
    throw new HttpsError('permission-denied', '只有管理員才能確認收款');

  const { customerId } = request.data || {};
  if (!customerId) throw new HttpsError('invalid-argument', '缺少 customerId');

  const customerRef = db.collection('customers').doc(customerId);
  const snap = await customerRef.get();
  if (!snap.exists) throw new HttpsError('not-found', '找不到此客人');
  const customer = snap.data();

  await customerRef.update({ paymentConfirmed: true, paymentConfirmedAt: Date.now() });

  if (customer.lineUserId) {
    const settingsSnap = await db.doc('settings/public').get();
    const settings = settingsSnap.data() || {};
    const link = settings.shopeeOrderLink
      ? `\n\n📦 賣貨便下單連結：\n${settings.shopeeOrderLink}`
      : '';
    const text = `✅ 已確認收到您的匯款，謝謝你！${link}\n\n有任何問題都可以隨時找我 💌`;
    try {
      await linePost('/v2/bot/message/push',
        { to: customer.lineUserId, messages: [{ type: 'text', text }] },
        LINE_CHANNEL_ACCESS_TOKEN.value(), false);
    } catch (e) {
      logger.error('confirmPaymentReceived push failed', e);
    }
  }

  return { success: true };
});

// ── 後台開放結帳 → 推播本場已買到清單給所有已連結 LINE 的客人 ─────────────────
exports.broadcastCheckoutOpen = onCall({ secrets: [LINE_CHANNEL_ACCESS_TOKEN] }, async (request) => {
  const email = request.auth?.token?.email;
  if (!email || !ALLOWED_EMAILS.includes(email))
    throw new HttpsError('permission-denied', '只有管理員才能推播通知');

  const token = LINE_CHANNEL_ACCESS_TOKEN.value();
  const settingsSnap = await db.doc('settings/public').get();
  const settings = settingsSnap.data() || {};
  const sessionName = settings.sessionName || '本次連線';

  const [custSnap, prodSnap, ordSnap] = await Promise.all([
    db.collection('customers').get(),
    db.collection('products').get(),
    db.collection('orders').where('isArchived', '==', false).get(),
  ]);
  const products  = new Map(prodSnap.docs.map(d => [d.id, d.data()]));
  const customers = new Map(custSnap.docs.map(d => [d.id, d.data()]));

  const byCustomer = new Map();
  for (const d of ordSnap.docs) {
    const o = d.data();
    const customer = customers.get(o.customerId);
    if (!customer?.lineUserId || customer.isStock) continue;
    if (!byCustomer.has(o.customerId)) byCustomer.set(o.customerId, []);
    byCustomer.get(o.customerId).push(o);
  }

  const lineFor = (o) => {
    const p = products.get(o.productId);
    const variantPart = o.variant ? `（${o.variant}）` : '';
    return `${p?.name ?? '商品'}${variantPart} × ${o.quantityBought || o.quantity}`;
  };
  const carryQuickReply = (orderId) => ({
    items: [
      { type: 'action', action: { type: 'postback', label: '✅ 保留', data: `carry:keep:${orderId}`, displayText: '保留到下次連線' } },
      { type: 'action', action: { type: 'postback', label: '❌ 不保留', data: `carry:drop:${orderId}`, displayText: '不保留了，謝謝' } },
    ],
  });
  const chunk = (arr, size) => { const out = []; for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size)); return out; };

  // 每位客人的推播彼此獨立，平行發送——逐個 await 在客人數一多時會把整支函式拖到逼近逾時
  const pushToCustomer = async ([customerId, orders]) => {
    const customer = customers.get(customerId);
    const bought = orders.filter(o => o.quantityBought > 0);
    const notFound = orders.filter(o => o.quantityBought === 0 && !o.carryOverDecision);
    if (bought.length === 0 && notFound.length === 0) return false;

    let summary = `【${sessionName}】結帳通知\n\n`;
    if (bought.length > 0) {
      const bank = pickBankAccountFor(customerId, customer.preferredBankId, settings.bankAccounts);
      const bankText = bank ? `${bank.label} ${bank.account}` : '請聯繫主購取得匯款帳號';
      summary += `✅ 已買到：\n${bought.map(o => `✓ ${lineFor(o)}`).join('\n')}\n\n`;
      summary += `🏦 匯款帳號：${bankText}\n\n匯款後麻煩回傳帳號後五碼給我，確認入帳後會通知你賣貨便下單連結💌`;
    } else {
      summary += `這次有些商品還沒買到，請看下面訊息確認是否保留到下次連線喔！`;
    }

    // 第一則：總結（已買到清單＋匯款資訊）
    await linePost('/v2/bot/message/push', { to: customer.lineUserId, messages: [{ type: 'text', text: summary }] }, token, false);

    // 沒買到的每一項，各自附上「保留／不保留」快速回覆按鈕（一次最多 5 則訊息，故分批送）
    for (const group of chunk(notFound, 5)) {
      const messages = group.map(o => ({
        type: 'text',
        text: `❓ 沒買到：${lineFor(o)}\n要保留到下次連線繼續幫你找嗎？`,
        quickReply: carryQuickReply(o.id),
      }));
      await linePost('/v2/bot/message/push', { to: customer.lineUserId, messages }, token, false);
    }
    return true;
  };

  const entries = Array.from(byCustomer);
  const results = await Promise.allSettled(entries.map(pushToCustomer));
  let sent = 0;
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value) sent++;
    else if (r.status === 'rejected') logger.error(`broadcast push failed for ${entries[i][0]}`, r.reason);
  });

  return { success: true, sent };
});

// ── 字串正規化 ────────────────────────────────────────────────────────────────
// 同一套邏輯也存在於 services/firebaseService.ts（前端用），Cloud Functions 是獨立的
// Node 程式碼庫沒辦法直接 import 前端模組，所以這裡留一份一樣的——改動時兩邊要一起改。
function pickBankAccountFor(customerId, preferredBankId, accounts) {
  if (!accounts || accounts.length === 0) return undefined;
  if (preferredBankId) {
    const preferred = accounts.find(a => a.id === preferredBankId);
    if (preferred) return preferred;
  }
  let hash = 0;
  for (let i = 0; i < customerId.length; i++) hash = (hash * 31 + customerId.charCodeAt(i)) >>> 0;
  return accounts[hash % accounts.length];
}

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
