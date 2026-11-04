import React, { useRef, useState } from 'react';
import {
  Check,
  Crosshair,
  Edit3,
  Image as ImageIcon,
  Maximize2,
  Plus,
  Ruler,
  Sparkles,
  Trash2,
  Upload,
  X
} from 'lucide-react';

export type PlacementLineKind = 'width' | 'height' | 'collar' | 'custom';
export type StudioToolMode = PlacementLineKind | 'scale';

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

export interface PlacementScaleCalibration {
  x1: number; // 0..100 percentage of image width
  y1: number; // 0..100 percentage of image height
  x2: number; // 0..100 percentage of image width
  y2: number; // 0..100 percentage of image height
  realWorldInches: number; // e.g., 28 for 28" garment height, or 5.5 for 5.5" pocket
  referenceFeatureName: string; // e.g., "Front Garment Height", "Pocket Width", "Chest Width"
  aspectRatio?: number; // rendered width / height ratio at calibration time
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
    defaultHint: 'Draw across graphic width in any direction'
  },
  height: {
    title: 'Height Line',
    shortPrefix: 'H',
    color: '#059669',
    badgeBg: 'bg-emerald-600 text-white border-emerald-700',
    badgeText: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    defaultHint: 'Draw along graphic height in any direction'
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
    defaultHint: 'Draw any custom alignment or logo measurement'
  }
};

const SCALE_PRESET_FEATURES = [
  { label: 'Front Garment Height', defaultInches: '28' },
  { label: 'Chest Width (Pit-to-Pit)', defaultInches: '22' },
  { label: 'Pocket Width', defaultInches: '5.5' },
  { label: 'Collar Opening', defaultInches: '7.5' },
  { label: 'Sleeve Length', defaultInches: '25' }
];

export function parseInchesValue(raw: string | number | undefined): number {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? raw : 0;
  if (!raw) return 0;
  const cleaned = String(raw).trim().replace(/["”″']/g, '');
  // Support mixed fractions like "5 1/2"
  const fractionMatch = cleaned.match(/^(\d+)\s+(\d+)\/(\d+)/);
  if (fractionMatch) {
    const whole = parseFloat(fractionMatch[1]);
    const num = parseFloat(fractionMatch[2]);
    const den = parseFloat(fractionMatch[3]);
    if (den > 0) return whole + num / den;
  }
  const numMatch = cleaned.match(/(\d+(?:\.\d+)?)/);
  if (!numMatch) return 0;
  const val = parseFloat(numMatch[1]);
  return Number.isFinite(val) && val > 0 ? val : 0;
}

export function computeAspectCorrectedDistance(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  aspectRatio = 1
): number {
  const safeAspect = Number.isFinite(aspectRatio) && aspectRatio > 0.1 ? aspectRatio : 1;
  const dx = (x2 - x1) * safeAspect;
  const dy = y2 - y1;
  return Math.hypot(dx, dy);
}

export function measureLineInRealInches(
  coords: { x1: number; y1: number; x2: number; y2: number },
  calibration: PlacementScaleCalibration | null | undefined,
  fallbackAspectRatio = 1
): number | null {
  if (!calibration || !(calibration.realWorldInches > 0)) return null;
  const aspect = calibration.aspectRatio || fallbackAspectRatio || 1;
  const refDist = computeAspectCorrectedDistance(
    calibration.x1,
    calibration.y1,
    calibration.x2,
    calibration.y2,
    aspect
  );
  if (refDist < 0.5) return null;
  const lineDist = computeAspectCorrectedDistance(
    coords.x1,
    coords.y1,
    coords.x2,
    coords.y2,
    aspect
  );
  const measured = (lineDist / refDist) * calibration.realWorldInches;
  if (!Number.isFinite(measured) || measured <= 0) return null;
  return Math.round(measured * 100) / 100;
}

export function formatMeasuredInches(inches: number, kind?: PlacementLineKind): string {
  // Round to 1 decimal place (or 2 if quarter-inch like .25 / .75)
  const rounded2 = Math.round(inches * 20) / 20; // nearest 0.05"
  const formatted = Number.isInteger(rounded2)
    ? `${rounded2}"`
    : `${Number(rounded2.toFixed(2))}"`;
  if (kind === 'collar') {
    return `${formatted} down`;
  }
  return formatted;
}

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
    scaleCalibration?: PlacementScaleCalibration;
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
    scaleCalibration?: PlacementScaleCalibration | null;
  }) => void;
}

