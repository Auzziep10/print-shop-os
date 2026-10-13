import { useState, useEffect, useMemo } from 'react';
import { X, Search, Check, Loader2, AlertCircle, ArrowRightLeft, Box, Package } from 'lucide-react';
import { PillButton } from '../ui/PillButton';
import { db } from '../../lib/firebase';
import { doc, writeBatch } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';

interface TransferSizesModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The order the garment currently lives in */
  sourceOrder: any;
  /** The garment line item being split */
  item: any;
  /** All orders (used to find other orders for the same customer) */
  orders: any[];
  /** Optional size to pre-select (e.g. when launched from the size right-click menu) */
  initialSize?: string | null;
  onTransferred?: (targetOrderId: string) => void;
}

const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', 'XXL', '3XL', 'XXXL', '4XL', '5XL', '6XL'];
const sortSizes = (a: string, b: string) => {
  const ia = SIZE_ORDER.indexOf(a.toUpperCase());
  const ib = SIZE_ORDER.indexOf(b.toUpperCase());
  if (ia === -1 && ib === -1) return a.localeCompare(b, undefined, { numeric: true });
  if (ia === -1) return 1;
  if (ib === -1) return -1;
  return ia - ib;
};

const toInt = (v: any) => parseInt(v) || 0;
const sumSizes = (sizes: Record<string, any> | undefined) =>
  Object.values(sizes || {}).reduce((acc: number, v: any) => acc + toInt(v), 0);
const parsePrice = (p: any) => {
  const n = parseFloat((p ?? '0').toString().replace(/[^0-9.]/g, ''));
  return isNaN(n) ? 0 : n;
};
const norm = (v: any) => (v || '').toString().trim().toLowerCase();

/** Per-size status keys stored as string arrays on a line item */
const SIZE_LIST_KEYS = ['completedSizes', 'orderedSizes', 'receivedSizes', 'returnedSizes'] as const;
/** Per-size status keys stored as objects keyed by size on a line item */
const SIZE_MAP_KEYS = ['inProgressSizes', 'sizeStats'] as const;

