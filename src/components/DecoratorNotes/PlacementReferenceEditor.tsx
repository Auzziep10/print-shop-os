import React, { useRef, useState } from 'react';
import {
  Check,
   Crosshair,
  Edit3,
  Image as ImageIcon,
  Maximize2,
  Plus,
  Ruler,
  Trash2,
  Upload,
  X
} from 'lucide-react';

export type PlacementLineKind = 'width' | 'height' | 'collar' | 'custom';

export interface PlacementReferenceLine {
  id: string;
  kind: PlacementLineKind;
  label: string;
  x1: number; // 0..100 percentage of image width
  y1: number; // 0..100 percentage of image height
  x2: number; // 0..100 percentage of image width
  y2: number; // 0..100 percentage of image height
  color: string;
}

export const LINE_KIND_META: Record<
  PlacementLineKind,
  {
    title: string;
    shortPrefix: string;
    color: string;
    badgeBg: string;
    badgeText: string;
    defaultHint: string;
  }
> = {
  width: {
    title: 'Width Line',
    shortPrefix: 'W',
    color: '#2563eb',
    badgeBg: 'bg-blue-600 text-white border-blue-700',
    badgeText: 'text-blue-700 bg-blue-50 border-blue-200',
    defaultHint: 'Draw horizontally across graphic width'
  },
  height: {
    title: 'Height Line',
    shortPrefix: 'H',
    color: '#059669',
    badgeBg: 'bg-emerald-600 text-white border-emerald-700',
    badgeText: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    defaultHint: 'Draw vertically along graphic height'
  },
  collar: {
    title: 'Collar / Seam Distance',
    shortPrefix: 'Collar',
    color: '#d97706',
    badgeBg: 'bg-amber-500 text-white border-amber-600',
    badgeText: 'text-amber-800 bg-amber-50 border-amber-200',
    defaultHint: 'Draw from collar/seam to top of graphic'
  },
  custom: {
    title: 'Custom Reference Line',
    shortPrefix: 'Ref',
    color: '#e11d48',
    badgeBg: 'bg-rose-600 text-white border-rose-700',
    badgeText: 'text-rose-700 bg-rose-50 border-rose-200',
    defaultHint: 'Draw any custom alignment or seam reference'
  }
};

export function resolveLineDisplayLabel(
  line: PlacementReferenceLine,
  placement: {
    widthInches?: string;
    heightInches?: string;
    distanceFromCollar?: string;
  }
): string {
  if (line.kind === 'width') {
    const val = (placement.widthInches || line.label || '').trim();
    return val ? `W: ${val}` : 'Width';
  }
  if (line.kind === 'height') {
    const val = (placement.heightInches || line.label || '').trim();
    return val ? `H: ${val}` : 'Height';
  }
  if (line.kind === 'collar') {
    const val = (placement.distanceFromCollar || line.label || '').trim();
    return val ? `Collar: ${val}` : 'From Collar';
  }
  return (line.label || 'Ref').trim();
}

interface QuickSourceImage {
  label: string;
  url: string;
}

interface PlacementReferenceSectionProps {
  placementIndex: number;
  placement: {
    id: string;
    location: string;
    widthInches: string;
    heightInches: string;
    distanceFromCollar: string;
    referenceImageUrl?: string;
    referenceImageName?: string;
    referenceLines?: PlacementReferenceLine[];
  };
  quickSources: QuickSourceImage[];
  uploading: boolean;
  onUploadFile: (file: File) => Promise<void>;
  onSelectImageUrl: (url: string, name: string) => void;
  onRemoveImage: () => void;
  onUpdatePlacementAndLines: (updates: {
    widthInches?: string;
    heightInches?: string;
    distanceFromCollar?: string;
    referenceLines: PlacementReferenceLine[];
  }) => void;
}

