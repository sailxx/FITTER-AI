package com.sailxx.fitter.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sailxx.fitter.R
import com.sailxx.fitter.data.CATALOG
import com.sailxx.fitter.data.Effort
import com.sailxx.fitter.data.Exercise
import com.sailxx.fitter.data.FitterRepository
import com.sailxx.fitter.data.GROUPS
import com.sailxx.fitter.data.Kind
import com.sailxx.fitter.data.WEx
import com.sailxx.fitter.data.WSet
import com.sailxx.fitter.data.Workout
import com.sailxx.fitter.data.WorkoutStore
import com.sailxx.fitter.data.label
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import java.time.LocalDate
import kotlin.math.roundToInt
import kotlin.math.sin

private val Card = RoundedCornerShape(20.dp)
private val MONTHS = listOf("января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря")
private val WEEKDAYS = listOf("пн", "вт", "ср", "чт", "пт", "сб", "вс")

/** «Сегодня», «Вчера» или «15 октября, ср». */
private fun dateLabel(date: String, today: String): String {
    val d = runCatching { LocalDate.parse(date) }.getOrNull() ?: return date
    val t = runCatching { LocalDate.parse(today) }.getOrNull()
    return when (d) {
        t -> "Сегодня"
        t?.minusDays(1) -> "Вчера"
        else -> "${d.dayOfMonth} ${MONTHS[d.monthValue - 1]}, ${WEEKDAYS[d.dayOfWeek.value - 1]}"
    }
}

private fun effortColor(e: Effort) = when (e) {
    Effort.EASY -> Palette.G2
    Effort.MEDIUM -> Palette.Fat
    Effort.HARD -> Palette.Danger
}

private fun spaced(n: Int) = "%,d".format(n).replace(',', ' ')

// ───────────── Черновик тренировки в редакторе ─────────────
// Числа хранятся строками, как их вводят. Смысл полей a и b зависит от типа упражнения:
// W — кг и повторы, R — повторы, T — минуты и секунды, C — минуты и км.

private class SetDraft(a: String = "", b: String = "") {
    var a by mutableStateOf(a)
    var b by mutableStateOf(b)
}

private class ExDraft(val id: String, val name: String, val kind: Kind, effort: Effort? = null) {
    var effort by mutableStateOf(effort)
    val sets = mutableStateListOf<SetDraft>()
}

private class Draft(val id: String, date: String, title: String) {
    var date by mutableStateOf(date)
    var title by mutableStateOf(title)
    val ex = mutableStateListOf<ExDraft>()
}

private fun fmt(x: Double) = if (x <= 0) "" else if (x == x.toLong().toDouble()) x.toLong().toString() else x.toString()
private fun int(x: Int) = if (x <= 0) "" else x.toString()
private fun dbl(s: String) = s.replace(',', '.').toDoubleOrNull()?.takeIf { it > 0 } ?: 0.0
private fun num(s: String) = dbl(s).roundToInt()

private fun SetDraft.toSet(kind: Kind): WSet = when (kind) {
    Kind.W -> WSet(w = dbl(a), r = num(b))
    Kind.R -> WSet(r = num(a))
    Kind.T -> WSet(s = num(a) * 60 + num(b))
    Kind.C -> WSet(s = num(a) * 60, km = dbl(b))
}

private fun WSet.toDraft(kind: Kind): SetDraft = when (kind) {
    Kind.W -> SetDraft(fmt(w), int(r))
    Kind.R -> SetDraft(int(r))
    Kind.T -> SetDraft(int(s / 60), int(s % 60))
    Kind.C -> SetDraft(int(s / 60), fmt(km))
}

private fun SetDraft.empty(kind: Kind) = toSet(kind).let { it.w == 0.0 && it.r == 0 && it.s == 0 && it.km == 0.0 }

private fun Draft.toWorkout() = Workout(
    id, date, title.trim(),
    ex.map { e -> WEx(e.id, e.name, e.kind, e.effort, e.sets.filter { !it.empty(e.kind) }.map { it.toSet(e.kind) }) },
)

