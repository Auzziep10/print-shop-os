import { initializeApp, getApps } from "firebase/app";
import { getAI, getGenerativeModel } from "firebase/ai";

const getEnv = (key: string) => {
  if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
    return (import.meta as any).env[key];
  }
  return undefined;
};

const firebaseConfig = {
  apiKey: getEnv('VITE_FIREBASE_API_KEY') || "AIzaSyD0J9_ecnLBHzSawxjCDRFnttqUUHAzFv8",
  authDomain: getEnv('VITE_FIREBASE_AUTH_DOMAIN') || "wovn-catalog.firebaseapp.com",
  projectId: getEnv('VITE_FIREBASE_PROJECT_ID') || "wovn-catalog",
  storageBucket: getEnv('VITE_FIREBASE_STORAGE_BUCKET') || "wovn-catalog.firebasestorage.app",
  messagingSenderId: getEnv('VITE_FIREBASE_MESSAGING_SENDER_ID') || "1072086232494",
  appId: getEnv('VITE_FIREBASE_APP_ID') || "1:1072086232494:web:b4f0c923770919b6152c3f"
};

const appName = "wovn-gemini";
const apps = getApps();
const existingApp = apps.find(a => a.name === appName);
const app = existingApp || initializeApp(firebaseConfig, appName);
const ai = getAI(app);

async function toBase64(url: string): Promise<{ data: string; mimeType: string }> {
  // Use local proxy to avoid CORS errors for external SanMar URLs, unless same-origin
  const isSameOrigin = typeof window !== 'undefined' && url.startsWith(window.location.origin);
  const proxiedUrl = (url.startsWith('http') && !isSameOrigin) 
    ? `/api/sanmar/proxy-image?url=${encodeURIComponent(url)}` 
    : url;
  const response = await fetch(proxiedUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image proxy status: ${response.status}`);
  }
  const blob = await response.blob();
  const mimeType = blob.type;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve({
      data: (reader.result as string).split(',')[1],
      mimeType
    });
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function ensureSolidBackground(imageUrlOrBase64: string): Promise<string> {
  let src = imageUrlOrBase64;
  if (src.startsWith('http')) {
    const { data, mimeType } = await toBase64(src);
    src = `data:${mimeType};base64,${data}`;
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error("Could not get 2D context");
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 1.0));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = (e) => reject(new Error("Failed to load image element"));
    img.src = src;
  });
}

export async function generateRotatedGarment(baseImage: string, viewAngle: string): Promise<string> {
  const model = "gemini-3.1-flash-image";

  let baseImageData: string;
  let baseMimeType = "image/jpeg";

  const solidBaseImage = await ensureSolidBackground(baseImage);
  baseImageData = solidBaseImage.split(",")[1] || solidBaseImage;

  const modelObj = getGenerativeModel(ai, { model });

  const result = await modelObj.generateContent([
    {
      text: `TASK: Rotate Garment
CRITICAL CONSTRAINTS:
1. COMPLETELY ROTATE THE GARMENT IN 3D SPACE TO DISPLAY THE: ${viewAngle}.
2. DO NOT KEEP IT FACING THE SAME DIRECTION as the original image. We want what this garment would realistically look like photographed from the new requested perspective/side.
3. ISOLATE ON PURE WHITE (ULTRA-CRITICAL): The garment MUST be completely isolated on a flat, solid, mathematically pure white background (HEX #FFFFFF). Absolutely NO shadows on the floor. NO cream, off-white, light grey, or transparent backgrounds. NO gradients. Every non-garment pixel MUST be exactly #FFFFFF.
4. Keep the same exact fabric, collar style, sleeve style, proportions, and details.
5. Do NOT add any logos or graphics. Just the blank garment.`
    },
    {
      inlineData: {
        data: baseImageData,
        mimeType: baseMimeType,
      }
    }
  ]);

  const response = result.response;
  const candidates = response.candidates;

  if (candidates && candidates.length > 0) {
    for (const part of candidates[0].content?.parts || []) {
      if (part.inlineData) {
        return `data:${part.inlineData.mimeType || 'image/jpeg'};base64,${part.inlineData.data}`;
      }
      if (part.text && part.text.startsWith('iVBORw0KGgo')) {
        return `data:image/png;base64,${part.text}`;
      }
    }
  }

  throw new Error("Failed to generate rotated garment image");
}
