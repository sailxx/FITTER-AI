package com.sailxx.fitter.ui

import androidx.annotation.DrawableRes
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sailxx.fitter.R
import com.sailxx.fitter.data.Api
import com.sailxx.fitter.data.FitterRepository
import com.sailxx.fitter.data.LinkPoll
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.PI
import kotlin.math.sin

private val Ink = Color(0xFF13201A)
private val Sub = Color(0xFF5E6E66)
private val Ease = CubicBezierEasing(0.2f, 0.8f, 0.2f, 1f)

private enum class Step { Hello, Waiting, Done }

/** Первый экран: приветствие и яркая кнопка «Войти через Telegram». Всегда светлый и живой. */
@Composable
fun LoginScreen() {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var step by remember { mutableStateOf(Step.Hello) }
    var linkUrl by remember { mutableStateOf<String?>(null) }
    var message by remember { mutableStateOf<String?>(null) }
    var job by remember { mutableStateOf<Job?>(null) }

    fun start() = scope.launch {
        step = Step.Waiting
        message = null
        try {
            val link = Api.linkStart()
            linkUrl = link.url
            openUrl(context, link.url)
            val until = System.currentTimeMillis() + link.ttlSec * 1000L
            while (System.currentTimeMillis() < until) {
                delay(2500)
                when (val r = runCatching { Api.linkPoll(link, FitterRepository.deviceName()) }.getOrNull()) {
                    is LinkPoll.Done -> {
                        step = Step.Done
                        delay(1100) // даём порадоваться конфетти
                        FitterRepository.saveLogin(context, r.token)
                        return@launch
                    }
                    LinkPoll.Denied -> { message = "Вход отменён в боте. Попробуем ещё раз?"; break }
                    LinkPoll.Expired -> break
                    else -> Unit // ждём или нет сети — пробуем ещё
                }
            }
            if (message == null) message = "Время на вход вышло. Нажми кнопку ещё раз"
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            message = "Нет связи с сервером. Проверь интернет"
        }
        step = Step.Hello
    }

    Box(
        Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color(0xFFE9FFF2), Color(0xFFF7FFFA), Color.White))),
    ) {
        Blobs()
        FloatingFood()
        Column(
            Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().padding(horizontal = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.weight(1f))
            Logo()
            Spacer(Modifier.height(28.dp))
            AnimatedContent(
                targetState = step,
                transitionSpec = { (fadeIn(tween(300)) + scaleIn(initialScale = 0.92f)) togetherWith fadeOut(tween(200)) },
                label = "step",
            ) { s ->
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                    when (s) {
                        Step.Hello -> Hello(message, onLogin = { job = start() }, onBot = { openUrl(context, BOT_URL) })
                        Step.Waiting -> Waiting(onReopen = { linkUrl?.let { openUrl(context, it) } }, onCancel = { job?.cancel(); step = Step.Hello })
                        Step.Done -> DoneView()
                    }
                }
            }
            Spacer(Modifier.weight(1.2f))
        }
    }
}

// ───────────────────────────── Части экрана ─────────────────────────────

@Composable
private fun Hello(message: String?, onLogin: () -> Unit, onBot: () -> Unit) {
    val wave = rememberInfiniteTransition(label = "wave")
    val angle by wave.animateFloat(
        initialValue = 0f, targetValue = 0f,
        animationSpec = infiniteRepeatable(
            keyframes {
                durationMillis = 2400
                0f at 0; 18f at 150; -12f at 300; 16f at 450; -8f at 600; 0f at 750
            },
        ),
        label = "angle",
    )
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.rise(0)) {
        Text("Привет!", fontSize = 38.sp, fontWeight = FontWeight.ExtraBold, color = Ink, letterSpacing = (-0.5).sp)
        Spacer(Modifier.width(10.dp))
        Image(
            painterResource(R.drawable.ic_hello), null,
            Modifier.size(44.dp).graphicsLayer { rotationZ = angle; transformOrigin = androidx.compose.ui.graphics.TransformOrigin(0.7f, 0.9f) },
        )
    }
    Spacer(Modifier.height(10.dp))
    Text(
        "Я FITTER — считаю калории по фото.\nВойди через Telegram, и дневник всегда будет под рукой.",
        fontSize = 16.sp, lineHeight = 22.sp, color = Sub, textAlign = TextAlign.Center,
        modifier = Modifier.rise(120),
    )
    Spacer(Modifier.height(20.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.rise(220)) {
        Feature(R.drawable.ic_camera, "Фото → ккал")
        Feature(R.drawable.ic_water, "Вода")
        Feature(R.drawable.ic_sparkles, "Виджеты")
    }
    Spacer(Modifier.height(32.dp))
    TelegramButton(onLogin, Modifier.rise(340))
    message?.let {
        Spacer(Modifier.height(14.dp))
        Text(it, color = Palette.OverDark, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center)
    }
    Spacer(Modifier.height(18.dp))
    Text(
        "Ещё нет анкеты? Открой бота — это минута",
        fontSize = 14.sp, color = Palette.G3, fontWeight = FontWeight.SemiBold,
        modifier = Modifier.rise(440).clip(RoundedCornerShape(10.dp)).clickable(onClick = onBot).padding(horizontal = 10.dp, vertical = 8.dp),
    )
}

