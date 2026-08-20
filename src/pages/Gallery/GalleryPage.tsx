import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Sparkles, Upload, Loader2, Plus, Trash2, Edit2 } from 'lucide-react';
import { db, storage } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import sanmarCatalogJson from '../../data/sanmar-catalog.json';
import colorHexMapJson from '../../data/color-hex-map.json';
import { getFilteredProductColors, detectGarmentTypeTag } from '../../lib/garmentUtils';

const colorHexMap = colorHexMapJson as Record<string, string>;
const sanmarCatalog = sanmarCatalogJson as any[];

const resolveHexColor = (colorName: string): string => {
  const norm = colorName.toLowerCase().trim();
  if (colorHexMap[norm]) return colorHexMap[norm];
  for (const [k, v] of Object.entries(colorHexMap)) {
    if (k.toLowerCase() === norm) return v;
  }
  if (norm.includes('black')) return '#1a1a1a';
  if (norm.includes('white') || norm.includes('snow')) return '#ffffff';
  if (norm.includes('navy')) return '#1b263b';
  if (norm.includes('charcoal') || norm.includes('dark grey') || norm.includes('dark gray')) return '#333333';
  if (norm.includes('grey') || norm.includes('gray')) return '#7a7a7a';
  if (norm.includes('red')) return '#b91c1c';
  if (norm.includes('blue')) return '#1d4ed8';
  if (norm.includes('green') || norm.includes('olive')) return '#15803d';
  if (norm.includes('brown')) return '#5c4d44';
  if (norm.includes('beige') || norm.includes('sand') || norm.includes('khaki') || norm.includes('tan')) return '#d6c8b4';
  if (norm.includes('yellow') || norm.includes('gold')) return '#eab308';
  return '#888888';
};

const cleanGarmentTitle = (title: string, styleId?: string): string => {
  if (!title) return 'Custom Garment';
  let cleaned = title
    .replace(/®/g, '')
    .replace(/™/g, '')
    .replace(/\b(BELLA\+CANVAS|BELLA \+ CANVAS|District|Sport-Tek|Stanley\/Stella|Port & Company|Port and Company|Anvil|Gildan|Next Level|CornerStone|Mercer|Ogio|Jerzees|Hanes|Fruit of the Loom|Carhartt|Nike|Adidas|Champion|Comfort Colors|Rabbit Skins|LAT|Alternative)\b/gi, '')
    .trim();
  cleaned = cleaned.replace(/^[\s\-\.–—•:]+/, '').trim();
  if (styleId) {
    const escapedStyle = styleId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const styleRegex = new RegExp(`[\\.\\s\\-–—•]*${escapedStyle}[\\s\\.]*`, 'gi');
    cleaned = cleaned.replace(styleRegex, '').trim();
  }
  return cleaned || title;
};

export interface GalleryItem {
  id: string;
  title: string;
  category: string;
  imageUrl: string; // Primary Photo
  secondaryImageUrl?: string; // Secondary Photo (Back View / Alternate)
  fitOptions: string[]; // e.g. ['Fitted', 'Standard', 'Loose']
  activeFitIndex: number; // e.g. 2 for Loose
  specs: string; // e.g. "5 oz · 7/8 Neckdrop Shoulderside Seamedtear"
  colors: string[]; // hex codes
  colorCount: number; // total count indicator, e.g. 10
}

export interface GallerySettings {
  heroImageUrl: string;
  heroTitle: string;
  heroSubtitle: string;
  categories: string[];
  items: GalleryItem[];
}

