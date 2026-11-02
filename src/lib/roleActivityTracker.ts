import {
  doc as realDoc,
  getDoc as realGetDoc,
  setDoc as realSetDoc,
  type Firestore
} from 'firebase/firestore';

export interface ActiveActorInfo {
  id: string;
  uid?: string;
  name: string;
  email: string;
  role: string;
}

export interface ActivityChangeDetail {
  field: string;
  before?: string;
  after?: string;
  summary: string;
}

export interface ActivityPopupEvent {
  id: string;
  category: 'designer_rack' | 'sales_order' | 'designer_platform';
  actorId: string;
  actorName: string;
  actorEmail: string;
  actorRole: string;
  actionTitle: string;
  actionSummary: string;
  changeDetails?: ActivityChangeDetail[];
  targetType: 'customer_rack' | 'customer' | 'order' | 'settings' | 'platform';
  targetId: string;
  targetLabel: string;
  targetRoute: string;
  mockupUrl?: string;
  designTitle?: string;
  createdAt: string;
  createdAtMs: number;
}

export const ACTIVITY_POPUPS_DOC_ID = 'activityPopups';
const MAX_STORED_EVENTS = 500;

let currentActor: ActiveActorInfo | null = null;
let mainFirestoreInstance: Firestore | null = null;

// Caches populated by live listeners so pop-ups always display human-readable Customer & Order names
const customerCache = new Map<
  string,
  {
    name: string;
    designerRack: any[];
    raw?: Record<string, any>;
  }
>();

const orderCache = new Map<
  string,
  {
    title: string;
    portalId: string;
    customerName: string;
    customerId: string;
    raw?: Record<string, any>;
  }
>();

let lastDesignerRackSaveMs = 0;
let suppressTrackingDepth = 0;

// In-memory listeners for same-tab instant reactivity
type LocalPopupListener = (event: ActivityPopupEvent) => void;
const localListeners = new Set<LocalPopupListener>();

export function subscribeLocalActivityPopup(listener: LocalPopupListener): () => void {
  localListeners.add(listener);
  return () => {
    localListeners.delete(listener);
  };
}

function notifyLocalListeners(event: ActivityPopupEvent) {
  localListeners.forEach((fn) => {
    try {
      fn(event);
    } catch (err) {
      console.error('Error in local activity popup listener:', err);
    }
  });
}

export function setActiveActorForTracking(actor: ActiveActorInfo | null) {
  currentActor = actor;
}

export function getActiveActorForTracking(): ActiveActorInfo | null {
  return currentActor;
}

export function registerMainFirestoreForTracking(db: Firestore) {
  mainFirestoreInstance = db;
}

export function runWithSuppressedActivityTracking<T>(fn: () => Promise<T>): Promise<T> {
  suppressTrackingDepth++;
  return fn().finally(() => {
    suppressTrackingDepth = Math.max(0, suppressTrackingDepth - 1);
  });
}

export function updateCustomerCacheForTracking(customers: any[]) {
  customers.forEach((c) => {
    if (!c || !c.id) return;
    const name = c.company || c.contactName || c.name || 'Customer';
    const existing = customerCache.get(c.id);
    customerCache.set(c.id, {
      name,
      designerRack: Array.isArray(c.designerRack) ? c.designerRack : existing?.designerRack || [],
      raw: c
    });
  });
}

export function updateOrderCacheForTracking(orders: any[]) {
  orders.forEach((o) => {
    if (!o || !o.id) return;
    const portalId = String(o.portalId || o.orderNumber || o.id.substring(0, 8));
    const title = o.title || `Order #${portalId}`;
    const customerName =
      o.customer ||
      o.customerName ||
      o.contactDetails?.company ||
      o.contactDetails?.name ||
      (o.customerId && customerCache.get(o.customerId)?.name) ||
      '';
    orderCache.set(o.id, {
      title,
      portalId,
      customerName,
      customerId: o.customerId || '',
      raw: o
    });
  });
}

export function shouldShowActivityPopupsForRole(role?: string | null): boolean {
  if (!role) return false;
  const r = role.trim().toLowerCase();
  if (
    r.includes('sales') ||
    r.includes('designer') ||
    r === 'client' ||
    r === 'pending' ||
    r === 'printer'
  ) {
    return false;
  }
  return r === 'admin' || r === 'staff' || r === 'leadership' || r === 'manager';
}

export function isSalesRole(role?: string | null): boolean {
  return Boolean(role && role.trim().toLowerCase().includes('sales'));
}

export function isDesignerRole(role?: string | null): boolean {
  return Boolean(role && role.trim().toLowerCase().includes('designer'));
}

function getPrimaryMockupUrl(design: any): string {
  if (!design) return '';
  const legacyMockups = Array.isArray(design.mockups) ? design.mockups : [];
  const otherMockups = Array.isArray(design.otherMockups) ? design.otherMockups : [];
  return (
    design.frontMockupUrl ||
    legacyMockups[0]?.url ||
    design.mockupUrl ||
    design.url ||
    design.backMockupUrl ||
    otherMockups[0]?.url ||
    ''
  );
}

