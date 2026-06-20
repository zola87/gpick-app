import React from 'react';
import { Plus, Send, X, Search, ArrowLeftRight, Package, Minus, Camera } from 'lucide-react';
import { Order, Customer } from '../../types';
import { OrderInputPanelProps, CustomerBatchOrderItem } from './liveTypes';
import { generateId, DEFAULT_GACHA_IMAGE } from './liveUtils';

export const OrderInputPanel: React.FC<OrderInputPanelProps> = ({
  products, customers, settings, onAddOrder,
  orderMode, setOrderMode,
  selectedProduct, setSelectedProduct,
  productSearchTerm, setProductSearchTerm,
  isProductDropdownOpen, setIsProductDropdownOpen,
  selectedVariant, setSelectedVariant,
  batchOrders, setBatchOrders,
  focusedRowIndex, setFocusedRowIndex,
  customerSearchTerm, setCustomerSearchTerm,
  isCustomerSearchDropdownOpen, setIsCustomerSearchDropdownOpen,
  customerBatchOrders, setCustomerBatchOrders,
  setIsAddProductOpen, setIsGachaModalOpen,
}) => {
  return (
    <div className="lg:col-span-4 space-y-4 lg:sticky lg:top-4">
      {/* 快速喊單區 */}
      <div id="quick-order-section" className="bg-white p-4 rounded-2xl shadow-sm border border-stone-200 w-full transition-colors duration-300">
        {/* Row 1: Title & Toggle Button */}
        <div className="flex justify-between items-center mb-4">
          <h2 className={`text-base flex items-center gap-2 font-bold shrink-0 ${orderMode === 'byProduct' ? 'text-[#7A9E8A]' : 'text-violet-600'}`}>
            快速喊單
          </h2>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setIsGachaModalOpen(true)}
              className="px-3 py-1.5 rounded-full text-xs flex items-center gap-1.5 whitespace-nowrap transition-all active:scale-95 shadow-sm border bg-white text-pink-600 border-pink-200 hover:bg-pink-50 shrink-0"
            >
              <Package size={14} /> 快速扭蛋
            </button>
            <button
              onClick={() => setOrderMode(orderMode === 'byProduct' ? 'byCustomer' : 'byProduct')}
              className={`px-3 py-1.5 rounded-full text-xs flex items-center gap-1.5 whitespace-nowrap transition-all active:scale-95 shadow-sm border shrink-0 ${
                orderMode === 'byProduct'
                  ? 'bg-white text-violet-600 border-violet-200 hover:bg-violet-50'
                  : 'bg-white text-[#7A9E8A] border-[#7A9E8A]/30 hover:bg-[#E5EFEA]'
              }`}
            >
              <ArrowLeftRight size={14} />
              {orderMode === 'byProduct' ? '切換 👤 客人' : '切換 📦 商品'}
            </button>
          </div>
        </div>

        {orderMode === 'byProduct' ? (
          <div className="flex flex-col gap-4">
            {/* Product Selection */}
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="block text-stone-400 text-xs ml-1">選擇商品</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="搜尋商品..."
                    className="w-full bg-white border border-stone-200 rounded-xl py-1.5 px-3 text-sm focus:ring-2 focus:ring-[#7A9E8A] outline-none transition-all"
                    value={productSearchTerm}
                    onChange={(e) => { setProductSearchTerm(e.target.value); setIsProductDropdownOpen(true); }}
                    onFocus={() => setIsProductDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setIsProductDropdownOpen(false), 200)}
                  />
                  {productSearchTerm && (
                    <button
                      onClick={() => { setProductSearchTerm(''); setSelectedProduct(''); }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-300 hover:text-stone-500"
                    >
                      <X size={18} />
                    </button>
                  )}

                  {isProductDropdownOpen && productSearchTerm && (
                    <div className="absolute top-full left-0 w-full bg-white border border-stone-200 shadow-xl rounded-xl z-50 mt-1.5 max-h-60 overflow-y-auto">
                      {products
                        .filter(p =>
                          p.name.toLowerCase().includes(productSearchTerm.toLowerCase()) ||
                          p.brand?.toLowerCase().includes(productSearchTerm.toLowerCase())
                        )
                        .map(p => (
                          <button
                            key={p.id}
                            className="w-full text-left px-3 py-2 hover:bg-[#E5EFEA] border-b border-stone-100 last:border-0 flex justify-between items-center transition-colors"
                            onClick={() => { setSelectedProduct(p.id); setProductSearchTerm(p.name); setIsProductDropdownOpen(false); setSelectedVariant(p.variants[0] || ''); }}
                          >
                            <div className="flex items-center gap-2">
                              <img
                                src={(p.imageUrl && !p.imageUrl.includes('picsum.photos')) ? p.imageUrl : (p.category === '扭蛋' ? DEFAULT_GACHA_IMAGE : (p.imageUrl || 'https://picsum.photos/seed/product/100/100'))}
                                className="w-8 h-8 rounded-lg object-cover border border-stone-200"
                                alt={p.name} referrerPolicy="no-referrer" loading="lazy"
                              />
                              <div>
                                <div className="text-stone-700 text-sm">{p.name}</div>
                                <div className="text-xs text-stone-400">¥ {p.priceJPY}</div>
                              </div>
                            </div>
                            <div className="flex flex-col items-end">
                              <span className="text-[#7A9E8A] text-sm">NT${p.priceTWD}</span>
                              {p.variantPrices && Object.keys(p.variantPrices).length > 0 && (
                                <span className="text-xs text-stone-400">多規格價格</span>
                              )}
                            </div>
                          </button>
                        ))}
                    </div>
                  )}
                </div>

                {/* Variants */}
                {selectedProduct && products.find(p => p.id === selectedProduct)?.variants.length! > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5 p-1.5 bg-stone-50 rounded-lg border border-stone-100">
                    {products.find(p => p.id === selectedProduct)?.variants.map(v => {
                      const p = products.find(prod => prod.id === selectedProduct);
                      const price = p?.variantPrices?.[v] ? p.variantPrices[v] : p?.priceTWD;
                      return (
                        <button
                          key={v}
                          onClick={() => setSelectedVariant(v)}
                          className={`px-3 py-1 rounded-md text-xs border transition-all flex items-center gap-1 ${selectedVariant === v ? 'bg-[#7A9E8A] border-[#7A9E8A] text-white shadow-sm' : 'bg-white border-stone-200 text-stone-500 hover:border-[#7A9E8A]/50'}`}
                        >
                          {v}
                          {p?.variantPrices?.[v] && (
                            <span className={`ml-0.5 ${selectedVariant === v ? 'text-white/80' : 'text-[#7A9E8A]'}`}>${price}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Customer & Qty */}
            <div className="space-y-2 relative">
              <div className="border-t border-stone-100 pt-3"></div>
              <div className="flex justify-between items-center px-1">
                <label className="text-stone-400 text-xs">客人名稱 &amp; 數量</label>
                <button
                  onClick={() => setBatchOrders([...batchOrders, { name: '', qty: 1 }])}
                  className="text-[#7A9E8A] text-xs hover:underline flex items-center gap-1"
                >
                  + 增加欄位
                </button>
              </div>

              <div className="space-y-1">
                {batchOrders.map((order, idx) => (
                  <div key={idx} className="flex gap-1.5 items-center group">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        placeholder="客人名稱 (如: Amy Chen)"
                        className={`w-full px-3 py-1.5 border rounded-xl text-sm focus:outline-none transition-all ${order.name ? 'border-[#7A9E8A] ring-2 ring-[#E5EFEA]' : 'border-stone-200 bg-stone-50/30'}`}
                        value={order.name}
                        onChange={e => {
                          const newBatch = [...batchOrders];
                          newBatch[idx].name = e.target.value;
                          setBatchOrders(newBatch);
                          setFocusedRowIndex(idx);
                        }}
                        onFocus={() => setFocusedRowIndex(idx)}
                        onBlur={() => setTimeout(() => setFocusedRowIndex(null), 200)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && order.name) {
                            setBatchOrders([...batchOrders, { name: '', qty: 1 }]);
                          }
                        }}
                      />
                      {focusedRowIndex === idx && order.name && (
                        <div className="absolute top-full left-0 w-full bg-white border border-stone-200 shadow-xl rounded-xl z-50 mt-1 max-h-48 overflow-y-auto">
                          {customers
                            .filter(c =>
                              c.lineName.toLowerCase().includes(order.name.toLowerCase()) ||
                              c.nickname?.toLowerCase().includes(order.name.toLowerCase())
                            )
                            .map(c => (
                              <button
                                key={c.id}
                                className="w-full text-left px-3 py-2 hover:bg-[#E5EFEA] border-b border-stone-100 last:border-0 flex items-center gap-3 transition-colors"
                                onClick={() => {
                                  const newBatch = [...batchOrders];
                                  newBatch[idx].name = c.lineName;
                                  setBatchOrders(newBatch);
                                  setFocusedRowIndex(null);
                                }}
                              >
                                <div className="w-8 h-8 rounded-full bg-[#E5EFEA] text-[#7A9E8A] flex items-center justify-center text-xs">{c.lineName[0]}</div>
                                <div className="text-stone-700 text-xs truncate">{c.lineName} {c.nickname ? `(${c.nickname})` : ''}</div>
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                    <div className="w-20">
                      <input
                        type="number"
                        min="1"
                        className="w-full px-2 py-1.5 border border-stone-200 rounded-xl text-center text-sm focus:border-[#7A9E8A] outline-none"
                        value={order.qty}
                        onChange={e => {
                          const newBatch = [...batchOrders];
                          newBatch[idx].qty = Math.max(1, parseInt(e.target.value) || 1);
                          setBatchOrders(newBatch);
                        }}
                      />
                    </div>
                    {batchOrders.length > 1 && (
                      <button
                        onClick={() => setBatchOrders(batchOrders.filter((_, i) => i !== idx))}
                        className="p-1.5 text-stone-300 hover:text-red-500 transition-colors"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Confirm Button */}
            <div className="mt-1">
              <button
                disabled={!selectedProduct || batchOrders.filter(o => o.name.trim()).length === 0}
                onClick={() => {
                  const validOrders = batchOrders.filter(o => o.name.trim());
                  validOrders.forEach(vo => {
                    let customer = customers.find(c => c.lineName === vo.name || c.nickname === vo.name);
                    let customerId = customer?.id;
                    let newCustomer: Customer | undefined;
                    if (!customer) {
                      customerId = generateId();
                      newCustomer = { id: customerId, lineName: vo.name, nickname: vo.name, isBlacklisted: false, totalSpent: 0, sessionCount: 0 };
                    }
                    onAddOrder({
                      id: generateId(),
                      productId: selectedProduct,
                      customerId: customerId!,
                      quantity: vo.qty,
                      quantityBought: 0,
                      status: 'PENDING',
                      notificationStatus: 'UNNOTIFIED',
                      isArchived: false,
                      timestamp: Date.now(),
                      variant: selectedVariant
                    }, newCustomer);
                  });
                  setBatchOrders([{ name: '', qty: 1 }]);
                  setProductSearchTerm('');
                  setSelectedProduct('');
                }}
                className={`w-full py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 transition-all shadow-sm ${
                  (!selectedProduct || batchOrders.filter(o => o.name.trim()).length === 0)
                    ? 'bg-stone-100 text-stone-400 cursor-not-allowed'
                    : 'bg-[#7A9E8A] text-white hover:bg-[#5C8070] active:scale-[0.98]'
                }`}
              >
                <Send size={18} />
                {!selectedProduct || batchOrders.filter(o => o.name.trim()).length === 0 ? '填寫未完成' : '確認錄入所有喊單'}
              </button>

              {selectedProduct && (
                <button
                  onClick={() => { setSelectedProduct(''); setProductSearchTerm(''); setBatchOrders([{ name: '', qty: 1 }]); }}
                  className="w-full mt-2 text-stone-400 text-xs hover:text-stone-600 transition-colors"
                >
                  取消重選
                </button>
              )}
            </div>
          </div>
        ) : (
          /* ── By-customer mode ── */
          <div className="flex flex-col gap-4">
            {/* Customer Selection */}
            <div className="space-y-1 relative">
              <label className="block text-stone-400 text-xs ml-1">選擇客人</label>
              <input
                type="text"
                placeholder="客人名稱 (如: Amy Chen)"
                className="w-full bg-white border border-stone-200 rounded-xl py-1.5 px-3 text-sm focus:ring-2 focus:ring-[#7A9E8A] outline-none transition-all"
                value={customerSearchTerm}
                onChange={(e) => { setCustomerSearchTerm(e.target.value); setIsCustomerSearchDropdownOpen(true); }}
                onFocus={() => setIsCustomerSearchDropdownOpen(true)}
                onBlur={() => setTimeout(() => setIsCustomerSearchDropdownOpen(false), 200)}
              />
              {isCustomerSearchDropdownOpen && customerSearchTerm && (
                <div className="absolute top-full left-0 w-full bg-white border border-stone-200 shadow-xl rounded-xl z-50 mt-1 max-h-48 overflow-y-auto">
                  {customers
                    .filter(c =>
                      c.lineName.toLowerCase().includes(customerSearchTerm.toLowerCase()) ||
                      c.nickname?.toLowerCase().includes(customerSearchTerm.toLowerCase())
                    )
                    .map(c => (
                      <button
                        key={c.id}
                        className="w-full text-left px-3 py-2 hover:bg-[#E5EFEA] border-b border-stone-100 last:border-0 flex items-center gap-3 transition-colors"
                        onClick={() => { setCustomerSearchTerm(c.lineName); setIsCustomerSearchDropdownOpen(false); }}
                      >
                        <div className="w-8 h-8 rounded-full bg-[#E5EFEA] text-[#7A9E8A] flex items-center justify-center text-xs">{c.lineName[0]}</div>
                        <div className="text-stone-700 text-xs truncate">{c.lineName} {c.nickname ? `(${c.nickname})` : ''}</div>
                      </button>
                    ))}
                </div>
              )}
            </div>

            {/* Products & Qty */}
            <div className="space-y-2 relative">
              <div className="border-t border-stone-100 pt-3"></div>
              <div className="flex justify-between items-center px-1">
                <label className="text-stone-400 text-xs">選擇商品 &amp; 數量</label>
                <button
                  onClick={() => setCustomerBatchOrders([...customerBatchOrders, { productId: '', productName: '', variant: '', qty: 1, searchOpen: false }])}
                  className="text-[#7A9E8A] text-xs hover:underline flex items-center gap-1"
                >
                  + 增加商品
                </button>
              </div>

              <div className="space-y-2">
                {customerBatchOrders.map((order, idx) => (
                  <div key={idx} className={`flex flex-col gap-2 p-2.5 rounded-xl border transition-all ${order.productId ? 'bg-white border-[#7A9E8A]/20 shadow-sm' : 'bg-stone-50 border-stone-200 border-dashed'}`}>
                    {order.productId ? (
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-stone-100 border border-stone-200 overflow-hidden flex-shrink-0">
                          <img
                            src={(products.find(p => p.id === order.productId)?.imageUrl && !products.find(p => p.id === order.productId)?.imageUrl?.includes('picsum.photos')) ? products.find(p => p.id === order.productId)?.imageUrl : (products.find(p => p.id === order.productId)?.category === '扭蛋' ? DEFAULT_GACHA_IMAGE : (products.find(p => p.id === order.productId)?.imageUrl || 'https://picsum.photos/seed/product/100/100'))}
                            className="w-full h-full object-cover" alt={order.productName} referrerPolicy="no-referrer" loading="lazy"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-stone-700 text-sm truncate">{order.productName}</div>
                          {products.find(p => p.id === order.productId)?.variants.length! > 0 ? (
                            <select
                              className="text-xs bg-transparent text-stone-500 outline-none cursor-pointer mt-0.5 w-full font-medium"
                              value={order.variant}
                              onChange={e => {
                                const newBatch = [...customerBatchOrders];
                                newBatch[idx].variant = e.target.value;
                                setCustomerBatchOrders(newBatch);
                              }}
                            >
                              {products.find(p => p.id === order.productId)?.variants.map(v => {
                                const p = products.find(prod => prod.id === order.productId);
                                const price = p?.variantPrices?.[v] ? p.variantPrices[v] : p?.priceTWD;
                                return <option key={v} value={v}>{v} {p?.variantPrices?.[v] ? `($${price})` : ''}</option>;
                              })}
                            </select>
                          ) : (
                            <div className="text-xs text-stone-400 mt-0.5">無規格</div>
                          )}
                        </div>
                        <div className="flex items-center bg-stone-50 border border-stone-200 rounded-lg overflow-hidden shadow-sm flex-shrink-0">
                          <button onClick={() => { const nb = [...customerBatchOrders]; nb[idx].qty = Math.max(1, nb[idx].qty - 1); setCustomerBatchOrders(nb); }} className="px-2 py-1.5 text-stone-500 hover:bg-stone-200 transition-colors"><Minus size={14} /></button>
                          <span className="w-6 text-center text-sm text-stone-700">{order.qty}</span>
                          <button onClick={() => { const nb = [...customerBatchOrders]; nb[idx].qty += 1; setCustomerBatchOrders(nb); }} className="px-2 py-1.5 text-stone-500 hover:bg-stone-200 transition-colors"><Plus size={14} /></button>
                        </div>
                        <button
                          onClick={() => {
                            if (customerBatchOrders.length === 1) {
                              setCustomerBatchOrders([{ productId: '', productName: '', variant: '', qty: 1, searchOpen: false }]);
                            } else {
                              setCustomerBatchOrders(customerBatchOrders.filter((_, i) => i !== idx));
                            }
                          }}
                          className="p-1.5 text-stone-300 hover:text-red-500 transition-colors flex-shrink-0"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 relative">
                        <div className="relative flex-1">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" size={14} />
                          <input
                            type="text"
                            placeholder="搜尋商品，或點擊加入..."
                            className="w-full pl-8 pr-3 py-1.5 bg-transparent border-none text-sm focus:outline-none text-stone-600 placeholder:text-stone-400"
                            value={order.productName}
                            onChange={e => {
                              const nb = [...customerBatchOrders];
                              nb[idx].productName = e.target.value;
                              nb[idx].productId = '';
                              nb[idx].searchOpen = true;
                              setCustomerBatchOrders(nb);
                            }}
                            onFocus={() => {
                              const nb = [...customerBatchOrders];
                              nb[idx].searchOpen = true;
                              setCustomerBatchOrders(nb);
                            }}
                            onBlur={() => setTimeout(() => {
                              const nb = [...customerBatchOrders];
                              if (nb[idx]) nb[idx].searchOpen = false;
                              setCustomerBatchOrders(nb);
                            }, 200)}
                          />
                          {order.searchOpen && order.productName && !order.productId && (
                            <div className="absolute top-full left-0 w-full bg-white border border-stone-200 shadow-xl rounded-xl z-50 mt-1 max-h-48 overflow-y-auto">
                              {products
                                .filter(p =>
                                  p.name.toLowerCase().includes(order.productName.toLowerCase()) ||
                                  p.brand?.toLowerCase().includes(order.productName.toLowerCase())
                                )
                                .map(p => (
                                  <button
                                    key={p.id}
                                    className="w-full text-left px-3 py-2 hover:bg-[#E5EFEA] border-b border-stone-100 last:border-0 flex justify-between items-center transition-colors"
                                    onClick={() => {
                                      const nb = [...customerBatchOrders];
                                      nb[idx].productId = p.id;
                                      nb[idx].productName = p.name;
                                      nb[idx].variant = p.variants[0] || '';
                                      nb[idx].searchOpen = false;
                                      setCustomerBatchOrders(nb);
                                    }}
                                  >
                                    <div className="flex items-center gap-2">
                                      <img src={(p.imageUrl && !p.imageUrl.includes('picsum.photos')) ? p.imageUrl : (p.category === '扭蛋' ? DEFAULT_GACHA_IMAGE : (p.imageUrl || 'https://picsum.photos/seed/product/100/100'))} className="w-6 h-6 rounded object-cover border border-stone-200" alt={p.name} referrerPolicy="no-referrer" loading="lazy" />
                                      <div className="text-stone-700 text-xs truncate">{p.name}</div>
                                    </div>
                                  </button>
                                ))}
                            </div>
                          )}
                        </div>
                        {customerBatchOrders.length > 1 && (
                          <button onClick={() => setCustomerBatchOrders(customerBatchOrders.filter((_, i) => i !== idx))} className="p-1.5 text-stone-400 hover:text-red-500 transition-colors">
                            <X size={16} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Confirm Button */}
            <div className="mt-1">
              <button
                disabled={!customerSearchTerm.trim() || customerBatchOrders.filter(o => o.productId).length === 0}
                onClick={() => {
                  const validOrders = customerBatchOrders.filter(o => o.productId);
                  let customer = customers.find(c => c.lineName === customerSearchTerm || c.nickname === customerSearchTerm);
                  let customerId = customer?.id;
                  let newCustomer: Customer | undefined;
                  if (!customer) {
                    customerId = generateId();
                    newCustomer = { id: customerId, lineName: customerSearchTerm, nickname: customerSearchTerm, isBlacklisted: false, totalSpent: 0, sessionCount: 0 };
                  }
                  validOrders.forEach(vo => {
                    onAddOrder({
                      id: generateId(),
                      productId: vo.productId,
                      customerId: customerId!,
                      quantity: vo.qty,
                      quantityBought: 0,
                      status: 'PENDING',
                      notificationStatus: 'UNNOTIFIED',
                      isArchived: false,
                      timestamp: Date.now(),
                      variant: vo.variant
                    }, newCustomer);
                    newCustomer = undefined;
                  });
                  setCustomerBatchOrders([{ productId: '', productName: '', variant: '', qty: 1, searchOpen: false }]);
                  setCustomerSearchTerm('');
                }}
                className={`w-full py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 transition-all shadow-sm ${
                  (!customerSearchTerm.trim() || customerBatchOrders.filter(o => o.productId).length === 0)
                    ? 'bg-stone-100 text-stone-400 cursor-not-allowed'
                    : 'bg-[#7A9E8A] text-white hover:bg-[#5C8070] active:scale-[0.98]'
                }`}
              >
                <Send size={18} />
                {!customerSearchTerm.trim() || customerBatchOrders.filter(o => o.productId).length === 0 ? '填寫未完成' : '確認錄入所有喊單'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 上架新商品 */}
      <div className="w-full">
        <button
          onClick={() => setIsAddProductOpen(true)}
          className="w-full bg-white border-2 border-dashed border-stone-300 hover:bg-stone-50 text-stone-500 py-5 rounded-xl text-base flex items-center justify-center gap-2 transition-all shadow-sm active:scale-95"
        >
          <Camera size={16} strokeWidth={1.5} /> 上架新商品
        </button>
      </div>
    </div>
  );
};
