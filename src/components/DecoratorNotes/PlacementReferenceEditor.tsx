import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Edit3,
  Hand,
  Image as ImageIcon,
  Maximize2,
  Move,
  Plus,
  RotateCcw,
  Ruler,
  Sparkles,
  Trash2,
  Upload,
  X,
  ZoomIn,
  ZoomOut
} from 'lucide-react';

export type PlacementLineKind = 'width' | 'height' | 'collar' | 'custom';
export type StudioToolMode = PlacementLineKind | 'scale' | 'pan';
export type MeasurementUnit = 'in' | 'cm';
export const CM_PER_INCH = 2.54;

export interface PlacementReferenceLine {
  id: string;
  kind: PlacementLineKind;
  label: string;
  referencePoint?: string; // e.g., "Collar Seam", "Center Zipper", "Pocket Edge"
  x1: number; // 0..100 percentage of image width (Point A)
  y1: number; // 0..100 percentage of image height (Point A)
  x2: number; // 0..100 percentage of image width (Point B)
  y2: number; // 0..100 percentage of image height (Point B)
  color: string;
}

export interface PlacementScaleCalibration {
  x1: number; // 0..100 percentage of image width (Point A)
  y1: number; // 0..100 percentage of image height (Point A)
  x2: number; // 0..100 percentage of image width (Point B)
  y2: number; // 0..100 percentage of image height (Point B)
  realWorldInches: number; // e.g., 28 for 28" garment height, or 5.5 for 5.5" pocket
  referenceFeatureName: string; // e.g., "Front Garment Height", "Pocket Width", "Chest Width"
  aspectRatio?: number; // rendered width / height ratio at calibration time
}

export const GARMENT_REFERENCE_POINTS = [
  'Collar Seam',
  'Center Zipper / Placket',
  'Chest / Yoke Seam',
  'Pocket Seam / Edge',
  'Shoulder Seam',
  'Sleeve Cuff / Hem',
  'Armhole Seam',
  'Bottom Hem',
  'Center Line',
  'Hood Seam'
];

export const LINE_KIND_META: Record<
  PlacementLineKind,
  {
    title: string;
    categoryLabel: string;
    shortPrefix: string;
    color: string;
    badgeBg: string;
    badgeText: string;
    defaultHint: string;
  }