function diffDesignerRackChanges(
  oldRack: any[],
  newRack: any[]
): {
  isReadFlagOnly: boolean;
  actionTitle: string;
  actionSummary: string;
  designTitle?: string;
  mockupUrl?: string;
  changeDetails: ActivityChangeDetail[];
} | null {
  if (!Array.isArray(newRack)) return null;
  const prev = Array.isArray(oldRack) ? oldRack : [];

  const prevById = new Map<string, any>();
  prev.forEach((item) => {
    if (item && item.id) prevById.set(item.id, item);
  });

  const nextById = new Map<string, any>();
  newRack.forEach((item) => {
    if (item && item.id) nextById.set(item.id, item);
  });

  // 1. Check for newly added item(s)
  const addedItems = newRack.filter((item) => item && item.id && !prevById.has(item.id));
  if (addedItems.length > 0) {
    const added = addedItems[addedItems.length - 1];
    const title = added.title || added.name || 'Untitled Design';
    const details: string[] = [];
    const changeDetails: ActivityChangeDetail[] = [
      {
        field: 'Design Title',
        after: title,
        summary: `Added new design "${title}"`
      }
    ];
    if (added.garmentColor || added.color) {
      const color = added.garmentColor || added.color;
      details.push(color);
      changeDetails.push({
        field: 'Garment Color',
        after: color,
        summary: `Garment Color: ${color}`
      });
    }
    if (added.sizingAdjustment && added.sizingAdjustment !== 'True to Size') {
      details.push(added.sizingAdjustment);
      changeDetails.push({
        field: 'Sizing Adjustment',
        after: added.sizingAdjustment,
        summary: `Sizing: ${added.sizingAdjustment}`
      });
    }
    if (added.frontMockupUrl) {
      changeDetails.push({
        field: 'Front Mock-up',
        after: 'Uploaded',
        summary: 'Uploaded Front Mock-up'
      });
    }
    if (added.backMockupUrl) {
      changeDetails.push({
        field: 'Back Mock-up',
        after: 'Uploaded',
        summary: 'Uploaded Back Mock-up'
      });
    }
    if (Array.isArray(added.logos) && added.logos.length > 0) {
      changeDetails.push({
        field: 'Logo Files',
        after: `${added.logos.length} file(s)`,
        summary: `Attached ${added.logos.length} logo file(s)`
      });
    }
    const suffix = details.length > 0 ? ` (${details.join(' · ')})` : '';
    return {
      isReadFlagOnly: false,
      actionTitle: 'Added to Designer Rack',
      actionSummary: `Added new design "${title}"${suffix} to the Designer Rack`,
      designTitle: title,
      mockupUrl: getPrimaryMockupUrl(added),
      changeDetails
    };
  }

  // 2. Check for removed item(s)
  const removedItems = prev.filter((item) => item && item.id && !nextById.has(item.id));
  if (removedItems.length > 0) {
    const removed = removedItems[0];
    const title = removed.title || removed.name || 'Untitled Design';
    return {
      isReadFlagOnly: false,
      actionTitle: 'Removed from Designer Rack',
      actionSummary: `Removed design "${title}" from the Designer Rack`,
      designTitle: title,
      mockupUrl: getPrimaryMockupUrl(removed),
      changeDetails: [
        {
          field: 'Removed Design',
          before: title,
          after: 'Deleted',
          summary: `Removed design "${title}" from the Designer Rack`
        }
      ]
    };
  }

  // 3. Check for modified item(s)
  let onlyReadFlagsChanged = true;
  for (const nextItem of newRack) {
    if (!nextItem || !nextItem.id) continue;
    const oldItem = prevById.get(nextItem.id);
    if (!oldItem) continue;

    const title = nextItem.title || nextItem.name || oldItem.title || oldItem.name || 'Untitled Design';
    const oldTitle = oldItem.title || oldItem.name || '';
    const changes: string[] = [];
    const changeDetails: ActivityChangeDetail[] = [];

    if ((nextItem.title || '') !== (oldItem.title || '') && oldTitle) {
      changes.push(`renamed "${oldTitle}" to "${title}"`);
      changeDetails.push({
        field: 'Design Title',
        before: oldTitle,
        after: title,
        summary: `Renamed design from "${oldTitle}" to "${title}"`
      });
    }
    if (!oldItem.finalDesignApproved && nextItem.finalDesignApproved) {
      changes.push('approved Final Design');
      changeDetails.push({
        field: 'Final Design Approval',
        before: 'Not Approved',
        after: 'Approved',
        summary: `Approved Final Design for "${title}"`
      });
    } else if (oldItem.finalDesignApproved && !nextItem.finalDesignApproved) {
      changes.push('unmarked Final Design approval');
      changeDetails.push({
        field: 'Final Design Approval',
        before: 'Approved',
        after: 'Not Approved',
        summary: `Removed Final Design approval for "${title}"`
      });
    }
    if (!oldItem.approvedForOrder && nextItem.approvedForOrder) {
      changes.push('approved for Order');
      changeDetails.push({
        field: 'Approved for Order',
        before: 'Not Approved',
        after: 'Approved',
        summary: `Marked "${title}" as Approved for Order`
      });
    } else if (oldItem.approvedForOrder && !nextItem.approvedForOrder) {
      changes.push('unmarked Approved for Order');
      changeDetails.push({
        field: 'Approved for Order',
        before: 'Approved',
        after: 'Not Approved',
        summary: `Unmarked "${title}" as Approved for Order`
      });
    }
    if ((nextItem.frontMockupUrl || '') !== (oldItem.frontMockupUrl || '')) {
      const msg = nextItem.frontMockupUrl ? 'uploaded Front Mock-up' : 'removed Front Mock-up';
      changes.push(msg);
      changeDetails.push({
        field: 'Front Mock-up',
        before: oldItem.frontMockupUrl ? 'Existing Image' : 'None',
        after: nextItem.frontMockupUrl ? 'Uploaded New Image' : 'Removed',
        summary: `${nextItem.frontMockupUrl ? 'Uploaded' : 'Removed'} Front Mock-up on "${title}"`
      });
    }
    if ((nextItem.backMockupUrl || '') !== (oldItem.backMockupUrl || '')) {
      const msg = nextItem.backMockupUrl ? 'uploaded Back Mock-up' : 'removed Back Mock-up';
      changes.push(msg);
      changeDetails.push({
        field: 'Back Mock-up',
        before: oldItem.backMockupUrl ? 'Existing Image' : 'None',
        after: nextItem.backMockupUrl ? 'Uploaded New Image' : 'Removed',
        summary: `${nextItem.backMockupUrl ? 'Uploaded' : 'Removed'} Back Mock-up on "${title}"`
      });
    }
    const oldOtherLen = Array.isArray(oldItem.otherMockups) ? oldItem.otherMockups.length : 0;
    const nextOtherLen = Array.isArray(nextItem.otherMockups) ? nextItem.otherMockups.length : 0;
    if (nextOtherLen !== oldOtherLen) {
      const summary =
        nextOtherLen > oldOtherLen
          ? `Added ${nextOtherLen - oldOtherLen} additional mock-up(s)`
          : 'Removed an additional mock-up';
      changes.push(
        nextOtherLen > oldOtherLen
          ? `added ${nextOtherLen - oldOtherLen} mock-up(s)`
          : 'removed a mock-up'
      );
      changeDetails.push({
        field: 'Additional Mock-ups',
        before: `${oldOtherLen} image(s)`,
        after: `${nextOtherLen} image(s)`,
        summary
      });
    }
    const oldLogosLen = Array.isArray(oldItem.logos) ? oldItem.logos.length : 0;
    const nextLogosLen = Array.isArray(nextItem.logos) ? nextItem.logos.length : 0;
    if (nextLogosLen !== oldLogosLen) {
      const summary =
        nextLogosLen > oldLogosLen
          ? `Uploaded ${nextLogosLen - oldLogosLen} logo file(s)`
          : 'Removed a logo file';
      changes.push(
        nextLogosLen > oldLogosLen
          ? `uploaded ${nextLogosLen - oldLogosLen} logo file(s)`
          : 'removed a logo file'
      );
      changeDetails.push({
        field: 'Logo Files',
        before: `${oldLogosLen} file(s)`,
        after: `${nextLogosLen} file(s)`,
        summary
      });
    }
    if ((nextItem.garmentColor || '') !== (oldItem.garmentColor || '')) {
      changes.push(
        nextItem.garmentColor
          ? `set garment color to "${nextItem.garmentColor}"`
          : 'cleared garment color'
      );
      changeDetails.push({
        field: 'Garment Color',
        before: oldItem.garmentColor || 'None',
        after: nextItem.garmentColor || 'None',
        summary: nextItem.garmentColor
          ? `Set garment color to "${nextItem.garmentColor}"`
          : 'Cleared garment color'
      });
    }
    if ((nextItem.sizingAdjustment || 'True to Size') !== (oldItem.sizingAdjustment || 'True to Size')) {
      changes.push(`set sizing to "${nextItem.sizingAdjustment || 'True to Size'}"`);
      changeDetails.push({
        field: 'Sizing Adjustment',
        before: oldItem.sizingAdjustment || 'True to Size',
        after: nextItem.sizingAdjustment || 'True to Size',
        summary: `Changed sizing adjustment to "${nextItem.sizingAdjustment || 'True to Size'}"`
      });
    }
    if ((nextItem.garmentSourcingLink || '') !== (oldItem.garmentSourcingLink || '')) {
      changes.push('updated garment sourcing link');
      changeDetails.push({
        field: 'Garment Sourcing Link',
        before: oldItem.garmentSourcingLink || 'None',
        after: nextItem.garmentSourcingLink || 'None',
        summary: 'Updated garment sourcing link'
      });
    }
    if ((nextItem.psdDriveLink || '') !== (oldItem.psdDriveLink || '')) {
      changes.push('updated PSD / Drive link');
      changeDetails.push({
        field: 'PSD / Drive Link',
        before: oldItem.psdDriveLink || 'None',
        after: nextItem.psdDriveLink || 'None',
        summary: 'Updated PSD / Drive link'
      });
    }

    if (changes.length > 0) {
      onlyReadFlagsChanged = false;
      const formattedChanges =
        changes[0].charAt(0).toUpperCase() + changes[0].slice(1) + (changes.length > 1 ? `, ${changes.slice(1).join(', ')}` : '');
      return {
        isReadFlagOnly: false,
        actionTitle: 'Designer Rack Updated',
        actionSummary: `${formattedChanges} on "${title}"`,
        designTitle: title,
        mockupUrl: getPrimaryMockupUrl(nextItem),
        changeDetails
      };
    }

    const readFlagChanged =
      Boolean(nextItem.finalDesignApprovedNotificationRead) !==
        Boolean(oldItem.finalDesignApprovedNotificationRead) ||
      Boolean(nextItem.approvedForOrderNotificationRead) !==
        Boolean(oldItem.approvedForOrderNotificationRead);
    if (!readFlagChanged && JSON.stringify(nextItem) !== JSON.stringify(oldItem)) {
      onlyReadFlagsChanged = false;
      return {
        isReadFlagOnly: false,
        actionTitle: 'Designer Rack Updated',
        actionSummary: `Updated design "${title}" in the Designer Rack`,
        designTitle: title,
        mockupUrl: getPrimaryMockupUrl(nextItem),
        changeDetails: [
          {
            field: 'Design Details',
            summary: `Updated design "${title}" in the Designer Rack`
          }
        ]
      };
    }
  }

  if (onlyReadFlagsChanged && prev.length > 0) {
    return {
      isReadFlagOnly: true,
      actionTitle: '',
      actionSummary: '',
      changeDetails: []
    };
  }

  // Fallback when previous cache was not yet loaded
  const latestItem = newRack[newRack.length - 1];
  const fallbackTitle = latestItem?.title || latestItem?.name || 'Design';
  return {
    isReadFlagOnly: false,
    actionTitle: 'Designer Rack Updated',
    actionSummary: `Updated "${fallbackTitle}" in the Designer Rack`,
    designTitle: fallbackTitle,
    mockupUrl: getPrimaryMockupUrl(latestItem),
    changeDetails: [
      {
        field: 'Designer Rack',
        summary: `Updated "${fallbackTitle}" in the Designer Rack`
      }
    ]
  };
}

