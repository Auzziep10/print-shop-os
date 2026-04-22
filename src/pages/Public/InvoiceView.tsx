import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { db } from '../../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';

export function InvoiceView() {
  const { orderId } = useParams();
  const [order, setOrder] = useState<any>(null);
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
          
          if (orderData.customerId) {
             const custDoc = await getDoc(doc(db, 'customers', orderData.customerId));
             if (custDoc.exists()) {
               setCustomer(custDoc.data());
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
  }, [orderId]);

  if (loading) {
     return (
       <div className="min-h-screen bg-[#FDFCF9] flex flex-col items-center justify-center gap-4 text-neutral-400">
         <Loader2 className="animate-spin" size={32} />
         <p className="font-semibold uppercase tracking-widest text-xs">Retrieving Invoice...</p>
       </div>
     );
  }

  if (!order) {
     return (
       <div className="min-h-screen bg-[#FDFCF9] flex flex-col items-center justify-center gap-4 text-neutral-500">
         <h2 className="text-2xl font-serif">Invoice Not Found</h2>
       </div>
     );
  }

  const cust = customer || { company: 'Unknown Customer', name: 'Unknown' };

  // Calculate totals
  let subtotal = 0;
  order.items?.forEach((item: any) => {
    const priceStr = String(item.price || '0').replace(/[^0-9.]/g, '');
    const price = parseFloat(priceStr) || 0;
    
    let qty = 0;
    if (item.itemType === 'service' || !item.sizes || Object.keys(item.sizes).length === 0) {
      qty = parseInt(item.qty || 1);
    } else {
      qty = Object.values(item.sizes || {}).reduce((a: any, b: any) => a + (parseInt(b) || 0), 0) as number;
    }
    
    subtotal += price * qty;
  });

  const formattedTotal = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(subtotal);
  const issueDate = order.date ? new Date(order.date).toLocaleDateString('en-US', { year: '2-digit', month: '2-digit', day: '2-digit' }).replace(/\//g, '.') : new Date().toLocaleDateString('en-US', { year: '2-digit', month: '2-digit', day: '2-digit' }).replace(/\//g, '.');

  return (
    <div className="min-h-screen bg-[#f1efe9] flex justify-center py-10 font-sans text-neutral-900 w-full overflow-x-auto">
      <div className="w-full max-w-[1000px] flex shadow-2xl rounded-sm overflow-hidden bg-white min-h-[1000px] mx-4 relative min-w-[800px]">
        {/* Left Sidebar */}
        <div className="w-[120px] bg-[#f5f3ef] border-r border-neutral-200 flex flex-col justify-between py-10 items-center shrink-0">
          <div className="flex items-center" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
            <span className="text-[10px] font-bold tracking-[0.2em] text-neutral-500 mb-8 whitespace-nowrap">ISSUED {issueDate}</span>
            <span className="text-[10px] font-bold tracking-[0.2em] text-neutral-800 whitespace-nowrap">VCG • ADHOC ORDERS</span>
          </div>
          
          <div className="flex flex-col items-center justify-end pb-2">
            <img src="/wovn-production-logo.png" alt="WOVN Logo" className="w-20 object-contain opacity-90" />
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 p-12 md:p-16 flex flex-col relative">
           {/* Top Header */}
           <div className="flex justify-between items-center mb-8">
              <span className="text-neutral-400 italic text-lg font-serif">For your Consideration</span>
              <span className="text-5xl tracking-tight text-neutral-900" style={{ fontFamily: 'Times New Roman, Times, serif' }}>INVOICE</span>
           </div>

           {/* Banner */}
           <div className="w-full bg-[#f5f3ef] py-3 px-6 mb-10 flex justify-between items-center border border-neutral-200">
             <span className="text-[10px] font-bold tracking-[0.2em] text-neutral-800 uppercase">{cust.company} • {order.title}</span>
           </div>

           <div className="flex gap-12 flex-1">
             {/* Left Column Data */}
             <div className="w-1/3 flex flex-col gap-8">
                <div className="flex flex-col gap-1 text-[11px] font-bold tracking-widest text-neutral-800 uppercase leading-relaxed">
                   <p className="text-neutral-500">TO:</p>
                   <p>{order.shippingAddress?.name || cust.name || 'CLIENT'}</p>
                   <p className="lowercase normal-case text-neutral-500 font-medium tracking-normal">{cust.email || 'email@example.com'}</p>
                   {order.shippingAddress && order.shippingAddress.street1 && (
                     <>
                       <p>{order.shippingAddress.street1}</p>
                       <p>{order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.zip}</p>
                     </>
                   )}
                </div>

                <div className="flex flex-col gap-4 text-[11px] font-bold tracking-widest text-neutral-800 uppercase">
                   <div>
                     <p className="text-neutral-500">ORDER:</p>
                     <p>{order.title}</p>
                   </div>
                   <div>
                     <p className="text-neutral-500">COMPANY:</p>
                     <p>{cust.company}</p>
                   </div>
                   <div>
                     <p className="text-neutral-500">INVOICE #</p>
                     <p>{order.portalId || order.id.slice(0, 8)}</p>
                   </div>
                </div>

                <div className="mt-8 flex flex-col gap-6 text-[10px] text-neutral-500 leading-relaxed max-w-[200px]">
                   <div>
                     <p className="font-bold text-neutral-800 tracking-widest uppercase mb-1">STATEMENT OF WORK</p>
                     <p>This invoice represents the agreed upon deliverables and services as outlined in the project scope.</p>
                   </div>
                   <div>
                     <p className="font-bold text-neutral-800 tracking-widest uppercase mb-1">FEE SCHEDULE</p>
                     <p>Payment is due upon receipt unless otherwise specified in your terms.</p>
                   </div>
                   <div>
                     <p className="font-bold text-neutral-800 tracking-widest uppercase mb-1">CONFIDENTIALITY</p>
                     <p>Pricing and terms contained within are confidential and intended only for the recipient.</p>
                   </div>
                </div>

                <div className="mt-auto pt-8">
                  <p className="text-[9px] font-bold tracking-widest uppercase text-neutral-400">YOUR TRUST IS OUR HIGHEST PRIORITY</p>
                </div>
             </div>

             {/* Right Column Data */}
             <div className="w-2/3 flex flex-col">
                <h3 className="text-[10px] font-bold tracking-[0.2em] text-neutral-800 uppercase mb-6 pb-2 border-b border-neutral-200">DELIVERABLES</h3>

                <div className="w-full mb-8">
                  {/* Table Header */}
                  <div className="flex w-full text-[9px] font-bold tracking-widest text-neutral-500 uppercase pb-3 border-b border-neutral-100">
                    <div className="w-1/2">ITEM</div>
                    <div className="w-1/6 text-center">QTY</div>
                    <div className="w-1/3 text-right">PRICE</div>
                  </div>

                  {/* Table Rows */}
                  <div className="flex flex-col gap-4 py-4">
                    {order.items?.map((item: any, idx: number) => {
                       const priceStr = String(item.price || '0').replace(/[^0-9.]/g, '');
                       const price = parseFloat(priceStr) || 0;
                       let qty = 0;
                       if (item.itemType === 'service' || !item.sizes || Object.keys(item.sizes).length === 0) {
                         qty = parseInt(item.qty || 1);
                       } else {
                         qty = Object.values(item.sizes || {}).reduce((a: any, b: any) => a + (parseInt(b) || 0), 0) as number;
                       }
                       const total = price * qty;
                       const formattedItemTotal = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(total);
                       const formattedPrice = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(price);

                       return (
                         <div key={idx} className="flex w-full text-[11px] text-neutral-800 leading-snug">
                           <div className="w-1/2 pr-4 flex flex-col">
                              <span className="font-bold uppercase tracking-wide">{item.style || 'Custom Item'}</span>
                              {item.color && <span className="text-neutral-500 mt-0.5">{item.color}</span>}
                           </div>
                           <div className="w-1/6 text-center font-medium">
                              {qty}
                           </div>
                           <div className="w-1/3 text-right flex flex-col">
                              <span className="font-bold">{formattedItemTotal}</span>
                              <span className="text-neutral-400 text-[10px] mt-0.5">{formattedPrice} ea</span>
                           </div>
                         </div>
                       );
                    })}
                    {(!order.items || order.items.length === 0) && (
                      <div className="text-center py-4 text-[10px] text-neutral-400 font-bold tracking-widest uppercase">
                        No items added to this order yet.
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-auto border-t border-neutral-200 pt-6 flex justify-between items-end mb-12">
                   <span className="text-sm font-serif italic text-neutral-400">Total</span>
                   <span className="text-4xl font-serif text-neutral-900 tracking-tight">{formattedTotal}</span>
                </div>

                {/* Wire Info & Payment */}
                <div className="bg-[#f5f3ef] rounded-xl p-6 flex flex-col gap-6">
                   <div>
                     <p className="text-[10px] font-bold tracking-widest text-neutral-800 uppercase mb-2">WIRE INFO</p>
                     <div className="text-[11px] text-neutral-600 leading-relaxed grid grid-cols-2 gap-x-4 gap-y-2">
                       <div>
                         <span className="font-bold text-neutral-800">Bank:</span> Pinnacle Bank<br/>
                         2300 West End Avenue<br/>
                         Nashville, TN 37203
                       </div>
                       <div>
                         <span className="font-bold text-neutral-800">Wire Routing #:</span> XXXXXXXX<br/>
                         <span className="font-bold text-neutral-800">SWIFT Code:</span> XXXXXXXX<br/>
                         <span className="font-bold text-neutral-800">Account Name:</span> Catalyst<br/>
                         <span className="font-bold text-neutral-800">Account Number:</span> XXXXXXXX
                       </div>
                     </div>
                   </div>

                   <a 
                     href={`https://stripe.com`} // We will link to an actual stripe payment link later or add a payment intent
                     target="_blank"
                     rel="noreferrer"
                     className="w-full py-4 bg-black text-white text-center text-[11px] font-bold tracking-widest uppercase rounded-lg hover:bg-neutral-800 transition-colors shadow-lg"
                   >
                     CLICK TO PAY BY CREDIT CARD +3.5%
                   </a>
                </div>
             </div>
           </div>
        </div>
      </div>
    </div>
  );
}
