import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Loader2, PackageOpen, Building2, Search, Check, Clock, Box, X, Play, Pause, Activity, ExternalLink } from 'lucide-react';
import { useOrders } from '../../hooks/useOrders';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { tokens } from '../../lib/tokens';

const sortSizes = (a: string, b: string) => {
  const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', 'OSFA'];
  const iA = SIZE_ORDER.indexOf(a.toUpperCase());
  const iB = SIZE_ORDER.indexOf(b.toUpperCase());
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
  const { user } = useAuth();
  const { orders, loading } = useOrders();
  const navigate = useNavigate();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [customerLogos, setCustomerLogos] = useState<Record<string, string>>({});
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, order: any, item: any, size: string, qty: number } | null>(null);
  const [metricsOrder, setMetricsOrder] = useState<any | null>(null);
  const [editingTargetId, setEditingTargetId] = useState<string | null>(null);
  const [targetInput, setTargetInput] = useState<string>('');

  const [searchQuery, setSearchQuery] = useState('');

  const handleSaveTarget = async (orderId: string) => {
    const val = parseFloat(targetInput);
    if (!isNaN(val) && val >= 0) {
       await updateDoc(doc(db, 'orders', orderId), { targetAvgMinsPerGarment: val });
       if (metricsOrder && metricsOrder.id === orderId) {
          setMetricsOrder({ ...metricsOrder, targetAvgMinsPerGarment: val });
       }
    }
    setEditingTargetId(null);
  };

  // Calculate completion ratio helper
  const getCompletionData = (order: any) => {
    let totalGarments = 0;
    let completedGarments = 0;
    order.items?.forEach((item: any) => {
      if (item.sizes) {
        Object.entries(item.sizes).forEach(([size, qty]: [string, any]) => {
          const q = parseInt(qty as string) || 0;
          totalGarments += q;
          if (item.completedSizes?.includes(size)) {
            completedGarments += q;
          }
        });
      }
    });
    const completionRatio = totalGarments > 0 ? (completedGarments / totalGarments) : 0;
    return { totalGarments, completedGarments, completionRatio };
  };

  const productionOrders = orders
    .filter(o => o.statusIndex === 6 || o.statusIndex === 7)
    .filter(o => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (o.title?.toLowerCase().includes(q) || o.portalId?.toLowerCase().includes(q) || o.id.toLowerCase().includes(q));
    })
    .sort((a, b) => getCompletionData(b).completionRatio - getCompletionData(a).completionRatio);

  useEffect(() => {
    // Fetch unique customer logos
    const fetchLogos = async () => {
      const custIds = [...new Set(productionOrders.map(o => o.customerId).filter(Boolean))];
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

  const handleSizeClick = async (order: any, item: any, size: string, qty: number) => {
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
             user: user?.email || 'Team Member'
         };
         
         const updatedItems = order.items.map((i: any) => 
             i.id === item.id ? { ...i, completedSizes: newCompleted, inProgressSizes: newInProgress, sizeStats: newStats } : i
         );
         
         const formatedTime = durationMs > 60000 ? `${Math.round(durationMs/60000)}m` : `${Math.round(durationMs/1000)}s`;
         const activity = {
           id: `act-${Date.now()}`,
           type: 'system',
           message: `Completed ${qty}x ${size} for ${item.style} in ${formatedTime}. Rate: ${Math.round(itemsPerHour)}/hr`,
           user: user?.displayName || user?.email?.split('@')[0] || 'Team Member',
           timestamp: new Date().toISOString()
         };

         await updateDoc(doc(db, 'orders', order.id), { 
           items: updatedItems,
           activities: [activity, ...(order.activities || [])]
         });
     } else {
         const newInProgress = { 
             ...inProgress, 
             [size]: { 
                 startTime: new Date().toISOString(), 
                 user: user?.email || 'Team Member' 
             } 
         };
         
         const updatedItems = order.items.map((i: any) => 
             i.id === item.id ? { ...i, inProgressSizes: newInProgress } : i
         );
         
         const activity = {
           id: `act-${Date.now()}`,
           type: 'system',
           message: `Started production on ${qty}x ${size} for ${item.style}`,
           user: user?.displayName || user?.email?.split('@')[0] || 'Team Member',
           timestamp: new Date().toISOString()
         };

         await updateDoc(doc(db, 'orders', order.id), { 
           items: updatedItems,
           activities: [activity, ...(order.activities || [])]
         });
     }
  };

  const isSizeFullyBoxed = (order: any, item: any, size: string, totalQty: number) => {
      if (!order.boxes || totalQty <= 0) return false;
      let boxedQty = 0;
      order.boxes.forEach((box: any) => {
          const boxItem = box.items?.find((bi: any) => String(bi.id) === String(item.id));
          if (boxItem?.sizes?.[size]) boxedQty += boxItem.sizes[size];
      });
      return boxedQty >= totalQty;
  };

  const handleContextMenuAction = async (action: string, boxId?: string) => {
    if (!contextMenu) return;
    const { order, item, size, qty } = contextMenu;
    
    let updatedItems = [...(order.items || [])];
    let updatedBoxes = [...(order.boxes || [])];
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
         user: user?.displayName || user?.email?.split('@')[0] || 'Team Member',
         timestamp: new Date().toISOString()
       };

       await updateDoc(doc(db, 'orders', order.id), { 
         items: updatedItems,
         boxes: updatedBoxes,
         activities: [activity, ...(order.activities || [])]
       });
    }
    setContextMenu(null);
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center text-gray-400 gap-3">
        <Loader2 className="animate-spin" size={32} />
        <p className="font-semibold uppercase tracking-widest text-xs">Loading Production Pipeline...</p>
      </div>
    );
  }

  if (productionOrders.length === 0 && !searchQuery) {
    return (
      <div className="max-w-[800px] mx-auto mt-24 flex flex-col items-center justify-center text-center gap-6">
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
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-[1600px] mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-6 mb-8">
        <div>
          <h1 className={tokens.typography.h1}>Production Pipeline</h1>
          <p className="text-brand-secondary text-sm mt-1">Manage active orders currently on the floor.</p>
        </div>
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Search active orders..."
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

          const { totalGarments, completedGarments, completionRatio } = getCompletionData(order);
          
          let visualIndex = 0; // Production
          if (order.statusIndex === 6) { // In Production
             visualIndex = 0 + completionRatio; // Fills toward Kitting
          } else if (order.statusIndex === 7) { // Kitting (Internally mapping statusIndex=7)
             visualIndex = 1 + completionRatio; // If still checking off, or just static at Kitting
             // Actually if it's physically in Kitting, we might just set it to 1
             visualIndex = 1;
             // Let's assume if status 7, it's 1.0 filling toward Shipped if there's Kitting logic, but let's keep it simple
          } else if (order.statusIndex > 7) {
             visualIndex = 2; // Shipped
          }

          const fillWidth = `${(visualIndex / (timelineSteps.length - 1)) * 100}%`;

          return (
            <div key={order.id} className="w-full relative px-2">
              <div 
                className={`bg-white rounded-[2rem] border border-brand-border/60 transition-all duration-300 relative group 
                ${isExpanded ? 'shadow-[0_8px_30px_rgb(0,0,0,0.06)] z-10' : 'hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:-translate-y-1 hover:z-10 z-0'}`}
              >
                <div 
                  onClick={() => setExpandedId(isExpanded ? null : order.id)}
                  className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 xl:gap-8 min-h-[80px] p-6 lg:pr-10 cursor-pointer"
                >
                  {/* Left: Logo & Title */}
                  <div className="flex items-center gap-6 w-[320px] shrink-0 relative">
                    <div className="w-20 h-20 shrink-0 flex items-center justify-center text-neutral-300">
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
                      <button 
                        onClick={(e) => { e.stopPropagation(); navigate(`/orders/${order.id}`); }}
                        className="flex items-center gap-1.5 text-[11px] font-bold text-gray-500 hover:text-brand-primary mt-1.5 uppercase tracking-widest transition-colors z-20 relative bg-neutral-100/80 hover:bg-brand-primary/10 px-2.5 py-1 rounded-md max-w-max border border-transparent hover:border-brand-primary/20"
                        title="Open Order Details"
                      >
                         Order #{order.portalId || order.id.substring(0,8)}
                         <ExternalLink size={12} className="opacity-80" />
                      </button>
                    </div>
                  </div>

                  {/* Right: Progress Tracker */}
                  <div className="flex-1 w-full pt-4 xl:pt-0">
                    <div className="w-full flex justify-between items-center mb-6 px-4">
                       <span className="text-brand-primary font-bold text-lg">{Math.round(completionRatio * 100)}% Complete</span>
                       <div className="flex items-center gap-4">
                         <button 
                           onClick={(e) => { e.stopPropagation(); setMetricsOrder(order); }}
                           className="text-[10px] font-bold uppercase tracking-widest text-brand-primary bg-brand-primary/5 hover:bg-brand-primary/10 px-3 py-1.5 rounded-lg flex items-center gap-2 transition-colors border border-brand-primary/10"
                         >
                           <Activity size={14} /> Team Metrics
                         </button>
                         <span className="text-brand-secondary text-sm font-semibold hidden md:inline">{completedGarments} of {totalGarments} Garments Processed</span>
                       </div>
                    </div>
                    <div className="relative w-full px-4">
                      <div className="absolute top-0 left-4 right-4 h-[12px] bg-neutral-200 rounded-full"></div>
                      <div className="absolute top-0 left-4 h-[12px] bg-brand-primary rounded-full transition-all duration-700 ease-in-out" style={{ width: `calc(${fillWidth} - 2rem)` }}></div>
                      
                      <div className="relative flex justify-between items-center z-10 px-0">
                        {timelineSteps.map((step, idx) => {
                          const isCompleted = idx <= Math.floor(visualIndex);
                          return (
                            <div key={step} className="flex flex-col items-center relative">
                              <div className={`w-[12px] h-[12px] rounded-full flex items-center justify-center transition-colors duration-300 ${isCompleted ? 'bg-black' : 'bg-[#f0f0f0] border-[2px] border-neutral-300'}`}></div>
                              <span className="absolute top-6 text-[11px] font-bold text-neutral-500 w-24 text-center tracking-wide">{step}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Expanded Items Section */}
                {order.items && order.items.length > 0 && (
                  <div className={`grid transition-all duration-500 ease-in-out px-6 lg:px-10 pb-6 origin-top ${isExpanded ? 'grid-rows-[1fr] opacity-100 border-t border-brand-border/40 pt-6' : 'grid-rows-[0fr] opacity-0 pointer-events-none'}`}>
                    <div className="overflow-hidden space-y-4">
                      {order.items.map((item: any) => (
                      <div key={item.id} className="flex flex-col gap-0 border-b border-brand-border/40 last:border-b-0 pb-6 mb-4">
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                         
                         {/* Left Side: Visual & Specs */}
                         <div className="flex flex-col gap-3 flex-1 min-w-0 pr-2">
                           <div className="flex items-center gap-4">
                             <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 border border-black/5 bg-gray-50 flex items-center justify-center">
                               <img src={item.image} alt={item.style} className="w-full h-full object-cover mix-blend-multiply p-1" />
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
                               const isPacked = isSizeFullyBoxed(order, item, size, qty);

                               let colorClassTop = 'bg-neutral-300 text-neutral-600 group-hover/sizebtn:bg-neutral-400';
                               let colorClassBottom = 'bg-white text-neutral-800';
                               let topContent: any = size;
                               let wrapperClass = 'hover:-translate-y-0.5 hover:shadow-sm';

                               if (isPacked) {
                                   colorClassTop = 'bg-blue-500 text-white';
                                   colorClassBottom = 'bg-blue-50 text-blue-700';
                                   topContent = <Box size={12} strokeWidth={3} className="my-auto mx-auto" />;
                                   wrapperClass = 'opacity-80 hover:opacity-100';
                               } else if (isCompleted) {
                                   colorClassTop = 'bg-green-500 text-white';
                                   colorClassBottom = 'bg-green-50 text-green-700';
                                   topContent = <Check size={12} strokeWidth={4} className="my-auto mx-auto" />;
                                   wrapperClass = 'opacity-80 hover:opacity-100';
                               } else if (inProgress) {
                                   if (inProgress.paused) {
                                       colorClassTop = 'bg-orange-500 text-white';
                                       colorClassBottom = 'bg-orange-50 text-orange-700';
                                       topContent = <Pause size={12} strokeWidth={3} className="my-auto mx-auto" />;
                                       wrapperClass = 'opacity-90 hover:opacity-100';
                                   } else {
                                       colorClassTop = 'bg-red-500 text-white';
                                       colorClassBottom = 'bg-red-50 text-red-700';
                                       topContent = <Clock size={12} strokeWidth={3} className="animate-pulse my-auto mx-auto" />;
                                       wrapperClass = 'opacity-90 hover:opacity-100';
                                   }
                               }

                               return (
                               <div 
                                 key={size} 
                                 className={`min-w-[44px] px-0.5 group/sizebtn text-center flex flex-col cursor-pointer transition-all relative ${wrapperClass}`}
                                 onClick={(e) => { e.stopPropagation(); handleSizeClick(order, item, size, qty); }}
                                 onContextMenu={(e) => { 
                                   e.preventDefault(); 
                                   e.stopPropagation(); 
                                   setContextMenu({ x: e.clientX, y: e.clientY, order, item, size, qty }); 
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
                      ))}
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

      {/* Team Metrics Modal */}
      {metricsOrder && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setMetricsOrder(null)}>
           <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl overflow-hidden border border-brand-border" onClick={e => e.stopPropagation()}>
             <div className="p-6 border-b border-brand-border flex justify-between items-center bg-brand-bg/50">
                <div className="flex items-center gap-3">
                   <div className="w-10 h-10 rounded-full bg-brand-primary/10 flex items-center justify-center text-brand-primary">
                     <Activity size={20} strokeWidth={2.5} />
                   </div>
                   <div>
                     <h3 className="font-serif text-xl text-brand-primary">Team Production Metrics</h3>
                     <p className="text-[11px] font-bold uppercase tracking-wider text-brand-secondary">{metricsOrder.title || 'Custom Order'}</p>
                   </div>
                </div>
                <button 
                  onClick={() => setMetricsOrder(null)}
                  className="p-2 hover:bg-neutral-200 rounded-full transition-colors text-brand-secondary"
                >
                  <X size={20} />
                </button>
             </div>
             
             <div className="p-6 overflow-y-auto">
               {(() => {
                 const statsByUser: Record<string, { totalTimeMins: number, garmentsCompleted: number, completionsCount: number }> = {};
                 const bestDisplayNames: Record<string, string> = {};
                 
                 let globalTotalGarmentsCompletedWithStats = 0;
                 let globalTotalTimeMins = 0;
                 let totalOrderGarments = 0;
                 let trueTotalGarmentsCompleted = 0; // The actual count regardless of attached stat metrics

                 (metricsOrder.items || []).forEach((item: any) => {
                    if (item.sizes) {
                        Object.values(item.sizes).forEach((q: any) => {
                            totalOrderGarments += (parseInt(q as string) || 0);
                        });
                    }

                    const completed = item.completedSizes || [];
                    completed.forEach((size: string) => {
                       const qty = parseInt(item.sizes?.[size]) || 0;
                       trueTotalGarmentsCompleted += qty;

                       const stat = item.sizeStats?.[size];
                       if (stat) {
                           let userName = stat.user?.split('@')[0] || stat.user;
                           
                           // Fallback to searching activity log for older completions that lacked sizeStats.user
                           if (!userName) {
                               const actMatch = (metricsOrder.activities || []).find((a: any) => 
                                   a.message?.startsWith('Completed') && a.message?.includes(`x ${size} for ${item.style}`)
                               );
                               userName = actMatch?.user?.split('@')[0] || actMatch?.user || 'Unknown';
                           }

                           const rawName = userName || 'Unknown';
                           const groupKey = rawName.toLowerCase().replace(/[^a-z]/g, '') || 'unknown';
                           
                           if (!bestDisplayNames[groupKey]) {
                              bestDisplayNames[groupKey] = rawName;
                           } else if (rawName.includes(' ') && !bestDisplayNames[groupKey].includes(' ')) {
                              bestDisplayNames[groupKey] = rawName;
                           } else if (rawName.length > bestDisplayNames[groupKey].length && rawName !== rawName.toLowerCase()) {
                              bestDisplayNames[groupKey] = rawName;
                           }

                           const durationMs = stat.durationMs || 0;
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

                 const users = Object.keys(statsByUser).sort((a,b) => statsByUser[b].garmentsCompleted - statsByUser[a].garmentsCompleted);

                 if (users.length === 0) {
                   return <p className="text-center text-sm text-brand-secondary py-8">No performance metrics recorded yet for this order. Complete an item to see predictions.</p>;
                 }

                 // Calculates remaining purely from the physical pipeline truth `completedSizes` 
                 const remainingGarments = Math.max(0, totalOrderGarments - trueTotalGarmentsCompleted);
                 const concurrentGlobalTotalTimeMins = globalTotalTimeMins / Math.max(1, users.length);
                 const globalAvgMinsPerGarment = globalTotalGarmentsCompletedWithStats > 0 ? (concurrentGlobalTotalTimeMins / globalTotalGarmentsCompletedWithStats) : 0;
                 const estimatedRemainingMins = remainingGarments * globalAvgMinsPerGarment;
                 const estimatedTotalMins = (trueTotalGarmentsCompleted * globalAvgMinsPerGarment) + estimatedRemainingMins;


                 return (
                   <div className="space-y-6">
                     {/* Predictive Metrics Banner */}
                     <div className="bg-gradient-to-br from-brand-primary/5 to-brand-primary/10 border border-brand-primary/20 rounded-xl p-5 shadow-sm text-brand-primary">
                        <div className="flex items-center justify-between mb-3 border-b border-brand-primary/10 pb-3">
                           <div className="flex items-center gap-2">
                             <Clock size={16} />
                             <h4 className="font-bold uppercase tracking-wider text-[11px]">AI Production Forecast</h4>
                           </div>
                           <div className="flex items-center">
                              {editingTargetId === metricsOrder.id ? (
                                 <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-brand-primary/80 bg-white/50 px-2 py-1 rounded-md border border-brand-primary/10">Expected Time / Garment:</span>
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
                                    <span>Expected Time / Garment: {metricsOrder.targetAvgMinsPerGarment ? `${metricsOrder.targetAvgMinsPerGarment}m` : 'Not Set'}</span>
                                    <button onClick={() => { setTargetInput(metricsOrder.targetAvgMinsPerGarment?.toString() || ''); setEditingTargetId(metricsOrder.id); }} className="hover:text-brand-primary text-brand-secondary underline decoration-brand-border underline-offset-2">Edit</button>
                                 </div>
                              )}
                           </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                           <div className="flex flex-col">
                              <span className="text-[10px] font-bold uppercase tracking-widest text-brand-primary/60 mb-1">Remaining Units</span>
                              <span className="text-xl font-black">{remainingGarments}</span>
                           </div>
                           <div className="flex flex-col relative">
                              <span className="text-[10px] font-bold uppercase tracking-widest text-brand-primary/60 mb-1">Global Avg / Garment</span>
                              <div className="flex items-end gap-2">
                                <span className="text-xl font-black">{globalAvgMinsPerGarment >= 1 ? globalAvgMinsPerGarment.toFixed(1) + 'm' : Math.round(globalAvgMinsPerGarment * 60) + 's'}</span>
                                {metricsOrder.targetAvgMinsPerGarment && (
                                   <span className={`text-[10px] font-bold mb-1 ${globalAvgMinsPerGarment <= metricsOrder.targetAvgMinsPerGarment ? 'text-green-600' : 'text-orange-500'}`}>
                                      {globalAvgMinsPerGarment <= metricsOrder.targetAvgMinsPerGarment ? 'On Track' : 'Behind'}
                                   </span>
                                )}
                              </div>
                           </div>
                           <div className="flex flex-col">
                              <span className="text-[10px] font-bold uppercase tracking-widest text-brand-primary/60 mb-1">Estimated Time Left</span>
                              <span className="text-xl font-black">{estimatedRemainingMins > 60 ? (estimatedRemainingMins / 60).toFixed(1) + 'h' : Math.round(estimatedRemainingMins) + 'm'}</span>
                           </div>
                           <div className="flex flex-col">
                              <span className="text-[10px] font-bold uppercase tracking-widest text-brand-primary/60 mb-1">Total Expected Time</span>
                              <span className="text-xl font-black">{estimatedTotalMins > 60 ? (estimatedTotalMins / 60).toFixed(1) + 'h' : Math.round(estimatedTotalMins) + 'm'}</span>
                           </div>
                        </div>
                     </div>

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
                                 <span className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary/70 mb-1">Total Garments</span>
                                 <span className="text-xl font-black text-brand-primary">{stat.garmentsCompleted}</span>
                              </div>
                              <div className="flex flex-col">
                                 <span className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary/70 mb-1">Avg Time / Garment</span>
                                 <span className="text-xl font-black text-blue-600">{avgTimePerGarment >= 1 ? avgTimePerGarment.toFixed(1) + 'm' : Math.round(avgTimePerGarment * 60) + 's'}</span>
                              </div>
                              <div className="flex flex-col">
                                 <span className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary/70 mb-1">Total Time</span>
                                 <span className="text-xl font-black text-brand-primary">{Math.round(stat.totalTimeMins)}m</span>
                              </div>
                              <div className="flex flex-col">
                                 <span className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary/70 mb-1">Overall Rate</span>
                                 <span className="text-xl font-black text-green-600">{Math.round(overallRatePerHour)}/hr</span>
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
    </div>
  );
}
