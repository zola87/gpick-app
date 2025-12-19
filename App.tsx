
import React, { useState, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import { LayoutDashboard, Radio, ShoppingBag, Receipt, Menu, X, Users, Settings as SettingsIcon, Package, ClipboardList, CloudLightning, AlertTriangle, RefreshCw } from 'lucide-react';
import { Dashboard } from './components/Dashboard';
import { LiveSession } from './components/LiveSession';
import { ShoppingList } from './components/ShoppingList';
import { Billing } from './components/Billing';
import { CRM } from './components/CRM';
import { Settings } from './components/Settings';
import { Inventory } from './components/Inventory';
import { TodoList } from './components/TodoList';
import { Product, Order, Customer, GlobalSettings, TodoItem, SalesReport } from './types';
import * as fbService from './services/firebaseService';

const safeId = () => Math.random().toString(36).substring(2, 10);

const INITIAL_PRODUCTS: Product[] = [
  { id: safeId(), name: 'EVE 止痛藥 (白盒)', variants: [], priceJPY: 698, priceTWD: 250, category: '藥妝', brand: 'SS製藥', createdAt: Date.now(), imageUrl: 'https://picsum.photos/200?random=1' },
];

const INITIAL_CUSTOMERS: Customer[] = [
  { id: 'stock-001', lineName: '📦 庫存/現貨區', nickname: 'Stock', isStock: true, isBlacklisted: false },
  { id: safeId(), lineName: 'Amy Chen', nickname: 'Amy', note: 'VIP', isBlacklisted: false, totalSpent: 0, sessionCount: 0 },
  { id: safeId(), lineName: 'Jason Wang', nickname: 'Jason', isBlacklisted: false, totalSpent: 0, sessionCount: 0 },
];

const INITIAL_ORDERS: Order[] = [
  { id: safeId(), productId: INITIAL_PRODUCTS[0].id, customerId: INITIAL_CUSTOMERS[1].id, quantity: 2, quantityBought: 0, status: 'PENDING', notificationStatus: 'UNNOTIFIED', isArchived: false, timestamp: Date.now() },
];

// Fixed: Escaped the dollar sign in template strings to prevent it being interpreted as an interpolation start sequence (e.g., ${...})
const DEFAULT_BILLING_TEMPLATE = `【{{sessionName}} 連線對帳單】
{{name}} 哈囉🤎🤎
這是您本次連線購買的商品明細：

{{items}}

商品小計：\${{subtotal}}

確認金額和品項都沒問題就可以進行匯款囉♡

୨୧┈┈┈┈┈┈┈┈┈┈┈┈┈୨୧

🎁 連線優惠
・滿 $2,500 贈小禮物
・滿 $3,000 免運一次（匯款金額已折抵 $38）

💰 匯款金額｜\${{remittance}}
取貨時支付：$20+運費$38=共 $58
（賣貨便規定：運費需於買家取貨時支付，並且包裹金額最低$20，故已將此金額 from 匯款金額扣除。）

୨୧┈┈┈┈┈┈┈┈┈┈┈┈┈୨୧

🏦 匯款資訊
ＸＸ銀行（009）
xxxx-xxxx-xxxx

匯款完成後麻煩回傳帳號後五碼，確認後提供賣貨便下單連結💌
有任何問題都可以隨時找我，謝謝你這次的支持꒰՞⸝⸝•̀𖥦•́꒱و ̖́-`;

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
  useCloudSync: false,
  customerLevels: {
      vip: 10000,
      vvip: 30000
  },
  currentAiAnalysis: '',
  sessionName: '12月大阪聖誕'
};

interface ErrorBoundaryProps {
    children?: ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

// Fixed ErrorBoundary by using React.Component with explicit generic types for props and state to fix property 'state' and 'props' not found errors
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  handleEmergencyReset = () => {
      try {
          const stored = localStorage.getItem('gpick_settings');
          const currentSettings = stored ? JSON.parse(stored) : {};
          const resetSettings = {
              ...currentSettings,
              useCloudSync: false,
              firebaseConfig: undefined
          };
          localStorage.setItem('gpick_settings', JSON.stringify(resetSettings));
      } catch (e) {
          console.error("Reset settings failed", e);
      }
      window.location.reload();
  };

