
import React, { useState } from 'react';
import { Customer, Order, Product } from '../types';
import { Search, User, Phone, MapPin, Calendar, Edit2, AlertTriangle, Save, X, BarChart2, ChevronDown, ChevronUp, MessageCircle } from 'lucide-react';

interface CRMProps {
  customers: Customer[];
  orders: Order[];
  products: Product[];
  onUpdateCustomer: (c: Customer) => void;
}

export const CRM: React.FC<CRMProps> = ({ customers, orders, products, onUpdateCustomer }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Customer>>({});

  const filteredCustomers = customers.filter(c => 
    c.lineName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.nickname?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.realName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

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

          return (
            <div key={customer.id} className={`bg-white rounded-xl shadow-sm border overflow-hidden transition-all ${customer.isBlacklisted ? 'border-red-200 bg-red-50' : 'border-stone-200'}`}>
              
              {/* Card Header (Always Visible) */}
              <div className={`p-4 border-b flex justify-between items-center ${customer.isBlacklisted ? 'bg-red-100/50' : 'bg-stone-50'}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${customer.isBlacklisted ? 'bg-red-500' : 'bg-blue-500'}`}>
                    {customer.lineName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    {isEditing ? (
                      <input 
                        className="text-sm border rounded px-1 w-32" 
                        value={editForm.lineName} 
                        onChange={e => setEditForm({...editForm, lineName: e.target.value})}
                      />
                    ) : (
                      <h3 className="font-bold text-stone-800">{customer.lineName}</h3>
                    )}
                    <p className="text-xs text-stone-500">{customer.nickname || '無暱稱'}</p>
                  </div>
                </div>
                <div className="flex gap-2 items-center">
                  <span className="text-xs bg-stone-200 text-stone-600 px-2 py-1 rounded-full">{stats.count} 單</span>
                  <button onClick={() => toggleExpand(customer.id)} className="text-stone-400 hover:text-stone-600">
                      {isExpanded ? <ChevronUp size={20}/> : <ChevronDown size={20}/>}
                  </button>
                </div>
              </div>

              {/* Expandable Content */}
              {isExpanded && (
                <div className="p-4 space-y-3 text-sm bg-white animate-in slide-in-from-top-2 duration-200">
                    <div className="flex justify-end gap-2 mb-2">
                        {isEditing ? (
                            <>
                            <button onClick={saveEdit} className="p-1.5 bg-green-100 text-green-700 rounded-lg hover:bg-green-200"><Save size={16} /></button>
                            <button onClick={() => setEditingId(null)} className="p-1.5 bg-stone-100 text-stone-600 rounded-lg hover:bg-stone-200"><X size={16} /></button>
                            </>
                        ) : (
                            <button onClick={() => startEdit(customer)} className="flex items-center gap-1 px-2 py-1 bg-white border border-stone-200 text-stone-500 rounded text-xs hover:text-blue-600 hover:border-blue-200">
                                <Edit2 size={12} /> 編輯資料
                            </button>
                        )}
                    </div>

                    {/* LINE Chat Link Field */}
                    <div className="flex items-center gap-2 text-stone-600">
                      <MessageCircle size={14} className="text-[#06C755]" />
                      <span className="w-16 text-stone-400">聊天連結:</span>
                      {isEditing ? (
                          <input 
                            className="flex-1 border rounded px-1 text-xs" 
                            placeholder="https://manager.line.biz/..."
                            value={editForm.lineChatUrl || ''} 
                            onChange={e => setEditForm({...editForm, lineChatUrl: e.target.value})} 
                          />
                      ) : (
                          customer.lineChatUrl ? (
                            <a href={customer.lineChatUrl} target="_blank" rel="noreferrer" className="flex-1 text-blue-500 underline truncate">
                                開啟後台對話
                            </a>
                          ) : (
                            <span className="text-stone-300 italic">未設定</span>
                          )
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

                    {/* Analysis Section */}
                    <div className="pt-3 mt-3 border-t border-stone-100 bg-blue-50/50 p-2 rounded-lg">
                        <h4 className="text-xs font-bold text-blue-600 flex items-center gap-1 mb-2">
                            <BarChart2 size={12}/> 消費喜好分析
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
