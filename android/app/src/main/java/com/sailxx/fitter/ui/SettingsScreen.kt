package com.sailxx.fitter.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sailxx.fitter.BuildConfig
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

private val Group = RoundedCornerShape(18.dp)
private fun n(x: Int) = String.format(Locale("ru"), "%,d", x).replace(' ', ' ')

/** Настройки: спокойный список — тема, виджеты, аккаунт. Изменения сразу видны на виджетах. */
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

    LazyColumn(
        Modifier.fillMaxSize().background(t.bg),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 140.dp),
    ) {
        item {
            Text(
                "Настройки", fontSize = 32.sp, fontWeight = FontWeight.ExtraBold, color = t.text, letterSpacing = (-0.6).sp,
                modifier = Modifier.statusBarsPadding().padding(start = 4.dp, top = 20.dp, bottom = 8.dp),
            )
        }

        item {
            Section("Оформление")
            Card {
                Row(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("Тема", color = t.text, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
                }
                Box(Modifier.padding(start = 16.dp, end = 16.dp, bottom = 14.dp)) {
                    Segmented(listOf("Система", "Светлая", "Тёмная"), ThemeMode.entries.indexOf(mode)) { i ->
                        ThemePref.set(context, ThemeMode.entries[i])
                        scope.launch { updateFitterWidgets(context) }
                    }
                }
            }
            Note("Виджеты повторяют тему: белые при светлой, чёрные при тёмной")
        }

        item {
            Section("Виджеты")
            Card {
                Preview(summary, look.copy(opacity = opacity.toInt()), t.dark)
                Divider()
                Column(Modifier.padding(start = 16.dp, end = 16.dp, top = 12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Непрозрачность фона", color = t.text, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
                        Text("${opacity.toInt()}%", color = t.hint, fontWeight = FontWeight.SemiBold)
                    }
                    Slider(
                        value = opacity, onValueChange = { opacity = it }, valueRange = 0f..100f, steps = 19,
                        onValueChangeFinished = { saveLook(look.copy(opacity = opacity.toInt())) },
                        colors = SliderDefaults.colors(
                            thumbColor = Palette.G2, activeTrackColor = Palette.G2, inactiveTrackColor = t.line,
                            activeTickColor = Color.Transparent, inactiveTickColor = Color.Transparent,
                        ),
                    )
                }
                Divider()
                val corners = listOf(8, 24, 36)
                ChoiceRow("Углы", listOf("Острые", "Мягкие", "Круглые"), corners.indexOf(look.corners).coerceAtLeast(0)) { i -> saveLook(look.copy(corners = corners[i])) }
                Divider()
                ChoiceRow("В кольце", listOf("Осталось", "Съедено"), if (look.showEaten) 1 else 0) { i -> saveLook(look.copy(showEaten = i == 1)) }
                Divider()
                ToggleRow("БЖУ в «Сегодня»", look.showMacros) { saveLook(look.copy(showMacros = it)) }
                Divider()
                ToggleRow("Вода в «Сегодня»", look.showWater) { saveLook(look.copy(showWater = it)) }
            }
            Note("Добавить виджет: удерживай палец на рабочем столе → «Виджеты» → Fitter. Растягивай — содержимое подстроится")
        }

        item {
            Section("Размер текста в виджетах")
            Card {
                TextPreview(summary, look, t.dark)
                Row(Modifier.padding(horizontal = 16.dp).padding(bottom = 14.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    val cur = Triple(look.numSize, look.textSize, look.capSize)
                    listOf("S", "M", "L", "XL").forEachIndexed { i, name ->
                        val p = WidgetLook.PRESETS[i]
                        val on = p == cur
                        Box(
                            Modifier.weight(1f).height(48.dp).clip(RoundedCornerShape(12.dp))
                                .background(if (on) Palette.G2.copy(alpha = 0.14f) else t.fill)
                                .border(1.dp, if (on) Palette.G2 else Color.Transparent, RoundedCornerShape(12.dp))
                                .clickable { saveLook(look.copy(numSize = p.first, textSize = p.second, capSize = p.third)) },
                            contentAlignment = Alignment.Center,
                        ) { Text(name, fontWeight = FontWeight.Bold, color = if (on) Palette.G2 else t.text) }
                    }
                }
                Divider()
                Stepper("Главное число", look.numSize, 16..44) { saveLook(look.copy(numSize = it)) }
                Divider()
                Stepper("Текст", look.textSize, 9..20) { saveLook(look.copy(textSize = it)) }
                Divider()
                Stepper("Подписи", look.capSize, 8..16) { saveLook(look.copy(capSize = it)) }
                Divider()
                ToggleRow("Не учитывать системный размер шрифта", look.fixedFont) { saveLook(look.copy(fixedFont = it)) }
            }
            Note("Размеры в sp для виджета обычного размера: растянутый виджет крупнее. Если переключатель включён, масштаб шрифта телефона на них не влияет")
        }

        item {
            Section("Аккаунт")
            Card {
                LinkRow("Открыть бота @FitterFoodBot", t.text) { openUrl(context, BOT_URL) }
                Divider()
                LinkRow("Выйти", Palette.Danger, chevron = false) { scope.launch { FitterRepository.logout(context) } }
            }
            Text(
                "Fitter ${BuildConfig.VERSION_NAME}", fontSize = 12.sp, color = t.hint, textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(top = 24.dp),
            )
        }
    }
}

@Composable
private fun Section(title: String) {
    val t = LocalTokens.current
    Text(title, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = t.hint, modifier = Modifier.padding(start = 4.dp, top = 22.dp, bottom = 8.dp))
}

@Composable
private fun Card(content: @Composable ColumnScope.() -> Unit) {
    val t = LocalTokens.current
    Column(Modifier.fillMaxWidth().clip(Group).background(t.card).border(1.dp, t.edge, Group), content = content)
}

@Composable
private fun Divider() {
    val t = LocalTokens.current
    Box(Modifier.padding(start = 16.dp).fillMaxWidth().height(1.dp).background(t.line))
}

@Composable
private fun Note(text: String) {
    val t = LocalTokens.current
    Text(text, fontSize = 12.sp, color = t.hint, lineHeight = 16.sp, modifier = Modifier.padding(start = 4.dp, end = 4.dp, top = 8.dp))
}

/** Строка: название слева, компактный выбор справа. */
@Composable
private fun ChoiceRow(title: String, options: List<String>, selected: Int, onSelect: (Int) -> Unit) {
    val t = LocalTokens.current
    Row(Modifier.padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(title, color = t.text, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
        Box(Modifier.weight(1.6f)) { Segmented(options, selected, onSelect) }
    }
}

@Composable
private fun ToggleRow(title: String, value: Boolean, onChange: (Boolean) -> Unit) {
    val t = LocalTokens.current
    Row(Modifier.fillMaxWidth().clickable { onChange(!value) }.padding(horizontal = 16.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(title, color = t.text, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
        Switch(
            checked = value, onCheckedChange = onChange,
            colors = SwitchDefaults.colors(
                checkedTrackColor = Palette.G2, checkedThumbColor = Color.White, checkedBorderColor = Color.Transparent,
                uncheckedTrackColor = t.fill, uncheckedThumbColor = t.hint, uncheckedBorderColor = t.line,
            ),
        )
    }
}

@Composable
private fun LinkRow(title: String, color: Color, chevron: Boolean = true, onClick: () -> Unit) {
    val t = LocalTokens.current
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 15.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(title, color = color, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
        if (chevron) Text("›", color = t.hint, fontSize = 20.sp)
    }
}

/** Выбор как в iOS: серая дорожка, выбранный вариант — светлая плашка. */
@Composable
private fun Segmented(options: List<String>, selected: Int, onSelect: (Int) -> Unit) {
    val t = LocalTokens.current
    Row(Modifier.fillMaxWidth().background(t.fill, RoundedCornerShape(10.dp)).padding(3.dp)) {
        options.forEachIndexed { i, o ->
            val on = i == selected
            Box(
                Modifier.weight(1f).clip(RoundedCornerShape(8.dp))
                    .background(if (on) (if (t.dark) Color(0xFF2A322E) else Color.White) else Color.Transparent)
                    .clickable { onSelect(i) }.padding(vertical = 7.dp),
                contentAlignment = Alignment.Center,
            ) { Text(o, fontSize = 13.sp, fontWeight = if (on) FontWeight.SemiBold else FontWeight.Normal, color = if (on) t.text else t.hint, maxLines = 1) }
        }
    }
}

/**
 * Предпросмотр «Калорий»: тот же цвет, прозрачность, углы и кольцо, что у настоящего виджета.
 * Под ним мягкий градиент вместо обоев, чтобы прозрачность было видно.
 */
@Composable
private fun Preview(summary: Summary?, look: WidgetLook, dark: Boolean) {
    val s = summary ?: Summary("", 1340, 72, 48, 150, Targets(2100, 120, 70, 260), 1250, 2000, 3, 5, 0, 0, "", "")
    val skin = skinOf(dark, look)
    val density = LocalDensity.current.density
    val ringPx = (78 * density).toInt()
    val ring = remember(s.progress, dark) { ringBitmap(skin, s.progress, ringPx, 7 * density).asImageBitmap() }
    val shape = RoundedCornerShape((look.corners * 0.8f).dp)
    val wall = if (dark) listOf(Color(0xFF1C2B3A), Color(0xFF2A2140), Color(0xFF13261D)) else listOf(Color(0xFFD9ECFF), Color(0xFFEADCFF), Color(0xFFDDF7E8))
    Box(
        Modifier.fillMaxWidth().padding(12.dp).height(150.dp).clip(RoundedCornerShape(12.dp))
            .background(Brush.linearGradient(wall, start = Offset.Zero, end = Offset(900f, 500f))),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            Modifier.size(124.dp).clip(shape)
                .background(skin.base.copy(alpha = look.opacity / 100f), shape)
                .border(1.dp, skin.edge.copy(alpha = skin.edge.alpha * (0.5f + look.opacity / 200f)), shape),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Box(Modifier.size(78.dp), contentAlignment = Alignment.Center) {
                Image(ring, null, Modifier.size(78.dp))
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(n(if (look.showEaten) s.kcal else kotlin.math.abs(s.kcalLeft)), fontSize = 16.sp, fontWeight = FontWeight.ExtraBold, color = skin.ink)
                    Text(if (look.showEaten) "съедено" else "осталось", fontSize = 8.sp, color = skin.mut)
                }
            }
            Spacer(Modifier.height(4.dp))
            Text("${n(s.kcal)} из ${n(s.targets.kcal)}", fontSize = 9.sp, color = skin.mut)
        }
    }
}

/** Строка «название — число +»: квадратные кнопки, как в настройках Okto. */
@Composable
private fun Stepper(title: String, value: Int, range: IntRange, onChange: (Int) -> Unit) {
    val t = LocalTokens.current
    Row(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(title, color = t.text, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
        StepButton("−", value > range.first) { onChange(value - 1) }
        Text("$value", color = t.text, fontWeight = FontWeight.SemiBold, fontSize = 17.sp, textAlign = TextAlign.Center, modifier = Modifier.width(48.dp))
        StepButton("+", value < range.last) { onChange(value + 1) }
    }
}

@Composable
private fun StepButton(label: String, enabled: Boolean, onClick: () -> Unit) {
    val t = LocalTokens.current
    Box(
        Modifier.size(44.dp).clip(RoundedCornerShape(12.dp)).background(t.fill).border(1.dp, t.line, RoundedCornerShape(12.dp))
            .clickable(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { Text(label, fontSize = 20.sp, fontWeight = FontWeight.Bold, color = if (enabled) t.text else t.hint) }
}

/**
 * Предпросмотр размеров: кусочек виджета «Сегодня» с настоящими размерами текста —
 * главное число, строка БЖУ и серая подпись. Учитывает «Не учитывать системный размер шрифта».
 */
@Composable
private fun TextPreview(summary: Summary?, look: WidgetLook, dark: Boolean) {
    val s = summary ?: Summary("", 1340, 72, 48, 150, Targets(2100, 120, 70, 260), 1250, 2000, 3, 5, 0, 0, "", "")
    val skin = skinOf(dark, look.copy(opacity = 100))
    val d = LocalDensity.current
    // sp в Compose уже умножены на масштаб шрифта телефона; если его надо не учитывать — делим обратно
    val k = if (look.fixedFont) 1f / d.fontScale else 1f
    val ringPx = (64 * d.density).toInt()
    val ring = remember(s.progress, dark) { ringBitmap(skin, s.progress, ringPx, 6 * d.density).asImageBitmap() }
    Row(
        Modifier.padding(12.dp).fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(skin.base)
            .border(1.dp, skin.edge, RoundedCornerShape(16.dp)).padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Image(ring, null, Modifier.size(64.dp))
        Spacer(Modifier.width(14.dp))
        Column {
            Text(n(if (look.showEaten) s.kcal else kotlin.math.abs(s.kcalLeft)), fontSize = (look.numSize * k).sp, fontWeight = FontWeight.Bold, color = skin.ink, maxLines = 1)
            Text("Белки ${s.p} / ${s.targets.p} г", fontSize = (look.textSize * k).sp, fontWeight = FontWeight.Medium, color = skin.ink, maxLines = 1)
            Text(if (look.showEaten) "съедено ккал" else "осталось ккал", fontSize = (look.capSize * k).sp, color = skin.mut, maxLines = 1)
        }
    }
}
