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

    // 1. Fetch the AhaSend configuration from Firestore using the user's Auth context
    const projectId = 'print-shop-os-f8092';
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/settings/ahasend`;
    
    const firestoreRes = await fetch(firestoreUrl, {
      headers: {
        'Authorization': `Bearer ${idToken}`
      }
    });

    if (!firestoreRes.ok) {
      const errorText = await firestoreRes.text();
      console.error('Firestore REST API error:', errorText);
      return new Response(JSON.stringify({ 
        error: 'Forbidden: Unable to retrieve email settings. Make sure you are an Admin or Leadership member.' 
      }), { status: firestoreRes.status });
    }

    const docData = await firestoreRes.json();
    const fields = docData.fields || {};
    const apiKey = fields.apiKey?.stringValue;
    const fromEmail = fields.fromEmail?.stringValue;
    const fromName = fields.fromName?.stringValue;

    if (!apiKey || !fromEmail) {
      return new Response(JSON.stringify({ 
        error: 'AhaSend integration is not configured. Please complete the setup in Settings.' 
      }), { status: 400 });
    }

    // 2. Parse the request body for email parameters
    const body = await req.json();
    const { to, subject, text, html } = body;

    if (!to || !subject || (!text && !html)) {
      return new Response(JSON.stringify({ error: 'Missing required parameters: to, subject, and either text or html' }), { status: 400 });
    }

    // 3. Format sender header and build AhaSend payload
    const fromField = fromName ? `${fromName} <${fromEmail}>` : fromEmail;
    const ahaSendPayload = {
      from: fromField,
      to,
      subject,
      text,
      html
    };

    // 4. Send the request to AhaSend API
    const ahaSendRes = await fetch('https://api.ahasend.com/v1/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey
      },
      body: JSON.stringify(ahaSendPayload)
    });

    const ahaSendData = await ahaSendRes.json().catch(() => ({}));

    if (!ahaSendRes.ok) {
      console.error('AhaSend API responded with error:', ahaSendData);
      return new Response(JSON.stringify({ 
        error: `AhaSend API error: ${ahaSendData.message || ahaSendRes.statusText}` 
      }), { status: ahaSendRes.status });
    }

    return new Response(JSON.stringify({ success: true, messageId: ahaSendData.messageId || 'sent' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    console.error('Send Email API Error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error', details: err.message }), { status: 500 });
  }
}
