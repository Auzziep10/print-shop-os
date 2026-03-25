import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import QRCode from 'react-qr-code';
import { db } from '../../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

export function PrintLabel() {
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
  }, [orderId, boxId]);

  // Wait a moment for rendering, then trigger print automatically
  useEffect(() => {
    if (!loading && order && box) {
      const timer = setTimeout(() => {
        window.print();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [loading, order, box]);

  if (loading || !order || !box) {
     return <div className="p-4 text-center">Loading label data...</div>;
  }

  const cust = customer || { company: 'Unknown Customer' };
  const publicUrl = `${window.location.origin}/packing-slip/${order.id}/${box.id}`;

  // Render a 3x4 thermal label.
  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          @page { margin: 0; size: 3in 4in; }
          body { 
            margin: 0; 
            -webkit-print-color-adjust: exact !important; 
            print-color-adjust: exact !important; 
            background: white !important;
          }
        }
      `}} />
      <div className="w-[3in] h-[4in] bg-black text-white p-4 flex flex-col justify-between items-center mx-auto box-border font-serif text-center relative overflow-hidden">
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
          {box.name}
        </div>
      </div>
    </div>
    </>
  );
}
