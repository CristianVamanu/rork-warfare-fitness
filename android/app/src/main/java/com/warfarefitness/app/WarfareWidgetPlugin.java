package com.warfarefitness.app;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Bridge from the web app to the home-screen widget. The dashboard calls
 * WarfareWidget.update({ streak, title, subtitle }) (src/lib/native/widget.ts)
 * whenever it has fresh numbers; they are kept in SharedPreferences and every
 * placed widget is redrawn. The widget itself never fetches anything.
 */
@CapacitorPlugin(name = "WarfareWidget")
public class WarfareWidgetPlugin extends Plugin {
    static final String PREFS = "wf_widget";

    @PluginMethod
    public void update(PluginCall call) {
        Context ctx = getContext();
        SharedPreferences.Editor e = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        e.putInt("streak", call.getInt("streak", 0));
        e.putString("title", trim(call.getString("title", "Today's workout"), 40));
        e.putString("subtitle", trim(call.getString("subtitle", "Tap to open Warfare Fitness"), 60));
        e.apply();

        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, WarfareWidgetProvider.class));
        if (ids.length > 0) {
            Intent i = new Intent(ctx, WarfareWidgetProvider.class);
            i.setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
            i.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
            ctx.sendBroadcast(i);
        }
        call.resolve();
    }

    private static String trim(String s, int max) {
        if (s == null) return "";
        return s.length() <= max ? s : s.substring(0, max - 1) + "…";
    }
}
