import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import QRCode from 'react-qr-code';
import { db } from '../../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

export function PrintLabelsSheet() {
  const { orderId, itemId } = useParams();
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
          let modifiedOrderData: any = { id: orderDoc.id, ...orderData };
          
          if (itemId && modifiedOrderData.boxes) {
            modifiedOrderData.boxes = modifiedOrderData.boxes.filter((b: any) => 
               b.items?.some((bi: any) => String(bi.id) === String(itemId))
            );
          }
          
          setOrder(modifiedOrderData);
          
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
  }, [orderId, itemId]);

  // Wait a moment for rendering, then trigger print automatically
  useEffect(() => {
    if (!loading && order && order.boxes?.length > 0) {
      const timer = setTimeout(() => {
        window.print();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [loading, order]);

  if (loading || !order) {
     return <div className="p-4 text-center">Loading label data...</div>;
  }

  if (!order.boxes || order.boxes.length === 0) {
     return <div className="p-4 text-center">No boxes found for this order.</div>;
  }

  const cust = customer || { company: 'Unknown Customer' };

  // Break boxes into pages of 6 (Avery 5164 layout)
  const pages = [];
  for (let i = 0; i < order.boxes.length; i += 6) {
    pages.push(order.boxes.slice(i, i + 6));
  }

  return (
    <div className="bg-gray-200 print:bg-white min-h-screen print:min-h-0 print:pb-0 pb-10">
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          @page { margin: 0; }
          body { 
            margin: 0; 
            -webkit-print-color-adjust: exact !important; 
            print-color-adjust: exact !important; 
            background: white !important;
          }
          .no-print { display: none !important; }
          .sheet { 
            margin: 0 !important; 
            box-shadow: none !important; 
            background: white !important;
          }
          .page-break { page-break-after: always; }
        }
      `}} />
      
      <div className="no-print text-center py-4 text-sm text-gray-500">
        Generating 8.5"x11" sheet (OnlineLabels OL500 / 6-up). Make sure margins are set to "None" in the print dialog.
      </div>

      {pages.map((pageBoxes, pageIndex) => (
        <div key={pageIndex} className={`sheet mx-auto bg-white mb-8 print:mb-0 relative ${pageIndex < pages.length - 1 ? 'page-break' : ''}`} style={{
          width: '8.5in',
          height: '11in',
          padding: '1in 0.1875in',
          boxSizing: 'border-box',
          boxShadow: '0 0 10px rgba(0,0,0,0.1)',
          display: 'grid',
          gridTemplateColumns: '4in 4in',
          gridAutoRows: '3in',
          columnGap: '0.125in',
          rowGap: '0in'
        }}>
          {pageBoxes.map((box: any) => {
             const publicUrl = `${window.location.origin}/packing-slip/${order.id}/${box.id}`;
             return (
               <div key={box.id} className="relative w-full h-full box-border flex items-center justify-center">
                 {/* 
                    Landscape 4w x 3h container (FULL BLEED).
                    We use width/height 100% so the black background physically touches the edge 
                    of the label cuts, completely removing artificial visual gaps between rows.
                 */}
                 <div 
                   style={{ 
                     width: '100%', 
                     height: '100%',
                     outline: '0.05in solid black'
                   }}
                   className="bg-black text-white p-4 flex flex-row justify-between items-center box-border font-serif text-center rounded-[0.75rem]"
                 >
                   {/* Logo (Left side, rotated to read bottom-to-top) */}
                   <div className="relative h-full flex justify-center items-center w-20 shrink-0">
                     <img 
                       src="/logo.png" 
                       alt={cust.company || 'WOVN'} 
                       className="object-contain brightness-0 invert"
                       style={{ 
                         transform: 'rotate(-90deg)',
                         width: '2.5in',
                         height: 'auto',
                         maxWidth: 'none'
                       }}
                       onError={(e) => {
                         e.currentTarget.style.display = 'none';
                         e.currentTarget.parentElement!.innerHTML = '<span class="text-[3.2rem] font-black italic tracking-tighter text-white whitespace-nowrap" style="transform: rotate(-90deg)">WOVN</span>';
                       }}
                     />
                   </div>

                   {/* QR Code (Center) */}
                   <div className="flex-1 flex justify-center items-center mx-3 h-full">
                      <div className="bg-white p-3 rounded-sm shadow-sm inline-block">
                        <QRCode 
                          value={publicUrl} 
                          size={140} 
                          level="H" 
                          bgColor="#ffffff"
                          fgColor="#000000"
                          style={{ maxWidth: "100%", height: "auto" }} 
                        />
                      </div>
                   </div>

                   {/* Box Name (Right side, rotated to read bottom-to-top) */}
                   <div className="h-full flex justify-center items-center w-20 shrink-0">
                     <div 
                       className="flex flex-col items-center justify-center text-white font-serif tracking-wide whitespace-nowrap"
                       style={{ transform: 'rotate(-90deg)' }}
                     >
                       {order.title && (
                         <span className="text-xs font-sans tracking-widest uppercase opacity-80 mb-2 max-w-[2.5in] truncate block text-center">
                           {order.title}
                         </span>
                       )}
                       <span className="text-[3rem] leading-none">{box.name}</span>
                     </div>
                   </div>
                 </div>
               </div>
             );
          })}
        </div>
      ))}
    </div>
  );
}
