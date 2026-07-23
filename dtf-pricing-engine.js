/**
 * DTF Pricing Engine
 * ------------------
 * Pure pricing logic for DTF (direct-to-film) apparel decoration.
 * No DOM, no framework, no I/O, no dependencies. Deterministic.
 *
 * Works as an ES module, CommonJS, or a browser global (see export block at end).
 *
 * THE MODEL IN ONE PARAGRAPH
 * Prices are decoration-only by default: the blank garment is NOT included
 * unless a blankCost is passed in. Cost is built from three parts: a
 * per-garment handling/overhead charge (charged ONCE no matter how many
 * placements), the most expensive placement at full press labor, and every
 * additional placement at marginal labor (the garment is already staged).
 * Price is NOT cost x markup. Instead a linear PRICE LADDER for a reference
 * product (full-front tee) is the input: it steps evenly from the 1-24 anchor
 * to the 500+ anchor. Whatever margin that ladder implies at each tier is then
 * applied to every other product. A margin floor prevents the ladder from
 * pricing below a set profitability.
 *
 * WHY IT'S BUILT THIS WAY (do not "simplify" these away):
 *  - Marginal extra placements: charging full freight per placement priced
 *    multi-placement jobs ~2x above observed market rates.
 *  - Ladder-drives-margin (not the reverse): cost per piece falls with volume
 *    but market prices stay flat, so a fixed margin gives away the entire
 *    volume saving. Margin therefore RISES with quantity as a consequence.
 *  - Handling charged once: four placements should cost less than four
 *    single-placement jobs.
 */

// ---------------------------------------------------------------------------
// Constants — quantity tiers
// ---------------------------------------------------------------------------

/** Tier labels, index 0..5. */
const TIERS = ["1–24", "25–49", "50–99", "100–249", "250–499", "500+"];

/** Lower bound (inclusive) of each tier. Used for tier lookup. */
const TIER_MIN = [1, 25, 50, 100, 250, 500];

/**
 * Cost multipliers by tier.
 * Labor/overhead falls faster with volume than materials do, so they use
 * separate curves. Index matches TIERS.
 */
const LABOR_MULT = [1.35, 1.15, 1.00, 0.88, 0.79, 0.72];
const MATERIAL_MULT = [1.10, 1.05, 1.00, 0.96, 0.92, 0.88];

// ---------------------------------------------------------------------------
// Default configuration — OWNER-TUNABLE. These are benchmark starting values.
// ---------------------------------------------------------------------------

/**
 * Cost inputs. All values are USD per unit described.
 * These are the numbers the shop owner edits; everything else derives from them.
 */
const DEFAULT_COSTS = {
  /** Fully burdened hourly wage for the press operator. */
  laborRate: 18,
  /** Sustained garments pressed per hour, including staging. Must be > 0. */
  pressPerHour: 40,
  /** Handling + overhead per garment: receiving, folding, packing, utilities, rent. */
  overheadPerGarment: 0.75,
  /** Loaded transfer cost: full front or full back, up to 11x14. */
  transferLarge: 0.95,
  /** Loaded transfer cost: left chest or sleeve, ~4in. */
  transferSmall: 0.40,
  /** Loaded transfer cost: neck tag print, ~2x3. */
  transferTag: 0.45,
  /** Loaded cost of a cap patch including print and cure. */
  transferPatch: 1.20,
  /** Extra labor to tear out a maker's tag before relabeling. */
  tagTearOut: 0.50,
  /**
   * Share of full press labor that an ADDITIONAL placement costs, 0..1.
   * 0.55 = an added placement costs 55% of the labor the first one did,
   * because the garment is already staged and the order overhead is paid.
   */
  extraPlacementLaborFactor: 0.55,
};

/**
 * Price ladder + guardrail. This is what actually sets prices.
 */
