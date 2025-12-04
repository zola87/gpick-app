
import React, { useState, useMemo } from 'react';
import { Customer, Order, Product } from '../types';
import { Package, User, Box, ArrowRight, CheckSquare, Square, Trash2, Search, X, Plus, Edit2, Check, XCircle } from 'lucide-react';

interface InventoryProps {
  customers: Customer[];
  orders: Order[];
  products: Product[];
  onUpdateOrder: (o: Order) => void;
  onBulkUpdateOrders?: (orders: Order[]) => void;
  onAddOrder?: (o: Order, c?: Customer) => void;
  onDeleteOrder?: (id: string) => void;
}

// Helper
const generateId = () => Math.random().toString(36).substring(2, 10);

export const Inventory: React.FC<InventoryProps> = ({ customers, orders, products, onUpdateOrder, onBulkUpdateOrders, onAddOrder, onDeleteOrder }) => {
  const [activeTab, setActiveTab] = useState<'packing' | 'totals' | 'stock'>('packing');
  const [searchTerm, setSearchTerm] = useState('');
  const [totalsSearchTerm, setTotalsSearchTerm] = useState('');
  
  // Stock Re-assign State
  const [reassigningOrder, setReassigningOrder] = useState<Order | null>(null);
  const [targetCustomerName, setTargetCustomerName] = useState('');

  // Quick Stock Add State
  const [stockProdId, setStockProdId] = useState('');
  const [stockQty, setStockQty] = useState(1);
  const [stockVariant, setStockVariant] = useState('');

  // Order Editing State
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [editOrderForm, setEditOrderForm] = useState<{variant: string, quantity: number}>({variant: '', quantity: 1});

  // Find the Stock Customer ID (Used for display filtering)
  const stockCustomer = customers.find(c => c.isStock);
  const stockCustomerId = stockCustomer?.id;

  // Filter Active Orders Only
  const activeOrders = orders.filter(o => !o.isArchived);

  // --- Data Logic ---
  
  // 1. Packing View: Group by Real Customer
  const customerPackages = useMemo(() => {
    return customers
      .filter(c => !c.isStock) // Exclude stock user
      .filter(c => c.lineName.toLowerCase().includes(searchTerm.toLowerCase()))
      .map(customer => {
        const myOrders = activeOrders.filter(o => o.customerId === customer.id);
        if (myOrders.length === 0) return null;
        
        const isFullyPacked = myOrders.every(o => o.status === 'PACKED' || o.status === 'SHIPPED');
        
        return {
          customer,
          orders: myOrders,
          isFullyPacked
        };
      })
      .filter(Boolean)
      .sort((a, b) => (a!.isFullyPacked === b!.isFullyPacked ? 0 : a!.isFullyPacked ? 1 : -1)); // Unpacked first
  }, [customers, activeOrders, searchTerm]);

  // 2. Totals View: Group by Product
  const productTotals = useMemo(() => {
    const map = new Map<string, { product: Product; qty: number; variants: Record<string, number> }>();
    
    activeOrders.forEach(order => {
       const product = products.find(p => p.id === order.productId);
       if (!product) return;
       
       // Filter logic
       if (totalsSearchTerm && !product.name.toLowerCase().includes(totalsSearchTerm.toLowerCase())) return;

       const existing = map.get(product.id) || { product, qty: 0, variants: {} };
       existing.qty += order.quantity;
       
       const v = order.variant || 'default';
       existing.variants[v] = (existing.variants[v] || 0) + order.quantity;
       
       map.set(product.id, existing);
    });
    
    return Array.from(map.values()).sort((a, b) => b.qty - a.qty);
  }, [activeOrders, products, totalsSearchTerm]);

  // 3. Stock View: Orders belonging to Stock Customer
  const stockItems = useMemo(() => {
     if (!stockCustomerId) return [];
     return activeOrders.filter(o => o.customerId === stockCustomerId);
  }, [activeOrders, stockCustomerId]);

  // --- Handlers ---

  const handleTogglePacked = (order: Order) => {
     const newStatus = order.status === 'PACKED' ? 'BOUGHT' : 'PACKED';
     onUpdateOrder({ ...order, status: newStatus });
  };

  const handleAbandonOrder = (order: Order) => {
     const stockCust = customers.find(c => c.isStock);
     if (!stockCust) {
         alert("系統錯誤：找不到預設庫存帳號 (Stock)");
         return;
     }
     if (window.confirm("確定棄單？此商品將移入「現貨/庫存區」。")) {
         onUpdateOrder({ 
             ...order, 
             customerId: stockCust.id, 
             status: 'BOUGHT', 
             notificationStatus: 'UNNOTIFIED',
             isPaid: false 
         });
         // Added feedback here just in case single abandon is used
         // alert('已移入現貨區'); 
     }
  };

  const handleBulkAbandon = (ordersToAbandon: Order[]) => {
      // Find stock customer ID dynamically to ensure it's fresh
      const stockCust = customers.find(c => c.isStock);
      if (!stockCust) {
          alert("錯誤：找不到庫存專用帳號，無法棄單。請重整頁面。");
          return;
      }
      
      if (window.confirm(`確定將這位客人的 ${ordersToAbandon.length} 件商品全部棄單轉入庫存？`)) {
          const updates = ordersToAbandon.map(o => ({
              ...o, 
              customerId: stockCust.id, 
              status: 'BOUGHT', 
              notificationStatus: 'UNNOTIFIED',
              isPaid: false
          } as Order));

          if (onBulkUpdateOrders) {
              onBulkUpdateOrders(updates);
          } else {
              // Fallback
              updates.forEach(o => onUpdateOrder(o));
          }
          
          // CRITICAL FEEDBACK
          alert(`已成功將 ${updates.length} 件商品移入「現貨/庫存」分頁！`);
      }
  };

  const handleReassign = (targetCust: Customer) => {
     if (reassigningOrder) {
         onUpdateOrder({ ...reassigningOrder, customerId: targetCust.id, status: 'BOUGHT' });
         setReassigningOrder(null);
         setTargetCustomerName('');
     }
  };

  const handleAddStock = () => {
      if (!onAddOrder || !stockCustomerId || !stockProdId) return;
      const prod = products.find(p => p.id === stockProdId);
      if(prod && prod.variants.length > 0 && !stockVariant) {
          alert("請選擇款式");
          return;
      }

      const newOrder: Order = {
          id: generateId(),
          productId: stockProdId,
          variant: stockVariant,
          quantity: stockQty,
          quantityBought: stockQty, // Already bought if adding to stock
          customerId: stockCustomerId,
          status: 'BOUGHT',
          notificationStatus: 'UNNOTIFIED',
          isArchived: false,
          timestamp: Date.now()
      };
      
      onAddOrder(newOrder);
      setStockProdId('');
      setStockQty(1);
      setStockVariant('');
  };

  const handleDeleteStockItem = (orderId: string) => {
      if(window.confirm('確定要刪除這筆現貨嗎？此操作無法復原。')) {
          onDeleteOrder && onDeleteOrder(orderId);
      }
  };

  const startEditing = (order: Order) => {
      setEditingOrderId(order.id);
      setEditOrderForm({
          variant: order.variant || '',
          quantity: order.quantity
      });
  };

  const saveEditing = (order: Order) => {
      onUpdateOrder({
          ...order,
          variant: editOrderForm.variant,
          quantity: Number(editOrderForm.quantity)
      });
      setEditingOrderId(null);
  };

  // Filter customers for reassignment dropdown
  const potentialCustomers = customers
      .filter(c => !c.isStock)
      .filter(c => c.lineName.toLowerCase().includes(targetCustomerName.toLowerCase()));

  // Active Product for stock selection
  const selectedStockProd = products.find(p => p.id === stockProdId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h2 className="text-2xl font-bold text-stone-800 flex items-center gap-2">
            <Package className="text-blue-600" />
            貨物管理與分裝
          </h2>
          
          <div className="flex bg-stone-200 p-1 rounded-lg">
             <button 
               onClick={() => setActiveTab('packing')}
               className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${activeTab === 'packing' ? 'bg-white text-blue-600 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
             >
               分貨打包
             </button>
             <button 
               onClick={() => setActiveTab('totals')}
               className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${activeTab === 'totals' ? 'bg-white text-blue-600 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
             >
               商品總覽
             </button>
             <button 
               onClick={() => setActiveTab('stock')}
               className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${activeTab === 'stock' ? 'bg-white text-amber-600 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
             >
               現貨/庫存 ({stockItems.length})
             </button>
          </div>
      </div>

      {/* --- TAB 1: PACKING --- */}
      {activeTab === 'packing' && (
         <div className="space-y-4">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 w-4 h-4" />
                <input 
                    type="text" 
                    placeholder="搜尋客人..." 
                    className="w-full pl-9 pr-4 py-2 bg-white border border-stone-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {customerPackages.map((pkg) => (
                    <div key={pkg!.customer.id} className={`bg-white rounded-xl shadow-sm border overflow-hidden ${pkg!.isFullyPacked ? 'border-green-200 opacity-80' : 'border-blue-100'}`}>
                        <div className={`p-3 flex justify-between items-center ${pkg!.isFullyPacked ? 'bg-green-50' : 'bg-blue-50'}`}>
                            <div className="font-bold text-stone-800 flex items-center gap-2">
                                <User size={16} />
                                {pkg!.customer.lineName}
                            </div>
                            <div className="flex items-center gap-2">
                                <button 
                                    type="button"
                                    onClick={() => handleBulkAbandon(pkg!.orders)}
                                    className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded border border-red-200 hover:bg-red-200"
                                    title="全部移入庫存"
                                >
                                    整單棄單
                                </button>
                                {pkg!.isFullyPacked && <span className="text-xs bg-green-200 text-green-800 px-2 py-1 rounded-full font-bold">已打包</span>}
                            </div>
                        </div>
                        <div className="p-2">
                            {pkg!.orders.map(order => {
                                const prod = products.find(p => p.id === order.productId);
                                const isPacked = order.status === 'PACKED' || order.status === 'SHIPPED';
                                const isEditing = editingOrderId === order.id;

                                return (
                                    <div key={order.id} className="flex flex-col p-2 hover:bg-stone-50 rounded group border-b border-stone-50 last:border-0">
                                        <div className="flex items-center justify-between w-full">
                                            {isEditing ? (
                                                <div className="flex-1 flex gap-2 items-center">
                                                    <select 
                                                        className="border rounded text-sm py-1 px-1 bg-white max-w-[80px]"
                                                        value={editOrderForm.variant}
                                                        onChange={e => setEditOrderForm({...editOrderForm, variant: e.target.value})}
                                                    >
                                                        <option value="">無</option>
                                                        {prod?.variants.map(v => <option key={v} value={v}>{v}</option>)}
                                                    </select>
                                                    <input 
                                                        type="number" min="1"
                                                        className="border rounded text-sm py-1 px-1 w-16"
                                                        value={editOrderForm.quantity}
                                                        onChange={e => setEditOrderForm({...editOrderForm, quantity: Number(e.target.value)})}
                                                    />
                                                    <button type="button" onClick={() => saveEditing(order)} className="text-green-600 hover:bg-green-100 p-1 rounded"><Check size={16}/></button>
                                                    <button type="button" onClick={() => setEditingOrderId(null)} className="text-stone-400 hover:bg-stone-100 p-1 rounded"><XCircle size={16}/></button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-3 overflow-hidden flex-1">
                                                    <button type="button" onClick={() => handleTogglePacked(order)} className={`flex-shrink-0 ${isPacked ? 'text-green-500' : 'text-stone-300 hover:text-blue-500'}`}>
                                                        {isPacked ? <CheckSquare size={20} /> : <Square size={20} />}
                                                    </button>
                                                    <div className="min-w-0">
                                                        <p className={`text-sm font-medium truncate ${isPacked ? 'text-stone-400 line-through' : 'text-stone-700'}`}>
                                                            {prod?.name}
                                                        </p>
                                                        <p className="text-xs text-stone-500">
                                                            {order.variant && <span className="bg-stone-100 px-1 rounded mr-1 font-bold text-stone-600">{order.variant}</span>}
                                                            x {order.quantity}
                                                        </p>
                                                    </div>
                                                </div>
                                            )}
                                            
                                            {!isEditing && (
                                                <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button 
                                                        type="button"
                                                        onClick={() => startEditing(order)}
                                                        className="text-stone-300 hover:text-blue-500 p-1 mr-1"
                                                        title="編輯"
                                                    >
                                                        <Edit2 size={16} />
                                                    </button>
                                                    <button 
                                                        type="button"
                                                        onClick={() => handleAbandonOrder(order)}
                                                        className="text-stone-300 hover:text-red-500 p-1"
                                                        title="棄單 (移至現貨)"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
         </div>
      )}

      {/* --- TAB 2: TOTALS --- */}
      {activeTab === 'totals' && (
         <div className="space-y-4">
             <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 w-4 h-4" />
                <input 
                    type="text" 
                    placeholder="搜尋商品總覽..." 
                    className="w-full pl-9 pr-4 py-2 bg-white border border-stone-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                    value={totalsSearchTerm}
                    onChange={e => setTotalsSearchTerm(e.target.value)}
                />
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-stone-50 text-stone-500 text-xs uppercase tracking-wider">
                        <tr>
                            <th className="p-4 font-medium">商品名稱</th>
                            <th className="p-4 font-medium text-right">總數量</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                        {productTotals.map((item, idx) => (
                            <tr key={idx} className="hover:bg-stone-50">
                                <td className="p-4">
                                    <div className="font-bold text-stone-800">{item.product.name}</div>
                                    <div className="flex gap-2 mt-1">
                                        {Object.entries(item.variants).map(([variant, count]) => (
                                            <span key={variant} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-100">
                                                {variant === 'default' ? '單一規格' : variant}: {count}
                                            </span>
                                        ))}
                                    </div>
                                </td>
                                <td className="p-4 text-right">
                                    <span className="text-xl font-bold text-blue-600">{item.qty}</span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
         </div>
      )}

      {/* --- TAB 3: STOCK --- */}
      {activeTab === 'stock' && (
         <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex gap-3 text-amber-800 text-sm">
                    <Box className="flex-shrink-0 mt-1" />
                    <p>
                        這裡是「棄單」或「多買」的商品暫存區。
                        <br />
                        此處的商品<strong>不會</strong>隨連線結束而刪除，會保留至分配給客人為止。
                    </p>
                </div>
                
                {/* Quick Add Stock Form */}
                <div className="bg-white border border-stone-200 p-4 rounded-lg shadow-sm flex flex-col gap-3">
                    <h4 className="font-bold text-stone-700 text-sm flex items-center gap-1"><Plus size={16}/> 新增現貨</h4>
                    <div className="flex gap-2">
                        <select 
                           className="flex-1 border rounded px-2 py-1 text-sm max-w-[150px]"
                           value={stockProdId}
                           onChange={e => {setStockProdId(e.target.value); setStockVariant('');}}
                        >
                            <option value="">選擇商品...</option>
                            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        {selectedStockProd && selectedStockProd.variants.length > 0 && (
                            <select 
                                className="w-24 border rounded px-2 py-1 text-sm"
                                value={stockVariant}
                                onChange={e => setStockVariant(e.target.value)}
                            >
                                <option value="">款式...</option>
                                {selectedStockProd.variants.map(v => <option key={v} value={v}>{v}</option>)}
                            </select>
                        )}
                        <input 
                           type="number" min="1" 
                           className="w-16 border rounded px-2 py-1 text-sm"
                           value={stockQty}
                           onChange={e => setStockQty(Number(e.target.value))}
                        />
                        <button type="button" onClick={handleAddStock} className="bg-amber-500 text-white px-3 py-1 rounded text-sm hover:bg-amber-600">新增</button>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-stone-200">
                {stockItems.length === 0 ? (
                    <div className="p-10 text-center text-stone-400">目前沒有庫存現貨</div>
                ) : (
                    <div className="divide-y divide-stone-100">
                        {stockItems.map(order => {
                            const prod = products.find(p => p.id === order.productId);
                            return (
                                <div key={order.id} className="p-4 flex flex-col md:flex-row justify-between items-center gap-4 group">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-stone-100 rounded-lg flex items-center justify-center">
                                            <Box className="text-stone-400" />
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-stone-800">{prod?.name}</h4>
                                            <p className="text-sm text-stone-500">
                                                {order.variant && <span className="mr-2">{order.variant}</span>}
                                                數量: <span className="font-bold text-amber-600">{order.quantity}</span>
                                            </p>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-2">
                                        <button 
                                            type="button"
                                            onClick={() => setReassigningOrder(order)}
                                            className="bg-white border border-stone-200 text-stone-600 px-4 py-2 rounded-lg hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors flex items-center gap-2 text-sm font-medium shadow-sm"
                                        >
                                            分配給客人 <ArrowRight size={16} />
                                        </button>
                                        <button 
                                            type="button"
                                            onClick={() => handleDeleteStockItem(order.id)}
                                            className="p-2 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                            title="刪除"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
         </div>
      )}

      {/* Reassign Modal */}
      {reassigningOrder && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
                  <div className="p-4 border-b bg-stone-50 flex justify-between items-center">
                      <h3 className="font-bold text-stone-800">分配現貨</h3>
                      <button onClick={() => setReassigningOrder(null)}><X size={20} className="text-stone-400" /></button>
                  </div>
                  <div className="p-4 space-y-4">
                      <p className="text-sm text-stone-600">
                          正在分配: <span className="font-bold text-blue-600">
                              {products.find(p => p.id === reassigningOrder.productId)?.name} 
                              (x{reassigningOrder.quantity})
                          </span>
                      </p>
                      <div>
                          <input 
                             type="text" 
                             className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                             placeholder="搜尋客人姓名..."
                             value={targetCustomerName}
                             onChange={e => setTargetCustomerName(e.target.value)}
                             autoFocus
                          />
                      </div>
                      <div className="max-h-48 overflow-y-auto border rounded-lg divide-y divide-stone-100">
                          {potentialCustomers.map(c => (
                              <button 
                                key={c.id} 
                                onClick={() => handleReassign(c)}
                                className="w-full text-left p-3 hover:bg-blue-50 text-sm flex justify-between"
                              >
                                  <span>{c.lineName}</span>
                                  <span className="text-stone-400">{c.nickname}</span>
                              </button>
                          ))}
                          {potentialCustomers.length === 0 && (
                              <div className="p-3 text-center text-stone-400 text-sm">無符合結果</div>
                          )}
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
