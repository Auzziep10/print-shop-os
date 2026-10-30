/**
 * Live package tracking (EasyPost trackers + webhook).
 * Server side lives in api/easypost/track.ts and api/easypost/webhook.ts.
 */

/** Fields the webhook writes onto a box. Strip these when a tracking number is removed or changed. */
export const LIVE_TRACKING_FIELDS = [
  'easyPostTrackerId',
  'trackingStatus',
  'trackingStatusLabel',
  'trackingStatusDetail',
  'trackingEstDelivery',
  'trackingPublicUrl',
  'trackingEvents',
  'trackingLastEvent',
  'trackingMode',
  'trackingUpdatedAt',
  'trackingCarrierDetected',
] as const;

export function withoutLiveTracking<T extends Record<string, any>>(box: T): T {
  const copy: Record<string, any> = { ...box };
  for (const f of LIVE_TRACKING_FIELDS) delete copy[f];
  return copy as T;
}

/**
 * Registers a box's tracking number with EasyPost so status updates flow in.
 * Safe to call more than once — EasyPost reuses the existing tracker.
 * The box must already be saved with its trackingNumber.
 */
export function startLiveTracking(orderId: string, boxId: string, isTest = false) {
  return requestTracking({ orderId, boxId, isTest });
}

/**
 * Same as startLiveTracking, for garments coming from a supplier (Sourcing tab).
 * Items must already be saved with their sourcingTrackingNumber.
 */
export function startSourcingTracking(items: { orderId: string; itemId: string }[]) {
  return requestTracking({ items });
}

async function requestTracking(payload: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/easypost/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      console.warn('Live tracking not started:', data.error || res.status);
      return { ok: false, error: data.error || `Request failed (${res.status})` };
    }
    return { ok: true };
  } catch (err: any) {
    console.warn('Live tracking not started:', err);
    return { ok: false, error: err?.message || 'Network error' };
  }
}

const autoStartAttempts = new Map<string, Promise<{ ok: boolean; error?: string }>>();

/**
 * Starts live tracking automatically, at most once per key per page load,
 * so a list of chips rendering (and re-rendering) doesn't spam the server.
 * Returns the same result to every caller that shares the key.
 */
export function autoStartOnce(key: string, start: () => Promise<{ ok: boolean; error?: string }>) {
  const existing = autoStartAttempts.get(key);
  if (existing) return existing;
  const attempt = start();
  autoStartAttempts.set(key, attempt);
  return attempt;
}

export type TrackingTone = 'neutral' | 'blue' | 'amber' | 'green' | 'red';

export function trackingTone(status?: string): TrackingTone {
  switch (status) {
    case 'delivered':
      return 'green';
    case 'out_for_delivery':
    case 'available_for_pickup':
      return 'amber';
    case 'in_transit':
      return 'blue';
    case 'failure':
    case 'return_to_sender':
    case 'error':
    case 'cancelled':
      return 'red';
    default:
      return 'neutral';
  }
}

export function formatEstDelivery(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function formatEventTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
