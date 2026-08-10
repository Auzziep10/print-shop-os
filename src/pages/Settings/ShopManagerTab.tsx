import { useEffect, useMemo, useRef, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../lib/firebase';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronUp,
  Edit2,
  ExternalLink,
  Eye,
  EyeOff,
  ImageIcon,
  Loader2,
  Package,
  Plus,
  Save,
  ShoppingBag,
  Trash2,
  Truck,
  Upload,
  X,
} from 'lucide-react';
import { tokens } from '../../lib/tokens';
import { PillButton } from '../../components/ui/PillButton';
import {
  DEFAULT_SHOP_SETTINGS,
  SHOP_ORDERS_COLLECTION,
  SHOP_PRODUCTS_COLLECTION,
  SHOP_SETTINGS_DOC,
  formatShopPrice,
  type ShopOrder,
  type ShopProduct,
  type ShopSettings,
} from '../Shop/shopTypes';

const SIZE_PRESETS: { label: string; sizes: string[] }[] = [
  { label: 'Tees (S–2XL)', sizes: ['S', 'M', 'L', 'XL', '2XL'] },
  { label: 'Extended (S–3XL)', sizes: ['S', 'M', 'L', 'XL', '2XL', '3XL'] },
  { label: 'One size', sizes: [] },
];

async function uploadShopImage(file: File, folder: string): Promise<string> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storageRef = ref(storage, `shop_media/${folder}/${Date.now()}_${safeName}`);
  const snap = await uploadBytes(storageRef, file);
  return getDownloadURL(snap.ref);
}

/* ================================================================== */
/* Product editor                                                     */
/* ================================================================== */

interface ProductDraft {
  name: string;
  colorway: string;
  description: string;
  price: string;
  images: string[];
  sizes: string[];
  category: string;
  active: boolean;
}

const EMPTY_DRAFT: ProductDraft = {
  name: '',
  colorway: '',
  description: '',
  price: '',
  images: [],
  sizes: ['S', 'M', 'L', 'XL', '2XL'],
  category: '',
  active: true,
};

