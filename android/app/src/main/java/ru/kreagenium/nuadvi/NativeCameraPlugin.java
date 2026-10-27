package ru.kreagenium.nuadvi;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.media.ExifInterface;
import android.net.Uri;
import android.provider.MediaStore;
import android.util.Base64;

import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Local Capacitor plugin: take a photo with the device camera right now and
 * return it as a compressed JPEG data-URL.
 *
 * Why it exists: the @capacitor/camera npm plugin resolves Camera.getPhoto()
 * to its deprecated Android "legacy flow", which decodes the captured photo
 * with BitmapFactory.decodeFile() at FULL sensor resolution — no inSampleSize
 * and no OutOfMemoryError handling (its gallery path catches OOM, its camera
 * path does not). A modern 12–108 MP shot needs 48–430 MB of heap for that
 * decode, which reliably kills the process — the reported "app crashes when
 * taking a photo".
 *
 * This plugin runs the standard ACTION_IMAGE_CAPTURE intent flow but processes
 * the capture in an OOM-safe way, mirroring the JS-side compression pipeline
 * (src/lib/image-utils.ts):
 *   1. decode bounds only → pick a power-of-two inSampleSize so the sampled
 *      decode never exceeds ~2× the requested max side (≤ ~16 MB of heap);
 *   2. rotate by EXIF orientation (read from the file before decode) →
 *      sampled decode → exact scale to maxSide;
 *   3. JPEG-compress and base64-encode on a worker thread (PluginCall
 *      resolve/reject is thread-safe in Capacitor).
 *
 * The capture target is an internal cache file exposed to the camera app via
 * the app's FileProvider (android/app/src/main/res/xml/file_paths.xml already
 * maps cache-path), and it is deleted right after processing. The CAMERA
 * runtime permission is requested through the Capacitor permission API
 * (alias "camera"), so the user gets the standard system dialog on first use.
 */
@CapacitorPlugin(
    name = "NativeCamera",
    permissions = {
        @Permission(strings = { android.Manifest.permission.CAMERA }, alias = NativeCameraPlugin.CAMERA_ALIAS)
    }
)
public class NativeCameraPlugin extends Plugin {

    /** Alias must be public: class-level @Permission annotations cannot see private constants. */
    public static final String CAMERA_ALIAS = "camera";

    /** Single worker for bitmap decode/compress (one thread for the app lifetime). */
    private static final ExecutorService PROCESSOR = Executors.newSingleThreadExecutor();

    /** Absolute path of the capture target file while the camera app is open. */
    private String pendingCapturePath;

    @Override
    public void load() {
        super.load();
        // Remove stale captures from previous sessions (they are never reused)
        File[] files = getCaptureDir().listFiles();
        if (files != null) {
            for (File f : files) {
                //noinspection ResultOfMethodCallIgnored
                f.delete();
            }
        }
    }

    @PluginMethod
    public void takePhoto(PluginCall call) {
        Context ctx = getContext();
        PackageManager pm = ctx.getPackageManager();
        if (!pm.hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY)) {
            call.reject("На устройстве нет камеры", "NO_CAMERA");
            return;
        }

