/**
 * LiveSession.tsx — thin orchestration wrapper
 *
 * All state lives here. Rendering is delegated to:
 *   components/live/OrderInputPanel.tsx  – 快速喊單 (left column)
 *   components/live/ProductPanel.tsx     – 商品列表 + 上架/編輯 modals (right column)
 *   components/live/AiImagePanel.tsx     – 快速扭蛋 AI modal
 */
import React, { useState, useEffect, useRef } from 'react';
import { Product, Customer, Order, GlobalSettings, SourcingLocation } from '../types';
import { showAlert } from '../App';
import { compressImage } from '../utils/imageUtils';
import { uploadProductImage } from '../services/firebaseService';
import ImageCropperModal from './ImageCropperModal';

import { OrderInputPanel }  from './live/OrderInputPanel';
import { ProductPanel }     from './live/ProductPanel';
import { AiImagePanel }     from './live/AiImagePanel';
import { generateId, DEFAULT_GACHA_IMAGE, MAX_PRODUCT_IMAGES } from './live/liveUtils';
import {
  CropTarget,
  CustomerBatchOrderItem,
  GachaResult,
  GachaCustomerItem,
} from './live/liveTypes';

interface LiveSessionProps {
  products: Product[];
  customers: Customer[];
  settings: GlobalSettings;
  onAddProduct: (p: Product) => void;
  onUpdateProduct: (p: Product) => void;
  onDeleteProduct: (id: string) => void;
  onAddOrder: (o: Order, createNewCustomer?: Customer) => void;
  onUpdateSettings?: (s: GlobalSettings) => void;
}