private fun draftOf(w: Workout) = Draft(w.id, w.date, w.title).apply {
    w.ex.forEach { e -> ex.add(ExDraft(e.id, e.name, e.kind, e.effort).apply { sets.addAll(e.sets.map { it.toDraft(e.kind) }) }) }
}

/** Раздел «Тренировки»: дневник занятий и редактор тренировки. onEditing — прятать нижнюю панель, пока открыт редактор. */
@Composable
fun WorkoutsScreen(onEditing: (Boolean) -> Unit) {
    val context = LocalContext.current
    val st by WorkoutStore.state.collectAsState()
    var draft by remember { mutableStateOf<Draft?>(null) }
    LaunchedEffect(Unit) {
        WorkoutStore.load(context)
        WorkoutStore.refresh(context)
    }
    LaunchedEffect(draft != null) { onEditing(draft != null) }
    val today = FitterRepository.today(context)
    val d = draft
    if (d != null) {
        WorkoutEditor(d, st.list, st.custom, today, onClose = { draft = null })
    } else {
        WorkoutList(st.list, st.loaded, today, onNew = { draft = Draft("", today, "") }, onOpen = { draft = draftOf(it) })
    }
}

@Composable
private fun WorkoutList(list: List<Workout>, loaded: Boolean, today: String, onNew: () -> Unit, onOpen: (Workout) -> Unit) {
    val t = LocalTokens.current
    val weekFrom = runCatching { LocalDate.parse(today).minusDays(6).toString() }.getOrDefault(today)
    val week = list.count { it.date >= weekFrom }
    LazyColumn(Modifier.fillMaxSize().screenBg(), contentPadding = PaddingValues(bottom = 130.dp)) {
        item { ScreenHeader("Тренировки", "Подходы, веса и как далось каждое упражнение") }
        item {
            Row(Modifier.padding(horizontal = Side).padding(top = 10.dp).rise(0), horizontalArrangement = Arrangement.spacedBy(Gap)) {
                StatCard("$week", "за 7 дней", Modifier.weight(1f))
                StatCard("${list.size}", "всего", Modifier.weight(1f))
            }
        }
        item {
            Box(Modifier.padding(horizontal = Side).padding(top = Gap).rise(60)) { PrimaryButton("＋ Новая тренировка", onClick = onNew) }
        }
        if (list.isEmpty() && loaded) {
            item {
                Column(Modifier.fillMaxWidth().padding(32.dp).rise(120), horizontalAlignment = Alignment.CenterHorizontally) {
                    Image(painterResource(R.drawable.ic_muscle), null, Modifier.size(64.dp))
                    Spacer(Modifier.height(10.dp))
                    Text("Здесь будут твои тренировки", fontWeight = FontWeight.ExtraBold, color = t.text, fontSize = 17.sp)
                    Text(
                        "Выбирай упражнения из списка — в зале или дома, — записывай подходы и отмечай, как далось",
                        fontSize = 14.sp, color = t.hint, textAlign = TextAlign.Center,
                    )
                }
            }
        }
        itemsIndexed(list, key = { _, w -> w.id }) { i, w ->
            val head = i == 0 || list[i - 1].date != w.date
            Column(Modifier.padding(horizontal = Side).rise(60 + i.coerceAtMost(6) * 40)) {
                if (head) Text(
                    dateLabel(w.date, today), fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, color = t.text, letterSpacing = (-0.3).sp,
                    modifier = Modifier.padding(start = 2.dp, top = 26.dp, bottom = 12.dp),
                ) else Spacer(Modifier.height(Gap))
                WorkoutCard(w) { onOpen(w) }
            }
        }
    }
}

