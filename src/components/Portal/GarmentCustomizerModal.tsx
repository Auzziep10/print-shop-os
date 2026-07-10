import { useState, useEffect, useRef, useMemo } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../lib/firebase';
import { X, Upload, Loader2, Check, FileText, Sparkles, RefreshCw, Type, Image as ImageIcon, Sliders, Trash2, Bold, Italic, Search, Shirt, Plus, Palette } from 'lucide-react';
import { generateRotatedGarment } from '../../lib/geminiService';
import { getSwatchColor } from '../shared/GarmentBrowser';
import sanmarCatalogJson from '../../data/sanmar-catalog.json';

const sanmarCatalog = sanmarCatalogJson as any[];

const loadImg = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = src;
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
  });
};

export const WashingSymbol = ({ color = 'currentColor' }: { color?: string }) => (
  <svg viewBox="0 0 100 100" fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <path d="M15 35 L22 75 A 5 5 0 0 0 27 80 L73 80 A 5 5 0 0 0 78 75 L85 35" />
    <path d="M10 35 C 20 30, 25 40, 35 35 C 45 30, 50 40, 60 35 C 70 30, 75 40, 90 35" />
    <line x1="20" y1="88" x2="80" y2="88" strokeWidth="4" />
    <line x1="25" y1="94" x2="75" y2="94" strokeWidth="4" />
  </svg>
);

export const BleachingSymbol = ({ color = 'currentColor' }: { color?: string }) => (
  <svg viewBox="0 0 100 100" fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <polygon points="50,15 90,85 10,85" />
    <line x1="25" y1="35" x2="75" y2="85" />
    <line x1="75" y1="35" x2="25" y2="85" />
  </svg>
);

export const DryingSymbol = ({ color = 'currentColor' }: { color?: string }) => (
  <svg viewBox="0 0 100 100" fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <rect x="15" y="15" width="70" height="70" rx="5" />
    <circle cx="50" cy="50" r="25" />
    <circle cx="50" cy="50" r="5" fill={color} />
  </svg>
);

export const IroningSymbol = ({ color = 'currentColor' }: { color?: string }) => (
  <svg viewBox="0 0 100 100" fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <path d="M20 75 L80 75 C 80 50, 75 40, 55 40 L30 40 C 20 40, 20 75, 20 75 Z" />
    <path d="M60 40 L60 30 L35 30 C 25 30, 25 45, 25 45" />
    <circle cx="45" cy="60" r="5" fill={color} />
  </svg>
);

