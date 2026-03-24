import { useState, useEffect } from 'react';
import { ChevronRight, Loader2, PackageOpen, Building2, X, Trash2, ChevronDown, Box, Printer, ExternalLink, Truck } from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';
import { useOrders } from '../../hooks/useOrders';
import { db } from '../../lib/firebase';
import QRCode from 'react-qr-code';
import { doc, getDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { getTrackingLink } from '../../lib/utils';

const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', 'OSFA'];

const sortSizes = (a: string, b: string) => {
  const iA = SIZE_ORDER.indexOf(a.toUpperCase());
  const iB = SIZE_ORDER.indexOf(b.toUpperCase());
  if (iA === -1 && iB === -1) return a.localeCompare(b);
  if (iA === -1) return 1;
  if (iB === -1) return -1;
  return iA - iB;
};



// Helper component for the little gray pills in the items breakdown
const DataPill = ({ label, value }: { label: string, value: string }) => (
  <div className="flex flex-col items-center justify-center bg-neutral-100 px-3 py-1.5 rounded-2xl min-w-[84px] max-w-[140px]">
    <span className="text-[10px] text-neutral-500 font-semibold mb-0.5 truncate w-full text-center">{label}:</span>
    <span className="text-xs text-neutral-800 font-semibold leading-none truncate w-full text-center">{value}</span>
  </div>
);

export function PortalOrders({ overrideCustomerId, hideHeader = false }: { overrideCustomerId?: string, hideHeader?: boolean }) {
  const { customerId } = useParams();
  const navigate = useNavigate();
  const currentCustomerId = overrideCustomerId || customerId || 'CUS-001';
  
  // If no customerId is in the URL, fallback to Wayne Enterprises 'CUS-001' to demo it!
  const { orders, loading } = useOrders(currentCustomerId);
  const [customer, setCustomer] = useState<any>(null);
  const [fetchingLogo, setFetchingLogo] = useState<boolean>(true);
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [expandedOrderShipments, setExpandedOrderShipments] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const fetchCustomer = async () => {
      try {
        const d = await getDoc(doc(db, 'customers', currentCustomerId));
        if (d.exists()) {
          setCustomer(d.data());
        }
      } catch (err) {
        console.error("Error fetching live customer:", err);
      } finally {
        setFetchingLogo(false);
      }
    };
    fetchCustomer();
  }, [currentCustomerId]);
  
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedImage, setExpandedImage] = useState<{src: string, alt: string} | null>(null);

  const [localOrders, setLocalOrders] = useState<any[]>([]);
  const [draggedOrderId, setDraggedOrderId] = useState<string | null>(null);
  const [dragOverOrderId, setDragOverOrderId] = useState<string | null>(null);

  useEffect(() => {
    if (orders) {
      const sorted = [...orders].sort((a, b) => {
        if (typeof a.orderIndex === 'number' && typeof b.orderIndex === 'number') {
          return a.orderIndex - b.orderIndex;
        }
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      });
      setLocalOrders(sorted);
    }
  }, [orders]);

  const handleDragStartOrder = (e: React.DragEvent, id: string) => {
    e.stopPropagation();
    setDraggedOrderId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOverOrder = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverOrderId !== id) setDragOverOrderId(id);
  };

  const handleDropOrder = async (e: React.DragEvent, dropId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverOrderId(null);
    
    if (!draggedOrderId || draggedOrderId === dropId) return;

    const currentOrders = [...localOrders];
    const draggedIndex = currentOrders.findIndex(o => o.id === draggedOrderId);
    const dropIndex = currentOrders.findIndex(o => o.id === dropId);
    
    if (draggedIndex === -1 || dropIndex === -1) return;

    const [draggedItem] = currentOrders.splice(draggedIndex, 1);
    currentOrders.splice(dropIndex, 0, draggedItem);

    setLocalOrders(currentOrders);
    setDraggedOrderId(null);

    try {
      const batch = writeBatch(db);
      currentOrders.forEach((o, index) => {
         batch.update(doc(db, 'orders', o.id), { orderIndex: index });
      });
      await batch.commit();
    } catch (err) {
      console.error('Error updating order order', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center text-gray-400 gap-3">
        <Loader2 className="animate-spin" size={32} />
        <p className="font-semibold uppercase tracking-widest text-xs">Loading Live Pipeline...</p>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="max-w-[800px] mx-auto mt-24 flex flex-col items-center justify-center text-center gap-6">
        <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center text-gray-300 border border-gray-100">
          <PackageOpen strokeWidth={1.5} size={40} />
        </div>
        <div>
          <h2 className="text-3xl font-serif text-gray-900 mb-2">No active orders yet.</h2>
          <p className="text-gray-500 font-medium max-w-sm mx-auto leading-relaxed">
            You don't currently have any orders in the pipeline. Once a new order is placed or quoted, you'll be able to track its progress here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={`max-w-[1600px] mx-auto flex flex-col gap-6 ${hideHeader ? 'mt-0' : 'mt-8'}`}>
      {localOrders.map((order: any) => {
        const isExpanded = expandedId === order.id;
        const isKitting = order.fulfillmentType === 'Kitting' || (!order.fulfillmentType && customer?.fulfillmentType === 'Kitting');
        const timelineSteps = isKitting 
          ? ['Request', 'Approved', 'Sourcing', 'Ordered', 'Production', 'Inventory', 'Live'] 
          : ['Request', 'Approved', 'Sourcing', 'Ordered', 'Production', 'Shipped', 'Received'];

        let visualIndex = order.statusIndex;
        if (order.statusIndex === 1) visualIndex = 0.33;
        else if (order.statusIndex === 2) visualIndex = 0.66;
        else if (order.statusIndex >= 3) visualIndex = order.statusIndex - 2;

        let totalGarments = 0;
        let completedGarments = 0;
        order.items?.forEach((item: any) => {
            if (item.sizes && Object.keys(item.sizes).length > 0) {
                Object.entries(item.sizes).forEach(([size, qty]: [string, any]) => {
                    const q = parseInt(qty) || 0;
                    totalGarments += q;
                    if (item.completedSizes?.includes(size)) {
                        completedGarments += q;
                    }
                });
            } else if (item.qty) {
                totalGarments += parseInt(item.qty) || 0;
                // Optional completion logic based on qty, but mostly we need totals
            }
        });

        if (order.statusIndex === 6) { // Currently in "In Production" which maps to visual node 4
           const prodRatio = totalGarments > 0 ? (completedGarments / totalGarments) : 0;
           
           const kitGarments = order.boxes?.reduce((acc: number, box: any) => acc + (box.items?.reduce((iAcc: number, bi: any) => iAcc + (bi.qty || 0), 0) || 0), 0) || 0;
           const kitRatio = totalGarments > 0 ? (kitGarments / totalGarments) : 0;

           // Blend them: 50% visual weight to Production, 50% to Kitting/Packing.
           const completionRatio = (prodRatio * 0.5) + (kitRatio * 0.5);

           // Cap the visual progression so it doesn't touch the next node (Shipped) until officially shipped.
           const scaledRatio = completionRatio > 0.95 ? 0.95 : completionRatio;
           visualIndex += scaledRatio;
        }

        // Calculate the percentage width for the progress bar fill
        const fillWidth = `${(visualIndex / (timelineSteps.length - 1)) * 100}%`;

        return (
          <div 
            key={order.id} 
            className={`flex flex-col xl:flex-row gap-6 w-full items-start transition-transform ${draggedOrderId === order.id ? 'opacity-50 scale-95' : ''} ${dragOverOrderId === order.id ? 'border-t-4 border-brand-primary rounded-xl pt-2' : ''}`}
            onDragOver={(e) => overrideCustomerId && handleDragOverOrder(e, order.id)}
            onDrop={(e) => overrideCustomerId && handleDropOrder(e, order.id)}
          >
            
            {/* Main Gray Capsule Wrapper */}
            <div className="flex-1 w-full min-w-0">
               
               <div 
                 onClick={() => {
                   if (overrideCustomerId) {
                     navigate(`/orders/${order.id}`);
                   } else {
                     setExpandedId(isExpanded ? null : order.id);
                   }
                 }}
                 className={`w-full relative group/card bg-white border border-brand-border rounded-[2.5rem] p-6 lg:pr-10 transition-all cursor-pointer ${overrideCustomerId ? 'hover:border-black/50 hover:shadow-md' : 'hover:border-black/20'} ${isExpanded ? 'pb-8 shadow-sm' : ''}`}
               >
                 
                 {/* Capsule Header Row */}
                 <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 xl:gap-8 min-h-[80px] relative w-full">
                   
                   {/* Left: Logo & Title */}
                   <div className="flex items-center gap-4 w-full xl:w-[320px] shrink-0 relative">
                     {/* Grip handle for sorting visible only for admins */}
                     {overrideCustomerId && (
                       <div 
                         className="flex-shrink-0 flex items-center justify-center cursor-grab active:cursor-grabbing text-neutral-300 hover:text-brand-primary transition-colors p-2 lg:-ml-4 xl:-ml-2" 
                         title="Drag to reorder"
                         draggable={true}
                         onClick={(e) => e.stopPropagation()}
                         onDragStart={(e) => handleDragStartOrder(e, order.id)}
                         onDragEnd={() => { setDraggedOrderId(null); setDragOverOrderId(null); }}
                       >
                         <div className="grid grid-cols-2 grid-rows-3 gap-[3px]">
                           {[...Array(6)].map((_, i) => (
                             <div key={i} className="w-[4px] h-[4px] bg-current rounded-full" />
                           ))}
                         </div>
                       </div>
                     )}
                  <div className="w-20 h-20 shrink-0 flex items-center justify-center text-neutral-300">
                    {fetchingLogo ? (
                      <Loader2 className="animate-spin text-neutral-300" size={24} />
                    ) : customer?.logo ? (
                      <img src={customer.logo} alt="Customer Logo" className="max-w-full max-h-full object-contain shrink-0 filter mix-blend-multiply opacity-90" />
                    ) : (
                      <Building2 size={32} strokeWidth={1.5} />
                    )}
                  </div>
                  <div>
                    <div 
                      className="flex items-center gap-3 cursor-pointer group z-20 relative"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (overrideCustomerId) {
                          navigate(`/orders/${order.id}`);
                        } else {
                          setExpandedId(isExpanded ? null : order.id);
                        }
                      }}
                    >
                      <h2 className="text-2xl font-serif text-gray-900 hover:text-brand-primary transition-colors line-clamp-1 break-all" title={order.title}>{order.title || 'Custom Order'}</h2>
                      {!overrideCustomerId && (
                        <span className="text-gray-400 group-hover:text-black transition-colors shrink-0">
                          <ChevronRight size={20} strokeWidth={2.5} className={`transition-transform duration-500 ease-out ${isExpanded ? 'rotate-90' : ''}`} />
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-medium text-gray-500 mt-1 uppercase tracking-wider flex items-center gap-2">
                       <span>Order #{order.portalId || order.id.substring(0,8)}</span>
                       {totalGarments > 0 && (
                         <>
                           <span className="text-gray-300 font-light">|</span>
                           <span>{totalGarments} {totalGarments === 1 ? 'Garment' : 'Garments'}</span>
                         </>
                       )}
                    </p>
                  </div>

                </div>

                {/* Right: Progress Tracker */}
                <div className="flex-1 min-w-0 w-full pt-4 xl:pt-0 pb-4 xl:pb-0">
                  <div className="relative w-full">
                    {/* The Track Base */}
                    <div className="absolute top-0 left-0 w-full h-[12px] bg-neutral-200 rounded-full"></div>
                    {/* The Fill */}
                    <div className="absolute top-0 left-0 h-[12px] bg-neutral-400 rounded-full transition-all duration-700 ease-in-out" style={{ width: fillWidth }}></div>
                    
                    {/* Steps */}
                    <div className="relative flex justify-between items-center z-10 px-0">
                      {timelineSteps.map((step, idx) => {
                        const isCompleted = idx <= Math.floor(visualIndex);
                        const isLastStep = idx === timelineSteps.length - 1;
                        return (
                          <div key={step} className="flex flex-col items-center relative">
                            {/* The Step Dot */}
                            <div className={`w-[12px] h-[12px] rounded-full flex items-center justify-center transition-colors duration-300 ${isCompleted ? 'bg-black' : 'bg-[#f0f0f0] border-[2px] border-neutral-300'}`}>
                            </div>
                            {/* Step Label below */}
                            <span className="absolute top-6 text-[11px] font-bold text-neutral-500 w-24 text-center tracking-wide">{step}</span>
                            
                            {/* Completion Date (Floating over the last item naturally if complete, or mock placing it over received for layout) */}
                            {isLastStep && (
                               <span className="absolute -top-7 text-[12px] font-bold text-neutral-900 w-24 text-center">{order.date}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Delete Icon on Hover (Admin Only) */}
                {overrideCustomerId && (
                  <div className="absolute top-1/2 -translate-y-1/2 right-[-8px] lg:right-[-24px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <button 
                      className="p-2 text-red-500/40 hover:text-red-500 hover:bg-red-50 rounded-full transition-all z-30 flex-shrink-0 bg-white"
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (window.confirm('Are you sure you want to permanently delete this order?')) {
                          try {
                            await deleteDoc(doc(db, 'orders', order.id));
                          } catch (err) {
                            console.error("Error deleting order:", err);
                          }
                        }
                      }}
                      title="Delete Order"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                )}

                {/* Action buttons moved outside */}
              </div>

            {/* Expanded Items Section */}
            {order.items && order.items.length > 0 && (
                <div className={`grid transition-all duration-500 ease-in-out ${isExpanded ? 'grid-rows-[1fr] opacity-100 mt-14' : 'grid-rows-[0fr] opacity-0 mt-0 pointer-events-none'}`}>
                  <div className="overflow-hidden space-y-4">
                    {order.items.map((item: any) => (
                    <div key={item.id} className="flex flex-col gap-0 border-b border-brand-border/40 last:border-b-0 pb-6 mb-4">
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                       {/* Left Side: Visual & Specs */}
                       <div className={`flex flex-col lg:flex-row lg:items-center gap-4 flex-1 min-w-0 ${hideHeader ? 'pr-2' : ''}`}>
                        {/* Product Visual */}
                        <div className="flex items-center gap-4 w-auto shrink-0 pr-4 min-w-[240px]">
                          <div 
                            className={`w-14 h-14 rounded-xl overflow-hidden shrink-0 border border-black/5 bg-gray-50 cursor-pointer hover:border-brand-primary transition-colors hover:shadow-md ${hideHeader ? 'flex items-center justify-center' : ''}`}
                            onClick={() => setExpandedImage({ src: item.image, alt: item.style })}
                            title="Click to view full screen"
                          >
                            <img src={item.image} alt={item.style} className="w-full h-full object-cover mix-blend-multiply p-1 pointer-events-none" />
                          </div>
                          
                          <div className="flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-5 w-full">
                             <div className="flex flex-col justify-center">
                               <h4 className="font-bold text-gray-900 text-[15px]">{item.style}</h4>
                               <p className="text-xs font-semibold text-gray-500 mt-0.5">
                                  {item.gender !== 'Unisex' ? `${item.gender} ` : ''} 
                                  {item.color ? `- ${item.color}` : ''}
                               </p>
                             </div>
                             
                             {(() => {
                               const itemBoxes = order.boxes?.filter((b: any) => b.items?.some((bi: any) => String(bi.id) === String(item.id))) || [];
                               if (itemBoxes.length === 0) return null;
                               return (
                                 <div className="flex items-center">
                                   <button 
                                     onClick={(e) => {
                                       e.stopPropagation();
                                       setExpandedItems(prev => ({ ...prev, [item.id]: !prev[item.id] }));
                                     }}
                                     className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest transition-all px-3 py-1.5 rounded-full border shrink-0 whitespace-nowrap ${expandedItems[item.id] ? 'bg-neutral-100 text-gray-900 shadow-inner border-neutral-300' : 'bg-white text-gray-500 hover:border-gray-400 hover:text-gray-900 shadow-sm hover:shadow-md hover:-translate-y-[1px] border-neutral-200'}`}
                                   >
                                     <ChevronDown size={12} strokeWidth={3} className={`transition-transform duration-300 ${expandedItems[item.id] ? 'rotate-180 text-gray-900' : ''}`} />
                                     <span>{itemBoxes.length} {itemBoxes.length === 1 ? 'Shipment' : 'Shipments'}</span>
                                   </button>
                                 </div>
                               );
                             })()}
                          </div>
                        </div>

                        {/* Specs */}
                        <div className="flex flex-wrap gap-2 flex-1">
                           {item.itemNum && <DataPill label="Item #" value={item.itemNum} />}
                           {item.color && <DataPill label="Garment Color" value={item.color} />}
                           {item.logos?.map((logo: string, i: number) => (
                             <DataPill key={i} label={`Logo ${i+1}`} value={logo} />
                           ))}
                        </div>
                      </div>

                      {/* Right Side: Sizing & Pricing */}
                      <div className="flex flex-wrap lg:flex-nowrap items-end lg:items-center gap-4 shrink-0">
                        {/* Sizing Grid Area */}
                        <div className="flex items-stretch gap-[2px] bg-neutral-200 p-[3px] rounded-xl font-sans">
                          {item.sizes && Object.entries(item.sizes).sort(([a], [b]) => sortSizes(a, b)).map(([size, qty]: [string, any]) => (
                            <div key={size} className="w-10 text-center flex flex-col">
                              <div className="bg-neutral-300 text-neutral-600 text-[10px] font-bold py-1.5 rounded-t-[8px] uppercase tracking-wide h-6 flex items-center justify-center">{size}</div>
                              <div className={`text-[12px] font-bold py-2 rounded-b-[8px] h-8 flex items-center justify-center bg-white ${qty > 0 ? 'text-neutral-800' : 'text-neutral-400'}`}>
                                {qty}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Pricing Summary */}
                        <div className="flex items-stretch gap-[2px] bg-neutral-200 p-[3px] rounded-xl font-sans shrink-0">
                          <div className="w-12 text-center flex flex-col">
                            <div className="bg-neutral-300 text-neutral-600 text-[10px] font-bold py-1.5 rounded-t-[8px] uppercase tracking-wide h-6 flex items-center justify-center">QTY</div>
                            <div className="bg-neutral-50 text-neutral-800 text-[12px] font-bold py-2 rounded-b-[8px] h-8 flex items-center justify-center">{item.qty}</div>
                          </div>
                          <div className="w-16 text-center flex flex-col">
                            <div className="bg-neutral-300 text-neutral-600 text-[10px] font-bold py-1.5 rounded-t-[8px] uppercase tracking-wide h-6 flex items-center justify-center">Price</div>
                            <div className="bg-neutral-50 text-neutral-800 text-[12px] font-bold py-2 rounded-b-[8px] h-8 flex items-center justify-center">{item.price}</div>
                          </div>
                          <div className="w-20 text-center flex flex-col">
                            <div className="bg-neutral-300 text-neutral-600 text-[10px] font-bold py-1.5 rounded-t-[8px] uppercase tracking-wide h-6 flex items-center justify-center">Total</div>
                            <div className="bg-neutral-50 text-neutral-800 text-[12px] font-bold py-2 rounded-b-[8px] h-8 flex items-center justify-center">{item.total}</div>
                          </div>
                        </div>
                      </div>
                      </div>
                      
                      {/* Expanded Boxes List - Spans Full Width */}
                      {expandedItems[item.id] && (() => {
                        const itemBoxes = order.boxes?.filter((b: any) => b.items?.some((bi: any) => String(bi.id) === String(item.id))) || [];
                        if (itemBoxes.length === 0) return null;
                        return (
                          <div className="w-full mt-6 pt-6 border-t border-brand-border/40 flex flex-col gap-3">
                            {itemBoxes.map((box: any) => {
                              const publicUrl = `${window.location.origin}/packing-slip/${order.id}/${box.id}`;
                              return (
                                <div key={box.id} className="bg-white rounded-xl border border-brand-border shadow-sm flex flex-col md:flex-row p-4 gap-4 md:items-center hover:border-brand-primary/20 transition-colors w-full relative z-20">
                                  
                                  <div className="flex items-center gap-4 min-w-[180px]">
                                    <div className="w-10 h-10 bg-neutral-100 rounded-lg flex items-center justify-center text-brand-primary shrink-0">
                                      <Box size={20} />
                                    </div>
                                    <div>
                                      <h3 className="font-bold text-sm text-brand-primary">{box.name}</h3>
                                      <p className="text-[10px] text-brand-secondary font-medium tracking-wide flex gap-1 items-center">
                                        <Printer size={10} /> {box.items?.reduce((acc: number, bi: any) => acc + (bi.qty || 0), 0) || 0} ITEMS TOTAL
                                      </p>
                                    </div>
                                  </div>
                                  
                                  <div className="flex-1 md:border-l border-brand-border md:pl-4 overflow-y-auto custom-scrollbar flex flex-col gap-1 md:pr-4">
                                      {box.items?.filter((bi: any) => String(bi.id) === String(item.id)).map((bi: any, i: number) => (
                                        <div key={i} className="flex flex-col xl:flex-row items-start xl:items-center py-2 gap-2 xl:gap-8 min-w-0 flex-1">
                                           <div className="flex items-center justify-between w-full xl:w-auto xl:min-w-[180px]">
                                              <span className="font-bold text-brand-primary text-sm truncate">{bi.style}</span>
                                              <span className="font-bold text-brand-secondary text-xs bg-neutral-100 px-2 py-1 rounded-md">x{bi.qty}</span>
                                           </div>
                                           {bi.sizes && Object.keys(bi.sizes).length > 0 && (
                                              <div className="flex gap-1.5 flex-wrap w-full xl:flex-1">
                                                 {Object.entries(bi.sizes).sort(([a],[b])=>sortSizes(a,b)).map(([s, q]: [string, any]) => (
                                                    <span key={s} className="text-xs font-bold text-brand-secondary bg-neutral-100 px-2.5 py-1.5 rounded-md border border-brand-border shadow-sm flex items-center justify-center min-w-[36px]">{s}: <span className="text-black ml-1">{q}</span></span>
                                                 ))}
                                              </div>
                                           )}
                                        </div>
                                      ))}
                                     <p className="text-[10px] italic text-brand-secondary mt-1 max-w-[200px] leading-tight">
                                       {box.items?.length > 1 ? `(+ ${box.items.length - 1} other items inside)` : ''}
                                     </p>
                                  </div>
                                  
                                  <div className="flex flex-col sm:flex-row items-center gap-3 shrink-0">
                                    <div className="flex flex-col gap-1.5 min-w-[100px]">
                                      <a href={publicUrl} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-brand-primary hover:text-black transition-colors tooltip whitespace-nowrap bg-neutral-50 hover:bg-neutral-100 px-3 py-1.5 rounded-full border border-neutral-200 w-full text-center" onClick={(e) => e.stopPropagation()}>
                                        <ExternalLink size={12} /> View Slip
                                      </a>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  ))}
                  
                  {/* Shipments Overview Accordion - Replaces Open Packing Slips */}
                  {order.boxes && order.boxes.length > 0 && (
                    <div className="mt-8 border-t border-brand-border pt-6 pb-2">
                       <div className="bg-white rounded-2xl border border-brand-border overflow-hidden shadow-sm transition-all hover:border-black/10 hover:shadow-md">
                         <div 
                           className="p-4 sm:p-5 flex items-center justify-between cursor-pointer hover:bg-neutral-50 transition-colors"
                           onClick={(e) => {
                             e.stopPropagation();
                             setExpandedOrderShipments(p => ({...p, [order.id]: !p[order.id]}));
                           }}
                         >
                           <div className="flex items-center gap-4">
                             <div className="w-12 h-12 bg-neutral-100 rounded-xl flex items-center justify-center text-brand-primary shrink-0 border border-brand-border/40">
                               <PackageOpen size={24} />
                             </div>
                             <div>
                               <h3 className="font-bold text-lg text-gray-900 mb-1 leading-none">Shipments Overview</h3>
                               <p className="text-[12px] text-gray-500 font-semibold tracking-wide">
                                 <strong className="text-gray-900">{order.boxes.length}</strong> {order.boxes.length === 1 ? 'Package Built' : 'Packages Built'} • <strong className="text-gray-900">{order.boxes.reduce((acc: number, box: any) => acc + (box.items?.reduce((iAcc: number, bi: any) => iAcc + (bi.qty || 0), 0) || 0), 0)}</strong> Garments Packed
                               </p>
                             </div>
                           </div>
                           <button className="text-gray-500 hover:text-black transition-colors flex items-center justify-center w-8 h-8 rounded-full bg-neutral-100/50 hover:bg-neutral-200">
                             <ChevronDown size={20} className={`transition-transform duration-300 ${expandedOrderShipments[order.id] ? 'rotate-180 text-black' : ''}`} />
                           </button>
                         </div>
                         
                         <div className={`transition-all duration-300 ease-in-out ${expandedOrderShipments[order.id] ? 'grid grid-rows-[1fr] opacity-100' : 'grid grid-rows-[0fr] opacity-0 pointer-events-none'}`}>
                           <div className="overflow-hidden">
                             <div className="border-t border-brand-border/50 bg-[#F9FAFB] p-4 sm:p-6 flex flex-col gap-3">
                               {(() => {
                                 const tempBoxes = [...order.boxes];
                                 tempBoxes.sort((a, b) => {
                                    if (!a.estArrival && !b.estArrival) return 0;
                                    if (!a.estArrival) return 1;
                                    if (!b.estArrival) return -1;
                                    return new Date(a.estArrival).getTime() - new Date(b.estArrival).getTime();
                                 });
                                 return tempBoxes;
                               })().map((box: any) => {
                                  const publicUrl = `${window.location.origin}/packing-slip/${order.id}/${box.id}`;
                                  const totalItems = box.items?.reduce((acc: number, item: any) => acc + (item.qty || 0), 0) || 0;
                                  return (
                                    <div key={box.id} className="bg-white rounded-2xl p-4 border border-brand-border flex flex-col sm:flex-row gap-5 items-center hover:border-black/20 hover:bg-white transition-colors hover:shadow-sm cursor-pointer" onClick={(e) => { e.stopPropagation(); window.open(publicUrl, '_blank'); }}>
                                      <div className="w-14 h-14 bg-white rounded-xl border border-brand-border p-1.5 shrink-0 shadow-sm flex items-center justify-center">
                                        <QRCode value={publicUrl} size={100} style={{ height: "auto", maxWidth: "100%", width: "100%" }} />
                                      </div>
                                      <div className="flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full">
                                        <div>
                                          <h4 className="font-bold text-gray-900 text-[15px]">{box.name}</h4>
                                          <div className="flex gap-2 items-center flex-wrap mt-1">
                                            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">{totalItems} Garments inside</p>
                                            {box.estArrival && (
                                              <span className="text-[10px] font-bold uppercase text-brand-primary bg-brand-primary/10 px-2 py-0.5 rounded-sm sm:ml-2 border border-brand-primary/20">
                                                Est. Arrival: {new Date(box.estArrival + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })}
                                              </span>
                                            )}
                                            {box.trackingCarrier && box.trackingCarrier !== 'Pickup' && box.trackingNumber && (
                                              <a href={getTrackingLink(box.trackingCarrier, box.trackingNumber) || '#'} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="text-[10px] font-bold uppercase text-brand-secondary bg-neutral-100 hover:bg-neutral-200 hover:text-black transition-colors px-2 py-0.5 rounded-sm flex items-center gap-1 border border-brand-border mt-0.5">
                                                <Truck size={10} /> Track {box.trackingCarrier}: {box.trackingNumber}
                                              </a>
                                            )}
                                            {box.trackingCarrier === 'Pickup' && (
                                              <span className="text-[10px] font-bold uppercase text-brand-secondary bg-neutral-100 px-2 py-0.5 rounded-sm flex items-center gap-1 border border-brand-border mt-0.5">
                                                <Truck size={10} /> Local Pickup / Delivery
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                        <div className="text-[10px] text-brand-primary font-bold uppercase tracking-widest bg-white shadow-sm border border-brand-border px-4 py-2.5 rounded-full inline-block shrink-0 mt-2 sm:mt-0 hover:bg-neutral-50 hover:text-black hover:border-black transition-colors flex flex-row items-center gap-2">
                                           View Slip <ExternalLink size={12} strokeWidth={2.5} />
                                        </div>
                                      </div>
                                    </div>
                                  );
                               })}
                             </div>
                           </div>
                         </div>
                       </div>
                    </div>
                  )}
                  </div>
                </div>
              )}
            </div>

             </div>
             
             {/* Right: Action Buttons (Moved outside card) */}
             <div className="flex xl:flex-col justify-center gap-3 w-full xl:w-[130px] shrink-0 xl:self-start mt-6 xl:mt-0 relative z-20 xl:h-[128px]">
               {order.trackingCarrier && order.trackingNumber ? (
                 <button 
                   onClick={(e) => {
                     e.stopPropagation();
                     window.open(getTrackingLink(order.trackingCarrier, order.trackingNumber) || '#', '_blank');
                   }}
                   className="flex-1 xl:flex-none bg-white border border-brand-border hover:border-black hover:bg-black hover:text-white text-[12px] font-bold text-gray-800 rounded-full py-3 xl:py-4 transition-all tracking-wide text-center"
                 >
                   Track {order.trackingCarrier}
                 </button>
               ) : (
                 <button 
                   className="flex-1 xl:flex-none bg-white border border-brand-border/50 text-[12px] font-bold text-gray-400 rounded-full py-3 xl:py-4 transition-all tracking-wide cursor-default text-center"
                   onClick={(e) => e.stopPropagation()}
                >
                  {order.trackingCarrier === 'Pickup' || (!order.trackingCarrier && order.statusIndex >= 4) ? 'No Tracking' : 'Processing'}
                </button>
              )}
              <button 
                className="flex-1 xl:flex-none bg-white border border-brand-border hover:border-black hover:bg-black hover:text-white text-[12px] font-bold text-gray-800 rounded-full py-3 xl:py-4 transition-all tracking-wide text-center"
                onClick={(e) => {
                  e.stopPropagation();
                  if (overrideCustomerId) navigate(`/orders/${order.id}`);
                  else window.open(`/order-summary/${order.id}`, '_blank');
                }}
              >
                Order Info
              </button>
             </div>
           </div>
        );
      })}
    </div>

      {/* Image Overlay */}
      {expandedImage && (
        <div 
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/20 backdrop-blur-sm p-6" 
          onClick={() => setExpandedImage(null)}
        >
           <button 
             className="absolute top-6 right-6 text-white/50 hover:text-white transition-colors p-2 bg-black/50 rounded-full" 
             onClick={() => setExpandedImage(null)}
           >
             <X size={24} />
           </button>
           <div 
             className="relative w-full max-w-4xl aspect-video rounded-3xl overflow-hidden cursor-crosshair bg-white"
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
               className="w-full h-full object-contain mix-blend-multiply transition-transform duration-200 ease-out hover:scale-[2]" 
             />
           </div>
        </div>
      )}
    </>
  );
}
