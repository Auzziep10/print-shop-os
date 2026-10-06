import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

// Discount codes live in settings/discounts (public-readable, admin-writable):
// { codes: { [CODE]: { type, value, active, expires?, note? } } }
// Managed from Settings → Discount Codes; redeemable on the public /start
// checkout and the portal payment modal.

export type DiscountTarget = 'items' | 'shipping';

export interface DiscountCodeEntry {
  type: 'percent' | 'fixed' | 'free_shipping';
  value: number;
  active: boolean;
  expires?: string; // YYYY-MM-DD; valid through end of that day
  note?: string;
  createdAt?: number;
  target?: DiscountTarget;
}

export interface AppliedDiscount {
  code: string;
  type: 'percent' | 'fixed' | 'free_shipping';
  value: number;
  target?: DiscountTarget;
}

export interface AccountDiscount {
  enabled: boolean;
  type: 'percent' | 'fixed' | 'free_shipping';
  value: number;
  expires?: string; // YYYY-MM-DD; valid through end of that day, or empty for forever
  note?: string; // optional label/name, e.g. "VIP Client 10% Off"
  target?: DiscountTarget;
}

export function getValidAccountDiscount(accountDiscount?: AccountDiscount | null): AppliedDiscount | null {
  if (!accountDiscount || !accountDiscount.enabled) return null;
  const target: DiscountTarget = accountDiscount.target || (accountDiscount.type === 'free_shipping' ? 'shipping' : 'items');
  if (target === 'shipping') return null;

  const numVal = typeof accountDiscount.value === 'number' ? accountDiscount.value : parseFloat(accountDiscount.value as any);
  if (isNaN(numVal) || numVal <= 0) return null;
  if (accountDiscount.expires && accountDiscount.expires.trim()) {
    const exp = new Date(`${accountDiscount.expires.trim()}T23:59:59`);
    if (!isNaN(exp.getTime()) && exp.getTime() < Date.now()) {
      return null;
    }
  }
  return {
    code: (accountDiscount.note && accountDiscount.note.trim()) ? accountDiscount.note.trim().toUpperCase() : 'ACCOUNT DISCOUNT',
    type: accountDiscount.type === 'fixed' ? 'fixed' : 'percent',
    value: numVal,
    target: 'items',
  };
}

export function getValidAccountShippingDiscount(customer?: any): AppliedDiscount | null {
  if (!customer) return null;

  // 1. Direct freeShipping flag on customer profile
  if (
    customer.freeShipping === true ||
    customer.free_shipping === true ||
    customer.freeShippingEnabled === true ||
    customer.shippingDiscount === 'free' ||
    customer.allowFreeShipping === true
  ) {
    return {
      code: 'FREE SHIPPING',
      type: 'free_shipping',
      value: 100,
      target: 'shipping',
    };
  }

  // 2. Account discount targeting shipping
  const accountDiscount = customer.accountDiscount as AccountDiscount | undefined;
  if (accountDiscount && accountDiscount.enabled) {
    const target: DiscountTarget = accountDiscount.target || (accountDiscount.type === 'free_shipping' ? 'shipping' : 'items');
    if (target === 'shipping') {
      if (accountDiscount.expires && accountDiscount.expires.trim()) {
        const exp = new Date(`${accountDiscount.expires.trim()}T23:59:59`);
        if (!isNaN(exp.getTime()) && exp.getTime() < Date.now()) {
          return null;
        }
      }

      const isFree = accountDiscount.type === 'free_shipping' || Number(accountDiscount.value) >= 100;
      const numVal = typeof accountDiscount.value === 'number' ? accountDiscount.value : parseFloat(accountDiscount.value as any);
      if (!isFree && (isNaN(numVal) || numVal <= 0)) return null;

      return {
        code: (accountDiscount.note && accountDiscount.note.trim()) ? accountDiscount.note.trim().toUpperCase() : 'FREE SHIPPING',
        type: isFree ? 'free_shipping' : (accountDiscount.type === 'fixed' ? 'fixed' : 'percent'),
        value: isFree ? 100 : numVal,
        target: 'shipping',
      };
    }

    // 3. If account has 100% off full discount and no target restriction was set, waive shipping automatically
    if (accountDiscount.type === 'percent' && Number(accountDiscount.value) >= 100 && !accountDiscount.target) {
      if (accountDiscount.expires && accountDiscount.expires.trim()) {
        const exp = new Date(`${accountDiscount.expires.trim()}T23:59:59`);
        if (!isNaN(exp.getTime()) && exp.getTime() < Date.now()) {
          return null;
        }
      }
      return {
        code: (accountDiscount.note && accountDiscount.note.trim()) ? accountDiscount.note.trim().toUpperCase() : 'FREE SHIPPING',
        type: 'free_shipping',
        value: 100,
        target: 'shipping',
      };
    }
  }

  return null;
}