function isPassiveOrderWrite(data: Record<string, any>): boolean {
  const keys = Object.keys(data).filter((k) => k !== 'lastActivityPopup');
  if (keys.length === 0) return true;
  const passiveKeys = new Set([
    'paymentRead',
    'hasUnreadCustomerUpdate',
    'hasUnreadWebLead',
    'orderIndex'
  ]);
  return keys.every((k) => passiveKeys.has(k));
}

function isPassiveCustomerWrite(data: Record<string, any>): boolean {
  const keys = Object.keys(data).filter((k) => k !== 'lastActivityPopup');
  if (keys.length === 0) return true;
  const passiveKeys = new Set(['hasUnreadCreation', 'hasUnreadSupport']);
  return keys.every((k) => passiveKeys.has(k));
}

const ORDER_STAGE_LABELS: Record<number, string> = {
  0: '0 - Quote',
  1: '1 - Approved / In Queue',
  2: '2 - Inventory Ordered',
  3: '3 - Production Prep',
  4: '4 - In Production',
  5: '5 - Packing & QC',
  6: '6 - Shipped / Ready',
  7: '7 - Received / Complete'
};

function getItemTotalQty(item: any): number {
  if (!item) return 0;
  if (typeof item.totalQty === 'number') return item.totalQty;
  if (typeof item.qty === 'number') return item.qty;
  if (item.sizes && typeof item.sizes === 'object') {
    return Object.values(item.sizes).reduce((sum: number, v: any) => sum + (Number(v) || 0), 0);
  }
  return 0;
}

function diffOrderItems(prevItems: any[], nextItems: any[]): ActivityChangeDetail[] {
  const details: ActivityChangeDetail[] = [];
  const prev = Array.isArray(prevItems) ? prevItems : [];
  const next = Array.isArray(nextItems) ? nextItems : [];

  const prevById = new Map<string, any>();
  prev.forEach((it, idx) => {
    const key = String(it?.id ?? `idx_${idx}`);
    prevById.set(key, it);
  });

  const nextById = new Map<string, any>();
  next.forEach((it, idx) => {
    const key = String(it?.id ?? `idx_${idx}`);
    nextById.set(key, it);
  });

  // Added items
  nextById.forEach((it, key) => {
    if (!prevById.has(key)) {
      const name = it?.name || it?.style || 'Garment Item';
      const color = it?.color ? ` (${it.color})` : '';
      const qty = getItemTotalQty(it);
      details.push({
        field: 'Added Line Item',
        after: `${name}${color} · Qty ${qty}`,
        summary: `Added line item "${name}${color}" (Qty: ${qty})`
      });
    }
  });

  // Removed items
  prevById.forEach((it, key) => {
    if (!nextById.has(key)) {
      const name = it?.name || it?.style || 'Garment Item';
      const color = it?.color ? ` (${it.color})` : '';
      const qty = getItemTotalQty(it);
      details.push({
        field: 'Removed Line Item',
        before: `${name}${color} · Qty ${qty}`,
        after: 'Removed',
        summary: `Removed line item "${name}${color}"`
      });
    }
  });

  // Modified items
  nextById.forEach((nextIt, key) => {
    const prevIt = prevById.get(key);
    if (!prevIt) return;
    const name = nextIt?.name || prevIt?.name || 'Garment Item';
    const prevQty = getItemTotalQty(prevIt);
    const nextQty = getItemTotalQty(nextIt);

    if ((prevIt?.name || '') !== (nextIt?.name || '')) {
      details.push({
        field: `Item Name`,
        before: prevIt?.name || 'Untitled',
        after: nextIt?.name || 'Untitled',
        summary: `Renamed line item from "${prevIt?.name || 'Untitled'}" to "${nextIt?.name || 'Untitled'}"`
      });
    }
    if ((prevIt?.color || '') !== (nextIt?.color || '')) {
      details.push({
        field: `${name} · Color`,
        before: prevIt?.color || 'None',
        after: nextIt?.color || 'None',
        summary: `Changed color on "${name}" from "${prevIt?.color || 'None'}" to "${nextIt?.color || 'None'}"`
      });
    }
    if (prevQty !== nextQty || JSON.stringify(prevIt?.sizes || {}) !== JSON.stringify(nextIt?.sizes || {})) {
      details.push({
        field: `${name} · Sizes / Qty`,
        before: `${prevQty} pcs`,
        after: `${nextQty} pcs`,
        summary: `Updated quantities/sizes on "${name}" (${prevQty} → ${nextQty} pcs)`
      });
    }
    if (String(prevIt?.price ?? '') !== String(nextIt?.price ?? '')) {
      details.push({
        field: `${name} · Unit Price`,
        before: prevIt?.price ? `$${prevIt.price}` : '$0',
        after: nextIt?.price ? `$${nextIt.price}` : '$0',
        summary: `Updated unit price on "${name}" (${prevIt?.price ? `$${prevIt.price}` : '$0'} → ${nextIt?.price ? `$${nextIt.price}` : '$0'})`
      });
    }
    if ((prevIt?.itemSupplierLink || '') !== (nextIt?.itemSupplierLink || '')) {
      details.push({
        field: `${name} · Supplier Link`,
        before: prevIt?.itemSupplierLink ? 'Previous Link' : 'None',
        after: nextIt?.itemSupplierLink ? 'Updated Link' : 'Cleared',
        summary: `Updated supplier link on "${name}"`
      });
    }
    if (
      (prevIt?.image || '') !== (nextIt?.image || '') ||
      (prevIt?.backImage || '') !== (nextIt?.backImage || '')
    ) {
      details.push({
        field: `${name} · Mock-up / Artwork`,
        summary: `Updated mock-up image on "${name}"`
      });
    }
  });

  return details;
}

