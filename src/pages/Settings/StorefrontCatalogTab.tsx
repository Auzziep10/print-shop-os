import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Loader2, Save, Search, Check, Info } from 'lucide-react';
import { tokens } from '../../lib/tokens';
import { PillButton } from '../../components/ui/PillButton';
import sanmarCatalogJson from '../../data/sanmar-catalog.json';

interface SanMarProduct {
  style: string;
  title: string;
  brand: string;
  category: string;
  price: number;
}

const sanmarCatalog = sanmarCatalogJson as SanMarProduct[];

const DEFAULT_RACKS = {
  Athleisure: { hat: 'STC70', shirt: 'BC3001', polo: 'ST640', crewneck: 'DT1304', hoodie: 'BC3719', longsleeve: 'BC3501' },
  Casual: { hat: '112', shirt: '64000', polo: '64800', crewneck: 'SF000', hoodie: '18500', longsleeve: '6014' },
  Formal: { hat: 'C402', shirt: 'BC3001', polo: 'K500', crewneck: 'DT1304', hoodie: '996M', longsleeve: 'BC3501' },
  Active: { hat: 'STC70', shirt: 'BC3001', polo: 'ST550', crewneck: 'S6000', hoodie: 'DT6100', longsleeve: '29LS' },
  Business: { hat: 'C402', shirt: 'K810', polo: 'K810', crewneck: 'DT1304', hoodie: 'BC3719', longsleeve: '6014' },
  'Work Wear': { hat: '212', shirt: '5000', polo: 'K420', crewneck: '562M', hoodie: '18500', longsleeve: '6014' },
  Outdoor: { hat: '112', shirt: 'BC3001', polo: 'K110', crewneck: '1566', hoodie: 'DT6100', longsleeve: '6014' },
  Team: { hat: '112', shirt: '64000', polo: 'ST665', crewneck: 'S6000', hoodie: '996M', longsleeve: '29LS' }
};

const DEFAULT_BASICS = {
  'T-Shirts': { good: '5000', better: '64000', best: 'BC3001' },
  Tanks: { good: 'BC8803', better: 'BC8800', best: '9360' },
  LS: { good: '29LS', better: 'BC3501', best: '6014' },
  Sweatshirt: { good: '18000', better: '996M', best: 'DT6100' },
  Hoodie: { good: 'DT6100', better: '18500', best: 'BC3719' },
  Jacket: { good: 'L217', better: 'J317', best: 'J333' }
};

