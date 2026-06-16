import { useState, useRef, useEffect, useMemo } from 'react';
import { X, Upload, RotateCw, Check, RefreshCw, AlignCenter, AlignLeft } from 'lucide-react';
import { storage } from '../../lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const getSingularCategory = (garmentName: string = '') => {
  const text = garmentName.toLowerCase();
  if (text.includes('hoodie') || text.includes('hooded')) return 'hoodie';
  if (text.includes('sweatshirt') || text.includes('crewneck')) return 'crewneck sweatshirt';
  if (text.includes('long sleeve') || text.includes('longsleeve')) return 'long sleeve shirt';
  if (text.includes('polo')) return 'polo shirt';
  if (text.includes('t-shirt') || text.includes('tee') || text.includes('tshirt')) return 't-shirt';
  if (text.includes('hat') || text.includes('cap')) return 'trucker cap';
  if (text.includes('jacket')) return 'jacket';
  return 'apparel';
};

const getSeedForString = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 100000;
};

interface MockupCreatorProps {
  isOpen: boolean;
  onClose: () => void;
  garmentImageUrl: string;
  garmentBackImageUrl?: string | null;
  garmentLeftSleeveImageUrl?: string | null;
  garmentRightSleeveImageUrl?: string | null;
  garmentName: string;
  colorName: string;
  initialLogoUrl: string | null;
  initialLogoUrlBack?: string | null;
  initialLogoUrlLeftSleeve?: string | null;
  initialLogoUrlRightSleeve?: string | null;
  onSave: (
    mockupUrl: string,
    logoUrlFront: string,
    logoUrlBack?: string,
    logoUrlLeftSleeve?: string,
    logoUrlRightSleeve?: string
  ) => void;
}

