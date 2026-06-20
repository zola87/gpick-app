
import React, { useState, useMemo } from 'react';
import { Product, Order, Customer, GlobalSettings } from '../types';
import { CheckCircle, Circle, MapPin, Search, ChevronDown, ChevronUp, Bell, Check, ShoppingCart, User, Plus, Minus, X, Info, ArrowUp, ArrowDown, Send, MessageSquare, Loader2 } from 'lucide-react';
import { sendLineMessage } from '../services/firebaseService';

interface ShoppingListProps {
  products: Product[];
  orders: Order[];
  customers: Customer[];
  settings: GlobalSettings;
  onUpdateOrder: (order: Order) => void;
  onBulkUpdateOrders?: (orders: Order[]) => void;
}

export const ShoppingList: React.FC<ShoppingListProps> = ({ products, orders, customers, settings, onUpdateOrder, onBulkUpdateOrders }) => {
  const DEFAULT_GACHA_IMAGE = "https://cdn.phototourl.com/free/2026-03-25-d705f2ce-ec34-4ce9-9cc9-ffcee8b972b9.jpg";
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [justFilledOrderIds, setJustFilledOrderIds] = useState<string[]>([]);
  const [viewingProduct, setViewingProduct] = useState<Product | null>(null);
  const [isGachaWallMode, setIsGachaWallMode] = useState(false);
  const [sortBy, setSortBy] = useState<'default' | 'gachaFirst' | 'location' | 'customer'>('default');

  // Notification state
  const [showNotifyModal, setShowNotifyModal] = useState(false);
  const [sendingCustomerId, setSendingCustomerId] = useState<string | null>(null);

  // Send notification: auto-push via LINE 官方帳號 if customer linked LINE, otherwise open LINE app manually
  const handleSendNotify = async (group: { customer: Customer; orders: Order[] }, msg: string) => {
    if (group.customer.lineUserId) {
      setSendingCustomerId(group.customer.id);
      const result = await sendLineMessage(group.customer.lineUserId, msg);
      setSendingCustomerId(null);
      if (result.success) {
        markGroupNotified(group);
        return;
      }
      alert(`自動傳送失敗，將改用手動傳送方式。\n${result.error || ''}`);
    }
    window.open(`https://line.me/R/msg/text/?${encodeURIComponent(msg)}`, '_blank');
    markGroupNotified(group);
  };

  // Batch Add State
  const [batchModeItem, setBatchModeItem] = useState<{id: string, name: string} | null>(null);
  const [batchQty, setBatchQty] = useState<string>(''); // string to handle empty input nicely

  // Filter archived orders and stock items
  const stockCustomerId = customers.find(c => c.isStock)?.id;
  const activeOrders = orders.filter(o => !o.isArchived && o.customerId !== stockCustomerId);

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

  // Customers who have newly-bought NON-gacha items that haven't been notified yet
  const unnotifiedGroups = useMemo(() => {
    return customers
      .filter(c => !c.isStock && !c.isBlacklisted)
      .map(customer => {
        const notifiable = activeOrders.filter(o =>
          o.customerId === customer.id &&
          (o.quantityBought ?? 0) > 0 &&
          o.notificationStatus !== 'NOTIFIED'
        ).filter(o => {
          const product = products.find(p => p.id === o.productId);
          return product?.category !== '扭蛋'; // gacha notified via photos, skip
        });
        if (notifiable.length === 0) return null;
        return { customer, orders: notifiable };
      })
      .filter((g): g is { customer: Customer; orders: Order[] } => g !== null);
  }, [customers, activeOrders, products]);

  const generateNotifyMsg = (group: { customer: Customer; orders: Order[] }) => {
    const sessionName = settings.sessionName || '本次連線';
    const name = group.customer.lineName;
    const lines = group.orders.map(o => {
      const p = products.find(pr => pr.id === o.productId);
      const variantPart = o.variant ? ` (${o.variant})` : '';
      return `✓ ${p?.name ?? '商品'}${variantPart} × ${o.quantityBought}`;
    }).join('\n');
    return `【${sessionName}】${name} 嗨！\n\n以下商品已幫你買到囉 🛍️\n\n${lines}\n\n其他商品繼續幫你找，買到再通知你♡`;
  };

  const markGroupNotified = (group: { customer: Customer; orders: Order[] }) => {
    group.orders.forEach(o => onUpdateOrder({ ...o, notificationStatus: 'NOTIFIED' }));
  };

  const [filterLocation, setFilterLocation] = useState<string>('all');
  const [filterCustomer, setFilterCustomer] = useState<string>('all');
  const [locationSearch, setLocationSearch] = useState('');
  const [isLocationDropdownOpen, setIsLocationDropdownOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);

  // Compute unique locations and customers for filters
  const uniqueLocations = Array.from(new Set(products.map(p => p.sourcingLocations?.find(l => l.isPrimary)?.name || p.sourcingLocations?.[0]?.name || p.sourcingLocation).filter(Boolean))) as string[];
  const uniqueCustomers = Array.from(new Set(activeOrders.map(o => o.customerId)));

  // Filter by search, location, and customer
  const filteredItems = groupedItems.filter(item => {
    const matchesSearch = item.product.name.toLowerCase().includes(searchTerm.toLowerCase());
    
    const itemLocation = item.product.sourcingLocations?.find(l => l.isPrimary)?.name || item.product.sourcingLocations?.[0]?.name || item.product.sourcingLocation;
    const matchesLocation = filterLocation === 'all' || itemLocation === filterLocation;

    const matchesCustomer = filterCustomer === 'all' || item.orders.some(o => o.customerId === filterCustomer);

    return matchesSearch && matchesLocation && matchesCustomer;
  }).sort((a, b) => {
    // Always put completed items at the bottom
    if (a.isComplete !== b.isComplete) return a.isComplete ? 1 : -1;

    switch (sortBy) {
      case 'gachaFirst':
        const aIsGacha = a.product.category === '扭蛋' || a.product.brand === '扭蛋' ? 1 : 0;
        const bIsGacha = b.product.category === '扭蛋' || b.product.brand === '扭蛋' ? 1 : 0;
        if (aIsGacha !== bIsGacha) return bIsGacha - aIsGacha;
        return a.product.name.localeCompare(b.product.name);
      case 'location':
        const locA = a.product.sourcingLocations?.find(l => l.isPrimary)?.name || a.product.sourcingLocations?.[0]?.name || a.product.sourcingLocation || 'ZZZ';
        const locB = b.product.sourcingLocations?.find(l => l.isPrimary)?.name || b.product.sourcingLocations?.[0]?.name || b.product.sourcingLocation || 'ZZZ';
        if (locA !== locB) return locA.localeCompare(locB);
        return a.product.name.localeCompare(b.product.name);
      case 'customer':
        const custA = customers.find(c => c.id === a.orders[0]?.customerId)?.nickname || 'ZZZ';
        const custB = customers.find(c => c.id === b.orders[0]?.customerId)?.nickname || 'ZZZ';
        if (custA !== custB) return custA.localeCompare(custB);
        return a.product.name.localeCompare(b.product.name);
      default:
        // Default sort by creation time (newest first) or name
        return b.product.createdAt - a.product.createdAt;
    }
  });

  const handleUpdateBought = (item: typeof filteredItems[0], newTotalBought: number) => {
    // Auto-expand to show distribution when updating
    setExpandedItem(item.id);

    const isGacha = item.product.category === '扭蛋';

    // Distribute the "bought" quantity to orders based on timestamp priority
    let remainingBought = newTotalBought;

    item.orders.forEach(order => {
      const needed = order.quantity;
      let newQty: number;
      let newStatus: Order['status'];

      if (remainingBought >= needed) {
        newQty = needed;
        newStatus = 'BOUGHT';
        remainingBought -= needed;
      } else if (remainingBought > 0) {
        newQty = remainingBought;
        newStatus = 'PENDING';
        remainingBought = 0;
      } else {
        newQty = 0;
        newStatus = 'PENDING';
      }

      onUpdateOrder({
        ...order,
        quantityBought: newQty,
        status: newStatus,
        // Gacha: silently mark notified (owner already got photo in real-time)
        notificationStatus: isGacha ? 'NOTIFIED' : order.notificationStatus,
      });
    });
  };

  const toggleNotification = (order: Order) => {
      const newStatus = order.notificationStatus === 'NOTIFIED' ? 'UNNOTIFIED' : 'NOTIFIED';
      onUpdateOrder({...order, notificationStatus: newStatus});
  };

  const handleMoveOrderUp = (item: typeof filteredItems[0], index: number) => {
    if (index <= 0 || !onBulkUpdateOrders) return;
    const newOrders = item.orders.map(o => ({...o}));
    const currentOrder = newOrders[index];
    const prevOrder = newOrders[index - 1];
    
    // Swap timestamps to change sorting order
    const temp = currentOrder.timestamp;
    currentOrder.timestamp = prevOrder.timestamp;
    prevOrder.timestamp = temp;
    
    // Ensure they are strictly different if they were identical
    if (currentOrder.timestamp === prevOrder.timestamp) {
      currentOrder.timestamp -= 1;
    }
    
    // Re-sort and recalculate allocation
    newOrders.sort((a, b) => a.timestamp - b.timestamp);
    let remainingBought = item.totalBought;
    
    newOrders.forEach(order => {
      const needed = order.quantity;
      if (remainingBought >= needed) {
        order.quantityBought = needed;
        order.status = 'BOUGHT';
        remainingBought -= needed;
      } else if (remainingBought > 0) {
        order.quantityBought = remainingBought;
        order.status = 'PENDING';
        remainingBought = 0;
      } else {
        order.quantityBought = 0;
        order.status = 'PENDING';
      }
    });
    
    onBulkUpdateOrders(newOrders);
  };

  const handleMoveOrderDown = (item: typeof filteredItems[0], index: number) => {
    if (index >= item.orders.length - 1 || !onBulkUpdateOrders) return;
    const newOrders = item.orders.map(o => ({...o}));
    const currentOrder = newOrders[index];
    const nextOrder = newOrders[index + 1];
    
    // Swap timestamps to change sorting order
    const temp = currentOrder.timestamp;
    currentOrder.timestamp = nextOrder.timestamp;
    nextOrder.timestamp = temp;
    
    // Ensure they are strictly different if they were identical
    if (currentOrder.timestamp === nextOrder.timestamp) {
      nextOrder.timestamp -= 1;
    }
    
    // Re-sort and recalculate allocation
    newOrders.sort((a, b) => a.timestamp - b.timestamp);
    let remainingBought = item.totalBought;
    
    newOrders.forEach(order => {
      const needed = order.quantity;
      if (remainingBought >= needed) {
        order.quantityBought = needed;
        order.status = 'BOUGHT';
        remainingBought -= needed;
      } else if (remainingBought > 0) {
        order.quantityBought = remainingBought;
        order.status = 'PENDING';
        remainingBought = 0;
      } else {
        order.quantityBought = 0;
        order.status = 'PENDING';
      }
    });
    
    onBulkUpdateOrders(newOrders);
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
    <div className="max-w-7xl mx-auto pb-24 relative">
      <div className="bg-[#3F4550] text-[#EEF0EC] p-3 sm:p-4 rounded-t-xl shadow-md sticky top-0 z-20">
        <div className="flex justify-between items-center gap-2 mb-3">
          <h2 className="text-xl flex items-center gap-1.5 whitespace-nowrap font-semibold">
            <MapPin className="w-5 h-5 text-[#7A9E8A]" />
            現場採購清單
          </h2>
          <div className="bg-[#2F3540] rounded-lg p-1 flex items-center relative flex-1 max-w-[180px] sm:max-w-none sm:w-48">
            <Search size={14} className="ml-2 text-[#8A9E90]" />
            <input
              className="bg-transparent border-none focus:ring-0 text-[#EEF0EC] placeholder-[#8A9E90] text-xs w-full"
              placeholder="搜尋..."
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setIsSearchDropdownOpen(true); }}
              onFocus={() => setIsSearchDropdownOpen(true)}
              onBlur={() => setTimeout(() => setIsSearchDropdownOpen(false), 200)}
            />
            {isSearchDropdownOpen && searchTerm && (
              <div className="absolute top-full right-0 w-full sm:w-64 bg-white border border-stone-200 shadow-2xl rounded-xl z-50 mt-2 max-h-60 overflow-y-auto">
                {products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase())).map(p => (
                  <button key={p.id} className="w-full text-left px-4 py-3 hover:bg-[#E5EFEA] border-b border-stone-100 last:border-0 flex items-center gap-3 transition-colors" onClick={() => { setSearchTerm(p.name); setIsSearchDropdownOpen(false); }}>
                    <img src={(p.imageUrl && !p.imageUrl.includes('picsum.photos')) ? p.imageUrl : (p.category === '扭蛋' ? DEFAULT_GACHA_IMAGE : (p.imageUrl || 'https://picsum.photos/seed/product/100/100'))} className="w-8 h-8 rounded object-cover border border-stone-100" alt={p.name} referrerPolicy="no-referrer" loading="lazy"/>
                    <div className="text-[#2C2926] text-xs truncate">{p.name}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-4 gap-1 sm:flex sm:flex-wrap sm:gap-2">
            <button 
              onClick={() => setIsGachaWallMode(!isGachaWallMode)}
              className={`text-xs px-1 sm:px-3 py-1.5 rounded-lg flex items-center justify-center gap-1 transition-all w-full sm:w-auto border ${isGachaWallMode ? 'bg-pink-100 text-stone-600 border-pink-300 shadow-inner' : 'bg-pink-50 text-stone-600 border-pink-100 hover:bg-pink-100'}`}
            >
              <ShoppingCart size={12} className="hidden sm:block" /> {isGachaWallMode ? '返回' : '圖牆'}
            </button>
            
            <button 
              onClick={() => setSortBy(sortBy === 'default' ? 'gachaFirst' : 'default')}
              className={`text-sm px-1 sm:px-3 py-1.5 rounded-lg flex items-center justify-center gap-1 transition-all w-full sm:w-auto border ${sortBy === 'gachaFirst' ? 'bg-amber-100 text-stone-600 border-amber-300 shadow-inner' : 'bg-amber-50 text-stone-600 border-amber-100 hover:bg-amber-100'}`}
            >
              {sortBy === 'gachaFirst' ? '扭蛋' : '最新'}
            </button>

            <div className="relative w-full sm:w-auto">
              <input 
                type="text" 
                placeholder="地點"
                className="text-sm px-1 sm:px-2 py-1.5 rounded-lg bg-green-50 text-stone-600 border border-green-100 outline-none focus:ring-2 focus:ring-green-300 cursor-pointer hover:bg-green-100 transition-colors w-full sm:max-w-[100px] placeholder:text-stone-400 text-center"
                value={filterLocation === 'all' ? locationSearch : filterLocation}
                onChange={e => {
                  setLocationSearch(e.target.value);
                  setIsLocationDropdownOpen(true);
                  if (e.target.value === '') setFilterLocation('all');
                }}
                onFocus={() => setIsLocationDropdownOpen(true)}
                onBlur={() => setTimeout(() => setIsLocationDropdownOpen(false), 200)}
              />
              {isLocationDropdownOpen && (
                <div className="absolute top-full left-0 w-48 bg-white border border-stone-200 shadow-2xl rounded-xl z-50 mt-1 max-h-60 overflow-y-auto">
                  <button 
                    className="w-full text-left px-4 py-2 hover:bg-green-50 text-sm text-stone-600 border-b border-stone-100"
                    onClick={() => {
                      setFilterLocation('all');
                      setLocationSearch('');
                      setIsLocationDropdownOpen(false);
                    }}
                  >
                    所有地點
                  </button>
                  {uniqueLocations
                    .filter(loc => loc.toLowerCase().includes(locationSearch.toLowerCase()))
                    .map(loc => (
                      <button 
                        key={loc} 
                        className="w-full text-left px-4 py-2 hover:bg-green-50 text-sm text-stone-600 border-b border-stone-100 last:border-0"
                        onClick={() => {
                          setFilterLocation(loc);
                          setLocationSearch(loc);
                          setIsLocationDropdownOpen(false);
                        }}
                      >
                        {loc}
                      </button>
                    ))
                  }
                </div>
              )}
            </div>

            <div className="relative w-full sm:w-auto">
              <input 
                type="text"
                placeholder="客人"
                className="text-sm px-1 sm:px-2 py-1.5 rounded-lg bg-indigo-50 text-stone-600 border border-indigo-100 outline-none focus:ring-2 focus:ring-indigo-300 cursor-pointer hover:bg-indigo-100 transition-colors w-full sm:max-w-[100px] placeholder:text-stone-400 text-center"
                value={filterCustomer === 'all' ? customerSearch : (customers.find(c => c.id === filterCustomer)?.nickname || customers.find(c => c.id === filterCustomer)?.lineName || '')}
                onChange={e => {
                  setCustomerSearch(e.target.value);
                  setIsCustomerDropdownOpen(true);
                  if (e.target.value === '') setFilterCustomer('all');
                }}
                onFocus={() => setIsCustomerDropdownOpen(true)}
                onBlur={() => setTimeout(() => setIsCustomerDropdownOpen(false), 200)}
              />
              {isCustomerDropdownOpen && (
                <div className="absolute top-full left-0 w-48 bg-white border border-stone-200 shadow-2xl rounded-xl z-50 mt-1 max-h-60 overflow-y-auto">
                  <button 
                    className="w-full text-left px-4 py-2 hover:bg-indigo-50 text-sm text-stone-600 border-b border-stone-100"
                    onClick={() => {
                      setFilterCustomer('all');
                      setCustomerSearch('');
                      setIsCustomerDropdownOpen(false);
                    }}
                  >
                    所有客人
                  </button>
                  {uniqueCustomers
                    .map(cId => customers.find(c => c.id === cId))
                    .filter(c => c && (c.nickname || c.lineName).toLowerCase().includes(customerSearch.toLowerCase()))
                    .map(c => (
                      <button 
                        key={c!.id} 
                        className="w-full text-left px-4 py-2 hover:bg-indigo-50 text-sm text-stone-600 border-b border-stone-100 last:border-0"
                        onClick={() => {
                          setFilterCustomer(c!.id);
                          setCustomerSearch(c!.nickname || c!.lineName);
                          setIsCustomerDropdownOpen(false);
                        }}
                      >
                        {c!.nickname || c!.lineName}
                      </button>
                    ))
                  }
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-between items-center">
            <p className="text-[#8A9E90] text-xs">依喊單順序分配，輸入數量後自動展開</p>
            <div className="flex items-center gap-2">
              {/* Notify button — only visible when there are unnotified customers */}
              <button
                onClick={() => setShowNotifyModal(true)}
                className={`relative text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-all font-medium border ${
                  unnotifiedGroups.length > 0
                    ? 'bg-[#06C755]/20 text-[#06C755] border-[#06C755]/40 hover:bg-[#06C755]/30'
                    : 'bg-[#2F3540] text-[#8A9E90] border-[#3A4550] opacity-60'
                }`}
              >
                <Bell size={12} />
                今日通知
                {unnotifiedGroups.length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-rose-500 text-white text-[9px] rounded-full flex items-center justify-center font-bold leading-none">
                    {unnotifiedGroups.length}
                  </span>
                )}
              </button>
              <div className="text-xs bg-[#2F3540] px-2 py-1 rounded whitespace-nowrap">
                未完: <span className="text-[#EEF0EC]">{filteredItems.filter(i => !i.isComplete).length}</span>
                <span className="mx-1 text-[#8A9E90]">/</span>
                已完: <span className="text-[#7A9E8A]">{filteredItems.filter(i => i.isComplete).length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="bg-white shadow-md rounded-b-xl overflow-hidden min-h-[500px]">
        {filteredItems.length === 0 ? (
          <div className="p-10 text-center text-stone-400">
            沒有符合的採購項目 (或所有訂單已封存)
          </div>
        ) : isGachaWallMode ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 p-4 bg-stone-50">
            {filteredItems.map(item => {
              // Calculate who needs what
              const customerNeeds: Record<string, number> = {};
              item.orders.forEach(o => {
                const customer = customers.find(c => c.id === o.customerId);
                const name = customer?.nickname || customer?.lineName || '未知客人';
                if (!customerNeeds[name]) customerNeeds[name] = 0;
                customerNeeds[name] += o.quantity;
              });

              return (
                <div key={item.id} className={`bg-white rounded-2xl shadow-sm border overflow-hidden flex flex-col transition-all ${item.isComplete ? 'border-green-200 opacity-60' : 'border-stone-200 hover:border-pink-300 hover:shadow-md'}`}>
                  <div 
                    className="relative w-full bg-stone-100 cursor-zoom-in overflow-hidden" 
                    style={{ paddingBottom: '125%', height: 0 }}
                    onClick={() => setViewingProduct(item.product)}
                  >
                    <img src={(item.product.imageUrl && !item.product.imageUrl.includes('picsum.photos')) ? item.product.imageUrl : (item.product.category === '扭蛋' ? DEFAULT_GACHA_IMAGE : (item.product.imageUrl || 'https://picsum.photos/seed/product/400/500'))} className="absolute inset-0 w-full h-full object-cover" alt={item.product.name} referrerPolicy="no-referrer" loading="lazy" />
                    {item.isComplete && (
                      <div className="absolute inset-0 bg-white/50 flex items-center justify-center backdrop-blur-[1px]">
                        <CheckCircle className="w-16 h-16 text-green-500 drop-shadow-md" />
                      </div>
                    )}
                    <div className="absolute top-2 right-2 bg-black/60 text-white px-2 py-1 rounded-lg text-sm backdrop-blur-sm">
                      {item.totalBought} / {item.totalNeeded}
                    </div>
                  </div>
                  
                  <div className="p-3 flex flex-col flex-1">
                    <h3 className="text-stone-800 text-sm line-clamp-2 mb-1">{item.product.name}</h3>
                    {item.variant && (
                      <span className="inline-block bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded w-fit mb-2">
                        {item.variant}
                      </span>
                    )}
                    
                    <div className="mt-auto pt-2 border-t border-stone-100">
                      <div className="text-xs text-stone-500 leading-relaxed max-h-20 overflow-y-auto">
                        {Object.entries(customerNeeds).map(([name, qty]) => (
                          <div key={name} className="flex justify-between">
                            <span className="truncate pr-1">{name}</span>
                            <span className="text-stone-700">x{qty}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-1 bg-stone-100 rounded-xl p-1">
                      <button 
                        onClick={() => handleUpdateBought(item, Math.max(0, item.totalBought - 1))}
                        disabled={item.totalBought === 0}
                        className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${item.totalBought === 0 ? 'text-stone-300' : 'bg-white text-stone-600 shadow-sm hover:bg-stone-50'}`}
                      >
                        <Minus size={14} />
                      </button>
                      <div className="flex-1 text-center text-sm">
                        <span className={item.totalBought > 0 ? 'text-green-600' : 'text-stone-500'}>{item.totalBought}</span>
                        <span className="text-stone-400 mx-1">/</span>
                        <span className="text-stone-700">{item.totalNeeded}</span>
                      </div>
                      <button 
                        onClick={() => handleUpdateBought(item, Math.min(item.totalNeeded, item.totalBought + 1))}
                        disabled={item.isComplete}
                        className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${item.isComplete ? 'text-stone-300' : 'bg-white text-stone-600 shadow-sm hover:bg-stone-50'}`}
                      >
                        <Plus size={14} />
                      </button>
                      {!item.isComplete && (
                        <button 
                          onClick={() => handleUpdateBought(item, item.totalNeeded)}
                          className="w-7 h-7 ml-1 flex items-center justify-center rounded-lg bg-green-100 text-green-600 hover:bg-green-200 transition-colors shadow-sm"
                          title="一鍵全買"
                        >
                          <Check size={14} strokeWidth={3} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
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
                          <img src={(item.product.imageUrl && !item.product.imageUrl.includes('picsum.photos')) ? item.product.imageUrl : (item.product.category === '扭蛋' ? DEFAULT_GACHA_IMAGE : (item.product.imageUrl || 'https://picsum.photos/seed/product/100/100'))} className="w-full h-full object-cover" alt={item.product.name} referrerPolicy="no-referrer" loading="lazy" />
                      </div>

                    <div className="flex-1 min-w-0" onClick={() => setExpandedItem(isExpanded ? null : item.id)}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className={`text-base truncate ${item.isComplete ? 'line-through text-stone-500' : 'text-stone-800'}`}>
                          {item.product.name}
                        </h3>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                         {item.variant && (
                          <span className="bg-white text-stone-700 border border-amber-400 text-xs px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap">
                            {item.variant}
                          </span>
                        )}
                         {(item.product.sourcingLocations?.find(l => l.isPrimary)?.name || item.product.sourcingLocation) && (
                          <span className="bg-stone-100 text-stone-600 text-xs px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap">
                            📍 {item.product.sourcingLocations?.find(l => l.isPrimary)?.name || item.product.sourcingLocation}
                          </span>
                         )}
                         <span className="text-xs text-stone-500">需求: <span className="text-stone-800 text-sm font-normal">{item.totalNeeded}</span></span>
                      </div>
                    </div>
                    </div>

                    {/* Quick Action Input */}
                    <div className="flex items-center gap-2 bg-stone-50 p-1.5 rounded-lg border border-stone-200 self-end sm:self-auto w-auto ml-auto sm:ml-0 mt-2 sm:mt-0">
                      <span className="text-sm text-stone-500 whitespace-nowrap">總買到:</span>
                      <input 
                        type="number" 
                        min="0"
                        value={item.totalBought}
                        onClick={(e) => (e.target as HTMLInputElement).select()}
                        onChange={(e) => handleUpdateBought(item, Number(e.target.value))}
                        className={`w-14 text-center border rounded-md py-1 focus:ring-2 focus:ring-[#7A9E8A] outline-none text-base font-medium ${item.totalBought < item.totalNeeded ? 'text-rose-500 border-rose-200 bg-rose-50' : 'text-[#5C8070] border-[#7A9E8A]/30 bg-[#E5EFEA]'}`}
                      />
                      
                      {/* Incremental Add Button */}
                      {!item.isComplete && (
                          <button
                            onClick={() => setBatchModeItem({id: item.id, name: `${item.product.name} ${item.variant || ''}`})}
                            className="bg-[#7A9E8A] text-white w-8 h-8 rounded-md flex items-center justify-center hover:bg-[#5C8070] active:scale-95 transition-all shadow-sm shrink-0"
                            title="追加剛買到的數量"
                          >
                              <Plus size={16} />
                          </button>
                      )}

                      <button 
                        onClick={() => setExpandedItem(isExpanded ? null : item.id)}
                        className={`w-6 h-6 flex items-center justify-center transition-colors shrink-0 ${isExpanded ? 'text-[#7A9E8A]' : 'text-stone-500 hover:text-stone-700'}`}
                        title={isExpanded ? "收起分配名單" : "展開分配名單"}
                      >
                          {isExpanded ? <ChevronUp size={18}/> : <ChevronDown size={18}/>}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Detail (Priority List) */}
                  {isExpanded && (
                    <div className="bg-stone-50 px-4 pb-4 pt-2 border-t border-stone-100 ml-0 sm:ml-12 animate-in slide-in-from-top-1 duration-200">
                      <h4 className="text-sm text-stone-400 mb-2 uppercase tracking-wider flex items-center gap-1">
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
                                <span className="text-stone-300 w-4 text-sm font-mono">#{idx + 1}</span>
                                <div className="flex items-center gap-2">
                                    <User size={14} className="text-stone-400"/>
                                    <span className={`${isFullyAllocated ? 'text-green-800' : 'text-stone-700'}`}>
                                    {customer?.lineName || 'Unknown'}
                                    </span>
                                    {isJustFilled && <span className="text-xs bg-yellow-400 text-yellow-900 px-1.5 rounded animate-pulse">剛剛買到!</span>}
                                </div>
                              </div>
                              <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2 text-sm">
                                    <span className="text-stone-400">喊 {order.quantity}</span>
                                    <span className="text-stone-300">→</span>
                                    <span className={`text-base ${isFullyAllocated ? 'text-green-600' : 'text-pink-500'}`}>
                                      獲 {order.quantityBought}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <button 
                                      onClick={() => toggleNotification(order)}
                                      className={`p-1.5 rounded-full transition-colors ${isNotified ? 'bg-green-200 text-green-700' : 'bg-stone-100 text-stone-400 hover:bg-stone-200'}`}
                                      title={isNotified ? "已通知" : "未通知"}
                                  >
                                      {isNotified ? <Check size={14} /> : <Bell size={14} />}
                                  </button>
                                  {onBulkUpdateOrders && (
                                    <div className="flex flex-col gap-0.5 ml-1">
                                      <button 
                                        onClick={() => handleMoveOrderUp(item, idx)}
                                        disabled={idx === 0}
                                        className={`p-0.5 rounded transition-colors ${idx === 0 ? 'text-stone-200 cursor-not-allowed' : 'text-stone-400 hover:bg-stone-200 hover:text-stone-700'}`}
                                        title="往前移 (優先分配)"
                                      >
                                        <ArrowUp size={12} />
                                      </button>
                                      <button 
                                        onClick={() => handleMoveOrderDown(item, idx)}
                                        disabled={idx === item.orders.length - 1}
                                        className={`p-0.5 rounded transition-colors ${idx === item.orders.length - 1 ? 'text-stone-200 cursor-not-allowed' : 'text-stone-400 hover:bg-stone-200 hover:text-stone-700'}`}
                                        title="往後移 (延後分配)"
                                      >
                                        <ArrowDown size={12} />
                                      </button>
                                    </div>
                                  )}
                                </div>
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
                 <h3 className="text-lg font-medium text-stone-800 mb-2">本次買到數量</h3>
                 <p className="text-sm text-stone-500 mb-4">{batchModeItem.name}</p>
                 
                 <div className="flex gap-2">
                    <input
                       type="number"
                       className="flex-1 border-2 border-[#7A9E8A] rounded-lg text-2xl font-medium text-center py-2 focus:outline-none"
                       autoFocus
                       placeholder="0"
                       value={batchQty}
                       onChange={e => setBatchQty(e.target.value)}
                       onKeyDown={e => e.key === 'Enter' && handleBatchAdd()}
                    />
                 </div>
                 <p className="text-xs text-[#8A8278] mt-2 text-center">輸入這次剛剛拿到的數量，系統會自動分配</p>

                 <div className="grid grid-cols-2 gap-3 mt-6">
                    <button onClick={() => {setBatchModeItem(null); setBatchQty('');}} className="py-3 bg-[#E5DFD9] text-[#2C2926] font-medium rounded-lg">取消</button>
                    <button onClick={handleBatchAdd} className="py-3 bg-[#7A9E8A] text-white font-medium rounded-lg shadow-lg shadow-[#7A9E8A]/20">確認分配</button>
                 </div>
             </div>
          </div>
      )}

      {/* ── 今日通知 Modal ──────────────────────────────────────────── */}
      {showNotifyModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh]">
            {/* Header */}
            <div className="px-5 py-4 border-b border-stone-100 flex justify-between items-start shrink-0">
              <div>
                <h3 className="font-semibold text-[#2C2926] flex items-center gap-2">
                  <Bell size={16} className="text-[#06C755]" /> 今日買到通知
                </h3>
                <p className="text-xs text-[#8A8278] mt-0.5">
                  {unnotifiedGroups.length > 0
                    ? `${unnotifiedGroups.length} 位客人有新商品買到（扭蛋已排除）`
                    : '所有客人都已通知，或目前沒有新的買到項目'}
                </p>
              </div>
              <button onClick={() => setShowNotifyModal(false)} className="p-1.5 hover:bg-stone-100 rounded-lg text-stone-400">
                <X size={18} />
              </button>
            </div>

            {/* List */}
            <div className="overflow-y-auto flex-1 divide-y divide-stone-100">
              {unnotifiedGroups.length === 0 ? (
                <div className="py-12 text-center">
                  <CheckCircle className="w-10 h-10 text-[#7A9E8A] mx-auto mb-3" />
                  <p className="text-[#8A8278] text-sm">沒有待通知的客人</p>
                </div>
              ) : (
                unnotifiedGroups.map(group => {
                  const msg = generateNotifyMsg(group);
                  return (
                    <div key={group.customer.id} className="p-4 space-y-3">
                      {/* Customer header */}
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-[#2C2926] text-sm">{group.customer.lineName}</span>
                        <span className="text-[10px] text-[#ADA49C] bg-[#F7F4F0] px-2 py-0.5 rounded-full">
                          {group.orders.length} 件商品
                        </span>
                      </div>

                      {/* Item list */}
                      <div className="space-y-1">
                        {group.orders.map(o => {
                          const p = products.find(pr => pr.id === o.productId);
                          return (
                            <div key={o.id} className="flex items-center gap-2 text-xs text-[#2C2926]">
                              <CheckCircle size={12} className="text-[#7A9E8A] shrink-0" />
                              <span className="flex-1">{p?.name ?? '商品'}{o.variant ? ` (${o.variant})` : ''}</span>
                              <span className="font-semibold text-[#7A9E8A]">× {o.quantityBought}</span>
                            </div>
                          );
                        })}
                      </div>

                      {/* Message preview */}
                      <div className="bg-[#F7F4F0] rounded-xl px-3 py-2.5 text-[11px] text-[#8A8278] leading-relaxed whitespace-pre-line">
                        {msg}
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleSendNotify(group, msg)}
                          disabled={sendingCustomerId === group.customer.id}
                          className="flex-1 py-2 bg-[#06C755] text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 hover:brightness-105 active:scale-[0.98] disabled:opacity-60"
                        >
                          {sendingCustomerId === group.customer.id ? (
                            <><Loader2 size={12} className="animate-spin" /> 傳送中…</>
                          ) : group.customer.lineUserId ? (
                            <><Send size={12} /> 自動傳送 LINE</>
                          ) : (
                            <><Send size={12} /> 傳送 LINE</>
                          )}
                        </button>
                        <button
                          onClick={() => markGroupNotified(group)}
                          className="px-4 py-2 bg-[#E5DFD9] text-[#8A8278] rounded-xl text-xs font-medium hover:bg-[#DAD4CE] transition-colors"
                          title="不傳訊息，只標記為已通知"
                        >
                          僅標記
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer: mark all */}
            {unnotifiedGroups.length > 1 && (
              <div className="px-5 py-3 border-t border-stone-100 shrink-0">
                <button
                  onClick={() => { unnotifiedGroups.forEach(g => markGroupNotified(g)); }}
                  className="w-full py-2.5 bg-[#3F4550] text-[#EEF0EC] rounded-xl text-xs font-semibold hover:bg-[#2F3540] transition-colors"
                >
                  全部標記為已通知（不傳訊息）
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Product Detail Modal */}
      {viewingProduct && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setViewingProduct(null)}>
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                  <div className="relative bg-stone-100 flex items-center justify-center min-h-[300px] max-h-[70vh]">
                      <img src={(viewingProduct.imageUrl && !viewingProduct.imageUrl.includes('picsum.photos')) ? viewingProduct.imageUrl : (viewingProduct.category === '扭蛋' ? DEFAULT_GACHA_IMAGE : (viewingProduct.imageUrl || 'https://picsum.photos/seed/product/800/800'))} className="w-full h-full max-h-[70vh] object-contain" alt={viewingProduct.name} referrerPolicy="no-referrer" loading="lazy" />
                      <button onClick={() => setViewingProduct(null)} className="absolute top-2 right-2 bg-black/50 text-white p-1 rounded-full hover:bg-black/70 z-10">
                          <X size={20}/>
                      </button>
                  </div>
                  <div className="p-5">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                            <h3 className="text-xl text-stone-800">{viewingProduct.name}</h3>
                            <p className="text-stone-500">{viewingProduct.brand}</p>
                        </div>
                        <div className="text-right">
                             {viewingProduct.variantPrices && Object.keys(viewingProduct.variantPrices).length > 0 ? (
                               <div className="text-xl text-[#7A9E8A]">
                                 NT$ {Math.min(...Object.values(viewingProduct.variantPrices))} 起
                               </div>
                             ) : (
                               <>
                                 <div className="text-2xl text-[#7A9E8A]">NT$ {viewingProduct.priceTWD}</div>
                                 <div className="text-xs text-stone-400">¥ {viewingProduct.priceJPY}</div>
                               </>
                             )}
                             {viewingProduct.variantPrices && Object.keys(viewingProduct.variantPrices).length > 0 && (
                               <div className="text-xs text-stone-400">依款式定價</div>
                             )}
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap gap-2 mb-4">
                          <span className="bg-stone-100 text-stone-600 px-2 py-1 rounded text-xs">{viewingProduct.category}</span>
                          {viewingProduct.sourcingLocations && viewingProduct.sourcingLocations.length > 0 ? (
                            viewingProduct.sourcingLocations.map((loc, idx) => (
                              <span key={idx} className={`px-2 py-1 rounded text-xs ${loc.isPrimary ? 'bg-[#E5EFEA] text-[#5C8070]' : 'bg-stone-100 text-stone-600'}`}>
                                📍 {loc.city ? `${loc.city} ` : ''}{loc.name} {loc.isPrimary && '(主要)'}
                              </span>
                            ))
                          ) : viewingProduct.sourcingLocation ? (
                            <span className="bg-stone-100 text-stone-600 px-2 py-1 rounded text-xs">📍 {viewingProduct.sourcingLocation}</span>
                          ) : null}
                      </div>

                      {viewingProduct.variants.length > 0 && (
                          <div className="bg-stone-50 p-3 rounded-lg border border-stone-100">
                              <span className="text-xs text-stone-400 uppercase tracking-wider mb-2 block">Available Variants</span>
                              <div className="flex flex-wrap gap-2">
                                  {viewingProduct.variants.map(v => (
                                      <span key={v} className="bg-white border border-stone-200 text-stone-700 px-2 py-1 rounded text-sm font-medium flex items-center gap-1">
                                        {v}
                                        {viewingProduct.variantPrices && viewingProduct.variantPrices[v] && (
                                          <span className="text-[#7A9E8A] ml-1">NT${viewingProduct.variantPrices[v]}</span>
                                        )}
                                      </span>
                                  ))}
                              </div>
                          </div>
                      )}
                      
                      <button onClick={() => setViewingProduct(null)} className="w-full mt-4 bg-stone-100 text-stone-600 py-3 rounded-lg hover:bg-stone-200">
                          關閉
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