@Composable
private fun Feature(@DrawableRes icon: Int, text: String) {
    Row(
        Modifier.shadow(6.dp, RoundedCornerShape(99.dp), spotColor = Color(0x3316B86A), ambientColor = Color(0x2216B86A))
            .background(Color.White, RoundedCornerShape(99.dp)).padding(start = 8.dp, end = 12.dp, top = 6.dp, bottom = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Image(painterResource(icon), null, Modifier.size(20.dp))
        Spacer(Modifier.width(6.dp))
        Text(text, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Ink)
    }
}

/** Большая яркая зелёная кнопка с самолётиком Telegram и бегущим бликом. */
@Composable
private fun TelegramButton(onClick: () -> Unit, modifier: Modifier = Modifier) {
    val press = remember { MutableInteractionSource() }
    val pressed by press.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) 0.95f else 1f, spring(dampingRatio = 0.45f, stiffness = Spring.StiffnessMediumLow), label = "press")
    val shine = rememberInfiniteTransition(label = "shine")
    val x by shine.animateFloat(
        -0.6f, 1.6f,
        infiniteRepeatable(keyframes { durationMillis = 3200; -0.6f at 0; -0.6f at 1400; 1.6f at 2400 with FastOutSlowInEasing }),
        label = "x",
    )
    val shape = RoundedCornerShape(20.dp)
    Box(
        modifier.fillMaxWidth().height(60.dp)
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .shadow(18.dp, shape, spotColor = Color(0xAA12E97C), ambientColor = Color(0x5512E97C))
            .clip(shape)
            .background(Brush.linearGradient(listOf(Color(0xFF3DF59A), Palette.G2), start = Offset.Zero, end = Offset(900f, 300f)))
            .drawWithContent {
                drawContent()
                // Блик: косая белая полоса пробегает по кнопке
                val w = size.width
                val cx = w * x
                drawRect(
                    Brush.linearGradient(
                        listOf(Color.Transparent, Color(0x66FFFFFF), Color.Transparent),
                        start = Offset(cx - 90f, 0f), end = Offset(cx + 90f, size.height),
                    ),
                )
            }
            .clickable(interactionSource = press, indication = null, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            PaperPlane(Modifier.size(24.dp))
            Spacer(Modifier.width(10.dp))
            Text("Войти через Telegram", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.ExtraBold)
        }
    }
}

@Composable
private fun PaperPlane(modifier: Modifier) {
    Canvas(modifier) {
        val s = size.width / 24f
        val p = Path().apply {
            moveTo(2.5f * s, 11.2f * s)
            lineTo(20.6f * s, 4.2f * s)
            cubicTo(21.4f * s, 3.9f * s, 22.1f * s, 4.6f * s, 21.9f * s, 5.4f * s)
            lineTo(18.9f * s, 19.5f * s)
            cubicTo(18.7f * s, 20.4f * s, 17.7f * s, 20.8f * s, 17f * s, 20.2f * s)
            lineTo(12.6f * s, 16.9f * s)
            lineTo(10.3f * s, 19.1f * s)
            cubicTo(10f * s, 19.4f * s, 9.5f * s, 19.2f * s, 9.5f * s, 18.8f * s)
            lineTo(9.6f * s, 15.2f * s)
            lineTo(17.3f * s, 8.1f * s)
            lineTo(7.9f * s, 13.9f * s)
            lineTo(2.6f * s, 12.4f * s)
            cubicTo(1.9f * s, 12.2f * s, 1.9f * s, 11.4f * s, 2.5f * s, 11.2f * s)
            close()
        }
        drawPath(p, Color.White)
    }
}