export const LiveSession: React.FC<LiveSessionProps> = ({
  products, customers, settings,
  onAddProduct, onUpdateProduct, onDeleteProduct, onAddOrder, onUpdateSettings,
}) => {
  const topRef      = useRef<HTMLDivElement>(null);

  // ── Add-product form ──────────────────────────────────────────────────────
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [newProdName,      setNewProdName]      = useState('');
  const [newProdBrand,     setNewProdBrand]     = useState('');
  const [newProdLocations, setNewProdLocations] = useState<SourcingLocation[]>([]);
  const [newProdJPY,       setNewProdJPY]       = useState('');
  const [newProdTWD,       setNewProdTWD]       = useState('');
  const [newProdCategory,  setNewProdCategory]  = useState(settings.productCategories[0] || '一般');
  const [newProdVariants,  setNewProdVariants]  = useState('');
  const [newProdVariantPrices, setNewProdVariantPrices] = useState<Record<string, number>>({});
  const [newProdVariantCosts,  setNewProdVariantCosts]  = useState<Record<string, number>>({});
  const [isVariantSettingsOpen, setIsVariantSettingsOpen] = useState(false);
  const [isEditingVariantSettingsOpen, setIsEditingVariantSettingsOpen] = useState(false);
  const [newProdImages, setNewProdImages] = useState<string[]>([]); // up to MAX_PRODUCT_IMAGES; first = cover
  const [isUrlMode,     setIsUrlMode]     = useState(false);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [newProdDescription, setNewProdDescription] = useState('');
  // Default to unpublished — at a live session we often need to record an order fast
  // with incomplete product info, and only flip this on once the listing is actually
  // ready to show customers.
  const [newProdIsPublished, setNewProdIsPublished] = useState(false);
  const [newProdIsSoldOut,   setNewProdIsSoldOut]   = useState(false);
  const [isAddingNewCategory, setIsAddingNewCategory] = useState(false);
  const [quickCategoryName,   setQuickCategoryName]   = useState('');

  // ── Location modal ────────────────────────────────────────────────────────
  const [locationModalData, setLocationModalData] = useState<{
    locations: SourcingLocation[];
    onSave: (locs: SourcingLocation[]) => void;
  } | null>(null);

  // ── Order input ───────────────────────────────────────────────────────────
  const [orderMode,              setOrderMode]              = useState<'byProduct' | 'byCustomer'>('byProduct');
  const [selectedProduct,        setSelectedProduct]        = useState('');
  const [productSearchTerm,      setProductSearchTerm]      = useState('');
  const [isProductDropdownOpen,  setIsProductDropdownOpen]  = useState(false);
  const [selectedVariant,        setSelectedVariant]        = useState('');
  const [batchOrders,            setBatchOrders]            = useState<{ name: string; qty: number }[]>([{ name: '', qty: 1 }]);
  const [focusedRowIndex,        setFocusedRowIndex]        = useState<number | null>(null);
  const [customerSearchTerm,     setCustomerSearchTerm]     = useState('');
  const [isCustomerSearchDropdownOpen, setIsCustomerSearchDropdownOpen] = useState(false);
  const [customerBatchOrders,    setCustomerBatchOrders]    = useState<CustomerBatchOrderItem[]>([{ productId: '', productName: '', variant: '', qty: 1, searchOpen: false }]);

  // ── Product list ──────────────────────────────────────────────────────────
  const [listSearchTerm,          setListSearchTerm]          = useState('');
  const [isListSearchDropdownOpen, setIsListSearchDropdownOpen] = useState(false);

  // ── Edit / delete ─────────────────────────────────────────────────────────
  const [editingProduct,  setEditingProduct]  = useState<Product | null>(null);
  const [deleteConfirm,   setDeleteConfirm]   = useState<string | null>(null);
  const [copiedId,        setCopiedId]        = useState<string | null>(null); // eslint-disable-line @typescript-eslint/no-unused-vars

  // ── Gacha ─────────────────────────────────────────────────────────────────
  const [isGachaModalOpen,  setIsGachaModalOpen]  = useState(false);
  const [gachaMode,         setGachaMode]         = useState<'ai' | 'manual'>('manual');
  const [gachaImage,        setGachaImage]        = useState<string | null>(null);
  const [gachaResults,      setGachaResults]      = useState<GachaResult[]>([]);
  const [isAnalyzing,       setIsAnalyzing]       = useState(false);
  const [reanalyzingIndex,  setReanalyzingIndex]  = useState<number | null>(null);
  const [gachaCustomers,    setGachaCustomers]    = useState<GachaCustomerItem[]>([{ name: '', qty: 1, keepShell: false, searchOpen: false }]);

  // ── Crop ──────────────────────────────────────────────────────────────────
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [cropTarget,   setCropTarget]   = useState<CropTarget | null>(null);

  // ── Auto-calculate TWD from JPY ───────────────────────────────────────────
  useEffect(() => {
    if (newProdJPY) {
      const jpy  = parseFloat(newProdJPY);
      const rule = settings.pricingRules.find(r => jpy >= r.minPrice && jpy <= r.maxPrice);
      if (rule) setNewProdTWD(Math.ceil(jpy * rule.multiplier).toString());
    }
  }, [newProdJPY, settings]);

  // Default to camera/album mode whenever the add-product modal is (re)opened
  useEffect(() => {
    if (isAddProductOpen) { setIsUrlMode(false); setImageUrlInput(''); }
  }, [isAddProductOpen]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleCropComplete = async (croppedImageBase64: string) => {
    if (cropTarget?.type === 'newProduct' && cropTarget.index !== undefined) {
      const index = cropTarget.index;
      setCropImageSrc(null);
      setCropTarget(null);
      try {
        const url = await uploadProductImage(croppedImageBase64);
        setNewProdImages(prev => { const next = [...prev]; next[index] = url; return next; });
      } catch { showAlert('圖片上傳失敗'); }
      return;
    }
    else if (cropTarget?.type === 'editProduct' && cropTarget.index !== undefined) {
      const index = cropTarget.index;
      setCropImageSrc(null);
      setCropTarget(null);
      try {
        const url = await uploadProductImage(croppedImageBase64);
        setEditingProduct(prev => {
          if (!prev) return prev;
          const combined = [prev.imageUrl, ...(prev.imageUrls || [])].filter(Boolean) as string[];
          combined[index] = url;
          return { ...prev, imageUrl: combined[0], imageUrls: combined.slice(1) };
        });
      } catch { showAlert('圖片上傳失敗'); }
      return;
    }
    else if (cropTarget?.type === 'gacha')       { setGachaImage(croppedImageBase64); }
    else if (cropTarget?.type === 'gachaResult' && cropTarget.index !== undefined) {
      const nr = [...gachaResults];
      nr[cropTarget.index].image = croppedImageBase64;
      setGachaResults(nr);
    }
    setCropImageSrc(null);
    setCropTarget(null);
  };

  const handleImagesChange = async (e: React.ChangeEvent<HTMLInputElement>, isEdit = false) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const fileList = Array.from(files);
    try {
      if (isEdit) {
        if (!editingProduct) return;
        const current = [editingProduct.imageUrl, ...(editingProduct.imageUrls || [])].filter(Boolean) as string[];
        const room = MAX_PRODUCT_IMAGES - current.length;
        if (room <= 0) { showAlert(`最多上傳 ${MAX_PRODUCT_IMAGES} 張照片`); return; }
        const urls = await Promise.all(fileList.slice(0, room).map(async f => uploadProductImage(await compressImage(f))));
        setEditingProduct(prev => {
          if (!prev) return prev;
          const cur = [prev.imageUrl, ...(prev.imageUrls || [])].filter(Boolean) as string[];
          const combined = [...cur, ...urls].slice(0, MAX_PRODUCT_IMAGES);
          return { ...prev, imageUrl: combined[0], imageUrls: combined.slice(1) };
        });
      } else {
        const room = MAX_PRODUCT_IMAGES - newProdImages.length;
        if (room <= 0) { showAlert(`最多上傳 ${MAX_PRODUCT_IMAGES} 張照片`); return; }
        const urls = await Promise.all(fileList.slice(0, room).map(async f => uploadProductImage(await compressImage(f))));
        setNewProdImages(prev => [...prev, ...urls].slice(0, MAX_PRODUCT_IMAGES));
      }
    } catch { showAlert('圖片處理失敗'); }
    e.target.value = '';
  };

  const handleCreateProduct = () => {
    const parsedVariants = newProdVariants.split(/[.,\s]+/).map(v => v.trim()).filter(v => v);
    const cleanedVariantPrices: Record<string, number> = {};
    const cleanedVariantCosts:  Record<string, number> = {};
    parsedVariants.forEach(v => {
      if (newProdVariantPrices[v] !== undefined) cleanedVariantPrices[v] = newProdVariantPrices[v];
      if (newProdVariantCosts[v]  !== undefined) cleanedVariantCosts[v]  = newProdVariantCosts[v];
    });
    const hasVariantPrices = Object.keys(cleanedVariantPrices).length > 0;
    if (!newProdName || (!newProdTWD && !hasVariantPrices)) return;

    const newProduct: Product = {
      id:               generateId(),
      name:             newProdName,
      brand:            newProdBrand,
      sourcingLocations: newProdLocations,
      priceJPY:         Number(newProdJPY) || 0,
      priceTWD:         Number(newProdTWD) || (hasVariantPrices ? Math.min(...Object.values(cleanedVariantPrices)) : 0),
      category:         newProdCategory,
      variants:         parsedVariants,
      variantPrices:    hasVariantPrices ? cleanedVariantPrices : undefined,
      variantCosts:     Object.keys(cleanedVariantCosts).length > 0 ? cleanedVariantCosts : undefined,
      imageUrl:         newProdImages[0] || (newProdCategory === '扭蛋' ? DEFAULT_GACHA_IMAGE : `https://picsum.photos/200?random=${Math.random()}`),
      imageUrls:        newProdImages.slice(1),
      description:      newProdDescription.trim() || undefined,
      isPublished:      newProdIsPublished,
      isSoldOut:        newProdIsSoldOut,
      createdAt:        Date.now(),
    };
    onAddProduct(newProduct);
    setIsAddProductOpen(false);
    setNewProdName(''); setNewProdBrand(''); setNewProdLocations([]);
    setNewProdVariants(''); setNewProdVariantPrices({}); setNewProdVariantCosts({});
    setNewProdJPY(''); setNewProdTWD('');
    setNewProdImages([]); setNewProdDescription(''); setImageUrlInput('');
    setNewProdIsPublished(false); setNewProdIsSoldOut(false);
  };

  // ── Bulk-update all products under one brand (上架/下架/已結單) ─────────────
  const handleBulkUpdateByBrand = (brand: string, patch: Partial<Pick<Product, 'isPublished' | 'isSoldOut'>>) => {
    const matched = products.filter(p => p.brand === brand);
    matched.forEach(p => onUpdateProduct({ ...p, ...patch }));
    showAlert(matched.length > 0 ? `已更新 ${matched.length} 個商品` : '這個品牌目前沒有商品');
  };

  // ── Filtered product list ─────────────────────────────────────────────────
  const filteredProducts = products
    .filter(p =>
      p.name.toLowerCase().includes(listSearchTerm.toLowerCase()) ||
      (p.brand    && p.brand.toLowerCase().includes(listSearchTerm.toLowerCase())) ||
      (p.category && p.category.toLowerCase().includes(listSearchTerm.toLowerCase()))
    )
    .sort((a, b) => b.createdAt - a.createdAt);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6" ref={topRef}>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left – order input */}
        <OrderInputPanel
          products={products}
          customers={customers}
          settings={settings}
          onAddOrder={onAddOrder}
          onUpdateSettings={onUpdateSettings}
          orderMode={orderMode}               setOrderMode={setOrderMode}
          selectedProduct={selectedProduct}   setSelectedProduct={setSelectedProduct}
          productSearchTerm={productSearchTerm} setProductSearchTerm={setProductSearchTerm}
          isProductDropdownOpen={isProductDropdownOpen} setIsProductDropdownOpen={setIsProductDropdownOpen}
          selectedVariant={selectedVariant}   setSelectedVariant={setSelectedVariant}
          batchOrders={batchOrders}           setBatchOrders={setBatchOrders}
          focusedRowIndex={focusedRowIndex}   setFocusedRowIndex={setFocusedRowIndex}
          customerSearchTerm={customerSearchTerm} setCustomerSearchTerm={setCustomerSearchTerm}
          isCustomerSearchDropdownOpen={isCustomerSearchDropdownOpen} setIsCustomerSearchDropdownOpen={setIsCustomerSearchDropdownOpen}
          customerBatchOrders={customerBatchOrders} setCustomerBatchOrders={setCustomerBatchOrders}
          setIsAddProductOpen={setIsAddProductOpen}
          setIsGachaModalOpen={setIsGachaModalOpen}
        />

        {/* Right – product grid + modals */}
        <ProductPanel
          products={products}
          filteredProducts={filteredProducts}
          settings={settings}
          customers={customers}
          onAddProduct={onAddProduct}
          onUpdateProduct={onUpdateProduct}
          onDeleteProduct={onDeleteProduct}
          onUpdateSettings={onUpdateSettings}
          onBulkUpdateByBrand={handleBulkUpdateByBrand}
          orderMode={orderMode}
          setSelectedProduct={setSelectedProduct}
          setProductSearchTerm={setProductSearchTerm}
          setSelectedVariant={setSelectedVariant}
          customerBatchOrders={customerBatchOrders}
          setCustomerBatchOrders={setCustomerBatchOrders}
          listSearchTerm={listSearchTerm}             setListSearchTerm={setListSearchTerm}
          isListSearchDropdownOpen={isListSearchDropdownOpen} setIsListSearchDropdownOpen={setIsListSearchDropdownOpen}
          deleteConfirm={deleteConfirm}               setDeleteConfirm={setDeleteConfirm}
          editingProduct={editingProduct}             setEditingProduct={setEditingProduct}
          isEditingVariantSettingsOpen={isEditingVariantSettingsOpen} setIsEditingVariantSettingsOpen={setIsEditingVariantSettingsOpen}
          isAddProductOpen={isAddProductOpen}         setIsAddProductOpen={setIsAddProductOpen}
          newProdName={newProdName}                   setNewProdName={setNewProdName}
          newProdBrand={newProdBrand}                 setNewProdBrand={setNewProdBrand}
          newProdLocations={newProdLocations}         setNewProdLocations={setNewProdLocations}
          newProdJPY={newProdJPY}                     setNewProdJPY={setNewProdJPY}
          newProdTWD={newProdTWD}                     setNewProdTWD={setNewProdTWD}
          newProdCategory={newProdCategory}           setNewProdCategory={setNewProdCategory}
          newProdVariants={newProdVariants}           setNewProdVariants={setNewProdVariants}
          newProdVariantPrices={newProdVariantPrices} setNewProdVariantPrices={setNewProdVariantPrices}
          newProdVariantCosts={newProdVariantCosts}   setNewProdVariantCosts={setNewProdVariantCosts}
          isVariantSettingsOpen={isVariantSettingsOpen} setIsVariantSettingsOpen={setIsVariantSettingsOpen}
          isAddingNewCategory={isAddingNewCategory}   setIsAddingNewCategory={setIsAddingNewCategory}
          quickCategoryName={quickCategoryName}       setQuickCategoryName={setQuickCategoryName}
          newProdImages={newProdImages}               setNewProdImages={setNewProdImages}
          isUrlMode={isUrlMode}                       setIsUrlMode={setIsUrlMode}
          imageUrlInput={imageUrlInput}               setImageUrlInput={setImageUrlInput}
          handleImagesChange={handleImagesChange}
          handleCreateProduct={handleCreateProduct}
          newProdDescription={newProdDescription}     setNewProdDescription={setNewProdDescription}
          newProdIsPublished={newProdIsPublished}     setNewProdIsPublished={setNewProdIsPublished}
          newProdIsSoldOut={newProdIsSoldOut}         setNewProdIsSoldOut={setNewProdIsSoldOut}
          locationModalData={locationModalData}       setLocationModalData={setLocationModalData}
          setCropImageSrc={setCropImageSrc}
          setCropTarget={setCropTarget}
        />
      </div>

      {/* AI / Gacha modal */}
      <AiImagePanel
        products={products}
        customers={customers}
        settings={settings}
        onAddProduct={onAddProduct}
        onAddOrder={onAddOrder}
        onUpdateSettings={onUpdateSettings}
        isGachaModalOpen={isGachaModalOpen}     setIsGachaModalOpen={setIsGachaModalOpen}
        gachaMode={gachaMode}                   setGachaMode={setGachaMode}
        gachaImage={gachaImage}                 setGachaImage={setGachaImage}
        gachaResults={gachaResults}             setGachaResults={setGachaResults}
        isAnalyzing={isAnalyzing}               setIsAnalyzing={setIsAnalyzing}
        reanalyzingIndex={reanalyzingIndex}     setReanalyzingIndex={setReanalyzingIndex}
        gachaCustomers={gachaCustomers}         setGachaCustomers={setGachaCustomers}
        setCropImageSrc={setCropImageSrc}
        setCropTarget={setCropTarget}
      />

      {/* Image cropper */}
      {cropImageSrc && (
        <ImageCropperModal
          imageSrc={cropImageSrc}
          onCropComplete={handleCropComplete}
          onCancel={() => { setCropImageSrc(null); setCropTarget(null); }}
        />
      )}
    </div>
  );
};
