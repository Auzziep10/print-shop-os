import Stripe from 'stripe';

export const config = {
  runtime: 'edge',
};

// Brand Shop checkout endpoint. One function, two actions, to stay within
// Vercel's function count:
//   { action: 'create', orderId, lineItems, email?, successUrl, cancelUrl }
//   { action: 'verify', sessionId }

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const body = await req.json();

    const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
    if (!secretKey) {
      return new Response(JSON.stringify({ error: 'STRIPE_SECRET_KEY is not defined in environment variables' }), { status: 500 });
    }

    const stripe = new Stripe(secretKey, {
      apiVersion: '2025-01-27.acacia',
    });

    if (body.action === 'verify') {
      const { sessionId } = body;
      if (!sessionId) {
        return new Response(JSON.stringify({ error: 'Missing session ID' }), { status: 400 });
      }

      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const shipping =
        (session as any).shipping_details?.address ??
        session.customer_details?.address ??
        null;

      return new Response(JSON.stringify({
        paid: session.payment_status === 'paid',
        amount_total: session.amount_total,
        currency: session.currency,
        email: session.customer_details?.email ?? null,
        name: (session as any).shipping_details?.name ?? session.customer_details?.name ?? null,
        shipping,
        payment_intent: session.payment_intent,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // action === 'create'
    const { orderId, email, lineItems, successUrl, cancelUrl, shippingCents = 0, collectTax = false } = body;

    if (!Array.isArray(lineItems) || lineItems.length === 0) {
      return new Response(JSON.stringify({ error: 'Missing line items' }), { status: 400 });
    }
    if (!successUrl || !cancelUrl) {
      return new Response(JSON.stringify({ error: 'Missing success/cancel URL' }), { status: 400 });
    }

    // No payment_method_types — Stripe shows every method enabled in the
    // Dashboard (cards, Apple Pay, Google Pay, Link, ...), like a standard shop.
    const shipAmount = Math.max(0, Math.round(shippingCents));
    const sessionParams: any = {
      mode: 'payment',
      customer_email: email || undefined,
      line_items: lineItems,
      shipping_address_collection: {
        allowed_countries: ['US'],
      },
      shipping_options: [
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: { amount: shipAmount, currency: 'usd' },
            display_name: shipAmount > 0 ? 'Standard Shipping' : 'Free Shipping',
            delivery_estimate: {
              minimum: { unit: 'business_day', value: 3 },
              maximum: { unit: 'business_day', value: 7 },
            },
            tax_behavior: 'exclusive',
            tax_code: 'txcd_92010001', // shipping — same code the portal's tax calc uses
          },
        },
      ],
      metadata: {
        shopOrderId: orderId || '',
        source: 'brand_shop',
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    };
    if (collectTax) {
      sessionParams.automatic_tax = { enabled: true };
    }

    let session;
    try {
      session = await stripe.checkout.sessions.create(sessionParams);
    } catch (err: any) {
      // If automatic tax isn't available on the account, don't kill checkout —
      // retry without it so the sale still goes through.
      if (!collectTax) throw err;
      console.warn('Checkout with automatic tax failed, retrying without:', err.message);
      delete sessionParams.automatic_tax;
      session = await stripe.checkout.sessions.create(sessionParams);
    }

    return new Response(JSON.stringify({
      id: session.id,
      url: session.url,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('Shop Checkout Error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error', details: err.message }), { status: 500 });
  }
}
