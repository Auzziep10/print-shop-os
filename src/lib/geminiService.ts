// Studio Garment Rotation & Sleeve Mockup Service
import colorHexMap from '../data/color-hex-map.json';

export interface GenerateGarmentOptions {
  color?: string;
  style?: string;
  category?: string;
}

const sleeveTintCache = new Map<string, string>();

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

/**
 * Resolves a color name to a hex code using colorHexMap.
 */
function resolveColorHex(colorName: string): string | null {
  if (!colorName) return null;
  const normalized = colorName.toLowerCase().trim();

  // 1. Direct match in colorHexMap
  for (const [key, hex] of Object.entries(colorHexMap)) {
    if (key.toLowerCase() === normalized) {
      return hex as string;
    }
  }

  // 2. Substring match
  for (const [key, hex] of Object.entries(colorHexMap)) {
    const keyLower = key.toLowerCase();
    if (keyLower.includes(normalized) || normalized.includes(keyLower)) {
      return hex as string;
    }
  }

  return null;
}

/**
 * Samples the dominant non-background color from an image.
 */
async function sampleDominantColor(imageUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    if (imageUrl.startsWith('http') || imageUrl.startsWith('//')) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, 64, 64);
        const data = ctx.getImageData(0, 0, 64, 64).data;
        let rSum = 0, gSum = 0, bSum = 0, count = 0;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
          // Ignore transparent or near-white studio background
          if (a > 50 && !(r > 240 && g > 240 && b > 240)) {
            rSum += r;
            gSum += g;
            bSum += b;
            count++;
          }
        }
        if (count === 0) return resolve(null);
        const rAvg = Math.round(rSum / count);
        const gAvg = Math.round(gSum / count);
        const bAvg = Math.round(bSum / count);
        const hex = '#' + [rAvg, gAvg, bAvg].map(x => x.toString(16).padStart(2, '0')).join('');
        resolve(hex);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = imageUrl;
  });
}

/**
 * Tints the neutral grey studio sleeve mockup to a target hex color,
 * preserving shadows, highlights, cloth textures, and pure white background.
 */
async function tintSleeveImage(sourceUrl: string, hexColor: string): Promise<string> {
  const cached = sleeveTintCache.get(hexColor);
  if (cached) return cached;

  return new Promise((resolve) => {
    const img = new Image();
    if (sourceUrl.startsWith('http') || sourceUrl.startsWith('//')) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width || 1024;
        canvas.height = img.naturalHeight || img.height || 1024;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve(sourceUrl);
          return;
        }

        ctx.drawImage(img, 0, 0);

        const cleanHex = hexColor.replace('#', '');
        const targetR = parseInt(cleanHex.substring(0, 2), 16) || 0;
        const targetG = parseInt(cleanHex.substring(2, 4), 16) || 0;
        const targetB = parseInt(cleanHex.substring(4, 6), 16) || 0;

        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;
        const len = data.length;

        const isWhite = targetR > 235 && targetG > 235 && targetB > 235;

        for (let i = 0; i < len; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];

          // Retain pure studio white background
          if (a < 15 || (r > 245 && g > 245 && b > 245)) {
            data[i] = 255;
            data[i + 1] = 255;
            data[i + 2] = 255;
            data[i + 3] = 255;
            continue;
          }

          // Relative luminance of the base grey sleeve
          const grey = 0.299 * r + 0.587 * g + 0.114 * b;

          if (isWhite) {
            // Brighten white garment with soft, realistic studio shading
            const factor = Math.min(255, (grey / 175) * 255);
            data[i] = factor;
            data[i + 1] = factor;
            data[i + 2] = factor;
          } else {
            // Multiplicative color mapping with texture preservation
            const shade = grey / 185;
            data[i] = Math.min(255, Math.round(targetR * shade));
            data[i + 1] = Math.min(255, Math.round(targetG * shade));
            data[i + 2] = Math.min(255, Math.round(targetB * shade));
          }
        }

        ctx.putImageData(imgData, 0, 0);
        const resultUrl = canvas.toDataURL('image/png');
        sleeveTintCache.set(hexColor, resultUrl);
        resolve(resultUrl);
      } catch (e) {
        console.warn("Failed to tint sleeve on canvas, falling back to source mockup:", e);
        resolve(sourceUrl);
      }
    };
    img.onerror = () => resolve(sourceUrl);
    img.src = sourceUrl;
  });
}

/**
 * Ensures an image is isolated on a solid #FFFFFF white background.
 */
export async function ensureSolidBackground(imageUrlOrBase64: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    if (imageUrlOrBase64.startsWith('http') || imageUrlOrBase64.startsWith('//')) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(imageUrlOrBase64);
          return;
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.95));
      } catch {
        resolve(imageUrlOrBase64);
      }
    };
    img.onerror = () => resolve(imageUrlOrBase64);
    img.src = imageUrlOrBase64;
  });
}

/**
 * Generates or resolves a rotated garment view (sleeve or back).
 * Fast, reliable, and fail-safe with zero unhandled exceptions.
 */
export async function generateRotatedGarment(
  baseImage: string,
  viewAngle: string,
  options?: GenerateGarmentOptions
): Promise<string> {
  const angleLower = (viewAngle || '').toLowerCase();
  const isSleeve = angleLower.includes('side') || 
                   angleLower.includes('sleeve') || 
                   angleLower.includes('profile');

  if (isSleeve) {
    const colorName = options?.color || '';
    const hex = resolveColorHex(colorName);

    // 1. If dark / black / charcoal / asphalt spectrum
    if (isDarkTone(colorName, hex || undefined)) {
      return '/mockups/NL6210/black_left_sleeve.png';
    }

    // 2. If heather / grey / silver spectrum
    if (isHeatherOrGrey(colorName)) {
      return '/mockups/NL6210/left_sleeve.png';
    }

    // 3. For any other colors, tint the studio sleeve template
    let targetHex = hex;
    if (!targetHex) {
      targetHex = await sampleDominantColor(baseImage);
    }

    if (targetHex) {
      try {
        const tinted = await tintSleeveImage('/mockups/NL6210/left_sleeve.png', targetHex);
        return tinted;
      } catch (err) {
        console.warn("Canvas tint error, falling back to neutral sleeve:", err);
      }
    }

    // 4. Default fallback: high quality neutral sleeve
    return '/mockups/NL6210/left_sleeve.png';
  }

  // Back View resolution
  if (baseImage) {
    try {
      return await ensureSolidBackground(baseImage);
    } catch {
      return baseImage;
    }
  }

  return '/mockups/NL6210/back.jpg';
}
