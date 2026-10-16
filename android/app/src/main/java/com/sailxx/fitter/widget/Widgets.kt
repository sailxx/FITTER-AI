package com.sailxx.fitter.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import androidx.annotation.DrawableRes
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.action.ActionParameters
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.action.actionStartActivity
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
import androidx.glance.text.TextAlign
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.sailxx.fitter.R
import com.sailxx.fitter.data.AppState
import com.sailxx.fitter.data.FitterRepository
import com.sailxx.fitter.data.Summary
import com.sailxx.fitter.ui.BOT_URL
import com.sailxx.fitter.ui.MainActivity
import com.sailxx.fitter.ui.Palette
import java.util.Locale
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

// ───────────────────────────── Общее ─────────────────────────────

private const val CUP = 250
private fun cp(c: Color) = ColorProvider(c)
private fun n(x: Int) = String.format(Locale("ru"), "%,d", x).replace(' ', ' ')
private fun liters(ml: Int) = (Math.round(ml / 10.0) / 100.0).toString().removeSuffix(".0").replace('.', ',') + " л"
private fun Dp.px(context: Context) = (value * context.resources.displayMetrics.density).toInt().coerceAtLeast(1)

@Composable
private fun T(text: String, size: TextUnit, color: Color, bold: Boolean = false, modifier: GlanceModifier = GlanceModifier, maxLines: Int = 1, align: TextAlign? = null) {
    Text(
        text, modifier = modifier, maxLines = maxLines,
        style = TextStyle(color = cp(color), fontSize = size, fontWeight = if (bold) FontWeight.Bold else FontWeight.Medium, textAlign = align),
    )
}

/** Фон под размер виджета: белый или чёрный по теме Fitter, прозрачность и скругление из настроек. */
@Composable
private fun bg(g: Skin): GlanceModifier {
    val ctx = LocalContext.current
    val size = LocalSize.current
    return GlanceModifier.fillMaxSize()
        .background(ImageProvider(bgBitmap(g, size.width.px(ctx), size.height.px(ctx), ctx.resources.displayMetrics.density)))
        .cornerRadius(g.look.corners.dp)
}

/** Подложка виджета. Нажатие открывает приложение. */
@Composable
private fun WidgetCard(g: Skin, pad: Dp = 14.dp, align: Alignment = Alignment.TopStart, content: @Composable () -> Unit) {
    Box(
        bg(g).padding(pad)
            .clickable(actionStartActivity<MainActivity>()),
        contentAlignment = align,
    ) { content() }
}

@Composable
private fun Img(@DrawableRes res: Int, size: Dp) = Image(ImageProvider(res), contentDescription = null, modifier = GlanceModifier.size(size))

@Composable
private fun Bmp(bmp: android.graphics.Bitmap, w: Dp, h: Dp) = Image(ImageProvider(bmp), contentDescription = null, modifier = GlanceModifier.size(w, h))

@Composable
private fun SignIn(g: Skin) {
    Column(GlanceModifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalAlignment = Alignment.CenterVertically) {
        Image(ImageProvider(R.drawable.ic_logo), contentDescription = "FITTER", modifier = GlanceModifier.size(36.dp))
        Spacer(GlanceModifier.height(6.dp))
        T("Войдите в Fitter", 12.sp, g.ink, bold = true, align = TextAlign.Center)
    }
}

/** Кнопка-пилюля: белая с синим текстом, как «+ стакан» в макете. */
@Composable
private fun Pill(text: String, g: Skin, w: Dp, h: Dp, action: androidx.glance.action.Action, filled: Boolean = true) {
    Box(
        GlanceModifier.size(w, h).background(if (filled) g.btn else g.trk).cornerRadius(h / 2).clickable(action),
        contentAlignment = Alignment.Center,
    ) { T(text, if (text.length <= 1) 18.sp else 13.sp, if (filled) g.btnInk else g.ink, bold = true) }
}