function describeOrderChanges(
  op: 'create' | 'update' | 'delete',
  data: Record<string, any> | undefined,
  orderTitle: string,
  prevOrder?: Record<string, any>
): { actionSummary: string; changeDetails: ActivityChangeDetail[] } {
  if (op === 'create') {
    const title = data?.title || orderTitle || 'New Order';
    const itemCount = Array.isArray(data?.items) ? data.items.length : 0;
    const changeDetails: ActivityChangeDetail[] = [
      {
        field: 'New Order Created',
        after: title,
        summary: `Created order "${title}"${itemCount > 0 ? ` with ${itemCount} line item(s)` : ''}`
      }
    ];
    if (data?.customer || data?.customerName) {
      changeDetails.push({
        field: 'Customer',
        after: data.customer || data.customerName,
        summary: `Assigned to customer "${data.customer || data.customerName}"`
      });
    }
    return {
      actionSummary: `Created new order "${title}"`,
      changeDetails
    };
  }
  if (op === 'delete') {
    return {
      actionSummary: `Deleted ${orderTitle}`,
      changeDetails: [
        {
          field: 'Order Deleted',
          before: orderTitle,
          after: 'Deleted',
          summary: `Deleted order "${orderTitle}"`
        }
      ]
    };
  }
  if (!data) {
    return {
      actionSummary: `Updated ${orderTitle}`,
      changeDetails: [{ field: 'Order', summary: `Updated ${orderTitle}` }]
    };
  }

  const keys = Object.keys(data).filter((k) => k !== 'lastActivityPopup' && k !== 'updatedAt');
  const parts: string[] = [];
  const changeDetails: ActivityChangeDetail[] = [];
  const prev = prevOrder || {};

  // 1. Order Title
  if ('title' in data && data.title && (!prevOrder || data.title !== prev.title)) {
    parts.push(`renamed order to "${data.title}"`);
    changeDetails.push({
      field: 'Order Title',
      ...(prev.title ? { before: String(prev.title) } : {}),
      after: String(data.title),
      summary: prev.title
        ? `Renamed order from "${prev.title}" to "${data.title}"`
        : `Set order title to "${data.title}"`
    });
  }

  // 2. Pipeline Status / Stage
  if (
    ('statusIndex' in data && (!prevOrder || data.statusIndex !== prev.statusIndex)) ||
    ('status' in data && (!prevOrder || data.status !== prev.status)) ||
    ('lane' in data && (!prevOrder || data.lane !== prev.lane))
  ) {
    const prevStage =
      prev.status ||
      prev.lane ||
      (typeof prev.statusIndex === 'number' ? ORDER_STAGE_LABELS[prev.statusIndex] || `Stage ${prev.statusIndex}` : undefined);
    const nextStage =
      data.status ||
      data.lane ||
      (typeof data.statusIndex === 'number' ? ORDER_STAGE_LABELS[data.statusIndex] || `Stage ${data.statusIndex}` : 'Updated Stage');
    parts.push(`changed status to "${nextStage}"`);
    changeDetails.push({
      field: 'Pipeline Status',
      ...(prevStage ? { before: String(prevStage) } : {}),
      after: String(nextStage),
      summary: prevStage
        ? `Changed pipeline status from "${prevStage}" to "${nextStage}"`
        : `Changed pipeline status to "${nextStage}"`
    });
  }

  // 3. Due Date / Target Completion Date
  const nextDue = data.date ?? data.dueDate ?? data.targetCompletionDate;
  const prevDue = prev.date ?? prev.dueDate ?? prev.targetCompletionDate;
  if (
    ('date' in data || 'dueDate' in data || 'targetCompletionDate' in data) &&
    (!prevOrder || String(nextDue || '') !== String(prevDue || ''))
  ) {
    parts.push(`updated due date to ${nextDue || 'TBD'}`);
    changeDetails.push({
      field: 'Due Date',
      ...(prevDue ? { before: String(prevDue) } : {}),
      after: String(nextDue || 'Cleared'),
      summary: prevDue
        ? `Changed due date from "${prevDue}" to "${nextDue || 'Cleared'}"`
        : `Set due date to "${nextDue || 'TBD'}"`
    });
  }

  // 4. Core Flags (VIP, Artist Box, High Priority)
  if ('isMvp' in data && (!prevOrder || Boolean(data.isMvp) !== Boolean(prev.isMvp))) {
    parts.push(data.isMvp ? 'marked as VIP' : 'removed VIP flag');
    changeDetails.push({
      field: 'VIP Flag',
      before: prev.isMvp ? 'Yes' : 'No',
      after: data.isMvp ? 'Yes' : 'No',
      summary: data.isMvp ? 'Enabled VIP status on order' : 'Disabled VIP status on order'
    });
  }
  if ('getsBox' in data && (!prevOrder || Boolean(data.getsBox) !== Boolean(prev.getsBox))) {
    parts.push(data.getsBox ? 'enabled Artist Box' : 'removed Artist Box');
    changeDetails.push({
      field: 'Artist Box',
      before: prev.getsBox ? 'Yes' : 'No',
      after: data.getsBox ? 'Yes' : 'No',
      summary: data.getsBox ? 'Enabled Artist Box for order' : 'Disabled Artist Box for order'
    });
  }
  const nextHp = data.highPriority ?? data.isHighPriority;
  const prevHp = prev.highPriority ?? prev.isHighPriority;
  if (
    ('highPriority' in data || 'isHighPriority' in data) &&
    (!prevOrder || Boolean(nextHp) !== Boolean(prevHp))
  ) {
    parts.push(nextHp ? 'marked as High Priority' : 'removed High Priority');
    changeDetails.push({
      field: 'High Priority',
      before: prevHp ? 'High Priority' : 'Normal',
      after: nextHp ? 'High Priority' : 'Normal',
      summary: nextHp ? 'Marked order as High Priority' : 'Removed High Priority flag'
    });
  }

  // 5. Individual Info (Gender / Size)
  if ('personalInfo' in data && data.personalInfo) {
    const prevPi = prev.personalInfo || {};
    const nextPi = data.personalInfo || {};
    if (
      !prevOrder ||
      Boolean(prevPi.isIndividual) !== Boolean(nextPi.isIndividual) ||
      (prevPi.gender || '') !== (nextPi.gender || '') ||
      (prevPi.size || '') !== (nextPi.size || '')
    ) {
      const beforeStr = prevPi.isIndividual
        ? `Individual (${[prevPi.gender, prevPi.size].filter(Boolean).join(' · ') || 'Unspecified'})`
        : 'Not Individual';
      const afterStr = nextPi.isIndividual
        ? `Individual (${[nextPi.gender, nextPi.size].filter(Boolean).join(' · ') || 'Unspecified'})`
        : 'Not Individual';
      parts.push(`updated individual specs (${afterStr})`);
      changeDetails.push({
        field: 'Individual Specs',
        ...(prevOrder ? { before: beforeStr } : {}),
        after: afterStr,
        summary: `Updated individual specs to ${afterStr}`
      });
    }
  }

  // 6. Customer Assignment / Transfer
  if (
    ('customerId' in data && (!prevOrder || data.customerId !== prev.customerId)) ||
    ('customer' in data && (!prevOrder || data.customer !== prev.customer))
  ) {
    const prevCustName = prev.customer || (prev.customerId && customerCache.get(prev.customerId)?.name) || '';
    const nextCustName = data.customer || (data.customerId && customerCache.get(data.customerId)?.name) || '';
    if (nextCustName && nextCustName !== prevCustName) {
      parts.push(`assigned customer "${nextCustName}"`);
      changeDetails.push({
        field: 'Customer Account',
        ...(prevCustName ? { before: String(prevCustName) } : {}),
        after: String(nextCustName),
        summary: prevCustName
          ? `Transferred order from "${prevCustName}" to "${nextCustName}"`
          : `Assigned order to "${nextCustName}"`
      });
    }
  }

  // 7. Payment Status, Discounts & Free Shipping
  if ('paymentStatus' in data && (!prevOrder || data.paymentStatus !== prev.paymentStatus)) {
    parts.push(`set payment status to "${data.paymentStatus}"`);
    changeDetails.push({
      field: 'Payment Status',
      ...(prev.paymentStatus ? { before: String(prev.paymentStatus) } : {}),
      after: String(data.paymentStatus),
      summary: prev.paymentStatus
        ? `Changed payment status from "${prev.paymentStatus}" to "${data.paymentStatus}"`
        : `Set payment status to "${data.paymentStatus}"`
    });
  }
  if ('discountCode' in data && (!prevOrder || (data.discountCode || '') !== (prev.discountCode || ''))) {
    parts.push(data.discountCode ? `applied discount code "${data.discountCode}"` : 'removed discount code');
    changeDetails.push({
      field: 'Discount Code',
      before: prev.discountCode || 'None',
      after: data.discountCode || 'None',
      summary: data.discountCode
        ? `Set discount code to "${data.discountCode}"`
        : 'Cleared discount code'
    });
  }
  if ('discountAmount' in data && (!prevOrder || Number(data.discountAmount || 0) !== Number(prev.discountAmount || 0))) {
    parts.push(`set discount amount to $${Number(data.discountAmount || 0).toFixed(2)}`);
    changeDetails.push({
      field: 'Discount Amount',
      before: `$${Number(prev.discountAmount || 0).toFixed(2)}`,
      after: `$${Number(data.discountAmount || 0).toFixed(2)}`,
      summary: `Changed discount amount from $${Number(prev.discountAmount || 0).toFixed(2)} to $${Number(data.discountAmount || 0).toFixed(2)}`
    });
  }
  if ('freeShipping' in data && (!prevOrder || Boolean(data.freeShipping) !== Boolean(prev.freeShipping))) {
    parts.push(data.freeShipping ? 'enabled Free Shipping' : 'disabled Free Shipping');
    changeDetails.push({
      field: 'Free Shipping',
      before: prev.freeShipping ? 'Enabled' : 'Disabled',
      after: data.freeShipping ? 'Enabled' : 'Disabled',
      summary: data.freeShipping ? 'Enabled Free Shipping for order' : 'Disabled Free Shipping for order'
    });
  }

  // 8. Fulfillment & Shipping Address / Destinations
  if ('fulfillmentType' in data && (!prevOrder || (data.fulfillmentType || '') !== (prev.fulfillmentType || ''))) {
    parts.push(`set fulfillment to "${data.fulfillmentType}"`);
    changeDetails.push({
      field: 'Fulfillment Type',
      ...(prev.fulfillmentType ? { before: String(prev.fulfillmentType) } : {}),
      after: String(data.fulfillmentType),
      summary: `Set fulfillment type to "${data.fulfillmentType}"`
    });
  }
  if ('shippingAddress' in data && data.shippingAddress) {
    const prevAddr = prev.shippingAddress || {};
    const nextAddr = data.shippingAddress || {};
    const prevFormatted = [prevAddr.street1, prevAddr.city, prevAddr.state, prevAddr.zip].filter(Boolean).join(', ');
    const nextFormatted = [nextAddr.street1, nextAddr.city, nextAddr.state, nextAddr.zip].filter(Boolean).join(', ');
    if (!prevOrder || prevFormatted !== nextFormatted || (prevAddr.name || '') !== (nextAddr.name || '')) {
      parts.push('updated shipping address');
      changeDetails.push({
        field: 'Shipping Address',
        ...(prevFormatted ? { before: prevFormatted } : {}),
        after: nextFormatted || 'Updated Address',
        summary: nextFormatted
          ? `Updated shipping address to "${nextFormatted}"`
          : 'Updated shipping destination details'
      });
    }
  }
  if (
    ('trackingNumber' in data && (!prevOrder || (data.trackingNumber || '') !== (prev.trackingNumber || ''))) ||
    ('trackingCarrier' in data && (!prevOrder || (data.trackingCarrier || '') !== (prev.trackingCarrier || '')))
  ) {
    const nextTrack = [data.trackingCarrier || prev.trackingCarrier, data.trackingNumber || prev.trackingNumber]
      .filter(Boolean)
      .join(' ');
    if (nextTrack) {
      parts.push(`updated tracking (${nextTrack})`);
      changeDetails.push({
        field: 'Order Tracking',
        ...(prev.trackingNumber ? { before: String(prev.trackingNumber) } : {}),
        after: nextTrack,
        summary: `Updated tracking info to ${nextTrack}`
      });
    }
  }

  // 9. Garment Line Items
  if ('items' in data && Array.isArray(data.items)) {
    if (prevOrder && Array.isArray(prev.items)) {
      const itemDiffs = diffOrderItems(prev.items, data.items);
      if (itemDiffs.length > 0) {
        parts.push(`updated garment items (${itemDiffs.length} change${itemDiffs.length === 1 ? '' : 's'})`);
        changeDetails.push(...itemDiffs);
      } else if (keys.length === 1 && keys[0] === 'items') {
        const count = data.items.length;
        parts.push(`updated garment items (${count} item${count === 1 ? '' : 's'})`);
        changeDetails.push({
          field: 'Garment Line Items',
          after: `${count} item(s)`,
          summary: `Updated garment line items (${count} item${count === 1 ? '' : 's'})`
        });
      }
    } else {
      const count = data.items.length;
      parts.push(`updated garment items (${count} item${count === 1 ? '' : 's'})`);
      changeDetails.push({
        field: 'Garment Line Items',
        after: `${count} item(s)`,
        summary: `Updated garment line items (${count} item${count === 1 ? '' : 's'})`
      });
    }
  }

  // 10. Packing Boxes / Shipments
  if ('boxes' in data && Array.isArray(data.boxes)) {
    const prevBoxesLen = Array.isArray(prev.boxes) ? prev.boxes.length : 0;
    const nextBoxesLen = data.boxes.length;
    if (!prevOrder || JSON.stringify(prev.boxes) !== JSON.stringify(data.boxes)) {
      parts.push(`updated packing boxes (${nextBoxesLen} box${nextBoxesLen === 1 ? '' : 'es'})`);
      changeDetails.push({
        field: 'Packing Boxes',
        ...(prevOrder ? { before: `${prevBoxesLen} box(es)` } : {}),
        after: `${nextBoxesLen} box(es)`,
        summary: `Updated packing boxes / shipments (${nextBoxesLen} box${nextBoxesLen === 1 ? '' : 'es'})`
      });
    }
  }

  // 11. Notes & Activity Log
  if (
    ('orderNotes' in data && (!prevOrder || (data.orderNotes || '') !== (prev.orderNotes || ''))) ||
    ('notes' in data && (!prevOrder || (data.notes || '') !== (prev.notes || ''))) ||
    ('internalNotes' in data && (!prevOrder || (data.internalNotes || '') !== (prev.internalNotes || '')))
  ) {
    parts.push('updated order notes');
    changeDetails.push({
      field: 'Order Notes',
      summary: 'Updated order notes / instructions'
    });
  }

  // Also capture explicit activity log message if OrderDetail appended one
  if ('activities' in data && Array.isArray(data.activities) && data.activities.length > 0) {
    const latestAct = data.activities[0];
    const prevLatestId = Array.isArray(prev.activities) && prev.activities[0]?.id;
    if (latestAct?.message && latestAct.id !== prevLatestId && changeDetails.length === 0) {
      parts.push(latestAct.message);
      changeDetails.push({
        field: 'Order Activity',
        summary: String(latestAct.message)
      });
    }
  }

  if (parts.length === 0) {
    const cleanKeys = keys.filter((k) => k !== 'activities').slice(0, 4).join(', ');
    const fallbackSummary = cleanKeys ? `Updated order (${cleanKeys})` : `Updated ${orderTitle}`;
    return {
      actionSummary: fallbackSummary,
      changeDetails: [
        {
          field: cleanKeys || 'Order Details',
          summary: fallbackSummary
        }
      ]
    };
  }

  const joined = parts.join(', ');
  return {
    actionSummary: joined.charAt(0).toUpperCase() + joined.slice(1),
    changeDetails
  };
}

