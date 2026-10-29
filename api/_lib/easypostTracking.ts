import type { Firestore } from 'firebase-admin/firestore';

/**
 * Shared helpers for EasyPost live tracking.
 *
 * Lookup collection: shipments/{trackingCode} → { orderId, boxId, ... }
 * Orders keep boxes in an array, so this lets the webhook find the right
 * order + box from a tracking number in one read.
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
 * Writes the tracker's latest status onto the matching order box.
 * Returns false when no order is linked to this tracking number.
 */
export async function applyTrackerToOrder(db: Firestore, tracker: any): Promise<boolean> {
  const code = tracker?.tracking_code;
  if (!code) return false;

  const lookupRef = db.collection(SHIPMENTS_COLLECTION).doc(trackingDocId(code));
  const lookup = await lookupRef.get();
  if (!lookup.exists) return false;

  const { orderId, boxId } = lookup.data() as { orderId: string; boxId: string };
  if (!orderId || !boxId) return false;

  const orderRef = db.collection('orders').doc(orderId);
  const summary = summarizeTracker(tracker);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists) return;
    const order = snap.data() || {};
    const boxes: any[] = Array.isArray(order.boxes) ? order.boxes : [];

    let previousStatus: string | undefined;
    let boxName = 'Box';
    let found = false;

    const updatedBoxes = boxes.map((b) => {
      if (b?.id !== boxId) return b;
      // Ignore stale updates if the box's tracking number was changed since
      if (b.trackingNumber && trackingDocId(b.trackingNumber) !== trackingDocId(code)) return b;
      found = true;
      previousStatus = b.trackingStatus;
      boxName = b.name || boxName;
      return { ...b, ...summary };
    });

    if (!found) return;

    const update: Record<string, any> = { boxes: updatedBoxes };

    if (summary.trackingStatus !== previousStatus && ANNOUNCE_STATUSES.has(summary.trackingStatus)) {
      const where = summary.trackingLastEvent?.location ? ` (${summary.trackingLastEvent.location})` : '';
      update.activities = [
        {
          id: `act-${Date.now()}`,
          type: 'system',
          message: `${boxName}: ${summary.trackingStatusLabel}${where} — ${code}`,
          user: 'EasyPost Tracking',
          timestamp: new Date().toISOString(),
        },
        ...(Array.isArray(order.activities) ? order.activities : []),
      ];
    }

    tx.update(orderRef, update);
  });

  await lookupRef.set(
    { status: summary.trackingStatus, updatedAt: summary.trackingUpdatedAt },
    { merge: true },
  );

  return true;
}
