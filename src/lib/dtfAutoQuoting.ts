// @ts-ignore
import DTFPricing from '../../dtf-pricing-engine.js';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
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

export const PLACEMENT_LABELS: Record<string, string> = {
  ff: 'Full Front (11×14")',
  mf: 'Medium Front (7×9")',
  lc: 'Small Front (4×4")',
  fb: 'Full Back (11×14")',
  mb: 'Medium Back (7×9")',
  sb: 'Small Upper Back (4×4")',
  sl: 'Left Sleeve (4×4")',
  sr: 'Right Sleeve (4×4")',
  tag: 'Neck Tag Relabel (2×3")',
  patch: 'Cap Patch (2.5×4")'
};

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
    const detected = String(item.detectedPrintSizeFront || item.printSizeFront || item.printSize || item.frontPrintSize || '').toLowerCase();
    if (w > 0) {
      // Explicit inches always win: ≤5" small, ≤8" medium (7×9 area), else full
      placements.push(w <= 5 ? 'lc' : w <= 8 ? 'mf' : 'ff');
    } else if (detected.includes('small') || detected === 'lc') {
      placements.push('lc');
    } else if (detected.includes('medium') || detected === 'mf') {
      placements.push('mf');
    } else if (detected.includes('large') || detected === 'ff') {
      placements.push('ff');
    } else {
      // Scale & position heuristic
      const scale = item.customScaleFront || (item.logoScale ? (item.logoScale <= 1 ? item.logoScale * 100 : item.logoScale) : 30);
      const offX = item.customOffsetXFront !== undefined ? item.customOffsetXFront : (item.logoPos?.x !== undefined ? item.logoPos.x : 50);
      const isLeftChest = (offX < 48 && scale <= 42) || scale <= 35;
      const isMedium = scale > 35 && scale <= 50;
      placements.push(isLeftChest ? 'lc' : isMedium ? 'mf' : 'ff');
    }
  }

  // 2. BACK ARTWORK
  const hasBack = !!(item.logoUrlBack || item.customizedBackImage || lp.includes('back'));
  if (hasBack) {
    const w = item.logoWidthBack ? parseFloat(item.logoWidthBack) : 0;
    const detected = String(item.detectedPrintSizeBack || item.printSizeBack || '').toLowerCase();
    if (w > 0) {
      placements.push(w <= 5 ? 'sb' : w <= 8 ? 'mb' : 'fb');
    } else if (detected.includes('small') || detected === 'sb') {
      placements.push('sb');
    } else if (detected.includes('medium') || detected === 'mb') {
      placements.push('mb');
    } else if (detected.includes('large') || detected === 'fb') {
      placements.push('fb');
    } else {
      const scale = item.customScaleBack || (item.backLogoScale ? (item.backLogoScale <= 1 ? item.backLogoScale * 100 : item.backLogoScale) : 30);
      const offX = item.customOffsetXBack !== undefined ? item.customOffsetXBack : (item.backLogoPos?.x !== undefined ? item.backLogoPos.x : 50);
      const isSmallBack = (offX !== 50 && scale <= 42) || scale <= 35;
      const isMedium = scale > 35 && scale <= 50;
      placements.push(isSmallBack ? 'sb' : isMedium ? 'mb' : 'fb');
    }
  }

  // 3. LEFT SLEEVE
  const hasLeftSleeve = !!(item.logoUrlLeftSleeve || item.customizedSleeveImage || lp.includes('left sleeve'));
  if (hasLeftSleeve) placements.push('sl');

  // 4. RIGHT SLEEVE
  const hasRightSleeve = !!(item.logoUrlRightSleeve || lp.includes('right sleeve'));
  if (hasRightSleeve) placements.push('sr');

  // 5. NECK TAG (Only if explicitly customized with tag logo or text)
  const hasTag = !!(
    (item.logoUrlTag && item.logoUrlTag !== '') || 
    (item.customizedTagImage && item.customizedTagImage !== '') ||
    (item.compiledTagMockupUrl && item.compiledTagMockupUrl !== '') ||
    (item.tagLayout && ((item.tagLayout.placedTagLogos && item.tagLayout.placedTagLogos.length > 0) || (item.tagLayout.placedTagTexts && item.tagLayout.placedTagTexts.length > 0))) ||
    lp.includes('tag: custom tag') ||
    lp.includes('neck tag') ||
    lp.includes('size tag')
  );
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
export function autoQuoteItem(item: any, costs?: any, ladder?: any, packagingOverride?: string): {
  pricePerPiece: number;
  orderTotal: number;
  quantity: number;
  placementIds: string[];
  garmentId: string;
  blankCost: number;
  breakdown: Array<{ id: string; label: string; amount: number; price: number; isMarginal: boolean }>;
  ok: boolean;
} {
  const qty = Object.values(item.quantities || item.sizes || {}).reduce((sum: number, q: any) => sum + (parseFloat(q) || 0), 0) || parseFloat(item.qty) || 1;
  const garmentId = detectGarmentId(item.style || item.title || item.name, item.category);
  const placementIds = detectPlacementIds(item, garmentId);
  const packaging = packagingOverride || item.packaging;

  // Check all possible garment price properties (blankCost, blankPrice, wholesalePrice, cost, price)
  const blankCost = parseFloat(item.blankCost) || parseFloat(item.blankPrice) || parseFloat(item.wholesalePrice) || parseFloat(item.cost) || parseFloat(item.price) || 0;

  const result = DTFPricing.quote({
    garmentId,
    placementIds,
    quantity: qty,
    blankCost,
    packaging,
    costs: costs || DTFPricing.DEFAULT_COSTS,
    ladder: ladder || DTFPricing.DEFAULT_LADDER
  });

  if (result.ok) {
    const margin = result.margin || 0;
    const marginDivisor = (1 - margin) > 0 ? (1 - margin) : 1;

    const breakdown = (result.breakdown || []).map((b: any) => ({
      id: b.id,
      label: b.label,
      amount: b.amount,
      price: b.id === 'packaging' ? b.amount : Math.round((b.amount / marginDivisor) * 100) / 100,
      isMarginal: !!b.isMarginal
    }));

    return {
      pricePerPiece: result.pricePerPiece,
      orderTotal: result.orderTotal,
      quantity: qty,
      placementIds,
      garmentId,
      blankCost,
      breakdown,
      ok: true
    };
  }

  const isBagged = packaging === 'Individually Bagged and Labeled';
  const basePrice = parseFloat(item.price) || 0;
  const existingPrice = basePrice + (isBagged ? 0.20 : 0);
  return {
    pricePerPiece: existingPrice,
    orderTotal: existingPrice * qty,
    quantity: qty,
    placementIds,
    garmentId,
    blankCost: 0,
    breakdown: isBagged ? [{ id: 'packaging', label: 'Individually Bagged & Labeled', amount: 0.20, price: 0.20, isMarginal: false }] : [],
    ok: false
  };
}

