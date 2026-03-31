import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Loader2, PackageOpen, Building2, Search, Check, Clock, Box, X, Play, Pause, Activity, ExternalLink, Archive } from 'lucide-react';
import { useOrders } from '../../hooks/useOrders';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../lib/firebase';
import { doc, getDoc, updateDoc, collection, getDocs } from 'firebase/firestore';
import { tokens } from '../../lib/tokens';
import { normalizeUser } from '../../lib/utils';

const getBaseSize = (s: string) => {
  const base = s.split(' ')[0].toUpperCase();
  if (base === 'XXL') return '2XL';
  if (base === 'XXXL') return '3XL';
  if (base === 'XXXXL') return '4XL';
  return base;
};

const sortSizes = (a: string, b: string) => {
  const SIZE_ORDER = ['YXS', 'YS', 'YM', 'YL', 'YXL', 'XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL', 'OSFA'];
  const baseA = getBaseSize(a);
  const baseB = getBaseSize(b);
  const iA = SIZE_ORDER.indexOf(baseA);
  const iB = SIZE_ORDER.indexOf(baseB);
  if (iA === -1 && iB === -1) return a.localeCompare(b);
  if (iA === -1) return 1;
  if (iB === -1) return -1;
  return iA - iB;
};

const DataPill = ({ label, value }: { label: string, value: string }) => (
  <div className="flex flex-col items-center justify-center bg-neutral-100 px-3 py-1.5 rounded-2xl min-w-[84px] max-w-[140px]">
    <span className="text-[10px] text-neutral-500 font-semibold mb-0.5 truncate w-full text-center">{label}:</span>
    <span className="text-xs text-neutral-800 font-semibold leading-none truncate w-full text-center">{value}</span>
  </div>
);

