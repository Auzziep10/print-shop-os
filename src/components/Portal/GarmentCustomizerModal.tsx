import { useState, useEffect, useRef, useMemo } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../lib/firebase';
import { X, Upload, Loader2, Check, FileText, Sparkles } from 'lucide-react';
import { getSwatchColor } from '../shared/GarmentBrowser';
import sanmarCatalogJson from '../../data/sanmar-catalog.json';

const sanmarCatalog = sanmarCatalogJson as any[];

const getSingularCategory = (category: string = '', title: string = '') => {
  const text = (category + ' ' + title).toLowerCase();
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
  const [activeTab, setActiveTab] = useState<'front' | 'back' | 'left-sleeve' | 'right-sleeve'>('front');
  const [isColorDropdownOpen, setIsColorDropdownOpen] = useState(false);

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

  // Logo overlay states for Left Sleeve
  const [selectedLogoLeftSleeve, setSelectedLogoLeftSleeve] = useState<any | null>(null);
  const [scaleLeftSleeve, setScaleLeftSleeve] = useState(30);
  const [offsetXLeftSleeve, setOffsetXLeftSleeve] = useState(50);
  const [offsetYLeftSleeve, setOffsetYLeftSleeve] = useState(50);
  const [placementLeftSleeve, setPlacementLeftSleeve] = useState('Left Sleeve');

  // Logo overlay states for Right Sleeve
  const [selectedLogoRightSleeve, setSelectedLogoRightSleeve] = useState<any | null>(null);
  const [scaleRightSleeve, setScaleRightSleeve] = useState(30);
  const [offsetXRightSleeve, setOffsetXRightSleeve] = useState(50);
  const [offsetYRightSleeve, setOffsetYRightSleeve] = useState(50);
  const [placementRightSleeve, setPlacementRightSleeve] = useState('Right Sleeve');

  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [generatedViews, setGeneratedViews] = useState<Record<string, string>>({});
  const [isGeneratingView, setIsGeneratingView] = useState(false);

  // Reset generated views on style/color change
  useEffect(() => {
    setGeneratedViews({});
  }, [garment?.style, selectedColor]);

  const previewRef = useRef<HTMLDivElement>(null);

  // Helper getters/setters mapping to active view
  const selectedLogo = useMemo(() => {
    if (activeTab === 'front') return selectedLogoFront;
    if (activeTab === 'back') return selectedLogoBack;
    if (activeTab === 'left-sleeve') return selectedLogoLeftSleeve;
    return selectedLogoRightSleeve;
  }, [activeTab, selectedLogoFront, selectedLogoBack, selectedLogoLeftSleeve, selectedLogoRightSleeve]);
  
  const setSelectedLogo = (asset: any) => {
    if (activeTab === 'front') setSelectedLogoFront(asset);
    else if (activeTab === 'back') setSelectedLogoBack(asset);
    else if (activeTab === 'left-sleeve') setSelectedLogoLeftSleeve(asset);
    else setSelectedLogoRightSleeve(asset);
  };

  const scale = useMemo(() => {
    if (activeTab === 'front') return scaleFront;
    if (activeTab === 'back') return scaleBack;
    if (activeTab === 'left-sleeve') return scaleLeftSleeve;
    return scaleRightSleeve;
  }, [activeTab, scaleFront, scaleBack, scaleLeftSleeve, scaleRightSleeve]);

  const offsetX = useMemo(() => {
    if (activeTab === 'front') return offsetXFront;
    if (activeTab === 'back') return offsetXBack;
    if (activeTab === 'left-sleeve') return offsetXLeftSleeve;
    return offsetXRightSleeve;
  }, [activeTab, offsetXFront, offsetXBack, offsetXLeftSleeve, offsetXRightSleeve]);

  const offsetY = useMemo(() => {
    if (activeTab === 'front') return offsetYFront;
    if (activeTab === 'back') return offsetYBack;
    if (activeTab === 'left-sleeve') return offsetYLeftSleeve;
    return offsetYRightSleeve;
  }, [activeTab, offsetYFront, offsetYBack, offsetYLeftSleeve, offsetYRightSleeve]);

  const placement = useMemo(() => {
    if (activeTab === 'front') return placementFront;
    if (activeTab === 'back') return placementBack;
    if (activeTab === 'left-sleeve') return placementLeftSleeve;
    return placementRightSleeve;
  }, [activeTab, placementFront, placementBack, placementLeftSleeve, placementRightSleeve]);

  // Find product in catalog as fallback for images
  const catalogProduct = useMemo(() => {
    const styleStr = garment.style || garment.itemNum || '';
    if (!styleStr) return null;
    
    // First try exact match
    let found = sanmarCatalog.find(
      (p) => p.style.toLowerCase() === styleStr.toLowerCase()
    );
    if (found) return found;

    // Try finding a catalog style code that is contained within the styleStr (e.g., "NL6210" in the title string)
    // Sort catalog by style length descending so that we match longer style codes first
    const sortedCatalog = [...sanmarCatalog].sort((a, b) => b.style.length - a.style.length);
    found = sortedCatalog.find(
      (p) => styleStr.toLowerCase().includes(p.style.toLowerCase())
    );
    return found || null;
  }, [garment.style, garment.itemNum]);

  // Case-insensitive image resolver
  const { frontImage, backImage, leftSleeveImage, rightSleeveImage } = useMemo(() => {
    if (!selectedColor) {
      return {
        frontImage: garment.image || '',
        backImage: null,
        leftSleeveImage: null,
        rightSleeveImage: null
      };
    }

    // 1. Resolve from garment.images case-insensitively
    const garmentImages = garment.images || {};
    const garmentImgKey = Object.keys(garmentImages).find(
      (k) => k.toLowerCase() === selectedColor.toLowerCase()
    );
    const garmentColorVal = garmentImgKey ? garmentImages[garmentImgKey] : null;

    const garmentFront = garmentColorVal?.front || (typeof garmentColorVal === 'string' ? garmentColorVal : null);
    let garmentBack = garmentColorVal?.back || null;

    // 2. Resolve garment.backImages case-insensitively
    const garmentBackImages = garment.backImages || {};
    const garmentBackImgKey = Object.keys(garmentBackImages).find(
      (k) => k.toLowerCase() === selectedColor.toLowerCase()
    );
    if (garmentBackImgKey) {
      garmentBack = garmentBackImages[garmentBackImgKey];
    }

    // 3. Fallback to catalogProduct case-insensitively if front/back are missing
    let catalogFront = null;
    let catalogBack = null;
    if (catalogProduct) {
      const catalogImages = catalogProduct.images || {};
      const catalogImgKey = Object.keys(catalogImages).find(
        (k) => k.toLowerCase() === selectedColor.toLowerCase()
      );
      const catalogColorVal = catalogImgKey ? catalogImages[catalogImgKey] : null;
      catalogFront = catalogColorVal?.front || (typeof catalogColorVal === 'string' ? catalogColorVal : null);
      catalogBack = catalogColorVal?.back || null;
    }

    const cleanColor = selectedColor.trim();

    // Map high-quality pre-generated sleeve mockups for NL6210 (Charcoal and Black)
    const styleCode = catalogProduct ? catalogProduct.style.toUpperCase() : '';
    const colorLower = cleanColor.toLowerCase();
    
    let localLeftSleeve = null;
    let localRightSleeve = null;
    if (styleCode === 'NL6210') {
      if (colorLower.includes('charcoal')) {
        localLeftSleeve = '/mockups/NL6210/left_sleeve.png';
        localRightSleeve = '/mockups/NL6210/right_sleeve.png';
      } else if (colorLower.includes('black')) {
        localLeftSleeve = '/mockups/NL6210/black_left_sleeve.png';
        localRightSleeve = '/mockups/NL6210/black_right_sleeve.png';
      }
    }

    const finalFront = garmentFront || catalogFront || garment.image || 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&q=80&w=200&h=200';
    const finalBack = garmentBack || catalogBack || generatedViews.back || null;
    const finalLeftSleeve = localLeftSleeve || generatedViews['left-sleeve'] || null;
    const finalRightSleeve = localRightSleeve || generatedViews['right-sleeve'] || null;

    return { 
      frontImage: finalFront, 
      backImage: finalBack,
      leftSleeveImage: finalLeftSleeve,
      rightSleeveImage: finalRightSleeve
    };
  }, [garment, selectedColor, catalogProduct, generatedViews]);

  const activeMockupImage = useMemo(() => {
    if (activeTab === 'front') return frontImage;
    if (activeTab === 'back') return backImage || frontImage;
    if (activeTab === 'left-sleeve') return leftSleeveImage || frontImage;
    return rightSleeveImage || frontImage;
  }, [activeTab, frontImage, backImage, leftSleeveImage, rightSleeveImage]);

  const proxiedActiveMockupImage = useMemo(() => {
    if (!activeMockupImage) return '';
    return activeMockupImage.startsWith('http')
      ? `/api/sanmar/proxy-image?url=${encodeURIComponent(activeMockupImage)}`
      : activeMockupImage;
  }, [activeMockupImage]);

  const needsGeneration = useMemo(() => {
    if (activeTab === 'front') return false;
    if (activeTab === 'back') return !backImage;
    if (activeTab === 'left-sleeve') return !leftSleeveImage;
    return !rightSleeveImage;
  }, [activeTab, backImage, leftSleeveImage, rightSleeveImage]);

  const isGenerated = !!generatedViews[activeTab];

  const handleGenerateView = () => {
    if (isGeneratingView) return;
    setIsGeneratingView(true);
    
    // Simulate generation loading for 1.5 seconds for a premium feel
    setTimeout(() => {
      const styleStr = garment.style || garment.itemNum || '';
      const titleStr = garment.title || '';
      const catStr = garment.category || (catalogProduct ? catalogProduct.category : '');
      const garmentType = getSingularCategory(catStr, titleStr || styleStr);
      const cleanColor = selectedColor.trim();
      const cleanStyle = styleStr.trim();
      
      if (activeTab === 'back') {
        const seedBack = getSeedForString(`${cleanStyle}-${cleanColor}-back`);
        const encodedBackPrompt = encodeURIComponent(`blank back view of ${cleanColor} ${garmentType}, flat lay, isolated on solid white background, high resolution product mockup, clean, wrinkle-free, professional studio photography`);
        const url = `https://image.pollinations.ai/prompt/${encodedBackPrompt}?width=800&height=800&nologo=true&seed=${seedBack}`;
        setGeneratedViews(prev => ({ ...prev, back: url }));
      } else if (activeTab === 'left-sleeve') {
        const seedLeftSleeve = getSeedForString(`${cleanStyle}-${cleanColor}-left-sleeve`);
        const encodedLeftSleevePrompt = encodeURIComponent(`blank side profile view of a ${cleanColor} ${garmentType} showing the left sleeve, flat lay, isolated on solid white background, high resolution product mockup, clean, wrinkle-free, professional studio photography`);
        const url = `https://image.pollinations.ai/prompt/${encodedLeftSleevePrompt}?width=800&height=800&nologo=true&seed=${seedLeftSleeve}`;
        setGeneratedViews(prev => ({ ...prev, 'left-sleeve': url }));
      } else if (activeTab === 'right-sleeve') {
        const seedRightSleeve = getSeedForString(`${cleanStyle}-${cleanColor}-right-sleeve`);
        const encodedRightSleevePrompt = encodeURIComponent(`blank side profile view of a ${cleanColor} ${garmentType} showing the right sleeve, flat lay, isolated on solid white background, high resolution product mockup, clean, wrinkle-free, professional studio photography`);
        const url = `https://image.pollinations.ai/prompt/${encodedRightSleevePrompt}?width=800&height=800&nologo=true&seed=${seedRightSleeve}`;
        setGeneratedViews(prev => ({ ...prev, 'right-sleeve': url }));
      }
      setIsGeneratingView(false);
    }, 1500);
  };

  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0, offsetX: 50, offsetY: 45 });
  const resizeStartPos = useRef({ x: 0, scale: 30, containerWidth: 500 });

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
    const containerWidth = previewRef.current?.getBoundingClientRect().width || 500;
    resizeStartPos.current = {
      x: e.clientX,
      scale,
      containerWidth
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging && previewRef.current) {
        const rect = previewRef.current.getBoundingClientRect();
        const centerXPct = 50;
        const centerYPct = 50;
        const xPercentOfCard = ((e.clientX - rect.left) / rect.width) * 100;
        const yPercentOfCard = ((e.clientY - rect.top) / rect.height) * 100;
        
        const scaleFactor = 1.1;
        const valX = Math.max(0, Math.min(100, Math.round(centerXPct + (xPercentOfCard - centerXPct) / scaleFactor)));
        const valY = Math.max(0, Math.min(100, Math.round(centerYPct + (yPercentOfCard - centerYPct) / scaleFactor)));
        
        if (activeTab === 'front') {
          setOffsetXFront(valX);
          setOffsetYFront(valY);
        } else if (activeTab === 'back') {
          setOffsetXBack(valX);
          setOffsetYBack(valY);
        } else if (activeTab === 'left-sleeve') {
          setOffsetXLeftSleeve(valX);
          setOffsetYLeftSleeve(valY);
        } else {
          setOffsetXRightSleeve(valX);
          setOffsetYRightSleeve(valY);
        }
      }

      if (isResizing) {
        const deltaX = e.clientX - resizeStartPos.current.x;
        const containerWidth = resizeStartPos.current.containerWidth || 500;
        const scaleFactor = 1.1;
        const newScale = resizeStartPos.current.scale + (((2 * deltaX) / scaleFactor) / (containerWidth * 0.0036));
        const valScale = Math.max(10, Math.min(100, Math.round(newScale)));
        
        if (activeTab === 'front') {
          setScaleFront(valScale);
        } else if (activeTab === 'back') {
          setScaleBack(valScale);
        } else if (activeTab === 'left-sleeve') {
          setScaleLeftSleeve(valScale);
        } else {
          setScaleRightSleeve(valScale);
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
      const hasBack = !!selectedLogoBack;
      const hasLeftSleeve = !!selectedLogoLeftSleeve;
      const hasRightSleeve = !!selectedLogoRightSleeve;

      // Collect all sides that are customized
      const activeSides: {
        img: string;
        logo: any;
        scale: number;
        offX: number;
        offY: number;
        name: string;
      }[] = [];

      if (hasFront) activeSides.push({ img: frontImage, logo: selectedLogoFront, scale: scaleFront, offX: offsetXFront, offY: offsetYFront, name: 'Front' });
      if (hasBack) activeSides.push({ img: backImage || frontImage, logo: selectedLogoBack, scale: scaleBack, offX: offsetXBack, offY: offsetYBack, name: 'Back' });
      if (hasLeftSleeve) activeSides.push({ img: leftSleeveImage || frontImage, logo: selectedLogoLeftSleeve, scale: scaleLeftSleeve, offX: offsetXLeftSleeve, offY: offsetYLeftSleeve, name: 'Left Sleeve' });
      if (hasRightSleeve) activeSides.push({ img: rightSleeveImage || frontImage, logo: selectedLogoRightSleeve, scale: scaleRightSleeve, offX: offsetXRightSleeve, offY: offsetYRightSleeve, name: 'Right Sleeve' });

      // If nothing is customized, default to front view
      if (activeSides.length === 0) {
        activeSides.push({ img: frontImage, logo: null, scale: 30, offX: 50, offY: 45, name: 'Front' });
      }

      const panelWidth = 600;
      const canvasWidth = panelWidth * activeSides.length;
      const canvasHeight = 600;

      const canvas = document.createElement('canvas');
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      const ctx = canvas.getContext('2d');

      if (!ctx) throw new Error("Could not get 2D context");

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const loadImg = (src: string): Promise<HTMLImageElement> => {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.src = src;
          img.onload = () => resolve(img);
          img.onerror = reject;
        });
      };

      const drawSide = async (garmentSrc: string, logoAsset: any, scaleVal: number, offX: number, offY: number, canvasOffsetX: number, sideName: string) => {
        const proxiedGarmentSrc = garmentSrc.startsWith('http')
          ? `/api/sanmar/proxy-image?url=${encodeURIComponent(garmentSrc)}`
          : garmentSrc;
        const garmentImg = await loadImg(proxiedGarmentSrc);

        ctx.save();
        if (sideName === 'Right Sleeve') {
          ctx.translate(canvasOffsetX + 50 + 250, 50 + 250);
          ctx.scale(-1, 1);
          ctx.drawImage(garmentImg, -250, -250, 500, 500);
        } else {
          ctx.drawImage(garmentImg, canvasOffsetX + 50, 50, 500, 500);
        }
        ctx.restore();

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

      for (let i = 0; i < activeSides.length; i++) {
        const side = activeSides[i];
        await drawSide(side.img, side.logo, side.scale, side.offX, side.offY, i * panelWidth, side.name);
      }

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error("Failed to create canvas blob");

      const compositeRef = ref(storage, `portal/${customerId}/customizations/${Date.now()}_custom.png`);
      await uploadBytes(compositeRef, blob);
      const downloadUrl = await getDownloadURL(compositeRef);

      const placementParts: string[] = [];
      if (hasFront) placementParts.push(`Front: ${placementFront}`);
      if (hasBack) placementParts.push(`Back: ${placementBack}`);
      if (hasLeftSleeve) placementParts.push(`Left Sleeve: ${placementLeftSleeve}`);
      if (hasRightSleeve) placementParts.push(`Right Sleeve: ${placementRightSleeve}`);

      onSave({
        ...garment,
        selectedColor,
        image: downloadUrl,
        customized: true,
        logoPlacement: placementParts.join(', ') || 'Front',
        logoUrl: selectedLogoFront?.url || null,
        logoName: selectedLogoFront?.name || null,
        logoUrlBack: selectedLogoBack?.url || null,
        logoNameBack: selectedLogoBack?.name || null,
        logoUrlLeftSleeve: selectedLogoLeftSleeve?.url || null,
        logoNameLeftSleeve: selectedLogoLeftSleeve?.name || null,
        logoUrlRightSleeve: selectedLogoRightSleeve?.url || null,
        logoNameRightSleeve: selectedLogoRightSleeve?.name || null,
        customScaleFront: scaleFront,
        customOffsetXFront: offsetXFront,
        customOffsetYFront: offsetYFront,
        customScaleBack: scaleBack,
        customOffsetXBack: offsetXBack,
        customOffsetYBack: offsetYBack,
        customScaleLeftSleeve: scaleLeftSleeve,
        customOffsetXLeftSleeve: offsetXLeftSleeve,
        customOffsetYLeftSleeve: offsetYLeftSleeve,
        customScaleRightSleeve: scaleRightSleeve,
        customOffsetXRightSleeve: offsetXRightSleeve,
        customOffsetYRightSleeve: offsetYRightSleeve
      });

      onClose();
    } catch (err) {
      console.error("Failed to generate and save mockup:", err);
      alert("Error generating customized preview. Using original garment image.");
      
      const placementParts: string[] = [];
      if (selectedLogoFront) placementParts.push(`Front: ${placementFront}`);
      if (selectedLogoBack) placementParts.push(`Back: ${placementBack}`);
      if (selectedLogoLeftSleeve) placementParts.push(`Left Sleeve: ${placementLeftSleeve}`);
      if (selectedLogoRightSleeve) placementParts.push(`Right Sleeve: ${placementRightSleeve}`);

      onSave({
        ...garment,
        selectedColor,
        customized: true,
        logoPlacement: placementParts.join(', ') || 'Front',
        logoUrl: selectedLogoFront?.url || null,
        logoName: selectedLogoFront?.name || null,
        logoUrlBack: selectedLogoBack?.url || null,
        logoNameBack: selectedLogoBack?.name || null,
        logoUrlLeftSleeve: selectedLogoLeftSleeve?.url || null,
        logoNameLeftSleeve: selectedLogoLeftSleeve?.name || null,
        logoUrlRightSleeve: selectedLogoRightSleeve?.url || null,
        logoNameRightSleeve: selectedLogoRightSleeve?.name || null
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
        <div className="flex-1 bg-neutral-50 flex flex-col items-center justify-center p-4 md:p-6 relative overflow-y-auto border-b md:border-b-0 md:border-r border-neutral-100 gap-4 md:gap-6 animate-in fade-in duration-300">
          
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

          {/* Garment Preview Container */}
          <div 
            ref={previewRef}
            className="relative h-full max-h-[80vh] aspect-square bg-white rounded-[2rem] border border-neutral-200/50 shadow-lg flex items-center justify-center overflow-hidden shrink-0 transition-all duration-300 hover:shadow-xl animate-in zoom-in-95 duration-300"
          >
            {/* Zoom Wrapper to enlarge shirt */}
            <div className="relative w-full h-full flex items-center justify-center scale-[1.1]">
              {/* Main Garment Image */}
              {(!needsGeneration || isGenerated) && (
                <img 
                  src={proxiedActiveMockupImage} 
                  alt={garment.style} 
                  style={{ transform: activeTab === 'right-sleeve' ? 'scaleX(-1)' : 'none' }}
                  className="max-w-full max-h-full object-contain mix-blend-multiply select-none pointer-events-none animate-in fade-in duration-500" 
                />
              )}

              {/* Logo Overlay */}
              {(!needsGeneration || isGenerated) && selectedLogo && isImageFile(selectedLogo.name) && (
                <div 
                  onMouseDown={handleDragMouseDown}
                  style={{
                    width: `${scale * 0.36}%`,
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
              
              {(!needsGeneration || isGenerated) && selectedLogo && !isImageFile(selectedLogo.name) && (
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

              {/* AI Generation Trigger Overlay */}
              {needsGeneration && !isGenerated && (
                <div className="absolute inset-0 bg-neutral-50/95 flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-300">
                  <div className="w-16 h-16 bg-white border border-neutral-200 rounded-full flex items-center justify-center shadow-md mb-4 active:scale-95 transition-transform">
                    {isGeneratingView ? (
                      <Loader2 size={24} className="text-neutral-500 animate-spin" />
                    ) : (
                      <Sparkles size={24} className="text-neutral-700 animate-pulse" />
                    )}
                  </div>
                  <h3 className="font-serif text-lg text-neutral-900 mb-1.5">Preview Required</h3>
                  <p className="text-[11px] text-neutral-500 max-w-[280px] leading-relaxed mb-6 font-medium">
                    No catalog asset exists for the {activeTab.replace('-', ' ')} view. Generate a side profile preview to place your logo.
                  </p>
                  <button
                    type="button"
                    disabled={isGeneratingView}
                    onClick={handleGenerateView}
                    className="px-6 py-3 bg-black hover:bg-neutral-800 disabled:bg-neutral-400 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer active:scale-95 disabled:scale-100 disabled:cursor-not-allowed"
                  >
                    {isGeneratingView ? (
                      <>
                        <Loader2 size={13} className="animate-spin" />
                        <span>Generating...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={13} />
                        <span>Generate Preview</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            <span className="absolute bottom-4 left-4 text-[9px] font-bold uppercase tracking-widest text-neutral-400 bg-neutral-50 border border-neutral-200 px-2 py-0.5 rounded shadow-sm z-30">
              Placement: {placement} ({activeTab.toUpperCase()})
            </span>
          </div>
        </div>

        {/* Right Panel: Controls */}
        <div className="w-full md:w-[420px] overflow-y-auto p-8 flex flex-col gap-6 shrink-0 border-l border-neutral-150 bg-white shadow-sm">
          
          {/* Garment Color Selection Dropdown */}
          {garment.colors && garment.colors.length > 0 && (
            <div className="flex flex-col gap-2 border-b border-neutral-100 pb-6">
              <label className="text-xs font-bold uppercase tracking-widest text-neutral-500">Garment Color</label>
              
              <div className="relative">
                {/* Trigger Button */}
                <button
                  type="button"
                  onClick={() => setIsColorDropdownOpen(!isColorDropdownOpen)}
                  className="w-full bg-neutral-50 border border-neutral-200 hover:border-neutral-300 rounded-xl px-4 py-3 text-sm font-bold flex items-center justify-between transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <span 
                      className="w-4.5 h-4.5 rounded-full border border-neutral-300 shrink-0"
                      style={{
                        backgroundColor: getSwatchColor(selectedColor, true).startsWith('linear-gradient') ? 'transparent' : getSwatchColor(selectedColor, true),
                        backgroundImage: getSwatchColor(selectedColor, true).startsWith('linear-gradient') ? getSwatchColor(selectedColor, true) : 'none',
                      }}
                    />
                    <span className="uppercase tracking-wide">{selectedColor}</span>
                  </div>
                  <svg className={`w-4 h-4 text-neutral-500 transition-transform duration-200 ${isColorDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Dropdown Menu */}
                {isColorDropdownOpen && (
                  <>
                    {/* Backdrop to close dropdown on click-away */}
                    <div 
                      className="fixed inset-0 z-[110]" 
                      onClick={() => setIsColorDropdownOpen(false)}
                    />
                    
                    <div className="absolute left-0 right-0 mt-2 bg-white border border-neutral-200 rounded-xl shadow-xl max-h-[240px] overflow-y-auto z-[115] p-1.5 flex flex-col gap-0.5 custom-scrollbar animate-in fade-in slide-in-from-top-2 duration-200">
                      {garment.colors.map((c: string) => {
                        const isSelected = selectedColor === c;
                        const swatchHex = getSwatchColor(c, true);
                        return (
                          <button
                            key={c}
                            type="button"
                            onClick={() => {
                              setSelectedColor(c);
                              setIsColorDropdownOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-bold transition-all cursor-pointer ${
                              isSelected 
                                ? 'bg-neutral-900 text-white' 
                                : 'text-neutral-700 hover:bg-neutral-100'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <span 
                                className={`w-4 h-4 rounded-full border shrink-0 ${isSelected ? 'border-white/30' : 'border-neutral-300'}`}
                                style={{
                                  backgroundColor: swatchHex.startsWith('linear-gradient') ? 'transparent' : swatchHex,
                                  backgroundImage: swatchHex.startsWith('linear-gradient') ? swatchHex : 'none',
                                }}
                              />
                              <span className="uppercase tracking-wide">{c}</span>
                            </div>
                            {isSelected && (
                              <Check size={14} strokeWidth={3} className="text-white" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Design Placement Presets */}
          <div className="flex flex-col gap-2.5">
            <label className="text-xs font-bold uppercase tracking-widest text-neutral-500">Logo Placement Presets</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { name: 'Center Front', pos: 'Front', x: 50, y: 45, tab: 'front' },
                { name: 'Center Back', pos: 'Back', x: 50, y: 40, tab: 'back' },
                { name: 'Left Chest', pos: 'Left Chest', x: 38, y: 32, tab: 'front' },
                { name: 'Right Chest', pos: 'Right Chest', x: 62, y: 32, tab: 'front' },
                { name: 'Left Sleeve', pos: 'Left Sleeve', x: 50, y: 50, tab: 'left-sleeve' },
                { name: 'Right Sleeve', pos: 'Right Sleeve', x: 50, y: 50, tab: 'right-sleeve' }
              ].map((preset) => {
                const isPresetActive = activeTab === preset.tab && placement === preset.pos && offsetX === preset.x && offsetY === preset.y;

                return (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => {
                      setActiveTab(preset.tab as any);
                      if (preset.tab === 'front') {
                        setOffsetXFront(preset.x);
                        setOffsetYFront(preset.y);
                        setPlacementFront(preset.pos);
                      } else if (preset.tab === 'back') {
                        setOffsetXBack(preset.x);
                        setOffsetYBack(preset.y);
                        setPlacementBack(preset.pos);
                      } else if (preset.tab === 'left-sleeve') {
                        setOffsetXLeftSleeve(preset.x);
                        setOffsetYLeftSleeve(preset.y);
                        setPlacementLeftSleeve(preset.pos);
                      } else if (preset.tab === 'right-sleeve') {
                        setOffsetXRightSleeve(preset.x);
                        setOffsetYRightSleeve(preset.y);
                        setPlacementRightSleeve(preset.pos);
                      }
                    }}
                    className={`py-3 px-2 text-[11px] font-bold rounded-xl border transition-all cursor-pointer ${
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
