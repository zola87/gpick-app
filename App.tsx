import React, { useState, useEffect, Component, ErrorInfo, ReactNode, lazy, Suspense } from 'react';
import { LayoutDashboard, Radio, ShoppingBag, Receipt, Menu, X, Users, Settings as SettingsIcon, Package, ClipboardList, CloudLightning, AlertTriangle, CheckCircle, RefreshCw, LogIn, LogOut } from 'lucide-react';
import { CustomerPage } from './components/CustomerPage';

// Lazy-load heavy tab components — initial bundle drops from 1.2MB to ~200KB
const Dashboard  = lazy(() => import('./components/Dashboard').then(m => ({ default: m.Dashboard })));
const LiveSession= lazy(() => import('./components/LiveSession').then(m => ({ default: m.LiveSession })));
const ShoppingList=lazy(() => import('./components/ShoppingList').then(m => ({ default: m.ShoppingList })));
const Billing    = lazy(() => import('./components/Billing').then(m => ({ default: m.Billing })));
const CRM        = lazy(() => import('./components/CRM').then(m => ({ default: m.CRM })));
const Settings   = lazy(() => import('./components/Settings').then(m => ({ default: m.Settings })));
const Inventory  = lazy(() => import('./components/Inventory').then(m => ({ default: m.Inventory })));
const TodoList   = lazy(() => import('./components/TodoList').then(m => ({ default: m.TodoList })));

