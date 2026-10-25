package com.sailxx.fitter.data

/**
 * Как записывать подходы упражнения:
 * W — вес × повторы, R — повторы (своим весом), T — время (планка, растяжка), C — кардио (минуты и км).
 * Код совпадает с полем kind на сервере (cleanWorkout в worker.js).
 */
enum class Kind(val code: String, private val ru: String, private val en: String) {
    W("w", "Вес × повторы", "Weight × reps"),
    R("r", "Повторы", "Reps"),
    T("t", "Время", "Time"),
    C("c", "Кардио: время и км", "Cardio: time and km");

    val label get() = tr(ru, en)

    companion object {
        fun of(code: String) = entries.firstOrNull { it.code == code } ?: W
    }
}

/** Упражнение из каталога или своё (id начинается с «c:»). home — можно сделать дома, без зала. */
data class Exercise(val id: String, private val ru: String, val group: String, val kind: Kind, val home: Boolean = false) {
    val custom get() = id.startsWith("c:")

    /** Название на языке приложения; своё упражнение показываем так, как его назвали. */
    val name get() = if (custom) ru else tr(ru, EXERCISE_EN[id] ?: ru)
}

/**
 * Группы мышц для фильтра в списке упражнений — в этом порядке.
 * Русское название — это и есть код группы (его хранит сервер у своих упражнений), показываем через groupLabel().
 */
val GROUPS = listOf("Грудь", "Спина", "Ноги", "Ягодицы", "Плечи", "Бицепс", "Трицепс", "Пресс", "Кардио", "Растяжка")

private val GROUP_EN = mapOf(
    "Грудь" to "Chest", "Спина" to "Back", "Ноги" to "Legs", "Ягодицы" to "Glutes", "Плечи" to "Shoulders",
    "Бицепс" to "Biceps", "Трицепс" to "Triceps", "Пресс" to "Abs", "Кардио" to "Cardio", "Растяжка" to "Stretching", "Свои" to "Custom",
)

fun groupLabel(group: String): String = tr(group, GROUP_EN[group] ?: group)

