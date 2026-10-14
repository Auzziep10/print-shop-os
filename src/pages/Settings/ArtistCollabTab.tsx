import { useEffect, useRef, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../lib/firebase';
import {
  ArrowDown, ArrowUp, Edit2, ExternalLink, Eye, EyeOff, Loader2, Plus, Save, Trash2, Upload, X,
} from 'lucide-react';
import { tokens } from '../../lib/tokens';
import { PillButton } from '../../components/ui/PillButton';
import {
  AXC_BRANDS, AXC_GARMENTS_COLLECTION, AXC_STORAGE_FOLDER, DEFAULT_HANG, DEFAULT_MODEL_HANG, DEFAULT_MODEL_REFLECTION, DEFAULT_MODEL_SHADOW, DEFAULT_NECK, emptyGarment, neckPath,
  type AxcBrandId, type AxcCloseup, type AxcGarment, type AxcHang, type AxcImage, type AxcModelHang, type AxcModelReflection, type AxcModelShadow, type AxcNeck, type AxcNeckShape, type AxcSpec,
} from './artistCollabTypes';

const TILE = 'bg-[#e9e6e1] bg-[linear-gradient(45deg,#dedad4_25%,transparent_25%,transparent_75%,#dedad4_75%),linear-gradient(45deg,#dedad4_25%,transparent_25%,transparent_75%,#dedad4_75%)] bg-[length:14px_14px] [background-position:0_0,7px_7px]';

/** Empty-slot placeholder: a faint tee outline so the slot never looks like it already holds an image. */
function GarmentSilhouette({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <path d="M35 14 Q50 24 65 14 L86 24 L80 44 L70 40 L70 88 L30 88 L30 40 L20 44 L14 24 Z"
            fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  );
}

const MAX_EDGE = 2048;   // phones cap GPU textures near 4096px; 2048 on the long side is plenty for a full-screen garment

/** Decode any browser-readable image into a canvas no larger than MAX_EDGE on its long side. */
async function decodeScaled(file: File): Promise<{ canvas: HTMLCanvasElement; width: number; height: number }> {
  let bitmap: ImageBitmap | HTMLImageElement;
  try {
    bitmap = await createImageBitmap(file);                       // efficient path, handles huge files without a full-size canvas
  } catch {
    const url = URL.createObjectURL(file);
    try {
      bitmap = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error('Could not read this image. Use a PNG or WebP exported from your design tool.')); i.src = url;
      });
    } finally { URL.revokeObjectURL(url); }
  }
  const w = 'naturalWidth' in bitmap ? bitmap.naturalWidth : bitmap.width;
  const h = 'naturalHeight' in bitmap ? bitmap.naturalHeight : bitmap.height;
  if (!w || !h) throw new Error('Could not read this image. Use a PNG or WebP exported from your design tool.');
  const k = Math.min(1, MAX_EDGE / Math.max(w, h));
  const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(w * k)); canvas.height = Math.max(1, Math.round(h * k));
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if ('close' in bitmap) bitmap.close();
  return { canvas, width: canvas.width, height: canvas.height };
}

/**
 * Garment cutout: scale down, confirm it has a transparent background, scrub near-transparent haze,
 * crop to the opaque bounds (plus a hair of padding) and hand back a PNG.
 */
type Prepared = { file: File; anchor: { cx: number; bottom: number; top: number } };
async function prepareGarment(file: File): Promise<Prepared> {
  const { canvas, width: w, height: h } = await decodeScaled(file);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;
  let minX = w, minY = h, maxX = -1, maxY = -1, transparent = 0;
  let sMinX = w, sMinY = h, sMaxX = -1, sMaxY = -1;   // bounds of the SOLID figure (ignores baked soft shadows / haze)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4 + 3;
      if (px[i] <= 24) { transparent++; px[i] = 0; continue; }   // haze left by background removal shows up as a band under the shadow
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (px[i] > 160) { if (x < sMinX) sMinX = x; if (x > sMaxX) sMaxX = x; if (y < sMinY) sMinY = y; if (y > sMaxY) sMaxY = y; }
    }
  }
  if (transparent < w * h * 0.02) {
    throw new Error('This image has no transparent background, so it would hang as a rectangle. Export the garment as a PNG or WebP with the background removed (not white).');
  }
  if (maxX < 0) throw new Error('This image is fully transparent.');
  ctx.putImageData(data, 0, 0);
  const pad = 2;
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad); maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad);
  const cw = maxX - minX + 1, ch = maxY - minY + 1;
  const out = document.createElement('canvas'); out.width = cw; out.height = ch;
  out.getContext('2d')!.drawImage(canvas, minX, minY, cw, ch, 0, 0, cw, ch);
  const blob = await new Promise<Blob | null>(resolve => out.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Could not encode the image.');
  const solid = sMaxX >= 0 ? { sMinX, sMinY, sMaxX, sMaxY } : { sMinX: minX, sMinY: minY, sMaxX: maxX, sMaxY: maxY };
  const anchor = {
    cx: ((solid.sMinX + solid.sMaxX) / 2 - minX) / cw,
    top: (solid.sMinY - minY) / ch,
    bottom: (solid.sMaxY + 1 - minY) / ch,
  };
  return { file: new File([blob], file.name.replace(/\.[a-z0-9]+$/i, '') + '.png', { type: 'image/png' }), anchor };
}

