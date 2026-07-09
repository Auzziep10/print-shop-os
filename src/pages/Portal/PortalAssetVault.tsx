import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../../lib/firebase';
import { Upload, Trash2, Loader2, FileText, Image as ImageIcon, ArrowLeft, Plus, X, Edit2, Check, Eraser, Undo, ZoomIn, ZoomOut, RotateCw, Palette } from 'lucide-react';

export function PortalAssetVault() {
  const { customerId } = useParams();
  const navigate = useNavigate();
  const currentCustomerId = customerId || 'CUS-001';

  const [assets, setAssets] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<any | null>(null);
  const [lightboxBg, setLightboxBg] = useState<'checkerboard' | 'dark' | 'light'>('checkerboard');
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [editingAssetName, setEditingAssetName] = useState('');

  // Background removal / Paste States
  const [pendingAssetImage, setPendingAssetImage] = useState<string | null>(null);
  const [originalAssetImage, setOriginalAssetImage] = useState<string | null>(null);
  const [erasingAssetUrl, setErasingAssetUrl] = useState<string | null>(null);
  const [recolorColor, setRecolorColor] = useState('#000000');
  const [isRecoloring, setIsRecoloring] = useState(false);

  useEffect(() => {
    const fetchCustomer = async () => {
      try {
        const docRef = doc(db, 'customers', currentCustomerId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setAssets(data.assets || []);
        }
      } catch (err) {
        console.error("Error fetching customer for asset vault:", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchCustomer();
  }, [currentCustomerId]);

  // Paste Event Listener for Asset Vault (Ctrl+V)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
              const dataUrl = reader.result as string;
              setPendingAssetImage(dataUrl);
              setOriginalAssetImage(dataUrl);
            };
            reader.readAsDataURL(file);
            e.preventDefault();
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, []);

  const uploadBase64ToStorage = async (base64Data: string, filename: string): Promise<string> => {
    const response = await fetch(base64Data);
    const blob = await response.blob();
    
    const randomStr = Math.random().toString(36).substr(2, 5);
    const storageRef = ref(storage, `portal/${currentCustomerId}/vault/${Date.now()}_${randomStr}_${filename}`);
    await uploadBytes(storageRef, blob);
    return await getDownloadURL(storageRef);
  };

  const handleSaveProcessedAsset = async () => {
    if (!pendingAssetImage) return;
    setIsUploading(true);
    try {
      const filename = `processed_asset_${Date.now()}.png`;
      const downloadUrl = await uploadBase64ToStorage(pendingAssetImage, filename);

      const newAsset = {
        id: `asset-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        name: filename,
        url: downloadUrl,
        uploadedAt: new Date().toISOString()
      };

      const updatedAssets = [...assets, newAsset];
      
      await updateDoc(doc(db, 'customers', currentCustomerId), {
        assets: updatedAssets
      });

      setAssets(updatedAssets);
      setPendingAssetImage(null);
      setOriginalAssetImage(null);
    } catch (err) {
      console.error(err);
      alert('Failed to save asset to vault');
    } finally {
      setIsUploading(false);
    }
  };

  const handleRecolorAsset = async (assetImageUrl: string, hexColor: string) => {
    if (!selectedAsset) return;
    setIsRecoloring(true);
    try {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = assetImageUrl;
      });

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No canvas context');

      ctx.drawImage(img, 0, 0);
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = hexColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const recoloredDataUrl = canvas.toDataURL('image/png');
      const filename = `recolored_${hexColor.replace('#', '')}_${selectedAsset.name.split('.').slice(0, -1).join('.') || 'asset'}.png`;
      
      const downloadUrl = await uploadBase64ToStorage(recoloredDataUrl, filename);

      const newAsset = {
        id: `asset-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        name: filename,
        url: downloadUrl,
        uploadedAt: new Date().toISOString()
      };

      const updatedAssets = [...assets, newAsset];
      
      await updateDoc(doc(db, 'customers', currentCustomerId), {
        assets: updatedAssets
      });

      setAssets(updatedAssets);
      setSelectedAsset(null); // Close Lightbox
      alert('Recolored copy added to vault successfully!');
    } catch (err) {
      console.error(err);
      alert('Failed to recolor asset. Ensure image origin supports CORS.');
    } finally {
      setIsRecoloring(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      const newAssets: any[] = [];
      
      // Upload all selected files concurrently
      await Promise.all(Array.from(files).map(async (file, idx) => {
        // Add idx and random string to prevent filename/timestamp collisions
        const randomStr = Math.random().toString(36).substr(2, 5);
        const storageRef = ref(storage, `portal/${currentCustomerId}/vault/${Date.now()}_${idx}_${randomStr}_${file.name}`);
        await uploadBytes(storageRef, file);
        const downloadUrl = await getDownloadURL(storageRef);

        newAssets.push({
          id: `asset-${Date.now()}-${idx}-${randomStr}`,
          name: file.name,
          url: downloadUrl,
          uploadedAt: new Date().toISOString()
        });
      }));

      const updatedAssets = [...assets, ...newAssets];
      
      await updateDoc(doc(db, 'customers', currentCustomerId), {
        assets: updatedAssets
      });

      setAssets(updatedAssets);
    } catch (err) {
      console.error("Upload failed:", err);
      alert("Failed to upload some or all assets. Please try again.");
    } finally {
      setIsUploading(false);
      e.target.value = ''; // Reset input to allow uploading the same file again
    }
  };

  const handleDeleteAsset = async (asset: any) => {
    if (!window.confirm(`Are you sure you want to delete "${asset.name}" from your vault?`)) return;

    setDeletingId(asset.id);
    try {
      // Attempt to delete from Storage if it matches Firebase Storage URL pattern
      if (asset.url.includes('firebasestorage.googleapis.com')) {
        try {
          const fileRef = ref(storage, asset.url);
          await deleteObject(fileRef);
        } catch (storageErr) {
          console.warn("Storage deletion warning/failure (file might not exist):", storageErr);
        }
      }

      const updatedAssets = assets.filter(a => a.id !== asset.id);
      
      await updateDoc(doc(db, 'customers', currentCustomerId), {
        assets: updatedAssets
      });

      setAssets(updatedAssets);
    } catch (err) {
      console.error("Deletion failed:", err);
      alert("Failed to delete asset. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleSaveRename = async (assetId: string) => {
    if (!editingAssetName.trim()) return;

    try {
      const updatedAssets = assets.map(a => {
        if (a.id === assetId) {
          let newName = editingAssetName.trim();
          const parts = a.name.split('.');
          if (parts.length > 1) {
            const oldExt = parts.pop()?.toLowerCase();
            const newParts = newName.split('.');
            const newExt = newParts.length > 1 ? newParts.pop()?.toLowerCase() : '';
            if (oldExt && oldExt !== newExt) {
              newName = `${newName}.${oldExt}`;
            }
          }
          return { ...a, name: newName };
        }
        return a;
      });

      await updateDoc(doc(db, 'customers', currentCustomerId), {
        assets: updatedAssets
      });

      setAssets(updatedAssets);
      setEditingAssetId(null);
    } catch (err) {
      console.error("Rename failed:", err);
      alert("Failed to rename asset. Please try again.");
    }
  };

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext || '')) {
      return <ImageIcon size={24} className="text-neutral-500" />;
    }
    return <FileText size={24} className="text-neutral-500" />;
  };

  const isImageFile = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext || '');
  };

  const isPdfFile = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    return ext === 'pdf';
  };

  const isPreviewable = (name: string) => {
    return isImageFile(name) || isPdfFile(name);
  };

  if (isLoading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center text-gray-400 gap-3">
        <Loader2 className="animate-spin" size={32} />
        <p className="font-semibold uppercase tracking-widest text-xs">Loading Asset Vault...</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto w-full flex flex-col gap-8 animate-in fade-in zoom-in-95 duration-300 pb-20">
      {/* Header Area */}
      <div className="flex items-center justify-between mt-4">
        <button 
          onClick={() => navigate(customerId ? `/portal/${customerId}` : '/portal')}
          className="flex items-center gap-2 text-neutral-500 hover:text-black transition-colors font-medium text-sm group"
        >
          <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
          Back to Orders
        </button>
      </div>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-serif text-neutral-900 tracking-tight">
            Asset Vault
          </h1>
          <p className="text-neutral-500 font-medium text-sm max-w-xl leading-relaxed">
            Manage your company logos and design files. Uploaded assets can be placed on garments when requesting quotes or ordering.
          </p>
        </div>
        
        <label 
          data-tour="vault-upload-btn"
          className="bg-black text-white px-6 py-3.5 rounded-full text-[13px] font-bold tracking-wide hover:bg-neutral-800 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-md flex items-center gap-2 cursor-pointer"
        >
          <input type="file" multiple className="hidden" onChange={handleFileUpload} accept="image/*,application/pdf,.ai,.eps,.psd,.cdr,.zip" />
          {isUploading ? (
            <Loader2 className="animate-spin" size={16} />
          ) : (
            <Plus size={16} />
          )}
          {isUploading ? "Uploading..." : "Upload New Asset"}
        </label>
      </div>

      {assets.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 shadow-[0_4px_24px_rgb(0,0,0,0.02)] border border-neutral-100 flex flex-col items-center justify-center min-h-[350px] text-center gap-4">
          <div className="w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center text-neutral-400">
            <Upload size={28} strokeWidth={1.5} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-neutral-900 mb-1">Your vault is empty</h3>
            <p className="text-neutral-500 text-sm max-w-xs mx-auto">
              Upload files like logos, brand assets, and custom artworks so they're saved for your future orders.
            </p>
          </div>
          <label className="mt-2 bg-[#f0ebe1] text-neutral-900 border border-[#e6e2db] px-8 py-3.5 rounded-full text-[13px] font-bold tracking-wide hover:bg-[#e6e2db] hover:scale-[1.02] active:scale-[0.98] transition-all shadow-sm flex items-center gap-2 cursor-pointer">
            <input type="file" multiple className="hidden" onChange={handleFileUpload} accept="image/*,application/pdf,.ai,.eps,.psd,.cdr,.zip" />
            <Upload size={14} /> Upload First File
          </label>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 mt-4">
          {assets.map((asset) => (
            <div 
              key={asset.id} 
              className="bg-white rounded-3xl border border-neutral-200/60 shadow-[0_4px_16px_rgb(0,0,0,0.01)] hover:shadow-md hover:border-black/20 transition-all p-5 flex flex-col justify-between min-h-[220px] relative group"
            >
              {/* Card Top: Preview or Icon */}
              <div className="flex-1 flex flex-col gap-4">
                <div 
                  onClick={() => isPreviewable(asset.name) && setSelectedAsset(asset)}
                  className={`w-full h-32 bg-checkerboard rounded-2xl overflow-hidden border border-neutral-100 flex items-center justify-center p-2 relative shadow-inner ${isPreviewable(asset.name) ? 'cursor-zoom-in' : ''}`}
                >
                  {isImageFile(asset.name) ? (
                    <img 
                      src={asset.url} 
                      alt={asset.name} 
                      className="max-w-full max-h-full object-contain group-hover:scale-105 transition-transform duration-300 select-none pointer-events-none" 
                      draggable="false"
                      onContextMenu={(e) => e.preventDefault()}
                    />
                  ) : isPdfFile(asset.name) ? (
                    <div className="w-full h-full relative overflow-hidden flex items-center justify-center pointer-events-none select-none rounded-xl bg-white">
                      <iframe 
                        src={`${asset.url}#toolbar=0&navpanes=0&scrollbar=0`}
                        className="w-[200%] h-[200%] scale-50 origin-center border-0 pointer-events-none select-none rounded-xl bg-white"
                        scrolling="no"
                      />
                      <div className="absolute inset-0 bg-transparent pointer-events-auto" />
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      {getFileIcon(asset.name)}
                      <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 bg-neutral-200 px-2 py-0.5 rounded">
                        {asset.name.split('.').pop() || 'FILE'}
                      </span>
                    </div>
                  )}
                </div>

                <div className="px-1 min-w-0 w-full">
                  {editingAssetId === asset.id ? (
                    <div className="flex items-center gap-1.5 mt-1 w-full">
                      <input 
                        type="text" 
                        value={editingAssetName} 
                        onChange={(e) => setEditingAssetName(e.target.value)}
                        className="flex-1 min-w-0 px-2 py-1 text-xs bg-neutral-50 border border-black/20 rounded-md focus:outline-none focus:border-black/50 font-medium"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveRename(asset.id);
                          if (e.key === 'Escape') setEditingAssetId(null);
                        }}
                      />
                      <button 
                        onClick={() => handleSaveRename(asset.id)}
                        className="p-1 hover:bg-neutral-100 rounded text-green-600 hover:text-green-700 transition-colors shrink-0"
                        title="Save name"
                      >
                        <Check size={14} strokeWidth={2.5} />
                      </button>
                      <button 
                        onClick={() => setEditingAssetId(null)}
                        className="p-1 hover:bg-neutral-100 rounded text-neutral-400 hover:text-neutral-600 transition-colors shrink-0"
                        title="Cancel"
                      >
                        <X size={14} strokeWidth={2.5} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between group/title min-w-0 w-full relative">
                      <h4 
                        className="font-bold text-neutral-900 text-sm truncate pr-6 cursor-pointer hover:text-black/70 transition-colors flex-1"
                        title={asset.name}
                        onClick={() => {
                          if (isPreviewable(asset.name)) {
                            setSelectedAsset(asset);
                          } else {
                            window.open(asset.url, '_blank');
                          }
                        }}
                      >
                        {asset.name}
                      </h4>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingAssetId(asset.id);
                          setEditingAssetName(asset.name);
                        }}
                        className="absolute right-0 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-neutral-950 hover:bg-neutral-100 rounded opacity-0 group-hover/title:opacity-100 transition-all cursor-pointer shrink-0"
                        title="Rename file"
                      >
                        <Edit2 size={12} />
                      </button>
                    </div>
                  )}
                  <p className="text-[10px] font-bold text-neutral-400 mt-1.5 uppercase tracking-wider">
                    Uploaded {new Date(asset.uploadedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {/* Card Actions */}
              <div className="flex items-center justify-end border-t border-neutral-100 pt-4 mt-4">
                
                <button 
                  disabled={deletingId === asset.id}
                  onClick={() => handleDeleteAsset(asset)}
                  className="p-1.5 text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex items-center justify-center"
                  title="Delete Asset"
                >
                  {deletingId === asset.id ? (
                    <Loader2 className="animate-spin" size={14} />
                  ) : (
                    <Trash2 size={14} />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox Modal */}
      {selectedAsset && (
        <div 
          className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-md flex flex-col justify-between p-6 animate-in fade-in duration-200 pointer-events-auto"
          onClick={() => setSelectedAsset(null)}
        >
          {/* Top Bar */}
          <div 
            className="flex items-center justify-between w-full z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col gap-1 text-left">
              <h3 className="text-white font-serif font-bold text-base md:text-lg select-all pr-4 break-all">
                {selectedAsset.name}
              </h3>
              <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                Uploaded {new Date(selectedAsset.uploadedAt).toLocaleDateString()}
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {/* Background Toggles */}
              {!isPdfFile(selectedAsset.name) && (
                <div className="bg-neutral-800/80 border border-neutral-700/50 rounded-full p-1 flex items-center gap-1">
                  {(['checkerboard', 'dark', 'light'] as const).map((bgType) => (
                    <button
                      key={bgType}
                      onClick={() => setLightboxBg(bgType)}
                      className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase transition-all cursor-pointer ${
                        lightboxBg === bgType
                          ? 'bg-white text-black shadow-md'
                          : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      {bgType === 'checkerboard' ? 'Grid' : bgType}
                    </button>
                  ))}
                </div>
              )}



              {/* Recolor Section */}
              {isImageFile(selectedAsset.name) && (
                <div className="bg-neutral-800/80 border border-neutral-700/50 rounded-full p-1 pl-3 pr-2 flex items-center gap-2">
                  <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Recolor:</span>
                  <div className="relative w-5 h-5 shrink-0 group rounded-full overflow-hidden border border-neutral-600 shadow-inner">
                    <input
                      type="color"
                      value={recolorColor}
                      onChange={(e) => setRecolorColor(e.target.value)}
                      className="absolute -inset-4 opacity-0 w-16 h-16 cursor-pointer z-10"
                      title="Pick a color"
                    />
                    <div className="absolute inset-0 pointer-events-none" style={{ backgroundColor: recolorColor }} />
                  </div>
                  <button
                    onClick={() => handleRecolorAsset(selectedAsset.url, recolorColor)}
                    disabled={isRecoloring}
                    className="bg-white hover:bg-neutral-200 text-black px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isRecoloring ? <Loader2 className="animate-spin" size={10} /> : <Palette size={10} />}
                    <span>Save Copy</span>
                  </button>
                </div>
              )}

              {/* Erase Background */}
              {isImageFile(selectedAsset.name) && (
                <button
                  onClick={() => {
                    setErasingAssetUrl(selectedAsset.url);
                    setSelectedAsset(null);
                  }}
                  className="bg-neutral-800/80 hover:bg-neutral-700/80 border border-neutral-700/50 text-white px-3 py-2 rounded-full text-[10px] font-bold tracking-wider uppercase transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Eraser size={10} />
                  <span>Erase Background</span>
                </button>
              )}

              {/* Close */}
              <button
                onClick={() => setSelectedAsset(null)}
                className="bg-white hover:bg-neutral-200 text-black w-9 h-9 rounded-full flex items-center justify-center transition-all shadow-md cursor-pointer"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Center Image/Document Viewport */}
          <div className="flex-1 w-full flex items-center justify-center p-4 min-h-0">
            <div 
              className={`max-w-full max-h-[75vh] rounded-2xl flex items-center justify-center transition-all duration-300 relative shadow-2xl ${
                isPdfFile(selectedAsset.name)
                  ? 'bg-white p-0'
                  : `p-4 md:p-8 ${
                      lightboxBg === 'checkerboard'
                        ? 'bg-checkerboard'
                        : lightboxBg === 'dark'
                        ? 'bg-neutral-900 border border-neutral-800'
                        : 'bg-white'
                    }`
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              {isPdfFile(selectedAsset.name) ? (
                <iframe
                  src={`${selectedAsset.url}#toolbar=0`}
                  title={selectedAsset.name}
                  className="w-[85vw] h-[65vh] max-w-4xl max-h-[70vh] rounded-xl border-0 bg-white"
                />
              ) : (
                <img
                  src={selectedAsset.url}
                  alt={selectedAsset.name}
                  className="max-w-full max-h-[60vh] object-contain select-none pointer-events-none rounded-lg"
                  draggable="false"
                  onContextMenu={(e) => e.preventDefault()}
                />
              )}
            </div>
          </div>

          {/* Bottom Bar / Close helper */}
          <div className="text-center text-[10px] font-bold tracking-widest text-neutral-500 uppercase select-none pb-2">
            Click anywhere outside the image to close
          </div>
        </div>
      )}

      {/* Process & Save Asset Modal (Ctrl+V or custom upload) */}
      {pendingAssetImage && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[150] flex items-center justify-center p-6 animate-in fade-in duration-200"
          onClick={() => { if (!isUploading) { setPendingAssetImage(null); setOriginalAssetImage(null); } }}
        >
          <div 
            className="bg-white rounded-[2rem] shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 md:p-8 border-b border-neutral-100 flex items-center justify-between">
              <div>
                <h3 className="font-serif text-2xl text-neutral-900">Process & Save Asset</h3>
                <p className="text-neutral-500 text-sm mt-1">Review your asset, remove its background if necessary, and save it to your company vault.</p>
              </div>
              <button 
                onClick={() => { setPendingAssetImage(null); setOriginalAssetImage(null); }} 
                disabled={isUploading} 
                className="p-2 hover:bg-neutral-100 rounded-full transition-colors disabled:opacity-50 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-2">
              {/* Left Side: Checkerboard Preview */}
              <div className="bg-neutral-50 p-8 flex items-center justify-center border-r border-neutral-100 min-h-[300px] md:min-h-0 relative bg-checkerboard">
                <img 
                  src={pendingAssetImage} 
                  alt="Asset Preview" 
                  className="max-w-full max-h-[50vh] object-contain shadow-md rounded-lg transition-all duration-300"
                />
              </div>

              {/* Right Side: Options & Actions */}
              <div className="p-8 flex flex-col justify-between bg-neutral-50/50">
                <div className="space-y-6">
                  <div>
                    <h4 className="text-xs uppercase tracking-widest font-bold text-neutral-400 mb-2">Background Removal</h4>
                    <p className="text-neutral-500 text-xs mb-4">To place this logo cleanly on garments, erase solid backgrounds to transparency (making it a PNG).</p>
                  </div>

                  <div className="space-y-3">
                    <button
                      onClick={() => setErasingAssetUrl(pendingAssetImage)}
                      disabled={isUploading}
                      className="w-full flex items-center justify-between p-4 bg-white border border-neutral-200 rounded-2xl hover:border-black transition-all text-left shadow-sm disabled:opacity-50 group hover:shadow-md cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-neutral-100 rounded-xl text-neutral-900 group-hover:bg-black group-hover:text-white transition-all group-hover:scale-110">
                          <Eraser size={18} />
                        </div>
                        <div>
                          <span className="font-bold text-sm block text-neutral-900">Manual Background Eraser</span>
                          <span className="text-[11px] text-neutral-500 block mt-0.5">Click sections of color to erase manually</span>
                        </div>
                      </div>
                      <Plus size={16} className="text-neutral-400 group-hover:translate-x-1 transition-transform" />
                    </button>
                  </div>

                  {pendingAssetImage !== originalAssetImage && (
                    <button
                      onClick={() => setPendingAssetImage(originalAssetImage)}
                      disabled={isUploading}
                      className="text-xs text-neutral-500 hover:text-black font-bold uppercase tracking-widest flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <RotateCw size={12} /> Reset to Original Image
                    </button>
                  )}
                </div>

                <div className="flex gap-4 border-t border-neutral-100 pt-6 mt-6">
                  <button
                    onClick={() => { setPendingAssetImage(null); setOriginalAssetImage(null); }}
                    disabled={isUploading}
                    className="flex-1 py-3.5 border border-neutral-250 hover:border-black rounded-full text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveProcessedAsset}
                    disabled={isUploading}
                    className="flex-1 py-3.5 bg-black text-white rounded-full text-xs font-bold tracking-widest uppercase hover:bg-neutral-800 transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-md"
                  >
                    {isUploading && <Loader2 className="animate-spin" size={14} />}
                    <span>Save to Vault</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual Eraser Modal */}
      {erasingAssetUrl && (
        <BackgroundEraserModal
          currentUrl={erasingAssetUrl}
          onClose={() => setErasingAssetUrl(null)}
          onSave={(newUrl) => {
            setPendingAssetImage(newUrl);
            setErasingAssetUrl(null);
          }}
        />
      )}
    </div>
  );
}

function BackgroundEraserModal({ currentUrl, onClose, onSave }: {
  currentUrl: string,
  onClose: () => void,
  onSave: (newUrl: string) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [tolerance, setTolerance] = useState(35);
  const [isProcessing, setIsProcessing] = useState(false);
  const [needsReset, setNeedsReset] = useState(0);
  const [clickPositions, setClickPositions] = useState<{x: number, y: number}[]>([]);

  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  
  const stateRef = useRef({ zoom: 1, pan: { x: 0, y: 0 } });
  const [viewState, setViewState] = useState({ zoom: 1, pan: { x: 0, y: 0 } });

  const handleUndo = () => {
    setClickPositions(prev => prev.slice(0, -1));
  };

  // Keyboard listeners for spacebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        setIsSpaceDown(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpaceDown(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Wheel listener for zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    const handleNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.15 : 0.15;
      const current = stateRef.current;
      const newZoom = Math.max(0.2, Math.min(25, current.zoom * (1 + delta)));
      
      const rect = container.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      const lx = (e.clientX - cx - current.pan.x) / current.zoom;
      const ly = (e.clientY - cy - current.pan.y) / current.zoom;

      const newPanX = e.clientX - cx - lx * newZoom;
      const newPanY = e.clientY - cy - ly * newZoom;
      
      stateRef.current = { zoom: newZoom, pan: { x: newPanX, y: newPanY } };
      setViewState(stateRef.current);
    };
    
    container.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleNativeWheel);
  }, []);

  // Main render loop for image drawing and erasure
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      // If we have click positions, perform flood fill for each position
      if (clickPositions.length > 0) {
        const w = canvas.width;
        const h = canvas.height;
        const imgData = ctx.getImageData(0, 0, w, h);
        const data = imgData.data;
        const scaledTolerance = (tolerance / 100) * 255;
        
        for (const pos of clickPositions) {
          const startX = pos.x;
          const startY = pos.y;
          
          if (startX >= 0 && startX < w && startY >= 0 && startY < h) {
            const startPos = (startY * w + startX) * 4;
            const startR = data[startPos];
            const startG = data[startPos+1];
            const startB = data[startPos+2];
            const startA = data[startPos+3];

            if (startA !== 0) {
              const match = (p: number) => {
                const a = data[p+3];
                if (a === 0) return false;
                const r = data[p];
                const g = data[p+1];
                const b = data[p+2];
                
                const diff = Math.max(Math.abs(r - startR), Math.abs(g - startG), Math.abs(b - startB));
                return diff <= scaledTolerance;
              };
              
              const maxStack = w * h * 2;
              const stack = new Uint32Array(maxStack);
              let stackPtr = 0;
              
              stack[stackPtr++] = startX;
              stack[stackPtr++] = startY;
              
              const visited = new Uint8Array(w * h);
              visited[startY * w + startX] = 1;
              
              while(stackPtr > 0) {
                const y = stack[--stackPtr];
                const x = stack[--stackPtr];
                
                const p = (y * w + x) * 4;
                if (match(p)) {
                  data[p + 3] = 0;
                  
                  if (x > 0 && visited[y * w + (x - 1)] === 0) { 
                     visited[y * w + (x - 1)] = 1; 
                     stack[stackPtr++] = x - 1;
                     stack[stackPtr++] = y;
                  }
                  if (x < w - 1 && visited[y * w + (x + 1)] === 0) { 
                     visited[y * w + (x + 1)] = 1; 
                     stack[stackPtr++] = x + 1;
                     stack[stackPtr++] = y;
                  }
                  if (y > 0 && visited[(y - 1) * w + x] === 0) { 
                     visited[(y - 1) * w + x] = 1; 
                     stack[stackPtr++] = x;
                     stack[stackPtr++] = y - 1;
                  }
                  if (y < h - 1 && visited[(y + 1) * w + x] === 0) { 
                     visited[(y + 1) * w + x] = 1; 
                     stack[stackPtr++] = x;
                     stack[stackPtr++] = y + 1;
                  }
                }
              }
            }
          }
        }
        ctx.putImageData(imgData, 0, 0);
      }
    };
    img.src = currentUrl;
  }, [currentUrl, needsReset, tolerance, clickPositions]);

  const handleCanvasClick = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    
    // Calculate exact click coordinates within original image scale
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    
    const startX = Math.floor((clickX / rect.width) * canvas.width);
    const startY = Math.floor((clickY / rect.height) * canvas.height);
    
    setClickPositions(prev => [...prev, { x: startX, y: startY }]);
  };
  
  const handleSave = async () => {
    if (!canvasRef.current) return;
    setIsProcessing(true);
    try {
      const dataUrl = canvasRef.current.toDataURL('image/png');
      onSave(dataUrl);
    } catch (err) {
      console.error(err);
      alert('Failed to save erased image');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[220] flex items-center justify-center p-6 animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="p-6 md:p-8 border-b border-zinc-100 flex items-center justify-between">
          <div>
            <h3 className="font-serif text-2xl text-neutral-900">Manual Eraser</h3>
            <p className="text-zinc-500 text-sm mt-1">Click anywhere on the background to instantly wipe it out to pure transparency.</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-zinc-50 rounded-full transition-colors cursor-pointer"><X size={20} /></button>
        </div>
        
        <div 
          ref={containerRef}
          className="p-6 flex-1 overflow-hidden flex flex-col items-center justify-center border-y border-zinc-200 relative select-none" 
          style={{ 
            backgroundColor: '#e5e7eb',
            backgroundImage: 'linear-gradient(45deg, #9ca3af 25%, transparent 25%, transparent 75%, #9ca3af 75%, #9ca3af), linear-gradient(45deg, #9ca3af 25%, transparent 25%, transparent 75%, #9ca3af 75%, #9ca3af)',
            backgroundSize: '20px 20px',
            backgroundPosition: '0 0, 10px 10px'
          }}
        >
          <div className="absolute top-4 left-4 bg-zinc-900/60 backdrop-blur text-white text-[9px] uppercase tracking-widest font-bold px-3 py-1.5 rounded-full pointer-events-none z-10 flex items-center gap-2">
            <span>Scroll/Pinch to Zoom</span>
            <span className="w-1 h-1 rounded-full bg-white/30"></span>
            <span>Space + Drag to Pan</span>
          </div>

          <div 
            style={{ 
              transform: `translate(${viewState.pan.x}px, ${viewState.pan.y}px) scale(${viewState.zoom})`,
              display: 'flex' 
            }}
          >
            <canvas
              ref={canvasRef}
              onPointerDown={(e) => {
                if (isSpaceDown || e.button === 1 || e.button === 2) { 
                  e.preventDefault();
                  setIsDragging(true);
                  (e.target as HTMLElement).setPointerCapture(e.pointerId);
                } else if (e.button === 0) {
                  handleCanvasClick(e);
                }
              }}
              onPointerMove={(e) => {
                if (isDragging) {
                  stateRef.current.pan = { 
                    x: stateRef.current.pan.x + e.movementX, 
                    y: stateRef.current.pan.y + e.movementY 
                  };
                  setViewState({ ...stateRef.current });
                }
              }}
              onPointerUp={(e) => {
                if (isDragging) {
                  setIsDragging(false);
                  (e.target as HTMLElement).releasePointerCapture(e.pointerId);
                }
              }}
              onContextMenu={e => e.preventDefault()}
              className={`w-auto h-auto max-w-full max-h-[55vh] shadow-2xl bg-transparent ${isSpaceDown || isDragging ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'}`}
              style={{ touchAction: 'none' }}
            />
          </div>
        </div>
        
        <div className="p-6 md:px-8 border-t border-zinc-100 flex items-center justify-between bg-white shrink-0 flex-wrap gap-4">
          <div className="flex items-center gap-6 flex-wrap">
            <div>
              <label className="text-[9px] uppercase tracking-widest font-bold text-zinc-400 mb-2 block font-mono">Detection Tolerance: {tolerance}</label>
              <input 
                type="range" 
                min="0" max="100" 
                value={tolerance} 
                onChange={(e) => setTolerance(Number(e.target.value))}
                className="w-32 md:w-48 accent-zinc-900 cursor-pointer"
              />
            </div>
            <button 
              onClick={() => {
                setNeedsReset(n => n + 1);
                setClickPositions([]);
                stateRef.current = { zoom: 1, pan: { x: 0, y: 0 } };
                setViewState(stateRef.current);
              }} 
              className="text-[10px] uppercase tracking-widest font-bold text-zinc-400 hover:text-zinc-950 flex items-center gap-1.5 transition-colors pt-4 cursor-pointer"
            >
              <RotateCw size={12} /> Reset Image
            </button>
            <button 
              onClick={handleUndo}
              disabled={clickPositions.length === 0}
              className="text-[10px] uppercase tracking-widest font-bold text-zinc-400 hover:text-zinc-950 disabled:text-zinc-200 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors pt-4 cursor-pointer"
              title="Undo Last Click"
            >
              <Undo size={12} /> Undo ({clickPositions.length})
            </button>
            <div className="flex items-center gap-1.5 border-l border-zinc-100 pl-6 pt-4">
              <button
                onClick={() => {
                  const current = stateRef.current;
                  const newZoom = Math.max(0.2, current.zoom - 0.25);
                  stateRef.current = { ...current, zoom: newZoom };
                  setViewState(stateRef.current);
                }}
                className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-zinc-900 transition-colors cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut size={16} />
              </button>
              <span className="text-[10px] font-bold text-zinc-500 min-w-[40px] text-center font-mono">{Math.round(viewState.zoom * 100)}%</span>
              <button
                onClick={() => {
                  const current = stateRef.current;
                  const newZoom = Math.min(25, current.zoom + 0.25);
                  stateRef.current = { ...current, zoom: newZoom };
                  setViewState(stateRef.current);
                }}
                className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-zinc-900 transition-colors cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn size={16} />
              </button>
              <button
                onClick={() => {
                  stateRef.current = { zoom: 1, pan: { x: 0, y: 0 } };
                  setViewState(stateRef.current);
                }}
                className="text-[9px] uppercase tracking-widest font-bold text-zinc-400 hover:text-zinc-900 transition-colors p-1.5 hover:bg-zinc-50 rounded-lg cursor-pointer"
                title="Reset Zoom"
              >
                Reset
              </button>
            </div>
          </div>
          <div className="flex gap-4">
            <button onClick={onClose} className="px-6 py-3 rounded-full text-xs font-bold tracking-widest uppercase hover:bg-zinc-100 transition-colors cursor-pointer">Cancel</button>
            <button onClick={handleSave} disabled={isProcessing} className="px-6 py-3 bg-zinc-900 text-white rounded-full text-xs font-bold tracking-widest uppercase hover:bg-zinc-800 transition-colors disabled:opacity-50 flex items-center gap-2 cursor-pointer">
              {isProcessing && <Loader2 className="animate-spin" size={14} />}
              {isProcessing ? 'Processing...' : 'Apply Eraser'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
