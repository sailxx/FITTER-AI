package com.sailxx.fitter.ui

import com.sailxx.fitter.data.Lang
import com.sailxx.fitter.data.tr
import android.Manifest
import android.content.Intent
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.TimePickerDefaults
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.core.app.NotificationManagerCompat
import androidx.lifecycle.compose.LifecycleResumeEffect
import com.sailxx.fitter.R
import com.sailxx.fitter.data.AppIcon
import com.sailxx.fitter.data.AppIconStyle
import com.sailxx.fitter.data.MealSlot
import com.sailxx.fitter.data.ReminderPrefs
import com.sailxx.fitter.data.ReminderSettings
import com.sailxx.fitter.notify.Reminders
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sailxx.fitter.BuildConfig
import com.sailxx.fitter.data.FitterRepository
import com.sailxx.fitter.data.Summary
import com.sailxx.fitter.data.Targets
import com.sailxx.fitter.data.ThemeMode
import com.sailxx.fitter.data.ThemePref
import com.sailxx.fitter.data.WidgetLook
import com.sailxx.fitter.data.WidgetPrefs
import com.sailxx.fitter.widget.ringBitmap
import com.sailxx.fitter.widget.skinOf
import com.sailxx.fitter.widget.updateFitterWidgets
import kotlinx.coroutines.launch
import java.util.Locale

private val Group = RoundedCornerShape(24.dp)
private fun n(x: Int) = String.format(Locale(Lang.code), "%,d", x).replace(' ', ' ')

