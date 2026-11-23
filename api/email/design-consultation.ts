import { getServerDb } from '../_lib/serverFirestore.js';

const PROJECT_ID = 'print-shop-os-f8092';

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isAdminOrDesignerRole(role: unknown): boolean {
  if (typeof role !== 'string') return false;
  const r = role.trim().toLowerCase();
  return r === 'admin' || r.includes('designer');
}

function isValidEmail(email: unknown): email is string {
  if (typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (!trimmed || !trimmed.includes('@')) return false;
  // Skip synthetic phone-auth placeholder emails
  if (trimmed.toLowerCase().endsWith('@customer.inktheory.studio')) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

interface AhaSendConfig {
  apiKey: string;
  fromEmail: string;
  fromName?: string;
  accountId?: string;
}

async function loadConfigAndRecipients(idToken: string): Promise<{
  ahasend: AhaSendConfig | null;
  recipients: Array<{ email: string; name?: string; role?: string }>;
  serverDb: ReturnType<typeof getServerDb> | null;
}> {
  // Primary path: Server-side Firestore SDK (works for all authenticated roles including Client/Sales)
  try {
    const db = getServerDb();
    const [ahasendSnap, usersSnap] = await Promise.all([
      db.collection('settings').doc('ahasend').get(),
      db.collection('users').get(),
    ]);

    const ahasendData = ahasendSnap.exists ? ahasendSnap.data() || {} : null;
    const ahasend: AhaSendConfig | null =
      ahasendData?.apiKey && ahasendData?.fromEmail
        ? {
            apiKey: String(ahasendData.apiKey),
            fromEmail: String(ahasendData.fromEmail),
            fromName: ahasendData.fromName ? String(ahasendData.fromName) : undefined,
            accountId: ahasendData.accountId ? String(ahasendData.accountId) : undefined,
          }
        : null;

    const seen = new Set<string>();
    const recipients: Array<{ email: string; name?: string; role?: string }> = [];
    usersSnap.forEach((docSnap) => {
      const data = docSnap.data() || {};
      if (!isAdminOrDesignerRole(data.role)) return;
      if (!isValidEmail(data.email)) return;
      const normalized = data.email.trim().toLowerCase();
      if (seen.has(normalized)) return;
      seen.add(normalized);
      recipients.push({
        email: data.email.trim(),
        name: data.name ? String(data.name) : undefined,
        role: String(data.role),
      });
    });

    return { ahasend, recipients, serverDb: db };
  } catch (serverErr) {
    console.warn('[design-consultation] Server Firestore unavailable, falling back to REST with user token:', serverErr);
  }

  // Fallback path: Firestore REST API with caller's Firebase ID token
  const headers = { Authorization: `Bearer ${idToken}` };
  const [ahasendRes, usersRes] = await Promise.all([
    fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/settings/ahasend`, {
      headers,
    }),
    fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users?pageSize=500`, {
      headers,
    }),
  ]);

  let ahasend: AhaSendConfig | null = null;
  if (ahasendRes.ok) {
    const docData = await ahasendRes.json();
    const fields = docData.fields || {};
    const apiKey = fields.apiKey?.stringValue;
    const fromEmail = fields.fromEmail?.stringValue;
    if (apiKey && fromEmail) {
      ahasend = {
        apiKey,
        fromEmail,
        fromName: fields.fromName?.stringValue,
        accountId: fields.accountId?.stringValue,
      };
    }
  }

  const seen = new Set<string>();
  const recipients: Array<{ email: string; name?: string; role?: string }> = [];
  if (usersRes.ok) {
    const usersData = await usersRes.json();
    const docs = Array.isArray(usersData.documents) ? usersData.documents : [];
    for (const d of docs) {
      const f = d.fields || {};
      const role = f.role?.stringValue;
      const email = f.email?.stringValue;
      if (!isAdminOrDesignerRole(role) || !isValidEmail(email)) continue;
      const normalized = email.trim().toLowerCase();
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      recipients.push({
        email: email.trim(),
        name: f.name?.stringValue,
        role,
      });
    }
  }

  return { ahasend, recipients, serverDb: null };
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized: Missing auth token' }, 401);
    }
    const idToken = authHeader.substring(7);

    const body = await req.json().catch(() => null);
    if (!body) {
      return json({ error: 'Invalid JSON body' }, 400);
    }

    const customerId = String(body.customerId || '').trim();
    const companyName = String(body.companyName || '').trim();
    const contactName = String(body.contactName || '').trim();
    const contactEmail = String(body.contactEmail || '').trim();
    const contactPhone = String(body.contactPhone || '').trim();
    const preferredDate = String(body.preferredDate || '').trim();
    const preferredTime = String(body.preferredTime || '').trim();
    const notes = String(body.notes || '').trim();
    const origin = String(body.origin || '').trim();

    if (!contactName && !companyName) {
      return json({ error: 'Please provide your name or company name.' }, 400);
    }

    const { ahasend, recipients, serverDb } = await loadConfigAndRecipients(idToken);

    if (!ahasend) {
      return json(
        { error: 'Email notifications are not configured yet. Please configure AhaSend in Settings.' },
        400
      );
    }

    if (recipients.length === 0) {
      return json(
        { error: 'No Admin or Designer team members with valid email addresses were found.' },
        400
      );
    }

    const displayClient = companyName && contactName && companyName.toLowerCase() !== contactName.toLowerCase()
      ? `${companyName} (${contactName})`
      : companyName || contactName;

    const subject = `Design Consultation Request — ${displayClient}`;
    const customerProfileUrl = origin && customerId ? `${origin}/customers/${customerId}` : '';

    const textLines = [
      `New Design Consultation Request`,
      ``,
      `Client: ${displayClient}`,
      contactName ? `Contact Name: ${contactName}` : null,
      companyName ? `Company: ${companyName}` : null,
      contactEmail ? `Email: ${contactEmail}` : null,
      contactPhone ? `Phone: ${contactPhone}` : null,
      preferredDate ? `Preferred Date: ${preferredDate}` : null,
      preferredTime ? `Preferred Time: ${preferredTime}` : null,
      notes ? `\nNotes / Project Details:\n${notes}` : null,
      customerProfileUrl ? `\nView Customer Profile: ${customerProfileUrl}` : null,
    ].filter(Boolean);

    const textBody = textLines.join('\n');

    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #222; line-height: 1.6; background-color: #f7f7f5;">
        <div style="background-color: #ffffff; border: 1px solid #e5e5e0; border-radius: 16px; padding: 32px; box-shadow: 0 4px 12px rgba(0,0,0,0.025);">
          <p style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; color: #777; font-weight: 700; margin: 0 0 8px 0;">Client Portal Request</p>
          <h2 style="font-size: 22px; color: #111; margin: 0 0 20px 0; border-bottom: 1px solid #f0f0ed; padding-bottom: 14px; font-weight: 700;">Design Consultation Request</h2>
          <p style="font-size: 15px; color: #444; margin: 0 0 20px 0;">
            <strong>${escapeHtml(displayClient)}</strong> has requested a consultation to meet with the design team.
          </p>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;">
            ${companyName ? `<tr><td style="padding: 8px 0; color: #777; width: 140px; vertical-align: top;">Company</td><td style="padding: 8px 0; color: #111; font-weight: 600;">${escapeHtml(companyName)}</td></tr>` : ''}
            ${contactName ? `<tr><td style="padding: 8px 0; color: #777; width: 140px; vertical-align: top;">Contact</td><td style="padding: 8px 0; color: #111; font-weight: 600;">${escapeHtml(contactName)}</td></tr>` : ''}
            ${contactEmail ? `<tr><td style="padding: 8px 0; color: #777; width: 140px; vertical-align: top;">Email</td><td style="padding: 8px 0; color: #111;"><a href="mailto:${escapeHtml(contactEmail)}" style="color: #111;">${escapeHtml(contactEmail)}</a></td></tr>` : ''}
            ${contactPhone ? `<tr><td style="padding: 8px 0; color: #777; width: 140px; vertical-align: top;">Phone</td><td style="padding: 8px 0; color: #111;">${escapeHtml(contactPhone)}</td></tr>` : ''}
            ${preferredDate ? `<tr><td style="padding: 8px 0; color: #777; width: 140px; vertical-align: top;">Preferred Date</td><td style="padding: 8px 0; color: #111; font-weight: 600;">${escapeHtml(preferredDate)}</td></tr>` : ''}
            ${preferredTime ? `<tr><td style="padding: 8px 0; color: #777; width: 140px; vertical-align: top;">Preferred Time</td><td style="padding: 8px 0; color: #111; font-weight: 600;">${escapeHtml(preferredTime)}</td></tr>` : ''}
          </table>
          ${
            notes
              ? `<div style="background-color: #fafaf8; border: 1px solid #ecece7; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
                  <p style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #777; font-weight: 700; margin: 0 0 6px 0;">Project Notes</p>
                  <div style="font-size: 14px; color: #333; white-space: pre-wrap;">${escapeHtml(notes)}</div>
                </div>`
              : ''
          }
          ${
            customerProfileUrl
              ? `<div style="margin-top: 8px; margin-bottom: 12px;">
                  <a href="${escapeHtml(customerProfileUrl)}" style="display: inline-block; background-color: #111; color: #fff; text-decoration: none; font-size: 13px; font-weight: 700; padding: 11px 22px; border-radius: 999px;">Open Customer Profile &rarr;</a>
                </div>`
              : ''
          }
          <hr style="border: 0; border-top: 1px solid #f0f0ed; margin: 28px 0 16px 0;" />
          <p style="font-size: 11px; color: #999; text-align: center; margin: 0;">Sent to all Admins and Designers from the INKTHEORY Client Portal.</p>
        </div>
      </div>
    `;

    const isV2 = ahasend.apiKey.startsWith('aha-sk-');
    if (isV2 && !ahasend.accountId) {
      return json(
        { error: 'AhaSend API v2 key requires an Account ID. Please add it in Settings.' },
        400
      );
    }

    if (isV2) {
      const ahaRes = await fetch(`https://api.ahasend.com/v2/accounts/${ahasend.accountId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ahasend.apiKey}`,
        },
        body: JSON.stringify({
          from: {
            email: ahasend.fromEmail,
            name: ahasend.fromName || undefined,
          },
          recipients: recipients.map((r) => ({
            email: r.email,
            name: r.name || undefined,
          })),
          reply_to: isValidEmail(contactEmail)
            ? { email: contactEmail, name: contactName || companyName || undefined }
            : undefined,
          subject,
          text_content: textBody,
          html_content: htmlBody,
        }),
      });

      const ahaData = await ahaRes.json().catch(() => ({}));
      if (!ahaRes.ok) {
        console.error('[design-consultation] AhaSend v2 error:', ahaData);
        return json(
          { error: `Email delivery failed: ${ahaData.message || ahaData.status || ahaRes.statusText}` },
          ahaRes.status
        );
      }
    } else {
      const results = await Promise.all(
        recipients.map(async (r) => {
          const res = await fetch('https://api.ahasend.com/v1/email/send', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Api-Key': ahasend.apiKey,
            },
            body: JSON.stringify({
              from: ahasend.fromName ? `${ahasend.fromName} <${ahasend.fromEmail}>` : ahasend.fromEmail,
              to: r.email,
              subject,
              text: textBody,
              html: htmlBody,
            }),
          });
          return { email: r.email, ok: res.ok, status: res.status };
        })
      );
      const anySucceeded = results.some((r) => r.ok);
      if (!anySucceeded) {
        return json({ error: 'Failed to deliver consultation request emails via AhaSend.' }, 502);
      }
    }

    // Best-effort record in Firestore for audit/history
    if (serverDb && customerId) {
      try {
        await serverDb.collection('consultation_requests').add({
          customerId,
          companyName,
          contactName,
          contactEmail,
          contactPhone,
          preferredDate,
          preferredTime,
          notes,
          notifiedEmails: recipients.map((r) => r.email),
          createdAt: new Date().toISOString(),
        });
      } catch (logErr) {
        console.warn('[design-consultation] Could not log consultation request:', logErr);
      }
    }

    return json({
      success: true,
      notifiedCount: recipients.length,
    });
  } catch (err: any) {
    console.error('[design-consultation] Error:', err);
    return json({ error: 'Internal server error', details: err?.message }, 500);
  }
}
