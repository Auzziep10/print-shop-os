export const config = {
  runtime: 'edge', // Edge functions are faster for proxying
};

function isRateMatching(rate: any, preferredCarrier?: string, preferredService?: string) {
  if (!rate) return false;
  const rateCarrier = (rate.carrier || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const prefCarrier = (preferredCarrier || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  if (prefCarrier) {
    const carrierMatch = 
      rateCarrier.includes(prefCarrier) || 
      prefCarrier.includes(rateCarrier) || 
      (prefCarrier.includes('ups') && rateCarrier.includes('ups')) ||
      (prefCarrier.includes('fedex') && rateCarrier.includes('fedex')) ||
      (prefCarrier.includes('usps') && rateCarrier.includes('usps'));
    if (!carrierMatch) return false;
  }

  if (preferredService) {
    let rateServ = (rate.service || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    let prefServ = (preferredService || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    rateServ = rateServ.replace('2nd', 'second').replace('1st', 'first');
    prefServ = prefServ.replace('2nd', 'second').replace('1st', 'first');

    if (rateServ.includes(prefServ) || prefServ.includes(rateServ)) {
      return true;
    }
    return false;
  }

  return true;
}

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { 
      to_address, 
      from_address: fromAddressOverride, 
      parcel, 
      isTest, 
      thirdPartyAccount, 
      thirdPartyZip,
      rateId, 
      selectedRateId,
      shipmentId,
      preferredCarrier,
      preferredService,
      carrier,
      service
    } = body;

    const apiKey = (isTest ? process.env.EASYPOST_TEST_KEY : process.env.EASYPOST_PROD_KEY)?.trim() || '';
    
    if (!apiKey) {
      const modeName = isTest ? 'Test (EASYPOST_TEST_KEY)' : 'Production (EASYPOST_PROD_KEY)';
      return new Response(JSON.stringify({ error: `Vercel is reporting that the ${modeName} is empty. Please check your Vercel Environment Variables spelling exactly.` }), { status: 500 });
    }

    if (!apiKey.startsWith(isTest ? 'EZTK' : 'EZAK')) {
       return new Response(JSON.stringify({ error: `Vercel loaded a key, but it's formatted incorrectly! You requested ${isTest ? 'Test' : 'Prod'} mode, but the loaded key starts with: ${apiKey.substring(0, 4)}... instead of ${isTest ? 'EZTK' : 'EZAK'}.` }), { status: 500 });
    }

    // Default origin address (INKTHEORY HQ)
    const default_from_address = {
      company: 'INKTHEORY',
      street1: '4600 Sundt Rd. NE',
      city: 'Rio Rancho',
      state: 'NM',
      zip: '87124',
      country: 'US',
      phone: '555-555-5555'
    };
    
    let senderCompany = fromAddressOverride?.companyName || fromAddressOverride?.company || default_from_address.company;
    if (!senderCompany || senderCompany.trim().toUpperCase() === 'WOVN') {
      senderCompany = 'INKTHEORY';
    }

    const from_address = {
      company: senderCompany,
      street1: fromAddressOverride?.street1 || default_from_address.street1,
      city: fromAddressOverride?.city || default_from_address.city,
      state: fromAddressOverride?.state || default_from_address.state,
      zip: fromAddressOverride?.zip || default_from_address.zip,
      country: fromAddressOverride?.country || default_from_address.country,
      phone: fromAddressOverride?.phone || default_from_address.phone
    };

    const targetCarrier = preferredCarrier || carrier;
    const targetService = preferredService || service;
    const targetRateId = selectedRateId || rateId;

    let buyData: any = null;
    let chosenRate: any = null;

    // 1. Direct purchase if shipmentId and rateId are already available and valid
    if (shipmentId && targetRateId && !thirdPartyAccount) {
      try {
        const directBuyRes = await fetch(`https://api.easypost.com/v2/shipments/${shipmentId}/buy`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${btoa(apiKey + ':')}`
          },
          body: JSON.stringify({ rate: { id: targetRateId } })
        });
        const resJson = await directBuyRes.json();
        if (!resJson.error && resJson.postage_label?.label_url) {
          buyData = resJson;
          chosenRate = resJson.selected_rate || { id: targetRateId, carrier: targetCarrier, service: targetService, rate: resJson.rate };
        }
      } catch (e) {
        console.warn('Direct buy on existing shipment failed, falling back to fresh shipment creation', e);
      }
    }

    // 2. If direct buy didn't happen, create the shipment to get rates from EasyPost
    if (!buyData) {
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

      // Third party billing injection
      if (thirdPartyAccount) {
        shipmentPayload.options.payment = {
          type: 'THIRD_PARTY',
          account: thirdPartyAccount,
          country: 'US',
          postal_code: thirdPartyZip || ''
        };
      }

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

      // Match rate in order of specificity:
      // 1. Exact match by rate id
      let selectedRate = targetRateId ? shipmentData.rates.find((r: any) => r.id === targetRateId) : null;

      // 2. Match by preferred carrier and service
      if (!selectedRate && (targetCarrier || targetService)) {
        selectedRate = shipmentData.rates.find((r: any) => isRateMatching(r, targetCarrier, targetService));
      }

      // 3. Match by carrier
      if (!selectedRate && targetCarrier) {
        const carrierRates = shipmentData.rates.filter((r: any) => {
          const cNorm = (r.carrier || '').toLowerCase();
          const pNorm = targetCarrier.toLowerCase();
          return cNorm.includes(pNorm) || pNorm.includes(cNorm) || (pNorm.includes('ups') && cNorm.includes('ups'));
        });
        if (carrierRates.length > 0) {
          carrierRates.sort((a: any, b: any) => parseFloat(a.rate) - parseFloat(b.rate));
          selectedRate = carrierRates[0];
        }
      }

      // 4. Fallback to cheapest rate
      if (!selectedRate) {
        const validRates = [...shipmentData.rates];
        validRates.sort((a: any, b: any) => parseFloat(a.rate) - parseFloat(b.rate));
        selectedRate = validRates[0];
      }

      // 3. Buy the selected rate
      const buyRes = await fetch(`https://api.easypost.com/v2/shipments/${shipmentData.id}/buy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${btoa(apiKey + ':')}`
        },
        body: JSON.stringify({ rate: { id: selectedRate.id } })
      });

      buyData = await buyRes.json();

      if (buyData.error) {
         return new Response(JSON.stringify({ error: `[Key ends with: ${apiKey.slice(-4)}] EasyPost Purchase failed: ${buyData.error.message}` }), { status: 400 });
      }

      chosenRate = buyData.selected_rate || selectedRate;
    }

    // Return the label url and tracking code back to frontend
    return new Response(JSON.stringify({ 
       trackingNumber: buyData.tracking_code,
       labelUrl: buyData.postage_label.label_url,
       carrier: chosenRate?.carrier || 'Carrier',
       service: chosenRate?.service || 'Delivery',
       cost: chosenRate?.rate || '0.00'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    console.error('EasyPost API Error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error', details: err.message }), { status: 500 });
  }
}
