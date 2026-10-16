package com.sailxx.fitter.ui

import android.text.format.DateUtils
import androidx.annotation.DrawableRes
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.TextButton
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
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
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sailxx.fitter.R
import com.sailxx.fitter.data.AppState
import com.sailxx.fitter.data.Day
import com.sailxx.fitter.data.FitterRepository
import com.sailxx.fitter.data.Meal
import com.sailxx.fitter.data.Summary
import com.sailxx.fitter.data.WeekDay
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.util.Locale
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin

private val Ease = CubicBezierEasing(0.2f, 0.8f, 0.2f, 1f)

/** Удалить приём пищи: долгое нажатие на карточку. */
private suspend fun deleteMeal(context: android.content.Context, id: String) {
    val token = FitterRepository.token(context) ?: return
    runCatching { com.sailxx.fitter.data.Api.mealDelete(token, FitterRepository.today(context), id) }
    FitterRepository.refresh(context)
}
private val Card = RoundedCornerShape(20.dp)
private val MONTHS = listOf("января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря")
private val WD = listOf("Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс")
private val WDF = listOf("понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье")
private const val CUP = 250

private fun n(x: Int) = String.format(Locale("ru"), "%,d", x).replace(' ', ' ')
private fun liters(ml: Int) = (Math.round(ml / 10.0) / 100.0).toString().removeSuffix(".0").replace('.', ',') + " л"
private fun plural(x: Int, a: String, b: String, c: String): String {
    val m = x % 10
    val h = x % 100
    return if (m == 1 && h != 11) a else if (m in 2..4 && (h < 12 || h > 14)) b else c
}

