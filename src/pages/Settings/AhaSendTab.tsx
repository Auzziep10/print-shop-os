import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import { Mail, Key, Eye, EyeOff, Save, Loader2, SendHorizontal, CheckCircle2, AlertCircle } from 'lucide-react';
import { tokens } from '../../lib/tokens';
import { PillButton } from '../../components/ui/PillButton';

interface StatusEmailTemplate {
  enabled: boolean;
  subject: string;
  template: string;
}

const DEFAULT_EMAIL_TEMPLATES: Record<string, StatusEmailTemplate> = {
  '0': { 
    enabled: false, 
    subject: 'Quote Request Received - Order #{orderId}',
    template: 'Hi {customerName},\n\nYour quote request for Order #{orderId} ("{orderTitle}") has been received! Our design team is currently reviewing your details and generating mockups. We will contact you shortly.\n\nBest regards,\nWOVN Team'
  },
  '1': { 
    enabled: false, 
    subject: 'Your Order #{orderId} is Under Review',
    template: 'Hi {customerName},\n\nYour Order #{orderId} ("{orderTitle}") is now Under Review. We are inspecting the details and will update you shortly.\n\nBest regards,\nWOVN Team'
  },
  '2': { 
    enabled: false, 
    subject: 'Quote Prepared for Order #{orderId}',
    template: 'Hi {customerName},\n\nGood news! The quote and design mockups for Order #{orderId} ("{orderTitle}") are now prepared and ready for your review.\n\nPlease log into your client dashboard to review the proposal and approve the quote to proceed.\n\nBest regards,\nWOVN Team'
  },
  '3': { 
    enabled: false, 
    subject: 'Action Required: Payment Awaiting for Order #{orderId}',
    template: 'Hi {customerName},\n\nOrder #{orderId} ("{orderTitle}") has been approved and is now Awaiting Payment.\n\nYou can view your invoice and complete your payment directly within your client dashboard.\n\nBest regards,\nWOVN Team'
  },
  '4': { 
    enabled: false, 
    subject: 'Payment Received: Sourcing Materials for Order #{orderId}',
    template: 'Hi {customerName},\n\nThank you! We have received your payment. We are now sourcing the required garments and materials for Order #{orderId} ("{orderTitle}").\n\nBest regards,\nWOVN Team'
  },
  '5': { 
    enabled: false, 
    subject: 'Materials Sourced for Order #{orderId}',
    template: 'Hi {customerName},\n\nGarments and blank materials have been successfully ordered/sourced for Order #{orderId} ("{orderTitle}").\n\nBest regards,\nWOVN Team'
  },
  '6': { 
    enabled: false, 
    subject: 'Production Started: Order #{orderId}',
    template: 'Hi {customerName},\n\nYour Order #{orderId} ("{orderTitle}") is now in production! Our team is currently printing/decorating your garments.\n\nBest regards,\nWOVN Team'
  },
  '7': { 
    enabled: true, 
    subject: 'Your Order #{orderId} has Shipped!',
    template: 'Great news {customerName}!\n\nOrder #{orderId} ("{orderTitle}") has been completed and shipped!\n\nTracking Details:\nCarrier: {trackingCarrier}\nTracking Number: {trackingNumber}\n\nYou can track your shipment using the link in your dashboard.\n\nBest regards,\nWOVN Team'
  },
  '8': { 
    enabled: true, 
    subject: 'Order #{orderId} Completed & Live',
    template: 'Hi {customerName},\n\nOrder #{orderId} ("{orderTitle}") has been marked as received and is now complete/live. Thank you for printing with us!\n\nBest regards,\nWOVN Team'
  }
};

const STATUS_LABELS = [
  'Request Created (Quote)',
  'Under Review',
  'Quote Prepared',
  'Awaiting Payment',
  'Sourcing',
  'Ordered',
  'In Production',
  'Shipped / Inventory',
  'Received / Live'
];

