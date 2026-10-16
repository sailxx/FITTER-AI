package com.sailxx.fitter.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
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
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
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
import com.sailxx.fitter.ui.Launch
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
private fun Context.density() = resources.displayMetrics.density

/**
 * Масштаб содержимого под настоящий размер виджета: макет нарисован под базовый размер
 * и растёт вместе с виджетом, когда его растягивают. Так не остаётся пустых полей.
 */
@Composable
private fun scale(baseW: Float, baseH: Float): Float {
    val s = LocalSize.current
    return minOf(s.width.value / baseW, s.height.value / baseH).coerceIn(0.8f, 2.2f)
}

private fun sp(v: Float, k: Float): TextUnit = (v * k).sp
private fun dp(v: Float, k: Float): Dp = (v * k).dp

// Размеры текста из «Настроек»: одинаковы для всех виджетов, поэтому храним их рядом с отрисовкой
private var textLook = com.sailxx.fitter.data.WidgetLook()
private var mutColor = Color.Unspecified
private var fontScale = 1f

/** Запомнить настройки текста перед отрисовкой виджета. */
private fun applyText(context: Context, g: Skin) {
    textLook = g.look
    mutColor = g.mut
    fontScale = context.resources.configuration.fontScale
}

/**
 * Текст виджета. Размер в макете — для настроек «M»; дальше он умножается на выбранный размер:
 * крупные жирные цифры — на «Главное число», серые подписи — на «Подписи», остальное — на «Текст».
 * «Не учитывать системный размер шрифта» убирает масштаб шрифта телефона.
 */
@Composable
private fun T(text: String, size: TextUnit, color: Color, bold: Boolean = false, modifier: GlanceModifier = GlanceModifier, maxLines: Int = 1, align: TextAlign? = null) {
    val l = textLook
    val mul = when {
        bold && size.value >= 18f -> l.numSize / 26f
        color == mutColor -> l.capSize / 10f
        else -> l.textSize / 12f
    }
    val fs = (size.value * mul / (if (l.fixedFont) fontScale else 1f)).sp
    Text(
        text, modifier = modifier, maxLines = maxLines,
        style = TextStyle(color = cp(color), fontSize = fs, fontWeight = if (bold) FontWeight.Bold else FontWeight.Medium, textAlign = align),
    )
}

/** Фон под размер виджета: белый или чёрный по теме Fitter, прозрачность и скругление из настроек. */
@Composable
private fun bg(g: Skin): GlanceModifier {
    val ctx = LocalContext.current
    val size = LocalSize.current
    return GlanceModifier.fillMaxSize()
        .background(ImageProvider(bgBitmap(g, size.width.px(ctx), size.height.px(ctx), ctx.density())))
        .cornerRadius(g.look.corners.dp)
}

@Composable
private fun Img(@DrawableRes res: Int, size: Dp, modifier: GlanceModifier = GlanceModifier) =
    Image(ImageProvider(res), contentDescription = null, modifier = modifier.size(size))

@Composable
private fun Bmp(bmp: android.graphics.Bitmap, w: Dp, h: Dp, modifier: GlanceModifier = GlanceModifier) =
    Image(ImageProvider(bmp), contentDescription = null, modifier = modifier.size(w, h))

@Composable
private fun SignIn(g: Skin) {
    Column(GlanceModifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalAlignment = Alignment.CenterVertically) {
        Image(ImageProvider(R.drawable.ic_logo), contentDescription = "FITTER", modifier = GlanceModifier.size(36.dp))
        Spacer(GlanceModifier.height(6.dp))
        T("Войдите в Fitter", 12.sp, g.ink, bold = true, align = TextAlign.Center)
    }
}

