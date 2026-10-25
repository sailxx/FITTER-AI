package com.sailxx.fitter.notify

import com.sailxx.fitter.data.Lang
import com.sailxx.fitter.data.tr
import android.annotation.SuppressLint
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import android.util.Log
import androidx.annotation.DrawableRes
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.sailxx.fitter.R
import com.sailxx.fitter.data.FitterRepository
import com.sailxx.fitter.data.PillDose
import com.sailxx.fitter.data.ReminderPrefs
import com.sailxx.fitter.data.ReminderSettings
import com.sailxx.fitter.data.Summary
import com.sailxx.fitter.ui.Launch
import com.sailxx.fitter.ui.MainActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import java.util.Locale
import kotlin.math.ceil

/**
 * Напоминания приложения: вода, еда и таблетки — без сервера, будильниками AlarmManager.
 * На каждое напоминание — один будильник; сработал — сверяемся со свежими данными, показываем уведомление
 * и ставим следующий. Расписание пересчитывается после каждого обновления данных (FitterRepository.refresh).
 */
object Reminders {
    private const val TAG = "Fitter"
    private const val CH_WATER = "water"
    private const val CH_MEALS = "meals"
    private const val CH_PILLS = "pills"
    private const val ID_WATER = 1001
    private const val ID_MEAL = 1002
    private const val SNOOZE_MIN = 30L
    const val GLASS = 250

    const val ACTION_FIRE = "com.sailxx.fitter.REMIND"
    const val ACTION_WATER_ADD = "com.sailxx.fitter.WATER_ADD"
    const val ACTION_SNOOZE = "com.sailxx.fitter.WATER_SNOOZE"
    const val ACTION_PILL = "com.sailxx.fitter.PILL_MARK"

    private val WATER_BLUE = 0xFF2A7BF0.toInt()
    private val GREEN = 0xFF16B86A.toInt()
    private val PILL_PINK = 0xFFE5487A.toInt()

    /** Что напоминаем; code — номер будильника. */
    enum class Kind(val code: Int, private val ru: String, private val en: String) {
        WATER(1, "", ""),
        BREAKFAST(2, "Время завтрака 🍳", "Breakfast time 🍳"),
        LUNCH(3, "Время обеда 🍲", "Lunch time 🍲"),
        DINNER(4, "Время ужина 🥗", "Dinner time 🥗"),
        PILL(5, "", "");

        val title get() = tr(ru, en)
    }

    private val zone get() = ZoneId.systemDefault()
    private fun prefs(context: Context) = context.applicationContext.getSharedPreferences("fitter_reminders", Context.MODE_PRIVATE)

    // ---------- расписание ----------

    /** Поставить будильники на ближайшие напоминания по настройкам; без входа — снять все. */
    fun schedule(context: Context) {
        val s = ReminderPrefs.load(context)
        val loggedIn = FitterRepository.token(context) != null
        val now = ZonedDateTime.now(zone)
        val snooze = prefs(context).getLong("water_snooze", 0)
        val water = when {
            !loggedIn || !s.water -> null
            snooze > System.currentTimeMillis() -> snooze
            else -> nextWater(s, now)?.toInstant()?.toEpochMilli()
        }
        set(context, Kind.WATER, water)
        set(context, Kind.BREAKFAST, if (loggedIn && s.meals && s.breakfast.on) nextAt(s.breakfast.at, now) else null)
        set(context, Kind.LUNCH, if (loggedIn && s.meals && s.lunch.on) nextAt(s.lunch.at, now) else null)
        set(context, Kind.DINNER, if (loggedIn && s.meals && s.dinner.on) nextAt(s.dinner.at, now) else null)
        val pill = if (loggedIn && s.pills) nextPill(context, now) else null
        set(context, Kind.PILL, pill?.first, pill?.second)
    }

    private fun alarmIntent(context: Context, kind: Kind, time: String?): PendingIntent =
        PendingIntent.getBroadcast(
            context, kind.code,
            Intent(context, ReminderReceiver::class.java).setAction(ACTION_FIRE).putExtra("kind", kind.name).putExtra("time", time),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )

    private fun set(context: Context, kind: Kind, at: Long?, time: String? = null) {
        val am = context.getSystemService(AlarmManager::class.java) ?: return
        val pi = alarmIntent(context, kind, time)
        if (at == null) am.cancel(pi)
        // Неточный будильник: точные требуют отдельного разрешения, а сдвиг на пару минут для напоминания не важен
        else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
    }

    /** Ближайшее время воды: от «С» каждые N минут, но не позже «До»; сегодня или завтра. */
    fun nextWater(s: ReminderSettings, now: ZonedDateTime): ZonedDateTime? {
        val to = if (s.waterTo > s.waterFrom) s.waterTo else s.waterFrom
        for (d in 0L..1L) {
            val start = now.toLocalDate().plusDays(d).atStartOfDay(zone)
            var m = s.waterFrom
            while (m <= to) {
                val t = start.plusMinutes(m.toLong())
                if (t.isAfter(now.plusSeconds(30))) return t
                m += s.waterEvery
            }
        }
        return null
    }