export const DryCleanSymbol = ({ color = 'currentColor' }: { color?: string }) => (
  <svg viewBox="0 0 100 100" fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <circle cx="50" cy="50" r="30" />
    <line x1="25" y1="25" x2="75" y2="75" />
    <line x1="75" y1="25" x2="25" y2="75" />
  </svg>
);


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
  const [activeTab, setActiveTab] = useState<'front' | 'back' | 'sleeve' | 'tag'>('front');
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

  const [recolorColor, setRecolorColor] = useState('#000000');
  const [isRecoloring, setIsRecoloring] = useState(false);

  // Lock body scroll when customizer modal is open
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

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

  // File info metadata state for Selected Logo
  const [logoFileInfo, setLogoFileInfo] = useState<{
    resolution?: string;
    size?: string;
    type?: string;
  } | null>(null);

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

  const [widthFront, setWidthFront] = useState<string>('');
  const [widthBack, setWidthBack] = useState<string>('');
  const [widthLeftSleeve, setWidthLeftSleeve] = useState<string>('');
  const [widthRightSleeve, setWidthRightSleeve] = useState<string>('');

  const [tagLogos, setTagLogos] = useState<any[]>([]);
  const [tagTexts, setTagTexts] = useState<any[]>([]);
  const [tagSize, setTagSize] = useState<any>({
    scale: 35,
    x: 50,
    y: 75,
    rotation: 0,
    font: 'Graduate',
    color: '#111111',
    bold: true,
    italic: false
  });
  const [tagCareSymbols, setTagCareSymbols] = useState<any>({
    visible: false,
    showWash: true,
    showBleach: true,
    showDry: true,
    showIron: true,
    showDryClean: true,
    x: 50,
    y: 45,
    scale: 30,
    color: '#111111',
    rotation: 0
  });
  const [selectedTagElementId, setSelectedTagElementId] = useState<string | null>(null);
  const [tagDesignName, setTagDesignName] = useState<string>('My Custom Tag');
  const [activeElementDrag, setActiveElementDrag] = useState<{ id: string; type: 'logo' | 'text' | 'size' | 'care_symbols' } | null>(null);
  const [activeElementResize, setActiveElementResize] = useState<{ id: string; type: 'logo' | 'text' | 'size' | 'care_symbols' } | null>(null);
  const [isSavingTagAsset, setIsSavingTagAsset] = useState(false);

  const [activeDesignerTab, setActiveDesignerTab] = useState<'upload' | 'text'>('upload');

  useEffect(() => {
    if (activeTab !== 'tag' && (activeDesignerTab as string) === 'care') {
      setActiveDesignerTab('upload');
    }
  }, [activeTab, activeDesignerTab]);
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
    } else if (activeTab === 'tag') {
      if (!asset) return;
      if (asset.type === 'tag_design') {
        if (asset.tagLayout) {
          setTagLogos(asset.tagLayout.placedTagLogos || []);
          setTagTexts(asset.tagLayout.placedTagTexts || []);
          setTagSize(asset.tagLayout.tagSizeElement || { scale: 35, x: 50, y: 75, rotation: 0, font: 'Graduate', color: '#111111', bold: true, italic: false });
          setTagCareSymbols(asset.tagLayout.tagCareSymbols || { visible: false, showWash: true, showBleach: true, showDry: true, showIron: true, showDryClean: true, x: 50, y: 55, scale: 30, color: '#111111', rotation: 0 });
          setSelectedTagElementId(null);
        }
        return;
      }
      const newLogoId = `tag-logo-${Date.now()}`;
      const newLogo = {
        id: newLogoId,
        url: asset.url,
        name: asset.name,
        scale: 30,
        x: 50,
        y: 45,
        rotation: 0
      };
      setTagLogos(prev => [...prev, newLogo]);
      setSelectedTagElementId(newLogoId);
    }
  };

  useEffect(() => {
    if (!selectedLogo || selectedLogo.isText) {
      setLogoFileInfo(null);
      return;
    }

    const ext = selectedLogo.name.split('.').pop()?.toUpperCase() || 'Unknown';
    setLogoFileInfo({ type: ext });

    const extLower = ext.toLowerCase();
    const isRenderable = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(extLower);

    if (isRenderable) {
      const img = new Image();
      img.onload = () => {
        setLogoFileInfo(prev => prev ? {
          ...prev,
          resolution: `${img.naturalWidth} x ${img.naturalHeight} px`
        } : null);
      };
      img.src = selectedLogo.url;
    }

    fetch(selectedLogo.url, { method: 'HEAD' })
      .then(res => {
        const bytes = res.headers.get('content-length');
        if (bytes) {
          const kb = parseInt(bytes) / 1024;
          const sizeStr = kb > 1024 
            ? `${(kb / 1024).toFixed(2)} MB`
            : `${kb.toFixed(1)} KB`;
          setLogoFileInfo(prev => prev ? {
            ...prev,
            size: sizeStr
          } : null);
        }
      })
      .catch(err => {
        console.warn("Could not fetch file headers for size:", err);
      });
  }, [selectedLogo]);

  const scale = useMemo(() => {
    if (activeTab === 'tag') {
      if (selectedTagElementId === 'size-tag-placeholder') return tagSize.scale;
      if (selectedTagElementId === 'care-symbols-placeholder') return tagCareSymbols.scale;
      if (selectedTagElementId?.startsWith('tag-logo-')) {
        return tagLogos.find(l => l.id === selectedTagElementId)?.scale || 30;
      }
      if (selectedTagElementId?.startsWith('tag-text-')) {
        return tagTexts.find(t => t.id === selectedTagElementId)?.scale || 25;
      }
      return 30;
    }
    if (activeTab === 'front') return scaleFront;
    if (activeTab === 'back') return scaleBack;
    if (activeTab === 'sleeve') {
      return isSleeveMirrored ? scaleRightSleeve : scaleLeftSleeve;
    }
    return 30;
  }, [activeTab, isSleeveMirrored, scaleFront, scaleBack, scaleLeftSleeve, scaleRightSleeve, selectedTagElementId, tagLogos, tagTexts, tagSize, tagCareSymbols]);

  const offsetX = useMemo(() => {
    if (activeTab === 'tag') {
      if (selectedTagElementId === 'size-tag-placeholder') return tagSize.x;
      if (selectedTagElementId === 'care-symbols-placeholder') return tagCareSymbols.x;
      if (selectedTagElementId?.startsWith('tag-logo-')) {
        return tagLogos.find(l => l.id === selectedTagElementId)?.x || 50;
      }
      if (selectedTagElementId?.startsWith('tag-text-')) {
        return tagTexts.find(t => t.id === selectedTagElementId)?.x || 50;
      }
      return 50;
    }
    if (activeTab === 'front') return offsetXFront;
    if (activeTab === 'back') return offsetXBack;
    if (activeTab === 'sleeve') {
      return isSleeveMirrored ? offsetXRightSleeve : offsetXLeftSleeve;
    }
    return 50;
  }, [activeTab, isSleeveMirrored, offsetXFront, offsetXBack, offsetXLeftSleeve, offsetXRightSleeve, selectedTagElementId, tagLogos, tagTexts, tagSize, tagCareSymbols]);

  const offsetY = useMemo(() => {
    if (activeTab === 'tag') {
      if (selectedTagElementId === 'size-tag-placeholder') return tagSize.y;
      if (selectedTagElementId === 'care-symbols-placeholder') return tagCareSymbols.y;
      if (selectedTagElementId?.startsWith('tag-logo-')) {
        return tagLogos.find(l => l.id === selectedTagElementId)?.y || 50;
      }
      if (selectedTagElementId?.startsWith('tag-text-')) {
        return tagTexts.find(t => t.id === selectedTagElementId)?.y || 50;
      }
      return 50;
    }
    if (activeTab === 'front') return offsetYFront;
    if (activeTab === 'back') return offsetYBack;
    if (activeTab === 'sleeve') {
      return isSleeveMirrored ? offsetYRightSleeve : offsetYLeftSleeve;
    }
    return 50;
  }, [activeTab, isSleeveMirrored, offsetYFront, offsetYBack, offsetYLeftSleeve, offsetYRightSleeve, selectedTagElementId, tagLogos, tagTexts, tagSize, tagCareSymbols]);

  const rotation = useMemo(() => {
    if (activeTab === 'tag') {
      if (selectedTagElementId === 'size-tag-placeholder') return tagSize.rotation;
      if (selectedTagElementId === 'care-symbols-placeholder') return tagCareSymbols.rotation;
      if (selectedTagElementId?.startsWith('tag-logo-')) {
        return tagLogos.find(l => l.id === selectedTagElementId)?.rotation || 0;
      }
      if (selectedTagElementId?.startsWith('tag-text-')) {
        return tagTexts.find(t => t.id === selectedTagElementId)?.rotation || 0;
      }
      return 0;
    }
    if (activeTab === 'front') return rotationFront;
    if (activeTab === 'back') return rotationBack;
    if (activeTab === 'sleeve') {
      return isSleeveMirrored ? rotationRightSleeve : rotationLeftSleeve;
    }
    return 0;
  }, [activeTab, isSleeveMirrored, rotationFront, rotationBack, rotationLeftSleeve, rotationRightSleeve, selectedTagElementId, tagLogos, tagTexts, tagSize, tagCareSymbols]);

  const setRotation = (val: number) => {
    if (activeTab === 'tag') {
      if (selectedTagElementId === 'size-tag-placeholder') {
        setTagSize((prev: any) => ({ ...prev, rotation: val }));
      } else if (selectedTagElementId === 'care-symbols-placeholder') {
        setTagCareSymbols((prev: any) => ({ ...prev, rotation: val }));
      } else if (selectedTagElementId?.startsWith('tag-logo-')) {
        setTagLogos(prev => prev.map(l => l.id === selectedTagElementId ? { ...l, rotation: val } : l));
      } else if (selectedTagElementId?.startsWith('tag-text-')) {
        setTagTexts(prev => prev.map(t => t.id === selectedTagElementId ? { ...t, rotation: val } : t));
      }
      return;
    }
    if (activeTab === 'front') setRotationFront(val);
    else if (activeTab === 'back') setRotationBack(val);
    else if (activeTab === 'sleeve') {
      if (isSleeveMirrored) setRotationRightSleeve(val);
      else setRotationLeftSleeve(val);
    }
  };

  const setScale = (val: number) => {
    if (activeTab === 'tag') {
      if (selectedTagElementId === 'size-tag-placeholder') {
        setTagSize((prev: any) => ({ ...prev, scale: val }));
      } else if (selectedTagElementId === 'care-symbols-placeholder') {
        setTagCareSymbols((prev: any) => ({ ...prev, scale: val }));
      } else if (selectedTagElementId?.startsWith('tag-logo-')) {
        setTagLogos(prev => prev.map(l => l.id === selectedTagElementId ? { ...l, scale: val } : l));
      } else if (selectedTagElementId?.startsWith('tag-text-')) {
        setTagTexts(prev => prev.map(t => t.id === selectedTagElementId ? { ...t, scale: val } : t));
      }
      return;
    }
    if (activeTab === 'front') setScaleFront(val);
    else if (activeTab === 'back') setScaleBack(val);
    else if (activeTab === 'sleeve') {
      if (isSleeveMirrored) setScaleRightSleeve(val);
      else setScaleLeftSleeve(val);
    }
  };

  const handleClearPlacement = () => {
    if (activeTab === 'tag') {
      if (selectedTagElementId) {
        if (selectedTagElementId.startsWith('tag-logo-')) {
          setTagLogos(prev => prev.filter(l => l.id !== selectedTagElementId));
        } else if (selectedTagElementId.startsWith('tag-text-')) {
          setTagTexts(prev => prev.filter(t => t.id !== selectedTagElementId));
        } else if (selectedTagElementId === 'care-symbols-placeholder') {
          setTagCareSymbols((prev: any) => ({ ...prev, visible: false }));
        }
        setSelectedTagElementId(null);
      }
      return;
    }
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
    // 1. Resolve from garment.images case-insensitively first if selectedColor is chosen
    let resolvedFront = null;
    let resolvedBack = null;

    if (selectedColor) {
      const garmentImages = activeGarment?.images || {};
      const garmentImgKey = findFuzzyColorKey(garmentImages, selectedColor);
      const garmentColorVal = garmentImgKey ? garmentImages[garmentImgKey] : null;

      resolvedFront = garmentColorVal?.front || (typeof garmentColorVal === 'string' ? garmentColorVal : null);
      resolvedBack = garmentColorVal?.back || null;

      const garmentBackImages = activeGarment?.backImages || {};
      const garmentBackImgKey = findFuzzyColorKey(garmentBackImages, selectedColor);
      if (garmentBackImgKey) {
        resolvedBack = garmentBackImages[garmentBackImgKey];
      }

      if (catalogProduct) {
        const catalogImages = catalogProduct.images || {};
        const catalogImgKey = findFuzzyColorKey(catalogImages, selectedColor);
        const catalogColorVal = catalogImgKey ? catalogImages[catalogImgKey] : null;
        if (!resolvedFront) {
          resolvedFront = catalogColorVal?.front || (typeof catalogColorVal === 'string' ? catalogColorVal : null);
        }
        if (!resolvedBack) {
          resolvedBack = catalogColorVal?.back || null;
        }
      }
    }

    // 2. If we resolved images for the selectedColor, use them!
    if (resolvedFront) {
      if (resolvedBack && resolvedFront) {
        const rBackLower = resolvedBack.toLowerCase();
        const rFrontLower = resolvedFront.toLowerCase();
        if (rBackLower === rFrontLower) {
          resolvedBack = null;
        }
      }

      const cleanColor = (selectedColor || '').trim();
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

      return {
        frontImage: resolvedFront,
        backImage: resolvedBack || generatedViews.back || null,
        sleeveImage: localLeftSleeve || generatedViews['sleeve'] || null
      };
    }

    // 3. Fallback to originalFrontImage if we couldn't resolve color-specific images
    if (activeGarment?.originalFrontImage) {
      return {
        frontImage: activeGarment.originalFrontImage,
        backImage: activeGarment.originalBackImage || null,
        sleeveImage: activeGarment.originalSleeveImage || null
      };
    }

    return {
      frontImage: activeGarment?.image || '',
      backImage: null,
      sleeveImage: null
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

  const updateSelectedTagTextProperty = (updates: Partial<any>) => {
    if (selectedTagElementId === 'size-tag-placeholder') {
      setTagSize((prev: any) => ({ ...prev, ...updates }));
    } else if (selectedTagElementId?.startsWith('tag-text-')) {
      setTagTexts(prev => prev.map(t => t.id === selectedTagElementId ? { ...t, ...updates } : t));
    }
  };

  const handleAddTextToTag = () => {
    if (!textInput.trim()) return;
    const newTextId = `tag-text-${Date.now()}`;
    const newText = {
      id: newTextId,
      text: textInput.trim(),
      scale: 25,
      x: 50,
      y: 50,
      rotation: 0,
      font: textFont,
      color: textColor,
      bold: textBold,
      italic: textItalic
    };
    setTagTexts(prev => [...prev, newText]);
    setSelectedTagElementId(newTextId);
    setTextInput('');
  };

  useEffect(() => {
    if (activeTab === 'tag' && selectedTagElementId) {
      if (selectedTagElementId === 'size-tag-placeholder') {
        setTextFont(tagSize.font);
        setTextColor(tagSize.color);
        setTextBold(tagSize.bold);
        setTextItalic(tagSize.italic);
      } else {
        const txtItem = tagTexts.find(t => t.id === selectedTagElementId);
        if (txtItem) {
          setTextInput(txtItem.text);
          setTextFont(txtItem.font);
          setTextColor(txtItem.color);
          setTextBold(txtItem.bold);
          setTextItalic(txtItem.italic);
        }
      }
    }
  }, [selectedTagElementId, activeTab]);

  const handleElementMouseDown = (e: React.MouseEvent, id: string, type: 'logo' | 'text' | 'size' | 'care_symbols') => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedTagElementId(id);
    setActiveElementDrag({ id, type });

    let currentX = 50;
    let currentY = 50;

    if (type === 'logo') {
      const item = tagLogos.find(l => l.id === id);
      if (item) {
        currentX = item.x;
        currentY = item.y;
      }
    } else if (type === 'text') {
      const item = tagTexts.find(t => t.id === id);
      if (item) {
        currentX = item.x;
        currentY = item.y;
      }
    } else if (type === 'size') {
      currentX = tagSize.x;
      currentY = tagSize.y;
    } else if (type === 'care_symbols') {
      currentX = tagCareSymbols.x;
      currentY = tagCareSymbols.y;
    }

    dragStartPos.current = {
      x: e.clientX,
      y: e.clientY,
      offsetX: currentX,
      offsetY: currentY
    };
  };

  const handleElementResizeMouseDown = (e: React.MouseEvent, id: string, type: 'logo' | 'text' | 'size' | 'care_symbols') => {
    e.stopPropagation();
    e.preventDefault();
    setActiveElementResize({ id, type });

    let currentScale = 30;
    const containerWidth = previewRef.current?.getBoundingClientRect().width || 320;
    if (type === 'logo') {
      currentScale = tagLogos.find(l => l.id === id)?.scale || 30;
    } else if (type === 'text') {
      currentScale = tagTexts.find(t => t.id === id)?.scale || 25;
    } else if (type === 'size') {
      currentScale = tagSize.scale;
    } else if (type === 'care_symbols') {
      currentScale = tagCareSymbols.scale;
    }

    resizeStartPos.current = {
      x: e.clientX,
      scale: currentScale,
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

      if (activeElementDrag && previewRef.current) {
        const rect = previewRef.current.getBoundingClientRect();
        const valX = Math.max(0, Math.min(100, Math.round(((e.clientX - rect.left) / rect.width) * 100)));
        const valY = Math.max(0, Math.min(100, Math.round(((e.clientY - rect.top) / rect.height) * 100)));

        const { id, type } = activeElementDrag;
        if (type === 'logo') {
          setTagLogos(prev => prev.map(l => l.id === id ? { ...l, x: valX, y: valY } : l));
        } else if (type === 'text') {
          setTagTexts(prev => prev.map(t => t.id === id ? { ...t, x: valX, y: valY } : t));
        } else if (type === 'size') {
          setTagSize((prev: any) => ({ ...prev, x: valX, y: valY }));
        } else if (type === 'care_symbols') {
          setTagCareSymbols((prev: any) => ({ ...prev, x: valX, y: valY }));
        }
      }

      if (activeElementResize) {
        const deltaX = e.clientX - resizeStartPos.current.x;
        const containerWidth = resizeStartPos.current.containerWidth || 320;
        const valScale = Math.max(10, Math.min(150, Math.round(resizeStartPos.current.scale + (deltaX / containerWidth) * 100)));

        const { id, type } = activeElementResize;
        if (type === 'logo') {
          setTagLogos(prev => prev.map(l => l.id === id ? { ...l, scale: valScale } : l));
        } else if (type === 'text') {
          setTagTexts(prev => prev.map(t => t.id === id ? { ...t, scale: valScale } : t));
        } else if (type === 'size') {
          setTagSize((prev: any) => ({ ...prev, scale: valScale }));
        } else if (type === 'care_symbols') {
          setTagCareSymbols((prev: any) => ({ ...prev, scale: valScale }));
        }
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
      setActiveElementDrag(null);
      setActiveElementResize(null);
    };

    if (isDragging || isResizing || activeElementDrag || activeElementResize) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, activeElementDrag, activeElementResize, scale, offsetX, offsetY, activeTab]);

  // Initialize and restore saved customization settings if editing an existing customization
  useEffect(() => {
    if (garment) {
      setSelectedColor(garment.selectedColor || garment.colors?.[0] || 'Custom Color');
    }

    const hasLogos = !!(garment && (garment.customized || garment.logoUrl || garment.logoUrlBack || garment.logoUrlLeftSleeve || garment.logoUrlRightSleeve));

    if (hasLogos) {
      if (garment.logoUrl) {
        setSelectedLogoFront({ url: garment.logoUrl, name: garment.logoName || 'Front Logo' });
      } else {
        setSelectedLogoFront(null);
      }
      if (garment.logoUrlBack) {
        setSelectedLogoBack({ url: garment.logoUrlBack, name: garment.logoNameBack || 'Back Logo' });
      } else {
        setSelectedLogoBack(null);
      }
      if (garment.logoUrlLeftSleeve) {
        setSelectedLogoLeftSleeve({ url: garment.logoUrlLeftSleeve, name: garment.logoNameLeftSleeve || 'Left Sleeve Logo' });
      } else {
        setSelectedLogoLeftSleeve(null);
      }
      if (garment.logoUrlRightSleeve) {
        setSelectedLogoRightSleeve({ url: garment.logoUrlRightSleeve, name: garment.logoNameRightSleeve || 'Right Sleeve Logo' });
      } else {
        setSelectedLogoRightSleeve(null);
      }

      setWidthFront(String(garment.logoWidthFront ?? garment.widthFront ?? ''));
      setWidthBack(String(garment.logoWidthBack ?? garment.widthBack ?? ''));
      setWidthLeftSleeve(String(garment.logoWidthLeftSleeve ?? garment.widthLeftSleeve ?? ''));
      setWidthRightSleeve(String(garment.logoWidthRightSleeve ?? garment.widthRightSleeve ?? ''));

      setScaleFront(garment.customScaleFront ?? 30);
      setOffsetXFront(garment.customOffsetXFront ?? 50);
      setOffsetYFront(garment.customOffsetYFront ?? 45);
      setRotationFront(garment.customRotationFront ?? 0);

      setScaleBack(garment.customScaleBack ?? 30);
      setOffsetXBack(garment.customOffsetXBack ?? 50);
      setOffsetYBack(garment.customOffsetYBack ?? 40);
      setRotationBack(garment.customRotationBack ?? 0);

      setScaleLeftSleeve(garment.customScaleLeftSleeve ?? 30);
      setOffsetXLeftSleeve(garment.customOffsetXLeftSleeve ?? 50);
      setOffsetYLeftSleeve(garment.customOffsetYLeftSleeve ?? 50);
      setRotationLeftSleeve(garment.customRotationLeftSleeve ?? 0);

      setScaleRightSleeve(garment.customScaleRightSleeve ?? 30);
      setOffsetXRightSleeve(garment.customOffsetXRightSleeve ?? 50);
      setOffsetYRightSleeve(garment.customOffsetYRightSleeve ?? 50);
      setRotationRightSleeve(garment.customRotationRightSleeve ?? 0);
    } else {
      setSelectedLogoFront(null);
      setSelectedLogoBack(null);
      setSelectedLogoLeftSleeve(null);
      setSelectedLogoRightSleeve(null);

      setWidthFront('');
      setWidthBack('');
      setWidthLeftSleeve('');
      setWidthRightSleeve('');

      setScaleFront(30);
      setOffsetXFront(50);
      setOffsetYFront(45);
      setRotationFront(0);

      setScaleBack(30);
      setOffsetXBack(50);
      setOffsetYBack(40);
      setRotationBack(0);

      setScaleLeftSleeve(30);
      setOffsetXLeftSleeve(50);
      setOffsetYLeftSleeve(50);
      setRotationLeftSleeve(0);

      setScaleRightSleeve(30);
      setOffsetXRightSleeve(50);
      setOffsetYRightSleeve(50);
      setRotationRightSleeve(0);
    }

    if (garment && garment.tagLayout) {
      setTagLogos(garment.tagLayout.placedTagLogos || []);
      setTagTexts(garment.tagLayout.placedTagTexts || []);
      setTagSize(garment.tagLayout.tagSizeElement || { scale: 35, x: 50, y: 75, rotation: 0, font: 'Graduate', color: '#111111', bold: true, italic: false });
      setTagCareSymbols(garment.tagLayout.tagCareSymbols || { visible: false, showWash: true, showBleach: true, showDry: true, showIron: true, showDryClean: true, x: 50, y: 55, scale: 30, color: '#111111', rotation: 0 });
    } else {
      setTagLogos([]);
      setTagTexts([]);
      setTagSize({ scale: 35, x: 50, y: 75, rotation: 0, font: 'Graduate', color: '#111111', bold: true, italic: false });
      setTagCareSymbols({ visible: false, showWash: true, showBleach: true, showDry: true, showIron: true, showDryClean: true, x: 50, y: 55, scale: 30, color: '#111111', rotation: 0 });
    }
    setSelectedTagElementId(null);
  }, [garment, isOpen]);

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
          const isAlreadyCustomized = !!(garment?.customized || garment?.logoUrl || garment?.logoUrlBack || garment?.logoUrlLeftSleeve || garment?.logoUrlRightSleeve);
          if (data.assets && data.assets.length > 0 && !isAlreadyCustomized) {
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
  }, [customerId, isOpen, garment]);

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
    } catch (err) {
      console.error("Logo upload failed:", err);
      alert("Failed to upload logo.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleRecolorAsset = async (asset: any, hexColor: string) => {
    if (!asset || !customerId) return;
    setIsRecoloring(true);
    try {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = asset.url;
      });

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No canvas context');

      ctx.drawImage(img, 0, 0);
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = hexColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const recoloredDataUrl = canvas.toDataURL('image/png');
      const response = await fetch(recoloredDataUrl);
      const blob = await response.blob();

      const filename = `recolored_${hexColor.replace('#', '')}_${asset.name.split('.').slice(0, -1).join('.') || 'asset'}.png`;
      const storageRef = ref(storage, `portal/${customerId}/vault/${Date.now()}_${filename}`);
      await uploadBytes(storageRef, blob);
      const downloadUrl = await getDownloadURL(storageRef);

      const newAsset = {
        id: `asset-${Date.now()}`,
        name: filename,
        url: downloadUrl,
        uploadedAt: new Date().toISOString()
      };

      const updatedAssets = [...assets, newAsset];
      
      await updateDoc(doc(db, 'customers', customerId), {
        assets: updatedAssets
      });

      setAssets(updatedAssets);
      setSelectedLogo(newAsset);
      alert('Recolored copy added to vault and selected!');
    } catch (err) {
      console.error(err);
      alert('Failed to recolor asset. Ensure image origin supports CORS.');
    } finally {
      setIsRecoloring(false);
    }
  };

  const compileTagCanvas = async (includeSizePlaceholder: boolean, sizeChar: string = 'M') => {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = 600;
    tempCanvas.height = 600;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return null;

    tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);

    for (const logo of tagLogos) {
      try {
        const logoImg = await loadImg(logo.url);
        const logoWidth = 600 * (logo.scale / 100);
        const aspect = logoImg.height / logoImg.width;
        const logoHeight = logoWidth * aspect;

        const logoCenterX = 600 * (logo.x / 100);
        const logoCenterY = 600 * (logo.y / 100);

        tempCtx.save();
        tempCtx.translate(logoCenterX, logoCenterY);
        tempCtx.rotate((logo.rotation * Math.PI) / 180);
        tempCtx.drawImage(logoImg, -logoWidth / 2, -logoHeight / 2, logoWidth, logoHeight);
        tempCtx.restore();
      } catch (e) {
        console.error("Failed to draw logo on tag canvas", e);
      }
    }

    for (const txt of tagTexts) {
      tempCtx.save();
      const fontSize = txt.scale * 1.40625;
      tempCtx.font = `${txt.italic ? 'italic' : ''} ${txt.bold ? 'bold' : ''} ${fontSize}px ${txt.font}`.trim();
      tempCtx.fillStyle = txt.color;
      tempCtx.textAlign = 'center';
      tempCtx.textBaseline = 'middle';

      const textCenterX = 600 * (txt.x / 100);
      const textCenterY = 600 * (txt.y / 100);

      tempCtx.translate(textCenterX, textCenterY);
      tempCtx.rotate((txt.rotation * Math.PI) / 180);
      
      const lines = txt.text.split('\n');
      const lineHeight = fontSize * 1.2;
      
      lines.forEach((line: string, index: number) => {
        const yOffset = (index - (lines.length - 1) / 2) * lineHeight;
        tempCtx.fillText(line, 0, yOffset);
      });
      
      tempCtx.restore();
    }

    if (tagCareSymbols.visible) {
      const activeSymsSvg: string[] = [];
      if (tagCareSymbols.showWash) {
        activeSymsSvg.push(`
          <g transform="translate(${activeSymsSvg.length * 110}, 0)">
            <path d="M15 35 L22 75 A 5 5 0 0 0 27 80 L73 80 A 5 5 0 0 0 78 75 L85 35" fill="none" stroke="${tagCareSymbols.color}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M10 35 C 20 30, 25 40, 35 35 C 45 30, 50 40, 60 35 C 70 30, 75 40, 90 35" fill="none" stroke="${tagCareSymbols.color}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />
            <line x1="20" y1="88" x2="80" y2="88" stroke="${tagCareSymbols.color}" stroke-width="4" stroke-linecap="round" />
            <line x1="25" y1="94" x2="75" y2="94" stroke="${tagCareSymbols.color}" stroke-width="4" stroke-linecap="round" />
          </g>
        `);
      }
      if (tagCareSymbols.showBleach) {
        activeSymsSvg.push(`
          <g transform="translate(${activeSymsSvg.length * 110}, 0)">
            <polygon points="50,15 90,85 10,85" fill="none" stroke="${tagCareSymbols.color}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />
            <line x1="25" y1="35" x2="75" y2="85" stroke="${tagCareSymbols.color}" stroke-width="6" stroke-linecap="round" />
            <line x1="75" y1="35" x2="25" y2="85" stroke="${tagCareSymbols.color}" stroke-width="6" stroke-linecap="round" />
          </g>
        `);
      }
      if (tagCareSymbols.showDry) {
        activeSymsSvg.push(`
          <g transform="translate(${activeSymsSvg.length * 110}, 0)">
            <rect x="15" y="15" width="70" height="70" rx="5" fill="none" stroke="${tagCareSymbols.color}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />
            <circle cx="50" cy="50" r="25" fill="none" stroke="${tagCareSymbols.color}" stroke-width="6" />
            <circle cx="50" cy="50" r="5" fill="${tagCareSymbols.color}" />
          </g>
        `);
      }
      if (tagCareSymbols.showIron) {
        activeSymsSvg.push(`
          <g transform="translate(${activeSymsSvg.length * 110}, 0)">
            <path d="M20 75 L80 75 C 80 50, 75 40, 55 40 L30 40 C 20 40, 20 75, 20 75 Z" fill="none" stroke="${tagCareSymbols.color}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M60 40 L60 30 L35 30 C 25 30, 25 45, 25 45" fill="none" stroke="${tagCareSymbols.color}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />
            <circle cx="45" cy="60" r="5" fill="${tagCareSymbols.color}" />
          </g>
        `);
      }
      if (tagCareSymbols.showDryClean) {
        activeSymsSvg.push(`
          <g transform="translate(${activeSymsSvg.length * 110}, 0)">
            <circle cx="50" cy="50" r="30" fill="none" stroke="${tagCareSymbols.color}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />
            <line x1="25" y1="25" x2="75" y2="75" stroke="${tagCareSymbols.color}" stroke-width="6" stroke-linecap="round" />
            <line x1="75" y1="25" x2="25" y2="75" stroke="${tagCareSymbols.color}" stroke-width="6" stroke-linecap="round" />
          </g>
        `);
      }

      if (activeSymsSvg.length > 0) {
        try {
          const totalWidth = activeSymsSvg.length * 110 - 10;
          const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} 100" width="${totalWidth}" height="100">${activeSymsSvg.join('')}</svg>`;
          const encodedSvg = encodeURIComponent(svgContent).replace(/'/g, "%27").replace(/"/g, "%22");
          const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodedSvg}`;

          const careImg = await loadImg(svgDataUrl);
          const drawHeight = tagCareSymbols.scale * 1.40625;
          const drawWidth = drawHeight * (totalWidth / 100);

          const careCenterX = 600 * (tagCareSymbols.x / 100);
          const careCenterY = 600 * (tagCareSymbols.y / 100);

          tempCtx.save();
          tempCtx.translate(careCenterX, careCenterY);
          tempCtx.rotate((tagCareSymbols.rotation * Math.PI) / 180);
          tempCtx.drawImage(careImg, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
          tempCtx.restore();
        } catch (e) {
          console.error("Failed to draw care symbols on tag canvas", e);
        }
      }
    }

    if (includeSizePlaceholder) {
      tempCtx.save();
      const fontSize = tagSize.scale * 1.40625;
      tempCtx.font = `${tagSize.italic ? 'italic' : ''} ${tagSize.bold ? 'bold' : ''} ${fontSize}px ${tagSize.font}`.trim();
      tempCtx.fillStyle = tagSize.color;
      tempCtx.textAlign = 'center';
      tempCtx.textBaseline = 'middle';

      const sizeCenterX = 600 * (tagSize.x / 100);
      const sizeCenterY = 600 * (tagSize.y / 100);

      tempCtx.translate(sizeCenterX, sizeCenterY);
      tempCtx.rotate((tagSize.rotation * Math.PI) / 180);
      tempCtx.fillText(sizeChar, 0, 0);
      tempCtx.restore();
    }

    return tempCanvas;
  };

  const handleSaveTagToVault = async () => {
    if (tagLogos.length === 0 && tagTexts.length === 0) return;
    setIsSavingTagAsset(true);
    try {
      const tagCanvas = await compileTagCanvas(true, 'M');
      if (!tagCanvas) throw new Error("Could not compile tag canvas");

      const blob = await new Promise<Blob | null>((resolve) => tagCanvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error("Could not convert tag to blob");

      const storageRef = ref(storage, `portal/${customerId}/vault/tag_${Date.now()}.png`);
      await uploadBytes(storageRef, blob);
      const downloadUrl = await getDownloadURL(storageRef);

      const newTagAsset = {
        id: `tag-design-${Date.now()}`,
        name: tagDesignName || `Tag Design ${new Date().toLocaleDateString()}`,
        url: downloadUrl,
        type: 'tag_design',
        tagLayout: {
          placedTagLogos: tagLogos,
          placedTagTexts: tagTexts,
          tagSizeElement: tagSize,
          tagCareSymbols: tagCareSymbols
        },
        uploadedAt: new Date().toISOString()
      };

      const updatedAssets = [...assets, newTagAsset];
      await updateDoc(doc(db, 'customers', customerId), {
        assets: updatedAssets
      });

      setAssets(updatedAssets);
      alert("Tag design successfully saved to your vault!");
    } catch (err) {
      console.error("Failed to save tag design:", err);
      alert("Failed to save tag design.");
    } finally {
      setIsSavingTagAsset(false);
    }
  };

  const handleSave = async () => {
    // Validation check for widths
    if (selectedLogoFront && !widthFront.trim()) {
      alert("Please enter the print width for the Front placement.");
      setActiveTab('front');
      return;
    }
    if (selectedLogoBack && !widthBack.trim()) {
      alert("Please enter the print width for the Back placement.");
      setActiveTab('back');
      return;
    }
    if (selectedLogoLeftSleeve && !widthLeftSleeve.trim()) {
      alert("Please enter the print width for the Left Sleeve placement.");
      setActiveTab('sleeve');
      setIsSleeveMirrored(false);
      return;
    }
    if (selectedLogoRightSleeve && !widthRightSleeve.trim()) {
      alert("Please enter the print width for the Right Sleeve placement.");
      setActiveTab('sleeve');
      setIsSleeveMirrored(true);
      return;
    }

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

      // Helper function to generate and upload a single side mockup
      const generateAndUploadSide = async (garmentSrc: string, logoAsset: any, scaleVal: number, offX: number, offY: number, rotationVal: number, sideName: string) => {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 600 * scaleFactor;
        tempCanvas.height = 600 * scaleFactor;
        const tempCtx = tempCanvas.getContext('2d');
        if (!tempCtx) return null;

        tempCtx.fillStyle = '#FFFFFF';
        tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

        const proxiedGarmentSrc = garmentSrc.startsWith('http')
          ? `/api/sanmar/proxy-image?url=${encodeURIComponent(garmentSrc)}`
          : garmentSrc;
        
        let garmentImg;
        try {
          garmentImg = await loadImg(proxiedGarmentSrc);
        } catch (e) {
          console.error("Failed to load garment image for side upload:", e);
          return null;
        }

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

        tempCtx.save();
        if (sideName === 'Right Sleeve') {
          tempCtx.translate((50 * scaleFactor) + (250 * scaleFactor), (50 * scaleFactor) + (250 * scaleFactor));
          tempCtx.scale(-1, 1);
          tempCtx.drawImage(garmentImg, -w_draw / 2, -h_draw / 2, w_draw, h_draw);
        } else {
          tempCtx.drawImage(garmentImg, (50 * scaleFactor) + x_draw, (50 * scaleFactor) + y_draw, w_draw, h_draw);
        }
        tempCtx.restore();

        if (logoAsset) {
          const logoImg = await loadImg(logoAsset.url);
          const maxLogoSize = 180 * scaleFactor;
          const logoWidth = maxLogoSize * (scaleVal / 100);
          const aspect = logoImg.height / logoImg.width;
          const logoHeight = logoWidth * aspect;

          const logoCenterX = (50 * scaleFactor) + ((500 * scaleFactor) * (offX / 100));
          const logoCenterY = (50 * scaleFactor) + ((500 * scaleFactor) * (offY / 100));

          tempCtx.save();
          tempCtx.translate(logoCenterX, logoCenterY);
          tempCtx.rotate((rotationVal * Math.PI) / 180);
          tempCtx.drawImage(logoImg, -logoWidth / 2, -logoHeight / 2, logoWidth, logoHeight);
          tempCtx.restore();
        }

        const sideBlob = await new Promise<Blob | null>((resolve) => tempCanvas.toBlob(resolve, 'image/png'));
        if (!sideBlob) return null;

        const sideRef = ref(storage, `portal/${customerId}/customizations/${Date.now()}_${sideName.replace(' ', '_').toLowerCase()}.png`);
        await uploadBytes(sideRef, sideBlob);
        return await getDownloadURL(sideRef);
      };

      // Generate individual side images
      const customizedFrontImage = hasFront ? await generateAndUploadSide(frontImage, selectedLogoFront, scaleFront, offsetXFront, offsetYFront, rotationFront, 'Front') : null;
      const customizedBackImage = hasBack ? await generateAndUploadSide(backImage || frontImage, selectedLogoBack, scaleBack, offsetXBack, offsetYBack, rotationBack, 'Back') : null;
      
      let customizedSleeveImage = null;
      if (hasLeftSleeve) {
        customizedSleeveImage = await generateAndUploadSide(sleeveImage || frontImage, selectedLogoLeftSleeve, scaleLeftSleeve, offsetXLeftSleeve, offsetYLeftSleeve, rotationLeftSleeve, 'Left Sleeve');
      } else if (hasRightSleeve) {
        customizedSleeveImage = await generateAndUploadSide(sleeveImage || frontImage, selectedLogoRightSleeve, scaleRightSleeve, offsetXRightSleeve, offsetYRightSleeve, rotationRightSleeve, 'Right Sleeve');
      }

      // Generate size tag base image
      let logoUrlTag = null;
      const isTagCustomized = tagLogos.length > 0 || tagTexts.length > 0 || tagCareSymbols.visible;
      if (isTagCustomized) {
        const tagBaseCanvas = await compileTagCanvas(false);
        if (tagBaseCanvas) {
          const tagBlob = await new Promise<Blob | null>((resolve) => tagBaseCanvas.toBlob(resolve, 'image/png'));
          if (tagBlob) {
            const tagRef = ref(storage, `portal/${customerId}/customizations/${Date.now()}_tag_base.png`);
            await uploadBytes(tagRef, tagBlob);
            logoUrlTag = await getDownloadURL(tagRef);
          }
        }
      }

      const placementParts: string[] = [];
      if (hasFront) placementParts.push(`Front: ${placementFront}`);
      if (hasBack) placementParts.push(`Back: ${placementBack}`);
      if (hasLeftSleeve) placementParts.push(`Left Sleeve: ${placementLeftSleeve}`);
      if (hasRightSleeve) placementParts.push(`Right Sleeve: ${placementRightSleeve}`);
      if (isTagCustomized) placementParts.push('Tag: Custom Tag');

      onSave({
        ...activeGarment,
        selectedColor,
        image: downloadUrl,
        customized: true,
        logoPlacement: placementParts.join(', ') || 'Front',
        originalFrontImage: frontImage,
        originalBackImage: backImage || null,
        originalSleeveImage: sleeveImage || null,
        customizedFrontImage,
        customizedBackImage,
        customizedSleeveImage,
        logoUrl: selectedLogoFront?.url || null,
        logoName: selectedLogoFront?.name || null,
        logoWidthFront: selectedLogoFront ? parseFloat(widthFront) : null,
        logoUrlBack: selectedLogoBack?.url || null,
        logoNameBack: selectedLogoBack?.name || null,
        logoWidthBack: selectedLogoBack ? parseFloat(widthBack) : null,
        logoUrlLeftSleeve: selectedLogoLeftSleeve?.url || null,
        logoNameLeftSleeve: selectedLogoLeftSleeve?.name || null,
        logoWidthLeftSleeve: selectedLogoLeftSleeve ? parseFloat(widthLeftSleeve) : null,
        logoUrlRightSleeve: selectedLogoRightSleeve?.url || null,
        logoNameRightSleeve: selectedLogoRightSleeve?.name || null,
        logoWidthRightSleeve: selectedLogoRightSleeve ? parseFloat(widthRightSleeve) : null,
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
        customRotationRightSleeve: rotationRightSleeve,
        // Tag properties
        logoUrlTag,
        tagLayout: isTagCustomized ? {
          placedTagLogos: tagLogos,
          placedTagTexts: tagTexts,
          tagSizeElement: tagSize,
          tagCareSymbols: tagCareSymbols
        } : null,
        tagSizeX: tagSize.x,
        tagSizeY: tagSize.y,
        tagSizeScale: tagSize.scale,
        tagSizeFont: tagSize.font,
        tagSizeColor: tagSize.color,
        tagSizeBold: tagSize.bold,
        tagSizeItalic: tagSize.italic
      });

      onClose();
    } catch (err) {
      console.error("Failed to generate and save mockup:", err);
      alert("Error generating customized preview. Using original garment image.");
      
      const isTagCustomized = tagLogos.length > 0 || tagTexts.length > 0 || tagCareSymbols.visible;
      const placementParts: string[] = [];
      if (selectedLogoFront) placementParts.push(`Front: ${placementFront}`);
      if (selectedLogoBack) placementParts.push(`Back: ${placementBack}`);
      if (selectedLogoLeftSleeve) placementParts.push(`Left Sleeve: ${placementLeftSleeve}`);
      if (selectedLogoRightSleeve) placementParts.push(`Right Sleeve: ${placementRightSleeve}`);
      if (isTagCustomized) placementParts.push('Tag: Custom Tag');

      onSave({
        ...activeGarment,
        selectedColor,
        customized: true,
        logoPlacement: placementParts.join(', ') || 'Front',
        logoUrl: selectedLogoFront?.url || null,
        logoName: selectedLogoFront?.name || null,
        logoWidthFront: selectedLogoFront ? parseFloat(widthFront) : null,
        logoUrlBack: selectedLogoBack?.url || null,
        logoNameBack: selectedLogoBack?.name || null,
        logoWidthBack: selectedLogoBack ? parseFloat(widthBack) : null,
        logoUrlLeftSleeve: selectedLogoLeftSleeve?.url || null,
        logoNameLeftSleeve: selectedLogoLeftSleeve?.name || null,
        logoWidthLeftSleeve: selectedLogoLeftSleeve ? parseFloat(widthLeftSleeve) : null,
        logoUrlRightSleeve: selectedLogoRightSleeve?.url || null,
        logoNameRightSleeve: selectedLogoRightSleeve?.name || null,
        logoWidthRightSleeve: selectedLogoRightSleeve ? parseFloat(widthRightSleeve) : null,
        // Tag properties
        logoUrlTag: null,
        tagLayout: isTagCustomized ? {
          placedTagLogos: tagLogos,
          placedTagTexts: tagTexts,
          tagSizeElement: tagSize,
          tagCareSymbols: tagCareSymbols
        } : null,
        tagSizeX: tagSize.x,
        tagSizeY: tagSize.y,
        tagSizeScale: tagSize.scale,
        tagSizeFont: tagSize.font,
        tagSizeColor: tagSize.color,
        tagSizeBold: tagSize.bold,
        tagSizeItalic: tagSize.italic
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

  const isPdfFile = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    return ext === 'pdf';
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
                { id: 'sleeve', label: 'Sleeve' },
                { id: 'tag', label: 'Size Tag' }
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
              {activeTab !== 'tag' && (
                <>
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
                </>
              )}

              {activeTab === 'tag' && (
                <div className="relative w-80 h-80 bg-neutral-50 border-2 border-dashed border-neutral-300 rounded-[1.5rem] shadow-inner flex items-center justify-center overflow-hidden z-10 select-none">
                  {/* Grid background */}
                  <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, #000 1px, transparent 1px)', backgroundSize: '16px 16px' }} />
                  
                  {/* Placed Logos */}
                  {tagLogos.map((logo) => {
                    const isSelected = selectedTagElementId === logo.id;
                    return (
                      <div
                        key={logo.id}
                        onMouseDown={(e) => handleElementMouseDown(e, logo.id, 'logo')}
                        style={{
                          width: `${logo.scale}%`,
                          left: `${logo.x}%`,
                          top: `${logo.y}%`,
                          transform: `translate(-50%, -50%) rotate(${logo.rotation}deg)`,
                          zIndex: isSelected ? 30 : 20
                        }}
                        className={`absolute flex items-center justify-center p-1 bg-transparent cursor-move ${isSelected ? 'border border-black ring-1 ring-black/30 bg-white/5' : 'border border-dashed border-transparent hover:border-neutral-300'}`}
                      >
                        <img src={logo.url} alt={logo.name} className="max-w-full max-h-full object-contain pointer-events-none" />
                        {isSelected && (
                          <div
                            onMouseDown={(e) => handleElementResizeMouseDown(e, logo.id, 'logo')}
                            className="absolute bottom-[-6px] right-[-6px] w-3.5 h-3.5 bg-black border-2 border-white rounded-full cursor-se-resize shadow-md hover:scale-125 transition-transform z-30"
                          />
                        )}
                      </div>
                    );
                  })}

                  {/* Placed Texts */}
                  {tagTexts.map((textItem) => {
                    const isSelected = selectedTagElementId === textItem.id;
                    return (
                      <div
                        key={textItem.id}
                        onMouseDown={(e) => handleElementMouseDown(e, textItem.id, 'text')}
                        style={{
                          left: `${textItem.x}%`,
                          top: `${textItem.y}%`,
                          transform: `translate(-50%, -50%) rotate(${textItem.rotation}deg)`,
                          zIndex: isSelected ? 30 : 20,
                          fontFamily: textItem.font,
                          color: textItem.color,
                          fontSize: `${textItem.scale * 0.75}px`,
                          fontWeight: textItem.bold ? 'bold' : 'normal',
                          fontStyle: textItem.italic ? 'italic' : 'normal',
                          whiteSpace: 'pre'
                        }}
                        className={`absolute text-center px-2 py-1 leading-normal cursor-move ${isSelected ? 'border border-black ring-1 ring-black/30 bg-white/20' : 'border border-transparent hover:border-neutral-200'}`}
                      >
                        {textItem.text}
                        {isSelected && (
                          <div
                            onMouseDown={(e) => handleElementResizeMouseDown(e, textItem.id, 'text')}
                            className="absolute bottom-[-6px] right-[-6px] w-3.5 h-3.5 bg-black border-2 border-white rounded-full cursor-se-resize shadow-md hover:scale-125 transition-transform z-30"
                          />
                        )}
                      </div>
                    );
                  })}

                  {/* Size Placeholder Element */}
                  {(() => {
                    const isSelected = selectedTagElementId === 'size-tag-placeholder';
                    return (
                      <div
                        onMouseDown={(e) => handleElementMouseDown(e, 'size-tag-placeholder', 'size')}
                        style={{
                          left: `${tagSize.x}%`,
                          top: `${tagSize.y}%`,
                          transform: `translate(-50%, -50%) rotate(${tagSize.rotation}deg)`,
                          zIndex: isSelected ? 30 : 20,
                          fontFamily: tagSize.font,
                          color: tagSize.color,
                          fontSize: `${tagSize.scale * 0.75}px`,
                          fontWeight: tagSize.bold ? 'bold' : 'normal',
                          fontStyle: tagSize.italic ? 'italic' : 'normal'
                        }}
                        className={`absolute flex items-center justify-center cursor-move leading-none p-1.5 ${isSelected ? 'border border-black ring-1 ring-black/30 bg-white/20' : 'border border-dashed border-red-400/40 hover:border-red-400/80 bg-red-50/10'}`}
                      >
                        <span className="relative select-none flex items-center justify-center">
                          M
                          <span className="absolute -top-4 left-1/2 -translate-x-1/2 bg-red-650 text-[6px] text-white px-1 py-0.5 rounded font-sans uppercase font-bold tracking-wider leading-none shadow select-none pointer-events-none whitespace-nowrap z-40">Size Tag</span>
                        </span>
                        {isSelected && (
                          <div
                            onMouseDown={(e) => handleElementResizeMouseDown(e, 'size-tag-placeholder', 'size')}
                            className="absolute bottom-[-6px] right-[-6px] w-3.5 h-3.5 bg-black border-2 border-white rounded-full cursor-se-resize shadow-md hover:scale-125 transition-transform z-30"
                          />
                        )}
                      </div>
                    );
                  })()}

                  {/* Care Symbols Element */}
                  {tagCareSymbols.visible && (() => {
                    const isSelected = selectedTagElementId === 'care-symbols-placeholder';
                    const activeSyms = [];
                    const symbolSize = Math.max(12, tagCareSymbols.scale * 0.75);

                    if (tagCareSymbols.showWash) activeSyms.push(<div key="wash" style={{ width: `${symbolSize}px`, height: `${symbolSize}px` }} className="shrink-0"><WashingSymbol color={tagCareSymbols.color} /></div>);
                    if (tagCareSymbols.showBleach) activeSyms.push(<div key="bleach" style={{ width: `${symbolSize}px`, height: `${symbolSize}px` }} className="shrink-0"><BleachingSymbol color={tagCareSymbols.color} /></div>);
                    if (tagCareSymbols.showDry) activeSyms.push(<div key="dry" style={{ width: `${symbolSize}px`, height: `${symbolSize}px` }} className="shrink-0"><DryingSymbol color={tagCareSymbols.color} /></div>);
                    if (tagCareSymbols.showIron) activeSyms.push(<div key="iron" style={{ width: `${symbolSize}px`, height: `${symbolSize}px` }} className="shrink-0"><IroningSymbol color={tagCareSymbols.color} /></div>);
                    if (tagCareSymbols.showDryClean) activeSyms.push(<div key="dryclean" style={{ width: `${symbolSize}px`, height: `${symbolSize}px` }} className="shrink-0"><DryCleanSymbol color={tagCareSymbols.color} /></div>);

                    return (
                      <div
                        onMouseDown={(e) => handleElementMouseDown(e, 'care-symbols-placeholder', 'care_symbols')}
                        style={{
                          left: `${tagCareSymbols.x}%`,
                          top: `${tagCareSymbols.y}%`,
                          transform: `translate(-50%, -50%) rotate(${tagCareSymbols.rotation}deg)`,
                          zIndex: isSelected ? 30 : 20,
                          color: tagCareSymbols.color,
                          width: 'fit-content'
                        }}
                        className={`absolute flex items-center justify-center p-1.5 cursor-move ${isSelected ? 'border border-black ring-1 ring-black/30 bg-white/20' : 'border border-dashed border-neutral-300 hover:border-neutral-400 bg-white/5'}`}
                      >
                        <div className="flex items-center gap-1.5 justify-center">
                          {activeSyms.length > 0 ? activeSyms : (
                            <span className="text-[9px] text-neutral-400 select-none px-2">No active symbols</span>
                          )}
                        </div>
                        {isSelected && (
                          <div
                            onMouseDown={(e) => handleElementResizeMouseDown(e, 'care-symbols-placeholder', 'care_symbols')}
                            className="absolute bottom-[-6px] right-[-6px] w-3.5 h-3.5 bg-black border-2 border-white rounded-full cursor-se-resize shadow-md hover:scale-125 transition-transform z-30"
                          />
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            <div className="absolute bottom-4 left-4 flex flex-col gap-1.5 z-30">
              <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 bg-neutral-50 border border-neutral-200 px-2 py-0.5 rounded shadow-sm self-start">
                Active Placement: {activeTab === 'sleeve' ? (isSleeveMirrored ? 'SLEEVE (MIRRORED)' : 'SLEEVE') : activeTab.toUpperCase()}
              </span>
              {activeTab === 'tag' && (
                <span className="text-[9px] font-bold uppercase tracking-widest text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded shadow-sm self-start animate-in slide-in-from-bottom-2 duration-200">
                  Tag Dimensions: 2.5" W x 2.5" H (300 DPI)
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel: Controls */}
        <div className="w-full md:w-[420px] md:h-full md:min-h-0 overflow-y-auto p-8 flex flex-col gap-6 shrink-0 border-l border-neutral-150 bg-white shadow-sm">
          
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
                                {product.colors?.length || 0} colors
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
              {activeTab === 'tag' && (
                <button
                  type="button"
                  onClick={() => setActiveDesignerTab('care' as any)}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    (activeDesignerTab as string) === 'care'
                      ? 'bg-white text-black shadow-sm'
                      : 'text-neutral-500 hover:text-black'
                  }`}
                >
                  <Sparkles size={13} />
                  <span>Care Symbols</span>
                </button>
              )}
            </div>

            {/* Upload/Vault Content */}
            {activeDesignerTab === 'upload' && (
              <div className="flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold uppercase tracking-widest text-neutral-500">Logo Vault</label>
                  <label className="text-xs font-bold text-neutral-600 hover:text-black cursor-pointer flex items-center gap-1">
                    <input type="file" className="hidden" onChange={handleFileUpload} accept="image/*,application/pdf,.ai,.eps,.svg" />
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
                      <input type="file" className="hidden" onChange={handleFileUpload} accept="image/*,application/pdf,.ai,.eps,.svg" />
                      Upload logo to begin
                    </label>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-3 max-h-[220px] overflow-y-auto pr-1">
                    {assets.filter((asset) => asset.type !== 'folder').map((asset) => {
                       const isSelected = activeTab === 'tag'
                         ? selectedTagElementId === asset.id
                         : selectedLogo?.id === asset.id;
                       return (
                         <div
                           key={asset.id}
                           onClick={() => setSelectedLogo(asset)}
                           className={`w-full h-20 rounded-xl overflow-hidden border flex items-center justify-center p-1 bg-checkerboard relative transition-all cursor-pointer ${
                             isSelected ? 'border-black ring-2 ring-black scale-[0.98]' : 'border-neutral-200 hover:border-neutral-400'
                           }`}
                          title={asset.name}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              setSelectedLogo(asset);
                            }
                          }}
                        >
                          {asset.type === 'tag_design' && (
                            <span className="absolute top-1 left-1 bg-black text-[7px] text-white px-1 py-0.5 rounded font-sans uppercase font-bold tracking-wider leading-none shadow select-none pointer-events-none z-10">Tag</span>
                          )}
                          {isImageFile(asset.name) || asset.type === 'tag_design' ? (
                            <img 
                              src={asset.url} 
                              alt={asset.name} 
                              className="absolute max-w-[90%] max-h-[90%] object-contain pointer-events-none select-none inset-0 m-auto" 
                              draggable="false" 
                            />
                          ) : isPdfFile(asset.name) ? (
                            <div className="absolute inset-1 overflow-hidden flex items-center justify-center pointer-events-none select-none rounded-lg bg-white">
                              <iframe 
                                src={`${asset.url}#toolbar=0&navpanes=0&scrollbar=0`}
                                className="absolute w-[200%] h-[200%] scale-50 origin-center border-0 pointer-events-none select-none bg-white inset-0 m-auto"
                                scrolling="no"
                              />
                            </div>
                          ) : (
                            <FileText size={18} className="text-neutral-500 pointer-events-none" />
                          )}
                        </div>
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
                    onChange={(e) => {
                      setTextInput(e.target.value);
                      if (activeTab === 'tag') {
                        updateSelectedTagTextProperty({ text: e.target.value });
                      }
                    }}
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
                      onChange={(e) => {
                        setTextFont(e.target.value);
                        if (activeTab === 'tag') {
                          updateSelectedTagTextProperty({ font: e.target.value });
                        }
                      }}
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
                        onClick={() => {
                          setTextBold(b => {
                            const next = !b;
                            if (activeTab === 'tag') {
                              updateSelectedTagTextProperty({ bold: next });
                            }
                            return next;
                          });
                        }}
                        className={`flex-1 flex items-center justify-center rounded-lg transition-all cursor-pointer ${
                          textBold ? 'bg-black text-white' : 'text-neutral-500 hover:text-black hover:bg-neutral-200/50'
                        }`}
                        title="Bold"
                      >
                        <Bold size={13} strokeWidth={3} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTextItalic(i => {
                            const next = !i;
                            if (activeTab === 'tag') {
                              updateSelectedTagTextProperty({ italic: next });
                            }
                            return next;
                          });
                        }}
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
                          onClick={() => {
                            setTextColor(col.hex);
                            if (activeTab === 'tag') {
                              updateSelectedTagTextProperty({ color: col.hex });
                            }
                          }}
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
                        onChange={(e) => {
                          setTextColor(e.target.value);
                          if (activeTab === 'tag') {
                            updateSelectedTagTextProperty({ color: e.target.value });
                          }
                        }}
                        className="absolute inset-0 w-[200%] h-[200%] -translate-x-[25%] -translate-y-[25%] cursor-pointer border-0 p-0"
                        title="Custom Color"
                      />
                    </div>
                  </div>
                </div>

                {activeTab === 'tag' && (
                  <button
                    type="button"
                    onClick={handleAddTextToTag}
                    className="w-full bg-black hover:bg-neutral-800 text-white py-2.5 rounded-xl text-xs font-bold transition-all shadow-md mt-2 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Plus size={13} />
                    <span>Add Text to Tag</span>
                  </button>
                )}
              </div>
            )}

            {/* Care Symbols Content */}
            {(activeDesignerTab as string) === 'care' && (
              <div className="flex flex-col gap-4 animate-in fade-in duration-200">
                {!tagCareSymbols.visible ? (
                  <button
                    type="button"
                    onClick={() => {
                      setTagCareSymbols((prev: any) => ({ ...prev, visible: true }));
                      setSelectedTagElementId('care-symbols-placeholder');
                    }}
                    className="w-full bg-black hover:bg-neutral-800 text-white py-2.5 rounded-xl text-xs font-bold transition-all shadow-md mt-2 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Plus size={13} />
                    <span>Add Care Symbols to Tag</span>
                  </button>
                ) : (
                  <div className="flex flex-col gap-4">
                    <span className="text-xs font-bold text-neutral-800">Toggle Care Symbols</span>
                    <div className="flex flex-col gap-2.5 bg-neutral-50 border border-neutral-150 p-4 rounded-2xl">
                      <label className="flex items-center gap-3 text-xs font-bold text-neutral-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={tagCareSymbols.showWash}
                          onChange={(e) => setTagCareSymbols((prev: any) => ({ ...prev, showWash: e.target.checked }))}
                          className="rounded border-neutral-300 text-black focus:ring-black h-4 w-4"
                        />
                        <span>Machine Wash Normal</span>
                      </label>
                      <label className="flex items-center gap-3 text-xs font-bold text-neutral-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={tagCareSymbols.showBleach}
                          onChange={(e) => setTagCareSymbols((prev: any) => ({ ...prev, showBleach: e.target.checked }))}
                          className="rounded border-neutral-300 text-black focus:ring-black h-4 w-4"
                        />
                        <span>Do Not Bleach</span>
                      </label>
                      <label className="flex items-center gap-3 text-xs font-bold text-neutral-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={tagCareSymbols.showDry}
                          onChange={(e) => setTagCareSymbols((prev: any) => ({ ...prev, showDry: e.target.checked }))}
                          className="rounded border-neutral-300 text-black focus:ring-black h-4 w-4"
                        />
                        <span>Tumble Dry Low</span>
                      </label>
                      <label className="flex items-center gap-3 text-xs font-bold text-neutral-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={tagCareSymbols.showIron}
                          onChange={(e) => setTagCareSymbols((prev: any) => ({ ...prev, showIron: e.target.checked }))}
                          className="rounded border-neutral-300 text-black focus:ring-black h-4 w-4"
                        />
                        <span>Iron Low Heat</span>
                      </label>
                      <label className="flex items-center gap-3 text-xs font-bold text-neutral-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={tagCareSymbols.showDryClean}
                          onChange={(e) => setTagCareSymbols((prev: any) => ({ ...prev, showDryClean: e.target.checked }))}
                          className="rounded border-neutral-300 text-black focus:ring-black h-4 w-4"
                        />
                        <span>Do Not Dry Clean</span>
                      </label>
                    </div>

                    {/* Color Selector */}
                    <div className="flex flex-col gap-1.5 border-t border-neutral-100 pt-3">
                      <label className="text-xs font-bold uppercase tracking-widest text-neutral-500">Symbols Color</label>
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
                          const isColSelected = tagCareSymbols.color.toLowerCase() === col.hex.toLowerCase();
                          return (
                            <button
                              key={col.hex}
                              type="button"
                              onClick={() => setTagCareSymbols((prev: any) => ({ ...prev, color: col.hex }))}
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
                            value={tagCareSymbols.color}
                            onChange={(e) => setTagCareSymbols((prev: any) => ({ ...prev, color: e.target.value }))}
                            className="absolute inset-0 w-[200%] h-[200%] -translate-x-[25%] -translate-y-[25%] cursor-pointer border-0 p-0"
                            title="Custom Color"
                          />
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setTagCareSymbols((prev: any) => ({ ...prev, visible: false }));
                        if (selectedTagElementId === 'care-symbols-placeholder') {
                          setSelectedTagElementId(null);
                        }
                      }}
                      className="w-full bg-red-500 hover:bg-red-650 text-white py-2.5 rounded-xl text-xs font-bold transition-all shadow-md mt-2 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 size={13} />
                      <span>Remove Care Symbols</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Adjustments Section (visible when selectedLogo exists OR when on Tag tab and an element is selected) */}
          {(selectedLogo || (activeTab === 'tag' && selectedTagElementId)) && (
            <div className="flex flex-col gap-4 border-t border-neutral-100 pt-6 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-widest text-neutral-500 flex items-center gap-1.5">
                  <Sliders size={13} />
                  <span>{activeTab === 'tag' ? 'Element Adjustments' : 'Logo Adjustments'}</span>
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

          {/* Required Placement Width Input */}
          {((activeTab === 'front' && selectedLogoFront) ||
            (activeTab === 'back' && selectedLogoBack) ||
            (activeTab === 'sleeve' && !isSleeveMirrored && selectedLogoLeftSleeve) ||
            (activeTab === 'sleeve' && isSleeveMirrored && selectedLogoRightSleeve)) && (
            <div className="flex flex-col gap-1.5 border-t border-neutral-100 pt-6 animate-in fade-in duration-200">
              <label className="text-xs font-bold uppercase tracking-widest text-neutral-500 flex items-center gap-1">
                <span>Print Width (Inches)</span>
                <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.1"
                min="0.5"
                max="22"
                placeholder="e.g. 10.5"
                value={
                  activeTab === 'front'
                    ? widthFront
                    : activeTab === 'back'
                    ? widthBack
                    : isSleeveMirrored
                    ? widthRightSleeve
                    : widthLeftSleeve
                }
                onChange={(e) => {
                  const val = e.target.value;
                  if (activeTab === 'front') setWidthFront(val);
                  else if (activeTab === 'back') setWidthBack(val);
                  else if (isSleeveMirrored) setWidthRightSleeve(val);
                  else setWidthLeftSleeve(val);
                }}
                className="w-full bg-neutral-50 border border-neutral-200 hover:border-neutral-300 focus:border-black focus:bg-white rounded-xl px-4 py-2.5 text-sm font-bold transition-all outline-none"
                required
              />
              <span className="text-[10px] text-neutral-400 font-semibold mt-0.5">
                Specify the exact target width in inches for printing this placement.
              </span>
            </div>
          )}

          {/* Save Tag Design to Vault Section */}
          {activeTab === 'tag' && (
            <div className="flex flex-col gap-4 border-t border-neutral-100 pt-6 animate-in fade-in duration-200">
              <label className="text-xs font-bold uppercase tracking-widest text-neutral-500 flex items-center gap-1.5">
                <Sparkles size={13} />
                <span>Save Tag to Vault</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={tagDesignName}
                  onChange={(e) => setTagDesignName(e.target.value)}
                  placeholder="Enter tag name..."
                  className="flex-1 bg-neutral-50 border border-neutral-200 focus:border-black focus:bg-white rounded-xl px-3 py-2 text-xs font-bold transition-all outline-none"
                />
                <button
                  type="button"
                  onClick={handleSaveTagToVault}
                  disabled={isSavingTagAsset || (tagLogos.length === 0 && tagTexts.length === 0)}
                  className="bg-black text-white hover:bg-neutral-800 text-xs font-bold px-4 py-2 rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSavingTagAsset ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <span>Save Tag</span>
                  )}
                </button>
              </div>
            </div>
          )}

          {selectedLogo && logoFileInfo && (
            <div className="flex flex-col gap-2 border-t border-neutral-100 pt-6 animate-in fade-in duration-200">
              <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-3 flex flex-col gap-1.5 text-[11px]">
                <span className="font-extrabold uppercase tracking-widest text-[9px] text-neutral-400">File Information</span>
                <div className="flex flex-col gap-1 w-full text-neutral-600">
                  <div className="flex justify-between border-b border-neutral-100 pb-1">
                    <span className="font-semibold">Name:</span>
                    <span className="text-neutral-900 font-bold truncate max-w-[150px]" title={selectedLogo.name}>{selectedLogo.name}</span>
                  </div>
                  <div className="flex justify-between border-b border-neutral-100 pb-1">
                    <span className="font-semibold">Format:</span>
                    <span className="text-neutral-900 font-extrabold">{logoFileInfo.type || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between border-b border-neutral-100 pb-1">
                    <span className="font-semibold">Resolution:</span>
                    <span className="text-neutral-900 font-bold">{logoFileInfo.resolution || 'Vector / Non-raster'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-semibold">File Size:</span>
                    <span className="text-neutral-900 font-bold">{logoFileInfo.size || 'Calculating...'}</span>
                  </div>
                </div>
              </div>

              {isImageFile(selectedLogo.name) && (
                <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-3 flex flex-col gap-2 text-[11px] animate-in fade-in duration-300">
                  <span className="font-extrabold uppercase tracking-widest text-[9px] text-neutral-400">Recolor Logo</span>
                  <div className="flex items-center gap-2">
                    <div className="relative w-5 h-5 shrink-0 group rounded-full overflow-hidden border border-neutral-350 shadow-inner">
                      <input
                        type="color"
                        value={recolorColor}
                        onChange={(e) => setRecolorColor(e.target.value)}
                        className="absolute -inset-4 opacity-0 w-16 h-16 cursor-pointer z-10"
                        title="Pick a color"
                      />
                      <div className="absolute inset-0 pointer-events-none" style={{ backgroundColor: recolorColor }} />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRecolorAsset(selectedLogo, recolorColor)}
                      disabled={isRecoloring}
                      className="flex-1 py-1.5 px-3 bg-zinc-900 text-white hover:bg-zinc-800 rounded-lg font-bold text-[10px] uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      {isRecoloring ? <Loader2 className="animate-spin" size={10} /> : <Palette size={10} />}
                      <span>Recolor & Apply</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Footer Actions */}
      <div className="px-8 py-5 border-t border-neutral-100 flex items-center justify-between bg-neutral-50/50 shrink-0">
        {(() => {
          const activePlacements: string[] = [];
          if (selectedLogoFront) activePlacements.push("Front");
          if (selectedLogoBack) activePlacements.push("Back");
          if (selectedLogoLeftSleeve) activePlacements.push("Left Sleeve");
          if (selectedLogoRightSleeve) activePlacements.push("Right Sleeve");
          if (tagLogos.length > 0 || tagTexts.length > 0) activePlacements.push("Size Tag");
          const count = activePlacements.length;
          return (
            <div className="flex flex-col items-start gap-0.5">
              <span className="text-xs font-bold text-neutral-800">Total Placements: {count}</span>
              <span className="text-[10px] text-neutral-500 font-medium">{count > 0 ? activePlacements.join(', ') : 'None selected'}</span>
            </div>
          );
        })()}
        <div className="flex gap-3">
          <button 
            onClick={onClose}
            className="bg-white border border-neutral-200 text-neutral-900 px-6 py-3 rounded-xl text-xs font-bold hover:bg-neutral-100 transition-all shadow-sm cursor-pointer"
          >
            Cancel
          </button>
        <button 
          data-tour="save-customization-btn"
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

      {/* Invisible font prefetch helper */}
      <div style={{ opacity: 0, position: 'absolute', pointerEvents: 'none', height: 0, overflow: 'hidden' }}>
        {SUPPORTED_FONTS.map(f => <span key={f.value} style={{ fontFamily: f.value }}>a</span>)}
      </div>
    </div>
  );
}
