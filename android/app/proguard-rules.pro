# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# ── Capacitor (the JS bridge looks plugins and methods up by name) ──
-keep class com.getcapacitor.** { *; }
-keep public class * extends com.getcapacitor.Plugin { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keepclassmembers class * { @com.getcapacitor.PluginMethod public <methods>; }
-keepclassmembers class * { @android.webkit.JavascriptInterface <methods>; }
-keepattributes *Annotation*, Signature, InnerClasses, EnclosingMethod, SourceFile, LineNumberTable

# This app and its plugins (classes the bridge or Android instantiate by name)
-keep class com.warfarefitness.** { *; }
-keep class com.capacitorjs.plugins.** { *; }
-keep class app.capgo.plugin.** { *; }
-keep class io.capawesome.capacitorjs.plugins.** { *; }
-keep class com.revenuecat.purchases.capacitor.** { *; }
-keep class com.getcapacitor.community.** { *; }

# Health Connect records are created reflectively by the health plugin
-keep class androidx.health.connect.client.records.** { *; }
-dontwarn org.slf4j.**
-dontwarn javax.annotation.**
