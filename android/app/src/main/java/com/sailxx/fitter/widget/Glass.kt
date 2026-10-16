package com.sailxx.fitter.widget

import android.app.WallpaperColors
import android.app.WallpaperManager
import android.content.Context
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.os.Build
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.toArgb
import com.sailxx.fitter.R
import com.sailxx.fitter.ui.Palette
import kotlin.math.PI
import kotlin.math.sin

/**
 * Стиль «Стекло»: полупрозрачная подложка с тонкой белой рамкой, обои просвечивают.
 * Размытия под виджетом Android не даёт, поэтому цвет текста подбираем под обои:
 * светлые обои — белое стекло и тёмный текст, тёмные — тёмное стекло и белый текст.
 */
data class Glass(
    val dark: Boolean,
    val ink: Color,
    val mut: Color,
    val trk: Color,
    val arc: Color,
    val bg: Int,
    val btn: Color,
    val btnInk: Color,
)

private val LightGlass = Glass(
    dark = false, ink = Color(0xFF13201A), mut = Color(0xA613201A), trk = Color(0x1F13201A), arc = Palette.G2,
    bg = R.drawable.widget_glass_light, btn = Color(0xD9FFFFFF), btnInk = Palette.Water2,
)
private val DarkGlass = Glass(
    dark = true, ink = Color.White, mut = Color(0xBFFFFFFF), trk = Color(0x38FFFFFF), arc = Color.White,
    bg = R.drawable.widget_glass_dark, btn = Color(0xD9FFFFFF), btnInk = Palette.Water2,
)

/** Светлые ли обои: подсказка системы (Android 12+), иначе яркость основного цвета, иначе тема телефона. */
fun glassFor(context: Context): Glass {
    val darkText: Boolean? = try {
        val wc: WallpaperColors? = WallpaperManager.getInstance(context).getWallpaperColors(WallpaperManager.FLAG_SYSTEM)
        when {
            wc == null -> null
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> (wc.colorHints and WallpaperColors.HINT_SUPPORTS_DARK_TEXT) != 0
            else -> Color(wc.primaryColor.toArgb()).luminance() > 0.5f
        }
    } catch (e: Exception) {
        null
    }
    val night = (context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
    return if (darkText ?: !night) LightGlass else DarkGlass
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
fun ringBitmap(g: Glass, progress: Float, sizePx: Int, strokePx: Float): Bitmap {
    val bmp = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
    val c = Canvas(bmp)
    val pad = strokePx / 2 + 1
    val r = RectF(pad, pad, sizePx - pad, sizePx - pad)
    c.drawArc(r, 0f, 360f, false, paint(g.trk, strokePx))
    val sweep = 360f * progress.coerceIn(0f, 1f)
    if (sweep > 0f) c.drawArc(r, -90f, sweep.coerceAtLeast(1f), false, paint(if (progress > 1.1f) Palette.Protein else g.arc, strokePx))
    return bmp
}

/** Полоска прогресса со скруглёнными концами. */
fun barBitmap(g: Glass, progress: Float, color: Color, wPx: Int, hPx: Int): Bitmap {
    val bmp = Bitmap.createBitmap(wPx.coerceAtLeast(1), hPx.coerceAtLeast(1), Bitmap.Config.ARGB_8888)
    val c = Canvas(bmp)
    val rad = hPx / 2f
    c.drawRoundRect(RectF(0f, 0f, wPx.toFloat(), hPx.toFloat()), rad, rad, paint(g.trk))
    val w = wPx * progress.coerceIn(0f, 1f)
    if (w > 0f) c.drawRoundRect(RectF(0f, 0f, w.coerceAtLeast(hPx.toFloat()), hPx.toFloat()), rad, rad, paint(color))
    return bmp
}

/** Стаканчики воды по 250 мл: залитые и пустые. */
fun cupsBitmap(g: Glass, on: Int, all: Int, color: Color, cupW: Int, cupH: Int, gap: Int): Bitmap {
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
fun weekBitmap(g: Glass, kcal: List<Int>, goal: Int, todayIdx: Int, wPx: Int, hPx: Int, density: Float): Bitmap {
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
