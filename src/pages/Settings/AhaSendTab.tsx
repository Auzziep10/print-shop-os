import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import { Mail, Key, Eye, EyeOff, Save, Loader2, SendHorizontal, CheckCircle2, AlertCircle } from 'lucide-react';
import { tokens } from '../../lib/tokens';
import { PillButton } from '../../components/ui/PillButton';

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

      // Fetch the Firebase ID Token to authenticate with the backend function
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

      <form onSubmit={handleSave} className="space-y-6 max-w-2xl">
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

          {/* Account ID (Required for v2 keys starting with 'aha-sk-') */}
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
