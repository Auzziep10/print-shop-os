import { useState, useEffect, useRef, useMemo } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../lib/firebase';
import { X, Upload, Loader2, Check, FileText, Sparkles, RefreshCw, Type, Image as ImageIcon, Sliders, Trash2, Bold, Italic, Search, Shirt } from 'lucide-react';
import { generateRotatedGarment } from '../../lib/geminiService';
import { getSwatchColor } from '../shared/GarmentBrowser';
import sanmarCatalogJson from '../../data/sanmar-catalog.json';

const sanmarCatalog = sanmarCatalogJson as any[];


const findFuzzyColorKey = (catalogImages: Record<string, any>, targetColor: string): string | null => {
  if (!targetColor || !catalogImages) return null;
  
  const normalize = (color: string) => {
    return color
      .toLowerCase()
      .replace(/\bgrey\b/g, 'gray')
      .trim();
  };

  const targetLower = normalize(targetColor);
  if (!targetLower) return null;

  const keys = Object.keys(catalogImages);

  // 1. Exact match (case-insensitive & grey/gray normalized)
  let found = keys.find((k) => normalize(k) === targetLower);
  if (found) return found;

  // 2. Substring check: catalog key contains target or target contains catalog key
  found = keys.find((k) => {
    const kNorm = normalize(k);
    return kNorm.includes(targetLower) || targetLower.includes(kNorm);
  });
  if (found) return found;

  // 3. Token overlap matching
  const targetWords = targetLower.split(/[\s\/\-_]+/).filter((w) => w && w !== 'and' && w !== 'with');
  if (targetWords.length > 0) {
    let bestKey: string | null = null;
    let maxOverlap = 0;
    
    for (const key of keys) {
      const keyNorm = normalize(key);
      const keyWords = keyNorm.split(/[\s\/\-_]+/).filter((w) => w && w !== 'and' && w !== 'with');
      const overlap = targetWords.filter((w) => keyWords.includes(w)).length;
      if (overlap > maxOverlap) {
        maxOverlap = overlap;
        bestKey = key;
      }
    }
    if (bestKey && maxOverlap > 0) {
      return bestKey;
    }
  }

  return null;
};


interface GarmentCustomizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  garment: any; // style, itemNum, image, colors, etc.
  customerId: string;
  onSave: (customizedGarment: any) => void;
  showCatalogSearch?: boolean;
}