private val EXERCISE_EN = mapOf(
    // Грудь
    "bench" to "Barbell bench press", "bench_incline" to "Incline barbell bench press", "bench_decline" to "Decline barbell bench press",
    "db_bench" to "Dumbbell bench press", "db_incline" to "Incline dumbbell press", "db_fly" to "Dumbbell fly",
    "chest_press" to "Seated chest press machine", "smith_bench" to "Smith machine bench press", "pec_deck" to "Pec deck",
    "cable_cross" to "Cable crossover", "pullover" to "Dumbbell pullover", "dips_chest" to "Chest dips", "pushup" to "Push-ups",
    "pushup_wide" to "Wide-grip push-ups", "pushup_incline" to "Incline push-ups", "pushup_decline" to "Decline push-ups", "pushup_knees" to "Knee push-ups",
    // Спина
    "pullup" to "Pull-ups", "chinup" to "Chin-ups", "pullup_weighted" to "Weighted pull-ups", "lat_pulldown" to "Lat pulldown",
    "lat_close" to "Close-grip lat pulldown", "row_cable" to "Seated cable row", "row_barbell" to "Bent-over barbell row",
    "row_db" to "One-arm dumbbell row", "row_tbar" to "T-bar row", "row_machine" to "Machine row", "deadlift" to "Deadlift",
    "rack_pull" to "Rack pull", "hyperext" to "Back extension", "shrug" to "Barbell shrugs", "shrug_db" to "Dumbbell shrugs",
    "gravitron" to "Assisted pull-ups", "superman" to "Superman", "row_inverted" to "Inverted row", "band_row" to "Resistance band row",
    // Ноги
    "squat" to "Barbell squat", "front_squat" to "Front squat", "goblet" to "Goblet squat", "leg_press" to "Leg press",
    "hack" to "Hack squat", "smith_squat" to "Smith machine squat", "leg_ext" to "Leg extension", "leg_curl" to "Lying leg curl",
    "leg_curl_seat" to "Seated leg curl", "rdl" to "Romanian deadlift", "lunge_db" to "Dumbbell lunges", "bulgarian" to "Bulgarian split squat",
    "step_up" to "Step-ups", "calf_stand" to "Standing calf raise", "calf_seat" to "Seated calf raise", "adductor" to "Hip adduction machine",
    "abductor" to "Hip abduction machine", "air_squat" to "Bodyweight squat", "lunge" to "Bodyweight lunges", "jump_squat" to "Jump squats",
    "pistol" to "Pistol squat", "wall_sit" to "Wall sit", "calf_home" to "Calf raises",
    // Ягодицы
    "hip_thrust" to "Barbell hip thrust", "glute_kick" to "Cable glute kickback", "glute_machine" to "Glute kickback machine",
    "sumo_squat" to "Dumbbell sumo squat", "sumo_dl" to "Sumo deadlift", "glute_bridge" to "Glute bridge", "glute_bridge_one" to "Single-leg glute bridge",
    "donkey_kick" to "Donkey kicks", "fire_hydrant" to "Fire hydrants", "band_walk" to "Banded side steps",
    // Плечи
    "ohp" to "Overhead press", "db_press" to "Seated dumbbell press", "arnold" to "Arnold press", "shoulder_press" to "Shoulder press machine",
    "lateral" to "Lateral raises", "lateral_cable" to "Cable lateral raises", "front_raise" to "Front raises", "rear_fly" to "Rear delt fly",
    "reverse_pec" to "Reverse pec deck", "face_pull" to "Face pulls", "upright_row" to "Upright row", "pike_pushup" to "Pike push-ups",
    "handstand_pushup" to "Handstand push-ups",
    // Бицепс
    "curl_barbell" to "Barbell curl", "curl_ez" to "EZ-bar curl", "curl_db" to "Dumbbell curl", "hammer" to "Hammer curls",
    "curl_incline" to "Incline dumbbell curl", "curl_preacher" to "Preacher curl", "curl_conc" to "Concentration curl",
    "curl_cable" to "Cable curl", "curl_band" to "Resistance band curl",
    // Трицепс
    "close_bench" to "Close-grip bench press", "french" to "Skull crushers", "pushdown" to "Triceps pushdown", "pushdown_rope" to "Rope pushdown",
    "overhead_ext" to "Overhead dumbbell extension", "kickback" to "Dumbbell kickback", "dips" to "Triceps dips", "bench_dips" to "Bench dips",
    "pushup_diamond" to "Diamond push-ups",
    // Пресс
    "crunch" to "Crunches", "crunch_reverse" to "Reverse crunches", "leg_raise" to "Lying leg raises", "hanging_raise" to "Hanging leg raises",
    "bicycle" to "Bicycle crunches", "russian_twist" to "Russian twists", "situp" to "Sit-ups", "v_up" to "V-ups", "climber" to "Mountain climbers",
    "ab_wheel" to "Ab wheel", "cable_crunch" to "Cable crunch", "crunch_machine" to "Ab crunch machine", "plank" to "Plank",
    "side_plank" to "Side plank", "hollow" to "Hollow hold", "vacuum" to "Stomach vacuum",
    // Кардио
    "run" to "Running", "treadmill" to "Treadmill", "walk" to "Walking", "bike" to "Exercise bike", "cycling" to "Cycling",
    "elliptical" to "Elliptical", "rower" to "Rowing machine", "stairs" to "Stair climber", "swim" to "Swimming", "jump_rope" to "Jump rope",
    "hiit" to "HIIT", "ski" to "Skiing", "burpee" to "Burpees", "jumping_jack" to "Jumping jacks", "kb_swing" to "Kettlebell swings",
    // Растяжка
    "stretch_hamstring" to "Forward fold", "stretch_quad" to "Standing quad stretch", "stretch_hip" to "Hip flexor stretch", "pigeon" to "Pigeon pose",
    "butterfly" to "Butterfly stretch", "cobra" to "Cobra pose", "child" to "Child’s pose", "cat_cow" to "Cat-cow", "stretch_shoulder" to "Shoulder stretch",
    "split" to "Splits", "yoga" to "Yoga",
)

private fun w(id: String, name: String, group: String, home: Boolean = false) = Exercise(id, name, group, Kind.W, home)
private fun r(id: String, name: String, group: String, home: Boolean = true) = Exercise(id, name, group, Kind.R, home)
private fun t(id: String, name: String, group: String, home: Boolean = true) = Exercise(id, name, group, Kind.T, home)
private fun c(id: String, name: String, home: Boolean = false) = Exercise(id, name, "Кардио", Kind.C, home)

