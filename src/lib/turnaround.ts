import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

/* ------------------------------------------------------------------ */
/* Turnaround matrix: client type x project size -> suggested quantity */
/* and a business-day estimate. Numbers are edited in                  */
/* Settings -> Turnaround Matrix and stored at settings/turnaround_matrix. */
/* ------------------------------------------------------------------ */

export const CLIENT_TYPES = [
  { id: 'festival', label: 'Festival' },
  { id: 'convention', label: 'Convention' },
  { id: 'artist', label: 'Artist' },
] as const;

export const PROJECT_SIZES = [
  { id: 'small', label: 'Small' },
  { id: 'medium', label: 'Medium' },
  { id: 'large', label: 'Large' },
] as const;

export const GARMENT_LINES = [
  { id: 'wholesale', label: 'Wholesale', hint: 'Stock blank garments' },
  { id: 'high-fashion', label: 'High Fashion', hint: 'Custom-made garments' },
] as const;

export type GarmentLineId = (typeof GARMENT_LINES)[number]['id'];
export type ClientTypeId = (typeof CLIENT_TYPES)[number]['id'];
export type ProjectSizeId = (typeof PROJECT_SIZES)[number]['id'];

export interface DayRange {
  min: number;
  max: number;
}

export interface TurnaroundCell {
  /** Garment quantity pre-selected for this client type + size. */
  suggestedQty: number;
  /** Short description that tells the rep what counts as this size. */
  hint: string;
}

export interface TurnaroundStage {
  id: string;
  label: string;
  /** Business days this step takes, per client type. */
  days: Record<ClientTypeId, DayRange>;
}

export interface ProductionTier {
  id: string;
  /** Tier applies to quantities up to and including this. null = no upper limit. */
  upTo: number | null;
  min: number;
  max: number;
}

export interface TurnaroundConfig {
  cells: Record<ClientTypeId, Record<ProjectSizeId, TurnaroundCell>>;
  /** Quantities offered in the estimator dropdown. */
  qtyOptions: number[];
  /** Steps that happen before production starts. */
  stages: TurnaroundStage[];
  /** Production time by garment quantity. */
  productionTiers: ProductionTier[];
  /** Business days the order should be finished before the client's event (shipping + safety). */
  eventBufferDays: number;
  /** Business days of production for High Fashion garments. Replaces the quantity-based production time. */
  highFashionExtraDays: number;
  /** Business days of QC / fulfillment after High Fashion production. */
  highFashionQcDays: number;
  /** Smallest order accepted for High Fashion garments. */
  highFashionMinQty: number;
  updatedAt?: string;
}

const sameForAll = (min: number, max: number): Record<ClientTypeId, DayRange> => ({
  festival: { min, max },
  convention: { min, max },
  artist: { min, max },
});

/** Starting numbers only. The real values are set in Settings -> Turnaround Matrix. */
export const DEFAULT_TURNAROUND_CONFIG: TurnaroundConfig = {
  cells: {
    festival: {
      small: { suggestedQty: 250, hint: 'Up to 2,500 attendees' },
      medium: { suggestedQty: 1000, hint: '2,500 - 10,000 attendees' },
      large: { suggestedQty: 3000, hint: '10,000+ attendees' },
    },
    convention: {
      small: { suggestedQty: 144, hint: 'Up to 1,000 attendees' },
      medium: { suggestedQty: 500, hint: '1,000 - 5,000 attendees' },
      large: { suggestedQty: 1500, hint: '5,000+ attendees' },
    },
    artist: {
      small: { suggestedQty: 72, hint: 'Emerging artist or first drop' },
      medium: { suggestedQty: 250, hint: 'Established following' },
      large: { suggestedQty: 750, hint: 'Major release or tour' },
    },
  },
  qtyOptions: [48, 72, 144, 250, 500, 750, 1000, 1500, 2500, 3000, 5000],
  stages: [
    {
      id: 'art',
      label: 'Art & mockups',
      days: { festival: { min: 2, max: 3 }, convention: { min: 2, max: 3 }, artist: { min: 3, max: 5 } },
    },
    {
      id: 'proof',
      label: 'Proof approval',
      days: { festival: { min: 1, max: 2 }, convention: { min: 1, max: 2 }, artist: { min: 2, max: 3 } },
    },
    { id: 'blanks', label: 'Material sourcing', days: sameForAll(2, 4) },
  ],
  productionTiers: [
    { id: 't1', upTo: 144, min: 3, max: 5 },
    { id: 't2', upTo: 500, min: 5, max: 7 },
    { id: 't3', upTo: 1500, min: 7, max: 10 },
    { id: 't4', upTo: 3000, min: 10, max: 14 },
    { id: 't5', upTo: null, min: 14, max: 20 },
  ],
  eventBufferDays: 3,
  highFashionExtraDays: 60,
  highFashionQcDays: 3,
  highFashionMinQty: 200,
};

