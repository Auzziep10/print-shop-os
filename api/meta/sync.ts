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
    let diagnosticLogs: string[] = [];

    // Helper to fetch leads for a specific form ID
    const fetchLeadsForForm = async (fId: string, token: string, formName?: string) => {
      const url = `https://graph.facebook.com/v19.0/${fId}/leads?access_token=${encodeURIComponent(token)}&limit=100`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const items = data.data || [];
        items.forEach((lead: any) => {
          lead._formName = formName || 'Lead Form';
          lead._formId = fId;
        });
        diagnosticLogs.push(`Form ${fId}: ${items.length} leads found`);
        return items;
      } else {
        const errData = await res.json().catch(() => ({}));
        diagnosticLogs.push(`Form ${fId} error: ${errData.error?.message || res.statusText}`);
        return [];
      }
    };

    // Helper to fetch forms for a given target ID (Page ID or 'me') using a specific token
    const fetchFormsForTarget = async (targetId: string, token: string) => {
      let url = `https://graph.facebook.com/v19.0/${targetId}/leadgen_forms?access_token=${encodeURIComponent(token)}`;
      let res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const forms = data.data || [];
        diagnosticLogs.push(`Target ${targetId}: ${forms.length} forms found`);
        return forms;
      }

      url = `https://graph.facebook.com/v19.0/${targetId}?fields=leadgen_forms{id,name}&access_token=${encodeURIComponent(token)}`;
      res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const forms = data.leadgen_forms?.data || [];
        diagnosticLogs.push(`Target ${targetId} via fields: ${forms.length} forms found`);
        return forms;
      } else {
        const errData = await res.json().catch(() => ({}));
        diagnosticLogs.push(`Target ${targetId} error: ${errData.error?.message || res.statusText}`);
        return [];
      }
    };

    // Step 1: Query User Accounts (/me/accounts) to convert User Token into Page Access Tokens
    const pageTokensMap: Record<string, string> = {};
    const accountsUrl = `https://graph.facebook.com/v19.0/me/accounts?access_token=${encodeURIComponent(accessToken)}`;
    const accountsRes = await fetch(accountsUrl);
    if (accountsRes.ok) {
      const accountsData = await accountsRes.json();
      const pages = accountsData.data || [];
      diagnosticLogs.push(`User Accounts: found ${pages.length} managed pages`);
      for (const p of pages) {
        if (p.id && p.access_token) {
          pageTokensMap[p.id] = p.access_token;
        }
      }
    } else {
      const errData = await accountsRes.json().catch(() => ({}));
      diagnosticLogs.push(`User Accounts query: ${errData.error?.message || accountsRes.statusText}`);
    }

    // Step 2: Direct Form ID query using available page token or fallback user token
    if (formId) {
      const activeToken = pageTokensMap[pageId] || accessToken;
      const directLeads = await fetchLeadsForForm(formId, activeToken);
      if (directLeads.length > 0) {
        leadsToProcess.push(...directLeads);
      }
    }

    // Step 3: Query Page Lead Forms using Page Access Tokens
    if (leadsToProcess.length === 0) {
      const pageTargets = Array.from(new Set([pageId, '1212784378585087', ...Object.keys(pageTokensMap)])).filter(Boolean);
      for (const target of pageTargets) {
        const pToken = pageTokensMap[target] || accessToken;
        const forms = await fetchFormsForTarget(target, pToken);
        for (const f of forms) {
          const fLeads = await fetchLeadsForForm(f.id, pToken, f.name);
          leadsToProcess.push(...fLeads);
        }
      }
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

    const diagSummary = diagnosticLogs.join(' | ');

    return new Response(JSON.stringify({
      success: true,
      syncedCount,
      message: syncedCount > 0 
        ? `Successfully synced ${syncedCount} leads from Meta!` 
        : `Sync status: ${diagSummary || 'No lead submissions returned.'}`
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    console.error('Meta Sync API Error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error', details: err.message }), { status: 500 });
  }
}
