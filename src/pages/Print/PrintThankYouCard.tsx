import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import QRCode from 'react-qr-code';
import { db } from '../../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Printer, ArrowLeft, Sparkles, PhoneCall } from 'lucide-react';
import { DEFAULT_THANK_YOU_CARD, normalizeCardSettings, type ThankYouCardSettings } from '../Settings/ThankYouCardTab';

/**
 * Make a pasted value actually actionable when scanned.
 * A bare phone number encodes as plain text — most scanners just display it —
 * so numbers become tel: URIs (US numbers get a +1), emails become mailto:,
 * and bare domains get https://. Anything already carrying a scheme is left be.
 */
export function toScannableValue(raw: string): string {
  const v = (raw || '').trim();
  if (!v) return v;
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return v; // https:, tel:, sms:, mailto:…
  if (/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(v)) return `mailto:${v}`;

  if (/^[\d\s()+.\-]+$/.test(v)) {
    const digits = v.replace(/[^\d+]/g, '');
    const bare = digits.replace(/^\+/, '');
    if (bare.length >= 7 && bare.length <= 15) {
      if (digits.startsWith('+')) return `tel:${digits}`;
      return `tel:${bare.length === 10 ? `+1${bare}` : bare}`;
    }
  }

  if (/^[\w-]+(\.[\w-]+)+([/?#].*)?$/.test(v)) return `https://${v}`;
  return v;
}

export function PrintThankYouCard() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState<any>(null);
  const [customer, setCustomer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [quoLink, setQuoLink] = useState('https://quo.com');
  const [autoPrinted, setAutoPrinted] = useState(false);
  // Artwork from Settings → Thank You Card
  const [card, setCard] = useState<ThankYouCardSettings>(DEFAULT_THANK_YOU_CARD);

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
        // Card artwork (backgrounds + Design Studio QR)
        const cardDoc = await getDoc(doc(db, 'settings', 'thankYouCard'));
        if (cardDoc.exists()) {
          const data = normalizeCardSettings(cardDoc.data() as ThankYouCardSettings);
          setCard(data);
          if (data.studioLink) setQuoLink(data.studioLink);
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

  // Fonts are declared explicitly here (rather than via the font-sans/font-serif
  // utilities) so the printed card always sets in the brand faces.
  const SANS = '"Inter", "Helvetica Neue", Helvetica, Arial, sans-serif';
  const SERIF = '"Playfair Display", Georgia, serif';

  // Oversized watermark: one long marquee string that bleeds past every edge
  const WATERMARK = Array.from({ length: 14 })
    .map(() => 'THANK YOU FOR SUPPORTING LOCAL')
    .join(' • ') + ' • ';

  const studioQrValue = toScannableValue(quoLink);

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
          }
          /* Keep the panel tints and washed photo in the printed output */
          * {
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
          <div className="h-1/2 relative flex flex-col items-center justify-center overflow-hidden" style={{ backgroundColor: '#d7d7d7' }}>
            {/* Optional background photo (Settings → Thank You Card) */}
            {card.topImageUrl && (
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{
                  backgroundImage: `url('${card.topImageUrl}')`,
                  opacity: (card.topImageOpacity ?? 100) / 100,
                }}
              />
            )}

            {/* Generated watermark — skipped when uploaded artwork already carries it */}
            {!card.topImageUrl && (
            <div className="absolute inset-0 overflow-hidden pointer-events-none select-none flex items-center justify-center">
              <div
                style={{
                  fontFamily: SANS,
                  fontWeight: 900,
                  fontSize: '74px',
                  lineHeight: 0.86,
                  letterSpacing: '-0.03em',
                  color: 'rgba(0,0,0,0.055)',
                  width: '128%',
                  textAlign: 'center',
                  wordBreak: 'break-word',
                }}
              >
                {WATERMARK}
              </div>
            </div>
            )}

            {/* Top Content — sits below the panel's centre line, as in the reference */}
            <div className="relative z-10 flex flex-col items-center text-center px-10" style={{ marginTop: '76px' }}>
              <h1
                className="text-black"
                style={{ fontFamily: SANS, fontWeight: 900, fontSize: '42px', letterSpacing: '-0.035em', lineHeight: 1 }}
              >
                INKTHEORY
              </h1>

              <p
                className="text-black mt-6"
                style={{ fontFamily: SERIF, fontSize: '15px', lineHeight: 1.5 }}
              >
                Best in the business...<br />
                <span style={{ fontStyle: 'italic' }}>that just happens to be local.</span>
              </p>

              {/* Bare QR with vertical caption, no card. The caption is capped to
                  the QR's height so it can never hang past it. */}
              <div className="mt-10 flex items-stretch gap-1.5" style={{ height: '54px' }}>
                <span
                  className="uppercase text-neutral-700 flex items-center justify-center"
                  style={{
                    fontFamily: SANS,
                    fontSize: '4px',
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    lineHeight: 1,
                    writingMode: 'vertical-rl',
                    transform: 'rotate(180deg)',
                  }}
                >
                  Your Brand's Destiny
                </span>
                <QRCode value={portalUrl} size={54} level="H" bgColor="#00000000" fgColor="#000000" />
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* BOTTOM PANEL: STATE OF THE ART FACILITY & DESIGN STUDIO QR */}
          {/* ========================================================================= */}
          <div className="h-1/2 relative flex flex-col items-center justify-center overflow-hidden bg-white text-black">
            {/* Washed-out facility photo (Settings → Thank You Card) */}
            {card.bottomImageUrl && (
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{
                  backgroundImage: `url('${card.bottomImageUrl}')`,
                  opacity: (card.bottomImageOpacity ?? 100) / 100,
                }}
              />
            )}

            {/* Bottom Content — sits low in the panel, as in the reference */}
            <div className="relative z-10 flex flex-col items-center text-center px-12" style={{ marginTop: '140px' }}>
              <h1
                className="text-black"
                style={{ fontFamily: SANS, fontWeight: 900, fontSize: '42px', letterSpacing: '-0.035em', lineHeight: 1 }}
              >
                INKTHEORY
              </h1>

              <p
                className="text-black mt-6"
                style={{ fontFamily: SERIF, fontSize: '15px', lineHeight: 1.5 }}
              >
                State of the Art facility...<br />
                <span style={{ fontStyle: 'italic' }}>backed by state of the art ideas.</span>
              </p>

              <h2
                className="text-black mt-9"
                style={{ fontFamily: SERIF, fontWeight: 700, fontSize: '17px', lineHeight: 1.35 }}
              >
                We help brands discover who they're capable of being.
              </h2>

              <p className="text-black mt-9" style={{ fontFamily: SERIF, fontSize: '11px' }}>
                Book time with our Design Studio
              </p>

              {/* Design Studio QR: uploaded image wins, otherwise generated
                  from the booking link (Settings → Thank You Card). */}
              <div className="mt-4">
                {card.studioQrUrl ? (
                  <img
                    src={card.studioQrUrl}
                    alt="Design Studio QR"
                    width={72}
                    height={72}
                    style={{ imageRendering: 'pixelated', display: 'block' }}
                  />
                ) : (
                  <QRCode value={studioQrValue} size={72} level="H" bgColor="#00000000" fgColor="#000000" />
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
