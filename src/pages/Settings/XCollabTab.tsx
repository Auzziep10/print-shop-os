import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, updateDoc, writeBatch } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../lib/firebase';
import {
  ArrowDown, ArrowUp, Check, Copy, Edit2, ExternalLink, Link2, Loader2, Pause, Play, Plus, Save, Trash2, Upload, X,
} from 'lucide-react';
import { tokens } from '../../lib/tokens';
import { PillButton } from '../../components/ui/PillButton';
import {
  XC_LINKS_COLLECTION, XC_MODELS_COLLECTION, XC_STORAGE_FOLDER, snapshotModels, xcShareUrl,
  type XcImage, type XcLink, type XcModel,
} from './xCollabTypes';

const TILE = 'bg-[#f7f7f8]';
const MAX_EDGE = 2400;   // full-length models are tall; 2400px on the long side stays sharp on a 4K screen

/**
 * Model cutout: scale down, confirm it has a transparent background, scrub near-transparent haze,
 * crop to the figure and measure where the solid figure sits so every model stands on the same floor line.
 */
async function prepareModel(file: File): Promise<{ file: File; anchor: { cx: number; top: number; bottom: number } }> {
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error('Could not read this image. Use a PNG or WebP with the background removed.'); }
  const k = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * k)), h = Math.max(1, Math.round(bitmap.height * k));
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h); bitmap.close();
  const data = ctx.getImageData(0, 0, w, h), px = data.data;
  let minX = w, minY = h, maxX = -1, maxY = -1, transparent = 0;
  let sMinX = w, sMinY = h, sMaxX = -1, sMaxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4 + 3;
      if (px[i] <= 24) { transparent++; px[i] = 0; continue; }
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (px[i] > 160) { if (x < sMinX) sMinX = x; if (x > sMaxX) sMaxX = x; if (y < sMinY) sMinY = y; if (y > sMaxY) sMaxY = y; }
    }
  }
  if (transparent < w * h * 0.02) throw new Error('This image has no transparent background, so the model would stand in a box. Export the model as a PNG or WebP with the background removed (not white).');
  if (maxX < 0) throw new Error('This image is fully transparent.');
  ctx.putImageData(data, 0, 0);
  const pad = 2;
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad); maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad);
  const cw = maxX - minX + 1, ch = maxY - minY + 1;
  const out = document.createElement('canvas'); out.width = cw; out.height = ch;
  out.getContext('2d')!.drawImage(canvas, minX, minY, cw, ch, 0, 0, cw, ch);
  const blob = await new Promise<Blob | null>(resolve => out.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Could not encode the image.');
  if (sMaxX < 0) { sMinX = minX; sMinY = minY; sMaxX = maxX; sMaxY = maxY; }
  const anchor = { cx: ((sMinX + sMaxX) / 2 - minX) / cw, top: (sMinY - minY) / ch, bottom: (sMaxY + 1 - minY) / ch };
  return { file: new File([blob], file.name.replace(/\.[a-z0-9]+$/i, '') + '.png', { type: 'image/png' }), anchor };
}

