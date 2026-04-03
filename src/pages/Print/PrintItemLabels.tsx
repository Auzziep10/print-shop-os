import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { db } from '../../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

export function PrintItemLabels() {
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
    if (!loading && order && order.items?.length > 0) {
      const timer = setTimeout(() => {
        window.print();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [loading, order]);

  if (loading || !order) {
     return <div className="p-4 text-center">Loading label data...</div>;
  }

  if (!order.items || order.items.length === 0) {
     return <div className="p-4 text-center">No items found for this order.</div>;
  }

  const cust = customer || { company: 'Unknown Customer' };
  
  // Flatten items into individual labels
  const allLabels: any[] = [];
  try {
     const savedTemplateStr = sessionStorage.getItem('itemLabelFormatTemplate');
     const template = savedTemplateStr ? JSON.parse(savedTemplateStr) : { line1: 'brand', line2: 'style', line3: 'color_size' };
     
     order.items?.forEach((item: any) => {
        if (item.sizes && Object.keys(item.sizes).length > 0) {
           Object.entries(item.sizes).forEach(([size, qty]) => {
              const count = parseInt(qty as string) || 0;
              for (let i = 0; i < count; i++) {
                 allLabels.push({ item, size, template, cust });
              }
           });
        } else {
           const count = parseInt(item.qty || 1);
           for (let i = 0; i < count; i++) {
              allLabels.push({ item, size: '', template, cust });
           }
        }
     });
  } catch (err) {
     console.error("Failed parsing label template", err);
  }

  // Break labels into pages of 30 (Avery 5160 layout)
  const pages = [];
  for (let i = 0; i < allLabels.length; i += 30) {
    pages.push(allLabels.slice(i, i + 30));
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
        Generating 8.5"x11" sheet (Avery 5160 / 30-up). Make sure margins are set to "None" in the print dialog.
      </div>

      {pages.map((pageLabels, pageIndex) => (
        <div key={pageIndex} className={`sheet mx-auto bg-white mb-8 print:mb-0 relative ${pageIndex < pages.length - 1 ? 'page-break' : ''}`} style={{
          width: '8.5in',
          height: '11in',
          paddingTop: '0.5in',
          paddingBottom: '0.5in',
          paddingLeft: '0.1875in',
          paddingRight: '0.1875in',
          boxSizing: 'border-box',
          boxShadow: '0 0 10px rgba(0,0,0,0.1)',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 2.625in)',
          gridTemplateRows: 'repeat(10, 1in)',
          columnGap: '0.125in',
          rowGap: '0in'
        }}>
          {pageLabels.map((lbl: any, i: number) => {
             const getLineValue = (type: string) => {
                switch (type) {
                   case 'brand': return lbl.item.brand || 'Unknown Brand';
                   case 'customer': return lbl.cust.companyName || lbl.cust.company || 'Unknown Customer';
                   case 'style': return lbl.item.style || 'Custom Garment';
                   case 'itemNum': return lbl.item.itemNum || '';
                   case 'gender': return lbl.item.gender && lbl.item.gender !== 'Unisex' ? lbl.item.gender : '';
                   case 'color': return lbl.item.color || '';
                   case 'size': return lbl.size || '';
                   case 'color_size': {
                       const c = lbl.item.color || '';
                       const s = lbl.size || '';
                       return `${c}${c && s ? ' - ' : ''}${s}`;
                   }
                   default: return '';
                }
             };

             const line1 = getLineValue(lbl.template.line1);
             const line2 = getLineValue(lbl.template.line2);
             const line3 = getLineValue(lbl.template.line3);

             return (
               <div key={i} className="relative w-full h-full box-border">
                 <div 
                   style={{ 
                     width: '100%', 
                     height: '100%',
                     borderRadius: '0.125in',
                     outline: '0.05in solid black'
                   }}
                   className="bg-black text-white p-3 flex flex-col justify-center items-start box-border font-serif overflow-hidden z-10"
                 >
                   {line1 && <span className="text-[14px] leading-tight font-normal truncate max-w-full block">{line1}</span>}
                   {line2 && <span className="text-[16px] leading-tight font-semibold mt-1 truncate max-w-full block">{line2}</span>}
                   {line3 && <span className="text-[15px] leading-tight font-normal mt-1 truncate max-w-full block">{line3}</span>}
                 </div>
               </div>
             );
          })}
        </div>
      ))}
    </div>
  );
}
