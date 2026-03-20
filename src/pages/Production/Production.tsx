import { useState, useEffect } from 'react';
import { ChevronRight, Loader2, PackageOpen, Building2, Search } from 'lucide-react';
import { useOrders } from '../../hooks/useOrders';
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
  const { orders, loading } = useOrders();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [customerLogos, setCustomerLogos] = useState<Record<string, string>>({});

  const [searchQuery, setSearchQuery] = useState('');

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

  const handleToggleSizeComplete = async (order: any, item: any, size: string) => {
    const updatedOrderItems = [...(order.items || [])];
    const itemIndex = updatedOrderItems.findIndex((i: any) => i.id === item.id);
    if (itemIndex === -1) return;

    const currentItem = updatedOrderItems[itemIndex];
    let completedSizes = currentItem.completedSizes || [];

    if (completedSizes.includes(size)) {
      completedSizes = completedSizes.filter((s: string) => s !== size);
    } else {
      completedSizes.push(size);
    }

    updatedOrderItems[itemIndex] = { ...currentItem, completedSizes };

    try {
      await updateDoc(doc(db, 'orders', order.id), { items: updatedOrderItems });
    } catch (err) {
      console.error("Error toggling completion", err);
    }
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
                className={`bg-white rounded-[2rem] border border-brand-border/60 transition-all duration-300 relative group z-10 
                ${isExpanded ? 'shadow-[0_8px_30px_rgb(0,0,0,0.06)] scale-[1.01]' : 'hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:-translate-y-1'}`}
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
                      <p className="text-xs font-medium text-gray-500 mt-1 uppercase tracking-wider">Order #{order.portalId || order.id.substring(0,8)}</p>
                    </div>
                  </div>

                  {/* Right: Progress Tracker */}
                  <div className="flex-1 w-full pt-4 xl:pt-0">
                    <div className="w-full flex justify-between items-center mb-6 px-4">
                       <span className="text-brand-primary font-bold text-lg">{Math.round(completionRatio * 100)}% Complete</span>
                       <span className="text-brand-secondary text-sm font-semibold">{completedGarments} of {totalGarments} Garments Processed</span>
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
                               
                               return (
                               <div 
                                 key={size} 
                                 onClick={(e) => { e.stopPropagation(); handleToggleSizeComplete(order, item, size); }}
                                 className={`min-w-[44px] px-0.5 group text-center flex flex-col cursor-pointer transition-all relative ${isCompleted ? 'opacity-60 hover:opacity-100' : 'hover:-translate-y-0.5 hover:shadow-sm'}`}
                               >
                                 <div className={`text-[10px] font-bold py-1.5 px-2 rounded-t-[8px] uppercase tracking-wide h-6 flex items-center justify-center transition-colors relative z-0 ${isCompleted ? 'bg-green-500 text-white' : 'bg-neutral-300 text-neutral-600 group-hover:bg-neutral-400'}`}>
                                    {size}
                                 </div>
                                 <div className={`text-[12px] font-bold py-2 px-2 rounded-b-[8px] h-8 flex items-center justify-center transition-colors relative z-0 ${isCompleted ? 'bg-green-50 text-green-700' : 'bg-white text-neutral-800'}`}>
                                   {qty}
                                 </div>
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
    </div>
  );
}