const DEFAULT_GALLERY_SETTINGS: GallerySettings = {
  heroImageUrl: 'https://images.unsplash.com/photo-1558769132-cb1aea458c5e?q=80&w=2000&auto=format&fit=crop',
  heroTitle: 'Studio Gallery',
  heroSubtitle: 'Explore our curated apparel lookbook and garment blank collection.',
  categories: ['ALL', 'T-SHIRT', 'POLO', 'HOODIE', 'LONGSLEEVE', 'CREWNECK', 'JACKET', 'HAT'],
  items: [
    {
      id: 'item-1',
      title: 'HD-HEAVY Tee',
      category: 'T-SHIRT',
      imageUrl: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?q=80&w=1000&auto=format&fit=crop',
      fitOptions: ['Fitted', 'Standard', 'Loose'],
      activeFitIndex: 2,
      specs: '5 oz · 7/8 Neckdrop Shoulderside Seamedtear',
      colors: ['#5c4d44', '#d6c8b4', '#4a4e51', '#1a1a1a'],
      colorCount: 10,
    },
    {
      id: 'item-2',
      title: 'Boyfriend Tee',
      category: 'T-SHIRT',
      imageUrl: 'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?q=80&w=1000&auto=format&fit=crop',
      fitOptions: ['Fitted', 'Standard', 'Loose'],
      activeFitIndex: 2,
      specs: '6.5 oz · 100% Cotton',
      colors: ['#e2ded0', '#d8c7a1', '#7a8b8b', '#2f3b3b'],
      colorCount: 6,
    },
    {
      id: 'item-3',
      title: 'Everyday Tee',
      category: 'T-SHIRT',
      imageUrl: 'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?q=80&w=1000&auto=format&fit=crop',
      fitOptions: ['Fitted', 'Standard', 'Loose'],
      activeFitIndex: 1,
      specs: '4.2 oz · 90/10 Cotton/Poly',
      colors: ['#bcbcbc', '#8c8c8c', '#4a4a4a', '#111111'],
      colorCount: 33,
    },
    {
      id: 'item-4',
      title: 'Vintage Heavy Hoodie',
      category: 'HOODIE',
      imageUrl: 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?q=80&w=1000&auto=format&fit=crop',
      fitOptions: ['Fitted', 'Standard', 'Loose'],
      activeFitIndex: 2,
      specs: '14 oz · Heavyweight French Terry',
      colors: ['#2c3539', '#5c4d44', '#1a1a1a'],
      colorCount: 8,
    },
    {
      id: 'item-5',
      title: 'Pique Pro Polo',
      category: 'POLO',
      imageUrl: 'https://images.unsplash.com/photo-1625910513413-5acc215b3c58?q=80&w=1000&auto=format&fit=crop',
      fitOptions: ['Fitted', 'Standard', 'Loose'],
      activeFitIndex: 1,
      specs: '6.8 oz · 100% Combed Cotton',
      colors: ['#1b263b', '#e2ded0', '#1a1a1a'],
      colorCount: 12,
    },
    {
      id: 'item-6',
      title: 'Relaxed Crewneck',
      category: 'CREWNECK',
      imageUrl: 'https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?q=80&w=1000&auto=format&fit=crop',
      fitOptions: ['Fitted', 'Standard', 'Loose'],
      activeFitIndex: 2,
      specs: '10 oz · 80/20 Cotton/Poly',
      colors: ['#8c8c8c', '#2c3539', '#5c4d44'],
      colorCount: 15,
    },
  ],
};

