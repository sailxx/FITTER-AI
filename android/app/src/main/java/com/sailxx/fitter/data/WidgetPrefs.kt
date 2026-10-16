package com.sailxx.fitter.data

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/** Настройки виджетов из экрана «Настройки». Цвет (белый или чёрный) берётся из темы Fitter. */
data class WidgetLook(
    val opacity: Int = 100, // непрозрачность фона, %
    val corners: Int = 24, // скругление углов, dp
    val showEaten: Boolean = false, // в кольце: false — «осталось», true — «съедено»
    val showMacros: Boolean = true, // БЖУ в виджете «Сегодня»
    val showWater: Boolean = true, // строка воды в виджете «Сегодня»
    val numSize: Int = 26, // главное число (калории, литры), sp при базовом размере виджета
    val textSize: Int = 12, // обычный текст: БЖУ, строки, заголовки
    val capSize: Int = 10, // серые подписи
    val fixedFont: Boolean = false, // не учитывать системный размер шрифта
) {
    companion object {
        /** Пресеты S, M, L, XL: главное число, текст, подписи. */
        val PRESETS = listOf(Triple(22, 11, 9), Triple(26, 12, 10), Triple(30, 14, 11), Triple(36, 16, 13))
    }
}

object WidgetPrefs {
    private const val PREFS = "fitter_ui"
    private val _look = MutableStateFlow(WidgetLook())
    val look: StateFlow<WidgetLook> get() = _look

    fun load(context: Context): WidgetLook {
        val p = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val l = WidgetLook(
            opacity = p.getInt("w_opacity", 100).coerceIn(0, 100),
            corners = p.getInt("w_corners", 24).coerceIn(0, 40),
            showEaten = p.getBoolean("w_eaten", false),
            showMacros = p.getBoolean("w_macros", true),
            showWater = p.getBoolean("w_water", true),
            numSize = p.getInt("w_num", 26).coerceIn(16, 44),
            textSize = p.getInt("w_text", 12).coerceIn(9, 20),
            capSize = p.getInt("w_cap", 10).coerceIn(8, 16),
            fixedFont = p.getBoolean("w_fixed", false),
        )
        _look.value = l
        return l
    }

    fun save(context: Context, l: WidgetLook) {
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putInt("w_opacity", l.opacity)
            .putInt("w_corners", l.corners)
            .putBoolean("w_eaten", l.showEaten)
            .putBoolean("w_macros", l.showMacros)
            .putBoolean("w_water", l.showWater)
            .putInt("w_num", l.numSize)
            .putInt("w_text", l.textSize)
            .putInt("w_cap", l.capSize)
            .putBoolean("w_fixed", l.fixedFont)
            .apply()
        _look.value = l
    }
}