export type DiscountValidation =
  | { ok: true; discount: AppliedDiscount }
  | { ok: false; error: string };

export async function validateDiscountCode(rawCode: string): Promise<DiscountValidation> {
  const code = (rawCode || '').trim().toUpperCase();
  if (!code) return { ok: false, error: 'Enter a code' };
  try {
    const snap = await getDoc(doc(db, 'settings', 'discounts'));
    const codes = snap.exists() ? ((snap.data() as any).codes || {}) : {};
    const entry: DiscountCodeEntry | undefined = codes[code];

    if (!entry) {
      return { ok: false, error: 'Invalid discount code' };
    }

    if (!entry.active) return { ok: false, error: 'This code is no longer active' };
    if (entry.expires) {
      const exp = new Date(`${entry.expires}T23:59:59`);
      if (!isNaN(exp.getTime()) && exp.getTime() < Date.now()) {
        return { ok: false, error: 'This code has expired' };
      }
    }

    const target: DiscountTarget = entry.target || (
      entry.type === 'free_shipping' || (entry.type as string).includes('shipping') ? 'shipping' : 'items'
    );

    const isFreeShipping = entry.type === 'free_shipping' || (target === 'shipping' && entry.type === 'percent' && entry.value >= 100);

    if (!isFreeShipping && !(entry.value > 0)) return { ok: false, error: 'Invalid code' };

    const resolvedType: 'percent' | 'fixed' | 'free_shipping' = isFreeShipping
      ? 'free_shipping'
      : (entry.type === 'fixed' || (entry.type as string) === 'shipping_fixed' ? 'fixed' : 'percent');

    return {
      ok: true,
      discount: {
        code,
        type: resolvedType,
        value: isFreeShipping ? 100 : entry.value,
        target,
      },
    };
  } catch (err) {
    console.error('Discount validation failed:', err);
    return { ok: false, error: 'Could not validate code — please try again' };
  }
}

/** Dollar amount a discount takes off a subtotal or shipping amount (never more than the subtotal). */
export function discountAmountFor(discount: AppliedDiscount | null | undefined, subtotal: number): number {
  if (!discount || !(subtotal > 0)) return 0;
  if (discount.type === 'free_shipping') return subtotal;
  if (discount.type === 'percent') {
    if (discount.value >= 100) return subtotal;
    const amt = subtotal * (discount.value / 100);
    return Math.min(subtotal, Math.round(amt * 100) / 100);
  }
  return Math.min(subtotal, Math.round(discount.value * 100) / 100);
}

export function formatDiscountLabel(discount: AppliedDiscount): string {
  if (discount.type === 'free_shipping' || (discount.target === 'shipping' && discount.type === 'percent' && discount.value >= 100)) {
    return 'Free Shipping';
  }
  if (discount.target === 'shipping') {
    return discount.type === 'percent' ? `${discount.value}% off shipping` : `$${discount.value.toFixed(2)} off shipping`;
  }
  return discount.type === 'percent' ? `${discount.value}% off` : `$${discount.value.toFixed(2)} off`;
}