        if (getPermissionState(CAMERA_ALIAS) != PermissionState.GRANTED) {
            requestPermissionForAlias(CAMERA_ALIAS, call, "cameraPermissionCallback");
            return;
        }
        openCamera(call);
    }

    @PermissionCallback
    private void cameraPermissionCallback(PluginCall call) {
        if (getPermissionState(CAMERA_ALIAS) != PermissionState.GRANTED) {
            call.reject(
                "Доступ к камере запрещён. Разрешите камеру для приложения в настройках системы",
                "PERMISSION_DENIED"
            );
            return;
        }
        openCamera(call);
    }

    private void openCamera(PluginCall call) {
        try {
            Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            if (intent.resolveActivity(getContext().getPackageManager()) == null) {
                call.reject("Камера недоступна на этом устройстве", "NO_CAMERA_APP");
                return;
            }

            File captureFile = new File(getCaptureDir(), "capture_" + System.currentTimeMillis() + ".jpg");
            pendingCapturePath = captureFile.getAbsolutePath();

            Uri uri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                captureFile
            );
            intent.putExtra(MediaStore.EXTRA_OUTPUT, uri);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            startActivityForResult(call, intent, "onCaptureResult");
        } catch (Exception e) {
            pendingCapturePath = null;
            call.reject("Не удалось запустить камеру", "CAMERA_START_FAILED");
        }
    }

    @ActivityCallback
    private void onCaptureResult(PluginCall call, ActivityResult result) {
        final String path = pendingCapturePath;
        pendingCapturePath = null;

        if (call == null) {
            // Activity was restored after process death and the call was
            // dropped — just clean up the capture file.
            deleteQuietly(path);
            return;
        }

        if (result == null || result.getResultCode() != Activity.RESULT_OK || path == null) {
            deleteQuietly(path);
            call.resolve(cancelledResult());
            return;
        }

        final int maxSide = call.getInt("maxSide", 1024);
        final int quality = call.getInt("quality", 80);

        // Decode + compress off the main thread; resolve/reject are thread-safe.
        PROCESSOR.execute(() -> {
            try {
                String dataUrl = processCaptureFile(path, maxSide, quality);
                deleteQuietly(path);
                JSObject ret = new JSObject();
                ret.put("cancelled", false);
                ret.put("dataUrl", dataUrl);
                call.resolve(ret);
            } catch (Throwable fileFailure) {
                deleteQuietly(path);
                // Fallback for camera apps that ignore EXTRA_OUTPUT and return
                // a small thumbnail bitmap in the result extras instead.
                Bitmap thumbnail = extractThumbnail(result);
                if (thumbnail != null) {
                    try {
                        String dataUrl = processBitmap(thumbnail, 0, maxSide, quality);
                        JSObject ret = new JSObject();
                        ret.put("cancelled", false);
                        ret.put("dataUrl", dataUrl);
                        call.resolve(ret);
                        return;
                    } catch (Throwable t2) {
                        // fall through to the reject below
                    }
                }
                call.reject("Не удалось обработать снимок", "PROCESS_FAILED");
            }
        });
    }

    // ─── Image pipeline (OOM-safe) ──────────────────────────────────────────

    private static String processCaptureFile(String path, int maxSide, int quality) throws Exception {
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeFile(path, bounds);
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
            throw new IllegalStateException("Not a decodable image: " + path);
        }

        int exifDegrees = readExifRotationDegrees(path);

        BitmapFactory.Options opts = new BitmapFactory.Options();
        opts.inSampleSize = computeInSampleSize(bounds.outWidth, bounds.outHeight, maxSide);
        Bitmap sampled = BitmapFactory.decodeFile(path, opts);
        if (sampled == null) {
            throw new IllegalStateException("Sampled decode failed: " + path);
        }
        return processBitmap(sampled, exifDegrees, maxSide, quality);
    }

    /** Rotate by exifDegrees, scale to maxSide, compress JPEG → base64 data-URL. Consumes the input bitmap. */
    private static String processBitmap(Bitmap bitmap, int exifDegrees, int maxSide, int quality) throws Exception {
        try {
            if (exifDegrees != 0 && !bitmap.isRecycled()) {
                Matrix matrix = new Matrix();
                matrix.postRotate(exifDegrees);
                Bitmap rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.getWidth(), bitmap.getHeight(), matrix, true);
                if (rotated != bitmap) {
                    bitmap.recycle();
                    bitmap = rotated;
                }
            }
            Bitmap scaled = scaleToMaxSide(bitmap, maxSide);
            if (scaled != bitmap) {
                bitmap.recycle();
                bitmap = scaled;
            }

            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            bitmap.compress(Bitmap.CompressFormat.JPEG, clampQuality(quality), baos);
            return "data:image/jpeg;base64," + Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP);
        } finally {
            if (!bitmap.isRecycled()) {
                bitmap.recycle();
            }
        }
    }

    private static int readExifRotationDegrees(String path) {
        try {
            ExifInterface exif = new ExifInterface(path);
            int orientation = exif.getAttributeInt(
                ExifInterface.TAG_ORIENTATION,
                ExifInterface.ORIENTATION_NORMAL
            );
            switch (orientation) {
                case ExifInterface.ORIENTATION_ROTATE_90:
                    return 90;
                case ExifInterface.ORIENTATION_ROTATE_180:
                    return 180;
                case ExifInterface.ORIENTATION_ROTATE_270:
                    return 270;
                default:
                    return 0;
            }
        } catch (Throwable t) {
            return 0;
        }
    }

    /** Largest power-of-two divisor that keeps the sampled max side below 2×maxSide. */
    private static int computeInSampleSize(int width, int height, int maxSide) {
        int sample = 1;
        int maxDim = Math.max(width, height);
        while (maxDim / (sample * 2) >= maxSide) {
            sample *= 2;
        }
        return sample;
    }

    private static Bitmap scaleToMaxSide(Bitmap bitmap, int maxSide) {
        int w = bitmap.getWidth();
        int h = bitmap.getHeight();
        int maxDim = Math.max(w, h);
        if (maxDim <= maxSide || maxDim == 0) {
            return bitmap;
        }
        float scale = (float) maxSide / (float) maxDim;
        Matrix matrix = new Matrix();
        matrix.postScale(scale, scale);
        Bitmap out = Bitmap.createBitmap(bitmap, 0, 0, w, h, matrix, true);
        return out != null ? out : bitmap;
    }

    private static int clampQuality(int quality) {
        return Math.max(30, Math.min(100, quality));
    }

    // ─── Helpers ────────────────────────────────────────────────────────────

    private File getCaptureDir() {
        File dir = new File(getContext().getCacheDir(), "camera");
        if (!dir.exists()) {
            //noinspection ResultOfMethodCallIgnored
            dir.mkdirs();
        }
        return dir;
    }

    private static Bitmap extractThumbnail(ActivityResult result) {
        try {
            Intent data = result.getData();
            if (data == null || data.getExtras() == null) return null;
            Object thumb = data.getExtras().get("data");
            return thumb instanceof Bitmap ? (Bitmap) thumb : null;
        } catch (Throwable t) {
            return null;
        }
    }

    private static void deleteQuietly(String path) {
        if (path == null) return;
        try {
            //noinspection ResultOfMethodCallIgnored
            new File(path).delete();
        } catch (Throwable ignored) {
        }
    }

    private static JSObject cancelledResult() {
        JSObject ret = new JSObject();
        ret.put("cancelled", true);
        return ret;
    }
}
