import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

// Discount codes live in settings/discounts (public-readable, admin-writable):
// { codes: { [CODE]: { type, value, active, expires?, note? } } }
// Managed from Settings → Discount Codes; redeemable on the public /start
// checkout and the portal payment modal.

export interface DiscountCodeEntry {
  type: 'percent' | 'fixed';
  value: number;
  active: boolean;
  expires?: string; // YYYY-MM-DD; valid through end of that day
  note?: string;
  createdAt?: number;
}

export interface AppliedDiscount {
  code: string;
  type: 'percent' | 'fixed';
  value: number;
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
    if (!entry) return { ok: false, error: 'Invalid code' };
    if (!entry.active) return { ok: false, error: 'This code is no longer active' };
    if (entry.expires) {
      const exp = new Date(`${entry.expires}T23:59:59`);
      if (!isNaN(exp.getTime()) && exp.getTime() < Date.now()) {
        return { ok: false, error: 'This code has expired' };
      }
    }
    if (!(entry.value > 0)) return { ok: false, error: 'Invalid code' };
    return {
      ok: true,
      discount: { code, type: entry.type === 'fixed' ? 'fixed' : 'percent', value: entry.value },
    };
  } catch (err) {
    console.error('Discount validation failed:', err);
    return { ok: false, error: 'Could not validate code — please try again' };
  }
}

/** Dollar amount a discount takes off a subtotal (never more than the subtotal). */
export function discountAmountFor(discount: AppliedDiscount | null | undefined, subtotal: number): number {
  if (!discount || !(subtotal > 0)) return 0;
  const amt = discount.type === 'percent' ? subtotal * (discount.value / 100) : discount.value;
  return Math.min(subtotal, Math.round(amt * 100) / 100);
}

export function formatDiscountLabel(discount: AppliedDiscount): string {
  return discount.type === 'percent' ? `${discount.value}% off` : `$${discount.value.toFixed(2)} off`;
}
