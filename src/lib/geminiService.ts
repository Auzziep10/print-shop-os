// Google Gemini Multimodal Garment Rotation Service

export interface GenerateGarmentOptions {
  color?: string;
  style?: string;
  category?: string;
}

const getApiKey = (): string => {
  if (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GEMINI_API_KEY) {
    return (import.meta as any).env.VITE_GEMINI_API_KEY;
  }
  return "";
};

/**
 * Checks if a color name or hex is in the dark/asphalt/black/charcoal spectrum.
 */
export function isDarkTone(colorName?: string, hex?: string): boolean {
  if (colorName) {
    const lower = colorName.toLowerCase().trim();
    const darkKeywords = [
      'black', 'charcoal', 'asphalt', 'dark heather', 'vintage black',
      'pepper', 'tar', 'iron', 'smoke', 'anthracite', 'shadow',
      'night', 'jet', 'onyx', 'carbon', 'gunmetal', 'dark grey',
      'dark gray', 'espresso', 'chocolate', 'heavy metal', 'cast iron',
      'caviar', 'obsidian', 'oil wash', 'solid asphalt', 'asphalt blend'
    ];
    if (darkKeywords.some(kw => lower.includes(kw))) {
      return true;
    }
  }

  if (hex && hex.startsWith('#')) {
    const clean = hex.replace('#', '');
    if (clean.length === 6) {
      const r = parseInt(clean.substring(0, 2), 16) || 0;
      const g = parseInt(clean.substring(2, 4), 16) || 0;
      const b = parseInt(clean.substring(4, 6), 16) || 0;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum < 95) return true;
    }
  }

  return false;
}

/**
 * Checks if a color name is in the heather / grey / silver spectrum.
 */
export function isHeatherOrGrey(colorName?: string): boolean {
  if (!colorName) return false;
  const lower = colorName.toLowerCase().trim();
  const greyKeywords = [
    'heather', 'grey', 'gray', 'silver', 'ash', 'athletic',
    'slate', 'cement', 'oxford', 'nickel', 'platinum'
  ];
  return greyKeywords.some(kw => lower.includes(kw));
}

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
  const mimeType = blob.type || 'image/jpeg';
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

/**
 * Ensures an image is isolated on a solid #FFFFFF white background.
 */
export async function ensureSolidBackground(imageUrlOrBase64: string): Promise<string> {
  let src = imageUrlOrBase64;
  if (src.startsWith('http')) {
    try {
      const { data, mimeType } = await toBase64(src);
      src = `data:${mimeType};base64,${data}`;
    } catch {
      // If fetching fails, return as-is
      return imageUrlOrBase64;
    }
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(src);
          return;
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.95));
      } catch {
        resolve(src);
      }
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}

/**
 * Calls Gemini directly via the Google AI Studio / Generative Language API
 * using model gemini-3.1-flash-image with image modality.
 */
async function callGeminiDirect(baseImageData: string, mimeType: string, viewAngle: string): Promise<string> {
  const apiKey = getApiKey();
  const model = "gemini-3.1-flash-image";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const promptText = `TASK: Rotate Garment
CRITICAL CONSTRAINTS:
1. COMPLETELY ROTATE THE GARMENT IN 3D SPACE TO DISPLAY THE: ${viewAngle}.
2. DO NOT KEEP IT FACING THE SAME DIRECTION as the original image. We want what this garment would realistically look like photographed from the new requested perspective/side.
3. ISOLATE ON PURE WHITE (ULTRA-CRITICAL): The garment MUST be completely isolated on a flat, solid, mathematically pure white background (HEX #FFFFFF). Absolutely NO shadows on the floor. NO cream, off-white, light grey, or transparent backgrounds. NO gradients. Every non-garment pixel MUST be exactly #FFFFFF.
4. Keep the same exact fabric, collar style, sleeve style, proportions, and details.
5. Do NOT add any logos or graphics. Just the blank garment.`;

  const payload = {
    contents: [
      {
        parts: [
          { text: promptText },
          {
            inlineData: {
              mimeType: mimeType || 'image/jpeg',
              data: baseImageData
            }
          }
        ]
      }
    ],
    generationConfig: {
      responseModalities: ["IMAGE"]
    }
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini API failed with status ${response.status}: ${errorBody}`);
  }

  const result = await response.json();
  const candidates = result.candidates;

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

  throw new Error("No image was returned by Gemini model");
}

/**
 * Generates an AI-rotated garment view using Gemini 3.1 Flash Image.
 */
export async function generateRotatedGarment(
  baseImage: string,
  viewAngle: string,
  _options?: GenerateGarmentOptions
): Promise<string> {
  // 1. Prepare solid background image
  const solidBase = await ensureSolidBackground(baseImage);
  let baseImageData = '';
  let mimeType = 'image/jpeg';

  if (solidBase.startsWith('data:')) {
    const match = solidBase.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      mimeType = match[1];
      baseImageData = match[2];
    }
  } else {
    baseImageData = solidBase;
  }

  // 2. Try backend API route first (best for production / Vercel secrets)
  try {
    const apiRes = await fetch('/api/generate-rotated-garment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseImage: `data:${mimeType};base64,${baseImageData}`,
        viewAngle
      })
    });

    if (apiRes.ok) {
      const data = await apiRes.json();
      if (data.imageUrl) {
        return data.imageUrl;
      }
    }
  } catch (apiErr) {
    console.warn("Backend API route failed, attempting direct Gemini API call:", apiErr);
  }

  // 3. Direct Gemini API call fallback (fast, authenticated with client key)
  return await callGeminiDirect(baseImageData, mimeType, viewAngle);
}

