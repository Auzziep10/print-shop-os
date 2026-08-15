import { useState, useEffect, useRef, useMemo } from 'react';
import { doc, getDocFromServer, setDoc, updateDoc, deleteDoc, query, where, getDocs, collection } from 'firebase/firestore';
import { db, storage } from '../../lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Loader2, Save, Search, Check, Info, Crosshair, X, Trash2, Plus, Edit2, ImageIcon, ArrowLeft, ArrowRight, Eye, EyeOff, Scissors, Upload } from 'lucide-react';
import { tokens } from '../../lib/tokens';
import { PillButton } from '../../components/ui/PillButton';
import sanmarCatalogJson from '../../data/sanmar-catalog.json';
import catalogBackup from '../../data/catalog-backup.json';
import { getOrderedKeys, GARMENT_TYPES, detectGarmentTypeTag, getFilteredProductColors, getFrameContentBounds, type GarmentTypeId } from '../../lib/garmentUtils';
import { ImportGarmentModal } from '../../components/shared/ImportGarmentModal';

interface SanMarProduct {
  style: string;
  title: string;
  brand: string;
  category: string;
  price: number;
}

const sanmarCatalog = sanmarCatalogJson as SanMarProduct[];

const DEFAULT_RACKS = {
  Athleisure: { hat: 'STC70', shirt: 'BC3001', polo: 'ST640', crewneck: 'DT1304', hoodie: 'BC3719', longsleeve: 'BC3501' },
  Casual: { hat: '112', shirt: '64000', polo: '64800', crewneck: 'SF000', hoodie: '18500', longsleeve: '6014' },
  Formal: { hat: 'C402', shirt: 'BC3001', polo: 'K500', crewneck: 'DT1304', hoodie: '996M', longsleeve: 'BC3501' },
  Active: { hat: 'STC70', shirt: 'BC3001', polo: 'ST550', crewneck: 'S6000', hoodie: 'DT6100', longsleeve: '29LS' },
  Business: { hat: 'C402', shirt: 'K810', polo: 'K810', crewneck: 'DT1304', hoodie: 'BC3719', longsleeve: '6014' },
  'Work Wear': { hat: '212', shirt: '5000', polo: 'K420', crewneck: '562M', hoodie: '18500', longsleeve: '6014' },
  Outdoor: { hat: '112', shirt: 'BC3001', polo: 'K110', crewneck: '1566', hoodie: 'DT6100', longsleeve: '6014' },
  Team: { hat: '112', shirt: '64000', polo: 'ST665', crewneck: 'S6000', hoodie: '996M', longsleeve: '29LS' }
};

const DEFAULT_BASICS = {
  'T-Shirts': { good: '5000', better: '64000', best: 'BC3001' },
  Tanks: { good: 'BC8803', better: 'BC8800', best: '9360' },
  LS: { good: '29LS', better: 'BC3501', best: '6014' },
  Sweatshirt: { good: '18000', better: '996M', best: 'DT6100' },
  Hoodie: { good: 'DT6100', better: '18500', best: 'BC3719' },
  Jacket: { good: 'L217', better: 'J317', best: 'J333' }
};

// Logo placement bounding box, in percent of the 4:5 placement frame in which the
// garment mock is object-contain fitted at 100%. x/y = box CENTER. Matches the
// coordinate system used by the /start lookbook, Edit Design modal, and mockup compiler.
export interface LogoBox {
  x: number;
  y: number;
  w: number;
  h: number;
  r?: number; // rotation in degrees (clockwise), applied to the logo via logoRotation
}

export interface MultiLogoBoxes {
  large?: LogoBox;
  medium?: LogoBox;
  small?: LogoBox;
  front?: { large?: LogoBox; medium?: LogoBox; small?: LogoBox; x?: number; y?: number; w?: number; h?: number; r?: number };
  back?: { large?: LogoBox; medium?: LogoBox; small?: LogoBox; x?: number; y?: number; w?: number; h?: number; r?: number };
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  r?: number;
}

const PRINT_SIZE_CONFIGS: {
  key: 'large' | 'medium' | 'small';
  label: string;
  subLabel: string;
  badgeBg: string;
  badgeText: string;
  borderColor: string;
  activeBorderColor: string;
  handleColor: string;
  defaultBox: LogoBox;
}[] = [
  {
    key: 'large',
    label: 'Large Print',
    subLabel: 'Full Front / Back (11×14")',
    badgeBg: 'bg-red-100 text-red-800 border border-red-300',
    badgeText: 'LARGE PRINT',
    borderColor: 'rgba(239, 68, 68, 0.65)',
    activeBorderColor: '#dc2626',
    handleColor: '#dc2626',
    defaultBox: { x: 50, y: 38, w: 50, h: 40 }
  },
  {
    key: 'medium',
    label: 'Medium Print',
    subLabel: 'Chest / Torso (7×9")',
    badgeBg: 'bg-blue-100 text-blue-800 border border-blue-300',
    badgeText: 'MEDIUM PRINT',
    borderColor: 'rgba(59, 130, 246, 0.65)',
    activeBorderColor: '#2563eb',
    handleColor: '#2563eb',
    defaultBox: { x: 50, y: 34, w: 32, h: 26 }
  },
  {
    key: 'small',
    label: 'Small Print',
    subLabel: 'Left / Right Chest (4×4")',
    badgeBg: 'bg-emerald-100 text-emerald-800 border border-emerald-300',
    badgeText: 'SMALL PRINT',
    borderColor: 'rgba(16, 185, 129, 0.65)',
    activeBorderColor: '#059669',
    handleColor: '#059669',
    defaultBox: { x: 36, y: 28, w: 18, h: 14 }
  }
];

const MIN_BOX_PX = 14;

const PLACEMENT_PRESETS: { label: string; box: LogoBox }[] = [
  { label: 'Full Front', box: { x: 50, y: 38, w: 50, h: 40 } },
  { label: 'Left Chest', box: { x: 36, y: 28, w: 16, h: 13 } },
  { label: 'Right Chest', box: { x: 64, y: 28, w: 16, h: 13 } },
  { label: 'Hat Front', box: { x: 50, y: 52, w: 24, h: 17 } },
];

const slotDefaultBox = (slot: string): LogoBox => {
  if (slot === 'hat') return PLACEMENT_PRESETS[3].box;
  if (slot === 'polo') return PLACEMENT_PRESETS[1].box;
  return PLACEMENT_PRESETS[0].box;
};

const clampBox = (box: LogoBox): LogoBox => {
  const w = Math.min(96, Math.max(3, box.w));
  const h = Math.min(96, Math.max(3, box.h));
  const x = Math.min(98, Math.max(2, box.x));
  const y = Math.min(98, Math.max(2, box.y));
  // Normalize rotation to (-180, 180], snapping to the nearest quarter turn when close
  let r = (((box.r ?? 0) % 360) + 540) % 360 - 180;
  for (const snap of [-180, -90, 0, 90, 180]) {
    if (Math.abs(r - snap) <= 3) { r = snap === -180 ? 180 : snap; break; }
  }
  return { x, y, w, h, r };
};

