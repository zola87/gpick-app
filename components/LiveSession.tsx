
import React, { useState, useEffect, useRef } from 'react';
import { Product, Customer, Order, GlobalSettings } from '../types';
import { Plus, ShoppingBag, UserPlus, Send, ImageIcon, X, Wand2, Search, Link, Edit2, Trash2, Minus, ChevronDown, Check } from 'lucide-react';
import { smartParseOrder } from '../services/geminiService';

interface LiveSessionProps {
  products: Product[];
  customers: Customer[];
  settings: GlobalSettings;
  onAddProduct: (p: Product) => void;
  onUpdateProduct: (p: Product) => void;
  onDeleteProduct: (id: string) => void;
  onAddOrder: (o: Order, createNewCustomer?: Customer) => void;
}

// UUID Polyfill
const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15);
};

export const LiveSession: React.FC<LiveSessionProps> = ({ products, customers, settings, onAddProduct, onUpdateProduct, onDeleteProduct, onAddOrder }) => {
  // Product Form State
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [newProdName, setNewProdName] = useState('');
  const [newProdBrand, setNewProdBrand] = useState('');
  const [newProdJPY, setNewProdJPY] = useState('');
  const [newProdTWD, setNewProdTWD] = useState('');
  const [newProdCategory, setNewProdCategory] = useState(settings.productCategories[0] || '一般');
  const [newProdVariants, setNewProdVariants] = useState(''); 
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [isUrlMode, setIsUrlMode] = useState(false);
  
  // Order Form State
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [selectedVariant, setSelectedVariant] = useState<string>('');
  
  // Product Search Dropdown State
  const [isProdDropdownOpen, setIsProdDropdownOpen] = useState(false);
  const [prodSearchTerm, setProdSearchTerm] = useState('');
  
  // Batch Ordering State
  const [batchOrders, setBatchOrders] = useState<{name: string, qty: number}[]>([{name: '', qty: 1}]);
  const [focusedRowIndex, setFocusedRowIndex] = useState<number | null>(null);
  
  const topRef = useRef<HTMLDivElement>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Smart Magic State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // Edit Product Modal State
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Auto-calculate TWD price when JPY changes
  useEffect(() => {
    if (newProdJPY) {
      const jpy = parseFloat(newProdJPY);
      const rule = settings.pricingRules.find(r => jpy >= r.minPrice && jpy <= r.maxPrice);
      if (rule) {
        setNewProdTWD(Math.ceil(jpy * rule.multiplier).toString());
      }
    }
  }, [newProdJPY, settings]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>, isEdit = false) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if(isEdit && editingProduct) {
             setEditingProduct({...editingProduct, imageUrl: reader.result as string});
        } else {
             setImagePreview(reader.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCreateProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProdName || !newProdTWD) return;
    
    const newProduct: Product = {
      id: generateId(),
      name: newProdName,
      brand: newProdBrand,
      priceJPY: Number(newProdJPY) || 0,
      priceTWD: Number(newProdTWD),
      category: newProdCategory,
      // Split by comma, dot, space, Chinese comma
      variants: newProdVariants ? newProdVariants.split(/[.,\s，、]+/).map(v => v.trim()).filter(v => v) : [],
      imageUrl: isUrlMode ? imageUrlInput : (imagePreview || `https://picsum.photos/200?random=${Math.random()}`),
      createdAt: Date.now()
    };

    onAddProduct(newProduct);
    
    // Reset Form
    setNewProdName('');
    setNewProdBrand('');
    setNewProdJPY('');
    setNewProdTWD('');
    setNewProdVariants('');
    setImagePreview(null);
    setImageUrlInput('');
    setIsAddProductOpen(false); 
    
    // Auto select
    handleSelectProduct(newProduct.id);
  };

  const handleSaveEdit = () => {
      if(editingProduct) {
          onUpdateProduct(editingProduct);
          setEditingProduct(null);
      }
  };

  const handleSelectProduct = (id: string) => {
      setSelectedProduct(id);
      setSelectedVariant('');
      const prod = products.find(p => p.id === id);
      if(prod) setProdSearchTerm(prod.name);
      setIsProdDropdownOpen(false);
  };

  const scrollToTop = () => {
      // Small timeout to allow render
      setTimeout(() => {
        topRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
  };

  const handleSmartAnalyze = async (file: File) => {
    setIsAnalyzing(true);
    
    const reader = new FileReader();
    reader.onload = async () => {
        const base64 = reader.result as string;
        
        // Call Service
        const results = await smartParseOrder({ 
            imageBase64: base64
        }, products, customers);
        
        setIsAnalyzing(false);

        if (results && results.length > 0) {
            // 1. Identify Product from the first result if possible
            if (!selectedProduct) {
                 const firstRes = results[0];
                 const foundProduct = products.find(p => p.name.includes(firstRes.productName) || firstRes.productName.includes(p.name));
                 if (foundProduct) {
                    handleSelectProduct(foundProduct.id);
                    setProdSearchTerm(foundProduct.name);
                 }
            }

            // 2. Fill batch rows
            const newBatchRows = results.map(r => ({
                name: r.customerName || '',
                qty: r.quantity || 1
            }));
            
            // Overwrite existing if empty, else append
            if (batchOrders.length === 1 && batchOrders[0].name === '') {
                setBatchOrders(newBatchRows);
            } else {
                setBatchOrders([...batchOrders, ...newBatchRows]);
            }
            
            // Set variant if unambiguous
            if (results.some(r => r.variant) && !selectedVariant) {
                 const v = results[0].variant;
                 if(v) setSelectedVariant(v);
            }
        } else {
            alert("AI 無法辨識圖片中的喊單資訊，請確認圖片清晰度或改用手動輸入。");
        }
    };
    reader.readAsDataURL(file);
  };

  const handleQuickOrder = () => {
    if (!selectedProduct) return;

    // Filter out empty names
    const validOrders = batchOrders.filter(o => o.name.trim() !== '');
    if(validOrders.length === 0) return;

    validOrders.forEach(order => {
        // Split input by space/comma/dot in case they still use single row for multiple
        const subNames = order.name.split(/[.,\s，\n]+/).filter(n => n.trim().length > 0);
        
        subNames.forEach(subName => {
             let customer = customers.find(c => c.lineName === subName || c.nickname === subName);
             let newCustomer: Customer | undefined;

             if (!customer) {
                newCustomer = {
                    id: generateId(),
                    lineName: subName, // Auto create customer
                    nickname: subName
                };
                customer = newCustomer;
             }

             const newOrder: Order = {
                id: generateId(),
                productId: selectedProduct,
                variant: selectedVariant,
                customerId: customer!.id,
                quantity: order.qty,
                quantityBought: 0,
                status: 'PENDING',
                notificationStatus: 'UNNOTIFIED',
                isArchived: false,
                timestamp: Date.now()
             };

             onAddOrder(newOrder, newCustomer);
        });
    });

    // Reset and Scroll
    setBatchOrders([{name: '', qty: 1}]);
    setProdSearchTerm('');
    setSelectedProduct('');
    setSelectedVariant('');
    scrollToTop();
  };

  // Batch Row Handlers
  const addBatchRow = () => {
      setBatchOrders([...batchOrders, {name: '', qty: 1}]);
  };

  const removeBatchRow = (index: number) => {
      if(batchOrders.length > 1) {
          const newOrders = [...batchOrders];
          newOrders.splice(index, 1);
          setBatchOrders(newOrders);
      }
  };

  const updateBatchRow = (index: number, field: 'name' | 'qty', value: string | number) => {
      const newOrders = [...batchOrders];
      // @ts-ignore
      newOrders[index][field] = value;
      setBatchOrders(newOrders);
  };

  const filteredProducts = products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase())).reverse();
  const currentProduct = products.find(p => p.id === selectedProduct);
  
  // Product Search Filter (Search + Dropdown)
  const filteredProductOptions = products.filter(p => p.name.toLowerCase().includes(prodSearchTerm.toLowerCase())).reverse();

  const isVariantRequired = currentProduct && currentProduct.variants.length > 0;
  const hasValidRows = batchOrders.some(o => o.name.trim() !== '');
  const isOrderValid = selectedProduct && hasValidRows && (!isVariantRequired || (isVariantRequired && selectedVariant));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full relative">
        <div ref={topRef} className="absolute -top-32"></div>
      {/* Left Column: Quick Order */}
      <div className="lg:col-span-1 space-y-4 flex flex-col">
        
        {/* Quick Order Panel */}
        <div className="bg-white p-6 rounded-xl shadow-md border border-stone-200 order-1">
          <h2 className="text-lg font-bold mb-4 flex items-center justify-between text-blue-600">
            <span className="flex items-center"><UserPlus className="w-5 h-5 mr-2" /> 快速喊單</span>
            {/* Smart Parse Trigger */}
            <div className="relative overflow-hidden inline-block w-8 h-8">
               <input type="file" accept="image/*" className="absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer z-20" 
                 onChange={(e) => {
                   const file = e.target.files?.[0];
                   if(file) handleSmartAnalyze(file);
                 }}
               />
               <button className="bg-gradient-to-r from-pink-500 to-rose-500 p-1.5 rounded-full hover:scale-110 transition-transform text-white shadow-md">
                  {isAnalyzing ? <div className="animate-spin w-5 h-5 border-2 border-white rounded-full border-t-transparent"></div> : <Wand2 size={16} />}
               </button>
            </div>
          </h2>

          <div className="space-y-4">
            {/* Searchable Product Dropdown */}
            <div className="relative">
              <label className="block text-xs text-stone-400 mb-1">選擇商品 (打字搜尋)</label>
              <div className="relative">
                  <input 
                    type="text"
                    value={prodSearchTerm}
                    onChange={(e) => {setProdSearchTerm(e.target.value); setIsProdDropdownOpen(true);}}
                    onFocus={() => setIsProdDropdownOpen(true)}
                    placeholder="輸入關鍵字..."
                    className="w-full bg-stone-50 border border-stone-200 rounded-lg py-3 px-3 text-stone-800 focus:ring-2 focus:ring-blue-500 text-base"
                  />
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" size={16}/>
              </div>
              
              {isProdDropdownOpen && (
                  <div className="absolute top-full left-0 w-full bg-white border border-stone-200 shadow-xl rounded-lg z-50 mt-1 max-h-60 overflow-y-auto">
                     {filteredProductOptions.length === 0 ? (
                         <div className="p-3 text-stone-400 text-sm text-center">無符合商品</div>
                     ) : (
                         filteredProductOptions.map(p => (
                             <button
                                key={p.id}
                                className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-stone-50 last:border-0 flex justify-between items-center"
                                onClick={() => handleSelectProduct(p.id)}
                             >
                                 <span className="font-medium text-stone-700 truncate">{p.name}</span>
                                 <span className="text-blue-600 font-bold text-xs">${p.priceTWD}</span>
                             </button>
                         ))
                     )}
                     <button 
                        className="w-full text-center p-2 text-xs text-blue-500 bg-stone-50 font-bold sticky bottom-0"
                        onClick={() => setIsProdDropdownOpen(false)}
                     >
                        關閉選單
                     </button>
                  </div>
              )}
            </div>

            {currentProduct && currentProduct.variants.length > 0 && (
              <div>
                <label className="block text-xs text-stone-400 mb-2">款式/規格 <span className="text-pink-500">*</span></label>
                <div className="flex flex-wrap gap-2">
                  {currentProduct.variants.map(v => (
                    <button
                      key={v}
                      onClick={() => setSelectedVariant(v)}
                      className={`px-4 py-3 rounded-lg text-sm font-bold border-2 transition-all min-w-[3rem] ${selectedVariant === v ? 'bg-blue-500 border-blue-500 text-white shadow-md' : 'border-stone-200 text-stone-600 hover:bg-stone-50'}`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            <div>
              <div className="flex justify-between items-center mb-1">
                 <label className="block text-xs text-stone-400">客人名稱 & 數量</label>
                 <button onClick={addBatchRow} className="text-xs text-blue-500 hover:text-blue-700 flex items-center font-bold">
                    <Plus size={12} className="mr-0.5"/> 增加
                 </button>
              </div>
              
              <div className="space-y-2 max-h-48 overflow-y-visible pr-1">
                 {batchOrders.map((order, idx) => {
                     // Autocomplete Suggestions
                     const suggestions = order.name.trim() !== '' && focusedRowIndex === idx
                        ? customers.filter(c => 
                            c.lineName.toLowerCase().includes(order.name.toLowerCase()) || 
                            c.nickname?.toLowerCase().includes(order.name.toLowerCase())
                          ).filter(c => c.lineName !== order.name).slice(0, 4)
                        : [];

                     return (
                     <div key={idx} className="flex gap-2 items-center relative z-10">
                        <div className="relative flex-1">
                            <input 
                                type="text" 
                                value={order.name}
                                onFocus={() => setFocusedRowIndex(idx)}
                                onBlur={() => setTimeout(() => setFocusedRowIndex(null), 200)} 
                                onChange={(e) => updateBatchRow(idx, 'name', e.target.value)}
                                className="w-full bg-stone-50 border border-stone-200 rounded-lg py-2 px-3 text-stone-800 placeholder-stone-400 focus:ring-2 focus:ring-blue-500 text-sm"
                                placeholder="客人名稱..."
                            />
                            {/* Dropdown */}
                            {suggestions.length > 0 && (
                                <div className="absolute top-full left-0 w-full bg-white border border-stone-200 shadow-lg rounded-lg z-50 mt-1 overflow-hidden">
                                    {suggestions.map(s => (
                                        <button 
                                            key={s.id}
                                            className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm border-b border-stone-50 last:border-0"
                                            onClick={() => updateBatchRow(idx, 'name', s.lineName)}
                                        >
                                            <span className="font-medium text-stone-700">{s.lineName}</span>
                                            {s.nickname && <span className="text-xs text-stone-400 ml-2">({s.nickname})</span>}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <input 
                            type="number" 
                            value={order.qty}
                            onChange={(e) => updateBatchRow(idx, 'qty', Number(e.target.value))}
                            className="w-16 bg-stone-50 border border-stone-200 rounded-lg py-2 px-3 text-center text-stone-800 focus:ring-2 focus:ring-blue-500 text-sm"
                            min="1"
                        />
                        {batchOrders.length > 1 && (
                            <button onClick={() => removeBatchRow(idx)} className="text-stone-300 hover:text-red-400">
                                <Minus size={16} />
                            </button>
                        )}
                     </div>
                 )})}
              </div>
            </div>

            <button 
              onClick={handleQuickOrder}
              disabled={!isOrderValid}
              className={`w-full font-bold py-3 rounded-lg shadow-md transform active:scale-95 transition-all flex items-center justify-center gap-2 mt-4 
                ${isOrderValid ? 'bg-pink-500 hover:bg-pink-600 text-white' : 'bg-stone-200 text-stone-400 cursor-not-allowed opacity-70'}
              `}
            >
              <Send size={18} />
              {isOrderValid ? '確認喊單' : (isVariantRequired && !selectedVariant ? '請選擇款式' : '填寫未完成')}
            </button>
          </div>
        </div>
        
        {/* Add Product Trigger Button */}
        <button 
           onClick={() => setIsAddProductOpen(true)}
           className="bg-white border-2 border-dashed border-stone-300 rounded-xl p-4 flex items-center justify-center gap-2 text-stone-500 hover:border-blue-500 hover:text-blue-600 transition-colors font-medium order-2"
        >
            <Plus size={20}/> 上架新商品
        </button>

      </div>

      {/* Right Column: Product Feed Preview */}
      <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden flex flex-col h-[700px]">
        <div className="p-4 border-b border-stone-100 bg-stone-50 flex justify-between items-center gap-4">
          <h3 className="font-semibold text-stone-700 whitespace-nowrap">商品列表</h3>
          <div className="relative flex-1">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 w-4 h-4" />
             <input 
               type="text" 
               className="w-full pl-9 pr-4 py-1.5 rounded-full border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" 
               placeholder="搜尋商品..."
               value={searchTerm}
               onChange={e => setSearchTerm(e.target.value)}
             />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {filteredProducts.length === 0 && (
            <div className="text-center text-stone-400 mt-20">
              <p>無符合商品</p>
            </div>
          )}
          {filteredProducts.map(product => (
            <div key={product.id} className="flex gap-4 p-3 border border-stone-100 rounded-lg hover:bg-stone-50 transition-colors group relative">
              {/* Image Section - Scaled for mobile */}
              <div className="w-20 h-20 md:w-24 md:h-24 bg-stone-100 rounded-md overflow-hidden flex-shrink-0 border border-stone-100 self-start">
                <img src={product.imageUrl} alt={product.name} className="w-full h-full object-contain bg-white" />
              </div>

              {/* Details Section */}
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                 <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1 sm:gap-2">
                     <h4 className="font-bold text-stone-800 leading-tight">{product.name}</h4>
                     <span className="text-[10px] bg-stone-200 text-stone-600 px-2 py-0.5 rounded-full self-start sm:self-auto whitespace-nowrap">{product.category}</span>
                 </div>
                 
                 <div className="text-xs text-stone-500 flex flex-wrap gap-2 items-center">
                      {product.brand && <span className="bg-stone-100 px-1.5 py-0.5 rounded text-stone-600">{product.brand}</span>}
                      <span className="text-stone-400">¥{product.priceJPY}</span>
                      {product.variants.length > 0 && <span className="text-stone-400">({product.variants.length} 款)</span>}
                 </div>

                 <div className="mt-auto pt-2 flex justify-between items-end">
                     <div className="text-lg font-bold text-blue-600 leading-none">
                         NT$ {product.priceTWD}
                     </div>
                     
                     <div className="flex items-center gap-2">
                        {/* Action Buttons */}
                        <div className="flex gap-1">
                             <button onClick={() => setEditingProduct(product)} className="p-1.5 rounded bg-white border border-stone-200 text-stone-400 hover:text-blue-600 hover:border-blue-300">
                                 <Edit2 size={16}/>
                             </button>
                             <button onClick={() => onDeleteProduct(product.id)} className="p-1.5 rounded bg-white border border-stone-200 text-stone-400 hover:text-red-600 hover:border-red-300">
                                 <Trash2 size={16}/>
                             </button>
                        </div>
                        <button onClick={() => { handleSelectProduct(product.id); scrollToTop(); }} className="text-xs bg-blue-50 text-blue-600 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-600 hover:text-white transition-colors font-bold ml-1">
                          喊單
                        </button>
                     </div>
                 </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add Product Modal */}
      {isAddProductOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-4 border-b bg-stone-50 flex justify-between items-center">
                    <h2 className="text-lg font-bold text-stone-800 flex items-center">
                        <ShoppingBag className="w-5 h-5 mr-2 text-blue-500" />
                        上架新品
                    </h2>
                    <button onClick={() => setIsAddProductOpen(false)}><X size={20} className="text-stone-400 hover:text-stone-600"/></button>
                </div>

                <div className="p-6 overflow-y-auto">
                    <form id="addProductForm" onSubmit={handleCreateProduct} className="space-y-4">
                        {/* Image */}
                        <div className="flex justify-end text-xs text-blue-500 mb-1 cursor-pointer" onClick={() => setIsUrlMode(!isUrlMode)}>
                            {isUrlMode ? '切換為上傳圖片' : '切換為圖片網址'}
                        </div>
                        {isUrlMode ? (
                            <div className="flex items-center border rounded-lg px-2 bg-white">
                            <Link size={16} className="text-stone-400 mr-2" />
                            <input 
                                type="text" 
                                value={imageUrlInput}
                                onChange={(e) => setImageUrlInput(e.target.value)}
                                className="w-full py-2 bg-transparent outline-none text-sm"
                                placeholder="貼上圖片網址..."
                            />
                            </div>
                        ) : (
                            <div className="relative w-full h-32 border-2 border-dashed border-stone-300 rounded-lg bg-stone-50 flex flex-col items-center justify-center cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-colors overflow-hidden group">
                            <input 
                                type="file" 
                                accept="image/*"
                                onChange={(e) => handleImageChange(e)}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            />
                            {imagePreview ? (
                                <>
                                <img src={imagePreview} alt="Preview" className="w-full h-full object-contain p-1" />
                                <button 
                                    onClick={(e) => {e.preventDefault(); setImagePreview(null);}}
                                    className="absolute top-1 right-1 bg-black/50 text-white p-1 rounded-full z-20"
                                    type="button"
                                >
                                    <X size={14} />
                                </button>
                                </>
                            ) : (
                                <div className="text-center text-stone-400 group-hover:text-blue-400">
                                <ImageIcon className="w-8 h-8 mx-auto mb-1" />
                                <span className="text-xs">點擊/手機選擇圖片</span>
                                </div>
                            )}
                            </div>
                        )}

                        {/* Name */}
                        <div>
                            <input 
                                type="text" 
                                value={newProdName}
                                onChange={(e) => setNewProdName(e.target.value)}
                                className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="商品名稱 (如: 止痛藥)"
                                autoFocus
                            />
                        </div>

                        {/* Variants */}
                        <div>
                            <input 
                            type="text"
                            value={newProdVariants}
                            onChange={e => setNewProdVariants(e.target.value)}
                            className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="款式 (用空格、逗號或點號分隔)"
                            />
                        </div>

                        {/* Pricing */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                            <input 
                                type="number" 
                                value={newProdJPY}
                                onChange={(e) => setNewProdJPY(e.target.value)}
                                className="w-full px-3 py-2 border border-stone-300 rounded-lg outline-none"
                                placeholder="日幣價格 ¥"
                            />
                            </div>
                            <div>
                            <input 
                                type="number" 
                                value={newProdTWD}
                                onChange={(e) => setNewProdTWD(e.target.value)}
                                className="w-full px-3 py-2 border border-stone-300 rounded-lg font-bold text-blue-600 outline-none bg-stone-50"
                                placeholder="台幣售價 $"
                            />
                            </div>
                        </div>

                        {/* Brand & Category */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <input 
                                type="text" 
                                value={newProdBrand}
                                onChange={(e) => setNewProdBrand(e.target.value)}
                                className="w-full px-3 py-2 border border-stone-300 rounded-lg outline-none text-sm"
                                placeholder="品牌 (如: Nike)"
                                />
                            </div>
                            <div>
                                <select 
                                value={newProdCategory}
                                onChange={(e) => setNewProdCategory(e.target.value)}
                                className="w-full px-3 py-2 border border-stone-300 rounded-lg outline-none text-sm bg-white"
                                >
                                {settings.productCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                </select>
                            </div>
                        </div>
                    </form>
                </div>

                <div className="p-4 border-t bg-stone-50">
                    <button 
                        form="addProductForm"
                        type="submit"
                        className="w-full bg-pink-500 hover:bg-pink-600 text-white font-medium py-2 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-md"
                    >
                        <Plus size={18} />
                        確認上架
                    </button>
                </div>
            </div>
          </div>
      )}

      {/* Edit Product Modal */}
      {editingProduct && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
                  <div className="p-4 border-b bg-stone-50 flex justify-between items-center">
                      <h3 className="font-bold text-stone-800">編輯商品</h3>
                      <button onClick={() => setEditingProduct(null)}><X size={20} className="text-stone-400" /></button>
                  </div>
                  <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
                        <div>
                             <label className="text-xs text-stone-500">商品名稱</label>
                             <input className="w-full border rounded px-3 py-2" value={editingProduct.name} onChange={e => setEditingProduct({...editingProduct, name: e.target.value})} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                             <div>
                                <label className="text-xs text-stone-500">品牌</label>
                                <input className="w-full border rounded px-3 py-2" value={editingProduct.brand || ''} onChange={e => setEditingProduct({...editingProduct, brand: e.target.value})} />
                             </div>
                             <div>
                                <label className="text-xs text-stone-500">分類</label>
                                <select 
                                    value={editingProduct.category}
                                    onChange={(e) => setEditingProduct({...editingProduct, category: e.target.value})}
                                    className="w-full border rounded px-3 py-2 bg-white"
                                >
                                    {settings.productCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                </select>
                             </div>
                        </div>
                         <div className="grid grid-cols-2 gap-3">
                             <div>
                                <label className="text-xs text-stone-500">日幣</label>
                                <input type="number" className="w-full border rounded px-3 py-2" value={editingProduct.priceJPY} onChange={e => setEditingProduct({...editingProduct, priceJPY: Number(e.target.value)})} />
                             </div>
                             <div>
                                <label className="text-xs text-stone-500">台幣</label>
                                <input type="number" className="w-full border rounded px-3 py-2 font-bold text-blue-600" value={editingProduct.priceTWD} onChange={e => setEditingProduct({...editingProduct, priceTWD: Number(e.target.value)})} />
                             </div>
                        </div>
                        <div>
                             <label className="text-xs text-stone-500">款式 (空格/逗號/點號分隔)</label>
                             <input className="w-full border rounded px-3 py-2" value={editingProduct.variants.join(' ')} onChange={e => setEditingProduct({...editingProduct, variants: e.target.value.split(/[.,\s，]+/)})} />
                        </div>
                  </div>
                  <div className="p-4 border-t flex gap-3">
                      <button onClick={() => setEditingProduct(null)} className="flex-1 py-2 bg-stone-100 rounded text-stone-600">取消</button>
                      <button onClick={handleSaveEdit} className="flex-1 py-2 bg-blue-500 text-white rounded font-bold">儲存</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