function uploadXcImage(file: File, folder: string, onProgress?: (pct: number) => void): Promise<XcImage> {
  return new Promise<XcImage>((resolve, reject) => {
    const path = `${XC_STORAGE_FOLDER}/${folder}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const task = uploadBytesResumable(ref(storage, path), file, { contentType: file.type, cacheControl: 'public,max-age=31536000,immutable' });
    task.on('state_changed',
      snap => onProgress?.(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      err => {
        const code = (err as { code?: string }).code || '';
        reject(new Error(code === 'storage/unauthorized' ? 'Upload refused: check the Storage rules for xc_media.' : `Upload failed (${code || err.message}).`));
      },
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          const b = await createImageBitmap(file); const size = { width: b.width, height: b.height }; b.close();
          resolve({ url, path, ...size });
        } catch (e) { reject(e instanceof Error ? e : new Error('Upload finished but the file could not be read back.')); }
      });
  });
}

/* ================================================================== */
/* Model editor                                                        */
/* ================================================================== */

function ModelEditor({ initial, folderKey, saving, onSave, onCancel }: {
  initial: Omit<XcModel, 'id'>; folderKey: string; saving: boolean;
  onSave: (m: Omit<XcModel, 'id'>) => void; onCancel: () => void;
}) {
  const [m, setM] = useState(initial);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(''); setProgress(0);
    try {
      const prepared = await prepareModel(file);
      const img = await uploadXcImage(prepared.file, folderKey, setProgress);
      setM(prev => ({ ...prev, image: { ...img, anchor: prepared.anchor } }));
    } catch (e) { setError(e instanceof Error ? e.message : 'Upload failed.'); }
    finally { setProgress(null); }
  };

  return (
    <div className="rounded-xl border border-brand-border bg-brand-bg/50 p-5">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-[180px_1fr]">
        <label className={`relative grid aspect-[3/4] cursor-pointer place-items-center overflow-hidden rounded-lg border border-dashed border-brand-border ${TILE}`}>
          {m.image ? <img src={m.image.url} alt="" className="h-full w-full object-contain p-2" /> : (
            <span className="flex flex-col items-center gap-1 text-xs text-brand-secondary"><Upload size={16} />Model cutout</span>
          )}
          {progress !== null && <span className="absolute inset-0 grid place-items-center bg-white/70 text-xs text-brand-primary"><Loader2 className="mb-1 animate-spin" size={16} />{progress}%</span>}
          <input type="file" accept="image/png,image/webp" className="hidden" onChange={e => { pick(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        <div className="space-y-4">
          <div>
            <label className={tokens.typography.label}>Look / design name</label>
            <input className={tokens.components.input + ' mt-1.5 bg-white'} value={m.name} onChange={e => setM({ ...m, name: e.target.value })} placeholder="Look 01 — Washed denim set" />
          </div>
          <div>
            <label className={tokens.typography.label}>Artist</label>
            <input className={tokens.components.input + ' mt-1.5 bg-white'} value={m.artist} onChange={e => setM({ ...m, artist: e.target.value })} placeholder="SantosBravos" />
          </div>
          <p className="text-[11px] text-brand-secondary">Full-length model, head to shoes, on a transparent background (PNG or WebP). Empty margin is trimmed on upload and every model is sized so heads and feet line up on the page.</p>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <PillButton type="button" onClick={onCancel}>Cancel</PillButton>
        <PillButton type="button" variant="filled" disabled={!m.image || saving || progress !== null} onClick={() => onSave(m)}>
          {saving ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Save size={14} className="mr-2" />} Save model
        </PillButton>
      </div>
    </div>
  );
}

/* ================================================================== */
/* Tab                                                                 */
/* ================================================================== */

export function XCollabTab() {
  const [models, setModels] = useState<XcModel[]>([]);
  const [links, setLinks] = useState<XcLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);   // 'new' for a fresh model
  const [saving, setSaving] = useState(false);
  // the toggles: which models go into the link being made (or edited)
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingLink, setEditingLink] = useState<XcLink | null>(null);
  const [customer, setCustomer] = useState('');
  const [lede, setLede] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [linkError, setLinkError] = useState('');

  useEffect(() => {
    const u1 = onSnapshot(collection(db, XC_MODELS_COLLECTION), snap => {
      const rows = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<XcModel, 'id'>) }));
      rows.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      setModels(rows); setLoading(false);
    }, () => setLoading(false));
    const u2 = onSnapshot(collection(db, XC_LINKS_COLLECTION), snap => {
      const rows = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<XcLink, 'id'>) }));
      rows.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      setLinks(rows);
    });
    return () => { u1(); u2(); };
  }, []);

  const linksFor = (id: string) => links.filter(l => (l.modelIds || []).includes(id));

  /** Re-snapshot every link that contains one of these models, so edits show up on links already sent. */
  const resyncLinks = async (library: XcModel[], touched: string[]) => {
    const hit = links.filter(l => (l.modelIds || []).some(id => touched.includes(id)));
    if (!hit.length) return;
    const batch = writeBatch(db);
    hit.forEach(l => {
      const ids = l.modelIds.filter(id => library.some(m => m.id === id));
      batch.update(doc(db, XC_LINKS_COLLECTION, l.id), { modelIds: ids, models: snapshotModels(ids, library), updatedAt: Date.now() });
    });
    await batch.commit();
  };

  const saveModel = async (payload: Omit<XcModel, 'id'>) => {
    setSaving(true);
    try {
      if (editingId && editingId !== 'new') {
        await updateDoc(doc(db, XC_MODELS_COLLECTION, editingId), { ...payload, updatedAt: Date.now() });
        await resyncLinks(models.map(m => m.id === editingId ? { ...m, ...payload } : m), [editingId]);
      } else {
        await addDoc(collection(db, XC_MODELS_COLLECTION), { ...payload, createdAt: Date.now(), updatedAt: Date.now() });
      }
      setEditingId(null);
    } finally { setSaving(false); }
  };

  const removeModel = async (m: XcModel) => {
    const used = linksFor(m.id);
    const msg = used.length
      ? `Delete "${m.name || 'this model'}"? It will also be removed from ${used.length} share link${used.length === 1 ? '' : 's'} (${used.map(l => l.customer || 'untitled').join(', ')}).`
      : `Delete "${m.name || 'this model'}"?`;
    if (!window.confirm(msg)) return;
    await deleteDoc(doc(db, XC_MODELS_COLLECTION, m.id));
    await resyncLinks(models.filter(x => x.id !== m.id), [m.id]);
    setSelected(s => { const n = new Set(s); n.delete(m.id); return n; });
  };

  const move = async (idx: number, dir: -1 | 1) => {
    const j = idx + dir; if (j < 0 || j >= models.length) return;
    const a = models[idx], b = models[j];
    await Promise.all([
      updateDoc(doc(db, XC_MODELS_COLLECTION, a.id), { sortOrder: j }),
      updateDoc(doc(db, XC_MODELS_COLLECTION, b.id), { sortOrder: idx }),
    ]);
  };

  const toggle = (id: string) => setSelected(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selectedIds = useMemo(() => models.filter(m => selected.has(m.id)).map(m => m.id), [models, selected]);

  const resetLinkForm = () => { setEditingLink(null); setSelected(new Set()); setCustomer(''); setLede(''); setLinkError(''); };

  const saveLink = async () => {
    setLinkError('');
    if (!customer.trim()) { setLinkError('Name the customer so you can tell the links apart.'); return; }
    if (!selectedIds.length) { setLinkError('Toggle on at least one model.'); return; }
    const payload = { customer: customer.trim(), lede: lede.trim(), modelIds: selectedIds, models: snapshotModels(selectedIds, models), updatedAt: Date.now() };
    try {
      if (editingLink) {
        await updateDoc(doc(db, XC_LINKS_COLLECTION, editingLink.id), payload);
        copy(editingLink.id);
      } else {
        // the auto id (20 random chars) IS the share token
        const r = await addDoc(collection(db, XC_LINKS_COLLECTION), { ...payload, active: true, createdAt: Date.now() });
        copy(r.id);
      }
      resetLinkForm();
    } catch (e) {
      setLinkError(e instanceof Error ? e.message : 'Could not save the link. Check the Firestore rules for xc_links.');
    }
  };

  const editLink = (l: XcLink) => {
    setEditingLink(l); setCustomer(l.customer || ''); setLede(l.lede || ''); setSelected(new Set(l.modelIds || [])); setLinkError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const toggleLink = (l: XcLink) => updateDoc(doc(db, XC_LINKS_COLLECTION, l.id), { active: !l.active, updatedAt: Date.now() });
  const removeLink = async (l: XcLink) => {
    if (!window.confirm(`Delete the link for "${l.customer}"? Anyone who has it will see "link isn't active".`)) return;
    await deleteDoc(doc(db, XC_LINKS_COLLECTION, l.id));
    if (editingLink?.id === l.id) resetLinkForm();
  };
  const copy = (id: string) => {
    navigator.clipboard?.writeText(xcShareUrl(id)).catch(() => {});
    setCopied(id); setTimeout(() => setCopied(c => (c === id ? null : c)), 2000);
  };

  const editing = editingId === 'new' ? null : models.find(m => m.id === editingId) || null;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className={tokens.typography.h3}>xCollab</h3>
          <p className={tokens.typography.bodyMuted}>The COLLAB model page. Toggle on the models a customer should see, then create a link: that customer only ever sees those models.</p>
        </div>
        <PillButton variant="filled" onClick={() => setEditingId('new')} disabled={editingId === 'new'}>
          <Plus size={14} className="mr-2" /> Add model
        </PillButton>
      </div>

      {/* ---- link builder */}
      <div className={`mb-6 rounded-xl border p-4 ${editingLink ? 'border-brand-primary bg-brand-bg/60' : 'border-brand-border bg-brand-bg/40'}`}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-brand-primary">
            {editingLink ? <>Editing link for “{editingLink.customer}”</> : 'New share link'}
            <span className="ml-2 font-normal text-brand-secondary">· {selectedIds.length} model{selectedIds.length === 1 ? '' : 's'} toggled on</span>
          </div>
          <div className="flex gap-2 text-xs">
            <button type="button" className="rounded-full border border-brand-border px-3 py-1 text-brand-primary hover:border-brand-primary" onClick={() => setSelected(new Set(models.map(m => m.id)))}>All on</button>
            <button type="button" className="rounded-full border border-brand-border px-3 py-1 text-brand-primary hover:border-brand-primary" onClick={() => setSelected(new Set())}>All off</button>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto]">
          <input className={tokens.components.input + ' bg-white'} value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Customer (only you see this)" />
          <input className={tokens.components.input + ' bg-white'} value={lede} onChange={e => setLede(e.target.value)} placeholder="Intro text (optional, replaces the bottom-left paragraph)" />
          <div className="flex gap-2">
            {editingLink && <PillButton type="button" onClick={resetLinkForm}><X size={14} className="mr-1" />Cancel</PillButton>}
            <PillButton type="button" variant="filled" onClick={saveLink}>
              {editingLink ? <><Save size={14} className="mr-2" />Save link</> : <><Link2 size={14} className="mr-2" />Create link</>}
            </PillButton>
          </div>
        </div>
        {linkError && <p className="mt-2 text-xs text-red-600">{linkError}</p>}
      </div>

      {editingId === 'new' && (
        <div className="mb-6">
          <ModelEditor initial={{ name: '', artist: '', image: null, sortOrder: models.length }} folderKey={`new_${Date.now()}`} saving={saving} onSave={saveModel} onCancel={() => setEditingId(null)} />
        </div>
      )}

      {/* ---- model library with on/off toggles */}
      {loading ? (
        <div className="flex justify-center py-12 text-brand-secondary"><Loader2 className="animate-spin" size={20} /></div>
      ) : models.length === 0 && editingId !== 'new' ? (
        <div className="rounded-xl border border-dashed border-brand-border py-12 text-center text-sm text-brand-secondary">No models yet. Add the first one, then toggle it on to build a link.</div>
      ) : (
        <div className="space-y-2">
          {models.map((m, idx) => {
            const on = selected.has(m.id), used = linksFor(m.id).length;
            return (
              <div key={m.id}>
                <div className={`flex items-center gap-4 rounded-xl border bg-white p-3 transition-colors ${on ? 'border-brand-primary' : 'border-brand-border'}`}>
                  <button type="button" role="switch" aria-checked={on} onClick={() => toggle(m.id)} title={on ? 'In this link' : 'Not in this link'}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? 'bg-brand-primary' : 'bg-brand-border'}`}>
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
                  </button>
                  <div className={`h-16 w-12 shrink-0 overflow-hidden rounded ${TILE}`}>
                    {m.image && <img src={m.image.url} alt="" className="h-full w-full object-contain p-0.5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-brand-primary">{m.name || 'Untitled look'}</div>
                    <div className="truncate text-xs text-brand-secondary">{m.artist || '—'} · in {used} link{used === 1 ? '' : 's'}</div>
                  </div>
                  <div className="flex items-center gap-1 text-brand-secondary">
                    <button onClick={() => move(idx, -1)} disabled={idx === 0} className="rounded p-1.5 hover:bg-brand-bg hover:text-brand-primary disabled:opacity-30" title="Move up"><ArrowUp size={14} /></button>
                    <button onClick={() => move(idx, 1)} disabled={idx === models.length - 1} className="rounded p-1.5 hover:bg-brand-bg hover:text-brand-primary disabled:opacity-30" title="Move down"><ArrowDown size={14} /></button>
                    <button onClick={() => setEditingId(editingId === m.id ? null : m.id)} className="rounded p-1.5 hover:bg-brand-bg hover:text-brand-primary" title="Edit"><Edit2 size={14} /></button>
                    <button onClick={() => removeModel(m)} className="rounded p-1.5 hover:bg-red-50 hover:text-red-600" title="Delete"><Trash2 size={14} /></button>
                  </div>
                </div>
                {editing && editing.id === m.id && (
                  <div className="mt-2">
                    <ModelEditor initial={{ ...editing }} folderKey={m.id} saving={saving} onSave={saveModel} onCancel={() => setEditingId(null)} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ---- links already made */}
      <div className="mt-10">
        <h4 className="mb-1 font-serif text-xl text-brand-primary">Share links</h4>
        <p className="mb-3 text-xs text-brand-secondary">Each link shows only its own models. Pause a link to switch it off without deleting it; editing a model updates every link it's in.</p>
        {links.length === 0 ? (
          <div className="rounded-xl border border-dashed border-brand-border py-8 text-center text-sm text-brand-secondary">No links yet.</div>
        ) : (
          <div className="space-y-2">
            {links.map(l => (
              <div key={l.id} className={`flex flex-wrap items-center gap-4 rounded-xl border bg-white p-3 ${l.active ? 'border-brand-border' : 'border-dashed border-brand-border opacity-70'} ${editingLink?.id === l.id ? 'ring-1 ring-brand-primary' : ''}`}>
                <div className="flex -space-x-3">
                  {(l.models || []).slice(0, 4).map(m => (
                    <div key={m.id} className={`h-12 w-9 overflow-hidden rounded border border-white ${TILE}`}><img src={m.image.url} alt="" className="h-full w-full object-contain" /></div>
                  ))}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-brand-primary">{l.customer || 'Untitled'}{!l.active && <span className="ml-2 text-xs font-normal text-brand-secondary">paused</span>}</div>
                  <div className="truncate text-xs text-brand-secondary">{(l.models || []).length} model{(l.models || []).length === 1 ? '' : 's'} · <span className="font-mono">{xcShareUrl(l.id)}</span></div>
                </div>
                <div className="flex items-center gap-1 text-brand-secondary">
                  <button onClick={() => copy(l.id)} className="inline-flex items-center gap-1 rounded-full border border-brand-border px-3 py-1 text-xs text-brand-primary hover:border-brand-primary">
                    {copied === l.id ? <><Check size={12} />Copied</> : <><Copy size={12} />Copy link</>}
                  </button>
                  <a href={`/xcollab/${l.id}`} target="_blank" rel="noreferrer" className="rounded p-1.5 hover:bg-brand-bg hover:text-brand-primary" title="Open"><ExternalLink size={14} /></a>
                  <button onClick={() => editLink(l)} className="rounded p-1.5 hover:bg-brand-bg hover:text-brand-primary" title="Change models"><Edit2 size={14} /></button>
                  <button onClick={() => toggleLink(l)} className="rounded p-1.5 hover:bg-brand-bg hover:text-brand-primary" title={l.active ? 'Pause link' : 'Resume link'}>{l.active ? <Pause size={14} /> : <Play size={14} />}</button>
                  <button onClick={() => removeLink(l)} className="rounded p-1.5 hover:bg-red-50 hover:text-red-600" title="Delete link"><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
