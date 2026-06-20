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
import ImageCropperModal from './ImageCropperModal';

import { OrderInputPanel }  from './live/OrderInputPanel';
import { ProductPanel }     from './live/ProductPanel';
import { AiImagePanel }     from './live/AiImagePanel';
import { generateId, DEFAULT_GACHA_IMAGE } from './live/liveUtils';
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
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  const [imagePreview,  setImagePreview]  = useState<string | null>(null);
  const [isUrlMode,     setIsUrlMode]     = useState(false);
  const [imageUrlInput, setImageUrlInput] = useState('');
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

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleCropComplete = (croppedImageBase64: string) => {
    if      (cropTarget?.type === 'newProduct')  { setImagePreview(croppedImageBase64); }
    else if (cropTarget?.type === 'editProduct' && editingProduct) { setEditingProduct({ ...editingProduct, imageUrl: croppedImageBase64 }); }
    else if (cropTarget?.type === 'gacha')       { setGachaImage(croppedImageBase64); }
    else if (cropTarget?.type === 'gachaResult' && cropTarget.index !== undefined) {
      const nr = [...gachaResults];
      nr[cropTarget.index].image = croppedImageBase64;
      setGachaResults(nr);
    }
    setCropImageSrc(null);
    setCropTarget(null);
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>, isEdit = false) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImage(file);
        if (isEdit && editingProduct) setEditingProduct({ ...editingProduct, imageUrl: compressed });
        else setImagePreview(compressed);
      } catch { showAlert('圖片處理失敗'); }
    }
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
      imageUrl:         isUrlMode ? imageUrlInput : (imagePreview || (newProdCategory === '扭蛋' ? DEFAULT_GACHA_IMAGE : `https://picsum.photos/200?random=${Math.random()}`)),
      createdAt:        Date.now(),
    };
    onAddProduct(newProduct);
    setIsAddProductOpen(false);
    setImagePreview(null);
    setNewProdName(''); setNewProdBrand(''); setNewProdLocations([]);
    setNewProdVariants(''); setNewProdVariantPrices({}); setNewProdVariantCosts({});
    setNewProdJPY(''); setNewProdTWD('');
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
          imagePreview={imagePreview}
          isUrlMode={isUrlMode}                       setIsUrlMode={setIsUrlMode}
          imageUrlInput={imageUrlInput}               setImageUrlInput={setImageUrlInput}
          fileInputRef={fileInputRef}
          handleImageChange={handleImageChange}
          handleCreateProduct={handleCreateProduct}
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
