
import { initializeApp, FirebaseApp } from 'firebase/app';
import { getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc, Firestore, writeBatch } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, signInAnonymously, Auth } from 'firebase/auth';
import { getFunctions, httpsCallable, Functions } from 'firebase/functions';
import { query, where, getDocs, updateDoc } from 'firebase/firestore';
import { FirebaseConfig, Product, Customer, Order, TodoItem, GlobalSettings, SalesReport } from '../types';

const firebaseConfig = {
  apiKey: "AIzaSyAvwK33uc_vqnZ1tQgbkjtjQfpj82pbFNQ",
  authDomain: "gpick-cloud.firebaseapp.com",
  projectId: "gpick-cloud",
  storageBucket: "gpick-cloud.firebasestorage.app",
  messagingSenderId: "555183514474",
  appId: "1:555183514474:web:c7b946d8dfd337d4453b13",
  measurementId: "G-SMNY283ETK"
};

let app: FirebaseApp;
export let db: Firestore;
export let auth: Auth;
export let functions: Functions;

try {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
  functions = getFunctions(app);
  console.log("Firebase initialized successfully");
} catch (e) {
  console.error("Firebase init failed", e);
}

// Collections
const COLL_PRODUCTS = 'products';
const COLL_CUSTOMERS = 'customers';
const COLL_ORDERS = 'orders';
const COLL_TODOS = 'todos';
const COLL_SETTINGS = 'settings';
const COLL_REPORTS = 'reports';

export const initFirebase = (config?: FirebaseConfig) => {
  return !!db;
};

export const isInitialized = () => !!db;

export const loginWithGoogle = async () => {
  if (!auth) return null;
  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (error: any) {
    console.error("Login failed", error);
    if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
      // User closed the popup, no need to alert
      return null;
    } else if (error.code === 'auth/configuration-not-found') {
      alert("Firebase 尚未啟用 Google 登入！\n\n請前往 Firebase Console -> Authentication -> Sign-in method，將 Google 登入啟用。");
    } else if (error.code === 'auth/unauthorized-domain') {
      alert("網域未授權！\n\n請前往 Firebase Console -> Authentication -> Settings -> Authorized domains，將此網址加入白名單。");
    } else {
      alert(`登入失敗: ${error.message}`);
    }
    throw error;
  }
};

export const logout = async () => {
  if (!auth) return;
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Logout failed", error);
    throw error;
  }
};

export const subscribeToAuth = (callback: (user: any) => void) => {
  if (!auth) return () => {};
  return onAuthStateChanged(auth, callback);
};

// Anonymous auth for customer self-service pages
export const signInAnon = async () => {
  if (!auth) return null;
  try {
    const result = await signInAnonymously(auth);
    return result.user;
  } catch (e) {
    console.error('Anonymous sign-in failed', e);
    return null;
  }
};

// Public: find customer by token (for customer self-service page)
export const getCustomerByToken = async (token: string) => {
  if (!db) return null;
  try {
    const q = query(collection(db, COLL_CUSTOMERS), where('customerToken', '==', token));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    return snapshot.docs[0].data();
  } catch (e) {
    console.error('getCustomerByToken failed', e);
    return null;
  }
};

// Real-time Subscriptions (onSnapshot)
export const subscribeToCollection = (
  collectionName: string, 
  onUpdate: (data: any[]) => void
) => {
  if (!db) return () => {};
  
  const q = collection(db, collectionName);
  const unsubscribe = onSnapshot(q, (snapshot) => {
    const data = snapshot.docs.map(doc => doc.data());
    onUpdate(data);
  }, (error) => {
    console.error(`Error subscribing to ${collectionName}:`, error);
  });
  
  return unsubscribe;
};

// Subscribe to only non-archived orders to avoid loading full history on every page load
export const subscribeToActiveOrders = (onUpdate: (data: Order[]) => void) => {
  if (!db) return () => {};
  const q = query(collection(db, COLL_ORDERS), where('isArchived', '==', false));
  return onSnapshot(q, (snapshot) => {
    const data = snapshot.docs.map(d => d.data() as Order);
    onUpdate(data);
  }, (error) => {
    console.error('Error subscribing to active orders:', error);
  });
};

// Settings are stored in a specific doc 'global' inside settings collection
export const subscribeToSettings = (
    onUpdate: (settings: Partial<GlobalSettings>) => void
) => {
    if (!db) return () => {};
    const docRef = doc(db, COLL_SETTINGS, 'global');
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
            onUpdate(docSnap.data() as Partial<GlobalSettings>);
        }
    });
    return unsubscribe;
}

// CRUD Operations
export const addDocument = async (collectionName: string, data: any) => {
  if (!db) return;
  try {
    // Sanitize data: Firestore doesn't accept 'undefined' values
    const cleanData = JSON.parse(JSON.stringify(data));
    await setDoc(doc(db, collectionName, data.id), cleanData);
  } catch (e) {
    console.error(`Error adding to ${collectionName}`, e);
    throw e;
  }
};

export const updateDocument = async (collectionName: string, data: any) => {
  if (!db) return;
  try {
    const cleanData = JSON.parse(JSON.stringify(data));
    await updateDoc(doc(db, collectionName, cleanData.id), cleanData);
  } catch (e: any) {
    if (e?.code === 'not-found') {
      const cleanData = JSON.parse(JSON.stringify(data));
      await setDoc(doc(db, collectionName, cleanData.id), cleanData, { merge: true });
      return;
    }
    console.error(`Error updating ${collectionName}`, e);
    throw e;
  }
};

