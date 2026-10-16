package com.sailxx.fitter.widget

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import com.sailxx.fitter.data.ThemePref
import com.sailxx.fitter.data.WidgetLook
import com.sailxx.fitter.data.WidgetPrefs
import com.sailxx.fitter.ui.Palette
import kotlin.math.PI
import kotlin.math.sin

/**
 * Оформление виджетов: белые при светлой теме Fitter, чёрные при тёмной.
 * Прозрачность фона, скругление и содержимое настраиваются в «Настройках» приложения (WidgetPrefs).
 */
data class Skin(
    val dark: Boolean,
    val ink: Color,
    val mut: Color,
    val trk: Color,
    val arc: Color,
    val base: Color,
    val edge: Color,
    val btn: Color,
    val btnInk: Color,
    val look: WidgetLook,
)

fun skinFor(context: Context): Skin = skinOf(ThemePref.isDark(context), WidgetPrefs.load(context))

/** Цвета виджета для темы — и для настоящих виджетов, и для предпросмотра в настройках. */
fun skinOf(dark: Boolean, look: WidgetLook): Skin {
    return if (dark) {
        Skin(
            dark = true, ink = Color.White, mut = Color(0xA6FFFFFF), trk = Color(0x2EFFFFFF), arc = Palette.G1,
            base = Color.Black, edge = Color(0x24FFFFFF), btn = Color(0xFF16263D), btnInk = Color(0xFF8FD0FF), look = look,
        )
    } else {
        Skin(
            dark = false, ink = Color(0xFF13201A), mut = Color(0x9913201A), trk = Color(0x1413201A), arc = Palette.G2,
            base = Color.White, edge = Color(0x1A13201A), btn = Color(0xFFE8F1FE), btnInk = Palette.Water2, look = look,
        )
    }
}

/** Фон виджета картинкой: скругление и прозрачность из настроек работают на любой версии Android. */
fun bgBitmap(s: Skin, wPx: Int, hPx: Int, density: Float): Bitmap {
    val bmp = Bitmap.createBitmap(wPx.coerceAtLeast(1), hPx.coerceAtLeast(1), Bitmap.Config.ARGB_8888)
    val c = Canvas(bmp)
    val a = s.look.opacity / 100f
    val r = s.look.corners * density
    val inset = density / 2
    val rect = RectF(inset, inset, wPx - inset, hPx - inset)
    c.drawRoundRect(rect, r, r, paint(s.base.copy(alpha = a)))
    // Тонкая рамка видна и у прозрачного виджета: края не теряются на обоях
    c.drawRoundRect(rect, r, r, paint(s.edge.copy(alpha = s.edge.alpha * (0.5f + a / 2)), density).apply { strokeCap = Paint.Cap.BUTT })
    return bmp
}

// ───────────────────────────── Рисование на Bitmap ─────────────────────────────
// В Glance нет дуг, градиентов и скруглённых полосок на старых Android — рисуем их картинками нужного размера.

private fun paint(c: Color, stroke: Float = 0f) = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = c.toArgb()
    if (stroke > 0f) {
        style = Paint.Style.STROKE
        strokeWidth = stroke
        strokeCap = Paint.Cap.ROUND
    }
}

/** Кольцо: дорожка и дуга с круглыми концами. При превышении нормы дуга оранжевая. */
fun ringBitmap(g: Skin, progress: Float, sizePx: Int, strokePx: Float, color: Color? = null): Bitmap {
    val bmp = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
    val c = Canvas(bmp)
    val pad = strokePx / 2 + 1
    val r = RectF(pad, pad, sizePx - pad, sizePx - pad)
    c.drawArc(r, 0f, 360f, false, paint(g.trk, strokePx))
    val sweep = 360f * progress.coerceIn(0f, 1f)
    if (sweep > 0f) c.drawArc(r, -90f, sweep.coerceAtLeast(1f), false, paint(color ?: if (progress > 1.1f) Palette.Protein else g.arc, strokePx))
    return bmp
}

/** Полоска прогресса со скруглёнными концами. */
fun barBitmap(g: Skin, progress: Float, color: Color, wPx: Int, hPx: Int): Bitmap {
    val bmp = Bitmap.createBitmap(wPx.coerceAtLeast(1), hPx.coerceAtLeast(1), Bitmap.Config.ARGB_8888)
    val c = Canvas(bmp)
    val rad = hPx / 2f
    c.drawRoundRect(RectF(0f, 0f, wPx.toFloat(), hPx.toFloat()), rad, rad, paint(g.trk))
    val w = wPx * progress.coerceIn(0f, 1f)
    if (w > 0f) c.drawRoundRect(RectF(0f, 0f, w.coerceAtLeast(hPx.toFloat()), hPx.toFloat()), rad, rad, paint(color))
    return bmp
}

