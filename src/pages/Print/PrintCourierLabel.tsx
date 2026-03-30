import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { db } from '../../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

export function PrintCourierLabel() {
  const { orderId, itemId } = useParams();
  const [order, setOrder] = useState<any>(null);
  const [boxes, setBoxes] = useState<any[]>([]);
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
            if (itemId) {
              const foundBoxes = orderData.boxes.filter((b: any) => 
                b.labelUrl && b.items?.some((bi: any) => String(bi.id) === String(itemId))
              );
              setBoxes(foundBoxes);
            } else {
              setBoxes(orderData.boxes.filter((b: any) => b.labelUrl));
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
    if (!loading && order && boxes.length > 0) {
      const timer = setTimeout(() => {
        window.print();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [loading, order, boxes]);

  if (loading || !order) {
     return <div className="p-4 text-center">Loading label data...</div>;
  }

  if (boxes.length === 0) {
     return <div className="p-4 text-center text-red-500 font-bold">No UPS shipping labels have been purchased for the boxes in this line item yet.</div>;
  }

  // Render 4x6 thermal UPS labels.
  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          html, body {
             margin: 0;
             padding: 0;
          }
          @page { margin: 0; size: 4in 6in; }
          body { 
            margin: 0; 
            -webkit-print-color-adjust: exact !important; 
            print-color-adjust: exact !important; 
            background: white !important;
          }
        }
      `}} />
      <div className="flex flex-col bg-gray-100 min-h-screen print:bg-white print:min-h-0">
        <div className="text-center p-4 print:hidden text-gray-500 text-sm">
          Preparing 4x6 thermal UPS labels for printing...
        </div>
        
        {boxes.map((b, index) => {
          return (
            <div 
              key={b.id} 
              className={`w-[4in] h-[6in] bg-white mx-auto relative box-border overflow-hidden ${index < boxes.length - 1 ? 'print:break-after-page mb-8 print:mb-0 shadow-lg print:shadow-none' : 'shadow-lg print:shadow-none'}`}
            >
              {/* Box Name Tag */}
              <div className="absolute top-0 right-0 bg-black text-white px-4 py-3 font-black text-xl z-10 rounded-bl-3xl border-b-4 border-l-4 border-white shadow-md print:shadow-none">
                {b.name}
              </div>

              {/* Courier Label Image */}
              <div className="w-full h-full flex items-center justify-center p-1 relative z-0">
                <img 
                   src={b.labelUrl} 
                   alt={`Shipping Label for ${b.name}`} 
                   className="w-full h-full object-contain mix-blend-multiply"
                />
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
