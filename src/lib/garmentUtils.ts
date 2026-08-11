import sanmarCatalogJson from '../data/sanmar-catalog.json';

const sanmarCatalog = sanmarCatalogJson as any[];

export interface WeightAndFabric {
  weight: string;
  fabric: string;
  formatted: string;
}

export const DEFAULT_SLOT_ORDER = ['hat', 'shirt', 'polo', 'crewneck', 'hoodie', 'longsleeve'];

export const getFilteredProductColors = (
  product: { style?: string; colors?: string[]; itemNum?: string } | null | undefined,
  allowedColorsMap?: Record<string, string[]> | null
): string[] => {
  if (!product) return [];
  const allColors = product.colors || [];
  if (!allowedColorsMap || Object.keys(allowedColorsMap).length === 0) return allColors;

  // Try itemNum first (SKU style code e.g. "BC3001CVC", "3001CVC"), then style
  const styleCandidates = [product.itemNum, product.style]
    .filter(Boolean)
    .map(s => String(s).toLowerCase().trim());

  if (styleCandidates.length === 0) return allColors;

  const allowedMapKeys = Object.keys(allowedColorsMap);
  let matchingKey: string | undefined;

  for (const candidate of styleCandidates) {
    const cleanCand = candidate.replace(/[\s-]/g, '');
    const cleanCandNoPrefix = cleanCand.replace(/^(bc|nl|dt)/i, '');
    const cleanCandNoCvc = cleanCand.replace(/cvc$/i, '');
    const cleanCandBase = cleanCand.replace(/^(bc|nl|dt)|cvc$/gi, '');

    matchingKey = allowedMapKeys.find(k => {
      const cleanK = k.toLowerCase().trim().replace(/[\s-]/g, '');
      const cleanKNoPrefix = cleanK.replace(/^(bc|nl|dt)/i, '');
      const cleanKNoCvc = cleanK.replace(/cvc$/i, '');
      const cleanKBase = cleanK.replace(/^(bc|nl|dt)|cvc$/gi, '');

      return cleanK === cleanCand ||
             cleanKNoPrefix === cleanCandNoPrefix ||
             cleanKNoCvc === cleanCandNoCvc ||
             cleanKBase === cleanCandBase ||
             (cleanCand.length >= 3 && cleanK.includes(cleanCand)) ||
             (cleanK.length >= 3 && cleanCand.includes(cleanK));
    });

    if (matchingKey) break;
  }

  if (!matchingKey) return allColors;
  const allowed = allowedColorsMap[matchingKey];
  if (!allowed || !Array.isArray(allowed)) return allColors;
  return allColors.filter(c => allowed.includes(c));
};


export interface GarmentTypeConfig {
  id: string;
  label: string;
  slotKey: string;
  description: string;
}

export const GARMENT_TYPES: GarmentTypeConfig[] = [
  { id: 't-shirt', label: 'T-Shirt', slotKey: 'shirt', description: 'Everyday tees, classic crewnecks, and performance tops' },
  { id: 'polo', label: 'Polo', slotKey: 'polo', description: 'Classic collared polos, jersey polos, and performance golf shirts' },
  { id: 'hoodie', label: 'Hoodie', slotKey: 'hoodie', description: 'Pullover and full-zip fleece hoodies' },
  { id: 'longsleeve', label: 'Longsleeve', slotKey: 'longsleeve', description: 'Long sleeve tees and thermal shirts' },
  { id: 'crewneck', label: 'Crewneck', slotKey: 'crewneck', description: 'Cozy fleece crewneck sweatshirts' },
  { id: 'jacket', label: 'Jacket', slotKey: 'jacket', description: 'Outerwear, vests, and windbreakers' },
  { id: 'blazer', label: 'Blazer', slotKey: 'blazer', description: 'Tailored blazers, sport coats, and suit jackets' },
  { id: 'hat', label: 'Hat', slotKey: 'hat', description: 'Caps, beanies, and trucker hats' },
  { id: 'pants', label: 'Pants', slotKey: 'pants', description: 'Sweatpants, joggers, and trousers' },
  { id: 'shorts', label: 'Shorts', slotKey: 'shorts', description: 'Athletic and casual fleece shorts' },
];