/** Closeup photo: just scale down (JPEG for opaque photos, PNG when the file has transparency). */
async function prepareCloseup(file: File): Promise<File> {
  const { canvas, width: w, height: h } = await decodeScaled(file);
  const px = canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
  let hasAlpha = false;
  for (let i = 3; i < px.length; i += 4 * 97) { if (px[i] < 250) { hasAlpha = true; break; } }
  const type = hasAlpha ? 'image/png' : 'image/jpeg';
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, 0.9));
  if (!blob) throw new Error('Could not encode the image.');
  return new File([blob], file.name.replace(/\.[a-z0-9]+$/i, '') + (hasAlpha ? '.png' : '.jpg'), { type });
}

/** Chunked, resumable upload (survives a dropped connection better than one big request), with progress 0..100. */
function uploadAxcImage(file: File, folder: string, onProgress?: (pct: number) => void): Promise<AxcImage> {
  return new Promise<AxcImage>((resolve, reject) => {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${AXC_STORAGE_FOLDER}/${folder}/${Date.now()}_${safeName}`;
    const task = uploadBytesResumable(ref(storage, path), file, { contentType: file.type, cacheControl: 'public,max-age=31536000,immutable' });
    task.on('state_changed',
      snap => onProgress?.(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      err => {
        const code = (err as { code?: string }).code || '';
        reject(new Error(code === 'storage/unauthorized' ? 'Upload refused: check the Storage rules for axc_media.' :
          code === 'storage/retry-limit-exceeded' ? 'Upload kept failing. Check your internet connection and try again.' :
          `Upload failed (${code || err.message}).`));
      },
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          const { width, height } = await createImageBitmap(file).then(b => { const r = { width: b.width, height: b.height }; b.close(); return r; });
          resolve({ url, width, height, path });
        } catch (e) { reject(e instanceof Error ? e : new Error('Upload finished but the file could not be read back.')); }
      });
  });
}

const newId = () => Math.random().toString(36).slice(2, 10);

const HANGER_IMG = '/artistxcollab/img/garments/hanger.png';

function hexToRgba(hex: string, a: number) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  const n = m ? parseInt(m[1], 16) : 0;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** Module-level so React keeps the same <input> across renders (an inline component would remount mid-drag). */
function RangeRow({ label, value, min, max, step, format, onInput }: {
  label: string; value: number; min: number; max: number; step: number; format?: (v: number) => string; onInput: (v: number) => void;
}) {
  return (
    <label className="block text-xs text-brand-secondary">
      <span className="flex justify-between"><span>{label}</span><span className="tabular-nums">{format ? format(value) : `${Math.round(value * 1000) / 10}%`}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onInput(parseFloat(e.target.value))} className="mt-1 w-full accent-brand-primary" />
    </label>
  );
}

const pct = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`;
const times = (v: number) => `${Math.round(v * 100)}%`;

/**
 * Same geometry as the live viewer. baseU = (garment base width) / 541 is one "reference pixel"; the hanger is
 * 170×130 of them (scaled by hangerScale), its cap sits 55 reference px above the collar line, and the garment
 * is shifted by dy (fraction of its width) and scaled by `scale`. Drag the shirt to move it up/down, drag inside
 * the opening to move the opening.
 */
function HangArtboard({ front, neck, hang, zoom, onNeck, onHang }: {
  front: AxcImage; neck: AxcNeck | null; hang: AxcHang; zoom: number;   // `front` is whichever face is being placed
  onNeck: (n: AxcNeck) => void; onHang: (h: AxcHang) => void;
}) {
  const W = 620, H = 440;
  const fitW = Math.min(W * 0.6, (H - 80) * front.width / front.height);
  const baseW = fitW * zoom, baseU = baseW / 541, hu = baseU * hang.hangerScale;
  const gw = baseW * hang.scale, gh = gw * front.height / front.width;
  // camera: 1x shows the whole garment; zoomed views centre on the opening (or the collar when there is none)
  const focus = neck ? { x: neck.cx * gw, y: neck.cy * gh } : { x: gw / 2, y: 0 };
  const gLeft = zoom === 1 ? (W - gw) / 2 : W / 2 - focus.x;
  const gTop = zoom === 1 ? 70 * hu + 20 : H / 2 - focus.y;
  const hookTop = gTop - 55 * hu - hang.dy * gw;
  const hLeft = gLeft + gw / 2 - 85 * hu, hTop = hookTop - 3 * hu, hw = 170 * hu, hh = 130 * hu;
  const n = neck ? { w: 2 * neck.rx * gw, h: 2 * neck.ry * gh, l: gLeft + neck.cx * gw - neck.rx * gw, t: gTop + neck.cy * gh - neck.ry * gh } : null;
  const clip = n && neck ? `path('${neckPath(neck.shape, n.w, n.h)}')` : undefined;
  const drag = useRef<{ kind: 'neck' | 'shirt'; x: number; y: number; cx: number; cy: number; dy: number } | null>(null);

  const start = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const inNeck = !!(n && x >= n.l - 6 && x <= n.l + n.w + 6 && y >= n.t - 6 && y <= n.t + n.h + 6);
    drag.current = { kind: inNeck ? 'neck' : 'shirt', x, y, cx: neck?.cx ?? 0, cy: neck?.cy ?? 0, dy: hang.dy };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || !(e.buttons & 1)) { drag.current = null; return; }   // a native dialog can swallow pointerup — stop when the button is no longer held
    const r = e.currentTarget.getBoundingClientRect();
    const dx = e.clientX - r.left - d.x, dyPx = e.clientY - r.top - d.y;
    if (d.kind === 'neck' && neck) {
      onNeck({ ...neck, cx: Math.min(0.9, Math.max(0.1, d.cx + dx / gw)), cy: Math.min(0.5, Math.max(0, d.cy + dyPx / gh)) });
    } else {
      onHang({ ...hang, dy: Math.min(0.25, Math.max(-0.25, d.dy + dyPx / gw)) });
    }
  };
  const end = () => { drag.current = null; };

  return (
    <div className="relative shrink-0 select-none overflow-hidden rounded-lg border border-brand-border bg-[#b3aca5]" style={{ width: W, height: H, maxWidth: '100%', cursor: 'grab', touchAction: 'none' }}
         onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}>
      <div className="absolute w-px bg-[#17140f]" style={{ left: gLeft + gw / 2, top: 0, height: Math.max(0, hookTop + 2) }} />
      <img src={HANGER_IMG} alt="" draggable={false} className="absolute max-w-none" style={{ left: hLeft, top: hTop, width: hw, height: hh }} />
      <img src={front.url} alt="" draggable={false} className="absolute max-w-none" style={{ left: gLeft, top: gTop, width: gw, height: gh, filter: 'drop-shadow(0 10px 12px rgba(0,0,0,.28))' }} />
      {n && neck && (
        <>
          <div className="absolute" style={{ left: n.l, top: n.t, width: n.w, height: n.h, clipPath: clip, WebkitClipPath: clip, background: hexToRgba(neck.color || '#000000', neck.strength ?? 0.26) }}>
            <img src={HANGER_IMG} alt="" draggable={false} className="absolute max-w-none" style={{ left: hLeft - n.l, top: hTop - n.t, width: hw, height: hh }} />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,.5), rgba(0,0,0,0) 45%)' }} />
          </div>
          <svg className="pointer-events-none absolute" style={{ left: n.l - 1, top: n.t - 1 }} width={n.w + 2} height={n.h + 2} viewBox={`-1 -1 ${n.w + 2} ${n.h + 2}`}>
            <path d={neckPath(neck.shape, n.w, n.h)} fill="none" stroke="#fff" strokeWidth="1.5" strokeDasharray="4 3" opacity=".9" />
          </svg>
        </>
      )}
      <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/50 px-2 py-1 text-[10px] uppercase tracking-wider text-white">
        {zoom}× · drag the shirt up / down{neck ? ' · drag inside the outline to move the opening' : ''}
      </div>
    </div>
  );
}

