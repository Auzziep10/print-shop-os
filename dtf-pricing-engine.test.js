/**
 * Golden tests for the DTF pricing engine.
 *
 * Run:  node dtf-pricing-engine.test.js
 * (Zero dependencies. Exits non-zero on failure.)
 */

import E from "./dtf-pricing-engine.js";

let passed = 0, failed = 0;
const EPS = 1e-6;

function near(actual, expected, label) {
  if (Math.abs(actual - expected) <= EPS) { passed++; return; }
  failed++;
  console.error(`FAIL ${label}\n     expected ${expected}\n     actual   ${actual}`);
}
function eq(actual, expected, label) {
  if (actual === expected) { passed++; return; }
  failed++;
  console.error(`FAIL ${label}: expected ${expected}, got ${actual}`);
}

// ---------------------------------------------------------------------------
// 1. Quote vectors — garment / placements / quantity
// ---------------------------------------------------------------------------
const QUOTE_VECTORS = [
  {
    "garmentId": "tee",
    "placementIds": ["ff"],
    "quantity": 1,
    "tierIndex": 0,
    "decorationCost": 2.665,
    "pricePerPiece": 4.75
  },
  {
    "garmentId": "tee",
    "placementIds": ["ff"],
    "quantity": 25,
    "tierIndex": 1,
    "decorationCost": 2.3775,
    "pricePerPiece": 4.625
  },
  {
    "garmentId": "tee",
    "placementIds": ["ff"],
    "quantity": 50,
    "tierIndex": 2,
    "decorationCost": 2.15,
    "pricePerPiece": 4.5
  },
  {
    "garmentId": "tee",
    "placementIds": ["ff"],
    "quantity": 250,
    "tierIndex": 4,
    "decorationCost": 1.822,
    "pricePerPiece": 4.25
  },
  {
    "garmentId": "tee",
    "placementIds": ["ff"],
    "quantity": 500,
    "tierIndex": 5,
    "decorationCost": 1.7,
    "pricePerPiece": 4.125
  },
  {
    "garmentId": "tee",
    "placementIds": ["ff"],
    "quantity": 1000,
    "tierIndex": 6,
    "decorationCost": 1.578,
    "pricePerPiece": 4.0
  }
];

QUOTE_VECTORS.forEach(v => {
  const tag = `${v.garmentId}[${v.placementIds.join("+")}]x${v.quantity}`;
  const r = E.quote({ garmentId: v.garmentId, placementIds: v.placementIds, quantity: v.quantity });
  eq(r.ok, true, `${tag} ok`);
  eq(r.tierIndex, v.tierIndex, `${tag} tierIndex`);
  near(r.decorationCost, v.decorationCost, `${tag} decorationCost`);
  near(r.pricePerPiece, v.pricePerPiece, `${tag} pricePerPiece`);
});

// ---------------------------------------------------------------------------
// 2. Blank garment inclusion
// ---------------------------------------------------------------------------
{
  const r = E.quote({ garmentId: "tee", placementIds: ["ff","fb"], quantity: 250, blankCost: 4.19 });
  eq(r.ok, true, "blank cost quote ok");
}

// ---------------------------------------------------------------------------
// 3. Structural invariants — these encode WHY the model is shaped this way.
// ---------------------------------------------------------------------------

// 3a. Handling is charged ONCE per garment, so N placements on one garment
//     must cost less than N separate single-placement jobs.
{
  const four = E.quote({ garmentId:"tee", placementIds:["ff","fb","sl","sr"], quantity:100 }).decorationCost;
  const separate =
    E.quote({garmentId:"tee",placementIds:["ff"],quantity:100}).decorationCost +
    E.quote({garmentId:"tee",placementIds:["fb"],quantity:100}).decorationCost +
    E.quote({garmentId:"tee",placementIds:["sl"],quantity:100}).decorationCost +
    E.quote({garmentId:"tee",placementIds:["sr"],quantity:100}).decorationCost;
  if (four < separate) passed++; else { failed++; console.error("FAIL invariant: handling charged more than once"); }
}

