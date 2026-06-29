
import React, { useState } from 'react';
import { Customer, Order, Product, GlobalSettings } from '../types';
import { showAlert } from '../App';
import { Search, User, Phone, MapPin, Calendar, Edit2, AlertTriangle, Save, X, BarChart2, ChevronDown, ChevronUp, Trash2, StickyNote, Award, Crown, Sprout, Skull, History, Plus, UserPlus, Package, ShoppingCart, Check, CreditCard, AlignLeft } from 'lucide-react';

interface CRMProps {
  customers: Customer[];
  orders: Order[];
  products: Product[];
  settings: GlobalSettings;
  onUpdateCustomer: (c: Customer) => void;
  onDeleteCustomer?: (id: string) => void;
  onAddCustomer?: (c: Customer) => void;
  // New props for Order Management
  onUpdateOrder?: (o: Order) => void;
  onDeleteOrder?: (id: string) => void;
}

// Generate ID Helper
const generateId = () => Math.random().toString(36).substring(2, 9);

export const CRM: React.FC<CRMProps> = ({ customers, orders, products, settings, onUpdateCustomer, onDeleteCustomer, onAddCustomer, onUpdateOrder, onDeleteOrder }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Customer>>({});
  
  // Order Editing State
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [editOrderData, setEditOrderData] = useState<{quantity: number, quantityBought: number}>({quantity: 0, quantityBought: 0});

  // Add Customer Modal State
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState<Partial<Customer>>({
      lineName: '',
      nickname: '',
      realName: '',
      phone: '',
      note: ''
  });

  const [deleteCustomerConfirm, setDeleteCustomerConfirm] = useState<string | null>(null);
  const [deleteOrderConfirm, setDeleteOrderConfirm] = useState<string | null>(null);

  const filteredCustomers = customers.filter(c => 
    !c.isStock && ( // Exclude stock from CRM list
        c.lineName.toLowerCase().includes(searchTerm.toLowerCase()) || 
        c.nickname?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.realName?.toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  const getCustomerLevel = (spent: number) => {
      const levels = settings.customerLevels || { vip: 10000, vvip: 30000 };
      if (spent >= levels.vvip) return { label: 'VVIP', icon: <Crown size={13} className="text-amber-500 fill-current"/>, bg: 'bg-[#3F4550]/8 text-[#2C2926] border-[#3F4550]/15' };
      if (spent >= levels.vip) return { label: 'VIP', icon: <Award size={13} className="text-[#7A9E8A] fill-current"/>, bg: 'bg-[#E5EFEA] text-[#2C2926] border-[#7A9E8A]/30' };
      return { label: '一般', icon: <Sprout size={13} className="text-slate-400"/>, bg: 'bg-[#E5EFEA] text-[#8A8278] border-[#8A8278]/20' };
  };

  const analyzeCustomer = (customerId: string) => {
    // Include ALL orders (History + Current) for CRM analysis
    const custOrders = orders.filter(o => o.customerId === customerId);
    if (custOrders.length === 0) return { count: 0, topCategory: '-', topBrand: '-' };

    const categoryCounts: Record<string, number> = {};
    const brandCounts: Record<string, number> = {};

    custOrders.forEach(o => {
        const product = products.find(p => p.id === o.productId);
        if (product) {
            categoryCounts[product.category] = (categoryCounts[product.category] || 0) + o.quantity;
            if(product.brand) {
                brandCounts[product.brand] = (brandCounts[product.brand] || 0) + o.quantity;
            }
        }
    });

    const topCategory = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '-';
    const topBrand = Object.entries(brandCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '-';

    return {
        count: custOrders.length,
        topCategory,
        topBrand
    };
  };

  const startEdit = (customer: Customer) => {
    setEditingId(customer.id);
    setEditForm(customer);
    setExpandedId(customer.id); // Auto expand when editing
  };

  const saveEdit = () => {
    if (editingId && editForm.lineName) {
      onUpdateCustomer(editForm as Customer);
      setEditingId(null);
    }
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
      e.preventDefault();
      e.stopPropagation();
      setDeleteCustomerConfirm(id);
  };

  const toggleExpand = (id: string) => {
      setExpandedId(expandedId === id ? null : id);
  };

  const handleCreateCustomer = () => {
      if(!newCustomer.lineName) {
          showAlert('請輸入 LINE 名稱');
          return;
      }
      
      if(onAddCustomer) {
          onAddCustomer({
              id: generateId(),
              lineName: newCustomer.lineName,
              nickname: newCustomer.nickname,
              realName: newCustomer.realName,
              phone: newCustomer.phone,
              note: newCustomer.note,
              totalSpent: 0,
              sessionCount: 0,
              isBlacklisted: false
          });
          setIsAddOpen(false);
          setNewCustomer({lineName: '', nickname: '', realName: '', phone: '', note: ''});
      }
  };

  // --- Order Management Handlers ---
  const startEditingOrder = (order: Order) => {
      setEditingOrderId(order.id);
      setEditOrderData({
          quantity: order.quantity,
          quantityBought: order.quantityBought || 0
      });
  };

  const saveEditingOrder = (order: Order) => {
      if(onUpdateOrder) {
          onUpdateOrder({
              ...order,
              quantity: Number(editOrderData.quantity),
              quantityBought: Number(editOrderData.quantityBought)
          });
          setEditingOrderId(null);
      }
  };

  const handleDeleteOrderAction = (orderId: string) => {
      setDeleteOrderConfirm(orderId);
  };

  return (
    <div className="space-y-5">
      {/* Delete Customer Confirmation Modal */}
      {deleteCustomerConfirm && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
              <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
                  <div className="text-center">
                      <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                          <Trash2 size={32} />
                      </div>
                      <h3 className="text-xl font-medium text-stone-800 mb-2">確定要刪除這位顧客嗎？</h3>
                      <p className="text-stone-500 text-sm leading-relaxed">
                          注意：這將會刪除該顧客的所有「訂單紀錄」與「採購需求」！<br/>
                          <strong className="text-red-500">此操作無法復原。</strong>
                      </p>
                  </div>
                  <div className="flex border-t border-stone-100">
                      <button 
                          onClick={() => setDeleteCustomerConfirm(null)}
                          className="flex-1 px-6 py-4 text-stone-500 font-medium hover:bg-stone-50 transition-colors"
                      >
                          取消
                      </button>
                      <button 
                          onClick={() => {
                              if (onDeleteCustomer) {
                                  onDeleteCustomer(deleteCustomerConfirm);
                              }
                              setDeleteCustomerConfirm(null);
                          }}
                          className="flex-1 px-6 py-4 bg-red-600 text-white font-medium hover:bg-red-700 transition-colors"
                      >
                          確定刪除
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Delete Order Confirmation Modal */}
      {deleteOrderConfirm && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
              <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
                  <div className="text-center">
                      <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                          <Trash2 size={32} />
                      </div>
                      <h3 className="text-xl font-medium text-stone-800 mb-2">確定要刪除此訂單嗎？</h3>
                      <p className="text-stone-500 text-sm leading-relaxed">
                          刪除後將無法復原，請確認是否繼續。
                      </p>
                  </div>
                  <div className="flex border-t border-stone-100">
                      <button 
                          onClick={() => setDeleteOrderConfirm(null)}
                          className="flex-1 px-6 py-4 text-stone-500 font-medium hover:bg-stone-50 transition-colors"
                      >
                          取消
                      </button>
                      <button 
                          onClick={() => {
                              if (onDeleteOrder) onDeleteOrder(deleteOrderConfirm);
                              setDeleteOrderConfirm(null);
                          }}
                          className="flex-1 px-6 py-4 bg-red-600 text-white font-medium hover:bg-red-700 transition-colors"
                      >
                          確定刪除
                      </button>
                  </div>
              </div>
          </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
        <h2 className="text-2xl font-medium text-stone-800 flex items-center gap-2">
          <User className="text-[#8A8278]" />
          顧客關係管理 (CRM)
        </h2>
        
        <div className="flex gap-2 w-full md:w-auto relative">
            <div className="relative flex-1 md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 w-4 h-4" />
                <input 
                    type="text" 
                    placeholder="搜尋姓名、暱稱..." 
                    value={searchTerm}
                    onChange={(e) => { setSearchTerm(e.target.value); setIsSearchDropdownOpen(true); }}
                    onFocus={() => setIsSearchDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setIsSearchDropdownOpen(false), 200)}
                    className="w-full pl-9 pr-4 py-1.5 bg-stone-50 border border-stone-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#7A9E8A] font-medium"
                />
                {isSearchDropdownOpen && searchTerm && (
                  <div className="absolute top-full left-0 w-full bg-white border border-stone-100 shadow-xl rounded-xl z-50 mt-1 max-h-60 overflow-y-auto">
                    {filteredCustomers.slice(0, 10).map(c => (
                      <button key={c.id} className="w-full text-left px-4 py-3 hover:bg-blue-50 border-b border-stone-100 last:border-0 transition-colors" onClick={() => { setSearchTerm(c.lineName); setIsSearchDropdownOpen(false); setExpandedId(c.id); }}>
                        <div className="font-medium text-stone-700 text-sm">{c.lineName}</div>
                        <div className="text-xs text-stone-400">{c.nickname || '無暱稱'}</div>
                      </button>
                    ))}
                  </div>
                )}
            </div>
            
            <button 
                onClick={() => setIsAddOpen(true)}
                className="bg-[#3F4550] hover:bg-[#2F3540] text-white px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-1 shadow-sm whitespace-nowrap"
            >
                <Plus size={16} /> 新增顧客
            </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredCustomers.map(customer => {
          const isEditing = editingId === customer.id;
          const isExpanded = expandedId === customer.id;
          const stats = analyzeCustomer(customer.id);
          const levelInfo = getCustomerLevel(customer.totalSpent || 0);

          return (
            <div key={customer.id} className={`bg-white rounded-xl shadow-sm border overflow-hidden transition-all ${customer.isBlacklisted ? 'border-red-200 bg-red-50' : 'border-stone-100'}`}>
              
              {/* Card Header (Always Visible) */}
              <div className={`p-4 flex justify-between items-center ${customer.isBlacklisted ? 'bg-red-100/50' : 'bg-stone-50'}`}>
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-medium flex-shrink-0 ${customer.isBlacklisted ? 'bg-red-500' : 'bg-[#7A9E8A]'}`}>
                    {customer.lineName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <div className="flex flex-col gap-2">
                          <div className="relative">
                            <input 
                                className="text-sm font-medium border rounded px-1 w-full" 
                                value={editForm.lineName} 
                                onChange={e => setEditForm({...editForm, lineName: e.target.value})}
                            />
                            <span className="text-xs text-stone-400 absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none">LINE 名稱</span>
                          </div>
                          <div className="relative">
                            <input 
                                className="text-xs border rounded px-1 w-full text-stone-600" 
                                value={editForm.nickname || ''} 
                                onChange={e => setEditForm({...editForm, nickname: e.target.value})}
                            />
                            <span className="text-xs text-stone-400 absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none">社群暱稱</span>
                          </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                          <div className="truncate max-w-full">
                            <h3 className="font-medium text-stone-800 truncate">{customer.lineName}</h3>
                            <p className="text-xs text-stone-500 truncate">{customer.nickname || '無暱稱'}</p>
                          </div>
                          <div className="flex items-center gap-1">
                              {/* Level Badge */}
                              <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded border text-xs font-medium whitespace-nowrap ${levelInfo.bg}`}>
                                  {levelInfo.icon}
                                  {levelInfo.label}
                              </div>
                              {/* LINE Linked Badge */}
                              {customer.lineUserId ? (
                                  <div className="flex items-center gap-1 px-1.5 py-0.5 rounded border text-xs font-medium whitespace-nowrap bg-[#e8f8ee] text-[#06C755] border-[#06C755]/30">
                                      <Check size={12} />
                                      LINE 已連結
                                  </div>
                              ) : (
                                  <div className="flex items-center gap-1 px-1.5 py-0.5 rounded border text-xs font-medium whitespace-nowrap bg-stone-50 text-stone-400 border-stone-200">
                                      LINE 未連結
                                  </div>
                              )}
                              {/* Blacklist Badge */}
                              {customer.isBlacklisted && (
                                  <div className="flex items-center gap-1 px-1.5 py-0.5 rounded border text-xs font-medium whitespace-nowrap bg-stone-800 text-white border-stone-900">
                                      <Skull size={12} />
                                      棄單紀錄
                                  </div>
                              )}
                          </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 items-center flex-shrink-0 ml-2">
                  <button onClick={() => toggleExpand(customer.id)} className="text-stone-400 hover:text-stone-600">
                      {isExpanded ? <ChevronUp size={20}/> : <ChevronDown size={20}/>}
                  </button>
                </div>
              </div>

              {/* Expandable Content */}
              {isExpanded && (
                <div className="p-4 space-y-3 text-sm bg-white animate-in slide-in-from-top-2 duration-200">
                    {/* Stats Dashboard */}
                    <div className="grid grid-cols-3 gap-2 bg-stone-50 p-2 rounded-lg border border-stone-100 mb-2">
                        <div className="text-center">
                            <p className="text-xs text-stone-400">累積消費</p>
                            <p className="font-medium text-[#2C2926] text-sm">
                                ${((customer.totalSpent || 0) / 1000).toFixed(1)}k
                            </p>
                        </div>
                        <div className="text-center border-l border-stone-100">
                            <p className="text-xs text-stone-400">總件數</p>
                            <p className="font-medium text-stone-700 text-sm">{stats.count} 件</p>
                        </div>
                         <div className="text-center border-l border-stone-100">
                            <p className="text-xs text-stone-400">跟團次數</p>
                            <p className="font-medium text-purple-600 text-sm">{customer.sessionCount || 0} 次</p>
                        </div>
                    </div>

                    {/* Order Management Section */}
                    {onUpdateOrder && onDeleteOrder && (
                        <div className="mt-4 mb-4 border border-blue-100 rounded-lg overflow-hidden">
                            <div className="bg-blue-50 px-3 py-2 flex items-center gap-2">
                                <Package size={14} className="text-[#2C2926]"/>
                                <h4 className="text-xs font-medium text-[#2C2926]">📋 訂單管理 (本場連線)</h4>
                            </div>
                            <div className="max-h-48 overflow-y-auto bg-white">
                                {orders.filter(o => o.customerId === customer.id && !o.isArchived).length === 0 ? (
                                    <div className="p-4 text-center text-xs text-stone-400">尚無本場訂單</div>
                                ) : (
                                    orders.filter(o => o.customerId === customer.id && !o.isArchived).map(order => {
                                        const prod = products.find(p => p.id === order.productId);
                                        const isOrderEditing = editingOrderId === order.id;

                                        return (
                                            <div key={order.id} className="p-2 last:border-0 hover:bg-stone-50 flex justify-between items-center group">
                                                <div className="flex-1 min-w-0 pr-2">
                                                    <div className="font-medium text-stone-700 truncate text-xs">{prod?.name}</div>
                                                    <div className="text-xs text-stone-500">
                                                        {order.variant && <span className="bg-stone-100 px-1 rounded mr-1">{order.variant}</span>}
                                                        {isOrderEditing ? (
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <label className="flex items-center gap-1 text-pink-500 font-medium">
                                                                    喊: <input 
                                                                        type="number" min="1"
                                                                        className="w-10 border rounded px-1 text-center bg-white"
                                                                        value={editOrderData.quantity}
                                                                        onChange={e => setEditOrderData({...editOrderData, quantity: Number(e.target.value)})}
                                                                    />
                                                                </label>
                                                                <label className="flex items-center gap-1 text-green-600 font-medium">
                                                                    買: <input 
                                                                        type="number" min="0"
                                                                        className="w-10 border rounded px-1 text-center bg-white"
                                                                        value={editOrderData.quantityBought}
                                                                        onChange={e => setEditOrderData({...editOrderData, quantityBought: Number(e.target.value)})}
                                                                    />
                                                                </label>
                                                            </div>
                                                        ) : (
                                                            <span className="mt-0.5 block">
                                                                喊: <span className="text-pink-500 font-medium">{order.quantity}</span> / 
                                                                買: <span className="text-green-600 font-medium">{order.quantityBought || 0}</span>
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                
                                                <div className="flex items-center gap-1">
                                                    {isOrderEditing ? (
                                                        <>
                                                            <button onClick={() => saveEditingOrder(order)} className="p-1 bg-green-100 text-green-700 rounded hover:bg-green-200"><Save size={14}/></button>
                                                            <button onClick={() => setEditingOrderId(null)} className="p-1 bg-stone-100 text-stone-500 rounded hover:bg-stone-200"><X size={14}/></button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <button onClick={() => startEditingOrder(order)} className="p-1 text-stone-400 hover:text-[#8A8278] hover:bg-blue-50 rounded"><Edit2 size={14}/></button>
                                                            <button onClick={() => handleDeleteOrderAction(order.id)} className="p-1 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded"><Trash2 size={14}/></button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    )}

                    <div className="flex justify-end gap-2 mb-2">
                        {isEditing ? (
                            <>
                            <button 
                                type="button"
                                onClick={(e) => handleDelete(e, customer.id)} 
                                className="p-1.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 border border-red-200" 
                                title="刪除顧客"
                            >
                                <Trash2 size={16} />
                            </button>
                            <button onClick={saveEdit} className="p-1.5 bg-green-100 text-green-700 rounded-lg hover:bg-green-200"><Save size={16} /></button>
                            <button onClick={() => setEditingId(null)} className="p-1.5 bg-stone-100 text-stone-600 rounded-lg hover:bg-stone-200"><X size={16} /></button>
                            </>
                        ) : (
                            <button onClick={() => startEdit(customer)} className="flex items-center gap-1 px-2 py-1 bg-white border border-stone-100 text-stone-500 rounded text-xs hover:text-[#2C2926] hover:border-blue-100 transition-colors">
                                <Edit2 size={12} /> 編輯資料
                            </button>
                        )}
                    </div>
                    
                    {/* PRIMARY INFO (Always Visible) */}
                    <div className="space-y-3 pt-2">
                        {/* Note */}
                        <div className="flex items-start gap-2 text-stone-600">
                            <div className="w-6 flex justify-center mt-1"><StickyNote size={14} className="text-stone-400" /></div>
                            {isEditing ? (
                                <textarea 
                                    className="flex-1 border rounded px-2 py-1 h-20 text-sm bg-white focus:ring-1 focus:ring-[#7A9E8A]" 
                                    placeholder="備註 / 喜好 / 黑名單原因..."
                                    value={editForm.note || ''} 
                                    onChange={e => setEditForm({...editForm, note: e.target.value})} 
                                />
                            ) : (
                                <p className="flex-1 text-stone-700 bg-amber-50/50 border border-amber-100 p-2 rounded text-sm whitespace-pre-line min-h-[40px]">
                                    {customer.note || <span className="text-stone-300 text-xs italic">無備註</span>}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* SECONDARY INFO (Collapsible) */}
                    {isEditing ? (
                        <div className="pt-4 mt-2 space-y-3 animate-in fade-in bg-stone-50/50 p-3 rounded-lg">
                            <h4 className="text-xs font-medium text-stone-400 mb-2">基本資料編輯</h4>
                            <div className="flex items-center gap-2 text-stone-600">
                                <div className="w-6 flex justify-center"><User size={14} className="text-stone-400" /></div>
                                <span className="text-xs text-stone-400 w-12">姓名:</span>
                                <input className="flex-1 border rounded px-2 py-1 text-sm bg-white" value={editForm.realName || ''} onChange={e => setEditForm({...editForm, realName: e.target.value})} placeholder="真實姓名"/>
                            </div>
                            <div className="flex items-center gap-2 text-stone-600">
                                <div className="w-6 flex justify-center"><Phone size={14} className="text-stone-400" /></div>
                                <span className="text-xs text-stone-400 w-12">電話:</span>
                                <input className="flex-1 border rounded px-2 py-1 text-sm bg-white" value={editForm.phone || ''} onChange={e => setEditForm({...editForm, phone: e.target.value})} placeholder="09xx-xxx-xxx"/>
                            </div>
                            <div className="flex items-center gap-2 text-stone-600">
                                <div className="w-6 flex justify-center"><Calendar size={14} className="text-stone-400" /></div>
                                <span className="text-xs text-stone-400 w-12">生日:</span>
                                <input type="date" className="flex-1 border rounded px-2 py-1 text-sm bg-white" value={editForm.birthDate || ''} onChange={e => setEditForm({...editForm, birthDate: e.target.value})} />
                            </div>
                            <div className="flex items-start gap-2 text-stone-600">
                                <div className="w-6 flex justify-center mt-1"><MapPin size={14} className="text-stone-400" /></div>
                                <span className="text-xs text-stone-400 w-12 mt-1">地址:</span>
                                <textarea className="flex-1 border rounded px-2 py-1 h-16 text-sm bg-white" value={editForm.address || ''} onChange={e => setEditForm({...editForm, address: e.target.value})} placeholder="寄送地址或店號"/>
                            </div>
                            <div className="flex items-center gap-2 text-stone-600">
                                <div className="w-6 flex justify-center"><CreditCard size={14} className="text-stone-400" /></div>
                                <span className="text-xs text-stone-400 w-12">帳號:</span>
                                <input className="flex-1 border rounded px-2 py-1 text-sm bg-white" value={editForm.lastFiveDigits || ''} onChange={e => setEditForm({...editForm, lastFiveDigits: e.target.value})} placeholder="匯款後五碼"/>
                            </div>
                            {(settings.bankAccounts || []).length > 0 && (
                                <div className="flex items-center gap-2 text-stone-600">
                                    <div className="w-6 flex justify-center"><CreditCard size={14} className="text-stone-400" /></div>
                                    <span className="text-xs text-stone-400 w-12">指定行:</span>
                                    <select
                                        className="flex-1 border rounded px-2 py-1 text-sm bg-white"
                                        value={editForm.preferredBankId || ''}
                                        onChange={e => setEditForm({ ...editForm, preferredBankId: e.target.value || undefined })}
                                    >
                                        <option value="">自動分配（預設）</option>
                                        {(settings.bankAccounts || []).map(b => (
                                            <option key={b.id} value={b.id}>{b.label}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>
                    ) : (
                        <details className="group border border-stone-100 rounded-lg bg-stone-50 overflow-hidden mt-3 transition-all">
                            <summary className="p-3 text-xs font-medium text-stone-600 cursor-pointer flex items-center justify-between hover:bg-stone-100 select-none">
                                <span className="flex items-center gap-2"><AlignLeft size={14}/> 詳細個資 (電話/地址/帳號)</span>
                                <ChevronDown size={16} className="transition-transform duration-200 group-open:rotate-180 text-stone-400"/>
                            </summary>
                            <div className="p-4 space-y-3 bg-white text-sm">
                                <div className="flex gap-2">
                                    <span className="text-stone-400 w-16 flex-shrink-0">真實姓名:</span>
                                    <span className="font-medium text-stone-800 select-all">{customer.realName || '-'}</span>
                                </div>
                                <div className="flex gap-2">
                                    <span className="text-stone-400 w-16 flex-shrink-0">電話:</span>
                                    <span className="font-medium text-stone-800 select-all">{customer.phone || '-'}</span>
                                </div>
                                <div className="flex gap-2">
                                    <span className="text-stone-400 w-16 flex-shrink-0">生日:</span>
                                    <span className="font-medium text-stone-800">{customer.birthDate || '-'}</span>
                                </div>
                                <div className="flex gap-2">
                                    <span className="text-stone-400 w-16 flex-shrink-0">地址/店號:</span>
                                    <span className="font-medium text-stone-800 break-all select-all">{customer.address || '-'}</span>
                                </div>
                                <div className="flex gap-2">
                                    <span className="text-stone-400 w-16 flex-shrink-0">後五碼:</span>
                                    <span className="font-medium text-stone-800 select-all">{customer.lastFiveDigits || '-'}</span>
                                </div>
                                {(settings.bankAccounts || []).length > 0 && (
                                    <div className="flex gap-2">
                                        <span className="text-stone-400 w-16 flex-shrink-0">指定行:</span>
                                        <span className="font-medium text-stone-800">
                                            {settings.bankAccounts!.find(b => b.id === customer.preferredBankId)?.label || '自動分配'}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </details>
                    )}

                    {/* Analysis Section */}
                    <div className="pt-3 mt-3 bg-blue-50/50 p-2 rounded-lg">
                        <h4 className="text-xs font-medium text-[#2C2926] flex items-center gap-1 mb-2">
                            <BarChart2 size={12}/> 消費喜好分析 (AI)
                        </h4>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                                <span className="text-stone-400 block">偏好分類</span>
                                <span className="font-medium text-stone-700">{stats.topCategory}</span>
                            </div>
                            <div>
                                <span className="text-stone-400 block">偏好品牌</span>
                                <span className="font-medium text-stone-700">{stats.topBrand}</span>
                            </div>
                        </div>
                    </div>

                    {isEditing && (
                        <>
                        {/* Manual History Adjustment */}
                        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                            <h4 className="text-xs font-medium text-amber-800 mb-2 flex items-center gap-1">
                                <History size={12}/> 歷史數據補登
                            </h4>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs text-amber-700 block mb-1">累積消費金額 ($)</label>
                                    <input 
                                        type="number"
                                        className="w-full border border-amber-300 rounded px-2 py-1 text-sm bg-white"
                                        value={editForm.totalSpent || 0}
                                        onChange={e => setEditForm({...editForm, totalSpent: Number(e.target.value)})}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-amber-700 block mb-1">跟團次數</label>
                                    <input 
                                        type="number"
                                        className="w-full border border-amber-300 rounded px-2 py-1 text-sm bg-white"
                                        value={editForm.sessionCount || 0}
                                        onChange={e => setEditForm({...editForm, sessionCount: Number(e.target.value)})}
                                    />
                                </div>
                            </div>
                            <p className="text-xs text-amber-600 mt-2">輸入之前的消費紀錄，系統將自動重新計算會員等級。</p>
                        </div>

                        <div className="mt-4 flex items-center gap-2 pt-2">
                        <input 
                            type="checkbox" 
                            id={`bl-${customer.id}`}
                            checked={editForm.isBlacklisted || false} 
                            onChange={e => setEditForm({...editForm, isBlacklisted: e.target.checked})} 
                        />
                        <label htmlFor={`bl-${customer.id}`} className="text-red-500 font-medium flex items-center gap-1 cursor-pointer text-xs">
                            <AlertTriangle size={14} /> 加入黑名單 (棄單)
                        </label>
                        </div>
                        </>
                    )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add Customer Modal */}
      {isAddOpen && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden animate-in zoom-in-95">
                  <div className="p-4 bg-stone-50 flex justify-between items-center">
                      <h3 className="font-medium text-stone-800 flex items-center gap-2"><UserPlus size={20} className="text-[#8A8278]"/> 新增顧客資料</h3>
                      <button onClick={() => setIsAddOpen(false)}><X size={20} className="text-stone-400"/></button>
                  </div>
                  <div className="p-5 space-y-4">
                      <div>
                          <label className="block text-sm font-medium text-stone-700 mb-1">LINE 名稱 (必填)</label>
                          <input 
                             type="text" 
                             className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#7A9E8A] outline-none"
                             placeholder="例如: Amy Chen"
                             value={newCustomer.lineName}
                             onChange={e => setNewCustomer({...newCustomer, lineName: e.target.value})}
                             autoFocus
                          />
                      </div>
                      <div>
                          <label className="block text-sm font-medium text-stone-600 mb-1">社群暱稱</label>
                          <input 
                             type="text" 
                             className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#7A9E8A] outline-none"
                             placeholder="例如: Amy +1"
                             value={newCustomer.nickname}
                             onChange={e => setNewCustomer({...newCustomer, nickname: e.target.value})}
                          />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                          <div>
                              <label className="block text-sm font-medium text-stone-600 mb-1">真實姓名</label>
                              <input 
                                 type="text" 
                                 className="w-full border rounded-lg px-3 py-2 text-sm"
                                 value={newCustomer.realName}
                                 onChange={e => setNewCustomer({...newCustomer, realName: e.target.value})}
                              />
                          </div>
                          <div>
                              <label className="block text-sm font-medium text-stone-600 mb-1">電話</label>
                              <input 
                                 type="text" 
                                 className="w-full border rounded-lg px-3 py-2 text-sm"
                                 value={newCustomer.phone}
                                 onChange={e => setNewCustomer({...newCustomer, phone: e.target.value})}
                              />
                          </div>
                      </div>
                      <div>
                          <label className="block text-sm font-medium text-stone-600 mb-1">備註 / 喜好</label>
                          <textarea 
                             className="w-full border rounded-lg px-3 py-2 text-sm h-20 resize-none"
                             placeholder="例如: 喜歡粉紅色、過敏體質..."
                             value={newCustomer.note}
                             onChange={e => setNewCustomer({...newCustomer, note: e.target.value})}
                          />
                      </div>
                      
                      <button 
                        onClick={handleCreateCustomer}
                        className="w-full bg-[#7A9E8A] text-white font-medium py-3 rounded-lg shadow-md hover:bg-[#5C8070] transition-colors mt-2"
                      >
                          確認新增
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