/** Счётчик тренировок: число крупно, подпись ниже. */
@Composable
private fun StatCard(value: String, label: String, modifier: Modifier) {
    val t = LocalTokens.current
    Row(modifier.calCard().padding(horizontal = 18.dp, vertical = 16.dp), verticalAlignment = Alignment.CenterVertically) {
        Image(painterResource(R.drawable.ic_muscle), null, Modifier.size(30.dp))
        Spacer(Modifier.width(12.dp))
        Column {
            Text(value, fontSize = 24.sp, fontWeight = FontWeight.ExtraBold, color = t.text, lineHeight = 26.sp)
            Text(label, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = t.hint)
        }
    }
}

@Composable
private fun WorkoutCard(w: Workout, onClick: () -> Unit) {
    val t = LocalTokens.current
    Column(
        Modifier.fillMaxWidth().calCard().clickable(onClick = onClick).padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(w.title.ifBlank { w.ex.take(2).joinToString(" и ") { it.name } }, fontSize = 17.sp, fontWeight = FontWeight.ExtraBold, color = t.text, maxLines = 2, overflow = TextOverflow.Ellipsis)
        val meta = listOfNotNull(
            "${w.ex.size} упр.", "${w.sets} подх.", if (w.volume > 0) "${spaced(w.volume)} кг" else null,
        ).joinToString(" · ")
        Text(meta, fontSize = 13.sp, color = t.hint, fontWeight = FontWeight.Bold)
        w.ex.forEach { e ->
            Column {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(7.dp).background(e.effort?.let { effortColor(it) } ?: t.line, CircleShape))
                    Spacer(Modifier.width(8.dp))
                    Text(e.name, fontSize = 14.sp, fontWeight = FontWeight.Bold, color = t.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    e.effort?.let { Text("  " + it.emoji, fontSize = 12.sp) }
                }
                Text(
                    e.sets.joinToString(", ") { it.label(e.kind) }.ifEmpty { "—" },
                    fontSize = 13.sp, color = t.hint, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(start = 15.dp),
                )
            }
        }
    }
}

// ───────────── Редактор ─────────────

