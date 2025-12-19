
import React, { useState, useEffect } from 'react';
import { Product, Order, Customer, GlobalSettings, SalesReport } from '../types';
import { analyzeSalesData, generateAnalysisPrompt } from '../services/geminiService';
import { TrendingUp, Users, ShoppingCart, JapaneseYen, Sparkles, Loader, PieChart, History, Calendar, ArrowUpRight, ArrowDownRight, Save, Award, BarChart, Target, MessageSquareMore, Tag, ExternalLink, Copy, LayoutDashboard as LayoutDashboardIcon } from 'lucide-react';

interface DashboardProps {
  products: Product[];
  orders: Order[];
  customers: Customer[];
  settings: GlobalSettings;
  reports?: SalesReport[]; // Historical Reports
  onUpdateSettings?: (s: GlobalSettings) => void; // To save AI draft
}

export const Dashboard: React.FC<DashboardProps> = ({ products, orders, customers, settings, reports = [], onUpdateSettings }) => {
  const [aiAnalysis, setAiAnalysis] = useState<string>(settings.currentAiAnalysis || '');
  const [loadingAi, setLoadingAi] = useState(false);
  const [activeView, setActiveView] = useState<'current' | 'history'>('current');

  // We only show stats for the CURRENT (Active) session
  const activeOrders = orders.filter(o => !o.isArchived);

  // --- Current Stats (Based on ACTUAL BOUGHT Quantity) ---
  const totalRevenue = activeOrders.reduce((acc, order) => {
    const product = products.find(p => p.id === order.productId);
    // CHANGED: Use quantityBought instead of quantity
    return acc + (product ? product.priceTWD * (order.quantityBought || 0) : 0);
  }, 0);

  const totalCostTWD = activeOrders.reduce((acc, order) => {
    const product = products.find(p => p.id === order.productId);
    // CHANGED: Use quantityBought instead of quantity
    return acc + (product ? (product.priceJPY * settings.jpyExchangeRate * (order.quantityBought || 0)) : 0);
  }, 0);

  const netProfit = totalRevenue - totalCostTWD;
  // CHANGED: Use quantityBought instead of quantity
  const totalItemsSold = activeOrders.reduce((acc, order) => acc + (order.quantityBought || 0), 0);

  // --- Growth Calculation (vs Last Report) ---
  const lastReport = reports.length > 0 ? reports.sort((a,b) => b.timestamp - a.timestamp)[0] : null;
  const revenueGrowth = lastReport && lastReport.totalRevenue > 0 
      ? ((totalRevenue - lastReport.totalRevenue) / lastReport.totalRevenue) * 100 
      : 0;
  
  // --- Deep Dive Analysis Helpers ---
  
  // 1. Product Performance (Based on Bought)
  const productPerformance = products.map(p => {
      const pOrders = activeOrders.filter(o => o.productId === p.id);
      // CHANGED: Use quantityBought
      const qty = pOrders.reduce((sum, o) => sum + (o.quantityBought || 0), 0);
      const revenue = p.priceTWD * qty;
      return { id: p.id, name: p.name, qty, revenue };
  }).filter(p => p.qty > 0);

  const topProductsByRevenue = [...productPerformance].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  const topProductsByQty = [...productPerformance].sort((a, b) => b.qty - a.qty).slice(0, 5);

  // 2. Customer Performance (Based on Bought)
  const customerPerformance = customers.map(c => {
      const cOrders = activeOrders.filter(o => o.customerId === c.id);
      const spent = cOrders.reduce((sum, o) => {
          const p = products.find(prod => prod.id === o.productId);
          // CHANGED: Use quantityBought
          return sum + (p ? p.priceTWD * (o.quantityBought || 0) : 0);
      }, 0);
      // Only count orders that actually have bought items
      const count = cOrders.filter(o => (o.quantityBought || 0) > 0).length; 
      return { id: c.id, name: c.lineName, spent, count };
  }).filter(c => c.spent > 0).sort((a, b) => b.spent - a.spent);

  const topCustomers = customerPerformance.slice(0, 5);
  const activeCustomerCount = customerPerformance.length;
  
  // 3. Key Metrics
  const averageOrderValue = activeCustomerCount > 0 ? Math.round(totalRevenue / activeCustomerCount) : 0;
  const avgProfitMargin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : '0';

  // --- Category Analysis (Based on Bought) ---
  const categoryStats = products.reduce((acc: Record<string, number>, product) => {
    const productOrders = activeOrders.filter(o => o.productId === product.id);
    // CHANGED: Use quantityBought
    const count = productOrders.reduce((sum, o) => sum + (o.quantityBought || 0), 0);
    if (count > 0) {
        const current = acc[product.category] || 0;
        acc[product.category] = current + count;
    }
    return acc;
  }, {} as Record<string, number>);

  const sortedCategories = Object.entries(categoryStats).sort((a, b) => (b[1] as number) - (a[1] as number));

  // --- Brand Analysis (Based on Bought) ---
  const brandStats = products.reduce((acc: Record<string, number>, product) => {
    const productOrders = activeOrders.filter(o => o.productId === product.id);
    // CHANGED: Use quantityBought
    const count = productOrders.reduce((sum, o) => sum + (o.quantityBought || 0), 0);
    if (count > 0) {
        const brand = product.brand || '未分類';
        const current = acc[brand] || 0;
        acc[brand] = current + count;
    }
    return acc;
  }, {} as Record<string, number>);

  const sortedBrands = Object.entries(brandStats).sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 6);

  const handleRunAnalysis = async () => {
    setLoadingAi(true);
    // Changed: Strictly using process.env.API_KEY in the service, removed geminiApiKey parameter
    const result = await analyzeSalesData(products, activeOrders, customers);
    setAiAnalysis(result);
    // Auto-save the analysis to settings so it's not lost on refresh
    if (onUpdateSettings) {
        onUpdateSettings({ ...settings, currentAiAnalysis: result });
    }
    setLoadingAi(false);
  };

  const handleJumpToGemini = () => {
      const prompt = generateAnalysisPrompt(products, activeOrders, customers, settings);
      navigator.clipboard.writeText(prompt);
      alert('數據指令已複製！\n\n即將開啟 Google Gemini 網站，請在對話框「貼上」即可開始深度分析。');
      window.open('https://gemini.google.com/', '_blank');
  };

  // --- Trend Chart Helper ---
  const TrendChart = () => {
      if (reports.length < 1) return (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-100 h-full flex flex-col justify-center items-center text-stone-400 min-h-[300px]">
              <TrendingUp size={48} className="mb-2 opacity-20"/>
              <p>需累積歷史報表才能顯示成長趨勢圖</p>
              <p className="text-xs mt-1">請在系統設定執行「封存」動作</p>
          </div>
      );

      const sortedReports = [...reports].sort((a,b) => a.timestamp - b.timestamp);
      // Include current potential session as the last point
      const dataPoints = [
          ...sortedReports, 
          { name: '本場(即時)', totalRevenue, totalProfit: netProfit }
      ];

      const maxVal = Math.max(...dataPoints.map(d => d.totalRevenue)) * 1.1; // 10% buffer
      const height = 200;
      // const width = 100; // percent

      // Generate SVG Path
      const makePath = (key: 'totalRevenue' | 'totalProfit') => {
          return dataPoints.map((d, i) => {
              const x = (i / (dataPoints.length - 1)) * 100;
              // @ts-ignore
              const y = height - ((d[key] / maxVal) * height);
              return `${x},${y}`;
          }).join(' ');
      };

      return (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-100 h-full flex flex-col">
              <h3 className="font-bold text-stone-700 mb-6 flex items-center gap-2">
                  <TrendingUp size={18} className="text-blue-500" /> 營運成長曲線 (Trend)
              </h3>
              <div className="flex-1 w-full relative min-h-[200px]">
                  <svg className="w-full h-full overflow-visible" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none">
                      {/* Grid Lines */}
                      <line x1="0" y1="0" x2="100" y2="0" stroke="#f3f4f6" strokeWidth="1" />
                      <line x1="0" y1={height/2} x2="100" y2={height/2} stroke="#f3f4f6" strokeWidth="1" />
                      <line x1="0" y1={height} x2="100" y2={height} stroke="#f3f4f6" strokeWidth="1" />

                      {/* Revenue Line (Blue) */}
                      <polyline 
                         points={makePath('totalRevenue')} 
                         fill="none" 
                         stroke="#3b82f6" 
                         strokeWidth="2" 
                         vectorEffect="non-scaling-stroke"
                      />
                      
                      {/* Profit Line (Green) */}
                      <polyline 
                         points={makePath('totalProfit')} 
                         fill="none" 
                         stroke="#10b981" 
                         strokeWidth="2" 
                         strokeDasharray="4"
                         vectorEffect="non-scaling-stroke"
                      />
                  </svg>
                  
                  {/* Labels (Overlay) */}
                  <div className="absolute inset-0 flex justify-between items-end pointer-events-none">
                      {dataPoints.map((d, i) => (
                          <div key={i} className="flex flex-col items-center pb-2 group relative cursor-pointer pointer-events-auto">
                              <div className="w-2 h-2 rounded-full bg-blue-500 mb-1 ring-2 ring-white"></div>
                              <span className="text-[10px] text-stone-400 whitespace-nowrap hidden sm:block">{d.name.split(' ')[0]}</span>
                              
                              {/* Tooltip */}
                              <div className="absolute bottom-8 bg-stone-800 text-white text-xs p-2 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none">
                                  <div className="font-bold mb-1 border-b border-stone-600 pb-1">{d.name}</div>
                                  <div>營收: ${d.totalRevenue.toLocaleString()}</div>
                                  <div className="text-green-300">淨利: ${d.totalProfit.toLocaleString()}</div>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
              <div className="flex justify-center gap-6 mt-6 text-xs text-stone-500">
                  <div className="flex items-center gap-1"><div className="w-3 h-1 bg-blue-500 rounded-full"></div> 總營收</div>
                  <div className="flex items-center gap-1"><div className="w-3 h-1 bg-emerald-500 border-b border-emerald-500 border-dashed"></div> 淨利</div>
              </div>
          </div>
      );
  };

  return (
    <div className="space-y-8 pb-10">
      {/* Header Tabs */}
      <div className="flex justify-between items-center">
         <div className="flex bg-white p-1 rounded-lg border border-stone-200 shadow-sm">
            <button 
                onClick={() => setActiveView('current')}
                className={`px-4 py-2 rounded-md text-sm font-bold transition-all flex items-center gap-2 ${activeView === 'current' ? 'bg-stone-800 text-white shadow-md' : 'text-stone-500 hover:text-stone-800 hover:bg-stone-100'}`}
            >
                <LayoutDashboardIcon size={16} />
                本場連線 (實際買到)
            </button>
            <button 
                onClick={() => setActiveView('history')}
                className={`px-4 py-2 rounded-md text-sm font-bold transition-all flex items-center gap-2 ${activeView === 'history' ? 'bg-stone-800 text-white shadow-md' : 'text-stone-500 hover:text-stone-800 hover:bg-stone-100'}`}
            >
                <History size={16}/> 歷史報表
            </button>
         </div>
      </div>

      {activeView === 'current' ? (
      <>
        {/* ROW 1: Key Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Metric Card 1 */}
            <div className="bg-white p-5 rounded-xl shadow-sm border border-stone-100 flex flex-col justify-between">
                <div className="flex justify-between items-start mb-2">
                    <p className="text-xs font-bold text-stone-400 uppercase tracking-wider">本場總營收 (已購)</p>
                    <div className="p-1.5 bg-blue-50 rounded-md text-blue-600"><JapaneseYen size={16} /></div>
                </div>
                <div>
                    <h3 className="text-2xl font-bold text-stone-800">NT$ {totalRevenue.toLocaleString()}</h3>
                    {lastReport && (
                        <div className={`text-xs mt-1 flex items-center gap-1 ${revenueGrowth >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {revenueGrowth >= 0 ? <ArrowUpRight size={12}/> : <ArrowDownRight size={12}/>}
                            {Math.abs(revenueGrowth).toFixed(1)}% <span className="text-stone-300">vs 上場</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Metric Card 2 */}
            <div className="bg-white p-5 rounded-xl shadow-sm border border-stone-100 flex flex-col justify-between">
                <div className="flex justify-between items-start mb-2">
                    <p className="text-xs font-bold text-stone-400 uppercase tracking-wider">實際淨利 (Profit)</p>
                    <div className="p-1.5 bg-emerald-50 rounded-md text-emerald-600"><TrendingUp size={16} /></div>
                </div>
                <div>
                    <h3 className="text-2xl font-bold text-emerald-600">NT$ {Math.round(netProfit).toLocaleString()}</h3>
                    <p className="text-xs text-stone-400 mt-1">淨利率: {avgProfitMargin}%</p>
                </div>
            </div>

            {/* Metric Card 3 */}
            <div className="bg-white p-5 rounded-xl shadow-sm border border-stone-100 flex flex-col justify-between">
                <div className="flex justify-between items-start mb-2">
                    <p className="text-xs font-bold text-stone-400 uppercase tracking-wider">平均客單價 (AOV)</p>
                    <div className="p-1.5 bg-indigo-50 rounded-md text-indigo-600"><Target size={16} /></div>
                </div>
                <div>
                    <h3 className="text-2xl font-bold text-stone-800">NT$ {averageOrderValue.toLocaleString()}</h3>
                    <p className="text-xs text-stone-400 mt-1">有買到的顧客: {activeCustomerCount} 人</p>
                </div>
            </div>

            {/* Metric Card 4 */}
            <div className="bg-white p-5 rounded-xl shadow-sm border border-stone-100 flex flex-col justify-between">
                <div className="flex justify-between items-start mb-2">
                    <p className="text-xs font-bold text-stone-400 uppercase tracking-wider">實際銷售件數</p>
                    <div className="p-1.5 bg-pink-50 rounded-md text-pink-600"><ShoppingCart size={16} /></div>
                </div>
                <div>
                    <h3 className="text-2xl font-bold text-stone-800">{totalItemsSold} <span className="text-sm font-normal text-stone-500">件</span></h3>
                    <p className="text-xs text-stone-400 mt-1">只計算已買到商品</p>
                </div>
            </div>
        </div>

        {/* ROW 2: Rankings (Product + Customer) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Product Performance Matrix */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-100">
                <h3 className="font-bold text-stone-700 mb-4 flex items-center gap-2">
                    <BarChart size={18} className="text-purple-500" /> 商品績效排行榜 (依買到數)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Revenue Leaders */}
                    <div>
                        <h4 className="text-xs font-bold text-blue-600 mb-3 border-b border-blue-100 pb-2 flex justify-between">
                            <span>🔥 吸金榜 (營收)</span>
                            <span>Top 5</span>
                        </h4>
                        <div className="space-y-3">
                            {topProductsByRevenue.length === 0 && <p className="text-stone-400 text-xs">暫無數據</p>}
                            {topProductsByRevenue.map((p, i) => (
                                <div key={p.id} className="flex justify-between items-center text-sm group">
                                    <div className="flex items-center gap-2 overflow-hidden">
                                        <span className={`text-[10px] w-4 h-4 flex items-center justify-center rounded-full ${i<3 ? 'bg-stone-800 text-white' : 'bg-stone-200 text-stone-500'}`}>{i+1}</span>
                                        <span className="truncate text-stone-600 group-hover:text-blue-600 transition-colors">{p.name}</span>
                                    </div>
                                    <span className="font-bold whitespace-nowrap text-stone-700">${p.revenue.toLocaleString()}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    {/* Volume Leaders */}
                    <div>
                        <h4 className="text-xs font-bold text-pink-600 mb-3 border-b border-pink-100 pb-2 flex justify-between">
                            <span>📦 熱銷榜 (銷量)</span>
                            <span>Top 5</span>
                        </h4>
                        <div className="space-y-3">
                            {topProductsByQty.length === 0 && <p className="text-stone-400 text-xs">暫無數據</p>}
                            {topProductsByQty.map((p, i) => (
                                <div key={p.id} className="flex justify-between items-center text-sm group">
                                    <div className="flex items-center gap-2 overflow-hidden">
                                        <span className={`text-[10px] w-4 h-4 flex items-center justify-center rounded-full ${i<3 ? 'bg-stone-800 text-white' : 'bg-stone-200 text-stone-500'}`}>{i+1}</span>
                                        <span className="truncate text-stone-600 group-hover:text-pink-500 transition-colors">{p.name}</span>
                                    </div>
                                    <span className="font-bold whitespace-nowrap text-stone-700">{p.qty}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* VVIP Customers */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-100">
                <h3 className="font-bold text-stone-700 mb-4 flex items-center gap-2">
                    <Award size={18} className="text-yellow-500" /> 本場 VVIP 貢獻榜
                </h3>
                <div className="space-y-3">
                    {topCustomers.length === 0 && <p className="text-stone-400 text-sm py-4 text-center">暫無數據</p>}
                    {topCustomers.map((c, i) => (
                        <div key={c.id} className="flex justify-between items-center text-sm p-3 hover:bg-stone-50 rounded-lg transition-colors border border-transparent hover:border-stone-100">
                            <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shadow-sm ${i===0 ? 'bg-yellow-400 text-yellow-900' : i===1 ? 'bg-stone-300 text-stone-700' : i===2 ? 'bg-orange-200 text-orange-800' : 'bg-stone-100 text-stone-500'}`}>
                                    {i+1}
                                </div>
                                <div>
                                    <span className="font-bold text-stone-700 block">{c.name}</span>
                                    <span className="text-[10px] text-stone-400">買到 {c.count} 項商品</span>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="font-bold text-blue-600 text-base">${c.spent.toLocaleString()}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>

        {/* ROW 3: Category Analysis (Full Width - Market Share Style) */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-100">
            <h3 className="font-bold text-stone-700 mb-6 flex items-center gap-2">
                <PieChart size={18} className="text-orange-500"/> 銷售類別市佔率 (Category Share)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {sortedCategories.reverse().map(([cat, count], idx) => {
                    const total = totalItemsSold || 1;
                    const percentage = ((count as number) / total * 100).toFixed(1);
                    return (
                        <div key={cat} className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${['bg-blue-100 text-blue-600', 'bg-pink-100 text-pink-600', 'bg-yellow-100 text-yellow-600', 'bg-green-100 text-green-600', 'bg-purple-100 text-purple-600'][idx % 5]}`}>
                                {cat.substring(0, 1)}
                            </div>
                            <div className="flex-1">
                                <div className="flex justify-between text-sm mb-1.5">
                                    <span className="font-bold text-stone-700">{cat}</span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-stone-500 text-xs">{count} 件</span>
                                        <span className="text-stone-600 font-bold bg-stone-100 px-1.5 py-0.5 rounded text-xs">{percentage}%</span>
                                    </div>
                                </div>
                                <div className="w-full bg-stone-100 rounded-full h-2 overflow-hidden">
                                    <div 
                                        className={`h-2 rounded-full transition-all duration-500 ${['bg-blue-400', 'bg-pink-400', 'bg-yellow-400', 'bg-green-400', 'bg-purple-400'][idx % 5]}`}
                                        style={{ width: `${percentage}%` }}
                                    ></div>
                                </div>
                            </div>
                        </div>
                    );
                })}
                {sortedCategories.length === 0 && <p className="text-stone-400 text-sm col-span-3 text-center py-4">暫無數據</p>}
            </div>
        </div>

        {/* ROW 4: Brand Share Distribution (Grid Layout) */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-100">
            <h3 className="font-bold text-stone-700 mb-6 flex items-center gap-2">
                <Tag size={18} className="text-teal-500"/> 品牌市佔率分析 (Brand Share)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {sortedBrands.map(([brand, count], idx) => {
                    const total = totalItemsSold || 1;
                    const percentage = ((count as number) / total * 100).toFixed(1);
                    
                    return (
                    <div key={brand} className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs bg-teal-100 text-teal-700">
                            {brand.substring(0, 1)}
                        </div>
                        <div className="flex-1">
                            <div className="flex justify-between text-sm mb-1.5">
                                <span className="font-bold text-stone-700 truncate">{brand}</span>
                                <div className="flex items-center gap-2">
                                    <span className="text-stone-500 text-xs">{count} 件</span>
                                    <span className="text-teal-600 font-bold bg-teal-50 px-1.5 py-0.5 rounded text-xs">{percentage}%</span>
                                </div>
                            </div>
                            <div className="w-full bg-stone-100 rounded-full h-2 overflow-hidden">
                                <div 
                                    className="h-2 rounded-full bg-teal-400 transition-all duration-500" 
                                    style={{ width: `${percentage}%` }}
                                ></div>
                            </div>
                        </div>
                    </div>
                )})}
                {sortedBrands.length === 0 && <p className="text-stone-400 text-sm text-center col-span-full py-4">暫無數據</p>}
            </div>
        </div>

        {/* ROW 5: Trend Chart (Full Width) */}
        <div className="h-96">
            <TrendChart />
        </div>

        {/* ROW 6: AI Insights (Full Width) */}
        <div className="bg-gradient-to-br from-slate-800 to-indigo-900 rounded-2xl shadow-xl text-white p-8 relative overflow-hidden border border-slate-700">
            {/* Decorative background elements */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500 rounded-full mix-blend-overlay filter blur-3xl opacity-20 -translate-y-1/2 translate-x-1/2"></div>
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-500 rounded-full mix-blend-overlay filter blur-3xl opacity-20 translate-y-1/2 -translate-x-1/2"></div>

            <div className="relative z-10">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 border-b border-white/10 pb-6">
                    <div>
                        <h2 className="text-2xl font-bold flex items-center gap-3">
                            <div className="p-2 bg-indigo-500 rounded-lg shadow-lg shadow-indigo-500/30">
                                <Sparkles className="text-white" size={24} />
                            </div>
                            Gemini 營運長分析
                        </h2>
                        <p className="text-indigo-200 mt-2 text-sm">AI 根據本場數據，為您提供專屬的營收結構分析與選品建議。</p>
                    </div>
                    <div className="flex gap-2 mt-4 md:mt-0">
                        <button 
                            onClick={handleJumpToGemini}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-3 rounded-full font-bold transition-all flex items-center gap-2 shadow-lg border border-indigo-500"
                        >
                            <MessageSquareMore size={18} />
                            前往 Google Gemini 深度對談 ↗
                        </button>
                        <button 
                            onClick={handleRunAnalysis}
                            disabled={loadingAi}
                            className="bg-white hover:bg-indigo-50 text-indigo-900 px-6 py-3 rounded-full font-bold transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg"
                        >
                            {loadingAi ? <Loader className="animate-spin" size={18} /> : <Sparkles size={18} />}
                            {loadingAi ? 'AI 思考中...' : '生成報告 (App內)'}
                        </button>
                    </div>
                </div>

                {aiAnalysis ? (
                    <div className="prose prose-invert max-w-none">
                        <div className="bg-white/5 backdrop-blur-sm rounded-xl p-6 leading-relaxed whitespace-pre-line border border-white/10 text-indigo-50 text-base shadow-inner">
                            {aiAnalysis}
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center text-indigo-300/60 border-2 border-dashed border-white/10 rounded-xl">
                        <Sparkles size={48} className="mb-4 opacity-50"/>
                        <p className="text-lg">尚無分析資料</p>
                        <p className="text-sm mt-1">點擊右上方按鈕，讓 AI 為您健檢本場營運狀況。</p>
                    </div>
                )}
            </div>
        </div>
      </>
      ) : (
        // --- HISTORY VIEW ---
        <div className="space-y-6">
            {reports.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-xl border border-stone-200">
                    <History size={48} className="mx-auto text-stone-300 mb-4"/>
                    <p className="text-stone-500">尚無歷史報表。</p>
                    <p className="text-stone-400 text-sm">當您在「系統設定」點擊「結束本次連線」後，報表將會顯示於此。</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-6">
                    {reports.sort((a,b) => b.timestamp - a.timestamp).map(report => (
                        <div key={report.id} className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden group hover:shadow-md transition-all">
                            <div className="bg-stone-50 p-4 flex flex-col md:flex-row justify-between md:items-center gap-4 border-b border-stone-100">
                                <div>
                                    <h3 className="text-lg font-bold text-stone-800 flex items-center gap-2">
                                        <Calendar size={18} className="text-blue-500"/>
                                        {report.name}
                                    </h3>
                                    <p className="text-xs text-stone-500 mt-1 font-mono">{report.date}</p>
                                </div>
                                <div className="flex gap-6 text-sm">
                                    <div className="text-center">
                                        <div className="text-[10px] text-stone-400 uppercase tracking-wider mb-1">總營收</div>
                                        <div className="font-bold text-stone-800 text-base">${report.totalRevenue.toLocaleString()}</div>
                                    </div>
                                    <div className="text-center border-l border-stone-200 pl-6">
                                        <div className="text-[10px] text-stone-400 uppercase tracking-wider mb-1">淨利</div>
                                        <div className="font-bold text-emerald-600 text-base">${report.totalProfit.toLocaleString()}</div>
                                    </div>
                                    <div className="text-center border-l border-stone-200 pl-6">
                                        <div className="text-[10px] text-stone-400 uppercase tracking-wider mb-1">總件數</div>
                                        <div className="font-bold text-stone-800 text-base">{report.totalItems}</div>
                                    </div>
                                </div>
                            </div>
                            {report.aiAnalysis && (
                                <div className="p-6">
                                    <h4 className="text-xs font-bold text-indigo-600 mb-3 flex items-center gap-1 uppercase tracking-wider">
                                        <Sparkles size={12}/> 當期 AI 營運建議
                                    </h4>
                                    <div className="text-sm text-stone-600 leading-relaxed whitespace-pre-line bg-indigo-50/50 p-4 rounded-lg border border-indigo-100">
                                        {report.aiAnalysis}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
      )}
    </div>
  );
};