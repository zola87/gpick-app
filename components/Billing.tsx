
import React, { useMemo, useState } from 'react';
import { Customer, Order, Product, GlobalSettings } from '../types';
import { Copy, JapaneseYen as DollarSign, Edit, X, Search, CheckCircle, Send } from 'lucide-react';

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
  
  const [payingCustomer, setPayingCustomer] = useState<{id: string, name: string} | null>(null);
  const [payMethod, setPayMethod] = useState('轉帳');
  const [payLast5, setPayLast5] = useState('');

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
        const itemTotal = product.priceTWD * billQty;
        subtotal += itemTotal;
        return { name: product.name, variant: order.variant, qty: billQty, price: product.priceTWD, total: itemTotal };
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
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
            <h2 className="text-2xl font-bold text-stone-800">對帳與結單</h2>
            <div className="text-sm text-stone-500 mt-1">當前場次：<span className="text-blue-600 font-bold">{settings.sessionName}</span></div>
        </div>
        <div className="relative w-full md:w-64">
           <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 w-4 h-4" />
           <input type="text" placeholder="搜尋姓名..." className="w-full pl-9 pr-4 py-2 border rounded-xl text-sm bg-white shadow-sm outline-none focus:ring-2 focus:ring-blue-500" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {customerBills.map((bill) => (
          <div key={bill.customer.id} className={`bg-white rounded-2xl shadow-sm border transition-all ${bill.isFullyPaid ? 'border-green-200 opacity-80' : 'border-stone-200 hover:shadow-md'}`}>
            <div className={`p-4 flex justify-between items-center rounded-t-2xl ${bill.isFullyPaid ? 'bg-green-50' : 'bg-stone-50'}`}>
              <div className="font-bold text-blue-700 text-lg">{bill.customer.lineName}</div>
              {bill.isFullyPaid && <div className="flex items-center text-green-600 text-xs font-bold gap-1"><CheckCircle size={14} /> 已入帳</div>}
            </div>
            
            <div className="p-5 space-y-4">
              <div className="space-y-3">
                {bill.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-start text-sm text-stone-600">
                    <span className="flex-1 pr-2">
                        <span className="text-stone-800 font-medium">{item.name}</span>
                        {item.variant && <span className="text-xs text-stone-400 ml-1">({item.variant})</span>}
                        <span className="ml-1 text-stone-400">x{item.qty}</span>
                    </span>
                    <span className="font-bold whitespace-nowrap">$ {item.total}</span>
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t border-stone-100">
                <div className="flex justify-between text-[11px] text-stone-400 mb-1">
                  <span>商品小計</span>
                  <span>$ {bill.subtotal}</span>
                </div>
                <div className="flex justify-between text-[11px] text-stone-400">
                  <span>預扣賣貨便最低支付</span>
                  <span>- $ {bill.pickupPayment}</span>
                </div>
                {bill.isFreeShipping && (
                   <div className="flex justify-between text-[11px] text-green-500 font-bold">
                     <span>連線滿額免運折抵</span>
                     <span>- $ {bill.shippingFee}</span>
                   </div>
                )}
                <div className={`flex justify-between items-center font-bold text-lg mt-3 p-4 rounded-xl ${bill.isFullyPaid ? 'text-green-600 bg-green-50' : 'text-blue-600 bg-blue-50/60'}`}>
                   <span className="text-sm font-bold">{bill.isFullyPaid ? '已收匯款' : '需匯款'}</span>
                   <span>$ {bill.remittanceAmount}</span>
                </div>
              </div>
            </div>

            <div className="p-4 bg-stone-50/50 border-t rounded-b-2xl grid grid-cols-2 gap-3">
               <button onClick={() => openEditModal(bill)} className="py-2.5 rounded-xl bg-white border border-stone-200 text-stone-600 text-xs font-bold flex justify-center items-center gap-1.5 hover:bg-stone-100 transition-colors shadow-sm"><Edit size={14} /> 通知對帳</button>
               {bill.isFullyPaid ? (
                   <button disabled className="py-2.5 rounded-xl bg-green-100 text-green-700 text-xs font-bold shadow-inner">完成結案</button>
               ) : (
                   <button onClick={() => setPayingCustomer({id: bill.customer.id, name: bill.customer.lineName})} className="py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold shadow-md hover:bg-blue-700 transition-colors">登記收款</button>
               )}
            </div>
          </div>
        ))}
      </div>

      {editingBill && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh] animate-in zoom-in-95">
                <div className="p-5 border-b flex justify-between bg-stone-50/50 items-center rounded-t-3xl">
                    <h3 className="font-bold text-stone-800">預覽通知訊息</h3>
                    <button onClick={() => setEditingBill(null)} className="p-1 hover:bg-stone-200 rounded-full"><X size={20}/></button>
                </div>
                <div className="p-6 flex-1 overflow-auto">
                    <textarea 
                        value={editingBill.text} 
                        onChange={e => setEditingBill({...editingBill, text: e.target.value})} 
                        className="w-full h-80 p-5 border border-stone-200 rounded-2xl text-sm leading-relaxed font-sans focus:ring-2 focus:ring-blue-500 outline-none shadow-inner" 
                    />
                </div>
                <div className="p-6 border-t flex gap-4 bg-stone-50/30 rounded-b-3xl">
                    <button onClick={handleShareToLine} className="flex-1 py-3 bg-[#06C755] text-white rounded-2xl font-bold flex justify-center items-center gap-2 shadow-lg hover:brightness-110 active:scale-95 transition-all"><Send size={18} /> 傳送 LINE</button>
                    <button onClick={handleSaveAndCopy} className="flex-1 py-3 bg-stone-800 text-white rounded-2xl font-bold flex justify-center items-center gap-2 shadow-lg hover:bg-black active:scale-95 transition-all"><Copy size={18} /> 複製文字</button>
                </div>
            </div>
        </div>
      )}

      {payingCustomer && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 animate-in zoom-in-95">
                  <h3 className="text-xl font-bold mb-6 text-stone-800">登記收款: {payingCustomer.name}</h3>
                  <div className="space-y-5">
                      <div>
                        <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1.5 ml-1">付款方式</label>
                        <select className="w-full border border-stone-200 rounded-xl px-4 py-3 bg-white shadow-sm" value={payMethod} onChange={e => setPayMethod(e.target.value)}><option value="轉帳">銀行轉帳</option><option value="面交">面交支付</option></select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1.5 ml-1">帳號後五碼</label>
                        <input type="text" className="w-full border border-stone-200 rounded-xl px-4 py-3 bg-white shadow-sm" placeholder="如：12345" value={payLast5} onChange={e => setPayLast5(e.target.value)} />
                      </div>
                      <div className="flex gap-4 pt-4"><button onClick={() => setPayingCustomer(null)} className="flex-1 py-3 bg-stone-100 rounded-xl text-stone-600 font-bold hover:bg-stone-200 transition-colors">取消</button><button onClick={handleRegisterPayment} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg hover:bg-blue-700 transition-all active:scale-95">確認登記</button></div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
