import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'react-qr-code';
import { db, storage } from '../../lib/firebase';
import { collection, query, onSnapshot, setDoc, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { Search, Plus, Image as ImageIcon, ChevronLeft, Trash2, Save, X, Upload, QrCode, Loader2, Boxes, Map, Printer } from 'lucide-react';
import { tokens } from '../../lib/tokens';

const SIZES = ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', 'OSFA'];

const BOX_SWATCHES = [
  '#d8a47f', // Kraft cardboard (default)
  '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', 
  '#ec4899', '#06b6d4', '#f97316', '#84cc16', '#64748b'
];

const getProductDescriptor = (product: any) => {
  if (!product) return 'No SKU';
  const skuVal = product.sku && product.sku !== 'No SKU' ? product.sku : '';
  const colorVal = Array.isArray(product.colors)
     ? product.colors.join(', ')
     : (product.colors || '');
  if (skuVal && colorVal) {
     return `${skuVal} • ${colorVal}`;
  }
  return colorVal || skuVal || 'No SKU';
};

export function ProductsTab({ onJumpToWarehouse }: { onJumpToWarehouse?: (palletId: string, zone: string, warehouseId?: string) => void }) {
  const [products, setProducts] = useState<any[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [qrSessionId, setQrSessionId] = useState<string | null>(null);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Racks and boxes tracking
  const [pallets, setPallets] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  
  const [newBoxName, setNewBoxName] = useState('');
  const [boxProducts, setBoxProducts] = useState<any[]>([]);
  const [newBoxLocationType, setNewBoxLocationType] = useState<'Unmapped' | 'Floor' | 'Rack'>('Unmapped');
  const [newBoxWarehouseId, setNewBoxWarehouseId] = useState('');
  const [newBoxRackLabel, setNewBoxRackLabel] = useState('');
  const [newBoxBay, setNewBoxBay] = useState('0');
  const [newBoxLevel, setNewBoxLevel] = useState('1');
  const [newBoxSlot, setNewBoxSlot] = useState('-1');
  const [newBoxX, setNewBoxX] = useState('0');
  const [newBoxZ, setNewBoxZ] = useState('0');
  const [isCreatingBox, setIsCreatingBox] = useState(false);
  const [isSubmittingBox, setIsSubmittingBox] = useState(false);
  const [editingBoxPalletId, setEditingBoxPalletId] = useState<string | null>(null);
  const [newBoxNumber, setNewBoxNumber] = useState('1');
  const [newBoxColor, setNewBoxColor] = useState('#d8a47f');
  const [printingBox, setPrintingBox] = useState<any | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'pallets'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setPallets(data);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'warehouses'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setWarehouses(data);
    });
    return () => unsubscribe();
  }, []);

  const handleCreateBoxSubmit = async (e: React.FormEvent) => {
     e.preventDefault();
     if (!newBoxName.trim()) return alert("Box name is required.");

      let selectedItems: any[] = [];
      boxProducts.forEach((bp: any) => {
          Object.entries(bp.quantities).forEach(([size, qty]) => {
              if (typeof qty === 'number' && qty > 0) {
                  selectedItems.push({
                      id: `item_${bp.product.sku || bp.product.title}_${size}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                      productId: bp.product.id || '',
                      sku: bp.product.sku === 'No SKU' ? '' : (bp.product.sku || ''),
                      name: bp.product.title || '',
                      size: size,
                      quantity: qty,
                      photoUrl: bp.product.images?.[0] || ''
                  });
              }
          });
      });

     if (selectedItems.length === 0) {
        return alert("Please specify quantity for at least one size.");
     }

     setIsSubmittingBox(true);

     try {
        const palletId = editingBoxPalletId || `pal_box_${Date.now()}`;
        
        let positionInfo: any = {};
        const whObj = warehouses.find(w => w.id === newBoxWarehouseId) || warehouses[0];
        const whRacks = whObj?.racks || [];
        const resolvedRackLabel = newBoxRackLabel || whRacks[0]?.label || '';
        
        if (newBoxLocationType === 'Floor') {
           const parsedX = Math.round(parseFloat(newBoxX) * 2) / 2;
           const parsedZ = Math.round(parseFloat(newBoxZ) * 2) / 2;
           positionInfo = {
               position: [parsedX, 0, parsedZ],
               rotation: [0, 0, 0],
               location: `Open Floor Zone (${parsedX.toFixed(1)}, ${parsedZ.toFixed(1)})`
           };
        } else if (newBoxLocationType === 'Rack') {
           const bayIdx = parseInt(newBoxBay);
           const levelIdx = parseInt(newBoxLevel) - 1; // 0-indexed level in database
           const slotNum = parseInt(newBoxSlot);
           
           // Evict current occupant
           const occupant = pallets.find((p: any) => 
               p.warehouseId === newBoxWarehouseId &&
               String(p.zone) === String(resolvedRackLabel) &&
               p.rackSpecs?.bay === bayIdx &&
               p.rackSpecs?.level === levelIdx &&
               p.rackSpecs?.slot === slotNum &&
               p.id !== palletId
           );
           
           if (occupant) {
               const rackObj = whObj?.racks?.find((r: any) => String(r.label) === String(resolvedRackLabel));
               const rackPos = rackObj?.position || [0, 0, 0];
               const floorX = rackPos[0] + (Math.random() - 0.5) * 3;
               const floorZ = rackPos[2] + 3.0 + (Math.random() - 0.5) * 2;
               
               const occupantUpdates = {
                   zone: 'Floor',
                   rackSpecs: null,
                   position: [floorX, 0, floorZ],
                   rotation: [0, 0, 0],
                   location: `Open Floor Zone (${floorX.toFixed(1)}, ${floorZ.toFixed(1)})`
               };
               await setDoc(doc(db, 'pallets', occupant.id), occupantUpdates, { merge: true });
           }

           positionInfo = {
               rackSpecs: {
                   bay: bayIdx,
                   level: levelIdx,
                   slot: slotNum
               },
               location: `${resolvedRackLabel} | Bay ${bayIdx + 1} | Level ${levelIdx + 1} | Slot ${slotNum === -1 ? '1' : slotNum === 0 ? '2' : '3'}`
           };
        }

        const newBoxPayload = {
            id: palletId,
            type: 'Box',
            name: newBoxName.trim(),
            boxNumber: parseInt(newBoxNumber) || 1,
            color: newBoxColor,
            height: 0.35,
            createdAt: Date.now(),
            warehouseId: newBoxLocationType === 'Unmapped' ? '' : newBoxWarehouseId,
            zone: newBoxLocationType === 'Unmapped' ? '' : (newBoxLocationType === 'Floor' ? 'Floor' : resolvedRackLabel),
            boxes: [
                {
                    id: editingBoxPalletId ? (pallets.find(p => p.id === editingBoxPalletId)?.boxes?.[0]?.id || `box_${Date.now()}`) : `box_${Date.now()}`,
                    name: newBoxName.trim(),
                    items: selectedItems
                }
            ],
            ...positionInfo
        };

        await setDoc(doc(db, 'pallets', palletId), newBoxPayload);
        setIsCreatingBox(false);
        alert(editingBoxPalletId ? 'Box payload updated successfully!' : 'Box payload created successfully!');
     } catch (err) {
        console.error(err);
        alert('Failed to save box payload.');
     } finally {
        setIsSubmittingBox(false);
     }
  };

  const handleDeleteBoxPayload = async () => {
     if (!editingBoxPalletId) return;
     if (!window.confirm("Are you sure you want to permanently delete this box payload?")) return;
     setIsSubmittingBox(true);
     try {
        await deleteDoc(doc(db, 'pallets', editingBoxPalletId));
        setIsCreatingBox(false);
        alert("Box payload deleted successfully!");
     } catch (err) {
        console.error(err);
        alert("Failed to delete box payload.");
     } finally {
        setIsSubmittingBox(false);
     }
  };

  const matchingPallets = selectedProduct ? pallets.filter(pallet => {
     if (!pallet.boxes) return false;
      return pallet.boxes.some((box: any) => 
         box.items && box.items.some((item: any) => {
            if (item.productId) {
               return item.productId === selectedProduct.id;
            }
            const itemSku = item.sku && item.sku !== 'No SKU' ? item.sku : '';
            const prodSku = selectedProduct.sku && selectedProduct.sku !== 'No SKU' ? selectedProduct.sku : '';
            if (itemSku && prodSku) {
               return itemSku.toLowerCase() === prodSku.toLowerCase();
            }
            return item.name && item.name.toLowerCase().includes(selectedProduct.title.toLowerCase());
         })
      );
  }) : [];

  const isProductFullyAllocated = (p: any) => {
     if (!p.sizeSpread || Object.keys(p.sizeSpread).length === 0) return true;
     const positiveSizes = Object.entries(p.sizeSpread).filter(([_, qty]) => typeof qty === 'number' && qty > 0);
     if (positiveSizes.length === 0) return true;
     return positiveSizes.every(([size, catalogQty]) => {
        let stagedQty = 0;
        pallets.forEach((pallet: any) => {
           if (pallet.id === editingBoxPalletId) return;
           if (!pallet.boxes) return;
           pallet.boxes.forEach((box: any) => {
              if (!box.items) return;
              box.items.forEach((item: any) => {
                  const matches = (() => {
                     if (item.productId) {
                        return p.id === item.productId;
                     }
                     const itemSku = item.sku && item.sku !== 'No SKU' ? item.sku : '';
                     const prodSku = p.sku && p.sku !== 'No SKU' ? p.sku : '';
                     if (itemSku && prodSku) {
                        return itemSku.toLowerCase() === prodSku.toLowerCase();
                     }
                     if (!itemSku && !prodSku) {
                        return p.title && item.name && item.name.toLowerCase() === p.title.toLowerCase();
                     }
                     return false;
                  })();
                 if (matches && item.size === size) {
                    stagedQty += (item.quantity || 0);
                 }
              });
           });
        });
        return stagedQty >= (catalogQty as number);
     });
  };

  // Form State for editing / creating
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    sku: '',
    style: '',
    colors: '',
    sizeSpread: {} as Record<string, number>,
    images: [] as string[]
  });
  
  const [imageUrlInput, setImageUrlInput] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'products'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setProducts(data);
    });
    return () => unsubscribe();
  }, []);

  // Listen for mobile generic uploads via QR code
  useEffect(() => {
    if (!qrSessionId) return;
    
    const unsubscribe = onSnapshot(doc(db, 'mobile_uploads', qrSessionId), async (docSnap) => {
       if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.status === 'completed' && data.url) {
             setFormData(prev => ({ ...prev, images: [...prev.images, data.url] }));
             try {
                await deleteDoc(docSnap.ref);
             } catch(e) {}
             setQrSessionId(null);
          }
       }
    });

    return () => unsubscribe();
  }, [qrSessionId]);

  const handleCreateNew = () => {
    setFormData({ title: '', description: '', sku: '', style: '', colors: '', sizeSpread: {}, images: [] });
    setImageUrlInput('');
    setIsCreating(true);
    setIsEditing(true);
    setSelectedProduct(null);
  };

  const handleSelectProduct = (product: any) => {
    setSelectedProduct(product);
    
    let parsedSizeSpread = {};
    if (product.sizeSpread && typeof product.sizeSpread === 'object' && !Array.isArray(product.sizeSpread)) {
        parsedSizeSpread = product.sizeSpread;
    }

    setFormData({
      title: product.title || '',
      description: product.description || '',
      sku: product.sku || '',
      style: product.style || '',
      colors: Array.isArray(product.colors) ? product.colors.join(', ') : (product.colors || ''),
      sizeSpread: parsedSizeSpread,
      images: product.images || []
    });
    setImageUrlInput('');
    setIsCreating(false);
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!formData.title) return alert("Title is required");

    // Clean size spread to only include numbers > 0
    const cleanSizeSpread = Object.fromEntries(
       Object.entries(formData.sizeSpread).filter(([_, v]) => typeof v === 'number' && v > 0)
    );

    const payload = {
      ...formData,
      colors: formData.colors.split(',').map(s => s.trim()).filter(Boolean),
      sizeSpread: cleanSizeSpread,
    };

    try {
      if (selectedProduct && !isCreating) {
        await updateDoc(doc(db, 'products', selectedProduct.id), payload);
      } else {
        await setDoc(doc(db, 'products', `PROD_${Date.now()}`), payload);
      }
      alert('Saved successfully');
      
      // Keep selection but exit editing mode
      if (selectedProduct && !isCreating) {
          setIsEditing(false);
          // Wait for backend to send snapshot updates
      } else {
          setIsCreating(false);
          setIsEditing(false);
          setFormData({ title: '', description: '', sku: '', style: '', colors: '', sizeSpread: {}, images: [] });
      }
    } catch (err) {
      console.error(err);
      alert('Failed to save product.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this product?')) return;
    try {
      await deleteDoc(doc(db, 'products', id));
      if (selectedProduct && selectedProduct.id === id) {
        setSelectedProduct(null);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to delete product.');
    }
  };

  const handleAddImage = () => {
    if (imageUrlInput.trim()) {
      setFormData(prev => ({ ...prev, images: [...prev.images, imageUrlInput.trim()] }));
      setImageUrlInput('');
    }
  };

  const handleRemoveImage = (index: number) => {
    setFormData(prev => ({ ...prev, images: prev.images.filter((_, i) => i !== index) }));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const storageRef = ref(storage, `products/${Date.now()}_${file.name}`);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on(
      'state_changed',
      (_snapshot) => {},
      (error) => {
        console.error('Upload failed:', error);
        alert('Failed to upload image.');
        setIsUploading(false);
      },
      async () => {
        const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
        setFormData(prev => ({ ...prev, images: [...prev.images, downloadURL] }));
        setIsUploading(false);
      }
    );
  };

  const filteredProducts = products.filter(p => {
    const query = searchQuery.toLowerCase();
    const titleMatch = (p.title || '').toLowerCase().includes(query);
    const skuMatch = (p.sku || '').toLowerCase().includes(query);
    const colorsMatch = Array.isArray(p.colors)
       ? p.colors.some((c: string) => c.toLowerCase().includes(query))
       : (p.colors || '').toLowerCase().includes(query);
    return titleMatch || skuMatch || colorsMatch;
  });

  const totalGarmentsAcrossCatalog = products.reduce((total, p) => {
    if (!p.sizeSpread) return total;
    return total + Object.values(p.sizeSpread).reduce((sum: any, val: any) => sum + (typeof val === 'number' ? val : 0), 0);
  }, 0);

  return (
    <div className="w-full h-full bg-white rounded-2xl border border-brand-border shadow-sm flex overflow-hidden">
      
      {/* Left List Pane (hides on mobile if detail is open, or just flex-shrink) */}
      <div className={`w-full md:w-1/3 flex flex-col border-r border-brand-border bg-brand-bg transition-all ${(selectedProduct || isCreating) ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-4 border-b border-brand-border bg-white flex flex-col gap-3 shrink-0">
           <div className="flex justify-between items-center">
              <div>
                <h2 className="font-serif font-bold text-lg text-brand-primary tracking-tight leading-tight">Product Catalog</h2>
                <p className="text-[10px] font-bold text-brand-secondary mt-0.5 uppercase tracking-widest">{totalGarmentsAcrossCatalog.toLocaleString()} Total Units</p>
              </div>
              <button 
                onClick={handleCreateNew}
                className="bg-brand-primary text-white p-1.5 px-3 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-brand-primary/90 transition-colors shadow-sm flex items-center gap-1"
              >
                 <Plus size={14} /> New Item
              </button>
           </div>
           <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-secondary" size={14} />
              <input 
                type="text" 
                placeholder="Search products, SKU..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-brand-bg border border-brand-border rounded-lg pl-9 pr-3 py-2 text-xs font-medium focus:outline-brand-primary"
              />
           </div>
        </div>
        
        <div className="flex-1 overflow-y-auto w-full custom-scrollbar">
           {filteredProducts.length === 0 ? (
             <div className="p-8 text-center text-brand-secondary text-xs">No products found.</div>
           ) : (
             <div className="divide-y divide-brand-border/50">
               {filteredProducts.map(p => (
                  <div 
                    key={p.id} 
                    onClick={() => handleSelectProduct(p)}
                    className={`p-4 cursor-pointer hover:bg-neutral-50 transition-colors flex gap-4 items-center ${selectedProduct?.id === p.id ? 'bg-neutral-50 border-l-2 border-brand-primary' : 'border-l-2 border-transparent'}`}
                  >
                     <div 
                        className={`w-12 h-12 rounded-lg bg-neutral-100 border border-brand-border shrink-0 overflow-hidden flex items-center justify-center relative ${p.images && p.images.length > 0 ? 'cursor-pointer group' : ''}`}
                        onClick={(e) => {
                           if (p.images && p.images.length > 0) {
                              e.stopPropagation();
                              handleSelectProduct(p);
                              setExpandedImage(p.images[0]);
                           }
                        }}
                     >
                        {p.images && p.images.length > 0 ? (
                           <>
                              <img src={p.images[0]} alt={p.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
                              <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                 <ImageIcon size={12} className="text-white fill-white/20" />
                              </div>
                           </>
                        ) : (
                           <ImageIcon className="text-brand-secondary opacity-50" size={16} />
                        )}
                     </div>
                     <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-brand-primary text-sm truncate">{p.title || 'Untitled Product'}</h4>
                        <p className="text-[10px] uppercase tracking-widest text-brand-secondary mt-0.5 truncate">
                           {getProductDescriptor(p)}
                           {p.style && <span className="ml-2 text-brand-primary/60 border-l border-brand-border pl-2">{p.style}</span>}
                        </p>
                        {p.sizeSpread && Object.keys(p.sizeSpread).length > 0 && (
                           <div className="flex flex-wrap gap-1 mt-2">
                              {SIZES.filter(size => p.sizeSpread[size]).map(size => (
                                 <span key={size} className="text-[9px] bg-white border border-brand-border text-brand-secondary px-1.5 py-0.5 rounded-md font-bold shrink-0 shadow-sm leading-none flex items-center gap-1">
                                    {size} <span className="text-brand-primary">{p.sizeSpread[size]}</span>
                                 </span>
                              ))}
                           </div>
                        )}
                     </div>
                  </div>
               ))}
             </div>
           )}
        </div>
      </div>

      {/* Right Detail Pane */}
      <div className={`flex-1 flex flex-col bg-white overflow-hidden ${(!selectedProduct && !isCreating) ? 'hidden md:flex' : 'flex'}`}>
         {(!selectedProduct && !isCreating) ? (
           <div className="flex-1 flex flex-col items-center justify-center text-center opacity-80 px-4">
              <ImageIcon size={48} className="mb-4 text-brand-secondary stroke-1 opacity-50" />
              <p className="font-serif text-xl tracking-tight text-brand-primary">No Product Selected</p>
              <p className="text-sm text-brand-secondary mt-2 opacity-80">Select an item from the list to view its details or create a new one.</p>
           </div>
         ) : (
           <div className="flex flex-col h-full overflow-y-auto animate-in fade-in slide-in-from-right-4">
              {/* Header */}
              <div className="p-6 border-b border-brand-border flex justify-between items-start bg-neutral-50 shrink-0 sticky top-0 z-10">
                 <div className="flex items-center gap-3">
                    <button onClick={() => { setSelectedProduct(null); setIsCreating(false); }} className="md:hidden text-brand-secondary p-2 -ml-2 hover:text-black">
                       <ChevronLeft size={20} />
                    </button>
                    <div>
                      <h2 className={tokens.typography.h2}>{isCreating ? 'Create New Product' : (selectedProduct?.title || 'Edit Product')}</h2>
                      {!isCreating && <p className="text-[10px] uppercase font-bold text-brand-secondary mt-1 tracking-widest">ID: {selectedProduct.id}</p>}
                    </div>
                 </div>
                  <div className="flex gap-2">
                    {!isCreating && !isEditing && (
                       <>
                         <button 
                            onClick={() => {
                               setEditingBoxPalletId(null);
                               setNewBoxName(`${selectedProduct.title}`);
                               
                               const existingBoxNumbers = pallets
                                   .filter((p: any) => p.type === 'Box' && p.boxNumber !== undefined)
                                   .map((p: any) => parseInt(p.boxNumber) || 0);
                               const nextNum = existingBoxNumbers.length > 0 ? Math.max(...existingBoxNumbers) + 1 : 1;
                               setNewBoxNumber(String(nextNum));
                               setNewBoxColor('#d8a47f');

                               setBoxProducts([{
                                  productId: selectedProduct.id || selectedProduct.title,
                                  product: selectedProduct,
                                  quantities: {}
                               }]);
                               setNewBoxLocationType('Unmapped');
                               setNewBoxWarehouseId(warehouses[0]?.id || 'wh_default_01');
                               const defaultRack = warehouses[0]?.racks?.[0];
                               setNewBoxRackLabel(defaultRack?.label || '');
                               setNewBoxBay('0');
                               setNewBoxLevel('1');
                               setNewBoxSlot('-1');
                               setNewBoxX('0');
                               setNewBoxZ('0');
                               setIsCreatingBox(true);
                            }}
                            className="bg-brand-primary text-white px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-black hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-1.5 shadow-sm font-sans"
                         >
                             <Boxes size={14} /> Create Box
                         </button>
                         <button onClick={() => setIsEditing(true)} className="bg-neutral-100 text-brand-primary px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-neutral-200 transition-colors shadow-sm font-sans">
                           Edit
                         </button>
                       </>
                    )}
                    {isEditing && !isCreating && (
                      <button onClick={() => handleSelectProduct(selectedProduct)} className="text-brand-secondary px-3 py-2 text-xs font-bold uppercase tracking-widest hover:text-black transition-colors">
                        Cancel
                      </button>
                    )}
                    {!isCreating && isEditing && (
                      <button onClick={() => handleDelete(selectedProduct.id)} className="p-2.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors ml-2" title="Delete">
                        <Trash2 size={16} />
                      </button>
                    )}
                    {isEditing && (
                      <button onClick={handleSave} className="bg-brand-primary text-white px-4 py-2.5 rounded-lg flex items-center gap-2 text-xs font-bold uppercase tracking-widest shadow-sm hover:scale-[1.02] transition-transform">
                        <Save size={14} /> Save
                      </button>
                    )}
                 </div>
              </div>

              {/* Form Content */}
              <div className="p-6 max-w-3xl space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                     <div className="col-span-1 md:col-span-3">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1 block">Product Title</label>
                        <input disabled={!isEditing} type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} placeholder="e.g. Premium Heavyweight Hoodie" className="w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-3 text-sm font-semibold focus:outline-brand-primary disabled:opacity-75 disabled:cursor-not-allowed disabled:bg-neutral-50" />
                     </div>
                     
                     <div className="col-span-1">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1 block">SKU (Optional)</label>
                        <input disabled={!isEditing} type="text" value={formData.sku} onChange={e => setFormData({...formData, sku: e.target.value})} placeholder="e.g. WH-1002" className="w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-3 text-sm font-semibold focus:outline-brand-primary disabled:opacity-75 disabled:cursor-not-allowed disabled:bg-neutral-50" />
                     </div>
                     
                     <div className="col-span-1">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1 block">Style</label>
                        <input disabled={!isEditing} type="text" value={formData.style} onChange={e => setFormData({...formData, style: e.target.value})} placeholder="e.g. Blank / Hoodie" className="w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-3 text-sm font-semibold focus:outline-brand-primary disabled:opacity-75 disabled:cursor-not-allowed disabled:bg-neutral-50" />
                     </div>
                     
                     <div className="col-span-1">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1 block">Colors (Comma separated)</label>
                        <input disabled={!isEditing} type="text" value={formData.colors} onChange={e => setFormData({...formData, colors: e.target.value})} placeholder="e.g. Black, White, Heather Grey" className="w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-3 text-sm font-semibold focus:outline-brand-primary disabled:opacity-75 disabled:cursor-not-allowed disabled:bg-neutral-50" />
                     </div>
                     
                     <div className="col-span-1 md:col-span-3 mt-4 mb-2">
                        <div className="flex justify-between items-center mb-3">
                           <label className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary block">Size Spread Matrix</label>
                           <span className="text-[10px] bg-neutral-200 text-brand-primary px-2.5 py-1 rounded-full font-bold">
                              {SIZES.reduce((sum, size) => sum + (formData.sizeSpread[size] || 0), 0)} Total Units
                           </span>
                        </div>
                        <div className="bg-white border border-brand-border rounded-xl p-6 flex flex-wrap gap-4 shadow-sm">
                           {SIZES.map(size => (
                              <div key={size} className="flex flex-col gap-2 w-16">
                                 <span className="text-[10px] font-bold text-center text-brand-secondary">{size}</span>
                                 <input 
                                    type="number" 
                                    min="0"
                                    placeholder="-"
                                    disabled={!isEditing}
                                    value={formData.sizeSpread[size] || ''}
                                    onChange={e => {
                                        const val = parseInt(e.target.value);
                                        setFormData(prev => ({
                                            ...prev,
                                            sizeSpread: {
                                                ...prev.sizeSpread,
                                                [size]: isNaN(val) ? 0 : val
                                            }
                                        }));
                                    }}
                                    className="w-full bg-brand-bg border border-brand-border rounded-lg text-center py-2 text-sm font-semibold focus:outline-brand-primary transition-colors focus:bg-white disabled:opacity-75 disabled:cursor-not-allowed disabled:bg-neutral-50"
                                 />
                              </div>
                           ))}
                        </div>
                     </div>

                     <div className="col-span-1 md:col-span-3">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1 block">Description</label>
                        <textarea disabled={!isEditing} rows={4} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Describe the product details, materials, and fit..." className="w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-3 text-sm font-medium focus:outline-brand-primary resize-y disabled:opacity-75 disabled:cursor-not-allowed disabled:bg-neutral-50"></textarea>
                     </div>
                  </div>

                  <hr className="border-brand-border/50" />

                  {selectedProduct && !isCreating && (
                     <>
                        <div className="space-y-4 pt-2">
                            <div className="flex justify-between items-center">
                                <h3 className="font-serif text-lg font-bold text-brand-primary flex items-center gap-2">
                                   <Boxes size={18} className="text-brand-secondary" />
                                   Staged Inventory (Rolling Shelves / Boxes)
                                </h3>
                                <button 
                                   onClick={() => {
                                      setEditingBoxPalletId(null);
                                      setNewBoxName(`${selectedProduct.title}`);
                                      
                                      const existingBoxNumbers = pallets
                                          .filter((p: any) => p.type === 'Box' && p.boxNumber !== undefined)
                                          .map((p: any) => parseInt(p.boxNumber) || 0);
                                      const nextNum = existingBoxNumbers.length > 0 ? Math.max(...existingBoxNumbers) + 1 : 1;
                                      setNewBoxNumber(String(nextNum));
                                      setNewBoxColor('#d8a47f');

                                      setBoxProducts([{
                                         productId: selectedProduct.id || selectedProduct.title,
                                         product: selectedProduct,
                                         quantities: {}
                                      }]);
                                      setNewBoxLocationType('Unmapped');
                                      setNewBoxWarehouseId(warehouses[0]?.id || 'wh_default_01');
                                      const defaultRack = warehouses[0]?.racks?.[0];
                                      setNewBoxRackLabel(defaultRack?.label || '');
                                      setNewBoxBay('0');
                                      setNewBoxLevel('1');
                                      setNewBoxSlot('-1');
                                      setNewBoxX('0');
                                      setNewBoxZ('0');
                                      setIsCreatingBox(true);
                                   }}
                                   className="bg-brand-primary text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg hover:bg-black hover:scale-[1.02] transition-all duration-150 flex items-center gap-1 shadow-sm font-sans"
                                >
                                    <Plus size={12} /> Create Box Payload
                                </button>
                            </div>

                            {matchingPallets.length === 0 ? (
                               <div className="border border-dashed border-brand-border rounded-xl p-6 text-center bg-brand-bg/50">
                                  <p className="text-xs font-semibold text-brand-secondary">No boxes staged for this product yet.</p>
                                  <p className="text-[9px] mt-1 text-brand-secondary/70">Click "+ Create Box Payload" to allocate inventory to a rolling box shelf or floor zone.</p>
                                </div>
                            ) : (
                               <div className="grid grid-cols-1 gap-3">
                                  {matchingPallets.map(pallet => {
                                      // Group items in this pallet/box by product
                                      const groupedProducts: any[] = [];
                                      pallet.boxes?.forEach((box: any) => {
                                          box.items?.forEach((item: any) => {
                                               const matchedProduct = products.find((prod: any) => {
                                                   if (item.productId) {
                                                       return prod.id === item.productId;
                                                   }
                                                   const itemSku = item.sku && item.sku !== 'No SKU' ? item.sku : '';
                                                   const prodSku = prod.sku && prod.sku !== 'No SKU' ? prod.sku : '';
                                                   if (itemSku && prodSku) {
                                                       return itemSku.toLowerCase() === prodSku.toLowerCase();
                                                   }
                                                   if (!itemSku && !prodSku) {
                                                       return prod.title && prod.title.toLowerCase() === item.name.toLowerCase();
                                                   }
                                                   return false;
                                               });
                                              const prodId = matchedProduct?.id || item.sku || item.name;
                                              let entry = groupedProducts.find(g => g.id === prodId);
                                              if (!entry) {
                                                  entry = {
                                                      id: prodId,
                                                      isCatalogProduct: !!matchedProduct,
                                                      product: matchedProduct || {
                                                          id: prodId,
                                                          title: item.name,
                                                          sku: item.sku || 'No SKU',
                                                          images: item.photoUrl ? [item.photoUrl] : [],
                                                          sizeSpread: {}
                                                      },
                                                      items: [],
                                                      totalQty: 0
                                                  };
                                                  groupedProducts.push(entry);
                                              }
                                              entry.items.push(item);
                                              entry.totalQty += item.quantity || 0;
                                          });
                                      });

                                      // Separate the active product from other products in the box
                                      const activeEntry = groupedProducts.find(g => g.id === selectedProduct.id);
                                      const otherEntries = groupedProducts.filter(g => g.id !== selectedProduct.id);
                                      
                                      const totalUnitsInBox = groupedProducts.reduce((sum, g) => sum + g.totalQty, 0);

                                      return (
                                          <div key={pallet.id} className="p-4 bg-white border border-brand-border rounded-xl shadow-sm hover:shadow-md transition-all duration-150 space-y-3">
                                             {/* Box Header Info */}
                                             <div className="flex justify-between items-start gap-4">
                                                <div className="space-y-1 min-w-0">
                                                   <div className="flex items-center gap-2 flex-wrap">
                                                      <span className="font-serif font-bold text-sm text-brand-primary truncate">{pallet.name}</span>
                                                      <span className="text-[10px] bg-brand-primary/10 text-brand-primary px-2 py-0.5 rounded-md font-bold uppercase tracking-wider">
                                                         Box {pallet.boxNumber || 1}
                                                      </span>
                                                      <span className="text-[10px] bg-neutral-100 text-brand-secondary px-2 py-0.5 rounded-md font-bold">
                                                         {totalUnitsInBox} total units
                                                      </span>
                                                   </div>
                                                   <div className="text-[10px] font-bold text-brand-secondary uppercase tracking-wider flex items-center gap-1.5 font-sans mt-0.5">
                                                      <Map size={11} className="shrink-0 text-brand-primary/70" />
                                                      {pallet.zone 
                                                         ? (pallet.zone === 'Floor' 
                                                            ? `Concrete Floor (X: ${pallet.position?.[0]?.toFixed(1) ?? 0}, Z: ${pallet.position?.[2]?.toFixed(1) ?? 0})`
                                                            : `${pallet.zone} | Bay ${pallet.rackSpecs?.bay !== undefined ? pallet.rackSpecs.bay + 1 : 1} | Level ${pallet.rackSpecs?.level !== undefined ? pallet.rackSpecs.level + 1 : 1} | Slot ${pallet.rackSpecs?.slot === -1 ? '1' : pallet.rackSpecs?.slot === 0 ? '2' : '3'}`
                                                           )
                                                         : 'Unmapped / Staging Area'
                                                      }
                                                   </div>
                                                </div>
                                                
                                                {/* Action Buttons */}
                                                <div className="flex gap-2 shrink-0">
                                                    <button 
                                                        onClick={() => {
                                                            setEditingBoxPalletId(pallet.id);
                                                            setNewBoxName(pallet.name || '');
                                                            setNewBoxNumber(String(pallet.boxNumber || 1));
                                                            setNewBoxColor(pallet.color || '#d8a47f');
                                                            
                                                            const tempBoxProducts: any[] = [];
                                                            groupedProducts.forEach(g => {
                                                               const quantities: Record<string, number> = {};
                                                               g.items.forEach((item: any) => {
                                                                   quantities[item.size] = item.quantity || 0;
                                                               });
                                                               tempBoxProducts.push({
                                                                   productId: g.id,
                                                                   product: g.product,
                                                                   quantities
                                                               });
                                                            });
                                                            setBoxProducts(tempBoxProducts);
                                                            
                                                             const locType = pallet.zone 
                                                                ? (pallet.zone === 'Floor' ? 'Floor' : 'Rack')
                                                                : 'Unmapped';
                                                             setNewBoxLocationType(locType);
                                                             setNewBoxWarehouseId(pallet.warehouseId || warehouses[0]?.id || 'wh_default_01');
                                                             
                                                             if (locType === 'Rack') {
                                                                setNewBoxRackLabel(pallet.zone || '');
                                                                setNewBoxBay(String(pallet.rackSpecs?.bay ?? 0));
                                                                setNewBoxLevel(String((pallet.rackSpecs?.level ?? 0) + 1));
                                                                setNewBoxSlot(String(pallet.rackSpecs?.slot ?? -1));
                                                             } else {
                                                                setNewBoxX(String(pallet.position?.[0] ?? 0));
                                                                setNewBoxZ(String(pallet.position?.[2] ?? 0));
                                                             }
                                                             setIsCreatingBox(true);
                                                        }}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-border text-[10px] font-bold text-brand-primary uppercase hover:bg-neutral-50 transition-all duration-200 font-sans"
                                                    >
                                                        Edit Box
                                                    </button>
                                                    <button 
                                                        onClick={() => {
                                                           setPrintingBox(pallet);
                                                        }}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-border text-[10px] font-bold text-brand-primary uppercase hover:bg-neutral-50 transition-all duration-200 font-sans"
                                                    >
                                                        <QrCode size={12} /> QR Label
                                                    </button>
                                                    {onJumpToWarehouse && (pallet.zone || pallet.warehouseId) && (
                                                       <button 
                                                           onClick={() => onJumpToWarehouse(pallet.id, pallet.zone || 'Floor', pallet.warehouseId)}
                                                           className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-primary text-[10px] font-bold text-brand-primary uppercase hover:bg-brand-primary hover:text-white transition-all duration-200 shrink-0 font-sans"
                                                       >
                                                           <Map size={12} /> Locate in 3D
                                                       </button>
                                                    )}
                                                </div>
                                             </div>

                                             {/* Line Items (Products list inside box) */}
                                             <div className="border border-brand-border rounded-xl divide-y divide-brand-border overflow-hidden bg-neutral-50/10">
                                                {/* Render Active Product Row */}
                                                {activeEntry && (
                                                   <div className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white">
                                                      <div className="flex gap-2.5 items-center min-w-0">
                                                         {activeEntry.product.images?.[0] ? (
                                                            <img src={activeEntry.product.images[0]} alt="Product" className="w-8 h-8 object-cover rounded-lg border border-brand-border bg-white shrink-0" />
                                                         ) : (
                                                            <div className="w-8 h-8 bg-neutral-100 border border-brand-border rounded-lg flex items-center justify-center shrink-0">
                                                               <Boxes size={14} className="text-neutral-400" />
                                                            </div>
                                                         )}
                                                         <div className="min-w-0">
                                                            <div className="flex items-center gap-1.5">
                                                               <span className="text-xs font-bold text-brand-primary leading-tight truncate">{activeEntry.product.title}</span>
                                                               <span className="text-[8px] bg-brand-primary/10 text-brand-primary px-1.5 py-0.2 rounded font-bold uppercase tracking-wider shrink-0">Active</span>
                                                            </div>
                                                            <p className="text-[9px] font-bold text-brand-secondary uppercase mt-0.5">{getProductDescriptor(activeEntry.product)}</p>
                                                         </div>
                                                      </div>
                                                      <div className="flex items-center gap-3 shrink-0 flex-wrap">
                                                         <div className="flex flex-wrap gap-1">
                                                            {activeEntry.items.map((item: any, i: number) => (
                                                               <span key={i} className="text-[9px] bg-neutral-50 border border-brand-border/60 text-brand-secondary px-1.5 py-0.5 rounded font-semibold shrink-0">
                                                                  {item.size}: {item.quantity}
                                                               </span>
                                                            ))}
                                                         </div>
                                                         <span className="text-[10px] font-bold text-brand-primary bg-neutral-100 px-2 py-0.5 rounded shrink-0">
                                                            {activeEntry.totalQty} units
                                                         </span>
                                                      </div>
                                                   </div>
                                                )}

                                                {/* Render Other Products in the Box */}
                                                {otherEntries.map(entry => (
                                                   <div key={entry.id} className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-neutral-50/30 transition-colors">
                                                      <div className="flex gap-2.5 items-center min-w-0">
                                                         {entry.product.images?.[0] ? (
                                                            <img src={entry.product.images[0]} alt="Product" className="w-8 h-8 object-cover rounded-lg border border-brand-border bg-white shrink-0" />
                                                         ) : (
                                                            <div className="w-8 h-8 bg-neutral-100 border border-brand-border rounded-lg flex items-center justify-center shrink-0">
                                                               <Boxes size={14} className="text-neutral-400" />
                                                            </div>
                                                         )}
                                                         <div className="min-w-0">
                                                            {/* Clicking the title will change the selected product to this product */}
                                                            {entry.isCatalogProduct ? (
                                                               <button 
                                                                  type="button"
                                                                  onClick={() => setSelectedProduct(entry.product)}
                                                                  className="text-xs font-bold text-brand-primary hover:text-black hover:underline text-left leading-tight truncate block w-full outline-none focus:underline"
                                                               >
                                                                  {entry.product.title}
                                                               </button>
                                                            ) : (
                                                               <span className="text-xs font-bold text-brand-primary leading-tight truncate block">{entry.product.title}</span>
                                                            )}
                                                            <p className="text-[9px] font-bold text-brand-secondary uppercase mt-0.5">{getProductDescriptor(entry.product)}</p>
                                                         </div>
                                                      </div>
                                                      <div className="flex items-center gap-3 shrink-0 flex-wrap">
                                                         <div className="flex flex-wrap gap-1">
                                                            {entry.items.map((item: any, i: number) => (
                                                               <span key={i} className="text-[9px] bg-neutral-50 border border-brand-border/60 text-brand-secondary px-1.5 py-0.5 rounded font-semibold shrink-0">
                                                                  {item.size}: {item.quantity}
                                                               </span>
                                                            ))}
                                                         </div>
                                                         <span className="text-[10px] font-bold text-brand-primary bg-neutral-100 px-2 py-0.5 rounded shrink-0">
                                                            {entry.totalQty} units
                                                         </span>
                                                      </div>
                                                   </div>
                                                ))}
                                             </div>
                                          </div>
                                      );
                                  })}
                               </div>
                            )}
                        </div>
                        <hr className="border-brand-border/50" />
                     </>
                  )}

                  {/* Images Section */}
                  <div>
                    <h3 className="font-serif text-lg font-bold text-brand-primary mb-4 flex justify-between items-center">
                       Images
                       {!isEditing && formData.images.length > 0 && (
                          <span className="text-[10px] bg-neutral-100 text-brand-secondary px-2 py-1 rounded-md tracking-widest uppercase">
                             {formData.images.length} added
                          </span>
                       )}
                    </h3>
                    
                    {isEditing && (
                      <div className="flex gap-2 mb-4 items-center">
                         <input 
                           type="url" 
                           value={imageUrlInput} 
                           onChange={e => setImageUrlInput(e.target.value)} 
                           placeholder="Paste image URL here..." 
                           className="flex-1 bg-brand-bg border border-brand-border rounded-lg px-3 py-2.5 text-sm font-medium focus:outline-brand-primary"
                         />
                         <button type="button" onClick={handleAddImage} className="bg-neutral-100 text-brand-primary border border-brand-border px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-neutral-200 transition-colors">
                            Add URL
                         </button>
                         <span className="text-brand-secondary text-[10px] font-bold px-2 uppercase tracking-widest">or</span>
                         <div className="flex gap-2">
                           <label className={`bg-brand-primary text-white px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-widest cursor-pointer hover:bg-black transition-colors shadow-sm flex items-center gap-2 ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                              <Upload size={14} />
                              {isUploading ? 'Uploading...' : 'My Device'}
                              <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} disabled={isUploading} />
                           </label>
                           
                           <button 
                             type="button" 
                             onClick={() => setQrSessionId(`scan_${Date.now()}`)}
                             className="bg-black text-white px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-neutral-800 transition-colors shadow-sm flex items-center gap-2"
                           >
                              <QrCode size={14} /> Scan
                           </button>
                         </div>
                      </div>
                    )}

                    {formData.images.length === 0 ? (
                       <div className="w-full border-2 border-dashed border-brand-border rounded-xl p-8 text-center bg-brand-bg/50">
                          <Upload size={24} className="mx-auto text-brand-secondary/50 mb-2" />
                          <p className="text-sm font-semibold text-brand-secondary">No images added</p>
                          <p className="text-[10px] mt-1 text-brand-secondary/70">Paste a URL above to add imagery to this product.</p>
                       </div>
                    ) : (
                       <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                          {formData.images.map((img, i) => (
                             <div key={i} className="aspect-square relative rounded-xl border border-brand-border overflow-hidden group bg-brand-bg cursor-pointer" onClick={() => setExpandedImage(img)}>
                                <img src={img} alt={`Product ${i+1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                {isEditing && (
                                   <button type="button" onClick={(e) => { e.stopPropagation(); handleRemoveImage(i); }} className="absolute top-2 right-2 bg-white/90 text-red-600 p-1.5 rounded-md shadow-sm opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50">
                                      <X size={14} />
                                   </button>
                                )}
                             </div>
                          ))}
                       </div>
                    )}
                  </div>
               </div>
            </div>
         )}
      </div>

      {/* Create Box Payload Modal */}
      {isCreatingBox && (
         <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in zoom-in-95 fill-mode-forwards duration-200">
            <div className="bg-white rounded-3xl shadow-2xl max-w-5xl w-full p-8 relative border border-brand-border h-[90vh] max-h-[90vh] overflow-hidden flex flex-col">
               <button 
                 onClick={() => setIsCreatingBox(false)} 
                 className="absolute top-4 right-4 p-2 text-brand-secondary hover:text-black hover:bg-neutral-100 rounded-full transition-colors"
                 title="Cancel"
               >
                  <X size={20} />
               </button>
               
               <div className="flex items-center gap-3 mb-4 shrink-0">
                  <div className="w-12 h-12 bg-neutral-100 rounded-2xl flex items-center justify-center">
                     <Boxes size={24} className="text-brand-primary" />
                  </div>
                  <div>
                     <h2 className="font-serif text-2xl font-bold tracking-tight text-brand-primary">
                        {editingBoxPalletId ? 'Edit Box Payload' : 'Create Box Payload'}
                     </h2>
                     <p className="text-xs text-brand-secondary">
                        {editingBoxPalletId ? `Update manifest and coordinates for ${newBoxName}.` : `Allocate a box manifest and coordinates for ${selectedProduct.title}.`}
                     </p>
                  </div>
               </div>
               
               <form onSubmit={handleCreateBoxSubmit} className="flex-1 flex flex-col min-h-0">
                  {/* Scrollable body */}
                  <div className="flex-1 overflow-y-auto pr-2 -mr-2 space-y-6 custom-scrollbar mb-6">
                     <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                        
                        {/* Left Column: Metadata & Coordinates */}
                        <div className="lg:col-span-5 space-y-5">
                           {/* Box Name and Box Number */}
                           <div className="grid grid-cols-3 gap-4">
                              <div className="col-span-2">
                                 <label className="text-[10px] font-bold uppercase tracking-wider text-brand-secondary mb-1 block">Box Name (Garment)</label>
                                 <input 
                                   type="text" 
                                   required
                                   value={newBoxName} 
                                   onChange={e => setNewBoxName(e.target.value)} 
                                   className="w-full bg-neutral-50 border border-brand-border rounded-lg px-3 py-2 text-sm font-semibold focus:outline-brand-primary"
                                 />
                              </div>
                              <div className="col-span-1">
                                 <label className="text-[10px] font-bold uppercase tracking-wider text-brand-secondary mb-1 block">Box Number</label>
                                 <input 
                                   type="number" 
                                   min="1"
                                   required
                                   value={newBoxNumber} 
                                   onChange={e => setNewBoxNumber(e.target.value)} 
                                   className="w-full bg-neutral-50 border border-brand-border rounded-lg text-center py-2 text-sm font-semibold focus:outline-brand-primary"
                                 />
                              </div>
                           </div>

                           {/* Box Color Swatches */}
                           <div>
                              <label className="text-[10px] font-bold uppercase tracking-wider text-brand-secondary mb-1.5 block">Box Color Tag</label>
                              <div className="flex flex-wrap gap-2 bg-neutral-50 p-3 rounded-xl border border-brand-border/60">
                                 {BOX_SWATCHES.map(color => (
                                    <button 
                                       key={color} 
                                       type="button"
                                       onClick={() => setNewBoxColor(color)}
                                       className={`w-6 h-6 rounded-full cursor-pointer transition-transform hover:scale-110 shadow-sm ${newBoxColor === color ? 'ring-2 ring-offset-2 ring-brand-primary scale-110' : ''}`}
                                       style={{ backgroundColor: color }}
                                       title={color === '#d8a47f' ? 'Standard Cardboard' : color}
                                    />
                                 ))}
                              </div>
                           </div>

                           {/* Staging Location Selector */}
                           <div>
                              <label className="text-[10px] font-bold uppercase tracking-wider text-brand-secondary mb-1.5 block">Location Type</label>
                              <div className="grid grid-cols-3 gap-2 bg-neutral-100 p-1 rounded-lg">
                                 {(['Unmapped', 'Floor', 'Rack'] as const).map(type => (
                                    <button
                                       key={type}
                                       type="button"
                                       onClick={() => {
                                          setNewBoxLocationType(type);
                                          if (type === 'Rack' && !newBoxRackLabel) {
                                             const whObj = warehouses.find(w => w.id === newBoxWarehouseId) || warehouses[0];
                                             if (whObj?.racks?.length > 0) {
                                                setNewBoxRackLabel(whObj.racks[0].label);
                                             }
                                          }
                                       }}
                                       className={`py-1.5 text-xs rounded transition-all duration-200 uppercase tracking-wider font-bold text-[10px] ${
                                           newBoxLocationType === type
                                               ? 'bg-white text-brand-primary shadow-sm'
                                               : 'text-brand-secondary hover:text-brand-primary'
                                       }`}
                                    >
                                       {type === 'Unmapped' ? 'Unmapped' : type === 'Floor' ? 'Floor' : 'Rack Slot'}
                                    </button>
                                 ))}
                              </div>
                           </div>

                           {/* Coordinate Detail Forms */}
                           {newBoxLocationType !== 'Unmapped' && (
                              <div className="space-y-4 bg-neutral-50 p-4 rounded-xl border border-brand-border/60">
                                 {/* Warehouse Selector */}
                                 <div>
                                    <label className="text-[10px] font-bold uppercase tracking-wider text-brand-secondary mb-1 block">Warehouse / Room</label>
                                    <select 
                                       value={newBoxWarehouseId} 
                                       onChange={e => {
                                          const whId = e.target.value;
                                          setNewBoxWarehouseId(whId);
                                          const whObj = warehouses.find(w => w.id === whId);
                                          if (whObj?.racks?.length > 0) {
                                             setNewBoxRackLabel(whObj.racks[0].label);
                                          } else {
                                             setNewBoxRackLabel('');
                                          }
                                       }}
                                       className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm font-semibold focus:outline-brand-primary"
                                    >
                                       {warehouses.map(w => (
                                          <option key={w.id} value={w.id}>{w.name}</option>
                                       ))}
                                    </select>
                                 </div>

                                 {newBoxLocationType === 'Floor' && (
                                    <div className="grid grid-cols-2 gap-3">
                                       <div>
                                          <label className="text-[10px] font-bold uppercase tracking-wider text-brand-secondary mb-1 block">Pos X (Lateral)</label>
                                          <input 
                                             type="number" 
                                             step="0.5" 
                                             required
                                             value={newBoxX} 
                                             onChange={e => setNewBoxX(e.target.value)} 
                                             className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm font-semibold focus:outline-brand-primary"
                                          />
                                       </div>
                                       <div>
                                          <label className="text-[10px] font-bold uppercase tracking-wider text-brand-secondary mb-1 block">Pos Z (Depth)</label>
                                          <input 
                                             type="number" 
                                             step="0.5" 
                                             required
                                             value={newBoxZ} 
                                             onChange={e => setNewBoxZ(e.target.value)} 
                                             className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm font-semibold focus:outline-brand-primary"
                                          />
                                       </div>
                                    </div>
                                 )}

                                 {newBoxLocationType === 'Rack' && (() => {
                                    const whObj = warehouses.find(w => w.id === newBoxWarehouseId);
                                    const whRacks = whObj?.racks || [];
                                    const activeRackObj = whRacks.find((r: any) => String(r.label) === String(newBoxRackLabel)) || whRacks[0];
                                    const activeRackSlots = activeRackObj?.slots || 3;
                                    
                                    return (
                                       <div className="space-y-3">
                                          <div>
                                             <label className="text-[10px] font-bold uppercase tracking-wider text-brand-secondary mb-1 block">Aisle / Rack</label>
                                             {whRacks.length === 0 ? (
                                                <p className="text-xs text-red-500 font-semibold mt-1">No racks defined in this warehouse.</p>
                                             ) : (
                                                <select 
                                                   value={newBoxRackLabel || whRacks[0]?.label || ''} 
                                                   onChange={e => setNewBoxRackLabel(e.target.value)}
                                                   className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm font-semibold focus:outline-brand-primary"
                                                >
                                                   {whRacks.map((r: any) => (
                                                      <option key={r.id} value={r.label}>{r.label} ({r.type === 'Box' ? 'Rolling Box Rack' : 'Pallet Rack'})</option>
                                                   ))}
                                                </select>
                                             )}
                                          </div>

                                          {activeRackObj && (
                                             <div className="grid grid-cols-3 gap-3">
                                                <div>
                                                   <label className="text-[10px] font-bold uppercase tracking-wider text-brand-secondary mb-1 block">Bay</label>
                                                   <select 
                                                      value={newBoxBay} 
                                                      onChange={e => setNewBoxBay(e.target.value)}
                                                      className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm font-semibold focus:outline-brand-primary"
                                                   >
                                                      {Array.from({ length: activeRackObj.bays || 1 }).map((_, idx) => (
                                                         <option key={idx} value={idx}>Bay {idx + 1}</option>
                                                      ))}
                                                   </select>
                                                </div>
                                                
                                                <div>
                                                   <label className="text-[10px] font-bold uppercase tracking-wider text-brand-secondary mb-1 block">Level</label>
                                                   <select 
                                                      value={newBoxLevel} 
                                                      onChange={e => setNewBoxLevel(e.target.value)}
                                                      className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm font-semibold focus:outline-brand-primary"
                                                   >
                                                      {Array.from({ length: activeRackObj.levels || 1 }).map((_, idx) => (
                                                         <option key={idx} value={idx + 1}>Level {idx + 1}</option>
                                                      ))}
                                                   </select>
                                                </div>

                                                <div>
                                                   <label className="text-[10px] font-bold uppercase tracking-wider text-brand-secondary mb-1 block">Slot</label>
                                                   <select 
                                                      value={newBoxSlot} 
                                                      onChange={e => setNewBoxSlot(e.target.value)}
                                                      className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm font-semibold focus:outline-brand-primary"
                                                   >
                                                      <option value="-1">Slot 1</option>
                                                      <option value="0">Slot 2</option>
                                                      {activeRackSlots === 3 && <option value="1">Slot 3</option>}
                                                   </select>
                                                </div>
                                             </div>
                                          )}
                                       </div>
                                    );
                                 })()}
                              </div>
                           )}
                        </div>

                        {/* Right Column: Box Contents (Manifest) & Product Selector */}
                        <div className="lg:col-span-7 space-y-5">
                           {/* Box Contents (Multiple Products Supported) */}
                           <div className="space-y-4">
                              <label className="text-[10px] font-bold uppercase tracking-wider text-brand-secondary block">Box Contents (Products & Manifest)</label>
                              
                              <div className="space-y-3">
                                 {boxProducts.map((bp: any) => {
                                    const sizesToDisplay = SIZES.filter(size => (bp.product?.sizeSpread?.[size] || 0) > 0);
                                    const displaySizes = sizesToDisplay.length > 0 ? sizesToDisplay : SIZES;
                                    return (
                                       <div key={bp.productId} className="border border-brand-border rounded-xl p-4 bg-neutral-50/50 space-y-3 relative animate-in fade-in">
                                          <div className="flex justify-between items-center gap-4">
                                             <div className="flex gap-2.5 items-center min-w-0">
                                                {bp.product.images?.[0] ? (
                                                   <img src={bp.product.images[0]} alt="Product" className="w-10 h-10 object-cover rounded-lg border border-brand-border bg-white shrink-0" />
                                                ) : (
                                                   <div className="w-10 h-10 bg-neutral-100 border border-brand-border rounded-lg flex items-center justify-center shrink-0">
                                                      <Boxes size={18} className="text-neutral-400" />
                                                   </div>
                                                )}
                                                <div className="min-w-0">
                                                   <h4 className="text-xs font-bold text-brand-primary truncate leading-snug">{bp.product.title}</h4>
                                                   <p className="text-[9px] font-bold text-brand-secondary uppercase mt-0.5">{getProductDescriptor(bp.product)}</p>
                                                </div>
                                             </div>
                                             
                                             {boxProducts.length > 1 && (
                                                <button 
                                                   type="button" 
                                                   onClick={() => {
                                                      setBoxProducts(prev => prev.filter(item => item.productId !== bp.productId));
                                                   }}
                                                   className="text-[10px] font-bold uppercase tracking-wider text-red-600 hover:text-red-800 transition-colors shrink-0"
                                                >
                                                   Remove
                                                </button>
                                             )}
                                          </div>
                                          
                                          <div className="grid grid-cols-4 sm:grid-cols-5 gap-2.5">
                                             {displaySizes.map(size => {
                                                const maxQty = bp.product?.sizeSpread?.[size] || 0;
                                                return (
                                                   <div key={size} className="grid grid-rows-[1fr_auto] border border-brand-border shadow-sm rounded-xl overflow-hidden focus-within:border-black focus-within:ring-1 focus-within:ring-black transition-all bg-white group">
                                                      <div className="bg-neutral-100/65 p-1 flex items-center justify-center min-h-[26px] border-b border-brand-border group-focus-within:bg-neutral-100 transition-colors">
                                                         <span className="text-[9px] font-bold uppercase tracking-wider text-brand-secondary leading-none text-center">{size}</span>
                                                      </div>
                                                      <div className="bg-white flex flex-col items-center justify-center py-1.5 h-full gap-0.5">
                                                         <input 
                                                            type="number" 
                                                            min="0"
                                                            max={maxQty || undefined}
                                                            placeholder="0"
                                                            value={bp.quantities[size] === 0 ? '' : (bp.quantities[size] || '')}
                                                            onChange={e => {
                                                               let val = parseInt(e.target.value) || 0;
                                                               if (maxQty > 0 && val > maxQty) val = maxQty;
                                                               if (val < 0) val = 0;
                                                               setBoxProducts(prev => prev.map(item => {
                                                                  if (item.productId === bp.productId) {
                                                                     return {
                                                                        ...item,
                                                                        quantities: {
                                                                           ...item.quantities,
                                                                           [size]: val
                                                                        }
                                                                     };
                                                                  }
                                                                  return item;
                                                               }));
                                                            }}
                                                            className="w-full bg-transparent px-2 text-md font-black text-center focus:outline-none placeholder:text-gray-200"
                                                         />
                                                         {maxQty > 0 && (
                                                            <span className="text-[8px] bg-blue-50 border border-blue-200 px-1 py-0.5 rounded text-blue-700 font-bold uppercase tracking-widest leading-none scale-90">
                                                               Max {maxQty}
                                                            </span>
                                                         )}
                                                      </div>
                                                   </div>
                                                );
                                             })}
                                          </div>
                                       </div>
                                    );
                                 })}
                              </div>
                           </div>

                           {/* Add Product Selector */}
                           <div className="bg-neutral-50 p-4 rounded-xl border border-brand-border/60">
                              <label className="text-[10px] font-bold uppercase tracking-wider text-brand-secondary mb-1.5 block">Add another product to this box</label>
                              <select 
                                 value=""
                                 onChange={e => {
                                    const prodId = e.target.value;
                                    if (!prodId) return;
                                    const prod = products.find(p => p.id === prodId);
                                    if (!prod) return;
                                    
                                    const alreadyInBox = boxProducts.some(bp => 
                                        bp.productId === prod.id || 
                                        bp.product?.id === prod.id
                                     );
                                    if (alreadyInBox) return alert("Product is already in this box.");
                                    
                                    setBoxProducts(prev => [
                                       ...prev,
                                       {
                                          productId: prod.id,
                                          product: prod,
                                          quantities: {}
                                       }
                                    ]);
                                 }}
                                 className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm font-semibold focus:outline-brand-primary"
                              >
                                 <option value="">-- Choose Product to Add --</option>
                                 {products
                                    .filter(p => !isProductFullyAllocated(p) && !boxProducts.some(bp => 
                                        bp.productId === p.id || 
                                        bp.product?.id === p.id
                                     ))
                                    .map(p => (
                                       <option key={p.id} value={p.id}>{p.title} ({getProductDescriptor(p)})</option>
                                    ))
                                 }
                              </select>
                           </div>
                        </div>

                     </div>
                  </div>

                  {/* Fixed Footer Buttons */}
                  <div className="flex gap-3 justify-end pt-4 border-t border-brand-border shrink-0 w-full bg-white">
                      {editingBoxPalletId && (
                         <button
                            type="button"
                            disabled={isSubmittingBox}
                            onClick={handleDeleteBoxPayload}
                            className="mr-auto px-4 py-2 bg-red-50 border border-red-200 text-red-600 rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-red-100 transition-colors disabled:opacity-50"
                         >
                            Delete Box
                         </button>
                      )}
                      <button 
                         type="button" 
                         onClick={() => setIsCreatingBox(false)}
                         className="px-4 py-2 border border-brand-border text-brand-secondary rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-neutral-50 transition-colors"
                      >
                         Cancel
                      </button>
                      <button 
                         type="submit" 
                         disabled={isSubmittingBox || (newBoxLocationType === 'Rack' && !newBoxRackLabel)}
                         className="bg-brand-primary text-white px-5 py-2 rounded-lg text-xs font-bold uppercase tracking-widest shadow-sm hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                         {isSubmittingBox ? (
                            <>
                               <Loader2 size={14} className="animate-spin" /> {editingBoxPalletId ? 'Saving...' : 'Creating...'}
                            </>
                         ) : (
                            editingBoxPalletId ? 'Save Changes' : 'Create Box'
                         )}
                      </button>
                  </div>
               </form>
            </div>
         </div>
      )}

      {/* QR Code Upload Modal */}
      {qrSessionId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in zoom-in-95 fill-mode-forwards duration-200">
           <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-8 text-center relative border border-brand-border">
              <button 
                onClick={() => setQrSessionId(null)} 
                className="absolute top-4 right-4 p-2 text-brand-secondary hover:text-black hover:bg-neutral-100 rounded-full transition-colors"
                title="Cancel"
              >
                 <X size={20} />
              </button>
              
              <div className="w-16 h-16 bg-neutral-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
                 <QrCode size={28} className="text-brand-primary" />
              </div>
              
              <h2 className="font-serif text-3xl font-bold tracking-tight text-brand-primary mb-3">Scan to Sync</h2>
              <p className="text-xs text-brand-secondary mb-8 leading-relaxed px-4">
                 Point your phone's camera at this code. Any photo you take will magically appear here instantly.
              </p>
              
              <div className="bg-white p-4 rounded-xl shadow-inner border border-brand-border inline-block mb-8 object-cover">
                 <img 
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(`${window.location.protocol}//${window.location.host}/mobile-upload/${qrSessionId}`)}`} 
                    alt="Scan to upload via phone"
                    className="w-48 h-48 opacity-90 mix-blend-multiply rounded-md"
                 />
              </div>
              
              <div className="flex items-center justify-center gap-3 text-[10px] font-bold uppercase tracking-widest text-brand-primary animate-pulse py-2 bg-neutral-50 rounded-lg">
                <Loader2 size={14} className="animate-spin" /> Waiting for device...
              </div>
           </div>
        </div>
      )}

      {/* Expanded Image Lightbox Modal */}
      {expandedImage && (
        <div 
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 md:p-6 bg-black/30 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setExpandedImage(null)}
        >
           <button 
             onClick={() => setExpandedImage(null)} 
             className="absolute top-6 right-6 p-2 text-white/70 hover:text-white bg-black/20 hover:bg-black/40 rounded-full transition-colors z-10"
             title="Close"
           >
              <X size={24} />
           </button>
           <div 
             className="relative max-w-[95vw] max-h-[85vh] rounded-[1rem] overflow-hidden cursor-crosshair shadow-[0_30px_100px_-20px_rgba(0,0,0,0.6)] animate-in zoom-in-95 duration-200 flex items-center justify-center bg-black/5"
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
              <img 
                 src={expandedImage} 
                 alt="Expanded view"
                 className="max-w-[95vw] max-h-[85vh] object-contain scale-100 hover:scale-[1.8] transition-transform duration-300 ease-out"
              />
           </div>
        </div>
      )}

      {printingBox && createPortal(
         <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-8 print:p-0 animate-in fade-in print-thermal-mode" onClick={() => setPrintingBox(null)}>
            <div className="bg-brand-bg rounded-2xl shadow-2xl max-w-xl w-full flex flex-col overflow-hidden relative print:shadow-none print:border-none print:m-0 print:bg-white print:w-full print:h-full animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
               <div className="p-6 border-b border-brand-border bg-white flex justify-between items-center shrink-0 print:hidden">
                   <div>
                       <h2 className="font-serif text-2xl tracking-tight font-bold text-brand-primary">
                            Box QR Label Preview
                       </h2>
                       <p className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary">Ready for printing</p>
                   </div>
                   <div className="flex gap-3">
                       <button onClick={() => window.print()} className="bg-brand-primary text-white px-6 py-2.5 rounded-pill font-bold uppercase tracking-widest text-xs flex items-center gap-2 shadow-md hover:bg-black transition-all">
                           <Printer size={16} /> Print Label
                       </button>
                       <button onClick={() => setPrintingBox(null)} className="border border-brand-border bg-white text-brand-primary px-4 py-2.5 rounded-pill font-bold uppercase tracking-widest text-xs hover:bg-brand-bg transition-colors">
                           Close
                       </button>
                   </div>
               </div>
               
               <div className="flex-1 p-8 overflow-y-auto flex items-start justify-center bg-gray-200 print:p-0 print:bg-white custom-scrollbar print-viewport">
                   <div className="print-page-wrapper">
                       <div className="bg-white shadow-xl p-6 border-4 border-black print-label-container my-auto print:shadow-none print:border-none print:m-0 overflow-hidden flex flex-col" style={{ width: '6in', height: '4in', boxSizing: 'border-box' }}>
                           <div className="flex justify-between items-start mb-4 border-b-4 border-black pb-3 shrink-0">
                               <div>
                                   <img src="/logo.png" alt="WOVN" className="h-8 w-auto mb-4 grayscale" style={{ filter: 'grayscale(1)' }} />
                                   <h1 className="font-sans text-3xl font-black uppercase tracking-tighter leading-none">
                                        Box {printingBox.boxNumber !== undefined ? printingBox.boxNumber : 1}
                                   </h1>
                                   <p className="text-[10px] font-bold font-sans mt-1 text-gray-500 uppercase tracking-widest">
                                        {printingBox.zone 
                                           ? (printingBox.zone === 'Floor' 
                                              ? `FLOOR ZONE` 
                                              : `${printingBox.zone} | B${printingBox.rackSpecs?.bay !== undefined ? printingBox.rackSpecs.bay + 1 : 1} L${printingBox.rackSpecs?.level !== undefined ? printingBox.rackSpecs.level + 1 : 1} S${printingBox.rackSpecs?.slot === -1 ? '1' : printingBox.rackSpecs?.slot === 0 ? '2' : '3'}`
                                             )
                                           : 'STAGING AREA'
                                        }
                                   </p>
                               </div>
                               <div className="text-right">
                                   <div className="text-xs font-black uppercase tracking-widest text-black/60 truncate max-w-[200px]" title={printingBox.name}>
                                       {printingBox.name}
                                   </div>
                                   <p className="text-[8px] font-bold uppercase tracking-widest bg-black text-white px-2 py-0.5 mt-1 inline-block">
                                       SYS_ID: {printingBox.id.replace('pal_', '')}
                                   </p>
                               </div>
                           </div>
                           
                           <div className="flex-1 flex min-h-0">
                               <div className="flex-1 min-w-0 pr-4 overflow-hidden flex flex-col">
                                   <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">Manifest</div>
                                   <div className="space-y-2 overflow-y-auto flex-1 pr-2 custom-scrollbar">
                                        {(() => {
                                             const items = printingBox.boxes?.[0]?.items || [];
                                             const grouped: Record<string, { name: string; sku: string; sizes: { size: string; quantity: number }[] }> = {};
                                             
                                             items.forEach((item: any) => {
                                                 // Match item with catalog product to extract color
                                                 const matchedProduct = products.find((prod: any) => {
                                                     if (item.productId) {
                                                         return prod.id === item.productId;
                                                     }
                                                     const itemSku = item.sku && item.sku !== 'No SKU' ? item.sku : '';
                                                     const prodSku = prod.sku && prod.sku !== 'No SKU' ? prod.sku : '';
                                                     if (itemSku && prodSku) {
                                                         return itemSku.toLowerCase() === prodSku.toLowerCase();
                                                     }
                                                     if (!itemSku && !prodSku) {
                                                         return prod.title && prod.title.toLowerCase() === item.name.toLowerCase();
                                                     }
                                                     return false;
                                                 });
                                                 
                                                 const colorVal = matchedProduct 
                                                    ? (Array.isArray(matchedProduct.colors) ? matchedProduct.colors.join(', ') : (matchedProduct.colors || ''))
                                                    : '';
                                                 
                                                 const key = matchedProduct?.id ? `${matchedProduct.id}_${colorVal}` : `${item.name}_${colorVal}`;
                                                 if (!grouped[key]) {
                                                     const displayName = colorVal ? `${item.name} • ${colorVal.toUpperCase()}` : item.name;
                                                     grouped[key] = { name: displayName, sku: item.sku || matchedProduct?.sku || '', sizes: [] };
                                                 }
                                                 grouped[key].sizes.push({ size: item.size, quantity: item.quantity });
                                             });
                                             
                                             return Object.entries(grouped).map(([key, group]: [string, any]) => {
                                                 const totalQty = group.sizes.reduce((sum: number, s: any) => sum + s.quantity, 0);
                                                 return (
                                                     <div key={key} className="border-b border-black/20 pb-2 last:border-0">
                                                         <div className="flex justify-between items-baseline mb-1">
                                                             <p className="font-bold text-[11px] truncate text-black flex-1 pr-2">{group.name}</p>
                                                             <span className="text-[10px] font-black text-black shrink-0">Total: {totalQty}</span>
                                                         </div>
                                                         {group.sku && <p className="text-[8px] font-bold text-gray-500 mb-1.5">{group.sku}</p>}
                                                         <div className="flex flex-wrap gap-1">
                                                             {group.sizes.map((s: any, idx: number) => (
                                                                 <span key={idx} className="text-[9px] border border-black text-black font-black px-1.5 py-0.5 rounded leading-none">
                                                                     {s.size}: {s.quantity}
                                                                 </span>
                                                             ))}
                                                         </div>
                                                     </div>
                                                 );
                                             });
                                         })()}
                                        {(!printingBox.boxes?.[0]?.items || printingBox.boxes[0].items.length === 0) && (
                                            <div className="p-4 border-2 border-dashed border-black/30 text-center font-bold uppercase text-xs">Empty Box</div>
                                        )}
                                   </div>
                               </div>
                               
                               <div className="shrink-0 flex flex-col items-center justify-between border-l-4 border-black pl-4 w-36">
                                   <div className="flex flex-col items-center">
                                       <div className="p-1 border-4 border-black bg-white mb-1 shrink-0">
                                           <QRCode value={`${window.location.hostname === 'localhost' ? 'https://print-shop-os.vercel.app' : window.location.origin}/inventory/scan?p=${printingBox.id}&b=${printingBox.boxes?.[0]?.id || ''}`} size={90} level="L" />
                                       </div>
                                       <p className="text-[7px] font-black uppercase tracking-widest text-center mt-1 w-full text-black">Scan to Subtract Items</p>
                                   </div>
                                   <div className="w-full opacity-60">
                                       <div className="text-[6px] font-mono leading-tight">
                                           DATE: {new Date().toLocaleDateString()}<br/>
                                           TIME: {new Date().toLocaleTimeString()}<br/>
                                           BOX_ID: {printingBox.boxes?.[0]?.id || 'N/A'}
                                       </div>
                                   </div>
                               </div>
                           </div>
                       </div>
                   </div>
               </div>
            </div>
            
            <style>{`
               @page { 
                  margin: 0; 
                  size: 4in 6in; 
               }
               @media print {
                  body * { visibility: hidden !important; }
                  #root { display: none !important; }
                  
                  /* UNLOCK MODAL CONSTRAINTS FOR PRINTING */
                  .print-thermal-mode {
                      position: static !important;
                      width: 100% !important;
                      height: auto !important;
                      min-height: 100vh !important;
                      max-height: none !important;
                      overflow: visible !important;
                      display: block !important;
                  }
                  .print-thermal-mode > div,
                  .print-thermal-mode .print-viewport,
                  .print-thermal-mode .print-viewport > div {
                      position: static !important;
                      height: auto !important;
                      max-height: none !important;
                      overflow: visible !important;
                      display: block !important;
                  }
                  .print-thermal-mode .print-page-wrapper, .print-thermal-mode .print-page-wrapper * { visibility: visible !important; }
                  
                  .print-thermal-mode .print-page-wrapper {
                      display: block !important;
                      position: relative !important;
                      width: 4in !important;
                      height: 6in !important;
                      page-break-after: always !important;
                      page-break-inside: avoid !important;
                      margin: 0 !important;
                      padding: 0 !important;
                      background: white !important;
                  }
                  .print-thermal-mode .print-label-container {
                      position: absolute !important;
                      left: 3.9in !important;
                      top: 0.1in !important;
                      width: 5.8in !important;
                      height: 3.8in !important;
                      padding: 0.3in !important;
                      margin: 0 !important;
                      border: none !important;
                      box-sizing: border-box !important;
                      box-shadow: none !important;
                      transform: rotate(90deg);
                      transform-origin: top left;
                  }
               }
            `}</style>
         </div>,
         document.body
      )}

    </div>
  );
}
