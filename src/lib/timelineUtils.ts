export const TIMELINE_STEPS = [
  'Requested',
  'Quoted',
  'Approved',
  'Sourced',
  'In Production',
  'Shipped',
  'Received'
] as const;

export type TimelineStepName = (typeof TIMELINE_STEPS)[number];

export interface TimelineMilestone {
  completedAt?: string;
  expectedDate?: string;
  delayed?: boolean;
  delayNote?: string;
}

export type TimelineMilestonesMap = Partial<Record<TimelineStepName, TimelineMilestone>>;

export function statusIndexToTimelineStep(statusIndex: number): TimelineStepName {
  if (statusIndex <= 0) return 'Requested';
  if (statusIndex === 1 || statusIndex === 2) return 'Quoted';
  if (statusIndex === 3) return 'Approved';
  if (statusIndex === 4 || statusIndex === 5) return 'Sourced';
  if (statusIndex === 6) return 'In Production';
  if (statusIndex === 7) return 'Shipped';
  return 'Received';
}

export function computeOrderVisualTimelineIndex(order: any): number {
  let visualIndex = 0;
  const statusIdx = typeof order?.statusIndex === 'number' ? order.statusIndex : 0;
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
    visualIndex = 6;
  }

  let totalGarments = 0;
  let completedGarments = 0;
  order?.items?.forEach((item: any) => {
    if (item.sizes && Object.keys(item.sizes).length > 0) {
      Object.entries(item.sizes).forEach(([size, qty]: [string, any]) => {
        const q = parseInt(qty, 10) || 0;
        totalGarments += q;
        if (item.completedSizes?.includes(size)) {
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

  return visualIndex;
}

export function getUpdatedTimelineMilestonesForStatusChange(
  existing: TimelineMilestonesMap | undefined,
  newStatusIndex: number,
  nowIso: string = new Date().toISOString()
): TimelineMilestonesMap {
  const next: TimelineMilestonesMap = { ...(existing || {}) };
  const stepName = statusIndexToTimelineStep(newStatusIndex);
  const currentStepMilestone = next[stepName] || {};

  next[stepName] = {
    ...currentStepMilestone,
    completedAt: nowIso
  };

  if (!next['Requested']?.completedAt) {
    next['Requested'] = {
      ...(next['Requested'] || {}),
      completedAt: nowIso
    };
  }

  return next;
}

function inferCompletedAtFromActivities(order: any, step: TimelineStepName): string | undefined {
  if (step === 'Requested') {
    if (order?.createdAt) return order.createdAt;
  }

  const activities: any[] = Array.isArray(order?.activities) ? order.activities : [];
  if (activities.length === 0) return undefined;

  const keywordsByStep: Record<TimelineStepName, string[]> = {
    Requested: ['request created', 'order created', 'quote requested'],
    Quoted: ['under review', 'quote prepared', 'quoted'],
    Approved: ['awaiting payment', 'approved', 'paid'],
    Sourced: ['sourcing', 'ordered', 'sourced'],
    'In Production': ['in production', 'production'],
    Shipped: ['shipped', 'inventory'],
    Received: ['received', 'live']
  };

  const keywords = keywordsByStep[step] || [];
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
  step: TimelineStepName,
  stepIdx: number,
  visualIndex: number
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
    completedAt = inferCompletedAtFromActivities(order, step);
  }

  let expectedDate = rawMilestone.expectedDate;
  if (!expectedDate && step === 'Received') {
    expectedDate = order?.date || order?.targetCompletionDate || order?.neededByDate || undefined;
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

  // Handle MM/DD/YY or MM/DD/YYYY
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

  // Handle YYYY-MM-DD without timezone shift
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