/** Экран дня — как дневник в Telegram: яркая шапка с неделей и кольцом, БЖУ, вода, таблетки, еда. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TodayScreen(st: AppState, onAdd: () -> Unit, onSettings: () -> Unit) {
    val t = LocalTokens.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var refreshing by remember { mutableStateOf(false) }
    val s = st.summary
    val day = st.day

    PullToRefreshBox(
        isRefreshing = refreshing,
        onRefresh = { scope.launch { refreshing = true; FitterRepository.refresh(context); refreshing = false } },
        modifier = Modifier.fillMaxSize().background(t.bg),
    ) {
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 140.dp)) {
            item {
                Hero(s, day, onRefresh = { scope.launch { FitterRepository.refresh(context) } }, onBot = { openUrl(context, BOT_URL) },
                    onLogout = { scope.launch { FitterRepository.logout(context) } }, onSettings = onSettings)
            }
            if (s == null) {
                item {
                    Box(Modifier.fillMaxWidth().padding(top = 60.dp), contentAlignment = Alignment.Center) {
                        if (st.error != null) Text(st.error, color = t.hint) else CircularProgressIndicator(color = Palette.G2)
                    }
                }
                return@LazyColumn
            }
            item {
                Row(
                    Modifier.padding(horizontal = 16.dp).offset(y = (-14).dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    MacroCard(R.drawable.ic_protein, "Белки", s.p, s.targets.p, Palette.Protein, Modifier.weight(1f), 0)
                    MacroCard(R.drawable.ic_fat, "Жиры", s.f, s.targets.f, Palette.Fat, Modifier.weight(1f), 60)
                    MacroCard(R.drawable.ic_carbs, "Углеводы", s.c, s.targets.c, Palette.Carbs, Modifier.weight(1f), 120)
                }
            }
            macroHint(s, day)?.let { (text, kind) -> item { HintCard(text, kind) } }
            item { WaterCard(s) { delta -> scope.launch { FitterRepository.addWater(context, delta) } } }
            day?.takeIf { it.pills.isNotEmpty() }?.let { d -> item { PillsCard(d) } }
            item {
                val meals = day?.meals.orEmpty()
                Row(Modifier.padding(start = 20.dp, end = 20.dp, top = 24.dp, bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("Приёмы пищи", fontSize = 17.sp, fontWeight = FontWeight.ExtraBold, color = t.text, modifier = Modifier.weight(1f))
                    if (meals.isNotEmpty()) Text("${n(meals.sumOf { it.kcal })} ккал", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = t.hint)
                }
            }
            val meals = day?.meals.orEmpty()
            if (meals.isEmpty()) item { EmptyMeals() } else items(meals, key = { it.id }) { m ->
                MealCard(m) { scope.launch { deleteMeal(context, m.id) } }
            }
            item { AddFood(onAdd) }
            item {
                val ago = if (st.updatedAt > 0) DateUtils.getRelativeTimeSpanString(st.updatedAt).toString() else ""
                Text(
                    listOfNotNull(st.error, ago.takeIf { it.isNotEmpty() }?.let { "Обновлено $it" }).joinToString(" · "),
                    fontSize = 12.sp, color = t.hint, textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
                )
            }
        }
    }
}

// ───────────────────────────── Шапка ─────────────────────────────

@Composable
private fun Hero(s: Summary?, day: Day?, onRefresh: () -> Unit, onBot: () -> Unit, onLogout: () -> Unit, onSettings: () -> Unit) {
    val t = LocalTokens.current
    val shape = RoundedCornerShape(bottomStart = 30.dp, bottomEnd = 30.dp)
    val date = s?.date?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
    Column(
        Modifier.fillMaxWidth()
            .shadow(if (t.dark) 10.dp else 16.dp, shape, spotColor = Color(0xFF12E97C), ambientColor = Color(0x6612E97C))
            .clip(shape)
            .background(Brush.linearGradient(listOf(Palette.Hero1, Palette.Hero2, Palette.Hero3), start = Offset(0f, 0f), end = Offset(500f, 1400f)))
            .drawBehind {
                // Светлое пятно справа сверху и белый круг — как у шапки дневника
                drawCircle(
                    Brush.radialGradient(listOf(Color(0xD9E6FFF0), Color(0x00E6FFF0)), center = Offset(size.width * 0.9f, -size.height * 0.12f), radius = size.width * 0.9f),
                    radius = size.width * 0.9f, center = Offset(size.width * 0.9f, -size.height * 0.12f),
                )
                drawCircle(Color(0x1AFFFFFF), radius = 120.dp.toPx(), center = Offset(size.width + 40.dp.toPx(), 10.dp.toPx()))
            }
            .statusBarsPadding()
            .padding(start = 14.dp, end = 14.dp, top = 14.dp, bottom = 36.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Сегодня", fontSize = 30.sp, fontWeight = FontWeight.ExtraBold, color = Palette.HeroInk, letterSpacing = (-0.6).sp)
                Text(
                    date?.let { "${it.dayOfMonth} ${MONTHS[it.monthValue - 1]}, ${WDF[it.dayOfWeek.value - 1]}" } ?: "FITTER",
                    fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = Palette.HeroSub,
                )
            }
            HeroButton("↻", onRefresh)
            Spacer(Modifier.width(6.dp))
            var menu by remember { mutableStateOf(false) }
            Box {
                HeroButton("•••") { menu = true }
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                    DropdownMenuItem(text = { Text("Настройки") }, onClick = { menu = false; onSettings() })
                    DropdownMenuItem(text = { Text("Открыть бота") }, onClick = { menu = false; onBot() })
                    DropdownMenuItem(text = { Text("Выйти") }, onClick = { menu = false; onLogout() })
                }
            }
        }
        day?.week?.takeIf { it.size == 7 }?.let { week -> WeekRow(week, day.date, day.today, s?.targets?.kcal ?: 0) }
        if (s != null) {
            Spacer(Modifier.height(6.dp))
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { Ring(s) }
            Spacer(Modifier.height(10.dp))
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { LeftChip(s) }
        }
    }
}

@Composable
private fun HeroButton(label: String, onClick: () -> Unit) {
    Box(
        Modifier.size(36.dp).clip(RoundedCornerShape(12.dp)).background(Palette.HeroBtn).clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { Text(label, color = Palette.HeroInk, fontWeight = FontWeight.ExtraBold, fontSize = if (label == "↻") 19.sp else 13.sp) }
}

/** Неделя Пн–Вс: точка под днём — в норме, меньше или больше нормы. */
@Composable
private fun WeekRow(week: List<WeekDay>, sel: String, today: String, goal: Int) {
    Row(Modifier.fillMaxWidth().padding(top = 16.dp, bottom = 8.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        week.forEachIndexed { i, w ->
            val isSel = w.date == sel
            val dot = when {
                w.meals == 0 || goal == 0 -> Color.Transparent
                w.kcal > goal * 1.1 -> Palette.OverDot
                w.kcal >= goal * 0.9 -> if (isSel) Palette.HeroSelInk else Palette.HeroInk
                else -> if (isSel) Palette.HeroSelInk.copy(alpha = 0.7f) else Palette.HeroInk.copy(alpha = 0.3f)
            }
            Column(
                Modifier.weight(1f)
                    .then(if (isSel) Modifier.shadow(8.dp, RoundedCornerShape(14.dp), spotColor = Color(0x55052E1C)) else Modifier)
                    .clip(RoundedCornerShape(14.dp))
                    .background(if (isSel) Palette.HeroInk else Color.Transparent)
                    .padding(vertical = 7.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                val alpha = if (w.date > today) 0.4f else 1f
                Text(WD[i], fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = (if (isSel) Palette.HeroSelInk.copy(alpha = 0.7f) else Palette.HeroSub).copy(alpha = alpha))
                Text(
                    w.date.takeLast(2).trimStart('0'), fontSize = 17.sp, fontWeight = FontWeight.ExtraBold,
                    color = (if (isSel) Palette.HeroSelInk else Palette.HeroInk).copy(alpha = alpha),
                    textDecoration = if (w.date == today && !isSel) TextDecoration.Underline else null,
                )
                Spacer(Modifier.height(2.dp))
                Box(Modifier.size(6.dp).background(dot, CircleShape))
            }
        }
    }
}

/** Кольцо калорий: светлая дорожка, белая дуга с бегунком, белый диск с числом. Дуга и число набегают при открытии. */
@Composable
private fun Ring(s: Summary) {
    val goal = s.targets.kcal
    val pct = if (goal > 0) (s.kcal.toFloat() / goal).coerceIn(0f, 1f) else 0f
    val over = goal > 0 && s.kcal > goal * 1.1
    val share = if (goal > 0) (s.kcal * 100f / goal).roundToInt() else 0
    val arc by animateFloatAsState(pct, tween(1200, easing = Ease), label = "arc")
    val count = remember { Animatable(0f) }
    LaunchedEffect(s.kcal) { count.animateTo(s.kcal.toFloat(), tween(1100, easing = Ease)) }

    Box(Modifier.size(204.dp), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val sw = 14.dp.toPx()
            val r = 88.dp.toPx()
            val c = Offset(size.width / 2, size.height / 2)
            val tl = Offset(c.x - r, c.y - r)
            val box = Size(r * 2, r * 2)
            drawCircle(Palette.HeroTrack, r, c, style = Stroke(sw))
            if (arc > 0f) {
                val colors = if (over) listOf(Palette.OverDark, Palette.OverLight) else listOf(Color.White, Palette.ArcEnd)
                // Тень дуги
                drawArc(Color(0x2203301A), -90f, 360f * arc, false, tl + Offset(0f, 3.dp.toPx()), box, style = Stroke(sw, cap = StrokeCap.Round))
                drawArc(Brush.linearGradient(colors, tl, tl + Offset(box.width, box.height)), -90f, 360f * arc, false, tl, box, style = Stroke(sw, cap = StrokeCap.Round))
                if (arc > 0.02f) {
                    val ang = Math.toRadians((-90 + 360 * arc).toDouble())
                    val k = Offset(c.x + r * cos(ang).toFloat(), c.y + r * sin(ang).toFloat())
                    drawCircle(Color.White, 10.dp.toPx(), k)
                    drawCircle(if (over) Palette.OverDot else Palette.Knob, 6.dp.toPx(), k)
                }
            }
        }
        Column(
            Modifier.size(136.dp)
                .shadow(14.dp, CircleShape, spotColor = Color(0x5503301A), ambientColor = Color(0x3316B86A))
                .background(Color.White, CircleShape),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Image(painterResource(R.drawable.ic_kcal), null, Modifier.size(22.dp))
            Text(n(count.value.roundToInt()), fontSize = 36.sp, fontWeight = FontWeight.ExtraBold, color = Palette.HeroInk, letterSpacing = (-1).sp, lineHeight = 38.sp)
            Text("из ${n(goal)} ккал", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Palette.InSub)
            Spacer(Modifier.height(5.dp))
            Text(
                "$share%", fontSize = 12.sp, fontWeight = FontWeight.ExtraBold,
                color = if (over) Palette.OverDark else Palette.EmInk,
                modifier = Modifier.background(if (over) Color(0xFFFFE6E2) else Palette.EmBg, RoundedCornerShape(99.dp)).padding(horizontal = 8.dp, vertical = 2.dp),
            )
        }
    }
}

@Composable
private fun LeftChip(s: Summary) {
    val left = s.kcalLeft
    val over = left < 0
    Text(
        if (over) "+${n(-left)} ккал сверх нормы" else "Осталось ${n(left)} ккал",
        fontSize = 14.sp, fontWeight = FontWeight.Bold,
        color = if (over) Color.White else Palette.HeroInk,
        modifier = Modifier.background(if (over) Palette.OverDot else Palette.HeroChip, RoundedCornerShape(99.dp)).padding(horizontal = 14.dp, vertical = 7.dp),
    )
}

// ───────────────────────────── Карточки ─────────────────────────────

@Composable
private fun Modifier.card(): Modifier {
    val t = LocalTokens.current
    return this
        .then(if (t.shadow) Modifier.shadow(10.dp, Card, spotColor = Color(0x2210283C), ambientColor = Color(0x1110283C)) else Modifier)
        .background(t.card, Card)
        .border(1.dp, t.edge, Card)
}

@Composable
private fun MacroCard(@DrawableRes icon: Int, label: String, value: Int, max: Int, color: Color, modifier: Modifier, delay: Int) {
    val t = LocalTokens.current
    val pct = if (max > 0) (value.toFloat() / max).coerceIn(0f, 1f) else 0f
    val bar by animateFloatAsState(pct, tween(1000, delayMillis = delay, easing = Ease), label = "bar")
    val ok = max > 0 && value >= max * 0.9 && value <= max * 1.1
    val left = max - value
    Column(modifier.rise(delay).card().padding(horizontal = 14.dp, vertical = 16.dp)) {
        Box(Modifier.size(30.dp).background(color.copy(alpha = 0.14f), RoundedCornerShape(10.dp)), contentAlignment = Alignment.Center) {
            Image(painterResource(icon), null, Modifier.size(20.dp))
        }
        Spacer(Modifier.height(10.dp))
        Text(label, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = t.hint, maxLines = 1)
        Text(
            buildAnnotatedString {
                append("$value")
                withStyle(SpanStyle(fontSize = 12.sp, color = t.hint, fontWeight = FontWeight.SemiBold)) { append(" / $max г") }
            },
            fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, color = t.text, maxLines = 1, letterSpacing = (-0.4).sp,
            modifier = Modifier.padding(top = 1.dp, bottom = 8.dp),
        )
        Box(Modifier.fillMaxWidth().height(5.dp).clip(RoundedCornerShape(9.dp)).background(t.line)) {
            Box(Modifier.fillMaxHeight().fillMaxWidth(bar).clip(RoundedCornerShape(9.dp)).background(color))
        }
        Spacer(Modifier.height(8.dp))
        Text(
            when { max == 0 -> ""; ok -> "в норме"; left > 0 -> "ещё $left г"; else -> "+${-left} г" },
            fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 1,
            color = when { ok -> if (t.dark) Palette.G1 else Palette.G3; left < 0 -> Palette.Danger; else -> t.hint },
        )
    }
}

private val FOODS = mapOf("p" to "творог 200 г или куриная грудка 150 г", "f" to "горсть орехов или ложка масла в салат", "c" to "порция каши, хлеб или фрукт")
private val NAMES = mapOf("p" to "белка", "f" to "жиров", "c" to "углеводов")

/** Подсказка под БЖУ — та же логика, что macroHint в дневнике. kind: warn | good | "" */
private fun macroHint(s: Summary, day: Day?): Pair<String, String>? {
    if (day == null || day.meals.isEmpty()) return null
    val tot = mapOf("p" to s.p, "f" to s.f, "c" to s.c)
    val g = mapOf("p" to s.targets.p, "f" to s.targets.f, "c" to s.targets.c)
    var over: String? = null
    var need: String? = null
    for (k in listOf("p", "f", "c")) {
        val gk = g[k]!!
        if (gk == 0) continue
        val k1 = tot[k]!!.toFloat() / gk
        if (k1 > 1.1f && (over == null || k1 > tot[over]!!.toFloat() / g[over]!!)) over = k
        if (k1 < 0.9f && (need == null || k1 < tot[need]!!.toFloat() / g[need]!!)) need = k
    }
    return when {
        over != null -> "${NAMES[over]!!.replaceFirstChar { it.uppercase() }} уже больше нормы на ${tot[over]!! - g[over]!!} г. " +
            (if (need != null) "А вот ${NAMES[need]} не хватает ${g[need]!! - tot[need]!!} г." else "Остальное в порядке.") to "warn"
        need != null -> "Сильнее всего не хватает ${NAMES[need]}: добери ${g[need]!! - tot[need]!!} г — например, ${FOODS[need]}." to ""
        else -> "БЖУ в балансе. Белки, жиры и углеводы — все в пределах нормы." to "good"
    }
}

@Composable
private fun HintCard(text: String, kind: String) {
    val t = LocalTokens.current
    Row(Modifier.padding(start = 16.dp, end = 16.dp).rise(200).fillMaxWidth().card().padding(16.dp)) {
        Box(
            Modifier.padding(top = 6.dp).size(8.dp).background(
                when (kind) { "good" -> Palette.Carbs; "warn" -> Palette.Danger; else -> Palette.Protein }, CircleShape,
            ),
        )
        Spacer(Modifier.width(12.dp))
        Text(text, fontSize = 14.sp, lineHeight = 19.sp, color = t.text)
    }
}

/** Вода: синяя карточка, стакан с волной, стаканчики и кнопки. */
@Composable
private fun WaterCard(s: Summary, onWater: (Int) -> Unit) {
    val t = LocalTokens.current
    val all = maxOf(1, (s.waterGoal + CUP - 1) / CUP)
    val on = s.water / CUP
    val done = s.water >= s.waterGoal
    val shape = Card
    Row(
        Modifier.padding(start = 16.dp, end = 16.dp, top = 12.dp).rise(260).fillMaxWidth()
            .then(if (!t.dark || done) Modifier.shadow(14.dp, shape, spotColor = Color(0x882A7BF0), ambientColor = Color(0x442A7BF0)) else Modifier)
            .clip(shape)
            .background(Brush.linearGradient(listOf(Palette.Water1, Palette.Water2)))
            .drawBehind { drawCircle(Color(0x1FFFFFFF), 80.dp.toPx(), Offset(size.width - 30.dp.toPx(), -10.dp.toPx())) }
            .then(if (done) Modifier.border(2.dp, Color(0xB3FFFFFF), shape) else Modifier)
            .padding(18.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Glass(if (s.waterGoal > 0) (s.water.toFloat() / s.waterGoal).coerceIn(0f, 1f) else 0f)
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text("Вода", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Color(0xD9FFFFFF))
            Text(liters(s.water), fontSize = 24.sp, fontWeight = FontWeight.ExtraBold, color = Color.White, letterSpacing = (-0.5).sp)
            Text("$on из $all ${plural(all, "стакана", "стаканов", "стаканов")} · норма ${liters(s.waterGoal)}", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Color(0xD9FFFFFF))
            Row(Modifier.padding(top = 7.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                repeat(minOf(all, 14)) { i ->
                    Box(Modifier.size(9.dp, 12.dp).background(if (i < on) Color.White else Color(0x47FFFFFF), RoundedCornerShape(1.dp, 1.dp, 3.dp, 3.dp)))
                }
            }
        }
        Spacer(Modifier.width(10.dp))
        Column(Modifier.width(IntrinsicSize.Max), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(
                "+ стакан", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = Palette.Water2,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Color.White).clickable { onWater(CUP) }.padding(horizontal = 14.dp, vertical = 9.dp),
            )
            Text(
                "−", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = Color.White, textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Color(0x38FFFFFF))
                    .clickable(enabled = s.water > 0) { onWater(-CUP) }.padding(vertical = 7.dp),
            )
        }
    }
}

