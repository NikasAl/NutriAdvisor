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
 * via this plugin. The engine and voice can be selected from within the app
 * settings (getEngines/setEngine/setVoice/getVoices) or left as system default.
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

    /** Name of the TTS engine currently initialised (null = system default). */
    private String currentEngineName = null;

    /** Voice name selected by the user (null = engine default voice). */
    private String currentVoiceName = null;

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
     *
     * @param engineName  engine to initialise (null = system default).
     */
    private void withTts(final PluginCall call, final TtsAction action, final String engineName) {
        getActivity().runOnUiThread(() -> {
            // If already initialised with the same engine, run immediately.
            if (ttsReady && tts != null
                    && (engineName == null ? currentEngineName == null : engineName.equals(currentEngineName))) {
                action.run(tts);
                return;
            }
            if (initFailed
                    && (engineName == null ? currentEngineName == null : engineName.equals(currentEngineName))) {
                call.reject("TTS engine init failed. Check system TTS settings: Настройки → Язык и ввод → Синтез речи.");
                return;
            }
            queuedActions.add(new QueuedAction(call, action));
            if (tts == null || (engineName == null ? currentEngineName != null : !engineName.equals(currentEngineName))) {
                // Shutdown previous engine if any
                if (tts != null) {
                    try {
                        tts.stop();
                        tts.shutdown();
                    } catch (Exception e) {
                        Log.w(TAG, "tts.shutdown() failed", e);
                    }
                    tts = null;
                    ttsReady = false;
                    initFailed = false;
                }
                currentEngineName = engineName;
                // Resolve any pending speak call from the old engine
                if (pendingSpeakCall != null) {
                    pendingSpeakCall.resolve();
                    pendingSpeakCall = null;
                }
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
                }, engineName);
            }
        });
    }

    /** Convenience overload: use current engine (or system default). */
    private void withTts(final PluginCall call, final TtsAction action) {
        withTts(call, action, currentEngineName);
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
        final String voiceName = call.getString("voiceName");

        withTts(call, engine -> {
            // Apply selected voice first (highest priority).
            // voiceName param from speak() overrides stored currentVoiceName.
            String effectiveVoice = voiceName != null ? voiceName : currentVoiceName;
            if (effectiveVoice != null) {
                try {
                    Set<Voice> voices = engine.getVoices();
                    if (voices != null) {
                        for (Voice v : voices) {
                            if (effectiveVoice.equals(v.getName())) {
                                int vr = engine.setVoice(v);
                                if (vr == TextToSpeech.SUCCESS) {
                                    Log.d(TAG, "Voice set to " + effectiveVoice);
                                } else {
                                    Log.w(TAG, "setVoice(" + effectiveVoice + ") returned " + vr + ", falling back to language");
                                }
                                break;
                            }
                        }
                    }
                } catch (Exception e) {
                    Log.w(TAG, "setVoice failed, falling back to language", e);
                }
            }

            // Configure the language (used as fallback when no voice is set,
            // or when setVoice fails).
            Locale locale;
            try {
                locale = Locale.forLanguageTag(lang != null ? lang : "ru-RU");
            } catch (Exception e) {
                locale = Locale.getDefault();
            }
            // Only setLanguage if we did NOT successfully set a voice above,
            // because setLanguage resets the voice to the default for that locale.
            if (effectiveVoice == null) {
                int langResult = engine.setLanguage(locale);
                if (langResult == TextToSpeech.LANG_MISSING_DATA
                        || langResult == TextToSpeech.LANG_NOT_SUPPORTED) {
                    Log.w(TAG, "Requested language " + lang + " not available (result=" + langResult
                            + "), falling back to engine default");
                }
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
     * List voices exposed by the active TTS engine.
     * Each voice has: name, lang, quality (0-400, higher = better), features.
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
                        o.put("quality", v.getQuality());
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
     * List installed TTS engines on the device.
     * Each engine has: name (package name), label (human-readable).
     */
    @PluginMethod()
    public void getEngines(final PluginCall call) {
        getActivity().runOnUiThread(() -> {
            JSArray engines = new JSArray();
            try {
                // TextToSpeech.engines() is a static method available since API 14.
                List<TextToSpeech.EngineInfo> engineList = TextToSpeech.engines();
                if (engineList != null) {
                    for (TextToSpeech.EngineInfo info : engineList) {
                        JSObject o = new JSObject();
                        o.put("name", info.name);
                        o.put("label", info.label);
                        engines.put(o);
                    }
                }
            } catch (Exception e) {
                Log.e(TAG, "getEngines failed", e);
            }
            JSObject result = new JSObject();
            result.put("engines", engines);
            call.resolve(result);
        });
    }

    /**
     * Switch to a different TTS engine.
     * engineName = null → use system default engine.
     * The current engine is shut down and a new one is initialised.
     * Any queued or in-progress speech is cancelled.
     * The promise resolves once the new engine is ready (or rejects on failure).
     */
    @PluginMethod()
    public void setEngine(final PluginCall call) {
        final String engineName = call.getString("engineName"); // null = default

        getActivity().runOnUiThread(() -> {
            // Stop current speech
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

            // If same engine already active, resolve immediately
            if (ttsReady && tts != null
                    && (engineName == null ? currentEngineName == null : engineName.equals(currentEngineName))) {
                call.resolve();
                return;
            }

            // Shutdown old engine
            if (tts != null) {
                try {
                    tts.shutdown();
                } catch (Exception e) {
                    Log.w(TAG, "tts.shutdown() failed", e);
                }
                tts = null;
            }
            ttsReady = false;
            initFailed = false;
            currentEngineName = engineName;
            // Reset voice selection when switching engine (voices are engine-specific)
            currentVoiceName = null;

            // Init new engine
            tts = new TextToSpeech(getContext(), status -> {
                if (status == TextToSpeech.SUCCESS) {
                    ttsReady = true;
                    JSObject result = new JSObject();
                    result.put("engineName", engineName != null ? engineName : "default");
                    call.resolve(result);
                } else {
                    initFailed = true;
                    call.reject("TTS engine init failed for " + (engineName != null ? engineName : "default")
                            + ", status=" + status);
                }
            }, engineName);
        });
    }

    /**
     * Set the voice for the current engine. The voice is applied before each
     * speak() call. voiceName = null resets to engine default.
     */
    @PluginMethod()
    public void setVoice(final PluginCall call) {
        final String voiceName = call.getString("voiceName"); // null = default

        getActivity().runOnUiThread(() -> {
            currentVoiceName = voiceName;
            if (voiceName != null && ttsReady && tts != null) {
                // Verify the voice exists on this engine
                try {
                    Set<Voice> voices = tts.getVoices();
                    if (voices != null) {
                        boolean found = false;
                        for (Voice v : voices) {
                            if (voiceName.equals(v.getName())) {
                                found = true;
                                break;
                            }
                        }
                        if (!found) {
                            Log.w(TAG, "Voice " + voiceName + " not found on current engine, stored but may fail on speak");
                        }
                    }
                } catch (Exception e) {
                    Log.w(TAG, "Voice verification failed", e);
                }
            }
            JSObject result = new JSObject();
            result.put("voiceName", voiceName != null ? voiceName : "default");
            call.resolve(result);
        });
    }

    /**
     * Get the currently selected engine and voice names.
     */
    @PluginMethod()
    public void getCurrentConfig(final PluginCall call) {
        getActivity().runOnUiThread(() -> {
            JSObject result = new JSObject();
            result.put("engineName", currentEngineName);
            result.put("voiceName", currentVoiceName);
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
