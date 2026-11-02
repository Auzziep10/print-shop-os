import { FieldValue } from '@google-cloud/firestore';
import { getServerDb } from '../_lib/serverFirestore.js';
import {
  SHIPMENTS_COLLECTION,
  applyTrackerToOrder,
  easyPostKey,
  normalizeEasyPostCarrier,
  summarizeTracker,
  trackingDocId,
  type TrackingTarget,
} from '../_lib/easypostTracking.js';

/**
 * Starts live tracking for a package.
 *
 * POST { orderId, boxId, isTest? }
 *   → outgoing box (order.boxes[]); number from box.trackingNumber
 *
 * POST { items: [{ orderId, itemId }, ...] }
 *   → garments coming from a supplier (Sourcing tab); number from
 *     item.sourcingTrackingNumber. One supplier package can cover garments
 *     on several orders, so every listed item is linked.
 *
 * Reads tracking numbers from the saved records (not from the request),
 * registers the number with EasyPost, links it for the webhook, and saves
 * the current status. Labels bought through EasyPost already have a
 * tracker — EasyPost returns that same tracker.
 */

const json = (body: any, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export async function POST(req: Request) {
  try {
    const body = await req.json();
    let db: ReturnType<typeof getServerDb> | null = null;
    try {
      db = getServerDb();
    } catch {
      db = null;
    }

    const targets: TrackingTarget[] = [];
    let trackingCode = String(body?.trackingNumber || '').replace(/\s+/g, '');
    let carrierHint: string | undefined = body?.carrier ? String(body.carrier) : undefined;
    let isTest = Boolean(body?.isTest);

    if (Array.isArray(body?.items) && body.items.length) {
      const requestedCode = String(body?.trackingNumber || '').replace(/\s+/g, '');
      const refs = body.items
        .filter((r: any) => r?.orderId && r?.itemId)
        .slice(0, 100)
        .map((r: any) => ({
          orderId: String(r.orderId),
          itemId: String(r.itemId),
          size: r?.size ? String(r.size).trim().toUpperCase() : undefined,
        }));
      if (db) {
        try {
          const orderIds = Array.from(new Set(refs.map((r: any) => r.orderId))) as string[];
          const snaps = await Promise.all(orderIds.map((id) => db!.collection('orders').doc(id).get()));
          const ordersById = new Map(snaps.filter((s) => s.exists).map((s) => [s.id, s.data() || {}]));

          for (const r of refs) {
            const item = (ordersById.get(r.orderId)?.items || []).find((i: any) => String(i?.id) === r.itemId);
            if (!item) continue;

            const candidateCodes: string[] = [];
            if (r.size && item?.sourcingTrackingBySize?.[r.size]?.trackingNumber) {
              candidateCodes.push(String(item.sourcingTrackingBySize[r.size].trackingNumber).replace(/\s+/g, ''));
            }
            if (item?.sourcingTrackingBySize && typeof item.sourcingTrackingBySize === 'object') {
              Object.values(item.sourcingTrackingBySize).forEach((entry: any) => {
                if (entry?.trackingNumber) candidateCodes.push(String(entry.trackingNumber).replace(/\s+/g, ''));
                if (Array.isArray(entry?.extraTrackings)) {
                  entry.extraTrackings.forEach((et: any) => {
                    if (et?.trackingNumber) candidateCodes.push(String(et.trackingNumber).replace(/\s+/g, ''));
                  });
                }
              });
            }
            if (Array.isArray(item?.sourcingTrackings)) {
              item.sourcingTrackings.forEach((t: any) => {
                if (t?.trackingNumber) candidateCodes.push(String(t.trackingNumber).replace(/\s+/g, ''));
              });
            }
            if (item?.sourcingTrackingNumber) {
              candidateCodes.push(String(item.sourcingTrackingNumber).replace(/\s+/g, ''));
            }

            const validCodes = candidateCodes.filter(Boolean);
            if (validCodes.length === 0) continue;

            let matchedCode = '';
            if (requestedCode) {
              const found = validCodes.find((c) => trackingDocId(c) === trackingDocId(requestedCode));
              if (found) matchedCode = found;
            } else {
              matchedCode = validCodes[0];
            }
            if (!matchedCode) continue;

            if (!trackingCode) trackingCode = matchedCode;
            if (trackingDocId(matchedCode) !== trackingDocId(trackingCode)) continue;
            targets.push({ orderId: r.orderId, kind: 'item', id: r.itemId });
          }
        } catch (dbErr) {
          console.warn('Could not read items from server Firestore, falling back to request payload:', dbErr);
        }
      }
      if (targets.length === 0 && requestedCode) {
        trackingCode = requestedCode;
        refs.forEach((r: any) => targets.push({ orderId: r.orderId, kind: 'item', id: r.itemId }));
      }
      if (!trackingCode) return json({ error: 'No supplier tracking number saved on these garments yet' }, 400);
    } else if (body?.orderId && body?.boxId) {
      if (db) {
        try {
          const orderSnap = await db.collection('orders').doc(String(body.orderId)).get();
          if (orderSnap.exists) {
            const box = (orderSnap.data()?.boxes || []).find((b: any) => b?.id === body.boxId);
            if (box) {
              if (!trackingCode) trackingCode = String(box?.trackingNumber || '').replace(/\s+/g, '');
              if (box.trackingCarrier === 'Pickup') return json({ error: 'Pickup/local deliveries are not tracked' }, 400);
              if (!carrierHint) carrierHint = box.trackingCarrier;
            }
          }
        } catch (dbErr) {
          console.warn('Could not read box from server Firestore, falling back to request payload:', dbErr);
        }
      }
      if (!trackingCode) return json({ error: 'This box has no tracking number yet' }, 400);
      targets.push({ orderId: String(body.orderId), kind: 'box', id: String(body.boxId) });
    } else if (!trackingCode) {
      return json({ error: 'Send { orderId, boxId } or { items: [{ orderId, itemId }] } or { trackingNumber }' }, 400);
    }

    // EasyPost test-mode tracking codes look like EZ1000000001
    isTest = isTest || /^EZ\d+$/i.test(trackingCode);
    const apiKey = easyPostKey(isTest);
    if (!apiKey) {
      return json({ error: `${isTest ? 'EASYPOST_TEST_KEY' : 'EASYPOST_PROD_KEY'} is not set in Vercel` }, 500);
    }

    const authHeader = `Basic ${Buffer.from(apiKey + ':').toString('base64')}`;
    // Carrier is optional — EasyPost detects it from the number when blank
    const carrier = normalizeEasyPostCarrier(carrierHint);
    let epRes = await fetch('https://api.easypost.com/v2/trackers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({ tracker: { tracking_code: trackingCode, ...(carrier ? { carrier } : {}) } }),
    });
    let tracker: any = await epRes.json().catch(() => ({}));

    // If EasyPost rejects duplicate in-flight tracker creation or carrier mismatch, look up existing tracker by tracking_code
    if (!epRes.ok || tracker?.error) {
      const listRes = await fetch(
        `https://api.easypost.com/v2/trackers?tracking_code=${encodeURIComponent(trackingCode)}&page_size=5`,
        { headers: { Authorization: authHeader } }
      );
      const listData: any = await listRes.json().catch(() => ({}));
      const existing = Array.isArray(listData?.trackers) ? listData.trackers[0] : null;
      if (existing && existing.id) {
        tracker = existing;
      } else {
        return json({ error: `EasyPost: ${tracker?.error?.message || 'could not create tracker'}` }, 400);
      }
    }

    // Link tracking number → these records so webhook updates find their way back.
    // arrayUnion keeps anything else already sharing this package linked too.
    if (db) {
      try {
        await db.collection(SHIPMENTS_COLLECTION).doc(trackingDocId(trackingCode)).set(
          {
            trackingCode,
            carrier: tracker.carrier || carrier || null,
            easyPostTrackerId: tracker.id,
            mode: tracker.mode || (isTest ? 'test' : 'production'),
            ...(targets.length ? { targets: FieldValue.arrayUnion(...targets) } : {}),
            createdAt: new Date().toISOString(),
          },
          { merge: true },
        );

        await applyTrackerToOrder(db, tracker);
      } catch (dbErr) {
        console.warn('Could not persist tracker to server Firestore:', dbErr);
      }
    }

    return json({
      ok: true,
      linked: targets.length,
      trackingCode,
      carrier: tracker.carrier || carrier || null,
      ...summarizeTracker(tracker),
    });
  } catch (err: any) {
    console.error('Start tracking failed:', err);
    return json({ error: err?.message || 'Internal server error' }, 500);
  }
}

export default POST;