/* ------------------------------------------------------------------ */
/* Normalising saved data                                              */
/* ------------------------------------------------------------------ */

const toDays = (value: unknown, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback;
};

const toRange = (value: any, fallback: DayRange): DayRange => {
  const min = toDays(value?.min, fallback.min);
  const max = Math.max(min, toDays(value?.max, fallback.max));
  return { min, max };
};

/** Fills anything missing or malformed in a saved config with the defaults. */
export function normalizeTurnaroundConfig(raw: any): TurnaroundConfig {
  const base = DEFAULT_TURNAROUND_CONFIG;
  if (!raw || typeof raw !== 'object') return structuredClone(base);

  const cells = {} as TurnaroundConfig['cells'];
  CLIENT_TYPES.forEach(({ id: type }) => {
    cells[type] = {} as Record<ProjectSizeId, TurnaroundCell>;
    PROJECT_SIZES.forEach(({ id: size }) => {
      const saved = raw.cells?.[type]?.[size];
      const fallback = base.cells[type][size];
      const qty = Number(saved?.suggestedQty);
      cells[type][size] = {
        suggestedQty: Number.isFinite(qty) && qty > 0 ? Math.round(qty) : fallback.suggestedQty,
        hint: typeof saved?.hint === 'string' ? saved.hint : fallback.hint,
      };
    });
  });

  const qtyOptions = Array.isArray(raw.qtyOptions)
    ? Array.from(
        new Set<number>(
          raw.qtyOptions.map((q: unknown) => Math.round(Number(q))).filter((q: number) => Number.isFinite(q) && q > 0)
        )
      ).sort((a, b) => a - b)
    : [...base.qtyOptions];

  const stages: TurnaroundStage[] = Array.isArray(raw.stages)
    ? raw.stages.map((stage: any, index: number) => ({
        id: String(stage?.id || `stage-${index}`),
        label: String(stage?.label ?? ''),
        days: {
          festival: toRange(stage?.days?.festival, { min: 0, max: 0 }),
          convention: toRange(stage?.days?.convention, { min: 0, max: 0 }),
          artist: toRange(stage?.days?.artist, { min: 0, max: 0 }),
        },
      }))
    : structuredClone(base.stages);

  let productionTiers: ProductionTier[] = Array.isArray(raw.productionTiers)
    ? raw.productionTiers.map((tier: any, index: number) => {
        const upTo = Number(tier?.upTo);
        return {
          id: String(tier?.id || `tier-${index}`),
          upTo: tier?.upTo === null || !Number.isFinite(upTo) || upTo <= 0 ? null : Math.round(upTo),
          ...toRange(tier, { min: 0, max: 0 }),
        };
      })
    : structuredClone(base.productionTiers);
  if (productionTiers.length === 0) productionTiers = structuredClone(base.productionTiers);

  return {
    cells,
    qtyOptions: qtyOptions.length > 0 ? qtyOptions : [...base.qtyOptions],
    stages,
    productionTiers: sortTiers(productionTiers),
    eventBufferDays: toDays(raw.eventBufferDays, base.eventBufferDays),
    highFashionExtraDays: toDays(raw.highFashionExtraDays, base.highFashionExtraDays),
    highFashionQcDays: toDays(raw.highFashionQcDays, base.highFashionQcDays),
    highFashionMinQty: Math.max(1, toDays(raw.highFashionMinQty, base.highFashionMinQty)),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
  };
}

/** Smallest limit first; the "no upper limit" tier always last. */
export function sortTiers(tiers: ProductionTier[]): ProductionTier[] {
  return [...tiers].sort((a, b) => (a.upTo ?? Infinity) - (b.upTo ?? Infinity));
}

