package com.sailxx.fitter.ui

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.lifecycle.lifecycleScope
import com.sailxx.fitter.data.FitterRepository
import kotlinx.coroutines.launch

const val BOT_URL = "https://t.me/FitterFoodBot"

fun openUrl(context: Context, url: String) {
    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // Сверху всегда светлое (экран входа или зелёная шапка) — значки строки состояния тёмные
        enableEdgeToEdge(statusBarStyle = SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT))
        super.onCreate(savedInstanceState)
        FitterRepository.load(this)
        setContent {
            FitterTheme {
                val st by FitterRepository.state.collectAsState()
                Crossfade(st.loggedIn, animationSpec = tween(450), label = "screen") { logged ->
                    if (logged) TodayScreen(st) else LoginScreen()
                }
            }
        }
    }

    // Каждый раз при открытии подтягиваем свежие данные: еду могли записать в боте
    override fun onResume() {
        super.onResume()
        if (FitterRepository.token(this) != null) lifecycleScope.launch { FitterRepository.refresh(this@MainActivity) }
    }
}
