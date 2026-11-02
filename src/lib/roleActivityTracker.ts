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

export interface ActivityPopupEvent {
  id: string;
  category: 'designer_rack' | 'sales_order' | 'designer_platform';
  actorId: string;
  actorName: string;
  actorEmail: string;
  actorRole: string;
  actionTitle: string;
  actionSummary: string;
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
const MAX_STORED_EVENTS = 35;

let currentActor: ActiveActorInfo | null = null;
let mainFirestoreInstance: Firestore | null = null;

// Caches populated by live listeners so pop-ups always display human-readable Customer & Order names
const customerCache = new Map<
  string,
  {
    name: string;
    designerRack: any[];
  }
>();

const orderCache = new Map<
  string,
  {
    title: string;
    portalId: string;
    customerName: string;
    customerId: string;
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
      designerRack: Array.isArray(c.designerRack) ? c.designerRack : existing?.designerRack || []
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
      customerId: o.customerId || ''
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
    if (added.garmentColor || added.color) details.push(added.garmentColor || added.color);
    if (added.sizingAdjustment && added.sizingAdjustment !== 'True to Size') {
      details.push(added.sizingAdjustment);
    }
    const suffix = details.length > 0 ? ` (${details.join(' · ')})` : '';
    return {
      isReadFlagOnly: false,
      actionTitle: 'Added to Designer Rack',
      actionSummary: `Added new design "${title}"${suffix} to the Designer Rack`,
      designTitle: title,
      mockupUrl: getPrimaryMockupUrl(added)
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
      mockupUrl: getPrimaryMockupUrl(removed)
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

    if ((nextItem.title || '') !== (oldItem.title || '') && oldTitle) {
      changes.push(`renamed "${oldTitle}" to "${title}"`);
    }
    if (!oldItem.finalDesignApproved && nextItem.finalDesignApproved) {
      changes.push('approved Final Design');
    } else if (oldItem.finalDesignApproved && !nextItem.finalDesignApproved) {
      changes.push('unmarked Final Design approval');
    }
    if (!oldItem.approvedForOrder && nextItem.approvedForOrder) {
      changes.push('approved for Order');
    } else if (oldItem.approvedForOrder && !nextItem.approvedForOrder) {
      changes.push('unmarked Approved for Order');
    }
    if ((nextItem.frontMockupUrl || '') !== (oldItem.frontMockupUrl || '')) {
      changes.push(nextItem.frontMockupUrl ? 'uploaded Front Mock-up' : 'removed Front Mock-up');
    }
    if ((nextItem.backMockupUrl || '') !== (oldItem.backMockupUrl || '')) {
      changes.push(nextItem.backMockupUrl ? 'uploaded Back Mock-up' : 'removed Back Mock-up');
    }
    const oldOtherLen = Array.isArray(oldItem.otherMockups) ? oldItem.otherMockups.length : 0;
    const nextOtherLen = Array.isArray(nextItem.otherMockups) ? nextItem.otherMockups.length : 0;
    if (nextOtherLen !== oldOtherLen) {
      changes.push(
        nextOtherLen > oldOtherLen
          ? `added ${nextOtherLen - oldOtherLen} mock-up(s)`
          : 'removed a mock-up'
      );
    }
    const oldLogosLen = Array.isArray(oldItem.logos) ? oldItem.logos.length : 0;
    const nextLogosLen = Array.isArray(nextItem.logos) ? nextItem.logos.length : 0;
    if (nextLogosLen !== oldLogosLen) {
      changes.push(
        nextLogosLen > oldLogosLen
          ? `uploaded ${nextLogosLen - oldLogosLen} logo file(s)`
          : 'removed a logo file'
      );
    }
    if ((nextItem.garmentColor || '') !== (oldItem.garmentColor || '')) {
      changes.push(
        nextItem.garmentColor
          ? `set garment color to "${nextItem.garmentColor}"`
          : 'cleared garment color'
      );
    }
    if ((nextItem.sizingAdjustment || 'True to Size') !== (oldItem.sizingAdjustment || 'True to Size')) {
      changes.push(`set sizing to "${nextItem.sizingAdjustment || 'True to Size'}"`);
    }
    if ((nextItem.garmentSourcingLink || '') !== (oldItem.garmentSourcingLink || '')) {
      changes.push('updated garment sourcing link');
    }
    if ((nextItem.psdDriveLink || '') !== (oldItem.psdDriveLink || '')) {
      changes.push('updated PSD / Drive link');
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
        mockupUrl: getPrimaryMockupUrl(nextItem)
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
        mockupUrl: getPrimaryMockupUrl(nextItem)
      };
    }
  }

