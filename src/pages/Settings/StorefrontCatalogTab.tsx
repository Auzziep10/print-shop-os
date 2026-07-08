import { useState, useEffect, useRef } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Loader2, Save, Search, Check, Info, Crosshair, X, Trash2 } from 'lucide-react';
import { tokens } from '../../lib/tokens';
import { PillButton } from '../../components/ui/PillButton';
import sanmarCatalogJson from '../../data/sanmar-catalog.json';

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

const MIN_BOX_PX = 14;

function LogoPlacementModal({
  title,
  imageUrl,
  initialBox,
  hasExisting,
  onApply,
  onClear,
  onClose,
}: {
  title: string;
  imageUrl: string;
  initialBox: LogoBox;
  hasExisting: boolean;
  onApply: (box: LogoBox) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [box, setBox] = useState<LogoBox>(clampBox(initialBox));
  const frameRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<{
    type: 'move' | 'rotate' | string; // string = resize handle id
    startX: number; // pointer, frame px
    startY: number;
    startBox: LogoBox;
  } | null>(null);

  // All gesture math runs in frame pixels (rotation mixes axes, and the frame
  // is 4:5 so percent units differ per axis); state stays in percent.
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
    gestureRef.current = { type, startX: x, startY: y, startBox: box };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const g = gestureRef.current;
    if (!g) return;
    const { x, y, rect } = pointerPx(e);
    const start = boxToPx(g.startBox, rect);

    if (g.type === 'move') {
      setBox(clampBox({
        ...g.startBox,
        x: ((start.cx + (x - g.startX)) / rect.width) * 100,
        y: ((start.cy + (y - g.startY)) / rect.height) * 100,
      }));
      return;
    }

    if (g.type === 'rotate') {
      // Handle sits above the box's local top edge, so straight up = 0deg
      const deg = (Math.atan2(y - start.cy, x - start.cx) * 180) / Math.PI + 90;
      setBox(clampBox({ ...g.startBox, r: Math.round(deg) }));
      return;
    }

    const handle = RESIZE_HANDLES.find(h => h.id === g.type);
    if (!handle) return;
    const { sx, sy } = handle;
    const cos = Math.cos(start.rad);
    const sin = Math.sin(start.rad);

    // Anchor = the point opposite the handle (stays fixed while dragging)
    const ax = start.cx - (sx * (start.bw / 2)) * cos + (sy * (start.bh / 2)) * sin;
    const ay = start.cy - (sx * (start.bw / 2)) * sin - (sy * (start.bh / 2)) * cos;

    // Pointer offset from the anchor, rotated into the box's local space
    const dx = x - ax;
    const dy = y - ay;
    const localX = dx * cos + dy * sin;
    const localY = -dx * sin + dy * cos;

    const bw = sx !== 0 ? Math.max(MIN_BOX_PX, sx * localX) : start.bw;
    const bh = sy !== 0 ? Math.max(MIN_BOX_PX, sy * localY) : start.bh;

    // New center = anchor pushed back out along the local handle direction
    const ox = sx * (bw / 2);
    const oy = sy * (bh / 2);
    const cx = ax + ox * cos - oy * sin;
    const cy = ay + ox * sin + oy * cos;

    setBox(clampBox({
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white border border-brand-border rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-5 max-h-[92vh] overflow-y-auto">
        <div className="flex justify-between items-start">
          <div>
            <span className="text-[9px] font-extrabold uppercase tracking-widest text-neutral-400">Logo Placement</span>
            <h3 className="text-lg font-serif text-brand-primary">{title}</h3>
            <p className="text-xs text-brand-secondary mt-1">
              Drag the box where the logo should land on this mock. Customer logos are auto-fitted
              inside it, so the same box drives the lookbook preview and the final mockup.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-50 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Placement canvas — same geometry as the customer-facing placement frame */}
        <div
          ref={frameRef}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="relative w-full max-w-[360px] mx-auto aspect-[4/5] bg-checkerboard border border-brand-border rounded-xl overflow-hidden select-none touch-none"
        >
          <img
            src={imageUrl}
            alt="Garment mock"
            draggable="false"
            className="absolute inset-0 w-full h-full object-contain mix-blend-multiply pointer-events-none"
          />

          <div
            onPointerDown={(e) => handlePointerDown(e, 'move')}
            className="absolute border-2 border-dashed border-neutral-900 bg-neutral-900/10 cursor-move rounded-sm"
            style={{
              left: `${box.x}%`,
              top: `${box.y}%`,
              width: `${box.w}%`,
              height: `${box.h}%`,
              transform: `translate(-50%, -50%) rotate(${box.r ?? 0}deg)`,
            }}
          >
            <Crosshair
              size={14}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-neutral-900/60 pointer-events-none"
            />
            <span className="absolute -top-5 left-0 text-[9px] font-extrabold uppercase tracking-wider text-neutral-900 bg-white/85 px-1 rounded pointer-events-none whitespace-nowrap">
              Logo area
            </span>

            {/* Rotation Handle */}
            <div
              className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-6 flex flex-col items-center"
              style={{ transformOrigin: 'bottom center' }}
            >
              <div className="w-0.5 h-4 bg-neutral-900" />
              <div
                onPointerDown={(e) => handlePointerDown(e, 'rotate')}
                className="w-3 h-3 bg-white border-2 border-neutral-900 rounded-full shadow-md hover:bg-neutral-100 transition-colors cursor-alias"
                title="Rotate box"
              />
            </div>

            {/* Resize Handles */}
            {RESIZE_HANDLES.map((handle) => {
              const left = `${(handle.sx + 1) * 50}%`;
              const top = `${(handle.sy + 1) * 50}%`;
              return (
                <div
                  key={handle.id}
                  onPointerDown={(e) => handlePointerDown(e, handle.id)}
                  className="absolute w-2.5 h-2.5 bg-white border-2 border-neutral-900 rounded-full shadow-xs -translate-x-1/2 -translate-y-1/2 z-10"
                  style={{
                    left,
                    top,
                    cursor: handle.cursor,
                  }}
                  title={`Resize ${handle.id.toUpperCase()}`}
                />
              );
            })}
          </div>
        </div>

        {/* Presets + readout */}
        <div className="flex flex-wrap items-center gap-2">
          {PLACEMENT_PRESETS.map(preset => (
            <button
              key={preset.label}
              onClick={() => setBox(clampBox(preset.box))}
              className="px-3 py-1.5 bg-white border border-brand-border rounded-xl text-[10px] font-bold text-brand-primary hover:bg-neutral-50 transition-colors"
            >
              {preset.label}
            </button>
          ))}
          <span className="ml-auto text-[10px] font-mono text-neutral-400">
            {Math.round(box.w)}% × {Math.round(box.h)}% {box.r ? `@ ${box.r}°` : ''}
          </span>
        </div>

        <div className="flex justify-between items-center pt-4 border-t border-brand-border">
          {hasExisting ? (
            <button
              onClick={onClear}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-red-500 hover:bg-red-50 rounded-xl transition-colors"
            >
              <Trash2 size={13} /> Clear placement
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <PillButton variant="outline" onClick={onClose}>Cancel</PillButton>
            <PillButton variant="filled" onClick={() => onApply(clampBox(box))} className="gap-2">
              <Check size={14} /> Apply Placement
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
  const [activeSubMode, setActiveSubMode] = useState<'racks' | 'basics'>('racks');

  // Firestore state
  const [racks, setRacks] = useState<Record<string, any>>(DEFAULT_RACKS);
  const [basics, setBasics] = useState<Record<string, any>>(DEFAULT_BASICS);
  const [customNames, setCustomNames] = useState<Record<string, any>>({ racks: {}, basics: {} });
  const [customSpecs, setCustomSpecs] = useState<Record<string, any>>({ racks: {}, basics: {} });
  const [defaultColors, setDefaultColors] = useState<Record<string, any>>({ racks: {}, basics: {} });
  const [logoPlacements, setLogoPlacements] = useState<Record<string, any>>({ racks: {}, basics: {} });

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
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.racks) setRacks(data.racks);
          if (data.basics) setBasics(data.basics);
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
        }
      } catch (err) {
        console.error("Error fetching storefront catalog settings:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchCatalogSettings();
  }, []);

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'storefront-catalog'), {
        racks,
        basics,
        customNames,
        customSpecs,
        defaultColors,
        logoPlacements,
        updatedAt: new Date().toISOString()
      });
      alert('Storefront catalog settings saved successfully!');
    } catch (err) {
      console.error("Error saving storefront catalog settings:", err);
      alert('Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenSelector = (mode: 'racks' | 'basics', category: string, slot: string) => {
    setActiveSelectTarget({ mode, category, slot });
    setSearchQuery('');
    setIsModalOpen(true);
  };

  const handleSelectProduct = (style: string) => {
    if (!activeSelectTarget) return;

    const { mode, category, slot } = activeSelectTarget;

    // Custom display names are slot-level branding and intentionally survive product swaps
    if (mode === 'racks') {
      setRacks(prev => ({
        ...prev,
        [category]: {
          ...prev[category],
          [slot]: style
        }
      }));
    } else {
      setBasics(prev => ({
        ...prev,
        [category]: {
          ...prev[category],
          [slot]: style
        }
      }));
    }

    setIsModalOpen(false);
    setActiveSelectTarget(null);
  };

  const handleApplyPlacement = (box: LogoBox) => {
    if (!placementTarget) return;
    const { mode, category, slot } = placementTarget;
    setLogoPlacements(prev => {
      const modeMap = prev[mode] || {};
      const cat = modeMap[category] || {};
      return {
        ...prev,
        [mode]: {
          ...modeMap,
          [category]: {
            ...cat,
            [slot]: box
          }
        }
      };
    });
    setPlacementTarget(null);
  };

  const handleClearPlacement = () => {
    if (!placementTarget) return;
    const { mode, category, slot } = placementTarget;
    setLogoPlacements(prev => {
      const modeMap = prev[mode] || {};
      const cat = { ...(modeMap[category] || {}) };
      delete cat[slot];
      return {
        ...prev,
        [mode]: {
          ...modeMap,
          [category]: cat
        }
      };
    });
    setPlacementTarget(null);
  };

  // Filter products by search query
  const filteredProducts = sanmarCatalog.filter(p => 
    p.style.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.brand.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getGarmentImage = (p: any, chosenColor?: string) => {
    if (p.image) return p.image;
    if (p.images) {
      const colorKey = (chosenColor && p.images[chosenColor]) 
        ? chosenColor 
        : (p.colors?.[0] || Object.keys(p.images)[0]);
      if (colorKey && p.images[colorKey]) {
        return p.images[colorKey].front || p.images[colorKey].swatch || '';
      }
    }
    return 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&q=80&w=200&h=200';
  };

  const getProductDetails = (style: string) => {
    return sanmarCatalog.find(p => p.style === style) || {
      style,
      title: 'Unknown Garment',
      brand: 'N/A',
      price: 0,
      colors: [],
      images: null
    };
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
        <PillButton 
          variant="filled" 
          onClick={handleSaveSettings} 
          disabled={saving}
          className="gap-2 shrink-0 self-start sm:self-center min-w-[140px]"
        >
          {saving ? <Loader2 className="animate-spin" size={16} /> : <><Save size={16} /> Save Catalog</>}
        </PillButton>
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
      </div>

      {/* Rack Collections Manager */}
      {activeSubMode === 'racks' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="flex items-center gap-4">
            <span className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Select Collection:</span>
            <select
              value={activeRackCategory}
              onChange={(e) => setActiveRackCategory(e.target.value)}
              className="bg-white border border-brand-border rounded-xl px-3 py-2 text-xs font-bold text-brand-primary focus:outline-none"
            >
              {Object.keys(racks).map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 text-amber-800 text-xs">
            <Info size={16} className="shrink-0 mt-0.5" />
            <p>
              Each theme/collection consists of exactly 6 pre-curated products to construct the "standard rack". Click <strong>Change</strong> to select a new product for any slot.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {['hat', 'shirt', 'polo', 'crewneck', 'hoodie', 'longsleeve'].map(slot => {
              const style = racks[activeRackCategory]?.[slot] || '';
              const p = getProductDetails(style) as any;
              const customName = customNames.racks?.[activeRackCategory]?.[slot] || '';
              
              return (
                <div key={slot} className="border border-brand-border rounded-2xl p-5 bg-neutral-50/50 flex flex-col justify-between gap-4">
                  <div className="space-y-3">
                    <div>
                      <span className="text-[10px] font-extrabold uppercase tracking-widest text-brand-secondary block mb-1">
                        {slot.replace('longsleeve', 'long sleeve')} Slot
                      </span>

                      {/* Image Preview */}
                      {p.style && (
                        <div className="w-full h-36 bg-white border border-brand-border/60 rounded-xl flex items-center justify-center p-2 mb-3 relative overflow-hidden bg-checkerboard">
                          <img 
                            src={getGarmentImage(p, defaultColors.racks?.[activeRackCategory]?.[slot])} 
                            alt={p.title} 
                            className="max-w-full max-h-full object-contain mix-blend-multiply" 
                          />
                        </div>
                      )}

                      <h4 className="text-sm font-bold text-brand-primary leading-snug">
                        {p.brand} {p.style}
                      </h4>
                      <p className="text-xs text-brand-secondary mt-1 font-medium truncate" title={customName || p.title}>
                        {customName || p.title}
                      </p>
                      <span className="text-xs text-brand-primary font-bold mt-2 inline-block">
                        ${p.price.toFixed(2)}
                      </span>
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
            })}
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
                        <div className="w-full h-36 bg-white border border-brand-border/60 rounded-xl flex items-center justify-center p-2 mb-3 relative overflow-hidden bg-checkerboard">
                          <img 
                            src={getGarmentImage(p, defaultColors.basics?.[activeBasicsCategory]?.[slot])} 
                            alt={p.title} 
                            className="max-w-full max-h-full object-contain mix-blend-multiply" 
                          />
                        </div>
                      )}

                      <h4 className="text-sm font-bold text-brand-primary leading-snug">
                        {p.brand} {p.style}
                      </h4>
                      <p className="text-xs text-brand-secondary mt-1 font-medium truncate" title={customName || p.title}>
                        {customName || p.title}
                      </p>
                      <span className="text-xs text-brand-primary font-bold mt-2 inline-block">
                        ${p.price.toFixed(2)}
                      </span>
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

      {/* Bottom Save Bar */}
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
        const existing = logoPlacements[mode]?.[category]?.[slot] as LogoBox | undefined;
        return (
          <LogoPlacementModal
            title={`${category} — ${slot.replace('longsleeve', 'long sleeve').toUpperCase()} (${p.brand} ${p.style})`}
            imageUrl={getGarmentImage(p, (mode === 'racks' ? defaultColors.racks : defaultColors.basics)?.[category]?.[slot])}
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
            <div>
              <h3 className="text-lg font-serif text-brand-primary">
                Select Garment for {activeSelectTarget.category} ({activeSelectTarget.slot.toUpperCase()})
              </h3>
              <p className="text-xs text-brand-secondary mt-1">
                Select one of the 185 premium products from the catalog database.
              </p>
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
                <p className="text-xs text-brand-secondary text-center py-8">No matching garments found.</p>
              ) : (
                filteredProducts.map(p => (
                  <div
                    key={p.style}
                    onClick={() => handleSelectProduct(p.style)}
                    className="flex justify-between items-center py-3.5 px-2 hover:bg-neutral-50 rounded-lg cursor-pointer transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs bg-neutral-100 px-2 py-0.5 rounded font-bold uppercase">{p.style}</span>
                        <span className="text-xs font-bold text-brand-primary">{p.brand}</span>
                      </div>
                      <p className="text-[11px] text-brand-secondary mt-1 truncate max-w-lg">{p.title} - {p.category}</p>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <span className="text-xs font-bold text-brand-primary">${p.price.toFixed(2)}</span>
                      <div className="w-6 h-6 rounded-full bg-neutral-50 border border-brand-border flex items-center justify-center text-brand-secondary hover:bg-brand-primary hover:text-white transition-colors">
                        <Check size={12} />
                      </div>
                    </div>
                  </div>
                ))
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
    </div>
  );
}
