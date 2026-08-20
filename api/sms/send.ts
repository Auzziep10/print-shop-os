export const config = {
  runtime: 'edge', // Runs on edge for high performance and compatibility
};

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Missing auth token' }), { status: 401 });
    }
    const idToken = authHeader.substring(7);

    // 1. Fetch the QUO configuration from Firestore using the user's Auth context
    const projectId = 'print-shop-os-f8092';
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/settings/quo`;
    
    const firestoreRes = await fetch(firestoreUrl, {
      headers: {
        'Authorization': `Bearer ${idToken}`
      }
    });

    if (!firestoreRes.ok) {
      const errorText = await firestoreRes.text();
      console.error('Firestore REST API error:', errorText);
      return new Response(JSON.stringify({ 
        error: 'Forbidden: Unable to retrieve QUO settings. Make sure you are an Admin or Leadership member.' 
      }), { status: firestoreRes.status });
    }

    const docData = await firestoreRes.json();
    const fields = docData.fields || {};
    const apiKey = fields.apiKey?.stringValue;
    const fromNumber = fields.fromNumber?.stringValue;

    if (!apiKey || !fromNumber) {
      return new Response(JSON.stringify({ 
        error: 'QUO integration is not configured. Please complete the setup in Settings.' 
      }), { status: 400 });
    }

    // 2. Parse the request body for SMS & MMS parameters
    const body = await req.json();
    const { to, content, mediaUrl, media, sendMediaFirst = true } = body;

    if (!to || (!content && !mediaUrl && (!media || media.length === 0))) {
      return new Response(JSON.stringify({ error: 'Missing required parameters: to and (content or mediaUrl)' }), { status: 400 });
    }

    // Format 'to' to be an array of strings in E.164 format if it is a single string
    const toArray = Array.isArray(to) ? to : [to];
    const rawMediaStr = typeof mediaUrl === 'string' ? mediaUrl : (mediaUrl as any)?.url;

    // Sequential dispatch: Send MMS Image First, then Text Message Second
    if (sendMediaFirst && rawMediaStr && content) {
      const mediaItemObj = typeof mediaUrl === 'string' ? { url: mediaUrl } : mediaUrl;

      // Step 1: Dispatch MMS Image Message First to OpenPhone
      const imagePayload = {
        from: fromNumber,
        to: toArray,
        media: [mediaItemObj]
      };

      const imageRes = await fetch('https://api.openphone.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': apiKey
        },
        body: JSON.stringify(imagePayload)
      });

      const imageData = await imageRes.json().catch(() => ({}));
      if (!imageRes.ok) {
        console.error('OpenPhone/QUO API error sending media image first:', imageData);
      }

      // 1.2 second pause to ensure carrier delivery order (Image Bubble top, Text Bubble bottom)
      await new Promise(r => setTimeout(r, 1200));

      // Step 2: Dispatch Text Message Second to OpenPhone
      const textPayload = {
        from: fromNumber,
        to: toArray,
        content: content
      };

      const textRes = await fetch('https://api.openphone.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': apiKey
        },
        body: JSON.stringify(textPayload)
      });

      const textData = await textRes.json().catch(() => ({}));
      if (!textRes.ok) {
        console.error('OpenPhone/QUO API error sending text message second:', textData);
        return new Response(JSON.stringify({ 
          error: `QUO API error sending text message: ${textData.message || textData.error || textRes.statusText}` 
        }), { status: textRes.status });
      }

      return new Response(JSON.stringify({ success: true, message: textData }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const openPhonePayload: Record<string, any> = {
      content: content || '',
      from: fromNumber,
      to: toArray
    };

    if (mediaUrl) {
      const mediaItemObj = typeof mediaUrl === 'string' ? { url: mediaUrl } : mediaUrl;
      openPhonePayload.media = [mediaItemObj];
    } else if (Array.isArray(media) && media.length > 0) {
      openPhonePayload.media = media;
    }

    // 3. Send the request to OpenPhone/QUO API
    const openPhoneRes = await fetch('https://api.openphone.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey
      },
      body: JSON.stringify(openPhonePayload)
    });

    const openPhoneData = await openPhoneRes.json().catch(() => ({}));

    if (!openPhoneRes.ok) {
      console.error('OpenPhone/QUO API responded with error:', openPhoneData);
      return new Response(JSON.stringify({ 
        error: `QUO API error: ${openPhoneData.message || openPhoneData.error || openPhoneRes.statusText}` 
      }), { status: openPhoneRes.status });
    }

    return new Response(JSON.stringify({ success: true, message: openPhoneData }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    console.error('Send SMS API Error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error', details: err.message }), { status: 500 });
  }
}