export function GarmentCustomizerModal({
  isOpen,
  onClose,
  garment,
  customerId,
  onSave,
  showCatalogSearch = false
}: GarmentCustomizerModalProps) {
  const [activeTab, setActiveTab] = useState<'front' | 'back' | 'sleeve'>('front');
  const [isSleeveMirrored, setIsSleeveMirrored] = useState(false);
  const [selectedColor, setSelectedColor] = useState<string>('Custom Color');
  const [isColorDropdownOpen, setIsColorDropdownOpen] = useState(false);
  const [activeGarment, setActiveGarment] = useState<any>(garment);

  // Catalog search states
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchResultsOpen, setIsSearchResultsOpen] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  
  // Guard against resetting selected color on same-garment prop updates
  const lastGarmentIdRef = useRef<string | null>(null);

  // Sync activeGarment when prop garment changes
  useEffect(() => {
    if (garment) {
      const activeId = activeGarment?.id || activeGarment?.itemNum || activeGarment?.style;
      const propId = garment.id || garment.itemNum || garment.style;
      if (activeId !== propId) {
        setActiveGarment(garment);
      }
    }
  }, [garment]);

  // Sync selectedColor when activeGarment changes (e.g. on catalog style swap)
  useEffect(() => {
    if (activeGarment) {
      const activeId = activeGarment.id || activeGarment.itemNum || activeGarment.style;
      if (lastGarmentIdRef.current !== activeId) {
        lastGarmentIdRef.current = activeId;
        setSelectedColor(activeGarment.selectedColor || activeGarment.colors?.[0] || 'Custom Color');
      }
    }
  }, [activeGarment]);

  // Filter products for catalog search
  const filteredCatalogProducts = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const lowerQuery = searchQuery.toLowerCase().trim();
    return sanmarCatalog.filter((product: any) => {
      return (
        product.style?.toLowerCase().includes(lowerQuery) ||
        product.title?.toLowerCase().includes(lowerQuery) ||
        product.brand?.toLowerCase().includes(lowerQuery) ||
        product.category?.toLowerCase().includes(lowerQuery)
      );
    }).slice(0, 10);
  }, [searchQuery]);

  // Vault/Assets
  const [assets, setAssets] = useState<any[]>([]);
  const [isLoadingAssets, setIsLoadingAssets] = useState(true);

  // Logo overlay states for Front
  const [selectedLogoFront, setSelectedLogoFront] = useState<any | null>(null);
  const [scaleFront, setScaleFront] = useState(30);
  const [offsetXFront, setOffsetXFront] = useState(50);
  const [offsetYFront, setOffsetYFront] = useState(45);
  const [rotationFront, setRotationFront] = useState(0);
  const placementFront = 'Front';

  // Logo overlay states for Back
  const [selectedLogoBack, setSelectedLogoBack] = useState<any | null>(null);
  const [scaleBack, setScaleBack] = useState(30);
  const [offsetXBack, setOffsetXBack] = useState(50);
  const [offsetYBack, setOffsetYBack] = useState(40);
  const [rotationBack, setRotationBack] = useState(0);
  const placementBack = 'Back';

  // Logo overlay states for Left Sleeve
  const [selectedLogoLeftSleeve, setSelectedLogoLeftSleeve] = useState<any | null>(null);
  const [scaleLeftSleeve, setScaleLeftSleeve] = useState(30);
  const [offsetXLeftSleeve, setOffsetXLeftSleeve] = useState(50);
  const [offsetYLeftSleeve, setOffsetYLeftSleeve] = useState(50);
  const [rotationLeftSleeve, setRotationLeftSleeve] = useState(0);
  const placementLeftSleeve = 'Left Sleeve';

  // Logo overlay states for Right Sleeve
  const [selectedLogoRightSleeve, setSelectedLogoRightSleeve] = useState<any | null>(null);
  const [scaleRightSleeve, setScaleRightSleeve] = useState(30);
  const [offsetXRightSleeve, setOffsetXRightSleeve] = useState(50);
  const [offsetYRightSleeve, setOffsetYRightSleeve] = useState(50);
  const [rotationRightSleeve, setRotationRightSleeve] = useState(0);
  const placementRightSleeve = 'Right Sleeve';

  const [activeDesignerTab, setActiveDesignerTab] = useState<'upload' | 'text'>('upload');
  const [textInput, setTextInput] = useState('');
  const [textFont, setTextFont] = useState('Graduate');
  const [textColor, setTextColor] = useState('#FFFFFF');
  const [textBold, setTextBold] = useState(true);
  const [textItalic, setTextItalic] = useState(false);

  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [generatedViews, setGeneratedViews] = useState<Record<string, string>>({});
  const [isGeneratingView, setIsGeneratingView] = useState(false);

  // Reset generated views on style/color change
  useEffect(() => {
    setGeneratedViews({});
  }, [activeGarment?.style, selectedColor]);

  const previewRef = useRef<HTMLDivElement>(null);

  // Helper getters/setters mapping to active view
  const selectedLogo = useMemo(() => {
    if (activeTab === 'front') return selectedLogoFront;
    if (activeTab === 'back') return selectedLogoBack;
    if (activeTab === 'sleeve') {
      return isSleeveMirrored ? selectedLogoRightSleeve : selectedLogoLeftSleeve;
    }
    return null;
  }, [activeTab, isSleeveMirrored, selectedLogoFront, selectedLogoBack, selectedLogoLeftSleeve, selectedLogoRightSleeve]);
  
  const setSelectedLogo = (asset: any) => {
    if (activeTab === 'front') setSelectedLogoFront(asset);
    else if (activeTab === 'back') setSelectedLogoBack(asset);
    else if (activeTab === 'sleeve') {
      if (isSleeveMirrored) setSelectedLogoRightSleeve(asset);
      else setSelectedLogoLeftSleeve(asset);
    }
  };

  const scale = useMemo(() => {
    if (activeTab === 'front') return scaleFront;
    if (activeTab === 'back') return scaleBack;
    if (activeTab === 'sleeve') {
      return isSleeveMirrored ? scaleRightSleeve : scaleLeftSleeve;
    }
    return 30;
  }, [activeTab, isSleeveMirrored, scaleFront, scaleBack, scaleLeftSleeve, scaleRightSleeve]);

  const offsetX = useMemo(() => {
    if (activeTab === 'front') return offsetXFront;
    if (activeTab === 'back') return offsetXBack;
    if (activeTab === 'sleeve') {
      return isSleeveMirrored ? offsetXRightSleeve : offsetXLeftSleeve;
    }
    return 50;
  }, [activeTab, isSleeveMirrored, offsetXFront, offsetXBack, offsetXLeftSleeve, offsetXRightSleeve]);

  const offsetY = useMemo(() => {
    if (activeTab === 'front') return offsetYFront;
    if (activeTab === 'back') return offsetYBack;
    if (activeTab === 'sleeve') {
      return isSleeveMirrored ? offsetYRightSleeve : offsetYLeftSleeve;
    }
    return 50;
  }, [activeTab, isSleeveMirrored, offsetYFront, offsetYBack, offsetYLeftSleeve, offsetYRightSleeve]);

  const rotation = useMemo(() => {
    if (activeTab === 'front') return rotationFront;
    if (activeTab === 'back') return rotationBack;
    if (activeTab === 'sleeve') {
      return isSleeveMirrored ? rotationRightSleeve : rotationLeftSleeve;
    }
    return 0;
  }, [activeTab, isSleeveMirrored, rotationFront, rotationBack, rotationLeftSleeve, rotationRightSleeve]);

  const setRotation = (val: number) => {
    if (activeTab === 'front') setRotationFront(val);
    else if (activeTab === 'back') setRotationBack(val);
    else if (activeTab === 'sleeve') {
      if (isSleeveMirrored) setRotationRightSleeve(val);
      else setRotationLeftSleeve(val);
    }
  };

  const setScale = (val: number) => {
    if (activeTab === 'front') setScaleFront(val);
    else if (activeTab === 'back') setScaleBack(val);
    else if (activeTab === 'sleeve') {
      if (isSleeveMirrored) setScaleRightSleeve(val);
      else setScaleLeftSleeve(val);
    }
  };

  const handleClearPlacement = () => {
    setSelectedLogo(null);
    if (activeTab === 'front') {
      setScaleFront(30);
      setRotationFront(0);
      setOffsetXFront(50);
      setOffsetYFront(45);
    } else if (activeTab === 'back') {
      setScaleBack(30);
      setRotationBack(0);
      setOffsetXBack(50);
      setOffsetYBack(45);
    } else if (activeTab === 'sleeve') {
      if (isSleeveMirrored) {
        setScaleRightSleeve(30);
        setRotationRightSleeve(0);
        setOffsetXRightSleeve(50);
        setOffsetYRightSleeve(50);
      } else {
        setScaleLeftSleeve(30);
        setRotationLeftSleeve(0);
        setOffsetXLeftSleeve(50);
        setOffsetYLeftSleeve(50);
      }
    }
    if (activeDesignerTab === 'text') {
      setTextInput('');
    }
  };

  const SUPPORTED_FONTS = [
    { name: 'Varsity Block', value: 'Graduate' },
    { name: 'Modern Athletic', value: 'Oswald' },
    { name: 'Fun Script', value: 'Pacifico' },
    { name: 'Heavy Marker', value: 'Permanent Marker' },
    { name: 'Bold Retro', value: 'Bungee' },
    { name: 'Vintage Cursive', value: 'Lobster' },
    { name: 'Compressed Sans', value: 'Squada One' },
    { name: 'Elegant Roman', value: 'Cinzel' },
    { name: 'Classic Serif', value: '"Playfair Display"' },
    { name: 'Clean Sans-Serif', value: 'Inter' }
  ];

  // Find product in catalog as fallback for images
  const catalogProduct = useMemo(() => {
    const styleName = (activeGarment?.style || '').trim().toLowerCase();
    const itemNum = (activeGarment?.itemNum || '').trim().toLowerCase();
    if (!styleName && !itemNum) return null;

    const findMatch = (query: string) => {
      if (!query) return null;
      // 1. Exact match
      let found = sanmarCatalog.find(
        (p) => p.style.toLowerCase() === query
      );
      if (found) return found;

      // 2. Contains match
      const sortedCatalog = [...sanmarCatalog].sort((a, b) => b.style.length - a.style.length);
      found = sortedCatalog.find(
        (p) => {
          const pStyle = p.style.toLowerCase();
          return query.includes(pStyle) || pStyle.includes(query);
        }
      );
      return found || null;
    };

    // Try matching by itemNum (SKU style code) first as it is more specific, then styleName
    return findMatch(itemNum) || findMatch(styleName) || null;
  }, [activeGarment?.style, activeGarment?.itemNum]);

  // Case-insensitive image resolver
  const { frontImage, backImage, sleeveImage } = useMemo(() => {
    if (!selectedColor) {
      return {
        frontImage: activeGarment?.image || '',
        backImage: null,
        sleeveImage: null
      };
    }

    // 1. Resolve from garment.images case-insensitively
    const garmentImages = activeGarment?.images || {};
    const garmentImgKey = findFuzzyColorKey(garmentImages, selectedColor);
    const garmentColorVal = garmentImgKey ? garmentImages[garmentImgKey] : null;

    const garmentFront = garmentColorVal?.front || (typeof garmentColorVal === 'string' ? garmentColorVal : null);
    let garmentBack = garmentColorVal?.back || null;

    // 2. Resolve garment.backImages case-insensitively
    const garmentBackImages = activeGarment?.backImages || {};
    const garmentBackImgKey = findFuzzyColorKey(garmentBackImages, selectedColor);
    if (garmentBackImgKey) {
      garmentBack = garmentBackImages[garmentBackImgKey];
    }

    // 3. Fallback to catalogProduct case-insensitively if front/back are missing
    let catalogFront = null;
    let catalogBack = null;
    if (catalogProduct) {
      const catalogImages = catalogProduct.images || {};
      const catalogImgKey = findFuzzyColorKey(catalogImages, selectedColor);
      const catalogColorVal = catalogImgKey ? catalogImages[catalogImgKey] : null;
      catalogFront = catalogColorVal?.front || (typeof catalogColorVal === 'string' ? catalogColorVal : null);
      catalogBack = catalogColorVal?.back || null;
    }

    // Defensive fallback: if garmentBack is identical to garmentFront or is clearly a front image, and we have a distinct catalogBack, use catalogBack instead
    if (garmentBack && catalogBack) {
      const gBackLower = garmentBack.toLowerCase();
      const gFrontLower = (garmentFront || '').toLowerCase();
      if (gBackLower === gFrontLower || (gBackLower.includes('_front') && !catalogBack.toLowerCase().includes('_front'))) {
        garmentBack = null;
      }
    }

    const cleanColor = selectedColor.trim();

    // Map high-quality pre-generated sleeve mockups for NL6210 (Charcoal and Black)
    const styleCode = catalogProduct ? catalogProduct.style.toUpperCase() : '';
    const colorLower = cleanColor.toLowerCase();
    
    let localLeftSleeve = null;
    if (styleCode === 'NL6210') {
      if (colorLower.includes('charcoal')) {
        localLeftSleeve = '/mockups/NL6210/left_sleeve.png';
      } else if (colorLower.includes('black')) {
        localLeftSleeve = '/mockups/NL6210/black_left_sleeve.png';
      }
    }

    const finalFront = garmentFront || catalogFront || activeGarment?.image || 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&q=80&w=200&h=200';
    const finalBack = garmentBack || generatedViews.back || catalogBack || null;
    const finalSleeve = localLeftSleeve || generatedViews['sleeve'] || null;

    console.log("GARMENT_CUSTOMIZER_DEBUG:", {
      activeGarment,
      catalogProduct,
      selectedColor,
      garmentFront,
      garmentBack,
      catalogFront,
      catalogBack,
      finalFront,
      finalBack
    });

    return { 
      frontImage: finalFront, 
      backImage: finalBack,
      sleeveImage: finalSleeve
    };
  }, [activeGarment, selectedColor, catalogProduct, generatedViews]);

  const activeMockupImage = useMemo(() => {
    if (activeTab === 'front') return frontImage;
    if (activeTab === 'back') return backImage || frontImage;
    return sleeveImage || frontImage;
  }, [activeTab, frontImage, backImage, sleeveImage]);

  const proxiedActiveMockupImage = useMemo(() => {
    if (!activeMockupImage) return '';
    return activeMockupImage.startsWith('http')
      ? `/api/sanmar/proxy-image?url=${encodeURIComponent(activeMockupImage)}`
      : activeMockupImage;
  }, [activeMockupImage]);

  const needsGeneration = useMemo(() => {
    if (activeTab === 'front') return false;
    if (activeTab === 'back') return !backImage;
    return !sleeveImage;
  }, [activeTab, backImage, sleeveImage]);

  const isGenerated = !!generatedViews[activeTab];

  const handleGenerateView = async () => {
    if (isGeneratingView || !frontImage) return;
    setIsGeneratingView(true);
    
    try {
      let viewAngleStr = '';
      if (activeTab === 'back') {
        viewAngleStr = 'Back View';
      } else if (activeTab === 'sleeve') {
        viewAngleStr = 'Left Side View';
      }
      
      const generatedImageUrl = await generateRotatedGarment(frontImage, viewAngleStr);
      
      if (activeTab === 'back') {
        setGeneratedViews(prev => ({ ...prev, back: generatedImageUrl }));
      } else if (activeTab === 'sleeve') {
        setGeneratedViews(prev => ({ ...prev, sleeve: generatedImageUrl }));
      }
    } catch (err) {
      console.error("Failed to generate rotated garment view with Gemini:", err);
      alert("Failed to recreate view. Please try again.");
    } finally {
      setIsGeneratingView(false);
    }
  };

  // Synchronize designer inputs if active logo is a text logo
  useEffect(() => {
    if (selectedLogo && selectedLogo.isText) {
      if (textInput !== selectedLogo.textString) setTextInput(selectedLogo.textString);
      if (textFont !== selectedLogo.font) setTextFont(selectedLogo.font);
      if (textColor !== selectedLogo.color) setTextColor(selectedLogo.color);
      if (textBold !== selectedLogo.bold) setTextBold(selectedLogo.bold);
      if (textItalic !== selectedLogo.italic) setTextItalic(selectedLogo.italic);
      if (activeDesignerTab !== 'text') setActiveDesignerTab('text');
    }
  }, [selectedLogo]);

  // Real-time canvas text generation
  useEffect(() => {
    if (!textInput.trim()) {
      if (selectedLogo && selectedLogo.isText) {
        setSelectedLogo(null);
      }
      return;
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const fontStyle = `${textItalic ? 'italic' : ''} ${textBold ? 'bold' : ''} 100px ${textFont}`.trim();
    ctx.font = fontStyle;
    
    const text = textInput.trim();
    const metrics = ctx.measureText(text);
    const textWidth = Math.max(100, Math.ceil(metrics.width) + 40);
    const textHeight = 160;

    canvas.width = textWidth;
    canvas.height = textHeight;

    ctx.font = fontStyle;
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const dataUrl = canvas.toDataURL('image/png');
    
    const textAsset = {
      id: `text-${activeTab}-${isSleeveMirrored ? 'right' : 'left'}`,
      name: `Text: ${text}`,
      url: dataUrl,
      isText: true,
      textString: text,
      font: textFont,
      color: textColor,
      bold: textBold,
      italic: textItalic
    };

    setSelectedLogo(textAsset);
  }, [textInput, textFont, textColor, textBold, textItalic, activeTab, isSleeveMirrored]);

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
        } else if (activeTab === 'sleeve') {
          if (isSleeveMirrored) {
            setOffsetXRightSleeve(valX);
            setOffsetYRightSleeve(valY);
          } else {
            setOffsetXLeftSleeve(valX);
            setOffsetYLeftSleeve(valY);
          }
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
        } else if (activeTab === 'sleeve') {
          if (isSleeveMirrored) {
            setScaleRightSleeve(valScale);
          } else {
            setScaleLeftSleeve(valScale);
          }
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

  if (!isOpen || !activeGarment) return null;

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
        rotation: number;
        name: string;
      }[] = [];

      if (hasFront) activeSides.push({ img: frontImage, logo: selectedLogoFront, scale: scaleFront, offX: offsetXFront, offY: offsetYFront, rotation: rotationFront, name: 'Front' });
      if (hasBack) activeSides.push({ img: backImage || frontImage, logo: selectedLogoBack, scale: scaleBack, offX: offsetXBack, offY: offsetYBack, rotation: rotationBack, name: 'Back' });
      if (hasLeftSleeve) activeSides.push({ img: sleeveImage || frontImage, logo: selectedLogoLeftSleeve, scale: scaleLeftSleeve, offX: offsetXLeftSleeve, offY: offsetYLeftSleeve, rotation: rotationLeftSleeve, name: 'Left Sleeve' });
      if (hasRightSleeve) activeSides.push({ img: sleeveImage || frontImage, logo: selectedLogoRightSleeve, scale: scaleRightSleeve, offX: offsetXRightSleeve, offY: offsetYRightSleeve, rotation: rotationRightSleeve, name: 'Right Sleeve' });

      // If nothing is customized, default to front view
      if (activeSides.length === 0) {
        activeSides.push({ img: frontImage, logo: null, scale: 30, offX: 50, offY: 45, rotation: 0, name: 'Front' });
      }

      const scaleFactor = 3;
      const panelWidth = 600 * scaleFactor;
      const canvasWidth = panelWidth * activeSides.length;
      const canvasHeight = 600 * scaleFactor;

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

      const drawSide = async (garmentSrc: string, logoAsset: any, scaleVal: number, offX: number, offY: number, rotationVal: number, canvasOffsetX: number, sideName: string) => {
        const proxiedGarmentSrc = garmentSrc.startsWith('http')
          ? `/api/sanmar/proxy-image?url=${encodeURIComponent(garmentSrc)}`
          : garmentSrc;
        const garmentImg = await loadImg(proxiedGarmentSrc);

        const W = 500 * scaleFactor;
        const H = 500 * scaleFactor;
        const r = garmentImg.naturalWidth / garmentImg.naturalHeight;
        
        let w_draw = W;
        let h_draw = H;
        let x_draw = 0;
        let y_draw = 0;

        if (r > 1) {
          w_draw = W;
          h_draw = W / r;
          y_draw = (H - h_draw) / 2;
        } else {
          h_draw = H;
          w_draw = H * r;
          x_draw = (W - w_draw) / 2;
        }

        ctx.save();
        if (sideName === 'Right Sleeve') {
          ctx.translate(canvasOffsetX + (50 * scaleFactor) + (250 * scaleFactor), (50 * scaleFactor) + (250 * scaleFactor));
          ctx.scale(-1, 1);
          ctx.drawImage(garmentImg, -w_draw / 2, -h_draw / 2, w_draw, h_draw);
        } else {
          ctx.drawImage(garmentImg, canvasOffsetX + (50 * scaleFactor) + x_draw, (50 * scaleFactor) + y_draw, w_draw, h_draw);
        }
        ctx.restore();

        if (logoAsset) {
          const logoImg = await loadImg(logoAsset.url);
          const maxLogoSize = 180 * scaleFactor;
          const logoWidth = maxLogoSize * (scaleVal / 100);
          const aspect = logoImg.height / logoImg.width;
          const logoHeight = logoWidth * aspect;

          const logoCenterX = canvasOffsetX + (50 * scaleFactor) + ((500 * scaleFactor) * (offX / 100));
          const logoCenterY = (50 * scaleFactor) + ((500 * scaleFactor) * (offY / 100));

          ctx.save();
          ctx.translate(logoCenterX, logoCenterY);
          ctx.rotate((rotationVal * Math.PI) / 180);
          ctx.drawImage(logoImg, -logoWidth / 2, -logoHeight / 2, logoWidth, logoHeight);
          ctx.restore();
        }
      };

      for (let i = 0; i < activeSides.length; i++) {
        const side = activeSides[i];
        await drawSide(side.img, side.logo, side.scale, side.offX, side.offY, side.rotation, i * panelWidth, side.name);
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
        ...activeGarment,
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
        customRotationFront: rotationFront,
        customScaleBack: scaleBack,
        customOffsetXBack: offsetXBack,
        customOffsetYBack: offsetYBack,
        customRotationBack: rotationBack,
        customScaleLeftSleeve: scaleLeftSleeve,
        customOffsetXLeftSleeve: offsetXLeftSleeve,
        customOffsetYLeftSleeve: offsetYLeftSleeve,
        customRotationLeftSleeve: rotationLeftSleeve,
        customScaleRightSleeve: scaleRightSleeve,
        customOffsetXRightSleeve: offsetXRightSleeve,
        customOffsetYRightSleeve: offsetYRightSleeve,
        customRotationRightSleeve: rotationRightSleeve
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
        ...activeGarment,
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
          <p className="text-xs font-semibold text-neutral-500 mt-0.5">Customize {activeGarment.style || 'style'}</p>

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
          
          {/* Segmented View Selector + Mirror Toggle */}
          <div className="flex items-center gap-4 shrink-0 flex-wrap justify-center">
            <div className="flex bg-neutral-200/50 p-1 rounded-2xl gap-1 shadow-inner">
              {[
                { id: 'front', label: 'Front View' },
                { id: 'back', label: 'Back View' },
                { id: 'sleeve', label: 'Sleeve' }
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

            {activeTab === 'sleeve' && (
              <button
                type="button"
                onClick={() => setIsSleeveMirrored(prev => !prev)}
                className={`px-4 py-2.5 rounded-2xl border text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-sm ${
                  isSleeveMirrored 
                    ? 'bg-black text-white border-black hover:bg-neutral-800' 
                    : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50'
                }`}
              >
                <RefreshCw size={13} className={isSleeveMirrored ? "animate-spin" : ""} style={{ animationIterationCount: 1, animationDuration: '0.4s' }} />
                <span>{isSleeveMirrored ? 'Mirrored View' : 'Standard View'}</span>
              </button>
            )}
          </div>

          {/* Garment Preview Container */}
          <div 
            ref={previewRef}
            className="relative flex-1 min-h-0 max-h-[calc(100vh-280px)] aspect-square bg-white rounded-[2rem] border border-neutral-200/50 shadow-lg flex items-center justify-center overflow-hidden transition-all duration-300 hover:shadow-xl animate-in zoom-in-95 duration-300"
          >
            {/* Zoom Wrapper to enlarge shirt */}
            <div className="relative w-full h-full flex items-center justify-center scale-[1.1]">
              {/* Main Garment Image */}
              {(!needsGeneration || isGenerated) && (
                <img 
                  src={proxiedActiveMockupImage} 
                  alt={activeGarment.style} 
                  style={{ transform: (activeTab === 'sleeve' && isSleeveMirrored) ? 'scaleX(-1)' : 'none' }}
                  className="max-w-full max-h-full object-contain mix-blend-multiply select-none pointer-events-none animate-in fade-in duration-500" 
                />
              )}

              {/* Logo Overlay */}
              {(!needsGeneration || isGenerated) && selectedLogo && (selectedLogo.isText || isImageFile(selectedLogo.name)) && (
                <div 
                  onMouseDown={handleDragMouseDown}
                  style={{
                    width: `${scale * 0.36}%`,
                    left: `${offsetX}%`,
                    top: `${offsetY}%`,
                    transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
                    zIndex: 20
                  }}
                  className="absolute flex items-center justify-center border border-dashed border-black/40 group/logo select-none cursor-move p-1 bg-transparent"
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
              
              {(!needsGeneration || isGenerated) && selectedLogo && !(selectedLogo.isText || isImageFile(selectedLogo.name)) && (
                <div 
                  onMouseDown={handleDragMouseDown}
                  style={{
                    left: `${offsetX}%`,
                    top: `${offsetY}%`,
                    transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
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
              Active Placement: {activeTab === 'sleeve' ? (isSleeveMirrored ? 'SLEEVE (MIRRORED)' : 'SLEEVE') : activeTab.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Right Panel: Controls */}
        <div className="w-full md:w-[420px] overflow-y-auto p-8 flex flex-col gap-6 shrink-0 border-l border-neutral-150 bg-white shadow-sm">
          
          {showCatalogSearch && (
            <div ref={searchContainerRef} className="flex flex-col gap-2 border-b border-neutral-100 pb-6 relative">
              <label className="text-xs font-bold uppercase tracking-widest text-neutral-500">Change Garment Style</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search SanMar catalog..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setIsSearchResultsOpen(true);
                  }}
                  onFocus={() => setIsSearchResultsOpen(true)}
                  className="w-full bg-neutral-50 border border-neutral-200 hover:border-neutral-300 focus:border-black focus:bg-white rounded-xl pl-10 pr-10 py-3 text-sm font-bold transition-all outline-none"
                />
                <Search className="absolute left-3.5 top-3.5 text-neutral-400" size={16} />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setIsSearchResultsOpen(false);
                    }}
                    className="absolute right-3.5 top-3.5 p-0.5 rounded-full text-neutral-400 hover:text-neutral-600 hover:bg-neutral-200/50 cursor-pointer transition-colors"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {isSearchResultsOpen && searchQuery.trim() !== '' && (
                <>
                  <div 
                    className="fixed inset-0 z-[110]" 
                    onClick={() => setIsSearchResultsOpen(false)}
                  />
                  <div className="absolute left-0 right-0 top-full mt-2 bg-white border border-neutral-200 rounded-xl shadow-xl max-h-[300px] overflow-y-auto z-[115] p-1.5 flex flex-col gap-1 custom-scrollbar animate-in fade-in slide-in-from-top-2 duration-200">
                    {filteredCatalogProducts.length === 0 ? (
                      <div className="px-4 py-3 text-xs font-semibold text-neutral-500 text-center">
                        No garments found
                      </div>
                    ) : (
                      filteredCatalogProducts.map((product) => {
                        const firstColor = product.colors?.[0] || '';
                        const imageSet = product.images?.[firstColor] || Object.values(product.images || {})[0];
                        const previewImgUrl = imageSet ? (typeof imageSet === 'string' ? imageSet : imageSet.front) : '';

                        return (
                          <button
                            key={product.style}
                            type="button"
                            onClick={() => {
                              setActiveGarment({
                                id: activeGarment.id,
                                style: product.title,
                                itemNum: product.style,
                                image: previewImgUrl,
                                images: product.images,
                                backImages: product.backImages || null,
                                colors: product.colors,
                                selectedColor: firstColor
                              });
                              setSearchQuery('');
                              setIsSearchResultsOpen(false);
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2 hover:bg-neutral-50 rounded-lg text-left transition-colors cursor-pointer border border-transparent hover:border-neutral-100"
                          >
                            <div className="w-10 h-12 bg-neutral-50 border border-neutral-150 rounded flex items-center justify-center p-1 shrink-0 overflow-hidden">
                              {previewImgUrl ? (
                                <img
                                  src={previewImgUrl}
                                  alt={product.style}
                                  className="max-w-full max-h-full object-contain mix-blend-multiply"
                                />
                              ) : (
                                <Shirt size={16} className="text-neutral-400" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest leading-none">{product.brand}</span>
                                <span className="text-[9px] bg-neutral-100 text-neutral-600 font-bold px-1.5 py-0.25 rounded uppercase leading-none">{product.style}</span>
                              </div>
                              <h5 className="text-xs font-bold text-neutral-800 truncate leading-snug">
                                {product.title.replace(`${product.brand} `, '').replace(/®/g, '').trim()}
                              </h5>
                              <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide">
                                {product.colors?.length || 0} colors • ${product.price?.toFixed(2) || '0.00'}
                              </span>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Garment Color Selection Dropdown */}
          {activeGarment.colors && activeGarment.colors.length > 0 && (
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
                      {activeGarment.colors.map((c: string) => {
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



          {/* Logo / Text Mode Tabs */}
          <div className="flex flex-col gap-4 border-t border-neutral-100 pt-6">
            <div className="flex bg-neutral-100 p-1 rounded-xl gap-1">
              <button
                type="button"
                onClick={() => setActiveDesignerTab('upload')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeDesignerTab === 'upload'
                    ? 'bg-white text-black shadow-sm'
                    : 'text-neutral-500 hover:text-black'
                }`}
              >
                <ImageIcon size={13} />
                <span>Logo File</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveDesignerTab('text')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeDesignerTab === 'text'
                    ? 'bg-white text-black shadow-sm'
                    : 'text-neutral-500 hover:text-black'
                }`}
              >
                <Type size={13} />
                <span>Custom Text</span>
              </button>
            </div>

            {/* Upload/Vault Content */}
            {activeDesignerTab === 'upload' && (
              <div className="flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold uppercase tracking-widest text-neutral-500">Logo Vault</label>
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
                          className={`aspect-square rounded-xl overflow-hidden border flex items-center justify-center p-1 bg-checkerboard relative transition-all ${
                            isSelected ? 'border-black ring-2 ring-black scale-[0.98]' : 'border-neutral-200 hover:border-neutral-450'
                          }`}
                          title={asset.name}
                        >
                          {isImageFile(asset.name) ? (
                            <img src={asset.url} alt={asset.name} className="max-w-full max-h-full object-contain" />
                          ) : (
                            <FileText size={18} className="text-neutral-500" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Custom Text Content */}
            {activeDesignerTab === 'text' && (
              <div className="flex flex-col gap-4">
                {/* Text Input */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-widest text-neutral-500">Your Text</label>
                  <input
                    type="text"
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder="Enter custom text..."
                    className="w-full bg-neutral-50 border border-neutral-200 hover:border-neutral-300 focus:border-black focus:bg-white rounded-xl px-4 py-2.5 text-sm font-bold transition-all outline-none animate-in fade-in duration-200"
                  />
                </div>

                {/* Font and Style Row */}
                <div className="grid grid-cols-12 gap-2">
                  {/* Font Dropdown */}
                  <div className="col-span-8 flex flex-col gap-1.5">
                    <label className="text-xs font-bold uppercase tracking-widest text-neutral-500">Font</label>
                    <select
                      value={textFont}
                      onChange={(e) => setTextFont(e.target.value)}
                      className="w-full bg-neutral-50 border border-neutral-200 hover:border-neutral-300 focus:border-black focus:bg-white rounded-xl px-3 py-2.5 text-xs font-bold transition-all outline-none"
                    >
                      {SUPPORTED_FONTS.map((font) => (
                        <option key={font.value} value={font.value} style={{ fontFamily: font.value }}>
                          {font.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Font Styles (Bold / Italic) */}
                  <div className="col-span-4 flex flex-col gap-1.5">
                    <label className="text-xs font-bold uppercase tracking-widest text-neutral-500 text-center">Style</label>
                    <div className="flex border border-neutral-200 rounded-xl overflow-hidden h-[38px] p-0.5 bg-neutral-50">
                      <button
                        type="button"
                        onClick={() => setTextBold(b => !b)}
                        className={`flex-1 flex items-center justify-center rounded-lg transition-all cursor-pointer ${
                          textBold ? 'bg-black text-white' : 'text-neutral-500 hover:text-black hover:bg-neutral-200/50'
                        }`}
                        title="Bold"
                      >
                        <Bold size={13} strokeWidth={3} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setTextItalic(i => !i)}
                        className={`flex-1 flex items-center justify-center rounded-lg transition-all cursor-pointer ${
                          textItalic ? 'bg-black text-white' : 'text-neutral-500 hover:text-black hover:bg-neutral-200/50'
                        }`}
                        title="Italic"
                      >
                        <Italic size={13} strokeWidth={3} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Color Selection */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-widest text-neutral-500">Text Color</label>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { name: 'White', hex: '#FFFFFF' },
                      { name: 'Black', hex: '#000000' },
                      { name: 'Red', hex: '#E11D48' },
                      { name: 'Royal', hex: '#1D4ED8' },
                      { name: 'Navy', hex: '#1E3A8A' },
                      { name: 'Gold', hex: '#F59E0B' },
                      { name: 'Green', hex: '#15803D' },
                      { name: 'Grey', hex: '#6B7280' },
                    ].map((col) => {
                      const isColSelected = textColor.toLowerCase() === col.hex.toLowerCase();
                      return (
                        <button
                          key={col.hex}
                          type="button"
                          onClick={() => setTextColor(col.hex)}
                          className={`w-6 h-6 rounded-full border relative flex items-center justify-center transition-all hover:scale-110 cursor-pointer ${
                            isColSelected ? 'border-black ring-1 ring-black scale-105' : 'border-neutral-300'
                          }`}
                          style={{ backgroundColor: col.hex }}
                          title={col.name}
                        >
                          {isColSelected && (
                            <Check size={10} className={col.hex === '#FFFFFF' ? 'text-black' : 'text-white'} strokeWidth={4} />
                          )}
                        </button>
                      );
                    })}
                    {/* Custom Color Picker Swatch */}
                    <div className="relative w-6 h-6 rounded-full border border-neutral-300 overflow-hidden hover:scale-110 transition-transform">
                      <input
                        type="color"
                        value={textColor}
                        onChange={(e) => setTextColor(e.target.value)}
                        className="absolute inset-0 w-[200%] h-[200%] -translate-x-[25%] -translate-y-[25%] cursor-pointer border-0 p-0"
                        title="Custom Color"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Adjustments Section (visible only when selectedLogo exists) */}
          {selectedLogo && (
            <div className="flex flex-col gap-4 border-t border-neutral-100 pt-6 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-widest text-neutral-500 flex items-center gap-1.5">
                  <Sliders size={13} />
                  <span>Logo Adjustments</span>
                </label>
                <button
                  type="button"
                  onClick={handleClearPlacement}
                  className="text-[10px] font-bold text-red-500 hover:text-red-700 flex items-center gap-1 cursor-pointer transition-all hover:underline"
                >
                  <Trash2 size={11} />
                  <span>Clear Placement</span>
                </button>
              </div>

              {/* Scale Slider */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-neutral-500 font-semibold">Scale</span>
                  <span className="font-bold text-neutral-800">{Math.round(scale)}%</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="150"
                  value={scale}
                  onChange={(e) => setScale(Number(e.target.value))}
                  className="w-full h-1.5 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-black"
                />
              </div>

              {/* Rotation Slider */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-neutral-500 font-semibold">Rotation</span>
                  <span className="font-bold text-neutral-800">{rotation}°</span>
                </div>
                <input
                  type="range"
                  min="-180"
                  max="180"
                  value={rotation}
                  onChange={(e) => setRotation(Number(e.target.value))}
                  className="w-full h-1.5 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-black"
                />
              </div>
            </div>
          )}

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

      {/* Invisible font prefetch helper */}
      <div style={{ opacity: 0, position: 'absolute', pointerEvents: 'none', height: 0, overflow: 'hidden' }}>
        {SUPPORTED_FONTS.map(f => <span key={f.value} style={{ fontFamily: f.value }}>a</span>)}
      </div>
    </div>
  );
}
