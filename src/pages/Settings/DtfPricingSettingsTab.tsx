import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
// @ts-ignore
import DTFPricing from '../../../dtf-pricing-engine.js';
import { Calculator, Zap, DollarSign, Check, RefreshCw, Copy, Layers, Sliders, Save, ShieldAlert } from 'lucide-react';
import { PillButton } from '../../components/ui/PillButton';

const DEFAULT_LADDER_FALLBACK = {
  ...DTFPricing.DEFAULT_LADDER,
  priceAtLowTier: 5.50,
  priceAtHighTier: 3.00,
  marginFloor: 0.35
};

export function DtfPricingSettingsTab() {
  const [activeTab, setActiveTab] = useState<'ladder' | 'costs' | 'rateCard' | 'transfers' | 'simulator'>('ladder');
  
  // Settings State
  const [costs, setCosts] = useState<any>({ ...DTFPricing.DEFAULT_COSTS });
  const [ladder, setLadder] = useState<any>({ ...DEFAULT_LADDER_FALLBACK });
  const [autoQuotingEnabled, setAutoQuotingEnabled] = useState<boolean>(true);
  const [storefrontAutoQuotingEnabled, setStorefrontAutoQuotingEnabled] = useState<boolean>(true);
  
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ success: boolean; text: string } | null>(null);

  // Simulator State
  const [simGarment, setSimGarment] = useState<string>('tee');
  const [simQty, setSimQty] = useState<number>(50);
  const [simPlacements, setSimPlacements] = useState<Record<string, boolean>>({ ff: true });
  const [simBlankCost, setSimBlankCost] = useState<number>(2.50);
  const [showBreakdown, setShowBreakdown] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  // Fetch global DTF pricing settings on mount
  useEffect(() => {
    const fetchSettings = async () => {
      setLoading(true);
      try {
        const docRef = doc(db, 'settings', 'dtf_pricing');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.costs) setCosts({ ...DTFPricing.DEFAULT_COSTS, ...data.costs });
          if (data.ladder) setLadder({ ...DEFAULT_LADDER_FALLBACK, ...data.ladder });
          if (data.autoQuotingEnabled !== undefined) setAutoQuotingEnabled(!!data.autoQuotingEnabled);
          if (data.storefrontAutoQuotingEnabled !== undefined) setStorefrontAutoQuotingEnabled(!!data.storefrontAutoQuotingEnabled);
        }
      } catch (err) {
        console.error("Error loading DTF pricing settings:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSaveAll = async () => {
    setSaving(true);
    setStatusMessage(null);
    try {
      await setDoc(doc(db, 'settings', 'dtf_pricing'), {
        costs,
        ladder,
        autoQuotingEnabled,
        storefrontAutoQuotingEnabled,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      setStatusMessage({ success: true, text: 'DTF Pricing & Auto-Quoting settings saved successfully!' });
      setTimeout(() => setStatusMessage(null), 3500);
    } catch (err: any) {
      console.error("Error saving DTF pricing settings:", err);
      setStatusMessage({ success: false, text: `Failed to save: ${err.message || 'Unknown error'}` });
    } finally {
      setSaving(false);
    }
  };

  // Sim math
  const simPlacementIds = Object.keys(simPlacements);
  const simResult = DTFPricing.quote({
    garmentId: simGarment,
    placementIds: simPlacementIds,
    quantity: simQty,
    blankCost: simBlankCost,
    costs,
    ladder
  });

  const quoteText = () => {
    if (!simResult.ok) return "Pick at least one print location to see a price.";
    const garmentObj = DTFPricing.findGarment(simGarment);
    const placementLabels = simPlacementIds
      .map(pId => DTFPricing.findPlacement(pId)?.label)
      .filter(Boolean);
    
    return [
      "SIMULATED QUOTE",
      "",
      `${garmentObj?.label || 'Garment'} x ${simQty}`,
      ...placementLabels.map(label => `  - ${label}`),
      "",
      `Price each:  $${simResult.pricePerPiece.toFixed(2)}`,
      `Order total: $${(simResult.pricePerPiece * simQty).toFixed(2)}`,
      "",
      simBlankCost > 0 
        ? `Includes garment at $${simBlankCost.toFixed(2)} each.` 
        : "Decoration only - garments supplied by customer."
    ].join("\n");
  };

  const handleCopyQuote = () => {
    navigator.clipboard.writeText(quoteText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="p-12 flex flex-col items-center justify-center text-brand-secondary gap-3">
        <RefreshCw className="animate-spin text-brand-primary" size={28} />
        <span className="text-xs font-bold uppercase tracking-wider">Loading DTF Pricing Engine...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner & Title */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-brand-border/40 pb-5">
        <div>
          <h2 className="text-xl font-serif text-brand-primary font-bold flex items-center gap-2">
            <Calculator size={22} className="text-brand-secondary" />
            DTF Apparel Pricing & Auto-Quoting Engine
          </h2>
          <p className="text-xs text-brand-secondary mt-1">
            Configure global default pricing ladders, labor costs, margin floors, and customer portal auto-quoting permissions.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <PillButton 
            variant="filled" 
            onClick={handleSaveAll}
            disabled={saving}
            className="px-6 py-2.5 text-xs font-bold gap-2"
          >
            {saving ? <RefreshCw className="animate-spin" size={16} /> : <Save size={16} />}
            <span>{saving ? 'Saving...' : 'Save Configuration'}</span>
          </PillButton>
        </div>
      </div>

      {/* Alert Status Message */}
      {statusMessage && (
        <div className={`p-4 rounded-2xl border text-xs font-bold flex items-center justify-between animate-in fade-in duration-200 ${
          statusMessage.success 
            ? 'bg-emerald-50 text-emerald-900 border-emerald-300' 
            : 'bg-rose-50 text-rose-900 border-rose-300'
        }`}>
          <div className="flex items-center gap-2">
            {statusMessage.success ? <Check size={16} className="text-emerald-600" /> : <ShieldAlert size={16} className="text-rose-600" />}
            <span>{statusMessage.text}</span>
          </div>
          <button onClick={() => setStatusMessage(null)} className="text-xs opacity-70 hover:opacity-100">✕</button>
        </div>
      )}

      {/* Auto-Quoting Controls Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Customer Portal Auto-Quoting Toggle Card */}
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/80 rounded-2xl p-5 shadow-xs flex flex-col justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-amber-500/10 text-amber-600 rounded-xl shrink-0 mt-0.5">
              <Zap size={20} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                Customer Portal Auto-Quoting
                <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-extrabold uppercase tracking-wider ${
                  autoQuotingEnabled ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-neutral-200 text-neutral-700'
                }`}>
                  {autoQuotingEnabled ? 'ENABLED' : 'DISABLED'}
                </span>
              </h4>
              <p className="text-xs text-neutral-600 font-medium mt-1">
                Automatically calculate quotes & skip manual review for customer portal orders using print dimensions & artwork placement.
              </p>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setAutoQuotingEnabled(!autoQuotingEnabled)}
              className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                autoQuotingEnabled ? 'bg-emerald-500' : 'bg-neutral-300'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                  autoQuotingEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Storefront Public Auto-Quoting Toggle Card */}
        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200/80 rounded-2xl p-5 shadow-xs flex flex-col justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-emerald-500/10 text-emerald-600 rounded-xl shrink-0 mt-0.5">
              <Calculator size={20} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                Storefront Public Auto-Quoting
                <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-extrabold uppercase tracking-wider ${
                  storefrontAutoQuotingEnabled ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-neutral-200 text-neutral-700'
                }`}>
                  {storefrontAutoQuotingEnabled ? 'ENABLED' : 'DISABLED'}
                </span>
              </h4>
              <p className="text-xs text-neutral-600 font-medium mt-1">
                Apply instant live pricing calculations to public visitors at the Sizing & Quantities section. Allows direct checkout & immediate order submission!
              </p>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setStorefrontAutoQuotingEnabled(!storefrontAutoQuotingEnabled)}
              className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                storefrontAutoQuotingEnabled ? 'bg-emerald-500' : 'bg-neutral-300'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                  storefrontAutoQuotingEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Section Sub-Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-brand-border/50 pb-3">
        {[
          { id: 'ladder', label: 'Price Ladder', icon: Sliders },
          { id: 'costs', label: 'Your Costs', icon: DollarSign },
          { id: 'rateCard', label: 'Rate Card', icon: Layers },
          { id: 'transfers', label: 'Transfers', icon: Layers },
          { id: 'simulator', label: 'Live Quote Simulator', icon: Calculator }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
                isActive 
                  ? 'bg-brand-primary text-white shadow-xs' 
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 hover:text-brand-primary'
              }`}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      {/* 1. PRICE LADDER TAB */}
      {activeTab === 'ladder' && (
        <div className="bg-white p-6 rounded-2xl border border-brand-border shadow-xs space-y-6">
          {/* Reference Pricing Anchors */}
          <div className="space-y-4 border-b border-brand-border/40 pb-5">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-secondary block">
              Reference Pricing Anchors (Full-Front Tee)
            </span>
            
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2 bg-brand-bg/50 border border-brand-border rounded-xl px-3 py-2">
                <span className="text-[10px] font-bold text-gray-400 uppercase">1-24 Tier</span>
                <div className="relative w-28">
                  <DollarSign size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="number"
                    step="0.25"
                    value={ladder.priceAtLowTier || ''}
                    onChange={(e) => setLadder({...ladder, priceAtLowTier: Math.max(0, parseFloat(e.target.value) || 0)})}
                    className="w-full pl-6 pr-2 py-1 text-sm bg-transparent border-0 font-bold text-right text-brand-primary focus:outline-none"
                  />
                </div>
              </div>

              <span className="text-gray-300 font-bold">→</span>

              <div className="flex items-center gap-2 bg-brand-bg/50 border border-brand-border rounded-xl px-3 py-2">
                <span className="text-[10px] font-bold text-gray-400 uppercase">500+ Tier</span>
                <div className="relative w-28">
                  <DollarSign size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="number"
                    step="0.25"
                    value={ladder.priceAtHighTier || ''}
                    onChange={(e) => setLadder({...ladder, priceAtHighTier: Math.max(0, parseFloat(e.target.value) || 0)})}
                    className="w-full pl-6 pr-2 py-1 text-sm bg-transparent border-0 font-bold text-right text-brand-primary focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex gap-2 ml-auto">
                <button
                  type="button"
                  onClick={() => {
                    const marketVal = DTFPricing.MARKET_RATES["ff"];
                    setLadder({ ...ladder, priceAtLowTier: marketVal, priceAtHighTier: marketVal });
                  }}
                  className="bg-neutral-100 hover:bg-neutral-200 text-brand-primary border border-brand-border px-3 py-1.5 rounded-xl text-xs font-bold uppercase transition-colors cursor-pointer"
                >
                  Match Market ($5.00)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLadder({ ...ladder, priceAtHighTier: ladder.priceAtLowTier });
                  }}
                  className="bg-neutral-100 hover:bg-neutral-200 text-brand-primary border border-brand-border px-3 py-1.5 rounded-xl text-xs font-bold uppercase transition-colors cursor-pointer"
                >
                  Flat Rate
                </button>
              </div>
            </div>
          </div>

          {/* Margin Floor */}
          <div className="space-y-3 border-b border-brand-border/40 pb-5">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold uppercase tracking-wider text-brand-secondary">Margin Floor (Clamps Profitability)</span>
              <span className="text-sm font-black text-brand-primary bg-brand-primary/5 px-3 py-1 rounded-lg">
                {Math.round((ladder.marginFloor || 0.35) * 100)}%
              </span>
            </div>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min="0"
                max="60"
                step="1"
                value={Math.round((ladder.marginFloor || 0.35) * 100)}
                onChange={(e) => setLadder({...ladder, marginFloor: parseInt(e.target.value) / 100})}
                className="flex-1 accent-brand-primary h-1 rounded-full bg-neutral-200 cursor-pointer"
              />
              <span className="text-xs text-brand-secondary font-mono w-28 text-right font-bold">
                {Math.round(DTFPricing.effectiveMargin(0, costs, ladder)*100)}% → {Math.round(DTFPricing.effectiveMargin(5, costs, ladder)*100)}%
              </span>
            </div>
          </div>

          {/* Live Price Ladder Table */}
          <div className="space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-secondary block">
              Live Price Ladder & Implied Margins
            </span>
            <div className="border border-brand-border/60 rounded-2xl overflow-hidden shadow-xs">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="bg-neutral-100 text-brand-secondary border-b border-brand-border">
                    <th className="p-3 font-bold uppercase tracking-wider">Tier</th>
                    <th className="p-3 font-bold uppercase tracking-wider text-center">Decoration Cost</th>
                    <th className="p-3 font-bold uppercase tracking-wider text-center">Margin</th>
                    <th className="p-3 font-bold uppercase tracking-wider text-center">Reference Sell Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-border/40 font-medium">
                  {DTFPricing.TIERS.map((tierLabel: string, idx: number) => {
                    const cost = DTFPricing.decorationCost("tee", ["ff"], idx, costs);
                    const isClamped = DTFPricing.isBelowFloor(idx, costs, ladder);
                    const margin = DTFPricing.effectiveMargin(idx, costs, ladder);
                    const price = DTFPricing.referencePrice(idx, ladder);
                    return (
                      <tr key={idx} className={isClamped ? 'bg-amber-50/50' : ''}>
                        <td className="p-3 font-bold text-brand-primary">{tierLabel}</td>
                        <td className="p-3 text-center font-mono text-brand-secondary">${cost.toFixed(2)}</td>
                        <td className={`p-3 text-center font-bold ${isClamped ? 'text-amber-700' : 'text-emerald-700'}`}>
                          {Math.round(margin * 100)}% {isClamped && '⚠️'}
                        </td>
                        <td className="p-3 text-center font-bold text-brand-primary">${price.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 2. YOUR COSTS TAB */}
      {activeTab === 'costs' && (
        <div className="bg-white p-6 rounded-2xl border border-brand-border shadow-xs space-y-6">
          <div className="flex items-center justify-between border-b border-brand-border/40 pb-4">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-secondary">
              Shop Operating & Production Cost Parameters
            </span>
            <button
              type="button"
              onClick={() => setCosts({ ...DTFPricing.DEFAULT_COSTS })}
              className="text-xs text-rose-600 hover:underline font-bold cursor-pointer"
            >
              Reset to Factory Costs
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-gray-400 pl-1">Labor Rate ($/hr)</label>
              <div className="relative">
                <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="number"
                  step="0.50"
                  value={costs.laborRatePerHour || ''}
                  onChange={(e) => setCosts({ ...costs, laborRatePerHour: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-xl pl-8 pr-3 py-2 text-xs font-bold text-brand-primary"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-gray-400 pl-1">Transfer Film Cost ($/sq in)</label>
              <div className="relative">
                <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="number"
                  step="0.001"
                  value={costs.filmCostPerSqIn || ''}
                  onChange={(e) => setCosts({ ...costs, filmCostPerSqIn: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-xl pl-8 pr-3 py-2 text-xs font-bold text-brand-primary"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-gray-400 pl-1">Ink & Powder Cost ($/sq in)</label>
              <div className="relative">
                <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="number"
                  step="0.001"
                  value={costs.inkCostPerSqIn || ''}
                  onChange={(e) => setCosts({ ...costs, inkCostPerSqIn: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-xl pl-8 pr-3 py-2 text-xs font-bold text-brand-primary"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-gray-400 pl-1">Heat Press Labor (sec/garment)</label>
              <input
                type="number"
                value={costs.pressSeconds || ''}
                onChange={(e) => setCosts({ ...costs, pressSeconds: parseInt(e.target.value) || 0 })}
                className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2 text-xs font-bold text-brand-primary"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-gray-400 pl-1">Packaging Cost ($/piece)</label>
              <div className="relative">
                <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="number"
                  step="0.05"
                  value={costs.packagingCost || ''}
                  onChange={(e) => setCosts({ ...costs, packagingCost: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-xl pl-8 pr-3 py-2 text-xs font-bold text-brand-primary"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-gray-400 pl-1">Order Handling Overhead ($)</label>
              <div className="relative">
                <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="number"
                  step="1.00"
                  value={costs.overheadPerOrder || ''}
                  onChange={(e) => setCosts({ ...costs, overheadPerOrder: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-xl pl-8 pr-3 py-2 text-xs font-bold text-brand-primary"
                />
              </div>
            </div>

            {/* Loaded transfer costs per print size — these are the material
                costs the pricing engine uses for each placement tier */}
            <div className="col-span-full border-t border-brand-border/40 pt-4 mt-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-brand-secondary">
                Loaded Transfer Costs (per print, by size)
              </span>
            </div>

            {([
              { key: 'transferLarge', label: 'Large Transfer — Full Front/Back 11×14" ($)' },
              { key: 'transferMedium', label: 'Medium Transfer — Chest/Torso 7×9" ($)' },
              { key: 'transferSmall', label: 'Small Transfer — Left Chest/Sleeve ~4" ($)' },
              { key: 'transferTag', label: 'Neck Tag Transfer ~2×3" ($)' },
              { key: 'transferPatch', label: 'Cap Front Patch ($)' },
            ] as const).map(field => (
              <div key={field.key} className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-gray-400 pl-1">{field.label}</label>
                <div className="relative">
                  <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="number"
                    step="0.05"
                    value={costs[field.key] ?? ''}
                    onChange={(e) => setCosts({ ...costs, [field.key]: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-neutral-50 border border-neutral-200 rounded-xl pl-8 pr-3 py-2 text-xs font-bold text-brand-primary"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. RATE CARD TAB */}
      {activeTab === 'rateCard' && (
        <div className="bg-white p-6 rounded-2xl border border-brand-border shadow-xs space-y-4">
          <span className="text-xs font-bold uppercase tracking-wider text-brand-secondary block">
            Decoration-Only Standard Sell Price Rate Cards (by Placement & Tier)
          </span>
          <div className="border border-brand-border/60 rounded-2xl overflow-hidden shadow-xs">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="bg-neutral-100 text-brand-secondary border-b border-brand-border">
                  <th className="p-3 font-bold uppercase">Placement Location</th>
                  {DTFPricing.TIERS.map((t: string) => (
                    <th key={t} className="p-3 font-bold uppercase text-center">{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border/40 font-medium">
                {DTFPricing.PLACEMENTS.map((p: any) => (
                  <tr key={p.id} className="hover:bg-neutral-50/60">
                    <td className="p-3 font-bold text-brand-primary">{p.label}</td>
                    {DTFPricing.TIERS.map((_: string, tIdx: number) => {
                      const cost = DTFPricing.decorationCost('tee', [p.id], tIdx, costs);
                      const sellPrice = DTFPricing.priceFromCost(cost, tIdx, costs, ladder);
                      return (
                        <td key={tIdx} className="p-3 text-center font-mono font-bold text-emerald-800">
                          ${sellPrice.toFixed(2)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. TRANSFERS TAB */}
      {activeTab === 'transfers' && (
        <div className="bg-white p-6 rounded-2xl border border-brand-border shadow-xs space-y-4">
          <span className="text-xs font-bold uppercase tracking-wider text-brand-secondary block">
            Transfer Film Raw Cost per Sheet
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {DTFPricing.PLACEMENTS.map((p: any) => {
              const sqIn = p.width * p.height;
              const filmCost = sqIn * (costs.filmCostPerSqIn || 0.008);
              const inkCost = sqIn * (costs.inkCostPerSqIn || 0.007);
              const totalCost = filmCost + inkCost;
              return (
                <div key={p.id} className="p-4 bg-neutral-50 rounded-xl border border-neutral-250 space-y-1.5">
                  <span className="text-xs font-extrabold text-brand-primary block">{p.label}</span>
                  <div className="flex justify-between text-xs text-neutral-600">
                    <span>Dimensions:</span>
                    <span className="font-bold">{p.width}" × {p.height}" ({sqIn} sq in)</span>
                  </div>
                  <div className="flex justify-between text-xs text-emerald-800 font-bold border-t border-neutral-200 pt-1.5">
                    <span>Print Cost:</span>
                    <span className="font-mono">${totalCost.toFixed(3)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. LIVE QUOTE SIMULATOR TAB */}
      {activeTab === 'simulator' && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
          {/* Controls */}
          <div className="md:col-span-7 bg-white p-6 rounded-2xl border border-brand-border shadow-xs space-y-5">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-secondary block">
              Interactive Test Quote Simulator
            </span>

            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-gray-400">Garment Category</label>
              <select
                value={simGarment}
                onChange={(e) => setSimGarment(e.target.value)}
                className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2 text-xs font-bold text-brand-primary"
              >
                {DTFPricing.GARMENTS.map((g: any) => (
                  <option key={g.id} value={g.id}>{g.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-gray-400">Quantity (Pieces)</label>
              <input
                type="number"
                min="1"
                value={simQty}
                onChange={(e) => setSimQty(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2 text-xs font-bold text-brand-primary"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-gray-400">Blank Garment Cost ($)</label>
              <input
                type="number"
                step="0.50"
                value={simBlankCost}
                onChange={(e) => setSimBlankCost(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2 text-xs font-bold text-brand-primary"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase font-bold text-gray-400 block">Print Placement Locations</label>
              <div className="flex flex-wrap gap-2">
                {DTFPricing.PLACEMENTS.map((p: any) => {
                  const isChecked = !!simPlacements[p.id];
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setSimPlacements(prev => {
                          const next = { ...prev };
                          if (next[p.id]) delete next[p.id];
                          else next[p.id] = true;
                          return next;
                        });
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        isChecked
                          ? 'bg-neutral-900 text-white border-neutral-900'
                          : 'bg-white text-neutral-600 border-neutral-250 hover:bg-neutral-100'
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Result Card */}
          <div className="md:col-span-5 bg-white p-6 rounded-2xl border border-brand-border shadow-xs space-y-4">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-secondary block">
              Live Calculated Price
            </span>

            {simResult.ok ? (
              <div className="space-y-4">
                <div className="bg-neutral-50 p-4 rounded-xl border border-neutral-200 space-y-1 text-center">
                  <span className="text-[10px] font-black uppercase text-neutral-400">Total Price Per Piece</span>
                  <div className="text-3xl font-black text-brand-primary font-mono">${simResult.pricePerPiece.toFixed(2)}</div>
                  <div className="text-xs text-neutral-500 font-bold">
                    Order Total ({simQty} pcs): <span className="text-emerald-700">${(simResult.pricePerPiece * simQty).toFixed(2)}</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowBreakdown(!showBreakdown)}
                    className="flex-1 py-2 bg-neutral-100 hover:bg-neutral-200 text-brand-primary rounded-xl text-xs font-bold uppercase cursor-pointer"
                  >
                    {showBreakdown ? 'Hide Cost Breakdown' : 'Show Cost Breakdown'}
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyQuote}
                    className="px-4 py-2 bg-neutral-900 text-white hover:bg-neutral-800 rounded-xl text-xs font-bold uppercase flex items-center gap-1.5 cursor-pointer"
                  >
                    <Copy size={13} />
                    <span>{copied ? 'Copied!' : 'Copy'}</span>
                  </button>
                </div>

                {showBreakdown && (
                  <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 space-y-2 text-xs">
                    <span className="text-[10px] font-black uppercase text-neutral-400 block">Itemized Cost Breakdown</span>
                    {(simResult.breakdown || []).map((b: any, idx: number) => (
                      <div key={idx} className="flex justify-between font-medium text-neutral-700">
                        <span>{b.label}</span>
                        <span className="font-mono font-bold">${b.amount.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-neutral-400 italic bg-neutral-50 rounded-xl border border-dashed border-neutral-300">
                Select at least one placement location to view calculated quote pricing.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