const DEFAULT_LADDER = {
  /** Price of the reference product (full-front tee) at the 1-24 tier. */
  priceAtLowTier: 4.75,
  /** Price of the reference product at the 500+ tier. */
  priceAtHighTier: 4.00,
  /** Minimum acceptable margin, 0..1. Tiers below this are held AT this. */
  marginFloor: 0.35,
  /** Hard ceiling on margin, 0..1. Safety valve against absurd inputs. */
  marginCeiling: 0.85,
};

/** The product whose ladder defines the margin curve for everything else. */
const REFERENCE_PRODUCT = { garmentId: "tee", placementIds: ["ff"] };

// ---------------------------------------------------------------------------
// Catalogs
// ---------------------------------------------------------------------------

/**
 * Garments. `handlingMultiplier` scales overheadPerGarment — heavier or
 * fiddlier garments take longer to handle, position, and press. It has nothing
 * to do with what the blank costs (the blank is not included in pricing).
 * `allows` lists which placement ids are valid for that garment.
 */
const GARMENTS = [
  { id: "tee",    label: "T-shirt",             handlingMultiplier: 1.00, allows: ["ff","fb","lc","sl","sr","tag","sb"] },
  { id: "hoodie", label: "Hoodie",              handlingMultiplier: 1.55, allows: ["ff","fb","lc","sl","sr","tag","sb"] },
  { id: "crew",   label: "Crewneck sweatshirt", handlingMultiplier: 1.40, allows: ["ff","fb","lc","sl","sr","tag","sb"] },
  { id: "ls",     label: "Long-sleeve tee",     handlingMultiplier: 1.18, allows: ["ff","fb","lc","sl","sr","tag","sb"] },
  { id: "youth",  label: "Youth tee",           handlingMultiplier: 0.90, allows: ["ff","fb","lc","sl","sr","tag","sb"] },
  { id: "tote",   label: "Tote bag",            handlingMultiplier: 0.82, allows: ["ff","fb"] },
  { id: "hat",    label: "Hat / cap",           handlingMultiplier: 1.05, allows: ["patch"] },
];

/**
 * Placements. `costKey` points at the transfer cost in the cost config.
 * `addsTearOut` marks the neck tag relabel, which includes removing the
 * manufacturer's tag before printing yours in its place.
 */
const PLACEMENTS = [
  { id: "ff",    label: "Full front (11×14)",         costKey: "transferLarge" },
  { id: "fb",    label: "Full back (11×14)",          costKey: "transferLarge" },
  { id: "lc",    label: "Left chest (≈4\")",          costKey: "transferSmall" },
  { id: "sb",    label: "Small back (≈4\")",          costKey: "transferSmall" },
  { id: "sl",    label: "Left sleeve",                costKey: "transferSmall" },
  { id: "sr",    label: "Right sleeve",               costKey: "transferSmall" },
  { id: "tag",   label: "Neck tag relabel (tag removed)", costKey: "transferTag", addsTearOut: true },
  { id: "patch", label: "Cap front patch",            costKey: "transferPatch" },
];

/**
 * Transfer-only products (film shipped ready to press; no garment, no press
 * labor). `baseCost` is the loaded cost at the 50-99 tier.
 */
const TRANSFER_PRODUCTS = [
  { id: "t2x2",   label: "2×2 (small logo)",   baseCost: 0.52 },
  { id: "ttag",   label: "Neck tag (2×3)",     baseCost: 0.60 },
  { id: "t3x3",   label: "3×3 (left chest)",   baseCost: 0.68 },
  { id: "t5x5",   label: "5×5 (medium)",       baseCost: 1.13 },
  { id: "t8x10",  label: "8×10 (large)",       baseCost: 1.94 },
  { id: "t11x11", label: "11×11 (full front)", baseCost: 2.53 },
  { id: "gang",   label: "Gang sheet 22×24",   baseCost: 7.50, isGangSheet: true },
];

