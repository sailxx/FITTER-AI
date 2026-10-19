package com.sailxx.fitter.ui

import android.text.format.DateUtils
import androidx.annotation.DrawableRes
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateIntAsState
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
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
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sailxx.fitter.R
import com.sailxx.fitter.data.AppState
import com.sailxx.fitter.data.Day
import com.sailxx.fitter.data.FitterRepository
import com.sailxx.fitter.data.Meal
import com.sailxx.fitter.data.Summary
import com.sailxx.fitter.data.WeekDay
import com.sailxx.fitter.data.WeightPoint
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToInt

private val Ease = CubicBezierEasing(0.2f, 0.8f, 0.2f, 1f)

/** Удалить приём пищи: долгое нажатие на карточку. */
private suspend fun deleteMeal(context: android.content.Context, id: String) {
    val token = FitterRepository.token(context) ?: return
    runCatching { com.sailxx.fitter.data.Api.mealDelete(token, FitterRepository.today(context), id) }
    FitterRepository.refresh(context)
}
private val Tile = RoundedCornerShape(22.dp)
private val MONTHS = listOf("января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря")
private val MON = listOf("янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек")
private val WD = listOf("Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс")
private val WDF = listOf("понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье")
private const val CUP = 250

private fun n(x: Int) = String.format(Locale("ru"), "%,d", x).replace(' ', ' ')
private fun liters(ml: Int) = (Math.round(ml / 10.0) / 100.0).toString().removeSuffix(".0").replace('.', ',')
private fun kg(x: Double) = (Math.round(x * 10) / 10.0).toString().removeSuffix(".0").replace('.', ',')
private fun short(date: String) = runCatching { LocalDate.parse(date) }.getOrNull()?.let { "${it.dayOfMonth} ${MON[it.monthValue - 1]}" } ?: date

/** Фон плитки: цвет показателя, приглушённый под тему. */
private fun tint(c: Color, dark: Boolean) = c.copy(alpha = if (dark) 0.15f else 0.13f)
private fun track(dark: Boolean) = if (dark) Color(0x21FFFFFF) else Color(0x1213201A)
/** Подпись на тонированной плитке: в светлой теме темнее, чтобы читалась. */
private fun ink(c: Color, dark: Boolean, light: Color) = if (dark) c else light

