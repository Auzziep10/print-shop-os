import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { db } from '../../lib/firebase';
import { collection, query, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { Package, Box as BoxIcon, ArrowRight, CheckCircle2, QrCode } from 'lucide-react';

export function InventoryScan() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const palletId = searchParams.get('p') || searchParams.get('id'); // 'id' from older QR format
  const boxId = searchParams.get('b');

  const [pallets, setPallets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [targetPalletId, setTargetPalletId] = useState<string>('');
  const [isMoving, setIsMoving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');

  const [newBoxName, setNewBoxName] = useState('');
  const [isCreatingBox, setIsCreatingBox] = useState(false);

  const [isAddingItem, setIsAddingItem] = useState(false);
  const [newItemForm, setNewItemForm] = useState({ sku: '', name: '', size: '', quantity: 1 });

  useEffect(() => {
     const q = query(collection(db, 'pallets'));
     const unsubscribe = onSnapshot(q, (snapshot) => {
         const data = snapshot.docs.map(d => d.data());
         setPallets(data);
         setLoading(false);
     });
     return () => unsubscribe();
  }, []);

  if (loading) {
      return <div className="min-h-screen flex items-center justify-center bg-brand-bg font-serif text-brand-secondary">Loading Scanner Payload...</div>;
  }

  const currentPallet = pallets.find(p => p.id === palletId);
  const currentBox = currentPallet?.boxes?.find((b: any) => b.id === boxId);

  // If we only have pallet ID but no box ID (e.g. from the Master Pallet Tag QR code)
  if (!boxId && currentPallet) {
      const handleCreateBox = async () => {
          let finalName = newBoxName.trim();
          if (!finalName) {
              let maxNum = 0;
              currentPallet.boxes?.forEach((b: any) => {
                  const match = b.name.match(/(?:Box\s*)?(\d+)$/i);
                  if (match) {
                      const num = parseInt(match[1]);
                      if (num > maxNum) maxNum = num;
                  }
              });
              finalName = `Box ${maxNum + 1}`;
          }

          const newBox = {
              id: `box_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
              name: finalName,
              items: []
          };

          try {
              setIsCreatingBox(true);
              const updatedBoxes = [...(currentPallet.boxes || []), newBox];
              await setDoc(doc(db, 'pallets', currentPallet.id), { ...currentPallet, boxes: updatedBoxes });
              setNewBoxName('');
              setIsCreatingBox(false);
              // Teleport directly to the newly created Box via URL params!
              setSearchParams({ p: currentPallet.id, b: newBox.id });
          } catch (err) {
              console.error(err);
              setIsCreatingBox(false);
          }
      };

      return (
          <div className="min-h-screen bg-brand-bg p-4 flex flex-col items-center justify-center">
              <Package size={64} className="mb-6 opacity-80" />
              <h1 className="font-serif text-4xl font-bold tracking-tight mb-2">{currentPallet.name}</h1>
              <p className="text-sm font-bold uppercase tracking-widest text-brand-secondary mb-8">Pallet Record</p>
              
              <div className="bg-white p-6 rounded-2xl shadow-lg border border-brand-border w-full max-w-md space-y-4 mb-6">
                  <div className="flex justify-between items-center pb-4 border-b">
                      <span className="text-xs uppercase font-bold tracking-widest text-brand-secondary">Units Logged</span>
                      <span className="font-black text-xl">{currentPallet.boxes?.length || 0} Boxes</span>
                  </div>
                  
                  <div className="pt-2 space-y-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary">Register New Box</p>
                      <input 
                          type="text"
                          placeholder="Box Identifier (Auto-generates if empty)"
                          value={newBoxName}
                          onChange={e => setNewBoxName(e.target.value)}
                          className="w-full h-14 bg-brand-bg border border-brand-border rounded-xl px-4 font-bold text-brand-primary outline-none focus:border-brand-primary"
                      />
                      <button 
                          onClick={handleCreateBox}
                          disabled={isCreatingBox}
                          className="w-full bg-brand-primary text-white py-4 rounded-xl font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-2 shadow-md"
                      >
                          {isCreatingBox ? 'Registering...' : 'Add Box To Pallet'}
                      </button>
                  </div>
              </div>
              
              <button onClick={() => navigate('/inventory')} className="text-[10px] uppercase font-bold tracking-widest text-brand-secondary hover:text-black">Return to Dashboard</button>
          </div>
      );
  }

  if (!currentPallet || !currentBox) {
      return (
          <div className="min-h-screen bg-brand-bg flex flex-col items-center justify-center p-6 text-center">
              <QrCode size={48} className="mb-6 opacity-30" />
              <h1 className="font-serif text-2xl font-bold tracking-tight mb-2 text-brand-primary">Record Not Found</h1>
              <p className="text-sm font-bold text-brand-secondary opacity-70">This payload may have been entirely deleted from the master manifest.</p>
          </div>
      );
  }

  const handleMoveBox = async () => {
      if (!targetPalletId) return;
      setIsMoving(true);

      const targetPallet = pallets.find(p => p.id === targetPalletId);
      if (!targetPallet) {
          setIsMoving(false);
          return;
      }

      // Extract numeric suffix from existing boxes in TARGET pallet to find the next available Box Number
      let maxNum = 0;
      targetPallet.boxes?.forEach((b: any) => {
          const match = b.name.match(/(?:Box\s*)?(\d+)$/i); // Matches "1", "Box 1", "Box1"
          if (match) {
              const num = parseInt(match[1]);
              if (num > maxNum) maxNum = num;
          }
      });
      
      const nextBoxNum = maxNum + 1;
      let newBoxName = currentBox.name;
      
      // If the target pallet already has a box with this exact name, auto-generate a new one
      const nameExists = targetPallet.boxes?.some((b:any) => b.name === newBoxName);
      if (nameExists) {
          const prefixMatch = newBoxName.match(/^(.*?)\s*\d+$/);
          const prefix = prefixMatch ? prefixMatch[1].trim() : 'Box';
          newBoxName = `${prefix} ${nextBoxNum}`;
      }

      const updatedBox = { ...currentBox, name: newBoxName };

      const updatedSourceBoxes = currentPallet.boxes.filter((b:any) => b.id !== boxId);
      const updatedTargetBoxes = [...(targetPallet.boxes || []), updatedBox];

      try {
          await setDoc(doc(db, 'pallets', currentPallet.id), { ...currentPallet, boxes: updatedSourceBoxes });
          await setDoc(doc(db, 'pallets', targetPallet.id), { ...targetPallet, boxes: updatedTargetBoxes });
          setSuccessMsg(`Box secured on ${targetPallet.name} as "${newBoxName}"`);
      } catch (err) {
          console.error(err);
      }
      setIsMoving(false);
  };

  const handleUpdateBoxName = async (newName: string) => {
      if (!newName.trim() || !currentPallet || !currentBox) return;
      const updatedBoxes = currentPallet.boxes.map((b:any) => b.id === boxId ? { ...b, name: newName } : b);
      try {
          await setDoc(doc(db, 'pallets', currentPallet.id), { ...currentPallet, boxes: updatedBoxes });
          setIsEditingName(false);
      } catch (err) {
          console.error(err);
      }
  };

  const handleUpdateItemQuantity = async (itemId: string, newQuantity: number) => {
      if (newQuantity < 1 || !currentPallet || !currentBox) return;
      const updatedBoxes = currentPallet.boxes.map((b:any) => {
          if (b.id === boxId) {
              return { ...b, items: b.items.map((i:any) => i.id === itemId ? { ...i, quantity: newQuantity } : i) };
          }
          return b;
      });
      try {
          await setDoc(doc(db, 'pallets', currentPallet.id), { ...currentPallet, boxes: updatedBoxes });
      } catch (err) {
          console.error(err);
      }
  };

  const handleCreateLineItem = async () => {
      if (!newItemForm.name || !currentBox || !currentPallet) return;
      const newItem = {
          id: `itm_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          sku: newItemForm.sku,
          name: newItemForm.name,
          size: newItemForm.size,
          quantity: newItemForm.quantity,
          photoUrl: ''
      };

      const updatedBoxes = currentPallet.boxes.map((b:any) => {
          if (b.id === boxId) {
              return { ...b, items: [...(b.items || []), newItem] };
          }
          return b;
      });

      try {
          await setDoc(doc(db, 'pallets', currentPallet.id), { ...currentPallet, boxes: updatedBoxes });
          setIsAddingItem(false);
          setNewItemForm({ sku: '', name: '', size: '', quantity: 1 });
      } catch (err) {
          console.error(err);
      }
  };

  const lineItemsCount = currentBox.items?.reduce((s:number, i:any) => s + i.quantity, 0) || 0;

  if (successMsg) {
      return (
          <div className="min-h-screen bg-brand-bg flex flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in-95 duration-500">
              <div className="bg-emerald-50 text-emerald-600 p-6 rounded-full mb-6 ring-4 ring-emerald-500/20">
                  <CheckCircle2 size={64} />
              </div>
              <h1 className="font-serif text-3xl font-bold tracking-tight mb-2 text-emerald-900">Transfer Complete</h1>
              <p className="text-sm font-bold uppercase tracking-widest text-emerald-700/70 mb-8">{successMsg}</p>
              
              <button 
                  onClick={() => navigate('/inventory')}
                  className="bg-black text-white px-8 py-4 rounded-xl font-bold uppercase tracking-widest text-xs shadow-lg hover:scale-105 transition-all"
              >
                  Close Mobile Scanner
              </button>
          </div>
      );
  }

  return (
      <div className="min-h-screen bg-[#f8f9fa] p-4 flex flex-col">
          <div className="bg-black text-white p-6 rounded-2xl shadow-xl mb-6 relative overflow-hidden">
             <div className="absolute -right-6 -top-6 opacity-10">
                 <BoxIcon size={160} />
             </div>
             <p className="text-[10px] uppercase font-bold tracking-widest opacity-70 mb-1">Scanned Payload</p>
             
             {isEditingName ? (
                 <input 
                     type="text" 
                     autoFocus
                     value={editNameValue}
                     onChange={e => setEditNameValue(e.target.value)}
                     onBlur={() => handleUpdateBoxName(editNameValue)}
                     onKeyDown={e => e.key === 'Enter' && handleUpdateBoxName(editNameValue)}
                     className="w-full font-serif text-3xl font-bold tracking-tight mb-4 text-black px-2 py-1 rounded relative z-10 outline-none"
                 />
             ) : (
                 <h1 
                     className="font-serif text-4xl font-bold tracking-tight mb-4 relative z-10 cursor-pointer hover:opacity-80"
                     onClick={() => { setEditNameValue(currentBox.name); setIsEditingName(true); }}
                 >
                     {currentBox.name}
                 </h1>
             )}
             
             <div className="flex justify-between items-end relative z-10">
                 <div className="bg-white/20 px-3 py-1.5 rounded-lg backdrop-blur-sm border border-white/10">
                     <p className="text-[10px] font-bold uppercase tracking-widest opacity-80 mb-0.5">Origin Node</p>
                     <p className="text-sm font-bold">{currentPallet.name}</p>
                 </div>
                 <div className="text-right">
                     <p className="text-[10px] font-bold uppercase tracking-widest opacity-70 mb-0.5">Total Quantity</p>
                     <p className="text-2xl font-black font-sans leading-none">{lineItemsCount}</p>
                 </div>
             </div>
          </div>

          <div className="flex-1 space-y-6">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-brand-border">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-brand-secondary flex items-center gap-2 mb-4">
                      <ArrowRight size={16} /> Relocate Payload
                  </h2>
                  <p className="text-sm font-medium mb-4">Select a destination node to rapidly transfer this box and its entire manifest natively.</p>
                  
                  <div className="space-y-4">
                      <select 
                          value={targetPalletId}
                          onChange={(e) => setTargetPalletId(e.target.value)}
                          className="w-full bg-brand-bg border border-brand-border h-14 rounded-xl px-4 font-bold text-brand-primary outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 transition-all appearance-none"
                      >
                          <option value="">-- Choose Target Pallet --</option>
                          {pallets.filter(p => p.id !== currentPallet.id).map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                      </select>
                      
                      <button 
                          disabled={!targetPalletId || isMoving}
                          onClick={handleMoveBox}
                          className={`w-full h-14 rounded-xl font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-2 transition-all ${targetPalletId ? 'bg-brand-primary text-white shadow-md hover:bg-black' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
                      >
                          {isMoving ? 'Transferring Node...' : 'Confirm Transfer'}
                      </button>
                  </div>
              </div>

              {/* Add Item Registration Flow */}
              {!isAddingItem ? (
                  <button 
                      onClick={() => setIsAddingItem(true)}
                      className="w-full bg-white border-2 border-brand-primary text-brand-primary h-14 rounded-xl font-bold uppercase tracking-widest text-xs shadow-sm active:bg-brand-bg transition-all"
                  >
                      + Register Line Item
                  </button>
              ) : (
                  <div className="bg-brand-primary p-6 rounded-2xl shadow-xl text-white space-y-4 animate-in slide-in-from-top-4">
                      <h2 className="text-sm font-bold uppercase tracking-widest mb-4">New Item Entry</h2>
                      
                      <div>
                          <label className="block text-[10px] font-bold uppercase tracking-widest opacity-70 mb-1">Garment / Item Name</label>
                          <input type="text" value={newItemForm.name} onChange={e => setNewItemForm({...newItemForm, name: e.target.value})} className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 placeholder:text-white/30 outline-none focus:bg-white/20" placeholder="e.g. Heavyweight Hoodie" />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="block text-[10px] font-bold uppercase tracking-widest opacity-70 mb-1">SKU (Opt)</label>
                              <input type="text" value={newItemForm.sku} onChange={e => setNewItemForm({...newItemForm, sku: e.target.value})} className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 placeholder:text-white/30 outline-none focus:bg-white/20" placeholder="TST-HGHT" />
                          </div>
                          <div>
                              <label className="block text-[10px] font-bold uppercase tracking-widest opacity-70 mb-1">Size Option</label>
                              <input type="text" value={newItemForm.size} onChange={e => setNewItemForm({...newItemForm, size: e.target.value})} className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 placeholder:text-white/30 outline-none focus:bg-white/20" placeholder="XL" />
                          </div>
                      </div>
                      
                      <div>
                          <label className="block text-[10px] font-bold uppercase tracking-widest opacity-70 mb-1">Physical Quantity</label>
                          <div className="flex items-center gap-3 bg-white/10 rounded-xl p-1.5 border border-white/20">
                              <button onClick={() => setNewItemForm({...newItemForm, quantity: Math.max(1, newItemForm.quantity - 1)})} className="w-12 h-10 rounded-lg bg-black/20 font-black text-xl flex items-center justify-center active:bg-black/40">-</button>
                              <span className="flex-1 text-center font-black text-xl">{newItemForm.quantity}</span>
                              <button onClick={() => setNewItemForm({...newItemForm, quantity: newItemForm.quantity + 1})} className="w-12 h-10 rounded-lg bg-white/20 font-black text-xl flex items-center justify-center active:bg-white/40">+</button>
                          </div>
                      </div>
                      
                      <div className="flex gap-3 pt-4">
                          <button onClick={() => setIsAddingItem(false)} className="flex-1 py-4 text-[10px] font-bold uppercase tracking-widest bg-black/20 rounded-xl active:bg-black/40">Cancel</button>
                          <button disabled={!newItemForm.name} onClick={handleCreateLineItem} className="w-[60%] py-4 text-[10px] font-bold uppercase tracking-widest bg-white text-brand-primary rounded-xl active:bg-gray-200 disabled:opacity-50 text-brand-primary">Log Item</button>
                      </div>
                  </div>
              )}

              {/* Readonly Line Items List just to verify contents */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-brand-border">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-brand-secondary mb-4">Secure Manifest</h2>
                  <div className="space-y-3">
                      {currentBox.items?.map((item: any) => (
                          <div key={item.id} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                              <div className="flex-1">
                                  <p className="font-bold text-sm">{item.name}</p>
                                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mt-1">{item.sku} • {item.size}</p>
                              </div>
                              <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-1 border border-brand-border/50">
                                  <button onClick={() => handleUpdateItemQuantity(item.id, item.quantity - 1)} className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-brand-primary active:bg-white hover:bg-white transition-colors">-</button>
                                  <span className="font-black text-lg w-8 text-center">{item.quantity}</span>
                                  <button onClick={() => handleUpdateItemQuantity(item.id, item.quantity + 1)} className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-brand-primary active:bg-white hover:bg-white transition-colors">+</button>
                              </div>
                          </div>
                      ))}
                      {(!currentBox.items || currentBox.items.length === 0) && (
                          <div className="text-center py-4 text-xs font-bold uppercase tracking-widest text-gray-400">Empty Ghost Box</div>
                      )}
                  </div>
              </div>
          </div>
      </div>
  );
}
