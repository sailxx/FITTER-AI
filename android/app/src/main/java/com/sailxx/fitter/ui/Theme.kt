package com.sailxx.fitter.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/** Цвета FITTER: зелёный как у логотипа и дневника в Telegram. */
object Palette {
    val Green = Color(0xFF30D158)
    val OnGreen = Color(0xFF03210C)
    val Over = Color(0xFFFF9F0A) // норма превышена
    val Water = Color(0xFF40C8E0)
    val Protein = Color(0xFFFF6B6B)
    val Fat = Color(0xFFFFC145)
    val Carbs = Color(0xFF5E9BFF)
}

private val Dark = darkColorScheme(
    primary = Palette.Green,
    onPrimary = Palette.OnGreen,
    background = Color.Black,
    onBackground = Color.White,
    surface = Color(0xFF111613),
    onSurface = Color.White,
    surfaceVariant = Color(0xFF1E2A21),
    onSurfaceVariant = Color(0xFF8E9A92),
)

private val Light = lightColorScheme(
    primary = Color(0xFF1FA846),
    onPrimary = Color.White,
    background = Color(0xFFF3F7F4),
    onBackground = Color(0xFF0B140E),
    surface = Color.White,
    onSurface = Color(0xFF0B140E),
    surfaceVariant = Color(0xFFE2ECE5),
    onSurfaceVariant = Color(0xFF5E6B63),
)

@Composable
fun FitterTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = if (isSystemInDarkTheme()) Dark else Light, content = content)
}