export type GarmentTypeId = typeof GARMENT_TYPES[number]['id'];

export const detectGarmentTypeTag = (product: any, customTags?: Record<string, string>): GarmentTypeId => {
  if (!product) return 't-shirt';

  const styleKey = String(product.style || product.id || product.itemNum || '').toLowerCase();
  
  if (customTags && customTags[styleKey]) {
    const tag = customTags[styleKey].toLowerCase();
    if (GARMENT_TYPES.some(t => t.id === tag)) return tag as GarmentTypeId;
  }

  if (product.garmentType) {
    const tag = String(product.garmentType).toLowerCase();
    if (GARMENT_TYPES.some(t => t.id === tag)) return tag as GarmentTypeId;
  }

  if (product.slot) {
    const s = String(product.slot).toLowerCase();
    if (s === 'shirt') return 't-shirt';
    if (GARMENT_TYPES.some(t => t.id === s)) return s as GarmentTypeId;
  }

  const text = `${product.category || ''} ${product.slot || ''} ${product.style || ''} ${product.title || ''} ${product.description || ''} ${product.brand || ''}`.toLowerCase();

  if (/hat|cap|beanie|visor|headwear|headgear|trucker|snapback/i.test(text)) return 'hat';
  if (/short/i.test(text) && !/sleeve|short\s*sleeve/i.test(text)) return 'shorts';
  if (/pant|jogger|sweatpant|legging|trouser|bottom/i.test(text)) return 'pants';
  if (/blazer|suit\s*coat|suit\s*jacket|sport\s*coat|blazers/i.test(text)) return 'blazer';
  if (/jacket|coat|vest|windbreaker|parka|outerwear/i.test(text)) return 'jacket';
  if (/hoodi|hooded|hood/i.test(text)) return 'hoodie';
  if (/polo|collared|pique/i.test(text)) return 'polo';
  if (/long\s*sleeve|longsleeve|\bls\b|\bl\/s\b/i.test(text)) return 'longsleeve';
  if (/crewneck|crew\s*neck|sweatshirt|fleece\s*crew/i.test(text)) return 'crewneck';

  return 't-shirt';
};


export const getOrderedKeys = (
  categoryRacks: Record<string, any> | undefined | null,
  category: string,
  orderMap?: Record<string, string[]> | null
): string[] => {
  if (!categoryRacks) return [];
  const allKeys = Object.keys(categoryRacks);
  const order = orderMap?.[category];

  return [...allKeys].sort((a, b) => {
    // 1. Check custom user order map first
    if (order && Array.isArray(order)) {
      const idxA = order.indexOf(a);
      const idxB = order.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
    }

    // 2. Check standard default slot order (hat, shirt, polo, crewneck, hoodie, longsleeve)
    const defIdxA = DEFAULT_SLOT_ORDER.indexOf(a);
    const defIdxB = DEFAULT_SLOT_ORDER.indexOf(b);
    if (defIdxA !== -1 && defIdxB !== -1) return defIdxA - defIdxB;
    if (defIdxA !== -1) return -1;
    if (defIdxB !== -1) return 1;

    // 3. Stable alphabetical fallback for any remaining custom slots
    return a.localeCompare(b);
  });
};