/** Стакан, который наполняется, с бегущей волной сверху. */
@Composable
private fun Glass(level: Float) {
    val fill by animateFloatAsState(level, tween(1000, easing = Ease), label = "lvl")
    val wave = rememberInfiniteTransition(label = "wave")
    val ph by wave.animateFloat(0f, (2 * PI).toFloat(), infiniteRepeatable(tween(2400, easing = LinearEasing)), label = "ph")
    Canvas(Modifier.size(52.dp, 70.dp)) {
        val w = size.width
        val h = size.height
        val glass = Path().apply {
            moveTo(w * 0.06f, h * 0.04f); lineTo(w * 0.94f, h * 0.04f); lineTo(w * 0.82f, h * 0.94f)
            quadraticTo(w * 0.8f, h, w * 0.72f, h); lineTo(w * 0.28f, h); quadraticTo(w * 0.2f, h, w * 0.18f, h * 0.94f); close()
        }
        clipPath(glass) {
            drawRect(Color(0x26FFFFFF))
            val top = h * (1f - 0.08f - 0.84f * fill)
            for ((amp, alpha, shift) in listOf(Triple(3.2f, 0.55f, 1.6f), Triple(2.6f, 1f, 0f))) {
                val p = Path().apply {
                    moveTo(0f, h)
                    var x = 0f
                    while (x <= w) { lineTo(x, top + sin(x / w * 2 * PI.toFloat() * 1.3f + ph + shift) * amp.dp.toPx()); x += 2f }
                    lineTo(w, h); close()
                }
                drawPath(p, Color.White.copy(alpha = alpha * 0.92f))
            }
        }
        drawPath(glass, Color.White, style = Stroke(2.5.dp.toPx()))
    }
}

