package com.sailxx.fitter.data

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/** Приём пищи в напоминаниях: время в минутах от полуночи и включён ли он. */
data class MealSlot(val on: Boolean, val at: Int)

/** Настройки напоминаний из «Настройки → Напоминания». Время — в минутах от полуночи по часам телефона. */
data class ReminderSettings(
    val water: Boolean = false,
    val waterEvery: Int = 90, // как часто, минут
    val waterFrom: Int = 9 * 60, // первое напоминание
    val waterTo: Int = 21 * 60, // последнее — не позже
    val waterQuietDone: Boolean = true, // молчать, когда норма воды выпита
    val meals: Boolean = false,
    val breakfast: MealSlot = MealSlot(true, 9 * 60),
    val lunch: MealSlot = MealSlot(true, 13 * 60 + 30),
    val dinner: MealSlot = MealSlot(true, 19 * 60),
    val mealQuietLogged: Boolean = true, // молчать, если еду уже записали незадолго до этого
    val pills: Boolean = false,
) {
    val any get() = water || meals || pills

    companion object {
        val WATER_STEPS = listOf(60, 90, 120, 180)
    }
}

object ReminderPrefs {
    private const val PREFS = "fitter_reminders"
    private val _settings = MutableStateFlow(ReminderSettings())
    val settings: StateFlow<ReminderSettings> get() = _settings

    fun load(context: Context): ReminderSettings {
        val p = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        fun slot(key: String, d: MealSlot) = MealSlot(p.getBoolean("${key}_on", d.on), p.getInt("${key}_at", d.at).coerceIn(0, 24 * 60 - 1))
        val d = ReminderSettings()
        val s = ReminderSettings(
            water = p.getBoolean("water", d.water),
            waterEvery = p.getInt("water_every", d.waterEvery).let { if (it in ReminderSettings.WATER_STEPS) it else d.waterEvery },
            waterFrom = p.getInt("water_from", d.waterFrom).coerceIn(0, 24 * 60 - 1),
            waterTo = p.getInt("water_to", d.waterTo).coerceIn(0, 24 * 60 - 1),
            waterQuietDone = p.getBoolean("water_quiet", d.waterQuietDone),
            meals = p.getBoolean("meals", d.meals),
            breakfast = slot("breakfast", d.breakfast),
            lunch = slot("lunch", d.lunch),
            dinner = slot("dinner", d.dinner),
            mealQuietLogged = p.getBoolean("meals_quiet", d.mealQuietLogged),
            pills = p.getBoolean("pills", d.pills),
        )
        _settings.value = s
        return s
    }

    fun save(context: Context, s: ReminderSettings) {
        _settings.value = s
        val e = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
        fun slot(key: String, v: MealSlot) { e.putBoolean("${key}_on", v.on).putInt("${key}_at", v.at) }
        e.putBoolean("water", s.water).putInt("water_every", s.waterEvery)
            .putInt("water_from", s.waterFrom).putInt("water_to", s.waterTo).putBoolean("water_quiet", s.waterQuietDone)
            .putBoolean("meals", s.meals).putBoolean("meals_quiet", s.mealQuietLogged).putBoolean("pills", s.pills)
        slot("breakfast", s.breakfast); slot("lunch", s.lunch); slot("dinner", s.dinner)
        e.apply()
    }
}
