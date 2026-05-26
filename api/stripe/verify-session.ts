import Stripe from 'stripe';

export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { sessionId } = body;

    if (!sessionId) {
      return new Response(JSON.stringify({ error: 'Missing session ID' }), { status: 400 });
    }

    const secretKey = process.env.STRIPE_SECRET_KEY?.trim();

    if (!secretKey) {
      return new Response(JSON.stringify({ error: 'STRIPE_SECRET_KEY is not defined in environment variables' }), { status: 500 });
    }

    const stripe = new Stripe(secretKey, {
      apiVersion: '2025-01-27.acacia',
    });

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    return new Response(JSON.stringify({ 
      paid: session.payment_status === 'paid',
      amount_total: session.amount_total,
      payment_intent: session.payment_intent
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    console.error('Stripe Verify Error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error', details: err.message }), { status: 500 });
  }
}
