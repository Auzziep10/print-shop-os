import { useState } from 'react';
import QRCode from 'react-qr-code';
import { db } from '../../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { PillButton } from '../ui/PillButton';
import { Plus, Trash2, Box, ExternalLink, Printer, X, ChevronDown } from 'lucide-react';
import { tokens } from '../../lib/tokens';

type DraftBox = {
  id: string;
  name: string;
  selectedItems: any;
};

export function PackingSlipsManager({ order }: { order: any }) {
  const [isAddingBox, setIsAddingBox] = useState(false);
  const [workingBoxes, setWorkingBoxes] = useState<DraftBox[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  
  const sortSizes = (a: string, b: string) => {
      const orderMap: Record<string, number> = { 'xxs':1, 'xs':2, 's':3, 'm':4, 'l':5, 'xl':6, 'xxl':7, '2xl':7, '3xl':8, '4xl':9, '5xl':10, 'osfa':11, 'os':12 };
      const aKey = a.split(' ')[0].toLowerCase();
      const bKey = b.split(' ')[0].toLowerCase();
      const aVal = orderMap[aKey] || 99;
      const bVal = orderMap[bKey] || 99;
      if (aVal !== bVal) return aVal - bVal;
      return a.localeCompare(b);
  };

  const getNextAvailableBoxName = () => {
     let maxBase = 0;
     const allBoxes = [...(order.boxes || []), ...workingBoxes];
     allBoxes.forEach((b: any) => {
        const match = b.name.match(/Box (\d+)/i);
        if (match) {
           const num = parseInt(match[1]);
           if (num > maxBase) maxBase = num;
        }
     });
     return `Box ${maxBase + 1}`;
  };

  const handleStartAddBox = () => {
    setWorkingBoxes([{ 
      id: Date.now().toString(), 
      name: getNextAvailableBoxName(), 
      selectedItems: {} 
    }]);
    setIsAddingBox(true);
  };

  const handleAddShipment = () => {
     setWorkingBoxes([...workingBoxes, { 
       id: Date.now().toString(), 
       name: getNextAvailableBoxName(), 
       selectedItems: {} 
     }]);
  };

  const handleSizeQtyChange = (boxIndex: number, itemId: string, size: string, qty: number) => {
    const newW = [...workingBoxes];
    const prevItems = newW[boxIndex].selectedItems;
    const itemData = prevItems[itemId] || { sizes: {}, totalQty: 0 };
    const newSizes = { ...itemData.sizes, [size]: qty };
    const totalQty = Object.values(newSizes).reduce((acc: number, val: any) => acc + (parseInt(val) || 0), 0);
    
    newW[boxIndex].selectedItems = { ...prevItems, [itemId]: { sizes: newSizes, totalQty } };
    setWorkingBoxes(newW);
  };

  const handleFillRemaining = (boxIndex: number) => {
    const newW = [...workingBoxes];
    const newSelections = { ...newW[boxIndex].selectedItems };
    
    order.items?.forEach((item: any) => {
      if (!newSelections[item.id]) {
        newSelections[item.id] = { sizes: {}, totalQty: 0 };
      }
      item.sizes && Object.entries(item.sizes).forEach(([size, qty]) => {
        const oQty = qty as number;
        if (oQty > 0) {
          // Calculate packed in already saved order.boxes
          let packedQty = order.boxes?.reduce((acc: number, box: any) => {
            const boxItem = box.items?.find((bi: any) => String(bi.id) === String(item.id));
            return acc + (boxItem?.sizes?.[size] || 0);
          }, 0) || 0;
          
          // Calculate packed in OTHER working boxes currently in the form
          packedQty += workingBoxes.reduce((acc, wb, wIndex) => {
             if (wIndex === boxIndex) return acc;
             return acc + (wb.selectedItems[item.id]?.sizes?.[size] || 0);
          }, 0);
          
          const remaining = Math.max(0, oQty - packedQty);
          if (remaining > 0) {
            newSelections[item.id].sizes[size] = remaining;
          }
        }
      });
      newSelections[item.id].totalQty = Object.values(newSelections[item.id].sizes).reduce((a:number, b:any) => a + (parseInt(b)||0), 0);
    });
    
    newW[boxIndex].selectedItems = newSelections;
    setWorkingBoxes(newW);
  };

  const handleSaveAllBoxes = async () => {
    // Only save boxes that have a name and at least some items
    const validNewBoxes = workingBoxes.filter(wb => wb.name.trim() !== "");
    if (validNewBoxes.length === 0) {
      setIsAddingBox(false);
      return;
    }

    const compiledNewBoxes = validNewBoxes.map(wb => {
       const boxItems = Object.entries(wb.selectedItems)
         .filter(([_, data]: any) => data.totalQty > 0)
         .map(([itemId, data]: any) => {
            const orderItem = order.items?.find((i: any) => String(i.id) === String(itemId));
            return {
               id: itemId,
               style: orderItem?.style || 'Unknown Style',
               color: orderItem?.color || '',
               gender: orderItem?.gender || '',
               image: orderItem?.image || '',
               itemNum: orderItem?.itemNum || '',
               sizes: data.sizes,
               qty: data.totalQty
            };
         });

       return {
         id: `box-${wb.id}`, // using our temp ID combined with prefix
         name: wb.name,
         createdAt: new Date().toISOString(),
         items: boxItems
       };
    }).filter(b => b.items.length > 0); // only save if they actually added items to it

    if (compiledNewBoxes.length > 0) {
      const updatedBoxes = [...(order.boxes || []), ...compiledNewBoxes];
      await setDoc(doc(db, 'orders', order.id), { boxes: updatedBoxes }, { merge: true });
    }
    
    setIsAddingBox(false);
    setWorkingBoxes([]);
  };

  const handleDeleteBox = async (boxId: string) => {
    if (!window.confirm("Delete this packing slip/box?")) return;
    const updatedBoxes = (order.boxes || []).filter((b: any) => b.id !== boxId);
    await setDoc(doc(db, 'orders', order.id), { boxes: updatedBoxes }, { merge: true });
  };

  const handlePrintLabel = (boxId: string) => {
    window.open(`/print/label/${order.id}/${boxId}`, '_blank', 'width=600,height=800');
  };

  const baseUrl = window.location.origin;

  return (
    <div className="mt-8">
      <div className="flex justify-between items-center mb-6 pb-2 border-b border-brand-border">
        <h2 className={tokens.typography.h2}>Packing Slips & Labels</h2>
        <PillButton variant="outline" onClick={handleStartAddBox} className="gap-2 shrink-0 px-4 py-2 text-xs">
          <Plus size={14} /> Create Shipment
        </PillButton>
      </div>

      {isAddingBox && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6 overflow-y-auto">
          <div className="bg-white max-w-4xl w-full rounded-2xl overflow-hidden shadow-2xl flex flex-col border border-brand-border my-auto max-h-[90vh]">
            <div className="p-6 border-b border-brand-border flex justify-between items-center bg-brand-bg">
              <h3 className="font-serif text-2xl text-brand-primary">Build Packing Slips</h3>
              <button onClick={() => setIsAddingBox(false)} className="text-brand-secondary hover:text-brand-primary p-1">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-6 custom-scrollbar">
              
              {/* Existing Boxes Context */}
              {(order.boxes?.length > 0) && (
                <div className="bg-neutral-50 border border-brand-border rounded-xl p-5 mb-2">
                   <label className="block text-xs font-bold uppercase tracking-widest text-brand-secondary mb-4">Already Built Shipments</label>
                   <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                     {order.boxes.map((b: any) => (
                       <div key={b.id} className="bg-white border border-brand-border/60 rounded-lg p-3 flex justify-between items-center shadow-sm">
                          <span className="font-bold text-sm text-brand-primary truncate mr-4">{b.name}</span>
                          <span className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary shrink-0 bg-neutral-100 px-2 py-1 rounded-md">
                             {b.items?.reduce((acc: number, item: any) => acc + (item.qty || 0), 0) || 0} ITEMS
                          </span>
                       </div>
                     ))}
                   </div>
                </div>
              )}

              {/* Working Boxes Loop */}
              <div>
                 {workingBoxes.map((wBox, bIndex) => (
                   <div key={wBox.id} className="border-2 border-brand-border bg-white rounded-2xl p-6 mb-8 relative">
                     {/* Box Header */}
                     <div className="flex justify-between items-start mb-6 border-b border-brand-border pb-6">
                        <div className="flex-1 max-w-sm">
                           <label className="block text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-2">Box / Slip Reference Name</label>
                           <input 
                             type="text" 
                             placeholder="e.g. Box 1" 
                             value={wBox.name}
                             onChange={(e) => {
                                const newW = [...workingBoxes];
                                newW[bIndex].name = e.target.value;
                                setWorkingBoxes(newW);
                             }}
                             className="w-full bg-brand-bg/50 border border-brand-border rounded-lg px-4 py-3 text-sm focus:border-brand-primary focus:bg-white outline-none transition-colors font-bold"
                           />
                        </div>
                        {workingBoxes.length > 1 && (
                           <button onClick={() => {
                              setWorkingBoxes(workingBoxes.filter(x => x.id !== wBox.id));
                           }} className="text-red-400 p-2 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors ml-4" title="Remove Shipment">
                              <Trash2 size={20} />
                           </button>
                        )}
                     </div>

                     {/* Item Selector */}
                     <div>
                        <div className="flex justify-between items-center mb-4">
                          <label className="block text-[10px] font-bold uppercase tracking-widest text-brand-secondary">Select Items for {wBox.name || 'this Box'}</label>
                          <button onClick={() => handleFillRemaining(bIndex)} className="text-[10px] uppercase font-bold tracking-widest bg-brand-primary text-white py-1.5 px-4 rounded-full hover:bg-black transition-colors shadow-sm">
                            Auto-Fill Remaining
                          </button>
                        </div>
                        {order.items?.length > 0 ? (
                          <div className="flex flex-col gap-4">
                            {order.items.map((item: any) => {
                               const itemSizes = item.sizes ? Object.entries(item.sizes).filter(([_, qty]) => (qty as number) > 0) : [];
                               if (itemSizes.length === 0) return null;

                               return (
                                 <div key={item.id} className="border border-brand-border rounded-xl p-4 bg-brand-bg/30 flex flex-col md:flex-row gap-4 items-start md:items-center">
                                   <div className="flex items-center gap-4 min-w-[200px]">
                                     {item.image ? (
                                       <img src={item.image} alt={item.style} className="w-10 h-10 rounded-lg bg-white border border-brand-border object-contain p-0.5 shrink-0" />
                                     ) : <div className="w-10 h-10 rounded-lg bg-neutral-100 flex items-center justify-center shrink-0"><Box size={16} className="text-neutral-400" /></div>}
                                     <div>
                                       <p className="font-bold text-sm text-brand-primary leading-tight">{item.style}</p>
                                       <p className="text-[10px] text-brand-secondary mt-0.5">{item.color}</p>
                                     </div>
                                   </div>

                                   <div className="flex flex-wrap gap-2 flex-1 w-full relative">
                                     {Object.keys(item.sizes || {}).sort(sortSizes).map(size => {
                                       const orderQty = item.sizes?.[size];
                                       if (!orderQty) return null;
                                       
                                       const selectedQty = wBox.selectedItems[item.id]?.sizes?.[size] || 0;
                                       
                                       let packedQty = order.boxes?.reduce((acc: number, box: any) => {
                                         const boxItem = box.items?.find((bi: any) => String(bi.id) === String(item.id));
                                         return acc + (boxItem?.sizes?.[size] || 0);
                                       }, 0) || 0;
                                       
                                       packedQty += workingBoxes.reduce((acc, wb) => {
                                          return acc + (wb.selectedItems[item.id]?.sizes?.[size] || 0);
                                       }, 0);
                                       
                                       const remaining = orderQty - packedQty;
                                       
                                       return (
                                         <div key={size} className="flex flex-col w-[55px]">
                                           <div className="flex flex-col items-center justify-center bg-brand-border/30 rounded-t-sm py-0.5 mb-0.5 leading-tight">
                                              <label className="text-[9px] font-bold text-brand-secondary">{size}</label>
                                              <span className={`text-[8px] ${remaining < 0 ? 'text-red-500 font-bold' : remaining === 0 ? 'text-neutral-400 font-medium' : 'text-brand-primary font-bold'}`}>{remaining} Left</span>
                                           </div>
                                           <input 
                                             type="number" 
                                             min="0" 
                                             max={orderQty}
                                             value={selectedQty || ''}
                                             placeholder="0"
                                             onChange={(e) => handleSizeQtyChange(bIndex, item.id, size, parseInt(e.target.value) || 0)}
                                             className="w-full bg-white border border-brand-border rounded-b-sm px-1 py-1.5 text-center text-xs focus:border-brand-primary outline-none"
                                           />
                                         </div>
                                       );
                                     })}
                                   </div>

                                   <div className="md:ml-auto text-right md:border-l border-brand-border md:pl-4 min-w-[60px]">
                                     <p className="text-[9px] uppercase font-bold text-brand-secondary">Total</p>
                                     <p className="text-lg font-black text-brand-primary leading-none mt-1">{(wBox.selectedItems[item.id]?.totalQty) || 0}</p>
                                   </div>
                                 </div>
                               );
                            })}
                          </div>
                        ) : (
                          <p className="text-sm text-brand-secondary">No items in this order to pack.</p>
                        )}
                     </div>
                   </div>
                 ))}
                 
                 <PillButton variant="outline" onClick={handleAddShipment} className="w-full py-5 border-dashed border-2 bg-transparent text-brand-secondary hover:text-brand-primary hover:border-brand-primary justify-center font-bold">
                    <Plus size={18} className="mr-2" /> Add Another Shipment
                 </PillButton>
              </div>
            </div>

            <div className="p-5 bg-brand-bg border-t border-brand-border flex gap-4 mt-auto">
              <PillButton variant="outline" onClick={() => setIsAddingBox(false)} className="px-8 py-3 bg-white">Cancel</PillButton>
              <div className="flex gap-2 ml-auto">
                <PillButton variant="filled" onClick={handleSaveAllBoxes} className="px-8 py-3 justify-center min-w-[200px]">Save & Close All</PillButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {(!order.boxes || order.boxes.length === 0) ? (
        <div className="bg-white p-12 rounded-card border border-brand-border text-center text-brand-secondary shadow-sm mt-4">
          <Box size={40} className="mx-auto mb-4 opacity-30" />
          <h3 className="text-lg font-bold text-brand-primary mb-2">No Packing Slips Built</h3>
          <p className="text-sm max-w-sm mx-auto">Create a box, choose the garments that go inside, and generate a printable thermal QR label.</p>
        </div>
      ) : (
        <div className="bg-white rounded-card border border-brand-border overflow-hidden shadow-sm mt-4">
          {/* Main Dropdown Header */}
          <div 
            className="p-6 flex items-center justify-between cursor-pointer hover:bg-brand-bg transition-colors"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-brand-primary/5 rounded-xl flex items-center justify-center text-brand-primary shrink-0 border border-brand-primary/10">
                <Box size={24} />
              </div>
              <div>
                <h3 className="font-bold text-lg text-brand-primary mb-1">Shipments Overview</h3>
                <p className="text-sm text-brand-secondary font-medium tracking-wide">
                  <strong className="text-brand-primary">{order.boxes.length}</strong> {order.boxes.length === 1 ? 'Package' : 'Packages'} Built • <strong className="text-brand-primary">{order.boxes.reduce((acc: number, box: any) => acc + (box.items?.reduce((iAcc: number, item: any) => iAcc + (item.qty || 0), 0) || 0), 0)}</strong> Items Packed
                </p>
              </div>
            </div>
            <button className="text-brand-secondary hover:text-brand-primary transition-colors flex items-center justify-center w-8 h-8 rounded-full bg-brand-bg">
              <ChevronDown size={20} className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
            </button>
          </div>
          
          {/* Expanded List of Packages */}
          {isExpanded && (
            <div className="border-t border-brand-border/50 bg-gray-50/50 p-6 flex flex-col gap-4">
              {order.boxes.map((box: any) => {
                 const publicUrl = `${baseUrl}/packing-slip/${order.id}/${box.id}`;
                 return (
                   <div key={box.id} className="bg-white rounded-card border border-brand-border shadow-sm flex flex-col md:flex-row p-5 gap-6 md:items-center hover:border-brand-primary/20 transition-colors">
                     
                     {/* Left: Box Info */}
                     <div className="flex items-center gap-4 md:min-w-[220px]">
                       <div className="w-12 h-12 bg-neutral-100 rounded-xl flex items-center justify-center text-brand-primary shrink-0">
                         <Box size={24} />
                       </div>
                       <div>
                         <h3 className="font-bold text-lg text-brand-primary">{box.name}</h3>
                         <p className="text-xs text-brand-secondary font-medium tracking-wide">
                           {box.items?.reduce((acc: number, item: any) => acc + (item.qty || 0), 0) || 0} ITEMS TOTAL
                         </p>
                       </div>
                     </div>
                     
                     {/* Middle: Items List */}
                     <div className="flex-1 md:border-l border-brand-border md:pl-6 max-h-[80px] overflow-y-auto custom-scrollbar flex flex-col gap-1.5 md:pr-4">
                        {box.items?.map((item: any, i: number) => (
                          <div key={i} className="flex items-center justify-between text-sm py-1 border-b border-brand-border/30 last:border-0">
                             <span className="font-medium text-brand-primary truncate max-w-[200px]" title={item.style}>{item.style}</span>
                             <span className="font-bold text-brand-secondary text-xs mr-2 ml-auto">x{item.qty}</span>
                          </div>
                        ))}
                        {(!box.items || box.items.length === 0) && (
                          <p className="text-xs italic text-brand-secondary">No items selected.</p>
                        )}
                     </div>
                     
                     {/* Right: Actions & Public URLs */}
                     <div className="flex items-center justify-end gap-5">
                       <div className="flex flex-col md:flex-row items-center gap-4 md:border-l border-brand-border md:pl-6 shrink-0 mt-4 md:mt-0 pt-4 md:pt-0 border-t md:border-t-0 border-brand-border h-full">
                         <div 
                           className="bg-white p-2 border border-brand-border rounded-lg shadow-sm cursor-pointer hover:border-black transition-colors" 
                           title="Click to Print Thermal Label" 
                           onClick={() => handlePrintLabel(box.id)}
                         >
                           <QRCode value={publicUrl} size={48} />
                         </div>
                         <div className="flex flex-col gap-2 min-w-[140px]">
                           <PillButton variant="outline" className="justify-center text-xs py-1.5 px-3 bg-white border-brand-border shadow-sm border w-full h-[32px]" onClick={() => handlePrintLabel(box.id)}>
                             <Printer size={14} className="mr-1.5" /> Print Label
                           </PillButton>
                           <a href={publicUrl} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-brand-primary hover:text-black transition-colors tooltip w-full h-[32px] bg-brand-bg rounded-full border border-brand-border">
                             <ExternalLink size={12} /> Public URL
                           </a>
                         </div>
                       </div>
    
                       {/* Delete Button */}
                       <button onClick={() => handleDeleteBox(box.id)} className="text-red-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors p-2 shrink-0 self-center" title="Delete Box">
                         <Trash2 size={18} />
                       </button>
                     </div>
                   </div>
                 );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