/** Общая основа: читаем сохранённое и тему стекла, рисуем содержимое или просьбу войти. */
abstract class FitterWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact

    @Composable
    abstract fun Content(g: Skin, s: Summary, st: AppState)

    open val pad: Dp = 14.dp

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val st = FitterRepository.load(context)
        val g = skinFor(context)
        provideContent {
            val s = st.summary
            WidgetCard(g, if (s == null) 8.dp else pad) {
                if (!st.loggedIn || s == null) SignIn(g) else Content(g, s, st)
            }
        }
    }
}

// ───────────────────────────── «Калории» 2×2 ─────────────────────────────

class CaloriesWidget : FitterWidget() {
    @Composable
    override fun Content(g: Skin, s: Summary, st: AppState) {
        val ctx = LocalContext.current
        val size = LocalSize.current
        val ring = (minOf(size.width, size.height - 30.dp) - 20.dp).coerceIn(56.dp, 150.dp)
        val left = s.kcalLeft
        Column(GlanceModifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalAlignment = Alignment.CenterVertically) {
            Box(GlanceModifier.size(ring), contentAlignment = Alignment.Center) {
                Bmp(ringBitmap(g, s.progress, ring.px(ctx), (ring * 0.085f).px(ctx).toFloat()), ring, ring)
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    if (g.look.showEaten) {
                        T(n(s.kcal), (ring.value * 0.19f).sp, g.ink, bold = true)
                        T("съедено ккал", 10.sp, g.mut)
                    } else {
                        T(n(kotlin.math.abs(left)), (ring.value * 0.19f).sp, if (left < 0) Palette.Protein else g.ink, bold = true)
                        T(if (left >= 0) "осталось ккал" else "сверх нормы", 10.sp, g.mut)
                    }
                }
            }
            Spacer(GlanceModifier.height(6.dp))
            T("${n(s.kcal)} из ${n(s.targets.kcal)}", 11.sp, g.mut)
        }
    }
}

// ───────────────────────────── «Осталось» 1×1 ─────────────────────────────

class LeftWidget : FitterWidget() {
    override val pad = 6.dp

    @Composable
    override fun Content(g: Skin, s: Summary, st: AppState) {
        val ctx = LocalContext.current
        val size = LocalSize.current
        val ring = (minOf(size.width, size.height) - 14.dp).coerceIn(40.dp, 90.dp)
        Box(GlanceModifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Box(GlanceModifier.size(ring), contentAlignment = Alignment.Center) {
                Bmp(ringBitmap(g, s.progress, ring.px(ctx), (ring * 0.09f).px(ctx).toFloat()), ring, ring)
                T(n(if (g.look.showEaten) s.kcal else kotlin.math.abs(s.kcalLeft)), (ring.value * 0.21f).sp, if (!g.look.showEaten && s.kcalLeft < 0) Palette.Protein else g.ink, bold = true)
            }
        }
    }
}

// ───────────────────────────── «Сегодня» 4×2 ─────────────────────────────

