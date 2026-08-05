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
