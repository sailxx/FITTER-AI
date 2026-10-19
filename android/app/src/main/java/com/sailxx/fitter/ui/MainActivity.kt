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
import android.os.Build
import androidx.compose.material3.Icon
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.BlurEffect
import androidx.compose.ui.graphics.TileMode
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.layer.GraphicsLayer
import androidx.compose.ui.graphics.layer.drawLayer
import androidx.compose.ui.graphics.rememberGraphicsLayer
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat
import com.sailxx.fitter.data.AppState
import com.sailxx.fitter.data.FitterRepository
import com.sailxx.fitter.data.LiveSync
import com.sailxx.fitter.data.ThemePref
import com.sailxx.fitter.data.WidgetPrefs
import com.sailxx.fitter.widget.SyncWorker
import com.sailxx.fitter.widget.updateFitterWidgets
import com.sailxx.fitter.R
import kotlinx.coroutines.launch

const val BOT_URL = "https://t.me/FitterFoodBot"

/** Что попросили при запуске: виджет «Фото еды» передаёт add=camera. */
object Launch {
    const val EXTRA_ADD = "add"
    val add = kotlinx.coroutines.flow.MutableStateFlow<String?>(null)
    fun read(intent: Intent?) {
        intent?.getStringExtra(EXTRA_ADD)?.let { add.value = it }
        intent?.removeExtra(EXTRA_ADD)
    }
}

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
        Launch.read(intent)
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

    // Виджет «Фото еды» открывает уже запущенное приложение — сразу показываем камеру
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        Launch.read(intent)
    }

    // Приложение на экране — держим живое соединение, свернули — закрываем
    override fun onStart() {
        super.onStart()
        started = true
        // Тема могла смениться вместе с системной — виджеты перекрашиваем под неё
        lifecycleScope.launch { updateFitterWidgets(this@MainActivity) }
        if (FitterRepository.token(this) != null) {
            LiveSync.start(this)
            SyncWorker.schedule(this) // виджеты обновляются в фоне раз в 15 минут
        }
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

private enum class Tab { Today, Tips, Workouts, Settings }

/** Главный экран: вкладки «Сегодня», «Советы», «Тренировки», «Настройки»; внизу стеклянная панель с камерой посередине. */
@Composable
private fun Home(st: AppState) {
    var tab by rememberSaveable { mutableStateOf(Tab.Today) }
    var adding by remember { mutableStateOf(false) }
    var camera by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf(false) } // открыт редактор тренировки — панель прячем
    val request by Launch.add.collectAsState()
    LaunchedEffect(request) {
        if (request != null) { tab = Tab.Today; camera = request == "camera"; adding = true; Launch.add.value = null }
    }
    StatusBarIcons()
    // Всё, что под панелью, пишем в слой — панель рисует его размытым у себя
    val backdrop = rememberGraphicsLayer()
    Box(Modifier.fillMaxSize()) {
        Box(Modifier.fillMaxSize().drawWithContent { backdrop.record { this@drawWithContent.drawContent() }; drawLayer(backdrop) }) {
            Crossfade(tab, animationSpec = tween(250), label = "tab") { t ->
                when (t) {
                    Tab.Today -> TodayScreen(st, onAdd = { adding = true }, onSettings = { tab = Tab.Settings })
                    Tab.Tips -> TipsScreen()
                    Tab.Workouts -> WorkoutsScreen(onEditing = { editing = it })
                    Tab.Settings -> SettingsScreen(st.summary, onBack = { tab = Tab.Today })
                }
            }
        }
        if (!(editing && tab == Tab.Workouts)) GlassBar(tab, backdrop, onTab = { tab = it }, onCamera = { camera = true; adding = true }, modifier = Modifier.align(Alignment.BottomCenter))
        if (adding) AddMealSheet(openCamera = camera, onClose = { adding = false; camera = false })
    }
}

/** Значки строки состояния: на тёмной теме светлые, на светлой тёмные. */
@Composable
private fun StatusBarIcons() {
    val dark = LocalTokens.current.dark
    val view = LocalView.current
    val window = (LocalContext.current as? android.app.Activity)?.window ?: return
    DisposableEffect(dark) {
        WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !dark
        onDispose { WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = true }
    }
}

private val BarHeight = 68.dp
private val CamSize = 58.dp

/**
 * Панель в стиле liquid glass: размытый контент под ней, полупрозрачная заливка,
 * светлый ободок и блик сверху. Размытие — с Android 12, раньше панель просто плотнее.
 */
