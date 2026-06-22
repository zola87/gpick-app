import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, where, doc, getDocs, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions, signInAnon, updateDocument, addDocument } from '../services/firebaseService';
import { Customer, Order, Product, GlobalSettings } from '../types';
import { generateId } from './live/liveUtils';
import {
  CloudLightning, X, Edit2, AlertCircle, Package, Loader2,
  ShoppingBag, LayoutGrid, User, Lock, ChevronRight, Check,
} from 'lucide-react';

// ── LINE Login constants ─────────────────────────────────────────────────────
const LINE_CLIENT_ID    = '2010189984';
const LINE_REDIRECT_URI = `${window.location.origin}/`;

// ── PKCE utilities ───────────────────────────────────────────────────────────
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

// ── Nickname helpers ─────────────────────────────────────────────────────────
const normalizeNickname = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, '');

const levenshtein = (a: string, b: string): number => {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]) + 1;
    }
  }
  return dp[a.length][b.length];
};

const isValidDate = (year: string, month: string, day: string): boolean => {
  if (!year || !month || !day) return false;
  const y = parseInt(year), m = parseInt(month) - 1, d = parseInt(day);
  const dt = new Date(y, m, d);
  return dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const isSimilarNickname = (a: string, b: string): boolean => {
  const na = normalizeNickname(a), nb = normalizeNickname(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const threshold = Math.max(na.length, nb.length) <= 4 ? 1 : 2;
  return levenshtein(na, nb) <= threshold;
};

// ── LINE icon (reused throughout) ────────────────────────────────────────────
const LineIcon = ({ size = 20, color = '#06C755' }: { size?: number; color?: string }) => (
  <svg viewBox="0 0 24 24" fill={color} width={size} height={size} aria-hidden="true">
    <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.236 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
  </svg>
);

// ── Tier system ───────────────────────────────────────────────────────────────
type CustomerTier = { label: string; color: string; bg: string; border: string };

const getCustomerTier = (customer: Customer | null): CustomerTier => {
  const spent    = customer?.totalSpent    ?? 0;
  const sessions = customer?.sessionCount  ?? 0;
  if (spent >= 5000 || sessions >= 6)
    return { label: '自己人', color: '#5C8070', bg: '#EDF7F2', border: '#A8CEBE' };
  if (spent >= 1000 || sessions >= 3)
    return { label: '老朋友', color: '#8A7A5C', bg: '#F7F3ED', border: '#C8B99A' };
  return { label: '朋友', color: '#8A8278', bg: '#F0EDE9', border: '#D5CFCA' };
};

// ── Product category colours ─────────────────────────────────────────────────
const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  '藥妝': { bg: '#EDF7F2', text: '#5C8070' },
  '零食': { bg: '#FEF3E2', text: '#8A6500' },
  '保養': { bg: '#F5EEF8', text: '#7D3C98' },
  '生活': { bg: '#EAF4FB', text: '#2E86C1' },
  '文具': { bg: '#F9EBEA', text: '#943126' },
};
const DEFAULT_CAT = { bg: '#F0EDE9', text: '#8A8278' };

// ── Types ────────────────────────────────────────────────────────────────────
interface CustomerPageProps {
  token?: string;
  lineCallbackCode?: string;
}

type OrderStatus = 'bought' | 'partial' | 'looking' | 'not-found';
type LineStatus  = 'idle' | 'processing' | 'needsProfile' | 'success' | 'error' | 'notFound' | 'newCustomer' | 'confirmMatch';
type Gender      = '男' | '女' | '不公開';
type ActiveTab   = 'orders' | 'products' | 'profile';

function getOrderStatus(order: Order): OrderStatus {
  if (order.isArchived) return order.quantityBought >= order.quantity ? 'bought' : 'not-found';
  if (order.quantityBought >= order.quantity) return 'bought';
  if (order.quantityBought > 0) return 'partial';
  return 'looking';
}

const STATUS_CONFIG: Record<OrderStatus, { label: string; dot: string; text: string }> = {
  bought:      { label: '已買到',   dot: 'bg-[#7A9E8A]', text: 'text-[#5C8070]' },
  partial:     { label: '部分買到', dot: 'bg-amber-400', text: 'text-amber-600' },
  looking:     { label: '採購中',   dot: 'bg-[#ADA49C]', text: 'text-[#8A8278]' },
  'not-found': { label: '未買到',   dot: 'bg-rose-300',  text: 'text-rose-400'  },
};

// ── Demo data ────────────────────────────────────────────────────────────────
const DEMO_CUSTOMER: Customer = {
  id: 'demo-cust-001',
  lineName: 'Amy Chen ✨',
  communityNickname: 'Amy小姐',
  customerToken: 'demo',
  isBlacklisted: false,
  totalSpent: 12600,
  sessionCount: 8,
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
  { id: 'o7', productId: 'p4', customerId: 'demo-cust-001', quantity: 1, quantityBought: 0, status: 'PENDING', notificationStatus: 'UNNOTIFIED', isArchived: false, isCarriedOver: true, sessionName: '4月京都連線', timestamp: Date.now() - 86400000 * 30 },
];
const DEMO_SETTINGS: Partial<GlobalSettings> = {
  sessionName: '5月東京連線',
  shippingFee: 38,
  freeShippingThreshold: 3000,
  pickupPayment: 20,
  checkoutEnabled: false,
};

// ─────────────────────────────────────────────────────────────────────────────
export const CustomerPage: React.FC<CustomerPageProps> = ({ token, lineCallbackCode }) => {
  const isDemo      = token === 'demo';
  const isUniversal = !token && !isDemo;

  // ── Session persistence ──────────────────────────────────────────────────
  const SESSION_KEY = 'gpick_customer_session';
  const saveSession = (customerId: string) => {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        customerId,
        expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
      }));
    } catch {}
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

  // ── State ─────────────────────────────────────────────────────────────────
  const [customer, setCustomer]     = useState<Customer | null>(isDemo ? DEMO_CUSTOMER : null);
  const [orders,   setOrders]       = useState<Order[]>(isDemo ? DEMO_ORDERS : []);
  const [products, setProducts]     = useState<Product[]>(isDemo ? DEMO_PRODUCTS : []);
  const [settings, setSettings]     = useState<Partial<GlobalSettings>>(isDemo ? DEMO_SETTINGS : {});
  const [isLoading,       setIsLoading]       = useState(!isDemo);
  const [error,           setError]           = useState<string | null>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editNickname,    setEditNickname]    = useState('');
  const [editBirthYear,   setEditBirthYear]   = useState('');
  const [editBirthMonth,  setEditBirthMonth]  = useState('');
  const [editBirthDay,    setEditBirthDay]    = useState('');
  const [editGender,      setEditGender]      = useState<Gender | ''>('');
  const [isSaving,        setIsSaving]        = useState(false);
  const [lineStatus,      setLineStatus]      = useState<LineStatus>('idle');
  const [lineError,       setLineError]       = useState<string | null>(null);
  const [setupNickname,   setSetupNickname]   = useState('');
  const [setupBirthYear,  setSetupBirthYear]  = useState('');
  const [setupBirthMonth, setSetupBirthMonth] = useState('');
  const [setupBirthDay,   setSetupBirthDay]   = useState('');
  const [setupGender,     setSetupGender]     = useState<Gender | ''>('');
  const [isSavingSetup,   setIsSavingSetup]   = useState(false);
  const [showSetupErrors, setShowSetupErrors] = useState(false);
  const [pendingLineProfile, setPendingLineProfile] = useState<{ userId: string; displayName: string; pictureUrl?: string } | null>(null);
  const [matchCandidates, setMatchCandidates] = useState<{ id: string; lineName: string; communityNickname: string | null }[]>([]);

  // Tab navigation
  const [activeTab,     setActiveTab]     = useState<ActiveTab>('orders');
  const [productFilter, setProductFilter] = useState('全部');

  // ── Step 1: anon auth → customer lookup → subscriptions ──────────────────
  useEffect(() => {
    if (isDemo) return;
    let unsubs: (() => void)[] = [];

    signInAnon().then(async (user) => {
      if (!user) { setError('無法連接，請稍後再試'); setIsLoading(false); return; }

      if (!isUniversal) {
        const custQ = query(collection(db, 'customers'), where('customerToken', '==', token));
        const unsubCust = onSnapshot(custQ, (snap) => {
          if (snap.empty) { setError('連結已失效或不正確'); setIsLoading(false); return; }
          setCustomer(snap.docs[0].data() as Customer);
          setIsLoading(false);
        }, () => { setError('資料讀取失敗'); setIsLoading(false); });
        unsubs.push(unsubCust);
      } else {
        // Universal mode: try restoring session from localStorage
        const storedId = getStoredSession();
        if (storedId) {
          const custSnap = await getDoc(doc(db, 'customers', storedId));
          if (custSnap.exists()) {
            setCustomer(custSnap.data() as Customer);
            setIsLoading(false);
            return;
          }
          localStorage.removeItem(SESSION_KEY);
        }
        setIsLoading(false);
      }

      const unsubProd = onSnapshot(collection(db, 'products'), (snap) => {
        setProducts(snap.docs.map(d => d.data() as Product));
      });
      unsubs.push(unsubProd);

      const unsubSettings = onSnapshot(doc(db, 'settings', 'public'), (docSnap) => {
        if (docSnap.exists()) setSettings(docSnap.data() as GlobalSettings);
      });
      unsubs.push(unsubSettings);
    });

    return () => unsubs.forEach(u => u());
  }, [token, isUniversal]);

  // ── Step 2: subscribe to customer's orders ────────────────────────────────
  useEffect(() => {
    if (isDemo || !customer?.id) return;
    const q = query(collection(db, 'orders'), where('customerId', '==', customer.id));
    const unsub = onSnapshot(q, (snap) => {
      setOrders(snap.docs.map(d => d.data() as Order));
    });
    return unsub;
  }, [customer?.id]);

  // ── Step 3: handle LINE OAuth callback ────────────────────────────────────
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
              grant_type:    'authorization_code',
              code:          lineCallbackCode,
              redirect_uri:  LINE_REDIRECT_URI,
              client_id:     LINE_CLIENT_ID,
              code_verifier: verifier,
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
          // 1. Try to find by lineUserId (returning user who already linked)
          const snap = await getDocs(query(collection(db, 'customers'), where('lineUserId', '==', profile.userId)));
          if (!snap.empty) {
            const found = snap.docs[0].data() as Customer;
            const updated: Customer = { ...found, lineName: profile.displayName, lineAvatarUrl: profile.pictureUrl ?? found.lineAvatarUrl };
            await updateDocument('customers', updated);
            setCustomer(updated);
            saveSession(updated.id);
            window.history.replaceState(null, '', `${window.location.pathname}#/c`);
            setLineStatus('idle');
            return;
          }

          // 2. Not found by ID — try matching by LINE display name
          setPendingLineProfile({ userId: profile.userId, displayName: profile.displayName, pictureUrl: profile.pictureUrl });
          try {
            const matchFn = httpsCallable<
              { displayName: string },
              { candidates: { id: string; lineName: string; communityNickname: string | null }[] }
            >(functions, 'matchCustomerByLineName');
            const result = await matchFn({ displayName: profile.displayName });
            if (result.data.candidates.length > 0) {
              setMatchCandidates(result.data.candidates);
              setLineStatus('confirmMatch');
              return;
            }
          } catch (e) {
            console.error('matchCustomerByLineName failed', e);
          }

          // 3. No match — auto-create new customer
          await handleAutoCreateNew({ userId: profile.userId, displayName: profile.displayName, pictureUrl: profile.pictureUrl });
          return;
        }

        // Token-based: customer linked LINE from 我的 tab
        const linkedCustomer: Customer = {
          ...customer!,
          lineUserId:    profile.userId,
          lineName:      profile.displayName,
          lineAvatarUrl: profile.pictureUrl ?? undefined,
        };
        await updateDocument('customers', linkedCustomer);
        setCustomer(linkedCustomer);
        saveSession(linkedCustomer.id);
        window.history.replaceState(null, '', `${window.location.pathname}#/c/${token}`);
        setLineStatus('idle');

      } catch (err: any) {
        console.error('LINE login callback failed', err);
        setLineError('LINE 登入失敗，請重試');
        setLineStatus('error');
        sessionStorage.removeItem('line_pkce_verifier');
        setTimeout(() => {
          window.location.replace(`${window.location.pathname}${isUniversal ? '#/c' : `#/c/${token}`}`);
        }, 2500);
      }
    };

    handleLineCallback();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineCallbackCode, customer?.id]);

  // ── LINE login initiation ─────────────────────────────────────────────────
  const handleLineLogin = async () => {
    if (isDemo) {
      setLineStatus('processing');
      await new Promise(r => setTimeout(r, 1000));
      setCustomer(prev => prev ? {
        ...prev,
        lineUserId:    'Udemo123456',
        lineAvatarUrl: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Amy&backgroundColor=b6e3f4',
        lineName:      'Amy Chen（LINE）',
      } : prev);
      setSetupNickname(customer?.communityNickname ?? '');
      setSetupGender(customer?.gender ?? '');
      setLineStatus('needsProfile');
      return;
    }
    setLineStatus('processing');
    try {
      const verifier  = generateVerifier();
      const challenge = await generateChallenge(verifier);
      sessionStorage.setItem('line_pkce_verifier', verifier);
      sessionStorage.setItem('gpick_line_return', token ?? '');
      const params = new URLSearchParams({
        response_type:         'code',
        client_id:             LINE_CLIENT_ID,
        redirect_uri:          LINE_REDIRECT_URI,
        state:                 `customer_${token ?? ''}`,
        scope:                 'profile openid',
        code_challenge:        challenge,
        code_challenge_method: 'S256',
        nonce:                 generateVerifier().slice(0, 16),
      });
      window.location.href = `https://access.line.me/oauth2/v2.1/authorize?${params}`;
    } catch {
      setLineStatus('idle');
    }
  };

  const setupIsValid =
    setupNickname.trim() !== '' &&
    isValidDate(setupBirthYear, setupBirthMonth, setupBirthDay) &&
    setupGender !== '';

  const handleSaveProfileSetup = async () => {
    if (!customer) return;
    if (!setupIsValid) { setShowSetupErrors(true); return; }
    setIsSavingSetup(true);
    const birthDate = `${setupBirthYear}-${setupBirthMonth.padStart(2,'0')}-${setupBirthDay.padStart(2,'0')}`;
    const updated = { ...customer, communityNickname: setupNickname.trim(), birthDate, gender: setupGender as Gender };
    if (!isDemo) await updateDocument('customers', updated);
    setCustomer(updated);
    setIsSavingSetup(false);
    if (isDemo) { setLineStatus('idle'); return; }
    window.location.replace(`${window.location.pathname}${isUniversal ? '#/c' : `#/c/${token}`}`);
  };

  const createNewCustomerRecord = async (birthDate: string) => {
    if (!pendingLineProfile) return;
    const newCustomer: Customer = {
      id: generateId(),
      lineName:          pendingLineProfile.displayName,
      lineUserId:        pendingLineProfile.userId,
      lineAvatarUrl:     pendingLineProfile.pictureUrl,
      communityNickname: setupNickname.trim(),
      birthDate,
      gender:        setupGender as Gender,
      totalSpent:    0,
      sessionCount:  0,
      isBlacklisted: false,
    };
    await addDocument('customers', newCustomer);
    setCustomer(newCustomer);
    setPendingLineProfile(null);
    setMatchCandidates([]);
    setIsSavingSetup(false);
    window.location.replace(`${window.location.pathname}#/c`);
  };

  const handleNewCustomerSubmit = async () => {
    if (!setupIsValid || !pendingLineProfile) { setShowSetupErrors(true); return; }
    setIsSavingSetup(true);
    const birthDate = `${setupBirthYear}-${setupBirthMonth.padStart(2,'0')}-${setupBirthDay.padStart(2,'0')}`;
    try {
      const findMatches = httpsCallable<
        { nickname: string },
        { matches: { id: string; communityNickname: string }[] }
      >(functions, 'findCustomerMatches');
      const result = await findMatches({ nickname: setupNickname.trim() });
      const candidates = result.data.matches.map(m => ({ ...m, lineName: m.communityNickname }));
      if (candidates.length > 0) {
        setMatchCandidates(candidates);
        setIsSavingSetup(false);
        setLineStatus('confirmMatch');
        return;
      }
    } catch (e) {
      console.error('findCustomerMatches failed', e);
    }
    await createNewCustomerRecord(birthDate);
  };

  const handleConfirmMatch = async (candidateId: string) => {
    if (!pendingLineProfile) return;
    setIsSavingSetup(true);
    const fullSnap = await getDoc(doc(db, 'customers', candidateId));
    if (!fullSnap.exists()) { setIsSavingSetup(false); return; }
    const fullCustomer = fullSnap.data() as Customer;
    const updated: Customer = {
      ...fullCustomer,
      lineUserId:    pendingLineProfile.userId,
      lineName:      pendingLineProfile.displayName,
      lineAvatarUrl: pendingLineProfile.pictureUrl ?? fullCustomer.lineAvatarUrl,
    };
    await updateDocument('customers', updated);
    setCustomer(updated);
    saveSession(updated.id);
    setPendingLineProfile(null);
    setMatchCandidates([]);
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

  const handleAutoCreateNew = async (profile: { userId: string; displayName: string; pictureUrl?: string }) => {
    const newCustomer: Customer = {
      id: generateId(),
      lineName:      profile.displayName,
      lineUserId:    profile.userId,
      lineAvatarUrl: profile.pictureUrl,
      isBlacklisted: false,
      totalSpent:    0,
      sessionCount:  0,
    };
    await addDocument('customers', newCustomer);
    setCustomer(newCustomer);
    saveSession(newCustomer.id);
    setPendingLineProfile(null);
    setMatchCandidates([]);
    window.history.replaceState(null, '', `${window.location.pathname}#/c`);
    setLineStatus('idle');
  };

  const openEditProfile = () => {
    setEditNickname(customer?.communityNickname ?? '');
    setEditGender(customer?.gender ?? '');
    if (customer?.birthDate) {
      const [y, m, d] = customer.birthDate.split('-');
      setEditBirthYear(y ?? '');
      setEditBirthMonth(String(parseInt(m ?? '0')));
      setEditBirthDay(String(parseInt(d ?? '0')));
    } else {
      setEditBirthYear(''); setEditBirthMonth(''); setEditBirthDay('');
    }
    setIsEditingProfile(true);
  };

  const handleSaveProfile = async () => {
    if (!customer) return;
    setIsSaving(true);
    const birthDate = (editBirthYear && editBirthMonth && editBirthDay)
      ? `${editBirthYear}-${editBirthMonth.padStart(2,'0')}-${editBirthDay.padStart(2,'0')}`
      : customer.birthDate;
    const updated: Customer = {
      ...customer,
      communityNickname: editNickname.trim() || customer.communityNickname,
      ...(birthDate ? { birthDate } : {}),
      ...(editGender    ? { gender: editGender as Gender }  : {}),
    };
    if (!isDemo) await updateDocument('customers', updated);
    setCustomer(updated);
    setIsSaving(false);
    setIsEditingProfile(false);
  };

  // ── Derived values ────────────────────────────────────────────────────────
  const activeOrders   = useMemo(() => orders.filter(o => !o.isArchived), [orders]);

  const { subtotal, remittance, isFreeShipping } = useMemo(() => {
    const shippingFee           = settings.shippingFee           ?? 38;
    const freeShippingThreshold = settings.freeShippingThreshold ?? 3000;
    const pickupPayment         = settings.pickupPayment         ?? 20;
    const subtotal = activeOrders.reduce((sum, o) => {
      if (!o.quantityBought) return sum;
      const p = products.find(pr => pr.id === o.productId);
      if (!p) return sum;
      const price = (o.variant && p.variantPrices?.[o.variant]) ? p.variantPrices[o.variant] : p.priceTWD;
      return sum + price * o.quantityBought;
    }, 0);
    const isFreeShipping = subtotal >= freeShippingThreshold;
    const remittance = Math.max(0, subtotal - pickupPayment - (isFreeShipping ? shippingFee : 0));
    return { subtotal, remittance, isFreeShipping };
  }, [activeOrders, products, settings]);

  const boughtCount  = useMemo(() => activeOrders.filter(o => getOrderStatus(o) === 'bought').length, [activeOrders]);
  const buyingCount  = useMemo(() => activeOrders.filter(o => getOrderStatus(o) === 'looking' || getOrderStatus(o) === 'partial').length, [activeOrders]);
  const isLineLinked = !!customer?.lineUserId;

  const currentOrders = useMemo(() => activeOrders.filter(o => !o.isCarriedOver), [activeOrders]);
  const carriedOrders = useMemo(() => activeOrders.filter(o =>  o.isCarriedOver), [activeOrders]);

  const productCategories = useMemo(() => {
    const cats = new Set(products.map(p => p.category).filter(Boolean));
    return ['全部', ...cats];
  }, [products]);

  const filteredProducts = useMemo(() => {
    if (productFilter === '全部') return products;
    return products.filter(p => p.category === productFilter);
  }, [products, productFilter]);

  // ── Flow screens ──────────────────────────────────────────────────────────

  // LINE callback: processing
  if (lineCallbackCode && lineStatus === 'processing') {
    return (
      <div className="min-h-screen bg-[#EDE8E3] flex flex-col items-center justify-center gap-4 p-6">
        <div className="w-14 h-14 bg-[#06C755] rounded-2xl flex items-center justify-center shadow-lg">
          <Loader2 size={24} className="text-white animate-spin" />
        </div>
        <div className="text-center">
          <p className="font-semibold text-[#2C2926] text-base">正在連結 LINE 帳號</p>
          <p className="text-[#8A8278] text-sm mt-1">請稍候…</p>
        </div>
      </div>
    );
  }

  // Profile setup / new customer form
  if ((lineCallbackCode || isDemo) && (lineStatus === 'needsProfile' || lineStatus === 'newCustomer')) {
    const isNewCustomer = lineStatus === 'newCustomer';
    const previewName   = isNewCustomer ? pendingLineProfile?.displayName : customer?.lineName;
    const previewAvatar = isNewCustomer ? pendingLineProfile?.pictureUrl  : customer?.lineAvatarUrl;
    const years  = Array.from({ length: 60 }, (_, i) => String(new Date().getFullYear() - 15 - i));
    const months = Array.from({ length: 12 }, (_, i) => String(i + 1));
    const days   = Array.from({ length: 31 }, (_, i) => String(i + 1));
    return (
      <div className="min-h-screen bg-[#EDE8E3]">
        <div className="bg-[#06C755] px-5 py-4 flex items-center gap-3">
          <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center">
            <LineIcon size={18} color="white" />
          </div>
          <div>
            <div className="text-sm font-semibold text-white">
              {isNewCustomer ? '歡迎使用 GPick！' : 'LINE 帳號已連結！'}
            </div>
            <div className="text-[11px] text-white/75">
              {isNewCustomer ? '第一次使用，請先填寫基本資料' : '請填寫基本資料，方便主購服務你'}
            </div>
          </div>
        </div>
        <div className="max-w-lg mx-auto px-4 py-6 space-y-5 pb-10">
          <div className="bg-[#FAF8F5] rounded-2xl p-4 flex items-center gap-3 shadow-sm">
            {previewAvatar ? (
              <img src={previewAvatar} alt="" className="w-12 h-12 rounded-full object-cover ring-2 ring-[#06C755]/30 shrink-0" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-[#06C755]/10 flex items-center justify-center text-[#06C755] font-bold text-xl shrink-0">
                {previewName?.[0] ?? '?'}
              </div>
            )}
            <div>
              <p className="font-semibold text-[#2C2926]">{previewName}</p>
              <p className="text-xs text-[#8A8278] mt-0.5">從 LINE 帳號自動取得</p>
            </div>
          </div>

          <div className="bg-[#FAF8F5] rounded-2xl p-5 space-y-5 shadow-sm">
            <div>
              <label className="text-xs font-semibold text-[#8A8278] uppercase tracking-widest flex items-center gap-1 mb-1.5">
                社群暱稱 <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                className={`w-full border rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 bg-white transition-colors ${
                  showSetupErrors && !setupNickname.trim()
                    ? 'border-rose-300 focus:ring-rose-300'
                    : 'border-[#E5DFD9] focus:ring-[#7A9E8A]'
                }`}
                placeholder="你在匿名社群使用的名稱"
                value={setupNickname}
                onChange={e => setSetupNickname(e.target.value)}
              />
              {showSetupErrors && !setupNickname.trim() && (
                <p className="text-[11px] text-rose-400 mt-1">請填寫社群暱稱</p>
              )}
              <p className="text-[11px] text-[#ADA49C] mt-1.5 leading-relaxed">
                若你在社群更改了暱稱，記得回來這裡同步更新，方便主購辨識你
              </p>
            </div>

            <div>
              <label className="text-xs font-semibold text-[#8A8278] uppercase tracking-widest flex items-center gap-1 mb-1.5">
                出生年月日 <span className="text-rose-400">*</span>
              </label>
              <div className="flex gap-2">
                {[
                  { val: setupBirthYear,  set: setSetupBirthYear,  w: 'flex-1',    placeholder: '年', opts: years   },
                  { val: setupBirthMonth, set: setSetupBirthMonth, w: 'w-[72px]',  placeholder: '月', opts: months },
                  { val: setupBirthDay,   set: setSetupBirthDay,   w: 'w-[72px]',  placeholder: '日', opts: days   },
                ].map(({ val, set, w, placeholder, opts }) => (
                  <select
                    key={placeholder}
                    className={`${w} border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 bg-white text-[#2C2926] transition-colors ${
                      showSetupErrors && !val
                        ? 'border-rose-300 focus:ring-rose-300'
                        : 'border-[#E5DFD9] focus:ring-[#7A9E8A]'
                    }`}
                    value={val}
                    onChange={e => set(e.target.value)}
                  >
                    <option value="">{placeholder}</option>
                    {opts.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ))}
              </div>
              {showSetupErrors && (!setupBirthYear || !setupBirthMonth || !setupBirthDay) && (
                <p className="text-[11px] text-rose-400 mt-1">請選擇完整的出生年月日</p>
              )}
              {showSetupErrors && setupBirthYear && setupBirthMonth && setupBirthDay &&
                !isValidDate(setupBirthYear, setupBirthMonth, setupBirthDay) && (
                <p className="text-[11px] text-rose-400 mt-1">此日期不存在，請重新選擇</p>
              )}
            </div>

            <div>
              <label className="text-xs font-semibold text-[#8A8278] uppercase tracking-widest flex items-center gap-1 mb-2">
                性別 <span className="text-rose-400">*</span>
              </label>
              <div className="flex gap-2">
                {(['男', '女', '不公開'] as Gender[]).map(g => (
                  <button
                    key={g}
                    onClick={() => setSetupGender(g)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                      setupGender === g
                        ? 'bg-[#3F4550] text-white border-[#3F4550]'
                        : showSetupErrors && !setupGender
                          ? 'bg-white text-[#8A8278] border-rose-300 hover:border-[#ADA49C]'
                          : 'bg-white text-[#8A8278] border-[#E5DFD9] hover:border-[#ADA49C]'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
              {showSetupErrors && !setupGender && (
                <p className="text-[11px] text-rose-400 mt-1">請選擇性別</p>
              )}
            </div>
          </div>

          <div>
            <button
              onClick={isNewCustomer ? handleNewCustomerSubmit : handleSaveProfileSetup}
              disabled={isSavingSetup}
              className="w-full py-3 bg-[#06C755] hover:bg-[#05b34b] text-white rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-60 shadow-lg shadow-[#06C755]/20"
            >
              {isSavingSetup
                ? <><Loader2 size={16} className="animate-spin" />{isNewCustomer ? '比對中…' : '儲存中…'}</>
                : (isNewCustomer ? '下一步' : '儲存並查看我的訂單')}
            </button>
            {showSetupErrors && !setupIsValid && (
              <p className="text-xs text-rose-400 text-center mt-2">請填寫所有必填欄位（* 標示）</p>
            )}
          </div>
          <p className="text-center text-xs text-[#C5BEB7]">GPick 代購管理系統</p>
        </div>
      </div>
    );
  }

  // Confirm match
  if (lineStatus === 'confirmMatch' && matchCandidates.length > 0) {
    const candidate = matchCandidates[0];
    return (
      <div className="min-h-screen bg-[#EDE8E3] flex flex-col items-center justify-center p-6">
        <div className="bg-[#FAF8F5] rounded-2xl w-full max-w-sm p-6 shadow-sm space-y-5">
          {/* LINE avatar */}
          <div className="flex flex-col items-center gap-3 pb-2">
            {pendingLineProfile?.pictureUrl ? (
              <img src={pendingLineProfile.pictureUrl} alt="" className="w-14 h-14 rounded-full object-cover ring-2 ring-[#06C755]/20" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-[#06C755]/10 flex items-center justify-center text-[#06C755] font-bold text-2xl">
                {pendingLineProfile?.displayName?.[0] ?? '?'}
              </div>
            )}
            <div className="text-center">
              <p className="font-bold text-[#2C2926]">{pendingLineProfile?.displayName}</p>
              <p className="text-xs text-[#ADA49C] mt-0.5">你的 LINE 帳號</p>
            </div>
          </div>

          <div className="border-t border-[#F0EDE9] pt-4">
            <p className="text-sm font-semibold text-[#2C2926] mb-1">找到一筆資料，請確認是否為你？</p>
            <p className="text-xs text-[#8A8278] mb-3 leading-relaxed">
              系統在訂單資料中找到名稱相似的紀錄。如果是你，過去的訂單將自動連結。
            </p>
            <div className="bg-[#F0EDE9] rounded-xl p-4 space-y-2.5">
              <div className="flex justify-between items-center text-sm">
                <span className="text-[#ADA49C]">LINE 名稱</span>
                <span className="font-semibold text-[#2C2926]">{candidate.lineName}</span>
              </div>
              {candidate.communityNickname && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-[#ADA49C]">社群暱稱</span>
                  <span className="font-semibold text-[#2C2926]">{candidate.communityNickname}</span>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2.5 pt-1">
            <button
              onClick={() => handleConfirmMatch(candidate.id)}
              disabled={isSavingSetup}
              className="w-full py-3.5 bg-[#7A9E8A] text-white font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {isSavingSetup ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              是我，確認登入
            </button>
            <button
              onClick={handleNotMeCreateNew}
              disabled={isSavingSetup}
              className="w-full py-3.5 bg-[#F0EDE9] text-[#8A8278] font-medium rounded-xl disabled:opacity-60"
            >
              不是我，建立新帳號
            </button>
          </div>
        </div>
        <p className="text-xs text-[#C5BEB7] mt-6">GPick 代購管理系統</p>
      </div>
    );
  }

  // Loading
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#EDE8E3] flex flex-col items-center justify-center gap-3">
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center animate-pulse"
          style={{ background: 'linear-gradient(135deg, #7A9E8A, #5C8070)' }}>
          <CloudLightning size={18} className="text-white" />
        </div>
        <p className="text-[#8A8278] text-sm">載入中…</p>
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className="min-h-screen bg-[#EDE8E3] flex items-center justify-center p-4">
        <div className="bg-[#FAF8F5] rounded-2xl p-8 text-center max-w-sm w-full shadow-lg shadow-black/5">
          <div className="w-14 h-14 bg-rose-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="text-rose-400" size={24} />
          </div>
          <h2 className="font-semibold text-[#2C2926] mb-2">連結無效</h2>
          <p className="text-[#8A8278] text-sm leading-relaxed">{error}</p>
        </div>
      </div>
    );
  }

  // LINE login wall
  const showLineLoginWall = isUniversal ? !customer : (!!customer && !isLineLinked && !isDemo);
  if (showLineLoginWall) {
    if (isUniversal) {
      return (
        <div className="min-h-screen bg-[#EDE8E3] flex flex-col">
          {/* Header */}
          <div className="bg-[#FAF8F5] px-5 py-4 flex items-center gap-2.5 border-b border-[#F0EDE9]">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(135deg, #7A9E8A, #5C8070)' }}>
              <CloudLightning size={13} className="text-white" />
            </div>
            <span className="text-sm font-bold text-[#2C2926] tracking-tight">GPick</span>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center px-6 pb-10">
              {/* Welcome copy */}
            <h2 className="text-2xl font-bold text-[#2C2926] mb-2 text-center">歡迎使用 GPick</h2>
            <p className="text-sm text-[#8A8278] text-center leading-relaxed mb-8 max-w-xs">
              日本代購專屬平台，讓你隨時掌握<br />訂單進度、瀏覽商品清單。
            </p>

            {lineStatus === 'error' && lineError && (
              <p className="text-xs text-rose-500 bg-rose-50 px-4 py-2 rounded-xl mb-4">{lineError}</p>
            )}

            {/* LINE login button */}
            <button
              onClick={handleLineLogin}
              disabled={lineStatus === 'processing'}
              className="w-full max-w-xs py-4 bg-[#06C755] text-white rounded-2xl text-base font-bold flex items-center justify-center gap-2.5 disabled:opacity-60 shadow-xl shadow-[#06C755]/25 active:scale-95 transition-transform"
            >
              {lineStatus === 'processing' ? (
                <><Loader2 size={18} className="animate-spin" />請稍候…</>
              ) : (
                <><LineIcon size={22} color="white" />使用 LINE 登入</>
              )}
            </button>

            <p className="text-xs text-[#C5BEB7] mt-5">登入即表示同意 GPick 服務條款</p>
          </div>
        </div>
      );
    }

    // Token-based: customer needs to link LINE
    return (
      <div className="min-h-screen bg-[#EDE8E3] flex flex-col">
        <div className="bg-[#3F4550] px-5 py-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shadow-md"
            style={{ background: 'linear-gradient(135deg, #7A9E8A, #5C8070)' }}>
            <CloudLightning size={15} className="text-white" />
          </div>
          <div>
            <div className="text-sm font-semibold text-[#EEF0EC]">GPick 訂單查詢</div>
            <div className="text-[10px] text-[#8A9E90]">{settings.sessionName || '本次連線'}</div>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-6">
          <div className="w-20 h-20 bg-[#06C755]/10 rounded-3xl flex items-center justify-center">
            <LineIcon size={40} color="#06C755" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[#2C2926] mb-2">先連結 LINE 帳號</h2>
            <p className="text-sm text-[#8A8278] leading-relaxed max-w-xs">
              連結後才能查看訂單狀態和匯款金額。<br />只需要授權一次，下次直接開啟。
            </p>
          </div>
          {lineStatus === 'error' && lineError && (
            <p className="text-xs text-rose-500 bg-rose-50 px-4 py-2 rounded-xl">{lineError}</p>
          )}
          <button
            onClick={handleLineLogin}
            disabled={lineStatus === 'processing'}
            className="w-full max-w-xs py-3.5 bg-[#06C755] hover:bg-[#05b34b] text-white rounded-2xl text-base font-bold transition-colors flex items-center justify-center gap-2.5 disabled:opacity-60 shadow-xl shadow-[#06C755]/25"
          >
            {lineStatus === 'processing' ? (
              <><Loader2 size={18} className="animate-spin" />請稍候…</>
            ) : (
              <><LineIcon size={20} color="white" />使用 LINE 登入</>
            )}
          </button>
          <p className="text-xs text-[#C5BEB7]">GPick 代購管理系統</p>
        </div>
      </div>
    );
  }

  // ── Order row helper ──────────────────────────────────────────────────────
  const renderOrderRow = (order: Order) => {
    const product = products.find(p => p.id === order.productId);
    if (!product) return null;
    const status    = getOrderStatus(order);
    const cfg       = STATUS_CONFIG[status];
    const price     = (order.variant && product.variantPrices?.[order.variant])
      ? product.variantPrices[order.variant] : product.priceTWD;
    const itemTotal = price * (order.quantityBought || 0);

    return (
      <div key={order.id} className="px-4 py-3.5">
        {order.isCarriedOver && order.sessionName && (
          <div className="text-[10px] text-[#ADA49C] mb-1.5">延續自 {order.sessionName}</div>
        )}
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-[#2C2926] truncate">
              {product.name}
              {order.keepShell && <span className="ml-1 text-[10px] text-[#8A8278]">(留殼)</span>}
            </div>
            <div className="text-xs text-[#ADA49C] mt-0.5 flex items-center gap-2 flex-wrap">
              {order.variant && (
                <span className="bg-[#E5DFD9] px-1.5 py-0.5 rounded text-[#8A8278]">{order.variant}</span>
              )}
              <span>喊 {order.quantity} 件</span>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className={`text-xs font-semibold ${cfg.text}`}>{cfg.label}</div>
            {order.quantityBought > 0 && (
              <div className="text-[10px] text-[#ADA49C] mt-0.5">
                買到 {order.quantityBought} · NT${itemTotal}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ── Main UI ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#EDE8E3]">

      {/* ── Header ── */}
      <header
        className="bg-[#FAF8F5] sticky top-0 z-10 flex items-center gap-3 px-4 py-2.5"
        style={{ boxShadow: '0 1px 0 rgba(0,0,0,0.04)' }}
      >
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg, #7A9E8A, #5C8070)' }}
        >
          <CloudLightning size={13} className="text-white" />
        </div>
        <span className="text-sm font-bold text-[#2C2926]">GPick</span>
        {settings.sessionName && (
          <span className="text-[10px] font-semibold text-[#7A9E8A] bg-[#EDF7F2] px-2 py-0.5 rounded-full">
            {settings.sessionName}
          </span>
        )}
      </header>

      {/* ── Tab content ── */}
      <div className="pb-24">

        {/* ───────── ORDERS TAB ───────── */}
        {activeTab === 'orders' && (
          <div className="max-w-lg mx-auto px-4 py-4 space-y-3">

            {/* Status pills */}
            <div className="flex gap-2">
              <div className="flex-1 bg-[#FAF8F5] rounded-xl px-3 py-2.5 flex items-center gap-2 shadow-sm">
                <div className="w-2 h-2 rounded-full bg-[#7A9E8A]" />
                <span className="text-xs text-[#8A8278]">已買到</span>
                <span className="ml-auto font-bold text-[#2C2926] text-sm">{boughtCount}</span>
              </div>
              <div className="flex-1 bg-[#FAF8F5] rounded-xl px-3 py-2.5 flex items-center gap-2 shadow-sm">
                <div className="w-2 h-2 rounded-full bg-[#ADA49C]" />
                <span className="text-xs text-[#8A8278]">採購中</span>
                <span className="ml-auto font-bold text-[#2C2926] text-sm">{buyingCount}</span>
              </div>
            </div>

            {/* Orders list */}
            <div className="bg-[#FAF8F5] rounded-2xl overflow-hidden shadow-sm">
              <div className="px-4 py-3.5 border-b border-[#F0EDE9]">
                <h2 className="font-semibold text-[#2C2926] text-sm">本場訂單明細</h2>
              </div>

              {activeOrders.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <Package className="w-8 h-8 text-[#E5DFD9] mx-auto mb-2" />
                  <p className="text-[#ADA49C] text-sm">本場尚無訂單記錄</p>
                </div>
              ) : (
                <div className="divide-y divide-[#F0EDE9]">
                  {currentOrders.map(renderOrderRow)}

                  {carriedOrders.length > 0 && (
                    <>
                      <div className="px-4 py-2 bg-[#F7F4F0]">
                        <span className="text-[10px] font-semibold text-[#ADA49C] uppercase tracking-wider">延續訂單</span>
                      </div>
                      {carriedOrders.map(renderOrderRow)}
                    </>
                  )}
                </div>
              )}

              {/* Billing */}
              {subtotal > 0 && (
                <div className="px-4 py-4 border-t border-[#E5DFD9] bg-[#F7F4F0] space-y-2">
                  <div className="flex justify-between text-xs text-[#8A8278]">
                    <span>商品小計</span><span>NT$ {subtotal}</span>
                  </div>
                  <div className="flex justify-between text-xs text-[#8A8278]">
                    <span>預扣賣貨便最低支付</span><span>－ NT$ {settings.pickupPayment ?? 20}</span>
                  </div>
                  {isFreeShipping && (
                    <div className="flex justify-between text-xs text-[#7A9E8A]">
                      <span>滿額免運折抵</span><span>－ NT$ {settings.shippingFee ?? 38}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-semibold text-[#2C2926] pt-2 border-t border-[#E5DFD9] text-sm">
                    <span>需匯款金額</span><span>NT$ {remittance}</span>
                  </div>
                  {!isFreeShipping && (
                    <div className="text-[10px] text-[#ADA49C] text-right">
                      再買 NT$ {(settings.freeShippingThreshold ?? 3000) - subtotal} 可享免運
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Checkout section */}
            {subtotal > 0 && (
              <div className="bg-[#FAF8F5] rounded-2xl overflow-hidden shadow-sm">
                {settings.checkoutEnabled ? (
                  <div className="p-4">
                    <div className="text-sm font-semibold text-[#2C2926] mb-3">結帳資訊</div>
                    <div className="bg-[#EDF7F2] border border-[#7A9E8A]/20 rounded-xl p-3">
                      <div className="text-[10px] font-semibold text-[#7A9E8A] uppercase tracking-wider mb-1">匯款帳號</div>
                      <div className="text-sm text-[#2C2926] font-mono">{settings.bankAccount ?? '—'}</div>
                    </div>
                    <p className="text-xs text-[#8A8278] mt-3 leading-relaxed">
                      請依上方帳號匯款 NT$ {remittance}，完成後截圖傳給主購確認
                    </p>
                  </div>
                ) : (
                  <div className="p-4 flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl bg-[#F0EDE9] flex items-center justify-center shrink-0 mt-0.5">
                      <Lock size={14} className="text-[#ADA49C]" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-[#2C2926]">結帳功能尚未開放</div>
                      <div className="text-xs text-[#8A8278] mt-0.5 leading-relaxed">
                        主購回國後將開放匯款，屆時會通知您
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <p className="text-center text-xs text-[#C5BEB7] pb-2">GPick 代購管理系統</p>
          </div>
        )}

        {/* ───────── PRODUCTS TAB ───────── */}
        {activeTab === 'products' && (
          <div className="max-w-lg mx-auto px-4 py-4">

            {/* Category filter chips */}
            <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
              {productCategories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setProductFilter(cat)}
                  className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                    productFilter === cat
                      ? 'bg-[#2C2926] text-white'
                      : 'bg-[#FAF8F5] text-[#8A8278] shadow-sm'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Product grid */}
            {filteredProducts.length === 0 ? (
              <div className="text-center py-16">
                <Package className="w-10 h-10 text-[#E5DFD9] mx-auto mb-3" />
                <p className="text-[#ADA49C] text-sm">此分類暫無商品</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {filteredProducts.map(product => {
                  const catStyle = CATEGORY_COLORS[product.category] ?? DEFAULT_CAT;
                  return (
                    <div key={product.id} className="bg-[#FAF8F5] rounded-2xl overflow-hidden shadow-sm">
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          className="w-full h-32 object-cover"
                        />
                      ) : (
                        <div
                          className="w-full h-32 flex items-center justify-center"
                          style={{ background: catStyle.bg }}
                        >
                          <Package size={28} style={{ color: catStyle.text, opacity: 0.4 }} />
                        </div>
                      )}
                      <div className="p-3">
                        <div
                          className="text-xs font-medium text-[#2C2926] leading-snug mb-1"
                          style={{
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical' as const,
                            overflow: 'hidden',
                          }}
                        >
                          {product.name}
                        </div>
                        {product.brand && (
                          <div className="text-[10px] text-[#ADA49C] mb-1.5">{product.brand}</div>
                        )}
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-sm font-bold text-[#2C2926]">NT$ {product.priceTWD}</span>
                          <span
                            className="text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0"
                            style={{ background: catStyle.bg, color: catStyle.text }}
                          >
                            {product.category}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Coming soon */}
            <div className="mt-5 bg-[#FAF8F5] rounded-2xl p-5 text-center shadow-sm">
              <div className="text-sm font-semibold text-[#2C2926] mb-1">持續開發中</div>
              <div className="text-xs text-[#ADA49C] leading-relaxed">
                商品排行、優惠券、節日活動、抽獎<br />等功能陸續上線中，敬請期待
              </div>
            </div>

            <p className="text-center text-xs text-[#C5BEB7] mt-5 mb-2">GPick 代購管理系統</p>
          </div>
        )}

        {/* ───────── PROFILE TAB ───────── */}
        {activeTab === 'profile' && (() => {
          const fmtBirth = (d?: string) => {
            if (!d) return null;
            const [y, m, day] = d.split('-');
            return `${y} 年 ${parseInt(m)} 月 ${parseInt(day)} 日`;
          };
          return (
          <div className="max-w-lg mx-auto px-4 py-5 space-y-3">

            {/* Avatar + name card */}
            <div className="bg-[#FAF8F5] rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="relative shrink-0">
                  {customer?.lineAvatarUrl ? (
                    <img
                      src={customer.lineAvatarUrl}
                      alt={customer.lineName}
                      className="w-16 h-16 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-[#E5EFEA] flex items-center justify-center text-[#7A9E8A] font-bold text-2xl">
                      {customer?.lineName?.[0] ?? '?'}
                    </div>
                  )}
                  {isLineLinked && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-[#06C755] rounded-full flex items-center justify-center ring-2 ring-[#FAF8F5]">
                      <LineIcon size={11} color="white" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[#2C2926] text-base truncate">{customer?.lineName}</div>
                  <div className="text-sm text-[#8A8278] mt-0.5">
                    {customer?.communityNickname
                      ? customer.communityNickname
                      : <span className="italic text-[#ADA49C] text-xs">尚未填寫社群暱稱</span>}
                  </div>
                  <div className="text-[11px] text-[#ADA49C] mt-1.5">
                    已參與 {customer?.sessionCount ?? 0} 場連線
                  </div>
                </div>
              </div>
            </div>

            {/* 個人資料 section */}
            <div className="bg-[#FAF8F5] rounded-2xl overflow-hidden shadow-sm">
              <div className="px-5 py-3 border-b border-[#F0EDE9] flex items-center justify-between">
                <span className="text-xs font-semibold text-[#ADA49C] uppercase tracking-wider">個人資料</span>
                <button
                  onClick={openEditProfile}
                  className="text-xs font-semibold text-[#7A9E8A]"
                >
                  編輯
                </button>
              </div>
              <div className="divide-y divide-[#F0EDE9]">
                {[
                  { label: '社群暱稱', value: customer?.communityNickname || '—' },
                  { label: '生日',     value: fmtBirth(customer?.birthDate) ?? '—' },
                  { label: '性別',     value: customer?.gender || '—' },
                ].map(({ label, value }) => (
                  <div key={label} className="px-5 py-3.5 flex items-center gap-3">
                    <span className="text-xs text-[#ADA49C] w-16 shrink-0">{label}</span>
                    <span className="text-sm text-[#2C2926]">{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* LINE 帳號 */}
            {isLineLinked ? (
              <div className="bg-[#FAF8F5] rounded-2xl overflow-hidden shadow-sm">
                <div className="px-5 py-3 border-b border-[#F0EDE9]">
                  <span className="text-xs font-semibold text-[#ADA49C] uppercase tracking-wider">帳號連結</span>
                </div>
                <div className="px-5 py-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#06C755]/10 flex items-center justify-center shrink-0">
                    <LineIcon size={18} color="#06C755" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-[#ADA49C]">LINE 帳號</div>
                    <div className="text-sm font-semibold text-[#2C2926] flex items-center gap-1 mt-0.5 truncate">
                      <Check size={12} className="text-[#06C755] shrink-0" />
                      {customer?.lineName}
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold text-[#06C755] bg-[#06C755]/10 px-2 py-0.5 rounded-full shrink-0">已連結</span>
                </div>
              </div>
            ) : (
              <div className="bg-[#FAF8F5] rounded-2xl overflow-hidden shadow-sm">
                <div className="px-5 py-3 border-b border-[#F0EDE9]">
                  <span className="text-xs font-semibold text-[#ADA49C] uppercase tracking-wider">帳號連結</span>
                </div>
                <div className="px-5 py-4">
                  <p className="text-xs text-[#8A8278] mb-3 leading-relaxed">
                    連結 LINE 帳號後，下次開啟頁面將自動識別身份，免重新輸入。
                  </p>
                  <button
                    onClick={handleLineLogin}
                    disabled={lineStatus === 'processing'}
                    className="w-full py-3 bg-[#06C755] hover:bg-[#05b34b] text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60 transition-colors"
                  >
                    {lineStatus === 'processing'
                      ? <><Loader2 size={15} className="animate-spin" />連結中…</>
                      : <><LineIcon size={16} color="white" />連結 LINE 帳號</>}
                  </button>
                </div>
              </div>
            )}

            <p className="text-center text-xs text-[#C5BEB7] pt-2 pb-2">GPick 代購管理系統</p>
          </div>
        );})()}
      </div>

      {/* ── Bottom navigation ── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-20 bg-[#FAF8F5]"
        style={{ boxShadow: '0 -1px 0 rgba(0,0,0,0.04)' }}
      >
        <div style={{ display: 'flex', padding: '7px 4px 13px' }}>
          {([
            { tab: 'orders'   as ActiveTab, label: '訂單', Icon: ShoppingBag },
            { tab: 'products' as ActiveTab, label: '商品', Icon: LayoutGrid  },
            { tab: 'profile'  as ActiveTab, label: '我的', Icon: User        },
          ] as const).map(({ tab, label, Icon }) => {
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '3px',
                  border: 'none',
                  background: 'transparent',
                  padding: '2px 0',
                  cursor: 'pointer',
                }}
              >
                <Icon
                  size={19}
                  strokeWidth={1.6}
                  style={{ color: active ? '#2C2926' : '#C5BEB7' }}
                />
                <span style={{
                  display: 'block',
                  width: '3px',
                  height: '3px',
                  borderRadius: '50%',
                  background: active ? '#7A9E8A' : 'transparent',
                }} />
                <span style={{
                  fontSize: '9px',
                  lineHeight: 1,
                  color: active ? '#2C2926' : '#C5BEB7',
                  fontWeight: active ? 700 : 400,
                }}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* ── Edit Profile Modal ── */}
      {isEditingProfile && (() => {
        const years  = Array.from({ length: 60 }, (_, i) => String(new Date().getFullYear() - 15 - i));
        const months = Array.from({ length: 12 }, (_, i) => String(i + 1));
        const days   = Array.from({ length: 31 }, (_, i) => String(i + 1));
        return (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center p-4 backdrop-blur-sm">
            <div className="bg-[#FAF8F5] rounded-2xl w-full max-w-sm p-6 space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold text-[#2C2926]">編輯個人資料</h3>
                <button
                  onClick={() => setIsEditingProfile(false)}
                  className="p-1.5 text-[#ADA49C] hover:bg-[#E5DFD9] rounded-lg transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4">
                {/* LINE name — read-only */}
                <div>
                  <label className="text-xs font-semibold text-[#8A8278] uppercase tracking-widest block mb-1.5">LINE 名稱</label>
                  <div className="w-full border border-[#E5DFD9] rounded-xl px-4 py-2.5 text-sm bg-[#F0EDE9] text-[#8A8278]">
                    {customer?.lineName || '—'}
                  </div>
                  <p className="text-[10px] text-[#ADA49C] mt-1">自動同步你在 LINE 的顯示名稱</p>
                </div>

                {/* Community nickname */}
                <div>
                  <label className="text-xs font-semibold text-[#8A8278] uppercase tracking-widest block mb-1.5">社群暱稱</label>
                  <input
                    type="text"
                    className="w-full border border-[#E5DFD9] rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#7A9E8A] bg-white"
                    placeholder="你在匿名社群的名稱"
                    value={editNickname}
                    onChange={e => setEditNickname(e.target.value)}
                  />
                  <p className="text-[10px] text-[#ADA49C] mt-1">方便主購辨識你是哪位社群成員</p>
                </div>

                {/* Birthday */}
                <div>
                  <label className="text-xs font-semibold text-[#8A8278] uppercase tracking-widest block mb-1.5">生日</label>
                  <div className="flex gap-2">
                    {[
                      { val: editBirthYear,  set: setEditBirthYear,  w: 'flex-1',   placeholder: '年', opts: years   },
                      { val: editBirthMonth, set: setEditBirthMonth, w: 'w-[68px]', placeholder: '月', opts: months },
                      { val: editBirthDay,   set: setEditBirthDay,   w: 'w-[68px]', placeholder: '日', opts: days   },
                    ].map(({ val, set, w, placeholder, opts }) => (
                      <select
                        key={placeholder}
                        className={`${w} border border-[#E5DFD9] rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#7A9E8A] bg-white text-[#2C2926]`}
                        value={val}
                        onChange={e => set(e.target.value)}
                      >
                        <option value="">{placeholder}</option>
                        {opts.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ))}
                  </div>
                </div>

                {/* Gender */}
                <div>
                  <label className="text-xs font-semibold text-[#8A8278] uppercase tracking-widest block mb-2">性別</label>
                  <div className="flex gap-2">
                    {(['男', '女', '不公開'] as Gender[]).map(g => (
                      <button
                        key={g}
                        onClick={() => setEditGender(g)}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                          editGender === g
                            ? 'bg-[#3F4550] text-white border-[#3F4550]'
                            : 'bg-white text-[#8A8278] border-[#E5DFD9] hover:border-[#ADA49C]'
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setIsEditingProfile(false)}
                  className="flex-1 py-2.5 bg-[#E5DFD9] text-[#2C2926] rounded-xl text-sm font-medium"
                >
                  取消
                </button>
                <button
                  onClick={handleSaveProfile}
                  disabled={isSaving}
                  className="flex-1 py-2.5 bg-[#7A9E8A] text-white rounded-xl text-sm font-semibold hover:bg-[#5C8070] disabled:opacity-60 transition-colors"
                >
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