/**
 * Published competitor rates for the same service on customer-supplied
 * garments, keyed by sorted placement ids joined with commas. Flat rates —
 * that shop does not tier by quantity.
 *
 * SOURCE: one US shop's public price list, captured 2026. This is a reference
 * point, NOT a national average. Regional pricing varies. Treat as advisory.
 */
const MARKET_RATES = {
  "lc": 3.50,
  "ff": 5.00,
  "fb": 5.00,
  "fb,lc": 5.50,
  "fb,ff": 6.50,
  "fb,lc,sl": 7.00,
  "fb,ff,sl": 8.00,
};

/** National gang sheet reference range for a 22×24 sheet, USD. */
const MARKET_GANG_SHEET = { low: 10, high: 20 };

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

function findGarment(garmentId) {
  return GARMENTS.find(g => g.id === garmentId) || null;
}

function findPlacement(placementId) {
  return PLACEMENTS.find(p => p.id === placementId) || null;
}

/**
 * Map a piece count to a tier index 0..5.
 * @param {number} quantity
 * @returns {number} 0..5
 */
function tierIndexFor(quantity) {
  const q = Number(quantity);
  if (!Number.isFinite(q) || q < 1) return 0;
  if (q < 25) return 0;
  if (q < 50) return 1;
  if (q < 100) return 2;
  if (q < 250) return 3;
  if (q < 500) return 4;
  return 5;
}

/** Look up the competitor rate for a placement set, or null if unknown. */
function marketRateFor(placementIds) {
  const key = [...placementIds].sort().join(",");
  return Object.prototype.hasOwnProperty.call(MARKET_RATES, key) ? MARKET_RATES[key] : null;
}

// ---------------------------------------------------------------------------
// Cost model
// ---------------------------------------------------------------------------

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * Press labor for one full pressing cycle, before tier scaling.
 * @returns {number} USD
 */
function pressLaborPerCycle(costs) {
  const rate = num(costs.laborRate);
  const pph = num(costs.pressPerHour);
  return pph > 0 ? rate / pph : 0;
}

/**
 * Cost of a single placement at a given tier.
 * @param {string} placementId
 * @param {number} tierIndex 0..5
 * @param {boolean} isFirst true for the priciest placement on the garment
 * @param {object} costs cost config
 * @returns {number} USD
 */
function placementCost(placementId, tierIndex, isFirst, costs) {
  const p = findPlacement(placementId);
  if (!p) return 0;
  const t = clampTier(tierIndex);
  const material = num(costs[p.costKey]) * MATERIAL_MULT[t];
  const laborFactor = isFirst ? 1 : num(costs.extraPlacementLaborFactor);
  const labor = pressLaborPerCycle(costs) * laborFactor * LABOR_MULT[t];
  const tearOut = p.addsTearOut ? num(costs.tagTearOut) * LABOR_MULT[t] : 0;
  return material + labor + tearOut;
}

/**
 * Handling + overhead for one garment at a tier. Charged ONCE per garment,
 * regardless of how many placements it receives.
 */
function handlingCost(garmentId, tierIndex, costs) {
  const g = findGarment(garmentId);
  if (!g) return 0;
  return num(costs.overheadPerGarment) * g.handlingMultiplier * LABOR_MULT[clampTier(tierIndex)];
}

function clampTier(i) {
  const t = Math.trunc(Number(i));
  if (!Number.isFinite(t) || t < 0) return 0;
  return t > 5 ? 5 : t;
}

/**
 * Total decoration cost for a garment + placement set at a tier.
 * Handling once, priciest placement at full labor, the rest marginal.
 * Does NOT include the blank garment.
 * @returns {number} USD per piece
 */
