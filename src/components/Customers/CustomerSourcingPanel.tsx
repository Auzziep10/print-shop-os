import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Shirt,
  ExternalLink,
  Check,
  ShoppingBag,
  Copy,
  ChevronDown,
  ChevronUp,
  Users,
  Layers,
  RotateCcw,
  Box,
  Link as LinkIcon,
  AlertCircle,
  Plus
} from 'lucide-react';
import { MvpStarIcon } from '../ui/MvpStarIcon';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { startSourcingTracking } from '../../lib/liveTracking';
import { SourcingTrackingChip } from './SourcingTrackingChip';
import { isDiscountItem, isNonGarmentItem, sortGarmentSizes, normalizeSizeList, hasSizeInList } from '../../lib/garmentUtils';
import {
  useFulfillmentPipelines,
  getPipelineForFulfillmentType,
  isCustomStatusPipeline,
  getUpdatedTimelineMilestonesForStatusChange,
  statusIndexToTimelineStep
} from '../../lib/timelineUtils';

interface CustomerSourcingPanelProps {
  customerId: string;
  customerName: string;
  customerFulfillmentType?: string;
  orders: any[];
  subBrands: any[];
  combinedDesignerRack: any[];
  isSales?: boolean;
  onPreviewImage?: (img: { src: string; alt: string }) => void;
}

interface OccurrenceRef {
  orderId: string;
  orderTitle: string;
  portalId: string;
  customerId: string;
  brandName: string;
  isMvp: boolean;
  getsBox: boolean;
  individualGender: string;
  individualSize: string;
  itemId: string;
  size: string;
  rawOrderSize: string;
  qty: number;
  inferredFromProfile: boolean;
  isOrdered: boolean;
  isReceived: boolean;
  isCompleted: boolean;
}

interface AggregatedSizeBucket {
  size: string;
  totalQty: number;
  orderedQty: number;
  receivedQty: number;
  maleQty: number;
  femaleQty: number;
  unisexQty: number;
  occurrences: OccurrenceRef[];
}

interface AggregatedGarmentGroup {
  key: string;
  style: string;
  itemNum: string;
  color: string;
  sizingAdjustment: string;
  genderLabel: string;
  image: string;
  sourcingUrl: string;
  designerRackItemId: string;
  brandNames: string[];
  totalQty: number;
  orderedQty: number;
  receivedQty: number;
  sourcingOrderedAt: string;
  sourcingTrackingNumber: string;
  /** Live carrier status from the EasyPost webhook (saved on the items as sourcingTracking) */
  sourcingTracking: any;
  sizesMap: Record<string, AggregatedSizeBucket>;
  occurrences: OccurrenceRef[];
}

const STANDARD_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'];
const SIZE_SHIFT_LADDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'];

const getAdjustedOrderSize = (rawSize: string, sizingAdjustment?: string): string => {
  const clean = (rawSize || '').trim().toUpperCase();
  if (!clean || !sizingAdjustment || sizingAdjustment === 'True to Size') return clean;
  const normalized =
    clean === 'XXL' ? '2XL' : clean === 'XXXL' ? '3XL' : clean === 'XXXXL' ? '4XL' : clean;
  const idx = SIZE_SHIFT_LADDER.indexOf(normalized);
  if (idx === -1) return clean;

  let delta = 0;
  const adjLower = sizingAdjustment.trim().toLowerCase();
  if (adjLower.includes('size up 1')) delta = 1;
  else if (adjLower.includes('size up 2')) delta = 2;
  else if (adjLower.includes('size down 1')) delta = -1;
  else if (adjLower.includes('size down 2')) delta = -2;

  if (delta === 0) return clean;
  const targetIdx = Math.max(0, Math.min(SIZE_SHIFT_LADDER.length - 1, idx + delta));
  return SIZE_SHIFT_LADDER[targetIdx];
};

const normalizeGender = (g?: string): 'Male' | 'Female' | 'Unisex' => {
  if (!g) return 'Unisex';
  const lower = g.trim().toLowerCase();
  if (lower === 'male' || lower === 'm' || lower === 'mens' || lower === "men's") return 'Male';
  if (lower === 'female' || lower === 'f' || lower === 'womens' || lower === "women's" || lower === 'ladies') return 'Female';
  return 'Unisex';
};

