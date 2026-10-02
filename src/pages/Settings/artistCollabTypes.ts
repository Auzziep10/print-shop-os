// Artist×Collab — garment collection shown at /artistxcollab/c/collection.
// Own Firestore collection + Storage folder; nothing shared with Brand Shop.

export const AXC_GARMENTS_COLLECTION = 'axc_garments';
export const AXC_STORAGE_FOLDER = 'axc_media';
export const AXC_LIVE_URL = '/artistxcollab/c/collection';

export interface AxcImage {
  url: string;
  width: number;
  height: number;
  path: string;     // storage path, kept so the file can be cleaned up later
}

export interface AxcCloseup {
  id: string;
  label: string;    // shown under the button: "ART 1", "FABRIC", "NECK" …
  image: AxcImage;
}

/** Collar hole on the FRONT image, as fractions of its width/height: the viewer shows the hanger through it. */
export type AxcNeckShape = 'oval' | 'crew' | 'square' | 'v';
export interface AxcNeck {
  cx: number;   // centre x (0..1 of image width)
  cy: number;   // centre y (0..1 of image height)
  rx: number;   // half width (fraction of image width)
  ry: number;   // half height (fraction of image height)
  shape?: AxcNeckShape;   // outline of the opening (default oval)
  color?: string;         // shade colour inside the opening, hex (default #000000)
  strength?: number;      // shade opacity 0..1 (default 0.26)
}
/** How the garment sits on the hanger: vertical shift (fraction of garment width), garment scale, hanger scale. */
export interface AxcHang {
  dy: number;
  scale: number;
  hangerScale: number;
}
export const DEFAULT_HANG: AxcHang = { dy: 0, scale: 1, hangerScale: 1 };

export const DEFAULT_NECK: AxcNeck = { cx: 0.5, cy: 0.05, rx: 0.085, ry: 0.03, shape: 'oval', color: '#000000', strength: 0.26 };

/** Outline of the neck opening as an SVG path in pixels, for a w×h box. Kept identical in the viewer (collection.js). */
export function neckPath(shape: AxcNeckShape | undefined, w: number, h: number): string {
  const k = 0.5523;
  switch (shape) {
    case 'crew': {
      const t = h * 0.42;
      return `M0 ${t} C0 ${t * 0.3} ${w * 0.22} 0 ${w / 2} 0 C${w * 0.78} 0 ${w} ${t * 0.3} ${w} ${t} C${w} ${h * 0.82} ${w * 0.76} ${h} ${w / 2} ${h} C${w * 0.24} ${h} 0 ${h * 0.82} 0 ${t} Z`;
    }
    case 'square': {
      const r = Math.min(w, h) * 0.38;
      return `M${r} 0 H${w - r} C${w - r + r * k} 0 ${w} ${r - r * k} ${w} ${r} V${h - r} C${w} ${h - r + r * k} ${w - r + r * k} ${h} ${w - r} ${h} H${r} C${r - r * k} ${h} 0 ${h - r + r * k} 0 ${h - r} V${r} C0 ${r - r * k} ${r - r * k} 0 ${r} 0 Z`;
    }
    case 'v': {
      const r = w * 0.06;
      return `M0 0 H${w} L${w / 2 + r} ${h - r * 0.6} Q${w / 2} ${h + r * 0.4} ${w / 2 - r} ${h - r * 0.6} Z`;
    }
    default: {
      const rx = w / 2, ry = h / 2;
      return `M${rx} 0 C${rx + rx * k} 0 ${w} ${ry - ry * k} ${w} ${ry} C${w} ${ry + ry * k} ${rx + rx * k} ${h} ${rx} ${h} C${rx - rx * k} ${h} 0 ${ry + ry * k} 0 ${ry} C0 ${ry - ry * k} ${rx - rx * k} 0 ${rx} 0 Z`;
    }
  }
}

export interface AxcSpec {
  label: string;
  value: string;
}

export interface AxcGarment {
  id: string;
  name: string;
  artist: string;
  story: string;
  specs: AxcSpec[];
  front: AxcImage | null;   // the garment only: tight transparent cutout, no hanger (the viewer sizes and hangs it)
  back: AxcImage | null;    // optional, same crop as the front; enables the flip control
  layout?: 'garment' | 'canvas';
  neck?: AxcNeck | null;           // optional collar hole; when set the hanger is drawn through it
  hang?: AxcHang | null;           // optional manual hanging adjustments (front)
  neckBack?: AxcNeck | null;       // collar opening on the BACK image
  hangBack?: AxcHang | null;       // hanging adjustments for the back (falls back to the front's)   // 'garment' (default) = tight cutout; 'canvas' = legacy full 920×2000 plate with hanger baked in
  closeups: AxcCloseup[];
  active: boolean;
  sortOrder: number;
  createdAt?: number;
  updatedAt?: number;
}

export const DEFAULT_SPECS: AxcSpec[] = [
  { label: 'Fabric', value: '' },
  { label: 'Fit', value: '' },
  { label: 'Wash', value: '' },
  { label: 'Decoration', value: '' },
  { label: 'Made in', value: '' },
  { label: 'Care', value: '' },
];

export function emptyGarment(sortOrder: number): Omit<AxcGarment, 'id'> {
  return {
    name: '',
    artist: '',
    story: '',
    specs: DEFAULT_SPECS.map(s => ({ ...s })),
    front: null,
    back: null,
    layout: 'garment',
    neck: null,
    hang: null,
    neckBack: null,
    hangBack: null,
    closeups: [],
    active: false,
    sortOrder,
  };
}