/** Логотип: появляется с пружинкой, дышит, от него расходятся мягкие волны. */
@Composable
private fun Logo() {
    val enter = remember { Animatable(0.4f) }
    LaunchedEffect(Unit) { enter.animateTo(1f, spring(dampingRatio = 0.42f, stiffness = Spring.StiffnessLow)) }
    val t = rememberInfiniteTransition(label = "logo")
    val breathe by t.animateFloat(1f, 1.045f, infiniteRepeatable(tween(1600, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "b")
    val pulse by t.animateFloat(0f, 1f, infiniteRepeatable(tween(2200, easing = LinearEasing)), label = "p")
    Box(Modifier.size(180.dp), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            for (k in 0..1) {
                val ph = (pulse + k * 0.5f) % 1f
                drawCircle(Palette.G1.copy(alpha = 0.28f * (1f - ph)), radius = size.minDimension * (0.3f + 0.2f * ph))
            }
        }
        Image(
            painterResource(R.drawable.ic_logo), "FITTER",
            Modifier.size(120.dp)
                .graphicsLayer { val s = enter.value * breathe; scaleX = s; scaleY = s; alpha = enter.value.coerceIn(0f, 1f) },
        )
    }
}

@Composable
private fun Waiting(onReopen: () -> Unit, onCancel: () -> Unit) {
    val t = rememberInfiniteTransition(label = "dots")
    val ph by t.animateFloat(0f, 1f, infiniteRepeatable(tween(1100, easing = LinearEasing)), label = "ph")
    Column(
        Modifier.fillMaxWidth()
            .shadow(16.dp, RoundedCornerShape(24.dp), spotColor = Color(0x3316B86A), ambientColor = Color(0x2216B86A))
            .background(Color.White, RoundedCornerShape(24.dp)).padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.height(28.dp), verticalAlignment = Alignment.CenterVertically) {
            repeat(3) { i ->
                val y = sin(((ph - i * 0.18f) * 2 * PI).toFloat()).coerceAtLeast(0f)
                Box(Modifier.offset(y = (-10 * y).dp).size(12.dp).background(Palette.G2, CircleShape))
            }
        }
        Spacer(Modifier.height(14.dp))
        Text("Подтверди вход в Telegram", fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, color = Ink, textAlign = TextAlign.Center)
        Spacer(Modifier.height(6.dp))
        Text("Нажми «✅ Да, это я» в чате с ботом — и сразу возвращайся сюда.", fontSize = 15.sp, color = Sub, textAlign = TextAlign.Center)
        Spacer(Modifier.height(18.dp))
        Text(
            "Открыть Telegram ещё раз", color = Palette.G3, fontWeight = FontWeight.Bold,
            modifier = Modifier.clip(RoundedCornerShape(10.dp)).clickable(onClick = onReopen).padding(10.dp),
        )
        Text(
            "Отмена", color = Sub, fontSize = 14.sp,
            modifier = Modifier.clip(RoundedCornerShape(10.dp)).clickable(onClick = onCancel).padding(8.dp),
        )
    }
}

@Composable
private fun DoneView() {
    val pop = remember { Animatable(0.3f) }
    LaunchedEffect(Unit) { pop.animateTo(1f, spring(dampingRatio = 0.35f, stiffness = Spring.StiffnessMediumLow)) }
    Box(contentAlignment = Alignment.Center) {
        Confetti()
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Image(painterResource(R.drawable.ic_party), null, Modifier.size(72.dp).graphicsLayer { scaleX = pop.value; scaleY = pop.value })
            Spacer(Modifier.height(12.dp))
            Text("Готово!", fontSize = 34.sp, fontWeight = FontWeight.ExtraBold, color = Ink)
            Text("Открываю твой дневник…", fontSize = 16.sp, color = Sub)
        }
    }
}

/** Конфетти из иконок FITTER разлетаются от центра. */
@Composable
private fun Confetti() {
    val icons = listOf(R.drawable.ic_star, R.drawable.ic_heart, R.drawable.ic_sparkles, R.drawable.ic_broccoli, R.drawable.ic_water, R.drawable.ic_kcal)
    val p = remember { Animatable(0f) }
    LaunchedEffect(Unit) { p.animateTo(1f, tween(1100, easing = Ease)) }
    Box(Modifier.size(300.dp), contentAlignment = Alignment.Center) {
        repeat(14) { i ->
            val a = i / 14f * 2 * PI + i * 0.37
            val dist = 110 + (i % 3) * 22
            val v = p.value
            Image(
                painterResource(icons[i % icons.size]), null,
                Modifier.size((18 + (i % 3) * 6).dp).graphicsLayer {
                    translationX = (kotlin.math.cos(a) * dist * v).toFloat() * density
                    translationY = ((sin(a) * dist * v) + 90 * v * v).toFloat() * density
                    rotationZ = 240f * v * (if (i % 2 == 0) 1 else -1)
                    alpha = (1.4f - v).coerceIn(0f, 1f)
                },
            )
        }
    }
}

