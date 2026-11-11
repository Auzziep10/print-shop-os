import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Timer,
  Tent,
  Building2,
  Mic2,
  CalendarCheck,
  CalendarClock,
  AlertTriangle,
  CheckCircle2,
  Settings as SettingsIcon,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  CLIENT_TYPES,
  GARMENT_LINES,
  PROJECT_SIZES,
  DEFAULT_TURNAROUND_CONFIG,
  addBusinessDays,
  businessDaysBetween,
  estimateTurnaround,
  formatDate,
  formatDayRange,
  loadTurnaroundConfig,
  parseDateInput,
  startOfDay,
  type ClientTypeId,
  type GarmentLineId,
  type ProjectSizeId,
  type TurnaroundConfig,
} from '../../lib/turnaround';

const TYPE_ICONS: Record<ClientTypeId, typeof Tent> = {
  festival: Tent,
  convention: Building2,
  artist: Mic2,
};

const CUSTOM = 'custom';

export function TurnaroundEstimator() {
  const { hasPermission } = useAuth();
  const [config, setConfig] = useState<TurnaroundConfig>(DEFAULT_TURNAROUND_CONFIG);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const [clientType, setClientType] = useState<ClientTypeId>('festival');
  const [size, setSize] = useState<ProjectSizeId>('medium');
  const [garmentLine, setGarmentLine] = useState<GarmentLineId>('wholesale');
  // null = follow the suggested quantity for the current type + size.
  const [qtyOverride, setQtyOverride] = useState<number | null>(null);
  const [customMode, setCustomMode] = useState(false);
  const [eventDate, setEventDate] = useState('');

  useEffect(() => {
    loadTurnaroundConfig()
      .then(setConfig)
      .catch(err => {
        console.error('Error loading turnaround matrix:', err);
        setLoadFailed(true);
      })
      .finally(() => setLoading(false));
  }, []);

  // High Fashion has a minimum order; quantities below it are raised to the minimum.
  const minQty = garmentLine === 'high-fashion' ? config.highFashionMinQty : 1;
  const suggestedQty = Math.max(config.cells[clientType][size].suggestedQty, minQty);
  const requestedQty = qtyOverride ?? suggestedQty;
  const qty = Math.max(requestedQty, minQty);

  const qtyChoices = useMemo(
    () =>
      Array.from(new Set([...config.qtyOptions, suggestedQty, ...(minQty > 1 ? [minQty] : [])]))
        .filter(choice => choice >= minQty)
        .sort((a, b) => a - b),
    [config.qtyOptions, suggestedQty, minQty]
  );

  const pick = (type: ClientTypeId, nextSize: ProjectSizeId) => {
    setClientType(type);
    setSize(nextSize);
    setQtyOverride(null);
    setCustomMode(false);
  };

  const estimate = useMemo(
    () => estimateTurnaround(config, clientType, qty, garmentLine),
    [config, clientType, qty, garmentLine]
  );
  const lineLabel = GARMENT_LINES.find(line => line.id === garmentLine)!.label;

  const today = startOfDay(new Date());
  const readyEarliest = addBusinessDays(today, estimate.min);
  const readyLatest = addBusinessDays(today, estimate.max);

  const event = parseDateInput(eventDate);
  const deadline = event
    ? (() => {
        const neededBy = addBusinessDays(event, -config.eventBufferDays);
        const orderBy = addBusinessDays(neededBy, -estimate.max);
        const bestCaseOrderBy = addBusinessDays(neededBy, -estimate.min);
        const slack = businessDaysBetween(today, orderBy);
        const status: 'ok' | 'tight' | 'missed' =
          slack >= 0 ? 'ok' : businessDaysBetween(today, bestCaseOrderBy) >= 0 ? 'tight' : 'missed';
        return { neededBy, orderBy, slack, status };
      })()
    : null;

  const typeLabel = CLIENT_TYPES.find(t => t.id === clientType)!.label;
  const sizeLabel = PROJECT_SIZES.find(s => s.id === size)!.label;

  const cardClass = 'bg-white border border-brand-border rounded-xl shadow-sm overflow-hidden';
  const cardHeadClass = 'px-5 py-3.5 border-b border-brand-border bg-neutral-50/50 flex items-center gap-2';
  const cardTitleClass = 'font-bold uppercase tracking-wider text-sm text-neutral-900';
  const stepLabelClass = 'text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-2';

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="pb-4 border-b border-brand-border flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Timer className="w-7 h-7 text-brand-primary" />
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-neutral-900 uppercase">
              Project <span className="text-neutral-500">Turnaround</span>
            </h1>
          </div>
          <p className="text-sm text-neutral-500 mt-1">
            Pick the client type and size to tell a client how long their project will take.
          </p>
        </div>
        {hasPermission('manageSettings') && (
          <Link
            to="/settings?tab=turnaround"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-neutral-600 hover:text-neutral-900 shrink-0"
          >
            <SettingsIcon className="w-3.5 h-3.5" />
            Edit turnaround times
          </Link>
        )}
      </div>

      {loadFailed && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>Could not load the saved turnaround times, so the built-in starting numbers are shown. Reload to try again.</span>
        </div>
      )}

      <div className={`grid grid-cols-1 lg:grid-cols-2 gap-6 ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
        {/* ---------------------------- Inputs ---------------------------- */}
        <div className={cardClass}>
          <div className={cardHeadClass}>
            <CalendarClock className="w-5 h-5 text-neutral-500" />
            <h2 className={cardTitleClass}>Project details</h2>
          </div>
          <div className="p-5 space-y-6">
            <div>
              <p className={stepLabelClass}>1. Client type</p>
              <div className="grid grid-cols-3 gap-2">
                {CLIENT_TYPES.map(type => {
                  const Icon = TYPE_ICONS[type.id];
                  const active = clientType === type.id;
                  return (
                    <button
                      key={type.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => pick(type.id, size)}
                      className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-4 text-sm font-bold transition-all ${
                        active
                          ? 'border-neutral-900 bg-neutral-900 text-white shadow-sm'
                          : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400'
                      }`}
                    >
                      <Icon className={`w-5 h-5 ${active ? 'text-neutral-300' : 'text-neutral-400'}`} />
                      {type.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className={stepLabelClass}>2. {typeLabel} size</p>
              <div className="grid grid-cols-3 gap-2">
                {PROJECT_SIZES.map(option => {
                  const active = size === option.id;
                  const hint = config.cells[clientType][option.id].hint;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => pick(clientType, option.id)}
                      className={`rounded-xl border px-2 py-3 text-center transition-all ${
                        active
                          ? 'border-neutral-900 bg-neutral-900 text-white shadow-sm'
                          : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400'
                      }`}
                    >
                      <span className="block text-sm font-bold">{option.label}</span>
                      {hint && (
                        <span className={`block text-[11px] mt-0.5 leading-tight ${active ? 'text-neutral-300' : 'text-neutral-500'}`}>
                          {hint}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className={stepLabelClass}>3. Garment type</p>
              <div className="grid grid-cols-2 gap-2">
                {GARMENT_LINES.map(line => {
                  const active = garmentLine === line.id;
                  const extra = line.id === 'high-fashion' ? config.highFashionExtraDays : 0;
                  return (
                    <button
                      key={line.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setGarmentLine(line.id)}
                      className={`rounded-xl border px-2 py-3 text-center transition-all ${
                        active
                          ? 'border-neutral-900 bg-neutral-900 text-white shadow-sm'
                          : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400'
                      }`}
                    >
                      <span className="block text-sm font-bold">{line.label}</span>
                      <span className={`block text-[11px] mt-0.5 leading-tight ${active ? 'text-neutral-300' : 'text-neutral-500'}`}>
                        {line.id === 'high-fashion'
                          ? `${extra}-day production · ${config.highFashionMinQty.toLocaleString()} unit minimum`
                          : line.hint}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label htmlFor="turnaround-qty" className={`${stepLabelClass} block`}>
                4. Garment quantity
              </label>
              <div className="flex gap-2">
                <select
                  id="turnaround-qty"
                  value={customMode ? CUSTOM : String(qty)}
                  onChange={e => {
                    if (e.target.value === CUSTOM) {
                      setCustomMode(true);
                      setQtyOverride(qty);
                    } else {
                      setCustomMode(false);
                      const next = Number(e.target.value);
                      setQtyOverride(next === suggestedQty ? null : next);
                    }
                  }}
                  className="flex-1 min-w-0 rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm font-semibold text-neutral-900 focus:outline-none focus:border-neutral-900"
                >
                  {qtyChoices.map(choice => (
                    <option key={choice} value={choice}>
                      {choice.toLocaleString()} garments{choice === suggestedQty ? ' (suggested)' : ''}
                    </option>
                  ))}
                  <option value={CUSTOM}>Custom quantity…</option>
                </select>
                {customMode && (
                  <input
                    type="number"
                    min={1}
                    aria-label="Custom garment quantity"
                    value={requestedQty}
                    onChange={e => setQtyOverride(Math.max(1, Math.round(Number(e.target.value) || 1)))}
                    className="w-28 rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm font-semibold text-neutral-900 focus:outline-none focus:border-neutral-900"
                  />
                )}
              </div>
              {minQty > 1 && (
                <p className="text-xs font-semibold text-neutral-700 mt-1.5">
                  High Fashion has a {minQty.toLocaleString()}-unit minimum.
                  {requestedQty < minQty && ` ${requestedQty.toLocaleString()} is below it, so ${minQty.toLocaleString()} is used.`}
                </p>
              )}
              <p className="text-xs text-neutral-500 mt-1.5">
                Suggested for a {sizeLabel.toLowerCase()} {typeLabel.toLowerCase()}: {suggestedQty.toLocaleString()} garments.
                {qty !== suggestedQty && (
                  <button
                    type="button"
                    onClick={() => {
                      setQtyOverride(null);
                      setCustomMode(false);
                    }}
                    className="ml-1.5 font-bold text-neutral-700 underline hover:text-neutral-900"
                  >
                    Reset
                  </button>
                )}
              </p>
            </div>

            <div>
              <label htmlFor="turnaround-event" className={`${stepLabelClass} block`}>
                Event or release date <span className="font-medium normal-case tracking-normal">(optional)</span>
              </label>
              <input
                id="turnaround-event"
                type="date"
                value={eventDate}
                onChange={e => setEventDate(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm font-semibold text-neutral-900 focus:outline-none focus:border-neutral-900"
              />
              <p className="text-xs text-neutral-500 mt-1.5">Add a date to see the latest day the client can place the order.</p>
            </div>
          </div>
        </div>

        {/* ---------------------------- Result ---------------------------- */}
        <div className={`${cardClass} flex flex-col`}>
          <div className={cardHeadClass}>
            <CalendarCheck className="w-5 h-5 text-neutral-500" />
            <h2 className={cardTitleClass}>Turnaround</h2>
          </div>
          <div className="p-5 space-y-5 flex-1">
            <div className="rounded-xl bg-neutral-900 text-white p-5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                {sizeLabel} {typeLabel} · {qty.toLocaleString()} {lineLabel} garments
              </p>
              <p className="mt-1 text-5xl font-black tracking-tight tabular-nums">
                {formatDayRange(estimate.min, estimate.max)}
                <span className="ml-2 text-base font-bold text-neutral-300">business days</span>
              </p>
              <p className="mt-3 text-sm text-neutral-300">
                Ordered today, ready between{' '}
                <span className="font-bold text-white">{formatDate(readyEarliest)}</span> and{' '}
                <span className="font-bold text-white">{formatDate(readyLatest)}</span>.
              </p>
            </div>

            {deadline && (
              <div
                className={`rounded-xl border p-4 text-sm ${
                  deadline.status === 'ok'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                    : deadline.status === 'tight'
                      ? 'border-amber-200 bg-amber-50 text-amber-900'
                      : 'border-red-200 bg-red-50 text-red-900'
                }`}
              >
                <div className="flex items-start gap-2">
                  {deadline.status === 'ok' ? (
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  )}
                  <div>
                    {deadline.status === 'ok' && (
                      <>
                        <p className="font-bold">Order by {formatDate(deadline.orderBy)}</p>
                        <p className="mt-0.5">
                          {deadline.slack === 0
                            ? 'That is today. The order needs to be placed now to make the event.'
                            : `That leaves ${deadline.slack} business day${deadline.slack === 1 ? '' : 's'} to close the order.`}
                        </p>
                      </>
                    )}
                    {deadline.status === 'tight' && (
                      <>
                        <p className="font-bold">Tight: only works at the fast end of the range</p>
                        <p className="mt-0.5">
                          The safe order-by date was {formatDate(deadline.orderBy)}. Check with production before promising this date.
                        </p>
                      </>
                    )}
                    {deadline.status === 'missed' && (
                      <>
                        <p className="font-bold">Standard turnaround will not make this date</p>
                        <p className="mt-0.5">
                          The order needed to be placed by {formatDate(deadline.orderBy)}. Reduce the quantity or check with production.
                        </p>
                      </>
                    )}
                    <p className="mt-1.5 text-xs opacity-80">
                      Goods finished by {formatDate(deadline.neededBy)}, {config.eventBufferDays} business day
                      {config.eventBufferDays === 1 ? '' : 's'} before the event for shipping.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div>
              <p className={stepLabelClass}>How the time breaks down</p>
              <ul className="divide-y divide-neutral-100 border border-neutral-200 rounded-xl overflow-hidden">
                {estimate.steps.map((step, index) => (
                  <li key={index} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <span className="text-neutral-700">{step.label}</span>
                    <span className="font-bold text-neutral-900 tabular-nums shrink-0">
                      {formatDayRange(step.min, step.max)} days
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-neutral-500 mt-2">
                Business days, Monday to Friday. Holidays and shipping transit are not included.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ---------------------------- Matrix ---------------------------- */}
      <div className={cardClass}>
        <div className={cardHeadClass}>
          <Timer className="w-5 h-5 text-neutral-500" />
          <h2 className={cardTitleClass}>Turnaround matrix</h2>
          <span className="ml-auto text-xs text-neutral-500 hidden sm:inline">{lineLabel} garments at the suggested quantity. Click a cell to load it.</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                <th className="px-5 py-3 font-bold">Client type</th>
                {PROJECT_SIZES.map(option => (
                  <th key={option.id} className="px-3 py-3 font-bold">{option.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CLIENT_TYPES.map(type => (
                <tr key={type.id} className="border-t border-neutral-100">
                  <th scope="row" className="px-5 py-3 text-left font-bold text-neutral-900 whitespace-nowrap">{type.label}</th>
                  {PROJECT_SIZES.map(option => {
                    const cellQty = Math.max(config.cells[type.id][option.id].suggestedQty, minQty);
                    const cellEstimate = estimateTurnaround(config, type.id, cellQty, garmentLine);
                    const active = clientType === type.id && size === option.id;
                    return (
                      <td key={option.id} className="px-1.5 py-1.5">
                        <button
                          type="button"
                          onClick={() => pick(type.id, option.id)}
                          className={`w-full min-w-[9rem] text-left rounded-lg px-3 py-2 transition-colors ${
                            active ? 'bg-neutral-100 ring-1 ring-neutral-300' : 'hover:bg-neutral-50'
                          }`}
                        >
                          <span className="block font-black text-neutral-900 tabular-nums">
                            {formatDayRange(cellEstimate.min, cellEstimate.max)} days
                          </span>
                          <span className="block text-xs text-neutral-500">{cellQty.toLocaleString()} garments</span>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
