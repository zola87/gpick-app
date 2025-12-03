import React, { useState, useEffect, ReactNode, Component } from 'react';
import { LayoutDashboard, Radio, ShoppingBag, Receipt, Menu, X, Users, Settings as SettingsIcon, Package, Cloud, RefreshCw, AlertTriangle } from 'lucide-react';
import { Dashboard } from './components/Dashboard';
import { LiveSession } from './components/LiveSession';
import { ShoppingList } from './components/ShoppingList';
import { Billing } from './components/Billing';
import { CRM } from './components/CRM';
import { Settings } from './components/Settings';
import { Inventory } from './components/Inventory';
import { Product, Order, Customer, GlobalSettings } from './types';

// Firebase Imports
import { db } from './services/firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';

// Initial Data for Fallback
const INITIAL_SETTINGS: GlobalSettings = {
  jpyExchangeRate: 0.23,
  pricingRules: [
    { minPrice: 0, maxPrice: 1000, multiplier: 0.38 },
    { minPrice: 1001, maxPrice: 3000, multiplier: 0.35 },
    { minPrice: 3001, maxPrice: 5000, multiplier: 0.32 },
    { minPrice: 5001, maxPrice: 10000, multiplier: 0.30 },
    { minPrice: 10001, maxPrice: 999999, multiplier: 0.28 },
  ],
  shippingFee: 38,
  freeShippingThreshold: 3000,
  pickupPayment: 20,
  productCategories: ['藥妝', '零食', '服飾', '雜貨', '伴手禮', '限定商品'],
  billingMessageTemplate: `【{{date}} 連線對帳單】
哈囉 {{name}} 👋
這是您本次連線購買的商品明細：

{{items}}
-------------------
商品小計：\${{subtotal}}
運費：\${{shipping}} {{freeShippingNote}}
-------------------
總金額 (含運)：\${{total}}
賣貨便取貨時支付：\${{pickupPayment}} (含運費/包材)

💰 本次需匯款金額：\${{remittance}}
(匯款帳號: 822-xxxx-xxxx)

匯款後請填寫此連結並下單賣貨便：
[您的賣貨便連結]
收到款項後會盡快為您出貨！謝謝 ❤️`
};

const STOCK_CUSTOMER_ID = 'stock-holder';
const INITIAL_STOCK_CUSTOMER: Customer = { 
  id: STOCK_CUSTOMER_ID, 
  lineName: '📦 庫存/現貨區', 
  nickname: 'Stock', 
  isStock: true 
};

interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: any): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
            <div className="bg-white max-w-md w-full p-8 rounded-xl shadow-lg border border-red-200 text-center">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                    <AlertTriangle className="text-red-500 w-8 h-8" />
                </div>
                <h2 className="text-xl font-bold text-stone-800 mb-2">發生預期外的錯誤</h2>
                <p className="text-stone-600 mb-6 text-sm break-all">{this.state.error?.message}</p>
                <button 
                  onClick={() => window.location.reload()} 
                  className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700"
                >
                  重新整理頁面
                </button>
            </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'live' | 'shopping' | 'billing' | 'crm' | 'settings' | 'inventory'>('live');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCloudConnected, setIsCloudConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Real-time State (Synced with Firestore)
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [settings, setSettings] = useState<GlobalSettings>(INITIAL_SETTINGS);

  // --- Firestore Subscriptions ---
  
  useEffect(() => {
    let unsubProd: () => void;
    let unsubCust: () => void;
    let unsubOrder: () => void;
    let unsubSettings: () => void;

    try {
        // Check if db is initialized
        if (!db) throw new Error("Firebase DB not initialized");

        // 1. Products
        unsubProd = onSnapshot(collection(db, 'products'), (snap) => {
          setProducts(snap.docs.map(d => d.data() as Product));
          setIsCloudConnected(true);
          setConnectionError(null);
        }, (err) => {
          console.error("Cloud Error (Products):", err);
          if (err.code === 'permission-denied') {
             setConnectionError("權限錯誤：無法讀取資料庫。請確認 Firebase 規則已設為 'allow read, write: if true;'");
          } else if (err.message.includes("Service firestore is not available")) {
             setConnectionError("連線錯誤：Firebase 服務無法使用。請檢查 importmap 設定。");
          } else {
             setConnectionError(`連線錯誤：${err.message}`);
          }
        });

        // 2. Customers
        unsubCust = onSnapshot(collection(db, 'customers'), (snap) => {
          const data = snap.docs.map(d => d.data() as Customer);
          setCustomers(data);
          
          // Ensure Stock Customer Exists
          if (data.length > 0 && !data.find(c => c.isStock)) {
             setDoc(doc(db, 'customers', STOCK_CUSTOMER_ID), INITIAL_STOCK_CUSTOMER).catch(e => console.error(e));
          }
        });

        // 3. Orders
        unsubOrder = onSnapshot(collection(db, 'orders'), (snap) => {
          setOrders(snap.docs.map(d => d.data() as Order));
        });

        // 4. Settings (Single Doc)
        unsubSettings = onSnapshot(doc(db, 'settings', 'global'), (snap) => {
          if (snap.exists()) {
            setSettings(snap.data() as GlobalSettings);
          } else {
            // Init settings if missing
            setDoc(doc(db, 'settings', 'global'), INITIAL_SETTINGS).catch(e => console.error(e));
          }
        });

    } catch (err: any) {
        setConnectionError(`初始化失敗：${err.message}`);
    }

    return () => {
      if(unsubProd) unsubProd();
      if(unsubCust) unsubCust();
      if(unsubOrder) unsubOrder();
      if(unsubSettings) unsubSettings();
    };
  }, []);

  // --- Handlers (Write to Firestore) ---

  const handleAddProduct = async (newProduct: Product) => {
    await setDoc(doc(db, 'products', newProduct.id), newProduct);
  };

  const handleUpdateProduct = async (updatedProduct: Product) => {
    await setDoc(doc(db, 'products', updatedProduct.id), updatedProduct);
  };

  const handleDeleteProduct = async (productId: string) => {
    if (window.confirm('確定要刪除此商品嗎？')) {
      await deleteDoc(doc(db, 'products', productId));
    }
  };

  const handleAddOrder = async (newOrder: Order, newCustomer?: Customer) => {
    if (newCustomer) {
      await setDoc(doc(db, 'customers', newCustomer.id), newCustomer);
    }
    await setDoc(doc(db, 'orders', newOrder.id), newOrder);
  };

  const handleUpdateOrder = async (updatedOrder: Order) => {
    await setDoc(doc(db, 'orders', updatedOrder.id), updatedOrder);
  };

  const handleDeleteOrder = async (orderId: string) => {
    await deleteDoc(doc(db, 'orders', orderId));
  };

  const handleUpdateCustomer = async (updatedCustomer: Customer) => {
    await setDoc(doc(db, 'customers', updatedCustomer.id), updatedCustomer);
  };

  const handleDeleteCustomer = async (customerId: string) => {
      if(window.confirm('確定要刪除此顧客資料嗎？')) {
          await deleteDoc(doc(db, 'customers', customerId));
      }
  };

  const handleUpdateSettings = async (newSettings: GlobalSettings) => {
    await setDoc(doc(db, 'settings', 'global'), newSettings);
    alert('設定已同步至雲端！');
  };

  const handleArchiveOrders = async () => {
    const stockId = customers.find(c => c.isStock)?.id || STOCK_CUSTOMER_ID;
    
    const batch = writeBatch(db);
    let count = 0;

    orders.forEach(o => {
        if (o.customerId === stockId) return; // Skip stock
        if (!o.isArchived) {
            count++;
            const ref = doc(db, 'orders', o.id);
            batch.update(ref, { isArchived: true });
        }
    });

    if (count > 0) {
        await batch.commit();
        alert(`已成功封存 ${count} 筆訂單！大家的手機都已同步更新。`);
    } else {
        alert("沒有需要封存的訂單。");
    }
  };

  // CSV Export
  const exportToCSV = () => {
    const activeOrders = orders.filter(o => !o.isArchived);
    if (activeOrders.length === 0) {
      alert("目前沒有進行中的訂單可匯出。");
      return;
    }
    const headers = [
      "訂單ID", "顧客名稱", "商品名稱", "款式", "數量", 
      "售價(TWD)", "總金額(TWD)", "日幣原價(JPY)", "預估成本(TWD)", "預估毛利(TWD)", "毛利率(%)",
      "付款狀態", "付款方式", "備註"
    ];

    const rows = activeOrders.map(o => {
      const customer = customers.find(c => c.id === o.customerId);
      const product = products.find(p => p.id === o.productId);
      const priceTWD = product?.priceTWD || 0;
      const priceJPY = product?.priceJPY || 0;
      const totalRevenue = priceTWD * o.quantity;
      const estCost = Math.round(priceJPY * settings.jpyExchangeRate * o.quantity);
      const profit = totalRevenue - estCost;
      const margin = totalRevenue > 0 ? ((profit / totalRevenue) * 100).toFixed(1) + '%' : '0%';

      return [
        o.id,
        customer?.lineName || 'Unknown',
        product?.name || 'Unknown',
        o.variant || '',
        o.quantity,
        priceTWD,
        totalRevenue,
        priceJPY,
        estCost,
        profit,
        margin,
        o.isPaid ? '已付款' : '未付款',
        o.paymentMethod || '',
        o.paymentNote || ''
      ].map(field => `"${field}"`).join(',');
    });

    const csvContent = "\uFEFF" + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `GPick_Export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // JSON Backup (For Manual Backup)
  const exportBackupJSON = () => {
    const backupData = { products, customers, orders, settings, timestamp: Date.now(), version: '2.0-cloud' };
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `GPick_CloudBackup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
  };

  // MIGRATION TOOL: Upload JSON to Firestore
  const importBackupJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.products && data.customers && data.orders) {
           if(window.confirm(`【資料搬家】確定要將備份檔上傳到雲端嗎？\n\n這將會新增：\n+ 商品: ${data.products.length} 筆\n+ 顧客: ${data.customers.length} 筆\n+ 訂單: ${data.orders.length} 筆\n\n請耐心等待上傳完成...`)) {
               
               let opCount = 0;
               
               // 1. Settings
               if(data.settings) await setDoc(doc(db, 'settings', 'global'), data.settings);

               // 2. Customers
               for (const c of data.customers) {
                   await setDoc(doc(db, 'customers', c.id), c);
                   opCount++;
               }
               
               // 3. Products
               for (const p of data.products) {
                   await setDoc(doc(db, 'products', p.id), p);
                   opCount++;
               }

               // 4. Orders
               for (const o of data.orders) {
                   await setDoc(doc(db, 'orders', o.id), o);
                   opCount++;
               }

               alert(`資料上傳完成！共處理 ${opCount} 筆資料。\n現在所有裝置都已同步。`);
           }
        } else {
           alert('錯誤：無效的備份檔案。');
        }
      } catch (err) {
        alert('上傳失敗：' + err);
        console.error(err);
      }
    };
    reader.readAsText(file);
    e.target.value = ''; 
  };

  const NavItem = ({ id, label, icon: Icon }: { id: typeof activeTab, label: string, icon: any }) => (
    <button
      onClick={() => {
        setActiveTab(id);
        setIsMobileMenuOpen(false);
      }}
      className={`flex items-center space-x-3 w-full px-4 py-3 rounded-lg transition-colors ${
        activeTab === id 
          ? 'bg-blue-600 text-white shadow-md' 
          : 'text-stone-600 hover:bg-blue-50 hover:text-blue-700'
      }`}
    >
      <Icon size={20} />
      <span className="font-medium">{label}</span>
    </button>
  );

  if (connectionError) {
      return (
          <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
              <div className="bg-white max-w-md w-full p-8 rounded-xl shadow-lg border border-red-200 text-center">
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                      <AlertTriangle className="text-red-500 w-8 h-8" />
                  </div>
                  <h2 className="text-xl font-bold text-stone-800 mb-2">無法連線至雲端</h2>
                  <p className="text-stone-600 mb-6">{connectionError}</p>
                  <button 
                    onClick={() => window.location.reload()} 
                    className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700"
                  >
                    重新整理
                  </button>
                  <p className="text-xs text-stone-400 mt-4">
                      如果您是第一次建立，請確認 Firebase Console 的 Firestore Rules 已設為 `allow read, write: if true;`
                  </p>
              </div>
          </div>
      );
  }

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col md:flex-row font-sans text-stone-800">
      {/* Mobile Header */}
      <div className="md:hidden bg-white p-4 flex justify-between items-center shadow-sm z-30 sticky top-0">
        <h1 className="text-xl font-bold text-blue-600 flex items-center gap-2">
            GPick 賺錢工具 
            {isCloudConnected ? <Cloud size={16} className="text-green-500"/> : <Cloud size={16} className="text-stone-300"/>}
        </h1>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
          {isMobileMenuOpen ? <X /> : <Menu />}
        </button>
      </div>

      {/* Sidebar Navigation */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-stone-200 transform transition-transform duration-200 ease-in-out md:translate-x-0 md:static md:h-screen flex flex-col shadow-2xl md:shadow-none
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-6 border-b border-stone-100 flex justify-between items-center md:block">
          <div>
            <h1 className="text-2xl font-bold text-blue-600 flex items-center gap-2">
                GPick 賺錢工具
            </h1>
            <div className="flex items-center gap-1 text-xs text-stone-400 mt-1">
                {isCloudConnected ? (
                    <span className="text-green-600 flex items-center gap-1"><Cloud size={12}/> 雲端已連線</span>
                ) : (
                    <span className="flex items-center gap-1"><RefreshCw size={12} className="animate-spin"/> 連線中...</span>
                )}
            </div>
          </div>
          <button onClick={() => setIsMobileMenuOpen(false)} className="md:hidden text-stone-400">
            <X size={24} />
          </button>
        </div>
        
        <nav className="px-4 space-y-2 mt-4 flex-1 overflow-y-auto">
          <NavItem id="live" label="現場連線" icon={Radio} />
          <NavItem id="shopping" label="採購清單" icon={ShoppingBag} />
          <NavItem id="inventory" label="貨物管理" icon={Package} />
          <NavItem id="billing" label="對帳結單" icon={Receipt} />
          <NavItem id="crm" label="顧客管理" icon={Users} />
          <NavItem id="dashboard" label="營運總覽" icon={LayoutDashboard} />
          <div className="pt-4 border-t border-stone-100 mt-4">
            <NavItem id="settings" label="系統設定" icon={SettingsIcon} />
          </div>
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto h-[calc(100vh-64px)] md:h-screen bg-stone-50 z-0">
        <div className="max-w-7xl mx-auto h-full pb-20 md:pb-0">
          
          {activeTab === 'dashboard' && (
            <Dashboard 
              products={products} 
              orders={orders} 
              customers={customers} 
              settings={settings}
            />
          )}
          {activeTab === 'crm' && (
             <CRM 
               customers={customers} 
               orders={orders} 
               products={products} 
               onUpdateCustomer={handleUpdateCustomer} 
               onDeleteCustomer={handleDeleteCustomer}
             />
          )}
          {activeTab === 'live' && (
            <LiveSession 
              products={products} 
              customers={customers} 
              settings={settings}
              onAddProduct={handleAddProduct}
              onUpdateProduct={handleUpdateProduct}
              onDeleteProduct={handleDeleteProduct}
              onAddOrder={handleAddOrder}
            />
          )}
          {activeTab === 'shopping' && (
            <ShoppingList 
              products={products} 
              orders={orders} 
              customers={customers}
              onUpdateOrder={handleUpdateOrder}
            />
          )}
          {activeTab === 'billing' && (
            <Billing 
              products={products} 
              customers={customers} 
              orders={orders} 
              settings={settings}
              onUpdateOrder={handleUpdateOrder}
            />
          )}
          {activeTab === 'inventory' && (
            <Inventory 
              products={products}
              orders={orders}
              customers={customers}
              onUpdateOrder={handleUpdateOrder}
              onAddOrder={handleAddOrder}
              onDeleteOrder={handleDeleteOrder}
            />
          )}
          {activeTab === 'settings' && (
            <Settings 
              settings={settings} 
              onSave={handleUpdateSettings} 
              onArchive={handleArchiveOrders} 
              onExport={exportToCSV}
              onExportBackup={exportBackupJSON}
              onImportBackup={importBackupJSON}
            />
          )}
        </div>
      </main>

      {/* Overlay for mobile menu */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}
    </div>
  );
}

// Wrap App with ErrorBoundary
export default function WrappedApp() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}