package com.sailxx.fitter.ui

import androidx.annotation.DrawableRes
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sailxx.fitter.R
import com.sailxx.fitter.data.Api
import com.sailxx.fitter.data.ApiException
import com.sailxx.fitter.data.FitterRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.sin

private val Card = RoundedCornerShape(20.dp)

private data class Option(val title: String, val why: String, val kcal: Int, val p: Int, val f: Int, val c: Int, val items: String)
private data class Advice(val intro: String, val options: List<Option>)
private data class Recipe(val time: String, val ingredients: List<String>, val steps: List<String>, val tip: String)
private data class Analysis(val score: Int, val summary: String, val good: List<String>, val improve: List<String>, val tips: List<String>, val from: String, val end: String, val recorded: Int)

private fun JSONArray?.strings() = (0 until (this?.length() ?: 0)).map { this!!.optString(it) }.filter { it.isNotBlank() }

private fun parseAdvice(j: JSONObject?): Advice? {
    val arr = j?.optJSONArray("options") ?: return null
    val opts = (0 until arr.length()).map { i ->
        val o = arr.getJSONObject(i)
        val items = o.optJSONArray("items")
        Option(
            o.optString("title"), o.optString("why"), o.optInt("kcal"), o.optInt("p"), o.optInt("f"), o.optInt("c"),
            (0 until (items?.length() ?: 0)).joinToString(", ") { k -> items!!.getJSONObject(k).let { "${it.optString("name")} ${it.optInt("grams")} г" } },
        )
    }
    return if (opts.isEmpty()) null else Advice(j.optString("intro"), opts)
}

private fun parseRecipe(j: JSONObject?): Recipe? {
    if (j == null || !j.has("steps")) return null
    return Recipe(j.optString("time"), j.optJSONArray("ingredients").strings(), j.optJSONArray("steps").strings(), j.optString("tip"))
}

private fun parseAnalysis(j: JSONObject?): Analysis? {
    if (j == null || !j.has("score")) return null
    return Analysis(
        j.optInt("score"), j.optString("summary"), j.optJSONArray("good").strings(), j.optJSONArray("improve").strings(),
        j.optJSONArray("tips").strings(), j.optString("from"), j.optString("end"), j.optInt("recorded"),
    )
}

private fun aiError(e: Throwable): String = when {
    e is ApiException && e.code == 429 -> "На сегодня лимит запросов к нейросети закончился. Завтра снова можно!"
    e is ApiException && e.error == "short" -> "Для разбора нужно хотя бы 2 дня с записями за неделю. Записывай еду каждый день — и всё получится"
    e is ApiException && e.error == "expired" -> "Варианты устарели — подбери новые"
    e is ApiException -> "Нейросеть сейчас не отвечает. Попробуй ещё раз через минуту"
    else -> "Нет связи с сервером. Проверь интернет"
}

