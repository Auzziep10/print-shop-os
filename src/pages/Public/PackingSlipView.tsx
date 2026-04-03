import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { db } from '../../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Loader2, PackageSearch, PackageOpen, CheckCircle2 } from 'lucide-react';

const sortSizes = (a: string, b: string) => {
    const orderMap: Record<string, number> = { 'xxs':1, 'xs':2, 's':3, 'm':4, 'l':5, 'xl':6, 'xxl':7, '2xl':7, '3xl':8, '4xl':9, '5xl':10, 'osfa':11, 'os':12 };
    const aKey = a.split(' ')[0].toLowerCase();
    const bKey = b.split(' ')[0].toLowerCase();
    const aVal = orderMap[aKey] || 99;
    const bVal = orderMap[bKey] || 99;
    if (aVal !== bVal) return aVal - bVal;
    return a.localeCompare(b);
};

export function PackingSlipView() {
  const { orderId, boxId, itemId } = useParams();
  const [order, setOrder] = useState<any>(null);
  const [boxes, setBoxes] = useState<any[]>([]);
  const [customer, setCustomer] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!orderId) return;
      try {
        const orderDoc = await getDoc(doc(db, 'orders', orderId));
        if (orderDoc.exists()) {
          const orderData = orderDoc.data();
          setOrder({ id: orderDoc.id, ...orderData });
          
          if (orderData.boxes) {
            if (boxId) {
              const foundBox = orderData.boxes.find((b: any) => b.id === boxId);
              if (foundBox) setBoxes([foundBox]);
            } else if (itemId) {
              const foundBoxes = orderData.boxes.filter((b: any) => b.items?.some((bi: any) => String(bi.id) === String(itemId)));
              setBoxes(foundBoxes);
            }
          }

          if (orderData.customerId) {
             const custDoc = await getDoc(doc(db, 'customers', orderData.customerId));
             if (custDoc.exists()) {
               setCustomer(custDoc.data());
             } else {
               setCustomer({ company: 'Unknown Customer' });
             }
          }
        }
      } catch (err) {
        console.error("Error fetching order:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [orderId, boxId, itemId]);

  if (loading) {
     return (
       <div className="min-h-screen bg-[#FDFCF9] flex flex-col items-center justify-center gap-4 text-neutral-400">
         <Loader2 className="animate-spin" size={32} />
         <p className="font-semibold uppercase tracking-widest text-xs">Retrieving Packing Slip...</p>
       </div>
     );
  }

  if (!order || boxes.length === 0) {
     return (
       <div className="min-h-screen bg-[#FDFCF9] flex flex-col items-center justify-center gap-4 text-neutral-500">
         <PackageSearch size={48} className="opacity-50" />
         <h2 className="text-2xl font-serif">Packing Slips Not Found</h2>
         <p className="text-sm">The boxes you are looking for do not exist or were removed.</p>
       </div>
     );
  }

  const cust = customer || { company: 'Unknown Customer' };

  return (
    <div className="bg-[#FDFCF9] print:bg-white font-sans text-neutral-900 overflow-x-hidden min-h-screen pb-12">
       {boxes.map((box, idx) => (
         <div key={box.id} className={`py-6 md:py-12 px-4 print:p-0 ${idx < boxes.length - 1 ? 'print:break-after-page mb-8 border-b-2 border-dashed border-neutral-300 print:border-none print:mb-0' : ''}`}>
           <div className="max-w-3xl mx-auto">
             {/* Header */}
             <div className="flex flex-col items-center text-center mb-6 md:mb-10 print:mb-3 gap-2 md:gap-4 print:gap-1">
               {cust?.logo && (
                  <img src={cust.logo} alt="Customer Logo" className="h-20 md:h-24 print:h-12 object-contain mix-blend-multiply mb-1 md:mb-2 print:mb-0 opacity-90" />
               )}
               <h1 className="text-3xl md:text-[2.5rem] print:text-xl font-serif text-neutral-900 leading-tight text-center">{cust?.company || cust?.companyName || 'Packing Slip'}</h1>
               <p className="text-xs md:text-sm font-semibold text-neutral-500 uppercase tracking-widest bg-white print:bg-transparent px-4 py-2 md:px-5 md:py-2.5 print:py-0 print:border-none rounded-full border border-neutral-200 shadow-sm print:shadow-none flex items-center gap-2">
                 <PackageOpen size={16} className="print:w-3 print:h-3" />
                 {box.name}
               </p>
             </div>

             {/* Packing Details Card */}
             <div className="bg-white rounded-[2rem] print:rounded-none p-6 md:p-12 print:p-0 shadow-[0_8px_30px_rgb(0,0,0,0.04)] print:shadow-none border border-neutral-100 print:border-none flex flex-col gap-6 md:gap-10 print:gap-3 relative overflow-hidden">
               
               {/* Subtle decoration */}
               <div className="absolute -top-10 -right-10 p-8 opacity-[0.03] pointer-events-none print:hidden">
                 <PackageOpen size={300} strokeWidth={1} />
               </div>

               <div className="grid grid-cols-2 gap-4 md:gap-6 print:gap-2 pb-8 md:pb-10 print:pb-2 border-b border-neutral-100 print:border-black/20 relative z-10">
                  <div className="bg-neutral-50/50 print:bg-transparent p-4 print:p-2 rounded-2xl border border-neutral-100/50 print:border-none print:flex print:items-center print:gap-2">
                    <p className="text-[10px] print:text-[8px] font-bold text-neutral-400 uppercase tracking-widest mb-1.5 print:mb-0">Order Title <span className="hidden print:inline">:</span></p>
                    <p className="font-semibold text-neutral-800 text-sm print:text-[10px] line-clamp-2" title={order.title}>{order.title}</p>
                  </div>
                  <div className="bg-neutral-50/50 print:bg-transparent p-4 print:p-2 rounded-2xl border border-neutral-100/50 print:border-none print:flex print:items-center print:gap-2">
                    <p className="text-[10px] print:text-[8px] font-bold text-neutral-400 uppercase tracking-widest mb-1.5 print:mb-0">Order ID <span className="hidden print:inline">:</span></p>
                    <p className="font-semibold text-neutral-800 text-sm print:text-[10px]">{order.portalId || order.id}</p>
                  </div>
               </div>

               {/* Items Header */}
               <div className="relative z-10 flex flex-col gap-6 print:gap-2">
                  <div className="flex items-center gap-3 print:gap-2 mb-2 print:mb-0">
                    <CheckCircle2 size={24} className="text-black print:w-4 print:h-4" />
                    <h2 className="text-2xl print:text-sm font-serif">Items In This Box</h2>
                  </div>

                  {/* Items List */}
                  <div className="flex flex-col gap-4 print:gap-0 print:divide-y print:divide-black/10 print:border-b print:border-black/10">
                     {box.items?.length > 0 ? box.items.map((packedItem: any, i: number) => {
                       const fullItem = order.items?.find((i: any) => String(i.id) === String(packedItem.id)) || packedItem;
                       return (
                       <div key={i} className="bg-white print:bg-transparent shadow-[0_2px_10px_rgb(0,0,0,0.02)] print:shadow-none border border-neutral-100 hover:border-black/10 print:border-none transition-colors rounded-2xl print:rounded-none p-4 sm:p-5 print:p-2 print:px-0 flex gap-3 sm:gap-5 print:gap-2 items-center">
                         {fullItem.image ? (
                            <div className="w-16 h-16 sm:w-20 sm:h-20 print:w-8 print:h-8 shrink-0 flex items-center justify-center">
                                <img src={fullItem.image} alt={fullItem.style} className="w-full h-full object-contain mix-blend-multiply" />
                            </div>
                         ) : (
                            <div className="w-16 h-16 sm:w-20 sm:h-20 print:w-8 print:h-8 shrink-0 flex items-center justify-center text-neutral-300">
                               <PackageOpen size={28} className="print:w-4 print:h-4" />
                            </div>
                         )}
                         <div className="flex-1 min-w-0">
                           <p className="font-bold text-neutral-900 text-base print:text-[11px] sm:pr-4 leading-tight mb-2 sm:mb-0 print:mb-0">{fullItem.style || packedItem.style || 'Custom Garment'}</p>
                           <div className="text-[10px] sm:text-xs print:text-[8px] font-semibold text-neutral-500 mt-1 sm:mt-1.5 print:mt-1 flex flex-wrap gap-x-2 gap-y-1 print:gap-x-1.5 mb-3 print:mb-1">
                             {fullItem.gender && fullItem.gender !== 'Unisex' && <span className="bg-neutral-100 print:bg-transparent print:p-0 px-2 py-1 rounded-md">{fullItem.gender}</span>}
                             {fullItem.color && <span className="bg-neutral-100 print:bg-transparent print:p-0 px-2 py-1 rounded-md">{fullItem.color}</span>}
                             {fullItem.itemNum && <span className="bg-neutral-100 print:bg-transparent print:p-0 px-2 py-1 rounded-md">ID: {fullItem.itemNum}</span>}
                           </div>

                           {/* Packed Sizes Spread */}
                           {packedItem.sizes && Object.keys(packedItem.sizes).length > 0 && (
                             <div className="flex flex-wrap gap-2 print:gap-1 mt-4 pt-4 print:mt-1 print:pt-1 border-t border-neutral-100 print:border-black/10">
                                {Object.keys(packedItem.sizes).sort(sortSizes).map((sKey) => {
                                   const sQty = packedItem.sizes[sKey];
                                   if (!sQty) return null;
                                   return (
                                     <div key={sKey} className="bg-white print:bg-transparent border border-neutral-200 print:border-black/20 rounded-lg print:rounded overflow-hidden flex flex-col w-12 print:w-auto print:min-w-[1.25rem] shrink-0 shadow-[0_2px_4px_rgb(0,0,0,0.02)] print:shadow-none">
                                       <span className="bg-neutral-50 print:bg-transparent text-[9px] print:text-[7px] text-center font-bold text-neutral-400 print:text-neutral-500 py-1.5 print:py-0 print:px-1 uppercase tracking-wider block border-b border-neutral-200 print:border-black/20 leading-none">
                                          {sKey}
                                       </span>
                                       <span className="text-[13px] print:text-[9px] text-center font-black text-neutral-900 py-2 print:py-1 block leading-none">
                                          {sQty}
                                       </span>
                                     </div>
                                   );
                                })}
                             </div>
                           )}
                         </div>
                         <div className="flex flex-col items-center justify-center shrink-0 pl-3 sm:pl-4 print:pl-2 border-l border-neutral-100 print:border-none">
                            <p className="text-[10px] print:text-[7px] font-bold text-neutral-400 print:text-neutral-500 uppercase tracking-widest mb-1.5 print:mb-0 text-center">Qty</p>
                            <p className="font-black text-xl sm:text-2xl print:text-sm text-neutral-900 bg-neutral-50 print:bg-transparent border border-neutral-200 print:border-none rounded-xl px-3 sm:px-4 py-2 print:p-0 min-w-[3rem] print:min-w-0 text-center inline-block">{packedItem.qty}</p>
                         </div>
                       </div>
                     )}) : (
                       <div className="text-center py-8 print:py-2 bg-neutral-50 print:bg-transparent rounded-2xl print:rounded-none border border-neutral-100 print:border-none">
                           <p className="text-sm print:text-xs font-semibold text-neutral-500 print:text-neutral-400">No specific items listed.</p>
                       </div>
                     )}
                  </div>
               </div>
              
              <div className="mt-8 pt-8 text-center border-t border-neutral-100 print:hidden relative z-10 flex flex-col items-center gap-4">
                 <a href="/" className="inline-flex items-center justify-center bg-black hover:bg-neutral-800 transition-colors text-white text-xs font-bold uppercase tracking-widest px-10 py-4 rounded-full shadow-lg cursor-pointer w-full sm:w-auto">
                     Login to Portal
                 </a>
                 <img src="/logo.png" alt="WOVN" className="h-6 object-contain opacity-40 mt-2" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