  if (onlyReadFlagsChanged && prev.length > 0) {
    return {
      isReadFlagOnly: true,
      actionTitle: '',
      actionSummary: ''
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
    mockupUrl: getPrimaryMockupUrl(latestItem)
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

function describeOrderChanges(
  op: 'create' | 'update' | 'delete',
  data: Record<string, any> | undefined,
  orderTitle: string
): string {
  if (op === 'create') {
    const title = data?.title || orderTitle || 'New Order';
    return `Created new order "${title}"`;
  }
  if (op === 'delete') {
    return `Deleted ${orderTitle}`;
  }
  if (!data) return `Updated ${orderTitle}`;

  const keys = Object.keys(data).filter((k) => k !== 'lastActivityPopup' && k !== 'updatedAt');
  const parts: string[] = [];

  if ('status' in data || 'lane' in data || 'stepIndex' in data) {
    const statusVal = data.status || data.lane;
    parts.push(statusVal ? `changed status to "${statusVal}"` : 'updated pipeline stage');
  }
  if ('items' in data && Array.isArray(data.items)) {
    const count = data.items.length;
    parts.push(`updated garment items (${count} item${count === 1 ? '' : 's'})`);
  }
  if ('title' in data && data.title) {
    parts.push(`renamed order to "${data.title}"`);
  }
  if (
    'customer' in data ||
    'customerName' in data ||
    'contactDetails' in data ||
    'personalInfo' in data ||
    'shippingAddress' in data
  ) {
    parts.push('updated customer / shipping info');
  }
  if ('notes' in data || 'internalNotes' in data || 'productionNotes' in data) {
    parts.push('updated order notes');
  }
  if (
    'discount' in data ||
    'discountAmount' in data ||
    'tax' in data ||
    'pricing' in data ||
    'costs' in data ||
    'deposit' in data ||
    'paymentStatus' in data
  ) {
    parts.push('updated pricing / payment details');
  }
  if ('startDate' in data || 'targetCompletionDate' in data || 'dueDate' in data) {
    parts.push('updated production / due dates');
  }
  if ('isHighPriority' in data) {
    parts.push(data.isHighPriority ? 'marked as High Priority' : 'removed High Priority');
  }
  if ('boxes' in data || 'trackingNumber' in data || 'shipments' in data) {
    parts.push('updated packing boxes / shipping');
  }

  if (parts.length === 0) {
    const cleanKeys = keys.slice(0, 3).join(', ');
    return cleanKeys ? `Updated order (${cleanKeys})` : `Updated ${orderTitle}`;
  }

  const joined = parts.join(', ');
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

function describeCustomerChanges(
  op: 'create' | 'update' | 'delete',
  data: Record<string, any> | undefined,
  customerName: string
): string {
  if (op === 'create') return `Created customer profile "${customerName}"`;
  if (op === 'delete') return `Deleted customer "${customerName}"`;
  if (!data) return `Updated customer "${customerName}"`;

  const parts: string[] = [];
  if ('assets' in data && Array.isArray(data.assets)) {
    parts.push(`updated Asset Vault (${data.assets.length} file${data.assets.length === 1 ? '' : 's'})`);
  }
  if ('savedDesigns' in data && Array.isArray(data.savedDesigns)) {
    parts.push(`updated Saved Designs library (${data.savedDesigns.length} design${data.savedDesigns.length === 1 ? '' : 's'})`);
  }
  if ('colorMockups' in data || 'logoPlacements' in data) {
    parts.push('updated custom garment mock-ups / placements');
  }
  if ('company' in data || 'contactName' in data || 'email' in data || 'phone' in data || 'address' in data) {
    parts.push('updated contact / company info');
  }
  if ('notes' in data) {
    parts.push('updated customer notes');
  }

  if (parts.length === 0) {
    return `Updated customer profile for ${customerName}`;
  }
  const joined = parts.join(', ');
  return joined.charAt(0).toUpperCase() + joined.slice(1);
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
      designerRack: data.designerRack
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

    const actionSummary = describeOrderChanges(op, data, rawOrderTitle);
    const firstItemImg =
      Array.isArray(data?.items) && data.items.length > 0
        ? data.items[0]?.image || data.items[0]?.customizedFrontImage || ''
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
      const actionSummary = describeCustomerChanges(op, data, custName);

      const event: ActivityPopupEvent = {
        id: `act_cust_${docId}_${nowMs}_${Math.random().toString(36).substring(2, 6)}`,
        category: 'designer_platform',
        actorId: actor.id || actor.uid || actor.email,
        actorName,
        actorEmail: actor.email || '',
        actorRole,
        actionTitle: 'Customer Updated by Designer',
        actionSummary,
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
