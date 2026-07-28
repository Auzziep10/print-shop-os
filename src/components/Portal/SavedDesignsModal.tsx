import { useState, useEffect, useMemo } from 'react';
import { X, Search, Trash2, Shirt, Calendar, Sparkles, Loader2, Plus, ZoomIn } from 'lucide-react';
import { getSavedDesigns, deleteSavedDesign, type SavedDesignItem } from '../../lib/savedDesignsUtils';
import { PillButton } from '../ui/PillButton';

interface SavedDesignsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectDesign: (design: SavedDesignItem) => void;
  customerId: string;
}

export function SavedDesignsModal({
  isOpen,
  onClose,
  onSelectDesign,
  customerId
}: SavedDesignsModalProps) {
  const [designs, setDesigns] = useState<SavedDesignItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedImage, setExpandedImage] = useState<{ src: string; alt: string } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const load = async () => {
      setIsLoading(true);
      const list = await getSavedDesigns(customerId || 'CUS-001');
      setDesigns(list);
      setIsLoading(false);
    };
    load();
  }, [isOpen, customerId]);

  const filteredDesigns = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return designs;
    return designs.filter(d => {
      const g = d.garment || {};
      return (
        d.designName.toLowerCase().includes(q) ||
        (g.style || '').toLowerCase().includes(q) ||
        (g.brand || '').toLowerCase().includes(q) ||
        (g.title || '').toLowerCase().includes(q) ||
        (g.selectedColor || '').toLowerCase().includes(q)
      );
    });
  }, [designs, searchQuery]);

  const handleDelete = async (e: React.MouseEvent, designId: string) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this saved design?")) return;
    setDeletingId(designId);
    const success = await deleteSavedDesign(customerId || 'CUS-001', designId);
    if (success) {
      setDesigns(prev => prev.filter(d => d.id !== designId));
    }
    setDeletingId(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-4xl w-full p-6 sm:p-8 shadow-2xl border border-neutral-200 my-8 animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-100 pb-4 mb-6 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles size={22} className="text-amber-500" />
              <h2 className="text-xl font-serif font-bold text-neutral-900">My Saved Designs</h2>
            </div>
            <p className="text-xs text-neutral-500 mt-1">
              Select any previously designed garment to quickly add it to your order without re-customizing.
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

        {/* Search */}
        <div className="relative mb-6 shrink-0">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search saved designs by name, garment style, brand, or color..."
            className="w-full bg-neutral-50 border border-neutral-200 rounded-xl pl-10 pr-4 py-2.5 text-xs text-neutral-900 focus:outline-none focus:ring-1 focus:ring-black"
          />
          <Search className="absolute left-3.5 top-3 text-neutral-400" size={15} />
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 text-neutral-400 gap-2">
              <Loader2 className="animate-spin" size={24} />
              <p className="text-xs font-semibold">Loading your saved designs...</p>
            </div>
          ) : filteredDesigns.length === 0 ? (
            <div className="text-center py-16 bg-neutral-50/60 rounded-2xl border border-dashed border-neutral-200 p-8 space-y-3">
              <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
                <Shirt size={24} />
              </div>
              <h3 className="text-sm font-bold text-neutral-800">
                {searchQuery ? `No designs match "${searchQuery}"` : 'No Saved Designs Yet'}
              </h3>
              <p className="text-xs text-neutral-500 max-w-md mx-auto">
                When you customize a garment in the Customizer, click <strong>"Save to Saved Designs"</strong> to store it here for easy 1-click re-ordering anytime!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {filteredDesigns.map(item => {
                const g = item.garment || {};
                const mockupImg = g.image || g.customizedFrontImage || g.originalFrontImage || 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&q=80&w=300&h=300';
                
                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      onSelectDesign(item);
                      onClose();
                    }}
                    className="group bg-white border border-neutral-200 hover:border-black rounded-2xl p-4 flex flex-col justify-between transition-all hover:shadow-lg cursor-pointer relative overflow-hidden"
                  >
                    <div>
                      {/* Image Preview */}
                      <div 
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedImage({ src: mockupImg, alt: item.designName });
                        }}
                        className="w-full h-44 bg-neutral-50 rounded-xl overflow-hidden mb-3 relative flex items-center justify-center p-2 cursor-zoom-in group/img"
                        title="Click to enlarge design mockup"
                      >
                        <img
                          src={mockupImg}
                          alt={item.designName}
                          className="max-h-full max-w-full object-contain group-hover/img:scale-105 transition-transform duration-300"
                        />
                        <span className="absolute top-2 left-2 bg-black/80 backdrop-blur-xs text-white text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider z-10">
                          {g.selectedColor || 'Custom'}
                        </span>
                        <div className="absolute inset-0 bg-black/10 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                          <span className="bg-white/95 text-neutral-900 p-2 rounded-full shadow-md">
                            <ZoomIn size={16} />
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => handleDelete(e, item.id)}
                          disabled={deletingId === item.id}
                          className="absolute top-2 right-2 p-1.5 bg-white/90 hover:bg-red-50 text-neutral-400 hover:text-red-600 rounded-full shadow-sm transition-colors z-20"
                          title="Delete saved design"
                        >
                          {deletingId === item.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                        </button>
                      </div>

                      {/* Info */}
                      <h4 className="font-bold text-xs text-neutral-900 group-hover:text-black line-clamp-1">
                        {item.designName}
                      </h4>
                      <p className="text-[11px] text-neutral-500 font-medium mt-0.5 truncate">
                        {g.brand} {g.style} — {g.title?.replace(`${g.brand} `, '')}
                      </p>

                      <div className="flex items-center gap-2 mt-2 text-[10px] text-neutral-400 font-semibold">
                        <Calendar size={11} />
                        <span>Saved {new Date(item.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>

                    {/* Action Button */}
                    <button
                      type="button"
                      onClick={() => {
                        onSelectDesign(item);
                        onClose();
                      }}
                      className="mt-4 w-full py-2 bg-neutral-900 hover:bg-black text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer"
                    >
                      <Plus size={13} />
                      <span>Use This Design</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-neutral-100 pt-4 mt-4 shrink-0">
          <span className="text-xs text-neutral-500 font-medium">
            {filteredDesigns.length} saved design{filteredDesigns.length === 1 ? '' : 's'} total
          </span>
          <PillButton variant="outline" onClick={onClose}>
            Close
          </PillButton>
        </div>
      </div>

      {expandedImage && (
        <div 
          className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[99999] flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setExpandedImage(null)}
        >
          <div 
            className="relative max-w-3xl max-h-[85vh] w-full bg-white rounded-[2rem] p-6 md:p-10 shadow-2xl overflow-hidden flex items-center justify-center border border-neutral-200/50 cursor-crosshair"
            onClick={(e) => e.stopPropagation()}
            onMouseMove={(e) => {
              const { left, top, width, height } = e.currentTarget.getBoundingClientRect();
              const x = (e.clientX - left) / width;
              const y = (e.clientY - top) / height;
              const img = e.currentTarget.querySelector('img');
              if (img) img.style.transformOrigin = `${x * 100}% ${y * 100}%`;
            }}
            title="Hover to zoom"
          >
            <button 
              onClick={() => setExpandedImage(null)}
              className="absolute top-6 right-6 w-10 h-10 rounded-full bg-white/90 hover:bg-white text-neutral-800 hover:text-black flex items-center justify-center shadow-lg transition-all z-50 cursor-pointer border border-neutral-100 hover:scale-105"
            >
              <X size={20} />
            </button>
            <img 
              src={expandedImage.src} 
              alt={expandedImage.alt} 
              style={{ width: 'auto', height: 'auto', maxWidth: '100%', maxHeight: '70vh' }}
              className="rounded-2xl select-none transition-transform duration-200 ease-out hover:scale-[2]" 
            />
          </div>
        </div>
      )}
    </div>
  );
}
