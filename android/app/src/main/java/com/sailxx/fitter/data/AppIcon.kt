package com.sailxx.fitter.data

import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/** Иконка на рабочем столе: alias из AndroidManifest.xml и её слои для превью в настройках. */
enum class AppIconStyle(private val ru: String, private val en: String, val alias: String) {
    GREEN("Зелёная", "Green", "com.sailxx.fitter.IconGreen"),
    DARK("Тёмная", "Dark", "com.sailxx.fitter.IconDark");

    val title get() = tr(ru, en)
}

/**
 * Выбор иконки хранится в самой системе: включён ровно один activity-alias с LAUNCHER.
 * Лаунчер обновляет значок не сразу — обычно через несколько секунд.
 */
object AppIcon {
    private val _style = MutableStateFlow(AppIconStyle.GREEN)
    val style: StateFlow<AppIconStyle> get() = _style

    fun load(context: Context): AppIconStyle {
        val pm = context.packageManager
        val s = AppIconStyle.entries.firstOrNull {
            pm.getComponentEnabledSetting(ComponentName(context, it.alias)) == PackageManager.COMPONENT_ENABLED_STATE_ENABLED
        } ?: AppIconStyle.GREEN // по умолчанию из манифеста включена зелёная
        _style.value = s
        return s
    }

    fun set(context: Context, style: AppIconStyle) {
        if (style == load(context)) return
        val pm = context.packageManager
        // Сначала включаем новую, потом выключаем остальные: так значок не пропадает с экрана совсем
        pm.setComponentEnabledSetting(ComponentName(context, style.alias), PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP)
        for (other in AppIconStyle.entries) if (other != style) {
            pm.setComponentEnabledSetting(ComponentName(context, other.alias), PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP)
        }
        _style.value = style
    }
}
