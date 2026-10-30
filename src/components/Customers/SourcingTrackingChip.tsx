import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, Loader2, Pencil, Radio, Truck, X } from 'lucide-react';
import { autoStartOnce, formatEstDelivery, formatEventTime, trackingTone } from '../../lib/liveTracking';
import { TONE_CLASSES } from '../Orders/LiveTrackingStatus';
import { formatCarrierName, getTrackingLink } from '../../lib/utils';

/**
 * Supplier tracking chip for a garment row in the Sourcing tab.
 * Shows live carrier status (from the EasyPost webhook, saved on the
 * order items as sourcingTracking) and opens a scan-history popover.
 */

const POPOVER_WIDTH = 300;

const SHORT_LABEL: Record<string, string> = {
  pre_transit: 'Label Created',
  in_transit: 'In Transit',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  available_for_pickup: 'Ready for Pickup',
  return_to_sender: 'Returning',
  failure: 'Problem',
  cancelled: 'Cancelled',
  error: 'Tracking Error',
  unknown: 'Awaiting Scan',
};

export function SourcingTrackingChip({
  trackingNumber,
  tracking,
  onEdit,
  onStartTracking,
  disabled,
}: {
  trackingNumber: string;
  tracking?: any;
  onEdit: () => void;
  onStartTracking: () => Promise<{ ok: boolean; error?: string }>;
  disabled?: boolean;
}) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');

  const status: string | undefined = tracking?.trackingStatus;
  const tone = TONE_CLASSES[trackingTone(status)];
  const est = status && status !== 'delivered' ? formatEstDelivery(tracking?.trackingEstDelivery) : null;
  const events: any[] = Array.isArray(tracking?.trackingEvents) ? tracking.trackingEvents : [];
  const carrier = tracking?.trackingCarrierDetected || '';
  const link = getTrackingLink(carrier, trackingNumber);

  const place = () => {
    const r = anchorRef.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.max(8, Math.min(r.right - POPOVER_WIDTH, window.innerWidth - POPOVER_WIDTH - 8));
    setPos({ top: r.bottom + 6, left });
  };

  useLayoutEffect(() => {
    if (open) place();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || anchorRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onMove = () => setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open]);

  const handleStart = async () => {
    setStarting(true);
    setStartError('');
    const res = await onStartTracking();
    if (!res.ok) setStartError(res.error || 'Could not start live tracking');
    setStarting(false);
  };

  // Connect live tracking automatically for numbers that don't have status yet
  // (e.g. saved before setup was finished, or if the first attempt failed).
  useEffect(() => {
    if (status || !trackingNumber) return;
    let cancelled = false;
    setStarting(true);
    autoStartOnce(`sourcing:${trackingNumber.replace(/\s+/g, '').toUpperCase()}`, onStartTracking).then((res) => {
      if (cancelled) return;
      if (!res.ok) setStartError(res.error || 'Could not start live tracking');
      setStarting(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackingNumber, status]);

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        title={`Supplier tracking #${trackingNumber}${status ? ` — ${tracking?.trackingStatusLabel || ''}` : ''}`}
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors cursor-pointer max-w-[170px] disabled:opacity-50 ${
          status ? `${tone.pill} hover:brightness-95` : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
        }`}
      >
        {status ? (
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${tone.dot} ${status === 'out_for_delivery' ? 'animate-pulse' : ''}`} />
        ) : starting ? (
          <Loader2 size={11} className="shrink-0 animate-spin" />
        ) : (
          <Truck size={11} className="shrink-0" />
        )}
        <span className="truncate">
          {status ? SHORT_LABEL[status] || tracking?.trackingStatusLabel : trackingNumber}
          {est ? ` · ${est.replace(/,.*$/, '')}` : ''}
        </span>
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={popRef}
            style={{ position: 'fixed', top: pos.top, left: pos.left, width: POPOVER_WIDTH, zIndex: 300 }}
            className="bg-white rounded-2xl border border-brand-border shadow-xl p-4 text-left whitespace-normal"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-brand-secondary">Supplier tracking</p>
                {link ? (
                  <a
                    href={link}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-mono text-blue-700 hover:underline break-all"
                  >
                    {carrier ? `${formatCarrierName(carrier, trackingNumber)} ` : ''}
                    {trackingNumber}
                    <ExternalLink size={10} className="shrink-0" />
                  </a>
                ) : (
                  <p className="text-[11px] font-mono text-brand-primary break-all">{trackingNumber}</p>
                )}
              </div>
              <button type="button" onClick={() => setOpen(false)} className="p-1 rounded-full hover:bg-neutral-100 shrink-0">
                <X size={13} />
              </button>
            </div>

            {status ? (
              <div className="mt-3">
                <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border ${tone.pill}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
                  {tracking?.trackingStatusLabel}
                  {est && <span className="font-semibold opacity-80">· Est. {est}</span>}
                  {tracking?.trackingMode === 'test' && <span className="font-semibold opacity-60">· TEST</span>}
                </span>
                {events.length > 0 ? (
                  <ol className="mt-3 ml-1 border-l border-brand-border pl-3 space-y-2 max-h-[220px] overflow-y-auto">
                    {events.map((ev, i) => (
                      <li key={`${ev.datetime}-${i}`} className="relative">
                        <span
                          className={`absolute -left-[17px] top-1 w-2 h-2 rounded-full border-2 border-white ${i === 0 ? tone.dot : 'bg-neutral-300'}`}
                        />
                        <p className={`text-[11px] leading-snug ${i === 0 ? 'font-bold text-brand-primary' : 'font-medium text-neutral-700'}`}>
                          {ev.message || 'Update'}
                        </p>
                        <p className="text-[10px] text-brand-secondary">
                          {[ev.location, formatEventTime(ev.datetime)].filter(Boolean).join(' · ')}
                        </p>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-[11px] text-brand-secondary mt-2">No carrier scans yet.</p>
                )}
                {status === 'delivered' && (
                  <p className="text-[11px] text-emerald-700 font-semibold mt-3">Delivered — count it, then click Receive All.</p>
                )}
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                <p className="text-[11px] text-brand-secondary">
                  {starting
                    ? 'Connecting to the carrier…'
                    : startError
                      ? "Couldn't connect live status for this number."
                      : 'Waiting for the first carrier update…'}
                </p>
                {!starting && startError && (<button
                  type="button"
                  disabled={starting}
                  onClick={handleStart}
                  className="inline-flex items-center gap-1.5 text-[10px] font-bold text-neutral-700 bg-white hover:bg-neutral-100 px-2.5 py-1 rounded-full border border-dashed border-neutral-300 disabled:opacity-60"
                >
                  <Radio size={11} />
                  Try again
                </button>)}
                {startError && <p className="text-[10px] text-red-600 font-medium">{startError}</p>}
              </div>
            )}

            <div className="mt-3 pt-3 border-t border-brand-border/70 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onEdit();
                }}
                className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-brand-primary hover:text-black px-2.5 py-1 rounded-full border border-brand-border hover:bg-neutral-100"
              >
                <Pencil size={10} /> Edit tracking #
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