/** Кольцо с подписью внутри: картинка-кольцо и текст поверх. */
@Composable
private fun RingBox(g: Skin, progress: Float, size: Dp, stroke: Float, color: Color? = null, content: @Composable () -> Unit) {
    val ctx = LocalContext.current
    Box(GlanceModifier.size(size), contentAlignment = Alignment.Center) {
        Bmp(ringBitmap(g, progress, size.px(ctx), (size * stroke).px(ctx).toFloat(), color), size, size)
        Column(horizontalAlignment = Alignment.CenterHorizontally) { content() }
    }
}

/** Число в кольце калорий: «осталось» или «съедено» — как выбрано в настройках. */
@Composable
private fun KcalCenter(g: Skin, s: Summary, numSize: TextUnit, labelSize: TextUnit, short: Boolean = false) {
    val left = s.kcalLeft
    if (g.look.showEaten) {
        T(n(s.kcal), numSize, g.ink, bold = true)
        T(if (short) "съедено" else "съедено ккал", labelSize, g.mut)
    } else {
        T(n(kotlin.math.abs(left)), numSize, if (left < 0) Palette.Protein else g.ink, bold = true)
        T(if (left < 0) "сверх нормы" else if (short) "осталось" else "осталось ккал", labelSize, g.mut)
    }
}

@Composable
private fun MacroLine(g: Skin, label: String, v: Int, max: Int, color: Color, w: Dp, k: Float) {
    val ctx = LocalContext.current
    Column(GlanceModifier.fillMaxWidth().padding(bottom = dp(4f, k))) {
        Row(GlanceModifier.fillMaxWidth()) {
            T(label, sp(11f, k), g.mut, modifier = GlanceModifier.defaultWeight())
            T("$v / $max г", sp(11f, k), g.ink, bold = true)
        }
        Spacer(GlanceModifier.height(dp(2f, k)))
        Bmp(barBitmap(g, if (max > 0) v.toFloat() / max else 0f, color, w.px(ctx), dp(5f, k).px(ctx)), w, dp(5f, k))
    }
}

@Composable
private fun Macros(g: Skin, s: Summary, w: Dp, k: Float) {
    MacroLine(g, "Белки", s.p, s.targets.p, Palette.Protein, w, k)
    MacroLine(g, "Жиры", s.f, s.targets.f, Palette.Fat, w, k)
    MacroLine(g, "Углеводы", s.c, s.targets.c, Palette.Carbs, w, k)
}

/** Основа: читаем сохранённое и оформление, рисуем содержимое или просьбу войти. */
abstract class FitterWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact

    @Composable
    abstract fun Content(g: Skin, s: Summary, st: AppState)

    open val pad: Dp = 14.dp

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val st = FitterRepository.load(context)
        val g = skinFor(context)
        applyText(context, g)
        provideContent {
            val s = st.summary
            Box(bg(g).padding(if (s == null) 8.dp else pad).clickable(actionStartActivity<MainActivity>())) {
                if (!st.loggedIn || s == null) SignIn(g) else Content(g, s, st)
            }
        }
    }
}

// ───────────────────────────── «Калории» 2×2 (растягивается) ─────────────────────────────

