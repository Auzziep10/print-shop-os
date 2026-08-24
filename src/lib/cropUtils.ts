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
 * Auto-crops an image to its exact visible bounds (trimming outer transparent & white margins)
 * and returns a clean, trimmed PNG File / Blob / DataURL.
 */
export async function autoCropLogoToPng(
  imageSrc: string,
  options?: {
    trimWhiteBackground?: boolean;
    whiteThreshold?: number;
    alphaThreshold?: number;
    padding?: number;
  }
): Promise<{ blob: Blob; dataUrl: string; file: File; width: number; height: number; trimmed: boolean } | null> {
  const trimWhite = options?.trimWhiteBackground ?? true;
  const whiteThresh = options?.whiteThreshold ?? 245;
  const alphaThresh = options?.alphaThreshold ?? 10;
  const padding = options?.padding ?? 0;

  try {
    const img = await createImage(imageSrc);
    const canvas = document.createElement('canvas');
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const a = data[idx + 3];

        const isTransparent = a <= alphaThresh;
        const isWhite = trimWhite && r >= whiteThresh && g >= whiteThresh && b >= whiteThresh;

        if (!isTransparent && !isWhite) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX < minX || maxY < minY) {
      minX = 0;
      minY = 0;
      maxX = width - 1;
      maxY = height - 1;
    }

    const cropX = Math.max(0, minX - padding);
    const cropY = Math.max(0, minY - padding);
    const cropW = Math.min(width - cropX, (maxX - minX + 1) + 2 * padding);
    const cropH = Math.min(height - cropY, (maxY - minY + 1) + 2 * padding);

    const croppedCanvas = document.createElement('canvas');
    croppedCanvas.width = cropW;
    croppedCanvas.height = cropH;
    const croppedCtx = croppedCanvas.getContext('2d');
    if (!croppedCtx) return null;

    croppedCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    return new Promise((resolve) => {
      croppedCanvas.toBlob((blob) => {
        if (!blob) {
          resolve(null);
          return;
        }
        const dataUrl = croppedCanvas.toDataURL('image/png');
        const file = new File([blob], 'trimmed_logo.png', { type: 'image/png' });
        const trimmed = cropW < width || cropH < height;
        resolve({ blob, dataUrl, file, width: cropW, height: cropH, trimmed });
      }, 'image/png');
    });
  } catch (err) {
    console.error("Failed to auto-crop logo to PNG:", err);
    return null;
  }
}

