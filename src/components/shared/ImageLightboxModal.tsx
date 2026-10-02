import React, { useState, useEffect } from 'react';
import { X, Download, Copy, Check, Loader2, Sparkles } from 'lucide-react';
import { downloadImageAsPng, copyImageAsPngToClipboard, loadImageWithCors } from '../../lib/imageDownloadUtils';

export interface ImageLightboxModalProps {
  src: string | null;
  alt?: string;
  orderNumber?: string | number;
  itemStyle?: string;
  onClose: () => void;
}

export const ImageLightboxModal: React.FC<ImageLightboxModalProps> = ({
  src,
  alt = 'Image Preview',
  orderNumber,
  itemStyle,
  onClose,
}) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [imageDims, setImageDims] = useState<{ width: number; height: number } | null>(null);
  const [showOptions, setShowOptions] = useState(false);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Preload to detect natural dimensions
  useEffect(() => {
    if (!src) return;
    let isMounted = true;
    loadImageWithCors(src)
      .then((img) => {
        if (isMounted) {
          setImageDims({
            width: img.naturalWidth || img.width,
            height: img.naturalHeight || img.height,
          });
        }
      })
      .catch(() => {
        // Fallback or ignore if dims cannot be probed
      });
    return () => {
      isMounted = false;
    };
  }, [src]);

  if (!src) return null;

  const generateFilename = (suffix = 'FullSize') => {
    const parts = [];
    if (orderNumber) parts.push(`Order_${orderNumber}`);
    const styleOrAlt = itemStyle || alt;
    if (styleOrAlt && styleOrAlt !== 'Image Preview') {
      parts.push(styleOrAlt.replace(/[^a-zA-Z0-9_-]/g, '_'));
    } else {
      parts.push('Mockup');
    }
    parts.push(suffix);
    return `${parts.join('_')}.png`;
  };

  const handleDownload = async (upscale = 1, suffix = 'FullSize') => {
    if (!src || isDownloading) return;
    setIsDownloading(true);
    setDownloadSuccess(false);
    try {
      // Guarantee minimum 2400px resolution on largest edge if 1x, or 2x upscale if requested
      const filename = generateFilename(suffix);
      await downloadImageAsPng(src, filename, {
        upscale,
        minDimension: upscale > 1 ? undefined : 2400,
      });
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 3000);
    } catch (err) {
      console.error('Download PNG failed:', err);
      alert('Failed to download image as PNG. Please try again.');
    } finally {
      setIsDownloading(false);
      setShowOptions(false);
    }
  };

  const handleCopy = async () => {
    if (!src || isCopying) return;
    setIsCopying(true);
    setCopySuccess(false);
    try {
      await copyImageAsPngToClipboard(src, { minDimension: 2400 });
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 3000);
    } catch (err) {
      console.error('Copy PNG failed:', err);
      alert('Could not copy image to clipboard in this browser.');
    } finally {
      setIsCopying(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black/85 backdrop-blur-md p-4 md:p-8 animate-in fade-in duration-200 select-none"
      onClick={onClose}
    >
      {/* Top Floating Action Toolbar */}
      <div
        className="w-full max-w-4xl flex items-center justify-between mb-3 z-50 px-2"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left: Title & Live Dimensions */}
        <div className="flex items-center gap-3 text-white">
          <div className="flex flex-col">
            <span className="font-extrabold text-sm md:text-base tracking-wide text-neutral-100 truncate max-w-xs md:max-w-md">
              {alt || itemStyle || 'Garment Mockup'}
            </span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider bg-white/10 text-neutral-300 px-2 py-0.5 rounded-full border border-white/10">
                PNG Format
              </span>
              {imageDims && (
                <span className="text-[11px] font-semibold text-neutral-400">
                  {imageDims.width} × {imageDims.height} px
                  {Math.max(imageDims.width, imageDims.height) >= 2000 && (
                    <span className="text-emerald-400 ml-1.5 font-bold">• High-Res</span>
                  )}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: Actions & Close */}
        <div className="flex items-center gap-2 relative">
          {/* Copy Button */}
          <button
            type="button"
            onClick={handleCopy}
            disabled={isCopying}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 text-white border border-white/15 backdrop-blur-sm transition-all cursor-pointer shadow-lg active:scale-95"
            title="Copy transparent PNG to clipboard"
          >
            {isCopying ? (
              <Loader2 size={15} className="animate-spin text-white" />
            ) : copySuccess ? (
              <>
                <Check size={15} className="text-emerald-400" />
                <span className="text-emerald-400 hidden sm:inline">Copied!</span>
              </>
            ) : (
              <>
                <Copy size={15} />
                <span className="hidden sm:inline">Copy PNG</span>
              </>
            )}
          </button>

          {/* Primary Download Button */}
          <div className="relative flex items-center">
            <button
              type="button"
              onClick={() => handleDownload(1, 'FullSize')}
              disabled={isDownloading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-neutral-950 transition-all cursor-pointer shadow-xl shadow-emerald-950/40"
              title="Download full-size transparent PNG (High Resolution)"
            >
              {isDownloading ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  <span>Exporting...</span>
                </>
              ) : downloadSuccess ? (
                <>
                  <Check size={15} className="text-neutral-950" strokeWidth={3} />
                  <span>Downloaded!</span>
                </>
              ) : (
                <>
                  <Download size={15} strokeWidth={2.5} />
                  <span>Download PNG</span>
                </>
              )}
            </button>

            {/* Extra Options Dropdown Toggle (e.g. 4K Ultra Large) */}
            <button
              type="button"
              onClick={() => setShowOptions(!showOptions)}
              className="ml-1 p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/15 transition-all cursor-pointer"
              title="More export sizes"
            >
              <Sparkles size={15} />
            </button>

            {showOptions && (
              <div
                className="absolute right-0 top-full mt-2 w-56 bg-neutral-900 border border-neutral-700/80 rounded-2xl shadow-2xl p-2 z-50 flex flex-col gap-1 animate-in fade-in zoom-in-95 duration-150"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 px-3 py-1.5 border-b border-neutral-800">
                  Export Options
                </div>
                <button
                  type="button"
                  onClick={() => handleDownload(1, 'FullSize')}
                  className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-neutral-200 hover:bg-neutral-800 hover:text-white text-left transition-colors cursor-pointer"
                >
                  <div className="flex flex-col">
                    <span className="font-bold">Full Size (Native)</span>
                    <span className="text-[10px] text-neutral-400">Crisp transparent PNG</span>
                  </div>
                  <Download size={13} className="text-neutral-400" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDownload(2, 'Ultra4K')}
                  className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-emerald-400 hover:bg-neutral-800 text-left transition-colors cursor-pointer"
                >
                  <div className="flex flex-col">
                    <span className="font-bold flex items-center gap-1">
                      Ultra 4K PNG <Sparkles size={11} />
                    </span>
                    <span className="text-[10px] text-neutral-400">2× super-resolution export</span>
                  </div>
                  <Download size={13} className="text-emerald-400" />
                </button>
              </div>
            )}
          </div>

          {/* Close Button */}
          <button
            type="button"
            className="p-2 ml-1 text-neutral-400 hover:text-white hover:bg-white/10 rounded-full transition-all cursor-pointer"
            onClick={onClose}
            title="Close (Esc)"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Main Image Card with Checkerboard Texture */}
      <div
        className="relative max-w-4xl max-h-[82vh] w-full bg-checkerboard rounded-[2rem] p-6 md:p-10 shadow-2xl overflow-hidden flex items-center justify-center border border-white/10 cursor-crosshair animate-in zoom-in-95 duration-200 group"
        onClick={(e) => e.stopPropagation()}
        onMouseMove={(e) => {
          const { left, top, width, height } = e.currentTarget.getBoundingClientRect();
          const x = (e.clientX - left) / width;
          const y = (e.clientY - top) / height;
          const img = e.currentTarget.querySelector('img');
          if (img) img.style.transformOrigin = `${x * 100}% ${y * 100}%`;
        }}
        title="Hover to zoom"
      >
        <img
          src={src}
          alt={alt}
          style={{ width: 'auto', height: 'auto', maxWidth: '100%', maxHeight: '68vh' }}
          className="rounded-2xl select-none transition-transform duration-200 ease-out hover:scale-[2]"
        />

        {/* Floating Quick Download Badge on Bottom Corner of Card */}
        <div className="absolute bottom-4 right-4 pointer-events-auto">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleDownload(1, 'FullSize');
            }}
            disabled={isDownloading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold bg-black/75 hover:bg-black text-white backdrop-blur-md border border-white/20 shadow-lg transition-all opacity-80 hover:opacity-100 cursor-pointer"
            title="Download full size PNG"
          >
            {isDownloading ? (
              <Loader2 size={12} className="animate-spin text-emerald-400" />
            ) : (
              <Download size={12} className="text-emerald-400" />
            )}
            <span>Save PNG</span>
          </button>
        </div>
      </div>

      {/* Helpful Hint on Footer */}
      <div className="mt-2 text-neutral-400 text-[11px] font-medium flex items-center gap-2">
        <span>Hover image to zoom 2×</span>
        <span>•</span>
        <span>Transparent PNG background preserved</span>
      </div>
    </div>
  );
};
