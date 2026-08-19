import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Share2, Key, Eye, EyeOff, Save, Loader2, CheckCircle2, AlertCircle, RefreshCw, Copy, Check } from 'lucide-react';
import { tokens } from '../../lib/tokens';
import { PillButton } from '../../components/ui/PillButton';

const DEFAULT_META_SMS_TEMPLATE = "Hi {leadName}, thank you for inquiring via our Meta ad! We received your request. How can we help with your custom order?";

export function MetaAdsTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [copied, setCopied] = useState(false);

  // Form states
  const [accessToken, setAccessToken] = useState('');
  const [pageId, setPageId] = useState('');
  const [formId, setFormId] = useState('');
  const [verifyToken, setVerifyToken] = useState('print_shop_meta_webhook_secret');
  const [smsTemplate, setSmsTemplate] = useState(DEFAULT_META_SMS_TEMPLATE);
  const [autoSendSms, setAutoSendSms] = useState(false);

  // Status message states
  const [saveStatus, setSaveStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [testStatus, setTestStatus] = useState<{ success: boolean; message: string } | null>(null);

  const webhookUrl = `${window.location.origin}/api/meta/webhook`;

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docRef = doc(db, 'settings', 'meta');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setAccessToken(data.accessToken || '');
          setPageId(data.pageId || '');
          setFormId(data.formId || '');
          setVerifyToken(data.verifyToken || 'print_shop_meta_webhook_secret');
          setSmsTemplate(data.smsTemplate || DEFAULT_META_SMS_TEMPLATE);
          setAutoSendSms(data.autoSendSms ?? false);
        }
      } catch (err) {
        console.error("Error fetching Meta settings:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSaving(true);
    setSaveStatus(null);
    setTestStatus(null);

    try {
      await setDoc(
        doc(db, 'settings', 'meta'),
        {
          accessToken: accessToken.trim(),
          pageId: pageId.trim(),
          formId: formId.trim(),
          verifyToken: verifyToken.trim(),
          smsTemplate: smsTemplate.trim(),
          autoSendSms,
          updatedAt: new Date().toISOString()
        },
        { merge: true }
      );
      setSaveStatus({ success: true, message: 'Meta Ads integration settings saved successfully!' });
    } catch (err: any) {
      console.error("Error saving Meta settings:", err);
      setSaveStatus({ success: false, message: `Failed to save settings: ${err.message || 'Unknown error'}` });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!accessToken) {
      setTestStatus({ success: false, message: 'Please provide a Meta Access Token to test.' });
      return;
    }

    setTesting(true);
    setTestStatus(null);

    try {
      // Test Meta Graph API call using the token
      const targetUrl = formId 
        ? `https://graph.facebook.com/v19.0/${formId.trim()}?access_token=${encodeURIComponent(accessToken.trim())}`
        : `https://graph.facebook.com/v19.0/me?access_token=${encodeURIComponent(accessToken.trim())}`;

      const res = await fetch(targetUrl);
      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error?.message || 'Meta API returned an error.');
      }

      const info = data.name ? `Connected to Form/Page "${data.name}"` : 'Token validated successfully!';
      setTestStatus({ success: true, message: `Connection test passed! ${info}` });
    } catch (err: any) {
      console.error("Meta test error:", err);
      setTestStatus({ success: false, message: `Meta API test failed: ${err.message || 'Invalid access token'}` });
    } finally {
      setTesting(false);
    }
  };

  const handleCopyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
          <Share2 className="text-brand-primary" size={20} />
          Meta Ads & Lead Capture Integration
        </h2>
        <p className={tokens.typography.bodyMuted}>
          Connect your Facebook/Instagram Lead Ads to automatically capture leads, display them on the CRM page, and text leads using Quo.
        </p>
      </div>

      {/* Option B Vercel Env Var Recommendation Banner */}
      <div className="p-5 bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-xl shadow-md border border-slate-700 space-y-3">
        <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
          <Key size={18} />
          <span>Option B: Vercel Environment Variables (Maximum Security)</span>
        </div>
        <p className="text-xs text-slate-300">
          For maximum bank-grade security, you can store your API keys directly inside your <strong>Vercel Project Dashboard</strong> (under <em>Settings &gt; Environment Variables</em>). The backend will automatically detect these values without exposing tokens to the browser.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono pt-1">
          <div className="bg-slate-950/80 p-2.5 rounded border border-slate-700/60 flex items-center justify-between">
            <span className="text-slate-300">META_ACCESS_TOKEN</span>
            <span className="text-[10px] text-slate-500 font-sans">Meta Access Token</span>
          </div>
          <div className="bg-slate-950/80 p-2.5 rounded border border-slate-700/60 flex items-center justify-between">
            <span className="text-slate-300">META_FORM_ID</span>
            <span className="text-[10px] text-slate-500 font-sans">Instant Form ID</span>
          </div>
          <div className="bg-slate-950/80 p-2.5 rounded border border-slate-700/60 flex items-center justify-between">
            <span className="text-slate-300">META_VERIFY_TOKEN</span>
            <span className="text-[10px] text-slate-500 font-sans">Webhook Verify Token</span>
          </div>
          <div className="bg-slate-950/80 p-2.5 rounded border border-slate-700/60 flex items-center justify-between">
            <span className="text-slate-300">META_SMS_TEMPLATE</span>
            <span className="text-[10px] text-slate-500 font-sans">Custom SMS Template</span>
          </div>
        </div>
      </div>

      {/* Save Status Banner */}
      {saveStatus && (
        <div className={`p-4 rounded-xl border flex items-start gap-3 animate-in slide-in-from-top-2 duration-300 ${
          saveStatus.success ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          {saveStatus.success ? <CheckCircle2 className="text-emerald-600 shrink-0 mt-0.5" size={18} /> : <AlertCircle className="text-rose-600 shrink-0 mt-0.5" size={18} />}
          <div className="text-sm font-medium">{saveStatus.message}</div>
        </div>
      )}

      {/* Test Status Banner */}
      {testStatus && (
        <div className={`p-4 rounded-xl border flex items-start gap-3 animate-in slide-in-from-top-2 duration-300 ${
          testStatus.success ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          {testStatus.success ? <CheckCircle2 className="text-emerald-600 shrink-0 mt-0.5" size={18} /> : <AlertCircle className="text-rose-600 shrink-0 mt-0.5" size={18} />}
          <div className="text-sm font-medium">{testStatus.message}</div>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-8 max-w-4xl">
        {/* Credentials Card */}
        <div className="bg-white border border-brand-border rounded-xl p-6 shadow-sm space-y-6">
          <h3 className="text-sm font-bold uppercase tracking-widest text-brand-secondary border-b border-brand-border/40 pb-2">
            Meta API Credentials & Lead Form
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className={tokens.typography.label + " mb-2 block"}>Meta Access Token (Page or User Token)</label>
              <div className="relative">
                <input
                  type={showToken ? "text" : "password"}
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  className={tokens.components.input + " pr-12 w-full font-mono text-xs"}
                  placeholder="EAA..."
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-brand-secondary hover:text-brand-primary transition-colors"
                >
                  {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="text-[11px] text-brand-secondary/70 mt-1 flex items-center gap-1">
                <Key size={12} /> Access token generated in Meta Business App / Developer Console with <code className="bg-slate-100 px-1 py-0.5 rounded text-brand-primary font-mono text-[10px]">leads_retrieval</code> permission.
              </p>
            </div>

            <div>
              <label className={tokens.typography.label + " mb-2 block"}>Meta Lead Form ID (Optional / Recommended)</label>
              <input
                type="text"
                value={formId}
                onChange={(e) => setFormId(e.target.value)}
                className={tokens.components.input + " font-mono text-xs"}
                placeholder="e.g. 1029384756102"
              />
              <p className="text-[11px] text-brand-secondary/70 mt-1">
                Found in Meta Business Suite &gt; Instant Forms.
              </p>
            </div>

            <div>
              <label className={tokens.typography.label + " mb-2 block"}>Facebook Page ID (Optional)</label>
              <input
                type="text"
                value={pageId}
                onChange={(e) => setPageId(e.target.value)}
                className={tokens.components.input + " font-mono text-xs"}
                placeholder="e.g. 9876543210"
              />
              <p className="text-[11px] text-brand-secondary/70 mt-1">
                The Facebook Page running the Lead Ads.
              </p>
            </div>
          </div>
        </div>

        {/* Webhook Configuration Card */}
        <div className="bg-white border border-brand-border rounded-xl p-6 shadow-sm space-y-6">
          <h3 className="text-sm font-bold uppercase tracking-widest text-brand-secondary border-b border-brand-border/40 pb-2">
            Meta Real-time Webhook Setup
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className={tokens.typography.label + " mb-2 block"}>Callback URL (Copy into Meta Webhook config)</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={webhookUrl}
                  className="w-full text-xs font-mono bg-slate-50 border border-brand-border rounded-lg p-2 text-slate-700 select-all focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopyWebhook}
                  className="p-2 border border-brand-border rounded-lg hover:bg-slate-100 text-brand-primary transition-colors shrink-0"
                  title="Copy Webhook URL"
                >
                  {copied ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label className={tokens.typography.label + " mb-2 block"}>Webhook Verify Token</label>
              <input
                type="text"
                value={verifyToken}
                onChange={(e) => setVerifyToken(e.target.value)}
                className={tokens.components.input + " font-mono text-xs"}
                placeholder="print_shop_meta_webhook_secret"
              />
              <p className="text-[11px] text-brand-secondary/70 mt-1">
                Custom string used during Meta Webhook subscription verification.
              </p>
            </div>
          </div>
        </div>

        {/* SMS Lead Message Template */}
        <div className="bg-white border border-brand-border rounded-xl p-6 shadow-sm space-y-6">
          <div className="border-b border-brand-border/40 pb-2 flex justify-between items-center">
            <h3 className="text-sm font-bold uppercase tracking-widest text-brand-secondary">
              Meta Lead SMS Text Template (Quo Connection)
            </h3>
            <span className="text-xs text-brand-secondary/70">
              Variables: <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[10px]">{'{leadName}'}</code>, <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[10px]">{'{adName}'}</code>, <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[10px]">{'{email}'}</code>
            </span>
          </div>

          <div className="space-y-4">
            <textarea
              rows={3}
              value={smsTemplate}
              onChange={(e) => setSmsTemplate(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-brand-border rounded-lg p-3 focus:border-brand-primary focus:outline-none transition-colors"
              placeholder="Enter message text..."
            />

            <div className="flex items-center gap-3 pt-2">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={autoSendSms}
                  onChange={(e) => setAutoSendSms(e.target.checked)}
                />
                <div className="w-9 h-5 bg-neutral-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-primary"></div>
              </label>
              <div>
                <span className="text-xs font-semibold text-brand-primary">Auto-send SMS to new Meta leads</span>
                <p className="text-[11px] text-brand-secondary">If enabled, an SMS will automatically be dispatched via Quo immediately when a Meta lead is submitted.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-6 border-t border-brand-border flex flex-wrap gap-4 items-center justify-between">
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
            disabled={saving || testing || !accessToken}
            className="justify-center shrink-0"
          >
            {testing ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              <>
                <RefreshCw size={14} className="mr-1.5" />
                Test Meta Connection
              </>
            )}
          </PillButton>
        </div>
      </form>
    </div>
  );
}
