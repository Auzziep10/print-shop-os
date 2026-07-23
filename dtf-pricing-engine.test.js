/**
 * Golden tests for the DTF pricing engine.
 *
 * These values were captured from the verified reference implementation.
 * If you change the engine and these fail, the PRICING CHANGED — that is a
 * business decision, not a refactor. Do not "fix" the expected values to make
 * tests pass unless the change was intentional and approved by the shop owner.
 *
 * Run:  node dtf-pricing-engine.test.js
 * (Zero dependencies. Exits non-zero on failure.)
 */

const E = require("./dtf-pricing-engine.js");

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
const QUOTE_VECTORS = 
[
  {
    "garmentId": "tee",
    "placementIds": [
      "ff"
    ],
    "quantity": 1,
    "tierIndex": 0,
    "decorationCost": 2.665,
    "margin": 0.438947,
    "pricePerPiece": 4.75,
    "orderTotal": 4.75
  },
  {
    "garmentId": "tee",
    "placementIds": [
      "ff"
    ],
    "quantity": 25,
    "tierIndex": 1,
    "decorationCost": 2.3775,
    "margin": 0.483152,
    "pricePerPiece": 4.6,
    "orderTotal": 115
  },
  {
    "garmentId": "tee",
    "placementIds": [
      "ff"
    ],
    "quantity": 50,
    "tierIndex": 2,
    "decorationCost": 2.15,
    "margin": 0.516854,
    "pricePerPiece": 4.45,
    "orderTotal": 222.5
  },
  {
    "garmentId": "tee",
    "placementIds": [
      "ff"
    ],
    "quantity": 250,
    "tierIndex": 4,
    "decorationCost": 1.822,
    "margin": 0.560964,
    "pricePerPiece": 4.15,
    "orderTotal": 1037.5
  },
  {
    "garmentId": "tee",
    "placementIds": [
      "ff"
    ],
    "quantity": 500,
    "tierIndex": 5,
    "decorationCost": 1.7,
    "margin": 0.575,
    "pricePerPiece": 4,
    "orderTotal": 2000
  },
  {
    "garmentId": "tee",
    "placementIds": [
      "lc"
    ],
    "quantity": 50,
    "tierIndex": 2,
    "decorationCost": 1.6,
    "margin": 0.516854,
    "pricePerPiece": 3.311628,
    "orderTotal": 165.581395
  },
  {
    "garmentId": "tee",
    "placementIds": [
      "tag"
    ],
    "quantity": 50,
    "tierIndex": 2,
    "decorationCost": 1.875,
    "margin": 0.516854,
    "pricePerPiece": 3.880814,
    "orderTotal": 194.040698
  },
  {
    "garmentId": "tee",
    "placementIds": [
      "ff",
      "fb"
    ],
    "quantity": 100,
    "tierIndex": 3,
    "decorationCost": 3.0978,
    "margin": 0.542326,
    "pricePerPiece": 6.768567,
    "orderTotal": 676.856707
  },
  {
    "garmentId": "tee",
    "placementIds": [
      "ff",
      "fb",
      "sl"
    ],
    "quantity": 100,
    "tierIndex": 3,
    "decorationCost": 3.6996,
    "margin": 0.542326,
    "pricePerPiece": 8.083476,
    "orderTotal": 808.347561
  },
  {
    "garmentId": "tee",
    "placementIds": [
      "ff",
      "fb",
      "sl",
      "sr"
    ],
    "quantity": 100,
    "tierIndex": 3,
    "decorationCost": 4.3014,
    "margin": 0.542326,
    "pricePerPiece": 9.398384,
    "orderTotal": 939.838415
  },
  {
    "garmentId": "hoodie",
    "placementIds": [
      "ff"
    ],
    "quantity": 25,
    "tierIndex": 1,
    "decorationCost": 2.851875,
    "margin": 0.483152,
    "pricePerPiece": 5.517823,
    "orderTotal": 137.945584
  },
  {
    "garmentId": "hat",
    "placementIds": [
      "patch"
    ],
    "quantity": 50,
    "tierIndex": 2,
    "decorationCost": 2.4375,
    "margin": 0.516854,
    "pricePerPiece": 5.045058,
    "orderTotal": 252.252907
  },
  {
    "garmentId": "tote",
    "placementIds": [
      "ff"
    ],
    "quantity": 200,
    "tierIndex": 3,
    "decorationCost": 1.8492,
    "margin": 0.542326,
    "pricePerPiece": 4.040427,
    "orderTotal": 808.085366
  },
  {
    "garmentId": "youth",
    "placementIds": [
      "ff"
    ],
    "quantity": 500,
    "tierIndex": 5,
    "decorationCost": 1.646,
    "margin": 0.575,
    "pricePerPiece": 3.872941,
    "orderTotal": 1936.470588
  },
  {
    "garmentId": "crew",
    "placementIds": [
      "lc",
      "fb"
    ],
    "quantity": 75,
    "tierIndex": 2,
    "decorationCost": 3.0975,
    "margin": 0.516854,
    "pricePerPiece": 6.411105,
    "orderTotal": 480.832849
  }
];

QUOTE_VECTORS.forEach(v => {
  const tag = `${v.garmentId}[${v.placementIds.join("+")}]x${v.quantity}`;
  const r = E.quote({ garmentId: v.garmentId, placementIds: v.placementIds, quantity: v.quantity });
  eq(r.ok, true, `${tag} ok`);
  eq(r.tierIndex, v.tierIndex, `${tag} tierIndex`);
  near(r.decorationCost, v.decorationCost, `${tag} decorationCost`);
  near(r.margin, v.margin, `${tag} margin`);
  near(r.pricePerPiece, v.pricePerPiece, `${tag} pricePerPiece`);
  near(r.orderTotal, v.orderTotal, `${tag} orderTotal`);
});