export function TransferSizesModal({
  isOpen,
  onClose,
  sourceOrder,
  item,
  orders,
  initialSize,
  onTransferred
}: TransferSizesModalProps) {
  const { userData, user } = useAuth();
  const [transferQtys, setTransferQtys] = useState<Record<string, number>>({});
  const [targetOrderId, setTargetOrderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [mergeIntoExisting, setMergeIntoExisting] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Quantity of each size already packed into shipments on the source order (cannot be moved)
  const boxedQtyBySize = useMemo(() => {
    const map: Record<string, number> = {};
    (sourceOrder?.boxes || []).forEach((box: any) => {
      const bi = box.items?.find((b: any) => String(b.id) === String(item?.id));
      Object.entries(bi?.sizes || {}).forEach(([s, q]) => {
        map[s] = (map[s] || 0) + toInt(q);
      });
    });
    return map;
  }, [sourceOrder, item]);

  const sizeRows = useMemo(() => {
    return Object.entries(item?.sizes || {})
      .map(([size, q]) => {
        const qty = toInt(q);
        const boxed = boxedQtyBySize[size] || 0;
        return { size, qty, boxed, available: Math.max(0, qty - boxed) };
      })
      .filter(r => r.qty > 0)
      .sort((a, b) => sortSizes(a.size, b.size));
  }, [item, boxedQtyBySize]);

  useEffect(() => {
    if (!isOpen) {
      setTransferQtys({});
      setTargetOrderId(null);
      setSearchQuery('');
      setMergeIntoExisting(true);
      setError(null);
      return;
    }
    if (initialSize) {
      const row = sizeRows.find(r => r.size === initialSize);
      if (row && row.available > 0) setTransferQtys({ [initialSize]: row.available });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialSize]);

  const customerOrders = useMemo(() => {
    const custId = sourceOrder?.customerId;
    if (!custId) return [];
    return (orders || [])
      .filter(o => o.id !== sourceOrder.id && o.customerId === custId)
      .sort((a, b) => {
        const da = new Date(a.createdAt?.toDate?.() || a.createdAt || a.date || 0).getTime();
        const dbb = new Date(b.createdAt?.toDate?.() || b.createdAt || b.date || 0).getTime();
        return dbb - da;
      });
  }, [orders, sourceOrder]);

  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return customerOrders;
    return customerOrders.filter(o =>
      (o.title || '').toLowerCase().includes(q) ||
      (o.portalId || o.id || '').toLowerCase().includes(q) ||
      (o.status || '').toLowerCase().includes(q)
    );
  }, [customerOrders, searchQuery]);

  const targetOrder = useMemo(
    () => customerOrders.find(o => o.id === targetOrderId) || null,
    [customerOrders, targetOrderId]
  );

  // An existing line item in the target order that represents the same garment
  const matchingTargetItem = useMemo(() => {
    if (!targetOrder) return null;
    return (targetOrder.items || []).find((ti: any) =>
      (item?.id && ti.transferredFromItemId === item.id) ||
      (norm(ti.style) === norm(item?.style) &&
        norm(ti.color) === norm(item?.color) &&
        norm(ti.itemNum) === norm(item?.itemNum) &&
        norm(ti.title) === norm(item?.title) &&
        ti.itemType === item?.itemType)
    ) || null;
  }, [targetOrder, item]);

  const selectedEntries = Object.entries(transferQtys).filter(([, q]) => q > 0);
  const totalTransfer = selectedEntries.reduce((a, [, q]) => a + q, 0);
  const remainingAfter = sumSizes(item?.sizes) - totalTransfer;

  const toggleSize = (size: string, available: number) => {
    setTransferQtys(prev => {
      const next = { ...prev };
      if (next[size] > 0) delete next[size];
      else if (available > 0) next[size] = available;
      return next;
    });
  };

  const setSizeQty = (size: string, value: string, available: number) => {
    const n = Math.max(0, Math.min(available, parseInt(value) || 0));
    setTransferQtys(prev => ({ ...prev, [size]: n }));
  };

  const selectAll = () => {
    const next: Record<string, number> = {};
    sizeRows.forEach(r => { if (r.available > 0) next[r.size] = r.available; });
    setTransferQtys(next);
  };

  const handleConfirm = async () => {
    if (!sourceOrder?.id || !targetOrder || !item || totalTransfer <= 0) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const adminName = userData?.name || user?.displayName || user?.email?.split('@')[0] || 'Team Member';
      const now = Date.now();
      const price = parsePrice(item.price);
      const garmentName = item.title || item.style || 'Garment';
      const sizeSummary = selectedEntries
        .sort(([a], [b]) => sortSizes(a, b))
        .map(([s, q]) => `${q}x ${s}`)
        .join(', ');

      // Sizes moved in their entirety carry their per-size status with them
      const fullyMovedSizes = selectedEntries
        .filter(([s, q]) => q >= toInt(item.sizes?.[s]))
        .map(([s]) => s);

      // ---------- Source item ----------
      const newSourceSizes: Record<string, number> = { ...(item.sizes || {}) };
      selectedEntries.forEach(([s, q]) => {
        newSourceSizes[s] = Math.max(0, toInt(newSourceSizes[s]) - q);
      });
      const newSourceQty = sumSizes(newSourceSizes);

      const updatedSourceItem: any = {
        ...item,
        sizes: newSourceSizes,
        qty: newSourceQty,
        total: `$${(newSourceQty * price).toFixed(2)}`
      };
      SIZE_LIST_KEYS.forEach(k => {
        if (Array.isArray(item[k])) updatedSourceItem[k] = item[k].filter((s: string) => !fullyMovedSizes.includes(s));
      });
      SIZE_MAP_KEYS.forEach(k => {
        if (item[k] && typeof item[k] === 'object') {
          const m = { ...item[k] };
          fullyMovedSizes.forEach(s => delete m[s]);
          updatedSourceItem[k] = m;
        }
      });

      const removeSourceItem = newSourceQty === 0;
      const updatedSourceItems = removeSourceItem
        ? (sourceOrder.items || []).filter((i: any) => i.id !== item.id)
        : (sourceOrder.items || []).map((i: any) => (i.id === item.id ? updatedSourceItem : i));

      // ---------- Target item ----------
      const carriedStatus = (base: any) => {
        const out: any = {};
        SIZE_LIST_KEYS.forEach(k => {
          const carried = (item[k] || []).filter((s: string) => fullyMovedSizes.includes(s));
          out[k] = Array.from(new Set([...(base?.[k] || []), ...carried]));
        });
        SIZE_MAP_KEYS.forEach(k => {
          const m = { ...(base?.[k] || {}) };
          fullyMovedSizes.forEach(s => { if (item[k]?.[s]) m[s] = item[k][s]; });
          out[k] = m;
        });
        return out;
      };

      let updatedTargetItems: any[];
      const useMerge = mergeIntoExisting && !!matchingTargetItem;

      if (useMerge) {
        const mt = matchingTargetItem;
        const mergedSizes: Record<string, number> = { ...(mt.sizes || {}) };
        selectedEntries.forEach(([s, q]) => { mergedSizes[s] = toInt(mergedSizes[s]) + q; });
        const mergedQty = sumSizes(mergedSizes);
        const mtPrice = parsePrice(mt.price);
        const mergedItem = {
          ...mt,
          ...carriedStatus(mt),
          sizes: mergedSizes,
          qty: mergedQty,
          total: `$${(mergedQty * mtPrice).toFixed(2)}`
        };
        updatedTargetItems = (targetOrder.items || []).map((ti: any) => (ti.id === mt.id ? mergedItem : ti));
      } else {
        // Keep the same size columns as the source (zeros for non-transferred sizes)
        const newSizes: Record<string, number> = {};
        Object.keys(item.sizes || {}).forEach(s => { newSizes[s] = 0; });
        selectedEntries.forEach(([s, q]) => { newSizes[s] = q; });

        const { id: _oldId, ...rest } = item;
        void _oldId;
        const newItem = {
          ...rest,
          ...carriedStatus(null),
          id: `item-${now}-${Math.random().toString(36).slice(2, 7)}`,
          sizes: newSizes,
          qty: totalTransfer,
          total: `$${(totalTransfer * price).toFixed(2)}`,
          transferredFromOrderId: sourceOrder.id,
          transferredFromItemId: item.id
        };
        updatedTargetItems = [...(targetOrder.items || []), newItem];
      }

      // ---------- Activities ----------
      const sourceLabel = sourceOrder.portalId || sourceOrder.id;
      const targetLabel = targetOrder.portalId || targetOrder.id;

      const sourceActivity = {
        id: `act-${now}`,
        type: 'system',
        message: `Transferred ${sizeSummary} of ${garmentName} to order ${targetLabel}${targetOrder.title ? ` ("${targetOrder.title}")` : ''}${removeSourceItem ? ' (line item removed)' : ''}`,
        user: adminName,
        timestamp: new Date().toISOString()
      };
      const targetActivity = {
        id: `act-${now + 1}`,
        type: 'system',
        message: `Received ${sizeSummary} of ${garmentName} from order ${sourceLabel}${sourceOrder.title ? ` ("${sourceOrder.title}")` : ''}`,
        user: adminName,
        timestamp: new Date().toISOString()
      };

      const batch = writeBatch(db);
      batch.set(doc(db, 'orders', sourceOrder.id), {
        items: updatedSourceItems,
        activities: [sourceActivity, ...(sourceOrder.activities || [])]
      }, { merge: true });
      batch.set(doc(db, 'orders', targetOrder.id), {
        items: updatedTargetItems,
        activities: [targetActivity, ...(targetOrder.activities || [])]
      }, { merge: true });
      await batch.commit();

      onTransferred?.(targetOrder.id);
      onClose();
    } catch (err: any) {
      console.error('Failed to transfer sizes:', err);
      setError(err?.message || 'Failed to transfer sizes. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !item) return null;

  const customerName = sourceOrder?.customerName || sourceOrder?.companyName || 'this customer';

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl p-6 md:p-8 max-w-2xl w-full flex flex-col shadow-2xl border border-brand-border my-auto max-h-[92vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-4 pb-3 border-b border-brand-border/60">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-black text-white flex items-center justify-center shrink-0 shadow-sm">
              <ArrowRightLeft size={20} />
            </div>
            <div className="min-w-0">
              <h3 className="text-xl font-black text-gray-900 leading-tight">Transfer Sizes to Another Order</h3>
              <p className="text-xs text-brand-secondary mt-0.5 truncate">
                Move sizes of <strong>{item.title || item.style || 'this garment'}</strong>
                {item.color ? ` (${item.color})` : ''} to another order for <strong>{customerName}</strong>.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 bg-neutral-100 hover:bg-neutral-200 rounded-full transition-colors shrink-0 text-brand-secondary"
          >
            <X size={16} />
          </button>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-xs px-4 py-3 rounded-xl flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="overflow-y-auto custom-scrollbar pr-1 flex-1 space-y-5 mb-5">
          {/* Step 1: Sizes */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-brand-secondary">
                1. Select Sizes &amp; Quantities
              </label>
              <button
                type="button"
                onClick={selectAll}
                className="text-[10px] font-bold uppercase tracking-wider text-blue-600 hover:text-blue-800"
              >
                Select All
              </button>
            </div>

            {sizeRows.length === 0 ? (
              <div className="p-4 text-center text-xs text-neutral-500 border border-dashed border-neutral-300 rounded-2xl">
                This line item has no size quantities to transfer.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {sizeRows.map(row => {
                  const selected = (transferQtys[row.size] || 0) > 0;
                  const disabled = row.available === 0;
                  return (
                    <div
                      key={row.size}
                      className={`w-[84px] rounded-xl border overflow-hidden transition-all ${
                        disabled
                          ? 'opacity-50 border-neutral-200 bg-neutral-50'
                          : selected
                            ? 'border-blue-500 ring-2 ring-blue-200 bg-blue-50'
                            : 'border-neutral-200 bg-white hover:border-neutral-400'
                      }`}
                      title={row.boxed > 0 ? `${row.boxed} already packed in shipments and cannot be moved` : undefined}
                    >
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => toggleSize(row.size, row.available)}
                        className={`w-full flex items-center justify-center gap-1 py-1.5 text-[11px] font-bold uppercase tracking-wide ${
                          selected ? 'bg-blue-600 text-white' : 'bg-neutral-200 text-neutral-700'
                        } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        {selected && <Check size={11} strokeWidth={4} />}
                        {row.size}
                      </button>
                      <div className="px-2 py-1.5 flex flex-col items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          max={row.available}
                          disabled={disabled}
                          value={transferQtys[row.size] ?? ''}
                          placeholder="0"
                          onChange={e => setSizeQty(row.size, e.target.value, row.available)}
                          className="w-full text-center text-sm font-bold bg-white border border-neutral-200 rounded-lg py-1 outline-none focus:border-blue-500"
                        />
                        <span className="text-[9px] font-semibold text-neutral-500 leading-tight text-center">
                          of {row.available}
                          {row.boxed > 0 && (
                            <span className="flex items-center justify-center gap-0.5 text-blue-600">
                              <Box size={8} /> {row.boxed} packed
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Step 2: Target order */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-brand-secondary mb-1.5">
              2. Choose Destination Order
            </label>

            {!sourceOrder?.customerId ? (
              <div className="p-4 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-2xl">
                This order isn't linked to a customer profile, so there are no other orders to transfer into.
              </div>
            ) : customerOrders.length === 0 ? (
              <div className="p-4 text-xs text-neutral-500 border border-dashed border-neutral-300 rounded-2xl text-center">
                {customerName} has no other orders. Create a new order for them first, then transfer sizes into it.
              </div>
            ) : (
              <>
                {customerOrders.length > 5 && (
                  <div className="relative mb-2">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search by order title, number, or status..."
                      className="w-full bg-brand-bg/50 border border-brand-border rounded-xl pl-9 pr-3 py-2 text-sm font-semibold focus:border-black focus:bg-white outline-none transition-all placeholder:font-normal placeholder:text-neutral-400"
                    />
                  </div>
                )}
                <div className="border border-brand-border rounded-2xl overflow-hidden bg-neutral-50/50 max-h-[220px] overflow-y-auto custom-scrollbar divide-y divide-brand-border/40">
                  {filteredOrders.length === 0 ? (
                    <div className="p-6 text-center text-xs text-neutral-500">No orders match "{searchQuery}".</div>
                  ) : (
                    filteredOrders.map(o => {
                      const isSelected = o.id === targetOrderId;
                      const itemCount = (o.items || []).length;
                      return (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => setTargetOrderId(o.id)}
                          className={`w-full text-left p-3 flex items-center justify-between gap-3 transition-colors ${
                            isSelected ? 'bg-blue-50/90' : 'hover:bg-white'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className={`font-bold text-sm truncate ${isSelected ? 'text-blue-900' : 'text-neutral-900'}`}>
                                {o.title || 'Untitled Order'}
                              </span>
                              {o.status && (
                                <span className="text-[9px] bg-neutral-200 text-neutral-700 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider shrink-0">
                                  {o.status}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-neutral-500 mt-0.5">
                              <span>#{o.portalId || o.id.slice(0, 8)}</span>
                              <span className="flex items-center gap-1"><Package size={11} /> {itemCount} item{itemCount === 1 ? '' : 's'}</span>
                            </div>
                          </div>
                          {isSelected ? (
                            <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">
                              <Check size={14} strokeWidth={3} />
                            </div>
                          ) : (
                            <div className="w-5 h-5 rounded-full border border-neutral-300 shrink-0" />
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </div>

          {/* Summary */}
          {targetOrder && totalTransfer > 0 && (
            <div className="p-4 bg-neutral-50 rounded-2xl border border-brand-border/80 space-y-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-brand-secondary block">Summary</span>

              {matchingTargetItem && (
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={mergeIntoExisting}
                    onChange={e => setMergeIntoExisting(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded cursor-pointer accent-black shrink-0"
                  />
                  <div className="text-xs">
                    <span className="font-bold text-neutral-900 block">
                      Merge into the matching line item already on this order
                    </span>
                    <span className="text-[11px] text-neutral-500 block mt-0.5">
                      Uncheck to add as a separate line item instead.
                    </span>
                  </div>
                </label>
              )}

              <ul className="text-xs text-neutral-700 space-y-1 bg-white p-3 rounded-xl border border-neutral-200/60">
                <li>
                  Moving <strong>{totalTransfer}</strong> pc{totalTransfer === 1 ? '' : 's'} (
                  {selectedEntries.sort(([a], [b]) => sortSizes(a, b)).map(([s, q]) => `${q}x ${s}`).join(', ')})
                  {' '}to <strong>{targetOrder.title || 'Untitled Order'}</strong>.
                </li>
                <li>
                  {remainingAfter > 0
                    ? <>This order will keep <strong>{remainingAfter}</strong> pc{remainingAfter === 1 ? '' : 's'} of this garment.</>
                    : <span className="text-amber-700 font-semibold">All pieces are moving — this line item will be removed from the current order.</span>}
                </li>
                <li className="text-neutral-500">Line totals are recalculated on both orders using the item's unit price.</li>
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 pt-3 border-t border-brand-border/60">
          <PillButton
            variant="outline"
            onClick={onClose}
            className="flex-1 justify-center py-3 bg-white"
            disabled={isSubmitting}
          >
            Cancel
          </PillButton>
          <PillButton
            variant="filled"
            onClick={handleConfirm}
            className="flex-1 justify-center py-3 text-white bg-black hover:bg-neutral-800 disabled:opacity-50"
            disabled={!targetOrder || totalTransfer <= 0 || isSubmitting}
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <Loader2 size={16} className="animate-spin" /> Transferring...
              </span>
            ) : (
              `Transfer ${totalTransfer > 0 ? `${totalTransfer} pc${totalTransfer === 1 ? '' : 's'}` : 'Sizes'}`
            )}
          </PillButton>
        </div>
      </div>
    </div>
  );
}