> = {
  width: {
    title: 'Logo Width (A ┄ B)',
    categoryLabel: 'Logo Size',
    shortPrefix: 'Logo W',
    color: '#2563eb',
    badgeBg: 'bg-blue-600 text-white border-blue-700',
    badgeText: 'text-blue-700 bg-blue-50 border-blue-200',
    defaultHint: 'Drag from Point A (left edge of logo) to Point B (right edge of logo)'
  },
  height: {
    title: 'Logo Height (A ┄ B)',
    categoryLabel: 'Logo Size',
    shortPrefix: 'Logo H',
    color: '#059669',
    badgeBg: 'bg-emerald-600 text-white border-emerald-700',
    badgeText: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    defaultHint: 'Drag from Point A (top edge of logo) to Point B (bottom edge of logo)'
  },
  collar: {
    title: 'Distance from Reference Point (A ┄ B)',
    categoryLabel: 'Reference Point Distance',
    shortPrefix: 'From Ref',
    color: '#d97706',
    badgeBg: 'bg-amber-500 text-white border-amber-600',
    badgeText: 'text-amber-800 bg-amber-50 border-amber-200',
    defaultHint: 'Drag from Point A (reference point on garment) to Point B (edge of logo)'
  },
  custom: {
    title: 'Extra Reference Distance (A ┄ B)',
    categoryLabel: 'Extra Reference Distance',
    shortPrefix: 'Ref #2',
    color: '#e11d48',
    badgeBg: 'bg-rose-600 text-white border-rose-700',
    badgeText: 'text-rose-700 bg-rose-50 border-rose-200',
    defaultHint: 'Drag from Point A (second reference point, e.g. zipper) to Point B (logo)'
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

export function formatMeasuredInches(inches: number, unit: MeasurementUnit = 'in'): string {
  if (unit === 'cm') {
    const cm = inches * CM_PER_INCH;
    const roundedCm = Math.round(cm * 10) / 10; // nearest 0.1 cm
    return Number.isInteger(roundedCm)
      ? `${roundedCm} cm`
      : `${Number(roundedCm.toFixed(1))} cm`;
  }
  const rounded2 = Math.round(inches * 20) / 20; // nearest 0.05"
  return Number.isInteger(rounded2)
    ? `${rounded2}"`
    : `${Number(rounded2.toFixed(2))}"`;
}

export function formatScaleValueForUnit(inches: number, unit: MeasurementUnit): string {
  if (!(inches > 0)) return '';
  if (unit === 'cm') {
    const cm = Math.round(inches * CM_PER_INCH * 10) / 10;
    return String(Number.isInteger(cm) ? cm : Number(cm.toFixed(1)));
  }
  const rounded = Math.round(inches * 20) / 20;
  return String(Number.isInteger(rounded) ? rounded : Number(rounded.toFixed(2)));
}

export function convertMeasurementText(
  raw: string | undefined,
  fromUnit: MeasurementUnit,
  toUnit: MeasurementUnit
): string {
  if (!raw || !raw.trim() || fromUnit === toUnit) return raw || '';
  const trimmed = raw.trim();
  const hasExplicitCm = /\bcm\b/i.test(trimmed);
  const hasExplicitIn = /["”″]|\bin(?:ch(?:es)?)?\b/i.test(trimmed);
  const sourceUnit: MeasurementUnit = hasExplicitCm
    ? 'cm'
    : hasExplicitIn
      ? 'in'
      : fromUnit;
  if (sourceUnit === toUnit) return trimmed;

  const parsed = parseInchesValue(trimmed);
  if (!(parsed > 0)) return trimmed;

  const valInInches = sourceUnit === 'cm' ? parsed / CM_PER_INCH : parsed;
  const formatted = formatMeasuredInches(valInInches, toUnit);
  const suffix = trimmed.replace(
    /^(\d+\s+\d+\/\d+|\d+(?:\.\d+)?)\s*(?:["”″']|in(?:ch(?:es)?)?|cm)?/i,
    ''
  );
  return `${formatted}${suffix}`;
}

export function resolveLineDisplayLabel(
  line: PlacementReferenceLine,
  placement: {
    widthInches?: string;
    heightInches?: string;
    distanceFromCollar?: string;
    referencePoint?: string;
  },
  mode: 'full' | 'compact' = 'full'
): string {
  const shortenRefName = (refName: string) => {
    const firstPart = refName.split('/')[0].trim();
    return firstPart.length > 14 ? `${firstPart.slice(0, 12)}…` : firstPart;
  };

  if (line.kind === 'width') {
    const val = (placement.widthInches || line.label || '').trim();
    if (mode === 'compact') return val ? `W: ${val}` : 'W';
    return val ? `Logo W: ${val}` : 'Logo Width';
  }
  if (line.kind === 'height') {
    const val = (placement.heightInches || line.label || '').trim();
    if (mode === 'compact') return val ? `H: ${val}` : 'H';
    return val ? `Logo H: ${val}` : 'Logo Height';
  }
  if (line.kind === 'collar') {
    const val = (placement.distanceFromCollar || line.label || '').trim();
    const refPt = (line.referencePoint || placement.referencePoint || 'Collar Seam').trim();
    if (mode === 'compact') {
      return val ? `${shortenRefName(refPt)}: ${val}` : shortenRefName(refPt);
    }
    return val ? `From ${refPt}: ${val}` : `From ${refPt}`;
  }
  const customRef = (line.referencePoint || '').trim();
  const customVal = (line.label || '').trim();
  if (mode === 'compact') {
    if (customRef && customVal) return `${shortenRefName(customRef)}: ${customVal}`;
    if (customRef) return shortenRefName(customRef);
    return customVal || 'Ref';
  }
  if (customRef && customVal) return `From ${customRef}: ${customVal}`;
  if (customRef) return `From ${customRef}`;
  return customVal || 'Ref Distance';
}

/**
 * Computes a screen-space pixel offset perpendicular to a line (x1,y1)->(x2,y2)
 * so callout badges float cleanly above/beside the dotted line and never cover
 * the line itself or its Point A / Point B drag handles.
 */
function getCalloutPerpendicularOffsetPx(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  offsetDistancePx = 22
): { xPx: number; yPx: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 0.001) {
    return { xPx: 0, yPx: -offsetDistancePx };
  }
  // Unit normal vector perpendicular to the line
  let nx = -dy / len;
  let ny = dx / len;
  // Prefer placing the badge ABOVE the line (negative Y in screen space)
  if (ny > 0.15 || (Math.abs(ny) <= 0.15 && nx < 0)) {
    nx = -nx;
    ny = -ny;
  }
  return {
    xPx: Math.round(nx * offsetDistancePx),
    yPx: Math.round(ny * offsetDistancePx)
  };
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
    referencePoint?: string;
    measurementUnit?: MeasurementUnit;
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
    referencePoint?: string;
    measurementUnit?: MeasurementUnit;
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
    referencePoint?: string;
  };
  zoom?: number;
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
  zoom = 1,
  selectedLineId,
  interactive = false,
  onSelectLine,
  onStartDragEndpoint
}) => {
  const safeZoom = Math.max(1, zoom);
  // Divide all SVG dimensions, strokes, and dash lengths by exact `safeZoom` so that when the
  // parent container applies CSS `scale(zoom)`, the dotted lines, ticks, and A/B markers stay
  // the exact same crisp thickness on screen at 100% and 600% zoom!
  const tickScale = 1.25 / safeZoom;
  const endpointRadius = (interactive ? 1.15 : 0.85) / safeZoom;
  const endpointFontSize = (interactive ? 1.15 : 0.85) / safeZoom;
  const endpointStrokeWidth = 0.28 / safeZoom;
  const tickHaloStrokeWidth = 3.2 / safeZoom;
  const tickColorStrokeWidth = 1.75 / safeZoom;
  const hitTargetStrokeWidth = 12 / safeZoom;

  const renderDottedPointAToPointBLine = (
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
    const px = (-dy / len) * tickScale;
    const py = (dx / len) * tickScale;
    const isSelected = selectedLineId === line.id;
    const haloStrokeWidth = (isSelected ? 4.2 : 3.4) / safeZoom;
    const mainStrokeWidth = (isSelected ? 2.4 : 1.85) / safeZoom;
    const dashPattern = isScaleLine
      ? `${3 / safeZoom} ${3 / safeZoom}`
      : `${5 / safeZoom} ${3.5 / safeZoom}`;

    return (
      <g key={line.id}>
        {/* High-contrast white outer halo so the dotted line is visible on both black and white garments */}
        <line
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          stroke="#ffffff"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          style={{ strokeWidth: haloStrokeWidth, opacity: 0.9 }}
        />
        {/* Crisp Dotted / Dashed Dimension Line from Point A to Point B (constant screen thickness at any zoom) */}
        <line
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          stroke={color}
          strokeLinecap="round"
          strokeDasharray={dashPattern}
          vectorEffect="non-scaling-stroke"
          style={{ strokeWidth: mainStrokeWidth }}
        />
        {/* Point A perpendicular architectural tick */}
        <line
          x1={line.x1 - px}
          y1={line.y1 - py}
          x2={line.x1 + px}
          y2={line.y1 + py}
          stroke="#ffffff"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          style={{ strokeWidth: tickHaloStrokeWidth }}
        />
        <line
          x1={line.x1 - px}
          y1={line.y1 - py}
          x2={line.x1 + px}
          y2={line.y1 + py}
          stroke={color}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          style={{ strokeWidth: tickColorStrokeWidth }}
        />
        {/* Point B perpendicular architectural tick */}
        <line
          x1={line.x2 - px}
          y1={line.y2 - py}
          x2={line.x2 + px}
          y2={line.y2 + py}
          stroke="#ffffff"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          style={{ strokeWidth: tickHaloStrokeWidth }}
        />
        <line
          x1={line.x2 - px}
          y1={line.y2 - py}
          x2={line.x2 + px}
          y2={line.y2 + py}
          stroke={color}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          style={{ strokeWidth: tickColorStrokeWidth }}
        />

        {interactive && (
          <line
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke="transparent"
            vectorEffect="non-scaling-stroke"
            style={{ strokeWidth: hitTargetStrokeWidth, pointerEvents: 'stroke', cursor: 'pointer' }}
            onMouseDown={(e) => {
              e.stopPropagation();
              onSelectLine?.(line.id);
            }}
          />
        )}

        {/* Point A & Point B Markers rendered on top of the line hit-target so they are always easy to grab & drag */}
        <g
          style={
            interactive
              ? { pointerEvents: 'all', cursor: 'grab' }
              : { pointerEvents: 'none' }
          }
          onMouseDown={
            interactive
              ? (e) => {
                  e.stopPropagation();
                  onSelectLine?.(line.id);
                  onStartDragEndpoint?.(line.id, 'start', e);
                }
              : undefined
          }
        >
          {interactive && (
            <circle
              cx={line.x1}
              cy={line.y1}
              r={endpointRadius * 1.9}
              fill="transparent"
            />
          )}
          <circle
            cx={line.x1}
            cy={line.y1}
            r={endpointRadius}
            fill={color}
            stroke="#ffffff"
            strokeWidth={endpointStrokeWidth}
          />
          <text
            x={line.x1}
            y={line.y1}
            textAnchor="middle"
            dominantBaseline="central"
            fill="#ffffff"
            fontSize={endpointFontSize}
            fontWeight="900"
            style={{ userSelect: 'none', pointerEvents: 'none' }}
          >
            A
          </text>
        </g>

        <g
          style={
            interactive
              ? { pointerEvents: 'all', cursor: 'grab' }
              : { pointerEvents: 'none' }
          }
          onMouseDown={
            interactive
              ? (e) => {
                  e.stopPropagation();
                  onSelectLine?.(line.id);
                  onStartDragEndpoint?.(line.id, 'end', e);
                }
              : undefined
          }
        >
          {interactive && (
            <circle
              cx={line.x2}
              cy={line.y2}
              r={endpointRadius * 1.9}
              fill="transparent"
            />
          )}
          <circle
            cx={line.x2}
            cy={line.y2}
            r={endpointRadius}
            fill={color}
            stroke="#ffffff"
            strokeWidth={endpointStrokeWidth}
          />
          <text
            x={line.x2}
            y={line.y2}
            textAnchor="middle"
            dominantBaseline="central"
            fill="#ffffff"
            fontSize={endpointFontSize}
            fontWeight="900"
            style={{ userSelect: 'none', pointerEvents: 'none' }}
          >
            B
          </text>
        </g>
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
        renderDottedPointAToPointBLine(
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

      {/* Placement Dimension Reference Lines (Dotted Point A to Point B) */}
      {lines.map((line) =>
        renderDottedPointAToPointBLine({
          id: line.id,
          x1: line.x1,
          y1: line.y1,
          x2: line.x2,
          y2: line.y2,
          color: line.color || LINE_KIND_META[line.kind]?.color || '#2563eb'
        })
      )}
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
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [viewerZoom, setViewerZoom] = useState(1);
  const [viewerPan, setViewerPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [viewerPanning, setViewerPanning] = useState<{
    startX: number;
    startY: number;
    originPanX: number;
    originPanY: number;
  } | null>(null);
  const [viewerLabelMode, setViewerLabelMode] = useState<'compact' | 'full' | 'hidden'>('full');
  const viewerViewportRef = useRef<HTMLDivElement | null>(null);

  const [activeTool, setActiveTool] = useState<StudioToolMode>('width');
  const [snapStraight, setSnapStraight] = useState(false);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [labelDisplayMode, setLabelDisplayMode] = useState<'compact' | 'full' | 'hidden'>('compact');

  // Collapsible Accordion Sections on the Right Sidebar (prevents visual overload & vertical overflow)
  const [openAccordion, setOpenAccordion] = useState<
    'logo_size' | 'reference_point' | 'scale' | 'lines'
  >('logo_size');

  // Draft state inside studio modal
  const [draftUnit, setDraftUnit] = useState<MeasurementUnit>(placement.measurementUnit || 'in');
  const [draftLines, setDraftLines] = useState<PlacementReferenceLine[]>([]);
  const [draftWidth, setDraftWidth] = useState('');
  const [draftHeight, setDraftHeight] = useState('');
  const [draftCollar, setDraftCollar] = useState('');
  const [draftReferencePoint, setDraftReferencePoint] = useState('Collar Seam');
  const [extraRefPointDraft, setExtraRefPointDraft] = useState('Center Zipper / Placket');
  const [extraDistanceDraft, setExtraDistanceDraft] = useState('');

  // Real-world scale calibration state inside studio modal
  const [draftScale, setDraftScale] = useState<PlacementScaleCalibration | null>(null);
  const [scaleFeatureInput, setScaleFeatureInput] = useState('Front Garment Height');
  const [scaleInchesInput, setScaleInchesInput] = useState('28');
  const [canvasAspectRatio, setCanvasAspectRatio] = useState(1.25);

  const handleSwitchStudioUnit = (nextUnit: MeasurementUnit) => {
    if (nextUnit === draftUnit) return;
    const prevUnit = draftUnit;

    // Convert the Real Size input value between in and cm
    if (draftScale && draftScale.realWorldInches > 0) {
      setScaleInchesInput(formatScaleValueForUnit(draftScale.realWorldInches, nextUnit));
    } else {
      const parsedRaw = parseInchesValue(scaleInchesInput);
      if (parsedRaw > 0) {
        const inches = prevUnit === 'cm' ? parsedRaw / CM_PER_INCH : parsedRaw;
        setScaleInchesInput(formatScaleValueForUnit(inches, nextUnit));
      }
    }

    // Convert Logo Width, Logo Height, Distance from Reference Point, Extra Distance, and all Drawn Line labels
    setDraftWidth((prev) => convertMeasurementText(prev, prevUnit, nextUnit));
    setDraftHeight((prev) => convertMeasurementText(prev, prevUnit, nextUnit));
    setDraftCollar((prev) => convertMeasurementText(prev, prevUnit, nextUnit));
    setExtraDistanceDraft((prev) => convertMeasurementText(prev, prevUnit, nextUnit));
    setDraftLines((prev) =>
      prev.map((l) => ({
        ...l,
        label: convertMeasurementText(l.label, prevUnit, nextUnit)
      }))
    );
    setDraftUnit(nextUnit);
  };

  // Zoom & Pan state for inspecting garment areas with crystal-clear Point A -> Point B lines
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [panningState, setPanningState] = useState<{
    startX: number;
    startY: number;
    originPanX: number;
    originPanY: number;
  } | null>(null);

  // Active mouse drawing / endpoint dragging state
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const innerStageRef = useRef<HTMLDivElement | null>(null);
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
    const el = innerStageRef.current || viewportRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 10 && rect.height > 10) {
        return rect.width / rect.height;
      }
    }
    return canvasAspectRatio || 1.25;
  };

  const clampPan = (nextPan: { x: number; y: number }, nextZoom: number) => {
    if (nextZoom <= 1.01) return { x: 0, y: 0 };
    const vp = viewportRef.current;
    if (!vp) return nextPan;
    const w = vp.clientWidth || 600;
    const h = vp.clientHeight || 450;
    const minX = w - w * nextZoom;
    const minY = h - h * nextZoom;
    return {
      x: Math.min(0, Math.max(minX, nextPan.x)),
      y: Math.min(0, Math.max(minY, nextPan.y))
    };
  };

  const resetZoomAndPan = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const adjustZoomByStep = (delta: number) => {
    const vp = viewportRef.current;
    const nextZoom = Math.min(6, Math.max(1, Number((zoom + delta).toFixed(2))));
    if (nextZoom === zoom) return;
    if (!vp || nextZoom <= 1.01) {
      setZoom(nextZoom);
      setPan({ x: 0, y: 0 });
      return;
    }
    const centerX = vp.clientWidth / 2;
    const centerY = vp.clientHeight / 2;
    const scaleFactor = nextZoom / zoom;
    const rawPan = {
      x: centerX - (centerX - pan.x) * scaleFactor,
      y: centerY - (centerY - pan.y) * scaleFactor
    };
    setZoom(nextZoom);
    setPan(clampPan(rawPan, nextZoom));
  };

  // Double-click on an area in Studio to zoom in toward that exact spot (or reset if deeply zoomed)
  const handleStudioDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const vp = viewportRef.current;
    if (!vp) return;
    const rect = vp.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const nextZoom = zoom < 2.4 ? 2.5 : zoom < 4.4 ? 4.5 : 1;
    if (nextZoom <= 1.01) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }
    const scaleRatio = nextZoom / zoom;
    const nextPan = {
      x: clickX - (clickX - pan.x) * scaleRatio,
      y: clickY - (clickY - pan.y) * scaleRatio
    };
    setZoom(nextZoom);
    setPan(clampPan(nextPan, nextZoom));
  };

  // Read-only Full-Size Garment Viewer helpers (zoom by double-click, scroll wheel, or trackpad pinch)
  const clampViewerPan = (nextPan: { x: number; y: number }, nextZoom: number) => {
    if (nextZoom <= 1.01) return { x: 0, y: 0 };
    const vp = viewerViewportRef.current;
    if (!vp) return nextPan;
    const w = vp.clientWidth || 800;
    const h = vp.clientHeight || 600;
    const minX = w - w * nextZoom;
    const minY = h - h * nextZoom;
    return {
      x: Math.min(0, Math.max(minX, nextPan.x)),
      y: Math.min(0, Math.max(minY, nextPan.y))
    };
  };

  const openViewer = () => {
    setViewerZoom(1);
    setViewerPan({ x: 0, y: 0 });
    setViewerPanning(null);
    setIsViewerOpen(true);
  };

  const adjustViewerZoomByStep = (delta: number) => {
    const vp = viewerViewportRef.current;
    const nextZoom = Math.min(6, Math.max(1, Number((viewerZoom + delta).toFixed(2))));
    if (nextZoom === viewerZoom) return;
    if (!vp || nextZoom <= 1.01) {
      setViewerZoom(1);
      setViewerPan({ x: 0, y: 0 });
      return;
    }
    const centerX = vp.clientWidth / 2;
    const centerY = vp.clientHeight / 2;
    const scaleFactor = nextZoom / viewerZoom;
    const rawPan = {
      x: centerX - (centerX - viewerPan.x) * scaleFactor,
      y: centerY - (centerY - viewerPan.y) * scaleFactor
    };
    setViewerZoom(nextZoom);
    setViewerPan(clampViewerPan(rawPan, nextZoom));
  };

  const handleViewerDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const vp = viewerViewportRef.current;
    if (!vp) return;
    const rect = vp.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const nextZoom = viewerZoom < 2.4 ? 2.5 : viewerZoom < 4.4 ? 4.5 : 1;
    if (nextZoom <= 1.01) {
      setViewerZoom(1);
      setViewerPan({ x: 0, y: 0 });
      return;
    }
    const scaleRatio = nextZoom / viewerZoom;
    const nextPan = {
      x: clickX - (clickX - viewerPan.x) * scaleRatio,
      y: clickY - (clickY - viewerPan.y) * scaleRatio
    };
    setViewerZoom(nextZoom);
    setViewerPan(clampViewerPan(nextPan, nextZoom));
  };

  useEffect(() => {
    if (!isViewerOpen) return;
    const vp = viewerViewportRef.current;
    if (!vp) return;

    const handleViewerWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = vp.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const sensitivity = e.ctrlKey ? 0.012 : 0.0022;
      const factor = Math.exp(-e.deltaY * sensitivity);
      const nextZoom = Math.min(6, Math.max(1, Number((viewerZoom * factor).toFixed(3))));
      if (Math.abs(nextZoom - viewerZoom) < 0.005) return;

      if (nextZoom <= 1.01) {
        setViewerZoom(1);
        setViewerPan({ x: 0, y: 0 });
        return;
      }

      const scaleRatio = nextZoom / viewerZoom;
      const nextPan = {
        x: mouseX - (mouseX - viewerPan.x) * scaleRatio,
        y: mouseY - (mouseY - viewerPan.y) * scaleRatio
      };
      setViewerZoom(nextZoom);
      setViewerPan(clampViewerPan(nextPan, nextZoom));
    };

    vp.addEventListener('wheel', handleViewerWheel, { passive: false });
    return () => vp.removeEventListener('wheel', handleViewerWheel);
  }, [isViewerOpen, viewerZoom, viewerPan]);

  // Native wheel listener for smooth mouse-wheel zoom & trackpad pinch-to-zoom toward cursor
  useEffect(() => {
    if (!isStudioOpen) return;
    const vp = viewportRef.current;
    if (!vp) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = vp.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Support both trackpad pinch (ctrlKey) and normal mouse wheel scrolling
      const sensitivity = e.ctrlKey ? 0.012 : 0.0022;
      const factor = Math.exp(-e.deltaY * sensitivity);
      const nextZoom = Math.min(6, Math.max(1, Number((zoom * factor).toFixed(3))));
      if (Math.abs(nextZoom - zoom) < 0.005) return;

      if (nextZoom <= 1.01) {
        setZoom(1);
        setPan({ x: 0, y: 0 });
        return;
      }

      const scaleRatio = nextZoom / zoom;
      const nextPan = {
        x: mouseX - (mouseX - pan.x) * scaleRatio,
        y: mouseY - (mouseY - pan.y) * scaleRatio
      };
      setZoom(nextZoom);
      setPan(clampPan(nextPan, nextZoom));
    };

    vp.addEventListener('wheel', handleWheel, { passive: false });
    return () => vp.removeEventListener('wheel', handleWheel);
  }, [isStudioOpen, zoom, pan]);

  // Allow holding Spacebar to pan when zoomed in
  useEffect(() => {
    if (!isStudioOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.code === 'Space' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA' &&
        document.activeElement?.tagName !== 'SELECT'
      ) {
        e.preventDefault();
        setIsSpacePressed(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [isStudioOpen]);

  const selectToolAndOpenAccordion = (tool: StudioToolMode) => {
    setActiveTool(tool);
    if (tool === 'width' || tool === 'height') {
      setOpenAccordion('logo_size');
    } else if (tool === 'collar' || tool === 'custom') {
      setOpenAccordion('reference_point');
    } else if (tool === 'scale') {
      setOpenAccordion('scale');
    }
  };

  const openStudio = () => {
    const existingCollarLine = savedLines.find((l) => l.kind === 'collar');
    const initialRefPoint =
      placement.referencePoint || existingCollarLine?.referencePoint || 'Collar Seam';
    const initialUnit: MeasurementUnit = placement.measurementUnit || 'in';

    setDraftUnit(initialUnit);
    setDraftLines(savedLines.map((l) => ({ ...l })));
    setDraftWidth(placement.widthInches || '');
    setDraftHeight(placement.heightInches || '');
    setDraftCollar(placement.distanceFromCollar || '');
    setDraftReferencePoint(initialRefPoint);
    resetZoomAndPan();

    if (placement.scaleCalibration && placement.scaleCalibration.realWorldInches > 0) {
      setDraftScale({ ...placement.scaleCalibration });
      setScaleFeatureInput(
        placement.scaleCalibration.referenceFeatureName || 'Front Garment Height'
      );
      setScaleInchesInput(
        formatScaleValueForUnit(placement.scaleCalibration.realWorldInches, initialUnit)
      );
    } else {
      setDraftScale(null);
      setScaleFeatureInput('Front Garment Height');
      setScaleInchesInput(formatScaleValueForUnit(28, initialUnit));
    }
    setSelectedLineId(savedLines[0]?.id || null);
    setActiveTool('width');
    setOpenAccordion('logo_size');
    setIsStudioOpen(true);
  };

  const recalculateAllLinesWithScale = (
    nextScale: PlacementScaleCalibration | null,
    linesToMeasure: PlacementReferenceLine[] = draftLines,
    unitOverride: MeasurementUnit = draftUnit
  ) => {
    if (!nextScale || !(nextScale.realWorldInches > 0)) return;
    const aspect = nextScale.aspectRatio || getCurrentCanvasAspectRatio();
    let updatedW = draftWidth;
    let updatedH = draftHeight;
    let updatedCollar = draftCollar;

    const updatedLines = linesToMeasure.map((line) => {
      const measured = measureLineInRealInches(line, nextScale, aspect);
      if (measured === null) return line;
      const formatted = formatMeasuredInches(measured, unitOverride);
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
    const el = innerStageRef.current || viewportRef.current;
    if (!el) return { x: 50, y: 50 };
    const rect = el.getBoundingClientRect();
    let x = ((clientX - rect.left) / Math.max(1, rect.width)) * 100;
    let y = ((clientY - rect.top) / Math.max(1, rect.height)) * 100;
    x = Math.max(0.5, Math.min(99.5, x));
    y = Math.max(0.5, Math.min(99.5, y));

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
    if (draggingEndpoint) return;

    // Middle click, or Pan tool, or Spacebar held -> Pan the zoomed garment canvas
    if (e.button === 1 || activeTool === 'pan' || isSpacePressed) {
      e.preventDefault();
      setPanningState({
        startX: e.clientX,
        startY: e.clientY,
        originPanX: pan.x,
        originPanY: pan.y
      });
      return;
    }

    if (e.button !== 0) return;
    const aspect = getCurrentCanvasAspectRatio();
    setCanvasAspectRatio(aspect);
    const pt = getRelativeCoords(e.clientX, e.clientY);
    setDrawingCurrent({ x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y });
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (panningState) {
      const dx = e.clientX - panningState.startX;
      const dy = e.clientY - panningState.startY;
      setPan(
        clampPan(
          {
            x: panningState.originPanX + dx,
            y: panningState.originPanY + dy
          },
          zoom
        )
      );
      return;
    }

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

      const measuredInches = measureLineInRealInches(nextCoords, draftScale, aspect);
      const measuredFormatted =
        measuredInches !== null ? formatMeasuredInches(measuredInches, draftUnit) : null;

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
    if (panningState) {
      setPanningState(null);
      return;
    }
    if (draggingEndpoint) {
      setDraggingEndpoint(null);
      return;
    }
    if (!drawingCurrent) return;
    const dist = Math.hypot(
      drawingCurrent.x2 - drawingCurrent.x1,
      drawingCurrent.y2 - drawingCurrent.y1
    );
    // When zoomed in, allow smaller percentage lines (e.g., tiny sleeve/neck logos)
    const minThreshold = Math.max(0.4, 1.8 / zoom);
    if (dist < minThreshold) {
      setDrawingCurrent(null);
      return;
    }

    const aspect = getCurrentCanvasAspectRatio();

    // Handle drawing the Real-World Scale Calibration Line
    if (activeTool === 'scale') {
      const rawVal = parseInchesValue(scaleInchesInput);
      const parsedInches =
        rawVal > 0 ? (draftUnit === 'cm' ? rawVal / CM_PER_INCH : rawVal) : 28;
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
      recalculateAllLinesWithScale(nextScale, draftLines, draftUnit);
      setActiveTool('width');
      setOpenAccordion('logo_size');
      setTimeout(() => {
        scaleInchesInputRef.current?.focus();
        scaleInchesInputRef.current?.select();
      }, 60);
      return;
    }

    if (activeTool === 'pan') {
      setDrawingCurrent(null);
      return;
    }

    const activeKind: PlacementLineKind = activeTool;
    const meta = LINE_KIND_META[activeKind];

    const measuredInches = measureLineInRealInches(drawingCurrent, draftScale, aspect);
    const measuredFormatted =
      measuredInches !== null ? formatMeasuredInches(measuredInches, draftUnit) : null;

    let resolvedLabel = '';
    if (measuredFormatted !== null) {
      resolvedLabel = measuredFormatted;
      if (activeKind === 'width') setDraftWidth(measuredFormatted);
      else if (activeKind === 'height') setDraftHeight(measuredFormatted);
      else if (activeKind === 'collar') setDraftCollar(measuredFormatted);
    } else {
      const defLogo = draftUnit === 'cm' ? '9 cm' : '3.5"';
      const defCollar = draftUnit === 'cm' ? '7.5 cm' : '3"';
      const defExtra = draftUnit === 'cm' ? '6.5 cm' : '2.5"';
      resolvedLabel =
        activeKind === 'width'
          ? draftWidth || defLogo
          : activeKind === 'height'
            ? draftHeight || defLogo
            : activeKind === 'collar'
              ? draftCollar || defCollar
              : extraDistanceDraft.trim() || defExtra;
    }

    const resolvedReferencePoint =
      activeKind === 'collar'
        ? draftReferencePoint.trim() || 'Collar Seam'
        : activeKind === 'custom'
          ? extraRefPointDraft.trim() || 'Center Zipper / Placket'
          : undefined;

    const newLine: PlacementReferenceLine = {
      id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      kind: activeKind,
      label: resolvedLabel,
      ...(resolvedReferencePoint ? { referencePoint: resolvedReferencePoint } : {}),
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

    // Smooth guided progression: Logo Width -> Logo Height -> Distance from Reference Point
    if (activeKind === 'width') {
      setActiveTool('height');
      setOpenAccordion('logo_size');
    } else if (activeKind === 'height') {
      setActiveTool('collar');
      setOpenAccordion('reference_point');
    }
  };

  const handleSaveStudio = () => {
    onUpdatePlacementAndLines({
      widthInches: draftWidth,
      heightInches: draftHeight,
      distanceFromCollar: draftCollar,
      referencePoint: draftReferencePoint.trim() || 'Collar Seam',
      measurementUnit: draftUnit,
      referenceLines: draftLines,
      scaleCalibration: draftScale
    });
    setIsStudioOpen(false);
  };

  // Live measurement preview while the user is actively dragging a line from Point A to Point B
  const liveDrawingMeasurementLabel = (() => {
    if (!drawingCurrent || activeTool === 'pan') return null;
    if (activeTool === 'scale') {
      const rawVal = parseInchesValue(scaleInchesInput);
      const inches =
        rawVal > 0 ? (draftUnit === 'cm' ? rawVal / CM_PER_INCH : rawVal) : 28;
      return `📏 Scale A → B: ${formatMeasuredInches(inches, draftUnit)} (${scaleFeatureInput || 'Reference'})`;
    }
    const measured = measureLineInRealInches(
      drawingCurrent,
      draftScale,
      getCurrentCanvasAspectRatio()
    );
    if (activeTool === 'collar') {
      const refName = draftReferencePoint.trim() || 'Collar Seam';
      return measured !== null
        ? `A → B (From ${refName}): ${formatMeasuredInches(measured, draftUnit)}`
        : `A → B (From ${refName})`;
    }
    if (activeTool === 'custom') {
      const refName = extraRefPointDraft.trim() || 'Reference';
      return measured !== null
        ? `A → B (From ${refName}): ${formatMeasuredInches(measured, draftUnit)}`
        : `A → B (From ${refName})`;
    }
    if (measured === null) {
      return `A → B (${LINE_KIND_META[activeTool].shortPrefix})`;
    }
    const prefix = LINE_KIND_META[activeTool].shortPrefix;
    return `A → B (${prefix}): ${formatMeasuredInches(measured, draftUnit)}`;
  })();

  const isPanCursor = activeTool === 'pan' || isSpacePressed || Boolean(panningState);

  return (
    <div className="pt-2.5 border-t border-neutral-200/80">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Ruler size={12} className="text-indigo-600" />
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-700">
            Visual Garment Ruler &amp; Point A ┄ Point B Lines ({savedLines.length})
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
                  ? `Zoom & Edit Lines (${savedLines.length})`
                  : 'Open Garment Ruler & Draw Lines'}
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
                Select or upload a garment image for Placement #{placementIndex + 1} ({placement.location})
              </p>
              <p className="text-[10px] text-neutral-500">
                Zoom in on logos, measure Logo Width &amp; Height, and draw dotted lines from any Garment Reference Point (A ┄ B).
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
              <span className="text-[10px] font-bold text-neutral-400 mr-0.5">Use Mock-up:</span>
              {quickSources.map((src, sIdx) => (
                <button
                  key={`${src.label}-${sIdx}`}
                  type="button"
                  onClick={() => onSelectImageUrl(src.url, src.label)}
                  className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white border border-indigo-200 text-[10px] font-bold transition-colors cursor-pointer"
                >
                  {src.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white border border-neutral-200 rounded-xl p-3 flex flex-col sm:flex-row items-center gap-4">
          {/* Interactive Thumbnail: Click to open Full-Size Read-Only Viewer with Zoom & Measurement Lines */}
          <div
            onClick={openViewer}
            className="relative w-full sm:w-56 h-44 rounded-lg border border-neutral-200 bg-neutral-100/70 flex items-center justify-center overflow-hidden cursor-pointer group/canvas shrink-0"
            title="Click to view full-size garment & zoom in on measurement lines"
          >
            <img
              src={placement.referenceImageUrl}
              alt={`${placement.location} Reference`}
              className="w-full h-full object-contain select-none pointer-events-none"
            />
            <PlacementReferenceOverlaySvg lines={savedLines} placement={placement} />

            {/* Midpoint Callout Pills (Offset off the line so Point A -> Point B stays visible) */}
            {savedLines.map((line) => {
              const midX = (line.x1 + line.x2) / 2;
              const midY = (line.y1 + line.y2) / 2;
              const meta = LINE_KIND_META[line.kind] || LINE_KIND_META.custom;
              const text = resolveLineDisplayLabel(line, placement, 'compact');
              const offset = getCalloutPerpendicularOffsetPx(
                line.x1,
                line.y1,
                line.x2,
                line.y2,
                14
              );
              return (
                <div
                  key={`${line.id}-pill`}
                  style={{
                    left: `${midX}%`,
                    top: `${midY}%`,
                    transform: `translate(-50%, -50%) translate(${offset.xPx}px, ${offset.yPx}px)`
                  }}
                  className={`absolute px-1.5 py-0.5 rounded text-[9px] font-extrabold border shadow-xs whitespace-nowrap pointer-events-none ${meta.badgeBg}`}
                >
                  {text}
                </div>
              );
            })}

            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/40 to-transparent px-2.5 py-1.5 flex items-center justify-between text-white opacity-95 group-hover/canvas:opacity-100 transition-opacity">
              <span className="text-[10px] font-bold flex items-center gap-1">
                <ZoomIn size={11} />
                <span>Click to View Full Size (A ┄ B)</span>
              </span>
              <Maximize2 size={11} />
            </div>
          </div>

          {/* Right side: Clear breakdown of Logo Size vs Reference Point Distances */}
          <div className="flex-1 min-w-0 w-full space-y-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs font-extrabold text-neutral-900">
                {placement.location} — Visual Dimension Summary
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={openViewer}
                  className="text-[11px] font-extrabold text-neutral-700 hover:text-neutral-900 hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <Maximize2 size={11} />
                  <span>View Full Size</span>
                </button>
                <button
                  type="button"
                  onClick={openStudio}
                  className="text-[11px] font-extrabold text-indigo-600 hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <Edit3 size={11} />
                  <span>Edit Lines in Studio</span>
                </button>
              </div>
            </div>

            {savedLines.length === 0 ? (
              <p className="text-xs text-neutral-500">
                No visual lines drawn yet. Click{' '}
                <button
                  type="button"
                  onClick={openStudio}
                  className="font-bold text-indigo-600 underline cursor-pointer"
                >
                  Open Garment Ruler &amp; Draw Lines
                </button>{' '}
                to zoom in on the garment and draw dotted lines from Point A to Point B for Logo Size and Reference Point Distance.
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
                      <span className="text-[9px] opacity-65 font-extrabold">(A┄B)</span>
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* FULL-SIZE READ-ONLY GARMENT & MEASUREMENT VIEWER MODAL (Opens when clicking the thumbnail) */}
      {isViewerOpen && placement.referenceImageUrl && (
        <div
          className="fixed inset-0 z-[290] bg-black/85 backdrop-blur-xs flex items-center justify-center p-2 sm:p-5 overflow-y-auto"
          onClick={() => setIsViewerOpen(false)}
        >
          <div
            className="bg-white max-w-5xl w-full rounded-2xl shadow-2xl border border-neutral-200 overflow-hidden my-auto max-h-[95vh] flex flex-col animate-in fade-in zoom-in-95 duration-150 select-none"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Read-Only Viewer Header */}
            <div className="px-5 py-3 bg-white border-b border-neutral-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-md bg-neutral-900 text-white text-[10px] font-extrabold uppercase tracking-wider">
                    Placement #{placementIndex + 1} • {placement.location}
                  </span>
                  <h3 className="text-sm sm:text-base font-black text-neutral-900">
                    Full-Size Garment &amp; Measurement View (Read-Only)
                  </h3>
                  {(placement.widthInches || placement.heightInches) && (
                    <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200 text-[10px] font-extrabold">
                      Logo: {placement.widthInches || '?'} × {placement.heightInches || '?'}
                    </span>
                  )}
                  {placement.distanceFromCollar && (
                    <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-900 border border-amber-200 text-[10px] font-extrabold">
                      From {placement.referencePoint || 'Collar Seam'}: {placement.distanceFromCollar}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-neutral-500 mt-0.5">
                  <strong>Double-click</strong> any area on the garment, <strong>scroll</strong> with your mouse wheel, or{' '}
                  <strong>pinch</strong> on your trackpad to zoom in. Click &amp; drag to pan around.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Label Visibility Toggle */}
                <div className="inline-flex items-center gap-0.5 bg-neutral-100 border border-neutral-200 rounded-xl p-1">
                  <span className="text-[9px] font-extrabold uppercase text-neutral-500 px-1.5">
                    Labels:
                  </span>
                  {(
                    [
                      { id: 'full', label: 'Full' },
                      { id: 'compact', label: 'Short' },
                      { id: 'hidden', label: 'Hide' }
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setViewerLabelMode(opt.id)}
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-extrabold transition-colors cursor-pointer ${
                        viewerLabelMode === opt.id
                          ? 'bg-neutral-900 text-white'
                          : 'text-neutral-600 hover:bg-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {/* Zoom Controls */}
                <div className="inline-flex items-center gap-1 bg-neutral-100 border border-neutral-200 rounded-xl p-1">
                  <button
                    type="button"
                    onClick={() => adjustViewerZoomByStep(-0.5)}
                    disabled={viewerZoom <= 1.01}
                    className="p-1 rounded-lg hover:bg-white text-neutral-700 disabled:opacity-35 cursor-pointer"
                    title="Zoom Out"
                  >
                    <ZoomOut size={13} />
                  </button>
                  <span className="px-2 text-[11px] font-black tabular-nums text-neutral-800">
                    {Math.round(viewerZoom * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => adjustViewerZoomByStep(0.5)}
                    disabled={viewerZoom >= 5.95}
                    className="p-1 rounded-lg hover:bg-white text-neutral-700 disabled:opacity-35 cursor-pointer"
                  >
                    <ZoomIn size={13} />
                  </button>
                  {viewerZoom > 1.02 && (
                    <button
                      type="button"
                      onClick={() => {
                        setViewerZoom(1);
                        setViewerPan({ x: 0, y: 0 });
                      }}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white hover:bg-neutral-200 text-[10px] font-extrabold text-neutral-700 cursor-pointer ml-0.5"
                    >
                      <RotateCcw size={10} />
                      <span>Reset</span>
                    </button>
                  )}
                </div>

                {/* Optional Jump to Edit Studio */}
                <button
                  type="button"
                  onClick={() => {
                    setIsViewerOpen(false);
                    openStudio();
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-extrabold transition-colors cursor-pointer"
                >
                  <Edit3 size={12} />
                  <span>Edit Lines</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsViewerOpen(false)}
                  className="p-1.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-600 hover:text-neutral-900 transition-colors cursor-pointer"
                >
                  <X size={17} />
                </button>
              </div>
            </div>

            {/* Read-Only Full-Size Zoomable & Pannable Viewport */}
            <div className="p-3 sm:p-4 bg-neutral-100 flex-1 min-h-0 flex flex-col justify-between">
              <div
                ref={viewerViewportRef}
                onDoubleClick={handleViewerDoubleClick}
                onMouseDown={(e) => {
                  if (e.button !== 0) return;
                  e.preventDefault();
                  setViewerPanning({
                    startX: e.clientX,
                    startY: e.clientY,
                    originPanX: viewerPan.x,
                    originPanY: viewerPan.y
                  });
                }}
                onMouseMove={(e) => {
                  if (!viewerPanning) return;
                  const dx = e.clientX - viewerPanning.startX;
                  const dy = e.clientY - viewerPanning.startY;
                  setViewerPan(
                    clampViewerPan(
                      {
                        x: viewerPanning.originPanX + dx,
                        y: viewerPanning.originPanY + dy
                      },
                      viewerZoom
                    )
                  );
                }}
                onMouseUp={() => setViewerPanning(null)}
                onMouseLeave={() => setViewerPanning(null)}
                className={`relative w-full h-[70vh] min-h-[420px] max-h-[720px] bg-white rounded-xl border border-neutral-200 overflow-hidden ${
                  viewerPanning
                    ? 'cursor-grabbing'
                    : viewerZoom > 1.02
                      ? 'cursor-grab'
                      : 'cursor-zoom-in'
                }`}
              >
                <div
                  style={{
                    transform: `translate(${viewerPan.x}px, ${viewerPan.y}px) scale(${viewerZoom})`,
                    transformOrigin: '0 0'
                  }}
                  className="relative w-full h-full flex items-center justify-center"
                >
                  <img
                    src={placement.referenceImageUrl}
                    alt={`${placement.location} Full Size`}
                    draggable={false}
                    className="w-full h-full object-contain select-none pointer-events-none"
                  />

                  <PlacementReferenceOverlaySvg
                    lines={savedLines}
                    scaleCalibration={placement.scaleCalibration}
                    showScaleLine={false}
                    zoom={viewerZoom}
                    placement={placement}
                    interactive={false}
                  />

                  {/* Read-Only Callout Badges (Offset perpendicular to lines & inversely scaled by 1/viewerZoom) */}
                  {viewerLabelMode !== 'hidden' &&
                    savedLines.map((line) => {
                      const midX = (line.x1 + line.x2) / 2;
                      const midY = (line.y1 + line.y2) / 2;
                      const meta = LINE_KIND_META[line.kind] || LINE_KIND_META.custom;
                      const text = resolveLineDisplayLabel(line, placement, viewerLabelMode);
                      const offset = getCalloutPerpendicularOffsetPx(
                        line.x1,
                        line.y1,
                        line.x2,
                        line.y2,
                        24
                      );
                      return (
                        <div
                          key={`${line.id}-viewer-pill`}
                          style={{
                            left: `${midX}%`,
                            top: `${midY}%`,
                            transform: `translate(-50%, -50%) scale(${1 / viewerZoom}) translate(${offset.xPx}px, ${offset.yPx}px)`
                          }}
                          className={`absolute px-2 py-0.5 rounded-md text-[10px] font-extrabold border shadow-md whitespace-nowrap pointer-events-none ${meta.badgeBg}`}
                        >
                          {text}
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Bottom Summary Strip of All Drawn Measurement Lines */}
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 px-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  {savedLines.length === 0 ? (
                    <span className="text-xs text-neutral-500">
                      No measurement lines drawn on this placement yet.
                    </span>
                  ) : (
                    savedLines.map((line) => {
                      const meta = LINE_KIND_META[line.kind] || LINE_KIND_META.custom;
                      return (
                        <span
                          key={`${line.id}-viewer-summary`}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[11px] font-bold border ${meta.badgeText}`}
                        >
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: line.color || meta.color }}
                          />
                          <span>{resolveLineDisplayLabel(line, placement, 'full')}</span>
                          <span className="text-[9px] opacity-65 font-extrabold">(A┄B)</span>
                        </span>
                      );
                    })
                  )}
                </div>
                <span className="text-[10px] font-bold text-neutral-500">
                  💡 Double-click any spot to zoom in • Scroll or Pinch to zoom • Drag to pan
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FULL-SCREEN INTERACTIVE ZOOMABLE DIMENSION & REFERENCE POINT STUDIO MODAL */}
      {isStudioOpen && placement.referenceImageUrl && (
        <div
          className="fixed inset-0 z-[280] bg-black/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-5 overflow-y-auto"
          onClick={() => setIsStudioOpen(false)}
        >
          <div
            className="bg-white max-w-6xl w-full rounded-2xl shadow-2xl border border-neutral-200 overflow-hidden my-auto max-h-[95vh] flex flex-col animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Studio Header */}
            <div className="px-5 py-3 bg-white border-b border-neutral-200 text-neutral-900 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-extrabold uppercase tracking-wider">
                    Placement #{placementIndex + 1} • {placement.location}
                  </span>
                  <h3 className="text-sm sm:text-base font-black text-neutral-900">
                    Garment Zoom &amp; Measurement Studio (Logo Size + Reference Point Distance)
                  </h3>
                  {draftScale && draftScale.realWorldInches > 0 && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-violet-100 text-violet-800 border border-violet-300 text-[10px] font-extrabold">
                      <Sparkles size={11} />
                      <span>
                        Scale Active: {formatMeasuredInches(draftScale.realWorldInches, draftUnit)}{' '}
                        {draftScale.referenceFeatureName}
                      </span>
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-neutral-500 mt-0.5">
                  Scroll or pinch on the garment to zoom in. Drag from <strong>Point A</strong> to{' '}
                  <strong>Point B</strong> to measure <strong>1. Logo Size</strong> or{' '}
                  <strong>2. Distance from a Reference Point</strong>.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Global IN / CM Toggle in Studio Header */}
                <div className="inline-flex items-center gap-1 bg-neutral-100 p-1 rounded-xl border border-neutral-200">
                  <span className="text-[10px] font-extrabold uppercase text-neutral-500 px-1.5">
                    Units:
                  </span>
                  {(['in', 'cm'] as MeasurementUnit[]).map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => handleSwitchStudioUnit(u)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-black uppercase transition-all cursor-pointer ${
                        draftUnit === u
                          ? 'bg-neutral-900 text-white shadow-2xs'
                          : 'text-neutral-600 hover:text-neutral-900 hover:bg-white/60'
                      }`}
                    >
                      {u}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleSaveStudio}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-xs transition-colors cursor-pointer"
                >
                  <Check size={14} strokeWidth={2.5} />
                  <span>Save Measurements &amp; Lines</span>
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

            {/* Clarified Tool Selection Bar: Clearly grouped into (1) Logo Size, (2) Reference Point Distance, and (3) Garment Scale */}
            <div className="px-5 py-2.5 bg-neutral-50 border-b border-neutral-200 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
              <div className="flex flex-wrap items-center gap-1.5">
                {/* Group 1: Logo Size */}
                <div className="inline-flex items-center gap-1 bg-white px-2 py-1 rounded-xl border border-neutral-200 shadow-2xs">
                  <span className="text-[9px] font-black uppercase tracking-wider text-blue-700 px-1">
                    1. Logo Size:
                  </span>
                  {(['width', 'height'] as PlacementLineKind[]).map((kind) => {
                    const meta = LINE_KIND_META[kind];
                    const isActive = activeTool === kind;
                    return (
                      <button
                        key={kind}
                        type="button"
                        onClick={() => selectToolAndOpenAccordion(kind)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-extrabold border transition-all cursor-pointer ${
                          isActive
                            ? `${meta.badgeBg} shadow-xs`
                            : 'bg-neutral-50 hover:bg-neutral-100 text-neutral-700 border-neutral-200'
                        }`}
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0 border border-white/60"
                          style={{ backgroundColor: meta.color }}
                        />
                        <span>{kind === 'width' ? 'Logo Width' : 'Logo Height'}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Group 2: Distance from Garment Reference Point */}
                <div className="inline-flex items-center gap-1 bg-white px-2 py-1 rounded-xl border border-neutral-200 shadow-2xs">
                  <span className="text-[9px] font-black uppercase tracking-wider text-amber-700 px-1">
                    2. Placement Distance:
                  </span>
                  <button
                    type="button"
                    onClick={() => selectToolAndOpenAccordion('collar')}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-extrabold border transition-all cursor-pointer ${
                      activeTool === 'collar'
                        ? `${LINE_KIND_META.collar.badgeBg} shadow-xs`
                        : 'bg-neutral-50 hover:bg-neutral-100 text-neutral-700 border-neutral-200'
                    }`}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0 border border-white/60"
                      style={{ backgroundColor: LINE_KIND_META.collar.color }}
                    />
                    <span>From {draftReferencePoint || 'Reference Point'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => selectToolAndOpenAccordion('custom')}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-extrabold border transition-all cursor-pointer ${
                      activeTool === 'custom'
                        ? `${LINE_KIND_META.custom.badgeBg} shadow-xs`
                        : 'bg-neutral-50 hover:bg-neutral-100 text-neutral-700 border-neutral-200'
                    }`}
                    title="Draw an additional distance line from a second reference point (e.g. Center Zipper or Pocket Seam)"
                  >
                    <Plus size={11} />
                    <span>2nd Ref Point</span>
                  </button>
                </div>

                {/* Group 3: Optional Real-World Scale Calibration */}
                <button
                  type="button"
                  onClick={() => selectToolAndOpenAccordion('scale')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-extrabold border transition-all cursor-pointer ${
                    activeTool === 'scale'
                      ? 'bg-violet-600 text-white border-violet-700 shadow-xs'
                      : draftScale
                        ? 'bg-violet-50 hover:bg-violet-100 text-violet-800 border-violet-200'
                        : 'bg-white hover:bg-violet-50 text-violet-700 border-violet-300'
                  }`}
                >
                  <Ruler size={12} />
                  <span>
                    {draftScale
                      ? `Scale (${formatMeasuredInches(draftScale.realWorldInches, draftUnit)})`
                      : 'Calibrate Garment Scale'}
                  </span>
                </button>
              </div>

              <div className="flex items-center gap-3">
                <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-neutral-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={snapStraight}
                    onChange={(e) => setSnapStraight(e.target.checked)}
                    className="w-3.5 h-3.5 rounded accent-neutral-900 cursor-pointer"
                  />
                  <span>Snap Straight (or Hold Shift)</span>
                </label>

                {(draftLines.length > 0 || draftScale) && (
                  <button
                    type="button"
                    onClick={() => {
                      setDraftLines([]);
                      setDraftScale(null);
                      setSelectedLineId(null);
                    }}
                    className="text-[11px] font-bold text-red-600 hover:underline cursor-pointer"
                  >
                    Clear Lines
                  </button>
                )}
              </div>
            </div>

            {/* Studio Main Body: Zoomable Garment Canvas (Left 7 cols) + Collapsible Dropdowns Sidebar (Right 5 cols) */}
            <div className="p-4 sm:p-5 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 min-h-0">
              {/* Left 7 cols: Interactive Zoomable & Pannable Garment Canvas */}
              <div className="lg:col-span-7 flex flex-col justify-between bg-neutral-100 border border-neutral-200 rounded-2xl p-3 select-none">
                {/* Floating Zoom & Pan Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2 px-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <div className="inline-flex items-center gap-1 bg-white border border-neutral-200 rounded-xl p-1 shadow-2xs">
                      <button
                        type="button"
                        onClick={() => {
                          if (activeTool === 'pan') setActiveTool('width');
                        }}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition-colors cursor-pointer ${
                          activeTool !== 'pan'
                            ? 'bg-neutral-900 text-white'
                            : 'text-neutral-600 hover:bg-neutral-100'
                        }`}
                      >
                        <Crosshair size={12} />
                        <span>Draw A ┄ B</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTool('pan')}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition-colors cursor-pointer ${
                          activeTool === 'pan'
                            ? 'bg-neutral-900 text-white'
                            : 'text-neutral-600 hover:bg-neutral-100'
                        }`}
                        title="Pan / move around when zoomed in (or hold Spacebar + drag)"
                      >
                        <Hand size={12} />
                        <span>Pan / Move</span>
                      </button>
                    </div>

                    {/* Label Visibility Toggle so text never gets in the way of short lines */}
                    <div
                      className="inline-flex items-center gap-0.5 bg-white border border-neutral-200 rounded-xl p-1 shadow-2xs"
                      title="Control how measurement text labels appear on the garment canvas"
                    >
                      <span className="text-[9px] font-extrabold uppercase text-neutral-400 px-1.5">
                        Labels:
                      </span>
                      {(
                        [
                          { id: 'compact', label: 'Short' },
                          { id: 'full', label: 'Full' },
                          { id: 'hidden', label: 'Hide' }
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setLabelDisplayMode(opt.id)}
                          className={`px-2 py-0.5 rounded-lg text-[10px] font-extrabold transition-colors cursor-pointer ${
                            labelDisplayMode === opt.id
                              ? 'bg-neutral-900 text-white'
                              : 'text-neutral-600 hover:bg-neutral-100'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="inline-flex items-center gap-1 bg-white border border-neutral-200 rounded-xl p-1 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => adjustZoomByStep(-0.5)}
                      disabled={zoom <= 1.01}
                      className="p-1 rounded-lg hover:bg-neutral-100 text-neutral-700 disabled:opacity-35 cursor-pointer"
                      title="Zoom Out"
                    >
                      <ZoomOut size={13} />
                    </button>
                    <span className="px-2 text-[11px] font-black tabular-nums text-neutral-800">
                      {Math.round(zoom * 100)}%
                    </span>
                    <button
                      type="button"
                      onClick={() => adjustZoomByStep(0.5)}
                      disabled={zoom >= 5.95}
                      className="p-1 rounded-lg hover:bg-neutral-100 text-neutral-700 disabled:opacity-35 cursor-pointer"
                      title="Zoom In"
                    >
                      <ZoomIn size={13} />
                    </button>
                    {zoom > 1.02 && (
                      <button
                        type="button"
                        onClick={resetZoomAndPan}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-[10px] font-extrabold text-neutral-700 cursor-pointer ml-0.5"
                        title="Reset Zoom to 100%"
                      >
                        <RotateCcw size={10} />
                        <span>Reset</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Zoomable Viewport Container */}
                <div
                  ref={viewportRef}
                  onDoubleClick={handleStudioDoubleClick}
                  onMouseDown={handleCanvasMouseDown}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseUp={finishDrawingOrDragging}
                  onMouseLeave={finishDrawingOrDragging}
                  className={`relative w-full h-[54vh] min-h-[360px] max-h-[540px] bg-white rounded-xl border border-neutral-200 overflow-hidden ${
                    isPanCursor
                      ? panningState
                        ? 'cursor-grabbing'
                        : 'cursor-grab'
                      : 'cursor-crosshair'
                  }`}
                >
                  {/* Transformed Inner Stage (Scales & Pans Image + Dotted SVG Lines + Callout Badges Together) */}
                  <div
                    ref={innerStageRef}
                    style={{
                      transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                      transformOrigin: '0 0'
                    }}
                    className="relative w-full h-full flex items-center justify-center"
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
                        drawingCurrent && activeTool !== 'scale' && activeTool !== 'pan'
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
                              realWorldInches:
                                (parseInchesValue(scaleInchesInput) || 28) /
                                (draftUnit === 'cm' ? CM_PER_INCH : 1),
                              referenceFeatureName: scaleFeatureInput || 'Reference',
                              aspectRatio: canvasAspectRatio
                            }
                          : draftScale
                      }
                      showScaleLine
                      zoom={zoom}
                      placement={{
                        widthInches: draftWidth,
                        heightInches: draftHeight,
                        distanceFromCollar: draftCollar,
                        referencePoint: draftReferencePoint
                      }}
                      selectedLineId={selectedLineId}
                      interactive
                      onSelectLine={(id) => setSelectedLineId(id)}
                      onStartDragEndpoint={(lineId, endpoint) =>
                        setDraggingEndpoint({ lineId, endpoint })
                      }
                    />

                    {/* Scale Calibration Badge on Canvas (Offset perpendicular to the line + pointer-events-none so it never blocks dragging A/B) */}
                    {labelDisplayMode !== 'hidden' &&
                      draftScale &&
                      !(drawingCurrent && activeTool === 'scale') &&
                      (() => {
                        const offset = getCalloutPerpendicularOffsetPx(
                          draftScale.x1,
                          draftScale.y1,
                          draftScale.x2,
                          draftScale.y2,
                          22
                        );
                        return (
                          <div
                            style={{
                              left: `${(draftScale.x1 + draftScale.x2) / 2}%`,
                              top: `${(draftScale.y1 + draftScale.y2) / 2}%`,
                              transform: `translate(-50%, -50%) scale(${1 / zoom}) translate(${offset.xPx}px, ${offset.yPx}px)`
                            }}
                            className={`absolute px-2 py-0.5 rounded-md text-[10px] font-extrabold border shadow-md whitespace-nowrap pointer-events-none bg-violet-600/95 text-white border-violet-700 ${
                              selectedLineId === '__scale_calibration__' ? 'ring-2 ring-black' : ''
                            }`}
                          >
                            {labelDisplayMode === 'compact'
                              ? `📏 ${formatMeasuredInches(draftScale.realWorldInches, draftUnit)}`
                              : `📏 Scale A┄B: ${formatMeasuredInches(draftScale.realWorldInches, draftUnit)} (${draftScale.referenceFeatureName})`}
                          </div>
                        );
                      })()}

                    {/* Live Floating Readout While Actively Dragging Point A -> Point B (Offset above the line so it never covers the cursor or line) */}
                    {drawingCurrent &&
                      liveDrawingMeasurementLabel &&
                      (() => {
                        const offset = getCalloutPerpendicularOffsetPx(
                          drawingCurrent.x1,
                          drawingCurrent.y1,
                          drawingCurrent.x2,
                          drawingCurrent.y2,
                          26
                        );
                        return (
                          <div
                            style={{
                              left: `${(drawingCurrent.x1 + drawingCurrent.x2) / 2}%`,
                              top: `${(drawingCurrent.y1 + drawingCurrent.y2) / 2}%`,
                              transform: `translate(-50%, -50%) scale(${1 / zoom}) translate(${offset.xPx}px, ${offset.yPx}px)`
                            }}
                            className="absolute px-2.5 py-1 rounded-lg text-xs font-black bg-neutral-900 text-white border border-white shadow-lg whitespace-nowrap pointer-events-none z-20"
                          >
                            {liveDrawingMeasurementLabel}
                          </div>
                        );
                      })()}

                    {/* Midpoint Callout Badges on Canvas (Offset perpendicular to the line & pointer-events-none so they NEVER cover the line or block Point A / Point B handles!) */}
                    {labelDisplayMode !== 'hidden' &&
                      draftLines.map((line) => {
                        const midX = (line.x1 + line.x2) / 2;
                        const midY = (line.y1 + line.y2) / 2;
                        const meta = LINE_KIND_META[line.kind] || LINE_KIND_META.custom;
                        const labelText = resolveLineDisplayLabel(
                          line,
                          {
                            widthInches: draftWidth,
                            heightInches: draftHeight,
                            distanceFromCollar: draftCollar,
                            referencePoint: draftReferencePoint
                          },
                          labelDisplayMode
                        );
                        const isSelected = selectedLineId === line.id;
                        const offset = getCalloutPerpendicularOffsetPx(
                          line.x1,
                          line.y1,
                          line.x2,
                          line.y2,
                          24
                        );
                        return (
                          <div
                            key={`${line.id}-studio-pill`}
                            style={{
                              left: `${midX}%`,
                              top: `${midY}%`,
                              transform: `translate(-50%, -50%) scale(${1 / zoom}) translate(${offset.xPx}px, ${offset.yPx}px)`
                            }}
                            className={`absolute px-2 py-0.5 rounded-md text-[10px] font-extrabold border shadow-md whitespace-nowrap pointer-events-none transition-opacity ${
                              meta.badgeBg
                            } ${isSelected ? 'ring-2 ring-black' : ''} ${
                              draggingEndpoint && draggingEndpoint.lineId === line.id
                                ? 'opacity-65'
                                : 'opacity-95'
                            }`}
                          >
                            {labelText}
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* Bottom Helper Tip */}
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-neutral-600 px-1">
                  <span>
                    {activeTool === 'pan' ? (
                      <>
                        <strong className="text-neutral-900">Pan Mode:</strong> Click and drag to move around the zoomed-in garment.
                      </>
                    ) : activeTool === 'scale' ? (
                      <>
                        <strong className="text-violet-700">Calibrate Garment Scale:</strong> Drag dotted line{' '}
                        <strong>A ┄ B</strong> across a known garment size (e.g.{' '}
                        {draftUnit === 'cm' ? '71.1 cm' : '28"'} front height).
                      </>
                    ) : (
                      <>
                        <strong className="text-neutral-900">
                          {LINE_KIND_META[activeTool].title}:
                        </strong>{' '}
                        {LINE_KIND_META[activeTool].defaultHint}
                      </>
                    )}
                  </span>
                  <span className="text-[10px] font-bold text-neutral-500">
                    💡 Scroll / Pinch to Zoom • Hold Space to Pan
                  </span>
                </div>
              </div>

              {/* Right 5 cols: Clean Collapsible Dropdown Accordions (Never Overwhelming!) */}
              <div className="lg:col-span-5 flex flex-col justify-between gap-3">
                <div className="space-y-2.5">
                  {/* ACCORDION 1: LOGO / GRAPHIC SIZE (WIDTH & HEIGHT) */}
                  <div className="rounded-xl border border-blue-200 bg-white overflow-hidden shadow-2xs">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenAccordion(openAccordion === 'logo_size' ? 'reference_point' : 'logo_size')
                      }
                      className="w-full px-3.5 py-2.5 bg-blue-50/70 hover:bg-blue-50 flex items-center justify-between gap-2 text-left cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-5 h-5 rounded-md bg-blue-600 text-white text-[10px] font-black flex items-center justify-center shrink-0">
                          1
                        </span>
                        <div>
                          <div className="text-xs font-black text-neutral-900">
                            Logo / Graphic Size (Width &amp; Height)
                          </div>
                          <div className="text-[10px] text-neutral-500">
                            How wide and tall the printed/embroidered logo itself is
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {(draftWidth || draftHeight) && (
                          <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-extrabold">
                            {draftWidth || '?'} × {draftHeight || '?'}
                          </span>
                        )}
                        {openAccordion === 'logo_size' ? (
                          <ChevronUp size={15} className="text-neutral-500" />
                        ) : (
                          <ChevronDown size={15} className="text-neutral-500" />
                        )}
                      </div>
                    </button>

                    {openAccordion === 'logo_size' && (
                      <div className="p-3.5 space-y-3 border-t border-blue-100 bg-white">
                        {/* Quick Unit Switcher inside Logo Size Accordion */}
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-bold text-neutral-500">
                            Measurement Unit
                          </span>
                          <div className="inline-flex items-center bg-neutral-100 p-0.5 rounded-lg border border-neutral-200">
                            {(['in', 'cm'] as MeasurementUnit[]).map((u) => (
                              <button
                                key={u}
                                type="button"
                                onClick={() => handleSwitchStudioUnit(u)}
                                className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase transition-colors cursor-pointer ${
                                  draftUnit === u
                                    ? 'bg-neutral-900 text-white'
                                    : 'text-neutral-600 hover:text-neutral-900'
                                }`}
                              >
                                {u}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2.5">
                          {/* Logo Width */}
                          <div className="p-2.5 rounded-xl bg-blue-50/40 border border-blue-200/80 space-y-1.5">
                            <div className="flex items-center justify-between gap-1">
                              <label className="text-[10px] font-extrabold uppercase text-blue-800">
                                Logo Width ({draftUnit})
                              </label>
                              <button
                                type="button"
                                onClick={() => setActiveTool('width')}
                                className={`px-2 py-0.5 rounded text-[9px] font-extrabold border cursor-pointer ${
                                  activeTool === 'width'
                                    ? 'bg-blue-600 text-white border-blue-700'
                                    : 'bg-white text-blue-700 border-blue-200 hover:bg-blue-50'
                                }`}
                              >
                                Draw A┄B
                              </button>
                            </div>
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
                              placeholder={
                                draftUnit === 'cm' ? 'e.g. 8.9 cm or 29.2 cm' : 'e.g. 3.5" or 11.5"'
                              }
                              className={`w-full px-2.5 py-1.5 rounded-lg transition-all focus:outline-none ${
                                draftWidth.trim()
                                  ? 'bg-blue-600 text-white border border-blue-700 text-xs font-black shadow-2xs focus:bg-white focus:text-neutral-950 focus:border-blue-600'
                                  : 'bg-white/70 border border-dashed border-blue-300 text-xs font-normal text-neutral-700 placeholder:text-blue-400/75 placeholder:italic placeholder:font-normal focus:bg-white focus:border-solid focus:border-blue-600 focus:font-bold'
                              }`}
                            />
                          </div>

                          {/* Logo Height */}
                          <div className="p-2.5 rounded-xl bg-emerald-50/40 border border-emerald-200/80 space-y-1.5">
                            <div className="flex items-center justify-between gap-1">
                              <label className="text-[10px] font-extrabold uppercase text-emerald-800">
                                Logo Height ({draftUnit})
                              </label>
                              <button
                                type="button"
                                onClick={() => setActiveTool('height')}
                                className={`px-2 py-0.5 rounded text-[9px] font-extrabold border cursor-pointer ${
                                  activeTool === 'height'
                                    ? 'bg-emerald-600 text-white border-emerald-700'
                                    : 'bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50'
                                }`}
                              >
                                Draw A┄B
                              </button>
                            </div>
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
                              placeholder={
                                draftUnit === 'cm' ? 'e.g. 8.9 cm or 35.6 cm' : 'e.g. 3.5" or 14"'
                              }
                              className={`w-full px-2.5 py-1.5 rounded-lg transition-all focus:outline-none ${
                                draftHeight.trim()
                                  ? 'bg-emerald-600 text-white border border-emerald-700 text-xs font-black shadow-2xs focus:bg-white focus:text-neutral-950 focus:border-emerald-600'
                                  : 'bg-white/70 border border-dashed border-emerald-300 text-xs font-normal text-neutral-700 placeholder:text-emerald-500/70 placeholder:italic placeholder:font-normal focus:bg-white focus:border-solid focus:border-emerald-600 focus:font-bold'
                              }`}
                            />
                          </div>
                        </div>

                        <p className="text-[10px] text-neutral-500 leading-snug">
                          Click <strong>Draw A┄B</strong> and drag across the logo on the garment (zoom in first for tiny chest or sleeve logos!).
                        </p>
                      </div>
                    )}
                  </div>

                  {/* ACCORDION 2: DISTANCE FROM GARMENT REFERENCE POINT */}
                  <div className="rounded-xl border border-amber-200 bg-white overflow-hidden shadow-2xs">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenAccordion(
                          openAccordion === 'reference_point' ? 'logo_size' : 'reference_point'
                        )
                      }
                      className="w-full px-3.5 py-2.5 bg-amber-50/80 hover:bg-amber-50 flex items-center justify-between gap-2 text-left cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-5 h-5 rounded-md bg-amber-500 text-white text-[10px] font-black flex items-center justify-center shrink-0">
                          2
                        </span>
                        <div>
                          <div className="text-xs font-black text-neutral-900">
                            Distance from Garment Reference Point
                          </div>
                          <div className="text-[10px] text-neutral-500">
                            Where to position the logo relative to collar, zipper, seam, or pocket
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {draftCollar && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[10px] font-extrabold truncate max-w-[130px]">
                            {draftReferencePoint}: {draftCollar}
                          </span>
                        )}
                        {openAccordion === 'reference_point' ? (
                          <ChevronUp size={15} className="text-neutral-500" />
                        ) : (
                          <ChevronDown size={15} className="text-neutral-500" />
                        )}
                      </div>
                    </button>

                    {openAccordion === 'reference_point' && (
                      <div className="p-3.5 space-y-3 border-t border-amber-100 bg-white">
                        {/* Primary Reference Point Selector + Custom Input */}
                        <div className="p-2.5 rounded-xl bg-amber-50/50 border border-amber-200/80 space-y-2">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[10px] font-extrabold uppercase text-amber-900">
                              Primary Reference Point (Point A) &amp; Distance to Logo (Point B)
                            </span>
                            <button
                              type="button"
                              onClick={() => setActiveTool('collar')}
                              className={`px-2 py-0.5 rounded text-[9px] font-extrabold border cursor-pointer shrink-0 ${
                                activeTool === 'collar'
                                  ? 'bg-amber-500 text-white border-amber-600'
                                  : 'bg-white text-amber-800 border-amber-300 hover:bg-amber-100'
                              }`}
                            >
                              Draw A┄B Line
                            </button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] font-bold text-neutral-600 mb-1">
                                Reference Point on Garment
                              </label>
                              <select
                                value={
                                  GARMENT_REFERENCE_POINTS.includes(draftReferencePoint)
                                    ? draftReferencePoint
                                    : '__custom__'
                                }
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === '__custom__') return;
                                  setDraftReferencePoint(val);
                                  setDraftLines((prev) =>
                                    prev.map((l) =>
                                      l.kind === 'collar' ? { ...l, referencePoint: val } : l
                                    )
                                  );
                                }}
                                className="w-full px-2 py-1.5 text-xs font-bold bg-white border border-amber-200 rounded-lg focus:outline-none focus:border-amber-600 mb-1.5"
                              >
                                {GARMENT_REFERENCE_POINTS.map((pt) => (
                                  <option key={pt} value={pt}>
                                    {pt}
                                  </option>
                                ))}
                                <option value="__custom__">Custom Reference Point...</option>
                              </select>
                              <input
                                type="text"
                                value={draftReferencePoint}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setDraftReferencePoint(val);
                                  setDraftLines((prev) =>
                                    prev.map((l) =>
                                      l.kind === 'collar' ? { ...l, referencePoint: val } : l
                                    )
                                  );
                                }}
                                placeholder="Or type custom point (e.g. Left Zipper)"
                                className={`w-full px-2.5 py-1 rounded-lg transition-all focus:outline-none ${
                                  draftReferencePoint.trim()
                                    ? 'bg-amber-600 text-white border border-amber-700 text-[11px] font-black shadow-2xs focus:bg-white focus:text-neutral-950 focus:border-amber-600'
                                    : 'bg-white/70 border border-dashed border-amber-300 text-[11px] font-normal text-neutral-700 placeholder:text-amber-500/70 placeholder:italic focus:bg-white focus:border-solid focus:border-amber-600'
                                }`}
                              />
                            </div>

                            <div>
                              <div className="flex items-center justify-between gap-1 mb-1">
                                <label className="block text-[10px] font-bold text-neutral-600">
                                  Distance ({draftUnit})
                                </label>
                                <div className="inline-flex items-center bg-white p-0.5 rounded border border-amber-200">
                                  {(['in', 'cm'] as MeasurementUnit[]).map((u) => (
                                    <button
                                      key={u}
                                      type="button"
                                      onClick={() => handleSwitchStudioUnit(u)}
                                      className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase cursor-pointer ${
                                        draftUnit === u
                                          ? 'bg-amber-600 text-white'
                                          : 'text-neutral-500 hover:text-neutral-900'
                                      }`}
                                    >
                                      {u}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <input
                                type="text"
                                value={draftCollar}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setDraftCollar(val);
                                  setDraftLines((prev) =>
                                    prev.map((l) =>
                                      l.kind === 'collar' ? { ...l, label: val } : l
                                    )
                                  );
                                }}
                                placeholder={
                                  draftUnit === 'cm'
                                    ? 'e.g. 7.6 cm down or 6.4 cm from zipper'
                                    : 'e.g. 3" down or 2.5" from zipper'
                                }
                                className={`w-full px-2.5 py-1.5 rounded-lg transition-all focus:outline-none ${
                                  draftCollar.trim()
                                    ? 'bg-amber-600 text-white border border-amber-700 text-xs font-black shadow-2xs focus:bg-white focus:text-neutral-950 focus:border-amber-600'
                                    : 'bg-white/70 border border-dashed border-amber-300 text-xs font-normal text-neutral-700 placeholder:text-amber-500/70 placeholder:italic placeholder:font-normal focus:bg-white focus:border-solid focus:border-amber-600 focus:font-bold'
                                }`}
                              />
                              <p className="text-[10px] text-amber-900/80 mt-1 leading-tight">
                                Point <strong>A</strong> = {draftReferencePoint || 'Reference'} • Point{' '}
                                <strong>B</strong> = Logo Edge
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Optional Additional Reference Point Distance (e.g. Distance from Zipper AND Distance from Collar) */}
                        <div className="p-2.5 rounded-xl bg-rose-50/40 border border-rose-200/80 space-y-2">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[10px] font-extrabold uppercase text-rose-800">
                              Add 2nd Reference Point Distance (Optional)
                            </span>
                            <button
                              type="button"
                              onClick={() => setActiveTool('custom')}
                              className={`px-2 py-0.5 rounded text-[9px] font-extrabold border cursor-pointer ${
                                activeTool === 'custom'
                                  ? 'bg-rose-600 text-white border-rose-700'
                                  : 'bg-white text-rose-700 border-rose-200 hover:bg-rose-50'
                              }`}
                            >
                              Draw 2nd A┄B Line
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="text"
                              value={extraRefPointDraft}
                              onChange={(e) => setExtraRefPointDraft(e.target.value)}
                              placeholder="2nd Ref Point (e.g. Center Zipper)"
                              className="w-full px-2 py-1 text-xs font-bold bg-white border border-rose-200 rounded-lg"
                            />
                            <input
                              type="text"
                              value={extraDistanceDraft}
                              onChange={(e) => setExtraDistanceDraft(e.target.value)}
                              placeholder={`Distance in ${draftUnit} (or auto-measure)`}
                              className="w-full px-2 py-1 text-xs font-bold bg-white border border-rose-200 rounded-lg"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ACCORDION 3: REAL-WORLD GARMENT SCALE CALIBRATION */}
                  <div className="rounded-xl border border-violet-200 bg-white overflow-hidden shadow-2xs">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenAccordion(openAccordion === 'scale' ? 'logo_size' : 'scale')
                      }
                      className="w-full px-3.5 py-2.5 bg-violet-50/70 hover:bg-violet-50 flex items-center justify-between gap-2 text-left cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-5 h-5 rounded-md bg-violet-600 text-white text-[10px] font-black flex items-center justify-center shrink-0">
                          3
                        </span>
                        <div>
                          <div className="text-xs font-black text-neutral-900">
                            Real-World Garment Scale (Auto-Measure)
                          </div>
                          <div className="text-[10px] text-neutral-500">
                            Provide 1 known garment measurement so lines auto-calculate in {draftUnit}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {draftScale ? (
                          <span className="px-2 py-0.5 rounded-full bg-violet-100 text-violet-800 text-[10px] font-extrabold">
                            {formatMeasuredInches(draftScale.realWorldInches, draftUnit)}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600 text-[10px] font-bold">
                            Optional
                          </span>
                        )}
                        {openAccordion === 'scale' ? (
                          <ChevronUp size={15} className="text-neutral-500" />
                        ) : (
                          <ChevronDown size={15} className="text-neutral-500" />
                        )}
                      </div>
                    </button>

                    {openAccordion === 'scale' && (
                      <div className="p-3.5 space-y-2.5 border-t border-violet-100 bg-white">
                        <div className="flex flex-wrap gap-1">
                          {SCALE_PRESET_FEATURES.map((preset) => {
                            const presetInchesNum = parseInchesValue(preset.defaultInches);
                            const displayPresetVal = formatScaleValueForUnit(presetInchesNum, draftUnit);
                            return (
                              <button
                                key={preset.label}
                                type="button"
                                onClick={() => {
                                  setScaleFeatureInput(preset.label);
                                  setScaleInchesInput(displayPresetVal);
                                  if (draftScale && presetInchesNum > 0) {
                                    const nextScale: PlacementScaleCalibration = {
                                      ...draftScale,
                                      referenceFeatureName: preset.label,
                                      realWorldInches: presetInchesNum
                                    };
                                    setDraftScale(nextScale);
                                    recalculateAllLinesWithScale(nextScale, draftLines, draftUnit);
                                  } else {
                                    setActiveTool('scale');
                                  }
                                }}
                                className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition-colors cursor-pointer ${
                                  scaleFeatureInput === preset.label
                                    ? 'bg-violet-600 text-white border-violet-700'
                                    : 'bg-violet-50/60 hover:bg-violet-100 text-violet-800 border-violet-200'
                                }`}
                              >
                                {preset.label} ({formatMeasuredInches(presetInchesNum, draftUnit)})
                              </button>
                            );
                          })}
                        </div>

                        <div className="grid grid-cols-12 gap-2">
                          <div className="col-span-7">
                            <label className="block text-[10px] font-extrabold uppercase text-violet-800 mb-1">
                              Known Garment Feature
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
                              placeholder="e.g. Front Garment Height"
                              className="w-full px-2.5 py-1.5 text-xs font-bold bg-white border border-violet-200 rounded-lg"
                            />
                          </div>
                          <div className="col-span-5">
                            <div className="flex items-center justify-between gap-1 mb-1">
                              <label className="block text-[10px] font-extrabold uppercase text-violet-800">
                                Real Size ({draftUnit})
                              </label>
                              <div className="inline-flex items-center bg-violet-100/80 p-0.5 rounded-md border border-violet-200">
                                {(['in', 'cm'] as MeasurementUnit[]).map((u) => (
                                  <button
                                    key={u}
                                    type="button"
                                    onClick={() => handleSwitchStudioUnit(u)}
                                    className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase transition-colors cursor-pointer ${
                                      draftUnit === u
                                        ? 'bg-violet-700 text-white shadow-2xs'
                                        : 'text-violet-700 hover:bg-white/60'
                                    }`}
                                  >
                                    {u}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <input
                              ref={scaleInchesInputRef}
                              type="text"
                              value={scaleInchesInput}
                              onChange={(e) => {
                                const val = e.target.value;
                                setScaleInchesInput(val);
                                const parsed = parseInchesValue(val);
                                if (draftScale && parsed > 0) {
                                  const nextInches =
                                    draftUnit === 'cm' ? parsed / CM_PER_INCH : parsed;
                                  const nextScale: PlacementScaleCalibration = {
                                    ...draftScale,
                                    realWorldInches: nextInches,
                                    referenceFeatureName: scaleFeatureInput.trim() || 'Reference'
                                  };
                                  setDraftScale(nextScale);
                                  recalculateAllLinesWithScale(nextScale, draftLines, draftUnit);
                                }
                              }}
                              placeholder={draftUnit === 'cm' ? 'e.g. 71.1' : 'e.g. 28'}
                              className="w-full px-2.5 py-1.5 text-xs font-bold bg-white border border-violet-200 rounded-lg"
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setActiveTool('scale')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold border cursor-pointer ${
                              activeTool === 'scale'
                                ? 'bg-violet-700 text-white border-violet-800'
                                : 'bg-violet-50 hover:bg-violet-600 text-violet-800 hover:text-white border-violet-300'
                            }`}
                          >
                            {draftScale ? 'Redraw Scale Line (A┄B)' : 'Draw Scale Line on Garment (A┄B)'}
                          </button>

                          {draftScale && (
                            <div className="flex items-center gap-2">
                              {draftLines.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    recalculateAllLinesWithScale(draftScale, draftLines, draftUnit)
                                  }
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
                                Remove
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ACCORDION 4: DRAWN POINT-A TO POINT-B LINES LIST */}
                  <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden shadow-2xs">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenAccordion(openAccordion === 'lines' ? 'logo_size' : 'lines')
                      }
                      className="w-full px-3.5 py-2.5 bg-neutral-50 hover:bg-neutral-100/80 flex items-center justify-between gap-2 text-left cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Move size={13} className="text-neutral-600" />
                        <span className="text-xs font-black text-neutral-900">
                          All Drawn Point A ┄ Point B Lines ({draftLines.length})
                        </span>
                      </div>
                      {openAccordion === 'lines' ? (
                        <ChevronUp size={15} className="text-neutral-500" />
                      ) : (
                        <ChevronDown size={15} className="text-neutral-500" />
                      )}
                    </button>

                    {openAccordion === 'lines' && (
                      <div className="p-3 border-t border-neutral-200 bg-white">
                        {draftLines.length === 0 ? (
                          <p className="text-xs text-neutral-400 italic py-1">
                            No lines drawn yet. Select a tool above and drag from Point A to Point B on the garment.
                          </p>
                        ) : (
                          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
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
                                  className={`p-2 rounded-lg border text-xs cursor-pointer space-y-1.5 ${
                                    selectedLineId === line.id
                                      ? 'border-neutral-900 bg-neutral-50'
                                      : 'border-neutral-200 bg-white'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                      <span
                                        className="w-2.5 h-2.5 rounded-full shrink-0"
                                        style={{ backgroundColor: line.color || meta.color }}
                                      />
                                      <span className="text-[10px] font-extrabold uppercase text-neutral-600 shrink-0">
                                        {meta.shortPrefix} (A┄B):
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
                                            prev.map((l) =>
                                              l.id === line.id ? { ...l, label: val } : l
                                            )
                                          );
                                        }}
                                        placeholder="Measurement..."
                                        className="w-full px-2 py-0.5 text-xs font-bold bg-white border border-neutral-200 rounded"
                                      />
                                    </div>
                                    {measuredVal !== null && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const formatted = formatMeasuredInches(
                                            measuredVal,
                                            draftUnit
                                          );
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
                                        title={`Apply scale-measured ${draftUnit}`}
                                      >
                                        📏 {formatMeasuredInches(measuredVal, draftUnit)}
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setDraftLines((prev) =>
                                          prev.filter((l) => l.id !== line.id)
                                        );
                                      }}
                                      className="p-1 text-neutral-400 hover:text-red-600 cursor-pointer"
                                      title="Delete line"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>

                                  {(line.kind === 'collar' || line.kind === 'custom') && (
                                    <div className="flex items-center gap-1.5 pl-4">
                                      <span className="text-[10px] font-bold text-neutral-500 shrink-0">
                                        Point A Ref:
                                      </span>
                                      <input
                                        type="text"
                                        value={
                                          line.kind === 'collar'
                                            ? draftReferencePoint
                                            : line.referencePoint || ''
                                        }
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          if (line.kind === 'collar') setDraftReferencePoint(val);
                                          setDraftLines((prev) =>
                                            prev.map((l) =>
                                              l.id === line.id ? { ...l, referencePoint: val } : l
                                            )
                                          );
                                        }}
                                        placeholder="e.g. Collar Seam, Zipper, Pocket..."
                                        className="w-full px-2 py-0.5 text-[11px] font-semibold bg-neutral-50 border border-neutral-200 rounded"
                                      />
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Bottom Action Buttons */}
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
                    <span>Save Measurements &amp; Lines</span>
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
