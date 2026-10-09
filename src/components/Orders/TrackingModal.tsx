import { useState } from 'react';
import { X, Truck, MapPin, Copy } from 'lucide-react';
import { PillButton } from '../ui/PillButton';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';

export function TrackingModal({ order, boxId, onClose, customer }: { order: any, boxId: string, onClose: () => void, customer?: any }) {
    const box = order.boxes?.find((b: any) => b.id === boxId);
    
    const [carrier, setCarrier] = useState(box?.trackingCarrier || '');
    const [number, setNumber] = useState(box?.trackingNumber || '');
    const [date, setDate] = useState(box?.estArrival || '');
    const [boxName, setBoxName] = useState(box?.name || '');
    
    const initialHasCustom = Boolean(box?.hasCustomShipping || (box?.shippingAddress && (box.shippingAddress.name || box.shippingAddress.street1)));
    const [hasCustomAddress, setHasCustomAddress] = useState(initialHasCustom);
    const [address, setAddress] = useState({
        name: box?.shippingAddress?.name || '',
        company: box?.shippingAddress?.company || '',
        street1: box?.shippingAddress?.street1 || '',
        street2: box?.shippingAddress?.street2 || '',
        city: box?.shippingAddress?.city || '',
        state: box?.shippingAddress?.state || '',
        zip: box?.shippingAddress?.zip || '',
        country: box?.shippingAddress?.country || 'US',
        phone: box?.shippingAddress?.phone || '',
        notes: box?.shippingAddress?.notes || ''
    });

    const [saveToOrderDestinations, setSaveToOrderDestinations] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Compute saved destinations from order configuration, primary address, customer team roster, and boxes
    const savedDestinations: { label: string; address: any }[] = [];

    // 0. Client Team Roster (members with shipping address)
    (customer?.teamRoster || []).forEach((member: any) => {
        if (member && (member.street1 || member.city)) {
            const sizeBadge = member.size ? ` (Size: ${member.size})` : '';
            const roleBadge = member.role ? ` [${member.role}]` : '';
            const summary = `${member.street1 || ''}, ${member.city || ''}${member.state ? `, ${member.state}` : ''}`;
            savedDestinations.push({
                label: `👤 [Team Member] ${member.name}${roleBadge}${sizeBadge}: ${summary}`,
                address: {
                    name: member.name || '',
                    company: customer?.company || customer?.name || '',
                    street1: member.street1 || '',
                    street2: member.street2 || '',
                    city: member.city || '',
                    state: member.state || '',
                    zip: member.zip || '',
                    country: member.country || 'US',
                    phone: member.phone || '',
                    notes: member.notes || (member.size ? `Size: ${member.size}` : '')
                }
            });
        }
    });

    // 1. Order's configured shipping destinations
    (order.shippingDestinations || []).forEach((dest: any, idx: number) => {
        if (dest && (dest.street1 || dest.name)) {
            const title = dest.label || (idx === 0 ? 'Primary Destination' : `Destination ${idx + 1}`);
            const summary = `${dest.name ? `${dest.name} • ` : ''}${dest.street1}, ${dest.city || ''}${dest.state ? `, ${dest.state}` : ''}`;
            savedDestinations.push({
                label: `📍 [Order Saved] ${title}: ${summary}`,
                address: dest
            });
        }
    });
    if (order.shippingAddress && (order.shippingAddress.street1 || order.shippingAddress.name)) {
        const alreadyIn = savedDestinations.some(d => d.address.street1 === order.shippingAddress.street1 && d.address.name === order.shippingAddress.name);
        if (!alreadyIn) {
            savedDestinations.push({
                label: `📍 [Primary Address]: ${order.shippingAddress.name || 'Recipient'} (${order.shippingAddress.city || ''}${order.shippingAddress.state ? `, ${order.shippingAddress.state}` : ''})`,
                address: order.shippingAddress
            });
        }
    }
    (order.boxes || []).forEach((b: any) => {
        if (b.id !== boxId && b.shippingAddress && (b.shippingAddress.name || b.shippingAddress.street1)) {
            const alreadyIn = savedDestinations.some(d => d.address.street1 === b.shippingAddress.street1 && d.address.name === b.shippingAddress.name);
            if (!alreadyIn) {
                savedDestinations.push({
                    label: `📦 [${b.name}]: ${b.shippingAddress.name || 'Recipient'} (${b.shippingAddress.city || ''}${b.shippingAddress.state ? `, ${b.shippingAddress.state}` : ''})`,
                    address: b.shippingAddress
                });
            }
        }
    });

    const handleCopyOrderAddress = () => {
        const ordAddr = order.shippingAddress || {};
        setAddress(prev => ({
            ...prev,
            name: ordAddr.name || order.customerName || '',
            company: ordAddr.company || '',
            street1: ordAddr.street1 || '',
            street2: ordAddr.street2 || '',
            city: ordAddr.city || '',
            state: ordAddr.state || '',
            zip: ordAddr.zip || '',
            country: ordAddr.country || 'US',
            phone: ordAddr.phone || ''
        }));
        setHasCustomAddress(true);
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const isCustom = hasCustomAddress && Boolean(address.name || address.street1 || address.city);
            let updatedDestinations = Array.isArray(order.shippingDestinations) ? [...order.shippingDestinations] : [];
            if (saveToOrderDestinations && isCustom && (address.street1 || address.name)) {
                const alreadyExists = updatedDestinations.some((d: any) =>
                    d.street1?.toLowerCase().trim() === address.street1?.toLowerCase().trim() &&
                    d.name?.toLowerCase().trim() === address.name?.toLowerCase().trim()
                );
                if (!alreadyExists) {
                    updatedDestinations.push({
                        id: `dest-${Date.now()}`,
                        label: boxName.trim() || address.name || `Destination ${updatedDestinations.length + 1}`,
                        name: address.name || '',
                        company: address.company || '',
                        street1: address.street1 || '',
                        street2: address.street2 || '',
                        city: address.city || '',
                        state: address.state || '',
                        zip: address.zip || '',
                        country: address.country || 'US',
                        phone: address.phone || '',
                        notes: address.notes || '',
                        isDefault: false
                    });
                }
            }

            const updatedBoxes = (order.boxes || []).map((b: any) => {
                if (b.id === boxId) {
                    return { 
                        ...b, 
                        name: boxName.trim() || b.name,
                        trackingCarrier: carrier, 
                        trackingNumber: number, 
                        estArrival: date,
                        hasCustomShipping: isCustom,
                        shippingAddress: isCustom ? address : (order.shippingAddress || null)
                    };
                }
                return b;
            });

            const activity = {
                id: `act-${Date.now()}`,
                type: 'system',
                message: `Updated shipment details for ${boxName || box?.name || 'Box'}${isCustom ? ` (Destination: ${address.name || ''} ${address.city ? `• ${address.city}, ${address.state}` : ''})` : ''}`,
                user: 'Team Member',
                timestamp: new Date().toISOString()
            };

            await setDoc(doc(db, 'orders', order.id), { 
                boxes: updatedBoxes,
                ...(saveToOrderDestinations && isCustom && (address.street1 || address.name) ? { shippingDestinations: updatedDestinations } : {}),
                activities: [activity, ...(order.activities || [])]
            }, { merge: true });
            onClose();
        } catch(e) {
            console.error("Error saving tracking", e);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto" onClick={onClose}>
            <div className="bg-white rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl border border-brand-border my-auto max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-start mb-5 pb-3 border-b border-brand-border/60">
                    <div>
                        <h3 className="text-xl font-black text-gray-900 flex items-center gap-2"><Truck size={22} /> Shipment & Destination</h3>
                        <p className="text-xs text-brand-secondary mt-0.5">Manage tracking carrier and delivery location for this shipment package.</p>
                    </div>
                    <button className="p-2 bg-neutral-100 hover:bg-neutral-200 rounded-full transition-colors shrink-0" onClick={onClose}><X size={16} /></button>
                </div>

                <div className="space-y-5 overflow-y-auto custom-scrollbar pr-1 flex-1 mb-6">
                    {/* Shipment Name */}
                    <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-brand-secondary mb-1">Shipment / Box Label</label>
                        <input 
                            type="text" 
                            value={boxName} 
                            onChange={e => setBoxName(e.target.value)} 
                            placeholder="e.g. Box 1, West Coast Office, Drop 2" 
                            className="w-full bg-brand-bg/50 border border-brand-border rounded-xl px-3.5 py-2.5 text-sm font-semibold focus:border-brand-primary outline-none" 
                        />
                    </div>

                    {/* Carrier & Tracking */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[11px] font-bold uppercase tracking-wider text-brand-secondary mb-1">Carrier</label>
                            <select value={carrier} onChange={e => setCarrier(e.target.value)} className="w-full bg-brand-bg/50 border border-brand-border rounded-xl px-3 py-2.5 text-sm focus:border-brand-primary outline-none text-gray-800 font-medium">
                                <option value="">Select Carrier...</option>
                                <option value="UPS">UPS</option>
                                <option value="FedEx">FedEx</option>
                                <option value="USPS">USPS</option>
                                <option value="DHL">DHL</option>
                                <option value="Pickup">Pickup/Local Delivery</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-[11px] font-bold uppercase tracking-wider text-brand-secondary mb-1">Est. Arrival Date</label>
                            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full bg-brand-bg/50 border border-brand-border rounded-xl px-3 py-2.5 text-sm focus:border-brand-primary outline-none text-gray-800 font-medium" />
                        </div>
                    </div>

                    {(carrier !== '' && carrier !== 'Pickup') && (
                        <div>
                            <label className="block text-[11px] font-bold uppercase tracking-wider text-brand-secondary mb-1">Tracking Number</label>
                            <input type="text" value={number} onChange={e => setNumber(e.target.value)} className="w-full bg-brand-bg/50 border border-brand-border rounded-xl px-3.5 py-2.5 text-sm font-mono focus:border-brand-primary outline-none" placeholder="e.g. 1Z9999999999999999" />
                        </div>
                    )}

                    {/* Delivery Destination Section */}
                    <div className="pt-3 border-t border-brand-border/60">
                        <div className="flex items-center justify-between mb-3">
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input 
                                    type="checkbox"
                                    checked={hasCustomAddress}
                                    onChange={e => setHasCustomAddress(e.target.checked)}
                                    className="w-4 h-4 rounded border-brand-border text-brand-primary focus:ring-brand-primary cursor-pointer accent-black"
                                />
                                <span className="text-xs font-bold text-brand-primary flex items-center gap-1.5">
                                    <MapPin size={14} className={hasCustomAddress ? "text-blue-600" : "text-neutral-400"} />
                                    Ship to a separate location / address
                                </span>
                            </label>

                            {hasCustomAddress && (
                                <button 
                                    type="button" 
                                    onClick={handleCopyOrderAddress}
                                    className="text-[10px] font-bold uppercase tracking-wider text-brand-primary hover:text-black flex items-center gap-1 bg-neutral-100 hover:bg-neutral-200 px-2 py-1 rounded-md transition-colors"
                                    title="Fill with main order shipping address"
                                >
                                    <Copy size={11} /> Copy Order Address
                                </button>
                            )}
                        </div>

                        {hasCustomAddress ? (
                            <div className="bg-neutral-50/70 p-4 rounded-2xl border border-brand-border/80 space-y-3">
                                {savedDestinations.length > 0 && (
                                    <div className="pb-3 border-b border-brand-border/60">
                                        <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-secondary mb-1">Select from existing order locations</label>
                                        <select 
                                            onChange={(e) => {
                                                const idx = parseInt(e.target.value);
                                                if (!isNaN(idx) && savedDestinations[idx]) {
                                                    const sel = savedDestinations[idx].address;
                                                    setAddress({
                                                        name: sel.name || '',
                                                        company: sel.company || '',
                                                        street1: sel.street1 || '',
                                                        street2: sel.street2 || '',
                                                        city: sel.city || '',
                                                        state: sel.state || '',
                                                        zip: sel.zip || '',
                                                        country: sel.country || 'US',
                                                        phone: sel.phone || '',
                                                        notes: sel.notes || ''
                                                    });
                                                }
                                            }}
                                            defaultValue=""
                                            className="w-full bg-white border border-brand-border rounded-lg px-3 py-1.5 text-xs font-semibold focus:border-brand-primary outline-none"
                                        >
                                            <option value="">-- Choose a location saved for this order --</option>
                                            {savedDestinations.map((d, i) => (
                                                <option key={i} value={i}>{d.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-secondary mb-1">Recipient Name *</label>
                                        <input 
                                            type="text" 
                                            value={address.name} 
                                            onChange={e => setAddress(prev => ({ ...prev, name: e.target.value }))}
                                            placeholder="e.g. Jane Doe"
                                            className="w-full bg-white border border-brand-border rounded-lg px-3 py-1.5 text-xs font-semibold focus:border-brand-primary outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-secondary mb-1">Company (Optional)</label>
                                        <input 
                                            type="text" 
                                            value={address.company} 
                                            onChange={e => setAddress(prev => ({ ...prev, company: e.target.value }))}
                                            placeholder="e.g. Acme Corp"
                                            className="w-full bg-white border border-brand-border rounded-lg px-3 py-1.5 text-xs focus:border-brand-primary outline-none"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-secondary mb-1">Street Address *</label>
                                    <input 
                                        type="text" 
                                        value={address.street1} 
                                        onChange={e => setAddress(prev => ({ ...prev, street1: e.target.value }))}
                                        placeholder="123 Main St"
                                        className="w-full bg-white border border-brand-border rounded-lg px-3 py-1.5 text-xs focus:border-brand-primary outline-none mb-2"
                                    />
                                    <input 
                                        type="text" 
                                        value={address.street2} 
                                        onChange={e => setAddress(prev => ({ ...prev, street2: e.target.value }))}
                                        placeholder="Apt, Suite, Unit (optional)"
                                        className="w-full bg-white border border-brand-border rounded-lg px-3 py-1.5 text-xs focus:border-brand-primary outline-none"
                                    />
                                </div>

                                <div className="grid grid-cols-3 gap-2">
                                    <div className="col-span-1">
                                        <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-secondary mb-1">City *</label>
                                        <input 
                                            type="text" 
                                            value={address.city} 
                                            onChange={e => setAddress(prev => ({ ...prev, city: e.target.value }))}
                                            placeholder="City"
                                            className="w-full bg-white border border-brand-border rounded-lg px-3 py-1.5 text-xs focus:border-brand-primary outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-secondary mb-1">State *</label>
                                        <input 
                                            type="text" 
                                            value={address.state} 
                                            onChange={e => setAddress(prev => ({ ...prev, state: e.target.value.toUpperCase() }))}
                                            placeholder="ST"
                                            maxLength={3}
                                            className="w-full bg-white border border-brand-border rounded-lg px-3 py-1.5 text-xs uppercase focus:border-brand-primary outline-none font-bold"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-secondary mb-1">ZIP *</label>
                                        <input 
                                            type="text" 
                                            value={address.zip} 
                                            onChange={e => setAddress(prev => ({ ...prev, zip: e.target.value }))}
                                            placeholder="ZIP"
                                            className="w-full bg-white border border-brand-border rounded-lg px-3 py-1.5 text-xs focus:border-brand-primary outline-none"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3 pt-1">
                                    <div>
                                        <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-secondary mb-1">Phone</label>
                                        <input 
                                            type="text" 
                                            value={address.phone} 
                                            onChange={e => setAddress(prev => ({ ...prev, phone: e.target.value }))}
                                            placeholder="(555) 000-0000"
                                            className="w-full bg-white border border-brand-border rounded-lg px-3 py-1.5 text-xs focus:border-brand-primary outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-secondary mb-1">Delivery Notes</label>
                                        <input 
                                            type="text" 
                                            value={address.notes} 
                                            onChange={e => setAddress(prev => ({ ...prev, notes: e.target.value }))}
                                            placeholder="e.g. Leave at front desk"
                                            className="w-full bg-white border border-brand-border rounded-lg px-3 py-1.5 text-xs focus:border-brand-primary outline-none"
                                        />
                                    </div>
                                </div>

                                <div className="pt-1">
                                    <label className="flex items-center gap-2 cursor-pointer select-none">
                                        <input 
                                            type="checkbox"
                                            checked={saveToOrderDestinations}
                                            onChange={e => setSaveToOrderDestinations(e.target.checked)}
                                            className="w-4 h-4 rounded border-brand-border text-brand-primary focus:ring-brand-primary cursor-pointer accent-black"
                                        />
                                        <span className="text-[11px] font-semibold text-brand-secondary">
                                            Save this destination to order profile for future shipments
                                        </span>
                                    </label>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-neutral-50/60 p-3.5 rounded-xl border border-dashed border-brand-border text-xs text-brand-secondary flex items-start gap-2.5">
                                <MapPin size={16} className="text-neutral-400 shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-semibold text-brand-primary">Ships to Order Destination</p>
                                    <p className="text-[11px] text-gray-500 mt-0.5">
                                        {order.shippingAddress?.street1 ? (
                                            `${order.shippingAddress.name ? order.shippingAddress.name + ' • ' : ''}${order.shippingAddress.street1}, ${order.shippingAddress.city || ''}, ${order.shippingAddress.state || ''} ${order.shippingAddress.zip || ''}`
                                        ) : (
                                            'Using customer / primary order address on file.'
                                        )}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex gap-4 pt-3 border-t border-brand-border/60">
                    <PillButton variant="outline" onClick={onClose} className="flex-1 justify-center py-3 bg-white">Cancel</PillButton>
                    <PillButton variant="filled" onClick={handleSave} className="flex-1 justify-center py-3 text-white bg-black hover:bg-neutral-800" disabled={isSaving}>
                        {isSaving ? 'Saving...' : 'Save Shipment Details'}
                    </PillButton>
                </div>
            </div>
        </div>
    );
}
