import { useEffect, useState } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import QRCode from 'react-qr-code';
import { db } from '../../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { DEFAULT_BOX_LABEL_PRESETS } from '../../types/boxLabel';
import type { BoxLabelPreset } from '../../types/boxLabel';
import { fetchBoxLabelPresets } from '../../lib/boxLabelUtils';

export function PrintLabelsSheet() {
  const { orderId, itemId } = useParams();
  const [order, setOrder] = useState<any>(null);
  const [customer, setCustomer] = useState<any>(null);
  const [preset, setPreset] = useState<BoxLabelPreset>(DEFAULT_BOX_LABEL_PRESETS[0]);
  const [loading, setLoading] = useState(true);
  const location = useLocation();

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
          
          const searchParams = new URLSearchParams(location.search);
          const selectedBoxIds = searchParams.get('boxes');
          if (selectedBoxIds && modifiedOrderData.boxes) {
              const allowedIds = selectedBoxIds.split(',');
              modifiedOrderData.boxes = modifiedOrderData.boxes.filter((b: any) => allowedIds.includes(b.id));
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

          // Load label preset (check URL search params for specific preset requested)
          const requestedPresetId = searchParams.get('preset');
          const allPresets = await fetchBoxLabelPresets();

          if (requestedPresetId) {
            const chosen = allPresets.find(p => p.id === requestedPresetId);
            if (chosen) {
              setPreset(chosen);
            } else if (orderData.boxLabelPreset) {
              setPreset(orderData.boxLabelPreset);
            } else {
              const def = allPresets.find(p => p.isDefault) || allPresets[0];
              setPreset(def);
            }
          } else if (orderData.boxLabelPreset) {
            setPreset(orderData.boxLabelPreset);
          } else {
            const def = allPresets.find(p => p.isDefault) || allPresets[0];
            setPreset(def);
          }
        }
      } catch (err) {
        console.error("Error fetching order:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [orderId, itemId, location.search]);

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
     return <div className="p-4 text-center font-sans text-sm">Loading label sheet data...</div>;
  }

  if (!order.boxes || order.boxes.length === 0) {
     return <div className="p-4 text-center font-sans text-sm">No boxes found for this order.</div>;
  }

  const cust = customer || { company: 'Unknown Customer' };

  // Break boxes into pages of 6 (Avery 5164 layout)
  const pages = [];
  for (let i = 0; i < order.boxes.length; i += 6) {
    pages.push(order.boxes.slice(i, i + 6));
  }

  const isDarkTheme = preset.theme === 'dark' || (!preset.theme && preset.bgColor === '#000000');

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

      {/* Non-print Top Controls */}
      <div className="no-print bg-neutral-900 text-white p-4 max-w-[8.5in] mx-auto mb-4 mt-4 rounded-xl flex justify-between items-center shadow-lg">
        <div>
          <h1 className="text-base font-bold">Print Box QR Labels (Avery 5164 Sheet)</h1>
          <p className="text-xs text-neutral-400">Preset: <span className="font-bold text-amber-400">{preset.name}</span> • 6 labels per 8.5" x 11" page</p>
        </div>
        <button 
          onClick={() => window.print()}
          className="bg-white text-black font-bold text-xs px-4 py-2 rounded-lg hover:bg-neutral-200 transition-colors cursor-pointer"
        >
          Print Sheet
        </button>
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
                 <div 
                   style={{ 
                     width: '100%', 
                     height: '100%',
                     backgroundColor: preset.bgColor || '#000000',
                     color: preset.textColor || '#ffffff',
                     fontFamily: preset.fontFamily === 'sans' ? 'sans-serif' : preset.fontFamily === 'mono' ? 'monospace' : 'serif',
                     borderWidth: (preset.showBorder !== false) ? `${preset.borderWidth ?? 4}px` : '0px',
                     borderStyle: (preset.showBorder !== false) ? 'solid' : 'none',
                     borderColor: preset.borderColor || (preset.theme === 'light' ? '#000000' : preset.textColor || '#ffffff'),
                     borderRadius: `${preset.borderRadius ?? 16}px`
                   }}
                   className="p-4 flex flex-row justify-between items-center box-border text-center overflow-hidden"
                 >
                   {/* Logo / Header (Left side, rotated -90deg) */}
                   <div className="relative h-full flex justify-center items-center w-20 shrink-0">
                     {preset.logoType === 'wovn' && (
                       <img 
                         src="/logo.png" 
                         alt={cust.company || 'WOVN'} 
                         className={`object-contain ${isDarkTheme ? 'brightness-0 invert' : ''}`}
                         style={{ 
                           transform: 'rotate(-90deg)',
                           width: '2.5in',
                           height: 'auto',
                           maxWidth: 'none'
                         }}
                         onError={(e) => {
                           e.currentTarget.style.display = 'none';
                           e.currentTarget.parentElement!.innerHTML = `<span class="text-[3.2rem] font-black italic tracking-tighter uppercase whitespace-nowrap" style="transform: rotate(-90deg); color: ${preset.textColor}">${preset.headerText || 'WOVN'}</span>`;
                         }}
                       />
                     )}

                     {preset.logoType === 'customer' && (
                       <span className="text-xl font-bold uppercase tracking-wide whitespace-nowrap" style={{ transform: 'rotate(-90deg)', color: preset.textColor }}>
                         {preset.headerText || cust.company || cust.name || 'CUSTOMER'}
                       </span>
                     )}

                     {preset.logoType === 'custom' && preset.customLogoUrl && (
                       <img src={preset.customLogoUrl} alt="Logo" className="max-h-16 object-contain" style={{ transform: 'rotate(-90deg)' }} />
                     )}
                   </div>

                   {/* QR Code (Center) */}
                   <div className="flex-1 flex justify-center items-center mx-3 h-full">
                      <div className={`p-2.5 transition-all ${
                        preset.qrContainerStyle === 'white_box'
                          ? 'bg-white rounded-md shadow-sm'
                          : preset.qrContainerStyle === 'bordered'
                          ? 'border-2 border-current rounded-md bg-transparent p-2'
                          : 'bg-transparent p-0'
                      }`}>
                        <QRCode 
                          value={publicUrl} 
                          size={140} 
                          level="H" 
                          bgColor={preset.qrContainerStyle === 'white_box' ? '#ffffff' : 'transparent'}
                          fgColor={preset.qrContainerStyle === 'white_box' ? '#000000' : preset.textColor || '#ffffff'}
                          style={{ width: "100%", maxWidth: "140px", height: "auto" }} 
                        />
                      </div>
                   </div>

                   {/* Box Name & Details (Right side, rotated 90deg) */}
                   <div className="relative h-full flex flex-col justify-center items-center w-24 shrink-0">
                      <div 
                        className="flex flex-col items-center justify-center whitespace-nowrap"
                        style={{ transform: 'rotate(90deg)' }}
                      >
                         <span className="text-[2.2rem] leading-none font-bold tracking-wide">
                            {box.name}
                         </span>
                         {preset.showCustomerName && (
                            <span className="text-[10px] uppercase font-bold tracking-wider opacity-85 mt-1">
                              {cust.company || cust.name}
                            </span>
                         )}
                         {preset.showOrderNum && (
                            <span className="text-[9px] font-mono tracking-widest uppercase opacity-75">
                              ORDER #{order.portalId || order.id}
                            </span>
                         )}
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
