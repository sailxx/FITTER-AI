package com.sailxx.fitter.data

/** Микронутриент: ключ как в ответе сервера (micro), названия, единица и суточная норма для процентов. Список совпадает с MICRO в worker.js. */
data class Micro(val key: String, private val ru: String, private val en: String, val unit: String, val daily: Double) {
    val name get() = tr(ru, en)
    val unitLabel get() = if (unit == "g") tr("г", "g") else unit
}

val MICROS = listOf(
    Micro("fiber", "Клетчатка", "Fiber", "g", 28.0),
    Micro("sugar", "Сахар", "Sugar", "g", 50.0),
    Micro("satfat", "Насыщенные жиры", "Saturated fat", "g", 20.0),
    Micro("cholesterol", "Холестерин", "Cholesterol", "mg", 300.0),
    Micro("sodium", "Натрий", "Sodium", "mg", 2300.0),
    Micro("potassium", "Калий", "Potassium", "mg", 3400.0),
    Micro("calcium", "Кальций", "Calcium", "mg", 1000.0),
    Micro("iron", "Железо", "Iron", "mg", 14.0),
    Micro("magnesium", "Магний", "Magnesium", "mg", 400.0),
    Micro("zinc", "Цинк", "Zinc", "mg", 11.0),
    Micro("vitc", "Витамин C", "Vitamin C", "mg", 90.0),
    Micro("vita", "Витамин A", "Vitamin A", "µg", 900.0),
    Micro("vitd", "Витамин D", "Vitamin D", "µg", 15.0),
    Micro("b12", "Витамин B12", "Vitamin B12", "µg", 2.4),
)
