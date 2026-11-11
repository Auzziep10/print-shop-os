import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2, Save, Check, ShieldAlert, Timer, ExternalLink } from 'lucide-react';
import { PillButton } from '../../components/ui/PillButton';
import {
  CLIENT_TYPES,
  PROJECT_SIZES,
  DEFAULT_TURNAROUND_CONFIG,
  estimateTurnaround,
  formatDayRange,
  loadTurnaroundConfig,
  saveTurnaroundConfig,
  sortTiers,
  type ClientTypeId,
  type ProjectSizeId,
  type TurnaroundConfig,
} from '../../lib/turnaround';

const inputClass =
  'w-full rounded-md border border-brand-border bg-white px-2.5 py-2 text-sm text-brand-primary focus:outline-none focus:border-brand-primary';
const numberClass = `${inputClass} text-center tabular-nums`;
const sectionTitleClass = 'text-sm font-bold uppercase tracking-wider text-brand-primary';
const sectionHelpClass = 'text-sm text-brand-secondary mt-1 mb-4';
const thClass = 'px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-brand-secondary';

const toInt = (value: string) => Math.max(0, Math.round(Number(value) || 0));

export function TurnaroundSettingsTab() {
  const [config, setConfig] = useState<TurnaroundConfig>(() => structuredClone(DEFAULT_TURNAROUND_CONFIG));
  const [qtyOptionsText, setQtyOptionsText] = useState(DEFAULT_TURNAROUND_CONFIG.qtyOptions.join(', '));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ success: boolean; text: string } | null>(null);

  useEffect(() => {
    loadTurnaroundConfig()
      .then(loaded => {
        setConfig(loaded);
        setQtyOptionsText(loaded.qtyOptions.join(', '));
      })
      .catch(err => {
        console.error('Error loading turnaround matrix:', err);
        setStatus({ success: false, text: 'Could not load saved turnaround times. Showing the starting numbers.' });
      })
      .finally(() => setLoading(false));
  }, []);

  const parseQtyOptions = (text: string) =>
    Array.from(
      new Set(
        text
          .split(/[,\s]+/)
          .map(part => Math.round(Number(part.replace(/[^\d.]/g, ''))))
          .filter(n => Number.isFinite(n) && n > 0)
      )
    ).sort((a, b) => a - b);

  const updateCell = (type: ClientTypeId, size: ProjectSizeId, patch: Partial<TurnaroundConfig['cells'][ClientTypeId][ProjectSizeId]>) =>
    setConfig(prev => ({
      ...prev,
      cells: { ...prev.cells, [type]: { ...prev.cells[type], [size]: { ...prev.cells[type][size], ...patch } } },
    }));

  const updateStage = (id: string, patch: (stage: TurnaroundConfig['stages'][number]) => TurnaroundConfig['stages'][number]) =>
    setConfig(prev => ({ ...prev, stages: prev.stages.map(stage => (stage.id === id ? patch(stage) : stage)) }));

  const updateTier = (id: string, patch: Partial<TurnaroundConfig['productionTiers'][number]>) =>
    setConfig(prev => ({
      ...prev,
      productionTiers: prev.productionTiers.map(tier => (tier.id === id ? { ...tier, ...patch } : tier)),
    }));

  const addStage = () =>
    setConfig(prev => ({
      ...prev,
      stages: [
        ...prev.stages,
        {
          id: `stage-${Date.now()}`,
          label: '',
          days: { festival: { min: 1, max: 1 }, convention: { min: 1, max: 1 }, artist: { min: 1, max: 1 } },
        },
      ],
    }));

  const addTier = () =>
    setConfig(prev => {
      const limits = prev.productionTiers.map(t => t.upTo).filter((n): n is number => n !== null);
      const highest = limits.length ? Math.max(...limits) : 0;
      const last = sortTiers(prev.productionTiers).at(-1);
      return {
        ...prev,
        productionTiers: sortTiers([
          ...prev.productionTiers,
          { id: `tier-${Date.now()}`, upTo: highest ? highest * 2 : 100, min: last?.min ?? 5, max: last?.max ?? 7 },
        ]),
      };
    });

  const handleSave = async () => {
    const qtyOptions = parseQtyOptions(qtyOptionsText);
    const openEnded = config.productionTiers.filter(t => t.upTo === null).length;
    if (qtyOptions.length === 0) {
      setStatus({ success: false, text: 'Add at least one quantity to the dropdown list.' });
      return;
    }
    if (openEnded !== 1) {
      setStatus({
        success: false,
        text: 'Exactly one production tier must have "Up to" left blank, so every quantity is covered.',
      });
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      const next = { ...config, qtyOptions, productionTiers: sortTiers(config.productionTiers) };
      await saveTurnaroundConfig(next);
      setConfig(next);
      setQtyOptionsText(qtyOptions.join(', '));
      setStatus({ success: true, text: 'Turnaround times saved. The estimator now uses these numbers.' });
      setTimeout(() => setStatus(current => (current?.success ? null : current)), 3500);
    } catch (err: any) {
      console.error('Error saving turnaround matrix:', err);
      setStatus({ success: false, text: `Failed to save: ${err?.message || 'Unknown error'}` });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="py-12 text-center text-sm text-brand-secondary">Loading turnaround times…</div>;
  }

  return (
    <div className="space-y-10">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Timer className="w-5 h-5 text-brand-primary" />
            <h2 className="text-xl font-bold text-brand-primary">Turnaround Matrix</h2>
          </div>
          <p className="text-sm text-brand-secondary mt-1 max-w-xl">
            These numbers drive the turnaround estimator the sales team uses. All times are business days.
          </p>
          <Link
            to="/turnaround"
            className="inline-flex items-center gap-1 text-xs font-bold text-brand-primary hover:underline mt-2"
          >
            Open the estimator <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
        <PillButton variant="filled" onClick={handleSave} disabled={saving} className="shrink-0 gap-2 disabled:opacity-60">
          <Save className="w-4 h-4" />
          {saving ? 'Saving…' : 'Save changes'}
        </PillButton>
      </div>

      {status && (
        <div
          role="status"
          className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${
            status.success ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-red-200 bg-red-50 text-red-900'
          }`}
        >
          {status.success ? <Check className="w-4 h-4 mt-0.5 shrink-0" /> : <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />}
          <span>{status.text}</span>
        </div>
      )}

      {/* ------------------- Suggested quantities ------------------- */}
      <section>
        <h3 className={sectionTitleClass}>Suggested quantity by client type and size</h3>
        <p className={sectionHelpClass}>
          The quantity pre-selected when a rep picks a client type and size, and the short description shown under each size button.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr>
                <th className={thClass}>Client type</th>
                {PROJECT_SIZES.map(size => (
                  <th key={size.id} className={thClass}>{size.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CLIENT_TYPES.map(type => (
                <tr key={type.id} className="border-t border-brand-border align-top">
                  <th scope="row" className="px-2 py-3 text-left text-sm font-bold text-brand-primary">{type.label}</th>
                  {PROJECT_SIZES.map(size => {
                    const cell = config.cells[type.id][size.id];
                    const estimate = estimateTurnaround(config, type.id, cell.suggestedQty);
                    return (
                      <td key={size.id} className="px-2 py-3 space-y-1.5">
                        <input
                          type="number"
                          min={1}
                          aria-label={`${type.label} ${size.label} suggested quantity`}
                          value={cell.suggestedQty}
                          onChange={e => updateCell(type.id, size.id, { suggestedQty: Math.max(1, toInt(e.target.value)) })}
                          className={inputClass}
                        />
                        <input
                          type="text"
                          aria-label={`${type.label} ${size.label} description`}
                          placeholder="What counts as this size"
                          value={cell.hint}
                          onChange={e => updateCell(type.id, size.id, { hint: e.target.value })}
                          className={`${inputClass} text-xs`}
                        />
                        <p className="text-xs text-brand-secondary">
                          = {formatDayRange(estimate.min, estimate.max)} business days
                        </p>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ------------------- Quantity dropdown ------------------- */}
      <section>
        <h3 className={sectionTitleClass}>Quantity dropdown options</h3>
        <p className={sectionHelpClass}>
          Quantities a rep can switch to in the estimator, separated by commas. Reps can also type a custom quantity.
        </p>
        <input
          type="text"
          aria-label="Quantity dropdown options"
          value={qtyOptionsText}
          onChange={e => setQtyOptionsText(e.target.value)}
          className={inputClass}
        />
      </section>

      {/* ------------------- Pre-production steps ------------------- */}
      <section>
        <h3 className={sectionTitleClass}>Steps before production</h3>
        <p className={sectionHelpClass}>
          Business days each step takes before the job goes on press, as a fastest-to-slowest range per client type.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr>
                <th className={thClass}>Step</th>
                {CLIENT_TYPES.map(type => (
                  <th key={type.id} className={thClass}>{type.label} (min - max)</th>
                ))}
                <th className={thClass}><span className="sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody>
              {config.stages.map(stage => (
                <tr key={stage.id} className="border-t border-brand-border">
                  <td className="px-2 py-2">
                    <input
                      type="text"
                      aria-label="Step name"
                      placeholder="Step name"
                      value={stage.label}
                      onChange={e => updateStage(stage.id, s => ({ ...s, label: e.target.value }))}
                      className={inputClass}
                    />
                  </td>
                  {CLIENT_TYPES.map(type => (
                    <td key={type.id} className="px-2 py-2">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={0}
                          aria-label={`${stage.label || 'Step'} ${type.label} minimum days`}
                          value={stage.days[type.id].min}
                          onChange={e =>
                            updateStage(stage.id, s => ({
                              ...s,
                              days: { ...s.days, [type.id]: { ...s.days[type.id], min: toInt(e.target.value) } },
                            }))
                          }
                          className={numberClass}
                        />
                        <span className="text-brand-secondary">-</span>
                        <input
                          type="number"
                          min={0}
                          aria-label={`${stage.label || 'Step'} ${type.label} maximum days`}
                          value={stage.days[type.id].max}
                          onChange={e =>
                            updateStage(stage.id, s => ({
                              ...s,
                              days: { ...s.days, [type.id]: { ...s.days[type.id], max: toInt(e.target.value) } },
                            }))
                          }
                          className={numberClass}
                        />
                      </div>
                    </td>
                  ))}
                  <td className="px-2 py-2 w-10">
                    <button
                      type="button"
                      aria-label={`Remove ${stage.label || 'step'}`}
                      onClick={() => setConfig(prev => ({ ...prev, stages: prev.stages.filter(s => s.id !== stage.id) }))}
                      className="p-2 text-brand-secondary hover:text-red-600 rounded-md"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" onClick={addStage} className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-brand-primary hover:underline">
          <Plus className="w-4 h-4" /> Add step
        </button>
      </section>

      {/* ------------------- Production tiers ------------------- */}
      <section>
        <h3 className={sectionTitleClass}>Production time by quantity</h3>
        <p className={sectionHelpClass}>
          Business days on the production floor, including quality check and packing. Leave "Up to" blank on the last tier so it covers everything larger.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full max-w-xl">
            <thead>
              <tr>
                <th className={thClass}>Up to (garments)</th>
                <th className={thClass}>Min days</th>
                <th className={thClass}>Max days</th>
                <th className={thClass}><span className="sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody>
              {config.productionTiers.map(tier => (
                <tr key={tier.id} className="border-t border-brand-border">
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      min={1}
                      aria-label="Tier upper quantity"
                      placeholder="and above"
                      value={tier.upTo ?? ''}
                      onChange={e => updateTier(tier.id, { upTo: e.target.value === '' ? null : Math.max(1, toInt(e.target.value)) })}
                      onBlur={() => setConfig(prev => ({ ...prev, productionTiers: sortTiers(prev.productionTiers) }))}
                      className={inputClass}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      min={0}
                      aria-label="Tier minimum days"
                      value={tier.min}
                      onChange={e => updateTier(tier.id, { min: toInt(e.target.value) })}
                      className={numberClass}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      min={0}
                      aria-label="Tier maximum days"
                      value={tier.max}
                      onChange={e => updateTier(tier.id, { max: toInt(e.target.value) })}
                      className={numberClass}
                    />
                  </td>
                  <td className="px-2 py-2 w-10">
                    <button
                      type="button"
                      aria-label="Remove tier"
                      disabled={config.productionTiers.length <= 1}
                      onClick={() =>
                        setConfig(prev => ({ ...prev, productionTiers: prev.productionTiers.filter(t => t.id !== tier.id) }))
                      }
                      className="p-2 text-brand-secondary hover:text-red-600 rounded-md disabled:opacity-30 disabled:hover:text-brand-secondary"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" onClick={addTier} className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-brand-primary hover:underline">
          <Plus className="w-4 h-4" /> Add tier
        </button>
      </section>

      {/* ------------------- High Fashion ------------------- */}
      <section>
        <h3 className={sectionTitleClass}>High Fashion garments</h3>
        <p className={sectionHelpClass}>
          When a rep picks High Fashion instead of Wholesale, these replace the quantity-based production time above.
        </p>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              aria-label="High Fashion production business days"
              value={config.highFashionExtraDays}
              onChange={e => setConfig(prev => ({ ...prev, highFashionExtraDays: toInt(e.target.value) }))}
              className={`${numberClass} !w-24`}
            />
            <span className="text-sm text-brand-secondary">business days of High Fashion production</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              aria-label="High Fashion QC and fulfillment business days"
              value={config.highFashionQcDays}
              onChange={e => setConfig(prev => ({ ...prev, highFashionQcDays: toInt(e.target.value) }))}
              className={`${numberClass} !w-24`}
            />
            <span className="text-sm text-brand-secondary">business days of QC / Fulfillment</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              aria-label="High Fashion minimum order quantity"
              value={config.highFashionMinQty}
              onChange={e => setConfig(prev => ({ ...prev, highFashionMinQty: Math.max(1, toInt(e.target.value)) }))}
              className={`${numberClass} !w-24`}
            />
            <span className="text-sm text-brand-secondary">unit minimum order</span>
          </div>
        </div>
      </section>

      {/* ------------------- Event buffer ------------------- */}
      <section>
        <h3 className={sectionTitleClass}>Event date buffer</h3>
        <p className={sectionHelpClass}>
          When a rep enters an event date, the order must be finished this many business days before it, to allow for shipping and a safety margin.
        </p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            aria-label="Event buffer in business days"
            value={config.eventBufferDays}
            onChange={e => setConfig(prev => ({ ...prev, eventBufferDays: toInt(e.target.value) }))}
            className={`${numberClass} !w-24`}
          />
          <span className="text-sm text-brand-secondary">business days before the event</span>
        </div>
      </section>
    </div>
  );
}
