export const config = {
  runtime: 'edge',
};

function estimateParcelFromItems(items: any[], totalQty: number) {
  let totalWeightOz = 0;
  
  if (items && items.length > 0) {
    items.forEach((item: any) => {
      const styleLower = (item.style || '').toLowerCase();
      
      const isShipping = styleLower.includes('shipping') || styleLower.includes('delivery') || (item.id && item.id.toString().startsWith('ship-')) || item.itemType === 'shipping';
      const isTax = styleLower.includes('tax');
      if (isShipping || isTax) return;

      let qty = 0;
      if (item.itemType === 'service' || !item.sizes || Object.keys(item.sizes).length === 0) {
        qty = parseInt(item.qty || 1);
      } else {
        qty = Object.values(item.sizes || {}).reduce((a: any, b: any) => a + (parseInt(b) || 0), 0) as number;
      }

      const itemNumLower = (item.itemNum || '').toLowerCase();

      // Weight classification in ounces (T-shirt = ~6oz, Hoodie/Sweatshirt = ~18oz, Jacket = ~22oz)
      let itemWeightOz = 6;
      if (
        styleLower.includes('hoodie') || styleLower.includes('sweatshirt') || styleLower.includes('fleece') || styleLower.includes('sweater') ||
        itemNumLower.includes('3719') || itemNumLower.includes('18500') || itemNumLower.includes('18000') || itemNumLower.includes('996') || itemNumLower.includes('90h') || itemNumLower.includes('78h') || itemNumLower.includes('150h')
      ) {
        itemWeightOz = 18;
      } else if (
        styleLower.includes('jacket') || styleLower.includes('outerwear') || styleLower.includes('windbreaker') ||
        itemNumLower.startsWith('j') || itemNumLower.includes('j790') || itemNumLower.includes('j317') || itemNumLower.includes('j333')
      ) {
        itemWeightOz = 22;
      } else if (styleLower.includes('tote') || styleLower.includes('bag') || styleLower.includes('apron')) {
        itemWeightOz = 8;
      } else if (
        styleLower.includes('cap') || styleLower.includes('hat') || styleLower.includes('beanie') ||
        itemNumLower.includes('112') || itemNumLower.includes('115') || itemNumLower.includes('104')
      ) {
        itemWeightOz = 3;
      }
      
      totalWeightOz += qty * itemWeightOz;
    });
  }

  if (totalWeightOz === 0) {
    totalWeightOz = Math.max(1, totalQty) * 6;
  }

  const totalGarments = items.reduce((acc, item) => {
    const styleLower = (item.style || '').toLowerCase();
    const isShipping = styleLower.includes('shipping') || styleLower.includes('delivery') || (item.id && item.id.toString().startsWith('ship-')) || item.itemType === 'shipping';
    const isTax = styleLower.includes('tax');
    if (isShipping || isTax) return acc;
    
    let qty = 0;
    if (item.itemType === 'service' || !item.sizes || Object.keys(item.sizes).length === 0) {
      qty = parseInt(item.qty || 1);
    } else {
      qty = Object.values(item.sizes || {}).reduce((a: any, b: any) => a + (parseInt(b) || 0), 0) as number;
    }
    return acc + qty;
  }, 0) || totalQty;

  let length = 12, width = 9, height = 4, boxWeightOz = 6;
  
  if (totalGarments <= 15) {
    length = 12; width = 9; height = 4; boxWeightOz = 6;
  } else if (totalGarments <= 40) {
    length = 15; width = 12; height = 8; boxWeightOz = 12;
  } else if (totalGarments <= 80) {
    length = 18; width = 14; height = 12; boxWeightOz = 18;
  } else {
    length = 24; width = 16; height = 12; boxWeightOz = 24;
  }

  return {
    length,
    width,
    height,
    weight: totalWeightOz + boxWeightOz
  };
}

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { to_address, from_address: fromAddressOverride, items = [], totalQty = 1, isTest = true } = body;

    let apiKey = (isTest ? process.env.EASYPOST_TEST_KEY : process.env.EASYPOST_PROD_KEY)?.trim() || '';
    if (!apiKey) {
      apiKey = (process.env.EASYPOST_TEST_KEY || process.env.EASYPOST_PROD_KEY)?.trim() || '';
    }
    
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'EasyPost API key is not defined in environment variables. Please add EASYPOST_TEST_KEY or EASYPOST_PROD_KEY.' }), { status: 500 });
    }

    if (!to_address || !to_address.street1 || !to_address.city || !to_address.state || !to_address.zip) {
      return new Response(JSON.stringify({ error: 'Incomplete destination address for shipping rate calculation.' }), { status: 400 });
    }

    // Default origin address (WOVN HQ)
    const default_from_address = {
      company: 'WOVN',
      street1: '100 E 1st St',
      city: 'Los Angeles',
      state: 'CA',
      zip: '90012',
      country: 'US',
      phone: '555-555-5555'
    };

    const from_address = fromAddressOverride ? {
      company: fromAddressOverride.companyName || default_from_address.company,
      street1: fromAddressOverride.street1 || default_from_address.street1,
      city: fromAddressOverride.city || default_from_address.city,
      state: fromAddressOverride.state || default_from_address.state,
      zip: fromAddressOverride.zip || default_from_address.zip,
      country: fromAddressOverride.country || default_from_address.country,
      phone: fromAddressOverride.phone || default_from_address.phone
    } : default_from_address;

    const parcel = estimateParcelFromItems(items, totalQty);

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
        label_format: 'PNG',
        label_size: '4x6'
      }
    };

    // Create the shipment to get rates from EasyPost
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
      return new Response(JSON.stringify({ error: `EasyPost rejected: ${shipmentData.error.message}` }), { status: 400 });
    }

    if (!shipmentData.rates || shipmentData.rates.length === 0) {
      return new Response(JSON.stringify({ error: 'No shipping rates found for this destination.' }), { status: 400 });
    }

    // Sort rates cheapest first
    const sortedRates = shipmentData.rates.map((r: any) => ({
      id: r.id,
      carrier: r.carrier,
      service: r.service,
      rate: parseFloat(r.rate),
      deliveryDays: r.delivery_days,
      deliveryDate: r.delivery_date
    })).sort((a: any, b: any) => a.rate - b.rate);

    return new Response(JSON.stringify({ 
      rates: sortedRates,
      parcel
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    console.error('EasyPost Rates API Error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error', details: err.message }), { status: 500 });
  }
}