export const PlacementReferenceOverlaySvg: React.FC<{
  lines: PlacementReferenceLine[];
  placement: {
    widthInches?: string;
    heightInches?: string;
    distanceFromCollar?: string;
  };
  selectedLineId?: string | null;
  interactive?: boolean;
  onSelectLine?: (id: string) => void;
  onStartDragEndpoint?: (lineId: string, endpoint: 'start' | 'end', e: React.MouseEvent) => void;
}> = ({
  lines,
  placement,
  selectedLineId,
  interactive = false,
  onSelectLine,
  onStartDragEndpoint
}) => {
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
    >
      {lines.map((line) => {
        const color = line.color || LINE_KIND_META[line.kind]?.color || '#2563eb';
        const dx = line.x2 - line.x1;
        const dy = line.y2 - line.y1;
        const len = Math.hypot(dx, dy) || 1;
        // Unit perpendicular vector for architectural end-caps
        const px = (-dy / len) * 1.8;
        const py = (dx / len) * 1.8;
        const isSelected = selectedLineId === line.id;

        return (
          <g key={line.id}>
            {/* White outer halo for contrast on dark or light garments */}
            <line
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke="#ffffff"
              strokeWidth={isSelected ? 1.5 : 1.15}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              style={{ strokeWidth: isSelected ? 5 : 4 }}
            />
            {/* Main colored dimension line */}
            <line
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke={color}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              style={{ strokeWidth: isSelected ? 3 : 2.25 }}
            />
            {/* Start perpendicular tick cap */}
            <line
              x1={line.x1 - px}
              y1={line.y1 - py}
              x2={line.x1 + px}
              y2={line.y1 + py}
              stroke="#ffffff"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              style={{ strokeWidth: 4 }}
            />
            <line
              x1={line.x1 - px}
              y1={line.y1 - py}
              x2={line.x1 + px}
              y2={line.y1 + py}
              stroke={color}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              style={{ strokeWidth: 2.25 }}
            />
            {/* End perpendicular tick cap */}
            <line
              x1={line.x2 - px}
              y1={line.y2 - py}
              x2={line.x2 + px}
              y2={line.y2 + py}
              stroke="#ffffff"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              style={{ strokeWidth: 4 }}
            />
            <line
              x1={line.x2 - px}
              y1={line.y2 - py}
              x2={line.x2 + px}
              y2={line.y2 + py}
              stroke={color}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              style={{ strokeWidth: 2.25 }}
            />

            {interactive && (
              <>
                {/* Invisible wider hit target for selecting line */}
                <line
                  x1={line.x1}
                  y1={line.y1}
                  x2={line.x2}
                  y2={line.y2}
                  stroke="transparent"
                  vectorEffect="non-scaling-stroke"
                  style={{ strokeWidth: 14, pointerEvents: 'stroke', cursor: 'pointer' }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    onSelectLine?.(line.id);
                  }}
                />
              </>
            )}
          </g>
        );
      })}
      {/* Render HTML-like midpoint labels & draggable handles outside non-scaling SVG or via companion overlay */}
      {interactive &&
        lines.map((line) => {
          const color = line.color || LINE_KIND_META[line.kind]?.color || '#2563eb';
          return (
            <g key={`${line.id}-handles`}>
              <circle
                cx={line.x1}
                cy={line.y1}
                r={1.3}
                fill="#ffffff"
                stroke={color}
                strokeWidth={0.6}
                style={{ pointerEvents: 'all', cursor: 'grab' }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  onSelectLine?.(line.id);
                  onStartDragEndpoint?.(line.id, 'start', e);
                }}
              />
              <circle
                cx={line.x2}
                cy={line.y2}
                r={1.3}
                fill="#ffffff"
                stroke={color}
                strokeWidth={0.6}
                style={{ pointerEvents: 'all', cursor: 'grab' }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  onSelectLine?.(line.id);
                  onStartDragEndpoint?.(line.id, 'end', e);
                }}
              />
            </g>
          );
        })}
    </svg>
  );
};

