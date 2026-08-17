export const config = {
  runtime: 'edge',
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

    // 1. Fetch settings from Firestore
    const projectId = 'print-shop-os-f8092';
    const settingsUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/settings/meta`;

    const settingsRes = await fetch(settingsUrl, {
      headers: { 'Authorization': `Bearer ${idToken}` }
    });

    if (!settingsRes.ok) {
      return new Response(JSON.stringify({ error: 'Failed to load Meta Ads settings. Please configure access token in Settings.' }), { status: 400 });
    }

    const settingsDoc = await settingsRes.json();
    const fields = settingsDoc.fields || {};
    const accessToken = fields.accessToken?.stringValue || '';
    const formId = fields.formId?.stringValue || '';

    if (!accessToken) {
      return new Response(JSON.stringify({ error: 'Meta Access Token is missing. Please add it in Settings > Meta Lead Ads Integration.' }), { status: 400 });
    }

    if (!formId) {
      return new Response(JSON.stringify({ error: 'Meta Lead Form ID is missing. Please add it in Settings > Meta Lead Ads Integration.' }), { status: 400 });
    }

    // 2. Fetch leads from Meta Graph API
    const metaGraphUrl = `https://graph.facebook.com/v19.0/${formId}/leads?access_token=${encodeURIComponent(accessToken)}&limit=50`;
    const metaRes = await fetch(metaGraphUrl);

    if (!metaRes.ok) {
      const errData = await metaRes.json().catch(() => ({}));
      return new Response(JSON.stringify({
        error: `Meta Graph API error: ${errData.error?.message || metaRes.statusText}`
      }), { status: metaRes.status });
    }

    const metaData = await metaRes.json();
    const leads = metaData.data || [];
    let syncedCount = 0;

    // 3. Upsert leads to Firestore meta_leads collection
    for (const lead of leads) {
      const leadId = lead.id;
      const createdTime = lead.created_time;
      let name = 'Meta Lead';
      let phone = '';
      let email = '';
      const fieldDetails: Record<string, string> = {};

      if (lead.field_data) {
        for (const field of lead.field_data) {
          const fieldName = field.name?.toLowerCase() || '';
          const val = Array.isArray(field.values) ? field.values[0] : '';
          fieldDetails[field.name] = val;

          if (fieldName.includes('full_name') || fieldName.includes('name')) {
            name = val;
          } else if (fieldName.includes('phone') || fieldName.includes('mobile')) {
            phone = val;
          } else if (fieldName.includes('email')) {
            email = val;
          }
        }
      }

      const leadDocUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/meta_leads/${leadId}`;
      const firestorePayload = {
        fields: {
          leadId: { stringValue: leadId },
          formId: { stringValue: formId },
          name: { stringValue: name },
          phone: { stringValue: phone },
          email: { stringValue: email },
          adName: { stringValue: 'Meta Lead Ad' },
          formName: { stringValue: 'Lead Form' },
          smsStatus: { stringValue: 'not_sent' },
          createdAt: { stringValue: createdTime || new Date().toISOString() },
          rawFields: { stringValue: JSON.stringify(fieldDetails) }
        }
      };

      const saveRes = await fetch(leadDocUrl, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(firestorePayload)
      });

      if (saveRes.ok) syncedCount++;
    }

    return new Response(JSON.stringify({
      success: true,
      syncedCount,
      message: `Successfully synced ${syncedCount} leads from Meta!`
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    console.error('Meta Sync API Error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error', details: err.message }), { status: 500 });
  }
}
