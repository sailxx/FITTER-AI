package com.sailxx.fitter.ui

import android.graphics.Bitmap
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
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
import com.sailxx.fitter.data.Photos
import com.sailxx.fitter.data.UnauthorizedException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import org.json.JSONObject
import kotlin.math.sin

private sealed interface Stage {
    data object Edit : Stage
    data class Busy(val photo: Boolean) : Stage
    data class Done(val title: String, val kcal: Int, val p: Int, val f: Int, val c: Int, val comment: String) : Stage
}

/** Добавить еду: текстом, снимком с камеры или фото из галереи. Считает нейросеть на сервере, как в боте. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddMealSheet(onClose: () -> Unit) {
    val t = LocalTokens.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var stage by remember { mutableStateOf<Stage>(Stage.Edit) }
    var text by remember { mutableStateOf("") }
    var photo by remember { mutableStateOf<Pair<String, Bitmap>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var cameraUri by remember { mutableStateOf<Uri?>(null) }

    fun load(uri: Uri) = scope.launch {
        error = null
        photo = runCatching { Photos.encode(context, uri) }.getOrElse { error = "Не получилось открыть фото"; null }
    }
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok -> if (ok) cameraUri?.let { load(it) } }
    val gallery = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri -> uri?.let { load(it) } }

    fun send() = scope.launch {
        val token = FitterRepository.token(context) ?: return@launch
        val p = photo
        if (p == null && text.trim().length < 2) { error = "Напиши, что съел, или прикрепи фото"; return@launch }
        error = null
        stage = Stage.Busy(p != null)
        try {
            val date = FitterRepository.today(context)
            val r: JSONObject = if (p != null) Api.mealPhoto(token, date, p.first, text.trim()) else Api.mealText(token, date, text.trim())
            stage = Stage.Done(r.optString("title"), r.optInt("kcal"), r.optInt("p"), r.optInt("f"), r.optInt("c"), r.optString("comment"))
            FitterRepository.refresh(context)
        } catch (e: CancellationException) {
            throw e
        } catch (e: ApiException) {
            error = when {
                e.error == "not_food" && p != null -> "Не вижу еды на фото. Сними тарелку сверху и поближе или напиши текстом"
                e.error == "not_food" -> e.answer.ifBlank { "Не понял, что ты съел. Напиши, например: «2 яйца и тост»" }
                e.code == 429 -> "На сегодня лимит запросов к нейросети закончился. Завтра снова можно!"
                e.code == 413 -> "Фото слишком большое"
                else -> "Нейросеть сейчас не отвечает. Попробуй ещё раз через минуту"
            }
            stage = Stage.Edit
        } catch (e: UnauthorizedException) {
            FitterRepository.refresh(context)
            onClose()
        } catch (e: Exception) {
            error = "Нет связи с сервером. Проверь интернет"
            stage = Stage.Edit
        }
    }

    ModalBottomSheet(
        onDismissRequest = { if (stage !is Stage.Busy) onClose() },
        sheetState = sheet,
        containerColor = t.card,
        dragHandle = { Box(Modifier.padding(top = 10.dp).size(40.dp, 4.dp).background(t.line, RoundedCornerShape(2.dp))) },
    ) {
        AnimatedContent(stage, transitionSpec = { fadeIn(tween(250)) togetherWith fadeOut(tween(150)) }, label = "stage") { s ->
            Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(top = 12.dp, bottom = 20.dp).navigationBarsPadding().imePadding()) {
                when (s) {
                    Stage.Edit -> EditStage(
                        text = text, onText = { text = it; error = null },
                        photo = photo?.second, onRemovePhoto = { photo = null },
                        error = error,
                        onCamera = { val u = Photos.cameraUri(context); cameraUri = u; camera.launch(u) },
                        onGallery = { gallery.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                        onSend = { send() },
                    )
                    is Stage.Busy -> BusyStage(s.photo, photo?.second)
                    is Stage.Done -> DoneStage(s, onMore = { text = ""; photo = null; stage = Stage.Edit }, onClose = onClose)
                }
            }
        }
    }
}

@Composable
private fun EditStage(
    text: String, onText: (String) -> Unit, photo: Bitmap?, onRemovePhoto: () -> Unit, error: String?,
    onCamera: () -> Unit, onGallery: () -> Unit, onSend: () -> Unit,
) {
    val t = LocalTokens.current
    Text("Добавить еду", fontSize = 22.sp, fontWeight = FontWeight.ExtraBold, color = t.text)
    Text("Сфотографируй тарелку или опиши словами — посчитаю калории и БЖУ", fontSize = 14.sp, color = t.hint)
    Spacer(Modifier.height(16.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        SourceButton(R.drawable.ic_camera, "Сфотографировать", Modifier.weight(1f), onCamera)
        SourceButton(R.drawable.ic_photo, "Из галереи", Modifier.weight(1f), onGallery)
    }
    if (photo != null) {
        Spacer(Modifier.height(12.dp))
        Box {
            Image(
                photo.asImageBitmap(), null, contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxWidth().height(180.dp).clip(RoundedCornerShape(18.dp)),
            )
            Text(
                "✕", color = Color.White, fontWeight = FontWeight.Bold,
                modifier = Modifier.align(Alignment.TopEnd).padding(8.dp).size(32.dp).clip(RoundedCornerShape(16.dp))
                    .background(Color(0x99000000)).clickable(onClick = onRemovePhoto).padding(top = 5.dp),
                textAlign = TextAlign.Center,
            )
        }
    }
    Spacer(Modifier.height(12.dp))
    OutlinedTextField(
        value = text, onValueChange = { if (it.length <= 300) onText(it) },
        modifier = Modifier.fillMaxWidth(),
        placeholder = { Text(if (photo != null) "Подсказка: «гречка с курицей, 300 г»" else "Например: 2 яйца, тост и кофе с молоком", color = t.hint) },
        minLines = 2, maxLines = 4,
        shape = RoundedCornerShape(16.dp),
        colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = Palette.G2, unfocusedBorderColor = t.line, focusedTextColor = t.text, unfocusedTextColor = t.text, cursorColor = Palette.G2),
    )
    error?.let {
        Spacer(Modifier.height(10.dp))
        Text(it, color = Palette.Danger, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
    }
    Spacer(Modifier.height(16.dp))
    Box(
        Modifier.fillMaxWidth().height(54.dp).clip(RoundedCornerShape(18.dp))
            .background(Brush.linearGradient(listOf(Color(0xFF3DF59A), Palette.G2))).clickable(onClick = onSend),
        contentAlignment = Alignment.Center,
    ) { Text(if (photo != null) "Посчитать по фото" else "Записать", color = Color.White, fontSize = 17.sp, fontWeight = FontWeight.ExtraBold) }
}

@Composable
private fun SourceButton(icon: Int, label: String, modifier: Modifier, onClick: () -> Unit) {
    val t = LocalTokens.current
    Column(
        modifier.clip(RoundedCornerShape(18.dp)).background(Palette.G2.copy(alpha = 0.09f)).border(1.dp, Palette.G2.copy(alpha = 0.25f), RoundedCornerShape(18.dp))
            .clickable(onClick = onClick).padding(vertical = 14.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Image(painterResource(icon), null, Modifier.size(34.dp))
        Spacer(Modifier.height(6.dp))
        Text(label, fontSize = 14.sp, fontWeight = FontWeight.Bold, color = t.text)
    }
}

@Composable
private fun BusyStage(isPhoto: Boolean, photo: Bitmap?) {
    val t = LocalTokens.current
    val inf = rememberInfiniteTransition(label = "busy")
    val ph by inf.animateFloat(0f, 6.283f, infiniteRepeatable(tween(1400, easing = LinearEasing)), label = "ph")
    Column(Modifier.fillMaxWidth().padding(vertical = 24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        if (isPhoto && photo != null) {
            Image(photo.asImageBitmap(), null, contentScale = ContentScale.Crop, modifier = Modifier.size(120.dp).clip(RoundedCornerShape(24.dp)).graphicsLayer { scaleX = 1f + 0.03f * sin(ph); scaleY = scaleX })
        } else {
            Image(painterResource(R.drawable.ic_sparkles), null, Modifier.size(72.dp).graphicsLayer { rotationZ = 12f * sin(ph); scaleX = 1f + 0.08f * sin(ph * 2); scaleY = scaleX })
        }
        Spacer(Modifier.height(18.dp))
        Text(if (isPhoto) "Смотрю на фото…" else "Считаю калории…", fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, color = t.text)
        Text("Обычно это 5–10 секунд", fontSize = 14.sp, color = t.hint)
    }
}

@Composable
private fun DoneStage(s: Stage.Done, onMore: () -> Unit, onClose: () -> Unit) {
    val t = LocalTokens.current
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        Image(painterResource(R.drawable.ic_party), null, Modifier.size(64.dp).rise(0))
        Spacer(Modifier.height(10.dp))
        Text("Записал!", fontSize = 24.sp, fontWeight = FontWeight.ExtraBold, color = t.text)
        Spacer(Modifier.height(12.dp))
        Column(Modifier.fillMaxWidth().background(t.bg, RoundedCornerShape(18.dp)).padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(s.title, fontWeight = FontWeight.Bold, color = t.text, modifier = Modifier.weight(1f))
                Text("${s.kcal} ккал", fontWeight = FontWeight.ExtraBold, color = Palette.G3)
            }
            Text("Б ${s.p} · Ж ${s.f} · У ${s.c}", fontSize = 13.sp, color = t.hint)
            if (s.comment.isNotBlank()) {
                Spacer(Modifier.height(8.dp))
                Text(s.comment, fontSize = 13.sp, color = t.text)
            }
        }
        Spacer(Modifier.height(16.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Box(Modifier.weight(1f).height(50.dp).clip(RoundedCornerShape(16.dp)).background(t.fill).clickable(onClick = onMore), contentAlignment = Alignment.Center) {
                Text("Ещё блюдо", fontWeight = FontWeight.Bold, color = t.text)
            }
            Box(Modifier.weight(1f).height(50.dp).clip(RoundedCornerShape(16.dp)).background(Palette.G2).clickable(onClick = onClose), contentAlignment = Alignment.Center) {
                Text("Готово", fontWeight = FontWeight.ExtraBold, color = Color.White)
            }
        }
        Spacer(Modifier.width(1.dp))
    }
}
