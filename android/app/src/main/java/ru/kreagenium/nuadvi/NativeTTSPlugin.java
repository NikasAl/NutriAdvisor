package ru.kreagenium.nuadvi;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

/**
 * Local Capacitor plugin: bridge to the Android platform TextToSpeech engine
 * (android.speech.tts.TextToSpeech).
 *
 * Why it exists: the Android System WebView (which Capacitor runs the app in)
 * deliberately does NOT expose the Web Speech API synthesis side
 * (window.speechSynthesis). Chromium does not implement it in WebView builds —
 * see https://issues.chromium.org/issues/40417848 (crbug.com/487187) and the
 * source comment "They will not be exposed in WebView because they are
 * currently not supported there." No Capacitor/WebView flag can enable it.
 *
 * So on Android the app routes all read-aloud through the system TTS engine
 * via this plugin. The engine used (Google TTS / Samsung TTS / ...) and its
 * voices are the ones configured in the device system settings — the same
 * ones that work there.
 *
 * Threading model: all TextToSpeech interaction happens on the main thread
 * (the engine is created there, and UtteranceProgressListener callbacks are
 * delivered on the looper of the creating thread). PluginCall resolve/reject
 * is thread-safe in Capacitor.
 *
 * JS layer (src/lib/native-tts.ts) emulates pause by calling stop() and
 * re-issuing the remaining fragments on resume, because android.speech.tts
 * has no native pause/resume.
 */
@CapacitorPlugin(name = "NativeTTS")
public class NativeTTSPlugin extends Plugin {

    private static final String TAG = "NativeTTS";

    private TextToSpeech tts;
    private boolean ttsReady = false;
    private boolean initFailed = false;

    /** The speak() call currently waiting for utterance completion, if any. */
    private PluginCall pendingSpeakCall;

    /** Actions queued while the engine is still initialising (main-thread confined). */
    private final List<QueuedAction> queuedActions = new ArrayList<>();

    private interface TtsAction {
        void run(TextToSpeech tts);
    }

    private static final class QueuedAction {
        final PluginCall call;
        final TtsAction action;

        QueuedAction(PluginCall call, TtsAction action) {
            this.call = call;
            this.action = action;
        }
    }

    /**
     * Lazily initialise TextToSpeech and run the action once the engine is
     * ready. Rejects the call if the engine cannot start. Calls made while
     * initialisation is in flight are queued (not dropped).
     */
    private void withTts(final PluginCall call, final TtsAction action) {
        getActivity().runOnUiThread(() -> {
            if (ttsReady && tts != null) {
                action.run(tts);
                return;
            }
            if (initFailed) {
                call.reject("TTS engine init failed. Check system TTS settings: Настройки → Язык и ввод → Синтез речи.");
                return;
            }
            queuedActions.add(new QueuedAction(call, action));
            if (tts == null) {
                // Created on the main thread → init callback arrives on the main looper.
                tts = new TextToSpeech(getContext(), status -> {
                    List<QueuedAction> queue = new ArrayList<>(queuedActions);
                    queuedActions.clear();
                    if (status == TextToSpeech.SUCCESS) {
                        ttsReady = true;
                        for (QueuedAction qa : queue) {
                            qa.action.run(tts);
                        }
                    } else {
                        initFailed = true;
                        for (QueuedAction qa : queue) {
                            qa.call.reject("TTS engine init failed, status=" + status
                                    + ". Check system TTS settings: Настройки → Язык и ввод → Синтез речи.");
                        }
                    }
                });
            }
        });
    }

