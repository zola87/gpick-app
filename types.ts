

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
  productCategories: string[]; // Custom categories (小分類, unchanged — stored on each product)
  // 大分類 — a display/filter grouping layer over existing product data. A product
  // belongs to a group if its category OR its brand is listed here, so e.g. a snack
  // (category: 零食) whose brand is 皮克敏 can surface both under a plain "零食" group
  // and under a franchise-style "任天堂" group built from brand membership.
  categoryGroups?: { name: string; categories: string[]; brands?: string[] }[];
  billingMessageTemplate: string; // New: Customizable message template
  boughtNotificationTemplate?: string; // Customizable "items bought" LINE notification template
  
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
  // 本場扭蛋牆 — raw machine-wall photos shown to customers as-is (same shots sent to
  // the LINE community), purely for browsing. Not tied to any Product/Order record.
  gachaWallImages?: string[];
  geminiApiKey?: string; // New: API key for AI image recognition

  // Checkout / Settlement
  checkoutEnabled?: boolean; // Admin toggle: opens checkout mode for all customers
  // Multiple receiving accounts instead of one — spreads remittance volume across banks
  // so no single account racks up enough small transfers to get flagged. Each customer
  // is deterministically assigned to the same one every time (see pickBankAccountFor),
  // unless Customer.preferredBankId pins them to a specific one (e.g. they asked for a
  // same-bank transfer to skip the inter-bank fee).
  bankAccounts?: { id: string; label: string; account: string }[];
  shopeeOrderLink?: string;  // 賣貨便本場連線共用下單連結，匯款確認後推播給客人
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
  imageUrls?: string[]; // Additional photos beyond the cover image
  description?: string; // Free-text product description / size chart
  isPublished?: boolean; // Admin toggle: visible on customer-facing products page (default true if undefined)
  isSoldOut?: boolean;   // Admin toggle: marks product as fully sold out / no longer taking orders
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
  lastFiveDigits?: string; // 客人匯款後五碼（LINE webhook 自動擷取，或後台手動填寫/修正）
  preferredBankId?: string; // 客人指定要用哪一組匯款帳號（例如同行轉帳免手續費），對應 GlobalSettings.bankAccounts[].id；沒設定就用客人 id 自動算出固定的一組
  paymentReportedAt?: number;  // 客人於 LINE 回報後五碼的時間
  paymentConfirmed?: boolean;  // 後台是否已確認收到匯款
  paymentConfirmedAt?: number; // 後台確認收到的時間
  isStock?: boolean; // New: Identifies the virtual inventory holder
  sessionCount?: number; // New: Number of sessions participated
  customerToken?: string; // Token for customer self-service page
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
  carryOverDecision?: 'keep' | 'declined'; // Customer's explicit LINE reply when asked whether to keep an unfound item for next session
  carryOverDecidedAt?: number;
  timestamp: number;
  keepShell?: boolean; // New: Keep gacha shell (+10 TWD)
  resultImages?: string[]; // Photos of what was actually rolled/received — mainly for 扭蛋, attached after the fact instead of being tracked as separate per-design products
  // Each photo of a 扭蛋 machine/design the customer asked for, with its own target
  // quantity and running boughtQty — so "design A x3, design B x2" within the same
  // price-tier order is visible at a glance instead of being collapsed into one
  // order-level number. Attached as soon as the request comes in, shared & real-time
  // across staff (replaces the old LINE-album hand-off where only one person could mark
  // it done). Tapping it bumps boughtQty by 1 (not the whole qty at once — the machine
  // might run dry partway through), which also bumps the order's quantityBought by 1
  // each time, so billing stats stay in sync automatically.
  requestedItems?: { url: string; qty: number; boughtQty?: number }[];

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