function describeCustomerChanges(
  op: 'create' | 'update' | 'delete',
  data: Record<string, any> | undefined,
  customerName: string,
  prevCustomer?: Record<string, any>
): { actionSummary: string; changeDetails: ActivityChangeDetail[] } {
  if (op === 'create') {
    return {
      actionSummary: `Created customer profile "${customerName}"`,
      changeDetails: [
        {
          field: 'Customer Created',
          after: customerName,
          summary: `Created customer profile "${customerName}"`
        }
      ]
    };
  }
  if (op === 'delete') {
    return {
      actionSummary: `Deleted customer "${customerName}"`,
      changeDetails: [
        {
          field: 'Customer Deleted',
          before: customerName,
          after: 'Deleted',
          summary: `Deleted customer "${customerName}"`
        }
      ]
    };
  }
  if (!data) {
    return {
      actionSummary: `Updated customer "${customerName}"`,
      changeDetails: [{ field: 'Customer Profile', summary: `Updated customer "${customerName}"` }]
    };
  }

  const prev = prevCustomer || {};
  const parts: string[] = [];
  const changeDetails: ActivityChangeDetail[] = [];

  if ('assets' in data && Array.isArray(data.assets)) {
    const prevLen = Array.isArray(prev.assets) ? prev.assets.length : undefined;
    const nextLen = data.assets.length;
    parts.push(`updated Asset Vault (${nextLen} file${nextLen === 1 ? '' : 's'})`);
    changeDetails.push({
      field: 'Asset Vault',
      ...(prevLen !== undefined ? { before: `${prevLen} file(s)` } : {}),
      after: `${nextLen} file(s)`,
      summary: `Updated Customer Asset Vault (${nextLen} file${nextLen === 1 ? '' : 's'})`
    });
  }
  if ('savedDesigns' in data && Array.isArray(data.savedDesigns)) {
    const prevLen = Array.isArray(prev.savedDesigns) ? prev.savedDesigns.length : undefined;
    const nextLen = data.savedDesigns.length;
    parts.push(`updated Saved Designs library (${nextLen} design${nextLen === 1 ? '' : 's'})`);
    changeDetails.push({
      field: 'Saved Designs',
      ...(prevLen !== undefined ? { before: `${prevLen} design(s)` } : {}),
      after: `${nextLen} design(s)`,
      summary: `Updated Saved Designs library (${nextLen} design${nextLen === 1 ? '' : 's'})`
    });
  }
  if ('colorMockups' in data || 'logoPlacements' in data) {
    parts.push('updated custom garment mock-ups / placements');
    changeDetails.push({
      field: 'Garment Mock-ups & Placements',
      summary: 'Updated custom garment mock-ups or logo placement guides'
    });
  }
  if ('company' in data || 'contactName' in data || 'email' in data || 'phone' in data || 'address' in data) {
    parts.push('updated contact / company info');
    changeDetails.push({
      field: 'Contact & Company Details',
      summary: `Updated contact / company details for ${customerName}`
    });
  }
  if ('notes' in data) {
    parts.push('updated customer notes');
    changeDetails.push({
      field: 'Customer Notes',
      summary: 'Updated customer profile notes'
    });
  }

  if (parts.length === 0) {
    return {
      actionSummary: `Updated customer profile for ${customerName}`,
      changeDetails: [
        {
          field: 'Customer Profile',
          summary: `Updated customer profile for ${customerName}`
        }
      ]
    };
  }
  const joined = parts.join(', ');
  return {
    actionSummary: joined.charAt(0).toUpperCase() + joined.slice(1),
    changeDetails
  };
}

