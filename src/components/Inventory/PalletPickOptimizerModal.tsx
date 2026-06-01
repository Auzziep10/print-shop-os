import { useState, useEffect } from 'react';
import { X, Layers, Box, MapPin, Check, CheckCircle2, Search, ShoppingBag, Printer, Loader2, ArrowRight, AlertTriangle, Map as MapIcon, Archive } from 'lucide-react';
import QRCode from 'react-qr-code';
import { db } from '../../lib/firebase';
import { collection, query, onSnapshot, doc, setDoc, updateDoc } from 'firebase/firestore';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  preSelectedOrder?: any;
  onLocatePallet?: (palletId: string, zone: string, warehouseId?: string) => void;
}

interface UnmetNeed {
  orderItemId: string;
  style: string;
  color: string;
  size: string;
  needed: number;
  unresolved: number;
  skusMap?: Record<string, string>;
  generalSku?: string;
  image?: string;
}

const matchPalletItem = (palletItem: any, orderItem: any, size: string) => {
  // 1. Size-specific SKU check
  if (orderItem.skusMap && orderItem.skusMap[size]) {
     return palletItem.sku && palletItem.sku.toLowerCase() === orderItem.skusMap[size].toLowerCase();
  }
  
  // 2. Generic itemNum check
  if (orderItem.generalSku) {
     return palletItem.sku && palletItem.sku.toLowerCase() === orderItem.generalSku.toLowerCase();
  }
  
  // 3. Fallback: match by style name + size (only if no SKUs are defined in the order)
  const palletItemName = (palletItem.name || '').toLowerCase();
  const orderItemStyle = (orderItem.style || '').toLowerCase();
  const palletItemSize = (palletItem.size || '').toLowerCase();
  
  if (palletItemSize === size.toLowerCase()) {
     if (palletItemName.includes(orderItemStyle) || orderItemStyle.includes(palletItemName)) {
        return true;
     }
  }
  
  return false;
};