function decorationCost(garmentId, placementIds, tierIndex, costs = DEFAULT_COSTS) {
  if (!placementIds || placementIds.length === 0) return 0;
  const t = clampTier(tierIndex);
  const g = findGarment(garmentId);
  if (!g) return 0;
  const valid = placementIds.filter(id => g.allows.includes(id));
  if (valid.length === 0) return 0;

  // Rank by standalone cost so the most expensive placement carries full labor.
  const ranked = [...valid].sort(
    (a, b) => placementCost(b, t, true, costs) - placementCost(a, t, true, costs)
  );
  let total = handlingCost(garmentId, t, costs);
  ranked.forEach((id, idx) => {
    total += placementCost(id, t, idx === 0, costs);
  });
  return total;
}

/**
 * Itemized cost lines for a quote — used to render a breakdown.
 * Order: handling, then placements ranked priciest-first.
 * @returns {Array<{id:string,label:string,amount:number,isMarginal:boolean}>}
 */
function costBreakdown(garmentId, placementIds, tierIndex, costs = DEFAULT_COSTS) {
  const t = clampTier(tierIndex);
  const g = findGarment(garmentId);
  if (!g) return [];
  const valid = (placementIds || []).filter(id => g.allows.includes(id));
  if (valid.length === 0) return [];

  const lines = [{
    id: "handling",
    label: "Handling & overhead",
    amount: handlingCost(garmentId, t, costs),
    isMarginal: false,
  }];
  const ranked = [...valid].sort(
    (a, b) => placementCost(b, t, true, costs) - placementCost(a, t, true, costs)
  );
  ranked.forEach((id, idx) => {
    lines.push({
      id,
      label: findPlacement(id).label,
      amount: placementCost(id, t, idx === 0, costs),
      isMarginal: idx !== 0,
    });
  });
  return lines;
}

// ---------------------------------------------------------------------------
// Price ladder -> margin curve
// ---------------------------------------------------------------------------

/**
 * The reference product's price at a tier. Linear from the low anchor to the
 * high anchor across the six tiers.
 * @returns {number} USD
 */
function referencePrice(tierIndex, ladder = DEFAULT_LADDER) {
  const lo = num(ladder.priceAtLowTier);
  const hi = num(ladder.priceAtHighTier);
  return lo + (hi - lo) * (clampTier(tierIndex) / 5);
}

/**
 * Margin the ladder implies at a tier, BEFORE the floor is applied.
 * Can be negative if the anchors are set below cost.
 * @returns {number} 0..1 (may be negative)
 */
function rawMargin(tierIndex, costs = DEFAULT_COSTS, ladder = DEFAULT_LADDER) {
  const t = clampTier(tierIndex);
  const price = referencePrice(t, ladder);
  if (!(price > 0)) return 0;
  const cost = decorationCost(REFERENCE_PRODUCT.garmentId, REFERENCE_PRODUCT.placementIds, t, costs);
  const m = 1 - cost / price;
  return Number.isFinite(m) ? m : 0;
}

/** True when the ladder would price this tier below the margin floor. */
function isBelowFloor(tierIndex, costs = DEFAULT_COSTS, ladder = DEFAULT_LADDER) {
  return rawMargin(tierIndex, costs, ladder) < num(ladder.marginFloor);
}

/**
 * Margin actually applied at a tier: the raw margin clamped to
 * [marginFloor, marginCeiling]. This margin prices EVERY product.
 * @returns {number} 0..1
 */
function effectiveMargin(tierIndex, costs = DEFAULT_COSTS, ladder = DEFAULT_LADDER) {
  const floor = num(ladder.marginFloor);
  const ceiling = num(ladder.marginCeiling, 0.85);
  let m = rawMargin(tierIndex, costs, ladder);
  if (m < floor) m = floor;
  if (m > ceiling) m = ceiling;
  return m;
}

/**
 * Turn a cost into a price at a tier.
 * @returns {number} USD, 0 if inputs are degenerate
 */
function priceFromCost(cost, tierIndex, costs = DEFAULT_COSTS, ladder = DEFAULT_LADDER) {
  const m = effectiveMargin(tierIndex, costs, ladder);
  const p = num(cost) / (1 - m);
  return Number.isFinite(p) ? p : 0;
}

