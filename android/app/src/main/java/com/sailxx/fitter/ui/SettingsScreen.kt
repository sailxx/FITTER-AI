package com.sailxx.fitter.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sailxx.fitter.R
import com.sailxx.fitter.data.FitterRepository
import com.sailxx.fitter.data.Summary
import com.sailxx.fitter.data.Targets
import com.sailxx.fitter.data.ThemeMode
import com.sailxx.fitter.data.ThemePref
import com.sailxx.fitter.data.WidgetLook
import com.sailxx.fitter.data.WidgetPrefs
import com.sailxx.fitter.widget.ringBitmap
import com.sailxx.fitter.widget.skinOf
import com.sailxx.fitter.widget.updateFitterWidgets
import kotlinx.coroutines.launch
import java.util.Locale

private val Card = RoundedCornerShape(20.dp)
private fun n(x: Int) = String.format(Locale("ru"), "%,d", x).replace(' ', ' ')

/** Настройки: тема приложения и виджеты — прозрачность, углы, что показывать. С живым предпросмотром. */
@Composable
fun SettingsScreen(summary: Summary?, onBack: () -> Unit) {
    val t = LocalTokens.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val mode by ThemePref.mode.collectAsState()
    val look by WidgetPrefs.look.collectAsState()
    // Ползунок двигается плавно, а сохраняем и перерисовываем виджеты, когда палец отпущен
    var opacity by remember(look.opacity) { mutableFloatStateOf(look.opacity.toFloat()) }
    BackHandler(onBack = onBack)

    fun saveLook(l: WidgetLook) {
        WidgetPrefs.save(context, l)
        scope.launch { updateFitterWidgets(context) }
    }

    LazyColumn(Modifier.fillMaxSize().background(t.bg), contentPadding = PaddingValues(bottom = 140.dp)) {
        item {
            val shape = RoundedCornerShape(bottomStart = 30.dp, bottomEnd = 30.dp)
            Row(
                Modifier.fillMaxWidth()
                    .shadow(14.dp, shape, spotColor = Color(0xFF12E97C), ambientColor = Color(0x6612E97C))
                    .clip(shape)
                    .background(Brush.linearGradient(listOf(Palette.Hero1, Palette.Hero2, Palette.Hero3), start = Offset.Zero, end = Offset(500f, 900f)))
                    .statusBarsPadding().padding(start = 18.dp, end = 18.dp, top = 18.dp, bottom = 22.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Настройки", fontSize = 28.sp, fontWeight = FontWeight.ExtraBold, color = Palette.HeroInk, letterSpacing = (-0.5).sp)
            }
        }

        item {
            Group("Оформление", Modifier.padding(top = 16.dp)) {
                Label("Тема приложения", "Виджеты повторяют её: белые при светлой, чёрные при тёмной")
                Segmented(ThemeMode.entries.map { it.title }, ThemeMode.entries.indexOf(mode)) { i ->
                    ThemePref.set(context, ThemeMode.entries[i])
                    scope.launch { updateFitterWidgets(context) }
                }
            }
        }

        item {
            Group("Виджеты", Modifier.padding(top = 12.dp)) {
                Preview(summary, look.copy(opacity = opacity.toInt()), t.dark)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Label("Непрозрачность фона", "0% — только текст поверх обоев", Modifier.weight(1f))
                    Text("${opacity.toInt()}%", fontWeight = FontWeight.ExtraBold, color = t.text)
                }
                Slider(
                    value = opacity, onValueChange = { opacity = it }, valueRange = 0f..100f, steps = 19,
                    onValueChangeFinished = { saveLook(look.copy(opacity = opacity.toInt())) },
                    colors = SliderDefaults.colors(thumbColor = Palette.G2, activeTrackColor = Palette.G2, inactiveTrackColor = t.line, activeTickColor = Color.Transparent, inactiveTickColor = Color.Transparent),
                )
                Label("Углы", null)
                val corners = listOf(8, 24, 36)
                Segmented(listOf("Острые", "Мягкие", "Круглые"), corners.indexOf(look.corners).coerceAtLeast(0)) { i -> saveLook(look.copy(corners = corners[i])) }
                Label("В кольце калорий", null)
                Segmented(listOf("Осталось", "Съедено"), if (look.showEaten) 1 else 0) { i -> saveLook(look.copy(showEaten = i == 1)) }
                Toggle("БЖУ в виджете «Сегодня»", look.showMacros) { saveLook(look.copy(showMacros = it)) }
                Toggle("Вода с кнопкой «+» в «Сегодня»", look.showWater) { saveLook(look.copy(showWater = it)) }
                Text(
                    "Добавить виджет: удерживай палец на свободном месте рабочего стола → «Виджеты» → Fitter",
                    fontSize = 12.sp, color = t.hint,
                )
            }
        }

        item {
            Group("Аккаунт", Modifier.padding(top = 12.dp)) {
                Action("Открыть бота @FitterFoodBot", t.text) { openUrl(context, BOT_URL) }
                Action("Выйти из аккаунта", Palette.Danger) { scope.launch { FitterRepository.logout(context) } }
            }
        }
    }
}

