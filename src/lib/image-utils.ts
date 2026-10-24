/**
 * Image compression utilities for chat attachments.
 * Downscales images to a max side and re-encodes as JPEG
 * to keep stored data small (base64 in IndexedDB / backups).
 */

export const MAX_IMAGE_SIDE = 1024;
export const IMAGE_JPEG_QUALITY = 0.8;

/**
 * Compress an image File: downscale so the larger side <= maxSide
 * and re-encode as JPEG with the given quality.
 * Returns a data-URL string ("data:image/jpeg;base64,...").
 * Falls back to the original data-URL if canvas is unavailable.
 */
export async function compressImageFile(
  file: File,
  maxSide: number = MAX_IMAGE_SIDE,
  quality: number = IMAGE_JPEG_QUALITY
): Promise<string> {
  const dataUrl = await readFileAsDataUrl(file);
  return compressDataUrl(dataUrl, maxSide, quality);
}

/**
 * Read a File/Blob as a data-URL string.
 */
export function readFileAsDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.readAsDataURL(file);
  });
}

/**
 * Compress an existing data-URL image: downscale to maxSide and
 * re-encode as JPEG. Falls back to the input if anything fails.
 */
export async function compressDataUrl(
  dataUrl: string,
  maxSide: number = MAX_IMAGE_SIDE,
  quality: number = IMAGE_JPEG_QUALITY
): Promise<string> {
  try {
    const img = await loadImage(dataUrl);
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    // No resize needed and already JPEG at reasonable size — still re-encode
    // to normalize format (HEIC/PNG photos can be huge).
    const targetW = Math.max(1, Math.round(img.width * scale));
    const targetH = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, targetW, targetH);
    return canvas.toDataURL('image/jpeg', quality);
  } catch {
    // Fallback: return original if decode/canvas fails
    return dataUrl;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Не удалось загрузить изображение'));
    img.src = src;
  });
}
