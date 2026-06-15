import { useState, useMemo } from 'react';
import { X, Search, Check, DollarSign, Shirt } from 'lucide-react';
import sanmarCatalogJson from '../../data/sanmar-catalog.json';
import colorHexMapJson from '../../data/color-hex-map.json';

const colorHexMap = colorHexMapJson as Record<string, string>;

interface SanMarProduct {
  style: string;
  title: string;
  brand: string;
  description: string;
  category: string;
  price: number;
  colors: string[];
  images: Record<string, { front: string; back: string; swatch: string } | string | undefined>;
}

const sanmarCatalog = sanmarCatalogJson as SanMarProduct[];

interface GarmentBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (product: SanMarProduct, initialColor: string) => void;
}

const baseColors: Record<string, string> = {
  // Whites / Light / Greys
  white: "#FFFFFF",
  snow: "#FBFBF9",
  bone: "#E3DAC9",
  cream: "#FFFDD0",
  alabaster: "#FAFAFA",
  marshmallow: "#F8F8F8",
  oatmeal: "#EAE6DF",
  cement: "#C5C6C6",
  ash: "#E5E7EB",
  silver: "#D1D5DB",
  heather: "#B0B5BC",
  athletic: "#B0B5BC",
  grey: "#808080",
  gray: "#808080",
  stone: "#8B8682",
  pebble: "#8F8E8A",
  graphite: "#3E424B",
  charcoal: "#36383E",
  carbon: "#2F3136",
  slate: "#708090",
  steel: "#7D848B",
  aluminum: "#A9ACB6",
  alumninum: "#A9ACB6",
  quarry: "#7A8187",
  smoke: "#8A95A5",

  // Blacks / Darks
  black: "#1A1A1A",
  dark: "#1A1A1A",
  onyx: "#0F0F0F",
  coal: "#2A2A2A",
  obsidian: "#121212",

  // Blues
  navy: "#0A1128",
  patriot: "#0D1B2A",
  royal: "#0F4C81",
  blue: "#1E3A8A",
  columbia: "#87B2DA",
  sky: "#87CEEB",
  carolina: "#799FCB",
  cyan: "#00FFFF",
  aqua: "#00FFFF",
  turquoise: "#30D5C8",
  teal: "#008080",
  ice: "#DDF2FD",
  denim: "#2F4F4F",
  indigo: "#4B0082",
  parcel: "#1E507F",

  // Reds / Pinks
  red: "#B91C1C",
  cardinal: "#800020",
  maroon: "#581845",
  crimson: "#990000",
  burgundy: "#800020",
  berry: "#8A1C14",
  plum: "#4D002B",
  cherry: "#D21F3C",
  flame: "#E2583E",
  rust: "#B7410E",
  pink: "#EC4899",
  rose: "#F43F5E",
  coral: "#FF7F50",
  peach: "#FFDAB9",
  apricot: "#FBCEB1",

  // Greens
  green: "#15803D",
  kelly: "#16A34A",
  emerald: "#047857",
  mint: "#A7F3D0",
  loden: "#3F6212",
  olive: "#556B2F",
  spruce: "#1E3F20",
  sage: "#9CAF88",
  hunter: "#355E3B",
  army: "#4B5320",
  forest: "#228B22",
  lime: "#84CC16",

  // Yellows / Golds / Oranges
  yellow: "#FACC15",
  gold: "#D97706",
  vegas: "#C5B358",
  amber: "#FFBF00",
  orange: "#F97316",
  tangerine: "#F28500",
  copper: "#B87333",
  bronze: "#CD7F32",
  mustard: "#FFDB58",

  // Purples
  purple: "#7C3AED",
  lavender: "#E9D5FF",
  violet: "#8F00FF",

  // Browns / Tans
  brown: "#451A03",
  chocolate: "#451A03",
  tan: "#D2B48C",
  khaki: "#C3B091",
  sand: "#C2B280",
  camel: "#C19A6B",
  biscuit: "#DEC49E",
  caramel: "#C68A4C",
  coffee: "#4B3621",
  mink: "#8A7F73",
  duck: "#966036"
};

