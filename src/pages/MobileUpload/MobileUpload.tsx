import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { db, storage } from '../../lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { Camera, CheckCircle2, Loader2, UploadCloud } from 'lucide-react';

export function MobileUpload() {
  const { sessionId } = useParams();
  const [isUploading, setIsUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !sessionId) return;

    setIsUploading(true);
    setError(null);
    setSuccess(false);

    try {
      const storageRef = ref(storage, `mobile_uploads/${sessionId}_${Date.now()}_${file.name}`);
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on(
        'state_changed',
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        (_snapshot) => {},
        (err) => {
          console.error('Upload error:', err);
          setError('Failed to upload image. Please try again.');
          setIsUploading(false);
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          await setDoc(doc(db, 'mobile_uploads', sessionId), {
            url: downloadURL,
            status: 'completed',
            timestamp: serverTimestamp()
          });
          setSuccess(true);
          setIsUploading(false);
        }
      );
    } catch (err) {
      console.error(err);
      setError('An unexpected error occurred.');
      setIsUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl border border-brand-border text-center">
        {!success ? (
          <>
            <div className="w-16 h-16 bg-neutral-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
               <UploadCloud size={28} className="text-brand-primary" />
            </div>
            <h1 className="font-serif text-2xl font-bold text-brand-primary mb-2">Upload Image</h1>
            <p className="text-sm text-brand-secondary mb-8 leading-relaxed">
              Snap a photo with your camera to instantly send it to Print Shop OS.
            </p>

            {error && (
              <div className="bg-red-50 text-red-600 text-xs font-bold p-3 rounded-lg mb-6 border border-red-100">
                {error}
              </div>
            )}

            <label className={`w-full bg-brand-primary text-white py-4 rounded-xl flex items-center justify-center gap-3 font-bold uppercase tracking-widest text-sm cursor-pointer shadow-lg hover:bg-black transition-colors ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
              {isUploading ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
              {isUploading ? 'Uploading...' : 'Open Camera'}
              <input 
                type="file" 
                accept="image/*" 
                capture="environment" 
                className="hidden" 
                onChange={handleCapture} 
                disabled={isUploading}
              />
            </label>
          </>
        ) : (
          <div className="animate-in zoom-in-95 duration-300">
             <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6">
               <CheckCircle2 size={40} className="text-green-500" />
             </div>
             <h1 className="font-serif text-2xl font-bold text-brand-primary mb-2">Image Sync Success!</h1>
             <p className="text-sm text-brand-secondary mb-8">
               You can now securely close this tab and return to your computer dashboard.
             </p>
             <label className="w-full bg-neutral-100 text-brand-primary p-4 rounded-xl flex items-center justify-center gap-2 font-bold uppercase tracking-widest text-xs cursor-pointer hover:bg-neutral-200 transition-colors">
               <Camera size={14} /> Snap Another
               <input 
                 type="file" 
                 accept="image/*" 
                 capture="environment" 
                 className="hidden" 
                 onChange={(e) => {
                     // Auto-generate new sub-session or rely on main session if array?
                     // Wait, our design expects a new session ID for each image, or the laptop stays listening?
                     // Better if we just reuse the session and update the URL.
                     handleCapture(e);
                 }} 
               />
             </label>
          </div>
        )}
      </div>
    </div>
  );
}
