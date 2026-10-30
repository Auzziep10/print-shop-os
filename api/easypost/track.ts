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
    const db = getServerDb();

    const targets: TrackingTarget[] = [];
    let trackingCode = '';
    let carrierHint: string | undefined;
    let isTest = Boolean(body?.isTest);

    if (Array.isArray(body?.items) && body.items.length) {
      const refs = body.items
        .filter((r: any) => r?.orderId && r?.itemId)
        .slice(0, 100)
        .map((r: any) => ({ orderId: String(r.orderId), itemId: String(r.itemId) }));
      const orderIds = Array.from(new Set(refs.map((r: any) => r.orderId))) as string[];
      const snaps = await Promise.all(orderIds.map((id) => db.collection('orders').doc(id).get()));
      const ordersById = new Map(snaps.filter((s) => s.exists).map((s) => [s.id, s.data() || {}]));

      for (const r of refs) {
        const item = (ordersById.get(r.orderId)?.items || []).find((i: any) => String(i?.id) === r.itemId);
        const code = String(item?.sourcingTrackingNumber || '').replace(/\s+/g, '');
        if (!code) continue;
        if (!trackingCode) trackingCode = code;
        if (trackingDocId(code) !== trackingDocId(trackingCode)) continue;
        targets.push({ orderId: r.orderId, kind: 'item', id: r.itemId });
      }
      if (!trackingCode) return json({ error: 'No supplier tracking number saved on these garments yet' }, 400);
    } else if (body?.orderId && body?.boxId) {
      const orderSnap = await db.collection('orders').doc(String(body.orderId)).get();
      if (!orderSnap.exists) return json({ error: 'Order not found' }, 404);
      const box = (orderSnap.data()?.boxes || []).find((b: any) => b?.id === body.boxId);
      trackingCode = String(box?.trackingNumber || '').replace(/\s+/g, '');
      if (!box || !trackingCode) return json({ error: 'This box has no tracking number yet' }, 400);
      if (box.trackingCarrier === 'Pickup') return json({ error: 'Pickup/local deliveries are not tracked' }, 400);
      carrierHint = box.trackingCarrier;
      targets.push({ orderId: String(body.orderId), kind: 'box', id: String(body.boxId) });
    } else {
      return json({ error: 'Send { orderId, boxId } or { items: [{ orderId, itemId }] }' }, 400);
    }

    // EasyPost test-mode tracking codes look like EZ1000000001
    isTest = isTest || /^EZ\d+$/i.test(trackingCode);
    const apiKey = easyPostKey(isTest);
    if (!apiKey) {
      return json({ error: `${isTest ? 'EASYPOST_TEST_KEY' : 'EASYPOST_PROD_KEY'} is not set in Vercel` }, 500);
    }

    // Carrier is optional — EasyPost detects it from the number when blank
    const carrier = normalizeEasyPostCarrier(carrierHint);
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

    // Link tracking number → these records so webhook updates find their way back.
    // arrayUnion keeps anything else already sharing this package linked too.
    await db.collection(SHIPMENTS_COLLECTION).doc(trackingDocId(trackingCode)).set(
      {
        trackingCode,
        carrier: tracker.carrier || carrier || null,
        easyPostTrackerId: tracker.id,
        mode: tracker.mode || (isTest ? 'test' : 'production'),
        targets: FieldValue.arrayUnion(...targets),
        createdAt: new Date().toISOString(),
      },
      { merge: true },
    );

    await applyTrackerToOrder(db, tracker);

    return json({ ok: true, linked: targets.length, carrier: tracker.carrier || null, ...summarizeTracker(tracker) });
  } catch (err: any) {
    console.error('Start tracking failed:', err);
    return json({ error: err?.message || 'Internal server error' }, 500);
  }
}
