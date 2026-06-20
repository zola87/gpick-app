

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export interface GlobalSettings {
  jpyExchangeRate: number; // Current market rate for cost calc
  pricingRules: {
    minPrice: number;
    maxPrice: number;
    multiplier: number; // e.g. 0.3 or 0.35
  }[];
  shippingFee: number;
  freeShippingThreshold: number;
  pickupPayment: number; // usually 20
  productCategories: string[]; // Custom categories
  billingMessageTemplate: string; // New: Customizable message template
  
  // Cloud Sync
  useCloudSync?: boolean;
  firebaseConfig?: FirebaseConfig;

  // CRM Levels
  customerLevels: {
      vip: number;
      vvip: number;
  };

  // Analysis Draft
  currentAiAnalysis?: string; // Persistent draft for current session
  sessionName?: string; // New: Custom session name like "12月大阪聖誕"
  gachaPricingRules?: { jpy: number; twd: number }[]; // New: Gacha specific pricing
  geminiApiKey?: string; // New: API key for AI image recognition

  // Checkout / Settlement
  checkoutEnabled?: boolean; // Admin toggle: opens checkout mode for all customers
  bankAccount?: string;      // Remittance bank account info shown to customer
}

export interface SourcingLocation {
  city?: string;
  name: string; // Store name
  isPrimary: boolean;
}

export interface Product {
  id: string;
  name: string;
  variants: string[]; // e.g., ["Red", "Blue"] or ["S", "M", "L"]
  variantPrices?: Record<string, number>; // Optional: specific TWD price for each variant
  variantCosts?: Record<string, number>; // Optional: specific JPY cost for each variant
  priceJPY: number;
  priceTWD: number;
  imageUrl?: string;
  category: string;
  brand?: string;
  sourcingLocation?: string; // New: Where the product was found (store name, location, etc.)
  sourcingLocations?: SourcingLocation[]; // Array of locations with one marked as primary
  createdAt: number;
}

export interface Customer {
  id: string;
  lineName: string; // The name they use in LINE
  nickname?: string; // Community nickname
  realName?: string;
  phone?: string;
  address?: string; // Store name or address
  birthDate?: string;
  note?: string; // Preferences
  isBlacklisted?: boolean;
  totalSpent?: number;
  lastFiveDigits?: string; // Bank account
  isStock?: boolean; // New: Identifies the virtual inventory holder
  chatUrl?: string; // New: Direct link to LINE chat
  sessionCount?: number; // New: Number of sessions participated
  customerToken?: string; // Token for customer self-service page
  communityNickname?: string; // Nickname used in anonymous community
  lineUserId?: string;        // LINE User ID (from LINE Login)
  lineAvatarUrl?: string;     // LINE profile picture URL
  gender?: '男' | '女' | '不公開'; // For customer analytics
  checkoutConfirmedSession?: string; // Session name of the most recently confirmed checkout
}

export interface Order {
  id: string;
  productId: string;
  variant?: string; // Specific size/color
  customerId: string;
  quantity: number;
  quantityBought: number; // For partial fulfillment in shopping list
  status: 'PENDING' | 'BOUGHT' | 'PACKED' | 'SHIPPED';
  notificationStatus?: 'UNNOTIFIED' | 'NOTIFIED'; // New: Track if customer is notified
  isArchived?: boolean;     // For session management
  sessionName?: string;     // Session this order was archived under
  archivedAt?: number;      // Timestamp when archived
  isCarriedOver?: boolean;  // Carried over from a previous session (unfound → next session)
  timestamp: number;
  keepShell?: boolean; // New: Keep gacha shell (+10 TWD)
  
  // Payment Tracking
  isPaid?: boolean;
  paymentMethod?: string; // e.g. 'TRANSFER', 'CASH', 'PICKUP'
  paymentNote?: string; // e.g. Last 5 digits
}

export interface SalesSummary {
  totalRevenueTWD: number;
  totalCostJPY: number;
  totalOrders: number;
  topProducts: { name: string; count: number }[];
}

export interface TodoItem {
  id: string;
  content: string;
  imageUrl?: string; // Base64 compressed image
  linkUrl?: string; // Optional URL link (Maps or Website)
  category: 'WISH' | 'STORE' | 'PERSONAL';
  isCompleted: boolean;
  createdAt: number;
}

export interface SalesReport {
  id: string;
  date: string; // ISO Date String of archive time
  name: string; // "2023-10 連線"
  totalRevenue: number;
  totalProfit: number;
  totalItems: number;
  exchangeRate: number;
  aiAnalysis: string; // The full AI text
  timestamp: number;
}