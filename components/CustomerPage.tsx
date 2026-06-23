import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, where, doc, getDocs, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions, signInAnon, updateDocument, addDocument } from '../services/firebaseService';
import { Customer, Order, Product, GlobalSettings } from '../types';
import { generateId } from './live/liveUtils';
import { X, Edit2, AlertCircle, Package, Loader2, Check, Lock } from 'lucide-react';

// ── LINE Login ────────────────────────────────────────────────────────────────
const LINE_CLIENT_ID    = '2010189984';
const LINE_REDIRECT_URI = `${window.location.origin}/`;

// ── PKCE ──────────────────────────────────────────────────────────────────────
const generateVerifier = (): string => {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
};
const generateChallenge = async (verifier: string): Promise<string> => {
  const data   = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const normalizeStr = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '');
const levenshtein = (a: string, b: string): number => {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : Math.min(dp[i-1][j-1], dp[i-1][j], dp[i][j-1]) + 1;
  return dp[a.length][b.length];
};
const isValidDate = (y: string, m: string, d: string) => {
  if (!y || !m || !d) return false;
  const dt = new Date(+y, +m - 1, +d);
  return dt.getFullYear() === +y && dt.getMonth() === +m - 1 && dt.getDate() === +d;
};

// ── LINE icon SVG ─────────────────────────────────────────────────────────────
const LineIcon = ({ size = 20, color = '#06C755' }: { size?: number; color?: string }) => (
  <svg viewBox="0 0 24 24" fill={color} width={size} height={size} aria-hidden="true">
    <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.236 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
  </svg>
);

// ── GPick "G" logo block ───────────────────────────────────────────────────────
const GLogo = ({ size = 34 }: { size?: number }) => (
  <div style={{
    width: size, height: size, flexShrink: 0,
    borderRadius: Math.round(size * 0.32),
    background: 'linear-gradient(135deg,#ff9a78,#ff7d59)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: `0 6px 14px -6px rgba(255,125,89,.8)`,
  }}>
    <span style={{ fontFamily: "'Noto Serif TC', serif", fontWeight: 900, color: '#fff', fontSize: Math.round(size * 0.53), lineHeight: 1 }}>G</span>
  </div>
);

// ── Scalloped top edge ─────────────────────────────────────────────────────────
const ScallopTop = ({ color = '#ffffff', height = 12, step = 16 }: { color?: string; height?: number; step?: number }) => (
  <div style={{
    height,
    background: `radial-gradient(circle at ${step / 2}px ${height}px, ${color} ${step / 2 - 1}px, transparent ${step / 2}px) 0 0 / ${step}px ${height}px repeat-x`,
  }} />
);

// ── Order status ───────────────────────────────────────────────────────────────
type OrderStatus = 'bought' | 'partial' | 'looking' | 'not-found';
const getOrderStatus = (o: Order): OrderStatus => {
  if (o.isArchived) return o.quantityBought >= o.quantity ? 'bought' : 'not-found';
  if (o.quantityBought >= o.quantity) return 'bought';
  if (o.quantityBought > 0) return 'partial';
  return 'looking';
};
const STATUS_STYLE: Record<OrderStatus, { dot: string; bg: string; text: string; label: string }> = {
  bought:      { dot: '#7fa06b', bg: '#edf2e6', text: '#5f7d4c', label: '已買到' },
  partial:     { dot: '#c99a52', bg: '#f8efdf', text: '#b07e2f', label: '部分買到' },
  looking:     { dot: '#d3c7bc', bg: '#f4ece4', text: '#a89c94', label: '採購中' },
  'not-found': { dot: '#e0a3a3', bg: '#f7f8ff', text: '#8aa0d6', label: '待續抓' },
};

// ── Category card accent ───────────────────────────────────────────────────────
const CAT_ACCENT: Record<string, { border: string; badgeBg: string; badgeText: string }> = {
  '藥妝': { border: '#fad0e6', badgeBg: '#faebf5', badgeText: '#b04a80' },
  '零食': { border: '#f3e2a8', badgeBg: '#f8efdf', badgeText: '#b07e2f' },
  '保養': { border: '#cdd9f7', badgeBg: '#e8eefb', badgeText: '#4a6ab5' },
  '生活': { border: '#d7df9f', badgeBg: '#edf2e6', badgeText: '#5f7d4c' },
  '文具': { border: '#fad0e6', badgeBg: '#faebf5', badgeText: '#b04a80' },
};
const DEFAULT_CAT_ACCENT = { border: '#f1e7dc', badgeBg: '#f4ece4', badgeText: '#a89c94' };

// ── Types ──────────────────────────────────────────────────────────────────────
interface CustomerPageProps { token?: string; lineCallbackCode?: string; }
type LineStatus = 'idle' | 'processing' | 'needsProfile' | 'error' | 'newCustomer' | 'confirmMatch';
type PayState   = 'idle' | 'sheet' | 'done';
type ActiveTab  = 'orders' | 'products' | 'profile';
type Gender     = '男' | '女' | '不公開';

// ── Demo data ──────────────────────────────────────────────────────────────────
const DEMO_CUSTOMER: Customer = {
  id: 'demo-cust-001', lineName: 'Amy Chen ✨', communityNickname: 'Amy小姐',
  customerToken: 'demo', isBlacklisted: false, totalSpent: 12600, sessionCount: 8,
  lineUserId: 'Udemo', lineAvatarUrl: undefined,
};
const DEMO_PRODUCTS: Product[] = [
  { id: 'p1', name: 'EVE 止痛藥 (白盒)', variants: [], priceJPY: 698,  priceTWD: 250, category: '藥妝', brand: 'SS製藥',  createdAt: Date.now() },
  { id: 'p2', name: '龍角散喉糖 (抹茶)', variants: [], priceJPY: 398,  priceTWD: 140, category: '藥妝', brand: '龍角散',  createdAt: Date.now() },
  { id: 'p3', name: 'Pocky 草莓巧克力', variants: [], priceJPY: 250,  priceTWD: 85,  category: '零食', brand: 'Glico',   createdAt: Date.now() },
  { id: 'p4', name: '資生堂防曬噴霧 SPF50', variants: [], priceJPY: 1980, priceTWD: 680, category: '藥妝', brand: '資生堂', createdAt: Date.now() },
  { id: 'p5', name: 'MUJI 無印良品 護手霜', variants: [], priceJPY: 490, priceTWD: 175, category: '保養', brand: 'MUJI',  createdAt: Date.now() },
  { id: 'p6', name: 'Kit Kat 抹茶夾心',  variants: [], priceJPY: 320,  priceTWD: 110, category: '零食', brand: 'Nestlé', createdAt: Date.now() },
];
const DEMO_ORDERS: Order[] = [
  { id: 'o1', productId: 'p1', customerId: 'demo-cust-001', quantity: 2, quantityBought: 2, status: 'BOUGHT',  notificationStatus: 'NOTIFIED',   isArchived: false, timestamp: Date.now() },
  { id: 'o2', productId: 'p2', customerId: 'demo-cust-001', quantity: 3, quantityBought: 1, status: 'PENDING', notificationStatus: 'UNNOTIFIED', isArchived: false, timestamp: Date.now() },
  { id: 'o3', productId: 'p3', customerId: 'demo-cust-001', quantity: 2, quantityBought: 0, status: 'PENDING', notificationStatus: 'UNNOTIFIED', isArchived: false, timestamp: Date.now() },
  { id: 'o4', productId: 'p4', customerId: 'demo-cust-001', quantity: 1, quantityBought: 0, status: 'PENDING', notificationStatus: 'UNNOTIFIED', isArchived: false, isCarriedOver: true, sessionName: '4月京都連線', timestamp: Date.now() - 86400000 * 30 },
];
const DEMO_SETTINGS: Partial<GlobalSettings> = {
  sessionName: '5月東京連線', shippingFee: 38, freeShippingThreshold: 3000,
  pickupPayment: 20, checkoutEnabled: true, bankAccount: '國泰世華 (013) 1234-5678-9012',
};

