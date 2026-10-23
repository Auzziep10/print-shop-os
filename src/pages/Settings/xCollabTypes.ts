// xCollab — the COLLAB model page at /xcollab/<token>. Separate from Artist×Collab:
// own Firestore collections + Storage folder, nothing shared with axc_garments.
//
// Privacy: each share link is one xc_links doc holding a SNAPSHOT of only the models picked for that customer.
// The public page reads just that doc by its unguessable id; xc_models itself is staff-only, so a customer can
// never list or open models that weren't put in their link.

export const XC_MODELS_COLLECTION = 'xc_models';
export const XC_LINKS_COLLECTION = 'xc_links';
export const XC_STORAGE_FOLDER = 'xc_media';
export const XC_PATH = '/xcollab';

export interface XcImage {
  url: string;
  width: number;
  height: number;
  path: string;     // storage path, kept so the file can be cleaned up later
  anchor?: { cx: number; bottom: number; top: number };   // where the SOLID figure sits (fractions): head and feet line up across models
}

export interface XcModel {
  id: string;
  name: string;     // look / design name, shown bottom right
  artist: string;
  image: XcImage | null;   // full-length model cutout on a transparent background
  sortOrder: number;
  createdAt?: number;
  updatedAt?: number;
}

/** What the public page gets for each model: no storage paths, nothing else. */
export interface XcLinkModel {
  id: string;
  name: string;
  artist: string;
  image: { url: string; width: number; height: number; anchor?: XcImage['anchor'] };
}

export interface XcLink {
  id: string;
  customer: string;     // who the link is for; shown top right unless artistLine is set
  lede?: string;        // optional replacement for the bottom-left paragraph
  artistLine?: string;  // top-right "Artist:" line on the page, e.g. "INCOLOR • BigLoudRock" (blank = customer)
  autoplay?: number;    // seconds before the page moves to the next model on its own (0 / missing = off)
  modelIds: string[];
  models: XcLinkModel[];
  active: boolean;
  createdAt?: number;
  updatedAt?: number;
}

/** Public link for a share doc. Local dev builds hand out the production domain. */
export function xcShareUrl(linkId: string): string {
  const origin = window.location.hostname === 'localhost' ? 'https://www.inktheory.studio' : window.location.origin;
  return `${origin}${XC_PATH}/${linkId}`;
}

/** Snapshot the chosen models (in library order) for a link doc. */
export function snapshotModels(ids: string[], library: XcModel[]): XcLinkModel[] {
  const want = new Set(ids);
  return library
    .filter(m => want.has(m.id) && m.image)
    .map(m => ({
      id: m.id,
      name: m.name || '',
      artist: m.artist || '',
      image: { url: m.image!.url, width: m.image!.width, height: m.image!.height, ...(m.image!.anchor ? { anchor: m.image!.anchor } : {}) },
    }));
}
