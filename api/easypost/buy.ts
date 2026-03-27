export const config = {
  runtime: 'edge', // Edge functions are faster for proxying
};

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { to_address, parcel, isTest, thirdPartyAccount, thirdPartyZip } = body;

    const apiKey = isTest ? process.env.EASYPOST_TEST_KEY : process.env.EASYPOST_PROD_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'EasyPost API key not configured on server' }), { status: 500 });
    }

    // Default origin address (WOVN default HQ or warehouse context)
    const from_address = {
      company: 'WOVN',
      street1: '123 Maker Street',
      city: 'Los Angeles',
      state: 'CA',
      zip: '90001',
      country: 'US',
      phone: '555-555-5555'
    };

    const shipmentPayload: any = {
      to_address,
      from_address,
      parcel
    };

    // Third party billing injection
    if (thirdPartyAccount) {
      shipmentPayload.options = {
        bill_receiver_account: thirdPartyAccount,
        bill_receiver_postal_code: thirdPartyZip || ''
      };
    }

    // 1. Create the shipment to get rates from EasyPost
    const shipmentRes = await fetch('https://api.easypost.com/v2/shipments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${btoa(apiKey + ':')}`
      },
      body: JSON.stringify({ shipment: shipmentPayload })
    });

    const shipmentData = await shipmentRes.json();
    
    if (shipmentData.error) {
       return new Response(JSON.stringify({ error: shipmentData.error.message }), { status: 400 });
    }

    if (!shipmentData.rates || shipmentData.rates.length === 0) {
       return new Response(JSON.stringify({ error: 'No shipping rates found for this destination and configuration.' }), { status: 400 });
    }

    // 2. Decide cheapest rate (favoring UPS)
    const upsRates = shipmentData.rates.filter((r: any) => r.carrier === 'UPS');
    const validRates = upsRates.length > 0 ? upsRates : shipmentData.rates;
    validRates.sort((a: any, b: any) => parseFloat(a.rate) - parseFloat(b.rate));
    const lowestRate = validRates[0];

    // 3. Buy it
    const buyRes = await fetch(`https://api.easypost.com/v2/shipments/${shipmentData.id}/buy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${btoa(apiKey + ':')}`
      },
      body: JSON.stringify({ rate: { id: lowestRate.id } })
    });

    const buyData = await buyRes.json();

    if (buyData.error) {
       return new Response(JSON.stringify({ error: buyData.error.message }), { status: 400 });
    }

    // Return the label url and tracking code back to frontend
    return new Response(JSON.stringify({ 
       trackingNumber: buyData.tracking_code,
       labelUrl: buyData.postage_label.label_url,
       carrier: lowestRate.carrier,
       service: lowestRate.service,
       cost: lowestRate.rate
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    console.error('EasyPost API Error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error', details: err.message }), { status: 500 });
  }
}
