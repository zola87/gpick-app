import React, { useState } from 'react';
import { Product, Order, Customer } from '../types';
import { CheckCircle, Circle, MapPin, Search, ChevronDown, ChevronUp, Bell, Check } from 'lucide-react';

interface ShoppingListProps {
  products: Product[];
  orders: Order[];
  customers: Customer[];
  onUpdateOrder: (order: Order) => void;
}

export const ShoppingList: React.FC<ShoppingListProps> = ({ products, orders, customers, onUpdateOrder }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  // Filter archived orders first
  const activeOrders = orders.filter(o => !o.isArchived);

  // Group by Product ID AND Variant
  const groupedItems = products.flatMap(product => {
    // Get all orders for this product
    const prodOrders = activeOrders.filter(o => o.productId === product.id);
    
    // Group these orders by variant
    const variants = Array.from(new Set(prodOrders.map(o => o.variant || 'default')));
    
    return variants.map(variant => {
       const variantOrders = prodOrders.filter(o => (o.variant || 'default') === variant);
       const totalNeeded = variantOrders.reduce((acc, o) => acc + o.quantity, 0);
       const totalBought = variantOrders.reduce((acc, o) => acc + (o.quantityBought || 0), 0);
       
       return {
         id: `${product.id}-${variant}`,
         product,
         variant: variant === 'default' ? null : variant,
         totalNeeded,
         totalBought,
         orders: variantOrders.sort((a, b) => a.timestamp - b.timestamp), // Sort by time for priority
         isComplete: totalBought >= totalNeeded
       };
    });
  }).filter(item => item.totalNeeded > 0);

  // Filter by search
  const filteredItems = groupedItems.filter(item => 
    item.product.name.toLowerCase().includes(searchTerm.toLowerCase())
  ).sort((a, b) => (a.isComplete === b.isComplete ? 0 : a.isComplete ? 1 : -1));

  const handleUpdateBought = (item: typeof filteredItems[0], newTotalBought: number) => {
    // Distribute the "bought" quantity to orders based on timestamp priority
    let remainingBought = newTotalBought;
    
    item.orders.forEach(order => {
      const needed = order.quantity;
      if (remainingBought >= needed) {
        order.quantityBought = needed;
        order.status = 'BOUGHT';
        remainingBought -= needed;
      } else if (remainingBought > 0) {
        order.quantityBought = remainingBought;
        order.status = 'PENDING'; // Partially bought
        remainingBought = 0;
      } else {
        order.quantityBought = 0;
        order.status = 'PENDING';
      }
      onUpdateOrder(order);
    });
  };

  const toggleNotification = (order: Order) => {
      const newStatus = order.notificationStatus === 'NOTIFIED' ? 'UNNOTIFIED' : 'NOTIFIED';
      onUpdateOrder({...order, notificationStatus: newStatus});
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-blue-600 text-white p-6 rounded-t-xl shadow-md sticky top-0 z-10">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <MapPin className="w-6 h-6 text-pink-300" />
            現場採購清單
          </h2>
          <div className="bg-blue-500 rounded-lg p-1 flex items-center">
            <Search size={16} className="ml-2 text-blue-100" />
            <input 
              className="bg-transparent border-none focus:ring-0 text-white placeholder-blue-200 text-sm w-32 md:w-48"
              placeholder="搜尋商品..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        <p className="text-blue-100 text-xs">依喊單順序分配，輸入實際購買數量即可自動分配。綠色代表有分配到。</p>
      </div>
      
      <div className="bg-white shadow-md rounded-b-xl overflow-hidden min-h-[500px]">
        {filteredItems.length === 0 ? (
          <div className="p-10 text-center text-stone-400">
            沒有符合的採購項目 (或所有訂單已封存)
          </div>
        ) : (
          <div className="divide-y divide-stone-100">
            {filteredItems.map((item) => {
              const isExpanded = expandedItem === item.id;
              
              return (
                <div key={item.id} className={`transition-all ${item.isComplete ? 'bg-stone-50 opacity-70' : 'bg-white'}`}>
                  {/* Header Row */}
                  <div className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1" onClick={() => setExpandedItem(isExpanded ? null : item.id)}>
                      <div className={`cursor-pointer ${item.isComplete ? 'text-green-500' : 'text-stone-300 hover:text-blue-400'}`}>
                        {item.isComplete ? <CheckCircle className="w-8 h-8 fill-current" /> : <Circle className="w-8 h-8" />}
                      </div>
                      
                      <div className="flex-1 cursor-pointer">
                        <div className="flex items-center gap-2">
                          <h3 className={`font-bold text-lg ${item.isComplete ? 'line-through text-stone-500' : 'text-stone-800'}`}>
                            {item.product.name}
                          </h3>
                          {item.variant && (
                            <span className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full font-medium">
                              {item.variant}
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-stone-500 mt-1 flex gap-4">
                           <span>總需: <b className="text-stone-800">{item.totalNeeded}</b></span>
                           <span className={item.totalBought < item.totalNeeded ? "text-pink-500" : "text-green-600 font-bold"}>
                             已買: {item.totalBought}
                           </span>
                        </div>
                      </div>
                    </div>

                    {/* Quick Action */}
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => handleUpdateBought(item, item.totalNeeded)}
                        className="text-xs bg-stone-100 hover:bg-green-100 text-stone-600 hover:text-green-700 px-2 py-1 rounded border border-stone-200"
                        title="全部買齊"
                      >
                        All
                      </button>
                      <input 
                        type="number" 
                        min="0"
                        value={item.totalBought}
                        onChange={(e) => handleUpdateBought(item, Number(e.target.value))}
                        className="w-16 text-center border border-stone-300 rounded-md py-1 focus:ring-2 focus:ring-blue-500 outline-none font-bold text-lg"
                      />
                      <button onClick={() => setExpandedItem(isExpanded ? null : item.id)} className="text-stone-400">
                         {isExpanded ? <ChevronUp /> : <ChevronDown />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Detail (Priority List) */}
                  {isExpanded && (
                    <div className="bg-stone-50 px-4 pb-4 pt-2 border-t border-stone-100 ml-12 border-l-2 border-blue-200">
                      <h4 className="text-xs font-bold text-stone-500 mb-2 uppercase tracking-wider">分配順序 (依喊單時間)</h4>
                      <div className="space-y-1">
                        {item.orders.map((order, idx) => {
                          const customer = customers.find(c => c.id === order.customerId);
                          const isFullyAllocated = order.quantityBought >= order.quantity;
                          const isPartiallyAllocated = order.quantityBought > 0 && order.quantityBought < order.quantity;
                          const isNotified = order.notificationStatus === 'NOTIFIED';
                          
                          // Visual Logic: Green if allocated, Red if pending
                          let statusColorClass = 'text-red-400';
                          if (isFullyAllocated) statusColorClass = 'text-green-600';
                          else if (isPartiallyAllocated) statusColorClass = 'text-amber-500';

                          return (
                            <div key={order.id} className={`flex justify-between items-center text-sm py-2 border-b border-stone-200 last:border-0 rounded px-2 transition-colors ${isFullyAllocated ? 'bg-green-50/50' : 'bg-white'}`}>
                              <div className="flex items-center gap-3">
                                <span className="text-stone-400 w-4 text-xs">#{idx + 1}</span>
                                <span className={`font-bold ${isFullyAllocated ? 'text-stone-800' : 'text-stone-400'}`}>
                                  {customer?.lineName || 'Unknown'}
                                </span>
                              </div>
                              <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                    <span className="text-stone-500">喊 {order.quantity}</span>
                                    <span className="text-stone-300">→</span>
                                    <span className={`font-bold ${statusColorClass}`}>
                                    {isFullyAllocated ? 'OK' : isPartiallyAllocated ? `分 ${order.quantityBought}` : '缺貨'}
                                    </span>
                                </div>
                                <button 
                                    onClick={() => toggleNotification(order)}
                                    className={`p-1 rounded-full transition-colors ${isNotified ? 'bg-green-100 text-green-600' : 'bg-stone-200 text-stone-400 hover:bg-stone-300'}`}
                                    title={isNotified ? "已通知" : "未通知"}
                                >
                                    {isNotified ? <Check size={14} /> : <Bell size={14} />}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};