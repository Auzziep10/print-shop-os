import { useMemo, useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { ChevronDown, ExternalLink, Loader2, PackageOpen, Plus, Trash2, X } from 'lucide-react';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { tokens } from '../../lib/tokens';
import { getTrackingLink, formatCarrierName } from '../../lib/utils';
import { isDiscountItem, isNonGarmentItem } from '../../lib/garmentUtils';
import { startInboundTracking } from '../../lib/liveTracking';
import { LiveTrackingStatus } from './LiveTrackingStatus';

/**
 * Incoming Garments — tracking for blanks ordered from suppliers
 * (SanMar, S&S, etc.) before production.
 *
 * Stored on the order as inboundShipments[]: one entry per tracking number.
 * Live status comes from the same EasyPost webhook as outgoing boxes.
 * The same tracking number can be added to several orders when one
 * supplier package covers more than one job.
 */

const SUPPLIER_SUGGESTIONS = ['SanMar', 'S&S Activewear', 'alphabroder', 'Shopify', 'Amazon'];

type InboundShipment = {
  id: string;
  supplier: string;
  supplierOrderNumber: string | null;
  trackingNumber: string;
  trackingCarrier: string;
  itemIds: string[];
  notes: string | null;
  createdAt: string;
  createdBy: string;
  [key: string]: any;
};

function splitTrackingNumbers(raw: string): string[] {
  const parts = raw
    .split(/[\s,;]+/)
    .map((p) => p.trim().replace(/[^A-Za-z0-9]/g, ''))
    .filter((p) => p.length >= 8);
  return Array.from(new Set(parts.map((p) => p.toUpperCase())));
}

export function IncomingGarments({ order, canEdit = true }: { order: any; canEdit?: boolean }) {
  const { user, userData } = useAuth() as any;
  const shipments: InboundShipment[] = Array.isArray(order?.inboundShipments) ? order.inboundShipments : [];

  const [isOpen, setIsOpen] = useState(shipments.length > 0);
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const [supplier, setSupplier] = useState('');
  const [supplierOrderNumber, setSupplierOrderNumber] = useState('');
  const [trackingInput, setTrackingInput] = useState('');
  const [carrier, setCarrier] = useState('');
  const [itemIds, setItemIds] = useState<string[]>([]);
  const [notes, setNotes] = useState('');

  const userName = userData?.name || user?.displayName || user?.email?.split('@')[0] || 'Team Member';

  const garmentItems = useMemo(
    () => (order?.items || []).filter((i: any) => i && !isDiscountItem(i) && !isNonGarmentItem(i)),
    [order?.items],
  );
  const itemName = (id: string) => {
    const it = (order?.items || []).find((i: any) => i.id === id);
    if (!it) return null;
    return [it.style, it.color].filter(Boolean).join(' · ') || 'Garment';
  };

  const supplierOrderNumbers: string[] = useMemo(
    () =>
      Array.from(
        new Set(
          (order?.costs || [])
            .map((c: any) => (c?.supplierOrderNumber ? String(c.supplierOrderNumber).trim() : ''))
            .filter(Boolean),
        ),
      ),
    [order?.costs],
  );

  const parsedNumbers = splitTrackingNumbers(trackingInput);
  const existingNumbers = new Set(shipments.map((s) => String(s.trackingNumber || '').toUpperCase()));
  const newNumbers = parsedNumbers.filter((n) => !existingNumbers.has(n));

  const counts = shipments.reduce(
    (acc, s) => {
      if (s.trackingStatus === 'delivered') acc.delivered++;
      else if (['failure', 'return_to_sender', 'error'].includes(s.trackingStatus)) acc.problem++;
      else acc.onTheWay++;
      return acc;
    },
    { delivered: 0, onTheWay: 0, problem: 0 },
  );

  const resetForm = () => {
    setSupplier('');
    setSupplierOrderNumber('');
    setTrackingInput('');
    setCarrier('');
    setItemIds([]);
    setNotes('');
    setError('');
  };

  const handleSave = async () => {
    if (!newNumbers.length) {
      setError(parsedNumbers.length ? 'That tracking number is already on this order.' : 'Enter at least one tracking number.');
      return;
    }
    setIsSaving(true);
    setError('');
    try {
      const now = Date.now();
      const created: InboundShipment[] = newNumbers.map((num, i) => ({
        id: `inb-${now}-${i}`,
        supplier: supplier.trim() || 'Supplier',
        supplierOrderNumber: supplierOrderNumber.trim() || null,
        trackingNumber: num,
        trackingCarrier: carrier,
        itemIds,
        notes: notes.trim() || null,
        createdAt: new Date().toISOString(),
        createdBy: userName,
      }));

      const label = `${supplier.trim() || 'supplier'}${supplierOrderNumber.trim() ? ` #${supplierOrderNumber.trim()}` : ''}`;
      const activity = {
        id: `act-${now}`,
        type: 'system',
        message: `Added incoming garment tracking from ${label}: ${newNumbers.join(', ')}`,
        user: userName,
        timestamp: new Date().toISOString(),
      };

      await setDoc(
        doc(db, 'orders', order.id),
        {
          inboundShipments: [...shipments, ...created],
          activities: [activity, ...(order.activities || [])],
        },
        { merge: true },
      );

      // Register each package with EasyPost; status fills in via the webhook
      const results = await Promise.all(created.map((s) => startInboundTracking(order.id, s.id)));
      const failed = results.find((r) => !r.ok);

      resetForm();
      setIsAdding(false);
      setIsOpen(true);
      if (failed) setError(`Saved, but live tracking didn't start: ${failed.error}. Use "Start live tracking" to retry.`);
    } catch (err: any) {
      console.error('Error saving incoming garments:', err);
      setError('Could not save. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async (entry: InboundShipment) => {
    if (!window.confirm(`Remove tracking ${entry.trackingNumber} from this order?`)) return;
    try {
      await setDoc(
        doc(db, 'orders', order.id),
        {
          inboundShipments: shipments.filter((s) => s.id !== entry.id),
          activities: [
            {
              id: `act-${Date.now()}`,
              type: 'system',
              message: `Removed incoming garment tracking ${entry.trackingNumber}`,
              user: userName,
              timestamp: new Date().toISOString(),
            },
            ...(order.activities || []),
          ],
        },
        { merge: true },
      );
    } catch (err) {
      console.error('Error removing incoming garments:', err);
    }
  };

  const summaryParts = [
    counts.onTheWay ? `${counts.onTheWay} on the way` : '',
    counts.delivered ? `${counts.delivered} delivered` : '',
    counts.problem ? `${counts.problem} with a problem` : '',
  ].filter(Boolean);

  return (
    <div className="bg-white p-6 rounded-card border border-brand-border shadow-sm mt-8">
      <div className="flex justify-between items-center cursor-pointer select-none group" onClick={() => setIsOpen((v) => !v)}>
        <div className="flex items-center gap-2 min-w-0">
          <PackageOpen className="text-brand-primary shrink-0" size={22} />
          <h2 className={tokens.typography.h2}>Incoming Garments</h2>
          {shipments.length > 0 && (
            <span className="hidden sm:inline text-xs font-bold text-brand-secondary ml-2 truncate">
              {shipments.length} package{shipments.length === 1 ? '' : 's'}
              {summaryParts.length ? ` · ${summaryParts.join(' · ')}` : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-brand-secondary group-hover:text-brand-primary transition-colors text-xs font-bold uppercase tracking-wider">
          <span>{isOpen ? 'Hide' : 'Show'}</span>
          <ChevronDown size={18} className={`transform transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {isOpen && (
        <div className="mt-5 space-y-3">
          {shipments.length === 0 && !isAdding && (
            <p className="text-sm text-brand-secondary">
              Paste the tracking number from a supplier order confirmation to see when the blanks will arrive.
            </p>
          )}

          {shipments.map((s) => {
            const shownCarrier = s.trackingCarrier || s.trackingCarrierDetected || '';
            const link = getTrackingLink(shownCarrier, s.trackingNumber);
            const linked = (s.itemIds || []).map(itemName).filter(Boolean) as string[];
            return (
              <div
                key={s.id}
                className="relative flex flex-col md:flex-row md:items-start gap-3 md:gap-6 p-4 rounded-2xl border border-brand-border bg-brand-bg/40"
              >
                <div className="min-w-0 md:w-[240px] shrink-0 pr-8 md:pr-0">
                  <p className="text-sm font-bold text-brand-primary truncate">
                    {s.supplier || 'Supplier'}
                    {s.supplierOrderNumber && <span className="font-semibold text-brand-secondary"> · #{s.supplierOrderNumber}</span>}
                  </p>
                  {link ? (
                    <a
                      href={link}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-mono text-blue-700 hover:underline mt-0.5 break-all"
                      title="Open on the carrier's website"
                    >
                      {shownCarrier ? `${formatCarrierName(shownCarrier, s.trackingNumber)} ` : ''}
                      {s.trackingNumber}
                      <ExternalLink size={10} className="shrink-0" />
                    </a>
                  ) : (
                    <p className="text-[11px] font-mono text-brand-secondary mt-0.5 break-all">{s.trackingNumber}</p>
                  )}
                  {linked.length > 0 && (
                    <p className="text-[11px] text-brand-secondary mt-1 leading-snug">For: {linked.join(', ')}</p>
                  )}
                  {s.notes && <p className="text-[11px] text-neutral-500 italic mt-1 leading-snug">{s.notes}</p>}
                </div>

                <div className="flex-1 min-w-0">
                  <LiveTrackingStatus orderId={order.id} box={s} kind="inbound" />
                </div>

                {canEdit && (
                  <button
                    type="button"
                    onClick={() => handleRemove(s)}
                    className="absolute top-3 right-3 md:static md:self-start p-2 rounded-full text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    title="Remove this tracking number"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            );
          })}

          {error && <p className="text-xs font-medium text-red-600">{error}</p>}

          {canEdit && !isAdding && (
            <button
              type="button"
              onClick={() => {
                resetForm();
                setIsAdding(true);
              }}
              className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-brand-primary bg-white hover:bg-neutral-100 px-3.5 py-2 rounded-full border border-brand-border transition-colors"
            >
              <Plus size={13} /> Add supplier tracking
            </button>
          )}

          {canEdit && isAdding && (
            <div className="p-4 rounded-2xl border border-brand-border bg-neutral-50/70 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-brand-primary">New incoming package</p>
                <button type="button" onClick={() => setIsAdding(false)} className="p-1.5 rounded-full hover:bg-neutral-200 transition-colors">
                  <X size={14} />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-secondary mb-1">Supplier</label>
                  <input
                    list="incoming-garments-suppliers"
                    value={supplier}
                    onChange={(e) => setSupplier(e.target.value)}
                    placeholder="e.g. SanMar"
                    className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-xs font-semibold focus:border-brand-primary outline-none"
                  />
                  <datalist id="incoming-garments-suppliers">
                    {SUPPLIER_SUGGESTIONS.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-secondary mb-1">Supplier order # (optional)</label>
                  <input
                    list="incoming-garments-po"
                    value={supplierOrderNumber}
                    onChange={(e) => setSupplierOrderNumber(e.target.value)}
                    placeholder={supplierOrderNumbers[0] ? `e.g. ${supplierOrderNumbers[0]}` : 'From the order confirmation'}
                    className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-xs focus:border-brand-primary outline-none"
                  />
                  <datalist id="incoming-garments-po">
                    {supplierOrderNumbers.map((n) => (
                      <option key={n} value={n} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-[1fr_160px] gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-secondary mb-1">
                    Tracking number(s)
                  </label>
                  <textarea
                    value={trackingInput}
                    onChange={(e) => setTrackingInput(e.target.value)}
                    rows={2}
                    placeholder="Paste one or more — separate with commas or new lines"
                    className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-xs font-mono focus:border-brand-primary outline-none resize-y"
                  />
                  {parsedNumbers.length > 1 && (
                    <p className="text-[10px] text-brand-secondary mt-0.5">{parsedNumbers.length} packages will be added.</p>
                  )}
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-secondary mb-1">Carrier</label>
                  <select
                    value={carrier}
                    onChange={(e) => setCarrier(e.target.value)}
                    className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-xs font-medium focus:border-brand-primary outline-none"
                  >
                    <option value="">Auto-detect</option>
                    <option value="UPS">UPS</option>
                    <option value="FedEx">FedEx</option>
                    <option value="USPS">USPS</option>
                    <option value="DHL">DHL</option>
                  </select>
                </div>
              </div>

              {garmentItems.length > 0 && (
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-secondary mb-1">
                    Which garments are in it? (optional)
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {garmentItems.map((it: any) => {
                      const on = itemIds.includes(it.id);
                      return (
                        <button
                          key={it.id}
                          type="button"
                          onClick={() => setItemIds((prev) => (on ? prev.filter((x) => x !== it.id) : [...prev, it.id]))}
                          className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                            on ? 'bg-black text-white border-black' : 'bg-white text-brand-primary border-brand-border hover:bg-neutral-100'
                          }`}
                        >
                          {[it.style, it.color].filter(Boolean).join(' · ') || 'Garment'}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-secondary mb-1">Notes (optional)</label>
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Backordered 2XL ships separately"
                  className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-xs focus:border-brand-primary outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="text-[11px] font-bold uppercase tracking-wider px-4 py-2 rounded-full border border-brand-border bg-white hover:bg-neutral-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving || !trackingInput.trim()}
                  className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider px-4 py-2 rounded-full bg-black text-white hover:bg-neutral-800 transition-colors disabled:opacity-50"
                >
                  {isSaving && <Loader2 size={12} className="animate-spin" />}
                  {isSaving ? 'Saving…' : 'Save & track'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
