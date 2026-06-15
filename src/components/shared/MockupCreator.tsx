import { useState, useRef, useEffect } from 'react';
import { X, Upload, RotateCw, Check, RefreshCw, AlignCenter, AlignLeft } from 'lucide-react';
import { storage } from '../../lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

interface MockupCreatorProps {
  isOpen: boolean;
  onClose: () => void;
  garmentImageUrl: string;
  garmentBackImageUrl?: string | null;
  garmentName: string;
  colorName: string;
  initialLogoUrl: string | null;
  initialLogoUrlBack?: string | null;
  onSave: (mockupUrl: string, logoUrl: string, logoUrlBack?: string) => void;
}

export function MockupCreator({
  isOpen,
  onClose,
  garmentImageUrl,
  garmentBackImageUrl,
  garmentName,
  colorName,
  initialLogoUrl,
  initialLogoUrlBack,
  onSave
}: MockupCreatorProps) {
  const [logoUrlFront, setLogoUrlFront] = useState<string | null>(initialLogoUrl);
  const [logoUrlBack, setLogoUrlBack] = useState<string | null>(initialLogoUrlBack || null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [activeTab, setActiveTab] = useState<'front' | 'back'>('front');

  // Position, scale, and rotation states for Front
  const [logoPosFront, setLogoPosFront] = useState({ x: 50, y: 35 });
  const [logoScaleFront, setLogoScaleFront] = useState(0.3);
  const [logoRotationFront, setLogoRotationFront] = useState(0);

  // Position, scale, and rotation states for Back
  const [logoPosBack, setLogoPosBack] = useState({ x: 50, y: 40 });
  const [logoScaleBack, setLogoScaleBack] = useState(0.3);
  const [logoRotationBack, setLogoRotationBack] = useState(0);

  // Dragging and resizing states
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLImageElement>(null);
  
  const dragStartPos = useRef({ x: 0, y: 0, xPct: 50, yPct: 35 });
  const resizeStartPos = useRef({ x: 0, scale: 0.3 });

  // Getters/setters for active tab
  const logoUrl = activeTab === 'front' ? logoUrlFront : logoUrlBack;
  const setLogoUrl = (url: string | null) => {
    if (activeTab === 'front') setLogoUrlFront(url);
    else setLogoUrlBack(url);
  };

  const logoPos = activeTab === 'front' ? logoPosFront : logoPosBack;
  const logoScale = activeTab === 'front' ? logoScaleFront : logoScaleBack;
  const logoRotation = activeTab === 'front' ? logoRotationFront : logoRotationBack;

  const setLogoRotation = (deg: number) => {
    if (activeTab === 'front') setLogoRotationFront(deg);
    else setLogoRotationBack(deg);
  };

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
        const valX = Math.max(0, Math.min(100, Math.round(xPercent)));
        const valY = Math.max(0, Math.min(100, Math.round(yPercent)));

        if (activeTab === 'front') {
          setLogoPosFront({ x: valX, y: valY });
        } else {
          setLogoPosBack({ x: valX, y: valY });
        }
      }

      if (isResizing && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const deltaX = e.clientX - resizeStartPos.current.x;
        const newScale = resizeStartPos.current.scale + (2 * deltaX / rect.width);
        const valScale = Math.max(0.05, Math.min(0.8, Math.round(newScale * 100) / 100));

        if (activeTab === 'front') {
          setLogoScaleFront(valScale);
        } else {
          setLogoScaleBack(valScale);
        }
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
  }, [isDragging, isResizing, logoScale, logoPos, activeTab]);

  // Update logo urls if initial logos change
  useEffect(() => {
    if (initialLogoUrl) {
      setLogoUrlFront(initialLogoUrl);
    }
    if (initialLogoUrlBack) {
      setLogoUrlBack(initialLogoUrlBack);
    }
  }, [initialLogoUrl, initialLogoUrlBack]);

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
    if (activeTab === 'front') {
      if (preset === 'center') {
        setLogoPosFront({ x: 50, y: 35 });
        setLogoScaleFront(0.3);
      } else if (preset === 'left') {
        setLogoPosFront({ x: 38, y: 30 });
        setLogoScaleFront(0.18);
      } else {
        setLogoPosFront({ x: 50, y: 35 });
        setLogoScaleFront(0.3);
        setLogoRotationFront(0);
      }
    } else {
      if (preset === 'center') {
        setLogoPosBack({ x: 50, y: 40 });
        setLogoScaleBack(0.3);
      } else if (preset === 'left') {
        setLogoPosBack({ x: 38, y: 30 });
        setLogoScaleBack(0.18);
      } else {
        setLogoPosBack({ x: 50, y: 40 });
        setLogoScaleBack(0.3);
        setLogoRotationBack(0);
      }
    }
  };

  const activeGarmentUrl = activeTab === 'front' ? garmentImageUrl : (garmentBackImageUrl || garmentImageUrl);

  const proxiedGarmentUrl = activeGarmentUrl.startsWith('http')
    ? `/api/sanmar/proxy-image?url=${encodeURIComponent(activeGarmentUrl)}`
    : activeGarmentUrl;

  const handleSaveMockup = async () => {
    const hasFront = !!logoUrlFront;
    const hasBack = !!logoUrlBack && !!garmentBackImageUrl;
    const isSideBySide = hasFront && hasBack;

    if (!hasFront && !hasBack) {
      alert('Please upload/select a logo first.');
      return;
    }

    setIsSaving(true);

    try {
      const canvas = document.createElement('canvas');
      canvas.width = isSideBySide ? 1200 : 600;
      canvas.height = 600;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        throw new Error('Could not create 2D context');
      }

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, 600);

      const loadImg = (src: string): Promise<HTMLImageElement> => {
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

      const drawSide = async (garmentUrl: string, logoSrc: string | null, pos: { x: number; y: number }, scaleVal: number, rotationVal: number, canvasOffsetX: number) => {
        const proxiedUrl = garmentUrl.startsWith('http')
          ? `/api/sanmar/proxy-image?url=${encodeURIComponent(garmentUrl)}`
          : garmentUrl;

        const garmentImg = await loadImg(proxiedUrl);
        ctx.drawImage(garmentImg, canvasOffsetX + 50, 50, 500, 500);

        if (logoSrc) {
          const logoImg = await loadImg(logoSrc);
          const uiLogoW = 500 * scaleVal;
          const logoAspect = logoImg.naturalHeight / logoImg.naturalWidth;
          const logoH = uiLogoW * logoAspect;

          const logoCenterX = canvasOffsetX + 50 + (pos.x / 100) * 500;
          const logoCenterY = 50 + (pos.y / 100) * 500;

          ctx.save();
          ctx.translate(logoCenterX, logoCenterY);
          ctx.rotate((rotationVal * Math.PI) / 180);
          ctx.drawImage(logoImg, -uiLogoW / 2, -logoH / 2, uiLogoW, logoH);
          ctx.restore();
        }
      };

      if (isSideBySide) {
        await drawSide(garmentImageUrl, logoUrlFront, logoPosFront, logoScaleFront, logoRotationFront, 0);
        await drawSide(garmentBackImageUrl!, logoUrlBack, logoPosBack, logoScaleBack, logoRotationBack, 600);
      } else if (hasBack) {
        await drawSide(garmentBackImageUrl!, logoUrlBack, logoPosBack, logoScaleBack, logoRotationBack, 0);
      } else {
        await drawSide(garmentImageUrl, logoUrlFront, logoPosFront, logoScaleFront, logoRotationFront, 0);
      }

      canvas.toBlob(async (blob) => {
        if (!blob) {
          throw new Error('Canvas conversion to blob failed');
        }

        const mockupId = `mockup_${Date.now()}`;
        const fileRef = ref(storage, `public_quotes/mockups/${mockupId}.png`);
        
        await uploadBytes(fileRef, blob, { contentType: 'image/png' });
        const finalDownloadUrl = await getDownloadURL(fileRef);

        onSave(finalDownloadUrl, logoUrlFront || '', logoUrlBack || '');
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
    <div className="fixed inset-0 z-50 flex flex-col bg-white animate-in fade-in duration-300 font-sans">
      
      {/* Header */}
      <div className="px-8 py-5 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50 shrink-0">
        <div>
          <h3 className="text-xl font-bold font-serif text-brand-primary leading-tight">{garmentName}</h3>
          <p className="text-xs font-semibold text-brand-secondary mt-1">{colorName}</p>
        </div>
        <button onClick={onClose} className="w-10 h-10 rounded-full bg-white border border-neutral-200 flex items-center justify-center text-neutral-500 hover:text-black hover:border-black transition-all shadow-sm cursor-pointer animate-in zoom-in duration-200">
          <X size={20} />
        </button>
      </div>

      {/* Content Body */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        
        {/* Left Side: Dynamic Canvas Workspace */}
        <div className="flex-1 bg-neutral-50 flex flex-col items-center justify-center p-8 relative overflow-y-auto border-b md:border-b-0 md:border-r border-neutral-100 gap-8 animate-in fade-in duration-300 select-none">
          
          {/* Segmented View Selector */}
          {garmentBackImageUrl && (
            <div className="flex bg-neutral-200/50 p-1 rounded-2xl gap-1 shadow-inner shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab('front')}
                className={`px-6 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'front'
                    ? 'bg-white text-black shadow-sm'
                    : 'text-neutral-500 hover:text-black'
                }`}
              >
                Front View
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('back')}
                className={`px-6 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'back'
                    ? 'bg-white text-black shadow-sm'
                    : 'text-neutral-500 hover:text-black'
                }`}
              >
                Back View
              </button>
            </div>
          )}

          {/* Garment + Logo Wrapper */}
          <div 
            ref={containerRef}
            className="w-full max-w-[550px] aspect-[4/5] relative bg-white rounded-[2rem] shadow-lg border border-neutral-200/60 overflow-hidden flex items-center justify-center cursor-default shrink-0 transition-all duration-300 hover:shadow-xl p-6"
          >
            {/* Proxied or direct garment image */}
            <img 
              src={proxiedGarmentUrl} 
              alt={garmentName} 
              className="max-w-full max-h-full object-contain pointer-events-none mix-blend-multiply"
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
                className="absolute flex items-center justify-center border border-dashed border-black/40 group/logo select-none cursor-move p-1 bg-white/10 backdrop-blur-[0.5px]"
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
                  className="absolute bottom-[-6px] right-[-6px] w-3.5 h-3.5 bg-black border-2 border-white rounded-full cursor-se-resize shadow-md hover:scale-125 transition-transform z-30"
                />
              </div>
            )}

            {/* Empty Slate Instructions */}
            {!logoUrl && (
              <label className="absolute inset-0 bg-white/40 backdrop-blur-[1px] flex flex-col items-center justify-center p-6 text-center gap-3 cursor-pointer hover:bg-white/50 transition-all group rounded-[2rem]">
                <input 
                  type="file" 
                  accept="image/png, image/jpeg, image/svg+xml" 
                  onChange={handleLogoUpload} 
                  className="hidden" 
                />
                <div className="w-10 h-10 bg-white border border-neutral-200 text-neutral-500 rounded-full flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                  <Upload size={16} className="group-hover:text-brand-primary transition-colors" />
                </div>
                <p className="text-sm font-bold text-neutral-700 group-hover:text-brand-primary transition-colors">No logo uploaded yet</p>
                <p className="text-xs text-neutral-500 max-w-[200px] leading-relaxed">
                  Click here or upload a transparent logo file on the right side to overlay on the shirt ({activeTab.toUpperCase()}).
                </p>
              </label>
            )}
          </div>
        </div>

        {/* Right Side: Setup Controls */}
        <div className="w-full md:w-[420px] shrink-0 p-8 flex flex-col justify-between bg-white overflow-y-auto border-l border-neutral-200 shadow-sm gap-6">
          <div className="space-y-6">
            
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
                  <div className="w-12 h-12 bg-checkerboard border border-neutral-200 rounded-xl overflow-hidden flex items-center justify-center shrink-0 bg-white">
                    <img src={logoUrl} className="w-full h-full object-contain" alt="Logo preview" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-bold text-neutral-700 block truncate">Logo Active ({activeTab.toUpperCase()})</span>
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
                      className="px-2.5 py-2 bg-neutral-50 hover:bg-neutral-100 text-neutral-700 border border-neutral-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <AlignCenter size={13} /> Center
                    </button>
                    <button
                      onClick={() => applyPreset('left')}
                      className="px-2.5 py-2 bg-neutral-50 hover:bg-neutral-100 text-neutral-700 border border-neutral-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <AlignLeft size={13} /> Left Chest
                    </button>
                    <button
                      onClick={() => applyPreset('reset')}
                      className="px-2.5 py-2 bg-neutral-50 hover:bg-neutral-100 text-neutral-700 border border-neutral-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
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
              disabled={isSaving || (!logoUrlFront && !logoUrlBack)}
              className="w-full bg-brand-primary text-white py-3.5 rounded-xl font-bold tracking-wide hover:bg-brand-primary/95 transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm cursor-pointer"
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
              className="w-full bg-neutral-50 hover:bg-neutral-100 text-neutral-500 py-3 rounded-xl font-bold transition-all text-xs cursor-pointer"
            >
              Cancel
            </button>
          </div>

        </div>

      </div>
    </div>
  );
}
