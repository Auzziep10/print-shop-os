// @ts-ignore
import DTFPricing from '../../dtf-pricing-engine.js';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Detect DTF garment category from style / title / category strings.
 */
export function detectGarmentId(styleStr?: string, categoryStr?: string): string {
  const str = `${styleStr || ''} ${categoryStr || ''}`.toLowerCase();
  if (str.includes('hoodie') || str.includes('hooded')) return 'hoodie';
  if (str.includes('crew') || str.includes('sweatshirt')) return 'crew';
  if (str.includes('long-sleeve') || str.includes('long sleeve') || str.includes('ls')) return 'ls';
  if (str.includes('youth')) return 'youth';
  if (str.includes('tote') || str.includes('bag')) return 'tote';
  if (str.includes('hat') || str.includes('cap') || str.includes('beanie')) return 'hat';
  return 'tee'; // Default T-shirt
}

/**
 * Detect print placement IDs & print sizes from customized garment item.
 * Distinguishes large prints (11x14 full front/back) vs small prints (~4" chest/back), sleeves, tags, and cap patches.
 */
export function detectPlacementIds(item: any, garmentId: string): string[] {
  if (garmentId === 'hat') return ['patch'];

  const placements: string[] = [];
  const lp = (item.logoPlacement || '').toLowerCase();

  // 1. FRONT ARTWORK
  const hasFront = !!(item.logoUrlFront || item.logoUrl || item.customizedFrontImage || lp.includes('front'));
  if (hasFront) {
    const w = item.logoWidthFront ? parseFloat(item.logoWidthFront) : 0;
    // Left chest if explicitly <= 5" wide or positioned top-left chest
    const isLeftChest = (w > 0 && w <= 5) || (w === 0 && (item.customScaleFront || 30) < 25 && (item.customOffsetXFront || 50) < 45);
    placements.push(isLeftChest ? 'lc' : 'ff');
  }

  // 2. BACK ARTWORK
  const hasBack = !!(item.logoUrlBack || item.customizedBackImage || lp.includes('back'));
  if (hasBack) {
    const w = item.logoWidthBack ? parseFloat(item.logoWidthBack) : 0;
    const isSmallBack = (w > 0 && w <= 5) || (w === 0 && (item.customScaleBack || 30) < 25 && (item.customOffsetXBack || 50) !== 50);
    placements.push(isSmallBack ? 'sb' : 'fb');
  }

  // 3. LEFT SLEEVE
  const hasLeftSleeve = !!(item.logoUrlLeftSleeve || item.customizedSleeveImage || lp.includes('left sleeve'));
  if (hasLeftSleeve) placements.push('sl');

  // 4. RIGHT SLEEVE
  const hasRightSleeve = !!(item.logoUrlRightSleeve || lp.includes('right sleeve'));
  if (hasRightSleeve) placements.push('sr');

  // 5. NECK TAG
  const hasTag = !!(item.logoUrlTag || item.tagLayout || lp.includes('tag'));
  if (hasTag) placements.push('tag');

  // Fallback: if customized or placement specified but none matched above, default to 'ff'
  if (placements.length === 0 && (item.customized || lp !== '')) {
    placements.push('ff');
  }

  return placements;
}

/**
 * Calculate deterministic auto-quote for a single line item without AI.
 */
export function autoQuoteItem(item: any, costs?: any, ladder?: any): {
  pricePerPiece: number;
  orderTotal: number;
  quantity: number;
  placementIds: string[];
  garmentId: string;
  ok: boolean;
} {
  const qty = Object.values(item.quantities || item.sizes || {}).reduce((sum: number, q: any) => sum + (parseFloat(q) || 0), 0) || parseFloat(item.qty) || 1;
  const garmentId = detectGarmentId(item.style || item.title || item.name, item.category);
  const placementIds = detectPlacementIds(item, garmentId);
  const blankCost = parseFloat(item.blankCost) || 0;

  const result = DTFPricing.quote({
    garmentId,
    placementIds,
    quantity: qty,
    blankCost,
    costs: costs || DTFPricing.DEFAULT_COSTS,
    ladder: ladder || DTFPricing.DEFAULT_LADDER
  });

  if (result.ok) {
    return {
      pricePerPiece: result.pricePerPiece,
      orderTotal: result.orderTotal,
      quantity: qty,
      placementIds,
      garmentId,
      ok: true
    };
  }

  const existingPrice = parseFloat(item.price) || 0;
  return {
    pricePerPiece: existingPrice,
    orderTotal: existingPrice * qty,
    quantity: qty,
    placementIds,
    garmentId,
    ok: false
  };
}

/**
 * Fetch DTF pricing settings from Firestore.
 */
export async function fetchDtfPricingSettings(): Promise<{ costs: any; ladder: any; autoQuotingEnabled: boolean }> {
  try {
    const docRef = doc(db, 'settings', 'dtf_pricing');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        costs: data.costs ? { ...DTFPricing.DEFAULT_COSTS, ...data.costs } : DTFPricing.DEFAULT_COSTS,
        ladder: data.ladder ? { ...DTFPricing.DEFAULT_LADDER, ...data.ladder } : DTFPricing.DEFAULT_LADDER,
        autoQuotingEnabled: data.autoQuotingEnabled !== undefined ? !!data.autoQuotingEnabled : true
      };
    }
  } catch (err) {
    console.error("Error fetching dtf pricing settings:", err);
  }
  return {
    costs: DTFPricing.DEFAULT_COSTS,
    ladder: DTFPricing.DEFAULT_LADDER,
    autoQuotingEnabled: true
  };
}
