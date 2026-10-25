package com.sailxx.fitter.data

import android.content.Context
import android.content.res.Configuration
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/** Тема Fitter: как в системе, всегда светлая или всегда тёмная. От неё же зависит цвет виджетов. */
enum class ThemeMode(private val ru: String, private val en: String) {
    SYSTEM("Как в системе", "Same as system"), LIGHT("Светлая", "Light"), DARK("Тёмная", "Dark");

    val title get() = tr(ru, en)
}

/**
 * Выбор темы живёт в отдельном файле настроек: выход из аккаунта стирает данные дневника, но не тему.
 */
object ThemePref {
    private const val PREFS = "fitter_ui"
    private val _mode = MutableStateFlow(ThemeMode.SYSTEM)
    val mode: StateFlow<ThemeMode> get() = _mode

    fun load(context: Context): ThemeMode {
        val m = runCatching {
            ThemeMode.valueOf(context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("theme", null) ?: "SYSTEM")
        }.getOrDefault(ThemeMode.SYSTEM)
        _mode.value = m
        return m
    }

    fun set(context: Context, m: ThemeMode) {
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("theme", m.name).apply()
        _mode.value = m
    }

    /** Тёмная ли сейчас тема Fitter: для «Как в системе» смотрим ночной режим телефона. */
    fun isDark(context: Context): Boolean = when (load(context)) {
        ThemeMode.LIGHT -> false
        ThemeMode.DARK -> true
        ThemeMode.SYSTEM -> (context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
    }
}
