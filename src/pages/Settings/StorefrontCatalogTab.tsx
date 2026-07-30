import { useState, useEffect, useRef, useMemo } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, storage } from '../../lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Loader2, Save, Search, Check, Info, Crosshair, X, Trash2, Plus, Edit2, ImageIcon, ArrowLeft, ArrowRight, Eye, EyeOff, Scissors } from 'lucide-react';
import { tokens } from '../../lib/tokens';
import { PillButton } from '../../components/ui/PillButton';
import sanmarCatalogJson from '../../data/sanmar-catalog.json';
import { getOrderedKeys, GARMENT_TYPES, detectGarmentTypeTag, type GarmentTypeId } from '../../lib/garmentUtils';
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
  const [colorMockups, setColorMockups] = useState<Record<string, Record<string, string>>>({});
  const [activeGarmentType, setActiveGarmentType] = useState<GarmentTypeId>('t-shirt');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [uploadingSlotKey, setUploadingSlotKey] = useState<string | null>(null);
  const [activeColorModalItem, setActiveColorModalItem] = useState<any | null>(null);

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
          if (data.garmentTypeTags) setGarmentTypeTags(data.garmentTypeTags);
          if (data.removeNeckTag) setRemoveNeckTag(data.removeNeckTag);
          if (data.colorMockups) setColorMockups(data.colorMockups);
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
        customPrices,
        hiddenCollections,
        defaultColors,
        logoPlacements,
        customMockups,
        racksOrder,
        garmentTypeTags,
        removeNeckTag,
        colorMockups,
        updatedAt: new Date().toISOString()
      }, { merge: true });
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

      await setDoc(doc(db, 'settings', 'storefront-catalog'), {
        racks,
        basics,
        customNames,
        customSpecs,
        customPrices,
        hiddenCollections,
        defaultColors,
        logoPlacements,
        customMockups: updatedMockups,
        racksOrder,
        updatedAt: new Date().toISOString()
      });

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
    if (!window.confirm("Restore original catalog image for this slot?")) return;
    const slotKey = `${mode}_${category}_${slot}`;
    setUploadingSlotKey(slotKey);
    try {
      const updatedMockups = { ...customMockups };
      if (updatedMockups[mode]?.[category]) {
        delete updatedMockups[mode][category][slot];
      }

      await setDoc(doc(db, 'settings', 'storefront-catalog'), {
        racks,
        basics,
        customNames,
        customSpecs,
        customPrices,
        hiddenCollections,
        defaultColors,
        logoPlacements,
        customMockups: updatedMockups,
        racksOrder,
        updatedAt: new Date().toISOString()
      });

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

  // Merge built-in catalog with imported custom non-SanMar items
  const allCatalogProducts = useMemo(() => {
    const map = new Map<string, any>();
    sanmarCatalog.forEach(p => map.set(p.style.toLowerCase(), p));
    customProducts.forEach(p => map.set(p.style.toLowerCase(), p));
    return Array.from(map.values());
  }, [customProducts]);

  const getProductDetails = (style: string) => {
    return allCatalogProducts.find(p => p.style.toLowerCase() === style.toLowerCase()) || {
      style,
      title: 'Unknown Garment',
      brand: 'N/A',
      price: 0,
      colors: [],
      images: null
    };
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
  const filteredProducts = allCatalogProducts.filter(p => 
    p.style.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.brand.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getGarmentImage = (p: any, chosenColor?: string, mode?: 'racks' | 'basics', category?: string, slot?: string) => {
    // 1. Explicit slot mockup override
    if (mode && category && slot && customMockups?.[mode]?.[category]?.[slot]) {
      return customMockups[mode][category][slot];
    }

    const styleKey = (p?.style || p?.itemNum || '').toLowerCase();

    // 2. Color-specific custom mockup override
    if (styleKey && chosenColor && colorMockups?.[styleKey]?.[chosenColor]) {
      return colorMockups[styleKey][chosenColor];
    }

    // 3. Search customMockups for any rack/basics slot assigned to this garment style
    if (styleKey) {
      if (racks) {
        for (const cat of Object.keys(racks)) {
          const catObj = racks[cat];
          if (catObj && typeof catObj === 'object') {
            for (const sKey of Object.keys(catObj)) {
              if (catObj[sKey]?.toLowerCase() === styleKey && customMockups?.racks?.[cat]?.[sKey]) {
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
              if (catObj[sKey]?.toLowerCase() === styleKey && customMockups?.basics?.[cat]?.[sKey]) {
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
                          className="flex-1 py-2 px-3 bg-white border border-brand-border text-brand-primary rounded-xl text-[10px] font-bold uppercase tracking-wider hover:bg-neutral-50 transition-all flex items-center justify-center gap-1.5"
                          title="Manage custom mockups and image overrides per color variation"
                        >
                          <ImageIcon size={12} />
                          <span>Colors ({p.colors?.length || 0})</span>
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
                                className="flex-1 py-1.5 px-3 bg-white border border-brand-border text-brand-primary rounded-xl text-[10px] font-bold uppercase tracking-wider hover:bg-neutral-50 transition-all flex items-center justify-center gap-1.5"
                                title="Manage custom mockups and image overrides per color variation"
                              >
                                <ImageIcon size={12} />
                                <span>Colors ({p.colors?.length || 0})</span>
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
        const existing = logoPlacements[mode]?.[category]?.[slot] as LogoBox | undefined;
        return (
          <LogoPlacementModal
             title={`${category} — ${slot.replace('longsleeve', 'long sleeve').toUpperCase()} (${p.brand} ${p.style})`}
             imageUrl={getGarmentImage(p, (mode === 'racks' ? defaultColors.racks : defaultColors.basics)?.[category]?.[slot], mode, category, slot)}
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
                        {(p as any).isCustom && (
                          <span className="text-[9px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Custom</span>
                        )}
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

      {/* Import Custom Item Modal */}
      {/* Color Variations & Mockups Modal */}
      {activeColorModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white border border-brand-border rounded-2xl shadow-2xl max-w-3xl w-full p-6 space-y-6 overflow-hidden max-h-[85vh] flex flex-col">
            <div className="flex items-start justify-between gap-4 border-b border-neutral-100 pb-4">
              <div>
                <h3 className="text-lg font-serif text-brand-primary font-bold flex items-center gap-2">
                  <ImageIcon size={20} className="text-brand-primary" />
                  Color Variations & Mockups for {activeColorModalItem.brand} {activeColorModalItem.style}
                </h3>
                <p className="text-xs text-brand-secondary">
                  Manage custom mockup image overrides and tagless neck tag removal for every color variation.
                </p>
              </div>
              <button 
                onClick={() => setActiveColorModalItem(null)}
                className="p-1 text-neutral-400 hover:text-brand-primary rounded-lg transition-all"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex items-center justify-between bg-neutral-50 p-3 rounded-xl border border-brand-border">
              <div className="flex items-center gap-2">
                <Scissors size={16} className="text-emerald-700" />
                <span className="text-xs font-bold text-brand-primary">Tagless Collar (Manufacturer Tag Removal):</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  const key = activeColorModalItem.style.toLowerCase();
                  setRemoveNeckTag(prev => ({
                    ...prev,
                    [key]: !(prev[key] ?? true)
                  }));
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                  (removeNeckTag[activeColorModalItem.style.toLowerCase()] ?? true)
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white text-neutral-600 border-neutral-300'
                }`}
              >
                {(removeNeckTag[activeColorModalItem.style.toLowerCase()] ?? true) ? 'Enabled (Tag Removed)' : 'Disabled (Original Tag)'}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {(activeColorModalItem.colors || []).map((color: string) => {
                  const styleKey = activeColorModalItem.style.toLowerCase();
                  const customColorImg = colorMockups[styleKey]?.[color];
                  const origImgSet = activeColorModalItem.images?.[color] || Object.values(activeColorModalItem.images || {})[0];
                  const origImgUrl = typeof origImgSet === 'string' ? origImgSet : (origImgSet?.front || '');
                  const currentImg = customColorImg || origImgUrl;

                  return (
                    <div key={color} className="border border-brand-border rounded-xl p-3 bg-white space-y-2 flex flex-col justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-brand-primary truncate" title={color}>{color}</span>
                          {customColorImg && (
                            <span className="text-[9px] font-extrabold uppercase text-amber-700 bg-amber-100 px-1 rounded">Custom</span>
                          )}
                        </div>

                        <div className="w-full h-32 bg-neutral-50 rounded-lg border border-neutral-200 flex items-center justify-center p-2 relative overflow-hidden bg-checkerboard">
                          <img 
                            src={currentImg} 
                            alt={color} 
                            className="max-w-full max-h-full object-contain mix-blend-multiply" 
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5 pt-2 border-t border-neutral-100">
                        <label className="w-full py-1 px-2 bg-neutral-100 hover:bg-neutral-200 text-brand-primary rounded-lg text-[11px] font-bold transition-all text-center cursor-pointer block">
                          <span>{customColorImg ? 'Change Mockup' : 'Upload Mockup'}</span>
                          <input 
                            type="file" 
                            accept="image/*" 
                            className="hidden" 
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              try {
                                const storageRef = ref(storage, `storefront_color_mockups/${styleKey}/${color}_${Date.now()}_${file.name}`);
                                await uploadBytes(storageRef, file);
                                const url = await getDownloadURL(storageRef);
                                setColorMockups(prev => ({
                                  ...prev,
                                  [styleKey]: {
                                    ...(prev[styleKey] || {}),
                                    [color]: url
                                  }
                                }));
                              } catch (err) {
                                console.error("Failed to upload color mockup:", err);
                                alert("Failed to upload image.");
                              }
                            }}
                          />
                        </label>

                        {customColorImg && (
                          <button
                            type="button"
                            onClick={() => {
                              setColorMockups(prev => {
                                const styleMap = { ...(prev[styleKey] || {}) };
                                delete styleMap[color];
                                return {
                                  ...prev,
                                  [styleKey]: styleMap
                                };
                              });
                            }}
                            className="w-full py-1 px-2 text-rose-600 hover:bg-rose-50 rounded-lg text-[10px] font-bold transition-all text-center"
                          >
                            Restore Original Mockup
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-neutral-100">
              <PillButton variant="filled" onClick={() => setActiveColorModalItem(null)}>
                Done
              </PillButton>
            </div>
          </div>
        </div>
      )}

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