export const cleanFabricText = (text: string): string => {
  if (!text) return '';
  let t = text.trim();

  // If text starts with ounce info, remove it
  t = t.replace(/^\d+(\.\d+)?\s*-?\s*ounce(s)?\s*(\(\d+\s*gsm\))?\s*/gi, '');

  // Remove singles, fit, tear-away notes
  t = t.replace(/\b\d+\s+singles\b.*/gi, '');
  t = t.replace(/retail fit.*/gi, '');
  t = t.replace(/tear-away.*/gi, '');
  t = t.replace(/airlume combed and ring spun cotton/gi, 'Cotton');
  t = t.replace(/combed ring spun cotton/gi, 'Cotton');
  t = t.replace(/ring spun cotton/gi, 'Cotton');
  t = t.replace(/combed cotton/gi, 'Cotton');
  t = t.replace(/recycled cotton/gi, 'Cotton');
  t = t.replace(/recycled poly(ester)?/gi, 'Poly');
  t = t.replace(/polyester/gi, 'Poly');
  t = t.replace(/cotton/gi, 'Cotton');
  t = t.replace(/rayon/gi, 'Rayon');
  t = t.replace(/\s*\/\s*/g, '/');

  // Strip trailing descriptors like "3-end fleece", "interlock", etc.
  t = t.replace(/\s+(3-end fleece|interlock|jersey|front|mesh back|panels|structured).*/gi, '');

  // Capitalize nicely
  t = t
    .split(' ')
    .map(w => {
      if (w.includes('/')) {
        return w
          .split('/')
          .map(sub => sub.charAt(0).toUpperCase() + sub.slice(1).toLowerCase())
          .join('/');
      }
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');

  t = t.replace(/\s+/g, ' ').trim();

  // Common replacements for conciseness
  t = t.replace(/\bCotton\/poly\b/gi, 'Cotton/Poly');

  return t;
};

export const getGarmentWeightAndFabric = (item: any, catalogProduct?: any): WeightAndFabric => {
  if (!item && !catalogProduct) return { weight: '', fabric: '', formatted: '' };

  const target = item || {};
  let catProd = catalogProduct;

  if (!catProd && (target.style || target.itemNum || target.id)) {
    const searchStyle = String(target.style || target.itemNum || '').toLowerCase();
    if (searchStyle) {
      catProd = sanmarCatalog.find(p => p.style.toLowerCase() === searchStyle);
    }
  }
  catProd = catProd || {};

  let weight = target.weight || target.weightOz || target.specs?.weight || target.customSpecs?.weight || target.fabric_weight || catProd.weight || '';
  let fabric = target.fabric || target.fabricType || target.specs?.fabric || target.specs?.fabricType || target.customSpecs?.fabric || target.material || target.fabric_composition || catProd.fabric || '';

  const desc = (target.description || target.desc || target.productDescription || target.customSpecs?.description || catProd.description || '').trim();

  // 1. Weight parsing if missing
  if (!weight && desc) {
    const ozMatch = desc.match(/\b(\d+(?:\.\d+)?)\s*-?\s*(?:ounce|oz)\b/i);
    if (ozMatch) {
      weight = `${ozMatch[1]} oz`;
    } else {
      const wordMatch = desc.match(/\b(heavyweight|midweight|lightweight)\b/i);
      if (wordMatch) {
        weight = wordMatch[1].charAt(0).toUpperCase() + wordMatch[1].slice(1).toLowerCase();
      }
    }
  } else if (weight && !isNaN(Number(weight))) {
    weight = `${weight} oz`;
  }

  // 2. Fabric parsing if missing
  if (!fabric && desc) {
    const blendMatch = desc.match(/\b(\d+%\s+[a-zA-Z\s\/]+|\d+\/\d+(?:\/\d+)?\s+[a-zA-Z\s\/]+)/i);
    if (blendMatch) {
      fabric = cleanFabricText(blendMatch[0]);
    } else if (/\bpoly\b|polyester/i.test(desc) && /cotton/i.test(desc)) {
      fabric = 'Cotton/Poly';
    } else if (/\b100%\s*cotton|cotton\b/i.test(desc)) {
      fabric = '100% Cotton';
    } else if (/\bpolyester\b|\bpoly\b/i.test(desc)) {
      fabric = '100% Poly';
    } else if (/\bnylon\b/i.test(desc)) {
      fabric = 'Nylon';
    } else if (/\btwill\b/i.test(desc)) {
      fabric = 'Twill';
    } else if (/\bfleece\b/i.test(desc)) {
      fabric = 'Fleece';
    } else if (/\bpique\b/i.test(desc)) {
      fabric = 'Pique';
    }
  } else if (fabric) {
    fabric = cleanFabricText(fabric);
  }

  if (fabric) {
    fabric = cleanFabricText(fabric);
  }

  let formatted = '';
  if (weight && fabric) {
    if (weight.toLowerCase() === fabric.toLowerCase()) {
      formatted = weight;
    } else {
      formatted = `${weight} • ${fabric}`;
    }
  } else if (weight) {
    formatted = weight;
  } else if (fabric) {
    formatted = fabric;
  }

  return { weight, fabric, formatted };
};

export const resolveGarmentPlacementData = (
  itemOrGarment: any,
  logoPlacements?: any,
  catalogSettings?: any
): any => {
  if (!itemOrGarment) return null;

  const placements = logoPlacements || catalogSettings?.logoPlacements;

  // Extract style candidates (prioritizing true SKU / style code e.g. "BC3001CVC" over display names like "Athleisure — SHIRT")
  const styleCandidates: string[] = [];
  if (itemOrGarment.itemNum) styleCandidates.push(String(itemOrGarment.itemNum));
  if (itemOrGarment.product?.style) styleCandidates.push(String(itemOrGarment.product.style));
  if (itemOrGarment.product?.itemNum) styleCandidates.push(String(itemOrGarment.product.itemNum));
  if (itemOrGarment.style) {
    const s = String(itemOrGarment.style).trim();
    if (!s.includes(' ') && s.length <= 15) {
      styleCandidates.push(s);
    }
  }
  const cleanCandidates = styleCandidates.map(c => c.toLowerCase().trim()).filter(Boolean);

  const isStyleMatch = (styleA: string, styleB: string): boolean => {
    const cleanA = styleA.toLowerCase().replace(/[\s-]/g, '');
    const cleanB = styleB.toLowerCase().replace(/[\s-]/g, '');
    if (cleanA === cleanB) return true;
    const baseA = cleanA.replace(/^(bc|nl|dt)/i, '').replace(/cvc$/i, '');
    const baseB = cleanB.replace(/^(bc|nl|dt)/i, '').replace(/cvc$/i, '');
    if (baseA && baseB && baseA === baseB) return true;
    if (cleanA.length >= 3 && cleanB.length >= 3) {
      if (cleanA.includes(cleanB) || cleanB.includes(cleanA)) return true;
    }
    return false;
  };

  // 0. Canonical per-style placement (admin's "main mock" record). This is the
  // single source of truth: it wins over stale placementData snapshots on items
  // and over per-category records, so one edit applies everywhere.
  if (placements?.byStyle && cleanCandidates.length > 0) {
    const byStyleKeys = Object.keys(placements.byStyle);
    // Exact (case-insensitive) match first, then fuzzy (BC3001 ↔ BC3001CVC)
    for (const cand of cleanCandidates) {
      const exact = byStyleKeys.find(k => k.toLowerCase().trim() === cand);
      if (exact && placements.byStyle[exact]) return placements.byStyle[exact];
    }
    for (const cand of cleanCandidates) {
      const fuzzy = byStyleKeys.find(k => isStyleMatch(cand, k));
      if (fuzzy && placements.byStyle[fuzzy]) return placements.byStyle[fuzzy];
    }
  }

  // 1. Explicit placementData attached to itemOrGarment
  if (itemOrGarment.placementData) {
    const pd = itemOrGarment.placementData;
    if (pd && (pd.large || pd.medium || pd.small || pd.front || pd.back || typeof pd.x === 'number')) {
      return pd;
    }
  }

  if (!placements) return null;

  // Extract slot variations (e.g. ["shirt", "tshirt", "t-shirt"])
  const rawSlot = (
    itemOrGarment.slot ||
    itemOrGarment.garmentType ||
    itemOrGarment.product?.slot ||
    ''
  ).toLowerCase().trim();

  const slotVariations: string[] = [rawSlot];
  if (rawSlot === 'shirt' || rawSlot === 'tshirt' || rawSlot === 't-shirt') {
    slotVariations.push('shirt', 'tshirt', 't-shirt');
  } else if (rawSlot === 'longsleeve' || rawSlot === 'long-sleeve' || rawSlot === 'ls') {
    slotVariations.push('longsleeve', 'long-sleeve', 'ls');
  } else if (rawSlot === 'hoodie' || rawSlot === 'sweatshirt' || rawSlot === 'crewneck') {
    slotVariations.push('hoodie', 'sweatshirt', 'crewneck');
  }
  const cleanSlots = Array.from(new Set(slotVariations.filter(Boolean)));

  const themeCategory = itemOrGarment.themeCategory || catalogSettings?.selectedThemeCategory;
  const basicsCategory = itemOrGarment.basicsCategory || catalogSettings?.selectedBasicsCategory;
  const tier = itemOrGarment.tier;

  // 2. Direct lookup by themeCategory + slot variations in placements.racks
  if (themeCategory && placements.racks?.[themeCategory]) {
    for (const s of cleanSlots) {
      if (placements.racks[themeCategory][s]) {
        return placements.racks[themeCategory][s];
      }
    }
    const matchCat = Object.keys(placements.racks).find(k => k.toLowerCase() === themeCategory.toLowerCase());
    if (matchCat && placements.racks[matchCat]) {
      for (const s of cleanSlots) {
        if (placements.racks[matchCat][s]) {
          return placements.racks[matchCat][s];
        }
      }
    }
  }

  // 3. Direct lookup by basicsCategory + tier/slot in placements.basics
  if (basicsCategory && placements.basics?.[basicsCategory]) {
    if (tier && placements.basics[basicsCategory][tier]) {
      return placements.basics[basicsCategory][tier];
    }
    for (const s of cleanSlots) {
      if (placements.basics[basicsCategory][s]) {
        return placements.basics[basicsCategory][s];
      }
    }
  }

  // 4. Search by product style candidate matching in catalogSettings.racks
  if (cleanCandidates.length > 0 && catalogSettings?.racks) {
    for (const catName of Object.keys(catalogSettings.racks)) {
      const rackSlots = catalogSettings.racks[catName];
      if (rackSlots) {
        for (const sKey of Object.keys(rackSlots)) {
          const rackStyle = String(rackSlots[sKey]);
          if (cleanCandidates.some(cand => isStyleMatch(cand, rackStyle))) {
            const placement = placements.racks?.[catName]?.[sKey];
            if (placement) return placement;
          }
        }
      }
    }
  }

  // 5. Search by product style candidate matching in catalogSettings.basics
  if (cleanCandidates.length > 0 && catalogSettings?.basics) {
    for (const catName of Object.keys(catalogSettings.basics)) {
      const basicsTiers = catalogSettings.basics[catName];
      if (basicsTiers) {
        for (const tKey of Object.keys(basicsTiers)) {
          const basicStyle = String(basicsTiers[tKey]);
          if (cleanCandidates.some(cand => isStyleMatch(cand, basicStyle))) {
            const placement = placements.basics?.[catName]?.[tKey];
            if (placement) return placement;
          }
        }
      }
    }
  }

  // 6. Search across all categories in placements.racks for matching slot variation
  if (placements.racks) {
    for (const catName of Object.keys(placements.racks)) {
      for (const s of cleanSlots) {
        if (placements.racks[catName]?.[s]) {
          return placements.racks[catName][s];
        }
      }
    }
  }

  // 7. Search across all categories in placements.basics for matching slot variation
  if (placements.basics) {
    for (const catName of Object.keys(placements.basics)) {
      for (const s of cleanSlots) {
        if (placements.basics[catName]?.[s]) {
          return placements.basics[catName][s];
        }
      }
    }
  }

  return null;
};


// ---------------------------------------------------------------------------
// Garment-anchored placement remapping
//
// Placement boxes are stored as percentages of the artboard they were drawn
// on. If the mock displayed to a customer is cropped, letterboxed, or framed
// differently than the mock the admin drew on, frame-relative boxes drift off
// the garment. These helpers detect the garment's actual pixel bounds inside
// an image and remap boxes so they track the garment across any artboard.
// ---------------------------------------------------------------------------

// `measured: false` means the pixel scan was unavailable (tainted canvas) and
// the bounds are just the full image. Stored refs predate this flag and were
// only ever written from real scans, so `undefined` counts as measured.
export interface FrameContentBounds { x: number; y: number; w: number; h: number; measured?: boolean }

interface ImageContentInfo extends FrameContentBounds { aspect: number }

const imageContentCache = new Map<string, Promise<ImageContentInfo | null>>();

/**
 * Bounding box of the artwork/garment pixels within an image, as fractions
 * (0-1) of the image's natural dimensions, plus the image's natural aspect.
 *
 * Loading strategy matters: reading pixels from a cross-origin image taints
 * the canvas and throws. We therefore fetch the bytes first and scan through
 * a same-origin blob URL. If pixels still can't be read, we return full-image
 * bounds with the CORRECT aspect rather than null — aspect drives print-size
 * detection, and defaulting it to 1 would badly misjudge wide/tall logos.
 */
export const getImageContentInfo = (url: string): Promise<ImageContentInfo | null> => {
  if (!url || typeof document === 'undefined') return Promise.resolve(null);
  const cached = imageContentCache.get(url);
  if (cached) return cached;

  const loadImg = (src: string, useCors: boolean): Promise<HTMLImageElement | null> =>
    new Promise(resolve => {
      const img = new Image();
      if (useCors) img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });

  const promise = (async (): Promise<ImageContentInfo | null> => {
    let img: HTMLImageElement | null = null;
    let objectUrl: string | null = null;

    // 1. Preferred: fetch bytes → blob URL. Same-origin, so scanning is always allowed.
    try {
      const res = await fetch(url, { mode: 'cors' });
      if (res.ok) {
        objectUrl = URL.createObjectURL(await res.blob());
        img = await loadImg(objectUrl, false);
      }
    } catch { /* fall through to direct loads */ }

    // 2. Direct load with CORS, then without (aspect works either way)
    if (!img) img = await loadImg(url, true);
    if (!img) img = await loadImg(url, false);
    if (!img) {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      return null;
    }

    const aspect = (img.naturalWidth || 1) / (img.naturalHeight || 1);
    const fullImage: ImageContentInfo = { x: 0, y: 0, w: 1, h: 1, aspect, measured: false };

    try {
      const SCAN_W = 256;
      const scale = SCAN_W / (img.naturalWidth || 1);
      const w = SCAN_W;
      const h = Math.max(1, Math.round((img.naturalHeight || 1) * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return fullImage;
      ctx.drawImage(img, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h).data;
      let minX = w, minY = h, maxX = -1, maxY = -1;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const a = data[i + 3];
          if (a < 16) continue; // transparent background
          const r = data[i], g = data[i + 1], b = data[i + 2];
          if (r > 244 && g > 244 && b > 244) continue; // white studio background
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
      if (maxX < 0 || maxY < 0) return fullImage;
      return {
        x: minX / w,
        y: minY / h,
        w: (maxX - minX + 1) / w,
        h: (maxY - minY + 1) / h,
        aspect,
        measured: true,
      };
    } catch {
      return fullImage; // tainted canvas — aspect is still accurate
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  })();

  imageContentCache.set(url, promise);
  return promise;
};

/**
 * Garment content bounds mapped into an artboard (percent units, 0-100),
 * accounting for object-contain letterboxing. frameAspect = width / height of
 * the artboard the image is rendered in.
 */
export const getFrameContentBounds = async (
  url: string,
  frameAspect: number
): Promise<FrameContentBounds | null> => {
  const info = await getImageContentInfo(url);
  if (!info || !frameAspect || frameAspect <= 0) return null;
  let drawnW: number, drawnH: number;
  if (info.aspect > frameAspect) {
    drawnW = 100;
    drawnH = (100 * frameAspect) / info.aspect;
  } else {
    drawnH = 100;
    drawnW = (100 * info.aspect) / frameAspect;
  }
  const offsetX = (100 - drawnW) / 2;
  const offsetY = (100 - drawnH) / 2;
  return {
    x: offsetX + info.x * drawnW,
    y: offsetY + info.y * drawnH,
    w: info.w * drawnW,
    h: info.h * drawnH,
    measured: info.measured !== false,
  };
};

/**
 * Remap a placement box (percent units, center-based x/y) drawn relative to
 * one garment's frame bounds onto another frame where the garment occupies
 * different bounds. Identity when either bounds set is missing/degenerate.
 */
export const remapBoxToFrame = <T extends { x: number; y: number; w: number; h: number }>(
  box: T,
  ref: FrameContentBounds | null | undefined,
  disp: FrameContentBounds | null | undefined
): T => {
  if (!box || !ref || !disp || !ref.w || !ref.h || !disp.w || !disp.h) return box;
  // Never remap against un-scanned (fallback) bounds — that would move boxes
  // based on a guess. Stored refs without the flag are real measurements.
  if (ref.measured === false || disp.measured === false) return box;
  return {
    ...box,
    x: disp.x + ((box.x - ref.x) / ref.w) * disp.w,
    y: disp.y + ((box.y - ref.y) / ref.h) * disp.h,
    w: box.w * (disp.w / ref.w),
    h: box.h * (disp.h / ref.h),
  };
};

/**
 * Determine which admin placement box (Small / Medium / Large) a logo's
 * PRINT SIZE corresponds to, for pricing. `logo` is the rendered logo rect
 * in artboard percent units (x/y = center). Position on the garment is
 * deliberately ignored — the tier is the smallest box whose dimensions the
 * logo would fit inside (with slack), wherever it's placed. Returns 'Large'
 * when boxes exist but the logo exceeds them all, and null when no placement
 * data is available for that side.
 */
export const detectPrintSizeFromPlacement = (
  placement: any,
  side: 'front' | 'back',
  logo: { x: number; y: number; wPct: number; hPct: number }
): 'Small' | 'Medium' | 'Large' | null => {
  if (!placement || !logo || !(logo.wPct > 0)) return null;
  const sideMap = side === 'back'
    ? (placement.back || (placement && !placement.front ? placement : null))
    : (placement.front || placement);
  if (!sideMap) return null;

  const SIZE_SLACK = 1.12; // allow ~12% overhang before bumping to the next tier

  const candidates: Array<['Small' | 'Medium' | 'Large', any]> = [
    ['Small', sideMap.small],
    ['Medium', sideMap.medium],
    ['Large', sideMap.large],
  ];

  let sawBox = false;
  for (const [label, box] of candidates) {
    if (!box || typeof box.x !== 'number' || !(box.w > 0) || !(box.h > 0)) continue;
    sawBox = true;
    const fitsSize = logo.wPct <= box.w * SIZE_SLACK && logo.hPct <= box.h * SIZE_SLACK;
    if (fitsSize) return label;
  }

  return sawBox ? 'Large' : null;
};
