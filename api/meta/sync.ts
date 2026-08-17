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

    // 1. Check Vercel Environment Variables first (Option B - Maximum Security)
    let accessToken = process.env.META_ACCESS_TOKEN || '';
    let formId = process.env.META_FORM_ID || '';
    let pageId = process.env.META_PAGE_ID || '';

    // If environment variables are not set in Vercel, fallback to Firestore settings
    if (!accessToken || !formId) {
      const projectId = 'print-shop-os-f8092';
      const settingsUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/settings/meta`;

      const settingsRes = await fetch(settingsUrl, {
        headers: { 'Authorization': `Bearer ${idToken}` }
      });

      if (settingsRes.ok) {
        const settingsDoc = await settingsRes.json();
        const fields = settingsDoc.fields || {};
        if (!accessToken) accessToken = fields.accessToken?.stringValue || '';
        if (!formId) formId = fields.formId?.stringValue || '';
        if (!pageId) pageId = fields.pageId?.stringValue || '';
      }
    }

    if (!accessToken) {
      return new Response(JSON.stringify({ error: 'Meta Access Token is missing. Please set META_ACCESS_TOKEN in Vercel Environment Variables or in Settings > Meta Lead Ads Integration.' }), { status: 400 });
    }

    const projectId = 'print-shop-os-f8092';
    let leadsToProcess: any[] = [];
    let lastErrorMsg = '';

    // Strategy A: Direct Lead Form Query (/v19.0/{formId}/leads)
    if (formId) {
      const directUrl = `https://graph.facebook.com/v19.0/${formId}/leads?access_token=${encodeURIComponent(accessToken)}&limit=50`;
      const directRes = await fetch(directUrl);
      if (directRes.ok) {
        const directData = await directRes.json();
        leadsToProcess = directData.data || [];
      } else {
        const errData = await directRes.json().catch(() => ({}));
        lastErrorMsg = errData.error?.message || directRes.statusText;
      }
    }

    // Strategy B: If Strategy A returned no leads / error, treat formId or pageId as a Page ID (/v19.0/{id}/leadgen_forms)
    if (leadsToProcess.length === 0) {
      const pageTargetId = pageId || formId || 'me';
      const formsUrl = `https://graph.facebook.com/v19.0/${pageTargetId}/leadgen_forms?access_token=${encodeURIComponent(accessToken)}`;
      const formsRes = await fetch(formsUrl);

      if (formsRes.ok) {
        const formsData = await formsRes.json();
        const formsList = formsData.data || [];

        for (const f of formsList) {
          const fLeadsUrl = `https://graph.facebook.com/v19.0/${f.id}/leads?access_token=${encodeURIComponent(accessToken)}&limit=50`;
          const fLeadsRes = await fetch(fLeadsUrl);
          if (fLeadsRes.ok) {
            const fLeadsData = await fLeadsRes.json();
            const fLeads = fLeadsData.data || [];
            fLeads.forEach((item: any) => {
              item._formName = f.name;
              item._formId = f.id;
            });
            leadsToProcess.push(...fLeads);
          }
        }
      }
    }

    // Strategy C: If still no leads and we had a specific error from Meta, report friendly instructions
    if (leadsToProcess.length === 0 && lastErrorMsg) {
      return new Response(JSON.stringify({
        error: `Meta Graph API error: ${lastErrorMsg}. Please ensure your Page Access Token was generated for the Page that owns this form, and has 'leads_retrieval' permission.`
      }), { status: 400 });
    }

    let syncedCount = 0;

    // 3. Upsert leads to Firestore meta_leads collection
    for (const lead of leadsToProcess) {
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
          formId: { stringValue: lead._formId || formId || '' },
          name: { stringValue: name },
          phone: { stringValue: phone },
          email: { stringValue: email },
          adName: { stringValue: 'Meta Lead Ad' },
          formName: { stringValue: lead._formName || 'Lead Form' },
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
