import { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { BadgePercent, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { tokens } from '../../lib/tokens';
import { PillButton } from '../../components/ui/PillButton';
import type { DiscountCodeEntry } from '../../lib/discountUtils';

export function DiscountCodesTab() {
  const [codes, setCodes] = useState<Record<string, DiscountCodeEntry>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Add form
  const [newCode, setNewCode] = useState('');
  const [newType, setNewType] = useState<'percent' | 'fixed'>('percent');
  const [newValue, setNewValue] = useState('');
  const [newExpires, setNewExpires] = useState('');
  const [newNote, setNewNote] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'discounts'), snap => {
      setCodes(snap.exists() ? ((snap.data() as any).codes || {}) : {});
      setLoading(false);
    });
    return unsub;
  }, []);

  const persist = async (nextCodes: Record<string, DiscountCodeEntry>) => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'discounts'), {
        codes: nextCodes,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    } catch (err) {
      console.error('Failed to save discount codes:', err);
      alert('Failed to save discount codes.');
    } finally {
      setSaving(false);
    }
  };

  const addCode = async () => {
    const code = newCode.trim().toUpperCase().replace(/\s+/g, '');
    const value = parseFloat(newValue);
    if (!code) { setFormError('Enter a code'); return; }
    if (codes[code]) { setFormError('That code already exists'); return; }
    if (!(value > 0)) { setFormError('Enter a value greater than 0'); return; }
    if (newType === 'percent' && value > 100) { setFormError('Percent must be 100 or less'); return; }
    setFormError('');
    const entry: DiscountCodeEntry = {
      type: newType,
      value,
      active: true,
      ...(newExpires ? { expires: newExpires } : {}),
      ...(newNote.trim() ? { note: newNote.trim() } : {}),
      createdAt: Date.now(),
    };
    await persist({ ...codes, [code]: entry });
    setNewCode('');
    setNewValue('');
    setNewExpires('');
    setNewNote('');
  };

  const toggleActive = async (code: string) => {
    await persist({ ...codes, [code]: { ...codes[code], active: !codes[code].active } });
  };

  const deleteCode = async (code: string) => {
    if (!confirm(`Delete code "${code}"? Customers will no longer be able to use it.`)) return;
    const next = { ...codes };
    delete next[code];
    await persist(next);
  };

  const codeList = Object.entries(codes).sort((a, b) => (b[1].createdAt ?? 0) - (a[1].createdAt ?? 0));

  return (
    <div>
      <div className="mb-5">
        <h3 className={tokens.typography.h3}>Discount Codes</h3>
        <p className={tokens.typography.bodyMuted}>
          Codes customers can redeem on the public storefront checkout and inside their portal at payment.
        </p>
      </div>

      {/* Add code */}
      <div className="mb-6 rounded-xl border border-brand-border bg-brand-bg/50 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className={tokens.typography.label}>Code</label>
            <input
              className={tokens.components.input + ' mt-1 bg-white uppercase'}
              placeholder="WELCOME10"
              value={newCode}
              onChange={e => setNewCode(e.target.value.toUpperCase())}
            />
          </div>
          <div>
            <label className={tokens.typography.label}>Type</label>
            <select
              className={tokens.components.input + ' mt-1 bg-white cursor-pointer'}
              value={newType}
              onChange={e => setNewType(e.target.value as 'percent' | 'fixed')}
            >
              <option value="percent">% off subtotal</option>
              <option value="fixed">$ off subtotal</option>
            </select>
          </div>
          <div>
            <label className={tokens.typography.label}>{newType === 'percent' ? 'Percent' : 'Amount ($)'}</label>
            <input
              className={tokens.components.input + ' mt-1 bg-white'}
              placeholder={newType === 'percent' ? '10' : '25'}
              inputMode="decimal"
              value={newValue}
              onChange={e => setNewValue(e.target.value)}
            />
          </div>
          <div>
            <label className={tokens.typography.label}>Expires (optional)</label>
            <input
              type="date"
              className={tokens.components.input + ' mt-1 bg-white'}
              value={newExpires}
              onChange={e => setNewExpires(e.target.value)}
            />
          </div>
          <div>
            <label className={tokens.typography.label}>Note (optional)</label>
            <input
              className={tokens.components.input + ' mt-1 bg-white'}
              placeholder="Spring promo"
              value={newNote}
              onChange={e => setNewNote(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-xs text-red-600">{formError}</span>
          <PillButton variant="filled" onClick={addCode} disabled={saving}>
            {saving ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Plus size={14} className="mr-2" />}
            Add code
          </PillButton>
        </div>
      </div>

      {/* Code list */}
      {loading ? (
        <div className="flex justify-center py-12 text-brand-secondary">
          <Loader2 className="animate-spin" size={20} />
        </div>
      ) : codeList.length === 0 ? (
        <div className="rounded-xl border border-dashed border-brand-border py-12 text-center text-sm text-brand-secondary">
          <BadgePercent size={22} className="mx-auto mb-2 opacity-50" />
          No discount codes yet.
        </div>
      ) : (
        <div className="space-y-2">
          {codeList.map(([code, entry]) => {
            const expired = entry.expires ? new Date(`${entry.expires}T23:59:59`).getTime() < Date.now() : false;
            return (
              <div key={code} className={`flex flex-wrap items-center gap-3 rounded-xl border border-brand-border bg-white p-3.5 ${!entry.active || expired ? 'opacity-60' : ''}`}>
                <span className="rounded-lg bg-neutral-900 px-3 py-1 font-mono text-xs font-bold tracking-widest text-white">
                  {code}
                </span>
                <span className="text-sm font-semibold text-brand-primary">
                  {entry.type === 'percent' ? `${entry.value}% off` : `$${entry.value.toFixed(2)} off`}
                </span>
                {entry.expires && (
                  <span className={`text-xs ${expired ? 'font-bold text-red-600' : 'text-brand-secondary'}`}>
                    {expired ? 'Expired' : 'Expires'} {entry.expires}
                  </span>
                )}
                {entry.note && <span className="truncate text-xs text-brand-secondary">{entry.note}</span>}
                <div className="ml-auto flex items-center gap-2">
                  <button
                    onClick={() => toggleActive(code)}
                    className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                      entry.active
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                        : 'border-brand-border text-brand-secondary hover:text-brand-primary'
                    }`}
                  >
                    {entry.active ? 'Active' : 'Disabled'}
                  </button>
                  <button onClick={() => deleteCode(code)} className="p-1.5 text-brand-secondary hover:text-red-600" title="Delete code">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-6 flex items-center gap-2 text-xs text-brand-secondary">
        <Save size={12} /> Changes save instantly. Codes apply to the items subtotal before shipping and tax.
      </p>
    </div>
  );
}