function describePlatformPathChange(
  collectionName: string,
  docId: string,
  op: 'create' | 'update' | 'delete',
  data: Record<string, any> | undefined
): { targetLabel: string; targetRoute: string; actionSummary: string } {
  if (collectionName === 'settings') {
    if (docId === 'storefront-catalog') {
      const subParts: string[] = [];
      if (data && 'logoPlacements' in data) subParts.push('logo placement guides');
      if (data && 'colorMockups' in data) subParts.push('custom color mock-ups');
      if (data && 'allowedColors' in data) subParts.push('allowed garment colors');
      if (data && 'curatedProducts' in data) subParts.push('curated garments');
      const detail = subParts.length > 0 ? ` (${subParts.join(', ')})` : '';
      return {
        targetLabel: 'Storefront Catalog',
        targetRoute: '/settings',
        actionSummary: `Updated Storefront Catalog settings${detail}`
      };
    }
    if (docId === 'storefront') {
      return {
        targetLabel: 'Storefront Landing Page',
        targetRoute: '/',
        actionSummary: 'Updated Storefront Landing Page content / settings'
      };
    }
    if (docId === 'gallery') {
      return {
        targetLabel: 'Gallery Settings',
        targetRoute: '/gallery',
        actionSummary: 'Updated Gallery page settings'
      };
    }
    if (docId === 'shop' || docId.includes('shop')) {
      return {
        targetLabel: 'Brand Shop Settings',
        targetRoute: '/settings',
        actionSummary: 'Updated Brand Shop settings'
      };
    }
    if (docId === 'thankYouCard') {
      return {
        targetLabel: 'Thank You Card',
        targetRoute: '/settings',
        actionSummary: 'Updated Thank You Card template'
      };
    }
    if (docId === 'boxLabelPresets') {
      return {
        targetLabel: 'Box Label Presets',
        targetRoute: '/settings',
        actionSummary: 'Updated Box Label Presets'
      };
    }
    if (docId === 'dtf_pricing') {
      return {
        targetLabel: 'DTF Pricing',
        targetRoute: '/settings',
        actionSummary: 'Updated DTF Pricing settings'
      };
    }
    if (docId === 'discounts') {
      return {
        targetLabel: 'Discount Codes',
        targetRoute: '/settings',
        actionSummary: 'Updated Discount Codes'
      };
    }
    if (docId === 'signatures') {
      return {
        targetLabel: 'Email Signatures',
        targetRoute: '/settings',
        actionSummary: 'Updated Email Signatures'
      };
    }
    return {
      targetLabel: `Settings (${docId})`,
      targetRoute: '/settings',
      actionSummary: `Updated ${docId} settings`
    };
  }

  if (collectionName === 'gallery_looks') {
    const title = data?.title || data?.name || docId;
    return {
      targetLabel: 'Gallery Lookbook',
      targetRoute: '/gallery',
      actionSummary:
        op === 'delete'
          ? `Removed look "${title}" from Gallery`
          : op === 'create'
            ? `Added new look "${title}" to Gallery`
            : `Updated look "${title}" in Gallery`
    };
  }

  if (collectionName === 'shop_products') {
    const title = data?.title || data?.name || docId;
    return {
      targetLabel: 'Brand Shop',
      targetRoute: '/shop',
      actionSummary:
        op === 'delete'
          ? `Removed product "${title}" from Shop`
          : op === 'create'
            ? `Added product "${title}" to Shop`
            : `Updated product "${title}" in Shop`
    };
  }

  if (collectionName === 'xc_models' || collectionName === 'xc_links') {
    const title = data?.name || data?.title || docId;
    return {
      targetLabel: 'X-Collab',
      targetRoute: '/settings',
      actionSummary: `Updated X-Collab ${collectionName === 'xc_models' ? 'model' : 'link'} "${title}"`
    };
  }

  return {
    targetLabel: collectionName.replace(/_/g, ' '),
    targetRoute: '/dashboard',
    actionSummary: `${op === 'delete' ? 'Removed item from' : 'Updated'} ${collectionName.replace(/_/g, ' ')}`
  };
}

