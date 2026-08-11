import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Building2, Save, Loader2, MapPin } from 'lucide-react';
import { tokens } from '../../lib/tokens';
import { PillButton } from '../../components/ui/PillButton';

export function BusinessTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    companyName: '',
    phone: '',
    street1: '',
    city: '',
    state: '',
    zip: '',
    country: 'US'
  });

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docRef = doc(db, 'settings', 'business');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setSettings({ ...settings, ...docSnap.data() });
        }
      } catch (err) {
        console.error("Error fetching business settings:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'business'), settings, { merge: true });
    } catch (err) {
      console.error("Error saving business settings:", err);
      alert('Failed to save settings.');
    } finally {
      setSaving(false);
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
          <Building2 className="text-brand-primary" size={20} />
          Business Profile
        </h2>
        <p className={tokens.typography.bodyMuted}>
          Manage your global shop identity, which is used as the origin address for shipping labels.
        </p>
      </div>

      <div className="space-y-6 max-w-2xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-2">Company Name</label>
            <input 
              type="text" 
              value={settings.companyName}
              onChange={(e) => setSettings(prev => ({ ...prev, companyName: e.target.value }))}
              className="w-full bg-brand-bg/50 border border-brand-border rounded-lg px-4 py-3 text-sm focus:border-brand-primary focus:outline-none transition-colors"
              placeholder="e.g. Acme Print Co."
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-2">Contact Phone</label>
            <input 
              type="text" 
              value={settings.phone}
              onChange={(e) => setSettings(prev => ({ ...prev, phone: e.target.value }))}
              className="w-full bg-brand-bg/50 border border-brand-border rounded-lg px-4 py-3 text-sm focus:border-brand-primary focus:outline-none transition-colors"
              placeholder="e.g. 555-555-5555"
            />
          </div>
        </div>

        <div className="pt-6 border-t border-brand-border mt-6">
          <h3 className="text-sm font-bold text-brand-primary mb-4 flex items-center gap-2">
            <MapPin size={16} className="text-emerald-500" /> Origin Address / Warehouse
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-2">Street Address</label>
              <input 
                type="text" 
                autoComplete="street-address"
                value={settings.street1}
                onChange={(e) => setSettings(prev => ({ ...prev, street1: e.target.value }))}
                className="w-full bg-brand-bg/50 border border-brand-border rounded-lg px-4 py-3 text-sm focus:border-brand-primary focus:outline-none transition-colors"
                placeholder="e.g. 100 Main St Suite 4"
              />
            </div>
            
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-3 md:col-span-1">
                <label className="block text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-2">City</label>
                <input 
                  type="text" 
                  autoComplete="address-level2"
                  value={settings.city}
                  onChange={(e) => setSettings(prev => ({ ...prev, city: e.target.value }))}
                  className="w-full bg-brand-bg/50 border border-brand-border rounded-lg px-4 py-3 text-sm focus:border-brand-primary focus:outline-none transition-colors"
                  placeholder="City"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-2">State</label>
                <input 
                  type="text" 
                  autoComplete="address-level1"
                  value={settings.state}
                  onChange={(e) => setSettings(prev => ({ ...prev, state: e.target.value }))}
                  className="w-full bg-brand-bg/50 border border-brand-border rounded-lg px-4 py-3 text-sm focus:border-brand-primary focus:outline-none transition-colors uppercase"
                  placeholder="CA"
                  maxLength={2}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-2">Zip Code</label>
                <input 
                  type="text" 
                  autoComplete="postal-code"
                  value={settings.zip}
                  onChange={(e) => setSettings(prev => ({ ...prev, zip: e.target.value }))}
                  className="w-full bg-brand-bg/50 border border-brand-border rounded-lg px-4 py-3 text-sm focus:border-brand-primary focus:outline-none transition-colors"
                  placeholder="90001"
                />
              </div>
            </div>
            
            <div className="w-1/3">
                <label className="block text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-2">Country</label>
                <input 
                  type="text" 
                  autoComplete="country"
                  value={settings.country}
                  onChange={(e) => setSettings(prev => ({ ...prev, country: e.target.value }))}
                  className="w-full bg-brand-bg/50 border border-brand-border rounded-lg px-4 py-3 text-sm focus:border-brand-primary focus:outline-none transition-colors uppercase"
                  placeholder="US"
                  maxLength={2}
                />
            </div>
          </div>
        </div>

        {/* Global Invoice & Bank Wire Settings */}
        <div className="pt-6 border-t border-brand-border mt-6">
          <h3 className="text-sm font-bold text-brand-primary mb-4 flex items-center gap-2">
            <Building2 size={16} className="text-blue-500" /> Global Bank Wire & Invoice Payment Settings
          </h3>
          <p className="text-xs text-brand-secondary mb-4">
            Default wire details and credit card payment links rendered on customer invoices.
          </p>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-2">Bank Name</label>
                <input 
                  type="text" 
                  value={(settings as any).wireBankName || ''}
                  onChange={(e) => setSettings(prev => ({ ...prev, wireBankName: e.target.value }))}
                  className="w-full bg-brand-bg/50 border border-brand-border rounded-lg px-4 py-3 text-sm focus:border-brand-primary focus:outline-none transition-colors"
                  placeholder="e.g. Pinnacle Bank"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-2">Account Name</label>
                <input 
                  type="text" 
                  value={(settings as any).wireAccountName || ''}
                  onChange={(e) => setSettings(prev => ({ ...prev, wireAccountName: e.target.value }))}
                  className="w-full bg-brand-bg/50 border border-brand-border rounded-lg px-4 py-3 text-sm focus:border-brand-primary focus:outline-none transition-colors"
                  placeholder="e.g. Catalyst"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-2">Bank Address</label>
              <input 
                type="text" 
                value={(settings as any).wireBankAddress || ''}
                onChange={(e) => setSettings(prev => ({ ...prev, wireBankAddress: e.target.value }))}
                className="w-full bg-brand-bg/50 border border-brand-border rounded-lg px-4 py-3 text-sm focus:border-brand-primary focus:outline-none transition-colors"
                placeholder="e.g. 2300 West End Avenue, Nashville, TN 37203"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-2">Routing #</label>
                <input 
                  type="text" 
                  value={(settings as any).wireRoutingNumber || ''}
                  onChange={(e) => setSettings(prev => ({ ...prev, wireRoutingNumber: e.target.value }))}
                  className="w-full bg-brand-bg/50 border border-brand-border rounded-lg px-4 py-3 text-sm focus:border-brand-primary focus:outline-none transition-colors"
                  placeholder="Routing #"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-2">SWIFT Code</label>
                <input 
                  type="text" 
                  value={(settings as any).wireSwiftCode || ''}
                  onChange={(e) => setSettings(prev => ({ ...prev, wireSwiftCode: e.target.value }))}
                  className="w-full bg-brand-bg/50 border border-brand-border rounded-lg px-4 py-3 text-sm focus:border-brand-primary focus:outline-none transition-colors"
                  placeholder="SWIFT Code"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-2">Account #</label>
                <input 
                  type="text" 
                  value={(settings as any).wireAccountNumber || ''}
                  onChange={(e) => setSettings(prev => ({ ...prev, wireAccountNumber: e.target.value }))}
                  className="w-full bg-brand-bg/50 border border-brand-border rounded-lg px-4 py-3 text-sm focus:border-brand-primary focus:outline-none transition-colors"
                  placeholder="Account #"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-2">Direct Payment Link / Stripe URL</label>
              <input 
                type="text" 
                value={(settings as any).stripePaymentUrl || ''}
                onChange={(e) => setSettings(prev => ({ ...prev, stripePaymentUrl: e.target.value }))}
                className="w-full bg-brand-bg/50 border border-brand-border rounded-lg px-4 py-3 text-sm focus:border-brand-primary focus:outline-none transition-colors"
                placeholder="Leave blank for native Stripe payment modal or enter custom link (e.g. https://buy.stripe.com/...)"
              />
              <p className="text-[11px] text-brand-secondary mt-1">
                If left empty or default, clicking the invoice payment button automatically opens the native in-app Stripe credit card checkout!
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="pt-6 border-t border-brand-border">
        <PillButton variant="filled" onClick={handleSave} disabled={saving} className="min-w-[140px] justify-center">
          {saving ? <Loader2 className="animate-spin" size={18} /> : <><Save size={18} className="mr-2" /> Save Settings</>}
        </PillButton>
      </div>
    </div>
  );
}