class TodayWidget : FitterWidget() {
    @Composable
    override fun Content(g: Skin, s: Summary, st: AppState) {
        val ctx = LocalContext.current
        val size = LocalSize.current
        val ring = (size.height - 28.dp).coerceIn(70.dp, 140.dp)
        val colW = (size.width - 28.dp - ring - 14.dp).coerceAtLeast(60.dp)
        val pct = if (s.targets.kcal > 0) s.kcal * 100 / s.targets.kcal else 0
        Row(GlanceModifier.fillMaxSize(), verticalAlignment = Alignment.CenterVertically) {
            Box(GlanceModifier.size(ring), contentAlignment = Alignment.Center) {
                Bmp(ringBitmap(g, s.progress, ring.px(ctx), (ring * 0.085f).px(ctx).toFloat()), ring, ring)
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    if (g.look.showEaten) {
                        T(n(s.kcal), (ring.value * 0.2f).sp, g.ink, bold = true)
                        T("из ${n(s.targets.kcal)}", 10.sp, g.mut)
                    } else {
                        T(n(kotlin.math.abs(s.kcalLeft)), (ring.value * 0.2f).sp, if (s.kcalLeft < 0) Palette.Protein else g.ink, bold = true)
                        T(if (s.kcalLeft >= 0) "осталось" else "сверх", 10.sp, g.mut)
                    }
                    T("$pct%", 10.sp, g.ink, bold = true)
                }
            }
            Spacer(GlanceModifier.width(14.dp))
            Column(GlanceModifier.width(colW)) {
                val left = s.kcalLeft
                T(
                    when { g.look.showEaten && left >= 0 -> "Осталось ${n(left)} ккал"; left >= 0 -> "Съедено ${n(s.kcal)} ккал"; else -> "+${n(-left)} ккал сверх нормы" },
                    14.sp, if (left < 0) Palette.Protein else g.ink, bold = true,
                )
                Spacer(GlanceModifier.height(5.dp))
                if (g.look.showMacros) {
                    MacroLine(g, "Белки", s.p, s.targets.p, Palette.Protein, colW)
                    MacroLine(g, "Жиры", s.f, s.targets.f, Palette.Fat, colW)
                    MacroLine(g, "Углеводы", s.c, s.targets.c, Palette.Carbs, colW)
                }
                if (g.look.showWater) {
                    Spacer(GlanceModifier.height(4.dp))
                    Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Img(R.drawable.ic_water, 16.dp)
                        Spacer(GlanceModifier.width(6.dp))
                        val all = maxOf(1, (s.waterGoal + CUP - 1) / CUP)
                        T("${s.water / CUP} из $all стаканов", 12.sp, g.ink, modifier = GlanceModifier.defaultWeight())
                        Pill("+", g, 28.dp, 28.dp, actionRunCallback<AddWaterAction>())
                    }
                }
            }
        }
    }
}

@Composable
private fun MacroLine(g: Skin, label: String, v: Int, max: Int, color: Color, w: Dp) {
    val ctx = LocalContext.current
    Column(GlanceModifier.fillMaxWidth().padding(bottom = 4.dp)) {
        Row(GlanceModifier.fillMaxWidth()) {
            T(label, 11.sp, g.mut, modifier = GlanceModifier.defaultWeight())
            T("$v / $max г", 11.sp, g.ink, bold = true)
        }
        Spacer(GlanceModifier.height(2.dp))
        Bmp(barBitmap(g, if (max > 0) v.toFloat() / max else 0f, color, w.px(ctx), 5.dp.px(ctx)), w, 5.dp)
    }
}

// ───────────────────────────── «Вода» 2×2 ─────────────────────────────

class WaterWidget : FitterWidget() {
    @Composable
    override fun Content(g: Skin, s: Summary, st: AppState) {
        val ctx = LocalContext.current
        val size = LocalSize.current
        val inner = size.width - 28.dp
        val water = if (g.dark) Color(0xFF8FD0FF) else Palette.Water2
        val all = maxOf(1, (s.waterGoal + CUP - 1) / CUP)
        val on = s.water / CUP
        Column(GlanceModifier.fillMaxSize()) {
            Row(verticalAlignment = Alignment.Bottom) {
                Bmp(glassBitmap(if (s.waterGoal > 0) s.water.toFloat() / s.waterGoal else 0f, water, 40.dp.px(ctx), 54.dp.px(ctx)), 40.dp, 54.dp)
                Spacer(GlanceModifier.width(10.dp))
                Column {
                    T("Вода", 11.sp, g.mut)
                    T(liters(s.water), 24.sp, g.ink, bold = true)
                    T("из ${liters(s.waterGoal)}", 10.sp, g.mut)
                }
            }
            Spacer(GlanceModifier.height(8.dp))
            val cupW = ((inner.value - (all - 1) * 3) / all).coerceIn(4f, 9f).dp
            Bmp(cupsBitmap(g, on, all, water, cupW.px(ctx), 11.dp.px(ctx), 3.dp.px(ctx)), cupW * all + 3.dp * (all - 1), 11.dp)
            Spacer(GlanceModifier.defaultWeight())
            Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Pill("+ стакан", g, inner - 40.dp, 34.dp, actionRunCallback<AddWaterAction>())
                Spacer(GlanceModifier.width(6.dp))
                Pill("−", g, 34.dp, 34.dp, actionRunCallback<RemoveWaterAction>(), filled = false)
            }
        }
    }
}

