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
    val showWater: Boolean = true, // строка воды с «+» в виджете «Сегодня»
)

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
            .apply()
        _look.value = l
    }
}