// ---------------------------------------------------------------------------
// Public API — this is what an app should call
// ---------------------------------------------------------------------------

/**
 * Price a job.
 *
 * @param {object} input
 * @param {string} input.garmentId          e.g. "tee" — see GARMENTS
 * @param {string[]} input.placementIds     e.g. ["ff","fb"] — see PLACEMENTS
 * @param {number} input.quantity           piece count, >= 1
 * @param {number} [input.blankCost=0]      per-piece garment cost; 0 = decoration only
 * @param {object} [input.costs]            overrides DEFAULT_COSTS
 * @param {object} [input.ladder]           overrides DEFAULT_LADDER
 *
 * @returns {{
 *   ok: boolean, error: (string|null),
 *   tierIndex: number, tierLabel: string,
 *   garment: object, placements: object[],
 *   decorationCost: number, blankCost: number, totalCost: number,
 *   margin: number, marginBelowFloor: boolean,
 *   pricePerPiece: number, orderTotal: number,
 *   marginPerPiece: number, marginTotal: number,
 *   breakdown: Array<{id,label,amount,percentOfPrice,isMarginal}>,
 *   marketRate: (number|null), marketDelta: (number|null), marginAtMarket: (number|null)
 * }}
 */
function quote(input) {
  const {
    garmentId,
    placementIds,
    quantity,
    blankCost = 0,
    costs = DEFAULT_COSTS,
    ladder = DEFAULT_LADDER,
  } = input || {};

  const g = findGarment(garmentId);
  if (!g) return failure(`Unknown garmentId: ${garmentId}`);

  const qty = Math.max(1, Math.trunc(num(quantity, 1)) || 1);
  const requested = Array.isArray(placementIds) ? placementIds : [];
  const valid = requested.filter(id => g.allows.includes(id));
  if (valid.length === 0) {
    return failure(
      requested.length === 0
        ? "No placements selected."
        : `None of the requested placements are valid for ${g.label}.`
    );
  }

  const t = tierIndexFor(qty);
  const deco = decorationCost(garmentId, valid, t, costs);
  const blank = num(blankCost);
  const totalCost = deco + blank;

  const margin = effectiveMargin(t, costs, ladder);
  const pricePerPiece = priceFromCost(totalCost, t, costs, ladder);
  const marginPerPiece = pricePerPiece - totalCost;

  // Breakdown: blank first (if present), then handling, then placements, then margin.
  const lines = [];
  if (blank > 0) lines.push({ id: "blank", label: "Garment", amount: blank, isMarginal: false });
  lines.push(...costBreakdown(garmentId, valid, t, costs));
  lines.push({ id: "margin", label: "Margin", amount: marginPerPiece, isMarginal: false });
  const breakdown = lines.map(l => ({
    ...l,
    percentOfPrice: pricePerPiece > 0 ? (l.amount / pricePerPiece) * 100 : 0,
  }));

  const marketRate = marketRateFor(valid);
  // Market rates are decoration-only, so they only compare when no blank is included.
  const comparable = marketRate !== null && blank === 0;

  return {
    ok: true,
    error: null,
    tierIndex: t,
    tierLabel: TIERS[t],
    garment: { id: g.id, label: g.label },
    placements: valid.map(id => ({ id, label: findPlacement(id).label })),
    decorationCost: deco,
    blankCost: blank,
    totalCost,
    margin,
    marginBelowFloor: isBelowFloor(t, costs, ladder),
    pricePerPiece,
    orderTotal: pricePerPiece * qty,
    marginPerPiece,
    marginTotal: marginPerPiece * qty,
    quantity: qty,
    breakdown,
    marketRate: comparable ? marketRate : null,
    marketDelta: comparable ? pricePerPiece - marketRate : null,
    marginAtMarket: comparable && marketRate > 0 ? (marketRate - totalCost) / marketRate : null,
  };
}

