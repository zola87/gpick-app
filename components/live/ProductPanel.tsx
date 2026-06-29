import React from 'react';
import { Plus, X, Edit2, Trash2, Minus, Camera, Link, Check, Search, Crop, ArrowUp, ArrowDown } from 'lucide-react';
import { SourcingLocation } from '../../types';
import { ProductPanelProps } from './liveTypes';
import { DEFAULT_GACHA_IMAGE, MAX_PRODUCT_IMAGES } from './liveUtils';

// ── Unified photo manager: file picker (multi-select) or URL mode, reorder & cover ──
const PhotoManager: React.FC<{
  images: string[];
  onChange: (next: string[]) => void;
  isUrlMode: boolean;
  setIsUrlMode: (v: boolean) => void;
  imageUrlInput: string;
  setImageUrlInput: (v: string) => void;
  onFilesSelected: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onCropRequest: (url: string, index: number) => void;
}> = ({ images, onChange, isUrlMode, setIsUrlMode, imageUrlInput, setImageUrlInput, onFilesSelected, onCropRequest }) => {
  const fileRef = React.useRef<HTMLInputElement>(null);
  const move = (idx: number, dir: -1 | 1) => {
    const next = [...images];
    const j = idx + dir;
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
  };
  const remove = (idx: number) => onChange(images.filter((_, i) => i !== idx));
  const addUrl = () => {
    if (imageUrlInput.trim() && images.length < MAX_PRODUCT_IMAGES) {
      onChange([...images, imageUrlInput.trim()]);
      setImageUrlInput('');
    }
  };
  return (
    <div>
      <div className="flex justify-between items-center mb-2 ml-1">
        <label className="text-xs text-stone-500">商品照片 (最多 {MAX_PRODUCT_IMAGES} 張，第一張為封面)</label>
        <button type="button" onClick={() => setIsUrlMode(!isUrlMode)} className="text-xs text-[#7A9E8A] flex items-center gap-1">
          {isUrlMode ? <Camera size={12} /> : <Link size={12} />}
          {isUrlMode ? '切換相機/相簿' : '切換網址輸入'}
        </button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={onFilesSelected} />
      {images.length === 0 ? (
        isUrlMode ? (
          <div className="flex gap-2">
            <input type="text" className="flex-1 p-3 bg-stone-50 border border-stone-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#7A9E8A]" placeholder="請輸入圖片網址 (URL)" value={imageUrlInput} onChange={e => setImageUrlInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addUrl()} />
            <button type="button" onClick={addUrl} className="px-4 bg-[#7A9E8A] text-white rounded-xl text-sm">新增</button>
          </div>
        ) : (
          <div onClick={() => fileRef.current?.click()} className="relative w-full h-48 border-2 border-dashed border-stone-300 rounded-2xl bg-stone-50 flex flex-col items-center justify-center cursor-pointer hover:border-[#7A9E8A]/40 transition-all">
            <div className="text-center text-stone-400">
              <Camera size={40} className="mx-auto mb-2 opacity-50" />
              <p>點擊/手機選擇圖片 (可多選)</p>
            </div>
          </div>
        )
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-4 gap-2">
            {images.map((url, idx) => (
              <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border border-stone-200 bg-stone-50 group">
                <img src={url} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" loading="lazy" />
                {idx === 0 && <span className="absolute top-1 left-1 bg-[#7A9E8A] text-white text-[9px] px-1.5 py-0.5 rounded-md font-medium">封面</span>}
                <button type="button" onClick={() => onCropRequest(url, idx)} className="absolute top-1 right-1 p-1 bg-white/90 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"><Crop size={11} /></button>
                <div className="absolute bottom-1 inset-x-1 flex items-center justify-between gap-0.5">
                  <button type="button" disabled={idx === 0} onClick={() => move(idx, -1)} className="p-1 bg-white/90 rounded-md disabled:opacity-30 disabled:cursor-not-allowed"><ArrowUp size={11} /></button>
                  <button type="button" disabled={idx === images.length - 1} onClick={() => move(idx, 1)} className="p-1 bg-white/90 rounded-md disabled:opacity-30 disabled:cursor-not-allowed"><ArrowDown size={11} /></button>
                  <button type="button" onClick={() => remove(idx)} className="p-1 bg-white/90 text-red-500 rounded-md"><X size={11} /></button>
                </div>
              </div>
            ))}
            {!isUrlMode && images.length < MAX_PRODUCT_IMAGES && (
              <button type="button" onClick={() => fileRef.current?.click()} className="aspect-square border-2 border-dashed border-stone-300 rounded-xl flex items-center justify-center text-stone-400 hover:border-[#7A9E8A]/40 hover:text-[#7A9E8A] transition-colors">
                <Plus size={20} />
              </button>
            )}
          </div>
          {isUrlMode && images.length < MAX_PRODUCT_IMAGES && (
            <div className="flex gap-2">
              <input type="text" className="flex-1 p-2 bg-stone-50 border border-stone-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#7A9E8A]" placeholder="請輸入圖片網址 (URL)" value={imageUrlInput} onChange={e => setImageUrlInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addUrl()} />
              <button type="button" onClick={addUrl} className="px-3 bg-[#7A9E8A] text-white rounded-lg text-xs">新增</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const ProductPanel: React.FC<ProductPanelProps> = ({
  products, filteredProducts, settings, customers,
  onAddProduct, onUpdateProduct, onDeleteProduct, onUpdateSettings,
  orderMode, setSelectedProduct, setProductSearchTerm, setSelectedVariant,
  customerBatchOrders, setCustomerBatchOrders,
  listSearchTerm, setListSearchTerm, isListSearchDropdownOpen, setIsListSearchDropdownOpen,
  deleteConfirm, setDeleteConfirm,
  editingProduct, setEditingProduct, isEditingVariantSettingsOpen, setIsEditingVariantSettingsOpen,
  isAddProductOpen, setIsAddProductOpen,
  newProdName, setNewProdName, newProdBrand, setNewProdBrand,
  newProdLocations, setNewProdLocations,
  newProdJPY, setNewProdJPY, newProdTWD, setNewProdTWD,
  newProdCategory, setNewProdCategory,
  newProdVariants, setNewProdVariants,
  newProdVariantPrices, setNewProdVariantPrices,
  newProdVariantCosts, setNewProdVariantCosts,
  isVariantSettingsOpen, setIsVariantSettingsOpen,
  isAddingNewCategory, setIsAddingNewCategory,
  quickCategoryName, setQuickCategoryName,
  newProdImages, setNewProdImages, isUrlMode, setIsUrlMode, imageUrlInput, setImageUrlInput,
  handleImagesChange, handleCreateProduct,
  newProdDescription, setNewProdDescription,
  newProdIsPublished, setNewProdIsPublished,
  newProdIsSoldOut, setNewProdIsSoldOut,
  locationModalData, setLocationModalData,
  setCropImageSrc, setCropTarget,
  onBulkUpdateByBrand,
}) => {
  const [bulkBrand, setBulkBrand] = React.useState('');
  const [bulkAction, setBulkAction] = React.useState<'publish' | 'unpublish' | 'soldout' | 'available'>('publish');
  const allBrands = Array.from(new Set(products.map(p => p.brand).filter(Boolean) as string[])).sort();

  const applyBulkAction = () => {
    if (!bulkBrand) return;
    const patch = {
      publish:   { isPublished: true },
      unpublish: { isPublished: false },
      soldout:   { isSoldOut: true },
      available: { isSoldOut: false },
    }[bulkAction];
    onBulkUpdateByBrand(bulkBrand, patch);
  };

  return (
    <>
      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="text-center">
              <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 size={32} />
              </div>
              <h3 className="text-xl text-stone-800 mb-2">確定要刪除此商品嗎？</h3>
              <p className="text-stone-500 text-sm leading-relaxed">刪除後將無法復原，請確認是否繼續。</p>
            </div>
            <div className="flex border-t border-stone-100">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 px-6 py-4 text-stone-500 font-medium hover:bg-stone-50 transition-colors">取消</button>
              <button onClick={() => { onDeleteProduct(deleteConfirm); setDeleteConfirm(null); }} className="flex-1 px-6 py-4 bg-red-600 text-white hover:bg-red-700 transition-colors">確定刪除</button>
            </div>
          </div>
        </div>
      )}

      {/* Product List */}
      <div className="lg:col-span-8">
        <div className="bg-white rounded-2xl shadow-md border border-stone-200 flex flex-col min-h-[600px] w-full">
          <div className="px-4 py-2 bg-stone-50 flex flex-col gap-2">
            <div className="flex flex-row items-center gap-4 min-h-[36px]">
              <h3 className="text-stone-800 text-sm flex items-center gap-2 whitespace-nowrap">商品列表</h3>
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={16} />
                <input
                  type="text"
                  className="w-full pl-10 pr-4 py-2.5 rounded-full border border-stone-200 text-sm focus:ring-2 focus:ring-[#7A9E8A] outline-none bg-white"
                  placeholder="搜尋商品名稱、品牌或類別..."
                  value={listSearchTerm}
                  onChange={e => { setListSearchTerm(e.target.value); setIsListSearchDropdownOpen(true); }}
                  onFocus={() => setIsListSearchDropdownOpen(true)}
                  onBlur={() => setTimeout(() => setIsListSearchDropdownOpen(false), 200)}
                />
                {isListSearchDropdownOpen && listSearchTerm && (
                  <div className="absolute top-full left-0 w-full bg-white border border-stone-200 shadow-2xl rounded-xl z-50 mt-1 max-h-60 overflow-y-auto">
                    {products.filter(p =>
                      p.name.toLowerCase().includes(listSearchTerm.toLowerCase()) ||
                      p.brand?.toLowerCase().includes(listSearchTerm.toLowerCase()) ||
                      p.category?.toLowerCase().includes(listSearchTerm.toLowerCase())
                    ).map(p => (
                      <button key={p.id} className="w-full text-left px-4 py-3 hover:bg-[#E5EFEA] border-b border-stone-100 last:border-0 flex items-center gap-3 transition-colors" onClick={() => { setListSearchTerm(p.name); setIsListSearchDropdownOpen(false); }}>
                        <img src={(p.imageUrl && !p.imageUrl.includes('picsum.photos')) ? p.imageUrl : (p.category === '扭蛋' ? DEFAULT_GACHA_IMAGE : (p.imageUrl || 'https://picsum.photos/seed/product/100/100'))} className="w-10 h-10 rounded object-cover border border-stone-200" alt={p.name} referrerPolicy="no-referrer" loading="lazy" />
                        <div className="text-stone-700 text-xs truncate">{p.name}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {allBrands.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-stone-400 whitespace-nowrap">批次操作</span>
                <select
                  value={bulkBrand}
                  onChange={e => setBulkBrand(e.target.value)}
                  className="text-xs border border-stone-200 rounded-full px-2.5 py-1.5 outline-none bg-white text-stone-600 flex-1 min-w-[90px] max-w-[140px]"
                >
                  <option value="">選擇品牌...</option>
                  {allBrands.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
                <select
                  value={bulkAction}
                  onChange={e => setBulkAction(e.target.value as typeof bulkAction)}
                  className="text-xs border border-stone-200 rounded-full px-2.5 py-1.5 outline-none bg-white text-stone-600 flex-1 min-w-[90px] max-w-[140px]"
                >
                  <option value="publish">上架</option>
                  <option value="unpublish">下架</option>
                  <option value="soldout">標記已結單</option>
                  <option value="available">取消已結單</option>
                </select>
                <button
                  type="button"
                  disabled={!bulkBrand}
                  onClick={applyBulkAction}
                  className="text-xs px-3 py-1.5 rounded-full bg-[#E5EFEA] text-[#3F6B52] border border-[#7A9E8A]/30 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                >套用</button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 p-3 md:p-6 overflow-y-auto">
            {filteredProducts.map(product => (
              <div key={product.id} className="flex flex-col p-3 md:p-4 border border-stone-100 rounded-2xl hover:border-[#7A9E8A]/40 hover:shadow-lg hover:shadow-[#7A9E8A]/10 transition-all group relative bg-white">
                {(product.isPublished === false || product.isSoldOut) && (
                  <div className="flex gap-1.5 mb-2">
                    {product.isPublished === false && <span className="px-2 py-0.5 bg-stone-100 text-stone-500 rounded-md text-[11px] font-medium">未上架</span>}
                    {product.isSoldOut && <span className="px-2 py-0.5 bg-orange-100 text-orange-600 rounded-md text-[11px] font-medium">已結單</span>}
                  </div>
                )}
                <div className="flex gap-3 mb-3">
                  <div className="w-20 h-20 md:w-24 md:h-24 rounded-xl overflow-hidden bg-stone-50 border border-stone-100 flex-shrink-0">
                    <img src={(product.imageUrl && !product.imageUrl.includes('picsum.photos')) ? product.imageUrl : (product.category === '扭蛋' ? DEFAULT_GACHA_IMAGE : (product.imageUrl || 'https://picsum.photos/seed/product/200/200'))} className="w-full h-full object-contain" alt={product.name} referrerPolicy="no-referrer" loading="lazy" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-stone-800 text-sm leading-tight mb-1">{product.name}</h4>
                    <div className="text-xs text-stone-400 flex flex-col gap-0.5">
                      {product.variantPrices && Object.keys(product.variantPrices).length > 0 ? (
                        <span className="text-[#7A9E8A] text-base">NT${Math.min(...Object.values(product.variantPrices))} 起</span>
                      ) : (
                        <>
                          <span className="text-[#7A9E8A] text-base">NT${product.priceTWD}</span>
                          <span className="text-xs">日幣原價: ¥{product.priceJPY}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {product.variants.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-1">
                    {product.variants.map(v => (
                      <span key={v} className="px-2 py-0.5 bg-stone-50 text-stone-600 rounded-md text-xs border border-stone-100 font-medium flex items-center gap-1">
                        {v}
                        {product.variantPrices && product.variantPrices[v] && (
                          <span className="text-[#7A9E8A] ml-0.5">${product.variantPrices[v]}</span>
                        )}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-auto pt-3 border-t border-stone-50 flex items-center justify-between">
                  <button
                    onClick={() => {
                      if (orderMode === 'byProduct') {
                        setSelectedProduct(product.id);
                        setProductSearchTerm(product.name);
                        setSelectedVariant(product.variants[0] || '');
                      } else {
                        const newBatch = [...customerBatchOrders];
                        const lastIdx = newBatch.length - 1;
                        if (!newBatch[lastIdx].productId) {
                          newBatch[lastIdx] = { productId: product.id, productName: product.name, variant: product.variants[0] || '', qty: 1, searchOpen: false };
                        } else {
                          newBatch.push({ productId: product.id, productName: product.name, variant: product.variants[0] || '', qty: 1, searchOpen: false });
                        }
                        setCustomerBatchOrders(newBatch);
                      }
                      const el = document.getElementById('quick-order-section');
                      if (el) el.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="flex-1 bg-[#E5EFEA] hover:bg-[#7A9E8A] hover:text-white text-[#7A9E8A] py-2 rounded-xl text-xs flex items-center justify-center gap-1 transition-all"
                  >
                    <Plus size={14} /> 喊此商品
                  </button>
                  <div className="flex gap-1 ml-2">
                    <button onClick={() => setEditingProduct(product)} className="p-2 text-stone-400 hover:text-[#7A9E8A] hover:bg-[#E5EFEA] rounded-lg transition-colors"><Edit2 size={16} /></button>
                    <button onClick={() => setDeleteConfirm(product.id)} className="p-2 text-stone-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={16} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Add Product Modal ── */}
      {isAddProductOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 flex justify-between items-center bg-stone-100 h-[60px]">
              <h2 className="text-lg text-stone-800">上架新商品</h2>
              <button onClick={() => setIsAddProductOpen(false)}><X size={20} className="text-stone-500" /></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              <PhotoManager
                images={newProdImages}
                onChange={setNewProdImages}
                isUrlMode={isUrlMode}
                setIsUrlMode={setIsUrlMode}
                imageUrlInput={imageUrlInput}
                setImageUrlInput={setImageUrlInput}
                onFilesSelected={handleImagesChange}
                onCropRequest={(url, idx) => { setCropImageSrc(url); setCropTarget({ type: 'newProduct', index: idx }); }}
              />

              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-stone-500 mb-1 ml-1">商品名稱</label>
                  <input type="text" className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-[#7A9E8A] h-[60px]" placeholder="如: 龍角散" value={newProdName} onChange={e => setNewProdName(e.target.value)} />
                </div>

                <div>
                  <label className="block text-xs text-stone-500 mb-0.5 ml-1">款式規格 (逗號分隔)</label>
                  <input type="text" className="w-full p-2 bg-white border border-stone-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#7A9E8A] h-[60px]" placeholder="如: 原味, 檸檬" value={newProdVariants} onChange={e => setNewProdVariants(e.target.value)} />
                </div>

                {newProdVariants.split(/[.,\s]+/).map(v => v.trim()).filter(v => v).length > 0 && (
                  <button type="button" onClick={() => setIsVariantSettingsOpen(!isVariantSettingsOpen)} className="text-xs text-[#7A9E8A] flex items-center gap-1">
                    {isVariantSettingsOpen ? <Minus size={10} /> : <Plus size={10} />}
                    {isVariantSettingsOpen ? '隱藏個別款式設定' : '設定個別款式售價與成本'}
                  </button>
                )}

                {isVariantSettingsOpen && newProdVariants.split(/[.,\s]+/).map(v => v.trim()).filter(v => v).length > 0 && (
                  <div className="bg-white p-2 rounded-lg border border-stone-200">
                    <label className="block text-xs text-stone-500 mb-1">個別款式售價與成本</label>
                    <div className="space-y-1">
                      {newProdVariants.split(/[.,\s]+/).map(v => v.trim()).filter(v => v).map(variant => (
                        <div key={variant} className="flex items-center gap-1">
                          <span className="text-xs font-medium text-stone-700 w-16 truncate">{variant}</span>
                          <div className="relative flex-1">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-stone-400 text-xs">¥</span>
                            <input type="number" className="w-full p-1.5 pl-5 border border-stone-200 rounded text-xs" placeholder="成本" value={newProdVariantCosts[variant] || ''} onChange={e => {
                              const val = e.target.value;
                              setNewProdVariantCosts(prev => { const next = { ...prev }; if (val === '') { delete next[variant]; } else { next[variant] = Number(val); } return next; });
                            }} />
                          </div>
                          <div className="relative flex-1">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-stone-400 text-xs">$</span>
                            <input type="number" className="w-full p-1.5 pl-5 border border-stone-200 rounded text-xs" placeholder="售價" value={newProdVariantPrices[variant] || ''} onChange={e => {
                              const val = e.target.value;
                              setNewProdVariantPrices(prev => { const next = { ...prev }; if (val === '') { delete next[variant]; } else { next[variant] = Number(val); } return next; });
                            }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!isVariantSettingsOpen && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-stone-500 mb-1 ml-1">日幣定價 ¥</label>
                      <input type="number" className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-[#7A9E8A] h-[60px]" placeholder="698" value={newProdJPY} onChange={e => setNewProdJPY(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs text-stone-500 mb-1 ml-1">台幣售價 $</label>
                      <input type="number" className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl text-[#7A9E8A] outline-none focus:ring-2 focus:ring-[#7A9E8A] h-[60px]" placeholder="250" value={newProdTWD} onChange={e => setNewProdTWD(e.target.value)} />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs text-stone-500 mb-1 ml-1">品牌名稱</label>
                    <input type="text" className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-[#7A9E8A] h-[60px]" placeholder="如: 龍角散" value={newProdBrand} onChange={e => setNewProdBrand(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs text-stone-500 mb-1 ml-1">商品類別</label>
                    <div className="flex gap-2">
                      <select className="flex-1 p-3 border border-stone-200 rounded-xl bg-white text-sm h-[60px]" value={newProdCategory} onChange={e => setNewProdCategory(e.target.value)}>
                        {settings.productCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                      </select>
                      <button type="button" onClick={() => setIsAddingNewCategory(!isAddingNewCategory)} className="p-3 bg-stone-100 rounded-xl hover:bg-stone-200 h-[60px] w-[60px] flex items-center justify-center"><Plus size={20} /></button>
                    </div>
                  </div>
                </div>

                {isAddingNewCategory && (
                  <div className="flex gap-2 mt-2">
                    <input type="text" placeholder="新類別名稱" className="flex-1 px-3 py-2 border border-stone-200 rounded-lg text-sm" value={quickCategoryName} onChange={e => setQuickCategoryName(e.target.value)} />
                    <button type="button" onClick={() => {
                      if (quickCategoryName.trim() && onUpdateSettings) {
                        onUpdateSettings({ ...settings, productCategories: [...settings.productCategories, quickCategoryName.trim()] });
                        setNewProdCategory(quickCategoryName.trim());
                        setQuickCategoryName('');
                        setIsAddingNewCategory(false);
                      }
                    }} className="px-3 py-2 bg-[#7A9E8A] text-white rounded-lg text-xs">新增</button>
                  </div>
                )}


                <div>
                  <label className="block text-xs text-stone-500 mb-1 ml-1">商品說明 / 尺寸表 (選填)</label>
                  <textarea className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-[#7A9E8A] text-sm min-h-[90px]" placeholder={'例如：\nS：胸圍86 腰圍64\nM：胸圍90 腰圍68'} value={newProdDescription} onChange={e => setNewProdDescription(e.target.value)} />
                </div>

                <div className="flex gap-4 bg-stone-50 border border-stone-200 rounded-xl p-3">
                  <label className="flex items-center gap-2 text-sm text-stone-700 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 accent-[#7A9E8A]" checked={newProdIsPublished} onChange={e => setNewProdIsPublished(e.target.checked)} />
                    上架顯示在客人頁面
                  </label>
                  <label className="flex items-center gap-2 text-sm text-stone-700 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 accent-[#7A9E8A]" checked={newProdIsSoldOut} onChange={e => setNewProdIsSoldOut(e.target.checked)} />
                    已結單
                  </label>
                </div>
              </div>
            </div>
            <div className="p-4 bg-stone-100 flex gap-3">
              <button onClick={() => {
                const locs = (newProdLocations && newProdLocations.length > 0) ? newProdLocations : [{ name: '', city: '', isPrimary: true }];
                setLocationModalData({ locations: locs, onSave: setNewProdLocations });
              }} className="w-1/4 py-2.5 bg-white border border-stone-200 text-stone-700 rounded-xl text-sm shadow-sm flex items-center justify-center gap-1">📍 地點</button>
              <button onClick={handleCreateProduct} className="w-3/4 py-2.5 bg-[#7A9E8A] text-white rounded-xl text-sm shadow-lg hover:bg-[#5C8070] transition-colors">確認上架</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Location Modal ── */}
      {locationModalData && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 flex justify-between items-center bg-stone-50/30 border-b border-stone-100">
              <h2 className="text-xl flex items-center gap-2 text-stone-800">📍 設定採購地點</h2>
              <button onClick={() => setLocationModalData(null)}><X size={24} className="text-stone-400" /></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="space-y-3">
                {locationModalData.locations.map((loc, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <div className="flex gap-2 flex-1">
                      <input type="text" className="w-1/3 p-3 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-[#7A9E8A] h-[50px] text-sm" placeholder="城市" value={loc.city || ''} onChange={e => { const nl = [...locationModalData.locations]; nl[idx].city = e.target.value; setLocationModalData({ ...locationModalData, locations: nl }); }} />
                      <input type="text" className="w-2/3 p-3 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-[#7A9E8A] h-[50px] text-sm" placeholder="店面" value={loc.name} onChange={e => { const nl = [...locationModalData.locations]; nl[idx].name = e.target.value; setLocationModalData({ ...locationModalData, locations: nl }); }} />
                    </div>
                    <button onClick={() => { const nl = [...locationModalData.locations]; nl.forEach(l => l.isPrimary = false); nl[idx].isPrimary = true; setLocationModalData({ ...locationModalData, locations: nl }); }} className={`p-2 rounded-xl border h-[50px] w-[50px] flex items-center justify-center transition-colors ${loc.isPrimary ? 'bg-[#E5EFEA] border-[#7A9E8A]/30 text-[#7A9E8A]' : 'bg-white border-stone-200 text-stone-400 hover:bg-stone-50'}`} title="設為主要地點">
                      <Check size={20} className={loc.isPrimary ? 'opacity-100' : 'opacity-0'} />
                    </button>
                    <button onClick={() => { const nl = locationModalData.locations.filter((_, i) => i !== idx); if (loc.isPrimary && nl.length > 0) nl[0].isPrimary = true; setLocationModalData({ ...locationModalData, locations: nl }); }} className="p-2 text-red-500 hover:bg-red-50 rounded-xl h-[50px] w-[50px] flex items-center justify-center">
                      <Trash2 size={20} />
                    </button>
                  </div>
                ))}
                <button onClick={() => setLocationModalData({ ...locationModalData, locations: [...locationModalData.locations, { city: '', name: '', isPrimary: locationModalData.locations.length === 0 }] })} className="w-full py-3 border-2 border-dashed border-stone-200 text-stone-500 rounded-xl text-sm hover:bg-stone-50 hover:border-stone-300 transition-colors flex items-center justify-center gap-2">
                  <Plus size={18} /> 新增地點
                </button>
              </div>
            </div>
            <div className="p-4 bg-stone-100 flex gap-3">
              <button onClick={() => { locationModalData.onSave(locationModalData.locations.filter(l => l.name.trim() !== '')); setLocationModalData(null); }} className="w-full py-3 bg-[#7A9E8A] text-white rounded-xl text-sm shadow-lg hover:bg-[#5C8070] transition-colors">儲存地點</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Product Modal ── */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 flex justify-between items-center bg-stone-50/30">
              <h2 className="text-xl flex items-center gap-2 text-[#7A9E8A]"><Edit2 size={24} /> 編輯商品</h2>
              <button onClick={() => setEditingProduct(null)}><X size={24} className="text-stone-400" /></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              <PhotoManager
                images={[editingProduct.imageUrl, ...(editingProduct.imageUrls || [])].filter(Boolean) as string[]}
                onChange={(next) => setEditingProduct({ ...editingProduct, imageUrl: next[0], imageUrls: next.slice(1) })}
                isUrlMode={isUrlMode}
                setIsUrlMode={setIsUrlMode}
                imageUrlInput={imageUrlInput}
                setImageUrlInput={setImageUrlInput}
                onFilesSelected={e => handleImagesChange(e, true)}
                onCropRequest={(url, idx) => { setCropImageSrc(url); setCropTarget({ type: 'editProduct', index: idx }); }}
              />

              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-stone-500 mb-1 ml-1">商品名稱</label>
                  <input type="text" className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-[#7A9E8A] h-[60px]" placeholder="如: 龍角散" value={editingProduct.name} onChange={e => setEditingProduct({ ...editingProduct, name: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs text-stone-500 mb-0.5 ml-1">款式規格 (逗號分隔)</label>
                  <input type="text" className="w-full p-2 bg-white border border-stone-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#7A9E8A] h-[60px]" placeholder="如: 原味, 檸檬" value={editingProduct.variants.join(', ')} onChange={e => setEditingProduct({ ...editingProduct, variants: e.target.value.split(/[.,\s]+/).map(v => v.trim()).filter(v => v) })} />
                </div>

                {editingProduct.variants.length > 0 && (
                  <button type="button" onClick={() => setIsEditingVariantSettingsOpen(!isEditingVariantSettingsOpen)} className="text-xs text-[#7A9E8A] flex items-center gap-1">
                    {isEditingVariantSettingsOpen ? <Minus size={10} /> : <Plus size={10} />}
                    {isEditingVariantSettingsOpen ? '隱藏個別款式設定' : '設定個別款式售價與成本'}
                  </button>
                )}

                {isEditingVariantSettingsOpen && editingProduct.variants.length > 0 && (
                  <div className="bg-white p-2 rounded-lg border border-stone-200">
                    <label className="block text-xs text-stone-500 mb-1">個別款式售價與成本</label>
                    <div className="space-y-1">
                      {editingProduct.variants.map(variant => (
                        <div key={variant} className="flex items-center gap-1">
                          <span className="text-xs font-medium text-stone-700 w-16 truncate">{variant}</span>
                          <div className="relative flex-1">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-stone-400 text-xs">¥</span>
                            <input type="number" className="w-full p-1.5 pl-5 border border-stone-200 rounded text-xs" placeholder="成本" value={editingProduct.variantCosts?.[variant] || ''} onChange={e => {
                              const val = e.target.value;
                              setEditingProduct(prev => { if (!prev) return prev; const nc = { ...(prev.variantCosts || {}) }; if (val === '') { delete nc[variant]; } else { nc[variant] = Number(val); } return { ...prev, variantCosts: nc }; });
                            }} />
                          </div>
                          <div className="relative flex-1">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-stone-400 text-xs">$</span>
                            <input type="number" className="w-full p-1.5 pl-5 border border-stone-200 rounded text-xs" placeholder="售價" value={editingProduct.variantPrices?.[variant] || ''} onChange={e => {
                              const val = e.target.value;
                              setEditingProduct(prev => { if (!prev) return prev; const np = { ...(prev.variantPrices || {}) }; if (val === '') { delete np[variant]; } else { np[variant] = Number(val); } return { ...prev, variantPrices: np }; });
                            }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!isEditingVariantSettingsOpen && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-stone-500 mb-1 ml-1">日幣定價 ¥</label>
                      <input type="number" className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-[#7A9E8A] h-[60px]" placeholder="698" value={editingProduct.priceJPY} onChange={e => setEditingProduct({ ...editingProduct, priceJPY: Number(e.target.value) })} />
                    </div>
                    <div>
                      <label className="block text-xs text-stone-500 mb-1 ml-1">台幣售價 $</label>
                      <input type="number" className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl text-[#7A9E8A] outline-none focus:ring-2 focus:ring-[#7A9E8A] h-[60px]" placeholder="250" value={editingProduct.priceTWD} onChange={e => setEditingProduct({ ...editingProduct, priceTWD: Number(e.target.value) })} />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs text-stone-500 mb-1 ml-1">品牌名稱</label>
                    <input type="text" className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-[#7A9E8A] h-[60px]" placeholder="如: 龍角散" value={editingProduct.brand || ''} onChange={e => setEditingProduct({ ...editingProduct, brand: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs text-stone-500 mb-1 ml-1">商品類別</label>
                    <select className="w-full p-3 border border-stone-200 rounded-xl bg-white text-sm h-[60px]" value={editingProduct.category} onChange={e => setEditingProduct({ ...editingProduct, category: e.target.value })}>
                      {settings.productCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-stone-500 mb-1 ml-1">商品說明 / 尺寸表 (選填)</label>
                  <textarea className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-[#7A9E8A] text-sm min-h-[90px]" placeholder={'例如：\nS：胸圍86 腰圍64\nM：胸圍90 腰圍68'} value={editingProduct.description || ''} onChange={e => setEditingProduct({ ...editingProduct, description: e.target.value })} />
                </div>

                <div className="flex gap-4 bg-stone-50 border border-stone-200 rounded-xl p-3">
                  <label className="flex items-center gap-2 text-sm text-stone-700 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 accent-[#7A9E8A]" checked={editingProduct.isPublished !== false} onChange={e => setEditingProduct({ ...editingProduct, isPublished: e.target.checked })} />
                    上架顯示在客人頁面
                  </label>
                  <label className="flex items-center gap-2 text-sm text-stone-700 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 accent-[#7A9E8A]" checked={!!editingProduct.isSoldOut} onChange={e => setEditingProduct({ ...editingProduct, isSoldOut: e.target.checked })} />
                    已結單
                  </label>
                </div>
              </div>
            </div>
            <div className="p-4 bg-stone-100 flex gap-3">
              <button onClick={() => {
                const locs = (editingProduct.sourcingLocations && editingProduct.sourcingLocations.length > 0)
                  ? editingProduct.sourcingLocations
                  : (editingProduct.sourcingLocation ? [{ name: editingProduct.sourcingLocation, isPrimary: true }] : [{ name: '', city: '', isPrimary: true }]);
                setLocationModalData({ locations: locs, onSave: (locs) => setEditingProduct({ ...editingProduct, sourcingLocations: locs }) });
              }} className="w-1/4 py-2.5 bg-white border border-stone-200 text-stone-700 rounded-xl text-sm shadow-sm flex items-center justify-center gap-1">📍 地點</button>
              <button onClick={() => { onUpdateProduct(editingProduct); setEditingProduct(null); }} className="w-3/4 py-2.5 bg-[#7A9E8A] text-white rounded-xl text-sm shadow-lg hover:bg-[#5C8070] transition-colors">儲存變更</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
