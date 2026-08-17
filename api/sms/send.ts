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
    const { to, content, mediaUrl, media } = body;

    if (!to || !content) {
      return new Response(JSON.stringify({ error: 'Missing required parameters: to and content' }), { status: 400 });
    }

    // Format 'to' to be an array of strings in E.164 format if it is a single string
    const toArray = Array.isArray(to) ? to : [to];

    let finalContent = content;
    let rawMediaStr = typeof mediaUrl === 'string' ? mediaUrl : (mediaUrl as any)?.url;
    if (rawMediaStr) {
      let cleanMediaUrl = rawMediaStr;
      if (rawMediaStr.includes('firebasestorage.googleapis.com') || rawMediaStr.includes('?')) {
        const origin = req.headers.get('origin') || 'https://inktheory.studio';
        cleanMediaUrl = `${origin}/api/gif/render.gif?url=${encodeURIComponent(rawMediaStr)}`;
      }
      if (!finalContent.includes(cleanMediaUrl) && !finalContent.includes(rawMediaStr)) {
        finalContent = `${finalContent.trim()}\n\n${cleanMediaUrl.trim()}`;
      }
    }

    const openPhonePayload: Record<string, any> = {
      content: finalContent,
      from: fromNumber,
      to: toArray
    };

    if (mediaUrl) {
      const mediaItemObj = typeof mediaUrl === 'string' ? { url: mediaUrl } : mediaUrl;

      openPhonePayload.media = [mediaItemObj];
      openPhonePayload.attachments = [mediaItemObj];
      openPhonePayload.mediaUrls = [mediaItemStr];
      openPhonePayload.mediaUrl = mediaItemStr;
    } else if (Array.isArray(media) && media.length > 0) {
      openPhonePayload.media = media;
      openPhonePayload.attachments = media;
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
