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
    const { 
      orderId, 
      customerId, 
      title, 
      amount, 
      qty = 1, 
      email,
      successUrl,
      cancelUrl
    } = body;

    const secretKey = process.env.STRIPE_SECRET_KEY?.trim();

    if (!secretKey) {
      return new Response(JSON.stringify({ error: 'STRIPE_SECRET_KEY is not defined in environment variables' }), { status: 500 });
    }

    const stripe = new Stripe(secretKey, {
      apiVersion: '2025-01-27.acacia',
    });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: email || undefined,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: title || 'Custom Garment Order',
            },
            unit_amount: Math.round(amount * 100), // Stripe expects unit price in cents
          },
          quantity: qty,
        },
      ],
      mode: 'payment',
      metadata: {
        orderId,
        customerId,
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    return new Response(JSON.stringify({ 
      id: session.id,
      url: session.url
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    console.error('Stripe Checkout Error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error', details: err.message }), { status: 500 });
  }
}
