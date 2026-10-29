import { useState, useMemo } from 'react';
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
  AlertTriangle,
  RotateCcw,
  Star,
  Box,
  Link as LinkIcon
} from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { isDiscountItem, isNonGarmentItem, sortGarmentSizes } from '../../lib/garmentUtils';

interface CustomerSourcingPanelProps {
  customerId: string;
  customerName: string;
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
  genderLabel: string;
  image: string;
  sourcingUrl: string;
  designerRackItemId: string;
  brandNames: string[];
  totalQty: number;
  orderedQty: number;
  receivedQty: number;
  sizesMap: Record<string, AggregatedSizeBucket>;
  occurrences: OccurrenceRef[];
}

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
  orders,
  subBrands,
  combinedDesignerRack,
  isSales = false,
  onPreviewImage
}: CustomerSourcingPanelProps) {
  const navigate = useNavigate();
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
        // Placed / active orders (Approved through In Production; exclude archived/completed >= 7 unless needed)
        return sIdx >= 3 && sIdx < 7;
      }
      if (pipelineFilter === 'include_quotes') {
        return sIdx < 7;
      }
      return true;
    });
  }, [orders, brandFilter, pipelineFilter]);

  // Build aggregated garment groups
  const { garmentGroups, summaryStats } = useMemo(() => {
    const groupsMap: Record<string, AggregatedGarmentGroup> = {};
    let totalUnits = 0;
    let totalOrdered = 0;
    let totalReceived = 0;

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

        const styleName = (item.title || item.style || 'Custom Garment').trim();
        const itemNum = (item.itemNum || '').trim();
        const color = (item.color || '').trim();
        const itemGenderNorm = normalizeGender(
          item.gender && item.gender !== 'Unisex' ? item.gender : indGenderRaw
        );

        // Find matching Designer Rack item if any
        const matchedRack =
          (item.designerRackItemId && designerRackById[item.designerRackItemId]) ||
          designerRackByTitle[styleName.toLowerCase()] ||
          null;

        const sourcingUrl =
          item.supplierUrl ||
          item.sourceUrl ||
          item.productUrl ||
          matchedRack?.garmentSourcingLink ||
          (itemNum && /^(AL|BC|PC|LPC|BP|K|L|S|Y|ST|LST|PST|YST|DT|DM|CS|MM|RH|TM|OG|LOG|NK|EB|CT|CX|AA|CH|GD|HN|G|SS|JR|RS|NL)\d/i.test(itemNum)
            ? `https://www.sanmar.com/search/?text=${encodeURIComponent(itemNum)}`
            : '');

        const image =
          item.image ||
          item.originalFrontImage ||
          matchedRack?.frontMockupUrl ||
          matchedRack?.mockupUrl ||
          matchedRack?.url ||
          '';

        // Extract size quantities
        const explicitSizeEntries = Object.entries(item.sizes || {}).filter(
          ([, q]) => (parseInt(String(q), 10) || 0) > 0
        );

        let effectiveSizes: { size: string; qty: number; inferred: boolean }[] = [];
        if (explicitSizeEntries.length > 0) {
          effectiveSizes = explicitSizeEntries.map(([sz, q]) => ({
            size: sz.trim().toUpperCase(),
            qty: parseInt(String(q), 10) || 0,
            inferred: false
          }));
        } else if (indSizeRaw) {
          // Fallback to individual's profile size if item size grid wasn't filled in yet
          const fallbackQty = Math.max(1, parseInt(String(item.qty || item.quantity || 1), 10) || 1);
          effectiveSizes = [{ size: indSizeRaw, qty: fallbackQty, inferred: true }];
        }

        if (effectiveSizes.length === 0) return;

        const genderKeyPart = splitByGender ? itemGenderNorm : 'ALL';
        const groupKey = `${(matchedRack?.id || styleName).toLowerCase()}__${itemNum.toLowerCase()}__${color.toLowerCase()}__${genderKeyPart}`;

        if (!groupsMap[groupKey]) {
          groupsMap[groupKey] = {
            key: groupKey,
            style: styleName,
            itemNum,
            color,
            genderLabel: splitByGender ? itemGenderNorm : 'All Cuts',
            image,
            sourcingUrl,
            designerRackItemId: matchedRack?.id || item.designerRackItemId || '',
            brandNames: [],
            totalQty: 0,
            orderedQty: 0,
            receivedQty: 0,
            sizesMap: {},
            occurrences: []
          };
        }

        const grp = groupsMap[groupKey];
        if (!grp.image && image) grp.image = image;
        if (!grp.sourcingUrl && sourcingUrl) grp.sourcingUrl = sourcingUrl;
        if (orderBrandName && !grp.brandNames.includes(orderBrandName)) {
          grp.brandNames.push(orderBrandName);
        }

        const orderedSizesArr: string[] = Array.isArray(item.orderedSizes)
          ? item.orderedSizes.map((s: string) => s.toUpperCase())
          : [];
        const receivedSizesArr: string[] = Array.isArray(item.receivedSizes)
          ? item.receivedSizes.map((s: string) => s.toUpperCase())
          : [];
        const completedSizesArr: string[] = Array.isArray(item.completedSizes)
          ? item.completedSizes.map((s: string) => s.toUpperCase())
          : [];

        effectiveSizes.forEach(({ size, qty, inferred }) => {
          const isCompleted = completedSizesArr.includes(size);
          const isReceived = isCompleted || receivedSizesArr.includes(size);
          const isOrdered = isReceived || orderedSizesArr.includes(size) || Number(order.statusIndex ?? 0) >= 5;

          if (!grp.sizesMap[size]) {
            grp.sizesMap[size] = {
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

          const bucket = grp.sizesMap[size];
          bucket.totalQty += qty;
          if (isOrdered) bucket.orderedQty += qty;
          if (isReceived) bucket.receivedQty += qty;

          if (itemGenderNorm === 'Male') bucket.maleQty += qty;
          else if (itemGenderNorm === 'Female') bucket.femaleQty += qty;
          else bucket.unisexQty += qty;

          const occ: OccurrenceRef = {
            orderId: order.id,
            orderTitle: order.title || 'Custom Order',
            portalId: order.portalId || order.id.substring(0, 8),
            customerId: order.customerId,
            brandName: orderBrandName,
            isMvp: orderIsMvp,
            getsBox: orderGetsBox,
            individualGender: indGenderRaw || item.gender || '',
            individualSize: indSizeRaw,
            itemId: item.id,
            size,
            qty,
            inferredFromProfile: inferred,
            isOrdered,
            isReceived,
            isCompleted
          };

          bucket.occurrences.push(occ);
          grp.occurrences.push(occ);

          grp.totalQty += qty;
          if (isOrdered) grp.orderedQty += qty;
          if (isReceived) grp.receivedQty += qty;

          totalUnits += qty;
          if (isOrdered) totalOrdered += qty;
          if (isReceived) totalReceived += qty;
        });
      });
    });

    let list = Object.values(groupsMap).sort((a, b) => {
      const aNeeds = a.totalQty - a.orderedQty;
      const bNeeds = b.totalQty - b.orderedQty;
      if ((aNeeds > 0) !== (bNeeds > 0)) return aNeeds > 0 ? -1 : 1;
      return a.style.localeCompare(b.style);
    });

    if (statusFilter === 'needs_ordering') {
      list = list.filter((g) => g.orderedQty < g.totalQty);
    } else if (statusFilter === 'ordered') {
      list = list.filter((g) => g.orderedQty > 0 && g.receivedQty < g.totalQty);
    } else if (statusFilter === 'received') {
      list = list.filter((g) => g.receivedQty >= g.totalQty && g.totalQty > 0);
    }

    return {
      garmentGroups: list,
      summaryStats: {
        totalUnits,
        needsOrdering: Math.max(0, totalUnits - totalOrdered),
        orderedPendingDelivery: Math.max(0, totalOrdered - totalReceived),
        received: totalReceived,
        stylesCount: Object.keys(groupsMap).length
      }
    };
  }, [filteredOrders, brandNameMap, customerName, designerRackById, designerRackByTitle, splitByGender, statusFilter]);

  // Apply status change to a list of occurrences (supports batching multiple items in the same order)
  const applySourcingStatusToOccurrences = async (
    occurrences: OccurrenceRef[],
    targetState: 'to_order' | 'ordered' | 'received',
    loadingId: string
  ) => {
    if (isSales || occurrences.length === 0) return;
    setUpdatingKey(loadingId);
    try {
      // Group occurrences by orderId so we update each order document once
      const byOrder: Record<string, OccurrenceRef[]> = {};
      occurrences.forEach((occ) => {
        if (!byOrder[occ.orderId]) byOrder[occ.orderId] = [];
        byOrder[occ.orderId].push(occ);
      });

      await Promise.all(
        Object.entries(byOrder).map(async ([ordId, occs]) => {
          const targetOrder = orders.find((o: any) => o.id === ordId);
          if (!targetOrder || !Array.isArray(targetOrder.items)) return;

          const updatedItems = targetOrder.items.map((item: any) => {
            const matchingOccs = occs.filter((o) => o.itemId === item.id);
            if (matchingOccs.length === 0) return item;

            const nextSizes = { ...(item.sizes || {}) };
            let orderedSet = new Set<string>(
              Array.isArray(item.orderedSizes) ? item.orderedSizes.map((s: string) => s.toUpperCase()) : []
            );
            let receivedSet = new Set<string>(
              Array.isArray(item.receivedSizes) ? item.receivedSizes.map((s: string) => s.toUpperCase()) : []
            );

            matchingOccs.forEach((occ) => {
              const sz = occ.size.toUpperCase();
              // Lock in the size quantity if it was inferred from the individual's profile
              if (!nextSizes[sz] || Number(nextSizes[sz]) <= 0) {
                nextSizes[sz] = occ.qty;
              }
              if (targetState === 'to_order') {
                orderedSet.delete(sz);
                receivedSet.delete(sz);
              } else if (targetState === 'ordered') {
                orderedSet.add(sz);
                receivedSet.delete(sz);
              } else if (targetState === 'received') {
                orderedSet.add(sz);
                receivedSet.add(sz);
              }
            });

            return {
              ...item,
              sizes: nextSizes,
              orderedSizes: Array.from(orderedSet),
              receivedSizes: Array.from(receivedSet)
            };
          });

          await updateDoc(doc(db, 'orders', ordId), {
            items: updatedItems
          });
        })
      );
    } catch (err) {
      console.error('Failed to update sourcing status:', err);
      alert('Failed to update garment sourcing status.');
    } finally {
      setUpdatingKey(null);
    }
  };

  const handleCycleSizeBucket = async (groupKey: string, bucket: AggregatedSizeBucket) => {
    if (isSales) return;
    // Determine next state for the bucket:
    // If not all ordered -> mark all 'ordered'
    // Else if not all received -> mark all 'received'
    // Else -> reset to 'to_order'
    const allOrdered = bucket.orderedQty >= bucket.totalQty;
    const allReceived = bucket.receivedQty >= bucket.totalQty;
    const nextState: 'to_order' | 'ordered' | 'received' = !allOrdered
      ? 'ordered'
      : !allReceived
        ? 'received'
        : 'to_order';

    await applySourcingStatusToOccurrences(bucket.occurrences, nextState, `${groupKey}__${bucket.size}`);
  };

  const handleSaveGroupSourcingLink = async (group: AggregatedGarmentGroup) => {
    if (isSales) return;
    const cleanUrl = linkInputVal.trim();
    setUpdatingKey(`link_${group.key}`);
    try {
      const byOrder: Record<string, Set<string>> = {};
      group.occurrences.forEach((occ) => {
        if (!byOrder[occ.orderId]) byOrder[occ.orderId] = new Set();
        byOrder[occ.orderId].add(occ.itemId);
      });

      await Promise.all(
        Object.entries(byOrder).map(async ([ordId, itemIds]) => {
          const targetOrder = orders.find((o: any) => o.id === ordId);
          if (!targetOrder || !Array.isArray(targetOrder.items)) return;
          const updatedItems = targetOrder.items.map((it: any) =>
            itemIds.has(it.id) ? { ...it, supplierUrl: cleanUrl } : it
          );
          await updateDoc(doc(db, 'orders', ordId), { items: updatedItems });
        })
      );
      setEditingLinkGroupKey(null);
    } catch (err) {
      console.error('Failed to save supplier link:', err);
    } finally {
      setUpdatingKey(null);
    }
  };

  const handleCopyGroupBreakdown = (group: AggregatedGarmentGroup) => {
    const sortedBuckets = Object.values(group.sizesMap).sort((a, b) => sortGarmentSizes(a.size, b.size));
    const sizesStr = sortedBuckets.map((b) => `${b.size}: ${b.totalQty}`).join(', ');
    const genderTag = group.genderLabel !== 'All Cuts' ? ` [${group.genderLabel}]` : '';
    const colorTag = group.color ? ` (${group.color})` : '';
    const styleTag = group.itemNum ? `${group.style} #${group.itemNum}` : group.style;
    const text = `${styleTag}${colorTag}${genderTag} — ${sizesStr} (Total: ${group.totalQty})`;
    navigator.clipboard.writeText(text);
    setCopiedKey(group.key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleSyncMissingSizesForOrder = async (order: any) => {
    if (isSales || !order?.personalInfo?.size) return;
    const targetSize = order.personalInfo.size.trim().toUpperCase();
    const targetGender = order.personalInfo.gender || order.personalInfo.sex || '';
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
    <div className="flex flex-col gap-5">
      {/* Top KPI Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-brand-bg/50 border border-brand-border/80 rounded-xl p-3.5 flex flex-col">
          <span className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary">Total Units Needed</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-serif text-2xl font-bold text-brand-primary tabular-nums">{summaryStats.totalUnits}</span>
            <span className="text-[11px] font-semibold text-brand-secondary">across {summaryStats.stylesCount} {summaryStats.stylesCount === 1 ? 'style' : 'styles'}</span>
          </div>
        </div>
        <div
          onClick={() => setStatusFilter(statusFilter === 'needs_ordering' ? 'all' : 'needs_ordering')}
          className={`border rounded-xl p-3.5 flex flex-col cursor-pointer transition-all ${
            statusFilter === 'needs_ordering'
              ? 'bg-red-50 border-red-300 ring-1 ring-red-300'
              : 'bg-red-50/40 border-red-200/70 hover:bg-red-50'
          }`}
        >
          <span className="text-[10px] font-bold uppercase tracking-widest text-red-700 flex items-center justify-between">
            <span>1. To Order from Supplier</span>
            {summaryStats.needsOrdering > 0 && <AlertTriangle size={12} className="text-red-600" />}
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-serif text-2xl font-bold text-red-700 tabular-nums">{summaryStats.needsOrdering}</span>
            <span className="text-[11px] font-semibold text-red-600/80">un-ordered units</span>
          </div>
        </div>
        <div
          onClick={() => setStatusFilter(statusFilter === 'ordered' ? 'all' : 'ordered')}
          className={`border rounded-xl p-3.5 flex flex-col cursor-pointer transition-all ${
            statusFilter === 'ordered'
              ? 'bg-amber-50 border-amber-300 ring-1 ring-amber-300'
              : 'bg-amber-50/40 border-amber-200/70 hover:bg-amber-50'
          }`}
        >
          <span className="text-[10px] font-bold uppercase tracking-widest text-amber-800 flex items-center justify-between">
            <span>2. Ordered / In Transit</span>
            <ShoppingBag size={12} className="text-amber-600" />
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-serif text-2xl font-bold text-amber-800 tabular-nums">{summaryStats.orderedPendingDelivery}</span>
            <span className="text-[11px] font-semibold text-amber-700/80">awaiting arrival</span>
          </div>
        </div>
        <div
          onClick={() => setStatusFilter(statusFilter === 'received' ? 'all' : 'received')}
          className={`border rounded-xl p-3.5 flex flex-col cursor-pointer transition-all ${
            statusFilter === 'received'
              ? 'bg-emerald-50 border-emerald-300 ring-1 ring-emerald-300'
              : 'bg-emerald-50/40 border-emerald-200/70 hover:bg-emerald-50'
          }`}
        >
          <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-800 flex items-center justify-between">
            <span>3. Received in Shop</span>
            <Check size={12} strokeWidth={3} className="text-emerald-600" />
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-serif text-2xl font-bold text-emerald-800 tabular-nums">{summaryStats.received}</span>
            <span className="text-[11px] font-semibold text-emerald-700/80">ready for production</span>
          </div>
        </div>
      </div>

      {/* Filters & View Switcher Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-neutral-50 border border-brand-border/70 p-3 rounded-xl">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* View Mode */}
          <div className="inline-flex rounded-lg bg-white p-0.5 border border-brand-border shadow-2xs">
            <button
              type="button"
              onClick={() => setViewMode('by_garment')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === 'by_garment'
                  ? 'bg-neutral-900 text-white shadow-2xs'
                  : 'text-brand-secondary hover:text-brand-primary'
              }`}
            >
              <Layers size={13} />
              <span>Supplier Buy List (By Garment)</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('by_individual')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === 'by_individual'
                  ? 'bg-neutral-900 text-white shadow-2xs'
                  : 'text-brand-secondary hover:text-brand-primary'
              }`}
            >
              <Users size={13} />
              <span>By Individual / Order ({filteredOrders.length})</span>
            </button>
          </div>

          {/* Sub-Brand Filter */}
          {subBrands.length > 0 && (
            <select
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              className="bg-white border border-brand-border rounded-lg px-3 py-1.5 text-xs font-bold text-brand-primary focus:outline-none focus:border-brand-primary cursor-pointer"
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

          {/* Pipeline Stage Filter */}
          <select
            value={pipelineFilter}
            onChange={(e) => setPipelineFilter(e.target.value as any)}
            className="bg-white border border-brand-border rounded-lg px-3 py-1.5 text-xs font-bold text-brand-primary focus:outline-none focus:border-brand-primary cursor-pointer"
          >
            <option value="active_orders">Active Orders (Approved – In Production)</option>
            <option value="include_quotes">Active Orders + Quotes</option>
            <option value="all">All Orders (Including Shipped)</option>
          </select>
        </div>

        {/* Right Controls: Split by Gender & Status Reset */}
        {viewMode === 'by_garment' && (
          <div className="flex items-center gap-2.5 flex-wrap">
            <label
              className="inline-flex items-center gap-2 bg-white border border-brand-border px-3 py-1.5 rounded-lg text-xs font-bold text-brand-primary cursor-pointer select-none hover:border-brand-primary/50 transition-colors"
              title="Separate Male and Female orders into distinct rows so you can order Men's vs Women's cuts accurately"
            >
              <input
                type="checkbox"
                checked={splitByGender}
                onChange={(e) => setSplitByGender(e.target.checked)}
                className="w-3.5 h-3.5 rounded accent-neutral-900 cursor-pointer"
              />
              <span>Separate Male / Female Cuts</span>
            </label>
            {statusFilter !== 'all' && (
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className="text-xs font-bold text-brand-secondary hover:text-brand-primary underline cursor-pointer px-1"
              >
                Show All ({summaryStats.stylesCount})
              </button>
            )}
          </div>
        )}
      </div>

      {/* VIEW 1: SUPPLIER BUY LIST (BY GARMENT) */}
      {viewMode === 'by_garment' ? (
        garmentGroups.length === 0 ? (
          <div className="bg-brand-bg/40 border border-dashed border-brand-border rounded-2xl p-10 text-center flex flex-col items-center justify-center gap-2">
            <Shirt size={28} className="text-brand-secondary/50" />
            <p className="text-sm font-bold text-brand-primary">No garments match the current sourcing filter.</p>
            <p className="text-xs text-brand-secondary max-w-md">
              Make sure your orders have garments added to them, or switch the filter above to "Active Orders + Quotes" to view unapproved quotes.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between px-1 text-[11px] text-brand-secondary font-medium">
              <span>
                💡 <strong>Tip:</strong> Click any size box below to cycle its status:{' '}
                <span className="inline-block px-1.5 py-0.5 rounded bg-white border border-neutral-300 text-neutral-700 font-bold text-[10px]">To Order</span>
                {' → '}
                <span className="inline-block px-1.5 py-0.5 rounded bg-amber-100 border border-amber-300 text-amber-900 font-bold text-[10px]">Ordered</span>
                {' → '}
                <span className="inline-block px-1.5 py-0.5 rounded bg-emerald-100 border border-emerald-300 text-emerald-900 font-bold text-[10px]">Received</span>
              </span>
            </div>

            {garmentGroups.map((group) => {
              const sortedBuckets = Object.values(group.sizesMap).sort((a, b) => sortGarmentSizes(a.size, b.size));
              const isExpanded = Boolean(expandedGroups[group.key]);
              const allOrdered = group.orderedQty >= group.totalQty && group.totalQty > 0;
              const allReceived = group.receivedQty >= group.totalQty && group.totalQty > 0;
              const uniqueOrdersCount = new Set(group.occurrences.map((o) => o.orderId)).size;

              return (
                <div
                  key={group.key}
                  className={`rounded-2xl border transition-all overflow-hidden bg-white shadow-2xs ${
                    allReceived
                      ? 'border-emerald-300 bg-emerald-50/10'
                      : allOrdered
                        ? 'border-amber-300 bg-amber-50/10'
                        : 'border-brand-border hover:border-brand-primary/40'
                  }`}
                >
                  {/* Main Garment Row */}
                  <div className="p-4 sm:p-5 flex flex-col xl:flex-row xl:items-center justify-between gap-5">
                    {/* Left: Thumbnail + Garment Details + Supplier Link */}
                    <div className="flex items-start sm:items-center gap-4 min-w-0 xl:w-[360px] shrink-0">
                      <div
                        onClick={() => group.image && onPreviewImage?.({ src: group.image, alt: group.style })}
                        className={`w-16 h-16 rounded-xl border border-brand-border/70 bg-neutral-50 flex items-center justify-center p-1.5 shrink-0 overflow-hidden ${
                          group.image ? 'cursor-zoom-in hover:scale-105 transition-transform' : ''
                        }`}
                      >
                        {group.image ? (
                          <img src={group.image} alt={group.style} className="w-full h-full object-contain mix-blend-multiply" />
                        ) : (
                          <Shirt size={24} className="text-neutral-300" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-bold text-base text-brand-primary truncate" title={group.style}>
                            {group.style}
                          </h4>
                          {group.genderLabel !== 'All Cuts' && (
                            <span
                              className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                                group.genderLabel === 'Female'
                                  ? 'bg-pink-50 text-pink-700 border-pink-200'
                                  : group.genderLabel === 'Male'
                                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                                    : 'bg-neutral-100 text-neutral-700 border-neutral-200'
                              }`}
                            >
                              {group.genderLabel}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 flex-wrap mt-1 text-xs text-brand-secondary font-medium">
                          {group.itemNum && <span className="font-bold text-neutral-700">#{group.itemNum}</span>}
                          {group.color && <span>• {group.color}</span>}
                          {group.brandNames.map((bn) => (
                            <span
                              key={bn}
                              className="text-[10px] bg-neutral-100 border border-neutral-200 text-neutral-700 px-1.5 py-0.5 rounded font-bold"
                            >
                              {bn}
                            </span>
                          ))}
                        </div>

                        {/* Supplier Sourcing Link & Copy Breakdown */}
                        {!isSales && (
                          <div className="flex items-center gap-2 flex-wrap mt-2.5">
                            {group.sourcingUrl ? (
                              <a
                                href={group.sourcingUrl.startsWith('http') ? group.sourcingUrl : `https://${group.sourcingUrl}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-[11px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-600 hover:text-white border border-blue-200 hover:border-blue-600 px-2.5 py-1 rounded-lg transition-all"
                              >
                                <ExternalLink size={11} />
                                <span>Open Supplier Link</span>
                              </a>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingLinkGroupKey(group.key);
                                  setLinkInputVal('');
                                }}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-neutral-500 hover:text-brand-primary bg-neutral-100 hover:bg-neutral-200/70 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                              >
                                <LinkIcon size={11} />
                                <span>+ Add Sourcing Link</span>
                              </button>
                            )}

                            {group.sourcingUrl && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingLinkGroupKey(editingLinkGroupKey === group.key ? null : group.key);
                                  setLinkInputVal(group.sourcingUrl);
                                }}
                                className="text-[10px] font-semibold text-neutral-400 hover:text-brand-primary underline cursor-pointer"
                              >
                                Edit Link
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleCopyGroupBreakdown(group)}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-neutral-600 hover:text-black bg-neutral-100 hover:bg-neutral-200/70 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                              title="Copy size breakdown to clipboard"
                            >
                              {copiedKey === group.key ? (
                                <>
                                  <Check size={11} className="text-emerald-600" />
                                  <span className="text-emerald-700 font-bold">Copied!</span>
                                </>
                              ) : (
                                <>
                                  <Copy size={11} />
                                  <span>Copy Sizes</span>
                                </>
                              )}
                            </button>
                          </div>
                        )}

                        {editingLinkGroupKey === group.key && !isSales && (
                          <div className="mt-2 flex items-center gap-1.5">
                            <input
                              type="url"
                              value={linkInputVal}
                              onChange={(e) => setLinkInputVal(e.target.value)}
                              placeholder="https://www.sanmar.com/..."
                              className="flex-1 bg-white border border-brand-border rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:border-brand-primary"
                            />
                            <button
                              type="button"
                              disabled={updatingKey === `link_${group.key}`}
                              onClick={() => handleSaveGroupSourcingLink(group)}
                              className="bg-black text-white text-[11px] font-bold px-2.5 py-1 rounded-lg hover:bg-neutral-800 cursor-pointer"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingLinkGroupKey(null)}
                              className="text-xs text-neutral-400 hover:text-neutral-700 px-1 cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Center: Interactive Size Breakdown Matrix */}
                    <div className="flex-1 flex flex-wrap items-center gap-2">
                      {sortedBuckets.map((bucket) => {
                        const bucketAllReceived = bucket.receivedQty >= bucket.totalQty;
                        const bucketAllOrdered = bucket.orderedQty >= bucket.totalQty;
                        const bucketPartialOrdered = bucket.orderedQty > 0 && !bucketAllOrdered;
                        const isUpdatingThis = updatingKey === `${group.key}__${bucket.size}`;

                        let topBg = 'bg-neutral-800 text-white';
                        let cardBorder = 'border-neutral-300 bg-white hover:border-black';
                        let statusBadge = 'To Order';
                        let statusColor = 'text-red-600 bg-red-50 border-red-200';

                        if (bucketAllReceived) {
                          topBg = 'bg-emerald-600 text-white';
                          cardBorder = 'border-emerald-400 bg-emerald-50/40 hover:border-emerald-600';
                          statusBadge = 'Received';
                          statusColor = 'text-emerald-800 bg-emerald-100 border-emerald-300';
                        } else if (bucketAllOrdered) {
                          topBg = 'bg-amber-500 text-white';
                          cardBorder = 'border-amber-400 bg-amber-50/40 hover:border-amber-600';
                          statusBadge = 'Ordered';
                          statusColor = 'text-amber-900 bg-amber-100 border-amber-300';
                        } else if (bucketPartialOrdered) {
                          topBg = 'bg-amber-500 text-white';
                          cardBorder = 'border-amber-300 bg-white';
                          statusBadge = `${bucket.orderedQty}/${bucket.totalQty} Ord`;
                          statusColor = 'text-amber-800 bg-amber-50 border-amber-200';
                        }

                        return (
                          <button
                            key={bucket.size}
                            type="button"
                            disabled={isSales || isUpdatingThis}
                            onClick={() => handleCycleSizeBucket(group.key, bucket)}
                            title={`Size ${bucket.size}: ${bucket.totalQty} needed (${bucket.orderedQty} ordered, ${bucket.receivedQty} received). Click to cycle status.`}
                            className={`min-w-[74px] rounded-xl border-2 transition-all flex flex-col overflow-hidden shadow-2xs ${cardBorder} ${
                              isSales ? 'cursor-default' : 'cursor-pointer hover:-translate-y-0.5 hover:shadow-sm'
                            } ${isUpdatingThis ? 'opacity-50' : ''}`}
                          >
                            <div className={`px-2.5 py-1 text-xs font-extrabold uppercase tracking-wider flex items-center justify-between gap-1 w-full ${topBg}`}>
                              <span>{bucket.size}</span>
                              {bucketAllReceived ? (
                                <Check size={11} strokeWidth={3} />
                              ) : bucketAllOrdered ? (
                                <ShoppingBag size={10} />
                              ) : null}
                            </div>
                            <div className="px-2.5 py-2 flex flex-col items-center justify-center w-full">
                              <span className="font-serif text-xl font-bold text-brand-primary leading-none tabular-nums">
                                {bucket.totalQty}
                              </span>
                              {!splitByGender && (bucket.maleQty > 0 || bucket.femaleQty > 0) && (
                                <span className="text-[9px] font-bold text-neutral-500 mt-1">
                                  {[
                                    bucket.maleQty > 0 ? `${bucket.maleQty}M` : '',
                                    bucket.femaleQty > 0 ? `${bucket.femaleQty}F` : '',
                                    bucket.unisexQty > 0 ? `${bucket.unisexQty}U` : ''
                                  ]
                                    .filter(Boolean)
                                    .join(' • ')}
                                </span>
                              )}
                              <span className={`mt-1.5 text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded border ${statusColor}`}>
                                {statusBadge}
                              </span>
                            </div>
                          </button>
                        );
                      })}

                      {/* Total Pill */}
                      <div className="min-w-[74px] rounded-xl border border-dashed border-brand-border bg-neutral-50 px-3 py-2 flex flex-col items-center justify-center">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-brand-secondary">Total</span>
                        <span className="font-serif text-xl font-bold text-brand-primary leading-tight mt-0.5 tabular-nums">
                          {group.totalQty}
                        </span>
                        <span className="text-[9px] font-semibold text-brand-secondary mt-0.5">
                          {uniqueOrdersCount} {uniqueOrdersCount === 1 ? 'order' : 'orders'}
                        </span>
                      </div>
                    </div>

                    {/* Right: Batch Actions & Expand Individuals */}
                    <div className="flex flex-wrap xl:flex-col items-center xl:items-end justify-between gap-2 shrink-0 border-t xl:border-t-0 pt-3 xl:pt-0 border-brand-border/50">
                      {!isSales && (
                        <div className="flex items-center gap-1.5">
                          {!allOrdered ? (
                            <button
                              type="button"
                              disabled={updatingKey === `all_ord_${group.key}`}
                              onClick={() =>
                                applySourcingStatusToOccurrences(group.occurrences, 'ordered', `all_ord_${group.key}`)
                              }
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
                            >
                              <ShoppingBag size={12} />
                              <span>Mark All Ordered</span>
                            </button>
                          ) : !allReceived ? (
                            <button
                              type="button"
                              disabled={updatingKey === `all_rec_${group.key}`}
                              onClick={() =>
                                applySourcingStatusToOccurrences(group.occurrences, 'received', `all_rec_${group.key}`)
                              }
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
                            >
                              <Check size={12} strokeWidth={3} />
                              <span>Mark All Received</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={updatingKey === `all_rst_${group.key}`}
                              onClick={() =>
                                applySourcingStatusToOccurrences(group.occurrences, 'to_order', `all_rst_${group.key}`)
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-neutral-600 hover:text-red-600 bg-neutral-100 hover:bg-red-50 transition-colors cursor-pointer"
                              title="Reset sourcing status for this garment"
                            >
                              <RotateCcw size={11} />
                              <span>Reset</span>
                            </button>
                          )}
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          setExpandedGroups((prev) => ({
                            ...prev,
                            [group.key]: !prev[group.key]
                          }))
                        }
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-secondary hover:text-brand-primary px-2.5 py-1 rounded-lg hover:bg-neutral-100 transition-colors cursor-pointer"
                      >
                        <Users size={13} />
                        <span>
                          {isExpanded ? 'Hide' : 'Show'} {uniqueOrdersCount}{' '}
                          {uniqueOrdersCount === 1 ? 'Individual' : 'Individuals'}
                        </span>
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Breakdown of Which Individuals Need This Garment */}
                  {isExpanded && (
                    <div className="border-t border-brand-border/70 bg-neutral-50/70 px-4 py-3">
                      <div className="grid grid-cols-1 md:grid-cols-[minmax(180px,1.5fr)_120px_110px_110px_160px] gap-2 text-[10px] font-extrabold uppercase tracking-widest text-brand-secondary pb-2 border-b border-brand-border/60">
                        <div>Individual / Order</div>
                        <div>Brand</div>
                        <div>Profile Info</div>
                        <div>Size & Qty</div>
                        <div className="text-right">Sourcing Status</div>
                      </div>
                      <div className="divide-y divide-brand-border/40">
                        {group.occurrences.map((occ, idx) => (
                          <div
                            key={`${occ.orderId}-${occ.itemId}-${occ.size}-${idx}`}
                            className="grid grid-cols-1 md:grid-cols-[minmax(180px,1.5fr)_120px_110px_110px_160px] gap-2 py-2.5 items-center text-xs"
                          >
                            <div
                              onClick={() => navigate(`/orders/${occ.orderId}`)}
                              className="font-bold text-brand-primary hover:underline cursor-pointer flex items-center gap-1.5 truncate"
                            >
                              <span className="truncate">{occ.orderTitle}</span>
                              {occ.isMvp && <Star size={13} className="fill-amber-400 text-amber-500 shrink-0" />}
                              {occ.getsBox && (
                                <span className="inline-flex items-center text-amber-700 bg-amber-50 border border-amber-200 px-1 py-0.5 rounded shrink-0">
                                  <Box size={10} />
                                </span>
                              )}
                            </div>
                            <div className="text-brand-secondary font-medium truncate">{occ.brandName}</div>
                            <div className="text-[11px] font-semibold text-neutral-600 uppercase">
                              {[occ.individualGender, occ.individualSize ? `Sz ${occ.individualSize}` : '']
                                .filter(Boolean)
                                .join(' • ') || '—'}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="px-2 py-0.5 rounded bg-neutral-900 text-white font-extrabold text-[11px]">
                                {occ.size} × {occ.qty}
                              </span>
                              {occ.inferredFromProfile && (
                                <span
                                  className="text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded"
                                  title="Inferred from individual's profile size"
                                >
                                  Auto-Size
                                </span>
                              )}
                            </div>
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                disabled={isSales}
                                onClick={() =>
                                  applySourcingStatusToOccurrences(
                                    [occ],
                                    occ.isReceived ? 'to_order' : occ.isOrdered ? 'received' : 'ordered',
                                    `occ_${occ.orderId}_${occ.itemId}_${occ.size}`
                                  )
                                }
                                className={`px-2.5 py-1 rounded-md text-[10px] font-extrabold uppercase tracking-wider border transition-colors ${
                                  occ.isReceived
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200'
                                    : occ.isOrdered
                                      ? 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200'
                                      : 'bg-white text-red-600 border-red-200 hover:bg-red-50'
                                } ${isSales ? 'cursor-default' : 'cursor-pointer'}`}
                              >
                                {occ.isReceived ? '✓ Received' : occ.isOrdered ? 'Ordered' : 'Mark Ordered'}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* VIEW 2: BY INDIVIDUAL / ORDER SPREADSHEET */
        <div className="bg-white rounded-2xl border border-brand-border overflow-hidden shadow-2xs">
          <div className="hidden md:grid md:grid-cols-[minmax(190px,1.3fr)_120px_130px_minmax(260px,2fr)_130px] bg-neutral-100/80 border-b border-brand-border text-[10px] font-extrabold uppercase tracking-widest text-brand-secondary px-4 py-3">
            <div>Individual / Order</div>
            <div>Brand</div>
            <div>Individual Size</div>
            <div>Garments in Order</div>
            <div className="text-right">Action</div>
          </div>

          {filteredOrders.length === 0 ? (
            <div className="p-8 text-center text-sm text-brand-secondary">No active orders found.</div>
          ) : (
            <div className="divide-y divide-brand-border/60">
              {filteredOrders.map((order: any) => {
                const indGender = order.personalInfo?.gender || order.personalInfo?.sex || '';
                const indSize = (order.personalInfo?.size || '').trim().toUpperCase();
                const garmentItems = (order.items || []).filter(
                  (it: any) =>
                    it &&
                    !isDiscountItem(it) &&
                    !isNonGarmentItem(it) &&
                    it.itemType !== 'gang_sheet' &&
                    it.itemType !== 'service'
                );
                const hasUnassignedGarmentSizes =
                  Boolean(indSize) &&
                  garmentItems.some(
                    (it: any) => !Object.values(it.sizes || {}).some((q) => (parseInt(String(q), 10) || 0) > 0)
                  );

                return (
                  <div
                    key={order.id}
                    className="grid grid-cols-1 md:grid-cols-[minmax(190px,1.3fr)_120px_130px_minmax(260px,2fr)_130px] items-center gap-3 px-4 py-3.5 hover:bg-brand-bg/30 transition-colors"
                  >
                    <div
                      onClick={() => navigate(`/orders/${order.id}`)}
                      className="cursor-pointer group flex items-center gap-2 min-w-0"
                    >
                      <span className="font-serif text-base font-bold text-brand-primary group-hover:underline truncate">
                        {order.title || 'Custom Order'}
                      </span>
                      {Boolean(order.isMvp || order.personalInfo?.isMvp) && (
                        <Star size={15} className="fill-amber-400 text-amber-500 shrink-0" />
                      )}
                      {Boolean(order.getsBox || order.personalInfo?.getsBox) && (
                        <span
                          className="inline-flex items-center text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0"
                          title="Gets a Box"
                        >
                          <Box size={11} />
                        </span>
                      )}
                    </div>

                    <div className="text-xs font-semibold text-brand-secondary truncate">
                      {brandNameMap[order.customerId] || customerName}
                    </div>

                    <div>
                      {indGender || indSize ? (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-lg bg-neutral-100 text-brand-primary border border-brand-border">
                          <span>{indGender || 'Unisex'}</span>
                          {indSize && <span className="text-brand-primary">• Sz {indSize}</span>}
                        </span>
                      ) : (
                        <span className="text-xs text-neutral-400 italic">Bulk / Standard</span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {garmentItems.length === 0 ? (
                        <span className="text-xs text-red-500 font-semibold">No garments added to order yet</span>
                      ) : (
                        garmentItems.map((it: any) => {
                          const activeSizes = Object.entries(it.sizes || {}).filter(
                            ([, q]) => (parseInt(String(q), 10) || 0) > 0
                          );
                          const sizeLabel =
                            activeSizes.length > 0
                              ? activeSizes.map(([s, q]) => `${s}×${q}`).join(', ')
                              : indSize
                                ? `${indSize}×1 (auto)`
                                : 'No size';
                          const orderedArr: string[] = Array.isArray(it.orderedSizes)
                            ? it.orderedSizes.map((s: string) => s.toUpperCase())
                            : [];
                          const receivedArr: string[] = Array.isArray(it.receivedSizes)
                            ? it.receivedSizes.map((s: string) => s.toUpperCase())
                            : [];
                          const checkSz = activeSizes[0]?.[0]?.toUpperCase() || indSize;
                          const isRec = checkSz ? receivedArr.includes(checkSz) : false;
                          const isOrd = isRec || (checkSz ? orderedArr.includes(checkSz) : false);

                          return (
                            <span
                              key={it.id}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                                isRec
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                                  : isOrd
                                    ? 'bg-amber-50 border-amber-200 text-amber-900'
                                    : 'bg-white border-brand-border text-brand-primary'
                              }`}
                            >
                              <span className="truncate max-w-[140px]">{it.title || it.style || 'Garment'}</span>
                              <span className="px-1.5 py-0.25 rounded bg-black/80 text-white text-[10px]">
                                {sizeLabel}
                              </span>
                            </span>
                          );
                        })
                      )}
                    </div>

                    <div className="flex items-center justify-end gap-2">
                      {hasUnassignedGarmentSizes && !isSales && (
                        <button
                          type="button"
                          disabled={updatingKey === `sync_${order.id}`}
                          onClick={() => handleSyncMissingSizesForOrder(order)}
                          className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-extrabold uppercase tracking-wider cursor-pointer transition-colors"
                          title={`Lock in Size ${indSize} on all garments in this order`}
                        >
                          Sync Sz {indSize}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => navigate(`/orders/${order.id}`)}
                        className="px-2.5 py-1 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-brand-primary text-xs font-bold cursor-pointer transition-colors"
                      >
                        Open Order
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