export function CustomerSourcingPanel({
  customerId,
  customerName,
  customerFulfillmentType,
  orders,
  subBrands,
  combinedDesignerRack,
  isSales = false,
  onPreviewImage
}: CustomerSourcingPanelProps) {
  const navigate = useNavigate();
  const { pipelines } = useFulfillmentPipelines();
  const autoSyncedOrdersRef = useRef<Set<string>>(new Set());
  const [brandFilter, setBrandFilter] = useState<string>('all');
  const [pipelineFilter, setPipelineFilter] = useState<'active_orders' | 'include_quotes' | 'all'>('include_quotes');
  const [statusFilter, setStatusFilter] = useState<'all' | 'needs_ordering' | 'ordered' | 'received'>('all');
  const [splitByGender, setSplitByGender] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<'by_garment' | 'by_individual'>('by_garment');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);
  const [editingLinkGroupKey, setEditingLinkGroupKey] = useState<string | null>(null);
  const [linkInputVal, setLinkInputVal] = useState<string>('');
  const [editingTrackingGroupKey, setEditingTrackingGroupKey] = useState<string | null>(null);
  const [trackingInputVal, setTrackingInputVal] = useState<string>('');
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const brandNameMap = useMemo(() => {
    const map: Record<string, string> = {
      [customerId]: customerName || 'Main Account'
    };
    subBrands.forEach((b: any) => {
      map[b.id] = b.company && b.company !== '-' ? b.company : (b.contactName || 'Sub-Brand');
    });
    return map;
  }, [customerId, customerName, subBrands]);

  const designerRackById = useMemo(() => {
    const map: Record<string, any> = {};
    combinedDesignerRack.forEach((d: any) => {
      if (d?.id) map[d.id] = d;
    });
    return map;
  }, [combinedDesignerRack]);

  const designerRackByTitle = useMemo(() => {
    const map: Record<string, any> = {};
    combinedDesignerRack.forEach((d: any) => {
      const t = (d?.title || d?.name || '').trim().toLowerCase();
      if (t) map[t] = d;
      if (Array.isArray(d?.previousTitles)) {
        d.previousTitles.forEach((pt: any) => {
          const prev = String(pt || '').trim().toLowerCase();
          if (prev && !map[prev]) map[prev] = d;
        });
      }
    });
    return map;
  }, [combinedDesignerRack]);

  const designerRackByLink = useMemo(() => {
    const map: Record<string, any> = {};
    combinedDesignerRack.forEach((d: any) => {
      const sLink = (d?.garmentSourcingLink || '').trim().toLowerCase();
      if (sLink) map[sLink] = d;
      const pLink = (d?.psdDriveLink || '').trim().toLowerCase();
      if (pLink) map[pLink] = d;
    });
    return map;
  }, [combinedDesignerRack]);

  // Filter eligible orders
  const filteredOrders = useMemo(() => {
    return (orders || []).filter((o: any) => {
      if (o.customerId === 'Shopify Temporary' || o.isProjectGroup) return false;
      if (brandFilter !== 'all' && o.customerId !== brandFilter) return false;

      const sIdx = Number(o.statusIndex ?? 0);
      if (pipelineFilter === 'active_orders') {
        return sIdx >= 3 && sIdx < 7;
      }
      if (pipelineFilter === 'include_quotes') {
        return sIdx < 7;
      }
      return true;
    });
  }, [orders, brandFilter, pipelineFilter]);

  // Build aggregated garment groups
  const { garmentGroups, summaryStats, allSizeColumns } = useMemo(() => {
    const groupsMap: Record<string, AggregatedGarmentGroup> = {};
    let totalUnits = 0;
    let totalOrdered = 0;
    let totalReceived = 0;
    const discoveredSizes = new Set<string>(STANDARD_SIZES);

    filteredOrders.forEach((order: any) => {
      const items = Array.isArray(order.items) ? order.items : [];
      const orderBrandName = brandNameMap[order.customerId] || customerName || 'Customer';
      const indGenderRaw = order.personalInfo?.gender || order.personalInfo?.sex || '';
      const indSizeRaw = (order.personalInfo?.size || '').trim().toUpperCase();
      const orderIsMvp = Boolean(order.isMvp || order.personalInfo?.isMvp);
      const orderGetsBox = Boolean(order.getsBox || order.personalInfo?.getsBox);

      items.forEach((item: any) => {
        if (!item || isDiscountItem(item) || isNonGarmentItem(item)) return;
        if (item.itemType === 'gang_sheet' || item.itemType === 'service') return;

        const rawStyleName = (item.title || item.style || 'Custom Garment').trim();
        const itemNum = (item.itemNum || '').trim();
        const itemLinkKey = (item.sourcingLink || item.garmentSourcingLink || item.supplierUrl || '').trim().toLowerCase();
        const itemPsdKey = (item.psdDriveLink || '').trim().toLowerCase();
        const rackMatch =
          (item.designerRackItemId && designerRackById[item.designerRackItemId]) ||
          designerRackByTitle[rawStyleName.toLowerCase()] ||
          (itemPsdKey && designerRackByLink[itemPsdKey]) ||
          (itemLinkKey && designerRackByLink[itemLinkKey]);
        const styleName = (rackMatch?.title || rackMatch?.name || rawStyleName).trim();
        const rawItemColor = (item.color || '').trim();
        const rackColor = (rackMatch?.garmentColor || rackMatch?.color || '').trim();
        const color = rackColor || (rawItemColor.toLowerCase() === 'custom color' ? '' : rawItemColor);
        const rackSizing = (rackMatch?.sizingAdjustment || '').trim();
        const itemSizing = (item.sizingAdjustment || '').trim();
        const sizingAdjustment =
          rackSizing && rackSizing !== 'True to Size'
            ? rackSizing
            : itemSizing && itemSizing !== 'True to Size'
              ? itemSizing
              : rackSizing || itemSizing;
        const itemGenderNorm = normalizeGender(
          item.gender && item.gender !== 'Unisex' ? item.gender : (indGenderRaw || item.gender)
        );
        const genderBucketLabel = splitByGender ? itemGenderNorm : 'All Cuts';

        const rackSourcingUrl = (rackMatch?.garmentSourcingLink || '').trim();
        const itemSourcingUrl = (item.sourcingLink || item.garmentSourcingLink || item.supplierUrl || '').trim();
        const sourcingUrl = rackSourcingUrl || itemSourcingUrl;

        const image =
          rackMatch?.frontMockupUrl ||
          rackMatch?.mockupUrl ||
          item.image ||
          item.frontMockupUrl ||
          '';

        const rawSizesObj = item.sizes && typeof item.sizes === 'object' ? item.sizes : {};
        const explicitSizeEntries = Object.entries(rawSizesObj)
          .map(([sz, q]) => [sz.trim().toUpperCase(), parseInt(String(q), 10) || 0] as const)
          .filter(([, q]) => q > 0);

        let effectiveSizeEntries: { size: string; qty: number; inferred: boolean }[] = [];
        if (explicitSizeEntries.length > 0) {
          effectiveSizeEntries = explicitSizeEntries.map(([size, qty]) => ({
            size,
            qty,
            inferred: false
          }));
        } else if (indSizeRaw) {
          const fallbackQty = Math.max(1, parseInt(String(item.qty || 1), 10) || 1);
          effectiveSizeEntries = [{ size: indSizeRaw, qty: fallbackQty, inferred: true }];
        } else if ((parseInt(String(item.qty || 0), 10) || 0) > 0) {
          effectiveSizeEntries = [
            { size: 'TBD', qty: parseInt(String(item.qty), 10) || 1, inferred: true }
          ];
        }

        if (effectiveSizeEntries.length === 0) return;

        const groupKey = [
          styleName.toLowerCase(),
          itemNum.toLowerCase(),
          color.toLowerCase(),
          genderBucketLabel.toLowerCase()
        ].join('__');

        const itemTracking = (item.sourcingTrackingNumber || '').trim();
        const itemOrderedAt =
          (item.sourcingOrderedAt || '').trim() ||
          (order.timelineMilestones?.Sourced?.completedAt || '').trim() ||
          (order.timelineMilestones?.Ordered?.completedAt || '').trim();

        if (!groupsMap[groupKey]) {
          groupsMap[groupKey] = {
            key: groupKey,
            style: styleName,
            itemNum,
            color,
            sizingAdjustment,
            genderLabel: genderBucketLabel,
            image,
            sourcingUrl,
            designerRackItemId: item.designerRackItemId || rackMatch?.id || '',
            brandNames: [],
            totalQty: 0,
            orderedQty: 0,
            receivedQty: 0,
            sourcingOrderedAt: '',
            sourcingTrackingNumber: '',
            sourcingTracking: null,
            sizesMap: {},
            occurrences: []
          };
        }

        const group = groupsMap[groupKey];
        if (!group.image && image) group.image = image;
        if (!group.sourcingUrl && sourcingUrl) group.sourcingUrl = sourcingUrl;
        if (!group.sizingAdjustment && sizingAdjustment) group.sizingAdjustment = sizingAdjustment;
        if (!group.sourcingTrackingNumber && itemTracking) group.sourcingTrackingNumber = itemTracking;
        if (
          !group.sourcingTracking &&
          item.sourcingTracking?.trackingStatus &&
          itemTracking &&
          itemTracking === group.sourcingTrackingNumber
        ) {
          group.sourcingTracking = item.sourcingTracking;
        }
        if (!group.brandNames.includes(orderBrandName)) {
          group.brandNames.push(orderBrandName);
        }

        effectiveSizeEntries.forEach(({ size: rawOrderSize, qty, inferred }) => {
          const size = getAdjustedOrderSize(rawOrderSize, sizingAdjustment);
          discoveredSizes.add(size);
          const isCompleted =
            hasSizeInList(item.completedSizes, size) || hasSizeInList(item.completedSizes, rawOrderSize);
          const isReceived =
            isCompleted ||
            hasSizeInList(item.receivedSizes, size) ||
            hasSizeInList(item.receivedSizes, rawOrderSize);
          const isOrdered =
            isReceived ||
            hasSizeInList(item.orderedSizes, size) ||
            hasSizeInList(item.orderedSizes, rawOrderSize);
          if (isOrdered && itemOrderedAt && !group.sourcingOrderedAt) {
            group.sourcingOrderedAt = itemOrderedAt;
          }

          if (!group.sizesMap[size]) {
            group.sizesMap[size] = {
              size,
              totalQty: 0,
              orderedQty: 0,
              receivedQty: 0,
              maleQty: 0,
              femaleQty: 0,
              unisexQty: 0,
              occurrences: []
            };
          }

          const bucket = group.sizesMap[size];
          bucket.totalQty += qty;
          if (isOrdered) bucket.orderedQty += qty;
          if (isReceived) bucket.receivedQty += qty;

          if (itemGenderNorm === 'Male') bucket.maleQty += qty;
          else if (itemGenderNorm === 'Female') bucket.femaleQty += qty;
          else bucket.unisexQty += qty;

          const occ: OccurrenceRef = {
            orderId: order.id,
            orderTitle: order.title || 'Untitled Order',
            portalId: String(order.portalId || order.id).slice(0, 8),
            customerId: order.customerId,
            brandName: orderBrandName,
            isMvp: orderIsMvp,
            getsBox: orderGetsBox,
            individualGender: itemGenderNorm,
            individualSize: indSizeRaw || rawOrderSize,
            itemId: String(item.id),
            size,
            rawOrderSize,
            qty,
            inferredFromProfile: inferred,
            isOrdered,
            isReceived,
            isCompleted
          };

          bucket.occurrences.push(occ);
          group.occurrences.push(occ);

          group.totalQty += qty;
          if (isOrdered) group.orderedQty += qty;
          if (isReceived) group.receivedQty += qty;

          totalUnits += qty;
          if (isOrdered) totalOrdered += qty;
          if (isReceived) totalReceived += qty;
        });
      });
    });

    let allGroups = Object.values(groupsMap).sort((a, b) => {
      const aPending = a.totalQty - a.orderedQty;
      const bPending = b.totalQty - b.orderedQty;
      if (aPending > 0 && bPending === 0) return -1;
      if (aPending === 0 && bPending > 0) return 1;
      return b.totalQty - a.totalQty || a.style.localeCompare(b.style);
    });

    if (statusFilter === 'needs_ordering') {
      allGroups = allGroups.filter((g) => g.orderedQty < g.totalQty);
    } else if (statusFilter === 'ordered') {
      allGroups = allGroups.filter((g) => g.orderedQty > 0 && g.receivedQty < g.totalQty);
    } else if (statusFilter === 'received') {
      allGroups = allGroups.filter((g) => g.receivedQty >= g.totalQty && g.totalQty > 0);
    }

    const sortedColumns = Array.from(discoveredSizes).sort(sortGarmentSizes);

    return {
      garmentGroups: allGroups,
      allSizeColumns: sortedColumns,
      summaryStats: {
        totalUnits,
        needsOrdering: Math.max(0, totalUnits - totalOrdered),
        orderedPendingDelivery: Math.max(0, totalOrdered - totalReceived),
        received: totalReceived,
        stylesCount: Object.keys(groupsMap).length
      }
    };
  }, [filteredOrders, brandNameMap, customerName, splitByGender, designerRackById, designerRackByTitle, statusFilter]);

  const evaluateOrderSourcingStatus = (orderDoc: any, itemsToInspect: any[]) => {
    let orderTotalUnits = 0;
    let orderOrderedUnits = 0;
    let orderReceivedUnits = 0;
    const indSizeRaw = (orderDoc?.personalInfo?.size || '').trim().toUpperCase();

    (itemsToInspect || []).forEach((item: any) => {
      if (!item || isDiscountItem(item) || isNonGarmentItem(item)) return;
      if (item.itemType === 'gang_sheet' || item.itemType === 'service') return;

      const rawStyleName = (item.title || item.style || 'Custom Garment').trim();
      const itemLinkKey = (item.sourcingLink || item.garmentSourcingLink || item.supplierUrl || '').trim().toLowerCase();
      const itemPsdKey = (item.psdDriveLink || '').trim().toLowerCase();
      const rackMatch =
        (item.designerRackItemId && designerRackById[item.designerRackItemId]) ||
        designerRackByTitle[rawStyleName.toLowerCase()] ||
        (itemPsdKey && designerRackByLink[itemPsdKey]) ||
        (itemLinkKey && designerRackByLink[itemLinkKey]);
      const rackSizing = (rackMatch?.sizingAdjustment || '').trim();
      const itemSizing = (item.sizingAdjustment || '').trim();
      const sizingAdjustment =
        rackSizing && rackSizing !== 'True to Size'
          ? rackSizing
          : itemSizing && itemSizing !== 'True to Size'
            ? itemSizing
            : rackSizing || itemSizing;

      const rawSizesObj = item.sizes && typeof item.sizes === 'object' ? item.sizes : {};
      const explicitSizeEntries = Object.entries(rawSizesObj)
        .map(([sz, q]) => [sz.trim().toUpperCase(), parseInt(String(q), 10) || 0] as const)
        .filter(([, q]) => q > 0);

      let effectiveEntries: { size: string; qty: number }[] = [];
      if (explicitSizeEntries.length > 0) {
        effectiveEntries = explicitSizeEntries.map(([size, qty]) => ({ size, qty }));
      } else if (indSizeRaw) {
        const fallbackQty = Math.max(1, parseInt(String(item.qty || 1), 10) || 1);
        effectiveEntries = [{ size: indSizeRaw, qty: fallbackQty }];
      } else if ((parseInt(String(item.qty || 0), 10) || 0) > 0) {
        effectiveEntries = [{ size: 'TBD', qty: parseInt(String(item.qty), 10) || 1 }];
      }

      effectiveEntries.forEach(({ size: rawOrderSize, qty }) => {
        const adjustedSize = getAdjustedOrderSize(rawOrderSize, sizingAdjustment);
        const isCompleted =
          hasSizeInList(item.completedSizes, adjustedSize) ||
          hasSizeInList(item.completedSizes, rawOrderSize);
        const isReceived =
          isCompleted ||
          hasSizeInList(item.receivedSizes, adjustedSize) ||
          hasSizeInList(item.receivedSizes, rawOrderSize);
        const isOrdered =
          isReceived ||
          hasSizeInList(item.orderedSizes, adjustedSize) ||
          hasSizeInList(item.orderedSizes, rawOrderSize);

        orderTotalUnits += qty;
        if (isOrdered) orderOrderedUnits += qty;
        if (isReceived) orderReceivedUnits += qty;
      });
    });

    const subBrand = subBrands.find((b: any) => b.id === orderDoc?.customerId);
    const activeFt = orderDoc?.fulfillmentType || subBrand?.fulfillmentType || customerFulfillmentType || 'Standard';
    let orderedStatusIndex = 5;
    if (isCustomStatusPipeline(activeFt, pipelines)) {
      const pipeline = getPipelineForFulfillmentType(activeFt, pipelines);
      const steps = pipeline.steps || [];
      let foundIdx = steps.findIndex((s) => s.trim().toLowerCase() === 'ordered');
      if (foundIdx === -1) foundIdx = steps.findIndex((s) => s.trim().toLowerCase().includes('ordered'));
      if (foundIdx === -1) foundIdx = steps.findIndex((s) => s.trim().toLowerCase() === 'sourced');
      if (foundIdx === -1) foundIdx = steps.findIndex((s) => s.trim().toLowerCase().includes('source'));
      orderedStatusIndex = foundIdx !== -1 ? foundIdx : Math.min(3, Math.max(0, steps.length - 1));
    }

    return {
      totalUnits: orderTotalUnits,
      orderedUnits: orderOrderedUnits,
      receivedUnits: orderReceivedUnits,
      allOrdered: orderTotalUnits > 0 && orderOrderedUnits >= orderTotalUnits,
      allReceived: orderTotalUnits > 0 && orderReceivedUnits >= orderTotalUnits,
      activeFt,
      orderedStatusIndex
    };
  };

  useEffect(() => {
    if (isSales || !Array.isArray(orders) || orders.length === 0) return;
    orders.forEach((orderDoc: any) => {
      try {
        if (!orderDoc?.id || orderDoc.customerId === 'Shopify Temporary' || orderDoc.isProjectGroup) return;
        const currentStatusIdx = Number(orderDoc.statusIndex ?? 0);
        if (currentStatusIdx >= 7) return;
        const evalResult = evaluateOrderSourcingStatus(orderDoc, orderDoc.items || []);
        if (evalResult.allOrdered && currentStatusIdx < evalResult.orderedStatusIndex) {
          const syncSig = `${orderDoc.id}__${evalResult.orderedUnits}__${evalResult.totalUnits}__${evalResult.orderedStatusIndex}`;
          if (autoSyncedOrdersRef.current.has(syncSig)) return;
          autoSyncedOrdersRef.current.add(syncSig);
          const nowIso = new Date().toISOString();
          updateDoc(doc(db, 'orders', orderDoc.id), {
            statusIndex: evalResult.orderedStatusIndex,
            status: 'Ordered',
            timelineMilestones: getUpdatedTimelineMilestonesForStatusChange(
              orderDoc.timelineMilestones,
              evalResult.orderedStatusIndex,
              nowIso,
              evalResult.activeFt,
              pipelines
            )
          }).catch((err) => {
            console.error('Failed to auto-sync order status to Ordered:', err);
          });
        }
      } catch (err) {
        console.error('Error checking order sourcing status:', err);
      }
    });
  }, [orders, combinedDesignerRack, pipelines, isSales, customerFulfillmentType, subBrands]);

  const applySourcingStatusToOccurrences = async (
    occurrences: OccurrenceRef[],
    targetState: 'to_order' | 'ordered' | 'received',
    actionKey: string
  ) => {
    if (isSales || occurrences.length === 0) return;
    setUpdatingKey(actionKey);
    try {
      const byOrder: Record<string, OccurrenceRef[]> = {};
      occurrences.forEach((occ) => {
        if (!byOrder[occ.orderId]) byOrder[occ.orderId] = [];
        byOrder[occ.orderId].push(occ);
      });

      const orderMap: Record<string, any> = {};
      orders.forEach((o: any) => {
        orderMap[o.id] = o;
      });

      await Promise.all(
        Object.entries(byOrder).map(async ([orderId, occList]) => {
          const orderDoc = orderMap[orderId];
          if (!orderDoc || !Array.isArray(orderDoc.items)) return;

          const updatedItems = orderDoc.items.map((item: any) => {
            const matchingOccs = occList.filter((o) => String(o.itemId) === String(item.id));
            if (matchingOccs.length === 0) return item;

            const nextSizes = { ...(item.sizes || {}) };
            const orderedSet = new Set<string>(normalizeSizeList(item.orderedSizes));
            const receivedSet = new Set<string>(normalizeSizeList(item.receivedSizes));

            matchingOccs.forEach((occ) => {
              const rawSz = occ.rawOrderSize || occ.size;
              if (occ.inferredFromProfile && rawSz !== 'TBD') {
                const existingSzQty = parseInt(String(nextSizes[rawSz] || 0), 10) || 0;
                if (existingSzQty === 0) {
                  nextSizes[rawSz] = occ.qty;
                }
              }

              if (targetState === 'to_order') {
                orderedSet.delete(occ.size);
                orderedSet.delete(rawSz);
                receivedSet.delete(occ.size);
                receivedSet.delete(rawSz);
              } else if (targetState === 'ordered') {
                orderedSet.add(occ.size);
                orderedSet.add(rawSz);
                receivedSet.delete(occ.size);
                receivedSet.delete(rawSz);
              } else if (targetState === 'received') {
                orderedSet.add(occ.size);
                orderedSet.add(rawSz);
                receivedSet.add(occ.size);
                receivedSet.add(rawSz);
              }
            });

            const nowItemIso = new Date().toISOString();
            const nextSourcingOrderedAt =
              orderedSet.size === 0
                ? ''
                : (item.sourcingOrderedAt || '').trim() || nowItemIso;

            return {
              ...item,
              sizes: nextSizes,
              orderedSizes: Array.from(orderedSet),
              receivedSizes: Array.from(receivedSet),
              sourcingOrderedAt: nextSourcingOrderedAt
            };
          });

          const updatePayload: Record<string, any> = { items: updatedItems };
          const evalResult = evaluateOrderSourcingStatus(orderDoc, updatedItems);
          const currentStatusIdx = Number(orderDoc.statusIndex ?? 0);
          const nowIso = new Date().toISOString();

          if (evalResult.allOrdered && currentStatusIdx < evalResult.orderedStatusIndex) {
            updatePayload.statusIndex = evalResult.orderedStatusIndex;
            updatePayload.status = 'Ordered';
            updatePayload.timelineMilestones = getUpdatedTimelineMilestonesForStatusChange(
              orderDoc.timelineMilestones,
              evalResult.orderedStatusIndex,
              nowIso,
              evalResult.activeFt,
              pipelines
            );
          } else if (!evalResult.allOrdered && currentStatusIdx === evalResult.orderedStatusIndex) {
            const revertIdx = isCustomStatusPipeline(evalResult.activeFt, pipelines)
              ? Math.max(0, evalResult.orderedStatusIndex - 1)
              : evalResult.orderedUnits > 0
                ? 4
                : 3;
            const orderedStepName = statusIndexToTimelineStep(
              evalResult.orderedStatusIndex,
              evalResult.activeFt,
              pipelines
            );
            const nextMilestones = { ...(orderDoc.timelineMilestones || {}) };
            if (nextMilestones[orderedStepName]) {
              nextMilestones[orderedStepName] = {
                ...nextMilestones[orderedStepName],
                completedAt: ''
              };
            }
            updatePayload.statusIndex = revertIdx;
            updatePayload.status = evalResult.orderedUnits > 0 ? 'Shopping' : 'Approved';
            updatePayload.timelineMilestones = nextMilestones;
          }

          await updateDoc(doc(db, 'orders', orderId), updatePayload);
        })
      );
    } catch (err) {
      console.error('Failed to update garment sourcing status:', err);
    } finally {
      setUpdatingKey(null);
    }
  };

  const handleCycleSizeBucket = async (groupKey: string, bucket: AggregatedSizeBucket) => {
    if (isSales) return;
    const allReceived = bucket.receivedQty >= bucket.totalQty;
    const allOrdered = bucket.orderedQty >= bucket.totalQty;

    let nextState: 'to_order' | 'ordered' | 'received' = 'ordered';
    if (!allOrdered) {
      nextState = 'ordered';
    } else if (!allReceived) {
      nextState = 'received';
    } else {
      nextState = 'to_order';
    }

    await applySourcingStatusToOccurrences(
      bucket.occurrences,
      nextState,
      `${groupKey}__${bucket.size}`
    );
  };

  const handleSaveGroupSourcingLink = async (group: AggregatedGarmentGroup) => {
    if (isSales) return;
    const trimmed = linkInputVal.trim();
    setUpdatingKey(`link_${group.key}`);
    try {
      const orderIds = Array.from(new Set(group.occurrences.map((o) => o.orderId)));
      const itemIdsByOrder: Record<string, Set<string>> = {};
      group.occurrences.forEach((o) => {
        if (!itemIdsByOrder[o.orderId]) itemIdsByOrder[o.orderId] = new Set();
        itemIdsByOrder[o.orderId].add(String(o.itemId));
      });

      const orderMap: Record<string, any> = {};
      orders.forEach((o: any) => {
        orderMap[o.id] = o;
      });

      await Promise.all(
        orderIds.map(async (orderId) => {
          const orderDoc = orderMap[orderId];
          if (!orderDoc || !Array.isArray(orderDoc.items)) return;
          const updatedItems = orderDoc.items.map((item: any) => {
            if (!itemIdsByOrder[orderId]?.has(String(item.id))) return item;
            return {
              ...item,
              sourcingLink: trimmed,
              garmentSourcingLink: trimmed
            };
          });
          await updateDoc(doc(db, 'orders', orderId), { items: updatedItems });
        })
      );
      setEditingLinkGroupKey(null);
    } catch (err) {
      console.error('Failed to save sourcing link:', err);
    } finally {
      setUpdatingKey(null);
    }
  };

  const trackingRefsForGroup = (group: AggregatedGarmentGroup) => {
    const seen = new Set<string>();
    return group.occurrences
      .map((o) => ({ orderId: o.orderId, itemId: String(o.itemId) }))
      .filter((r) => {
        const k = `${r.orderId}__${r.itemId}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
  };

  const handleSaveGroupTrackingNumber = async (group: AggregatedGarmentGroup) => {
    if (isSales) return;
    const trimmed = trackingInputVal.trim();
    setUpdatingKey(`trk_${group.key}`);
    try {
      const orderIds = Array.from(new Set(group.occurrences.map((o) => o.orderId)));
      const itemIdsByOrder: Record<string, Set<string>> = {};
      group.occurrences.forEach((o) => {
        if (!itemIdsByOrder[o.orderId]) itemIdsByOrder[o.orderId] = new Set();
        itemIdsByOrder[o.orderId].add(String(o.itemId));
      });

      const orderMap: Record<string, any> = {};
      orders.forEach((o: any) => {
        orderMap[o.id] = o;
      });

      await Promise.all(
        orderIds.map(async (orderId) => {
          const orderDoc = orderMap[orderId];
          if (!orderDoc || !Array.isArray(orderDoc.items)) return;
          const updatedItems = orderDoc.items.map((item: any) => {
            if (!itemIdsByOrder[orderId]?.has(String(item.id))) return item;
            const changed = (item.sourcingTrackingNumber || '').trim() !== trimmed;
            return {
              ...item,
              sourcingTrackingNumber: trimmed,
              // Old live status belongs to the old number
              ...(changed ? { sourcingTracking: null } : {})
            };
          });
          await updateDoc(doc(db, 'orders', orderId), { items: updatedItems });
        })
      );
      setEditingTrackingGroupKey(null);
      if (trimmed) {
        // Live carrier status via EasyPost; fills in on its own, never blocks saving
        void startSourcingTracking(trackingRefsForGroup(group));
      }
    } catch (err) {
      console.error('Failed to save sourcing tracking number:', err);
    } finally {
      setUpdatingKey(null);
    }
  };

  const handleCopyGroupBreakdown = (group: AggregatedGarmentGroup) => {
    const sortedSizes = Object.values(group.sizesMap).sort((a, b) => sortGarmentSizes(a.size, b.size));
    const sizeParts = sortedSizes.map((b) => `${b.size}: ${b.totalQty}`).join(', ');
    const headerParts = [
      group.style,
      group.itemNum ? `#${group.itemNum}` : '',
      group.color ? `(${group.color})` : '',
      group.sizingAdjustment && group.sizingAdjustment !== 'True to Size' ? `[${group.sizingAdjustment}]` : '',
      group.genderLabel !== 'All Cuts' ? `[${group.genderLabel}]` : ''
    ]
      .filter(Boolean)
      .join(' ');
    const text = `${headerParts} — Total ${group.totalQty} [${sizeParts}]`;
    navigator.clipboard.writeText(text);
    setCopiedKey(group.key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleSyncIndividualSizeToOrderItems = async (order: any) => {
    if (isSales || !order?.personalInfo?.size) return;
    const targetSize = String(order.personalInfo.size).trim().toUpperCase();
    const targetGender = order.personalInfo?.gender || '';
    setUpdatingKey(`sync_${order.id}`);
    try {
      const updatedItems = (order.items || []).map((item: any) => {
        if (!item || isDiscountItem(item) || isNonGarmentItem(item)) return item;
        if (item.itemType === 'gang_sheet' || item.itemType === 'service') return item;
        const hasAnySize = Object.values(item.sizes || {}).some((q) => (parseInt(String(q), 10) || 0) > 0);
        if (hasAnySize) return item;
        return {
          ...item,
          gender: item.gender && item.gender !== 'Unisex' ? item.gender : (targetGender || 'Unisex'),
          sizes: {
            ...(item.sizes || {}),
            [targetSize]: Math.max(1, parseInt(String(item.qty || 1), 10) || 1)
          },
          qty: Math.max(1, parseInt(String(item.qty || 1), 10) || 1)
        };
      });
      await updateDoc(doc(db, 'orders', order.id), { items: updatedItems });
    } catch (err) {
      console.error('Failed to sync individual size to garments:', err);
    } finally {
      setUpdatingKey(null);
    }
  };

  if (isSales) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3 mt-3 w-full">
      {/* Compact Horizontal Toolbar + Status Filter Pills */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-neutral-50 border border-brand-border/70 px-3.5 py-2.5 rounded-xl">
        {/* Left: View Switcher + Filters */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex rounded-lg bg-white p-0.5 border border-brand-border shadow-2xs">
            <button
              type="button"
              onClick={() => setViewMode('by_garment')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                viewMode === 'by_garment'
                  ? 'bg-neutral-900 text-white shadow-2xs'
                  : 'text-brand-secondary hover:text-brand-primary'
              }`}
            >
              <Layers size={13} />
              <span>By Garment ({garmentGroups.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('by_individual')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                viewMode === 'by_individual'
                  ? 'bg-neutral-900 text-white shadow-2xs'
                  : 'text-brand-secondary hover:text-brand-primary'
              }`}
            >
              <Users size={13} />
              <span>By Individual ({filteredOrders.length})</span>
            </button>
          </div>

          {subBrands.length > 0 && (
            <select
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              className="bg-white border border-brand-border rounded-lg px-2.5 py-1.5 text-xs font-bold text-brand-primary focus:outline-none focus:border-brand-primary cursor-pointer"
            >
              <option value="all">All Brands ({subBrands.length + 1})</option>
              <option value={customerId}>{customerName || 'Parent Account'}</option>
              {subBrands.map((b: any) => (
                <option key={b.id} value={b.id}>
                  {b.company && b.company !== '-' ? b.company : (b.contactName || 'Sub-Brand')}
                </option>
              ))}
            </select>
          )}

          <select
            value={pipelineFilter}
            onChange={(e) => setPipelineFilter(e.target.value as any)}
            className="bg-white border border-brand-border rounded-lg px-2.5 py-1.5 text-xs font-bold text-brand-primary focus:outline-none focus:border-brand-primary cursor-pointer"
          >
            <option value="include_quotes">Active Orders + Quotes</option>
            <option value="active_orders">Approved / In Production Only</option>
            <option value="all">All Orders (Incl. Shipped)</option>
          </select>

          {viewMode === 'by_garment' && (
            <label
              className="inline-flex items-center gap-1.5 bg-white border border-brand-border px-2.5 py-1.5 rounded-lg text-xs font-bold text-brand-primary cursor-pointer select-none hover:border-brand-primary/50 transition-colors whitespace-nowrap"
              title="Separate Male and Female orders into distinct rows"
            >
              <input
                type="checkbox"
                checked={splitByGender}
                onChange={(e) => setSplitByGender(e.target.checked)}
                className="w-3.5 h-3.5 rounded accent-neutral-900 cursor-pointer"
              />
              <span>Split M/F Cuts</span>
            </label>
          )}
        </div>

        {/* Right: Horizontal Inline Status Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer whitespace-nowrap ${
              statusFilter === 'all'
                ? 'bg-neutral-900 text-white border-neutral-900'
                : 'bg-white text-brand-primary border-brand-border hover:border-neutral-400'
            }`}
          >
            <span>Total Units:</span>
            <span className="font-black tabular-nums">{summaryStats.totalUnits}</span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter(statusFilter === 'needs_ordering' ? 'all' : 'needs_ordering')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer whitespace-nowrap ${
              statusFilter === 'needs_ordering'
                ? 'bg-red-600 text-white border-red-600 shadow-2xs'
                : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
            }`}
          >
            <span>To Order:</span>
            <span className="font-black tabular-nums">{summaryStats.needsOrdering}</span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter(statusFilter === 'ordered' ? 'all' : 'ordered')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer whitespace-nowrap ${
              statusFilter === 'ordered'
                ? 'bg-amber-500 text-white border-amber-500 shadow-2xs'
                : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
            }`}
          >
            <span>Ordered:</span>
            <span className="font-black tabular-nums">{summaryStats.orderedPendingDelivery}</span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter(statusFilter === 'received' ? 'all' : 'received')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer whitespace-nowrap ${
              statusFilter === 'received'
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
            }`}
          >
            <span>Received:</span>
            <span className="font-black tabular-nums">{summaryStats.received}</span>
          </button>
        </div>
      </div>

      {/* VIEW 1: HORIZONTALLY ALIGNED GARMENT BUY SHEET SPREADSHEET */}
      {viewMode === 'by_garment' ? (
        garmentGroups.length === 0 ? (
          <div className="bg-brand-bg/40 border border-dashed border-brand-border rounded-2xl p-8 text-center flex flex-col items-center justify-center gap-1.5">
            <Shirt size={24} className="text-brand-secondary/50" />
            <p className="text-sm font-bold text-brand-primary">No garments match the current sourcing filter.</p>
          </div>
        ) : (
          <div className="w-full border border-brand-border rounded-xl overflow-hidden bg-white shadow-2xs">
            <div className="overflow-x-auto w-full">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-neutral-50 border-b border-brand-border text-[10px] font-extrabold uppercase tracking-wider text-brand-secondary">
                    <th className="py-2.5 pl-4 pr-3 min-w-[240px]">Garment Style</th>
                    <th className="py-2.5 px-2 w-[86px] text-center">Cut</th>
                    {allSizeColumns.map((sz) => (
                      <th
                        key={sz}
                        className="py-2.5 px-1 w-[54px] min-w-[50px] text-center font-black text-neutral-800 border-l border-brand-border/50 bg-neutral-100/60"
                      >
                        {sz}
                      </th>
                    ))}
                    <th className="py-2.5 px-2.5 w-[68px] text-center border-l border-brand-border/60 font-black text-neutral-900">
                      Total
                    </th>
                    <th className="py-2.5 px-3 w-[165px] border-l border-brand-border/60">Supplier Link</th>
                    <th className="py-2.5 pl-3 pr-4 w-[210px] text-right">Status / People</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-border/60 text-xs">
                  {garmentGroups.map((group) => {
                    const isExpanded = Boolean(expandedGroups[group.key]);
                    const allOrdered = group.orderedQty >= group.totalQty && group.totalQty > 0;
                    const allReceived = group.receivedQty >= group.totalQty && group.totalQty > 0;
                    const uniqueOrdersCount = new Set(group.occurrences.map((o) => o.orderId)).size;
                    const orderedAtMs = group.sourcingOrderedAt ? new Date(group.sourcingOrderedAt).getTime() : 0;
                    const isPast24Hours =
                      orderedAtMs > 0 && !isNaN(orderedAtMs) && nowMs - orderedAtMs >= 24 * 60 * 60 * 1000;
                    const hasTrackingNumber = Boolean(group.sourcingTrackingNumber && group.sourcingTrackingNumber.trim());
                    const isTrackingRequired = allOrdered && !allReceived && isPast24Hours && !hasTrackingNumber;

                    return (
                      <React.Fragment key={group.key}>
                        <tr
                          className={`transition-colors ${
                            allReceived
                              ? 'bg-emerald-50/20 hover:bg-emerald-50/40'
                              : allOrdered
                                ? 'bg-amber-50/20 hover:bg-amber-50/40'
                                : 'hover:bg-neutral-50/80'
                          }`}
                        >
                          {/* Col 1: Garment Thumbnail + Name + Item# + Brand */}
                          <td className="py-2.5 pl-4 pr-3 align-middle">
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                onClick={() => group.image && onPreviewImage?.({ src: group.image, alt: group.style })}
                                className={`w-10 h-10 rounded-lg border border-brand-border/70 bg-neutral-50 flex items-center justify-center p-1 shrink-0 overflow-hidden ${
                                  group.image ? 'cursor-zoom-in hover:border-brand-primary' : ''
                                }`}
                              >
                                {group.image ? (
                                  <img
                                    src={group.image}
                                    alt={group.style}
                                    className="w-full h-full object-contain mix-blend-multiply"
                                  />
                                ) : (
                                  <Shirt size={18} className="text-neutral-300" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span
                                    className="font-bold text-sm text-brand-primary truncate"
                                    title={group.style}
                                  >
                                    {group.style}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-brand-secondary mt-0.5">
                                  {group.itemNum && (
                                    <span className="font-bold text-neutral-700">#{group.itemNum}</span>
                                  )}
                                  {group.color && <span className="truncate">• {group.color}</span>}
                                  {group.brandNames.map((bn) => (
                                    <span
                                      key={bn}
                                      className="text-[9px] bg-neutral-100 border border-neutral-200 text-neutral-700 px-1.5 py-0.2 rounded font-bold uppercase tracking-wider"
                                    >
                                      {bn}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Col 2: Cut (Male / Female / Unisex) */}
                          <td className="py-2.5 px-2 align-middle text-center">
                            <span
                              className={`inline-block text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full border whitespace-nowrap ${
                                group.genderLabel === 'Female'
                                  ? 'bg-pink-50 text-pink-700 border-pink-200'
                                  : group.genderLabel === 'Male'
                                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                                    : 'bg-neutral-100 text-neutral-700 border-neutral-200'
                              }`}
                            >
                              {group.genderLabel}
                            </span>
                          </td>

                          {/* Cols 3..N: Aligned Size Matrix Cells */}
                          {allSizeColumns.map((sz) => {
                            const bucket = group.sizesMap[sz];
                            if (!bucket || bucket.totalQty === 0) {
                              return (
                                <td
                                  key={sz}
                                  className="py-2.5 px-1 text-center align-middle border-l border-brand-border/40 text-neutral-300 select-none"
                                >
                                  —
                                </td>
                              );
                            }

                            const bucketAllReceived = bucket.receivedQty >= bucket.totalQty;
                            const bucketAllOrdered = bucket.orderedQty >= bucket.totalQty;
                            const isUpdatingThis = updatingKey === `${group.key}__${bucket.size}`;

                            let cellClass =
                              'bg-white border-red-300 text-neutral-900 hover:border-neutral-900 hover:bg-red-50/40';
                            let statusLabel = 'To Order';
                            if (bucketAllReceived) {
                              cellClass =
                                'bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700';
                              statusLabel = 'Received';
                            } else if (bucketAllOrdered) {
                              cellClass =
                                'bg-amber-500 border-amber-500 text-white hover:bg-amber-600';
                              statusLabel = 'Ordered';
                            } else if (bucket.orderedQty > 0) {
                              cellClass =
                                'bg-amber-100 border-amber-400 text-amber-900 hover:bg-amber-200';
                              statusLabel = `${bucket.orderedQty}/${bucket.totalQty} Ordered`;
                            }

                            return (
                              <td
                                key={sz}
                                className="py-2 px-1 text-center align-middle border-l border-brand-border/40"
                              >
                                <button
                                  type="button"
                                  disabled={isUpdatingThis}
                                  onClick={() => handleCycleSizeBucket(group.key, bucket)}
                                  title={`${sz}: ${bucket.totalQty} (${statusLabel}) — Click to cycle To Order → Ordered → Received`}
                                  className={`w-full min-w-[40px] py-1 px-1 rounded-lg border font-bold text-xs tabular-nums transition-all cursor-pointer inline-flex flex-col items-center justify-center leading-tight ${cellClass} ${
                                    isUpdatingThis ? 'opacity-50' : ''
                                  }`}
                                >
                                  <span>{bucket.totalQty}</span>
                                </button>
                              </td>
                            );
                          })}

                          {/* Total Column */}
                          <td className="py-2.5 px-2.5 text-center align-middle border-l border-brand-border/60 font-serif text-base font-bold text-brand-primary tabular-nums">
                            {group.totalQty}
                          </td>

                          {/* Supplier Link + Copy Column */}
                          <td className="py-2.5 px-3 align-middle border-l border-brand-border/60">
                            {editingLinkGroupKey === group.key ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="url"
                                  value={linkInputVal}
                                  onChange={(e) => setLinkInputVal(e.target.value)}
                                  placeholder="https://..."
                                  className="w-28 bg-white border border-brand-border rounded px-2 py-1 text-[11px] focus:outline-none focus:border-brand-primary"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveGroupSourcingLink(group)}
                                  className="bg-black text-white text-[10px] font-bold px-2 py-1 rounded cursor-pointer"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingLinkGroupKey(null)}
                                  className="text-[10px] text-neutral-400 hover:text-neutral-700 px-1 cursor-pointer"
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 whitespace-nowrap">
                                {group.sourcingUrl ? (
                                  <>
                                    <a
                                      href={
                                        group.sourcingUrl.startsWith('http')
                                          ? group.sourcingUrl
                                          : `https://${group.sourcingUrl}`
                                      }
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-600 hover:text-white border border-blue-200 hover:border-blue-600 px-2.5 py-1 rounded-lg transition-all"
                                    >
                                      <span>Supplier</span>
                                      <ExternalLink size={11} />
                                    </a>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingLinkGroupKey(group.key);
                                        setLinkInputVal(group.sourcingUrl);
                                      }}
                                      className="text-[10px] text-neutral-400 hover:text-neutral-800 px-1 cursor-pointer"
                                      title="Edit Supplier Link"
                                    >
                                      Edit
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingLinkGroupKey(group.key);
                                      setLinkInputVal('');
                                    }}
                                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-neutral-500 hover:text-brand-primary bg-neutral-100 hover:bg-neutral-200/70 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                                  >
                                    <LinkIcon size={11} />
                                    <span>+ Link</span>
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => handleCopyGroupBreakdown(group)}
                                  className="p-1.5 rounded-lg text-neutral-500 hover:text-black hover:bg-neutral-100 transition-colors cursor-pointer"
                                  title="Copy size breakdown to clipboard"
                                >
                                  {copiedKey === group.key ? (
                                    <Check size={13} className="text-emerald-600" />
                                  ) : (
                                    <Copy size={13} />
                                  )}
                                </button>
                              </div>
                            )}
                          </td>

                          {/* Right Actions Column: Batch Status + Expand People */}
                          <td className="py-2.5 pl-3 pr-4 align-middle text-right">
                            <div className="inline-flex items-center justify-end gap-1.5 whitespace-nowrap">
                              {editingTrackingGroupKey === group.key ? (
                                <div className="inline-flex items-center gap-1">
                                  <input
                                    type="text"
                                    autoFocus
                                    value={trackingInputVal}
                                    onChange={(e) => setTrackingInputVal(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleSaveGroupTrackingNumber(group);
                                      } else if (e.key === 'Escape') {
                                        setEditingTrackingGroupKey(null);
                                      }
                                    }}
                                    placeholder="Enter tracking #..."
                                    className="w-36 bg-white border border-red-400 focus:border-neutral-900 rounded-lg px-2.5 py-1 text-[11px] font-bold text-neutral-900 focus:outline-none shadow-2xs"
                                  />
                                  <button
                                    type="button"
                                    disabled={updatingKey === `trk_${group.key}`}
                                    onClick={() => handleSaveGroupTrackingNumber(group)}
                                    className="bg-neutral-900 hover:bg-neutral-800 text-white text-[10px] font-bold px-2.5 py-1 rounded-lg cursor-pointer disabled:opacity-50"
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingTrackingGroupKey(null)}
                                    className="text-[10px] text-neutral-400 hover:text-neutral-700 px-1 cursor-pointer"
                                    title="Cancel"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ) : !allOrdered ? (
                                <button
                                  type="button"
                                  disabled={updatingKey === `all_ord_${group.key}`}
                                  onClick={() =>
                                    applySourcingStatusToOccurrences(
                                      group.occurrences,
                                      'ordered',
                                      `all_ord_${group.key}`
                                    )
                                  }
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-500 hover:bg-amber-600 text-white transition-colors cursor-pointer disabled:opacity-50"
                                >
                                  <ShoppingBag size={11} />
                                  <span>Order All</span>
                                </button>
                              ) : !allReceived ? (
                                isTrackingRequired ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingTrackingGroupKey(group.key);
                                      setTrackingInputVal(group.sourcingTrackingNumber || '');
                                    }}
                                    title="24+ hours since sourcing order was placed — click to input supplier tracking #"
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-red-600 hover:bg-red-700 text-white shadow-2xs transition-colors cursor-pointer animate-pulse"
                                  >
                                    <AlertCircle size={11} strokeWidth={2.5} />
                                    <span>Tracking # Required</span>
                                  </button>
                                ) : (
                                  <>
                                    {hasTrackingNumber ? (
                                      <SourcingTrackingChip
                                        trackingNumber={group.sourcingTrackingNumber}
                                        tracking={group.sourcingTracking}
                                        disabled={isSales}
                                        onEdit={() => {
                                          setEditingTrackingGroupKey(group.key);
                                          setTrackingInputVal(group.sourcingTrackingNumber || '');
                                        }}
                                        onStartTracking={() => startSourcingTracking(trackingRefsForGroup(group))}
                                      />
                                    ) : (
                                      !isSales && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setEditingTrackingGroupKey(group.key);
                                            setTrackingInputVal('');
                                          }}
                                          title="Add the supplier's tracking number to see live delivery status"
                                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-white text-neutral-600 border border-dashed border-neutral-300 hover:bg-neutral-50 hover:text-neutral-900 transition-colors cursor-pointer"
                                        >
                                          <Plus size={11} strokeWidth={2.5} />
                                          <span>Tracking</span>
                                        </button>
                                      )
                                    )}
                                    <button
                                      type="button"
                                      disabled={updatingKey === `all_rec_${group.key}`}
                                      onClick={() =>
                                        applySourcingStatusToOccurrences(
                                          group.occurrences,
                                          'received',
                                          `all_rec_${group.key}`
                                        )
                                      }
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors cursor-pointer disabled:opacity-50"
                                    >
                                      <Check size={11} strokeWidth={3} />
                                      <span>Receive All</span>
                                    </button>
                                  </>
                                )
                              ) : (
                                <button
                                  type="button"
                                  disabled={updatingKey === `all_rst_${group.key}`}
                                  onClick={() =>
                                    applySourcingStatusToOccurrences(
                                      group.occurrences,
                                      'to_order',
                                      `all_rst_${group.key}`
                                    )
                                  }
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-neutral-600 hover:text-red-600 bg-neutral-100 hover:bg-red-50 transition-colors cursor-pointer"
                                  title="Reset status to To Order"
                                >
                                  <RotateCcw size={11} />
                                  <span>Reset</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedGroups((prev) => ({
                                    ...prev,
                                    [group.key]: !prev[group.key]
                                  }))
                                }
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                                  isExpanded
                                    ? 'bg-neutral-900 text-white border-neutral-900'
                                    : 'bg-white text-brand-primary border-brand-border hover:bg-neutral-100'
                                }`}
                              >
                                <Users size={11} />
                                <span>{uniqueOrdersCount}</span>
                                {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Expanded Sub-Rows: Individuals Receiving This Garment */}
                        {isExpanded && (
                          <tr className="bg-neutral-50/90">
                            <td colSpan={allSizeColumns.length + 5} className="px-6 py-3">
                              <div className="border border-brand-border/80 rounded-xl bg-white overflow-hidden">
                                <table className="w-full border-collapse text-left text-xs">
                                  <thead>
                                    <tr className="bg-neutral-100/80 border-b border-brand-border/60 text-[10px] font-extrabold uppercase tracking-wider text-brand-secondary">
                                      <th className="py-1.5 px-3">Individual / Order</th>
                                      <th className="py-1.5 px-3 w-[140px]">Brand</th>
                                      <th className="py-1.5 px-3 w-[100px] text-center">Cut</th>
                                      <th className="py-1.5 px-3 w-[90px] text-center">Size</th>
                                      <th className="py-1.5 px-3 w-[70px] text-center">Qty</th>
                                      <th className="py-1.5 px-3 w-[180px] text-right">Status</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-brand-border/40">
                                    {group.occurrences.map((occ, idx) => (
                                      <tr key={`${occ.orderId}_${occ.itemId}_${occ.size}_${idx}`} className="hover:bg-neutral-50">
                                        <td className="py-2 px-3 font-bold text-brand-primary">
                                          <div className="flex items-center gap-1.5">
                                            <button
                                              type="button"
                                              onClick={() => navigate(`/orders/${occ.orderId}`)}
                                              className="hover:underline text-left flex items-center gap-1 cursor-pointer"
                                            >
                                              <span>{occ.orderTitle}</span>
                                              <ExternalLink size={11} className="text-neutral-400" />
                                            </button>
                                            {occ.isMvp && (
                                              <MvpStarIcon size={12} title="VIP" />
                                            )}
                                            {occ.getsBox && (
                                              <span title="Artist Box" className="inline-flex items-center text-black shrink-0">
                                                <Box size={12} strokeWidth={2.5} />
                                              </span>
                                            )}
                                          </div>
                                        </td>
                                        <td className="py-2 px-3 text-brand-secondary font-medium truncate">
                                          {occ.brandName}
                                        </td>
                                        <td className="py-2 px-3 text-center">
                                          <span
                                            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                                              occ.individualGender === 'Female'
                                                ? 'bg-pink-50 text-pink-700 border-pink-200'
                                                : occ.individualGender === 'Male'
                                                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                                                  : 'bg-neutral-100 text-neutral-600 border-neutral-200'
                                            }`}
                                          >
                                            {occ.individualGender}
                                          </span>
                                        </td>
                                        <td className="py-2 px-3 text-center font-black text-neutral-900">
                                          {occ.rawOrderSize && occ.rawOrderSize !== occ.size ? (
                                            <span title={`Profile/Order Size: ${occ.rawOrderSize} → Adjusted Order Size: ${occ.size}`}>
                                              <span className="text-neutral-400 line-through font-semibold mr-1">{occ.rawOrderSize}</span>
                                              <span>{occ.size}</span>
                                            </span>
                                          ) : (
                                            occ.size
                                          )}
                                        </td>
                                        <td className="py-2 px-3 text-center font-bold tabular-nums">
                                          {occ.qty}
                                        </td>
                                        <td className="py-2 px-3 text-right">
                                          <div className="inline-flex rounded-lg border border-brand-border overflow-hidden bg-white">
                                            <button
                                              type="button"
                                              onClick={() =>
                                                applySourcingStatusToOccurrences(
                                                  [occ],
                                                  'to_order',
                                                  `occ_${occ.orderId}_${occ.itemId}_${occ.size}`
                                                )
                                              }
                                              className={`px-2 py-0.5 text-[10px] font-bold cursor-pointer ${
                                                !occ.isOrdered && !occ.isReceived
                                                  ? 'bg-red-600 text-white'
                                                  : 'text-neutral-500 hover:bg-neutral-100'
                                              }`}
                                            >
                                              To Order
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                applySourcingStatusToOccurrences(
                                                  [occ],
                                                  'ordered',
                                                  `occ_${occ.orderId}_${occ.itemId}_${occ.size}`
                                                )
                                              }
                                              className={`px-2 py-0.5 text-[10px] font-bold border-l border-brand-border cursor-pointer ${
                                                occ.isOrdered && !occ.isReceived
                                                  ? 'bg-amber-500 text-white'
                                                  : 'text-neutral-500 hover:bg-neutral-100'
                                              }`}
                                            >
                                              Ordered
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                applySourcingStatusToOccurrences(
                                                  [occ],
                                                  'received',
                                                  `occ_${occ.orderId}_${occ.itemId}_${occ.size}`
                                                )
                                              }
                                              className={`px-2 py-0.5 text-[10px] font-bold border-l border-brand-border cursor-pointer ${
                                                occ.isReceived
                                                  ? 'bg-emerald-600 text-white'
                                                  : 'text-neutral-500 hover:bg-neutral-100'
                                              }`}
                                            >
                                              Received
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : (
        /* VIEW 2: BY INDIVIDUAL / ORDER SPREADSHEET */
        <div className="w-full border border-brand-border rounded-xl overflow-hidden bg-white shadow-2xs">
          <div className="overflow-x-auto w-full">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-neutral-50 border-b border-brand-border text-[10px] font-extrabold uppercase tracking-wider text-brand-secondary">
                  <th className="py-2.5 pl-4 pr-3 w-[220px]">Individual / Order</th>
                  <th className="py-2.5 px-3 w-[130px]">Brand</th>
                  <th className="py-2.5 px-3 w-[110px] text-center">Cut</th>
                  <th className="py-2.5 px-3 w-[80px] text-center">Profile Sz</th>
                  <th className="py-2.5 px-3">Garments &amp; Sourcing Status</th>
                  <th className="py-2.5 pl-3 pr-4 w-[110px] text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border/60 text-xs">
                {filteredOrders.map((order: any) => {
                  const brandName = brandNameMap[order.customerId] || customerName || 'Customer';
                  const gender = order.personalInfo?.gender || '';
                  const profileSize = (order.personalInfo?.size || '').toUpperCase();
                  const isMvp = Boolean(order.isMvp || order.personalInfo?.isMvp);
                  const getsBox = Boolean(order.getsBox || order.personalInfo?.getsBox);
                  const garmentItems = (order.items || []).filter(
                    (it: any) =>
                      it &&
                      !isDiscountItem(it) &&
                      !isNonGarmentItem(it) &&
                      it.itemType !== 'gang_sheet' &&
                      it.itemType !== 'service'
                  );
                  const hasUnassignedGarmentSizes =
                    Boolean(profileSize) &&
                    garmentItems.some(
                      (it: any) =>
                        !Object.values(it.sizes || {}).some((q) => (parseInt(String(q), 10) || 0) > 0)
                    );

                  return (
                    <tr key={order.id} className="hover:bg-neutral-50/80 transition-colors">
                      <td className="py-2.5 pl-4 pr-3 align-middle font-bold text-brand-primary">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate">{order.title || 'Untitled Order'}</span>
                          {isMvp && <MvpStarIcon size={13} title="VIP" />}
                          {getsBox && (
                            <span title="Artist Box" className="inline-flex items-center text-black shrink-0">
                              <Box size={13} strokeWidth={2.5} />
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 align-middle text-brand-secondary font-medium truncate">
                        {brandName}
                      </td>
                      <td className="py-2.5 px-3 align-middle text-center">
                        {gender ? (
                          <span
                            className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${
                              normalizeGender(gender) === 'Female'
                                ? 'bg-pink-50 text-pink-700 border-pink-200'
                                : 'bg-blue-50 text-blue-700 border-blue-200'
                            }`}
                          >
                            {gender}
                          </span>
                        ) : (
                          <span className="text-neutral-300">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 align-middle text-center font-black text-neutral-900">
                        {profileSize || <span className="text-neutral-300 font-normal">—</span>}
                      </td>
                      <td className="py-2.5 px-3 align-middle">
                        {garmentItems.length === 0 ? (
                          <span className="text-neutral-400 italic">No garments added</span>
                        ) : (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {garmentItems.map((it: any, idx: number) => {
                              const rawItStyle = (it.title || it.style || '').trim();
                              const itRackMatch =
                                (it.designerRackItemId && designerRackById[it.designerRackItemId]) ||
                                designerRackByTitle[rawItStyle.toLowerCase()];
                              const displayTitle = (itRackMatch?.title || itRackMatch?.name || rawItStyle).trim();
                              const itSizing = (itRackMatch?.sizingAdjustment || it.sizingAdjustment || '').trim();
                              const szEntries = Object.entries(it.sizes || {}).filter(
                                ([, q]) => (parseInt(String(q), 10) || 0) > 0
                              );
                              const displaySz =
                                szEntries.length > 0
                                  ? szEntries
                                      .map(([s, q]) => {
                                        const adjS = getAdjustedOrderSize(s.trim().toUpperCase(), itSizing);
                                        return `${adjS}:${q}`;
                                      })
                                      .join(', ')
                                  : profileSize
                                    ? `${getAdjustedOrderSize(profileSize, itSizing)}:1`
                                    : 'No Sz';
                              const rawCheckSz = szEntries[0]?.[0] || profileSize;
                              const adjCheckSz = rawCheckSz ? getAdjustedOrderSize(rawCheckSz, itSizing) : '';
                              const isRec = Boolean(
                                (rawCheckSz && (hasSizeInList(it.receivedSizes, rawCheckSz) || hasSizeInList(it.completedSizes, rawCheckSz))) ||
                                (adjCheckSz && (hasSizeInList(it.receivedSizes, adjCheckSz) || hasSizeInList(it.completedSizes, adjCheckSz)))
                              );
                              const isOrd =
                                isRec ||
                                Boolean(
                                  (rawCheckSz && hasSizeInList(it.orderedSizes, rawCheckSz)) ||
                                  (adjCheckSz && hasSizeInList(it.orderedSizes, adjCheckSz))
                                );

                              return (
                                <span
                                  key={it.id || idx}
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${
                                    isRec
                                      ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                                      : isOrd
                                        ? 'bg-amber-50 border-amber-300 text-amber-900'
                                        : 'bg-white border-brand-border text-brand-primary'
                                  }`}
                                >
                                  <span className="truncate max-w-[160px]">{displayTitle}</span>
                                  <span className="font-black text-[10px] px-1.5 py-0.2 rounded bg-black/5">
                                    {displaySz}
                                  </span>
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 pl-3 pr-4 align-middle text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {hasUnassignedGarmentSizes && (
                            <button
                              type="button"
                              disabled={updatingKey === `sync_${order.id}`}
                              onClick={() => handleSyncIndividualSizeToOrderItems(order)}
                              className="px-2 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold cursor-pointer"
                            >
                              Sync Sz
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => navigate(`/orders/${order.id}`)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-brand-border hover:border-brand-primary text-[11px] font-bold text-brand-primary bg-white cursor-pointer"
                          >
                            <span>Open</span>
                            <ExternalLink size={11} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
