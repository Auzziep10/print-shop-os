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
    let pageId = process.env.META_PAGE_ID || '1212784378585087';

    // If environment variables are not set in Vercel, fallback to Firestore settings
    if (!accessToken) {
      const projectId = 'print-shop-os-f8092';
      const settingsUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/settings/meta`;

      const settingsRes = await fetch(settingsUrl, {
        headers: { 'Authorization': `Bearer ${idToken}` }
      });

      if (settingsRes.ok) {
        const settingsDoc = await settingsRes.json();
        const fields = settingsDoc.fields || {};
        accessToken = fields.accessToken?.stringValue || '';
        if (!formId) formId = fields.formId?.stringValue || '';
        if (!pageId) pageId = fields.pageId?.stringValue || '1212784378585087';
      }
    }

    if (!accessToken) {
      return new Response(JSON.stringify({ error: 'Meta Access Token is missing. Please set META_ACCESS_TOKEN in Vercel Environment Variables or in Settings > Meta Lead Ads Integration.' }), { status: 400 });
    }

    const projectId = 'print-shop-os-f8092';
    let leadsToProcess: any[] = [];
    let errors: string[] = [];

    // Helper to fetch leads for a specific form ID
    const fetchLeadsForForm = async (fId: string, token: string, formName?: string) => {
      const url = `https://graph.facebook.com/v19.0/${fId}/leads?access_token=${encodeURIComponent(token)}&limit=50`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const items = data.data || [];
        items.forEach((lead: any) => {
          lead._formName = formName || 'Lead Form';
          lead._formId = fId;
        });
        return items;
      } else {
        const errData = await res.json().catch(() => ({}));
        errors.push(errData.error?.message || res.statusText);
        return [];
      }
    };

    // Helper to fetch forms for a given target ID (Page ID or 'me')
    const fetchFormsForTarget = async (targetId: string, token: string) => {
      const url = `https://graph.facebook.com/v19.0/${targetId}/leadgen_forms?access_token=${encodeURIComponent(token)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        return data.data || [];
      }
      return [];
    };

    // 1. Try Direct Form ID if provided (only if it doesn't look like an ad set ID error)
    if (formId && formId !== '2160559974672615') {
      const directLeads = await fetchLeadsForForm(formId, accessToken);
      if (directLeads.length > 0) {
        leadsToProcess.push(...directLeads);
      }
    }

    // 2. Try Auto-Discovery on Page IDs ('1212784378585087', pageId, 'me')
    if (leadsToProcess.length === 0) {
      const targets = Array.from(new Set([pageId, '1212784378585087', 'me'])).filter(Boolean);
      for (const target of targets) {
        if (leadsToProcess.length > 0) break;
        const forms = await fetchFormsForTarget(target, accessToken);
        for (const f of forms) {
          const fLeads = await fetchLeadsForForm(f.id, accessToken, f.name);
          leadsToProcess.push(...fLeads);
        }
      }
    }

    // 3. If User Access Token was provided, try fetching User's Pages (/me/accounts) to find Page tokens
    if (leadsToProcess.length === 0) {
      const accountsUrl = `https://graph.facebook.com/v19.0/me/accounts?access_token=${encodeURIComponent(accessToken)}`;
      const accountsRes = await fetch(accountsUrl);
      if (accountsRes.ok) {
        const accountsData = await accountsRes.json();
        const pages = accountsData.data || [];
        for (const p of pages) {
          if (leadsToProcess.length > 0) break;
          const pToken = p.access_token || accessToken;
          const pForms = await fetchFormsForTarget(p.id, pToken);
          for (const f of pForms) {
            const fLeads = await fetchLeadsForForm(f.id, pToken, f.name);
            leadsToProcess.push(...fLeads);
          }
        }
      }
    }

    // If still no leads and we received errors from Meta, report clean message
    if (leadsToProcess.length === 0 && errors.length > 0 && !formId.includes('2160559974672615')) {
      return new Response(JSON.stringify({
        error: `Meta API notice: ${errors[0]}. Please check your Page Access Token for INKTHEORY.studio.`
      }), { status: 400 });
    }

    let syncedCount = 0;

    // Upsert leads to Firestore meta_leads collection
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
      message: syncedCount > 0 ? `Successfully synced ${syncedCount} leads from Meta!` : 'Sync complete! No new lead form submissions found on Meta.'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    console.error('Meta Sync API Error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error', details: err.message }), { status: 500 });
  }
}