const SHAPES: { id: AxcNeckShape; label: string }[] = [
  { id: 'oval', label: 'Oval' }, { id: 'crew', label: 'Crew' }, { id: 'square', label: 'Rounded' }, { id: 'v', label: 'V-neck' },
];

function HangEditor({ title, intro, front, neck, hang, onNeck, onHang, copyFrom }: {
  title: string; intro: string; front: AxcImage | null; neck: AxcNeck | null | undefined; hang: AxcHang | null | undefined;
  onNeck: (n: AxcNeck | null) => void; onHang: (h: AxcHang | null) => void;
  copyFrom?: { label: string; neck: AxcNeck | null | undefined; hang: AxcHang | null | undefined } | null;
}) {
  const n = neck || null;
  const h: AxcHang = { ...DEFAULT_HANG, ...(hang || {}) };
  const [zoom, setZoom] = useState(2);
  const pill = (on: boolean) => `rounded-full border px-3 py-1 ${on ? 'border-brand-primary bg-brand-primary text-white' : 'border-brand-border hover:border-brand-primary'}`;
  if (!front) return null;
  return (
    <div className="md:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className={tokens.typography.label}>{title}</label>
        {copyFrom && (
          <button type="button" onClick={() => { onHang(copyFrom.hang ? { ...copyFrom.hang } : null); onNeck(copyFrom.neck ? { ...copyFrom.neck } : null); }}
            className="rounded-full border border-brand-border px-3 py-1 text-xs text-brand-primary hover:border-brand-primary">{copyFrom.label}</button>
        )}
      </div>
      <p className="mt-1 text-[11px] text-brand-secondary">{intro}</p>
      <div className="mt-3">
        <HangArtboard front={front} neck={n} hang={h} zoom={zoom} onNeck={onNeck} onHang={onHang} />
        <div className="mt-2 flex items-center gap-2 text-xs text-brand-secondary">
          <span>Zoom</span>
          {[1, 2, 3, 4].map(z => <button key={z} type="button" onClick={() => setZoom(z)} className={pill(zoom === z)}>{z}×</button>)}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-x-10 gap-y-3 pr-3 sm:grid-cols-2">
        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-brand-primary">Shirt &amp; hanger</div>
          <RangeRow label="Shirt up / down" value={h.dy} min={-0.25} max={0.25} step={0.002} format={pct} onInput={v => onHang({ ...h, dy: v })} />
          <RangeRow label="Shirt size" value={h.scale} min={0.6} max={1.4} step={0.01} format={times} onInput={v => onHang({ ...h, scale: v })} />
          <RangeRow label="Hanger size" value={h.hangerScale} min={0.6} max={1.4} step={0.01} format={times} onInput={v => onHang({ ...h, hangerScale: v })} />
          <button type="button" onClick={() => onHang(null)} className="text-xs text-brand-secondary hover:text-brand-primary">Reset hanging</button>
        </div>

        <div className="space-y-3">
          <label className="flex items-center gap-3">
            <input type="checkbox" className="h-4 w-4" checked={!!n} onChange={e => onNeck(e.target.checked ? { ...DEFAULT_NECK } : null)} />
            <span className="text-xs font-semibold uppercase tracking-wider text-brand-primary">Show the hanger through the neck opening</span>
          </label>
          {n && (
            <>
              <div className="text-xs text-brand-secondary">
                <div className="mb-1">Shape</div>
                <div className="flex flex-wrap gap-2">
                  {SHAPES.map(sh => <button key={sh.id} type="button" onClick={() => onNeck({ ...n, shape: sh.id })} className={pill((n.shape || 'oval') === sh.id)}>{sh.label}</button>)}
                </div>
              </div>
              <RangeRow label="Width" value={n.rx} min={0.03} max={0.25} step={0.001} onInput={v => onNeck({ ...n, rx: v })} />
              <RangeRow label="Height" value={n.ry} min={0.01} max={0.12} step={0.001} onInput={v => onNeck({ ...n, ry: v })} />
              <RangeRow label="Down from the top" value={n.cy} min={0} max={0.2} step={0.001} onInput={v => onNeck({ ...n, cy: v })} />
              <RangeRow label="Left / right" value={n.cx} min={0.3} max={0.7} step={0.001} onInput={v => onNeck({ ...n, cx: v })} />
              <div className="flex items-end gap-3">
                <label className="block text-xs text-brand-secondary">
                  <span>Shade colour</span>
                  <input type="color" value={n.color || '#000000'} onChange={e => onNeck({ ...n, color: e.target.value })} className="mt-1 block h-8 w-12 cursor-pointer rounded border border-brand-border bg-white p-0.5" />
                </label>
                <div className="flex-1">
                  <RangeRow label="Shade strength" value={n.strength ?? 0.26} min={0} max={0.8} step={0.01} format={times} onInput={v => onNeck({ ...n, strength: v })} />
                </div>
              </div>
              <button type="button" onClick={() => onNeck({ ...DEFAULT_NECK })} className="text-xs text-brand-secondary hover:text-brand-primary">Reset opening</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const ROOM_IMG = '/artistxcollab/img/garments/room.webp';
const ROOM_FEET_Y = 0.86, ROOM_MODEL_H = 0.56;   // same constants as collection-data.js

/** The model standing in the room, placed exactly as the live page does it. Drag up/down to shift. */
function ModelBoard({ image, hang, onHang }: { image: AxcImage; hang: AxcModelHang; onHang: (h: AxcModelHang) => void }) {
  const H = 560, W = Math.round(H * 852 / 1847);
  const an = image.anchor || { cx: 0.5, bottom: 1, top: 0 };
  const mh = ROOM_MODEL_H * H * hang.scale, mw = image.width * (mh / image.height);
  const feet = ROOM_FEET_Y * H + hang.dy * mh;                 // the sole line
  const top = feet - an.bottom * mh, left = W / 2 - an.cx * mw;   // image box so that the solid feet land on the sole line, centred on the solid figure
  const reflTop = feet - (1 - an.bottom) * mh;                  // mirrored copy: its (flipped) soles meet the sole line
  const sh: AxcModelShadow = { ...DEFAULT_MODEL_SHADOW, ...(hang.shadow || {}) };
  const refl = hang.reflection ?? 1;
  const rf: AxcModelReflection = { ...DEFAULT_MODEL_REFLECTION, ...(hang.refl || {}) };
  const pw = mw * 1.2 * sh.size, ph = mw * 0.24 * sh.size, pl = W / 2 - pw / 2 + sh.dx * mw, pt = feet - ph * 0.42 + sh.dy * mh;
  const aA = Math.min(0.97, 0.42 * sh.strength), aB = Math.min(0.9, 0.22 * sh.strength);   // strength darkens the gradient itself
  const drag = useRef<{ y: number; dy: number } | null>(null);
  const r0 = (1 - an.bottom) * mh;
  const mask = `linear-gradient(to top, rgba(0,0,0,0) ${r0}px, rgba(0,0,0,.9) ${r0}px, rgba(0,0,0,.25) ${r0 + mh * 0.07 * rf.length}px, rgba(0,0,0,0) ${r0 + mh * 0.22 * rf.length}px)`;
  return (
    <div className="relative shrink-0 select-none overflow-hidden rounded-lg border border-brand-border" style={{ width: W, height: H, cursor: 'grab', touchAction: 'none', backgroundImage: `url(${ROOM_IMG})`, backgroundSize: 'cover' }}
         onPointerDown={e => { if (e.button !== 0) return; drag.current = { y: e.clientY, dy: hang.dy }; e.currentTarget.setPointerCapture(e.pointerId); }}
         onPointerMove={e => { const d = drag.current; if (!d || !(e.buttons & 1)) { drag.current = null; return; } onHang({ ...hang, dy: Math.min(0.2, Math.max(-0.2, d.dy + (e.clientY - d.y) / mh)) }); }}
         onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      <div className="absolute rounded-[50%]" style={{ left: pl - pw * 0.29, top: pt - ph * 0.33, width: pw * 1.58, height: ph * 1.67, filter: 'blur(14px)', background: `radial-gradient(ellipse at center, rgba(0,0,0,${aB}) 0%, rgba(0,0,0,${aB * 0.36}) 45%, rgba(0,0,0,0) 72%)` }} />
      <div className="absolute rounded-[50%]" style={{ left: pl, top: pt, width: pw, height: ph, filter: 'blur(6px)', background: `radial-gradient(ellipse at center, rgba(0,0,0,${aA}) 0%, rgba(0,0,0,${aA * 0.38}) 40%, rgba(0,0,0,0) 70%)` }} />
      <img src={image.url} alt="" draggable={false} className="absolute max-w-none" style={{ left: left - mw * 0.10, top: top + mh * 0.03, width: mw * 1.02, height: mh * 0.97, filter: 'brightness(0) blur(10px) opacity(.32)', transform: 'skewX(-4deg)', transformOrigin: '50% 100%' }} />
      <img src={image.url} alt="" draggable={false} className="absolute max-w-none" style={{ left: left + rf.dx * mw, top: reflTop + rf.dy * mh, width: mw, height: mh, transform: 'scaleY(-1)', opacity: .36 * refl, filter: 'blur(1px)', WebkitMaskImage: mask, maskImage: mask }} />
      <img src={image.url} alt="" draggable={false} className="absolute max-w-none" style={{ left, top, width: mw, height: mh }} />
      <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/50 px-2 py-1 text-[10px] uppercase tracking-wider text-white">drag to move up / down</div>
    </div>
  );
}

function ModelEditor({ g, busy, progress, onPick, onRemove, onHang }: {
  g: Omit<AxcGarment, 'id'>; busy: string | null; progress: number | null;
  onPick: (side: 'model' | 'modelBack', file: File | undefined) => void; onRemove: (side: 'model' | 'modelBack') => void; onHang: (h: AxcModelHang | null) => void;
}) {
  const h: AxcModelHang = { ...DEFAULT_MODEL_HANG, ...(g.modelHang || {}) };
  const sh: AxcModelShadow = { ...DEFAULT_MODEL_SHADOW, ...(h.shadow || {}) };
  const rf: AxcModelReflection = { ...DEFAULT_MODEL_REFLECTION, ...(h.refl || {}) };
  const inputs = { model: useRef<HTMLInputElement>(null), modelBack: useRef<HTMLInputElement>(null) };
  const Slot = ({ side, label }: { side: 'model' | 'modelBack'; label: string }) => {
    const img = g[side];
    return (
      <div>
        <label className={tokens.typography.label}>{label}</label>
        <div className="mt-2 flex items-start gap-3">
          <div className={`relative h-40 w-24 shrink-0 overflow-hidden rounded-lg border border-brand-border ${TILE}`}>
            {img ? <img src={img.url} alt="" className="absolute inset-0 h-full w-full object-contain p-1" /> : <div className="absolute inset-0 grid place-items-center text-[10px] uppercase tracking-wider text-brand-secondary/60">No image</div>}
            {busy === side && (
              <div className="absolute inset-0 grid place-items-center bg-black/45 text-white">
                <div className="text-center"><Loader2 size={16} className="mx-auto animate-spin" /><div className="mt-1 text-[11px] tabular-nums">{progress == null ? 'Preparing…' : `${progress}%`}</div></div>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <button type="button" onClick={() => inputs[side].current?.click()} disabled={!!busy}
              className="inline-flex items-center gap-2 rounded-full border border-brand-border px-3 py-1.5 text-xs text-brand-primary transition-colors hover:border-brand-primary disabled:opacity-50">
              <Upload size={12} /> {img ? 'Replace' : 'Upload'}
            </button>
            {img && <span className="text-[11px] text-brand-secondary">{img.width}×{img.height}px</span>}
            {img && <button type="button" onClick={() => onRemove(side)} className="text-left text-[11px] text-red-600 hover:underline">Remove</button>}
            <input ref={inputs[side]} type="file" accept="image/png,image/webp" className="hidden" onChange={e => onPick(side, e.target.files?.[0])} />
          </div>
        </div>
      </div>
    );
  };
  return (
    <div className="md:col-span-2 rounded-lg border border-brand-border bg-white/60 p-4">
      <label className={tokens.typography.label}>Model view (optional)</label>
      <p className="mt-1 text-[11px] text-brand-secondary">
        Adds a Garment / Model switch under the name on the live page. Upload the model on their own: full length, feet included,
        transparent background, no room. The page stands them on the floor of the same room and adds the contact shadow.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Slot side="model" label="Model — front" />
        <Slot side="modelBack" label="Model — back (optional, enables Turn)" />
      </div>
      {g.model && (
        <div className="mt-4 flex flex-col gap-4 sm:flex-row">
          <ModelBoard image={g.model} hang={h} onHang={onHang} />
          <div className="flex-1 space-y-3 pt-1 pr-3">
            <RangeRow label="Model size" value={h.scale} min={0.6} max={1.4} step={0.01} format={times} onInput={v => onHang({ ...h, scale: v })} />
            <RangeRow label="Up / down" value={h.dy} min={-0.2} max={0.2} step={0.002} format={pct} onInput={v => onHang({ ...h, dy: v })} />
            <div className="pt-1 text-xs font-semibold uppercase tracking-wider text-brand-primary">Floor shadow</div>
            <RangeRow label="Strength" value={sh.strength} min={0} max={2.4} step={0.02} format={times} onInput={v => onHang({ ...h, shadow: { ...sh, strength: v } })} />
            <RangeRow label="Size" value={sh.size} min={0.4} max={2} step={0.02} format={times} onInput={v => onHang({ ...h, shadow: { ...sh, size: v } })} />
            <RangeRow label="Up / down" value={sh.dy} min={-0.08} max={0.08} step={0.001} format={pct} onInput={v => onHang({ ...h, shadow: { ...sh, dy: v } })} />
            <RangeRow label="Left / right" value={sh.dx} min={-0.4} max={0.4} step={0.005} format={pct} onInput={v => onHang({ ...h, shadow: { ...sh, dx: v } })} />
            <div className="pt-1 text-xs font-semibold uppercase tracking-wider text-brand-primary">Floor reflection</div>
            <RangeRow label="Strength" value={h.reflection ?? 1} min={0} max={2} step={0.02} format={times} onInput={v => onHang({ ...h, reflection: v })} />
            <RangeRow label="Length" value={rf.length} min={0.3} max={2.5} step={0.02} format={times} onInput={v => onHang({ ...h, refl: { ...rf, length: v } })} />
            <RangeRow label="Up / down" value={rf.dy} min={-0.08} max={0.08} step={0.001} format={pct} onInput={v => onHang({ ...h, refl: { ...rf, dy: v } })} />
            <RangeRow label="Left / right" value={rf.dx} min={-0.3} max={0.3} step={0.005} format={pct} onInput={v => onHang({ ...h, refl: { ...rf, dx: v } })} />
            <button type="button" onClick={() => onHang(null)} className="text-xs text-brand-secondary hover:text-brand-primary">Reset</button>
          </div>
        </div>
      )}
    </div>
  );
}

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
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const frontInput = useRef<HTMLInputElement>(null);
  const backInput = useRef<HTMLInputElement>(null);
  const closeupInput = useRef<HTMLInputElement>(null);

  const set = <K extends keyof Omit<AxcGarment, 'id'>>(k: K, v: Omit<AxcGarment, 'id'>[K]) => setG(prev => ({ ...prev, [k]: v }));

  const pickSide = async (side: 'front' | 'back' | 'model' | 'modelBack', file: File | undefined) => {
    if (!file) return;
    setBusy(side); setError(null); setProgress(null);
    try {
      const prepared = await prepareGarment(file);
      const uploaded = await uploadAxcImage(prepared.file, `${folderKey}/${side}`, setProgress);
      set(side, { ...uploaded, anchor: prepared.anchor });
    }
    catch (e) { setError(e instanceof Error ? e.message : 'Upload failed'); }
    finally { setBusy(null); setProgress(null); }
  };

  const addCloseups = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setBusy('closeups'); setError(null);
    try {
      const added: AxcCloseup[] = [];
      for (const file of Array.from(files)) {
        const image = await uploadAxcImage(await prepareCloseup(file), `${folderKey}/closeups`, setProgress);
        added.push({ id: newId(), label: `Closeup ${g.closeups.length + added.length + 1}`, image });
      }
      set('closeups', [...g.closeups, ...added]);
    } catch (e) { setError(e instanceof Error ? e.message : 'Upload failed'); }
    finally { setBusy(null); setProgress(null); if (closeupInput.current) closeupInput.current.value = ''; }
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
          <div className={`relative h-40 w-32 shrink-0 overflow-hidden rounded-lg border border-brand-border ${TILE}`}>
            {img
              ? <img src={img.url} alt="" className="absolute inset-0 h-full w-full object-contain p-2" />
              : <div className="absolute inset-0 grid place-items-center text-brand-secondary/60"><div className="text-center"><GarmentSilhouette className="mx-auto h-14 w-14" /><div className="mt-1 text-[10px] uppercase tracking-wider">No image</div></div></div>}
            {busy === side && (
              <div className="absolute inset-0 grid place-items-center bg-black/45 text-white">
                <div className="text-center"><Loader2 size={16} className="mx-auto animate-spin" /><div className="mt-1 text-[11px] tabular-nums">{progress == null ? 'Preparing…' : `${progress}%`}</div></div>
              </div>
            )}
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
        <div className="md:col-span-2">
          <label className={tokens.typography.label}>Collection</label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {AXC_BRANDS.map(b => (
              <button key={b.id} type="button" onClick={() => set('brand', b.id)}
                className={`rounded-full border px-3 py-1 text-xs ${(g.brand || 'inktheory') === b.id ? 'border-brand-primary bg-brand-primary text-white' : 'border-brand-border text-brand-primary hover:border-brand-primary'}`}>
                {b.label}
              </button>
            ))}
          </div>
        </div>
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
        <HangEditor title="Hanging — front" front={g.front} neck={g.neck} hang={g.hang} onNeck={n => set('neck', n)} onHang={h => set('hang', h)}
          intro="How the front sits on the hanger on the live page. Drag the shirt on the board to move it up or down; use the sliders for size. Tick the neck option for flatlays whose collar is closed, then fit the dashed outline to the inside of the collar." />
        {g.back && (
          <HangEditor title="Hanging — back" front={g.back} neck={g.neckBack} hang={g.hangBack} onNeck={n => set('neckBack', n)} onHang={h => set('hangBack', h)}
            copyFrom={{ label: 'Copy settings from front', neck: g.neck, hang: g.hang }}
            intro="Shown after the Turn button. The back neck usually sits higher and narrower than the front, so it gets its own placement and opening. Until you change anything here, the back uses the front's hanging settings." />
        )}
        <ModelEditor g={g} busy={busy} progress={progress} onPick={pickSide} onRemove={side => set(side, null)} onHang={h => set('modelHang', h)} />

        <div className="md:col-span-2">
          <label className={tokens.typography.label}>Garment makeup</label>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {g.specs.map((s, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] items-center gap-2">
                <input className={tokens.components.input + ' min-w-0 bg-white'} value={s.label} onChange={e => updateSpec(i, { label: e.target.value })} placeholder="Fabric" />
                <input className={tokens.components.input + ' min-w-0 bg-white'} value={s.value} onChange={e => updateSpec(i, { value: e.target.value })} placeholder="6.5 oz organic cotton" />
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
              {busy === 'closeups' ? (progress == null ? 'Preparing…' : `Uploading… ${progress}%`) : 'Add closeup images (you can select several)'}
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
  const [allGarments, setAllGarments] = useState<AxcGarment[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);   // 'new' for a fresh garment
  const [saving, setSaving] = useState(false);
  const [brand, setBrand] = useState<AxcBrandId>('inktheory');
  const brandInfo = AXC_BRANDS.find(b => b.id === brand) || AXC_BRANDS[0];
  const garments = allGarments.filter(g => (g.brand || 'inktheory') === brand);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, AXC_GARMENTS_COLLECTION), snap => {
      const rows = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<AxcGarment, 'id'>) }));
      rows.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      setAllGarments(rows);
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
          <p className={tokens.typography.bodyMuted}>What hangs on the rail at the end of each client's Artist×Collab story. Changes go live immediately.</p>
        </div>
        <div className="flex items-center gap-2">
          <a href={brandInfo.liveUrl} target="_blank" rel="noreferrer"
             className="inline-flex items-center gap-1.5 rounded-full border border-brand-border px-4 py-2 text-xs text-brand-primary transition-colors hover:border-brand-primary">
            <ExternalLink size={12} /> View {brandInfo.label} live
          </a>
          <PillButton variant="filled" onClick={() => setEditingId('new')} disabled={editingId === 'new'}>
            <Plus size={14} className="mr-2" /> Add garment
          </PillButton>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {AXC_BRANDS.map(b => {
          const n = allGarments.filter(g => (g.brand || 'inktheory') === b.id).length;
          return (
            <button key={b.id} type="button" onClick={() => { setBrand(b.id); setEditingId(null); }}
              className={`rounded-full border px-4 py-1.5 text-sm ${brand === b.id ? 'border-brand-primary bg-brand-primary text-white' : 'border-brand-border text-brand-primary hover:border-brand-primary'}`}>
              {b.label} <span className={brand === b.id ? 'opacity-70' : 'text-brand-secondary'}>· {n}</span>
            </button>
          );
        })}
        <span className="ml-1 text-xs text-brand-secondary">Story: <a className="underline" href={brandInfo.storyUrl} target="_blank" rel="noreferrer">{brandInfo.storyUrl}</a></span>
      </div>

      <div className="mb-5 rounded-lg border border-brand-border bg-brand-bg/60 px-4 py-3 text-xs text-brand-secondary">
        <span className="font-semibold text-brand-primary">Asset specs.</span> Front and back: just the garment, cut out on a transparent background (PNG or WebP), no hanger and no room. Any size works: empty margin is trimmed and anything over 2048px is scaled down on upload; the viewer sizes each garment, hangs it from the rail and draws the hanger. Export the back with the same crop as the front so the flip lines up. Closeups: portrait photos, any size.
      </div>

      {editingId === 'new' && (
        <div className="mb-6">
          <GarmentEditor initial={emptyGarment(garments.length, brand)} folderKey={`new_${Date.now()}`} onSave={save} onCancel={() => setEditingId(null)} saving={saving} />
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12 text-brand-secondary"><Loader2 className="animate-spin" size={20} /></div>
      ) : garments.length === 0 && editingId !== 'new' ? (
        <div className="rounded-xl border border-dashed border-brand-border py-12 text-center text-sm text-brand-secondary">
          No {brandInfo.label} garments yet. Add the first one and it will appear on that rail.
        </div>
      ) : (
        <div className="space-y-3">
          {garments.map((g, idx) => (
            <div key={g.id}>
              <div className={`flex items-center gap-4 rounded-xl border bg-white p-3 ${g.active ? 'border-brand-border' : 'border-dashed border-brand-border opacity-70'}`}>
                <div className={`grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded ${TILE}`}>
                  {g.front ? <img src={g.front.url} alt="" className="h-full w-full object-contain p-1" /> : <GarmentSilhouette className="h-8 w-8 text-brand-secondary/50" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-brand-primary">{g.name || 'Untitled garment'}</div>
                  <div className="truncate text-xs text-brand-secondary">
                    {g.artist || '—'} · {g.closeups?.length || 0} closeup{(g.closeups?.length || 0) === 1 ? '' : 's'}{g.back ? ' · front + back' : ' · front only'}{g.model ? ' · model' : ''}
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
