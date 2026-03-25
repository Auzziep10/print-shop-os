import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import QRCode from 'react-qr-code';
import { db } from '../../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

export function PrintLabelsSheet() {
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
  }, [orderId]);

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
    <div className="bg-gray-200 min-h-screen pb-10">
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
            background: transparent !important;
          }
          .page-break { page-break-after: always; }
        }
      `}} />
      
      <div className="no-print text-center py-4 text-sm text-gray-500">
        Generating 8.5"x11" sheet (OnlineLabels OL500 / 6-up). Make sure margins are set to "None" in the print dialog.
      </div>

      {pages.map((pageBoxes, pageIndex) => (
        <div key={pageIndex} className={`sheet mx-auto bg-white mb-8 page-break relative`} style={{
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
               <div key={box.id} className="relative w-full h-full box-border overflow-hidden rounded-xl">
                 {/* 
                    Inner Label Container rotated to fit the 4x3 space physically, but design is 3x4 portrait.
                    MUST be absolutely positioned so the 3.8in height doesn't expand the 3in CSS grid row!
                 */}
                 <div 
                   style={{ 
                     position: 'absolute',
                     top: '50%',
                     left: '50%',
                     width: '2.8in', 
                     height: '3.8in', 
                     transform: 'translate(-50%, -50%) rotate(-90deg)' 
                   }}
                   className="bg-black text-white p-4 flex flex-col justify-between items-center box-border font-serif text-center rounded-xl border border-black"
                 >
                   <div className="w-full flex-1 flex flex-col justify-between items-center h-full">
                     {/* Logo */}
                     <div className="w-full flex justify-center items-center h-14 mt-2">
                       <img 
                         src="/logo.png" 
                         alt={cust.company || 'WOVN'} 
                         className="w-[80%] h-full object-contain brightness-0 invert"
                         onError={(e) => {
                           e.currentTarget.style.display = 'none';
                           e.currentTarget.parentElement!.innerHTML = '<span class="text-4xl font-black italic tracking-tight text-white">WOVN</span>';
                         }}
                       />
                     </div>

                     <div className="flex-1 flex flex-col justify-center items-center my-3 w-full">
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

                     <div className="text-[2.2rem] leading-none mb-4 text-white font-serif tracking-wide">
                       {box.name}
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