// Resize handles: sx/sy are the handle's direction from the box center in local
// (rotation-aligned) space; the opposite point stays anchored while dragging.
const RESIZE_HANDLES: { id: string; sx: number; sy: number; cursor: string }[] = [
  { id: 'nw', sx: -1, sy: -1, cursor: 'nwse-resize' },
  { id: 'n', sx: 0, sy: -1, cursor: 'ns-resize' },
  { id: 'ne', sx: 1, sy: -1, cursor: 'nesw-resize' },
  { id: 'e', sx: 1, sy: 0, cursor: 'ew-resize' },
  { id: 'se', sx: 1, sy: 1, cursor: 'nwse-resize' },
  { id: 's', sx: 0, sy: 1, cursor: 'ns-resize' },
  { id: 'sw', sx: -1, sy: 1, cursor: 'nesw-resize' },
  { id: 'w', sx: -1, sy: 0, cursor: 'ew-resize' },
];
function LogoPlacementModal({
  title,
  imageUrl,
  backImageUrl,
  onUploadBackMockup,
  initialBox,
  hasExisting,
  onApply,
  onClear,
  onClose,
}: {
  title: string;
  imageUrl: string;
  backImageUrl?: string | null;
  onUploadBackMockup?: (file: File) => Promise<string>;
  initialBox: MultiLogoBoxes | LogoBox;
  hasExisting: boolean;
  onApply: (box: MultiLogoBoxes) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const parseInitialBoxes = (side: 'front' | 'back'): Record<'large' | 'medium' | 'small', LogoBox | null> => {
    const raw = initialBox as MultiLogoBoxes;
    const sideMap = side === 'back' ? (raw?.back || (raw && !raw.front ? raw : null)) : (raw?.front || raw);
    
    if (sideMap && (sideMap.large || sideMap.medium || sideMap.small)) {
      return {
        large: sideMap.large ? clampBox(sideMap.large) : null,
        medium: sideMap.medium ? clampBox(sideMap.medium) : null,
        small: sideMap.small ? clampBox(sideMap.small) : null,
      };
    }
    if (sideMap && typeof sideMap.x === 'number') {
      return {
        large: clampBox(sideMap as LogoBox),
        medium: null,
        small: null
      };
    }
    return {
      large: PRINT_SIZE_CONFIGS[0].defaultBox,
      medium: PRINT_SIZE_CONFIGS[1].defaultBox,
      small: PRINT_SIZE_CONFIGS[2].defaultBox,
    };
  };

  const [activeSide, setActiveSide] = useState<'front' | 'back'>('front');
  const [frontBoxes, setFrontBoxes] = useState<Record<'large' | 'medium' | 'small', LogoBox | null>>(() => parseInitialBoxes('front'));
  const [backBoxes, setBackBoxes] = useState<Record<'large' | 'medium' | 'small', LogoBox | null>>(() => parseInitialBoxes('back'));
  const [activeSize, setActiveSize] = useState<'large' | 'medium' | 'small'>('large');
  const [customBackUrl, setCustomBackUrl] = useState<string | null>(null);
  const [isUploadingBack, setIsUploadingBack] = useState(false);

  const currentBoxes = activeSide === 'front' ? frontBoxes : backBoxes;
  const setCurrentBoxes = activeSide === 'front' ? setFrontBoxes : setBackBoxes;

  const effectiveBackUrl = customBackUrl || (backImageUrl !== imageUrl ? backImageUrl : null) || backImageUrl;
  const currentMockUrl = (activeSide === 'back' && effectiveBackUrl) ? effectiveBackUrl : imageUrl;
  const isBackMockupSameAsFront = activeSide === 'back' && currentMockUrl === imageUrl;

  const frameRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<{
    type: 'move' | 'rotate' | string;
    startX: number;
    startY: number;
    startBox: LogoBox;
  } | null>(null);

  const activeBox = currentBoxes[activeSize] || PRINT_SIZE_CONFIGS.find(c => c.key === activeSize)!.defaultBox;

  const updateActiveBox = (newBox: LogoBox) => {
    setCurrentBoxes(prev => ({
      ...prev,
      [activeSize]: newBox
    }));
  };

  const pointerPx = (e: React.PointerEvent) => {
    const rect = frameRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top, rect };
  };

  const boxToPx = (b: LogoBox, rect: DOMRect) => ({
    cx: (b.x / 100) * rect.width,
    cy: (b.y / 100) * rect.height,
    bw: (b.w / 100) * rect.width,
    bh: (b.h / 100) * rect.height,
    rad: ((b.r ?? 0) * Math.PI) / 180,
  });

  const handlePointerDown = (e: React.PointerEvent, type: 'move' | 'rotate' | string) => {
    e.preventDefault();
    e.stopPropagation();
    const { x, y } = pointerPx(e);
    gestureRef.current = { type, startX: x, startY: y, startBox: activeBox };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const g = gestureRef.current;
    if (!g) return;
    const { x, y, rect } = pointerPx(e);
    const start = boxToPx(g.startBox, rect);

    if (g.type === 'move') {
      updateActiveBox(clampBox({
        ...g.startBox,
        x: ((start.cx + (x - g.startX)) / rect.width) * 100,
        y: ((start.cy + (y - g.startY)) / rect.height) * 100,
      }));
      return;
    }

    if (g.type === 'rotate') {
      const deg = (Math.atan2(y - start.cy, x - start.cx) * 180) / Math.PI + 90;
      updateActiveBox(clampBox({ ...g.startBox, r: Math.round(deg) }));
      return;
    }

    const handle = RESIZE_HANDLES.find(h => h.id === g.type);
    if (!handle) return;
    const { sx, sy } = handle;
    const cos = Math.cos(start.rad);
    const sin = Math.sin(start.rad);

    const ax = start.cx - (sx * (start.bw / 2)) * cos + (sy * (start.bh / 2)) * sin;
    const ay = start.cy - (sx * (start.bh / 2)) * sin - (sy * (start.bh / 2)) * cos;

    const dx = x - ax;
    const dy = y - ay;
    const localX = dx * cos + dy * sin;
    const localY = -dx * sin + dy * cos;

    const bw = sx !== 0 ? Math.max(MIN_BOX_PX, sx * localX) : start.bw;
    const bh = sy !== 0 ? Math.max(MIN_BOX_PX, sy * localY) : start.bh;

    const ox = sx * (bw / 2);
    const oy = sy * (bh / 2);
    const cx = ax + ox * cos - oy * sin;
    const cy = ay + ox * sin + oy * cos;

    updateActiveBox(clampBox({
      x: (cx / rect.width) * 100,
      y: (cy / rect.height) * 100,
      w: (bw / rect.width) * 100,
      h: (bh / rect.height) * 100,
      r: g.startBox.r ?? 0,
    }));
  };

  const handlePointerUp = () => {
    gestureRef.current = null;
  };

  const handleSave = async () => {
    const primaryFront = frontBoxes.large || frontBoxes.medium || frontBoxes.small || PRINT_SIZE_CONFIGS[0].defaultBox;
    const primaryBack = backBoxes.large || backBoxes.medium || backBoxes.small || PRINT_SIZE_CONFIGS[0].defaultBox;

    const payload: MultiLogoBoxes = {
      ...primaryFront,
      large: frontBoxes.large ? clampBox(frontBoxes.large) : undefined,
      medium: frontBoxes.medium ? clampBox(frontBoxes.medium) : undefined,
      small: frontBoxes.small ? clampBox(frontBoxes.small) : undefined,
      front: {
        large: frontBoxes.large ? clampBox(frontBoxes.large) : undefined,
        medium: frontBoxes.medium ? clampBox(frontBoxes.medium) : undefined,
        small: frontBoxes.small ? clampBox(frontBoxes.small) : undefined,
        ...primaryFront
      },
      back: {
        large: backBoxes.large ? clampBox(backBoxes.large) : undefined,
        medium: backBoxes.medium ? clampBox(backBoxes.medium) : undefined,
        small: backBoxes.small ? clampBox(backBoxes.small) : undefined,
        ...primaryBack
      }
    };

    // Stamp where the garment's pixels sit inside this artboard so consumers
    // can remap the boxes onto any differently-framed mock (garment-anchored
    // placements). Best-effort: if the image can't be read, boxes still save
    // and consumers fall back to frame-relative rendering.
    try {
      const frameEl = frameRef.current;
      const frameAspect = frameEl && frameEl.offsetHeight > 0
        ? frameEl.offsetWidth / frameEl.offsetHeight
        : 4 / 5;
      const frontRefBounds = await getFrameContentBounds(imageUrl, frameAspect);
      if (frontRefBounds) (payload as any).frontRef = frontRefBounds;
      if (backImageUrl) {
        const backRefBounds = await getFrameContentBounds(backImageUrl, frameAspect);
        if (backRefBounds) (payload as any).backRef = backRefBounds;
      }
    } catch { /* refs are optional */ }

    onApply(payload);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 md:p-6 animate-in fade-in duration-200">
      <div className="bg-white border border-brand-border rounded-3xl shadow-2xl max-w-5xl w-full p-6 md:p-8 space-y-5 max-h-[95vh] overflow-y-auto flex flex-col">
        <div className="flex justify-between items-start pb-2 border-b border-neutral-100">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-neutral-400">Garment Placement Editor</span>
            <h3 className="text-xl font-serif text-brand-primary">{title}</h3>
            <p className="text-xs text-brand-secondary mt-1 max-w-3xl">
              Define placement boxes for Large, Medium, and Small print sizes. Select an option below to draw or resize its box. Customer logos will auto-fit into the matching box and calculate accurate tier pricing.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-full transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Front / Back Side View Switcher */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 bg-neutral-100 p-1.5 rounded-2xl border border-neutral-200 w-fit mx-auto shadow-2xs">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveSide('front')}
              className={`px-6 py-2 rounded-xl text-xs font-extrabold transition-all uppercase tracking-wider flex items-center gap-2 cursor-pointer ${
                activeSide === 'front'
                  ? 'bg-neutral-900 text-white shadow-sm'
                  : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/60'
              }`}
            >
              <span>Front Placement</span>
              {Object.values(frontBoxes).some(Boolean) && (
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveSide('back')}
              className={`px-6 py-2 rounded-xl text-xs font-extrabold transition-all uppercase tracking-wider flex items-center gap-2 cursor-pointer ${
                activeSide === 'back'
                  ? 'bg-neutral-900 text-white shadow-sm'
                  : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/60'
              }`}
            >
              <span>Back Placement</span>
              {Object.values(backBoxes).some(Boolean) && (
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
              )}
            </button>
          </div>

          {activeSide === 'back' && onUploadBackMockup && (
            <label className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs shrink-0">
              {isUploadingBack ? <Loader2 className="animate-spin" size={13} /> : <Upload size={13} />}
              <span>{isUploadingBack ? 'Uploading...' : (isBackMockupSameAsFront ? 'Upload Back Image' : 'Change Back Image')}</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={isUploadingBack}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    setIsUploadingBack(true);
                    const uploadedUrl = await onUploadBackMockup(file);
                    setCustomBackUrl(uploadedUrl);
                  } catch (err) {
                    console.error("Error uploading back mockup:", err);
                    alert("Failed to upload back mockup image.");
                  } finally {
                    setIsUploadingBack(false);
                  }
                }}
              />
            </label>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {PRINT_SIZE_CONFIGS.map((cfg) => {
            const isSelected = activeSize === cfg.key;
            const hasBox = !!currentBoxes[cfg.key];
            const currentBox = currentBoxes[cfg.key];

            return (
              <div
                key={cfg.key}
                onClick={() => {
                  setActiveSize(cfg.key);
                  if (!hasBox) {
                    setCurrentBoxes(prev => ({ ...prev, [cfg.key]: cfg.defaultBox }));
                  }
                }}
                className={`relative p-3.5 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
                  isSelected 
                    ? 'bg-neutral-50 border-neutral-900 shadow-md ring-2 ring-neutral-900/10' 
                    : 'bg-white border-neutral-200 hover:border-neutral-400 hover:bg-neutral-50/50'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md ${cfg.badgeBg}`}>
                      {cfg.label}
                    </span>
                    {hasBox ? (
                      <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                        <Check size={12} /> Active
                      </span>
                    ) : (
                      <span className="text-[10px] font-medium text-neutral-400">Click to add</span>
                    )}
                  </div>
                  <p className="text-xs font-semibold text-neutral-800 mt-2">{cfg.subLabel}</p>
                </div>

                <div className="flex items-center justify-between mt-3 pt-2 border-t border-neutral-100">
                  <span className="text-[10px] font-mono text-neutral-500">
                    {hasBox ? `${Math.round(currentBox!.w)}% × ${Math.round(currentBox!.h)}%` : 'No box set'}
                  </span>
                  {hasBox && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCurrentBoxes(prev => ({ ...prev, [cfg.key]: null }));
                      }}
                      className="text-[10px] font-bold text-red-500 hover:text-red-700 px-1.5 py-0.5 rounded hover:bg-red-50 transition-colors cursor-pointer"
                      title={`Remove ${cfg.label} box`}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="relative flex-1 flex flex-col items-center justify-center bg-neutral-50 p-4 rounded-2xl border border-neutral-200 min-h-[420px]">
          <div
            ref={frameRef}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className="relative w-full max-w-[560px] aspect-[4/5] bg-checkerboard border-2 border-neutral-300 rounded-2xl overflow-hidden select-none touch-none shadow-lg"
          >
            <img
              src={currentMockUrl}
              alt="Garment mock"
              draggable="false"
              className="absolute inset-0 w-full h-full object-contain mix-blend-multiply pointer-events-none"
            />

            {PRINT_SIZE_CONFIGS.map((cfg) => {
              const b = currentBoxes[cfg.key];
              if (!b) return null;
              const isEditing = activeSize === cfg.key;

              return (
                <div
                  key={cfg.key}
                  onClick={() => setActiveSize(cfg.key)}
                  onPointerDown={(e) => isEditing && handlePointerDown(e, 'move')}
                  className={`absolute border-2 rounded-sm transition-all ${
                    isEditing 
                      ? 'border-dashed cursor-move z-30 shadow-md' 
                      : 'border-dashed opacity-60 hover:opacity-100 cursor-pointer z-20 hover:scale-[1.01]'
                  }`}
                  style={{
                    left: `${b.x}%`,
                    top: `${b.y}%`,
                    width: `${b.w}%`,
                    height: `${b.h}%`,
                    borderColor: isEditing ? cfg.activeBorderColor : cfg.borderColor,
                    backgroundColor: isEditing ? `${cfg.activeBorderColor}15` : `${cfg.borderColor}10`,
                    transform: `translate(-50%, -50%) rotate(${b.r ?? 0}deg)`,
                  }}
                >
                  <Crosshair
                    size={14}
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-neutral-900/60 pointer-events-none"
                  />
                  <span 
                    className={`absolute -top-6 left-0 text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded shadow-2xs pointer-events-none whitespace-nowrap ${cfg.badgeBg}`}
                  >
                    {cfg.badgeText} ({Math.round(b.w)}% × {Math.round(b.h)}%)
                  </span>

                  {isEditing && (
                    <>
                      <div
                        className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-7 flex flex-col items-center"
                        style={{ transformOrigin: 'bottom center' }}
                      >
                        <div className="w-0.5 h-4" style={{ backgroundColor: cfg.handleColor }} />
                        <div
                          onPointerDown={(e) => handlePointerDown(e, 'rotate')}
                          className="w-3.5 h-3.5 bg-white border-2 rounded-full shadow-md hover:scale-110 transition-transform cursor-alias"
                          style={{ borderColor: cfg.handleColor }}
                          title="Rotate box"
                        />
                      </div>

                      {RESIZE_HANDLES.map((handle) => {
                        const left = `${(handle.sx + 1) * 50}%`;
                        const top = `${(handle.sy + 1) * 50}%`;
                        return (
                          <div
                            key={handle.id}
                            onPointerDown={(e) => handlePointerDown(e, handle.id)}
                            className="absolute w-3 h-3 bg-white border-2 rounded-full shadow-xs -translate-x-1/2 -translate-y-1/2 z-40 hover:scale-125 transition-transform"
                            style={{
                              left,
                              top,
                              borderColor: cfg.handleColor,
                              cursor: handle.cursor,
                            }}
                            title={`Resize ${handle.id.toUpperCase()}`}
                          />
                        );
                      })}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex justify-between items-center pt-4 border-t border-brand-border">
          {hasExisting ? (
            <button
              type="button"
              onClick={onClear}
              className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-red-500 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
            >
              <Trash2 size={15} /> Clear All Placements
            </button>
          ) : <span />}
          <div className="flex gap-3">
            <PillButton variant="outline" onClick={onClose}>Cancel</PillButton>
            <PillButton variant="filled" onClick={handleSave} className="gap-2 px-6 py-2.5 text-xs font-bold">
              <Check size={16} /> Save All Placements
            </PillButton>
          </div>
        </div>
      </div>
    </div>
  );
}

export function StorefrontCatalogTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeSubMode, setActiveSubMode] = useState<'racks' | 'basics' | 'types'>('racks');

  // Firestore state
  const [racks, setRacks] = useState<Record<string, any>>(DEFAULT_RACKS);
  const [basics, setBasics] = useState<Record<string, any>>(DEFAULT_BASICS);
  const [customNames, setCustomNames] = useState<Record<string, any>>({ racks: {}, basics: {} });
  const [customSpecs, setCustomSpecs] = useState<Record<string, any>>({ racks: {}, basics: {} });
  const [customPrices, setCustomPrices] = useState<Record<string, any>>({ racks: {}, basics: {} });
  const [hiddenCollections, setHiddenCollections] = useState<Record<string, boolean>>({});
  const [defaultColors, setDefaultColors] = useState<Record<string, any>>({ racks: {}, basics: {} });
  const [logoPlacements, setLogoPlacements] = useState<Record<string, any>>({ racks: {}, basics: {} });
  const [customMockups, setCustomMockups] = useState<Record<string, any>>({ racks: {}, basics: {} });
  const [racksOrder, setRacksOrder] = useState<Record<string, string[]>>({});
  const [customProducts, setCustomProducts] = useState<any[]>([]);
  const [garmentTypeTags, setGarmentTypeTags] = useState<Record<string, string>>({});
  const [removeNeckTag, setRemoveNeckTag] = useState<Record<string, boolean>>({});
  const [colorMockups, setColorMockups] = useState<Record<string, Record<string, any>>>({});
  const [allowedColors, setAllowedColors] = useState<Record<string, string[]>>({});
  const [customColors, setCustomColors] = useState<Record<string, string[]>>({});
  const [isAddingCustomColor, setIsAddingCustomColor] = useState(false);
  const [newColorName, setNewColorName] = useState('');
  const [newColorFrontFile, setNewColorFrontFile] = useState<File | null>(null);
  const [newColorBackFile, setNewColorBackFile] = useState<File | null>(null);
  const [newColorFrontPreview, setNewColorFrontPreview] = useState<string | null>(null);
  const [newColorBackPreview, setNewColorBackPreview] = useState<string | null>(null);
  const [isSubmittingNewColor, setIsSubmittingNewColor] = useState(false);
  const [activeGarmentType, setActiveGarmentType] = useState<GarmentTypeId>('t-shirt');
  // Whether placement area boxes are shown to customers in the garment customizer
  const [showPublicPlacementGuides, setShowPublicPlacementGuides] = useState(true);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [uploadingSlotKey, setUploadingSlotKey] = useState<string | null>(null);
  const [activeColorModalItem, setActiveColorModalItem] = useState<any | null>(null);
  const [colorSearchQuery, setColorSearchQuery] = useState('');
  const [colorFilterTab, setColorFilterTab] = useState<'all' | 'enabled' | 'hidden' | 'custom'>('all');
  const [hideUsedGarments, setHideUsedGarments] = useState(false);
  // Optional storefront browse-card photo per style. Purely cosmetic: color
  // mockups, placement boxes, and pricing are untouched by this.
  const [cardImages, setCardImages] = useState<Record<string, string>>({});
  // Fit shown on storefront cards: Fitted · Standard · Loose (selected one bold)
  const [garmentFits, setGarmentFits] = useState<Record<string, string>>({});
  // True when the catalog failed to load — saving would wipe live data
  const [loadFailed, setLoadFailed] = useState(false);
  // Hard gate: no write may leave this page until the existing catalog has
  // been read back from the SERVER. Without this, a page that rendered
  // built-in defaults (offline, stale cache, failed read) can overwrite the
  // real catalog with empty maps.
  const catalogLoadedRef = useRef(false);
  const assertCatalogLoaded = (action: string) => {
    if (catalogLoadedRef.current) return true;
    alert(
      `Can't ${action} yet — your saved catalog hasn't loaded on this page.\n\n` +
      `Saving now would erase your color mockups and settings. Please check your ` +
      `internet connection, reload the page, and try again.`
    );
    return false;
  };

  // Logo placement editor modal state
  const [placementTarget, setPlacementTarget] = useState<{
    mode: 'racks' | 'basics';
    category: string;
    slot: string;
  } | null>(null);

  // Active category select
  const [activeRackCategory, setActiveRackCategory] = useState('Athleisure');
  const [activeBasicsCategory, setActiveBasicsCategory] = useState('T-Shirts');

  // Product selector modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeSelectTarget, setActiveSelectTarget] = useState<{
    mode: 'racks' | 'basics';
    category: string;
    slot: string;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const fetchCatalogSettings = async () => {
      try {
        const docRef = doc(db, 'settings', 'storefront-catalog');
        // Read from the SERVER, never the offline cache — a stale/empty cache
        // would render defaults that could then be saved over the real catalog
        const docSnap = await getDocFromServer(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.racks) setRacks(data.racks);
          if (data.basics) setBasics(data.basics);
          if (data.garmentTypeTags) setGarmentTypeTags(data.garmentTypeTags);
          if (data.removeNeckTag) setRemoveNeckTag(data.removeNeckTag);
          if (data.colorMockups) setColorMockups(data.colorMockups);
          if (data.allowedColors) setAllowedColors(data.allowedColors);
          if (data.customColors) setCustomColors(data.customColors);
          if (data.customNames) {
            setCustomNames(data.customNames);
          } else {
            setCustomNames({ racks: {}, basics: {} });
          }
          if (data.customSpecs) {
            setCustomSpecs(data.customSpecs);
          } else {
            setCustomSpecs({ racks: {}, basics: {} });
          }
          if (data.customPrices) {
            setCustomPrices(data.customPrices);
          } else {
            setCustomPrices({ racks: {}, basics: {} });
          }
          if (data.hiddenCollections) {
            setHiddenCollections(data.hiddenCollections);
          } else {
            setHiddenCollections({});
          }
          if (data.defaultColors) {
            setDefaultColors(data.defaultColors);
          } else {
            setDefaultColors({ racks: {}, basics: {} });
          }
          if (data.logoPlacements) {
            setLogoPlacements(data.logoPlacements);
          } else {
            setLogoPlacements({ racks: {}, basics: {} });
          }
          if (data.customMockups) {
            setCustomMockups(data.customMockups);
          } else {
            setCustomMockups({ racks: {}, basics: {} });
          }
          if (data.customCatalogItems && Array.isArray(data.customCatalogItems)) {
            setCustomProducts(data.customCatalogItems);
          }
          if (data.showPublicPlacementGuides !== undefined) {
            setShowPublicPlacementGuides(data.showPublicPlacementGuides !== false);
          }
          if (data.cardImages) setCardImages(data.cardImages);
          if (data.garmentFits) setGarmentFits(data.garmentFits);
          if (data.racksOrder) {
            setRacksOrder(data.racksOrder);
          } else {
            const defaultOrder: Record<string, string[]> = {};
            if (data.racks) {
              Object.entries(data.racks).forEach(([cat, catObj]) => {
                defaultOrder[cat] = Object.keys(catObj || {});
              });
            }
            setRacksOrder(defaultOrder);
          }
        }
        setLoadFailed(false);
        catalogLoadedRef.current = true; // writes are now safe
      } catch (err) {
        console.error("Error fetching storefront catalog settings:", err);
        // Saving now would overwrite the real catalog with empty defaults
        setLoadFailed(true);
        catalogLoadedRef.current = false;
      } finally {
        setLoading(false);
      }
    };
    fetchCatalogSettings();
  }, []);

  const persistColorSettings = async (
    nextAllowed?: Record<string, string[]>,
    nextMockups?: Record<string, Record<string, any>>,
    nextNeckTag?: Record<string, boolean>,
    nextCustomColors?: Record<string, string[]>
  ) => {
    if (!assertCatalogLoaded('save color settings')) return;
    try {
      await writeCatalog({
        allowedColors: nextAllowed ?? allowedColors,
        colorMockups: nextMockups ?? colorMockups,
        removeNeckTag: nextNeckTag ?? removeNeckTag,
        customColors: nextCustomColors ?? customColors,
      });
    } catch (err) {
      console.error("Error auto-persisting color settings to Firestore:", err);
    }
  };

  // One-click recovery from the bundled snapshot (src/data/catalog-backup.json),
  // captured 2026-08-14 before the destructive-write bug erased colorMockups.
  const handleRestoreBackup = async () => {
    const b: any = catalogBackup as any;
    const styleCount = Object.keys(b.colorMockups || {}).length;
    if (!confirm(
      `Restore the catalog backup?\n\n` +
      `This writes back ${styleCount} styles of color mockups, allowed colors, ` +
      `placements, prices, names and specs from the 2026-08-14 snapshot.\n\n` +
      `Anything you changed after that snapshot will be replaced.`
    )) return;
    setSaving(true);
    try {
      await writeCatalog({ ...b });
      alert('Catalog restored. Reloading…');
      window.location.reload();
    } catch (err) {
      console.error('Catalog restore failed:', err);
      alert('Restore failed. See console for details.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!assertCatalogLoaded('save the catalog')) return;
    if (loadFailed) {
      alert(
        'This page could not load your saved catalog, so saving now would overwrite it with blank defaults.\n\n' +
        'Please reload the page and try again.'
      );
      return;
    }
    setSaving(true);
    try {
      await writeCatalog(({
        racks,
        basics,
        customNames,
        customSpecs,
        customPrices,
        hiddenCollections,
        defaultColors,
        logoPlacements,
        customMockups,
        racksOrder,
        garmentTypeTags,
        removeNeckTag,
        colorMockups,
        allowedColors,
        customColors,
        showPublicPlacementGuides,
        cardImages,
        garmentFits,
      }));
      alert('Storefront catalog settings saved successfully!');
    } catch (err) {
      console.error("Error saving storefront catalog settings:", err);
      alert('Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleMockupUpload = async (e: React.ChangeEvent<HTMLInputElement>, mode: 'racks' | 'basics', category: string, slot: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!assertCatalogLoaded('upload a mockup')) return;
    const slotKey = `${mode}_${category}_${slot}`;
    setUploadingSlotKey(slotKey);
    try {
      const storageRef = ref(storage, `storefront_mockups/${mode}/${category}/${slot}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(storageRef);
      
      const updatedMockups = {
        ...customMockups,
        [mode]: {
          ...(customMockups[mode] || {}),
          [category]: {
            ...(customMockups[mode]?.[category] || {}),
            [slot]: downloadUrl
          }
        }
      };

      // Write ONLY what changed, merged. Writing the whole doc without
      // merge here previously DELETED colorMockups, allowedColors,
      // garmentTypeTags, removeNeckTag, cardImages and garmentFits.
      await writeCatalog({ customMockups: updatedMockups });

      setCustomMockups(updatedMockups);
      alert("Mockup uploaded and saved successfully!");
    } catch (err) {
      console.error("Failed to upload storefront mockup", err);
      alert("Failed to upload mockup image.");
    } finally {
      setUploadingSlotKey(null);
    }
  };

  const handleRemoveMockup = async (mode: 'racks' | 'basics', category: string, slot: string) => {
    if (!assertCatalogLoaded('remove a mockup')) return;
    if (!window.confirm("Restore original catalog image for this slot?")) return;
    const slotKey = `${mode}_${category}_${slot}`;
    setUploadingSlotKey(slotKey);
    try {
      const updatedMockups = { ...customMockups };
      if (updatedMockups[mode]?.[category]) {
        delete updatedMockups[mode][category][slot];
      }

      // Write ONLY what changed, merged. Writing the whole doc without
      // merge here previously DELETED colorMockups, allowedColors,
      // garmentTypeTags, removeNeckTag, cardImages and garmentFits.
      await writeCatalog({ customMockups: updatedMockups });

      setCustomMockups(updatedMockups);
      alert("Mockup override removed successfully!");
    } catch (err) {
      console.error("Failed to remove storefront mockup", err);
      alert("Failed to remove mockup image override.");
    } finally {
      setUploadingSlotKey(null);
    }
  };

  const handleOpenSelector = (mode: 'racks' | 'basics', category: string, slot: string) => {
    setActiveSelectTarget({ mode, category, slot });
    setSearchQuery('');
    setIsModalOpen(true);
  };

  const handleSelectProduct = async (style: string) => {
    if (!activeSelectTarget) return;

    const { mode, category, slot } = activeSelectTarget;

    let nextRacks = racks;
    let nextBasics = basics;

    // Custom display names are slot-level branding and intentionally survive product swaps
    if (mode === 'racks') {
      nextRacks = {
        ...racks,
        [category]: {
          ...(racks[category] || {}),
          [slot]: style
        }
      };
      setRacks(nextRacks);
    } else {
      nextBasics = {
        ...basics,
        [category]: {
          ...(basics[category] || {}),
          [slot]: style
        }
      };
      setBasics(nextBasics);
    }

    setIsModalOpen(false);
    setActiveSelectTarget(null);

    // Auto-persist slot garment replacement to Firestore
    try {
      await writeCatalog({ racks: nextRacks, basics: nextBasics });
    } catch (err) {
      console.error("Error auto-persisting replaced garment slot to Firestore:", err);
    }
  };

  const handleAddTheme = () => {
    const themeName = prompt("Enter a name for the new theme/collection:");
    if (!themeName) return;
    
    const cleanName = themeName.trim();
    if (!cleanName) {
      alert("Theme name cannot be empty.");
      return;
    }
    
    if (racks[cleanName]) {
      alert("A theme with this name already exists.");
      return;
    }

    // Copy current active theme slots to initialize the new theme
    const currentSlots = racks[activeRackCategory] || {
      hat: 'STC70',
      shirt: 'BC3001',
      polo: 'ST640',
      crewneck: 'DT1304',
      hoodie: 'BC3719',
      longsleeve: 'BC3501'
    };

    setRacks(prev => ({
      ...prev,
      [cleanName]: { ...currentSlots }
    }));
    setRacksOrder(prev => ({
      ...prev,
      [cleanName]: racksOrder[activeRackCategory] || Object.keys(currentSlots)
    }));
    setActiveRackCategory(cleanName);
  };

  const handleRenameTheme = () => {
    const newName = prompt(`Enter a new name for the theme "${activeRackCategory}":`, activeRackCategory);
    if (!newName) return;

    const cleanNewName = newName.trim();
    if (!cleanNewName || cleanNewName === activeRackCategory) return;

    if (racks[cleanNewName]) {
      alert("A theme with this name already exists.");
      return;
    }

    const currentSlots = racks[activeRackCategory];
    const newRacks = { ...racks };
    delete newRacks[activeRackCategory];
    newRacks[cleanNewName] = currentSlots;

    // We also need to copy/rename customNames, customSpecs, defaultColors, and logoPlacements if they exist!
    const newCustomNames = { ...customNames };
    if (newCustomNames.racks?.[activeRackCategory]) {
      newCustomNames.racks[cleanNewName] = newCustomNames.racks[activeRackCategory];
      delete newCustomNames.racks[activeRackCategory];
    }

    const newCustomSpecs = { ...customSpecs };
    if (newCustomSpecs.racks?.[activeRackCategory]) {
      newCustomSpecs.racks[cleanNewName] = newCustomSpecs.racks[activeRackCategory];
      delete newCustomSpecs.racks[activeRackCategory];
    }

    const newCustomPrices = { ...customPrices };
    if (newCustomPrices.racks?.[activeRackCategory]) {
      newCustomPrices.racks[cleanNewName] = newCustomPrices.racks[activeRackCategory];
      delete newCustomPrices.racks[activeRackCategory];
    }

    const newHiddenCollections = { ...hiddenCollections };
    if (newHiddenCollections[activeRackCategory] !== undefined) {
      newHiddenCollections[cleanNewName] = newHiddenCollections[activeRackCategory];
      delete newHiddenCollections[activeRackCategory];
    }

    const newDefaultColors = { ...defaultColors };
    if (newDefaultColors.racks?.[activeRackCategory]) {
      newDefaultColors.racks[cleanNewName] = newDefaultColors.racks[activeRackCategory];
      delete newDefaultColors.racks[activeRackCategory];
    }

    const newLogoPlacements = { ...logoPlacements };
    if (newLogoPlacements.racks?.[activeRackCategory]) {
      newLogoPlacements.racks[cleanNewName] = newLogoPlacements.racks[activeRackCategory];
      delete newLogoPlacements.racks[activeRackCategory];
    }

    const newRacksOrder = { ...racksOrder };
    if (newRacksOrder[activeRackCategory]) {
      newRacksOrder[cleanNewName] = newRacksOrder[activeRackCategory];
      delete newRacksOrder[activeRackCategory];
    }

    setRacks(newRacks);
    setRacksOrder(newRacksOrder);
    setCustomNames(newCustomNames);
    setCustomSpecs(newCustomSpecs);
    setCustomPrices(newCustomPrices);
    setHiddenCollections(newHiddenCollections);
    setDefaultColors(newDefaultColors);
    setLogoPlacements(newLogoPlacements);
    setActiveRackCategory(cleanNewName);
  };

  const handleDeleteTheme = () => {
    const keys = Object.keys(racks);
    if (keys.length <= 1) {
      alert("You must keep at least one theme collection.");
      return;
    }

    if (!confirm(`Are you sure you want to delete the theme "${activeRackCategory}"?`)) {
      return;
    }

    const newRacks = { ...racks };
    delete newRacks[activeRackCategory];
    const newRacksOrder = { ...racksOrder };
    delete newRacksOrder[activeRackCategory];

    const newHiddenCollections = { ...hiddenCollections };
    delete newHiddenCollections[activeRackCategory];

    const newCustomPrices = { ...customPrices };
    if (newCustomPrices.racks) {
      delete newCustomPrices.racks[activeRackCategory];
    }

    // Find new active category
    const remainingKeys = Object.keys(newRacks);
    const newActive = remainingKeys[0];

    setRacks(newRacks);
    setRacksOrder(newRacksOrder);
    setHiddenCollections(newHiddenCollections);
    setCustomPrices(newCustomPrices);
    setActiveRackCategory(newActive);
  };

  const handleAddSlot = () => {
    const name = window.prompt("Enter a name for the new product slot (e.g. Jacket, Pants, Accessories):");
    if (!name) return;
    const cleanName = name.trim();
    if (!cleanName) return;

    const slotKey = cleanName.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .trim()
      .replace(/\s+/g, '_');

    if (racks[activeRackCategory]?.[slotKey] !== undefined) {
      alert(`A slot named "${cleanName}" already exists in this collection.`);
      return;
    }

    setRacks(prev => ({
      ...prev,
      [activeRackCategory]: {
        ...prev[activeRackCategory],
        [slotKey]: ''
      }
    }));
    setRacksOrder(prev => {
      const currentOrder = prev[activeRackCategory] || Object.keys(racks[activeRackCategory] || {});
      return {
        ...prev,
        [activeRackCategory]: [...currentOrder.filter(k => k !== slotKey), slotKey]
      };
    });

    setCustomNames(prev => {
      const racks = prev.racks || {};
      const catObj = racks[activeRackCategory] || {};
      return {
        ...prev,
        racks: {
          ...racks,
          [activeRackCategory]: {
            ...catObj,
            [slotKey]: cleanName
          }
        }
      };
    });
  };

  const handleDeleteSlot = (slotKey: string) => {
    if (!window.confirm(`Are you sure you want to delete the slot "${slotKey}"?`)) return;
    setRacks(prev => {
      const updated = { ...prev };
      if (updated[activeRackCategory]) {
        const catObj = { ...updated[activeRackCategory] };
        delete catObj[slotKey];
        updated[activeRackCategory] = catObj;
      }
      return updated;
    });
    setRacksOrder(prev => {
      const currentOrder = prev[activeRackCategory] || [];
      return {
        ...prev,
        [activeRackCategory]: currentOrder.filter(k => k !== slotKey)
      };
    });

    setCustomNames(prev => {
      const updated = { ...prev };
      if (updated.racks && updated.racks[activeRackCategory]) {
        const catObj = { ...updated.racks[activeRackCategory] };
        delete catObj[slotKey];
        updated.racks[activeRackCategory] = catObj;
      }
      return updated;
    });

    setCustomSpecs(prev => {
      const updated = { ...prev };
      if (updated.racks && updated.racks[activeRackCategory]) {
        const catObj = { ...updated.racks[activeRackCategory] };
        delete catObj[slotKey];
        updated.racks[activeRackCategory] = catObj;
      }
      return updated;
    });

    setDefaultColors(prev => {
      const updated = { ...prev };
      if (updated.racks && updated.racks[activeRackCategory]) {
        const catObj = { ...updated.racks[activeRackCategory] };
        delete catObj[slotKey];
        updated.racks[activeRackCategory] = catObj;
      }
      return updated;
    });

    setLogoPlacements(prev => {
      const updated = { ...prev };
      if (updated.racks && updated.racks[activeRackCategory]) {
        const catObj = { ...updated.racks[activeRackCategory] };
        delete catObj[slotKey];
        updated.racks[activeRackCategory] = catObj;
      }
      return updated;
    });
  };

  const handleMoveSlot = (slot: string, direction: 'left' | 'right') => {
    const categoryRacks = racks[activeRackCategory];
    if (!categoryRacks) return;

    const currentOrder = racksOrder[activeRackCategory] || Object.keys(categoryRacks);
    const index = currentOrder.indexOf(slot);
    if (index === -1) return;

    const targetIndex = direction === 'left' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= currentOrder.length) return; // out of bounds

    const newOrder = [...currentOrder];
    newOrder[index] = currentOrder[targetIndex];
    newOrder[targetIndex] = currentOrder[index];

    setRacksOrder(prev => ({
      ...prev,
      [activeRackCategory]: newOrder
    }));

    const newCategoryRacks: Record<string, string> = {};
    newOrder.forEach(k => {
      newCategoryRacks[k] = categoryRacks[k];
    });

    setRacks(prev => ({
      ...prev,
      [activeRackCategory]: newCategoryRacks
    }));
  };

  // Firestore rejects any write containing `undefined` (the placement modal
  // marks absent box sizes as undefined). Strip them deeply before persisting.
  const pruneUndefinedDeep = (val: any): any => {
    if (Array.isArray(val)) return val.map(pruneUndefinedDeep);
    if (val && typeof val === 'object') {
      const out: any = {};
      Object.entries(val).forEach(([k, v]) => {
        if (v === undefined) return;
        out[k] = pruneUndefinedDeep(v);
      });
      return out;
    }
    return val;
  };

  // Storefront card photo (display only — never used for mockups/pricing)
  const persistCardImages = async (next: Record<string, string>) => {
    if (!assertCatalogLoaded('save the card photo')) return;
    setCardImages(next);
    try {
      await writeCatalog({ cardImages: next });
    } catch (err) {
      console.error('Error saving storefront card photo:', err);
      alert('Failed to save the card photo — please try again.');
    }
  };

  const handleCardImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, style: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const styleKey = style.toLowerCase().trim();
    setUploadingSlotKey(`card_${styleKey}`);
    try {
      const storageRef = ref(storage, `storefront_card_images/${styleKey}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      await persistCardImages({ ...cardImages, [styleKey]: url });
    } catch (err) {
      console.error('Card photo upload failed:', err);
      alert('Upload failed. Please try again.');
    } finally {
      setUploadingSlotKey(null);
      e.target.value = '';
    }
  };

  const renderCardPhotoControl = (style: string) => {
    const styleKey = style.toLowerCase().trim();
    const current = cardImages[styleKey];
    const isUploading = uploadingSlotKey === `card_${styleKey}`;
    return (
      <div>
        <label className="text-[9px] font-extrabold uppercase tracking-wider text-neutral-400 block mb-1">
          Storefront Card Photo (optional)
        </label>
        <div className="flex items-center gap-2">
          <div className="w-12 h-12 shrink-0 rounded-lg border border-brand-border bg-checkerboard overflow-hidden flex items-center justify-center">
            {current ? (
              <img src={current} alt="Card" className="max-w-full max-h-full object-contain" />
            ) : (
              <ImageIcon size={14} className="text-neutral-400" />
            )}
          </div>
          <label className="flex-1 cursor-pointer">
            <input type="file" accept="image/*" className="hidden" onChange={(e) => handleCardImageUpload(e, style)} />
            <div className="w-full text-center bg-white border border-brand-border hover:border-brand-primary rounded-xl py-1.5 text-[10px] font-bold text-brand-primary transition-colors">
              {isUploading ? 'Uploading…' : current ? 'Replace Photo' : 'Upload Photo'}
            </div>
          </label>
          {current && (
            <button
              type="button"
              onClick={() => {
                const next = { ...cardImages };
                delete next[styleKey];
                persistCardImages(next);
              }}
              className="p-1.5 text-neutral-400 hover:text-red-600 transition-colors cursor-pointer"
              title="Remove card photo (revert to mockup)"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
        <p className="text-[9px] text-neutral-400 mt-1 leading-snug">
          Shown only on the storefront browse cards. Colors, placement boxes, and pricing keep using the real mockups.
        </p>
      </div>
    );
  };

  // Garment fit shown on the storefront cards (Fitted · Standard · Loose)
  const persistGarmentFits = async (next: Record<string, string>) => {
    if (!assertCatalogLoaded('save the fit')) return;
    setGarmentFits(next);
    try {
      await writeCatalog({ garmentFits: next });
    } catch (err) {
      console.error('Error saving garment fit:', err);
      alert('Failed to save the fit — please try again.');
    }
  };

  const renderFitControl = (style: string) => {
    const styleKey = style.toLowerCase().trim();
    const current = garmentFits[styleKey] || 'Standard';
    return (
      <div>
        <label className="text-[9px] font-extrabold uppercase tracking-wider text-neutral-400 block mb-1">
          Garment Fit
        </label>
        <div className="grid grid-cols-3 gap-1.5">
          {(['Fitted', 'Standard', 'Loose'] as const).map(fit => (
            <button
              key={fit}
              type="button"
              onClick={() => persistGarmentFits({ ...garmentFits, [styleKey]: fit })}
              className={`py-1.5 rounded-xl border text-[10px] font-bold transition-colors cursor-pointer ${
                current === fit
                  ? 'bg-brand-primary text-white border-brand-primary'
                  : 'bg-white text-brand-secondary border-brand-border hover:border-brand-primary hover:text-brand-primary'
              }`}
            >
              {fit}
            </button>
          ))}
        </div>
      </div>
    );
  };

  // Single writer for the catalog doc.
  //
  // updateDoc REPLACES each named top-level field, so removing a rack slot,
  // color mockup or placement actually sticks — setDoc({merge:true}) deep-
  // merges maps and would silently resurrect deleted keys. Fields we don't
  // name are left untouched, so this can't wipe unrelated settings.
  const writeCatalog = async (fields: Record<string, any>) => {
    const refDoc = doc(db, 'settings', 'storefront-catalog');
    const payload = pruneUndefinedDeep({ ...fields, updatedAt: new Date().toISOString() });
    try {
      await updateDoc(refDoc, payload);
    } catch (err: any) {
      if (err?.code === 'not-found') {
        await setDoc(refDoc, payload, { merge: true });
      } else {
        throw err;
      }
    }
  };

  const handleApplyPlacement = async (box: MultiLogoBoxes | LogoBox) => {
    if (!placementTarget) return;
    if (!assertCatalogLoaded('save placements')) return;
    const { mode, category, slot } = placementTarget;
    const nextPlacements: any = {
      ...logoPlacements,
      [mode]: {
        ...(logoPlacements[mode] || {}),
        [category]: {
          ...((logoPlacements[mode] || {})[category] || {}),
          [slot]: box
        }
      }
    };
    // Also stamp the canonical per-style record: one placement per garment
    // style, applied everywhere that style appears (all categories + colors).
    const styleForSlot = mode === 'racks'
      ? (racks as any)?.[category]?.[slot]
      : (basics as any)?.[category]?.[slot];
    if (styleForSlot) {
      nextPlacements.byStyle = {
        ...((logoPlacements as any).byStyle || {}),
        [String(styleForSlot).toUpperCase()]: box
      };
    }
    const cleanPlacements = pruneUndefinedDeep(nextPlacements);
    setLogoPlacements(cleanPlacements);
    setPlacementTarget(null);

    try {
      await writeCatalog({ logoPlacements: cleanPlacements });
    } catch (err) {
      console.error("Error auto-persisting logo placement to Firestore:", err);
      alert('Failed to save placement boxes — please try again. (See console for details.)');
    }
  };

  const handleClearPlacement = async () => {
    if (!placementTarget) return;
    if (!assertCatalogLoaded('clear placements')) return;
    const { mode, category, slot } = placementTarget;
    const modeMap = logoPlacements[mode] || {};
    const cat = { ...(modeMap[category] || {}) };
    delete cat[slot];

    const nextPlacements: any = {
      ...logoPlacements,
      [mode]: {
        ...modeMap,
        [category]: cat
      }
    };
    // Clear the canonical per-style record too so it doesn't resurrect the boxes
    const styleForSlot = mode === 'racks'
      ? (racks as any)?.[category]?.[slot]
      : (basics as any)?.[category]?.[slot];
    if (styleForSlot && (logoPlacements as any).byStyle) {
      const nextByStyle = { ...(logoPlacements as any).byStyle };
      delete nextByStyle[String(styleForSlot).toUpperCase()];
      nextPlacements.byStyle = nextByStyle;
    }
    const cleanPlacements = pruneUndefinedDeep(nextPlacements);
    setLogoPlacements(cleanPlacements);
    setPlacementTarget(null);

    try {
      await writeCatalog({ logoPlacements: cleanPlacements });
    } catch (err) {
      console.error("Error auto-persisting cleared placement to Firestore:", err);
      alert('Failed to clear placement boxes — please try again. (See console for details.)');
    }
  };

  // Where each garment style is already assigned (rack slots + basics tiers),
  // so the selector can flag duplicates across collections.
  const garmentUsageMap = useMemo(() => {
    const map = new Map<string, { mode: 'racks' | 'basics'; category: string; slot: string }[]>();
    const add = (style: any, entry: { mode: 'racks' | 'basics'; category: string; slot: string }) => {
      const key = String(style || '').toLowerCase().trim();
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(entry);
    };
    Object.entries(racks || {}).forEach(([cat, slots]: [string, any]) => {
      Object.entries(slots || {}).forEach(([slot, style]) => add(style, { mode: 'racks', category: cat, slot }));
    });
    Object.entries(basics || {}).forEach(([cat, tiers]: [string, any]) => {
      Object.entries(tiers || {}).forEach(([tier, style]) => add(style, { mode: 'basics', category: cat, slot: tier }));
    });
    return map;
  }, [racks, basics]);

  const getGarmentUsage = (style: string) => {
    const all = garmentUsageMap.get(String(style || '').toLowerCase().trim()) || [];
    if (!activeSelectTarget) return all;
    // Don't flag the slot currently being edited
    return all.filter(u => !(
      u.mode === activeSelectTarget.mode &&
      u.category === activeSelectTarget.category &&
      u.slot === activeSelectTarget.slot
    ));
  };

  // Merge built-in catalog with imported custom non-SanMar items
  const allCatalogProducts = useMemo(() => {
    const map = new Map<string, any>();
    sanmarCatalog.forEach(p => map.set(p.style.toLowerCase(), p));
    customProducts.forEach(p => map.set(p.style.toLowerCase(), p));
    return Array.from(map.values());
  }, [customProducts]);

  const getProductDetails = (style: string) => {
    const base = allCatalogProducts.find(p => p.style.toLowerCase() === style.toLowerCase()) || {
      style,
      title: 'Unknown Garment',
      brand: 'N/A',
      price: 0,
      colors: [],
      images: null
    };
    const extra = customColors[style.toLowerCase()] || [];
    if (extra.length > 0) {
      return {
        ...base,
        colors: Array.from(new Set([...(base.colors || []), ...extra]))
      };
    }
    return base;
  };

  // Curated products chosen across LIVE Rack collections only
  const storefrontCuratedProducts = useMemo(() => {
    const stylesSet = new Set<string>();
    if (racks) {
      Object.keys(racks).forEach(cat => {
        if (!hiddenCollections[cat]) {
          const catObj = racks[cat];
          if (catObj && typeof catObj === 'object') {
            Object.values(catObj).forEach(style => {
              if (typeof style === 'string' && style.trim()) {
                stylesSet.add(style.trim().toLowerCase());
              }
            });
          }
        }
      });
    }

    return Array.from(stylesSet)
      .map(style => getProductDetails(style))
      .filter(Boolean) as any[];
  }, [racks, hiddenCollections, allCatalogProducts]);

  // Filter products by search query
  const filteredProducts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return allCatalogProducts;
    const cleanQ = q.replace(/[\s-]/g, '');
    return allCatalogProducts.filter(p => {
      const style = (p.style || '').toLowerCase();
      const cleanStyle = style.replace(/[\s-]/g, '');
      const title = (p.title || '').toLowerCase();
      const brand = (p.brand || '').toLowerCase();
      return (
        style.includes(q) ||
        cleanStyle.includes(cleanQ) ||
        title.includes(q) ||
        brand.includes(q)
      );
    });
  }, [allCatalogProducts, searchQuery]);

  const findColorMockupEntry = (p: any, chosenColor?: string) => {
    if (!p || !colorMockups || Object.keys(colorMockups).length === 0) return null;

    const candidateStyles = [p.style, p.itemNum]
      .filter(Boolean)
      .map(s => String(s).toLowerCase().trim());

    const mockupStyleKeys = Object.keys(colorMockups);
    let matchedStyleKey: string | undefined;

    for (const cand of candidateStyles) {
      const cleanCand = cand.replace(/[\s-]/g, '');
      const cleanCandNoPrefix = cleanCand.replace(/^(bc|nl|dt)/i, '');
      const cleanCandNoCvc = cleanCand.replace(/cvc$/i, '');
      const cleanCandBase = cleanCand.replace(/^(bc|nl|dt)|cvc$/gi, '');

      matchedStyleKey = mockupStyleKeys.find(k => {
        const cleanK = k.toLowerCase().trim().replace(/[\s-]/g, '');
        const cleanKNoPrefix = cleanK.replace(/^(bc|nl|dt)/i, '');
        const cleanKNoCvc = cleanK.replace(/cvc$/i, '');
        const cleanKBase = cleanK.replace(/^(bc|nl|dt)|cvc$/gi, '');

        return cleanK === cleanCand ||
               cleanKNoPrefix === cleanCandNoPrefix ||
               cleanKNoCvc === cleanCandNoCvc ||
               cleanKBase === cleanCandBase ||
               (cleanCand.length >= 3 && cleanK.includes(cleanCand)) ||
               (cleanK.length >= 3 && cleanCand.includes(cleanK));
      });

      if (matchedStyleKey) break;
    }

    if (!matchedStyleKey) return null;
    const styleMap = colorMockups[matchedStyleKey];
    if (!styleMap) return null;

    // If chosenColor is provided, try exact / clean match first
    if (chosenColor) {
      const cKey = chosenColor.toLowerCase().trim();
      const matchingColorKey = Object.keys(styleMap).find(k => {
        const cleanK = k.toLowerCase().trim();
        return cleanK === cKey || cleanK.replace(/[\s-]/g, '') === cKey.replace(/[\s-]/g, '');
      });
      if (matchingColorKey && styleMap[matchingColorKey]) {
        return { styleMap, colorEntry: styleMap[matchingColorKey] };
      }
    }

    // Fallback: return the first color entry in styleMap
    const firstColorKey = Object.keys(styleMap)[0];
    if (firstColorKey && styleMap[firstColorKey]) {
      return { styleMap, colorEntry: styleMap[firstColorKey] };
    }

    return { styleMap, colorEntry: null };
  };

  const getGarmentImage = (p: any, chosenColor?: string, mode?: 'racks' | 'basics', category?: string, slot?: string) => {
    if (!p) return 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&q=80&w=200&h=200';

    // 1. Explicit slot mockup override
    if (mode && category && slot && customMockups?.[mode]?.[category]?.[slot]) {
      return customMockups[mode][category][slot];
    }

    // 2. Color-specific custom mockup override from colorMockups
    const mockupRes = findColorMockupEntry(p, chosenColor);
    if (mockupRes) {
      const { styleMap, colorEntry } = mockupRes;
      if (colorEntry) {
        const frontUrl = typeof colorEntry === 'string' ? colorEntry : (colorEntry?.front || colorEntry?.back);
        if (frontUrl) return frontUrl;
      }
      if (styleMap) {
        for (const cKey of Object.keys(styleMap)) {
          const entry = styleMap[cKey];
          const frontUrl = typeof entry === 'string' ? entry : (entry?.front || entry?.back);
          if (frontUrl) return frontUrl;
        }
      }
    }

    // 3. Search customMockups for any rack/basics slot assigned to this garment style
    const candidateStyles = [p.style, p.itemNum]
      .filter(Boolean)
      .map(s => String(s).toLowerCase().trim());

    if (candidateStyles.length > 0) {
      if (racks) {
        for (const cat of Object.keys(racks)) {
          const catObj = racks[cat];
          if (catObj && typeof catObj === 'object') {
            for (const sKey of Object.keys(catObj)) {
              const val = String(catObj[sKey] || '').toLowerCase().trim();
              if (candidateStyles.includes(val) && customMockups?.racks?.[cat]?.[sKey]) {
                return customMockups.racks[cat][sKey];
              }
            }
          }
        }
      }
      if (basics) {
        for (const cat of Object.keys(basics)) {
          const catObj = basics[cat];
          if (catObj && typeof catObj === 'object') {
            for (const sKey of Object.keys(catObj)) {
              const val = String(catObj[sKey] || '').toLowerCase().trim();
              if (candidateStyles.includes(val) && customMockups?.basics?.[cat]?.[sKey]) {
                return customMockups.basics[cat][sKey];
              }
            }
          }
        }
      }
    }

    // 4. Default SanMar catalog image fallback
    if (p?.image) return p.image;
    if (p?.images) {
      const colorKey = (chosenColor && p.images[chosenColor]) 
        ? chosenColor 
        : (p.colors?.[0] || Object.keys(p.images)[0]);
      if (colorKey && p.images[colorKey]) {
        const val = p.images[colorKey];
        if (typeof val === 'string') return val;
        return val.front || val.swatch || '';
      }
    }
    return 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&q=80&w=200&h=200';
  };

  const getGarmentBackImage = (p: any, chosenColor?: string, mode?: 'racks' | 'basics', category?: string, slot?: string) => {
    if (!p) return '';

    // 1. Check colorMockups for custom back mockups
    const mockupRes = findColorMockupEntry(p, chosenColor);
    if (mockupRes) {
      const { styleMap, colorEntry } = mockupRes;
      
      if (typeof colorEntry === 'object' && colorEntry !== null) {
        const backUrl = (colorEntry as any).back || (colorEntry as any).backMockup;
        if (backUrl) return backUrl;
      }

      if (styleMap) {
        for (const cKey of Object.keys(styleMap)) {
          const entry = styleMap[cKey];
          if (typeof entry === 'object' && entry !== null) {
            const backUrl = (entry as any).back || (entry as any).backMockup;
            if (backUrl) return backUrl;
          }
        }
      }
    }

    // 2. Check catalog backImages
    if (p?.backImages) {
      if (chosenColor && typeof p.backImages === 'object') {
        const matchKey = Object.keys(p.backImages).find(k => k.toLowerCase().trim() === chosenColor.toLowerCase().trim());
        if (matchKey) {
          const val = p.backImages[matchKey];
          const backUrl = typeof val === 'string' ? val : (val?.back || val?.front);
          if (backUrl) return backUrl;
        }
      }
      if (typeof p.backImages === 'object') {
        const firstVal = Object.values(p.backImages)[0] as any;
        const backUrl = typeof firstVal === 'string' ? firstVal : (firstVal?.back || firstVal?.front);
        if (backUrl) return backUrl;
      }
      if (typeof p.backImages === 'string') return p.backImages;
    }

    // 3. Fallback to front image
    return getGarmentImage(p, chosenColor, mode, category, slot);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="animate-spin text-brand-secondary" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h2 className={tokens.typography.h2 + " mb-1 flex items-center gap-2"}>
            Storefront Catalog Configuration
          </h2>
          <p className={tokens.typography.bodyMuted}>
            Configure curated garments available for Design Your Rack and Build From Basics.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
          <button
            type="button"
            onClick={async () => {
              const next = !showPublicPlacementGuides;
              setShowPublicPlacementGuides(next);
              try {
                await writeCatalog({ showPublicPlacementGuides: next });
              } catch (err) {
                console.error('Failed to save placement guide visibility:', err);
                alert('Failed to save setting — please try again.');
                setShowPublicPlacementGuides(!next);
              }
            }}
            className={`flex items-center gap-1.5 px-3 py-2 border rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs ${
              showPublicPlacementGuides
                ? 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-800'
                : 'bg-neutral-100 hover:bg-neutral-200 border-brand-border text-brand-secondary'
            }`}
            title="Show or hide the print placement area boxes on the public-facing garment customizer"
          >
            {showPublicPlacementGuides ? <Eye size={14} /> : <EyeOff size={14} />}
            <span>{showPublicPlacementGuides ? 'Customer Placement Guides: On' : 'Customer Placement Guides: Off'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const updated: Record<string, boolean> = {};
              allCatalogProducts.forEach(p => {
                if (p.style) updated[p.style.toLowerCase()] = true;
              });
              setRemoveNeckTag(updated);
              alert("Tagless neck tag removal activated for all storefront catalog products!");
            }}
            className="flex items-center gap-1.5 px-3 py-2 bg-neutral-100 hover:bg-neutral-200 border border-brand-border rounded-xl text-xs font-bold text-brand-primary transition-all cursor-pointer shadow-2xs"
            title="Automatically erase manufacturer neck tags from all color variation mockup images"
          >
            <Scissors size={14} />
            <span>Tagless All Mockups</span>
          </button>

          <button
            type="button"
            onClick={handleRestoreBackup}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-amber-50 border border-amber-300 text-amber-800 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs disabled:opacity-50"
            title="Restore color mockups, allowed colors and placements from the 2026-08-14 snapshot"
          >
            <ArrowLeft size={14} />
            <span>Restore Backup</span>
          </button>

          <PillButton
            variant="filled"
            onClick={handleSaveSettings}
            disabled={saving}
            className="gap-2 shrink-0 min-w-[140px]"
          >
            {saving ? <Loader2 className="animate-spin" size={16} /> : <><Save size={16} /> Save Catalog</>}
          </PillButton>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border border-brand-border bg-neutral-50 p-1 rounded-xl gap-1">
        <button
          onClick={() => setActiveSubMode('racks')}
          className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex-1 text-center ${
            activeSubMode === 'racks'
              ? 'bg-white text-brand-primary shadow-xs font-extrabold'
              : 'text-brand-secondary hover:text-brand-primary'
          }`}
        >
          Design Your Rack Collections
        </button>
        <button
          onClick={() => setActiveSubMode('basics')}
          className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex-1 text-center ${
            activeSubMode === 'basics'
              ? 'bg-white text-brand-primary shadow-xs font-extrabold'
              : 'text-brand-secondary hover:text-brand-primary'
          }`}
        >
          Build From Basics Good/Better/Best
        </button>
        <button
          onClick={() => setActiveSubMode('types')}
          className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex-1 text-center ${
            activeSubMode === 'types'
              ? 'bg-white text-brand-primary shadow-xs font-extrabold'
              : 'text-brand-secondary hover:text-brand-primary'
          }`}
        >
          Browse By Garment Type
        </button>
      </div>

      {/* Rack Collections Manager */}
      {activeSubMode === 'racks' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Select Collection:</span>
              <select
                value={activeRackCategory}
                onChange={(e) => setActiveRackCategory(e.target.value)}
                className="bg-white border border-brand-border rounded-xl px-3 py-2 text-xs font-bold text-brand-primary focus:outline-none cursor-pointer"
              >
                {Object.keys(racks).map(cat => (
                  <option key={cat} value={cat}>
                    {cat}{hiddenCollections[cat] ? ' (Hidden)' : ''}
                  </option>
                ))}
              </select>

              {/* Visibility Toggle Button */}
              <button
                type="button"
                onClick={() => {
                  const isHidden = !!hiddenCollections[activeRackCategory];
                  setHiddenCollections(prev => ({
                    ...prev,
                    [activeRackCategory]: !isHidden
                  }));
                }}
                className={`flex items-center gap-1.5 px-3 py-2 border rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs ${
                  hiddenCollections[activeRackCategory]
                    ? 'bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-900'
                    : 'bg-emerald-50 hover:bg-emerald-100 border-emerald-300 text-emerald-900'
                }`}
                title={hiddenCollections[activeRackCategory] ? "Collection is hidden from public storefront and customer portals. Click to publish/unhide." : "Collection is visible to public and customer portals. Click to hide while making edits."}
              >
                {hiddenCollections[activeRackCategory] ? (
                  <>
                    <EyeOff size={14} className="text-amber-600 shrink-0" />
                    <span>Hidden from Public</span>
                  </>
                ) : (
                  <>
                    <Eye size={14} className="text-emerald-600 shrink-0" />
                    <span>Live (Public)</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleAddTheme}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 border border-brand-border rounded-lg text-xs font-bold text-brand-primary transition-all cursor-pointer animate-in fade-in duration-150"
                title="Add a new theme/collection"
              >
                <Plus size={12} className="text-neutral-500" />
                <span>Add Theme</span>
              </button>
              <button
                type="button"
                onClick={handleAddSlot}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 border border-brand-border rounded-lg text-xs font-bold text-brand-primary transition-all cursor-pointer animate-in fade-in duration-150"
                title="Add a new product slot to this collection"
              >
                <Plus size={12} className="text-neutral-500" />
                <span>Add Slot</span>
              </button>
              <button
                type="button"
                onClick={handleRenameTheme}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 border border-brand-border rounded-lg text-xs font-bold text-brand-primary transition-all cursor-pointer animate-in fade-in duration-150"
                title="Rename currently selected theme"
              >
                <Edit2 size={12} className="text-neutral-500" />
                <span>Rename</span>
              </button>
              <button
                type="button"
                onClick={handleDeleteTheme}
                disabled={Object.keys(racks).length <= 1}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 border border-red-200 disabled:opacity-40 disabled:pointer-events-none rounded-lg text-xs font-bold text-red-700 transition-all cursor-pointer animate-in fade-in duration-150"
                title="Delete currently selected theme"
              >
                <Trash2 size={12} />
                <span>Delete</span>
              </button>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 text-amber-800 text-xs">
            <Info size={16} className="shrink-0 mt-0.5" />
            <p>
              Configure the pre-curated products to construct the "standard rack" for this theme. You can add, rename, or delete slots to fit different occasions. Click <strong>Change</strong> to select a product for any slot.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {(() => {
              const slots = getOrderedKeys(racks[activeRackCategory], activeRackCategory, racksOrder);
              const totalSlots = slots.length;
              return slots.map((slot, slotIndex) => {
                const style = racks[activeRackCategory]?.[slot] || '';
                const p = getProductDetails(style) as any;
                const customName = customNames.racks?.[activeRackCategory]?.[slot] || '';
                
                return (
                  <div key={slot} className="border border-brand-border rounded-2xl p-5 bg-neutral-50/50 flex flex-col justify-between gap-4">
                    <div className="space-y-3">
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="text-[10px] font-extrabold uppercase tracking-widest text-brand-secondary block">
                            {slot.replace(/_/g, ' ').replace('longsleeve', 'long sleeve')} Slot
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleMoveSlot(slot, 'left')}
                              disabled={slotIndex === 0}
                              className="text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 disabled:opacity-30 disabled:pointer-events-none rounded p-1 transition-colors cursor-pointer flex items-center justify-center"
                              title="Move Left"
                            >
                              <ArrowLeft size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveSlot(slot, 'right')}
                              disabled={slotIndex === totalSlots - 1}
                              className="text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 disabled:opacity-30 disabled:pointer-events-none rounded p-1 transition-colors cursor-pointer flex items-center justify-center"
                              title="Move Right"
                            >
                              <ArrowRight size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteSlot(slot)}
                              className="text-red-550 hover:text-red-700 hover:bg-red-50 rounded p-1 transition-colors cursor-pointer flex items-center justify-center"
                              title={`Delete slot "${slot}"`}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>

                      {/* Image Preview */}
                      {p.style ? (
                        <div className="w-full h-36 bg-white border border-brand-border/60 rounded-xl flex items-center justify-center p-2 mb-3 relative overflow-hidden bg-checkerboard group/mockup cursor-pointer">
                          <img 
                            src={getGarmentImage(p, defaultColors.racks?.[activeRackCategory]?.[slot], 'racks', activeRackCategory, slot)} 
                            alt={p.title} 
                            className="max-w-full max-h-full object-contain mix-blend-multiply" 
                          />
                          {uploadingSlotKey === `racks_${activeRackCategory}_${slot}` ? (
                            <div className="absolute inset-0 bg-black/55 flex items-center justify-center rounded-xl">
                              <Loader2 size={16} className="animate-spin text-white" />
                            </div>
                          ) : (
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/mockup:opacity-100 flex items-center justify-center gap-2 transition-opacity rounded-xl">
                              <label className="p-2 hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer text-white flex items-center gap-1.5 text-xs font-bold" title="Upload custom mockup">
                                <input 
                                  type="file" 
                                  className="hidden" 
                                  accept="image/*" 
                                  onChange={(e) => handleMockupUpload(e, 'racks', activeRackCategory, slot)} 
                                />
                                <Edit2 size={14} />
                                <span>Change Mockup</span>
                              </label>
                              {customMockups?.racks?.[activeRackCategory]?.[slot] && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveMockup('racks', activeRackCategory, slot)}
                                  className="p-2 hover:bg-neutral-800 text-white rounded-lg transition-colors"
                                  title="Remove mockup override"
                                >
                                  <Trash2 size={14} className="hover:text-red-400" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="w-full h-36 bg-white border border-dashed border-neutral-300 rounded-xl flex flex-col items-center justify-center gap-1.5 p-4 mb-3">
                          <ImageIcon size={28} className="text-neutral-300 animate-pulse" />
                          <span className="text-[10px] font-bold uppercase text-neutral-400">No Product Assigned</span>
                        </div>
                      )}

                      <h4 className="text-sm font-bold text-brand-primary leading-snug">
                        {p.brand} {p.style || '(Empty Slot)'}
                      </h4>
                      <p className="text-xs text-brand-secondary mt-1 font-medium truncate" title={customName || p.title}>
                        {customName || p.title}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs text-brand-primary font-bold">
                          ${(customPrices.racks?.[activeRackCategory]?.[slot] !== undefined ? customPrices.racks[activeRackCategory][slot] : p.price).toFixed(2)}
                        </span>
                        {customPrices.racks?.[activeRackCategory]?.[slot] !== undefined && (
                          <span className="text-[9px] font-extrabold uppercase text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">Custom Price</span>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="text-[9px] font-extrabold uppercase tracking-wider text-neutral-400 block mb-1">
                        Garment Price ($)
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1.5 text-xs text-neutral-400 font-bold">$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={customPrices.racks?.[activeRackCategory]?.[slot] !== undefined ? customPrices.racks[activeRackCategory][slot] : ''}
                          placeholder={`Default catalog: $${p.price.toFixed(2)}`}
                          onChange={(e) => {
                            const val = e.target.value === '' ? undefined : parseFloat(e.target.value);
                            setCustomPrices(prev => {
                              const racksMap = prev.racks || {};
                              const catMap = racksMap[activeRackCategory] || {};
                              const updatedCat = { ...catMap };
                              if (val === undefined || isNaN(val)) {
                                delete updatedCat[slot];
                              } else {
                                updatedCat[slot] = val;
                              }
                              return {
                                ...prev,
                                racks: {
                                  ...racksMap,
                                  [activeRackCategory]: updatedCat
                                }
                              };
                            });
                          }}
                          className="w-full bg-white border border-brand-border rounded-xl pl-7 pr-3 py-1.5 text-xs font-bold text-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary transition-all placeholder:text-neutral-400 placeholder:font-normal"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[9px] font-extrabold uppercase tracking-wider text-neutral-400 block mb-1">
                        Custom Display Name
                      </label>
                      <input
                        type="text"
                        value={customName}
                        placeholder={p.title}
                        onChange={(e) => {
                          const newName = e.target.value;
                          setCustomNames(prev => {
                            const racks = prev.racks || {};
                            const cat = racks[activeRackCategory] || {};
                            return {
                              ...prev,
                              racks: {
                                ...racks,
                                [activeRackCategory]: {
                                  ...cat,
                                  [slot]: newName
                                }
                              }
                            };
                          });
                        }}
                        className="w-full bg-white border border-brand-border rounded-xl px-3 py-1.5 text-xs text-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary transition-all placeholder:text-neutral-400 placeholder:italic"
                      />
                    </div>

                    {renderCardPhotoControl(p.style)}

                    {renderFitControl(p.style)}

                    <div>
                      <label className="text-[9px] font-extrabold uppercase tracking-wider text-neutral-400 block mb-1">
                        Garment Type Tag
                      </label>
                      <select
                        value={p.style ? detectGarmentTypeTag(p, garmentTypeTags) : 't-shirt'}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (p.style) {
                            setGarmentTypeTags(prev => ({
                              ...prev,
                              [p.style.toLowerCase()]: val
                            }));
                          }
                        }}
                        disabled={!p.style}
                        className="w-full bg-white border border-brand-border rounded-xl px-3 py-1.5 text-xs font-bold text-brand-primary focus:outline-none cursor-pointer disabled:opacity-50"
                      >
                        {GARMENT_TYPES.map(gt => (
                          <option key={gt.id} value={gt.id}>{gt.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[9px] font-extrabold uppercase tracking-wider text-neutral-400 block mb-1">
                        Description
                      </label>
                      <textarea
                        rows={3}
                        value={customSpecs.racks?.[activeRackCategory]?.[slot]?.description !== undefined ? customSpecs.racks[activeRackCategory][slot].description : p.description || ''}
                        placeholder="Garment description..."
                        onChange={(e) => {
                          const val = e.target.value;
                          setCustomSpecs(prev => {
                            const racks = prev.racks || {};
                            const cat = racks[activeRackCategory] || {};
                            const slotSpecs = cat[slot] || {};
                            return {
                              ...prev,
                              racks: {
                                ...racks,
                                [activeRackCategory]: {
                                  ...cat,
                                  [slot]: {
                                    ...slotSpecs,
                                    description: val
                                  }
                                }
                              }
                            };
                          });
                        }}
                        className="w-full bg-white border border-brand-border rounded-xl px-3 py-2 text-xs text-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary transition-all placeholder:text-neutral-400 resize-y"
                      />
                    </div>

                    {/* Default Color Selector */}
                    {p.colors && p.colors.length > 0 && (
                      <div>
                        <label className="text-[9px] font-extrabold uppercase tracking-wider text-neutral-400 block mb-1">
                          Default Display Color
                        </label>
                        <select
                          value={defaultColors.racks?.[activeRackCategory]?.[slot] || p.colors[0]}
                          onChange={(e) => {
                            const newColor = e.target.value;
                            setDefaultColors(prev => {
                              const racks = prev.racks || {};
                              const cat = racks[activeRackCategory] || {};
                              return {
                                ...prev,
                                racks: {
                                  ...racks,
                                  [activeRackCategory]: {
                                    ...cat,
                                    [slot]: newColor
                                  }
                                }
                              };
                            });
                          }}
                          className="w-full bg-white border border-brand-border rounded-xl px-3 py-1.5 text-xs font-bold text-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary transition-all"
                        >
                          {p.colors.map((col: string) => (
                            <option key={col} value={col}>{col}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    {p.style && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const key = p.style.toLowerCase();
                            setRemoveNeckTag(prev => ({
                              ...prev,
                              [key]: !(prev[key] ?? true)
                            }));
                          }}
                          className={`flex-1 py-2 px-3 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 border ${
                            (removeNeckTag[p.style.toLowerCase()] ?? true)
                              ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                              : 'bg-neutral-100 text-neutral-600 border-neutral-200'
                          }`}
                          title="Toggle tagless collar (erases manufacturer neck tag on canvas mockups for all color variations)"
                        >
                          <Scissors size={12} />
                          <span>{(removeNeckTag[p.style.toLowerCase()] ?? true) ? 'Tagless Active' : 'Original Tag'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setActiveColorModalItem(p)}
                          className={`flex-1 py-2 px-3 border rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                            (allowedColors[p.style.toLowerCase()] !== undefined && getFilteredProductColors(p, allowedColors).length < (p.colors?.length || 0))
                              ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                              : 'bg-white border-brand-border text-brand-primary hover:bg-neutral-50'
                          }`}
                          title="Manage custom mockups, tagless collar, and available storefront colors"
                        >
                          <ImageIcon size={12} />
                          <span>Colors ({getFilteredProductColors(p, allowedColors).length}{(allowedColors[p.style.toLowerCase()] !== undefined && getFilteredProductColors(p, allowedColors).length < (p.colors?.length || 0)) ? `/${p.colors?.length || 0}` : ''})</span>
                        </button>
                      </div>
                    )}
                    <button
                      onClick={() => setPlacementTarget({ mode: 'racks', category: activeRackCategory, slot })}
                      className="w-full py-2 bg-white border border-brand-border text-brand-primary rounded-xl text-xs font-bold transition-all shadow-2xs hover:bg-neutral-50 flex items-center justify-center gap-1.5"
                    >
                      <Crosshair size={13} />
                      Set Logo Placement
                      {logoPlacements.racks?.[activeRackCategory]?.[slot] && (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Placement configured" />
                      )}
                    </button>
                    <button
                      onClick={() => handleOpenSelector('racks', activeRackCategory, slot)}
                      className="w-full py-2 bg-white border border-brand-border text-brand-primary rounded-xl text-xs font-bold transition-all shadow-2xs hover:bg-neutral-50"
                    >
                      Change Product
                    </button>
                  </div>
                </div>
              );
            });
          })()}
          </div>
        </div>
      )}

      {/* Build From Basics Manager */}
      {activeSubMode === 'basics' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="flex items-center gap-4">
            <span className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Select Basic Type:</span>
            <select
              value={activeBasicsCategory}
              onChange={(e) => setActiveBasicsCategory(e.target.value)}
              className="bg-white border border-brand-border rounded-xl px-3 py-2 text-xs font-bold text-brand-primary focus:outline-none"
            >
              {Object.keys(basics).map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 text-amber-800 text-xs">
            <Info size={16} className="shrink-0 mt-0.5" />
            <p>
              Basics require exactly three products for the Good, Better, and Best options to present to the user. Click <strong>Change</strong> to select a new product.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {['good', 'better', 'best'].map(slot => {
              const style = basics[activeBasicsCategory]?.[slot] || '';
              const p = getProductDetails(style) as any;
              const customName = customNames.basics?.[activeBasicsCategory]?.[slot] || '';

              return (
                <div key={slot} className="border border-brand-border rounded-2xl p-5 bg-neutral-50/50 flex flex-col justify-between gap-4">
                  <div className="space-y-3">
                    <div>
                      <span className={`text-[10px] font-extrabold uppercase tracking-widest block mb-1 ${
                        slot === 'good' ? 'text-neutral-500' : slot === 'better' ? 'text-blue-500' : 'text-emerald-500'
                      }`}>
                        {slot} Tier
                      </span>

                      {/* Image Preview */}
                      {p.style && (
                        <div className="w-full h-36 bg-white border border-brand-border/60 rounded-xl flex items-center justify-center p-2 mb-3 relative overflow-hidden bg-checkerboard group/mockup cursor-pointer">
                          <img 
                            src={getGarmentImage(p, defaultColors.basics?.[activeBasicsCategory]?.[slot], 'basics', activeBasicsCategory, slot)} 
                            alt={p.title} 
                            className="max-w-full max-h-full object-contain mix-blend-multiply" 
                          />
                          {uploadingSlotKey === `basics_${activeBasicsCategory}_${slot}` ? (
                            <div className="absolute inset-0 bg-black/55 flex items-center justify-center rounded-xl">
                              <Loader2 size={16} className="animate-spin text-white" />
                            </div>
                          ) : (
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/mockup:opacity-100 flex items-center justify-center gap-2 transition-opacity rounded-xl">
                              <label className="p-2 hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer text-white flex items-center gap-1.5 text-xs font-bold" title="Upload custom mockup">
                                <input 
                                  type="file" 
                                  className="hidden" 
                                  accept="image/*" 
                                  onChange={(e) => handleMockupUpload(e, 'basics', activeBasicsCategory, slot)} 
                                />
                                <Edit2 size={14} />
                                <span>Change Mockup</span>
                              </label>
                              {customMockups?.basics?.[activeBasicsCategory]?.[slot] && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveMockup('basics', activeBasicsCategory, slot)}
                                  className="p-2 hover:bg-neutral-800 text-white rounded-lg transition-colors"
                                  title="Remove mockup override"
                                >
                                  <Trash2 size={14} className="hover:text-red-400" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      <h4 className="text-sm font-bold text-brand-primary leading-snug">
                        {p.brand} {p.style}
                      </h4>
                      <p className="text-xs text-brand-secondary mt-1 font-medium truncate" title={customName || p.title}>
                        {customName || p.title}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs text-brand-primary font-bold">
                          ${(customPrices.basics?.[activeBasicsCategory]?.[slot] !== undefined ? customPrices.basics[activeBasicsCategory][slot] : p.price).toFixed(2)}
                        </span>
                        {customPrices.basics?.[activeBasicsCategory]?.[slot] !== undefined && (
                          <span className="text-[9px] font-extrabold uppercase text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">Custom Price</span>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="text-[9px] font-extrabold uppercase tracking-wider text-neutral-400 block mb-1">
                        Garment Price ($)
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1.5 text-xs text-neutral-400 font-bold">$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={customPrices.basics?.[activeBasicsCategory]?.[slot] !== undefined ? customPrices.basics[activeBasicsCategory][slot] : ''}
                          placeholder={`Default catalog: $${p.price.toFixed(2)}`}
                          onChange={(e) => {
                            const val = e.target.value === '' ? undefined : parseFloat(e.target.value);
                            setCustomPrices(prev => {
                              const basicsMap = prev.basics || {};
                              const catMap = basicsMap[activeBasicsCategory] || {};
                              const updatedCat = { ...catMap };
                              if (val === undefined || isNaN(val)) {
                                delete updatedCat[slot];
                              } else {
                                updatedCat[slot] = val;
                              }
                              return {
                                ...prev,
                                basics: {
                                  ...basicsMap,
                                  [activeBasicsCategory]: updatedCat
                                }
                              };
                            });
                          }}
                          className="w-full bg-white border border-brand-border rounded-xl pl-7 pr-3 py-1.5 text-xs font-bold text-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary transition-all placeholder:text-neutral-400 placeholder:font-normal"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[9px] font-extrabold uppercase tracking-wider text-neutral-400 block mb-1">
                        Custom Display Name
                      </label>
                      <input
                        type="text"
                        value={customName}
                        placeholder={p.title}
                        onChange={(e) => {
                          const newName = e.target.value;
                          setCustomNames(prev => {
                            const basics = prev.basics || {};
                            const cat = basics[activeBasicsCategory] || {};
                            return {
                              ...prev,
                              basics: {
                                ...basics,
                                [activeBasicsCategory]: {
                                  ...cat,
                                  [slot]: newName
                                }
                              }
                            };
                          });
                        }}
                        className="w-full bg-white border border-brand-border rounded-xl px-3 py-1.5 text-xs text-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary transition-all placeholder:text-neutral-400 placeholder:italic"
                      />
                    </div>

                    {renderCardPhotoControl(p.style)}

                    {renderFitControl(p.style)}

                    <div>
                      <label className="text-[9px] font-extrabold uppercase tracking-wider text-neutral-400 block mb-1">
                        Description
                      </label>
                      <textarea
                        rows={3}
                        value={customSpecs.basics?.[activeBasicsCategory]?.[slot]?.description !== undefined ? customSpecs.basics[activeBasicsCategory][slot].description : p.description || ''}
                        placeholder="Garment description..."
                        onChange={(e) => {
                          const val = e.target.value;
                          setCustomSpecs(prev => {
                            const basics = prev.basics || {};
                            const cat = basics[activeBasicsCategory] || {};
                            const slotSpecs = cat[slot] || {};
                            return {
                              ...prev,
                              basics: {
                                ...basics,
                                [activeBasicsCategory]: {
                                  ...cat,
                                  [slot]: {
                                    ...slotSpecs,
                                    description: val
                                  }
                                }
                              }
                            };
                          });
                        }}
                        className="w-full bg-white border border-brand-border rounded-xl px-3 py-2 text-xs text-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary transition-all placeholder:text-neutral-400 resize-y"
                      />
                    </div>

                    {/* Default Color Selector */}
                    {p.colors && p.colors.length > 0 && (
                      <div>
                        <label className="text-[9px] font-extrabold uppercase tracking-wider text-neutral-400 block mb-1">
                          Default Display Color
                        </label>
                        <select
                          value={defaultColors.basics?.[activeBasicsCategory]?.[slot] || p.colors[0]}
                          onChange={(e) => {
                            const newColor = e.target.value;
                            setDefaultColors(prev => {
                              const basics = prev.basics || {};
                              const cat = basics[activeBasicsCategory] || {};
                              return {
                                ...prev,
                                basics: {
                                  ...basics,
                                  [activeBasicsCategory]: {
                                    ...cat,
                                    [slot]: newColor
                                  }
                                }
                              };
                            });
                          }}
                          className="w-full bg-white border border-brand-border rounded-xl px-3 py-1.5 text-xs font-bold text-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary transition-all"
                        >
                          {p.colors.map((col: string) => (
                            <option key={col} value={col}>{col}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <button
                      onClick={() => setPlacementTarget({ mode: 'basics', category: activeBasicsCategory, slot })}
                      className="w-full py-2 bg-white border border-brand-border text-brand-primary rounded-xl text-xs font-bold transition-all shadow-2xs hover:bg-neutral-50 flex items-center justify-center gap-1.5"
                    >
                      <Crosshair size={13} />
                      Set Logo Placement
                      {logoPlacements.basics?.[activeBasicsCategory]?.[slot] && (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Placement configured" />
                      )}
                    </button>
                    <button
                      onClick={() => handleOpenSelector('basics', activeBasicsCategory, slot)}
                      className="w-full py-2 bg-white border border-brand-border text-brand-primary rounded-xl text-xs font-bold transition-all shadow-2xs hover:bg-neutral-50"
                    >
                      Change Product
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Garment Types Manager */}
      {activeSubMode === 'types' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 text-amber-800 text-xs">
            <Info size={16} className="shrink-0 mt-0.5" />
            <p>
              Tag and organize garments by type (<strong>T-Shirt, Polo, Hoodie, Longsleeve, Crewneck, Jacket, Hat, Pants, Shorts</strong>). Customers can browse your storefront using these garment categories to find exactly what they need.
            </p>
          </div>

          {/* Garment Type Selector Pills */}
          <div className="flex flex-wrap items-center gap-2 pb-2">
            {GARMENT_TYPES.map(gt => {
              const count = storefrontCuratedProducts.filter(p => detectGarmentTypeTag(p, garmentTypeTags) === gt.id).length;
              const isActive = activeGarmentType === gt.id;
              return (
                <button
                  key={gt.id}
                  type="button"
                  onClick={() => setActiveGarmentType(gt.id as GarmentTypeId)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 border ${
                    isActive
                      ? 'bg-brand-primary text-white border-brand-primary shadow-xs'
                      : 'bg-white text-brand-primary border-brand-border hover:bg-neutral-50'
                  }`}
                >
                  <span>{gt.label}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                    isActive ? 'bg-white/20 text-white' : 'bg-neutral-100 text-neutral-600'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Products Grid for Active Garment Type */}
          {(() => {
            const activeTypeConfig = GARMENT_TYPES.find(gt => gt.id === activeGarmentType)!;
            const items = storefrontCuratedProducts.filter(p => detectGarmentTypeTag(p, garmentTypeTags) === activeGarmentType);

            return (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-brand-border pb-3">
                  <div>
                    <h3 className="text-base font-serif text-brand-primary font-bold">
                      {activeTypeConfig.label} Catalog ({items.length} garments)
                    </h3>
                    <p className="text-xs text-brand-secondary">{activeTypeConfig.description}</p>
                  </div>
                </div>

                {items.length === 0 ? (
                  <div className="text-center py-12 bg-neutral-50 rounded-2xl border border-dashed border-neutral-300 space-y-2">
                    <p className="text-xs font-bold text-neutral-500">No garments currently tagged as {activeTypeConfig.label}.</p>
                    <p className="text-[11px] text-neutral-400">Tag garments from your other catalog tabs or change tags below.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {items.map(p => {
                      const styleKey = p.style.toLowerCase();
                      const customTag = garmentTypeTags[styleKey];
                      const detectedTag = detectGarmentTypeTag(p, garmentTypeTags);
                      
                      return (
                        <div key={p.style} className="border border-brand-border rounded-2xl p-5 bg-white flex flex-col justify-between gap-4 shadow-2xs hover:shadow-xs transition-all">
                          <div className="space-y-3">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] font-extrabold uppercase tracking-widest bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded">
                                {p.style}
                              </span>
                              {customTag ? (
                                <span className="text-[9px] font-extrabold uppercase text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                                  Custom Tagged
                                </span>
                              ) : (
                                <span className="text-[9px] font-extrabold uppercase text-neutral-400 bg-neutral-50 border border-neutral-200 px-1.5 py-0.5 rounded">
                                  Auto Tagged
                                </span>
                              )}
                            </div>

                            <div className="w-full h-36 bg-neutral-50 border border-brand-border/60 rounded-xl flex items-center justify-center p-2 relative overflow-hidden bg-checkerboard">
                              <img
                                src={getGarmentImage(p)}
                                alt={p.title}
                                className="max-w-full max-h-full object-contain mix-blend-multiply"
                              />
                            </div>

                            <div>
                              <h4 className="text-sm font-bold text-brand-primary leading-snug">
                                {p.brand} {p.style}
                              </h4>
                              <p className="text-xs text-brand-secondary mt-1 font-medium truncate" title={p.title}>
                                {p.title}
                              </p>
                              <span className="text-xs text-brand-primary font-bold block mt-1">
                                Base Price: ${p.price.toFixed(2)}
                              </span>
                            </div>
                          </div>

                          <div className="space-y-3 pt-3 border-t border-neutral-100">
                            <div>
                              <label className="text-[9px] font-extrabold uppercase tracking-wider text-neutral-400 block mb-1">
                                Garment Type Tag
                              </label>
                              <select
                                value={detectedTag}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setGarmentTypeTags(prev => ({
                                    ...prev,
                                    [styleKey]: val
                                  }));
                                }}
                                className="w-full bg-neutral-50 border border-brand-border rounded-xl px-3 py-1.5 text-xs font-bold text-brand-primary focus:outline-none cursor-pointer"
                              >
                                {GARMENT_TYPES.map(gt => (
                                  <option key={gt.id} value={gt.id}>{gt.label}</option>
                                ))}
                              </select>
                            </div>

                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setRemoveNeckTag(prev => ({
                                    ...prev,
                                    [styleKey]: !(prev[styleKey] ?? true)
                                  }));
                                }}
                                className={`flex-1 py-1.5 px-3 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 border ${
                                  (removeNeckTag[styleKey] ?? true)
                                    ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                                    : 'bg-neutral-100 text-neutral-600 border-neutral-200'
                                }`}
                                title="Toggle tagless collar (erases manufacturer neck tag on canvas mockups)"
                              >
                                <Scissors size={12} />
                                <span>{(removeNeckTag[styleKey] ?? true) ? 'Tagless' : 'Original Tag'}</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setActiveColorModalItem(p)}
                                className={`flex-1 py-1.5 px-3 border rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                                  (allowedColors[p.style.toLowerCase()] !== undefined && getFilteredProductColors(p, allowedColors).length < (p.colors?.length || 0))
                                    ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                                    : 'bg-white border-brand-border text-brand-primary hover:bg-neutral-50'
                                }`}
                                title="Manage custom mockups, tagless collar, and available storefront colors"
                              >
                                <ImageIcon size={12} />
                                <span>Colors ({getFilteredProductColors(p, allowedColors).length}{(allowedColors[p.style.toLowerCase()] !== undefined && getFilteredProductColors(p, allowedColors).length < (p.colors?.length || 0)) ? `/${p.colors?.length || 0}` : ''})</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center pt-6 border-t border-brand-border/60 gap-4 mt-8">
        <p className="text-xs text-brand-secondary">
          Configure all slots and logo placements above, then click save to update the live storefront catalog.
        </p>
        <PillButton 
          variant="filled" 
          onClick={handleSaveSettings} 
          disabled={saving}
          className="gap-2 shrink-0 min-w-[160px] shadow-sm hover:shadow-md transition-all"
        >
          {saving ? <Loader2 className="animate-spin" size={16} /> : <><Save size={16} /> Save Catalog</>}
        </PillButton>
      </div>

      {/* Logo Placement Editor Modal */}
      {placementTarget && (() => {
        const { mode, category, slot } = placementTarget;
        const style = (mode === 'racks' ? racks : basics)[category]?.[slot] || '';
        const p = getProductDetails(style) as any;
        const chosenColor = (mode === 'racks' ? defaultColors.racks : defaultColors.basics)?.[category]?.[slot];
        // Prefer the canonical per-style record (the "main mock" placements shared
        // by every category/color this style appears in), fall back to per-slot.
        const styleKeyForSlot = mode === 'racks'
          ? (racks as any)?.[category]?.[slot]
          : (basics as any)?.[category]?.[slot];
        const canonical = styleKeyForSlot
          ? ((logoPlacements as any).byStyle?.[String(styleKeyForSlot).toUpperCase()] as MultiLogoBoxes | undefined)
          : undefined;
        const existing = canonical ?? (logoPlacements[mode]?.[category]?.[slot] as MultiLogoBoxes | undefined);
        return (
          <LogoPlacementModal
             title={`${category} — ${slot.replace('longsleeve', 'long sleeve').toUpperCase()} (${p.brand} ${p.style})`}
             imageUrl={getGarmentImage(p, chosenColor, mode, category, slot)}
             backImageUrl={getGarmentBackImage(p, chosenColor, mode, category, slot)}
             onUploadBackMockup={async (file: File) => {
               const modalStyleKey = p.style.toLowerCase().trim();
               const colorKey = chosenColor || (p.colors?.[0] || 'Default');
               const storageRef = ref(storage, `storefront_color_mockups/${modalStyleKey}/${colorKey}_back_${Date.now()}_${file.name}`);
               await uploadBytes(storageRef, file);
               const url = await getDownloadURL(storageRef);
               setColorMockups(prev => {
                 const existing = prev[modalStyleKey]?.[colorKey];
                 const front = typeof existing === 'string' ? existing : (typeof existing === 'object' ? existing?.front : undefined);
                 return {
                   ...prev,
                   [modalStyleKey]: {
                     ...(prev[modalStyleKey] || {}),
                     [colorKey]: { ...(front ? { front } : {}), back: url }
                   }
                 };
               });
               return url;
             }}
            initialBox={existing || slotDefaultBox(slot)}
            hasExisting={!!existing}
            onApply={handleApplyPlacement}
            onClear={handleClearPlacement}
            onClose={() => setPlacementTarget(null)}
          />
        );
      })()}

      {/* Modal Dialog for Selector */}
      {isModalOpen && activeSelectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white border border-brand-border rounded-2xl shadow-2xl max-w-2xl w-full p-6 space-y-6 overflow-hidden max-h-[85vh] flex flex-col">
            <div className="flex items-start justify-between gap-4 border-b border-neutral-100 pb-4">
              <div>
                <h3 className="text-lg font-serif text-brand-primary">
                  Select Garment for {activeSelectTarget.category} ({activeSelectTarget.slot.toUpperCase()})
                </h3>
                <p className="text-xs text-brand-secondary mt-1">
                  Select one of the {allCatalogProducts.length} premium products or import a non-SanMar item.
                </p>
                <button
                  type="button"
                  onClick={() => setHideUsedGarments(prev => !prev)}
                  className={`mt-2.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-colors cursor-pointer ${
                    hideUsedGarments
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : 'bg-neutral-50 border-brand-border text-brand-secondary hover:text-brand-primary'
                  }`}
                >
                  {hideUsedGarments ? <EyeOff size={11} /> : <Eye size={11} />}
                  {hideUsedGarments ? 'Hiding garments already in use' : 'Hide garments already in use'}
                </button>
              </div>
              <button
                type="button"
                onClick={() => setIsImportModalOpen(true)}
                className="px-3.5 py-2 text-xs font-bold text-black bg-neutral-100 hover:bg-neutral-200 border border-neutral-250 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
              >
                <Plus size={13} />
                <span>+ Import Non-SanMar Item</span>
              </button>
            </div>

            {/* Search */}
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search styles, brands, titles..."
                className="w-full bg-neutral-50 border border-brand-border rounded-xl pl-10 pr-4 py-2.5 text-xs text-brand-primary focus:outline-none"
              />
              <Search className="absolute left-3.5 top-3 text-neutral-400" size={15} />
            </div>

            {/* Product List */}
            <div className="flex-1 overflow-y-auto divide-y divide-brand-border/40 pr-1 max-h-[45vh] custom-scrollbar">
              {filteredProducts.length === 0 ? (
                <div className="text-center py-8 space-y-3">
                  <p className="text-xs text-brand-secondary">No matching garments found for "{searchQuery}".</p>
                  <button
                    type="button"
                    onClick={() => setIsImportModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-black bg-neutral-100 hover:bg-neutral-200 rounded-xl cursor-pointer"
                  >
                    <Plus size={13} />
                    <span>Import "{searchQuery}" as Custom Item</span>
                  </button>
                </div>
              ) : (
                filteredProducts
                  .filter(p => !hideUsedGarments || getGarmentUsage(p.style).length === 0)
                  .map(p => {
                    const usage = getGarmentUsage(p.style);
                    const inUse = usage.length > 0;
                    return (
                      <div
                        key={p.style}
                        onClick={() => handleSelectProduct(p.style)}
                        className={`flex justify-between items-center py-3.5 px-2 rounded-lg cursor-pointer transition-colors ${
                          inUse ? 'bg-amber-50/40 hover:bg-amber-50' : 'hover:bg-neutral-50'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs bg-neutral-100 px-2 py-0.5 rounded font-bold uppercase">{p.style}</span>
                            <span className="text-xs font-bold text-brand-primary">{p.brand}</span>
                            {(p as any).isCustom && (
                              <span className="text-[9px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Custom</span>
                            )}
                            {inUse && (
                              <span className="text-[9px] bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                                In use ×{usage.length}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-brand-secondary mt-1 truncate max-w-lg">{p.title} - {p.category}</p>
                          {inUse && (
                            <p className="text-[10px] text-amber-800 mt-1 font-semibold truncate max-w-lg">
                              Already assigned to {usage.slice(0, 3).map(u => `${u.category} · ${u.slot.toUpperCase()}`).join(', ')}
                              {usage.length > 3 ? ` +${usage.length - 3} more` : ''}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                          <span className="text-xs font-bold text-brand-primary">${p.price.toFixed(2)}</span>
                          {(p as any).isCustom && (
                            <button
                              type="button"
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (!confirm(`Delete custom item "${p.style} - ${p.title}" from the database?`)) return;
                                const updated = customProducts.filter(cp => cp.style.toLowerCase() !== p.style.toLowerCase());
                                setCustomProducts(updated);
                                try {
                                  await writeCatalog({ customCatalogItems: updated });
                                  const qSnap = await getDocs(query(collection(db, 'custom-catalog-items'), where('style', '==', p.style)));
                                  for (const docSnap of qSnap.docs) {
                                    await deleteDoc(docSnap.ref);
                                  }
                                } catch (err) {
                                  console.error("Error deleting custom product from database:", err);
                                }
                              }}
                              className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="Delete custom item from database"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                          <div className="w-6 h-6 rounded-full bg-neutral-50 border border-brand-border flex items-center justify-center text-brand-secondary hover:bg-brand-primary hover:text-white transition-colors">
                            <Check size={12} />
                          </div>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>

            <div className="flex justify-end pt-4 border-t border-brand-border">
              <PillButton variant="outline" onClick={() => setIsModalOpen(false)}>
                Cancel
              </PillButton>
            </div>
          </div>
        </div>
      )}

      {/* Import Custom Item Modal */}
      {/* Color Variations & Mockups Modal (Full-screen Manager) */}
      {activeColorModalItem && (() => {
        const modalStyleKey = activeColorModalItem.style.toLowerCase().trim();
        const baseItemColors: string[] = activeColorModalItem.colors || [];
        const extraCustomColors: string[] = customColors[modalStyleKey] || [];
        const allItemColors: string[] = Array.from(new Set([...baseItemColors, ...extraCustomColors]));
        const currentAllowed: string[] = allowedColors[modalStyleKey] ?? allItemColors;
        const allowedCount = currentAllowed.length;
        const totalCount = allItemColors.length;
        const hiddenCount = totalCount - allowedCount;

        let customMockupCount = 0;
        allItemColors.forEach(c => {
          const rawVal = colorMockups[modalStyleKey]?.[c];
          if (rawVal) {
            const front = typeof rawVal === 'string' ? rawVal : rawVal?.front;
            const back = typeof rawVal === 'object' ? rawVal?.back : null;
            if (front || back) customMockupCount++;
          }
        });

        const displayedColors = allItemColors.filter(color => {
          const matchesSearch = color.toLowerCase().includes(colorSearchQuery.toLowerCase().trim());
          const isAllowed = currentAllowed.includes(color);

          const rawVal = colorMockups[modalStyleKey]?.[color];
          const customFront = typeof rawVal === 'string' ? rawVal : (rawVal?.front || null);
          const customBack = typeof rawVal === 'object' ? (rawVal?.back || null) : null;
          const hasCustom = Boolean(customFront || customBack);

          if (!matchesSearch) return false;
          if (colorFilterTab === 'enabled') return isAllowed;
          if (colorFilterTab === 'hidden') return !isAllowed;
          if (colorFilterTab === 'custom') return hasCustom;
          return true;
        });

        const isTaglessActive = removeNeckTag[activeColorModalItem.style.toLowerCase()] ?? true;

        const handleAddCustomColor = async () => {
          const trimmed = newColorName.trim();
          if (!trimmed) {
            alert("Please enter a color name.");
            return;
          }
          if (allItemColors.some(c => c.toLowerCase() === trimmed.toLowerCase())) {
            alert(`Color "${trimmed}" already exists for this garment.`);
            return;
          }

          setIsSubmittingNewColor(true);
          try {
            let frontUrl: string | undefined;
            let backUrl: string | undefined;

            if (newColorFrontFile) {
              const storageRef = ref(storage, `storefront_color_mockups/${modalStyleKey}/${trimmed}_front_${Date.now()}_${newColorFrontFile.name}`);
              await uploadBytes(storageRef, newColorFrontFile);
              frontUrl = await getDownloadURL(storageRef);
            }

            if (newColorBackFile) {
              const storageRef = ref(storage, `storefront_color_mockups/${modalStyleKey}/${trimmed}_back_${Date.now()}_${newColorBackFile.name}`);
              await uploadBytes(storageRef, newColorBackFile);
              backUrl = await getDownloadURL(storageRef);
            }

            const updatedCustom = {
              ...customColors,
              [modalStyleKey]: Array.from(new Set([...extraCustomColors, trimmed]))
            };
            setCustomColors(updatedCustom);

            const updatedAllowed = {
              ...allowedColors,
              [modalStyleKey]: Array.from(new Set([...currentAllowed, trimmed]))
            };
            setAllowedColors(updatedAllowed);

            let updatedMockups = colorMockups;
            if (frontUrl || backUrl) {
              updatedMockups = {
                ...colorMockups,
                [modalStyleKey]: {
                  ...(colorMockups[modalStyleKey] || {}),
                  [trimmed]: {
                    ...(frontUrl ? { front: frontUrl } : {}),
                    ...(backUrl ? { back: backUrl } : {})
                  }
                }
              };
              setColorMockups(updatedMockups);
            }

            await writeCatalog({
              customColors: updatedCustom,
              allowedColors: updatedAllowed,
              colorMockups: updatedMockups
            });

            setIsAddingCustomColor(false);
            setNewColorName('');
            setNewColorFrontFile(null);
            setNewColorBackFile(null);
            setNewColorFrontPreview(null);
            setNewColorBackPreview(null);
          } catch (err) {
            console.error("Error adding custom color:", err);
            alert("Failed to add custom color. Please try again.");
          } finally {
            setIsSubmittingNewColor(false);
          }
        };

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-2 sm:p-4 md:p-6 animate-in fade-in duration-200">
            <div className="bg-white border border-brand-border rounded-3xl shadow-2xl w-full max-w-7xl h-full max-h-[95vh] flex flex-col overflow-hidden">
              
              {/* Header Bar */}
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-5 md:px-8 md:py-6 border-b border-neutral-150 bg-white shrink-0">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-neutral-900 text-white font-black px-2.5 py-0.5 rounded-md uppercase tracking-wider">
                      {activeColorModalItem.style}
                    </span>
                    <span className="text-xs font-bold text-neutral-500 uppercase tracking-widest">
                      {activeColorModalItem.brand}
                    </span>
                    <span className="text-xs bg-neutral-100 text-neutral-600 font-bold px-2 py-0.5 rounded uppercase">
                      {activeColorModalItem.category}
                    </span>
                  </div>
                  <h3 className="text-xl md:text-2xl font-serif text-brand-primary font-bold">
                    {activeColorModalItem.title} — Color Variations & Storefront Availability
                  </h3>
                  <p className="text-xs text-brand-secondary">
                    Control which colors storefront customers can see, add new colors, upload custom front/back mockups, and toggle tagless collar mode.
                  </p>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto justify-end">
                  <PillButton variant="filled" onClick={() => { persistColorSettings(); setActiveColorModalItem(null); }} className="px-6 py-2.5 text-xs font-bold gap-2">
                    <Check size={16} /> Save & Done
                  </PillButton>
                  <button 
                    onClick={() => { persistColorSettings(); setActiveColorModalItem(null); }}
                    className="p-2 text-neutral-400 hover:text-brand-primary hover:bg-neutral-100 rounded-full transition-all cursor-pointer"
                  >
                    <X size={22} />
                  </button>
                </div>
              </div>

              {/* Control Stats & Quick Actions Toolbar */}
              <div className="p-4 md:px-8 bg-neutral-50 border-b border-brand-border flex flex-wrap items-center justify-between gap-4 shrink-0">
                {/* Stats */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="bg-white border border-neutral-200 px-3 py-1.5 rounded-xl flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Total Colors</span>
                    <span className="text-xs font-black text-brand-primary">{totalCount}</span>
                  </div>

                  <div className="bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Storefront Active</span>
                    <span className="text-xs font-black text-emerald-700">{allowedCount}</span>
                  </div>

                  {hiddenCount > 0 && (
                    <div className="bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-xl flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-rose-800">Hidden</span>
                      <span className="text-xs font-black text-rose-700">{hiddenCount}</span>
                    </div>
                  )}

                  {customMockupCount > 0 && (
                    <div className="bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-xl flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800">Custom Mockups</span>
                      <span className="text-xs font-black text-amber-700">{customMockupCount}</span>
                    </div>
                  )}
                </div>

                {/* Quick Action Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingCustomColor(true);
                      setNewColorName('');
                      setNewColorFrontFile(null);
                      setNewColorBackFile(null);
                      setNewColorFrontPreview(null);
                      setNewColorBackPreview(null);
                    }}
                    className="px-3.5 py-1.5 bg-black hover:bg-neutral-800 text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
                  >
                    <Plus size={14} /> Add Color
                  </button>

                  <div className="h-4 w-px bg-neutral-300 hidden sm:block" />

                  <button
                    type="button"
                    onClick={() => {
                      const key = activeColorModalItem.style.toLowerCase();
                      setRemoveNeckTag(prev => ({
                        ...prev,
                        [key]: !(prev[key] ?? true)
                      }));
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer flex items-center gap-1.5 ${
                      isTaglessActive
                        ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                        : 'bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-100'
                    }`}
                  >
                    <Scissors size={14} />
                    <span>Tagless Collar: {isTaglessActive ? 'Active (Removed)' : 'Off (Original)'}</span>
                  </button>

                  <div className="h-4 w-px bg-neutral-300 hidden sm:block" />

                  <button
                    type="button"
                    onClick={() => {
                      setAllowedColors(prev => ({
                        ...prev,
                        [modalStyleKey]: [...allItemColors]
                      }));
                    }}
                    className="px-3 py-1.5 bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-300 hover:border-emerald-400 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                  >
                    <Check size={14} /> Enable All
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setAllowedColors(prev => ({
                        ...prev,
                        [modalStyleKey]: []
                      }));
                    }}
                    className="px-3 py-1.5 bg-white hover:bg-rose-50 text-rose-600 border border-neutral-300 hover:border-rose-300 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                  >
                    <X size={14} /> Disable All
                  </button>
                </div>
              </div>

              {/* Search Bar & Filter Tabs */}
              <div className="p-4 md:px-8 bg-white border-b border-neutral-150 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 shrink-0">
                {/* Search */}
                <div className="relative w-full md:w-80">
                  <input 
                    type="text"
                    placeholder="Search color name (e.g. Heather, Navy)..."
                    value={colorSearchQuery}
                    onChange={(e) => setColorSearchQuery(e.target.value)}
                    className="w-full bg-neutral-50 border border-neutral-250 rounded-xl pl-9 pr-8 py-2 text-xs font-bold text-brand-primary focus:outline-none focus:border-neutral-400 focus:bg-white transition-all placeholder:text-neutral-400 font-medium"
                  />
                  <Search className="absolute left-3 top-2.5 text-neutral-400" size={14} />
                  {colorSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setColorSearchQuery('')}
                      className="absolute right-2.5 top-2.5 text-neutral-400 hover:text-black cursor-pointer"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Filter Tabs */}
                <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
                  <button
                    type="button"
                    onClick={() => setColorFilterTab('all')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border cursor-pointer ${
                      colorFilterTab === 'all'
                        ? 'bg-neutral-900 text-white border-neutral-900'
                        : 'bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-100'
                    }`}
                  >
                    All Colors ({totalCount})
                  </button>

                  <button
                    type="button"
                    onClick={() => setColorFilterTab('enabled')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border cursor-pointer ${
                      colorFilterTab === 'enabled'
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white text-emerald-800 border-emerald-200 hover:bg-emerald-50'
                    }`}
                  >
                    Storefront Active ({allowedCount})
                  </button>

                  <button
                    type="button"
                    onClick={() => setColorFilterTab('hidden')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border cursor-pointer ${
                      colorFilterTab === 'hidden'
                        ? 'bg-rose-600 text-white border-rose-600'
                        : 'bg-white text-rose-700 border-rose-200 hover:bg-rose-50'
                    }`}
                  >
                    Hidden from Customers ({hiddenCount})
                  </button>

                  {customMockupCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setColorFilterTab('custom')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border cursor-pointer ${
                        colorFilterTab === 'custom'
                          ? 'bg-amber-600 text-white border-amber-600'
                          : 'bg-white text-amber-800 border-amber-200 hover:bg-amber-50'
                      }`}
                    >
                      Custom Mockups ({customMockupCount})
                    </button>
                  )}
                </div>
              </div>

              {/* Color Grid Content */}
              <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-neutral-50/50">
                {displayedColors.length === 0 ? (
                  <div className="h-64 flex flex-col items-center justify-center text-center p-8 bg-white border border-dashed border-neutral-300 rounded-2xl">
                    <EyeOff size={32} className="text-neutral-300 mb-2" />
                    <h4 className="text-sm font-bold text-neutral-700">No matching colors found</h4>
                    <p className="text-xs text-neutral-400 mt-1">Try clearing your search query or add a new color.</p>
                    <button
                      type="button"
                      onClick={() => setIsAddingCustomColor(true)}
                      className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-black hover:bg-neutral-800 rounded-xl transition-all cursor-pointer shadow-sm"
                    >
                      <Plus size={13} /> Add Color
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-5">
                    {displayedColors.map((color: string) => {
                      const isColorAllowed = currentAllowed.includes(color);
                      const isCustomAdded = extraCustomColors.includes(color);

                      const rawVal = colorMockups[modalStyleKey]?.[color];
                      const customFront = typeof rawVal === 'string' ? rawVal : (rawVal?.front || null);
                      const customBack = typeof rawVal === 'object' ? (rawVal?.back || null) : null;

                      const origImgSet = activeColorModalItem.images?.[color] || Object.values(activeColorModalItem.images || {})[0];
                      const origFrontUrl = typeof origImgSet === 'string' ? origImgSet : (origImgSet?.front || '');

                      const origBackSet = activeColorModalItem.backImages?.[color] || Object.values(activeColorModalItem.backImages || {})[0];
                      const origBackUrl = typeof origBackSet === 'string' ? origBackSet : (origBackSet?.back || '');

                      const currentFront = customFront || origFrontUrl;
                      const currentBack = customBack || origBackUrl;

                      return (
                        <div 
                          key={color} 
                          className={`border rounded-2xl p-3.5 space-y-3 flex flex-col justify-between transition-all ${
                            isColorAllowed 
                              ? 'border-neutral-250 bg-white shadow-xs hover:border-neutral-400' 
                              : 'border-neutral-200 bg-neutral-100/70 opacity-80 hover:opacity-100'
                          }`}
                        >
                          <div className="space-y-2.5">
                            {/* Color Header & Badges */}
                            <div className="flex items-center justify-between gap-1.5 border-b border-neutral-100 pb-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span 
                                  className={`text-xs font-extrabold truncate ${isColorAllowed ? 'text-brand-primary' : 'text-neutral-500 line-through'}`} 
                                  title={color}
                                >
                                  {color}
                                </span>
                                {isCustomAdded && (
                                  <span className="text-[8px] font-black uppercase text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded shrink-0">
                                    Custom
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {customFront && <span className="text-[8px] font-black uppercase text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">Front Mock</span>}
                                {customBack && <span className="text-[8px] font-black uppercase text-indigo-800 bg-indigo-100 px-1.5 py-0.5 rounded">Back Mock</span>}
                                {isCustomAdded && (
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      if (!confirm(`Delete custom color "${color}" and its mockups?`)) return;
                                      const nextCustom = (customColors[modalStyleKey] || []).filter(c => c !== color);
                                      const updatedCustomColors = { ...customColors, [modalStyleKey]: nextCustom };
                                      setCustomColors(updatedCustomColors);

                                      const nextAllowed = (allowedColors[modalStyleKey] || allItemColors).filter(c => c !== color);
                                      const updatedAllowed = { ...allowedColors, [modalStyleKey]: nextAllowed };
                                      setAllowedColors(updatedAllowed);

                                      const updatedMockups = { ...(colorMockups[modalStyleKey] || {}) };
                                      delete updatedMockups[color];
                                      const allUpdatedMockups = { ...colorMockups, [modalStyleKey]: updatedMockups };
                                      setColorMockups(allUpdatedMockups);

                                      await writeCatalog({
                                        customColors: updatedCustomColors,
                                        allowedColors: updatedAllowed,
                                        colorMockups: allUpdatedMockups
                                      });
                                    }}
                                    className="p-1 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                                    title="Delete custom color"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Main Storefront Availability Toggle Button */}
                            <button
                              type="button"
                              onClick={() => {
                                setAllowedColors(prev => {
                                  const list = prev[modalStyleKey] ?? allItemColors;
                                  const next = list.includes(color) ? list.filter((c: string) => c !== color) : [...list, color];
                                  return { ...prev, [modalStyleKey]: next };
                                });
                              }}
                              className={`w-full py-1.5 px-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between border cursor-pointer ${
                                isColorAllowed
                                  ? 'bg-emerald-50 text-emerald-950 border-emerald-300 hover:bg-emerald-100'
                                  : 'bg-neutral-200/80 text-neutral-700 border-neutral-300 hover:bg-neutral-300'
                              }`}
                              title={isColorAllowed ? "Click to remove color from customer storefront" : "Click to enable color for customer storefront"}
                            >
                              <span className="flex items-center gap-1.5">
                                {isColorAllowed ? <Eye size={14} className="text-emerald-600" /> : <EyeOff size={14} className="text-neutral-500" />}
                                <span>{isColorAllowed ? 'Storefront Active' : 'Hidden from Storefront'}</span>
                              </span>
                              <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider ${
                                isColorAllowed ? 'bg-emerald-600 text-white' : 'bg-neutral-400 text-white'
                              }`}>
                                {isColorAllowed ? 'ON' : 'OFF'}
                              </span>
                            </button>

                            {/* Front and Back Mockup previews */}
                            <div className="grid grid-cols-2 gap-2 pt-1">
                              {/* Front */}
                              <div className="space-y-1">
                                <span className="text-[9px] font-bold text-neutral-400 block text-center uppercase tracking-wider">Front</span>
                                <div className="w-full h-28 bg-neutral-50 rounded-xl border border-neutral-200 flex items-center justify-center p-1 relative overflow-hidden bg-checkerboard">
                                  {currentFront ? (
                                    <img src={currentFront} alt={`${color} front`} className="max-w-full max-h-full object-contain mix-blend-multiply" />
                                  ) : (
                                    <span className="text-[10px] text-neutral-400">No Image</span>
                                  )}
                                </div>
                                <label className="w-full py-1 px-1.5 bg-neutral-100 hover:bg-neutral-200 text-brand-primary rounded-lg text-[10px] font-bold transition-all text-center cursor-pointer block truncate">
                                  <span>{customFront ? 'Change Front' : 'Upload Front'}</span>
                                  <input 
                                    type="file" 
                                    accept="image/*" 
                                    className="hidden" 
                                    onChange={async (e) => {
                                      const file = e.target.files?.[0];
                                      if (!file) return;
                                      try {
                                        const storageRef = ref(storage, `storefront_color_mockups/${modalStyleKey}/${color}_front_${Date.now()}_${file.name}`);
                                        await uploadBytes(storageRef, file);
                                        const url = await getDownloadURL(storageRef);
                                        setColorMockups(prev => {
                                          const existing = prev[modalStyleKey]?.[color];
                                          const back = typeof existing === 'object' ? existing?.back : undefined;
                                          return {
                                            ...prev,
                                            [modalStyleKey]: {
                                              ...(prev[modalStyleKey] || {}),
                                              [color]: { front: url, ...(back ? { back } : {}) }
                                            }
                                          };
                                        });
                                      } catch (err) {
                                        console.error("Failed to upload front color mockup:", err);
                                        alert("Failed to upload image.");
                                      }
                                    }}
                                  />
                                </label>
                                {customFront && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setColorMockups(prev => {
                                        const existing = prev[modalStyleKey]?.[color];
                                        const back = typeof existing === 'object' ? existing?.back : undefined;
                                        const styleMap = { ...(prev[modalStyleKey] || {}) };
                                        if (back) {
                                          styleMap[color] = { back };
                                        } else {
                                          delete styleMap[color];
                                        }
                                        return { ...prev, [modalStyleKey]: styleMap };
                                      });
                                    }}
                                    className="w-full py-0.5 text-rose-600 hover:bg-rose-50 rounded text-[9px] font-bold transition-all text-center block cursor-pointer"
                                  >
                                    Clear Front
                                  </button>
                                )}
                              </div>

                              {/* Back */}
                              <div className="space-y-1">
                                <span className="text-[9px] font-bold text-neutral-400 block text-center uppercase tracking-wider">Back</span>
                                <div className="w-full h-28 bg-neutral-50 rounded-xl border border-neutral-200 flex items-center justify-center p-1 relative overflow-hidden bg-checkerboard">
                                  {currentBack ? (
                                    <img src={currentBack} alt={`${color} back`} className="max-w-full max-h-full object-contain mix-blend-multiply" />
                                  ) : (
                                    <span className="text-[10px] text-neutral-400">No Image</span>
                                  )}
                                </div>
                                <label className="w-full py-1 px-1.5 bg-neutral-100 hover:bg-neutral-200 text-brand-primary rounded-lg text-[10px] font-bold transition-all text-center cursor-pointer block truncate">
                                  <span>{customBack ? 'Change Back' : 'Upload Back'}</span>
                                  <input 
                                    type="file" 
                                    accept="image/*" 
                                    className="hidden" 
                                    onChange={async (e) => {
                                      const file = e.target.files?.[0];
                                      if (!file) return;
                                      try {
                                        const storageRef = ref(storage, `storefront_color_mockups/${modalStyleKey}/${color}_back_${Date.now()}_${file.name}`);
                                        await uploadBytes(storageRef, file);
                                        const url = await getDownloadURL(storageRef);
                                        setColorMockups(prev => {
                                          const existing = prev[modalStyleKey]?.[color];
                                          const front = typeof existing === 'string' ? existing : (typeof existing === 'object' ? existing?.front : undefined);
                                          return {
                                            ...prev,
                                            [modalStyleKey]: {
                                              ...(prev[modalStyleKey] || {}),
                                              [color]: { ...(front ? { front } : {}), back: url }
                                            }
                                          };
                                        });
                                      } catch (err) {
                                        console.error("Failed to upload back color mockup:", err);
                                        alert("Failed to upload image.");
                                      }
                                    }}
                                  />
                                </label>
                                {customBack && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setColorMockups(prev => {
                                        const existing = prev[modalStyleKey]?.[color];
                                        const front = typeof existing === 'string' ? existing : (typeof existing === 'object' ? existing?.front : undefined);
                                        const styleMap = { ...(prev[modalStyleKey] || {}) };
                                        if (front) {
                                          styleMap[color] = { front };
                                        } else {
                                          delete styleMap[color];
                                        }
                                        return { ...prev, [modalStyleKey]: styleMap };
                                      });
                                    }}
                                    className="w-full py-0.5 text-rose-600 hover:bg-rose-50 rounded text-[9px] font-bold transition-all text-center block cursor-pointer"
                                  >
                                    Clear Back
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-4 md:px-8 border-t border-neutral-200 bg-white flex items-center justify-between shrink-0">
                <span className="text-xs text-neutral-500 font-medium">
                  Showing {displayedColors.length} of {totalCount} color variations
                </span>
                <PillButton variant="filled" onClick={() => { persistColorSettings(); setActiveColorModalItem(null); }} className="px-8 py-2.5 text-xs font-bold gap-2">
                  <Check size={16} /> Save & Done
                </PillButton>
              </div>

            </div>

            {/* Add Custom Color Modal */}
            {isAddingCustomColor && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
                <div className="bg-white border border-brand-border rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-5 flex flex-col">
                  <div className="flex items-center justify-between border-b border-neutral-150 pb-3">
                    <div>
                      <h4 className="text-base font-serif font-bold text-brand-primary">Add New Color Variation</h4>
                      <p className="text-[11px] text-brand-secondary mt-0.5">
                        Add a custom color name and upload front and back mockups for {activeColorModalItem.title}.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={isSubmittingNewColor}
                      onClick={() => {
                        setIsAddingCustomColor(false);
                        setNewColorName('');
                        setNewColorFrontFile(null);
                        setNewColorBackFile(null);
                        setNewColorFrontPreview(null);
                        setNewColorBackPreview(null);
                      }}
                      className="text-neutral-400 hover:text-black p-1 rounded-full cursor-pointer"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  {/* Color Name Input */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold uppercase tracking-wider text-brand-secondary">
                      Color Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={newColorName}
                      onChange={(e) => setNewColorName(e.target.value)}
                      placeholder="e.g. Vintage Butter, Matcha Green, Washed Clay"
                      className="w-full bg-neutral-50 border border-neutral-250 rounded-xl px-3.5 py-2.5 text-xs font-bold text-brand-primary focus:outline-none focus:border-black focus:bg-white transition-all placeholder:text-neutral-400"
                      autoFocus
                    />
                  </div>

                  {/* Front and Back Mockup Uploads */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* Front Mockup */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold uppercase tracking-wider text-brand-secondary">
                        Front Mockup
                      </label>
                      <div className="h-32 bg-neutral-50 rounded-xl border border-dashed border-neutral-300 flex flex-col items-center justify-center p-2 relative overflow-hidden bg-checkerboard group">
                        {newColorFrontPreview ? (
                          <>
                            <img src={newColorFrontPreview} alt="Front preview" className="max-w-full max-h-full object-contain mix-blend-multiply" />
                            <button
                              type="button"
                              onClick={() => {
                                setNewColorFrontFile(null);
                                setNewColorFrontPreview(null);
                              }}
                              className="absolute top-1.5 right-1.5 bg-rose-600 text-white p-1 rounded-full shadow-md hover:bg-rose-700 transition-colors cursor-pointer"
                              title="Remove front image"
                            >
                              <X size={12} />
                            </button>
                          </>
                        ) : (
                          <label className="w-full h-full flex flex-col items-center justify-center cursor-pointer hover:bg-neutral-100/70 transition-colors rounded-lg">
                            <Upload size={18} className="text-neutral-400 mb-1" />
                            <span className="text-[10px] font-bold text-neutral-600">Select Front Image</span>
                            <span className="text-[9px] text-neutral-400 mt-0.5">PNG or JPG</span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  setNewColorFrontFile(file);
                                  setNewColorFrontPreview(URL.createObjectURL(file));
                                }
                              }}
                            />
                          </label>
                        )}
                      </div>
                    </div>

                    {/* Back Mockup */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold uppercase tracking-wider text-brand-secondary">
                        Back Mockup <span className="text-neutral-400 font-normal text-[10px] lowercase">(optional)</span>
                      </label>
                      <div className="h-32 bg-neutral-50 rounded-xl border border-dashed border-neutral-300 flex flex-col items-center justify-center p-2 relative overflow-hidden bg-checkerboard group">
                        {newColorBackPreview ? (
                          <>
                            <img src={newColorBackPreview} alt="Back preview" className="max-w-full max-h-full object-contain mix-blend-multiply" />
                            <button
                              type="button"
                              onClick={() => {
                                setNewColorBackFile(null);
                                setNewColorBackPreview(null);
                              }}
                              className="absolute top-1.5 right-1.5 bg-rose-600 text-white p-1 rounded-full shadow-md hover:bg-rose-700 transition-colors cursor-pointer"
                              title="Remove back image"
                            >
                              <X size={12} />
                            </button>
                          </>
                        ) : (
                          <label className="w-full h-full flex flex-col items-center justify-center cursor-pointer hover:bg-neutral-100/70 transition-colors rounded-lg">
                            <Upload size={18} className="text-neutral-400 mb-1" />
                            <span className="text-[10px] font-bold text-neutral-600">Select Back Image</span>
                            <span className="text-[9px] text-neutral-400 mt-0.5">PNG or JPG</span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  setNewColorBackFile(file);
                                  setNewColorBackPreview(URL.createObjectURL(file));
                                }
                              }}
                            />
                          </label>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Footer Actions */}
                  <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-neutral-150">
                    <button
                      type="button"
                      disabled={isSubmittingNewColor}
                      onClick={() => {
                        setIsAddingCustomColor(false);
                        setNewColorName('');
                        setNewColorFrontFile(null);
                        setNewColorBackFile(null);
                        setNewColorFrontPreview(null);
                        setNewColorBackPreview(null);
                      }}
                      className="px-4 py-2 text-xs font-bold text-neutral-600 hover:bg-neutral-100 rounded-xl transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={isSubmittingNewColor || !newColorName.trim()}
                      onClick={handleAddCustomColor}
                      className="px-5 py-2 text-xs font-bold text-white bg-black hover:bg-neutral-800 disabled:opacity-50 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
                    >
                      {isSubmittingNewColor ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          <span>Saving Color...</span>
                        </>
                      ) : (
                        <>
                          <Check size={14} />
                          <span>Add Color & Mockups</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      <ImportGarmentModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        initialCategory={activeSelectTarget?.category}
        onSuccess={(newProduct) => {
          setCustomProducts(prev => [newProduct, ...prev.filter(p => p.style !== newProduct.style)]);
          if (activeSelectTarget) {
            handleSelectProduct(newProduct.style);
          }
        }}
      />
    </div>
  );
}
