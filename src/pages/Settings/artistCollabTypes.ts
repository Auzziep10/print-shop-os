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
export interface AxcNeck {
  cx: number;   // centre x (0..1 of image width)
  cy: number;   // centre y (0..1 of image height)
  rx: number;   // half width (fraction of image width)
  ry: number;   // half height (fraction of image height)
}
export const DEFAULT_NECK: AxcNeck = { cx: 0.5, cy: 0.05, rx: 0.085, ry: 0.03 };

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
  neck?: AxcNeck | null;           // optional collar hole; when set the hanger is drawn through it   // 'garment' (default) = tight cutout; 'canvas' = legacy full 920×2000 plate with hanger baked in
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
    closeups: [],
    active: false,
    sortOrder,
  };
}
