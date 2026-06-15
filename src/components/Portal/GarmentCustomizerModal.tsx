import { useState, useEffect, useRef } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../lib/firebase';
import { X, Upload, Loader2, Check, FileText } from 'lucide-react';
import { getSwatchColor } from '../shared/GarmentBrowser';

interface GarmentCustomizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  garment: any; // style, itemNum, image, colors, etc.
  customerId: string;
  onSave: (customizedGarment: any) => void;
}

export function GarmentCustomizerModal({
  isOpen,
  onClose,
  garment,
  customerId,
  onSave
}: GarmentCustomizerModalProps) {
  const [selectedColor, setSelectedColor] = useState('');
  const [activeTab, setActiveTab] = useState<'front' | 'back'>('front');

  // Vault/Assets
  const [assets, setAssets] = useState<any[]>([]);
  const [isLoadingAssets, setIsLoadingAssets] = useState(true);

  // Logo overlay states for Front
  const [selectedLogoFront, setSelectedLogoFront] = useState<any | null>(null);
  const [scaleFront, setScaleFront] = useState(30);
  const [offsetXFront, setOffsetXFront] = useState(50);
  const [offsetYFront, setOffsetYFront] = useState(45);
  const [placementFront, setPlacementFront] = useState('Front');

  // Logo overlay states for Back
  const [selectedLogoBack, setSelectedLogoBack] = useState<any | null>(null);
  const [scaleBack, setScaleBack] = useState(30);
  const [offsetXBack, setOffsetXBack] = useState(50);
  const [offsetYBack, setOffsetYBack] = useState(40);
  const [placementBack, setPlacementBack] = useState('Back');

  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const previewRef = useRef<HTMLDivElement>(null);

  // Helper getters/setters mapping to active view
  const selectedLogo = activeTab === 'front' ? selectedLogoFront : selectedLogoBack;
  
  const setSelectedLogo = (asset: any) => {
    if (activeTab === 'front') setSelectedLogoFront(asset);
    else setSelectedLogoBack(asset);
  };

  const scale = activeTab === 'front' ? scaleFront : scaleBack;
  const offsetX = activeTab === 'front' ? offsetXFront : offsetXBack;
  const offsetY = activeTab === 'front' ? offsetYFront : offsetYBack;
  const placement = activeTab === 'front' ? placementFront : placementBack;

  const setOffsetX = (val: number) => {
    if (activeTab === 'front') setOffsetXFront(val);
    else setOffsetXBack(val);
  };

  const setOffsetY = (val: number) => {
    if (activeTab === 'front') setOffsetYFront(val);
    else setOffsetYBack(val);
  };

  const setPlacement = (val: string) => {
    if (activeTab === 'front') setPlacementFront(val);
    else setPlacementBack(val);
  };

  // Image source path resolver
  const frontImage = garment.images?.[selectedColor]?.front || garment.images?.[selectedColor] || garment.image || 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&q=80&w=200&h=200';
  const backImage = garment.backImages?.[selectedColor] || garment.images?.[selectedColor]?.back || null;

  const activeMockupImage = activeTab === 'front' ? frontImage : (backImage || frontImage);

  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0, offsetX: 50, offsetY: 45 });
  const resizeStartPos = useRef({ x: 0, scale: 30 });

  const handleDragMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsDragging(true);
    dragStartPos.current = {
      x: e.clientX,
      y: e.clientY,
      offsetX,
      offsetY
    };
  };

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(true);
    resizeStartPos.current = {
      x: e.clientX,
      scale
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging && previewRef.current) {
        const rect = previewRef.current.getBoundingClientRect();
        const xPercent = ((e.clientX - rect.left) / rect.width) * 100;
        const yPercent = ((e.clientY - rect.top) / rect.height) * 100;
        const valX = Math.max(0, Math.min(100, Math.round(xPercent)));
        const valY = Math.max(0, Math.min(100, Math.round(yPercent)));
        
        if (activeTab === 'front') {
          setOffsetXFront(valX);
          setOffsetYFront(valY);
        } else {
          setOffsetXBack(valX);
          setOffsetYBack(valY);
        }
      }

      if (isResizing) {
        const deltaX = e.clientX - resizeStartPos.current.x;
        const newScale = resizeStartPos.current.scale + (deltaX / 1.8);
        const valScale = Math.max(10, Math.min(100, Math.round(newScale)));
        
        if (activeTab === 'front') {
          setScaleFront(valScale);
        } else {
          setScaleBack(valScale);
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
  }, [isDragging, isResizing, scale, offsetX, offsetY, activeTab]);

  // Initialize
  useEffect(() => {
    if (garment) {
      setSelectedColor(garment.selectedColor || garment.colors?.[0] || 'Custom Color');
    }
  }, [garment]);

  // Fetch customer assets (logos)
  useEffect(() => {
    const fetchAssets = async () => {
      if (!customerId) return;
      setIsLoadingAssets(true);
      try {
        const docRef = doc(db, 'customers', customerId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setAssets(data.assets || []);
          if (data.assets && data.assets.length > 0) {
            setSelectedLogoFront(data.assets[0]);
          }
        }
      } catch (err) {
        console.error("Error fetching assets for customizer:", err);
      } finally {
        setIsLoadingAssets(false);
      }
    };
    fetchAssets();
  }, [customerId, isOpen]);

  if (!isOpen || !garment) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const storageRef = ref(storage, `portal/${customerId}/vault/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(storageRef);

      const newAsset = {
        id: `asset-${Date.now()}`,
        name: file.name,
        url: downloadUrl,
        uploadedAt: new Date().toISOString()
      };

      const updatedAssets = [...assets, newAsset];
      
      await updateDoc(doc(db, 'customers', customerId), {
        assets: updatedAssets
      });

      setAssets(updatedAssets);
      setSelectedLogo(newAsset);
      alert("Logo uploaded to your vault!");
    } catch (err) {
      console.error("Logo upload failed:", err);
      alert("Failed to upload logo.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);

    try {
      const hasFront = !!selectedLogoFront;
      const hasBack = !!selectedLogoBack && !!backImage;
      const isSideBySide = hasFront && hasBack;

      const canvas = document.createElement('canvas');
      canvas.width = isSideBySide ? 1200 : 600;
      canvas.height = 600;
      const ctx = canvas.getContext('2d');

      if (!ctx) throw new Error("Could not get 2D context");

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, 600);

      const loadImg = (src: string): Promise<HTMLImageElement> => {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.src = src;
          img.onload = () => resolve(img);
          img.onerror = reject;
        });
      };

      const drawSide = async (garmentSrc: string, logoAsset: any, scaleVal: number, offX: number, offY: number, canvasOffsetX: number) => {
        const garmentImg = await loadImg(garmentSrc);
        ctx.drawImage(garmentImg, canvasOffsetX + 50, 50, 500, 500);

        if (logoAsset) {
          const logoImg = await loadImg(logoAsset.url);
          const maxLogoSize = 180;
          const logoWidth = maxLogoSize * (scaleVal / 100);
          const aspect = logoImg.height / logoImg.width;
          const logoHeight = logoWidth * aspect;

          const xPos = canvasOffsetX + 50 + (500 * (offX / 100)) - (logoWidth / 2);
          const yPos = 50 + (500 * (offY / 100)) - (logoHeight / 2);

          ctx.drawImage(logoImg, xPos, yPos, logoWidth, logoHeight);
        }
      };

      if (isSideBySide) {
        await drawSide(frontImage, selectedLogoFront, scaleFront, offsetXFront, offsetYFront, 0);
        await drawSide(backImage, selectedLogoBack, scaleBack, offsetXBack, offsetYBack, 600);
      } else if (hasBack) {
        await drawSide(backImage, selectedLogoBack, scaleBack, offsetXBack, offsetYBack, 0);
      } else {
        await drawSide(frontImage, selectedLogoFront, scaleFront, offsetXFront, offsetYFront, 0);
      }

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error("Failed to create canvas blob");

      const compositeRef = ref(storage, `portal/${customerId}/customizations/${Date.now()}_custom.png`);
      await uploadBytes(compositeRef, blob);
      const downloadUrl = await getDownloadURL(compositeRef);

      onSave({
        ...garment,
        selectedColor,
        image: downloadUrl,
        customized: true,
        logoPlacement: selectedLogoFront && selectedLogoBack && backImage
          ? `Front: ${placementFront}, Back: ${placementBack}`
          : selectedLogoBack && backImage
            ? `Back: ${placementBack}`
            : `Front: ${placementFront}`,
        logoUrl: selectedLogoFront?.url || null,
        logoName: selectedLogoFront?.name || null,
        logoUrlBack: selectedLogoBack?.url || null,
        logoNameBack: selectedLogoBack?.name || null,
        customScaleFront: scaleFront,
        customOffsetXFront: offsetXFront,
        customOffsetYFront: offsetYFront,
        customScaleBack: scaleBack,
        customOffsetXBack: offsetXBack,
        customOffsetYBack: offsetYBack
      });

      onClose();
    } catch (err) {
      console.error("Failed to generate and save mockup:", err);
      alert("Error generating customized preview. Using original garment image.");
      
      onSave({
        ...garment,
        selectedColor,
        customized: true,
        logoPlacement: selectedLogoFront && selectedLogoBack && backImage
          ? `Front: ${placementFront}, Back: ${placementBack}`
          : selectedLogoBack && backImage
            ? `Back: ${placementBack}`
            : `Front: ${placementFront}`,
        logoUrl: selectedLogoFront?.url || null,
        logoName: selectedLogoFront?.name || null,
        logoUrlBack: selectedLogoBack?.url || null,
        logoNameBack: selectedLogoBack?.name || null
      });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const isImageFile = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext || '');
  };

  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-white animate-in fade-in duration-300 font-sans">
      
      {/* Header */}
      <div className="px-8 py-5 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50 shrink-0">
        <div>
          <h2 className="text-xl font-serif text-neutral-900">Garment Customizer</h2>
          <p className="text-xs font-semibold text-neutral-500 mt-0.5">Customize {garment.style || 'style'}</p>
        </div>
        <button 
          onClick={onClose} 
          className="w-10 h-10 rounded-full bg-white border border-neutral-200 flex items-center justify-center text-neutral-500 hover:text-black hover:border-black transition-all shadow-sm cursor-pointer animate-in zoom-in duration-200"
        >
          <X size={20} />
        </button>
      </div>

      {/* Content Body */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        
        {/* Left Panel: Preview Workspace */}
        <div className="flex-1 bg-neutral-50 flex flex-col items-center justify-center p-8 relative overflow-y-auto border-b md:border-b-0 md:border-r border-neutral-100 gap-8 animate-in fade-in duration-300">
          
          {/* Segmented View Selector */}
          {backImage && (
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

          {/* Garment Preview Container */}
          <div 
            ref={previewRef}
            className="relative w-full max-w-[550px] aspect-[4/5] bg-white rounded-[2rem] border border-neutral-200/50 shadow-lg p-6 flex items-center justify-center overflow-hidden shrink-0 transition-all duration-300 hover:shadow-xl"
          >
            {/* Main Garment Image */}
            <img 
              src={activeMockupImage} 
              alt={garment.style} 
              className="max-w-full max-h-full object-contain mix-blend-multiply select-none pointer-events-none" 
            />

            {/* Logo Overlay */}
            {selectedLogo && isImageFile(selectedLogo.name) && (
              <div 
                onMouseDown={handleDragMouseDown}
                style={{
                  width: `${scale * 2.2}px`,
                  left: `${offsetX}%`,
                  top: `${offsetY}%`,
                  transform: 'translate(-50%, -50%)',
                  zIndex: 20
                }}
                className="absolute flex items-center justify-center border border-dashed border-black/40 group/logo select-none cursor-move p-1 bg-white/10 backdrop-blur-[0.5px]"
              >
                <img 
                  src={selectedLogo.url} 
                  alt="Logo Overlay" 
                  className="max-w-full max-h-full object-contain pointer-events-none" 
                />
                <div 
                  onMouseDown={handleResizeMouseDown}
                  className="absolute bottom-[-6px] right-[-6px] w-3.5 h-3.5 bg-black border-2 border-white rounded-full cursor-se-resize shadow-md hover:scale-125 transition-transform z-30"
                />
              </div>
            )}
            
            {selectedLogo && !isImageFile(selectedLogo.name) && (
              <div 
                onMouseDown={handleDragMouseDown}
                style={{
                  left: `${offsetX}%`,
                  top: `${offsetY}%`,
                  transform: 'translate(-50%, -50%)',
                  zIndex: 20
                }}
                className="absolute bg-neutral-900/80 text-white rounded-xl px-3.5 py-2 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-md border border-white/20 cursor-move select-none p-1 group/logo"
              >
                <FileText size={12} />
                <span>{selectedLogo.name.split('.').pop() || 'FILE'}</span>
                <div 
                  onMouseDown={handleResizeMouseDown}
                  className="absolute bottom-[-6px] right-[-6px] w-3.5 h-3.5 bg-black border-2 border-white rounded-full cursor-se-resize shadow-md hover:scale-125 transition-transform z-30"
                />
              </div>
            )}

            <span className="absolute bottom-4 left-4 text-[9px] font-bold uppercase tracking-widest text-neutral-400 bg-neutral-50 border border-neutral-200 px-2 py-0.5 rounded shadow-sm z-30">
              Placement: {placement} ({activeTab.toUpperCase()})
            </span>
          </div>

          {/* Circular Swatches below garment */}
          {garment.colors && garment.colors.length > 0 && (
            <div className="w-full max-w-[550px] flex flex-col gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 text-center">
                Select Garment Color: <strong className="text-neutral-900">{selectedColor}</strong>
              </span>
              <div className="flex flex-wrap gap-2.5 justify-center max-h-[140px] overflow-y-auto p-1 custom-scrollbar">
                {garment.colors.map((c: string) => {
                  const swatchHex = getSwatchColor(c, true);
                  const isActive = selectedColor === c;
                  const isWhite = c.toLowerCase() === 'white';
                  
                  return (
                    <button
                      key={c}
                      type="button"
                      title={c}
                      onClick={() => setSelectedColor(c)}
                      className={`w-6.5 h-6.5 rounded-full border transition-all relative cursor-pointer ${
                        isActive 
                          ? 'ring-2 ring-black ring-offset-2 scale-110 shadow-sm' 
                          : 'border-neutral-300 hover:scale-105'
                      }`}
                      style={{ 
                        backgroundColor: swatchHex.startsWith('linear-gradient') ? 'transparent' : swatchHex,
                        backgroundImage: swatchHex.startsWith('linear-gradient') ? swatchHex : 'none',
                        borderColor: isWhite ? '#D1D5DB' : 'transparent' 
                      }}
                    >
                      {isActive && (
                        <span className="absolute inset-0 flex items-center justify-center">
                          <Check 
                            size={12} 
                            strokeWidth={3}
                            className={c.toLowerCase() === 'white' || c.toLowerCase() === 'silver' || c.toLowerCase() === 'athletic heather' ? 'text-black' : 'text-white'} 
                          />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right Panel: Controls */}
        <div className="w-full md:w-[420px] overflow-y-auto p-8 flex flex-col gap-6 shrink-0 border-l border-neutral-150 bg-white shadow-sm">
          
          {/* Design Placement Presets */}
          <div className="flex flex-col gap-2.5">
            <label className="text-xs font-bold uppercase tracking-widest text-neutral-500">Logo Placement Presets</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { name: 'Center Front', pos: 'Front', x: 50, y: 45, tab: 'front' },
                { name: 'Center Back', pos: 'Back', x: 50, y: 40, tab: 'back' },
                { name: 'Left Chest', pos: 'Left Chest', x: 38, y: 32, tab: 'front' },
                { name: 'Right Chest', pos: 'Right Chest', x: 62, y: 32, tab: 'front' },
                { name: 'Left Sleeve', pos: 'Sleeve', x: 20, y: 35 },
                { name: 'Right Sleeve', pos: 'Sleeve', x: 80, y: 35 }
              ].map((preset) => {
                const isPresetActive = activeTab === (preset.tab || activeTab) && placement === preset.pos && offsetX === preset.x && offsetY === preset.y;
                const isBackPreset = preset.tab === 'back';
                const isBackDisabled = isBackPreset && !backImage;

                return (
                  <button
                    key={preset.name}
                    type="button"
                    disabled={isBackDisabled}
                    onClick={() => {
                      if (preset.tab) {
                        setActiveTab(preset.tab as 'front' | 'back');
                      }
                      if (preset.tab === 'front') {
                        setOffsetXFront(preset.x);
                        setOffsetYFront(preset.y);
                        setPlacementFront(preset.pos);
                      } else if (preset.tab === 'back') {
                        setOffsetXBack(preset.x);
                        setOffsetYBack(preset.y);
                        setPlacementBack(preset.pos);
                      } else {
                        setOffsetX(preset.x);
                        setOffsetY(preset.y);
                        setPlacement(preset.pos);
                      }
                    }}
                    className={`py-3 px-2 text-[11px] font-bold rounded-xl border transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                      isPresetActive
                        ? 'bg-black text-white border-black shadow-sm' 
                        : 'bg-white text-neutral-600 border-neutral-200 hover:border-black/30'
                    }`}
                  >
                    {preset.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Logo Vault Selection */}
          <div className="flex flex-col gap-3 border-t border-neutral-100 pt-6">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold uppercase tracking-widest text-neutral-500">Select Logo</label>
              <label className="text-xs font-bold text-neutral-600 hover:text-black cursor-pointer flex items-center gap-1">
                <input type="file" className="hidden" onChange={handleFileUpload} accept="image/*,application/pdf" />
                <Upload size={12} /> Upload New
              </label>
            </div>

            {isLoadingAssets ? (
              <div className="flex justify-center py-6 text-neutral-400">
                <Loader2 className="animate-spin" size={20} />
              </div>
            ) : assets.length === 0 ? (
              <div className="bg-neutral-50 rounded-2xl p-4 text-center border border-dashed border-neutral-200">
                <p className="text-xs font-semibold text-neutral-500">No logos saved in your vault.</p>
                <label className="text-xs font-bold text-black hover:underline cursor-pointer mt-1 inline-block">
                  <input type="file" className="hidden" onChange={handleFileUpload} accept="image/*,application/pdf" />
                  Upload logo to begin
                </label>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2.5 max-h-[220px] overflow-y-auto pr-1">
                {assets.map((asset) => {
                  const isSelected = selectedLogo?.id === asset.id;
                  return (
                    <button
                      key={asset.id}
                      onClick={() => setSelectedLogo(asset)}
                      className={`aspect-square rounded-xl overflow-hidden border flex items-center justify-center p-1 bg-white relative transition-all ${
                        isSelected ? 'border-black ring-2 ring-black scale-[0.98]' : 'border-neutral-200 hover:border-neutral-450'
                      }`}
                      title={asset.name}
                    >
                      {isImageFile(asset.name) ? (
                        <img src={asset.url} alt={asset.name} className="max-w-full max-h-full object-contain mix-blend-multiply" />
                      ) : (
                        <FileText size={18} className="text-neutral-500" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Footer Actions */}
      <div className="px-8 py-5 border-t border-neutral-100 flex justify-end gap-3 bg-neutral-50/50 shrink-0">
        <button 
          onClick={onClose}
          className="bg-white border border-neutral-200 text-neutral-900 px-6 py-3 rounded-xl text-xs font-bold hover:bg-neutral-100 transition-all shadow-sm cursor-pointer"
        >
          Cancel
        </button>
        <button 
          disabled={isSaving || isUploading}
          onClick={handleSave}
          className="bg-black text-white px-6 py-3 rounded-xl text-xs font-bold hover:bg-neutral-800 transition-all shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? (
            <Loader2 className="animate-spin" size={14} />
          ) : (
            <Check size={14} strokeWidth={3} />
          )}
          {isSaving ? "Saving Mockup..." : "Save Customization"}
        </button>
      </div>

    </div>
  );
}