/**
 * Fetch DTF pricing settings from Firestore with optional customer override.
 */
export async function fetchDtfPricingSettings(customerId?: string): Promise<{ costs: any; ladder: any; autoQuotingEnabled: boolean; storefrontAutoQuotingEnabled: boolean }> {
  let costs = DTFPricing.DEFAULT_COSTS;
  let ladder = DTFPricing.DEFAULT_LADDER;
  let autoQuotingEnabled = true;
  let storefrontAutoQuotingEnabled = true;

  try {
    const docRef = doc(db, 'settings', 'dtf_pricing');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      costs = data.costs ? { ...DTFPricing.DEFAULT_COSTS, ...data.costs } : DTFPricing.DEFAULT_COSTS;
      ladder = data.ladder ? { ...DTFPricing.DEFAULT_LADDER, ...data.ladder } : DTFPricing.DEFAULT_LADDER;
      if (data.autoQuotingEnabled !== undefined) {
        autoQuotingEnabled = !!data.autoQuotingEnabled;
      }
      if (data.storefrontAutoQuotingEnabled !== undefined) {
        storefrontAutoQuotingEnabled = !!data.storefrontAutoQuotingEnabled;
      }
    }
  } catch (err) {
    console.error("Error fetching dtf pricing settings:", err);
  }

  // Check customer-specific override if customerId is passed
  if (customerId) {
    try {
      let custData: any = null;
      const custSnap = await getDoc(doc(db, 'customers', customerId));
      if (custSnap.exists()) {
        custData = custSnap.data();
      } else {
        const q1 = query(collection(db, 'customers'), where('customerId', '==', customerId));
        const q1Snap = await getDocs(q1);
        if (!q1Snap.empty) {
          custData = q1Snap.docs[0].data();
        } else {
          const q2 = query(collection(db, 'customers'), where('uid', '==', customerId));
          const q2Snap = await getDocs(q2);
          if (!q2Snap.empty) {
            custData = q2Snap.docs[0].data();
          }
        }
      }

      if (custData) {
        if (custData.autoQuotingEnabled === 'enabled' || custData.autoQuotingEnabled === true) {
          autoQuotingEnabled = true;
        } else if (custData.autoQuotingEnabled === 'disabled' || custData.autoQuotingEnabled === false) {
          autoQuotingEnabled = false;
        }

        // Custom pricing overrides for specific customer
        if (custData.customPricing?.enabled) {
          if (custData.customPricing.costs) {
            costs = { ...costs, ...custData.customPricing.costs };
          }
          if (custData.customPricing.ladder) {
            ladder = { ...ladder, ...custData.customPricing.ladder };
          }
          if (custData.customPricing.autoQuotingEnabled !== undefined && custData.customPricing.autoQuotingEnabled !== 'inherit') {
            autoQuotingEnabled = custData.customPricing.autoQuotingEnabled === 'enabled' || custData.customPricing.autoQuotingEnabled === true;
          }
        }
      }
    } catch (err) {
      console.error("Error checking customer auto-quoting override:", err);
    }
  }

  return {
    costs,
    ladder,
    autoQuotingEnabled,
    storefrontAutoQuotingEnabled
  };
}
