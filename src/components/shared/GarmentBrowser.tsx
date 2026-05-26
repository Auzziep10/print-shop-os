import { useState, useMemo } from 'react';
import { X, Search, Check, DollarSign, Shirt } from 'lucide-react';
import sanmarCatalogJson from '../../data/sanmar-catalog.json';

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
  white: "#FFFFFF",
  black: "#1E1E1E",
  navy: "#1E2530",
  royal: "#224CB5",
  red: "#C7222B",
  blue: "#3B82F6",
  grey: "#9CA3AF",
  gray: "#9CA3AF",
  green: "#10B981",
  yellow: "#FBBF24",
  orange: "#F97316",
  purple: "#8B5CF6",
  pink: "#EC4899",
  brown: "#78350F",
  khaki: "#D97706",
  gold: "#D97706",
  silver: "#D1D5DB",
  loden: "#3F6212",
  cream: "#FEF3C7",
  sand: "#F59E0B",
  ash: "#E5E7EB",
  charcoal: "#4B5563",
  teal: "#14B8A6",
  aqua: "#06B6D4",
  olive: "#84CC16",
  maroon: "#7F1D1D",
  cardinal: "#991B1B",
  kelly: "#047857",
  mint: "#A7F3D0",
  lavender: "#E9D5FF",
  heather: "#D1D5DB",
  stone: "#78716C",
  tan: "#D97706",
  chocolate: "#451A03"
};

export function getSwatchColor(colorName: string): string {
  if (!colorName) return "#D1D5DB";
  const primaryPart = colorName.split('/')[0].trim().toLowerCase();
  for (const [key, hex] of Object.entries(baseColors)) {
    if (primaryPart.includes(key)) {
      return hex;
    }
  }
  return "#D1D5DB";
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
    <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4 sm:p-6 md:p-10">
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
                              const hex = getSwatchColor(color);
                              const swatchData = product.images[color];
                              const swatchImgUrl = swatchData && typeof swatchData === 'object' ? swatchData.swatch : '';
                              const isActive = currentPreviewColor === color;
                              const isWhite = color === 'White';
                              
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
                                    backgroundColor: hex,
                                    backgroundImage: swatchImgUrl ? `url(${swatchImgUrl})` : 'none',
                                    backgroundSize: 'cover',
                                    backgroundPosition: 'center',
                                    borderColor: isWhite ? '#D1D5DB' : 'transparent' 
                                  }}
                                >
                                  {isActive && (
                                    <span className="absolute inset-0 flex items-center justify-center">
                                      <Check 
                                        size={10} 
                                        className={color === 'White' || color === 'Silver' || color === 'Athletic Heather' ? 'text-black' : 'text-white'} 
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