    private fun nextAt(minute: Int, now: ZonedDateTime): Long {
        var t = now.toLocalDate().atStartOfDay(zone).plusMinutes(minute.toLong())
        if (!t.isAfter(now.plusSeconds(30))) t = t.plusDays(1)
        return t.toInstant().toEpochMilli()
    }

    /** "09:30" → 570; что-то другое → null. */
    private fun minutes(hhmm: String): Int? {
        val p = hhmm.split(":")
        val h = p.getOrNull(0)?.toIntOrNull() ?: return null
        val m = p.getOrNull(1)?.toIntOrNull() ?: return null
        return if (h in 0..23 && m in 0..59) h * 60 + m else null
    }

    /** Ближайшая неотмеченная таблетка сегодня: время будильника и её "HH:MM". */
    private fun nextPill(context: Context, now: ZonedDateTime): Pair<Long, String>? {
        val day = FitterRepository.load(context).day ?: return null
        if (day.date.isNotEmpty() && day.date != LocalDate.now(zone).toString()) return null
        return day.pills.filter { it.s.isEmpty() }
            .mapNotNull { p -> minutes(p.time)?.let { now.toLocalDate().atStartOfDay(zone).plusMinutes(it.toLong()) to p.time } }
            .filter { it.first.isAfter(now.plusSeconds(30)) }
            .minByOrNull { it.first }
            ?.let { it.first.toInstant().toEpochMilli() to it.second }
    }

    // ---------- срабатывание ----------

    /** Будильник сработал: подтянуть свежие данные, решить, нужно ли напоминать, и показать уведомление. */
    suspend fun fire(context: Context, kind: Kind, time: String?) {
        val s = ReminderPrefs.load(context)
        if (FitterRepository.token(context) == null) return schedule(context)
        if (kind == Kind.WATER) prefs(context).edit().remove("water_snooze").apply()
        withTimeoutOrNull(7000) { FitterRepository.refresh(context) }
        val st = FitterRepository.load(context)
        when (kind) {
            Kind.WATER -> st.summary?.let { if (!(s.waterQuietDone && it.water >= goal(it))) showWater(context, it) }
            Kind.PILL -> st.day?.pills.orEmpty().filter { it.time == time && it.s.isEmpty() }.forEach { showPill(context, it) }
            else -> {
                val slot = when (kind) { Kind.BREAKFAST -> s.breakfast; Kind.LUNCH -> s.lunch; else -> s.dinner }
                // Уже записали еду за последние два часа — значит, не забыли
                val logged = s.mealQuietLogged && st.day?.meals.orEmpty().any { m -> minutes(m.time)?.let { it >= slot.at - 120 } == true }
                if (!logged) showMeal(context, kind, st.summary)
            }
        }
        schedule(context)
    }

    /** «+ Стакан» в уведомлении: записать воду и показать, сколько стало. */
    suspend fun addWater(context: Context) {
        FitterRepository.load(context)
        withTimeoutOrNull(8000) { FitterRepository.addWater(context, GLASS) }
        val sum = FitterRepository.load(context).summary ?: return cancel(context, ID_WATER)
        val next = nextWater(ReminderPrefs.load(context), ZonedDateTime.now(zone))
        val done = sum.water >= goal(sum)
        post(
            context, ID_WATER,
            base(context, CH_WATER, R.drawable.ic_nav_glass, R.drawable.ic_water, WATER_BLUE)
                .setContentTitle(if (done) tr("Норма воды выполнена 🎉", "Water goal reached 🎉") else tr("Записал стакан 💧", "Glass logged 💧"))
                .setContentText(tr("Теперь ${liters(sum.water)} из ${liters(goal(sum))} л", "Now ${liters(sum.water)} of ${liters(goal(sum))} L") + (next?.let { tr(" · следующее в ${hhmm(it)}", " · next at ${hhmm(it)}") } ?: ""))
                .setProgress(goal(sum), sum.water.coerceAtMost(goal(sum)), false)
                .setOnlyAlertOnce(true)
                .setTimeoutAfter(6000),
        )
    }

    /** «Через 30 мин»: убрать уведомление и напомнить снова. */
    fun snoozeWater(context: Context) {
        cancel(context, ID_WATER)
        prefs(context).edit().putLong("water_snooze", System.currentTimeMillis() + SNOOZE_MIN * 60_000).apply()
        schedule(context)
    }