export function Production() {
  const { user, userData } = useAuth();
  const { orders, loading } = useOrders();
  const navigate = useNavigate();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedSubOrderId, setExpandedSubOrderId] = useState<string | null>(null);
  const [customerLogos, setCustomerLogos] = useState<Record<string, string>>({});
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, order: any, item: any, size: string, qty: number } | null>(null);
  const [metricsOrder, setMetricsOrder] = useState<any | null>(null);
  const [editingTargetId, setEditingTargetId] = useState<string | null>(null);
  const [targetInput, setTargetInput] = useState<string>('');
  const [editingTargetDateId, setEditingTargetDateId] = useState<string | null>(null);
  const [targetDateInput, setTargetDateInput] = useState<string>('');
  const [expandedImage, setExpandedImage] = useState<{src: string, alt: string} | null>(null);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [metricsTimeFilter, setMetricsTimeFilter] = useState<string>('Today');
  const [metricsMode, setMetricsMode] = useState<'Production' | 'Kitting'>('Production');
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [activePipelineTab, setActivePipelineTab] = useState<'Active' | 'Archived'>('Active');

  useEffect(() => {
    getDocs(collection(db, 'users')).then(snap => {
      setAllUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }).catch(e => console.error(e));
  }, []);

  const [searchQuery, setSearchQuery] = useState('');

  const handleSaveTarget = async (orderId: string) => {
    const val = parseFloat(targetInput);
    if (!isNaN(val) && val >= 0) {
       if (metricsOrder?.isProjectGroup) {
           await Promise.all(metricsOrder.orders.map((o: any) => updateDoc(doc(db, 'orders', o.id), { projectTargetAvgMinsPerGarment: val })));
           setMetricsOrder({ ...metricsOrder, projectTargetAvgMinsPerGarment: val });
       } else {
           await updateDoc(doc(db, 'orders', orderId), { targetAvgMinsPerGarment: val });
           if (metricsOrder && metricsOrder.id === orderId) {
              setMetricsOrder({ ...metricsOrder, targetAvgMinsPerGarment: val });
           }
       }
    }
    setEditingTargetId(null);
  };

  const handleSaveTargetDate = async (orderId: string) => {
     if (targetDateInput) {
       if (metricsOrder?.isProjectGroup) {
           await Promise.all(metricsOrder.orders.map((o: any) => updateDoc(doc(db, 'orders', o.id), { projectTargetCompletionDate: targetDateInput })));
           setMetricsOrder({ ...metricsOrder, projectTargetCompletionDate: targetDateInput });
       } else {
           await updateDoc(doc(db, 'orders', orderId), { targetCompletionDate: targetDateInput });
           if (metricsOrder && metricsOrder.id === orderId) {
              setMetricsOrder({ ...metricsOrder, targetCompletionDate: targetDateInput });
           }
       }
     }
     setEditingTargetDateId(null);
  };

  const getCompletionData = (order: any) => {
    let totalGarments = 0;
    let completedGarments = 0;
    let totalPackedGarments = 0;
    
    // Compute packed pieces and completed garments from actual orders
    const ordersToProcess = order.isProjectGroup ? order.orders : [order];
    ordersToProcess.forEach((realOrder: any) => {
        if (realOrder.boxes) {
            realOrder.boxes.forEach((box: any) => {
               box.items?.forEach((item: any) => {
                  if (item.sizes && Object.keys(item.sizes).length > 0) {
                      Object.values(item.sizes).forEach((qty: any) => {
                          totalPackedGarments += (parseInt(qty as string) || 0);
                      });
                  } else if (item.qty) {
                      totalPackedGarments += parseInt(item.qty as string) || 0;
                  }
               });
            });
        }
        
        // Compute Garments
        realOrder.items?.forEach((item: any) => {
          let sizeSum = 0;
          if (item.sizes) {
            Object.entries(item.sizes).forEach(([size, qty]: [string, any]) => {
              const q = parseInt(qty as string) || 0;
              sizeSum += q;
              if (item.completedSizes?.includes(size)) {
                completedGarments += q;
              }
            });
          }
          // Always count the requested item globally so 'Total Garments Processed' updates 
          // accurately even if size breakdowns haven't been completed yet.
          totalGarments += Math.max(parseInt(item.qty as string) || 0, sizeSum);
        });
    });
    const completionRatio = totalGarments > 0 ? (completedGarments / totalGarments) : 0;
    const packingRatio = totalGarments > 0 ? (totalPackedGarments / totalGarments) : 0;
    return { totalGarments, completedGarments, completionRatio, totalPackedGarments, packingRatio };
  };

  const groupedProjectsList = Object.values(orders
    .filter(o => {
       if (activePipelineTab === 'Archived') return !!o.isMetricsArchived;
       return (o.statusIndex === 6 || o.statusIndex === 7) && !o.isMetricsArchived;
    })
    .filter(o => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      const title = o.title || '';
      const pid = o.portalId || '';
      const orderId = o.id || '';
      return (title.toLowerCase().includes(q) || pid.toLowerCase().includes(q) || orderId.toLowerCase().includes(q));
    })
    .reduce((acc: any, order: any) => {
       const projectKey = order.project;
       const cid = order.customerId;
       const hash = projectKey ? `proj-${projectKey}` : `single-${order.id}`;
       if (!acc[hash]) {
           acc[hash] = {
              id: projectKey ? `project-${hash}` : order.id,
              isProjectGroup: !!projectKey,
              title: projectKey || order.title || 'Untitled Order',
              customerId: cid,
              orders: [],
              items: [],
              activities: [],
              statusIndex: order.statusIndex
           };
       }
       acc[hash].orders.push(order);
       const itemsWithMeta = (order.items || []).map((i: any) => ({ ...i, sourceOrder: order }));
       acc[hash].items.push(...itemsWithMeta);
       acc[hash].activities.push(...(order.activities || []));
       
       return acc;
    }, {}));

  const productionOrders: any[] = groupedProjectsList.sort((a: any, b: any) => getCompletionData(b).completionRatio - getCompletionData(a).completionRatio);

  useEffect(() => {
    // Fetch unique customer logos
    const fetchLogos = async () => {
      const custIds = [...new Set(productionOrders.map((o: any) => o.customerId).filter(Boolean))];
      for (const cid of custIds) {
        if (!customerLogos[cid]) {
          try {
            const d = await getDoc(doc(db, 'customers', cid));
            if (d.exists() && d.data().logo) {
              setCustomerLogos(prev => ({ ...prev, [cid]: d.data().logo }));
            }
          } catch (e) { }
        }
      }
    };
    if (productionOrders.length > 0) fetchLogos();
  }, [orders]);

  const handleSizeClick = async (projectOrOrder: any, item: any, size: string, qty: number) => {
     const realOrder = item.sourceOrder || projectOrOrder;
     const currentCompleted = item.completedSizes || [];
     const inProgress = item.inProgressSizes || {};
     
     if (currentCompleted.includes(size)) {
         return; 
     }
     if (inProgress[size]) {
         const currentUser = user?.email || 'Team Member';
         const startedUser = inProgress[size].user || 'Team Member';
         
         if (currentUser !== startedUser) {
             alert(`Only ${startedUser.split('@')[0]} can complete this batch because they started the timer.`);
             return;
         }

         const startTime = new Date(inProgress[size].startTime).getTime();
         const runningDuration = inProgress[size].paused ? 0 : Date.now() - startTime;
         const totalElapsedMs = (inProgress[size].elapsedMs || 0) + runningDuration;
         const durationMs = totalElapsedMs > 0 ? totalElapsedMs : (Date.now() - startTime);
         
         const avgItemTimeMs = qty > 0 ? durationMs / qty : 0;
         const itemsPerHour = durationMs > 0 ? (qty / (durationMs / 3600000)) : 0;
         
         const newCompleted = [...currentCompleted, size];
         const newInProgress = { ...inProgress };
         delete newInProgress[size];
         
         const newStats = { ...(item.sizeStats || {}) };
         newStats[size] = {
             durationMs,
             avgItemTimeMs,
             itemsPerHour: Math.round(itemsPerHour),
             user: user?.email || 'Team Member',
             timestamp: new Date().toISOString()
         };
         
         const updatedItems = realOrder.items.map((i: any) => 
             // IMPORTANT: Match `i.id === item.id` from realOrder.items
             i.id === item.id ? { ...i, completedSizes: newCompleted, inProgressSizes: newInProgress, sizeStats: newStats } : i
         );
         
         const formatedTime = durationMs > 60000 ? `${Math.round(durationMs/60000)}m` : `${Math.round(durationMs/1000)}s`;
         const activity = {
           id: `act-${Date.now()}`,
           type: 'system',
           message: `Completed ${qty}x ${size} for ${item.style} in ${formatedTime}. Rate: ${Math.round(itemsPerHour)}/hr`,
           user: userData?.name || user?.displayName || user?.email?.split('@')[0] || 'Team Member',
           timestamp: new Date().toISOString()
         };

         await updateDoc(doc(db, 'orders', realOrder.id), { 
           items: updatedItems,
           activities: [activity, ...(realOrder.activities || [])]
         });
     } else {
         const newInProgress = { 
             ...inProgress, 
             [size]: { 
                 startTime: new Date().toISOString(), 
                 user: user?.email || 'Team Member' 
             } 
         };
         
         const updatedItems = realOrder.items.map((i: any) => 
             i.id === item.id ? { ...i, inProgressSizes: newInProgress } : i
         );
         
         const activity = {
           id: `act-${Date.now()}`,
           type: 'system',
           message: `Started production on ${qty}x ${size} for ${item.style}`,
           user: userData?.name || user?.displayName || user?.email?.split('@')[0] || 'Team Member',
           timestamp: new Date().toISOString()
         };

         await updateDoc(doc(db, 'orders', realOrder.id), { 
           items: updatedItems,
           activities: [activity, ...(realOrder.activities || [])]
         });
     }
  };

  const isSizeFullyBoxed = (orderOrProject: any, item: any, size: string, totalQty: number) => {
      const realOrder = item.sourceOrder || orderOrProject;
      if (!realOrder.boxes || totalQty <= 0) return false;
      let boxedQty = 0;
      realOrder.boxes.forEach((box: any) => {
          const boxItem = box.items?.find((bi: any) => String(bi.id) === String(item.id));
          if (boxItem?.sizes?.[size]) boxedQty += boxItem.sizes[size];
      });
      return boxedQty >= totalQty;
  };

  const handleContextMenuAction = async (action: string, boxId?: string) => {
    if (!contextMenu) return;
    const { order: projectOrOrder, item, size, qty } = contextMenu;
    const realOrder = item.sourceOrder || projectOrOrder;
    
    let updatedItems = [...(realOrder.items || [])];
    let updatedBoxes = [...(realOrder.boxes || [])];
    let activityMessage = '';

    if (action === 'uncomplete') {
       updatedItems = updatedItems.map((i: any) => 
           i.id === item.id ? { 
               ...i, 
               completedSizes: (i.completedSizes || []).filter((s: string) => s !== size) 
           } : i
       );
       activityMessage = `Unmarked size ${size} for ${item.style}`;
    } else if (action === 'pause_timer') {
       const newInProgress = { ...(item.inProgressSizes || {}) };
       const target = newInProgress[size];
       if (target && !target.paused) {
         const runningDuration = Date.now() - new Date(target.startTime).getTime();
         target.elapsedMs = (target.elapsedMs || 0) + runningDuration;
         target.paused = true;
       }
       updatedItems = updatedItems.map((i: any) => 
           i.id === item.id ? { ...i, inProgressSizes: newInProgress } : i
       );
       activityMessage = `Paused timer on size ${size} for ${item.style}`;
    } else if (action === 'resume_timer') {
       const newInProgress = { ...(item.inProgressSizes || {}) };
       const target = newInProgress[size];
       if (target && target.paused) {
         target.startTime = new Date().toISOString();
         target.paused = false;
       }
       updatedItems = updatedItems.map((i: any) => 
           i.id === item.id ? { ...i, inProgressSizes: newInProgress } : i
       );
       activityMessage = `Resumed timer on size ${size} for ${item.style}`;
    } else if (action === 'cancel_timer') {
       const newInProgress = { ...(item.inProgressSizes || {}) };
       delete newInProgress[size];
       updatedItems = updatedItems.map((i: any) => 
           i.id === item.id ? { ...i, inProgressSizes: newInProgress } : i
       );
       activityMessage = `Canceled timer on size ${size} for ${item.style}`;
    } else if (action === 'add_to_box' && boxId) {
        const targetBoxIndex = updatedBoxes.findIndex((b: any) => b.id === boxId);
        if (targetBoxIndex >= 0) {
            const box = updatedBoxes[targetBoxIndex];
            const existingBoxItems = [...(box.items || [])];
            const matchIdx = existingBoxItems.findIndex((bi: any) => String(bi.id) === String(item.id));
            
            if (matchIdx >= 0) {
                const bItem = existingBoxItems[matchIdx];
                const newSizes = { ...(bItem.sizes || {}), [size]: (bItem.sizes?.[size] || 0) + qty };
                const newTotalQty = Object.values(newSizes).reduce((a: any, b: any) => a + (parseInt(b) || 0), 0);
                existingBoxItems[matchIdx] = { ...bItem, sizes: newSizes, qty: newTotalQty };
            } else {
                existingBoxItems.push({
                   id: item.id, style: item.style || 'Custom Garment', color: item.color || '', gender: item.gender || '',
                   image: item.image || '', itemNum: item.itemNum || '',
                   sizes: { [size]: qty }, qty: qty
                });
            }
            updatedBoxes[targetBoxIndex] = { ...box, items: existingBoxItems };
            activityMessage = `Added ${qty}x ${size} to ${box.name}`;
        }
    }

    if (activityMessage) {
       const activity = {
         id: `act-${Date.now()}`,
         type: 'system',
         message: activityMessage,
         user: userData?.name || user?.displayName || user?.email?.split('@')[0] || 'Team Member',
         timestamp: new Date().toISOString()
       };

       await updateDoc(doc(db, 'orders', realOrder.id), { 
         items: updatedItems,
         boxes: updatedBoxes,
         activities: [activity, ...(realOrder.activities || [])]
       });
    }
    setContextMenu(null);
  };

  const renderItemCard = (orderContext: any, item: any) => (
    <div key={item.id} className="flex flex-col gap-0 border-b border-brand-border/40 last:border-b-0 pb-6 mb-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
       
       {/* Left Side: Visual & Specs */}
       <div className="flex flex-col gap-3 flex-1 min-w-0 pr-2">
         <div className="flex items-center gap-4">
           <div 
             className="w-16 h-16 rounded-[14px] overflow-hidden shrink-0 bg-transparent flex items-center justify-center cursor-pointer hover:scale-[1.05] transition-transform tooltip relative z-20"
             onClick={() => setExpandedImage({ src: item.image, alt: item.style })}
             title="Click to view full screen"
           >
             <img src={item.image} alt={item.style} className="w-full h-full object-contain mix-blend-multiply p-1 pointer-events-none" />
           </div>
           <div>
              <h4 className="font-bold text-gray-900 text-[15px]">{item.style}</h4>
              <p className="text-xs font-semibold text-gray-500 mt-0.5">
                 {item.gender && item.gender !== 'Unisex' ? `${item.gender} ` : ''} 
                 {item.color ? (item.gender && item.gender !== 'Unisex' ? `- ${item.color}` : item.color) : ''}
              </p>
           </div>
         </div>
         
         {/* Specs pills */}
         <div className="flex flex-wrap gap-2 mt-1">
            {item.itemNum && <DataPill label="Item #" value={item.itemNum} />}
            {item.color && <DataPill label="Color" value={item.color} />}
         </div>
       </div>

       {/* Right Side: Interactive Checking Area */}
       <div className="flex flex-wrap lg:flex-nowrap items-end lg:items-center gap-4 shrink-0">
         <div className="flex items-stretch gap-[2px] bg-neutral-200 p-[3px] rounded-xl font-sans shrink-0">
           {item.sizes && Object.entries(item.sizes).sort(([a], [b]) => sortSizes(a, b)).map(([size, qty]: [string, any]) => {
             if (qty <= 0) return null;
             const isCompleted = item.completedSizes?.includes(size);
             const inProgress = item.inProgressSizes?.[size];
             const isPacked = isSizeFullyBoxed(orderContext, item, size, qty);

             let colorClassTop = 'bg-neutral-300 text-neutral-600 group-hover/sizebtn:bg-neutral-400';
             let colorClassBottom = 'bg-white text-neutral-800';
             let topContent: any = <span className="truncate inline-block max-w-[40px] leading-none" title={size}>{size}</span>;
             let iconContent: any = null;
             let wrapperClass = 'hover:-translate-y-0.5 hover:shadow-sm';

             if (isPacked) {
                 colorClassTop = 'bg-blue-500 text-white';
                 colorClassBottom = 'bg-blue-50 text-blue-700';
                 iconContent = <Box size={10} strokeWidth={3} className="ml-1 opacity-80 shrink-0" />;
                 wrapperClass = 'opacity-80 hover:opacity-100';
             } else if (isCompleted) {
                 colorClassTop = 'bg-green-500 text-white';
                 colorClassBottom = 'bg-green-50 text-green-700';
                 iconContent = <Check size={10} strokeWidth={4} className="ml-1 opacity-80 shrink-0" />;
                 wrapperClass = 'opacity-80 hover:opacity-100';
             } else if (inProgress) {
                 if (inProgress.paused) {
                     colorClassTop = 'bg-orange-500 text-white';
                     colorClassBottom = 'bg-orange-50 text-orange-700';
                     iconContent = <Pause size={10} strokeWidth={3} className="ml-1 opacity-80 shrink-0" />;
                     wrapperClass = 'opacity-90 hover:opacity-100';
                 } else {
                     colorClassTop = 'bg-red-500 text-white';
                     colorClassBottom = 'bg-red-50 text-red-700';
                     iconContent = <Clock size={10} strokeWidth={3} className="animate-pulse ml-1 opacity-80 shrink-0" />;
                     wrapperClass = 'opacity-90 hover:opacity-100';
                 }
             }

             return (
             <div 
               key={size} 
               className={`min-w-[44px] px-0.5 group/sizebtn text-center flex flex-col cursor-pointer transition-all relative ${wrapperClass}`}
               onClick={(e) => { e.stopPropagation(); handleSizeClick(orderContext, item, size, qty); }}
               onContextMenu={(e) => { 
                 e.preventDefault(); 
                 e.stopPropagation(); 
                 setContextMenu({ x: e.clientX, y: e.clientY, order: orderContext, item, size, qty }); 
               }}
               title={isPacked ? "Packed in shipments." : isCompleted ? `Completed. Right-click to manage.` : inProgress ? (inProgress.paused ? "Timer paused. Right-click to resume!" : "Timer running. Click to complete!") : "Click to start timer"}
             >
               {/* Hover hints */}
               {!isCompleted && !isPacked && !inProgress && (
                 <div className="absolute inset-0 bg-brand-primary/5 backdrop-blur-[1px] opacity-0 group-hover/sizebtn:opacity-100 transition-opacity z-10 flex flex-col items-center justify-center rounded-[8px] pointer-events-none">
                    <Clock size={20} className="text-brand-primary drop-shadow-md" strokeWidth={3} />
                 </div>
               )}
               {!isCompleted && !isPacked && inProgress && !inProgress.paused && (
                 <div className="absolute inset-0 bg-brand-primary/5 backdrop-blur-[1px] opacity-0 group-hover/sizebtn:opacity-100 transition-opacity z-10 flex flex-col items-center justify-center rounded-[8px] pointer-events-none">
                    <Check size={20} className="text-brand-primary drop-shadow-md" strokeWidth={3} />
                 </div>
               )}
               {!isCompleted && !isPacked && inProgress && inProgress.paused && (
                 <div className="absolute inset-0 bg-brand-primary/5 backdrop-blur-[1px] opacity-0 group-hover/sizebtn:opacity-100 transition-opacity z-10 flex flex-col items-center justify-center rounded-[8px] pointer-events-none">
                    <Play size={20} className="text-brand-primary drop-shadow-md" strokeWidth={3} />
                 </div>
               )}

               <div className={`text-[10px] font-bold py-1.5 px-2 rounded-t-[8px] uppercase tracking-wide h-6 flex items-center justify-center transition-colors relative z-0 ${colorClassTop}`}>
                  {topContent}
                  {iconContent}
               </div>
               <div className={`text-[12px] font-bold py-2 px-2 rounded-b-[8px] h-8 flex flex-col items-center justify-center transition-colors relative z-0 ${colorClassBottom}`}>
                 {qty}
               </div>

               {/* Stats Tooltip */}
               {(isCompleted || isPacked) && item.sizeStats?.[size] && (
                 <div className="absolute bottom-[110%] left-1/2 -translate-x-1/2 bg-black text-white text-[10px] py-1.5 px-2 rounded-lg opacity-0 group-hover/sizebtn:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-xl border border-neutral-700">
                    <div className="font-bold">{Math.round(item.sizeStats[size].durationMs / 60000)}m Total</div>
                    <div className="text-neutral-300 font-medium mt-0.5">{item.sizeStats[size].itemsPerHour}/hr Avg</div>
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-black"></div>
                 </div>
               )}
             </div>
             );
           })}
         </div>
       </div>

      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center text-gray-400 gap-3">
        <Loader2 className="animate-spin" size={32} />
        <p className="font-semibold uppercase tracking-widest text-xs">Loading Production Pipeline...</p>
      </div>
    );
  }

  if (productionOrders.length === 0 && !searchQuery && activePipelineTab === 'Active') {
    return (
      <div className="max-w-[1600px] mx-auto mt-8 flex flex-col gap-6 p-6 md:p-10">
        <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-6 mb-8">
          <div className="flex flex-col gap-3">
            <div>
              <h1 className={tokens.typography.h1}>Production Pipeline</h1>
              <p className="text-brand-secondary text-sm mt-1">Manage active orders currently on the floor.</p>
            </div>
            <div className="flex items-center gap-1 bg-neutral-100/80 p-1.5 rounded-xl w-fit border border-neutral-200 shadow-inner mt-2">
               <button 
                  onClick={() => setActivePipelineTab('Active')}
                  className={`px-5 py-1.5 rounded-lg text-[13px] font-bold tracking-widest uppercase transition-all ${activePipelineTab==='Active' ? 'bg-white text-brand-primary shadow-sm border border-neutral-200' : 'text-brand-secondary hover:text-brand-primary border border-transparent'}`}
               >
                 Active
               </button>
               <button 
                  onClick={() => setActivePipelineTab('Archived')}
                  className={`px-5 py-1.5 rounded-lg text-[13px] font-bold tracking-widest uppercase transition-all ${activePipelineTab==='Archived' ? 'bg-white text-brand-primary shadow-sm border border-neutral-200' : 'text-brand-secondary hover:text-brand-primary border border-transparent'}`}
               >
                 Archived
               </button>
            </div>
          </div>
        </div>
        <div className="max-w-[800px] mx-auto mt-16 flex flex-col items-center justify-center text-center gap-6">
          <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center text-gray-300 border border-gray-100">
            <PackageOpen strokeWidth={1.5} size={40} />
          </div>
          <div>
            <h2 className="text-3xl font-serif text-gray-900 mb-2">No active production orders yet.</h2>
            <p className="text-gray-500 font-medium max-w-sm mx-auto leading-relaxed">
               There are no orders actively in the Production phase right now.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-[1600px] mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-6 mb-8">
        <div className="flex flex-col gap-3">
          <div>
            <h1 className={tokens.typography.h1}>Production Pipeline</h1>
            <p className="text-brand-secondary text-sm mt-1">Manage active orders currently on the floor.</p>
          </div>
          <div className="flex items-center gap-1 bg-neutral-100/80 p-1.5 rounded-xl w-fit border border-neutral-200 shadow-inner mt-2">
             <button 
                onClick={() => setActivePipelineTab('Active')}
                className={`px-5 py-1.5 rounded-lg text-[13px] font-bold tracking-widest uppercase transition-all ${activePipelineTab==='Active' ? 'bg-white text-brand-primary shadow-sm border border-neutral-200' : 'text-brand-secondary hover:text-brand-primary border border-transparent'}`}
             >
               Active
             </button>
             <button 
                onClick={() => setActivePipelineTab('Archived')}
                className={`px-5 py-1.5 rounded-lg text-[13px] font-bold tracking-widest uppercase transition-all ${activePipelineTab==='Archived' ? 'bg-white text-brand-primary shadow-sm border border-neutral-200' : 'text-brand-secondary hover:text-brand-primary border border-transparent'}`}
             >
               Archived
             </button>
          </div>
        </div>
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Search orders..."
            className="w-full bg-white border border-brand-border rounded-xl pl-10 pr-4 py-3 text-sm focus:border-brand-primary outline-none transition-colors"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {productionOrders.length === 0 && searchQuery && (
          <div className="text-center py-12 text-gray-500">
             No orders completely match "{searchQuery}"
          </div>
        )}
        {productionOrders.map((order: any) => {
          const isExpanded = expandedId === order.id;
          const timelineSteps = ['Production', 'Kitting', 'Shipped'];

          const { totalGarments, completedGarments, completionRatio, totalPackedGarments, packingRatio } = getCompletionData(order);
          
          let visualIndex = 0; // Production
          if (order.statusIndex === 6) { // In Production
             visualIndex = 0 + completionRatio; // Fills toward Kitting
             if (completionRatio >= 0.99 && packingRatio > 0) {
                 visualIndex = 1 + packingRatio;
             }
          } else if (order.statusIndex === 7) { // Kitting (Internally mapping statusIndex=7)
             visualIndex = 1 + packingRatio;
          } else if (order.statusIndex > 7) {
             visualIndex = 2; // Shipped
          }

          const fillWidth = `${(visualIndex / (timelineSteps.length - 1)) * 100}%`;

          return (
            <div key={order.id} className="w-full relative px-2">
              <div 
                className={`bg-white rounded-[2rem] border transition-all duration-300 relative group 
                ${isExpanded ? 'shadow-[0_8px_30px_rgb(0,0,0,0.06)] z-10 border-brand-border/60' : 'hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:-translate-y-1 hover:z-10 z-0 border-brand-border/60'}
                ${order.isMetricsArchived ? 'opacity-80 hover:opacity-100 grayscale-[0.2]' : ''}`}
              >
                <div 
                  onClick={() => setExpandedId(isExpanded ? null : order.id)}
                  className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 xl:gap-8 min-h-[80px] p-6 lg:pr-10 cursor-pointer"
                >
                  {/* Left: Logo & Title */}
                  <div className="flex items-center gap-6 w-full xl:w-[320px] shrink-0 relative group/left">
                    {!order.isProjectGroup && (
                      <div className={`absolute -left-3 top-1/2 -translate-y-1/2 z-30 transition-opacity ${selectedOrderIds.includes(order.id) ? 'opacity-100' : 'opacity-0 group-hover/left:opacity-100'}`}>
                         <div 
                           className={`w-5 h-5 rounded-md border-[2px] cursor-pointer flex items-center justify-center transition-colors shadow-sm ${selectedOrderIds.includes(order.id) ? 'bg-brand-primary border-brand-primary text-white' : 'border-neutral-300 bg-white hover:border-brand-primary/50'}`}
                           onClick={(e) => {
                               e.stopPropagation();
                               if (selectedOrderIds.includes(order.id)) {
                                   setSelectedOrderIds(prev => prev.filter(id => id !== order.id));
                               } else {
                                   setSelectedOrderIds(prev => [...prev, order.id]);
                               }
                           }}
                         >
                            {selectedOrderIds.includes(order.id) && <Check size={12} strokeWidth={4} />}
                         </div>
                      </div>
                    )}
                    <div className={`w-20 h-20 shrink-0 flex items-center justify-center text-neutral-300 transition-all duration-300 ${!order.isProjectGroup && selectedOrderIds.includes(order.id) ? 'ml-4' : 'group-hover/left:ml-4'}`}>
                      {customerLogos[order.customerId] ? (
                        <img src={customerLogos[order.customerId]} alt="Customer Logo" className="max-w-full max-h-full object-contain shrink-0 filter mix-blend-multiply opacity-90" />
                      ) : (
                        <Building2 size={32} strokeWidth={1.5} />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-3 group z-20 relative">
                        <h2 className="text-2xl font-serif text-gray-900 hover:text-brand-primary transition-colors line-clamp-1 break-all" title={order.title}>{order.title || 'Custom Order'}</h2>
                        <span className="text-gray-400 group-hover:text-black transition-colors shrink-0">
                          <ChevronRight size={20} strokeWidth={2.5} className={`transition-transform duration-500 ease-out ${isExpanded ? 'rotate-90' : ''}`} />
                        </span>
                      </div>
                      {order.isProjectGroup && order.orders.length > 1 ? (
                         <span className="flex items-center gap-1.5 text-[11px] font-bold text-gray-500 mt-1.5 uppercase tracking-widest bg-neutral-100/80 px-2.5 py-1 rounded-md max-w-max border border-transparent z-20 relative">
                            {order.orders.length} Orders Grouped
                         </span>
                      ) : (
                         <button 
                           onClick={(e) => { e.stopPropagation(); navigate(`/orders/${order.orders?.[0]?.id || order.id}`); }}
                           className="flex items-center gap-1.5 text-[11px] font-bold text-gray-500 hover:text-brand-primary mt-1.5 uppercase tracking-widest transition-colors z-20 relative bg-neutral-100/80 hover:bg-brand-primary/10 px-2.5 py-1 rounded-md max-w-max border border-transparent hover:border-brand-primary/20"
                           title="Open Order Details"
                         >
                            Order #{order.orders?.[0]?.portalId || order.portalId || (order.orders?.[0]?.id || order.id).substring(0,8)}
                            <ExternalLink size={12} className="opacity-80" />
                         </button>
                      )}
                    </div>
                  </div>

                  {/* Right: Progress Tracker */}
                  <div className="flex-1 w-full pt-4 xl:pt-0">
                     <div className="w-full flex flex-wrap justify-between items-center mb-4 sm:mb-6 px-2 sm:px-4 gap-4">
                       <div className="flex items-center gap-4 sm:gap-6 bg-white/50 border border-brand-border/60 rounded-xl px-4 py-2 shrink-0 shadow-sm">
                          <div className="flex flex-col">
                             <span className="text-[9px] font-bold uppercase tracking-widest text-brand-secondary/70">Production</span>
                             <span className="text-brand-primary font-bold text-lg leading-none mt-1 flex items-baseline gap-1.5">
                                {Math.round(completionRatio * 100)}% 
                                <span className="text-[11px] font-semibold text-brand-secondary/60 tracking-wider inline-block min-w-max hidden lg:inline-block">{completedGarments}/{totalGarments} DONE</span>
                             </span>
                          </div>
                          <div className="w-[1px] h-8 bg-brand-border/50"></div>
                          <div className="flex flex-col">
                             <span className="text-[9px] font-bold uppercase tracking-widest text-brand-secondary/70">Kitting</span>
                             <span className={`${packingRatio > 0 ? 'text-brand-primary' : 'text-neutral-400'} font-bold text-lg leading-none mt-1 flex items-baseline gap-1.5`}>
                                {Math.round(packingRatio * 100)}% 
                                <span className={`text-[11px] font-semibold ${packingRatio > 0 ? 'text-brand-secondary/60' : 'text-neutral-400/60'} tracking-wider inline-block min-w-max hidden lg:inline-block`}>{totalPackedGarments}/{totalGarments} PACKED</span>
                             </span>
                           </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 sm:gap-4 shrink-0">
                         {order.isProjectGroup && (
                             <button
                               onClick={(e) => { e.stopPropagation(); setShowGroupModal(true); setEditingTargetId(order.id); }}
                               className="text-[10px] font-bold uppercase tracking-widest text-orange-500 bg-orange-50 hover:bg-orange-100 border border-orange-100 px-3 py-1.5 rounded-lg flex items-center gap-2 transition-colors ml-auto"
                             >
                               Ungroup
                             </button>
                           )}
                           <button
                             onClick={async (e) => {
                               e.stopPropagation();
                               const newArchivedState = !order.isMetricsArchived;
                               if (order.isProjectGroup) {
                                  await Promise.all(order.orders.map((o: any) => updateDoc(doc(db, 'orders', o.id), { isMetricsArchived: newArchivedState })));
                               } else {
                                  await updateDoc(doc(db, 'orders', order.id), { isMetricsArchived: newArchivedState });
                               }
                             }}
                             className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg flex items-center gap-2 transition-colors border ${
                               order.isMetricsArchived
                                 ? 'text-brand-secondary bg-neutral-100 hover:bg-neutral-200 border-neutral-200'
                                 : 'text-brand-secondary bg-white hover:bg-neutral-50 shadow-sm border border-neutral-200'
                             }`}
                           >
                             <Archive size={14} /> {order.isMetricsArchived ? 'Unarchive' : 'Archive'}
                           </button>
                           <button
                             onClick={(e) => { e.stopPropagation(); setMetricsOrder(order); }}
                             className="text-[10px] font-bold uppercase tracking-widest text-brand-primary bg-brand-primary/5 hover:bg-brand-primary/10 px-3 py-1.5 rounded-lg flex items-center gap-2 transition-colors border border-brand-primary/10"
                           >
                             <Activity size={14} /> Team Metrics
                           </button>
                       </div>
                    </div>
                    <div className="relative w-full px-4 pb-8">
                      <div className="absolute top-0 left-4 right-4 h-[12px] bg-neutral-200 rounded-full"></div>
                      <div className="absolute top-0 left-4 h-[12px] bg-brand-primary rounded-full transition-all duration-700 ease-in-out" style={{ width: `calc(${fillWidth} - 2rem)` }}></div>
                      
                      <div className="relative flex justify-between items-center z-10 px-0 h-[12px]">
                        {timelineSteps.map((step, idx) => {
                          const isCompleted = idx <= Math.floor(visualIndex);
                          return (
                            <div key={step} className="flex flex-col items-center relative">
                              <div className={`w-[14px] h-[14px] rounded-full flex items-center justify-center transition-colors duration-300 relative z-10 ${isCompleted ? 'bg-neutral-500 border-[2.5px] border-white shadow-sm' : 'bg-[#f0f0f0] border-[2px] border-neutral-300'}`}></div>
                              <span className="absolute top-6 text-[11px] font-bold text-neutral-500 w-24 text-center tracking-wide">{step}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Expanded Items Section */}
                {order.isProjectGroup && order.orders && order.orders.length > 0 ? (
                  <div className={`grid transition-all duration-500 ease-in-out px-4 origin-top ${isExpanded ? 'grid-rows-[1fr] opacity-100 border-t border-brand-border/40' : 'grid-rows-[0fr] opacity-0 pointer-events-none'}`}>
                     <div className={`${isExpanded ? 'overflow-visible pb-6 pt-6' : 'overflow-hidden pt-0'} space-y-4`}>
                        {order.orders.map((subOrder: any) => {
                           const subIsExpanded = expandedSubOrderId === subOrder.id;
                           return (
                              <div key={subOrder.id} className="border border-brand-border/40 rounded-2xl bg-white shadow-sm overflow-hidden group">
                                 <div 
                                    className="flex flex-col xl:flex-row xl:items-center justify-between px-6 py-4 cursor-pointer hover:bg-gray-50 transition-colors border-b border-transparent group-hover:border-brand-border/20 gap-4 xl:gap-8"
                                    onClick={() => setExpandedSubOrderId(subIsExpanded ? null : subOrder.id)}
                                 >
                                    <div className="flex items-center justify-between xl:justify-start gap-3 shrink-0 xl:w-1/4">
                                       <div className="flex items-center gap-3">
                                          <ChevronRight size={18} strokeWidth={2.5} className={`transition-transform duration-300 text-brand-secondary ${subIsExpanded ? 'rotate-90 text-brand-primary' : ''}`} />
                                          <span className="font-bold text-sm tracking-wide text-brand-primary">{subOrder.title || `Order #${subOrder.portalId || subOrder.id.substring(0,8)}`}</span>
                                       </div>
                                       <span className="text-[10px] uppercase font-bold tracking-widest bg-brand-bg px-2 py-0.5 rounded text-brand-secondary border border-brand-border/50 shrink-0">
                                          {(subOrder.items || []).length} items
                                       </span>
                                    </div>
                                    
                                    <div className="flex-1 w-full xl:min-w-[350px] max-w-2xl mx-auto py-2 xl:py-0 px-4">
                                       {(() => {
                                          const subData = getCompletionData(subOrder);
                                          const subTimelineSteps = ['Production', 'Kitting', 'Shipped'];
                                          let subVisualIndex = 0;
                                          if (subOrder.statusIndex === 6) {
                                              subVisualIndex = 0 + (subData.completionRatio || 0);
                                              if ((subData.completionRatio || 0) >= 0.99 && (subData.packingRatio || 0) > 0) {
                                                  subVisualIndex = 1 + (subData.packingRatio || 0);
                                              }
                                          }
                                          else if (subOrder.statusIndex === 7) subVisualIndex = 1 + (subData.packingRatio || 0);
                                          else if (subOrder.statusIndex > 7) subVisualIndex = 2;
                                          const subFillWidth = `${(subVisualIndex / (subTimelineSteps.length - 1)) * 100}%`;

                                          return (
                                             <div className="flex flex-col gap-2 w-full">
                                                <div className="flex justify-between items-center px-1 text-[9px] font-bold tracking-wider uppercase flex-wrap gap-2">
                                                   <div className="flex gap-3">
                                                      <span className="text-neutral-500"><span className="opacity-60 font-semibold mr-1">PROD:</span> {subData.completedGarments || 0}/{subData.totalGarments || 0}</span>
                                                      <span className={subData.packingRatio > 0 ? 'text-brand-primary' : 'text-neutral-400'}><span className={`${subData.packingRatio > 0 ? 'opacity-80' : 'opacity-50'} font-semibold mr-1`}>KIT:</span> {subData.totalPackedGarments || 0}/{subData.totalGarments || 0}</span>
                                                   </div>
                                                   <div className="flex gap-3">
                                                      <span className={subData.completionRatio === 1 ? 'text-brand-primary' : 'text-neutral-500'}><span className="opacity-60 font-semibold mr-1">PROD:</span> {Math.round((subData.completionRatio || 0) * 100)}%</span>
                                                      <span className={subData.packingRatio > 0 ? 'text-brand-primary' : 'text-neutral-400'}><span className={`${subData.packingRatio > 0 ? 'opacity-80' : 'opacity-50'} font-semibold mr-1`}>KIT:</span> {Math.round((subData.packingRatio || 0) * 100)}%</span>
                                                   </div>
                                                </div>
                                                <div className="relative w-full px-1">
                                                   <div className="absolute top-0 left-1 right-1 h-[6px] bg-neutral-200 rounded-full"></div>
                                                   <div className="absolute top-0 left-1 h-[6px] bg-brand-primary rounded-full transition-all duration-700 ease-in-out" style={{ width: `calc(${subFillWidth} - 0.5rem)` }}></div>
                                                   <div className="relative flex justify-between items-center z-10 px-0 h-[6px]">
                                                     {subTimelineSteps.map((step, idx) => {
                                                       const isCompleted = idx <= Math.floor(subVisualIndex);
                                                       return (
                                                         <div key={step} className="flex flex-col items-center relative group/tip">
                                                           <div className={`w-[14px] h-[14px] rounded-full flex items-center justify-center transition-colors duration-300 relative z-10 ${isCompleted ? 'bg-neutral-500 border-[2.5px] border-white shadow-sm' : 'bg-[#f0f0f0] border-[2px] border-neutral-300'}`}></div>
                                                           <div className="absolute top-full mt-1.5 bg-black text-white text-[10px] font-bold px-2 py-1 rounded opacity-0 group-hover/tip:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-md">
                                                              {step}
                                                           </div>
                                                         </div>
                                                       );
                                                     })}
                                                   </div>
                                                </div>
                                             </div>
                                          );
                                       })()}
                                    </div>

                                    <div className="flex items-center justify-end gap-3 shrink-0 xl:w-1/4">
                                       <button 
                                         onClick={(e) => { e.stopPropagation(); navigate(`/orders/${subOrder.id}`); }}
                                         className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500 hover:text-brand-primary uppercase tracking-widest transition-colors bg-white hover:bg-brand-primary/10 px-3 py-1.5 rounded-lg border border-brand-border w-full sm:w-auto justify-center"
                                       >
                                          Open Order <ExternalLink size={12} className="opacity-80" />
                                       </button>
                                    </div>
                                 </div>
                                 
                                 <div className={`grid transition-all duration-300 ease-in-out origin-top ${subIsExpanded ? 'grid-rows-[1fr] opacity-100 border-t border-brand-border/40' : 'grid-rows-[0fr] opacity-0 pointer-events-none'}`}>
                                    <div className={`${subIsExpanded ? 'overflow-visible pb-4 pt-4 px-6 lg:px-10' : 'overflow-hidden pt-0 px-6 lg:px-10'} space-y-4 bg-gray-50/30`}>
                                       {subOrder.items?.map((item: any) => renderItemCard(order, { ...item, sourceOrder: subOrder }))}
                                    </div>
                                 </div>
                              </div>
                           );
                        })}
                     </div>
                  </div>
                ) : order.items && order.items.length > 0 && (
                  <div className={`grid transition-all duration-500 ease-in-out px-6 lg:px-10 origin-top ${isExpanded ? 'grid-rows-[1fr] opacity-100 border-t border-brand-border/40' : 'grid-rows-[0fr] opacity-0 pointer-events-none'}`}>
                    <div className={`${isExpanded ? 'overflow-visible pb-6 pt-6' : 'overflow-hidden pt-0'} space-y-4`}>
                      {order.items.map((item: any) => renderItemCard(order, item))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      
      {contextMenu && (
        <div 
          className="fixed inset-0 z-[200]" 
          onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
          onClick={() => setContextMenu(null)}
        >
          <div 
            className="absolute bg-white rounded-xl shadow-2xl border border-brand-border overflow-hidden min-w-[200px] flex flex-col z-[201] p-1"
            style={{ 
              top: Math.min(contextMenu.y, window.innerHeight - Math.max(200, (contextMenu.order.boxes?.length || 0) * 40 + 100)), 
               left: Math.min(contextMenu.x, window.innerWidth - 220) 
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-2 border-b border-brand-border/50 mb-1 flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-brand-secondary tracking-widest">{contextMenu.size} Options</span>
              <span className="text-[10px] font-bold text-brand-primary bg-brand-bg px-2 py-0.5 rounded-full">Qty: {contextMenu.qty}</span>
            </div>
            
            {contextMenu.item.inProgressSizes?.[contextMenu.size] && contextMenu.item.inProgressSizes[contextMenu.size].user === (user?.email || 'Team Member') && (
               <>
                 {contextMenu.item.inProgressSizes[contextMenu.size].paused ? (
                   <button 
                     onClick={() => handleContextMenuAction('resume_timer')}
                     className="text-left px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-green-600 hover:bg-green-50 rounded-lg transition-colors flex items-center gap-2"
                   >
                     <Play size={14} /> Resume Timer
                   </button>
                 ) : (
                   <button 
                     onClick={() => handleContextMenuAction('pause_timer')}
                     className="text-left px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-orange-600 hover:bg-orange-50 rounded-lg transition-colors flex items-center gap-2"
                   >
                     <Pause size={14} /> Pause Timer
                   </button>
                 )}
                 <button 
                   onClick={() => handleContextMenuAction('cancel_timer')}
                   className="text-left px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-2"
                 >
                   <X size={14} /> Cancel Timer
                 </button>
               </>
            )}

            {contextMenu.item.completedSizes?.includes(contextMenu.size) && (!contextMenu.item.sizeStats?.[contextMenu.size]?.user || contextMenu.item.sizeStats[contextMenu.size].user === (user?.email || 'Team Member')) && (
               <button 
                 onClick={() => handleContextMenuAction('uncomplete')}
                 className="text-left px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-orange-600 hover:bg-orange-50 rounded-lg transition-colors flex items-center gap-2"
               >
                 <X size={14} /> Uncomplete Size
               </button>
            )}

            <div className="my-1 border-t border-brand-border/30"></div>
            <div className="px-3 py-1.5 text-[10px] font-bold uppercase text-brand-secondary tracking-widest">Add to Package</div>
            
            {contextMenu.order.boxes && contextMenu.order.boxes.length > 0 ? (
                contextMenu.order.boxes.map((box: any) => (
                   <button 
                     key={box.id}
                     onClick={() => handleContextMenuAction('add_to_box', box.id)}
                     className="text-left px-3 py-2 text-[11px] font-bold tracking-wider text-brand-primary hover:bg-brand-bg rounded-lg transition-colors flex items-center gap-2"
                   >
                     <Box size={14} className="text-brand-secondary" /> Add to {box.name}
                   </button>
                ))
            ) : (
                <div className="px-3 py-2 text-[10px] text-brand-secondary italic text-center">No shipments created yet.</div>
            )}
          </div>
        </div>
      )}

      {/* Grouping Actions */}
      {selectedOrderIds.length > 0 && (
         <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-neutral-900 border border-neutral-700 text-white px-6 py-4 rounded-full shadow-2xl z-[150] flex items-center gap-6 animate-in slide-in-from-bottom-5">
            <span className="font-bold text-sm tracking-wide">{selectedOrderIds.length} orders selected</span>
            <div className="w-[1px] h-6 bg-white/20"></div>
            <button onClick={() => setShowGroupModal(true)} className="px-4 py-2 bg-white text-black font-bold uppercase tracking-wider text-[11px] rounded-full hover:bg-neutral-200 transition-colors shadow-sm">
               Group into Project
            </button>
            <button onClick={() => setSelectedOrderIds([])} className="p-2 -mr-2 hover:bg-white/10 rounded-full transition-colors text-white/60 hover:text-white shrink-0">
               <X size={18} strokeWidth={2.5} />
            </button>
         </div>
      )}

      {showGroupModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
           <div className="bg-white rounded-[24px] w-full max-w-md p-8 shadow-2xl border border-brand-border animate-in zoom-in-95">
              <h3 className="font-serif text-2xl text-brand-primary mb-2">Create Project Group</h3>
              <p className="text-sm text-brand-secondary mb-6 leading-relaxed">Enter a name for this project to group the {selectedOrderIds.length} selected orders tightly together on the production floor pipeline.</p>
              
              <div className="mb-8">
                 <label className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary/70 mb-2 block">Project Name</label>
                 <input 
                    type="text"
                    placeholder="e.g. Acme Q3 Release"
                    className="w-full bg-brand-bg/50 border border-brand-border rounded-xl px-4 py-3 outline-none focus:border-brand-primary transition-colors text-brand-primary font-medium"
                    value={newGroupName}
                    onChange={e => setNewGroupName(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => {
                       if (e.key === 'Enter' && newGroupName.trim()) {
                           Promise.all(selectedOrderIds.map(id => updateDoc(doc(db, 'orders', id), { project: newGroupName.trim() })));
                           setSelectedOrderIds([]);
                           setNewGroupName('');
                           setShowGroupModal(false);
                       }
                    }}
                 />
              </div>

              <div className="flex items-center justify-end gap-3">
                 <button onClick={() => { setShowGroupModal(false); setNewGroupName(''); }} className="px-5 py-2.5 rounded-full text-sm font-bold uppercase tracking-widest text-brand-secondary hover:bg-brand-bg transition-colors">Cancel</button>
                 <button 
                   onClick={async () => {
                       if (!newGroupName.trim()) return;
                       await Promise.all(selectedOrderIds.map(id => updateDoc(doc(db, 'orders', id), { project: newGroupName.trim() })));
                       setSelectedOrderIds([]);
                       setNewGroupName('');
                       setShowGroupModal(false);
                   }} 
                   className="px-6 py-2.5 rounded-full text-sm font-bold uppercase tracking-widest bg-brand-primary text-white hover:opacity-90 transition-opacity shadow-md"
                 >
                   Group
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* Team Metrics Modal */}
      {metricsOrder && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setMetricsOrder(null)}>
           <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl overflow-hidden border border-brand-border" onClick={e => e.stopPropagation()}>
             <div className="p-6 border-b border-brand-border flex md:flex-row flex-col justify-between items-center bg-brand-bg/50 gap-4">
                <div className="flex items-center gap-3 w-full md:w-auto overflow-hidden">
                   <div className="w-10 h-10 shrink-0 rounded-full bg-brand-primary/10 flex items-center justify-center text-brand-primary">
                     <Activity size={20} strokeWidth={2.5} />
                   </div>
                   <div className="min-w-0">
                     <h3 className="font-serif text-xl text-brand-primary truncate">Team Production Metrics</h3>
                     <p className="text-[11px] font-bold uppercase tracking-wider text-brand-secondary truncate">{metricsOrder.title || 'Custom Order'}</p>
                   </div>
                </div>
                <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                  <div className="flex bg-neutral-200/60 p-1 rounded-lg shrink-0 overflow-x-auto no-scrollbar gap-0.5 items-stretch">
                    <button onClick={() => setMetricsMode('Production')} className={`px-3 py-1.5 text-[10px] whitespace-nowrap font-bold uppercase tracking-wider rounded-md transition-all ${metricsMode === 'Production' ? 'bg-white shadow-sm text-brand-primary' : 'text-brand-secondary hover:text-brand-primary'}`}>Production</button>
                    <button onClick={() => setMetricsMode('Kitting')} className={`px-3 py-1.5 text-[10px] whitespace-nowrap font-bold uppercase tracking-wider rounded-md transition-all ${metricsMode === 'Kitting' ? 'bg-white shadow-sm text-brand-primary' : 'text-brand-secondary hover:text-brand-primary'}`}>Kitting</button>
                  </div>
                  <div className="flex bg-neutral-200/60 p-1 rounded-lg shrink-0 overflow-x-auto no-scrollbar gap-0.5 items-stretch">
                    <button onClick={() => setMetricsTimeFilter('All')} className={`px-3 py-1.5 text-[10px] whitespace-nowrap font-bold uppercase tracking-wider rounded-md transition-all ${metricsTimeFilter === 'All' ? 'bg-white shadow-sm text-brand-primary' : 'text-brand-secondary hover:text-brand-primary'}`}>All Time</button>
                    <button onClick={() => setMetricsTimeFilter('Today')} className={`px-3 py-1.5 text-[10px] whitespace-nowrap font-bold uppercase tracking-wider rounded-md transition-all ${metricsTimeFilter === 'Today' ? 'bg-white shadow-sm text-brand-primary' : 'text-brand-secondary hover:text-brand-primary'}`}>Today</button>
                    <input 
                      type="date" 
                      value={(metricsTimeFilter !== 'All' && metricsTimeFilter !== 'Today' && metricsTimeFilter !== 'Yesterday') ? metricsTimeFilter : ''}
                      onChange={(e) => {
                         if (e.target.value) setMetricsTimeFilter(e.target.value);
                         else setMetricsTimeFilter('All');
                      }}
                      onClick={(e) => { try { (e.target as any).showPicker(); } catch(err){ } }}
                      className={`px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all outline-none cursor-pointer w-auto ${(metricsTimeFilter !== 'All' && metricsTimeFilter !== 'Today' && metricsTimeFilter !== 'Yesterday') ? 'bg-white text-brand-primary shadow-sm' : 'bg-transparent text-brand-secondary hover:text-brand-primary cursor-pointer'}`}
                    />
                  </div>
                  <button 
                    onClick={() => setMetricsOrder(null)}
                    className="p-2 shrink-0 hover:bg-neutral-200 rounded-full transition-colors text-brand-secondary"
                  >
                    <X size={20} />
                  </button>
                </div>
             </div>
             
             <div className="p-6 overflow-y-auto">
               {(() => {
                 const statsByUser: Record<string, { totalTimeMins: number, garmentsCompleted: number, completionsCount: number }> = {};
                 const bestDisplayNames: Record<string, string> = {};
                 
                 let globalTotalGarmentsCompletedWithStats = 0;
                 let globalTotalUnitsPackedWithStats = 0;
                 let globalTotalTimeMins = 0;
                 let totalOrderGarments = 0;
                 let trueTotalGarmentsCompleted = 0; // The actual count regardless of attached stat metrics
                 let trueTotalTimeMins = 0;
                 let trueTotalGarmentsCompletedWithStats = 0;

                 if (metricsMode === 'Production') {
                 (metricsOrder.items || []).forEach((item: any) => {
                    let sizeSum = 0;
                    if (item.sizes) {
                        Object.values(item.sizes).forEach((q: any) => {
                            sizeSum += (parseInt(q as string) || 0);
                        });
                    }
                    totalOrderGarments += Math.max(parseInt(item.qty as string) || 0, sizeSum);

                    const completed = item.completedSizes || [];
                    completed.forEach((size: string) => {
                       const qty = parseInt(item.sizes?.[size]) || 0;
                       trueTotalGarmentsCompleted += qty;

                       const stat = item.sizeStats?.[size];
                       if (stat) {
                           const durationMs = stat.durationMs || 0;
                           trueTotalTimeMins += durationMs / 60000;
                           trueTotalGarmentsCompletedWithStats += qty;

                           let userName = stat.user?.split('@')[0] || stat.user;
                           
                           const actMatch = (metricsOrder.activities || []).find((a: any) => 
                               a.message?.startsWith('Completed') && a.message?.includes(`x ${size} for ${item.style}`)
                           );
                               
                           if (!userName) {
                               userName = actMatch?.user?.split('@')[0] || actMatch?.user || 'Unknown';
                           }

                           if (metricsTimeFilter !== 'All') {
                               const statTimeStr = stat.timestamp || actMatch?.timestamp;
                               if (statTimeStr) {
                                   const statDate = new Date(statTimeStr);
                                   const now = new Date();
                                   const isToday = statDate.getDate() === now.getDate() && statDate.getMonth() === now.getMonth() && statDate.getFullYear() === now.getFullYear();
                                   
                                   const yesterday = new Date(now);
                                   yesterday.setDate(yesterday.getDate() - 1);
                                   const isYesterday = statDate.getDate() === yesterday.getDate() && statDate.getMonth() === yesterday.getMonth() && statDate.getFullYear() === yesterday.getFullYear();
                                   
                                   if (metricsTimeFilter === 'Today' && !isToday) return;
                                   if (metricsTimeFilter === 'Yesterday' && !isYesterday) return;
                                   if (metricsTimeFilter !== 'All' && metricsTimeFilter !== 'Today' && metricsTimeFilter !== 'Yesterday') {
                                       const lYear = statDate.getFullYear();
                                       const lMonth = String(statDate.getMonth() + 1).padStart(2, '0');
                                       const lDay = String(statDate.getDate()).padStart(2, '0');
                                       const statDateString = `${lYear}-${lMonth}-${lDay}`;
                                       if (statDateString !== metricsTimeFilter) return;
                                   }
                               } else {
                                   return; // Omit metric chunk locally if filtered string has unknown date footprint
                               }
                           }

                           let rawName = normalizeUser(userName, allUsers);
                           const groupKey = rawName.toLowerCase().replace(/[^a-z]/g, '') || 'unknown';
                           
                           if (!bestDisplayNames[groupKey]) {
                              bestDisplayNames[groupKey] = rawName;
                           } else if (rawName.includes(' ') && !bestDisplayNames[groupKey].includes(' ')) {
                              bestDisplayNames[groupKey] = rawName;
                           } else if (rawName.length > bestDisplayNames[groupKey].length && rawName !== rawName.toLowerCase()) {
                              bestDisplayNames[groupKey] = rawName;
                           }

                           const timeMins = durationMs / 60000;

                           if (!statsByUser[groupKey]) {
                              statsByUser[groupKey] = { totalTimeMins: 0, garmentsCompleted: 0, completionsCount: 0 };
                           }
                           statsByUser[groupKey].totalTimeMins += timeMins;
                           statsByUser[groupKey].garmentsCompleted += qty;
                           statsByUser[groupKey].completionsCount += 1;
                           
                           globalTotalGarmentsCompletedWithStats += qty;
                           globalTotalTimeMins += timeMins;
                       }
                    });
                 });
                 } else { // Kitting
                     (metricsOrder.items || []).forEach((item: any) => {
                         let sizeSum = 0;
                         if (item.sizes) {
                             Object.values(item.sizes).forEach((q: any) => {
                                 sizeSum += (parseInt(q as string) || 0);
                             });
                         }
                         totalOrderGarments += Math.max(parseInt(item.qty as string) || 0, sizeSum);
                     });
                     
                     (metricsOrder.boxes || []).forEach((box: any) => {
                         trueTotalGarmentsCompleted += box.items?.reduce((s:number, i:any)=> s + (parseInt(i.qty)||0), 0) || 0;
                     });

                     (metricsOrder.activities || []).forEach((act: any) => {
                         let userToCredit = act.user;
                         let createdMatch = act.message?.match(/Created .* containing (\d+) items/);
                         let deletedMatch = act.message?.match(/Deleted shipment box/);
                         let boxesDelta = 0;
                         let unitsDelta = 0;

                         if (createdMatch) {
                            boxesDelta = 1;
                            unitsDelta = parseInt(createdMatch[1]) || 0;
                         } else if (deletedMatch) {
                            boxesDelta = -1;
                         }

                         if (boxesDelta !== 0) {
                             if (metricsTimeFilter !== 'All') {
                                 const statTimeStr = act.timestamp;
                                 if (statTimeStr) {
                                     const statDate = new Date(statTimeStr);
                                     const now = new Date();
                                     const isToday = statDate.getDate() === now.getDate() && statDate.getMonth() === now.getMonth() && statDate.getFullYear() === now.getFullYear();
                                     
                                     const yesterday = new Date(now);
                                     yesterday.setDate(yesterday.getDate() - 1);
                                     const isYesterday = statDate.getDate() === yesterday.getDate() && statDate.getMonth() === yesterday.getMonth() && statDate.getFullYear() === yesterday.getFullYear();
                                     
                                     if (metricsTimeFilter === 'Today' && !isToday) return;
                                     if (metricsTimeFilter === 'Yesterday' && !isYesterday) return;
                                     if (metricsTimeFilter !== 'All' && metricsTimeFilter !== 'Today' && metricsTimeFilter !== 'Yesterday') {
                                         const lYear = statDate.getFullYear();
                                         const lMonth = String(statDate.getMonth() + 1).padStart(2, '0');
                                         const lDay = String(statDate.getDate()).padStart(2, '0');
                                         const statDateString = `${lYear}-${lMonth}-${lDay}`;
                                         if (statDateString !== metricsTimeFilter) return;
                                     }
                                 } else {
                                     return;
                                 }
                             }

                             let rawName = normalizeUser(userToCredit || 'Unknown', allUsers);
                             const groupKey = rawName.toLowerCase().replace(/[^a-z]/g, '') || 'unknown';
                             if (!bestDisplayNames[groupKey]) {
                                bestDisplayNames[groupKey] = rawName;
                             }
                             if (!statsByUser[groupKey]) {
                                statsByUser[groupKey] = { totalTimeMins: 0, garmentsCompleted: 0, completionsCount: 0 };
                             }
                             statsByUser[groupKey].garmentsCompleted += boxesDelta;
                             statsByUser[groupKey].completionsCount += boxesDelta > 0 ? 1 : 0;
                             
                             globalTotalGarmentsCompletedWithStats += boxesDelta;
                             trueTotalGarmentsCompletedWithStats += boxesDelta;
                             globalTotalUnitsPackedWithStats += unitsDelta;

                             const statTimeStr = act.timestamp;
                             if (statTimeStr) {
                                  if (!(statsByUser[groupKey] as any).firstActStr || new Date(statTimeStr) < new Date((statsByUser[groupKey] as any).firstActStr)) {
                                       (statsByUser[groupKey] as any).firstActStr = statTimeStr;
                                  }
                                  if (!(statsByUser[groupKey] as any).lastActStr || new Date(statTimeStr) > new Date((statsByUser[groupKey] as any).lastActStr)) {
                                       (statsByUser[groupKey] as any).lastActStr = statTimeStr;
                                  }
                             }
                         }
                     });

                     Object.keys(statsByUser).forEach(gk => {
                          const userStat = statsByUser[gk] as any;
                          if (userStat.firstActStr && userStat.lastActStr) {
                               const start = new Date(userStat.firstActStr).getTime();
                               const end = new Date(userStat.lastActStr).getTime();
                               let mins = (end - start) / 60000;
                               if (mins < 1) mins = 1; // Minimum 1 minute buffer for single actions
                               statsByUser[gk].totalTimeMins = mins;
                               globalTotalTimeMins += mins;
                          }
                     });
                 }

                 const users = Object.keys(statsByUser).sort((a,b) => statsByUser[b].garmentsCompleted - statsByUser[a].garmentsCompleted);

                 if (users.length === 0) {
                   return <p className="text-center text-sm text-brand-secondary py-8">No performance metrics recorded yet for this order. Complete an item to see predictions.</p>;
                 }

                 // Calculates remaining purely from the physical pipeline truth `completedSizes` 
                 const remainingGarments = Math.max(0, totalOrderGarments - trueTotalGarmentsCompleted);
                 const globalAvgMinsPerGarment = globalTotalGarmentsCompletedWithStats > 0 ? (globalTotalTimeMins / globalTotalGarmentsCompletedWithStats) : 0;
                 const averageUnitsPerBox = (metricsMode === 'Kitting' && globalTotalGarmentsCompletedWithStats > 0) ? (globalTotalUnitsPackedWithStats / globalTotalGarmentsCompletedWithStats).toFixed(1) : '0';

                 let estimatedRemainingMins = remainingGarments * globalAvgMinsPerGarment;
                 if (metricsMode === 'Kitting') {
                     const avgUnitsNum = parseFloat(averageUnitsPerBox);
                     if (avgUnitsNum > 0) {
                         const expectedTotalBoxes = totalOrderGarments / avgUnitsNum;
                         const trueAllTimeBoxes = metricsOrder.boxes?.length || 0;
                         const remainingBoxes = Math.max(0, expectedTotalBoxes - trueAllTimeBoxes);
                         estimatedRemainingMins = remainingBoxes * globalAvgMinsPerGarment;
                     } else {
                         estimatedRemainingMins = 0;
                     }
                 }
                 
                 let businessHoursRemaining = 0;
                 let hasTargetDate = false;
                 const targetDateRaw = metricsOrder.isProjectGroup ? (metricsOrder.projectTargetCompletionDate || metricsOrder.orders?.[0]?.projectTargetCompletionDate) : metricsOrder.targetCompletionDate;
                 const activeTargetAvgMins = metricsOrder.isProjectGroup ? (metricsOrder.projectTargetAvgMinsPerGarment || metricsOrder.orders?.[0]?.projectTargetAvgMinsPerGarment) : metricsOrder.targetAvgMinsPerGarment;
                 
                 if (targetDateRaw) {
                     hasTargetDate = true;
                     const tDate = new Date(targetDateRaw);
                     const now = new Date();
                     if (tDate > now) {
                         let current = new Date(now);
                         let bMins = 0;
                         while (current < tDate) {
                             if (current.getDay() !== 0 && current.getDay() !== 6) {
                                 const h = current.getHours();
                                 if (h >= 9 && h < 17) {
                                     bMins++;
                                 }
                             }
                             current.setTime(current.getTime() + 60000);
                         }
                         businessHoursRemaining = Math.round(bMins / 60);
                     }
                 }

                     let efficiencyMessage = null;
                     if (remainingGarments === 0 && activeTargetAvgMins && trueTotalGarmentsCompletedWithStats > 0) {
                         const trueOverallAvg = trueTotalTimeMins / trueTotalGarmentsCompletedWithStats;
                         const projectedFinalMins = trueOverallAvg * totalOrderGarments;
                         const targetFinalMins = activeTargetAvgMins * totalOrderGarments;
                         const savedMins = targetFinalMins - projectedFinalMins;
                         
                         if (Math.abs(savedMins) >= 1) {
                             const h = Math.abs(savedMins) / 60;
                             const timeStr = h >= 1 ? `${h.toFixed(1)}h` : `${Math.round(Math.abs(savedMins))}m`;
                             efficiencyMessage = savedMins > 0 
                                 ? `Finished ${timeStr} ahead of schedule!` 
                                 : `Ran ${timeStr} behind schedule.`;
                         } else {
                             efficiencyMessage = "Finished exactly on schedule!";
                         }
                     }

                     return (
                       <div className="space-y-6">
                         {/* Predictive Metrics Banner */}
                         <div className="bg-gradient-to-br from-brand-primary/5 to-brand-primary/10 border border-brand-primary/20 rounded-xl p-5 shadow-sm text-brand-primary">
                            <div className="flex items-center justify-between mb-3 border-b border-brand-primary/10 pb-3">
                           <div className="flex items-center gap-2">
                             <Clock size={16} />
                             <h4 className="font-bold uppercase tracking-wider text-[11px]">AI Production Forecast</h4>
                           </div>
                           <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2">
                                   {editingTargetId === metricsOrder.id ? (
                                      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-brand-primary/80 bg-white/50 px-2 py-1 rounded-md border border-brand-primary/10 w-full sm:w-auto">
                                         <span>Expected / Garment:</span>
                                         <input
                                           type="number"
                                           step="0.1"
                                           value={targetInput}
                                           onChange={e => setTargetInput(e.target.value)}
                                           className="w-16 px-2 py-0.5 text-xs text-brand-primary font-bold border border-brand-primary/40 rounded bg-white outline-none ml-1"
                                           placeholder="Mins"
                                           autoFocus
                                         />
                                         <button onClick={() => handleSaveTarget(metricsOrder.id)} className="text-[10px] font-bold uppercase bg-brand-primary text-white px-2 py-1 rounded ml-1">Save</button>
                                         <button onClick={() => setEditingTargetId(null)} className="text-brand-secondary hover:text-brand-primary"><X size={14} /></button>
                                      </div>
                                   ) : (
                                      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-brand-primary/80 bg-white/50 px-2 py-1 rounded-md border border-brand-primary/10">
                                         <span>Expected / Garment: {activeTargetAvgMins ? `${activeTargetAvgMins}m` : 'Not Set'}</span>
                                         <button onClick={() => { setTargetInput(activeTargetAvgMins?.toString() || ''); setEditingTargetId(metricsOrder.id); }} className="hover:text-brand-primary text-brand-secondary underline decoration-brand-border underline-offset-2">Edit</button>
                                      </div>
                                   )}
                                   {editingTargetDateId === metricsOrder.id ? (
                                      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-brand-primary/80 bg-white/50 px-2 py-1 rounded-md border border-brand-primary/10 w-full sm:w-auto">
                                         <span>Deadline:</span>
                                         <input
                                           type="datetime-local"
                                           value={targetDateInput}
                                           onChange={e => setTargetDateInput(e.target.value)}
                                           className="px-2 py-0.5 text-xs text-brand-primary font-bold border border-brand-primary/40 rounded bg-white outline-none ml-1"
                                           autoFocus
                                         />
                                         <button onClick={() => handleSaveTargetDate(metricsOrder.id)} className="text-[10px] font-bold uppercase bg-brand-primary text-white px-2 py-1 rounded ml-1">Save</button>
                                         <button onClick={() => setEditingTargetDateId(null)} className="text-brand-secondary hover:text-brand-primary"><X size={14} /></button>
                                      </div>
                                   ) : (
                                      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-brand-primary/80 bg-white/50 px-2 py-1 rounded-md border border-brand-primary/10">
                                         <span>Deadline: {targetDateRaw ? new Date(targetDateRaw).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Not Set'}</span>
                                         <button onClick={() => { setTargetDateInput(targetDateRaw || ''); setEditingTargetDateId(metricsOrder.id); }} className="hover:text-brand-primary text-brand-secondary underline decoration-brand-border underline-offset-2">Edit</button>
                                      </div>
                                   )}
                            </div>
                         </div>
                         <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                             <div className="flex flex-col">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-brand-primary/60 mb-1">{metricsMode === 'Kitting' ? 'Total Boxes' : `Total ${metricsTimeFilter === 'All' ? 'Processed' : 'Produced'}`}</span>
                                <span className="text-xl font-black">{globalTotalGarmentsCompletedWithStats || trueTotalGarmentsCompleted}</span>
                             </div>
                             <div className="flex flex-col border-l border-brand-primary/10 pl-4">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-brand-primary/60 mb-1">{metricsMode === 'Kitting' ? 'Avg Units / Box' : 'Remaining Units'}</span>
                                <span className="text-xl font-black">{metricsMode === 'Kitting' ? averageUnitsPerBox : remainingGarments}</span>
                             </div>
                             <div className="flex flex-col relative border-l border-brand-primary/10 pl-4">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-brand-primary/60 mb-1">Avg / {metricsMode === 'Kitting' ? 'Box' : 'Garment'}</span>
                                <div className="flex items-end gap-2">
                                  <span className={`text-xl font-black text-brand-primary`}>{globalAvgMinsPerGarment >= 1 ? globalAvgMinsPerGarment.toFixed(1) + 'm' : Math.round(globalAvgMinsPerGarment * 60) + 's'}</span>
                                  {activeTargetAvgMins && (
                                     <span className={`text-[10px] font-bold mb-1 ${globalAvgMinsPerGarment <= activeTargetAvgMins ? 'text-green-600' : 'text-orange-500'}`}>
                                        {globalAvgMinsPerGarment <= activeTargetAvgMins ? 'On Track' : 'Behind'}
                                     </span>
                                  )}
                                </div>
                             </div>
                             <div className="flex flex-col border-l border-brand-primary/10 pl-4">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-brand-primary/60 mb-1">Expected Time</span>
                                <span className={`text-xl font-black text-brand-primary`}>{estimatedRemainingMins > 60 ? (estimatedRemainingMins / 60).toFixed(1) + 'h' : Math.round(estimatedRemainingMins) + 'm'}</span>
                             </div>
                             <div className="flex flex-col border-l border-brand-primary/10 pl-4">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-brand-primary/60 mb-1">Time Left</span>
                                <span className={`text-xl font-black ${hasTargetDate && businessHoursRemaining <= 0 ? 'text-red-500' : 'text-brand-primary'}`}>
                                   {hasTargetDate ? (businessHoursRemaining <= 0 ? 'Overdue' : `${businessHoursRemaining}h`) : 'No Deadline'}
                                </span>
                             </div>
                          </div>
                        </div>

                              {remainingGarments === 0 && metricsMode !== 'Kitting' ? (
                                 <div className="bg-gradient-to-r from-emerald-500 to-emerald-400 text-white rounded-xl p-6 shadow-md flex flex-col items-center justify-center gap-2 mb-6 relative overflow-hidden text-center">
                                    <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "url('data:image/svg+xml,%3Csvg width=\\'20\\' height=\\'20\\' viewBox=\\'0 0 20 20\\' xmlns=\\'http://www.w3.org/2000/svg\\'%3E%3Cg fill=\\'%23ffffff\\' fill-opacity=\\'1\\' fill-rule=\\'evenodd\\'%3E%3Ccircle cx=\\'3\\' cy=\\'3\\' r=\\'3\\'/%3E%3Ccircle cx=\\'13\\' cy=\\'13\\' r=\\'3\\'/%3E%3C/g%3E%3C/svg%3E')" }}></div>
                                    <div className="flex items-center gap-3 relative z-10">
                                      <Check className="h-8 w-8 shrink-0" strokeWidth={3} />
                                      <div className="text-2xl font-black tracking-tight drop-shadow-md">PRODUCTION COMPLETE!</div>
                                    </div>
                                    {efficiencyMessage && (
                                      <div className="relative z-10 text-sm font-bold bg-black/10 px-4 py-1.5 rounded-full mt-1">
                                        {efficiencyMessage}
                                      </div>
                                    )}
                                 </div>
                              ) : null}

                     <div className="space-y-4">
                     {users.map(groupKey => {
                       const stat = statsByUser[groupKey];
                       const displayName = bestDisplayNames[groupKey] || groupKey;
                       const avgTimePerGarment = stat.garmentsCompleted > 0 ? (stat.totalTimeMins / stat.garmentsCompleted) : 0;
                       const overallRatePerHour = stat.totalTimeMins > 0 ? ((stat.garmentsCompleted / stat.totalTimeMins) * 60) : 0;
                       return (
                         <div key={groupKey} className="bg-white border border-brand-border rounded-xl p-5 shadow-sm">
                           <h4 className="font-bold text-lg text-brand-primary mb-4 pb-2 border-b border-brand-border/40">{displayName}</h4>
                           <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                               <div className="flex flex-col">
                                  <span className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary/70 mb-1">{metricsMode === 'Kitting' ? 'Total Boxes' : 'Total Garments'}</span>
                                  <span className="text-xl font-black text-brand-primary">{stat.garmentsCompleted}</span>
                               </div>
                               <div className="flex flex-col">
                                  <span className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary/70 mb-1">Avg Time / {metricsMode === 'Kitting' ? 'Box' : 'Garment'}</span>
                                  <span className={`text-xl font-black text-blue-600`}>{avgTimePerGarment >= 1 ? avgTimePerGarment.toFixed(1) + 'm' : Math.round(avgTimePerGarment * 60) + 's'}</span>
                               </div>
                               <div className="flex flex-col">
                                  <span className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary/70 mb-1">Total Time</span>
                                  <span className={`text-xl font-black text-brand-primary`}>{`${Math.round(stat.totalTimeMins)}m`}</span>
                               </div>
                               <div className="flex flex-col">
                                  <span className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary/70 mb-1">Overall Rate</span>
                                  <span className={`text-xl font-black text-green-600`}>{`${Math.round(overallRatePerHour)}/hr`}</span>
                               </div>
                            </div>
                          </div>
                       );
                     })}
                   </div>
                   </div>
                 );
               })()}
             </div>
           </div>
        </div>
      )}

      {/* Image Overlay */}
      {expandedImage && (
        <div 
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30 backdrop-blur-md p-6 animate-in fade-in duration-200" 
          onClick={() => setExpandedImage(null)}
        >
           <button 
             className="absolute top-6 right-6 text-white/70 hover:text-white transition-colors p-2 bg-black/20 hover:bg-black/40 rounded-full" 
             onClick={() => setExpandedImage(null)}
           >
             <X size={24} />
           </button>
           <div 
             className="relative w-full max-w-3xl aspect-[4/3] max-h-[85vh] rounded-[2rem] overflow-hidden cursor-crosshair bg-white shadow-[0_30px_100px_-20px_rgba(0,0,0,0.6)] animate-in zoom-in-95 duration-200 flex items-center justify-center border border-white/20"
             onClick={(e) => e.stopPropagation()}
             onMouseMove={(e) => {
               const { left, top, width, height } = e.currentTarget.getBoundingClientRect();
               const x = (e.clientX - left) / width;
               const y = (e.clientY - top) / height;
               const img = e.currentTarget.querySelector('img');
               if (img) img.style.transformOrigin = `${x * 100}% ${y * 100}%`;
             }}
             title="Hover to zoom"
           >
             <img 
               src={expandedImage.src} 
               alt={expandedImage.alt} 
               className="w-full h-full object-contain mix-blend-multiply transition-transform duration-200 ease-out hover:scale-[2] p-8 md:p-12" 
             />
           </div>
        </div>
      )}
    </div>
  );
}
