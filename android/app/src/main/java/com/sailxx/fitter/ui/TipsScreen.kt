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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
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
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
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

    fun analyze() = scope.launch {
        val token = FitterRepository.token(context) ?: return@launch
        anBusy = true; anErr = null
        try {
            analysis = parseAnalysis(Api.analysis(token, FitterRepository.today(context)))
        } catch (e: CancellationException) { throw e } catch (e: Exception) { anErr = aiError(e) }
        anBusy = false
    }

    LazyColumn(Modifier.fillMaxSize().background(t.bg), contentPadding = PaddingValues(bottom = 140.dp)) {
        item { TipsHero() }
        item {
            Section(R.drawable.ic_salad, "Что съесть сейчас", "3 варианта под остаток твоей нормы", Modifier.padding(top = 16.dp).rise(0)) {
                when {
                    advBusy -> Thinking("Подбираю варианты…")
                    advice != null -> {
                        val a = advice!!
                        if (a.intro.isNotBlank()) Note(a.intro)
                        a.options.forEachIndexed { i, o -> OptionCard(i, o) { eat(i, o.title) } }
                        GhostButton("🔄 Другие варианты") { pickAdvice() }
                    }
                    else -> {
                        eaten?.let { Note("Записал «$it» в дневник ✅") }
                        MainButton("✨ Подобрать варианты") { pickAdvice() }
                    }
                }
                advErr?.let { Err(it) }
            }
        }
        item {
            Section(R.drawable.ic_brain, "Разбор недели", "Что получилось и что улучшить за 7 дней", Modifier.padding(top = 12.dp).rise(120)) {
                when {
                    anBusy -> Thinking("Разбираю твою неделю…")
                    analysis != null -> AnalysisView(analysis!!)
                    else -> MainButton("🧠 Разобрать неделю") { analyze() }
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
private fun TipsHero() {
    val inf = rememberInfiniteTransition(label = "hero")
    val ph by inf.animateFloat(0f, 6.283f, infiniteRepeatable(tween(4000, easing = LinearEasing)), label = "ph")
    val shape = RoundedCornerShape(bottomStart = 30.dp, bottomEnd = 30.dp)
    Row(
        Modifier.fillMaxWidth()
            .shadow(14.dp, shape, spotColor = Color(0xFF12E97C), ambientColor = Color(0x6612E97C))
            .clip(shape)
            .background(Brush.linearGradient(listOf(Palette.Hero1, Palette.Hero2, Palette.Hero3), start = Offset.Zero, end = Offset(500f, 900f)))
            .drawBehind { drawCircle(Color(0x1AFFFFFF), 120.dp.toPx(), Offset(size.width + 30.dp.toPx(), 0f)) }
            .statusBarsPadding().padding(start = 18.dp, end = 18.dp, top = 18.dp, bottom = 26.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text("Советы ИИ", fontSize = 30.sp, fontWeight = FontWeight.ExtraBold, color = Palette.HeroInk, letterSpacing = (-0.6).sp)
            Text("Нейросеть смотрит на твой дневник и подсказывает", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = Palette.HeroSub)
        }
        Image(
            painterResource(R.drawable.ic_sparkles), null,
            Modifier.size(56.dp).graphicsLayer { rotationZ = 10f * sin(ph); scaleX = 1f + 0.06f * sin(ph * 2); scaleY = scaleX },
        )
    }
}

@Composable
private fun Section(@DrawableRes icon: Int, title: String, sub: String, modifier: Modifier, content: @Composable () -> Unit) {
    val t = LocalTokens.current
    Column(
        modifier.padding(horizontal = 16.dp).fillMaxWidth()
            .then(if (t.shadow) Modifier.shadow(10.dp, Card, spotColor = Color(0x2210283C), ambientColor = Color(0x1110283C)) else Modifier)
            .background(t.card, Card).border(1.dp, t.edge, Card).padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(40.dp).background(Palette.G2.copy(alpha = 0.12f), RoundedCornerShape(13.dp)), contentAlignment = Alignment.Center) {
                Image(painterResource(icon), null, Modifier.size(26.dp))
            }
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
private fun OptionCard(i: Int, o: Option, onEat: () -> Unit) {
    val t = LocalTokens.current
    Column(Modifier.fillMaxWidth().background(t.bg, RoundedCornerShape(16.dp)).padding(14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("${i + 1}", fontWeight = FontWeight.ExtraBold, color = Color.White, fontSize = 13.sp, textAlign = TextAlign.Center,
                modifier = Modifier.size(22.dp).background(Palette.G2, RoundedCornerShape(11.dp)).padding(top = 2.dp))
            Spacer(Modifier.width(8.dp))
            Text(o.title, fontWeight = FontWeight.Bold, color = t.text, modifier = Modifier.weight(1f))
            Text("${o.kcal} ккал", fontWeight = FontWeight.ExtraBold, color = Palette.G3, fontSize = 14.sp)
        }
        Spacer(Modifier.height(6.dp))
        Text(o.items, fontSize = 13.sp, color = t.text)
        Text("Б ${o.p} · Ж ${o.f} · У ${o.c}" + (if (o.why.isNotBlank()) " — ${o.why}" else ""), fontSize = 12.sp, color = t.hint)
        Spacer(Modifier.height(10.dp))
        Box(
            Modifier.clip(RoundedCornerShape(12.dp)).background(Palette.G2).clickable(onClick = onEat).padding(horizontal = 14.dp, vertical = 8.dp),
        ) { Text("✅ Съел это", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 13.sp) }
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
            Box(Modifier.weight(1f).height(8.dp).background(if (i < a.score) Palette.G2 else t.line, RoundedCornerShape(4.dp)))
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
    Column(Modifier.fillMaxWidth().background(t.bg, RoundedCornerShape(16.dp)).padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
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
    Text(text, fontSize = 14.sp, color = t.text, modifier = Modifier.fillMaxWidth().background(Palette.G2.copy(alpha = 0.08f), RoundedCornerShape(14.dp)).padding(12.dp))
}

@Composable
private fun Err(text: String) = Text(text, fontSize = 14.sp, color = Palette.Danger, fontWeight = FontWeight.SemiBold)

@Composable
private fun MainButton(text: String, onClick: () -> Unit) {
    Box(
        Modifier.fillMaxWidth().height(50.dp).clip(RoundedCornerShape(16.dp))
            .background(Brush.linearGradient(listOf(Color(0xFF3DF59A), Palette.G2))).clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { Text(text, color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 16.sp) }
}

@Composable
private fun GhostButton(text: String, onClick: () -> Unit) {
    val t = LocalTokens.current
    Box(
        Modifier.fillMaxWidth().height(46.dp).clip(RoundedCornerShape(14.dp)).background(t.fill).clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { Text(text, color = t.text, fontWeight = FontWeight.Bold) }
}
