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
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
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
import com.sailxx.fitter.data.ThemePref
import com.sailxx.fitter.data.WidgetPrefs
import com.sailxx.fitter.widget.updateFitterWidgets
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
        ThemePref.load(this)
        WidgetPrefs.load(this)
        setContent {
            val mode by ThemePref.mode.collectAsState()
            FitterTheme(mode) {
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
        // Тема могла смениться вместе с системной — виджеты перекрашиваем под неё
        lifecycleScope.launch { updateFitterWidgets(this@MainActivity) }
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

private enum class Tab { Today, Tips, Settings }

/** Главный экран: вкладки «Сегодня», «Советы», «Настройки»; внизу панель с вырезом и зелёной кнопкой «+». */
@Composable
private fun Home(st: AppState) {
    var tab by rememberSaveable { mutableStateOf(Tab.Today) }
    var adding by remember { mutableStateOf(false) }
    Box(Modifier.fillMaxSize()) {
        Crossfade(tab, animationSpec = tween(250), label = "tab") { t ->
            when (t) {
                Tab.Today -> TodayScreen(st, onAdd = { adding = true }, onSettings = { tab = Tab.Settings })
                Tab.Tips -> TipsScreen()
                Tab.Settings -> SettingsScreen(st.summary, onBack = { tab = Tab.Today })
            }
        }
        BottomBar(tab, onTab = { tab = it }, onAdd = { adding = true }, modifier = Modifier.align(Alignment.BottomCenter))
        if (adding) AddMealSheet(onClose = { adding = false })
    }
}

private val BarHeight = 68.dp
private val PlusSize = 62.dp
private val NotchGap = 6.dp
private val NotchDrop = 4.dp // центр кнопки и выреза чуть ниже верхнего края панели

/** Форма панели: скруглённые верхние углы и полукруглый вырез посередине под кнопку «+». */
private class NotchShape(private val d: Density) : Shape {
    override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density): Outline = with(d) {
        val corner = 20.dp.toPx()
        val r = (PlusSize / 2 + NotchGap).toPx()
        val cy = NotchDrop.toPx()
        val shoulder = 10.dp.toPx()
        val cx = size.width / 2
        val p = Path().apply {
            moveTo(0f, corner)
            quadraticTo(0f, 0f, corner, 0f)
            lineTo(cx - r - shoulder, 0f)
            // Мягкое «плечо» перед вырезом, чтобы край не был острым
            quadraticTo(cx - r, 0f, cx - r, cy)
            arcTo(Rect(cx - r, cy - r, cx + r, cy + r), 180f, -180f, false)
            quadraticTo(cx + r, 0f, cx + r + shoulder, 0f)
            lineTo(size.width - corner, 0f)
            quadraticTo(size.width, 0f, size.width, corner)
            lineTo(size.width, size.height)
            lineTo(0f, size.height)
            close()
        }
        Outline.Generic(p)
    }
}

@Composable
private fun BottomBar(tab: Tab, onTab: (Tab) -> Unit, onAdd: () -> Unit, modifier: Modifier) {
    val t = LocalTokens.current
    val density = LocalDensity.current
    val shape = remember(density) { NotchShape(density) }
    Box(modifier.fillMaxWidth()) {
        Row(
            Modifier.padding(top = PlusSize / 2 - NotchDrop).fillMaxWidth()
                .shadow(16.dp, shape, spotColor = Color(0x3310283C), ambientColor = Color(0x2210283C))
                .background(t.card, shape)
                .navigationBarsPadding().height(BarHeight).padding(horizontal = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TabItem(R.drawable.ic_plate, "Сегодня", tab == Tab.Today, Modifier.weight(1f)) { onTab(Tab.Today) }
            TabItem(R.drawable.ic_sparkles, "Советы", tab == Tab.Tips, Modifier.weight(1f)) { onTab(Tab.Tips) }
            Spacer(Modifier.width(PlusSize + NotchGap * 4))
            TabItem(R.drawable.ic_gear, "Настройки", tab == Tab.Settings, Modifier.weight(2f)) { onTab(Tab.Settings) }
        }
        AddButton(onAdd, Modifier.align(Alignment.TopCenter))
    }
}

@Composable
private fun TabItem(@DrawableRes icon: Int, label: String, active: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val t = LocalTokens.current
    val scale by animateFloatAsState(if (active) 1.1f else 0.92f, spring(dampingRatio = 0.45f, stiffness = Spring.StiffnessMedium), label = "s")
    val dot by animateFloatAsState(if (active) 1f else 0f, spring(dampingRatio = 0.5f, stiffness = Spring.StiffnessMediumLow), label = "d")
    val press = remember { MutableInteractionSource() }
    Column(
        modifier.fillMaxHeight().clickable(interactionSource = press, indication = null, onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Image(painterResource(icon), null, Modifier.size(26.dp).graphicsLayer { scaleX = scale; scaleY = scale }.alpha(if (active) 1f else 0.55f))
        Text(label, fontSize = 11.sp, fontWeight = if (active) FontWeight.ExtraBold else FontWeight.SemiBold, color = if (active) t.text else t.hint)
        Box(Modifier.padding(top = 3.dp).size(5.dp).graphicsLayer { scaleX = dot; scaleY = dot }.background(Palette.G2, CircleShape))
    }
}

/** Зелёная «+», приподнятая над панелью и сидящая в вырезе. Пружинит при нажатии. */
@Composable
private fun AddButton(onClick: () -> Unit, modifier: Modifier) {
    val press = remember { MutableInteractionSource() }
    val pressed by press.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) 0.9f else 1f, spring(dampingRatio = 0.4f, stiffness = Spring.StiffnessMedium), label = "p")
    Box(
        modifier.size(PlusSize)
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .shadow(14.dp, CircleShape, spotColor = Color(0xAA12E97C), ambientColor = Color(0x5512E97C))
            .clip(CircleShape)
            .background(Brush.linearGradient(listOf(Color(0xFF3DF59A), Palette.G2)))
            .clickable(interactionSource = press, indication = null, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { Text("+", color = Color.White, fontSize = 34.sp, fontWeight = FontWeight.Medium, modifier = Modifier.padding(bottom = 3.dp)) }
}
