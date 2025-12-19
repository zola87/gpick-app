
import React, { useState, useEffect, useRef } from 'react';
import { Product, Customer, Order, GlobalSettings } from '../types';
import { Plus, ShoppingBag, UserPlus, Send, ImageIcon, X, Wand2, Search, Link, Edit2, Trash2, Minus, ChevronDown, MessageSquareText, Upload } from 'lucide-react';
import { smartParseOrder } from '../services/geminiService';
import { compressImage } from '../utils/imageUtils';

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
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

export const LiveSession: React.FC<LiveSessionProps> = ({ products, customers, settings, onAddProduct, onUpdateProduct, onDeleteProduct, onAddOrder }) => {
  const topRef = useRef<HTMLDivElement>(null);

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
  const [productSearchTerm, setProductSearchTerm] = useState(''); // New: For searchable dropdown
  const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<string>('');
  
  // Advanced Batch Ordering State
  const [batchOrders, setBatchOrders] = useState<{name: string, qty: number}[]>([{name: '', qty: 1}]);
  
  // Autocomplete State
  const [focusedRowIndex, setFocusedRowIndex] = useState<number | null>(null);
  
  // Product List Filter
  const [listSearchTerm, setListSearchTerm] = useState('');
  
  // Smart Magic State
  const [isMagicModalOpen, setIsMagicModalOpen] = useState(false);
  const [magicTab, setMagicTab] = useState<'text' | 'image'>('text');
  const [magicText, setMagicText] = useState('');
  const [magicImage, setMagicImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Edit Product Modal State
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editIsUrlMode, setEditIsUrlMode] = useState(false);

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

  // Sync product search input with selected product
  useEffect(() => {
    if (selectedProduct) {
        const p = products.find(prod => prod.id === selectedProduct);
        if (p) setProductSearchTerm(p.name);
    } else {
        setProductSearchTerm('');
    }
  }, [selectedProduct, products]);

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>, isEdit = false, isMagic = false) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        // Compress image before setting state
        const compressed = await compressImage(file);
        
        if (isMagic) {
            setMagicImage(compressed);
        } else if(isEdit && editingProduct) {
             setEditingProduct({...editingProduct, imageUrl: compressed});
        } else {
             setImagePreview(compressed);
        }
      } catch (error) {
        console.error("Image compression error", error);
        alert("圖片處理失敗，請重試");
      }
    }
  };

  const parseVariants = (input: string) => {
      // Split by comma, dot, or space
      return input.split(/[.,\s]+/).map(v => v.trim()).filter(v => v);
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
      variants: parseVariants(newProdVariants),
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
    setSelectedProduct(newProduct.id);
    setProductSearchTerm(newProduct.name);
  };

  const handleSaveEdit = () => {
      if(editingProduct) {
          // Re-parse variants just in case edited
          const variantsArray = typeof editingProduct.variants === 'string' 
             ? parseVariants(editingProduct.variants) 
             : editingProduct.variants;
             
          onUpdateProduct({...editingProduct, variants: variantsArray});
          setEditingProduct(null);
      }
  };

  const handleSmartAnalyze = async () => {
    if (magicTab === 'text' && !magicText) return;
    if (magicTab === 'image' && !magicImage) return;
    
    setIsAnalyzing(true);
    // Changed: Strictly using process.env.API_KEY in the service, removed geminiApiKey parameter
    const result = await smartParseOrder({ 
      imageBase64: magicTab === 'image' ? magicImage! : undefined,
      text: magicTab === 'text' ? magicText : undefined
    }, products, customers);
    
    setIsAnalyzing(false);
    
    if (result) {
      // 1. Fill Customer
      if (result.customerName) {
         updateBatchRow(0, 'name', result.customerName);
      }
      
      // 2. Fill Product
      const foundProduct = products.find(p => p.name.includes(result.productName) || result.productName.includes(p.name));
      if (foundProduct) {
        setSelectedProduct(foundProduct.id);
        setProductSearchTerm(foundProduct.name);
        
        // 3. Fill Variant
        if (result.variant) {
           // Try exact or partial match
           const matchVar = foundProduct.variants.find(v => v.toLowerCase().includes(result.variant!.toLowerCase()) || result.variant!.toLowerCase().includes(v.toLowerCase()));
           if(matchVar) setSelectedVariant(matchVar);
        }
      } else {
        // If product not found but we have a name, put it in search term
        setProductSearchTerm(result.productName);
        alert(`提示: 未在清單中找到「${result.productName}」，請手動確認或新增商品。`);
      }
      
      // 4. Fill Quantity
      if (result.quantity) {
          updateBatchRow(0, 'qty', result.quantity);
      }

      setIsMagicModalOpen(false);
      setMagicImage(null);
      setMagicText('');
    }
  };

  const handleQuickOrder = () => {
    if (!selectedProduct) return;

    const validOrders = batchOrders.filter(o => o.name.trim() !== '');
    if(validOrders.length === 0) return;

    validOrders.forEach(order => {
        // FIXED: Split input by comma or newline only (Removed Space splitting to fix "Amy Chen")
        const subNames = order.name.split(/[,\n]+/).filter(n => n.trim().length > 0);
        
        subNames.forEach(subName => {
             const cleanName = subName.trim();
             let customer = customers.find(c => c.lineName === cleanName || c.nickname === cleanName);
             let newCustomer: Customer | undefined;

             if (!customer) {
                newCustomer = {
                    id: generateId(),
                    lineName: cleanName,
                    nickname: cleanName
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

    // Reset for next order
    setBatchOrders([{name: '', qty: 1}]);
    // Note: We deliberately KEEP the product/variant selected for rapid fire orders of same item
  };

  const handleSelectProductFromList = (prodId: string) => {
      setSelectedProduct(prodId);
      const p = products.find(x => x.id === prodId);
      if(p) setProductSearchTerm(p.name);
      
      // Auto scroll to top
      topRef.current?.scrollIntoView({ behavior: 'smooth' });
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

  // Filter for the main list
  const filteredProducts = products.filter(p => p.name.toLowerCase().includes(listSearchTerm.toLowerCase())).reverse();
  
  // Filter for the dropdown
  const dropdownProducts = products.filter(p => p.name.toLowerCase().includes(productSearchTerm.toLowerCase())).reverse();

  const currentProduct = products.find(p => p.id === selectedProduct);
  
  const isVariantRequired = currentProduct && currentProduct.variants.length > 0;
  const hasValidRows = batchOrders.some(o => o.name.trim() !== '');
  const isOrderValid = selectedProduct && hasValidRows && (!isVariantRequired || (isVariantRequired && selectedVariant));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full relative" ref={topRef}>
      {/* Left Column: Quick Order */}
      <div className="lg:col-span-1 space-y-4 flex flex-col">
        
        {/* Quick Order Panel */}
        <div className="bg-white p-6 rounded-xl shadow-md border border-stone-200 order-1">
          <div className="flex items-center justify-between mb-4">
             <h2 className="text-lg font-bold text-blue-600 flex items-center">
                <UserPlus className="w-5 h-5 mr-2" /> 快速喊單
             </h2>
             {/* Magic Wand Smart Parse Trigger */}
             <button 
                onClick={() => setIsMagicModalOpen(true)}
                className="bg-gradient-to-r from-pink-500 to-rose-500 text-white px-3 py-1.5 rounded-full shadow-md flex items-center gap-1.5 text-xs hover:scale-105 transition-transform"
             >
                <Wand2 size={14} />
                <span>AI 智慧分析</span>
             </button>
          </div>

          <div className="space-y-4">
            
            {/* Searchable Dropdown for Product */}
            <div className="relative">
              <label className="block text-xs text-stone-400 mb-1">選擇商品</label>
              <div className="relative">
                  <input
                    type="text"
                    value={productSearchTerm}
                    onChange={(e) => {
                        setProductSearchTerm(e.target.value);
                        setSelectedProduct(''); // Clear selection on type
                        setSelectedVariant('');
                        setIsProductDropdownOpen(true);
                    }}
                    onFocus={() => setIsProductDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setIsProductDropdownOpen(false), 200)}
                    placeholder="輸入關鍵字搜尋商品..."
                    className="w-full bg-stone-50 border border-stone-200 rounded-lg py-3 pl-3 pr-10 text-stone-800 focus:ring-2 focus:ring-blue-500 text-base"
                  />
                  {selectedProduct ? (
                      <button onClick={() => {setSelectedProduct(''); setProductSearchTerm(''); setIsProductDropdownOpen(true);}} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-red-400">
                          <X size={16}/>
                      </button>
                  ) : (
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 w-4 h-4 pointer-events-none" />
                  )}
              </div>
              
              {isProductDropdownOpen && (
                  <div className="absolute top-full left-0 w-full bg-white border border-stone-200 shadow-xl rounded-lg z-50 mt-1 max-h-60 overflow-y-auto">
                      {dropdownProducts.length === 0 ? (
                          <div className="p-3 text-sm text-stone-400 text-center">無符合商品</div>
                      ) : (
                          dropdownProducts.map(p => (
                              <button
                                key={p.id}
                                className="w-full text-left px-4 py-3 hover:bg-blue-50 border-b border-stone-50 last:border-0 flex justify-between items-center group"
                                onClick={() => {
                                    setSelectedProduct(p.id);
                                    setProductSearchTerm(p.name);
                                    setSelectedVariant('');
                                    setIsProductDropdownOpen(false);
                                }}
                              >
                                  <span className="font-medium text-stone-700 group-hover:text-blue-600">{p.name}</span>
                                  <span className="text-xs text-stone-400 font-mono">${p.priceTWD}</span>
                              </button>
                          ))
                      )}
                  </div>
              )}
            </div>

            {currentProduct && currentProduct.variants.length > 0 && (
              <div className="animate-in slide-in-from-top-2 duration-300">
                <label className="block text-xs text-stone-400 mb-2">款式/規格 <span className="text-pink-500">*</span></label>
                <div className="flex flex-wrap gap-2">
                  {currentProduct.variants.map(v => (
                    <button
                      key={v}
                      onClick={() => setSelectedVariant(v)}
                      className={`px-4 py-2 rounded-lg text-sm font-bold border-2 transition-all ${selectedVariant === v ? 'bg-blue-500 border-blue-500 text-white shadow-md' : 'border-stone-200 text-stone-600 hover:bg-stone-50'}`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            <div className="border-t border-stone-100 pt-4">
              <div className="flex justify-between items-center mb-2">
                 <label className="block text-xs text-stone-400">客人名稱 & 數量</label>
                 <button onClick={addBatchRow} className="text-xs text-blue-500 hover:text-blue-700 flex items-center font-bold">
                    <Plus size={12} className="mr-0.5"/> 增加欄位
                 </button>
              </div>
              
              <div className="space-y-2 max-h-48 overflow-y-visible pr-1">
                 {batchOrders.map((order, idx) => {
                     // Autocomplete Suggestions logic
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
                                onBlur={() => setTimeout(() => setFocusedRowIndex(null), 200)} // Delay so click handles first
                                onChange={(e) => updateBatchRow(idx, 'name', e.target.value)}
                                className="w-full bg-stone-50 border border-stone-200 rounded-lg py-2 px-3 text-stone-800 placeholder-stone-400 focus:ring-2 focus:ring-blue-500 text-sm"
                                placeholder="客人名稱 (如: Amy Chen)"
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
               value={listSearchTerm}
               onChange={e => setListSearchTerm(e.target.value)}
             />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 sm:p-4 space-y-3">
          {filteredProducts.length === 0 && (
            <div className="text-center text-stone-400 mt-20">
              <p>無符合商品</p>
            </div>
          )}
          {filteredProducts.map(product => (
            <div key={product.id} className="flex items-start gap-3 p-2 sm:p-3 border border-stone-100 rounded-lg hover:bg-stone-50 transition-colors group relative">
              <div className="w-16 h-16 sm:w-24 sm:h-24 bg-stone-100 rounded-md overflow-hidden flex-shrink-0 border border-stone-100">
                <img src={product.imageUrl} alt={product.name} className="w-full h-full object-contain bg-white" />
              </div>
              <div className="flex-1 min-w-0 flex flex-col justify-between h-full">
                {/* Responsive Content Wrapper: Stacked on mobile, Row on desktop */}
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
                    {/* Title Section */}
                    <div className="min-w-0 flex-1">
                        <h4 className="font-bold text-stone-800 text-sm sm:text-base leading-tight break-words">{product.name}</h4>
                        {product.brand && <p className="text-[10px] sm:text-xs text-stone-500 mt-0.5">{product.brand}</p>}
                    </div>
                    {/* Price Section - Always visible, no overlap */}
                    <div className="text-base sm:text-lg font-bold text-blue-600 whitespace-nowrap leading-none flex-shrink-0 self-start sm:self-auto">
                      NT$ {product.priceTWD}
                    </div>
                </div>

                {/* Bottom Row: Metadata and Actions */}
                <div className="flex justify-between items-end mt-2">
                   <div>
                        <span className="text-[10px] sm:text-xs bg-stone-200 text-stone-600 px-1.5 py-0.5 rounded-full">{product.category}</span>
                        <div className="text-[10px] sm:text-sm text-stone-500 mt-1">
                         ¥{product.priceJPY} 
                        {product.variants.length > 0 && <span className="ml-2 text-stone-400 hidden sm:inline">款式: {product.variants.join(', ')}</span>}
                        </div>
                   </div>
                   
                   <div className="flex flex-col items-end gap-2">
                       {/* Actions: Static on mobile to avoid overlap, Absolute on desktop hover */}
                       <div className="flex gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity bg-white/80 p-1 rounded shadow-sm border border-stone-100 static sm:absolute top-2 right-2">
                            <button onClick={() => setEditingProduct(product)} className="text-stone-400 hover:text-blue-600 p-1"><Edit2 size={16}/></button>
                            <button onClick={() => onDeleteProduct(product.id)} className="text-stone-400 hover:text-red-500 p-1"><Trash2 size={16}/></button>
                       </div>
                       
                        <button 
                            onClick={() => handleSelectProductFromList(product.id)}
                            className="text-xs bg-blue-50 text-blue-600 border border-blue-100 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg hover:bg-blue-100 font-bold flex items-center gap-1 mt-auto whitespace-nowrap"
                        >
                            <ShoppingBag size={14}/> <span className="hidden sm:inline">喊單這件</span><span className="sm:hidden">喊單</span>
                        </button>
                   </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Smart Analysis Modal */}
      {isMagicModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
           <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-4 bg-gradient-to-r from-pink-500 to-rose-500 text-white flex justify-between items-center">
                  <h3 className="font-bold flex items-center gap-2"><Wand2 size={20}/> AI 智慧分析</h3>
                  <button onClick={() => setIsMagicModalOpen(false)}><X className="text-white/80 hover:text-white" /></button>
              </div>
              
              <div className="p-6">
                 {/* Tabs */}
                 <div className="flex border-b border-stone-200 mb-4">
                     <button 
                       className={`flex-1 pb-2 text-sm font-bold flex justify-center items-center gap-2 ${magicTab === 'text' ? 'text-pink-600 border-b-2 border-pink-600' : 'text-stone-400'}`}
                       onClick={() => setMagicTab('text')}
                     >
                        <MessageSquareText size={16} /> 文字分析
                     </button>
                     <button 
                       className={`flex-1 pb-2 text-sm font-bold flex justify-center items-center gap-2 ${magicTab === 'image' ? 'text-pink-600 border-b-2 border-pink-600' : 'text-stone-400'}`}
                       onClick={() => setMagicTab('image')}
                     >
                        <ImageIcon size={16} /> 圖片/截圖辨識
                     </button>
                 </div>

                 <div className="min-h-[200px]">
                    {magicTab === 'text' ? (
                       <textarea 
                          className="w-full h-48 border border-stone-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-pink-500 outline-none resize-none"
                          placeholder="請貼上對話內容，例如：
Amy: 我要兩盒止痛藥
Jason: +1 藍色"
                          value={magicText}
                          onChange={(e) => setMagicText(e.target.value)}
                       />
                    ) : (
                        <div className="h-48 border-2 border-dashed border-stone-300 rounded-lg flex flex-col items-center justify-center bg-stone-50 relative group cursor-pointer">
                             {magicImage ? (
                                 <img src={magicImage} alt="Preview" className="w-full h-full object-contain p-2" />
                             ) : (
                                 <div className="text-center text-stone-400">
                                     <Upload className="mx-auto mb-2 opacity-50" size={32} />
                                     <p className="text-xs">點擊或拖曳上傳截圖</p>
                                 </div>
                             )}
                             <input 
                                type="file" 
                                accept="image/*" 
                                className="absolute inset-0 opacity-0 cursor-pointer"
                                onChange={(e) => handleImageChange(e, false, true)}
                             />
                        </div>
                    )}
                 </div>

                 <button 
                    onClick={handleSmartAnalyze}
                    disabled={isAnalyzing}
                    className="w-full mt-4 bg-gradient-to-r from-pink-500 to-rose-600 text-white font-bold py-3 rounded-xl shadow-lg hover:shadow-xl hover:scale-[1.01] transition-all flex items-center justify-center gap-2"
                 >
                     {isAnalyzing ? (
                         <>
                           <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin"></div>
                           分析中...
                         </>
                     ) : (
                         <>
                           <Wand2 size={18} />
                           開始分析填入
                         </>
                     )}
                 </button>
                 <p className="text-[10px] text-center text-stone-400 mt-2">AI 將自動辨識客人、商品、款式與數量，並填入表單供您確認。</p>
              </div>
           </div>
        </div>
      )}

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
                            placeholder="款式 (可用點號「.」或逗號「,」分隔，如: 紅色.藍色.S.M)"
                            />
                            <p className="text-[10px] text-stone-400 mt-1">小撇步：手機輸入可用「.」或空格分隔，不用切換鍵盤</p>
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
                                className="w-full px-3 py-2 border border-stone-300 rounded-lg font-bold text-blue-600 outline-none"
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
                                placeholder="品牌 (可不填)"
                            />
                            </div>
                            <div>
                            <select 
                                value={newProdCategory}
                                onChange={(e) => setNewProdCategory(e.target.value)}
                                className="w-full px-3 py-2 border border-stone-300 rounded-lg outline-none text-sm bg-white"
                            >
                                {settings.productCategories.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                                ))}
                            </select>
                            </div>
                        </div>
                    </form>
                </div>

                <div className="p-4 border-t bg-stone-50 flex gap-3">
                    <button 
                        onClick={() => setIsAddProductOpen(false)}
                        className="flex-1 px-4 py-2 border border-stone-300 rounded-lg text-stone-600 font-bold hover:bg-stone-100 transition-colors"
                    >
                        取消
                    </button>
                    <button 
                        form="addProductForm"
                        type="submit"
                        className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors shadow-md"
                    >
                        確認上架
                    </button>
                </div>
            </div>
          </div>
      )}

      {/* Edit Product Modal */}
      {editingProduct && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-4 border-b bg-stone-50 flex justify-between items-center">
                    <h2 className="text-lg font-bold text-stone-800 flex items-center">
                        <Edit2 className="w-5 h-5 mr-2 text-blue-500" />
                        編輯商品
                    </h2>
                    <button onClick={() => setEditingProduct(null)}><X size={20} className="text-stone-400 hover:text-stone-600"/></button>
                </div>

                <div className="p-6 overflow-y-auto">
                    <div className="space-y-4">
                        {/* Image */}
                        <div className="flex justify-end text-xs text-blue-500 mb-1 cursor-pointer" onClick={() => setEditIsUrlMode(!editIsUrlMode)}>
                            {editIsUrlMode ? '切換為上傳圖片' : '切換為圖片網址'}
                        </div>
                        {editIsUrlMode ? (
                            <div className="flex items-center border rounded-lg px-2 bg-white">
                            <Link size={16} className="text-stone-400 mr-2" />
                            <input 
                                type="text" 
                                value={editingProduct.imageUrl || ''}
                                onChange={(e) => setEditingProduct({...editingProduct, imageUrl: e.target.value})}
                                className="w-full py-2 bg-transparent outline-none text-sm"
                                placeholder="貼上圖片網址..."
                            />
                            </div>
                        ) : (
                            <div className="relative w-full h-32 border-2 border-dashed border-stone-300 rounded-lg bg-stone-50 flex flex-col items-center justify-center cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-colors overflow-hidden group">
                            <input 
                                type="file" 
                                accept="image/*"
                                onChange={(e) => handleImageChange(e, true)}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            />
                            {editingProduct.imageUrl ? (
                                <img src={editingProduct.imageUrl} alt="Preview" className="w-full h-full object-contain p-1" />
                            ) : (
                                <div className="text-center text-stone-400 group-hover:text-blue-400">
                                <ImageIcon className="w-8 h-8 mx-auto mb-1" />
                                <span className="text-xs">點擊更改圖片</span>
                                </div>
                            )}
                            </div>
                        )}

                        {/* Name */}
                        <div>
                            <label className="block text-xs text-stone-400 mb-1">商品名稱</label>
                            <input 
                                type="text" 
                                value={editingProduct.name}
                                onChange={(e) => setEditingProduct({...editingProduct, name: e.target.value})}
                                className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>

                        {/* Variants */}
                        <div>
                            <label className="block text-xs text-stone-400 mb-1">款式 (用點號或逗號分隔)</label>
                            <input 
                            type="text"
                            value={Array.isArray(editingProduct.variants) ? editingProduct.variants.join('.') : editingProduct.variants}
                            onChange={e => setEditingProduct({...editingProduct, variants: e.target.value})}
                            className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>

                        {/* Pricing */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                            <label className="block text-xs text-stone-400 mb-1">日幣 ¥</label>
                            <input 
                                type="number" 
                                value={editingProduct.priceJPY}
                                onChange={(e) => setEditingProduct({...editingProduct, priceJPY: Number(e.target.value)})}
                                className="w-full px-3 py-2 border border-stone-300 rounded-lg outline-none"
                            />
                            </div>
                            <div>
                            <label className="block text-xs text-stone-400 mb-1">台幣 $</label>
                            <input 
                                type="number" 
                                value={editingProduct.priceTWD}
                                onChange={(e) => setEditingProduct({...editingProduct, priceTWD: Number(e.target.value)})}
                                className="w-full px-3 py-2 border border-stone-300 rounded-lg font-bold text-blue-600 outline-none"
                            />
                            </div>
                        </div>

                        {/* Brand & Category */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                            <label className="block text-xs text-stone-400 mb-1">品牌</label>
                            <input 
                                type="text" 
                                value={editingProduct.brand || ''}
                                onChange={(e) => setEditingProduct({...editingProduct, brand: e.target.value})}
                                className="w-full px-3 py-2 border border-stone-300 rounded-lg outline-none text-sm"
                            />
                            </div>
                            <div>
                            <label className="block text-xs text-stone-400 mb-1">類別</label>
                            <select 
                                value={editingProduct.category}
                                onChange={(e) => setEditingProduct({...editingProduct, category: e.target.value})}
                                className="w-full px-3 py-2 border border-stone-300 rounded-lg outline-none text-sm bg-white"
                            >
                                {settings.productCategories.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                                ))}
                            </select>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t bg-stone-50 flex gap-3">
                    <button 
                        onClick={() => setEditingProduct(null)}
                        className="flex-1 px-4 py-2 border border-stone-300 rounded-lg text-stone-600 font-bold hover:bg-stone-100 transition-colors"
                    >
                        取消
                    </button>
                    <button 
                        onClick={handleSaveEdit}
                        className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors shadow-md"
                    >
                        儲存變更
                    </button>
                </div>
            </div>
          </div>
      )}
    </div>
  );
};