@Composable
private fun WorkoutEditor(d: Draft, history: List<Workout>, custom: List<Exercise>, today: String, onClose: () -> Unit) {
    val t = LocalTokens.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val existing = d.id.isNotBlank()
    var picking by remember { mutableStateOf(d.ex.isEmpty() && !existing) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var askLeave by remember { mutableStateOf(false) }
    var askDelete by remember { mutableStateOf(false) }

    BackHandler { if (d.ex.isNotEmpty()) askLeave = true else onClose() }

    fun save() = scope.launch {
        val w = d.toWorkout()
        if (w.ex.isEmpty()) { error = "Добавь хотя бы одно упражнение"; return@launch }
        busy = true; error = null
        try {
            WorkoutStore.save(context, w)
            onClose()
        } catch (e: CancellationException) { throw e } catch (e: Exception) {
            error = "Не получилось сохранить — нет связи с сервером"
        }
        busy = false
    }

    fun delete() = scope.launch {
        busy = true
        try {
            WorkoutStore.delete(context, d.toWorkout())
            onClose()
        } catch (e: CancellationException) { throw e } catch (e: Exception) {
            error = "Не получилось удалить — нет связи с сервером"
        }
        busy = false
    }

    /** Добавить упражнение: подходы как в прошлый раз, иначе один пустой. */
    fun add(e: Exercise) {
        val last = history.firstOrNull { w -> w.id != d.id && w.ex.any { it.id == e.id } }?.ex?.first { it.id == e.id }
        d.ex.add(ExDraft(e.id, e.name, e.kind).apply {
            if (last != null && last.sets.isNotEmpty()) sets.addAll(last.sets.map { it.toDraft(e.kind) }) else sets.add(SetDraft())
        })
    }

    Box(Modifier.fillMaxSize().background(t.bg)) {
        LazyColumn(Modifier.fillMaxSize().imePadding(), contentPadding = PaddingValues(bottom = 110.dp)) {
            item {
                Row(Modifier.statusBarsPadding().padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    RoundIcon("←") { if (d.ex.isNotEmpty()) askLeave = true else onClose() }
                    Text(
                        if (existing) "Тренировка" else "Новая тренировка", fontSize = 24.sp, fontWeight = FontWeight.ExtraBold, color = t.text, letterSpacing = (-0.4).sp,
                        modifier = Modifier.weight(1f).padding(start = 12.dp),
                    )
                    if (existing) RoundIcon("🗑") { askDelete = true }
                }
            }
            item { DateRow(d, today) }
            item {
                OutlinedTextField(
                    value = d.title, onValueChange = { if (it.length <= 60) d.title = it },
                    modifier = Modifier.fillMaxWidth().padding(horizontal = Side, vertical = 10.dp),
                    placeholder = { Text("Название, например «Грудь и трицепс»", color = t.hint) },
                    singleLine = true, shape = RoundedCornerShape(20.dp),
                    colors = fieldColors(),
                )
            }
            itemsIndexed(d.ex, key = { i, e -> "$i-${e.id}" }) { i, e ->
                ExerciseCard(e, Modifier.padding(horizontal = Side, vertical = 6.dp), onRemove = { d.ex.removeAt(i) })
            }
            item {
                SoftButton("＋ Добавить упражнение", Modifier.padding(horizontal = Side, vertical = 8.dp).fillMaxWidth(), height = 54.dp) { picking = true }
            }
            error?.let { item { Text(it, color = Palette.Danger, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp)) } }
        }
        Box(Modifier.align(Alignment.BottomCenter).fillMaxWidth().background(t.bg).navigationBarsPadding().imePadding().padding(horizontal = Side, vertical = 12.dp)) {
            PrimaryButton(if (busy) "Сохраняю…" else "Сохранить тренировку") { if (!busy) save() }
        }
    }

    if (picking) ExercisePicker(custom, history, onPick = { add(it); picking = false }, onClose = { picking = false })
    if (askLeave) AlertDialog(
        onDismissRequest = { askLeave = false },
        containerColor = t.card,
        title = { Text("Выйти без сохранения?", color = t.text) },
        text = { Text("Изменения в этой тренировке пропадут", color = t.hint) },
        confirmButton = { TextButton({ askLeave = false; onClose() }) { Text("Выйти", color = Palette.Danger) } },
        dismissButton = { TextButton({ askLeave = false }) { Text("Остаться", color = t.text) } },
    )
    if (askDelete) AlertDialog(
        onDismissRequest = { askDelete = false },
        containerColor = t.card,
        title = { Text("Удалить тренировку?", color = t.text) },
        confirmButton = { TextButton({ askDelete = false; delete() }) { Text("Удалить", color = Palette.Danger) } },
        dismissButton = { TextButton({ askDelete = false }) { Text("Отмена", color = t.text) } },
    )
}