export function GalleryPage() {
  const { userData } = useAuth();
  const isAdmin = userData?.role === 'Admin';

  const [settings, setSettings] = useState<GallerySettings>(() => {
    try {
      const cached = localStorage.getItem('inktheory_gallery_settings');
      if (cached) {
        return { ...DEFAULT_GALLERY_SETTINGS, ...JSON.parse(cached) };
      }
    } catch (e) {
      // ignore
    }
    return DEFAULT_GALLERY_SETTINGS;
  });

  const [selectedCategory, setSelectedCategory] = useState<string>('T-SHIRT');
  const [activeFilter, setActiveFilter] = useState<'garmentTypes' | 'occasion'>('garmentTypes');
  const [activeLightboxImage, setActiveLightboxImage] = useState<string | null>(null);

  // Admin Editor State
  const [isEditing, setIsEditing] = useState(false);
  const [editSettings, setEditSettings] = useState<GallerySettings>(settings);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadingField, setUploadingField] = useState<string | null>(null);

  // Item being edited in modal
  const [editingItem, setEditingItem] = useState<GalleryItem | null>(null);
  const [isAddingNewItem, setIsAddingNewItem] = useState(false);

  // Firestore Realtime Listener for Gallery Settings
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'settings', 'gallery'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as Partial<GallerySettings>;
          const merged: GallerySettings = {
            heroImageUrl: data.heroImageUrl || DEFAULT_GALLERY_SETTINGS.heroImageUrl,
            heroTitle: data.heroTitle || DEFAULT_GALLERY_SETTINGS.heroTitle,
            heroSubtitle: data.heroSubtitle || DEFAULT_GALLERY_SETTINGS.heroSubtitle,
            categories: data.categories && data.categories.length ? data.categories : DEFAULT_GALLERY_SETTINGS.categories,
            items: data.items || DEFAULT_GALLERY_SETTINGS.items,
          };
          setSettings(merged);
          try {
            localStorage.setItem('inktheory_gallery_settings', JSON.stringify(merged));
          } catch (e) {
            // ignore
          }
        }
      },
      (err) => {
        console.warn('Gallery settings listener error:', err);
      }
    );
    return () => unsub();
  }, []);

  // Firestore Realtime Listener for Storefront Catalog Settings
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'settings', 'storefront-catalog'),
      (snap) => {
        if (snap.exists()) {
          const catData = snap.data();
          const racks = catData.racks || {};
          const basics = catData.basics || {};
          const customCatalogItems = catData.customCatalogItems || [];
          const customNames = catData.customNames || {};
          const customSpecs = catData.customSpecs || {};
          const garmentFits = catData.garmentFits || {};
          const cardImages = catData.cardImages || {};
          const cardHoverImages = catData.cardHoverImages || {};
          const colorMockups = catData.colorMockups || {};
          const allowedColors = catData.allowedColors || {};
          const customColors = catData.customColors || {};
          const garmentTypeTags = catData.garmentTypeTags || {};

          // Collect all active styles across racks, basics, and custom items
          const styleSet = new Set<string>();

          // 1. Racks
          if (racks) {
            Object.keys(racks).forEach((cat) => {
              const catObj = racks[cat];
              if (catObj && typeof catObj === 'object') {
                Object.values(catObj).forEach((s) => {
                  if (typeof s === 'string' && s.trim()) styleSet.add(s.trim().toLowerCase());
                });
              }
            });
          }

          // 2. Basics
          if (basics) {
            Object.keys(basics).forEach((cat) => {
              const catObj = basics[cat];
              if (catObj && typeof catObj === 'object') {
                Object.values(catObj).forEach((s) => {
                  if (typeof s === 'string' && s.trim()) styleSet.add(s.trim().toLowerCase());
                });
              }
            });
          }

          // 3. Custom catalog items
          if (Array.isArray(customCatalogItems)) {
            customCatalogItems.forEach((ci: any) => {
              if (ci.style) styleSet.add(String(ci.style).trim().toLowerCase());
            });
          }

          // Build items list for each active style
          const compiledItems: GalleryItem[] = [];

          Array.from(styleSet).forEach((styleKey) => {
            // Find base product details
            const sanmarMatch = sanmarCatalog.find(
              (p: any) => String(p.style).toLowerCase() === styleKey
            );
            const customMatch = Array.isArray(customCatalogItems)
              ? customCatalogItems.find((ci: any) => String(ci.style).toLowerCase() === styleKey)
              : null;
            const baseProduct = sanmarMatch || customMatch;

            // Resolve custom title if specified in Storefront Catalog settings
            let title = '';
            if (customNames?.racks) {
              for (const cat of Object.keys(customNames.racks)) {
                const slots = customNames.racks[cat];
                if (slots && typeof slots === 'object') {
                  for (const sKey of Object.keys(slots)) {
                    const val = slots[sKey];
                    if (typeof val === 'string' && val.trim() && sKey.toLowerCase() === styleKey) {
                      title = val.trim();
                    }
                  }
                }
              }
            }
            if (customNames?.basics && !title) {
              for (const cat of Object.keys(customNames.basics)) {
                const slots = customNames.basics[cat];
                if (slots && typeof slots === 'object') {
                  for (const sKey of Object.keys(slots)) {
                    const val = slots[sKey];
                    if (typeof val === 'string' && val.trim() && sKey.toLowerCase() === styleKey) {
                      title = val.trim();
                    }
                  }
                }
              }
            }
            if (!title && baseProduct) {
              title = baseProduct.customName || cleanGarmentTitle(baseProduct.title || '', styleKey.toUpperCase());
            }
            if (!title) {
              title = styleKey.toUpperCase();
            }

            // Resolve Primary Image (Card Image -> Color Mockup Front -> SanMar Front -> Custom Image)
            let primaryImage = cardImages[styleKey] || '';
            let secondaryImage = cardHoverImages[styleKey] || '';

            if (!primaryImage && colorMockups[styleKey]) {
              const mockMap = colorMockups[styleKey];
              const firstCol = Object.keys(mockMap)[0];
              if (firstCol && mockMap[firstCol]) {
                const colObj = mockMap[firstCol];
                primaryImage = colObj.front || colObj.mockupFront || colObj.image || '';
                secondaryImage = secondaryImage || colObj.back || colObj.mockupBack || '';
              }
            }

            if (!primaryImage && baseProduct?.images) {
              if (typeof baseProduct.images === 'object') {
                const firstColKey = Object.keys(baseProduct.images)[0];
                if (firstColKey && baseProduct.images[firstColKey]) {
                  const imgObj = baseProduct.images[firstColKey];
                  if (typeof imgObj === 'object') {
                    primaryImage = imgObj.front || '';
                    secondaryImage = secondaryImage || imgObj.back || '';
                  } else if (typeof imgObj === 'string') {
                    primaryImage = imgObj;
                  }
                }
                if (!primaryImage && baseProduct.images.front) {
                  primaryImage = baseProduct.images.front;
                  secondaryImage = secondaryImage || baseProduct.images.back || '';
                }
              }
            }

            if (!primaryImage && baseProduct?.imageUrl) {
              primaryImage = baseProduct.imageUrl;
            }

            // EXCLUDE IF NO PRIMARY PHOTO
            if (!primaryImage || !primaryImage.trim()) {
              return;
            }

            // Resolve Category Tag (T-SHIRT, POLO, HOODIE, LONGSLEEVE, CREWNECK, JACKET, HAT)
            const detectedTag = detectGarmentTypeTag(baseProduct || { style: styleKey }, garmentTypeTags);
            let category = 'T-SHIRT';
            if (detectedTag === 'polo') category = 'POLO';
            else if (detectedTag === 'hoodie') category = 'HOODIE';
            else if (detectedTag === 'longsleeve') category = 'LONGSLEEVE';
            else if (detectedTag === 'crewneck') category = 'CREWNECK';
            else if (detectedTag === 'jacket') category = 'JACKET';
            else if (detectedTag === 'hat') category = 'HAT';
            else category = 'T-SHIRT';

            // Resolve Specs
            let specs = '';
            if (customSpecs?.racks) {
              for (const cat of Object.keys(customSpecs.racks)) {
                const slots = customSpecs.racks[cat];
                if (slots && typeof slots === 'object') {
                  for (const sKey of Object.keys(slots)) {
                    const val = slots[sKey];
                    if (typeof val === 'string' && val.trim() && sKey.toLowerCase() === styleKey) {
                      specs = val.trim();
                    }
                  }
                }
              }
            }
            if (!specs && baseProduct?.description) {
              specs = baseProduct.description.slice(0, 75).trim() + '...';
            }
            if (!specs) {
              specs = 'Premium Blank · Good / Better / Best';
            }

            // Resolve Swatches & Allowed Colors
            const colorList = getFilteredProductColors(
              baseProduct || { style: styleKey, colors: [] },
              allowedColors,
              customColors
            );
            const hexSwatches = colorList.slice(0, 4).map((cName) => resolveHexColor(cName));

            // Resolve Fit options
            const fitString = garmentFits[styleKey] || 'Fitted · Standard · Loose';
            const fitOptions = String(fitString).split('·').map((f: string) => f.trim()).filter(Boolean);

            compiledItems.push({
              id: `cat-${styleKey}`,
              title,
              category,
              imageUrl: primaryImage,
              secondaryImageUrl: secondaryImage || undefined,
              fitOptions: fitOptions.length > 0 ? fitOptions : ['Fitted', 'Standard', 'Loose'],
              activeFitIndex: 1,
              specs,
              colors: hexSwatches,
              colorCount: colorList.length,
            });
          });

          if (compiledItems.length > 0) {
            setSettings((prev) => ({
              ...prev,
              items: compiledItems,
            }));
          }
        }
      },
      (err) => {
        console.warn('Storefront catalog settings listener error:', err);
      }
    );
    return () => unsub();
  }, []);

  const handleSaveGallerySettings = async () => {
    setIsSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'gallery'), editSettings, { merge: true });
      setSettings(editSettings);
      try {
        localStorage.setItem('inktheory_gallery_settings', JSON.stringify(editSettings));
      } catch (e) {
        // ignore
      }
      setIsEditing(false);
    } catch (err) {
      console.error('Error saving gallery settings:', err);
      alert('Failed to save gallery settings. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileUpload = async (file: File, callback: (url: string) => void, fieldId: string) => {
    setUploadingField(fieldId);
    try {
      const storageRef = ref(storage, `gallery_media/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      callback(url);
    } catch (err) {
      console.error('Failed to upload image:', err);
      alert('Failed to upload image. Please try again.');
    } finally {
      setUploadingField(null);
    }
  };

  const categoriesWithoutAll = settings.categories.filter((c) => c !== 'ALL');

  // Filter items by category tab
  const displayItems = settings.items.filter((item) => {
    if (selectedCategory === 'ALL') return true;
    return item.category.toUpperCase() === selectedCategory.toUpperCase();
  });

  return (
    <div className="min-h-screen bg-white text-zinc-950 font-sans">
      {/* ------------------------------------------------------------------ */}
      {/* TOP HEADER NAV                                                     */}
      {/* ------------------------------------------------------------------ */}
      <header className="sticky top-0 z-40 border-b border-zinc-200/80 bg-white/90 backdrop-blur-md">
        <div className="flex items-center justify-between px-4 py-3 sm:px-8 md:px-12">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <span className="font-sans text-xl sm:text-2xl font-black tracking-tighter uppercase text-zinc-950">
              INKTHEORY
            </span>
          </Link>

          {/* Nav Items */}
          <div className="flex items-center gap-2 sm:gap-3">
            {isAdmin && (
              <button
                onClick={() => {
                  setEditSettings(settings);
                  setIsEditing(true);
                }}
                className="font-inter flex items-center gap-1.5 rounded-full border border-amber-400 bg-amber-50 px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-900 transition-colors hover:bg-amber-100 cursor-pointer shadow-xs"
              >
                <Sparkles size={12} className="text-amber-600" />
                Customize Gallery
              </button>
            )}

            <Link
              to="/shop"
              className="font-inter rounded-full border border-zinc-300 px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-700 hover:border-zinc-950 hover:text-zinc-950 transition-colors"
            >
              Shop
            </Link>

            <Link
              to="/gallery"
              className="font-inter rounded-full bg-zinc-950 px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white shadow-xs"
            >
              Gallery
            </Link>

            <Link
              to="/start"
              className="font-inter rounded-full bg-zinc-900 hover:bg-zinc-800 px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white transition-colors"
            >
              Start
            </Link>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* HERO / STUDIO BANNER SECTION                                       */}
      {/* ------------------------------------------------------------------ */}
      <section className="relative w-full h-[45vh] sm:h-[55vh] md:h-[65vh] overflow-hidden bg-zinc-950">
        <img
          src={settings.heroImageUrl}
          alt="Studio Photography"
          className="h-full w-full object-cover object-center opacity-90 transition-all duration-700"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/80 via-zinc-950/20 to-transparent" />
        {(settings.heroTitle || settings.heroSubtitle) && (
          <div className="absolute bottom-6 left-6 right-6 md:bottom-12 md:left-12 max-w-2xl text-white">
            <h1 className="font-serif text-3xl sm:text-5xl md:text-6xl font-normal tracking-tight leading-tight">
              {settings.heroTitle}
            </h1>
            <p className="font-inter mt-2 text-xs sm:text-sm font-light text-zinc-300 max-w-xl">
              {settings.heroSubtitle}
            </p>
          </div>
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* FILTER & CATEGORY TABS SUB-HEADER                                   */}
      {/* ------------------------------------------------------------------ */}
      <div className="border-b border-zinc-200 bg-white">
        {/* Top Control Bar (Garment Types & Occasion) */}
        <div className="flex flex-wrap items-center justify-end gap-2 px-4 py-3 sm:px-8 md:px-12 border-b border-zinc-100">
          <button
            onClick={() => setActiveFilter('garmentTypes')}
            className={`font-inter rounded-full px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors cursor-pointer ${
              activeFilter === 'garmentTypes'
                ? 'bg-zinc-950 text-white'
                : 'border border-zinc-200 bg-zinc-50 text-zinc-700 hover:border-zinc-400'
            }`}
          >
            Garment Types
          </button>
          <button
            onClick={() => setActiveFilter('occasion')}
            className={`font-inter rounded-full px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors cursor-pointer ${
              activeFilter === 'occasion'
                ? 'bg-zinc-950 text-white'
                : 'border border-zinc-200 bg-zinc-50 text-zinc-700 hover:border-zinc-400'
            }`}
          >
            Occasion
          </button>
        </div>

        {/* Category Tabs Bar */}
        <div className="flex overflow-x-auto justify-center gap-6 px-4 py-3.5 sm:gap-10 sm:px-8 md:px-12 scrollbar-none">
          {categoriesWithoutAll.map((cat) => {
            const isActive = selectedCategory.toUpperCase() === cat.toUpperCase();
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`font-inter whitespace-nowrap text-[11px] sm:text-xs font-bold uppercase tracking-widest transition-all pb-1 relative cursor-pointer ${
                  isActive ? 'text-zinc-950' : 'text-zinc-400 hover:text-zinc-700'
                }`}
              >
                {cat}
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-zinc-950 rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* GARMENT GALLERY GRID                                               */}
      {/* ------------------------------------------------------------------ */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 py-8">
        {displayItems.length === 0 ? (
          <div className="py-20 text-center text-zinc-500 font-inter text-sm">
            No items in category "{selectedCategory}". Add items using "Customize Gallery" above.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-8">
            {displayItems.map((item) => (
              <div key={item.id} className="group flex flex-col space-y-3">
                {/* Garment Image Card (Clean photo, NO plus buttons, smooth hover to secondary image if available) */}
                <div
                  onClick={() => setActiveLightboxImage(item.imageUrl)}
                  className="relative aspect-square w-full overflow-hidden bg-zinc-100 rounded-none border border-zinc-200/80 cursor-pointer"
                >
                  <img
                    src={item.imageUrl}
                    alt={item.title}
                    className={`h-full w-full object-cover object-center transition-all duration-500 ${
                      item.secondaryImageUrl ? 'group-hover:opacity-0 group-hover:scale-105' : 'group-hover:scale-105'
                    }`}
                  />
                  {item.secondaryImageUrl && (
                    <img
                      src={item.secondaryImageUrl}
                      alt={`${item.title} back view`}
                      className="absolute inset-0 h-full w-full object-cover object-center opacity-0 transition-all duration-500 group-hover:opacity-100 group-hover:scale-105"
                    />
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-950/80 backdrop-blur-md text-white text-[10px] font-bold uppercase tracking-widest px-3.5 py-1.5 rounded-none shadow-lg">
                      Click to Enlarge
                    </span>
                  </div>
                </div>

                {/* Item Details Footer */}
                <div className="space-y-1.5 pt-1">
                  {/* Title and Color Swatches */}
                  <div className="flex items-center justify-between">
                    <h3 className="font-serif text-lg font-bold tracking-tight text-zinc-950">
                      {item.title}
                    </h3>
                    <div className="flex items-center gap-1">
                      {item.colors.map((hex, i) => (
                        <span
                          key={i}
                          className="h-3 w-3 rounded-full border border-black/10 shadow-2xs"
                          style={{ backgroundColor: hex }}
                        />
                      ))}
                      {item.colorCount > 0 && (
                        <span className="font-mono text-[10px] text-zinc-500 font-semibold ml-1">
                          {item.colorCount}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Fit Options Indicator */}
                  <div className="font-inter flex items-center gap-2 text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">
                    {item.fitOptions.map((fit, idx) => (
                      <span
                        key={fit}
                        className={idx === item.activeFitIndex ? 'text-zinc-950 font-bold underline' : ''}
                      >
                        {fit}
                      </span>
                    ))}
                  </div>

                  {/* Specs Line */}
                  <p className="font-inter text-[11px] text-zinc-500 font-light tracking-tight">
                    {item.specs}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* ------------------------------------------------------------------ */}
      {/* LIGHTBOX FULLSCREEN MODAL                                          */}
      {/* ------------------------------------------------------------------ */}
      {activeLightboxImage && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 sm:p-8 animate-in fade-in duration-200 cursor-zoom-out"
          onClick={() => setActiveLightboxImage(null)}
        >
          <button
            onClick={() => setActiveLightboxImage(null)}
            className="absolute top-6 right-6 p-3 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-all cursor-pointer z-[101]"
            aria-label="Close fullscreen view"
          >
            ✕
          </button>
          <img
            src={activeLightboxImage}
            alt="Enlarged view"
            className="max-h-[92vh] max-w-[92vw] object-contain rounded-none shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* ADMIN CUSTOMIZE GALLERY MODAL                                      */}
      {/* ------------------------------------------------------------------ */}
      {isEditing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 sm:p-6 animate-in fade-in duration-200">
          <div className="bg-white border border-zinc-200 rounded-3xl p-6 sm:p-8 max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 text-zinc-950">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-zinc-100">
              <div>
                <h3 className="text-xl font-serif text-zinc-950 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-500" />
                  Customize Lookbook Gallery
                </h3>
                <p className="text-zinc-500 text-xs mt-0.5">
                  Update hero studio banner, category tabs, and lookbook garment cards.
                </p>
              </div>
              <button
                onClick={() => setIsEditing(false)}
                className="p-2 text-zinc-400 hover:text-zinc-950 hover:bg-zinc-100 rounded-full transition-all cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto py-6 space-y-6 pr-2">
              {/* SECTION 1: HERO MEDIA */}
              <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-2xl space-y-4">
                <h4 className="font-serif font-bold text-sm text-zinc-950">1. Hero Studio Banner</h4>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-zinc-900 block">Banner Image</span>
                    <span className="text-[10px] text-zinc-500">Upload background photo for the gallery hero banner.</span>
                  </div>
                  <label className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1.5 shadow-xs transition-all">
                    {uploadingField === 'heroBanner' ? (
                      <>
                        <Loader2 className="animate-spin" size={13} />
                        <span>Uploading...</span>
                      </>
                    ) : (
                      <>
                        <Upload size={13} />
                        <span>Upload Hero Image</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploadingField === 'heroBanner'}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                          handleFileUpload(f, (url) => {
                            setEditSettings((prev) => ({ ...prev, heroImageUrl: url }));
                          }, 'heroBanner');
                        }
                      }}
                    />
                  </label>
                </div>
                {editSettings.heroImageUrl && (
                  <div className="relative h-24 w-full rounded-xl overflow-hidden border border-zinc-200">
                    <img src={editSettings.heroImageUrl} alt="Hero Preview" className="h-full w-full object-cover" />
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-zinc-900 block mb-1">Hero Title</label>
                    <input
                      type="text"
                      value={editSettings.heroTitle}
                      onChange={(e) => setEditSettings({ ...editSettings, heroTitle: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-zinc-900 block mb-1">Hero Subtitle</label>
                    <input
                      type="text"
                      value={editSettings.heroSubtitle}
                      onChange={(e) => setEditSettings({ ...editSettings, heroSubtitle: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 2: CATEGORY TABS */}
              <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-2xl space-y-3">
                <h4 className="font-serif font-bold text-sm text-zinc-950">2. Category Tabs</h4>
                <div className="flex flex-wrap gap-2">
                  {editSettings.categories.map((cat, idx) => (
                    <div key={idx} className="flex items-center gap-1 bg-white border border-zinc-300 px-3 py-1 rounded-full text-xs font-bold">
                      <span>{cat}</span>
                      {cat !== 'ALL' && (
                        <button
                          type="button"
                          onClick={() => {
                            const updated = editSettings.categories.filter((_, i) => i !== idx);
                            setEditSettings({ ...editSettings, categories: updated });
                          }}
                          className="text-zinc-400 hover:text-red-500 ml-1 cursor-pointer"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 pt-2">
                  <input
                    type="text"
                    id="newCatInput"
                    placeholder="New category (e.g. OUTERWEAR)"
                    className="px-3 py-1.5 bg-white border border-zinc-300 rounded-xl text-xs flex-1 uppercase"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const input = document.getElementById('newCatInput') as HTMLInputElement;
                      if (input && input.value.trim()) {
                        const val = input.value.trim().toUpperCase();
                        if (!editSettings.categories.includes(val)) {
                          setEditSettings({
                            ...editSettings,
                            categories: [...editSettings.categories, val],
                          });
                          input.value = '';
                        }
                      }
                    }}
                    className="px-4 py-1.5 bg-zinc-900 text-white rounded-xl text-xs font-bold cursor-pointer"
                  >
                    Add Category
                  </button>
                </div>
              </div>

              {/* SECTION 3: GARMENT ITEMS */}
              <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-2xl space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-serif font-bold text-sm text-zinc-950">3. Lookbook Garment Cards</h4>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingItem({
                        id: `item-${Date.now()}`,
                        title: 'New Garment',
                        category: editSettings.categories[1] || 'T-SHIRT',
                        imageUrl: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?q=80&w=1000&auto=format&fit=crop',
                        fitOptions: ['Fitted', 'Standard', 'Loose'],
                        activeFitIndex: 1,
                        specs: '6 oz · 100% Cotton',
                        colors: ['#1a1a1a', '#8c8c8c'],
                        colorCount: 5,
                      });
                      setIsAddingNewItem(true);
                    }}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1 shadow-xs"
                  >
                    <Plus size={13} />
                    Add New Garment
                  </button>
                </div>

                <div className="space-y-3">
                  {editSettings.items.map((item, idx) => (
                    <div key={item.id} className="flex items-center justify-between p-3 bg-white border border-zinc-200 rounded-xl">
                      <div className="flex items-center gap-3">
                        <img src={item.imageUrl} alt={item.title} className="h-12 w-12 object-cover rounded-lg bg-zinc-100" />
                        <div>
                          <span className="font-bold text-xs block text-zinc-900">{item.title}</span>
                          <span className="text-[10px] text-zinc-500 font-mono">{item.category} · {item.specs}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingItem({ ...item });
                            setIsAddingNewItem(false);
                          }}
                          className="p-1.5 text-zinc-600 hover:text-zinc-950 bg-zinc-100 hover:bg-zinc-200 rounded-lg cursor-pointer"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const updated = editSettings.items.filter((_, i) => i !== idx);
                            setEditSettings({ ...editSettings, items: updated });
                          }}
                          className="p-1.5 text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded-lg cursor-pointer"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="pt-4 border-t border-zinc-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-5 py-2.5 rounded-full border border-zinc-300 text-xs font-bold text-zinc-700 hover:bg-zinc-100 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveGallerySettings}
                disabled={isSaving}
                className="px-6 py-2.5 rounded-full bg-zinc-950 hover:bg-zinc-800 text-white text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-md"
              >
                {isSaving ? <Loader2 className="animate-spin" size={14} /> : <Sparkles size={14} />}
                <span>Save Changes</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* ITEM EDITOR SUB-MODAL                                              */}
      {/* ------------------------------------------------------------------ */}
      {editingItem && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white border border-zinc-200 rounded-3xl p-6 max-w-lg w-full space-y-4 shadow-2xl text-zinc-950">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <h4 className="font-serif font-bold text-base">
                {isAddingNewItem ? 'Add New Garment Card' : 'Edit Garment Card'}
              </h4>
              <button onClick={() => setEditingItem(null)} className="text-zinc-400 hover:text-zinc-950">✕</button>
            </div>

            <div className="space-y-3">
              {/* Image Upload */}
              <div className="flex items-center gap-4">
                <div className="h-20 w-20 rounded-xl overflow-hidden bg-zinc-100 border border-zinc-200 shrink-0">
                  <img src={editingItem.imageUrl} alt={editingItem.title} className="h-full w-full object-cover" />
                </div>
                <label className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1.5 shadow-xs">
                  {uploadingField === 'itemImage' ? (
                    <>
                      <Loader2 className="animate-spin" size={13} />
                      <span>Uploading...</span>
                    </>
                  ) : (
                    <>
                      <Upload size={13} />
                      <span>Upload Garment Photo</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadingField === 'itemImage'}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        handleFileUpload(
                          f,
                          (url) => setEditingItem({ ...editingItem, imageUrl: url }),
                          'itemImage'
                        );
                      }
                    }}
                  />
                </label>
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-900 block mb-1">Title / Name</label>
                <input
                  type="text"
                  value={editingItem.title}
                  onChange={(e) => setEditingItem({ ...editingItem, title: e.target.value })}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-xl text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-900 block mb-1">Category</label>
                <select
                  value={editingItem.category}
                  onChange={(e) => setEditingItem({ ...editingItem, category: e.target.value })}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-xl text-xs bg-white uppercase"
                >
                  {editSettings.categories.filter((c) => c !== 'ALL').map((cat: string) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-900 block mb-1">Material / Specs Description</label>
                <input
                  type="text"
                  value={editingItem.specs}
                  onChange={(e) => setEditingItem({ ...editingItem, specs: e.target.value })}
                  placeholder="e.g. 5 oz · 7/8 Neckdrop Shoulderside Seamedtear"
                  className="w-full px-3 py-2 border border-zinc-300 rounded-xl text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-zinc-900 block mb-1">Highlight Fit Index (0, 1, or 2)</label>
                  <select
                    value={editingItem.activeFitIndex}
                    onChange={(e) => setEditingItem({ ...editingItem, activeFitIndex: parseInt(e.target.value, 10) })}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-xl text-xs bg-white"
                  >
                    <option value={0}>0 - Fitted</option>
                    <option value={1}>1 - Standard</option>
                    <option value={2}>2 - Loose</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-zinc-900 block mb-1">Color Count Indicator</label>
                  <input
                    type="number"
                    value={editingItem.colorCount}
                    onChange={(e) => setEditingItem({ ...editingItem, colorCount: parseInt(e.target.value, 10) || 0 })}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-xl text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-zinc-100 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="px-4 py-2 rounded-full border border-zinc-300 text-xs font-bold text-zinc-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (isAddingNewItem) {
                    setEditSettings({
                      ...editSettings,
                      items: [...editSettings.items, editingItem],
                    });
                  } else {
                    const updated = editSettings.items.map((i) => (i.id === editingItem.id ? editingItem : i));
                    setEditSettings({ ...editSettings, items: updated });
                  }
                  setEditingItem(null);
                }}
                className="px-5 py-2 rounded-full bg-zinc-950 text-white text-xs font-bold"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
