import React, { useState, useEffect, useMemo } from 'react';
import { X, Download, Copy, Check, Loader2, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react';
import { downloadImageAsPng, copyImageAsPngToClipboard, loadImageWithCors } from '../../lib/imageDownloadUtils';

export interface LightboxImageItem {
  src: string;
  alt?: string;
  label?: string;
}

export interface ImageLightboxModalProps {
  src?: string | null;
  alt?: string;
  orderNumber?: string | number;
  itemStyle?: string;
  item?: any;
  images?: (string | LightboxImageItem)[];
  initialIndex?: number;
  onClose: () => void;
}

/**
 * Extracts all uploads, mockups, artwork, logos, and reference photos for a line item.
 */
export const getItemUploads = (item: any): LightboxImageItem[] => {
  if (!item) return [];
  const uploads: LightboxImageItem[] = [];
  const seenUrls = new Set<string>();

  const addUpload = (url: any, label: string) => {
    if (!url || typeof url !== 'string' || !url.trim()) return;
    const cleanUrl = url.trim();
    if (seenUrls.has(cleanUrl)) return;
    seenUrls.add(cleanUrl);
    uploads.push({
      src: cleanUrl,
      alt: `${item.style || item.title || 'Item'} - ${label}`,
      label,
    });
  };

  // 1. Customized mockups & primary visuals
  if (item.customizedFrontImage) {
    addUpload(item.customizedFrontImage, 'Front Mockup');
  }
  if (item.image) {
    addUpload(item.image, item.customizedFrontImage ? 'Main Preview' : 'Front Mockup');
  }
  if (item.customizedBackImage) {
    addUpload(item.customizedBackImage, 'Back Mockup');
  }
  if (item.customizedSleeveImage) {
    addUpload(item.customizedSleeveImage, 'Sleeve Mockup');
  }
  if (item.compiledTagMockupUrl || item.customizedTagImage) {
    addUpload(item.compiledTagMockupUrl || item.customizedTagImage, 'Neck Tag Mockup');
  }

  // 2. Logos & Artwork placements
  if (item.logoUrlFront || item.logoUrl) {
    addUpload(item.logoUrlFront || item.logoUrl, item.logoName || 'Front Artwork');
  }
  if (item.logoUrlBack) {
    addUpload(item.logoUrlBack, item.logoNameBack || 'Back Artwork');
  }
  if (item.logoUrlLeftSleeve) {
    addUpload(item.logoUrlLeftSleeve, item.logoNameLeftSleeve || 'Left Sleeve Artwork');
  }
  if (item.logoUrlRightSleeve) {
    addUpload(item.logoUrlRightSleeve, item.logoNameRightSleeve || 'Right Sleeve Artwork');
  }
  if (item.logoUrlTag) {
    addUpload(item.logoUrlTag, 'Neck Tag Artwork');
  }
  if (item.originalSheetUrl) {
    addUpload(item.originalSheetUrl, 'Gang Sheet Artwork');
  }
  if (item.artworkUrl) {
    addUpload(item.artworkUrl, 'Artwork File');
  }

  // 3. Artworks array (individual artwork items or gang sheet files)
  if (Array.isArray(item.artworks)) {
    item.artworks.forEach((art: any, i: number) => {
      const artUrl = art?.url || art?.imageUrl || art?.originalUrl;
      const artName = art?.name || `Artwork ${i + 1}`;
      addUpload(artUrl, artName);
    });
  }

  // 4. Reference images uploaded by customer/admin
  if (Array.isArray(item.referenceImages)) {
    item.referenceImages.forEach((refUrl: string, i: number) => {
      addUpload(refUrl, `Reference Image ${i + 1}`);
    });
  }

  // 5. Multi-angle / color mockups
  if (item.mockupImages && typeof item.mockupImages === 'object') {
    if (Array.isArray(item.mockupImages)) {
      item.mockupImages.forEach((img: any, i: number) => {
        const u = typeof img === 'string' ? img : img?.url || img?.front;
        addUpload(u, `Mockup ${i + 1}`);
      });
    } else {
      Object.entries(item.mockupImages).forEach(([key, val]: [string, any]) => {
        const u = typeof val === 'string' ? val : val?.front || val?.url;
        addUpload(u, `${key} Mockup`);
      });
    }
  }

  // 6. Blank garment references if provided
  if (item.originalFrontImage) {
    addUpload(item.originalFrontImage, 'Blank Front');
  }
  if (item.originalBackImage) {
    addUpload(item.originalBackImage, 'Blank Back');
  }
  if (item.originalSleeveImage) {
    addUpload(item.originalSleeveImage, 'Blank Sleeve');
  }

  return uploads;
};

export const ImageLightboxModal: React.FC<ImageLightboxModalProps> = ({
  src,
  alt = 'Image Preview',
  orderNumber,
  itemStyle,
  item,
  images,
  initialIndex,
  onClose,
}) => {
  // Normalize the list of available images / uploads
  const normalizedImages: LightboxImageItem[] = useMemo(() => {
    if (item) {
      const extracted = getItemUploads(item);
      if (extracted.length > 0) return extracted;
    }
    if (images && images.length > 0) {
      return images.map((img, i) => {
        if (typeof img === 'string') {
          return { src: img, alt: alt || `Upload ${i + 1}`, label: `Upload ${i + 1}` };
        }
        return {
          src: img.src,
          alt: img.alt || alt || `Upload ${i + 1}`,
          label: img.label || `Upload ${i + 1}`,
        };
      }).filter(x => Boolean(x.src));
    }
    if (src) {
      return [{ src, alt: alt || 'Image Preview', label: 'Main Preview' }];
    }
    return [];
  }, [item, images, src, alt]);

  const [currentIndex, setCurrentIndex] = useState<number>(() => {
    if (typeof initialIndex === 'number' && initialIndex >= 0 && initialIndex < normalizedImages.length) {
      return initialIndex;
    }
    if (src && normalizedImages.length > 0) {
      const foundIdx = normalizedImages.findIndex(img => img.src === src);
      if (foundIdx !== -1) return foundIdx;
    }
    return 0;
  });

  // Sync index if src or item changes
  useEffect(() => {
    if (src && normalizedImages.length > 0) {
      const foundIdx = normalizedImages.findIndex(img => img.src === src);
      if (foundIdx !== -1) {
        setCurrentIndex(foundIdx);
        return;
      }
    }
    if (currentIndex >= normalizedImages.length) {
      setCurrentIndex(Math.max(0, normalizedImages.length - 1));
    }
  }, [src, normalizedImages]);

  const hasMultiple = normalizedImages.length > 1;
  const activeImage = normalizedImages[currentIndex] || normalizedImages[0] || (src ? { src, alt, label: 'Preview' } : null);
  const activeSrc = activeImage?.src || null;
  const activeLabel = activeImage?.label;
  const activeAlt = activeImage?.alt || alt || itemStyle || 'Image Preview';

  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [imageDims, setImageDims] = useState<{ width: number; height: number } | null>(null);
  const [showOptions, setShowOptions] = useState(false);

  const handlePrev = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!hasMultiple) return;
    setCurrentIndex(prev => (prev > 0 ? prev - 1 : normalizedImages.length - 1));
  };

  const handleNext = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!hasMultiple) return;
    setCurrentIndex(prev => (prev < normalizedImages.length - 1 ? prev + 1 : 0));
  };

  // Keyboard navigation: Escape to close, ArrowLeft / ArrowRight to cycle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft' && hasMultiple) {
        handlePrev();
      } else if (e.key === 'ArrowRight' && hasMultiple) {
        handleNext();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasMultiple, normalizedImages.length, onClose]);

  // Preload natural dimensions for current image
  useEffect(() => {
    if (!activeSrc) return;
    let isMounted = true;
    setImageDims(null);
    loadImageWithCors(activeSrc)
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
  }, [activeSrc]);

  if (!activeSrc) return null;

  const generateFilename = (suffix = 'FullSize') => {
    const parts = [];
    if (orderNumber) parts.push(`Order_${orderNumber}`);
    const styleOrAlt = itemStyle || item?.style || item?.title || alt;
    if (styleOrAlt && styleOrAlt !== 'Image Preview') {
      parts.push(styleOrAlt.replace(/[^a-zA-Z0-9_-]/g, '_'));
    } else {
      parts.push('Mockup');
    }
    if (activeLabel) {
      parts.push(activeLabel.replace(/[^a-zA-Z0-9_-]/g, '_'));
    }
    parts.push(suffix);
    return `${parts.join('_')}.png`;
  };

  const handleDownload = async (upscale = 1, suffix = 'FullSize') => {
    if (!activeSrc || isDownloading) return;
    setIsDownloading(true);
    setDownloadSuccess(false);
    try {
      const filename = generateFilename(suffix);
      await downloadImageAsPng(activeSrc, filename, {
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
    if (!activeSrc || isCopying) return;
    setIsCopying(true);
    setCopySuccess(false);
    try {
      await copyImageAsPngToClipboard(activeSrc, { minDimension: 2400 });
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 3000);
    } catch (err) {
      console.error('Copy PNG failed:', err);
      alert('Could not copy image to clipboard in this browser.');
    } finally {
      setIsCopying(false);
    }
  };

  const displayTitle = itemStyle || item?.style || item?.title || alt || 'Garment Mockup';

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black/90 backdrop-blur-md p-3 md:p-6 animate-in fade-in duration-200 select-none"
      onClick={onClose}
    >
      {/* Top Floating Action Toolbar */}
      <div
        className="w-full max-w-5xl flex items-center justify-between mb-2 z-50 px-2"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left: Title, Upload Position & Dimensions */}
        <div className="flex items-center gap-3 text-white min-w-0">
          <div className="flex flex-col min-w-0">
            <span className="font-extrabold text-sm md:text-base tracking-wide text-neutral-100 truncate max-w-xs md:max-w-md">
              {displayTitle}
            </span>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {hasMultiple ? (
                <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 px-2.5 py-0.5 rounded-full border border-emerald-500/30 flex items-center gap-1.5 shadow-xs">
                  <span>{currentIndex + 1} of {normalizedImages.length}</span>
                  {activeLabel && (
                    <>
                      <span className="text-emerald-500/50">•</span>
                      <span className="text-white font-bold">{activeLabel}</span>
                    </>
                  )}
                </span>
              ) : (
                activeLabel && (
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-white/10 text-neutral-300 px-2 py-0.5 rounded-full border border-white/10">
                    {activeLabel}
                  </span>
                )
              )}
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
        <div className="flex items-center gap-2 relative shrink-0">
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

      {/* Main Image Card with Navigation Arrows & Checkerboard */}
      <div className="relative max-w-5xl w-full flex items-center justify-center">
        {/* Previous Arrow Button */}
        {hasMultiple && (
          <button
            type="button"
            onClick={handlePrev}
            className="absolute left-1 md:left-3 top-1/2 -translate-y-1/2 z-40 p-2.5 md:p-3.5 rounded-full bg-black/75 hover:bg-black text-white hover:text-emerald-400 border border-white/20 backdrop-blur-md shadow-2xl transition-all cursor-pointer hover:scale-110 active:scale-95 group focus:outline-none focus:ring-2 focus:ring-emerald-400"
            title="Previous upload (Left Arrow)"
          >
            <ChevronLeft size={24} className="group-hover:-translate-x-0.5 transition-transform" />
          </button>
        )}

        {/* Next Arrow Button */}
        {hasMultiple && (
          <button
            type="button"
            onClick={handleNext}
            className="absolute right-1 md:right-3 top-1/2 -translate-y-1/2 z-40 p-2.5 md:p-3.5 rounded-full bg-black/75 hover:bg-black text-white hover:text-emerald-400 border border-white/20 backdrop-blur-md shadow-2xl transition-all cursor-pointer hover:scale-110 active:scale-95 group focus:outline-none focus:ring-2 focus:ring-emerald-400"
            title="Next upload (Right Arrow)"
          >
            <ChevronRight size={24} className="group-hover:translate-x-0.5 transition-transform" />
          </button>
        )}

        <div
          className="relative max-w-5xl max-h-[75vh] w-full bg-checkerboard rounded-[2rem] p-6 md:p-10 shadow-2xl overflow-hidden flex items-center justify-center border border-white/10 cursor-crosshair animate-in zoom-in-95 duration-200 group"
          onClick={(e) => e.stopPropagation()}
          onMouseMove={(e) => {
            const { left, top, width, height } = e.currentTarget.getBoundingClientRect();
            const x = (e.clientX - left) / width;
            const y = (e.clientY - top) / height;
            const img = e.currentTarget.querySelector('img');
            if (img) img.style.transformOrigin = `${x * 100}% ${y * 100}%`;
          }}
          title="Hover to zoom 2×"
        >
          <img
            key={activeSrc}
            src={activeSrc}
            alt={activeAlt}
            style={{ width: 'auto', height: 'auto', maxWidth: '100%', maxHeight: '63vh' }}
            className="rounded-2xl select-none transition-transform duration-200 ease-out hover:scale-[2]"
          />

          {/* Floating Quick Download Badge on Bottom Corner */}
          <div className="absolute bottom-4 right-4 pointer-events-auto">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleDownload(1, 'FullSize');
              }}
              disabled={isDownloading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold bg-black/75 hover:bg-black text-white backdrop-blur-md border border-white/20 shadow-lg transition-all opacity-85 hover:opacity-100 cursor-pointer"
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
      </div>

      {/* Mini Thumbnails Strip (When Multiple Uploads Exist) */}
      {hasMultiple && (
        <div
          className="flex items-center justify-center gap-2 mt-3 max-w-5xl w-full overflow-x-auto py-1 px-3 custom-scrollbar z-50 flex-wrap"
          onClick={(e) => e.stopPropagation()}
        >
          {normalizedImages.map((img, idx) => (
            <button
              key={`${img.src}-${idx}`}
              type="button"
              onClick={() => setCurrentIndex(idx)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer shrink-0 shadow-sm ${
                idx === currentIndex
                  ? 'bg-emerald-500 text-neutral-950 border-emerald-400 shadow-md font-bold scale-105'
                  : 'bg-white/10 hover:bg-white/20 text-neutral-300 border-white/15 hover:border-white/30'
              }`}
              title={img.label || `Upload ${idx + 1}`}
            >
              <img src={img.src} alt="" className="w-5 h-5 object-contain rounded bg-black/40 p-0.5 shrink-0" />
              <span className="truncate max-w-[140px]">{img.label || `Upload ${idx + 1}`}</span>
            </button>
          ))}
        </div>
      )}

      {/* Helpful Hint on Footer */}
      <div className="mt-2 text-neutral-400 text-[11px] font-medium flex items-center gap-2">
        {hasMultiple && (
          <>
            <span>Use ← and → keys or click arrows to browse uploads</span>
            <span>•</span>
          </>
        )}
        <span>Hover image to zoom 2×</span>
        <span>•</span>
        <span>Transparent PNG preserved</span>
      </div>
    </div>
  );
};