    /** «Принял» / «Пропустить» в уведомлении о таблетке. */
    suspend fun markPill(context: Context, id: String, time: String, s: String, name: String) {
        val nid = pillId(id, time)
        FitterRepository.load(context)
        withTimeoutOrNull(8000) { FitterRepository.markPill(context, id, time, s) }
        post(
            context, nid,
            base(context, CH_PILLS, R.drawable.ic_nav_pill, R.drawable.ic_pill, PILL_PINK)
                .setContentTitle(if (s == "taken") tr("Отметил: $name ✓", "Marked: $name ✓") else tr("Пропустил: $name", "Skipped: $name"))
                .setContentText(if (s == "taken") tr("Так держать! Отметка уже в дневнике", "Keep it up! The mark is already in your diary") else tr("Отметка «пропущено» в дневнике", "“Skipped” is noted in your diary"))
                .setOnlyAlertOnce(true)
                .setTimeoutAfter(5000),
        )
    }

    /** Пример уведомлений из настроек: как они выглядят, с рабочими кнопками. */
    fun test(context: Context) {
        val sum = FitterRepository.load(context).summary
        if (sum != null) showWater(context, sum)
        showMeal(context, Kind.LUNCH, sum)
    }

    // ---------- уведомления ----------

    private fun showWater(context: Context, sum: Summary) {
        val g = goal(sum)
        val left = ceil((g - sum.water).coerceAtLeast(0) / GLASS.toDouble()).toInt()
        val done = sum.water >= g
        val every = ReminderPrefs.settings.value.waterEvery
        post(
            context, ID_WATER,
            base(context, CH_WATER, R.drawable.ic_nav_glass, R.drawable.ic_water, WATER_BLUE)
                .setContentTitle(if (done) tr("Норма воды выполнена 🎉", "Water goal reached 🎉") else tr("Пора выпить стакан воды 💧", "Time for a glass of water 💧"))
                .setContentText(
                    if (done) tr("Выпито ${liters(sum.water)} л — ещё стакан не помешает", "${liters(sum.water)} L so far — one more glass won't hurt")
                    else tr("Выпито ${liters(sum.water)} из ${liters(g)} л — осталось $left ${plural(left, "стакан", "стакана", "стаканов")}", "${liters(sum.water)} of ${liters(g)} L — $left ${if (left == 1) "glass" else "glasses"} to go"),
                )
                .setSubText("${(sum.water * 100 / g).coerceAtMost(999)}%")
                .setProgress(g, sum.water.coerceAtMost(g), false)
                .addAction(0, tr("＋ Стакан $GLASS мл", "＋ Glass $GLASS ml"), broadcast(context, ACTION_WATER_ADD, 11))
                .addAction(0, tr("Через $SNOOZE_MIN мин", "In $SNOOZE_MIN min"), broadcast(context, ACTION_SNOOZE, 12))
                .setTimeoutAfter(every * 60_000L),
        )
    }

    private fun showMeal(context: Context, kind: Kind, sum: Summary?) {
        val left = sum?.kcalLeft
        val body = (if (left != null && left > 0) tr("На сегодня осталось ${num(left)} ккал. ", "${num(left)} kcal left today. ") else "") +
            tr("Сфотографируй тарелку — посчитаю калории и БЖУ за пару секунд.", "Photograph your plate and I'll count calories and macros in a couple of seconds.")
        post(
            context, ID_MEAL,
            base(context, CH_MEALS, R.drawable.ic_nav_camera, R.drawable.ic_plate, GREEN)
                .setContentTitle(kind.title)
                .setContentText(tr("Сфотографируй тарелку — посчитаю калории", "Photograph your plate and I'll count the calories"))
                .setStyle(NotificationCompat.BigTextStyle().bigText(body))
                .addAction(0, tr("📸 Сфотографировать", "📸 Take a photo"), openApp(context, "camera", 21))
                .addAction(0, tr("✍️ Записать текстом", "✍️ Type it"), openApp(context, "text", 22))
                .setTimeoutAfter(3 * 60 * 60_000L),
        )
    }

