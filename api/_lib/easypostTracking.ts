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
export function normalizeEasyPostCarrier(carrier?: string, trackingCode?: string): string | undefined {
  const c = (carrier || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (c === 'DHL') return 'DHLExpress';
  if (c === 'FEDEX') return 'FedEx';
  if (c === 'UPS') return 'UPS';
  if (c === 'USPS') return 'USPS';
  if (c) return carrier;

  const cleanCode = String(trackingCode || '').replace(/\s+/g, '').toUpperCase();
  if (/^1Z[0-9A-Z]{16}$/i.test(cleanCode)) return 'UPS';
  if (/^(94|93|92|95)\d{18,24}$/.test(cleanCode)) return 'USPS';
  if (/^\d{12}(\d{3})?$/.test(cleanCode)) return 'FedEx';
  return undefined;
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

export function inferTrackingEventStatus(status?: string, message?: string, statusDetail?: string): string {
  const s = String(status || '').trim().toLowerCase();
  const detail = String(statusDetail || '').trim().toLowerCase();
  const msg = String(message || '').trim();

  if (s === 'delivered' || detail === 'delivered' || /^delivered\b/i.test(msg)) {
    return 'delivered';
  }
  if (s === 'return_to_sender' || /return(ed|ing)? to sender/i.test(msg)) {
    return 'return_to_sender';
  }
  if (
    s === 'out_for_delivery' ||
    detail === 'out_for_delivery' ||
    /out for delivery|on vehicle for delivery|loaded on delivery vehicle/i.test(msg)
  ) {
    return 'out_for_delivery';
  }
  if (s === 'available_for_pickup' || /available for pickup|ready for pickup/i.test(msg)) {
    return 'available_for_pickup';
  }
  if (s === 'failure' || /delivery exception|unable to deliver|delivery attempted/i.test(msg)) {
    return 'failure';
  }
  if (
    s === 'in_transit' ||
    detail === 'arrived_at_facility' ||
    detail === 'departed_facility' ||
    detail === 'in_transit' ||
    /arrived at facility|departed from facility|origin scan|departure scan|arrival scan|in transit|on the way|processing at.*facility|export scan|import scan|we have your package/i.test(msg)
  ) {
    return 'in_transit';
  }
  if (
    s === 'pre_transit' ||
    detail === 'label_created' ||
    /shipper created a label|has not received|billing information|shipping label created/i.test(msg)
  ) {
    return 'pre_transit';
  }
  return s || 'unknown';
}

function resolveEventDatetime(d: any): string {
  const localStr = typeof d?.datetime_local === 'string' ? d.datetime_local.trim() : '';
  if (localStr && /[+-]\d{2}:?\d{2}$/.test(localStr)) {
    const parsed = new Date(localStr);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return String(d?.datetime || '');
}

/** The tracking fields saved onto an order box. */
export function summarizeTracker(tracker: any) {
  const details: any[] = Array.isArray(tracker?.tracking_details) ? tracker.tracking_details : [];
  const events = details
    .map((d) => {
      const msg = (d.message || d.description || '').trim();
      const inferredStatus = inferTrackingEventStatus(d.status, msg, d.status_detail);
      return {
        status: inferredStatus,
        message: msg,
        datetime: resolveEventDatetime(d),
        location: formatLocation(d.tracking_location),
      };
    })
    .sort((a, b) => {
      const aRank = STATUS_RANK[a.status] ?? 0;
      const bRank = STATUS_RANK[b.status] ?? 0;
      // Physical carrier scans (rank >= 2) always appear above pre_transit manifest events (rank <= 1),
      // because carriers like UPS record manifest creation in UTC while facility scans use local time.
      const aTier = aRank === 5 ? 3 : aRank >= 2 ? 2 : 1;
      const bTier = bRank === 5 ? 3 : bRank >= 2 ? 2 : 1;
      if (aTier !== bTier) return bTier - aTier;
      const cmp = (b.datetime || '').localeCompare(a.datetime || '');
      if (cmp !== 0) return cmp;
      return bRank - aRank;
    })
    .slice(0, 30);

  let bestStatus = inferTrackingEventStatus(tracker?.status, '', tracker?.status_detail);
  for (const ev of events) {
    if ((STATUS_RANK[ev.status] ?? 0) > (STATUS_RANK[bestStatus] ?? 0)) {
      bestStatus = ev.status;
    }
  }

  // If the package is physically in transit with the carrier and its estimated delivery date is today
  // (after morning dispatch hours), reflect Out for Delivery when EasyPost's webhook lags behind UPS.
  const estDateRaw =
    tracker?.carrier_detail?.est_delivery_date_local ||
    (typeof tracker?.est_delivery_date === 'string' ? tracker.est_delivery_date.slice(0, 10) : '');
  if (bestStatus === 'in_transit' && estDateRaw && /^\d{4}-\d{2}-\d{2}$/.test(estDateRaw)) {
    const now = new Date();
    const pacificNow = new Date(now.getTime() - 7 * 60 * 60 * 1000);
    const todayYmd = pacificNow.toISOString().slice(0, 10);
    const pacificHour = pacificNow.getUTCHours();
    if (estDateRaw === todayYmd && pacificHour >= 7) {
      bestStatus = 'out_for_delivery';
    }
  }

  const resolvedStatus = bestStatus || 'unknown';

  return {
    easyPostTrackerId: tracker?.id || null,
    trackingStatus: resolvedStatus,
    trackingStatusLabel: statusLabel(resolvedStatus),
    trackingStatusDetail: tracker?.status_detail || null,
    trackingEstDelivery: tracker?.est_delivery_date || tracker?.carrier_detail?.est_delivery_date_local || null,
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
      if (!changed) {
        delete update.boxes;
      } else {
        // Sync order's Received milestone expectedDate (and completedAt when delivered) from box tracking
        const trackedBoxes = update.boxes.filter(
          (b: any) =>
            b &&
            b.trackingCarrier !== 'Pickup' &&
            Boolean(
              b.trackingNumber ||
                b.labelUrl ||
                b.trackingEstDelivery ||
                b.easyPostTrackerId ||
                b.estArrival ||
                b.trackingStatus === 'delivered'
            )
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
        const allNonPickup = update.boxes.filter(
          (b: any) =>
            b &&
            b.trackingCarrier !== 'Pickup' &&
            Boolean(b.trackingNumber || b.trackingStatus === 'delivered')
        );
        const allDelivered =
          allNonPickup.length > 0 &&
          deliveredCount === allNonPickup.length &&
          trackedBoxes.length === allNonPickup.length;
        if (latestExpectedYmd || allDelivered) {
          const nextMilestones: Record<string, any> = {
            ...(order.timelineMilestones && typeof order.timelineMilestones === 'object'
              ? order.timelineMilestones
              : {}),
          };
          const nextReceived: Record<string, any> = {
            ...(nextMilestones.Received && typeof nextMilestones.Received === 'object'
              ? nextMilestones.Received
              : {}),
            ...(latestExpectedYmd ? { expectedDate: latestExpectedYmd } : {}),
          };
          delete nextReceived.manualOverrideAt;
          if (allDelivered) {
            nextReceived.completedAt =
              latestDeliveredIso || nextReceived.completedAt || new Date().toISOString();
            nextReceived.delayed = false;
            const currentStatusIdx = Number(order.statusIndex ?? 0);
            if (order.fulfillmentType !== 'Kitting' && currentStatusIdx >= 3 && currentStatusIdx < 8) {
              update.statusIndex = 8;
              update.status = 'Received';
            }
          }
          nextMilestones.Received = nextReceived;
          update.timelineMilestones = nextMilestones;
          if (latestExpectedYmd) {
            const shortDate = formatYmdToShortDate(latestExpectedYmd);
            if (shortDate) {
              update.date = shortDate;
            }
          }
        }
      }
    }

    if ((itemIds.size || Array.isArray(order.items)) && Array.isArray(order.items)) {
      let changed = false;
      const fullSummary = { ...summary, ...(carrier ? { trackingCarrierDetected: carrier } : {}) };
      update.items = order.items.map((it: any) => {
        let itemMatched = false;
        let prevStatus: string | undefined;
        const nextItem: Record<string, any> = { ...it };

        if (sameCode(it.sourcingTrackingNumber)) {
          itemMatched = true;
          prevStatus = it.sourcingTracking?.trackingStatus;
          nextItem.sourcingTracking = fullSummary;
        }

        if (it.sourcingTrackingBySize && typeof it.sourcingTrackingBySize === 'object') {
          const nextBySize: Record<string, any> = { ...it.sourcingTrackingBySize };
          let bySizeChanged = false;
          for (const [szKey, szVal] of Object.entries(nextBySize)) {
            if (!szVal || typeof szVal !== 'object') continue;
            let entryChanged = false;
            const nextEntry: Record<string, any> = { ...szVal };
            if (sameCode(szVal.trackingNumber)) {
              itemMatched = true;
              entryChanged = true;
              if (!prevStatus) prevStatus = szVal.tracking?.trackingStatus;
              nextEntry.tracking = fullSummary;
            }
            if (Array.isArray(szVal.extraTrackings)) {
              let extraChanged = false;
              const nextExtras = szVal.extraTrackings.map((et: any) => {
                if (!sameCode(et?.trackingNumber)) return et;
                itemMatched = true;
                extraChanged = true;
                if (!prevStatus) prevStatus = et?.tracking?.trackingStatus;
                return { ...et, tracking: fullSummary };
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
            nextItem.sourcingTrackingBySize = nextBySize;
            if (!nextItem.sourcingTrackingNumber || sameCode(nextItem.sourcingTrackingNumber)) {
              nextItem.sourcingTracking = fullSummary;
            }
          }
        }

        if (Array.isArray(it.sourcingTrackings)) {
          let listChanged = false;
          const nextList = it.sourcingTrackings.map((t: any) => {
            if (!sameCode(t?.trackingNumber)) return t;
            itemMatched = true;
            listChanged = true;
            if (!prevStatus) prevStatus = t?.tracking?.trackingStatus;
            return { ...t, tracking: fullSummary };
          });
          if (listChanged) {
            nextItem.sourcingTrackings = nextList;
            if (!nextItem.sourcingTrackingNumber || sameCode(nextItem.sourcingTrackingNumber)) {
              nextItem.sourcingTracking = fullSummary;
            }
          }
        }

        if (!itemMatched) return it;
        changed = true;
        updatedCount++;
        if (isAnnounce(prevStatus)) announceItems.push(it.style || 'garments');
        return nextItem;
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
