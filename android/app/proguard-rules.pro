# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# --- Capacitor (required for release builds with minifyEnabled true) ---
#
# Capacitor's plugin dispatch is built on runtime reflection: plugin classes
# are resolved by name, @PluginMethod/@PermissionCallback methods are looked
# up reflectively, and permission handling reads the @CapacitorPlugin /
# @Permission annotations at runtime (Bridge.getPermissionStates does
# pluginAnnotation.permissions() with no null guard). R8 full mode (AGP 8)
# strips/renames/merges these, which crashes release builds with
# "NullPointerException: throw with null exception" inside
# getPermissionStates while the same code works fine in debug builds.
#
# The consumer-rules.pro shipped by the capacitor AAR is not sufficient
# under R8 full mode, so keep the whole runtime explicitly.

-keepattributes *Annotation*, Signature, InnerClasses, EnclosingMethod

-keep class com.getcapacitor.** { *; }
-keep class com.capacitorjs.plugins.** { *; }

# Local native plugins (NativeCameraPlugin, NativeTTSPlugin, NativeHttpPlugin)
# and MainActivity
-keep class ru.kreagenium.nuadvi.** { *; }

# --- Debuggable release stack traces ---
# Keep original source file names and line numbers so release crash logs can
# be read directly (slight size increase, worth it for diagnostics).
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