export function StorefrontCatalogTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeSubMode, setActiveSubMode] = useState<'racks' | 'basics'>('racks');

  // Firestore state
  const [racks, setRacks] = useState<Record<string, any>>(DEFAULT_RACKS);
  const [basics, setBasics] = useState<Record<string, any>>(DEFAULT_BASICS);
  const [customNames, setCustomNames] = useState<Record<string, any>>({ racks: {}, basics: {} });
  const [defaultColors, setDefaultColors] = useState<Record<string, any>>({ racks: {}, basics: {} });

  // Active category select
  const [activeRackCategory, setActiveRackCategory] = useState('Athleisure');
  const [activeBasicsCategory, setActiveBasicsCategory] = useState('T-Shirts');

  // Product selector modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeSelectTarget, setActiveSelectTarget] = useState<{
    mode: 'racks' | 'basics';
    category: string;
    slot: string;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const fetchCatalogSettings = async () => {
      try {
        const docRef = doc(db, 'settings', 'storefront-catalog');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.racks) setRacks(data.racks);
          if (data.basics) setBasics(data.basics);
          if (data.customNames) {
            setCustomNames(data.customNames);
          } else {
            setCustomNames({ racks: {}, basics: {} });
          }
          if (data.defaultColors) {
            setDefaultColors(data.defaultColors);
          } else {
            setDefaultColors({ racks: {}, basics: {} });
          }
        }
      } catch (err) {
        console.error("Error fetching storefront catalog settings:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchCatalogSettings();
  }, []);

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'storefront-catalog'), {
        racks,
        basics,
        customNames,
        defaultColors,
        updatedAt: new Date().toISOString()
      });
      alert('Storefront catalog settings saved successfully!');
    } catch (err) {
      console.error("Error saving storefront catalog settings:", err);
      alert('Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenSelector = (mode: 'racks' | 'basics', category: string, slot: string) => {
    setActiveSelectTarget({ mode, category, slot });
    setSearchQuery('');
    setIsModalOpen(true);
  };

  const handleSelectProduct = (style: string) => {
    if (!activeSelectTarget) return;

    const { mode, category, slot } = activeSelectTarget;

    if (mode === 'racks') {
      setRacks(prev => ({
        ...prev,
        [category]: {
          ...prev[category],
          [slot]: style
        }
      }));
      setCustomNames(prev => {
        const racks = prev.racks || {};
        const cat = racks[category] || {};
        return {
          ...prev,
          racks: {
            ...racks,
            [category]: {
              ...cat,
              [slot]: ''
            }
          }
        };
      });
    } else {
      setBasics(prev => ({
        ...prev,
        [category]: {
          ...prev[category],
          [slot]: style
        }
      }));
      setCustomNames(prev => {
        const basics = prev.basics || {};
        const cat = basics[category] || {};
        return {
          ...prev,
          basics: {
            ...basics,
            [category]: {
              ...cat,
              [slot]: ''
            }
          }
        };
      });
    }

    setIsModalOpen(false);
    setActiveSelectTarget(null);
  };

  // Filter products by search query
  const filteredProducts = sanmarCatalog.filter(p => 
    p.style.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.brand.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getGarmentImage = (p: any, chosenColor?: string) => {
    if (p.image) return p.image;
    if (p.images) {
      const colorKey = (chosenColor && p.images[chosenColor]) 
        ? chosenColor 
        : (p.colors?.[0] || Object.keys(p.images)[0]);
      if (colorKey && p.images[colorKey]) {
        return p.images[colorKey].front || p.images[colorKey].swatch || '';
      }
    }
    return 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&q=80&w=200&h=200';
  };

  const getProductDetails = (style: string) => {
    return sanmarCatalog.find(p => p.style === style) || {
      style,
      title: 'Unknown Garment',
      brand: 'N/A',
      price: 0,
      colors: [],
      images: null
    };
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="animate-spin text-brand-secondary" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h2 className={tokens.typography.h2 + " mb-1 flex items-center gap-2"}>
            Storefront Catalog Configuration
          </h2>
          <p className={tokens.typography.bodyMuted}>
            Configure curated garments available for Design Your Rack and Build From Basics.
          </p>
        </div>
        <PillButton 
          variant="filled" 
          onClick={handleSaveSettings} 
          disabled={saving}
          className="gap-2 shrink-0 self-start sm:self-center min-w-[140px]"
        >
          {saving ? <Loader2 className="animate-spin" size={16} /> : <><Save size={16} /> Save Catalog</>}
        </PillButton>
      </div>

      {/* Tabs */}
      <div className="flex border border-brand-border bg-neutral-50 p-1 rounded-xl gap-1">
        <button
          onClick={() => setActiveSubMode('racks')}
          className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex-1 text-center ${
            activeSubMode === 'racks'
              ? 'bg-white text-brand-primary shadow-xs font-extrabold'
              : 'text-brand-secondary hover:text-brand-primary'
          }`}
        >
          Design Your Rack Collections
        </button>
        <button
          onClick={() => setActiveSubMode('basics')}
          className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex-1 text-center ${
            activeSubMode === 'basics'
              ? 'bg-white text-brand-primary shadow-xs font-extrabold'
              : 'text-brand-secondary hover:text-brand-primary'
          }`}
        >
          Build From Basics Good/Better/Best
        </button>
      </div>

      {/* Rack Collections Manager */}
      {activeSubMode === 'racks' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="flex items-center gap-4">
            <span className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Select Collection:</span>
            <select
              value={activeRackCategory}
              onChange={(e) => setActiveRackCategory(e.target.value)}
              className="bg-white border border-brand-border rounded-xl px-3 py-2 text-xs font-bold text-brand-primary focus:outline-none"
            >
              {Object.keys(racks).map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 text-amber-800 text-xs">
            <Info size={16} className="shrink-0 mt-0.5" />
            <p>
              Each theme/collection consists of exactly 6 pre-curated products to construct the "standard rack". Click <strong>Change</strong> to select a new product for any slot.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {['hat', 'shirt', 'polo', 'crewneck', 'hoodie', 'longsleeve'].map(slot => {
              const style = racks[activeRackCategory]?.[slot] || '';
              const p = getProductDetails(style) as any;
              const customName = customNames.racks?.[activeRackCategory]?.[slot] || '';
              
              return (
                <div key={slot} className="border border-brand-border rounded-2xl p-5 bg-neutral-50/50 flex flex-col justify-between gap-4">
                  <div className="space-y-3">
                    <div>
                      <span className="text-[10px] font-extrabold uppercase tracking-widest text-brand-secondary block mb-1">
                        {slot.replace('longsleeve', 'long sleeve')} Slot
                      </span>

                      {/* Image Preview */}
                      {p.style && (
                        <div className="w-full h-36 bg-white border border-brand-border/60 rounded-xl flex items-center justify-center p-2 mb-3 relative overflow-hidden bg-checkerboard">
                          <img 
                            src={getGarmentImage(p, defaultColors.racks?.[activeRackCategory]?.[slot])} 
                            alt={p.title} 
                            className="max-w-full max-h-full object-contain mix-blend-multiply" 
                          />
                        </div>
                      )}

                      <h4 className="text-sm font-bold text-brand-primary leading-snug">
                        {p.brand} {p.style}
                      </h4>
                      <p className="text-xs text-brand-secondary mt-1 font-medium truncate" title={customName || p.title}>
                        {customName || p.title}
                      </p>
                      <span className="text-xs text-brand-primary font-bold mt-2 inline-block">
                        ${p.price.toFixed(2)}
                      </span>
                    </div>

                    <div>
                      <label className="text-[9px] font-extrabold uppercase tracking-wider text-neutral-400 block mb-1">
                        Custom Display Name
                      </label>
                      <input
                        type="text"
                        value={customName}
                        placeholder={p.title}
                        onChange={(e) => {
                          const newName = e.target.value;
                          setCustomNames(prev => {
                            const racks = prev.racks || {};
                            const cat = racks[activeRackCategory] || {};
                            return {
                              ...prev,
                              racks: {
                                ...racks,
                                [activeRackCategory]: {
                                  ...cat,
                                  [slot]: newName
                                }
                              }
                            };
                          });
                        }}
                        className="w-full bg-white border border-brand-border rounded-xl px-3 py-1.5 text-xs text-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary transition-all placeholder:text-neutral-400 placeholder:italic"
                      />
                    </div>

                    {/* Default Color Selector */}
                    {p.colors && p.colors.length > 0 && (
                      <div>
                        <label className="text-[9px] font-extrabold uppercase tracking-wider text-neutral-400 block mb-1">
                          Default Display Color
                        </label>
                        <select
                          value={defaultColors.racks?.[activeRackCategory]?.[slot] || p.colors[0]}
                          onChange={(e) => {
                            const newColor = e.target.value;
                            setDefaultColors(prev => {
                              const racks = prev.racks || {};
                              const cat = racks[activeRackCategory] || {};
                              return {
                                ...prev,
                                racks: {
                                  ...racks,
                                  [activeRackCategory]: {
                                    ...cat,
                                    [slot]: newColor
                                  }
                                }
                              };
                            });
                          }}
                          className="w-full bg-white border border-brand-border rounded-xl px-3 py-1.5 text-xs font-bold text-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary transition-all"
                        >
                          {p.colors.map((col: string) => (
                            <option key={col} value={col}>{col}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => handleOpenSelector('racks', activeRackCategory, slot)}
                    className="w-full py-2 bg-white border border-brand-border text-brand-primary rounded-xl text-xs font-bold transition-all shadow-2xs hover:bg-neutral-50"
                  >
                    Change Product
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Build From Basics Manager */}
      {activeSubMode === 'basics' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="flex items-center gap-4">
            <span className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Select Basic Type:</span>
            <select
              value={activeBasicsCategory}
              onChange={(e) => setActiveBasicsCategory(e.target.value)}
              className="bg-white border border-brand-border rounded-xl px-3 py-2 text-xs font-bold text-brand-primary focus:outline-none"
            >
              {Object.keys(basics).map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 text-amber-800 text-xs">
            <Info size={16} className="shrink-0 mt-0.5" />
            <p>
              Basics require exactly three products for the Good, Better, and Best options to present to the user. Click <strong>Change</strong> to select a new product.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {['good', 'better', 'best'].map(slot => {
              const style = basics[activeBasicsCategory]?.[slot] || '';
              const p = getProductDetails(style) as any;
              const customName = customNames.basics?.[activeBasicsCategory]?.[slot] || '';

              return (
                <div key={slot} className="border border-brand-border rounded-2xl p-5 bg-neutral-50/50 flex flex-col justify-between gap-4">
                  <div className="space-y-3">
                    <div>
                      <span className={`text-[10px] font-extrabold uppercase tracking-widest block mb-1 ${
                        slot === 'good' ? 'text-neutral-500' : slot === 'better' ? 'text-blue-500' : 'text-emerald-500'
                      }`}>
                        {slot} Tier
                      </span>

                      {/* Image Preview */}
                      {p.style && (
                        <div className="w-full h-36 bg-white border border-brand-border/60 rounded-xl flex items-center justify-center p-2 mb-3 relative overflow-hidden bg-checkerboard">
                          <img 
                            src={getGarmentImage(p, defaultColors.basics?.[activeBasicsCategory]?.[slot])} 
                            alt={p.title} 
                            className="max-w-full max-h-full object-contain mix-blend-multiply" 
                          />
                        </div>
                      )}

                      <h4 className="text-sm font-bold text-brand-primary leading-snug">
                        {p.brand} {p.style}
                      </h4>
                      <p className="text-xs text-brand-secondary mt-1 font-medium truncate" title={customName || p.title}>
                        {customName || p.title}
                      </p>
                      <span className="text-xs text-brand-primary font-bold mt-2 inline-block">
                        ${p.price.toFixed(2)}
                      </span>
                    </div>

                    <div>
                      <label className="text-[9px] font-extrabold uppercase tracking-wider text-neutral-400 block mb-1">
                        Custom Display Name
                      </label>
                      <input
                        type="text"
                        value={customName}
                        placeholder={p.title}
                        onChange={(e) => {
                          const newName = e.target.value;
                          setCustomNames(prev => {
                            const basics = prev.basics || {};
                            const cat = basics[activeBasicsCategory] || {};
                            return {
                              ...prev,
                              basics: {
                                ...basics,
                                [activeBasicsCategory]: {
                                  ...cat,
                                  [slot]: newName
                                }
                              }
                            };
                          });
                        }}
                        className="w-full bg-white border border-brand-border rounded-xl px-3 py-1.5 text-xs text-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary transition-all placeholder:text-neutral-400 placeholder:italic"
                      />
                    </div>

                    {/* Default Color Selector */}
                    {p.colors && p.colors.length > 0 && (
                      <div>
                        <label className="text-[9px] font-extrabold uppercase tracking-wider text-neutral-400 block mb-1">
                          Default Display Color
                        </label>
                        <select
                          value={defaultColors.basics?.[activeBasicsCategory]?.[slot] || p.colors[0]}
                          onChange={(e) => {
                            const newColor = e.target.value;
                            setDefaultColors(prev => {
                              const basics = prev.basics || {};
                              const cat = basics[activeBasicsCategory] || {};
                              return {
                                ...prev,
                                basics: {
                                  ...basics,
                                  [activeBasicsCategory]: {
                                    ...cat,
                                    [slot]: newColor
                                  }
                                }
                              };
                            });
                          }}
                          className="w-full bg-white border border-brand-border rounded-xl px-3 py-1.5 text-xs font-bold text-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary transition-all"
                        >
                          {p.colors.map((col: string) => (
                            <option key={col} value={col}>{col}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => handleOpenSelector('basics', activeBasicsCategory, slot)}
                    className="w-full py-2 bg-white border border-brand-border text-brand-primary rounded-xl text-xs font-bold transition-all shadow-2xs hover:bg-neutral-50"
                  >
                    Change Product
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal Dialog for Selector */}
      {isModalOpen && activeSelectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white border border-brand-border rounded-2xl shadow-2xl max-w-2xl w-full p-6 space-y-6 overflow-hidden max-h-[85vh] flex flex-col">
            <div>
              <h3 className="text-lg font-serif text-brand-primary">
                Select Garment for {activeSelectTarget.category} ({activeSelectTarget.slot.toUpperCase()})
              </h3>
              <p className="text-xs text-brand-secondary mt-1">
                Select one of the 185 premium products from the catalog database.
              </p>
            </div>

            {/* Search */}
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search styles, brands, titles..."
                className="w-full bg-neutral-50 border border-brand-border rounded-xl pl-10 pr-4 py-2.5 text-xs text-brand-primary focus:outline-none"
              />
              <Search className="absolute left-3.5 top-3 text-neutral-400" size={15} />
            </div>

            {/* Product List */}
            <div className="flex-1 overflow-y-auto divide-y divide-brand-border/40 pr-1 max-h-[45vh] custom-scrollbar">
              {filteredProducts.length === 0 ? (
                <p className="text-xs text-brand-secondary text-center py-8">No matching garments found.</p>
              ) : (
                filteredProducts.map(p => (
                  <div
                    key={p.style}
                    onClick={() => handleSelectProduct(p.style)}
                    className="flex justify-between items-center py-3.5 px-2 hover:bg-neutral-50 rounded-lg cursor-pointer transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs bg-neutral-100 px-2 py-0.5 rounded font-bold uppercase">{p.style}</span>
                        <span className="text-xs font-bold text-brand-primary">{p.brand}</span>
                      </div>
                      <p className="text-[11px] text-brand-secondary mt-1 truncate max-w-lg">{p.title} - {p.category}</p>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <span className="text-xs font-bold text-brand-primary">${p.price.toFixed(2)}</span>
                      <div className="w-6 h-6 rounded-full bg-neutral-50 border border-brand-border flex items-center justify-center text-brand-secondary hover:bg-brand-primary hover:text-white transition-colors">
                        <Check size={12} />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-4 border-t border-brand-border">
              <PillButton variant="outline" onClick={() => setIsModalOpen(false)}>
                Cancel
              </PillButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
