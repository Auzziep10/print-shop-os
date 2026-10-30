import type { Firestore } from '@google-cloud/firestore';

/**
 * Shared helpers for EasyPost live tracking.
 *
 * Lookup collection: shipments/{trackingCode} → { targets: [{ orderId, kind, id }], ... }
 *   kind "box"  → order.boxes[] (outgoing shipments to the customer)
 *   kind "item" → order.items[] (garments coming from a supplier, Sourcing tab)
 * Orders keep these in arrays, so this lets the webhook find every entry
 * linked to a tracking number in one read. One supplier package can feed
 * several customer orders and garments, so a code can have many targets.
 */

export const SHIPMENTS_COLLECTION = 'shipments';

const STATUS_LABELS: Record<string, string> = {
  pre_transit: 'Label Created',
  in_transit: 'In Transit',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  available_for_pickup: 'Ready for Pickup',
  return_to_sender: 'Returning to Sender',
  failure: 'Delivery Problem',
  cancelled: 'Cancelled',
  error: 'Tracking Error',
  unknown: 'Awaiting Scan',
};

export function statusLabel(status?: string): string {
  return STATUS_LABELS[status || 'unknown'] || 'Awaiting Scan';
}

export function trackingDocId(trackingCode: string): string {
  // Firestore doc IDs can't contain "/" — tracking codes are alphanumeric anyway
  return trackingCode.replace(/\s+/g, '').replace(/\//g, '_').toUpperCase();
}

/** Map an EasyPost carrier/dropdown value to the carrier string EasyPost expects. */
export function normalizeEasyPostCarrier(carrier?: string): string | undefined {
  const c = (carrier || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (!c) return undefined;
  if (c === 'DHL') return 'DHLExpress';
  if (c === 'FEDEX') return 'FedEx';
  if (c === 'UPS') return 'UPS';
  if (c === 'USPS') return 'USPS';
  // Already an EasyPost carrier code (e.g. "UPSDAP", "FedExDefault") — pass through as-is
  return carrier;
}

export function easyPostKey(isTest: boolean): string {
  return ((isTest ? process.env.EASYPOST_TEST_KEY : process.env.EASYPOST_PROD_KEY) || '').trim();
}

function formatLocation(loc: any): string {
  if (!loc) return '';
  return [loc.city, loc.state, loc.country && loc.country !== 'US' ? loc.country : '']
    .filter(Boolean)
    .join(', ');
}

/** The tracking fields saved onto an order box. */
export function summarizeTracker(tracker: any) {
  const details: any[] = Array.isArray(tracker?.tracking_details) ? tracker.tracking_details : [];
  const events = details
    .map((d) => ({
      status: d.status || '',
      message: d.message || d.description || '',
      datetime: d.datetime || '',
      location: formatLocation(d.tracking_location),
    }))
    .sort((a, b) => (b.datetime || '').localeCompare(a.datetime || ''))
    .slice(0, 30);

  return {
    easyPostTrackerId: tracker?.id || null,
    trackingStatus: tracker?.status || 'unknown',
    trackingStatusLabel: statusLabel(tracker?.status),
    trackingStatusDetail: tracker?.status_detail || null,
    trackingEstDelivery: tracker?.est_delivery_date || null,
    trackingPublicUrl: tracker?.public_url || null,
    trackingEvents: events,
    trackingLastEvent: events[0] || null,
    trackingMode: tracker?.mode || null,
    trackingUpdatedAt: new Date().toISOString(),
  };
}

const ANNOUNCE_STATUSES = new Set([
  'in_transit',
  'out_for_delivery',
  'delivered',
  'available_for_pickup',
  'return_to_sender',
  'failure',
]);

/**
 * What a tracking number is attached to:
 *   "box"  → order.boxes[]  (outgoing shipment to the customer; status saved on the box)
 *   "item" → order.items[]  (garments coming from a supplier, entered in the Sourcing tab;
 *            number in item.sourcingTrackingNumber, status saved in item.sourcingTracking)
 */
export type TrackingTarget = { orderId: string; kind: 'box' | 'item'; id: string };

/** Reads the targets from a shipments/{code} doc (also accepts the older { orderId, boxId } shape). */
export function targetsFromLookup(data: any): TrackingTarget[] {
  const list: TrackingTarget[] = Array.isArray(data?.targets) ? [...data.targets] : [];
  if (data?.orderId && data?.boxId && !list.some((t) => t.kind === 'box' && t.id === data.boxId)) {
    list.push({ orderId: data.orderId, kind: 'box', id: data.boxId });
  }
  return list.filter((t) => t?.orderId && t?.id && (t.kind === 'box' || t.kind === 'item'));
}

type Summary = ReturnType<typeof summarizeTracker>;

/** Updates every linked box/item on one order in a single transaction. Returns entries updated. */
async function applyToOrder(db: Firestore, orderId: string, targets: TrackingTarget[], code: string, summary: Summary, carrier?: string) {
  const orderRef = db.collection('orders').doc(orderId);
  const boxIds = new Set(targets.filter((t) => t.kind === 'box').map((t) => t.id));
  const itemIds = new Set(targets.filter((t) => t.kind === 'item').map((t) => t.id));
  const sameCode = (n?: string) => Boolean(n) && trackingDocId(String(n)) === trackingDocId(code);
  let updatedCount = 0;

  await db.runTransaction(async (tx) => {
    updatedCount = 0;
    const snap = await tx.get(orderRef);
    if (!snap.exists) return;
    const order = snap.data() || {};
    const update: Record<string, any> = {};
    const announce: string[] = [];
    const announceItems: string[] = [];
    const isAnnounce = (prev?: string) => summary.trackingStatus !== prev && ANNOUNCE_STATUSES.has(summary.trackingStatus);

    if (boxIds.size && Array.isArray(order.boxes)) {
      let changed = false;
      update.boxes = order.boxes.map((b: any) => {
        // Skip if the box's tracking number was changed since this was linked
        if (!boxIds.has(b?.id) || !sameCode(b.trackingNumber)) return b;
        changed = true;
        updatedCount++;
        if (isAnnounce(b.trackingStatus)) announce.push(b.name || 'Box');
        return { ...b, ...summary };
      });
      if (!changed) delete update.boxes;
    }

    if (itemIds.size && Array.isArray(order.items)) {
      let changed = false;
      update.items = order.items.map((it: any) => {
        if (!itemIds.has(String(it?.id)) || !sameCode(it.sourcingTrackingNumber)) return it;
        changed = true;
        updatedCount++;
        if (isAnnounce(it.sourcingTracking?.trackingStatus)) announceItems.push(it.style || 'garments');
        return { ...it, sourcingTracking: { ...summary, ...(carrier ? { trackingCarrierDetected: carrier } : {}) } };
      });
      if (!changed) delete update.items;
    }

    if (!updatedCount) return;

    if (announceItems.length) announce.push(`Supplier package (${Array.from(new Set(announceItems)).join(', ')})`);

    if (announce.length) {
      const where = summary.trackingLastEvent?.location ? ` (${summary.trackingLastEvent.location})` : '';
      update.activities = [
        {
          id: `act-${Date.now()}-${trackingDocId(code)}`,
          type: 'system',
          message: `${Array.from(new Set(announce)).join(', ')}: ${summary.trackingStatusLabel}${where} — ${code}`,
          user: 'EasyPost Tracking',
          timestamp: new Date().toISOString(),
        },
        ...(Array.isArray(order.activities) ? order.activities : []),
      ];
    }

    tx.update(orderRef, update);
  });

  return updatedCount;
}

/**
 * Writes the tracker's latest status onto every order box / sourced garment
 * linked to this tracking number. Returns how many entries were updated.
 */
export async function applyTrackerToOrder(db: Firestore, tracker: any): Promise<number> {
  const code = tracker?.tracking_code;
  if (!code) return 0;

  const lookupRef = db.collection(SHIPMENTS_COLLECTION).doc(trackingDocId(code));
  const lookup = await lookupRef.get();
  if (!lookup.exists) return 0;

  const targets = targetsFromLookup(lookup.data());
  if (!targets.length) return 0;

  const byOrder = new Map<string, TrackingTarget[]>();
  targets.forEach((t) => byOrder.set(t.orderId, [...(byOrder.get(t.orderId) || []), t]));

  const summary = summarizeTracker(tracker);
  let matched = 0;
  for (const [orderId, list] of byOrder) {
    matched += await applyToOrder(db, orderId, list, code, summary, tracker?.carrier);
  }

  await lookupRef.set(
    { status: summary.trackingStatus, updatedAt: summary.trackingUpdatedAt },
    { merge: true },
  );

  return matched;
}
