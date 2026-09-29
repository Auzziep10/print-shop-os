import { useEffect, useRef, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../lib/firebase';
import {
  ArrowDown, ArrowUp, Edit2, ExternalLink, Eye, EyeOff, Loader2, Plus, Save, Trash2, Upload, X,
} from 'lucide-react';
import { tokens } from '../../lib/tokens';
import { PillButton } from '../../components/ui/PillButton';
import {
  AXC_GARMENTS_COLLECTION, AXC_LIVE_URL, AXC_STORAGE_FOLDER, emptyGarment,
  type AxcCloseup, type AxcGarment, type AxcImage, type AxcSpec,
} from './artistCollabTypes';

const ROOM_PREVIEW = '/artistxcollab/img/garments/room.webp';

function readImageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(url); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
    img.src = url;
  });
}

async function uploadAxcImage(file: File, folder: string): Promise<AxcImage> {
  const { width, height } = await readImageSize(file);
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${AXC_STORAGE_FOLDER}/${folder}/${Date.now()}_${safeName}`;
  const snap = await uploadBytes(ref(storage, path), file);
  const url = await getDownloadURL(snap.ref);
  return { url, width, height, path };
}

const newId = () => Math.random().toString(36).slice(2, 10);

/* ================================================================== */
/* Garment editor                                                      */
/* ================================================================== */

function GarmentEditor({
  initial, folderKey, onSave, onCancel, saving,
}: {
  initial: Omit<AxcGarment, 'id'>;
  folderKey: string;
  onSave: (g: Omit<AxcGarment, 'id'>) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [g, setG] = useState<Omit<AxcGarment, 'id'>>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const frontInput = useRef<HTMLInputElement>(null);
  const backInput = useRef<HTMLInputElement>(null);
  const closeupInput = useRef<HTMLInputElement>(null);

  const set = <K extends keyof Omit<AxcGarment, 'id'>>(k: K, v: Omit<AxcGarment, 'id'>[K]) => setG(prev => ({ ...prev, [k]: v }));

  const pickSide = async (side: 'front' | 'back', file: File | undefined) => {
    if (!file) return;
    setBusy(side); setError(null);
    try { set(side, await uploadAxcImage(file, `${folderKey}/${side}`)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Upload failed'); }
    finally { setBusy(null); }
  };

  const addCloseups = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setBusy('closeups'); setError(null);
    try {
      const added: AxcCloseup[] = [];
      for (const file of Array.from(files)) {
        const image = await uploadAxcImage(file, `${folderKey}/closeups`);
        added.push({ id: newId(), label: `Closeup ${g.closeups.length + added.length + 1}`, image });
      }
      set('closeups', [...g.closeups, ...added]);
    } catch (e) { setError(e instanceof Error ? e.message : 'Upload failed'); }
    finally { setBusy(null); if (closeupInput.current) closeupInput.current.value = ''; }
  };

  const updateCloseup = (id: string, patch: Partial<AxcCloseup>) =>
    set('closeups', g.closeups.map(c => (c.id === id ? { ...c, ...patch } : c)));
  const moveCloseup = (idx: number, dir: -1 | 1) => {
    const next = [...g.closeups]; const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    set('closeups', next);
  };
  const updateSpec = (idx: number, patch: Partial<AxcSpec>) => set('specs', g.specs.map((s, i) => (i === idx ? { ...s, ...patch } : s)));

  const canSave = g.name.trim().length > 0 && !!g.front && !busy;

  const SidePicker = ({ side, label }: { side: 'front' | 'back'; label: string }) => {
    const img = g[side];
    const input = side === 'front' ? frontInput : backInput;
    return (
      <div>
        <label className={tokens.typography.label}>{label}</label>
        <div className="mt-2 flex items-start gap-3">
          <div className="relative h-52 w-24 shrink-0 overflow-hidden rounded-lg border border-brand-border bg-[#a9a49d]"
               style={{ backgroundImage: `url(${ROOM_PREVIEW})`, backgroundSize: 'cover', backgroundPosition: 'center 30%' }}>
            {img ? <img src={img.url} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: 'center 30%' }} /> : null}
            {busy === side && <div className="absolute inset-0 grid place-items-center bg-black/40 text-white"><Loader2 size={16} className="animate-spin" /></div>}
          </div>
          <div className="flex flex-col gap-2">
            <button type="button" onClick={() => input.current?.click()} disabled={!!busy}
              className="inline-flex items-center gap-2 rounded-full border border-brand-border px-3 py-1.5 text-xs text-brand-primary transition-colors hover:border-brand-primary disabled:opacity-50">
              <Upload size={12} /> {img ? 'Replace' : 'Upload'} {label.toLowerCase()}
            </button>
            {img && (
              <>
                <span className="text-[11px] text-brand-secondary">{img.width}×{img.height}px</span>
                {side === 'back' && (
                  <button type="button" onClick={() => set('back', null)} className="text-left text-[11px] text-red-600 hover:underline">Remove back</button>
                )}
              </>
            )}
            <input ref={input} type="file" accept="image/png,image/webp" className="hidden"
                   onChange={e => pickSide(side, e.target.files?.[0])} />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-xl border border-brand-border bg-brand-bg/50 p-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className={tokens.typography.label}>Garment name</label>
          <input className={tokens.components.input + ' mt-1.5 bg-white'} value={g.name} onChange={e => set('name', e.target.value)} placeholder="Saints After Dark Tee" />
        </div>
        <div>
          <label className={tokens.typography.label}>Artist / collaborator</label>
          <input className={tokens.components.input + ' mt-1.5 bg-white'} value={g.artist} onChange={e => set('artist', e.target.value)} placeholder="SantosBravos" />
        </div>
        <div className="md:col-span-2">
          <label className={tokens.typography.label}>Story (shown in the swipe-up sheet)</label>
          <textarea className={tokens.components.input + ' mt-1.5 min-h-[80px] bg-white'} value={g.story} onChange={e => set('story', e.target.value)} />
        </div>

        <SidePicker side="front" label="Front" />
        <SidePicker side="back" label="Back (optional — enables the flip)" />

        <div className="md:col-span-2">
          <label className={tokens.typography.label}>Garment makeup</label>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {g.specs.map((s, i) => (
              <div key={i} className="flex gap-2">
                <input className={tokens.components.input + ' w-2/5 bg-white'} value={s.label} onChange={e => updateSpec(i, { label: e.target.value })} placeholder="Fabric" />
                <input className={tokens.components.input + ' flex-1 bg-white'} value={s.value} onChange={e => updateSpec(i, { value: e.target.value })} placeholder="6.5 oz organic cotton" />
                <button type="button" onClick={() => set('specs', g.specs.filter((_, j) => j !== i))} className="text-brand-secondary hover:text-red-600" title="Remove"><X size={14} /></button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => set('specs', [...g.specs, { label: '', value: '' }])}
            className="mt-2 inline-flex items-center gap-1 text-xs text-brand-secondary hover:text-brand-primary"><Plus size={12} /> Add row</button>
        </div>

        <div className="md:col-span-2">
          <label className={tokens.typography.label}>Closeups (buttons down the right side, in this order)</label>
          <div className="mt-2 space-y-2">
            {g.closeups.map((c, i) => (
              <div key={c.id} className="flex items-center gap-3 rounded-lg border border-brand-border bg-white p-2">
                <img src={c.image.url} alt="" className="h-14 w-11 shrink-0 rounded object-cover" />
                <input className={tokens.components.input + ' flex-1 bg-white py-2'} value={c.label} onChange={e => updateCloseup(c.id, { label: e.target.value })} placeholder="ART 1" />
                <span className="hidden text-[11px] text-brand-secondary sm:block">{c.image.width}×{c.image.height}</span>
                <button type="button" onClick={() => moveCloseup(i, -1)} className="text-brand-secondary hover:text-brand-primary" title="Move up"><ArrowUp size={14} /></button>
                <button type="button" onClick={() => moveCloseup(i, 1)} className="text-brand-secondary hover:text-brand-primary" title="Move down"><ArrowDown size={14} /></button>
                <button type="button" onClick={() => set('closeups', g.closeups.filter(x => x.id !== c.id))} className="text-brand-secondary hover:text-red-600" title="Remove"><Trash2 size={14} /></button>
              </div>
            ))}
            <button type="button" onClick={() => closeupInput.current?.click()} disabled={!!busy}
              className="inline-flex items-center gap-2 rounded-lg border border-dashed border-brand-border px-4 py-3 text-xs text-brand-secondary transition-colors hover:border-brand-primary hover:text-brand-primary disabled:opacity-50">
              {busy === 'closeups' ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {busy === 'closeups' ? 'Uploading…' : 'Add closeup images (you can select several)'}
            </button>
            <input ref={closeupInput} type="file" accept="image/*" multiple className="hidden" onChange={e => addCloseups(e.target.files)} />
          </div>
        </div>

        <label className="flex items-center gap-3 md:col-span-2">
          <input type="checkbox" checked={g.active} onChange={e => set('active', e.target.checked)} className="h-4 w-4" />
          <span className="text-sm text-brand-primary">Visible in the collection</span>
        </label>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-5 flex items-center justify-end gap-3 border-t border-brand-border pt-4">
        <PillButton type="button" onClick={onCancel}>Cancel</PillButton>
        <PillButton type="button" variant="filled" disabled={!canSave || saving} onClick={() => onSave(g)}>
          {saving ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Save size={14} className="mr-2" />}
          Save garment
        </PillButton>
      </div>
      {!g.front && <p className="mt-2 text-right text-[11px] text-brand-secondary">A front image is required before saving.</p>}
    </div>
  );
}

/* ================================================================== */
/* Tab                                                                 */
/* ================================================================== */

export function ArtistCollabTab() {
  const [garments, setGarments] = useState<AxcGarment[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);   // 'new' for a fresh garment
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, AXC_GARMENTS_COLLECTION), snap => {
      const rows = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<AxcGarment, 'id'>) }));
      rows.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      setGarments(rows);
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);

  const save = async (payload: Omit<AxcGarment, 'id'>) => {
    setSaving(true);
    try {
      if (editingId && editingId !== 'new') {
        await updateDoc(doc(db, AXC_GARMENTS_COLLECTION, editingId), { ...payload, updatedAt: Date.now() });
      } else {
        await addDoc(collection(db, AXC_GARMENTS_COLLECTION), { ...payload, createdAt: Date.now(), updatedAt: Date.now() });
      }
      setEditingId(null);
    } finally { setSaving(false); }
  };

  const toggleActive = (g: AxcGarment) => updateDoc(doc(db, AXC_GARMENTS_COLLECTION, g.id), { active: !g.active, updatedAt: Date.now() });
  const remove = async (g: AxcGarment) => {
    if (!window.confirm(`Delete "${g.name || 'this garment'}" from the collection?`)) return;
    await deleteDoc(doc(db, AXC_GARMENTS_COLLECTION, g.id));
  };
  const move = async (idx: number, dir: -1 | 1) => {
    const j = idx + dir; if (j < 0 || j >= garments.length) return;
    const a = garments[idx], b = garments[j];
    await Promise.all([
      updateDoc(doc(db, AXC_GARMENTS_COLLECTION, a.id), { sortOrder: j }),
      updateDoc(doc(db, AXC_GARMENTS_COLLECTION, b.id), { sortOrder: idx }),
    ]);
  };

  const editing = editingId === 'new' ? null : garments.find(g => g.id === editingId) || null;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className={tokens.typography.h3}>Artist×Collab garments</h3>
          <p className={tokens.typography.bodyMuted}>What hangs on the rail at the end of the Artist×Collab story. Changes go live immediately.</p>
        </div>
        <div className="flex items-center gap-2">
          <a href={AXC_LIVE_URL} target="_blank" rel="noreferrer"
             className="inline-flex items-center gap-1.5 rounded-full border border-brand-border px-4 py-2 text-xs text-brand-primary transition-colors hover:border-brand-primary">
            <ExternalLink size={12} /> View live
          </a>
          <PillButton variant="filled" onClick={() => setEditingId('new')} disabled={editingId === 'new'}>
            <Plus size={14} className="mr-2" /> Add garment
          </PillButton>
        </div>
      </div>

      <div className="mb-5 rounded-lg border border-brand-border bg-brand-bg/60 px-4 py-3 text-xs text-brand-secondary">
        <span className="font-semibold text-brand-primary">Asset specs.</span> Front and back: PNG or WebP with a transparent background on a 920×2000 canvas,
        hanger included, hook at the same height on every garment (about a third of the way down) so they hang level on the rail.
        Closeups: portrait photos, 920×2000 recommended. The room itself stays fixed.
      </div>

      {editingId === 'new' && (
        <div className="mb-6">
          <GarmentEditor initial={emptyGarment(garments.length)} folderKey={`new_${Date.now()}`} onSave={save} onCancel={() => setEditingId(null)} saving={saving} />
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12 text-brand-secondary"><Loader2 className="animate-spin" size={20} /></div>
      ) : garments.length === 0 && editingId !== 'new' ? (
        <div className="rounded-xl border border-dashed border-brand-border py-12 text-center text-sm text-brand-secondary">
          No garments yet. Add the first one and it will appear on the rail.
        </div>
      ) : (
        <div className="space-y-3">
          {garments.map((g, idx) => (
            <div key={g.id}>
              <div className={`flex items-center gap-4 rounded-xl border bg-white p-3 ${g.active ? 'border-brand-border' : 'border-dashed border-brand-border opacity-70'}`}>
                <div className="h-20 w-10 shrink-0 overflow-hidden rounded bg-[#a9a49d]"
                     style={{ backgroundImage: `url(${ROOM_PREVIEW})`, backgroundSize: 'cover', backgroundPosition: 'center 30%' }}>
                  {g.front && <img src={g.front.url} alt="" className="h-full w-full object-cover" style={{ objectPosition: 'center 30%' }} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-brand-primary">{g.name || 'Untitled garment'}</div>
                  <div className="truncate text-xs text-brand-secondary">
                    {g.artist || '—'} · {g.closeups?.length || 0} closeup{(g.closeups?.length || 0) === 1 ? '' : 's'}{g.back ? ' · front + back' : ' · front only'}
                    {!g.active && ' · hidden'}
                  </div>
                </div>
                <div className="flex items-center gap-1 text-brand-secondary">
                  <button onClick={() => move(idx, -1)} disabled={idx === 0} className="rounded p-1.5 hover:bg-brand-bg hover:text-brand-primary disabled:opacity-30" title="Move up"><ArrowUp size={14} /></button>
                  <button onClick={() => move(idx, 1)} disabled={idx === garments.length - 1} className="rounded p-1.5 hover:bg-brand-bg hover:text-brand-primary disabled:opacity-30" title="Move down"><ArrowDown size={14} /></button>
                  <button onClick={() => toggleActive(g)} className="rounded p-1.5 hover:bg-brand-bg hover:text-brand-primary" title={g.active ? 'Hide' : 'Show'}>{g.active ? <Eye size={14} /> : <EyeOff size={14} />}</button>
                  <button onClick={() => setEditingId(editingId === g.id ? null : g.id)} className="rounded p-1.5 hover:bg-brand-bg hover:text-brand-primary" title="Edit"><Edit2 size={14} /></button>
                  <button onClick={() => remove(g)} className="rounded p-1.5 hover:bg-red-50 hover:text-red-600" title="Delete"><Trash2 size={14} /></button>
                </div>
              </div>
              {editing && editing.id === g.id && (
                <div className="mt-2">
                  <GarmentEditor initial={{ ...editing }} folderKey={g.id} onSave={save} onCancel={() => setEditingId(null)} saving={saving} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