/** Экран дня в стиле «Ночь»: остаток калорий с кольцом, плитки БЖУ, воды и таблеток, вес и еда с картинками. */
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
        modifier = Modifier.fillMaxSize().screenBg(),
    ) {
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 130.dp)) {
            item {
                Header(s, day, onRefresh = { scope.launch { FitterRepository.refresh(context) } }, onBot = { openUrl(context, BOT_URL) },
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
            item { CalorieTile(s) }
            item {
                Row(Modifier.padding(start = Side, end = Side, top = Gap), horizontalArrangement = Arrangement.spacedBy(Gap)) {
                    MacroTile(R.drawable.ic_bolt, "белков", s.p, s.targets.p, Palette.MacroP, Modifier.weight(1f), 60)
                    MacroTile(R.drawable.ic_wheat, "углев.", s.c, s.targets.c, Palette.MacroC, Modifier.weight(1f), 120)
                    MacroTile(R.drawable.ic_drop, "жиров", s.f, s.targets.f, Palette.MacroF, Modifier.weight(1f), 180)
                }
            }
            macroHint(s, day)?.let { (text, kind) -> item { TipTile(text, kind) } }
            item {
                WaterTile(s, Modifier.padding(start = Side, end = Side, top = Gap).fillMaxWidth()) { delta -> scope.launch { FitterRepository.addWater(context, delta) } }
            }
            day?.takeIf { it.pills.isNotEmpty() }?.let { d -> item { PillsTile(d, Modifier.padding(start = Side, end = Side, top = Gap).fillMaxWidth()) } }
            day?.weights?.takeIf { it.isNotEmpty() }?.let { w -> item { WeightTile(w) } }
            item {
                val meals = day?.meals.orEmpty()
                BlockTitle("Недавно добавлено", meals.takeIf { it.isNotEmpty() }?.let { "${n(it.sumOf { m -> m.kcal })} ккал" })
            }
            val meals = day?.meals.orEmpty()
            if (meals.isEmpty()) item { EmptyMeals() } else items(meals.reversed(), key = { it.id }) { m ->
                MealCard(m) { scope.launch { deleteMeal(context, m.id) } }
            }
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

/** Заголовок «Сегодня», справа календарь (раскрывает неделю) и серия дней. */
@Composable
private fun Header(s: Summary?, day: Day?, onRefresh: () -> Unit, onBot: () -> Unit, onLogout: () -> Unit, onSettings: () -> Unit) {
    val t = LocalTokens.current
    var week by rememberSaveable { mutableStateOf(false) }
    val date = s?.date?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
    Column(Modifier.fillMaxWidth().statusBarsPadding().padding(start = Side, end = 16.dp, top = 14.dp, bottom = 4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Сегодня", fontSize = 34.sp, fontWeight = FontWeight.ExtraBold, color = t.text, letterSpacing = (-0.8).sp, lineHeight = 38.sp)
                Text(
                    date?.let { "${WDF[it.dayOfWeek.value - 1]}, ${it.dayOfMonth} ${MONTHS[it.monthValue - 1]}" } ?: "FITTER",
                    fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = t.hint,
                )
            }
            var menu by remember { mutableStateOf(false) }
            Box {
                HeaderChip(Modifier.size(40.dp), active = week, onClick = { week = !week }, onLongClick = { menu = true }) {
                    Icon(painterResource(R.drawable.ic_nav_calendar), "Неделя", Modifier.size(19.dp), tint = if (week) Palette.HeroInk else t.text)
                }
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                    DropdownMenuItem(text = { Text("Обновить") }, onClick = { menu = false; onRefresh() })
                    DropdownMenuItem(text = { Text("Настройки") }, onClick = { menu = false; onSettings() })
                    DropdownMenuItem(text = { Text("Открыть бота") }, onClick = { menu = false; onBot() })
                    DropdownMenuItem(text = { Text("Выйти") }, onClick = { menu = false; onLogout() })
                }
            }
            val streak = s?.streak ?: 0
            if (streak > 0) {
                Spacer(Modifier.width(8.dp))
                HeaderChip(Modifier.height(40.dp).padding(horizontal = 13.dp)) {
                    Text("🔥 $streak", fontSize = 16.sp, fontWeight = FontWeight.ExtraBold, color = t.text)
                }
            }
        }
        AnimatedVisibility(week && day?.week?.size == 7, enter = expandVertically() + fadeIn(), exit = shrinkVertically() + fadeOut()) {
            day?.let { WeekRow(it.week, it.date, it.today, s?.targets?.kcal ?: 0) }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun HeaderChip(
    modifier: Modifier,
    active: Boolean = false,
    onClick: (() -> Unit)? = null,
    onLongClick: (() -> Unit)? = null,
    content: @Composable () -> Unit,
) {
    val t = LocalTokens.current
    val shape = RoundedCornerShape(20.dp)
    Box(
        Modifier
            .then(if (t.shadow && !active) Modifier.shadow(6.dp, shape, spotColor = Color(0x2210283C), ambientColor = Color(0x1110283C)) else Modifier)
            .clip(shape)
            .background(if (active) Palette.G1 else chipColor())
            .then(if (onClick != null) Modifier.combinedClickable(onClick = onClick, onLongClick = onLongClick) else Modifier)
            .then(modifier),
        contentAlignment = Alignment.Center,
    ) { content() }
}

/** Неделя Пн–Вс: точка под днём — в норме, меньше или больше нормы. */
@Composable
private fun WeekRow(week: List<WeekDay>, sel: String, today: String, goal: Int) {
    val t = LocalTokens.current
    Row(Modifier.fillMaxWidth().padding(top = 14.dp, bottom = 2.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        week.forEachIndexed { i, w ->
            val isSel = w.date == sel
            val dot = when {
                w.meals == 0 || goal == 0 -> Color.Transparent
                w.kcal > goal * 1.1 -> Palette.OverDot
                w.kcal >= goal * 0.9 -> if (isSel) Palette.HeroInk else Palette.G1
                else -> if (isSel) Palette.HeroInk.copy(alpha = 0.4f) else track(t.dark).copy(alpha = 0.5f)
            }
            Column(
                Modifier.weight(1f).clip(RoundedCornerShape(14.dp)).background(if (isSel) Palette.G1 else Color.Transparent).padding(vertical = 7.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                val alpha = if (w.date > today) 0.4f else 1f
                Text(WD[i], fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = (if (isSel) Palette.HeroSub else t.hint).copy(alpha = alpha))
                Text(
                    w.date.takeLast(2).trimStart('0'), fontSize = 17.sp, fontWeight = FontWeight.ExtraBold,
                    color = (if (isSel) Palette.HeroInk else t.text).copy(alpha = alpha),
                    textDecoration = if (w.date == today && !isSel) TextDecoration.Underline else null,
                )
                Spacer(Modifier.height(2.dp))
                Box(Modifier.size(6.dp).background(dot, CircleShape))
            }
        }
    }
}

// ───────────────────────────── Плитки ─────────────────────────────

/** Кольцо прогресса: дуга набегает от нуля при открытии и плавно меняется дальше. */
@Composable
private fun ProgressRing(pct: Float, color: Color, size: Dp, stroke: Dp, delay: Int = 0, trackColor: Color? = null, content: @Composable () -> Unit) {
    val t = LocalTokens.current
    val arc = remember { Animatable(0f) }
    LaunchedEffect(pct) { arc.animateTo(pct.coerceIn(0f, 1f), tween(1100, delayMillis = delay, easing = Ease)) }
    Box(Modifier.size(size), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val sw = stroke.toPx()
            val tl = Offset(sw / 2, sw / 2)
            val box = Size(this.size.width - sw, this.size.height - sw)
            drawArc(trackColor ?: track(t.dark), 0f, 360f, false, tl, box, style = Stroke(sw))
            if (arc.value > 0f) drawArc(color, -90f, 360f * arc.value, false, tl, box, style = Stroke(sw, cap = StrokeCap.Butt))
        }
        content()
    }
}

/** Калории как в Cal AI: крупный остаток слева, кольцо с огоньком справа. */
@Composable
private fun CalorieTile(s: Summary) {
    val t = LocalTokens.current
    val goal = s.targets.kcal
    val left = s.kcalLeft
    val over = left < 0
    val count = remember { Animatable(0f) }
    LaunchedEffect(left) { count.animateTo(abs(left).toFloat(), tween(1100, easing = Ease)) }
    Row(
        Modifier.padding(start = Side, end = Side, top = 10.dp).rise(0).fillMaxWidth()
            .shadow(18.dp, CardShape, spotColor = Color(0xFF1ED38A), ambientColor = Color(0x661ED38A))
            .clip(CardShape)
            .background(Brush.linearGradient(listOf(Color(0xFF5BEF5E), Color(0xFF22D97A), Color(0xFF2CD3B4)), start = Offset.Zero, end = Offset.Infinite))
            .drawBehind { drawGlow(); drawGrain() }
            .padding(start = 24.dp, end = 18.dp, top = 20.dp, bottom = 20.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                (if (over) "+" else "") + n(count.value.roundToInt()), fontSize = 50.sp, fontWeight = FontWeight.ExtraBold,
                color = Color.White, letterSpacing = (-1.8).sp, lineHeight = 52.sp, maxLines = 1,
            )
            Text(if (over) "Ккал сверх нормы" else "Ккал осталось", fontSize = 15.sp, fontWeight = FontWeight.Bold, color = Color.White.copy(alpha = 0.95f))
            Spacer(Modifier.height(4.dp))
            Text("${n(s.kcal)} из ${n(goal)} съедено", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = Color.White.copy(alpha = 0.78f))
        }
        Spacer(Modifier.width(12.dp))
        ProgressRing(s.progress, if (over) Palette.OverDark else Color.White, 118.dp, 15.dp, trackColor = Color.White.copy(alpha = 0.28f)) {
            Box(Modifier.size(42.dp).background(Color.White.copy(alpha = 0.24f), CircleShape), contentAlignment = Alignment.Center) {
                Image(painterResource(R.drawable.ic_kcal), null, Modifier.size(22.dp))
            }
        }
    }
}

/** Светлое пятно сверху слева — как блик на глянцевом зелёном. */
private fun androidx.compose.ui.graphics.drawscope.DrawScope.drawGlow() {
    val c = Offset(size.width * 0.18f, size.height * 0.05f)
    drawCircle(Brush.radialGradient(listOf(Color(0x66E9FFD8), Color(0x00E9FFD8)), center = c, radius = size.width * 0.6f), radius = size.width * 0.6f, center = c)
}

/** Мелкое искристое зерно: точки в одних и тех же местах при каждой отрисовке. */
private val GRAIN = java.util.Random(7).let { r -> List(150) { floatArrayOf(r.nextFloat(), r.nextFloat(), 0.1f + r.nextFloat() * 0.22f, 0.4f + r.nextFloat() * 0.6f) } }
private fun androidx.compose.ui.graphics.drawscope.DrawScope.drawGrain() {
    val d = density
    GRAIN.forEach { (x, y, a, r) -> drawCircle(Color.White.copy(alpha = a), r * d * 0.75f, Offset(x * size.width, y * size.height)) }
}

/** БЖУ как в Cal AI: сверху число и подпись, ниже кольцо с иконкой в тёмном кружке. */
@Composable
private fun MacroTile(@DrawableRes icon: Int, gen: String, value: Int, max: Int, color: Color, modifier: Modifier, delay: Int) {
    val t = LocalTokens.current
    val left = max - value
    val ok = max > 0 && value >= max * 0.9 && value <= max * 1.1
    val over = max > 0 && !ok && left < 0
    // Лёгкий оттенок цвета нутриента поверх карточки: белки, углеводы и жиры различаются с первого взгляда
    Column(modifier.rise(delay).calCard().background(color.copy(alpha = if (t.dark) 0.13f else 0.10f)).padding(start = 14.dp, end = 10.dp, top = 16.dp, bottom = 16.dp)) {
        Text(
            when { max == 0 || ok -> "$value г"; over -> "${-left} г"; else -> "$left г" },
            fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, color = t.text, maxLines = 1, letterSpacing = (-0.3).sp,
        )
        Text(
            when { max == 0 -> gen.replaceFirstChar { it.uppercase() }; ok -> "в норме"; over -> "${gen.replaceFirstChar { it.uppercase() }} сверх"; else -> "${gen.replaceFirstChar { it.uppercase() }} ост." },
            fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 1,
            color = when { ok -> if (t.dark) Palette.G1 else Palette.G3; over -> Palette.Danger; else -> t.text.copy(alpha = 0.8f) },
        )
        Spacer(Modifier.height(14.dp))
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
            ProgressRing(if (max > 0) value.toFloat() / max else 0f, if (over) Palette.Danger else color, 66.dp, 9.dp, delay) {
                Box(Modifier.size(28.dp).background(color.copy(alpha = 0.18f), CircleShape), contentAlignment = Alignment.Center) {
                    Icon(painterResource(icon), null, Modifier.size(15.dp), tint = color)
                }
            }
        }
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

/** Совет по БЖУ: зелёная плитка с искрой, при перекосе — красная. */
@Composable
private fun TipTile(text: String, kind: String) {
    val t = LocalTokens.current
    val warn = kind == "warn"
    Row(
        Modifier.padding(start = Side, end = Side, top = Gap).rise(200).fillMaxWidth().calCard().padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(36.dp).clip(RoundedCornerShape(12.dp))
                .background(Brush.linearGradient(if (warn) listOf(Palette.OverLight, Palette.OverDark) else listOf(Palette.G1, Palette.G2))),
            contentAlignment = Alignment.Center,
        ) { Icon(painterResource(R.drawable.ic_nav_tips), null, Modifier.size(20.dp), tint = Color.White) }
        Spacer(Modifier.width(12.dp))
        Text(text, fontSize = 14.sp, lineHeight = 19.sp, fontWeight = FontWeight.Medium, color = t.text)
    }
}

/** Вода: синяя плитка, «+» добавляет стакан, долгое нажатие убирает. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun WaterTile(s: Summary, modifier: Modifier, onWater: (Int) -> Unit) {
    val t = LocalTokens.current
    val c = Palette.WaterTile
    val label = ink(c, t.dark, Palette.WaterInk)
    val all = maxOf(1, (s.waterGoal + CUP - 1) / CUP)
    val cells = minOf(all, 10)
    // Число и стаканчики плавно добегают до нового значения, а не перескакивают
    val shown by animateIntAsState(s.water, tween(450, easing = Ease), label = "water")
    val on = if (s.waterGoal > 0) minOf(cells, shown * cells / s.waterGoal) else 0
    Column(modifier.rise(240).calCard().padding(18.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(44.dp).background(c.copy(alpha = 0.16f), CircleShape), contentAlignment = Alignment.Center) {
                Icon(painterResource(R.drawable.ic_nav_glass), null, Modifier.size(22.dp), tint = label)
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    buildAnnotatedString {
                        append(liters(shown))
                        withStyle(SpanStyle(fontSize = 14.sp, color = t.hint, fontWeight = FontWeight.SemiBold)) { append(" / ${liters(s.waterGoal)} л") }
                    },
                    fontSize = 24.sp, fontWeight = FontWeight.ExtraBold, color = t.text, letterSpacing = (-0.5).sp, maxLines = 1,
                )
                Text("Вода · держи «+», чтобы убрать стакан", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = t.hint, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Spacer(Modifier.width(8.dp))
            Box(
                Modifier.size(44.dp).clip(CircleShape).background(c)
                    .combinedClickable(onClick = { onWater(CUP) }, onLongClick = { if (s.water > 0) onWater(-CUP) }),
                contentAlignment = Alignment.Center,
            ) { Icon(painterResource(R.drawable.ic_nav_plus), "Добавить стакан", Modifier.size(20.dp), tint = Color(0xFF04263F)) }
        }
        Spacer(Modifier.height(14.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            repeat(cells) { i -> Box(Modifier.weight(1f).height(10.dp).background(if (i < on) c else track(t.dark), RoundedCornerShape(5.dp))) }
        }
    }
}

/** Таблетки: фиолетовая плитка, нажатие на строку отмечает приём. */
@Composable
private fun PillsTile(day: Day, modifier: Modifier) {
    val t = LocalTokens.current
    val c = Palette.PillTile
    val label = ink(c, t.dark, Palette.PillInk)
    val taken = day.pills.count { it.s == "taken" }
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val bar = remember { Animatable(0f) }
    LaunchedEffect(taken) { bar.animateTo(taken.toFloat() / day.pills.size, tween(800, easing = Ease)) }
    Column(modifier.rise(280).calCard().padding(start = 18.dp, end = 18.dp, top = 18.dp, bottom = 8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(44.dp).background(c.copy(alpha = 0.16f), CircleShape), contentAlignment = Alignment.Center) {
                Icon(painterResource(R.drawable.ic_nav_pill), null, Modifier.size(22.dp), tint = label)
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text("Таблетки", fontSize = 18.sp, fontWeight = FontWeight.ExtraBold, color = t.text)
                Text("$taken из ${day.pills.size} принято", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = t.hint)
            }
        }
        Box(Modifier.padding(top = 14.dp, bottom = 4.dp).fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)).background(track(t.dark))) {
            Box(Modifier.fillMaxHeight().fillMaxWidth(bar.value).background(c, RoundedCornerShape(3.dp)))
        }
        day.pills.forEachIndexed { i, p ->
            val isTaken = p.s == "taken"
            if (i > 0) Box(Modifier.padding(start = 40.dp).fillMaxWidth().height(1.dp).background(t.line))
            // Нажатие отмечает таблетку принятой, повторное — снимает отметку
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
                    .clickable { scope.launch { FitterRepository.markPill(ctx, p.id, p.time, if (isTaken) "" else "taken") } }
                    .padding(vertical = 11.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    Modifier.size(28.dp).background(if (isTaken) c else Color.Transparent, CircleShape)
                        .border(2.dp, if (isTaken) c else t.hint.copy(alpha = 0.45f), CircleShape),
                    contentAlignment = Alignment.Center,
                ) { if (isTaken) Text("✓", color = Color(0xFF1A1033), fontSize = 15.sp, fontWeight = FontWeight.ExtraBold) else if (p.s == "skip") Text("–", color = t.hint) }
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        p.name, fontSize = 15.sp, fontWeight = FontWeight.Bold, lineHeight = 19.sp,
                        color = if (isTaken) t.hint else t.text, textDecoration = if (isTaken) TextDecoration.LineThrough else null,
                    )
                    if (p.dose.isNotBlank()) Text(p.dose, fontSize = 12.sp, color = t.hint)
                }
                Spacer(Modifier.width(10.dp))
                Text(
                    p.time, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = t.hint,
                    modifier = Modifier.background(t.fill, RoundedCornerShape(10.dp)).padding(horizontal = 9.dp, vertical = 4.dp),
                )
            }
        }
    }
}

