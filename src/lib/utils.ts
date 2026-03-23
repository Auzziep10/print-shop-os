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
