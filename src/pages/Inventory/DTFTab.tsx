import { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, onSnapshot, setDoc, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { 
  Plus, 
  Minus, 
  Trash2, 
  Edit2, 
  Search, 
  AlertTriangle, 
  CheckCircle2, 
  MapPin, 
  DollarSign, 
  X, 
  Save, 
  Package,
  TrendingDown
} from 'lucide-react';

interface DTFSupply {
  id: string;
  name: string;
  category: 'Inks' | 'Films' | 'Powders' | 'Maintenance';
  quantity: number;
  unit: string;
  reorderPoint: number;
  cost: number;
  location: string;
  supplier: string;
  notes?: string;
  lastUpdated?: number;
}

const SEED_DTF_SUPPLIES: DTFSupply[] = [
  {
    id: 'dtf_ink_cyan',
    name: 'DTF Ink - Cyan (Premium)',
    category: 'Inks',
    quantity: 4,
    unit: 'Bottles (1L)',
    reorderPoint: 2,
    cost: 45.00,
    location: 'Aisle 3 - Shelf A',
    supplier: 'Wovn Supply',
    notes: 'Premium high-density cyan ink for DTF printing.',
    lastUpdated: Date.now()
  },
  {
    id: 'dtf_ink_magenta',
    name: 'DTF Ink - Magenta (Premium)',
    category: 'Inks',
    quantity: 4,
    unit: 'Bottles (1L)',
    reorderPoint: 2,
    cost: 45.00,
    location: 'Aisle 3 - Shelf A',
    supplier: 'Wovn Supply',
    notes: 'Premium high-density magenta ink for DTF printing.',
    lastUpdated: Date.now()
  },
  {
    id: 'dtf_ink_yellow',
    name: 'DTF Ink - Yellow (Premium)',
    category: 'Inks',
    quantity: 5,
    unit: 'Bottles (1L)',
    reorderPoint: 2,
    cost: 45.00,
    location: 'Aisle 3 - Shelf A',
    supplier: 'Wovn Supply',
    notes: 'Premium high-density yellow ink for DTF printing.',
    lastUpdated: Date.now()
  },
  {
    id: 'dtf_ink_black',
    name: 'DTF Ink - Black (Premium)',
    category: 'Inks',
    quantity: 6,
    unit: 'Bottles (1L)',
    reorderPoint: 2,
    cost: 45.00,
    location: 'Aisle 3 - Shelf A',
    supplier: 'Wovn Supply',
    notes: 'Premium high-density black ink for DTF printing.',
    lastUpdated: Date.now()
  },
  {
    id: 'dtf_ink_white',
    name: 'DTF Ink - Ultra-White (High Opacity)',
    category: 'Inks',
    quantity: 2,
    unit: 'Bottles (1L)',
    reorderPoint: 5,
    cost: 55.00,
    location: 'Aisle 3 - Shelf A',
    supplier: 'Wovn Supply',
    notes: 'High opacity white ink. Requires daily agitation.',
    lastUpdated: Date.now()
  },
  {
    id: 'dtf_film_roll_24',
    name: 'DTF Transfer Film - 24" Roll',
    category: 'Films',
    quantity: 8,
    unit: 'Rolls (100m)',
    reorderPoint: 3,
    cost: 89.00,
    location: 'Aisle 3 - Cabinet B',
    supplier: 'Wovn Supply',
    notes: 'Dual matte cold-peel film rolls, 60cm width.',
    lastUpdated: Date.now()
  },
  {
    id: 'dtf_powder_white',
    name: 'DTF Premium TPU Powder - White',
    category: 'Powders',
    quantity: 10,
    unit: 'Bags (1kg)',
    reorderPoint: 4,
    cost: 25.00,
    location: 'Aisle 3 - Cabinet C',
    supplier: 'Wovn Supply',
    notes: 'Medium grit TPU adhesive powder for standard garments.',
    lastUpdated: Date.now()
  },
  {
    id: 'dtf_cleaning_sol',
    name: 'Printhead Cleaning Solution',
    category: 'Maintenance',
    quantity: 3,
    unit: 'Bottles (500ml)',
    reorderPoint: 2,
    cost: 18.00,
    location: 'Aisle 3 - Shelf D',
    supplier: 'Wovn Supply',
    notes: 'Cleaning solution for flushing lines and wet-capping.',
    lastUpdated: Date.now()
  },
  {
    id: 'dtf_cleaning_swabs',
    name: 'DTF Printhead Cleaning Swabs',
    category: 'Maintenance',
    quantity: 150,
    unit: 'Pieces',
    reorderPoint: 50,
    cost: 0.15,
    location: 'Aisle 3 - Shelf D',
    supplier: 'Wovn Supply',
    notes: 'Lint-free foam cleaning swabs for printhead maintenance.',
    lastUpdated: Date.now()
  }
];

export function DTFTab() {
  const [supplies, setSupplies] = useState<DTFSupply[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [stockStatusFilter, setStockStatusFilter] = useState<string>('All');
  
  // Modals state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<DTFSupply | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    category: 'Inks' as DTFSupply['category'],
    quantity: 0,
    unit: '',
    reorderPoint: 0,
    cost: 0,
    location: '',
    supplier: '',
    notes: ''
  });

  // Load DTF supplies from Firestore with onSnapshot
  useEffect(() => {
    const q = query(collection(db, 'dtfSupplies'));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      if (snapshot.empty) {
        // Seed database if empty
        try {
          for (const item of SEED_DTF_SUPPLIES) {
            await setDoc(doc(db, 'dtfSupplies', item.id), item);
          }
        } catch (err) {
          console.error("Failed to seed DTF supplies:", err);
        }
      } else {
        const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as DTFSupply));
        setSupplies(data);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleOpenCreateModal = () => {
    setEditingItem(null);
    setFormData({
      name: '',
      category: 'Inks',
      quantity: 0,
      unit: '',
      reorderPoint: 0,
      cost: 0,
      location: '',
      supplier: '',
      notes: ''
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (item: DTFSupply) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      category: item.category,
      quantity: item.quantity,
      unit: item.unit,
      reorderPoint: item.reorderPoint,
      cost: item.cost,
      location: item.location,
      supplier: item.supplier,
      notes: item.notes || ''
    });
    setIsModalOpen(true);
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return alert('Item Name is required');

    const id = editingItem ? editingItem.id : `dtf_${Date.now()}`;
    const payload: Partial<DTFSupply> = {
      name: formData.name.trim(),
      category: formData.category,
      quantity: Math.max(0, formData.quantity),
      unit: formData.unit.trim() || 'Units',
      reorderPoint: Math.max(0, formData.reorderPoint),
      cost: Math.max(0, formData.cost),
      location: formData.location.trim(),
      supplier: formData.supplier.trim(),
      notes: formData.notes.trim(),
      lastUpdated: Date.now()
    };

    try {
      await setDoc(doc(db, 'dtfSupplies', id), payload, { merge: true });
      setIsModalOpen(false);
    } catch (err) {
      console.error("Error saving DTF item:", err);
      alert("Failed to save item.");
    }
  };

  const handleDeleteItem = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to permanently delete "${name}"?`)) return;
    try {
      await deleteDoc(doc(db, 'dtfSupplies', id));
    } catch (err) {
      console.error("Error deleting DTF item:", err);
      alert("Failed to delete item.");
    }
  };

  const handleAdjustQuantity = async (item: DTFSupply, delta: number) => {
    const nextQty = Math.max(0, item.quantity + delta);
    try {
      await updateDoc(doc(db, 'dtfSupplies', item.id), {
        quantity: nextQty,
        lastUpdated: Date.now()
      });
    } catch (err) {
      console.error("Error updating quantity:", err);
    }
  };

  // Filter supplies
  const filteredSupplies = supplies.filter(item => {
    const matchesSearch = 
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.supplier.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;

    const isLowStock = item.quantity <= item.reorderPoint && item.quantity > 0;
    const isOutOfStock = item.quantity === 0;

    const matchesStatus = 
      stockStatusFilter === 'All' ||
      (stockStatusFilter === 'Low Stock' && isLowStock) ||
      (stockStatusFilter === 'Out of Stock' && isOutOfStock) ||
      (stockStatusFilter === 'In Stock' && item.quantity > item.reorderPoint);

    return matchesSearch && matchesCategory && matchesStatus;
  });

  // Calculate stats
  const totalItems = supplies.length;
  const lowStockCount = supplies.filter(i => i.quantity <= i.reorderPoint && i.quantity > 0).length;
  const outOfStockCount = supplies.filter(i => i.quantity === 0).length;
  const totalValuation = supplies.reduce((acc, curr) => acc + (curr.quantity * curr.cost), 0);

  // Helper to get visual ink colors
  const getInkVisualStyles = (name: string) => {
    const lowercaseName = name.toLowerCase();
    if (lowercaseName.includes('cyan')) return { border: 'border-cyan-200', bg: 'bg-cyan-50', dot: 'bg-cyan-500' };
    if (lowercaseName.includes('magenta')) return { border: 'border-pink-200', bg: 'bg-pink-50', dot: 'bg-pink-500' };
    if (lowercaseName.includes('yellow')) return { border: 'border-yellow-200', bg: 'bg-yellow-50', dot: 'bg-yellow-500' };
    if (lowercaseName.includes('white')) return { border: 'border-neutral-200', bg: 'bg-neutral-50', dot: 'bg-neutral-300 ring-1 ring-neutral-400' };
    if (lowercaseName.includes('black')) return { border: 'border-neutral-800', bg: 'bg-neutral-900 text-white', dot: 'bg-neutral-900 ring-1 ring-white/20' };
    return { border: 'border-brand-border', bg: 'bg-brand-bg/30', dot: 'bg-brand-primary' };
  };

  return (
    <div className="w-full h-full flex flex-col gap-6">
      
      {/* Metric Cards Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
        <div className="bg-white rounded-2xl border border-brand-border p-5 flex items-center justify-between shadow-[0_2px_10px_-4px_rgba(0,0,0,0.02)] transition-all hover:shadow-md">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary block mb-1">Total Supplies</span>
            <span className="text-3xl font-black text-brand-primary font-sans">{totalItems}</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-brand-bg/50 border border-brand-border flex items-center justify-center text-brand-secondary">
            <Package size={22} className="stroke-1.5" />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-brand-border p-5 flex items-center justify-between shadow-[0_2px_10px_-4px_rgba(0,0,0,0.02)] transition-all hover:shadow-md">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-amber-600 block mb-1">Low Stock Alerts</span>
            <span className={`text-3xl font-black font-sans ${lowStockCount > 0 ? 'text-amber-500' : 'text-brand-primary'}`}>
              {lowStockCount}
            </span>
          </div>
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${lowStockCount > 0 ? 'bg-amber-50 border-amber-200 text-amber-500' : 'bg-brand-bg/50 border-brand-border text-brand-secondary'}`}>
            <TrendingDown size={22} className="stroke-1.5" />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-brand-border p-5 flex items-center justify-between shadow-[0_2px_10px_-4px_rgba(0,0,0,0.02)] transition-all hover:shadow-md">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-red-600 block mb-1">Out of Stock</span>
            <span className={`text-3xl font-black font-sans ${outOfStockCount > 0 ? 'text-red-500' : 'text-brand-primary'}`}>
              {outOfStockCount}
            </span>
          </div>
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${outOfStockCount > 0 ? 'bg-red-50 border-red-200 text-red-500' : 'bg-brand-bg/50 border-brand-border text-brand-secondary'}`}>
            <AlertTriangle size={22} className="stroke-1.5" />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-brand-border p-5 flex items-center justify-between shadow-[0_2px_10px_-4px_rgba(0,0,0,0.02)] transition-all hover:shadow-md">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary block mb-1">Total Valuation</span>
            <span className="text-3xl font-black text-brand-primary font-sans">
              ${totalValuation.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-brand-bg/50 border border-brand-border flex items-center justify-center text-brand-secondary">
            <DollarSign size={22} className="stroke-1.5" />
          </div>
        </div>
      </div>

      {/* Main Filter & Action Bar */}
      <div className="bg-white border border-brand-border rounded-2xl p-4 flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between shadow-sm">
        
        {/* Category Pills & Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {['All', 'Inks', 'Films', 'Powders', 'Maintenance'].map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${
                selectedCategory === cat
                  ? 'bg-black text-white shadow-sm'
                  : 'bg-brand-bg hover:bg-brand-border/40 text-brand-secondary hover:text-brand-primary'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Search, Filter, and Create Actions */}
        <div className="flex flex-wrap items-center gap-3">
          
          {/* Stock Alert Dropdown */}
          <select
            value={stockStatusFilter}
            onChange={(e) => setStockStatusFilter(e.target.value)}
            className="bg-brand-bg border border-brand-border text-brand-primary font-bold text-[10px] uppercase tracking-wider rounded-lg px-3 py-2.5 outline-none focus:border-brand-primary cursor-pointer transition-colors shadow-inner"
          >
            <option value="All">All Stock Levels</option>
            <option value="In Stock">In Stock</option>
            <option value="Low Stock">Low Stock Alert</option>
            <option value="Out of Stock">Out of Stock</option>
          </select>

          {/* Search Input */}
          <div className="relative max-w-xs w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-secondary" size={14} />
            <input
              type="text"
              placeholder="Search supply, shelf..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-brand-bg border border-brand-border rounded-lg pl-9 pr-3 py-2 text-xs font-medium focus:outline-brand-primary shadow-inner placeholder:text-brand-secondary"
            />
          </div>

          {/* Create Button */}
          <button
            onClick={handleOpenCreateModal}
            className="bg-brand-primary text-white px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest shadow-sm hover:scale-[1.02] transition-transform flex items-center gap-1.5"
          >
            <Plus size={14} /> Add Supply
          </button>
        </div>
      </div>

      {/* Supplies Grid Card View */}
      <div className="flex-1 overflow-y-auto pr-1 pb-6 custom-scrollbar min-h-[400px]">
        {filteredSupplies.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-center bg-white border border-brand-border rounded-2xl p-8 shadow-sm">
            <Package size={40} className="text-brand-secondary opacity-30 mb-3 stroke-1.5" />
            <p className="font-serif text-lg font-bold text-brand-primary">No Supplies Found</p>
            <p className="text-xs text-brand-secondary mt-1">Try resetting your category/status filters or adjust your search.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredSupplies.map((item) => {
              const inkStyle = item.category === 'Inks' ? getInkVisualStyles(item.name) : null;
              const isLow = item.quantity <= item.reorderPoint && item.quantity > 0;
              const isOut = item.quantity === 0;
              const maxRatio = item.reorderPoint > 0 ? Math.min(100, (item.quantity / (item.reorderPoint * 2)) * 100) : 100;

              return (
                <div
                  key={item.id}
                  className={`bg-white rounded-card border transition-all duration-300 flex flex-col justify-between shadow-[0_2px_12px_-4px_rgba(0,0,0,0.03)] hover:shadow-lg hover:-translate-y-0.5 ${
                    isOut 
                      ? 'border-red-200 bg-red-50/5' 
                      : isLow 
                      ? 'border-amber-200 bg-amber-50/5' 
                      : 'border-brand-border'
                  }`}
                >
                  {/* Card Header */}
                  <div className="p-5 flex-1 flex flex-col">
                    <div className="flex justify-between items-start mb-3 w-full gap-2">
                      {/* Category Badge */}
                      <span className={`px-2 py-0.5 rounded text-[8px] font-extrabold uppercase tracking-widest ${
                        item.category === 'Inks'
                          ? 'bg-blue-50 border border-blue-200 text-blue-700'
                          : item.category === 'Films'
                          ? 'bg-purple-50 border border-purple-200 text-purple-700'
                          : item.category === 'Powders'
                          ? 'bg-amber-50 border border-amber-200 text-amber-700'
                          : 'bg-neutral-50 border border-brand-border/60 text-brand-secondary'
                      }`}>
                        {item.category}
                      </span>

                      {/* Stock Alert Badge */}
                      {isOut ? (
                        <span className="flex items-center gap-1 text-[9px] font-black uppercase text-red-600 px-1.5 py-0.5 bg-red-50 rounded border border-red-100">
                          <AlertTriangle size={10} /> Out of Stock
                        </span>
                      ) : isLow ? (
                        <span className="flex items-center gap-1 text-[9px] font-black uppercase text-amber-700 px-1.5 py-0.5 bg-amber-50 rounded border border-amber-100">
                          <AlertTriangle size={10} /> Low Stock
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[9px] font-black uppercase text-green-700 px-1.5 py-0.5 bg-green-50 rounded border border-green-100">
                          <CheckCircle2 size={10} /> Healthy Stock
                        </span>
                      )}
                    </div>

                    {/* Supply Name */}
                    <div className="flex items-start gap-2.5 mb-2">
                      {inkStyle && (
                        <div className={`w-3.5 h-3.5 rounded-full shrink-0 mt-0.5 ${inkStyle.dot}`} />
                      )}
                      <h3 className="font-serif text-lg font-bold text-brand-primary leading-tight line-clamp-2" title={item.name}>
                        {item.name}
                      </h3>
                    </div>

                    {/* Notes / Details */}
                    {item.notes && (
                      <p className="text-[11px] text-brand-secondary line-clamp-2 mt-1 mb-3 opacity-90 leading-relaxed font-sans">
                        {item.notes}
                      </p>
                    )}

                    {/* Stock Level Visual Progress Bar */}
                    <div className="mt-auto pt-3">
                      <div className="flex justify-between items-center text-[9px] font-bold uppercase tracking-wider text-brand-secondary mb-1">
                        <span>Stock Level</span>
                        <span>{item.quantity} / {item.reorderPoint} Reorder</span>
                      </div>
                      <div className="w-full bg-neutral-100 h-1.5 rounded-full overflow-hidden border border-brand-border/40">
                        <div 
                          className={`h-full rounded-full transition-all duration-500 ${
                            isOut 
                              ? 'bg-red-500' 
                              : isLow 
                              ? 'bg-amber-500' 
                              : 'bg-green-500'
                          }`}
                          style={{ width: `${maxRatio}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Card Metadata Details Grid */}
                  <div className="px-5 py-4 border-t border-brand-border/50 bg-neutral-50/50 grid grid-cols-2 gap-y-3 gap-x-2 text-xs font-semibold">
                    <div className="flex flex-col">
                      <span className="text-[8px] uppercase tracking-widest text-brand-secondary font-bold mb-0.5">Location</span>
                      <span className="text-brand-primary flex items-center gap-1 truncate" title={item.location}>
                        <MapPin size={11} className="text-brand-secondary/60 shrink-0" />
                        {item.location || 'Not Specified'}
                      </span>
                    </div>

                    <div className="flex flex-col">
                      <span className="text-[8px] uppercase tracking-widest text-brand-secondary font-bold mb-0.5">Supplier</span>
                      <span className="text-brand-primary truncate" title={item.supplier}>
                        {item.supplier || 'Not Specified'}
                      </span>
                    </div>

                    <div className="flex flex-col">
                      <span className="text-[8px] uppercase tracking-widest text-brand-secondary font-bold mb-0.5">Unit Cost</span>
                      <span className="text-brand-primary">
                        ${item.cost.toFixed(2)} <span className="text-[9px] font-bold text-brand-secondary/70">/ {item.unit.replace(/Rolls|Bottles|Bags|Pieces/i, '').trim() || 'Unit'}</span>
                      </span>
                    </div>

                    <div className="flex flex-col">
                      <span className="text-[8px] uppercase tracking-widest text-brand-secondary font-bold mb-0.5">Inventory Value</span>
                      <span className="text-brand-primary font-bold">
                        ${(item.quantity * item.cost).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>

                  {/* Card Actions Bottom Row */}
                  <div className="p-4 border-t border-brand-border bg-white rounded-b-card flex items-center justify-between gap-3">
                    
                    {/* Edit/Delete Actions */}
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleOpenEditModal(item)}
                        className="p-2 text-brand-secondary hover:text-brand-primary hover:bg-neutral-100 rounded-lg transition-colors"
                        title="Edit Item Details"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        onClick={() => handleDeleteItem(item.id, item.name)}
                        className="p-2 text-brand-secondary hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete Item"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    {/* Stock Quick Adjustment Actions */}
                    <div className="flex items-center bg-brand-bg border border-brand-border rounded-lg shadow-sm overflow-hidden pr-1.5 py-0.5">
                      <button
                        disabled={item.quantity === 0}
                        onClick={() => handleAdjustQuantity(item, -1)}
                        className="px-3.5 py-1 text-brand-secondary hover:text-brand-primary disabled:opacity-30 disabled:cursor-not-allowed hover:bg-brand-border/20 rounded-md transition-colors"
                        title="Decrement Stock"
                      >
                        <Minus size={11} strokeWidth={2.5} />
                      </button>
                      
                      {/* Render quantity inside with styled display */}
                      <div className="min-w-[42px] text-center">
                        <span className="text-sm font-black text-brand-primary block leading-none font-mono">
                          {item.quantity}
                        </span>
                        <span className="text-[8px] text-brand-secondary font-bold uppercase tracking-wider block mt-0.5 leading-none">
                          {item.unit.split(' ')[0]}
                        </span>
                      </div>

                      <button
                        onClick={() => handleAdjustQuantity(item, 1)}
                        className="px-3.5 py-1 text-brand-secondary hover:text-brand-primary hover:bg-brand-border/20 rounded-md transition-colors"
                        title="Increment Stock"
                      >
                        <Plus size={11} strokeWidth={2.5} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create / Edit Modal Dialog */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-card border border-brand-border shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="p-6 border-b border-brand-border bg-neutral-50 flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-serif text-xl font-bold text-brand-primary leading-tight">
                  {editingItem ? 'Edit DTF Supply Item' : 'Add New DTF Supply'}
                </h3>
                <p className="text-[9px] uppercase tracking-widest font-bold text-brand-secondary mt-1">
                  {editingItem ? `ITEM ID: ${editingItem.id}` : 'Create a new item in the supplies inventory'}
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-brand-secondary hover:text-black hover:bg-black/5 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Scrollable Form */}
            <form onSubmit={handleSaveItem} className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
              
              {/* Item Name */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1.5 block">
                  Supply Item Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. DTF Ink - Cyan (Premium)"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-3 text-sm font-semibold focus:outline-brand-primary"
                />
              </div>

              {/* Category & Supplier Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1.5 block">
                    Category
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value as DTFSupply['category'] })}
                    className="w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-3 text-sm font-semibold focus:outline-brand-primary cursor-pointer"
                  >
                    <option value="Inks">Inks</option>
                    <option value="Films">Films</option>
                    <option value="Powders">Powders</option>
                    <option value="Maintenance">Maintenance</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1.5 block">
                    Supplier
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Wovn Supply"
                    value={formData.supplier}
                    onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                    className="w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-3 text-sm font-semibold focus:outline-brand-primary"
                  />
                </div>
              </div>

              {/* Stock Levels & Unit Grid */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1.5 block">
                    Initial Quantity
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    placeholder="0"
                    value={formData.quantity || ''}
                    onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })}
                    className="w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-3 text-sm font-semibold focus:outline-brand-primary text-center"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1.5 block">
                    Unit of Measure
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Bottles (1L)"
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    className="w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-3 text-sm font-semibold focus:outline-brand-primary text-center"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1.5 block">
                    Reorder Threshold
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    placeholder="2"
                    value={formData.reorderPoint || ''}
                    onChange={(e) => setFormData({ ...formData, reorderPoint: parseInt(e.target.value) || 0 })}
                    className="w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-3 text-sm font-semibold focus:outline-brand-primary text-center"
                  />
                </div>
              </div>

              {/* Cost & Location Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1.5 block">
                    Unit Cost ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    placeholder="45.00"
                    value={formData.cost || ''}
                    onChange={(e) => setFormData({ ...formData, cost: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-3 text-sm font-semibold focus:outline-brand-primary"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1.5 block">
                    Storage Location
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Aisle 3 - Shelf A"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    className="w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-3 text-sm font-semibold focus:outline-brand-primary"
                  />
                </div>
              </div>

              {/* Description Notes */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1.5 block">
                  Description / Notes
                </label>
                <textarea
                  rows={3}
                  placeholder="Add details, compatibility specs, or instructions..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-3 text-sm font-medium focus:outline-brand-primary resize-none"
                />
              </div>

              {/* Modal Actions */}
              <div className="pt-4 flex gap-2 border-t border-brand-border/50 shrink-0 bg-white">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 bg-brand-bg border border-brand-border text-brand-secondary py-3 rounded-lg font-bold uppercase tracking-widest text-xs hover:bg-neutral-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-brand-primary text-white py-3 rounded-lg font-bold uppercase tracking-widest text-xs hover:bg-black transition-all shadow-sm flex items-center justify-center gap-1.5"
                >
                  <Save size={14} /> Save Supply
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