/** Настройки: спокойный список — тема, виджеты, аккаунт. Изменения сразу видны на виджетах. */
@Composable
fun SettingsScreen(summary: Summary?, onBack: () -> Unit) {
    val t = LocalTokens.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val mode by ThemePref.mode.collectAsState()
    val icon by AppIcon.style.collectAsState()
    remember { AppIcon.load(context) }
    val look by WidgetPrefs.look.collectAsState()
    // Ползунок двигается плавно, а сохраняем и перерисовываем виджеты, когда палец отпущен
    var opacity by remember(look.opacity) { mutableFloatStateOf(look.opacity.toFloat()) }
    val reminders by ReminderPrefs.settings.collectAsState()
    var remindersOpen by rememberSaveable { mutableStateOf(false) }
    BackHandler(onBack = onBack)
    if (remindersOpen) return RemindersScreen(onBack = { remindersOpen = false })

    fun saveLook(l: WidgetLook) {
        WidgetPrefs.save(context, l)
        scope.launch { updateFitterWidgets(context) }
    }

    LazyColumn(
        Modifier.fillMaxSize().screenBg(),
        contentPadding = PaddingValues(start = Side, end = Side, bottom = 130.dp),
    ) {
        item {
            Text(
                tr("Настройки", "Settings"), fontSize = 34.sp, fontWeight = FontWeight.ExtraBold, color = t.text, letterSpacing = (-0.8).sp,
                modifier = Modifier.statusBarsPadding().padding(start = 2.dp, top = 14.dp, bottom = 4.dp),
            )
        }
        item {
            Section(tr("Язык", "Language"))
            Card {
                Box(Modifier.padding(16.dp)) {
                    Segmented(listOf("English", "Русский"), if (Lang.code == "ru") 1 else 0) { i ->
                        scope.launch { FitterRepository.setLang(context, if (i == 1) "ru" else "en") }
                    }
                }
            }
            Note(tr("Язык бота, дневника в Telegram, приложения и виджетов один и тот же", "The bot, the Telegram diary, the app and the widgets all use the same language"))
        }

        item {
            Section(tr("Напоминания", "Reminders"))
            Card {
                LinkRow(tr("Напоминания", "Reminders"), t.text, sub = remindersLabel(reminders)) { remindersOpen = true }
            }
            Note(tr("Вода, еда и таблетки — уведомления с кнопками: записать стакан или отметить таблетку можно, не открывая приложение", "Water, food and pills — notifications with buttons: log a glass or mark a pill without opening the app"))
        }

        item {
            Section(tr("Оформление", "Appearance"))
            Card {
                Row(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(tr("Тема", "Theme"), color = t.text, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
                }
                Box(Modifier.padding(start = 16.dp, end = 16.dp, bottom = 14.dp)) {
                    Segmented(listOf(tr("Система", "System"), tr("Светлая", "Light"), tr("Тёмная", "Dark")), ThemeMode.entries.indexOf(mode)) { i ->
                        ThemePref.set(context, ThemeMode.entries[i])
                        scope.launch { updateFitterWidgets(context) }
                    }
                }
                Divider()
                Row(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(tr("Иконка", "Icon"), color = t.text, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
                }
                Row(Modifier.padding(start = 16.dp, end = 16.dp, bottom = 14.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    for (s in AppIconStyle.entries) IconChoice(s, s == icon) { AppIcon.set(context, s) }
                }
            }
            Note(tr("Виджеты повторяют тему: белые при светлой, чёрные при тёмной. Новая иконка появится на рабочем столе через несколько секунд", "Widgets follow the theme: white in light, black in dark. The new icon appears on the home screen in a few seconds"))
        }

        item {
            Section(tr("Виджеты", "Widgets"))
            Card {
                Preview(summary, look.copy(opacity = opacity.toInt()), t.dark)
                Divider()
                Column(Modifier.padding(start = 16.dp, end = 16.dp, top = 12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(tr("Непрозрачность фона", "Background opacity"), color = t.text, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
                        Text("${opacity.toInt()}%", color = t.hint, fontWeight = FontWeight.SemiBold)
                    }
                    Slider(
                        value = opacity, onValueChange = { opacity = it }, valueRange = 0f..100f, steps = 19,
                        onValueChangeFinished = { saveLook(look.copy(opacity = opacity.toInt())) },
                        colors = SliderDefaults.colors(
                            thumbColor = Palette.G2, activeTrackColor = Palette.G2, inactiveTrackColor = t.line,
                            activeTickColor = Color.Transparent, inactiveTickColor = Color.Transparent,
                        ),
                    )
                }
                Divider()
                val corners = listOf(8, 24, 36)
                ChoiceRow(tr("Углы", "Corners"), listOf(tr("Острые", "Sharp"), tr("Мягкие", "Soft"), tr("Круглые", "Round")), corners.indexOf(look.corners).coerceAtLeast(0)) { i -> saveLook(look.copy(corners = corners[i])) }
                Divider()
                ChoiceRow(tr("В кольце", "In the ring"), listOf(tr("Осталось", "Left"), tr("Съедено", "Eaten")), if (look.showEaten) 1 else 0) { i -> saveLook(look.copy(showEaten = i == 1)) }
                Divider()
                ToggleRow(tr("БЖУ в «Сегодня»", "Macros in “Today”"), look.showMacros) { saveLook(look.copy(showMacros = it)) }
                Divider()
                ToggleRow(tr("Вода в «Сегодня»", "Water in “Today”"), look.showWater) { saveLook(look.copy(showWater = it)) }
            }
            Note(tr("Добавить виджет: удерживай палец на рабочем столе → «Виджеты» → Fitter. Растягивай — содержимое подстроится", "To add a widget: long-press the home screen → “Widgets” → Fitter. Stretch it and the content adapts"))
        }

        item {
            Section(tr("Размер текста в виджетах", "Widget text size"))
            Card {
                TextPreview(summary, look, t.dark)
                Row(Modifier.padding(horizontal = 16.dp).padding(bottom = 14.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    val cur = Triple(look.numSize, look.textSize, look.capSize)
                    listOf("S", "M", "L", "XL").forEachIndexed { i, name ->
                        val p = WidgetLook.PRESETS[i]
                        val on = p == cur
                        Box(
                            Modifier.weight(1f).height(48.dp).clip(RoundedCornerShape(50))
                                .background(if (on) t.text else t.fill)
                                .clickable { saveLook(look.copy(numSize = p.first, textSize = p.second, capSize = p.third)) },
                            contentAlignment = Alignment.Center,
                        ) { Text(name, fontWeight = FontWeight.Bold, color = if (on) t.bg else t.text) }
                    }
                }
                Divider()
                Stepper(tr("Главное число", "Main number"), look.numSize, 16..44) { saveLook(look.copy(numSize = it)) }
                Divider()
                Stepper(tr("Текст", "Text"), look.textSize, 9..20) { saveLook(look.copy(textSize = it)) }
                Divider()
                Stepper(tr("Подписи", "Captions"), look.capSize, 8..16) { saveLook(look.copy(capSize = it)) }
                Divider()
                ToggleRow(tr("Не учитывать системный размер шрифта", "Ignore the system font size"), look.fixedFont) { saveLook(look.copy(fixedFont = it)) }
            }
            Note(tr("Размеры в sp для виджета обычного размера: растянутый виджет крупнее. Если переключатель включён, масштаб шрифта телефона на них не влияет", "Sizes are in sp for a regular-size widget: a stretched widget is bigger. With the switch on, the phone's font scale doesn't affect them"))
        }

        item {
            Section(tr("Аккаунт", "Account"))
            Card {
                LinkRow(tr("Открыть бота @FitterFoodBot", "Open the @FitterFoodBot bot"), t.text) { openUrl(context, BOT_URL) }
                Divider()
                LinkRow(tr("Выйти", "Sign out"), Palette.Danger, chevron = false) { scope.launch { FitterRepository.logout(context) } }
            }
            Text(
                "Fitter ${BuildConfig.VERSION_NAME}", fontSize = 12.sp, color = t.hint, textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(top = 24.dp),
            )
        }
    }
}

@Composable
private fun Section(title: String) {
    val t = LocalTokens.current
    Text(title, fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, color = t.text, letterSpacing = (-0.3).sp, modifier = Modifier.padding(start = 2.dp, top = 26.dp, bottom = 12.dp))
}

@Composable
private fun Card(content: @Composable ColumnScope.() -> Unit) {
    val t = LocalTokens.current
    Column(Modifier.fillMaxWidth().calCard(Group), content = content)
}

@Composable
private fun Divider() {
    val t = LocalTokens.current
    Box(Modifier.padding(start = 18.dp).fillMaxWidth().height(1.dp).background(t.line))
}

@Composable
private fun Note(text: String) {
    val t = LocalTokens.current
    Text(text, fontSize = 12.sp, color = t.hint, lineHeight = 16.sp, modifier = Modifier.padding(start = 4.dp, end = 4.dp, top = 8.dp))
}

/** Вариант иконки приложения: те же слои, что у адаптивной иконки, обрезанные скруглённым квадратом. */
@Composable
private fun IconChoice(style: AppIconStyle, on: Boolean, onClick: () -> Unit) {
    val t = LocalTokens.current
    val (bg, fg) = when (style) {
        AppIconStyle.GREEN -> R.drawable.ic_launcher_background to R.drawable.ic_launcher_foreground
        AppIconStyle.DARK -> R.drawable.ic_launcher_dark_background to R.drawable.ic_launcher_dark_foreground
    }
    val shape = RoundedCornerShape(18.dp)
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.clip(RoundedCornerShape(22.dp)).clickable(onClick = onClick).padding(4.dp)) {
        Box(
            Modifier.size(64.dp).border(2.dp, if (on) Palette.G2 else Color.Transparent, RoundedCornerShape(22.dp)).padding(4.dp).clip(shape),
        ) {
            // Слои 108 dp, видимая часть — 72 dp в центре: увеличиваем в 1,5 раза
            for (id in listOf(bg, fg)) Image(painterResource(id), null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize().graphicsLayer { scaleX = 1.5f; scaleY = 1.5f })
        }
        Text(style.title, fontSize = 13.sp, fontWeight = if (on) FontWeight.SemiBold else FontWeight.Normal, color = if (on) t.text else t.hint, modifier = Modifier.padding(top = 6.dp))
    }
}

/** Строка: название слева, компактный выбор справа. */
@Composable
private fun ChoiceRow(title: String, options: List<String>, selected: Int, onSelect: (Int) -> Unit) {
    val t = LocalTokens.current
    Row(Modifier.padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(title, color = t.text, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
        Box(Modifier.weight(1.6f)) { Segmented(options, selected, onSelect) }
    }
}

@Composable
private fun ToggleRow(title: String, value: Boolean, onChange: (Boolean) -> Unit) {
    val t = LocalTokens.current
    Row(Modifier.fillMaxWidth().clickable { onChange(!value) }.padding(horizontal = 16.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(title, color = t.text, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
        Switch(
            checked = value, onCheckedChange = onChange,
            colors = SwitchDefaults.colors(
                checkedTrackColor = Palette.G2, checkedThumbColor = Color.White, checkedBorderColor = Color.Transparent,
                uncheckedTrackColor = t.fill, uncheckedThumbColor = t.hint, uncheckedBorderColor = t.line,
            ),
        )
    }
}

@Composable
private fun LinkRow(title: String, color: Color, chevron: Boolean = true, sub: String? = null, onClick: () -> Unit) {
    val t = LocalTokens.current
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 18.dp, vertical = if (sub == null) 17.dp else 13.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, color = color, fontWeight = FontWeight.Medium)
            if (sub != null) Text(sub, color = t.hint, fontSize = 13.sp, maxLines = 1)
        }
        if (chevron) Text("›", color = t.hint, fontSize = 20.sp)
    }
}

/** Подпись под кнопкой «Напоминания»: что включено. */
private fun remindersLabel(s: ReminderSettings): String {
    val on = listOfNotNull(
        if (s.water) tr("вода каждые ${hours(s.waterEvery)}", "water every ${hours(s.waterEvery)}") else null,
        if (s.meals) tr("еда", "food") else null,
        if (s.pills) tr("таблетки", "pills") else null,
    )
    return if (on.isEmpty()) tr("Выключены", "Off") else on.joinToString(" · ").replaceFirstChar { it.uppercase() }
}

private fun hours(min: Int) = if (min % 60 == 0) tr("${min / 60} ч", "${min / 60} h") else tr("${min / 60},${min % 60 * 10 / 60} ч", "${min / 60}.${min % 60 * 10 / 60} h")
private fun clock(min: Int) = String.format(Locale.ROOT, "%02d:%02d", min / 60, min % 60)

/**
 * «Настройки → Напоминания»: что и когда напоминать. Каждое изменение сразу пересчитывает будильники.
 * Включение любого напоминания на Android 13+ спрашивает разрешение на уведомления.
 */
@Composable
private fun RemindersScreen(onBack: () -> Unit) {
    val t = LocalTokens.current
    val context = LocalContext.current
    val s by ReminderPrefs.settings.collectAsState()
    var allowed by remember { mutableStateOf(NotificationManagerCompat.from(context).areNotificationsEnabled()) }
    // Вернулись из системных настроек — проверяем разрешение заново
    LifecycleResumeEffect(Unit) {
        allowed = NotificationManagerCompat.from(context).areNotificationsEnabled()
        onPauseOrDispose { }
    }
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { allowed = it }
    BackHandler(onBack = onBack)

    fun save(n: ReminderSettings) {
        if (n.any && !allowed && Build.VERSION.SDK_INT >= 33) ask.launch(Manifest.permission.POST_NOTIFICATIONS)
        ReminderPrefs.save(context, n)
        Reminders.schedule(context)
    }

    LazyColumn(
        Modifier.fillMaxSize().screenBg(),
        contentPadding = PaddingValues(start = Side, end = Side, bottom = 130.dp),
    ) {
        item {
            Text(
                tr("‹ Настройки", "‹ Settings"), color = t.hint, fontWeight = FontWeight.SemiBold, fontSize = 15.sp,
                modifier = Modifier.statusBarsPadding().padding(top = 10.dp).clip(RoundedCornerShape(10.dp)).clickable(onClick = onBack).padding(vertical = 6.dp, horizontal = 2.dp),
            )
            Text(tr("Напоминания", "Reminders"), fontSize = 34.sp, fontWeight = FontWeight.ExtraBold, color = t.text, letterSpacing = (-0.8).sp, modifier = Modifier.padding(start = 2.dp, top = 2.dp, bottom = 4.dp))
        }

        if (s.any && !allowed) item {
            Spacer(Modifier.height(12.dp))
            Card {
                Column(Modifier.padding(16.dp)) {
                    Text(tr("Уведомления выключены", "Notifications are off"), color = Palette.Danger, fontWeight = FontWeight.Bold)
                    Text(tr("Без разрешения напоминания не придут. Включи уведомления для Fitter в настройках телефона.", "Without permission, reminders won't arrive. Turn on notifications for Fitter in your phone settings."), color = t.hint, fontSize = 13.sp, lineHeight = 17.sp, modifier = Modifier.padding(top = 4.dp, bottom = 12.dp))
                    SoftButton(tr("Открыть настройки уведомлений", "Open notification settings")) {
                        context.startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                    }
                }
            }
        }

        item {
            Section(tr("💧 Вода", "💧 Water"))
            Card {
                ToggleRow(tr("Напоминать пить воду", "Remind me to drink water"), s.water) { save(s.copy(water = it)) }
                if (s.water) {
                    Divider()
                    val steps = ReminderSettings.WATER_STEPS
                    ChoiceRow(tr("Как часто", "How often"), steps.map { hours(it) }, steps.indexOf(s.waterEvery).coerceAtLeast(0)) { save(s.copy(waterEvery = steps[it])) }
                    Divider()
                    TimeRow(tr("Первое", "First"), s.waterFrom) { save(s.copy(waterFrom = it)) }
                    Divider()
                    TimeRow(tr("Последнее", "Last"), s.waterTo) { save(s.copy(waterTo = it)) }
                    Divider()
                    ToggleRow(tr("Молчать, когда норма выпита", "Stay quiet once the goal is reached"), s.waterQuietDone) { save(s.copy(waterQuietDone = it)) }
                }
            }
            Note(tr("В уведомлении — сколько выпито и кнопка «＋ Стакан 250 мл»: вода запишется сразу. «Через 30 мин» — напомнить позже", "The notification shows how much you've had and a “＋ Glass 250 ml” button: the water is logged right away. “In 30 min” reminds you later"))
        }

        item {
            Section(tr("🍽 Еда", "🍽 Food"))
            Card {
                ToggleRow(tr("Напоминать записать еду", "Remind me to log food"), s.meals) { save(s.copy(meals = it)) }
                if (s.meals) {
                    Divider()
                    MealRow(tr("Завтрак", "Breakfast"), s.breakfast) { save(s.copy(breakfast = it)) }
                    Divider()
                    MealRow(tr("Обед", "Lunch"), s.lunch) { save(s.copy(lunch = it)) }
                    Divider()
                    MealRow(tr("Ужин", "Dinner"), s.dinner) { save(s.copy(dinner = it)) }
                    Divider()
                    ToggleRow(tr("Молчать, если уже записал", "Stay quiet if already logged"), s.mealQuietLogged) { save(s.copy(mealQuietLogged = it)) }
                }
            }
            Note(tr("Кнопка «📸 Сфотографировать» в уведомлении сразу открывает камеру. Если еду записали за 2 часа до напоминания, оно не придёт", "The “📸 Take a photo” button in the notification opens the camera right away. If you logged food within 2 hours before the reminder, it won't come"))
        }

        item {
            Section(tr("💊 Таблетки", "💊 Pills"))
            Card {
                ToggleRow(tr("Напоминать о таблетках", "Remind me about pills"), s.pills) { save(s.copy(pills = it)) }
            }
            Note(tr("Список и время — те же, что в боте (/pills). В уведомлении сразу можно нажать «✓ Принял» или «Пропустить»", "The list and times are the same as in the bot (/pills). In the notification you can tap “✓ Taken” or “Skip” right away"))
        }

        if (s.any) item {
            Spacer(Modifier.height(24.dp))
            PrimaryButton(tr("Прислать пример уведомления", "Send a sample notification")) {
                if (!allowed && Build.VERSION.SDK_INT >= 33) ask.launch(Manifest.permission.POST_NOTIFICATIONS) else Reminders.test(context)
            }
        }
    }
}

/** Строка со временем: нажатие открывает часы. */
@Composable
private fun TimeRow(title: String, minutes: Int, onPick: (Int) -> Unit) {
    val t = LocalTokens.current
    Row(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(title, color = t.text, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
        TimeChip(minutes, true, onPick)
    }
}

/** Приём пищи: время и переключатель. */
@Composable
private fun MealRow(title: String, slot: MealSlot, onChange: (MealSlot) -> Unit) {
    val t = LocalTokens.current
    Row(Modifier.padding(start = 16.dp, end = 16.dp, top = 6.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(title, color = if (slot.on) t.text else t.hint, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
        TimeChip(slot.at, slot.on) { onChange(slot.copy(at = it, on = true)) }
        Spacer(Modifier.width(10.dp))
        Switch(
            checked = slot.on, onCheckedChange = { onChange(slot.copy(on = it)) },
            colors = SwitchDefaults.colors(
                checkedTrackColor = Palette.G2, checkedThumbColor = Color.White, checkedBorderColor = Color.Transparent,
                uncheckedTrackColor = t.fill, uncheckedThumbColor = t.hint, uncheckedBorderColor = t.line,
            ),
        )
    }
}

/** Плашка «13:30»; нажатие — выбор времени в 24-часовых часах. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TimeChip(minutes: Int, on: Boolean, onPick: (Int) -> Unit) {
    val t = LocalTokens.current
    var open by remember { mutableStateOf(false) }
    Text(
        clock(minutes), fontSize = 17.sp, fontWeight = FontWeight.SemiBold, color = if (on) t.text else t.hint,
        modifier = Modifier.clip(RoundedCornerShape(50)).background(t.fill).clickable { open = true }.padding(horizontal = 16.dp, vertical = 9.dp),
    )
    if (open) {
        val state = rememberTimePickerState(minutes / 60, minutes % 60, is24Hour = true)
        AlertDialog(
            onDismissRequest = { open = false },
            confirmButton = { TextButton({ open = false; onPick(state.hour * 60 + state.minute) }) { Text(tr("Готово", "Done"), color = Palette.G2, fontWeight = FontWeight.Bold) } },
            dismissButton = { TextButton({ open = false }) { Text(tr("Отмена", "Cancel"), color = t.hint) } },
            text = { TimePicker(state, colors = TimePickerDefaults.colors(selectorColor = Palette.G2, timeSelectorSelectedContainerColor = Palette.G2.copy(alpha = 0.18f))) },
            containerColor = t.card,
        )
    }
}

/** Выбор как в iOS: серая дорожка, выбранный вариант — светлая плашка. */
@Composable
private fun Segmented(options: List<String>, selected: Int, onSelect: (Int) -> Unit) {
    val t = LocalTokens.current
    Row(Modifier.fillMaxWidth().background(t.fill, RoundedCornerShape(50)).padding(3.dp)) {
        options.forEachIndexed { i, o ->
            val on = i == selected
            Box(
                Modifier.weight(1f).clip(RoundedCornerShape(50))
                    .background(if (on) (if (t.dark) Color(0xFF3A3A42) else Color.White) else Color.Transparent)
                    .clickable { onSelect(i) }.padding(vertical = 7.dp),
                contentAlignment = Alignment.Center,
            ) { Text(o, fontSize = 13.sp, fontWeight = if (on) FontWeight.SemiBold else FontWeight.Normal, color = if (on) t.text else t.hint, maxLines = 1) }
        }
    }
}

/**
 * Предпросмотр «Калорий»: тот же цвет, прозрачность, углы и кольцо, что у настоящего виджета.
 * Под ним мягкий градиент вместо обоев, чтобы прозрачность было видно.
 */
@Composable
private fun Preview(summary: Summary?, look: WidgetLook, dark: Boolean) {
    val s = summary ?: Summary("", 1340, 72, 48, 150, Targets(2100, 120, 70, 260), 1250, 2000, 3, 5, 0, 0, "", "")
    val skin = skinOf(dark, look)
    val density = LocalDensity.current.density
    val ringPx = (78 * density).toInt()
    val ring = remember(s.progress, dark) { ringBitmap(skin, s.progress, ringPx, 7 * density).asImageBitmap() }
    val shape = RoundedCornerShape((look.corners * 0.8f).dp)
    val wall = if (dark) listOf(Color(0xFF1C2B3A), Color(0xFF2A2140), Color(0xFF13261D)) else listOf(Color(0xFFD9ECFF), Color(0xFFEADCFF), Color(0xFFDDF7E8))
    Box(
        Modifier.fillMaxWidth().padding(12.dp).height(150.dp).clip(RoundedCornerShape(12.dp))
            .background(Brush.linearGradient(wall, start = Offset.Zero, end = Offset(900f, 500f))),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            Modifier.size(124.dp).clip(shape)
                .background(skin.base.copy(alpha = look.opacity / 100f), shape)
                .border(1.dp, skin.edge.copy(alpha = skin.edge.alpha * (0.5f + look.opacity / 200f)), shape),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Box(Modifier.size(78.dp), contentAlignment = Alignment.Center) {
                Image(ring, null, Modifier.size(78.dp))
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(n(if (look.showEaten) s.kcal else kotlin.math.abs(s.kcalLeft)), fontSize = 16.sp, fontWeight = FontWeight.ExtraBold, color = skin.ink)
                    Text(if (look.showEaten) tr("съедено", "eaten") else tr("осталось", "left"), fontSize = 8.sp, color = skin.mut)
                }
            }
            Spacer(Modifier.height(4.dp))
            Text(tr("${n(s.kcal)} из ${n(s.targets.kcal)}", "${n(s.kcal)} of ${n(s.targets.kcal)}"), fontSize = 9.sp, color = skin.mut)
        }
    }
}

/** Строка «название — число +»: квадратные кнопки, как в настройках Okto. */
@Composable
private fun Stepper(title: String, value: Int, range: IntRange, onChange: (Int) -> Unit) {
    val t = LocalTokens.current
    Row(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(title, color = t.text, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
        StepButton("−", value > range.first) { onChange(value - 1) }
        Text("$value", color = t.text, fontWeight = FontWeight.SemiBold, fontSize = 17.sp, textAlign = TextAlign.Center, modifier = Modifier.width(48.dp))
        StepButton("+", value < range.last) { onChange(value + 1) }
    }
}

@Composable
private fun StepButton(label: String, enabled: Boolean, onClick: () -> Unit) {
    val t = LocalTokens.current
    Box(
        Modifier.size(44.dp).clip(CircleShape).background(t.fill)
            .clickable(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { Text(label, fontSize = 20.sp, fontWeight = FontWeight.Bold, color = if (enabled) t.text else t.hint) }
}

/**
 * Предпросмотр размеров: кусочек виджета «Сегодня» с настоящими размерами текста —
 * главное число, строка БЖУ и серая подпись. Учитывает «Не учитывать системный размер шрифта».
 */
@Composable
private fun TextPreview(summary: Summary?, look: WidgetLook, dark: Boolean) {
    val s = summary ?: Summary("", 1340, 72, 48, 150, Targets(2100, 120, 70, 260), 1250, 2000, 3, 5, 0, 0, "", "")
    val skin = skinOf(dark, look.copy(opacity = 100))
    val d = LocalDensity.current
    // sp в Compose уже умножены на масштаб шрифта телефона; если его надо не учитывать — делим обратно
    val k = if (look.fixedFont) 1f / d.fontScale else 1f
    val ringPx = (64 * d.density).toInt()
    val ring = remember(s.progress, dark) { ringBitmap(skin, s.progress, ringPx, 6 * d.density).asImageBitmap() }
    Row(
        Modifier.padding(12.dp).fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(skin.base)
            .border(1.dp, skin.edge, RoundedCornerShape(16.dp)).padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Image(ring, null, Modifier.size(64.dp))
        Spacer(Modifier.width(14.dp))
        Column {
            Text(n(if (look.showEaten) s.kcal else kotlin.math.abs(s.kcalLeft)), fontSize = (look.numSize * k).sp, fontWeight = FontWeight.Bold, color = skin.ink, maxLines = 1)
            Text(tr("Белки ${s.p} / ${s.targets.p} г", "Protein ${s.p} / ${s.targets.p} g"), fontSize = (look.textSize * k).sp, fontWeight = FontWeight.Medium, color = skin.ink, maxLines = 1)
            Text(if (look.showEaten) tr("съедено ккал", "kcal eaten") else tr("осталось ккал", "kcal left"), fontSize = (look.capSize * k).sp, color = skin.mut, maxLines = 1)
        }
    }
}