/** Вес: последнее значение, изменение и линия с заливкой. */
@Composable
private fun WeightTile(ws: List<WeightPoint>) {
    val t = LocalTokens.current
    val last = ws.last()
    val diff = Math.round((last.kg - ws.first().kg) * 10) / 10.0
    val line = if (t.dark) Palette.G1 else Palette.G2
    Row(
        Modifier.padding(start = Side, end = Side, top = Gap).rise(320).fillMaxWidth().calCard().padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(painterResource(R.drawable.ic_nav_scale), null, Modifier.size(16.dp), tint = t.hint)
                Spacer(Modifier.width(6.dp))
                Text("Вес", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = t.hint)
            }
            Text("${kg(last.kg)} кг", fontSize = 26.sp, fontWeight = FontWeight.ExtraBold, color = t.text, letterSpacing = (-0.5).sp)
            if (ws.size > 1) Text(
                (if (diff > 0) "+" else if (diff < 0) "−" else "") + "${kg(abs(diff))} кг с ${short(ws.first().date)}",
                fontSize = 13.sp, fontWeight = FontWeight.ExtraBold, color = if (t.dark) Palette.G1 else Palette.G3,
            )
        }
        Spacer(Modifier.width(16.dp))
        if (ws.size > 1) Canvas(Modifier.weight(1f).height(60.dp)) {
            val min = ws.minOf { it.kg }
            val span = (ws.maxOf { it.kg } - min).takeIf { it > 0 } ?: 1.0
            val pad = 5.dp.toPx()
            val pts = ws.mapIndexed { i, w ->
                Offset(i / (ws.size - 1f) * (size.width - pad) , (pad + (1 - (w.kg - min) / span) * (size.height - pad * 2)).toFloat())
            }
            val stroke = Path().apply { pts.forEachIndexed { i, p -> if (i == 0) moveTo(p.x, p.y) else lineTo(p.x, p.y) } }
            val fill = Path().apply { addPath(stroke); lineTo(pts.last().x, size.height); lineTo(0f, size.height); close() }
            drawPath(fill, Brush.verticalGradient(listOf(line.copy(alpha = 0.35f), line.copy(alpha = 0f))))
            drawPath(stroke, line, style = Stroke(2.5.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
            drawCircle(line, 4.dp.toPx(), pts.last())
        }
    }
}

