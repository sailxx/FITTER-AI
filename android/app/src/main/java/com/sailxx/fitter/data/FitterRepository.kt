package com.sailxx.fitter.data

import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import android.util.Log
import com.sailxx.fitter.widget.SyncWorker
import com.sailxx.fitter.widget.updateFitterWidgets
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONObject

/** Что видит приложение: вошли ли, последние данные с сервера и когда они пришли. */
data class AppState(
    val loggedIn: Boolean,
    val summary: Summary?,
    val day: Day?,
    val updatedAt: Long,
    val error: String? = null,
)

/**
 * Единственный источник данных для приложения и виджетов.
 * Сервер — главный: здесь только копия последнего ответа, чтобы виджеты и экран открывались сразу, без сети.
 * Токен и кэш лежат в SharedPreferences во внутренней памяти приложения.
 */
object FitterRepository {
    private const val PREFS = "fitter"
    private const val TAG = "Fitter"
    private val lock = Mutex()
    private val _state = MutableStateFlow(AppState(false, null, null, 0))
    val state: StateFlow<AppState> get() = _state

    private fun prefs(context: Context): SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun token(context: Context): String? = prefs(context).getString("token", null)

    /** Прочитать сохранённое без сети: для первого кадра приложения и для виджетов. */
    fun load(context: Context): AppState {
        val p = prefs(context)
        val s = AppState(
            loggedIn = p.getString("token", null) != null,
            summary = p.getString("summary", null)?.let { runCatching { Summary.parse(JSONObject(it)) }.getOrNull() },
            day = p.getString("day", null)?.let { runCatching { Day.parse(JSONObject(it)) }.getOrNull() },
            updatedAt = p.getLong("updatedAt", 0),
        )
        _state.value = s.copy(error = _state.value.error)
        return s
    }

    /** Название телефона для списка входов: «Google Pixel 8». */
    fun deviceName(): String {
        val m = Build.MODEL.orEmpty()
        val b = Build.MANUFACTURER.orEmpty().replaceFirstChar { it.uppercase() }
        return if (m.startsWith(b, ignoreCase = true)) m else "$b $m".trim()
    }

    suspend fun saveLogin(context: Context, token: String) {
        prefs(context).edit().putString("token", token).apply()
        load(context)
        SyncWorker.schedule(context)
        refresh(context)
    }

    /** Подтянуть сводку и дневник за сегодня и перерисовать виджеты. Возвращает false, если сети нет. */
    suspend fun refresh(context: Context): Boolean = lock.withLock {
        val token = token(context) ?: return@withLock false
        try {
            val (w, d) = coroutineScope {
                val w = async { Api.widget(token) }
                val d = async { Api.day(token) }
                w.await() to d.await()
            }
            prefs(context).edit()
                .putString("summary", w.toString())
                .putString("day", d.toString())
                .putLong("updatedAt", System.currentTimeMillis())
                .apply()
            _state.value = _state.value.copy(error = null)
            true
        } catch (e: UnauthorizedException) {
            clear(context)
            false
        } catch (e: Exception) {
            Log.w(TAG, "refresh failed", e)
            _state.value = _state.value.copy(error = "Нет связи с сервером")
            false
        } finally {
            load(context)
            updateFitterWidgets(context)
        }
    }

    /**
     * Стакан воды (+250 или −250 мл). Сразу показываем новое число в приложении и на виджете,
     * потом отправляем на сервер и сверяемся с ним.
     */
    suspend fun addWater(context: Context, delta: Int) {
        val token = token(context) ?: return
        val p = prefs(context)
        val raw = p.getString("summary", null)?.let { JSONObject(it) } ?: return
        val date = raw.getString("date")
        raw.put("water", (raw.optInt("water") + delta).coerceAtLeast(0))
        p.edit().putString("summary", raw.toString()).apply()
        load(context)
        updateFitterWidgets(context)
        try {
            Api.water(token, date, delta)
        } catch (e: UnauthorizedException) {
            clear(context)
            return
        } catch (e: Exception) {
            Log.w(TAG, "water failed", e)
        }
        refresh(context)
    }

    suspend fun logout(context: Context) {
        token(context)?.let { runCatching { Api.logout(it) } }
        clear(context)
    }

    private suspend fun clear(context: Context) {
        prefs(context).edit().clear().apply()
        SyncWorker.cancel(context)
        load(context)
        updateFitterWidgets(context)
    }
}
