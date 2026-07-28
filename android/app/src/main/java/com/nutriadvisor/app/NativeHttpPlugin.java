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
                conn.setConnectTimeout(30000);  // 30s connect timeout
                conn.setReadTimeout(120000);      // 120s read timeout (for long LLM responses)
                conn.setDoInput(true);

                // Apply headers
                Iterator<String> keys = headers.keys();
                while (keys.hasNext()) {
                    String key = keys.next();
                    conn.setRequestProperty(key, headers.getString(key));
                }

                // Send body for POST/PUT
                if (body != null && (method.equals("POST") || method.equals("PUT"))) {
                    conn.setDoOutput(true);
                    try (OutputStream os = conn.getOutputStream()) {
                        os.write(body.getBytes("UTF-8"));
                        os.flush();
                    }
                }

                int statusCode = conn.getResponseCode();

                // Read response body
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
}