const SETTINGS_DOC = ['settings', 'turnaround_matrix'] as const;

export async function loadTurnaroundConfig(): Promise<TurnaroundConfig> {
  const snap = await getDoc(doc(db, ...SETTINGS_DOC));
  return normalizeTurnaroundConfig(snap.exists() ? snap.data() : null);
}

export async function saveTurnaroundConfig(config: TurnaroundConfig): Promise<void> {
  const clean = normalizeTurnaroundConfig(config);
  await setDoc(doc(db, ...SETTINGS_DOC), { ...clean, updatedAt: new Date().toISOString() });
}

/* ------------------------------------------------------------------ */
/* Estimate math                                                       */
/* ------------------------------------------------------------------ */

export interface TurnaroundEstimate {
  steps: { label: string; min: number; max: number }[];
  min: number;
  max: number;
}

export function findProductionTier(config: TurnaroundConfig, qty: number): ProductionTier {
  const tiers = sortTiers(config.productionTiers);
  return tiers.find(tier => tier.upTo === null || qty <= tier.upTo) ?? tiers[tiers.length - 1];
}

export function describeTier(config: TurnaroundConfig, tier: ProductionTier): string {
  const tiers = sortTiers(config.productionTiers);
  const index = tiers.findIndex(t => t.id === tier.id);
  const previous = index > 0 ? tiers[index - 1].upTo : null;
  const from = previous === null ? 1 : previous + 1;
  if (tier.upTo === null) return `${from.toLocaleString()}+ pcs`;
  return `${from.toLocaleString()} - ${tier.upTo.toLocaleString()} pcs`;
}

export function estimateTurnaround(
  config: TurnaroundConfig,
  clientType: ClientTypeId,
  qty: number,
  garmentLine: GarmentLineId = 'wholesale'
): TurnaroundEstimate {
  const steps = config.stages
    .filter(stage => stage.label.trim())
    .map(stage => ({ label: stage.label, ...stage.days[clientType] }));
  const tier = findProductionTier(config, qty);
  if (garmentLine === 'high-fashion') {
    // High Fashion garments are made to order: this replaces the normal quantity-based production.
    steps.push({
      label: 'High Fashion production',
      min: config.highFashionExtraDays,
      max: config.highFashionExtraDays,
    });
    if (config.highFashionQcDays > 0) {
      steps.push({ label: 'QC / Fulfillment', min: config.highFashionQcDays, max: config.highFashionQcDays });
    }
  } else {
    steps.push({ label: `Production (${describeTier(config, tier)})`, min: tier.min, max: tier.max });
  }
  return {
    steps,
    min: steps.reduce((sum, step) => sum + step.min, 0),
    max: steps.reduce((sum, step) => sum + step.max, 0),
  };
}

export const formatDayRange = (min: number, max: number) => (min === max ? `${min}` : `${min}-${max}`);

/* ------------------------------------------------------------------ */
/* Business-day calendar helpers (Mon-Fri, holidays not accounted for)  */
/* ------------------------------------------------------------------ */

const isWeekend = (date: Date) => date.getDay() === 0 || date.getDay() === 6;

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Moves forward (positive) or backward (negative) by whole business days. */
export function addBusinessDays(from: Date, days: number): Date {
  const result = startOfDay(from);
  const step = days < 0 ? -1 : 1;
  let remaining = Math.abs(Math.round(days));
  while (remaining > 0) {
    result.setDate(result.getDate() + step);
    if (!isWeekend(result)) remaining -= 1;
  }
  return result;
}

/** Business days from `from` (exclusive) to `to` (inclusive). Negative when `to` is earlier. */
export function businessDaysBetween(from: Date, to: Date): number {
  const start = startOfDay(from);
  const end = startOfDay(to);
  if (start.getTime() === end.getTime()) return 0;
  const step = end > start ? 1 : -1;
  const cursor = new Date(start);
  let count = 0;
  while (cursor.getTime() !== end.getTime()) {
    cursor.setDate(cursor.getDate() + step);
    if (!isWeekend(cursor)) count += step;
  }
  return count;
}

/** Parses the value of an <input type="date"> as a local date. */
export function parseDateInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

export const formatDate = (date: Date) =>
  date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