/** Советы ИИ: «Что съесть сейчас» под остаток нормы и разбор недели — те же, что в боте. */
@Composable
fun TipsScreen() {
    val t = LocalTokens.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var advice by remember { mutableStateOf<Advice?>(null) }
    var analysis by remember { mutableStateOf<Analysis?>(null) }
    var advBusy by remember { mutableStateOf(false) }
    var anBusy by remember { mutableStateOf(false) }
    var advErr by remember { mutableStateOf<String?>(null) }
    var anErr by remember { mutableStateOf<String?>(null) }
    var eaten by remember { mutableStateOf<String?>(null) }
    var open by remember { mutableStateOf<Int?>(null) }
    var recipe by remember { mutableStateOf<Recipe?>(null) }
    var recipeBusy by remember { mutableStateOf(false) }
    var similarBusy by remember { mutableStateOf(false) }
    var sheetErr by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        val token = FitterRepository.token(context) ?: return@LaunchedEffect
        runCatching { Api.tips(token) }.getOrNull()?.let { j ->
            advice = parseAdvice(j.optJSONObject("advice"))
            analysis = parseAnalysis(j.optJSONObject("analysis"))
        }
    }

    fun pickAdvice() = scope.launch {
        val token = FitterRepository.token(context) ?: return@launch
        advBusy = true; advErr = null; eaten = null
        try {
            advice = parseAdvice(Api.advice(token, FitterRepository.today(context)))
        } catch (e: CancellationException) { throw e } catch (e: Exception) { advErr = aiError(e) }
        advBusy = false
    }

    fun eat(i: Int, title: String) = scope.launch {
        val token = FitterRepository.token(context) ?: return@launch
        try {
            Api.adviceEat(token, FitterRepository.today(context), i)
            advice = null
            eaten = title
            FitterRepository.refresh(context)
        } catch (e: CancellationException) { throw e } catch (e: Exception) { advErr = aiError(e) }
    }

    fun openOption(i: Int) = scope.launch {
        val token = FitterRepository.token(context) ?: return@launch
        open = i; recipe = null; sheetErr = null; recipeBusy = true
        try {
            recipe = parseRecipe(Api.adviceRecipe(token, FitterRepository.today(context), i))
            if (recipe == null) sheetErr = "Не получилось составить рецепт"
        } catch (e: CancellationException) { throw e } catch (e: Exception) { sheetErr = aiError(e) }
        recipeBusy = false
    }

    fun similar(i: Int) = scope.launch {
        val token = FitterRepository.token(context) ?: return@launch
        similarBusy = true; sheetErr = null
        try {
            advice = parseAdvice(Api.adviceSimilar(token, FitterRepository.today(context), i))
            open = null
        } catch (e: CancellationException) { throw e } catch (e: Exception) { sheetErr = aiError(e) }
        similarBusy = false
    }

    fun analyze() = scope.launch {
        val token = FitterRepository.token(context) ?: return@launch
        anBusy = true; anErr = null
        try {
            analysis = parseAnalysis(Api.analysis(token, FitterRepository.today(context)))
        } catch (e: CancellationException) { throw e } catch (e: Exception) { anErr = aiError(e) }
        anBusy = false
    }

    val openOpt = open?.let { advice?.options?.getOrNull(it) }
    if (open != null && openOpt != null) {
        RecipeSheet(
            o = openOpt, recipe = recipe, busy = recipeBusy, similarBusy = similarBusy, err = sheetErr,
            onClose = { if (!similarBusy) open = null },
            onSimilar = { similar(open!!) },
            onEat = { val i = open!!; open = null; eat(i, openOpt.title) },
        )
    }

    LazyColumn(Modifier.fillMaxSize().screenBg(), contentPadding = PaddingValues(bottom = 130.dp)) {
        item { ScreenHeader("Советы ИИ", "Нейросеть смотрит на дневник и подсказывает") }
        item {
            Section(R.drawable.ic_salad, "Что съесть сейчас", "3 варианта под остаток твоей нормы", Modifier.padding(top = 10.dp).rise(0)) {
                when {
                    advBusy -> Thinking("Подбираю варианты…")
                    advice != null -> {
                        val a = advice!!
                        if (a.intro.isNotBlank()) Note(a.intro)
                        a.options.forEachIndexed { i, o -> OptionCard(i, o, onOpen = { openOption(i) }) { eat(i, o.title) } }
                        SoftButton("🔄 Другие варианты") { pickAdvice() }
                    }
                    else -> {
                        eaten?.let { Note("Записал «$it» в дневник ✅") }
                        PrimaryButton("✨ Подобрать варианты") { pickAdvice() }
                    }
                }
                advErr?.let { Err(it) }
            }
        }
        item {
            Section(R.drawable.ic_brain, "Разбор недели", "Что получилось и что улучшить за 7 дней", Modifier.padding(top = Gap).rise(120)) {
                when {
                    anBusy -> Thinking("Разбираю твою неделю…")
                    analysis != null -> AnalysisView(analysis!!)
                    else -> PrimaryButton("🧠 Разобрать неделю") { analyze() }
                }
                anErr?.let { Err(it) }
            }
        }
        item {
            Text(
                "FITTER считает примерно и не заменяет врача или диетолога",
                fontSize = 12.sp, color = t.hint, textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(24.dp),
            )
        }
    }
}

@Composable
private fun Section(@DrawableRes icon: Int, title: String, sub: String, modifier: Modifier, content: @Composable () -> Unit) {
    val t = LocalTokens.current
    Column(
        modifier.padding(horizontal = Side).fillMaxWidth().calCard().padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconBubble(icon, 44.dp, 26.dp)
            Spacer(Modifier.width(12.dp))
            Column {
                Text(title, fontSize = 17.sp, fontWeight = FontWeight.ExtraBold, color = t.text)
                Text(sub, fontSize = 12.sp, color = t.hint)
            }
        }
        content()
    }
}

