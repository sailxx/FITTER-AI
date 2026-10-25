package com.sailxx.fitter.ui

import androidx.compose.foundation.layout.width
import com.sailxx.fitter.data.MICROS
import com.sailxx.fitter.data.tr
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sailxx.fitter.data.Api
import com.sailxx.fitter.data.ApiException
import com.sailxx.fitter.data.FitterRepository
import com.sailxx.fitter.data.Meal
import com.sailxx.fitter.data.MealItem
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

/** Черновик продукта: числа строками, как их вводят. КБЖУ — на порцию. */
private class ItemDraft(src: MealItem) {
    val src = src
    var name by mutableStateOf(src.name)
    var grams by mutableStateOf(src.grams.toString())
    var kcal by mutableStateOf(num(src.kcal))
    var p by mutableStateOf(num(src.p))
    var f by mutableStateOf(num(src.f))
    var c by mutableStateOf(num(src.c))
    var busy by mutableStateOf(false)
    var msg by mutableStateOf<String?>(null)

    /** Новый вес — КБЖУ пересчитываются пропорционально, их можно поправить следом. */
    fun changeGrams(v: String) {
        grams = v
        val g = v.toIntOrNull() ?: return
        if (g <= 0 || src.grams <= 0) return
        val k = g.toDouble() / src.grams
        kcal = num(src.kcal * k); p = num(src.p * k); f = num(src.f * k); c = num(src.c * k)
    }
}

private fun num(x: Double): String {
    val r = (x * 10).roundToInt() / 10.0
    return if (r == r.toLong().toDouble()) r.toLong().toString() else r.toString().replace('.', ',')
}
private fun parse(s: String) = s.replace(',', '.').toDoubleOrNull()