// ───────────────────────────── «БЖУ» 4×1 ─────────────────────────────

class MacrosWidget : FitterWidget() {
    override val pad = 12.dp

    @Composable
    override fun Content(g: Skin, s: Summary, st: AppState) {
        val ctx = LocalContext.current
        val size = LocalSize.current
        val colW = (size.width - 24.dp - 16.dp) / 3
        val barW = (colW - 30.dp).coerceAtLeast(20.dp)
        Row(GlanceModifier.fillMaxSize(), verticalAlignment = Alignment.CenterVertically) {
            listOf(
                Triple(R.drawable.ic_protein, "Белки", Triple(s.p, s.targets.p, Palette.Protein)),
                Triple(R.drawable.ic_fat, "Жиры", Triple(s.f, s.targets.f, Palette.Fat)),
                Triple(R.drawable.ic_carbs, "Углев.", Triple(s.c, s.targets.c, Palette.Carbs)),
            ).forEachIndexed { i, (icon, label, m) ->
                if (i > 0) Spacer(GlanceModifier.width(8.dp))
                Row(GlanceModifier.width(colW), verticalAlignment = Alignment.CenterVertically) {
                    Img(icon, 22.dp)
                    Spacer(GlanceModifier.width(6.dp))
                    Column {
                        T(label, 11.sp, g.mut)
                        T("${m.first} / ${m.second}", 13.sp, g.ink, bold = true)
                        Spacer(GlanceModifier.height(2.dp))
                        Bmp(barBitmap(g, if (m.second > 0) m.first.toFloat() / m.second else 0f, m.third, barW.px(ctx), 4.dp.px(ctx)), barW, 4.dp)
                    }
                }
            }
        }
    }
}

// ───────────────────────────── «Таблетки» 2×2 ─────────────────────────────

class PillsWidget : FitterWidget() {
    @Composable
    override fun Content(g: Skin, s: Summary, st: AppState) {
        val ctx = LocalContext.current
        val size = LocalSize.current
        val inner = size.width - 28.dp
        Column(GlanceModifier.fillMaxSize()) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Img(R.drawable.ic_pill, 24.dp)
                Spacer(GlanceModifier.width(8.dp))
                T("Таблетки", 14.sp, g.ink, bold = true)
            }
            if (s.pillsTotal == 0) {
                Spacer(GlanceModifier.defaultWeight())
                T("Добавь витамины в дневнике — напомню вовремя", 12.sp, g.mut, maxLines = 3)
                Spacer(GlanceModifier.defaultWeight())
                return@Column
            }
            Spacer(GlanceModifier.height(6.dp))
            Row(verticalAlignment = Alignment.Bottom) {
                T("${s.pillsTaken}", 30.sp, g.ink, bold = true)
                T(" / ${s.pillsTotal}", 16.sp, g.mut, bold = true)
            }
            T("принято сегодня", 11.sp, g.mut)
            Spacer(GlanceModifier.defaultWeight())
            Bmp(barBitmap(g, s.pillsTaken.toFloat() / s.pillsTotal, Palette.Pill, inner.px(ctx), 6.dp.px(ctx)), inner, 6.dp)
            Spacer(GlanceModifier.height(6.dp))
            T(
                when {
                    s.pillsTaken >= s.pillsTotal -> "Все приняты ✅"
                    s.pillNext.isNotEmpty() -> "Следующая в ${s.pillNext}"
                    else -> "Есть пропущенные"
                },
                12.sp, g.ink, bold = true,
            )
        }
    }
}

// ───────────────────────────── «Фото еды» 1×1 ─────────────────────────────

/** Открывает чат с ботом: туда отправляется фото еды. */
class PhotoWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val g = skinFor(context)
        val open = Intent(Intent.ACTION_VIEW, Uri.parse(BOT_URL)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        provideContent {
            Column(
                bg(g).clickable(actionStartActivity(open)),
                horizontalAlignment = Alignment.CenterHorizontally, verticalAlignment = Alignment.CenterVertically,
            ) {
                Img(R.drawable.ic_camera, 32.dp)
                Spacer(GlanceModifier.height(2.dp))
                T("Фото", 11.sp, g.ink, bold = true)
            }
        }
    }
}

