import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { db } from '../../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Loader2, PackageSearch, PackageOpen, CheckCircle2 } from 'lucide-react';
import { MOCK_CUSTOMERS_DB } from '../../lib/mockData';

export function PackingSlipView() {
  const { orderId, boxId } = useParams();
  const [order, setOrder] = useState<any>(null);
  const [box, setBox] = useState<any>(null);
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
            const foundBox = orderData.boxes.find((b: any) => b.id === boxId);
            setBox(foundBox || null);
          }

          if (orderData.customerId) {
             const custDoc = await getDoc(doc(db, 'customers', orderData.customerId));
             if (custDoc.exists()) {
               setCustomer(custDoc.data());
             } else {
               setCustomer(MOCK_CUSTOMERS_DB[orderData.customerId] || MOCK_CUSTOMERS_DB['CUS-001']);
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
  }, [orderId, boxId]);

  if (loading) {
     return (
       <div className="min-h-screen bg-[#FDFCF9] flex flex-col items-center justify-center gap-4 text-neutral-400">
         <Loader2 className="animate-spin" size={32} />
         <p className="font-semibold uppercase tracking-widest text-xs">Retrieving Packing Slip...</p>
       </div>
     );
  }

  if (!order || !box) {
     return (
       <div className="min-h-screen bg-[#FDFCF9] flex flex-col items-center justify-center gap-4 text-neutral-500">
         <PackageSearch size={48} className="opacity-50" />
         <h2 className="text-2xl font-serif">Packing Slip Not Found</h2>
         <p className="text-sm">The box you are looking for does not exist or was removed.</p>
       </div>
     );
  }

  const cust = customer || MOCK_CUSTOMERS_DB['CUS-001'];

  return (
    <div className="min-h-screen bg-[#FDFCF9] py-12 px-4 font-sans text-neutral-900 overflow-x-hidden">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex flex-col items-center text-center mb-10 gap-4">
          {cust?.logo && (
             <img src={cust.logo} alt="Customer Logo" className="h-20 object-contain mix-blend-multiply mb-2 opacity-90" />
          )}
          <h1 className="text-[2.5rem] font-serif text-neutral-900 leading-tight">Packing Slip</h1>
          <p className="text-sm font-semibold text-neutral-500 uppercase tracking-widest bg-white px-5 py-2.5 rounded-full border border-neutral-200 shadow-sm flex items-center gap-2">
            <PackageOpen size={16} />
            {box.name}
          </p>
        </div>

        {/* Packing Details Card */}
        <div className="bg-white rounded-[2rem] p-8 md:p-12 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-neutral-100 flex flex-col gap-10 relative overflow-hidden">
          
          {/* Subtle decoration */}
          <div className="absolute -top-10 -right-10 p-8 opacity-[0.03] pointer-events-none">
            <PackageOpen size={300} strokeWidth={1} />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pb-10 border-b border-neutral-100 relative z-10">
             <div className="bg-neutral-50/50 p-4 rounded-2xl border border-neutral-100/50">
               <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-1.5">Company</p>
               <p className="font-semibold text-neutral-800 text-sm">{cust?.company || 'Unknown'}</p>
             </div>
             <div className="bg-neutral-50/50 p-4 rounded-2xl border border-neutral-100/50">
               <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-1.5">Order Title</p>
               <p className="font-semibold text-neutral-800 text-sm line-clamp-2" title={order.title}>{order.title}</p>
             </div>
             <div className="bg-neutral-50/50 p-4 rounded-2xl border border-neutral-100/50">
               <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-1.5">Order ID</p>
               <p className="font-semibold text-neutral-800 text-sm">{order.portalId || order.id}</p>
             </div>
             <div className="bg-neutral-50/50 p-4 rounded-2xl border border-neutral-100/50">
               <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-1.5">Date Packaged</p>
               <p className="font-semibold text-neutral-800 text-sm">
                 {box.createdAt ? new Date(box.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'N/A'}
               </p>
             </div>
          </div>

          {/* Items Header */}
          <div className="relative z-10 flex flex-col gap-6">
             <div className="flex items-center gap-3 mb-2">
               <CheckCircle2 size={24} className="text-black" />
               <h2 className="text-2xl font-serif">Items In This Box</h2>
             </div>

             {/* Items List */}
             <div className="flex flex-col gap-4">
                {order.items?.length > 0 ? order.items.map((item: any, idx: number) => (
                  <div key={idx} className="bg-white shadow-[0_2px_10px_rgb(0,0,0,0.02)] border border-neutral-100 hover:border-black/10 transition-colors rounded-2xl p-4 sm:p-5 flex gap-5 items-center">
                    {item.image ? (
                       <div className="w-20 h-20 shrink-0 rounded-xl bg-neutral-50 border border-neutral-100 flex items-center justify-center p-2">
                           <img src={item.image} alt={item.style} className="w-full h-full object-contain mix-blend-multiply" />
                       </div>
                    ) : (
                       <div className="w-20 h-20 shrink-0 rounded-xl bg-neutral-50 border border-neutral-100 flex items-center justify-center text-neutral-300">
                          <PackageOpen size={28} />
                       </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-neutral-900 text-lg sm:text-base pr-4 line-clamp-1">{item.style || 'Custom Garment'}</p>
                      <div className="text-xs font-semibold text-neutral-500 mt-1.5 flex flex-wrap gap-x-2 gap-y-1">
                        <span className="bg-neutral-100 px-2 py-1 rounded-md">{item.gender || 'Unisex'}</span>
                        {item.color && <span className="bg-neutral-100 px-2 py-1 rounded-md">{item.color}</span>}
                        {item.itemNum && <span className="bg-neutral-100 px-2 py-1 rounded-md">ID: {item.itemNum}</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0 pl-4 border-l border-neutral-100">
                       <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-1.5">Qty</p>
                       <p className="font-black text-2xl text-neutral-900 bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2 min-w-[3rem] text-center inline-block">{item.qty}</p>
                    </div>
                  </div>
                )) : (
                  <div className="text-center py-8 bg-neutral-50 rounded-2xl border border-neutral-100">
                      <p className="text-sm font-semibold text-neutral-500">No specific items listed.</p>
                  </div>
                )}
             </div>
          </div>
          
          <div className="mt-8 pt-8 text-center border-t border-neutral-100 relative z-10 flex flex-col items-center gap-4">
             <a href="/" className="inline-flex items-center justify-center bg-black hover:bg-neutral-800 transition-colors text-white text-xs font-bold uppercase tracking-widest px-10 py-4 rounded-full shadow-lg cursor-pointer w-full sm:w-auto">
                 Login to Portal
             </a>
             <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
               Thank you from {cust?.company || 'us'}!
             </p>
          </div>
        </div>
      </div>
    </div>
  );
}