class CaloriesWidget : FitterWidget() {
    @Composable
    override fun Content(g: Skin, s: Summary, st: AppState) {
        val size = LocalSize.current
        val w = size.width - 28.dp
        val h = size.height - 28.dp
        when {
            // Широкий (3×2, 4×2): кольцо слева, крупные цифры и БЖУ справа
            w > h * 1.45f -> {
                val k = scale(300f, 140f)
                val ring = minOf(h, w * 0.45f)
                Row(GlanceModifier.fillMaxSize(), verticalAlignment = Alignment.CenterVertically) {
                    RingBox(g, s.progress, ring, 0.085f) {
                        Img(R.drawable.ic_kcal, ring * 0.16f)
                        T("${s.kcal * 100 / maxOf(1, s.targets.kcal)}%", (ring.value * 0.16f).sp, g.ink, bold = true)
                    }
                    Spacer(GlanceModifier.width(dp(14f, k)))
                    val col = w - ring - dp(14f, k)
                    Column(GlanceModifier.width(col)) {
                        KcalCenter(g, s, sp(30f, k), sp(12f, k))
                        T("${n(s.kcal)} из ${n(s.targets.kcal)} ккал", sp(12f, k), g.mut)
                        if (h.value >= 120f) {
                            Spacer(GlanceModifier.height(dp(6f, k)))
                            Macros(g, s, col, k)
                        }
                    }
                }
            }
            // Высокий (2×3 и выше): кольцо сверху, БЖУ снизу
            h > w * 1.3f -> {
                val k = scale(160f, 240f)
                val ring = w * 0.86f
                Column(GlanceModifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally) {
                    RingBox(g, s.progress, ring, 0.085f) { KcalCenter(g, s, (ring.value * 0.2f).sp, sp(10f, k)) }
                    Spacer(GlanceModifier.height(dp(6f, k)))
                    T("${n(s.kcal)} из ${n(s.targets.kcal)}", sp(12f, k), g.mut)
                    Spacer(GlanceModifier.defaultWeight())
                    Macros(g, s, w, k)
                }
            }
            else -> {
                val k = scale(160f, 160f)
                val ring = minOf(w, h - dp(22f, k))
                Column(GlanceModifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalAlignment = Alignment.CenterVertically) {
                    RingBox(g, s.progress, ring, 0.085f) { KcalCenter(g, s, (ring.value * 0.21f).sp, sp(10f, k)) }
                    Spacer(GlanceModifier.height(dp(4f, k)))
                    T("${n(s.kcal)} из ${n(s.targets.kcal)}", sp(11f, k), g.mut)
                }
            }
        }
    }
}

// ───────────────────────────── «Осталось» 1×1 ─────────────────────────────

class LeftWidget : FitterWidget() {
    override val pad = 6.dp

    @Composable
    override fun Content(g: Skin, s: Summary, st: AppState) {
        val size = LocalSize.current
        val ring = minOf(size.width, size.height) - 12.dp
        Box(GlanceModifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            RingBox(g, s.progress, ring, 0.09f) {
                val v = if (g.look.showEaten) s.kcal else kotlin.math.abs(s.kcalLeft)
                T(n(v), (ring.value * 0.22f).sp, if (!g.look.showEaten && s.kcalLeft < 0) Palette.Protein else g.ink, bold = true)
                if (ring.value >= 90f) T(if (g.look.showEaten) "съедено" else "осталось", (ring.value * 0.1f).sp, g.mut)
            }
        }
    }
}

// ───────────────────────────── «Сегодня» 4×2 (растягивается) ─────────────────────────────