export const PlacementReferenceOverlaySvg: React.FC<{
  lines: PlacementReferenceLine[];
  scaleCalibration?: PlacementScaleCalibration | null;
  showScaleLine?: boolean;
  placement: {
    widthInches?: string;
    heightInches?: string;
    distanceFromCollar?: string;
  };
  selectedLineId?: string | null;
  interactive?: boolean;
  onSelectLine?: (id: string) => void;
  onStartDragEndpoint?: (
    lineId: string,
    endpoint: 'start' | 'end',
    e: React.MouseEvent
  ) => void;
}> = ({
  lines,
  scaleCalibration,
  showScaleLine = false,
  selectedLineId,
  interactive = false,
  onSelectLine,
  onStartDragEndpoint
}) => {
  const renderArchitecturalLine = (
    line: {
      id: string;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      color: string;
    },
    isScaleLine = false
  ) => {
    const color = line.color;
    const dx = line.x2 - line.x1;
    const dy = line.y2 - line.y1;
    const len = Math.hypot(dx, dy) || 1;
    const px = (-dy / len) * 1.9;
    const py = (dx / len) * 1.9;
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
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          style={{ strokeWidth: isSelected ? 6.5 : 5 }}
        />
        {/* Main colored dimension line */}
        <line
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          stroke={color}
          strokeLinecap="round"
          strokeDasharray={isScaleLine ? '5 3' : undefined}
          vectorEffect="non-scaling-stroke"
          style={{ strokeWidth: isSelected ? 3.5 : 2.5 }}
        />
        {/* Start perpendicular tick */}
        <line
          x1={line.x1 - px}
          y1={line.y1 - py}
          x2={line.x1 + px}
          y2={line.y1 + py}
          stroke="#ffffff"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          style={{ strokeWidth: 4.5 }}
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
        {/* End perpendicular tick */}
        <line
          x1={line.x2 - px}
          y1={line.y2 - py}
          x2={line.x2 + px}
          y2={line.y2 + py}
          stroke="#ffffff"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          style={{ strokeWidth: 4.5 }}
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
        )}
      </g>
    );
  };

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
    >
      {/* Optional Real-World Scale Calibration Ruler Line */}
      {showScaleLine &&
        scaleCalibration &&
        renderArchitecturalLine(
          {
            id: '__scale_calibration__',
            x1: scaleCalibration.x1,
            y1: scaleCalibration.y1,
            x2: scaleCalibration.x2,
            y2: scaleCalibration.y2,
            color: '#7c3aed'
          },
          true
        )}

      {/* Placement Dimension Reference Lines */}
      {lines.map((line) =>
        renderArchitecturalLine({
          id: line.id,
          x1: line.x1,
          y1: line.y1,
          x2: line.x2,
          y2: line.y2,
          color: line.color || LINE_KIND_META[line.kind]?.color || '#2563eb'
        })
      )}

      {/* Draggable Endpoint Handles for Scale Calibration Line */}
      {interactive && showScaleLine && scaleCalibration && (
        <g key="__scale_calibration_handles__">
          <circle
            cx={scaleCalibration.x1}
            cy={scaleCalibration.y1}
            r={1.35}
            fill="#ffffff"
            stroke="#7c3aed"
            strokeWidth={0.65}
            style={{ pointerEvents: 'all', cursor: 'grab' }}
            onMouseDown={(e) => {
              e.stopPropagation();
              onSelectLine?.('__scale_calibration__');
              onStartDragEndpoint?.('__scale_calibration__', 'start', e);
            }}
          />
          <circle
            cx={scaleCalibration.x2}
            cy={scaleCalibration.y2}
            r={1.35}
            fill="#ffffff"
            stroke="#7c3aed"
            strokeWidth={0.65}
            style={{ pointerEvents: 'all', cursor: 'grab' }}
            onMouseDown={(e) => {
              e.stopPropagation();
              onSelectLine?.('__scale_calibration__');
              onStartDragEndpoint?.('__scale_calibration__', 'end', e);
            }}
          />
        </g>
      )}

      {/* Draggable Endpoint Handles for Dimension Lines */}
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
  const [activeTool, setActiveTool] = useState<StudioToolMode>('width');
  const [snapStraight, setSnapStraight] = useState(false);
  const [customLabelDraft, setCustomLabelDraft] = useState('');
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);

  // Draft state inside studio modal
  const [draftLines, setDraftLines] = useState<PlacementReferenceLine[]>([]);
  const [draftWidth, setDraftWidth] = useState('');
  const [draftHeight, setDraftHeight] = useState('');
  const [draftCollar, setDraftCollar] = useState('');

  // Real-world scale calibration state inside studio modal
  const [draftScale, setDraftScale] = useState<PlacementScaleCalibration | null>(null);
  const [scaleFeatureInput, setScaleFeatureInput] = useState('Front Garment Height');
  const [scaleInchesInput, setScaleInchesInput] = useState('28');
  const [canvasAspectRatio, setCanvasAspectRatio] = useState(1.25);

  // Active mouse drawing / endpoint dragging state
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const scaleInchesInputRef = useRef<HTMLInputElement | null>(null);
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

  const getCurrentCanvasAspectRatio = (): number => {
    const el = canvasRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 10 && rect.height > 10) {
        return rect.width / rect.height;
      }
    }
    return canvasAspectRatio || 1.25;
  };

  const openStudio = () => {
    setDraftLines(savedLines.map((l) => ({ ...l })));
    setDraftWidth(placement.widthInches || '');
    setDraftHeight(placement.heightInches || '');
    setDraftCollar(placement.distanceFromCollar || '');
    if (placement.scaleCalibration && placement.scaleCalibration.realWorldInches > 0) {
      setDraftScale({ ...placement.scaleCalibration });
      setScaleFeatureInput(
        placement.scaleCalibration.referenceFeatureName || 'Front Garment Height'
      );
      setScaleInchesInput(String(placement.scaleCalibration.realWorldInches));
    } else {
      setDraftScale(null);
      setScaleFeatureInput('Front Garment Height');
      setScaleInchesInput('28');
    }
    setSelectedLineId(savedLines[0]?.id || null);
    setIsStudioOpen(true);
  };

  const recalculateAllLinesWithScale = (
    nextScale: PlacementScaleCalibration | null,
    linesToMeasure: PlacementReferenceLine[] = draftLines
  ) => {
    if (!nextScale || !(nextScale.realWorldInches > 0)) return;
    const aspect = nextScale.aspectRatio || getCurrentCanvasAspectRatio();
    let updatedW = draftWidth;
    let updatedH = draftHeight;
    let updatedCollar = draftCollar;

    const updatedLines = linesToMeasure.map((line) => {
      const measured = measureLineInRealInches(line, nextScale, aspect);
      if (measured === null) return line;
      const formatted = formatMeasuredInches(measured, line.kind);
      if (line.kind === 'width') updatedW = formatted;
      else if (line.kind === 'height') updatedH = formatted;
      else if (line.kind === 'collar') updatedCollar = formatted;
      return { ...line, label: formatted };
    });

    setDraftWidth(updatedW);
    setDraftHeight(updatedH);
    setDraftCollar(updatedCollar);
    setDraftLines(updatedLines);
  };

  const getRelativeCoords = (
    clientX: number,
    clientY: number,
    shiftKey = false,
    origin?: { x: number; y: number }
  ) => {
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
    const aspect = getCurrentCanvasAspectRatio();
    setCanvasAspectRatio(aspect);
    const pt = getRelativeCoords(e.clientX, e.clientY);
    setDrawingCurrent({ x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y });
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const aspect = getCurrentCanvasAspectRatio();

    if (draggingEndpoint) {
      if (draggingEndpoint.lineId === '__scale_calibration__' && draftScale) {
        const anchor =
          draggingEndpoint.endpoint === 'start'
            ? { x: draftScale.x2, y: draftScale.y2 }
            : { x: draftScale.x1, y: draftScale.y1 };
        const pt = getRelativeCoords(e.clientX, e.clientY, e.shiftKey, anchor);
        const nextScale: PlacementScaleCalibration = {
          ...draftScale,
          aspectRatio: aspect,
          ...(draggingEndpoint.endpoint === 'start'
            ? { x1: pt.x, y1: pt.y }
            : { x2: pt.x, y2: pt.y })
        };
        setDraftScale(nextScale);
        recalculateAllLinesWithScale(nextScale, draftLines);
        return;
      }

      const targetLine = draftLines.find((l) => l.id === draggingEndpoint.lineId);
      if (!targetLine) return;
      const anchor =
        draggingEndpoint.endpoint === 'start'
          ? { x: targetLine.x2, y: targetLine.y2 }
          : { x: targetLine.x1, y: targetLine.y1 };
      const pt = getRelativeCoords(e.clientX, e.clientY, e.shiftKey, anchor);
      const nextCoords =
        draggingEndpoint.endpoint === 'start'
          ? { x1: pt.x, y1: pt.y, x2: targetLine.x2, y2: targetLine.y2 }
          : { x1: targetLine.x1, y1: targetLine.y1, x2: pt.x, y2: pt.y };

      // If scale calibration is active, auto-measure as the endpoint is dragged
      const measuredInches = measureLineInRealInches(nextCoords, draftScale, aspect);
      const measuredFormatted =
        measuredInches !== null ? formatMeasuredInches(measuredInches, targetLine.kind) : null;

      if (measuredFormatted !== null) {
        if (targetLine.kind === 'width') setDraftWidth(measuredFormatted);
        else if (targetLine.kind === 'height') setDraftHeight(measuredFormatted);
        else if (targetLine.kind === 'collar') setDraftCollar(measuredFormatted);
      }

      setDraftLines((prev) =>
        prev.map((l) => {
          if (l.id !== draggingEndpoint.lineId) return l;
          return {
            ...l,
            ...nextCoords,
            ...(measuredFormatted !== null ? { label: measuredFormatted } : {})
          };
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
    const dist = Math.hypot(
      drawingCurrent.x2 - drawingCurrent.x1,
      drawingCurrent.y2 - drawingCurrent.y1
    );
    if (dist < 2.0) {
      setDrawingCurrent(null);
      return;
    }

    const aspect = getCurrentCanvasAspectRatio();

    // Handle drawing the Real-World Scale Calibration Line
    if (activeTool === 'scale') {
      const parsedInches = parseInchesValue(scaleInchesInput) || 28;
      const nextScale: PlacementScaleCalibration = {
        x1: drawingCurrent.x1,
        y1: drawingCurrent.y1,
        x2: drawingCurrent.x2,
        y2: drawingCurrent.y2,
        realWorldInches: parsedInches,
        referenceFeatureName: scaleFeatureInput.trim() || 'Garment Reference',
        aspectRatio: aspect
      };
      setDraftScale(nextScale);
      setDrawingCurrent(null);
      setSelectedLineId('__scale_calibration__');
      recalculateAllLinesWithScale(nextScale, draftLines);
      // Automatically switch to Width Line so user can immediately measure the logo!
      setActiveTool('width');
      setTimeout(() => {
        scaleInchesInputRef.current?.focus();
        scaleInchesInputRef.current?.select();
      }, 60);
      return;
    }

    // Otherwise we are drawing a dimension line (width, height, collar, or custom)
    const activeKind: PlacementLineKind = activeTool;
    const meta = LINE_KIND_META[activeKind];

    // Check if Real-World Scale Calibration is active to auto-measure this logo line!
    const measuredInches = measureLineInRealInches(drawingCurrent, draftScale, aspect);
    const measuredFormatted =
      measuredInches !== null ? formatMeasuredInches(measuredInches, activeKind) : null;

    let resolvedLabel = '';
    if (measuredFormatted !== null) {
      resolvedLabel = measuredFormatted;
      if (activeKind === 'width') setDraftWidth(measuredFormatted);
      else if (activeKind === 'height') setDraftHeight(measuredFormatted);
      else if (activeKind === 'collar') setDraftCollar(measuredFormatted);
    } else {
      resolvedLabel =
        activeKind === 'width'
          ? draftWidth || '11.5"'
          : activeKind === 'height'
            ? draftHeight || '14"'
            : activeKind === 'collar'
              ? draftCollar || '3" down'
              : customLabelDraft.trim() || 'Reference';
    }

    const newLine: PlacementReferenceLine = {
      id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      kind: activeKind,
      label: resolvedLabel,
      x1: drawingCurrent.x1,
      y1: drawingCurrent.y1,
      x2: drawingCurrent.x2,
      y2: drawingCurrent.y2,
      color: meta.color
    };

    setDraftLines((prev) => {
      if (activeKind !== 'custom') {
        const filtered = prev.filter((l) => l.kind !== activeKind);
        return [...filtered, newLine];
      }
      return [...prev, newLine];
    });
    setSelectedLineId(newLine.id);
    setDrawingCurrent(null);

    // Auto-advance activeTool to make drawing Width -> Height -> Collar effortless
    if (activeKind === 'width') setActiveTool('height');
    else if (activeKind === 'height') setActiveTool('collar');
  };

  const handleSaveStudio = () => {
    onUpdatePlacementAndLines({
      widthInches: draftWidth,
      heightInches: draftHeight,
      distanceFromCollar: draftCollar,
      referenceLines: draftLines,
      scaleCalibration: draftScale
    });
    setIsStudioOpen(false);
  };

  // Live measurement preview while the user is actively dragging a line on the canvas
  const liveDrawingMeasurementLabel = (() => {
    if (!drawingCurrent) return null;
    if (activeTool === 'scale') {
      const inches = parseInchesValue(scaleInchesInput) || 28;
      return `📏 Scale Reference: ${inches}" (${scaleFeatureInput || 'Reference'})`;
    }
    const measured = measureLineInRealInches(
      drawingCurrent,
      draftScale,
      getCurrentCanvasAspectRatio()
    );
    if (measured === null) return null;
    const prefix = LINE_KIND_META[activeTool].shortPrefix;
    return `${prefix}: ${formatMeasuredInches(measured, activeTool)}`;
  })();

  return (
    <div className="pt-2 border-t border-neutral-200/80">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Ruler size={12} className="text-indigo-600" />
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-700">
            Placement Reference Image &amp; Dimension Lines ({savedLines.length})
          </span>
          {placement.scaleCalibration && placement.scaleCalibration.realWorldInches > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200 text-[9px] font-extrabold">
              <Sparkles size={9} />
              <span>
                Calibrated: {placement.scaleCalibration.realWorldInches}&quot;{' '}
                {placement.scaleCalibration.referenceFeatureName}
              </span>
            </span>
          )}
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
                  ? `Measure & Edit Lines (${savedLines.length})`
                  : 'Measure Logo & Draw Lines'}
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
                Upload a photo/mock-up (or drag &amp; drop here) to calibrate real-world garment scale and measure logos accurately.
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
            title="Click to measure logo or edit dimension reference lines"
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
                <span>Click to Measure &amp; Draw Lines</span>
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
                <span>Calibrate Scale &amp; Measure Logo</span>
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
                  Measure Logo &amp; Draw Lines
                </button>{' '}
                to set a real-world garment measurement (like garment height or pocket size) and automatically measure logos on the mock-up.
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

      {/* FULL-SCREEN INTERACTIVE DIMENSION DRAWING & SCALE CALIBRATION STUDIO MODAL */}
      {isStudioOpen && placement.referenceImageUrl && (
        <div
          className="fixed inset-0 z-[280] bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
          onClick={() => setIsStudioOpen(false)}
        >
          <div
            className="bg-white max-w-6xl w-full rounded-2xl shadow-2xl border border-neutral-200 overflow-hidden my-auto max-h-[94vh] flex flex-col animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Studio Header (Light Mode) */}
            <div className="px-5 py-3.5 bg-white border-b border-neutral-200 text-neutral-900 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-extrabold uppercase tracking-wider">
                    Placement #{placementIndex + 1} • {placement.location}
                  </span>
                  <h3 className="text-sm sm:text-base font-black text-neutral-900">
                    Draw Dimension Reference Lines &amp; Real-World Logo Ruler
                  </h3>
                  {draftScale && draftScale.realWorldInches > 0 && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-violet-100 text-violet-800 border border-violet-300 text-[10px] font-extrabold">
                      <Sparkles size={11} />
                      <span>
                        Scale Active: {draftScale.realWorldInches}&quot; {draftScale.referenceFeatureName}
                      </span>
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-neutral-500 mt-0.5">
                  Calibrate with any known garment distance (e.g. front height or pocket width) so dragging a line over any logo measures its exact real-world size in inches.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveStudio}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-xs transition-colors cursor-pointer"
                >
                  <Check size={14} strokeWidth={2.5} />
                  <span>Apply Reference Lines</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsStudioOpen(false)}
                  className="p-1.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-600 hover:text-neutral-900 transition-colors cursor-pointer"
                >
                  <X size={17} />
                </button>
              </div>
            </div>

            {/* Tool Selection Bar */}
            <div className="px-5 py-2.5 bg-neutral-50 border-b border-neutral-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setActiveTool('scale')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold border transition-all cursor-pointer ${
                    activeTool === 'scale'
                      ? 'bg-violet-600 text-white border-violet-700 shadow-xs scale-[1.02]'
                      : draftScale
                        ? 'bg-violet-50 hover:bg-violet-100 text-violet-800 border-violet-200'
                        : 'bg-white hover:bg-violet-50 text-violet-700 border-violet-300'
                  }`}
                  title="Draw a reference line across a known garment measurement (e.g. 28 in garment height or 5.5 in pocket) to calibrate real-world scale"
                >
                  <Ruler size={13} />
                  <span>
                    {draftScale
                      ? `Recalibrate Scale (${draftScale.realWorldInches}")`
                      : '1. Set Real-World Scale (Reference)'}
                  </span>
                </button>

                <span className="text-neutral-300 font-bold mx-0.5">|</span>

                <span className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-500 mr-0.5">
                  Measure / Draw:
                </span>
                {(['width', 'height', 'collar', 'custom'] as PlacementLineKind[]).map((kind) => {
                  const meta = LINE_KIND_META[kind];
                  const isActive = activeTool === kind;
                  return (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => setActiveTool(kind)}
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
                  <span>Lock Horizontal / Vertical (or Hold Shift)</span>
                </label>

                {(draftLines.length > 0 || draftScale) && (
                  <button
                    type="button"
                    onClick={() => {
                      setDraftLines([]);
                      setDraftScale(null);
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
                  className="relative w-full h-[56vh] min-h-[360px] max-h-[560px] bg-white rounded-xl border border-neutral-200 overflow-hidden cursor-crosshair flex items-center justify-center"
                >
                  <img
                    src={placement.referenceImageUrl}
                    alt={`${placement.location} Canvas`}
                    draggable={false}
                    onLoad={() => {
                      const aspect = getCurrentCanvasAspectRatio();
                      setCanvasAspectRatio(aspect);
                    }}
                    className="w-full h-full object-contain select-none pointer-events-none"
                  />

                  <PlacementReferenceOverlaySvg
                    lines={
                      drawingCurrent && activeTool !== 'scale'
                        ? [
                            ...draftLines,
                            {
                              id: '__drawing__',
                              kind: activeTool,
                              label: '',
                              x1: drawingCurrent.x1,
                              y1: drawingCurrent.y1,
                              x2: drawingCurrent.x2,
                              y2: drawingCurrent.y2,
                              color: LINE_KIND_META[activeTool].color
                            }
                          ]
                        : draftLines
                    }
                    scaleCalibration={
                      drawingCurrent && activeTool === 'scale'
                        ? {
                            x1: drawingCurrent.x1,
                            y1: drawingCurrent.y1,
                            x2: drawingCurrent.x2,
                            y2: drawingCurrent.y2,
                            realWorldInches: parseInchesValue(scaleInchesInput) || 28,
                            referenceFeatureName: scaleFeatureInput || 'Reference',
                            aspectRatio: canvasAspectRatio
                          }
                        : draftScale
                    }
                    showScaleLine
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

                  {/* Scale Calibration Badge on Canvas */}
                  {draftScale && !(drawingCurrent && activeTool === 'scale') && (
                    <div
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setSelectedLineId('__scale_calibration__');
                      }}
                      style={{
                        left: `${(draftScale.x1 + draftScale.x2) / 2}%`,
                        top: `${(draftScale.y1 + draftScale.y2) / 2}%`
                      }}
                      className={`absolute -translate-x-1/2 -translate-y-1/2 px-2 py-0.5 rounded-md text-[10px] font-extrabold border shadow-md whitespace-nowrap cursor-pointer bg-violet-600 text-white border-violet-700 ${
                        selectedLineId === '__scale_calibration__'
                          ? 'ring-2 ring-black scale-110'
                          : ''
                      }`}
                    >
                      📏 Ref: {draftScale.realWorldInches}&quot; ({draftScale.referenceFeatureName})
                    </div>
                  )}

                  {/* Live Floating Readout While Actively Dragging a New Line */}
                  {drawingCurrent && liveDrawingMeasurementLabel && (
                    <div
                      style={{
                        left: `${(drawingCurrent.x1 + drawingCurrent.x2) / 2}%`,
                        top: `${(drawingCurrent.y1 + drawingCurrent.y2) / 2}%`
                      }}
                      className="absolute -translate-x-1/2 -translate-y-1/2 px-2.5 py-1 rounded-lg text-xs font-black bg-neutral-900 text-white border border-white shadow-lg whitespace-nowrap pointer-events-none z-20"
                    >
                      {liveDrawingMeasurementLabel}
                    </div>
                  )}

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

                <p className="text-[11px] font-semibold text-neutral-500 mt-2 text-center">
                  {activeTool === 'scale' ? (
                    <>
                      <strong className="text-violet-700">Scale Calibration Mode:</strong> Click
                      &amp; drag across a known real-world garment distance (e.g. full front height
                      from shoulder seam to bottom hem, or across a pocket) to lock in the scale.
                    </>
                  ) : (
                    <>
                      Tip: Click &amp; drag in any direction to draw a{' '}
                      <strong className="text-neutral-800">
                        {LINE_KIND_META[activeTool].title}
                      </strong>
                      .{' '}
                      {draftScale
                        ? `Real-world scale (${draftScale.realWorldInches}" ${draftScale.referenceFeatureName}) will automatically calculate the exact logo inches as you drag!`
                        : LINE_KIND_META[activeTool].defaultHint}
                    </>
                  )}
                </p>
              </div>

              {/* Right 4 cols: Real-World Scale Calibration + Dimension Values + Drawn Lines List */}
              <div className="lg:col-span-4 flex flex-col justify-between gap-4">
                <div className="space-y-3.5">
                  {/* REAL-WORLD SCALE CALIBRATION PANEL */}
                  <div className="bg-violet-50/70 border border-violet-200 rounded-xl p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Ruler size={14} className="text-violet-700 shrink-0" />
                        <h4 className="text-xs font-extrabold uppercase tracking-wider text-violet-950">
                          Real-World Garment Scale
                        </h4>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveTool('scale')}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold border transition-colors cursor-pointer ${
                          activeTool === 'scale'
                            ? 'bg-violet-700 text-white border-violet-800'
                            : 'bg-white hover:bg-violet-600 text-violet-700 hover:text-white border-violet-300'
                        }`}
                      >
                        {draftScale ? 'Redraw Scale Line' : 'Draw Scale Line'}
                      </button>
                    </div>

                    <p className="text-[11px] text-violet-900/80 leading-snug">
                      Enter a known garment measurement (like front height or pocket width) and draw its line on the mock-up. Any line you drag over a logo will then measure accurately in real inches.
                    </p>

                    {/* Quick Preset Feature Pills */}
                    <div className="flex flex-wrap gap-1">
                      {SCALE_PRESET_FEATURES.map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => {
                            setScaleFeatureInput(preset.label);
                            setScaleInchesInput(preset.defaultInches);
                            const parsed = parseInchesValue(preset.defaultInches);
                            if (draftScale && parsed > 0) {
                              const nextScale: PlacementScaleCalibration = {
                                ...draftScale,
                                referenceFeatureName: preset.label,
                                realWorldInches: parsed
                              };
                              setDraftScale(nextScale);
                              recalculateAllLinesWithScale(nextScale, draftLines);
                            } else {
                              setActiveTool('scale');
                            }
                          }}
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition-colors cursor-pointer ${
                            scaleFeatureInput === preset.label
                              ? 'bg-violet-600 text-white border-violet-700'
                              : 'bg-white hover:bg-violet-100 text-violet-800 border-violet-200'
                          }`}
                        >
                          {preset.label} ({preset.defaultInches}&quot;)
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-12 gap-2 pt-0.5">
                      <div className="col-span-7">
                        <label className="block text-[10px] font-extrabold uppercase text-violet-800 mb-1">
                          Reference Feature
                        </label>
                        <input
                          type="text"
                          value={scaleFeatureInput}
                          onChange={(e) => {
                            const val = e.target.value;
                            setScaleFeatureInput(val);
                            if (draftScale) {
                              setDraftScale({ ...draftScale, referenceFeatureName: val });
                            }
                          }}
                          placeholder="e.g. Pocket Width / Garment Height"
                          className="w-full px-2.5 py-1.5 text-xs font-bold bg-white border border-violet-200 rounded-lg focus:outline-none focus:border-violet-600"
                        />
                      </div>
                      <div className="col-span-5">
                        <label className="block text-[10px] font-extrabold uppercase text-violet-800 mb-1">
                          Real Size (in)
                        </label>
                        <input
                          ref={scaleInchesInputRef}
                          type="text"
                          value={scaleInchesInput}
                          onChange={(e) => {
                            const val = e.target.value;
                            setScaleInchesInput(val);
                            const parsed = parseInchesValue(val);
                            if (draftScale && parsed > 0) {
                              const nextScale: PlacementScaleCalibration = {
                                ...draftScale,
                                realWorldInches: parsed,
                                referenceFeatureName: scaleFeatureInput.trim() || 'Reference'
                              };
                              setDraftScale(nextScale);
                              recalculateAllLinesWithScale(nextScale, draftLines);
                            }
                          }}
                          placeholder='e.g. 28 or 5.5'
                          className="w-full px-2.5 py-1.5 text-xs font-bold bg-white border border-violet-200 rounded-lg focus:outline-none focus:border-violet-600"
                        />
                      </div>
                    </div>

                    {draftScale ? (
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-violet-200/70 text-[11px]">
                        <span className="font-bold text-violet-900">
                          ✓ Calibrated to {draftScale.realWorldInches}&quot;{' '}
                          {draftScale.referenceFeatureName}
                        </span>
                        <div className="flex items-center gap-2">
                          {draftLines.length > 0 && (
                            <button
                              type="button"
                              onClick={() => recalculateAllLinesWithScale(draftScale, draftLines)}
                              className="text-[10px] font-extrabold text-violet-700 underline cursor-pointer"
                            >
                              Re-measure All
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setDraftScale(null)}
                            className="text-[10px] font-bold text-red-600 hover:underline cursor-pointer"
                          >
                            Remove Scale
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-[11px] font-bold text-violet-800 bg-white/80 border border-violet-200/80 rounded-lg px-2.5 py-1.5 flex items-center justify-between gap-2">
                        <span>No scale line drawn on garment yet.</span>
                        <button
                          type="button"
                          onClick={() => setActiveTool('scale')}
                          className="text-violet-700 underline font-extrabold cursor-pointer shrink-0"
                        >
                          Draw Now →
                        </button>
                      </div>
                    )}
                  </div>

                  {/* PLACEMENT DIMENSIONS (SYNCED WITH LINES) */}
                  <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3.5 space-y-2.5">
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-neutral-800">
                      Placement Dimensions (Synced with Lines)
                    </h4>

                    <div>
                      <label className="flex items-center justify-between text-[10px] font-extrabold uppercase text-blue-700 mb-1">
                        <span>Width (in)</span>
                        <button
                          type="button"
                          onClick={() => setActiveTool('width')}
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
                          onClick={() => setActiveTool('height')}
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
                          onClick={() => setActiveTool('collar')}
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

                    {activeTool === 'custom' && (
                      <div>
                        <label className="block text-[10px] font-extrabold uppercase text-rose-700 mb-1">
                          Default Label for Next Custom Line
                        </label>
                        <input
                          type="text"
                          value={customLabelDraft}
                          onChange={(e) => setCustomLabelDraft(e.target.value)}
                          placeholder='e.g. 2" above pocket seam (leave blank to auto-measure)'
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
                      <p className="text-xs text-neutral-400 italic py-1.5">
                        Click and drag on the image to draw your dimension reference lines.
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                        {draftLines.map((line) => {
                          const meta = LINE_KIND_META[line.kind] || LINE_KIND_META.custom;
                          const measuredVal = measureLineInRealInches(
                            line,
                            draftScale,
                            canvasAspectRatio
                          );
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
                              {measuredVal !== null && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const formatted = formatMeasuredInches(measuredVal, line.kind);
                                    if (line.kind === 'width') setDraftWidth(formatted);
                                    else if (line.kind === 'height') setDraftHeight(formatted);
                                    else if (line.kind === 'collar') setDraftCollar(formatted);
                                    setDraftLines((prev) =>
                                      prev.map((l) =>
                                        l.id === line.id ? { ...l, label: formatted } : l
                                      )
                                    );
                                  }}
                                  className="px-1.5 py-0.5 rounded bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200 text-[9px] font-extrabold shrink-0 cursor-pointer"
                                  title="Click to apply exact scale-measured inches"
                                >
                                  📏 {formatMeasuredInches(measuredVal)}
                                </button>
                              )}
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

                <div className="pt-2 border-t border-neutral-200 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsStudioOpen(false)}
                    className="px-4 py-2 rounded-xl border border-neutral-200 text-xs font-bold text-neutral-700 hover:bg-neutral-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveStudio}
                    className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-extrabold cursor-pointer"
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
