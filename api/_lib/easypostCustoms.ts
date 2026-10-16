// Shared helpers for international (non-US) EasyPost shipments.
// Files/folders prefixed with "_" are not exposed as Vercel API routes.

export function normalizeCountry(country?: string): string {
  const c = (country || '').trim().toUpperCase();
  if (!c || c === 'USA' || c === 'UNITED STATES' || c === 'UNITED STATES OF AMERICA') return 'US';
  return c;
}

export function isInternationalAddress(addr: any): boolean {
  return normalizeCountry(addr?.country) !== 'US';
}

type GarmentClass = {
  key: string;
  description: string;
  hsTariff: string;
  unitWeightOz: number;
};

// One default tariff (HS) code per garment type
const CLASSES: Record<string, GarmentClass> = {
  hoodie:  { key: 'hoodie',  description: 'Printed cotton knit sweatshirts/hoodies', hsTariff: '611020', unitWeightOz: 18 },
  jacket:  { key: 'jacket',  description: 'Printed jackets/outerwear',               hsTariff: '620193', unitWeightOz: 22 },
  hat:     { key: 'hat',     description: 'Embroidered/printed caps and hats',       hsTariff: '650500', unitWeightOz: 3 },
  bag:     { key: 'bag',     description: 'Printed textile tote bags',               hsTariff: '420222', unitWeightOz: 8 },
  apron:   { key: 'apron',   description: 'Printed textile aprons',                  hsTariff: '630790', unitWeightOz: 8 },
  polo:    { key: 'polo',    description: 'Printed cotton knit polo shirts',         hsTariff: '610510', unitWeightOz: 8 },
  tee:     { key: 'tee',     description: 'Printed cotton knit T-shirts',            hsTariff: '610910', unitWeightOz: 6 },
};

function classifyItem(item: any): GarmentClass {
  const style = (item.style || '').toLowerCase();
  const num = (item.itemNum || '').toLowerCase();

  if (style.includes('hoodie') || style.includes('sweatshirt') || style.includes('fleece') || style.includes('sweater') || style.includes('crewneck') ||
      num.includes('3719') || num.includes('18500') || num.includes('18000') || num.includes('996') || num.includes('90h') || num.includes('78h') || num.includes('150h')) {
    return CLASSES.hoodie;
  }
  if (style.includes('jacket') || style.includes('outerwear') || style.includes('windbreaker') || style.includes('vest') ||
      num.startsWith('j') || num.includes('j790') || num.includes('j317') || num.includes('j333')) {
    return CLASSES.jacket;
  }
  if (style.includes('cap') || style.includes('hat') || style.includes('beanie') || style.includes('visor') ||
      num.includes('112') || num.includes('115') || num.includes('104')) {
    return CLASSES.hat;
  }
  if (style.includes('tote') || style.includes('bag')) return CLASSES.bag;
  if (style.includes('apron')) return CLASSES.apron;
  if (style.includes('polo')) return CLASSES.polo;
  return CLASSES.tee;
}

function isNonGoods(item: any): boolean {
  const style = (item.style || '').toLowerCase();
  return style.includes('shipping') || style.includes('delivery') || style.includes('tax') ||
    (item.id && item.id.toString().startsWith('ship-')) ||
    item.itemType === 'shipping' || item.itemType === 'service' || item.itemType === 'discount';
}

function itemQty(item: any): number {
  if (item.sizes && Object.keys(item.sizes).length > 0) {
    const fromSizes = Object.values(item.sizes).reduce((a: number, b: any) => a + (parseInt(b) || 0), 0) as number;
    if (fromSizes > 0) return fromSizes;
  }
  return parseInt(item.qty || item.totalQty || 0) || 0;
}

function itemUnitPrice(item: any): number {
  const raw = item.price ?? item.unitPrice ?? item.msrp ?? 0;
  const n = parseFloat(String(raw).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 10; // fallback declared value per unit
}

/**
 * Build the EasyPost customs_info object from order/box line items.
 * Items are grouped by garment type so each tariff code is one customs line.
 */
export function buildCustomsInfo(items: any[], parcelWeightOz: number, fromAddress: any, splitInto: number = 1) {
  const groups = new Map<string, { cls: GarmentClass; qty: number; value: number }>();

  (items || []).forEach((item: any) => {
    if (!item || isNonGoods(item)) return;
    const qty = itemQty(item);
    if (qty <= 0) return;
    const cls = classifyItem(item);
    const g = groups.get(cls.key) || { cls, qty: 0, value: 0 };
    g.qty += qty;
    g.value += qty * itemUnitPrice(item);
    groups.set(cls.key, g);
  });

  if (groups.size === 0) {
    groups.set('tee', { cls: CLASSES.tee, qty: 1, value: 10 });
  }

  // When quoting one representative box of a multi-box order, declare only that box's share
  const split = Math.max(1, Math.floor(splitInto) || 1);
  if (split > 1) {
    groups.forEach(g => {
      g.qty = Math.max(1, Math.ceil(g.qty / split));
      g.value = g.value / split;
    });
  }

  // Customs weights must not exceed the actual parcel weight
  const rawLines = Array.from(groups.values()).map(g => ({ ...g, weight: g.qty * g.cls.unitWeightOz }));
  const rawTotal = rawLines.reduce((a, l) => a + l.weight, 0);
  const maxTotal = Math.max(0.1 * rawLines.length, (Number(parcelWeightOz) || rawTotal) * 0.95);
  const scale = rawTotal > maxTotal ? maxTotal / rawTotal : 1;

  const customs_items = rawLines.map(l => ({
    description: l.cls.description,
    code: l.cls.key.toUpperCase(),
    quantity: l.qty,
    value: Math.round(l.value * 100) / 100,
    currency: 'USD',
    weight: Math.max(0.1, Math.round(l.weight * scale * 10) / 10),
    hs_tariff_number: l.cls.hsTariff,
    origin_country: 'US',
  }));

  const overThreshold = customs_items.find(ci => ci.value > 2500);
  if (overThreshold) {
    throw new Error(`Declared value for "${overThreshold.description}" is $${overThreshold.value.toFixed(2)}, which exceeds $2,500 and requires an AES/EEI filing (ITN). File through AESDirect and create this label in the EasyPost dashboard, or split the shipment.`);
  }

  const signer = (fromAddress?.customsSigner || fromAddress?.contactName || fromAddress?.companyName || fromAddress?.company || 'INKTHEORY').toString().trim();

  return {
    contents_type: 'merchandise',
    contents_explanation: '',
    customs_certify: true,
    customs_signer: signer,
    non_delivery_option: 'return',
    restriction_type: 'none',
    restriction_comments: '',
    eel_pfc: 'NOEEI 30.37(a)',
    customs_items,
  };
}

/** Shipment options so duties & taxes are billed to the sender (DDP). */
export function ddpOptions() {
  return {
    incoterm: 'DDP',
    delivered_duty_paid: true,
  };
}

/** Validate the destination; returns an error message or null. */
export function validateToAddress(to: any): string | null {
  if (!to || !to.street1 || !to.city) return 'Incomplete destination address (street and city are required).';
  if (isInternationalAddress(to)) {
    return null;
  }
  if (!to.state || !to.zip) return 'Incomplete destination address (state and ZIP are required for US addresses).';
  return null;
}
