import { useParams, useNavigate, Link } from 'react-router-dom';
import { tokens } from '../../lib/tokens';
import { useState, useEffect } from 'react';
import { PillButton } from '../../components/ui/PillButton';
import { PackingSlipsManager } from '../../components/Orders/PackingSlipsManager';
import { TrackingModal } from '../../components/Orders/TrackingModal';
import { ArrowLeft, MessageSquare, QrCode, Clock, Users, Download, Loader2, X, Edit3, Upload, Trash2, Plus, ChevronDown, Image as ImageIcon, Box, Printer, ExternalLink, ShoppingBag, Search, Check, Truck, GripVertical, Pause, Play, DollarSign, PackagePlus, Layers, CreditCard, Copy, RotateCcw, Sparkles } from 'lucide-react';
import ReactQRCode from 'react-qr-code';
import QRCodeLib from 'qrcode';
import JSZip from 'jszip';
import FileSaver from 'file-saver';
import { StatusBadge, type StatusType } from '../../components/ui/StatusBadge';
import { useAuth } from '../../contexts/AuthContext';
import { useOrders } from '../../hooks/useOrders';
import { db, storage } from '../../lib/firebase';
import { doc, setDoc, getDoc, updateDoc, collection, getDocs, query, where, onSnapshot, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, uploadString } from 'firebase/storage';
import { getTrackingLink, normalizeUser } from '../../lib/utils';
import { PalletPickOptimizerModal } from '../../components/Inventory/PalletPickOptimizerModal';
import { GarmentCustomizerModal } from '../../components/Portal/GarmentCustomizerModal';
import sanmarCatalogJson from '../../data/sanmar-catalog.json';
import { sendOrderStatusSMS } from '../../lib/smsService';
const sanmarCatalog = sanmarCatalogJson as any[];

const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', 'OSFA'];

const sortSizes = (a: string, b: string) => {
      const orderMap: Record<string, number> = { 
        'yxs':-5, 'ys':-4, 'ym':-3, 'yl':-2, 'yxl':-1,
        'xxs':1, 'xs':2, 's':3, 'm':4, 'l':5, 'xl':6, 'xxl':7, '2xl':7, '3xl':8, '4xl':9, '5xl':10, 'osfa':11, 'os':12 
      };
      const aKey = a.split(' ')[0].toLowerCase();
      const bKey = b.split(' ')[0].toLowerCase();
      const aVal = orderMap[aKey] || 99;
      const bVal = orderMap[bKey] || 99;
      if (aVal !== bVal) return aVal - bVal;
      return a.localeCompare(b);
  };

// Helper component for the little gray pills in the items breakdown
const DataPill = ({ label, value }: { label: string, value: string }) => (
  <div className="flex flex-col items-center justify-center bg-neutral-100 px-3 py-1.5 rounded-2xl min-w-[84px] max-w-[140px]">
    <span className="text-[10px] text-neutral-500 font-semibold mb-0.5 truncate w-full text-center">{label}:</span>
    <span className="text-xs text-neutral-800 font-semibold leading-none truncate w-full text-center">{value}</span>
  </div>
);

// Utility to draw solid black Graphtec Type 1 registration marks (L-marks) in the 4 corners of the sheet's printable area
const drawGraphtecRegistrationMarks = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    topOffset: number,
    drawBackground: boolean = false
) => {
    const BASE_DPI = 300;
    const margin = 0.5 * BASE_DPI; // 150px (0.5 inch safety margin)
    const markLength = 0.5 * BASE_DPI; // 150px (12.7 mm mark line length)
    const thickness = 0.04 * BASE_DPI; // 12px (approx 1.0 mm line thickness)
    const padding = 0.15 * BASE_DPI; // 45px (0.15 inch padding for the white background squares)

    const xLeft = margin;
    const xRight = width - margin;
    const yTop = topOffset;
    const yBottom = height - margin;

    if (drawBackground) {
        ctx.fillStyle = 'white';
        
        // 1. Top-Left White Background
        ctx.fillRect(
            xLeft - padding,
            yTop - padding,
            markLength + (2 * padding),
            markLength + (2 * padding)
        );

        // 2. Top-Right White Background
        ctx.fillRect(
            xRight - markLength - padding,
            yTop - padding,
            markLength + (2 * padding),
            markLength + (2 * padding)
        );

        // 3. Bottom-Left White Background
        ctx.fillRect(
            xLeft - padding,
            yBottom - markLength - padding,
            markLength + (2 * padding),
            markLength + (2 * padding)
        );

        // 4. Bottom-Right White Background
        ctx.fillRect(
            xRight - markLength - padding,
            yBottom - markLength - padding,
            markLength + (2 * padding),
            markLength + (2 * padding)
        );
    }

    ctx.fillStyle = 'black';

    // 1. Top-Left L-Mark (Corner pointing down-right)
    ctx.fillRect(xLeft, yTop, markLength, thickness);
    ctx.fillRect(xLeft, yTop, thickness, markLength);

    // 2. Top-Right L-Mark (Corner pointing down-left)
    ctx.fillRect(xRight - markLength, yTop, markLength, thickness);
    ctx.fillRect(xRight - thickness, yTop, thickness, markLength);

    // 3. Bottom-Left L-Mark (Corner pointing up-right)
    ctx.fillRect(xLeft, yBottom - thickness, markLength, thickness);
    ctx.fillRect(xLeft, yBottom - markLength, thickness, markLength);

    // 4. Bottom-Right L-Mark (Corner pointing up-left)
    ctx.fillRect(xRight - markLength, yBottom - thickness, markLength, thickness);
    ctx.fillRect(xRight - thickness, yBottom - markLength, thickness, markLength);
};

// Calculates a safe padding margin around an artwork that prevents it from overlapping adjacent cut lines
const calculateSafePadding = (
    currentArt: any,
    allArtworks: any[],
    targetPadding: number
): number => {
    let safePadding = targetPadding;

    const currentCenterX = currentArt.x + currentArt.width / 2;
    const currentCenterY = currentArt.y + currentArt.height / 2;

    for (const other of allArtworks) {
        if (other.id === currentArt.id) continue;

        const otherCenterX = other.x + other.width / 2;
        const otherCenterY = other.y + other.height / 2;

        const dx = Math.abs(currentCenterX - otherCenterX);
        const dy = Math.abs(currentCenterY - otherCenterY);

        const gapX = dx - (currentArt.width + other.width) / 2;
        const gapY = dy - (currentArt.height + other.height) / 2;

        let distance = 0;
        if (gapX > 0 && gapY > 0) {
            distance = Math.sqrt(gapX * gapX + gapY * gapY);
        } else if (gapX > 0) {
            distance = gapX;
        } else if (gapY > 0) {
            distance = gapY;
        } else {
            distance = 0;
        }

        const distancePx = distance * 300; // 300 DPI
        
        // If they are closer than 2 * targetPadding, cap the padding to half the distance (with 12px physical cut line safety gap)
        if (distancePx < 2 * targetPadding) {
            const halfDist = Math.max(0, (distancePx - 12) / 2);
            if (halfDist < safePadding) {
                safePadding = halfDist;
            }
        }
    }

    return safePadding;
};

const isVinylItem = (item: any): boolean => {
    const name = (item.sheetSizeName || '').toLowerCase();
    return name.includes('(vinyl)') || name.includes('elevated flex');
};

// Helper function to trace contour paths from a canvas image (e.g. for vinyl vector outlines)
const findContourPaths = (canvas: HTMLCanvasElement): string[] => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return [];
    const width = canvas.width;
    const height = canvas.height;
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    const isSolid = (x: number, y: number): boolean => {
        if (x < 0 || x >= width || y < 0 || y >= height) return false;
        return data[(y * width + x) * 4 + 3] > 30; // Alpha threshold
    };

    const visited = new Uint8Array(width * height);
    const paths: string[] = [];

    // Direction offsets for Moore neighborhood
    const dx = [-1, 0, 1, 1, 1, 0, -1, -1];
    const dy = [-1, -1, -1, 0, 1, 1, 1, 0];

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if (isSolid(x, y) && !visited[idx]) {
                let isBoundary = false;
                for (let i = 0; i < 8; i++) {
                    if (!isSolid(x + dx[i], y + dy[i])) {
                        isBoundary = true;
                        break;
                    }
                }

                if (isBoundary) {
                    const points: {x: number; y: number}[] = [];
                    let currX = x;
                    let currY = y;
                    let prevX = x;
                    let prevY = y - 1;
                    
                    let startX = currX;
                    let startY = currY;
                    let count = 0;
                    const maxPoints = width * height;

                    while (count < maxPoints) {
                        points.push({ x: currX, y: currY });
                        visited[currY * width + currX] = 1;

                        let entryDir = -1;
                        for (let d = 0; d < 8; d++) {
                            if (currX + dx[d] === prevX && currY + dy[d] === prevY) {
                                entryDir = d;
                                break;
                            }
                        }

                        let foundNext = false;
                        let nextX = -1;
                        let nextY = -1;
                        
                        for (let i = 1; i <= 8; i++) {
                            const d = (entryDir + i) % 8;
                            const tx = currX + dx[d];
                            const ty = currY + dy[d];
                            if (isSolid(tx, ty)) {
                                nextX = tx;
                                nextY = ty;
                                foundNext = true;
                                break;
                            }
                        }

                        if (!foundNext || (nextX === startX && nextY === startY)) {
                            break;
                        }

                        prevX = currX;
                        prevY = currY;
                        currX = nextX;
                        currY = nextY;
                        count++;
                    }

                    if (points.length >= 3) {
                        let pathD = `M ${points[0].x} ${points[0].y}`;
                        for (let i = 1; i < points.length; i++) {
                            pathD += ` L ${points[i].x} ${points[i].y}`;
                        }
                        pathD += ' Z';
                        paths.push(pathD);
                    }
                }
            }
        }
    }
    return paths;
};

// Generates both print-ready sheet (artworks + marks + header) and cut-ready sheet (cut paths + marks + header)
const generateFinalSheetsForPrintAndCut = async (
    orderItem: any,
    orderId: string,
    customerName: string,
    shippingAddress: any,
): Promise<{ printDataUrl: string; cutDataUrl: string; sheetHeight: number }> => {
    const HEADER_HEIGHT_INCHES = 1;
    const MARGIN_INCHES = 1.0; // 1 inch margin on all sides to hold Graphtec registration marks
    const HEADER_TO_DESIGN_GAP_INCHES = 0.5;

    const isVinyl = isVinylItem(orderItem);

    let isSingleTransferLayout = orderItem.sheetSizeName === 'Single Design Transfer';
    const isAutoLayout = (orderItem.sheetSizeName || '').toLowerCase().includes('auto-layout');
    
    let designWidthInches = isSingleTransferLayout ? 22 : (orderItem.sheetWidth || 22);

    // Preload all unique images first to inspect actual aspect ratios
    const loadedImages: Record<string, HTMLImageElement> = {};
    const urlsToLoad = new Set<string>();
    
    const artworks = orderItem.artworks || [];
    if (isSingleTransferLayout) {
        artworks.forEach((art: any) => {
            const url = art.url || art.imageUrl || art.originalUrl || orderItem.originalSheetUrl || orderItem.image || '';
            if (url) urlsToLoad.add(url);
        });
    } else {
        const url = orderItem.originalSheetUrl || orderItem.image || '';
        if (url) urlsToLoad.add(url);
    }

    for (const url of Array.from(urlsToLoad)) {
        const img = new window.Image();
        img.crossOrigin = 'anonymous';
        await new Promise((resolve) => {
            img.onload = () => {
                loadedImages[url] = img;
                resolve(null);
            };
            img.onerror = (err) => {
                console.error('Failed to load image:', url, err);
                resolve(null);
            };
            img.src = url;
        });
    }

    let sheetContentHeightInches: number;
    const SPACING_INCHES = 0.5;

    // Define placement instances for auto-repeated single transfer layout
    interface Placement {
        url: string;
        x: number; // inches
        y: number; // inches
        w: number; // inches
        h: number; // inches
    }
    const rawPlacements: Placement[] = [];

    if (isSingleTransferLayout) {
        const instances: Array<{
            url: string;
            w: number;
            h: number;
        }> = [];

        if (artworks.length > 0) {
            artworks.forEach((art: any) => {
                const qty = parseInt(art.quantity) || 1;
                const w = parseFloat(art.width) || 3.5;
                const url = art.url || art.imageUrl || art.originalUrl || orderItem.originalSheetUrl || orderItem.image || '';
                
                // Get actual loaded image dimensions to calculate proportional height
                const loadedImg = loadedImages[url];
                let aspect = 1.0;
                if (loadedImg && loadedImg.naturalWidth) {
                    aspect = loadedImg.naturalHeight / loadedImg.naturalWidth;
                } else if (art.aspectRatio) {
                    aspect = art.aspectRatio;
                } else if (art.height && art.width) {
                    aspect = art.height / art.width;
                }
                
                const h = parseFloat((w * aspect).toFixed(2));

                for (let i = 0; i < qty; i++) {
                    instances.push({
                        url,
                        w,
                        h
                    });
                }
            });
        } else {
            const qty = parseInt(orderItem.quantity) || 1;
            const w = parseFloat(orderItem.sheetWidth) || 3.5;
            const h = parseFloat(orderItem.sheetHeight) || 3.5;
            const url = orderItem.originalSheetUrl || orderItem.image || '';
            for (let i = 0; i < qty; i++) {
                instances.push({
                    url,
                    w,
                    h
                });
            }
        }

        // Sort instances by height descending for optimal shelf packing
        instances.sort((a, b) => b.h - a.h);

        // Shelf packing algorithm
        interface Shelf {
            y: number;
            height: number;
            currentX: number;
        }
        const shelves: Shelf[] = [];

        instances.forEach(inst => {
            let placed = false;
            for (const shelf of shelves) {
                if (shelf.currentX + inst.w <= designWidthInches) {
                    rawPlacements.push({
                        url: inst.url,
                        x: shelf.currentX,
                        y: shelf.y,
                        w: inst.w,
                        h: inst.h
                    });
                    shelf.currentX += inst.w + SPACING_INCHES;
                    placed = true;
                    break;
                }
            }

            if (!placed) {
                const newY = shelves.length === 0 
                    ? SPACING_INCHES 
                    : shelves[shelves.length - 1].y + shelves[shelves.length - 1].height + SPACING_INCHES;
                
                shelves.push({
                    y: newY,
                    height: inst.h,
                    currentX: inst.w + SPACING_INCHES
                });

                rawPlacements.push({
                    url: inst.url,
                    x: 0,
                    y: newY,
                    w: inst.w,
                    h: inst.h
                });
            }
        });

        const totalContentHeightInches = shelves.length === 0 
            ? 0 
            : shelves[shelves.length - 1].y + shelves[shelves.length - 1].height + SPACING_INCHES;
        
        sheetContentHeightInches = totalContentHeightInches;
    } else {
        sheetContentHeightInches = orderItem.sheetHeight || 24;
    }

    // Now calculate dynamic DPI to stay within browser canvas limits (max height 30,000px)
    const finalCanvasHeightInches = sheetContentHeightInches + HEADER_HEIGHT_INCHES + (2 * MARGIN_INCHES) + HEADER_TO_DESIGN_GAP_INCHES;
    let BASE_DPI = 300;
    if (finalCanvasHeightInches * 300 > 30000) {
        BASE_DPI = Math.min(300, Math.max(72, Math.floor(30000 / finalCanvasHeightInches)));
        console.log(`Scaling down DPI to ${BASE_DPI} to keep canvas height within safe limits (${Math.floor(finalCanvasHeightInches * BASE_DPI)}px)`);
    }

    const HEADER_HEIGHT_PX = HEADER_HEIGHT_INCHES * BASE_DPI; // 300px at 300 DPI
    const MARGIN_PX = MARGIN_INCHES * BASE_DPI; // 300px at 300 DPI
    const HEADER_TO_DESIGN_GAP = HEADER_TO_DESIGN_GAP_INCHES * BASE_DPI; // 150px at 300 DPI
    const yOffset = HEADER_HEIGHT_PX + MARGIN_PX + HEADER_TO_DESIGN_GAP;

    // Convert placements from inches to pixel positions
    interface PixelPlacement {
        url: string;
        x: number;
        y: number;
        wPx: number;
        hPx: number;
    }
    const placements: PixelPlacement[] = rawPlacements.map(p => ({
        url: p.url,
        x: p.x * BASE_DPI,
        y: p.y * BASE_DPI,
        wPx: p.w * BASE_DPI,
        hPx: p.h * BASE_DPI
    }));

    const finalCanvasWidth = (designWidthInches + (2 * MARGIN_INCHES)) * BASE_DPI;
    const finalCanvasHeight = (sheetContentHeightInches * BASE_DPI) + HEADER_HEIGHT_PX + (2 * MARGIN_PX) + HEADER_TO_DESIGN_GAP;

    // 1. Create PRINT Canvas
    const printCanvas = document.createElement('canvas');
    printCanvas.width = finalCanvasWidth;
    printCanvas.height = finalCanvasHeight;
    const printCtx = printCanvas.getContext('2d');
    if (!printCtx) throw new Error('No print context');

    // 2. Create CUT Canvas
    const cutCanvas = document.createElement('canvas');
    cutCanvas.width = finalCanvasWidth;
    cutCanvas.height = finalCanvasHeight;
    const cutCtx = cutCanvas.getContext('2d');
    if (!cutCtx) throw new Error('No cut context');

    cutCtx.fillStyle = 'white';
    cutCtx.fillRect(0, 0, finalCanvasWidth, finalCanvasHeight);

    const designCanvas = document.createElement('canvas');
    designCanvas.width = designWidthInches * BASE_DPI;
    designCanvas.height = sheetContentHeightInches * BASE_DPI;
    const designCtx = designCanvas.getContext('2d');
    if (!designCtx) throw new Error('No design context');

    // --- Draw Main Content ---
    if (isSingleTransferLayout) {
        placements.forEach(p => {
            const printX = p.x + MARGIN_PX;
            const printY = p.y + yOffset;
            const designX = p.x;
            const designY = p.y;

            const img = loadedImages[p.url];
            if (img) {
                printCtx.drawImage(img, printX, printY, p.wPx, p.hPx);
                designCtx.drawImage(img, designX, designY, p.wPx, p.hPx);
            }

            if (!isVinyl) {
                // Draw black outline around each item for DTF plotter cutter
                cutCtx.strokeStyle = 'black';
                cutCtx.lineWidth = 6;
                const paddingPx = 0.08 * BASE_DPI; // 24px (~2mm) margin
                cutCtx.strokeRect(
                    printX - paddingPx,
                    printY - paddingPx,
                    p.wPx + (2 * paddingPx),
                    p.hPx + (2 * paddingPx)
                );
            }
        });
    } else {
        // --- Standard Gang Sheet ---
        const artworks = orderItem.artworks || [];
        const sourceUrl = orderItem.originalSheetUrl || orderItem.image || '';
        const sourceImage = loadedImages[sourceUrl];

        if (sourceImage) {
            if (isAutoLayout && artworks.length > 0) {
                artworks.forEach((art: any) => {
                    const artX = art.x * BASE_DPI;
                    const artY = art.y * BASE_DPI;
                    const artW = art.width * BASE_DPI;
                    const artH = art.height * BASE_DPI;

                    printCtx.drawImage(sourceImage, artX + MARGIN_PX, artY + yOffset, artW, artH);
                    designCtx.drawImage(sourceImage, artX, artY, artW, artH);
                });
            } else {
                printCtx.drawImage(sourceImage, MARGIN_PX, yOffset, designWidthInches * BASE_DPI, (orderItem.sheetHeight || 24) * BASE_DPI);
                designCtx.drawImage(sourceImage, 0, 0, designWidthInches * BASE_DPI, (orderItem.sheetHeight || 24) * BASE_DPI);
            }
        }

        if (!isVinyl && sourceImage) {
            cutCtx.strokeStyle = 'black';
            cutCtx.lineWidth = 6;

            if (artworks.length > 0 && isAutoLayout) {
                artworks.forEach((art: any) => {
                    const centerX = (art.x + art.width / 2) * BASE_DPI + MARGIN_PX;
                    const centerY = (art.y + art.height / 2) * BASE_DPI + yOffset;

                    const targetPadding = 0.08 * BASE_DPI;
                    const safePadding = calculateSafePadding(art, artworks, targetPadding);

                    cutCtx.save();
                    cutCtx.translate(centerX, centerY);
                    cutCtx.rotate((art.rotation || 0) * Math.PI / 180);

                    const wPx = art.width * BASE_DPI + (2 * safePadding);
                    const hPx = art.height * BASE_DPI + (2 * safePadding);
                    cutCtx.strokeRect(-wPx / 2, -hPx / 2, wPx, hPx);

                    cutCtx.restore();
                });
            } else {
                const contentMargin = 0.25 * BASE_DPI;
                cutCtx.strokeRect(
                    MARGIN_PX + contentMargin,
                    yOffset + contentMargin,
                    (designWidthInches * BASE_DPI) - (contentMargin * 2),
                    ((orderItem.sheetHeight || 24) * BASE_DPI) - (contentMargin * 2)
                );
            }
        }
    }

    if (isVinyl) {
        designCtx.globalCompositeOperation = 'source-in';
        designCtx.fillStyle = 'black';
        designCtx.fillRect(0, 0, designCanvas.width, designCanvas.height);
        cutCtx.drawImage(designCanvas, MARGIN_PX, yOffset);
    }

    // --- Draw Headers and QR Codes ---
    const origin = window.location.origin;
    const qrUrl = `${origin}/admin?orderId=${orderId}`;
    const qrCodeDataUrl = await QRCodeLib.toDataURL(qrUrl, { width: HEADER_HEIGHT_PX - 20, margin: 1 });
    
    const qrImg = new window.Image();
    await new Promise(resolve => { qrImg.onload = resolve; qrImg.src = qrCodeDataUrl; });

    const FONT_SIZE_LARGE = BASE_DPI / 4;
    const FONT_SIZE_MEDIUM = BASE_DPI / 6;
    const FONT_SIZE_SMALL = BASE_DPI / 8;

    const drawHeader = (ctx: CanvasRenderingContext2D, isCut: boolean) => {
        const headerY = 1.0 * BASE_DPI;
        ctx.fillStyle = 'white';
        ctx.fillRect(0, headerY, finalCanvasWidth, HEADER_HEIGHT_PX);
        
        const contentStartX = (0.5 * BASE_DPI) + (0.5 * BASE_DPI) + 50; 
        
        if (!isCut) {
            ctx.drawImage(qrImg, contentStartX, headerY + 10);
        }

        ctx.fillStyle = 'black';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        const textX = isCut ? contentStartX : contentStartX + (HEADER_HEIGHT_PX - 20) + 20;

        let textY = headerY + 15;
        ctx.font = `bold ${FONT_SIZE_LARGE}px Arial`;
        ctx.fillText(`Order: ${orderId}`, textX, textY);
        textY += FONT_SIZE_LARGE + 15;
        
        ctx.font = `bold ${FONT_SIZE_MEDIUM}px Arial`;
        ctx.fillText(`To: ${customerName}`, textX, textY);
        textY += FONT_SIZE_MEDIUM + 10;
        
        ctx.font = `${FONT_SIZE_SMALL}px Arial`;
        const shipToName = shippingAddress ? `${shippingAddress.street || ''}, ${shippingAddress.city || ''}, ${shippingAddress.state || ''} ${shippingAddress.zip || ''}` : 'Pickup';
        ctx.fillText(`Ship To: ${shipToName}`, textX, textY);
        textY += FONT_SIZE_SMALL + 15;
        
        const sheetDescription = isSingleTransferLayout
            ? `Multi-logo Auto-repeat Sheet`
            : `${orderItem.sheetWidth || 22}" x ${orderItem.sheetHeight || 24}" Sheet`;
        ctx.fillText(`Sheet: ${sheetDescription}`, textX, textY);
    };

    drawHeader(printCtx, false);

    drawGraphtecRegistrationMarks(printCtx, finalCanvasWidth, finalCanvasHeight, 0.5 * BASE_DPI, true);
    drawGraphtecRegistrationMarks(cutCtx, finalCanvasWidth, finalCanvasHeight, 0.5 * BASE_DPI, false);

    // --- Generate SVG Cut File ---
    let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${finalCanvasWidth}" height="${finalCanvasHeight}" viewBox="0 0 ${finalCanvasWidth} ${finalCanvasHeight}">\n`;
    svgContent += `  <!-- Background -->\n`;
    svgContent += `  <rect width="${finalCanvasWidth}" height="${finalCanvasHeight}" fill="white" />\n`;

    const margin = 0.5 * BASE_DPI;
    const markLength = 0.5 * BASE_DPI;
    const thickness = 0.04 * BASE_DPI;
    const xLeft = margin;
    const xRight = finalCanvasWidth - margin;
    const yTop = 0.5 * BASE_DPI;
    const yBottom = finalCanvasHeight - margin;

    svgContent += `  <!-- Graphtec Registration Marks -->\n`;
    svgContent += `  <rect x="${xLeft}" y="${yTop}" width="${markLength}" height="${thickness}" fill="black" />\n`;
    svgContent += `  <rect x="${xLeft}" y="${yTop}" width="${thickness}" height="${markLength}" fill="black" />\n`;
    svgContent += `  <rect x="${xRight - markLength}" y="${yTop}" width="${markLength}" height="${thickness}" fill="black" />\n`;
    svgContent += `  <rect x="${xRight - thickness}" y="${yTop}" width="${thickness}" height="${markLength}" fill="black" />\n`;
    svgContent += `  <rect x="${xLeft}" y="${yBottom - thickness}" width="${markLength}" height="${thickness}" fill="black" />\n`;
    svgContent += `  <rect x="${xLeft}" y="${yBottom - markLength}" width="${thickness}" height="${markLength}" fill="black" />\n`;
    svgContent += `  <rect x="${xRight - markLength}" y="${yBottom - thickness}" width="${markLength}" height="${thickness}" fill="black" />\n`;
    svgContent += `  <rect x="${xRight - thickness}" y="${yBottom - markLength}" width="${thickness}" height="${markLength}" fill="black" />\n`;

    svgContent += `  <!-- Cut Paths -->\n`;
    if (!isVinyl) {
        const uniqueContourPaths: Record<string, { paths: string[]; width: number; height: number }> = {};
        
        for (const url of Array.from(urlsToLoad)) {
            const img = loadedImages[url];
            if (!img) continue;

            let traceWidth = 400;
            let traceHeight = 400;
            const imgW = img.naturalWidth || img.width || 400;
            const imgH = img.naturalHeight || img.height || 400;
            
            const maxDim = 400;
            if (imgW > imgH) {
                traceWidth = maxDim;
                traceHeight = Math.round(maxDim * imgH / imgW);
            } else {
                traceHeight = maxDim;
                traceWidth = Math.round(maxDim * imgW / imgH);
            }

            const traceCanvas = document.createElement('canvas');
            traceCanvas.width = traceWidth;
            traceCanvas.height = traceHeight;
            const traceCtx = traceCanvas.getContext('2d');
            let contourPaths: string[] = [];
            if (traceCtx) {
                traceCtx.drawImage(img, 0, 0, traceWidth, traceHeight);
                contourPaths = findContourPaths(traceCanvas);
            }
            uniqueContourPaths[url] = { paths: contourPaths, width: traceWidth, height: traceHeight };
        }

        if (isSingleTransferLayout) {
            placements.forEach(p => {
                const artW = p.wPx;
                const artH = p.hPx;
                const centerX = p.x + MARGIN_PX + artW / 2;
                const centerY = p.y + yOffset + artH / 2;

                const trace = uniqueContourPaths[p.url];
                if (trace && trace.paths.length > 0) {
                    const scaleX = artW / trace.width;
                    const scaleY = artH / trace.height;

                    svgContent += `  <g transform="translate(${centerX}, ${centerY}) scale(${scaleX}, ${scaleY}) translate(${-trace.width / 2}, ${-trace.height / 2})">\n`;
                    trace.paths.forEach(d => {
                        svgContent += `    <path d="${d}" fill="black" stroke="black" stroke-width="${6 / Math.max(scaleX, scaleY)}" stroke-linejoin="round" />\n`;
                    });
                    svgContent += `  </g>\n`;
                }
            });
        } else {
            // --- Standard Gang Sheet ---
            const artworks = orderItem.artworks || [];
            const sourceUrl = orderItem.originalSheetUrl || orderItem.image || '';
            const trace = uniqueContourPaths[sourceUrl];

            if (artworks.length > 0 && isAutoLayout && trace && trace.paths.length > 0) {
                artworks.forEach((art: any) => {
                    const centerX = (art.x + art.width / 2) * BASE_DPI + MARGIN_PX;
                    const centerY = (art.y + art.height / 2) * BASE_DPI + yOffset;
                    const artW = art.width * BASE_DPI;
                    const artH = art.height * BASE_DPI;

                    const scaleX = artW / trace.width;
                    const scaleY = artH / trace.height;
                    const rotation = art.rotation || 0;

                    svgContent += `  <g transform="translate(${centerX}, ${centerY}) rotate(${rotation}) scale(${scaleX}, ${scaleY}) translate(${-trace.width / 2}, ${-trace.height / 2})">\n`;
                    trace.paths.forEach(d => {
                        svgContent += `    <path d="${d}" fill="black" stroke="black" stroke-width="${6 / Math.max(scaleX, scaleY)}" stroke-linejoin="round" />\n`;
                    });
                    svgContent += `  </g>\n`;
                });
            } else {
                const contentMargin = 0.25 * BASE_DPI;
                const rectX = MARGIN_PX + contentMargin;
                const rectY = yOffset + contentMargin;
                const rectW = (designWidthInches * BASE_DPI) - (contentMargin * 2);
                const rectH = ((orderItem.sheetHeight || 24) * BASE_DPI) - (contentMargin * 2);
                svgContent += `  <rect x="${rectX}" y="${rectY}" width="${rectW}" height="${rectH}" fill="none" stroke="black" stroke-width="6" />\n`;
            }
        }
    }

    svgContent += `</svg>`;
    const cutDataUrl = 'data:image/svg+xml;base64,' + window.btoa(unescape(encodeURIComponent(svgContent)));

    return {
        printDataUrl: printCanvas.toDataURL('image/png'),
        cutDataUrl: cutDataUrl,
        sheetHeight: sheetContentHeightInches
    };
};


