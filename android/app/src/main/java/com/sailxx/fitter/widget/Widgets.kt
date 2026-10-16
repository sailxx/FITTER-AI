package com.sailxx.fitter.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.util.Log
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.action.ActionParameters
import androidx.glance.action.actionParametersOf
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import androidx.work.CoroutineWorker
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.sailxx.fitter.data.FitterRepository
import com.sailxx.fitter.data.Summary
import com.sailxx.fitter.ui.MainActivity
import com.sailxx.fitter.ui.Palette
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

// ───────────────────────────── Общее ─────────────────────────────

private fun cp(c: Color) = ColorProvider(c)
private val Bg = Color(0xFF0B0F0C)
private val Track = Color(0xFF1E2A21)
private val Muted = Color(0xFF8E9A92)

/**
 * Кольцо калорий картинкой: в Glance нет дуг, поэтому рисуем его на Bitmap.
 * Зелёное, пока в норме, оранжевое — если норма превышена.
 */
private fun ringBitmap(progress: Float, sizePx: Int = 220): Bitmap {
    val bmp = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
    val stroke = sizePx * 0.1f
    val r = RectF(stroke / 2, stroke / 2, sizePx - stroke / 2, sizePx - stroke / 2)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = stroke
        strokeCap = Paint.Cap.ROUND
    }
    val canvas = Canvas(bmp)
    paint.color = Track.toArgb()
    canvas.drawArc(r, 0f, 360f, false, paint)
    paint.color = (if (progress > 1f) Palette.Over else Palette.Green).toArgb()
    val sweep = 360f * progress.coerceIn(0f, 1f)
    if (sweep > 0f) canvas.drawArc(r, -90f, sweep.coerceAtLeast(1f), false, paint)
    return bmp
}

@Composable
private fun Ring(s: Summary, size: Dp, big: Boolean) {
    Box(GlanceModifier.size(size), contentAlignment = Alignment.Center) {
        Image(ImageProvider(ringBitmap(s.progress)), contentDescription = null, modifier = GlanceModifier.size(size))
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            val left = s.kcalLeft
            Text(
                "${kotlin.math.abs(left)}",
                style = TextStyle(color = cp(Color.White), fontSize = if (big) 22.sp else 18.sp, fontWeight = FontWeight.Bold),
            )
            Text(if (left >= 0) "осталось" else "сверх нормы", style = TextStyle(color = cp(Muted), fontSize = 10.sp))
        }
    }
}

@Composable
private fun Card(content: @Composable () -> Unit) {
    Box(
        GlanceModifier.fillMaxSize().background(Bg).cornerRadius(24.dp).padding(12.dp)
            .clickable(actionStartActivity<MainActivity>()),
        contentAlignment = Alignment.Center,
    ) { content() }
}

@Composable
private fun SignIn() {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text("FITTER", style = TextStyle(color = cp(Palette.Green), fontSize = 14.sp, fontWeight = FontWeight.Bold))
        Spacer(GlanceModifier.height(4.dp))
        Text("Войдите в приложении", style = TextStyle(color = cp(Muted), fontSize = 12.sp))
    }
}

// ───────────────────────────── «Калории» 2×2 ─────────────────────────────

class CaloriesWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val st = FitterRepository.load(context)
        provideContent {
            Card {
                val s = st.summary
                if (!st.loggedIn || s == null) SignIn() else Ring(s, 110.dp, big = true)
            }
        }
    }
}

// ───────────────────────────── «Сегодня» 4×2 ─────────────────────────────

class TodayWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Single

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val st = FitterRepository.load(context)
        provideContent {
            Card {
                val s = st.summary
                if (!st.loggedIn || s == null) {
                    SignIn()
                } else {
                    Row(GlanceModifier.fillMaxSize(), verticalAlignment = Alignment.CenterVertically) {
                        Ring(s, 96.dp, big = false)
                        Spacer(GlanceModifier.width(12.dp))
                        Column(GlanceModifier.defaultWeight()) {
                            Text("${s.kcal} из ${s.targets.kcal} ккал", style = TextStyle(color = cp(Color.White), fontSize = 13.sp, fontWeight = FontWeight.Bold))
                            Spacer(GlanceModifier.height(4.dp))
                            Macro("Белки", s.p, s.targets.p)
                            Macro("Жиры", s.f, s.targets.f)
                            Macro("Углеводы", s.c, s.targets.c)
                            Spacer(GlanceModifier.height(6.dp))
                            Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    "💧 ${s.water / 250} из ${s.waterGoal / 250} ст.",
                                    style = TextStyle(color = cp(Palette.Water), fontSize = 12.sp, fontWeight = FontWeight.Medium),
                                    modifier = GlanceModifier.defaultWeight(),
                                )
                                Box(
                                    GlanceModifier.size(32.dp).background(Palette.Water.copy(alpha = 0.18f)).cornerRadius(16.dp)
                                        .clickable(actionRunCallback<AddWaterAction>(actionParametersOf())),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    Text("+", style = TextStyle(color = cp(Palette.Water), fontSize = 18.sp, fontWeight = FontWeight.Bold))
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun Macro(name: String, value: Int, target: Int) {
    Row(GlanceModifier.fillMaxWidth()) {
        Text(name, style = TextStyle(color = cp(Muted), fontSize = 11.sp), modifier = GlanceModifier.defaultWeight())
        Text("$value / $target г", style = TextStyle(color = cp(Color.White), fontSize = 11.sp))
    }
}

/** Кнопка «+» на виджете: стакан воды 250 мл. */
class AddWaterAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        FitterRepository.addWater(context, 250)
    }
}

// ───────────────────────────── Приёмники и обновление ─────────────────────────────

/** Любой виджет Fitter на экране включает фоновое обновление. */
abstract class FitterReceiver : GlanceAppWidgetReceiver() {
    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        SyncWorker.schedule(context)
    }
}

class CaloriesWidgetReceiver : FitterReceiver() {
    override val glanceAppWidget: GlanceAppWidget = CaloriesWidget()
}

class TodayWidgetReceiver : FitterReceiver() {
    override val glanceAppWidget: GlanceAppWidget = TodayWidget()
}

private val updateLock = Mutex()

/** Перерисовать все виджеты Fitter. Как в Okto: строго по id своего приёмника, по очереди. */
suspend fun updateFitterWidgets(context: Context) = updateLock.withLock {
    val app = context.applicationContext
    refreshWidgets(app, CaloriesWidget(), CaloriesWidgetReceiver::class.java)
    refreshWidgets(app, TodayWidget(), TodayWidgetReceiver::class.java)
}

private suspend fun refreshWidgets(context: Context, widget: GlanceAppWidget, receiver: Class<*>) {
    val ids = AppWidgetManager.getInstance(context).getAppWidgetIds(ComponentName(context, receiver))
    val manager = GlanceAppWidgetManager(context)
    for (id in ids) {
        try {
            widget.update(context, manager.getGlanceIdBy(id))
        } catch (e: Exception) {
            Log.w("FitterWidgets", "update failed for ${receiver.simpleName} #$id", e)
        }
    }
}

/**
 * Фоновое обновление раз в 30 минут: еда, записанная в боте, и новый день после полуночи
 * появляются на виджетах без открытия приложения.
 */
class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        FitterRepository.refresh(applicationContext)
        return Result.success()
    }

    companion object {
        private const val NAME = "fitter-sync"

        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<SyncWorker>(30, TimeUnit.MINUTES)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(NAME, ExistingPeriodicWorkPolicy.UPDATE, request)
        }

        fun cancel(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(NAME)
        }
    }
}
