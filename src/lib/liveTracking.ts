import { useEffect, useState } from 'react';
import { arrayUnion, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

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

export function normalizeTrackingCode(code?: string | null): string {
  return String(code || '')
    .replace(/\s+/g, '')
    .replace(/\//g, '_')
    .toUpperCase();
}

const STATUS_RANK: Record<string, number> = {
  unknown: 0,
  pre_transit: 1,
  in_transit: 2,
  out_for_delivery: 3,
  available_for_pickup: 3,
  failure: 3,
  return_to_sender: 4,
  cancelled: 4,
  delivered: 5,
};

/**
 * Chooses the most up-to-date tracking object between two candidates for the same tracking number.
 * Always prefers 'delivered' over non-delivered, then higher status rank / newer timestamp.
 */
export function pickBestTracking(a?: any, b?: any): any {
  const aStatus = a?.trackingStatus;
  const bStatus = b?.trackingStatus;
  if (!aStatus && !bStatus) return a || b;
  if (aStatus && !bStatus) return a;
  if (!aStatus && bStatus) return b;
  if (aStatus === 'delivered' && bStatus !== 'delivered') return a;
  if (bStatus === 'delivered' && aStatus !== 'delivered') return b;

  const aRank = STATUS_RANK[aStatus] ?? 0;
  const bRank = STATUS_RANK[bStatus] ?? 0;
  if (aRank !== bRank) return aRank > bRank ? a : b;

  const aTime = String(a?.trackingLastEvent?.datetime || a?.trackingUpdatedAt || '');
  const bTime = String(b?.trackingLastEvent?.datetime || b?.trackingUpdatedAt || '');
  if (bTime > aTime) return b;
  return a;
}

const liveTrackingCache = new Map<string, any>();
const cacheListeners = new Set<() => void>();

function notifyTrackingListeners() {
  cacheListeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // ignore listener errors
    }
  });
}

export function getCachedTracking(trackingNumber?: string | null): any | undefined {
  const key = normalizeTrackingCode(trackingNumber);
  if (!key) return undefined;
  return liveTrackingCache.get(key);
}

export function setCachedTracking(trackingNumber: string, summary: any) {
  const key = normalizeTrackingCode(trackingNumber);
  if (!key || !summary?.trackingStatus) return;
  const prev = liveTrackingCache.get(key);
  const next = pickBestTracking(summary, prev);
  liveTrackingCache.set(key, next);
  notifyTrackingListeners();
}

/**
 * Hook that returns the most recent tracking state for a tracking number,
 * combining any saved Firestore tracking object with live EasyPost responses.
 */
export function useLiveTracking(trackingNumber?: string | null, savedTracking?: any): any {
  const [, setTick] = useState(0);
  useEffect(() => {
    const onUpdate = () => setTick((t) => t + 1);
    cacheListeners.add(onUpdate);
    return () => {
      cacheListeners.delete(onUpdate);
    };
  }, []);
  const cached = getCachedTracking(trackingNumber);
  return pickBestTracking(cached, savedTracking);
}

function toYmdFromIso(dateStr?: string | null): string {
  if (!dateStr) return '';
  const trimmed = String(dateStr).trim();
  const direct = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (direct) return direct[1];
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getUTCFullYear();
    const m = String(parsed.getUTCMonth() + 1).padStart(2, '0');
    const d = String(parsed.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return '';
}

function formatYmdToShortDate(ymd?: string): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return '';
  const [y, m, d] = ymd.split('-');
  return `${m}/${d}/${y.substring(2)}`;
}