function sanitizePopupEvent(ev: any): ActivityPopupEvent {
  const clean: Record<string, any> = {};
  if (ev && typeof ev === 'object') {
    Object.entries(ev).forEach(([k, v]) => {
      if (v !== undefined) {
        clean[k] = v;
      }
    });
  }
  return clean as ActivityPopupEvent;
}

async function persistPopupEventToSettings(db: Firestore, rawEvent: ActivityPopupEvent) {
  try {
    const event = sanitizePopupEvent(rawEvent);
    const popupsRef = realDoc(db, 'settings', ACTIVITY_POPUPS_DOC_ID);
    const snap = await realGetDoc(popupsRef);
    const existingEvents: ActivityPopupEvent[] =
      snap.exists() && Array.isArray(snap.data()?.events)
        ? snap.data().events.map(sanitizePopupEvent)
        : [];

    // Coalesce if an identical actor + target + category event occurred within the last 1.5 seconds
    const recentIdx = existingEvents.findIndex(
      (e) =>
        e.actorId === event.actorId &&
        e.targetId === event.targetId &&
        e.category === event.category &&
        Math.abs(event.createdAtMs - e.createdAtMs) < 1500
    );

    let nextEvents: ActivityPopupEvent[];
    if (recentIdx !== -1) {
      nextEvents = [...existingEvents];
      nextEvents[recentIdx] = event;
    } else {
      nextEvents = [event, ...existingEvents].slice(0, MAX_STORED_EVENTS);
    }

    await realSetDoc(
      popupsRef,
      {
        events: nextEvents,
        updatedAt: event.createdAt,
        updatedAtMs: event.createdAtMs
      },
      { merge: true }
    );
  } catch (err) {
    // Non-fatal if role lacks direct settings write permission (event is also carried on the order/customer doc)
    console.debug('Could not write to settings/activityPopups:', err);
  }
}

