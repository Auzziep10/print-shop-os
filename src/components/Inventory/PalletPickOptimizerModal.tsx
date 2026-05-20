import { useState, useEffect } from 'react';
import { X, Layers, Box, MapPin, Check, CheckCircle2, Search, ShoppingBag, Printer, Loader2, ArrowRight, AlertTriangle, Map } from 'lucide-react';
import { db } from '../../lib/firebase';
import { collection, query, onSnapshot } from 'firebase/firestore';

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
     if (palletItem.sku && palletItem.sku.toLowerCase() === orderItem.skusMap[size].toLowerCase()) {
        return true;
     }
  }
  
  // 2. Generic itemNum check
  if (orderItem.generalSku) {
     if (palletItem.sku && palletItem.sku.toLowerCase() === orderItem.generalSku.toLowerCase()) {
        return true;
     }
  }
  
  // 3. Fallback: match by style name + size
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

  // Reset states when order changes
  useEffect(() => {
    setSelectedOrder(preSelectedOrder || null);
    setOptimizationResult(null);
    setCheckedPicks({});
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
                      sku: invItem.sku || need.skusMap?.[need.size] || need.generalSku || '',
                      qty: pickQty,
                      photoUrl: invItem.photoUrl || need.image || ''
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

  if (!isOpen) return null;

  // Filter orders by search tag or customer
  const filteredOrders = orders.filter(o => {
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
        : `Rack: ${pallet.zone} • Bay ${pallet.rackSpecs?.bay + 1 || 1} • Level ${pallet.rackSpecs?.level || 0}`;

      const boxesHtml = pallet.boxes.map((box: any) => {
        const itemsHtml = box.picks.map((pick: any) => `
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 10px 0; font-weight: bold; font-size: 14px;">[ ] Pick ${pick.qty}x</td>
            <td style="padding: 10px 0; font-size: 14px;">
              <span style="font-weight: bold; color: #1e293b;">${pick.style}</span>
              ${pick.color ? `<span style="color: #64748b; font-size: 12px; margin-left: 6px;">(${pick.color})</span>` : ''}
            </td>
            <td style="padding: 10px 0; font-weight: bold; color: #475569; font-size: 14px;">${pick.size}</td>
            <td style="padding: 10px 0; font-family: monospace; font-size: 12px; color: #64748b;">${pick.sku || '-'}</td>
          </tr>
        `).join('');

        return `
          <div style="margin-top: 15px; margin-left: 20px; border-left: 2px solid #cbd5e1; padding-left: 15px;">
            <h3 style="margin: 0 0 10px 0; font-size: 15px; color: #334155; font-family: sans-serif;">Box: ${box.boxName}</h3>
            <table style="width: 100%; border-collapse: collapse; text-align: left;">
              <thead>
                <tr style="border-bottom: 2px solid #e2e8f0; color: #64748b; font-size: 11px; text-transform: uppercase;">
                  <th style="padding-bottom: 6px; width: 100px;">Check</th>
                  <th style="padding-bottom: 6px;">Garment</th>
                  <th style="padding-bottom: 6px; width: 80px;">Size</th>
                  <th style="padding-bottom: 6px; width: 150px;">SKU</th>
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
        <div style="page-break-inside: avoid; margin-bottom: 30px; border: 1px solid #e2e8f0; padding: 20px; border-radius: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #f1f5f9; padding-bottom: 10px; margin-bottom: 15px;">
            <h2 style="margin: 0; font-family: serif; font-size: 20px; color: #0f172a;">Step ${pIdx + 1}: Pallet ${pallet.name}</h2>
            <span style="font-size: 12px; font-weight: bold; background: #f1f5f9; color: #475569; padding: 4px 10px; border-radius: 9999px;">${locationStr}</span>
          </div>
          ${boxesHtml}
        </div>
      `;
    }).join('');

    const unresolvedHtml = optimizationResult.unresolved.length > 0 ? `
      <div style="margin-top: 40px; border: 1px solid #fee2e2; background: #fef2f2; padding: 20px; border-radius: 8px; page-break-inside: avoid;">
        <h2 style="margin: 0 0 10px 0; color: #991b1b; font-family: sans-serif; font-size: 16px; font-weight: bold;">Unresolved / Out of Stock Items</h2>
        <table style="width: 100%; border-collapse: collapse; text-align: left;">
          <thead>
            <tr style="border-bottom: 1px solid #fca5a5; color: #991b1b; font-size: 11px; text-transform: uppercase;">
              <th style="padding-bottom: 6px;">Garment</th>
              <th style="padding-bottom: 6px; width: 80px;">Size</th>
              <th style="padding-bottom: 6px; width: 120px;">Missing Qty</th>
            </tr>
          </thead>
          <tbody>
            ${optimizationResult.unresolved.map(u => `
              <tr>
                <td style="padding: 8px 0; color: #7f1d1d; font-weight: bold;">${u.style}</td>
                <td style="padding: 8px 0; color: #7f1d1d;">${u.size}</td>
                <td style="padding: 8px 0; color: #b91c1c; font-weight: bold;">${u.unresolved} of ${u.needed} units</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : '';

    printWindow.document.write(`
      <html>
        <head>
          <title>Pick Sheet - ${selectedOrder.portalId || 'Shopify Picking List'}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #0f172a; line-height: 1.5; }
            h1 { font-family: serif; margin-bottom: 5px; }
            .header-table { width: 100%; margin-bottom: 30px; border-bottom: 3px double #e2e8f0; padding-bottom: 20px; }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <table class="header-table">
            <tr>
              <td>
                <h1 style="margin:0;">Pallet Picking List</h1>
                <p style="margin: 5px 0 0 0; font-size: 14px; color: #64748b; font-weight: bold; text-transform: uppercase; tracking-widest: 1px;">Order ID: ${selectedOrder.portalId || 'Uncoded Batch'}</p>
              </td>
              <td style="text-align: right; vertical-align: bottom;">
                <p style="margin: 0; font-size: 14px; font-weight: bold; color: #475569;">Fulfill: ${selectedOrder.title || 'Shopify Order'}</p>
                <p style="margin: 4px 0 0 0; font-size: 12px; color: #64748b;">Printed on ${new Date().toLocaleString()}</p>
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
              <div className="relative">
                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-secondary" />
                <input 
                  type="text" 
                  value={searchOrderQuery}
                  onChange={e => setSearchOrderQuery(e.target.value)}
                  placeholder="Search orders by customer name, tag, item SKU..." 
                  className="w-full bg-white border border-brand-border rounded-2xl pl-12 pr-4 py-3 text-sm focus:border-brand-primary focus:outline-none transition-all shadow-sm"
                  autoFocus
                />
              </div>

              {ordersLoading ? (
                <div className="flex items-center justify-center p-12">
                  <Loader2 className="animate-spin text-brand-primary" size={32} />
                </div>
              ) : filteredOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 text-center text-brand-secondary">
                  <ShoppingBag size={48} className="mb-4 text-brand-secondary/40 animate-bounce" />
                  <p className="font-bold text-lg">No orders matched search criteria.</p>
                  <p className="text-xs mt-2">Make sure orders are imported or tags match Shopify.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto pr-1">
                  {filteredOrders.map((order) => {
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
                      : `Rack: ${pallet.zone} • Bay ${pallet.rackSpecs?.bay + 1 || 1} • Level ${pallet.rackSpecs?.level || 0}`;

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
                              onChange={(e) => handleTogglePalletPicks(pallet, e.target.checked)}
                              className="w-5 h-5 rounded border-brand-border text-brand-primary focus:ring-brand-primary cursor-pointer shrink-0"
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
                                <Map size={12} /> Locate
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
                                      onClick={() => handleTogglePick(key)}
                                      className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${isItemPicked ? 'bg-green-50/40 border-green-200 text-neutral-500' : 'bg-neutral-50/50 border-brand-border/60 text-brand-primary hover:border-neutral-400'}`}
                                    >
                                      <div className="flex items-center gap-4 min-w-0">
                                        <input 
                                          type="checkbox"
                                          checked={isItemPicked}
                                          onChange={() => {}} // toggled on container click
                                          className="w-4.5 h-4.5 rounded border-brand-border text-brand-primary focus:ring-brand-primary cursor-pointer shrink-0"
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
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button 
                onClick={() => setCheckedPicks({})}
                className="flex-1 sm:flex-none px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest text-brand-secondary border border-brand-border hover:bg-neutral-50 hover:text-black rounded-xl transition-all shadow-sm"
              >
                Reset Route
              </button>
              <button 
                onClick={handlePrint}
                className="flex-1 sm:flex-none px-6 py-2.5 text-[10px] font-bold uppercase tracking-widest bg-black text-white hover:bg-neutral-800 rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
              >
                <Printer size={14} /> Print Pick List
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
