import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import QRCode from 'react-qr-code';
import { db } from '../../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { DEFAULT_BOX_LABEL_PRESETS } from '../../types/boxLabel';
import type { BoxLabelPreset } from '../../types/boxLabel';
import { fetchBoxLabelPresets } from '../../lib/boxLabelUtils';

export function PrintLabel() {
  const { orderId, boxId, itemId } = useParams();
  const [order, setOrder] = useState<any>(null);
  const [boxes, setBoxes] = useState<any[]>([]);
  const [customer, setCustomer] = useState<any>(null);
  const [preset, setPreset] = useState<BoxLabelPreset>(DEFAULT_BOX_LABEL_PRESETS[0]);
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

          // Load label preset (check URL search params for specific preset requested)
          const searchParams = new URLSearchParams(window.location.search);
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
  }, [orderId, boxId, itemId]);

  // Wait a moment for rendering, then trigger print automatically
  useEffect(() => {
    if (!loading && order && boxes.length > 0) {
      const timer = setTimeout(() => {
        window.print();
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [loading, order, boxes]);

  if (loading || !order || boxes.length === 0) {
     return <div className="p-4 text-center font-sans text-sm font-medium">Loading thermal label...</div>;
  }

  const cust = customer || { company: order.customerName || 'Unknown Customer' };

  // Page size for print CSS
  let pageSizeCss = 'size: 3in 4in;';
  if (preset.labelSize === '4x6') pageSizeCss = 'size: 4in 6in;';
  else if (preset.labelSize === '4x3') pageSizeCss = 'size: 4in 3in;';
  else if (preset.labelSize === '3x2') pageSizeCss = 'size: 3in 2in;';
  else if (preset.labelSize === '2x3') pageSizeCss = 'size: 2in 3in;';
  else if (preset.labelSize === '2x1') pageSizeCss = 'size: 2in 1in;';

  const containerW = preset.labelSize === '4x6' ? 'w-[4in]' : preset.labelSize === '4x3' ? 'w-[4in]' : preset.labelSize === '3x2' ? 'w-[3in]' : preset.labelSize === '2x3' ? 'w-[2in]' : preset.labelSize === '2x1' ? 'w-[2in]' : 'w-[3in]';
  const containerH = preset.labelSize === '4x6' ? 'h-[6in]' : preset.labelSize === '4x3' ? 'h-[3in]' : preset.labelSize === '3x2' ? 'h-[2in]' : preset.labelSize === '2x3' ? 'h-[3in]' : preset.labelSize === '2x1' ? 'h-[1in]' : 'h-[4in]';

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          html, body {
             margin: 0;
             padding: 0;
          }
          @page { margin: 0; ${pageSizeCss} }
          body { 
            margin: 0; 
            -webkit-print-color-adjust: exact !important; 
            print-color-adjust: exact !important; 
            background: white !important;
          }
        }
      `}} />
      <div className="flex flex-col items-center">
        {boxes.map((b, index) => {
          const publicUrl = `${window.location.origin}/packing-slip/${order.id}/${b.id}`;
          const isDarkTheme = preset.theme === 'dark' || (!preset.theme && preset.bgColor === '#000000');
          const isLandscape = preset.labelSize === '4x3' || preset.labelSize === '3x2' || preset.labelSize === '2x1';
          const isCompact = preset.labelSize === '2x1' || preset.labelSize === '3x2';

          return (
            <div 
              key={b.id} 
              style={{
                backgroundColor: preset.bgColor || '#000000',
                color: preset.textColor || '#ffffff',
                fontFamily: preset.fontFamily === 'sans' ? 'sans-serif' : preset.fontFamily === 'mono' ? 'monospace' : 'serif',
                borderWidth: (preset.showBorder !== false) ? `${preset.borderWidth ?? 4}px` : '0px',
                borderStyle: (preset.showBorder !== false) ? 'solid' : 'none',
                borderColor: preset.borderColor || (preset.theme === 'light' ? '#000000' : preset.textColor || '#ffffff'),
                borderRadius: `${preset.borderRadius ?? 16}px`
              }}
              className={`${containerW} ${containerH} max-w-full max-h-full p-4 flex ${isLandscape ? 'flex-row justify-between items-center text-left' : 'flex-col justify-between items-center text-center'} mx-auto box-border relative overflow-hidden ${index < boxes.length - 1 ? 'print:break-after-page mb-8 print:mb-0' : ''}`}
            >
              {isLandscape ? (
                <>
                  {/* Left Column: Branding & Box Details */}
                  <div className="flex-1 flex flex-col justify-between h-full pr-3 min-w-0">
                    <div>
                      {preset.logoType === 'wovn' && (
                        <div className="w-full flex justify-start items-center h-8">
                          <img 
                            src="/logo.png" 
                            alt={cust.company || 'WOVN'} 
                            className={`max-h-8 object-contain ${isDarkTheme ? 'brightness-0 invert' : ''}`}
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              e.currentTarget.parentElement!.innerHTML = `<span class="${isCompact ? 'text-xl' : 'text-2xl'} font-black italic tracking-tighter uppercase font-serif" style="color: ${preset.textColor}">${preset.headerText || 'WOVN'}</span>`;
                            }}
                          />
                        </div>
                      )}

                      {preset.logoType === 'customer' && (
                        <div className={`${isCompact ? 'text-xs' : 'text-sm'} font-bold uppercase tracking-wide truncate max-w-full`}>
                          {preset.headerText || cust.company || cust.name || 'CUSTOMER'}
                        </div>
                      )}

                      {preset.logoType === 'custom' && preset.customLogoUrl && (
                        <img src={preset.customLogoUrl} alt="Logo" className={`${isCompact ? 'max-h-6' : 'max-h-8'} object-contain`} />
                      )}

                      {preset.showOrderNum && (
                        <div className="text-[9px] font-mono tracking-widest uppercase opacity-85 mt-0.5">
                          ORDER #{order.portalId || order.id}
                        </div>
                      )}

                      {preset.subHeaderText && (
                        <div className="text-[9px] font-mono tracking-wider uppercase opacity-85 mt-0.5 truncate max-w-full">
                          {preset.subHeaderText}
                        </div>
                      )}
                    </div>

                    <div>
                      {preset.showCustomerName && (
                        <div className="text-[10px] font-bold uppercase tracking-wider opacity-90 truncate max-w-full">
                          {cust.company || cust.name}
                        </div>
                      )}

                      <div className={`${isCompact ? 'text-2xl' : 'text-3.5xl'} leading-none font-bold tracking-wide my-0.5`}>
                        {b.name}
                      </div>

                      {preset.showBoxItems && b.items && b.items.length > 0 && (
                        <div className="text-[9px] opacity-80 truncate max-w-full mt-0.5">
                          {b.items.length} Items • {b.items.reduce((s: number, i: any) => s + (i.qty || 1), 0)} Pcs
                        </div>
                      )}

                      {preset.footerText && (
                        <div className="text-[8px] opacity-70 uppercase tracking-widest mt-0.5">
                          {preset.footerText}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Column: QR Code */}
                  <div className="shrink-0 flex items-center justify-center">
                    <div className={`p-2 transition-all ${
                      preset.qrContainerStyle === 'white_box'
                        ? 'bg-white rounded-md'
                        : preset.qrContainerStyle === 'bordered'
                        ? 'border-2 border-current rounded-md bg-transparent p-1.5'
                        : 'bg-transparent p-0'
                    }`}>
                      <QRCode 
                        value={publicUrl} 
                        size={isCompact ? 90 : (preset.qrSize || 130)} 
                        level="H" 
                        bgColor={preset.qrContainerStyle === 'white_box' ? '#ffffff' : 'transparent'}
                        fgColor={preset.qrContainerStyle === 'white_box' ? '#000000' : preset.textColor || '#ffffff'}
                        style={{ width: "100%", maxWidth: isCompact ? '90px' : `${preset.qrSize || 130}px`, height: "auto" }} 
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div className="w-full flex-1 flex flex-col justify-between items-center h-full">
                  {/* Header Logo & Title */}
                  <div className="w-full flex flex-col items-center justify-center shrink-0 pt-2">
                    {preset.logoType === 'wovn' && (
                      <div className="w-full flex justify-center items-center h-12">
                        <img 
                          src="/logo.png" 
                          alt={cust.company || 'WOVN'} 
                          className={`w-[75%] h-full object-contain ${isDarkTheme ? 'brightness-0 invert' : ''}`}
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            e.currentTarget.parentElement!.innerHTML = `<span class="text-4xl font-black italic tracking-tighter uppercase font-serif" style="color: ${preset.textColor}">${preset.headerText || 'WOVN'}</span>`;
                          }}
                        />
                      </div>
                    )}

                    {preset.logoType === 'customer' && (
                      <div className="text-base font-bold uppercase tracking-wide truncate max-w-full">
                        {preset.headerText || cust.company || cust.name || 'CUSTOMER'}
                      </div>
                    )}

                    {preset.logoType === 'custom' && preset.customLogoUrl && (
                      <img src={preset.customLogoUrl} alt="Logo" className="max-h-12 object-contain" />
                    )}

                    {preset.showOrderNum && (
                      <div className="text-[10px] font-mono tracking-widest uppercase opacity-85 mt-0.5">
                        ORDER #{order.portalId || order.id}
                      </div>
                    )}

                    {preset.subHeaderText && (
                      <div className="text-[9px] font-mono tracking-wider uppercase opacity-85 mt-0.5 truncate max-w-full">
                        {preset.subHeaderText}
                      </div>
                    )}
                  </div>

                  {/* QR Code */}
                  <div className="flex-1 flex flex-col justify-center items-center my-2 w-full">
                     <div className={`p-3.5 transition-all ${
                       preset.qrContainerStyle === 'white_box'
                         ? 'bg-white rounded-md'
                         : preset.qrContainerStyle === 'bordered'
                         ? 'border-2 border-current rounded-md bg-transparent p-2'
                         : 'bg-transparent p-0'
                     }`}>
                       <QRCode 
                         value={publicUrl} 
                         size={preset.qrSize || 180} 
                         level="H" 
                         bgColor={preset.qrContainerStyle === 'white_box' ? '#ffffff' : 'transparent'}
                         fgColor={preset.qrContainerStyle === 'white_box' ? '#000000' : preset.textColor || '#ffffff'}
                         style={{ width: "100%", maxWidth: `${preset.qrSize || 180}px`, height: "auto" }} 
                       />
                     </div>
                  </div>

                  {/* Footer Box Name & Details */}
                  <div className="w-full flex flex-col items-center shrink-0 pb-2 gap-0.5">
                    {preset.showCustomerName && (
                      <div className="text-xs font-bold uppercase tracking-wider opacity-90 truncate max-w-full">
                        {cust.company || cust.name}
                      </div>
                    )}

                    <div className="text-[2.75rem] leading-none font-bold tracking-wide">
                      {b.name}
                    </div>

                    {preset.showBoxItems && b.items && b.items.length > 0 && (
                      <div className="text-[10px] opacity-80 truncate max-w-full mt-1">
                        {b.items.length} Items • {b.items.reduce((s: number, i: any) => s + (i.qty || 1), 0)} Pcs
                      </div>
                    )}

                    {preset.footerText && (
                      <div className="text-[9px] opacity-70 uppercase tracking-widest mt-0.5">
                        {preset.footerText}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
