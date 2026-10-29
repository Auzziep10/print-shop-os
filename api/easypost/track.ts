import { getAdminDb } from '../_lib/firebaseAdmin';
import {
  SHIPMENTS_COLLECTION,
  applyTrackerToOrder,
  easyPostKey,
  normalizeEasyPostCarrier,
  summarizeTracker,
  trackingDocId,
} from '../_lib/easypostTracking';

/**
 * Starts live tracking for one box.
 *
 * POST { orderId, boxId, isTest? }
 *
 * Reads the tracking number and carrier from the saved box (not from the
 * request), registers it with EasyPost, links it to the order for the
 * webhook, and saves the current status onto the box.
 *
 * Labels bought through EasyPost already have a tracker — EasyPost returns
 * that same tracker instead of creating a new one.
 */

const json = (body: any, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export default async function handler(req: Request) {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { orderId, boxId, isTest } = await req.json();
    if (!orderId || !boxId) return json({ error: 'orderId and boxId are required' }, 400);

    const db = getAdminDb();
    const orderSnap = await db.collection('orders').doc(String(orderId)).get();
    if (!orderSnap.exists) return json({ error: 'Order not found' }, 404);

    const box = (orderSnap.data()?.boxes || []).find((b: any) => b?.id === boxId);
    const trackingCode = String(box?.trackingNumber || '').replace(/\s+/g, '');
    if (!box || !trackingCode) return json({ error: 'This box has no tracking number yet' }, 400);
    if (box.trackingCarrier === 'Pickup') return json({ error: 'Pickup/local deliveries are not tracked' }, 400);

    // EasyPost test-mode tracking codes look like EZ1000000001
    const testMode = Boolean(isTest) || /^EZ\d+$/i.test(trackingCode);
    const apiKey = easyPostKey(testMode);
    if (!apiKey) {
      return json({ error: `${testMode ? 'EASYPOST_TEST_KEY' : 'EASYPOST_PROD_KEY'} is not set in Vercel` }, 500);
    }

    const carrier = normalizeEasyPostCarrier(box.trackingCarrier);
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

    // Link tracking number → order/box so webhook updates find their way back
    await db.collection(SHIPMENTS_COLLECTION).doc(trackingDocId(trackingCode)).set(
      {
        orderId: String(orderId),
        boxId: String(boxId),
        trackingCode,
        carrier: tracker.carrier || carrier || null,
        easyPostTrackerId: tracker.id,
        mode: tracker.mode || (testMode ? 'test' : 'production'),
        createdAt: new Date().toISOString(),
      },
      { merge: true },
    );

    await applyTrackerToOrder(db, tracker);

    return json({ ok: true, ...summarizeTracker(tracker) });
  } catch (err: any) {
    console.error('Start tracking failed:', err);
    return json({ error: err?.message || 'Internal server error' }, 500);
  }
}