export function PalletPickOptimizerModal({ isOpen, onClose, preSelectedOrder, onLocatePallet }: Props) {
  const [orders, setOrders] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(preSelectedOrder || null);
  const [searchOrderQuery, setSearchOrderQuery] = useState('');
  
  const [pallets, setPallets] = useState<any[]>([]);
  const [palletsLoading, setPalletsLoading] = useState(false);
  
  const [optimizationResult, setOptimizationResult] = useState<{ route: any[]; unresolved: UnmetNeed[] } | null>(null);
  const [checkedPicks, setCheckedPicks] = useState<Record<string, boolean>>({});

  const [selectorMode, setSelectorMode] = useState<'local' | 'shopify' | 'archived'>('local');
  const [shopifySearchTag, setShopifySearchTag] = useState('');
  const [shopifyOrders, setShopifyOrders] = useState<any[]>([]);
  const [shopifySearchLoading, setShopifySearchLoading] = useState(false);
  const [selectedShopifyOrderIds, setSelectedShopifyOrderIds] = useState<Set<string>>(new Set());
  const [isGeneratingTempOrder, setIsGeneratingTempOrder] = useState(false);
  const [isApplyingPicks, setIsApplyingPicks] = useState(false);

  // Reset states when order changes
  useEffect(() => {
    setSelectedOrder(preSelectedOrder || null);
    setOptimizationResult(null);
    setCheckedPicks({});
    setSelectorMode('local');
    setShopifySearchTag('');
    setShopifyOrders([]);
    setSelectedShopifyOrderIds(new Set());
  }, [preSelectedOrder, isOpen]);

  // Load orders if no pre-selected order is provided
  useEffect(() => {
    if (preSelectedOrder || !isOpen) return;
    
    setOrdersLoading(true);
    const q = query(collection(db, 'orders'));
    const unsub = onSnapshot(q, (snap) => {
      const ordersData = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      // Sort: newest first
      ordersData.sort((a: any, b: any) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });
      setOrders(ordersData);
      setOrdersLoading(false);
    });
    
    return () => unsub();
  }, [preSelectedOrder, isOpen]);

  // Load pallets
  useEffect(() => {
    if (!isOpen) return;
    
    setPalletsLoading(true);
    const q = query(collection(db, 'pallets'));
    const unsub = onSnapshot(q, (snap) => {
      const palletsData = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setPallets(palletsData);
      setPalletsLoading(false);
    });
    
    return () => unsub();
  }, [isOpen]);

  // Run optimization when order and pallets are loaded
  useEffect(() => {
    if (!selectedOrder || pallets.length === 0) {
      setOptimizationResult(null);
      return;
    }

    if (selectedOrder.isArchivedPick) {
      setOptimizationResult({
        route: selectedOrder.pickRoute || [],
        unresolved: selectedOrder.unresolvedPicks || []
      });
      setCheckedPicks(selectedOrder.checkedPicks || {});
      return;
    }

    // Run the greedy set cover picking optimizer
    // 1. Parse needed items
    const unmetNeeds: UnmetNeed[] = [];
    selectedOrder.items?.forEach((item: any) => {
       if (!item.sizes) return;
       Object.entries(item.sizes).forEach(([size, qty]: [string, any]) => {
          const neededQty = parseInt(qty) || 0;
          if (neededQty > 0) {
             unmetNeeds.push({
                orderItemId: item.id,
                style: item.style || 'Unknown Style',
                color: item.color || '',
                size: size,
                needed: neededQty,
                unresolved: neededQty,
                skusMap: item.skus || {},
                generalSku: item.itemNum || '',
                image: item.image || ''
             });
          }
       });
    });

    // 2. Clone pallets to simulate picking
    const inventoryPallets = pallets.map(p => ({
       ...p,
       boxes: p.boxes?.map((b: any) => ({
          ...b,
          items: b.items?.map((i: any) => ({ ...i })) || []
       })) || []
    }));

    const pickRoute: any[] = [];

    // 3. Greedy allocation loop
    while (unmetNeeds.some(need => need.unresolved > 0)) {
       let bestPalletIndex = -1;
       let bestUsefulQty = 0;

       inventoryPallets.forEach((pallet, pIdx) => {
          let palletUsefulQty = 0;
          
          pallet.boxes?.forEach((box: any) => {
             box.items?.forEach((invItem: any) => {
                unmetNeeds.forEach(need => {
                   if (need.unresolved > 0 && matchPalletItem(invItem, need, need.size)) {
                      const contribution = Math.min(invItem.quantity, need.unresolved);
                      palletUsefulQty += contribution;
                   }
                });
             });
          });

          if (palletUsefulQty > bestUsefulQty) {
             bestUsefulQty = palletUsefulQty;
             bestPalletIndex = pIdx;
          }
       });

       if (bestUsefulQty === 0 || bestPalletIndex === -1) {
          break;
       }

       const selectedPallet = inventoryPallets[bestPalletIndex];
       const palletPicks: any[] = [];

       selectedPallet.boxes?.forEach((box: any) => {
          const boxPicks: any[] = [];
          
          box.items?.forEach((invItem: any) => {
             if (invItem.quantity <= 0) return;

             unmetNeeds.forEach(need => {
                if (need.unresolved > 0 && invItem.quantity > 0 && matchPalletItem(invItem, need, need.size)) {
                   const pickQty = Math.min(invItem.quantity, need.unresolved);
                   invItem.quantity -= pickQty;
                   need.unresolved -= pickQty;

                   boxPicks.push({
                      boxId: box.id,
                      boxName: box.name,
                      style: need.style,
                      color: need.color,
                      size: need.size,
                      sku: need.skusMap?.[need.size] || need.generalSku || invItem.sku || '',
                      qty: pickQty,
                      photoUrl: invItem.photoUrl || need.image || '',
                      invItemName: invItem.name || '',
                      invItemSku: invItem.sku || '',
                      invItemSize: invItem.size || ''
                   });
                }
             });
          });

          if (boxPicks.length > 0) {
             palletPicks.push({
                boxId: box.id,
                boxName: box.name,
                picks: boxPicks
             });
          }
       });

       if (palletPicks.length > 0) {
          pickRoute.push({
             palletId: selectedPallet.id,
             name: selectedPallet.name,
             zone: selectedPallet.zone || 'Floor',
             rackSpecs: selectedPallet.rackSpecs || null,
             warehouseId: selectedPallet.warehouseId || null,
             boxes: palletPicks
          });
       }
    }

    const unresolved = unmetNeeds.filter(need => need.unresolved > 0);
    
    setOptimizationResult({
       route: pickRoute,
       unresolved: unresolved
    });
    setCheckedPicks({});
  }, [selectedOrder, pallets]);

  const handleShopifySearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shopifySearchTag.trim()) return;

    setShopifySearchLoading(true);
    setShopifyOrders([]);
    setSelectedShopifyOrderIds(new Set());
    try {
      const res = await fetch(`/api/shopify/search?tag=${encodeURIComponent(shopifySearchTag.trim())}`);
      if (!res.ok) throw new Error('API Error');
      const data = await res.json();
      setShopifyOrders(data.orders || []);
    } catch (err) {
      console.error('Failed to search shopify orders', err);
      alert('Could not search Shopify orders. Ensure the local API edge function is reachable.');
    } finally {
      setShopifySearchLoading(false);
    }
  };

  const handleGenerateTemporaryRoute = () => {
    if (selectedShopifyOrderIds.size === 0) return;
    setIsGeneratingTempOrder(true);

    try {
      const selectedOrders = shopifyOrders.filter(o => selectedShopifyOrderIds.has(o.id));
      const groupedItems = new Map();
      let globalIdx = 0;

      for (const order of selectedOrders) {
        for (const item of order.lineItems || []) {
          const title = item.title;
          const fullVariant = item.variantTitle || '';

          let size = 'OS';
          let color = '';

          if (fullVariant && fullVariant !== 'Default Title') {
            const parts = fullVariant.split(' / ');
            size = parts[0];
            if (parts.length > 1) {
              color = parts.slice(1).join(' / ');
            }
          }

          const key = title + '|' + color + '|' + order.name;

          if (!groupedItems.has(key)) {
            groupedItems.set(key, {
              id: 'temp-item-' + (Date.now() + globalIdx++),
              style: title,
              shopifyOrder: order.name,
              gender: color || 'Unisex',
              color: '',
              qty: 0,
              price: item.originalUnitPriceSet?.presentmentMoney?.amount || '0',
              total: '0',
              image: item.image?.url || '',
              logos: [],
              sizes: {},
              skus: {}
            });
          }

          const existing = groupedItems.get(key);
          const qty = parseInt(item.quantity) || 0;

          existing.qty += qty;
          existing.sizes[size] = (existing.sizes[size] || 0) + qty;
          if (item.sku) {
            existing.skus[size] = item.sku;
          }

          existing.total = `$${(existing.qty * parseFloat(existing.price || '0')).toFixed(2)}`;
        }
      }

      const combinedItems = Array.from(groupedItems.values());
      const tempOrder = {
        id: 'temp-' + Date.now(),
        customerId: 'Shopify Temporary',
        title: `Shopify Batch: ${shopifySearchTag.toUpperCase()} (Temporary)`,
        date: new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }),
        statusIndex: 0,
        portalId: 'TEMP-' + shopifySearchTag.toUpperCase(),
        createdAt: new Date().toISOString(),
        fulfillmentType: 'Standard',
        items: combinedItems,
        boxes: [],
        isShopifyOrder: true,
        isTemporary: true
      };

      setSelectedOrder(tempOrder);
    } catch (err) {
      console.error(err);
      alert('Failed to generate temporary picking route.');
    } finally {
      setIsGeneratingTempOrder(false);
    }
  };

  if (!isOpen) return null;

  const searchMatchedOrders = orders.filter(o => {
    if (!searchOrderQuery.trim()) return true;
    const q = searchOrderQuery.toLowerCase();
    return (
      (o.title || '').toLowerCase().includes(q) ||
      (o.id || '').toLowerCase().includes(q) ||
      (o.portalId || '').toLowerCase().includes(q) ||
      (o.customerId || '').toLowerCase().includes(q) ||
      (o.items?.some((i: any) => (i.style || '').toLowerCase().includes(q) || (i.itemNum || '').toLowerCase().includes(q)))
    );
  });

  const filteredLocalOrders = searchMatchedOrders.filter(o => {
    const isShopify = o.isShopifyOrder === true ||
      (o.title || '').toLowerCase().includes('shopify') ||
      o.items?.some((i: any) => i.shopifyOrder);
    return isShopify && !o.isArchivedPick;
  });

  const filteredArchivedOrders = searchMatchedOrders.filter(o => o.isArchivedPick === true);

  const handleTogglePick = (key: string) => {
    setCheckedPicks(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleTogglePalletPicks = (pallet: any, isChecked: boolean) => {
    const newChecked = { ...checkedPicks };
    pallet.boxes.forEach((box: any) => {
      box.picks.forEach((pick: any) => {
        const key = `${pallet.palletId}-${box.boxId}-${pick.style}-${pick.size}-${pick.sku}`;
        newChecked[key] = isChecked;
      });
    });
    setCheckedPicks(newChecked);
  };

  const isPalletFullyChecked = (pallet: any) => {
    return pallet.boxes.every((box: any) =>
      box.picks.every((pick: any) => {
        const key = `${pallet.palletId}-${box.boxId}-${pick.style}-${pick.size}-${pick.sku}`;
        return checkedPicks[key];
      })
    );
  };

  const getPickingStats = () => {
    if (!optimizationResult) return { total: 0, checked: 0, percent: 0 };
    let total = 0;
    let checked = 0;
    optimizationResult.route.forEach(pallet => {
      pallet.boxes.forEach((box: any) => {
        box.picks.forEach((pick: any) => {
          total += pick.qty;
          const key = `${pallet.palletId}-${box.boxId}-${pick.style}-${pick.size}-${pick.sku}`;
          if (checkedPicks[key]) {
            checked += pick.qty;
          }
        });
      });
    });
    return {
      total,
      checked,
      percent: total > 0 ? Math.round((checked / total) * 100) : 0
    };
  };

  const stats = getPickingStats();

  const handlePrint = () => {
    if (!optimizationResult || !selectedOrder) return;
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const routeHtml = optimizationResult.route.map((pallet, pIdx) => {
      const locationStr = pallet.zone === 'Floor' 
        ? 'Floor Location' 
        : `Rack: ${pallet.zone} • Bay ${pallet.rackSpecs?.bay + 1 || 1} • Level ${(pallet.rackSpecs?.level ?? 0) + 1}`;

      const boxesHtml = pallet.boxes.map((box: any) => {
        const totalBoxQty = box.picks.reduce((sum: number, p: any) => sum + p.qty, 0);

        const itemsHtml = box.picks.map((pick: any, index: number, arr: any[]) => {
          const isLast = index === arr.length - 1;
          const borderStyle = isLast ? '' : 'border-bottom: 1px solid #e2e8f0;';
          return `
            <tr>
              <td style="padding: 8px 12px; font-weight: bold; font-size: 13px; color: #0f172a; ${borderStyle} width: 110px;">[ ] Pick ${pick.qty}x</td>
              <td style="padding: 8px 12px; font-size: 13px; color: #0f172a; ${borderStyle}">
                <span style="font-weight: 700;">${pick.style}</span>
                ${pick.color ? `<span style="color: #64748b; font-size: 11px; margin-left: 6px; font-weight: 500;">(${pick.color})</span>` : ''}
              </td>
              <td style="padding: 8px 12px; text-align: center; font-size: 13px; font-weight: bold; color: #0f172a; ${borderStyle} width: 80px;">${pick.size}</td>
              <td style="padding: 8px 12px; font-family: monospace; font-size: 12px; font-weight: bold; color: #475569; ${borderStyle} width: 180px;">${pick.sku || '-'}</td>
            </tr>
          `;
        }).join('');

        return `
          <div style="margin-top: 12px; border: 1px solid #cbd5e1; border-radius: 12px; padding: 12px; background: #ffffff; page-break-inside: avoid; overflow: hidden;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
              <span style="font-size: 12px; font-weight: 800; color: #0f172a; text-transform: uppercase; background: #f1f5f9; padding: 4px 10px; border-radius: 9999px; font-family: sans-serif; letter-spacing: 0.5px;">
                Box: ${box.boxName}
              </span>
              <span style="font-size: 11px; color: #64748b; font-weight: 700; font-family: sans-serif; text-transform: uppercase; letter-spacing: 0.5px;">
                ${totalBoxQty} ${totalBoxQty === 1 ? 'Unit' : 'Units'} to Pick
              </span>
            </div>
            
            <table style="width: 100%; border-collapse: collapse; text-align: left; font-family: sans-serif;">
              <thead>
                <tr style="color: #475569; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #cbd5e1;">
                  <th style="padding: 6px 12px; padding-top: 0;">Check</th>
                  <th style="padding: 6px 12px; padding-top: 0;">Garment</th>
                  <th style="padding: 6px 12px; padding-top: 0; text-align: center;">Size</th>
                  <th style="padding: 6px 12px; padding-top: 0;">SKU</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>
          </div>
        `;
      }).join('');

      return `
        <div style="margin-bottom: 24px; border: 1px solid #cbd5e1; border-radius: 16px; padding: 16px; background: #f8fafc;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #cbd5e1; padding-bottom: 8px; margin-bottom: 8px;">
            <h2 style="margin: 0; font-family: sans-serif; font-size: 16px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #0f172a;">Step ${pIdx + 1}: Pallet ${pallet.name}</h2>
            <span style="font-family: sans-serif; font-size: 11px; font-weight: 800; background: #000000; color: #ffffff; padding: 4px 12px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.5px;">${locationStr}</span>
          </div>
          ${boxesHtml}
        </div>
      `;
    }).join('');

    const unresolvedHtml = optimizationResult.unresolved.length > 0 ? `
      <div style="margin-top: 30px; page-break-inside: avoid; border: 1px solid #fca5a5; border-radius: 16px; padding: 16px; background: #fff5f5;">
        <h2 style="margin: 0 0 10px 0; color: #991b1b; font-family: sans-serif; font-size: 16px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">Unresolved / Out of Stock Items</h2>
        <table style="width: 100%; border-collapse: collapse; text-align: left; font-family: sans-serif; font-size: 13px;">
          <thead>
            <tr style="color: #991b1b; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #fca5a5;">
              <th style="padding: 6px 12px; padding-top: 0;">Garment</th>
              <th style="padding: 6px 12px; padding-top: 0; text-align: center; width: 100px;">Size</th>
              <th style="padding: 6px 12px; padding-top: 0; width: 180px;">Missing Qty</th>
            </tr>
          </thead>
          <tbody>
            ${optimizationResult.unresolved.map((u, idx, arr) => {
              const borderStyle = idx === arr.length - 1 ? '' : 'border-bottom: 1px solid #fca5a5;';
              return `
                <tr>
                  <td style="padding: 8px 12px; color: #7f1d1d; font-weight: bold; ${borderStyle}">${u.style}</td>
                  <td style="padding: 8px 12px; color: #7f1d1d; text-align: center; font-weight: bold; ${borderStyle}">${u.size}</td>
                  <td style="padding: 8px 12px; color: #b91c1c; font-weight: bold; ${borderStyle}">${u.unresolved} of ${u.needed} units</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    ` : '';

    printWindow.document.write(`
      <html>
        <head>
          <title>Pick Sheet - ${selectedOrder.portalId || 'Shopify Picking List'}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 20px; color: #0f172a; line-height: 1.4; background: #ffffff; }
            h1 { font-family: sans-serif; margin-bottom: 5px; font-weight: bold; }
            .header-table { width: 100%; margin-bottom: 20px; border-bottom: 3px double #000000; padding-bottom: 12px; }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <table class="header-table">
            <tr>
              <td>
                <h1 style="margin:0; font-size: 26px; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px; font-family: sans-serif; font-weight: 800;">Pallet Picking List</h1>
                <div style="margin-top: 8px; display: inline-block; font-size: 11px; background: #e2e8f0; color: #334155; padding: 4px 12px; border-radius: 9999px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; font-family: sans-serif;">
                  Order ID: ${selectedOrder.portalId || 'Uncoded Batch'}
                </div>
              </td>
              <td style="text-align: right; vertical-align: bottom;">
                <p style="margin: 0; font-size: 14px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px; font-family: sans-serif;">Fulfill: ${selectedOrder.title || 'Shopify Order'}</p>
                <p style="margin: 4px 0 0 0; font-size: 11px; color: #64748b; font-family: sans-serif; font-weight: 500;">Printed on ${new Date().toLocaleString()}</p>
              </td>
            </tr>
          </table>
          ${routeHtml}
          ${unresolvedHtml}
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handlePrintBoxStickers = () => {
    if (!optimizationResult || !selectedOrder) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const stickersHtml = optimizationResult.route.flatMap((pallet) => {
      return pallet.boxes.map((box: any) => {
        const originalPallet = pallets.find(p => p.id === pallet.palletId);
        const originalBox = originalPallet?.boxes?.find((b: any) => b.id === box.boxId);
        
        if (!originalBox) return '';

        // Calculate remaining items in box after picking
        const remainingItems = (originalBox.items || []).map((item: any) => {
          const matchingPick = box.picks.find((p: any) => {
            if (p.invItemName && p.invItemSize && p.invItemSku) {
              return p.invItemName === item.name &&
                     p.invItemSize === item.size &&
                     p.invItemSku.toLowerCase() === (item.sku || '').toLowerCase();
            }
            return p.style === item.name && 
                   p.size === item.size && 
                   (p.sku || '').toLowerCase() === (item.sku || '').toLowerCase();
          });
          const pickedQty = (matchingPick && !selectedOrder.isArchivedPick) ? matchingPick.qty : 0;
          return {
            ...item,
            quantity: item.quantity - pickedQty
          };
        }).filter((item: any) => item.quantity > 0);

        const manifestHtml = remainingItems.map((item: any) => `
          <div style="display: flex; gap: 8px; align-items: center; padding: 6px; border: 1.5px solid rgba(0,0,0,0.2); border-radius: 4px; margin-bottom: 6px; background: #fff; box-sizing: border-box;">
            ${item.photoUrl ? `<img src="${item.photoUrl}" alt="Item" style="width: 32px; height: 32px; border-radius: 4px; object-fit: cover; border: 1px solid rgba(0,0,0,0.2); flex-shrink: 0;" />` : ''}
            <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; text-align: left;">
              <div style="font-family: sans-serif; font-weight: bold; font-size: 13px; line-height: 1.25; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px;">${item.name}</div>
              <div style="font-size: 9px; font-family: monospace; font-weight: bold; color: #000; margin-top: 2px;">
                ${item.sku ? `SKU: ${item.sku}` : ''} ${item.size ? ` | SIZE: ${item.size}` : ''}
              </div>
            </div>
            <div style="font-weight: 900; font-size: 24px; font-family: sans-serif; margin-left: auto; padding-left: 8px; align-self: center; flex-shrink: 0;">
              ×${item.quantity}
            </div>
          </div>
        `).join('');

        const emptyBoxHtml = remainingItems.length === 0 
          ? `<div style="padding: 24px; border: 2px dashed rgba(0,0,0,0.3); text-align: center; font-weight: 900; text-transform: uppercase; border-radius: 6px; font-size: 12px; color: #475569; font-family: sans-serif; margin-top: 10px;">Empty Box</div>` 
          : '';

        const totalUnits = remainingItems.reduce((sum: number, item: any) => sum + item.quantity, 0);

        // Fetch pre-rendered local QR SVG
        const qrContainer = document.getElementById(`qr-code-${box.boxId}`);
        const qrSvgHtml = qrContainer ? qrContainer.innerHTML : '';

        return `
          <div class="print-page-wrapper">
            <div class="print-label-container">
              <!-- Label Header -->
              <div style="display: flex; justify-content: space-between; align-items: start; border-bottom: 4px solid black; padding-bottom: 12px; margin-bottom: 16px; flex-shrink: 0; box-sizing: border-box;">
                <div>
                  <img src="${window.location.origin}/logo.png" alt="WOVN" style="height: 32px; width: auto; margin-bottom: 12px; filter: grayscale(100%);" />
                  <h1 style="margin: 0; font-family: sans-serif; font-size: 32px; font-weight: 900; text-transform: uppercase; letter-spacing: -1px; line-height: 1;">${pallet.name}</h1>
                  <p style="margin: 4px 0 0 0; font-size: 16px; font-weight: bold; font-family: sans-serif; color: #000;">PALLET ID: ${pallet.palletId.replace('pal_', '')}</p>
                </div>
                <div style="text-align: right;">
                  <div style="font-family: sans-serif; font-size: 52px; font-weight: 900; text-transform: uppercase; letter-spacing: -2px; line-height: 1; margin-bottom: 2px;">${box.boxName}</div>
                  <p style="margin: 0; font-family: sans-serif; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; background: black; color: white; padding: 3px 8px; display: inline-block;">BOX ID: ${box.boxId.replace('box_', '')}</p>
                </div>
              </div>

              <!-- Label Body -->
              <div style="display: flex; gap: 16px; flex: 1; min-height: 0; box-sizing: border-box;">
                <!-- Manifest Column -->
                <div style="flex: 1; display: flex; flex-direction: column; min-height: 0; box-sizing: border-box;">
                  <h3 style="margin: 0 0 8px 0; font-family: sans-serif; font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid black; padding-bottom: 4px; flex-shrink: 0;">Contents Manifest (${totalUnits} Units)</h3>
                  <div style="overflow-y: auto; flex: 1; padding-right: 8px; box-sizing: border-box;">
                    ${manifestHtml}
                    ${emptyBoxHtml}
                  </div>
                </div>

                <!-- QR Column -->
                <div style="width: 140px; display: flex; flex-direction: column; align-items: center; justify-content: space-between; border-left: 4px solid black; padding-left: 16px; flex-shrink: 0; box-sizing: border-box;">
                  <div style="text-align: center; display: flex; flex-direction: column; align-items: center; width: 100%;">
                    <div class="qr-code-box" style="padding: 4px; border: 4px solid black; background: white; margin-bottom: 8px; display: inline-block; width: 100px; height: 100px; box-sizing: border-box;">
                      ${qrSvgHtml}
                    </div>
                    <p style="font-family: sans-serif; font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; text-align: center; margin-top: 4px; width: 100%; color: black;">Scan to View Info</p>
                  </div>
                  <div style="width: 100%; opacity: 0.7; text-align: left; box-sizing: border-box;">
                    <div style="font-size: 7.5px; font-family: monospace; line-height: 1.2; color: #000;">
                      DATE: ${new Date().toLocaleDateString()}<br/>
                      TIME: ${new Date().toLocaleTimeString()}<br/>
                      SYS_ID: ${box.boxId}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `;
      });
    }).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Box QR Stickers - ${selectedOrder.portalId || 'Shopify Picking List'}</title>
          <style>
            @page { 
              margin: 0; 
              size: 4in 6in; 
            }
            body { 
              margin: 0; 
              padding: 0; 
              background: #fff;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            }
            
            /* Print Specific Styles */
            @media print {
              body {
                width: 4in;
                height: 6in;
              }
              .print-page-wrapper {
                display: block !important;
                position: relative !important;
                width: 4in !important;
                height: 6in !important;
                page-break-after: always !important;
                page-break-inside: avoid !important;
                margin: 0 !important;
                padding: 0 !important;
                background: white !important;
              }
              .print-label-container {
                position: absolute !important;
                left: 3.9in !important;
                top: 0.1in !important;
                width: 5.8in !important;
                height: 3.8in !important;
                padding: 0.3in !important;
                margin: 0 !important;
                border: none !important;
                box-sizing: border-box !important;
                box-shadow: none !important;
                transform: rotate(90deg) !important;
                transform-origin: top left !important;
              }
              .qr-code-box svg {
                width: 100% !important;
                height: 100% !important;
              }
            }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          ${stickersHtml}
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleCompletePicking = async () => {
    if (!optimizationResult) return;
    if (stats.checked === 0) {
      alert("Please check at least one item to apply picks.");
      return;
    }

    const confirmMessage = `Are you sure you want to complete this picking route and deduct the ${stats.checked} picked items/quantities from the warehouse database?`;
    if (!window.confirm(confirmMessage)) return;

    setIsApplyingPicks(true);
    try {
      // Create a map to group the picks we are applying by palletId
      const palletUpdates: Record<string, { palletId: string, boxId: string, picks: any[] }[]> = {};

      optimizationResult.route.forEach(pallet => {
        pallet.boxes.forEach((box: any) => {
          box.picks.forEach((pick: any) => {
            const key = `${pallet.palletId}-${box.boxId}-${pick.style}-${pick.size}-${pick.sku}`;
            if (checkedPicks[key]) {
              if (!palletUpdates[pallet.palletId]) {
                palletUpdates[pallet.palletId] = [];
              }
              // Find or create group for this box
              let boxGroup = palletUpdates[pallet.palletId].find(g => g.boxId === box.boxId);
              if (!boxGroup) {
                boxGroup = { palletId: pallet.palletId, boxId: box.boxId, picks: [] };
                palletUpdates[pallet.palletId].push(boxGroup);
              }
              boxGroup.picks.push(pick);
            }
          });
        });
      });

      // Now iterate through each pallet that needs updates
      for (const palletId of Object.keys(palletUpdates)) {
        const palletDocRef = doc(db, 'pallets', palletId);
        // Find the latest pallet data from our local Firestore snapshot sync
        const currentPallet = pallets.find(p => p.id === palletId);
        if (!currentPallet) continue;

        const groups = palletUpdates[palletId];
        
        // Deep copy and update the boxes array
        const updatedBoxes = currentPallet.boxes.map((b: any) => {
          const group = groups.find(g => g.boxId === b.id);
          if (!group) return b; // No picks in this box

          // Update items in this box
          const updatedItems = (b.items || []).map((item: any) => {
            // Find if there is a matching pick
            const matchingPick = group.picks.find(p => {
              if (p.invItemName && p.invItemSize && p.invItemSku) {
                return p.invItemName === item.name &&
                       p.invItemSize === item.size &&
                       p.invItemSku.toLowerCase() === (item.sku || '').toLowerCase();
              }
              return p.style === item.name && 
                     p.size === item.size && 
                     (p.sku || '').toLowerCase() === (item.sku || '').toLowerCase();
            });

            if (matchingPick) {
              const newQty = item.quantity - matchingPick.qty;
              return {
                ...item,
                quantity: newQty
              };
            }
            return item;
          }).filter((item: any) => item.quantity > 0); // Remove items whose quantity falls to 0 or below

          return {
            ...b,
            items: updatedItems
          };
        });

        // Save back to Firestore
        await setDoc(palletDocRef, { ...currentPallet, boxes: updatedBoxes });
      }

      // Archive pick route to Firestore
      const archiveUpdates = {
        isArchivedPick: true,
        archivedAt: new Date().toISOString(),
        pickRoute: optimizationResult.route,
        unresolvedPicks: optimizationResult.unresolved,
        checkedPicks: checkedPicks
      };

      if (selectedOrder.isTemporary) {
        await setDoc(doc(db, 'orders', selectedOrder.id), {
          ...selectedOrder,
          isTemporary: false,
          ...archiveUpdates
        });
      } else {
        await updateDoc(doc(db, 'orders', selectedOrder.id), archiveUpdates);
      }

      alert("Successfully completed picking! Inventory quantities have been updated.");
      setCheckedPicks({});
      onClose();
    } catch (error) {
      console.error("Error applying picks:", error);
      alert("An error occurred while updating the inventory: " + (error as Error).message);
    } finally {
      setIsApplyingPicks(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 md:p-6 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-4xl w-full flex flex-col shadow-2xl border border-brand-border my-auto overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="px-8 py-6 border-b border-brand-border bg-white flex items-center justify-between sticky top-0 z-10 shadow-sm shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="text-green-600 animate-pulse" size={24} />
              <h2 className="text-2xl font-serif text-brand-primary font-bold">Shopify Pick Route Optimizer</h2>
            </div>
            <p className="text-xs font-semibold text-brand-secondary mt-1 uppercase tracking-widest">
              {selectedOrder ? `Fulfilling Order: ${selectedOrder.portalId || 'Shopify Batch'}` : 'Select an order to build optimal pick path'}
            </p>
          </div>
          <button 
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-neutral-50 border border-brand-border flex items-center justify-center text-brand-secondary hover:text-black hover:border-black transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 custom-scrollbar bg-neutral-50 min-h-[400px]">
          
          {/* Order Selector (if not pre-selected or if user wants to change) */}
          {!preSelectedOrder && !selectedOrder && (
            <div className="flex flex-col gap-4 animate-in fade-in duration-300">
              
              {/* Tab Switcher */}
              <div className="flex bg-neutral-200/60 p-1 rounded-2xl border border-brand-border/60 max-w-lg mb-2 shrink-0">
                <button 
                  onClick={() => setSelectorMode('local')} 
                  className={`flex-1 py-2 text-xs font-bold uppercase rounded-xl transition-all ${selectorMode === 'local' ? 'bg-white shadow-sm text-brand-primary' : 'text-brand-secondary hover:text-brand-primary'}`}
                >
                  Local Orders
                </button>
                <button 
                  onClick={() => setSelectorMode('shopify')} 
                  className={`flex-1 py-2 text-xs font-bold uppercase rounded-xl transition-all ${selectorMode === 'shopify' ? 'bg-white shadow-sm text-brand-primary' : 'text-brand-secondary hover:text-brand-primary'}`}
                >
                  Shopify Orders (Temp Pick)
                </button>
                <button 
                  onClick={() => setSelectorMode('archived')} 
                  className={`flex-1 py-2 text-xs font-bold uppercase rounded-xl transition-all ${selectorMode === 'archived' ? 'bg-white shadow-sm text-brand-primary' : 'text-brand-secondary hover:text-brand-primary'}`}
                >
                  Archived Picks
                </button>
              </div>

              {selectorMode === 'local' ? (
                <>
                  <div className="relative">
                    <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-secondary" />
                    <input 
                      type="text" 
                      value={searchOrderQuery}
                      onChange={e => setSearchOrderQuery(e.target.value)}
                      placeholder="Search active orders..." 
                      className="w-full bg-white border border-brand-border rounded-2xl pl-12 pr-4 py-3 text-sm focus:border-brand-primary focus:outline-none transition-all shadow-sm"
                      autoFocus
                    />
                  </div>

                  {ordersLoading ? (
                    <div className="flex items-center justify-center p-12">
                      <Loader2 className="animate-spin text-brand-primary" size={32} />
                    </div>
                  ) : filteredLocalOrders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-12 text-center text-brand-secondary">
                      <ShoppingBag size={48} className="mb-4 text-brand-secondary/40 animate-bounce" />
                      <p className="font-bold text-lg">No active orders matched search criteria.</p>
                      <p className="text-xs mt-2">Make sure orders are imported or tags match Shopify.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto pr-1 animate-in slide-in-from-bottom-2 duration-200">
                      {filteredLocalOrders.map((order) => {
                        const lineItemCount = order.items?.reduce((acc: number, item: any) => acc + (item.qty || 0), 0) || 0;
                        const isShopify = order.items?.some((i: any) => i.shopifyOrder);
                        
                        return (
                          <div 
                            key={order.id} 
                            onClick={() => setSelectedOrder(order)}
                            className="bg-white rounded-2xl p-5 border border-brand-border hover:border-brand-primary cursor-pointer hover:shadow-lg transition-all flex flex-col justify-between gap-4 group"
                          >
                            <div className="flex justify-between items-start gap-4">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                  <span className="font-bold text-brand-primary text-base truncate group-hover:text-brand-primary/80">{order.title}</span>
                                  {isShopify && (
                                    <span className="bg-blue-50 border border-blue-200 text-blue-600 font-bold text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider">
                                      Shopify
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-brand-secondary font-semibold uppercase tracking-wider">
                                  Order ID: <b className="text-brand-primary font-bold">{order.portalId || 'Unassigned'}</b>
                                </p>
                              </div>
                              <div className="shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-neutral-50 group-hover:bg-brand-primary/10 group-hover:text-brand-primary transition-all">
                                <ArrowRight size={16} />
                              </div>
                            </div>

                            <div className="flex justify-between items-center text-xs border-t border-brand-border/40 pt-3 mt-1 text-brand-secondary font-semibold">
                              <span>Items: <b className="text-brand-primary">{lineItemCount}</b></span>
                              <span>Date: <b className="text-brand-primary">{order.date || 'TBD'}</b></span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : selectorMode === 'archived' ? (
                <>
                  <div className="relative">
                    <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-secondary" />
                    <input 
                      type="text" 
                      value={searchOrderQuery}
                      onChange={e => setSearchOrderQuery(e.target.value)}
                      placeholder="Search archived picks by tag, title, item..." 
                      className="w-full bg-white border border-brand-border rounded-2xl pl-12 pr-4 py-3 text-sm focus:border-brand-primary focus:outline-none transition-all shadow-sm"
                      autoFocus
                    />
                  </div>

                  {ordersLoading ? (
                    <div className="flex items-center justify-center p-12">
                      <Loader2 className="animate-spin text-brand-primary" size={32} />
                    </div>
                  ) : filteredArchivedOrders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-12 text-center text-brand-secondary">
                      <Archive size={48} className="mb-4 text-brand-secondary/40 animate-bounce" />
                      <p className="font-bold text-lg">No archived picks found.</p>
                      <p className="text-xs mt-2">Complete standard or Shopify temporary picking to save routes here.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto pr-1 animate-in slide-in-from-bottom-2 duration-200">
                      {filteredArchivedOrders.map((order) => {
                        const lineItemCount = order.items?.reduce((acc: number, item: any) => acc + (item.qty || 0), 0) || 0;
                        const isShopify = order.items?.some((i: any) => i.shopifyOrder);
                        
                        return (
                          <div 
                            key={order.id} 
                            onClick={() => setSelectedOrder(order)}
                            className="bg-white rounded-2xl p-5 border border-brand-border hover:border-brand-primary cursor-pointer hover:shadow-lg transition-all flex flex-col justify-between gap-4 group"
                          >
                            <div className="flex justify-between items-start gap-4">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                  <span className="font-bold text-brand-primary text-base truncate group-hover:text-brand-primary/80">{order.title}</span>
                                  {isShopify && (
                                    <span className="bg-blue-50 border border-blue-200 text-blue-600 font-bold text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider">
                                      Shopify
                                    </span>
                                  )}
                                  <span className="bg-amber-50 border border-amber-200 text-amber-700 font-bold text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider flex items-center gap-0.5">
                                    <Check size={8} strokeWidth={4} /> Archived Pick
                                  </span>
                                </div>
                                <p className="text-xs text-brand-secondary font-semibold uppercase tracking-wider">
                                  Order ID: <b className="text-brand-primary font-bold">{order.portalId || 'Unassigned'}</b>
                                </p>
                              </div>
                              <div className="shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-neutral-50 group-hover:bg-brand-primary/10 group-hover:text-brand-primary transition-all">
                                <ArrowRight size={16} />
                              </div>
                            </div>

                            <div className="flex justify-between items-center text-xs border-t border-brand-border/40 pt-3 mt-1 text-brand-secondary font-semibold">
                              <span>Items: <b className="text-brand-primary">{lineItemCount}</b></span>
                              <span>Date: <b className="text-brand-primary">{order.date || 'TBD'}</b></span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col gap-4">
                  <form onSubmit={handleShopifySearch} className="flex gap-2">
                    <div className="relative flex-1">
                      <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-secondary" />
                      <input 
                        type="text" 
                        value={shopifySearchTag}
                        onChange={e => setShopifySearchTag(e.target.value)}
                        placeholder="Search Shopify by Tag (e.g. MAY26)..." 
                        className="w-full bg-white border border-brand-border rounded-2xl pl-12 pr-4 py-3 text-sm focus:border-brand-primary focus:outline-none transition-all shadow-sm"
                        autoFocus
                      />
                    </div>
                    <button 
                      type="submit" 
                      disabled={shopifySearchLoading}
                      className="px-6 py-3 bg-brand-primary text-white font-bold uppercase tracking-widest text-xs rounded-2xl shadow-md hover:bg-black transition-all flex items-center justify-center min-w-[100px]"
                    >
                      {shopifySearchLoading ? <Loader2 className="animate-spin" size={16} /> : 'Search'}
                    </button>
                  </form>

                  {shopifySearchLoading ? (
                    <div className="flex items-center justify-center p-12">
                      <Loader2 className="animate-spin text-brand-primary" size={32} />
                    </div>
                  ) : shopifyOrders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-12 text-center text-brand-secondary">
                      <ShoppingBag size={48} className="mb-4 text-brand-secondary/40 animate-bounce" />
                      <p className="font-bold text-lg">No Shopify orders found matching tag.</p>
                      <p className="text-xs mt-2">Enter a tag and click Search to fetch new orders directly from Shopify.</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[50vh] overflow-y-auto pr-1">
                        {shopifyOrders.map((order) => {
                          const isChecked = selectedShopifyOrderIds.has(order.id);
                          const itemCount = order.lineItems?.reduce((acc: number, item: any) => acc + (parseInt(item.quantity) || 0), 0) || 0;
                          
                          return (
                            <div 
                              key={order.id} 
                              onClick={() => {
                                const newSet = new Set(selectedShopifyOrderIds);
                                if (newSet.has(order.id)) newSet.delete(order.id);
                                else newSet.add(order.id);
                                setSelectedShopifyOrderIds(newSet);
                              }}
                              className={`bg-white rounded-2xl p-5 border cursor-pointer hover:shadow-lg transition-all flex items-start gap-4 group ${isChecked ? 'border-green-600 bg-green-50/10' : 'border-brand-border'}`}
                            >
                              <input 
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {}} // toggled by parent click
                                className="w-5 h-5 rounded border-brand-border text-brand-primary focus:ring-brand-primary cursor-pointer shrink-0 mt-0.5"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="font-bold text-brand-primary text-base truncate group-hover:text-brand-primary/80">{order.name}</span>
                                  <span className="bg-blue-50 border border-blue-200 text-blue-600 font-bold text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider">Shopify</span>
                                </div>
                                <p className="text-xs text-brand-secondary font-semibold uppercase tracking-wider">
                                  Customer: <b className="text-brand-primary">{order.customer?.firstName} {order.customer?.lastName || 'Guest'}</b>
                                </p>
                                <div className="flex justify-between items-center text-xs border-t border-brand-border/40 pt-3 mt-3 text-brand-secondary font-semibold">
                                  <span>Items: <b className="text-brand-primary">{itemCount}</b></span>
                                  <span>Date: <b className="text-brand-primary">{order.createdAt ? new Date(order.createdAt).toLocaleDateString() : 'TBD'}</b></span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {selectedShopifyOrderIds.size > 0 && (
                        <div className="flex justify-end pt-2 border-t border-brand-border/40">
                          <button 
                            onClick={handleGenerateTemporaryRoute}
                            disabled={isGeneratingTempOrder}
                            className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold uppercase tracking-widest text-xs rounded-xl shadow-md transition-all flex items-center gap-2"
                          >
                            {isGeneratingTempOrder ? (
                              <>
                                <Loader2 className="animate-spin" size={14} /> Generating...
                              </>
                            ) : (
                              <>
                                Optimize Pick Route (Temporary In-Memory)
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

            </div>
          )}

          {/* Optimizer Results Layout */}
          {selectedOrder && (
            <div className="flex flex-col gap-6 animate-in fade-in duration-300">
              {/* Top Summary Card */}
              <div className="bg-white rounded-3xl p-6 border border-brand-border shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="font-serif font-black text-brand-primary text-xl truncate">{selectedOrder.title}</h3>
                    {!preSelectedOrder && (
                      <button 
                        onClick={() => setSelectedOrder(null)} 
                        className="text-xs font-bold text-red-500 hover:text-red-700 bg-red-50 border border-red-100 rounded px-2.5 py-1 transition-all"
                      >
                        Change Order
                      </button>
                    )}
                  </div>
                  
                  {palletsLoading ? (
                    <div className="flex items-center gap-2 mt-2 text-xs text-brand-secondary">
                      <Loader2 className="animate-spin text-brand-primary" size={14} />
                      <span>Scanning inventory...</span>
                    </div>
                  ) : optimizationResult && (
                    <div className="flex flex-wrap items-center gap-4 mt-3 text-xs font-bold text-brand-secondary uppercase tracking-widest">
                      <span className="flex items-center gap-1"><Layers size={14} className="text-brand-primary" /> {optimizationResult.route.length} Pallets to Visit</span>
                      <span className="text-brand-border">•</span>
                      <span className="flex items-center gap-1"><Box size={14} className="text-brand-primary" /> {stats.checked} / {stats.total} Items Picked</span>
                    </div>
                  )}
                </div>

                {optimizationResult && (
                  <div className="w-full md:w-56 flex flex-col gap-2 bg-neutral-50 p-4 rounded-2xl border border-brand-border/60">
                    <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-brand-secondary">
                      <span>Pick Progress</span>
                      <span>{stats.percent}%</span>
                    </div>
                    <div className="w-full h-3 bg-neutral-200 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 transition-all duration-500" style={{ width: `${stats.percent}%` }}></div>
                    </div>
                  </div>
                )}
              </div>

              {/* Picking Instructions List */}
              {palletsLoading ? (
                <div className="flex items-center justify-center p-16">
                  <Loader2 className="animate-spin text-brand-primary" size={40} />
                </div>
              ) : optimizationResult && (
                <div className="space-y-6">
                  {optimizationResult.route.length === 0 && (
                    <div className="bg-amber-50 border border-amber-200 text-amber-800 p-6 rounded-2xl text-center shadow-inner flex flex-col items-center gap-3">
                      <AlertTriangle size={32} className="text-amber-500 animate-bounce" />
                      <h4 className="font-bold text-lg">No Inventory Found on Pallets!</h4>
                      <p className="text-xs font-medium max-w-md">None of the requested garments match items in any active pallets. Make sure the SKUs correspond or manual matching terms match style names.</p>
                    </div>
                  )}

                  {optimizationResult.route.map((pallet, pIdx) => {
                    const isFullyPicked = isPalletFullyChecked(pallet);
                    const locationStr = pallet.zone === 'Floor' 
                      ? 'Floor Location' 
                      : `Rack: ${pallet.zone} • Bay ${pallet.rackSpecs?.bay + 1 || 1} • Level ${(pallet.rackSpecs?.level ?? 0) + 1}`;

                    return (
                      <div 
                        key={pallet.palletId}
                        className={`bg-white rounded-3xl border transition-all ${isFullyPicked ? 'border-green-200 shadow-sm opacity-70 hover:opacity-100' : 'border-brand-border shadow-sm'}`}
                      >
                        {/* Pallet Title Banner */}
                        <div className="px-6 py-5 border-b border-brand-border/40 flex flex-wrap justify-between items-center gap-4 bg-brand-bg/20 rounded-t-3xl">
                          <div className="flex items-center gap-3 min-w-0">
                            <input 
                              type="checkbox"
                              checked={isFullyPicked}
                              disabled={selectedOrder.isArchivedPick}
                              onChange={(e) => !selectedOrder.isArchivedPick && handleTogglePalletPicks(pallet, e.target.checked)}
                              className={`w-5 h-5 rounded border-brand-border text-brand-primary focus:ring-brand-primary shrink-0 ${selectedOrder.isArchivedPick ? 'cursor-default' : 'cursor-pointer'}`}
                            />
                            <div className="min-w-0">
                              <h4 className="font-serif text-lg font-bold text-brand-primary truncate">
                                Step {pIdx + 1}: Pallet {pallet.name}
                              </h4>
                              <p className="text-[10px] font-bold text-brand-secondary uppercase tracking-widest mt-0.5 flex items-center gap-1">
                                <MapPin size={10} /> {locationStr}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {onLocatePallet && (
                              <button 
                                onClick={() => {
                                  onLocatePallet(pallet.palletId, pallet.zone, pallet.warehouseId);
                                  onClose();
                                }}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-brand-border rounded-lg text-[10px] font-bold uppercase tracking-widest text-brand-primary hover:bg-black hover:text-white hover:border-black transition-all shadow-sm"
                                title="Locate pallet on 3D warehouse map"
                              >
                                <MapIcon size={12} /> Locate
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Boxes and items inside this pallet */}
                        <div className="p-6 divide-y divide-brand-border/40">
                          {pallet.boxes.map((box: any) => (
                            <div key={box.boxId} className="py-4 first:pt-0 last:pb-0">
                              <h5 className="text-xs font-bold text-brand-secondary uppercase tracking-widest mb-3 flex items-center gap-1.5">
                                <Box size={14} className="text-neutral-400" /> Box: {box.boxName}
                              </h5>
                              
                              <div className="space-y-3 pl-6">
                                {box.picks.map((pick: any) => {
                                  const key = `${pallet.palletId}-${box.boxId}-${pick.style}-${pick.size}-${pick.sku}`;
                                  const isItemPicked = checkedPicks[key] || false;

                                  return (
                                    <div 
                                      key={key} 
                                      onClick={() => !selectedOrder.isArchivedPick && handleTogglePick(key)}
                                      className={`flex items-center justify-between p-3 rounded-xl border transition-all ${selectedOrder.isArchivedPick ? 'cursor-default' : 'cursor-pointer'} ${isItemPicked ? 'bg-green-50/40 border-green-200 text-neutral-500' : 'bg-neutral-50/50 border-brand-border/60 text-brand-primary hover:border-neutral-400'}`}
                                    >
                                      <div className="flex items-center gap-4 min-w-0">
                                        <input 
                                          type="checkbox"
                                          checked={isItemPicked}
                                          disabled={selectedOrder.isArchivedPick}
                                          onChange={() => {}} // toggled on container click
                                          className={`w-4.5 h-4.5 rounded border-brand-border text-brand-primary focus:ring-brand-primary shrink-0 ${selectedOrder.isArchivedPick ? 'cursor-default' : 'cursor-pointer'}`}
                                        />
                                        
                                        {pick.photoUrl && (
                                          <img 
                                            src={pick.photoUrl} 
                                            alt={pick.style} 
                                            className="w-10 h-10 object-cover rounded-lg border border-brand-border shrink-0"
                                            onError={(e) => {
                                              (e.target as HTMLImageElement).style.display = 'none';
                                            }}
                                          />
                                        )}
                                        
                                        <div className="min-w-0">
                                          <p className={`text-sm font-bold truncate ${isItemPicked ? 'line-through' : ''}`}>
                                            Pick {pick.qty}x <span className="font-serif font-black">{pick.style}</span>
                                          </p>
                                          <div className="flex items-center gap-2 mt-0.5 text-[10px] font-semibold text-brand-secondary uppercase tracking-wider">
                                            {pick.color && <span>Color: {pick.color}</span>}
                                            {pick.color && <span>•</span>}
                                            <span>Size: <b className="text-brand-primary font-bold text-xs">{pick.size}</b></span>
                                            {pick.sku && <span>•</span>}
                                            {pick.sku && <span className="font-mono text-[9px]">{pick.sku}</span>}
                                          </div>
                                        </div>
                                      </div>

                                      <div className="shrink-0">
                                        {isItemPicked && <CheckCircle2 size={18} className="text-green-500 animate-in zoom-in" />}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Unresolved / Missing Inventory Warning Banner */}
              {optimizationResult && optimizationResult.unresolved.length > 0 && (
                <div className="bg-rose-50 border border-rose-200 rounded-3xl p-6 shadow-sm animate-in fade-in duration-300">
                  <div className="flex items-center gap-2.5 mb-4 text-rose-800">
                    <AlertTriangle size={20} className="text-rose-500 shrink-0" />
                    <h4 className="font-bold text-base">Unresolved Order Requirements</h4>
                  </div>
                  <p className="text-xs text-rose-700 font-medium mb-4">
                    The following garments could not be fully sourced from inventory pallets. Standard stock is required to complete fulfillment.
                  </p>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs font-semibold">
                      <thead>
                        <tr className="border-b border-rose-200 text-rose-800 uppercase tracking-widest text-[9px]">
                          <th className="pb-2 font-bold">Style</th>
                          <th className="pb-2 font-bold w-20">Size</th>
                          <th className="pb-2 font-bold w-36">Unmet Quantity</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-rose-100 text-rose-900">
                        {optimizationResult.unresolved.map((need, idx) => (
                          <tr key={idx}>
                            <td className="py-2.5 font-bold">{need.style}</td>
                            <td className="py-2.5 font-bold text-sm">{need.size}</td>
                            <td className="py-2.5 text-rose-600 font-black">
                              {need.unresolved} of {need.needed} units missing
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {optimizationResult && (
          <div className="p-6 border-t border-brand-border bg-white flex flex-col sm:flex-row justify-between items-center gap-4 shrink-0">
            <div className="text-xs text-brand-secondary font-bold uppercase tracking-widest">
              {stats.percent === 100 ? (
                <span className="text-green-600 flex items-center gap-1.5"><Check size={16} strokeWidth={3} /> ALL ITEMS PICKED</span>
              ) : (
                <span>CHECKLIST PROGRESS: {stats.checked} / {stats.total}</span>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 w-full sm:w-auto">
              <button 
                onClick={() => setCheckedPicks({})}
                disabled={selectedOrder.isArchivedPick}
                className="px-3.5 py-2 text-[9px] font-bold uppercase tracking-wider text-brand-secondary border border-brand-border hover:bg-neutral-50 hover:text-black disabled:opacity-50 disabled:hover:bg-white disabled:hover:text-brand-secondary rounded-xl transition-all shadow-sm flex-shrink-0"
              >
                Reset Route
              </button>
              <button 
                onClick={handlePrint}
                className="px-4 py-2 text-[9px] font-bold uppercase tracking-wider bg-black text-white hover:bg-neutral-800 rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5 flex-shrink-0"
              >
                <Printer size={13} /> Print Pick List
              </button>
              <button 
                onClick={handlePrintBoxStickers}
                className="px-4 py-2 text-[9px] font-bold uppercase tracking-wider bg-black text-white hover:bg-neutral-800 rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5 flex-shrink-0"
              >
                <Printer size={13} /> Print QR Stickers
              </button>
              {selectedOrder.isArchivedPick ? (
                <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-green-700 bg-green-50 border border-green-200 rounded-xl flex items-center gap-1.5 flex-shrink-0">
                  <CheckCircle2 size={13} className="text-green-600" /> Picking Completed & Archived
                </div>
              ) : (
                <button 
                  onClick={handleCompletePicking}
                  disabled={isApplyingPicks}
                  className="px-4 py-2 text-[9px] font-bold uppercase tracking-wider bg-green-600 text-white hover:bg-green-700 disabled:bg-neutral-300 rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5 flex-shrink-0"
                >
                  {isApplyingPicks ? (
                    <>
                      <Loader2 className="animate-spin" size={13} /> Applying...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={13} /> Complete Picking
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Hidden Container for QR Code Pre-Rendering (used by handlePrintBoxStickers) */}
      <div style={{ display: 'none' }} aria-hidden="true">
        {optimizationResult?.route.flatMap(pallet => 
          pallet.boxes.map((box: any) => {
            const qrUrl = `${window.location.hostname === 'localhost' ? 'https://print-shop-os.vercel.app' : window.location.origin}/inventory/scan?p=${pallet.palletId}&b=${box.boxId}`;
            return (
              <div key={box.boxId} id={`qr-code-${box.boxId}`}>
                <QRCode value={qrUrl} size={100} level="L" />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
