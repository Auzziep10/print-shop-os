// Measures the visible (non-transparent) area of an artwork image so gang sheets can size
// and place artwork by what actually prints, not by the transparent padding around it.

export interface VisibleBounds {
    /** Left edge of the visible artwork, in source image pixels */
    sx: number;
    /** Top edge of the visible artwork, in source image pixels */
    sy: number;
    /** Width of the visible artwork, in source image pixels */
    sw: number;
    /** Height of the visible artwork, in source image pixels */
    sh: number;
    /** Height / width of the visible artwork */
    aspect: number;
    /** True when transparent padding was found and trimmed */
    trimmed: boolean;
}

// Pixels at or below this alpha (out of 255, ~3%) are treated as blank
export const VISIBLE_ALPHA_THRESHOLD = 8;

// Largest canvas used for the alpha scan. Bigger images are scanned downscaled and the
// result is mapped back (rounded outward) to source pixels.
const MAX_SCAN_PIXELS = 4096 * 4096;

const fullBounds = (w: number, h: number): VisibleBounds => ({
    sx: 0,
    sy: 0,
    sw: w,
    sh: h,
    aspect: w > 0 && h > 0 ? h / w : 1,
    trimmed: false
});

/**
 * Bounding box of the pixels whose alpha is above the threshold.
 * Falls back to the whole image when the image is fully transparent, has no padding,
 * or its pixels cannot be read (cross-origin image without CORS).
 */
export const measureVisibleBounds = (
    img: HTMLImageElement | HTMLCanvasElement,
    alphaThreshold: number = VISIBLE_ALPHA_THRESHOLD
): VisibleBounds => {
    const natW = img instanceof HTMLImageElement ? img.naturalWidth : img.width;
    const natH = img instanceof HTMLImageElement ? img.naturalHeight : img.height;
    if (!natW || !natH) return fullBounds(natW || 0, natH || 0);

    try {
        const scale = Math.min(1, Math.sqrt(MAX_SCAN_PIXELS / (natW * natH)));
        const w = Math.max(1, Math.round(natW * scale));
        const h = Math.max(1, Math.round(natH * scale));

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return fullBounds(natW, natH);
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h).data;

        let top = -1;
        for (let y = 0; y < h && top < 0; y++) {
            const row = y * w * 4;
            for (let x = 0; x < w; x++) {
                if (data[row + x * 4 + 3] > alphaThreshold) { top = y; break; }
            }
        }
        // Fully transparent image: nothing to trim to, use the whole image
        if (top < 0) return fullBounds(natW, natH);

        let bottom = top;
        for (let y = h - 1; y > top; y--) {
            const row = y * w * 4;
            let found = false;
            for (let x = 0; x < w; x++) {
                if (data[row + x * 4 + 3] > alphaThreshold) { found = true; break; }
            }
            if (found) { bottom = y; break; }
        }

        let left = w - 1;
        let right = 0;
        for (let y = top; y <= bottom; y++) {
            const row = y * w * 4;
            for (let x = 0; x < left; x++) {
                if (data[row + x * 4 + 3] > alphaThreshold) { left = x; break; }
            }
            for (let x = w - 1; x > right; x--) {
                if (data[row + x * 4 + 3] > alphaThreshold) { right = x; break; }
            }
        }
        if (right < left) { left = 0; right = w - 1; }

        // Map back to source pixels, rounding outward so no visible pixel is clipped
        const sx = Math.max(0, Math.floor(left / scale));
        const sy = Math.max(0, Math.floor(top / scale));
        const ex = Math.min(natW, Math.ceil((right + 1) / scale));
        const ey = Math.min(natH, Math.ceil((bottom + 1) / scale));
        const sw = Math.max(1, ex - sx);
        const sh = Math.max(1, ey - sy);

        return {
            sx,
            sy,
            sw,
            sh,
            aspect: sh / sw,
            trimmed: sx > 0 || sy > 0 || sw < natW || sh < natH
        };
    } catch (err) {
        console.warn('Could not read artwork pixels to trim transparent padding; using full image size.', err);
        return fullBounds(natW, natH);
    }
};

/** Loads an image (CORS-enabled so its pixels can be read) and measures its visible bounds. */
export const measureVisibleBoundsFromUrl = (url: string): Promise<VisibleBounds | null> =>
    new Promise((resolve) => {
        const img = new window.Image();
        if (!url.startsWith('blob:') && !url.startsWith('data:')) {
            img.crossOrigin = 'anonymous';
        }
        img.onload = () => resolve(measureVisibleBounds(img));
        img.onerror = () => resolve(null);
        img.src = url;
    });
