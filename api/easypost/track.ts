import {
  easyPostKey,
  normalizeEasyPostCarrier,
  summarizeTracker,
  type TrackingTarget,
} from '../_lib/easypostTracking';

export const config = {
  runtime: 'edge',
};

/**
 * Starts or refreshes live tracking for a package via EasyPost.
 *
 * Runs on Vercel's Edge runtime (like /api/easypost/rates and /api/easypost/buy)
 * for instant cold-starts and zero timeout issues.
 */

const json = (body: any, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const body = await req.json();

    const targets: TrackingTarget[] = [];
    const trackingCode = String(body?.trackingNumber || '').replace(/\s+/g, '');
    const carrierHint: string | undefined = body?.carrier ? String(body.carrier) : undefined;
    let isTest = Boolean(body?.isTest);

    if (Array.isArray(body?.items) && body.items.length) {
      const refs = body.items
        .filter((r: any) => r?.orderId && r?.itemId)
        .slice(0, 100)
        .map((r: any) => ({
          orderId: String(r.orderId),
          itemId: String(r.itemId),
          size: r?.size ? String(r.size).trim().toUpperCase() : undefined,
        }));
      refs.forEach((r: any) => targets.push({ orderId: r.orderId, kind: 'item', id: r.itemId }));
      if (!trackingCode) {
        return json({ error: 'No supplier tracking number saved on these garments yet' }, 400);
      }
    } else if (body?.orderId && body?.boxId) {
      if (carrierHint === 'Pickup') {
        return json({ error: 'Pickup/local deliveries are not tracked' }, 400);
      }
      if (!trackingCode) {
        return json({ error: 'This box has no tracking number yet' }, 400);
      }
      targets.push({ orderId: String(body.orderId), kind: 'box', id: String(body.boxId) });
    } else if (!trackingCode) {
      return json({ error: 'Send { trackingNumber } along with box or item target' }, 400);
    }

    // EasyPost test-mode tracking codes look like EZ1000000001
    isTest = isTest || /^EZ\d+$/i.test(trackingCode);
    const apiKey = easyPostKey(isTest);
    if (!apiKey) {
      return json({ error: `${isTest ? 'EASYPOST_TEST_KEY' : 'EASYPOST_PROD_KEY'} is not set in Vercel` }, 500);
    }

    const authHeader = `Basic ${btoa(apiKey + ':')}`;
    // Carrier is optional — EasyPost detects it from the number when blank
    const carrier = normalizeEasyPostCarrier(carrierHint, trackingCode);

    // Call POST /v2/trackers first so EasyPost creates or refreshes the tracker with the carrier
    // (EasyPost returns the existing tracker without extra charge if created within 90 days)
    let tracker: any = null;
    const epRes = await fetch('https://api.easypost.com/v2/trackers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({ tracker: { tracking_code: trackingCode, ...(carrier ? { carrier } : {}) } }),
    });
    const created: any = await epRes.json().catch(() => ({}));
    if (epRes.ok && created?.id) {
      tracker = created;
    }

    // Fallback or supplement from GET /v2/trackers list if POST failed or returned fewer details
    if (!tracker || !Array.isArray(tracker.tracking_details) || tracker.tracking_details.length === 0) {
      const listRes = await fetch(
        `https://api.easypost.com/v2/trackers?tracking_code=${encodeURIComponent(trackingCode)}&page_size=5`,
        { headers: { Authorization: authHeader } }
      );
      const listData: any = await listRes.json().catch(() => ({}));
      const candidates: any[] = Array.isArray(listData?.trackers) ? listData.trackers : [];
      for (const cand of candidates) {
        if (!tracker || (cand?.tracking_details?.length || 0) > (tracker?.tracking_details?.length || 0)) {
          tracker = cand;
        }
      }
    }

    if (!tracker || !tracker.id) {
      return json({ error: `EasyPost: ${created?.error?.message || 'could not create tracker'}` }, 400);
    }

    return json({
      ok: true,
      linked: targets.length,
      trackingCode: tracker.tracking_code || trackingCode,
      carrier: tracker.carrier || carrier || null,
      targets,
      ...summarizeTracker(tracker),
    });
  } catch (err: any) {
    console.error('Start tracking failed:', err);
    return json({ error: err?.message || 'Internal server error' }, 500);
  }
}