// ---------------------------------------------------------------------------
// 2. Blank garment inclusion
// ---------------------------------------------------------------------------
const BLANK_VECTORS = 
[
  {
    "blankCost": 0,
    "totalCost": 2.891525,
    "pricePerPiece": 6.586075
  },
  {
    "blankCost": 4.19,
    "totalCost": 7.081525,
    "pricePerPiece": 16.129708
  },
  {
    "blankCost": 7.5,
    "totalCost": 10.391525,
    "pricePerPiece": 23.668951
  }
];

BLANK_VECTORS.forEach(v => {
  const r = E.quote({ garmentId: "tee", placementIds: ["ff","fb"], quantity: 250, blankCost: v.blankCost });
  near(r.totalCost, v.totalCost, `blank ${v.blankCost} totalCost`);
  near(r.pricePerPiece, v.pricePerPiece, `blank ${v.blankCost} pricePerPiece`);
});

// ---------------------------------------------------------------------------
// 3. Transfer-only pricing
// ---------------------------------------------------------------------------
const TRANSFER_VECTORS = 
[
  {
    "id": "t2x2",
    "prices": [
      1.144402,
      1.111865,
      1.076279,
      1.044921,
      1.00957,
      0.971189
    ]
  },
  {
    "id": "t3x3",
    "prices": [
      1.496526,
      1.453977,
      1.407442,
      1.366435,
      1.320207,
      1.270016
    ]
  },
  {
    "id": "t11x11",
    "prices": [
      5.567958,
      5.409651,
      5.236512,
      5.083942,
      4.911945,
      4.725207
    ]
  },
  {
    "id": "gang",
    "prices": [
      16.505804,
      16.036514,
      15.523256,
      15.070976,
      14.561102,
      14.007529
    ]
  }
];

TRANSFER_VECTORS.forEach(v => {
  v.prices.forEach((expected, tier) => {
    near(E.transferPrice(v.id, tier), expected, `transfer ${v.id} tier ${tier}`);
  });
});

// ---------------------------------------------------------------------------
// 4. Structural invariants — these encode WHY the model is shaped this way.
//    Breaking any of these means the pricing logic was misunderstood.
// ---------------------------------------------------------------------------

// 4a. Handling is charged ONCE per garment, so N placements on one garment
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

// 4b. An added placement costs less than the same placement as the first one.
{
  const first = E.placementCost("fb", 2, true,  E.DEFAULT_COSTS);
  const extra = E.placementCost("fb", 2, false, E.DEFAULT_COSTS);
  if (extra < first) passed++; else { failed++; console.error("FAIL invariant: marginal placement not cheaper"); }
}

// 4c. Cost per piece must fall monotonically as quantity rises.
{
  let ok = true;
  for (let t = 1; t < 6; t++) {
    if (E.decorationCost("tee", ["ff"], t) >= E.decorationCost("tee", ["ff"], t - 1)) ok = false;
  }
  if (ok) passed++; else { failed++; console.error("FAIL invariant: cost does not fall with volume"); }
}

// 4d. Margin must RISE with quantity under the default ladder (cost falls
//     while the ladder price falls more slowly).
{
  let ok = true;
  for (let t = 1; t < 6; t++) {
    if (E.effectiveMargin(t) <= E.effectiveMargin(t - 1)) ok = false;
  }
  if (ok) passed++; else { failed++; console.error("FAIL invariant: margin does not rise with volume"); }
}

// 4e. The price ladder is LINEAR: every step between tiers is equal.
{
  const steps = [];
  for (let t = 1; t < 6; t++) steps.push(E.referencePrice(t - 1) - E.referencePrice(t));
  const ok = steps.every(s => Math.abs(s - steps[0]) < EPS);
  if (ok) passed++; else { failed++; console.error("FAIL invariant: price ladder is not linear", steps); }
}

// 4f. Breakdown must sum exactly to the price.
{
  const r = E.quote({ garmentId:"tee", placementIds:["ff","fb"], quantity:250, blankCost:4.19 });
  const sum = r.breakdown.reduce((a, l) => a + l.amount, 0);
  near(sum, r.pricePerPiece, "breakdown sums to price");
  const pct = r.breakdown.reduce((a, l) => a + l.percentOfPrice, 0);
  near(pct, 100, "breakdown percentages sum to 100");
}

// 4g. Margin floor is respected when the ladder is set below cost.
{
  const ladder = { ...E.DEFAULT_LADDER, priceAtLowTier: 4.75, priceAtHighTier: 1.00, marginFloor: 0.35 };
  let ok = true;
  for (let t = 0; t < 6; t++) if (E.effectiveMargin(t, E.DEFAULT_COSTS, ladder) < 0.35 - EPS) ok = false;
  if (ok) passed++; else { failed++; console.error("FAIL invariant: margin floor not enforced"); }
}

// ---------------------------------------------------------------------------
// 5. Degenerate inputs must not produce NaN / Infinity. (These were real bugs.)
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

// 6. Invalid selections fail cleanly rather than throwing.
{
  eq(E.quote({ garmentId:"nope", placementIds:["ff"], quantity:10 }).ok, false, "unknown garment rejected");
  eq(E.quote({ garmentId:"tee", placementIds:[], quantity:10 }).ok, false, "empty placements rejected");
  eq(E.quote({ garmentId:"hat", placementIds:["sl"], quantity:10 }).ok, false, "invalid placement for hat rejected");
  eq(E.quote({ garmentId:"tote", placementIds:["ff","tag"], quantity:10 }).placements.length, 1, "invalid placement filtered out");
}

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