function resolveSingleColor(part: string): string {
  const normalized = part.toLowerCase().trim();
  
  // 1. Try exact case-insensitive match in generated color-hex-map
  for (const [key, hex] of Object.entries(colorHexMap)) {
    if (key.toLowerCase() === normalized) {
      return hex;
    }
  }

  // 2. Try substring match in generated color-hex-map (e.g. if "biscuit" matches "biscuit/ true blue")
  for (const [key, hex] of Object.entries(colorHexMap)) {
    const keyLower = key.toLowerCase();
    if (keyLower.includes(normalized) || normalized.includes(keyLower)) {
      return hex;
    }
  }

  // 3. Fall back to baseColors exact match
  if (baseColors[normalized]) {
    return baseColors[normalized];
  }
  
  // 4. Fall back to baseColors multi-word and sub-matches
  for (const [key, hex] of Object.entries(baseColors)) {
    if (key.includes(' ') && normalized.includes(key)) {
      return hex;
    }
  }
  
  for (const [key, hex] of Object.entries(baseColors)) {
    if (!key.includes(' ') && normalized.includes(key)) {
      return hex;
    }
  }
  
  return "#D1D5DB";
}

export function getSwatchColor(colorName: string, returnGradient = false): string {
  if (!colorName) return "#D1D5DB";
  
  const parts = colorName.split('/').map(p => p.trim()).filter(Boolean);
  if (parts.length === 0) return "#D1D5DB";
  
  const colors = parts.map(resolveSingleColor);
  
  if (!returnGradient || colors.length === 1) {
    return colors[0];
  }
  
  if (colors.length === 2) {
    return `linear-gradient(135deg, ${colors[0]} 50%, ${colors[1]} 50%)`;
  }
  
  if (colors.length === 3) {
    return `linear-gradient(135deg, ${colors[0]} 33%, ${colors[1]} 33%, ${colors[1]} 66%, ${colors[2]} 66%)`;
  }
  
  return colors[0];
}

