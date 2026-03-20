import { useState } from 'react';
import { X, Truck } from 'lucide-react';
import { PillButton } from '../ui/PillButton';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';

export function TrackingModal({ order, boxId, onClose }: { order: any, boxId: string, onClose: () => void }) {
    const box = order.boxes?.find((b: any) => b.id === boxId);
    
    const [carrier, setCarrier] = useState(box?.trackingCarrier || '');
    const [number, setNumber] = useState(box?.trackingNumber || '');
    const [date, setDate] = useState(box?.estArrival || '');
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const updatedBoxes = (order.boxes || []).map((b: any) => {
                if (b.id === boxId) {
                    return { ...b, trackingCarrier: carrier, trackingNumber: number, estArrival: date };
                }
                return b;
            });
            await setDoc(doc(db, 'orders', order.id), { boxes: updatedBoxes }, { merge: true });
            onClose();
        } catch(e) {
            console.error("Error saving tracking", e);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
            <div className="bg-white rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl border border-brand-border" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-start mb-6">
                    <h3 className="text-xl font-black text-gray-900 flex items-center gap-2"><Truck size={24} /> Edit Shipment Info</h3>
                    <button className="p-2 bg-neutral-100 hover:bg-neutral-200 rounded-full transition-colors" onClick={onClose}><X size={16} /></button>
                </div>

                <div className="space-y-4 mb-8">
                    <div>
                        <label className="block text-xs font-bold uppercase text-brand-secondary mb-1">Carrier</label>
                        <select value={carrier} onChange={e => setCarrier(e.target.value)} className="w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-3 text-sm focus:border-brand-primary outline-none text-gray-800">
                            <option value="">Select Carrier...</option>
                            <option value="UPS">UPS</option>
                            <option value="FedEx">FedEx</option>
                            <option value="USPS">USPS</option>
                            <option value="DHL">DHL</option>
                            <option value="Pickup">Pickup/Local Delivery</option>
                        </select>
                    </div>

                    {(carrier === '' || carrier === 'Pickup') ? null : (
                        <div>
                            <label className="block text-xs font-bold uppercase text-brand-secondary mb-1">Tracking Number</label>
                            <input type="text" value={number} onChange={e => setNumber(e.target.value)} className="w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-3 text-sm focus:border-brand-primary outline-none" placeholder="e.g. 1Z..." />
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-bold uppercase text-brand-secondary mb-1">Est. Arrival Date</label>
                        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-3 text-sm focus:border-brand-primary outline-none text-gray-800" />
                    </div>
                </div>

                <div className="flex gap-4">
                    <PillButton variant="outline" onClick={onClose} className="flex-1 justify-center py-4 bg-white">Cancel</PillButton>
                    <PillButton variant="filled" onClick={handleSave} className="flex-1 justify-center py-4 text-white bg-black hover:bg-neutral-800" disabled={isSaving}>
                        {isSaving ? 'Saving...' : 'Save Info'}
                    </PillButton>
                </div>
            </div>
        </div>
    );
}
