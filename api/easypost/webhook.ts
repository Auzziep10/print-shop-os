import { createHmac, timingSafeEqual } from 'node:crypto';
import { getServerDb } from '../_lib/serverFirestore';
import { applyTrackerToOrder } from '../_lib/easypostTracking';

/**
 * EasyPost webhook receiver — live tracking updates.
 *
 * Setup:
 *  1. EasyPost dashboard → Webhooks → Add webhook
 *     URL: https://<your-domain>/api/easypost/webhook
 *     Webhook secret: any long random string
 *     (add one in Production mode, and one in Test mode if you test labels)
 *  2. Vercel env var EASYPOST_WEBHOOK_SECRET = that same secret
 *  3. Server database access env vars (see api/_lib/serverFirestore.ts)
 *
 * Node runtime (no edge) so it can use the Firestore server SDK.
 */

function verifySignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const provided = header.replace(/^hmac-sha256-hex=/, '').trim();
  const expected = createHmac('sha256', secret.normalize('NFKD')).update(rawBody, 'utf8').digest('hex');
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const secret = (process.env.EASYPOST_WEBHOOK_SECRET || '').trim();
  if (!secret) {
    console.error('EASYPOST_WEBHOOK_SECRET is not set — rejecting webhook.');
    return new Response(JSON.stringify({ error: 'Webhook secret not configured' }), { status: 500 });
  }

  const rawBody = await req.text();
  if (!verifySignature(rawBody, req.headers.get('x-hmac-signature'), secret)) {
    return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const description: string = event?.description || '';
  const tracker = event?.result;

  // Acknowledge everything else so EasyPost doesn't retry
  if (!description.startsWith('tracker.') || tracker?.object !== 'Tracker') {
    return new Response(JSON.stringify({ ok: true, ignored: description }), { status: 200 });
  }

  try {
    const matched = await applyTrackerToOrder(getServerDb(), tracker);
    return new Response(JSON.stringify({ ok: true, matched }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('EasyPost webhook processing failed:', err);
    // 500 tells EasyPost to retry later
    return new Response(JSON.stringify({ error: 'Processing failed' }), { status: 500 });
  }
}
