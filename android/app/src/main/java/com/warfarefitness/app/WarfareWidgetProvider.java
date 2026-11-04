package com.warfarefitness.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

/**
 * Home-screen widget: streak and the next workout, from what the app last
 * saw (WarfareWidgetPlugin). Tapping it opens the app.
 */
public class WarfareWidgetProvider extends AppWidgetProvider {
    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        SharedPreferences p = ctx.getSharedPreferences(WarfareWidgetPlugin.PREFS, Context.MODE_PRIVATE);
        int streak = p.getInt("streak", 0);
        String title = p.getString("title", "Today's workout");
        String subtitle = p.getString("subtitle", "Open the app to load your plan");

        Intent open = new Intent(ctx, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(ctx, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        for (int id : ids) {
            RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.wf_widget);
            v.setTextViewText(R.id.wf_streak, String.valueOf(streak));
            v.setTextViewText(R.id.wf_streak_label, streak == 1 ? "day streak" : "day streak");
            v.setTextViewText(R.id.wf_title, title);
            v.setTextViewText(R.id.wf_subtitle, subtitle);
            v.setOnClickPendingIntent(R.id.wf_root, pi);
            mgr.updateAppWidget(id, v);
        }
    }
}
