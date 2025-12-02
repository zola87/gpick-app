
import React, { useState } from 'react';
import { Product, Order, Customer, GlobalSettings } from '../types';
import { analyzeSalesData } from '../services/geminiService';
import { TrendingUp, Users, ShoppingCart, JapaneseYen, Sparkles, Loader, PieChart, Download, Upload, Share2 } from 'lucide-react';

interface DashboardProps {
  products: Product[];
  orders: Order[];
  customers: Customer[];
  settings: GlobalSettings;
  onExportBackup?: () => void;
  onImportBackup?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ products, orders, customers, settings, onExportBackup, onImportBackup }) => {
  const [aiAnalysis, setAiAnalysis] = useState<string>('');
  const [loadingAi, setLoadingAi] = useState(false);

  // We only show stats for the CURRENT (Active) session
  const activeOrders = orders.filter(o => !o.isArchived);

  // Stats Calculations
  const totalRevenue = activeOrders.reduce((acc, order) => {
    const product = products.find(p => p.id === order.productId);
    return acc + (product ? product.priceTWD * order.quantity : 0);
  }, 0);

  const totalCostTWD = activeOrders.reduce((acc, order) => {
    const product = products.find(p => p.id === order.productId);
    return acc + (product ? (product.priceJPY * settings.jpyExchangeRate * order.quantity) : 0);
  }, 0);

  const netProfit = totalRevenue - totalCostTWD;
  const totalItemsSold = activeOrders.reduce((acc, order) => acc + order.quantity, 0);

  // Category Analysis
  const categoryStats = products.reduce((acc: Record<string, number>, product) => {
    const productOrders = activeOrders.filter(o => o.productId === product.id);
    const count = productOrders.reduce((sum, o) => sum + o.quantity, 0);
    if (count > 0) {
        const current = acc[product.category] || 0;
        acc[product.category] = current + count;
    }
    return acc;
  }, {} as Record<string, number>);

  const sortedCategories = Object.entries(categoryStats).sort((a, b) => (b[1] as number) - (a[1] as number));

  const handleRunAnalysis = async () => {
    setLoadingAi(true);
    const result = await analyzeSalesData(products, activeOrders, customers);
    setAiAnalysis(result);
    setLoadingAi(false);
  };

  return (
    <div className="space-y-8">
      
      <div className="flex justify-between items-center mt-4">
         <h2 className="text-2xl font-bold text-stone-800">本場連線營運概況</h2>
         <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm font-medium">進行中訂單</span>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-100">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-stone-500">總營業額</p>
              <h3 className="text-2xl font-bold text-stone-800 mt-1">NT$ {totalRevenue.toLocaleString()}</h3>
            </div>
            <div className="p-2 bg-blue-50 rounded-lg text-blue-500">
              <TrendingUp size={20} />
            </div>
          </div>
        </div>

         <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-100">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-stone-500">預估淨利</p>
              <h3 className="text-2xl font-bold text-emerald-600 mt-1">NT$ {Math.round(netProfit).toLocaleString()}</h3>
              <p className="text-xs text-stone-400 mt-1">匯率成本: {settings.jpyExchangeRate}</p>
            </div>
            <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
              <JapaneseYen size={20} />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-100">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-stone-500">售出商品數</p>
              <h3 className="text-2xl font-bold text-stone-800 mt-1">{totalItemsSold} 件</h3>
            </div>
            <div className="p-2 bg-pink-50 rounded-lg text-pink-600">
              <ShoppingCart size={20} />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-100">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-stone-500">活躍顧客</p>
              <h3 className="text-2xl font-bold text-stone-800 mt-1">{customers.length} 人</h3>
            </div>
            <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
              <Users size={20} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Category Chart (Simple Bar) */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-100 lg:col-span-1">
            <h3 className="font-bold text-stone-700 mb-4 flex items-center gap-2"><PieChart size={18} /> 銷售類別分布</h3>
            <div className="space-y-4">
                {sortedCategories.map(([cat, count]) => (
                    <div key={cat}>
                        <div className="flex justify-between text-sm mb-1">
                            <span>{cat}</span>
                            <span className="font-bold">{count}</span>
                        </div>
                        <div className="w-full bg-stone-100 rounded-full h-2">
                            <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${((count as number) / (totalItemsSold || 1)) * 100}%` }}></div>
                        </div>
                    </div>
                ))}
                {sortedCategories.length === 0 && <p className="text-stone-400 text-sm">暫無數據</p>}
            </div>
        </div>

        {/* AI Analysis Section */}
        <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl shadow-lg text-white p-8 lg:col-span-2">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
            <div>
                <h2 className="text-2xl font-bold flex items-center gap-2">
                <Sparkles className="text-yellow-200" />
                Gemini 營運分析
                </h2>
                <p className="text-blue-100 mt-1">根據本次連線數據提供下一次的選品與定價建議。</p>
            </div>
            <button 
                onClick={handleRunAnalysis}
                disabled={loadingAi}
                className="mt-4 md:mt-0 bg-white/20 hover:bg-white/30 backdrop-blur-sm border border-white/40 text-white px-6 py-2.5 rounded-full font-medium transition-all disabled:opacity-50 flex items-center gap-2"
            >
                {loadingAi ? <Loader className="animate-spin" size={18} /> : <Sparkles size={18} />}
                {loadingAi ? '分析中...' : '開始分析'}
            </button>
            </div>

            {aiAnalysis ? (
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 text-blue-50 leading-relaxed whitespace-pre-line border border-white/10 text-sm max-h-60 overflow-y-auto">
                {aiAnalysis}
            </div>
            ) : (
            <div className="bg-white/5 border border-white/10 rounded-xl p-8 text-center text-blue-200">
                點擊「開始分析」來獲取您的專屬營運報告。
            </div>
            )}
        </div>
      </div>
    </div>
  );
};