@Composable
private fun GlassBar(tab: Tab, backdrop: GraphicsLayer, onTab: (Tab) -> Unit, onCamera: () -> Unit, modifier: Modifier) {
    val t = LocalTokens.current
    val shape = RoundedCornerShape(50)
    val blur = Build.VERSION.SDK_INT >= 31
    var pos by remember { mutableStateOf(Offset.Zero) }
    Box(
        modifier.navigationBarsPadding().padding(start = 16.dp, end = 16.dp, bottom = 10.dp).fillMaxWidth().height(BarHeight)
            .onGloballyPositioned { pos = it.positionInRoot() }
            .shadow(20.dp, shape, spotColor = Color(if (t.dark) 0x99000000 else 0x4410283C), ambientColor = Color(if (t.dark) 0x66000000 else 0x2210283C))
            .clip(shape),
    ) {
        // Размытая подложка: тот же кадр, сдвинутый под панель
        Box(
            Modifier.matchParentSize()
                .graphicsLayer { if (blur) renderEffect = BlurEffect(22.dp.toPx(), 22.dp.toPx(), TileMode.Clamp) }
                .drawBehind { drawRect(t.bg); translate(-pos.x, -pos.y) { drawLayer(backdrop) } },
        )
        val fill = when {
            !blur -> if (t.dark) listOf(Color(0xF52A2A31), Color(0xF71E1E23)) else listOf(Color(0xF7FFFFFF), Color(0xF2F4F7F5))
            t.dark -> listOf(Color(0xB32C2C33), Color(0xD1141418))
            else -> listOf(Color(0x9EFFFFFF), Color(0x52FFFFFF))
        }
        val rim = if (t.dark) listOf(Color(0x47FFFFFF), Color(0x0AFFFFFF), Color(0x00FFFFFF), Color(0x29FFFFFF))
            else listOf(Color(0xF2FFFFFF), Color(0x26FFFFFF), Color(0x00FFFFFF), Color(0xBFFFFFFF))
        Box(Modifier.matchParentSize().background(Brush.verticalGradient(fill)).border(1.2.dp, Brush.linearGradient(rim), shape))
        // Блик по верхнему краю
        Box(
            Modifier.padding(start = 26.dp, top = 3.dp).fillMaxWidth(0.5f).height(13.dp)
                .background(Brush.verticalGradient(listOf(Color.White.copy(alpha = if (t.dark) 0.1f else 0.6f), Color.Transparent)), RoundedCornerShape(7.dp)),
        )
        Row(
            Modifier.fillMaxSize().padding(horizontal = 9.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            GlassTab(R.drawable.ic_nav_home, "Сегодня", tab == Tab.Today) { onTab(Tab.Today) }
            GlassTab(R.drawable.ic_nav_tips, "Советы", tab == Tab.Tips) { onTab(Tab.Tips) }
            CameraButton(onCamera)
            GlassTab(R.drawable.ic_nav_dumbbell, "Тренировки", tab == Tab.Workouts) { onTab(Tab.Workouts) }
            GlassTab(R.drawable.ic_nav_gear, "Настройки", tab == Tab.Settings) { onTab(Tab.Settings) }
        }
    }
}

/** Вкладка: у активной — стеклянный пузырь под иконкой. */
@Composable
private fun GlassTab(@DrawableRes icon: Int, label: String, active: Boolean, onClick: () -> Unit) {
    val t = LocalTokens.current
    val scale by animateFloatAsState(if (active) 1f else 0.92f, spring(dampingRatio = 0.45f, stiffness = Spring.StiffnessMedium), label = "s")
    val bubble by animateFloatAsState(if (active) 1f else 0f, spring(dampingRatio = 0.6f, stiffness = Spring.StiffnessMediumLow), label = "b")
    val press = remember { MutableInteractionSource() }
    Box(
        Modifier.size(50.dp).clip(CircleShape).clickable(interactionSource = press, indication = null, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier.matchParentSize().graphicsLayer { alpha = bubble; scaleX = 0.7f + 0.3f * bubble; scaleY = 0.7f + 0.3f * bubble }
                .background(
                    Brush.verticalGradient(if (t.dark) listOf(Color(0x33FFFFFF), Color(0x14FFFFFF)) else listOf(Color(0xF2FFFFFF), Color(0x8CFFFFFF))),
                    CircleShape,
                )
                .border(1.dp, Color.White.copy(alpha = if (t.dark) 0.28f else 0.9f), CircleShape),
        )
        Icon(
            painterResource(icon), label, Modifier.size(24.dp).graphicsLayer { scaleX = scale; scaleY = scale },
            tint = if (active) t.text else t.text.copy(alpha = 0.55f),
        )
    }
}

/** Камера посередине — тоже стекло: тёмное на светлой теме, светлое на тёмной. Пружинит при нажатии. */
@Composable
private fun CameraButton(onClick: () -> Unit) {
    val t = LocalTokens.current
    val press = remember { MutableInteractionSource() }
    val pressed by press.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) 0.9f else 1f, spring(dampingRatio = 0.4f, stiffness = Spring.StiffnessMedium), label = "p")
    val body = if (t.dark) listOf(Color(0xF0484852), Color(0xF22A2A31)) else listOf(Color(0xD92A2D35), Color(0xF00A0B0E))
    Box(
        Modifier.size(CamSize)
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .shadow(10.dp, CircleShape, spotColor = Color(0x88000000), ambientColor = Color(0x44000000))
            .clip(CircleShape)
            .background(Brush.verticalGradient(body))
            .drawBehind {
                // Блик сверху
                drawCircle(
                    Brush.radialGradient(listOf(Color.White.copy(alpha = if (t.dark) 0.32f else 0.38f), Color.Transparent), center = Offset(size.width / 2, 0f), radius = size.width * 0.62f),
                    radius = size.width, center = center,
                )
            }
            .border(1.dp, Color.White.copy(alpha = if (t.dark) 0.2f else 0.22f), CircleShape)
            .clickable(interactionSource = press, indication = null, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(painterResource(R.drawable.ic_nav_camera), "Сфотографировать еду", Modifier.size(26.dp), tint = Color.White)
    }
}
