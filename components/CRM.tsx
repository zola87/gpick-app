
import React, { useState } from 'react';
import { Customer, Order, Product, GlobalSettings } from '../types';
import { Search, User, Phone, MapPin, Calendar, Edit2, AlertTriangle, Save, X, BarChart2, ChevronDown, ChevronUp, MessageCircle, ExternalLink, Trash2, StickyNote, Award, Crown, Sprout, Skull, History } from 'lucide-react';

interface CRMProps {
  customers: Customer[];
  orders: Order[];
  products: Product[];
  settings: GlobalSettings;
  onUpdateCustomer: (c: Customer) => void;
  onDeleteCustomer?: (id: string) => void;
}

export const CRM: React.FC<CRMProps> = ({ customers, orders, products, settings, onUpdateCustomer, onDeleteCustomer }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Customer>>({});

  const filteredCustomers = customers.filter(c => 
    !c.isStock && ( // Exclude stock from CRM list
        c.lineName.toLowerCase().includes(searchTerm.toLowerCase()) || 
        c.nickname?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.realName?.toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  const getCustomerLevel = (spent: number) => {
      const levels = settings.customerLevels || { vip: 10000, vvip: 30000 };
      if (spent >= levels.vvip) return { label: 'VVIP', icon: <Crown size={14} className="text-yellow-500 fill-current"/>, bg: 'bg-yellow-50 text-yellow-700 border-yellow-200' };
      if (spent >= levels.vip) return { label: 'VIP', icon: <Award size={14} className="text-blue-500 fill-current"/>, bg: 'bg-blue-50 text-blue-700 border-blue-200' };
      return { label: '一般', icon: <Sprout size={14} className="text-green-500"/>, bg: 'bg-stone-50 text-stone-600 border-stone-200' };
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
      if(window.confirm('確定要刪除這位顧客嗎？\n\n注意：這將會刪除該顧客的所有「訂單紀錄」與「採購需求」！\n此操作無法復原。')) {
          if (onDeleteCustomer) {
             onDeleteCustomer(id);
          } else {
             console.error("Delete function not available");
          }
      }
  };

  const toggleExpand = (id: string) => {
      setExpandedId(expandedId === id ? null : id);
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-stone-100">
        <h2 className="text-xl font-bold text-stone-800 flex items-center gap-2">
          <User className="text-blue-500" />
          顧客關係管理 (CRM)
        </h2>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 w-4 h-4" />
          <input 
            type="text" 
            placeholder="搜尋姓名、暱稱..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredCustomers.map(customer => {
          const isEditing = editingId === customer.id;
          const isExpanded = expandedId === customer.id;
          const stats = analyzeCustomer(customer.id);
          const levelInfo = getCustomerLevel(customer.totalSpent || 0);

          return (
            <div key={customer.id} className={`bg-white rounded-xl shadow-sm border overflow-hidden transition-all ${customer.isBlacklisted ? 'border-red-200 bg-red-50' : 'border-stone-200'}`}>
              
              {/* Card Header (Always Visible) */}
              <div className={`p-4 border-b flex justify-between items-center ${customer.isBlacklisted ? 'bg-red-100/50' : 'bg-stone-50'}`}>
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 ${customer.isBlacklisted ? 'bg-red-500' : 'bg-blue-500'}`}>
                    {customer.lineName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <div className="flex flex-col gap-2">
                          <div className="relative">
                            <input 
                                className="text-sm font-bold border rounded px-1 w-full" 
                                value={editForm.lineName} 
                                onChange={e => setEditForm({...editForm, lineName: e.target.value})}
                            />
                            <span className="text-[10px] text-stone-400 absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none">LINE 名稱</span>
                          </div>
                          <div className="relative">
                            <input 
                                className="text-xs border rounded px-1 w-full text-stone-600" 
                                value={editForm.nickname || ''} 
                                onChange={e => setEditForm({...editForm, nickname: e.target.value})}
                            />
                            <span className="text-[10px] text-stone-400 absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none">社群暱稱</span>
                          </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                          <div className="truncate max-w-full">
                            <h3 className="font-bold text-stone-800 truncate">{customer.lineName}</h3>
                            <p className="text-xs text-stone-500 truncate">{customer.nickname || '無暱稱'}</p>
                          </div>
                          <div className="flex items-center gap-1">
                              {/* Level Badge */}
                              <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-bold whitespace-nowrap ${levelInfo.bg}`}>
                                  {levelInfo.icon}
                                  {levelInfo.label}
                              </div>
                              {/* Blacklist Badge */}
                              {customer.isBlacklisted && (
                                  <div className="flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-bold whitespace-nowrap bg-stone-800 text-white border-stone-900">
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
                  {customer.chatUrl && (
                      <a href={customer.chatUrl} target="_blank" rel="noreferrer" className="text-xs bg-[#06C755] text-white px-2 py-1 rounded-full flex items-center gap-1 hover:bg-[#05b34c]">
                          <MessageCircle size={12}/>
                      </a>
                  )}
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
                            <p className="text-[10px] text-stone-400">累積消費</p>
                            <p className="font-bold text-blue-600 text-sm">
                                ${((customer.totalSpent || 0) / 1000).toFixed(1)}k
                            </p>
                        </div>
                        <div className="text-center border-l border-stone-200">
                            <p className="text-[10px] text-stone-400">總件數</p>
                            <p className="font-bold text-stone-700 text-sm">{stats.count} 件</p>
                        </div>
                         <div className="text-center border-l border-stone-200">
                            <p className="text-[10px] text-stone-400">跟團次數</p>
                            <p className="font-bold text-purple-600 text-sm">{customer.sessionCount || 0} 次</p>
                        </div>
                    </div>

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
                            <button onClick={() => startEdit(customer)} className="flex items-center gap-1 px-2 py-1 bg-white border border-stone-200 text-stone-500 rounded text-xs hover:text-blue-600 hover:border-blue-200">
                                <Edit2 size={12} /> 編輯資料
                            </button>
                        )}
                    </div>
                    
                    {/* Chat Link Field */}
                    <div className="flex items-center gap-2 text-stone-600">
                    <MessageCircle size={14} className="text-stone-400" />
                    <span className="w-16 text-stone-400">LINE連結:</span>
                    {isEditing ? (
                        <input 
                          className="flex-1 border rounded px-1 text-xs" 
                          placeholder="https://..." 
                          value={editForm.chatUrl || ''} 
                          onChange={e => setEditForm({...editForm, chatUrl: e.target.value})} 
                        />
                    ) : (
                        customer.chatUrl ? 
                        <a href={customer.chatUrl} target="_blank" className="text-blue-500 flex items-center gap-1 hover:underline truncate w-32">
                            連結 <ExternalLink size={10}/>
                        </a> : <span className="text-stone-300">-</span>
                    )}
                    </div>

                    <div className="flex items-center gap-2 text-stone-600">
                    <User size={14} className="text-stone-400" />
                    <span className="w-16 text-stone-400">真實姓名:</span>
                    {isEditing ? (
                        <input className="flex-1 border rounded px-1" value={editForm.realName || ''} onChange={e => setEditForm({...editForm, realName: e.target.value})} />
                    ) : (
                        <span className="font-medium">{customer.realName || '-'}</span>
                    )}
                    </div>

                    <div className="flex items-center gap-2 text-stone-600">
                    <Phone size={14} className="text-stone-400" />
                    <span className="w-16 text-stone-400">電話:</span>
                    {isEditing ? (
                        <input className="flex-1 border rounded px-1" value={editForm.phone || ''} onChange={e => setEditForm({...editForm, phone: e.target.value})} />
                    ) : (
                        <span className="font-medium">{customer.phone || '-'}</span>
                    )}
                    </div>

                    <div className="flex items-center gap-2 text-stone-600">
                    <Calendar size={14} className="text-stone-400" />
                    <span className="w-16 text-stone-400">生日:</span>
                    {isEditing ? (
                        <input type="date" className="flex-1 border rounded px-1" value={editForm.birthDate || ''} onChange={e => setEditForm({...editForm, birthDate: e.target.value})} />
                    ) : (
                        <span className="font-medium">{customer.birthDate || '-'}</span>
                    )}
                    </div>

                    <div className="flex items-start gap-2 text-stone-600">
                    <MapPin size={14} className="text-stone-400 mt-0.5" />
                    <span className="w-16 text-stone-400 flex-shrink-0">地址/店號:</span>
                    {isEditing ? (
                        <textarea className="flex-1 border rounded px-1 h-16" value={editForm.address || ''} onChange={e => setEditForm({...editForm, address: e.target.value})} />
                    ) : (
                        <span className="font-medium break-all">{customer.address || '-'}</span>
                    )}
                    </div>
                    
                    <div className="flex items-center gap-2 text-stone-600">
                    <span className="w-4"></span>
                    <span className="w-16 text-stone-400">匯款後五碼:</span>
                    {isEditing ? (
                        <input className="flex-1 border rounded px-1" value={editForm.lastFiveDigits || ''} onChange={e => setEditForm({...editForm, lastFiveDigits: e.target.value})} />
                    ) : (
                        <span className="font-medium">{customer.lastFiveDigits || '-'}</span>
                    )}
                    </div>

                    {/* Manual Note/Preferences */}
                    <div className="flex items-start gap-2 text-stone-600 border-t border-stone-100 pt-3">
                        <StickyNote size={14} className="text-stone-400 mt-0.5" />
                        <span className="w-16 text-stone-400 flex-shrink-0">備註/喜好:</span>
                        {isEditing ? (
                            <textarea 
                                className="flex-1 border rounded px-1 h-20 text-xs" 
                                placeholder="手動輸入客人備註..."
                                value={editForm.note || ''} 
                                onChange={e => setEditForm({...editForm, note: e.target.value})} 
                            />
                        ) : (
                             <p className="flex-1 text-stone-700 bg-stone-50 p-2 rounded text-xs whitespace-pre-line">
                                 {customer.note || <span className="text-stone-300">無備註</span>}
                             </p>
                        )}
                    </div>

                    {/* Analysis Section */}
                    <div className="pt-3 mt-3 border-t border-stone-100 bg-blue-50/50 p-2 rounded-lg">
                        <h4 className="text-xs font-bold text-blue-600 flex items-center gap-1 mb-2">
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
                            <h4 className="text-xs font-bold text-amber-800 mb-2 flex items-center gap-1">
                                <History size={12}/> 歷史數據補登
                            </h4>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] text-amber-700 block mb-1">累積消費金額 ($)</label>
                                    <input 
                                        type="number"
                                        className="w-full border border-amber-300 rounded px-2 py-1 text-sm bg-white"
                                        value={editForm.totalSpent || 0}
                                        onChange={e => setEditForm({...editForm, totalSpent: Number(e.target.value)})}
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] text-amber-700 block mb-1">跟團次數</label>
                                    <input 
                                        type="number"
                                        className="w-full border border-amber-300 rounded px-2 py-1 text-sm bg-white"
                                        value={editForm.sessionCount || 0}
                                        onChange={e => setEditForm({...editForm, sessionCount: Number(e.target.value)})}
                                    />
                                </div>
                            </div>
                            <p className="text-[10px] text-amber-600 mt-2">輸入之前的消費紀錄，系統將自動重新計算會員等級。</p>
                        </div>

                        <div className="mt-4 flex items-center gap-2 pt-2 border-t border-stone-100">
                        <input 
                            type="checkbox" 
                            id={`bl-${customer.id}`}
                            checked={editForm.isBlacklisted || false} 
                            onChange={e => setEditForm({...editForm, isBlacklisted: e.target.checked})} 
                        />
                        <label htmlFor={`bl-${customer.id}`} className="text-red-500 font-bold flex items-center gap-1 cursor-pointer text-xs">
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
    </div>
  );
};