/** Каталог упражнений: зал (штанга, гантели, тренажёры) и дом (своим весом, гантели, резинки). */
val CATALOG: List<Exercise> = listOf(
    // Грудь
    w("bench", "Жим штанги лёжа", "Грудь"),
    w("bench_incline", "Жим штанги на наклонной скамье", "Грудь"),
    w("bench_decline", "Жим штанги головой вниз", "Грудь"),
    w("db_bench", "Жим гантелей лёжа", "Грудь", home = true),
    w("db_incline", "Жим гантелей на наклонной скамье", "Грудь"),
    w("db_fly", "Разводка гантелей лёжа", "Грудь", home = true),
    w("chest_press", "Жим в тренажёре сидя", "Грудь"),
    w("smith_bench", "Жим в Смите", "Грудь"),
    w("pec_deck", "Бабочка (пек-дек)", "Грудь"),
    w("cable_cross", "Сведение рук в кроссовере", "Грудь"),
    w("pullover", "Пуловер с гантелью", "Грудь", home = true),
    r("dips_chest", "Отжимания на брусьях (грудь)", "Грудь", home = false),
    r("pushup", "Отжимания от пола", "Грудь"),
    r("pushup_wide", "Отжимания широким хватом", "Грудь"),
    r("pushup_incline", "Отжимания от скамьи", "Грудь"),
    r("pushup_decline", "Отжимания с ногами на возвышении", "Грудь"),
    r("pushup_knees", "Отжимания с колен", "Грудь"),

    // Спина
    r("pullup", "Подтягивания", "Спина"),
    r("chinup", "Подтягивания обратным хватом", "Спина"),
    w("pullup_weighted", "Подтягивания с весом", "Спина"),
    w("lat_pulldown", "Тяга верхнего блока", "Спина"),
    w("lat_close", "Тяга верхнего блока узким хватом", "Спина"),
    w("row_cable", "Тяга нижнего блока сидя", "Спина"),
    w("row_barbell", "Тяга штанги в наклоне", "Спина"),
    w("row_db", "Тяга гантели одной рукой", "Спина", home = true),
    w("row_tbar", "Тяга Т-грифа", "Спина"),
    w("row_machine", "Тяга в рычажном тренажёре", "Спина"),
    w("deadlift", "Становая тяга", "Спина"),
    w("rack_pull", "Тяга с плинтов", "Спина"),
    w("hyperext", "Гиперэкстензия", "Спина"),
    w("shrug", "Шраги со штангой", "Спина"),
    w("shrug_db", "Шраги с гантелями", "Спина", home = true),
    w("gravitron", "Подтягивания в гравитроне", "Спина"),
    r("superman", "Супермен лёжа", "Спина"),
    r("row_inverted", "Австралийские подтягивания", "Спина"),
    w("band_row", "Тяга резинки к поясу", "Спина", home = true),

    // Ноги
    w("squat", "Приседания со штангой", "Ноги"),
    w("front_squat", "Фронтальные приседания", "Ноги"),
    w("goblet", "Гоблет-присед с гантелью", "Ноги", home = true),
    w("leg_press", "Жим ногами", "Ноги"),
    w("hack", "Гакк-приседания", "Ноги"),
    w("smith_squat", "Приседания в Смите", "Ноги"),
    w("leg_ext", "Разгибание ног в тренажёре", "Ноги"),
    w("leg_curl", "Сгибание ног лёжа", "Ноги"),
    w("leg_curl_seat", "Сгибание ног сидя", "Ноги"),
    w("rdl", "Румынская тяга", "Ноги"),
    w("lunge_db", "Выпады с гантелями", "Ноги", home = true),
    w("bulgarian", "Болгарские выпады", "Ноги", home = true),
    w("step_up", "Зашагивания на тумбу", "Ноги", home = true),
    w("calf_stand", "Подъёмы на носки стоя", "Ноги"),
    w("calf_seat", "Подъёмы на носки сидя", "Ноги"),
    w("adductor", "Сведение ног в тренажёре", "Ноги"),
    w("abductor", "Разведение ног в тренажёре", "Ноги"),
    r("air_squat", "Приседания без веса", "Ноги"),
    r("lunge", "Выпады без веса", "Ноги"),
    r("jump_squat", "Приседания с выпрыгиванием", "Ноги"),
    r("pistol", "Пистолетик", "Ноги"),
    t("wall_sit", "Стульчик у стены", "Ноги"),
    r("calf_home", "Подъёмы на носки", "Ноги"),

    // Ягодицы
    w("hip_thrust", "Ягодичный мост со штангой", "Ягодицы"),
    w("glute_kick", "Отведение ноги в кроссовере", "Ягодицы"),
    w("glute_machine", "Отведение ноги в тренажёре", "Ягодицы"),
    w("sumo_squat", "Сумо-присед с гантелью", "Ягодицы", home = true),
    w("sumo_dl", "Становая тяга сумо", "Ягодицы"),
    r("glute_bridge", "Ягодичный мостик", "Ягодицы"),
    r("glute_bridge_one", "Мостик на одной ноге", "Ягодицы"),
    r("donkey_kick", "Махи ногой назад на четвереньках", "Ягодицы"),
    r("fire_hydrant", "Отведение ноги в сторону на четвереньках", "Ягодицы"),
    r("band_walk", "Шаги в сторону с резинкой", "Ягодицы"),

    // Плечи
    w("ohp", "Жим штанги стоя", "Плечи"),
    w("db_press", "Жим гантелей сидя", "Плечи", home = true),
    w("arnold", "Жим Арнольда", "Плечи", home = true),
    w("shoulder_press", "Жим в тренажёре на плечи", "Плечи"),
    w("lateral", "Махи гантелями в стороны", "Плечи", home = true),
    w("lateral_cable", "Махи в стороны в кроссовере", "Плечи"),
    w("front_raise", "Подъём гантелей перед собой", "Плечи", home = true),
    w("rear_fly", "Махи в наклоне на заднюю дельту", "Плечи", home = true),
    w("reverse_pec", "Обратная бабочка", "Плечи"),
    w("face_pull", "Тяга каната к лицу", "Плечи"),
    w("upright_row", "Тяга штанги к подбородку", "Плечи"),
    r("pike_pushup", "Отжимания «домиком»", "Плечи"),
    r("handstand_pushup", "Отжимания в стойке на руках", "Плечи"),

    // Бицепс
    w("curl_barbell", "Подъём штанги на бицепс", "Бицепс"),
    w("curl_ez", "Подъём EZ-штанги на бицепс", "Бицепс"),
    w("curl_db", "Подъём гантелей на бицепс", "Бицепс", home = true),
    w("hammer", "Молотки с гантелями", "Бицепс", home = true),
    w("curl_incline", "Сгибания на наклонной скамье", "Бицепс"),
    w("curl_preacher", "Сгибания на скамье Скотта", "Бицепс"),
    w("curl_conc", "Концентрированный подъём", "Бицепс", home = true),
    w("curl_cable", "Сгибания на нижнем блоке", "Бицепс"),
    w("curl_band", "Сгибания с резинкой", "Бицепс", home = true),

    // Трицепс
    w("close_bench", "Жим лёжа узким хватом", "Трицепс"),
    w("french", "Французский жим", "Трицепс"),
    w("pushdown", "Разгибания на верхнем блоке", "Трицепс"),
    w("pushdown_rope", "Разгибания с канатом", "Трицепс"),
    w("overhead_ext", "Разгибание гантели из-за головы", "Трицепс", home = true),
    w("kickback", "Разгибание гантели в наклоне", "Трицепс", home = true),
    r("dips", "Отжимания на брусьях", "Трицепс", home = false),
    r("bench_dips", "Обратные отжимания от скамьи", "Трицепс"),
    r("pushup_diamond", "Алмазные отжимания", "Трицепс"),

    // Пресс
    r("crunch", "Скручивания", "Пресс"),
    r("crunch_reverse", "Обратные скручивания", "Пресс"),
    r("leg_raise", "Подъём ног лёжа", "Пресс"),
    r("hanging_raise", "Подъём ног в висе", "Пресс", home = false),
    r("bicycle", "Велосипед", "Пресс"),
    r("russian_twist", "Русские скручивания", "Пресс"),
    r("situp", "Подъём корпуса", "Пресс"),
    r("v_up", "Складка", "Пресс"),
    r("climber", "Скалолаз", "Пресс"),
    r("ab_wheel", "Ролик для пресса", "Пресс"),
    w("cable_crunch", "Скручивания на блоке", "Пресс"),
    w("crunch_machine", "Скручивания в тренажёре", "Пресс"),
    t("plank", "Планка", "Пресс"),
    t("side_plank", "Боковая планка", "Пресс"),
    t("hollow", "Лодочка", "Пресс"),
    t("vacuum", "Вакуум", "Пресс"),

    // Кардио
    c("run", "Бег", home = true),
    c("treadmill", "Беговая дорожка"),
    c("walk", "Ходьба", home = true),
    c("bike", "Велотренажёр"),
    c("cycling", "Велосипед", home = true),
    c("elliptical", "Эллипс"),
    c("rower", "Гребной тренажёр"),
    c("stairs", "Степпер / лестница"),
    c("swim", "Плавание"),
    c("jump_rope", "Скакалка", home = true),
    c("hiit", "Интервальная тренировка", home = true),
    c("ski", "Лыжи", home = true),
    r("burpee", "Бёрпи", "Кардио"),
    r("jumping_jack", "Прыжки «звёздочка»", "Кардио"),
    w("kb_swing", "Махи гирей", "Кардио", home = true),

    // Растяжка
    t("stretch_hamstring", "Наклон к ногам", "Растяжка"),
    t("stretch_quad", "Растяжка квадрицепса стоя", "Растяжка"),
    t("stretch_hip", "Растяжка сгибателей бедра", "Растяжка"),
    t("pigeon", "Поза голубя", "Растяжка"),
    t("butterfly", "Бабочка сидя", "Растяжка"),
    t("cobra", "Кобра", "Растяжка"),
    t("child", "Поза ребёнка", "Растяжка"),
    t("cat_cow", "Кошка — корова", "Растяжка"),
    t("stretch_shoulder", "Растяжка плеч", "Растяжка"),
    t("split", "Шпагат", "Растяжка"),
    t("yoga", "Йога", "Растяжка"),
)
