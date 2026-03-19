import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import QRCode from 'react-qr-code';
import { db } from '../../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { MOCK_CUSTOMERS_DB } from '../../lib/mockData';

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

  const cust = customer || MOCK_CUSTOMERS_DB['CUS-001'];
  const publicUrl = `${window.location.origin}/packing-slip/${order.id}/${box.id}`;

  // Render a 4x6 thermal label. Usually thermal layers represent 4" width x 6" height.
  // We'll style a container to approximately 4in x 6in for browser rendering.
  return (
    <div className="w-[4in] h-[6in] bg-white text-black p-6 flex flex-col justify-between items-center mx-auto box-border border-[6px] border-gray-500 font-serif text-center relative">
      <div className="w-full flex-1 flex flex-col justify-between items-center h-full">
        {/* Logo */}
        <div className="w-full flex justify-center items-center h-24 mt-2">
          <img 
            src="/logo.png" 
            alt={cust.company || 'WOVN'} 
            className="w-[90%] h-full object-contain"
            onError={(e) => {
              // Fallback if logo.png is missing or broken
              e.currentTarget.style.display = 'none';
              e.currentTarget.parentElement!.innerHTML = '<span class="text-6xl font-black italic tracking-tighter">WOVN</span>';
            }}
          />
        </div>

        <div className="text-5xl uppercase tracking-[0.2em] mt-8 text-black">
          ITEMS
        </div>

        <div className="flex-1 flex flex-col justify-center items-center my-6 w-full">
           <QRCode 
             value={publicUrl} 
             size={280} 
             level="H" 
             style={{ width: "100%", maxWidth: "260px", height: "auto" }} 
           />
        </div>

        <div className="text-[4rem] leading-none mb-4 text-black">
          {box.name}
        </div>
      </div>
    </div>
  );
}
