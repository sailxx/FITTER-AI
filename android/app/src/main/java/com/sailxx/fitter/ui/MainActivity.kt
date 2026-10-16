package com.sailxx.fitter.ui

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.annotation.DrawableRes
import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.lifecycleScope
import com.sailxx.fitter.data.AppState
import com.sailxx.fitter.data.FitterRepository
import com.sailxx.fitter.data.LiveSync
import com.sailxx.fitter.R
import kotlinx.coroutines.launch

const val BOT_URL = "https://t.me/FitterFoodBot"

fun openUrl(context: Context, url: String) {
    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
}

class MainActivity : ComponentActivity() {
    private var started = false

    override fun onCreate(savedInstanceState: Bundle?) {
        // Сверху всегда светлое (экран входа или зелёная шапка) — значки строки состояния тёмные
        enableEdgeToEdge(statusBarStyle = SystemBarStyle.light(android.graphics.Color.TRANSPARENT, android.graphics.Color.TRANSPARENT))
        super.onCreate(savedInstanceState)
        FitterRepository.load(this)
        setContent {
            FitterTheme {
                val st by FitterRepository.state.collectAsState()
                // Вошли, пока экран открыт, — сразу включаем живую синхронизацию
                LaunchedEffect(st.loggedIn) { if (st.loggedIn && started) LiveSync.start(this@MainActivity) }
                Crossfade(st.loggedIn, animationSpec = tween(450), label = "screen") { logged ->
                    if (logged) Home(st) else LoginScreen()
                }
            }
        }
    }

    // Приложение на экране — держим живое соединение, свернули — закрываем
    override fun onStart() {
        super.onStart()
        started = true
        if (FitterRepository.token(this) != null) LiveSync.start(this)
    }

    override fun onStop() {
        started = false
        LiveSync.stop()
        super.onStop()
    }

    // Каждый раз при открытии подтягиваем свежие данные: пока приложение было свёрнуто, могли что-то записать
    override fun onResume() {
        super.onResume()
        if (FitterRepository.token(this) != null) lifecycleScope.launch { FitterRepository.refresh(this@MainActivity) }
    }
}

private enum class Tab { Today, Tips }

/** Главный экран: «Сегодня» и «Советы ИИ», внизу — плавающая панель с зелёной кнопкой «+». */
@Composable
private fun Home(st: AppState) {
    var tab by rememberSaveable { mutableStateOf(Tab.Today) }
    var adding by remember { mutableStateOf(false) }
    Box(Modifier.fillMaxSize()) {
        Crossfade(tab, animationSpec = tween(250), label = "tab") { t ->
            when (t) {
                Tab.Today -> TodayScreen(st, onAdd = { adding = true })
                Tab.Tips -> TipsScreen()
            }
        }
        BottomBar(tab, onTab = { tab = it }, onAdd = { adding = true }, modifier = Modifier.align(Alignment.BottomCenter))
        if (adding) AddMealSheet(onClose = { adding = false })
    }
}

@Composable
private fun BottomBar(tab: Tab, onTab: (Tab) -> Unit, onAdd: () -> Unit, modifier: Modifier) {
    val t = LocalTokens.current
    val shape = RoundedCornerShape(28.dp)
    Row(
        modifier.navigationBarsPadding().padding(bottom = 12.dp)
            .shadow(18.dp, shape, spotColor = Color(0x4410283C), ambientColor = Color(0x2210283C))
            .background(t.card, shape).border(1.dp, t.edge, shape)
            .padding(horizontal = 10.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        TabItem(R.drawable.ic_plate, "Сегодня", tab == Tab.Today) { onTab(Tab.Today) }
        AddButton(onAdd)
        TabItem(R.drawable.ic_sparkles, "Советы", tab == Tab.Tips) { onTab(Tab.Tips) }
    }
}

@Composable
private fun TabItem(@DrawableRes icon: Int, label: String, active: Boolean, onClick: () -> Unit) {
    val t = LocalTokens.current
    val scale by animateFloatAsState(if (active) 1f else 0.9f, spring(dampingRatio = 0.5f, stiffness = Spring.StiffnessMedium), label = "s")
    Column(
        Modifier.width(84.dp).clip(RoundedCornerShape(18.dp))
            .background(if (active) Palette.G2.copy(alpha = 0.12f) else Color.Transparent)
            .clickable(onClick = onClick).padding(vertical = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Image(painterResource(icon), null, Modifier.size(26.dp).graphicsLayer { scaleX = scale; scaleY = scale }.alpha(if (active) 1f else 0.55f))
        Text(label, fontSize = 11.sp, fontWeight = if (active) FontWeight.ExtraBold else FontWeight.SemiBold, color = if (active) t.text else t.hint)
    }
}

@Composable
private fun AddButton(onClick: () -> Unit) {
    val press = remember { MutableInteractionSource() }
    Box(
        Modifier.size(58.dp)
            .shadow(12.dp, CircleShape, spotColor = Color(0xAA12E97C), ambientColor = Color(0x5512E97C))
            .clip(CircleShape)
            .background(Brush.linearGradient(listOf(Color(0xFF3DF59A), Palette.G2)))
            .clickable(interactionSource = press, indication = null, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { Text("+", color = Color.White, fontSize = 32.sp, fontWeight = FontWeight.Medium, modifier = Modifier.padding(bottom = 3.dp)) }
}
