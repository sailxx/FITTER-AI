package com.sailxx.fitter.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import com.sailxx.fitter.data.ThemeMode

/**
 * Цвета FITTER — те же, что у дневника в Telegram (APP_HTML в worker.js):
 * яркая зелёная шапка с тёмно-зелёным текстом, белые карточки, синяя вода, фиолетовые таблетки.
 */
object Palette {
    // Шапка
    val Hero1 = Color(0xFF62FFB0)
    val Hero2 = Color(0xFF2EF88F)
    val Hero3 = Color(0xFF12E97C)
    val HeroInk = Color(0xFF03301A)
    val HeroSub = Color(0xBF03301A)
    val HeroBtn = Color(0x6BFFFFFF)
    val HeroChip = Color(0x80FFFFFF)
    val HeroTrack = Color(0x1F03301A)
    val HeroSelInk = Color(0xFF5DFFAD)
    val ArcEnd = Color(0xFFE6FFF1)
    val Knob = Color(0xFF13A35A)
    val InSub = Color(0xFF55705F)
    val EmBg = Color(0xFFE3FBEE)
    val EmInk = Color(0xFF0B6B3A)

    // Зелёные акценты
    val G1 = Color(0xFF2EE59D)
    val G2 = Color(0xFF16B86A)
    val G3 = Color(0xFF0E8F6E)
    val Green = Color(0xFF30D158)

    // Превышение нормы
    val Danger = Color(0xFFFF5A4E)
    val OverDark = Color(0xFFB4231A)
    val OverLight = Color(0xFFFF6A4D)
    val OverDot = Color(0xFFD93A2F)
    val Over = Color(0xFFFF9F0A)

    // БЖУ
    val Protein = Color(0xFFFF7A2F)
    val Fat = Color(0xFFF5A524)
    val Carbs = Color(0xFF22B36B)

    // Вода и таблетки
    val Water1 = Color(0xFF5AB8FF)
    val Water2 = Color(0xFF2A7BF0)
    val Water = Water2
    val Pill = Color(0xFF8F5BFF)

    // Экран «Сегодня» в стиле «Ночь»: плитки тонированы цветом своего показателя
    val MacroP = Color(0xFFEC6A6A)
    val MacroC = Color(0xFFE3A35E)
    val MacroF = Color(0xFF5C92E6)
    val WaterTile = Color(0xFF4FB3FF)
    val WaterInk = Color(0xFF2A7BF0)
    val PillTile = Color(0xFFA98BFF)
    val PillInk = Color(0xFF7B5CF0)
}

/** Токены поверхности: фон, карточки, подписи — свои для светлой и тёмной темы. */
data class Tokens(
    val bg: Color,
    val card: Color,
    val text: Color,
    val hint: Color,
    val line: Color,
    val edge: Color,
    val fill: Color,
    val shadow: Boolean,
    val dark: Boolean,
)

// Нейтральные цвета в духе Cal AI: графитовый фон и карточки чуть светлее, в светлой теме — белые карточки на сером
private val LightTokens = Tokens(
    bg = Color(0xFFF3F3F6), card = Color.White, text = Color(0xFF111114), hint = Color(0xFF8A8A94),
    line = Color(0x14111114), edge = Color(0x0A111114), fill = Color(0x0D111114), shadow = true, dark = false,
)
private val DarkTokens = Tokens(
    bg = Color(0xFF1B1B20), card = Color(0xFF26262D), text = Color(0xFFF4F4F6), hint = Color(0xFF9A9AA6),
    line = Color(0x14FFFFFF), edge = Color(0x0DFFFFFF), fill = Color(0x14FFFFFF), shadow = false, dark = true,
)

val LocalTokens = staticCompositionLocalOf { LightTokens }

@Composable
fun FitterTheme(mode: ThemeMode = ThemeMode.SYSTEM, content: @Composable () -> Unit) {
    val dark = when (mode) {
        ThemeMode.LIGHT -> false
        ThemeMode.DARK -> true
        ThemeMode.SYSTEM -> isSystemInDarkTheme()
    }
    val t = if (dark) DarkTokens else LightTokens
    val scheme = if (dark) {
        darkColorScheme(primary = Palette.G1, onPrimary = Palette.HeroInk, background = t.bg, surface = t.card, onBackground = t.text, onSurface = t.text)
    } else {
        lightColorScheme(primary = Palette.G2, onPrimary = Color.White, background = t.bg, surface = t.card, onBackground = t.text, onSurface = t.text)
    }
    CompositionLocalProvider(LocalTokens provides t) {
        MaterialTheme(colorScheme = scheme, content = content)
    }
}