/** Правка приёма пищи: у каждого продукта название, вес и КБЖУ. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MealSheet(m: Meal, onClose: () -> Unit, onDeleteMeal: () -> Unit) {
    val t = LocalTokens.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val drafts = remember(m) { m.items.map { ItemDraft(it) } }

    fun run(d: ItemDraft, ok: String, block: suspend (String, String) -> Unit) = scope.launch {
        val token = FitterRepository.token(context) ?: return@launch
        d.busy = true; d.msg = null
        try {
            block(token, FitterRepository.today(context))
            d.msg = ok
            FitterRepository.refresh(context)
        } catch (e: CancellationException) { throw e } catch (e: Exception) {
            d.msg = when {
                e is ApiException && e.code == 429 -> tr("Лимит запросов к нейросети на сегодня закончился", "You've used up today's AI requests")
                e is ApiException && e.error == "bad values" -> tr("Слишком большие числа для такого веса", "The numbers are too big for that weight")
                e is ApiException && e.code == 400 -> tr("Проверь вес и числа", "Check the weight and numbers")
                e is ApiException -> tr("Нейросеть сейчас не отвечает", "The AI isn't responding right now")
                else -> tr("Нет связи с сервером", "Can't reach the server")
            }
        }
        d.busy = false
    }

    ModalBottomSheet(
        onDismissRequest = onClose,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = t.card,
        dragHandle = { SheetHandle() },
    ) {
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = Side).padding(top = 12.dp, bottom = 20.dp)
                .navigationBarsPadding().imePadding(),
            verticalArrangement = Arrangement.spacedBy(Gap),
        ) {
            Text(m.title, fontSize = 26.sp, fontWeight = FontWeight.ExtraBold, color = t.text, letterSpacing = (-0.5).sp)
            Text("${m.time} · 🔥 ${m.kcal} ${tr("ккал", "kcal")} · ${tr("Б ${m.p} · Ж ${m.f} · У ${m.c}", "P ${m.p} · F ${m.f} · C ${m.c}")}", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = t.hint)
            if (drafts.isEmpty()) Text(tr("В этом приёме нет продуктов", "This meal has no products"), color = t.hint)
            drafts.forEachIndexed { i, d ->
                Column(Modifier.fillMaxWidth().background(t.fill, RoundedCornerShape(22.dp)).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Field(d.name, { if (it.length <= 60) d.name = it }, tr("Название", "Name"), Modifier.weight(1f), number = false)
                        Spacer(Modifier.size(8.dp))
                        Box(
                            Modifier.size(40.dp).clip(CircleShape).background(t.card).clickable(enabled = !d.busy) {
                                run(d, tr("Удалено", "Deleted")) { tok, date -> Api.itemDelete(tok, date, m.id, i) }
                            },
                            contentAlignment = Alignment.Center,
                        ) { Text("✕", color = t.hint, fontWeight = FontWeight.Bold) }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Field(d.grams, { if (it.length <= 4 && it.all(Char::isDigit)) d.changeGrams(it) }, tr("г", "g"), Modifier.weight(1f))
                        Field(d.kcal, { if (it.length <= 6) d.kcal = it }, tr("ккал", "kcal"), Modifier.weight(1.2f))
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Field(d.p, { if (it.length <= 5) d.p = it }, tr("белки", "protein"), Modifier.weight(1f), accent = Palette.MacroP)
                        Field(d.f, { if (it.length <= 5) d.f = it }, tr("жиры", "fat"), Modifier.weight(1f), accent = Palette.MacroF)
                        Field(d.c, { if (it.length <= 5) d.c = it }, tr("углев.", "carbs"), Modifier.weight(1f), accent = Palette.MacroC)
                    }
                    d.msg?.let { Text(it, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = if (it == tr("Сохранено", "Saved") || it == tr("Пересчитано", "Recalculated") || it == tr("Удалено", "Deleted")) (if (t.dark) Palette.G1 else Palette.G3) else Palette.Danger) }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        SoftButton(if (d.busy) "…" else tr("✨ Пересчитать ИИ", "✨ Recalculate with AI"), Modifier.weight(1f), height = 44.dp) {
                            if (!d.busy && d.name.trim().isNotEmpty()) run(d, tr("Пересчитано", "Recalculated")) { tok, date -> Api.itemRename(tok, date, m.id, i, d.name.trim()) }
                        }
                        PrimaryButton(if (d.busy) "…" else tr("Сохранить", "Save"), Modifier.weight(1f), height = 44.dp) {
                            val g = d.grams.toIntOrNull()
                            val v = listOf(parse(d.kcal), parse(d.p), parse(d.f), parse(d.c))
                            if (d.busy) return@PrimaryButton
                            if (g == null || g <= 0 || v.any { it == null }) { d.msg = tr("Проверь вес и числа", "Check the weight and numbers"); return@PrimaryButton }
                            run(d, tr("Сохранено", "Saved")) { tok, date -> Api.itemSet(tok, date, m.id, i, d.name.trim(), g, v[0]!!, v[1]!!, v[2]!!, v[3]!!) }
                        }
                    }
                }
            }
            // Подробный состав: микронутриенты с долей от суточной нормы (данные есть у новых записей)
            Column(Modifier.fillMaxWidth().background(t.fill, RoundedCornerShape(22.dp)).padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(tr("Подробный состав", "Nutrition details"), fontWeight = FontWeight.ExtraBold, color = t.text)
                if (m.micro.isEmpty()) Text(tr("Микронутриентов в этой записи нет: они считаются для новых записей", "No micronutrient data for this entry: it is calculated for new entries"), fontSize = 12.sp, color = t.hint)
                MICROS.filter { m.micro[it.key] != null }.forEach { k ->
                    val v = m.micro[k.key]!!
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(k.name, color = t.hint, fontSize = 13.sp, modifier = Modifier.weight(1f))
                        Text("${if (v >= 100) v.roundToInt().toString() else ((v * 10).roundToInt() / 10.0).toString()} ${k.unitLabel}", color = t.text, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                        Text("${(v / k.daily * 100).roundToInt()}%", color = t.hint, fontSize = 12.sp, modifier = Modifier.width(44.dp), textAlign = TextAlign.End)
                    }
                }
            }
            Text(
                tr("Меняешь вес — калории и БЖУ пересчитываются сами, их можно поправить вручную. «Пересчитать ИИ» подберёт КБЖУ по новому названию.", "Change the weight and calories and macros recalculate on their own; you can also edit them by hand. “Recalculate with AI” picks the values for a new name."),
                fontSize = 12.sp, color = t.hint, lineHeight = 16.sp,
            )
            SoftButton(tr("Удалить приём пищи", "Delete meal"), color = Palette.Danger) { onDeleteMeal(); onClose() }
        }
    }
}

/** Поле с подписью сверху: серая капсула, крупные цифры. */
@Composable
private fun Field(value: String, onValue: (String) -> Unit, label: String, modifier: Modifier, number: Boolean = true, accent: Color? = null) {
    val t = LocalTokens.current
    Column(modifier) {
        Text(label, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = accent ?: t.hint, modifier = Modifier.padding(start = 6.dp, bottom = 4.dp))
        BasicTextField(
            value = value, onValueChange = { v -> if (!number || v.all { it.isDigit() || it == ',' || it == '.' }) onValue(v) }, singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = if (number) KeyboardType.Decimal else KeyboardType.Text),
            textStyle = TextStyle(color = t.text, fontSize = if (number) 18.sp else 16.sp, fontWeight = FontWeight.Bold, textAlign = if (number) TextAlign.Center else TextAlign.Start),
            cursorBrush = SolidColor(t.text),
            decorationBox = { inner ->
                Box(Modifier.fillMaxWidth().height(48.dp).background(t.card, RoundedCornerShape(16.dp)).padding(horizontal = 14.dp), contentAlignment = Alignment.CenterStart) { inner() }
            },
        )
    }
}
