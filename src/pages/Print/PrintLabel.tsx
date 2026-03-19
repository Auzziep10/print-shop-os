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
  const totalItems = box.items?.reduce((acc: number, item: any) => acc + (item.qty || 0), 0) || 0;

  // Render a 4x6 thermal label. Usually thermal layers represent 4" width x 6" height.
  // We'll style a container to approximately 4in x 6in for browser rendering.
  return (
    <div className="w-[4in] h-[6in] bg-white text-black p-4 font-sans flex flex-col mx-auto box-border overflow-hidden">
        {/* Header Ribbon */}
        <div className="border-b-[3px] border-black pb-3 mb-4 flex justify-between items-end">
           <div>
              <p className="text-[10px] font-bold uppercase tracking-widest">{cust.company}</p>
              <h1 className="text-2xl font-black leading-none mt-1">{box.name}</h1>
           </div>
           <div className="text-right">
              <p className="text-[10px] font-bold uppercase">Order</p>
              <p className="font-bold text-lg leading-none">{order.portalId || order.id.slice(0, 6)}</p>
           </div>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-2 gap-x-2 gap-y-4 mb-4">
           <div>
              <p className="text-[8px] font-bold uppercase border-b border-black mb-1">Title</p>
              <p className="text-xs font-bold leading-tight">{order.title}</p>
           </div>
           <div>
              <p className="text-[8px] font-bold uppercase border-b border-black mb-1">Fulfillment</p>
              <p className="text-xs font-bold leading-tight">{order.fulfillmentType || cust.fulfillmentType || 'Standard'}</p>
           </div>
           <div>
              <p className="text-[8px] font-bold uppercase border-b border-black mb-1">Total Garments</p>
              <p className="text-xl font-black">{totalItems}</p>
           </div>
           <div>
              <p className="text-[8px] font-bold uppercase border-b border-black mb-1">Date</p>
              <p className="text-xs font-bold">{new Date().toLocaleDateString()}</p>
           </div>
        </div>

        {/* QR Code Prominent */}
        <div className="flex flex-col items-center justify-center my-auto">
            <QRCode value={publicUrl} size={160} />
            <p className="mt-4 text-xs font-black uppercase tracking-widest text-center border-t-2 border-b-2 border-black py-1 px-4">
              SCAN FOR PACKING SLIP
            </p>
        </div>

        {/* Short Item Preview (only fits a few lines) */}
        <div className="mt-auto border-t-[3px] border-black pt-2">
           <p className="text-[8px] font-bold uppercase mb-1">Contents Preview:</p>
           <ul className="text-[9px] font-bold leading-tight line-clamp-3">
             {box.items?.slice(0, 4).map((item: any, i: number) => (
               <li key={i} className="flex justify-between items-center whitespace-nowrap overflow-hidden">
                 <span className="truncate pr-2">{item.style}</span>
                 <span>x{item.qty}</span>
               </li>
             ))}
             {(box.items?.length || 0) > 4 && (
               <li className="italic">+ {box.items.length - 4} more styles</li>
             )}
           </ul>
        </div>
    </div>
  );
}
