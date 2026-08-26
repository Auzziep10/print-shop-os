import React, { useState, useEffect } from 'react';
import QRCode from 'react-qr-code';
import { X, Check, Save, Printer, Sparkles, Palette, QrCode as QrIcon, FileText, Image as ImageIcon } from 'lucide-react';
import { DEFAULT_BOX_LABEL_PRESETS } from '../../types/boxLabel';
import type { BoxLabelPreset } from '../../types/boxLabel';
import { fetchBoxLabelPresets, saveBoxLabelPreset, setDefaultBoxLabelPreset } from '../../lib/boxLabelUtils';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage, db } from '../../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';

interface BoxLabelCustomizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  order?: any;
  boxId?: string;
  onApplyToOrder?: (preset: BoxLabelPreset) => void;
}

export function BoxLabelCustomizerModal({
  isOpen,
  onClose,
  order,
  boxId,
  onApplyToOrder
}: BoxLabelCustomizerModalProps) {
  const [presets, setPresets] = useState<BoxLabelPreset[]>(DEFAULT_BOX_LABEL_PRESETS);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('clean-white');
  const [activePreset, setActivePreset] = useState<BoxLabelPreset>(DEFAULT_BOX_LABEL_PRESETS[0]);
  const [activeTab, setActiveTab] = useState<'branding' | 'styling' | 'qr' | 'content'>('branding');

  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [isSaveAsDialogOpen, setIsSaveAsDialogOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Load presets on mount / modal open
  useEffect(() => {
    if (isOpen) {
      fetchBoxLabelPresets().then(loadedPresets => {
        setPresets(loadedPresets);
        // Check if order carries custom label preset
        if (order?.boxLabelPreset) {
          setActivePreset(order.boxLabelPreset);
          if (order.boxLabelPreset.id) {
            setSelectedPresetId(order.boxLabelPreset.id);
          }
        } else {
          const defaultP = loadedPresets.find(p => p.isDefault) || loadedPresets[0];
          setActivePreset(defaultP);
          setSelectedPresetId(defaultP.id);
        }
      });
    }
  }, [isOpen, order]);

  if (!isOpen) return null;

  const handleSelectPreset = (id: string) => {
    const found = presets.find(p => p.id === id);
    if (found) {
      setSelectedPresetId(id);
      setActivePreset({ ...found });
    }
  };

  const handleUpdatePresetField = (fields: Partial<BoxLabelPreset>) => {
    setActivePreset(prev => ({
      ...prev,
      ...fields
    }));
  };

  const handleSaveCurrentPreset = async () => {
    setIsSavingPreset(true);
    setStatusMessage(null);
    try {
      await saveBoxLabelPreset(activePreset);
      const updated = await fetchBoxLabelPresets();
      setPresets(updated);
      setStatusMessage('Preset saved successfully!');
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      console.error(err);
      alert('Failed to save preset');
    } finally {
      setIsSavingPreset(false);
    }
  };

  const handleSaveAsNewPreset = async () => {
    if (!newPresetName.trim()) return;
    setIsSavingPreset(true);
    try {
      const newId = `preset-${Date.now()}`;
      const newPreset: BoxLabelPreset = {
        ...activePreset,
        id: newId,
        name: newPresetName.trim(),
        isDefault: false,
        createdAt: new Date().toISOString()
      };
      await saveBoxLabelPreset(newPreset);
      const updated = await fetchBoxLabelPresets();
      setPresets(updated);
      setSelectedPresetId(newId);
      setActivePreset(newPreset);
      setIsSaveAsDialogOpen(false);
      setNewPresetName('');
      setStatusMessage('New preset created and saved!');
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      console.error(err);
      alert('Failed to save new preset');
    } finally {
      setIsSavingPreset(false);
    }
  };

  const handleSetAsDefault = async () => {
    setIsSavingPreset(true);
    try {
      await setDefaultBoxLabelPreset(activePreset.id);
      const updated = await fetchBoxLabelPresets();
      setPresets(updated);
      setActivePreset(prev => ({ ...prev, isDefault: true }));
      setStatusMessage(`"${activePreset.name}" set as global shop default!`);
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      console.error(err);
      alert('Failed to set default preset');
    } finally {
      setIsSavingPreset(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingLogo(true);
    try {
      const storageRef = ref(storage, `label_logos/logo_${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      handleUpdatePresetField({ logoType: 'custom', customLogoUrl: url });
    } catch (err) {
      console.error('Logo upload failed:', err);
      alert('Failed to upload logo image');
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleApplyToOrderAndSave = async () => {
    if (order?.id) {
      try {
        await updateDoc(doc(db, 'orders', order.id), {
          boxLabelPreset: activePreset,
          updatedAt: new Date().toISOString()
        });
        if (onApplyToOrder) onApplyToOrder(activePreset);
      } catch (err) {
        console.error('Failed to save label preset to order:', err);
      }
    }
    onClose();
  };

  // Sample data for live preview
  const sampleBoxName = boxId ? (order?.boxes?.find((b: any) => b.id === boxId)?.name || 'Box 1 of 4') : 'Box 1 of 4';
  const sampleCustomer = order?.customerName || order?.company || 'REBORN RV';
  const sampleOrderNum = order?.portalId || order?.id || '260826-1';
  const sampleQrUrl = `${window.location.origin}/packing-slip/${order?.id || 'sample-order'}/${boxId || 'sample-box'}`;
  const sampleItemsText = order?.items?.length ? `${order.items.length} Line Items • ${order.items.reduce((s: number, i: any) => s + (i.qty || 1), 0)} Total Pcs` : '45x Heavyweight Tee, 30x Fleece';

  return (
    <div className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl border border-neutral-200 flex flex-col overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-200 flex justify-between items-center bg-white text-neutral-900 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-50 rounded-lg border border-amber-200">
              <Sparkles size={20} className="text-amber-600" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight text-neutral-900">Box QR Label Designer</h2>
              <p className="text-xs text-neutral-500">Customize box thermal QR labels & save presets for future orders</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-neutral-100 rounded-lg transition-colors text-neutral-400 hover:text-neutral-900 cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Status Alert Banner */}
        {statusMessage && (
          <div className="bg-emerald-600 text-white px-6 py-2 text-xs font-bold flex items-center justify-between animate-in fade-in duration-200">
            <span className="flex items-center gap-2">
              <Check size={16} /> {statusMessage}
            </span>
          </div>
        )}

        {/* Content Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 overflow-hidden">
          {/* Controls Side (Left - 7 cols) */}
          <div className="lg:col-span-7 p-6 overflow-y-auto border-r border-neutral-200 flex flex-col gap-5">
            
            {/* Presets Bar */}
            <div className="bg-neutral-50 p-3.5 rounded-xl border border-neutral-200 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-neutral-700 uppercase tracking-wider">Active Preset</label>
                {activePreset.isDefault && (
                  <span className="bg-amber-100 text-amber-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-amber-300">
                    SHOP DEFAULT PRESET
                  </span>
                )}
              </div>
              
              <div className="flex items-center gap-2">
                <select
                  value={selectedPresetId}
                  onChange={(e) => handleSelectPreset(e.target.value)}
                  className="flex-1 bg-white border border-neutral-300 rounded-xl px-3 py-2 text-xs font-bold text-neutral-900 focus:outline-none focus:border-neutral-900 cursor-pointer"
                >
                  {presets.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.isDefault ? '(Default)' : ''}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={handleSaveCurrentPreset}
                  disabled={isSavingPreset}
                  className="bg-neutral-900 hover:bg-black text-white text-xs font-bold px-3 py-2 rounded-xl transition-colors shrink-0 flex items-center gap-1.5"
                  title="Save changes to selected preset"
                >
                  <Save size={14} /> Save
                </button>

                <button
                  type="button"
                  onClick={() => setIsSaveAsDialogOpen(true)}
                  className="bg-white border border-neutral-300 hover:bg-neutral-100 text-neutral-800 text-xs font-bold px-3 py-2 rounded-xl transition-colors shrink-0 flex items-center gap-1.5"
                >
                  <Sparkles size={14} className="text-amber-500" /> Save As...
                </button>
              </div>

              {!activePreset.isDefault && (
                <button
                  type="button"
                  onClick={handleSetAsDefault}
                  className="text-[11px] font-bold text-neutral-600 hover:text-neutral-900 underline self-start transition-colors"
                >
                  Make "{activePreset.name}" the default preset for all future orders
                </button>
              )}
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-neutral-200">
              <button
                onClick={() => setActiveTab('branding')}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-colors cursor-pointer ${activeTab === 'branding' ? 'border-neutral-900 text-neutral-900' : 'border-transparent text-neutral-400 hover:text-neutral-700'}`}
              >
                <ImageIcon size={14} /> Header & Brand
              </button>
              <button
                onClick={() => setActiveTab('styling')}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-colors cursor-pointer ${activeTab === 'styling' ? 'border-neutral-900 text-neutral-900' : 'border-transparent text-neutral-400 hover:text-neutral-700'}`}
              >
                <Palette size={14} /> Colors & Styling
              </button>
              <button
                onClick={() => setActiveTab('qr')}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-colors cursor-pointer ${activeTab === 'qr' ? 'border-neutral-900 text-neutral-900' : 'border-transparent text-neutral-400 hover:text-neutral-700'}`}
              >
                <QrIcon size={14} /> QR Code
              </button>
              <button
                onClick={() => setActiveTab('content')}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-colors cursor-pointer ${activeTab === 'content' ? 'border-neutral-900 text-neutral-900' : 'border-transparent text-neutral-400 hover:text-neutral-700'}`}
              >
                <FileText size={14} /> Label Content
              </button>
            </div>

            {/* Tab Controls Content */}
            <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-4">
              
              {/* BRANDING TAB */}
              {activeTab === 'branding' && (
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="text-xs font-bold text-neutral-700 uppercase tracking-wider block mb-2">Header Logo Source</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleUpdatePresetField({ logoType: 'wovn' })}
                        className={`p-2.5 rounded-xl border text-xs font-bold text-left transition-all ${activePreset.logoType === 'wovn' ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 hover:bg-neutral-50 text-neutral-800'}`}
                      >
                        WOVN Logo
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdatePresetField({ logoType: 'customer' })}
                        className={`p-2.5 rounded-xl border text-xs font-bold text-left transition-all ${activePreset.logoType === 'customer' ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 hover:bg-neutral-50 text-neutral-800'}`}
                      >
                        Customer Logo / Name
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdatePresetField({ logoType: 'custom' })}
                        className={`p-2.5 rounded-xl border text-xs font-bold text-left transition-all ${activePreset.logoType === 'custom' ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 hover:bg-neutral-50 text-neutral-800'}`}
                      >
                        Custom Upload Logo
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdatePresetField({ logoType: 'none' })}
                        className={`p-2.5 rounded-xl border text-xs font-bold text-left transition-all ${activePreset.logoType === 'none' ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 hover:bg-neutral-50 text-neutral-800'}`}
                      >
                        Hide Logo
                      </button>
                    </div>
                  </div>

                  {activePreset.logoType === 'custom' && (
                    <div className="bg-neutral-50 p-3.5 rounded-xl border border-neutral-200 flex flex-col gap-2">
                      <label className="text-xs font-bold text-neutral-700 uppercase tracking-wider block">Upload Custom Logo File</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleLogoUpload}
                        disabled={isUploadingLogo}
                        className="text-xs text-neutral-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-neutral-900 file:text-white hover:file:bg-black cursor-pointer"
                      />
                      {activePreset.customLogoUrl && (
                        <div className="mt-2 p-2 bg-white rounded-lg border border-neutral-200 max-h-16 flex items-center justify-center">
                          <img src={activePreset.customLogoUrl} alt="Custom Logo" className="max-h-12 object-contain" />
                        </div>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-bold text-neutral-700 uppercase tracking-wider block mb-1">Header Title Text Override</label>
                    <input
                      type="text"
                      value={activePreset.headerText || ''}
                      onChange={(e) => handleUpdatePresetField({ headerText: e.target.value })}
                      placeholder="e.g. WOVN PRINT SHOP"
                      className="w-full bg-white border border-neutral-300 rounded-xl px-3 py-2 text-xs font-medium text-neutral-900 focus:outline-none focus:border-neutral-900"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <input
                      type="checkbox"
                      id="showOrderNum"
                      checked={activePreset.showOrderNum ?? false}
                      onChange={(e) => handleUpdatePresetField({ showOrderNum: e.target.checked })}
                      className="rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900"
                    />
                    <label htmlFor="showOrderNum" className="text-xs font-bold text-neutral-800 cursor-pointer">
                      Show Order Number in Header (e.g. ORDER #{sampleOrderNum})
                    </label>
                  </div>
                </div>
              )}

              {/* STYLING TAB */}
              {activeTab === 'styling' && (
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="text-xs font-bold text-neutral-700 uppercase tracking-wider block mb-2">Theme Mode</label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => handleUpdatePresetField({ theme: 'dark', bgColor: '#000000', textColor: '#ffffff', accentColor: '#ffffff' })}
                        className={`p-3 rounded-xl border text-xs font-bold text-center transition-all ${activePreset.theme === 'dark' ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 hover:bg-neutral-50'}`}
                      >
                        Dark Theme (Black)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdatePresetField({ theme: 'light', bgColor: '#ffffff', textColor: '#000000', accentColor: '#000000' })}
                        className={`p-3 rounded-xl border text-xs font-bold text-center transition-all ${activePreset.theme === 'light' ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 hover:bg-neutral-50'}`}
                      >
                        Light Theme (White)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdatePresetField({ theme: 'custom' })}
                        className={`p-3 rounded-xl border text-xs font-bold text-center transition-all ${activePreset.theme === 'custom' ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 hover:bg-neutral-50'}`}
                      >
                        Custom Palette
                      </button>
                    </div>
                  </div>

                  {activePreset.theme === 'custom' && (
                    <div className="grid grid-cols-2 gap-3 p-3 bg-neutral-50 rounded-xl border border-neutral-200">
                      <div>
                        <label className="text-[11px] font-bold text-neutral-600 block mb-1">Background Color</label>
                        <input
                          type="color"
                          value={activePreset.bgColor || '#000000'}
                          onChange={(e) => handleUpdatePresetField({ bgColor: e.target.value })}
                          className="w-full h-8 rounded-lg cursor-pointer border border-neutral-300"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-neutral-600 block mb-1">Text Color</label>
                        <input
                          type="color"
                          value={activePreset.textColor || '#ffffff'}
                          onChange={(e) => handleUpdatePresetField({ textColor: e.target.value })}
                          className="w-full h-8 rounded-lg cursor-pointer border border-neutral-300"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-bold text-neutral-700 uppercase tracking-wider block mb-2">Font Family</label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => handleUpdatePresetField({ fontFamily: 'serif' })}
                        className={`p-2.5 rounded-xl border text-xs font-serif font-bold text-center transition-all ${activePreset.fontFamily === 'serif' ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 hover:bg-neutral-50'}`}
                      >
                        Serif (Classic)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdatePresetField({ fontFamily: 'sans' })}
                        className={`p-2.5 rounded-xl border text-xs font-sans font-bold text-center transition-all ${activePreset.fontFamily === 'sans' ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 hover:bg-neutral-50'}`}
                      >
                        Sans-Serif (Modern)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdatePresetField({ fontFamily: 'mono' })}
                        className={`p-2.5 rounded-xl border text-xs font-mono font-bold text-center transition-all ${activePreset.fontFamily === 'mono' ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 hover:bg-neutral-50'}`}
                      >
                        Monospace (Tech)
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-neutral-700 uppercase tracking-wider block mb-2">Label Size / Dimensions</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleUpdatePresetField({ labelSize: '3x4' })}
                        className={`p-2.5 rounded-xl border text-xs font-bold text-left transition-all ${activePreset.labelSize === '3x4' ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 hover:bg-neutral-50'}`}
                      >
                        3" x 4" (Standard Thermal)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdatePresetField({ labelSize: '4x6' })}
                        className={`p-2.5 rounded-xl border text-xs font-bold text-left transition-all ${activePreset.labelSize === '4x6' ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 hover:bg-neutral-50'}`}
                      >
                        4" x 6" (Large Shipping)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdatePresetField({ labelSize: '4x3' })}
                        className={`p-2.5 rounded-xl border text-xs font-bold text-left transition-all ${activePreset.labelSize === '4x3' ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 hover:bg-neutral-50'}`}
                      >
                        4" x 3" (Landscape)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdatePresetField({ labelSize: '3x2' })}
                        className={`p-2.5 rounded-xl border text-xs font-bold text-left transition-all ${activePreset.labelSize === '3x2' ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 hover:bg-neutral-50'}`}
                      >
                        3" x 2" (Medium Landscape)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdatePresetField({ labelSize: '2x3' })}
                        className={`p-2.5 rounded-xl border text-xs font-bold text-left transition-all ${activePreset.labelSize === '2x3' ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 hover:bg-neutral-50'}`}
                      >
                        2" x 3" (Medium Portrait)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdatePresetField({ labelSize: '2x1' })}
                        className={`p-2.5 rounded-xl border text-xs font-bold text-left transition-all ${activePreset.labelSize === '2x1' ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 hover:bg-neutral-50'}`}
                      >
                        2" x 1" (Compact Tag)
                      </button>
                    </div>
                  </div>

                  {/* Outer Border & Stroke Customization */}
                  <div className="pt-3 border-t border-neutral-200 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-neutral-700 uppercase tracking-wider block">
                        Outer Border / Stroke Line
                      </label>
                      <input
                        type="checkbox"
                        id="showBorder"
                        checked={activePreset.showBorder !== false}
                        onChange={(e) => handleUpdatePresetField({ showBorder: e.target.checked })}
                        className="rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900 cursor-pointer"
                      />
                    </div>

                    {(activePreset.showBorder !== false) && (
                      <div className="flex flex-col gap-3 bg-neutral-50 p-3.5 rounded-xl border border-neutral-200">
                        {/* Border Thickness */}
                        <div>
                          <div className="flex justify-between items-center mb-1.5">
                            <label className="text-[11px] font-bold text-neutral-700 uppercase tracking-wider">
                              Stroke Thickness
                            </label>
                            <span className="text-[11px] font-mono font-bold text-neutral-900 bg-white px-2 py-0.5 rounded border border-neutral-200">
                              {activePreset.borderWidth ?? 4}px
                            </span>
                          </div>
                          <div className="grid grid-cols-4 gap-1.5 mb-2">
                            {[2, 4, 8, 12].map((w) => (
                              <button
                                key={w}
                                type="button"
                                onClick={() => handleUpdatePresetField({ borderWidth: w })}
                                className={`py-1.5 text-[10px] font-bold rounded-lg border transition-all ${
                                  (activePreset.borderWidth ?? 4) === w
                                    ? 'border-neutral-900 bg-neutral-900 text-white'
                                    : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100'
                                }`}
                              >
                                {w === 2 ? 'Thin (2px)' : w === 4 ? 'Standard (4px)' : w === 8 ? 'Bold (8px)' : 'Heavy (12px)'}
                              </button>
                            ))}
                          </div>
                          <input
                            type="range"
                            min="1"
                            max="16"
                            value={activePreset.borderWidth ?? 4}
                            onChange={(e) => handleUpdatePresetField({ borderWidth: parseInt(e.target.value) || 4 })}
                            className="w-full h-1.5 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-neutral-900"
                          />
                        </div>

                        {/* Border Color */}
                        <div>
                          <label className="text-[11px] font-bold text-neutral-700 uppercase tracking-wider block mb-1">
                            Stroke Line Color
                          </label>
                          <div className="flex gap-2 items-center">
                            <input
                              type="color"
                              value={activePreset.borderColor || (activePreset.theme === 'light' ? '#000000' : activePreset.textColor || '#ffffff')}
                              onChange={(e) => handleUpdatePresetField({ borderColor: e.target.value })}
                              className="w-10 h-8 rounded-lg cursor-pointer border border-neutral-300 shrink-0"
                            />
                            <input
                              type="text"
                              value={activePreset.borderColor || (activePreset.theme === 'light' ? '#000000' : activePreset.textColor || '#ffffff')}
                              onChange={(e) => handleUpdatePresetField({ borderColor: e.target.value })}
                              placeholder="#000000"
                              className="flex-1 bg-white border border-neutral-300 rounded-lg px-2.5 py-1.5 text-xs font-mono text-neutral-900 focus:outline-none focus:border-neutral-900 uppercase"
                            />
                          </div>
                        </div>

                        {/* Corner Radius */}
                        <div>
                          <div className="flex justify-between items-center mb-1.5">
                            <label className="text-[11px] font-bold text-neutral-700 uppercase tracking-wider">
                              Corner Radius
                            </label>
                            <span className="text-[11px] font-mono font-bold text-neutral-900 bg-white px-2 py-0.5 rounded border border-neutral-200">
                              {activePreset.borderRadius ?? 16}px
                            </span>
                          </div>
                          <div className="grid grid-cols-4 gap-1.5">
                            {[0, 8, 16, 24].map((r) => (
                              <button
                                key={r}
                                type="button"
                                onClick={() => handleUpdatePresetField({ borderRadius: r })}
                                className={`py-1.5 text-[10px] font-bold rounded-lg border transition-all ${
                                  (activePreset.borderRadius ?? 16) === r
                                    ? 'border-neutral-900 bg-neutral-900 text-white'
                                    : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100'
                                }`}
                              >
                                {r === 0 ? 'Square (0)' : r === 8 ? 'Slight (8px)' : r === 16 ? 'Round (16px)' : 'Pill (24px)'}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* QR CODE TAB */}
              {activeTab === 'qr' && (
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="text-xs font-bold text-neutral-700 uppercase tracking-wider block mb-2">QR Code Size</label>
                    <div className="grid grid-cols-4 gap-2">
                      {[120, 140, 160, 180].map((size) => (
                        <button
                          key={size}
                          type="button"
                          onClick={() => handleUpdatePresetField({ qrSize: size })}
                          className={`p-2.5 rounded-xl border text-xs font-bold text-center transition-all ${activePreset.qrSize === size ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 hover:bg-neutral-50'}`}
                        >
                          {size === 120 ? 'Small' : size === 140 ? 'Medium' : size === 160 ? 'Large' : 'Hero'} ({size}px)
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-neutral-700 uppercase tracking-wider block mb-2">QR Container Card Style</label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => handleUpdatePresetField({ qrContainerStyle: 'white_box' })}
                        className={`p-2.5 rounded-xl border text-xs font-bold text-center transition-all ${activePreset.qrContainerStyle === 'white_box' ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 hover:bg-neutral-50'}`}
                      >
                        White Rounded Box
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdatePresetField({ qrContainerStyle: 'plain' })}
                        className={`p-2.5 rounded-xl border text-xs font-bold text-center transition-all ${activePreset.qrContainerStyle === 'plain' ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 hover:bg-neutral-50'}`}
                      >
                        Plain / Transparent
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdatePresetField({ qrContainerStyle: 'bordered' })}
                        className={`p-2.5 rounded-xl border text-xs font-bold text-center transition-all ${activePreset.qrContainerStyle === 'bordered' ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 hover:bg-neutral-50'}`}
                      >
                        Bordered Box
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* CONTENT TAB */}
              {activeTab === 'content' && (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="showCustomerName"
                        checked={activePreset.showCustomerName ?? false}
                        onChange={(e) => handleUpdatePresetField({ showCustomerName: e.target.checked })}
                        className="rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900"
                      />
                      <label htmlFor="showCustomerName" className="text-xs font-bold text-neutral-800 cursor-pointer">
                        Show Customer / Client Name (e.g. {sampleCustomer})
                      </label>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="showBoxItems"
                        checked={activePreset.showBoxItems ?? false}
                        onChange={(e) => handleUpdatePresetField({ showBoxItems: e.target.checked })}
                        className="rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900"
                      />
                      <label htmlFor="showBoxItems" className="text-xs font-bold text-neutral-800 cursor-pointer">
                        Show Box Items Summary / Contents
                      </label>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="showDestination"
                        checked={activePreset.showDestination ?? false}
                        onChange={(e) => handleUpdatePresetField({ showDestination: e.target.checked })}
                        className="rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900"
                      />
                      <label htmlFor="showDestination" className="text-xs font-bold text-neutral-800 cursor-pointer">
                        Show Destination Shipping Address
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-neutral-700 uppercase tracking-wider block mb-1">Custom Footer Note</label>
                    <input
                      type="text"
                      value={activePreset.footerText || ''}
                      onChange={(e) => handleUpdatePresetField({ footerText: e.target.value })}
                      placeholder="e.g. Scan QR code to open digital packing slip"
                      className="w-full bg-white border border-neutral-300 rounded-xl px-3 py-2 text-xs font-medium text-neutral-900 focus:outline-none focus:border-neutral-900"
                    />
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* Live Thermal Preview Side (Right - 5 cols) */}
          <div className="lg:col-span-5 bg-neutral-100/90 p-6 flex flex-col justify-between items-center overflow-y-auto border-l border-neutral-200">
            <div className="w-full flex justify-between items-center mb-4">
              <span className="text-xs font-bold uppercase tracking-widest text-neutral-700 flex items-center gap-2">
                <Sparkles size={14} className="text-amber-500" /> Live Label Preview
              </span>
              <span className="text-[10px] font-mono font-bold text-neutral-700 bg-white border border-neutral-300 px-2 py-0.5 rounded shadow-2xs">
                {activePreset.labelSize} Thermal
              </span>
            </div>

            {/* Label Card Preview */}
            <div className="flex-1 flex items-center justify-center my-4 w-full min-h-[360px]">
              {(() => {
                const config = (() => {
                  switch (activePreset.labelSize) {
                    case '4x6':
                      return { width: '240px', height: '360px', isLandscape: false, isCompact: false, qrMax: Math.min(activePreset.qrSize || 160, 170) };
                    case '4x3':
                      return { width: '320px', height: '240px', isLandscape: true, isCompact: false, qrMax: Math.min(activePreset.qrSize || 140, 130) };
                    case '3x2':
                      return { width: '300px', height: '200px', isLandscape: true, isCompact: true, qrMax: Math.min(activePreset.qrSize || 120, 110) };
                    case '2x3':
                      return { width: '220px', height: '330px', isLandscape: false, isCompact: false, qrMax: Math.min(activePreset.qrSize || 140, 130) };
                    case '2x1':
                      return { width: '300px', height: '150px', isLandscape: true, isCompact: true, qrMax: Math.min(activePreset.qrSize || 100, 85) };
                    case '3x4':
                    default:
                      return { width: '250px', height: '333px', isLandscape: false, isCompact: false, qrMax: Math.min(activePreset.qrSize || 160, 150) };
                  }
                })();

                return (
                  <div 
                    style={{
                      width: config.width,
                      height: config.height,
                      backgroundColor: activePreset.bgColor || '#000000',
                      color: activePreset.textColor || '#ffffff',
                      fontFamily: activePreset.fontFamily === 'sans' ? 'sans-serif' : activePreset.fontFamily === 'mono' ? 'monospace' : 'serif',
                      borderWidth: (activePreset.showBorder !== false) ? `${activePreset.borderWidth ?? 4}px` : '0px',
                      borderStyle: (activePreset.showBorder !== false) ? 'solid' : 'none',
                      borderColor: activePreset.borderColor || (activePreset.theme === 'light' ? '#000000' : activePreset.textColor || '#ffffff'),
                      borderRadius: `${activePreset.borderRadius ?? 16}px`
                    }}
                    className={`p-4 flex ${config.isLandscape ? 'flex-row justify-between items-center text-left' : 'flex-col justify-between items-center text-center'} shadow-2xl relative overflow-hidden transition-all duration-300 box-border`}
                  >
                    {config.isLandscape ? (
                      <>
                        {/* Left Column: Branding & Box Details */}
                        <div className="flex-1 flex flex-col justify-between h-full pr-3 min-w-0">
                          <div>
                            {activePreset.logoType === 'wovn' && (
                              <div className={`${config.isCompact ? 'text-lg' : 'text-2xl'} font-black italic tracking-tighter uppercase font-serif truncate`}>
                                {activePreset.headerText || 'WOVN'}
                              </div>
                            )}

                            {activePreset.logoType === 'customer' && (
                              <div className={`${config.isCompact ? 'text-xs' : 'text-sm'} font-bold uppercase tracking-wide truncate`}>
                                {activePreset.headerText || sampleCustomer}
                              </div>
                            )}

                            {activePreset.logoType === 'custom' && activePreset.customLogoUrl && (
                              <img src={activePreset.customLogoUrl} alt="Logo" className={`${config.isCompact ? 'max-h-6' : 'max-h-8'} object-contain`} />
                            )}

                            {activePreset.showOrderNum && (
                              <div className="text-[9px] font-mono tracking-widest uppercase opacity-80 mt-0.5">
                                ORDER #{sampleOrderNum}
                              </div>
                            )}
                          </div>

                          <div>
                            {activePreset.showCustomerName && (
                              <div className="text-[10px] font-bold uppercase tracking-wider opacity-90 truncate">
                                {sampleCustomer}
                              </div>
                            )}

                            <div className={`${config.isCompact ? 'text-xl' : 'text-2.5xl'} font-serif font-bold tracking-tight leading-none my-0.5`}>
                              {sampleBoxName}
                            </div>

                            {activePreset.showBoxItems && (
                              <div className="text-[9px] opacity-75 truncate">
                                {sampleItemsText}
                              </div>
                            )}

                            {activePreset.footerText && (
                              <div className="text-[8px] opacity-60 uppercase tracking-widest truncate mt-0.5">
                                {activePreset.footerText}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Right Column: QR Code */}
                        <div className="shrink-0 flex items-center justify-center">
                          <div className={`transition-all ${
                            activePreset.qrContainerStyle === 'white_box'
                              ? 'bg-white rounded-lg p-2 shadow-sm'
                              : activePreset.qrContainerStyle === 'bordered'
                              ? 'border-2 border-current rounded-lg p-1.5 bg-transparent'
                              : 'bg-transparent p-0'
                          }`}>
                            <QRCode
                              value={sampleQrUrl}
                              size={config.qrMax}
                              bgColor={activePreset.qrContainerStyle === 'white_box' ? '#ffffff' : 'transparent'}
                              fgColor={activePreset.qrContainerStyle === 'white_box' ? '#000000' : activePreset.textColor || '#ffffff'}
                              style={{ width: `${config.qrMax}px`, height: `${config.qrMax}px` }}
                            />
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        {/* Header Logo & Title */}
                        <div className="w-full flex flex-col items-center gap-1 shrink-0">
                          {activePreset.logoType === 'wovn' && (
                            <div className="text-3xl font-black italic tracking-tighter uppercase font-serif">
                              {activePreset.headerText || 'WOVN'}
                            </div>
                          )}

                          {activePreset.logoType === 'customer' && (
                            <div className="text-base font-bold uppercase tracking-wide truncate max-w-full">
                              {activePreset.headerText || sampleCustomer}
                            </div>
                          )}

                          {activePreset.logoType === 'custom' && activePreset.customLogoUrl && (
                            <img src={activePreset.customLogoUrl} alt="Logo" className="max-h-10 object-contain" />
                          )}

                          {activePreset.showOrderNum && (
                            <div className="text-[10px] font-mono tracking-widest uppercase opacity-80">
                              ORDER #{sampleOrderNum}
                            </div>
                          )}
                        </div>

                        {/* QR Code Container */}
                        <div className="flex-1 flex flex-col items-center justify-center w-full my-2">
                          <div className={`p-3 transition-all ${
                            activePreset.qrContainerStyle === 'white_box'
                              ? 'bg-white rounded-xl shadow-md'
                              : activePreset.qrContainerStyle === 'bordered'
                              ? 'border-2 border-current rounded-xl p-2 bg-transparent'
                              : 'bg-transparent p-0'
                          }`}>
                            <QRCode
                              value={sampleQrUrl}
                              size={config.qrMax}
                              bgColor={activePreset.qrContainerStyle === 'white_box' ? '#ffffff' : 'transparent'}
                              fgColor={activePreset.qrContainerStyle === 'white_box' ? '#000000' : activePreset.textColor || '#ffffff'}
                              style={{ width: `${config.qrMax}px`, height: `${config.qrMax}px` }}
                            />
                          </div>
                        </div>

                        {/* Footer Details */}
                        <div className="w-full flex flex-col items-center shrink-0 gap-1">
                          {activePreset.showCustomerName && (
                            <div className="text-xs font-bold uppercase tracking-wider opacity-90 truncate max-w-full">
                              {sampleCustomer}
                            </div>
                          )}

                          <div className="text-3xl font-serif font-bold tracking-tight leading-none">
                            {sampleBoxName}
                          </div>

                          {activePreset.showBoxItems && (
                            <div className="text-[10px] opacity-75 truncate max-w-full mt-1">
                              {sampleItemsText}
                            </div>
                          )}

                          {activePreset.footerText && (
                            <div className="text-[9px] opacity-60 uppercase tracking-widest mt-1">
                              {activePreset.footerText}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Bottom Actions */}
            <div className="w-full flex flex-col gap-2 pt-2 border-t border-neutral-200">
              <button
                type="button"
                onClick={handleApplyToOrderAndSave}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-md cursor-pointer"
              >
                <Check size={16} /> Apply Preset to Order
              </button>

              <button
                type="button"
                onClick={() => {
                  window.open(`/print/label/${order?.id || 'sample'}/${boxId || 'sample'}`, '_blank');
                }}
                className="w-full bg-neutral-900 hover:bg-black text-white text-xs font-bold py-2 rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
              >
                <Printer size={14} /> Print Sample Thermal Label
              </button>
            </div>

          </div>
        </div>
      </div>

      {/* Save As New Preset Dialog Modal */}
      {isSaveAsDialogOpen && (
        <div className="fixed inset-0 z-[400] bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-neutral-200 flex flex-col gap-4 animate-in zoom-in-95 duration-200">
            <h3 className="text-base font-bold text-neutral-900">Save Custom Label Preset</h3>
            <p className="text-xs text-neutral-500">Enter a name for this label preset so you can reuse it across future orders.</p>
            
            <input
              type="text"
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              placeholder="e.g. Reborn RV Custom Label"
              className="w-full bg-white border border-neutral-300 rounded-xl px-3 py-2 text-sm font-bold text-neutral-900 focus:outline-none focus:border-neutral-900"
              autoFocus
            />

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsSaveAsDialogOpen(false)}
                className="px-4 py-2 text-xs font-bold text-neutral-600 hover:bg-neutral-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveAsNewPreset}
                disabled={!newPresetName.trim() || isSavingPreset}
                className="px-4 py-2 text-xs font-bold bg-neutral-900 hover:bg-black text-white rounded-xl transition-colors disabled:opacity-50"
              >
                Save Preset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