class TodayWidget : FitterWidget() {
    @Composable
    override fun Content(g: Skin, s: Summary, st: AppState) {
        val size = LocalSize.current
        val w = size.width - 28.dp
        val h = size.height - 28.dp
        // Высокий (4×3 и выше): под сводкой — последние приёмы пищи
        val tall = h.value >= 230f
        val top = if (tall) minOf(h * 0.55f, 190.dp) else h
        val k = minOf(w.value / 300f, top.value / 135f).coerceIn(0.8f, 1.9f)
        val ring = minOf(top, w * 0.42f)
        val colW = w - ring - dp(14f, k)
        val pct = if (s.targets.kcal > 0) s.kcal * 100 / s.targets.kcal else 0
        Column(GlanceModifier.fillMaxSize()) {
            Row(GlanceModifier.fillMaxWidth().height(top), verticalAlignment = Alignment.CenterVertically) {
                RingBox(g, s.progress, ring, 0.085f) {
                    KcalCenter(g, s, (ring.value * 0.19f).sp, sp(10f, k), short = true)
                    T("$pct%", sp(10f, k), g.ink, bold = true)
                }
                Spacer(GlanceModifier.width(dp(14f, k)))
                Column(GlanceModifier.width(colW)) {
                    val left = s.kcalLeft
                    T(
                        when { g.look.showEaten && left >= 0 -> "Осталось ${n(left)} ккал"; left >= 0 -> "Съедено ${n(s.kcal)} ккал"; else -> "+${n(-left)} ккал сверх нормы" },
                        sp(14f, k), if (left < 0) Palette.Protein else g.ink, bold = true,
                    )
                    Spacer(GlanceModifier.height(dp(5f, k)))
                    if (g.look.showMacros) Macros(g, s, colW, k)
                    if (g.look.showWater) {
                        Spacer(GlanceModifier.height(dp(3f, k)))
                        Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                            Img(R.drawable.ic_water, dp(16f, k))
                            Spacer(GlanceModifier.width(dp(6f, k)))
                            val all = maxOf(1, (s.waterGoal + CUP - 1) / CUP)
                            T("${s.water / CUP} из $all стаканов · ${liters(s.water)}", sp(12f, k), g.ink, modifier = GlanceModifier.defaultWeight())
                        }
                    }
                }
            }
            if (tall) {
                Spacer(GlanceModifier.height(12.dp))
                T("Приёмы пищи", sp(13f, k), g.ink, bold = true)
                val meals = st.day?.meals.orEmpty().takeLast(((h - top - 30.dp).value / 30f).toInt().coerceIn(1, 6))
                if (meals.isEmpty()) {
                    T("Пока пусто — нажми «Фото еды» или «+» в приложении", sp(12f, k), g.mut, maxLines = 2)
                } else {
                    meals.forEach { m ->
                        Row(GlanceModifier.fillMaxWidth().padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                            Img(R.drawable.ic_plate, dp(18f, k))
                            Spacer(GlanceModifier.width(8.dp))
                            T(m.title, sp(12f, k), g.ink, modifier = GlanceModifier.defaultWeight())
                            T("${m.time} · ${n(m.kcal)}", sp(12f, k), g.mut)
                        }
                    }
                }
            }
        }
    }
}

// ───────────────────────────── «Вода» 2×2 (растягивается) ─────────────────────────────

class WaterWidget : FitterWidget() {
    @Composable
    override fun Content(g: Skin, s: Summary, st: AppState) {
        val ctx = LocalContext.current
        val size = LocalSize.current
        val w = size.width - 28.dp
        val h = size.height - 28.dp
        val water = if (g.dark) Color(0xFF8FD0FF) else Palette.Water2
        val all = maxOf(1, (s.waterGoal + CUP - 1) / CUP)
        val on = s.water / CUP
        val level = if (s.waterGoal > 0) s.water.toFloat() / s.waterGoal else 0f
        val wide = w > h * 1.45f
        val k = if (wide) scale(300f, 140f) else scale(160f, 160f)
        val glassH = if (wide) h * 0.9f else (h * 0.5f).coerceAtLeast(dp(56f, k))
        val glassW = glassH / 1.35f
        val glass = glassBitmap(level, water, glassW.px(ctx), glassH.px(ctx))

        val info: @Composable () -> Unit = {
            T("Вода", sp(12f, k), g.mut)
            T(liters(s.water), sp(30f, k), g.ink, bold = true)
            T(if (s.water >= s.waterGoal) "норма ${liters(s.waterGoal)} ✓" else "из ${liters(s.waterGoal)}", sp(12f, k), g.mut)
        }
        val cups: @Composable (Dp) -> Unit = { width ->
            val cupW = ((width.value - (all - 1) * 3 * k) / all).coerceIn(4f, 16f * k).dp
            val cupH = (cupW * 1.25f).coerceAtMost(dp(18f, k))
            Bmp(cupsBitmap(g, on, all, water, cupW.px(ctx), cupH.px(ctx), dp(3f, k).px(ctx)), cupW * all + dp(3f, k) * (all - 1), cupH)
        }
        val left: @Composable () -> Unit = {
            val rest = s.waterGoal - s.water
            T(if (rest > 0) "Ещё ${(rest + CUP - 1) / CUP} ${if ((rest + CUP - 1) / CUP == 1) "стакан" else "стакана"} до нормы" else "Норма выполнена 💧", sp(12f, k), g.ink, bold = true)
        }

        if (wide) {
            Row(GlanceModifier.fillMaxSize(), verticalAlignment = Alignment.CenterVertically) {
                Bmp(glass, glassW, glassH)
                Spacer(GlanceModifier.width(dp(16f, k)))
                val col = w - glassW - dp(16f, k)
                Column(GlanceModifier.width(col)) {
                    info()
                    Spacer(GlanceModifier.height(dp(8f, k)))
                    cups(col)
                    Spacer(GlanceModifier.height(dp(8f, k)))
                    left()
                }
            }
        } else {
            Column(GlanceModifier.fillMaxSize()) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Bmp(glass, glassW, glassH)
                    Spacer(GlanceModifier.width(dp(12f, k)))
                    Column { info() }
                }
                Spacer(GlanceModifier.defaultWeight())
                cups(w)
                Spacer(GlanceModifier.height(dp(8f, k)))
                left()
            }
        }
    }
}