// ───────────────────────────── Еда ─────────────────────────────

/** Картинка блюда: эмодзи по названию на цветной подложке. Фото на сервере не хранятся. */
private val FOOD = listOf(
    listOf("салат", "цезар") to "🥗", listOf("суп", "борщ", "щи", "солянк", "бульон", "рамен") to "🍲",
    listOf("каш", "овсян", "гречк", "мюсли", "гранол") to "🥣", listOf("яйц", "омлет", "яичниц") to "🍳",
    listOf("кофе", "капуч", "латте", "американо", "раф") to "☕", listOf("чай") to "🍵",
    listOf("пицц") to "🍕", listOf("бургер", "шаурм", "хот-дог", "хотдог") to "🍔",
    listOf("паст", "макарон", "спагет", "лапш") to "🍝", listOf("рис", "плов", "ризотто") to "🍚",
    listOf("суши", "ролл", "сашими") to "🍣", listOf("рыб", "лосос", "сёмг", "семг", "тунец", "форел", "треск") to "🐟",
    listOf("кур", "индей", "крыл", "наггетс") to "🍗", listOf("мяс", "говя", "свин", "стейк", "котлет", "фарш", "шашлык") to "🥩",
    listOf("пельмен", "вареник", "манты", "хинкал") to "🥟", listOf("блин", "сырник", "оладь", "панкейк") to "🥞",
    listOf("творог", "йогурт", "кефир", "молок", "ряженк", "протеин") to "🥛", listOf("сыр") to "🧀",
    listOf("хлеб", "бутер", "тост", "сэндв", "лаваш", "батон") to "🥪", listOf("банан") to "🍌", listOf("яблок") to "🍎",
    listOf("ягод", "клубник", "черник", "малин") to "🍓", listOf("фрукт", "апельсин", "мандарин", "груш", "виноград") to "🍊",
    listOf("орех", "миндал", "арахис") to "🥜", listOf("шоколад", "конфет", "торт", "печень", "десерт", "пирож", "мороже") to "🍰",
    listOf("картоф", "пюре", "фри") to "🥔", listOf("овощ", "брокк", "огур", "помидор", "томат", "морков") to "🥦",
    listOf("сок", "смузи", "лимонад", "кола", "напит") to "🧃",
    listOf("завтрак") to "🍳", listOf("обед") to "🍲", listOf("ужин") to "🍽", listOf("перекус") to "🍎",
)
private val THUMB = mapOf(
    "🥗" to 0, "🥦" to 0, "🍵" to 0,
    "🥣" to 1, "🍚" to 1, "🥞" to 1, "🥔" to 1, "🥟" to 1, "🍳" to 1, "🧀" to 1, "🍌" to 1, "🥜" to 1,
    "🥛" to 2, "🍰" to 2,
    "🍗" to 3, "🥩" to 3, "🍔" to 3, "🍕" to 3, "🍝" to 3, "🍲" to 3, "🍊" to 3,
    "🍓" to 4, "🍎" to 4, "🍣" to 4,
    "🐟" to 5, "🧃" to 5, "☕" to 6, "🥪" to 6,
)
private val GRADS = listOf(
    listOf(Color(0xFFB9E39A), Color(0xFF4F8F3E)), // зелень
    listOf(Color(0xFFFBE6BD), Color(0xFFC08A45)), // крупы
    listOf(Color(0xFFF5F2FF), Color(0xFF9F92D0)), // молочное
    listOf(Color(0xFFFFCBA0), Color(0xFFC9592E)), // горячее
    listOf(Color(0xFFFFC2B8), Color(0xFFCF4A48)), // ягоды
    listOf(Color(0xFFCDEBFF), Color(0xFF3F82CF)), // рыба, напитки
    listOf(Color(0xFFF1D7B4), Color(0xFF8F5B33)), // выпечка, кофе
)
private fun foodLook(title: String): Pair<String, List<Color>> {
    val low = title.lowercase()
    val emoji = FOOD.firstOrNull { (keys, _) -> keys.any { it in low } }?.second ?: "🍽"
    return emoji to GRADS[THUMB[emoji] ?: 1]
}

