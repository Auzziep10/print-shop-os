import { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { hasSizeInList } from './garmentUtils';
import { getCachedTracking, pickBestTracking } from './liveTracking';

export const TIMELINE_STEPS = [
  'Requested',
  'Quoted',
  'Approved',
  'Sourced',
  'In Production',
  'Shipped',
  'Received'
] as const;

export type TimelineStepName = string;

export interface TimelineMilestone {
  completedAt?: string;
  expectedDate?: string;
  delayed?: boolean;
  delayNote?: string;
  manualOverrideAt?: string;
}

export type TimelineMilestonesMap = Record<string, TimelineMilestone | undefined>;

export interface FulfillmentPipelineConfig {
  id: string;
  name: string;
  steps: string[];
  isSystem?: boolean;
  useCustomStatusList?: boolean;
}

export const DEFAULT_FULFILLMENT_PIPELINES: FulfillmentPipelineConfig[] = [
  {
    id: 'Standard',
    name: 'Delivered',
    steps: ['Requested', 'Quoted', 'Approved', 'Sourced', 'In Production', 'Shipped', 'Received'],
    isSystem: true,
    useCustomStatusList: false
  },
  {
    id: 'Kitting',
    name: 'Inventory & Kitting',
    steps: ['Requested', 'Quoted', 'Approved', 'Sourced', 'In Production', 'Inventory', 'Live'],
    isSystem: true,
    useCustomStatusList: false
  }
];

let cachedPipelines: FulfillmentPipelineConfig[] = DEFAULT_FULFILLMENT_PIPELINES;
let isSubscribed = false;
const listeners = new Set<(pipelines: FulfillmentPipelineConfig[]) => void>();

function ensurePipelinesSubscription() {
  if (isSubscribed) return;
  isSubscribed = true;
  try {
    onSnapshot(
      doc(db, 'settings', 'fulfillmentPipelines'),
      (snap) => {
        if (snap.exists() && Array.isArray(snap.data()?.pipelines) && snap.data().pipelines.length > 0) {
          const loaded = snap.data().pipelines as FulfillmentPipelineConfig[];
          // Ensure Standard and Kitting always exist
          const merged: FulfillmentPipelineConfig[] = [...loaded];
          DEFAULT_FULFILLMENT_PIPELINES.forEach((def) => {
            if (!merged.some((p) => p.id === def.id)) {
              merged.unshift(def);
            }
          });
          cachedPipelines = merged;
        } else {
          cachedPipelines = DEFAULT_FULFILLMENT_PIPELINES;
        }
        listeners.forEach((cb) => cb(cachedPipelines));
      },
      (err) => {
        console.error('Error listening to fulfillmentPipelines:', err);
      }
    );
  } catch (err) {
    console.error('Failed to initialize fulfillmentPipelines listener:', err);
  }
}

export function useFulfillmentPipelines() {
  const [pipelines, setPipelines] = useState<FulfillmentPipelineConfig[]>(cachedPipelines);

  useEffect(() => {
    ensurePipelinesSubscription();
    setPipelines(cachedPipelines);
    const handler = (next: FulfillmentPipelineConfig[]) => setPipelines([...next]);
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  const savePipelines = async (nextPipelines: FulfillmentPipelineConfig[]) => {
    cachedPipelines = nextPipelines;
    listeners.forEach((cb) => cb(cachedPipelines));
    await setDoc(doc(db, 'settings', 'fulfillmentPipelines'), {
      pipelines: nextPipelines,
      updatedAt: new Date().toISOString()
    });
  };

  return { pipelines, savePipelines };
}

export function getEffectiveFulfillmentType(order?: any, customerFulfillmentType?: string): string {
  return order?.fulfillmentType || customerFulfillmentType || 'Standard';
}

export function getPipelineForFulfillmentType(
  fulfillmentType?: string,
  pipelines: FulfillmentPipelineConfig[] = cachedPipelines
): FulfillmentPipelineConfig {
  const ft = fulfillmentType || 'Standard';
  return (
    pipelines.find((p) => p.id === ft) ||
    DEFAULT_FULFILLMENT_PIPELINES.find((p) => p.id === ft) ||
    pipelines[0] ||
    DEFAULT_FULFILLMENT_PIPELINES[0]
  );
}

export function getOrderTimelineSteps(
  order?: any,
  customerFulfillmentType?: string,
  pipelines: FulfillmentPipelineConfig[] = cachedPipelines
): string[] {
  const ft = getEffectiveFulfillmentType(order, customerFulfillmentType);
  const pipeline = getPipelineForFulfillmentType(ft, pipelines);
  return pipeline.steps && pipeline.steps.length >= 2
    ? pipeline.steps
    : [...TIMELINE_STEPS];
}

export function isCustomStatusPipeline(
  fulfillmentType?: string,
  pipelines: FulfillmentPipelineConfig[] = cachedPipelines
): boolean {
  const pipeline = getPipelineForFulfillmentType(fulfillmentType, pipelines);
  if (pipeline.useCustomStatusList) return true;
  if (pipeline.id !== 'Standard' && pipeline.id !== 'Kitting') return true;
  return false;
}

export function getPipelineStatusOptions(
  fulfillmentType?: string,
  pipelines: FulfillmentPipelineConfig[] = cachedPipelines
): { value: number; label: string; stepName: string }[] {
  const pipeline = getPipelineForFulfillmentType(fulfillmentType, pipelines);
  if (isCustomStatusPipeline(fulfillmentType, pipelines)) {
    return pipeline.steps.map((step, idx) => ({
      value: idx,
      label: `${idx} - ${step}`,
      stepName: step
    }));
  }

  const isKitting = pipeline.id === 'Kitting';
  const step5 = pipeline.steps[5] || (isKitting ? 'Inventory' : 'Shipped');
  const step6 = pipeline.steps[6] || (isKitting ? 'Live (Shopify)' : 'Received');

  return [
    { value: 0, label: `0 - Quote`, stepName: pipeline.steps[0] || 'Requested' },
    { value: 1, label: `1 - Mgmt Notified`, stepName: pipeline.steps[1] || 'Quoted' },
    { value: 2, label: `2 - Quote Sent`, stepName: pipeline.steps[1] || 'Quoted' },
    { value: 3, label: `3 - Approved`, stepName: pipeline.steps[2] || 'Approved' },
    { value: 4, label: `4 - Shopping`, stepName: pipeline.steps[3] || 'Sourced' },
    { value: 5, label: `5 - Ordered`, stepName: pipeline.steps[3] || 'Sourced' },
    { value: 6, label: `6 - Processing`, stepName: pipeline.steps[4] || 'In Production' },
    { value: 7, label: `7 - ${step5}`, stepName: step5 },
    { value: 8, label: `8 - ${isKitting && step6 === 'Live' ? 'Live (Shopify)' : step6}`, stepName: step6 }
  ];
}

export function statusIndexToTimelineStep(
  statusIndex: number,
  fulfillmentType?: string,
  pipelines: FulfillmentPipelineConfig[] = cachedPipelines
): string {
  const pipeline = getPipelineForFulfillmentType(fulfillmentType, pipelines);
  const steps = pipeline.steps;

  if (isCustomStatusPipeline(fulfillmentType, pipelines)) {
    const clamped = Math.max(0, Math.min(steps.length - 1, statusIndex));
    return steps[clamped] || steps[0] || 'Requested';
  }

  if (statusIndex <= 0) return steps[0] || 'Requested';
  if (statusIndex === 1 || statusIndex === 2) return steps[1] || 'Quoted';
  if (statusIndex === 3) return steps[2] || 'Approved';
  if (statusIndex === 4 || statusIndex === 5) return steps[3] || 'Sourced';
  if (statusIndex === 6) return steps[4] || 'In Production';
  if (statusIndex === 7) return steps[5] || 'Shipped';
  return steps[steps.length - 1] || 'Received';
}

export function computeOrderVisualTimelineIndex(
  order: any,
  customerFulfillmentType?: string,
  pipelines: FulfillmentPipelineConfig[] = cachedPipelines
): number {
  const ft = getEffectiveFulfillmentType(order, customerFulfillmentType);
  const pipeline = getPipelineForFulfillmentType(ft, pipelines);
  const steps = pipeline.steps;
  const statusIdx = typeof order?.statusIndex === 'number' ? order.statusIndex : 0;

  if (isCustomStatusPipeline(ft, pipelines)) {
    return Math.max(0, Math.min(steps.length - 1, statusIdx));
  }

  let visualIndex = 0;
  if (statusIdx === 0) {
    visualIndex = 0;
  } else if (statusIdx === 1) {
    visualIndex = 1;
  } else if (statusIdx === 2) {
    visualIndex = 1.5;
  } else if (statusIdx === 3) {
    visualIndex = 2;
  } else if (statusIdx === 4) {
    visualIndex = 2.5;
  } else if (statusIdx === 5) {
    visualIndex = 3;
  } else if (statusIdx === 6) {
    visualIndex = 4;
  } else if (statusIdx === 7) {
    visualIndex = 5;
  } else if (statusIdx === 8) {
    visualIndex = Math.max(0, steps.length - 1);
  }

  let totalGarments = 0;
  let completedGarments = 0;
  order?.items?.forEach((item: any) => {
    if (item.sizes && Object.keys(item.sizes).length > 0) {
      Object.entries(item.sizes).forEach(([size, qty]: [string, any]) => {
        const q = parseInt(qty, 10) || 0;
        totalGarments += q;
        if (hasSizeInList(item.completedSizes, size)) {
          completedGarments += q;
        }
      });
    } else if (item.qty) {
      totalGarments += parseInt(item.qty, 10) || 0;
    }
  });

  if (order?.statusIndex === 6) {
    const prodRatio = totalGarments > 0 ? completedGarments / totalGarments : 0;
    const kitGarments =
      order.boxes?.reduce(
        (acc: number, box: any) =>
          acc + (box.items?.reduce((iAcc: number, bi: any) => iAcc + (bi.qty || 0), 0) || 0),
        0
      ) || 0;
    const kitRatio = totalGarments > 0 ? kitGarments / totalGarments : 0;
    const hasBoxes = order.boxes && order.boxes.length > 0;
    const allBoxesHaveTracking =
      hasBoxes &&
      order.boxes.every((b: any) => b.trackingNumber || b.labelUrl || b.trackingCarrier === 'Pickup');

    if (allBoxesHaveTracking) {
      visualIndex += 1;
    } else {
      const completionRatio = prodRatio * 0.5 + kitRatio * 0.5;
      const scaledRatio = completionRatio > 0.95 ? 0.95 : completionRatio;
      visualIndex += scaledRatio;
    }
  }

  if (statusIdx >= 3 && steps[steps.length - 1] !== 'Live') {
    const trackingMilestone = getOrderTrackingReceivedMilestone(order);
    if (trackingMilestone?.allDelivered) {
      return Math.max(0, steps.length - 1);
    }
    if (statusIdx < 7 && hasOrderShippedTracking(order)) {
      visualIndex = Math.max(visualIndex, 5);
    }
  }

  return Math.min(Math.max(0, steps.length - 1), visualIndex);
}

export function getUpdatedTimelineMilestonesForStatusChange(
  existing: TimelineMilestonesMap | undefined,
  newStatusIndex: number,
  nowIso: string = new Date().toISOString(),
  fulfillmentType?: string,
  pipelines: FulfillmentPipelineConfig[] = cachedPipelines
): TimelineMilestonesMap {
  const next: TimelineMilestonesMap = { ...(existing || {}) };
  const pipeline = getPipelineForFulfillmentType(fulfillmentType, pipelines);
  const steps = pipeline.steps;
  const targetStepName = statusIndexToTimelineStep(newStatusIndex, fulfillmentType, pipelines);
  const targetStepIdx = steps.indexOf(targetStepName);

  steps.forEach((step, idx) => {
    if (idx <= targetStepIdx) {
      const prevMilestone = next[step] || {};
      const updatedMilestone: TimelineMilestone = {
        ...prevMilestone,
        completedAt:
          prevMilestone.completedAt ||
          (idx === targetStepIdx ? nowIso : prevMilestone.completedAt || nowIso),
        delayed: idx < targetStepIdx ? false : Boolean(prevMilestone.delayed)
      };
      Object.keys(updatedMilestone).forEach((k) => {
        if ((updatedMilestone as any)[k] === undefined) {
          delete (updatedMilestone as any)[k];
        }
      });
      next[step] = updatedMilestone;
    }
  });

  Object.keys(next).forEach((stepKey) => {
    const val = next[stepKey];
    if (!val) {
      delete next[stepKey];
      return;
    }
    const cleanStep: Record<string, any> = { ...val };
    Object.keys(cleanStep).forEach((k) => {
      if (cleanStep[k] === undefined) {
        delete cleanStep[k];
      }
    });
    next[stepKey] = cleanStep as TimelineMilestone;
  });

  return next;
}

function inferCompletedAtFromActivities(order: any, step: string, stepIdx: number): string | undefined {
  if (stepIdx === 0 || step === 'Requested') {
    if (order?.createdAt) return order.createdAt;
  }

  const activities: any[] = Array.isArray(order?.activities) ? order.activities : [];
  if (activities.length === 0) return undefined;

  const keywordsByStep: Record<string, string[]> = {
    Requested: ['request created', 'order created', 'quote requested'],
    Quoted: ['under review', 'quote prepared', 'quoted'],
    Approved: ['awaiting payment', 'approved', 'paid'],
    Sourced: ['sourcing', 'ordered', 'sourced'],
    'In Production': ['in production', 'production'],
    Shipped: ['shipped', 'inventory'],
    Inventory: ['inventory', 'shipped'],
    Received: ['received', 'live'],
    Live: ['live', 'received']
  };

  const keywords = keywordsByStep[step] || [step.toLowerCase()];
  for (const act of activities) {
    const msg = String(act?.message || '').toLowerCase();
    if (!msg) continue;
    if (keywords.some((kw) => msg.includes(kw)) && act?.timestamp) {
      return act.timestamp;
    }
  }

  return undefined;
}

export function inferServiceBusinessDays(carrier?: string, service?: string): number {
  const s = (service || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const c = (carrier || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!s) return 4;
  if (
    s.includes('nextday') ||
    s.includes('overnight') ||
    s.includes('1stday') ||
    (c.includes('usps') && s.includes('express'))
  ) {
    return 1;
  }
  if (s.includes('2ndday') || s.includes('2day') || s.includes('secondday') || s.includes('twoday')) {
    return 2;
  }
  if (
    s.includes('3day') ||
    s.includes('threeday') ||
    s.includes('expresssaver') ||
    (c.includes('usps') && s.includes('priority'))
  ) {
    return 3;
  }
  return 4;
}

export function addBusinessDaysToYmd(baseDateInput?: string | Date | null, businessDays: number = 4): string {
  let base = new Date();
  if (baseDateInput instanceof Date && !isNaN(baseDateInput.getTime())) {
    base = new Date(baseDateInput.getTime());
  } else if (typeof baseDateInput === 'string' && baseDateInput.trim()) {
    const ymd = toDateInputValue(baseDateInput);
    if (ymd && /^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
      const [y, m, d] = ymd.split('-').map(Number);
      base = new Date(y, m - 1, d);
    } else {
      const parsed = new Date(baseDateInput);
      if (!isNaN(parsed.getTime())) base = parsed;
    }
  }
  const days = Math.max(1, Math.round(Number(businessDays) || 4));
  let remaining = days;
  const cursor = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  while (remaining > 0) {
    cursor.setDate(cursor.getDate() + 1);
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) {
      remaining--;
    }
  }
  const y = cursor.getFullYear();
  const m = String(cursor.getMonth() + 1).padStart(2, '0');
  const d = String(cursor.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function resolveLabelEstimatedDeliveryYmd(opts: {
  estDeliveryDate?: string | null;
  deliveryDays?: number | string | null;
  carrier?: string;
  service?: string;
  baseDate?: string | Date | null;
}): string {
  if (opts.estDeliveryDate) {
    const ymd = toDateInputValue(opts.estDeliveryDate);
    if (ymd) return ymd;
  }
  const parsedDays = opts.deliveryDays != null ? Number(opts.deliveryDays) : NaN;
  const days =
    Number.isFinite(parsedDays) && parsedDays > 0
      ? parsedDays
      : inferServiceBusinessDays(opts.carrier, opts.service);
  return addBusinessDaysToYmd(opts.baseDate || new Date(), days);
}

export function formatYmdToShortOrderDate(ymd?: string): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return '';
  const [y, m, d] = ymd.split('-');
  return `${m}/${d}/${y.substring(2)}`;
}

function findPurchasedLabelTimestamp(order: any, box: any): string | undefined {
  if (box?.labelCreatedAt) return String(box.labelCreatedAt);
  const activities: any[] = Array.isArray(order?.activities) ? order.activities : [];
  const code = String(box?.trackingNumber || '').trim();
  const boxName = String(box?.name || '').trim();
  for (const act of activities) {
    const msg = String(act?.message || '');
    if (!msg.includes('Purchased') || !msg.includes('Label')) continue;
    if (code && msg.includes(code) && act?.timestamp) return String(act.timestamp);
    if (boxName && msg.includes(boxName) && act?.timestamp) return String(act.timestamp);
  }
  for (const act of activities) {
    const msg = String(act?.message || '');
    if (msg.includes('Purchased') && msg.includes('Label') && act?.timestamp) {
      return String(act.timestamp);
    }
  }
  return box?.trackingUpdatedAt || box?.createdAt || undefined;
}

export function getOrderTrackingReceivedMilestone(order: any): {
  expectedDate?: string;
  completedAt?: string;
  allDelivered: boolean;
  updatedAt?: string;
  hasPlatformLabel: boolean;
} | null {
  const rawBoxes: any[] = Array.isArray(order?.boxes) ? order.boxes : [];
  if (rawBoxes.length === 0) return null;

  const boxes = rawBoxes.map((b: any) =>
    b?.trackingNumber ? { ...b, ...pickBestTracking(getCachedTracking(b.trackingNumber), b) } : b
  );

  const trackedBoxes = boxes.filter(
    (b: any) =>
      b &&
      b.trackingCarrier !== 'Pickup' &&
      Boolean(
        b.trackingNumber ||
          b.labelUrl ||
          b.trackingEstDelivery ||
          b.easyPostTrackerId ||
          b.estArrival ||
          b.trackingStatus === 'delivered'
      )
  );
  if (trackedBoxes.length === 0) return null;

  let latestExpectedYmd = '';
  let latestDeliveredIso = '';
  let latestUpdatedAt = '';
  let deliveredCount = 0;
  const hasPlatformLabel = trackedBoxes.some((b: any) => Boolean(b.labelUrl));

  for (const b of trackedBoxes) {
    const labelTs = findPurchasedLabelTimestamp(order, b) || '';
    const boxUpdated = String(b.trackingUpdatedAt || labelTs || b.createdAt || '');
    if (boxUpdated && (!latestUpdatedAt || boxUpdated > latestUpdatedAt)) {
      latestUpdatedAt = boxUpdated;
    }

    if (b.trackingStatus === 'delivered') {
      deliveredCount++;
      const events: any[] = Array.isArray(b.trackingEvents) ? b.trackingEvents : [];
      const delivEv = events.find((ev: any) => ev?.status === 'delivered' && ev?.datetime);
      const delivRaw =
        delivEv?.datetime ||
        b.trackingLastEvent?.datetime ||
        b.trackingEstDelivery ||
        b.estArrival ||
        b.trackingUpdatedAt ||
        labelTs ||
        new Date().toISOString();
      if (delivRaw) {
        const delivStr = String(delivRaw);
        if (!latestDeliveredIso || delivStr > latestDeliveredIso) {
          latestDeliveredIso = delivStr;
        }
        const ymd = toDateInputValue(delivStr);
        if (ymd && (!latestExpectedYmd || ymd > latestExpectedYmd)) {
          latestExpectedYmd = ymd;
        }
      }
      continue;
    }

    let boxYmd = '';
    if (b.trackingEstDelivery) {
      boxYmd = toDateInputValue(b.trackingEstDelivery);
    }
    if (!boxYmd && b.estArrival) {
      boxYmd = toDateInputValue(b.estArrival);
    }
    if (!boxYmd && (b.labelUrl || b.trackingNumber)) {
      boxYmd = resolveLabelEstimatedDeliveryYmd({
        carrier: b.trackingCarrier,
        service: b.trackingService,
        baseDate: labelTs || order?.updatedAt || order?.createdAt || new Date()
      });
    }

    if (boxYmd && (!latestExpectedYmd || boxYmd > latestExpectedYmd)) {
      latestExpectedYmd = boxYmd;
    }
  }

  if (!latestExpectedYmd && !latestDeliveredIso && deliveredCount === 0) return null;

  const boxesWithTracking = boxes.filter(
    (b: any) => b && b.trackingCarrier !== 'Pickup' && Boolean(b.trackingNumber || b.trackingStatus === 'delivered')
  );
  const allNonPickupBoxes =
    boxesWithTracking.length > 0 ? boxesWithTracking : trackedBoxes;
  const allDelivered =
    allNonPickupBoxes.length > 0 && deliveredCount >= allNonPickupBoxes.length;

  return {
    expectedDate: latestExpectedYmd || toDateInputValue(latestDeliveredIso) || undefined,
    completedAt: allDelivered ? latestDeliveredIso || latestExpectedYmd || new Date().toISOString() : undefined,
    allDelivered,
    updatedAt: latestUpdatedAt || undefined,
    hasPlatformLabel
  };
}

export function hasOrderShippedTracking(order: any): boolean {
  if (!order || typeof order !== 'object') return false;
  if (order.trackingNumber && order.trackingCarrier !== 'Pickup') {
    return true;
  }
  const boxes: any[] = Array.isArray(order.boxes) ? order.boxes : [];
  if (boxes.length === 0) return false;
  return boxes.some(
    (b: any) =>
      b &&
      b.trackingCarrier !== 'Pickup' &&
      Boolean(
        b.trackingNumber ||
          b.labelUrl ||
          b.easyPostTrackerId ||
          b.trackingEstDelivery ||
          b.trackingStatus === 'in_transit' ||
          b.trackingStatus === 'out_for_delivery' ||
          b.trackingStatus === 'delivered'
      )
  );
}

export function getEffectiveOrderStatusIndex(order: any): number {
  const rawIdx = typeof order?.statusIndex === 'number' ? order.statusIndex : 0;
  if (!order || order.fulfillmentType === 'Kitting') return rawIdx;
  if (rawIdx < 3) return rawIdx;

  const trackingMilestone = getOrderTrackingReceivedMilestone(order);
  if (trackingMilestone?.allDelivered && rawIdx < 8) {
    return 8;
  }
  if (rawIdx < 7 && hasOrderShippedTracking(order)) {
    return 7;
  }
  return rawIdx;
}

export function getOrderDeliveryEtaShort(order: any): string | null {
  if (!order || typeof order !== 'object') return null;
  const trackingMilestone = getOrderTrackingReceivedMilestone(order);
  const rawYmd =
    trackingMilestone?.expectedDate ||
    (hasOrderShippedTracking(order)
      ? toDateInputValue(order?.timelineMilestones?.Received?.expectedDate)
      : '');
  if (!rawYmd) return null;
  const match = String(rawYmd).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function resolveStepMilestone(
  order: any,
  step: string,
  stepIdx: number,
  visualIndex: number,
  totalStepsCount: number = TIMELINE_STEPS.length
): {
  completedAt?: string;
  expectedDate?: string;
  delayed: boolean;
  delayNote?: string;
  isCompleted: boolean;
} {
  const isCompleted = stepIdx <= Math.floor(visualIndex);
  const rawMilestone: TimelineMilestone = order?.timelineMilestones?.[step] || {};

  let completedAt = rawMilestone.completedAt;
  if (!completedAt && isCompleted) {
    completedAt =
      inferCompletedAtFromActivities(order, step, stepIdx) ||
      (stepIdx === 0
        ? order?.createdAt || order?.rawDate
        : order?.updatedAt || order?.createdAt);
  }

  let expectedDate = rawMilestone.expectedDate;
  if (!expectedDate && stepIdx === totalStepsCount - 1) {
    expectedDate =
      order?.timelineMilestones?.['Received']?.expectedDate ||
      order?.date ||
      order?.targetCompletionDate ||
      order?.neededByDate ||
      undefined;
  }

  const isReceivedStep =
    step === 'Received' || (stepIdx === totalStepsCount - 1 && step !== 'Live');
  if (isReceivedStep) {
    const trackingMilestone = getOrderTrackingReceivedMilestone(order);
    if (trackingMilestone) {
      const manualOverrideAt =
        rawMilestone.manualOverrideAt ||
        order?.timelineMilestones?.['Received']?.manualOverrideAt;
      const hasNewerManualOverride = Boolean(
        manualOverrideAt &&
          rawMilestone.expectedDate &&
          (!trackingMilestone.updatedAt || manualOverrideAt > trackingMilestone.updatedAt)
      );
      if (!hasNewerManualOverride && trackingMilestone.expectedDate) {
        expectedDate = trackingMilestone.expectedDate;
      }
      if (trackingMilestone.allDelivered && trackingMilestone.completedAt) {
        completedAt = trackingMilestone.completedAt;
      }
    }
  }

  return {
    completedAt,
    expectedDate,
    delayed: Boolean(rawMilestone.delayed),
    delayNote: rawMilestone.delayNote || '',
    isCompleted
  };
}

export function formatTimelineDate(dateStr?: string): string {
  if (!dateStr || dateStr === 'TBD') return '';
  const trimmed = String(dateStr).trim();
  if (!trimmed) return '';

  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(trimmed)) {
    const parts = trimmed.split('/');
    const month = parseInt(parts[0], 10) - 1;
    const day = parseInt(parts[1], 10);
    let year = parseInt(parts[2], 10);
    if (year < 100) year += 2000;
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
  }

  const dateOnlyOrUtcMidnight = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.\d+)?Z)?$/i);
  if (dateOnlyOrUtcMidnight) {
    const [, y, m, d] = dateOnlyOrUtcMidnight.map(Number);
    const localDate = new Date(y, m - 1, d);
    if (!isNaN(localDate.getTime())) {
      return localDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
  }

  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  return trimmed;
}

export function toDateInputValue(dateStr?: string): string {
  if (!dateStr || dateStr === 'TBD') return '';
  const trimmed = String(dateStr).trim();
  const dateOnlyOrUtcMidnight = trimmed.match(/^(\d{4}-\d{2}-\d{2})(?:T00:00:00(?:\.\d+)?Z)?$/i);
  if (dateOnlyOrUtcMidnight) return dateOnlyOrUtcMidnight[1];

  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(trimmed)) {
    const parts = trimmed.split('/');
    const m = String(parseInt(parts[0], 10)).padStart(2, '0');
    const d = String(parseInt(parts[1], 10)).padStart(2, '0');
    let y = parseInt(parts[2], 10);
    if (y < 100) y += 2000;
    return `${y}-${m}-${d}`;
  }

  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return '';
}