// ───────────────────────────── «БЖУ» 4×1 / 4×2 ─────────────────────────────

class MacrosWidget : FitterWidget() {
    override val pad = 12.dp

    @Composable
    override fun Content(g: Skin, s: Summary, st: AppState) {
        val ctx = LocalContext.current
        val size = LocalSize.current
        val w = size.width - 24.dp
        val h = size.height - 24.dp
        val items = listOf(
            Triple(R.drawable.ic_protein, "Белки", Triple(s.p, s.targets.p, Palette.Protein)),
            Triple(R.drawable.ic_fat, "Жиры", Triple(s.f, s.targets.f, Palette.Fat)),
            Triple(R.drawable.ic_carbs, "Углеводы", Triple(s.c, s.targets.c, Palette.Carbs)),
        )
        val colW = (w - 16.dp) / 3
        if (h.value >= 110f) {
            // Высокий: три кольца с цифрами внутри
            val k = scale(330f, 150f)
            val ring = minOf(colW, h - dp(34f, k))
            Row(GlanceModifier.fillMaxSize(), verticalAlignment = Alignment.CenterVertically) {
                items.forEachIndexed { i, (icon, label, m) ->
                    if (i > 0) Spacer(GlanceModifier.width(8.dp))
                    Column(GlanceModifier.width(colW), horizontalAlignment = Alignment.CenterHorizontally) {
                        RingBox(g, if (m.second > 0) m.first.toFloat() / m.second else 0f, ring, 0.09f, m.third) {
                            Img(icon, ring * 0.22f)
                            T("${m.first}", (ring.value * 0.2f).sp, g.ink, bold = true)
                            T("из ${m.second} г", (ring.value * 0.09f).sp, g.mut)
                        }
                        Spacer(GlanceModifier.height(dp(4f, k)))
                        val left = m.second - m.first
                        T(if (left > 0) "$label: ещё $left г" else label, sp(11f, k), g.mut, align = TextAlign.Center)
                    }
                }
            }
        } else {
            val k = scale(330f, 70f)
            val barW = (colW - dp(30f, k)).coerceAtLeast(20.dp)
            Row(GlanceModifier.fillMaxSize(), verticalAlignment = Alignment.CenterVertically) {
                items.forEachIndexed { i, (icon, label, m) ->
                    if (i > 0) Spacer(GlanceModifier.width(8.dp))
                    Row(GlanceModifier.width(colW), verticalAlignment = Alignment.CenterVertically) {
                        Img(icon, dp(22f, k))
                        Spacer(GlanceModifier.width(dp(6f, k)))
                        Column {
                            T(label, sp(11f, k), g.mut)
                            T("${m.first} / ${m.second}", sp(13f, k), g.ink, bold = true)
                            Spacer(GlanceModifier.height(2.dp))
                            Bmp(barBitmap(g, if (m.second > 0) m.first.toFloat() / m.second else 0f, m.third, barW.px(ctx), dp(4f, k).px(ctx)), barW, dp(4f, k))
                        }
                    }
                }
            }
        }
    }
}

