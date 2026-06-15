import { useState, useRef, useEffect } from 'react';
import { X, Upload, RotateCw, Check, RefreshCw, AlignCenter, AlignLeft } from 'lucide-react';
import { storage } from '../../lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

interface MockupCreatorProps {
  isOpen: boolean;
  onClose: () => void;
  garmentImageUrl: string;
  garmentName: string;
  colorName: string;
  initialLogoUrl: string | null;
  onSave: (mockupUrl: string, logoUrl: string) => void;
}

export function MockupCreator({
  isOpen,
  onClose,
  garmentImageUrl,
  garmentName,
  colorName,
  initialLogoUrl,
  onSave
}: MockupCreatorProps) {
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const proxiedGarmentUrl = garmentImageUrl.startsWith('http')
    ? `/api/sanmar/proxy-image?url=${encodeURIComponent(garmentImageUrl)}`
    : garmentImageUrl;

  // Position, scale, and rotation states
  // Position is stored as a percentage (0 to 100) of the container dimensions
  const [logoPos, setLogoPos] = useState({ x: 50, y: 35 }); // centered horizontally, slightly high vertically
  const [logoScale, setLogoScale] = useState(0.3); // default 30% of garment width
  const [logoRotation, setLogoRotation] = useState(0); // in degrees (0 - 360)

  // Dragging and resizing states
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLImageElement>(null);
  
  const dragStartPos = useRef({ x: 0, y: 0, xPct: 50, yPct: 35 });
  const resizeStartPos = useRef({ x: 0, scale: 0.3 });

  const handleDragMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsDragging(true);
    dragStartPos.current = {
      x: e.clientX,
      y: e.clientY,
      xPct: logoPos.x,
      yPct: logoPos.y
    };
  };

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(true);
    resizeStartPos.current = {
      x: e.clientX,
      scale: logoScale
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const xPercent = ((e.clientX - rect.left) / rect.width) * 100;
        const yPercent = ((e.clientY - rect.top) / rect.height) * 100;
        setLogoPos({
          x: Math.max(0, Math.min(100, Math.round(xPercent))),
          y: Math.max(0, Math.min(100, Math.round(yPercent)))
        });
      }

      if (isResizing && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const deltaX = e.clientX - resizeStartPos.current.x;
        const newScale = resizeStartPos.current.scale + (2 * deltaX / rect.width);
        setLogoScale(Math.max(0.05, Math.min(0.8, Math.round(newScale * 100) / 100)));
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    if (isDragging || isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, logoScale, logoPos]);

  // Update logo url if initial logo changes
  useEffect(() => {
    if (initialLogoUrl) {
      setLogoUrl(initialLogoUrl);
    }
  }, [initialLogoUrl]);

  if (!isOpen) return null;

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingLogo(true);
    try {
      const tempId = `temp_logo_${Date.now()}`;
      const storageRef = ref(storage, `public_quotes/logos/${tempId}/${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setLogoUrl(url);
    } catch (err) {
      console.error('Logo upload failed', err);
      alert('Failed to upload logo image.');
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const applyPreset = (preset: 'center' | 'left' | 'reset') => {
    if (preset === 'center') {
      setLogoPos({ x: 50, y: 35 });
      setLogoScale(0.3);
    } else if (preset === 'left') {
      setLogoPos({ x: 38, y: 30 });
      setLogoScale(0.18);
    } else {
      setLogoPos({ x: 50, y: 35 });
      setLogoScale(0.3);
      setLogoRotation(0);
    }
  };

  // Helper to load image securely with anonymous CORS setup
  const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      if (src.startsWith('http') || src.startsWith('//')) {
        img.crossOrigin = 'anonymous';
      }
      img.src = src;
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    });
  };

  const handleSaveMockup = async () => {
    if (!logoUrl) {
      alert('Please upload/select a logo first.');
      return;
    }

    setIsSaving(true);

    try {
      // For logo, if it is from Firebase Storage, it has open CORS if configured,
      // but let's load it directly or via proxy to be safe. Firebase usually has open CORS,
      // but we can try loading it directly.
      const logoImgUrl = logoUrl;

      // 2. Load both images in parallel
      const [garmentImg, logoImg] = await Promise.all([
        loadImage(proxiedGarmentUrl),
        loadImage(logoImgUrl)
      ]);

      // 3. Create canvas matching natural dimensions of garment image
      const canvas = document.createElement('canvas');
      canvas.width = garmentImg.naturalWidth;
      canvas.height = garmentImg.naturalHeight;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        throw new Error('Could not create 2D context');
      }

      // 4. Draw garment background
      ctx.drawImage(garmentImg, 0, 0);

      // 5. Draw logo overlay with proper translation, scale and rotation
      // Find UI dimensions to calculate relative ratios
      if (containerRef.current) {
        const containerW = containerRef.current.clientWidth;
        const containerH = containerRef.current.clientHeight;

        // Bounding dimensions of the logo in the UI
        const uiLogoW = containerW * logoScale;
        // Keep logo aspect ratio intact
        const logoAspect = logoImg.naturalHeight / logoImg.naturalWidth;

        // Calculate exact object-contain dimensions and offsets of the garment image in the UI
        const garmentAspect = garmentImg.naturalWidth / garmentImg.naturalHeight;
        const containerAspect = containerW / containerH;

        let renderedW = containerW;
        let renderedH = containerH;
        let offsetX = 0;
        let offsetY = 0;

        if (garmentAspect > containerAspect) {
          renderedW = containerW;
          renderedH = containerW / garmentAspect;
          offsetY = (containerH - renderedH) / 2;
        } else {
          renderedH = containerH;
          renderedW = containerH * garmentAspect;
          offsetX = (containerW - renderedW) / 2;
        }

        // Map logo position from container to the actual rendered garment boundaries
        const logoCenterXInImage = (logoPos.x / 100) * containerW - offsetX;
        const logoCenterYInImage = (logoPos.y / 100) * containerH - offsetY;

        // Map to canvas dimensions
        const scaleFactor = canvas.width / renderedW;
        const canvasCenterX = logoCenterXInImage * scaleFactor;
        const canvasCenterY = logoCenterYInImage * scaleFactor;

        const canvasLogoW = uiLogoW * scaleFactor;
        const canvasLogoH = canvasLogoW * logoAspect;

        ctx.save();
        // Move origin to logo center
        ctx.translate(canvasCenterX, canvasCenterY);
        // Rotate
        ctx.rotate((logoRotation * Math.PI) / 180);
        // Draw centered logo
        ctx.drawImage(
          logoImg,
          -canvasLogoW / 2,
          -canvasLogoH / 2,
          canvasLogoW,
          canvasLogoH
        );
        ctx.restore();
      }

      // 6. Output to Blob and upload to Firebase Storage
      canvas.toBlob(async (blob) => {
        if (!blob) {
          throw new Error('Canvas conversion to blob failed');
        }

        const mockupId = `mockup_${Date.now()}`;
        const fileRef = ref(storage, `public_quotes/mockups/${mockupId}.png`);
        
        await uploadBytes(fileRef, blob, { contentType: 'image/png' });
        const finalDownloadUrl = await getDownloadURL(fileRef);

        onSave(finalDownloadUrl, logoUrl || '');
        onClose();
      }, 'image/png');

    } catch (err) {
      console.error('Error generating mockup canvas:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      alert(`Could not compile your mockup: ${errorMessage || 'Check connection or CORS configuration.'}`);
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-neutral-900/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 font-sans">
      <div className="bg-white w-full max-w-4xl rounded-3xl overflow-hidden shadow-2xl border border-neutral-100 flex flex-col md:flex-row h-full max-h-[85vh] md:max-h-[700px] animate-in zoom-in-95 fade-in duration-300">
        
        {/* Left Side: Dynamic Canvas Container */}
        <div className="flex-1 bg-neutral-50 flex items-center justify-center p-6 relative overflow-hidden select-none border-b md:border-b-0 md:border-r border-neutral-100 min-h-[300px] md:min-h-0">
          <div className="absolute top-4 left-4 z-10 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-full border border-neutral-200 shadow-sm flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-brand-primary animate-pulse"></span>
            <span className="text-xs font-bold text-neutral-700 tracking-wide uppercase">Mockup Canvas</span>
          </div>

          {/* Garment + Logo Wrapper */}
          <div 
            ref={containerRef}
            className="w-full max-w-[360px] aspect-[4/5] relative bg-white rounded-2xl shadow-sm border border-neutral-200/60 overflow-hidden flex items-center justify-center cursor-default"
          >
            {/* Proxied or direct garment image */}
            <img 
              src={proxiedGarmentUrl} 
              alt={garmentName} 
              className="w-full h-full object-contain pointer-events-none"
              draggable="false"
            />

            {/* Logo Layer */}
            {logoUrl && (
              <div
                onMouseDown={handleDragMouseDown}
                style={{
                  position: 'absolute',
                  left: `${logoPos.x}%`,
                  top: `${logoPos.y}%`,
                  width: `${logoScale * 100}%`,
                  transform: 'translate(-50%, -50%)',
                  zIndex: 20
                }}
                className="absolute flex items-center justify-center border border-dashed border-black/40 group/logo select-none cursor-move p-1"
              >
                <img
                  ref={logoRef}
                  src={logoUrl}
                  alt="Overlay logo"
                  style={{
                    transform: `rotate(${logoRotation}deg)`,
                    width: '100%',
                    height: 'auto'
                  }}
                  className="object-contain transition-shadow select-none pointer-events-none"
                  draggable="false"
                />
                
                {/* Resize Handle */}
                <div 
                  onMouseDown={handleResizeMouseDown}
                  className="absolute bottom-[-6px] right-[-6px] w-3 h-3 bg-black border border-white rounded-full cursor-se-resize shadow-sm hover:scale-125 transition-transform z-30"
                />
              </div>
            )}

            {/* Empty Slate Instructions */}
            {!logoUrl && (
              <label className="absolute inset-0 bg-white/40 backdrop-blur-[1px] flex flex-col items-center justify-center p-6 text-center gap-3 cursor-pointer hover:bg-white/50 transition-all group">
                <input 
                  type="file" 
                  accept="image/png, image/jpeg, image/svg+xml" 
                  onChange={handleLogoUpload} 
                  className="hidden" 
                />
                <div className="w-10 h-10 bg-white border border-neutral-200 text-neutral-500 rounded-full flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform">
                  <Upload size={16} className="group-hover:text-brand-primary transition-colors" />
                </div>
                <p className="text-sm font-bold text-neutral-700 group-hover:text-brand-primary transition-colors">No logo uploaded yet</p>
                <p className="text-xs text-neutral-500 max-w-[200px] leading-relaxed">
                  Click here or upload a transparent logo file on the right side to overlay on the shirt.
                </p>
              </label>
            )}
          </div>
        </div>

        {/* Right Side: Setup Controls */}
        <div className="w-full md:w-[340px] shrink-0 p-6 flex flex-col justify-between bg-white overflow-y-auto">
          <div className="space-y-6">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-xl font-bold font-serif text-brand-primary leading-tight">{garmentName}</h3>
                <p className="text-xs font-semibold text-brand-secondary mt-1">{colorName}</p>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-neutral-100 rounded-full text-neutral-400 hover:text-neutral-600 transition-colors">
                <X size={20} />
              </button>
            </div>

            {/* Logo Upload Section */}
            <div className="space-y-2.5">
              <label className="text-xs font-bold text-neutral-700 uppercase tracking-wider block">1. Upload Logo</label>
              {isUploadingLogo ? (
                <div className="border border-dashed border-neutral-300 rounded-2xl p-6 flex flex-col items-center justify-center gap-2 bg-neutral-50 animate-pulse">
                  <div className="w-5 h-5 border-2 border-neutral-300 border-t-brand-primary rounded-full animate-spin"></div>
                  <span className="text-xs text-neutral-500 font-medium">Uploading logo...</span>
                </div>
              ) : logoUrl ? (
                <div className="flex items-center gap-3 p-3 border border-neutral-200 rounded-2xl bg-neutral-50">
                  <div className="w-12 h-12 bg-checkerboard border border-neutral-200 rounded-xl overflow-hidden flex items-center justify-center shrink-0">
                    <img src={logoUrl} className="w-full h-full object-contain" alt="Logo preview" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-bold text-neutral-700 block truncate">Logo Active</span>
                    <label className="text-xs text-brand-primary hover:text-brand-primary/80 font-bold cursor-pointer inline-block mt-0.5">
                      Change File
                      <input type="file" accept="image/png, image/jpeg, image/svg+xml" onChange={handleLogoUpload} className="hidden" />
                    </label>
                  </div>
                </div>
              ) : (
                <label className="border-2 border-dashed border-neutral-200 hover:border-brand-primary/40 rounded-2xl p-6 flex flex-col items-center justify-center gap-2 bg-neutral-50 hover:bg-brand-primary/5 transition-all cursor-pointer group">
                  <Upload size={20} className="text-neutral-400 group-hover:text-brand-primary transition-colors" />
                  <span className="text-xs font-bold text-neutral-700 group-hover:text-brand-primary transition-colors">Select logo image</span>
                  <span className="text-[10px] text-neutral-400">Transparent PNG/SVG works best</span>
                  <input type="file" accept="image/png, image/jpeg, image/svg+xml" onChange={handleLogoUpload} className="hidden" />
                </label>
              )}
            </div>

            {/* Adjustments Section */}
            {logoUrl && (
              <div className="space-y-5 pt-4 border-t border-neutral-100">
                <label className="text-xs font-bold text-neutral-700 uppercase tracking-wider block">2. Logo Adjustment</label>

                {/* Rotate Slider */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-neutral-600 flex items-center gap-1.5"><RotateCw size={12}/> Logo Rotation</span>
                    <span className="font-bold text-neutral-700">{logoRotation}°</span>
                  </div>
                  <input
                    type="range"
                    min="-180"
                    max="180"
                    step="1"
                    value={logoRotation}
                    onChange={(e) => setLogoRotation(parseInt(e.target.value))}
                    className="w-full h-1 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-brand-primary"
                  />
                </div>

                {/* Placement Presets */}
                <div className="space-y-2">
                  <span className="text-[11px] font-bold text-neutral-400 block uppercase tracking-wider">Presets</span>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => applyPreset('center')}
                      className="px-2.5 py-2 bg-neutral-50 hover:bg-neutral-100 text-neutral-700 border border-neutral-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                    >
                      <AlignCenter size={13} /> Center
                    </button>
                    <button
                      onClick={() => applyPreset('left')}
                      className="px-2.5 py-2 bg-neutral-50 hover:bg-neutral-100 text-neutral-700 border border-neutral-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                    >
                      <AlignLeft size={13} /> Left Chest
                    </button>
                    <button
                      onClick={() => applyPreset('reset')}
                      className="px-2.5 py-2 bg-neutral-50 hover:bg-neutral-100 text-neutral-700 border border-neutral-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                    >
                      <RefreshCw size={13} /> Reset
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="pt-6 border-t border-neutral-100 space-y-3">
            <button
              onClick={handleSaveMockup}
              disabled={isSaving || !logoUrl}
              className="w-full bg-brand-primary text-white py-3.5 rounded-xl font-bold tracking-wide hover:bg-brand-primary/95 transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {isSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Generating Mockup...
                </>
              ) : (
                <>
                  <Check size={16} /> Save Mockup Design
                </>
              )}
            </button>
            <button
              onClick={onClose}
              disabled={isSaving}
              className="w-full bg-neutral-50 hover:bg-neutral-100 text-neutral-500 py-3 rounded-xl font-bold transition-all text-xs"
            >
              Cancel
            </button>
          </div>

        </div>

      </div>
    </div>
  );
}
