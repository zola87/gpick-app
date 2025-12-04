import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Radio, ShoppingBag, Receipt, Menu, X, Users, Settings as SettingsIcon, Package, ClipboardList, CloudLightning } from 'lucide-react';
import { Dashboard } from './components/Dashboard';
import { LiveSession } from './components/LiveSession';
import { ShoppingList } from './components/ShoppingList';
import { Billing } from './components/Billing';
import { CRM } from './components/CRM';
import { Settings } from './components/Settings';
import { Inventory } from './components/Inventory';
import { TodoList } from './components/TodoList';
import { Product, Order, Customer, GlobalSettings, TodoItem } from './types';
import * as fbService from './services/firebaseService';

// Safe ID generator for Init Data
const safeId = () => Math.random().toString(36).substring(2, 10);

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
  billingMessageTemplate: DEFAULT_BILLING_TEMPLATE,
  geminiApiKey: '',
  useCloudSync: false
};

function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'live' | 'shopping' | 'billing' | 'crm' | 'settings' | 'inventory' | 'todo'>('live');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // --- STATE MANAGEMENT ---
  // Lazy init from localStorage for initial render or offline mode
  const [products, setProducts] = useState<Product[]>(() => JSON.parse(localStorage.getItem('gpick_products') || JSON.stringify(INITIAL_PRODUCTS)));
  const [customers, setCustomers] = useState<Customer[]>(() => JSON.parse(localStorage.getItem('gpick_customers') || JSON.stringify(INITIAL_CUSTOMERS)));
  const [orders, setOrders] = useState<Order[]>(() => JSON.parse(localStorage.getItem('gpick_orders') || JSON.stringify(INITIAL_ORDERS)));
  const [settings, setSettings] = useState<GlobalSettings>(() => JSON.parse(localStorage.getItem('gpick_settings') || JSON.stringify(INITIAL_SETTINGS)));
  const [todos, setTodos] = useState<TodoItem[]>(() => JSON.parse(localStorage.getItem('gpick_todos') || '[]'));

  // Cloud Mode Flag
  const isCloud = settings.useCloudSync && settings.firebaseConfig;

  // --- EFFECT: CLOUD SYNC ---
  useEffect(() => {
    let unsubProd = () => {};
    let unsubCust = () => {};
    let unsubOrd = () => {};
    let unsubTodo = () => {};
    let unsubSettings = () => {};

    if (isCloud && settings.firebaseConfig) {
        // Init Firebase
        const connected = fbService.initFirebase(settings.firebaseConfig);
        
        if (connected) {
            console.log("Starting Cloud Sync Listeners...");
            
            unsubProd = fbService.subscribeToCollection('products', (data) => setProducts(data));
            unsubCust = fbService.subscribeToCollection('customers', (data) => setCustomers(data));
            unsubOrd = fbService.subscribeToCollection('orders', (data) => setOrders(data));
            unsubTodo = fbService.subscribeToCollection('todos', (data) => setTodos(data));
            
            // Sync Global Settings Rules (but keep local config)
            unsubSettings = fbService.subscribeToSettings((cloudRules) => {
                setSettings(prev => ({
                    ...prev,
                    ...cloudRules,
                    // IMPORTANT: Persist the local connection config, don't let cloud overwrite it with empty
                    firebaseConfig: prev.firebaseConfig,
                    useCloudSync: prev.useCloudSync,
                    geminiApiKey: prev.geminiApiKey // User's local key preference
                }));
            });
        }
    }

    return () => {
        unsubProd();
        unsubCust();
        unsubOrd();
        unsubTodo();
        unsubSettings();
    };
  }, [isCloud, settings.firebaseConfig]); // Re-run if cloud mode toggled or config changed

  // --- EFFECT: LOCAL STORAGE SYNC (Fallback & Cache) ---
  // Always save to local storage as backup/cache, even in cloud mode
  useEffect(() => { localStorage.setItem('gpick_products', JSON.stringify(products)); }, [products]);
  useEffect(() => { localStorage.setItem('gpick_customers', JSON.stringify(customers)); }, [customers]);
  useEffect(() => { localStorage.setItem('gpick_orders', JSON.stringify(orders)); }, [orders]);
  useEffect(() => { localStorage.setItem('gpick_settings', JSON.stringify(settings)); }, [settings]);
  useEffect(() => { localStorage.setItem('gpick_todos', JSON.stringify(todos)); }, [todos]);

  // Ensure "Stock" customer always exists
  useEffect(() => {
    // Check if Stock user exists. If not, create it immediately.
    // Removed customers.length > 0 check to prevent bugs when list is empty.
    const hasStock = customers.some(c => c.isStock);
    if (!hasStock) {
        const stockUser: Customer = { 
            id: 'stock-001', 
            lineName: '📦 庫存/現貨區', 
            nickname: 'Stock', 
            isStock: true, 
            isBlacklisted: false 
        };
        // Add directly via handler to ensure cloud sync works
        if(isCloud) fbService.addDocument('customers', stockUser);
        else setCustomers(prev => [stockUser, ...prev]);
    }
  }, [customers, isCloud]);

  // --- HANDLERS (Hybrid: Cloud or Local) ---

  // SETTINGS Handler
  const handleSaveSettings = (newSettings: GlobalSettings) => {
      // 1. Update Local State immediately (for UI responsiveness)
      setSettings(newSettings);
      
      // 2. If Cloud Mode is active (or becoming active), save business rules to cloud
      if (newSettings.useCloudSync && newSettings.firebaseConfig) {
           fbService.initFirebase(newSettings.firebaseConfig);
           fbService.saveSettingsToCloud(newSettings);
      }
  };

  // PRODUCT Handlers
  const handleAddProduct = (newProduct: Product) => {
    if (isCloud) fbService.addDocument('products', newProduct);
    else setProducts(prev => [...prev, newProduct]);
  };

  const handleUpdateProduct = (updatedProduct: Product) => {
    if (isCloud) fbService.updateDocument('products', updatedProduct);
    else setProducts(prev => prev.map(p => p.id === updatedProduct.id ? updatedProduct : p));
  };

  const handleDeleteProduct = (productId: string) => {
    if (window.confirm('確定要刪除此商品嗎？相關訂單可能會有影響。')) {
      if (isCloud) fbService.deleteDocument('products', productId);
      else setProducts(prev => prev.filter(p => p.id !== productId));
    }
  };

  // ORDER Handlers
  const handleAddOrder = (newOrder: Order, newCustomer?: Customer) => {
    if (isCloud) {
        if(newCustomer) fbService.addDocument('customers', newCustomer);
        fbService.addDocument('orders', newOrder);
    } else {
        if (newCustomer) setCustomers(prev => [...prev, newCustomer]);
        setOrders(prev => [...prev, newOrder]);
    }
  };

  const handleUpdateOrder = (updatedOrder: Order) => {
    if (isCloud) fbService.updateDocument('orders', updatedOrder);
    else setOrders(prev => prev.map(o => o.id === updatedOrder.id ? updatedOrder : o));
  };

  const handleBulkUpdateOrders = (updatedOrders: Order[]) => {
    if (isCloud) {
        updatedOrders.forEach(o => fbService.updateDocument('orders', o));
    } else {
        setOrders(prev => {
            const updatesMap = new Map(updatedOrders.map(o => [o.id, o]));
            return prev.map(o => updatesMap.has(o.id) ? updatesMap.get(o.id)! : o);
        });
    }
  };
  
  const handleDeleteOrder = (orderId: string) => {
      if (isCloud) fbService.deleteDocument('orders', orderId);
      else setOrders(prev => prev.filter(o => o.id !== orderId));
  }

  // CUSTOMER Handlers
  const handleUpdateCustomer = (updatedCustomer: Customer) => {
    if (isCloud) fbService.updateDocument('customers', updatedCustomer);
    else setCustomers(prev => prev.map(c => c.id === updatedCustomer.id ? updatedCustomer : c));
  };
  
  const handleDeleteCustomer = (customerId: string) => {
      if (isCloud) {
          fbService.deleteDocument('customers', customerId);
          // Find and delete related orders
          orders.filter(o => o.customerId === customerId).forEach(o => {
              fbService.deleteDocument('orders', o.id);
          });
      } else {
          setCustomers(prev => prev.filter(c => c.id !== customerId));
          setOrders(prev => prev.filter(o => o.customerId !== customerId));
      }
      alert('已刪除顧客及其所有關聯訂單。');
  };

  // ARCHIVE Handler
  const handleArchiveOrders = () => {
    const stockCustomerId = customers.find(c => c.isStock)?.id;
    
    // Logic: Update isArchived = true for all orders except stock
    const ordersToArchive = orders.filter(o => !o.isArchived && o.customerId !== stockCustomerId);
    
    if (isCloud) {
        ordersToArchive.forEach(o => {
            fbService.updateDocument('orders', { ...o, isArchived: true });
        });
    } else {
        setOrders(prev => prev.map(o => {
            if (o.customerId === stockCustomerId) return o;
            return { ...o, isArchived: true };
        }));
    }
    alert('已成功封存舊訂單！現貨庫存已保留至新連線。');
  };

  // TODO Handlers
  const handleAddTodo = (item: TodoItem) => {
      if(isCloud) fbService.addDocument('todos', item);
      else setTodos(prev => [item, ...prev]);
  };
  const handleToggleTodo = (id: string) => {
      const item = todos.find(t => t.id === id);
      if(item) {
          const newItem = { ...item, isCompleted: !item.isCompleted };
          if(isCloud) fbService.updateDocument('todos', newItem);
          else setTodos(prev => prev.map(t => t.id === id ? newItem : t));
      }
  };
  const handleDeleteTodo = (id: string) => {
      if(isCloud) fbService.deleteDocument('todos', id);
      else setTodos(prev => prev.filter(t => t.id !== id));
  };

  // DATA IMPORT (Legacy Manual Restore)
  const handleImportData = (data: any) => {
      // Import is treated as Local Restore only. Use migration button to sync to cloud.
      if(isCloud) {
          alert("雲端模式下請勿使用本機還原。若要上傳舊資料，請在設定頁面使用「上傳至雲端」功能。");
          return;
      }
      if (data.products) setProducts(JSON.parse(data.products));
      if (data.customers) setCustomers(JSON.parse(data.customers));
      if (data.orders) setOrders(JSON.parse(data.orders));
      if (data.settings) setSettings(JSON.parse(data.settings));
      if (data.todos) setTodos(JSON.parse(data.todos));
      alert("資料還原成功 (單機模式)！");
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
      <div className={`md:hidden p-4 flex justify-between items-center shadow-sm z-30 sticky top-0 transition-colors ${isCloud ? 'bg-green-50 text-green-800' : 'bg-white text-blue-600'}`}>
        <h1 className="text-xl font-bold flex items-center gap-2">
            GPick 賺錢工具
            {isCloud && <CloudLightning size={16} className="text-green-500 animate-pulse"/>}
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
            <h1 className="text-2xl font-bold text-blue-600 flex items-center gap-1">
                GPick 
                {isCloud && (
                    <span title="雲端同步中">
                        <CloudLightning size={20} className="text-green-500"/>
                    </span>
                )}
            </h1>
            
            {/* Status Indicator */}
            <div className="flex items-center gap-2 mt-1">
                {isCloud ? (
                    <>
                        <span className="relative flex h-2.5 w-2.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                        </span>
                        <span className="text-xs text-green-600 font-bold">雲端即時同步中</span>
                    </>
                ) : (
                    <>
                        <span className="h-2.5 w-2.5 rounded-full bg-stone-300"></span>
                        <span className="text-xs text-stone-400">單機模式 (Local)</span>
                    </>
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
          <NavItem id="todo" label="待辦筆記" icon={ClipboardList} />
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
              onBulkUpdateOrders={handleBulkUpdateOrders}
              onAddOrder={handleAddOrder}
              onDeleteOrder={handleDeleteOrder}
            />
          )}
          {activeTab === 'todo' && (
            <TodoList 
              todos={todos}
              onAddTodo={handleAddTodo}
              onToggleTodo={handleToggleTodo}
              onDeleteTodo={handleDeleteTodo}
            />
          )}
          {activeTab === 'settings' && (
            <Settings 
                settings={settings} 
                onSave={handleSaveSettings} 
                onArchive={handleArchiveOrders} 
                onExport={exportToCSV}
                onImportData={handleImportData}
                currentData={{ products, customers, orders, todos }}
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