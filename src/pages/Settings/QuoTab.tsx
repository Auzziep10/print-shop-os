import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import { MessageSquare, Key, Eye, EyeOff, Save, Loader2, SendHorizontal, CheckCircle2, AlertCircle, Phone } from 'lucide-react';
import { tokens } from '../../lib/tokens';
import { PillButton } from '../../components/ui/PillButton';

interface StatusTemplate {
  enabled: boolean;
  template: string;
}

const DEFAULT_TEMPLATES: Record<string, StatusTemplate> = {
  '0': { enabled: false, template: 'Hi {customerName}, your quote request for Order #{orderId} ("{orderTitle}") has been received! We are reviewing it now.' },
  '1': { enabled: false, template: 'Hi {customerName}, Order #{orderId} is now Under Review. We will update you shortly.' },
  '2': { enabled: false, template: 'Hi {customerName}, your quote for Order #{orderId} has been prepared! Please log into the portal to review and approve.' },
  '3': { enabled: false, template: 'Hi {customerName}, Order #{orderId} is approved and Awaiting Payment. You can make a payment directly in the portal.' },
  '4': { enabled: false, template: 'Hi {customerName}, payment received! We are now Sourcing materials for Order #{orderId}.' },
  '5': { enabled: false, template: 'Hi {customerName}, materials are Ordered for Order #{orderId}.' },
  '6': { enabled: false, template: 'Hi {customerName}, Order #{orderId} is now In Production! We are working hard to complete it.' },
  '7': { enabled: true, template: 'Great news {customerName}! Order #{orderId} ("{orderTitle}") has Shipped/is in Inventory! Tracking: {trackingCarrier} {trackingNumber}.' },
  '8': { enabled: true, template: 'Hi {customerName}, Order #{orderId} has been marked as Received/Live! Thank you for choosing us.' }
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

export function QuoTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  // Form states
  const [apiKey, setApiKey] = useState('');
  const [fromNumber, setFromNumber] = useState('');
  const [templates, setTemplates] = useState<Record<string, StatusTemplate>>(DEFAULT_TEMPLATES);
  const [welcomeTemplate, setWelcomeTemplate] = useState<StatusTemplate>({
    enabled: true,
    template: 'Hi {customerName}, welcome to {companyName}! Your portal account has been created. Log in here: {portalUrl}'
  });

  // Status message states
  const [saveStatus, setSaveStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [testStatus, setTestStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [testPhone, setTestPhone] = useState('');

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docRef = doc(db, 'settings', 'quo');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setApiKey(data.apiKey || '');
          setFromNumber(data.fromNumber || '');
          if (data.templates) {
            // Merge with defaults to ensure all keys exist
            setTemplates({
              ...DEFAULT_TEMPLATES,
              ...data.templates
            });
          }
          if (data.welcome) {
            setWelcomeTemplate(data.welcome);
          }
        }
      } catch (err) {
        console.error("Error fetching QUO settings:", err);
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
        doc(db, 'settings', 'quo'),
        {
          apiKey: apiKey.trim(),
          fromNumber: fromNumber.trim(),
          templates: templates,
          welcome: welcomeTemplate,
          updatedAt: new Date().toISOString()
        },
        { merge: true }
      );
      setSaveStatus({ success: true, message: 'QUO integration settings saved successfully!' });
    } catch (err: any) {
      console.error("Error saving QUO settings:", err);
      setSaveStatus({ success: false, message: `Failed to save settings: ${err.message || 'Unknown error'}` });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!apiKey || !fromNumber || !testPhone) {
      setTestStatus({ success: false, message: 'Please provide API Key, Sender Number, and a Test Mobile Number.' });
      return;
    }

    setTesting(true);
    setTestStatus(null);

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('You must be logged in to test the connection.');
      }

      // Fetch the Firebase ID Token to authenticate with backend function
      const idToken = await currentUser.getIdToken();

      const response = await fetch('/api/sms/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          to: testPhone.trim(),
          content: `Test message from Print Shop OS via QUO System! Connection working successfully.`
        })
      });

      const data = await response.json();

      if (response.ok) {
        setTestStatus({ success: true, message: `Test text message sent successfully to ${testPhone.trim()}! Please check the phone.` });
      } else {
        setTestStatus({ success: false, message: `Test failed: ${data.error || data.details || 'Unknown error'}` });
      }
    } catch (err: any) {
      console.error("Error testing QUO connection:", err);
      setTestStatus({ success: false, message: `Test failed: ${err.message || 'Unknown error'}` });
    } finally {
      setTesting(false);
    }
  };

  const handleTemplateToggle = (statusKey: string) => {
    setTemplates(prev => ({
      ...prev,
      [statusKey]: {
        ...prev[statusKey],
        enabled: !prev[statusKey].enabled
      }
    }));
  };

  const handleTemplateTextChange = (statusKey: string, text: string) => {
    setTemplates(prev => ({
      ...prev,
      [statusKey]: {
        ...prev[statusKey],
        template: text
      }
    }));
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
          <MessageSquare className="text-brand-primary" size={20} />
          QUO System SMS Integration
        </h2>
        <p className={tokens.typography.bodyMuted}>
          Send text message notifications and reminders to customers when order status changes.
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
        <div className="bg-white border border-brand-border rounded-xl p-6 shadow-sm space-y-6">
          <h3 className="text-sm font-bold uppercase tracking-widest text-brand-secondary border-b border-brand-border/40 pb-2">
            API Credentials
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className={tokens.typography.label + " mb-2 block"}>QUO System API Key</label>
              <div className="relative">
                <input
                  type={showApiKey ? "text" : "password"}
                  required
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className={tokens.components.input + " pr-12 w-full"}
                  placeholder="Enter your QUO API Key"
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
                <Key size={12} /> API Key used to authenticate with QUO/OpenPhone messaging service.
              </p>
            </div>

            <div>
              <label className={tokens.typography.label + " mb-2 block"}>Sender Phone Number</label>
              <input
                type="text"
                required
                value={fromNumber}
                onChange={(e) => setFromNumber(e.target.value)}
                className={tokens.components.input}
                placeholder="e.g. +15551234567"
              />
              <p className="text-[11px] text-brand-secondary/70 mt-1 flex items-center gap-1">
                <Phone size={12} /> Must be in E.164 format (with country code, e.g. +1).
              </p>
            </div>
          </div>
        </div>

        {/* Welcome Template */}
        <div className="bg-white border border-brand-border rounded-xl p-6 shadow-sm space-y-6">
          <div className="border-b border-brand-border/40 pb-2 flex justify-between items-center">
            <h3 className="text-sm font-bold uppercase tracking-widest text-brand-secondary">
              Customer Welcome Notification (Account Created)
            </h3>
            <span className="text-xs text-brand-secondary/70">
              Variables: <code className="bg-neutral-100 px-1 py-0.5 rounded font-mono text-[10px]">{'{customerName}'}</code>, <code className="bg-neutral-100 px-1 py-0.5 rounded font-mono text-[10px]">{'{companyName}'}</code>, <code className="bg-neutral-100 px-1 py-0.5 rounded font-mono text-[10px]">{'{portalUrl}'}</code>
            </span>
          </div>

          <div className="flex flex-col md:flex-row gap-4 items-start">
            <div className="w-full md:w-1/3 flex items-center justify-between shrink-0">
              <div>
                <span className="text-xs font-semibold text-brand-primary">Welcome SMS</span>
                <p className="text-[11px] text-brand-secondary/70">Sent immediately upon customer creation</p>
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

            <div className="w-full md:flex-1">
              <textarea
                rows={2}
                disabled={!welcomeTemplate.enabled}
                value={welcomeTemplate.template}
                onChange={(e) => setWelcomeTemplate(prev => ({ ...prev, template: e.target.value }))}
                className={`w-full text-xs bg-brand-bg/50 border border-brand-border rounded-lg p-3 focus:border-brand-primary focus:outline-none transition-colors ${
                  !welcomeTemplate.enabled ? 'bg-neutral-50 border-neutral-200 text-neutral-400 cursor-not-allowed' : ''
                }`}
                placeholder="Enter welcome SMS message template"
              />
            </div>
          </div>
        </div>

        {/* Status Templates */}
        <div className="bg-white border border-brand-border rounded-xl p-6 shadow-sm space-y-6">
          <div className="border-b border-brand-border/40 pb-2 flex justify-between items-center">
            <h3 className="text-sm font-bold uppercase tracking-widest text-brand-secondary">
              Status Change Notification Templates
            </h3>
            <span className="text-xs text-brand-secondary/70">
              Variables: <code className="bg-neutral-100 px-1 py-0.5 rounded font-mono text-[10px]">{'{customerName}'}</code>, <code className="bg-neutral-100 px-1 py-0.5 rounded font-mono text-[10px]">{'{orderId}'}</code>, <code className="bg-neutral-100 px-1 py-0.5 rounded font-mono text-[10px]">{'{orderTitle}'}</code>, <code className="bg-neutral-100 px-1 py-0.5 rounded font-mono text-[10px]">{'{trackingCarrier}'}</code>, <code className="bg-neutral-100 px-1 py-0.5 rounded font-mono text-[10px]">{'{trackingNumber}'}</code>, <code className="bg-neutral-100 px-1 py-0.5 rounded font-mono text-[10px]">{'{portalUrl}'}</code>, <code className="bg-neutral-100 px-1 py-0.5 rounded font-mono text-[10px]">{'{invoiceUrl}'}</code>, <code className="bg-neutral-100 px-1 py-0.5 rounded font-mono text-[10px]">{'{orderUrl}'}</code>
            </span>
          </div>

          <div className="space-y-6 divide-y divide-brand-border/30">
            {STATUS_LABELS.map((label, index) => {
              const statusKey = index.toString();
              const templateConfig = templates[statusKey] || { enabled: false, template: '' };

              return (
                <div key={statusKey} className={`pt-4 first:pt-0 flex flex-col md:flex-row gap-4 items-start ${!templateConfig.enabled ? 'opacity-60' : ''}`}>
                  <div className="w-full md:w-1/3 flex items-center justify-between shrink-0">
                    <div>
                      <span className="text-xs font-semibold text-brand-primary">{label}</span>
                      <p className="text-[11px] text-brand-secondary/70">Status Index: {index}</p>
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

                  <div className="w-full md:flex-1">
                    <textarea
                      rows={2}
                      disabled={!templateConfig.enabled}
                      value={templateConfig.template}
                      onChange={(e) => handleTemplateTextChange(statusKey, e.target.value)}
                      className={`w-full text-xs bg-brand-bg/50 border border-brand-border rounded-lg p-3 focus:border-brand-primary focus:outline-none transition-colors ${
                        !templateConfig.enabled ? 'bg-neutral-50 border-neutral-200 text-neutral-400 cursor-not-allowed' : ''
                      }`}
                      placeholder={`Enter text message template for status ${label}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-6 border-t border-brand-border flex flex-wrap gap-4 items-center justify-between">
          <div className="flex gap-4">
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
          </div>

          <div className="flex items-center gap-3 bg-neutral-50 p-3 border border-brand-border rounded-xl shrink-0">
            <input 
              type="text" 
              placeholder="Test Mobile Number"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              className="px-3 py-1.5 border border-brand-border rounded-lg text-xs bg-white focus:outline-none focus:border-brand-primary w-48 font-medium"
            />
            <PillButton
              variant="outline"
              type="button"
              onClick={handleTestConnection}
              disabled={saving || testing || !apiKey || !fromNumber || !testPhone}
              className="justify-center shrink-0 h-9"
            >
              {testing ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <>
                  <SendHorizontal size={14} className="mr-1.5" />
                  Test SMS
                </>
              )}
            </PillButton>
          </div>
        </div>
      </form>
    </div>
  );
}
