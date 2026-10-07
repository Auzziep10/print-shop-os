import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function getTrackingLink(carrier?: string, trackingNumber?: string) {
  if (!carrier || !trackingNumber) return null;
  const num = encodeURIComponent(trackingNumber.trim());
  switch (carrier.toUpperCase()) {
    case 'UPS': return `https://www.ups.com/track?tracknum=${num}`;
    case 'FEDEX': return `https://www.fedex.com/fedextrack/?trknbr=${num}`;
    case 'USPS': return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${num}`;
    case 'DHL': return `https://www.dhl.com/us-en/home/tracking/tracking-express.html?submit=1&tracking-id=${num}`;
    default: return `https://duckduckgo.com/?q=${encodeURIComponent(carrier)}+tracking+${num}`;
  }
}

export function normalizeUser(rawUser: string, allUsersList: any[] = []): string {
  if (!rawUser) return 'Unknown';
    
  const lowerName = rawUser.toLowerCase();
  if (lowerName === 'vanessa' || lowerName === 'vanessa garcia' || lowerName.includes('vanessa')) {
      return 'Vanessa Miller';
  }

  if (allUsersList && allUsersList.length > 0) {
      const rawPrefix = rawUser.split('@')[0].toLowerCase();
      const dbMatch = allUsersList.find(u => {
          const uStr = (u.email || '').toLowerCase();
          return uStr === lowerName || uStr.startsWith(rawPrefix + '@');
      });
      if (dbMatch && dbMatch.name) return dbMatch.name;
  }
  
  return rawUser.split('@')[0];
}

export function formatDisplayDate(dateStr: string | undefined | null): string {
  if (!dateStr) return '';
  try {
    let parsedDate: Date;
    const str = dateStr.trim();
    if (str.includes('/')) {
      const parts = str.split('/');
      if (parts.length === 3) {
        let month = parseInt(parts[0], 10) - 1;
        let day = parseInt(parts[1], 10);
        let year = parseInt(parts[2], 10);
        if (year < 100) year += 2000;
        parsedDate = new Date(year, month, day);
      } else {
        parsedDate = new Date(str);
      }
    } else if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      const [year, month, day] = str.slice(0, 10).split('-').map(Number);
      parsedDate = new Date(year, month - 1, day);
    } else {
      parsedDate = new Date(str);
    }

    if (isNaN(parsedDate.getTime())) return dateStr;

    return parsedDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  } catch {
    return dateStr;
  }
}

export function isPlacedOrder(order: any): boolean {
  if (!order) return false;
  // If explicitly marked as paid
  if (order.paymentStatus === 'paid' || order.paidAt) return true;
  // Status index > 2 represents Approved through Received/Live (quotes are 0, 1, 2)
  if (typeof order.statusIndex === 'number') {
    return order.statusIndex > 2;
  }
  const statusLower = (order.status || '').toLowerCase();
  if (['approved', 'shopping', 'ordered', 'processing', 'shipped', 'inventory', 'live', 'received', 'paid'].includes(statusLower)) {
    return true;
  }
  return false;
}

export function calculateOrderFinalTotal(order: any): number {
  if (!order) return 0;

  // 1. Explicit numeric total saved on the order document
  if (typeof order.total === 'number') {
    return Math.max(0, order.total);
  }
  if (typeof order.calculatedTotal === 'number') {
    return Math.max(0, order.calculatedTotal);
  }
  if (order.totalFormatted) {
    const parsed = parseFloat(String(order.totalFormatted).replace(/[^0-9.-]/g, ''));
    if (!isNaN(parsed)) return Math.max(0, parsed);
  }

  // 2. Compute from line items and discounts
  if (order.items && Array.isArray(order.items)) {
    const rawItemsTotal = order.items.reduce((acc: number, i: any) => {
      const sizeSum = i.sizes ? Object.values(i.sizes).reduce((sum: number, val: any) => sum + (parseInt(val) || 0), 0) : 0;
      const safeQty = sizeSum > 0 ? sizeSum : (i.qty ? parseInt(i.qty.toString().replace(/[^0-9]/g, '')) || 0 : (i.quantity ? parseInt(i.quantity.toString().replace(/[^0-9]/g, '')) || 0 : 0));

      let safePriceNum = 0;
      if (i.price !== undefined && i.price !== null) {
        const pString = i.price.toString().replace(/[^0-9.-]/g, '');
        if (pString !== '') safePriceNum = parseFloat(pString);
      }

      if (safeQty > 0 && safePriceNum !== 0) {
        return acc + (safeQty * safePriceNum);
      }
      const priceMatch = (i.total || '$0').toString().replace(/[^0-9.-]/g, '');
      return acc + (parseFloat(priceMatch) || 0);
    }, 0);

    const discountAmt = parseFloat(order.discountAmount || 0) || 0;
    return Math.max(0, rawItemsTotal - discountAmt);
  }

  return 0;
}
