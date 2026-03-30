export const config = {
  runtime: 'edge', // Edge functions are faster for proxying
};

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { to_address, from_address: fromAddressOverride, parcel, isTest, thirdPartyAccount, thirdPartyZip } = body;

    const apiKey = (isTest ? process.env.EASYPOST_TEST_KEY : process.env.EASYPOST_PROD_KEY)?.trim() || '';
    
    if (!apiKey) {
      const modeName = isTest ? 'Test (EASYPOST_TEST_KEY)' : 'Production (EASYPOST_PROD_KEY)';
      return new Response(JSON.stringify({ error: `Vercel is reporting that the ${modeName} is empty. Please check your Vercel Environment Variables spelling exactly.` }), { status: 500 });
    }

    if (!apiKey.startsWith(isTest ? 'EZTK' : 'EZAK')) {
       return new Response(JSON.stringify({ error: `Vercel loaded a key, but it's formatted incorrectly! You requested ${isTest ? 'Test' : 'Prod'} mode, but the loaded key starts with: ${apiKey.substring(0, 4)}... instead of ${isTest ? 'EZTK' : 'EZAK'}.` }), { status: 500 });
    }

    // Default origin address (WOVN default HQ or warehouse context)
    const default_from_address = {
      company: 'WOVN',
      street1: '100 E 1st St',
      city: 'Los Angeles',
      state: 'CA',
      zip: '90012',
      country: 'US',
      phone: '555-555-5555'
    };
    
    // Use user-provided settings if provided, otherwise default
    const from_address = fromAddressOverride ? {
      company: fromAddressOverride.companyName || default_from_address.company,
      street1: fromAddressOverride.street1 || default_from_address.street1,
      city: fromAddressOverride.city || default_from_address.city,
      state: fromAddressOverride.state || default_from_address.state,
      zip: fromAddressOverride.zip || default_from_address.zip,
      country: fromAddressOverride.country || default_from_address.country,
      phone: fromAddressOverride.phone || default_from_address.phone
    } : default_from_address;

    const shipmentPayload: any = {
      to_address: {
        name: to_address.name || to_address.company || 'Customer',
        company: to_address.company || '',
        street1: to_address.street1,
        street2: to_address.street2 || '',
        city: to_address.city,
        state: to_address.state,
        zip: to_address.zip,
        country: to_address.country || 'US',
        phone: to_address.phone || '555-555-5555'
      },
      from_address,
      parcel,
      options: {
        label_format: 'PDF'
      }
    };

    // Third party billing injection
    if (thirdPartyAccount) {
      shipmentPayload.options.bill_third_party_account = thirdPartyAccount;
      shipmentPayload.options.bill_third_party_postal_code = thirdPartyZip || '';
      shipmentPayload.options.bill_third_party_country = 'US';
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
       return new Response(JSON.stringify({ error: `[Key ends with: ${apiKey.slice(-4)}] EasyPost rejected: ${shipmentData.error.message}` }), { status: 400 });
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
       return new Response(JSON.stringify({ error: `[Key ends with: ${apiKey.slice(-4)}] EasyPost Purchase failed: ${buyData.error.message}` }), { status: 400 });
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