@Composable
private fun PillsCard(day: Day) {
    val t = LocalTokens.current
    val taken = day.pills.count { it.s == "taken" }
    val bar by animateFloatAsState(taken.toFloat() / day.pills.size, tween(800, easing = Ease), label = "pb")
    Column(Modifier.padding(start = 16.dp, end = 16.dp, top = 12.dp).rise(320).fillMaxWidth().card().padding(horizontal = 18.dp, vertical = 16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(36.dp).background(Palette.Pill.copy(alpha = 0.1f), RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) {
                Image(painterResource(R.drawable.ic_pill), null, Modifier.size(22.dp))
            }
            Spacer(Modifier.width(10.dp))
            Column {
                Text("Таблетки", fontWeight = FontWeight.ExtraBold, color = t.text)
                Text("$taken из ${day.pills.size} принято", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = t.hint)
            }
        }
        Box(Modifier.padding(top = 12.dp, bottom = 4.dp).fillMaxWidth().height(5.dp).clip(RoundedCornerShape(9.dp)).background(t.line)) {
            Box(Modifier.fillMaxHeight().fillMaxWidth(bar).background(Palette.Pill))
        }
        day.pills.forEachIndexed { i, p ->
            if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(t.line))
            Row(Modifier.padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(p.time, fontSize = 13.sp, fontWeight = FontWeight.ExtraBold, color = t.hint, modifier = Modifier.width(48.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        p.name, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis,
                        color = if (p.s == "taken") t.hint else t.text, textDecoration = if (p.s == "taken") TextDecoration.LineThrough else null,
                    )
                    if (p.dose.isNotBlank()) Text(p.dose, fontSize = 12.sp, color = t.hint)
                }
                val isTaken = p.s == "taken"
                Box(
                    Modifier.size(26.dp).background(if (isTaken) Palette.Pill else Color.Transparent, CircleShape)
                        .border(2.dp, if (isTaken) Palette.Pill else t.line, CircleShape),
                    contentAlignment = Alignment.Center,
                ) { if (isTaken) Text("✓", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.ExtraBold) else if (p.s == "skip") Text("–", color = t.hint) }
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun MealCard(m: Meal, onDelete: () -> Unit) {
    val t = LocalTokens.current
    var ask by remember { mutableStateOf(false) }
    if (ask) {
        AlertDialog(
            onDismissRequest = { ask = false },
            title = { Text("Удалить «${m.title}»?") },
            text = { Text("${m.kcal} ккал уберутся из дневника — и здесь, и в боте.") },
            confirmButton = { TextButton(onClick = { ask = false; onDelete() }) { Text("Удалить", color = Palette.Danger) } },
            dismissButton = { TextButton(onClick = { ask = false }) { Text("Отмена") } },
        )
    }
    Column(Modifier.padding(start = 16.dp, end = 16.dp, bottom = 12.dp).rise(80).fillMaxWidth().card().clip(Card)
        .combinedClickable(onClick = {}, onLongClick = { ask = true }).padding(start = 18.dp, end = 18.dp, top = 16.dp, bottom = 12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(36.dp).background(Palette.Carbs.copy(alpha = 0.13f), RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) {
                Image(painterResource(R.drawable.ic_plate), null, Modifier.size(24.dp))
            }
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(m.title, fontWeight = FontWeight.Bold, color = t.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text("${m.time} · Б ${m.p} · Ж ${m.f} · У ${m.c}", fontSize = 12.sp, color = t.hint)
            }
            Spacer(Modifier.width(8.dp))
            Text(
                n(m.kcal), fontSize = 14.sp, fontWeight = FontWeight.ExtraBold, color = t.text,
                modifier = Modifier.background(t.fill, RoundedCornerShape(10.dp)).padding(horizontal = 9.dp, vertical = 5.dp),
            )
        }
        // Полоска БЖУ: доли белков, жиров и углеводов по калориям
        val kp = m.p * 4f
        val kf = m.f * 9f
        val kc = m.c * 4f
        val sum = kp + kf + kc
        if (sum > 0) {
            Row(Modifier.padding(top = 10.dp).fillMaxWidth().height(4.dp), horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                listOf(kp to Palette.Protein, kf to Palette.Fat, kc to Palette.Carbs).filter { it.first > 0 }.forEach { (v, c) ->
                    Box(Modifier.weight(v / sum).fillMaxHeight().background(c, RoundedCornerShape(3.dp)))
                }
            }
        }
    }
}

@Composable
private fun EmptyMeals() {
    val t = LocalTokens.current
    Column(
        Modifier.padding(horizontal = 16.dp).rise(120).fillMaxWidth().card().padding(horizontal = 16.dp, vertical = 26.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(Modifier.size(56.dp).background(Palette.Carbs.copy(alpha = 0.13f), RoundedCornerShape(18.dp)), contentAlignment = Alignment.Center) {
            Image(painterResource(R.drawable.ic_salad), null, Modifier.size(42.dp))
        }
        Spacer(Modifier.height(10.dp))
        Text("Пока пусто", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = t.text)
        Text("Сфотографируй еду и отправь боту — она появится здесь и на виджетах", color = t.hint, textAlign = TextAlign.Center, fontSize = 14.sp)
    }
}

/** Как поле «Добавить еду» в дневнике: ведёт в бота, где фото распознаёт ИИ. */
@Composable
private fun AddFood(onClick: () -> Unit) {
    val t = LocalTokens.current
    Row(
        Modifier.padding(start = 16.dp, end = 16.dp, top = 4.dp).fillMaxWidth().card().clip(Card).clickable(onClick = onClick)
            .padding(start = 18.dp, end = 8.dp, top = 8.dp, bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Image(painterResource(R.drawable.ic_camera), null, Modifier.size(24.dp))
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text("Записать еду", fontWeight = FontWeight.Bold, color = t.text)
            Text("Фото, снимок с камеры или пара слов", fontSize = 12.sp, color = t.hint)
        }
        Box(Modifier.size(44.dp).background(Palette.G2, RoundedCornerShape(14.dp)), contentAlignment = Alignment.Center) {
            Text("+", color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.SemiBold)
        }
    }
}