export function GarmentBrowser({ isOpen, onClose, onSelect }: GarmentBrowserProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('All');
  
  // Track the active preview color for each product style code
  const [productPreviewColors, setProductPreviewColors] = useState<Record<string, string>>({});

  // Get list of unique brands for filters
  const brands = useMemo(() => {
    const unique = new Set(sanmarCatalog.map(p => p.brand));
    return ['All', ...Array.from(unique)];
  }, []);

  // Filtered products list
  const filteredProducts = useMemo(() => {
    return sanmarCatalog.filter(p => {
      const matchesSearch = 
        p.style.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.brand.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesBrand = selectedBrand === 'All' || p.brand === selectedBrand;

      return matchesSearch && matchesBrand;
    });
  }, [searchQuery, selectedBrand]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[130] overflow-hidden flex items-center justify-center p-4 sm:p-6 md:p-10">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-neutral-900/60 backdrop-blur-sm transition-opacity duration-300 animate-in fade-in"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-5xl h-[85vh] md:h-[80vh] bg-white rounded-3xl shadow-2xl border border-brand-border flex flex-col overflow-hidden animate-in zoom-in-95 duration-300 z-10">
        
        {/* Header */}
        <div className="p-6 md:p-8 border-b border-brand-border flex items-center justify-between bg-white shrink-0">
          <div className="space-y-1">
            <h2 className="text-2xl font-serif text-brand-primary tracking-tight flex items-center gap-2">
              <Shirt className="text-brand-primary" size={24} />
              Browse Blanks Catalog
            </h2>
            <p className="text-xs text-brand-secondary">
              Explore premium apparel blanks, swap colors in real-time, and choose the perfect item.
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-2.5 rounded-full hover:bg-brand-bg text-brand-secondary hover:text-brand-primary transition-all focus:outline-none border border-transparent hover:border-brand-border"
          >
            <X size={20} />
          </button>
        </div>

        {/* Filters Panel */}
        <div className="px-6 py-4 md:px-8 bg-neutral-50 border-b border-brand-border flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center shrink-0">
          {/* Search bar */}
          <div className="relative flex-1 max-w-md">
            <input 
              type="text" 
              placeholder="Search style numbers, brands, descriptions..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-brand-border rounded-xl pl-10 pr-4 py-2.5 text-sm text-brand-primary focus:outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 placeholder:text-neutral-400 transition-all font-medium"
            />
            <Search className="absolute left-3.5 top-3.5 text-neutral-400" size={16} />
          </div>

          {/* Brand Tabs */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
            {brands.map(brand => (
              <button
                key={brand}
                onClick={() => setSelectedBrand(brand)}
                className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
                  selectedBrand === brand 
                    ? 'bg-brand-primary text-white border-brand-primary' 
                    : 'bg-white text-brand-secondary border-brand-border hover:bg-neutral-100 hover:text-brand-primary'
                }`}
              >
                {brand}
              </button>
            ))}
          </div>
        </div>

        {/* Catalog Grid */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-brand-bg/25">
          {filteredProducts.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-white border border-brand-border rounded-2xl">
              <div className="w-16 h-16 bg-neutral-50 text-neutral-400 rounded-full flex items-center justify-center border border-neutral-100 mb-4">
                <Shirt size={28} />
              </div>
              <h3 className="text-lg font-bold text-brand-primary">No Garments Found</h3>
              <p className="text-sm text-brand-secondary mt-1 max-w-xs leading-relaxed">
                We couldn't find any products matching "{searchQuery}". Try adjusting your keywords or filters.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
              {filteredProducts.map(product => {
                // Determine current preview color (defaults to first color available)
                const currentPreviewColor = productPreviewColors[product.style] || product.colors[0];
                const imageSet = product.images[currentPreviewColor] || Object.values(product.images)[0];
                const previewImgUrl = imageSet ? (typeof imageSet === 'string' ? imageSet : imageSet.front) : '';

                return (
                  <div 
                    key={product.style} 
                    className="bg-white border border-brand-border rounded-2xl overflow-hidden flex flex-col hover:shadow-[0_12px_32px_rgba(0,0,0,0.06)] hover:-translate-y-1 transition-all duration-300 group"
                  >
                    {/* Visual Preview */}
                    <div className="aspect-[4/5] bg-white border-b border-brand-border flex items-center justify-center p-6 relative overflow-hidden shrink-0 transition-colors">
                      {/* Price Badge */}
                      <div className="absolute top-4 left-4 z-10 bg-white/95 backdrop-blur-xs border border-brand-border text-brand-primary text-xs font-bold px-3 py-1 rounded-full flex items-center gap-0.5 shadow-sm">
                        <DollarSign size={11} />{product.price.toFixed(2)}
                      </div>

                      {/* Category Badge */}
                      <div className="absolute top-4 right-4 bg-white/85 backdrop-blur-xs border border-brand-border text-brand-secondary text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md">
                        {product.category}
                      </div>

                      {/* T-Shirt Render */}
                      <img 
                        src={previewImgUrl} 
                        alt={`${product.title} in ${currentPreviewColor}`}
                        className="max-w-[82%] max-h-[82%] object-contain filter drop-shadow-sm select-none pointer-events-none group-hover:scale-103 transition-transform duration-500"
                      />
                    </div>

                    {/* Meta info */}
                    <div className="p-5 flex-1 flex flex-col justify-between gap-4">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">{product.brand}</span>
                          <span className="text-[10px] bg-neutral-100 text-neutral-600 font-bold px-1.5 py-0.25 rounded-md uppercase">{product.style}</span>
                        </div>
                        <h4 className="text-base font-bold text-brand-primary leading-tight group-hover:text-brand-primary/95 transition-colors">
                          {product.title.replace(`${product.brand} `, '').replace(/®/g, '').trim()}
                        </h4>
                        <p className="text-xs text-brand-secondary line-clamp-2 leading-relaxed">
                          {product.description}
                        </p>
                      </div>

                      {/* Swatches & Select Button */}
                      <div className="space-y-4 pt-2 border-t border-brand-border/40">
                        {/* Swatches block */}
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-bold text-brand-secondary uppercase tracking-wider block">
                            Available Colors ({product.colors.length})
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {product.colors.slice(0, 8).map(color => {
                              const hex = getSwatchColor(color, true);
                              const isActive = currentPreviewColor === color;
                              const isWhite = color.toLowerCase() === 'white';
                              
                              return (
                                <button
                                  key={color}
                                  type="button"
                                  title={color}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setProductPreviewColors(prev => ({
                                      ...prev,
                                      [product.style]: color
                                    }));
                                  }}
                                  className={`w-5 h-5 rounded-full border transition-all relative ${
                                    isActive 
                                      ? 'ring-2 ring-brand-primary ring-offset-2 scale-110' 
                                      : 'border-neutral-300 hover:scale-105'
                                  }`}
                                  style={{ 
                                    backgroundColor: hex.startsWith('linear-gradient') ? 'transparent' : hex,
                                    backgroundImage: hex.startsWith('linear-gradient') ? hex : 'none',
                                    borderColor: isWhite ? '#D1D5DB' : 'transparent' 
                                  }}
                                >
                                  {isActive && (
                                    <span className="absolute inset-0 flex items-center justify-center">
                                      <Check 
                                        size={10} 
                                        className={color.toLowerCase() === 'white' || color.toLowerCase() === 'silver' || color.toLowerCase() === 'athletic heather' ? 'text-black' : 'text-white'} 
                                      />
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                            {product.colors.length > 8 && (
                              <span className="text-[10px] font-bold text-neutral-400 self-center pl-1 select-none">
                                +{product.colors.length - 8}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Select Button */}
                        <button
                          type="button"
                          onClick={() => onSelect(product, currentPreviewColor)}
                          className="w-full py-3 bg-brand-primary hover:bg-brand-primary/95 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-xs"
                        >
                          Select {product.style} in {currentPreviewColor}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
