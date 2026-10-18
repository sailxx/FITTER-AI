package com.sailxx.fitter.data

import org.json.JSONObject
import kotlin.math.roundToInt

/** Нормы на день из анкеты в боте. */
data class Targets(val kcal: Int, val p: Int, val f: Int, val c: Int)

/** Сводка за сегодня — ответ /api/widget. Её показывают виджеты и шапка приложения. */
data class Summary(
    val date: String,
    val kcal: Int,
    val p: Int,
    val f: Int,
    val c: Int,
    val targets: Targets,
    val water: Int,
    val waterGoal: Int,
    val meals: Int,
    val streak: Int,
    val pillsTotal: Int,
    val pillsTaken: Int,
    val pillNext: String,
    val name: String,
) {
    val kcalLeft get() = targets.kcal - kcal
    val progress get() = if (targets.kcal > 0) kcal.toFloat() / targets.kcal else 0f

    companion object {
        fun parse(j: JSONObject): Summary {
            val t = j.getJSONObject("targets")
            val pills = j.optJSONObject("pills") ?: JSONObject()
            return Summary(
                date = j.getString("date"),
                kcal = j.optInt("kcal"), p = j.optInt("p"), f = j.optInt("f"), c = j.optInt("c"),
                targets = Targets(t.optInt("kcal"), t.optInt("p"), t.optInt("f"), t.optInt("c")),
                water = j.optInt("water"),
                waterGoal = j.optInt("waterGoal", 2000),
                meals = j.optInt("meals"),
                streak = j.optInt("streak"),
                pillsTotal = pills.optInt("total"),
                pillsTaken = pills.optInt("taken"),
                pillNext = pills.optString("next"),
                name = j.optString("name"),
            )
        }
    }
}

/** Приём пищи из дневника — часть ответа /api/day. */
data class Meal(val id: String, val time: String, val title: String, val kcal: Int, val p: Int, val f: Int, val c: Int)

/** Таблетка на сегодня: s = "taken" | "skip" | "" (ещё не отмечена). */
data class PillDose(val id: String, val name: String, val dose: String, val time: String, val s: String)

/** День недели в шапке: сколько калорий и были ли записи. */
data class WeekDay(val date: String, val kcal: Int, val meals: Int)

/** Запись веса: дата и килограммы. */
data class WeightPoint(val date: String, val kg: Double)

data class Day(
    val date: String,
    val today: String,
    val meals: List<Meal>,
    val pills: List<PillDose>,
    val week: List<WeekDay>,
    val weights: List<WeightPoint> = emptyList(),
) {
    companion object {
        fun parse(j: JSONObject): Day {
            val meals = j.optJSONArray("meals")
            val pills = j.optJSONArray("pills")
            val week = j.optJSONArray("week")
            val weights = j.optJSONArray("weights")
            return Day(
                date = j.optString("date"),
                today = j.optString("today"),
                meals = (0 until (meals?.length() ?: 0)).map { i ->
                    val m = meals!!.getJSONObject(i)
                    val t = m.optJSONObject("totals") ?: JSONObject()
                    Meal(
                        id = m.optString("id"), time = m.optString("time"), title = m.optString("title"),
                        kcal = t.optDouble("kcal", 0.0).roundToInt(), p = t.optDouble("p", 0.0).roundToInt(),
                        f = t.optDouble("f", 0.0).roundToInt(), c = t.optDouble("c", 0.0).roundToInt(),
                    )
                },
                pills = (0 until (pills?.length() ?: 0)).map { i ->
                    val p = pills!!.getJSONObject(i)
                    PillDose(p.optString("id"), p.optString("name"), p.optString("dose"), p.optString("time"), p.optString("s"))
                },
                week = (0 until (week?.length() ?: 0)).map { i ->
                    val w = week!!.getJSONObject(i)
                    WeekDay(w.optString("date"), w.optInt("kcal"), w.optInt("meals"))
                },
                weights = (0 until (weights?.length() ?: 0)).mapNotNull { i ->
                    val w = weights!!.getJSONObject(i)
                    w.optDouble("kg").takeIf { !it.isNaN() }?.let { WeightPoint(w.optString("date"), it) }
                },
            )
        }
    }
}