/** Дата тренировки: стрелками на день назад или вперёд, но не в будущее. */
@Composable
private fun DateRow(d: Draft, today: String) {
    val t = LocalTokens.current
    val date = runCatching { LocalDate.parse(d.date) }.getOrNull() ?: return
    val canNext = d.date < today
    Row(
        Modifier.padding(horizontal = Side).fillMaxWidth().calCard(RoundedCornerShape(50)).padding(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RoundIcon("‹") { d.date = date.minusDays(1).toString() }
        Text(dateLabel(d.date, today), fontWeight = FontWeight.ExtraBold, color = t.text, textAlign = TextAlign.Center, modifier = Modifier.weight(1f))
        Box(Modifier.graphicsLayer { alpha = if (canNext) 1f else 0.3f }) { RoundIcon("›") { if (canNext) d.date = date.plusDays(1).toString() } }
    }
}

@Composable
private fun RoundIcon(text: String, onClick: () -> Unit) {
    val t = LocalTokens.current
    Box(Modifier.size(40.dp).clip(CircleShape).background(t.fill).clickable(onClick = onClick), contentAlignment = Alignment.Center) {
        Text(text, fontSize = 20.sp, fontWeight = FontWeight.Bold, color = t.text)
    }
}

@Composable
private fun ExerciseCard(e: ExDraft, modifier: Modifier, onRemove: () -> Unit) {
    val t = LocalTokens.current
    Column(
        modifier.fillMaxWidth().calCard().padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(e.name, fontSize = 17.sp, fontWeight = FontWeight.ExtraBold, color = t.text)
                Text(e.kind.label, fontSize = 12.sp, color = t.hint)
            }
            Text("✕", color = t.hint, fontSize = 18.sp, modifier = Modifier.clip(CircleShape).clickable(onClick = onRemove).padding(8.dp))
        }
        // Как далось: нажатие ещё раз снимает отметку
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Effort.entries.forEach { ef ->
                val on = e.effort == ef
                val c = effortColor(ef)
                Row(
                    Modifier.weight(1f).height(40.dp).clip(RoundedCornerShape(50))
                        .background(if (on) c.copy(alpha = 0.16f) else t.fill)
                        .border(1.5.dp, if (on) c else Color.Transparent, RoundedCornerShape(50))
                        .clickable { e.effort = if (on) null else ef },
                    horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(ef.emoji, fontSize = 15.sp)
                    Spacer(Modifier.width(4.dp))
                    Text(ef.label, fontSize = 13.sp, fontWeight = if (on) FontWeight.ExtraBold else FontWeight.SemiBold, color = if (on) t.text else t.hint)
                }
            }
        }
        val (la, lb) = when (e.kind) {
            Kind.W -> "кг" to "повторы"
            Kind.R -> "повторы" to null
            Kind.T -> "мин" to "сек"
            Kind.C -> "мин" to "км"
        }
        e.sets.forEachIndexed { i, s ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(28.dp).background(t.fill, CircleShape), contentAlignment = Alignment.Center) {
                    Text("${i + 1}", fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, color = t.text)
                }
                Spacer(Modifier.width(10.dp))
                NumField(s.a, { s.a = it }, la, decimal = e.kind == Kind.W, modifier = Modifier.weight(1f))
                if (lb != null) {
                    Text(if (e.kind == Kind.W) "×" else if (e.kind == Kind.T) ":" else "·", color = t.hint, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 8.dp))
                    NumField(s.b, { s.b = it }, lb, decimal = e.kind == Kind.C, modifier = Modifier.weight(1f))
                }
                Text(
                    "✕", color = t.hint, fontSize = 14.sp,
                    modifier = Modifier.padding(start = 6.dp).clip(CircleShape).clickable { e.sets.removeAt(i) }.padding(8.dp),
                )
            }
        }
        // Новый подход — копия предыдущего: обычно меняют одно число
        Box(
            Modifier.fillMaxWidth().height(44.dp).clip(RoundedCornerShape(50)).background(t.fill)
                .clickable { e.sets.add(e.sets.lastOrNull()?.let { SetDraft(it.a, it.b) } ?: SetDraft()) },
            contentAlignment = Alignment.Center,
        ) { Text("＋ Подход", fontWeight = FontWeight.Bold, color = t.text) }
    }
}

/** Компактное поле для числа с подписью внутри: «кг», «повторы», «мин». */
@Composable
private fun NumField(value: String, onValue: (String) -> Unit, hint: String, decimal: Boolean, modifier: Modifier) {
    val t = LocalTokens.current
    BasicTextField(
        value = value,
        onValueChange = { v -> if (v.length <= 6 && v.all { it.isDigit() || (decimal && (it == '.' || it == ',')) }) onValue(v) },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = if (decimal) KeyboardType.Decimal else KeyboardType.Number),
        textStyle = TextStyle(color = t.text, fontSize = 17.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center),
        cursorBrush = SolidColor(t.text),
        modifier = modifier,
        decorationBox = { inner ->
            Box(Modifier.height(46.dp).fillMaxWidth().background(t.fill, RoundedCornerShape(14.dp)).padding(horizontal = 10.dp), contentAlignment = Alignment.Center) {
                if (value.isEmpty()) Text(hint, color = t.hint, fontSize = 14.sp)
                else Text(hint, color = t.hint, fontSize = 11.sp, modifier = Modifier.align(Alignment.CenterEnd))
                inner()
            }
        },
    )
}

