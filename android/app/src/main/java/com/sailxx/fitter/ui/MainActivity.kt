package com.sailxx.fitter.ui

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.text.format.DateUtils
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.lifecycleScope
import com.sailxx.fitter.R
import com.sailxx.fitter.data.Api
import com.sailxx.fitter.data.AppState
import com.sailxx.fitter.data.Day
import com.sailxx.fitter.data.FitterRepository
import com.sailxx.fitter.data.LinkPoll
import com.sailxx.fitter.data.Summary
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private const val BOT_URL = "https://t.me/FitterFoodBot"

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        FitterRepository.load(this)
        setContent {
            FitterTheme {
                val st by FitterRepository.state.collectAsState()
                Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    if (st.loggedIn) TodayScreen(st) else LoginScreen()
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

private fun openUrl(context: android.content.Context, url: String) {
    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
}

// ───────────────────────────── Вход через бота ─────────────────────────────

@Composable
private fun LoginScreen() {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var waiting by remember { mutableStateOf(false) }
    var linkUrl by remember { mutableStateOf<String?>(null) }
    var message by remember { mutableStateOf<String?>(null) }

    fun start() = scope.launch {
        waiting = true
        message = null
        try {
            val link = Api.linkStart()
            linkUrl = link.url
            openUrl(context, link.url)
            val until = System.currentTimeMillis() + link.ttlSec * 1000L
            while (System.currentTimeMillis() < until) {
                delay(2500)
                when (val r = runCatching { Api.linkPoll(link, FitterRepository.deviceName()) }.getOrNull()) {
                    is LinkPoll.Done -> { FitterRepository.saveLogin(context, r.token); return@launch }
                    LinkPoll.Denied -> { message = "Вход отменён в боте"; break }
                    LinkPoll.Expired -> break
                    else -> Unit // ждём или нет сети — пробуем ещё
                }
            }
            if (message == null) message = "Время на вход вышло. Попробуйте ещё раз"
        } catch (e: Exception) {
            message = "Нет связи с сервером. Проверьте интернет"
        } finally {
            waiting = false
        }
    }

    Column(
        Modifier.fillMaxSize().padding(horizontal = 32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Image(painterResource(R.drawable.ic_logo), contentDescription = null, modifier = Modifier.size(96.dp))
        Spacer(Modifier.height(20.dp))
        Text("FITTER", fontSize = 32.sp, fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.onBackground)
        Spacer(Modifier.height(8.dp))
        Text(
            "Калории по фото — в Telegram.\nИтоги дня — здесь и на виджетах.",
            textAlign = TextAlign.Center,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(36.dp))
        if (waiting) {
            CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.height(16.dp))
            Text("Подтвердите вход кнопкой в боте", color = MaterialTheme.colorScheme.onBackground)
            linkUrl?.let { url -> TextButton(onClick = { openUrl(context, url) }) { Text("Открыть Telegram ещё раз") } }
        } else {
            Button(
                onClick = { start() },
                modifier = Modifier.fillMaxWidth().height(52.dp),
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary),
            ) { Text("Войти через Telegram", fontSize = 16.sp, fontWeight = FontWeight.Bold) }
            message?.let {
                Spacer(Modifier.height(12.dp))
                Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
            }
            Spacer(Modifier.height(16.dp))
            Text(
                "Нет аккаунта? Откройте @FitterFoodBot и заполните анкету — это минута.",
                fontSize = 13.sp,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            TextButton(onClick = { openUrl(context, BOT_URL) }) { Text("Открыть бота") }
        }
    }
}

// ───────────────────────────── Сегодня ─────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TodayScreen(st: AppState) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var refreshing by remember { mutableStateOf(false) }
    var menu by remember { mutableStateOf(false) }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = { Text(st.summary?.name?.takeIf { it.isNotBlank() }?.let { "Сегодня, $it" } ?: "Сегодня", fontWeight = FontWeight.Bold) },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
                actions = {
                    Box {
                        TextButton(onClick = { menu = true }) { Text("•••", fontSize = 18.sp) }
                        DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                            DropdownMenuItem(text = { Text("Открыть бота") }, onClick = { menu = false; openUrl(context, BOT_URL) })
                            DropdownMenuItem(text = { Text("Выйти") }, onClick = { menu = false; scope.launch { FitterRepository.logout(context) } })
                        }
                    }
                },
            )
        },
    ) { pad ->
        PullToRefreshBox(
            isRefreshing = refreshing,
            onRefresh = { scope.launch { refreshing = true; FitterRepository.refresh(context); refreshing = false } },
            modifier = Modifier.fillMaxSize().padding(pad),
        ) {
            val s = st.summary
            LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                if (s == null) {
                    item {
                        Box(Modifier.fillMaxWidth().padding(top = 80.dp), contentAlignment = Alignment.Center) {
                            if (st.error != null) Text(st.error, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            else CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
                        }
                    }
                    return@LazyColumn
                }
                item { CaloriesCard(s) }
                item { WaterCard(s) { delta -> scope.launch { FitterRepository.addWater(context, delta) } } }
                st.day?.takeIf { it.pills.isNotEmpty() }?.let { day -> item { PillsCard(day) } }
                item { MealsHeader { openUrl(context, BOT_URL) } }
                val meals = st.day?.meals.orEmpty()
                if (meals.isEmpty()) {
                    item {
                        Text(
                            "Пока пусто. Отправьте боту фото еды — она появится здесь и на виджетах.",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(horizontal = 4.dp),
                        )
                    }
                } else {
                    items(meals, key = { it.id }) { m ->
                        Panel {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) {
                                    Text(m.title, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface)
                                    Text("${m.time} · Б ${m.p} · Ж ${m.f} · У ${m.c}", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                Text("${m.kcal} ккал", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                            }
                        }
                    }
                }
                item {
                    val ago = if (st.updatedAt > 0) DateUtils.getRelativeTimeSpanString(st.updatedAt).toString() else ""
                    Text(
                        listOfNotNull(st.error, ago.takeIf { it.isNotEmpty() }?.let { "Обновлено $it" }).joinToString(" · "),
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.fillMaxWidth(),
                        textAlign = TextAlign.Center,
                    )
                }
            }
        }
    }
}