function ProductEditor({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: ProductDraft;
  onSave: (draft: ProductDraft) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState<ProductDraft>(initial);
  const [sizeInput, setSizeInput] = useState(initial.sizes.join(', '));
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const set = (patch: Partial<ProductDraft>) => setDraft(d => ({ ...d, ...patch }));

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files)) {
        urls.push(await uploadShopImage(file, 'products'));
      }
      set({ images: [...draft.images, ...urls] });
    } catch (err) {
      console.error('Image upload failed:', err);
      alert('Image upload failed. Please try again.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const moveImage = (idx: number, dir: -1 | 1) => {
    const next = [...draft.images];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    set({ images: next });
  };

  const applySizes = (value: string) => {
    setSizeInput(value);
    set({ sizes: value.split(',').map(s => s.trim()).filter(Boolean) });
  };

  const canSave = draft.name.trim() && draft.price.trim() && !isNaN(parseFloat(draft.price));

  return (
    <div className="rounded-xl border border-brand-border bg-brand-bg/50 p-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className={tokens.typography.label}>Product name</label>
          <input
            className={tokens.components.input + ' mt-1.5 bg-white'}
            placeholder="FAJADA TEE"
            value={draft.name}
            onChange={e => set({ name: e.target.value })}
          />
        </div>
        <div>
          <label className={tokens.typography.label}>Colorway / subtitle</label>
          <input
            className={tokens.components.input + ' mt-1.5 bg-white'}
            placeholder="CHARCOAL + WHITE"
            value={draft.colorway}
            onChange={e => set({ colorway: e.target.value })}
          />
        </div>
        <div>
          <label className={tokens.typography.label}>Price (USD)</label>
          <input
            className={tokens.components.input + ' mt-1.5 bg-white'}
            placeholder="85"
            inputMode="decimal"
            value={draft.price}
            onChange={e => set({ price: e.target.value })}
          />
        </div>
        <div>
          <label className={tokens.typography.label}>Category (optional)</label>
          <input
            className={tokens.components.input + ' mt-1.5 bg-white'}
            placeholder="Tees, Hats…"
            value={draft.category}
            onChange={e => set({ category: e.target.value })}
          />
        </div>
        <div className="md:col-span-2">
          <label className={tokens.typography.label}>Description (optional)</label>
          <textarea
            className={tokens.components.input + ' mt-1.5 min-h-[80px] bg-white'}
            placeholder="Heavyweight garment-dyed tee with back print…"
            value={draft.description}
            onChange={e => set({ description: e.target.value })}
          />
        </div>
        <div className="md:col-span-2">
          <label className={tokens.typography.label}>Sizes (comma separated — leave empty for one-size)</label>
          <input
            className={tokens.components.input + ' mt-1.5 bg-white'}
            placeholder="S, M, L, XL, 2XL"
            value={sizeInput}
            onChange={e => applySizes(e.target.value)}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {SIZE_PRESETS.map(preset => (
              <button
                key={preset.label}
                onClick={() => applySizes(preset.sizes.join(', '))}
                className="rounded-full border border-brand-border px-3 py-1 text-xs text-brand-secondary transition-colors hover:border-brand-primary hover:text-brand-primary"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Images */}
        <div className="md:col-span-2">
          <label className={tokens.typography.label}>Images (first = grid image)</label>
          <div className="mt-2 flex flex-wrap gap-3">
            {draft.images.map((img, idx) => (
              <div key={img + idx} className="group relative h-28 w-24 overflow-hidden rounded-lg border border-brand-border bg-white">
                <img src={img} alt="" className="h-full w-full object-cover" />
                {idx === 0 && (
                  <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-white">
                    Main
                  </span>
                )}
                <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1 bg-black/60 py-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button onClick={() => moveImage(idx, -1)} className="text-white hover:text-emerald-300" title="Move left">
                    <ArrowUp size={12} className="-rotate-90" />
                  </button>
                  <button onClick={() => moveImage(idx, 1)} className="text-white hover:text-emerald-300" title="Move right">
                    <ArrowDown size={12} className="-rotate-90" />
                  </button>
                  <button
                    onClick={() => set({ images: draft.images.filter((_, i) => i !== idx) })}
                    className="text-white hover:text-red-300"
                    title="Remove"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex h-28 w-24 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-brand-border text-brand-secondary transition-colors hover:border-brand-primary hover:text-brand-primary disabled:opacity-50"
            >
              {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              <span className="text-[10px] font-medium">{uploading ? 'Uploading…' : 'Add images'}</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={e => handleFiles(e.target.files)}
            />
          </div>
        </div>

        <div className="flex items-center gap-3 md:col-span-2">
          <button
            onClick={() => set({ active: !draft.active })}
            className={`flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-medium transition-colors ${
              draft.active
                ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                : 'border-brand-border text-brand-secondary'
            }`}
          >
            {draft.active ? <Eye size={13} /> : <EyeOff size={13} />}
            {draft.active ? 'Live in store' : 'Hidden'}
          </button>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-end gap-3 border-t border-brand-border pt-4">
        <PillButton onClick={onCancel}>Cancel</PillButton>
        <PillButton variant="filled" disabled={!canSave || saving} onClick={() => onSave(draft)}>
          {saving ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Save size={14} className="mr-2" />}
          Save product
        </PillButton>
      </div>
    </div>
  );
}

/* ================================================================== */
/* Products section                                                   */
/* ================================================================== */

function ProductsSection() {
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null); // 'new' = adding
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, SHOP_PRODUCTS_COLLECTION), snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as ShopProduct));
      list.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));
      setProducts(list);
      setLoading(false);
    });
    return unsub;
  }, []);

  const saveProduct = async (draft: ProductDraft) => {
    setSaving(true);
    try {
      const payload = {
        name: draft.name.trim(),
        colorway: draft.colorway.trim(),
        description: draft.description.trim(),
        price: parseFloat(draft.price),
        images: draft.images,
        sizes: draft.sizes,
        category: draft.category.trim(),
        active: draft.active,
        updatedAt: Date.now(),
      };
      if (editingId && editingId !== 'new') {
        await updateDoc(doc(db, SHOP_PRODUCTS_COLLECTION, editingId), payload);
      } else {
        const maxSort = products.reduce((m, p) => Math.max(m, p.sortOrder ?? 0), 0);
        await addDoc(collection(db, SHOP_PRODUCTS_COLLECTION), {
          ...payload,
          sortOrder: maxSort + 1,
          createdAt: Date.now(),
        });
      }
      setEditingId(null);
    } catch (err) {
      console.error('Save product failed:', err);
      alert('Could not save product. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (p: ShopProduct) => {
    await updateDoc(doc(db, SHOP_PRODUCTS_COLLECTION, p.id), { active: !p.active, updatedAt: Date.now() });
  };

  const deleteProduct = async (p: ShopProduct) => {
    if (!confirm(`Delete "${p.name}"? This can't be undone.`)) return;
    await deleteDoc(doc(db, SHOP_PRODUCTS_COLLECTION, p.id));
  };

  const move = async (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= products.length) return;
    const a = products[idx];
    const b = products[target];
    // Swap sortOrders (normalize if they collide)
    const aSort = a.sortOrder ?? idx;
    const bSort = b.sortOrder ?? target;
    await Promise.all([
      updateDoc(doc(db, SHOP_PRODUCTS_COLLECTION, a.id), { sortOrder: aSort === bSort ? bSort - dir : bSort }),
      updateDoc(doc(db, SHOP_PRODUCTS_COLLECTION, b.id), { sortOrder: aSort }),
    ]);
  };

  const editingProduct = editingId && editingId !== 'new' ? products.find(p => p.id === editingId) : null;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className={tokens.typography.h3}>Products</h3>
          <p className={tokens.typography.bodyMuted}>
            {products.length} product{products.length === 1 ? '' : 's'} ·{' '}
            {products.filter(p => p.active).length} live
          </p>
        </div>
        {editingId === null && (
          <PillButton variant="filled" onClick={() => setEditingId('new')}>
            <Plus size={14} className="mr-2" /> Add product
          </PillButton>
        )}
      </div>

      {editingId === 'new' && (
        <div className="mb-6">
          <ProductEditor initial={EMPTY_DRAFT} onSave={saveProduct} onCancel={() => setEditingId(null)} saving={saving} />
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12 text-brand-secondary">
          <Loader2 className="animate-spin" size={20} />
        </div>
      ) : products.length === 0 && editingId !== 'new' ? (
        <div className="rounded-xl border border-dashed border-brand-border py-12 text-center text-sm text-brand-secondary">
          <Package size={22} className="mx-auto mb-2 opacity-50" />
          No products yet — add your first drop.
        </div>
      ) : (
        <div className="space-y-3">
          {products.map((p, idx) =>
            editingId === p.id && editingProduct ? (
              <ProductEditor
                key={p.id}
                initial={{
                  name: editingProduct.name,
                  colorway: editingProduct.colorway || '',
                  description: editingProduct.description || '',
                  price: String(editingProduct.price),
                  images: editingProduct.images || [],
                  sizes: editingProduct.sizes || [],
                  category: editingProduct.category || '',
                  active: editingProduct.active,
                }}
                onSave={saveProduct}
                onCancel={() => setEditingId(null)}
                saving={saving}
              />
            ) : (
              <div
                key={p.id}
                className={`flex items-center gap-4 rounded-xl border p-3 transition-colors ${
                  p.active ? 'border-brand-border bg-white' : 'border-brand-border bg-brand-bg/60 opacity-70'
                }`}
              >
                <div className="flex flex-col gap-0.5">
                  <button onClick={() => move(idx, -1)} disabled={idx === 0} className="text-brand-secondary hover:text-brand-primary disabled:opacity-25" title="Move up">
                    <ChevronUp size={14} />
                  </button>
                  <button onClick={() => move(idx, 1)} disabled={idx === products.length - 1} className="text-brand-secondary hover:text-brand-primary disabled:opacity-25" title="Move down">
                    <ChevronDown size={14} />
                  </button>
                </div>
                <div className="h-14 w-12 shrink-0 overflow-hidden rounded-md border border-brand-border bg-brand-bg">
                  {p.images?.[0] ? (
                    <img src={p.images[0]} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-brand-secondary">
                      <ImageIcon size={14} />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-brand-primary">{p.name}</div>
                  <div className="truncate text-xs text-brand-secondary">
                    {[p.colorway, p.sizes?.length ? p.sizes.join(' ') : 'One size'].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <div className="text-sm font-semibold text-brand-primary">{formatShopPrice(p.price)}</div>
                <button
                  onClick={() => toggleActive(p)}
                  className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                    p.active
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                      : 'border-brand-border text-brand-secondary hover:text-brand-primary'
                  }`}
                >
                  {p.active ? 'Live' : 'Hidden'}
                </button>
                <button onClick={() => setEditingId(p.id)} className="p-1.5 text-brand-secondary hover:text-brand-primary" title="Edit">
                  <Edit2 size={14} />
                </button>
                <button onClick={() => deleteProduct(p)} className="p-1.5 text-brand-secondary hover:text-red-600" title="Delete">
                  <Trash2 size={14} />
                </button>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/* Storefront settings section                                        */
/* ================================================================== */

function StorefrontSection() {
  const [settings, setSettings] = useState<ShopSettings>(DEFAULT_SHOP_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploadingField, setUploadingField] = useState<'hero' | 'footer' | null>(null);
  const heroInputRef = useRef<HTMLInputElement>(null);
  const footerInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', SHOP_SETTINGS_DOC), snap => {
      if (snap.exists()) {
        setSettings({ ...DEFAULT_SHOP_SETTINGS, ...(snap.data() as Partial<ShopSettings>) });
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const set = (patch: Partial<ShopSettings>) => {
    setSettings(s => ({ ...s, ...patch }));
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'settings', SHOP_SETTINGS_DOC), settings, { merge: true });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      console.error('Save shop settings failed:', err);
      alert('Could not save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleBannerUpload = async (field: 'hero' | 'footer', files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingField(field);
    try {
      const url = await uploadShopImage(files[0], 'banners');
      set(field === 'hero' ? { heroImageUrl: url } : { footerImageUrl: url });
    } catch (err) {
      console.error('Banner upload failed:', err);
      alert('Image upload failed. Please try again.');
    } finally {
      setUploadingField(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12 text-brand-secondary">
        <Loader2 className="animate-spin" size={20} />
      </div>
    );
  }

  const bannerTile = (field: 'hero' | 'footer', label: string, url?: string) => (
    <div>
      <label className={tokens.typography.label}>{label}</label>
      <div
        className="relative mt-2 flex h-36 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-dashed border-brand-border bg-brand-bg transition-colors hover:border-brand-primary"
        onClick={() => (field === 'hero' ? heroInputRef : footerInputRef).current?.click()}
      >
        {url ? (
          <>
            <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity hover:opacity-100">
              <span className="text-xs font-medium text-white">Replace image</span>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-1.5 text-brand-secondary">
            {uploadingField === field ? <Loader2 size={18} className="animate-spin" /> : <ImageIcon size={18} />}
            <span className="text-xs">{uploadingField === field ? 'Uploading…' : 'Click to upload'}</span>
          </div>
        )}
      </div>
      <input
        ref={field === 'hero' ? heroInputRef : footerInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => handleBannerUpload(field, e.target.files)}
      />
    </div>
  );

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h3 className={tokens.typography.h3}>Storefront</h3>
          <p className={tokens.typography.bodyMuted}>Branding, hero, and banner content for the shop page.</p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/shop"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-xs font-medium text-brand-secondary hover:text-brand-primary"
          >
            <ExternalLink size={13} /> View store
          </a>
          <PillButton variant="filled" onClick={save} disabled={saving}>
            {saving ? <Loader2 size={14} className="mr-2 animate-spin" /> : saved ? <Check size={14} className="mr-2" /> : <Save size={14} className="mr-2" />}
            {saved ? 'Saved' : 'Save changes'}
          </PillButton>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className={tokens.typography.label}>Top strip text</label>
          <input className={tokens.components.input + ' mt-1.5'} value={settings.topBanner} onChange={e => set({ topBanner: e.target.value })} />
        </div>
        <div>
          <label className={tokens.typography.label}>Brand line (above title)</label>
          <input className={tokens.components.input + ' mt-1.5'} value={settings.brandLine} onChange={e => set({ brandLine: e.target.value })} />
        </div>
        <div>
          <label className={tokens.typography.label}>Collection title</label>
          <input className={tokens.components.input + ' mt-1.5'} value={settings.collectionTitle} onChange={e => set({ collectionTitle: e.target.value })} />
        </div>
        <div>
          <label className={tokens.typography.label}>Collection subtitle</label>
          <input className={tokens.components.input + ' mt-1.5'} value={settings.collectionSubtitle} onChange={e => set({ collectionSubtitle: e.target.value })} />
        </div>
        <div>
          <label className={tokens.typography.label}>Footer script text</label>
          <input className={tokens.components.input + ' mt-1.5'} value={settings.footerScript} onChange={e => set({ footerScript: e.target.value })} />
        </div>
        <div>
          <label className={tokens.typography.label}>Footer vertical text</label>
          <input className={tokens.components.input + ' mt-1.5'} value={settings.footerVertical} onChange={e => set({ footerVertical: e.target.value })} />
        </div>
        <div className="md:col-span-2">
          <label className={tokens.typography.label}>Cart shipping note</label>
          <input className={tokens.components.input + ' mt-1.5'} value={settings.shippingNote || ''} onChange={e => set({ shippingNote: e.target.value })} />
        </div>
        <div>
          <label className={tokens.typography.label}>Flat shipping rate (USD)</label>
          <input
            className={tokens.components.input + ' mt-1.5'}
            inputMode="decimal"
            placeholder="0 = free shipping"
            value={String(settings.shippingFlatRate ?? 0)}
            onChange={e => set({ shippingFlatRate: Math.max(0, parseFloat(e.target.value) || 0) })}
          />
        </div>
        <div>
          <label className={tokens.typography.label}>Free shipping over (USD, 0 = off)</label>
          <input
            className={tokens.components.input + ' mt-1.5'}
            inputMode="decimal"
            placeholder="e.g. 100"
            value={String(settings.freeShippingOver ?? 0)}
            onChange={e => set({ freeShippingOver: Math.max(0, parseFloat(e.target.value) || 0) })}
          />
        </div>
        <div className="md:col-span-2">
          <button
            onClick={() => set({ collectTax: !(settings.collectTax !== false) })}
            className={`flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-medium transition-colors ${
              settings.collectTax !== false
                ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                : 'border-brand-border text-brand-secondary'
            }`}
          >
            <Check size={13} />
            {settings.collectTax !== false ? 'Sales tax collected at checkout (Stripe Tax)' : 'Sales tax NOT collected at checkout'}
          </button>
        </div>
        {bannerTile('hero', 'Hero image (wide, moody)', settings.heroImageUrl)}
        {bannerTile('footer', 'Footer banner image', settings.footerImageUrl)}
        <div className="md:col-span-2 flex items-center gap-3 border-t border-brand-border pt-4">
          <button
            onClick={() => set({ storeEnabled: !settings.storeEnabled })}
            className={`flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-medium transition-colors ${
              settings.storeEnabled
                ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                : 'border-amber-300 bg-amber-50 text-amber-700'
            }`}
          >
            {settings.storeEnabled ? <Eye size={13} /> : <EyeOff size={13} />}
            {settings.storeEnabled ? 'Store is open' : 'Store shows "Coming soon"'}
          </button>
          <span className="text-xs text-brand-secondary">Remember to hit Save after changing this.</span>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/* Orders section                                                     */
/* ================================================================== */

function OrdersSection() {
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'paid' | 'fulfilled' | 'pending'>('all');

  useEffect(() => {
    const unsub = onSnapshot(collection(db, SHOP_ORDERS_COLLECTION), snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as ShopOrder));
      list.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      setOrders(list);
      setLoading(false);
    });
    return unsub;
  }, []);

  const stats = useMemo(() => {
    const paidOrders = orders.filter(o => o.status === 'paid' || o.status === 'fulfilled');
    const revenue = paidOrders.reduce((sum, o) => sum + (o.amountTotal ?? o.subtotal ?? 0), 0);
    const units = paidOrders.reduce((sum, o) => sum + (o.items?.reduce((s, i) => s + i.qty, 0) ?? 0), 0);
    return {
      revenue,
      orderCount: paidOrders.length,
      units,
      awaiting: orders.filter(o => o.status === 'paid').length,
    };
  }, [orders]);

  const visible = useMemo(
    () => (filter === 'all' ? orders.filter(o => o.status !== 'pending' || Date.now() - o.createdAt < 24 * 3600e3) : orders.filter(o => o.status === filter)),
    [orders, filter]
  );

  const markFulfilled = async (o: ShopOrder) => {
    await updateDoc(doc(db, SHOP_ORDERS_COLLECTION, o.id), { status: 'fulfilled', fulfilledAt: Date.now() });
  };

  const deleteOrder = async (o: ShopOrder) => {
    if (!confirm('Delete this abandoned checkout record?')) return;
    await deleteDoc(doc(db, SHOP_ORDERS_COLLECTION, o.id));
  };

  const statusBadge = (status: ShopOrder['status']) => {
    const styles: Record<string, string> = {
      pending: 'bg-neutral-100 text-neutral-500 border-neutral-200',
      paid: 'bg-blue-50 text-blue-700 border-blue-200',
      fulfilled: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      cancelled: 'bg-red-50 text-red-600 border-red-200',
    };
    const labels: Record<string, string> = {
      pending: 'Abandoned / Pending',
      paid: 'Paid — to fulfill',
      fulfilled: 'Fulfilled',
      cancelled: 'Cancelled',
    };
    return (
      <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${styles[status]}`}>
        {labels[status]}
      </span>
    );
  };

  return (
    <div>
      <div className="mb-5">
        <h3 className={tokens.typography.h3}>Orders</h3>
        <p className={tokens.typography.bodyMuted}>Live purchase tracking from the brand shop.</p>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: 'Revenue', value: formatShopPrice(stats.revenue) },
          { label: 'Paid orders', value: String(stats.orderCount) },
          { label: 'Units sold', value: String(stats.units) },
          { label: 'To fulfill', value: String(stats.awaiting) },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-brand-border bg-brand-bg/50 px-4 py-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-brand-secondary">{s.label}</div>
            <div className="mt-1 font-serif text-2xl text-brand-primary">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="mb-4 flex gap-2">
        {(['all', 'paid', 'fulfilled', 'pending'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-medium capitalize transition-colors ${
              filter === f
                ? 'border-brand-primary bg-brand-primary text-white'
                : 'border-brand-border text-brand-secondary hover:text-brand-primary'
            }`}
          >
            {f === 'pending' ? 'Abandoned' : f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12 text-brand-secondary">
          <Loader2 className="animate-spin" size={20} />
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-brand-border py-12 text-center text-sm text-brand-secondary">
          <ShoppingBag size={22} className="mx-auto mb-2 opacity-50" />
          No orders here yet.
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map(o => {
            const expanded = expandedId === o.id;
            const itemCount = o.items?.reduce((s, i) => s + i.qty, 0) ?? 0;
            return (
              <div key={o.id} className="rounded-xl border border-brand-border bg-white">
                <button
                  onClick={() => setExpandedId(expanded ? null : o.id)}
                  className="flex w-full items-center gap-4 p-4 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-brand-primary">
                        #{o.id.slice(0, 8).toUpperCase()}
                      </span>
                      {statusBadge(o.status)}
                    </div>
                    <div className="mt-1 truncate text-xs text-brand-secondary">
                      {new Date(o.createdAt).toLocaleString()} · {itemCount} item{itemCount === 1 ? '' : 's'}
                      {o.customerName ? ` · ${o.customerName}` : ''}
                      {o.email ? ` · ${o.email}` : ''}
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-brand-primary">
                    {formatShopPrice(o.amountTotal ?? o.subtotal ?? 0)}
                  </div>
                  {expanded ? <ChevronUp size={16} className="text-brand-secondary" /> : <ChevronDown size={16} className="text-brand-secondary" />}
                </button>

                {expanded && (
                  <div className="border-t border-brand-border px-4 py-4">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div>
                        <div className={tokens.typography.label + ' mb-2'}>Items</div>
                        {o.items?.map((item, i) => (
                          <div key={i} className="flex items-baseline justify-between py-1 text-sm">
                            <span className="text-brand-primary">
                              {item.name}
                              {item.size ? ` · ${item.size}` : ''}{' '}
                              <span className="text-brand-secondary">× {item.qty}</span>
                            </span>
                            <span className="text-brand-secondary">{formatShopPrice(item.price * item.qty)}</span>
                          </div>
                        ))}
                      </div>
                      <div>
                        <div className={tokens.typography.label + ' mb-2'}>Shipping</div>
                        {o.shippingAddress ? (
                          <div className="text-sm leading-relaxed text-brand-primary">
                            {o.customerName && <div>{o.customerName}</div>}
                            <div>{o.shippingAddress.line1}</div>
                            {o.shippingAddress.line2 && <div>{o.shippingAddress.line2}</div>}
                            <div>
                              {[o.shippingAddress.city, o.shippingAddress.state, o.shippingAddress.postal_code]
                                .filter(Boolean)
                                .join(', ')}
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm text-brand-secondary">No address on file.</div>
                        )}
                        {o.stripeSessionId && (
                          <div className="mt-2 break-all font-mono text-[10px] text-brand-secondary">
                            {o.stripeSessionId}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="mt-4 flex justify-end gap-2 border-t border-brand-border pt-3">
                      {o.status === 'paid' && (
                        <PillButton variant="filled" onClick={() => markFulfilled(o)}>
                          <Truck size={14} className="mr-2" /> Mark fulfilled
                        </PillButton>
                      )}
                      {o.status === 'pending' && (
                        <PillButton onClick={() => deleteOrder(o)}>
                          <X size={14} className="mr-2" /> Delete record
                        </PillButton>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/* Tab shell                                                          */
/* ================================================================== */

export function ShopManagerTab() {
  const [section, setSection] = useState<'products' | 'storefront' | 'orders'>('products');

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {([
            { id: 'products', label: 'Products' },
            { id: 'storefront', label: 'Storefront' },
            { id: 'orders', label: 'Orders' },
          ] as const).map(t => (
            <button
              key={t.id}
              onClick={() => setSection(t.id)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                section === t.id
                  ? 'bg-brand-primary text-white'
                  : 'text-brand-secondary hover:bg-brand-bg hover:text-brand-primary'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <a
          href="/shop"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 text-xs font-medium text-brand-secondary hover:text-brand-primary"
        >
          <ExternalLink size={13} /> Open store
        </a>
      </div>

      {section === 'products' && <ProductsSection />}
      {section === 'storefront' && <StorefrontSection />}
      {section === 'orders' && <OrdersSection />}
    </div>
  );
}
