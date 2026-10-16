package com.sailxx.fitter.data

import com.sailxx.fitter.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/** Токен больше не действует: вышли на другом телефоне, удалили данные в боте и т. п. */
class UnauthorizedException : IOException("unauthorized")

/** Ответ сервера с кодом ошибки (кроме 401). */
class ApiException(val code: Int, val error: String, val answer: String = "") : IOException("$code $error")

/** Вход через бота: ссылка, которую нужно открыть в Telegram, и секрет для опроса. */
data class LinkStart(val code: String, val secret: String, val url: String, val ttlSec: Int)

sealed interface LinkPoll {
    data object Wait : LinkPoll
    data object Denied : LinkPoll
    data object Expired : LinkPoll
    data class Done(val token: String, val name: String) : LinkPoll
}

/**
 * Запросы к серверу бота. Без библиотек: HttpURLConnection и org.json из самого Android.
 * Описание API — в worker.js (функции linkApi и api).
 */
object Api {
    private const val TIMEOUT = 15_000

    private suspend fun call(path: String, method: String = "GET", body: JSONObject? = null, token: String? = null, timeout: Int = TIMEOUT): Pair<Int, JSONObject> =
        withContext(Dispatchers.IO) {
            val conn = URL(BuildConfig.API + path).openConnection() as HttpURLConnection
            try {
                conn.requestMethod = method
                conn.connectTimeout = TIMEOUT
                conn.readTimeout = timeout
                conn.setRequestProperty("Accept", "application/json")
                if (token != null) conn.setRequestProperty("Authorization", "Bearer $token")
                if (body != null) {
                    conn.doOutput = true
                    conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                    conn.outputStream.use { it.write(body.toString().toByteArray()) }
                }
                val code = conn.responseCode
                val stream = if (code < 400) conn.inputStream else conn.errorStream
                val text = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
                code to (runCatching { JSONObject(text) }.getOrNull() ?: JSONObject())
            } finally {
                conn.disconnect()
            }
        }

    private suspend fun authed(path: String, token: String, method: String = "GET", body: JSONObject? = null, timeout: Int = TIMEOUT): JSONObject {
        val (code, json) = call(path, method, body, token, timeout)
        if (code == 401) throw UnauthorizedException()
        if (code >= 400) throw ApiException(code, json.optString("error"), json.optString("answer"))
        return json
    }

    suspend fun linkStart(): LinkStart {
        val (code, j) = call("/api/link/start", "POST", JSONObject())
        if (code >= 400) throw ApiException(code, j.optString("error"))
        return LinkStart(j.getString("code"), j.getString("secret"), j.getString("url"), j.optInt("ttl", 600))
    }

    suspend fun linkPoll(link: LinkStart, device: String): LinkPoll {
        val body = JSONObject().put("code", link.code).put("secret", link.secret).put("device", device)
        val (code, j) = call("/api/link/poll", "POST", body)
        return when {
            code == 403 -> LinkPoll.Denied
            code == 410 -> LinkPoll.Expired
            code >= 400 -> throw ApiException(code, j.optString("error"))
            j.has("token") -> LinkPoll.Done(j.getString("token"), j.optString("name"))
            else -> LinkPoll.Wait
        }
    }

    suspend fun widget(token: String) = authed("/api/widget", token)
    suspend fun day(token: String) = authed("/api/day", token)

    suspend fun water(token: String, date: String, delta: Int) =
        authed("/api/water", token, "POST", JSONObject().put("date", date).put("delta", delta))

    suspend fun logout(token: String) = authed("/api/logout", token, "POST", JSONObject())

    /** Еда текстом: «2 яйца и тост». 422 not_food — нейросеть не нашла еду (answer — её ответ). */
    suspend fun mealText(token: String, date: String, text: String) =
        authed("/api/meal/add", token, "POST", JSONObject().put("date", date).put("text", text))

    /** Еда по фото: сжатый JPEG в base64 и необязательная подсказка. */
    suspend fun mealPhoto(token: String, date: String, image: String, caption: String) =
        authed("/api/meal/photo", token, "POST", JSONObject().put("date", date).put("image", image).put("caption", caption), timeout = 60_000)

    /** Отметка таблетки: s = "taken" — принята, "" — снять отметку. */
    suspend fun pillMark(token: String, date: String, id: String, time: String, s: String) =
        authed("/api/pill/mark", token, "POST", JSONObject().put("date", date).put("id", id).put("time", time).put("s", s))

    suspend fun mealDelete(token: String, date: String, mealId: String) =
        authed("/api/meal/delete", token, "POST", JSONObject().put("date", date).put("mealId", mealId))

    /** Советы ИИ, уже подобранные сегодня: без новых запросов к нейросети. */
    suspend fun tips(token: String) = authed("/api/tips", token)

    suspend fun advice(token: String, date: String) =
        authed("/api/advice", token, "POST", JSONObject().put("date", date), timeout = 60_000)

    suspend fun adviceRecipe(token: String, date: String, i: Int) =
        authed("/api/advice/recipe", token, "POST", JSONObject().put("date", date).put("i", i), timeout = 60_000)

    suspend fun adviceSimilar(token: String, date: String, i: Int) =
        authed("/api/advice/similar", token, "POST", JSONObject().put("date", date).put("i", i), timeout = 60_000)

    suspend fun adviceEat(token: String, date: String, i: Int) =
        authed("/api/advice/eat", token, "POST", JSONObject().put("date", date).put("i", i))

    suspend fun analysis(token: String, date: String) =
        authed("/api/analysis", token, "POST", JSONObject().put("date", date), timeout = 60_000)
}
