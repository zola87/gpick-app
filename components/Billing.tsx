
import React, { useMemo, useState } from 'react';
import { Customer, Order, Product, GlobalSettings } from '../types';
import { Copy, Check, DollarSign, Edit, X, Search, CheckCircle, CreditCard, AlertTriangle, MessageCircle } from 'lucide-react';

interface BillingProps {
  customers: Customer[];
  orders: Order[];
  products: Product[];
  settings: GlobalSettings;
  onUpdateOrder: (o: Order) => void;
}

export const Billing: React.FC<BillingProps> = ({ customers, orders, products, settings, onUpdateOrder }) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingBill, setEditingBill] = useState<{customerId: string, text: string} | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Payment Modal State
  const [payingCustomer, setPayingCustomer] = useState<{id: string, name: string} | null>(null);
  const [payMethod, setPayMethod] = useState('轉帳');
  const [payLast5, setPayLast5] = useState('');

  const customerBills = useMemo(() => {
    // Only process orders that are NOT archived (active session)
    const activeOrders = orders.filter(o => !o.isArchived);

    return customers.map(customer => {
      // Basic filtering
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
        
        const billQty = order.status === 'BOUGHT' || order.status === 'PACKED' || order.status === 'SHIPPED' 
          ? order.quantityBought || order.quantity 
          : order.quantity; 

        if (billQty === 0) return null;

        if (!order.isPaid) isFullyPaid = false;

        const itemTotal = product.priceTWD * billQty;
        subtotal += itemTotal;
        return {
          name: product.name,
          variant: order.variant,
          qty: billQty,
          price: product.priceTWD,
          total: itemTotal
        };
      }).filter(Boolean) as { name: string; variant?: string; qty: number; price: number; total: number }[];

      if (itemsDetail.length === 0) return null;

      const isFreeShipping = subtotal >= settings.freeShippingThreshold;
      const shippingFee = settings.shippingFee; 
      const pickupPayment = settings.pickupPayment; 

      let remittanceAmount = 0;
      
      if (isFreeShipping) {
          remittanceAmount = subtotal - pickupPayment - shippingFee;
      } else {
          remittanceAmount = subtotal - pickupPayment;
      }

      if (remittanceAmount < 0) remittanceAmount = 0;

      // Get payment info from first paid order (assuming batch payment)
      const paymentInfo = custOrders.find(o => o.isPaid);

      return {
        customer,
        orders: custOrders,
        items: itemsDetail,
        subtotal,
        shippingFee,
        isFreeShipping,
        pickupPayment,
        remittanceAmount,
        isFullyPaid,
        paymentMethod: paymentInfo?.paymentMethod,
        paymentNote: paymentInfo?.paymentNote
      };
    }).filter(Boolean);
  }, [customers, orders, products, settings, searchTerm]);

  const generateBillText = (bill: NonNullable<typeof customerBills[0]>) => {
    const date = new Date().toLocaleDateString('zh-TW');
    const itemsText = bill.items.map(i => `- ${i.name} ${i.variant ? `(${i.variant})` : ''} x${i.qty} $${i.total}`).join('\n');
    
    const template = settings.billingMessageTemplate || '';
    
    // Replace variables
    let message = template
      .replace(/{{date}}/g, date)
      .replace(/{{name}}/g, bill.customer.lineName)
      .replace(/{{items}}/g, itemsText)
      .replace(/{{subtotal}}/g, bill.subtotal.toString())
      .replace(/{{shipping}}/g, bill.shippingFee.toString())
      .replace(/{{freeShippingNote}}/g, bill.isFreeShipping ? '(已達免運扣除)' : '')
      .replace(/{{total}}/g, (bill.isFreeShipping ? bill.subtotal : bill.subtotal + bill.shippingFee).toString())
      .replace(/{{pickupPayment}}/g, (bill.pickupPayment + bill.shippingFee).toString())
      .replace(/{{remittance}}/g, bill.remittanceAmount.toString());

    return message.trim();
  };

  const openEditModal = (bill: any) => {
    setEditingBill({
        customerId: bill.customer.id,
        text: generateBillText(bill)
    });
  };

  const handleSaveAndCopy = () => {
    if (editingBill) {
        navigator.clipboard.writeText(editingBill.text);
        setCopiedId(editingBill.customerId);
        setTimeout(() => setCopiedId(null), 2000);
        setEditingBill(null);
    }
  };

  const handleOpenChat = (customer: Customer) => {
      if (customer.lineChatUrl) {
          window.open(customer.lineChatUrl, '_blank');
      } else {
          alert('請先至顧客管理(CRM)設定此客人的 LINE OA 聊天連結。');
      }
  };

  const handleRegisterPayment = () => {
    if(!payingCustomer) return;
    
    // Find all orders for this customer in this session and mark paid
    const bill = customerBills.find(b => b?.customer.id === payingCustomer.id);
    if(bill) {
        bill.orders.forEach(o => {
            onUpdateOrder({
                ...o, 
                isPaid: true,
                paymentMethod: payMethod,
                paymentNote: payLast5
            });
        });
    }
    setPayingCustomer(null);
    setPayLast5('');
  };

  const handleAbandonBill = (bill: any) => {
    const stockCustomer = customers.find(c => c.isStock);
    if(!stockCustomer) return;

    if(window.confirm(`確定將 ${bill.customer.lineName} 的所有訂單棄單轉入庫存？`)) {
        bill.orders.forEach((o: Order) => {
            onUpdateOrder({
                ...o,
                customerId: stockCustomer.id,
                status: 'BOUGHT',
                notificationStatus: 'UNNOTIFIED',
                isPaid: false
            });
        });
    }
  };

  return (
    <div className="space-y-6 relative">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
            <h2 className="text-2xl font-bold text-stone-800">對帳與結單</h2>
            <div className="text-sm text-stone-500 mt-1">
            免運門檻: ${settings.freeShippingThreshold} | 匯款 = 總額 - 取付額(含運)
            </div>
        </div>
        <div className="relative w-full md:w-64">
           <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 w-4 h-4" />
           <input 
              type="text" 
              placeholder="搜尋客人名字..."
              className="w-full pl-9 pr-4 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
           />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {customerBills.map((bill) => {
          if (!bill) return null;
          
          return (
            <div key={bill.customer.id} className={`bg-white rounded-xl shadow-sm border overflow-hidden flex flex-col hover:shadow-md transition-shadow ${bill.isFullyPaid ? 'border-green-300 ring-1 ring-green-100' : 'border-stone-200'}`}>
              <div className="p-4 bg-stone-50 border-b border-stone-100 flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <div className="font-bold text-lg text-blue-800">{bill.customer.lineName}</div>
                    {bill.isFullyPaid && <CheckCircle size={18} className="text-green-500" />}
                </div>
                <div className="flex gap-1">
                     {bill.isFreeShipping && (
                        <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full font-bold">免運達成</span>
                    )}
                </div>
              </div>
              
              <div className="p-4 flex-1 space-y-3">
                <ul className="text-sm text-stone-600 space-y-1">
                  {bill.items.map((item, idx) => (
                    <li key={idx} className="flex justify-between border-b border-stone-50 pb-1 last:border-0">
                      <span className="truncate pr-2">{item.name} {item.variant && <span className="text-xs text-stone-400">({item.variant})</span>} x{item.qty}</span>
                      <span className="font-mono">${item.total}</span>
                    </li>
                  ))}
                </ul>
                <div className="border-t border-stone-100 pt-3 mt-3 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>商品小計</span>
                    <span>${bill.subtotal}</span>
                  </div>
                  <div className="flex justify-between text-sm text-stone-400">
                    <span>賣貨便支付 (含運)</span>
                    <span>- ${bill.pickupPayment + bill.shippingFee}</span>
                  </div>
                  <div className="flex justify-between font-bold text-lg text-blue-600 mt-2 bg-blue-50 p-2 rounded">
                    <span>需匯款</span>
                    <span>${bill.remittanceAmount}</span>
                  </div>
                </div>

                {bill.isFullyPaid && (
                    <div className="bg-green-50 border border-green-200 rounded p-2 text-xs text-green-800 flex items-center gap-2">
                        <CheckCircle size={14}/>
                        <span>{bill.paymentMethod} (後5碼: {bill.paymentNote || '無'})</span>
                    </div>
                )}
              </div>

              <div className="p-4 bg-stone-50 border-t border-stone-100 grid grid-cols-2 gap-2">
                 {/* Open Chat */}
                 <button
                   onClick={() => handleOpenChat(bill.customer)}
                   className="col-span-2 py-2 rounded-lg font-bold text-white bg-[#06C755] hover:bg-[#05b34c] text-xs flex items-center justify-center gap-2 shadow-sm"
                 >
                    <MessageCircle size={14} /> 開啟 LINE 對話
                 </button>

                 {/* Left Action: Edit/Copy Text */}
                 <button
                   onClick={() => openEditModal(bill)}
                   className="py-2 rounded-lg font-medium transition-all flex items-center justify-center gap-2 bg-white border border-blue-200 text-blue-600 hover:bg-blue-50 text-xs"
                 >
                   <Edit size={14} /> 通知訊息
                 </button>

                 {/* Right Action: Pay or Abandon */}
                 {bill.isFullyPaid ? (
                     <button disabled className="py-2 rounded-lg font-bold bg-green-100 text-green-700 text-xs cursor-default flex items-center justify-center gap-1">
                         <Check size={14}/> 已收款
                     </button>
                 ) : (
                     <button 
                        onClick={() => setPayingCustomer({id: bill.customer.id, name: bill.customer.lineName})}
                        className="py-2 rounded-lg font-bold bg-pink-500 text-white hover:bg-pink-600 text-xs shadow-sm flex items-center justify-center gap-1"
                     >
                        <CreditCard size={14} /> 登記收款
                     </button>
                 )}
                 
                 {/* Abandon Button (Small) */}
                 {!bill.isFullyPaid && (
                     <button 
                        onClick={() => handleAbandonBill(bill)}
                        className="col-span-2 mt-1 text-stone-400 hover:text-red-500 text-[10px] flex items-center justify-center gap-1 py-1"
                     >
                         <AlertTriangle size={10} /> 棄單 (移入庫存)
                     </button>
                 )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit Modal */}
      {editingBill && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-4 border-b flex justify-between items-center bg-stone-50">
                    <h3 className="font-bold text-stone-800">編輯通知訊息</h3>
                    <button onClick={() => setEditingBill(null)}><X size={20} className="text-stone-400" /></button>
                </div>
                <div className="p-4 flex-1 overflow-auto">
                    <textarea 
                        value={editingBill.text}
                        onChange={(e) => setEditingBill({...editingBill, text: e.target.value})}
                        className="w-full h-64 p-3 border border-stone-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm font-mono"
                    />
                </div>
                <div className="p-4 border-t flex gap-3">
                    <button onClick={() => setEditingBill(null)} className="py-2 px-4 text-stone-600 font-medium">取消</button>
                    
                    <button onClick={handleSaveAndCopy} className="flex-1 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 shadow-md flex items-center justify-center gap-2">
                        <Copy size={16} /> 複製文字
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Payment Modal */}
      {payingCustomer && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
                  <h3 className="text-lg font-bold mb-4">登記收款: {payingCustomer.name}</h3>
                  <div className="space-y-4">
                      <div>
                          <label className="block text-sm font-medium text-stone-600 mb-1">付款方式</label>
                          <select 
                            className="w-full border rounded-lg px-3 py-2"
                            value={payMethod}
                            onChange={e => setPayMethod(e.target.value)}
                          >
                              <option value="轉帳">銀行轉帳</option>
                              <option value="面交">面交付款</option>
                              <option value="賣貨便">賣貨便取貨付款</option>
                          </select>
                      </div>
                      <div>
                          <label className="block text-sm font-medium text-stone-600 mb-1">帳號後五碼 / 備註</label>
                          <input 
                            type="text" 
                            className="w-full border rounded-lg px-3 py-2" 
                            placeholder="如：12345 或 面交已收"
                            value={payLast5}
                            onChange={e => setPayLast5(e.target.value)}
                          />
                      </div>
                      <div className="flex gap-3 pt-2">
                          <button onClick={() => setPayingCustomer(null)} className="flex-1 py-2 bg-stone-100 rounded-lg text-stone-600">取消</button>
                          <button onClick={handleRegisterPayment} className="flex-1 py-2 bg-blue-600 text-white rounded-lg font-bold">確認收款</button>
                      </div>
                  </div>
              </div>
          </div>
      )}
      
      {customerBills.length === 0 && (
        <div className="text-center py-20 text-stone-400">
          <DollarSign className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <p>尚無訂單資料可供結算 (如已封存請開始新連線)</p>
        </div>
      )}
    </div>
  );
};
