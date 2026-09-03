import { useState, useRef } from 'react';
import QRCode from 'react-qr-code';
import QRCodeLib from 'qrcode';
import FileSaver from 'file-saver';
import { 
  QrCode, 
  Download, 
  Share2, 
  Copy, 
  Check, 
  ExternalLink, 
  Printer, 
  Globe, 
  CheckCircle2,
  FileCode2,
  Sliders
} from 'lucide-react';

const PRESETS = [
  { label: 'Main Website', url: 'https://inktheory.studio', desc: 'Official Homepage' },
  { label: 'Brand Shop', url: 'https://inktheory.studio/shop', desc: 'Online Storefront & Catalog' },
  { label: 'Quote Request', url: 'https://inktheory.studio/quote', desc: 'Instant Quote Form' },
];

export function StudioQrTab() {
  const [url, setUrl] = useState('https://inktheory.studio');
  const [theme, setTheme] = useState<'classic' | 'dark' | 'minimal'>('classic');
  const [showBranding, setShowBranding] = useState(true);
  const [showFooter, setShowFooter] = useState(true);
  
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedImage, setCopiedImage] = useState(false);
  const [isExporting, setIsExporting] = useState<string | null>(null);
  
  const previewRef = useRef<HTMLDivElement>(null);

  // Copy link
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  // Generate high-resolution canvas for the branded card
  const generateBrandedCanvas = async (): Promise<HTMLCanvasElement | null> => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const width = 1200;
    const height = 1500;
    canvas.width = width;
    canvas.height = height;

    const isDark = theme === 'dark';
    const bgColor = isDark ? '#0f0f11' : '#ffffff';
    const cardBorderColor = isDark ? '#27272a' : '#e4e4e7';
    const textColor = isDark ? '#ffffff' : '#09090b';
    const subtextColor = isDark ? '#a1a1aa' : '#71717a';

    // 1. Background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);

    // Decorative inner border
    ctx.strokeStyle = cardBorderColor;
    ctx.lineWidth = 4;
    ctx.strokeRect(40, 40, width - 80, height - 80);

    // 2. Branding Header
    let currentY = 110;
    if (showBranding) {
      let logoDrawn = false;
      try {
        const logoImg = new Image();
        logoImg.crossOrigin = 'anonymous';
        await new Promise((resolve, reject) => {
          logoImg.onload = resolve;
          logoImg.onerror = reject;
          logoImg.src = '/images/inktheory_brand_logo.png';
        });
        const maxLogoW = 380;
        const maxLogoH = 130;
        const scale = Math.min(maxLogoW / logoImg.width, maxLogoH / logoImg.height);
        const logoW = logoImg.width * scale;
        const logoH = logoImg.height * scale;
        ctx.drawImage(logoImg, (width - logoW) / 2, currentY, logoW, logoH);
        logoDrawn = true;
        currentY += logoH + 25;
      } catch {
        // fallback to text header
      }

      if (!logoDrawn) {
        ctx.fillStyle = textColor;
        ctx.font = '900 48px sans-serif';
        ctx.textAlign = 'center';
        ctx.letterSpacing = '6px';
        ctx.fillText('INK THEORY STUDIO', width / 2, currentY + 45);

        ctx.fillStyle = subtextColor;
        ctx.font = '700 18px sans-serif';
        ctx.letterSpacing = '4px';
        ctx.fillText('CUSTOM APPAREL & PRINTING', width / 2, currentY + 85);
        currentY += 120;
      } else {
        ctx.fillStyle = subtextColor;
        ctx.font = '700 18px sans-serif';
        ctx.textAlign = 'center';
        ctx.letterSpacing = '4px';
        ctx.fillText('CUSTOM APPAREL & PRINTING', width / 2, currentY);
        currentY += 45;
      }
    } else {
      currentY += 50;
    }

    // 3. QR Code Box
    const qrSize = 620;
    const boxPadding = 40;
    const boxSize = qrSize + (boxPadding * 2);
    const qrBoxX = (width - boxSize) / 2;
    const qrBoxY = currentY + 20;

    // Draw white container for QR code
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.08)';
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 15;
    ctx.fillRect(qrBoxX, qrBoxY, boxSize, boxSize);
    ctx.shadowColor = 'transparent';

    ctx.strokeStyle = isDark ? '#27272a' : '#f4f4f5';
    ctx.lineWidth = 3;
    ctx.strokeRect(qrBoxX, qrBoxY, boxSize, boxSize);

    // Generate high-resolution QR
    const qrDataUrl = await QRCodeLib.toDataURL(url, {
      width: qrSize,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#ffffff'
      },
      errorCorrectionLevel: 'H'
    });

    const qrImage = new Image();
    await new Promise((resolve) => {
      qrImage.onload = resolve;
      qrImage.src = qrDataUrl;
    });

    ctx.drawImage(qrImage, qrBoxX + boxPadding, qrBoxY + boxPadding, qrSize, qrSize);

    // 4. Instructions below QR
    const textBaseY = qrBoxY + boxSize + 65;
    ctx.fillStyle = textColor;
    ctx.font = '900 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.letterSpacing = '2px';
    ctx.fillText('SCAN TO VISIT INKTHEORY.STUDIO', width / 2, textBaseY);

    ctx.fillStyle = isDark ? '#38bdf8' : '#0284c7';
    ctx.font = '600 20px monospace';
    ctx.fillText(url.replace(/^https?:\/\//, ''), width / 2, textBaseY + 38);

    // 5. Footer Notice
    if (showFooter) {
      ctx.fillStyle = isDark ? '#52525b' : '#a1a1aa';
      ctx.font = '600 15px sans-serif';
      ctx.letterSpacing = '1px';
      ctx.fillText('Screen Printing • Embroidery • DTF • Custom Merchandise', width / 2, height - 70);
    }

    return canvas;
  };

  // Download high-res branded card PNG
  const handleDownloadBrandedPng = async () => {
    setIsExporting('branded');
    try {
      const canvas = await generateBrandedCanvas();
      if (!canvas) return;
      canvas.toBlob((blob) => {
        if (blob) {
          FileSaver.saveAs(blob, 'inktheory-studio-qr-card.png');
        }
      }, 'image/png');
    } catch (e) {
      console.error(e);
    } finally {
      setIsExporting(null);
    }
  };

  // Download clean standalone QR code
  const handleDownloadCleanPng = async (isTransparent = false) => {
    setIsExporting(isTransparent ? 'clean-trans' : 'clean-white');
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 1024;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      if (!isTransparent) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 1024, 1024);
      }

      const qrDataUrl = await QRCodeLib.toDataURL(url, {
        width: 960,
        margin: 1,
        color: {
          dark: '#000000',
          light: isTransparent ? '#00000000' : '#ffffff'
        },
        errorCorrectionLevel: 'H'
      });

      const qrImage = new Image();
      await new Promise(resolve => {
        qrImage.onload = resolve;
        qrImage.src = qrDataUrl;
      });

      ctx.drawImage(qrImage, 32, 32, 960, 960);
      canvas.toBlob((blob) => {
        if (blob) {
          FileSaver.saveAs(blob, isTransparent ? 'inktheory-qr-transparent.png' : 'inktheory-qr-code.png');
        }
      }, 'image/png');
    } catch (e) {
      console.error(e);
    } finally {
      setIsExporting(null);
    }
  };

  // Download SVG
  const handleDownloadSvg = async () => {
    setIsExporting('svg');
    try {
      const svgString = await QRCodeLib.toString(url, {
        type: 'svg',
        width: 1024,
        margin: 1,
        errorCorrectionLevel: 'H'
      });
      const blob = new Blob([svgString], { type: 'image/svg+xml' });
      FileSaver.saveAs(blob, 'inktheory-qr-code.svg');
    } catch (e) {
      console.error(e);
    } finally {
      setIsExporting(null);
    }
  };

  // Copy Image directly to clipboard
  const handleCopyImage = async () => {
    setIsExporting('copy');
    try {
      const canvas = await generateBrandedCanvas();
      if (!canvas) return;
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        try {
          // @ts-ignore
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
          ]);
          setCopiedImage(true);
          setTimeout(() => setCopiedImage(false), 2500);
        } catch (err) {
          console.warn('ClipboardItem error, falling back to download:', err);
          FileSaver.saveAs(blob, 'inktheory-studio-qr-card.png');
        }
      }, 'image/png');
    } catch (e) {
      console.error(e);
    } finally {
      setIsExporting(null);
    }
  };

  // Share via Web Share API
  const handleShare = async () => {
    setIsExporting('share');
    try {
      const canvas = await generateBrandedCanvas();
      if (!canvas) return;
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], 'inktheory-studio-qr.png', { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              title: 'Ink Theory Studio QR Code',
              text: `Visit Ink Theory Studio: ${url}`,
              files: [file]
            });
          } catch (err: any) {
            if (err.name !== 'AbortError') console.error(err);
          }
        } else {
          // Fallback
          await navigator.clipboard.writeText(url);
          setCopiedUrl(true);
          setTimeout(() => setCopiedUrl(false), 2000);
        }
      }, 'image/png');
    } catch (e) {
      console.error(e);
    } finally {
      setIsExporting(null);
    }
  };

  // Print Sign / Flyer
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-brand-border">
        <div>
          <h2 className="text-xl font-serif text-brand-primary flex items-center gap-2">
            <QrCode className="text-brand-primary" size={22} />
            Ink Theory Studio QR Code
          </h2>
          <p className="text-xs font-medium text-brand-secondary mt-1">
            Generate, preview, customize, download, and share high-resolution QR codes for inktheory.studio.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCopyLink}
            className="px-3.5 py-1.5 text-xs font-bold rounded-xl border border-brand-border bg-white hover:bg-neutral-50 text-brand-primary transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            {copiedUrl ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
            <span>{copiedUrl ? 'Copied Link!' : 'Copy Link'}</span>
          </button>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-black hover:bg-neutral-800 text-white transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <ExternalLink size={14} />
            <span>Open Link</span>
          </a>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
        {/* Left Column: Interactive QR Card Preview */}
        <div className="xl:col-span-5 flex flex-col items-center">
          <div className="w-full max-w-sm">
            {/* The Branded Preview Card */}
            <div
              ref={previewRef}
              className={`w-full rounded-3xl p-7 border transition-all duration-300 shadow-xl flex flex-col items-center text-center relative overflow-hidden ${
                theme === 'dark' 
                  ? 'bg-[#0f0f11] border-neutral-800 text-white' 
                  : 'bg-white border-neutral-200 text-neutral-900'
              }`}
            >
              {/* Card Header / Branding */}
              {showBranding && (
                <div className="mb-6 flex flex-col items-center">
                  <img 
                    src="/images/inktheory_brand_logo.png" 
                    alt="Ink Theory" 
                    className={`h-12 w-auto object-contain mb-2 ${theme === 'dark' ? 'brightness-125' : ''}`}
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                  <h3 className="font-black text-lg tracking-widest uppercase">Ink Theory Studio</h3>
                  <p className={`text-[10px] font-bold tracking-widest uppercase mt-0.5 ${theme === 'dark' ? 'text-neutral-400' : 'text-neutral-500'}`}>
                    Custom Apparel & Printing
                  </p>
                </div>
              )}

              {/* QR Code Container */}
              <div className="p-4 bg-white rounded-2xl shadow-md border border-neutral-100 flex items-center justify-center">
                <QRCode
                  value={url}
                  size={200}
                  level="H"
                  style={{ height: 'auto', maxWidth: '100%', width: '100%' }}
                  viewBox="0 0 256 256"
                />
              </div>

              {/* Instruction Prompt */}
              <div className="mt-6">
                <p className="font-extrabold text-xs tracking-wider uppercase">
                  Scan to visit inktheory.studio
                </p>
                <p className={`text-[11px] font-mono mt-1 truncate max-w-xs ${theme === 'dark' ? 'text-sky-400' : 'text-sky-600'}`}>
                  {url.replace(/^https?:\/\//, '')}
                </p>
              </div>

              {/* Footer Tagline */}
              {showFooter && (
                <div className="mt-6 pt-4 border-t border-neutral-200/40 w-full">
                  <p className={`text-[9px] font-bold uppercase tracking-wider ${theme === 'dark' ? 'text-neutral-500' : 'text-neutral-400'}`}>
                    Screen Printing • Embroidery • DTF
                  </p>
                </div>
              )}
            </div>

            {/* Quick Action Buttons directly below preview */}
            <div className="grid grid-cols-2 gap-2.5 mt-4">
              <button
                type="button"
                onClick={handleCopyImage}
                disabled={isExporting !== null}
                className="w-full py-2.5 px-3 bg-white hover:bg-neutral-50 text-brand-primary border border-brand-border rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-2xs cursor-pointer"
              >
                {copiedImage ? (
                  <>
                    <CheckCircle2 size={15} className="text-emerald-600" />
                    <span>Copied Image!</span>
                  </>
                ) : (
                  <>
                    <Copy size={15} />
                    <span>Copy to Clipboard</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleShare}
                disabled={isExporting !== null}
                className="w-full py-2.5 px-3 bg-white hover:bg-neutral-50 text-brand-primary border border-brand-border rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-2xs cursor-pointer"
              >
                <Share2 size={15} />
                <span>Share Image</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Customization, Presets & Export Actions */}
        <div className="xl:col-span-7 space-y-6">
          {/* Section 1: Target Destination URL */}
          <div className="bg-white border border-brand-border rounded-2xl p-5 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-brand-secondary flex items-center gap-1.5">
                <Globe size={14} className="text-brand-primary" /> Target Destination URL
              </label>
              <span className="text-[11px] text-brand-secondary font-medium">Scans immediately redirect here</span>
            </div>

            <div className="relative">
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://inktheory.studio"
                className="w-full bg-neutral-50 border border-brand-border rounded-xl px-4 py-2.5 text-xs font-medium font-mono text-brand-primary focus:bg-white focus:outline-none focus:border-brand-primary transition-all"
              />
            </div>

            {/* URL Presets */}
            <div className="pt-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block mb-2">Quick Presets</span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.url}
                    type="button"
                    onClick={() => setUrl(preset.url)}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      url === preset.url
                        ? 'border-brand-primary bg-neutral-900 text-white shadow-xs'
                        : 'border-brand-border bg-neutral-50/50 hover:bg-neutral-100/80 text-brand-primary'
                    }`}
                  >
                    <p className="text-xs font-bold">{preset.label}</p>
                    <p className={`text-[10px] truncate mt-0.5 ${url === preset.url ? 'text-neutral-300' : 'text-neutral-500'}`}>
                      {preset.desc}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Section 2: Card Customization & Styling */}
          <div className="bg-white border border-brand-border rounded-2xl p-5 shadow-2xs space-y-4">
            <label className="text-xs font-bold uppercase tracking-wider text-brand-secondary flex items-center gap-1.5">
              <Sliders size={14} className="text-brand-primary" /> Card Style & Appearance
            </label>

            {/* Theme Selector */}
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setTheme('classic')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  theme === 'classic'
                    ? 'border-brand-primary bg-neutral-100 text-brand-primary ring-2 ring-neutral-900'
                    : 'border-brand-border bg-white text-brand-secondary hover:bg-neutral-50'
                }`}
              >
                <div className="w-3 h-3 rounded-full bg-white border border-neutral-300"></div>
                <span>Classic Light</span>
              </button>

              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  theme === 'dark'
                    ? 'border-neutral-900 bg-neutral-900 text-white ring-2 ring-neutral-900'
                    : 'border-brand-border bg-white text-brand-secondary hover:bg-neutral-50'
                }`}
              >
                <div className="w-3 h-3 rounded-full bg-neutral-900 border border-neutral-700"></div>
                <span>Dark Luxury</span>
              </button>

              <button
                type="button"
                onClick={() => setTheme('minimal')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  theme === 'minimal'
                    ? 'border-brand-primary bg-neutral-100 text-brand-primary ring-2 ring-neutral-900'
                    : 'border-brand-border bg-white text-brand-secondary hover:bg-neutral-50'
                }`}
              >
                <div className="w-3 h-3 rounded-full bg-neutral-200"></div>
                <span>Minimalist</span>
              </button>
            </div>

            {/* Card Elements Toggles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <label className="flex items-center gap-2.5 p-3 rounded-xl border border-neutral-100 bg-neutral-50/60 cursor-pointer hover:bg-neutral-50">
                <input
                  type="checkbox"
                  checked={showBranding}
                  onChange={(e) => setShowBranding(e.target.checked)}
                  className="rounded text-brand-primary focus:ring-brand-primary w-4 h-4 cursor-pointer"
                />
                <span className="text-xs font-bold text-brand-primary">Include Studio Logo & Header</span>
              </label>

              <label className="flex items-center gap-2.5 p-3 rounded-xl border border-neutral-100 bg-neutral-50/60 cursor-pointer hover:bg-neutral-50">
                <input
                  type="checkbox"
                  checked={showFooter}
                  onChange={(e) => setShowFooter(e.target.checked)}
                  className="rounded text-brand-primary focus:ring-brand-primary w-4 h-4 cursor-pointer"
                />
                <span className="text-xs font-bold text-brand-primary">Include Services Tagline</span>
              </label>
            </div>
          </div>

          {/* Section 3: High-Resolution Download Options */}
          <div className="bg-white border border-brand-border rounded-2xl p-5 shadow-2xs space-y-4">
            <label className="text-xs font-bold uppercase tracking-wider text-brand-secondary flex items-center gap-1.5">
              <Download size={14} className="text-brand-primary" /> Download & Print Formats
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Option 1: Full Branded Card PNG */}
              <div className="p-4 rounded-2xl border border-brand-border hover:border-brand-primary bg-neutral-50/40 hover:bg-white transition-all flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="font-bold text-sm text-brand-primary">Branded Card (PNG)</h4>
                    <span className="text-[10px] font-mono font-bold bg-neutral-200/70 text-neutral-700 px-1.5 py-0.5 rounded">1200 × 1500</span>
                  </div>
                  <p className="text-[11px] text-brand-secondary mb-3">
                    Complete promotional graphic with logo, custom frame, and URL. Ready for social media, print cards, and flyers.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadBrandedPng}
                  disabled={isExporting !== null}
                  className="w-full py-2 px-3 bg-black hover:bg-neutral-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-2xs"
                >
                  <Download size={14} />
                  <span>{isExporting === 'branded' ? 'Generating...' : 'Download Card PNG'}</span>
                </button>
              </div>

              {/* Option 2: Clean Standalone QR PNG */}
              <div className="p-4 rounded-2xl border border-brand-border hover:border-brand-primary bg-neutral-50/40 hover:bg-white transition-all flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="font-bold text-sm text-brand-primary">Clean QR Code (PNG)</h4>
                    <span className="text-[10px] font-mono font-bold bg-neutral-200/70 text-neutral-700 px-1.5 py-0.5 rounded">1024 × 1024</span>
                  </div>
                  <p className="text-[11px] text-brand-secondary mb-3">
                    Crisp isolated QR code without text or borders. Perfect for apparel tags, packaging, stickers, and Figma.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleDownloadCleanPng(false)}
                    disabled={isExporting !== null}
                    className="py-2 px-2 bg-white hover:bg-neutral-100 text-brand-primary border border-brand-border rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                  >
                    <Download size={13} />
                    <span>White BG</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadCleanPng(true)}
                    disabled={isExporting !== null}
                    className="py-2 px-2 bg-white hover:bg-neutral-100 text-brand-primary border border-brand-border rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                  >
                    <Download size={13} />
                    <span>Transparent</span>
                  </button>
                </div>
              </div>

              {/* Option 3: Vector SVG */}
              <div className="p-4 rounded-2xl border border-brand-border hover:border-brand-primary bg-neutral-50/40 hover:bg-white transition-all flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="font-bold text-sm text-brand-primary">Vector QR (SVG)</h4>
                    <span className="text-[10px] font-mono font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">Vector</span>
                  </div>
                  <p className="text-[11px] text-brand-secondary mb-3">
                    Infinitely scalable vector format for Adobe Illustrator, vinyl plotters, embroidery software, and large signage.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadSvg}
                  disabled={isExporting !== null}
                  className="w-full py-2 px-3 bg-white hover:bg-neutral-100 text-brand-primary border border-brand-border rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-2xs"
                >
                  <FileCode2 size={14} />
                  <span>Download SVG</span>
                </button>
              </div>

              {/* Option 4: Print Counter Sign */}
              <div className="p-4 rounded-2xl border border-brand-border hover:border-brand-primary bg-neutral-50/40 hover:bg-white transition-all flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="font-bold text-sm text-brand-primary">Print Sign / Stand</h4>
                    <span className="text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">8.5 × 11 / 4 × 6</span>
                  </div>
                  <p className="text-[11px] text-brand-secondary mb-3">
                    Print-ready layout for counter display tents, pop-up events, trade show booths, or showroom tables.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="w-full py-2 px-3 bg-white hover:bg-neutral-100 text-brand-primary border border-brand-border rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-2xs"
                >
                  <Printer size={14} />
                  <span>Print Display Sign</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