export const PlacementReferenceSection: React.FC<PlacementReferenceSectionProps> = ({
  placementIndex,
  placement,
  quickSources,
  uploading,
  onUploadFile,
  onSelectImageUrl,
  onRemoveImage,
  onUpdatePlacementAndLines
}) => {
  const [isStudioOpen, setIsStudioOpen] = useState(false);
  const [activeKind, setActiveKind] = useState<PlacementLineKind>('width');
  const [snapStraight, setSnapStraight] = useState(true);
  const [customLabelDraft, setCustomLabelDraft] = useState('');
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);

  // Draft state inside studio modal
  const [draftLines, setDraftLines] = useState<PlacementReferenceLine[]>([]);
  const [draftWidth, setDraftWidth] = useState('');
  const [draftHeight, setDraftHeight] = useState('');
  const [draftCollar, setDraftCollar] = useState('');

  // Active mouse drawing / endpoint dragging state
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [drawingCurrent, setDrawingCurrent] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null>(null);
  const [draggingEndpoint, setDraggingEndpoint] = useState<{
    lineId: string;
    endpoint: 'start' | 'end';
  } | null>(null);

  const savedLines: PlacementReferenceLine[] = Array.isArray(placement.referenceLines)
    ? placement.referenceLines
    : [];

  const openStudio = () => {
    setDraftLines(savedLines.map((l) => ({ ...l })));
    setDraftWidth(placement.widthInches || '');
    setDraftHeight(placement.heightInches || '');
    setDraftCollar(placement.distanceFromCollar || '');
    setSelectedLineId(savedLines[0]?.id || null);
    setIsStudioOpen(true);
  };

  const getRelativeCoords = (clientX: number, clientY: number, shiftKey = false, origin?: { x: number; y: number }) => {
    const el = canvasRef.current;
    if (!el) return { x: 50, y: 50 };
    const rect = el.getBoundingClientRect();
    let x = ((clientX - rect.left) / Math.max(1, rect.width)) * 100;
    let y = ((clientY - rect.top) / Math.max(1, rect.height)) * 100;
    x = Math.max(1, Math.min(99, x));
    y = Math.max(1, Math.min(99, y));

    if (origin && (snapStraight || shiftKey)) {
      const dx = Math.abs(x - origin.x);
      const dy = Math.abs(y - origin.y);
      if (dx >= dy) {
        y = origin.y;
      } else {
        x = origin.x;
      }
    }
    return { x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) };
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 || draggingEndpoint) return;
    const pt = getRelativeCoords(e.clientX, e.clientY);
    setDrawingCurrent({ x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y });
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (draggingEndpoint) {
      const targetLine = draftLines.find((l) => l.id === draggingEndpoint.lineId);
      if (!targetLine) return;
      const anchor =
        draggingEndpoint.endpoint === 'start'
          ? { x: targetLine.x2, y: targetLine.y2 }
          : { x: targetLine.x1, y: targetLine.y1 };
      const pt = getRelativeCoords(e.clientX, e.clientY, e.shiftKey, anchor);
      setDraftLines((prev) =>
        prev.map((l) => {
          if (l.id !== draggingEndpoint.lineId) return l;
          return draggingEndpoint.endpoint === 'start'
            ? { ...l, x1: pt.x, y1: pt.y }
            : { ...l, x2: pt.x, y2: pt.y };
        })
      );
      return;
    }

    if (!drawingCurrent) return;
    const pt = getRelativeCoords(e.clientX, e.clientY, e.shiftKey, {
      x: drawingCurrent.x1,
      y: drawingCurrent.y1
    });
    setDrawingCurrent((prev) => (prev ? { ...prev, x2: pt.x, y2: pt.y } : null));
  };

  const finishDrawingOrDragging = () => {
    if (draggingEndpoint) {
      setDraggingEndpoint(null);
      return;
    }
    if (!drawingCurrent) return;
    const dist = Math.hypot(drawingCurrent.x2 - drawingCurrent.x1, drawingCurrent.y2 - drawingCurrent.y1);
    if (dist < 2.5) {
      setDrawingCurrent(null);
      return;
    }

    const meta = LINE_KIND_META[activeKind];
    const defaultLabel =
      activeKind === 'width'
        ? draftWidth || '11.5"'
        : activeKind === 'height'
          ? draftHeight || '14"'
          : activeKind === 'collar'
            ? draftCollar || '3" down'
            : customLabelDraft.trim() || 'Reference';

    const newLine: PlacementReferenceLine = {
      id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      kind: activeKind,
      label: defaultLabel,
      x1: drawingCurrent.x1,
      y1: drawingCurrent.y1,
      x2: drawingCurrent.x2,
      y2: drawingCurrent.y2,
      color: meta.color
    };

    // For width/height/collar, if user already had one of the same kind, replace it or add if custom
    setDraftLines((prev) => {
      if (activeKind !== 'custom') {
        const filtered = prev.filter((l) => l.kind !== activeKind);
        return [...filtered, newLine];
      }
      return [...prev, newLine];
    });
    setSelectedLineId(newLine.id);
    setDrawingCurrent(null);

    // Auto-advance activeKind to make drawing Width -> Height -> Collar effortless
    if (activeKind === 'width') setActiveKind('height');
    else if (activeKind === 'height') setActiveKind('collar');
  };

  const handleSaveStudio = () => {
    onUpdatePlacementAndLines({
      widthInches: draftWidth,
      heightInches: draftHeight,
      distanceFromCollar: draftCollar,
      referenceLines: draftLines
    });
    setIsStudioOpen(false);
  };

  return (
    <div className="pt-2 border-t border-neutral-200/80">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          <Ruler size={12} className="text-indigo-600" />
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-700">
            Placement Reference Image &amp; Dimension Lines ({savedLines.length})
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {placement.referenceImageUrl && (
            <button
              type="button"
              onClick={openStudio}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold shadow-2xs transition-colors cursor-pointer"
            >
              <Edit3 size={11} />
              <span>
                {savedLines.length > 0
                  ? `Draw / Edit Reference Lines (${savedLines.length})`
                  : 'Draw Reference Lines'}
              </span>
            </button>
          )}

          <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-[10px] font-bold transition-colors cursor-pointer">
            <Upload size={11} />
            <span>
              {uploading
                ? 'Uploading...'
                : placement.referenceImageUrl
                  ? 'Replace Image'
                  : 'Upload Placement Image'}
            </span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  void onUploadFile(file);
                }
                e.target.value = '';
              }}
              className="hidden"
            />
          </label>

          {placement.referenceImageUrl && (
            <button
              type="button"
              onClick={onRemoveImage}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white hover:bg-red-50 text-red-600 border border-neutral-200 hover:border-red-200 text-[10px] font-bold transition-colors cursor-pointer"
              title="Remove placement reference image"
            >
              <Trash2 size={11} />
            </button>
          )}
        </div>
      </div>

      {!placement.referenceImageUrl ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const file = e.dataTransfer.files?.[0];
            if (file && file.type.startsWith('image/')) {
              void onUploadFile(file);
            }
          }}
          className="rounded-xl border border-dashed border-neutral-300 bg-white p-3 flex flex-col sm:flex-row items-center justify-between gap-3"
        >
          <label className="flex items-center gap-2.5 cursor-pointer text-left">
            <div className="w-8 h-8 rounded-lg bg-neutral-100 border border-neutral-200 flex items-center justify-center text-neutral-600 shrink-0">
              <ImageIcon size={15} />
            </div>
            <div>
              <p className="text-xs font-bold text-neutral-800">
                Upload an image for Placement #{placementIndex + 1} ({placement.location})
              </p>
              <p className="text-[10px] text-neutral-500">
                Upload a photo/mock-up (or drag &amp; drop here) to draw Width, Height &amp; Collar dimension lines on it.
              </p>
            </div>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  void onUploadFile(file);
                }
                e.target.value = '';
              }}
              className="hidden"
            />
          </label>

          {quickSources.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              <span className="text-[10px] font-bold text-neutral-400 mr-0.5">Or use:</span>
              {quickSources.map((src, sIdx) => (
                <button
                  key={`${src.label}-${sIdx}`}
                  type="button"
                  onClick={() => onSelectImageUrl(src.url, src.label)}
                  className="px-2.5 py-1 rounded-lg bg-neutral-100 hover:bg-neutral-900 text-neutral-700 hover:text-white border border-neutral-200 text-[10px] font-bold transition-colors cursor-pointer"
                >
                  {src.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white border border-neutral-200 rounded-xl p-3 flex flex-col sm:flex-row items-center gap-4">
          {/* Interactive Thumbnail with SVG Reference Lines Overlay */}
          <div
            onClick={openStudio}
            className="relative w-full sm:w-56 h-44 rounded-lg border border-neutral-200 bg-neutral-100/70 flex items-center justify-center overflow-hidden cursor-pointer group/canvas shrink-0"
            title="Click to draw or edit dimension reference lines"
          >
            <img
              src={placement.referenceImageUrl}
              alt={`${placement.location} Reference`}
              className="w-full h-full object-contain select-none pointer-events-none"
            />
            <PlacementReferenceOverlaySvg lines={savedLines} placement={placement} />

            {/* Midpoint Callout Pills */}
            {savedLines.map((line) => {
              const midX = (line.x1 + line.x2) / 2;
              const midY = (line.y1 + line.y2) / 2;
              const meta = LINE_KIND_META[line.kind] || LINE_KIND_META.custom;
              const text = resolveLineDisplayLabel(line, placement);
              return (
                <div
                  key={`${line.id}-pill`}
                  style={{ left: `${midX}%`, top: `${midY}%` }}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded text-[9px] font-extrabold border shadow-xs whitespace-nowrap pointer-events-none ${meta.badgeBg}`}
                >
                  {text}
                </div>
              );
            })}

            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/40 to-transparent px-2.5 py-1.5 flex items-center justify-between text-white opacity-95 group-hover/canvas:opacity-100 transition-opacity">
              <span className="text-[10px] font-bold flex items-center gap-1">
                <Crosshair size={11} />
                <span>Click to Draw Reference Lines</span>
              </span>
              <Maximize2 size={11} />
            </div>
          </div>

          {/* Right side: Summary of drawn reference lines & quick actions */}
          <div className="flex-1 min-w-0 w-full space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-neutral-900">
                {placement.location} — Visual Dimension Spec
              </span>
              <button
                type="button"
                onClick={openStudio}
                className="text-[11px] font-extrabold text-indigo-600 hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                <Plus size={12} />
                <span>Add / Edit Lines on Image</span>
              </button>
            </div>

            {savedLines.length === 0 ? (
              <p className="text-xs text-neutral-500">
                No reference lines drawn yet. Click{' '}
                <button
                  type="button"
                  onClick={openStudio}
                  className="font-bold text-indigo-600 underline cursor-pointer"
                >
                  Draw Reference Lines
                </button>{' '}
                to draw Width, Height, and Collar distance lines directly on this image.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {savedLines.map((line) => {
                  const meta = LINE_KIND_META[line.kind] || LINE_KIND_META.custom;
                  return (
                    <span
                      key={line.id}
                      onClick={openStudio}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border cursor-pointer ${meta.badgeText}`}
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: line.color || meta.color }}
                      />
                      <span>{resolveLineDisplayLabel(line, placement)}</span>
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* FULL-SCREEN INTERACTIVE DIMENSION DRAWING STUDIO MODAL */}
      {isStudioOpen && placement.referenceImageUrl && (
        <div
          className="fixed inset-0 z-[280] bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
          onClick={() => setIsStudioOpen(false)}
        >
          <div
            className="bg-white max-w-5xl w-full rounded-2xl shadow-2xl border border-neutral-200 overflow-hidden my-auto max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Studio Header */}
            <div className="px-5 py-3.5 bg-neutral-900 text-white flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-indigo-500 text-white text-[10px] font-extrabold uppercase tracking-wider">
                    Placement #{placementIndex + 1} • {placement.location}
                  </span>
                  <h3 className="text-sm sm:text-base font-black">
                    Draw Dimension Reference Lines
                  </h3>
                </div>
                <p className="text-[11px] text-neutral-300 mt-0.5">
                  Select a dimension type below, then click and drag across the garment image to draw reference lines. Drag any endpoint circle to adjust.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveStudio}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-extrabold shadow-sm transition-colors cursor-pointer"
                >
                  <Check size={14} strokeWidth={2.5} />
                  <span>Apply Reference Lines</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsStudioOpen(false)}
                  className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                >
                  <X size={17} />
                </button>
              </div>
            </div>

            {/* Tool Selection Bar */}
            <div className="px-5 py-3 bg-neutral-50 border-b border-neutral-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-500 mr-1">
                  1. Choose Line to Draw:
                </span>
                {(['width', 'height', 'collar', 'custom'] as PlacementLineKind[]).map((kind) => {
                  const meta = LINE_KIND_META[kind];
                  const isActive = activeKind === kind;
                  return (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => setActiveKind(kind)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold border transition-all cursor-pointer ${
                        isActive
                          ? `${meta.badgeBg} shadow-xs scale-[1.02]`
                          : 'bg-white hover:bg-neutral-100 text-neutral-700 border-neutral-200'
                      }`}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/60"
                        style={{ backgroundColor: meta.color }}
                      />
                      <span>{meta.title}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-3">
                <label className="inline-flex items-center gap-1.5 text-xs font-bold text-neutral-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={snapStraight}
                    onChange={(e) => setSnapStraight(e.target.checked)}
                    className="w-3.5 h-3.5 rounded accent-neutral-900 cursor-pointer"
                  />
                  <span>Snap Straight (Horizontal / Vertical)</span>
                </label>

                {draftLines.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setDraftLines([]);
                      setSelectedLineId(null);
                    }}
                    className="text-xs font-bold text-red-600 hover:underline cursor-pointer"
                  >
                    Clear All
                  </button>
                )}
              </div>
            </div>

            {/* Studio Main Body: Interactive Image Canvas + Side Dimension Spec Panel */}
            <div className="p-5 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1">
              {/* Left 8 cols: Interactive Drawing Canvas */}
              <div className="lg:col-span-8 flex flex-col items-center justify-center bg-neutral-100 border border-neutral-200 rounded-2xl p-3 select-none">
                <div
                  ref={canvasRef}
                  onMouseDown={handleCanvasMouseDown}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseUp={finishDrawingOrDragging}
                  onMouseLeave={finishDrawingOrDragging}
                  className="relative w-full h-[54vh] min-h-[340px] max-h-[540px] bg-white rounded-xl border border-neutral-200 overflow-hidden cursor-crosshair flex items-center justify-center"
                >
                  <img
                    src={placement.referenceImageUrl}
                    alt={`${placement.location} Canvas`}
                    draggable={false}
                    className="w-full h-full object-contain select-none pointer-events-none"
                  />

                  <PlacementReferenceOverlaySvg
                    lines={
                      drawingCurrent
                        ? [
                            ...draftLines,
                            {
                              id: '__drawing__',
                              kind: activeKind,
                              label: '',
                              x1: drawingCurrent.x1,
                              y1: drawingCurrent.y1,
                              x2: drawingCurrent.x2,
                              y2: drawingCurrent.y2,
                              color: LINE_KIND_META[activeKind].color
                            }
                          ]
                        : draftLines
                    }
                    placement={{
                      widthInches: draftWidth,
                      heightInches: draftHeight,
                      distanceFromCollar: draftCollar
                    }}
                    selectedLineId={selectedLineId}
                    interactive
                    onSelectLine={(id) => setSelectedLineId(id)}
                    onStartDragEndpoint={(lineId, endpoint) =>
                      setDraggingEndpoint({ lineId, endpoint })
                    }
                  />

                  {/* Midpoint Callout Badges on Canvas */}
                  {draftLines.map((line) => {
                    const midX = (line.x1 + line.x2) / 2;
                    const midY = (line.y1 + line.y2) / 2;
                    const meta = LINE_KIND_META[line.kind] || LINE_KIND_META.custom;
                    const labelText = resolveLineDisplayLabel(line, {
                      widthInches: draftWidth,
                      heightInches: draftHeight,
                      distanceFromCollar: draftCollar
                    });
                    const isSelected = selectedLineId === line.id;
                    return (
                      <div
                        key={`${line.id}-studio-pill`}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setSelectedLineId(line.id);
                        }}
                        style={{ left: `${midX}%`, top: `${midY}%` }}
                        className={`absolute -translate-x-1/2 -translate-y-1/2 px-2 py-0.5 rounded-md text-[11px] font-extrabold border shadow-md whitespace-nowrap cursor-pointer transition-transform ${
                          meta.badgeBg
                        } ${isSelected ? 'ring-2 ring-black scale-110' : ''}`}
                      >
                        {labelText}
                      </div>
                    );
                  })}
                </div>

                <p className="text-[11px] font-semibold text-neutral-500 mt-2">
                  Tip: Click &amp; drag on the image to draw a{' '}
                  <strong className="text-neutral-800">{LINE_KIND_META[activeKind].title}</strong>.{' '}
                  {LINE_KIND_META[activeKind].defaultHint}.
                </p>
              </div>

              {/* Right 4 cols: Dimension Values & Drawn Lines List */}
              <div className="lg:col-span-4 flex flex-col justify-between gap-4">
                <div className="space-y-4">
                  <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3.5 space-y-3">
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-neutral-800">
                      Placement Dimensions (Synced with Lines)
                    </h4>

                    <div>
                      <label className="flex items-center justify-between text-[10px] font-extrabold uppercase text-blue-700 mb-1">
                        <span>Width (in)</span>
                        <button
                          type="button"
                          onClick={() => setActiveKind('width')}
                          className="underline cursor-pointer"
                        >
                          Draw Width Line
                        </button>
                      </label>
                      <input
                        type="text"
                        value={draftWidth}
                        onChange={(e) => {
                          const val = e.target.value;
                          setDraftWidth(val);
                          setDraftLines((prev) =>
                            prev.map((l) => (l.kind === 'width' ? { ...l, label: val } : l))
                          );
                        }}
                        placeholder='e.g. 11.5"'
                        className="w-full px-3 py-1.5 text-xs font-bold bg-white border border-blue-200 rounded-lg focus:outline-none focus:border-blue-600"
                      />
                    </div>

                    <div>
                      <label className="flex items-center justify-between text-[10px] font-extrabold uppercase text-emerald-700 mb-1">
                        <span>Height (in)</span>
                        <button
                          type="button"
                          onClick={() => setActiveKind('height')}
                          className="underline cursor-pointer"
                        >
                          Draw Height Line
                        </button>
                      </label>
                      <input
                        type="text"
                        value={draftHeight}
                        onChange={(e) => {
                          const val = e.target.value;
                          setDraftHeight(val);
                          setDraftLines((prev) =>
                            prev.map((l) => (l.kind === 'height' ? { ...l, label: val } : l))
                          );
                        }}
                        placeholder='e.g. 14"'
                        className="w-full px-3 py-1.5 text-xs font-bold bg-white border border-emerald-200 rounded-lg focus:outline-none focus:border-emerald-600"
                      />
                    </div>

                    <div>
                      <label className="flex items-center justify-between text-[10px] font-extrabold uppercase text-amber-700 mb-1">
                        <span>Distance From Collar</span>
                        <button
                          type="button"
                          onClick={() => setActiveKind('collar')}
                          className="underline cursor-pointer"
                        >
                          Draw Collar Line
                        </button>
                      </label>
                      <input
                        type="text"
                        value={draftCollar}
                        onChange={(e) => {
                          const val = e.target.value;
                          setDraftCollar(val);
                          setDraftLines((prev) =>
                            prev.map((l) => (l.kind === 'collar' ? { ...l, label: val } : l))
                          );
                        }}
                        placeholder='e.g. 3" down from collar seam'
                        className="w-full px-3 py-1.5 text-xs font-bold bg-white border border-amber-200 rounded-lg focus:outline-none focus:border-amber-600"
                      />
                    </div>

                    {activeKind === 'custom' && (
                      <div>
                        <label className="block text-[10px] font-extrabold uppercase text-rose-700 mb-1">
                          Default Label for Next Custom Line
                        </label>
                        <input
                          type="text"
                          value={customLabelDraft}
                          onChange={(e) => setCustomLabelDraft(e.target.value)}
                          placeholder='e.g. 2" above pocket seam'
                          className="w-full px-3 py-1.5 text-xs font-bold bg-white border border-rose-200 rounded-lg focus:outline-none focus:border-rose-600"
                        />
                      </div>
                    )}
                  </div>

                  {/* Drawn Reference Lines List */}
                  <div className="bg-white border border-neutral-200 rounded-xl p-3.5 space-y-2">
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-neutral-800">
                      Drawn Reference Lines ({draftLines.length})
                    </h4>

                    {draftLines.length === 0 ? (
                      <p className="text-xs text-neutral-400 italic py-2">
                        Click and drag on the image to draw your first dimension reference line.
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                        {draftLines.map((line) => {
                          const meta = LINE_KIND_META[line.kind] || LINE_KIND_META.custom;
                          return (
                            <div
                              key={line.id}
                              onClick={() => setSelectedLineId(line.id)}
                              className={`flex items-center justify-between gap-2 p-2 rounded-lg border text-xs cursor-pointer ${
                                selectedLineId === line.id
                                  ? 'border-neutral-900 bg-neutral-50'
                                  : 'border-neutral-200 bg-white'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span
                                  className="w-2.5 h-2.5 rounded-full shrink-0"
                                  style={{ backgroundColor: line.color || meta.color }}
                                />
                                <span className="text-[10px] font-extrabold uppercase text-neutral-500 shrink-0">
                                  {meta.shortPrefix}:
                                </span>
                                <input
                                  type="text"
                                  value={
                                    line.kind === 'width'
                                      ? draftWidth
                                      : line.kind === 'height'
                                        ? draftHeight
                                        : line.kind === 'collar'
                                          ? draftCollar
                                          : line.label
                                  }
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (line.kind === 'width') setDraftWidth(val);
                                    else if (line.kind === 'height') setDraftHeight(val);
                                    else if (line.kind === 'collar') setDraftCollar(val);
                                    setDraftLines((prev) =>
                                      prev.map((l) => (l.id === line.id ? { ...l, label: val } : l))
                                    );
                                  }}
                                  placeholder="Dimension label..."
                                  className="w-full px-2 py-1 text-xs font-bold bg-white border border-neutral-200 rounded focus:outline-none focus:border-neutral-900"
                                />
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDraftLines((prev) => prev.filter((l) => l.id !== line.id));
                                }}
                                className="p-1 text-neutral-400 hover:text-red-600 cursor-pointer"
                                title="Delete reference line"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-200">
                  <button
                    type="button"
                    onClick={() => setIsStudioOpen(false)}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-neutral-600 hover:bg-neutral-100 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveStudio}
                    className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-extrabold shadow-xs cursor-pointer"
                  >
                    <Check size={14} />
                    <span>Save Reference Lines</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