function TabLoadingFallback() {
  return (
    <div className="animate-pulse space-y-5 pt-2">
      <div className="h-7 bg-[#E5DFD9] rounded-xl w-44" />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {[1,2,3,4,5,6].map(i => (
          <div key={i} className="h-44 bg-[#E5DFD9] rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
import { Product, Order, Customer, GlobalSettings, TodoItem, SalesReport } from './types';
import type { User } from 'firebase/auth';
import * as fbService from './services/firebaseService';
import { analyzeSalesData } from './services/geminiService';

const safeId = () => crypto.randomUUID();

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
  productCategories: ['藥妝', '零食', '服飾', '雜貨', '伴手禮', '限定商品', '扭蛋'],
  billingMessageTemplate: DEFAULT_BILLING_TEMPLATE,
  useCloudSync: false,
  customerLevels: { vip: 10000, vvip: 30000 },
  currentAiAnalysis: '',
  sessionName: '12月大阪聖誕',
  gachaPricingRules: [
    { jpy: 200, twd: 80 },
    { jpy: 300, twd: 100 },
    { jpy: 400, twd: 130 },
    { jpy: 500, twd: 160 },
    { jpy: 600, twd: 190 },
    { jpy: 700, twd: 220 },
    { jpy: 800, twd: 250 },
    { jpy: 1000, twd: 310 },
  ]
};

interface ErrorBoundaryProps { children?: ReactNode; }
interface ErrorBoundaryState { hasError: boolean; error: Error | null; }

// Fix: Use Component directly to fix property 'state' and 'props' not found errors in TypeScript
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error): ErrorBoundaryState { return { hasError: true, error }; }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) { console.error("Uncaught error:", error, errorInfo); }
  handleEmergencyReset = () => {
      try {
          const stored = localStorage.getItem('gpick_settings');
          const currentSettings = stored ? JSON.parse(stored) : {};
          const resetSettings = { ...currentSettings, useCloudSync: false, firebaseConfig: undefined };
          localStorage.setItem('gpick_settings', JSON.stringify(resetSettings));
      } catch (e) { console.error("Reset settings failed", e); }
      window.location.reload();
  };
  render() {
    // Access this.state safely within render
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#EDE8E3] p-4">
          <div className="bg-[#FAF8F5] p-8 rounded-2xl shadow-xl shadow-black/10 max-w-md w-full text-center">
            <div className="w-14 h-14 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-4"><AlertTriangle size={26} /></div>
            <h1 className="text-lg font-semibold text-[#2C2926] mb-1">系統發生錯誤</h1>
            <p className="text-sm text-[#8A8278] mb-5">請嘗試重設以切回單機模式</p>
            <button onClick={this.handleEmergencyReset} className="w-full bg-[#3F4550] hover:bg-[#2F3540] text-white font-medium py-3 rounded-xl flex items-center justify-center gap-2 transition-colors text-sm"><RefreshCw size={16} />緊急重設 (切回單機模式)</button>
          </div>
        </div>
      );
    }
    // Access this.props.children safely
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

  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  const ALLOWED_EMAILS = ['19980531mg@gmail.com', 'forpin1014@gmail.com'];
  const isAuthorized = user && ALLOWED_EMAILS.includes(user.email);
  const isCloud = isAuthorized; // Automatically use cloud if authorized

  const safeSave = (key: string, value: any) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { console.warn(`LocalStorage Save Failed:`, e); } };

  useEffect(() => {
    const unsubscribe = fbService.subscribeToAuth((currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let unsubProd = () => {};
    let unsubCust = () => {};
    let unsubOrd = () => {};
    let unsubTodo = () => {};
    let unsubReports = () => {};
    let unsubSettings = () => {};
    if (isCloud && isAuthReady) {
        const connected = fbService.initFirebase();
        if (connected) {
            unsubProd = fbService.subscribeToCollection('products', (data) => setProducts(data));
            unsubCust = fbService.subscribeToCollection('customers', (data) => setCustomers(data));
            unsubOrd = fbService.subscribeToActiveOrders((data) => setOrders(data));
            unsubTodo = fbService.subscribeToCollection('todos', (data) => setTodos(data));
            unsubReports = fbService.subscribeToCollection('reports', (data) => setReports(data));
            unsubSettings = fbService.subscribeToSettings((cloudRules) => { setSettings(prev => ({ ...prev, ...cloudRules })); });
        }
    }
    return () => { unsubProd(); unsubCust(); unsubOrd(); unsubTodo(); unsubReports(); unsubSettings(); };
  }, [isCloud, isAuthReady]);

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

  const handleSaveSettings = async (newSettings: GlobalSettings) => {
      setSettings(newSettings);
      if (isCloud) {
        try {
          await fbService.saveSettingsToCloud(newSettings);
        } catch (e) {
          console.error('Failed to save settings to cloud', e);
        }
      }
  };

  const handleAddProduct = (newProduct: Product) => { if (isCloud) fbService.addDocument('products', newProduct); else setProducts(prev => [...prev, newProduct]); };
  const handleUpdateProduct = (updatedProduct: Product) => { if (isCloud) fbService.updateDocument('products', updatedProduct); else setProducts(prev => prev.map(p => p.id === updatedProduct.id ? updatedProduct : p)); };
  const handleDeleteProduct = (productId: string) => { if (isCloud) fbService.deleteDocument('products', productId); else setProducts(prev => prev.filter(p => p.id !== productId)); };
  const handleAddOrder = (newOrder: Order, newCustomer?: Customer) => { if (isCloud) { if(newCustomer) fbService.addDocument('customers', newCustomer); fbService.addDocument('orders', newOrder); } else { if (newCustomer) setCustomers(prev => [...prev, newCustomer]); setOrders(prev => [...prev, newOrder]); } };
  const handleUpdateOrder = (updatedOrder: Order) => { if (isCloud) fbService.updateDocument('orders', updatedOrder); else setOrders(prev => prev.map(o => o.id === updatedOrder.id ? updatedOrder : o)); };
  const handleBulkUpdateOrders = (updatedOrders: Order[]) => { if (isCloud) fbService.batchUpdateOrders(updatedOrders); else setOrders(prev => { const updatesMap = new Map(updatedOrders.map(o => [o.id, o])); return prev.map(o => updatesMap.has(o.id) ? updatesMap.get(o.id)! : o); }); };
  const handleDeleteOrder = (orderId: string) => { if (isCloud) fbService.deleteDocument('orders', orderId); else setOrders(prev => prev.filter(o => o.id !== orderId)); };
  const handleAddCustomer = (newCustomer: Customer) => { if (isCloud) fbService.addDocument('customers', newCustomer); else setCustomers(prev => [...prev, newCustomer]); };
  const handleUpdateCustomer = (updatedCustomer: Customer) => { if (isCloud) fbService.updateDocument('customers', updatedCustomer); else setCustomers(prev => prev.map(c => c.id === updatedCustomer.id ? updatedCustomer : c)); };
  const handleDeleteCustomer = (customerId: string) => { if (isCloud) { fbService.deleteCustomerWithOrders(customerId); } else { setCustomers(prev => prev.filter(c => c.id !== customerId)); setOrders(prev => prev.filter(o => o.customerId !== customerId)); } };

  const handleArchiveOrders = async () => {
    const stockCustomerId = customers.find(c => c.isStock)?.id;
    const activeOrders = orders.filter(o => !o.isArchived && o.customerId !== stockCustomerId);
    if (activeOrders.length === 0) { showAlert("沒有可封存的訂單。"); return; }
    
    const sessionStats = new Map<string, number>(); 
    let sessionRevenue = 0; let sessionCost = 0;
    
    activeOrders.forEach(o => { 
      const p = products.find(prod => prod.id === o.productId); 
      if(p && o.quantityBought > 0) { 
        const price = (o.variant && p.variantPrices && p.variantPrices[o.variant]) 
          ? p.variantPrices[o.variant] 
          : p.priceTWD;
        const revenue = price * o.quantityBought; 
        const cost = p.priceJPY * settings.jpyExchangeRate * o.quantityBought; 
        sessionStats.set(o.customerId, (sessionStats.get(o.customerId) || 0) + revenue); 
        sessionRevenue += revenue; 
        sessionCost += cost; 
      } 
    });
    
    // Generate AI analysis for this session before archiving
    let sessionAiAnalysis = '';
    try {
      sessionAiAnalysis = await analyzeSalesData(products, activeOrders, customers, settings.geminiApiKey);
    } catch (error) {
      console.error("AI Analysis failed during archive:", error);
    }

    const sessionName = settings.sessionName || new Date().toISOString().split('T')[0];
    const newReport: SalesReport = { 
      id: safeId(), 
      date: new Date().toISOString().split('T')[0], 
      name: sessionName, 
      totalRevenue: sessionRevenue, 
      totalProfit: sessionRevenue - sessionCost, 
      totalItems: activeOrders.reduce((sum, o) => sum + o.quantityBought, 0), 
      exchangeRate: settings.jpyExchangeRate, 
      aiAnalysis: sessionAiAnalysis || settings.currentAiAnalysis || '', 
      timestamp: Date.now() 
    };

    const ordersToUpdate: Order[] = [];
    const ordersToAdd: Order[] = [];

    const archiveStamp = { sessionName, archivedAt: Date.now(), isArchived: true as const };

    activeOrders.forEach(o => {
      if (o.quantityBought === 0) {
        // Not found at all — mark as carried over so customer can choose next session
        ordersToUpdate.push({ ...o, isCarriedOver: true, sessionName });
      } else if (o.quantityBought >= o.quantity) {
        // Fully bought, archive it
        ordersToUpdate.push({ ...o, ...archiveStamp });
      } else {
        // Partially bought
        // 1. Archive the bought part
        ordersToUpdate.push({ ...o, quantity: o.quantityBought, ...archiveStamp });
        // 2. Create a new active order for the unbought part — mark as carried over
        ordersToAdd.push({
          ...o,
          id: safeId(),
          quantity: o.quantity - o.quantityBought,
          quantityBought: 0,
          status: 'PENDING',
          isCarriedOver: true,
          sessionName,
          timestamp: Date.now()
        });
      }
    });

    if (isCloud) {
      const customerUpdates: { id: string; totalSpent: number; sessionCount: number }[] = [];
      sessionStats.forEach((spent, custId) => {
        const cust = customers.find(c => c.id === custId);
        if (cust) customerUpdates.push({
          id: custId,
          totalSpent: (cust.totalSpent || 0) + spent,
          sessionCount: (cust.sessionCount || 0) + 1,
        });
      });
      await fbService.batchArchiveSession(newReport, customerUpdates, ordersToUpdate, ordersToAdd);
      fbService.saveSettingsToCloud({ ...settings, currentAiAnalysis: '' });
    } 
    else { 
      setReports(prev => [newReport, ...prev]); 
      setCustomers(prev => prev.map(c => sessionStats.has(c.id) ? { ...c, totalSpent: (c.totalSpent || 0) + sessionStats.get(c.id)!, sessionCount: (c.sessionCount || 0) + 1 } : c)); 
      
      setOrders(prev => {
        const updatedMap = new Map(ordersToUpdate.map(o => [o.id, o]));
        const newPrev = prev.map(o => updatedMap.has(o.id) ? updatedMap.get(o.id)! : o);
        return [...newPrev, ...ordersToAdd];
      });
      
      setSettings(prev => ({ ...prev, currentAiAnalysis: '' })); 
    }
    showAlert('✅ 連線已結算並封存！未買到的商品已保留至下次連線。');
  };

  const handleAddTodo = async (item: TodoItem) => { if(isCloud) await fbService.addDocument('todos', item); else setTodos(prev => [item, ...prev]); };
  const handleToggleTodo = async (id: string) => { const item = todos.find(t => t.id === id); if(item) { const newItem = { ...item, isCompleted: !item.isCompleted }; if(isCloud) await fbService.updateDocument('todos', newItem); else setTodos(prev => prev.map(t => t.id === id ? newItem : t)); } };
  const handleDeleteTodo = async (id: string) => { if(isCloud) await fbService.deleteDocument('todos', id); else setTodos(prev => prev.filter(t => t.id !== id)); };

  const handleUpdateReport = async (updatedReport: SalesReport) => {
    if (isCloud) {
      await fbService.updateDocument('reports', updatedReport);
    } else {
      setReports(prev => prev.map(r => r.id === updatedReport.id ? updatedReport : r));
    }
  };

  const handleImportData = (data: any) => {
      if(isCloud) return showAlert("雲端模式下請勿使用本機還原。");
      if (data.products) setProducts(JSON.parse(data.products));
      if (data.customers) setCustomers(JSON.parse(data.customers));
      if (data.orders) setOrders(JSON.parse(data.orders));
      if (data.settings) setSettings(JSON.parse(data.settings));
      if (data.todos) setTodos(JSON.parse(data.todos));
      if (data.reports) setReports(JSON.parse(data.reports));
      showAlert("資料還原成功！");
  };

  const handleLogout = async () => {
    try {
      await fbService.logout();
      localStorage.removeItem('gpick_products');
      localStorage.removeItem('gpick_customers');
      localStorage.removeItem('gpick_orders');
      localStorage.removeItem('gpick_settings');
      localStorage.removeItem('gpick_todos');
      localStorage.removeItem('gpick_reports');
      window.location.reload();
    } catch (e) {
      console.error("Logout failed", e);
    }
  };

  const exportToCSV = () => {
    const activeOrders = orders.filter(o => !o.isArchived);
    if (activeOrders.length === 0) return showAlert("目前沒有訂單可匯出。");

    const escapeCSV = (str: string | number) => `"${String(str).replace(/"/g, '""')}"`;

    let totalRevenue = 0;
    let totalCost = 0;
    let totalItems = 0;

    const customerStats = new Map<string, { name: string, lineName: string, items: number, spent: number }>();

    const detailRows = activeOrders.map(o => {
      const p = products.find(prod => prod.id === o.productId);
      const c = customers.find(cust => cust.id === o.customerId);
      
      const bought = o.quantityBought || 0;
      const priceTWD = (o.variant && p?.variantPrices && p.variantPrices[o.variant]) 
        ? p.variantPrices[o.variant] 
        : (p?.priceTWD || 0);
      const costTWD = (p?.priceJPY || 0) * settings.jpyExchangeRate;
      
      const revenue = priceTWD * bought;
      const cost = costTWD * bought;
      const profit = revenue - cost;
      
      if (bought > 0) {
        totalRevenue += revenue;
        totalCost += cost;
        totalItems += bought;

        const custId = o.customerId;
        if (!customerStats.has(custId)) {
          customerStats.set(custId, { 
            name: c?.nickname || c?.realName || c?.lineName || '未知', 
            lineName: c?.lineName || '未知',
            items: 0, 
            spent: 0 
          });
        }
        const stats = customerStats.get(custId)!;
        stats.items += bought;
        stats.spent += revenue;
      }

      return [
        escapeCSV(new Date(o.timestamp).toLocaleDateString()),
        escapeCSV(c?.nickname || c?.realName || c?.lineName || '未知'),
        escapeCSV(p?.name || '未知'),
        escapeCSV(o.variant || '無'),
        o.quantity,
        bought,
        Math.round(costTWD),
        priceTWD,
        revenue,
        Math.round(profit),
        escapeCSV(o.status === 'BOUGHT' ? '已買到' : o.status === 'PENDING' ? '處理中' : o.status)
      ].join(",");
    });

    const totalProfit = totalRevenue - totalCost;
    const margin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(2) : '0.00';

    let csvContent = "=== 營運總結報告 ===\n";
    csvContent += "總營收(TWD),總成本(TWD),總毛利(TWD),整體毛利率,總售出件數\n";
    csvContent += `${Math.round(totalRevenue)},${Math.round(totalCost)},${Math.round(totalProfit)},${margin}%,${totalItems}\n\n`;

    csvContent += "=== 客戶消費總計 ===\n";
    csvContent += "客戶名稱,LINE名稱,買到總件數,總消費金額(TWD)\n";
    Array.from(customerStats.values())
      .sort((a, b) => b.spent - a.spent)
      .forEach(stat => {
        csvContent += `${escapeCSV(stat.name)},${escapeCSV(stat.lineName)},${stat.items},${Math.round(stat.spent)}\n`;
      });
    csvContent += "\n";

    csvContent += "=== 訂單詳細明細 ===\n";
    csvContent += "訂單日期,客戶名稱,商品名稱,規格,喊單數量,買到數量,單件成本(TWD),單件售價(TWD),小計營收(TWD),小計毛利(TWD),訂單狀態\n";
    csvContent += detailRows.join("\n");

    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    const sessionName = settings.sessionName || '未命名連線';
    link.download = `GPick_完整報表_${sessionName}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard products={products} orders={orders} customers={customers} reports={reports} settings={settings} onUpdateSettings={handleSaveSettings} onUpdateReport={handleUpdateReport} />;
      case 'live': return <LiveSession products={products} customers={customers} onAddOrder={handleAddOrder} onAddProduct={handleAddProduct} onUpdateProduct={handleUpdateProduct} onDeleteProduct={handleDeleteProduct} settings={settings} onUpdateSettings={handleSaveSettings} />;
      case 'shopping': return <ShoppingList products={products} orders={orders} customers={customers} settings={settings} onUpdateOrder={handleUpdateOrder} onBulkUpdateOrders={handleBulkUpdateOrders} />;
      case 'billing': return <Billing products={products} orders={orders} customers={customers} settings={settings} onUpdateOrder={handleUpdateOrder} />;
      case 'crm': return <CRM customers={customers} orders={orders} products={products} settings={settings} onUpdateCustomer={handleUpdateCustomer} onDeleteCustomer={handleDeleteCustomer} onAddCustomer={handleAddCustomer} onUpdateOrder={handleUpdateOrder} onDeleteOrder={handleDeleteOrder} />;
      case 'inventory': return <Inventory customers={customers} orders={orders} products={products} onUpdateOrder={handleUpdateOrder} onBulkUpdateOrders={handleBulkUpdateOrders} onAddOrder={handleAddOrder} onDeleteOrder={handleDeleteOrder} onUpdateCustomer={handleUpdateCustomer} />;
      case 'todo': return <TodoList todos={todos} onAddTodo={handleAddTodo} onToggleTodo={handleToggleTodo} onDeleteTodo={handleDeleteTodo} />;
      case 'settings': return <Settings settings={settings} onSave={handleSaveSettings} onArchive={handleArchiveOrders} onExport={exportToCSV} onImportData={handleImportData} currentData={{ products, customers, orders, todos }} />;
      default: return <LiveSession products={products} customers={customers} onAddOrder={handleAddOrder} onAddProduct={handleAddProduct} onUpdateProduct={handleUpdateProduct} onDeleteProduct={handleDeleteProduct} settings={settings} onUpdateSettings={handleSaveSettings} />;
    }
  };

  const navItems = [
    { id: 'live', label: '現場連線', icon: Radio },
    { id: 'shopping', label: '採買清單', icon: ShoppingBag },
    { id: 'billing', label: '對帳清單', icon: Receipt },
    { id: 'crm', label: '客戶管理', icon: Users },
    { id: 'inventory', label: '商品庫存', icon: Package },
    { id: 'dashboard', label: '營運總覽', icon: LayoutDashboard },
    { id: 'todo', label: '待辦事項', icon: ClipboardList },
    { id: 'settings', label: '系統設定', icon: SettingsIcon },
  ];

  return (
    <div className="min-h-screen bg-[#EDE8E3] flex flex-col md:flex-row">
      {/* Sidebar for Desktop */}
      <aside className="hidden md:flex flex-col w-60 bg-[#FAF8F5] border-r border-[#E5DFD9] h-screen sticky top-0">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-[#E5DFD9] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-[#7A9E8A] to-[#5C8070] rounded-xl flex items-center justify-center shadow-lg shadow-[#7A9E8A]/20 shrink-0">
              <CloudLightning size={15} className="text-white" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-[#2C2926] tracking-tight leading-none">GPick</h1>
              <div className="flex items-center gap-1.5 mt-1.5">
                {isCloud ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-[#7A9E8A] inline-block shrink-0"></span>
                    <span className="text-[10px] text-[#5C8070] font-medium leading-none">雲端同步中</span>
                  </>
                ) : (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-[#ADA49C]/60 inline-block shrink-0"></span>
                    <span className="text-[10px] text-[#ADA49C] font-medium leading-none">單機模式</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as any)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === item.id
                  ? 'bg-[#3F4550] text-[#EEF0EC] shadow-sm'
                  : 'text-[#8A8278] hover:bg-[#EDE8E3] hover:text-[#2C2926]'
              }`}
            >
              <item.icon size={15} className={activeTab === item.id ? 'text-[#7A9E8A]' : 'text-[#ADA49C]'} />
              <span>{item.label}</span>
              {activeTab === item.id && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#7A9E8A] shrink-0"></span>
              )}
            </button>
          ))}
        </nav>

        {/* User section */}
        <div className="px-2 py-3 border-t border-[#E5DFD9] shrink-0">
          {user ? (
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-[#EDE8E3] transition-colors group">
              <img
                src={user.photoURL || `https://ui-avatars.com/api/?name=${user.email}&background=e5dfd9&color=5c8070`}
                alt="User Avatar"
                className="w-6 h-6 rounded-full ring-1 ring-[#E5DFD9] shrink-0"
                referrerPolicy="no-referrer"
                loading="lazy"
              />
              <span className="text-xs text-[#8A8278] truncate flex-1">{user.email}</span>
              <button
                onClick={handleLogout}
                className="text-[#ADA49C] hover:text-[#2C2926] transition-colors p-0.5 shrink-0 opacity-0 group-hover:opacity-100"
                title="登出"
              >
                <LogOut size={13} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => fbService.loginWithGoogle()}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-xs bg-[#7A9E8A]/15 text-[#2C2926] hover:bg-[#7A9E8A]/25 font-medium border border-[#7A9E8A]/30"
            >
              <LogIn size={13} /> 管理員登入
            </button>
          )}
        </div>
      </aside>

      {/* Mobile Header */}
      <header className="md:hidden bg-[#EDE8E3]/90 backdrop-blur-xl border-b border-[#7A9E8A]/20 px-4 py-3 flex items-center justify-between sticky top-0 z-50 shadow-sm shadow-[#3F4550]/[0.06]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-gradient-to-br from-[#7A9E8A] to-[#5C8070] rounded-lg flex items-center justify-center shadow-sm shadow-[#7A9E8A]/20 shrink-0">
            <CloudLightning size={13} className="text-white" />
          </div>
          <h1 className="text-base font-semibold text-[#2C2926] tracking-tight">GPick</h1>
          {isCloud ? (
            <span className="flex items-center gap-1 text-[10px] text-[#2C2926] bg-[#7A9E8A]/20 px-2 py-0.5 rounded-full border border-[#7A9E8A]/30 font-medium">
              <span className="w-1 h-1 rounded-full bg-[#7A9E8A] inline-block shrink-0"></span>雲端
            </span>
          ) : (
            <span className="text-[10px] text-[#8A8278] bg-[#E5DFD9] px-2 py-0.5 rounded-full font-medium">單機</span>
          )}
        </div>
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 text-[#2C2926] hover:bg-[#E5DFD9] rounded-xl"
        >
          {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-[#FAF8F5] pt-[53px] flex flex-col overflow-y-auto">
          <nav className="p-3 space-y-0.5 flex-1 overflow-y-auto">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id as any);
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl text-sm font-medium transition-all ${
                  activeTab === item.id
                    ? 'bg-[#3F4550] text-[#EEF0EC] shadow-sm'
                    : 'text-[#8A8278] hover:bg-[#EDE8E3] hover:text-[#2C2926]'
                }`}
              >
                <item.icon size={17} className={activeTab === item.id ? 'text-[#7A9E8A]' : 'text-[#ADA49C]'} />
                {item.label}
                {activeTab === item.id && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#7A9E8A] shrink-0"></span>
                )}
              </button>
            ))}
          </nav>
          <div className="px-3 py-4 border-t border-[#E5DFD9] shrink-0">
            {user ? (
              <div className="flex items-center justify-between px-3 py-3 bg-[#EDE8E3] rounded-xl">
                <div className="flex items-center gap-3">
                  <img
                    src={user.photoURL || `https://ui-avatars.com/api/?name=${user.email}&background=e5dfd9&color=5c8070`}
                    alt="User Avatar"
                    className="w-8 h-8 rounded-full ring-1 ring-[#E5DFD9]"
                    referrerPolicy="no-referrer"
                    loading="lazy"
                  />
                  <span className="text-sm text-[#8A8278] truncate max-w-[160px]">{user.email}</span>
                </div>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-[#ADA49C] hover:bg-[#E5DFD9] hover:text-[#2C2926]"
                >
                  <LogOut size={13} /> 登出
                </button>
              </div>
            ) : (
              <button
                onClick={() => fbService.loginWithGoogle()}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm bg-[#7A9E8A] text-white hover:bg-[#5C8070] font-medium shadow-lg shadow-[#7A9E8A]/20"
              >
                <LogIn size={16} /> 管理員登入
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-6 overflow-x-hidden">
        <div className="max-w-7xl mx-auto">
          <Suspense fallback={<TabLoadingFallback />}>
            {renderContent()}
          </Suspense>
        </div>
      </main>
    </div>
  );
}

export const showAlert = (message: string) => {
  window.dispatchEvent(new CustomEvent('custom-alert', { detail: message }));
};

export default function App() {
  // Any query params at root = LINE OAuth callback (success or cancel/error).
  // Normal GPick navigation never adds query params to the root URL.
  if (window.location.search) {
    const searchParams  = new URLSearchParams(window.location.search);
    const lineCode      = searchParams.get('code');
    const lineState     = searchParams.get('state');
    const customerToken = lineState?.startsWith('customer_')
      ? (lineState.slice('customer_'.length) || undefined)
      : undefined;

    sessionStorage.removeItem('gpick_line_return');

    if (lineCode) {
      // Success: hand off to CustomerPage to process the OAuth code
      return <CustomerPage token={customerToken} lineCallbackCode={lineCode} />;
    }
    // Cancel or error: always go back to customer page, never show admin
    window.location.replace(`/${customerToken ? `#/c/${customerToken}` : '#/c'}`);
    return <div className="min-h-screen bg-[#EDE8E3]" />;
  }

  // Hash-based routing: #/c → universal | #/c/TOKEN → token mode
  const hash = window.location.hash;
  if (hash === '#/c' || hash.startsWith('#/c/')) {
    const customerToken = hash.startsWith('#/c/') ? hash.slice(4) : undefined;
    return <CustomerPage token={customerToken} />;
  }

  return <AdminApp />;
}

function AdminApp() {
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  useEffect(() => {
    const handleAlert = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      setAlertMessage(customEvent.detail);
    };
    window.addEventListener('custom-alert', handleAlert);
    return () => window.removeEventListener('custom-alert', handleAlert);
  }, []);

  const isSuccess = alertMessage
    ? alertMessage.includes('✅') || alertMessage.includes('成功')
    : false;

  return (
    <ErrorBoundary>
      <MainApp />
      {/* Global Alert Modal */}
      {alertMessage && (
          <div className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-4 backdrop-blur-md">
              <div className="bg-white rounded-2xl shadow-2xl shadow-black/10 max-w-sm w-full p-6 text-center">
                  <div className={`w-12 h-12 ${isSuccess ? 'bg-green-50' : 'bg-blue-50'} rounded-2xl flex items-center justify-center mx-auto mb-4`}>
                      {isSuccess
                        ? <CheckCircle size={22} className="text-green-600" />
                        : <AlertTriangle size={22} className="text-blue-500" />
                      }
                  </div>
                  <h3 className="text-base font-semibold text-[#2C2926] mb-2">系統提示</h3>
                  <p className="text-[#8A8278] text-sm leading-relaxed whitespace-pre-line">
                      {alertMessage}
                  </p>
                  <button
                      onClick={() => setAlertMessage(null)}
                      className="w-full mt-5 px-6 py-2.5 bg-[#3F4550] text-white font-medium rounded-xl hover:bg-[#2F3540] transition-colors text-sm"
                  >
                      確定
                  </button>
              </div>
          </div>
      )}
    </ErrorBoundary>
  );
}
