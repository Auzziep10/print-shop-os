import { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, onSnapshot, setDoc, deleteDoc, doc } from 'firebase/firestore';
import { Plus, Package, Box, ChevronRight, QrCode, Printer, X, Image as ImageIcon, BarChart3, Layers, Tag, Copy } from 'lucide-react';
import QRCode from 'react-qr-code';

interface Item {
    id: string;
    sku: string;
    name: string;
    size: string;
    quantity: number;
    photoUrl: string;
}

interface BoxType {
    id: string;
    name: string;
    items: Item[];
}

interface Pallet {
    id: string;
    name: string;
    createdAt: number;
    boxes: BoxType[];
}

export function PalletsTab() {
  const [pallets, setPallets] = useState<Pallet[]>([]);
  const [activePalletId, setActivePalletId] = useState<string | null>(null);
  const [activeBoxId, setActiveBoxId] = useState<string | null>(null);
  const [isAddingPallet, setIsAddingPallet] = useState(false);
  const [newPalletName, setNewPalletName] = useState('');
  
  const [printingBox, setPrintingBox] = useState<{pallet: Pallet, box: BoxType | null, type: 'box' | 'items' | 'all_boxes' | 'pallet'} | null>(null);

  // Form states
  const [isAddingBox, setIsAddingBox] = useState(false);
  const [newBoxName, setNewBoxName] = useState('');
  
  const [isAddingItem, setIsAddingItem] = useState<{boxId: string} | null>(null);
  const [newItemForm, setNewItemForm] = useState({ sku: '', name: '', size: '', quantity: 1, photoUrl: '' });
  
  const [editingBoxNameMode, setEditingBoxNameMode] = useState(false);
  const [editBoxNameValue, setEditBoxNameValue] = useState('');
  
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editItemForm, setEditItemForm] = useState({ name: '', sku: '', size: '' });
  
  useEffect(() => {
     const q = query(collection(db, 'pallets'));
     const unsubscribe = onSnapshot(q, (snapshot) => {
         const data = snapshot.docs.map(d => d.data() as Pallet).sort((a, b) => b.createdAt - a.createdAt);
         setPallets(data);
         if (!activePalletId && data.length > 0) {
             setActivePalletId(data[0].id);
         }
     });
     return () => unsubscribe();
  }, [activePalletId]);

  const activePallet = pallets.find(p => p.id === activePalletId);

  const handleCreatePallet = async () => {
      if (!newPalletName.trim()) return;
      const newPallet: Pallet = {
          id: `pal_${Date.now()}`,
          name: newPalletName,
          createdAt: Date.now(),
          boxes: []
      };
      await setDoc(doc(db, 'pallets', newPallet.id), newPallet);
      setNewPalletName('');
      setIsAddingPallet(false);
      setActivePalletId(newPallet.id);
  };

  const handleCreateBox = async () => {
      if (!activePallet || !newBoxName.trim()) return;
      const newBox: BoxType = {
          id: `box_${Date.now()}`,
          name: newBoxName,
          items: []
      };
      const updatedPallet = { ...activePallet, boxes: [...activePallet.boxes, newBox] };
      await setDoc(doc(db, 'pallets', activePallet.id), updatedPallet);
      setNewBoxName('');
      setIsAddingBox(false);
      setActiveBoxId(newBox.id);
  };

  const handleCreateItem = async (boxId: string) => {
      if (!activePallet) return;
      const newItem: Item = {
          id: `itm_${Date.now()}`,
          sku: newItemForm.sku,
          name: newItemForm.name || "Unnamed Item",
          size: newItemForm.size,
          quantity: newItemForm.quantity,
          photoUrl: newItemForm.photoUrl || ""
      };
      
      const updatedBoxes = activePallet.boxes.map(b => {
          if (b.id === boxId) {
              return { ...b, items: [...b.items, newItem] };
          }
          return b;
      });
      
      const updatedPallet = { ...activePallet, boxes: updatedBoxes };
      await setDoc(doc(db, 'pallets', activePallet.id), updatedPallet);
      
      setIsAddingItem(null);
      setNewItemForm({ sku: '', name: '', size: '', quantity: 1, photoUrl: '' });
  };
  
  const handleDeletePallet = async (id: string) => {
      if(window.confirm("Are you sure you want to delete this entire pallet?")) {
          await deleteDoc(doc(db, 'pallets', id));
          if(activePalletId === id) setActivePalletId(null);
      }
  };
  
  const handleDeleteBox = async (palletId: string, boxId: string, boxName: string) => {
      if (!window.confirm(`Are you sure you want to completely delete "${boxName}" and all of its contents?`)) return;
      
      const p = pallets.find(p => p.id === palletId);
      if(!p) return;
      try {
          // Extra explicit safeguard
          const StringBoxId = String(boxId);
          console.log("DELETING BOX WITH ID:", StringBoxId);

          const updatedBoxes = p.boxes.filter((b: any) => String(b.id) !== StringBoxId);
          
          if (updatedBoxes.length === p.boxes.length) {
              console.warn("FILTER FAIL: Box ID mismatch or not found in local state!");
              // Fallback deep execution if filter failed logically on types
          }
          
          const updatedPallet = { ...p, boxes: updatedBoxes };
          await setDoc(doc(db, 'pallets', palletId), updatedPallet);

          // Force clearing active state
          if (String(activeBoxId) === StringBoxId) {
             setActiveBoxId(null);
          }
      } catch (err) {
          console.error("Delete Error:", err);
          alert("Failed to delete box. Check your connection.");
      }
  };

  const handleUpdateBoxName = async (palletId: string, boxId: string, newName: string) => {
      if (!newName.trim()) return;
      const p = pallets.find(p => p.id === palletId);
      if(!p) return;
      const updatedBoxes = p.boxes.map(b => b.id === boxId ? { ...b, name: newName } : b);
      await setDoc(doc(db, 'pallets', palletId), { ...p, boxes: updatedBoxes });
      setEditingBoxNameMode(false);
  };

  const handleDuplicateBox = async (palletId: string, boxId: string) => {
      const p = pallets.find(p => p.id === palletId);
      if(!p) return;
      
      const sourceBox = p.boxes.find(b => b.id === boxId);
      if(!sourceBox) return;

      let maxNum = 0;
      p.boxes.forEach((b: any) => {
          const match = b.name.match(/(?:Box\s*)?(\d+)$/i);
          if (match) {
              const num = parseInt(match[1]);
              if (num > maxNum) maxNum = num;
          }
      });
      
      const nextBoxNum = maxNum + 1;
      let newBoxName = `${sourceBox.name} (Copy)`;
      const prefixMatch = sourceBox.name.match(/^(.*?)\s*\d+$/);
      if (prefixMatch) {
          const prefix = prefixMatch[1].trim();
          newBoxName = `${prefix} ${nextBoxNum}`;
      } else if (sourceBox.name.toLowerCase() === 'box' || sourceBox.name.toLowerCase() === 'carton') {
          newBoxName = `${sourceBox.name} ${nextBoxNum}`;
      }

      const duplicateBox = {
          ...sourceBox,
          id: `box_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          name: newBoxName,
          items: sourceBox.items.map(item => ({
              ...item,
              id: `itm_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`
          }))
      };

      const updatedBoxes = [...p.boxes, duplicateBox];
      await setDoc(doc(db, 'pallets', palletId), { ...p, boxes: updatedBoxes });
      setActiveBoxId(duplicateBox.id);
  };

  const handleDeleteItem = async (palletId: string, boxId: string, itemId: string) => {
      if (!window.confirm("Delete this line item completely?")) return;
      const p = pallets.find(p => p.id === palletId);
      if(!p) return;
      const updatedBoxes = p.boxes.map(b => {
          if (b.id === boxId) {
              return { ...b, items: b.items.filter(i => i.id !== itemId) };
          }
          return b;
      });
      await setDoc(doc(db, 'pallets', palletId), { ...p, boxes: updatedBoxes });
  };

  const handleUpdateItemQuantity = async (palletId: string, boxId: string, itemId: string, newQuantity: number) => {
      if (newQuantity < 1) {
          handleDeleteItem(palletId, boxId, itemId);
          return;
      }
      const p = pallets.find(p => p.id === palletId);
      if(!p) return;
      const updatedBoxes = p.boxes.map(b => {
          if (b.id === boxId) {
              return { ...b, items: b.items.map(i => i.id === itemId ? { ...i, quantity: newQuantity } : i) };
          }
          return b;
      });
      await setDoc(doc(db, 'pallets', palletId), { ...p, boxes: updatedBoxes });
  };

  const handleUpdateItemDetails = async (palletId: string, boxId: string, itemId: string) => {
      const p = pallets.find(p => p.id === palletId);
      if(!p || !editItemForm.name.trim()) return;
      const updatedBoxes = p.boxes.map(b => {
          if (b.id === boxId) {
              return { ...b, items: b.items.map(i => i.id === itemId ? { ...i, name: editItemForm.name, sku: editItemForm.sku, size: editItemForm.size } : i) };
          }
          return b;
      });
      await setDoc(doc(db, 'pallets', palletId), { ...p, boxes: updatedBoxes });
      setEditingItemId(null);
  };

  const handleMoveBox = async (targetPalletId: string, palletId: string, boxId: string) => {
      const sourcePallet = pallets.find(p => p.id === palletId);
      const targetPallet = pallets.find(p => p.id === targetPalletId);
      if (!sourcePallet || !targetPallet) return;

      const boxToMove = sourcePallet.boxes.find(b => b.id === boxId);
      if (!boxToMove) return;

      // Extract numeric suffix from existing boxes to find the next available Box Number
      let maxNum = 0;
      targetPallet.boxes.forEach(b => {
          const match = b.name.match(/(?:Box\s*)?(\d+)$/i); // Matches "1", "Box 1", "Box1"
          if (match) {
              const num = parseInt(match[1]);
              if (num > maxNum) maxNum = num;
          }
      });
      
      const nextBoxNum = maxNum + 1;
      let newBoxName = boxToMove.name;
      
      // If the target pallet already has a box with this exact name, auto-generate a new one
      const nameExists = targetPallet.boxes.some(b => b.name === newBoxName);
      if (nameExists) {
          // Attempt to preserve the prefix if it looks like "Box 1" vs something else
          const prefixMatch = newBoxName.match(/^(.*?)\s*\d+$/);
          const prefix = prefixMatch ? prefixMatch[1].trim() : 'Box';
          newBoxName = `${prefix} ${nextBoxNum}`;
      }

      const updatedBox = { ...boxToMove, name: newBoxName };

      const updatedSourceBoxes = sourcePallet.boxes.filter(b => b.id !== boxId);
      const updatedTargetBoxes = [...targetPallet.boxes, updatedBox];

      await setDoc(doc(db, 'pallets', sourcePallet.id), { ...sourcePallet, boxes: updatedSourceBoxes });
      await setDoc(doc(db, 'pallets', targetPallet.id), { ...targetPallet, boxes: updatedTargetBoxes });

      setActivePalletId(targetPallet.id);
      setActiveBoxId(boxToMove.id);
  };

  const activeBox = activePallet?.boxes.find(b => b.id === activeBoxId);

  return (
    <div className="flex h-full gap-6 w-full relative">
       {/* Sidebar */}
       <div className="w-80 h-full flex flex-col bg-white rounded-card border border-brand-border shadow-sm shrink-0 overflow-hidden">
          <div className="p-4 border-b border-brand-border/60 bg-brand-bg/50">
             <h2 className="text-sm font-bold uppercase tracking-widest text-brand-primary mb-4 flex items-center gap-2">
                 <Package size={16} /> Pallet Directory
             </h2>
             {!isAddingPallet ? (
                 <button 
                     onClick={() => setIsAddingPallet(true)}
                     className="w-full bg-brand-primary text-white py-2.5 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-black transition-colors shadow-sm flex items-center justify-center gap-2"
                 >
                     <Plus size={14} /> Create Pallet
                 </button>
             ) : (
                 <div className="bg-white p-3 rounded-xl border border-brand-border shadow-sm animate-in zoom-in-95">
                     <input 
                         type="text" 
                         autoFocus
                         placeholder="Pallet Name (e.g. Summer Drop)" 
                         value={newPalletName}
                         onChange={e => setNewPalletName(e.target.value)}
                         className="w-full text-xs font-semibold p-2 bg-brand-bg border border-brand-border rounded-lg outline-none focus:border-brand-primary mb-2"
                     />
                     <div className="flex gap-2">
                         <button onClick={() => setIsAddingPallet(false)} className="flex-1 py-2 text-[10px] font-bold uppercase text-brand-secondary hover:text-black border border-transparent hover:bg-brand-bg rounded-lg">Cancel</button>
                         <button onClick={handleCreatePallet} className="flex-1 py-2 text-[10px] bg-brand-primary text-white font-bold uppercase rounded-lg shadow-sm">Save</button>
                     </div>
                 </div>
             )}
          </div>
          
          <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
             {pallets.map(p => (
                 <div 
                     key={p.id}
                     onClick={() => { setActivePalletId(p.id); setActiveBoxId(null); }}
                     className={`p-3 rounded-xl cursor-pointer transition-all border ${activePalletId === p.id ? 'bg-black text-white border-black shadow-md scale-[1.02]' : 'bg-white border-brand-border hover:bg-brand-bg hover:border-brand-primary/30'}`}
                 >
                     <div className="flex justify-between items-start">
                         <h3 className={`font-serif text-lg leading-tight tracking-tight ${activePalletId === p.id ? 'text-white' : 'text-brand-primary'}`}>{p.name}</h3>
                         {activePalletId === p.id && (
                             <button onClick={(e) => { e.stopPropagation(); handleDeletePallet(p.id); }} className="opacity-50 hover:opacity-100 transition-opacity">
                                <X size={14} />
                             </button>
                         )}
                     </div>
                     <div className={`text-[10px] font-bold uppercase tracking-widest mt-2 flex items-center gap-1.5 opacity-80 ${activePalletId === p.id ? 'text-neutral-300' : 'text-brand-secondary'}`}>
                         <Layers size={12} /> {p.boxes.length} Boxes
                     </div>
                 </div>
             ))}
             {pallets.length === 0 && !isAddingPallet && (
                 <div className="text-center p-6 text-brand-secondary">
                    <Package size={32} className="mx-auto mb-2 opacity-20" />
                    <p className="text-xs uppercase font-bold tracking-widest opacity-50">No Pallets Exist</p>
                 </div>
             )}
          </div>
       </div>
       
       {/* Main Content */}
       <div className="flex-1 bg-white rounded-card border border-brand-border shadow-sm flex flex-col overflow-hidden">
           {activePallet ? (
               <div className="flex h-full">
                  {/* Boxes List */}
                  <div className="w-64 border-r border-brand-border/60 bg-brand-bg/30 flex flex-col">
                      <div className="p-4 border-b border-brand-border/60">
                         <h3 className="font-serif text-xl tracking-tight text-brand-primary mb-1">{activePallet.name}</h3>
                         <p className="text-[10px] uppercase font-bold tracking-widest text-brand-secondary mb-4 drop-shadow-sm">{activePallet.id}</p>
                         
                         {!isAddingBox ? (
                             <div className="flex flex-col gap-2">
                                 <button 
                                     onClick={() => setIsAddingBox(true)}
                                     className="w-full bg-white border border-brand-border text-brand-primary py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:border-brand-primary transition-colors shadow-sm flex items-center justify-center gap-2"
                                 >
                                     <Plus size={14} /> Add Box
                                 </button>
                                 <button 
                                     onClick={() => setPrintingBox({ pallet: activePallet, box: null, type: 'pallet' })}
                                     className="w-full bg-brand-bg text-brand-primary border border-brand-border py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:border-brand-primary transition-colors shadow-sm flex items-center justify-center gap-2 mb-2"
                                 >
                                     <QrCode size={14} /> Print Master Pallet Tag
                                 </button>
                                 <button 
                                     onClick={() => setPrintingBox({ pallet: activePallet, box: null, type: 'all_boxes' })}
                                     className="w-full bg-black text-white py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors shadow-sm flex items-center justify-center gap-2"
                                 >
                                     <Printer size={14} /> Print All Box Labels (Avery)
                                 </button>
                             </div>
                         ) : (
                             <div className="bg-white p-3 rounded-xl border border-brand-border shadow-sm">
                                 <input 
                                     type="text" 
                                     autoFocus
                                     placeholder="Box Identifier..." 
                                     value={newBoxName}
                                     onChange={e => setNewBoxName(e.target.value)}
                                     className="w-full text-xs font-semibold p-2 bg-brand-bg border border-brand-border rounded-lg outline-none focus:border-brand-primary mb-2"
                                 />
                                 <div className="flex gap-2">
                                     <button onClick={() => setIsAddingBox(false)} className="flex-1 py-1.5 text-[9px] font-bold uppercase text-brand-secondary hover:text-black">Cancel</button>
                                     <button onClick={handleCreateBox} className="flex-1 py-1.5 text-[9px] bg-black text-white font-bold uppercase rounded-lg">Save Box</button>
                                 </div>
                             </div>
                         )}
                      </div>
                      
                      <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                         {activePallet.boxes.map(box => {
                             const totalItems = box.items.reduce((sum, item) => sum + item.quantity, 0);
                             return (
                             <div 
                                 key={box.id}
                                 onClick={() => setActiveBoxId(box.id)}
                                 className={`p-3 rounded-lg cursor-pointer transition-all border flex flex-col gap-1 ${activeBoxId === box.id ? 'bg-white border-brand-primary shadow-sm' : 'border-transparent hover:bg-white hover:border-brand-border'}`}
                             >
                                 <div className="flex justify-between items-center group">
                                     <span className="text-xs font-bold text-brand-primary flex items-center gap-2">
                                        <Box size={14} className={activeBoxId === box.id ? 'text-brand-primary' : 'text-brand-secondary'} /> 
                                        {box.name}
                                     </span>
                                     <ChevronRight size={14} className={`transition-transform ${activeBoxId === box.id ? 'text-brand-primary translate-x-1' : 'text-transparent group-hover:text-brand-secondary'}`} />
                                 </div>
                                 <span className="text-[9px] uppercase tracking-widest text-brand-secondary font-bold pl-6">
                                     {totalItems} Units
                                 </span>
                             </div>
                         )})}
                         {activePallet.boxes.length === 0 && !isAddingBox && (
                             <p className="text-center text-[10px] uppercase font-bold tracking-widest text-brand-secondary opacity-50 mt-8">No Boxes Added</p>
                         )}
                      </div>
                  </div>
                  
                  {/* Box Content Editor */}
                  <div className="flex-1 flex flex-col bg-white overflow-hidden relative">
                     {activeBox ? (
                         <>
                             <div className="p-6 border-b border-brand-border/60 bg-white flex justify-between items-start shrink-0">
                                <div>
                                   <div className="flex items-center gap-2 mb-1">
                                      <span className="bg-brand-bg text-brand-secondary border border-brand-border px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest">
                                          BOX
                                      </span>
                                      <span className="text-[10px] uppercase font-bold tracking-widest text-brand-secondary">{activeBox.id}</span>
                                   </div>
                                   <div className="flex items-center gap-3">
                                       {editingBoxNameMode ? (
                                           <input 
                                              type="text" 
                                              autoFocus
                                              value={editBoxNameValue}
                                              onChange={e => setEditBoxNameValue(e.target.value)}
                                              onBlur={() => handleUpdateBoxName(activePallet.id, activeBox.id, editBoxNameValue)}
                                              onKeyDown={e => e.key === 'Enter' && handleUpdateBoxName(activePallet.id, activeBox.id, editBoxNameValue)}
                                              className="font-serif text-3xl tracking-tight text-brand-primary bg-brand-bg border border-brand-border rounded outline-none focus:border-brand-primary px-2 py-0.5"
                                           />
                                       ) : (
                                           <h2 className="font-serif text-3xl tracking-tight text-brand-primary cursor-pointer hover:opacity-80 transition-opacity" onClick={() => { setEditBoxNameValue(activeBox.name); setEditingBoxNameMode(true); }} title="Click to rename box">
                                               {activeBox.name}
                                           </h2>
                                       )}
                                   </div>
                                </div>
                                <div className="flex flex-col gap-2 items-end">
                                    <div className="flex gap-2 mb-2">
                                        <select 
                                            onChange={(e) => {
                                                if (e.target.value) {
                                                    handleMoveBox(e.target.value, activePallet.id, activeBox.id);
                                                    e.target.value = "";
                                                }
                                            }}
                                            className="bg-brand-bg text-brand-secondary border border-brand-border px-3 py-1.5 rounded-lg font-bold uppercase tracking-widest text-[9px] shadow-sm hover:border-brand-primary transition-all outline-none cursor-pointer"
                                        >
                                            <option value="">Move Box To...</option>
                                            {pallets.filter(p => p.id !== activePallet.id).map(p => (
                                                <option key={p.id} value={p.id}>{p.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="flex flex-col gap-2 w-full mt-2">
                                        <button 
                                           onClick={() => handleDuplicateBox(activePallet.id, activeBox.id)}
                                           className="bg-brand-bg text-brand-primary border border-brand-border w-full px-5 py-2 rounded-lg font-bold uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 hover:bg-black hover:text-white transition-all shadow-sm"
                                        >
                                           <Copy size={14} /> Duplicate Payload
                                        </button>
                                        <button 
                                           onClick={() => setPrintingBox({ pallet: activePallet, box: activeBox, type: 'box' })}
                                           className="bg-brand-primary text-white w-full px-5 py-2 rounded-lg font-bold uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 shadow-sm hover:bg-black transition-all"
                                        >
                                           <QrCode size={14} /> Print Huge Route Label
                                        </button>
                                        <button 
                                           onClick={() => handleDeleteBox(activePallet.id, activeBox.id, activeBox.name)}
                                           className="bg-red-50 text-red-600 border border-red-200 w-full px-5 py-2 rounded-lg font-bold uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 shadow-sm hover:bg-red-600 hover:text-white transition-all mt-2"
                                        >
                                           <X size={14} /> Delete Box
                                        </button>
                                    </div>
                                </div>
                             </div>
                             
                             <div className="flex-1 overflow-y-auto p-6 bg-brand-bg/20 custom-scrollbar">
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="text-sm font-bold uppercase tracking-widest text-brand-primary flex items-center gap-2">
                                        <BarChart3 size={16} /> Inventory Line Items
                                    </h3>
                                    <button 
                                        onClick={() => setIsAddingItem({ boxId: activeBox.id })}
                                        className="bg-white border border-brand-border text-brand-primary px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:border-brand-primary shadow-sm transition-colors flex items-center gap-2"
                                    >
                                        <Plus size={14} /> Add Line Item
                                    </button>
                                </div>
                                
                                {isAddingItem?.boxId === activeBox.id && (
                                    <div className="bg-white border-2 border-brand-primary p-5 rounded-2xl shadow-lg mb-6 animate-in slide-in-from-top-4">
                                        <datalist id="inventory-skus">
                                            {Array.from(new Set(pallets.flatMap(p=>p.boxes?.flatMap((b:any)=>b.items?.map((i:any)=>i.sku)||[])||[]))).filter(Boolean).map((s:any)=><option key={s} value={s}/>)}
                                        </datalist>
                                        <datalist id="inventory-names">
                                            {Array.from(new Set(pallets.flatMap(p=>p.boxes?.flatMap((b:any)=>b.items?.map((i:any)=>i.name)||[])||[]))).filter(Boolean).map((n:any)=><option key={n} value={n}/>)}
                                        </datalist>
                                        <datalist id="inventory-sizes">
                                            {Array.from(new Set(pallets.flatMap(p=>p.boxes?.flatMap((b:any)=>b.items?.map((i:any)=>i.size)||[])||[]))).filter(Boolean).map((s:any)=><option key={s} value={s}/>)}
                                        </datalist>

                                        <h4 className="text-xs font-bold uppercase tracking-widest text-brand-primary mb-4 flex items-center gap-2">
                                            <Tag size={14} /> New Item Record
                                        </h4>
                                        <div className="grid grid-cols-12 gap-4">
                                            <div className="col-span-3">
                                                <label className="block text-[9px] font-bold uppercase tracking-widest text-brand-secondary mb-1">SKU</label>
                                                <input list="inventory-skus" type="text" value={newItemForm.sku} onChange={e => setNewItemForm({...newItemForm, sku: e.target.value})} className="w-full text-xs font-semibold p-2.5 bg-brand-bg border border-brand-border rounded-lg outline-none focus:border-brand-primary" placeholder="e.g. TST-BLK" />
                                            </div>
                                            <div className="col-span-4">
                                                <label className="block text-[9px] font-bold uppercase tracking-widest text-brand-secondary mb-1">Item Name</label>
                                                <input list="inventory-names" type="text" value={newItemForm.name} onChange={e => setNewItemForm({...newItemForm, name: e.target.value})} className="w-full text-xs font-semibold p-2.5 bg-brand-bg border border-brand-border rounded-lg outline-none focus:border-brand-primary" placeholder="Black T-Shirt" />
                                            </div>
                                            <div className="col-span-2">
                                                <label className="block text-[9px] font-bold uppercase tracking-widest text-brand-secondary mb-1">Size</label>
                                                <input list="inventory-sizes" type="text" value={newItemForm.size} onChange={e => setNewItemForm({...newItemForm, size: e.target.value})} className="w-full text-xs font-semibold p-2.5 bg-brand-bg border border-brand-border rounded-lg outline-none focus:border-brand-primary" placeholder="M" />
                                            </div>
                                            <div className="col-span-3">
                                                <label className="block text-[9px] font-bold uppercase tracking-widest text-brand-secondary mb-1">Quantity</label>
                                                <input type="number" min="1" value={newItemForm.quantity} onChange={e => setNewItemForm({...newItemForm, quantity: parseInt(e.target.value)||1})} className="w-full text-xs font-semibold p-2.5 bg-brand-bg border border-brand-border rounded-lg outline-none focus:border-brand-primary" />
                                            </div>
                                            <div className="col-span-12">
                                                <label className="block text-[9px] font-bold uppercase tracking-widest text-brand-secondary mb-1">Photo URL (Optional)</label>
                                                <div className="flex gap-2">
                                                    <div className="bg-brand-bg border border-brand-border rounded-lg p-2.5 flex items-center justify-center shrink-0">
                                                        <ImageIcon size={16} className="text-brand-secondary" />
                                                    </div>
                                                    <input type="text" value={newItemForm.photoUrl} onChange={e => setNewItemForm({...newItemForm, photoUrl: e.target.value})} className="flex-1 text-xs font-semibold p-2.5 bg-brand-bg border border-brand-border rounded-lg outline-none focus:border-brand-primary" placeholder="https://..." />
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex justify-end gap-3 mt-5 pt-4 border-t border-brand-border">
                                            <button onClick={() => setIsAddingItem(null)} className="px-5 py-2 text-[10px] font-bold uppercase text-brand-secondary hover:text-black transition-colors">Cancel</button>
                                            <button onClick={() => handleCreateItem(activeBox.id)} className="px-6 py-2 text-[10px] bg-black text-white font-bold uppercase tracking-widest rounded-lg shadow-sm hover:scale-105 transition-transform">Save Item</button>
                                        </div>
                                    </div>
                                )}
                                
                                <div className="space-y-3">
                                   {activeBox.items.map(item => (
                                       <div key={item.id} className="bg-white border border-brand-border p-3 rounded-xl flex items-center gap-4 hover:border-brand-primary/50 transition-colors shadow-sm group">
                                           <div className="w-14 h-14 rounded-lg bg-brand-bg border border-brand-border/50 overflow-hidden shrink-0">
                                               {item.photoUrl ? (
                                                  <img src={item.photoUrl} alt={item.name} className="w-full h-full object-cover" />
                                               ) : (
                                                  <div className="w-full h-full flex items-center justify-center text-brand-secondary"><Package size={20} /></div>
                                               )}
                                           </div>
                                           <div className="flex-1">
                                                {editingItemId === item.id ? (
                                                    <div className="flex flex-col gap-2 p-3 bg-brand-bg rounded-lg border border-brand-border">
                                                        <input type="text" value={editItemForm.name} onChange={e => setEditItemForm({...editItemForm, name: e.target.value})} className="w-full text-xs font-semibold p-2 bg-white border border-brand-border rounded outline-none focus:border-brand-primary" placeholder="Item Name" autoFocus onKeyDown={e => e.key === 'Enter' && handleUpdateItemDetails(activePallet.id, activeBox.id, item.id)} />
                                                        <div className="flex gap-2">
                                                            <input type="text" value={editItemForm.sku} onChange={e => setEditItemForm({...editItemForm, sku: e.target.value})} className="w-1/2 text-[10px] p-2 bg-white border border-brand-border rounded outline-none uppercase focus:border-brand-primary" placeholder="SKU (Opt)" onKeyDown={e => e.key === 'Enter' && handleUpdateItemDetails(activePallet.id, activeBox.id, item.id)} />
                                                            <input type="text" value={editItemForm.size} onChange={e => setEditItemForm({...editItemForm, size: e.target.value})} className="w-1/2 text-[10px] p-2 bg-white border border-brand-border rounded outline-none uppercase focus:border-brand-primary" placeholder="Size (Opt)" onKeyDown={e => e.key === 'Enter' && handleUpdateItemDetails(activePallet.id, activeBox.id, item.id)} />
                                                        </div>
                                                        <div className="flex gap-2 justify-end mt-1">
                                                            <button onClick={() => setEditingItemId(null)} className="text-[10px] font-bold uppercase text-brand-secondary hover:text-black transition-colors px-3">Cancel</button>
                                                            <button onClick={() => handleUpdateItemDetails(activePallet.id, activeBox.id, item.id)} className="text-[10px] font-bold uppercase bg-brand-primary text-white hover:bg-black transition-colors rounded-lg px-4 py-2">Save</button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-start justify-between cursor-pointer group/item" onClick={() => { setEditingItemId(item.id); setEditItemForm({ name: item.name, sku: item.sku || '', size: item.size || '' }); }} title="Click to edit item">
                                                        <div>
                                                            <h4 className="font-serif text-lg leading-tight text-brand-primary group-hover/item:opacity-70 transition-opacity">{item.name}</h4>
                                                            <div className="flex items-center gap-2 mt-1">
                                                                {item.sku && <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest">{item.sku}</span>}
                                                                {item.size && <span className="border border-brand-border text-brand-secondary px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest">{item.size}</span>}
                                                            </div>
                                                        </div>
                                                        <div className="text-right flex items-center gap-2 pr-4 cursor-auto" onClick={e => e.stopPropagation()}>
                                                            <button onClick={() => handleUpdateItemQuantity(activePallet.id, activeBox.id, item.id, item.quantity - 1)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-brand-bg border border-brand-border text-brand-primary font-bold hover:bg-white transition-colors">-</button>
                                                            <div className="text-2xl font-black font-sans tracking-tighter text-brand-primary w-12 text-center">
                                                                {item.quantity}
                                                            </div>
                                                            <button onClick={() => handleUpdateItemQuantity(activePallet.id, activeBox.id, item.id, item.quantity + 1)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-brand-bg border border-brand-border text-brand-primary font-bold hover:bg-white transition-colors">+</button>
                                                            <button onClick={() => handleDeleteItem(activePallet.id, activeBox.id, item.id)} className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 bg-red-50 p-2 rounded-lg transition-all ml-2">
                                                                <X size={16} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                       </div>
                                   ))}
                                   {activeBox.items.length === 0 && !isAddingItem && (
                                       <div className="text-center p-12 border-2 border-dashed border-brand-border rounded-2xl bg-white/50">
                                           <Box size={40} className="mx-auto text-brand-secondary opacity-30 mb-3" />
                                           <p className="text-sm font-bold uppercase tracking-widest text-brand-secondary mb-1">This box is empty</p>
                                           <p className="text-xs text-brand-secondary/70">Add line items to populate the box manifest.</p>
                                       </div>
                                   )}
                                </div>
                             </div>
                         </>
                     ) : (
                         <div className="h-full flex flex-col items-center justify-center text-brand-secondary opacity-60">
                             <Package size={48} className="mb-4 opacity-50 stroke-1" />
                             <p className="font-serif text-xl tracking-tight text-brand-primary">Select a Box</p>
                             <p className="text-xs uppercase tracking-widest font-bold mt-2">To view or edit its contents</p>
                         </div>
                     )}
                  </div>
               </div>
           ) : (
               <div className="h-full flex flex-col items-center justify-center text-brand-secondary opacity-60">
                   <Layers size={64} className="mb-4 opacity-30 stroke-1" />
                   <p className="font-serif text-2xl tracking-tight text-brand-primary">No Pallet Selected</p>
                   <p className="text-xs uppercase tracking-widest font-bold mt-2">Select a pallet from the directory or create a new one</p>
               </div>
           )}
       </div>

       {/* Print Modal Overlay */}
       {printingBox && (
          <div className={`fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-8 animate-in fade-in ${printingBox.type === 'items' || printingBox.type === 'all_boxes' ? 'print-avery-mode' : 'print-thermal-mode'}`}>
             <div className="bg-brand-bg rounded-2xl shadow-2xl max-w-5xl w-full h-full max-h-[90vh] flex flex-col overflow-hidden relative">
                <div className="p-6 border-b border-brand-border bg-white flex justify-between items-center shrink-0">
                    <div>
                        <h2 className="font-serif text-2xl tracking-tight font-bold text-brand-primary">
                             {printingBox.type === 'items' ? 'Avery Label Preview (30-up)' : 'Thermal Label Preview'}
                        </h2>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary">Ready for printing</p>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={() => window.print()} className="bg-brand-primary text-white px-6 py-2.5 rounded-pill font-bold uppercase tracking-widest text-xs flex items-center gap-2 shadow-md hover:bg-black transition-all">
                            <Printer size={16} /> Print
                        </button>
                        <button onClick={() => setPrintingBox(null)} className="border border-brand-border bg-white text-brand-primary px-4 py-2.5 rounded-pill font-bold uppercase tracking-widest text-xs hover:bg-brand-bg transition-colors">
                            Close
                        </button>
                    </div>
                </div>
                
                <div className="flex-1 p-8 overflow-y-auto flex items-start justify-center bg-gray-200 print:p-0 print:bg-white custom-scrollbar print-viewport">
                    {printingBox.type === 'box' && printingBox.box ? (
                        /* The Actual Thermal Label to Print */
                        <div className="bg-white shadow-xl p-6 border-4 border-black print-label-container my-auto print:shadow-none print:border-none print:m-0 overflow-hidden flex flex-col" style={{ width: '6in', height: '4in', boxSizing: 'border-box' }}>
                            <div className="flex justify-between items-start mb-4 border-b-4 border-black pb-3 shrink-0">
                                <div>
                                    <img src="/logo.png" alt="WOVN" className="h-8 w-auto mb-4 grayscale" />
                                    <h1 className="font-sans text-4xl font-black uppercase tracking-tighter leading-none">{printingBox.pallet.name}</h1>
                                    <p className="text-xl font-bold font-sans mt-1">PALLET ID: {printingBox.pallet.id.replace('pal_', '')}</p>
                                </div>
                                <div className="text-right">
                                    <div className="text-6xl font-black font-sans uppercase tracking-tighter leading-none mb-1">{printingBox.box.name}</div>
                                    <p className="text-sm font-bold uppercase tracking-widest bg-black text-white px-2 py-1 inline-block">BOX ID: {printingBox.box.id.replace('box_', '')}</p>
                                </div>
                            </div>

                            <div className="flex gap-4 flex-1 min-h-0">
                                <div className="flex-1 flex flex-col min-h-0">
                                    <h3 className="text-sm font-black uppercase tracking-widest mb-2 border-b-2 border-black pb-1 shrink-0">Contents Manifest ({printingBox.box.items.reduce((s,i)=>s+i.quantity,0)} Units)</h3>
                                    <div className="space-y-2 overflow-y-auto pr-2 flex-1 pb-1 custom-scrollbar">
                                        {printingBox.box.items.map((item, idx) => (
                                            <div key={idx} className="flex gap-2 items-center p-1.5 border border-black/20 rounded">
                                                {item.photoUrl && <img src={item.photoUrl} alt="Item" className="w-8 h-8 rounded object-cover grayscale border border-black/20 shrink-0" />}
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-bold text-sm leading-tight uppercase font-sans line-clamp-1">{item.name}</div>
                                                    <div className="text-[9px] font-bold font-mono">
                                                        {item.sku ? `SKU: ${item.sku}` : ''} {item.size ? `| SIZE: ${item.size}` : ''}
                                                    </div>
                                                </div>
                                                <div className="font-black text-2xl font-sans shrink-0">
                                                    ×{item.quantity}
                                                </div>
                                            </div>
                                        ))}
                                        {printingBox.box.items.length === 0 && (
                                            <div className="p-4 border-2 border-dashed border-black/30 text-center font-bold uppercase">Empty Box</div>
                                        )}
                                    </div>
                                </div>
                                
                                <div className="shrink-0 flex flex-col items-center justify-between border-l-4 border-black pl-4 w-40">
                                    <div className="flex flex-col items-center">
                                        <div className="p-1 border-4 border-black bg-white mb-2">
                                            <QRCode value={`${window.location.hostname === 'localhost' ? 'https://print-shop-os.vercel.app' : window.location.origin}/inventory/scan?p=${printingBox.pallet.id}&b=${printingBox.box.id}`} size={100} level="L" />
                                        </div>
                                        <p className="text-[8px] font-black uppercase tracking-widest text-center mt-1 w-full text-black">Scan to View Info</p>
                                    </div>
                                    <div className="w-full opacity-70">
                                        <div className="text-[7px] font-mono leading-tight">
                                            DATE: {new Date().toLocaleDateString()}<br/>
                                            TIME: {new Date().toLocaleTimeString()}<br/>
                                            SYS_ID: {printingBox.box.id}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>                     ) : printingBox.type === 'pallet' && printingBox.pallet ? (
                         /* The Master Pallet Thermal Label */
                         <div className="bg-white p-6 border-4 border-black print-label-container my-auto print:shadow-none print:border-none print:m-0 overflow-hidden flex flex-col" style={{ width: '5.8in', height: '3.8in', boxSizing: 'border-box' }}>
                             <div className="flex justify-between items-start mb-4 border-b-4 border-black pb-3 shrink-0">
                                 <div>
                                     <img src="/logo.png" alt="WOVN" className="h-8 w-auto mb-3 grayscale" />
                                     <h1 className="font-sans text-4xl font-black uppercase tracking-tighter leading-none">{printingBox.pallet.name}</h1>
                                 </div>
                                 <div className="text-right">
                                     <div className="text-3xl font-black font-sans uppercase tracking-widest bg-black text-white px-3 py-1.5 inline-block">MASTER</div>
                                     <p className="text-xs font-bold uppercase tracking-widest mt-1">ID: {printingBox.pallet.id.replace('pal_', '')}</p>
                                 </div>
                             </div>

                             <div className="flex gap-4 flex-1 items-center justify-between min-h-0 pl-2">
                                 <div className="flex-1 shrink-0">
                                     <div className="text-6xl font-black font-sans tracking-tighter leading-none">{printingBox.pallet.boxes.length}</div>
                                     <div className="text-xl font-black font-sans uppercase tracking-widest mt-1 border-t-2 border-black pt-1 max-w-[150px]">Active Boxes Logged</div>
                                     <p className="text-[9px] font-bold uppercase tracking-widest mt-4 opacity-70">Date: {new Date().toLocaleDateString()} {new Date().toLocaleTimeString()}</p>
                                 </div>
                                 
                                 <div className="shrink-0 flex flex-col items-center justify-center border-l-4 border-black pl-6 pr-2">
                                     <div className="p-1.5 border-4 border-black bg-white mb-2">
                                         <QRCode value={`${window.location.hostname === 'localhost' ? 'https://print-shop-os.vercel.app' : window.location.origin}/inventory/scan?p=${printingBox.pallet.id}`} size={110} level="M" />
                                     </div>
                                     <p className="text-[10px] font-black uppercase tracking-widest text-center w-full text-black leading-tight">Scan To Register<br/>Boxes</p>
                                 </div>
                             </div>
                         </div>
                     ) : (() => {
                        // Avery 5160 Label Mode
                        const allLabels: any[] = [];
                        
                        if (printingBox.type === 'all_boxes') {
                            printingBox.pallet.boxes.forEach(box => {
                                allLabels.push({ isBoxRecord: true, box });
                            });
                        } else if (printingBox.type === 'items' && printingBox.box) {
                            printingBox.box.items.forEach(item => {
                                for (let i = 0; i < item.quantity; i++) {
                                    allLabels.push(item);
                                }
                            });
                        }

                        const pages = [];
                        for (let i = 0; i < allLabels.length; i += 30) {
                            pages.push(allLabels.slice(i, i + 30));
                        }

                        if (pages.length === 0) {
                            return <div className="text-brand-secondary font-bold uppercase py-10">No items available to print.</div>;
                        }

                        return (
                            <div className="w-full flex justify-center flex-col items-center">
                                {pages.map((pageLabels, pageIndex) => (
                                    <div key={pageIndex} className={`sheet mb-8 bg-white relative print:m-0 print:border-none print:shadow-none shadow-xl avery-sheet`} style={{
                                        width: '8.5in',
                                        height: '11in',
                                        paddingTop: '0.5in',
                                        paddingBottom: '0.5in',
                                        paddingLeft: '0.1875in',
                                        paddingRight: '0.1875in',
                                        boxSizing: 'border-box',
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(3, 2.625in)',
                                        gridTemplateRows: 'repeat(10, 1in)',
                                        columnGap: '0.125in',
                                        rowGap: '0in'
                                    }}>
                                        {pageLabels.map((lbl: any, i: number) => {
                                          if (lbl.isBoxRecord) {
                                              const totalUnits = lbl.box.items.reduce((acc: number, item: any) => acc + item.quantity, 0);
                                              return (
                                                <div key={i} className="relative w-full h-full box-border p-1">
                                                  <div 
                                                    style={{ 
                                                      width: '100%', 
                                                      height: '100%',
                                                      borderRadius: '0.125in',
                                                    }}
                                                    className={`bg-white border-2 border-transparent flex items-stretch box-border overflow-hidden z-10 [font-family:"Times_New_Roman",Times,serif]`}
                                                  >
                                                    <div className="flex-1 flex flex-col justify-center pl-3 pr-1 py-1 truncate">
                                                        <span className="text-[10px] uppercase font-bold tracking-widest leading-none text-gray-500 mb-1">{printingBox.pallet.name}</span>
                                                        <span className="text-xl font-bold uppercase leading-none truncate mb-1">{lbl.box.name}</span>
                                                        <span className="text-[9px] uppercase font-bold text-gray-800">{totalUnits} Units</span>
                                                    </div>
                                                    <div className="shrink-0 flex items-center justify-center pr-2">
                                                        <QRCode value={`${window.location.hostname === 'localhost' ? 'https://print-shop-os.vercel.app' : window.location.origin}/inventory/scan?p=${printingBox.pallet.id}&b=${lbl.box.id}`} size={56} level="L" />
                                                    </div>
                                                  </div>
                                                </div>
                                              );
                                          } else {
                                              return (
                                                <div key={i} className="relative w-full h-full box-border p-1">
                                                  <div 
                                                    style={{ 
                                                      width: '100%', 
                                                      height: '100%',
                                                      borderRadius: '0.125in',
                                                      outline: '0.05in solid black'
                                                    }}
                                                    className={`bg-black text-white px-3 py-2 flex flex-col justify-center items-start box-border overflow-hidden z-10 [font-family:"Times_New_Roman",Times,serif]`}
                                                  >
                                                    <span className="text-[17px] leading-[1.2] truncate max-w-full block font-bold">{lbl.name || lbl.sku}</span>
                                                    <span className="text-[17px] leading-[1.2] mt-1 truncate max-w-full block font-bold">{lbl.size || 'OS'}</span>
                                                    <span className="text-[17px] leading-[1.2] mt-1 truncate max-w-full block">{printingBox.box?.name}</span>
                                                  </div>
                                                </div>
                                              );
                                          }
                                        })}
                                    </div>
                                ))}
                            </div>
                        );
                    })()}
                </div>
             </div>
          </div>
       )}

       <style>{`
          @media print {
             @page { 
                 size: ${printingBox?.type === 'items' || printingBox?.type === 'all_boxes' ? 'letter' : '4in 6in'}; 
                 margin: ${printingBox?.type === 'items' || printingBox?.type === 'all_boxes' ? 'auto' : '0'};
             }
             body * { visibility: hidden !important; }
             
             /* For Box Route Thermal Label (6x4 Landscape rotated to 4x6 Portrait) */
             .print-thermal-mode .print-label-container, .print-thermal-mode .print-label-container * { visibility: visible !important; }
             .print-thermal-mode .print-label-container {
                 position: fixed !important;
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
                 page-break-after: always;
             }

             /* For Avery 5160 Item Labels (8.5x11 Portrait) */
             .print-avery-mode .print-viewport, .print-avery-mode .print-viewport * { visibility: visible !important; }
             .print-avery-mode .print-viewport {
                 position: absolute !important;
                 left: 0 !important;
                 top: 0 !important;
                 width: 8.5in !important;
                 background: white !important;
             }
             .avery-sheet {
                 margin: 0 auto !important;
                 box-shadow: none !important;
                 page-break-after: always;
             }
          }
          
          .print-thermal-mode {
             @page { size: 4in 6in portrait; margin: 0; }
          }
          .print-avery-mode {
             @page { size: 8.5in 11in portrait; margin: 0; }
          }
       `}</style>
    </div>
  );
}
