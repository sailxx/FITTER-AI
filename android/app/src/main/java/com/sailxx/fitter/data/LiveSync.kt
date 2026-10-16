package com.sailxx.fitter.data

import android.content.Context
import android.util.Log
import com.sailxx.fitter.BuildConfig
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Живая синхронизация, пока приложение открыто: WebSocket к /api/live.
 * Сервер присылает свежую сводку дня сразу после любой записи — в боте, дневнике или на другом телефоне.
 * При обрыве переподключаемся с нарастающей паузой (2 → 30 с).
 */
object LiveSync {
    private const val TAG = "FitterLive"
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val client = OkHttpClient.Builder()
        .pingInterval(25, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .build()

    @Volatile private var socket: WebSocket? = null
    @Volatile private var wanted = false
    private var retry: Job? = null
    private var backoff = 2_000L

    fun start(context: Context) {
        val app = context.applicationContext
        wanted = true
        if (socket != null) return
        val token = FitterRepository.token(app) ?: return
        val url = BuildConfig.API.replaceFirst("https://", "wss://") + "/api/live"
        val req = Request.Builder().url(url).header("Authorization", "Bearer $token").build()
        socket = client.newWebSocket(req, object : WebSocketListener() {
            override fun onOpen(ws: WebSocket, response: Response) {
                backoff = 2_000L
                // Пока были отключены, могли что-то записать — подтягиваем один раз
                scope.launch { FitterRepository.refresh(app) }
            }

            override fun onMessage(ws: WebSocket, text: String) {
                val j = runCatching { JSONObject(text) }.getOrNull() ?: return
                if (j.optString("type") != "sync") return
                val w = j.optJSONObject("widget") ?: return
                val d = j.optJSONObject("day") ?: return
                scope.launch { FitterRepository.applyLive(app, w, d) }
            }

            override fun onClosed(ws: WebSocket, code: Int, reason: String) = reconnect(app, ws)

            override fun onFailure(ws: WebSocket, t: Throwable, response: Response?) {
                Log.w(TAG, "live failed: ${response?.code}", t)
                // 401 — токен отозван: выходить решит обычное обновление
                if (response?.code == 401) scope.launch { FitterRepository.refresh(app) }
                reconnect(app, ws)
            }
        })
    }

    fun stop() {
        wanted = false
        retry?.cancel()
        socket?.close(1000, "bye")
        socket = null
    }

    private fun reconnect(context: Context, ws: WebSocket) {
        if (socket === ws) socket = null
        if (!wanted) return
        retry?.cancel()
        retry = scope.launch {
            delay(backoff)
            backoff = (backoff * 2).coerceAtMost(30_000L)
            if (wanted && socket == null) start(context)
        }
    }
}
