export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  const url = new URL(req.url);

  // 1. GET Request: Meta Webhook Verification Handshake
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (mode === 'subscribe') {
      // Return challenge string to verify endpoint with Meta
      return new Response(challenge || '', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }
    return new Response('Verification failed', { status: 403 });
  }

  // 2. POST Request: Incoming Real-time Meta Lead Ads Payload
  if (req.method === 'POST') {
    try {
      const body = await req.json();

      // Check if event is leadgen
      if (body.object === 'page' || body.object === 'adaccount') {
        const entries = body.entry || [];
        for (const entry of entries) {
          const changes = entry.changes || [];
          for (const change of changes) {
            if (change.field === 'leadgen') {
              const leadgenId = change.value?.leadgen_id;
              const formId = change.value?.form_id;
              const createdTime = change.value?.created_time;

              if (leadgenId) {
                // Fetch settings for Meta Access Token from Firestore
                const projectId = 'print-shop-os-f8092';
                const settingsUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/settings/meta`;
                const settingsRes = await fetch(settingsUrl);

                let accessToken = '';
                let autoSendSms = false;
                let smsTemplate = '';

                if (settingsRes.ok) {
                  const docData = await settingsRes.json();
                  const fields = docData.fields || {};
                  accessToken = fields.accessToken?.stringValue || '';
                  autoSendSms = fields.autoSendSms?.booleanValue || false;
                  smsTemplate = fields.smsTemplate?.stringValue || '';
                }

                let leadName = 'Meta Lead';
                let phone = '';
                let email = '';
                let adName = 'Meta Lead Ad';
                let formName = 'Lead Form';
                const fieldDetails: Record<string, string> = {};

                // Fetch lead details from Meta Graph API if access token is available
                if (accessToken) {
                  const metaGraphUrl = `https://graph.facebook.com/v19.0/${leadgenId}?access_token=${encodeURIComponent(accessToken)}`;
                  const metaRes = await fetch(metaGraphUrl);
                  if (metaRes.ok) {
                    const leadData = await metaRes.json();
                    if (leadData.field_data) {
                      for (const field of leadData.field_data) {
                        const name = field.name?.toLowerCase() || '';
                        const val = Array.isArray(field.values) ? field.values[0] : '';
                        fieldDetails[field.name] = val;

                        if (name.includes('full_name') || name.includes('name')) {
                          leadName = val;
                        } else if (name.includes('phone') || name.includes('mobile')) {
                          phone = val;
                        } else if (name.includes('email')) {
                          email = val;
                        }
                      }
                    }
                  }
                }

                // Write lead doc to Firestore meta_leads collection via REST API
                const docId = leadgenId;
                const leadDocUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/meta_leads/${docId}`;

                const firestorePayload = {
                  fields: {
                    leadId: { stringValue: leadgenId },
                    formId: { stringValue: formId || '' },
                    name: { stringValue: leadName },
                    phone: { stringValue: phone },
                    email: { stringValue: email },
                    adName: { stringValue: adName },
                    formName: { stringValue: formName },
                    smsStatus: { stringValue: 'not_sent' },
                    createdAt: { stringValue: createdTime ? new Date(createdTime * 1000).toISOString() : new Date().toISOString() },
                    rawFields: { stringValue: JSON.stringify(fieldDetails) }
                  }
                };

                await fetch(leadDocUrl, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(firestorePayload)
                });
              }
            }
          }
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (err: any) {
      console.error('Meta Webhook Error:', err);
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  }

  return new Response('Method not allowed', { status: 405 });
}
