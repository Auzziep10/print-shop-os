import { useState } from 'react';
import QRCode from 'react-qr-code';
import QRCodeLib from 'qrcode';
import { X, Copy, Download, Check, ExternalLink, Printer, QrCode, Share2, Building2 } from 'lucide-react';

interface CustomerPortalQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: {
    id: string;
    company?: string;
    contactName?: string;
    name?: string;
    logo?: string;
    croppedLogo?: string;
    portalId?: string;
  } | null;
}

export function CustomerPortalQrModal({ isOpen, onClose, customer }: CustomerPortalQrModalProps) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedImage, setCopiedImage] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  if (!isOpen || !customer) return null;

  const companyName = customer.company && customer.company !== '-' ? customer.company : (customer.name || customer.contactName || 'Client');
  const origin = window.location.hostname === 'localhost' ? window.location.origin : (window.location.origin || 'https://inktheory.studio');
  const portalUrl = `${origin}/portal/${customer.id}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(portalUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  // Generate branded canvas image for download or copy
  const generateBrandedCanvas = async (): Promise<HTMLCanvasElement> => {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 760;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get canvas context');

    // 1. White Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Outer Border Card
    ctx.strokeStyle = '#e5e7eb'; // border-neutral-200
    ctx.lineWidth = 4;
    ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);

    // 3. Header Branding Text
    ctx.fillStyle = '#000000';
    ctx.font = 'black 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('WOVN CLIENT PORTAL', canvas.width / 2, 75);

    ctx.fillStyle = '#6b7280'; // neutral-500
    ctx.font = 'bold 12px monospace';
    ctx.fillText('OFFICIAL DIGITAL ACCESS PASS', canvas.width / 2, 100);

    // 4. Customer Logo (if available) or Company Name
    const customerLogoUrl = customer.croppedLogo || customer.logo;
    let qrTopY = 220;

    if (customerLogoUrl) {
      try {
        const logoImg = new window.Image();
        logoImg.crossOrigin = 'anonymous';
        await new Promise((resolve, reject) => {
          logoImg.onload = resolve;
          logoImg.onerror = reject;
          logoImg.src = customerLogoUrl;
        });
        const maxH = 60;
        const scale = Math.min(180 / logoImg.width, maxH / logoImg.height);
        const w = logoImg.width * scale;
        const h = logoImg.height * scale;
        ctx.drawImage(logoImg, (canvas.width - w) / 2, 125, w, h);
        qrTopY = 210;
      } catch {
        ctx.fillStyle = '#111827';
        ctx.font = 'bold 22px sans-serif';
        ctx.fillText(companyName.toUpperCase(), canvas.width / 2, 150);
      }
    } else {
      ctx.fillStyle = '#111827';
      ctx.font = 'bold 24px sans-serif';
      ctx.fillText(companyName.toUpperCase(), canvas.width / 2, 150);
    }

    // 5. Draw QR Code
    const qrDataUrl = await QRCodeLib.toDataURL(portalUrl, {
      width: 320,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });

    const qrImg = new window.Image();
    await new Promise((resolve) => {
      qrImg.onload = resolve;
      qrImg.src = qrDataUrl;
    });

    // Draw QR code background box
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.08)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;
    ctx.fillRect((canvas.width - 340) / 2, qrTopY, 340, 340);
    ctx.shadowColor = 'transparent'; // reset shadow

    ctx.strokeStyle = '#f3f4f6';
    ctx.lineWidth = 2;
    ctx.strokeRect((canvas.width - 340) / 2, qrTopY, 340, 340);

    ctx.drawImage(qrImg, (canvas.width - 320) / 2, qrTopY + 10, 320, 320);

    // 6. Subheader Instructions below QR Code
    const textBaseY = qrTopY + 380;
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('SCAN TO OPEN CLIENT PORTAL', canvas.width / 2, textBaseY);

    ctx.fillStyle = '#4b5563';
    ctx.font = '13px monospace';
    ctx.fillText(portalUrl, canvas.width / 2, textBaseY + 28);

    // 7. Footer Notice
    ctx.fillStyle = '#9ca3af';
    ctx.font = '11px sans-serif';
    ctx.fillText('Instant Quote Requests • Real-Time Order Tracking • Proof Approvals', canvas.width / 2, canvas.height - 45);

    return canvas;
  };

  const handleDownloadQr = async () => {
    setIsGenerating(true);
    try {
      const canvas = await generateBrandedCanvas();
      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      const safeName = companyName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      a.download = `${safeName}_portal_qr.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error('Download QR Error:', err);
      alert('Could not generate download image.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyImage = async () => {
    setIsGenerating(true);
    try {
      const canvas = await generateBrandedCanvas();
      canvas.toBlob(async (blob) => {
        if (!blob) throw new Error('Blob creation failed');
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
          ]);
          setCopiedImage(true);
          setTimeout(() => setCopiedImage(false), 2500);
        } catch (clipErr) {
          console.error('Clipboard error:', clipErr);
          // Fallback to link copy
          handleCopyLink();
        }
      }, 'image/png');
    } catch (err) {
      console.error('Copy QR Image Error:', err);
      handleCopyLink();
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePrintCard = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${companyName} - Portal Access QR Card</title>
          <style>
            @media print {
              @page { size: portrait; margin: 0; }
              body { margin: 0; padding: 0; background: white; font-family: system-ui, -apple-system, sans-serif; }
            }
            body {
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              background: #f9fafb;
              font-family: system-ui, -apple-system, sans-serif;
            }
            .card {
              width: 3.5in;
              height: 5in;
              background: white;
              border: 2px solid #000;
              border-radius: 12px;
              padding: 24px;
              box-sizing: border-box;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: space-between;
              text-align: center;
            }
            .title { font-size: 16px; font-weight: 900; text-transform: uppercase; letter-spacing: -0.5px; }
            .subtitle { font-size: 9px; font-family: monospace; text-transform: uppercase; color: #6b7280; margin-top: 2px; }
            .company { font-size: 15px; font-weight: 700; margin-top: 12px; text-transform: uppercase; color: #111827; }
            .qr-box { padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px; margin: 12px 0; }
            .instruction { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #111827; }
            .url { font-size: 9px; font-family: monospace; color: #4b5563; word-break: break-all; margin-top: 4px; }
            .footer { font-size: 8px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 8px; }
          </style>
        </head>
        <body>
          <div class="card">
            <div>
              <div class="title">WOVN CLIENT PORTAL</div>
              <div class="subtitle">Official Access Pass</div>
              <div class="company">${companyName}</div>
            </div>
            <div class="qr-box">
              <img src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(portalUrl)}" width="180" height="180" />
            </div>
            <div>
              <div class="instruction">Scan to Open Client Portal</div>
              <div class="url">${portalUrl}</div>
              <div class="footer">Quotes • Tracking • Approvals</div>
            </div>
          </div>
          <script>
            window.onload = () => {
              setTimeout(() => {
                window.print();
              }, 400);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white border border-neutral-200 rounded-3xl max-w-md w-full overflow-hidden shadow-2xl flex flex-col">
        {/* Modal Header */}
        <div className="p-5 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-neutral-900 text-white flex items-center justify-center shadow-sm">
              <QrCode size={20} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-900 leading-tight">Client Portal QR Code</h3>
              <p className="text-[11px] text-neutral-500 font-medium truncate max-w-[240px]">{companyName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-neutral-100 hover:bg-neutral-200 text-neutral-600 flex items-center justify-center transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body: QR Preview Card */}
        <div className="p-6 flex flex-col items-center justify-center bg-neutral-50/40">
          <div className="w-full bg-white border border-neutral-200 rounded-2xl p-6 shadow-md flex flex-col items-center text-center relative group">
            {/* Header / Logo */}
            {customer.croppedLogo || customer.logo ? (
              <img
                src={customer.croppedLogo || customer.logo}
                alt={companyName}
                className="max-h-12 object-contain mb-2"
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-neutral-100 border border-neutral-200 flex items-center justify-center text-neutral-700 mb-2">
                <Building2 size={24} />
              </div>
            )}

            <div className="text-base font-bold text-neutral-900 uppercase tracking-tight truncate max-w-full">
              {companyName}
            </div>
            <div className="text-[10px] font-mono tracking-widest uppercase text-neutral-400 mb-4">
              CLIENT PORTAL ACCESS
            </div>

            {/* QR Code Container */}
            <div className="p-4 bg-white rounded-xl border-2 border-neutral-900 shadow-sm transition-transform group-hover:scale-[1.02]">
              <QRCode
                value={portalUrl}
                size={190}
                level="H"
                bgColor="#ffffff"
                fgColor="#000000"
                style={{ width: "100%", maxWidth: "190px", height: "auto" }}
              />
            </div>

            {/* Subtext Instructions */}
            <div className="mt-4 text-xs font-bold text-neutral-900 uppercase tracking-wide">
              Scan to Access Client Portal
            </div>

            {/* Target URL */}
            <div className="mt-1 flex items-center gap-1 bg-neutral-100 border border-neutral-200 rounded-lg px-2.5 py-1 text-[10px] font-mono text-neutral-600 max-w-full truncate">
              <span className="truncate">{portalUrl}</span>
              <a
                href={portalUrl}
                target="_blank"
                rel="noreferrer"
                className="text-neutral-900 hover:text-blue-600 transition-colors shrink-0 ml-1"
                title="Open Portal URL"
              >
                <ExternalLink size={12} />
              </a>
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="p-5 border-t border-neutral-100 bg-white flex flex-col gap-2.5">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleCopyLink}
              className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                copiedLink
                  ? 'border-emerald-600 bg-emerald-600 text-white'
                  : 'border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50'
              }`}
            >
              {copiedLink ? <Check size={14} /> : <Copy size={14} />}
              {copiedLink ? 'Link Copied!' : 'Copy Portal Link'}
            </button>

            <button
              onClick={handleCopyImage}
              disabled={isGenerating}
              className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                copiedImage
                  ? 'border-emerald-600 bg-emerald-600 text-white'
                  : 'border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50'
              }`}
            >
              {copiedImage ? <Check size={14} /> : <Share2 size={14} />}
              {copiedImage ? 'Image Copied!' : 'Copy QR Image'}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleDownloadQr}
              disabled={isGenerating}
              className="py-2.5 px-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-sm disabled:opacity-50"
            >
              <Download size={14} />
              Download QR Image
            </button>

            <button
              onClick={handlePrintCard}
              className="py-2.5 px-3 rounded-xl border border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50 text-xs font-bold flex items-center justify-center gap-2 transition-all"
            >
              <Printer size={14} />
              Print Pass Card
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
