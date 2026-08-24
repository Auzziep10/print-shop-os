export const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image))
    image.addEventListener('error', (error) => reject(error))
    image.setAttribute('crossOrigin', 'anonymous') // needed to avoid CORS issues
    image.src = url
  })

export async function getCroppedImg(
  imageSrc: string,
  pixelCrop: { x: number; y: number; width: number; height: number }
): Promise<File | null> {
  const image = await createImage(imageSrc)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')

  if (!ctx) {
    return null
  }

  // Set canvas size to match the bounding box of the crop area
  canvas.width = pixelCrop.width
  canvas.height = pixelCrop.height

  // Draw the cropped image onto the canvas
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  )

  // As a blob
  return new Promise((resolve) => {
    canvas.toBlob((file) => {
      if (file) {
        resolve(new File([file], 'cropped_logo.png', { type: 'image/png' }))
      } else {
        resolve(null)
      }
    }, 'image/png')
  })
}

/**
 * Auto-crops an image to its exact visible bounds (trimming outer transparent, white & light grey margins)
 * and outputs a high-resolution PNG (minimum 2400px / 200+ PPI for print production).
 */
export async function autoCropLogoToPng(
  imageSrc: string,
  options?: {
    trimWhiteBackground?: boolean;
    whiteThreshold?: number;
    alphaThreshold?: number;
    padding?: number;
    minDimension?: number;
  }
): Promise<{ blob: Blob; dataUrl: string; file: File; width: number; height: number; trimmed: boolean } | null> {
  const trimWhite = options?.trimWhiteBackground ?? true;
  const whiteThresh = options?.whiteThreshold ?? 220; // lower threshold to catch light grey/off-white boxes
  const alphaThresh = options?.alphaThreshold ?? 20;
  const padding = options?.padding ?? 0;
  const minDimension = options?.minDimension ?? 2400; // minimum width/height for high-res 200+ PPI print quality

  try {
    const img = await createImage(imageSrc);
    const origW = img.naturalWidth || img.width;
    const origH = img.naturalHeight || img.height;

    const canvas = document.createElement('canvas');
    canvas.width = origW;
    canvas.height = origH;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, origW, origH);
    const data = imageData.data;

    // Detect background color by sampling 4 corners
    const getPixel = (x: number, y: number) => {
      const idx = (y * origW + x) * 4;
      return { r: data[idx], g: data[idx + 1], b: data[idx + 2], a: data[idx + 3] };
    };

    const corners = [
      getPixel(0, 0),
      getPixel(origW - 1, 0),
      getPixel(0, origH - 1),
      getPixel(origW - 1, origH - 1)
    ];

    // Check if corners share a common light background color (within tolerance)
    const refCorner = corners[0];
    const isCornerBgLight = refCorner.a > 20 && refCorner.r > 200 && refCorner.g > 200 && refCorner.b > 200;

    let minX = origW;
    let minY = origH;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < origH; y++) {
      for (let x = 0; x < origW; x++) {
        const idx = (y * origW + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const a = data[idx + 3];

        const isTransparent = a <= alphaThresh;
        
        let isBg = isTransparent;
        if (trimWhite) {
          const isWhite = r >= whiteThresh && g >= whiteThresh && b >= whiteThresh;
          const isCornerMatch = isCornerBgLight && 
            Math.abs(r - refCorner.r) < 35 && 
            Math.abs(g - refCorner.g) < 35 && 
            Math.abs(b - refCorner.b) < 35;
          isBg = isTransparent || isWhite || isCornerMatch;
        }

        if (!isBg) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        } else if (trimWhite) {
          // Clear background pixel to transparent so output has no grey/white box
          data[idx + 3] = 0;
        }
      }
    }

    if (maxX < minX || maxY < minY) {
      minX = 0;
      minY = 0;
      maxX = origW - 1;
      maxY = origH - 1;
    }

    // Put updated imageData with transparent background back to original canvas
    if (trimWhite) {
      ctx.putImageData(imageData, 0, 0);
    }

    const cropX = Math.max(0, minX - padding);
    const cropY = Math.max(0, minY - padding);
    const cropW = Math.min(origW - cropX, (maxX - minX + 1) + 2 * padding);
    const cropH = Math.min(origH - cropY, (maxY - minY + 1) + 2 * padding);

    // Calculate high resolution output dimensions (min 2400px / 200+ PPI)
    const aspectRatio = cropW / cropH;
    let targetW = cropW;
    let targetH = cropH;

    if (cropW < minDimension && cropH < minDimension) {
      if (aspectRatio >= 1) {
        targetW = minDimension;
        targetH = Math.round(minDimension / aspectRatio);
      } else {
        targetH = minDimension;
        targetW = Math.round(minDimension * aspectRatio);
      }
    }

    const croppedCanvas = document.createElement('canvas');
    croppedCanvas.width = targetW;
    croppedCanvas.height = targetH;
    const croppedCtx = croppedCanvas.getContext('2d');
    if (!croppedCtx) return null;

    // Enable high quality image smoothing for upscaling
    croppedCtx.imageSmoothingEnabled = true;
    croppedCtx.imageSmoothingQuality = 'high';

    croppedCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, targetW, targetH);

    return new Promise((resolve) => {
      croppedCanvas.toBlob((blob) => {
        if (!blob) {
          resolve(null);
          return;
        }
        const dataUrl = croppedCanvas.toDataURL('image/png');
        const file = new File([blob], 'trimmed_highres_logo.png', { type: 'image/png' });
        const trimmed = cropW < origW || cropH < origH || targetW > cropW;
        resolve({ blob, dataUrl, file, width: targetW, height: targetH, trimmed });
      }, 'image/png');
    });
  } catch (err) {
    console.error("Failed to auto-crop logo to PNG:", err);
    return null;
  }
}

