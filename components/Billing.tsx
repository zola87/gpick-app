
import React, { useMemo, useState } from 'react';
import { Customer, Order, Product, GlobalSettings } from '../types';
import { Copy, JapaneseYen as DollarSign, Edit, X, Search, CheckCircle, Send, Share2, QrCode, Link } from 'lucide-react';
import { updateDocument } from '../services/firebaseService';

const genToken = () => Math.random().toString(36).substring(2, 12) + Math.random().toString(36).substring(2, 6);

interface BillingProps {
  customers: Customer[];
  orders: Order[];
  products: Product[];
  settings: GlobalSettings;
  onUpdateOrder: (o: Order) => void;
}

interface BillItem {
  name: string;
  variant?: string;
  qty: number;
  price: number;
  total: number;
}

interface Bill {
  customer: Customer;
  orders: Order[];
  items: BillItem[];
  subtotal: number;
  shippingFee: number;
  isFreeShipping: boolean;
  pickupPayment: number;
  remittanceAmount: number;
  isFullyPaid: boolean;
  paymentMethod?: string;
  paymentNote?: string;
}

export const Billing: React.FC<BillingProps> = ({ customers, orders, products, settings, onUpdateOrder }) => {
  const [editingBill, setEditingBill] = useState<{customerId: string, text: string} | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);

  const [payingCustomer, setPayingCustomer] = useState<{id: string, name: string} | null>(null);
  const [payMethod, setPayMethod] = useState('轉帳');
  const [payLast5, setPayLast5] = useState('');

  // Share link modal state
  const [shareModal, setShareModal] = useState<{customer: Customer, url: string} | null>(null);
  const [copyDone, setCopyDone] = useState(false);

  const handleOpenShareModal = async (customer: Customer) => {
    let token = customer.customerToken;
    if (!token) {
      token = genToken();
      await updateDocument('customers', { ...customer, customerToken: token });
    }
    const url = `${window.location.origin}${window.location.pathname}#/c/${token}`;
    setShareModal({ customer, url });
  };

  const handleCopyLink = () => {
    if (!shareModal) return;
    navigator.clipboard.writeText(shareModal.url);
    setCopyDone(true);
    setTimeout(() => setCopyDone(false), 2000);
  };

  const customerBills = useMemo(() => {
    const activeOrders = orders.filter(o => !o.isArchived);

    const bills = customers.map((customer): Bill | null => {
      if (searchTerm && !customer.lineName.toLowerCase().includes(searchTerm.toLowerCase()) && !customer.nickname?.toLowerCase().includes(searchTerm.toLowerCase())) {
          return null;
      }

      const custOrders = activeOrders.filter(o => o.customerId === customer.id);
      if (custOrders.length === 0) return null;

      let subtotal = 0;
      let isFullyPaid = true;

      const itemsDetail = custOrders.map(order => {
        const product = products.find(p => p.id === order.productId);
        if (!product) return null;
        const billQty = order.quantityBought || 0;
        if (billQty <= 0) return null; 
        if (!order.isPaid) isFullyPaid = false;
        
        let price = (order.variant && product.variantPrices && product.variantPrices[order.variant]) 
          ? product.variantPrices[order.variant] 
          : product.priceTWD;
          
        if (order.keepShell) {
          price += 10;
        }
          
        const itemTotal = price * billQty;
        subtotal += itemTotal;
        return { name: product.name + (order.keepShell ? ' (留殼)' : ''), variant: order.variant, qty: billQty, price: price, total: itemTotal };
      }).filter(Boolean) as BillItem[];

      if (itemsDetail.length === 0) return null;

      const isFreeShipping = subtotal >= settings.freeShippingThreshold;
      
      let remittanceAmount = subtotal - settings.pickupPayment;
      if (isFreeShipping) {
          remittanceAmount -= settings.shippingFee;
      }
      
      if (remittanceAmount < 0) remittanceAmount = 0;

      const paymentInfo = custOrders.find(o => o.isPaid);

      return {
        customer,
        orders: custOrders,
        items: itemsDetail,
        subtotal,
        shippingFee: settings.shippingFee,
        isFreeShipping,
        pickupPayment: settings.pickupPayment,
        remittanceAmount,
        isFullyPaid,
        paymentMethod: paymentInfo?.paymentMethod,
        paymentNote: paymentInfo?.paymentNote
      };
    });

    return bills.filter((b): b is Bill => b !== null).sort((a, b) => {
        if (a.isFullyPaid === b.isFullyPaid) return 0;
        return a.isFullyPaid ? 1 : -1;
    });

  }, [customers, orders, products, settings, searchTerm]);

  const generateBillText = (bill: Bill) => {
    const sessionName = settings.sessionName || "連線";
    // UPDATED: Changed prefix from "- " to "– " (En Dash)
    const itemsText = bill.items.map(i => `– ${i.name} ${i.variant ? `(${i.variant})` : ''} x${i.qty} $${i.total}`).join('\n');
    const template = settings.billingMessageTemplate || '';
    
    let message = template
      .split('{{sessionName}}').join(sessionName)
      .split('{{name}}').join(bill.customer.lineName)
      .split('{{items}}').join(itemsText)
      .split('{{subtotal}}').join(bill.subtotal.toString())
      .split('{{remittance}}').join(bill.remittanceAmount.toString());

    return message.trim();
  };

  const openEditModal = (bill: Bill) => setEditingBill({ customerId: bill.customer.id, text: generateBillText(bill) });
  const handleSaveAndCopy = () => { if (editingBill) { navigator.clipboard.writeText(editingBill.text); setEditingBill(null); } };
  const handleShareToLine = () => { if (editingBill) { window.open(`https://line.me/R/msg/text/?${encodeURIComponent(editingBill.text)}`, '_blank'); } };

  const handleRegisterPayment = () => {
    if(!payingCustomer) return;
    const bill = customerBills.find(b => b?.customer.id === payingCustomer.id);
    if(bill) { bill.orders.forEach(o => onUpdateOrder({ ...o, isPaid: true, paymentMethod: payMethod, paymentNote: payLast5 })); }
    setPayingCustomer(null);
    setPayLast5('');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
        <div>
            <h2 className="text-xl font-bold text-slate-800 tracking-tight">對帳與結單</h2>
            <div className="text-xs text-[#8A8278] mt-1">當前場次：<span className="text-[#2C2926] font-semibold">{settings.sessionName}</span></div>
        </div>
        <div className="relative w-full md:w-64">
           <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
           <input
            type="text"
            placeholder="搜尋姓名..."
            className="w-full pl-9 pr-4 py-2 border border-slate-200/80 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-slate-300 font-medium shadow-sm"
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setIsSearchDropdownOpen(true); }}
            onFocus={() => setIsSearchDropdownOpen(true)}
            onBlur={() => setTimeout(() => setIsSearchDropdownOpen(false), 200)}
          />
          {isSearchDropdownOpen && searchTerm && (
            <div className="absolute top-full left-0 w-full bg-white border border-slate-100 shadow-2xl shadow-black/8 rounded-xl z-50 mt-1.5 max-h-60 overflow-y-auto">
              {customers.filter(c => c.lineName.toLowerCase().includes(searchTerm.toLowerCase()) || c.nickname?.toLowerCase().includes(searchTerm.toLowerCase())).map(c => (
                <button key={c.id} className="w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-100 last:border-0 flex items-center gap-3 transition-colors" onClick={() => { setSearchTerm(c.lineName); setIsSearchDropdownOpen(false); }}>
                  <div className="w-7 h-7 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center font-semibold text-xs shrink-0">{c.lineName[0]}</div>
                  <div className="font-medium text-slate-700 text-xs truncate">{c.lineName} {c.nickname ? `(${c.nickname})` : ''}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {customerBills.map((bill) => (
          <div key={bill.customer.id} className={`bg-white rounded-2xl shadow-sm border transition-all ${bill.isFullyPaid ? 'border-[#7A9E8A]/20 opacity-75' : 'border-[#7A9E8A]/15 hover:shadow-md hover:-translate-y-0.5'}`}>
            <div className={`px-4 py-3.5 flex justify-between items-center rounded-t-2xl ${bill.isFullyPaid ? 'bg-[#E5EFEA]' : 'bg-[#EDE8E3]/80'}`}>
              <div className="font-semibold text-[#2C2926] text-base">{bill.customer.lineName}</div>
              {bill.isFullyPaid && (
                <div className="flex items-center text-[#2C2926] text-xs font-semibold gap-1 bg-[#7A9E8A]/20 px-2.5 py-1 rounded-full">
                  <CheckCircle size={12} /> 已入帳
                </div>
              )}
            </div>

            <div className="p-5 space-y-4">
              <div className="space-y-2.5">
                {bill.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center text-sm">
                    <span className="flex-1 pr-2 text-slate-600">
                        <span className="text-slate-800 font-medium">{item.name}</span>
                        {item.variant && <span className="text-xs text-slate-400 ml-1">({item.variant})</span>}
                        <span className="ml-1 text-slate-400 text-xs">×{item.qty}</span>
                    </span>
                    <span className="font-semibold text-slate-700 num">$ {item.total}</span>
                  </div>
                ))}
              </div>

              <div className="pt-3 border-t border-dashed border-slate-100">
                <div className="flex justify-between text-xs text-slate-400 mb-1.5">
                  <span>商品小計</span>
                  <span className="num">$ {bill.subtotal}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-400 mb-1.5">
                  <span>預扣賣貨便最低支付</span>
                  <span className="num">- $ {bill.pickupPayment}</span>
                </div>
                {bill.isFreeShipping && (
                   <div className="flex justify-between text-xs text-emerald-500 font-medium mb-1.5">
                     <span>連線滿額免運折抵</span>
                     <span className="num">- $ {bill.shippingFee}</span>
                   </div>
                )}
                <div className={`flex justify-between items-center font-semibold text-base mt-3 px-4 py-3 rounded-xl ${bill.isFullyPaid ? 'text-[#2C2926] bg-[#E5EFEA]' : 'text-[#2C2926] bg-[#EDE8E3]'}`}>
                   <span className="text-xs font-semibold uppercase tracking-wide text-current opacity-60">{bill.isFullyPaid ? '已收匯款' : '需匯款'}</span>
                   <span className="num">$ {bill.remittanceAmount}</span>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50/40 rounded-b-2xl grid grid-cols-3 gap-2">
               <button onClick={() => openEditModal(bill)} className="py-2.5 rounded-xl bg-white border border-slate-100 text-slate-600 text-xs font-semibold flex justify-center items-center gap-1 hover:bg-slate-50 shadow-sm"><Edit size={12} /> 對帳</button>
               <button onClick={() => handleOpenShareModal(bill.customer)} className="py-2.5 rounded-xl bg-white border border-slate-100 text-[#7A9E8A] text-xs font-semibold flex justify-center items-center gap-1 hover:bg-[#E5EFEA] shadow-sm"><Share2 size={12} /> 分享</button>
               {bill.isFullyPaid ? (
                   <button disabled className="py-2.5 rounded-xl bg-[#E5EFEA] text-[#2C2926] text-xs font-semibold">✓ 結案</button>
               ) : (
                   <button onClick={() => setPayingCustomer({id: bill.customer.id, name: bill.customer.lineName})} className="py-2.5 rounded-xl bg-[#3F4550] text-white text-xs font-semibold hover:bg-[#2F3540]">收款</button>
               )}
            </div>
          </div>
        ))}
      </div>

      {editingBill && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-md">
            <div className="bg-white rounded-2xl shadow-2xl shadow-black/10 w-full max-w-lg flex flex-col max-h-[85vh]">
                <div className="px-5 py-4 flex justify-between items-center border-b border-slate-100">
                    <h3 className="font-semibold text-slate-800 text-sm">預覽通知訊息</h3>
                    <button onClick={() => setEditingBill(null)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600"><X size={18}/></button>
                </div>
                <div className="p-5 flex-1 overflow-auto">
                    <textarea
                        value={editingBill.text}
                        onChange={e => setEditingBill({...editingBill, text: e.target.value})}
                        className="w-full h-80 p-4 border border-slate-200/80 rounded-xl text-sm leading-relaxed font-sans focus:ring-2 focus:ring-slate-300 outline-none bg-slate-50/50 resize-none"
                    />
                </div>
                <div className="px-5 py-4 flex gap-3 border-t border-slate-100">
                    <button onClick={handleShareToLine} className="flex-1 py-2.5 bg-[#06C755] text-white rounded-xl font-semibold text-sm flex justify-center items-center gap-2 hover:brightness-105 active:scale-[0.98]"><Send size={16} /> 傳送 LINE</button>
                    <button onClick={handleSaveAndCopy} className="flex-1 py-2.5 bg-[#3F4550] text-white rounded-xl font-semibold text-sm flex justify-center items-center gap-2 hover:bg-[#2F3540] active:scale-[0.98]"><Copy size={16} /> 複製文字</button>
                </div>
            </div>
        </div>
      )}

      {/* Share Link Modal */}
      {shareModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-md">
          <div className="bg-white rounded-2xl shadow-2xl shadow-black/10 w-full max-w-sm p-6 space-y-5">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-[#2C2926] text-sm">分享查帳連結</h3>
              <button onClick={() => setShareModal(null)} className="p-1.5 hover:bg-[#E5DFD9] rounded-lg text-[#8A8278]"><X size={18}/></button>
            </div>

            <div className="text-center">
              <div className="text-sm font-medium text-[#2C2926] mb-1">{shareModal.customer.lineName}</div>
              <p className="text-xs text-[#8A8278]">客人點此連結即可即時查看本場訂單狀態與金額</p>
            </div>

            {/* QR Code */}
            <div className="flex justify-center">
              <div className="p-3 bg-white border border-[#E5DFD9] rounded-2xl shadow-sm">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(shareModal.url)}&bgcolor=ffffff&color=3F4550&qzone=1`}
                  alt="QR Code"
                  className="w-40 h-40 rounded-lg"
                />
              </div>
            </div>

            {/* Link display */}
            <div className="flex items-center gap-2 bg-[#F7F4F0] rounded-xl px-3 py-2.5">
              <Link size={12} className="text-[#ADA49C] shrink-0" />
              <span className="text-xs text-[#8A8278] truncate flex-1">{shareModal.url}</span>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleCopyLink}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all ${copyDone ? 'bg-[#E5EFEA] text-[#5C8070]' : 'bg-[#3F4550] text-white hover:bg-[#2F3540]'}`}
              >
                <Copy size={14} /> {copyDone ? '已複製！' : '複製連結'}
              </button>
              <button
                onClick={() => window.open(`https://line.me/R/msg/text/?${encodeURIComponent(`查看你的訂單：${shareModal.url}`)}`, '_blank')}
                className="flex-1 py-2.5 bg-[#06C755] text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:brightness-105"
              >
                <Send size={14} /> 傳 LINE
              </button>
            </div>
          </div>
        </div>
      )}

      {payingCustomer && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-md">
              <div className="bg-white rounded-2xl shadow-2xl shadow-black/10 w-full max-w-sm p-6">
                  <h3 className="text-base font-bold mb-5 text-slate-800">登記收款：{payingCustomer.name}</h3>
                  <div className="space-y-4">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">付款方式</label>
                        <select className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 bg-white shadow-sm text-sm text-slate-800 outline-none focus:ring-2 focus:ring-slate-300" value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                          <option value="轉帳">銀行轉帳</option>
                          <option value="面交">面交支付</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">帳號後五碼</label>
                        <input type="text" className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 bg-white shadow-sm text-sm outline-none focus:ring-2 focus:ring-slate-300" placeholder="如：12345" value={payLast5} onChange={e => setPayLast5(e.target.value)} />
                      </div>
                      <div className="flex gap-3 pt-2">
                        <button onClick={() => setPayingCustomer(null)} className="flex-1 py-2.5 bg-slate-100 rounded-xl text-slate-600 font-semibold text-sm hover:bg-slate-200">取消</button>
                        <button onClick={handleRegisterPayment} className="flex-1 py-2.5 bg-[#3F4550] text-white rounded-xl font-semibold text-sm hover:bg-[#2F3540] active:scale-[0.98]">確認登記</button>
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
