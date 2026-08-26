import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import QRCode from 'react-qr-code';
import { db } from '../../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Printer, ArrowLeft, Sparkles, PhoneCall } from 'lucide-react';

export function PrintThankYouCard() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState<any>(null);
  const [customer, setCustomer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [quoLink, setQuoLink] = useState('https://quo.com');
  const [autoPrinted, setAutoPrinted] = useState(false);

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
              setCustomer({ id: custDoc.id, ...custDoc.data() });
            }
          }
        }
      } catch (err) {
        console.error('Error fetching order for Thank You Card:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [orderId]);

  useEffect(() => {
    if (!loading && order && !autoPrinted) {
      const timer = setTimeout(() => {
        setAutoPrinted(true);
        window.print();
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [loading, order, autoPrinted]);

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-900 text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin" />
          <p className="text-sm font-medium tracking-wide">Preparing Thank You Card...</p>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-neutral-900 text-white flex items-center justify-center p-4">
        <div className="text-center">
          <h2 className="text-xl font-bold mb-2">Order Not Found</h2>
          <p className="text-sm text-neutral-400 mb-4">Could not load order details for ID: {orderId}</p>
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 bg-white text-black text-xs font-bold rounded-lg hover:bg-neutral-200 transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const origin = window.location.hostname === 'localhost' ? window.location.origin : (window.location.origin || 'https://inktheory.studio');
  const customerId = customer?.id || order.customerId || order.id;
  const portalUrl = `${origin}/portal/${customerId}`;
  const companyName = customer?.company || customer?.name || order.customerName || 'Valued Client';

  return (
    <div className="min-h-screen bg-neutral-100 font-sans print:bg-white print:min-h-0">
      {/* Printable Page Styles */}
      <style>{`
        @media print {
          @page {
            size: portrait;
            margin: 0;
          }
          body {
            margin: 0;
            padding: 0;
            background: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print {
            display: none !important;
          }
          .print-card-container {
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            max-width: none !important;
          }
        }
      `}</style>

      {/* Screen Controls Header */}
      <div className="no-print bg-neutral-900 text-white p-4 border-b border-neutral-800 sticky top-0 z-50 shadow-md">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
              title="Back"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-sm font-bold flex items-center gap-2">
                <Sparkles size={16} className="text-amber-400" />
                Customer Thank You & Studio Insert Card
              </h1>
              <p className="text-xs text-neutral-400">Order #{order.portalId || order.id} • {companyName}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-1.5">
              <PhoneCall size={14} className="text-neutral-400" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">QUO Link:</span>
              <input
                type="text"
                value={quoLink}
                onChange={(e) => setQuoLink(e.target.value)}
                placeholder="https://quo.com"
                className="bg-transparent text-xs text-white outline-none font-mono w-36 border-b border-neutral-600 focus:border-white"
              />
            </div>

            <button
              onClick={() => window.print()}
              className="px-4 py-2 bg-white text-black hover:bg-neutral-200 text-xs font-bold rounded-lg flex items-center gap-2 transition-all shadow-sm"
            >
              <Printer size={16} />
              Print Card
            </button>
          </div>
        </div>
      </div>

      {/* Main Print Insert Card Container */}
      <div className="py-8 print:py-0 flex justify-center items-center">
        <div className="print-card-container w-[8.5in] h-[11in] bg-white border border-neutral-300 shadow-2xl overflow-hidden flex flex-col justify-between relative text-neutral-900 select-none">
          
          {/* ========================================================================= */}
          {/* TOP PANEL: THANK YOU FOR SUPPORTING LOCAL & CLIENT PORTAL QR */}
          {/* ========================================================================= */}
          <div className="h-1/2 relative flex flex-col items-center justify-center p-8 border-b border-neutral-300 overflow-hidden bg-neutral-100/70">
            {/* Background Watermark Repeating Typography */}
            <div className="absolute inset-0 opacity-[0.07] pointer-events-none flex flex-wrap content-center justify-center overflow-hidden font-black text-4xl sm:text-5xl leading-tight text-neutral-900 tracking-tighter uppercase select-none p-4">
              THANK YOU FOR SUPPORTING LOCAL • THANK YOU FOR SUPPORTING LOCAL • THANK YOU FOR SUPPORTING LOCAL • THANK YOU FOR SUPPORTING LOCAL • THANK YOU FOR SUPPORTING LOCAL • THANK YOU FOR SUPPORTING LOCAL •
            </div>

            {/* Top Content */}
            <div className="relative z-10 flex flex-col items-center text-center max-w-lg">
              {/* Brand Header */}
              <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-black mb-1 uppercase font-serif">
                INKTHEORY
              </h1>

              {/* Subtitle */}
              <p className="font-serif italic text-base sm:text-lg text-neutral-700 mb-6">
                Best in the business...<br />
                <span className="text-neutral-600">that just happens to be local.</span>
              </p>

              {/* Customer Portal QR Code Box */}
              <div className="bg-white p-3 rounded-xl border border-neutral-300 shadow-md flex items-center gap-3">
                <div className="p-1 bg-white">
                  <QRCode
                    value={portalUrl}
                    size={110}
                    level="H"
                    bgColor="#ffffff"
                    fgColor="#000000"
                  />
                </div>
                <div className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest flex flex-col justify-center text-left leading-tight pr-2">
                  <span className="font-bold text-neutral-900 text-xs mb-1">SCAN FOR</span>
                  <span>CLIENT PORTAL</span>
                  <span>ORDERS & QUOTES</span>
                </div>
              </div>

              {/* Customer Dedicated Portal Link Subtext */}
              <div className="mt-3 text-[11px] font-mono text-neutral-500 tracking-wider">
                {portalUrl.replace(/^https?:\/\//, '')}
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* BOTTOM PANEL: STATE OF THE ART FACILITY & QUO PHONE SYSTEM QR */}
          {/* ========================================================================= */}
          <div className="h-1/2 relative flex flex-col items-center justify-center p-8 overflow-hidden bg-neutral-900 text-white">
            {/* Background Facility Image with Overlay */}
            <div 
              className="absolute inset-0 bg-cover bg-center opacity-25 mix-blend-luminosity filter contrast-125"
              style={{
                backgroundImage: `url('https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=1200&q=80')`
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-transparent pointer-events-none" />

            {/* Bottom Content */}
            <div className="relative z-10 flex flex-col items-center text-center max-w-xl">
              {/* Brand Header */}
              <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-white mb-1 uppercase font-serif">
                INKTHEORY
              </h1>

              {/* Subtitle */}
              <p className="font-serif italic text-sm sm:text-base text-neutral-300 mb-4">
                State of the Art facility...<br />
                <span className="text-neutral-400">backed by state of the art ideas.</span>
              </p>

              {/* Bold Main Statement */}
              <h2 className="text-lg sm:text-xl font-bold font-serif text-white tracking-wide mb-5 max-w-md leading-snug">
                We help brands discover who they're capable of being.
              </h2>

              {/* Call to Action & QUO Phone System QR */}
              <div className="flex flex-col items-center">
                <p className="text-xs font-serif font-bold uppercase tracking-wider text-amber-400 mb-2">
                  Book time with our Design Studio
                </p>

                <div className="bg-white p-2.5 rounded-xl border border-neutral-200 shadow-xl">
                  <QRCode
                    value={quoLink}
                    size={100}
                    level="H"
                    bgColor="#ffffff"
                    fgColor="#000000"
                  />
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