// 3b. An added placement costs less than the same placement as the first one.
{
  const first = E.placementCost("fb", 2, true,  E.DEFAULT_COSTS);
  const extra = E.placementCost("fb", 2, false, E.DEFAULT_COSTS);
  if (extra < first) passed++; else { failed++; console.error("FAIL invariant: marginal placement not cheaper"); }
}

// 3c. Cost per piece must fall monotonically as quantity rises.
{
  let ok = true;
  for (let t = 1; t < E.TIERS.length; t++) {
    if (E.decorationCost("tee", ["ff"], t) >= E.decorationCost("tee", ["ff"], t - 1)) ok = false;
  }
  if (ok) passed++; else { failed++; console.error("FAIL invariant: cost does not fall with volume"); }
}

// 3d. Margin must RISE with quantity under the default ladder (cost falls
//     while the ladder price falls more slowly).
{
  let ok = true;
  for (let t = 1; t < E.TIERS.length; t++) {
    if (E.effectiveMargin(t) <= E.effectiveMargin(t - 1)) ok = false;
  }
  if (ok) passed++; else { failed++; console.error("FAIL invariant: margin does not rise with volume"); }
}

// 3e. The price ladder is LINEAR: every step between tiers is equal.
{
  const steps = [];
  for (let t = 1; t < E.TIERS.length; t++) steps.push(E.referencePrice(t - 1) - E.referencePrice(t));
  const ok = steps.every(s => Math.abs(s - steps[0]) < EPS);
  if (ok) passed++; else { failed++; console.error("FAIL invariant: price ladder is not linear", steps); }
}

// 3f. Breakdown must sum exactly to the price.
{
  const r = E.quote({ garmentId:"tee", placementIds:["ff","fb"], quantity:250, blankCost:4.19 });
  const sum = r.breakdown.reduce((a, l) => a + l.amount, 0);
  near(sum, r.pricePerPiece, "breakdown sums to price");
  const pct = r.breakdown.reduce((a, l) => a + l.percentOfPrice, 0);
  near(pct, 100, "breakdown percentages sum to 100");
}

// 3g. Margin floor is respected when the ladder is set below cost.
{
  const ladder = { ...E.DEFAULT_LADDER, priceAtLowTier: 4.75, priceAtHighTier: 1.00, marginFloor: 0.35 };
  let ok = true;
  for (let t = 0; t < E.TIERS.length; t++) if (E.effectiveMargin(t, E.DEFAULT_COSTS, ladder) < 0.35 - EPS) ok = false;
  if (ok) passed++; else { failed++; console.error("FAIL invariant: margin floor not enforced"); }
}

// ---------------------------------------------------------------------------
// 4. Degenerate inputs must not produce NaN / Infinity.
// ---------------------------------------------------------------------------
{
  const bad = [
    { garmentId:"tee", placementIds:["ff"], quantity:0 },
    { garmentId:"tee", placementIds:["ff"], quantity:NaN },
    { garmentId:"tee", placementIds:["ff"], quantity:50, blankCost:NaN },
    { garmentId:"tee", placementIds:["ff"], quantity:50, costs:{ ...E.DEFAULT_COSTS, pressPerHour:0 } },
    { garmentId:"tee", placementIds:["ff"], quantity:50, ladder:{ ...E.DEFAULT_LADDER, priceAtLowTier:0, priceAtHighTier:0 } },
  ];
  bad.forEach((input, i) => {
    const r = E.quote(input);
    const nums = [r.decorationCost, r.totalCost, r.margin, r.pricePerPiece, r.orderTotal, r.marginPerPiece];
    const clean = nums.every(n => Number.isFinite(n));
    if (clean) passed++; else { failed++; console.error(`FAIL degenerate input ${i} produced non-finite value`, nums); }
  });
}

// 5. Invalid selections fail cleanly rather than throwing.
{
  eq(E.quote({ garmentId:"nope", placementIds:["ff"], quantity:10 }).ok, false, "unknown garment rejected");
  eq(E.quote({ garmentId:"tee", placementIds:[], quantity:10 }).ok, false, "empty placements rejected");
  eq(E.quote({ garmentId:"hat", placementIds:["sl"], quantity:10 }).ok, false, "invalid placement for hat rejected");
  eq(E.quote({ garmentId:"tote", placementIds:["ff","tag"], quantity:10 }).placements.length, 1, "invalid placement filtered out");
}

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
