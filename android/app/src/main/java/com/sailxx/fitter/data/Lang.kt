package com.sailxx.fitter.data

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import java.util.Locale

/**
 * Язык приложения и виджетов: "en" или "ru". Тот же выбор лежит на сервере (u.lang в worker.js),
 * поэтому бот, дневник в Telegram и приложение говорят на одном языке.
 * Хранится в файле настроек интерфейса рядом с темой: выход из аккаунта язык не стирает.
 * code — состояние Compose: экраны, где вызван tr(), перерисуются сами при смене языка.
 */
object Lang {
    private const val PREFS = "fitter_ui"
    // Пока ответ сервера о смене языка не дошёл, старый ответ не должен вернуть язык назад
    private const val HOLD_MS = 20_000L

    var code by mutableStateOf("en")
        private set
    private var changedAt = 0L

    private fun prefs(context: Context) = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** Прочитать выбор; пока не выбирали — язык телефона (русский для ru, be, kk, иначе английский). */
    fun load(context: Context) {
        val saved = prefs(context).getString("lang", null)
        code = if (saved == "ru" || saved == "en") saved else if (Locale.getDefault().language in RU_LIKE) "ru" else "en"
    }

    fun set(context: Context, c: String) {
        if (c != "ru" && c != "en") return
        prefs(context).edit().putString("lang", c).apply()
        changedAt = System.currentTimeMillis()
        code = c
    }

    /** Язык аккаунта из ответа сервера: его могли сменить в боте или в дневнике. */
    fun fromServer(context: Context, c: String?) {
        if (c != "ru" && c != "en") return
        if (c == code || System.currentTimeMillis() - changedAt < HOLD_MS) return
        prefs(context).edit().putString("lang", c).apply()
        code = c
    }

    private val RU_LIKE = setOf("ru", "be", "kk")
}

/** Текст на языке приложения: tr("Сегодня", "Today"). */
fun tr(ru: String, en: String): String = if (Lang.code == "ru") ru else en
