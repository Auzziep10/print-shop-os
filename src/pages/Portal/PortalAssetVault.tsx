import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../../lib/firebase';
import { Upload, Trash2, Loader2, FileText, Image as ImageIcon, ArrowLeft, Plus, X, Edit2, Check } from 'lucide-react';

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
      alert(files.length === 1 ? "Asset uploaded successfully!" : `${files.length} assets uploaded successfully!`);
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
    </div>
  );
}