export function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, userData, hasPermission } = useAuth();
  const { orders, loading } = useOrders();

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editForm, setEditForm] = useState({ 
    title: '', date: '', statusIndex: 0,
    trackingCarrier: '', trackingNumber: '',
    fulfillmentType: '',
    shippingAddress: { name: '', company: '', street1: '', street2: '', city: '', state: '', zip: '', country: 'US' },
    thirdPartyBilling: { account: '', zip: '' }
  });

  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [activityLimit, setActivityLimit] = useState(3);
  const [activityFilter, setActivityFilter] = useState<'all' | 'performance' | 'metrics'>('all');
  const [performanceUserFilter, setPerformanceUserFilter] = useState<string>('All');
  const [metricsTimeFilter, setMetricsTimeFilter] = useState<string>('Today');
  const [editingTargetId, setEditingTargetId] = useState<string | null>(null);
  const [targetInput, setTargetInput] = useState<string>('');
  const [editingTargetDateId, setEditingTargetDateId] = useState<string | null>(null);
  const [targetDateInput, setTargetDateInput] = useState<string>('');

  const handleSaveTarget = async (orderId: string) => {
    const val = parseFloat(targetInput);
    if (!isNaN(val) && val >= 0) {
       await updateDoc(doc(db, 'orders', orderId), { targetAvgMinsPerGarment: val });
    }
    setEditingTargetId(null);
  };

  const handleSaveTargetDate = async (orderId: string) => {
     if (targetDateInput) {
       await updateDoc(doc(db, 'orders', orderId), { targetCompletionDate: targetDateInput });
     }
     setEditingTargetDateId(null);
  };

  const handleReceiptFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    setIsUploadingReceipt(true);
    try {
      const storageRef = ref(storage, `orders/${id}/receipts/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setReceiptUrl(url);
      setReceiptName(file.name);
    } catch (err) {
      console.error('Failed to upload receipt', err);
      alert('Failed to upload receipt file. Please try again.');
    } finally {
      setIsUploadingReceipt(false);
    }
  };

  const getExpenseAllocation = (costObj: any, garmentId: string) => {
     const connections = costObj.itemConnections || (costObj.itemId ? { [costObj.itemId]: costObj.linkedSizes || [] } : {});
     if (!connections[garmentId]) return 0;
     
     // Calculate quantity for each connection
     let targetQty = 0;
     let totalQty = 0;
     
     Object.entries(connections).forEach(([itemId, sizes]: [string, any]) => {
        const gItem = order?.items?.find((i: any) => i.id === itemId);
        if (!gItem) return;
        
        const sizesArray = sizes && sizes.length > 0 ? sizes : Object.keys(gItem.sizes || {}).filter(s => (gItem.sizes[s] || 0) > 0);
        const gQty = sizesArray.reduce((sum: number, sz: string) => sum + (parseInt(gItem.sizes[sz]) || 0), 0);
        
        if (itemId === garmentId) {
           targetQty = gQty;
        }
        totalQty += gQty;
     });
     
     if (totalQty <= 0) return 0;
     return costObj.amount * (targetQty / totalQty);
  };

  const handleAddCostSubmit = async () => {
    if (!id || !order || !costDescription.trim() || !costAmount || !costCardUsed.trim()) return;
    
    const cardName = costCardUsed.trim();
    const amountVal = parseFloat(costAmount) || 0;
    
    const newCost = {
      id: `cost-${Date.now()}`,
      description: costDescription.trim(),
      amount: amountVal,
      cardUsed: cardName,
      supplierOrderNumber: supplierOrderNumber.trim() || null,
      receiptUrl: receiptUrl || null,
      receiptName: receiptName || null,
      createdAt: new Date().toISOString(),
      itemConnections: selectedCostItems
    };
    
    const currentCosts = order.costs || [];
    const updatedCosts = [...currentCosts, newCost];
    
    let matchedItemStyle = '';
    const connectedItemIds = Object.keys(selectedCostItems);
    if (connectedItemIds.length > 0) {
      const names = connectedItemIds.map(itemId => {
         const matched = order.items?.find((i: any) => i.id === itemId);
         return matched ? matched.style : '';
      }).filter(Boolean);
      if (names.length > 0) {
         matchedItemStyle = ` (Connected to ${names.join(', ')})`;
      }
    }
    
    const activity = {
      id: `act-${Date.now()}`,
      type: 'system',
      message: `Recorded cost: ${newCost.description} ($${amountVal.toFixed(2)}) on card ${cardName}${newCost.supplierOrderNumber ? ` (Supplier Order #${newCost.supplierOrderNumber})` : ''}${matchedItemStyle}`,
      user: userData?.name || user?.displayName || user?.email?.split('@')[0] || 'Team Member',
      timestamp: new Date().toISOString()
    };
    
    try {
      await setDoc(doc(db, 'orders', id), { 
        costs: updatedCosts,
        activities: [activity, ...(order.activities || [])]
      }, { merge: true });
      
      // Reset form
      setCostDescription('');
      setCostAmount('');
      setCostCardUsed('');
      setSupplierOrderNumber('');
      setReceiptUrl('');
      setReceiptName('');
      setSelectedCostItems({});
    } catch (err) {
      console.error("Error adding cost:", err);
      alert("Failed to save expense. Please try again.");
    }
  };

  const handleDeleteCost = async (costId: string) => {
    if (!id || !order) return;
    if (!window.confirm("Are you sure you want to delete this expense?")) return;
    
    const currentCosts = order.costs || [];
    const costToDelete = currentCosts.find((c: any) => c.id === costId);
    const updatedCosts = currentCosts.filter((c: any) => c.id !== costId);
    
    let dbUpdate: any = { costs: updatedCosts };
    if (costToDelete) {
      dbUpdate.activities = [{
        id: `act-${Date.now()}`,
        type: 'system',
        message: `Deleted cost: ${costToDelete.description} ($${parseFloat(costToDelete.amount).toFixed(2)})`,
        user: userData?.name || user?.displayName || user?.email?.split('@')[0] || 'Team Member',
        timestamp: new Date().toISOString()
      }, ...(order.activities || [])];
    }
    
    try {
      await setDoc(doc(db, 'orders', id), dbUpdate, { merge: true });
    } catch (err) {
      console.error("Error deleting cost:", err);
      alert("Failed to delete expense. Please try again.");
    }
  };

  const [timelineMembers, setTimelineMembers] = useState<any[]>([]);

  useEffect(() => {
    getDocs(collection(db, 'users')).then(snap => {
      setAllUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }).catch(e => console.error(e));
  }, []);

  useEffect(() => {
     if (!id || allUsers.length === 0) return;
     const qTasks = query(collection(db, 'timelineTasks'), where('orderId', '==', id));
     const unsub = onSnapshot(qTasks, (snap) => {
        const memberIds = new Set<string>();
        snap.forEach(doc => memberIds.add(doc.data().memberId));
        
        const mapped = Array.from(memberIds).map(mId => {
           const u = allUsers.find(user => user.id === mId) || allUsers.find(user => user.uid === mId);
           if (!u) return null;
           const name = u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Unknown Staff';
           const initials = name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase();
           return { id: mId, name, initials, role: u.role || 'Staff' };
        }).filter(Boolean);
        setTimelineMembers(mapped);
     });
     return unsub;
  }, [id, allUsers]);

  const handleAddTeamMember = async (userObj: any) => {
    if (!id || !order) return;
    try {
      const newMember = {
        id: userObj.id || userObj.uid || Date.now().toString(),
        name: userObj.name || (userObj.email ? userObj.email.split('@')[0] : 'Unknown'),
        role: userObj.role || 'Staff',
        initials: (userObj.name || userObj.email || 'U').substring(0,2).toUpperCase()
      };
      const updatedTeam = [...(order.team || []), newMember];
      await updateDoc(doc(db, 'orders', id), { team: updatedTeam });
      setIsTeamModalOpen(false);
    } catch(err) {
      console.error(err);
    }
  };

  const handleRemoveTeamMember = async (memberId: string) => {
    if (!id || !order) return;
    try {
      const updatedTeam = (order.team || []).filter((m: any) => m.id !== memberId);
      await updateDoc(doc(db, 'orders', id), { team: updatedTeam });
    } catch(err) {
      console.error(err);
    }
  };

  const [editItemObj, setEditItemObj] = useState<any>(null);
  const [quickShipItem, setQuickShipItem] = useState<any>(null);
  const [quickShipSizes, setQuickShipSizes] = useState<Record<string, number>>({});
  const [expandedImage, setExpandedImage] = useState<{src: string, alt: string} | null>(null);
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [expandedSpecs, setExpandedSpecs] = useState<Record<string, boolean>>({});
  const [isItemSaving, setIsItemSaving] = useState(false);
  const [isUploadingMain, setIsUploadingMain] = useState(false);
  const [isUploadingRef, setIsUploadingRef] = useState(false);
  const [isUploadingGang, setIsUploadingGang] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [generatingItemId, setGeneratingItemId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<Record<string, 'print' | 'cut'>>({});
  const [trackingBoxId, setTrackingBoxId] = useState<string | null>(null);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null);
  const [draggableItemId, setDraggableItemId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, item: any, size: string, qty: number } | null>(null);
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);

  const getActiveSidesCountForOrderItem = (item: any) => {
    if (!item.customized) return 1;
    let count = 0;
    if (item.logoUrl) count++;
    if (item.logoUrlBack) count++;
    if (item.logoUrlLeftSleeve) count++;
    if (item.logoUrlRightSleeve) count++;
    return count || 1;
  };

  const [isPalletOptimizerOpen, setIsPalletOptimizerOpen] = useState(false);
  const [isDeckModalOpen, setIsDeckModalOpen] = useState(false);
  const [customerDecks, setCustomerDecks] = useState<any[]>([]);
  const [isLoadingDecks, setIsLoadingDecks] = useState(false);

  const handleFetchDecks = async () => {
    if (!liveCustomer?.catalogLinkIds || liveCustomer.catalogLinkIds.length === 0) {
       setCustomerDecks([]);
       return;
    }
    setIsLoadingDecks(true);
    try {
      const fetchedArrays = await Promise.all(
        liveCustomer.catalogLinkIds.map(async (deckId: string) => {
          try {
            const response = await fetch(`https://wovn-garment-catalog.vercel.app/api/decks?deckId=${deckId}`);
            if (response.ok) return await response.json();
          } catch (e) {
             console.error(e);
          }
          return null;
        })
      );
      const validArrays = fetchedArrays.filter(d => d !== null && Array.isArray(d));
      setCustomerDecks(validArrays.flat());
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingDecks(false);
    }
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedItemId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (id !== dragOverItemId) {
      setDragOverItemId(id);
    }
  };

  const handleDragEnd = () => {
    setDraggedItemId(null);
    setDragOverItemId(null);
  };

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedItemId || draggedItemId === targetId) return;

    const newItems = [...(order.items || [])];
    const draggedIdx = newItems.findIndex((i: any) => i.id === draggedItemId);
    const targetIdx = newItems.findIndex((i: any) => i.id === targetId);
    
    if (draggedIdx !== -1 && targetIdx !== -1) {
      const [movedItem] = newItems.splice(draggedIdx, 1);
      newItems.splice(targetIdx, 0, movedItem);
      
      try {
        await updateDoc(doc(db, 'orders', order.id), { items: newItems });
      } catch (err) {
        console.error("Error reordering items:", err);
      }
    }
    handleDragEnd();
  };


  const [noteText, setNoteText] = useState('');
  
  // Costs & Receipts State
  const [costDescription, setCostDescription] = useState('');
  const [costAmount, setCostAmount] = useState('');
  const [costCardUsed, setCostCardUsed] = useState('');
  const [supplierOrderNumber, setSupplierOrderNumber] = useState('');
  const [receiptUrl, setReceiptUrl] = useState('');
  const [receiptName, setReceiptName] = useState('');
  const [isUploadingReceipt, setIsUploadingReceipt] = useState(false);
  const [selectedCostItems, setSelectedCostItems] = useState<Record<string, string[]>>({});
  
  // Shopify Product Search
  const [shopifySearchQuery, setShopifySearchQuery] = useState('');
  const [shopifyProducts, setShopifyProducts] = useState<any[]>([]);
  const [isSearchingShopify, setIsSearchingShopify] = useState(false);
  const [isShopifySearchOpen, setIsShopifySearchOpen] = useState(false);

  const order = orders.find(o => o.id === id); // Need order reference earlier
  
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState('');
  const [customizingItem, setCustomizingItem] = useState<any | null>(null);

  const handleSaveTitle = async () => {
    if (!id || !tempTitle.trim() || !order) return;
    try {
      const activity = {
        id: `act-${Date.now()}`,
        type: 'system',
        message: `Order title updated to "${tempTitle.trim()}".`,
        user: user?.email || 'System',
        timestamp: new Date().toISOString()
      };
      await setDoc(doc(db, 'orders', id), {
        title: tempTitle.trim(),
        activities: [activity, ...(order.activities || [])]
      }, { merge: true });
      setIsEditingTitle(false);
    } catch (err) {
      console.error("Failed to update order title", err);
      alert("Failed to update order title. Please try again.");
    }
  };

  const [liveCustomer, setLiveCustomer] = useState<any>(null);
  const [fetchingCustomer, setFetchingCustomer] = useState(true);

  useEffect(() => {
    const fetchLiveCustomer = async () => {
      if (!order || !order.customerId) {
        setFetchingCustomer(false);
        return;
      }
      try {
        const d = await getDoc(doc(db, 'customers', order.customerId));
        if (d.exists()) {
           setLiveCustomer(d.data());
        }
      } catch (err) {
        console.error("Failed to fetch live customer data", err);
      } finally {
        setFetchingCustomer(false);
      }
    };
    fetchLiveCustomer();
  }, [order?.customerId]);

  const handleSearchShopify = async (e: React.FormEvent) => {
     e.preventDefault();
     if (!shopifySearchQuery.trim()) return;
     setIsSearchingShopify(true);
     setShopifyProducts([]);
     try {
        const res = await fetch(`/api/shopify/search-products?q=${encodeURIComponent(shopifySearchQuery.trim())}`);
        const data = await res.json();
        setShopifyProducts(data.products || []);
     } catch (err) {
        console.error('Failed to search products', err);
     } finally {
        setIsSearchingShopify(false);
     }
  };

  const handleSelectShopifyProduct = (product: any, variant: any) => {
     let newSizes = { ...editItemObj?.sizes };
     
     const sizeOption = product.options?.find((o: any) => o.name.toLowerCase().includes('size'));
     if (sizeOption) {
        sizeOption.values.forEach((v: string) => {
           if (newSizes[v] === undefined) newSizes[v] = 0;
        });
     }

     const isMale = variant.title.toLowerCase().includes('men') || product.title.toLowerCase().includes('men');
     const isFemale = variant.title.toLowerCase().includes('women') || product.title.toLowerCase().includes('women');
     const gender = isFemale ? 'Female' : isMale ? 'Male' : 'Unisex';
     const color = variant.selectedOptions?.find((o:any) => o.name.toLowerCase().includes('color'))?.value || variant.title;

     // Build Inventory Map & SKUs Map
     let inventoryMap: Record<string, number> = {};
     let skusMap: Record<string, string> = {};
     product.variants?.forEach((v: any) => {
        const vColor = v.selectedOptions?.find((o:any) => o.name.toLowerCase().includes('color'))?.value || v.title;
        if (vColor === color || (!product.options.find((o:any) => o.name.toLowerCase().includes('color')))) {
            const vSize = v.selectedOptions?.find((o:any) => o.name.toLowerCase().includes('size'))?.value || v.title;
            if (vSize) {
               inventoryMap[vSize] = v.inventoryQuantity || 0;
               if (v.sku) {
                  skusMap[vSize] = v.sku;
               }
            }
        }
     });

     setEditItemObj({
        ...editItemObj,
        style: product.title,
        gender: gender,
        itemNum: variant.sku || '',
        color: color !== 'Default Title' ? color : '',
        price: variant.price || '0.00',
        image: variant.image?.url || product.featuredImage?.url || editItemObj.image,
        sizes: Object.keys(newSizes).length > 0 ? newSizes : editItemObj.sizes,
        shopifyInventoryMap: inventoryMap,
        skus: skusMap
     });
     
     setIsShopifySearchOpen(false);
     setShopifyProducts([]);
     setShopifySearchQuery('');
  };

  const currentCustomer = liveCustomer || { company: 'Unknown Customer' };

  const handleStatusChange = async (newIndex: number) => {
    if (!id || !order) return;
    try {
      const formIsKitting = order.fulfillmentType === 'Kitting' || (!order.fulfillmentType && currentCustomer.fulfillmentType === 'Kitting');
      const newStatusLabel = (() => {
         const labels = ['Request Created', 'Under Review', 'Quote Prepared', 'Awaiting Payment', 'Sourcing', 'Ordered', 'In Production', formIsKitting ? 'Inventory' : 'Shipped', formIsKitting ? 'Live' : 'Received'];
         return labels[newIndex] || 'Unknown';
      })();

      const activity = {
        id: `act-${Date.now()}`,
        type: 'status_change',
        message: `Status updated to ${newStatusLabel}`,
        user: user?.email || 'Team Member',
        timestamp: new Date().toISOString()
      };

      await setDoc(doc(db, 'orders', id), {
        statusIndex: newIndex,
        activities: [activity, ...(order.activities || [])]
      }, { merge: true });

      // Trigger SMS notification via QUO System
      sendOrderStatusSMS(id, newIndex);
    } catch(err) {
      console.error(err);
    }
  };

  const handleAddNote = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!id || !order || !noteText.trim()) return;
    try {
      const activity = {
        id: `act-${Date.now()}`,
        type: 'note',
        message: noteText.trim(),
        user: user?.email || 'Team Member',
        timestamp: new Date().toISOString()
      };

      await setDoc(doc(db, 'orders', id), {
        activities: [activity, ...(order.activities || [])]
      }, { merge: true });
      setNoteText('');
    } catch(err) {
      console.error(err);
    }
  };

  const handleStartQuickShip = (item: any) => {
     if (!id || !order) return;
     const remainingSizes = { ...item.sizes };
     
     order.boxes?.forEach((box: any) => {
        const boxItem = box.items?.find((bi: any) => String(bi.id) === String(item.id));
        if (boxItem && boxItem.sizes) {
           Object.entries(boxItem.sizes).forEach(([s, q]) => {
              remainingSizes[s] = Math.max(0, (remainingSizes[s] || 0) - (q as number));
           });
        }
     });

     const hasRemaining = Object.values(remainingSizes).some((q: any) => q > 0);
     if (!hasRemaining) {
         alert('All quantities for this item have already been packed into shipments.');
         return;
     }

     const initialSizes: Record<string, number> = {};
     Object.keys(remainingSizes).forEach(k => { initialSizes[k] = 0; });
     
     setQuickShipItem({ ...item, remainingSizes });
     setQuickShipSizes(initialSizes);
  };

  const handleSaveQuickShip = async () => {
     if (!quickShipItem || !id || !order) return;
     
     const totalQty = Object.values(quickShipSizes).reduce((a, b) => a + b, 0);
     if (totalQty === 0) {
        alert("Please select at least one item to ship.");
        return;
     }

     const orderDoc = await getDoc(doc(db, 'orders', id));
     const liveBoxes = orderDoc.data()?.boxes || [];

     let nextName = `Box ${(liveBoxes.length || 0) + 1}`;
     const boxIds = liveBoxes.map((b:any) => parseInt(b.name.replace('Box ', ''))).filter((n:number)=>!isNaN(n)) || [];
     if(boxIds.length > 0) nextName = `Box ${Math.max(...boxIds) + 1}`;

     const packedSizes: Record<string, number> = {};
     Object.entries(quickShipSizes).forEach(([s, q]) => {
        if (q > 0) packedSizes[s] = q;
     });

     const newBox = {
        id: `box-${Date.now()}`,
        name: nextName,
        createdAt: new Date().toISOString(),
        items: [{
           id: quickShipItem.id,
           style: quickShipItem.style || 'Custom Garment',
           color: quickShipItem.color || '',
           gender: quickShipItem.gender || '',
           image: quickShipItem.image || '',
           itemNum: quickShipItem.itemNum || '',
           sizes: packedSizes,
           qty: totalQty
        }]
     };
     
     const activity = {
       id: `act-${Date.now()}`,
       type: 'system',
       message: `Created ${nextName} containing ${totalQty} items`,
       user: userData?.name || user?.displayName || user?.email?.split('@')[0] || 'Team Member',
       timestamp: new Date().toISOString()
     };

     const updatedBoxes = [...liveBoxes, newBox];
     await setDoc(doc(db, 'orders', id), { 
       boxes: updatedBoxes,
       activities: [activity, ...(orderDoc.data()?.activities || [])]
     }, { merge: true });
     
     setExpandedItems(prev => ({ ...prev, [quickShipItem.id]: true }));
     
     setQuickShipItem(null);
     setQuickShipSizes({});
  };

   const handleSizeClick = async (item: any, size: string, qty: number) => {
      if (!id || !order) return;
      const currentCompleted = item.completedSizes || [];
      const inProgress = item.inProgressSizes || {};
      const receivedSizes = item.receivedSizes || [];
      const returnedSizes = item.returnedSizes || [];
      
      if (returnedSizes.includes(size)) {
          alert(`Size ${size} of ${item.style} is marked for return. Please right-click to unmark it first.`);
          return;
      }
      
      if (currentCompleted.includes(size)) {
          return; // Do nothing on left click if already complete. Use right-click menu to uncomplete.
      }
      
      if (inProgress[size]) {
          const startTime = new Date(inProgress[size].startTime).getTime();
          const runningDuration = inProgress[size].paused ? 0 : Date.now() - startTime;
          const totalElapsedMs = (inProgress[size].elapsedMs || 0) + runningDuration;
          const durationMs = totalElapsedMs > 0 ? totalElapsedMs : (Date.now() - startTime);
          
          const avgItemTimeMs = qty > 0 ? durationMs / qty : 0;
          const itemsPerHour = durationMs > 0 ? (qty / (durationMs / 3600000)) : 0;
          
          const newCompleted = [...currentCompleted, size];
          const newInProgress = { ...inProgress };
          delete newInProgress[size];
          
          const newStats = { ...(item.sizeStats || {}) };
          newStats[size] = {
              durationMs,
              avgItemTimeMs,
              itemsPerHour: Math.round(itemsPerHour),
              user: user?.email || 'Team Member'
          };
          
          const updatedItems = order.items.map((i: any) => 
              i.id === item.id ? { ...i, completedSizes: newCompleted, inProgressSizes: newInProgress, sizeStats: newStats } : i
          );
          
          const formatedTime = durationMs > 60000 ? `${Math.round(durationMs/60000)}m` : `${Math.round(durationMs/1000)}s`;
          const activity = {
            id: `act-${Date.now()}`,
            type: 'system',
            message: `Completed ${qty}x ${size} for ${item.style} in ${formatedTime}. Rate: ${Math.round(itemsPerHour)}/hr`,
            user: userData?.name || user?.displayName || user?.email?.split('@')[0] || 'Team Member',
            timestamp: new Date().toISOString()
          };

          await setDoc(doc(db, 'orders', id), { 
            items: updatedItems,
            activities: [activity, ...(order.activities || [])]
          }, { merge: true });
      } else if (!receivedSizes.includes(size)) {
          // Mark as received
          const newReceived = [...receivedSizes, size];
          const updatedItems = order.items.map((i: any) => 
              i.id === item.id ? { ...i, receivedSizes: newReceived } : i
          );
          
          const activity = {
            id: `act-${Date.now()}`,
            type: 'system',
            message: `Marked size ${size} for ${item.style} as received`,
            user: userData?.name || user?.displayName || user?.email?.split('@')[0] || 'Team Member',
            timestamp: new Date().toISOString()
          };

          await setDoc(doc(db, 'orders', id), { 
            items: updatedItems,
            activities: [activity, ...(order.activities || [])]
          }, { merge: true });
      } else {
          // Already received, so start the timer
          const newInProgress = { 
              ...inProgress, 
              [size]: { 
                  startTime: new Date().toISOString(), 
                  user: user?.email || 'Team Member' 
              } 
          };
          
          const updatedItems = order.items.map((i: any) => 
              i.id === item.id ? { ...i, inProgressSizes: newInProgress } : i
          );
          
          const activity = {
            id: `act-${Date.now()}`,
            type: 'system',
            message: `Started production on ${qty}x ${size} for ${item.style}`,
            user: userData?.name || user?.displayName || user?.email?.split('@')[0] || 'Team Member',
            timestamp: new Date().toISOString()
          };

          await setDoc(doc(db, 'orders', id), { 
            items: updatedItems,
            activities: [activity, ...(order.activities || [])]
          }, { merge: true });
      }
   };

  const isSizeFullyBoxed = (item: any, size: string, totalQty: number) => {
      if (!order.boxes || totalQty <= 0) return false;
      let boxedQty = 0;
      order.boxes.forEach((box: any) => {
          const boxItem = box.items?.find((bi: any) => String(bi.id) === String(item.id));
          if (boxItem?.sizes?.[size]) boxedQty += boxItem.sizes[size];
      });
      return boxedQty >= totalQty;
  };

  const handleContextMenuAction = async (action: string, boxId?: string) => {
    if (!contextMenu || !id || !order) return;
    const { item, size, qty } = contextMenu;
    
    let updatedItems = [...(order.items || [])];
    let updatedBoxes = [...(order.boxes || [])];
    let activityMessage = '';

    if (action === 'uncomplete') {
       updatedItems = updatedItems.map((i: any) => 
           i.id === item.id ? { 
               ...i, 
               completedSizes: (i.completedSizes || []).filter((s: string) => s !== size) 
           } : i
       );
       activityMessage = `Unmarked size ${size} for ${item.style}`;
    } else if (action === 'mark_ordered') {
       const newOrdered = [...(item.orderedSizes || []), size];
       updatedItems = updatedItems.map((i: any) => 
           i.id === item.id ? { ...i, orderedSizes: newOrdered } : i
       );
       activityMessage = `Marked size ${size} for ${item.style} as ordered`;
    } else if (action === 'unorder') {
       const newOrdered = (item.orderedSizes || []).filter((s: string) => s !== size);
       updatedItems = updatedItems.map((i: any) => 
           i.id === item.id ? { ...i, orderedSizes: newOrdered } : i
       );
       activityMessage = `Unmarked size ${size} for ${item.style} as ordered`;
    } else if (action === 'mark_received') {
       const newReceived = [...(item.receivedSizes || []), size];
       updatedItems = updatedItems.map((i: any) => 
           i.id === item.id ? { ...i, receivedSizes: newReceived } : i
       );
       activityMessage = `Marked size ${size} for ${item.style} as received`;
     } else if (action === 'unreceive') {
        const newReceived = (item.receivedSizes || []).filter((s: string) => s !== size);
        updatedItems = updatedItems.map((i: any) => 
            i.id === item.id ? { ...i, receivedSizes: newReceived } : i
        );
        activityMessage = `Unmarked size ${size} for ${item.style} as received`;
     } else if (action === 'mark_return') {
        const newReturned = [...(item.returnedSizes || []), size];
        updatedItems = updatedItems.map((i: any) => 
            i.id === item.id ? { ...i, returnedSizes: newReturned } : i
        );
        activityMessage = `Marked size ${size} of ${item.style} for return`;
     } else if (action === 'unmark_return') {
        const newReturned = (item.returnedSizes || []).filter((s: string) => s !== size);
        updatedItems = updatedItems.map((i: any) => 
            i.id === item.id ? { ...i, returnedSizes: newReturned } : i
        );
        activityMessage = `Unmarked size ${size} of ${item.style} for return`;
     } else if (action === 'pause_timer') {
       const newInProgress = { ...(item.inProgressSizes || {}) };
       const target = newInProgress[size];
       if (target && !target.paused) {
         const runningDuration = Date.now() - new Date(target.startTime).getTime();
         target.elapsedMs = (target.elapsedMs || 0) + runningDuration;
         target.paused = true;
       }
       updatedItems = updatedItems.map((i: any) => 
           i.id === item.id ? { ...i, inProgressSizes: newInProgress } : i
       );
       activityMessage = `Paused timer on size ${size} for ${item.style}`;
    } else if (action === 'resume_timer') {
       const newInProgress = { ...(item.inProgressSizes || {}) };
       const target = newInProgress[size];
       if (target && target.paused) {
         target.startTime = new Date().toISOString();
         target.paused = false;
       }
       updatedItems = updatedItems.map((i: any) => 
           i.id === item.id ? { ...i, inProgressSizes: newInProgress } : i
       );
       activityMessage = `Resumed timer on size ${size} for ${item.style}`;
    } else if (action === 'cancel_timer') {
       const newInProgress = { ...(item.inProgressSizes || {}) };
       delete newInProgress[size];
       updatedItems = updatedItems.map((i: any) => 
           i.id === item.id ? { ...i, inProgressSizes: newInProgress } : i
       );
       activityMessage = `Canceled timer on size ${size} for ${item.style}`;
    } else if (action === 'add_to_box' && boxId) {
        const targetBoxIndex = updatedBoxes.findIndex((b: any) => b.id === boxId);
        if (targetBoxIndex >= 0) {
            const box = updatedBoxes[targetBoxIndex];
            const existingBoxItems = [...(box.items || [])];
            const matchIdx = existingBoxItems.findIndex((bi: any) => String(bi.id) === String(item.id));
            
            if (matchIdx >= 0) {
                const bItem = existingBoxItems[matchIdx];
                const newSizes = { ...(bItem.sizes || {}), [size]: (bItem.sizes?.[size] || 0) + qty };
                const newTotalQty = Object.values(newSizes).reduce((a: any, b: any) => a + (parseInt(b) || 0), 0);
                existingBoxItems[matchIdx] = { ...bItem, sizes: newSizes, qty: newTotalQty };
            } else {
                existingBoxItems.push({
                   id: item.id, style: item.style || 'Custom Garment', color: item.color || '', gender: item.gender || '',
                   image: item.image || '', itemNum: item.itemNum || '',
                   sizes: { [size]: qty }, qty: qty
                });
            }
            updatedBoxes[targetBoxIndex] = { ...box, items: existingBoxItems };
            activityMessage = `Added ${qty}x ${size} to ${box.name}`;
        }
    }

    if (activityMessage) {
       const activity = {
         id: `act-${Date.now()}`,
         type: 'system',
         message: activityMessage,
         user: userData?.name || user?.displayName || user?.email?.split('@')[0] || 'Team Member',
         timestamp: new Date().toISOString()
       };

       await setDoc(doc(db, 'orders', id), { 
         items: updatedItems,
         boxes: updatedBoxes,
         activities: [activity, ...(order.activities || [])]
       }, { merge: true });
    }
    setContextMenu(null);
  };

  const handleMainImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editItemObj) return;
    setIsUploadingMain(true);
    try {
      const storageRef = ref(storage, `orders/${id}/items/${editItemObj.id}/main-${Date.now()}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setEditItemObj((prev: any) => ({ ...prev, image: url }));
    } catch (err) {
      console.error('Failed to upload main image', err);
    } finally {
      setIsUploadingMain(false);
    }
  };

  const handleRefImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editItemObj) return;
    setIsUploadingRef(true);
    try {
      const storageRef = ref(storage, `orders/${id}/items/${editItemObj.id}/ref-${Date.now()}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setEditItemObj((prev: any) => ({ 
        ...prev, 
        referenceImages: [...(prev.referenceImages || []), url] 
      }));
    } catch (err) {
      console.error('Failed to upload ref image', err);
    } finally {
      setIsUploadingRef(false);
    }
  };

  const handleGangSheetUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editItemObj) return;
    setIsUploadingGang(true);
    try {
      const storageRef = ref(storage, `orders/${id}/items/${editItemObj.id}/gang-${Date.now()}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setEditItemObj((prev: any) => ({ 
        ...prev, 
        image: url,
        originalSheetUrl: url,
        artworks: [{ 
          id: `art-${Date.now()}`,
          name: file.name, 
          imageUrl: url, 
          url: url, 
          originalUrl: url, 
          x: 0, 
          y: 0, 
          width: prev.sheetWidth || 22, 
          height: prev.sheetHeight || 24, 
          rotation: 0 
        }]
      }));
    } catch (err) {
      console.error('Failed to upload gang sheet artwork', err);
    } finally {
      setIsUploadingGang(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>, idx: number) => {
    const file = e.target.files?.[0];
    if (!file || !editItemObj) return;
    setIsUploadingGang(true);
    try {
      // Create local object URL to get image dimensions
      const imgObj = new Image();
      imgObj.src = URL.createObjectURL(file);
      await new Promise((resolve) => {
        imgObj.onload = resolve;
        imgObj.onerror = resolve;
      });
      const aspect = imgObj.naturalWidth ? (imgObj.naturalHeight / imgObj.naturalWidth) : 1.0;

      const storageRef = ref(storage, `orders/${id}/items/${editItemObj.id || 'new'}/logo-${idx}-${Date.now()}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      const newArtworks = [...(editItemObj.artworks || [])];
      const defaultWidth = 3.5;
      const calculatedHeight = parseFloat((defaultWidth * aspect).toFixed(2));

      if (newArtworks.length === 0) {
        newArtworks.push({ id: `art-${Date.now()}`, name: file.name, url, width: defaultWidth, height: calculatedHeight, aspectRatio: aspect, quantity: 10 });
      } else {
        newArtworks[idx] = {
          ...newArtworks[idx],
          id: newArtworks[idx].id || `art-${Date.now()}`,
          name: file.name,
          url,
          imageUrl: url,
          originalUrl: url,
          width: newArtworks[idx].width || defaultWidth,
          height: parseFloat(((newArtworks[idx].width || defaultWidth) * aspect).toFixed(2)),
          aspectRatio: aspect
        };
      }
      setEditItemObj((prev: any) => ({
        ...prev,
        artworks: newArtworks,
        image: prev.image || url
      }));
    } catch (err) {
      console.error(err);
    } finally {
      setIsUploadingGang(false);
    }
  };

  const handleGeneratePrintFile = async (item: any) => {
    if (!id || !order) return;
    setGeneratingItemId(item.id);
    try {
      const { printDataUrl, cutDataUrl, sheetHeight } = await generateFinalSheetsForPrintAndCut(
        item,
        order.id,
        order.customerName || 'Customer',
        order.shippingAddress || null
      );
      
      const printStorageRef = ref(storage, `production-sheets/${id}/${item.id}-print.png`);
      const cutStorageRef = ref(storage, `production-sheets/${id}/${item.id}-cut.svg`);
      
      await uploadString(printStorageRef, printDataUrl, 'data_url');
      await uploadString(cutStorageRef, cutDataUrl, 'data_url');
      
      const printReadyUrl = await getDownloadURL(printStorageRef);
      const cutReadyUrl = await getDownloadURL(cutStorageRef);
      
      const updatedItems = order.items.map((i: any) => {
        if (i.id === item.id) {
          return { ...i, printReadyUrl, cutReadyUrl, sheetHeight };
        }
        return i;
      });
      
      await updateDoc(doc(db, 'orders', id), { items: updatedItems });
    } catch (err) {
      console.error('Error generating print/cut files:', err);
      alert('Failed to generate print files: ' + (err as Error).message);
    } finally {
      setGeneratingItemId(null);
    }
  };

  const handleToggleReadyToPrint = async () => {
    if (!id || !order) return;
    
    const gangSheetItems = (order.items || []).filter((item: any) => item.itemType === 'gang_sheet');
    const allReady = gangSheetItems.every((item: any) => item.readyToPrint);
    const newReadyState = !allReady;

    const updatedItems = order.items.map((item: any) => {
      if (item.itemType === 'gang_sheet') {
        return { 
          ...item, 
          readyToPrint: newReadyState,
          readyToPrintAt: newReadyState ? new Date().toISOString() : null,
          readyToPrintBy: newReadyState ? (userData?.name || user?.displayName || user?.email?.split('@')[0] || 'Staff') : null
        };
      }
      return item;
    });

    try {
      const message = newReadyState 
        ? "Marked gang sheets as ready to print (notified printers)" 
        : "Unmarked gang sheets as ready to print";
        
      const newActivity = {
        id: `act-${Date.now()}`,
        type: 'system',
        message,
        user: userData?.name || user?.displayName || user?.email?.split('@')[0] || 'Team Member',
        timestamp: new Date().toISOString()
      };

      await updateDoc(doc(db, 'orders', id), { 
        items: updatedItems,
        activities: [newActivity, ...(order.activities || [])]
      });
    } catch (err) {
      console.error("Error toggling print ready state:", err);
      alert("Failed to update print ready state.");
    }
  };

  const handleToggleItemReadyToPrint = async (itemId: string) => {
    if (!id || !order) return;
    
    const updatedItems = order.items.map((item: any) => {
      if (item.id === itemId) {
        const nextReadyState = !item.readyToPrint;
        return { 
          ...item, 
          readyToPrint: nextReadyState,
          readyToPrintAt: nextReadyState ? new Date().toISOString() : null,
          readyToPrintBy: nextReadyState ? (userData?.name || user?.displayName || user?.email?.split('@')[0] || 'Staff') : null
        };
      }
      return item;
    });

    const targetItem = order.items.find((item: any) => item.id === itemId);
    const isNowReady = !targetItem?.readyToPrint;

    try {
      const message = isNowReady 
        ? `Marked gang sheet "${targetItem?.style || 'DTF Gang Sheet'}" as ready to print`
        : `Unmarked gang sheet "${targetItem?.style || 'DTF Gang Sheet'}" as ready to print`;

      const newActivity = {
        id: `act-${Date.now()}`,
        type: 'system',
        message,
        user: userData?.name || user?.displayName || user?.email?.split('@')[0] || 'Team Member',
        timestamp: new Date().toISOString()
      };

      await updateDoc(doc(db, 'orders', id), { 
        items: updatedItems,
        activities: [newActivity, ...(order.activities || [])]
      });
    } catch (err) {
      console.error("Error toggling ready state:", err);
    }
  };

  const handleToggleItemPrinted = async (itemId: string) => {
    if (!id || !order) return;
    
    const updatedItems = order.items.map((item: any) => {
      if (item.id === itemId) {
        const nextPrintedState = !item.printed;
        return { 
          ...item, 
          printed: nextPrintedState,
          printedAt: nextPrintedState ? new Date().toISOString() : null,
          printedBy: nextPrintedState ? (userData?.name || user?.displayName || user?.email?.split('@')[0] || 'Staff') : null
        };
      }
      return item;
    });

    const targetItem = order.items.find((item: any) => item.id === itemId);
    const isNowPrinted = !targetItem?.printed;

    try {
      const message = isNowPrinted 
        ? `Marked gang sheet "${targetItem?.style || 'DTF Gang Sheet'}" as printed`
        : `Marked gang sheet "${targetItem?.style || 'DTF Gang Sheet'}" as unprinted`;

      const newActivity = {
        id: `act-${Date.now()}`,
        type: 'system',
        message,
        user: userData?.name || user?.displayName || user?.email?.split('@')[0] || 'Team Member',
        timestamp: new Date().toISOString()
      };

      await updateDoc(doc(db, 'orders', id), { 
        items: updatedItems,
        activities: [newActivity, ...(order.activities || [])]
      });
    } catch (err) {
      console.error("Error toggling printed state:", err);
    }
  };

  const handleDownloadAllZip = async () => {
    if (!id || !order) return;
    setIsZipping(true);
    try {
      const zip = new JSZip();
      let hasFiles = false;

      // Find all gang sheet items in this order
      const gangSheetItems = (order.items || []).filter((item: any) => item.itemType === 'gang_sheet');

      for (const item of gangSheetItems) {
        if (item.printReadyUrl) {
          try {
            const printRes = await fetch(item.printReadyUrl);
            const printBlob = await printRes.blob();
            const filenamePrint = `${order.id}-${item.id}-print.png`;
            zip.file(filenamePrint, printBlob);
            hasFiles = true;
          } catch (err) {
            console.error(`Failed to fetch print file for item ${item.id}`, err);
          }
        }
        if (item.cutReadyUrl) {
          try {
            const cutRes = await fetch(item.cutReadyUrl);
            const cutBlob = await cutRes.blob();
            const filenameCut = `${order.id}-${item.id}-cut.svg`;
            zip.file(filenameCut, cutBlob);
            hasFiles = true;
          } catch (err) {
            console.error(`Failed to fetch cut file for item ${item.id}`, err);
          }
        }
      }

      if (!hasFiles) {
        alert("No generated production assets found to download.");
        return;
      }

      const content = await zip.generateAsync({ type: 'blob' });
      FileSaver.saveAs(content, `order-${order.id}-production-assets.zip`);
    } catch (err) {
      console.error("Failed to generate ZIP:", err);
      alert("Failed to generate ZIP archive: " + (err as Error).message);
    } finally {
      setIsZipping(false);
    }
  };

  const handleSaveItemEdit = async () => {
    if (!id || !editItemObj) return;
    setIsItemSaving(true);
    try {
      const orderData = orders.find(o => o.id === id);
      if (!orderData) throw new Error("Order not found");

      // Calculate new qty 
      const finalQty = editItemObj.itemType === 'service' 
        ? (editItemObj.qty || 1) 
        : (editItemObj.itemType === 'gang_sheet'
           ? (editItemObj.quantity || 1)
           : (editItemObj.sizes ? Object.values(editItemObj.sizes).reduce((acc: number, val: any) => acc + (parseInt(val) || 0), 0) : 0));
      const numericPrice = parseFloat((editItemObj.price || '0').toString().replace(/[^0-9.]/g, ''));
      const lineTotal = `$${(finalQty * numericPrice).toFixed(2)}`;

      const finalItem = {
        ...editItemObj,
        qty: finalQty,
        total: lineTotal,
        ...(editItemObj.itemType === 'gang_sheet' ? {
           sheetWidth: Number(editItemObj.sheetWidth || 22),
           sheetHeight: Number(editItemObj.sheetHeight || 24),
           sheetSizeName: editItemObj.sheetSizeName || 'Single Design Transfer',
           sheetPrice: numericPrice,
           originalSheetUrl: editItemObj.sheetSizeName === 'Standard Gang Sheet' ? (editItemObj.originalSheetUrl || editItemObj.image || '') : '',
           quantity: finalQty
        } : {})
      };

      const existingItems = orderData.items || [];
      const itemExists = existingItems.some((i: any) => i.id === finalItem.id);
      
      const updatedItems = itemExists 
        ? existingItems.map((i:any) => i.id === finalItem.id ? finalItem : i)
        : [...existingItems, finalItem];

      const activityRawMessage = itemExists 
        ? `Updated specifications for ${finalItem.style}` 
        : `Added ${finalItem.qty}x ${finalItem.style} to order`;

      const activity = {
        id: `act-${Date.now()}`,
        type: 'system',
        message: activityRawMessage,
        user: userData?.name || user?.displayName || user?.email?.split('@')[0] || 'Team Member',
        timestamp: new Date().toISOString()
      };

      await setDoc(doc(db, 'orders', id), { 
         items: updatedItems,
         activities: [activity, ...(orderData.activities || [])]
      }, { merge: true });
      setEditItemObj(null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsItemSaving(false);
    }
  };
  const handleDeleteItem = async () => {
    if (!id || !editItemObj) return;
    
    // Only process deletion if user clicks OK
    if (!window.confirm("Are you sure you want to delete this item?")) return;
    
    setIsItemSaving(true);
    try {
      const orderData = orders.find(o => o.id === id);
      if (!orderData) throw new Error("Order not found");

      const existingItems = orderData.items || [];
      const updatedItems = existingItems.filter((i: any) => i.id !== editItemObj.id);

      const activity = {
        id: `act-${Date.now()}`,
        type: 'system',
        message: `Removed ${editItemObj.qty > 0 ? `${editItemObj.qty}x ` : ''}${editItemObj.style || 'an item'} from order`,
        user: userData?.name || user?.displayName || user?.email?.split('@')[0] || 'Team Member',
        timestamp: new Date().toISOString()
      };

      await setDoc(doc(db, 'orders', id), { 
         items: updatedItems,
         activities: [activity, ...(orderData.activities || [])]
      }, { merge: true });
      setEditItemObj(null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsItemSaving(false);
    }
  };

  const handleDuplicateItem = async (itemToDuplicate: any) => {
    if (!id || !order) return;
    setIsItemSaving(true);
    try {
      const existingItems = [...(order.items || [])];
      const index = existingItems.findIndex((i: any) => i.id === itemToDuplicate.id);
      if (index === -1) return;

      const duplicateItem = {
        ...itemToDuplicate,
        id: `item-${Date.now()}`,
        completedSizes: [],
        inProgressSizes: {},
        sizeStats: {},
        receivedSizes: [],
        orderedSizes: []
      };

      existingItems.splice(index + 1, 0, duplicateItem);

      const activity = {
        id: `act-${Date.now()}`,
        type: 'system',
        message: `Duplicated item: ${itemToDuplicate.style || 'garment'}`,
        user: userData?.name || user?.displayName || user?.email?.split('@')[0] || 'Team Member',
        timestamp: new Date().toISOString()
      };

      await setDoc(doc(db, 'orders', id), { 
        items: existingItems,
        activities: [activity, ...(order.activities || [])]
      }, { merge: true });
      setEditItemObj(null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsItemSaving(false);
    }
  };

  const handleDeleteBox = async (boxId: string) => {
    if (!id || !order) return;
    if (!window.confirm('Delete this shipment and its packing slip?')) return;
    try {
      const updatedBoxes = (order.boxes || []).filter((b: any) => b.id !== boxId);
      await setDoc(doc(db, 'orders', id), { boxes: updatedBoxes }, { merge: true });
    } catch (err) {
      console.error("Error deleting box:", err);
    }
  };

  // Safe date parser for native <input type="date" />
  const formatForDateInput = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      return d.toISOString().split('T')[0];
    } catch (e) {
      return '';
    }
  };

  useEffect(() => {
    const order = orders.find(o => o.id === id);
    if (order) {
      setEditForm({
        title: order.title || '',
        date: formatForDateInput(order.targetCompletionDate || order.date || ''),
        statusIndex: order.statusIndex || 0,
        trackingCarrier: order.trackingCarrier || '',
        trackingNumber: order.trackingNumber || '',
        fulfillmentType: order.fulfillmentType || '',
        shippingAddress: order.shippingAddress || { name: '', company: '', street1: '', street2: '', city: '', state: '', zip: '', country: 'US' },
        thirdPartyBilling: order.thirdPartyBilling || { account: '', zip: '' }
      });
    }
  }, [orders, id]);

  const handleSaveEdit = async () => {
    if (!id || !order) return;
    setIsSaving(true);
    try {
      const statusChanged = editForm.statusIndex !== order.statusIndex;
      await setDoc(doc(db, 'orders', id), {
        title: editForm.title,
        date: editForm.date,
        targetCompletionDate: editForm.date,
        statusIndex: editForm.statusIndex,
        trackingCarrier: editForm.trackingCarrier,
        trackingNumber: editForm.trackingNumber,
        fulfillmentType: editForm.fulfillmentType,
        shippingAddress: editForm.shippingAddress,
        thirdPartyBilling: editForm.thirdPartyBilling
      }, { merge: true });
      setIsEditDialogOpen(false);

      if (statusChanged) {
        sendOrderStatusSMS(id, editForm.statusIndex);
      }
    } catch (err) {
      console.error("Error updating order:", err);
      // Fallback update could go here if using local state array, but we have onSnapshot so it's live!
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteOrder = async () => {
    if (!id || !order) return;
    const confirmed = window.confirm(`Are you sure you want to delete "${order.title || 'this order'}"? This action cannot be undone.`);
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'orders', id));
      setIsEditDialogOpen(false);
      navigate('/orders');
    } catch (err) {
      console.error("Error deleting order:", err);
      alert("Failed to delete order. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading || fetchingCustomer) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[50vh] text-brand-secondary gap-3">
        <Loader2 className="animate-spin" size={32} />
        <p className="font-semibold uppercase tracking-widest text-xs">Loading Order Details...</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[50vh] text-brand-secondary gap-3">
        <p className="font-semibold uppercase tracking-widest text-xs">Order not found.</p>
        <PillButton variant="outline" onClick={() => navigate(-1)}>Back</PillButton>
      </div>
    );
  }

  const customer = currentCustomer;
  
  // Calculate dynamic sums from the line items array
  const totalItems = order.items?.reduce((acc: number, i: any) => acc + (i.qty || 0), 0) || 0;
  const totalPriceRaw = order.items?.reduce((acc: number, i: any) => {
    const priceMatch = (i.total || '$0').toString().replace(/[^0-9.]/g, '');
    return acc + (parseFloat(priceMatch) || 0);
  }, 0) || 0;
  const totalFormatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalPriceRaw);

  // Costs & Receipts Calculations
  const orderCosts = order.costs || [];
  const totalCosts = orderCosts.reduce((sum: number, c: any) => sum + (parseFloat(c.amount) || 0), 0);
  const profit = totalPriceRaw - totalCosts;
  const margin = totalPriceRaw > 0 ? (profit / totalPriceRaw) * 100 : 0;

  // Map strict 7-step Index to Admin pipeline Badge component
  const isKitting = order.fulfillmentType === 'Kitting' || (!order.fulfillmentType && customer.fulfillmentType === 'Kitting');
  let badgeStatus: StatusType = 'quote';
  switch(order.statusIndex) {
     case 0: badgeStatus = 'quote'; break;
     case 1: badgeStatus = 'notified'; break;
     case 2: badgeStatus = 'quote_sent'; break;
     case 3: badgeStatus = 'approved'; break;
     case 4: badgeStatus = 'shopping'; break;
     case 5: badgeStatus = 'ordered'; break;
     case 6: badgeStatus = 'processing'; break;
     case 7: 
        if (isKitting) { badgeStatus = 'inventory'; }
        else { badgeStatus = 'shipped'; }
        break;
     case 8: 
        if (isKitting) { badgeStatus = 'live'; }
        else { badgeStatus = 'received'; }
        break;
  }

  return (
    <div className={tokens.layout.container}>
      {/* Top Breadcrumb & Actions */}
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-brand-border">
        <button 
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm text-brand-secondary hover:text-brand-primary transition-colors"
        >
          <ArrowLeft size={16} />
          Back
        </button>
        <div className="flex items-center gap-4">
          {order.statusIndex < 3 && (
            <PillButton variant="filled" className="gap-2 bg-green-600 hover:bg-green-700 text-white border-transparent" onClick={() => handleStatusChange(3)}>
               <Check size={16} />
               Approve & Convert to Order
            </PillButton>
          )}
          <PillButton variant="outline" className="gap-2" onClick={() => window.open(`/invoice/${order.id}`, '_blank')}>
            <DollarSign size={16} />
            Invoice
          </PillButton>
          <PillButton variant="outline" className="gap-2 border-green-200 text-green-700 bg-green-50 hover:bg-green-600 hover:text-white hover:border-green-600" onClick={() => setIsPalletOptimizerOpen(true)}>
            <Layers size={16} />
            Find in Pallets
          </PillButton>
          <PillButton variant="outline" className="gap-2" onClick={() => setIsTeamModalOpen(true)}>
            <Users size={16} />
            Team
          </PillButton>
          <PillButton variant="filled" className="gap-2" onClick={() => setIsEditDialogOpen(true)}>
            <Edit3 size={16} />
            Edit Order
          </PillButton>
        </div>
      </div>

      <div>
        {/* Top Section: Order Information */}
        <div className="space-y-8">
          
          {/* Header */}
          <div className="bg-white p-8 rounded-card border border-brand-border shadow-sm">
            <div className="flex flex-col lg:flex-row justify-between lg:items-start mb-6 gap-6">
                <div>
                  {isEditingTitle ? (
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <input 
                        type="text"
                        value={tempTitle}
                        onChange={(e) => setTempTitle(e.target.value)}
                        onKeyDown={async (e) => {
                          if (e.key === 'Enter') {
                            await handleSaveTitle();
                          } else if (e.key === 'Escape') {
                            setIsEditingTitle(false);
                          }
                        }}
                        autoFocus
                        className="font-serif text-4xl text-brand-primary border-b border-brand-primary/40 focus:border-brand-primary focus:outline-none bg-transparent max-w-full leading-tight py-0.5"
                      />
                      <button 
                        onClick={handleSaveTitle}
                        className="bg-black hover:bg-neutral-800 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm shrink-0 cursor-pointer"
                      >
                        Save
                      </button>
                      <button 
                        onClick={() => setIsEditingTitle(false)}
                        className="bg-white border border-neutral-200 hover:bg-neutral-50 text-neutral-800 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm shrink-0 cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <h1 
                      onClick={() => {
                        setTempTitle(order.title || 'Untitled Order');
                        setIsEditingTitle(true);
                      }}
                      className="font-serif text-4xl text-brand-primary mb-2 line-clamp-2 md:line-clamp-none leading-tight cursor-pointer hover:opacity-80 transition-opacity flex items-center gap-2 group"
                      title="Click to edit order name"
                    >
                      {order.title || 'Untitled Order'}
                      <Edit3 size={18} className="text-neutral-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </h1>
                  )}
                  {order.customerId ? (
                    <Link 
                      to={`/customers/${order.customerId}`}
                      className="text-lg text-brand-secondary hover:text-brand-primary hover:underline transition-colors line-clamp-2 inline-block"
                    >
                      {customer.company}
                    </Link>
                  ) : (
                    <p className="text-lg text-brand-secondary line-clamp-2">{customer.company}</p>
                  )}
                </div>
                <div className="flex flex-col items-start lg:items-end gap-3 lg:text-right shrink-0">
                   <p className="text-xs uppercase font-bold tracking-widest text-brand-secondary">Order {order.portalId || order.id}</p>
                   
                   <div className="flex items-center gap-3">
                       <StatusBadge status={badgeStatus} />
                       
                       {order.paymentStatus === 'paid' && (
                         <div className="bg-emerald-100 border border-emerald-200 text-emerald-700 px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                           <Check size={12} strokeWidth={3} /> Paid
                         </div>
                       )}
                       
                       {order.items?.some((item: any) => item.itemType === 'gang_sheet') && (() => {
                         const gangSheetItems = (order.items || []).filter((item: any) => item.itemType === 'gang_sheet');
                         const allReady = gangSheetItems.every((item: any) => item.readyToPrint);
                         return (
                           <>
                             <div className="h-6 w-px bg-brand-border hidden sm:block"></div>
                             <button
                               onClick={handleToggleReadyToPrint}
                               className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer border ${
                                 allReady
                                   ? 'bg-purple-100 border-purple-200 text-purple-700 hover:bg-purple-200'
                                   : 'bg-brand-primary text-white hover:bg-black border-transparent shadow-sm'
                               }`}
                             >
                               <Printer size={12} />
                               <span>{allReady ? 'Ready for Printer (Notified)' : 'Notify Printer (Print Ready)'}</span>
                             </button>
                           </>
                         );
                       })()}
                       
                       <div className="h-6 w-px bg-brand-border hidden sm:block"></div>
                      
                      <div className="relative">
                          <select 
                              className="appearance-none bg-brand-bg hover:bg-neutral-100 border border-brand-border rounded-lg pl-3 pr-8 py-1.5 text-[11px] font-bold uppercase tracking-wider text-brand-secondary focus:border-brand-primary focus:outline-none transition-colors cursor-pointer"
                              value={order.statusIndex.toString()}
                              onChange={(e) => handleStatusChange(Number(e.target.value))}
                          >
                            <option value="0">0 - Request Created</option>
                            <option value="1">1 - Under Review</option>
                            <option value="2">2 - Quote Prepared</option>
                            <option value="3">3 - Awaiting Payment</option>
                            <option value="4">4 - Sourcing</option>
                            <option value="5">5 - Ordered</option>
                            <option value="6">6 - In Production</option>
                            <option value="7">7 - {isKitting ? 'Inventory' : 'Shipped'}</option>
                            <option value="8">8 - {isKitting ? 'Live' : 'Received'}</option>
                          </select>
                          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-brand-secondary pointer-events-none" />
                      </div>
                  </div>
               </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 pt-6 border-t border-brand-border">
               <div>
                  <span className="text-xs text-brand-secondary font-medium uppercase tracking-wider block mb-1">Due Date</span>
                  <span className="font-serif text-lg">{order.date}</span>
               </div>
               <div>
                  <span className="text-xs text-brand-secondary font-medium uppercase tracking-wider block mb-1">Total Items</span>
                  <span className="font-serif text-lg">{totalItems}</span>
               </div>
               <div>
                  <span className="text-xs text-brand-secondary font-medium uppercase tracking-wider block mb-1">Delivery</span>
                  {!order.trackingCarrier ? (
                    <span className="font-serif text-lg">Pickup</span>
                  ) : (
                    <div>
                      <span className="font-serif text-lg block">{order.trackingCarrier}</span>
                      {order.trackingNumber && (
                        <a 
                          href={getTrackingLink(order.trackingCarrier, order.trackingNumber) || '#'}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-bold text-brand-primary hover:underline hover:text-black transition-colors"
                        >
                          {order.trackingNumber}
                        </a>
                      )}
                    </div>
                  )}
               </div>
               <div>
                  <span className="text-xs text-brand-secondary font-medium uppercase tracking-wider block mb-1">Packaging</span>
                  <span className="font-serif text-lg">{order.packaging || 'Standard Packaging'}</span>
               </div>
               {hasPermission('viewPricing') && (
                 <div>
                    <span className="text-xs text-brand-secondary font-medium uppercase tracking-wider block mb-1">Est. Total</span>
                    <span className="font-serif text-lg">{totalFormatted}</span>
                 </div>
               )}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-8 mt-8">
          {/* Garments / Items */}
          <div>
            <div className="flex justify-between items-center mb-4 relative z-[100]">
               <h2 className={tokens.typography.h2}>Details</h2>
               <div className="flex items-center gap-3 relative z-[110]">
                 <PillButton 
                   variant="outline" 
                   onClick={() => setEditItemObj({
                     id: `item-${Date.now()}`,
                     itemType: 'garment',
                     gender: '',
                     style: '',
                     itemNum: '',
                     color: '',
                     sizes: { 'XS': 0, 'S': 0, 'M': 0, 'L': 0, 'XL': 0, '2XL': 0, '3XL': 0 },
                     price: '$0.00',
                     qty: 0,
                     total: '$0.00'
                   })}
                   className="gap-2 shrink-0 px-4 py-2 text-xs border-[1.5px] border-brand-primary text-brand-primary hover:bg-brand-primary hover:text-white transition-colors font-bold"
                 >
                   <Plus size={14} /> Add Item
                 </PillButton>
                 {(liveCustomer?.catalogLinkIds?.length > 0) && (
                    <PillButton 
                      variant="filled" 
                      onClick={() => {
                        setIsDeckModalOpen(true);
                        handleFetchDecks();
                      }}
                      className="gap-2 shrink-0 px-4 py-2 text-xs bg-black text-white hover:bg-neutral-800 shadow-sm border border-transparent font-bold"
                    >
                      <PackagePlus size={14} /> Pull from Deck
                    </PillButton>
                 )}
               </div>
            </div>
            <div className="bg-white rounded-card border border-brand-border overflow-hidden">
               {order.items?.length > 0 ? order.items.map((item: any) => (
                 <div 
                   key={item.id} 
                   draggable={draggableItemId === item.id}
                   onDragStart={(e) => handleDragStart(e, item.id)}
                   onDragOver={(e) => handleDragOver(e, item.id)}
                   onDragEnd={handleDragEnd}
                   onDrop={(e) => handleDrop(e, item.id)}
                   className={`p-6 border-b border-brand-border/50 flex flex-col gap-6 items-start hover:bg-brand-bg transition-colors last:border-0 ${draggableItemId === item.id ? 'cursor-grab active:cursor-grabbing' : ''} ${draggedItemId === item.id ? 'opacity-50 relative z-50 shadow-xl' : ''} ${dragOverItemId === item.id ? 'border-t-2 border-t-brand-primary bg-brand-bg/50' : ''}`}
                 >
                    <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 w-full relative group">
                       
                        {/* Item Actions */}
                        <div className="absolute top-0 right-0 flex gap-1.5 opacity-0 group-hover:opacity-100 z-10">
                          <button 
                            onClick={() => handleDuplicateItem(item)} 
                            className="p-1.5 text-brand-secondary hover:text-brand-primary transition-colors bg-white rounded-md shadow-sm border border-brand-border flex items-center justify-center"
                            title="Duplicate Garment"
                          >
                            <Copy size={14} />
                          </button>
                          <button 
                            onClick={() => {
                              if (item.itemType === 'gang_sheet') {
                                const initialArtworks = Array.isArray(item.artworks) && item.artworks.length > 0
                                  ? item.artworks
                                  : (item.originalSheetUrl
                                     ? [{ id: `art-${Date.now()}`, name: 'Existing Artwork', url: item.originalSheetUrl, imageUrl: item.originalSheetUrl, originalUrl: item.originalSheetUrl, width: item.sheetWidth || 3.5, height: item.sheetHeight || 3.5, quantity: item.quantity || 1 }]
                                     : (item.sheetSizeName === 'Single Design Transfer'
                                        ? [{ id: `art-${Date.now()}`, name: '', url: '', imageUrl: '', originalUrl: '', width: 3.5, height: 3.5, quantity: 10 }]
                                        : []));
                                const targetLayoutType = item.sheetSizeName || 'Single Design Transfer';
                                setEditItemObj({ 
                                  ...item, 
                                  artworks: initialArtworks,
                                  quantity: targetLayoutType === 'Single Design Transfer' ? 1 : (item.quantity || 1)
                                });
                              } else {
                                setEditItemObj(item);
                              }
                            }} 
                            className="p-1.5 text-brand-secondary hover:text-brand-primary transition-colors bg-white rounded-md shadow-sm border border-brand-border flex items-center justify-center"
                            title="Edit Item"
                          >
                            <Edit3 size={14} />
                          </button>
                        </div>

                       {/* Left Side: Visual & Specs & Artwork */}
                       <div className="flex flex-col gap-3 flex-1 min-w-0 pr-2 pb-2 lg:pb-0 relative pl-6">
                         <div 
                           className="absolute left-[-8px] top-1/2 -translate-y-1/2 text-brand-border hover:text-brand-primary transition-colors cursor-grab active:cursor-grabbing p-2"
                           onMouseEnter={() => setDraggableItemId(item.id)}
                           onMouseLeave={() => setDraggableItemId(null)}
                         >
                           <GripVertical size={20} />
                         </div>
                         <div className="flex flex-col xl:flex-row xl:items-center gap-6 xl:gap-8 flex-1 min-w-0 pr-4">
                           {/* Product Visual */}
                             <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 sm:gap-6 flex-1 min-w-0 w-full text-center sm:text-left">
                              <div 
                                onMouseEnter={() => setHoveredItemId(item.id)}
                                onMouseLeave={() => setHoveredItemId(null)}
                                onClick={() => item.image && setExpandedImage({ src: item.image, alt: item.style })}
                                className={`w-36 h-36 sm:w-20 sm:h-20 rounded-2xl overflow-hidden shrink-0 flex items-center ${item.customized ? 'justify-start' : 'justify-center'} ${item.image ? 'bg-neutral-50/50 cursor-zoom-in' : 'bg-brand-bg/50 border border-brand-border/50'} shadow-sm border border-brand-border/40 hover:shadow-md transition-all`}
                                title={item.image ? "Click to view full screen" : "No image provided"}
                              >
                                {item.image ? (
                                  item.customized ? (
                                    (() => {
                                      const N = getActiveSidesCountForOrderItem(item);
                                      const isHovered = hoveredItemId === item.id;
                                      const translatePercentage = isHovered && N > 1 ? (100 / N) : 0;
                                      return (
                                        <img 
                                          src={item.image} 
                                          alt={item.style} 
                                          style={{
                                            width: `${N * 100}%`,
                                            height: '100%',
                                            maxWidth: 'none',
                                            transform: `translateX(-${translatePercentage}%)`,
                                            transition: 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                                          }}
                                          className="object-cover mix-blend-multiply p-1 select-none pointer-events-none" 
                                        />
                                      );
                                    })()
                                  ) : (
                                    <img 
                                      src={item.image} 
                                      alt={item.style} 
                                      className="w-full h-full object-contain mix-blend-multiply p-1 select-none pointer-events-none" 
                                    />
                                  )
                                ) : (
                                  <Box size={24} className="text-brand-secondary/40" />
                                )}
                              </div>
                             <div className="flex-1 min-w-0 w-full flex flex-col items-center sm:items-start">
                                <div className="flex items-center justify-center sm:justify-start gap-2 w-full">
                                  <h4 className="font-bold text-gray-900 text-[15px]">
                                    {item.itemType === 'gang_sheet' ? `${item.sheetSizeName || 'DTF Gang Sheet'}` : item.style}
                                  </h4>
                                  {item.itemType === 'gang_sheet' && (
                                    <span className="text-[9px] font-bold uppercase tracking-wider text-orange-600 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded shadow-sm">
                                      DTF
                                    </span>
                                  )}
                                  {item.shopifyOrder && (
                                    <span className="text-[9px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded shadow-sm">
                                      {item.shopifyOrder}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs font-semibold text-gray-500 mt-0.5">
                                   {item.itemType === 'gang_sheet' 
                                     ? `${item.style ? `${item.style} • ` : ''}${item.sheetWidth}" x ${item.sheetHeight}"` 
                                     : `${item.gender && item.gender !== 'Unisex' ? `${item.gender} ` : ''}${item.color ? (item.gender && item.gender !== 'Unisex' ? `- ${item.color}` : item.color) : ''}`}
                                </p>
                                
                                {/* Dropdown Chevron for Item Boxes under Garment Name */}
                                {(() => {
                                  const itemBoxes = order.boxes?.filter((b: any) => b.items?.some((bi: any) => String(bi.id) === String(item.id))) || [];
                                  const hasCourierLabels = itemBoxes.some((b: any) => !!b.labelUrl);
                                  const itemExpenses = order.costs?.filter((c: any) => getExpenseAllocation(c, item.id) > 0) || [];
                                  const totalItemExpenses = itemExpenses.reduce((sum: number, c: any) => sum + getExpenseAllocation(c, item.id), 0);
                                  
                                  return (
                                    <div className="flex items-center justify-center sm:justify-start flex-wrap gap-2 mt-3 min-w-0 w-full overflow-visible">
                                      {itemBoxes.length > 0 && (
                                        <button 
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setExpandedItems(prev => ({ ...prev, [item.id]: !prev[item.id] }));
                                          }}
                                          className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest transition-all px-3 py-1.5 rounded-full border border-brand-border shrink-0 whitespace-nowrap ${expandedItems[item.id] ? 'bg-neutral-100 text-brand-primary shadow-inner border-brand-border/80' : 'bg-white text-brand-secondary hover:border-brand-primary hover:text-brand-primary shadow-sm hover:shadow-md hover:-translate-y-[1px]'}`}
                                        >
                                          <ChevronDown size={12} strokeWidth={3} className={`transition-transform duration-300 ${expandedItems[item.id] ? 'rotate-180 text-brand-primary' : ''}`} />
                                          <span>{itemBoxes.length} {itemBoxes.length === 1 ? 'Shipment' : 'Shipments'}</span>
                                        </button>
                                      )}
                                      <button 
                                        onClick={(e) => {
                                           e.stopPropagation();
                                           handleStartQuickShip(item);
                                        }}
                                        className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-brand-primary hover:text-white transition-all bg-brand-primary/5 hover:bg-brand-primary px-3 py-1.5 rounded-full border border-brand-primary/30 hover:border-brand-primary hover:shadow-md hover:-translate-y-[1px] shrink-0 whitespace-nowrap"
                                        title="Quick pack remaining quantities into a shipment"
                                      >
                                        <Plus size={12} strokeWidth={3} /> <span>Add Shipment</span>
                                      </button>
                                      {itemExpenses.length > 0 && (
                                        <div 
                                          className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest bg-red-50 text-red-700 px-3 py-1.5 rounded-full border border-red-200 shrink-0 whitespace-nowrap shadow-sm cursor-help"
                                          title={itemExpenses.map((c: any) => {
                                              const connections = c.itemConnections || (c.itemId ? { [c.itemId]: c.linkedSizes || [] } : {});
                                              const linkedSizesForThisItem = connections[item.id] || [];
                                              const sizeText = linkedSizesForThisItem.length > 0 ? ` (Sizes: ${linkedSizesForThisItem.join(', ')})` : ' (All Sizes)';
                                              const allocatedAmount = getExpenseAllocation(c, item.id);
                                              const pct = c.amount > 0 ? (allocatedAmount / c.amount) * 100 : 0;
                                              const pctText = pct < 100 ? ` [Allocated ${pct.toFixed(0)}%]` : '';
                                              return `${c.description}${sizeText}${pctText}: $${allocatedAmount.toFixed(2)}`;
                                           }).join('\n')}
                                        >
                                          <DollarSign size={12} strokeWidth={3} className="text-red-600 animate-pulse" />
                                          <span>Expenses: ${totalItemExpenses.toFixed(2)}</span>
                                        </div>
                                      )}
                                      {itemBoxes.length > 0 && (
                                        <>
                                          <div className="group/print relative shrink-0 z-20">
                                            <button 
                                              className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-brand-secondary transition-all bg-white px-3 py-1.5 rounded-full border border-brand-border group-hover/print:border-brand-primary group-focus-within/print:border-brand-primary group-hover/print:text-brand-primary group-focus-within/print:text-brand-primary hover:bg-neutral-50 shadow-sm hover:shadow-md shrink-0 whitespace-nowrap"
                                            >
                                              <Printer size={12} strokeWidth={3} /> <span>Print</span> <ChevronDown size={10} strokeWidth={3} className="opacity-50 transition-transform duration-300 group-focus-within/print:rotate-180 group-focus-within/print:opacity-100 group-hover/print:opacity-100" />
                                            </button>
                                            
                                            {/* Dropdown Menu */}
                                            <div className="absolute left-0 top-full mt-1.5 w-40 bg-white border border-brand-border rounded-xl shadow-xl flex flex-col overflow-hidden opacity-0 pointer-events-none group-focus-within/print:opacity-100 group-focus-within/print:pointer-events-auto transition-all -translate-y-1 group-focus-within/print:translate-y-0 origin-top">
                                              <button 
                                                onClick={(e) => {
                                                   e.stopPropagation();
                                                   window.open(`/packing-slip/${order.id}/item/${item.id}`, '_blank');
                                                }}
                                                className="flex items-center gap-2.5 px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-brand-secondary hover:bg-brand-primary/5 hover:text-brand-primary text-left border-b border-brand-border"
                                              >
                                                <Printer size={12} strokeWidth={3} className="opacity-60" /> <span>Packing Slips</span>
                                              </button>
                                              <button 
                                                onClick={(e) => {
                                                   e.stopPropagation();
                                                   window.open(`/print/labels-sheet/${order.id}/item/${item.id}`, '_blank');
                                                }}
                                                className={`flex items-center gap-2.5 px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-brand-secondary hover:bg-brand-primary/5 hover:text-brand-primary text-left ${hasCourierLabels ? 'border-b border-brand-border' : ''}`}
                                              >
                                                <QrCode size={12} strokeWidth={3} className="opacity-60" /> <span>Box Tags</span>
                                              </button>
                                              {hasCourierLabels && (
                                                <button 
                                                  onClick={(e) => {
                                                     e.stopPropagation();
                                                     window.open(`/print/courier/${order.id}/item/${item.id}`, '_blank');
                                                  }}
                                                  className="flex items-center justify-between gap-2.5 px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-[#d52b1e] hover:bg-[#d52b1e]/10 text-left bg-[#d52b1e]/5"
                                                >
                                                  <div className="flex items-center gap-2.5">
                                                    <Truck size={12} strokeWidth={3} className="opacity-80" /> <span>UPS Labels</span>
                                                  </div>
                                                  <div className="bg-[#d52b1e] text-white rounded-full w-2 h-2 shrink-0 animate-pulse"></div>
                                                </button>
                                              )}
                                            </div>
                                          </div>
                                        </>
                                      )}
                                       {item.artworks?.map((art: any, idx: number) => {
                                         if (!art?.url && !art?.originalUrl) return null;
                                         const downloadUrl = art.originalUrl || art.url;
                                         return (
                                            <a 
                                              key={`art-dl-${idx}`} 
                                              href={downloadUrl} 
                                              target="_blank" 
                                              rel="noreferrer" 
                                              onClick={(e) => e.stopPropagation()}
                                              className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition-all px-3 py-1.5 rounded-full shadow-sm hover:shadow-md hover:-translate-y-[1px] shrink-0 whitespace-nowrap"
                                              title={`Download full resolution artwork: ${art.name || 'Artwork'}`}
                                            >
                                               <Download size={12} strokeWidth={3} />
                                               <span>{art.name || `Artwork ${idx + 1}`}</span>
                                            </a>
                                         );
                                       })}
                                       {(!item.artworks || item.artworks.length === 0) && item.image && (item.image.includes('firebasestorage') || item.image.includes('temp_logo') || item.image.includes('/logos/')) && (
                                         <a 
                                           href={item.image} 
                                           target="_blank" 
                                           rel="noreferrer" 
                                           onClick={(e) => e.stopPropagation()}
                                           className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition-all px-3 py-1.5 rounded-full shadow-sm hover:shadow-md hover:-translate-y-[1px] shrink-0 whitespace-nowrap"
                                           title="Download full resolution design file"
                                         >
                                            <Download size={12} strokeWidth={3} />
                                            <span>Download Artwork</span>
                                         </a>
                                       )}
                                       {(() => {
                                          if (!item.itemNum) return null;
                                          const isInCatalog = sanmarCatalog.some((p: any) => p.style.toLowerCase() === item.itemNum.toLowerCase());
                                          const isSanMarPattern = /^(AL|BC|PC|LPC|BP|K|L|S|Y|ST|LST|PST|YST|DT|DM|CS|MM|RH|TM|OG|LOG|NK|EB|CT|CX|AA|CH|GD|HN|G|SS|JR|RS|NL)\d/i.test(item.itemNum);
                                          if (!isInCatalog && !isSanMarPattern) return null;
                                          const sanmarUrl = `https://www.sanmar.com/search/?text=${encodeURIComponent(item.itemNum)}`;
                                          return (
                                            <a 
                                              href={sanmarUrl} 
                                              target="_blank" 
                                              rel="noreferrer" 
                                              onClick={(e) => e.stopPropagation()}
                                              className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all px-3 py-1.5 rounded-full shadow-sm hover:shadow-md hover:-translate-y-[1px] shrink-0 whitespace-nowrap"
                                              title={`Search ${item.itemNum} on SanMar`}
                                            >
                                              <ExternalLink size={12} strokeWidth={3} />
                                              <span>SanMar</span>
                                            </a>
                                          );
                                        })()}
                                      <button 
                                        onClick={(e) => {
                                           e.stopPropagation();
                                           setExpandedSpecs(prev => ({ ...prev, [item.id]: !prev[item.id] }));
                                        }}
                                        className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest transition-all px-3 py-1.5 rounded-full border shrink-0 whitespace-nowrap ${expandedSpecs[item.id] ? 'bg-neutral-100 text-brand-primary shadow-inner border-brand-border/80' : 'bg-white text-brand-secondary border-brand-border hover:border-brand-primary hover:text-brand-primary shadow-sm hover:shadow-md hover:-translate-y-[1px]'}`}
                                      >
                                        <ChevronDown size={12} strokeWidth={3} className={`transition-transform duration-300 ${expandedSpecs[item.id] ? 'rotate-180 text-brand-primary' : ''}`} />
                                        <span>Specs</span>
                                      </button>
                                    </div>
                                  );
                                })()}
                             </div>
                           </div>


                         </div>
                       </div>

                        {/* Right Side: Sizing & Pricing */}
                        <div className="flex flex-col sm:flex-row items-center sm:items-end lg:items-center gap-4 w-full xl:w-auto shrink-0 justify-center xl:justify-end mt-4 xl:mt-0">
                          {/* Sizing Grid Area */}
                          <div className="flex items-stretch gap-[2px] bg-neutral-200 p-[3px] rounded-xl font-sans overflow-x-auto max-w-full scrollbar-none shrink-0 sm:shrink">
                           {item.sizes && Object.entries(item.sizes).sort(([a], [b]) => sortSizes(a, b)).map(([size, qty]: [string, any]) => {
                             const isCompleted = item.completedSizes?.includes(size);
                             const inProgress = item.inProgressSizes?.[size];
                             const isPacked = isSizeFullyBoxed(item, size, qty);
                             const isReceived = item.receivedSizes?.includes(size);
                             const isReturned = item.returnedSizes?.includes(size);
                             const isOrdered = item.orderedSizes?.includes(size);

                             let colorClassTop = 'bg-neutral-300 text-neutral-600 group-hover/sizebtn:bg-neutral-400';
                             let colorClassBottom = (qty > 0 ? 'bg-white text-neutral-800 group-hover/sizebtn:bg-neutral-50' : 'bg-white text-neutral-400');
                             let topContent: any = size;
                             let wrapperClass = 'hover:-translate-y-0.5 hover:shadow-sm';

                             if (isPacked) {
                                 colorClassTop = 'bg-blue-500 text-white';
                                 colorClassBottom = 'bg-blue-50 text-blue-700';
                                 topContent = <div className="flex items-center gap-[2px]"><Box size={10} strokeWidth={3} /> <span className="text-[10px] leading-none mb-[1px]">{size}</span></div>;
                                 wrapperClass = 'opacity-80 hover:opacity-100';
                             } else if (isCompleted) {
                                 colorClassTop = 'bg-green-500 text-white';
                                 colorClassBottom = 'bg-green-50 text-green-700';
                                 topContent = <div className="flex items-center gap-[2px]"><Check size={10} strokeWidth={4} /> <span className="text-[10px] leading-none mb-[1px]">{size}</span></div>;
                                 wrapperClass = 'opacity-80 hover:opacity-100';
                             } else if (inProgress) {
                                 if (inProgress.paused) {
                                     colorClassTop = 'bg-orange-500 text-white';
                                     colorClassBottom = 'bg-orange-50 text-orange-700';
                                     topContent = <div className="flex items-center gap-[2px]"><Pause size={10} strokeWidth={3} /> <span className="text-[10px] leading-none mb-[1px]">{size}</span></div>;
                                     wrapperClass = 'opacity-90 hover:opacity-100';
                                 } else {
                                     colorClassTop = 'bg-red-500 text-white';
                                     colorClassBottom = 'bg-red-50 text-red-700';
                                     topContent = <div className="flex items-center gap-[2px]"><Clock size={10} strokeWidth={3} className="animate-pulse" /> <span className="text-[10px] leading-none mb-[1px]">{size}</span></div>;
                                     wrapperClass = 'opacity-90 hover:opacity-100';
                                 }
                             } else if (isReturned) {
                                 colorClassTop = 'bg-rose-500 text-white';
                                 colorClassBottom = 'bg-rose-50 text-rose-700';
                                 topContent = <div className="flex items-center gap-[2px]"><RotateCcw size={10} strokeWidth={3} /> <span className="text-[10px] leading-none mb-[1px]">{size}</span></div>;
                                 wrapperClass = 'opacity-90 hover:opacity-100';
                             } else if (isReceived) {
                                 colorClassTop = 'bg-indigo-600 text-white';
                                 colorClassBottom = 'bg-indigo-50 text-indigo-700';
                                 topContent = <div className="flex items-center gap-[2px]"><Check size={10} strokeWidth={3} /> <span className="text-[10px] leading-none mb-[1px]">{size}</span></div>;
                                 wrapperClass = 'opacity-100 hover:-translate-y-0.5 hover:shadow-sm';
                             } else if (isOrdered) {
                                 colorClassTop = 'bg-amber-500 text-white';
                                 colorClassBottom = 'bg-amber-50 text-amber-700';
                                 topContent = <div className="flex items-center gap-[2px]"><ShoppingBag size={10} strokeWidth={3} /> <span className="text-[10px] leading-none mb-[1px]">{size}</span></div>;
                                 wrapperClass = 'opacity-100 hover:-translate-y-0.5 hover:shadow-sm';
                             }

                             return (
                             <div 
                               key={size} 
                               className={`min-w-[44px] px-0.5 group/sizebtn text-center flex flex-col cursor-pointer transition-all relative ${wrapperClass}`}
                               onClick={(e) => { e.stopPropagation(); handleSizeClick(item, size, qty); }}
                               onContextMenu={(e) => { 
                                 e.preventDefault(); 
                                 e.stopPropagation(); 
                                 setContextMenu({ x: e.clientX, y: e.clientY, item, size, qty }); 
                               }}
                               title={isPacked ? "Packed in shipments." : isCompleted ? `Completed. Right-click to manage.` : inProgress ? (inProgress.paused ? "Timer paused. Right-click to resume!" : "Timer running. Click to complete!") : (isReturned ? "Marked for return. Right-click to manage." : (isReceived ? "Click to start timer" : (isOrdered ? "Ordered. Click to mark as received" : "Click to mark as received")))}
                             >
                               {/* Hover hints */}
                               {isReturned && (
                                 <div className="absolute inset-0 bg-brand-primary/5 backdrop-blur-[1px] opacity-0 group-hover/sizebtn:opacity-100 transition-opacity z-10 flex flex-col items-center justify-center rounded-[8px] pointer-events-none">
                                    <RotateCcw size={20} className="text-brand-primary drop-shadow-md" strokeWidth={3} />
                                 </div>
                               )}
                               {!isReturned && !isReceived && !isCompleted && !isPacked && !inProgress && !isOrdered && (
                                 <div className="absolute inset-0 bg-brand-primary/5 backdrop-blur-[1px] opacity-0 group-hover/sizebtn:opacity-100 transition-opacity z-10 flex flex-col items-center justify-center rounded-[8px] pointer-events-none">
                                    <Check size={20} className="text-brand-primary drop-shadow-md" strokeWidth={3} />
                                 </div>
                               )}
                               {!isReturned && isReceived && !isCompleted && !isPacked && !inProgress && (
                                 <div className="absolute inset-0 bg-brand-primary/5 backdrop-blur-[1px] opacity-0 group-hover/sizebtn:opacity-100 transition-opacity z-10 flex flex-col items-center justify-center rounded-[8px] pointer-events-none">
                                    <Clock size={20} className="text-brand-primary drop-shadow-md" strokeWidth={3} />
                                 </div>
                               )}
                               {!isCompleted && !isPacked && inProgress && !inProgress.paused && (
                                 <div className="absolute inset-0 bg-brand-primary/5 backdrop-blur-[1px] opacity-0 group-hover/sizebtn:opacity-100 transition-opacity z-10 flex flex-col items-center justify-center rounded-[8px] pointer-events-none">
                                    <Check size={20} className="text-brand-primary drop-shadow-md" strokeWidth={3} />
                                 </div>
                               )}
                               {!isCompleted && !isPacked && inProgress && inProgress.paused && (
                                 <div className="absolute inset-0 bg-brand-primary/5 backdrop-blur-[1px] opacity-0 group-hover/sizebtn:opacity-100 transition-opacity z-10 flex flex-col items-center justify-center rounded-[8px] pointer-events-none">
                                    <Play size={20} className="text-brand-primary drop-shadow-md" strokeWidth={3} />
                                 </div>
                               )}
                               {isOrdered && !isReceived && !isCompleted && !isPacked && !inProgress && (
                                 <div className="absolute inset-0 bg-brand-primary/5 backdrop-blur-[1px] opacity-0 group-hover/sizebtn:opacity-100 transition-opacity z-10 flex flex-col items-center justify-center rounded-[8px] pointer-events-none">
                                    <Check size={20} className="text-brand-primary drop-shadow-md" strokeWidth={3} />
                                 </div>
                               )}

                               <div className={`text-[10px] font-bold py-1.5 px-2 rounded-t-[8px] uppercase tracking-wide h-6 flex items-center justify-center transition-colors relative z-0 ${colorClassTop}`}>
                                  {topContent}
                               </div>
                               <div className={`text-[12px] font-bold py-2 px-2 rounded-b-[8px] h-8 flex flex-col items-center justify-center transition-colors relative z-0 ${colorClassBottom}`}>
                                 {qty}
                               </div>

                               {/* Stats Tooltip */}
                               {(isCompleted || isPacked) && item.sizeStats?.[size] && (
                                 <div className="absolute bottom-[110%] left-1/2 -translate-x-1/2 bg-black text-white text-[10px] py-1.5 px-2 rounded-lg opacity-0 group-hover/sizebtn:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-xl border border-neutral-700">
                                    <div className="font-bold">{Math.round(item.sizeStats[size].durationMs / 60000)}m Total</div>
                                    <div className="text-neutral-300 font-medium mt-0.5">{item.sizeStats[size].itemsPerHour}/hr Avg</div>
                                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-black"></div>
                                 </div>
                               )}
                             </div>
                           )})}
                         </div>

                         {/* Pricing Summary */}
                         <div className="flex items-stretch gap-[2px] bg-neutral-200 p-[3px] rounded-xl font-sans shrink-0">
                           {(() => {
                              const sizeQtySum = item.sizes ? Object.values(item.sizes).reduce((acc: number, val: any) => acc + (parseInt(val) || 0), 0) : 0;
                              const safeQty = item.qty ? parseInt(item.qty.toString().replace(/[^0-9]/g, '')) || 0 : sizeQtySum || 0;
                              
                              let safePriceNum = 0;
                              if (item.price !== undefined && item.price !== null) {
                                  const pString = item.price.toString().replace(/[^0-9.]/g, '');
                                  if (pString !== '') safePriceNum = parseFloat(pString);
                              }

                              let safeTotalStr = '-';
                              if (item.total && item.total !== '-') {
                                  let tString = item.total.toString().replace(/[^0-9.]/g, '');
                                  if (tString !== '' && !isNaN(parseFloat(tString))) { safeTotalStr = `$${parseFloat(tString).toFixed(2)}`; }
                              } else if (safeQty > 0 && safePriceNum > 0) {
                                  safeTotalStr = `$${(safeQty * safePriceNum).toFixed(2)}`;
                              }

                              return (
                                <>
                                  <div className="w-12 text-center flex flex-col overflow-hidden">
                                    <div className="bg-neutral-300 text-neutral-600 text-[10px] font-bold py-1.5 rounded-t-[8px] uppercase tracking-wide h-6 flex items-center justify-center">QTY</div>
                                    <div className="bg-neutral-50 text-neutral-800 text-[12px] font-bold py-2 rounded-b-[8px] h-8 flex items-center justify-center truncate px-1">
                                      {safeQty}
                                    </div>
                                  </div>
                                  {hasPermission('viewPricing') && (
                                    <>
                                      <div className="w-16 text-center flex flex-col overflow-hidden">
                                        <div className="bg-neutral-300 text-neutral-600 text-[10px] font-bold py-1.5 rounded-t-[8px] uppercase tracking-wide h-6 flex items-center justify-center">Price</div>
                                        <div className="bg-neutral-50 text-neutral-800 text-[12px] font-bold py-2 rounded-b-[8px] h-8 flex items-center justify-center truncate px-1">
                                          {safePriceNum > 0 ? `$${safePriceNum.toFixed(2)}` : (item.price || '-')}
                                        </div>
                                      </div>
                                      <div className="w-20 text-center flex flex-col overflow-hidden">
                                        <div className="bg-neutral-300 text-neutral-600 text-[10px] font-bold py-1.5 rounded-t-[8px] uppercase tracking-wide h-6 flex items-center justify-center">Total</div>
                                        <div className="bg-neutral-50 text-neutral-800 text-[12px] font-bold py-2 rounded-b-[8px] h-8 flex items-center justify-center truncate px-1">
                                          {safeTotalStr}
                                        </div>
                                      </div>
                                    </>
                                  )}
                                </>
                              );
                           })()}
                         </div>
                       </div>
                     </div>
                     
                   {/* Expanded Specs Dropdown Container */}
                   <div className={`grid transition-all duration-300 ease-in-out ${expandedSpecs[item.id] ? 'grid-rows-[1fr] opacity-100 mt-4' : 'grid-rows-[0fr] opacity-0 mt-0 pointer-events-none'}`}>
                      <div className="overflow-hidden">
                         <div className="flex flex-wrap gap-2 items-center bg-gray-50/80 p-3 pt-4 rounded-xl border border-brand-border shadow-inner">
                            {item.itemNum && <DataPill label="Item #" value={item.itemNum} />}
                            {item.color && <DataPill label="Garment Color" value={item.color} />}
                            {item.logos?.map((logo: string, i: number) => (
                              <DataPill key={i} label={`Logo ${i+1}`} value={logo} />
                            ))}
                            {item.artworks?.map((art: any, i: number) => {
                               if (!art?.url) return null;
                               return (
                                  <a key={`art-${i}`} href={art.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-brand-secondary hover:text-brand-primary transition-colors bg-white px-3 py-1.5 rounded-2xl border border-brand-border h-max my-auto shadow-sm">
                                     <Download size={10} /> {art.name || `${item.logos?.[i]?.replace(/\s+/g, '_') || 'VECTOR'}_Art`}
                                  </a>
                               );
                            })}
                             {(() => {
                                 const itemExpenses = order.costs?.filter((c: any) => getExpenseAllocation(c, item.id) > 0) || [];
                                 if (itemExpenses.length === 0) return null;
                                 
                                 const totalItemExpenses = itemExpenses.reduce((sum: number, c: any) => sum + getExpenseAllocation(c, item.id), 0);
                                
                                const sizeQtySum = item.sizes ? Object.values(item.sizes).reduce((acc: number, val: any) => acc + (parseInt(val) || 0), 0) : 0;
                                const safeQty = item.qty ? parseInt(item.qty.toString().replace(/[^0-9]/g, '')) || 0 : sizeQtySum || 0;
                                
                                let safePriceNum = 0;
                                if (item.price !== undefined && item.price !== null) {
                                    const pString = item.price.toString().replace(/[^0-9.]/g, '');
                                    if (pString !== '') safePriceNum = parseFloat(pString);
                                }
                                
                                const revenue = safeQty * safePriceNum;
                                const netProfit = revenue - totalItemExpenses;
                                const profitMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;
                                
                                return (
                                   <>
                                      <DataPill label="Garment Expenses" value={`$${totalItemExpenses.toFixed(2)}`} />
                                      {revenue > 0 && (
                                         <>
                                            <DataPill label="Garment Profit" value={`$${netProfit.toFixed(2)}`} />
                                            <DataPill label="Garment Margin" value={`${profitMargin.toFixed(1)}%`} />
                                         </>
                                      )}
                                   </>
                                );
                             })()}
                         </div>
                      </div>
                   </div>

                   {/* Expanded Boxes List - Spans Full Width */}
                     {expandedItems[item.id] && (() => {
                       const itemBoxes = order.boxes?.filter((b: any) => b.items?.some((bi: any) => String(bi.id) === String(item.id))) || [];
                       if (itemBoxes.length === 0) return null;
                       return (
                         <div className="w-full mt-6 pt-6 border-t border-brand-border/40 flex flex-col gap-3">
                           {itemBoxes.map((box: any) => {
                             const publicUrl = `${window.location.origin}/packing-slip/${order.id}/${box.id}`;
                             return (
                               <div key={box.id} className="bg-white rounded-xl border border-brand-border shadow-sm flex flex-col md:flex-row p-4 gap-4 md:items-center hover:border-brand-primary/20 transition-colors w-full relative z-20">
                                 
                                 <div className="flex items-center gap-4 min-w-[180px]">
                                   <div className="w-10 h-10 bg-neutral-100 rounded-lg flex items-center justify-center text-brand-primary shrink-0">
                                     <Box size={20} />
                                   </div>
                                   <div>
                                     <h3 className="font-bold text-sm text-brand-primary">{box.name}</h3>
                                     <p className="text-[10px] text-brand-secondary font-medium tracking-wide flex gap-1 items-center">
                                       <Printer size={10} /> {box.items?.reduce((acc: number, bi: any) => acc + (bi.qty || 0), 0) || 0} ITEMS TOTAL
                                     </p>
                                   </div>
                                 </div>
                                 
                                 <div className="flex-1 md:border-l border-brand-border md:pl-4 overflow-y-auto custom-scrollbar flex flex-col gap-1 md:pr-4">
                                     {box.items?.filter((bi: any) => String(bi.id) === String(item.id)).map((bi: any, i: number) => (
                                       <div key={i} className="flex flex-col xl:flex-row items-start xl:items-center py-2 gap-2 xl:gap-8 min-w-0 flex-1">
                                          <div className="flex flex-col items-start w-full xl:w-auto xl:min-w-[180px]">
                                             <div className="flex items-center justify-between w-full">
                                                <div className="flex items-center gap-2">
                                                   <span className="font-bold text-brand-primary text-sm truncate">{bi.style}</span>
                                                   {bi.shopifyOrder && (
                                                     <span className="text-[8px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
                                                       {bi.shopifyOrder}
                                                     </span>
                                                   )}
                                                </div>
                                                <span className="font-bold text-brand-secondary text-xs bg-neutral-100 px-2 py-1 rounded-md">x{bi.qty}</span>
                                             </div>
                                          </div>
                                          {bi.sizes && Object.keys(bi.sizes).length > 0 && (
                                             <div className="flex gap-1.5 flex-wrap w-full xl:flex-1">
                                                {Object.entries(bi.sizes).sort(([a],[b])=>sortSizes(a,b)).map(([s, q]: [string, any]) => (
                                                   <span key={s} className="text-xs font-bold text-brand-secondary bg-neutral-100 px-2.5 py-1.5 rounded-md border border-brand-border shadow-sm flex items-center justify-center min-w-[36px]">{s}: <span className="text-black ml-1">{q}</span></span>
                                                ))}
                                             </div>
                                          )}
                                       </div>
                                     ))}
                                    <p className="text-[10px] italic text-brand-secondary mt-1 max-w-[200px] leading-tight">
                                      {box.items?.length > 1 ? `(+ ${box.items.length - 1} other items inside)` : ''}
                                    </p>
                                 </div>
                                 
                                 <div className="flex flex-col sm:flex-row items-center gap-3 shrink-0">
                                   <div 
                                     className="bg-white p-1.5 border border-brand-border rounded shadow-sm cursor-pointer hover:border-black transition-colors" 
                                     title="Click to Print Thermal Label" 
                                     onClick={(e) => { e.stopPropagation(); window.open(`/print/label/${order.id}/${box.id}`, '_blank', 'width=600,height=800'); }}
                                   >
                                     <ReactQRCode value={publicUrl} size={36} />
                                   </div>
                                   <div className="flex flex-col gap-1.5 min-w-[100px]">
                                     {box.trackingCarrier && box.trackingCarrier !== 'Pickup' && box.trackingNumber && (
                                       <a href={getTrackingLink(box.trackingCarrier, box.trackingNumber) || '#'} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-brand-primary hover:text-black transition-colors whitespace-nowrap bg-neutral-50 hover:bg-neutral-100 px-3 py-1.5 rounded-full border border-neutral-200 w-full text-center">
                                         <Truck size={12} /> Track
                                       </a>
                                     )}
                                     <a href={publicUrl} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-brand-primary hover:text-black transition-colors tooltip whitespace-nowrap bg-neutral-50 hover:bg-neutral-100 px-3 py-1.5 rounded-full border border-neutral-200 w-full text-center" onClick={(e) => e.stopPropagation()}>
                                       <ExternalLink size={12} /> View Slip
                                     </a>
                                     <button onClick={(e) => { e.stopPropagation(); setTrackingBoxId(box.id); }} className={`flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors whitespace-nowrap px-3 py-1.5 rounded-full border border-neutral-200 w-full text-center ${box.trackingNumber || box.trackingCarrier ? 'bg-black text-white hover:bg-neutral-800 border-black' : 'text-brand-primary hover:text-black bg-neutral-50 hover:bg-neutral-100'}`}>
                                       <Truck size={12} /> {box.trackingNumber || box.trackingCarrier ? 'Edit Tracking' : 'Add Tracking'}
                                     </button>
                                   </div>
                                 </div>
                
                                 <button onClick={(e) => { e.stopPropagation(); handleDeleteBox(box.id); }} className="text-red-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors p-2 shrink-0 self-start sm:self-center ml-auto md:ml-0" title="Delete Box">
                                   <Trash2 size={16} />
                                 </button>
                
                               </div>
                             );
                           })}
                         </div>
                       );
                     })()}
                  </div>
               )) : (
                 <div className="p-6 text-center text-brand-secondary">No items found in this order.</div>
               )}
            </div>
          </div>

          {/* Production Assets Section */}
          {order.items?.some((item: any) => item.itemType === 'gang_sheet') && (
            <div className="bg-white p-6 rounded-card border border-brand-border shadow-sm mt-8">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6 pb-2 border-b border-brand-border">
                <div className="flex items-center gap-2">
                  <Printer className="text-brand-primary" size={22} />
                  <h2 className={tokens.typography.h2}>Production Assets</h2>
                </div>
                <div className="flex items-center gap-2.5">
                  <PillButton 
                    variant="outline" 
                    onClick={handleDownloadAllZip}
                    className="gap-2" 
                    disabled={isZipping || !order.items?.some((item: any) => item.printReadyUrl || item.cutReadyUrl)}
                  >
                    {isZipping ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                    Download All Sheets (ZIP)
                  </PillButton>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {order.items
                  ?.filter((item: any) => item.itemType === 'gang_sheet')
                  .map((item: any) => {
                    const isPrintReady = !!(item.printReadyUrl && item.cutReadyUrl);
                    const currentPreviewMode = previewMode[item.id] || 'print';
                    const activePreviewUrl = currentPreviewMode === 'print' ? (item.printReadyUrl || item.originalSheetUrl || item.image) : (item.cutReadyUrl || item.originalSheetUrl || item.image);

                     return (
                      <div key={item.id} className="bg-neutral-900 text-white rounded-2xl border border-neutral-800 p-5 flex flex-col gap-4 shadow-xl">
                        {/* Card Header */}
                        <div className="flex justify-between items-start gap-4">
                          <div>
                            <h3 className="font-bold text-sm text-neutral-100">{item.style || 'DTF Gang Sheet'}</h3>
                            <p className="text-[11px] font-semibold text-neutral-400 mt-0.5">
                              {item.sheetSizeName || 'DTF Gang Sheet'} • {item.sheetWidth}" x {item.sheetHeight}" • {item.quantity} {item.quantity === 1 ? 'Sheet' : 'Sheets'}
                            </p>
                          </div>
                          
                          <div className="flex flex-col items-end gap-1.5 shrink-0">
                            <div className="flex items-center gap-1.5">
                              {item.printed ? (
                                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-450 bg-emerald-950/80 border border-emerald-800 px-2 py-0.5 rounded shadow-sm flex items-center gap-0.5">
                                  <Check size={10} strokeWidth={3} /> Printed
                                </span>
                              ) : item.readyToPrint ? (
                                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400 bg-purple-950/80 border border-purple-800 px-2 py-0.5 rounded shadow-sm flex items-center gap-0.5 animate-pulse">
                                  <Printer size={10} /> Ready
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 bg-neutral-850 border border-neutral-700 px-2 py-0.5 rounded shadow-sm">
                                  Not Ready
                                </span>
                              )}

                              {isPrintReady ? (
                                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-455 bg-emerald-955/80 border border-emerald-850 px-2 py-0.5 rounded shadow-sm">
                                  Print Ready
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 bg-amber-955/80 border border-amber-850 px-2 py-0.5 rounded shadow-sm">
                                  Not Generated
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Preview Box */}
                        <div className="relative aspect-[3/4] w-full bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden flex items-center justify-center bg-checkerboard">
                          {activePreviewUrl ? (
                            <img 
                              src={activePreviewUrl} 
                              alt="Layout Preview" 
                              className="w-full h-full object-contain p-4 hover:scale-105 transition-transform duration-300 cursor-zoom-in"
                              onClick={() => setExpandedImage({ src: activePreviewUrl, alt: `${item.style} - ${currentPreviewMode}` })}
                            />
                          ) : (
                            <div className="flex flex-col items-center gap-2 text-neutral-500 text-center p-6">
                              <ImageIcon size={32} />
                              <span className="text-xs font-semibold">No Artwork Preview Available</span>
                            </div>
                          )}

                          {/* Layer Control Badge */}
                          {isPrintReady && (
                            <div className="absolute top-3 left-3 bg-neutral-900/90 border border-neutral-800 rounded-lg p-0.5 flex shadow-lg">
                              <button
                                onClick={() => setPreviewMode(prev => ({ ...prev, [item.id]: 'print' }))}
                                className={`text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded-md transition-all ${currentPreviewMode === 'print' ? 'bg-white text-black shadow-sm' : 'text-neutral-400 hover:text-white'}`}
                              >
                                Print
                              </button>
                              <button
                                onClick={() => setPreviewMode(prev => ({ ...prev, [item.id]: 'cut' }))}
                                className={`text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded-md transition-all ${currentPreviewMode === 'cut' ? 'bg-white text-black shadow-sm' : 'text-neutral-400 hover:text-white'}`}
                              >
                                Cut Line
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Actions Footer */}
                        <div className="flex flex-col gap-2 mt-auto">
                          <button
                            onClick={() => handleGeneratePrintFile(item)}
                            disabled={generatingItemId === item.id}
                            className="w-full bg-white hover:bg-neutral-100 text-black py-2.5 rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
                          >
                            {generatingItemId === item.id ? (
                              <>
                                <Loader2 size={14} className="animate-spin" />
                                <span>Generating Canvas...</span>
                              </>
                            ) : (
                              <>
                                <Sparkles size={14} />
                                <span>{isPrintReady ? 'Regenerate Production Files' : 'Generate Production Files'}</span>
                              </>
                            )}
                          </button>
                          <div className="grid grid-cols-2 gap-2">
                            <a
                              href={item.printReadyUrl || '#'}
                              target="_blank"
                              rel="noreferrer"
                              className={`flex items-center justify-center gap-1.5 text-[11px] font-bold text-center border py-2 rounded-xl transition-all ${item.printReadyUrl ? 'border-neutral-800 text-neutral-300 bg-neutral-850 hover:bg-neutral-800 hover:text-white shadow-sm' : 'border-neutral-800/40 text-neutral-600 bg-neutral-900 pointer-events-none'}`}
                            >
                              <Download size={12} />
                              <span>Print PNG</span>
                            </a>
                            <a
                              href={item.cutReadyUrl || '#'}
                              target="_blank"
                              rel="noreferrer"
                              className={`flex items-center justify-center gap-1.5 text-[11px] font-bold text-center border py-2 rounded-xl transition-all ${item.cutReadyUrl ? 'border-neutral-800 text-neutral-300 bg-neutral-850 hover:bg-neutral-800 hover:text-white shadow-sm' : 'border-neutral-800/40 text-neutral-600 bg-neutral-900 pointer-events-none'}`}
                            >
                              <Download size={12} />
                              <span>Cut SVG</span>
                            </a>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-2 mt-1">
                            <button
                              onClick={() => handleToggleItemReadyToPrint(item.id)}
                              className={`flex items-center justify-center gap-1 text-[11px] font-bold text-center border py-2 rounded-xl transition-all cursor-pointer ${
                                item.readyToPrint
                                  ? 'border-purple-800 text-purple-300 bg-purple-950/40 hover:bg-purple-950 hover:text-white'
                                  : 'border-neutral-800 text-neutral-450 bg-neutral-900 hover:bg-neutral-850 hover:text-white'
                              }`}
                            >
                              <Printer size={12} />
                              <span>{item.readyToPrint ? 'Ready (Notified)' : 'Notify Printer'}</span>
                            </button>
                            <button
                              onClick={() => handleToggleItemPrinted(item.id)}
                              className={`flex items-center justify-center gap-1 text-[11px] font-bold text-center border py-2 rounded-xl transition-all cursor-pointer ${
                                item.printed
                                  ? 'border-emerald-800 text-emerald-300 bg-emerald-950/40 hover:bg-emerald-950 hover:text-white'
                                  : 'border-neutral-800 text-neutral-450 bg-neutral-900 hover:bg-neutral-850 hover:text-white'
                              }`}
                            >
                              <Check size={12} />
                              <span>{item.printed ? 'Printed (Reset)' : 'Mark Printed'}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
          
          <PackingSlipsManager order={order} onEditTracking={setTrackingBoxId} />
          
          {/* Costs & Receipts Tracker Section */}
          {hasPermission('viewPricing') && (
            <div className="bg-white p-6 rounded-card border border-brand-border shadow-sm mt-8">
             <div className="flex justify-between items-center mb-6 pb-2 border-b border-brand-border">
                <div className="flex items-center gap-2">
                   <DollarSign className="text-brand-primary animate-pulse" size={22} />
                   <h2 className={tokens.typography.h2}>Costs & Receipts</h2>
                </div>
             </div>
             
             {/* Financial metrics dashboard */}
             <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                {/* Est. Revenue */}
                <div className="bg-neutral-50 border border-brand-border p-4 rounded-xl shadow-sm">
                   <span className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary block mb-1">Est. Revenue</span>
                   <span className="text-xl font-black text-brand-primary">{totalFormatted}</span>
                </div>
                
                {/* Cost of Goods */}
                <div className="bg-red-50/50 border border-red-100 p-4 rounded-xl shadow-sm">
                   <span className="text-[10px] font-bold uppercase tracking-widest text-red-600 block mb-1">Cost of Goods (COGS)</span>
                   <span className="text-xl font-black text-red-700">${totalCosts.toFixed(2)}</span>
                </div>
                
                {/* Net Profit */}
                <div className={`border p-4 rounded-xl shadow-sm ${profit >= 0 ? 'bg-emerald-50/50 border-emerald-100' : 'bg-red-50/50 border-red-100'}`}>
                   <span className={`text-[10px] font-bold uppercase tracking-widest block mb-1 ${profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>Net Profit</span>
                   <span className={`text-xl font-black ${profit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>${profit.toFixed(2)}</span>
                </div>
                
                {/* Profit Margin */}
                <div className="bg-indigo-50/50 border border-indigo-100 p-4 rounded-xl shadow-sm">
                   <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-600 block mb-1">Profit Margin</span>
                   <span className="text-xl font-black text-indigo-700">{margin.toFixed(1)}%</span>
                </div>
             </div>
             
             {/* Form & Table Grid */}
             <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-6 border-t border-brand-border">
                {/* Left: Add Cost Form */}
                <div className="lg:col-span-4 space-y-4 border-b lg:border-b-0 lg:border-r border-brand-border pb-6 lg:pb-0 lg:pr-8">
                   <h3 className="text-xs uppercase font-extrabold tracking-widest text-brand-primary mb-3">Record Expense</h3>
                   
                   <div className="space-y-4">
                      <div>
                         <label className="block text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1.5">Description / Vendor</label>
                         <input 
                            type="text"
                            value={costDescription}
                            onChange={e => setCostDescription(e.target.value)}
                            placeholder="e.g. SanMar blank shirts purchase"
                            className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm focus:border-brand-primary focus:bg-white outline-none transition-colors font-medium"
                            required
                         />
                      </div>
                      
                      <div>
                         <label className="block text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1.5">Amount (USD)</label>
                         <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-secondary text-sm font-bold">$</span>
                            <input 
                               type="number"
                               step="0.01"
                               min="0"
                               value={costAmount}
                               onChange={e => setCostAmount(e.target.value)}
                               placeholder="0.00"
                               className="w-full bg-brand-bg border border-brand-border rounded-lg pl-7 pr-3 py-2 text-sm focus:border-brand-primary focus:bg-white outline-none transition-colors font-semibold"
                               required
                            />
                         </div>
                      </div>
                      
                      <div>
                          <label className="block text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1.5">Supplier Order # (Optional)</label>
                          <input 
                             type="text"
                             value={supplierOrderNumber}
                             onChange={e => setSupplierOrderNumber(e.target.value)}
                             placeholder="e.g. 1234567"
                             className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm focus:border-brand-primary focus:bg-white outline-none transition-colors font-medium"
                          />
                       </div>
                       
                       <div>
                          <label className="block text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1.5">Credit Card Used</label>
                          <input 
                             type="text"
                             value={costCardUsed}
                             onChange={e => setCostCardUsed(e.target.value)}
                             placeholder="e.g. Amex 4002"
                             className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm focus:border-brand-primary focus:bg-white outline-none transition-colors font-medium"
                             required
                          />
                       </div>

                        <div>
                           <label className="block text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-2">Connect to Garments (Optional)</label>
                           <div className="space-y-3 bg-neutral-50/50 border border-brand-border/60 p-3 rounded-lg max-h-[260px] overflow-y-auto custom-scrollbar">
                              {order.items?.map((item: any) => {
                                 const isConnected = !!selectedCostItems[item.id];
                                 const itemSelectedSizes = selectedCostItems[item.id] || [];
                                 const sizes = Object.entries(item.sizes || {})
                                    .filter(([_, qty]: [string, any]) => (parseInt(qty) || 0) > 0)
                                    .map(([sz]) => sz)
                                    .sort((a, b) => sortSizes(a, b));
                                 
                                 return (
                                    <div key={item.id} className="border-b border-brand-border/40 last:border-b-0 pb-3 last:pb-0">
                                       <div className="flex items-center gap-2">
                                          <input 
                                             type="checkbox"
                                             id={`form-link-${item.id}`}
                                             checked={isConnected}
                                             onChange={(e) => {
                                                if (e.target.checked) {
                                                   setSelectedCostItems(prev => ({ ...prev, [item.id]: [] }));
                                                } else {
                                                   setSelectedCostItems(prev => {
                                                      const copy = { ...prev };
                                                      delete copy[item.id];
                                                      return copy;
                                                   });
                                                }
                                             }}
                                             className="rounded border-brand-border text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                                          />
                                          {item.image && (
                                             <div 
                                                onClick={() => setExpandedImage({ src: item.image, alt: item.style })}
                                                title="Click to view full screen"
                                                className="w-7 h-7 rounded bg-neutral-100 border border-brand-border flex items-center justify-center shrink-0 cursor-pointer shadow-sm overflow-hidden"
                                             >
                                                <img src={item.image} alt={item.style} className="w-full h-full object-contain p-0.5 mix-blend-multiply pointer-events-none" />
                                             </div>
                                          )}
                                          <label htmlFor={`form-link-${item.id}`} className="text-[11px] font-bold text-brand-primary cursor-pointer flex-1 select-none truncate">
                                             {item.style} {item.gender && item.gender !== 'Unisex' ? `(${item.gender})` : ''} {item.color ? `- ${item.color}` : ''}
                                          </label>
                                       </div>
                                       
                                       {isConnected && sizes.length > 0 && (
                                          <div className="mt-2 pl-6 flex flex-wrap gap-1 items-center">
                                             <span className="text-[9px] font-extrabold uppercase tracking-widest text-brand-secondary mr-1">Sizes:</span>
                                             {sizes.map((sz: string) => {
                                                const isSzSelected = itemSelectedSizes.includes(sz);
                                                return (
                                                   <button
                                                      key={sz}
                                                      type="button"
                                                      onClick={() => {
                                                         setSelectedCostItems(prev => {
                                                            const currentSizes = prev[item.id] || [];
                                                            const nextSizes = currentSizes.includes(sz)
                                                               ? currentSizes.filter(s => s !== sz)
                                                               : [...currentSizes, sz];
                                                            return { ...prev, [item.id]: nextSizes };
                                                         });
                                                      }}
                                                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide border transition-all ${
                                                         isSzSelected
                                                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                                                            : 'bg-white border-brand-border text-brand-secondary hover:border-brand-primary hover:text-brand-primary'
                                                      }`}
                                                   >
                                                      {sz} ({item.sizes[sz]})
                                                   </button>
                                                );
                                             })}
                                          </div>
                                       )}
                                    </div>
                                 );
                              })}
                           </div>
                        </div>
                       
                       <div>
                         <label className="block text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1.5">Receipt Attachment (Optional)</label>
                         <div className="flex items-center gap-3">
                            <label htmlFor="receipt-upload" className="flex items-center gap-2 px-3 py-2 border border-brand-border rounded-lg text-xs font-bold text-brand-secondary hover:text-brand-primary hover:border-brand-primary bg-white cursor-pointer transition-colors shadow-sm select-none">
                               {isUploadingReceipt ? (
                                  <Loader2 size={14} className="animate-spin text-brand-primary" />
                               ) : <Upload size={14} />}
                               <span>{receiptUrl ? 'Change Receipt' : 'Upload Receipt'}</span>
                            </label>
                            <input 
                               type="file"
                               id="receipt-upload"
                               accept="image/*,.pdf,application/pdf"
                               onChange={handleReceiptFileChange}
                               className="hidden"
                               disabled={isUploadingReceipt}
                            />
                            {receiptName && (
                               <div className="flex items-center gap-1.5 text-xs text-brand-secondary bg-neutral-100 border border-brand-border px-2.5 py-1 rounded-md max-w-[150px] truncate" title={receiptName}>
                                  <span className="truncate">{receiptName}</span>
                                  <button type="button" onClick={() => { setReceiptUrl(''); setReceiptName(''); }} className="text-red-500 hover:text-red-700 ml-1 shrink-0">
                                     <X size={12} strokeWidth={3} />
                                  </button>
                                </div>
                            )}
                         </div>
                      </div>
                      
                      <button
                         type="button"
                         onClick={handleAddCostSubmit}
                         disabled={isUploadingReceipt || !costDescription.trim() || !costAmount || !costCardUsed.trim()}
                         className="w-full mt-4 py-2.5 bg-black text-white hover:bg-neutral-800 text-xs font-bold uppercase tracking-widest transition-all rounded-lg flex items-center justify-center gap-2 shadow-sm border border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                         <Plus size={14} /> Add Expense
                      </button>
                   </div>
                </div>
                
                {/* Right: Costs List */}
                <div className="lg:col-span-8 space-y-4">
                   <h3 className="text-xs uppercase font-extrabold tracking-widest text-brand-primary mb-3">Recorded Expenses</h3>
                   
                   {orderCosts.length === 0 ? (
                      <div className="text-center text-brand-secondary py-12 bg-brand-bg rounded-xl border border-dashed border-brand-border flex flex-col items-center justify-center gap-2">
                         <CreditCard size={28} className="opacity-30 text-brand-primary" />
                         <span className="text-sm font-bold text-brand-primary">No expenses recorded yet</span>
                         <span className="text-xs text-brand-secondary">Add materials, blanks, or other costs on the left to track profitability.</span>
                      </div>
                   ) : (
                      <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                          {orderCosts.map((cost: any) => {
                             const connections = cost.itemConnections || (cost.itemId ? { [cost.itemId]: cost.linkedSizes || [] } : {});
                             const connectedItemIds = Object.keys(connections);
                             
                             return (
                                <div key={cost.id} className="flex flex-col p-4 bg-white hover:bg-brand-bg/40 border border-brand-border rounded-xl transition-all shadow-sm gap-3">
                                   <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                                      <div className="flex-1 min-w-0">
                                         <h4 className="font-bold text-sm text-brand-primary truncate">{cost.description}</h4>
                                         <div className="flex items-center gap-3 mt-1.5 text-xs text-brand-secondary flex-wrap">
                                            <span className="flex items-center gap-1 font-semibold text-[11px] text-brand-primary bg-neutral-100 border border-brand-border px-2 py-0.5 rounded-md">
                                               <CreditCard size={10} /> {cost.cardUsed}
                                            </span>
                                            {cost.supplierOrderNumber && (
                                               <span className="font-semibold text-[11px] text-brand-primary bg-neutral-100 border border-brand-border px-2 py-0.5 rounded-md">
                                                  PO/Order: {cost.supplierOrderNumber}
                                               </span>
                                            )}
                                            
                                            <span>{new Date(cost.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                            {cost.receiptUrl && (
                                               <>
                                                  <span className="text-brand-border/60">•</span>
                                                  <a 
                                                     href={cost.receiptUrl} 
                                                     target="_blank" 
                                                     rel="noreferrer" 
                                                     className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition-colors"
                                                  >
                                                     <Download size={10} strokeWidth={3} /> View Receipt
                                                  </a>
                                               </>
                                            )}
                                         </div>
                                      </div>
                                      
                                      <div className="flex items-center gap-4 self-end sm:self-center shrink-0">
                                         <span className="font-serif text-lg font-bold text-brand-primary">${parseFloat(cost.amount).toFixed(2)}</span>
                                         <button 
                                            onClick={() => handleDeleteCost(cost.id)} 
                                            className="p-1.5 text-brand-secondary hover:text-red-500 hover:bg-red-50 transition-all rounded-lg border border-transparent hover:border-red-100"
                                            title="Delete Expense"
                                         >
                                            <Trash2 size={15} />
                                         </button>
                                      </div>
                                   </div>

                                   {/* Connected Garments Section */}
                                   <div className="border-t border-brand-border/40 pt-3 mt-1 space-y-3">
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                         <span className="text-[10px] font-extrabold uppercase tracking-widest text-brand-secondary">Linked Garments & Sizes:</span>
                                         
                                         {/* + Link Garment Dropdown */}
                                         {(() => {
                                            const unconnectedItems = order.items?.filter((item: any) => !connections[item.id]) || [];
                                            if (unconnectedItems.length === 0) return null;
                                            return (
                                               <select
                                                  value=""
                                                  onChange={async (e) => {
                                                     const selectedId = e.target.value;
                                                     if (!selectedId) return;
                                                     const newConnections = { ...connections, [selectedId]: [] };
                                                     const newCosts = (order.costs || []).map((c: any) => 
                                                        c.id === cost.id ? { ...c, itemConnections: newConnections, itemId: null, linkedSizes: null } : c
                                                     );
                                                     await updateDoc(doc(db, 'orders', order.id), { costs: newCosts });
                                                  }}
                                                  className="bg-neutral-50 hover:bg-neutral-100 text-[10px] font-bold uppercase tracking-wider text-brand-secondary border border-brand-border rounded px-2 py-1 outline-none transition-colors max-w-[180px] truncate"
                                               >
                                                  <option value="">+ Link Garment...</option>
                                                  {unconnectedItems.map((item: any) => (
                                                     <option key={item.id} value={item.id}>
                                                        {item.style} {item.color ? `(${item.color})` : ''}
                                                     </option>
                                                  ))}
                                               </select>
                                            );
                                         })()}
                                      </div>

                                      {connectedItemIds.length === 0 ? (
                                         <div className="text-[11px] text-brand-secondary italic">No garments linked to this receipt yet.</div>
                                      ) : (
                                         <div className="space-y-2.5">
                                            {connectedItemIds.map((itemId) => {
                                               const matchedItem = order.items?.find((i: any) => i.id === itemId);
                                               if (!matchedItem) return null;

                                               const linkedSizes = connections[itemId] || [];
                                               const sizes = Object.entries(matchedItem.sizes || {})
                                                  .filter(([_, qty]: [string, any]) => (parseInt(qty) || 0) > 0)
                                                  .map(([sz]) => sz)
                                                  .sort((a, b) => sortSizes(a, b));

                                               return (
                                                  <div key={itemId} className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-neutral-50/50 border border-brand-border/60 p-2.5 rounded-lg">
                                                     <div className="flex items-center gap-2.5 min-w-0">
                                                        {matchedItem.image && (
                                                           <div 
                                                              onClick={() => setExpandedImage({ src: matchedItem.image, alt: matchedItem.style })}
                                                              title="Click to view full screen"
                                                              className="w-7 h-7 rounded bg-white border border-brand-border flex items-center justify-center shrink-0 cursor-pointer shadow-sm overflow-hidden hover:scale-[1.05] transition-transform"
                                                           >
                                                              <img src={matchedItem.image} alt={matchedItem.style} className="w-full h-full object-contain p-0.5 mix-blend-multiply pointer-events-none" />
                                                           </div>
                                                        )}
                                                        <div className="min-w-0">
                                                           <div className="text-[11px] font-bold text-brand-primary truncate">
                                                              {matchedItem.style} {matchedItem.gender && matchedItem.gender !== 'Unisex' ? `(${matchedItem.gender})` : ''}
                                                           </div>
                                                           {matchedItem.color && (
                                                              <div className="text-[9px] font-semibold text-brand-secondary truncate">
                                                                 {matchedItem.color}
                                                              </div>
                                                           )}
                                                        </div>
                                                     </div>

                                                     {/* Active Size Toggle Pills */}
                                                     <div className="flex flex-wrap items-center gap-1.5 flex-1 md:justify-end">
                                                        {sizes.length > 0 ? (
                                                           sizes.map((sz: string) => {
                                                              const isExplicitlyLinked = linkedSizes.includes(sz);
                                                              const hasSelection = linkedSizes.length > 0;

                                                              return (
                                                                 <button
                                                                    key={sz}
                                                                    type="button"
                                                                    onClick={async () => {
                                                                       let newSizes = [...linkedSizes];
                                                                       if (isExplicitlyLinked) {
                                                                          newSizes = newSizes.filter(s => s !== sz);
                                                                       } else {
                                                                          newSizes = [...newSizes, sz];
                                                                       }
                                                                       const newConnections = { ...connections, [itemId]: newSizes };
                                                                       const newCosts = (order.costs || []).map((c: any) => 
                                                                          c.id === cost.id ? { ...c, itemConnections: newConnections, itemId: null, linkedSizes: null } : c
                                                                       );
                                                                       await updateDoc(doc(db, 'orders', order.id), { costs: newCosts });
                                                                    }}
                                                                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide border transition-all ${
                                                                       isExplicitlyLinked 
                                                                          ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                                                                          : !hasSelection
                                                                             ? 'bg-indigo-50 border-indigo-100 text-indigo-700 hover:bg-indigo-100' 
                                                                             : 'bg-white border-brand-border text-brand-secondary hover:border-brand-primary hover:text-brand-primary'
                                                                    }`}
                                                                    title={isExplicitlyLinked ? `Linked to size ${sz}. Click to unlink.` : `Not explicitly linked. Click to link.`}
                                                                 >
                                                                    {sz} ({matchedItem.sizes[sz]})
                                                                 </button>
                                                              );
                                                           })
                                                        ) : (
                                                           <span className="text-[9px] text-brand-secondary italic">No sizes available</span>
                                                        )}

                                                        <span className="text-brand-border/60 mx-1 hidden md:inline">|</span>

                                                        {/* Unlink button */}
                                                        <button
                                                           type="button"
                                                           onClick={async () => {
                                                              const newConnections = { ...connections };
                                                              delete newConnections[itemId];
                                                              const newCosts = (order.costs || []).map((c: any) => 
                                                                 c.id === cost.id ? { ...c, itemConnections: newConnections, itemId: null, linkedSizes: null } : c
                                                              );
                                                              await updateDoc(doc(db, 'orders', order.id), { costs: newCosts });
                                                           }}
                                                           className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                                                           title={`Disconnect ${matchedItem.style} from this expense`}
                                                        >
                                                           <X size={13} strokeWidth={2.5} />
                                                        </button>
                                                     </div>
                                                  </div>
                                               );
                                            })}
                                         </div>
                                      )}
                                   </div>
                                </div>
                             );
                          })}
                      </div>
                   )}
                </div>
             </div>
          </div>
          )}
          
          {/* Bottom Grid: Team and Activity Feed */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="md:col-span-1">
              {/* Team Assignment */}
              <div className="bg-white p-6 rounded-card border border-brand-border shadow-sm h-full flex flex-col">
                <div className="flex justify-between items-center mb-4">
                  <h3 className={tokens.typography.h3}>Team</h3>
                  <button onClick={() => setIsTeamModalOpen(true)} className="text-brand-secondary hover:text-brand-primary tooltip"><Users size={16} /><span className="tooltiptext">Add Member</span></button>
                </div>
                <div className="space-y-3 flex-1">
                  {(() => {
                    const manualTeamMembers = order?.team || [];
                    const combinedMap = new Map();
                    manualTeamMembers.forEach((m: any) => combinedMap.set(m.id, m));
                    timelineMembers.forEach((m: any) => {
                       if (!combinedMap.has(m.id)) {
                          combinedMap.set(m.id, { ...m, isAutoAssigned: true });
                       }
                    });
                    const mergedTeam = Array.from(combinedMap.values());
                    
                    if (mergedTeam.length === 0) {
                      return (
                        <div className="text-sm text-brand-secondary text-center py-4 bg-brand-bg rounded-xl border border-dashed border-brand-border">
                          No team members assigned.
                        </div>
                      );
                    }
                    
                    return mergedTeam.map((member: any) => (
                      <div key={member.id} className="group flex justify-between items-center p-2 hover:bg-brand-bg rounded-lg transition-colors cursor-pointer border border-transparent hover:border-brand-border">
                         <div className="flex items-center gap-3">
                           <div className={`w-8 h-8 rounded-full text-white text-xs font-bold flex items-center justify-center shrink-0 ${member.isAutoAssigned ? 'bg-cyan-600' : 'bg-brand-primary'}`}>
                             {member.initials}
                           </div>
                           <div>
                              <p className="text-sm font-medium truncate max-w-[120px]">{member.name}</p>
                              <div className="flex gap-2 items-center">
                                <p className="text-[10px] text-brand-secondary uppercase tracking-widest">{member.role}</p>
                                {member.isAutoAssigned && <span className="text-[8px] bg-cyan-50 border border-cyan-200 text-cyan-700 px-1 py-[1px] rounded font-bold uppercase tracking-widest leading-none">Timeline</span>}
                              </div>
                           </div>
                         </div>
                         {!member.isAutoAssigned && (
                           <button onClick={(e) => { e.stopPropagation(); handleRemoveTeamMember(member.id); }} className="opacity-0 group-hover:opacity-100 p-1.5 text-brand-secondary hover:text-red-500 transition-all rounded">
                             <X size={14} />
                           </button>
                         )}
                      </div>
                    ));
                  })()}
                </div>
                 <button onClick={() => setIsTeamModalOpen(true)} className="w-full mt-4 py-2 text-xs font-bold uppercase tracking-widest text-brand-secondary hover:text-brand-primary border border-brand-border hover:border-brand-primary transition-all rounded-lg flex items-center justify-center gap-2">
                    <Plus size={14} /> Assign
                 </button>
              </div>
            </div>

            <div className="md:col-span-1">
              {/* Activity Feed */}
              <div className="bg-white p-6 rounded-card border border-brand-border shadow-sm flex flex-col h-full">
                <div className="flex items-center justify-between gap-4 mb-6">
                  <div className="flex items-center gap-2">
                    <Clock className="text-brand-primary" size={20} />
                    <h3 className={tokens.typography.h3}>Activity</h3>
                  </div>
                  <div className="flex bg-neutral-100 p-1 rounded-lg">
                    <button 
                      onClick={() => { setActivityFilter('all'); setActivityLimit(3); }} 
                      className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${activityFilter === 'all' ? 'bg-white shadow-sm text-brand-primary' : 'text-brand-secondary hover:text-brand-primary'}`}
                    >
                      All
                    </button>
                    <button 
                      onClick={() => { setActivityFilter('performance'); setActivityLimit(10); }} 
                      className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${activityFilter === 'performance' ? 'bg-white shadow-sm text-brand-primary' : 'text-brand-secondary hover:text-brand-primary'}`}
                    >
                      Performance
                    </button>
                    <button 
                      onClick={() => { setActivityFilter('metrics'); }} 
                      className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${activityFilter === 'metrics' ? 'bg-white shadow-sm text-brand-primary' : 'text-brand-secondary hover:text-brand-primary'}`}
                    >
                      Metrics
                    </button>
                  </div>
                </div>
            
            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar min-h-[150px]">
                {(() => {
                  if (activityFilter === 'metrics') {
                     const metricsOrder = order;
                     const statsByUser: Record<string, { totalTimeMins: number, garmentsCompleted: number, completionsCount: number }> = {};
                     const bestDisplayNames: Record<string, string> = {};

                     let globalTotalGarmentsCompletedWithStats = 0;
                     let globalTotalTimeMins = 0;
                     let totalOrderGarments = 0;
                     let trueTotalGarmentsCompleted = 0; // The actual count regardless of attached stat metrics
                     let trueTotalTimeMins = 0;
                     let trueTotalGarmentsCompletedWithStats = 0;

                     (metricsOrder.items || []).forEach((item: any) => {
                        if (item.sizes) {
                            Object.values(item.sizes).forEach((q: any) => {
                                totalOrderGarments += (parseInt(q as string) || 0);
                            });
                        }

                        const completed = item.completedSizes || [];
                        completed.forEach((size: string) => {
                           const qty = parseInt(item.sizes?.[size]) || 0;
                           trueTotalGarmentsCompleted += qty;

                           const stat = item.sizeStats?.[size];
                           if (stat) {
                           const durationMs = stat.durationMs || 0;
                           trueTotalTimeMins += durationMs / 60000;
                           trueTotalGarmentsCompletedWithStats += qty;

                           let userName = stat.user?.split('@')[0] || stat.user;
                           
                           const actMatch = (metricsOrder.activities || []).find((a: any) =>
                               a.message?.startsWith('Completed') && a.message?.includes(`x ${size} for ${item.style}`)
                           );

                           if (!userName) {
                               userName = actMatch?.user?.split('@')[0] || actMatch?.user || 'Unknown';
                           }

                           if (metricsTimeFilter !== 'All') {
                               const statTimeStr = stat.timestamp || actMatch?.timestamp;
                               if (statTimeStr) {
                                   const statDate = new Date(statTimeStr);
                                   const now = new Date();
                                   const isToday = statDate.getDate() === now.getDate() && statDate.getMonth() === now.getMonth() && statDate.getFullYear() === now.getFullYear();
                                   
                                   const yesterday = new Date(now);
                                   yesterday.setDate(yesterday.getDate() - 1);
                                   const isYesterday = statDate.getDate() === yesterday.getDate() && statDate.getMonth() === yesterday.getMonth() && statDate.getFullYear() === yesterday.getFullYear();
                                   
                                   if (metricsTimeFilter === 'Today' && !isToday) return;
                                   if (metricsTimeFilter === 'Yesterday' && !isYesterday) return;
                                   if (metricsTimeFilter !== 'All' && metricsTimeFilter !== 'Today' && metricsTimeFilter !== 'Yesterday') {
                                       const lYear = statDate.getFullYear();
                                       const lMonth = String(statDate.getMonth() + 1).padStart(2, '0');
                                       const lDay = String(statDate.getDate()).padStart(2, '0');
                                       const statDateString = `${lYear}-${lMonth}-${lDay}`;
                                       if (statDateString !== metricsTimeFilter) return;
                                   }
                               } else {
                                   return; 
                               }
                           }

                               let rawName = normalizeUser(userName, allUsers);
                               const groupKey = rawName.toLowerCase().replace(/[^a-z]/g, '') || 'unknown';

                               if (!bestDisplayNames[groupKey]) {
                                  bestDisplayNames[groupKey] = rawName;
                               } else if (rawName.includes(' ') && !bestDisplayNames[groupKey].includes(' ')) {
                                  bestDisplayNames[groupKey] = rawName;
                               } else if (rawName.length > bestDisplayNames[groupKey].length && rawName !== rawName.toLowerCase()) {
                                  bestDisplayNames[groupKey] = rawName;
                               }

                               const timeMins = durationMs / 60000;

                               if (!statsByUser[groupKey]) {
                                  statsByUser[groupKey] = { totalTimeMins: 0, garmentsCompleted: 0, completionsCount: 0 };
                               }
                               statsByUser[groupKey].totalTimeMins += timeMins;
                               statsByUser[groupKey].garmentsCompleted += qty;
                               statsByUser[groupKey].completionsCount += 1;

                               globalTotalGarmentsCompletedWithStats += qty;
                               globalTotalTimeMins += timeMins;
                           }
                        });
                     });

                     const users = Object.keys(statsByUser).sort((a,b) => statsByUser[b].garmentsCompleted - statsByUser[a].garmentsCompleted);

                     if (users.length === 0) {
                       return <div className="text-xs text-brand-secondary text-center py-6">No performance metrics recorded yet for this order. Complete an item to see predictions.</div>;
                     }

                     const remainingGarments = Math.max(0, totalOrderGarments - trueTotalGarmentsCompleted);
                     const globalAvgMinsPerGarment = globalTotalGarmentsCompletedWithStats > 0 ? (globalTotalTimeMins / globalTotalGarmentsCompletedWithStats) : 0;
                     const estimatedRemainingMins = remainingGarments * globalAvgMinsPerGarment;
                     
                     let businessHoursRemaining = 0;
                     let hasTargetDate = false;
                     if (metricsOrder.targetCompletionDate) {
                         hasTargetDate = true;
                         const tDate = new Date(metricsOrder.targetCompletionDate);
                         const now = new Date();
                         if (tDate > now) {
                             let current = new Date(now);
                             let bMins = 0;
                             while (current < tDate) {
                                 if (current.getDay() !== 0 && current.getDay() !== 6) {
                                     const h = current.getHours();
                                     if (h >= 9 && h < 17) {
                                         bMins++;
                                     }
                                 }
                                 current.setTime(current.getTime() + 60000);
                             }
                             businessHoursRemaining = Math.round(bMins / 60);
                         }
                     }

                     let efficiencyMessage = null;
                     const activeTargetAvgMins = metricsOrder.targetAvgMinsPerGarment;
                     
                     if (remainingGarments === 0 && activeTargetAvgMins && trueTotalGarmentsCompletedWithStats > 0) {
                         const trueOverallAvg = trueTotalTimeMins / trueTotalGarmentsCompletedWithStats;
                         const projectedFinalMins = trueOverallAvg * totalOrderGarments;
                         const targetFinalMins = activeTargetAvgMins * totalOrderGarments;
                         const savedMins = targetFinalMins - projectedFinalMins;
                         
                         if (Math.abs(savedMins) >= 1) {
                             const h = Math.abs(savedMins) / 60;
                             const timeStr = h >= 1 ? `${h.toFixed(1)}h` : `${Math.round(Math.abs(savedMins))}m`;
                             efficiencyMessage = savedMins > 0 
                                 ? `Finished ${timeStr} ahead of schedule!` 
                                 : `Ran ${timeStr} behind schedule.`;
                         } else {
                             efficiencyMessage = "Finished exactly on schedule!";
                         }
                     }

                     return (
                       <div className="space-y-6">
                         {/* Predictive Metrics Banner */}
                         <div className="bg-gradient-to-br from-brand-primary/5 to-brand-primary/10 border border-brand-primary/20 rounded-xl p-5 shadow-sm text-brand-primary">
                             <div className="flex flex-wrap items-center justify-between mb-3 border-b border-brand-primary/10 pb-3 gap-3">
                                <div className="flex flex-wrap items-center gap-4">
                                  <div className="flex items-center gap-2 shrink-0">
                                    <Clock size={16} />
                                    <h4 className="font-bold uppercase tracking-wider text-[11px]">AI Production Forecast</h4>
                                  </div>
                                  <div className="flex items-stretch bg-white/50 p-1 rounded-lg shrink-0 overflow-x-auto no-scrollbar gap-0.5">
                                    <button onClick={() => setMetricsTimeFilter('All')} className={`px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded transition-all ${metricsTimeFilter === 'All' ? 'bg-brand-primary text-white shadow-sm' : 'text-brand-secondary hover:text-brand-primary'}`}>All Time</button>
                                    <button onClick={() => setMetricsTimeFilter('Today')} className={`px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded transition-all ${metricsTimeFilter === 'Today' ? 'bg-brand-primary text-white shadow-sm' : 'text-brand-secondary hover:text-brand-primary'}`}>Today</button>
                                    <input 
                                      type="date" 
                                      value={(metricsTimeFilter !== 'All' && metricsTimeFilter !== 'Today' && metricsTimeFilter !== 'Yesterday') ? metricsTimeFilter : ''}
                                      onChange={(e) => {
                                         if (e.target.value) setMetricsTimeFilter(e.target.value);
                                         else setMetricsTimeFilter('All');
                                      }}
                                      onClick={(e) => { try { (e.target as any).showPicker(); } catch(err){ } }}
                                      className={`px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded transition-all outline-none cursor-pointer w-auto ${(metricsTimeFilter !== 'All' && metricsTimeFilter !== 'Today' && metricsTimeFilter !== 'Yesterday') ? 'bg-brand-primary text-white shadow-sm' : 'bg-transparent text-brand-secondary hover:text-brand-primary cursor-pointer'}`}
                                    />
                                  </div>
                                </div>
                                <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2 shrink-0 mt-2 sm:mt-0">
                                   {editingTargetId === metricsOrder.id ? (
                                      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-brand-primary/80 bg-white/50 px-2 py-1 rounded-md border border-brand-primary/10 w-full sm:w-auto">
                                         <span>Expected / Garment:</span>
                                         <input
                                           type="number"
                                           step="0.1"
                                           value={targetInput}
                                           onChange={e => setTargetInput(e.target.value)}
                                           className="w-16 px-2 py-0.5 text-xs text-brand-primary font-bold border border-brand-primary/40 rounded bg-white outline-none ml-1"
                                           placeholder="Mins"
                                           autoFocus
                                         />
                                         <button onClick={() => handleSaveTarget(metricsOrder.id)} className="text-[10px] font-bold uppercase bg-brand-primary text-white px-2 py-1 rounded ml-1">Save</button>
                                         <button onClick={() => setEditingTargetId(null)} className="text-brand-secondary hover:text-brand-primary"><X size={14} /></button>
                                      </div>
                                   ) : (
                                      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-brand-primary/80 bg-white/50 px-2 py-1 rounded-md border border-brand-primary/10">
                                         <span>Expected / Garment: {metricsOrder.targetAvgMinsPerGarment ? `${metricsOrder.targetAvgMinsPerGarment}m` : 'Not Set'}</span>
                                         <button onClick={() => { setTargetInput(metricsOrder.targetAvgMinsPerGarment?.toString() || ''); setEditingTargetId(metricsOrder.id); }} className="hover:text-brand-primary text-brand-secondary underline decoration-brand-border underline-offset-2">Edit</button>
                                      </div>
                                   )}

                                   {editingTargetDateId === metricsOrder.id ? (
                                      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-brand-primary/80 bg-white/50 px-2 py-1 rounded-md border border-brand-primary/10 w-full sm:w-auto">
                                         <span>Deadline:</span>
                                         <input
                                           type="datetime-local"
                                           value={targetDateInput}
                                           onChange={e => setTargetDateInput(e.target.value)}
                                           className="px-2 py-0.5 text-xs text-brand-primary font-bold border border-brand-primary/40 rounded bg-white outline-none ml-1"
                                           autoFocus
                                         />
                                         <button onClick={() => handleSaveTargetDate(metricsOrder.id)} className="text-[10px] font-bold uppercase bg-brand-primary text-white px-2 py-1 rounded ml-1">Save</button>
                                         <button onClick={() => setEditingTargetDateId(null)} className="text-brand-secondary hover:text-brand-primary"><X size={14} /></button>
                                      </div>
                                   ) : (
                                      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-brand-primary/80 bg-white/50 px-2 py-1 rounded-md border border-brand-primary/10">
                                         <span>Deadline: {metricsOrder.targetCompletionDate ? new Date(metricsOrder.targetCompletionDate).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Not Set'}</span>
                                         <button onClick={() => { setTargetDateInput(metricsOrder.targetCompletionDate || ''); setEditingTargetDateId(metricsOrder.id); }} className="hover:text-brand-primary text-brand-secondary underline decoration-brand-border underline-offset-2">Edit</button>
                                      </div>
                                   )}
                                </div>
                             </div>
                             {metricsOrder.project && (
                                <div className="bg-brand-primary/5 border border-brand-primary/10 text-brand-primary text-[11px] p-3 rounded-xl mb-4 flex w-full items-center justify-between">
                                   <div>
                                     <strong>Active Project Header: </strong>
                                     This order is mapped to pipeline project <span className="font-bold uppercase tracking-wider">{metricsOrder.project}</span>. For the master projected deadlines & pipeline timelines, please examine the grouped metrics directly from the Production page.
                                   </div>
                                </div>
                             )}

                             {remainingGarments === 0 ? (
                                <div className="bg-gradient-to-r from-emerald-500 to-emerald-400 text-white rounded-xl p-6 shadow-md flex flex-col items-center justify-center gap-2 mb-6 relative overflow-hidden text-center">
                                   <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "url('data:image/svg+xml,%3Csvg width=\\'20\\' height=\\'20\\' viewBox=\\'0 0 20 20\\' xmlns=\\'http://www.w3.org/2000/svg\\'%3E%3Cg fill=\\'%23ffffff\\' fill-opacity=\\'1\\' fill-rule=\\'evenodd\\'%3E%3Ccircle cx=\\'3\\' cy=\\'3\\' r=\\'3\\'/%3E%3Ccircle cx=\\'13\\' cy=\\'13\\' r=\\'3\\'/%3E%3C/g%3E%3C/svg%3E')" }}></div>
                                   <div className="flex items-center gap-3 relative z-10">
                                     <Check className="h-8 w-8 shrink-0" strokeWidth={3} />
                                     <div className="text-2xl font-black tracking-tight drop-shadow-md">PRODUCTION COMPLETE!</div>
                                   </div>
                                   {efficiencyMessage && (
                                     <div className="relative z-10 text-sm font-bold bg-black/10 px-4 py-1.5 rounded-full mt-1">
                                       {efficiencyMessage}
                                     </div>
                                   )}
                                </div>
                             ) : null}

                             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 sm:gap-4">
                                <div className="flex flex-col">
                                   <span className="text-[10px] font-bold uppercase tracking-widest text-brand-primary/60 mb-1">Completed Garments</span>
                                   <span className="text-xl font-black text-blue-600">{globalTotalGarmentsCompletedWithStats}</span>
                                </div>
                                <div className="flex flex-col border-l border-brand-primary/10 pl-4">
                                   <span className="text-[10px] font-bold uppercase tracking-widest text-brand-primary/60 mb-1">Order Total Produced</span>
                                   <span className="text-xl font-black">{trueTotalGarmentsCompleted} <span className="text-sm text-brand-secondary font-bold">/ {totalOrderGarments}</span></span>
                                </div>
                                <div className="flex flex-col relative border-l border-brand-primary/10 pl-4">
                                   <span className="text-[10px] font-bold uppercase tracking-widest text-brand-primary/60 mb-1">Avg / Garment</span>
                                   <div className="flex items-end gap-2">
                                     <span className="text-xl font-black">{globalAvgMinsPerGarment >= 1 ? globalAvgMinsPerGarment.toFixed(1) + 'm' : Math.round(globalAvgMinsPerGarment * 60) + 's'}</span>
                                     {metricsOrder.targetAvgMinsPerGarment && (
                                        <span className={`text-[10px] font-bold mb-1 ${globalAvgMinsPerGarment <= metricsOrder.targetAvgMinsPerGarment ? 'text-green-600' : 'text-orange-500'}`}>
                                           {globalAvgMinsPerGarment <= metricsOrder.targetAvgMinsPerGarment ? 'On Track' : 'Behind'}
                                        </span>
                                     )}
                                   </div>
                                </div>
                                <div className="flex flex-col border-l border-brand-primary/10 pl-4">
                                   <span className="text-[10px] font-bold uppercase tracking-widest text-brand-primary/60 mb-1">Expected Time</span>
                                   <span className="text-xl font-black">{estimatedRemainingMins > 60 ? (estimatedRemainingMins / 60).toFixed(1) + 'h' : Math.round(estimatedRemainingMins) + 'm'}</span>
                                </div>
                                <div className="flex flex-col border-l border-brand-primary/10 pl-4">
                                   <span className="text-[10px] font-bold uppercase tracking-widest text-brand-primary/60 mb-1">Time Left</span>
                                   <span className={`text-xl font-black ${hasTargetDate && businessHoursRemaining <= 0 ? 'text-red-500' : ''}`}>
                                      {hasTargetDate ? (businessHoursRemaining <= 0 ? 'Overdue' : `${businessHoursRemaining}h`) : 'No Deadline'}
                                   </span>
                                </div>
                             </div>
                         </div>

                         <div className="space-y-4">
                         {users.map(groupKey => {
                           const stat = statsByUser[groupKey];
                           const displayName = bestDisplayNames[groupKey] || groupKey;
                           const avgTimePerGarment = stat.garmentsCompleted > 0 ? (stat.totalTimeMins / stat.garmentsCompleted) : 0;
                           const overallRatePerHour = stat.totalTimeMins > 0 ? ((stat.garmentsCompleted / stat.totalTimeMins) * 60) : 0;
                           return (
                             <div key={groupKey} className="bg-white border border-brand-border rounded-xl p-5 shadow-sm">
                               <h4 className="font-bold text-lg text-brand-primary mb-4 pb-2 border-b border-brand-border/40">{displayName}</h4>
                               <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                  <div className="flex flex-col">
                                     <span className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary/70 mb-1">Total Garments</span>
                                     <span className="text-xl font-black text-brand-primary">{stat.garmentsCompleted}</span>
                                  </div>
                                  <div className="flex flex-col">
                                     <span className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary/70 mb-1">Avg Time / Garment</span>
                                     <span className="text-xl font-black text-blue-600">{avgTimePerGarment >= 1 ? avgTimePerGarment.toFixed(1) + 'm' : Math.round(avgTimePerGarment * 60) + 's'}</span>
                                  </div>
                                  <div className="flex flex-col">
                                     <span className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary/70 mb-1">Total Time</span>
                                     <span className="text-xl font-black text-brand-primary">{Math.round(stat.totalTimeMins)}m</span>
                                  </div>
                                  <div className="flex flex-col">
                                     <span className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary/70 mb-1">Overall Rate</span>
                                     <span className="text-xl font-black text-green-600">{Math.round(overallRatePerHour)}/hr</span>
                                  </div>
                               </div>
                             </div>
                           );
                         })}
                         </div>
                       </div>
                     );
                  }

                  let rawActivities = [...(order.activities || [])];
                  let uniquePerformanceUsers: string[] = [];
                  let finalDisplayedActivities: any[] = [];

                  if (activityFilter === 'performance') {
                     // Ensure activities are exactly Newest-To-Oldest
                     const newestFirst = [...rawActivities].sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                     const seenKeys = new Set<string>();
                     const keptActivities: any[] = [];

                     newestFirst.forEach((act: any) => {
                         const compMatch = act.message?.match(/^Completed (\d+)x (.*?) for (.*?) in (.*?)\. Rate: (\d+)\/hr$/);
                         
                         if (compMatch) {
                             const size = compMatch[2];
                             const style = compMatch[3];
                             const key = `${size}_${style}`;
                             
                             const itemMatches = (order.items || []).filter((i: any) => i.style === style || (i.style === "" && style === "Custom Garment"));
                             const isStillCompleted = itemMatches.some((i: any) => i.completedSizes?.includes(size));
                             
                             if (isStillCompleted) {
                                 if (!seenKeys.has(key)) {
                                     seenKeys.add(key);
                                     keptActivities.push(act);
                                 }
                             }
                         }
                     });

                     rawActivities = keptActivities.map((act: any) => {
                         let userAttr = normalizeUser((act.user || ''), allUsers);
                         return { ...act, user: userAttr };
                     });
                     
                     uniquePerformanceUsers = Array.from(new Set(
                         rawActivities.map((act: any) => act.user?.split('@')[0] || act.user || 'Unknown')
                     )).filter(Boolean) as string[];

                     if (performanceUserFilter !== 'All') {
                         rawActivities = rawActivities.filter((act: any) => {
                             const uName = act.user?.split('@')[0] || act.user || 'Unknown';
                             return uName === performanceUserFilter;
                         });
                     }
                     
                     finalDisplayedActivities = rawActivities.slice(0, activityLimit);
                  } else {
                     // Sort activities descending by timestamp for 'all'
                     const sortedActivities = [...rawActivities]
                         .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                         .map((act: any) => {
                             let userAttr = normalizeUser((act.user || ''), allUsers);
                             return { ...act, user: userAttr };
                         });
                     finalDisplayedActivities = sortedActivities.slice(0, activityLimit);
                  }
                  
                  return (
                    <div className="space-y-4 mb-4">
                      {activityFilter === 'performance' && uniquePerformanceUsers.length > 1 && (
                         <div className="flex flex-wrap gap-2 mb-2 pb-4 border-b border-brand-border/40">
                            <button 
                               onClick={() => { setPerformanceUserFilter('All'); setActivityLimit(10); }}
                               className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${performanceUserFilter === 'All' ? 'bg-brand-primary text-white shadow-sm' : 'bg-neutral-100 text-brand-secondary hover:text-brand-primary'}`}
                            >
                               All Team
                            </button>
                            {uniquePerformanceUsers.map(u => (
                               <button 
                                  key={u}
                                  onClick={() => { setPerformanceUserFilter(u); setActivityLimit(10); }}
                                  className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${performanceUserFilter === u ? 'bg-brand-primary text-white shadow-sm' : 'bg-neutral-100 text-brand-secondary hover:text-brand-primary'}`}
                               >
                                  {u}
                               </button>
                            ))}
                         </div>
                      )}

                      {finalDisplayedActivities.length === 0 ? (
                         <div className="text-xs text-brand-secondary text-center py-6">No activity recorded for this view.</div>
                      ) : finalDisplayedActivities.map((act: any) => {
                       let isCompletion = false;
                       let parsedStats : any = null;
                       const completionMatch = act.message?.match(/^Completed (\d+)x (.*?) for (.*?) in (.*?)\. Rate: (\d+)\/hr$/);
                       if (completionMatch) {
                          isCompletion = true;
                          const [, qtyStr, sizeStr, styleStr, totalTime, rate] = completionMatch;
                          
                          let totalTimeInMins = 0;
                          if (totalTime.endsWith('m')) totalTimeInMins = parseInt(totalTime.replace('m',''));
                          else if (totalTime.endsWith('s')) totalTimeInMins = parseInt(totalTime.replace('s','')) / 60;
                          else totalTimeInMins = 1;
                          
                          const parsedQty = parseInt(qtyStr) || 1;
                          const timePerGarment = totalTimeInMins / parsedQty;
                          const timePerGarmentFormatted = timePerGarment >= 1 ? `${timePerGarment.toFixed(1)}m` : `${Math.round(timePerGarment * 60)}s`;
                          
                          parsedStats = { qty: qtyStr, size: sizeStr, style: styleStr, totalTime, rate, timePerGarmentFormatted };
                       }

                       return (
                       <div key={act.id} className="relative pl-6 border-l border-brand-border/60 pb-5 last:pb-0 last:border-0 hover:border-l-brand-primary/40 transition-colors">
                          <div className={`absolute w-2 h-2 rounded-full left-[-4.5px] top-1.5 ring-4 ring-white ${act.type === 'status_change' ? 'bg-brand-primary' : 'bg-brand-secondary/40'}`}></div>
                          
                          <div className="flex flex-col gap-0.5">
                            {act.type === 'status_change' ? (
                               <p className="text-[13px] font-bold text-brand-primary/80">{act.message}</p>
                            ) : (
                               <>
                                 <p className="text-[13px] font-black text-brand-primary">{act.user?.split('@')?.[0] || act.user}</p>
                                 {isCompletion && parsedStats ? (
                                   <div className="flex flex-col gap-2 mt-0.5">
                                      <p className="text-[13px] text-brand-secondary/90 leading-snug">
                                         Completed <span className="font-bold">{parsedStats.qty}x {parsedStats.size}</span> for {parsedStats.style}
                                      </p>
                                      <div className="grid grid-cols-4 gap-0 bg-brand-bg rounded-lg border border-brand-border/60 overflow-hidden w-full shadow-sm mt-1">
                                          <div className="flex flex-col items-center justify-center p-2.5 bg-white w-full">
                                              <span className="text-[8px] uppercase tracking-widest text-brand-secondary/60 font-bold mb-0.5">Total Garments</span>
                                              <span className="text-[13px] font-bold text-brand-primary">{parsedStats.qty}</span>
                                          </div>
                                          <div className="flex flex-col items-center justify-center p-2.5 bg-white border-l border-brand-border/60 w-full">
                                              <span className="text-[8px] uppercase tracking-widest text-brand-secondary/60 font-bold mb-0.5">Avg Time / Garment</span>
                                              <span className="text-[13px] font-bold text-blue-600">{parsedStats.timePerGarmentFormatted}</span>
                                          </div>
                                          <div className="flex flex-col items-center justify-center p-2.5 bg-white border-l border-brand-border/60 w-full">
                                              <span className="text-[8px] uppercase tracking-widest text-brand-secondary/60 font-bold mb-0.5">Total Time</span>
                                              <span className="text-[13px] font-bold text-brand-primary">{parsedStats.totalTime}</span>
                                          </div>
                                          <div className="flex flex-col items-center justify-center p-2.5 bg-white border-l border-brand-border/60 w-full">
                                              <span className="text-[8px] uppercase tracking-widest text-brand-secondary/60 font-bold mb-0.5">Overall Rate</span>
                                              <span className="text-[13px] font-bold text-green-600">{parsedStats.rate}/hr</span>
                                          </div>
                                      </div>
                                   </div>
                                 ) : (
                                   <p className="text-[13px] text-brand-secondary/90 leading-snug">
                                      {act.message}
                                   </p>
                                 )}
                               </>
                            )}
                            <p className="text-[10px] text-brand-secondary/50 mt-1 font-semibold tracking-wide uppercase">
                              {new Date(act.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute:'2-digit' })}
                            </p>
                          </div>
                       </div>
                     )})}
                     
                     {(activityFilter === 'performance' ? rawActivities.length : (order.activities?.length || 0)) > activityLimit && (
                       <button onClick={() => setActivityLimit((activityFilter === 'performance' ? rawActivities.length : (order.activities?.length || 0)))} className="w-full py-2 text-xs font-bold text-brand-secondary hover:text-brand-primary border border-brand-border rounded-lg bg-neutral-50 hover:bg-neutral-100 transition-colors">
                         View All {(activityFilter === 'performance' ? rawActivities.length : (order.activities?.length || 0))} Recent Activities
                       </button>
                     )}
                     {activityLimit > 3 && (activityFilter === 'performance' ? rawActivities.length : (order.activities?.length || 0)) > 3 && (
                       <button onClick={() => setActivityLimit(3)} className="w-full py-2 text-xs font-bold text-brand-secondary hover:text-brand-primary border border-transparent hover:border-brand-border rounded-lg hover:bg-brand-bg transition-colors">
                         Collapse Activity
                       </button>
                     )}
                   </div>
                 );
               })()}
            </div>

            {/* Comment Input */}
            <form onSubmit={handleAddNote} className="mt-auto relative">
               <input 
                 type="text" 
                 value={noteText}
                 onChange={(e) => setNoteText(e.target.value)}
                 placeholder="Leave a note..." 
                 className="w-full bg-brand-bg border border-brand-border rounded-lg pl-4 pr-10 py-3 text-sm focus:border-brand-primary focus:outline-none transition-colors"
               />
               <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-secondary hover:text-brand-primary transition-colors">
                 <MessageSquare size={16} />
               </button>
            </form>
              </div>
            </div>
          </div>
      </div>

      {/* Edit Order Dialog */}
      {isEditDialogOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 md:p-6 overflow-y-auto">
          <div className="bg-brand-bg max-w-[95vw] xl:max-w-[1200px] w-full rounded-2xl overflow-hidden shadow-2xl flex flex-col border border-brand-border my-auto">
            <div className="p-6 border-b border-brand-border flex justify-between items-center bg-white sticky top-0 z-10">
              <h3 className="font-serif text-2xl text-brand-primary">Edit Order Settings</h3>
              <button 
                onClick={() => setIsEditDialogOpen(false)} 
                className="text-brand-secondary hover:text-brand-primary transition-colors bg-brand-bg border border-brand-border rounded-md p-1"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 overflow-y-auto custom-scrollbar flex-1 bg-white">
              {/* Left Column: Core Order Info */}
              <div className="flex flex-col gap-6">
                <div>
                  <h4 className="text-sm font-bold text-brand-primary mb-4 pb-2 border-b border-brand-border flex items-center gap-2"><div className="w-1.5 h-4 bg-brand-primary rounded-full"></div> Core Details</h4>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-widest text-brand-secondary mb-2">Order Title</label>
                      <input 
                        type="text" 
                        value={editForm.title}
                        onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                        className="w-full bg-brand-bg/50 border border-brand-border rounded-lg px-4 py-3 text-sm focus:border-brand-primary focus:outline-none transition-colors"
                        placeholder="e.g. Polos, Jackets, Accessories"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-widest text-brand-secondary mb-2">Due Date</label>
                      <input 
                        type="date" 
                        value={editForm.date}
                        onChange={(e) => setEditForm(prev => ({ ...prev, date: e.target.value }))}
                        className="w-full bg-brand-bg/50 border border-brand-border rounded-lg px-4 py-3 text-sm focus:border-brand-primary focus:outline-none transition-colors"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-bold text-brand-primary mb-4 pb-2 border-b border-brand-border flex items-center gap-2"><div className="w-1.5 h-4 bg-blue-500 rounded-full"></div> Pipeline & Legacy Tracking</h4>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-widest text-brand-secondary mb-2">Fulfillment Type</label>
                        <select 
                          value={editForm.fulfillmentType}
                          onChange={(e) => setEditForm(prev => ({ ...prev, fulfillmentType: e.target.value }))}
                          className="w-full bg-brand-bg/50 border border-brand-border rounded-lg px-4 py-3 text-sm focus:border-brand-primary focus:outline-none transition-colors"
                        >
                          <option value="">Default (From Customer)</option>
                          <option value="Standard">Standard Drop-Ship</option>
                          <option value="Kitting">Inventory & Kitting</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-widest text-brand-secondary mb-2">Pipeline Status</label>
                        <select 
                          value={editForm.statusIndex.toString()}
                          onChange={(e) => setEditForm(prev => ({ ...prev, statusIndex: parseInt(e.target.value) }))}
                          className="w-full bg-brand-bg/50 border border-brand-border rounded-lg px-4 py-3 text-sm focus:border-brand-primary focus:outline-none transition-colors"
                        >
                          {(() => {
                            const formIsKitting = editForm.fulfillmentType === 'Kitting' || (!editForm.fulfillmentType && customer.fulfillmentType === 'Kitting');
                            return (
                              <>
                                <option value="0">0 - Quote</option>
                                <option value="1">1 - Mgmt Notified</option>
                                <option value="2">2 - Quote Sent</option>
                                <option value="3">3 - Approved</option>
                                <option value="4">4 - Shopping</option>
                                <option value="5">5 - Ordered</option>
                                <option value="6">6 - Processing</option>
                                <option value="7">7 - {formIsKitting ? 'Inventory' : 'Shipped'}</option>
                                <option value="8">8 - {formIsKitting ? 'Live (Shopify)' : 'Received'}</option>
                              </>
                            );
                          })()}
                        </select>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-widest text-brand-secondary mb-2">Legacy Carrier</label>
                        <select 
                          value={editForm.trackingCarrier}
                          onChange={(e) => setEditForm(prev => ({ ...prev, trackingCarrier: e.target.value }))}
                          className="w-full bg-brand-bg/50 border border-brand-border rounded-lg px-4 py-3 text-sm focus:border-brand-primary focus:outline-none transition-colors"
                        >
                          <option value="">Pickup / Local</option>
                          <option value="UPS">UPS</option>
                          <option value="FedEx">FedEx</option>
                          <option value="USPS">USPS</option>
                          <option value="DHL">DHL</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-widest text-brand-secondary mb-2">Legacy Tracking Num</label>
                        <input 
                          type="text" 
                          value={editForm.trackingNumber}
                          onChange={(e) => setEditForm(prev => ({ ...prev, trackingNumber: e.target.value }))}
                          className="w-full bg-brand-bg/50 border border-brand-border rounded-lg px-4 py-3 text-sm focus:border-brand-primary focus:outline-none transition-colors"
                          placeholder="e.g. 1Z9999..."
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Global Shipping Architecture */}
              <div className="flex flex-col gap-6">
                <div>
                  <h4 className="text-sm font-bold text-brand-primary mb-4 pb-2 border-b border-brand-border flex items-center gap-2"><div className="w-1.5 h-4 bg-indigo-500 rounded-full"></div> Global Origin / Destination Profile</h4>
                  
                  <div className="space-y-4">
                    <p className="text-xs text-brand-secondary -mt-2">This is the default configuration used whenever you click "Buy UPS Label" on a specific box for this exact order.</p>

                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-2">Recipient Information</label>
                      <div className="flex gap-2 mb-2">
                        <input 
                          type="text" placeholder="Recipient Name" autoComplete="name"
                          value={editForm.shippingAddress.name || ''} 
                          onChange={e => setEditForm(prev => ({...prev, shippingAddress: {...prev.shippingAddress, name: e.target.value}}))}
                          className="w-1/2 bg-brand-bg/50 border border-brand-border rounded-lg px-3 py-2.5 text-sm focus:border-brand-primary outline-none" 
                        />
                        <input 
                          type="text" placeholder="Company (Optional)" autoComplete="organization"
                          value={editForm.shippingAddress.company || ''} 
                          onChange={e => setEditForm(prev => ({...prev, shippingAddress: {...prev.shippingAddress, company: e.target.value}}))}
                          className="w-1/2 bg-brand-bg/50 border border-brand-border rounded-lg px-3 py-2.5 text-sm focus:border-brand-primary outline-none" 
                        />
                      </div>
                      <input 
                        type="text" placeholder="Street Address" autoComplete="address-line1"
                        value={editForm.shippingAddress.street1 || ''} 
                        onChange={e => setEditForm(prev => ({...prev, shippingAddress: {...prev.shippingAddress, street1: e.target.value}}))}
                        className="w-full bg-brand-bg/50 border border-brand-border rounded-lg px-3 py-2.5 text-sm focus:border-brand-primary outline-none mb-2" 
                      />
                      <input 
                        type="text" placeholder="Apt, Suite, Unit (Optional)" autoComplete="address-line2"
                        value={editForm.shippingAddress.street2 || ''} 
                        onChange={e => setEditForm(prev => ({...prev, shippingAddress: {...prev.shippingAddress, street2: e.target.value}}))}
                        className="w-full bg-brand-bg/50 border border-brand-border rounded-lg px-3 py-2.5 text-sm focus:border-brand-primary outline-none mb-2" 
                      />
                      <div className="flex gap-2">
                        <input 
                          type="text" placeholder="City" autoComplete="address-level2"
                          value={editForm.shippingAddress.city || ''} 
                          onChange={e => setEditForm(prev => ({...prev, shippingAddress: {...prev.shippingAddress, city: e.target.value}}))}
                          className="w-[45%] bg-brand-bg/50 border border-brand-border rounded-lg px-3 py-2.5 text-sm focus:border-brand-primary outline-none" 
                        />
                        <input 
                          type="text" placeholder="State" autoComplete="address-level1"
                          value={editForm.shippingAddress.state || ''} 
                          onChange={e => setEditForm(prev => ({...prev, shippingAddress: {...prev.shippingAddress, state: e.target.value}}))}
                          className="w-[20%] bg-brand-bg/50 border border-brand-border rounded-lg px-3 py-2.5 text-sm focus:border-brand-primary outline-none uppercase" maxLength={2} 
                        />
                        <input 
                          type="text" placeholder="Zip" autoComplete="postal-code"
                          value={editForm.shippingAddress.zip || ''} 
                          onChange={e => setEditForm(prev => ({...prev, shippingAddress: {...prev.shippingAddress, zip: e.target.value}}))}
                          className="w-[35%] bg-brand-bg/50 border border-brand-border rounded-lg px-3 py-2.5 text-sm focus:border-brand-primary outline-none" 
                        />
                      </div>
                    </div>
                    
                    <div className="mt-8 border-t border-brand-border pt-6">
                      <h4 className="text-sm font-bold text-brand-primary mb-4"><div className="w-1.5 h-4 bg-emerald-500 rounded-full inline-block align-middle mr-2"></div> Third-Party Logistics</h4>
                      <div className="bg-brand-bg/30 p-4 rounded-xl border border-brand-border space-y-3">
                         <div>
                            <label className="block text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1">Global 3rd-Party Ups Account</label>
                            <input 
                              type="text" placeholder="e.g. UPS Account Number" 
                              value={editForm.thirdPartyBilling.account || ''} 
                              onChange={e => setEditForm(prev => ({...prev, thirdPartyBilling: {...prev.thirdPartyBilling, account: e.target.value}}))}
                              className="w-full bg-white border border-brand-border rounded-lg px-3 py-2.5 text-sm focus:border-brand-primary outline-none" 
                            />
                         </div>
                         <div>
                            <label className="block text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1">Billing Zip Code</label>
                            <input 
                              type="text" placeholder="ZIP associated with Account" 
                              value={editForm.thirdPartyBilling.zip || ''} 
                              onChange={e => setEditForm(prev => ({...prev, thirdPartyBilling: {...prev.thirdPartyBilling, zip: e.target.value}}))}
                              className="w-full bg-white border border-brand-border rounded-lg px-3 py-2.5 text-sm focus:border-brand-primary outline-none" 
                            />
                         </div>
                      </div>
                    </div>

                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 bg-brand-bg flex justify-between gap-4 border-t border-brand-border sticky bottom-0">
              <PillButton 
                variant="outline" 
                onClick={handleDeleteOrder} 
                className="border-red-200 text-red-600 hover:bg-red-50 hover:border-red-600 px-6 py-3 flex items-center gap-1.5 shrink-0"
                disabled={isDeleting || isSaving}
              >
                {isDeleting ? <Loader2 className="animate-spin" size={18} /> : (
                  <>
                    <Trash2 size={16} />
                    <span>Delete Order</span>
                  </>
                )}
              </PillButton>
              
              <div className="flex gap-4 flex-1 justify-end">
                <PillButton variant="outline" onClick={() => setIsEditDialogOpen(false)} className="px-8 py-3">
                  Cancel
                </PillButton>
                <PillButton variant="filled" onClick={handleSaveEdit} className="px-8 py-3" disabled={isSaving || isDeleting}>
                  {isSaving ? <Loader2 className="animate-spin" size={18} /> : <span>Save All Changes</span>}
                </PillButton>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Edit Item Dialog */}
      {editItemObj && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 md:p-6 overflow-y-auto">
          <div className="bg-brand-bg max-w-[95vw] xl:max-w-[1400px] w-full rounded-2xl overflow-hidden shadow-2xl flex flex-col border border-brand-border my-auto">
            <div className="p-6 border-b border-brand-border flex justify-between items-center bg-white">
              <div className="flex items-center gap-4">
                <h3 className="font-serif text-2xl text-brand-primary">Edit Item Specs</h3>                 <div className="flex bg-neutral-100 p-1 rounded-lg">
                  <button 
                    onClick={() => setEditItemObj({...editItemObj, itemType: 'garment'})} 
                    className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md transition-all ${(!editItemObj.itemType || editItemObj.itemType === 'garment') ? 'bg-white shadow-sm text-brand-primary' : 'text-brand-secondary hover:text-brand-primary'}`}
                  >
                    Garment
                  </button>
                  <button 
                    onClick={() => setEditItemObj({...editItemObj, itemType: 'service'})} 
                    className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md transition-all ${editItemObj.itemType === 'service' ? 'bg-white shadow-sm text-brand-primary' : 'text-brand-secondary hover:text-brand-primary'}`}
                  >
                    Service / Misc
                  </button>
                  <button 
                    onClick={() => {
                      const isAlreadyGang = editItemObj.itemType === 'gang_sheet';
                      
                      // Collect customized logos from portal customization if any
                      const customizedLogos: Array<{ url: string; name: string }> = [];
                      if (editItemObj.logoUrl) {
                        customizedLogos.push({ url: editItemObj.logoUrl, name: editItemObj.logoName || 'Front Logo' });
                      }
                      if (editItemObj.logoUrlBack) {
                        customizedLogos.push({ url: editItemObj.logoUrlBack, name: editItemObj.logoNameBack || 'Back Logo' });
                      }
                      if (editItemObj.logoUrlLeftSleeve) {
                        customizedLogos.push({ url: editItemObj.logoUrlLeftSleeve, name: editItemObj.logoNameLeftSleeve || 'Left Sleeve Logo' });
                      }
                      if (editItemObj.logoUrlRightSleeve) {
                        customizedLogos.push({ url: editItemObj.logoUrlRightSleeve, name: editItemObj.logoNameRightSleeve || 'Right Sleeve Logo' });
                      }

                      let initialArtworks = [];
                      if (isAlreadyGang && Array.isArray(editItemObj.artworks) && editItemObj.artworks.length > 0) {
                        initialArtworks = editItemObj.artworks;
                      } else if (customizedLogos.length > 0) {
                        initialArtworks = customizedLogos.map((logo, idx) => ({
                          id: `art-${Date.now()}-${idx}`,
                          name: logo.name,
                          url: logo.url,
                          imageUrl: logo.url,
                          originalUrl: logo.url,
                          width: 3.5,
                          height: 3.5,
                          quantity: 10
                        }));
                      } else if (editItemObj.originalSheetUrl) {
                        initialArtworks = [{ 
                          id: `art-${Date.now()}`, 
                          name: 'Existing Artwork', 
                          url: editItemObj.originalSheetUrl, 
                          imageUrl: editItemObj.originalSheetUrl, 
                          originalUrl: editItemObj.originalSheetUrl, 
                          width: editItemObj.sheetWidth || 3.5, 
                          height: editItemObj.sheetHeight || 3.5, 
                          quantity: editItemObj.quantity || 1 
                        }];
                      } else if (editItemObj.sheetSizeName === 'Single Design Transfer') {
                        initialArtworks = [{ 
                          id: `art-${Date.now()}`, 
                          name: '', 
                          url: '', 
                          imageUrl: '', 
                          originalUrl: '', 
                          width: 3.5, 
                          height: 3.5, 
                          quantity: 10 
                        }];
                      } else {
                        initialArtworks = [];
                      }

                      const targetLayoutType = editItemObj.sheetSizeName || 'Single Design Transfer';
                      const targetStyleName = (!isAlreadyGang && customizedLogos.length > 0)
                        ? customizedLogos.map(l => l.name).join(' & ')
                        : editItemObj.style;

                      setEditItemObj({
                        ...editItemObj, 
                        itemType: 'gang_sheet',
                        style: targetStyleName,
                        sheetSizeName: targetLayoutType,
                        sheetWidth: editItemObj.sheetWidth || 22,
                        sheetHeight: editItemObj.sheetHeight || 24,
                        quantity: targetLayoutType === 'Single Design Transfer' ? 1 : (editItemObj.quantity || editItemObj.qty || 1),
                        price: editItemObj.price || '$0.00',
                        image: editItemObj.image || editItemObj.originalSheetUrl || (customizedLogos.length > 0 ? customizedLogos[0].url : ''),
                        artworks: initialArtworks
                      });
                    }}
                    className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md transition-all ${editItemObj.itemType === 'gang_sheet' ? 'bg-white shadow-sm text-brand-primary' : 'text-brand-secondary hover:text-brand-primary'}`}
                  >
                    DTF Gang Sheet
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-3">
                 {(!editItemObj.itemType || editItemObj.itemType === 'garment') && (
                   <button 
                     onClick={() => setIsShopifySearchOpen(!isShopifySearchOpen)}
                     className="text-xs font-bold uppercase tracking-widest bg-brand-bg border border-brand-border px-3 py-1.5 rounded-lg flex items-center gap-2 hover:border-brand-primary transition-colors text-brand-primary"
                   >
                     <ShoppingBag size={14} /> Link Shopify Product
                   </button>
                 )}
                 <button 
                   onClick={() => { setEditItemObj(null); setIsShopifySearchOpen(false); setShopifyProducts([]); }} 
                   className="text-brand-secondary hover:text-brand-primary transition-colors bg-brand-bg border border-brand-border rounded-md p-1"
                 >
                   <X size={20} />
                 </button>
              </div>
            </div>
            
            {isShopifySearchOpen && (
               <div className="bg-brand-bg/50 border-b border-brand-border p-6 shadow-inner">
                  <form onSubmit={handleSearchShopify} className="flex flex-col gap-3">
                     <label className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary">Search Active Catalog</label>
                     <div className="flex gap-3">
                       <div className="relative flex-1">
                          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-secondary" />
                          <input 
                             type="text" 
                             value={shopifySearchQuery} 
                             onChange={e => setShopifySearchQuery(e.target.value)} 
                             placeholder="Search product names..." 
                             className="w-full bg-white border border-brand-border rounded-lg pl-9 pr-4 py-2 text-sm focus:border-brand-primary focus:outline-none"
                             autoFocus
                          />
                       </div>
                       <PillButton type="submit" variant="filled" className="px-5 py-2 shrink-0" disabled={isSearchingShopify || !shopifySearchQuery.trim()}>
                           {isSearchingShopify ? <Loader2 size={16} className="animate-spin" /> : 'Search'}
                       </PillButton>
                     </div>
                  </form>

                  {shopifyProducts.length > 0 && !isSearchingShopify && (
                     <div className="mt-4 max-h-[250px] overflow-y-auto custom-scrollbar border border-brand-border rounded-xl bg-white divide-y divide-brand-border/40">
                        {shopifyProducts.map((product) => (
                           <div key={product.id} className="p-3">
                              <div className="flex items-center gap-3 mb-2">
                                 {product.featuredImage?.url && (
                                   <img src={product.featuredImage.url} alt="" className="w-8 h-8 object-cover rounded shadow-sm border border-black/5" />
                                 )}
                                 <h4 className="font-bold text-sm text-brand-primary">{product.title}</h4>
                              </div>
                              <div className="flex flex-wrap gap-2 pl-11">
                                 {product.variants.map((v: any) => (
                                    <button 
                                      key={v.title}
                                      onClick={() => handleSelectShopifyProduct(product, v)}
                                      className="text-[10px] uppercase font-bold tracking-wide border border-brand-border px-3 py-1.5 rounded bg-brand-bg/30 hover:bg-black hover:text-white hover:border-black transition-colors"
                                    >
                                       {v.title} (${v.price})
                                    </button>
                                 ))}
                              </div>
                           </div>
                        ))}
                     </div>
                  )}
               </div>
            )}
            
            <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-8 max-h-[80vh] overflow-y-auto custom-scrollbar">
              
              {/* Left Column: Images (4 cols) */}
              {(!editItemObj.itemType || editItemObj.itemType === 'garment') && (
                <div className="lg:col-span-4 flex flex-col gap-6">
                   <div className="flex items-center justify-between pointer-events-none">
                      <label className="text-xs font-bold uppercase tracking-widest text-brand-secondary">Item Imagery</label>
                   </div>
                   <div className="bg-white rounded-xl border border-brand-border p-5 flex flex-col gap-5 shadow-sm">
                     
                     {/* Main Mockup */}
                     <div className="flex flex-col gap-3">
                       <span className="text-xs font-semibold text-brand-primary flex items-center gap-2"><ImageIcon size={14}/> Main Mockup</span>
                       <div className="w-full aspect-square bg-brand-bg border border-brand-border rounded-lg flex items-center justify-center overflow-hidden">
                         {editItemObj.image ? (
                           <img src={editItemObj.image} alt="Main mockup" className="w-full h-full object-contain p-2 hover:scale-105 transition-transform cursor-crosshair" onClick={() => setExpandedImage({ src: editItemObj.image, alt: "Main mockup" })} />
                         ) : (
                           <div className="flex flex-col items-center gap-2 text-brand-secondary/50">
                             <ImageIcon size={32} />
                             <span className="text-xs font-medium">No main image</span>
                           </div>
                         )}
                       </div>                        <div className="flex flex-col sm:flex-row gap-2">
                          <label className="flex-1 cursor-pointer bg-white border border-brand-border rounded-lg py-2.5 flex items-center justify-center gap-2 hover:bg-brand-bg transition-colors text-sm font-semibold text-brand-primary shadow-sm hover:shadow">
                            {isUploadingMain ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                            {isUploadingMain ? 'Uploading...' : 'Upload Mockup'}
                            <input type="file" className="hidden" accept="image/*" onChange={handleMainImageUpload} disabled={isUploadingMain} />
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              const catalogItem = sanmarCatalog.find((i: any) => i.style === editItemObj.itemNum || i.style === editItemObj.style);
                              setCustomizingItem({
                                id: editItemObj.id,
                                style: editItemObj.style,
                                garmentName: editItemObj.style,
                                itemNum: editItemObj.itemNum,
                                image: editItemObj.image,
                                images: catalogItem?.images || editItemObj.images || null,
                                backImages: catalogItem?.backImages || editItemObj.backImages || null,
                                colors: catalogItem?.colors || editItemObj.colors || ['Custom Color'],
                                color: editItemObj.color || 'Custom Color'
                              });
                            }}
                            className="flex-1 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg py-2.5 flex items-center justify-center gap-2 transition-all shadow-sm text-sm font-semibold cursor-pointer"
                          >
                            <Sparkles size={16} className="text-white animate-pulse" />
                            <span>Mockup Creator</span>
                          </button>
                        </div>
                     </div>
                     
                     <div className="h-px bg-brand-border w-full"></div>
  
                     {/* Reference Images */}
                     <div className="flex flex-col gap-3">
                       <span className="text-xs font-semibold text-brand-primary flex items-center gap-2"><ImageIcon size={14}/> Additional References</span>
                       <div className="flex-1 border border-brand-border bg-brand-bg rounded-lg p-3 overflow-y-auto min-h-[140px] max-h-[300px]">
                         {editItemObj.referenceImages?.length > 0 ? (
                           <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                             {editItemObj.referenceImages.map((refImg: string, i: number) => (
                               <div key={i} className="relative aspect-square rounded-lg group overflow-hidden border border-brand-border bg-white shadow-sm">
                                 <img src={refImg} alt={`Reference ${i}`} className="w-full h-full object-contain p-1" />
                                 <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity" onClick={() => setExpandedImage({ src: refImg, alt: `Reference ${i}` })}>
                                     <Search size={16} className="text-white hover:text-brand-primary cursor-pointer drop-shadow-md" />
                                 </div>
                                 <button 
                                   onClick={(e) => {
                                     e.stopPropagation();
                                     setEditItemObj({
                                       ...editItemObj,
                                       referenceImages: editItemObj.referenceImages.filter((_: any, idx: number) => idx !== i)
                                     })
                                   }}
                                   className="absolute top-1 right-1 bg-red-500 text-white p-1.5 rounded-md hover:bg-red-600 transition-colors opacity-0 group-hover:opacity-100 shadow-md"
                                 >
                                   <Trash2 size={12} />
                                 </button>
                               </div>
                             ))}
                           </div>
                         ) : (
                           <div className="h-full flex flex-col items-center justify-center text-xs text-brand-secondary p-4 text-center gap-2">
                             <ImageIcon size={24} className="opacity-20" />
                             <p>No extra reference images added yet.</p>
                           </div>
                         )}
                       </div>
                       <label className="cursor-pointer bg-white border border-brand-border rounded-lg py-2.5 flex items-center justify-center gap-2 hover:bg-brand-bg transition-colors text-sm font-semibold text-brand-primary shadow-sm hover:shadow">
                         {isUploadingRef ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                         {isUploadingRef ? 'Uploading...' : 'Add Reference'}
                         <input type="file" className="hidden" accept="image/*" onChange={handleRefImageUpload} disabled={isUploadingRef} />
                       </label>
                     </div>
                   </div>
                 </div>
              )}
              {editItemObj.itemType === 'gang_sheet' && (
                 <div className={editItemObj.sheetSizeName === 'Single Design Transfer' ? "lg:col-span-12 flex flex-col gap-6" : "lg:col-span-4 flex flex-col gap-6"}>
                    <div className="bg-white rounded-xl border border-brand-border p-5 flex flex-col gap-5 shadow-sm">
                      {editItemObj.sheetSizeName === 'Single Design Transfer' ? (
                        <div className="flex flex-col gap-4">
                           <div className="flex justify-between items-center border-b border-brand-border pb-3">
                              <span className="text-xs font-bold uppercase tracking-widest text-brand-secondary flex items-center gap-2">
                                <ImageIcon size={14}/> Configure Logos / Designs
                              </span>
                              <button
                                 type="button"
                                 onClick={() => {
                                    const newArtworks = [...(editItemObj.artworks || [])];
                                    newArtworks.push({
                                       id: `art-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                                       name: '',
                                       url: '',
                                       width: 3.5,
                                       height: 3.5,
                                       quantity: 10
                                    });
                                    setEditItemObj((prev: any) => ({ ...prev, artworks: newArtworks }));
                                 }}
                                 className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                              >
                                 <Plus size={14} /> Add Logo
                              </button>
                           </div>

                           <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                              {((editItemObj.artworks && editItemObj.artworks.length > 0) ? editItemObj.artworks : [{ id: 'default', name: '', url: '', width: 3.5, height: 3.5, quantity: 10 }]).map((art: any, idx: number) => (
                                 <div key={art.id || idx} className="bg-brand-bg/30 border border-brand-border rounded-xl p-4 flex flex-col gap-4 shadow-sm relative group">
                                    {/* Remove Button */}
                                    {(editItemObj.artworks && editItemObj.artworks.length > 1) && (
                                       <button
                                          type="button"
                                          onClick={() => {
                                             const newArtworks = editItemObj.artworks.filter((_: any, i: number) => i !== idx);
                                             setEditItemObj((prev: any) => ({ ...prev, artworks: newArtworks }));
                                          }}
                                          className="absolute top-3 right-3 text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 p-1.5 rounded-lg transition-all cursor-pointer z-10"
                                          title="Delete Logo"
                                       >
                                          <Trash2 size={14} />
                                       </button>
                                    )}

                                    <div className="flex gap-4 items-start">
                                       {/* Logo Upload Box */}
                                       <div className="w-20 h-20 bg-white border border-brand-border rounded-lg flex items-center justify-center overflow-hidden bg-checkerboard shrink-0 relative shadow-sm">
                                          {art.url ? (
                                             <>
                                                <img src={art.url} alt="" className="w-full h-full object-contain p-1" />
                                                <label className="absolute inset-0 cursor-pointer flex items-center justify-center bg-black/40 opacity-0 hover:opacity-100 transition-opacity">
                                                   <Upload size={14} className="text-white" />
                                                   <input
                                                      type="file"
                                                      className="hidden"
                                                      accept="image/*"
                                                      onChange={(e) => handleLogoUpload(e, idx)}
                                                   />
                                                </label>
                                             </>
                                          ) : (
                                             <label className="absolute inset-0 cursor-pointer flex flex-col items-center justify-center gap-1 hover:bg-brand-bg transition-colors">
                                                <Upload size={16} className="text-brand-secondary/40" />
                                                <input
                                                   type="file"
                                                   className="hidden"
                                                   accept="image/*"
                                                   onChange={(e) => handleLogoUpload(e, idx)}
                                                />
                                             </label>
                                          )}
                                       </div>

                                       {/* File Details */}
                                       <div className="flex-1 min-w-0 flex flex-col gap-0.5 pt-1">
                                          <span className="text-[9px] font-extrabold uppercase tracking-wider text-brand-secondary">Logo #{idx + 1}</span>
                                          <span className="text-xs font-bold text-brand-primary truncate">{art.name || 'No file uploaded'}</span>
                                          {isUploadingGang && !art.url && (
                                             <span className="text-[9px] text-brand-primary flex items-center gap-1 font-semibold">
                                                <Loader2 size={10} className="animate-spin" /> Uploading...
                                             </span>
                                          )}
                                       </div>
                                    </div>

                                    {/* Dimensions & Qty Row */}
                                    <div className="grid grid-cols-3 gap-2">
                                       <div className="flex flex-col gap-1">
                                          <label className="text-[9px] uppercase font-bold text-gray-400 pl-0.5">Width (in)</label>
                                          <input
                                             type="number"
                                             step="0.1"
                                             value={art.width || ''}
                                             onChange={(e) => {
                                                const val = parseFloat(e.target.value) || 0;
                                                const newArtworks = [...(editItemObj.artworks || [])];
                                                const aspect = art.aspectRatio || (art.height && art.width ? (art.height / art.width) : 1.0);
                                                const newHeight = parseFloat((val * aspect).toFixed(2));
                                                newArtworks[idx] = { ...newArtworks[idx], width: val, height: newHeight, aspectRatio: aspect };
                                                setEditItemObj((prev: any) => ({ ...prev, artworks: newArtworks }));
                                             }}
                                             className="w-full bg-white border border-brand-border rounded-lg px-2 py-1.5 text-xs font-bold focus:border-brand-primary focus:outline-none transition-all"
                                             placeholder="3.5"
                                          />
                                       </div>
                                       <div className="flex flex-col gap-1">
                                          <label className="text-[9px] uppercase font-bold text-gray-400 pl-0.5">Height (in)</label>
                                          <input
                                             type="number"
                                             step="0.1"
                                             value={art.height ? parseFloat(art.height.toFixed(2)) : ''}
                                             disabled
                                             className="w-full bg-brand-bg border border-brand-border rounded-lg px-2 py-1.5 text-xs font-bold text-brand-secondary/70 cursor-not-allowed focus:outline-none"
                                             placeholder="Auto"
                                          />
                                       </div>
                                       <div className="flex flex-col gap-1">
                                          <label className="text-[9px] uppercase font-bold text-gray-400 pl-0.5">Quantity</label>
                                          <input
                                             type="number"
                                             min="1"
                                             value={art.quantity || ''}
                                             onChange={(e) => {
                                                const val = parseInt(e.target.value) || 0;
                                                const newArtworks = [...(editItemObj.artworks || [])];
                                                newArtworks[idx] = { ...newArtworks[idx], quantity: val };
                                                setEditItemObj((prev: any) => ({ ...prev, artworks: newArtworks }));
                                             }}
                                             className="w-full bg-white border border-brand-border rounded-lg px-2 py-1.5 text-xs font-bold focus:border-brand-primary focus:outline-none transition-all text-brand-primary font-bold"
                                             placeholder="10"
                                          />
                                       </div>
                                    </div>
                                 </div>
                              ))}
                           </div>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-3">
                          <span className="text-xs font-semibold text-brand-primary flex items-center gap-2">
                            <ImageIcon size={14}/> Pre-built Sheet
                          </span>
                          <div className="w-full aspect-square bg-neutral-100 border border-brand-border rounded-lg flex items-center justify-center overflow-hidden bg-checkerboard">
                            {editItemObj.originalSheetUrl ? (
                              <img src={editItemObj.originalSheetUrl} alt="Artwork preview" className="w-full h-full object-contain p-2 hover:scale-105 transition-transform cursor-crosshair" onClick={() => setExpandedImage({ src: editItemObj.originalSheetUrl, alt: "Artwork preview" })} />
                            ) : (
                              <div className="flex flex-col items-center gap-2 text-brand-secondary/50">
                                <ImageIcon size={32} />
                                <span className="text-xs font-medium">No artwork uploaded</span>
                              </div>
                            )}
                          </div>
                          <label className="cursor-pointer bg-white border border-brand-border rounded-lg py-2.5 flex items-center justify-center gap-2 hover:bg-brand-bg transition-colors text-sm font-semibold text-brand-primary shadow-sm hover:shadow">
                            {isUploadingGang ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                            {isUploadingGang ? 'Uploading...' : 'Upload Artwork'}
                            <input type="file" className="hidden" accept="image/*" onChange={handleGangSheetUpload} disabled={isUploadingGang} />
                          </label>
                        </div>
                      )}
                    </div>
                 </div>
               )}

               {/* Right Column: Data Fields & Sizing */}
               <div className={
                  (!editItemObj.itemType || editItemObj.itemType === 'garment') 
                    ? "lg:col-span-8 flex flex-col gap-8" 
                    : (editItemObj.itemType === 'gang_sheet')
                      ? (editItemObj.sheetSizeName === 'Single Design Transfer' ? "lg:col-span-12 flex flex-col gap-8" : "lg:col-span-8 flex flex-col gap-8")
                      : "lg:col-span-12 flex flex-col gap-8 max-w-3xl mx-auto w-full"
                }>
                  {/* Top Row: Basic Info Grid */}
                  <div className="flex flex-col gap-3">
                    <label className="text-xs font-bold uppercase tracking-widest text-brand-secondary">Core Details</label>
                    {editItemObj.itemType === 'gang_sheet' ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white p-5 rounded-xl border border-brand-border shadow-sm">
                        <div className="flex flex-col gap-1.5 sm:col-span-2">
                          <label className="text-[10px] uppercase font-bold text-gray-400 pl-1">Layout Name / Description</label>
                          <input 
                            type="text" 
                            value={editItemObj.style || ''}
                            onChange={(e) => setEditItemObj({...editItemObj, style: e.target.value})}
                            className="w-full bg-brand-bg/50 border border-brand-border rounded-lg px-4 py-2.5 text-sm focus:border-brand-primary focus:bg-white focus:outline-none transition-all"
                            placeholder="e.g. Jersey Knit Polo gang sheet"
                          />
                        </div>
                        <div className="flex flex-col gap-1.5 sm:col-span-2">
                          <label className="text-[10px] uppercase font-bold text-gray-400 pl-1">Layout Type</label>
                          <select 
                            value={editItemObj.sheetSizeName || 'Single Design Transfer'}
                            onChange={(e) => {
                              const val = e.target.value;
                              setEditItemObj({
                                ...editItemObj,
                                sheetSizeName: val,
                                quantity: val === 'Single Design Transfer' ? 1 : editItemObj.quantity
                              });
                            }}
                            className="w-full bg-brand-bg/50 border border-brand-border rounded-lg px-4 py-2.5 font-serif text-brand-primary focus:border-brand-primary focus:bg-white focus:outline-none transition-all outline-none cursor-pointer"
                          >
                            <option value="Single Design Transfer">Single Design Transfer (Auto-Repeat)</option>
                            <option value="Standard Gang Sheet">Standard Gang Sheet (Pre-built)</option>
                          </select>
                        </div>
                        {editItemObj.sheetSizeName === 'Standard Gang Sheet' ? (
                          <>
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] uppercase font-bold text-gray-400 pl-1">Sheet Width (Inches)</label>
                              <input 
                                type="number" 
                                step="0.1"
                                value={editItemObj.sheetWidth || ''}
                                onChange={(e) => setEditItemObj({...editItemObj, sheetWidth: parseFloat(e.target.value) || 22})}
                                className="w-full bg-brand-bg/50 border border-brand-border rounded-lg px-4 py-2.5 text-sm focus:border-brand-primary focus:bg-white focus:outline-none transition-all"
                              />
                            </div>
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] uppercase font-bold text-gray-400 pl-1">Sheet Height (Inches)</label>
                              <input 
                                type="number" 
                                step="0.1"
                                value={editItemObj.sheetHeight || ''}
                                onChange={(e) => setEditItemObj({...editItemObj, sheetHeight: parseFloat(e.target.value) || 24})}
                                className="w-full bg-brand-bg/50 border border-brand-border rounded-lg px-4 py-2.5 text-sm focus:border-brand-primary focus:bg-white focus:outline-none transition-all"
                              />
                            </div>
                          </>
                        ) : (
                          <div className="sm:col-span-2 bg-brand-bg p-4 rounded-xl border border-brand-border flex flex-col gap-1">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-brand-secondary">Sheet Dimensions</span>
                            <span className="text-xs font-semibold text-brand-primary">Width: 22" (fixed) | Height: Auto-calculated based on logos</span>
                          </div>
                        )}
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] uppercase font-bold text-gray-400 pl-1">Number of Sheets</label>
                          <input 
                            type="number" 
                            min="1"
                            value={editItemObj.quantity || ''}
                            onChange={(e) => setEditItemObj({...editItemObj, quantity: parseInt(e.target.value) || 1})}
                            className="w-full bg-brand-bg/50 border border-brand-border rounded-lg px-4 py-2.5 text-sm focus:border-brand-primary focus:bg-white focus:outline-none transition-all font-bold text-brand-primary"
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] uppercase font-bold text-gray-400 pl-1">Unit Price ($)</label>
                          <div className="relative">
                            <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input 
                              type="text" 
                              value={editItemObj.price || ''}
                              onChange={(e) => setEditItemObj({...editItemObj, price: e.target.value})}
                              className="w-full bg-brand-bg/50 border border-brand-border rounded-lg pl-9 pr-4 py-2.5 text-sm focus:border-brand-primary focus:bg-white focus:outline-none transition-all font-bold text-brand-primary"
                              placeholder="0.00"
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className={`grid ${(!editItemObj.itemType || editItemObj.itemType === 'garment') ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4' : 'grid-cols-1 md:grid-cols-2'} gap-4 bg-white p-5 rounded-xl border border-brand-border shadow-sm`}>
                        {(!editItemObj.itemType || editItemObj.itemType === 'garment') && (
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] uppercase font-bold text-gray-400 pl-1">Gender</label>
                            <select 
                              value={editItemObj.gender || ''}
                              onChange={(e) => setEditItemObj({...editItemObj, gender: e.target.value})}
                              className="w-full bg-brand-bg/50 border border-brand-border rounded-lg px-4 py-2.5 font-serif text-brand-primary focus:border-brand-primary focus:bg-white focus:outline-none transition-all outline-none cursor-pointer"
                            >
                              <option value="" disabled>Select</option>
                              <option value="Male">Male</option>
                              <option value="Female">Female</option>
                              <option value="Accessories">Accessories</option>
                              <option value="Unisex">Unisex</option>
                            </select>
                          </div>
                        )}
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] uppercase font-bold text-gray-400 pl-1">{editItemObj.itemType === 'service' ? 'Service / Item Name' : 'Garment Style'}</label>
                          <input 
                            type="text" 
                            value={editItemObj.style || ''}
                            onChange={(e) => setEditItemObj({...editItemObj, style: e.target.value})}
                            className="w-full bg-brand-bg/50 border border-brand-border rounded-lg px-4 py-2.5 text-sm focus:border-brand-primary focus:bg-white focus:outline-none transition-all"
                            placeholder={editItemObj.itemType === 'service' ? "e.g. Storage, Transportation" : "e.g. Pique Polo"}
                          />
                        </div>
                        {(!editItemObj.itemType || editItemObj.itemType === 'garment') && (
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] uppercase font-bold text-gray-400 pl-1">Item #</label>
                            <input 
                              type="text" 
                              value={editItemObj.itemNum || ''}
                              onChange={(e) => setEditItemObj({...editItemObj, itemNum: e.target.value})}
                              className="w-full bg-brand-bg/50 border border-brand-border rounded-lg px-4 py-2.5 text-sm focus:border-brand-primary focus:bg-white focus:outline-none transition-all font-mono"
                            />
                          </div>
                        )}
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] uppercase font-bold text-gray-400 pl-1">{editItemObj.itemType === 'service' ? 'Description' : 'Garment Color'}</label>
                          <input 
                            type="text" 
                            value={editItemObj.color || ''}
                            onChange={(e) => setEditItemObj({...editItemObj, color: e.target.value})}
                            className="w-full bg-brand-bg/50 border border-brand-border rounded-lg px-4 py-2.5 text-sm focus:border-brand-primary focus:bg-white focus:outline-none transition-all"
                          />
                        </div>
                        {editItemObj.itemType === 'service' && (
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] uppercase font-bold text-gray-400 pl-1">Quantity</label>
                            <input 
                              type="number" 
                              min="1"
                              value={editItemObj.qty || ''}
                              onChange={(e) => setEditItemObj({...editItemObj, qty: parseInt(e.target.value) || 1})}
                              className="w-full bg-brand-bg/50 border border-brand-border rounded-lg px-4 py-2.5 text-sm focus:border-brand-primary focus:bg-white focus:outline-none transition-all"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Middle Row: Price & Logos Grid */}
                  {editItemObj.itemType !== 'gang_sheet' && (
                    <div className={`grid grid-cols-1 ${(!editItemObj.itemType || editItemObj.itemType === 'garment') ? 'xl:grid-cols-2' : ''} gap-8`}>
                      {(!editItemObj.itemType || editItemObj.itemType === 'garment') && (
                        <div className="flex flex-col gap-3">
                          <label className="text-xs font-bold uppercase tracking-widest text-brand-secondary">Decoration Options (Logos)</label>
                          <div className="bg-white p-5 rounded-xl border border-brand-border shadow-sm flex flex-col gap-3 h-full justify-center">
                             {[0, 1, 2].map(idx => (
                               <div key={idx} className="flex gap-2 items-center relative">
                                  <div className="relative flex-1">
                                     <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-300 w-4">{idx + 1}.</span>
                                     <input 
                                       type="text" 
                                       placeholder={`e.g. Left Chest`}
                                       value={editItemObj.logos?.[idx] || ''}
                                       onChange={(e) => {
                                         const newLogos = [...(editItemObj.logos || [])];
                                         newLogos[idx] = e.target.value;
                                         setEditItemObj({...editItemObj, logos: newLogos});
                                       }}
                                       className="w-full bg-brand-bg/50 border border-brand-border rounded-lg pl-9 pr-4 py-2.5 text-sm focus:border-brand-primary focus:bg-white focus:outline-none transition-all"
                                     />
                                  </div>
                                  <label className="shrink-0 flex items-center justify-center bg-brand-bg border border-brand-border rounded-lg px-3 py-2.5 cursor-pointer hover:bg-neutral-100 transition-colors tooltip-trigger relative group min-w-[46px]">
                                     {editItemObj.artworks?.[idx]?.url ? <Check size={16} className="text-green-600" /> : <Upload size={16} className="text-brand-secondary" />}
                                     <input type="file" className="hidden" accept=".ai,.eps,.pdf,.svg,.png" onChange={async (e) => {
                                         const file = e.target.files?.[0];
                                         if (!file) return;
                                         const storageRef = ref(storage, `orders/${id}/items/${editItemObj.id || 'new'}/art-${idx}-${Date.now()}`);
                                         await uploadBytes(storageRef, file);
                                         const url = await getDownloadURL(storageRef);
                                         const newArtworks = [...(editItemObj.artworks || [])];
                                         newArtworks[idx] = { name: file.name, url, originalUrl: url };
                                         setEditItemObj((prev: any) => ({...prev, artworks: newArtworks}));
                                     }} />
                                     <div className="absolute right-0 bottom-full mb-2 bg-gray-900 text-white text-[10px] uppercase font-bold px-2 py-1 rounded hidden group-hover:block whitespace-nowrap shadow-xl z-50">
                                         {editItemObj.artworks?.[idx]?.name ? editItemObj.artworks[idx].name : 'Upload Vector Art'}
                                     </div>
                                  </label>
                               </div>
                             ))}
                          </div>
                        </div>
                      )}
                      
                      <div className="flex flex-col gap-3">
                        <label className="text-xs font-bold uppercase tracking-widest text-brand-secondary">Pricing Strategy</label>
                        <div className="bg-white p-5 rounded-xl border border-brand-border shadow-sm flex flex-col gap-4 h-full">
                          <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] uppercase font-bold text-gray-400 pl-1">Price Per Item ($)</label>
                              <div className="relative">
                                  <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                  <input 
                                    type="text" 
                                    value={editItemObj.price || ''}
                                    onChange={(e) => setEditItemObj({...editItemObj, price: e.target.value})}
                                    className="w-full bg-brand-bg/50 border border-brand-border rounded-lg pl-9 pr-4 py-3 text-lg font-bold focus:border-brand-primary focus:bg-white focus:outline-none transition-all text-brand-primary"
                                    placeholder="0.00"
                                  />
                              </div>
                          </div>
                          <div className="bg-brand-bg rounded-lg p-3 border border-brand-border flex items-start gap-3 mt-auto">
                              <Clock size={16} className="text-brand-secondary shrink-0 mt-0.5" />
                              <p className="text-xs font-medium text-brand-secondary leading-relaxed">Ensure prices are accurate and reflect final agreed-upon rates for complete decoration and fulfillment packages per unit.</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                 {(!editItemObj.itemType || editItemObj.itemType === 'garment') && (
                   <>
                     {/* Material & Build */}
                     <div className="flex flex-col gap-3">
                       <label className="text-xs font-bold uppercase tracking-widest text-brand-secondary">Material & Build</label>
                       <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white p-5 rounded-xl border border-brand-border shadow-sm">
                         <div className="flex flex-col gap-1.5 sm:col-span-2 xl:col-span-1">
                           <label className="text-[10px] uppercase font-bold text-gray-400 pl-1">Fabric Details</label>
                           <input 
                             type="text" 
                             value={editItemObj.materialDetails || ''}
                             onChange={(e) => setEditItemObj({...editItemObj, materialDetails: e.target.value})}
                             className="w-full bg-brand-bg/50 border border-brand-border rounded-lg px-4 py-2.5 text-sm focus:border-brand-primary focus:bg-white focus:outline-none transition-all"
                           />
                         </div>
                         <div className="flex flex-col gap-1.5 sm:col-span-2 xl:col-span-1">
                           <label className="text-[10px] uppercase font-bold text-gray-400 pl-1">Fabric Finish</label>
                           <input 
                             type="text" 
                             value={editItemObj.materialFinish || ''}
                             onChange={(e) => setEditItemObj({...editItemObj, materialFinish: e.target.value})}
                             className="w-full bg-brand-bg/50 border border-brand-border rounded-lg px-4 py-2.5 text-sm focus:border-brand-primary focus:bg-white focus:outline-none transition-all"
                           />
                         </div>
                         <div className="flex flex-col gap-1.5">
                           <label className="text-[10px] uppercase font-bold text-gray-400 pl-1">Fit / Cut</label>
                           <input 
                             type="text" 
                             value={editItemObj.fit || ''}
                             onChange={(e) => setEditItemObj({...editItemObj, fit: e.target.value})}
                             className="w-full bg-brand-bg/50 border border-brand-border rounded-lg px-4 py-2.5 text-sm focus:border-brand-primary focus:bg-white focus:outline-none transition-all"
                           />
                         </div>
                         <div className="flex flex-col gap-1.5">
                           <label className="text-[10px] uppercase font-bold text-gray-400 pl-1">Fabric Weight (GSM)</label>
                           <input 
                             type="text" 
                             value={editItemObj.weight || ''}
                             onChange={(e) => setEditItemObj({...editItemObj, weight: e.target.value})}
                             className="w-full bg-brand-bg/50 border border-brand-border rounded-lg px-4 py-2.5 text-sm focus:border-brand-primary focus:bg-white focus:outline-none transition-all"
                           />
                         </div>
                         <div className="flex flex-col gap-1.5 sm:col-span-2">
                           <label className="text-[10px] uppercase font-bold text-gray-400 pl-1">Care Instructions</label>
                           <input 
                             type="text" 
                             value={editItemObj.careInstructions || ''}
                             onChange={(e) => setEditItemObj({...editItemObj, careInstructions: e.target.value})}
                             className="w-full bg-brand-bg/50 border border-brand-border rounded-lg px-4 py-2.5 text-sm focus:border-brand-primary focus:bg-white focus:outline-none transition-all"
                           />
                         </div>
                       </div>
                     </div>
  
                     {/* Customization & Production */}
                     <div className="flex flex-col gap-3">
                       <label className="text-xs font-bold uppercase tracking-widest text-brand-secondary">Customization & Production</label>
                       <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white p-5 rounded-xl border border-brand-border shadow-sm">
                         <div className="flex flex-col gap-1.5 sm:col-span-2">
                           <label className="text-[10px] uppercase font-bold text-gray-400 pl-1">Decorating Methods</label>
                           <input 
                             type="text" 
                             value={Array.isArray(editItemObj.decoratingMethods) ? editItemObj.decoratingMethods.join(', ') : editItemObj.decoratingMethods || ''}
                             onChange={(e) => setEditItemObj({...editItemObj, decoratingMethods: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean)})}
                             placeholder="e.g. DTF, Embroidery, Screen Print"
                             className="w-full bg-brand-bg/50 border border-brand-border rounded-lg px-4 py-2.5 text-sm focus:border-brand-primary focus:bg-white focus:outline-none transition-all"
                           />
                         </div>
                         <div className="flex flex-col gap-1.5 sm:col-span-2">
                           <label className="text-[10px] uppercase font-bold text-gray-400 pl-1">Thread / Ink Colors</label>
                           <input 
                             type="text" 
                             value={editItemObj.threadColors || ''}
                             onChange={(e) => setEditItemObj({...editItemObj, threadColors: e.target.value})}
                             className="w-full bg-brand-bg/50 border border-brand-border rounded-lg px-4 py-2.5 text-sm focus:border-brand-primary focus:bg-white focus:outline-none transition-all"
                           />
                         </div>
                         <div className="flex flex-col gap-1.5">
                           <label className="text-[10px] uppercase font-bold text-gray-400 pl-1">Turnaround Time</label>
                           <input 
                             type="text" 
                             value={editItemObj.turnaroundTime || ''}
                             onChange={(e) => setEditItemObj({...editItemObj, turnaroundTime: e.target.value})}
                             className="w-full bg-brand-bg/50 border border-brand-border rounded-lg px-4 py-2.5 text-sm focus:border-brand-primary focus:bg-white focus:outline-none transition-all"
                           />
                         </div>
                         <div className="flex flex-col gap-1.5">
                           <label className="text-[10px] uppercase font-bold text-gray-400 pl-1">MOQ</label>
                           <input 
                             type="text" 
                             value={editItemObj.moq || ''}
                             onChange={(e) => setEditItemObj({...editItemObj, moq: e.target.value})}
                             className="w-full bg-brand-bg/50 border border-brand-border rounded-lg px-4 py-2.5 text-sm focus:border-brand-primary focus:bg-white focus:outline-none transition-all"
                           />
                         </div>
                       </div>
                     </div>
  
                     {/* Backend Pricing */}
                     <div className="flex flex-col gap-3">
                       <label className="text-xs font-bold uppercase tracking-widest text-brand-secondary">Backend Pricing</label>
                       <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white p-5 rounded-xl border border-brand-border shadow-sm">
                         <div className="flex flex-col gap-1.5">
                           <label className="text-[10px] uppercase font-bold text-gray-400 pl-1">Cost Price ($)</label>
                           <input 
                             type="text"
                             value={editItemObj.costPrice || ''}
                             onChange={(e) => setEditItemObj({...editItemObj, costPrice: e.target.value})}
                             className="w-full bg-brand-bg/50 border border-brand-border rounded-lg px-4 py-2.5 text-sm focus:border-brand-primary focus:bg-white focus:outline-none transition-all"
                             placeholder="0.00"
                           />
                         </div>
                         <div className="flex flex-col gap-1.5">
                           <label className="text-[10px] uppercase font-bold text-gray-400 pl-1">Wholesale Price ($)</label>
                           <input 
                             type="text" 
                             value={editItemObj.wholesalePrice || ''}
                             onChange={(e) => setEditItemObj({...editItemObj, wholesalePrice: e.target.value})}
                             className="w-full bg-brand-bg/50 border border-brand-border rounded-lg px-4 py-2.5 text-sm focus:border-brand-primary focus:bg-white focus:outline-none transition-all"
                             placeholder="0.00"
                           />
                         </div>
                       </div>
                     </div>
                   </>
                 )}

                 {/* Bottom Row: Sizing */}
                 {(!editItemObj.itemType || editItemObj.itemType === 'garment') && (
                   <div className="flex flex-col gap-3">
                     <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <label className="text-xs font-bold uppercase tracking-widest text-brand-secondary">Size Spread Matrix</label>
                          <button
                            type="button"
                            onClick={() => {
                              const youthSizes = { 'YXS': 0, 'YS': 0, 'YM': 0, 'YL': 0, 'YXL': 0 };
                              setEditItemObj({
                                ...editItemObj,
                                sizes: { ...youthSizes, ...(editItemObj.sizes || {}) }
                              });
                            }}
                            className="text-[10px] font-bold uppercase tracking-wider text-brand-primary border border-brand-primary/20 hover:bg-brand-primary/5 px-2.5 py-1 rounded-full transition-all cursor-pointer"
                          >
                            + Add Youth Sizing
                          </button>
                        </div>
                       <span className="text-xs font-semibold text-brand-primary bg-brand-primary/10 px-2 py-0.5 rounded-full">
                          {Number(Object.values(editItemObj.sizes || {}).reduce((a: any, b: any) => a + (parseInt(b) || 0), 0))} Total Units
                       </span>
                     </div>
                     <div className="bg-white p-6 rounded-xl border border-brand-border shadow-sm">
                       <div className="grid grid-cols-4 sm:grid-cols-6 xl:grid-cols-9 lg:grid-cols-8 gap-4">
                         {Array.from(new Set([...SIZE_ORDER, ...Object.keys(editItemObj.sizes || {})])).sort(sortSizes).map((size) => (
                           <div key={size} className="flex flex-col group relative">
                             <label className="block text-[10px] font-extrabold text-center text-gray-500 mb-2 uppercase tracking-wide group-hover:text-brand-primary transition-colors">{size}</label>
                             <input 
                               type="number" 
                               min="0"
                               value={editItemObj.sizes?.[size] === 0 ? '' : (editItemObj.sizes?.[size] || '')}
                               onChange={(e) => setEditItemObj({
                                 ...editItemObj, 
                                 sizes: { ...editItemObj.sizes, [size]: parseInt(e.target.value) || 0 }
                               })}
                               className={`w-full bg-brand-bg/50 border border-brand-border rounded-lg px-2 py-2.5 text-sm text-center focus:border-brand-primary focus:bg-white focus:ring-1 focus:ring-brand-primary focus:outline-none transition-all font-bold ${editItemObj.sizes?.[size] > 0 ? 'bg-white border-brand-primary/30 text-brand-primary shadow-sm' : 'text-gray-400'}`}
                               placeholder="-"
                             />
                             {editItemObj.shopifyInventoryMap && editItemObj.shopifyInventoryMap[size] !== undefined && (
                                <div className="absolute top-[108%] left-1/2 -translate-x-1/2 w-full text-center pointer-events-none">
                                  <p className={`text-[9px] font-bold tracking-wide leading-tight ${editItemObj.shopifyInventoryMap[size] > 0 ? 'text-green-600' : 'text-red-500'}`}>
                                    {editItemObj.shopifyInventoryMap[size]} In Stock
                                  </p>
                                </div>
                             )}
                           </div>
                         ))}
                       </div>
                     </div>
                   </div>
                 )}

              </div>
              
              {/* Footer Actions */}
              <div className="lg:col-span-12 flex flex-col sm:flex-row justify-between items-center gap-4 pt-6 border-t border-brand-border mt-2 sticky bottom-0 bg-brand-bg/95 backdrop-blur-md pb-2 -mb-2">
                 <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                   <button 
                     onClick={handleDeleteItem} 
                     className="px-5 py-2.5 text-red-500 hover:text-white font-bold bg-white hover:bg-red-500 rounded-xl transition-colors flex items-center justify-center border border-red-200 hover:border-red-500 shadow-sm w-full sm:w-auto"
                     title="Delete Item"
                     disabled={isItemSaving}
                   >
                     <Trash2 size={18} className="mr-2" /> Delete Segment
                   </button>
                   <button 
                     onClick={() => handleDuplicateItem(editItemObj)} 
                     className="px-5 py-2.5 text-brand-primary hover:text-white font-bold bg-white hover:bg-brand-primary rounded-xl transition-colors flex items-center justify-center border border-brand-border hover:border-brand-primary shadow-sm w-full sm:w-auto"
                     title="Duplicate Garment"
                     disabled={isItemSaving}
                   >
                     <Copy size={18} className="mr-2" /> Duplicate Garment
                   </button>
                 </div>
                 <div className="flex items-center gap-4 w-full sm:w-auto">
                   <PillButton variant="outline" onClick={() => setEditItemObj(null)} className="flex-1 sm:flex-none justify-center py-2.5 px-8 bg-white">
                     Cancel
                   </PillButton>
                   <PillButton variant="filled" onClick={handleSaveItemEdit} className="flex-1 sm:flex-none justify-center py-2.5 px-10 shadow-md shadow-brand-primary/20" disabled={isItemSaving}>
                     {isItemSaving ? <Loader2 className="animate-spin" size={18} /> : <span>Save Specifications</span>}
                   </PillButton>
                 </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Image Overlay */}
      {expandedImage && (
        <div 
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6 animate-in fade-in duration-200" 
          onClick={() => setExpandedImage(null)}
        >
           <button 
             className="absolute top-6 right-6 text-neutral-800 hover:text-black hover:scale-105 transition-all p-2 bg-white rounded-full shadow-lg border border-neutral-100 z-50 cursor-pointer" 
             onClick={() => setExpandedImage(null)}
           >
             <X size={20} />
           </button>
           <div 
             className="relative max-w-4xl max-h-[85vh] w-full bg-checkerboard rounded-[2rem] p-6 md:p-10 shadow-2xl overflow-hidden flex items-center justify-center border border-neutral-200/50 cursor-crosshair animate-in zoom-in-95 duration-200"
             onClick={(e) => e.stopPropagation()}
             onMouseMove={(e) => {
               const { left, top, width, height } = e.currentTarget.getBoundingClientRect();
               const x = (e.clientX - left) / width;
               const y = (e.clientY - top) / height;
               const img = e.currentTarget.querySelector('img');
               if (img) img.style.transformOrigin = `${x * 100}% ${y * 100}%`;
             }}
             title="Hover to zoom"
           >
             <img 
               src={expandedImage.src} 
               alt={expandedImage.alt} 
               style={{ width: 'auto', height: 'auto', maxWidth: '100%', maxHeight: '70vh' }}
               className="rounded-2xl select-none transition-transform duration-200 ease-out hover:scale-[2]" 
             />
           </div>
        </div>
      )}

      {/* Quick Ship Modal */}
      {quickShipItem && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setQuickShipItem(null)}>
          <div className="bg-white rounded-3xl p-6 md:p-8 max-w-lg w-full flex flex-col shadow-2xl border border-brand-border" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-2">
               <h3 className="text-2xl font-black text-gray-900 leading-tight">Quick Ship</h3>
               <button className="p-2 bg-neutral-100 hover:bg-neutral-200 rounded-full transition-colors" onClick={() => setQuickShipItem(null)}><X size={16} /></button>
            </div>
            
            <p className="font-semibold text-brand-primary mb-6 flex items-center gap-2 flex-wrap">
              <span className="bg-black text-white text-[10px] px-2 py-0.5 rounded uppercase tracking-widest shrink-0">Target Garment</span> 
              <span>{quickShipItem.style}</span>
            </p>
            
            <p className="text-[13px] text-gray-500 mb-6 font-medium bg-neutral-50 p-3 rounded-xl border border-neutral-100">Select sizes and quantities to pack. A new discrete tracking box will automatically generate containing precisely these items.</p>
            
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-3 mb-8">
               {Object.entries(quickShipItem.remainingSizes).sort(([a], [b]) => sortSizes(a, b)).map(([size, maxQty]: [string, any]) => {
                  if (maxQty === 0) return null;
                  return (
                    <div key={size} className="grid grid-rows-[1fr_auto] border border-brand-border shadow-sm rounded-xl overflow-hidden focus-within:border-black focus-within:ring-1 focus-within:ring-black transition-all bg-white group">
                       <div className="bg-neutral-100/60 p-1.5 flex flex-col items-center justify-center min-h-[44px] border-b border-brand-border group-focus-within:bg-neutral-100 transition-colors">
                         <span className="text-[10px] font-bold uppercase tracking-wider text-brand-secondary leading-tight text-center line-clamp-2">{size}</span>
                       </div>
                       <div className="bg-white flex flex-col items-center justify-center py-2.5 h-full gap-1.5">
                         <input 
                           type="number"
                           min="0"
                           max={maxQty}
                           value={quickShipSizes[size] === 0 ? '' : quickShipSizes[size]}
                           onChange={(e) => {
                              let val = parseInt(e.target.value) || 0;
                              if (val > maxQty) val = maxQty;
                              if (val < 0) val = 0;
                              setQuickShipSizes(prev => ({ ...prev, [size]: val }));
                           }}
                           className="w-full bg-transparent px-2 text-xl font-black text-center focus:outline-none placeholder:text-gray-200"
                           placeholder="0"
                         />
                         <span className="text-[10px] bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md text-blue-700 font-bold uppercase tracking-widest shadow-sm">Max {maxQty}</span>
                       </div>
                    </div>
                  )
               })}
            </div>
            
            <div className="flex gap-4">
              <PillButton variant="outline" onClick={() => setQuickShipItem(null)} className="flex-1 justify-center py-4">Cancel</PillButton>
              <PillButton variant="filled" className="flex-1 justify-center bg-black text-white hover:bg-neutral-800 py-4 shadow-lg shadow-black/10" onClick={handleSaveQuickShip}>Submit Shipment</PillButton>
            </div>
          </div>
        </div>
      )}

      {isTeamModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setIsTeamModalOpen(false)}>
          <div className="bg-white rounded-3xl p-6 md:p-8 max-w-sm w-full flex flex-col shadow-2xl border border-brand-border" onClick={(e) => e.stopPropagation()}>
             <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-black text-gray-900 leading-tight">Add Team Member</h3>
                <button className="p-2 bg-neutral-100 hover:bg-neutral-200 rounded-full transition-colors" onClick={() => setIsTeamModalOpen(false)}><X size={16} /></button>
             </div>
             
             <div className="flex flex-col gap-3 max-h-[300px] overflow-y-auto custom-scrollbar mb-6">
                {allUsers.filter(u => !(order.team || []).some((m: any) => m.id === u.id || m.name === u.name)).map(user => (
                  <button 
                    key={user.id} 
                    onClick={() => handleAddTeamMember(user)}
                    className="flex justify-between items-center p-3 hover:bg-brand-bg rounded-xl border border-transparent hover:border-brand-border transition-colors text-left"
                  >
                     <div>
                       <p className="font-bold text-sm text-brand-primary truncate">{user.name || user.email?.split('@')[0] || 'Unknown User'}</p>
                       <p className="text-[10px] uppercase tracking-widest text-brand-secondary mt-0.5">{user.role || 'Staff'}</p>
                     </div>
                     <Plus size={16} className="text-brand-secondary p-0.5 border border-brand-border rounded-full" />
                  </button>
                ))}
                {allUsers.filter(u => !(order.team || []).some((m: any) => m.id === u.id || m.name === u.name)).length === 0 && (
                  <div className="text-sm text-center text-brand-secondary py-4">All available users are already on the team.</div>
                )}
             </div>
             <PillButton variant="outline" onClick={() => setIsTeamModalOpen(false)} className="w-full justify-center">Done</PillButton>
          </div>
        </div>
      )}

      {trackingBoxId && (
        <TrackingModal
          order={order}
          boxId={trackingBoxId}
          onClose={() => setTrackingBoxId(null)}
        />
      )}

      <PalletPickOptimizerModal
        isOpen={isPalletOptimizerOpen}
        onClose={() => setIsPalletOptimizerOpen(false)}
        preSelectedOrder={order}
      />

      {contextMenu && (
        <div 
          className="fixed inset-0 z-[200]" 
          onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
          onClick={() => setContextMenu(null)}
        >
          <div 
            className="absolute bg-white rounded-xl shadow-2xl border border-brand-border overflow-y-auto custom-scrollbar min-w-[220px] max-h-[50vh] flex flex-col z-[201] p-1"
            style={{ 
              top: Math.min(contextMenu.y, window.innerHeight - Math.min(window.innerHeight * 0.5, (order.boxes?.length || 0) * 36 + 180)), 
               left: Math.min(contextMenu.x, window.innerWidth - 240) 
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-2 border-b border-brand-border/50 mb-1 flex items-center justify-between pointer-events-none sticky top-0 bg-white z-10">
              <span className="text-[10px] uppercase font-bold text-brand-secondary tracking-widest">{contextMenu.size} Options</span>
              <span className="text-[10px] font-bold text-brand-primary bg-brand-bg px-2 py-0.5 rounded-full">Qty: {contextMenu.qty}</span>
            </div>
            
            {contextMenu.item.inProgressSizes?.[contextMenu.size] && contextMenu.item.inProgressSizes[contextMenu.size].user === (user?.email || 'Team Member') && (
               <>
                 {contextMenu.item.inProgressSizes[contextMenu.size].paused ? (
                   <button 
                     onClick={() => handleContextMenuAction('resume_timer')}
                     className="text-left px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-green-600 hover:bg-green-50 rounded-lg transition-colors flex items-center gap-2"
                   >
                     <Play size={14} /> Resume Timer
                   </button>
                 ) : (
                   <button 
                     onClick={() => handleContextMenuAction('pause_timer')}
                     className="text-left px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-orange-600 hover:bg-orange-50 rounded-lg transition-colors flex items-center gap-2"
                   >
                     <Pause size={14} /> Pause Timer
                   </button>
                 )}
                 <button 
                   onClick={() => handleContextMenuAction('cancel_timer')}
                   className="text-left px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-2"
                 >
                   <X size={14} /> Cancel Timer
                 </button>
               </>
            )}

            {contextMenu.item.completedSizes?.includes(contextMenu.size) && (!contextMenu.item.sizeStats?.[contextMenu.size]?.user || contextMenu.item.sizeStats[contextMenu.size].user === (user?.email || 'Team Member')) && (
               <button 
                 onClick={() => handleContextMenuAction('uncomplete')}
                 className="text-left px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-orange-600 hover:bg-orange-50 rounded-lg transition-colors flex items-center gap-2"
               >
                 <X size={14} /> Uncomplete Size
               </button>
            )}

            {!contextMenu.item.completedSizes?.includes(contextMenu.size) && !contextMenu.item.inProgressSizes?.[contextMenu.size] && (
               <>
                 {contextMenu.item.orderedSizes?.includes(contextMenu.size) ? (
                   <button 
                     onClick={() => handleContextMenuAction('unorder')}
                     className="text-left px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-amber-600 hover:bg-amber-50 rounded-lg transition-colors flex items-center gap-2"
                   >
                     <X size={14} /> Unmark Ordered
                   </button>
                 ) : (
                   <button 
                     onClick={() => handleContextMenuAction('mark_ordered')}
                     className="text-left px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-amber-600 hover:bg-amber-50 rounded-lg transition-colors flex items-center gap-2"
                   >
                     <ShoppingBag size={14} className="text-amber-600" /> Mark Ordered
                   </button>
                 )}

                 {contextMenu.item.receivedSizes?.includes(contextMenu.size) ? (
                   <button 
                     onClick={() => handleContextMenuAction('unreceive')}
                     className="text-left px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-orange-600 hover:bg-orange-50 rounded-lg transition-colors flex items-center gap-2"
                   >
                     <X size={14} /> Unmark Received
                   </button>
                 ) : (
                   <button 
                     onClick={() => handleContextMenuAction('mark_received')}
                     className="text-left px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors flex items-center gap-2"
                   >
                     <Check size={14} strokeWidth={3} className="text-indigo-600" /> Mark Received
                   </button>
                 )}

                 {contextMenu.item.returnedSizes?.includes(contextMenu.size) ? (
                   <button 
                     onClick={() => handleContextMenuAction('unmark_return')}
                     className="text-left px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-rose-600 hover:bg-rose-50 rounded-lg transition-colors flex items-center gap-2"
                   >
                     <RotateCcw size={14} className="text-rose-600" /> Unmark Return
                   </button>
                 ) : (
                   <button 
                     onClick={() => handleContextMenuAction('mark_return')}
                     className="text-left px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-rose-600 hover:bg-rose-50 rounded-lg transition-colors flex items-center gap-2"
                   >
                     <RotateCcw size={14} className="text-rose-600" /> Mark for Return
                   </button>
                 )}
               </>
            )}

            {((contextMenu.item.inProgressSizes?.[contextMenu.size] && contextMenu.item.inProgressSizes[contextMenu.size].user === (user?.email || 'Team Member')) || 
               (contextMenu.item.completedSizes?.includes(contextMenu.size) && (!contextMenu.item.sizeStats?.[contextMenu.size]?.user || contextMenu.item.sizeStats[contextMenu.size].user === (user?.email || 'Team Member'))) ||
               (!contextMenu.item.completedSizes?.includes(contextMenu.size) && !contextMenu.item.inProgressSizes?.[contextMenu.size])) && (
               <div className="my-1 border-t border-brand-border/30"></div>
            )}

            <div className="px-3 py-2 text-[10px] font-bold uppercase text-brand-secondary tracking-widest bg-white sticky top-9 z-10 border-b border-brand-border/30 mb-1">Add to Package</div>
            
            <div className="flex flex-col gap-0.5">
               {order.boxes && order.boxes.length > 0 ? (
                   order.boxes.map((box: any) => (
                      <button 
                        key={box.id}
                        onClick={() => handleContextMenuAction('add_to_box', box.id)}
                        className="text-left px-3 py-2 text-[12px] font-bold tracking-wider text-brand-primary hover:bg-brand-bg hover:text-black rounded-lg transition-colors flex items-center gap-2.5"
                      >
                        <Box size={14} className="text-brand-secondary" /> Add to {box.name}
                      </button>
                   ))
               ) : (
                   <div className="px-3 py-3 text-[11px] font-medium text-brand-secondary italic text-center">No shipments created yet.</div>
               )}
            </div>
          </div>
        </div>
      )}

      {/* Add From Deck Modal */}
      {isDeckModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto" onClick={() => setIsDeckModalOpen(false)}>
          <div className="bg-brand-bg rounded-3xl p-0 max-w-2xl w-full flex flex-col shadow-2xl border border-brand-border my-auto overflow-hidden max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <div className="px-8 py-6 border-b border-brand-border bg-white flex items-center justify-between sticky top-0 z-10 shadow-sm">
              <div>
                <h2 className="text-xl font-serif text-brand-primary">Select from Assigned Decks</h2>
                <p className="text-sm font-medium text-brand-secondary mt-1">Pre-fill the item editor with a garment from the catalog.</p>
              </div>
              <button 
                onClick={() => setIsDeckModalOpen(false)}
                className="w-10 h-10 rounded-full bg-neutral-50 border border-brand-border flex items-center justify-center text-brand-secondary hover:text-black hover:border-black transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-8 custom-scrollbar bg-neutral-50 min-h-[400px]">
              {isLoadingDecks ? (
                <div className="flex items-center justify-center p-8">
                  <div className="animate-spin w-8 h-8 border-4 border-brand-primary border-t-transparent rounded-full"></div>
                </div>
              ) : customerDecks.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 text-center text-brand-secondary h-full">
                  <PackagePlus size={32} className="mb-4 text-brand-secondary/40" />
                  <p>No catalog decks connected for this client.</p>
                  <p className="text-xs mt-2">Connect decks via the Edit Company panel.</p>
                </div>
              ) : (
                customerDecks.map((deck) => (
                  <div key={deck.id || deck.name} className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <div className="bg-white rounded-2xl p-6 border border-brand-border flex flex-col justify-center items-center text-center shadow-[0_2px_10px_rgb(0,0,0,0.02)]">
                       <h3 className="font-bold text-brand-primary tracking-tight text-lg">{deck.name || "Catalog Deck"}</h3>
                       {deck.name && (
                         <p className="text-brand-secondary font-bold mt-1 uppercase tracking-widest text-[10px]">Active Collection</p>
                       )}
                    </div>

                    <div className="flex flex-col gap-3 mt-1">
                      {(deck.items || deck.garments || []).map((item: any, idx: number) => {
                        const style = item.garment_name || item.name || item.style || item.title || 'Unknown Style';
                        const gender = item.gender || 'Unisex';
                        const itemNum = item.itemNum || item.garment_id || item.sku || item.id || `GARMENT-${idx+1}`;
                        let colors = ['Custom Color']; 
                        if (Array.isArray(item.colors) && item.colors.length > 0) colors = item.colors;
                        else if (Array.isArray(item.availableColors)) colors = item.availableColors;
                        else if (Array.isArray(item.variations) && item.variations.length > 0) colors = item.variations.map((v:any) => v.color).filter(Boolean);
                        
                        const image = item.mockup_image || item.mock_image || item.original_image || item.image || item.imageUrl || 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&q=80&w=200&h=200';
                        
                        const deckStr = JSON.stringify(deck).toLowerCase();
                        const itemStr = JSON.stringify(item).toLowerCase();
                        const isRush = deckStr.includes('rush') || itemStr.includes('rush') || deckStr.includes('rush_fee') || itemStr.includes('rush_fee');
                        
                        const basePrice = parseFloat((item.msrp || item.price || item.unit_cost || '0').toString().replace(/[^0-9.]/g, '')) || 0;
                        const numericPrice = isRush ? basePrice * 1.15 : basePrice;
                        const formattedPrice = numericPrice ? `$${numericPrice.toFixed(2)}` : '$0.00';
                        
                        return (
                          <div 
                            key={item.id || idx} 
                            onClick={() => {
                               setIsDeckModalOpen(false);

                               // Construct sizes object properly to handle both arrays (e.g. ['S', 'M']) and objects
                               let initialSizes: Record<string, number> = { 'XS': 0, 'S': 0, 'M': 0, 'L': 0, 'XL': 0, '2XL': 0, '3XL': 0, 'OSFA': 0 };
                               if (Array.isArray(item.sizes)) {
                                 item.sizes.forEach((s: any) => {
                                   if (typeof s === 'string') {
                                     initialSizes[s] = 0;
                                   }
                                 });
                               } else if (item.sizes && typeof item.sizes === 'object') {
                                 initialSizes = { ...initialSizes, ...item.sizes };
                               }

                               setEditItemObj({
                                 id: `item-${Date.now()}`,
                                 gender: gender,
                                 style: style,
                                 itemNum: itemNum,
                                 color: colors[0] || '',
                                 sizes: initialSizes,
                                 price: numericPrice ? numericPrice : formattedPrice,
                                 qty: 0,
                                 total: '$0.00',
                                 image: image,
                                 materialDetails: item.fabric_details || item.materialDetails || item.fabric || item.garment?.fabric || item.garmentSpecs?.fabric || item.specs?.fabric || '',
                                 materialFinish: item.fabric_finish || item.fabricFinish || item.finish || item.garment?.finish || item.garmentSpecs?.finish || item.specs?.finish || '',
                                 fit: item.fit_cut || item.fit || item.garment?.fit || item.garmentSpecs?.fit || item.specs?.fit || '',
                                 weight: item.fabric_weight_gsm || item.fabric_weight || item.weight || item.garment?.weight || item.garmentSpecs?.weight || item.specs?.weight || '',
                                 careInstructions: item.care_instructions || item.careInstructions || item.garment?.careInstructions || item.garmentSpecs?.careInstructions || item.specs?.careInstructions || '',
                                 decoratingMethods: item.decoration_method || item.decorating_methods || item.decoratingMethods || item.garment?.decoratingMethods || item.garmentSpecs?.decoratingMethods || item.specs?.decoratingMethods || [],
                                 threadColors: item.thread_colors || item.threadColors || item.garment?.threadColors || item.garmentSpecs?.threadColors || item.specs?.threadColors || '',
                                 turnaroundTime: item.turn_time || item.turnaround_time || item.turnaroundTime || item.garment?.turnaroundTime || item.garmentSpecs?.turnaroundTime || item.specs?.turnaroundTime || '',
                                 moq: item.moq || item.garment?.moq || item.garmentSpecs?.moq || item.specs?.moq || '',
                                 costPrice: item.cost_price || item.costPrice || item.garment?.costPrice || item.garment?.cost_price || item.garmentSpecs?.costPrice || item.specs?.costPrice || '',
                                 wholesalePrice: item.wholesale_price || item.wholesalePrice || item.garment?.wholesalePrice || item.garment?.wholesale_price || item.garmentSpecs?.wholesalePrice || item.specs?.wholesalePrice || ''
                               });
                            }}
                            className="group flex items-center gap-5 bg-white border border-brand-border hover:border-brand-primary transition-colors rounded-2xl p-4 cursor-pointer shadow-sm hover:shadow-md hover:-translate-y-0.5"
                          >
                            <div className="w-16 h-16 rounded-[14px] overflow-hidden bg-transparent shrink-0 flex items-center justify-center">
                              <img src={image} alt={style} className="w-full h-full object-contain p-1 mix-blend-multiply" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1">
                                 <h4 className="font-bold text-brand-primary text-[15px] truncate pr-2">{style}</h4>
                                 <span className="text-[10px] font-bold text-brand-secondary bg-brand-bg px-2 py-0.5 rounded-full shrink-0">{gender}</span>
                              </div>
                              {itemNum && itemNum.length < 15 && (
                                <p className="text-xs font-semibold text-brand-secondary">{itemNum}</p>
                              )}
                              <p className="text-xs text-brand-secondary/60 font-medium mt-1 truncate max-w-sm">{colors.join(' • ')}</p>
                            </div>
                            <div className="w-8 h-8 rounded-full bg-brand-bg text-brand-secondary group-hover:bg-brand-primary group-hover:text-white flex items-center justify-center transition-colors shrink-0">
                               <PackagePlus size={16} strokeWidth={2.5} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {customizingItem && (
        <GarmentCustomizerModal
          isOpen={!!customizingItem}
          onClose={() => setCustomizingItem(null)}
          showCatalogSearch={true}
          garment={{
            id: customizingItem.id,
            style: customizingItem.style || customizingItem.garmentName || 'Custom Garment',
            itemNum: customizingItem.itemNum || '',
            image: customizingItem.image || '',
            images: customizingItem.images || null,
            backImages: customizingItem.backImages || null,
            colors: customizingItem.colors || ['Custom Color'],
            selectedColor: customizingItem.color || 'Custom Color',
            originalFrontImage: customizingItem.originalFrontImage || null,
            originalBackImage: customizingItem.originalBackImage || null,
            originalSleeveImage: customizingItem.originalSleeveImage || null,
            customizedFrontImage: customizingItem.customizedFrontImage || null,
            customizedBackImage: customizingItem.customizedBackImage || null,
            customizedSleeveImage: customizingItem.customizedSleeveImage || null,
            customized: customizingItem.customized || false,
            logoUrl: customizingItem.logoUrl || null,
            logoName: customizingItem.logoName || null,
            logoUrlBack: customizingItem.logoUrlBack || null,
            logoNameBack: customizingItem.logoNameBack || null,
            logoUrlLeftSleeve: customizingItem.logoUrlLeftSleeve || null,
            logoNameLeftSleeve: customizingItem.logoNameLeftSleeve || null,
            logoUrlRightSleeve: customizingItem.logoUrlRightSleeve || null,
            logoNameRightSleeve: customizingItem.logoNameRightSleeve || null,
            customScaleFront: customizingItem.customScaleFront,
            customOffsetXFront: customizingItem.customOffsetXFront,
            customOffsetYFront: customizingItem.customOffsetYFront,
            customRotationFront: customizingItem.customRotationFront,
            customScaleBack: customizingItem.customScaleBack,
            customOffsetXBack: customizingItem.customOffsetXBack,
            customOffsetYBack: customizingItem.customOffsetYBack,
            customRotationBack: customizingItem.customRotationBack,
            customScaleLeftSleeve: customizingItem.customScaleLeftSleeve,
            customOffsetXLeftSleeve: customizingItem.customOffsetXLeftSleeve,
            customOffsetYLeftSleeve: customizingItem.customOffsetYLeftSleeve,
            customRotationLeftSleeve: customizingItem.customRotationLeftSleeve,
            customScaleRightSleeve: customizingItem.customScaleRightSleeve,
            customOffsetXRightSleeve: customizingItem.customOffsetXRightSleeve,
            customOffsetYRightSleeve: customizingItem.customOffsetYRightSleeve,
            customRotationRightSleeve: customizingItem.customRotationRightSleeve
          }}
          customerId={order?.customerId || 'CUS-001'}
          onSave={(customizedData) => {
            setEditItemObj((prev: any) => ({
              ...prev,
              style: customizedData.style,
              itemNum: customizedData.itemNum || '',
              color: customizedData.selectedColor,
              image: customizedData.image,
              customized: true,
              logoPlacement: customizedData.logoPlacement,
              originalFrontImage: customizedData.originalFrontImage,
              originalBackImage: customizedData.originalBackImage,
              originalSleeveImage: customizedData.originalSleeveImage,
              customizedFrontImage: customizedData.customizedFrontImage,
              customizedBackImage: customizedData.customizedBackImage,
              customizedSleeveImage: customizedData.customizedSleeveImage,
              logoUrl: customizedData.logoUrl,
              logoName: customizedData.logoName,
              logoUrlBack: customizedData.logoUrlBack,
              logoNameBack: customizedData.logoNameBack,
              logoUrlLeftSleeve: customizedData.logoUrlLeftSleeve || null,
              logoNameLeftSleeve: customizedData.logoNameLeftSleeve || null,
              logoUrlRightSleeve: customizedData.logoUrlRightSleeve || null,
              logoNameRightSleeve: customizedData.logoNameRightSleeve || null,
              colors: customizedData.colors || prev.colors,
              images: customizedData.images || null,
              backImages: customizedData.backImages || null,
              customScaleFront: customizedData.customScaleFront,
              customOffsetXFront: customizedData.customOffsetXFront,
              customOffsetYFront: customizedData.customOffsetYFront,
              customRotationFront: customizedData.customRotationFront,
              customScaleBack: customizedData.customScaleBack,
              customOffsetXBack: customizedData.customOffsetXBack,
              customOffsetYBack: customizedData.customOffsetYBack,
              customRotationBack: customizedData.customRotationBack,
              customScaleLeftSleeve: customizedData.customScaleLeftSleeve,
              customOffsetXLeftSleeve: customizedData.customOffsetXLeftSleeve,
              customOffsetYLeftSleeve: customizedData.customOffsetYLeftSleeve,
              customRotationLeftSleeve: customizedData.customRotationLeftSleeve,
              customScaleRightSleeve: customizedData.customScaleRightSleeve,
              customOffsetXRightSleeve: customizedData.customOffsetXRightSleeve,
              customOffsetYRightSleeve: customizedData.customOffsetYRightSleeve,
              customRotationRightSleeve: customizedData.customRotationRightSleeve
            }));
          }}
        />
      )}

    </div>
  );
}
