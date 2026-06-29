
import React, { useState, useMemo } from 'react';
import { Product, Order, Customer, GlobalSettings } from '../types';
import { CheckCircle, Circle, MapPin, Search, ChevronDown, ChevronUp, Bell, Check, ShoppingCart, User, Plus, X, Info, ArrowUp, ArrowDown, Send, MessageSquare, Loader2, Camera } from 'lucide-react';
import { sendLineMessage, uploadProductImage } from '../services/firebaseService';
import { compressImage } from '../utils/imageUtils';

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
  const [showGachaOverview, setShowGachaOverview] = useState(false);
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

  // id->doc 查表只建一次，避免每筆訂單都對 products/customers 整個陣列線性掃描一次
  const productById = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const customerById = useMemo(() => new Map(customers.map(c => [c.id, c])), [customers]);

  // 客人婉拒保留的商品 — 已封存但保留紀錄，方便有多餘庫存時回頭詢問
  const [showDeclinedPanel, setShowDeclinedPanel] = useState(false);
  const declinedGroups = useMemo(() => {
    const declined = orders.filter(o => o.carryOverDecision === 'declined');
    const byProduct = new Map<string, { product: Product; entries: { customer: Customer; order: Order }[] }>();
    declined.forEach(o => {
      const product  = productById.get(o.productId);
      const customer = customerById.get(o.customerId);
      if (!product || !customer) return;
      const key = `${o.productId}_${o.variant || ''}`;
      if (!byProduct.has(key)) byProduct.set(key, { product, entries: [] });
      byProduct.get(key)!.entries.push({ customer, order: o });
    });
    return Array.from(byProduct.values());
  }, [orders, productById, customerById]);

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
          const product = productById.get(o.productId);
          return product?.category !== '扭蛋'; // gacha notified via photos, skip
        });
        if (notifiable.length === 0) return null;
        return { customer, orders: notifiable };
      })
      .filter((g): g is { customer: Customer; orders: Order[] } => g !== null);
  }, [customers, activeOrders, productById]);

  const DEFAULT_BOUGHT_NOTIFY_TEMPLATE = `【{{sessionName}}】{{name}} 嗨！\n\n以下商品已幫你買到囉 🛍️\n\n{{items}}\n\n其他商品繼續幫你找，買到再通知你♡`;

  const generateNotifyMsg = (group: { customer: Customer; orders: Order[] }) => {
    const sessionName = settings.sessionName || '本次連線';
    const name = group.customer.lineName;
    const lines = group.orders.map(o => {
      const p = products.find(pr => pr.id === o.productId);
      const variantPart = o.variant ? ` (${o.variant})` : '';
      return `✓ ${p?.name ?? '商品'}${variantPart} × ${o.quantityBought}`;
    }).join('\n');
    const template = settings.boughtNotificationTemplate || DEFAULT_BOUGHT_NOTIFY_TEMPLATE;
    return template
      .replace(/\{\{sessionName\}\}/g, sessionName)
      .replace(/\{\{name\}\}/g, name)
      .replace(/\{\{items\}\}/g, lines);
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

  // 待扭總覽：以「客人」為單位分組，每位客人底下列出他還沒扭完的每一款設計（各自的
  // 數量、是否已扭），不用逐個价位訂單打開找，也不會把不同客人、不同款式混在一起算成
  // 同一個數字。沒附款式照片的訂單，退回顯示「未附款式照片」+ 該訂單剩餘需求量。
  type PendingGachaRow =
    | { kind: 'item'; order: Order; url: string; qty: number; boughtQty: number; productName: string }
    | { kind: 'unphotographed'; order: Order; remaining: number; productName: string };
  const pendingGachaGroups = useMemo(() => {
    const map = activeOrders.reduce((acc, o) => {
      const product = productById.get(o.productId);
      if (product?.category !== '扭蛋' || o.quantityBought >= o.quantity) return acc;
      const pendingItems = (o.requestedItems || []).filter(i => (i.boughtQty || 0) < i.qty);
      const entry = acc.get(o.customerId) || { customer: customerById.get(o.customerId), rows: [] as PendingGachaRow[] };
      if (pendingItems.length > 0) {
        pendingItems.forEach(i => entry.rows.push({ kind: 'item', order: o, url: i.url, qty: i.qty, boughtQty: i.boughtQty || 0, productName: product.name }));
      } else {
        entry.rows.push({ kind: 'unphotographed', order: o, remaining: o.quantity - o.quantityBought, productName: product.name });
      }
      acc.set(o.customerId, entry);
      return acc;
    }, new Map<string, { customer: Customer | undefined; rows: PendingGachaRow[] }>());
    return Array.from(map.values());
  }, [activeOrders, productById, customerById]);
  const pendingGachaTotalRows = pendingGachaGroups.reduce((n, g) => n + g.rows.length, 0);

  // Fallback bump for orders with no per-design photo yet (just count, no breakdown).
  const handleBumpGachaBought = (order: Order) => {
    onUpdateOrder({ ...order, quantityBought: Math.min(order.quantity, order.quantityBought + 1), notificationStatus: 'NOTIFIED' });
  };

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

  // ── 扭蛋照片（客人要的款式 / 扭到的結果） ───────────────────────────────────
  // Both attach directly to the order instead of being modelled as separate per-design
  // products, and both sync instantly across whoever's logged in — replacing the old
  // LINE-album hand-off where only one person could see/clear a photo, so the other
  // staff member never knew whether something had already been rolled.
  // - requestedItems: snapped as soon as the request comes in, one entry per design with
  //   its own quantity (so "design A x3, design B x2" stays visible instead of collapsing
  //   into one order-level number), and a running boughtQty staff bump per design.
  // - resultImages: snapped after rolling, proof of what was actually received.
  // Order.quantity must never fall behind what the itemised photos add up to — otherwise
  // "已買到/總需求" and the per-design counts can disagree about whether the order is done.
  // It can stay above the itemised sum, though: some of the quantity may not have a photo
  // attached yet, so we only ever grow it here, never shrink it.
  const sumRequestedQty = (items: { qty: number }[], currentQty: number) =>
    Math.max(currentQty, items.reduce((sum, i) => sum + i.qty, 0));
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const handleUploadRequestedItems = async (order: Order, files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingFor(`${order.id}:requested`);
    try {
      const urls = await Promise.all(Array.from(files).map(async f => uploadProductImage(await compressImage(f))));
      const newItems = urls.map(url => ({ url, qty: 1, boughtQty: 0 }));
      const items = [...(order.requestedItems || []), ...newItems];
      // 訂單總數量要跟著款式照片的數量加總走，不然「總買到/總需求」跟個別款式會兜不起來
      onUpdateOrder({ ...order, requestedItems: items, quantity: sumRequestedQty(items, order.quantity) });
    } catch {
      alert('照片上傳失敗，請重試');
    } finally {
      setUploadingFor(null);
    }
  };
  const handleSetRequestedQty = (order: Order, url: string, qty: number) => {
    const items = (order.requestedItems || []).map(i => i.url === url ? { ...i, qty: Math.max(1, qty) } : i);
    onUpdateOrder({ ...order, requestedItems: items, quantity: sumRequestedQty(items, order.quantity) });
  };
  const handleRemoveRequestedItem = (order: Order, url: string) => {
    onUpdateOrder({ ...order, requestedItems: (order.requestedItems || []).filter(i => i.url !== url) });
  };
  // Tapping a design bumps its boughtQty by 1 — not the whole qty at once, since the
  // machine might run dry partway through and leave that same design half-finished.
  // Each +1/-1 also moves the order's quantityBought in step, so 總買到/billing stats
  // stay correct without double entry.
  const handleBumpRequestedItem = (order: Order, url: string, delta: 1 | -1) => {
    const items = order.requestedItems || [];
    const item = items.find(i => i.url === url);
    if (!item) return;
    const newBoughtQty = Math.max(0, Math.min(item.qty, (item.boughtQty || 0) + delta));
    if (newBoughtQty === (item.boughtQty || 0)) return;
    onUpdateOrder({
      ...order,
      requestedItems: items.map(i => i.url === url ? { ...i, boughtQty: newBoughtQty } : i),
      quantityBought: Math.max(0, Math.min(order.quantity, order.quantityBought + delta)),
      notificationStatus: 'NOTIFIED',
    });
  };

  const handleUploadResultImages = async (order: Order, files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingFor(`${order.id}:result`);
    try {
      const urls = await Promise.all(Array.from(files).map(async f => uploadProductImage(await compressImage(f))));
      onUpdateOrder({ ...order, resultImages: [...(order.resultImages || []), ...urls] });
    } catch {
      alert('照片上傳失敗，請重試');
    } finally {
      setUploadingFor(null);
    }
  };
  const handleRemoveResultImage = (order: Order, url: string) => {
    onUpdateOrder({ ...order, resultImages: (order.resultImages || []).filter(u => u !== url) });
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
              onClick={() => setShowGachaOverview(!showGachaOverview)}
              className={`text-xs px-1 sm:px-3 py-1.5 rounded-lg flex items-center justify-center gap-1 transition-all w-full sm:w-auto border ${showGachaOverview ? 'bg-orange-100 text-stone-600 border-orange-300 shadow-inner' : 'bg-orange-50 text-stone-600 border-orange-200 hover:bg-orange-100'}`}
            >
              <Camera size={12} className="hidden sm:block" /> {showGachaOverview ? '返回' : '待扭總覽'}
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

      {declinedGroups.length > 0 && (
        <div className="bg-stone-50 border border-stone-200 rounded-xl my-3 p-4">
          <button onClick={() => setShowDeclinedPanel(!showDeclinedPanel)} className="w-full flex items-center justify-between text-left">
            <span className="text-sm font-semibold text-stone-600 flex items-center gap-1.5">
              <X size={14} className="text-stone-400" />
              客人婉拒保留的商品 ({declinedGroups.reduce((sum, g) => sum + g.entries.length, 0)})
            </span>
            {showDeclinedPanel ? <ChevronUp size={16} className="text-stone-400" /> : <ChevronDown size={16} className="text-stone-400" />}
          </button>
          <p className="text-[11px] text-stone-400 mt-1">這些客人之前表示不需要保留到下次連線。如果手上有多餘庫存，可以回頭詢問看看。</p>
          {showDeclinedPanel && (
            <div className="mt-3 space-y-2.5">
              {declinedGroups.map(({ product, entries }) => (
                <div key={product.id + (entries[0]?.order.variant || '')} className="bg-white border border-stone-100 rounded-lg p-3">
                  <div className="text-sm font-medium text-[#2C2926]">{product.name}{entries[0]?.order.variant ? `（${entries[0].order.variant}）` : ''}</div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {entries.map(({ customer, order }) => (
                      <span key={order.id} className="text-xs bg-stone-100 text-stone-600 px-2 py-1 rounded-md">
                        {customer.nickname || customer.lineName} × {order.quantity}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="bg-white shadow-md rounded-b-xl overflow-hidden min-h-[500px]">
        {showGachaOverview ? (
          <div className="p-4 space-y-5">
            <h3 className="text-stone-800 text-sm flex items-center gap-2"><Camera size={16} className="text-orange-500" />待扭總覽（{pendingGachaTotalRows} 款未完成）</h3>
            {pendingGachaGroups.length === 0 ? (
              <div className="text-center text-stone-400 text-sm py-12">目前沒有還沒扭完的訂單</div>
            ) : pendingGachaGroups.map(group => (
              <div key={group.customer?.id || 'unknown'}>
                <div className="flex items-center gap-2 mb-2">
                  <User size={14} className="text-stone-400" />
                  <span className="text-sm text-stone-800">{group.customer?.nickname || group.customer?.lineName || '未知客人'}</span>
                </div>
                <div className="flex flex-wrap gap-3">
                  {group.rows.map((row, i) => row.kind === 'item' ? (
                    <div key={`${row.order.id}-${row.url}`} className="relative w-24 h-24 rounded-xl overflow-hidden border border-stone-200 group">
                      <img
                        src={row.url}
                        onClick={() => handleBumpRequestedItem(row.order, row.url, 1)}
                        className="w-full h-full object-cover cursor-pointer"
                        alt="要扭的款式" referrerPolicy="no-referrer" loading="lazy"
                        title="點一下＝買到 +1"
                      />
                      <div className="absolute top-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded-md pointer-events-none">{row.productName}</div>
                      <button
                        onClick={() => handleBumpRequestedItem(row.order, row.url, -1)}
                        className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center bg-black/50 text-white text-sm rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                      >−</button>
                      <div className="absolute bottom-1 right-1 bg-black/70 text-white text-xs font-medium px-1.5 py-0.5 rounded-md pointer-events-none">{row.boughtQty}/{row.qty}</div>
                    </div>
                  ) : (
                    <div key={`${row.order.id}-unphotographed-${i}`} className="relative w-24 h-24 rounded-xl border border-dashed border-stone-300 bg-stone-50 flex flex-col items-center justify-center gap-1 p-1 text-center">
                      <span className="text-[10px] text-stone-400">{row.productName}</span>
                      <span className="text-[10px] text-stone-400">未附款式照片</span>
                      <button
                        onClick={() => handleBumpGachaBought(row.order)}
                        className="text-[10px] px-2 py-0.5 rounded-md bg-[#E5EFEA] text-[#3F6B52] border border-[#7A9E8A]/30"
                      >+1（剩{row.remaining}）</button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-10 text-center text-stone-400">
            沒有符合的採購項目 (或所有訂單已封存)
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
                          
                          const isGachaOrder = item.product.category === '扭蛋';
                          return (
                            <div
                                key={order.id}
                                className={`text-sm py-2 px-3 rounded-lg border transition-all duration-500
                                    ${isJustFilled ? 'bg-yellow-100 border-yellow-300 ring-2 ring-yellow-200 scale-[1.02]' :
                                      isFullyAllocated ? 'bg-green-50 border-green-100' : 'bg-white border-stone-200 shadow-sm'
                                    }`}
                            >
                              <div className="flex justify-between items-center">
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

                              {/* 扭蛋照片：直接掛在這筆訂單上，兩人即時同步，取代 LINE 相簿 */}
                              {isGachaOrder && (
                                <div className="space-y-2 mt-2 pt-2 border-t border-stone-100">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {(order.requestedItems || []).map(item => {
                                      const boughtQty = item.boughtQty || 0;
                                      const done = boughtQty >= item.qty;
                                      return (
                                        <div key={item.url} className={`relative w-14 h-14 rounded-md overflow-hidden border group ${done ? 'border-green-300' : 'border-stone-200'}`}>
                                          <img
                                            src={item.url}
                                            onClick={() => handleBumpRequestedItem(order, item.url, 1)}
                                            className={`w-full h-full object-cover cursor-pointer ${done ? 'opacity-50' : ''}`}
                                            alt="要扭的款式" referrerPolicy="no-referrer" loading="lazy"
                                            title="點一下＝買到 +1"
                                          />
                                          {done && <Check size={20} className="absolute inset-0 m-auto text-white drop-shadow pointer-events-none" />}
                                          <button
                                            onClick={() => handleBumpRequestedItem(order, item.url, -1)}
                                            className="absolute top-0 left-0 w-5 h-5 flex items-center justify-center bg-black/50 text-white text-sm opacity-0 group-hover:opacity-100 transition-opacity"
                                            title="-1"
                                          >−</button>
                                          <button
                                            onClick={() => handleRemoveRequestedItem(order, item.url)}
                                            className="absolute top-0 right-0 w-5 h-5 flex items-center justify-center bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                          ><X size={11} /></button>
                                          <div className="absolute bottom-0 inset-x-0 bg-black/70 flex items-center justify-center gap-0.5">
                                            <span className="text-[10px] text-white">{boughtQty}/</span>
                                            <input
                                              type="number" min={1} value={item.qty}
                                              onChange={e => handleSetRequestedQty(order, item.url, Number(e.target.value))}
                                              onClick={e => e.stopPropagation()}
                                              className="w-5 text-[10px] text-center bg-transparent text-white outline-none"
                                            />
                                          </div>
                                        </div>
                                      );
                                    })}
                                    <label className="w-14 h-14 rounded-md border border-dashed border-stone-300 flex items-center justify-center cursor-pointer text-stone-400 hover:border-[#7A9E8A] hover:text-[#7A9E8A] transition-colors">
                                      {uploadingFor === `${order.id}:requested`
                                        ? <Loader2 size={14} className="animate-spin" />
                                        : <Camera size={14} />}
                                      <input
                                        type="file" accept="image/*" multiple className="hidden"
                                        onChange={e => { handleUploadRequestedItems(order, e.target.files); e.target.value = ''; }}
                                      />
                                    </label>
                                    <span className="text-xs text-stone-400">客人要的款式（點照片＝買到+1，下方數字右邊可改要扭幾個）</span>
                                  </div>
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {(order.resultImages || []).map(url => (
                                      <div key={url} className="relative w-10 h-10 rounded-md overflow-hidden border border-stone-200 group">
                                        <img src={url} className="w-full h-full object-cover" alt="扭蛋結果" referrerPolicy="no-referrer" loading="lazy" />
                                        <button
                                          onClick={() => handleRemoveResultImage(order, url)}
                                          className="absolute inset-0 bg-black/50 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                                        ><X size={14} /></button>
                                      </div>
                                    ))}
                                    <label className="w-10 h-10 rounded-md border border-dashed border-stone-300 flex items-center justify-center cursor-pointer text-stone-400 hover:border-[#7A9E8A] hover:text-[#7A9E8A] transition-colors">
                                      {uploadingFor === `${order.id}:result`
                                        ? <Loader2 size={14} className="animate-spin" />
                                        : <Camera size={14} />}
                                      <input
                                        type="file" accept="image/*" multiple className="hidden"
                                        onChange={e => { handleUploadResultImages(order, e.target.files); e.target.value = ''; }}
                                      />
                                    </label>
                                    <span className="text-xs text-stone-400">扭蛋結果照片</span>
                                  </div>
                                </div>
                              )}
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
