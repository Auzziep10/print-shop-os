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
  front: AxcImage | null;   // transparent cutout, hanger included, on the shared 920×2000 canvas
  back: AxcImage | null;    // optional; enables the flip control
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
    closeups: [],
    active: false,
    sortOrder,
  };
}
