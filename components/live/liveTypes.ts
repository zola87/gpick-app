import React from 'react';
import { Product, Customer, Order, GlobalSettings, SourcingLocation } from '../../types';

export type CropTarget = {
  type: 'newProduct' | 'editProduct' | 'gacha' | 'gachaResult';
  index?: number;
};

export type CustomerBatchOrderItem = {
  productId: string;
  productName: string;
  variant: string;
  qty: number;
  searchOpen: boolean;
};

export type GachaResult = {
  image: string | null;
  name: string;
  priceJPY: number;
  priceTWD: number;
  selected?: boolean;
};

export type GachaCustomerItem = {
  name: string;
  qty: number;
  keepShell: boolean;
  searchOpen?: boolean;
};

// ─── OrderInputPanel props ──────────────────────────────────────────────────
export interface OrderInputPanelProps {
  // data
  products: Product[];
  customers: Customer[];
  settings: GlobalSettings;
  onAddOrder: (o: Order, newCustomer?: Customer) => void;
  onUpdateSettings?: (s: GlobalSettings) => void;
  // order mode
  orderMode: 'byProduct' | 'byCustomer';
  setOrderMode: React.Dispatch<React.SetStateAction<'byProduct' | 'byCustomer'>>;
  // by-product state
  selectedProduct: string;
  setSelectedProduct: React.Dispatch<React.SetStateAction<string>>;
  productSearchTerm: string;
  setProductSearchTerm: React.Dispatch<React.SetStateAction<string>>;
  isProductDropdownOpen: boolean;
  setIsProductDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>;
  selectedVariant: string;
  setSelectedVariant: React.Dispatch<React.SetStateAction<string>>;
  batchOrders: { name: string; qty: number }[];
  setBatchOrders: React.Dispatch<React.SetStateAction<{ name: string; qty: number }[]>>;
  focusedRowIndex: number | null;
  setFocusedRowIndex: React.Dispatch<React.SetStateAction<number | null>>;
  // by-customer state
  customerSearchTerm: string;
  setCustomerSearchTerm: React.Dispatch<React.SetStateAction<string>>;
  isCustomerSearchDropdownOpen: boolean;
  setIsCustomerSearchDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>;
  customerBatchOrders: CustomerBatchOrderItem[];
  setCustomerBatchOrders: React.Dispatch<React.SetStateAction<CustomerBatchOrderItem[]>>;
  // open other modals
  setIsAddProductOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsGachaModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

// ─── ProductPanel props ──────────────────────────────────────────────────────
export interface ProductPanelProps {
  // data
  products: Product[];
  filteredProducts: Product[];
  settings: GlobalSettings;
  customers: Customer[];
  onAddProduct: (p: Product) => void;
  onUpdateProduct: (p: Product) => void;
  onDeleteProduct: (id: string) => void;
  onUpdateSettings?: (s: GlobalSettings) => void;
  // order interaction
  orderMode: 'byProduct' | 'byCustomer';
  setSelectedProduct: React.Dispatch<React.SetStateAction<string>>;
  setProductSearchTerm: React.Dispatch<React.SetStateAction<string>>;
  setSelectedVariant: React.Dispatch<React.SetStateAction<string>>;
  customerBatchOrders: CustomerBatchOrderItem[];
  setCustomerBatchOrders: React.Dispatch<React.SetStateAction<CustomerBatchOrderItem[]>>;
  // product list search
  listSearchTerm: string;
  setListSearchTerm: React.Dispatch<React.SetStateAction<string>>;
  isListSearchDropdownOpen: boolean;
  setIsListSearchDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>;
  // delete confirm
  deleteConfirm: string | null;
  setDeleteConfirm: React.Dispatch<React.SetStateAction<string | null>>;
  // editing product
  editingProduct: Product | null;
  setEditingProduct: React.Dispatch<React.SetStateAction<Product | null>>;
  isEditingVariantSettingsOpen: boolean;
  setIsEditingVariantSettingsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  // add product modal
  isAddProductOpen: boolean;
  setIsAddProductOpen: React.Dispatch<React.SetStateAction<boolean>>;
  newProdName: string;
  setNewProdName: React.Dispatch<React.SetStateAction<string>>;
  newProdBrand: string;
  setNewProdBrand: React.Dispatch<React.SetStateAction<string>>;
  newProdLocations: SourcingLocation[];
  setNewProdLocations: React.Dispatch<React.SetStateAction<SourcingLocation[]>>;
  newProdJPY: string;
  setNewProdJPY: React.Dispatch<React.SetStateAction<string>>;
  newProdTWD: string;
  setNewProdTWD: React.Dispatch<React.SetStateAction<string>>;
  newProdCategory: string;
  setNewProdCategory: React.Dispatch<React.SetStateAction<string>>;
  newProdVariants: string;
  setNewProdVariants: React.Dispatch<React.SetStateAction<string>>;
  newProdVariantPrices: Record<string, number>;
  setNewProdVariantPrices: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  newProdVariantCosts: Record<string, number>;
  setNewProdVariantCosts: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  isVariantSettingsOpen: boolean;
  setIsVariantSettingsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isAddingNewCategory: boolean;
  setIsAddingNewCategory: React.Dispatch<React.SetStateAction<boolean>>;
  quickCategoryName: string;
  setQuickCategoryName: React.Dispatch<React.SetStateAction<string>>;
  imagePreview: string | null;
  isUrlMode: boolean;
  setIsUrlMode: React.Dispatch<React.SetStateAction<boolean>>;
  imageUrlInput: string;
  setImageUrlInput: React.Dispatch<React.SetStateAction<string>>;
  fileInputRef: React.RefObject<HTMLInputElement>;
  handleImageChange: (e: React.ChangeEvent<HTMLInputElement>, isEditing?: boolean) => void;
  handleCreateProduct: () => void;
  // location modal
  locationModalData: { locations: SourcingLocation[]; onSave: (locs: SourcingLocation[]) => void } | null;
  setLocationModalData: React.Dispatch<React.SetStateAction<{ locations: SourcingLocation[]; onSave: (locs: SourcingLocation[]) => void } | null>>;
  // crop
  setCropImageSrc: React.Dispatch<React.SetStateAction<string | null>>;
  setCropTarget: React.Dispatch<React.SetStateAction<CropTarget | null>>;
}

// ─── AiImagePanel props ──────────────────────────────────────────────────────
export interface AiImagePanelProps {
  // data
  products: Product[];
  customers: Customer[];
  settings: GlobalSettings;
  onAddProduct: (p: Product) => void;
  onAddOrder: (o: Order, newCustomer?: Customer) => void;
  onUpdateSettings?: (s: GlobalSettings) => void;
  // gacha modal state
  isGachaModalOpen: boolean;
  setIsGachaModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  gachaMode: 'ai' | 'manual';
  setGachaMode: React.Dispatch<React.SetStateAction<'ai' | 'manual'>>;
  gachaImage: string | null;
  setGachaImage: React.Dispatch<React.SetStateAction<string | null>>;
  gachaResults: GachaResult[];
  setGachaResults: React.Dispatch<React.SetStateAction<GachaResult[]>>;
  isAnalyzing: boolean;
  setIsAnalyzing: React.Dispatch<React.SetStateAction<boolean>>;
  reanalyzingIndex: number | null;
  setReanalyzingIndex: React.Dispatch<React.SetStateAction<number | null>>;
  gachaCustomers: GachaCustomerItem[];
  setGachaCustomers: React.Dispatch<React.SetStateAction<GachaCustomerItem[]>>;
  // crop
  setCropImageSrc: React.Dispatch<React.SetStateAction<string | null>>;
  setCropTarget: React.Dispatch<React.SetStateAction<CropTarget | null>>;
}
