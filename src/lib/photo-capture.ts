/**
 * Photo capture helper — «сфотографировать прямо сейчас» for photo attach dialogs.
 *
 * Two backends, chosen automatically:
 * - Native (Capacitor Android shell): @capacitor/camera → launches the native
 *   camera activity and returns the shot as a data-URL. Same auto-registration
 *   mechanism as the other npm Capacitor plugins (no manual registerPlugin —
 *   `npx cap sync android` wires it into the APK).
 * - Browser (PWA): a programmatic <input type="file" capture="environment"> —
 *   mobile browsers open the camera app; if a browser ignores the capture
 *   attribute it opens the gallery instead (graceful fallback — a photo can
 *   still be picked).
 *
 * The captured image is compressed with the same pipeline as gallery
 * attachments (image-utils), so callers get identical JPEG data-URLs.
 */

import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { compressDataUrl, compressImageFile } from './image-utils';

/** True when running inside the Capacitor Android shell (native camera available). */
export function isNativeCameraAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

/**
 * Take a photo with the device camera right now and return a compressed
 * JPEG data-URL ("data:image/jpeg;base64,..."), or null when the user
 * cancelled. Throws with a user-friendly message when the camera is
 * unavailable or permission was denied.
 */
export async function takePhotoNow(
  maxSide: number = 1024,
  quality: number = 0.8
): Promise<string | null> {
  if (isNativeCameraAvailable()) {
    const photo = await Camera.getPhoto({
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Camera,
      quality: 90,
      // Camera-side downscale hint before the JS compression pass
      width: 2048,
      height: 2048,
      correctOrientation: true,
      saveToGallery: false,
    });
    if (!photo.dataUrl) return null;
    return compressDataUrl(photo.dataUrl, maxSide, quality);
  }

  // Browser path: hidden capture input (camera on mobile, gallery fallback)
  const file = await openCaptureFileInput();
  if (!file) return null;
  return compressImageFile(file, maxSide, quality);
}

/**
 * Open a one-off <input type="file" accept="image/*" capture="environment">
 * and resolve with the selected/captured File, or null when cancelled.
 * Browsers that do not support the capture attribute simply open the
 * gallery picker instead — the photo can still be attached.
 */
function openCaptureFileInput(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.setAttribute('capture', 'environment');
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    input.style.opacity = '0';

    let settled = false;
    const finish = (file: File | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      window.removeEventListener('focus', onFocus);
      resolve(file);
    };

    // When the user returns to the page without choosing a file the picker
    // was cancelled (no change event fires). Small delay lets a real
    // selection's change event win the race.
    const onFocus = () => {
      window.setTimeout(() => finish(input.files?.[0] ?? null), 800);
    };

    input.addEventListener('change', () => {
      finish(input.files?.[0] ?? null);
    });
    window.addEventListener('focus', onFocus);

    document.body.appendChild(input);
    input.click();
  });
}
