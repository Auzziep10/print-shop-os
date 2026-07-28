import sanmarCatalogJson from '../data/sanmar-catalog.json';

const sanmarCatalog = sanmarCatalogJson as any[];

export interface WeightAndFabric {
  weight: string;
  fabric: string;
  formatted: string;
}

export const DEFAULT_SLOT_ORDER = ['hat', 'shirt', 'polo', 'crewneck', 'hoodie', 'longsleeve'];

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
