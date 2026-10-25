package com.sailxx.fitter.data

import android.content.Context
import android.util.Log
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.roundToInt

/** Как далось упражнение. Код совпадает с полем effort на сервере. */
enum class Effort(val code: String, private val ru: String, private val en: String, val emoji: String) {
    EASY("easy", "Легко", "Easy", "😌"),
    MEDIUM("medium", "Средне", "Medium", "😐"),
    HARD("hard", "Сложно", "Hard", "🥵");

    val label get() = tr(ru, en)

    companion object {
        fun of(code: String) = entries.firstOrNull { it.code == code }
    }
}

/** Подход: вес (кг), повторы, время (секунды), расстояние (км). Неиспользуемые поля — 0. */
data class WSet(val w: Double = 0.0, val r: Int = 0, val s: Int = 0, val km: Double = 0.0)

/** Упражнение в тренировке. */
data class WEx(val id: String, val name: String, val kind: Kind, val effort: Effort?, val sets: List<WSet>)

data class Workout(val id: String, val date: String, val title: String, val ex: List<WEx>) {
    /** Тоннаж: сумма вес × повторы по всем подходам. */
    val volume get() = ex.sumOf { e -> if (e.kind == Kind.W) e.sets.sumOf { it.w * it.r } else 0.0 }.roundToInt()
    val sets get() = ex.sumOf { it.sets.size }
}

data class WorkoutsState(val list: List<Workout> = emptyList(), val custom: List<Exercise> = emptyList(), val loaded: Boolean = false)

private fun num(x: Double) = if (x == x.toLong().toDouble()) x.toLong().toString() else x.toString()

/** Подход коротко: «60 кг × 10», «× 15», «1:30», «30 мин · 5 км». */
fun WSet.label(kind: Kind): String = when (kind) {
    Kind.W -> if (w > 0) "${num(w)} ${tr("кг", "kg")} × $r" else "× $r"
    Kind.R -> if (w > 0) "$r × ${num(w)} ${tr("кг", "kg")}" else "× $r"
    Kind.T -> clock(s)
    Kind.C -> listOfNotNull(if (s > 0) "${s / 60} ${tr("мин", "min")}" else null, if (km > 0) "${num(km)} ${tr("км", "km")}" else null).joinToString(" · ").ifEmpty { "—" }
}

fun clock(sec: Int) = "%d:%02d".format(sec / 60, sec % 60)

/**
 * Дневник тренировок. Сервер — главный (GET /api/workouts), здесь копия последнего ответа,
 * чтобы раздел открывался сразу. Кэш лежит в общих настройках приложения и стирается при выходе.
 */
object WorkoutStore {
    private const val TAG = "Fitter"
    private val _state = MutableStateFlow(WorkoutsState())
    val state: StateFlow<WorkoutsState> get() = _state

    private fun prefs(context: Context) = context.applicationContext.getSharedPreferences("fitter", Context.MODE_PRIVATE)

    fun load(context: Context) {
        val raw = prefs(context).getString("workouts", null) ?: return
        runCatching { _state.value = parse(JSONObject(raw)).copy(loaded = _state.value.loaded) }
    }

    /** Вышли из аккаунта: в памяти не остаётся чужих тренировок. */
    fun reset() { _state.value = WorkoutsState() }

    suspend fun refresh(context: Context) {
        val token = FitterRepository.token(context) ?: return
        try {
            val j = Api.workouts(token)
            prefs(context).edit().putString("workouts", j.toString()).apply()
            _state.value = parse(j).copy(loaded = true)
        } catch (e: Exception) {
            Log.w(TAG, "workouts failed", e)
            _state.value = _state.value.copy(loaded = true)
        }
    }

    /** Сохранить тренировку (новую или исправленную). Ошибки сети — наверх, экран покажет. */
    suspend fun save(context: Context, w: Workout) {
        val token = FitterRepository.token(context) ?: return
        Api.workoutSave(token, w.date, toJson(w))
        refresh(context)
    }

    suspend fun delete(context: Context, w: Workout) {
        val token = FitterRepository.token(context) ?: return
        _state.value = _state.value.copy(list = _state.value.list.filter { it.id != w.id })
        Api.workoutDelete(token, FitterRepository.today(context), w.id)
        refresh(context)
    }

    suspend fun addCustom(context: Context, name: String, kind: Kind, group: String): Exercise? {
        val token = FitterRepository.token(context) ?: return null
        val j = Api.exerciseAdd(token, FitterRepository.today(context), name, kind.code, group).getJSONObject("exercise")
        refresh(context)
        return parseExercise(j)
    }

    suspend fun deleteCustom(context: Context, e: Exercise) {
        val token = FitterRepository.token(context) ?: return
        _state.value = _state.value.copy(custom = _state.value.custom.filter { it.id != e.id })
        Api.exerciseDelete(token, FitterRepository.today(context), e.id)
        refresh(context)
    }

    private fun parseExercise(j: JSONObject) =
        Exercise(j.optString("id"), j.optString("name"), j.optString("group").ifBlank { "Свои" }, Kind.of(j.optString("kind")), home = true)

    private fun parse(j: JSONObject): WorkoutsState {
        val list = j.optJSONArray("list") ?: JSONArray()
        val custom = j.optJSONArray("custom") ?: JSONArray()
        return WorkoutsState(
            list = (0 until list.length()).map { i ->
                val w = list.getJSONObject(i)
                val ex = w.optJSONArray("ex") ?: JSONArray()
                Workout(
                    w.optString("id"), w.optString("date"), w.optString("title"),
                    (0 until ex.length()).map { k ->
                        val e = ex.getJSONObject(k)
                        val sets = e.optJSONArray("sets") ?: JSONArray()
                        WEx(
                            e.optString("id"), e.optString("name"), Kind.of(e.optString("kind")), Effort.of(e.optString("effort")),
                            (0 until sets.length()).map { n ->
                                val s = sets.getJSONObject(n)
                                WSet(s.optDouble("w", 0.0), s.optInt("r"), s.optInt("s"), s.optDouble("km", 0.0))
                            },
                        )
                    },
                )
            },
            custom = (0 until custom.length()).map { parseExercise(custom.getJSONObject(it)) },
        )
    }

    private fun toJson(w: Workout) = JSONObject()
        .put("id", w.id)
        .put("title", w.title)
        .put("ex", JSONArray(w.ex.map { e ->
            JSONObject().put("id", e.id).put("name", e.name).put("kind", e.kind.code).put("effort", e.effort?.code ?: "")
                .put("sets", JSONArray(e.sets.map { JSONObject().put("w", it.w).put("r", it.r).put("s", it.s).put("km", it.km) }))
        }))
}