// ───────────────────────────── Живой фон ─────────────────────────────

/** Мягкие зелёные пятна медленно плавают на фоне. */
@Composable
private fun Blobs() {
    val t = rememberInfiniteTransition(label = "blobs")
    val a by t.animateFloat(0f, (2 * PI).toFloat(), infiniteRepeatable(tween(14000, easing = LinearEasing)), label = "a")
    Canvas(Modifier.fillMaxSize()) {
        fun blob(cx: Float, cy: Float, r: Float, c: Color) =
            drawCircle(Brush.radialGradient(listOf(c, c.copy(alpha = 0f)), center = Offset(cx, cy), radius = r), r, Offset(cx, cy))
        val w = size.width
        val h = size.height
        blob(w * (0.85f + 0.06f * sin(a)), h * (0.1f + 0.03f * kotlin.math.cos(a)), w * 0.7f, Color(0x5562FFB0))
        blob(w * (0.1f + 0.05f * kotlin.math.cos(a * 1.3f)), h * (0.42f + 0.04f * sin(a)), w * 0.6f, Color(0x3830D158))
        blob(w * (0.7f + 0.05f * sin(a * 0.8f)), h * (0.92f + 0.02f * sin(a)), w * 0.75f, Color(0x405AB8FF))
    }
}

private data class Floater(@DrawableRes val icon: Int, val x: Float, val y: Float, val size: Dp, val phase: Float, val delay: Int)

/** Иконки еды парят по краям экрана: покачиваются и поворачиваются. */
@Composable
private fun FloatingFood() {
    val items = remember {
        listOf(
            Floater(R.drawable.ic_salad, 0.07f, 0.07f, 50.dp, 0f, 200),
            Floater(R.drawable.ic_kcal, 0.80f, 0.11f, 42.dp, 1.3f, 350),
            Floater(R.drawable.ic_broccoli, 0.84f, 0.33f, 38.dp, 2.1f, 500),
            Floater(R.drawable.ic_water, 0.03f, 0.36f, 36.dp, 0.7f, 650),
            Floater(R.drawable.ic_protein, 0.06f, 0.83f, 40.dp, 2.8f, 800),
            Floater(R.drawable.ic_heart, 0.82f, 0.86f, 36.dp, 1.9f, 950),
            Floater(R.drawable.ic_carbs, 0.50f, 0.035f, 30.dp, 3.4f, 1100),
            Floater(R.drawable.ic_star, 0.46f, 0.93f, 28.dp, 4.2f, 1250),
        )
    }
    val t = rememberInfiniteTransition(label = "food")
    val a by t.animateFloat(0f, (2 * PI).toFloat(), infiniteRepeatable(tween(5200, easing = LinearEasing)), label = "a")
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val w = maxWidth
        val h = maxHeight
        val dens = LocalDensity.current
        items.forEach { f ->
            val appear = remember { Animatable(0f) }
            LaunchedEffect(Unit) { delay(f.delay.toLong()); appear.animateTo(1f, spring(dampingRatio = 0.5f, stiffness = Spring.StiffnessLow)) }
            Image(
                painterResource(f.icon), null,
                Modifier.offset(w * f.x, h * f.y).size(f.size).graphicsLayer {
                    translationY = with(dens) { (sin(a + f.phase) * 10).dp.toPx() }
                    rotationZ = sin(a * 0.8f + f.phase) * 10f
                    scaleX = appear.value; scaleY = appear.value
                    alpha = 0.95f * appear.value.coerceIn(0f, 1f)
                },
            )
        }
    }
}

/** Появление снизу с задержкой — как .rise в дневнике. */
@Composable
fun Modifier.rise(delayMs: Int): Modifier {
    if (androidx.compose.ui.platform.LocalInspectionMode.current) return this // превью и снимки экрана — сразу на месте
    val p = remember { Animatable(0f) }
    LaunchedEffect(Unit) { delay(delayMs.toLong()); p.animateTo(1f, tween(520, easing = Ease)) }
    return this.graphicsLayer { alpha = p.value; translationY = (1f - p.value) * 16.dp.toPx() }
}
