import { useState, useEffect, useRef } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../lib/firebase';
import { X, Upload, Loader2, Maximize, Move, Check, FileText } from 'lucide-react';

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
  const [placement, setPlacement] = useState('Front');
  const [assets, setAssets] = useState<any[]>([]);
  const [isLoadingAssets, setIsLoadingAssets] = useState(true);
  const [selectedLogo, setSelectedLogo] = useState<any | null>(null);
  
  // Customizer sliders
  const [scale, setScale] = useState(30); // 10% - 100%
  const [offsetX, setOffsetX] = useState(50); // 0% - 100% (center-based)
  const [offsetY, setOffsetY] = useState(45); // 0% - 100%

  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const previewRef = useRef<HTMLDivElement>(null);

  const activeMockupImage = garment.images?.[selectedColor] || garment.image || 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&q=80&w=200&h=200';

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
            setSelectedLogo(data.assets[0]);
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
      // Create canvas composite image
      const canvas = document.createElement('canvas');
      canvas.width = 600;
      canvas.height = 600;
      const ctx = canvas.getContext('2d');

      if (!ctx) throw new Error("Could not get 2D context");

      // Draw background/garment image
      const garmentImg = new Image();
      garmentImg.crossOrigin = "anonymous";
      garmentImg.src = activeMockupImage;
      
      await new Promise((resolve, reject) => {
        garmentImg.onload = resolve;
        garmentImg.onerror = reject;
      });

      // Clear and draw garment
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, 600, 600);
      ctx.drawImage(garmentImg, 50, 50, 500, 500);

      // Draw logo overlay if selected
      if (selectedLogo) {
        const logoImg = new Image();
        logoImg.crossOrigin = "anonymous";
        logoImg.src = selectedLogo.url;
        
        await new Promise((resolve, reject) => {
          logoImg.onload = resolve;
          logoImg.onerror = reject;
        });

        // Compute positioning matching the HTML preview relative to 600x600 size
        // Sliders range from 0-100.
        // Logo size scales from 10% to 100% of maximum overlay size (e.g. 200px max)
        const maxLogoSize = 180;
        const logoWidth = maxLogoSize * (scale / 100);
        
        // Maintain aspect ratio
        const aspect = logoImg.height / logoImg.width;
        const logoHeight = logoWidth * aspect;

        // X and Y offsets map from center
        const xPos = 50 + (500 * (offsetX / 100)) - (logoWidth / 2);
        const yPos = 50 + (500 * (offsetY / 100)) - (logoHeight / 2);

        ctx.drawImage(logoImg, xPos, yPos, logoWidth, logoHeight);
      }

      // Convert to blob and upload
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error("Failed to create canvas blob");

      const compositeRef = ref(storage, `portal/${customerId}/customizations/${Date.now()}_custom.png`);
      await uploadBytes(compositeRef, blob);
      const downloadUrl = await getDownloadURL(compositeRef);

      // Return customization
      onSave({
        ...garment,
        selectedColor,
        image: downloadUrl,
        customized: true,
        logoPlacement: placement,
        logoUrl: selectedLogo?.url || null,
        logoName: selectedLogo?.name || null,
        customScale: scale,
        customOffsetX: offsetX,
        customOffsetY: offsetY
      });

      onClose();
    } catch (err) {
      console.error("Failed to generate and save mockup:", err);
      alert("Error generating customized preview. Using original garment image.");
      
      onSave({
        ...garment,
        selectedColor,
        customized: true,
        logoPlacement: placement,
        logoUrl: selectedLogo?.url || null,
        logoName: selectedLogo?.name || null
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
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 backdrop-blur-md p-4 md:p-8 animate-in fade-in duration-300">
      <div className="bg-white max-w-5xl w-full h-[90vh] rounded-[2.5rem] overflow-hidden shadow-2xl flex flex-col border border-neutral-200">
        
        {/* Header */}
        <div className="px-8 py-5 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50">
          <div>
            <h2 className="text-xl font-serif text-neutral-900">Garment Customizer</h2>
            <p className="text-xs font-semibold text-neutral-500 mt-0.5">Customize {garment.style || 'style'}</p>
          </div>
          <button 
            onClick={onClose} 
            className="w-10 h-10 rounded-full bg-white border border-neutral-200 flex items-center justify-center text-neutral-500 hover:text-black hover:border-black transition-all shadow-sm"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          
          {/* Left Panel: Preview (Canvas Overlay Simulation) */}
          <div className="flex-1 bg-neutral-100/50 flex items-center justify-center p-6 relative overflow-hidden border-b md:border-b-0 md:border-r border-neutral-100">
            <div 
              ref={previewRef}
              className="relative w-full max-w-[420px] aspect-square bg-white rounded-3xl border border-neutral-200/50 shadow-md p-4 flex items-center justify-center overflow-hidden"
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
                  className="absolute pointer-events-none flex items-center justify-center border border-dashed border-neutral-400/30 transition-all duration-75"
                  style={{
                    width: `${scale * 1.8}px`,
                    left: `${offsetX}%`,
                    top: `${offsetY}%`,
                    transform: 'translate(-50%, -50%)',
                    zIndex: 20
                  }}
                >
                  <img 
                    src={selectedLogo.url} 
                    alt="Logo Overlay" 
                    className="max-w-full max-h-full object-contain pointer-events-none" 
                  />
                </div>
              )}
              
              {selectedLogo && !isImageFile(selectedLogo.name) && (
                <div 
                  className="absolute pointer-events-none bg-neutral-900/80 text-white rounded-xl px-3 py-2 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-md border border-white/20"
                  style={{
                    left: `${offsetX}%`,
                    top: `${offsetY}%`,
                    transform: 'translate(-50%, -50%)',
                    zIndex: 20
                  }}
                >
                  <FileText size={12} />
                  <span>{selectedLogo.name.split('.').pop() || 'FILE'}</span>
                </div>
              )}

              <span className="absolute bottom-4 left-4 text-[9px] font-bold uppercase tracking-widest text-neutral-400 bg-neutral-50 border border-neutral-200 px-2 py-0.5 rounded shadow-sm z-30">
                Placement: {placement}
              </span>
            </div>
          </div>

          {/* Right Panel: Controls */}
          <div className="w-full md:w-[420px] overflow-y-auto p-8 flex flex-col gap-6">
            
            {/* Color Selector */}
            {garment.colors && garment.colors.length > 0 && (
              <div className="flex flex-col gap-2.5">
                <label className="text-xs font-bold uppercase tracking-widest text-neutral-500">Color Selection</label>
                <div className="flex flex-wrap gap-2">
                  {garment.colors.map((c: string) => (
                    <button
                      key={c}
                      onClick={() => setSelectedColor(c)}
                      className={`px-4 py-2 text-xs font-bold rounded-xl border transition-all ${
                        selectedColor === c 
                          ? 'bg-black text-white border-black shadow-sm' 
                          : 'bg-white text-neutral-700 border-neutral-200 hover:border-black/30'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Design Placement */}
            <div className="flex flex-col gap-2.5">
              <label className="text-xs font-bold uppercase tracking-widest text-neutral-500">Logo Placement</label>
              <div className="grid grid-cols-3 gap-2">
                {['Front', 'Back', 'Left Chest', 'Right Chest', 'Sleeve', 'Pocket'].map((pos) => (
                  <button
                    key={pos}
                    onClick={() => setPlacement(pos)}
                    className={`py-2 text-[11px] font-bold rounded-xl border transition-all ${
                      placement === pos 
                        ? 'bg-black text-white border-black shadow-sm' 
                        : 'bg-white text-neutral-600 border-neutral-200 hover:border-black/30'
                    }`}
                  >
                    {pos}
                  </button>
                ))}
              </div>
            </div>

            {/* Position Sliders */}
            <div className="flex flex-col gap-4 border-t border-neutral-100 pt-6">
              <label className="text-xs font-bold uppercase tracking-widest text-neutral-500">Positioning Controls</label>
              
              <div className="space-y-4 px-1">
                {/* Scale Slider */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between text-xs font-bold text-neutral-600">
                    <span className="flex items-center gap-1"><Maximize size={12} /> Size</span>
                    <span>{scale}%</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    value={scale}
                    onChange={(e) => setScale(Number(e.target.value))}
                    className="w-full accent-black cursor-pointer"
                  />
                </div>

                {/* Offset X Slider */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between text-xs font-bold text-neutral-600">
                    <span className="flex items-center gap-1"><Move size={12} /> Horizontal Position</span>
                    <span>{offsetX}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={offsetX}
                    onChange={(e) => setOffsetX(Number(e.target.value))}
                    className="w-full accent-black cursor-pointer"
                  />
                </div>

                {/* Offset Y Slider */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between text-xs font-bold text-neutral-600">
                    <span className="flex items-center gap-1"><Move size={12} className="rotate-90" /> Vertical Position</span>
                    <span>{offsetY}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={offsetY}
                    onChange={(e) => setOffsetY(Number(e.target.value))}
                    className="w-full accent-black cursor-pointer"
                  />
                </div>
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
                <div className="grid grid-cols-4 gap-2.5 max-h-[160px] overflow-y-auto pr-1">
                  {assets.map((asset) => {
                    const isSelected = selectedLogo?.id === asset.id;
                    return (
                      <button
                        key={asset.id}
                        onClick={() => setSelectedLogo(asset)}
                        className={`aspect-square rounded-xl overflow-hidden border flex items-center justify-center p-1 bg-white relative transition-all ${
                          isSelected ? 'border-black ring-2 ring-black' : 'border-neutral-200 hover:border-neutral-400'
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
            className="bg-white border border-neutral-200 text-neutral-900 px-6 py-3 rounded-xl text-xs font-bold hover:bg-neutral-100 transition-all shadow-sm"
          >
            Cancel
          </button>
          <button 
            disabled={isSaving || isUploading}
            onClick={handleSave}
            className="bg-black text-white px-6 py-3 rounded-xl text-xs font-bold hover:bg-neutral-800 transition-all shadow-md flex items-center gap-1.5"
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
    </div>
  );
}