function failure(message) {
  return {
    ok: false, error: message,
    tierIndex: 0, tierLabel: TIERS[0],
    garment: null, placements: [],
    decorationCost: 0, blankCost: 0, totalCost: 0,
    margin: 0, marginBelowFloor: false,
    pricePerPiece: 0, orderTotal: 0, marginPerPiece: 0, marginTotal: 0,
    quantity: 0, breakdown: [],
    marketRate: null, marketDelta: null, marginAtMarket: null,
  };
}

/**
 * Full rate card for a garment across all six tiers — for admin/reference views.
 * @returns {Array<{tierIndex,tierLabel,cost,margin,price,belowFloor}>}
 */
function rateCard(garmentId, placementIds, costs = DEFAULT_COSTS, ladder = DEFAULT_LADDER) {
  return TIERS.map((label, t) => {
    const cost = decorationCost(garmentId, placementIds, t, costs);
    return {
      tierIndex: t,
      tierLabel: label,
      cost,
      margin: effectiveMargin(t, costs, ladder),
      price: priceFromCost(cost, t, costs, ladder),
      belowFloor: isBelowFloor(t, costs, ladder),
    };
  });
}

/**
 * Price a transfer-only product (film shipped ready to press).
 * Transfers carry no press labor, so they scale mostly on materials.
 */
function transferPrice(transferId, tierIndex, costs = DEFAULT_COSTS, ladder = DEFAULT_LADDER) {
  const item = TRANSFER_PRODUCTS.find(x => x.id === transferId);
  if (!item) return 0;
  const t = clampTier(tierIndex);
  // Materials scale fully; a small slice of the labor curve covers cut/weed handling.
  const cost = item.baseCost * MATERIAL_MULT[t] * (1 + (LABOR_MULT[t] - 1) * 0.35);
  return priceFromCost(cost, t, costs, ladder);
}

/**
 * Solve for the 500+ anchor that lands the reference product on its market rate.
 * Returns null when there is no market rate to aim at.
 */
function suggestHighAnchorForMarket(costs = DEFAULT_COSTS, ladder = DEFAULT_LADDER) {
  const target = marketRateFor(REFERENCE_PRODUCT.placementIds);
  return target === null ? null : target;
}

// ---------------------------------------------------------------------------
// Exports — ESM, CommonJS, and browser global
// ---------------------------------------------------------------------------

const DTFPricing = {
  // constants
  TIERS, TIER_MIN, LABOR_MULT, MATERIAL_MULT,
  DEFAULT_COSTS, DEFAULT_LADDER, REFERENCE_PRODUCT,
  GARMENTS, PLACEMENTS, TRANSFER_PRODUCTS,
  MARKET_RATES, MARKET_GANG_SHEET,
  // lookups
  findGarment, findPlacement, tierIndexFor, marketRateFor,
  // cost model
  pressLaborPerCycle, placementCost, handlingCost, decorationCost, costBreakdown,
  // pricing
  referencePrice, rawMargin, isBelowFloor, effectiveMargin, priceFromCost,
  // high level
  quote, rateCard, transferPrice, suggestHighAnchorForMarket,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = DTFPricing;
}
if (typeof window !== "undefined") {
  window.DTFPricing = DTFPricing;
}

export {
  TIERS, TIER_MIN, LABOR_MULT, MATERIAL_MULT,
  DEFAULT_COSTS, DEFAULT_LADDER, REFERENCE_PRODUCT,
  GARMENTS, PLACEMENTS, TRANSFER_PRODUCTS,
  MARKET_RATES, MARKET_GANG_SHEET,
  findGarment, findPlacement, tierIndexFor, marketRateFor,
  pressLaborPerCycle, placementCost, handlingCost, decorationCost, costBreakdown,
  referencePrice, rawMargin, isBelowFloor, effectiveMargin, priceFromCost,
  quote, rateCard, transferPrice, suggestHighAnchorForMarket,
};
export default DTFPricing;