@Composable
private fun OptionCard(i: Int, o: Option, onOpen: () -> Unit, onEat: () -> Unit) {
    val t = LocalTokens.current
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(t.fill).clickable(onClick = onOpen).padding(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(24.dp).background(t.text, RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) {
                Text("${i + 1}", fontWeight = FontWeight.ExtraBold, color = t.bg, fontSize = 13.sp, lineHeight = 13.sp,
                    style = TextStyle(platformStyle = PlatformTextStyle(includeFontPadding = false)))
            }
            Spacer(Modifier.width(8.dp))
            Text(o.title, fontWeight = FontWeight.Bold, color = t.text, modifier = Modifier.weight(1f))
            Text("🔥 ${o.kcal}", fontWeight = FontWeight.ExtraBold, color = t.text, fontSize = 15.sp)
        }
        Spacer(Modifier.height(6.dp))
        Text(o.items, fontSize = 13.sp, color = t.text)
        Text("Б ${o.p} · Ж ${o.f} · У ${o.c}" + (if (o.why.isNotBlank()) " — ${o.why}" else ""), fontSize = 12.sp, color = t.hint)
        Spacer(Modifier.height(10.dp))
        PrimaryButton("Съел это", Modifier.width(150.dp), height = 40.dp) { onEat() }
        Text("Нажми — рецепт и похожее", fontSize = 11.sp, color = t.hint, modifier = Modifier.padding(top = 8.dp))
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun RecipeSheet(o: Option, recipe: Recipe?, busy: Boolean, similarBusy: Boolean, err: String?, onClose: () -> Unit, onSimilar: () -> Unit, onEat: () -> Unit) {
    val t = LocalTokens.current
    ModalBottomSheet(
        onDismissRequest = onClose,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = t.card,
        dragHandle = { SheetHandle() },
    ) {
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(top = 12.dp, bottom = 20.dp).navigationBarsPadding(),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(o.title, fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, color = t.text, modifier = Modifier.weight(1f))
                Text("🔥 ${o.kcal} ккал", fontWeight = FontWeight.ExtraBold, color = t.text)
            }
            Text("Б ${o.p} · Ж ${o.f} · У ${o.c}" + (if (o.why.isNotBlank()) " — ${o.why}" else ""), fontSize = 12.sp, color = t.hint)
            Text(o.items, fontSize = 13.sp, color = t.text)
            when {
                busy -> Thinking("Пишу рецепт…")
                recipe != null -> {
                    if (recipe.time.isNotBlank()) Text("⏱ ${recipe.time}", fontWeight = FontWeight.Bold, color = t.text)
                    Bullets(R.drawable.ic_salad, "Ингредиенты", recipe.ingredients)
                    Column(Modifier.fillMaxWidth().background(t.fill, RoundedCornerShape(20.dp)).padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("Приготовление", fontWeight = FontWeight.ExtraBold, color = t.text)
                        recipe.steps.forEachIndexed { k, st -> Text("${k + 1}. $st", fontSize = 14.sp, color = t.text, lineHeight = 19.sp) }
                    }
                    if (recipe.tip.isNotBlank()) Note("💡 ${recipe.tip}")
                }
            }
            err?.let { Err(it) }
            if (similarBusy) Thinking("Ищу похожее…") else SoftButton("🔍 Найти похожее") { onSimilar() }
            PrimaryButton("✅ Съел это") { onEat() }
        }
    }
}

@Composable
private fun AnalysisView(a: Analysis) {
    val t = LocalTokens.current
    Row(verticalAlignment = Alignment.Bottom) {
        Text("${a.score}", fontSize = 44.sp, fontWeight = FontWeight.ExtraBold, color = t.text, letterSpacing = (-1).sp)
        Text(" из 10", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = t.hint, modifier = Modifier.padding(bottom = 8.dp))
        Spacer(Modifier.weight(1f))
        Text("${a.recorded} дн. с записями", fontSize = 12.sp, color = t.hint, modifier = Modifier.padding(bottom = 10.dp))
    }
    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        repeat(10) { i ->
            Box(Modifier.weight(1f).height(8.dp).background(if (i < a.score) t.text else t.line, RoundedCornerShape(4.dp)))
        }
    }
    if (a.summary.isNotBlank()) Text(a.summary, fontSize = 14.sp, color = t.text, lineHeight = 20.sp)
    Bullets(R.drawable.ic_check, "Что получилось", a.good)
    Bullets(R.drawable.ic_goal, "Что улучшить", a.improve)
    Bullets(R.drawable.ic_tip, "Советы на неделю", a.tips)
}

@Composable
private fun Bullets(@DrawableRes icon: Int, title: String, items: List<String>) {
    if (items.isEmpty()) return
    val t = LocalTokens.current
    Column(Modifier.fillMaxWidth().background(t.fill, RoundedCornerShape(20.dp)).padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Image(painterResource(icon), null, Modifier.size(20.dp))
            Spacer(Modifier.width(8.dp))
            Text(title, fontWeight = FontWeight.ExtraBold, color = t.text)
        }
        items.forEach { Text("• $it", fontSize = 14.sp, color = t.text, lineHeight = 19.sp) }
    }
}

@Composable
private fun Thinking(text: String) {
    val t = LocalTokens.current
    val inf = rememberInfiniteTransition(label = "think")
    val ph by inf.animateFloat(0f, 6.283f, infiniteRepeatable(tween(1200, easing = LinearEasing)), label = "ph")
    Row(Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center) {
        Image(painterResource(R.drawable.ic_sparkles), null, Modifier.size(30.dp).graphicsLayer { rotationZ = 15f * sin(ph); scaleX = 1f + 0.1f * sin(ph * 2); scaleY = scaleX })
        Spacer(Modifier.width(10.dp))
        Text(text, fontWeight = FontWeight.Bold, color = t.text)
    }
}

@Composable
private fun Note(text: String) {
    val t = LocalTokens.current
    Text(text, fontSize = 14.sp, color = t.text, modifier = Modifier.fillMaxWidth().background(t.fill, RoundedCornerShape(18.dp)).padding(14.dp))
}

@Composable
private fun Err(text: String) = Text(text, fontSize = 14.sp, color = Palette.Danger, fontWeight = FontWeight.SemiBold)