/** Стаканчики воды по 250 мл: залитые и пустые. */
fun cupsBitmap(g: Skin, on: Int, all: Int, color: Color, cupW: Int, cupH: Int, gap: Int): Bitmap {
    val bmp = Bitmap.createBitmap((all * cupW + (all - 1) * gap).coerceAtLeast(1), cupH, Bitmap.Config.ARGB_8888)
    val c = Canvas(bmp)
    for (i in 0 until all) {
        val x = i * (cupW + gap).toFloat()
        val p = Path().apply {
            moveTo(x, 0f); lineTo(x + cupW, 0f); lineTo(x + cupW * 0.86f, cupH.toFloat()); lineTo(x + cupW * 0.14f, cupH.toFloat()); close()
        }
        c.drawPath(p, paint(if (i < on) color else g.trk))
    }
    return bmp
}

/** Стакан с водой и волной сверху. */
fun glassBitmap(level: Float, color: Color, wPx: Int, hPx: Int): Bitmap {
    val bmp = Bitmap.createBitmap(wPx, hPx, Bitmap.Config.ARGB_8888)
    val c = Canvas(bmp)
    val sw = wPx * 0.065f
    val outline = Path().apply {
        moveTo(sw, sw); lineTo(wPx - sw, sw); lineTo(wPx * 0.82f, hPx - sw * 1.5f)
        quadTo(wPx * 0.8f, hPx - sw / 2, wPx * 0.7f, hPx - sw / 2); lineTo(wPx * 0.3f, hPx - sw / 2)
        quadTo(wPx * 0.2f, hPx - sw / 2, wPx * 0.18f, hPx - sw * 1.5f); close()
    }
    c.save()
    c.clipPath(outline)
    c.drawColor(color.copy(alpha = 0.16f).toArgb())
    val top = sw + (hPx - sw * 2) * (1f - level.coerceIn(0f, 1f) * 0.92f)
    val wave = Path().apply {
        moveTo(0f, hPx.toFloat())
        var x = 0f
        while (x <= wPx) { lineTo(x, top + sin(x / wPx * 2 * PI.toFloat() * 1.3f) * hPx * 0.03f); x += 1f }
        lineTo(wPx.toFloat(), hPx.toFloat()); close()
    }
    c.drawPath(wave, paint(color.copy(alpha = 0.92f)))
    c.restore()
    c.drawPath(outline, paint(color, sw).apply { strokeJoin = Paint.Join.ROUND })
    return bmp
}

/** Неделя: столбики калорий, пунктир нормы, сегодняшний день обведён. */
fun weekBitmap(g: Skin, kcal: List<Int>, goal: Int, todayIdx: Int, wPx: Int, hPx: Int, density: Float): Bitmap {
    val bmp = Bitmap.createBitmap(wPx.coerceAtLeast(1), hPx.coerceAtLeast(1), Bitmap.Config.ARGB_8888)
    val c = Canvas(bmp)
    val top = maxOf(goal * 1.2f, (kcal.maxOrNull() ?: 0).toFloat(), 1f)
    val col = wPx / 7f
    val bw = col * 0.62f
    val rad = 6 * density
    kcal.forEachIndexed { i, k ->
        val h = if (k > 0) maxOf(6 * density, hPx * k / top) else 6 * density
        val x = i * col + (col - bw) / 2
        val r = RectF(x, hPx - h, x + bw, hPx.toFloat())
        val color = when {
            k == 0 -> g.trk
            k > goal * 1.1f -> Palette.Protein
            k >= goal * 0.9f -> g.arc
            else -> g.arc.copy(alpha = 0.45f)
        }
        c.drawRoundRect(r, rad, rad, paint(color))
        if (i == todayIdx) c.drawRoundRect(RectF(r.left - 2 * density, r.top - 2 * density, r.right + 2 * density, r.bottom), rad + 2 * density, rad + 2 * density, paint(g.ink, 1.6f * density))
    }
    if (goal > 0) {
        val y = hPx - hPx * goal / top
        c.drawLine(0f, y, wPx.toFloat(), y, paint(g.mut, 1.5f * density).apply { strokeCap = Paint.Cap.BUTT; pathEffect = DashPathEffect(floatArrayOf(5 * density, 4 * density), 0f) })
    }
    return bmp
}
