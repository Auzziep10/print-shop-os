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
    const { shippingAddress, items } = body;

    const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
    if (!secretKey) {
      return new Response(JSON.stringify({ error: 'STRIPE_SECRET_KEY is empty. Please add it to your environment variables.' }), { status: 500 });
    }

    const stripe = new Stripe(secretKey, {
      apiVersion: '2025-01-27.acacia',
    });

    if (!shippingAddress || !shippingAddress.city || !shippingAddress.state || (!shippingAddress.zip && !shippingAddress.postal_code)) {
      return new Response(JSON.stringify({ error: 'Incomplete shipping address for tax calculation.' }), { status: 400 });
    }

    // Call Stripe Tax calculation API
    const calculation = await stripe.tax.calculations.create({
      currency: 'usd',
      line_items: items.map((item: any, idx: number) => ({
        amount: Math.round(item.amount * 100), // Stripe expects cents
        reference: String(item.id || `item_${idx}`),
        tax_code: 'txcd_30011000', // General clothing/apparel tax code
      })),
      customer_details: {
        address: {
          line1: shippingAddress.street1 || shippingAddress.street || '',
          line2: shippingAddress.street2 || '',
          city: shippingAddress.city,
          state: shippingAddress.state,
          postal_code: shippingAddress.zip || shippingAddress.postal_code || '',
          country: shippingAddress.country || 'US',
        },
        address_source: 'shipping',
      },
    });

    return new Response(JSON.stringify({ 
      taxAmount: calculation.tax_amount_details.tax_amount / 100, // Return in dollars
      totalAmount: calculation.amount_total / 100,
      calculationId: calculation.id
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    console.error('Stripe Tax API Error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error', details: err.message }), { status: 500 });
  }
}