// ───────────── Выбор упражнения ─────────────

private const val ALL = "Все"
private const val HOME = "Дома"
private const val MINE = "Свои"

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
private fun ExercisePicker(custom: List<Exercise>, history: List<Workout>, onPick: (Exercise) -> Unit, onClose: () -> Unit) {
    val t = LocalTokens.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var query by remember { mutableStateOf("") }
    var group by remember { mutableStateOf(ALL) }
    var creating by remember { mutableStateOf(false) }
    var toDelete by remember { mutableStateOf<Exercise?>(null) }
    // Частые упражнения — наверх: сколько раз встречались в дневнике
    val used = remember(history) { history.flatMap { w -> w.ex.map { it.id } }.groupingBy { it }.eachCount() }
    val all = custom + CATALOG
    val q = query.trim().lowercase()
    val shown = all.filter { e ->
        (q.isEmpty() || e.name.lowercase().contains(q)) && when (group) {
            ALL -> true
            HOME -> e.home
            MINE -> e.custom
            else -> e.group == group
        }
    }.sortedByDescending { used[it.id] ?: 0 }

    ModalBottomSheet(
        onDismissRequest = onClose,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = t.card,
        dragHandle = { SheetHandle() },
    ) {
        Column(Modifier.fillMaxWidth().fillMaxHeight(0.92f).imePadding()) {
            if (creating) {
                CustomForm(
                    initialName = query.trim(), initialGroup = if (group in GROUPS) group else "",
                    onCancel = { creating = false },
                    onCreate = { name, kind, g ->
                        val e = WorkoutStore.addCustom(context, name, kind, g)
                        if (e != null) onPick(e)
                    },
                )
                return@Column
            }
            Text("Упражнение", fontSize = 26.sp, fontWeight = FontWeight.ExtraBold, color = t.text, letterSpacing = (-0.5).sp, modifier = Modifier.padding(horizontal = Side, vertical = 8.dp))
            OutlinedTextField(
                value = query, onValueChange = { query = it },
                modifier = Modifier.fillMaxWidth().padding(horizontal = Side),
                placeholder = { Text("🔍 Поиск: жим, присед, планка…", color = t.hint) },
                singleLine = true, shape = RoundedCornerShape(50),
                colors = fieldColors(),
            )
            LazyRow(contentPadding = PaddingValues(horizontal = Side, vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(listOf(ALL, HOME, MINE) + GROUPS) { g -> ChoiceChip(if (g == HOME) "🏠 Дома" else g, g == group) { group = g } }
            }
            LazyColumn(Modifier.weight(1f), contentPadding = PaddingValues(start = Side, end = Side, bottom = 24.dp)) {
                item {
                    Row(
                        Modifier.fillMaxWidth().padding(bottom = 6.dp).clip(RoundedCornerShape(20.dp)).background(t.fill)
                            .clickable { creating = true }.padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text("＋", fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, color = t.text)
                        Spacer(Modifier.width(10.dp))
                        Column {
                            Text(if (q.isEmpty()) "Своё упражнение" else "Добавить «${query.trim()}»", fontWeight = FontWeight.ExtraBold, color = t.text)
                            Text("Если нужного нет в списке", fontSize = 12.sp, color = t.hint)
                        }
                    }
                }
                items(shown, key = { it.id }) { e ->
                    Row(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp))
                            .combinedClickable(onClick = { onPick(e) }, onLongClick = { if (e.custom) toDelete = e })
                            .padding(horizontal = 6.dp, vertical = 11.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(e.name, fontSize = 15.sp, fontWeight = FontWeight.Bold, color = t.text)
                            Text(
                                listOfNotNull(e.group, e.kind.label, if (e.custom) "своё · удерживай, чтобы удалить" else null).joinToString(" · "),
                                fontSize = 12.sp, color = t.hint,
                            )
                        }
                        if (e.home) Text("🏠", fontSize = 14.sp)
                        used[e.id]?.let { Text("  ×$it", fontSize = 12.sp, color = t.hint, fontWeight = FontWeight.Bold) }
                    }
                }
                if (shown.isEmpty()) item {
                    Text("Ничего не нашлось — добавь своё упражнение", color = t.hint, modifier = Modifier.padding(12.dp))
                }
            }
        }
    }
    toDelete?.let { e ->
        AlertDialog(
            onDismissRequest = { toDelete = null },
            containerColor = t.card,
            title = { Text("Удалить «${e.name}»?", color = t.text) },
            text = { Text("Из списка своих упражнений. Записанные тренировки останутся", color = t.hint) },
            confirmButton = {
                TextButton({ toDelete = null; scope.launch { runCatching { WorkoutStore.deleteCustom(context, e) } } }) { Text("Удалить", color = Palette.Danger) }
            },
            dismissButton = { TextButton({ toDelete = null }) { Text("Отмена", color = t.text) } },
        )
    }
}

