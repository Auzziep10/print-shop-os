import FileSaver from 'file-saver';

export interface ImageExportOptions {
  upscale?: number; // 1 = 1x full-size native, 2 = 2x super-res (e.g. 4K)
  minDimension?: number; // e.g. 2400 to guarantee very large output
  format?: 'image/png' | 'image/jpeg';
  transparent?: boolean; // default true for PNG
  backgroundColor?: string;
}

/**
 * Loads an image with CORS anonymous attribute, with automatic proxy fallback.
 */
export async function loadImageWithCors(src: string): Promise<HTMLImageElement> {
  // If it's already a data URL or blob URL, load directly
  if (src.startsWith('data:') || src.startsWith('blob:')) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load image from data/blob URL'));
      img.src = src;
    });
  }

  // Attempt 1: Direct load with crossOrigin
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = 'anonymous';
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Direct crossOrigin load failed'));
      el.src = src;
    });

    // Test if canvas is tainted by drawing 1x1 pixel test
    const testCanvas = document.createElement('canvas');
    testCanvas.width = 1;
    testCanvas.height = 1;
    const testCtx = testCanvas.getContext('2d');
    if (testCtx) {
      testCtx.drawImage(img, 0, 0, 1, 1);
      // If tainted, toBlob or getImageData will throw SecurityError
      testCtx.getImageData(0, 0, 1, 1);
    }
    return img;
  } catch (directErr) {
    // Attempt 2: Through proxy
    try {
      const proxyUrl = `/api/sanmar/proxy-image?url=${encodeURIComponent(src)}`;
      return await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.crossOrigin = 'anonymous';
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('Proxy image load failed'));
        el.src = proxyUrl;
      });
    } catch (proxyErr) {
      // Attempt 3: Direct fetch as blob
      const res = await fetch(src);
      if (!res.ok) throw new Error(`Fetch failed with status ${res.status}`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      return await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => {
          // Keep object URL until garbage collected
          resolve(el);
        };
        el.onerror = () => reject(new Error('Blob URL image load failed'));
        el.src = objectUrl;
      });
    }
  }
}

/**
 * Renders an image into a high-resolution PNG blob preserving full dimensions or upscaling.
 */
export async function exportImageToPngBlob(
  src: string,
  options: ImageExportOptions = {}
): Promise<{ blob: Blob; width: number; height: number }> {
  const img = await loadImageWithCors(src);

  const naturalWidth = img.naturalWidth || img.width || 2000;
  const naturalHeight = img.naturalHeight || img.height || 2000;

  let targetWidth = naturalWidth;
  let targetHeight = naturalHeight;

  if (options.upscale && options.upscale > 1) {
    targetWidth = Math.round(naturalWidth * options.upscale);
    targetHeight = Math.round(naturalHeight * options.upscale);
  } else if (options.minDimension) {
    const maxSide = Math.max(naturalWidth, naturalHeight);
    if (maxSide < options.minDimension) {
      const scale = options.minDimension / maxSide;
      targetWidth = Math.round(naturalWidth * scale);
      targetHeight = Math.round(naturalHeight * scale);
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D canvas context');

  // Crisp high quality image interpolation
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  if (!options.transparent && options.backgroundColor) {
    ctx.fillStyle = options.backgroundColor;
    ctx.fillRect(0, 0, targetWidth, targetHeight);
  } else {
    ctx.clearRect(0, 0, targetWidth, targetHeight);
  }

  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/png')
  );

  if (!blob) throw new Error('Failed to create PNG blob from canvas');

  return { blob, width: targetWidth, height: targetHeight };
}

/**
 * Downloads the given image URL as a full-sized, high-resolution PNG.
 */
export async function downloadImageAsPng(
  src: string,
  suggestedFilename = 'mockup.png',
  options: ImageExportOptions = {}
): Promise<{ width: number; height: number; filename: string }> {
  let cleanName = suggestedFilename.trim();
  if (!cleanName.toLowerCase().endsWith('.png')) {
    cleanName = cleanName.replace(/\.[a-z0-9]+$/i, '') + '.png';
  }
  // Sanitize filename for operating systems
  cleanName = cleanName.replace(/[<>:"/\\|?*]/g, '_');

  const { blob, width, height } = await exportImageToPngBlob(src, options);

  try {
    FileSaver.saveAs(blob, cleanName);
  } catch (e) {
    // Fallback using anchor tag
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = cleanName;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 1000);
  }

  return { width, height, filename: cleanName };
}

/**
 * Copies the image directly to the system clipboard as a transparent PNG.
 */
export async function copyImageAsPngToClipboard(
  src: string,
  options: ImageExportOptions = {}
): Promise<{ width: number; height: number }> {
  const { blob, width, height } = await exportImageToPngBlob(src, options);

  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    await navigator.clipboard.write([
      new ClipboardItem({
        'image/png': blob,
      }),
    ]);
    return { width, height };
  } else {
    throw new Error('Clipboard API is not supported in this browser context');
  }
}