async function syncTrackingToClientFirestore(
  payload: Record<string, any>,
  trackingCode: string,
  summary: Record<string, any>
) {
  const normCode = normalizeTrackingCode(trackingCode);
  if (!normCode || !summary?.trackingStatus) return;
  const sameCode = (n?: string | null) => Boolean(n) && normalizeTrackingCode(n) === normCode;
  const needsUpdate = (existing?: any) => {
    if (!existing || existing.trackingStatus !== summary.trackingStatus) return true;
    const prevLast = existing.trackingLastEvent?.datetime || '';
    const nextLast = summary.trackingLastEvent?.datetime || '';
    return Boolean(nextLast && nextLast !== prevLast);
  };

  const orderIds = new Set<string>();
  const shipmentTargets: { orderId: string; kind: 'box' | 'item'; id: string }[] = [];
  if (payload.orderId) {
    orderIds.add(String(payload.orderId));
    if (payload.boxId) {
      shipmentTargets.push({ orderId: String(payload.orderId), kind: 'box', id: String(payload.boxId) });
    }
  }
  if (Array.isArray(payload.items)) {
    payload.items.forEach((r: any) => {
      if (r?.orderId) {
        orderIds.add(String(r.orderId));
        if (r?.itemId) {
          shipmentTargets.push({ orderId: String(r.orderId), kind: 'item', id: String(r.itemId) });
        }
      }
    });
  }

  try {
    await setDoc(
      doc(db, 'shipments', normCode),
      {
        trackingCode,
        carrier: summary.trackingCarrierDetected || null,
        easyPostTrackerId: summary.easyPostTrackerId || null,
        mode: summary.trackingMode || 'production',
        status: summary.trackingStatus,
        updatedAt: summary.trackingUpdatedAt || new Date().toISOString(),
        ...(shipmentTargets.length ? { targets: arrayUnion(...shipmentTargets) } : {}),
      },
      { merge: true }
    );
  } catch {
    // ignore if shipments collection write is restricted
  }

  for (const orderId of orderIds) {
    try {
      const orderRef = doc(db, 'orders', orderId);
      const snap = await getDoc(orderRef);
      if (!snap.exists()) continue;
      const order: Record<string, any> = snap.data() || {};
      const update: Record<string, any> = {};

      if (Array.isArray(order.boxes)) {
        let boxesChanged = false;
        const nextBoxes = order.boxes.map((b: any) => {
          if (!sameCode(b?.trackingNumber)) return b;
          if (!needsUpdate(b)) return b;
          boxesChanged = true;
          const preservedEstDelivery =
            summary.trackingEstDelivery || b.trackingEstDelivery || b.estArrival || null;
          const nextEstArrival = summary.trackingEstDelivery
            ? toYmdFromIso(summary.trackingEstDelivery) || b.estArrival
            : b.estArrival;
          return {
            ...b,
            ...summary,
            trackingEstDelivery: preservedEstDelivery,
            ...(nextEstArrival ? { estArrival: nextEstArrival } : {}),
          };
        });

        if (boxesChanged) {
          update.boxes = nextBoxes;
          const trackedBoxes = nextBoxes.filter(
            (b: any) =>
              b &&
              b.trackingCarrier !== 'Pickup' &&
              Boolean(b.labelUrl || b.trackingEstDelivery || b.easyPostTrackerId || b.estArrival || b.trackingStatus === 'delivered')
          );
          let latestExpectedYmd = '';
          let latestDeliveredIso = '';
          let deliveredCount = 0;
          for (const b of trackedBoxes) {
            if (b.trackingStatus === 'delivered') {
              deliveredCount++;
              const events: any[] = Array.isArray(b.trackingEvents) ? b.trackingEvents : [];
              const delivEv = events.find((ev: any) => ev?.status === 'delivered' && ev?.datetime);
              const delivIso =
                delivEv?.datetime ||
                b.trackingLastEvent?.datetime ||
                b.trackingEstDelivery ||
                b.estArrival ||
                b.trackingUpdatedAt;
              if (delivIso) {
                if (!latestDeliveredIso || String(delivIso) > latestDeliveredIso) {
                  latestDeliveredIso = String(delivIso);
                }
                const ymd = toYmdFromIso(delivIso);
                if (ymd && (!latestExpectedYmd || ymd > latestExpectedYmd)) {
                  latestExpectedYmd = ymd;
                }
              }
            } else {
              const ymd = toYmdFromIso(b.trackingEstDelivery || b.estArrival);
              if (ymd && (!latestExpectedYmd || ymd > latestExpectedYmd)) {
                latestExpectedYmd = ymd;
              }
            }
          }
          if (latestExpectedYmd) {
            const allNonPickup = nextBoxes.filter((b: any) => b && b.trackingCarrier !== 'Pickup');
            const allDelivered =
              allNonPickup.length > 0 &&
              deliveredCount === allNonPickup.length &&
              trackedBoxes.length === allNonPickup.length;
            const nextMilestones: Record<string, any> = {
              ...(order.timelineMilestones && typeof order.timelineMilestones === 'object'
                ? order.timelineMilestones
                : {}),
            };
            const nextReceived: Record<string, any> = {
              ...(nextMilestones.Received && typeof nextMilestones.Received === 'object'
                ? nextMilestones.Received
                : {}),
              expectedDate: latestExpectedYmd,
            };
            delete nextReceived.manualOverrideAt;
            if (allDelivered && latestDeliveredIso) {
              nextReceived.completedAt = latestDeliveredIso;
              if (typeof order.statusIndex === 'number' && (order.statusIndex === 6 || order.statusIndex === 7)) {
                update.statusIndex = 8;
                update.status = 'Received';
              }
            }
            nextMilestones.Received = nextReceived;
            update.timelineMilestones = nextMilestones;
            const shortDate = formatYmdToShortDate(latestExpectedYmd);
            if (shortDate) {
              update.date = shortDate;
            }
          }
        }
      }

      if (Array.isArray(order.items)) {
        let itemsChanged = false;
        const nextItems = order.items.map((it: any) => {
          let itemChanged = false;
          const nextItem: Record<string, any> = { ...it };

          if (sameCode(it.sourcingTrackingNumber) && needsUpdate(it.sourcingTracking)) {
            itemChanged = true;
            nextItem.sourcingTracking = summary;
          }

          if (it.sourcingTrackingBySize && typeof it.sourcingTrackingBySize === 'object') {
            const nextBySize: Record<string, any> = { ...it.sourcingTrackingBySize };
            let bySizeChanged = false;
            for (const [szKey, szVal] of Object.entries(nextBySize)) {
              if (!szVal || typeof szVal !== 'object') continue;
              let entryChanged = false;
              const nextEntry: Record<string, any> = { ...szVal };
              if (sameCode(szVal.trackingNumber) && needsUpdate(szVal.tracking)) {
                entryChanged = true;
                nextEntry.tracking = summary;
              }
              if (Array.isArray(szVal.extraTrackings)) {
                let extraChanged = false;
                const nextExtras = szVal.extraTrackings.map((et: any) => {
                  if (!sameCode(et?.trackingNumber) || !needsUpdate(et?.tracking)) return et;
                  extraChanged = true;
                  return { ...et, tracking: summary };
                });
                if (extraChanged) {
                  entryChanged = true;
                  nextEntry.extraTrackings = nextExtras;
                }
              }
              if (entryChanged) {
                bySizeChanged = true;
                nextBySize[szKey] = nextEntry;
              }
            }
            if (bySizeChanged) {
              itemChanged = true;
              nextItem.sourcingTrackingBySize = nextBySize;
              if (!nextItem.sourcingTrackingNumber || sameCode(nextItem.sourcingTrackingNumber)) {
                nextItem.sourcingTracking = summary;
              }
            }
          }

          if (Array.isArray(it.sourcingTrackings)) {
            let listChanged = false;
            const nextList = it.sourcingTrackings.map((t: any) => {
              if (!sameCode(t?.trackingNumber) || !needsUpdate(t?.tracking)) return t;
              listChanged = true;
              return { ...t, tracking: summary };
            });
            if (listChanged) {
              itemChanged = true;
              nextItem.sourcingTrackings = nextList;
              if (!nextItem.sourcingTrackingNumber || sameCode(nextItem.sourcingTrackingNumber)) {
                nextItem.sourcingTracking = summary;
              }
            }
          }

          if (itemChanged) {
            itemsChanged = true;
            return nextItem;
          }
          return it;
        });

        if (itemsChanged) {
          update.items = nextItems;
        }
      }

      if (Object.keys(update).length > 0) {
        await updateDoc(orderRef, update);
      }
    } catch (err) {
      console.warn('Could not sync tracking update to order in client Firestore:', err);
    }
  }
}