@Composable
private fun Group(title: String, modifier: Modifier, content: @Composable () -> Unit) {
    val t = LocalTokens.current
    Column(modifier.padding(horizontal = 16.dp)) {
        Text(title, fontSize = 13.sp, fontWeight = FontWeight.ExtraBold, color = t.hint, modifier = Modifier.padding(start = 6.dp, bottom = 8.dp))
        Column(
            Modifier.fillMaxWidth()
                .then(if (t.shadow) Modifier.shadow(10.dp, Card, spotColor = Color(0x2210283C), ambientColor = Color(0x1110283C)) else Modifier)
                .background(t.card, Card).border(1.dp, t.edge, Card).padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) { content() }
    }
}

@Composable
private fun Label(title: String, sub: String?, modifier: Modifier = Modifier) {
    val t = LocalTokens.current
    Column(modifier) {
        Text(title, fontWeight = FontWeight.Bold, color = t.text)
        if (sub != null) Text(sub, fontSize = 12.sp, color = t.hint)
    }
}

/** Переключатель-«таблетка» на 2–3 варианта. */
@Composable
private fun Segmented(options: List<String>, selected: Int, onSelect: (Int) -> Unit) {
    val t = LocalTokens.current
    Row(Modifier.fillMaxWidth().background(t.fill, RoundedCornerShape(14.dp)).padding(4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        options.forEachIndexed { i, o ->
            val on = i == selected
            Box(
                Modifier.weight(1f).clip(RoundedCornerShape(11.dp))
                    .background(if (on) Palette.G2 else Color.Transparent)
                    .clickable { onSelect(i) }.padding(vertical = 9.dp),
                contentAlignment = Alignment.Center,
            ) { Text(o, fontSize = 13.sp, fontWeight = if (on) FontWeight.ExtraBold else FontWeight.SemiBold, color = if (on) Color.White else t.text) }
        }
    }
}

@Composable
private fun Toggle(title: String, value: Boolean, onChange: (Boolean) -> Unit) {
    val t = LocalTokens.current
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable { onChange(!value) }, verticalAlignment = Alignment.CenterVertically) {
        Text(title, fontWeight = FontWeight.SemiBold, color = t.text, modifier = Modifier.weight(1f))
        Switch(
            checked = value, onCheckedChange = onChange,
            colors = SwitchDefaults.colors(checkedTrackColor = Palette.G2, checkedThumbColor = Color.White, uncheckedTrackColor = t.line, uncheckedBorderColor = t.line),
        )
    }
}

@Composable
private fun Action(title: String, color: Color, onClick: () -> Unit) {
    Text(
        title, color = color, fontWeight = FontWeight.Bold,
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable(onClick = onClick).padding(vertical = 6.dp),
    )
}

/**
 * Предпросмотр «Калорий» на «обоях»: тот же цвет, прозрачность, углы и кольцо, что у настоящего виджета.
 * Обои — разноцветный градиент, чтобы прозрачность было видно.
 */
@Composable
private fun Preview(summary: Summary?, look: WidgetLook, dark: Boolean) {
    val s = summary ?: Summary("", 1340, 72, 48, 150, Targets(2100, 120, 70, 260), 1250, 2000, 3, 5, 0, 0, "", "")
    val skin = skinOf(dark, look)
    val density = LocalDensity.current.density
    val ringPx = (96 * density).toInt()
    val ring = remember(s.progress, dark) { ringBitmap(skin, s.progress, ringPx, 8 * density).asImageBitmap() }
    val shape = RoundedCornerShape(look.corners.dp)
    Box(
        Modifier.fillMaxWidth().height(190.dp).clip(RoundedCornerShape(18.dp))
            .background(Brush.linearGradient(listOf(Color(0xFF7FB8FF), Color(0xFFC59BFF), Color(0xFFFFB38A)), start = Offset.Zero, end = Offset(900f, 600f))),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            Modifier.size(150.dp).clip(shape)
                .background(skin.base.copy(alpha = look.opacity / 100f), shape)
                .border(1.dp, skin.edge.copy(alpha = skin.edge.alpha * (0.5f + look.opacity / 200f)), shape),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Box(Modifier.size(96.dp), contentAlignment = Alignment.Center) {
                Image(ring, null, Modifier.size(96.dp))
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(n(if (look.showEaten) s.kcal else kotlin.math.abs(s.kcalLeft)), fontSize = 19.sp, fontWeight = FontWeight.ExtraBold, color = skin.ink)
                    Text(if (look.showEaten) "съедено ккал" else "осталось ккал", fontSize = 9.sp, color = skin.mut)
                }
            }
            Spacer(Modifier.height(4.dp))
            Text("${n(s.kcal)} из ${n(s.targets.kcal)}", fontSize = 10.sp, color = skin.mut)
        }
        Image(painterResource(R.drawable.ic_logo), null, Modifier.align(Alignment.BottomEnd).padding(12.dp).size(30.dp))
    }
}
