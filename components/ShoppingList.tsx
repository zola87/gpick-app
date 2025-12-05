
import React, { useState } from 'react';
import { Product, Order, Customer } from '../types';
import { CheckCircle, Circle, MapPin, Search, ChevronDown, ChevronUp, Bell, Check, ShoppingCart, User, Plus, X, Info } from 'lucide-react';

interface ShoppingListProps {
  products: Product[];
  orders: Order[];
  customers: Customer[];
  onUpdateOrder: (order: Order) => void;
}

export const ShoppingList: React.FC<ShoppingListProps> = ({ products, orders, customers, onUpdateOrder }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [justFilledOrderIds, setJustFilledOrderIds] = useState<string[]>([]);
  const [viewingProduct, setViewingProduct] = useState<Product | null>(null);

  // Batch Add State
  const [batchModeItem, setBatchModeItem] = useState<{id: string, name: string} | null>(null);
  const [batchQty, setBatchQty] = useState<string>(''); // string to handle empty input nicely

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
    // Auto-expand to show distribution when updating
    setExpandedItem(item.id);

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

  const handleBatchAdd = () => {
      if(!batchModeItem) return;
      const qtyToAdd = parseInt(batchQty) || 0;
      if(qtyToAdd <= 0) {
          setBatchModeItem(null);
          return;
      }

      const item = filteredItems.find(i => i.id === batchModeItem.id);
      if(item) {
          // Identify which orders will receive this batch
          const currentTotal = item.totalBought;
          const newTotal = currentTotal + qtyToAdd;
          
          let allocationStart = currentTotal;
          const newlyFilled: string[] = [];

          // Sort orders by timestamp
          const sortedOrders = [...item.orders].sort((a,b) => a.timestamp - b.timestamp);
          
          // Calculate cumulative needs
          let cumulativeNeed = 0;
          sortedOrders.forEach(order => {
              const orderStart = cumulativeNeed;
              cumulativeNeed += order.quantity;
              const orderEnd = cumulativeNeed;

              const overlapStart = Math.max(allocationStart, orderStart);
              const overlapEnd = Math.min(newTotal, orderEnd);
              
              if (overlapEnd > overlapStart) {
                  newlyFilled.push(order.id);
              }
          });

          setJustFilledOrderIds(newlyFilled);
          handleUpdateBought(item, newTotal);
          
          // Auto expand to show the highlight
          setExpandedItem(item.id);
          
          // Auto clear highlight after 5 seconds
          setTimeout(() => setJustFilledOrderIds([]), 5000);
      }
      setBatchModeItem(null);
      setBatchQty('');
  };

  return (
    <div className="max-w-3xl mx-auto pb-24 relative">
      <div className="bg-blue-600 text-white p-6 rounded-t-xl shadow-md sticky top-0 z-20">
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
        <div className="flex justify-between items-end">
             <p className="text-blue-100 text-xs">依喊單順序分配，輸入數量後會自動展開分配名單。</p>
             <div className="text-xs bg-blue-700 px-2 py-1 rounded">
                 未完成: <span className="font-bold text-white">{filteredItems.filter(i => !i.isComplete).length}</span> 
                 <span className="mx-1">/</span>
                 已完成: <span className="font-bold text-green-300">{filteredItems.filter(i => i.isComplete).length}</span>
             </div>
        </div>
      </div>
      
      <div className="bg-white shadow-md rounded-b-xl overflow-hidden min-h-[500px]">
        {filteredItems.length === 0 ? (
          <div className="p-10 text-center text-stone-400">
            沒有符合的採購項目 (或所有訂單已封存)
          </div>
        ) : (
          <div className="divide-y divide-stone-100">
            {filteredItems.map((item) => {
              // Item is expanded if user clicked it OR if set by auto-expand logic
              const isExpanded = expandedItem === item.id;
              
              return (
                <div key={item.id} className={`transition-all ${item.isComplete ? 'bg-stone-50 opacity-70' : 'bg-white border-l-4 border-l-pink-500'}`}>
                  {/* Header Row */}
                  <div className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3 flex-1">
                      <div className={`cursor-pointer ${item.isComplete ? 'text-green-500' : 'text-stone-300'}`}>
                        {item.isComplete ? <CheckCircle className="w-8 h-8 fill-current" /> : <Circle className="w-8 h-8" />}
                      </div>
                      
                      {/* Product Thumbnail - Click to View */}
                      <div className="w-12 h-12 bg-stone-100 rounded border border-stone-200 flex-shrink-0 overflow-hidden cursor-zoom-in" onClick={() => setViewingProduct(item.product)}>
                          <img src={item.product.imageUrl} className="w-full h-full object-cover" alt="thumb" />
                      </div>

                      <div className="flex-1 min-w-0" onClick={() => setExpandedItem(isExpanded ? null : item.id)}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className={`font-bold text-base sm:text-lg truncate ${item.isComplete ? 'line-through text-stone-500' : 'text-stone-800'}`}>
                            {item.product.name}
                          </h3>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                           {item.variant && (
                            <span className="bg-white text-stone-700 border-2 border-amber-400 text-sm px-2 py-1 rounded font-bold shadow-sm whitespace-nowrap">
                              {item.variant}
                            </span>
                          )}
                           <span className="text-xs text-stone-500">需求: <b className="text-stone-800 text-base">{item.totalNeeded}</b></span>
                        </div>
                      </div>
                    </div>

                    {/* Quick Action Input */}
                    <div className="flex items-center gap-2 bg-stone-50 p-2 rounded-lg border border-stone-200 self-end sm:self-auto">
                      <span className="text-xs text-stone-500 font-medium">總買到:</span>
                      <input 
                        type="number" 
                        min="0"
                        value={item.totalBought}
                        onClick={(e) => (e.target as HTMLInputElement).select()}
                        onChange={(e) => handleUpdateBought(item, Number(e.target.value))}
                        className={`w-14 text-center border rounded-md py-1 focus:ring-2 focus:ring-blue-500 outline-none font-bold text-lg ${item.totalBought < item.totalNeeded ? 'text-pink-600 border-pink-200 bg-pink-50' : 'text-green-600 border-green-200 bg-green-50'}`}
                      />
                      
                      {/* Incremental Add Button */}
                      {!item.isComplete && (
                          <button 
                            onClick={() => setBatchModeItem({id: item.id, name: `${item.product.name} ${item.variant || ''}`})}
                            className="bg-blue-600 text-white w-8 h-8 rounded flex items-center justify-center hover:bg-blue-700 active:scale-95 transition-all shadow-sm"
                            title="追加剛買到的數量"
                          >
                              <Plus size={18} />
                          </button>
                      )}

                      <button 
                        onClick={() => setExpandedItem(isExpanded ? null : item.id)}
                        className="w-8 h-8 flex items-center justify-center text-stone-400 hover:text-stone-600 rounded-full hover:bg-stone-100"
                        title={isExpanded ? "收起分配名單" : "展開分配名單"}
                      >
                          {isExpanded ? <ChevronUp size={20}/> : <ChevronDown size={20}/>}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Detail (Priority List) */}
                  {isExpanded && (
                    <div className="bg-stone-50 px-4 pb-4 pt-2 border-t border-stone-100 ml-0 sm:ml-12 animate-in slide-in-from-top-1 duration-200">
                      <h4 className="text-xs font-bold text-stone-400 mb-2 uppercase tracking-wider flex items-center gap-1">
                         <ShoppingCart size={12}/> 分配順序 (依喊單時間)
                      </h4>
                      <div className="space-y-2">
                        {item.orders.map((order, idx) => {
                          const customer = customers.find(c => c.id === order.customerId);
                          const isFullyAllocated = order.quantityBought >= order.quantity;
                          const isNotified = order.notificationStatus === 'NOTIFIED';
                          const isJustFilled = justFilledOrderIds.includes(order.id);
                          
                          return (
                            <div 
                                key={order.id} 
                                className={`flex justify-between items-center text-sm py-2 px-3 rounded-lg border transition-all duration-500
                                    ${isJustFilled ? 'bg-yellow-100 border-yellow-300 ring-2 ring-yellow-200 scale-[1.02]' : 
                                      isFullyAllocated ? 'bg-green-50 border-green-100' : 'bg-white border-stone-200 shadow-sm'
                                    }`}
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-stone-300 w-4 text-xs font-mono">#{idx + 1}</span>
                                <div className="flex items-center gap-2">
                                    <User size={14} className="text-stone-400"/>
                                    <span className={`font-bold ${isFullyAllocated ? 'text-green-800' : 'text-stone-700'}`}>
                                    {customer?.lineName || 'Unknown'}
                                    </span>
                                    {isJustFilled && <span className="text-[10px] bg-yellow-400 text-yellow-900 px-1.5 rounded font-bold animate-pulse">剛剛買到!</span>}
                                </div>
                              </div>
                              <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2 text-xs">
                                    <span className="text-stone-400">喊 {order.quantity}</span>
                                    <span className="text-stone-300">→</span>
                                    <span className={`font-bold text-base ${isFullyAllocated ? 'text-green-600' : 'text-pink-500'}`}>
                                      獲 {order.quantityBought}
                                    </span>
                                </div>
                                <button 
                                    onClick={() => toggleNotification(order)}
                                    className={`p-1.5 rounded-full transition-colors ${isNotified ? 'bg-green-200 text-green-700' : 'bg-stone-100 text-stone-400 hover:bg-stone-200'}`}
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

      {/* Batch Add Modal */}
      {batchModeItem && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
             <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 animate-in zoom-in-95">
                 <h3 className="text-lg font-bold text-stone-800 mb-2">本次買到數量</h3>
                 <p className="text-sm text-stone-500 mb-4">{batchModeItem.name}</p>
                 
                 <div className="flex gap-2">
                    <input 
                       type="number" 
                       className="flex-1 border-2 border-blue-500 rounded-lg text-2xl font-bold text-center py-2 focus:outline-none"
                       autoFocus
                       placeholder="0"
                       value={batchQty}
                       onChange={e => setBatchQty(e.target.value)}
                       onKeyDown={e => e.key === 'Enter' && handleBatchAdd()}
                    />
                 </div>
                 <p className="text-xs text-stone-400 mt-2 text-center">輸入這次剛剛拿到的數量，系統會自動分配</p>
                 
                 <div className="grid grid-cols-2 gap-3 mt-6">
                    <button onClick={() => {setBatchModeItem(null); setBatchQty('');}} className="py-3 bg-stone-100 text-stone-600 font-bold rounded-lg">取消</button>
                    <button onClick={handleBatchAdd} className="py-3 bg-blue-600 text-white font-bold rounded-lg shadow-lg shadow-blue-200">確認分配</button>
                 </div>
             </div>
          </div>
      )}

      {/* Product Detail Modal */}
      {viewingProduct && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setViewingProduct(null)}>
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                  <div className="relative aspect-square bg-stone-100">
                      <img src={viewingProduct.imageUrl} className="w-full h-full object-contain" alt={viewingProduct.name} />
                      <button onClick={() => setViewingProduct(null)} className="absolute top-2 right-2 bg-black/50 text-white p-1 rounded-full hover:bg-black/70">
                          <X size={20}/>
                      </button>
                  </div>
                  <div className="p-5">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                            <h3 className="text-xl font-bold text-stone-800">{viewingProduct.name}</h3>
                            <p className="text-stone-500">{viewingProduct.brand}</p>
                        </div>
                        <div className="text-right">
                             <div className="text-2xl font-bold text-blue-600">NT$ {viewingProduct.priceTWD}</div>
                             <div className="text-xs text-stone-400">¥ {viewingProduct.priceJPY}</div>
                        </div>
                      </div>
                      
                      <div className="flex gap-2 mb-4">
                          <span className="bg-stone-100 text-stone-600 px-2 py-1 rounded text-xs">{viewingProduct.category}</span>
                      </div>

                      {viewingProduct.variants.length > 0 && (
                          <div className="bg-stone-50 p-3 rounded-lg border border-stone-100">
                              <span className="text-xs text-stone-400 font-bold uppercase tracking-wider mb-2 block">Available Variants</span>
                              <div className="flex flex-wrap gap-2">
                                  {viewingProduct.variants.map(v => (
                                      <span key={v} className="bg-white border border-stone-200 text-stone-700 px-2 py-1 rounded text-sm font-medium">{v}</span>
                                  ))}
                              </div>
                          </div>
                      )}
                      
                      <button onClick={() => setViewingProduct(null)} className="w-full mt-4 bg-stone-100 text-stone-600 py-3 rounded-lg font-bold hover:bg-stone-200">
                          關閉
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
