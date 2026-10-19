package com.sailxx.fitter.ui

import androidx.annotation.DrawableRes
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/*
 * Общие детали оформления в духе Cal AI: просторные поля по краям, крупные скругления,
 * нейтральные карточки без рамок, главная кнопка — контрастная (белая на тёмной теме, чёрная на светлой).
 */

/** Поле от края экрана. */
val Side = 20.dp
/** Расстояние между карточками. */
val Gap = 12.dp
val CardShape = RoundedCornerShape(24.dp)

/** Карточка: фон карточки, мягкая тень в светлой теме, без рамки. */
@Composable
fun Modifier.calCard(shape: RoundedCornerShape = CardShape): Modifier {
    val t = LocalTokens.current
    return this
        .then(if (t.shadow) Modifier.shadow(12.dp, shape, spotColor = Color(0x1A14142A), ambientColor = Color(0x0D14142A)) else Modifier)
        .clip(shape)
        .background(t.card)
}

/** Фон экрана. В тёмной теме, как у Cal AI, сверху справа лёгкое сиреневое свечение. */
@Composable
fun Modifier.screenBg(): Modifier {
    val t = LocalTokens.current
    return this.background(t.bg).then(
        if (!t.dark) Modifier else Modifier.drawBehind {
            val c = Offset(size.width * 0.85f, 0f)
            drawCircle(Brush.radialGradient(listOf(Color(0xFF2E2A3A), Color(0x002E2A3A)), center = c, radius = size.width * 1.1f), radius = size.width * 1.1f, center = c)
        },
    )
}

/** Тёмная подложка кнопок в шапке — как кружки рядом с логотипом Cal AI. */
@Composable
fun chipColor(): Color = LocalTokens.current.let { if (it.dark) Color(0xFF0F0F12) else it.card }

/** Заголовок раздела: крупное название, подпись и что-то справа (кнопки, счётчик). */
@Composable
fun ScreenHeader(title: String, sub: String? = null, trailing: (@Composable () -> Unit)? = null) {
    val t = LocalTokens.current
    Row(
        Modifier.fillMaxWidth().statusBarsPadding().padding(start = Side, end = 16.dp, top = 14.dp, bottom = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, fontSize = 34.sp, fontWeight = FontWeight.ExtraBold, color = t.text, letterSpacing = (-0.8).sp, lineHeight = 38.sp)
            if (sub != null) Text(sub, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = t.hint)
        }
        trailing?.invoke()
    }
}

/** Заголовок блока внутри экрана: «Недавно добавлено», «Вчера». */
@Composable
fun BlockTitle(title: String, note: String? = null, modifier: Modifier = Modifier) {
    val t = LocalTokens.current
    Row(modifier.fillMaxWidth().padding(start = Side + 2.dp, end = Side + 2.dp, top = 26.dp, bottom = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(title, fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, color = t.text, letterSpacing = (-0.3).sp, modifier = Modifier.weight(1f))
        if (note != null) Text(note, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = t.hint)
    }
}

/** Главная кнопка: контрастная, со скруглением-капсулой. */
@Composable
fun PrimaryButton(text: String, modifier: Modifier = Modifier.fillMaxWidth(), height: Dp = 54.dp, onClick: () -> Unit) {
    val t = LocalTokens.current
    Box(
        modifier.height(height).clip(RoundedCornerShape(50)).background(t.text).clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { Text(text, color = t.bg, fontWeight = FontWeight.ExtraBold, fontSize = 16.sp, maxLines = 1) }
}

/** Второстепенная кнопка: серая подложка. */
@Composable
fun SoftButton(text: String, modifier: Modifier = Modifier.fillMaxWidth(), height: Dp = 48.dp, color: Color? = null, onClick: () -> Unit) {
    val t = LocalTokens.current
    Box(
        modifier.height(height).clip(RoundedCornerShape(50)).background(t.fill).clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { Text(text, color = color ?: t.text, fontWeight = FontWeight.Bold, fontSize = 15.sp, maxLines = 1) }
}

/** Цветная иконка в круглой подложке — как значки в карточках Cal AI. */
@Composable
fun IconBubble(@DrawableRes icon: Int, size: Dp = 40.dp, iconSize: Dp = 24.dp) {
    val t = LocalTokens.current
    Box(Modifier.size(size).background(t.fill, CircleShape), contentAlignment = Alignment.Center) {
        Image(painterResource(icon), null, Modifier.size(iconSize))
    }
}

/** Ручка сверху у выезжающих панелей. */
@Composable
fun SheetHandle() {
    val t = LocalTokens.current
    Box(Modifier.padding(top = 10.dp).size(40.dp, 5.dp).background(t.line, RoundedCornerShape(3.dp)))
}

/** Чип выбора: выбранный — контрастный, остальные — серые. */
@Composable
fun ChoiceChip(text: String, on: Boolean, onClick: () -> Unit) {
    val t = LocalTokens.current
    Text(
        text, fontSize = 14.sp, fontWeight = FontWeight.Bold, color = if (on) t.bg else t.text,
        modifier = Modifier.clip(RoundedCornerShape(50)).background(if (on) t.text else t.fill).clickable(onClick = onClick)
            .padding(horizontal = 15.dp, vertical = 9.dp),
    )
}

/** Цвета полей ввода: без обводки, серая подложка. */
@Composable
fun fieldColors() = LocalTokens.current.let { t ->
    OutlinedTextFieldDefaults.colors(
        focusedBorderColor = t.text.copy(alpha = 0.35f), unfocusedBorderColor = Color.Transparent,
        focusedContainerColor = t.fill, unfocusedContainerColor = t.fill,
        focusedTextColor = t.text, unfocusedTextColor = t.text, cursorColor = t.text,
    )
}