// ───────────────────────────── «Неделя» 4×2 ─────────────────────────────

private val WD = listOf("Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс")

class WeekWidget : FitterWidget() {
    @Composable
    override fun Content(g: Skin, s: Summary, st: AppState) {
        val ctx = LocalContext.current
        val size = LocalSize.current
        val inner = size.width - 28.dp
        val chartH = (size.height - 28.dp - 22.dp - 18.dp).coerceAtLeast(30.dp)
        val week = st.day?.week.orEmpty()
        val todayIdx = week.indexOfFirst { it.date == s.date }
        Column(GlanceModifier.fillMaxSize()) {
            Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                T("Неделя", 14.sp, g.ink, bold = true, modifier = GlanceModifier.defaultWeight())
                if (s.streak > 0) T("🔥 серия ${s.streak} дн.", 11.sp, g.mut)
            }
            Spacer(GlanceModifier.height(8.dp))
            if (week.size == 7) {
                Bmp(weekBitmap(g, week.map { if (it.meals > 0) it.kcal else 0 }, s.targets.kcal, todayIdx, inner.px(ctx), chartH.px(ctx), ctx.resources.displayMetrics.density), inner, chartH)
                Spacer(GlanceModifier.height(4.dp))
                Row(GlanceModifier.fillMaxWidth()) {
                    WD.forEachIndexed { i, d ->
                        T(d, 10.sp, if (i == todayIdx) g.ink else g.mut, bold = i == todayIdx, modifier = GlanceModifier.width(inner / 7), align = TextAlign.Center)
                    }
                }
            } else {
                T("Открой приложение, чтобы загрузить неделю", 12.sp, g.mut, maxLines = 2)
            }
        }
    }
}

// ───────────────────────────── Кнопки воды ─────────────────────────────

class AddWaterAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        FitterRepository.addWater(context, CUP)
    }
}

class RemoveWaterAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        FitterRepository.addWater(context, -CUP)
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

class CaloriesWidgetReceiver : FitterReceiver() { override val glanceAppWidget: GlanceAppWidget = CaloriesWidget() }
class TodayWidgetReceiver : FitterReceiver() { override val glanceAppWidget: GlanceAppWidget = TodayWidget() }
class WaterWidgetReceiver : FitterReceiver() { override val glanceAppWidget: GlanceAppWidget = WaterWidget() }
class MacrosWidgetReceiver : FitterReceiver() { override val glanceAppWidget: GlanceAppWidget = MacrosWidget() }
class PillsWidgetReceiver : FitterReceiver() { override val glanceAppWidget: GlanceAppWidget = PillsWidget() }
class PhotoWidgetReceiver : FitterReceiver() { override val glanceAppWidget: GlanceAppWidget = PhotoWidget() }
class LeftWidgetReceiver : FitterReceiver() { override val glanceAppWidget: GlanceAppWidget = LeftWidget() }
class WeekWidgetReceiver : FitterReceiver() { override val glanceAppWidget: GlanceAppWidget = WeekWidget() }

private val updateLock = Mutex()

/** Перерисовать все виджеты Fitter. Как в Okto: строго по id своего приёмника, по очереди. */
suspend fun updateFitterWidgets(context: Context) = updateLock.withLock {
    val app = context.applicationContext
    refreshWidgets(app, CaloriesWidget(), CaloriesWidgetReceiver::class.java)
    refreshWidgets(app, TodayWidget(), TodayWidgetReceiver::class.java)
    refreshWidgets(app, WaterWidget(), WaterWidgetReceiver::class.java)
    refreshWidgets(app, MacrosWidget(), MacrosWidgetReceiver::class.java)
    refreshWidgets(app, PillsWidget(), PillsWidgetReceiver::class.java)
    refreshWidgets(app, PhotoWidget(), PhotoWidgetReceiver::class.java)
    refreshWidgets(app, LeftWidget(), LeftWidgetReceiver::class.java)
    refreshWidgets(app, WeekWidget(), WeekWidgetReceiver::class.java)
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
