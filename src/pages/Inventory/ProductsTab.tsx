import { useState, useEffect } from 'react';
import { db, storage } from '../../lib/firebase';
import { collection, query, onSnapshot, setDoc, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { Search, Plus, Image as ImageIcon, ChevronLeft, Trash2, Save, X, Upload, QrCode, Loader2 } from 'lucide-react';
import { tokens } from '../../lib/tokens';

const SIZES = ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', 'OSFA'];

export function ProductsTab() {
  const [products, setProducts] = useState<any[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [qrSessionId, setQrSessionId] = useState<string | null>(null);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Form State for editing / creating
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    sku: '',
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
    setFormData({ title: '', description: '', sku: '', colors: '', sizeSpread: {}, images: [] });
    setImageUrlInput('');
    setIsCreating(true);
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
      colors: Array.isArray(product.colors) ? product.colors.join(', ') : (product.colors || ''),
      sizeSpread: parsedSizeSpread,
      images: product.images || []
    });
    setImageUrlInput('');
    setIsCreating(false);
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
      if (isCreating) {
        const newId = `prod_${Date.now()}`;
        await setDoc(doc(db, 'products', newId), {
          ...payload,
          createdAt: new Date().toISOString()
        });
        setIsCreating(false);
      } else if (selectedProduct) {
        await updateDoc(doc(db, 'products', selectedProduct.id), {
          ...payload,
          updatedAt: new Date().toISOString()
        });
      }
      alert('Saved successfully!');
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

  const filteredProducts = products.filter(p => 
    (p.title || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
    (p.sku || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="w-full h-full bg-white rounded-2xl border border-brand-border shadow-sm flex overflow-hidden">
      
      {/* Left List Pane (hides on mobile if detail is open, or just flex-shrink) */}
      <div className={`w-full md:w-1/3 flex flex-col border-r border-brand-border bg-brand-bg transition-all ${(selectedProduct || isCreating) ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-4 border-b border-brand-border bg-white flex flex-col gap-3 shrink-0">
           <div className="flex justify-between items-center">
              <h2 className="font-serif font-bold text-lg text-brand-primary tracking-tight">Product Catalog</h2>
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
                     <div className="w-12 h-12 rounded-lg bg-neutral-100 border border-brand-border shrink-0 overflow-hidden flex items-center justify-center">
                        {p.images && p.images.length > 0 ? (
                           <img src={p.images[0]} alt={p.title} className="w-full h-full object-cover" />
                        ) : (
                           <ImageIcon className="text-brand-secondary opacity-50" size={16} />
                        )}
                     </div>
                     <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-brand-primary text-sm truncate">{p.title || 'Untitled Product'}</h4>
                        <p className="text-[10px] uppercase tracking-widest text-brand-secondary mt-0.5 truncate">{p.sku || 'No SKU'}</p>
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
                    {!isCreating && (
                      <button onClick={() => handleDelete(selectedProduct.id)} className="p-2.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                        <Trash2 size={16} />
                      </button>
                    )}
                    <button onClick={handleSave} className="bg-brand-primary text-white px-4 py-2.5 rounded-lg flex items-center gap-2 text-xs font-bold uppercase tracking-widest shadow-sm hover:scale-[1.02] transition-transform">
                      <Save size={14} /> Save
                    </button>
                 </div>
              </div>

              {/* Form Content */}
              <div className="p-6 max-w-3xl space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                     <div className="col-span-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1 block">Product Title</label>
                        <input type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} placeholder="e.g. Premium Heavyweight Hoodie" className="w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-3 text-sm font-semibold focus:outline-brand-primary" />
                     </div>
                     
                     <div className="col-span-2 md:col-span-1">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1 block">SKU (Optional)</label>
                        <input type="text" value={formData.sku} onChange={e => setFormData({...formData, sku: e.target.value})} placeholder="e.g. WH-1002" className="w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-3 text-sm font-semibold focus:outline-brand-primary" />
                     </div>
                     
                     <div className="col-span-2 md:col-span-1">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1 block">Colors (Comma separated)</label>
                        <input type="text" value={formData.colors} onChange={e => setFormData({...formData, colors: e.target.value})} placeholder="e.g. Black, White, Heather Grey" className="w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-3 text-sm font-semibold focus:outline-brand-primary" />
                     </div>
                     
                     <div className="col-span-2 mt-4 mb-2">
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
                                    className="w-full bg-brand-bg border border-brand-border rounded-lg text-center py-2 text-sm font-semibold focus:outline-brand-primary transition-colors focus:bg-white"
                                 />
                              </div>
                           ))}
                        </div>
                     </div>

                     <div className="col-span-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1 block">Description</label>
                        <textarea rows={4} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Describe the product details, materials, and fit..." className="w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-3 text-sm font-medium focus:outline-brand-primary resize-y"></textarea>
                     </div>
                  </div>

                  <hr className="border-brand-border/50" />

                  {/* Images Section */}
                  <div>
                    <h3 className="font-serif text-lg font-bold text-brand-primary mb-4">Images</h3>
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
                                <button type="button" onClick={(e) => { e.stopPropagation(); handleRemoveImage(i); }} className="absolute top-2 right-2 bg-white/90 text-red-600 p-1.5 rounded-md shadow-sm opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50">
                                   <X size={14} />
                                </button>
                             </div>
                          ))}
                       </div>
                    )}
                  </div>
              </div>
           </div>
         )}
      </div>

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
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in zoom-in-95 fill-mode-forwards duration-200"
          onClick={() => setExpandedImage(null)}
        >
           <button 
             onClick={() => setExpandedImage(null)} 
             className="absolute top-6 right-6 p-3 text-white/70 hover:text-white bg-black/50 hover:bg-black/80 rounded-full transition-colors z-10"
             title="Close"
           >
              <X size={24} />
           </button>
           <div className="relative max-w-5xl w-full h-full max-h-[90vh] flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
              <img 
                 src={expandedImage} 
                 alt="Expanded view"
                 className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
              />
           </div>
        </div>
      )}

    </div>
  );
}
