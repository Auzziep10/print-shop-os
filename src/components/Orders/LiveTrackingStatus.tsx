import { useState } from 'react';
import { Activity, ChevronDown, Loader2, Radio } from 'lucide-react';
import { formatEstDelivery, formatEventTime, startInboundTracking, startLiveTracking, trackingTone, type TrackingTone } from '../../lib/liveTracking';

const TONE_CLASSES: Record<TrackingTone, { pill: string; dot: string }> = {
  neutral: { pill: 'bg-neutral-100 text-neutral-700 border-neutral-200', dot: 'bg-neutral-400' },
  blue: { pill: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500' },
  amber: { pill: 'bg-amber-50 text-amber-800 border-amber-200', dot: 'bg-amber-500' },
  green: { pill: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  red: { pill: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' },
};

/**
 * Live carrier status for one package, updated by the EasyPost webhook.
 * Works for outgoing boxes (kind "box") and incoming garment packages
 * (kind "inbound"). Shows a status pill with an expandable scan history,
 * or a button to start tracking when there's no live status yet.
 */
export function LiveTrackingStatus({ orderId, box, kind = 'box' }: { orderId: string; box: any; kind?: 'box' | 'inbound' }) {
  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  if (!box?.trackingNumber || box.trackingCarrier === 'Pickup') return null;

  if (!box.trackingStatus) {
    return (
      <div className="mt-1.5 flex flex-col items-start gap-1">
        <button
          type="button"
          disabled={starting}
          onClick={async (e) => {
            e.stopPropagation();
            setStarting(true);
            setError('');
            const result = kind === 'inbound' ? await startInboundTracking(orderId, box.id) : await startLiveTracking(orderId, box.id);
            if (!result.ok) setError(result.error || 'Could not start tracking');
            setStarting(false);
          }}
          className="inline-flex items-center gap-1.5 text-[10px] font-bold text-neutral-600 bg-white hover:bg-neutral-100 px-2.5 py-1 rounded-full border border-dashed border-neutral-300 transition-colors cursor-pointer disabled:opacity-60"
          title="Get live status updates for this package from the carrier"
        >
          {starting ? <Loader2 size={11} className="animate-spin" /> : <Radio size={11} />}
          {starting ? 'Connecting…' : 'Start live tracking'}
        </button>
        {error && <span className="text-[10px] text-red-600 font-medium max-w-[220px]">{error}</span>}
      </div>
    );
  }

  const tone = TONE_CLASSES[trackingTone(box.trackingStatus)];
  const est = box.trackingStatus !== 'delivered' ? formatEstDelivery(box.trackingEstDelivery) : null;
  const events: any[] = Array.isArray(box.trackingEvents) ? box.trackingEvents : [];
  const last = box.trackingLastEvent || events[0];

  return (
    <div className="mt-1.5 max-w-[320px]" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border transition-colors cursor-pointer ${tone.pill}`}
        title={last?.message ? `${last.message}${last.location ? ` — ${last.location}` : ''}` : 'Show scan history'}
      >
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${tone.dot} ${box.trackingStatus === 'out_for_delivery' ? 'animate-pulse' : ''}`} />
        <span>{box.trackingStatusLabel || 'Tracking'}</span>
        {est && <span className="font-semibold opacity-80">· Est. {est}</span>}
        {box.trackingMode === 'test' && <span className="font-semibold opacity-60">· TEST</span>}
        {events.length > 0 && <ChevronDown size={11} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />}
      </button>

      {last?.message && !open && (
        <p className="text-[10px] text-brand-secondary mt-1 truncate">
          {last.message}
          {last.location ? ` — ${last.location}` : ''}
          {last.datetime ? ` · ${formatEventTime(last.datetime)}` : ''}
        </p>
      )}

      {open && events.length > 0 && (
        <ol className="mt-2 ml-1 border-l border-brand-border pl-3 space-y-2 max-h-[220px] overflow-y-auto custom-scrollbar">
          {events.map((ev, i) => (
            <li key={`${ev.datetime}-${i}`} className="relative">
              <span className={`absolute -left-[17px] top-1 w-2 h-2 rounded-full border-2 border-white ${i === 0 ? tone.dot : 'bg-neutral-300'}`} />
              <p className={`text-[11px] leading-snug ${i === 0 ? 'font-bold text-brand-primary' : 'font-medium text-neutral-700'}`}>{ev.message || 'Update'}</p>
              <p className="text-[10px] text-brand-secondary">
                {[ev.location, formatEventTime(ev.datetime)].filter(Boolean).join(' · ')}
              </p>
            </li>
          ))}
          {box.trackingUpdatedAt && (
            <li className="text-[9px] uppercase tracking-wider text-neutral-400 font-bold flex items-center gap-1 pt-1">
              <Activity size={9} /> Last update {formatEventTime(box.trackingUpdatedAt)}
            </li>
          )}
        </ol>
      )}
    </div>
  );
}