    private fun showPill(context: Context, p: PillDose) {
        val nid = pillId(p.id, p.time)
        fun mark(s: String, code: Int) = PendingIntent.getBroadcast(
            context, nid * 4 + code,
            Intent(context, ReminderReceiver::class.java).setAction(ACTION_PILL)
                .putExtra("id", p.id).putExtra("time", p.time).putExtra("s", s).putExtra("name", p.name),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        post(
            context, nid,
            base(context, CH_PILLS, R.drawable.ic_nav_pill, R.drawable.ic_pill, PILL_PINK)
                .setContentTitle(tr("Пора принять: ${p.name} 💊", "Time to take: ${p.name} 💊"))
                .setContentText(listOf(p.dose, p.time).filter { it.isNotBlank() }.joinToString(" · "))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .addAction(0, tr("✓ Принял", "✓ Taken"), mark("taken", 1))
                .addAction(0, tr("Пропустить", "Skip"), mark("skip", 2)),
        )
    }

    /** Общее для всех: значок в строке состояния, цветная картинка справа, нажатие открывает приложение. */
    private fun base(context: Context, channel: String, @DrawableRes small: Int, @DrawableRes large: Int, color: Int): NotificationCompat.Builder {
        channels(context)
        return NotificationCompat.Builder(context, channel)
            .setSmallIcon(small)
            .setLargeIcon(BitmapFactory.decodeResource(context.resources, large))
            .setColor(color)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setAutoCancel(true)
            .setContentIntent(openApp(context, null, 20))
    }

    private fun channels(context: Context) {
        // Вызов повторно обновляет названия существующих каналов: они меняются вместе с языком приложения
        val nm = context.getSystemService(NotificationManager::class.java) ?: return
        nm.createNotificationChannels(
            listOf(
                NotificationChannel(CH_WATER, tr("Вода", "Water"), NotificationManager.IMPORTANCE_DEFAULT).apply { description = tr("Пора выпить стакан воды", "Time to drink a glass of water") },
                NotificationChannel(CH_MEALS, tr("Еда", "Food"), NotificationManager.IMPORTANCE_DEFAULT).apply { description = tr("Записать завтрак, обед и ужин", "Log breakfast, lunch and dinner") },
                NotificationChannel(CH_PILLS, tr("Таблетки", "Pills"), NotificationManager.IMPORTANCE_HIGH).apply { description = tr("Принять таблетки и витамины по расписанию из бота", "Take pills and vitamins on the schedule from the bot") },
            ),
        )
    }

    @SuppressLint("MissingPermission")
    private fun post(context: Context, id: Int, b: NotificationCompat.Builder) {
        val nm = NotificationManagerCompat.from(context)
        if (!nm.areNotificationsEnabled()) return
        try { nm.notify(id, b.build()) } catch (e: SecurityException) { Log.w(TAG, "notify denied", e) }
    }

    private fun cancel(context: Context, id: Int) = NotificationManagerCompat.from(context).cancel(id)

    private fun broadcast(context: Context, action: String, code: Int) = PendingIntent.getBroadcast(
        context, code, Intent(context, ReminderReceiver::class.java).setAction(action),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    /** Открыть приложение; add = "camera" сразу включает камеру, "text" — окно «Добавить еду». */
    private fun openApp(context: Context, add: String?, code: Int) = PendingIntent.getActivity(
        context, code,
        Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK).apply { if (add != null) putExtra(Launch.EXTRA_ADD, add) },
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    private fun pillId(id: String, time: String) = 2000 + ((id + time).hashCode() and 0xFFFF)
    private fun goal(s: Summary) = if (s.waterGoal > 0) s.waterGoal else 2000
    private fun hhmm(t: ZonedDateTime) = String.format(Locale.ROOT, "%02d:%02d", t.hour, t.minute)
    private fun num(x: Int) = String.format(Locale(Lang.code), "%,d", x).replace(' ', ' ')

    /** 1250 → "1,25" (ru) / "1.25" (en), 1500 → "1,5", 2000 → "2". */
    private fun liters(ml: Int) = String.format(Locale(Lang.code), "%.2f", ml / 1000.0).trimEnd('0').trimEnd(',', '.')
    private fun plural(n: Int, one: String, few: String, many: String): String {
        val a = n % 100
        val b = n % 10
        return when { a in 11..14 -> many; b == 1 -> one; b in 2..4 -> few; else -> many }
    }
}

/** Будильники напоминаний и кнопки в уведомлениях. Работа с сетью — в фоне, пока система держит приёмник. */
class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val app = context.applicationContext
        val pending = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                when (intent.action) {
                    Reminders.ACTION_FIRE -> {
                        val kind = runCatching { Reminders.Kind.valueOf(intent.getStringExtra("kind").orEmpty()) }.getOrNull()
                        if (kind != null) Reminders.fire(app, kind, intent.getStringExtra("time"))
                    }
                    Reminders.ACTION_WATER_ADD -> Reminders.addWater(app)
                    Reminders.ACTION_SNOOZE -> Reminders.snoozeWater(app)
                    Reminders.ACTION_PILL -> Reminders.markPill(
                        app, intent.getStringExtra("id").orEmpty(), intent.getStringExtra("time").orEmpty(),
                        intent.getStringExtra("s").orEmpty(), intent.getStringExtra("name").orEmpty(),
                    )
                }
            } catch (e: Exception) {
                Log.w("Fitter", "reminder failed", e)
            } finally {
                pending.finish()
            }
        }
    }
}

/** После перезагрузки телефона и обновления приложения будильники пропадают — ставим заново. */
class ReminderBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED || intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) {
            Reminders.schedule(context.applicationContext)
        }
    }
}
