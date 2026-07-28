import { useState } from 'react';
import { X, Upload, Loader2, Plus, Trash2, Check, Shirt, Palette } from 'lucide-react';
import { db, storage } from '../../lib/firebase';
import { doc, getDoc, setDoc, collection, addDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { PillButton } from '../ui/PillButton';

interface ColorEntry {
  colorName: string;
  swatchHex: string;
  frontImageFile: File | null;
  frontImageUrl: string;
  backImageFile: File | null;
  backImageUrl: string;
}

interface ImportGarmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (createdProduct: any) => void;
  initialCategory?: string;
}

const COMMON_BRANDS = [
  'S&S Activewear',
  'Independent Trading Co',
  'Comfort Colors',
  'Bella + Canvas',
  'Next Level Apparel',
  'Gildan',
  'Champion',
  'Port Authority',
  'Sport-Tek',
  'District',
  'Carhartt',
  'Augusta Sportswear',
  'Richardson',
  'Custom / Other'
];

const CATEGORIES = [
  'T-Shirts',
  'Polos/Knits',
  'Sweatshirts/Fleece',
  'Caps & Hats',
  'Outerwear',
  'Workwear',
  'Woven Shirts',
  'Accessories'
];

export const ImportGarmentModal = ({ isOpen, onClose, onSuccess, initialCategory }: ImportGarmentModalProps) => {
  const [style, setStyle] = useState('');
  const [title, setTitle] = useState('');
  const [brand, setBrand] = useState('S&S Activewear');
  const [customBrand, setCustomBrand] = useState('');
  const [category, setCategory] = useState(initialCategory || 'T-Shirts');
  const [price, setPrice] = useState<string>('9.99');
  const [weight, setWeight] = useState('');
  const [fabric, setFabric] = useState('');
  const [description, setDescription] = useState('');

  const [colors, setColors] = useState<ColorEntry[]>([
    {
      colorName: 'Black',
      swatchHex: '#212121',
      frontImageFile: null,
      frontImageUrl: '',
      backImageFile: null,
      backImageUrl: ''
    }
  ]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleAddColor = () => {
    setColors(prev => [
      ...prev,
      {
        colorName: '',
        swatchHex: '#cccccc',
        frontImageFile: null,
        frontImageUrl: '',
        backImageFile: null,
        backImageUrl: ''
      }
    ]);
  };

  const handleRemoveColor = (idx: number) => {
    if (colors.length <= 1) return;
    setColors(prev => prev.filter((_, i) => i !== idx));
  };

  const handleColorChange = (idx: number, field: keyof ColorEntry, val: any) => {
    setColors(prev => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: val };
      return copy;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanStyle = style.trim().toUpperCase();
    const cleanTitle = title.trim();
    const finalBrand = brand === 'Custom / Other' ? customBrand.trim() : brand;

    if (!cleanStyle) {
      setErrorMsg('Please enter a Style Code / SKU (e.g. SS-3001).');
      return;
    }
    if (!cleanTitle) {
      setErrorMsg('Please enter a Product Title.');
      return;
    }
    if (!finalBrand) {
      setErrorMsg('Please specify a Brand name.');
      return;
    }

    const validColors = colors.filter(c => c.colorName.trim() !== '');
    if (validColors.length === 0) {
      setErrorMsg('Please add at least one color name.');
      return;
    }

    setIsSubmitting(true);

    try {
      const colorNamesList: string[] = [];
      const imagesMap: Record<string, { front: string; back?: string; swatch?: string }> = {};

      for (let i = 0; i < validColors.length; i++) {
        const c = validColors[i];
        const cName = c.colorName.trim();
        colorNamesList.push(cName);

        let frontUrl = c.frontImageUrl.trim();
        let backUrl = c.backImageUrl.trim();

        // Upload front image if file provided
        if (c.frontImageFile) {
          const fileRef = ref(storage, `custom_garments/${cleanStyle}_${cName}_front_${Date.now()}_${c.frontImageFile.name}`);
          await uploadBytes(fileRef, c.frontImageFile);
          frontUrl = await getDownloadURL(fileRef);
        }

        // Upload back image if file provided
        if (c.backImageFile) {
          const fileRef = ref(storage, `custom_garments/${cleanStyle}_${cName}_back_${Date.now()}_${c.backImageFile.name}`);
          await uploadBytes(fileRef, c.backImageFile);
          backUrl = await getDownloadURL(fileRef);
        }

        // Fallback default image if none provided
        if (!frontUrl) {
          frontUrl = 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&q=80&w=400&h=400';
        }

        imagesMap[cName] = {
          front: frontUrl,
          back: backUrl || frontUrl,
          swatch: c.swatchHex || '#808080'
        };
      }

      // Format description with weight and fabric details if specified
      let fullDescription = description.trim();
      if (weight || fabric) {
        const specsLine = [weight ? `${weight} oz` : '', fabric].filter(Boolean).join(' • ');
        if (specsLine && !fullDescription.includes(specsLine)) {
          fullDescription = fullDescription ? `${specsLine}. ${fullDescription}` : specsLine;
        }
      }

      const newProduct = {
        style: cleanStyle,
        title: `${finalBrand} - ${cleanTitle}`,
        brand: finalBrand,
        category,
        price: parseFloat(price) || 9.99,
        description: fullDescription,
        weight: weight ? `${weight} oz` : '',
        fabric: fabric || '',
        colors: colorNamesList,
        images: imagesMap,
        isCustom: true,
        createdAt: new Date().toISOString()
      };

      // 1. Save to Firestore collection custom-catalog-items
      await addDoc(collection(db, 'custom-catalog-items'), newProduct);

      // 2. Also save to global customCatalog list in Firestore settings/storefront-catalog for instant sync
      const catalogDocRef = doc(db, 'settings', 'storefront-catalog');
      const docSnap = await getDoc(catalogDocRef);
      let existingCustomItems: any[] = [];
      if (docSnap.exists()) {
        existingCustomItems = docSnap.data().customCatalogItems || [];
      }
      const updatedCustomItems = [newProduct, ...existingCustomItems.filter(p => p.style !== newProduct.style)];
      
      await setDoc(catalogDocRef, {
        customCatalogItems: updatedCustomItems
      }, { merge: true });

      // Save into window for immediate in-memory availability
      if (typeof window !== 'undefined') {
        (window as any).__customCatalogItems = updatedCustomItems;
      }

      onSuccess(newProduct);
      onClose();
    } catch (err: any) {
      console.error("Failed to import custom item:", err);
      setErrorMsg(err.message || 'Failed to save custom product.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-neutral-200 my-8 animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-4 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <Shirt size={20} className="text-brand-primary" />
              <h2 className="text-xl font-serif font-bold text-neutral-900">Import / Add Custom Garment</h2>
            </div>
            <p className="text-xs text-neutral-500 mt-1">
              Add non-SanMar items (S&S Activewear, Independent, etc.) with custom specs, colors, and mockups.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Main Attributes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-400 block mb-1">
                Style Code / SKU *
              </label>
              <input
                type="text"
                value={style}
                onChange={e => setStyle(e.target.value)}
                placeholder="e.g. SS-3001, IND4000"
                className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-3.5 py-2 text-xs font-semibold text-neutral-900 focus:outline-none focus:ring-1 focus:ring-black"
                required
              />
            </div>

            <div>
              <label className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-400 block mb-1">
                Brand *
              </label>
              <select
                value={brand}
                onChange={e => setBrand(e.target.value)}
                className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-3.5 py-2 text-xs font-semibold text-neutral-900 focus:outline-none focus:ring-1 focus:ring-black"
              >
                {COMMON_BRANDS.map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
              {brand === 'Custom / Other' && (
                <input
                  type="text"
                  value={customBrand}
                  onChange={e => setCustomBrand(e.target.value)}
                  placeholder="Enter brand name..."
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-3.5 py-2 text-xs text-neutral-900 mt-2 focus:outline-none focus:ring-1 focus:ring-black"
                />
              )}
            </div>

            <div className="sm:col-span-2">
              <label className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-400 block mb-1">
                Product Title / Name *
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Heavyweight Fleece Pullover Hoodie"
                className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-3.5 py-2 text-xs font-semibold text-neutral-900 focus:outline-none focus:ring-1 focus:ring-black"
                required
              />
            </div>

            <div>
              <label className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-400 block mb-1">
                Category *
              </label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-3.5 py-2 text-xs font-semibold text-neutral-900 focus:outline-none focus:ring-1 focus:ring-black"
              >
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-400 block mb-1">
                MSRP / Base Price ($)
              </label>
              <input
                type="number"
                step="0.01"
                value={price}
                onChange={e => setPrice(e.target.value)}
                placeholder="9.99"
                className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-3.5 py-2 text-xs text-neutral-900 focus:outline-none focus:ring-1 focus:ring-black"
              />
            </div>

            <div>
              <label className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-400 block mb-1">
                Garment Weight (oz)
              </label>
              <input
                type="text"
                value={weight}
                onChange={e => setWeight(e.target.value)}
                placeholder="e.g. 4.3 or 8.5"
                className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-3.5 py-2 text-xs text-neutral-900 focus:outline-none focus:ring-1 focus:ring-black"
              />
            </div>

            <div>
              <label className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-400 block mb-1">
                Fabric Blend / Composition
              </label>
              <input
                type="text"
                value={fabric}
                onChange={e => setFabric(e.target.value)}
                placeholder="e.g. 100% Cotton or 80/20 Fleece"
                className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-3.5 py-2 text-xs text-neutral-900 focus:outline-none focus:ring-1 focus:ring-black"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-400 block mb-1">
                Product Description & Specs
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Enter detailed garment description, sizing info, decorator specs..."
                className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-3.5 py-2 text-xs text-neutral-900 focus:outline-none focus:ring-1 focus:ring-black resize-y"
              />
            </div>
          </div>

          {/* Colorways Section */}
          <div className="border-t border-neutral-200 pt-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-800 flex items-center gap-1.5">
                  <Palette size={14} className="text-brand-primary" />
                  Colorways & Mockups
                </h3>
                <p className="text-[11px] text-neutral-500">
                  Add available colors with swatch hex and front/back mockup images.
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddColor}
                className="px-3 py-1.5 text-xs font-bold text-black bg-neutral-100 hover:bg-neutral-200 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Plus size={13} />
                <span>Add Color</span>
              </button>
            </div>

            <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
              {colors.map((col, idx) => (
                <div key={idx} className="bg-neutral-50 border border-neutral-200 rounded-2xl p-3.5 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <label className="text-[9px] font-extrabold uppercase text-neutral-400 block mb-1">
                        Color Name
                      </label>
                      <input
                        type="text"
                        value={col.colorName}
                        onChange={e => handleColorChange(idx, 'colorName', e.target.value)}
                        placeholder="e.g. Athletic Heather, Black, Navy"
                        className="w-full bg-white border border-neutral-200 rounded-lg px-2.5 py-1.5 text-xs text-neutral-900 focus:outline-none"
                      />
                    </div>
                    <div className="w-20">
                      <label className="text-[9px] font-extrabold uppercase text-neutral-400 block mb-1">
                        Swatch
                      </label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="color"
                          value={col.swatchHex}
                          onChange={e => handleColorChange(idx, 'swatchHex', e.target.value)}
                          className="w-7 h-7 rounded-lg border border-neutral-200 cursor-pointer p-0 shrink-0"
                        />
                        <span className="text-[10px] font-mono text-neutral-500 uppercase">{col.swatchHex}</span>
                      </div>
                    </div>
                    {colors.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveColor(idx)}
                        className="text-neutral-400 hover:text-red-600 p-1 rounded transition-colors self-end"
                        title="Remove color"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>

                  {/* Image Uploads / URLs */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[9px] font-bold text-neutral-400 uppercase block mb-1">
                        Front Image
                      </span>
                      <div className="flex items-center gap-2">
                        <label className="px-2.5 py-1.5 bg-white border border-neutral-200 rounded-lg text-[11px] font-bold text-neutral-700 hover:bg-neutral-100 transition-colors cursor-pointer flex items-center gap-1 shrink-0">
                          <Upload size={12} />
                          <span>{col.frontImageFile ? 'Change File' : 'Upload'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={e => {
                              const f = e.target.files?.[0];
                              if (f) handleColorChange(idx, 'frontImageFile', f);
                            }}
                          />
                        </label>
                        <input
                          type="text"
                          value={col.frontImageUrl}
                          onChange={e => handleColorChange(idx, 'frontImageUrl', e.target.value)}
                          placeholder="Or paste Image URL..."
                          className="flex-1 bg-white border border-neutral-200 rounded-lg px-2 py-1 text-[11px] text-neutral-800 focus:outline-none"
                        />
                      </div>
                      {col.frontImageFile && (
                        <p className="text-[10px] text-green-700 font-medium mt-1 truncate">
                          Selected: {col.frontImageFile.name}
                        </p>
                      )}
                    </div>

                    <div>
                      <span className="text-[9px] font-bold text-neutral-400 uppercase block mb-1">
                        Back Image (Optional)
                      </span>
                      <div className="flex items-center gap-2">
                        <label className="px-2.5 py-1.5 bg-white border border-neutral-200 rounded-lg text-[11px] font-bold text-neutral-700 hover:bg-neutral-100 transition-colors cursor-pointer flex items-center gap-1 shrink-0">
                          <Upload size={12} />
                          <span>{col.backImageFile ? 'Change File' : 'Upload'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={e => {
                              const f = e.target.files?.[0];
                              if (f) handleColorChange(idx, 'backImageFile', f);
                            }}
                          />
                        </label>
                        <input
                          type="text"
                          value={col.backImageUrl}
                          onChange={e => handleColorChange(idx, 'backImageUrl', e.target.value)}
                          placeholder="Or paste Image URL..."
                          className="flex-1 bg-white border border-neutral-200 rounded-lg px-2 py-1 text-[11px] text-neutral-800 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200">
            <PillButton type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </PillButton>
            <PillButton type="submit" variant="filled" disabled={isSubmitting} className="gap-2">
              {isSubmitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Saving Garment...</span>
                </>
              ) : (
                <>
                  <Check size={14} />
                  <span>Save & Import Item</span>
                </>
              )}
            </PillButton>
          </div>
        </form>
      </div>
    </div>
  );
};
