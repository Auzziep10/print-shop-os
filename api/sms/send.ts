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

    // 2. Parse the request body for SMS parameters
    const body = await req.json();
    const { to, content } = body;

    if (!to || !content) {
      return new Response(JSON.stringify({ error: 'Missing required parameters: to and content' }), { status: 400 });
    }

    // Format 'to' to be an array of strings in E.164 format if it is a single string
    const toArray = Array.isArray(to) ? to : [to];

    // 3. Send the request to OpenPhone/QUO API
    const openPhoneRes = await fetch('https://api.openphone.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey
      },
      body: JSON.stringify({
        content,
        from: fromNumber,
        to: toArray
      })
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