/**
 * Registers a box's tracking number with EasyPost so status updates flow in.
 * Safe to call more than once — EasyPost reuses the existing tracker.
 * The box must already be saved with its trackingNumber.
 */
export function startLiveTracking(orderId: string, boxId: string, isTest = false, trackingNumber?: string, carrier?: string) {
  return requestTracking({
    orderId,
    boxId,
    isTest,
    ...(trackingNumber ? { trackingNumber } : {}),
    ...(carrier ? { carrier } : {}),
  });
}

/**
 * Same as startLiveTracking, for garments coming from a supplier (Sourcing tab).
 * Items must already be saved with their sourcingTrackingNumber.
 */
export function startSourcingTracking(
  items: { orderId: string; itemId: string; size?: string }[],
  trackingNumber?: string
) {
  return requestTracking({ items, ...(trackingNumber ? { trackingNumber } : {}) });
}

async function requestTracking(payload: Record<string, unknown>): Promise<{ ok: boolean; error?: string; tracking?: any }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch('/api/easypost/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      console.warn('Live tracking not started:', data.error || res.status);
      return { ok: false, error: data.error || `Request failed (${res.status})` };
    }
    const code = String(data.trackingCode || payload.trackingNumber || '').trim();
    const summary: Record<string, any> = {
      easyPostTrackerId: data.easyPostTrackerId || null,
      trackingStatus: data.trackingStatus || 'unknown',
      trackingStatusLabel: data.trackingStatusLabel || 'Awaiting Scan',
      trackingStatusDetail: data.trackingStatusDetail || null,
      trackingEstDelivery: data.trackingEstDelivery || null,
      trackingPublicUrl: data.trackingPublicUrl || null,
      trackingEvents: Array.isArray(data.trackingEvents) ? data.trackingEvents : [],
      trackingLastEvent: data.trackingLastEvent || null,
      trackingMode: data.trackingMode || null,
      trackingUpdatedAt: data.trackingUpdatedAt || new Date().toISOString(),
      ...(data.carrier ? { trackingCarrierDetected: data.carrier } : {}),
    };
    if (code && summary.trackingStatus) {
      setCachedTracking(code, summary);
      void syncTrackingToClientFirestore(payload as Record<string, any>, code, summary);
    }
    return { ok: true, tracking: summary };
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.warn('Live tracking not started:', err);
    return {
      ok: false,
      error: err?.name === 'AbortError' ? 'Carrier connection timed out' : err?.message || 'Network error',
    };
  }
}

const autoStartAttempts = new Map<string, Promise<{ ok: boolean; error?: string; tracking?: any }>>();

/**
 * Starts live tracking automatically, at most once per key per page load,
 * so a list of chips rendering (and re-rendering) doesn't spam the server.
 * Returns the same result to every caller that shares the key.
 */
export function autoStartOnce(key: string, start: () => Promise<{ ok: boolean; error?: string; tracking?: any }>) {
  const existing = autoStartAttempts.get(key);
  if (existing) return existing;
  const attempt = start().then((res) => {
    if (!res.ok) {
      autoStartAttempts.delete(key);
    }
    return res;
  });
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
  const trimmed = String(iso).trim();
  const dateOnlyMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.\d+)?Z)?$/i);
  const d = dateOnlyMatch
    ? new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]))
    : new Date(trimmed);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function formatEventTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