@Composable
private fun FoodThumb(title: String, size: Dp) {
    val (emoji, colors) = remember(title) { foodLook(title) }
    Box(
        Modifier.size(size).clip(RoundedCornerShape(18.dp)).background(Brush.linearGradient(colors)),
        contentAlignment = Alignment.Center,
    ) {
        Box(Modifier.matchParentSize().background(Brush.linearGradient(listOf(Color(0x38FFFFFF), Color(0x00FFFFFF)), end = Offset(160f, 160f))))
        Text(emoji, fontSize = (size.value * 0.46f).sp)
    }
}

@Composable
private fun MacroMini(@DrawableRes icon: Int, color: Color, grams: Int) {
    val t = LocalTokens.current
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(painterResource(icon), null, Modifier.size(14.dp), tint = color)
        Spacer(Modifier.width(3.dp))
        Text("$grams г", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = t.hint)
    }
}

/** Приём пищи: картинка слева, название и время, калории, БЖУ. Долгое нажатие — удалить. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun MealCard(m: Meal, onDelete: () -> Unit) {
    val t = LocalTokens.current
    var ask by remember { mutableStateOf(false) }
    var edit by remember { mutableStateOf(false) }
    if (edit) MealSheet(m, onClose = { edit = false }, onDeleteMeal = onDelete)
    if (ask) {
        AlertDialog(
            onDismissRequest = { ask = false },
            title = { Text("Удалить «${m.title}»?") },
            text = { Text("${m.kcal} ккал уберутся из дневника — и здесь, и в боте.") },
            confirmButton = { TextButton(onClick = { ask = false; onDelete() }) { Text("Удалить", color = Palette.Danger) } },
            dismissButton = { TextButton(onClick = { ask = false }) { Text("Отмена") } },
        )
    }
    Row(
        Modifier.padding(start = Side, end = Side, bottom = Gap).rise(80).fillMaxWidth().calCard()
            .combinedClickable(onClick = { edit = true }, onLongClick = { ask = true }).padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        FoodThumb(m.title, 86.dp)
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(m.title, fontSize = 16.sp, fontWeight = FontWeight.ExtraBold, color = t.text, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                Spacer(Modifier.width(6.dp))
                Text(
                    m.time, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = t.hint,
                    modifier = Modifier.background(t.fill, RoundedCornerShape(10.dp)).padding(horizontal = 8.dp, vertical = 3.dp),
                )
            }
            Spacer(Modifier.height(6.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Image(painterResource(R.drawable.ic_kcal), null, Modifier.size(18.dp))
                Spacer(Modifier.width(5.dp))
                Text("${n(m.kcal)} ккал", fontSize = 17.sp, fontWeight = FontWeight.ExtraBold, color = t.text)
            }
            Spacer(Modifier.height(6.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                MacroMini(R.drawable.ic_bolt, Palette.MacroP, m.p)
                MacroMini(R.drawable.ic_wheat, Palette.MacroC, m.c)
                MacroMini(R.drawable.ic_drop, Palette.MacroF, m.f)
            }
        }
    }
}

@Composable
private fun EmptyMeals() {
    val t = LocalTokens.current
    Column(
        Modifier.padding(horizontal = Side).rise(120).fillMaxWidth().calCard().padding(horizontal = 16.dp, vertical = 26.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        FoodThumb("салат", 60.dp)
        Spacer(Modifier.height(10.dp))
        Text("Пока пусто", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = t.text)
        Text("Сфотографируй еду — она появится здесь и на виджетах", color = t.hint, textAlign = TextAlign.Center, fontSize = 14.sp)
    }
}

