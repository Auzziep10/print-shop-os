import { useState } from 'react';
import QRCode from 'react-qr-code';
import { db } from '../../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { PillButton } from '../ui/PillButton';
import { Plus, Trash2, Box, ExternalLink, Printer, X } from 'lucide-react';
import { tokens } from '../../lib/tokens';

export function PackingSlipsManager({ order }: { order: any }) {
  const [isAddingBox, setIsAddingBox] = useState(false);
  const [newBoxName, setNewBoxName] = useState('');
  const [selectedItems, setSelectedItems] = useState<any>({});
  
  const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', 'OSFA'];

  const handleStartAddBox = () => {
    setNewBoxName('');
    setSelectedItems({});
    setIsAddingBox(true);
  };

  const handleSizeQtyChange = (itemId: string, size: string, qty: number) => {
    setSelectedItems((prev: any) => {
      const itemData = prev[itemId] || { sizes: {}, totalQty: 0 };
      const newSizes = { ...itemData.sizes, [size]: qty };
      const totalQty = Object.values(newSizes).reduce((acc: number, val: any) => acc + (parseInt(val) || 0), 0);
      return { ...prev, [itemId]: { sizes: newSizes, totalQty } };
    });
  };

  const handleAddBox = async (keepOpen = false) => {
    if (!newBoxName.trim()) return;
    
    // Map selected items to an array
    const boxItems = Object.entries(selectedItems)
      .filter(([_, data]: any) => data.totalQty > 0)
      .map(([itemId, data]: any) => {
         const orderItem = order.items?.find((i: any) => i.id === itemId);
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

    const newBox = {
      id: `box-${Date.now()}`,
      name: newBoxName,
      createdAt: new Date().toISOString(),
      items: boxItems
    };
    
    const updatedBoxes = [...(order.boxes || []), newBox];
    await setDoc(doc(db, 'orders', order.id), { boxes: updatedBoxes }, { merge: true });
    
    if (keepOpen) {
      // Auto-increment box number
      const match = newBoxName.match(/^(.*?)(\d+)$/);
      if (match) {
        setNewBoxName(`${match[1]}${parseInt(match[2]) + 1}`);
      } else {
        setNewBoxName(`${newBoxName} 2`);
      }
      setSelectedItems({});
    } else {
      setIsAddingBox(false);
      setNewBoxName('');
      setSelectedItems({});
    }
  };

  const handleFillRemaining = () => {
    const newSelections = { ...selectedItems };
    order.items?.forEach((item: any) => {
      if (!newSelections[item.id]) {
        newSelections[item.id] = { sizes: {}, totalQty: 0 };
      }
      item.sizes && Object.entries(item.sizes).forEach(([size, qty]) => {
        const oQty = qty as number;
        if (oQty > 0) {
          const packedQty = order.boxes?.reduce((acc: number, box: any) => {
            const boxItem = box.items?.find((bi: any) => bi.id === item.id);
            return acc + (boxItem?.sizes?.[size] || 0);
          }, 0) || 0;
          
          const remaining = Math.max(0, oQty - packedQty);
          if (remaining > 0) {
            newSelections[item.id].sizes[size] = remaining;
          }
        }
      });
      newSelections[item.id].totalQty = Object.values(newSelections[item.id].sizes).reduce((a:number, b:any) => a + (parseInt(b)||0), 0);
    });
    setSelectedItems(newSelections);
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
    <div className="mt-8 relative z-0">
      <div className="flex justify-between items-center mb-6 pb-2 border-b border-brand-border">
        <h2 className={tokens.typography.h2}>Packing Slips & Labels</h2>
        <PillButton variant="outline" onClick={handleStartAddBox} className="gap-2 shrink-0 px-4 py-2 text-xs">
          <Plus size={14} /> Create Box / Slip
        </PillButton>
      </div>

      {isAddingBox && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6 overflow-y-auto">
          <div className="bg-white max-w-3xl w-full rounded-2xl overflow-hidden shadow-2xl flex flex-col border border-brand-border my-auto max-h-[90vh]">
            <div className="p-6 border-b border-brand-border flex justify-between items-center bg-brand-bg">
              <h3 className="font-serif text-2xl text-brand-primary">Build New Packing Slip</h3>
              <button onClick={() => setIsAddingBox(false)} className="text-brand-secondary hover:text-brand-primary p-1">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-8">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-brand-secondary mb-2">Box / Slip Reference Name</label>
                <input 
                  type="text" 
                  placeholder="e.g. Box 1" 
                  value={newBoxName}
                  onChange={(e) => setNewBoxName(e.target.value)}
                  className="w-full bg-white border border-brand-border rounded-lg px-4 py-3 text-sm focus:border-brand-primary outline-none transition-colors"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-4">
                  <label className="block text-xs font-bold uppercase tracking-widest text-brand-secondary">Select Items for this Box</label>
                  <button onClick={handleFillRemaining} className="text-[10px] uppercase font-bold tracking-widest bg-brand-primary text-white py-1 px-3 rounded-full hover:bg-black transition-colors">
                    Auto-Fill Remaining
                  </button>
                </div>
                {order.items?.length > 0 ? (
                  <div className="flex flex-col gap-6">
                    {order.items.map((item: any) => {
                       const itemSizes = item.sizes ? Object.entries(item.sizes).filter(([_, qty]) => (qty as number) > 0) : [];
                       if (itemSizes.length === 0) return null; // Skip items with no quantities

                       // Calculate total available vs packed (if we tracked packed outside context, but for now we just show order total)
                       return (
                         <div key={item.id} className="border border-brand-border rounded-xl p-5 bg-brand-bg/30">
                           <div className="flex items-center gap-4 mb-4 pb-4 border-b border-brand-border">
                             {item.image ? (
                               <img src={item.image} alt={item.style} className="w-12 h-12 rounded-lg bg-white border border-brand-border object-contain p-1" />
                             ) : <div className="w-12 h-12 rounded-lg bg-neutral-100 flex items-center justify-center"><Box size={20} className="text-neutral-400" /></div>}
                             <div>
                               <p className="font-bold text-sm text-brand-primary">{item.style}</p>
                               <p className="text-xs text-brand-secondary">{item.color} • {item.gender}</p>
                             </div>
                             <div className="ml-auto text-right">
                               <p className="text-[10px] uppercase font-bold text-brand-secondary">Box Total</p>
                               <p className="text-lg font-bold">{(selectedItems[item.id]?.totalQty) || 0}</p>
                             </div>
                           </div>

                           <div className="flex flex-wrap gap-4">
                             {SIZE_ORDER.map(size => {
                               const orderQty = item.sizes?.[size];
                               if (!orderQty) return null;
                               
                               const selectedQty = selectedItems[item.id]?.sizes?.[size] || 0;
                               
                               return (
                                 <div key={size} className="flex flex-col w-20">
                                   <label className="text-[10px] font-bold text-brand-secondary text-center mb-1 bg-brand-border/30 rounded-t-md py-1">{size} (Max {orderQty})</label>
                                   <input 
                                     type="number" 
                                     min="0" 
                                     max={orderQty}
                                     value={selectedQty || ''}
                                     placeholder="0"
                                     onChange={(e) => handleSizeQtyChange(item.id, size, parseInt(e.target.value) || 0)}
                                     className="w-full bg-white border border-brand-border rounded-b-md px-2 py-2 text-center focus:border-brand-primary outline-none"
                                   />
                                 </div>
                               );
                             })}
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

            <div className="p-4 bg-brand-bg border-t border-brand-border flex gap-4">
              <PillButton variant="outline" onClick={() => setIsAddingBox(false)} className="px-6 py-3">Cancel</PillButton>
              <div className="flex gap-2 ml-auto">
                <PillButton variant="outline" onClick={() => handleAddBox(true)} className="px-6 py-3 bg-white" disabled={!newBoxName.trim()}>Save & Add Another</PillButton>
                <PillButton variant="filled" onClick={() => handleAddBox(false)} className="px-6 py-3 w-40 justify-center" disabled={!newBoxName.trim()}>Save & Close</PillButton>
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
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 mt-4">
          {order.boxes.map((box: any) => {
             const publicUrl = `${baseUrl}/packing-slip/${order.id}/${box.id}`;
             return (
               <div key={box.id} className="bg-white rounded-card border border-brand-border shadow-sm flex flex-col hover:border-brand-primary/20 transition-colors">
                 {/* Internal items display logic below */}
                 <div className="p-5 border-b border-brand-border flex justify-between items-start">
                   <div className="flex items-center gap-4">
                     <div className="w-12 h-12 bg-neutral-100 rounded-xl flex items-center justify-center text-brand-primary">
                       <Box size={24} />
                     </div>
                     <div>
                       <h3 className="font-bold text-lg text-brand-primary">{box.name}</h3>
                       <p className="text-xs text-brand-secondary font-medium tracking-wide">
                         {box.items?.reduce((acc: number, item: any) => acc + (item.qty || 0), 0) || 0} ITEMS TOTAL
                       </p>
                     </div>
                   </div>
                   <button onClick={() => handleDeleteBox(box.id)} className="text-red-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors p-2" title="Delete Box">
                     <Trash2 size={18} />
                   </button>
                 </div>
                 
                 <div className="p-5 flex-1 flex flex-col gap-5">
                   {/* Preview Items */}
                   <div className="flex flex-col gap-2 max-h-32 overflow-y-auto pr-2 custom-scrollbar border border-transparent">
                      {box.items?.map((item: any, i: number) => (
                        <div key={i} className="flex items-center justify-between text-sm py-1 border-b border-brand-border/30 last:border-0">
                           <span className="font-medium text-brand-primary truncate max-w-[150px]" title={item.style}>{item.style}</span>
                           <span className="font-bold text-brand-secondary text-xs mr-2 ml-auto">x{item.qty}</span>
                        </div>
                      ))}
                      {(!box.items || box.items.length === 0) && (
                        <p className="text-xs italic text-brand-secondary">No items selected.</p>
                      )}
                   </div>
                   
                   {/* QR Code Segment */}
                   <div className="flex gap-4 p-4 bg-brand-bg/50 rounded-xl border border-brand-border items-center mt-auto">
                     <div className="bg-white p-2 border border-brand-border rounded-lg shrink-0 shadow-sm cursor-pointer hover:border-black transition-colors" title="Scan to test" onClick={() => window.open(publicUrl, '_blank')}>
                       <QRCode value={publicUrl} size={50} />
                     </div>
                     <div className="flex flex-col gap-1.5 flex-1">
                       <a href={publicUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-brand-primary hover:text-black transition-colors tooltip">
                         <ExternalLink size={12} /> Public URL
                       </a>
                       <PillButton variant="outline" className="w-full justify-center text-xs py-1.5 mt-1 gap-1.5 bg-white border-brand-border shadow-sm border" onClick={() => handlePrintLabel(box.id)}>
                         <Printer size={14} /> Print Thermal Label
                       </PillButton>
                     </div>
                   </div>
                 </div>
               </div>
             );
          })}
        </div>
      )}
    </div>
  );
}
