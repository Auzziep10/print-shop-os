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
