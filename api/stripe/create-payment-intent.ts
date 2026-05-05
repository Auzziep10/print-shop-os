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
    const { amount, currency = 'usd', orderId } = body;

    const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
    
    if (!secretKey) {
      return new Response(JSON.stringify({ error: `Vercel is reporting that STRIPE_SECRET_KEY is empty. Please add it to your environment variables.` }), { status: 500 });
    }

    const stripe = new Stripe(secretKey, {
      apiVersion: '2025-01-27.acacia', // Or your specific version
    });

    // Create a PaymentIntent with the order amount and currency
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Stripe requires the amount in cents
      currency: currency,
      metadata: {
        orderId: orderId,
      },
    });

    return new Response(JSON.stringify({ 
      clientSecret: paymentIntent.client_secret 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    console.error('Stripe API Error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error', details: err.message }), { status: 500 });
  }
}