export function MockupCreator({
  isOpen,
  onClose,
  garmentImageUrl,
  garmentBackImageUrl,
  garmentLeftSleeveImageUrl,
  garmentRightSleeveImageUrl,
  garmentName,
  colorName,
  initialLogoUrl,
  initialLogoUrlBack,
  initialLogoUrlLeftSleeve,
  initialLogoUrlRightSleeve,
  onSave
}: MockupCreatorProps) {
  const [logoUrlFront, setLogoUrlFront] = useState<string | null>(initialLogoUrl);
  const [logoUrlBack, setLogoUrlBack] = useState<string | null>(initialLogoUrlBack || null);
  const [logoUrlLeftSleeve, setLogoUrlLeftSleeve] = useState<string | null>(initialLogoUrlLeftSleeve || null);
  const [logoUrlRightSleeve, setLogoUrlRightSleeve] = useState<string | null>(initialLogoUrlRightSleeve || null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [activeTab, setActiveTab] = useState<'front' | 'back' | 'left-sleeve' | 'right-sleeve'>('front');

  // Position, scale, and rotation states for Front
  const [logoPosFront, setLogoPosFront] = useState({ x: 50, y: 35 });
  const [logoScaleFront, setLogoScaleFront] = useState(0.3);
  const [logoRotationFront, setLogoRotationFront] = useState(0);

  // Position, scale, and rotation states for Back
  const [logoPosBack, setLogoPosBack] = useState({ x: 50, y: 40 });
  const [logoScaleBack, setLogoScaleBack] = useState(0.3);
  const [logoRotationBack, setLogoRotationBack] = useState(0);

  // Position, scale, and rotation states for Left Sleeve
  const [logoPosLeftSleeve, setLogoPosLeftSleeve] = useState({ x: 50, y: 50 });
  const [logoScaleLeftSleeve, setLogoScaleLeftSleeve] = useState(0.3);
  const [logoRotationLeftSleeve, setLogoRotationLeftSleeve] = useState(0);

  // Position, scale, and rotation states for Right Sleeve
  const [logoPosRightSleeve, setLogoPosRightSleeve] = useState({ x: 50, y: 50 });
  const [logoScaleRightSleeve, setLogoScaleRightSleeve] = useState(0.3);
  const [logoRotationRightSleeve, setLogoRotationRightSleeve] = useState(0);

  // Dragging and resizing states
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLImageElement>(null);
  
  const dragStartPos = useRef({ x: 0, y: 0, xPct: 50, yPct: 35 });
  const resizeStartPos = useRef({ x: 0, scale: 0.3 });

  // Getters/setters for active tab
  const logoUrl = useMemo(() => {
    if (activeTab === 'front') return logoUrlFront;
    if (activeTab === 'back') return logoUrlBack;
    if (activeTab === 'left-sleeve') return logoUrlLeftSleeve;
    return logoUrlRightSleeve;
  }, [activeTab, logoUrlFront, logoUrlBack, logoUrlLeftSleeve, logoUrlRightSleeve]);

  const setLogoUrl = (url: string | null) => {
    if (activeTab === 'front') setLogoUrlFront(url);
    else if (activeTab === 'back') setLogoUrlBack(url);
    else if (activeTab === 'left-sleeve') setLogoUrlLeftSleeve(url);
    else setLogoUrlRightSleeve(url);
  };

  const logoPos = useMemo(() => {
    if (activeTab === 'front') return logoPosFront;
    if (activeTab === 'back') return logoPosBack;
    if (activeTab === 'left-sleeve') return logoPosLeftSleeve;
    return logoPosRightSleeve;
  }, [activeTab, logoPosFront, logoPosBack, logoPosLeftSleeve, logoPosRightSleeve]);

  const logoScale = useMemo(() => {
    if (activeTab === 'front') return logoScaleFront;
    if (activeTab === 'back') return logoScaleBack;
    if (activeTab === 'left-sleeve') return logoScaleLeftSleeve;
    return logoScaleRightSleeve;
  }, [activeTab, logoScaleFront, logoScaleBack, logoScaleLeftSleeve, logoScaleRightSleeve]);

  const logoRotation = useMemo(() => {
    if (activeTab === 'front') return logoRotationFront;
    if (activeTab === 'back') return logoRotationBack;
    if (activeTab === 'left-sleeve') return logoRotationLeftSleeve;
    return logoRotationRightSleeve;
  }, [activeTab, logoRotationFront, logoRotationBack, logoRotationLeftSleeve, logoRotationRightSleeve]);

  const setLogoRotation = (deg: number) => {
    if (activeTab === 'front') setLogoRotationFront(deg);
    else if (activeTab === 'back') setLogoRotationBack(deg);
    else if (activeTab === 'left-sleeve') setLogoRotationLeftSleeve(deg);
    else setLogoRotationRightSleeve(deg);
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
        const centerXPct = 50;
        const centerYPct = 50;
        const xPercentOfCard = ((e.clientX - rect.left) / rect.width) * 100;
        const yPercentOfCard = ((e.clientY - rect.top) / rect.height) * 100;
        
        const scaleFactor = 1.1;
        const valX = Math.max(0, Math.min(100, Math.round(centerXPct + (xPercentOfCard - centerXPct) / scaleFactor)));
        const valY = Math.max(0, Math.min(100, Math.round(centerYPct + (yPercentOfCard - centerYPct) / scaleFactor)));

        if (activeTab === 'front') {
          setLogoPosFront({ x: valX, y: valY });
        } else if (activeTab === 'back') {
          setLogoPosBack({ x: valX, y: valY });
        } else if (activeTab === 'left-sleeve') {
          setLogoPosLeftSleeve({ x: valX, y: valY });
        } else {
          setLogoPosRightSleeve({ x: valX, y: valY });
        }
      }

      if (isResizing && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const deltaX = e.clientX - resizeStartPos.current.x;
        const scaleFactor = 1.1;
        const newScale = resizeStartPos.current.scale + (((2 * deltaX) / scaleFactor) / rect.width);
        const valScale = Math.max(0.05, Math.min(0.8, Math.round(newScale * 100) / 100));

        if (activeTab === 'front') {
          setLogoScaleFront(valScale);
        } else if (activeTab === 'back') {
          setLogoScaleBack(valScale);
        } else if (activeTab === 'left-sleeve') {
          setLogoScaleLeftSleeve(valScale);
        } else {
          setLogoScaleRightSleeve(valScale);
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
    if (initialLogoUrlLeftSleeve) {
      setLogoUrlLeftSleeve(initialLogoUrlLeftSleeve);
    }
    if (initialLogoUrlRightSleeve) {
      setLogoUrlRightSleeve(initialLogoUrlRightSleeve);
    }
  }, [initialLogoUrl, initialLogoUrlBack, initialLogoUrlLeftSleeve, initialLogoUrlRightSleeve]);

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
    } else if (activeTab === 'back') {
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
    } else if (activeTab === 'left-sleeve') {
      if (preset === 'center' || preset === 'left') {
        setLogoPosLeftSleeve({ x: 50, y: 50 });
        setLogoScaleLeftSleeve(0.3);
      } else {
        setLogoPosLeftSleeve({ x: 50, y: 50 });
        setLogoScaleLeftSleeve(0.3);
        setLogoRotationLeftSleeve(0);
      }
    } else {
      if (preset === 'center' || preset === 'left') {
        setLogoPosRightSleeve({ x: 50, y: 50 });
        setLogoScaleRightSleeve(0.3);
      } else {
        setLogoPosRightSleeve({ x: 50, y: 50 });
        setLogoScaleRightSleeve(0.3);
        setLogoRotationRightSleeve(0);
      }
    }
  };

  const garmentType = getSingularCategory(garmentName);
  const cleanColor = colorName.trim();
  const cleanStyle = garmentName.trim();

  const seedBack = getSeedForString(`${cleanStyle}-${cleanColor}-back`);
  const seedLeftSleeve = getSeedForString(`${cleanStyle}-${cleanColor}-left-sleeve`);
  const seedRightSleeve = getSeedForString(`${cleanStyle}-${cleanColor}-right-sleeve`);

  const generatedBackUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(`blank back view of ${cleanColor} ${garmentType}, flat lay, isolated on solid white background, high resolution product mockup, clean, wrinkle-free, professional studio photography`)}?width=800&height=800&nologo=true&seed=${seedBack}`;
  const generatedLeftSleeveUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(`blank left sleeve view of ${cleanColor} ${garmentType}, flat lay, isolated on solid white background, high resolution product mockup, clean, wrinkle-free, professional studio photography`)}?width=800&height=800&nologo=true&seed=${seedLeftSleeve}`;
  const generatedRightSleeveUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(`blank right sleeve view of ${cleanColor} ${garmentType}, flat lay, isolated on solid white background, high resolution product mockup, clean, wrinkle-free, professional studio photography`)}?width=800&height=800&nologo=true&seed=${seedRightSleeve}`;

  // Map high-quality pre-generated sleeve mockups for NL6210 Charcoal
  const colorLower = cleanColor.toLowerCase();
  const nameLower = cleanStyle.toLowerCase();
  
  let localLeftSleeve = null;
  let localRightSleeve = null;
  if (nameLower.includes('nl6210') && colorLower.includes('charcoal')) {
    localLeftSleeve = '/mockups/NL6210/left_sleeve.png';
    localRightSleeve = '/mockups/NL6210/right_sleeve.png';
  }

  const resolvedBackImageUrl = garmentBackImageUrl || generatedBackUrl;
  const resolvedLeftSleeveImageUrl = garmentLeftSleeveImageUrl || localLeftSleeve || generatedLeftSleeveUrl;
  const resolvedRightSleeveImageUrl = garmentRightSleeveImageUrl || localRightSleeve || generatedRightSleeveUrl;

  const activeGarmentUrl = useMemo(() => {
    if (activeTab === 'front') return garmentImageUrl;
    if (activeTab === 'back') return resolvedBackImageUrl;
    if (activeTab === 'left-sleeve') return resolvedLeftSleeveImageUrl;
    return resolvedRightSleeveImageUrl;
  }, [activeTab, garmentImageUrl, resolvedBackImageUrl, resolvedLeftSleeveImageUrl, resolvedRightSleeveImageUrl]);

  const proxiedGarmentUrl = activeGarmentUrl.startsWith('http')
    ? `/api/sanmar/proxy-image?url=${encodeURIComponent(activeGarmentUrl)}`
    : activeGarmentUrl;

  const handleSaveMockup = async () => {
    const hasFront = !!logoUrlFront;
    const hasBack = !!logoUrlBack;
    const hasLeftSleeve = !!logoUrlLeftSleeve;
    const hasRightSleeve = !!logoUrlRightSleeve;

    if (!hasFront && !hasBack && !hasLeftSleeve && !hasRightSleeve) {
      alert('Please upload/select a logo first.');
      return;
    }

    setIsSaving(true);

    try {
      const activeSides: {
        img: string;
        logo: string | null;
        pos: { x: number; y: number };
        scale: number;
        rotation: number;
        name: string;
      }[] = [];

      if (hasFront) activeSides.push({ img: garmentImageUrl, logo: logoUrlFront, pos: logoPosFront, scale: logoScaleFront, rotation: logoRotationFront, name: 'Front' });
      if (hasBack) activeSides.push({ img: resolvedBackImageUrl, logo: logoUrlBack, pos: logoPosBack, scale: logoScaleBack, rotation: logoRotationBack, name: 'Back' });
      if (hasLeftSleeve) activeSides.push({ img: resolvedLeftSleeveImageUrl, logo: logoUrlLeftSleeve, pos: logoPosLeftSleeve, scale: logoScaleLeftSleeve, rotation: logoRotationLeftSleeve, name: 'Left Sleeve' });
      if (hasRightSleeve) activeSides.push({ img: resolvedRightSleeveImageUrl, logo: logoUrlRightSleeve, pos: logoPosRightSleeve, scale: logoScaleRightSleeve, rotation: logoRotationRightSleeve, name: 'Right Sleeve' });

      if (activeSides.length === 0) {
        activeSides.push({ img: garmentImageUrl, logo: null, pos: { x: 50, y: 35 }, scale: 0.3, rotation: 0, name: 'Front' });
      }

      const panelWidth = 600;
      const canvasWidth = panelWidth * activeSides.length;
      const canvasHeight = 600;

      const canvas = document.createElement('canvas');
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        throw new Error('Could not create 2D context');
      }

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

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

      for (let i = 0; i < activeSides.length; i++) {
        const side = activeSides[i];
        await drawSide(side.img, side.logo, side.pos, side.scale, side.rotation, i * panelWidth);
      }

      canvas.toBlob(async (blob) => {
        if (!blob) {
          throw new Error('Canvas conversion to blob failed');
        }

        const mockupId = `mockup_${Date.now()}`;
        const fileRef = ref(storage, `public_quotes/mockups/${mockupId}.png`);
        
        await uploadBytes(fileRef, blob, { contentType: 'image/png' });
        const finalDownloadUrl = await getDownloadURL(fileRef);

        onSave(
          finalDownloadUrl,
          logoUrlFront || '',
          logoUrlBack || undefined,
          logoUrlLeftSleeve || undefined,
          logoUrlRightSleeve || undefined
        );
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
        <div className="flex-1 bg-neutral-50 flex flex-col items-center justify-center p-4 md:p-6 relative overflow-y-auto border-b md:border-b-0 md:border-r border-neutral-100 gap-4 md:gap-6 animate-in fade-in duration-300 select-none">
          
          {/* Segmented View Selector */}
          <div className="flex bg-neutral-200/50 p-1 rounded-2xl gap-1 shadow-inner shrink-0 flex-wrap justify-center">
            {[
              { id: 'front', label: 'Front View' },
              { id: 'back', label: 'Back View' },
              { id: 'left-sleeve', label: 'Left Sleeve' },
              { id: 'right-sleeve', label: 'Right Sleeve' }
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-white text-black shadow-sm'
                    : 'text-neutral-500 hover:text-black'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Garment + Logo Wrapper */}
          <div 
            ref={containerRef}
            className="relative h-full max-h-[80vh] aspect-square bg-white rounded-[2rem] shadow-lg border border-neutral-200/60 overflow-hidden flex items-center justify-center cursor-default shrink-0 transition-all duration-300 hover:shadow-xl"
          >
            {/* Zoom Wrapper to enlarge shirt */}
            <div className="relative w-full h-full flex items-center justify-center scale-[1.1]">
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
                  <div className="w-15 h-15 bg-white border border-neutral-200 text-neutral-500 rounded-full flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                    <Upload size={16} className="group-hover:text-brand-primary transition-colors" />
                  </div>
                  <p className="text-sm font-bold text-neutral-700 group-hover:text-brand-primary transition-colors">No logo uploaded yet</p>
                  <p className="text-xs text-neutral-500 max-w-[200px] leading-relaxed">
                    Click here or upload a transparent logo file on the right side to overlay on the shirt ({activeTab.toUpperCase()}).
                  </p>
                </label>
              )}
            </div>
            
            <span className="absolute bottom-4 left-4 text-[9px] font-bold uppercase tracking-widest text-neutral-400 bg-neutral-50 border border-neutral-200 px-2 py-0.5 rounded shadow-sm z-30">
              Active Placement: {activeTab.toUpperCase()}
            </span>
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
              disabled={isSaving || (!logoUrlFront && !logoUrlBack && !logoUrlLeftSleeve && !logoUrlRightSleeve)}
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