// ───────────────────────────── «Таблетки» 2×2 (растягивается) ─────────────────────────────

/** Ближайший неотмеченный приём: по времени из сводки, иначе первый неотмеченный. */
private fun nextDose(s: Summary, st: AppState) = run {
    val doses = st.day?.pills.orEmpty().filter { it.s.isEmpty() }
    doses.firstOrNull { it.time == s.pillNext } ?: doses.firstOrNull()
}

class PillsWidget : FitterWidget() {
    @Composable
    override fun Content(g: Skin, s: Summary, st: AppState) {
        val ctx = LocalContext.current
        val size = LocalSize.current
        val w = size.width - 28.dp
        val h = size.height - 28.dp
        val k = scale(160f, 160f)
        Column(GlanceModifier.fillMaxSize()) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Img(R.drawable.ic_pill, dp(24f, k))
                Spacer(GlanceModifier.width(dp(8f, k)))
                T("Таблетки", sp(14f, k), g.ink, bold = true, modifier = GlanceModifier.defaultWeight())
                if (s.pillsTotal > 0) T("${s.pillsTaken}/${s.pillsTotal}", sp(14f, k), g.mut, bold = true)
            }
            if (s.pillsTotal == 0) {
                Spacer(GlanceModifier.defaultWeight())
                T("Добавь витамины в дневнике — напомню вовремя", sp(12f, k), g.mut, maxLines = 3)
                Spacer(GlanceModifier.defaultWeight())
                return@Column
            }
            Spacer(GlanceModifier.height(dp(8f, k)))
            Bmp(barBitmap(g, s.pillsTaken.toFloat() / s.pillsTotal, Palette.Pill, w.px(ctx), dp(6f, k).px(ctx)), w, dp(6f, k))
            // Высокий: список приёмов с отметками
            val doses = st.day?.pills.orEmpty()
            val rows = ((h - dp(110f, k)).value / (22f * k)).toInt().coerceIn(0, doses.size)
            if (rows > 0) {
                Spacer(GlanceModifier.height(dp(6f, k)))
                doses.take(rows).forEach { d ->
                    Row(GlanceModifier.fillMaxWidth().padding(vertical = dp(2f, k)), verticalAlignment = Alignment.CenterVertically) {
                        T(d.time, sp(11f, k), g.mut, bold = true)
                        Spacer(GlanceModifier.width(dp(8f, k)))
                        T(d.name, sp(12f, k), if (d.s == "taken") g.mut else g.ink, modifier = GlanceModifier.defaultWeight())
                        T(when (d.s) { "taken" -> "✅"; "skip" -> "⏭"; else -> "○" }, sp(12f, k), g.mut)
                    }
                }
            } else {
                Spacer(GlanceModifier.height(dp(6f, k)))
                T("принято сегодня", sp(11f, k), g.mut)
            }
            Spacer(GlanceModifier.defaultWeight())
            val next = nextDose(s, st)
            if (next == null) {
                T("Все приняты ✅", sp(13f, k), g.ink, bold = true)
            } else {
                T("Следующая в ${next.time}: ${next.name}", sp(13f, k), g.ink, bold = true)
            }
        }
    }
}

// ───────────────────────────── «Фото еды» 1×1 / 2×1 ─────────────────────────────