@Composable
private fun Panel(content: @Composable () -> Unit) {
    Box(
        Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface, RoundedCornerShape(20.dp)).padding(16.dp),
    ) { content() }
}

@Composable
private fun CaloriesCard(s: Summary) {
    Panel {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(132.dp), contentAlignment = Alignment.Center) {
                val track = MaterialTheme.colorScheme.surfaceVariant
                val color = if (s.progress > 1f) Palette.Over else MaterialTheme.colorScheme.primary
                Canvas(Modifier.fillMaxSize()) {
                    val w = size.minDimension * 0.1f
                    val st = Stroke(width = w, cap = StrokeCap.Round)
                    val inset = w / 2
                    val arcSize = androidx.compose.ui.geometry.Size(size.width - w, size.height - w)
                    val tl = androidx.compose.ui.geometry.Offset(inset, inset)
                    drawArc(track, 0f, 360f, false, tl, arcSize, style = st)
                    drawArc(color, -90f, 360f * s.progress.coerceIn(0f, 1f), false, tl, arcSize, style = st)
                }
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("${kotlin.math.abs(s.kcalLeft)}", fontSize = 28.sp, fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.onSurface)
                    Text(if (s.kcalLeft >= 0) "осталось" else "сверх нормы", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Spacer(Modifier.width(16.dp))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("${s.kcal} из ${s.targets.kcal} ккал", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                MacroBar("Белки", s.p, s.targets.p, Palette.Protein)
                MacroBar("Жиры", s.f, s.targets.f, Palette.Fat)
                MacroBar("Углеводы", s.c, s.targets.c, Palette.Carbs)
                if (s.streak > 0) Text("🔥 Серия: ${s.streak} дн.", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun MacroBar(name: String, value: Int, target: Int, color: Color) {
    Column {
        Row {
            Text(name, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
            Text("$value / $target г", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurface)
        }
        Spacer(Modifier.height(3.dp))
        LinearProgressIndicator(
            progress = { if (target > 0) (value.toFloat() / target).coerceIn(0f, 1f) else 0f },
            modifier = Modifier.fillMaxWidth().height(6.dp),
            color = color,
            trackColor = MaterialTheme.colorScheme.surfaceVariant,
            strokeCap = StrokeCap.Round,
            drawStopIndicator = {},
        )
    }
}

@Composable
private fun WaterCard(s: Summary, onWater: (Int) -> Unit) {
    Panel {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("💧 Вода", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                Text("${s.water / 250} из ${s.waterGoal / 250} стаканов · ${s.water} мл", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            FilledTonalButton(onClick = { onWater(-250) }, enabled = s.water > 0) { Text("−", fontSize = 18.sp) }
            Spacer(Modifier.width(8.dp))
            Button(onClick = { onWater(250) }, colors = ButtonDefaults.buttonColors(containerColor = Palette.Water)) {
                Text("+ стакан", color = Color.Black, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun PillsCard(day: Day) {
    Panel {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("💊 Таблетки", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
            day.pills.forEach { p ->
                val mark = when (p.s) { "taken" -> "✅"; "skip" -> "⏭"; else -> "⏰" }
                Text(
                    "$mark ${p.time} · ${p.name}${if (p.dose.isNotBlank()) ", ${p.dose}" else ""}",
                    fontSize = 14.sp,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }
        }
    }
}

@Composable
private fun MealsHeader(onAdd: () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Text("Еда", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onBackground, modifier = Modifier.weight(1f))
        TextButton(onClick = onAdd) { Text("📷 Записать в боте") }
    }
}