export const deleteDocument = async (collectionName: string, id: string) => {
  if (!db) return;
  try {
    await deleteDoc(doc(db, collectionName, id));
  } catch (e) {
    console.error(`Error deleting from ${collectionName}`, e);
    throw e;
  }
};

// Specialized Save for Settings
export const saveSettingsToCloud = async (settings: GlobalSettings) => {
    if(!db) return;
    // Exclude client-only fields; geminiApiKey is intentionally included in businessRules
    const { firebaseConfig, useCloudSync, ...businessRules } = settings;
    try {
        const cleanRules = JSON.parse(JSON.stringify(businessRules));
        await setDoc(doc(db, COLL_SETTINGS, 'global'), cleanRules, { merge: true });
    } catch(e) {
        console.error("Error saving settings", e);
    }
}

// Send a LINE push message to a customer via the GPick official account (admin only)
export const sendLineMessage = async (lineUserId: string, message: string): Promise<{ success: boolean; error?: string }> => {
  if (!functions) return { success: false, error: 'Functions 尚未初始化' };
  try {
    const callable = httpsCallable(functions, 'sendLineMessage');
    const result = await callable({ lineUserId, message });
    return result.data as { success: boolean };
  } catch (e: any) {
    console.error('sendLineMessage failed', e);
    return { success: false, error: e.message };
  }
};

// Bulk Upload for Migration — uses writeBatch in 450-op chunks to stay under the 500-op limit
export const uploadLocalDataToCloud = async (
  products: Product[],
  customers: Customer[],
  orders: Order[],
  todos: TodoItem[],
  settings: GlobalSettings
) => {
  if (!db) throw new Error("Cloud not connected");

  const CHUNK = 450;
  const allItems: Array<{ coll: string; id: string; data: any }> = [];
  for (const p of products) allItems.push({ coll: COLL_PRODUCTS, id: p.id, data: JSON.parse(JSON.stringify(p)) });
  for (const c of customers) allItems.push({ coll: COLL_CUSTOMERS, id: c.id, data: JSON.parse(JSON.stringify(c)) });
  for (const o of orders) allItems.push({ coll: COLL_ORDERS, id: o.id, data: JSON.parse(JSON.stringify(o)) });
  for (const t of todos) allItems.push({ coll: COLL_TODOS, id: t.id, data: JSON.parse(JSON.stringify(t)) });

  for (let i = 0; i < allItems.length; i += CHUNK) {
    const batch = writeBatch(db);
    for (const item of allItems.slice(i, i + CHUNK)) {
      batch.set(doc(db, item.coll, item.id), item.data);
    }
    await batch.commit();
  }

  const { firebaseConfig, useCloudSync, ...businessRules } = settings;
  await setDoc(doc(db, COLL_SETTINGS, 'global'), JSON.parse(JSON.stringify(businessRules)));

  return allItems.length;
};

// Batch update multiple orders in 450-op chunks
export const batchUpdateOrders = async (orders: Order[]) => {
  if (!db || orders.length === 0) return;
  const CHUNK = 450;
  for (let i = 0; i < orders.length; i += CHUNK) {
    const batch = writeBatch(db);
    for (const o of orders.slice(i, i + CHUNK)) {
      batch.set(doc(db, COLL_ORDERS, o.id), JSON.parse(JSON.stringify(o)), { merge: true });
    }
    await batch.commit();
  }
};

// Delete a customer and all their orders atomically
export const deleteCustomerWithOrders = async (customerId: string) => {
  if (!db) return;
  const orderSnap = await getDocs(query(collection(db, COLL_ORDERS), where('customerId', '==', customerId)));
  const CHUNK = 450;
  const allRefs = [
    doc(db, COLL_CUSTOMERS, customerId),
    ...orderSnap.docs.map(d => d.ref),
  ];
  for (let i = 0; i < allRefs.length; i += CHUNK) {
    const batch = writeBatch(db);
    for (const ref of allRefs.slice(i, i + CHUNK)) batch.delete(ref);
    await batch.commit();
  }
};

// Archive a session atomically: report + customer spend updates + order mutations in one batch
export const batchArchiveSession = async (
  report: SalesReport,
  customerUpdates: { id: string; totalSpent: number; sessionCount: number }[],
  ordersToUpdate: Order[],
  ordersToAdd: Order[],
) => {
  if (!db) return;

  type Op = { type: 'set' | 'update'; coll: string; id: string; data: Record<string, any> };
  const ops: Op[] = [];

  ops.push({ type: 'set', coll: COLL_REPORTS, id: report.id, data: JSON.parse(JSON.stringify(report)) });
  for (const cu of customerUpdates) {
    ops.push({ type: 'update', coll: COLL_CUSTOMERS, id: cu.id, data: { totalSpent: cu.totalSpent, sessionCount: cu.sessionCount } });
  }
  for (const o of ordersToUpdate) {
    ops.push({ type: 'set', coll: COLL_ORDERS, id: o.id, data: JSON.parse(JSON.stringify(o)) });
  }
  for (const o of ordersToAdd) {
    ops.push({ type: 'set', coll: COLL_ORDERS, id: o.id, data: JSON.parse(JSON.stringify(o)) });
  }

  const CHUNK = 450;
  for (let i = 0; i < ops.length; i += CHUNK) {
    const batch = writeBatch(db);
    for (const op of ops.slice(i, i + CHUNK)) {
      const ref = doc(db, op.coll, op.id);
      if (op.type === 'set') batch.set(ref, op.data);
      else batch.update(ref, op.data);
    }
    await batch.commit();
  }
};