/** Открывает приложение сразу с камерой: снял тарелку — нейросеть посчитала калории. */
class PhotoWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val g = skinFor(context)
        applyText(context, g)
        val open = Intent(context, MainActivity::class.java)
            .putExtra(Launch.EXTRA_ADD, "camera")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        provideContent {
            val size = LocalSize.current
            val side = minOf(size.width, size.height)
            if (size.width > size.height * 1.6f) {
                Row(bg(g).padding(horizontal = 14.dp).clickable(actionStartActivity(open)), verticalAlignment = Alignment.CenterVertically) {
                    Img(R.drawable.ic_camera, side * 0.55f)
                    Spacer(GlanceModifier.width(10.dp))
                    Column {
                        T("Фото еды", (side.value * 0.2f).sp, g.ink, bold = true)
                        T("посчитаю калории", (side.value * 0.14f).sp, g.mut)
                    }
                }
            } else {
                Column(
                    bg(g).clickable(actionStartActivity(open)),
                    horizontalAlignment = Alignment.CenterHorizontally, verticalAlignment = Alignment.CenterVertically,
                ) {
                    Img(R.drawable.ic_camera, side * 0.45f)
                    Spacer(GlanceModifier.height(2.dp))
                    T("Фото", (side.value * 0.15f).sp, g.ink, bold = true)
                }
            }
        }
    }
}

// ───────────────────────────── «Неделя» 4×2 (растягивается) ─────────────────────────────

private val WD = listOf("Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс")

class WeekWidget : FitterWidget() {
    @Composable
    override fun Content(g: Skin, s: Summary, st: AppState) {
        val ctx = LocalContext.current
        val size = LocalSize.current
        val w = size.width - 28.dp
        val h = size.height - 28.dp
        val k = scale(330f, 160f)
        val week = st.day?.week.orEmpty()
        val todayIdx = week.indexOfFirst { it.date == s.date }
        val withMeals = week.filter { it.meals > 0 }
        val showFooter = h.value >= 200f && withMeals.isNotEmpty()
        val chartH = (h - dp(26f, k) - dp(18f, k) - if (showFooter) dp(22f, k) else 0.dp).coerceAtLeast(30.dp)
        Column(GlanceModifier.fillMaxSize()) {
            Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                T("Неделя", sp(15f, k), g.ink, bold = true, modifier = GlanceModifier.defaultWeight())
                if (s.streak > 0) T("🔥 серия ${s.streak} дн.", sp(11f, k), g.mut)
            }
            Spacer(GlanceModifier.height(dp(8f, k)))
            if (week.size == 7) {
                Bmp(weekBitmap(g, week.map { if (it.meals > 0) it.kcal else 0 }, s.targets.kcal, todayIdx, w.px(ctx), chartH.px(ctx), ctx.density()), w, chartH)
                Spacer(GlanceModifier.height(dp(4f, k)))
                Row(GlanceModifier.fillMaxWidth()) {
                    WD.forEachIndexed { i, d ->
                        T(d, sp(10f, k), if (i == todayIdx) g.ink else g.mut, bold = i == todayIdx, modifier = GlanceModifier.width(w / 7), align = TextAlign.Center)
                    }
                }
                if (showFooter) {
                    val goal = s.targets.kcal
                    val avg = withMeals.sumOf { it.kcal } / withMeals.size
                    val inNorm = withMeals.count { it.kcal >= goal * 0.9 && it.kcal <= goal * 1.1 }
                    Spacer(GlanceModifier.height(dp(6f, k)))
                    T("В среднем ${n(avg)} ккал · в норме $inNorm из ${withMeals.size}", sp(11f, k), g.mut)
                }
            } else {
                T("Открой приложение, чтобы загрузить неделю", sp(12f, k), g.mut, maxLines = 2)
            }
        }
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
 * Фоновое обновление раз в 15 минут (чаще Android не даёт): еда и вода, записанные в боте,
 * и новый день после полуночи появляются на виджетах без открытия приложения.
 */
class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        FitterRepository.refresh(applicationContext)
        return Result.success()
    }

    companion object {
        private const val NAME = "fitter-sync"

        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(NAME, ExistingPeriodicWorkPolicy.UPDATE, request)
        }

        fun cancel(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(NAME)
        }
    }
}
