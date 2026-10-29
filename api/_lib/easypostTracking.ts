import type { Firestore } from '@google-cloud/firestore';

/**
 * Shared helpers for EasyPost live tracking.
 *
 * Lookup collection: shipments/{trackingCode} → { targets: [{ orderId, kind, id }], ... }
 *   kind "box"     → order.boxes[] (outgoing shipments to the customer)
 *   kind "inbound" → order.inboundShipments[] (garments coming from a supplier)
 * Orders keep these in arrays, so this lets the webhook find every entry
 * linked to a tracking number in one read. One supplier package can feed
 * several customer orders, so a code can have many targets.
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

/** What a tracking number is attached to: an outgoing box or an incoming garment package. */
export type TrackingTarget = { orderId: string; kind: 'box' | 'inbound'; id: string };

const ARRAY_FIELD: Record<TrackingTarget['kind'], 'boxes' | 'inboundShipments'> = {
  box: 'boxes',
  inbound: 'inboundShipments',
};

/** Reads the targets from a shipments/{code} doc (also accepts the older { orderId, boxId } shape). */
export function targetsFromLookup(data: any): TrackingTarget[] {
  const list: TrackingTarget[] = Array.isArray(data?.targets) ? data.targets : [];
  if (data?.orderId && data?.boxId && !list.some((t) => t.kind === 'box' && t.id === data.boxId)) {
    list.push({ orderId: data.orderId, kind: 'box', id: data.boxId });
  }
  return list.filter((t) => t?.orderId && t?.id && (t.kind === 'box' || t.kind === 'inbound'));
}

function entryLabel(kind: TrackingTarget['kind'], entry: any): string {
  if (kind === 'box') return entry?.name || 'Box';
  const supplier = entry?.supplier ? String(entry.supplier) : 'Supplier';
  const po = entry?.supplierOrderNumber ? ` #${entry.supplierOrderNumber}` : '';
  return `Incoming garments (${supplier}${po})`;
}

async function applyToTarget(db: Firestore, target: TrackingTarget, code: string, summary: ReturnType<typeof summarizeTracker>, carrier?: string) {
  const orderRef = db.collection('orders').doc(target.orderId);
  const field = ARRAY_FIELD[target.kind];
  let found = false;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists) return;
    const order = snap.data() || {};
    const entries: any[] = Array.isArray(order[field]) ? order[field] : [];

    let previousStatus: string | undefined;
    let label = '';

    const updated = entries.map((e) => {
      if (e?.id !== target.id) return e;
      // Ignore stale updates if this entry's tracking number was changed since
      if (e.trackingNumber && trackingDocId(e.trackingNumber) !== trackingDocId(code)) return e;
      found = true;
      previousStatus = e.trackingStatus;
      label = entryLabel(target.kind, e);
      return { ...e, ...summary, ...(carrier && !e.trackingCarrier ? { trackingCarrierDetected: carrier } : {}) };
    });

    if (!found) return;

    const update: Record<string, any> = { [field]: updated };

    if (summary.trackingStatus !== previousStatus && ANNOUNCE_STATUSES.has(summary.trackingStatus)) {
      const where = summary.trackingLastEvent?.location ? ` (${summary.trackingLastEvent.location})` : '';
      update.activities = [
        {
          id: `act-${Date.now()}-${target.kind}-${target.id}`,
          type: 'system',
          message: `${label}: ${summary.trackingStatusLabel}${where} — ${code}`,
          user: 'EasyPost Tracking',
          timestamp: new Date().toISOString(),
        },
        ...(Array.isArray(order.activities) ? order.activities : []),
      ];
    }

    tx.update(orderRef, update);
  });

  return found;
}

/**
 * Writes the tracker's latest status onto every order box / incoming
 * garment package linked to this tracking number.
 * Returns how many entries were updated (0 = nothing linked).
 */
export async function applyTrackerToOrder(db: Firestore, tracker: any): Promise<number> {
  const code = tracker?.tracking_code;
  if (!code) return 0;

  const lookupRef = db.collection(SHIPMENTS_COLLECTION).doc(trackingDocId(code));
  const lookup = await lookupRef.get();
  if (!lookup.exists) return 0;

  const targets = targetsFromLookup(lookup.data());
  if (!targets.length) return 0;

  const summary = summarizeTracker(tracker);
  let matched = 0;
  for (const target of targets) {
    if (await applyToTarget(db, target, code, summary, tracker?.carrier)) matched++;
  }

  await lookupRef.set(
    { status: summary.trackingStatus, updatedAt: summary.trackingUpdatedAt },
    { merge: true },
  );

  return matched;
}
