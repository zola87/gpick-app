import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Radio, ShoppingBag, Receipt, Menu, X, Users, Settings as SettingsIcon, Package } from 'lucide-react';
import { Dashboard } from './components/Dashboard';
import { LiveSession } from './components/LiveSession';
import { ShoppingList } from './components/ShoppingList';
import { Billing } from './components/Billing';
import { CRM } from './components/CRM';
import { Settings } from './components/Settings';
import { Inventory } from './components/Inventory';
import { Product, Order, Customer, GlobalSettings } from './types';

// Safe ID generator for Init Data
const safeId = () => Math.random().toString(36).substring(2, 10);

// --- Custom Hook for LocalStorage ---
function useLocalStorage<T>(key: string, initialValue: T) {
  // State to store our value
  // Pass initial state function to useState so logic is only executed once
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === "undefined") {
      return initialValue;
    }
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.log(error);
      return initialValue;
    }
  });

  // Return a wrapped version of useState's setter function that ...
  // ... persists the new value to localStorage.
  const setValue = (value: T | ((val: T) => T)) => {
    try {
      // Allow value to be a function so we have same API as useState
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      
      // Save state
      setStoredValue(valueToStore);
      
      // Save to local storage
      if (typeof window !== "undefined") {
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
      }
    } catch (error) {
      console.log(error);
    }
  };
  return [storedValue, setValue] as const;
}

// Initial Data
const INITIAL_PRODUCTS: Product[] = [
  { id: safeId(), name: 'EVE 止痛藥 (白盒)', variants: [], priceJPY: 698, priceTWD: 250, category: '藥妝', brand: 'SS製藥', createdAt: Date.now(), imageUrl: 'https://picsum.photos/200?random=1' },
];

const INITIAL_CUSTOMERS: Customer[] = [
  { id: 'stock-001', lineName: '📦 庫存/現貨區', nickname: 'Stock', isStock: true, isBlacklisted: false },
  { id: safeId(), lineName: 'Amy Chen', nickname: 'Amy', note: 'VIP', isBlacklisted: false },
  { id: safeId(), lineName: 'Jason Wang', nickname: 'Jason', isBlacklisted: false },
];

const INITIAL_ORDERS: Order[] = [
  { id: safeId(), productId: INITIAL_PRODUCTS[0].id, customerId: INITIAL_CUSTOMERS[1].id, quantity: 2, quantityBought: 0, status: 'PENDING', notificationStatus: 'UNNOTIFIED', isArchived: false, timestamp: Date.now() },
];

const DEFAULT_BILLING_TEMPLATE = `【{{date}} 連線對帳單】
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
收到款項後會盡快為您出貨！謝謝 ❤️`;

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
  billingMessageTemplate: DEFAULT_BILLING_TEMPLATE
};

function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'live' | 'shopping' | 'billing' | 'crm' | 'settings' | 'inventory'>('live');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Global State with LocalStorage Persistence
  const [products, setProducts] = useLocalStorage<Product[]>('gpick_products', INITIAL_PRODUCTS);
  const [customers, setCustomers] = useLocalStorage<Customer[]>('gpick_customers', INITIAL_CUSTOMERS);
  const [orders, setOrders] = useLocalStorage<Order[]>('gpick_orders', INITIAL_ORDERS);
  const [settings, setSettings] = useLocalStorage<GlobalSettings>('gpick_settings', INITIAL_SETTINGS);

  // Ensure Stock Customer Exists (in case local storage is old)
  useEffect(() => {
    if (!customers.find(c => c.isStock)) {
       setCustomers(prev => [{ id: 'stock-001', lineName: '📦 庫存/現貨區', nickname: 'Stock', isStock: true, isBlacklisted: false }, ...prev]);
    }
  }, [customers, setCustomers]);

  // Handlers
  const handleAddProduct = (newProduct: Product) => {
    setProducts(prev => [...prev, newProduct]);
  };

  const handleUpdateProduct = (updatedProduct: Product) => {
    setProducts(prev => prev.map(p => p.id === updatedProduct.id ? updatedProduct : p));
  };

  const handleDeleteProduct = (productId: string) => {
    if (window.confirm('確定要刪除此商品嗎？相關訂單可能會有影響。')) {
      setProducts(prev => prev.filter(p => p.id !== productId));
    }
  };

  const handleAddOrder = (newOrder: Order, newCustomer?: Customer) => {
    if (newCustomer) {
      setCustomers(prev => [...prev, newCustomer]);
    }
    setOrders(prev => [...prev, newOrder]);
  };

  const handleUpdateOrder = (updatedOrder: Order) => {
    setOrders(prev => prev.map(o => o.id === updatedOrder.id ? updatedOrder : o));
  };

  const handleDeleteOrder = (orderId: string) => {
      setOrders(prev => prev.filter(o => o.id !== orderId));
  };

  const handleUpdateCustomer = (updatedCustomer: Customer) => {
    setCustomers(prev => prev.map(c => c.id === updatedCustomer.id ? updatedCustomer : c));
  };

  const handleDeleteCustomer = (customerId: string) => {
      if(window.confirm('確定要刪除此顧客資料嗎？此操作無法復原。')) {
          setCustomers(prev => prev.filter(c => c.id !== customerId));
      }
  };

  // Archive all current orders (EXCEPT STOCK) to start a new trip
  const handleArchiveOrders = () => {
    const stockCustomerId = customers.find(c => c.isStock)?.id;
    
    setOrders(prev => prev.map(o => {
      // If the order belongs to stock, DO NOT archive it. It persists to next session.
      if (o.customerId === stockCustomerId) {
        return o;
      }
      return { ...o, isArchived: true };
    }));
    alert('已成功封存舊訂單！現貨庫存已保留至新連線。');
  };

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

    const csvContent = "\uFEFF" + [headers.join(','), ...rows].join('\n'); // Add BOM for Excel
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `GPick_Export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- Data Backup & Restore Functions ---
  const exportBackupJSON = () => {
    const backupData = {
      products,
      customers,
      orders,
      settings,
      timestamp: Date.now(),
      version: '1.0'
    };
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `GPick_Backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const importBackupJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        
        // Basic Validation
        if (data.products && data.customers && data.orders) {
           if(window.confirm('【警告】確定要還原此備份檔嗎？\n\n目前的資料將被「完全覆蓋」，此操作無法復原！')) {
               setProducts(data.products);
               setCustomers(data.customers);
               setOrders(data.orders);
               if(data.settings) setSettings(data.settings);
               alert('資料還原成功！系統已更新。');
           }
        } else {
           alert('錯誤：這不是有效的 GPick 備份檔案。');
        }
      } catch (err) {
        alert('讀取檔案失敗：檔案可能已損毀。');
        console.error(err);
      }
    };
    reader.readAsText(file);
    // Reset input so same file can be selected again
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

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col md:flex-row font-sans text-stone-800">
      {/* Mobile Header */}
      <div className="md:hidden bg-white p-4 flex justify-between items-center shadow-sm z-30 sticky top-0">
        <h1 className="text-xl font-bold text-blue-600">GPick 賺錢工具</h1>
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
            <h1 className="text-2xl font-bold text-blue-600">GPick</h1>
            <p className="text-xs text-stone-400 mt-1">日貨連線賺錢工具</p>
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
            <Dashboard products={products} orders={orders} customers={customers} settings={settings} />
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
              onSave={setSettings} 
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

export default App;