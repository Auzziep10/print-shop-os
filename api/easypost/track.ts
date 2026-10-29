import { FieldValue } from '@google-cloud/firestore';
import { getServerDb } from '../_lib/serverFirestore';
import {
  SHIPMENTS_COLLECTION,
  applyTrackerToOrder,
  easyPostKey,
  normalizeEasyPostCarrier,
  summarizeTracker,
  trackingDocId,
  type TrackingTarget,
} from '../_lib/easypostTracking';

/**
 * Starts live tracking for one package on an order.
 *
 * POST { orderId, boxId }      → outgoing box (order.boxes[])
 * POST { orderId, inboundId }  → incoming garment package (order.inboundShipments[])
 * optional: isTest
 *
 * Reads the tracking number and carrier from the saved entry (not from the
 * request), registers it with EasyPost, links it to the order for the
 * webhook, and saves the current status onto the entry.
 *
 * Labels bought through EasyPost already have a tracker — EasyPost returns
 * that same tracker instead of creating a new one.
 */

const json = (body: any, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export default async function handler(req: Request) {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { orderId, boxId, inboundId, isTest } = await req.json();
    if (!orderId || (!boxId && !inboundId)) return json({ error: 'orderId and boxId or inboundId are required' }, 400);

    const kind: TrackingTarget['kind'] = inboundId ? 'inbound' : 'box';
    const entryId = String(inboundId || boxId);
    const field = kind === 'inbound' ? 'inboundShipments' : 'boxes';

    const db = getServerDb();
    const orderSnap = await db.collection('orders').doc(String(orderId)).get();
    if (!orderSnap.exists) return json({ error: 'Order not found' }, 404);

    const entry = (orderSnap.data()?.[field] || []).find((e: any) => e?.id === entryId);
    const trackingCode = String(entry?.trackingNumber || '').replace(/\s+/g, '');
    if (!entry || !trackingCode) return json({ error: 'No tracking number saved for this package yet' }, 400);
    if (entry.trackingCarrier === 'Pickup') return json({ error: 'Pickup/local deliveries are not tracked' }, 400);

    // EasyPost test-mode tracking codes look like EZ1000000001
    const testMode = Boolean(isTest) || /^EZ\d+$/i.test(trackingCode);
    const apiKey = easyPostKey(testMode);
    if (!apiKey) {
      return json({ error: `${testMode ? 'EASYPOST_TEST_KEY' : 'EASYPOST_PROD_KEY'} is not set in Vercel` }, 500);
    }

    // Carrier is optional — EasyPost detects it from the number when blank
    const carrier = normalizeEasyPostCarrier(entry.trackingCarrier);
    const epRes = await fetch('https://api.easypost.com/v2/trackers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(apiKey + ':').toString('base64')}`,
      },
      body: JSON.stringify({ tracker: { tracking_code: trackingCode, ...(carrier ? { carrier } : {}) } }),
    });
    const tracker = await epRes.json();
    if (!epRes.ok || tracker?.error) {
      return json({ error: `EasyPost: ${tracker?.error?.message || 'could not create tracker'}` }, 400);
    }

    // Link tracking number → this order entry so webhook updates find their way back.
    // arrayUnion keeps other orders sharing the same supplier package linked too.
    const target: TrackingTarget = { orderId: String(orderId), kind, id: entryId };
    await db.collection(SHIPMENTS_COLLECTION).doc(trackingDocId(trackingCode)).set(
      {
        trackingCode,
        carrier: tracker.carrier || carrier || null,
        easyPostTrackerId: tracker.id,
        mode: tracker.mode || (testMode ? 'test' : 'production'),
        targets: FieldValue.arrayUnion(target),
        createdAt: new Date().toISOString(),
      },
      { merge: true },
    );

    await applyTrackerToOrder(db, tracker);

    return json({ ok: true, carrier: tracker.carrier || null, ...summarizeTracker(tracker) });
  } catch (err: any) {
    console.error('Start tracking failed:', err);
    return json({ error: err?.message || 'Internal server error' }, 500);
  }
}