/** Своё упражнение: название, как записывать подходы и группа мышц. */
@Composable
private fun CustomForm(initialName: String, initialGroup: String, onCancel: () -> Unit, onCreate: suspend (String, Kind, String) -> Unit) {
    val t = LocalTokens.current
    val scope = rememberCoroutineScope()
    var name by remember { mutableStateOf(initialName) }
    var kind by remember { mutableStateOf(Kind.W) }
    var group by remember { mutableStateOf(initialGroup) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    LazyColumn(contentPadding = PaddingValues(horizontal = 20.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                RoundIcon("←", onCancel)
                Text("Своё упражнение", fontSize = 24.sp, fontWeight = FontWeight.ExtraBold, color = t.text, modifier = Modifier.padding(start = 12.dp))
            }
        }
        item {
            OutlinedTextField(
                value = name, onValueChange = { if (it.length <= 60) { name = it; error = null } },
                modifier = Modifier.fillMaxWidth(), placeholder = { Text("Название", color = t.hint) },
                singleLine = true, shape = RoundedCornerShape(20.dp),
                colors = fieldColors(),
            )
        }
        item { Text("Как записывать подходы", fontWeight = FontWeight.ExtraBold, color = t.text) }
        item { Chips(Kind.entries.map { it.label }, kind.label) { l -> kind = Kind.entries.first { it.label == l } } }
        item { Text("Группа мышц", fontWeight = FontWeight.ExtraBold, color = t.text) }
        item { Chips(GROUPS, group) { group = if (group == it) "" else it } }
        error?.let { item { Text(it, color = Palette.Danger, fontWeight = FontWeight.SemiBold) } }
        item {
            PrimaryButton(if (busy) "Сохраняю…" else "Добавить") {
                if (busy) return@PrimaryButton
                if (name.trim().length < 2) { error = "Напиши название"; return@PrimaryButton }
                busy = true
                scope.launch {
                    try {
                        onCreate(name.trim(), kind, group)
                    } catch (e: CancellationException) { throw e } catch (e: Exception) {
                        error = "Не получилось добавить — нет связи с сервером"
                    }
                    busy = false
                }
            }
        }
    }
}

/** Чипы с переносом строк: выбранный — контрастный. */
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
private fun Chips(options: List<String>, selected: String, onSelect: (String) -> Unit) {
    val t = LocalTokens.current
    androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        options.forEach { o -> ChoiceChip(o, o == selected) { onSelect(o) } }
    }
}