    /**
     * Speak the given text. The promise resolves when the utterance finishes
     * or is stopped (after stop() / a newer speak()), and rejects on errors.
     */
    @PluginMethod()
    public void speak(final PluginCall call) {
        final String text = call.getString("text");
        if (text == null || text.trim().isEmpty()) {
            call.resolve();
            return;
        }
        final String lang = call.getString("lang", "ru-RU");
        final Float rate = call.getFloat("rate");
        final Float pitch = call.getFloat("pitch");
        final Double volume = call.getDouble("volume");

        withTts(call, engine -> {
            // Configure the language. If its data is missing we still proceed
            // with the engine default (the device may already use Russian as
            // the system TTS language — common case for this app).
            Locale locale;
            try {
                locale = Locale.forLanguageTag(lang != null ? lang : "ru-RU");
            } catch (Exception e) {
                locale = Locale.getDefault();
            }
            int langResult = engine.setLanguage(locale);
            if (langResult == TextToSpeech.LANG_MISSING_DATA
                    || langResult == TextToSpeech.LANG_NOT_SUPPORTED) {
                Log.w(TAG, "Requested language " + lang + " not available (result=" + langResult
                        + "), falling back to engine default");
            }

            if (rate != null) {
                engine.setSpeechRate(rate);
            }
            if (pitch != null) {
                engine.setPitch(pitch);
            }

            // A newer speak() supersedes the pending one (single-voice policy,
            // mirrored from the JS layer). Resolve it so no JS promise hangs.
            if (pendingSpeakCall != null) {
                pendingSpeakCall.resolve();
                pendingSpeakCall = null;
            }

            final String utteranceId = UUID.randomUUID().toString();
            Bundle params = new Bundle();
            if (volume != null) {
                params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, volume.floatValue());
            }

            engine.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override
                public void onStart(String id) {
                    // no-op
                }

                @Override
                public void onDone(String id) {
                    finishPendingSpeak(true, null);
                }

                @Override
                public void onError(String id) {
                    Log.e(TAG, "TTS synthesis error for utterance " + id);
                    finishPendingSpeak(false, "Ошибка синтеза речи (движок TTS сообщил об ошибке)");
                }

                @Override
                public void onStop(String id, boolean interrupted) {
                    // Called instead of onDone when stop() interrupts the utterance.
                    // Resolve normally — the JS loop handles pause/cancel itself.
                    finishPendingSpeak(true, null);
                }
            });

            int result = engine.speak(text, TextToSpeech.QUEUE_FLUSH, params, utteranceId);
            if (result == TextToSpeech.ERROR) {
                pendingSpeakCall = null;
                call.reject("tts.speak() returned ERROR");
                return;
            }
            pendingSpeakCall = call;
        });
    }

    /** Resolve/reject the pending speak() call exactly once, from the main thread. */
    private void finishPendingSpeak(boolean ok, String errorMessage) {
        getActivity().runOnUiThread(() -> {
            if (pendingSpeakCall == null) {
                return;
            }
            PluginCall call = pendingSpeakCall;
            pendingSpeakCall = null;
            if (ok) {
                call.resolve();
            } else {
                call.reject(errorMessage);
            }
        });
    }

    /**
     * Stop current speech. The pending speak() call (if any) is resolved —
     * either by this method or by the UtteranceProgressListener onStop callback.
     */
    @PluginMethod()
    public void stop(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (tts != null) {
                try {
                    tts.stop();
                } catch (Exception e) {
                    Log.w(TAG, "tts.stop() failed", e);
                }
            }
            if (pendingSpeakCall != null) {
                PluginCall pending = pendingSpeakCall;
                pendingSpeakCall = null;
                pending.resolve();
            }
            call.resolve();
        });
    }

    /**
     * List voices exposed by the active TTS engine (lang tags like "ru-RU").
     */
    @PluginMethod()
    public void getVoices(final PluginCall call) {
        withTts(call, engine -> {
            JSArray voices = new JSArray();
            try {
                Set<Voice> set = engine.getVoices();
                if (set != null) {
                    for (Voice v : set) {
                        JSObject o = new JSObject();
                        o.put("name", v.getName());
                        o.put("lang", v.getLocale().toLanguageTag());
                        voices.put(o);
                    }
                }
            } catch (Exception e) {
                Log.e(TAG, "getVoices failed", e);
            }
            JSObject result = new JSObject();
            result.put("voices", voices);
            call.resolve(result);
        });
    }

    /**
     * Open the system "Text-to-speech output" settings screen, so the user
     * can pick the engine / download language data without leaving the app.
     */
    @PluginMethod()
    public void openSettings(PluginCall call) {
        try {
            Intent intent = new Intent("com.android.settings.TTS_SETTINGS");
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("System TTS settings screen not found on this device");
        }
    }
}
