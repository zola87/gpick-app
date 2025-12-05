
import { initializeApp, FirebaseApp } from 'firebase/app';
import { getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc, Firestore, writeBatch } from 'firebase/firestore';
import { FirebaseConfig, Product, Customer, Order, TodoItem, GlobalSettings } from '../types';

let app: FirebaseApp | undefined;
let db: Firestore | undefined;

// Collections
const COLL_PRODUCTS = 'products';
const COLL_CUSTOMERS = 'customers';
const COLL_ORDERS = 'orders';
const COLL_TODOS = 'todos';
const COLL_SETTINGS = 'settings';

export const initFirebase = (config: FirebaseConfig) => {
  if (!app) {
    try {
      app = initializeApp(config);
      db = getFirestore(app);
      console.log("Firebase initialized successfully");
      return true;
    } catch (e) {
      console.error("Firebase init failed", e);
      return false;
    }
  }
  return true;
};

export const isInitialized = () => !!db;

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
    // Sanitize data
    const cleanData = JSON.parse(JSON.stringify(data));
    // setDoc with merge: true acts as update or create
    await setDoc(doc(db, collectionName, data.id), cleanData, { merge: true });
  } catch (e) {
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
    // We do NOT save firebaseConfig to cloud to avoid circular dependency/security issues
    // We only save business rules
    const { firebaseConfig, useCloudSync, geminiApiKey, ...businessRules } = settings;
    try {
        const cleanRules = JSON.parse(JSON.stringify(businessRules));
        await setDoc(doc(db, COLL_SETTINGS, 'global'), cleanRules, { merge: true });
    } catch(e) {
        console.error("Error saving settings", e);
    }
}

// Bulk Upload for Migration
export const uploadLocalDataToCloud = async (
  products: Product[],
  customers: Customer[],
  orders: Order[],
  todos: TodoItem[],
  settings: GlobalSettings
) => {
  if (!db) throw new Error("Cloud not connected");
  
  const batch = writeBatch(db);
  
  // Limit batches to 500 ops. For simplicity here we assume <500 items or just loop setDoc
  // Using loop setDoc for simplicity/reliability over large datasets without complex batching logic
  // (Firestore client handles queuing)

  let count = 0;
  
  for (const p of products) {
    await setDoc(doc(db, COLL_PRODUCTS, p.id), JSON.parse(JSON.stringify(p)));
    count++;
  }
  for (const c of customers) {
    await setDoc(doc(db, COLL_CUSTOMERS, c.id), JSON.parse(JSON.stringify(c)));
    count++;
  }
  for (const o of orders) {
    await setDoc(doc(db, COLL_ORDERS, o.id), JSON.parse(JSON.stringify(o)));
    count++;
  }
  for (const t of todos) {
    await setDoc(doc(db, COLL_TODOS, t.id), JSON.parse(JSON.stringify(t)));
    count++;
  }
  
  // Upload settings
  const { firebaseConfig, useCloudSync, geminiApiKey, ...businessRules } = settings;
  await setDoc(doc(db, COLL_SETTINGS, 'global'), JSON.parse(JSON.stringify(businessRules)));
  
  return count;
};
