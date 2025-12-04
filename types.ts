
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
}

export interface Product {
  id: string;
  name: string;
  variants: string[]; // e.g., ["Red", "Blue"] or ["S", "M", "L"]
  priceJPY: number;
  priceTWD: number;
  imageUrl?: string;
  category: string;
  brand?: string;
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
  isArchived?: boolean; // New: For session management
  timestamp: number;
  
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
