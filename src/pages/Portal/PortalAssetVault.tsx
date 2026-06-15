import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../../lib/firebase';
import { Upload, Trash2, Download, Loader2, FileText, Image as ImageIcon, ArrowLeft, Plus } from 'lucide-react';

export function PortalAssetVault() {
  const { customerId } = useParams();
  const navigate = useNavigate();
  const currentCustomerId = customerId || 'CUS-001';

  const [assets, setAssets] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const storageRef = ref(storage, `portal/${currentCustomerId}/vault/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(storageRef);

      const newAsset = {
        id: `asset-${Date.now()}`,
        name: file.name,
        url: downloadUrl,
        uploadedAt: new Date().toISOString()
      };

      const updatedAssets = [...assets, newAsset];
      
      await updateDoc(doc(db, 'customers', currentCustomerId), {
        assets: updatedAssets
      });

      setAssets(updatedAssets);
      alert("Asset uploaded successfully!");
    } catch (err) {
      console.error("Upload failed:", err);
      alert("Failed to upload asset. Please try again.");
    } finally {
      setIsUploading(false);
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
          <input type="file" className="hidden" onChange={handleFileUpload} accept="image/*,application/pdf,.ai,.eps,.psd,.cdr,.zip" />
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
            <input type="file" className="hidden" onChange={handleFileUpload} accept="image/*,application/pdf,.ai,.eps,.psd,.cdr,.zip" />
            <Upload size={14} /> Upload First File
          </label>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 mt-4">
          {assets.map((asset, index) => (
            <div 
              key={asset.id} 
              className="bg-white rounded-3xl border border-neutral-200/60 shadow-[0_4px_16px_rgb(0,0,0,0.01)] hover:shadow-md hover:border-black/20 transition-all p-5 flex flex-col justify-between min-h-[220px] relative group"
            >
              {/* Card Top: Preview or Icon */}
              <div className="flex-1 flex flex-col gap-4">
                <div className="w-full h-32 bg-neutral-50 rounded-2xl overflow-hidden border border-neutral-100 flex items-center justify-center p-2 relative shadow-inner">
                  {isImageFile(asset.name) ? (
                    <img 
                      src={asset.url} 
                      alt={asset.name} 
                      className="max-w-full max-h-full object-contain mix-blend-multiply group-hover:scale-105 transition-transform duration-300" 
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

                <div className="px-1 min-w-0">
                  <h4 
                    className="font-bold text-neutral-900 text-sm truncate pr-6 cursor-pointer"
                    title={asset.name}
                    onClick={() => window.open(asset.url, '_blank')}
                  >
                    {asset.name}
                  </h4>
                  <p className="text-[10px] font-bold text-neutral-400 mt-1 uppercase tracking-wider">
                    Uploaded {new Date(asset.uploadedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {/* Card Actions */}
              <div className="flex items-center justify-between border-t border-neutral-100 pt-4 mt-4">
                <a 
                  href={asset.url}
                  target="_blank"
                  rel="noreferrer"
                  data-tour={index === 0 ? "vault-download-btn" : undefined}
                  className="flex items-center gap-1.5 text-xs font-bold text-neutral-500 hover:text-black transition-colors"
                >
                  <Download size={14} /> Download
                </a>
                
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
    </div>
  );
}
