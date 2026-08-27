// Brand Shop — shared types, collection names, and defaults.
// Lives on the same Firebase project as the dashboard but uses its own
// collections so it never touches existing data.

export const SHOP_PRODUCTS_COLLECTION = 'shop_products';
export const SHOP_ORDERS_COLLECTION = 'shop_orders';
export const SHOP_SETTINGS_DOC = 'brandShop'; // doc id inside the existing `settings` collection
export const SHOP_CART_STORAGE_KEY = 'nm_shop_cart_v1';

export interface ShopProduct {
  id: string;
  name: string;            // e.g. "FAJADA TEE"
  colorway: string;        // e.g. "CHARCOAL + WHITE"
  description?: string;
  price: number;           // dollars
  images: string[];        // Firebase Storage URLs; first image shows in the grid
  sizes: string[];         // e.g. ["S","M","L","XL","2XL"]; empty for one-size items
  category?: string;
  section?: 'main' | 'secondary' | string;
  active: boolean;
  sortOrder: number;
  createdAt?: number;
  updatedAt?: number;
}

export interface ShopSettings {
  topBanner: string;         // thin black strip text
  brandLine: string;         // small line above the collection title
  collectionTitle: string;   // big hero title
  collectionSubtitle: string;// small line under the title
  logoUrl?: string;          // optional hero header logo/graphic image URL
  heroImageUrl?: string;
  footerImageUrl?: string;
  footerScript: string;      // script overlay on the footer banner
  footerVertical: string;    // vertical text on the footer banner's right edge
  shippingNote?: string;     // shown in the cart drawer
  storeEnabled: boolean;
  shippingFlatRate: number;  // dollars; 0 = free shipping
  freeShippingOver: number;  // dollars; subtotal at/above this ships free (0 = disabled)
  collectTax: boolean;       // Stripe automatic tax on the hosted checkout
}

export const DEFAULT_SHOP_SETTINGS: ShopSettings = {
  topBanner: 'DESERT MADE',
  brandLine: 'NM ORIGINAL',
  collectionTitle: 'NO. 505',
  collectionSubtitle: 'SERIE 1',
  footerScript: 'NM Original',
  footerVertical: 'DESERT MADE',
  shippingNote: 'Shipping + taxes calculated at checkout.',
  storeEnabled: true,
  shippingFlatRate: 0,
  freeShippingOver: 0,
  collectTax: true,
};

export interface CartItem {
  productId: string;
  name: string;
  colorway: string;
  size: string;      // '' when the product has no sizes
  price: number;     // dollars, snapshot at time of add
  image?: string;
  qty: number;
}

export interface ShopOrderItem {
  productId: string;
  name: string;
  colorway: string;
  size: string;
  price: number;
  qty: number;
}

export type ShopOrderStatus = 'pending' | 'paid' | 'fulfilled' | 'cancelled';

export interface ShopOrder {
  id: string;
  items: ShopOrderItem[];
  subtotal: number;          // dollars, client-computed at checkout start
  amountTotal?: number;      // dollars, from Stripe after payment
  currency?: string;
  email?: string;
  customerName?: string;
  shippingAddress?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
  } | null;
  status: ShopOrderStatus;
  stripeSessionId?: string;
  createdAt: number;
  paidAt?: number;
  fulfilledAt?: number;
}

export function formatShopPrice(dollars: number): string {
  const isWhole = Math.abs(dollars - Math.round(dollars)) < 0.005;
  return isWhole ? `$${Math.round(dollars)}` : `$${dollars.toFixed(2)}`;
}

export function cartItemKey(item: Pick<CartItem, 'productId' | 'size'>): string {
  return `${item.productId}__${item.size}`;
}