export function AhaSendTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  // Form states
  const [apiKey, setApiKey] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [fromName, setFromName] = useState('');
  const [accountId, setAccountId] = useState('');
  const [templates, setTemplates] = useState<Record<string, StatusEmailTemplate>>(DEFAULT_EMAIL_TEMPLATES);
  const [welcomeTemplate, setWelcomeTemplate] = useState<StatusEmailTemplate>({
    enabled: true,
    subject: 'Welcome to your Client Portal',
    template: 'Hi {customerName},\n\nWelcome! A customer account has been created for you.\n\nYou can access your client portal and view all your orders, invoices, and designs by logging in with your email ({customerEmail}) here:\n{portalUrl}\n\nBest regards,\nWOVN Team'
  });

  // Status message states
  const [saveStatus, setSaveStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [testStatus, setTestStatus] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docRef = doc(db, 'settings', 'ahasend');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setApiKey(data.apiKey || '');
          setFromEmail(data.fromEmail || '');
          setFromName(data.fromName || '');
          setAccountId(data.accountId || '');
          if (data.templates) {
            setTemplates(prev => ({
              ...prev,
              ...data.templates
            }));
          }
          if (data.welcome) {
            setWelcomeTemplate(data.welcome);
          }
        }
      } catch (err) {
        console.error("Error fetching AhaSend settings:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    if (apiKey.trim().startsWith('aha-sk-') && !accountId.trim()) {
      setSaveStatus({ success: false, message: 'Account ID is required when using a v2 API Key.' });
      return;
    }

    setSaving(true);
    setSaveStatus(null);
    setTestStatus(null);

    try {
      await setDoc(
        doc(db, 'settings', 'ahasend'),
        {
          apiKey: apiKey.trim(),
          fromEmail: fromEmail.trim().toLowerCase(),
          fromName: fromName.trim(),
          accountId: accountId.trim(),
          templates: templates,
          welcome: welcomeTemplate,
          updatedAt: new Date().toISOString()
        },
        { merge: true }
      );
      setSaveStatus({ success: true, message: 'AhaSend integration settings saved successfully!' });
    } catch (err: any) {
      console.error("Error saving AhaSend settings:", err);
      setSaveStatus({ success: false, message: `Failed to save settings: ${err.message || 'Unknown error'}` });
    } finally {
      setSaving(false);
    }
  };

  const handleTemplateToggle = (statusKey: string) => {
    setTemplates(prev => {
      const current = prev[statusKey] || { enabled: false, subject: '', template: '' };
      return {
        ...prev,
        [statusKey]: {
          ...current,
          enabled: !current.enabled
        }
      };
    });
  };

  const handleTemplateSubjectChange = (statusKey: string, val: string) => {
    setTemplates(prev => {
      const current = prev[statusKey] || { enabled: false, subject: '', template: '' };
      return {
        ...prev,
        [statusKey]: {
          ...current,
          subject: val
        }
      };
    });
  };

  const handleTemplateTextChange = (statusKey: string, val: string) => {
    setTemplates(prev => {
      const current = prev[statusKey] || { enabled: false, subject: '', template: '' };
      return {
        ...prev,
        [statusKey]: {
          ...current,
          template: val
        }
      };
    });
  };

  const handleTestConnection = async () => {
    if (!apiKey || !fromEmail) {
      setTestStatus({ success: false, message: 'Please provide both an API Key and Sender Email before testing.' });
      return;
    }

    if (apiKey.startsWith('aha-sk-') && !accountId) {
      setTestStatus({ success: false, message: 'Please provide an Account ID before testing.' });
      return;
    }

    setTesting(true);
    setTestStatus(null);

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('You must be logged in to test the connection.');
      }

      const idToken = await currentUser.getIdToken();

      const response = await fetch('/api/email/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          to: currentUser.email || '',
          subject: 'AhaSend Connection Test',
          text: `Hi ${currentUser.displayName || 'there'},\n\nYour connection to AhaSend is working successfully!\n\nDetails:\nSender Name: ${fromName}\nSender Email: ${fromEmail}\n\nHave a great day!`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; color: #111;">
              <div style="background-color: #fcfbf9; border: 1px solid #e5e5e0; border-radius: 12px; padding: 32px; box-shadow: 0 4px 12px rgba(0,0,0,0.02);">
                <h2 style="font-family: Georgia, Cambria, 'Times New Roman', Times, serif; font-size: 24px; color: #000; margin-top: 0; margin-bottom: 16px;">AhaSend Integration Test</h2>
                <p style="font-size: 15px; line-height: 1.6; color: #444; margin-bottom: 24px;">Hi ${currentUser.displayName || 'there'},</p>
                <div style="background-color: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; border-radius: 8px; padding: 16px; margin-bottom: 24px; font-size: 14px; font-weight: 500; display: flex; align-items: center; gap: 8px;">
                  🚀 Connection established successfully!
                </div>
                <p style="font-size: 14px; line-height: 1.6; color: #666; margin-bottom: 8px;">Your configurations are as follows:</p>
                <ul style="margin: 0; padding-left: 20px; font-size: 14px; color: #444; line-height: 1.6;">
                  <li><strong>Sender Name:</strong> ${fromName || '(None)'}</li>
                  <li><strong>Sender Email:</strong> ${fromEmail}</li>
                </ul>
                <hr style="border: 0; border-top: 1px solid #e5e5e0; margin: 32px 0 24px 0;" />
                <p style="font-size: 12px; color: #888; margin: 0; text-align: center;">Sent via your dashboard's serverless AhaSend integration.</p>
              </div>
            </div>
          `
        })
      });

      const data = await response.json();

      if (response.ok) {
        setTestStatus({ success: true, message: `Test email sent successfully to ${currentUser.email}! Check your inbox.` });
      } else {
        setTestStatus({ success: false, message: `Test connection failed: ${data.error || data.details || 'Unknown error'}` });
      }
    } catch (err: any) {
      console.error("Error testing AhaSend connection:", err);
      setTestStatus({ success: false, message: `Test connection failed: ${err.message || 'Unknown error'}` });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="animate-spin text-brand-secondary" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div>
        <h2 className={tokens.typography.h2 + " mb-1 flex items-center gap-2"}>
          <Mail className="text-brand-primary" size={20} />
          Email Integration (AhaSend)
        </h2>
        <p className={tokens.typography.bodyMuted}>
          Connect your AhaSend account to send transactional emails, alerts, and system notifications.
        </p>
      </div>

      {/* Save Settings Status Banner */}
      {saveStatus && (
        <div className={`p-4 rounded-xl border flex items-start gap-3 animate-in slide-in-from-top-2 duration-300 ${
          saveStatus.success 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
            : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          {saveStatus.success ? (
            <CheckCircle2 className="text-emerald-600 shrink-0 mt-0.5" size={18} />
          ) : (
            <AlertCircle className="text-rose-600 shrink-0 mt-0.5" size={18} />
          )}
          <div className="text-sm font-medium">{saveStatus.message}</div>
        </div>
      )}

      {/* Test Connection Status Banner */}
      {testStatus && (
        <div className={`p-4 rounded-xl border flex items-start gap-3 animate-in slide-in-from-top-2 duration-300 ${
          testStatus.success 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
            : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          {testStatus.success ? (
            <CheckCircle2 className="text-emerald-600 shrink-0 mt-0.5" size={18} />
          ) : (
            <AlertCircle className="text-rose-600 shrink-0 mt-0.5" size={18} />
          )}
          <div className="text-sm font-medium">{testStatus.message}</div>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-8 max-w-4xl">
        <div className="bg-white border border-brand-border rounded-xl p-6 shadow-sm space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-widest text-brand-secondary border-b border-brand-border/40 pb-2">
            AhaSend API Credentials
          </h3>
          <div className="space-y-4">
            <div>
              <label className={tokens.typography.label + " mb-2 block"}>AhaSend API Key</label>
              <div className="relative">
                <input
                  type={showApiKey ? "text" : "password"}
                  required
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className={tokens.components.input + " pr-12 w-full"}
                  placeholder="Enter your X-Api-Key"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-brand-secondary hover:text-brand-primary transition-colors"
                >
                  {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="text-[11px] text-brand-secondary/70 mt-1 flex items-center gap-1">
                <Key size={12} /> Retrieve this key from your AhaSend dashboard settings.
              </p>
            </div>

            {/* Account ID */}
            {apiKey.startsWith('aha-sk-') && (
              <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                <label className={tokens.typography.label + " mb-2 block"}>AhaSend Account ID</label>
                <input
                  type="text"
                  required
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className={tokens.components.input}
                  placeholder="Enter your Account ID (e.g., 12345)"
                />
                <p className="text-[11px] text-brand-secondary/70 mt-1">
                  Required because you are using a v2 API key. Locate this ID under **Account Info** in your AhaSend dashboard.
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className={tokens.typography.label + " mb-2 block"}>Sender Email</label>
                <input
                  type="email"
                  required
                  value={fromEmail}
                  onChange={(e) => setFromEmail(e.target.value)}
                  className={tokens.components.input}
                  placeholder="e.g. notifications@yourdomain.com"
                />
                <p className="text-[11px] text-brand-secondary/70 mt-1">
                  Must be a verified sender domain/email on your AhaSend account.
                </p>
              </div>

              <div>
                <label className={tokens.typography.label + " mb-2 block"}>Sender Name</label>
                <input
                  type="text"
                  value={fromName}
                  onChange={(e) => setFromName(e.target.value)}
                  className={tokens.components.input}
                  placeholder="e.g. Print Shop OS"
                />
                <p className="text-[11px] text-brand-secondary/70 mt-1">
                  The friendly name displayed in recipient inboxes.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Welcome Template */}
        <div className="bg-white border border-brand-border rounded-xl p-6 shadow-sm space-y-6">
          <div className="border-b border-brand-border/40 pb-2 flex justify-between items-center">
            <h3 className="text-sm font-bold uppercase tracking-widest text-brand-secondary">
              Customer Welcome Email (Account Created)
            </h3>
            <span className="text-xs text-brand-secondary/70">
              Variables: <code className="bg-neutral-100 px-1 py-0.5 rounded font-mono text-[10px]">{'{customerName}'}</code>, <code className="bg-neutral-100 px-1 py-0.5 rounded font-mono text-[10px]">{'{companyName}'}</code>, <code className="bg-neutral-100 px-1 py-0.5 rounded font-mono text-[10px]">{'{portalUrl}'}</code>, <code className="bg-neutral-100 px-1 py-0.5 rounded font-mono text-[10px]">{'{customerEmail}'}</code>
            </span>
          </div>

          <div className="flex flex-col lg:flex-row gap-6 items-start">
            <div className="w-full lg:w-1/4 flex items-center justify-between shrink-0">
              <div>
                <span className="text-xs font-bold text-brand-primary">Welcome Email</span>
                <p className="text-[11px] text-brand-secondary/70 mt-0.5">Sent immediately upon customer creation</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer"
                  checked={welcomeTemplate.enabled}
                  onChange={() => setWelcomeTemplate(prev => ({ ...prev, enabled: !prev.enabled }))}
                />
                <div className="w-9 h-5 bg-neutral-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-primary"></div>
              </label>
            </div>

            <div className="w-full lg:flex-1 space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-brand-secondary/70">Email Subject</label>
                <input
                  type="text"
                  disabled={!welcomeTemplate.enabled}
                  value={welcomeTemplate.subject}
                  onChange={(e) => setWelcomeTemplate(prev => ({ ...prev, subject: e.target.value }))}
                  className={`w-full text-xs bg-brand-bg/50 border border-brand-border rounded-lg px-3 py-2 focus:border-brand-primary focus:outline-none transition-colors ${
                    !welcomeTemplate.enabled ? 'bg-neutral-50 border-neutral-200 text-neutral-450 cursor-not-allowed font-semibold' : 'font-semibold text-neutral-800'
                  }`}
                  placeholder="e.g. Welcome to your Client Portal"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-brand-secondary/70">Email Body Message</label>
                <textarea
                  rows={4}
                  disabled={!welcomeTemplate.enabled}
                  value={welcomeTemplate.template}
                  onChange={(e) => setWelcomeTemplate(prev => ({ ...prev, template: e.target.value }))}
                  className={`w-full text-xs bg-brand-bg/50 border border-brand-border rounded-lg p-3 focus:border-brand-primary focus:outline-none transition-colors ${
                    !welcomeTemplate.enabled ? 'bg-neutral-50 border-neutral-200 text-neutral-400 cursor-not-allowed' : ''
                  }`}
                  placeholder="Enter welcome email body template"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Email Status Templates */}
        <div className="bg-white border border-brand-border rounded-xl p-6 shadow-sm space-y-6">
          <div className="border-b border-brand-border/40 pb-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <h3 className="text-sm font-bold uppercase tracking-widest text-brand-secondary">
              Status Change Email Templates
            </h3>
            <span className="text-xs text-brand-secondary/70">
              Variables: <code className="bg-neutral-100 px-1 py-0.5 rounded font-mono text-[10px]">{'{customerName}'}</code>, <code className="bg-neutral-100 px-1 py-0.5 rounded font-mono text-[10px]">{'{orderId}'}</code>, <code className="bg-neutral-100 px-1 py-0.5 rounded font-mono text-[10px]">{'{orderTitle}'}</code>, <code className="bg-neutral-100 px-1 py-0.5 rounded font-mono text-[10px]">{'{trackingCarrier}'}</code>, <code className="bg-neutral-100 px-1 py-0.5 rounded font-mono text-[10px]">{'{trackingNumber}'}</code>
            </span>
          </div>

          <div className="space-y-6 divide-y divide-brand-border/30">
            {STATUS_LABELS.map((label, index) => {
              const statusKey = index.toString();
              const templateConfig = templates[statusKey] || { enabled: false, subject: '', template: '' };

              return (
                <div key={statusKey} className={`pt-6 first:pt-0 flex flex-col lg:flex-row gap-6 items-start ${!templateConfig.enabled ? 'opacity-60' : ''}`}>
                  <div className="w-full lg:w-1/4 flex items-center justify-between shrink-0">
                    <div>
                      <span className="text-xs font-bold text-brand-primary">{label}</span>
                      <p className="text-[11px] text-brand-secondary/70 mt-0.5">Status Index: {index}</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer"
                        checked={templateConfig.enabled}
                        onChange={() => handleTemplateToggle(statusKey)}
                      />
                      <div className="w-9 h-5 bg-neutral-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-primary"></div>
                    </label>
                  </div>

                  <div className="w-full lg:flex-1 space-y-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-brand-secondary/70">Email Subject</label>
                      <input
                        type="text"
                        disabled={!templateConfig.enabled}
                        value={templateConfig.subject}
                        onChange={(e) => handleTemplateSubjectChange(statusKey, e.target.value)}
                        className={`w-full text-xs bg-brand-bg/50 border border-brand-border rounded-lg px-3 py-2 focus:border-brand-primary focus:outline-none transition-colors ${
                          !templateConfig.enabled ? 'bg-neutral-50 border-neutral-200 text-neutral-450 cursor-not-allowed font-semibold' : 'font-semibold text-neutral-800'
                        }`}
                        placeholder="e.g. Status Update for Order #{orderId}"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-brand-secondary/70">Email Body Message</label>
                      <textarea
                        rows={4}
                        disabled={!templateConfig.enabled}
                        value={templateConfig.template}
                        onChange={(e) => handleTemplateTextChange(statusKey, e.target.value)}
                        className={`w-full text-xs bg-brand-bg/50 border border-brand-border rounded-lg p-3 focus:border-brand-primary focus:outline-none transition-colors ${
                          !templateConfig.enabled ? 'bg-neutral-50 border-neutral-200 text-neutral-400 cursor-not-allowed' : ''
                        }`}
                        placeholder={`Enter email body template for status ${label}`}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-6 border-t border-brand-border flex flex-wrap gap-4">
          <PillButton
            variant="filled"
            type="submit"
            disabled={saving || testing}
            className="min-w-[140px] justify-center"
          >
            {saving ? (
              <Loader2 className="animate-spin" size={18} />
            ) : (
              <>
                <Save size={18} className="mr-2" />
                Save Settings
              </>
            )}
          </PillButton>

          <PillButton
            variant="outline"
            type="button"
            onClick={handleTestConnection}
            disabled={saving || testing || !apiKey || !fromEmail}
            className="min-w-[160px] justify-center"
          >
            {testing ? (
              <Loader2 className="animate-spin" size={18} />
            ) : (
              <>
                <SendHorizontal size={18} className="mr-2" />
                Test Connection
              </>
            )}
          </PillButton>
        </div>
      </form>
    </div>
  );
}
