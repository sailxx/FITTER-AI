package com.sailxx.fitter.ui

import com.sailxx.fitter.data.tr
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
import androidx.compose.runtime.LaunchedEffect
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
fun AddMealSheet(openCamera: Boolean = false, onClose: () -> Unit) {
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
        photo = runCatching { Photos.encode(context, uri) }.getOrElse { error = tr("Не получилось открыть фото", "Couldn't open the photo"); null }
    }
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok -> if (ok) cameraUri?.let { load(it) } }
    val gallery = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri -> uri?.let { load(it) } }
    // Открыли с виджета «Фото еды» — сразу запускаем камеру
    LaunchedEffect(Unit) { if (openCamera) { val u = Photos.cameraUri(context); cameraUri = u; camera.launch(u) } }

    fun send() = scope.launch {
        val token = FitterRepository.token(context) ?: return@launch
        val p = photo
        if (p == null && text.trim().length < 2) { error = tr("Напиши, что съел, или прикрепи фото", "Type what you ate or attach a photo"); return@launch }
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
                e.error == "not_food" && p != null -> tr("Не вижу еды на фото. Сними тарелку сверху и поближе или напиши текстом", "I can't see any food in the photo. Shoot the plate from above and closer, or type it")
                e.error == "not_food" -> e.answer.ifBlank { tr("Не понял, что ты съел. Напиши, например: «2 яйца и тост»", "I didn't get what you ate. Try, for example: “2 eggs and toast”") }
                e.code == 429 -> tr("На сегодня лимит запросов к нейросети закончился. Завтра снова можно!", "You've used up today's AI requests. Try again tomorrow!")
                e.code == 413 -> tr("Фото слишком большое", "The photo is too large")
                else -> tr("Нейросеть сейчас не отвечает. Попробуй ещё раз через минуту", "The AI isn't responding right now. Please try again in a minute")
            }
            stage = Stage.Edit
        } catch (e: UnauthorizedException) {
            FitterRepository.refresh(context)
            onClose()
        } catch (e: Exception) {
            error = tr("Нет связи с сервером. Проверь интернет", "Can't reach the server. Check your internet connection")
            stage = Stage.Edit
        }
    }

    ModalBottomSheet(
        onDismissRequest = { if (stage !is Stage.Busy) onClose() },
        sheetState = sheet,
        containerColor = t.card,
        dragHandle = { SheetHandle() },
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
    Text(tr("Добавить еду", "Add food"), fontSize = 26.sp, letterSpacing = (-0.5).sp, fontWeight = FontWeight.ExtraBold, color = t.text)
    Text(tr("Сфотографируй тарелку или опиши словами — посчитаю калории и БЖУ", "Photograph your plate or describe it in words — I'll count calories and macros"), fontSize = 14.sp, color = t.hint)
    Spacer(Modifier.height(18.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(Gap)) {
        SourceButton(R.drawable.ic_camera, tr("Сфотографировать", "Take a photo"), Modifier.weight(1f), onCamera)
        SourceButton(R.drawable.ic_photo, tr("Из галереи", "From gallery"), Modifier.weight(1f), onGallery)
    }
    if (photo != null) {
        Spacer(Modifier.height(12.dp))
        Box {
            Image(
                photo.asImageBitmap(), null, contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxWidth().height(190.dp).clip(RoundedCornerShape(22.dp)),
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
        placeholder = { Text(if (photo != null) tr("Подсказка: «гречка с курицей, 300 г»", "Hint: “buckwheat with chicken, 300 g”") else tr("Например: 2 яйца, тост и кофе с молоком", "For example: 2 eggs, toast and a latte"), color = t.hint) },
        minLines = 2, maxLines = 4,
        shape = RoundedCornerShape(20.dp),
        colors = fieldColors(),
    )
    error?.let {
        Spacer(Modifier.height(10.dp))
        Text(it, color = Palette.Danger, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
    }
    Spacer(Modifier.height(18.dp))
    PrimaryButton(if (photo != null) tr("Посчитать по фото", "Count from photo") else tr("Записать", "Log it"), height = 56.dp, onClick = onSend)
}

@Composable
private fun SourceButton(icon: Int, label: String, modifier: Modifier, onClick: () -> Unit) {
    val t = LocalTokens.current
    Column(
        modifier.clip(RoundedCornerShape(22.dp)).background(t.fill).clickable(onClick = onClick).padding(vertical = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        IconBubble(icon, 52.dp, 30.dp)
        Spacer(Modifier.height(8.dp))
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
        Text(if (isPhoto) tr("Смотрю на фото…", "Looking at the photo…") else tr("Считаю калории…", "Counting calories…"), fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, color = t.text)
        Text(tr("Обычно это 5–10 секунд", "Usually takes 5–10 seconds"), fontSize = 14.sp, color = t.hint)
    }
}

@Composable
private fun DoneStage(s: Stage.Done, onMore: () -> Unit, onClose: () -> Unit) {
    val t = LocalTokens.current
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        Image(painterResource(R.drawable.ic_party), null, Modifier.size(64.dp).rise(0))
        Spacer(Modifier.height(10.dp))
        Text(tr("Записал!", "Logged!"), fontSize = 24.sp, fontWeight = FontWeight.ExtraBold, color = t.text)
        Spacer(Modifier.height(12.dp))
        Column(Modifier.fillMaxWidth().background(t.fill, RoundedCornerShape(22.dp)).padding(18.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(s.title, fontWeight = FontWeight.Bold, color = t.text, modifier = Modifier.weight(1f))
                Text("🔥 ${s.kcal} ${tr("ккал", "kcal")}", fontWeight = FontWeight.ExtraBold, color = t.text)
            }
            Text(tr("Б ${s.p} · Ж ${s.f} · У ${s.c}", "P ${s.p} · F ${s.f} · C ${s.c}"), fontSize = 13.sp, color = t.hint)
            if (s.comment.isNotBlank()) {
                Spacer(Modifier.height(8.dp))
                Text(s.comment, fontSize = 13.sp, color = t.text)
            }
        }
        Spacer(Modifier.height(16.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(Gap)) {
            SoftButton(tr("Ещё блюдо", "Add another"), Modifier.weight(1f), height = 54.dp, onClick = onMore)
            PrimaryButton(tr("Готово", "Done"), Modifier.weight(1f), onClick = onClose)
        }
        Spacer(Modifier.width(1.dp))
    }
}