  render() {
    // Fixed: Access state via this.state correctly
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-stone-100 p-4">
          <div className="bg-white p-8 rounded-xl shadow-xl max-w-md w-full text-center">
            <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle size={32} />
            </div>
            <h1 className="text-xl font-bold text-stone-800 mb-2">系統發生錯誤</h1>
            <button 
                onClick={this.handleEmergencyReset}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 shadow-md transition-colors"
            >
                <RefreshCw size={18} />
                緊急重設 (切回單機模式)
            </button>
          </div>
        </div>
      );
    }
    // Fixed: Access props via this.props correctly
    return this.props.children;
  }
}

function MainApp() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'live' | 'shopping' | 'billing' | 'crm' | 'settings' | 'inventory' | 'todo'>('live');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const [products, setProducts] = useState<Product[]>(() => JSON.parse(localStorage.getItem('gpick_products') || JSON.stringify(INITIAL_PRODUCTS)));
  const [customers, setCustomers] = useState<Customer[]>(() => JSON.parse(localStorage.getItem('gpick_customers') || JSON.stringify(INITIAL_CUSTOMERS)));
  const [orders, setOrders] = useState<Order[]>(() => JSON.parse(localStorage.getItem('gpick_orders') || JSON.stringify(INITIAL_ORDERS)));
  const [settings, setSettings] = useState<GlobalSettings>(() => JSON.parse(localStorage.getItem('gpick_settings') || JSON.stringify(INITIAL_SETTINGS)));
  const [todos, setTodos] = useState<TodoItem[]>(() => JSON.parse(localStorage.getItem('gpick_todos') || '[]'));
  const [reports, setReports] = useState<SalesReport[]>(() => JSON.parse(localStorage.getItem('gpick_reports') || '[]'));

  const isCloud = settings.useCloudSync && settings.firebaseConfig;

  const safeSave = (key: string, value: any) => {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { console.warn(`LocalStorage Save Failed:`, e); }
  };

  useEffect(() => {
    let unsubProd = () => {};
    let unsubCust = () => {};
    let unsubOrd = () => {};
    let unsubTodo = () => {};
    let unsubReports = () => {};
    let unsubSettings = () => {};

    if (isCloud && settings.firebaseConfig) {
        const connected = fbService.initFirebase(settings.firebaseConfig);
        if (connected) {
            unsubProd = fbService.subscribeToCollection('products', (data) => setProducts(data));
            unsubCust = fbService.subscribeToCollection('customers', (data) => setCustomers(data));
            unsubOrd = fbService.subscribeToCollection('orders', (data) => setOrders(data));
            unsubTodo = fbService.subscribeToCollection('todos', (data) => setTodos(data));
            unsubReports = fbService.subscribeToCollection('reports', (data) => setReports(data));
            unsubSettings = fbService.subscribeToSettings((cloudRules) => {
                setSettings(prev => ({
                    ...prev,
                    ...cloudRules,
                    firebaseConfig: prev.firebaseConfig,
                    useCloudSync: prev.useCloudSync
                }));
            });
        }
    }
    return () => { unsubProd(); unsubCust(); unsubOrd(); unsubTodo(); unsubReports(); unsubSettings(); };
  }, [isCloud, settings.firebaseConfig]);

  useEffect(() => { safeSave('gpick_products', products); }, [products]);
  useEffect(() => { safeSave('gpick_customers', customers); }, [customers]);
  useEffect(() => { safeSave('gpick_orders', orders); }, [orders]);
  useEffect(() => { safeSave('gpick_settings', settings); }, [settings]);
  useEffect(() => { safeSave('gpick_todos', todos); }, [todos]);
  useEffect(() => { safeSave('gpick_reports', reports); }, [reports]);

  useEffect(() => {
    const hasStock = customers.some(c => c.isStock);
    if (!hasStock) {
        const stockUser: Customer = { id: 'stock-001', lineName: '📦 庫存/現貨區', nickname: 'Stock', isStock: true, isBlacklisted: false };
        if(isCloud) fbService.addDocument('customers', stockUser);
        else setCustomers(prev => [stockUser, ...prev]);
    }
  }, [customers, isCloud]);

  const handleSaveSettings = (newSettings: GlobalSettings) => {
      setSettings(newSettings);
      if (newSettings.useCloudSync && newSettings.firebaseConfig) {
           fbService.initFirebase(newSettings.firebaseConfig);
           fbService.saveSettingsToCloud(newSettings);
      }
  };

  const handleAddProduct = (newProduct: Product) => {
    if (isCloud) fbService.addDocument('products', newProduct);
    else setProducts(prev => [...prev, newProduct]);
  };

  const handleUpdateProduct = (updatedProduct: Product) => {
    if (isCloud) fbService.updateDocument('products', updatedProduct);
    else setProducts(prev => prev.map(p => p.id === updatedProduct.id ? updatedProduct : p));
  };

  const handleDeleteProduct = (productId: string) => {
    if (window.confirm('確定要刪除此商品嗎？')) {
      if (isCloud) fbService.deleteDocument('products', productId);
      else setProducts(prev => prev.filter(p => p.id !== productId));
    }
  };

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
    if (isCloud) updatedOrders.forEach(o => fbService.updateDocument('orders', o));
    else setOrders(prev => {
        const updatesMap = new Map(updatedOrders.map(o => [o.id, o]));
        return prev.map(o => updatesMap.has(o.id) ? updatesMap.get(o.id)! : o);
    });
  };
  
  const handleDeleteOrder = (orderId: string) => {
      if (isCloud) fbService.deleteDocument('orders', orderId);
      else setOrders(prev => prev.filter(o => o.id !== orderId));
  }

  const handleAddCustomer = (newCustomer: Customer) => {
      if (isCloud) fbService.addDocument('customers', newCustomer);
      else setCustomers(prev => [...prev, newCustomer]);
  };

  const handleUpdateCustomer = (updatedCustomer: Customer) => {
    if (isCloud) fbService.updateDocument('customers', updatedCustomer);
    else setCustomers(prev => prev.map(c => c.id === updatedCustomer.id ? updatedCustomer : c));
  };
  
  const handleDeleteCustomer = (customerId: string) => {
      if (isCloud) {
          fbService.deleteDocument('customers', customerId);
          orders.filter(o => o.customerId === customerId).forEach(o => fbService.deleteDocument('orders', o.id));
      } else {
          setCustomers(prev => prev.filter(c => c.id !== customerId));
          setOrders(prev => prev.filter(o => o.customerId !== customerId));
      }
  };

  const handleArchiveOrders = () => {
    const stockCustomerId = customers.find(c => c.isStock)?.id;
    const activeOrders = orders.filter(o => !o.isArchived && o.customerId !== stockCustomerId);
    
    if (activeOrders.length === 0) {
        alert("沒有可封存的訂單。");
        return;
    }

    const sessionStats = new Map<string, number>(); 
    let sessionRevenue = 0;
    let sessionCost = 0;
    
    activeOrders.forEach(o => {
        const p = products.find(prod => prod.id === o.productId);
        if(p) {
            const revenue = p.priceTWD * o.quantityBought;
            const cost = p.priceJPY * settings.jpyExchangeRate * o.quantityBought;
            sessionStats.set(o.customerId, (sessionStats.get(o.customerId) || 0) + revenue);
            sessionRevenue += revenue;
            sessionCost += cost;
        }
    });

    const sessionName = settings.sessionName || new Date().toISOString().split('T')[0];
    const newReport: SalesReport = {
        id: safeId(),
        date: new Date().toISOString().split('T')[0],
        name: sessionName,
        totalRevenue: sessionRevenue,
        totalProfit: sessionRevenue - sessionCost,
        totalItems: activeOrders.reduce((sum, o) => sum + o.quantityBought, 0),
        exchangeRate: settings.jpyExchangeRate,
        aiAnalysis: settings.currentAiAnalysis || '',
        timestamp: Date.now()
    };

    if (isCloud) {
        fbService.addDocument('reports', newReport);
        sessionStats.forEach((spent, custId) => {
            const cust = customers.find(c => c.id === custId);
            if(cust) {
                fbService.updateDocument('customers', { id: custId, totalSpent: (cust.totalSpent || 0) + spent, sessionCount: (cust.sessionCount || 0) + 1 });
            }
        });
        activeOrders.forEach(o => fbService.updateDocument('orders', { ...o, isArchived: true }));
        fbService.saveSettingsToCloud({ ...settings, currentAiAnalysis: '' });
    } else {
        setReports(prev => [newReport, ...prev]);
        setCustomers(prev => prev.map(c => sessionStats.has(c.id) ? { ...c, totalSpent: (c.totalSpent || 0) + sessionStats.get(c.id)!, sessionCount: (c.sessionCount || 0) + 1 } : c));
        setOrders(prev => prev.map(o => (o.customerId === stockCustomerId || o.isArchived) ? o : { ...o, isArchived: true }));
        setSettings(prev => ({ ...prev, currentAiAnalysis: '' }));
    }
    alert('✅ 連線已結算並封存！');
  };

  const handleAddTodo = async (item: TodoItem) => {
      if(isCloud) await fbService.addDocument('todos', item);
      else setTodos(prev => [item, ...prev]);
  };
  
  const handleToggleTodo = async (id: string) => {
      const item = todos.find(t => t.id === id);
      if(item) {
          const newItem = { ...item, isCompleted: !item.isCompleted };
          if(isCloud) await fbService.updateDocument('todos', newItem);
          else setTodos(prev => prev.map(t => t.id === id ? newItem : t));
      }
  };
  
  const handleDeleteTodo = async (id: string) => {
      if(isCloud) await fbService.deleteDocument('todos', id);
      else setTodos(prev => prev.filter(t => t.id !== id));
  };

  const handleImportData = (data: any) => {
      if(isCloud) return alert("雲端模式下請勿使用本機還原。");
      if (data.products) setProducts(JSON.parse(data.products));
      if (data.customers) setCustomers(JSON.parse(data.customers));
      if (data.orders) setOrders(JSON.parse(data.orders));
      if (data.settings) setSettings(JSON.parse(data.settings));
      if (data.todos) setTodos(JSON.parse(data.todos));
      if (data.reports) setReports(JSON.parse(data.reports));
      alert("資料還原成功！");
  };

  const exportToCSV = () => {
    const activeOrders = orders.filter(o => !o.isArchived);
    if (activeOrders.length === 0) return alert("目前沒有訂單可匯出。");
    const headers = ["顧客", "商品", "數量", "售價", "總計", "付款狀態"];
    const rows = activeOrders.map(o => {
      const c = customers.find(cust => cust.id === o.customerId);
      const p = products.find(prod => prod.id === o.productId);
      return [c?.lineName, p?.name, o.quantityBought, p?.priceTWD, (p?.priceTWD || 0) * o.quantityBought, o.isPaid ? '已付' : '未付'].map(f => `"${f}"`).join(',');
    });
    const csvContent = "\uFEFF" + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `GPick_Export_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const NavItem = ({ id, label, icon: Icon }: { id: typeof activeTab, label: string, icon: any }) => (
    <button
      onClick={() => { setActiveTab(id); setIsMobileMenuOpen(false); }}
      className={`flex items-center space-x-3 w-full px-4 py-3 rounded-lg transition-colors ${activeTab === id ? 'bg-blue-600 text-white shadow-md' : 'text-stone-600 hover:bg-blue-50 hover:text-blue-700'}`}
    >
      <Icon size={20} />
      <span className="font-medium">{label}</span>
    </button>
  );

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col md:flex-row font-sans text-stone-800">
      <div className={`md:hidden p-4 flex justify-between items-center shadow-sm z-30 sticky top-0 transition-colors ${isCloud ? 'bg-green-50 text-green-800' : 'bg-white text-blue-600'}`}>
        <h1 className="text-xl font-bold">GPick 賺錢工具</h1>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}> {isMobileMenuOpen ? <X /> : <Menu />} </button>
      </div>

      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-stone-200 transform transition-transform duration-200 ease-in-out md:translate-x-0 md:static md:h-screen flex flex-col shadow-2xl md:shadow-none ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 border-b border-stone-100">
          <h1 className="text-2xl font-bold text-blue-600">GPick {isCloud && <CloudLightning size={20} className="inline text-green-500"/>}</h1>
        </div>
        <nav className="px-4 space-y-2 mt-4 flex-1 overflow-y-auto">
          <NavItem id="live" label="現場連線" icon={Radio} />
          <NavItem id="shopping" label="採購清單" icon={ShoppingBag} />
          <NavItem id="inventory" label="貨物管理" icon={Package} />
          <NavItem id="billing" label="對帳結單" icon={Receipt} />
          <NavItem id="crm" label="顧客管理" icon={Users} />
          <NavItem id="todo" label="待辦筆記" icon={ClipboardList} />
          <NavItem id="dashboard" label="營運總覽" icon={LayoutDashboard} />
          <div className="pt-4 border-t border-stone-100 mt-4"><NavItem id="settings" label="系統設定" icon={SettingsIcon} /></div>
        </nav>
      </aside>

      <main className="flex-1 p-4 md:p-8 overflow-y-auto min-h-full bg-stone-50 z-0">
        <div className="max-w-7xl mx-auto min-h-full pb-20 md:pb-0">
          {activeTab === 'dashboard' && <Dashboard products={products} orders={orders} customers={customers} settings={settings} reports={reports} onUpdateSettings={handleSaveSettings} />}
          {activeTab === 'crm' && <CRM customers={customers} orders={orders} products={products} settings={settings} onUpdateCustomer={handleUpdateCustomer} onDeleteCustomer={handleDeleteCustomer} onAddCustomer={handleAddCustomer} onUpdateOrder={handleUpdateOrder} onDeleteOrder={handleDeleteOrder} />}
          {activeTab === 'live' && <LiveSession products={products} customers={customers} settings={settings} onAddProduct={handleAddProduct} onUpdateProduct={handleUpdateProduct} onDeleteProduct={handleDeleteProduct} onAddOrder={handleAddOrder} />}
          {activeTab === 'shopping' && <ShoppingList products={products} orders={orders} customers={customers} onUpdateOrder={handleUpdateOrder} />}
          {activeTab === 'billing' && <Billing products={products} customers={customers} orders={orders} settings={settings} onUpdateOrder={handleUpdateOrder} />}
          {activeTab === 'inventory' && <Inventory products={products} orders={orders} customers={customers} onUpdateOrder={handleUpdateOrder} onBulkUpdateOrders={handleBulkUpdateOrders} onAddOrder={handleAddOrder} onDeleteOrder={handleDeleteOrder} />}
          {activeTab === 'todo' && <TodoList todos={todos} onAddTodo={handleAddTodo} onToggleTodo={handleToggleTodo} onDeleteTodo={handleDeleteTodo} />}
          {activeTab === 'settings' && <Settings settings={settings} onSave={handleSaveSettings} onArchive={handleArchiveOrders} onExport={exportToCSV} onImportData={handleImportData} currentData={{ products, customers, orders, todos }} />}
        </div>
      </main>
      {isMobileMenuOpen && <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setIsMobileMenuOpen(false)} />}
    </div>
  );
}

export default function App() { return ( <ErrorBoundary> <MainApp /> </ErrorBoundary> ); }
