import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import QRCode from 'react-qr-code';
import { db } from '../../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

export function PrintLabel() {
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

  // Wait a moment for rendering, then trigger print automatically
  useEffect(() => {
    if (!loading && order && boxes.length > 0) {
      const timer = setTimeout(() => {
        window.print();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [loading, order, boxes]);

  if (loading || !order || boxes.length === 0) {
     return <div className="p-4 text-center">Loading label data...</div>;
  }

  const cust = customer || { company: 'Unknown Customer' };

  // Render 3x4 thermal labels.
  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          html, body {
             margin: 0;
             padding: 0;
          }
          @page { margin: 0; size: 3in 4in; }
          body { 
            margin: 0; 
            -webkit-print-color-adjust: exact !important; 
            print-color-adjust: exact !important; 
            background: white !important;
          }
        }
      `}} />
      <div className="flex flex-col">
        {boxes.map((b, index) => {
          const publicUrl = `${window.location.origin}/packing-slip/${order.id}/${b.id}`;
          return (
            <div key={b.id} className={`w-[3in] h-[4in] max-w-full max-h-full bg-black text-white p-4 flex flex-col justify-between items-center mx-auto box-border font-serif text-center relative overflow-hidden ${index < boxes.length - 1 ? 'print:break-after-page mb-8 print:mb-0' : ''}`}>
              <div className="w-full flex-1 flex flex-col justify-between items-center h-full">
                {/* Logo */}
                <div className="w-full flex justify-center items-center h-16 mt-4">
                  <img 
                    src="/logo.png" 
                    alt={cust.company || 'WOVN'} 
                    className="w-[80%] h-full object-contain brightness-0 invert"
                    onError={(e) => {
                      // Fallback if logo.png is missing or broken
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.parentElement!.innerHTML = '<span class="text-5xl font-black italic tracking-tighter text-white">WOVN</span>';
                    }}
                  />
                </div>

                <div className="flex-1 flex flex-col justify-center items-center my-4 w-full">
                   <div className="bg-white p-3 rounded-sm">
                     <QRCode 
                       value={publicUrl} 
                       size={180} 
                       level="H" 
                       bgColor="#ffffff"
                       fgColor="#000000"
                       style={{ width: "100%", maxWidth: "160px", height: "auto" }} 
                     />
                   </div>
                </div>

                <div className="text-[3rem] leading-none mb-6 text-white font-serif tracking-wide">
                  {b.name}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
