
import React, { useState, useMemo } from 'react';
import { Customer, Order, Product } from '../types';
import { showAlert } from '../App';
import { Package, User, Box, ArrowRight, CheckSquare, Square, Trash2, Search, X, Plus, Edit2, Check, XCircle, AlertTriangle } from 'lucide-react';

interface InventoryProps {
  customers: Customer[];
  orders: Order[];
  products: Product[];
  onUpdateOrder: (o: Order) => void;
  onBulkUpdateOrders?: (orders: Order[]) => void;
  onAddOrder?: (o: Order, c?: Customer) => void;
  onDeleteOrder?: (id: string) => void;
  onUpdateCustomer?: (c: Customer) => void;
}

// Helper
const generateId = () => Math.random().toString(36).substring(2, 10);

export const Inventory: React.FC<InventoryProps> = ({ customers, orders, products, onUpdateOrder, onBulkUpdateOrders, onAddOrder, onDeleteOrder, onUpdateCustomer }) => {
  const [activeTab, setActiveTab] = useState<'packing' | 'totals' | 'stock'>('packing');
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);
  const [totalsSearchTerm, setTotalsSearchTerm] = useState('');
  const [isTotalsSearchDropdownOpen, setIsTotalsSearchDropdownOpen] = useState(false);
  const [stockSearchTerm, setStockSearchTerm] = useState('');
  const [stockProdSearch, setStockProdSearch] = useState('');
  const [isStockProdDropdownOpen, setIsStockProdDropdownOpen] = useState(false);
  
  // Stock Re-assign State
  const [reassigningOrder, setReassigningOrder] = useState<Order | null>(null);
  const [targetCustomerName, setTargetCustomerName] = useState('');

  // Quick Stock Add State
  const [stockProdId, setStockProdId] = useState('');
  const [stockQty, setStockQty] = useState(1);
  const [stockVariant, setStockVariant] = useState('');

  // Order Editing State
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [editOrderForm, setEditOrderForm] = useState<{variant: string, quantityBought: number}>({variant: '', quantityBought: 1});

  // Bulk Abandon Confirmation State
  const [abandonConfirm, setAbandonConfirm] = useState<{orders: Order[], customerName: string} | null>(null);

  // Delete Confirmation State
  const [deleteConfirm, setDeleteConfirm] = useState<Order | null>(null);

  // Find the Stock Customer ID (Used for display filtering)
  const stockCustomer = customers.find(c => c.isStock);
  const stockCustomerId = stockCustomer?.id;

  // Filter Active Orders Only
  const activeOrders = orders.filter(o => !o.isArchived);

  // --- Data Logic ---
  
  // 1. Packing View: Group by Real Customer
  const customerPackages = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return customers
      .filter(c => !c.isStock) // Exclude stock user
      .map(customer => {
        // Filter to only items that have actually been BOUGHT
        const myOrders = activeOrders.filter(o => o.customerId === customer.id && (o.quantityBought || 0) > 0);
        
        if (myOrders.length === 0) return null;
        
        // Filter by search term (Customer name OR any product in the package)
        const matchesCustomer = customer.lineName.toLowerCase().includes(term) || (customer.nickname || '').toLowerCase().includes(term);
        const matchesAnyProduct = myOrders.some(order => {
            const product = products.find(p => p.id === order.productId);
            if (!product) return false;
            return product.name.toLowerCase().includes(term) || 
                   (product.brand || '').toLowerCase().includes(term) || 
                   (product.category || '').toLowerCase().includes(term);
        });

        if (term && !matchesCustomer && !matchesAnyProduct) return null;

        const isFullyPacked = myOrders.every(o => o.status === 'PACKED' || o.status === 'SHIPPED');
        
        return {
          customer,
          orders: myOrders,
          isFullyPacked
        };
      })
      .filter(Boolean)
      .sort((a, b) => (a!.isFullyPacked === b!.isFullyPacked ? 0 : a!.isFullyPacked ? 1 : -1)); // Unpacked first
  }, [customers, activeOrders, searchTerm, products]);

  // 2. Totals View: Group by Product
  const productTotals = useMemo(() => {
    const map = new Map<string, { product: Product; qty: number; variants: Record<string, number> }>();
    
    // Only count bought items
    activeOrders.filter(o => (o.quantityBought || 0) > 0).forEach(order => {
       const product = products.find(p => p.id === order.productId);
       if (!product) return;
       
       // Filter logic
       if (totalsSearchTerm) {
         const term = totalsSearchTerm.toLowerCase();
         const matchesName = product.name.toLowerCase().includes(term);
         const matchesBrand = (product.brand || '').toLowerCase().includes(term);
         const matchesCategory = (product.category || '').toLowerCase().includes(term);
         if (!matchesName && !matchesBrand && !matchesCategory) return;
       }

       const existing = map.get(product.id) || { product, qty: 0, variants: {} };
       
       // Count actual bought quantity
       const bought = order.quantityBought || 0;
       existing.qty += bought;
       
       const v = order.variant || 'default';
       existing.variants[v] = (existing.variants[v] || 0) + bought;
       
       map.set(product.id, existing);
    });
    
    return Array.from(map.values()).sort((a, b) => b.qty - a.qty);
  }, [activeOrders, products, totalsSearchTerm]);

  // 3. Stock View: Orders belonging to Stock Customer
  const stockItems = useMemo(() => {
     if (!stockCustomerId) return [];
     const term = stockSearchTerm.toLowerCase();
     return activeOrders.filter(o => {
         if (o.customerId !== stockCustomerId) return false;
         if (!term) return true;
         const product = products.find(p => p.id === o.productId);
         if (!product) return false;
         return product.name.toLowerCase().includes(term) || 
                (product.brand || '').toLowerCase().includes(term) || 
                (product.category || '').toLowerCase().includes(term);
     });
  }, [activeOrders, stockCustomerId, stockSearchTerm, products]);

  // --- Handlers ---

  const handleTogglePacked = (order: Order) => {
     const newStatus = order.status === 'PACKED' ? 'BOUGHT' : 'PACKED';
     onUpdateOrder({ ...order, status: newStatus });
  };

  const handleRealDeleteOrder = (e: React.MouseEvent, order: Order) => {
     e.stopPropagation();
     setDeleteConfirm(order);
  };

  const executeDeleteOrder = () => {
      if (deleteConfirm && onDeleteOrder) {
          onDeleteOrder(deleteConfirm.id);
      }
      setDeleteConfirm(null);
  };

  const handleBulkAbandon = (e: React.MouseEvent, ordersToAbandon: Order[], customer: Customer) => {
      e.stopPropagation();
      e.preventDefault();
      setAbandonConfirm({ orders: ordersToAbandon, customerName: customer.nickname || customer.lineName });
  };

  const executeBulkAbandon = () => {
      if (!abandonConfirm) return;
      const { orders: ordersToAbandon } = abandonConfirm;

      // Find stock customer ID dynamically to ensure it's fresh
      const stockCust = customers.find(c => c.isStock);
      if (!stockCust) {
          showAlert("錯誤：找不到庫存專用帳號，無法棄單。請重整頁面。");
          setAbandonConfirm(null);
          return;
      }

      const firstOrder = ordersToAbandon[0];
      const customerToBlacklist = customers.find(c => c.id === firstOrder?.customerId);
      
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

      // Blacklist the customer
      if (customerToBlacklist && onUpdateCustomer) {
          onUpdateCustomer({ ...customerToBlacklist, isBlacklisted: true });
      }
      
      setAbandonConfirm(null);
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
          showAlert("請選擇款式");
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

  const handleDeleteStockItem = (e: React.MouseEvent, order: Order) => {
      e.stopPropagation();
      setDeleteConfirm(order);
  };

  const startEditing = (order: Order) => {
      setEditingOrderId(order.id);
      setEditOrderForm({
          variant: order.variant || '',
          quantityBought: order.quantityBought || 0
      });
  };

  const saveEditing = (order: Order) => {
      onUpdateOrder({
          ...order,
          variant: editOrderForm.variant,
          quantityBought: Number(editOrderForm.quantityBought)
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
    <div className="space-y-5">
      {/* Custom Delete Confirmation Modal */}
      {deleteConfirm && (
          <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
              <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
                  <div className="text-center">
                      <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                          <Trash2 size={32} />
                      </div>
                      <h3 className="text-xl font-medium text-stone-800 mb-2">確定要永久刪除嗎？</h3>
                      <p className="text-stone-500 text-sm leading-relaxed">
                          您即將永久刪除此商品訂單。<br/>
                          <strong className="text-red-500">如果是Key錯請按確定，若是要移至現貨請使用上方的整單棄單。</strong>
                      </p>
                  </div>
                  <div className="flex border-t border-stone-100">
                      <button 
                          onClick={() => setDeleteConfirm(null)}
                          className="flex-1 px-6 py-4 text-stone-500 font-medium hover:bg-stone-50 transition-colors"
                      >
                          取消
                      </button>
                      <button 
                          onClick={executeDeleteOrder}
                          className="flex-1 px-6 py-4 bg-red-600 text-white font-medium hover:bg-red-700 transition-colors"
                      >
                          確定刪除
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Custom Abandon Confirmation Modal */}
      {abandonConfirm && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in duration-200">
                  <div className="p-6 text-center">
                      <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                          <AlertTriangle size={32} />
                      </div>
                      <h3 className="text-xl font-medium text-stone-800 mb-2">確定要整單棄單嗎？</h3>
                      <p className="text-stone-500 text-sm leading-relaxed">
                          您即將將 <span className="font-medium text-stone-800">{abandonConfirm.customerName}</span> 的 
                          <span className="font-medium text-red-600 mx-1">{abandonConfirm.orders.length}</span> 
                          件商品全部轉入庫存。<br/>
                          <strong className="text-red-500">此動作會同時將該客人設為黑名單。</strong>
                      </p>
                  </div>
                  <div className="flex border-t border-stone-100">
                      <button 
                          onClick={() => setAbandonConfirm(null)}
                          className="flex-1 px-6 py-4 text-stone-500 font-medium hover:bg-stone-50 transition-colors"
                      >
                          取消
                      </button>
                      <button 
                          onClick={executeBulkAbandon}
                          className="flex-1 px-6 py-4 bg-red-600 text-white font-medium hover:bg-red-700 transition-colors"
                      >
                          確定棄單
                      </button>
                  </div>
              </div>
          </div>
      )}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
          <h2 className="text-2xl font-medium text-stone-800 flex items-center gap-2">
            <Package className="text-[#7A9E8A]" />
            貨物管理與分裝
          </h2>
          
          <div className="flex bg-stone-100 p-1 rounded-lg">
             <button 
               onClick={() => setActiveTab('packing')}
               className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${activeTab === 'packing' ? 'bg-white text-[#7A9E8A] shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
             >
               分貨打包
             </button>
             <button 
               onClick={() => setActiveTab('totals')}
               className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${activeTab === 'totals' ? 'bg-white text-[#7A9E8A] shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
             >
               商品總覽
             </button>
             <button 
               onClick={() => setActiveTab('stock')}
               className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${activeTab === 'stock' ? 'bg-white text-amber-600 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
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
                    placeholder="搜尋客人、商品、品牌或類別..." 
                    className="w-full pl-9 pr-4 py-2 bg-white border border-stone-200 rounded-lg focus:ring-2 focus:ring-blue-500 font-medium"
                    value={searchTerm}
                    onChange={e => { setSearchTerm(e.target.value); setIsSearchDropdownOpen(true); }}
                    onFocus={() => setIsSearchDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setIsSearchDropdownOpen(false), 200)}
                />
                {isSearchDropdownOpen && searchTerm && (
                  <div className="absolute top-full left-0 w-full bg-white border border-stone-200 shadow-xl rounded-xl z-50 mt-1 max-h-60 overflow-y-auto">
                    {customerPackages.slice(0, 10).map(pkg => (
                      <button key={pkg!.customer.id} className="w-full text-left px-4 py-3 hover:bg-[#E5EFEA] border-b border-stone-100 last:border-0 transition-colors" onClick={() => { setSearchTerm(pkg!.customer.lineName); setIsSearchDropdownOpen(false); }}>
                        <div className="font-medium text-stone-700 text-sm">{pkg!.customer.lineName}</div>
                        <div className="text-xs text-stone-400">{pkg!.customer.nickname || '無暱稱'}</div>
                      </button>
                    ))}
                  </div>
                )}
            </div>
            
            <div className="bg-[#E5EFEA] p-3 rounded-lg border border-[#7A9E8A]/20 text-sm text-[#2C2926] flex items-start gap-2">
                 <Package size={16} className="mt-0.5 flex-shrink-0" />
                 <span>此頁面僅顯示「已買到」的商品。若需修改客人喊單內容，請前往「顧客管理 (CRM)」頁面。</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {customerPackages.map((pkg) => (
                    <div key={pkg!.customer.id} className={`bg-white rounded-xl shadow-sm border overflow-hidden ${pkg!.isFullyPacked ? 'border-green-200 opacity-80' : 'border-[#7A9E8A]/20'}`}>
                        <div className={`p-3 flex justify-between items-center ${pkg!.isFullyPacked ? 'bg-green-50' : 'bg-[#E5EFEA]'}`}>
                            <div className="font-medium text-stone-800 flex items-center gap-2">
                                <User size={16} />
                                {pkg!.customer.lineName}
                            </div>
                            <div className="flex items-center gap-2">
                                <button 
                                    type="button"
                                    onClick={(e) => handleBulkAbandon(e, pkg!.orders, pkg!.customer)}
                                    className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded border border-red-200 hover:bg-red-200 flex items-center gap-1"
                                    title="全部移入庫存"
                                >
                                    <AlertTriangle size={12} /> 整單棄單
                                </button>
                                {pkg!.isFullyPacked && <span className="text-xs bg-green-200 text-green-800 px-2 py-1 rounded-full font-medium">已打包</span>}
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
                                                        value={editOrderForm.quantityBought}
                                                        onChange={e => setEditOrderForm({...editOrderForm, quantityBought: Number(e.target.value)})}
                                                    />
                                                    <button type="button" onClick={() => saveEditing(order)} className="text-green-600 hover:bg-green-100 p-1 rounded"><Check size={16}/></button>
                                                    <button type="button" onClick={() => setEditingOrderId(null)} className="text-stone-400 hover:bg-stone-100 p-1 rounded"><XCircle size={16}/></button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-3 overflow-hidden flex-1">
                                                    <button type="button" onClick={() => handleTogglePacked(order)} className={`flex-shrink-0 ${isPacked ? 'text-green-500' : 'text-stone-300 hover:text-[#7A9E8A]'}`}>
                                                        {isPacked ? <CheckSquare size={20} /> : <Square size={20} />}
                                                    </button>
                                                    <div className="min-w-0">
                                                        <p className={`text-sm font-medium truncate ${isPacked ? 'text-stone-400 line-through' : 'text-stone-700'}`}>
                                                            {prod?.name}
                                                        </p>
                                                        <p className="text-xs text-stone-500">
                                                            {order.variant && <span className="bg-stone-100 px-1 rounded mr-1 font-medium text-stone-600">{order.variant}</span>}
                                                            x <span className="font-medium text-lg text-[#7A9E8A]">{order.quantityBought}</span>
                                                        </p>
                                                    </div>
                                                </div>
                                            )}
                                            
                                            {!isEditing && (
                                                <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button 
                                                        type="button"
                                                        onClick={() => startEditing(order)}
                                                        className="text-stone-300 hover:text-[#7A9E8A] p-1 mr-1"
                                                        title="編輯"
                                                    >
                                                        <Edit2 size={16} />
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
                    className="w-full pl-9 pr-4 py-2 bg-white border border-stone-200 rounded-lg focus:ring-2 focus:ring-blue-500 font-medium"
                    value={totalsSearchTerm}
                    onChange={e => { setTotalsSearchTerm(e.target.value); setIsTotalsSearchDropdownOpen(true); }}
                    onFocus={() => setIsTotalsSearchDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setIsTotalsSearchDropdownOpen(false), 200)}
                />
                {isTotalsSearchDropdownOpen && totalsSearchTerm && (
                  <div className="absolute top-full left-0 w-full bg-white border border-stone-200 shadow-xl rounded-xl z-50 mt-1 max-h-60 overflow-y-auto">
                    {productTotals.slice(0, 10).map(item => (
                      <button key={item.product.id} className="w-full text-left px-4 py-3 hover:bg-[#E5EFEA] border-b border-stone-100 last:border-0 transition-colors" onClick={() => { setTotalsSearchTerm(item.product.name); setIsTotalsSearchDropdownOpen(false); }}>
                        <div className="font-medium text-stone-700 text-sm">{item.product.name}</div>
                        <div className="text-xs text-stone-400">{item.product.brand || '無品牌'}</div>
                      </button>
                    ))}
                  </div>
                )}
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-stone-50 text-stone-500 text-xs uppercase tracking-wider">
                        <tr>
                            <th className="p-4 font-medium">商品名稱</th>
                            <th className="p-4 font-medium text-right">已買到總數</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                        {productTotals.map((item, idx) => (
                            <tr key={idx} className="hover:bg-stone-50">
                                <td className="p-4">
                                    <div className="font-medium text-stone-800">{item.product.name}</div>
                                    <div className="flex gap-2 mt-1">
                                        {Object.entries(item.variants).map(([variant, count]) => (
                                            <span key={variant} className="text-xs bg-[#E5EFEA] text-[#5C8070] px-2 py-0.5 rounded border border-[#7A9E8A]/20">
                                                {variant === 'default' ? '單一規格' : variant}: {count}
                                            </span>
                                        ))}
                                    </div>
                                </td>
                                <td className="p-4 text-right">
                                    <span className="text-xl font-medium text-[#7A9E8A]">{item.qty}</span>
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
                    <h4 className="font-medium text-stone-700 text-sm flex items-center gap-1"><Plus size={16}/> 新增現貨</h4>
                    <div className="flex gap-2">
                        <div className="relative flex-1 max-w-[200px]">
                            <input 
                                type="text"
                                className="w-full border border-stone-200 rounded px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-amber-500"
                                placeholder="搜尋商品..."
                                value={stockProdSearch}
                                onChange={e => {
                                    setStockProdSearch(e.target.value);
                                    setIsStockProdDropdownOpen(true);
                                }}
                                onFocus={() => setIsStockProdDropdownOpen(true)}
                                onBlur={() => setTimeout(() => setIsStockProdDropdownOpen(false), 200)}
                            />
                            {isStockProdDropdownOpen && (
                                <div className="absolute top-full left-0 w-full bg-white border border-stone-200 shadow-xl rounded-lg z-50 mt-1 max-h-60 overflow-y-auto">
                                    <button 
                                        className="w-full text-left px-3 py-2 hover:bg-amber-50 text-sm border-b border-stone-100"
                                        onClick={() => {
                                            setStockProdId('');
                                            setStockProdSearch('');
                                            setIsStockProdDropdownOpen(false);
                                        }}
                                    >
                                        選擇商品...
                                    </button>
                                    {products
                                        .filter(p => p.name.toLowerCase().includes(stockProdSearch.toLowerCase()))
                                        .map(p => (
                                            <button 
                                                key={p.id} 
                                                className="w-full text-left px-3 py-2 hover:bg-amber-50 text-sm border-b border-stone-100 last:border-0"
                                                onClick={() => {
                                                    setStockProdId(p.id);
                                                    setStockProdSearch(p.name);
                                                    setStockVariant('');
                                                    setIsStockProdDropdownOpen(false);
                                                }}
                                            >
                                                {p.name}
                                            </button>
                                        ))
                                    }
                                </div>
                            )}
                        </div>
                        {selectedStockProd && selectedStockProd.variants.length > 0 && (
                            <select 
                                className="w-24 border border-stone-200 rounded px-2 py-1 text-sm"
                                value={stockVariant}
                                onChange={e => setStockVariant(e.target.value)}
                            >
                                <option value="">款式...</option>
                                {selectedStockProd.variants.map(v => <option key={v} value={v}>{v}</option>)}
                            </select>
                        )}
                        <input 
                           type="number" min="1" 
                           className="w-16 border border-stone-200 rounded px-2 py-1 text-sm"
                           value={stockQty}
                           onChange={e => setStockQty(Number(e.target.value))}
                        />
                        <button type="button" onClick={handleAddStock} className="bg-amber-500 text-white px-3 py-1 rounded text-sm hover:bg-amber-600">新增</button>
                    </div>
                </div>
            </div>

            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 w-4 h-4" />
                <input 
                    type="text" 
                    placeholder="搜尋現貨商品、品牌或類別..." 
                    className="w-full pl-9 pr-4 py-2 bg-white border border-stone-200 rounded-lg focus:ring-2 focus:ring-amber-500 font-medium"
                    value={stockSearchTerm}
                    onChange={e => setStockSearchTerm(e.target.value)}
                />
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-stone-200">
                {stockItems.length === 0 ? (
                    <div className="p-10 text-center text-stone-400">目前沒有庫存現貨</div>
                ) : (
                    <div className="divide-y divide-stone-100">
                        {stockItems.map(order => {
                            const prod = products.find(p => p.id === order.productId);
                            return (
                                <div key={order.id} className="p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 group">
                                    <div className="flex items-start gap-4">
                                        <div className="w-12 h-12 bg-stone-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                            <Box className="text-stone-400" />
                                        </div>
                                        <div className="text-left">
                                            <h4 className="font-medium text-stone-800">{prod?.name}</h4>
                                            <p className="text-sm text-stone-500">
                                                {order.variant && <span className="mr-2">{order.variant}</span>}
                                                數量: <span className="font-medium text-amber-600">{order.quantity}</span>
                                            </p>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-2">
                                        <button 
                                            type="button"
                                            onClick={() => setReassigningOrder(order)}
                                            className="bg-white border border-stone-200 text-stone-600 px-4 py-2 rounded-lg hover:bg-[#E5EFEA] hover:text-[#7A9E8A] hover:border-blue-200 transition-colors flex items-center gap-2 text-sm font-medium shadow-sm"
                                        >
                                            分配給客人 <ArrowRight size={16} />
                                        </button>
                                        <button 
                                            type="button"
                                            onClick={(e) => handleDeleteStockItem(e, order)}
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
                      <h3 className="font-medium text-stone-800">分配現貨</h3>
                      <button onClick={() => setReassigningOrder(null)}><X size={20} className="text-stone-400" /></button>
                  </div>
                  <div className="p-4 space-y-4">
                      <p className="text-sm text-stone-600">
                          正在分配: <span className="font-medium text-[#7A9E8A]">
                              {products.find(p => p.id === reassigningOrder.productId)?.name} 
                              (x{reassigningOrder.quantity})
                          </span>
                      </p>
                      <div>
                          <input 
                             type="text" 
                             className="w-full border border-stone-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                             placeholder="搜尋客人姓名..."
                             value={targetCustomerName}
                             onChange={e => setTargetCustomerName(e.target.value)}
                             autoFocus
                          />
                      </div>
                      <div className="max-h-48 overflow-y-auto border border-stone-200 rounded-lg divide-y divide-stone-100">
                          {potentialCustomers.map(c => (
                              <button 
                                key={c.id} 
                                onClick={() => handleReassign(c)}
                                className="w-full text-left p-3 hover:bg-[#E5EFEA] text-sm flex justify-between"
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
