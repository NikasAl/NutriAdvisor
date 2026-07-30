package com.nutriadvisor.app;

import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Iterator;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(
    name = "NativeHttp",
    permissions = {
        @Permission(
            strings = { "android.permission.INTERNET" },
            alias = "network"
        )
    }
)
public class NativeHttpPlugin extends Plugin {

    private static final String TAG = "NativeHttp";
    private final ExecutorService executor = Executors.newCachedThreadPool();

    @PluginMethod()
    public void request(PluginCall call) {
        String urlStr = call.getString("url");
        String method = call.getString("method", "POST");
        JSObject headers = call.getObject("headers", new JSObject());
        String body = call.getString("body", null);

        if (urlStr == null) {
            call.reject("url is required");
            return;
        }

        executor.execute(() -> {
            HttpURLConnection conn = null;
            try {
                URL url = new URL(urlStr);
                conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod(method);
                conn.setConnectTimeout(30000);
                conn.setReadTimeout(300000);
                conn.setDoInput(true);

                Iterator<String> keys = headers.keys();
                while (keys.hasNext()) {
                    String key = keys.next();
                    conn.setRequestProperty(key, headers.getString(key));
                }

                if (body != null && (method.equals("POST") || method.equals("PUT"))) {
                    conn.setDoOutput(true);
                    try (OutputStream os = conn.getOutputStream()) {
                        os.write(body.getBytes("UTF-8"));
                        os.flush();
                    }
                }

                int statusCode = conn.getResponseCode();

                InputStream is;
                if (statusCode >= 200 && statusCode < 300) {
                    is = conn.getInputStream();
                } else {
                    is = conn.getErrorStream();
                }

                String responseBody = "";
                if (is != null) {
                    BufferedReader reader = new BufferedReader(new InputStreamReader(is, "UTF-8"));
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = reader.readLine()) != null) {
                        sb.append(line).append('\n');
                    }
                    reader.close();
                    responseBody = sb.toString();
                }

                JSObject result = new JSObject();
                result.put("status", statusCode);
                result.put("body", responseBody);

                call.resolve(result);

            } catch (Exception e) {
                Log.e(TAG, "HTTP request failed", e);
                call.reject("HTTP error: " + e.getMessage());
            } finally {
                if (conn != null) {
                    conn.disconnect();
                }
            }
        });
    }

    /**
     * Streaming request — reads response chunks as they arrive and sends
     * them to JS via notifyListeners. This enables true SSE streaming
     * for LLM responses in Android WebView.
     *
     * Events emitted:
     *   "streamChunk"  — each SSE "data: ..." line (as JSObject {line: string})
     *   "streamDone"   — when stream is complete (as JSObject {status: int})
     *   "streamError"  — on HTTP error or exception (as JSObject {message: string})
     */
    @PluginMethod()
    public void requestStream(PluginCall call) {
        String urlStr = call.getString("url");
        String method = call.getString("method", "POST");
        JSObject headers = call.getObject("headers", new JSObject());
        String body = call.getString("body", null);

        if (urlStr == null) {
            call.reject("url is required");
            return;
        }

        // Save call reference and resolve immediately — data comes via events
        call.resolve(new JSObject());

        executor.execute(() -> {
            HttpURLConnection conn = null;
            try {
                URL url = new URL(urlStr);
                conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod(method);
                conn.setConnectTimeout(30000);
                conn.setReadTimeout(120000);
                conn.setDoInput(true);

                Iterator<String> keys = headers.keys();
                while (keys.hasNext()) {
                    String key = keys.next();
                    conn.setRequestProperty(key, headers.getString(key));
                }

                if (body != null && (method.equals("POST") || method.equals("PUT"))) {
                    conn.setDoOutput(true);
                    try (OutputStream os = conn.getOutputStream()) {
                        os.write(body.getBytes("UTF-8"));
                        os.flush();
                    }
                }

                int statusCode = conn.getResponseCode();

                if (statusCode < 200 || statusCode >= 300) {
                    InputStream errIs = conn.getErrorStream();
                    String errBody = "";
                    if (errIs != null) {
                        BufferedReader errReader = new BufferedReader(new InputStreamReader(errIs, "UTF-8"));
                        StringBuilder errSb = new StringBuilder();
                        String errLine;
                        while ((errLine = errReader.readLine()) != null) {
                            errSb.append(errLine);
                        }
                        errReader.close();
                        errBody = errSb.toString();
                    }
                    JSObject errObj = new JSObject();
                    errObj.put("status", statusCode);
                    errObj.put("message", errBody);
                    notifyListeners("streamError", errObj);
                    return;
                }

                InputStream is = conn.getInputStream();
                BufferedReader reader = new BufferedReader(new InputStreamReader(is, "UTF-8"));

                // Read line by line and emit each as an event
                String line;
                while ((line = reader.readLine()) != null) {
                    // Check if plugin is still alive
                    if (!getBridge().getActivity().isFinishing() && getBridge().getWebView() != null) {
                        JSObject chunkObj = new JSObject();
                        chunkObj.put("line", line);
                        notifyListeners("streamChunk", chunkObj);
                    }
                }
                reader.close();

                // Signal completion
                JSObject doneObj = new JSObject();
                doneObj.put("status", statusCode);
                notifyListeners("streamDone", doneObj);

            } catch (Exception e) {
                Log.e(TAG, "HTTP stream failed", e);
                JSObject errObj = new JSObject();
                errObj.put("message", e.getMessage());
                notifyListeners("streamError", errObj);
            } finally {
                if (conn != null) {
                    conn.disconnect();
                }
            }
        });
    }
}