export function prepareTrackedWritePayload(
  db: Firestore,
  docPath: string,
  op: 'create' | 'update' | 'delete',
  data?: Record<string, any>
): {
  enrichedData?: Record<string, any>;
  pendingEvent?: ActivityPopupEvent;
} {
  if (suppressTrackingDepth > 0) {
    return { enrichedData: data };
  }

  // Ignore secondary firebase app (chronotrack) if not default
  if (db?.app?.name && db.app.name !== '[DEFAULT]') {
    return { enrichedData: data };
  }

  const segments = docPath.split('/').filter(Boolean);
  if (segments.length < 2) {
    return { enrichedData: data };
  }

  const collectionName = segments[0];
  const docId = segments[1];

  // Never track internal popup doc or auth user profile sync
  if (collectionName === 'settings' && (docId === ACTIVITY_POPUPS_DOC_ID || docId === 'permissions')) {
    return { enrichedData: data };
  }
  if (collectionName === 'users' || collectionName === 'visitor_sessions' || collectionName === 'active_carts') {
    return { enrichedData: data };
  }

  const actor = currentActor;
  if (!actor || !actor.role) {
    return { enrichedData: data };
  }

  const actorName = actor.name || actor.email?.split('@')[0] || 'Team Member';
  const actorRole = actor.role;
  const isSales = isSalesRole(actorRole);
  const isDesigner = isDesignerRole(actorRole);
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  // CASE 1: Any update/addition to a customer's Designer Rack (by ANY role)
  if (collectionName === 'customers' && data && Array.isArray(data.designerRack)) {
    const cachedCust = customerCache.get(docId);
    const oldRack = cachedCust?.designerRack || [];
    const custName =
      data.company ||
      data.contactName ||
      data.name ||
      cachedCust?.name ||
      'Customer';

    const rackDiff = diffDesignerRackChanges(oldRack, data.designerRack);
    // Update cache immediately so subsequent edits diff against the latest state
    customerCache.set(docId, {
      name: custName,
      designerRack: data.designerRack,
      raw: { ...(cachedCust?.raw || {}), ...data }
    });

    if (rackDiff && !rackDiff.isReadFlagOnly) {
      lastDesignerRackSaveMs = nowMs;
      const event: ActivityPopupEvent = {
        id: `act_rack_${docId}_${nowMs}_${Math.random().toString(36).substring(2, 6)}`,
        category: 'designer_rack',
        actorId: actor.id || actor.uid || actor.email,
        actorName,
        actorEmail: actor.email || '',
        actorRole,
        actionTitle: rackDiff.actionTitle,
        actionSummary: rackDiff.actionSummary,
        ...(rackDiff.changeDetails.length ? { changeDetails: rackDiff.changeDetails } : {}),
        targetType: 'customer_rack',
        targetId: docId,
        targetLabel: custName,
        targetRoute: `/customers/${docId}?rack=open`,
        ...(rackDiff.mockupUrl ? { mockupUrl: rackDiff.mockupUrl } : {}),
        ...(rackDiff.designTitle ? { designTitle: rackDiff.designTitle } : {}),
        createdAt: nowIso,
        createdAtMs: nowMs
      };

      return {
        enrichedData: {
          ...data,
          lastActivityPopup: event
        },
        pendingEvent: event
      };
    }

    return { enrichedData: data };
  }

  // CASE 2: Order changes by Sales role OR Designer role
  if (collectionName === 'orders') {
    if (!isSales && !isDesigner) {
      return { enrichedData: data };
    }
    if (data && isPassiveOrderWrite(data)) {
      return { enrichedData: data };
    }
    // Suppress automatic order item sync that fires immediately (<2.5s) after a Designer Rack save
    if (nowMs - lastDesignerRackSaveMs < 2500 && data && Object.keys(data).length === 1 && 'items' in data) {
      return { enrichedData: data };
    }

    const cachedOrder = orderCache.get(docId);
    const portalId = String(
      data?.portalId || data?.orderNumber || cachedOrder?.portalId || docId.substring(0, 8)
    );
    const rawOrderTitle = data?.title || cachedOrder?.title || `Order #${portalId}`;
    const customerName =
      data?.customer ||
      data?.customerName ||
      data?.contactDetails?.company ||
      data?.contactDetails?.name ||
      cachedOrder?.customerName ||
      '';
    const targetLabel = customerName
      ? `${rawOrderTitle} · ${customerName}`
      : rawOrderTitle;

    const { actionSummary, changeDetails } = describeOrderChanges(
      op,
      data,
      rawOrderTitle,
      cachedOrder?.raw
    );
    const nextMergedOrder = { ...(cachedOrder?.raw || {}), ...(data || {}) };
    if (op !== 'delete') {
      orderCache.set(docId, {
        title: rawOrderTitle,
        portalId,
        customerName,
        customerId: data?.customerId || cachedOrder?.customerId || '',
        raw: nextMergedOrder
      });
    }

    const itemsSource = Array.isArray(data?.items)
      ? data.items
      : Array.isArray(cachedOrder?.raw?.items)
        ? cachedOrder.raw.items
        : [];
    const firstItemImg =
      itemsSource.length > 0
        ? itemsSource[0]?.image || itemsSource[0]?.customizedFrontImage || ''
        : '';

    const event: ActivityPopupEvent = {
      id: `act_ord_${docId}_${nowMs}_${Math.random().toString(36).substring(2, 6)}`,
      category: isSales ? 'sales_order' : 'designer_platform',
      actorId: actor.id || actor.uid || actor.email,
      actorName,
      actorEmail: actor.email || '',
      actorRole,
      actionTitle: isSales ? 'Order Change by Sales' : 'Order Change by Designer',
      actionSummary,
      ...(changeDetails.length ? { changeDetails } : {}),
      targetType: 'order',
      targetId: docId,
      targetLabel,
      targetRoute: `/orders/${docId}`,
      ...(firstItemImg ? { mockupUrl: firstItemImg } : {}),
      createdAt: nowIso,
      createdAtMs: nowMs
    };

    if (op !== 'delete' && data) {
      return {
        enrichedData: {
          ...data,
          lastActivityPopup: event
        },
        pendingEvent: event
      };
    }

    return { enrichedData: data, pendingEvent: event };
  }

  // CASE 3: Designer role changes to anything else on the platform (Customers, Settings, Gallery, Shop, X-Collab, etc.)
  if (isDesigner) {
    if (collectionName === 'customers') {
      if (data && isPassiveCustomerWrite(data)) {
        return { enrichedData: data };
      }
      const cachedCust = customerCache.get(docId);
      const custName =
        data?.company ||
        data?.contactName ||
        data?.name ||
        cachedCust?.name ||
        'Customer';
      const { actionSummary, changeDetails } = describeCustomerChanges(
        op,
        data,
        custName,
        cachedCust?.raw
      );
      if (op !== 'delete') {
        customerCache.set(docId, {
          name: custName,
          designerRack: cachedCust?.designerRack || [],
          raw: { ...(cachedCust?.raw || {}), ...(data || {}) }
        });
      }

      const event: ActivityPopupEvent = {
        id: `act_cust_${docId}_${nowMs}_${Math.random().toString(36).substring(2, 6)}`,
        category: 'designer_platform',
        actorId: actor.id || actor.uid || actor.email,
        actorName,
        actorEmail: actor.email || '',
        actorRole,
        actionTitle: 'Customer Updated by Designer',
        actionSummary,
        ...(changeDetails.length ? { changeDetails } : {}),
        targetType: 'customer',
        targetId: docId,
        targetLabel: custName,
        targetRoute: `/customers/${docId}`,
        createdAt: nowIso,
        createdAtMs: nowMs
      };

      if (op !== 'delete' && data) {
        return {
          enrichedData: {
            ...data,
            lastActivityPopup: event
          },
          pendingEvent: event
        };
      }
      return { enrichedData: data, pendingEvent: event };
    }

    const platformDesc = describePlatformPathChange(collectionName, docId, op, data);
    const event: ActivityPopupEvent = {
      id: `act_plat_${collectionName}_${docId}_${nowMs}_${Math.random().toString(36).substring(2, 6)}`,
      category: 'designer_platform',
      actorId: actor.id || actor.uid || actor.email,
      actorName,
      actorEmail: actor.email || '',
      actorRole,
      actionTitle: 'Platform Change by Designer',
      actionSummary: platformDesc.actionSummary,
      changeDetails: [
        {
          field: platformDesc.targetLabel,
          summary: platformDesc.actionSummary
        }
      ],
      targetType: collectionName === 'settings' ? 'settings' : 'platform',
      targetId: `${collectionName}/${docId}`,
      targetLabel: platformDesc.targetLabel,
      targetRoute: platformDesc.targetRoute,
      createdAt: nowIso,
      createdAtMs: nowMs
    };

    return { enrichedData: data, pendingEvent: event };
  }

  return { enrichedData: data };
}

export function finalizeTrackedWriteEvent(db: Firestore | undefined, event?: ActivityPopupEvent) {
  if (!event) return;
  notifyLocalListeners(event);
  const targetDb = db || mainFirestoreInstance;
  if (targetDb) {
    void persistPopupEventToSettings(targetDb, event);
  }
}
