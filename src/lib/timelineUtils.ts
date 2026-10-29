import { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { hasSizeInList } from './garmentUtils';

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
      hasBoxes && order.boxes.every((b: any) => b.trackingNumber || b.trackingCarrier === 'Pickup');

    if (kitRatio >= 0.95 && allBoxesHaveTracking) {
      visualIndex += 1;
    } else {
      const completionRatio = prodRatio * 0.5 + kitRatio * 0.5;
      const scaledRatio = completionRatio > 0.95 ? 0.95 : completionRatio;
      visualIndex += scaledRatio;
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
      next[step] = {
        ...prevMilestone,
        completedAt:
          prevMilestone.completedAt ||
          (idx === targetStepIdx ? nowIso : prevMilestone.completedAt || nowIso),
        delayed: idx < targetStepIdx ? false : prevMilestone.delayed
      };
    }
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

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split('-').map(Number);
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
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

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