// ── Component ─────────────────────────────────────────────────────────────────
export const CustomerPage: React.FC<CustomerPageProps> = ({ token, lineCallbackCode }) => {
  const isDemo      = token === 'demo';
  const isUniversal = !token && !isDemo;

  // ── Session helpers ──────────────────────────────────────────────────────
  const SESSION_KEY = 'gpick_customer_session';
  const saveSession = (id: string) => {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify({ customerId: id, expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 })); } catch {}
  };
  const getStoredSession = (): string | null => {
    try {
      const s = localStorage.getItem(SESSION_KEY);
      if (!s) return null;
      const { customerId, expiresAt } = JSON.parse(s);
      if (expiresAt < Date.now()) { localStorage.removeItem(SESSION_KEY); return null; }
      return customerId as string;
    } catch { return null; }
  };

  // ── State ────────────────────────────────────────────────────────────────
  const [customer,    setCustomer]    = useState<Customer | null>(isDemo ? DEMO_CUSTOMER : null);
  const [orders,      setOrders]      = useState<Order[]>(isDemo ? DEMO_ORDERS : []);
  const [products,    setProducts]    = useState<Product[]>(isDemo ? DEMO_PRODUCTS : []);
  const [settings,    setSettings]    = useState<Partial<GlobalSettings>>(isDemo ? DEMO_SETTINGS : {});
  const [isLoading,   setIsLoading]   = useState(!isDemo);
  const [error,       setError]       = useState<string | null>(null);
  const [activeTab,   setActiveTab]   = useState<ActiveTab>('orders');
  const [lineStatus,  setLineStatus]  = useState<LineStatus>('idle');
  const [lineError,   setLineError]   = useState<string | null>(null);
  const [payState,    setPayState]    = useState<PayState>('idle');
  const [pendingLineProfile, setPendingLineProfile] = useState<{ userId: string; displayName: string; pictureUrl?: string } | null>(null);
  const [matchCandidates,    setMatchCandidates]    = useState<{ id: string; lineName: string; communityNickname: string | null }[]>([]);
  // Profile setup fields
  const [setupNickname,   setSetupNickname]   = useState('');
  const [setupBirthYear,  setSetupBirthYear]  = useState('');
  const [setupBirthMonth, setSetupBirthMonth] = useState('');
  const [setupBirthDay,   setSetupBirthDay]   = useState('');
  const [setupGender,     setSetupGender]     = useState<Gender | ''>('');
  const [isSavingSetup,   setIsSavingSetup]   = useState(false);
  const [showSetupErrors, setShowSetupErrors] = useState(false);
  // Edit profile fields
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editNickname,     setEditNickname]     = useState('');
  const [editBirthYear,    setEditBirthYear]    = useState('');
  const [editBirthMonth,   setEditBirthMonth]   = useState('');
  const [editBirthDay,     setEditBirthDay]     = useState('');
  const [editGender,       setEditGender]       = useState<Gender | ''>('');
  const [isSaving,         setIsSaving]         = useState(false);
  // Products filter
  const [productFilter, setProductFilter] = useState('全部');

  // ── Step 1: anon auth → customer lookup → subscriptions ─────────────────
  useEffect(() => {
    if (isDemo) return;
    let unsubs: (() => void)[] = [];
    signInAnon().then(async (user) => {
      if (!user) { setError('無法連接，請稍後再試'); setIsLoading(false); return; }
      if (!isUniversal) {
        const unsubCust = onSnapshot(
          query(collection(db, 'customers'), where('customerToken', '==', token)),
          (snap) => {
            if (snap.empty) { setError('連結已失效或不正確'); setIsLoading(false); return; }
            setCustomer(snap.docs[0].data() as Customer);
            setIsLoading(false);
          },
          () => { setError('資料讀取失敗'); setIsLoading(false); }
        );
        unsubs.push(unsubCust);
      } else {
        const storedId = getStoredSession();
        if (storedId) {
          const snap = await getDoc(doc(db, 'customers', storedId));
          if (snap.exists()) { setCustomer(snap.data() as Customer); setIsLoading(false); return; }
          localStorage.removeItem(SESSION_KEY);
        }
        setIsLoading(false);
      }
      const unsubProd = onSnapshot(collection(db, 'products'), (snap) => {
        setProducts(snap.docs.map(d => d.data() as Product));
      });
      unsubs.push(unsubProd);
      const unsubSet = onSnapshot(doc(db, 'settings', 'public'), (snap) => {
        if (snap.exists()) setSettings(snap.data() as GlobalSettings);
      });
      unsubs.push(unsubSet);
    });
    return () => unsubs.forEach(u => u());
  }, [token, isUniversal]);

  // ── Step 2: subscribe orders ─────────────────────────────────────────────
  useEffect(() => {
    if (isDemo || !customer?.id) return;
    const unsub = onSnapshot(
      query(collection(db, 'orders'), where('customerId', '==', customer.id)),
      (snap) => setOrders(snap.docs.map(d => d.data() as Order))
    );
    return unsub;
  }, [customer?.id]);

  // ── Step 3: LINE OAuth callback ──────────────────────────────────────────
  useEffect(() => {
    if (isDemo || !lineCallbackCode) return;
    if (!isUniversal && !customer) return;

    const handleLineCallback = async () => {
      setLineStatus('processing');
      const verifier = sessionStorage.getItem('line_pkce_verifier');
      if (!verifier) {
        window.location.replace(`${window.location.pathname}${isUniversal ? '#/c' : `#/c/${token}`}`);
        return;
      }
      try {
        const [tokenRes] = await Promise.all([
          fetch('https://api.line.me/oauth2/v2.1/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              grant_type: 'authorization_code', code: lineCallbackCode,
              redirect_uri: LINE_REDIRECT_URI, client_id: LINE_CLIENT_ID, code_verifier: verifier,
            }),
          }),
          signInAnon(),
        ]);
        const tokenData = await tokenRes.json();
        if (!tokenData.access_token) throw new Error(tokenData.error_description || 'Token exchange failed');
        const profileRes = await fetch('https://api.line.me/v2/profile', {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        const profile = await profileRes.json();
        sessionStorage.removeItem('line_pkce_verifier');

        if (isUniversal) {
          const snap = await getDocs(query(collection(db, 'customers'), where('lineUserId', '==', profile.userId)));
          if (!snap.empty) {
            const found = snap.docs[0].data() as Customer;
            const updated = { ...found, lineName: profile.displayName, lineAvatarUrl: profile.pictureUrl ?? found.lineAvatarUrl };
            await updateDocument('customers', updated);
            setCustomer(updated); saveSession(updated.id);
            window.history.replaceState(null, '', `${window.location.pathname}#/c`);
            setLineStatus('idle'); return;
          }
          setPendingLineProfile({ userId: profile.userId, displayName: profile.displayName, pictureUrl: profile.pictureUrl });
          try {
            const matchFn = httpsCallable<{ displayName: string }, { candidates: { id: string; lineName: string; communityNickname: string | null }[] }>(functions, 'matchCustomerByLineName');
            const result = await matchFn({ displayName: profile.displayName });
            if (result.data.candidates.length > 0) {
              setMatchCandidates(result.data.candidates); setLineStatus('confirmMatch'); return;
            }
          } catch (e) { console.error('matchCustomerByLineName failed', e); }
          await handleAutoCreateNew({ userId: profile.userId, displayName: profile.displayName, pictureUrl: profile.pictureUrl });
          return;
        }
        // Token-based: link LINE
        const linked: Customer = { ...customer!, lineUserId: profile.userId, lineName: profile.displayName, lineAvatarUrl: profile.pictureUrl ?? undefined };
        await updateDocument('customers', linked);
        setCustomer(linked); saveSession(linked.id);
        window.history.replaceState(null, '', `${window.location.pathname}#/c/${token}`);
        setLineStatus('idle');
      } catch (err: any) {
        console.error('LINE callback failed', err);
        setLineError('LINE 登入失敗，請重試');
        setLineStatus('error');
        sessionStorage.removeItem('line_pkce_verifier');
        setTimeout(() => window.location.replace(`${window.location.pathname}${isUniversal ? '#/c' : `#/c/${token}`}`), 2500);
      }
    };
    handleLineCallback();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineCallbackCode, customer?.id]);

  // ── LINE Login ───────────────────────────────────────────────────────────
  const handleLineLogin = async () => {
    if (isDemo) {
      setLineStatus('processing');
      await new Promise(r => setTimeout(r, 800));
      setLineStatus('needsProfile');
      return;
    }
    setLineStatus('processing');
    try {
      const verifier = generateVerifier();
      const challenge = await generateChallenge(verifier);
      sessionStorage.setItem('line_pkce_verifier', verifier);
      sessionStorage.setItem('gpick_line_return', token ?? '');
      const params = new URLSearchParams({
        response_type: 'code', client_id: LINE_CLIENT_ID, redirect_uri: LINE_REDIRECT_URI,
        state: `customer_${token ?? ''}`, scope: 'profile openid',
        code_challenge: challenge, code_challenge_method: 'S256',
        nonce: generateVerifier().slice(0, 16),
      });
      window.location.href = `https://access.line.me/oauth2/v2.1/authorize?${params}`;
    } catch { setLineStatus('idle'); }
  };

  // ── Auto-create new customer ─────────────────────────────────────────────
  const handleAutoCreateNew = async (profile: { userId: string; displayName: string; pictureUrl?: string }) => {
    const newCust: Customer = {
      id: generateId(), lineName: profile.displayName, lineUserId: profile.userId,
      lineAvatarUrl: profile.pictureUrl, isBlacklisted: false, totalSpent: 0, sessionCount: 0,
    };
    await addDocument('customers', newCust);
    setCustomer(newCust); saveSession(newCust.id);
    setPendingLineProfile(null); setMatchCandidates([]);
    window.history.replaceState(null, '', `${window.location.pathname}#/c`);
    setLineStatus('idle');
  };

  // ── Profile setup (new customer flow) ────────────────────────────────────
  const setupIsValid = setupNickname.trim() !== '' && isValidDate(setupBirthYear, setupBirthMonth, setupBirthDay) && setupGender !== '';

  const handleSaveProfileSetup = async () => {
    if (!customer) return;
    if (!setupIsValid) { setShowSetupErrors(true); return; }
    setIsSavingSetup(true);
    const birthDate = `${setupBirthYear}-${setupBirthMonth.padStart(2,'0')}-${setupBirthDay.padStart(2,'0')}`;
    const updated = { ...customer, communityNickname: setupNickname.trim(), birthDate, gender: setupGender as Gender };
    if (!isDemo) await updateDocument('customers', updated);
    setCustomer(updated); setIsSavingSetup(false);
    if (isDemo) { setLineStatus('idle'); return; }
    window.location.replace(`${window.location.pathname}${isUniversal ? '#/c' : `#/c/${token}`}`);
  };

  const createNewCustomerRecord = async (birthDate: string) => {
    if (!pendingLineProfile) return;
    const newCust: Customer = {
      id: generateId(), lineName: pendingLineProfile.displayName, lineUserId: pendingLineProfile.userId,
      lineAvatarUrl: pendingLineProfile.pictureUrl, communityNickname: setupNickname.trim(),
      birthDate, gender: setupGender as Gender, totalSpent: 0, sessionCount: 0, isBlacklisted: false,
    };
    await addDocument('customers', newCust);
    setCustomer(newCust); setPendingLineProfile(null); setMatchCandidates([]);
    setIsSavingSetup(false);
    window.location.replace(`${window.location.pathname}#/c`);
  };

  const handleNewCustomerSubmit = async () => {
    if (!setupIsValid || !pendingLineProfile) { setShowSetupErrors(true); return; }
    setIsSavingSetup(true);
    const birthDate = `${setupBirthYear}-${setupBirthMonth.padStart(2,'0')}-${setupBirthDay.padStart(2,'0')}`;
    try {
      const fn = httpsCallable<{ nickname: string }, { matches: { id: string; communityNickname: string }[] }>(functions, 'findCustomerMatches');
      const result = await fn({ nickname: setupNickname.trim() });
      const cands = result.data.matches.map(m => ({ ...m, lineName: m.communityNickname }));
      if (cands.length > 0) { setMatchCandidates(cands); setIsSavingSetup(false); setLineStatus('confirmMatch'); return; }
    } catch (e) { console.error('findCustomerMatches failed', e); }
    await createNewCustomerRecord(birthDate);
  };

  const handleConfirmMatch = async (candidateId: string) => {
    if (!pendingLineProfile) return;
    setIsSavingSetup(true);
    const snap = await getDoc(doc(db, 'customers', candidateId));
    if (!snap.exists()) { setIsSavingSetup(false); return; }
    const fullCust = snap.data() as Customer;
    const updated = { ...fullCust, lineUserId: pendingLineProfile.userId, lineName: pendingLineProfile.displayName, lineAvatarUrl: pendingLineProfile.pictureUrl ?? fullCust.lineAvatarUrl };
    await updateDocument('customers', updated);
    setCustomer(updated); saveSession(updated.id);
    setPendingLineProfile(null); setMatchCandidates([]);
    setIsSavingSetup(false);
    window.history.replaceState(null, '', `${window.location.pathname}#/c`);
    setLineStatus('idle');
  };

  const handleNotMeCreateNew = async () => {
    if (!pendingLineProfile) return;
    setIsSavingSetup(true);
    await handleAutoCreateNew(pendingLineProfile);
    setIsSavingSetup(false);
  };

  // ── Payment ──────────────────────────────────────────────────────────────
  const handlePayConfirm = async () => {
    if (!customer) return;
    const updated = { ...customer, checkoutConfirmedSession: settings.sessionName ?? '' };
    setCustomer(updated);
    setPayState('done');
    if (!isDemo) await updateDocument('customers', updated);
  };

  // ── Edit profile ─────────────────────────────────────────────────────────
  const openEditProfile = () => {
    setEditNickname(customer?.communityNickname ?? '');
    setEditGender(customer?.gender ?? '');
    if (customer?.birthDate) {
      const [y, m, d] = customer.birthDate.split('-');
      setEditBirthYear(y ?? ''); setEditBirthMonth(String(parseInt(m ?? '0'))); setEditBirthDay(String(parseInt(d ?? '0')));
    } else { setEditBirthYear(''); setEditBirthMonth(''); setEditBirthDay(''); }
    setIsEditingProfile(true);
  };
  const handleSaveProfile = async () => {
    if (!customer) return;
    setIsSaving(true);
    const birthDate = (editBirthYear && editBirthMonth && editBirthDay)
      ? `${editBirthYear}-${editBirthMonth.padStart(2,'0')}-${editBirthDay.padStart(2,'0')}`
      : customer.birthDate;
    const updated = {
      ...customer,
      communityNickname: editNickname.trim() || customer.communityNickname,
      ...(birthDate ? { birthDate } : {}),
      ...(editGender ? { gender: editGender as Gender } : {}),
    };
    if (!isDemo) await updateDocument('customers', updated);
    setCustomer(updated); setIsSaving(false); setIsEditingProfile(false);
  };

  // ── Derived values ────────────────────────────────────────────────────────
  const activeOrders  = useMemo(() => orders.filter(o => !o.isArchived), [orders]);
  const currentOrders = useMemo(() => activeOrders.filter(o => !o.isCarriedOver), [activeOrders]);
  const carriedOrders = useMemo(() => activeOrders.filter(o =>  o.isCarriedOver), [activeOrders]);

  const { subtotal, remittance, isFreeShipping } = useMemo(() => {
    const shippingFee = settings.shippingFee ?? 38;
    const freeThresh  = settings.freeShippingThreshold ?? 3000;
    const pickupPay   = settings.pickupPayment ?? 20;
    const subtotal    = activeOrders.reduce((sum, o) => {
      if (!o.quantityBought) return sum;
      const p = products.find(pr => pr.id === o.productId);
      if (!p) return sum;
      const price = (o.variant && p.variantPrices?.[o.variant]) ? p.variantPrices[o.variant] : p.priceTWD;
      return sum + price * o.quantityBought;
    }, 0);
    const isFreeShipping = subtotal >= freeThresh;
    const remittance = Math.max(0, subtotal - pickupPay - (isFreeShipping ? shippingFee : 0));
    return { subtotal, remittance, isFreeShipping };
  }, [activeOrders, products, settings]);

  const boughtCount  = useMemo(() => activeOrders.filter(o => getOrderStatus(o) === 'bought').length, [activeOrders]);
  const buyingCount  = useMemo(() => activeOrders.filter(o => ['looking','partial'].includes(getOrderStatus(o))).length, [activeOrders]);
  const isLineLinked = !!customer?.lineUserId;

  const productCategories = useMemo(() => ['全部', ...new Set(products.map(p => p.category).filter(Boolean))], [products]);
  const filteredProducts  = useMemo(() => productFilter === '全部' ? products : products.filter(p => p.category === productFilter), [products, productFilter]);

  // ── Reusable input style helpers ───────────────────────────────────────────
  const inputCls = (err: boolean) =>
    `w-full border rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 bg-white transition-colors ${err ? 'border-rose-300 focus:ring-rose-200' : 'border-[#f1e7dc] focus:ring-[#ff9a78]/30'}`;
  const selectCls = (err: boolean) =>
    `border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 bg-white text-[#2c2c34] transition-colors ${err ? 'border-rose-300 focus:ring-rose-200' : 'border-[#f1e7dc] focus:ring-[#ff9a78]/30'}`;

  // ── Profile setup form (shared between needsProfile and newCustomer) ────────
  const ProfileSetupForm = ({ isNew }: { isNew: boolean }) => {
    const previewName   = isNew ? pendingLineProfile?.displayName : customer?.lineName;
    const previewAvatar = isNew ? pendingLineProfile?.pictureUrl  : customer?.lineAvatarUrl;
    const years  = Array.from({ length: 60 }, (_, i) => String(new Date().getFullYear() - 15 - i));
    const months = Array.from({ length: 12 }, (_, i) => String(i + 1));
    const days   = Array.from({ length: 31 }, (_, i) => String(i + 1));
    return (
      <div className="min-h-screen bg-[#fff9f3]">
        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg,#ff9a78,#ff7d59)', padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <GLogo size={32} />
          <div>
            <div style={{ fontFamily: "'Noto Serif TC', serif", fontWeight: 900, fontSize: 15, color: '#fff' }}>
              {isNew ? '歡迎使用 GPick！' : 'LINE 帳號已連結！'}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,.8)', marginTop: 2 }}>
              {isNew ? '第一次使用，請先填寫基本資料' : '請填寫基本資料，方便主購服務你'}
            </div>
          </div>
        </div>
        <div className="max-w-lg mx-auto px-4 py-6 pb-10 space-y-4">
          {/* Avatar card */}
          <div className="bg-white rounded-2xl p-4 flex items-center gap-3 shadow-sm" style={{ border: '1.5px solid #fad0e6' }}>
            {previewAvatar ? (
              <img src={previewAvatar} alt="" className="w-12 h-12 rounded-full object-cover ring-2 ring-[#ff7d59]" />
            ) : (
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'linear-gradient(135deg,#ff9a78,#ff7d59)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: "'Noto Serif TC', serif", fontWeight: 900, fontSize: 22, flexShrink: 0 }}>
                {previewName?.[0] ?? '?'}
              </div>
            )}
            <div>
              <p className="font-semibold text-[#2c2c34]">{previewName}</p>
              <p className="text-xs text-[#b7a89e] mt-0.5">從 LINE 帳號自動取得</p>
            </div>
          </div>
          {/* Fields */}
          <div className="bg-white rounded-2xl p-5 space-y-4 shadow-sm" style={{ border: '1.5px solid #f1e7dc' }}>
            <div>
              <label className="text-xs font-semibold text-[#a89c94] uppercase tracking-widest flex items-center gap-1 mb-1.5">社群暱稱 <span className="text-rose-400">*</span></label>
              <input type="text" className={inputCls(showSetupErrors && !setupNickname.trim())} placeholder="你在匿名社群使用的名稱" value={setupNickname} onChange={e => setSetupNickname(e.target.value)} />
              {showSetupErrors && !setupNickname.trim() && <p className="text-[11px] text-rose-400 mt-1">請填寫社群暱稱</p>}
            </div>
            <div>
              <label className="text-xs font-semibold text-[#a89c94] uppercase tracking-widest flex items-center gap-1 mb-1.5">出生年月日 <span className="text-rose-400">*</span></label>
              <div className="flex gap-2">
                {[
                  { val: setupBirthYear, set: setSetupBirthYear, w: 'flex-1', ph: '年', opts: years },
                  { val: setupBirthMonth, set: setSetupBirthMonth, w: 'w-[72px]', ph: '月', opts: months },
                  { val: setupBirthDay, set: setSetupBirthDay, w: 'w-[72px]', ph: '日', opts: days },
                ].map(({ val, set, w, ph, opts }) => (
                  <select key={ph} className={`${w} ${selectCls(showSetupErrors && !val)}`} value={val} onChange={e => set(e.target.value)}>
                    <option value="">{ph}</option>
                    {opts.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ))}
              </div>
              {showSetupErrors && (!setupBirthYear || !setupBirthMonth || !setupBirthDay) && <p className="text-[11px] text-rose-400 mt-1">請選擇完整生日</p>}
            </div>
            <div>
              <label className="text-xs font-semibold text-[#a89c94] uppercase tracking-widest flex items-center gap-1 mb-2">性別 <span className="text-rose-400">*</span></label>
              <div className="flex gap-2">
                {(['男', '女', '不公開'] as Gender[]).map(g => (
                  <button key={g} onClick={() => setSetupGender(g)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${setupGender === g ? 'text-white border-[#ff7d59]' : 'bg-white text-[#8a7e76] border-[#f1e7dc]'}`}
                    style={setupGender === g ? { background: '#ff7d59' } : {}}>
                    {g}
                  </button>
                ))}
              </div>
              {showSetupErrors && !setupGender && <p className="text-[11px] text-rose-400 mt-1">請選擇性別</p>}
            </div>
          </div>
          <button
            onClick={isNew ? handleNewCustomerSubmit : handleSaveProfileSetup}
            disabled={isSavingSetup}
            className="w-full py-3.5 text-white rounded-2xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60 shadow-lg transition-opacity"
            style={{ background: '#ff7d59', boxShadow: '0 12px 24px -10px rgba(255,125,89,.7)' }}>
            {isSavingSetup ? <><Loader2 size={16} className="animate-spin" />處理中…</> : (isNew ? '下一步' : '儲存並查看訂單')}
          </button>
          <p className="text-center text-xs text-[#c2b6aa]">GPick 代購管理系統</p>
        </div>
      </div>
    );
  };

  // ─────────────────────────── FLOW SCREENS ────────────────────────────────

  // LINE callback: processing spinner
  if (lineCallbackCode && lineStatus === 'processing') {
    return (
      <div className="min-h-screen bg-[#fff9f3] flex flex-col items-center justify-center gap-4 p-6">
        <div style={{ width: 64, height: 64, borderRadius: 20, background: 'linear-gradient(135deg,#ff9a78,#ff7d59)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 16px 32px -12px rgba(255,125,89,.7)' }}>
          <Loader2 size={26} className="text-white animate-spin" />
        </div>
        <div className="text-center">
          <p style={{ fontFamily: "'Noto Serif TC', serif", fontWeight: 700, fontSize: 18, color: '#2c2c34' }}>正在連結 LINE 帳號</p>
          <p className="text-[#a89c94] text-sm mt-1">請稍候…</p>
        </div>
      </div>
    );
  }

  // Profile setup screen
  if ((lineCallbackCode || isDemo) && (lineStatus === 'needsProfile' || lineStatus === 'newCustomer')) {
    return <ProfileSetupForm isNew={lineStatus === 'newCustomer'} />;
  }

  // Confirm match screen
  if (lineStatus === 'confirmMatch' && matchCandidates.length > 0) {
    const cand = matchCandidates[0];
    return (
      <div className="min-h-screen bg-[#fff9f3] flex flex-col items-center justify-center p-6">
        <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-sm space-y-5" style={{ border: '1.5px solid #fad0e6' }}>
          <div className="flex flex-col items-center gap-3 pb-2">
            {pendingLineProfile?.pictureUrl ? (
              <img src={pendingLineProfile.pictureUrl} alt="" className="w-14 h-14 rounded-full object-cover" style={{ boxShadow: '0 8px 20px -8px rgba(255,125,89,.5)' }} />
            ) : (
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg,#ff9a78,#ff7d59)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: "'Noto Serif TC', serif", fontWeight: 900, fontSize: 24 }}>
                {pendingLineProfile?.displayName?.[0] ?? '?'}
              </div>
            )}
            <div className="text-center">
              <p style={{ fontFamily: "'Noto Serif TC', serif", fontWeight: 900, fontSize: 17, color: '#2c2c34' }}>{pendingLineProfile?.displayName}</p>
              <p className="text-xs text-[#b7a89e] mt-0.5">你的 LINE 帳號</p>
            </div>
          </div>
          <div style={{ borderTop: '1px solid #f4ece4', paddingTop: 16 }}>
            <p className="text-sm font-semibold text-[#2c2c34] mb-1">找到一筆資料，請確認是否為你？</p>
            <p className="text-xs text-[#8a7e76] mb-3 leading-relaxed">系統找到名稱相似的訂單記錄，確認後訂單將自動連結。</p>
            <div className="rounded-xl p-4 space-y-2" style={{ background: '#fff8f5', border: '1px solid #f1e7dc' }}>
              <div className="flex justify-between items-center text-sm">
                <span className="text-[#b7a89e]">LINE 名稱</span>
                <span className="font-semibold text-[#2c2c34]">{cand.lineName}</span>
              </div>
              {cand.communityNickname && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-[#b7a89e]">社群暱稱</span>
                  <span className="font-semibold text-[#2c2c34]">{cand.communityNickname}</span>
                </div>
              )}
            </div>
          </div>
          <div className="space-y-2.5 pt-1">
            <button onClick={() => handleConfirmMatch(cand.id)} disabled={isSavingSetup}
              className="w-full py-3.5 text-white font-bold rounded-2xl flex items-center justify-center gap-2 disabled:opacity-60 transition-opacity"
              style={{ background: '#ff7d59', boxShadow: '0 12px 24px -10px rgba(255,125,89,.7)' }}>
              {isSavingSetup ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              是我，確認登入
            </button>
            <button onClick={handleNotMeCreateNew} disabled={isSavingSetup}
              className="w-full py-3 rounded-2xl font-medium text-sm text-[#8a7e76] disabled:opacity-60 transition-opacity"
              style={{ background: '#f4ece4' }}>
              不是我，建立新帳號
            </button>
          </div>
        </div>
        <p className="text-xs text-[#c2b6aa] mt-6">GPick 代購管理系統</p>
      </div>
    );
  }

  // Loading
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#fff9f3] flex flex-col items-center justify-center gap-3">
        <div style={{ animation: 'pulse 1.4s ease-in-out infinite' }}><GLogo size={48} /></div>
        <p className="text-[#a89c94] text-sm">載入中…</p>
        <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }`}</style>
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className="min-h-screen bg-[#fff9f3] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 text-center max-w-sm w-full shadow-lg" style={{ border: '1.5px solid #fad0e6' }}>
          <div className="w-14 h-14 bg-rose-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="text-rose-400" size={24} />
          </div>
          <h2 style={{ fontFamily: "'Noto Serif TC', serif", fontWeight: 900, fontSize: 18, color: '#2c2c34', marginBottom: 8 }}>連結無效</h2>
          <p className="text-[#8a7e76] text-sm leading-relaxed">{error}</p>
        </div>
      </div>
    );
  }

  // Universal login wall
  const showUniversalWall = isUniversal && !customer;
  if (showUniversalWall) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: '#fff9f3' }}>
        {/* Header */}
        <div className="bg-white px-5 py-4 flex items-center gap-2.5" style={{ borderBottom: '1px solid #f1e7dc' }}>
          <GLogo size={30} />
          <span style={{ fontFamily: "'Noto Serif TC', serif", fontWeight: 900, fontSize: 17, color: '#2c2c34' }}>GPick</span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-6 pb-10">
          <h2 style={{ fontFamily: "'Noto Serif TC', serif", fontWeight: 900, fontSize: 28, color: '#2c2c34', textAlign: 'center', marginBottom: 10 }}>歡迎使用 GPick</h2>
          <p className="text-sm text-[#a89c94] text-center leading-relaxed mb-8 max-w-xs">
            日本代購專屬平台，讓你隨時掌握<br />訂單進度、瀏覽商品清單。
          </p>
          {lineStatus === 'error' && lineError && (
            <p className="text-xs text-rose-500 bg-rose-50 px-4 py-2 rounded-xl mb-4">{lineError}</p>
          )}
          <button onClick={handleLineLogin} disabled={lineStatus === 'processing'}
            className="w-full max-w-xs py-4 text-white rounded-2xl text-base font-bold flex items-center justify-center gap-2.5 disabled:opacity-60 active:scale-95 transition-transform"
            style={{ background: '#06C755', boxShadow: '0 12px 28px -10px rgba(6,199,85,.5)' }}>
            {lineStatus === 'processing' ? <><Loader2 size={18} className="animate-spin" />請稍候…</> : <><LineIcon size={22} color="white" />使用 LINE 登入</>}
          </button>
          <p className="text-xs text-[#c2b6aa] mt-5">登入即表示同意 GPick 服務條款</p>
        </div>
      </div>
    );
  }

  // Token-based LINE link wall
  const showTokenWall = !isUniversal && !!customer && !isLineLinked && !isDemo;
  if (showTokenWall) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: '#fff9f3' }}>
        <div className="px-5 py-4 flex items-center gap-3" style={{ background: 'linear-gradient(135deg,#ff9a78,#ff7d59)' }}>
          <GLogo size={32} />
          <div>
            <div style={{ fontFamily: "'Noto Serif TC', serif", fontWeight: 900, fontSize: 15, color: '#fff' }}>GPick 訂單查詢</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,.8)', marginTop: 2 }}>{settings.sessionName || '本次連線'}</div>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-6">
          <div className="w-20 h-20 rounded-3xl flex items-center justify-center" style={{ background: 'rgba(6,199,85,.1)' }}>
            <LineIcon size={40} />
          </div>
          <div>
            <h2 style={{ fontFamily: "'Noto Serif TC', serif", fontWeight: 900, fontSize: 22, color: '#2c2c34', marginBottom: 8 }}>先連結 LINE 帳號</h2>
            <p className="text-sm text-[#8a7e76] leading-relaxed max-w-xs">連結後才能查看訂單狀態和匯款金額。<br />只需要授權一次，下次直接開啟。</p>
          </div>
          {lineStatus === 'error' && lineError && (
            <p className="text-xs text-rose-500 bg-rose-50 px-4 py-2 rounded-xl">{lineError}</p>
          )}
          <button onClick={handleLineLogin} disabled={lineStatus === 'processing'}
            className="w-full max-w-xs py-3.5 text-white rounded-2xl text-base font-bold flex items-center justify-center gap-2.5 disabled:opacity-60"
            style={{ background: '#06C755', boxShadow: '0 12px 28px -10px rgba(6,199,85,.5)' }}>
            {lineStatus === 'processing' ? <><Loader2 size={18} className="animate-spin" />連結中…</> : <><LineIcon size={20} color="white" />使用 LINE 登入</>}
          </button>
          <p className="text-xs text-[#c2b6aa]">GPick 代購管理系統</p>
        </div>
      </div>
    );
  }

  // ─────────────────────────── ORDER ROW ───────────────────────────────────
  const renderOrderRow = (order: Order, isCarried = false) => {
    const product = products.find(p => p.id === order.productId);
    if (!product) return null;
    const st    = getOrderStatus(order);
    const style = STATUS_STYLE[st];
    const price = (order.variant && product.variantPrices?.[order.variant]) ? product.variantPrices[order.variant] : product.priceTWD;
    const total = price * (order.quantityBought || 0);

    if (isCarried) {
      return (
        <div key={order.id} style={{ background: '#f7f8ff', border: '1.5px dashed #c8d6f5', borderRadius: 18, padding: '14px 17px', display: 'flex', alignItems: 'center', gap: 13 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: style.dot, flexShrink: 0, display: 'inline-block' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#8a7e76' }}>{product.name}</div>
            <div style={{ fontSize: 11.5, color: '#c2b6aa', marginTop: 3 }}>尚未買到・將續抓下場</div>
          </div>
          <span style={{ display: 'inline-block', background: '#fff', color: '#8aa0d6', fontSize: 10.5, fontWeight: 700, padding: '3px 10px', borderRadius: 20, border: '1px solid #d6e0f7', fontFamily: "'Quicksand', sans-serif" }}>待續抓</span>
        </div>
      );
    }

    return (
      <div key={order.id} style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 13, borderBottom: '1px solid #f4ece4' }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: style.dot, flexShrink: 0, display: 'inline-block' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#2c2c34' }}>
            {product.name}
            {order.variant && <span style={{ fontWeight: 400, color: '#b7a89e', fontSize: 12, marginLeft: 4 }}>{order.variant}</span>}
          </div>
          <div style={{ fontSize: 11.5, color: '#b7a89e', marginTop: 3 }}>
            喊 {order.quantity} 件{order.quantityBought > 0 ? ` ・ 買到 ${order.quantityBought}` : ' ・ 採購中'}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <span style={{ display: 'inline-block', background: style.bg, color: style.text, fontSize: 10.5, fontWeight: 700, padding: '3px 10px', borderRadius: 20, fontFamily: "'Quicksand', sans-serif" }}>{style.label}</span>
          <div style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 14, fontWeight: 700, color: order.quantityBought > 0 ? '#2c2c34' : '#d3c7bc', marginTop: 6 }}>
            {order.quantityBought > 0 ? `$${total}` : '—'}
          </div>
        </div>
      </div>
    );
  };

  // ─────────────────────────── NAV ITEMS ───────────────────────────────────
  const navItems = [
    {
      id: 'orders' as ActiveTab, label: '訂單',
      icon: (active: boolean) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#ff7d59' : '#8c857d'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v17l-2.5-1.5L14 21l-2-1.5L10 21l-2.5-1.5L5 21z"/>
          <line x1="9" y1="8" x2="15" y2="8"/><line x1="9" y1="12" x2="15" y2="12"/>
        </svg>
      ),
    },
    {
      id: 'products' as ActiveTab, label: '商品',
      icon: (active: boolean) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#ff7d59' : '#8c857d'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8h12l-1 12a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1z"/>
          <path d="M9 8V6a3 3 0 0 1 6 0v2"/>
        </svg>
      ),
    },
    {
      id: 'profile' as ActiveTab, label: '我的',
      icon: (active: boolean) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#ff7d59' : '#8c857d'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="4"/>
          <path d="M5 21a7 7 0 0 1 14 0"/>
        </svg>
      ),
    },
  ];

  // ─────────────────────────── MAIN APP ────────────────────────────────────
  return (
    <div className="min-h-screen flex" style={{ background: '#fff9f3' }}>

      {/* ── Desktop Sidebar ── */}
      <aside className="hidden md:flex flex-col shrink-0 bg-white h-screen sticky top-0 overflow-y-auto" style={{ width: 236, borderRight: '1px solid #f1e7dc' }}>
        {/* Logo */}
        <div style={{ padding: '22px 18px 0', display: 'flex', alignItems: 'center', gap: 9 }}>
          <GLogo size={34} />
          <span style={{ fontFamily: "'Noto Serif TC', serif", fontWeight: 900, fontSize: 20, color: '#2c2c34' }}>GPick</span>
        </div>

        {/* Session card */}
        {settings.sessionName && (
          <div style={{ margin: '18px 14px 0', background: '#fff0ea', border: '1.5px solid #ffd5c5', borderRadius: 14, padding: '12px 14px' }}>
            <div style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 10, color: '#e08163', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>當前連線</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#2c2c34', marginTop: 4 }}>{settings.sessionName}</div>
            <div style={{ fontSize: 11, color: '#b7a89e', marginTop: 2, fontFamily: "'Quicksand', sans-serif" }}>進行中</div>
          </div>
        )}

        {/* Nav */}
        <nav style={{ marginTop: 18, padding: '0 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {navItems.map(({ id, label, icon }) => {
            const active = activeTab === id;
            return (
              <button key={id} onClick={() => setActiveTab(id)}
                style={{ border: 'none', cursor: 'pointer', background: active ? '#fff0ea' : 'transparent', borderRadius: 13, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', transition: 'background .15s' }}>
                {icon(active)}
                <span style={{ fontSize: 14, fontWeight: 700, color: active ? '#ff7d59' : '#8c857d' }}>{['我的訂單','本場商品','我的資料'][['orders','products','profile'].indexOf(id)]}</span>
              </button>
            );
          })}
        </nav>

        {/* User profile at bottom */}
        <div style={{ marginTop: 'auto', borderTop: '1px solid #f1e7dc', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
          {customer?.lineAvatarUrl ? (
            <img src={customer.lineAvatarUrl} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
          ) : (
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,#ff9a78,#ff7d59)', color: '#fff', fontFamily: "'Noto Serif TC', serif", fontWeight: 900, fontSize: 17, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {(customer?.communityNickname || customer?.lineName || '?')[0]}
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#2c2c34', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{customer?.communityNickname || customer?.lineName}</div>
            {isLineLinked && <div style={{ fontSize: 11, color: '#9aab4e', fontFamily: "'Quicksand', sans-serif", fontWeight: 600, marginTop: 2 }}>● LINE 已連結</div>}
          </div>
        </div>
      </aside>

      {/* ── Content area ── */}
      <div className="flex-1 flex flex-col min-h-screen min-w-0">

        {/* Mobile header */}
        <header className="md:hidden bg-white sticky top-0 z-10 flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid #f1e7dc' }}>
          <GLogo size={28} />
          <span style={{ fontFamily: "'Noto Serif TC', serif", fontWeight: 900, fontSize: 16, color: '#2c2c34' }}>GPick</span>
          {settings.sessionName && (
            <span style={{ marginLeft: 'auto', background: '#fff0ea', color: '#f26240', fontSize: 11.5, fontWeight: 700, padding: '4px 12px', borderRadius: 30, fontFamily: "'Quicksand', sans-serif", whiteSpace: 'nowrap' }}>
              {settings.sessionName}
            </span>
          )}
        </header>

        {/* Tab content */}
        <main className="flex-1 overflow-y-auto pb-24 md:pb-6">

          {/* ─── ORDERS TAB ─── */}
          {activeTab === 'orders' && (
            <div className="max-w-2xl mx-auto px-4 md:px-8 py-5 md:py-8 space-y-4">
              {/* Page header */}
              <div className="flex items-end justify-between">
                <div>
                  <h1 style={{ fontFamily: "'Noto Serif TC', serif", fontWeight: 900, fontSize: 28, color: '#2c2c34', letterSpacing: -0.3 }}>本場訂單</h1>
                  <p style={{ fontSize: 13.5, color: '#a89c94', marginTop: 5 }}>
                    嗨 {customer?.communityNickname || customer?.lineName}，你本場的採購進度都在這裡
                  </p>
                </div>
                {/* Desktop stat pills */}
                <div className="hidden md:flex gap-3">
                  <div style={{ background: '#fff', border: '1.5px solid #d7df9f', borderRadius: 14, padding: '10px 18px', textAlign: 'center', minWidth: 88 }}>
                    <div style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 22, fontWeight: 700, color: '#8a9a3e', lineHeight: 1 }}>{boughtCount}</div>
                    <div style={{ fontSize: 11, color: '#8a7e76', marginTop: 4 }}>已買到</div>
                  </div>
                  <div style={{ background: '#fff', border: '1.5px solid #ffc9b3', borderRadius: 14, padding: '10px 18px', textAlign: 'center', minWidth: 88 }}>
                    <div style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 22, fontWeight: 700, color: '#ff7d59', lineHeight: 1 }}>{buyingCount}</div>
                    <div style={{ fontSize: 11, color: '#8a7e76', marginTop: 4 }}>採購中</div>
                  </div>
                </div>
              </div>

              {/* Mobile stat pills */}
              <div className="flex gap-3 md:hidden">
                <div style={{ flex: 1, background: '#fff', border: '1.5px solid #d7df9f', borderRadius: 18, padding: '14px 17px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#9aab4e', display: 'inline-block' }} />
                    <span style={{ fontSize: 12.5, color: '#8a7e76' }}>已買到</span>
                  </div>
                  <span style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 24, fontWeight: 700, color: '#8a9a3e', lineHeight: 1 }}>{boughtCount}</span>
                </div>
                <div style={{ flex: 1, background: '#fff', border: '1.5px solid #ffc9b3', borderRadius: 18, padding: '14px 17px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff7d59', display: 'inline-block' }} />
                    <span style={{ fontSize: 12.5, color: '#8a7e76' }}>採購中</span>
                  </div>
                  <span style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 24, fontWeight: 700, color: '#ff7d59', lineHeight: 1 }}>{buyingCount}</span>
                </div>
              </div>

              {/* Order list */}
              <div className="md:flex md:gap-6 md:items-start">
                <div className="md:flex-1 md:min-w-0">
                  <div style={{ background: '#fff', border: '1.5px solid #fad0e6', borderRadius: 22, overflow: 'hidden', boxShadow: '0 6px 18px -16px rgba(150,90,60,.18)' }}>
                    {activeOrders.length === 0 ? (
                      <div className="py-12 text-center">
                        <Package className="w-8 h-8 mx-auto mb-2" style={{ color: '#f1e7dc' }} />
                        <p style={{ color: '#c2b6aa', fontSize: 14 }}>本場尚無訂單記錄</p>
                      </div>
                    ) : (
                      <>
                        {currentOrders.map(o => renderOrderRow(o))}
                        {/* Remove bottom border from last row */}
                        {carriedOrders.length > 0 && (
                          <div style={{ padding: '0 18px' }}>
                            <div style={{ fontSize: 10.5, color: '#c2b6aa', margin: '14px 0 7px', fontFamily: "'Quicksand', sans-serif", letterSpacing: 0.5, fontWeight: 600 }}>延續自上一場</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 16 }}>
                              {carriedOrders.map(o => renderOrderRow(o, true))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Checkout card */}
                {subtotal > 0 && (
                  <div className="mt-4 md:mt-0 md:w-[340px] md:flex-none md:sticky md:top-4">
                    <div style={{ filter: 'drop-shadow(0 12px 28px rgba(150,90,60,.22))' }}>
                      <ScallopTop height={13} step={18} />
                      <div style={{ background: '#fff', borderRadius: '0 0 24px 24px', padding: '8px 20px 22px', marginTop: -1 }}>
                        <h3 style={{ fontFamily: "'Noto Serif TC', serif", fontWeight: 900, fontSize: 18, color: '#2c2c34', paddingTop: 8, marginBottom: 16 }}>結帳明細</h3>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, color: '#a89c94', marginBottom: 10 }}>
                          <span>商品小計</span>
                          <span style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, color: '#6e6660' }}>${subtotal}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, color: '#a89c94', marginBottom: 10 }}>
                          <span>預扣賣貨便最低支付</span>
                          <span style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, color: '#6e6660' }}>－ ${settings.pickupPayment ?? 20}</span>
                        </div>
                        {isFreeShipping && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, color: '#7fa06b', marginBottom: 10 }}>
                            <span>滿額免運折抵</span>
                            <span style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700 }}>－ ${settings.shippingFee ?? 38}</span>
                          </div>
                        )}
                        <div style={{ borderTop: '1px solid #f4ece4', margin: '14px 0' }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontFamily: "'Noto Serif TC', serif", fontSize: 15, color: '#6e6660', fontWeight: 700 }}>需匯款</span>
                          <span style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 20, fontWeight: 700, color: '#2c2c34', lineHeight: 1 }}>${remittance}</span>
                        </div>
                        {!isFreeShipping && (
                          <div style={{ marginTop: 14, background: '#edf2e6', borderRadius: 12, padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 15 }}>🚚</span>
                            <p style={{ fontSize: 12.5, color: '#5f7d4c', fontWeight: 700, lineHeight: 1.4 }}>
                              再買 <span style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 14 }}>NT$ {(settings.freeShippingThreshold ?? 3000) - subtotal}</span> 可享免運
                            </p>
                          </div>
                        )}
                        {settings.checkoutEnabled ? (
                          <button onClick={() => setPayState('sheet')}
                            className="w-full mt-4 py-4 text-white text-base font-bold rounded-[30px] active:scale-99 transition-transform"
                            style={{ background: '#ff7d59', border: 'none', cursor: 'pointer', fontFamily: "'Quicksand', sans-serif", boxShadow: '0 12px 24px -10px rgba(255,125,89,.8)' }}>
                            前往匯款
                          </button>
                        ) : (
                          <div style={{ marginTop: 16, background: '#f4ece4', borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                            <Lock size={14} style={{ color: '#b7a89e', flexShrink: 0 }} />
                            <p style={{ fontSize: 12, color: '#a89c94', lineHeight: 1.5 }}>結帳功能尚未開放，主購回國後將通知</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <p style={{ textAlign: 'center', fontSize: 11, color: '#c2b6aa', paddingBottom: 8 }}>GPick 代購管理系統</p>
            </div>
          )}

          {/* ─── PRODUCTS TAB ─── */}
          {activeTab === 'products' && (
            <div className="max-w-2xl mx-auto px-4 md:px-8 py-5 md:py-8">
              <h1 style={{ fontFamily: "'Noto Serif TC', serif", fontWeight: 900, fontSize: 28, color: '#2c2c34', letterSpacing: -0.3 }}>本場商品</h1>
              <p style={{ fontSize: 13.5, color: '#a89c94', marginTop: 5, marginBottom: 18 }}>看看主購這次帶了什麼</p>

              {/* Category filter */}
              <div className="flex gap-2 mb-4 overflow-x-auto pb-1 scrollbar-hide">
                {productCategories.map(cat => (
                  <button key={cat} onClick={() => setProductFilter(cat)}
                    className="shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all"
                    style={{ background: productFilter === cat ? '#2c2c34' : '#fff', color: productFilter === cat ? '#fff' : '#8a7e76', border: productFilter === cat ? 'none' : '1px solid #f1e7dc' }}>
                    {cat}
                  </button>
                ))}
              </div>

              {filteredProducts.length === 0 ? (
                <div className="text-center py-16">
                  <Package style={{ color: '#f1e7dc', margin: '0 auto 10px' }} size={36} />
                  <p style={{ color: '#c2b6aa', fontSize: 14 }}>此分類暫無商品</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }} className="md:grid-cols-3 lg:grid-cols-4">
                  {filteredProducts.map(product => {
                    const accent = CAT_ACCENT[product.category] ?? DEFAULT_CAT_ACCENT;
                    return (
                      <div key={product.id} style={{ background: '#fff', border: `1.5px solid ${accent.border}`, borderRadius: 20, overflow: 'hidden', boxShadow: '0 6px 16px -16px rgba(150,90,60,.2)' }}>
                        {product.imageUrl ? (
                          <img src={product.imageUrl} alt={product.name} style={{ width: '100%', height: 100, objectFit: 'cover' }} />
                        ) : (
                          <div style={{ height: 100, background: 'repeating-linear-gradient(45deg,#f6ece2,#f6ece2 8px,#f1e4d6 8px,#f1e4d6 16px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Package size={22} style={{ color: '#d4b9a2', opacity: 0.6 }} />
                          </div>
                        )}
                        <div style={{ padding: '12px 13px' }}>
                          <span style={{ background: accent.badgeBg, color: accent.badgeText, fontSize: 9.5, fontWeight: 700, padding: '2px 8px', borderRadius: 20, fontFamily: "'Quicksand', sans-serif" }}>{product.category}</span>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#2c2c34', marginTop: 8, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }}>{product.name}</div>
                          {product.brand && <div style={{ fontSize: 11, color: '#b7a89e', marginTop: 2 }}>{product.brand}</div>}
                          <div style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 17, color: '#ff7d59', marginTop: 6 }}>${product.priceTWD}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <p style={{ textAlign: 'center', fontSize: 11, color: '#c2b6aa', marginTop: 20, paddingBottom: 8 }}>GPick 代購管理系統</p>
            </div>
          )}

          {/* ─── PROFILE TAB ─── */}
          {activeTab === 'profile' && (
            <div className="max-w-lg mx-auto px-4 md:px-8 py-5 md:py-8 space-y-3">
              <h1 style={{ fontFamily: "'Noto Serif TC', serif", fontWeight: 900, fontSize: 28, color: '#2c2c34', letterSpacing: -0.3, marginBottom: 18 }}>我的</h1>

              {/* Avatar card */}
              <div style={{ background: '#fff', border: '1.5px solid #fad0e6', borderRadius: 24, padding: '26px', display: 'flex', alignItems: 'center', gap: 18, boxShadow: '0 8px 22px -16px rgba(150,90,60,.2)' }}>
                {customer?.lineAvatarUrl ? (
                  <img src={customer.lineAvatarUrl} alt="" style={{ width: 70, height: 70, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, boxShadow: '0 10px 20px -8px rgba(255,125,89,.5)' }} />
                ) : (
                  <div style={{ width: 70, height: 70, borderRadius: '50%', background: 'linear-gradient(135deg,#ff9a78,#ff7d59)', color: '#fff', fontFamily: "'Noto Serif TC', serif", fontWeight: 900, fontSize: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 10px 20px -8px rgba(255,125,89,.7)' }}>
                    {(customer?.communityNickname || customer?.lineName || '?')[0]}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "'Noto Serif TC', serif", fontWeight: 900, fontSize: 20, color: '#2c2c34' }}>{customer?.communityNickname || customer?.lineName}</div>
                  {customer?.communityNickname && customer?.lineName !== customer?.communityNickname && (
                    <div style={{ fontSize: 12, color: '#b7a89e', marginTop: 3 }}>LINE：{customer.lineName}</div>
                  )}
                </div>
              </div>

              {/* LINE linked badge */}
              {isLineLinked && (
                <div style={{ background: '#06c755', borderRadius: 18, padding: '15px 18px', display: 'flex', alignItems: 'center', gap: 11, color: '#fff', boxShadow: '0 10px 22px -14px rgba(6,199,85,.8)' }}>
                  <LineIcon size={20} color="#fff" />
                  <span style={{ fontSize: 13.5, fontWeight: 700, fontFamily: "'Quicksand', sans-serif" }}>LINE 帳號已連結</span>
                </div>
              )}

              {/* Personal info */}
              <div style={{ background: '#fff', borderRadius: 22, overflow: 'hidden', border: '1px solid #f1e7dc' }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1e7dc', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#c2b6aa', textTransform: 'uppercase', letterSpacing: 2, fontFamily: "'Quicksand', sans-serif" }}>個人資料</span>
                  <button onClick={openEditProfile} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ff7d59', fontSize: 13, fontWeight: 700 }}>編輯</button>
                </div>
                {[
                  { label: '社群暱稱', value: customer?.communityNickname || '—' },
                  { label: '生日', value: customer?.birthDate ? (() => { const [y,m,d] = customer.birthDate!.split('-'); return `${y} 年 ${parseInt(m)} 月 ${parseInt(d)} 日`; })() : '—' },
                  { label: '性別', value: customer?.gender || '—' },
                ].map(({ label, value }) => (
                  <div key={label} style={{ padding: '14px 20px', borderBottom: '1px solid #f9f3ee', display: 'flex', gap: 12, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#b7a89e', width: 64, flexShrink: 0 }}>{label}</span>
                    <span style={{ fontSize: 14, color: '#2c2c34' }}>{value}</span>
                  </div>
                ))}
              </div>

              {/* LINE link (if not linked) */}
              {!isLineLinked && (
                <div style={{ background: '#fff', borderRadius: 22, overflow: 'hidden', border: '1px solid #f1e7dc' }}>
                  <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1e7dc' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#c2b6aa', textTransform: 'uppercase', letterSpacing: 2, fontFamily: "'Quicksand', sans-serif" }}>帳號連結</span>
                  </div>
                  <div style={{ padding: '16px 20px' }}>
                    <p style={{ fontSize: 12, color: '#8a7e76', marginBottom: 12, lineHeight: 1.6 }}>連結 LINE 帳號後，下次開啟頁面將自動識別身份。</p>
                    <button onClick={handleLineLogin} disabled={lineStatus === 'processing'}
                      className="w-full py-3 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60"
                      style={{ background: '#06C755', border: 'none', cursor: 'pointer' }}>
                      {lineStatus === 'processing' ? <><Loader2 size={15} className="animate-spin" />連結中…</> : <><LineIcon size={16} color="white" />連結 LINE 帳號</>}
                    </button>
                  </div>
                </div>
              )}

              <p style={{ textAlign: 'center', fontSize: 11, color: '#c2b6aa', paddingBottom: 8 }}>GPick 代購管理系統</p>
            </div>
          )}
        </main>

        {/* ── Mobile scalloped bottom nav ── */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-20">
          <ScallopTop height={12} step={16} />
          <div style={{ background: '#ffffff', display: 'flex', alignItems: 'stretch', padding: '7px 4px 18px' }}>
            {navItems.map(({ id, label, icon }) => {
              const active = activeTab === id;
              return (
                <button key={id} onClick={() => setActiveTab(id)}
                  style={{ flex: 1, border: 'none', background: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '2px 0' }}>
                  {icon(active)}
                  <span style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 11, color: active ? '#ff7d59' : '#8c857d' }}>{label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>

      {/* ── Payment bottom sheet ── */}
      {payState === 'sheet' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,44,52,.42)', display: 'flex', alignItems: 'flex-end', zIndex: 50 }} onClick={() => setPayState('idle')}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#fff9f3', borderRadius: '32px 32px 0 0', padding: '22px 22px 36px', width: '100%', maxWidth: 520, margin: '0 auto', boxShadow: '0 -20px 50px -20px rgba(44,44,52,.4)' }}>
            <div style={{ width: 44, height: 5, borderRadius: 5, background: '#ead9cf', margin: '0 auto 20px' }} />
            <h3 style={{ fontFamily: "'Noto Serif TC', serif", fontWeight: 900, fontSize: 22, color: '#2c2c34' }}>匯款資訊</h3>
            <p style={{ fontSize: 13, color: '#a89c94', marginTop: 6 }}>請於 24 小時內完成匯款</p>
            <div style={{ background: '#fff', borderRadius: 20, padding: 19, marginTop: 18, boxShadow: '0 8px 24px -16px rgba(150,90,60,.3)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: '#a89c94' }}>應匯金額</span>
                <span style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 28, color: '#ff7d59' }}>${remittance}</span>
              </div>
              <div style={{ borderTop: '1px solid #f4ece4', margin: '14px 0' }} />
              <div style={{ fontSize: 11, color: '#b7a89e' }}>銀行帳號</div>
              <div style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 15, color: '#2c2c34', marginTop: 4 }}>
                {settings.bankAccount || '請聯繫主購取得匯款帳號'}
              </div>
            </div>
            <button onClick={handlePayConfirm}
              className="w-full py-4 text-white text-base font-bold rounded-[30px] mt-5 active:scale-99 transition-transform"
              style={{ background: '#ff7d59', border: 'none', cursor: 'pointer', fontFamily: "'Quicksand', sans-serif", boxShadow: '0 12px 24px -10px rgba(255,125,89,.8)' }}>
              我已完成匯款
            </button>
          </div>
        </div>
      )}

      {/* ── Payment done ── */}
      {payState === 'done' && (
        <div style={{ position: 'fixed', inset: 0, background: '#fff9f3', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 42, textAlign: 'center', zIndex: 50 }}>
          <div style={{ width: 94, height: 94, borderRadius: '50%', background: 'linear-gradient(135deg,#94b27e,#7fa06b)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 16px 34px -14px rgba(127,160,107,.9)' }}>
            <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 13l4 4L19 7"/>
            </svg>
          </div>
          <h3 style={{ fontFamily: "'Noto Serif TC', serif", fontWeight: 900, fontSize: 24, color: '#2c2c34', marginTop: 24 }}>已通知主購！</h3>
          <p style={{ fontSize: 14, color: '#a89c94', marginTop: 10, lineHeight: 1.8 }}>收到匯款後主購會幫你確認入帳，<br />感謝你的支持</p>
          <button onClick={() => { setPayState('idle'); setActiveTab('orders'); }}
            style={{ marginTop: 26, background: '#fff', border: '1px solid #ecd9cf', borderRadius: 30, padding: '12px 28px', fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 14, color: '#2c2c34', cursor: 'pointer', boxShadow: '0 8px 18px -12px rgba(150,90,60,.4)' }}>
            返回訂單
          </button>
        </div>
      )}

      {/* ── Edit profile modal ── */}
      {isEditingProfile && (() => {
        const years  = Array.from({ length: 60 }, (_, i) => String(new Date().getFullYear() - 15 - i));
        const months = Array.from({ length: 12 }, (_, i) => String(i + 1));
        const days   = Array.from({ length: 31 }, (_, i) => String(i + 1));
        return (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4 max-h-[90vh] overflow-y-auto" style={{ border: '1px solid #f1e7dc' }}>
              <div className="flex justify-between items-center">
                <h3 style={{ fontFamily: "'Noto Serif TC', serif", fontWeight: 900, fontSize: 18, color: '#2c2c34' }}>編輯個人資料</h3>
                <button onClick={() => setIsEditingProfile(false)} className="p-1.5 rounded-lg transition-colors hover:bg-[#f4ece4]" style={{ color: '#b7a89e', border: 'none', cursor: 'pointer', background: 'none' }}>
                  <X size={18} />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-[#a89c94] uppercase tracking-widest block mb-1.5">LINE 名稱</label>
                  <div style={{ background: '#f9f4ee', border: '1px solid #f1e7dc', borderRadius: 12, padding: '10px 16px', fontSize: 14, color: '#a89c94' }}>{customer?.lineName || '—'}</div>
                  <p className="text-[10px] text-[#c2b6aa] mt-1">自動同步你在 LINE 的顯示名稱</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#a89c94] uppercase tracking-widest block mb-1.5">社群暱稱</label>
                  <input type="text" className={inputCls(false)} placeholder="你在匿名社群的名稱" value={editNickname} onChange={e => setEditNickname(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#a89c94] uppercase tracking-widest block mb-1.5">生日</label>
                  <div className="flex gap-2">
                    {[
                      { val: editBirthYear, set: setEditBirthYear, w: 'flex-1', ph: '年', opts: years },
                      { val: editBirthMonth, set: setEditBirthMonth, w: 'w-[68px]', ph: '月', opts: months },
                      { val: editBirthDay, set: setEditBirthDay, w: 'w-[68px]', ph: '日', opts: days },
                    ].map(({ val, set, w, ph, opts }) => (
                      <select key={ph} className={`${w} ${selectCls(false)}`} value={val} onChange={e => set(e.target.value)}>
                        <option value="">{ph}</option>
                        {opts.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#a89c94] uppercase tracking-widest block mb-2">性別</label>
                  <div className="flex gap-2">
                    {(['男', '女', '不公開'] as Gender[]).map(g => (
                      <button key={g} onClick={() => setEditGender(g)}
                        className="flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all"
                        style={editGender === g ? { background: '#ff7d59', color: '#fff', border: '1px solid #ff7d59' } : { background: '#fff', color: '#8a7e76', border: '1px solid #f1e7dc' }}>
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={() => setIsEditingProfile(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                  style={{ background: '#f4ece4', color: '#2c2c34', border: 'none', cursor: 'pointer' }}>
                  取消
                </button>
                <button onClick={handleSaveProfile} disabled={isSaving}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold disabled:opacity-60 transition-opacity"
                  style={{ background: '#ff7d59', color: '#fff', border: 'none', cursor: 'pointer' }}>
                  {isSaving ? '儲存中…' : '儲存'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
