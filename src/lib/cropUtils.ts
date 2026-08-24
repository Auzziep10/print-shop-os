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
 * Auto-crops an image to its exact visible bounds by trimming outer transparent/white/grey margins
 * at 1:1 native resolution (preserving original pixel crispness without artificial pixelation).
 */
export async function autoCropLogoToPng(
  imageSrc: string,
  options?: {
    trimWhiteBackground?: boolean;
    colorTolerance?: number;
    padding?: number;
  }
): Promise<{ blob: Blob; dataUrl: string; file: File; width: number; height: number; trimmed: boolean } | null> {
  const trimWhite = options?.trimWhiteBackground ?? true;
  const tolerance = options?.colorTolerance ?? 32;
  const padding = options?.padding ?? 0;

  try {
    const img = await createImage(imageSrc);
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    // Track outer background pixels using BFS Flood Fill from edges
    const isBg = new Uint8Array(width * height);

    if (trimWhite) {
      // Sample 4 corner pixels to get reference background colors
      const getPixel = (x: number, y: number) => {
        const idx = (y * width + x) * 4;
        return { r: data[idx], g: data[idx + 1], b: data[idx + 2], a: data[idx + 3] };
      };

      const cornerColors = [
        getPixel(0, 0),
        getPixel(width - 1, 0),
        getPixel(0, height - 1),
        getPixel(width - 1, height - 1)
      ];

      const isSimilarToCorner = (r: number, g: number, b: number, a: number) => {
        if (a < 20) return true; // transparent
        for (const c of cornerColors) {
          // If corner is light (white/grey) and current pixel matches corner color within tolerance
          if (c.r > 180 && c.g > 180 && c.b > 180) {
            if (
              Math.abs(r - c.r) <= tolerance &&
              Math.abs(g - c.g) <= tolerance &&
              Math.abs(b - c.b) <= tolerance
            ) {
              return true;
            }
          }
          // Also match pure white/near white regardless
          if (r >= 235 && g >= 235 && b >= 235) return true;
        }
        return false;
      };

      // BFS Queue starting from all 4 outer border edges
      const queue: number[] = [];

      for (let x = 0; x < width; x++) {
        queue.push(x, 0); // top border
        queue.push(x, height - 1); // bottom border
      }
      for (let y = 0; y < height; y++) {
        queue.push(0, y); // left border
        queue.push(width - 1, y); // right border
      }

      let head = 0;
      while (head < queue.length) {
        const cx = queue[head++];
        const cy = queue[head++];
        const pos = cy * width + cx;
        if (isBg[pos]) continue;

        const idx = pos * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const a = data[idx + 3];

        if (isSimilarToCorner(r, g, b, a)) {
          isBg[pos] = 1;
          // Add 4-directional neighbors to queue
          if (cx > 0) queue.push(cx - 1, cy);
          if (cx < width - 1) queue.push(cx + 1, cy);
          if (cy > 0) queue.push(cx, cy - 1);
          if (cy < height - 1) queue.push(cx, cy + 1);
        }
      }
    }

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pos = y * width + x;
        const idx = pos * 4;

        if (trimWhite && isBg[pos]) {
          data[idx + 3] = 0; // Clear outer background to transparent
        } else if (data[idx + 3] > 20) {
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

    if (trimWhite) {
      ctx.putImageData(imageData, 0, 0);
    }

    const cropX = Math.max(0, minX - padding);
    const cropY = Math.max(0, minY - padding);
    const cropW = Math.min(width - cropX, (maxX - minX + 1) + 2 * padding);
    const cropH = Math.min(height - cropY, (maxY - minY + 1) + 2 * padding);

    // Keep 1:1 NATIVE RESOLUTION - Never upscale low-res pixels to prevent pixelation!
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

