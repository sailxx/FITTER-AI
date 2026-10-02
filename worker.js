/**
 * Fitter AI — Telegram-бот, который считает калории по фото еды.
 * «Одно фото. Полный контроль.»
 *
 * Работает бесплатно:
 *   • Cloudflare Workers — сервер, где живёт бот (бесплатный тариф)
 *   • Cloudflare KV      — база данных (бесплатный тариф)
 *   • Google Gemini API  — нейросеть, которая смотрит на фото (бесплатный ключ)
 *   • Telegram Bot API   — сам бот и Mini App (бесплатно)
 *
 * Настройки (Settings → Variables в Cloudflare):
 *   BOT_TOKEN        — токен бота от @BotFather            (секрет)
 *   GEMINI_API_KEY   — ключ из Google AI Studio            (секрет)
 *   WEBHOOK_SECRET   — любой пароль из латинских букв и цифр (секрет)
 *   GEMINI_MODEL     — (необязательно) модель Gemini, по умолчанию gemini-3.5-flash
 *   DAILY_AI_LIMIT   — (необязательно) сколько запросов к ИИ в день на человека, по умолчанию 40
 * Привязка KV-хранилища: имя переменной DB
 *
 * Подробная инструкция по запуску — в файле SETUP.md
 */

// Модели Gemini: если первая недоступна, бот сам попробует следующую
const MODEL_FALLBACKS = ["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-flash-latest"];
const DEFAULT_TZ = 180; // Москва, UTC+3 (в минутах)

// ───────────────────────────── Точка входа ─────────────────────────────

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const E = Object.assign({}, env, { ORIGIN: url.origin });
    try {
      if (request.method === "POST" && url.pathname === "/webhook") {
        if (!env.WEBHOOK_SECRET || request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET) {
          return new Response("forbidden", { status: 403 });
        }
        const update = await request.json();
        // Отвечаем Telegram сразу, а саму работу делаем в фоне
        ctx.waitUntil(handleUpdate(update, E).catch((e) => console.error("update error:", e && e.stack ? e.stack : e)));
        return new Response("ok");
      }
      if (url.pathname === "/setup") return await setup(url, E);
      if (url.pathname === "/app") {
        return new Response(APP_HTML, { headers: { "content-type": "text/html; charset=utf-8" } });
      }
      if (url.pathname.startsWith("/api/")) return await api(request, url, E);
      if (url.pathname === "/") return new Response("FITTER работает ✅", { headers: { "content-type": "text/plain; charset=utf-8" } });
      return new Response("not found", { status: 404 });
    } catch (e) {
      console.error(e && e.stack ? e.stack : e);
      return new Response("error", { status: 500 });
    }
  },
};

// ───────────────────────────── Telegram ─────────────────────────────

// ── Свои иконки вместо обычных эмодзи ──
// Обычный эмодзи → номер иконки из набора (custom_emoji_id).
// Работает, если у владельца бота есть Telegram Premium. Если нет — бот сам покажет обычные эмодзи.
// Номер иконки можно узнать: отправь её боту, он ответит номером. Весь набор: /emojipack имя_набора
const CUSTOM_EMOJI = {
  // Набор t.me/addemoji/tgiosicons
  "📊": "5936143551854285132", // Сегодня
  "📅": "5890937706803894250", // Неделя
  "⚖": "5938539885907415367",  // Вес (иконка графика)
  "👤": "6032994772321309200", // Профиль
  "❓": "6030848053177486888", // Помощь
  "🍽": "6041874690220233085", // Приём пищи
  "✏": "5771847914477326786",  // Исправить
  "🗑": "6039522349517115015", // Удалить
  "💡": "5891120964468480450", // Совет
  "🎯": "6032949275732742941", // Норма
  "🔥": "5884428842780594914", // Калории (молния)
  "✅": "5774022692642492953", // Готово
  "📸": "5881806211195605908", // Фото
  "🔍": "6030506650522096180", // Смотрю на фото
  "✍": "5778299625370817409",  // Написать текстом
  "👋": "6041921818896372382", // Привет
  "🤔": "6043960760130868895", // Не понял
  "😔": "5778197572652897847", // Ошибка
  "🔄": "5769248574499983619", // Пересчитываю
  "🎉": "6041731551845159060", // Праздник
};

const stripVS = (s) => s.replace(/\uFE0F/g, "");
// Telegram может хранить эмодзи стикера как «🏃‍♂️» или с оттенком кожи — сравниваем только первый символ
const baseEmoji = (s) => [...stripVS(String(s || ""))][0] || "";

// Итоговый список = список из кода + свои иконки, которые бот сохранил в базе (/makeemoji)
let emojiMap = { ...CUSTOM_EMOJI };
let emojiRe = null;
let emojiLoadedAt = 0;
function buildEmojiRe() {
  const keys = Object.keys(emojiMap).sort((a, b) => b.length - a.length);
  emojiRe = keys.length
    ? new RegExp(keys.map((k) => stripVS(k).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\uFE0F?").join("|"), "gu")
    : null;
}
buildEmojiRe();
async function loadEmojiMap(env) {
  if (!env.DB || Date.now() - emojiLoadedAt < 60000) return;
  emojiLoadedAt = Date.now();
  const extra = (await env.DB.get("cfg:emoji", "json").catch(() => null)) || {};
  emojiMap = { ...CUSTOM_EMOJI, ...extra };
  buildEmojiRe();
}
const emojiId = (e) => emojiMap[e] || emojiMap[stripVS(e)] || emojiMap[stripVS(e) + "\uFE0F"];

function withIcons(text) {
  if (!emojiRe || !text) return text;
  // Не трогаем то, что уже внутри <tg-emoji>
  return text.split(/(<tg-emoji[^>]*>.*?<\/tg-emoji>)/gs).map((part, i) =>
    i % 2 ? part : part.replace(emojiRe, (m) => `<tg-emoji emoji-id="${emojiId(m)}">${m}</tg-emoji>`)
  ).join("");
}

function buttonIcons(markup) {
  if (!emojiRe || !markup) return markup;
  const rows = markup.inline_keyboard || markup.keyboard;
  if (!rows) return markup;
  const start = new RegExp("^(" + emojiRe.source + ")\\s*", "u");
  const conv = (b) => {
    const m = b.text.match(start);
    if (!m) return b;
    return { ...b, text: b.text.slice(m[0].length), icon_custom_emoji_id: emojiId(m[1]) };
  };
  const out = rows.map((row) => row.map(conv));
  return markup.inline_keyboard ? { ...markup, inline_keyboard: out } : { ...markup, keyboard: out };
}

async function tgRaw(env, method, payload) {
  const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return r.json().catch(() => ({ ok: false, description: "bad json" }));
}

async function tg(env, method, payload) {
  let j;
  if (method === "sendMessage" || method === "editMessageText") await loadEmojiMap(env);
  const fancy = emojiRe && env.CUSTOM_EMOJI !== "off" && (method === "sendMessage" || method === "editMessageText");
  if (fancy) {
    const p = { ...payload };
    if (p.parse_mode === "HTML") p.text = withIcons(p.text);
    if (p.reply_markup) p.reply_markup = buttonIcons(p.reply_markup);
    j = await tgRaw(env, method, p);
    // Если Telegram не принял иконки (например, закончился Premium) — отправляем с обычными эмодзи
    if (!j.ok && !(j.description || "").includes("message is not modified")) {
      console.error("custom emoji rejected, fallback:", j.description);
      j = await tgRaw(env, method, payload);
    }
  } else {
    j = await tgRaw(env, method, payload);
  }
  if (!j.ok && payload.message_effect_id) {
    const { message_effect_id, ...rest } = payload;
    return tg(env, method, rest);
  }
  if (!j.ok && !(j.description || "").includes("message is not modified")) {
    console.error("telegram error", method, JSON.stringify(j));
  }
  return j;
}

// Служебное: показать номера своих эмодзи из сообщения
async function sendEmojiIds(env, chatId, msg) {
  const ents = (msg.entities || msg.caption_entities || []).filter((e) => e.type === "custom_emoji");
  const text = msg.text || msg.caption || "";
  const seen = new Set();
  const lines = [];
  for (const e of ents) {
    if (seen.has(e.custom_emoji_id)) continue;
    seen.add(e.custom_emoji_id);
    const ch = text.substr(e.offset, e.length);
    lines.push(`<tg-emoji emoji-id="${e.custom_emoji_id}">${ch}</tg-emoji> <code>${e.custom_emoji_id}</code>`);
  }
  return tgRaw(env, "sendMessage", { chat_id: chatId, parse_mode: "HTML", text: "🔢 Номера иконок:\n\n" + lines.join("\n") });
}

// Свои иконки FITTER: бот создаёт один набор «FITTER ICONS» в аккаунте того, кто отправил /makeemoji
// Еда — цветная, весы и дневник — серые, логотип — чёрно-белая плашка
// Картинки 100×100 лежат в репозитории в папке icons/pack/
const ICON_BASE = "https://raw.githubusercontent.com/sailxx/fitter-ai/main/icons/";
const ICON_SETS = [
  {
    suffix: "", title: "FITTER ICONS", repaint: false, folder: "pack/",
    // файл, эмодзи для набора, какой эмодзи в боте заменить
    icons: [
      ["plate", "🍽", "🍽"], ["protein", "🍗", "🥩"], ["fat", "💧", "🧈"], ["carbs", "🌾", "🍞"], ["kcal", "🔥", "🔥"],
      ["scales", "⚖️", "⚖"], ["diary", "📔", "📱"], ["fitter", "🍏", "🍏"],
      ["sofa", "🛋", "🛋"], ["walk", "🚶", "🚶"], ["run", "🏃", "🏃"], ["muscle", "💪", "💪"], ["lose", "📉", "📉"],
      ["water", "🥤", "💧"], ["barcode", "📦", "📦"],
      ["ruler", "📏", "📏"], ["cake", "🎂", "🎂"], ["trophy", "🏆", "🏆"],
    ],
  },
];
// Старые наборы из прошлых версий — удаляются, чтобы остался один
const OLD_SETS = ["icons", "food"];

async function ensureEmojiSet(env, from, botName, cfg) {
  const name = `fitter${cfg.suffix ? "_" + cfg.suffix : ""}_by_${botName}`;
  const sticker = ([file, emoji]) => ({ sticker: ICON_BASE + cfg.folder + file + ".png", format: "static", emoji_list: [emoji] });
  let set = await tgRaw(env, "getStickerSet", { name });
  if (!set.ok) {
    const res = await tgRaw(env, "createNewStickerSet", {
      user_id: from.id, name, title: cfg.title, sticker_type: "custom_emoji",
      needs_repainting: cfg.repaint, stickers: cfg.icons.map(sticker),
    });
    if (!res.ok) throw new Error(`${cfg.title}: ${res.description || "ошибка"}`);
    set = await tgRaw(env, "getStickerSet", { name });
    if (!set.ok) throw new Error(`${cfg.title}: не получилось прочитать набор`);
  }
  // Иконки ищем по их эмодзи, чтобы порядок в наборе был неважен
  const map = {};
  const has = new Set(set.result.stickers.map((s) => baseEmoji(s.emoji)));
  for (const ic of cfg.icons) {
    if (!has.has(baseEmoji(ic[1]))) {
      await tgRaw(env, "addStickerToSet", { user_id: from.id, name, sticker: sticker(ic) });
    }
  }
  set = await tgRaw(env, "getStickerSet", { name });
  const stickers = set.result.stickers;
  for (const s of stickers) {
    const ic = cfg.icons.find((x) => baseEmoji(x[1]) === baseEmoji(s.emoji));
    if (ic && s.custom_emoji_id && !map[ic[2]]) map[ic[2]] = s.custom_emoji_id;
  }
  // Запасной вариант: иконки в наборе лежат в том же порядке, что и в списке
  if (stickers.length === cfg.icons.length) {
    cfg.icons.forEach((ic, i) => { if (!map[ic[2]] && stickers[i].custom_emoji_id) map[ic[2]] = stickers[i].custom_emoji_id; });
  }
  return { name, map };
}

async function makeEmojiPack(env, chatId, from) {
  if (env.ADMIN_ID && String(from.id) !== String(env.ADMIN_ID)) return send(env, chatId, "Эта команда только для владельца бота");
  const me = await tgRaw(env, "getMe", {});
  await send(env, chatId, "🔄 Создаю набор FITTER ICONS…");
  for (const o of OLD_SETS) await tgRaw(env, "deleteStickerSet", { name: `fitter_${o}_by_${me.result.username}` });
  const map = {};
  const links = [];
  for (const cfg of ICON_SETS) {
    try {
      const r = await ensureEmojiSet(env, from, me.result.username, cfg);
      Object.assign(map, r.map);
      links.push(`${cfg.title}: t.me/addemoji/${r.name}`);
    } catch (e) {
      return send(env, chatId, `😔 Не получилось создать набор ${esc(String(e.message || e))}`);
    }
  }
  await env.DB.put("cfg:emoji", JSON.stringify(map));
  emojiLoadedAt = 0;
  const list = ICON_SETS.flatMap((c) => c.icons).map(([file, , key]) =>
    map[key] ? `<tg-emoji emoji-id="${map[key]}">${key}</tg-emoji> ${file}` : `${key} ${file} — не найдена`
  ).join("\n");
  return tgRaw(env, "sendMessage", {
    chat_id: chatId,
    parse_mode: "HTML",
    text: `🎉 Иконки готовы и подключены к боту!\n\n${list}\n\n${links.join("\n")}`,
  });
}

// Служебное: показать весь набор иконок с номерами (/emojipack tgiosicons)
async function sendEmojiPack(env, chatId, name) {
  if (!name) return send(env, chatId, "Напиши так: <code>/emojipack tgiosicons</code>\nИмя набора — это конец ссылки t.me/addemoji/<b>имя</b>");
  const set = await tgRaw(env, "getStickerSet", { name });
  if (!set.ok) return send(env, chatId, `Не нашёл набор «${esc(name)}» 🤔`);
  const all = set.result.stickers.filter((s) => s.custom_emoji_id);
  const lines = all.map((s, i) => `${i + 1}. <tg-emoji emoji-id="${s.custom_emoji_id}">${s.emoji || "⭐"}</tg-emoji> ${s.emoji || ""} <code>${s.custom_emoji_id}</code>`);
  await tgRaw(env, "sendMessage", { chat_id: chatId, parse_mode: "HTML", text: `Набор «${esc(set.result.title)}»: ${all.length} иконок` });
  for (let i = 0; i < lines.length; i += 40) {
    await tgRaw(env, "sendMessage", { chat_id: chatId, parse_mode: "HTML", text: lines.slice(i, i + 40).join("\n") });
  }
}

function send(env, chatId, text, extra = {}) {
  return tg(env, "sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, ...extra });
}

function edit(env, chatId, messageId, text, extra = {}) {
  return tg(env, "editMessageText", { chat_id: chatId, message_id: messageId, text, parse_mode: "HTML", disable_web_page_preview: true, ...extra });
}

const MAIN_KEYBOARD = {
  keyboard: [
    [{ text: "📊 Сегодня" }, { text: "📅 Неделя" }],
    [{ text: "💧 Вода" }, { text: "⚖️ Вес" }],
    [{ text: "👤 Профиль" }, { text: "❓ Помощь" }],
  ],
  resize_keyboard: true,
  is_persistent: true,
  input_field_placeholder: "Отправь фото еды или задай вопрос",
};

function appButton(env, text = "📱 Открыть дневник") {
  return { text, web_app: { url: `${env.ORIGIN}/app` } };
}

// ───────────────────────────── База данных (KV) ─────────────────────────────

async function getUser(env, id) {
  return (await env.DB.get(`u:${id}`, "json")) || null;
}
async function saveUser(env, u) {
  await env.DB.put(`u:${u.id}`, JSON.stringify(u));
}
async function getDay(env, id, date) {
  return (await env.DB.get(`d:${id}:${date}`, "json")) || { meals: [] };
}
async function saveDay(env, id, date, day) {
  if (!day.meals.length && !day.water) return env.DB.delete(`d:${id}:${date}`);
  await env.DB.put(`d:${id}:${date}`, JSON.stringify(day));
}
async function getWeights(env, id) {
  return (await env.DB.get(`w:${id}`, "json")) || [];
}

// ───────────────────────────── Даты ─────────────────────────────

const tzOf = (u) => (u && typeof u.tz === "number" ? u.tz : DEFAULT_TZ);
const localNow = (u) => new Date(Date.now() + tzOf(u) * 60000);
const today = (u) => localNow(u).toISOString().slice(0, 10);
const nowTime = (u) => localNow(u).toISOString().slice(11, 16);
function shiftDate(date, n) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const WEEKDAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
function humanDate(date) {
  const d = new Date(date + "T00:00:00Z");
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}
const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

// ───────────────────────────── Подсчёты ─────────────────────────────

const round = (x) => Math.round(x);
const r1 = (x) => Math.round(x * 10) / 10;

function itemTotals(it) {
  const k = it.grams / 100;
  return { kcal: it.kcal_100 * k, p: it.protein_100 * k, f: it.fat_100 * k, c: it.carbs_100 * k };
}
function sumItems(items) {
  return items.reduce(
    (a, it) => {
      const t = itemTotals(it);
      a.kcal += t.kcal; a.p += t.p; a.f += t.f; a.c += t.c;
      return a;
    },
    { kcal: 0, p: 0, f: 0, c: 0 }
  );
}
const dayTotals = (day) => sumItems(day.meals.flatMap((m) => m.items));

const ACTIVITY = {
  "1.2": "🛋 Почти не двигаюсь",
  "1.375": "🚶 1–3 тренировки в неделю",
  "1.55": "🏃 3–5 тренировок в неделю",
  "1.725": "🔥 6–7 тренировок в неделю",
};
const GOALS = { lose: "📉 Похудеть", keep: "⚖️ Держать вес", gain: "💪 Набрать массу" };

// Формула Миффлина — Сан-Жеора
function calcTargets(u) {
  const bmr = 10 * u.weight + 6.25 * u.height - 5 * u.age + (u.sex === "m" ? 5 : -161);
  let kcal = bmr * Number(u.activity);
  if (u.goal === "lose") kcal *= 0.85;
  if (u.goal === "gain") kcal *= 1.1;
  kcal = Math.max(kcal, u.sex === "m" ? 1500 : 1200);
  const p = u.weight * (u.goal === "lose" ? 2 : 1.8);
  const f = u.weight * 0.9;
  const c = Math.max((kcal - p * 4 - f * 9) / 4, 50);
  return { kcal: round(kcal), p: round(p), f: round(f), c: round(c) };
}

// ───────────────────────────── Нейросеть Gemini ─────────────────────────────

const ITEM_SCHEMA = {
  type: "OBJECT",
  properties: {
    name: { type: "STRING", description: "Название продукта или блюда по-русски, коротко" },
    grams: { type: "NUMBER", description: "Примерный вес порции в граммах" },
    kcal_100: { type: "NUMBER", description: "Калории на 100 г" },
    protein_100: { type: "NUMBER", description: "Белки на 100 г" },
    fat_100: { type: "NUMBER", description: "Жиры на 100 г" },
    carbs_100: { type: "NUMBER", description: "Углеводы на 100 г" },
  },
  required: ["name", "grams", "kcal_100", "protein_100", "fat_100", "carbs_100"],
};

const PHOTO_SCHEMA = {
  type: "OBJECT",
  properties: {
    is_food: { type: "BOOLEAN" },
    title: { type: "STRING", description: "Короткое название приёма пищи, например «Гречка с курицей»" },
    items: { type: "ARRAY", items: ITEM_SCHEMA },
    comment: { type: "STRING", description: "Одна короткая полезная заметка о блюде, по-русски" },
    is_package: { type: "BOOLEAN", description: "На фото упаковка продукта из магазина" },
    label_found: { type: "BOOLEAN", description: "На фото читается таблица пищевой ценности (КБЖУ) с упаковки" },
    barcode: { type: "STRING", description: "Цифры штрихкода, если они видны под штрихкодом, иначе пустая строка" },
  },
  required: ["is_food", "title", "items", "comment", "is_package", "label_found", "barcode"],
};

const TEXT_SCHEMA = {
  type: "OBJECT",
  properties: {
    intent: { type: "STRING", enum: ["food_log", "question", "other"] },
    answer: { type: "STRING" },
    title: { type: "STRING" },
    items: { type: "ARRAY", items: ITEM_SCHEMA },
  },
  required: ["intent", "answer", "title", "items"],
};

const PHOTO_PROMPT = `Ты нутрициолог-ассистент приложения FITTER. Посмотри на фото.
Если на фото нет еды или напитков — верни is_food=false и пустой items.
Если еда есть — перечисли каждый отдельный продукт или блюдо на фото.
Для каждого оцени вес порции в граммах по размеру тарелки, приборов и упаковки,
и укажи типичные калории, белки, жиры и углеводы НА 100 ГРАММ.
Не дроби блюдо слишком мелко: суп, салат, бутерброд — одна позиция.
Если на фото упаковка продукта (йогурт, батончик, пачка, бутылка): is_package=true, одна позиция с названием продукта и брендом.
Если видна таблица пищевой ценности — перепиши КБЖУ на 100 г точно с этикетки (label_found=true).
Если на этикетке значения на порцию, а не на 100 г — пересчитай на 100 г.
Вес grams — масса нетто с упаковки; если не видна — типичная масса такой упаковки.
Если под штрихкодом видны цифры — перепиши их в barcode без пробелов, иначе barcode пустой.
Названия пиши по-русски, коротко. Будь реалистичен, не занижай и не завышай.`;

const TEXT_PROMPT = `Ты дружелюбный нутрициолог-ассистент Telegram-бота FITTER. Пиши по-русски.
Определи, что прислал пользователь:
• food_log — он сообщает, что съел или выпил (например «съел 2 яйца и тост», «выпил латте 300 мл»).
  Тогда заполни items: продукты, вес в граммах (оцени, если не указан), КБЖУ на 100 г; title — короткое название;
  answer — одна короткая фраза.
• question — вопрос про питание, калории, продукты, спорт, здоровый образ жизни.
  Тогда ответь в answer понятно и коротко (до 700 символов), без markdown-разметки, можно с эмодзи.
  Учитывай данные пользователя ниже, если это уместно. Не ставь диагнозов, при проблемах со здоровьем советуй врача.
• other — всё остальное. В answer вежливо напомни, что ты помогаешь с питанием и можно прислать фото еды.
Для question и other верни пустой items и пустой title.`;

let lastModelUsed = null;
let workingModel = null; // модель, которая ответила в прошлый раз (чтобы не тратить время на недоступные)

// Cloudflare даёт фоновой задаче ~30 секунд, поэтому укладываемся в 24
const AI_DEADLINE_MS = 24000;

async function gemini(env, parts, schema, temperature = 0.2) {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY не задан");
  const started = Date.now();
  if (!workingModel && env.DB) workingModel = await env.DB.get("cfg:model").catch(() => null);
  const models = [...new Set([env.GEMINI_MODEL, workingModel, ...MODEL_FALLBACKS].filter(Boolean))];
  const body = JSON.stringify({
    contents: [{ role: "user", parts }],
    generationConfig: { temperature, responseMimeType: "application/json", responseSchema: schema },
  });
  let lastErr = null;
  for (const model of models) {
    const left = AI_DEADLINE_MS - (Date.now() - started);
    if (left < 3000) break;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), left);
    let r;
    try {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
        body,
        signal: ctrl.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      lastErr = new Error(`Gemini ${model}: нет ответа за ${Math.round(left / 1000)} с`);
      break;
    }
    clearTimeout(timer);
    if (r.ok) {
      const j = await r.json();
      const text = (j.candidates?.[0]?.content?.parts || [])
        .filter((p) => !p.thought)
        .map((p) => p.text || "")
        .join("");
      if (!text) { lastErr = new Error(`Gemini ${model}: пустой ответ`); continue; }
      lastModelUsed = model;
      if (workingModel !== model) {
        workingModel = model;
        if (env.DB) await env.DB.put("cfg:model", model).catch(() => {});
      }
      console.log(`Gemini ${model}: ${Date.now() - started} мс`);
      return JSON.parse(text);
    }
    const errText = await r.text();
    lastErr = new Error(`Gemini ${model} ${r.status}: ${errText.slice(0, 300)}`);
    console.error(lastErr.message);
    if (model === workingModel) workingModel = null;
    // Модель не найдена / лимит / сбой — пробуем следующую. Неверный ключ — нет смысла пробовать дальше.
    if (![404, 429, 500, 503].includes(r.status)) break;
  }
  throw lastErr || new Error("Gemini: не успели получить ответ");
}

function cleanItems(items) {
  const num = (x, max) => {
    const n = Number(x);
    return Number.isFinite(n) ? Math.min(Math.max(n, 0), max) : 0;
  };
  return (Array.isArray(items) ? items : [])
    .map((it) => ({
      name: String(it.name || "Продукт").trim().slice(0, 60),
      grams: Math.max(1, round(num(it.grams, 3000))),
      kcal_100: r1(num(it.kcal_100, 900)),
      protein_100: r1(num(it.protein_100, 100)),
      fat_100: r1(num(it.fat_100, 100)),
      carbs_100: r1(num(it.carbs_100, 100)),
    }))
    .slice(0, 12);
}

function checkAiLimit(env, u) {
  const limit = Number(env.DAILY_AI_LIMIT || 40);
  const d = today(u);
  if (!u.ai || u.ai.date !== d) u.ai = { date: d, n: 0 };
  if (u.ai.n >= limit) return false;
  u.ai.n++;
  return true;
}

function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let s = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  return btoa(s);
}

// ───────────────────────────── Текст сообщений ─────────────────────────────

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function bar(value, target, len = 10) {
  const pct = target ? value / target : 0;
  const filled = Math.min(len, Math.round(pct * len));
  return "▓".repeat(filled) + "░".repeat(len - filled) + ` ${Math.round(pct * 100)}%`;
}

function mealText(meal) {
  const t = sumItems(meal.items);
  const lines = meal.items.map((it) => `• ${esc(it.name)} — ${it.grams} г — ${round(itemTotals(it).kcal)} ккал`);
  return (
    `🍽 <b>${esc(meal.title)}</b> · ${meal.time}\n` +
    lines.join("\n") +
    `\n\n<b>Итого: ${round(t.kcal)} ккал</b>\nБ ${round(t.p)} г · Ж ${round(t.f)} г · У ${round(t.c)} г`
  );
}

function remainingText(u, day, date) {
  const t = dayTotals(day);
  const left = u.targets.kcal - t.kcal;
  const label = date === today(u) ? "За сегодня" : `За ${humanDate(date)}`;
  return (
    `📊 ${label}: <b>${round(t.kcal)}</b> из ${u.targets.kcal} ккал\n` +
    (left >= 0 ? `Осталось: <b>${round(left)} ккал</b>` : `Перебор: <b>${round(-left)} ккал</b>`)
  );
}

function mealCard(u, meal, day, date, comment) {
  return mealText(meal) + (comment ? `\n\n${/^📦/.test(comment) ? "" : "💡 "}${esc(comment)}` : "") + "\n\n" + remainingText(u, day, date);
}

function mealKeyboard(env, date, meal) {
  const rows = [];
  let row = [];
  meal.items.forEach((it, i) => {
    const name = it.name.length > 14 ? it.name.slice(0, 13) + "…" : it.name;
    row.push({ text: `✏️ ${name} ${it.grams}г`, callback_data: `e|${date}|${meal.id}|${i}` });
    if (row.length === 2) { rows.push(row); row = []; }
  });
  if (row.length) rows.push(row);
  rows.push([{ text: "🗑 Удалить", callback_data: `x|${date}|${meal.id}` }, appButton(env, "📱 Дневник")]);
  return { inline_keyboard: rows };
}

const HELP = `🍏 <b>FITTER</b> — одно фото, полный контроль 📸

<b>Как пользоваться</b>
1. Сфотографируй еду и отправь сюда фото
2. Я определю продукты, вес и посчитаю КБЖУ
3. Если я ошибся с весом — нажми ✏️ и впиши правильный
4. Всё сохраняется в дневник питания

<b>Ещё можно</b>
✍️ Написать текстом: «съел 2 яйца и тост»
❓ Задать вопрос: «сколько белка в твороге?»
📦 Сфотографировать упаковку или этикетку, или прислать цифры штрихкода
💧 Отметить воду: кнопка «Вода» или «вода 300»
⚖️ Записать вес: /weight 72.5

<b>Команды</b>
/today — итоги дня
/week — неделя
/water — вода
/weight — записать вес
/profile — мой профиль и норма
/app — открыть дневник
/reset — пройти анкету заново

<i>FITTER считает примерно и не заменяет врача или диетолога.</i>`;

// ───────────────────────────── Обработка сообщений ─────────────────────────────

async function handleUpdate(update, env) {
  if (update.message) return onMessage(update.message, env);
  if (update.callback_query) return onCallback(update.callback_query, env);
}

function newUser(from) {
  return { id: from.id, name: from.first_name || "", tz: DEFAULT_TZ, created: Date.now(), state: null };
}

function parseNum(text) {
  const m = String(text).replace(",", ".").match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : NaN;
}

async function onMessage(msg, env) {
  if (msg.chat.type !== "private" || !msg.from) return;
  const chatId = msg.chat.id;
  let u = (await getUser(env, msg.from.id)) || newUser(msg.from);
  const text = (msg.text || "").trim();

  // Служебные команды для своих иконок
  if ((msg.entities || msg.caption_entities || []).some((e) => e.type === "custom_emoji")) return sendEmojiIds(env, chatId, msg);
  if (text.startsWith("/emojipack")) return sendEmojiPack(env, chatId, text.split(/\s+/)[1]);
  if (text === "/emojiid") return send(env, chatId, "Отправь мне иконки из набора, и я пришлю их номера 🔢");
  if (text === "/makeemoji") return makeEmojiPack(env, chatId, msg.from);

  if (text === "/start" || text.startsWith("/start ")) {
    if (u.targets) {
      u.state = null;
      await saveUser(env, u);
      return send(env, chatId, `С возвращением, ${esc(u.name || "друг")}! 👋\nОтправь фото еды — я посчитаю калории.`, { reply_markup: MAIN_KEYBOARD });
    }
    return startOnboarding(env, u, chatId);
  }
  if (text === "/reset") return startOnboarding(env, u, chatId);

  // Анкета
  if (u.state && u.state.step) {
    if (text.startsWith("/") && u.targets) {
      u.state = null; // вышли из анкеты командой
    } else {
      return onboardingText(env, u, chatId, text);
    }
  }
  if (!u.targets) return startOnboarding(env, u, chatId);

  // Ждём исправление продукта: новый вес и/или название
  if (u.state && u.state.type === "edit") {
    if (text && !text.startsWith("/") && !isMenu(text)) {
      const fix = parseFix(text);
      if (!fix) return send(env, chatId, "Напиши вес (<b>150</b>), название (<b>форель</b>) или всё вместе (<b>форель 200 г</b>)");
      return applyEdit(env, u, chatId, fix);
    }
    u.state = null;
    await saveUser(env, u);
  }

  // Ждём вес тела
  if (u.state && u.state.type === "weight") {
    const kg = parseNum(text);
    if (text && !text.startsWith("/") && !isMenu(text)) {
      if (!(kg >= 30 && kg <= 300)) return send(env, chatId, "Напиши вес числом в килограммах, например <b>72.5</b>");
      u.state = null;
      return logWeight(env, u, chatId, kg);
    }
    u.state = null;
    await saveUser(env, u);
  }

  if (msg.photo && msg.photo.length) return onPhoto(env, u, chatId, msg);

  // Вода текстом: «вода 300», «+500»
  const waterMl = parseWater(text);
  if (waterMl) return sendWater(env, u, chatId, waterMl);

  // Цифры штрихкода
  const digits = text.replace(/[\s-]/g, "");
  if (/^\d{8,14}$/.test(digits)) {
    const code = cleanBarcode(digits);
    if (code) return onBarcodeText(env, u, chatId, code);
    return send(env, chatId, "📦 Похоже на штрихкод, но цифры не сходятся. Проверь и пришли ещё раз, или сфотографируй этикетку 📸");
  }
  if (msg.document && /^image\//.test(msg.document.mime_type || "")) return onPhoto(env, u, chatId, msg);

  const cmd = MENU[menuLabel(text)] || text.split(/\s+/)[0].replace(/@\w+$/, "");
  switch (cmd) {
    case "/today": return sendDay(env, u, chatId, today(u));
    case "/week": return sendWeek(env, u, chatId);
    case "/profile": return sendProfile(env, u, chatId);
    case "/water": return sendWater(env, u, chatId);
    case "/help": return send(env, chatId, HELP, { reply_markup: MAIN_KEYBOARD });
    case "/app":
      return send(env, chatId, "Твой дневник питания по дням 👇", { reply_markup: { inline_keyboard: [[appButton(env)]] } });
    case "/weight": {
      const kg = text.startsWith("/weight") ? parseNum(text.slice(7)) : NaN;
      if (kg >= 30 && kg <= 300) return logWeight(env, u, chatId, kg);
      u.state = { type: "weight" };
      await saveUser(env, u);
      return send(env, chatId, `Сколько ты сейчас весишь? Напиши в кг, например <b>${u.weight || 70}</b>`);
    }
  }
  if (text.startsWith("/")) return send(env, chatId, "Не знаю такой команды 🤔\n\n" + HELP, { reply_markup: MAIN_KEYBOARD });
  if (text) return onText(env, u, chatId, text);
  return send(env, chatId, "Пришли фото еды 📸 или напиши, что съел ✍️");
}

// Кнопки меню: с иконкой Telegram присылает текст без эмодзи, поэтому смотрим только на слово
const MENU = { "Сегодня": "/today", "Неделя": "/week", "Вода": "/water", "Вес": "/weight", "Профиль": "/profile", "Помощь": "/help" };
const menuLabel = (t) => String(t).replace(/^[^A-Za-zА-Яа-яЁё]+/, "").trim();
const isMenu = (t) => !!MENU[menuLabel(t)];

// ── Анкета ──

async function startOnboarding(env, u, chatId) {
  u.state = { step: "sex" };
  await saveUser(env, u);
  await send(
    env, chatId,
    `Привет${u.name ? ", " + esc(u.name) : ""}! 👋 Я 🍏 <b>FITTER</b> — твой счётчик калорий 🥦\n\n` +
      `Отправляешь фото еды — я определяю продукты, считаю калории, белки, жиры и углеводы и веду твой дневник питания.\n\n` +
      `Сначала короткая анкета, чтобы посчитать твою дневную норму. Это 6 вопросов ⏱`,
    { reply_markup: { remove_keyboard: true } }
  );
  return send(env, chatId, "<b>1/6.</b> Твой пол?", {
    reply_markup: { inline_keyboard: [[{ text: "👨 Мужской", callback_data: "sex|m" }, { text: "👩 Женский", callback_data: "sex|f" }]] },
  });
}

async function onboardingText(env, u, chatId, text) {
  const n = parseNum(text);
  const step = u.state.step;
  if (step === "age") {
    if (!(n >= 10 && n <= 100)) return send(env, chatId, "Напиши возраст числом, например <b>16</b>");
    u.age = round(n);
    u.state = { step: "height" };
    await saveUser(env, u);
    return send(env, chatId, "<b>3/6.</b> Твой рост в сантиметрах? Например <b>175</b>");
  }
  if (step === "height") {
    if (!(n >= 100 && n <= 250)) return send(env, chatId, "Напиши рост в сантиметрах, например <b>175</b>");
    u.height = round(n);
    u.state = { step: "weight" };
    await saveUser(env, u);
    return send(env, chatId, "<b>4/6.</b> Твой вес в килограммах? Например <b>68.5</b>");
  }
  if (step === "weight") {
    if (!(n >= 30 && n <= 300)) return send(env, chatId, "Напиши вес в килограммах, например <b>68.5</b>");
    u.weight = r1(n);
    u.state = { step: "activity" };
    await saveUser(env, u);
    return askActivity(env, chatId);
  }
  if (step === "sex") return send(env, chatId, "Нажми кнопку выше: 👨 Мужской или 👩 Женский");
  if (step === "activity") return askActivity(env, chatId);
  if (step === "goal") return askGoal(env, chatId);
}

function askActivity(env, chatId) {
  return send(env, chatId, "<b>5/6.</b> Насколько ты активен?", {
    reply_markup: { inline_keyboard: Object.entries(ACTIVITY).map(([k, v]) => [{ text: v, callback_data: `act|${k}` }]) },
  });
}
function askGoal(env, chatId) {
  return send(env, chatId, "<b>6/6.</b> Какая у тебя цель?", {
    reply_markup: { inline_keyboard: Object.entries(GOALS).map(([k, v]) => [{ text: v, callback_data: `goal|${k}` }]) },
  });
}

function targetsText(u) {
  const t = u.targets;
  return (
    `🎯 <b>Твоя дневная норма</b>\n` +
    `🔥 Калории: <b>${t.kcal} ккал</b>\n` +
    `🥩 Белки: ${t.p} г\n🧈 Жиры: ${t.f} г\n🍞 Углеводы: ${t.c} г`
  );
}

async function finishOnboarding(env, u, chatId) {
  const first = !u.targets;
  u.targets = calcTargets(u);
  u.state = null;
  await saveUser(env, u);
  const weights = await getWeights(env, u.id);
  if (!weights.length) await env.DB.put(`w:${u.id}`, JSON.stringify([{ date: today(u), kg: u.weight }]));
  await send(
    env, chatId,
    `${first ? "Готово! ✅" : "Анкета обновлена ✅"}\n\n${targetsText(u)}\n\n` +
      `Теперь просто <b>отправь фото своей еды</b> 📸 — я всё посчитаю и запишу в дневник.\n` +
      `Ещё можно написать текстом, например «съел банан и йогурт».`,
    { reply_markup: MAIN_KEYBOARD }
  );
  return send(env, chatId, "Дневник по дням всегда здесь 👇", { reply_markup: { inline_keyboard: [[appButton(env)]] } });
}

// ── Кнопки ──

async function onCallback(q, env) {
  const data = q.data || "";
  const chatId = q.message?.chat?.id;
  const msgId = q.message?.message_id;
  const u = await getUser(env, q.from.id);
  const answer = (text) => tg(env, "answerCallbackQuery", { callback_query_id: q.id, text });
  if (!u || !chatId) return answer("Напиши /start");
  const [kind, a, b, c] = data.split("|");

  if (kind === "sex" && u.state?.step === "sex") {
    u.sex = a === "f" ? "f" : "m";
    u.state = { step: "age" };
    await saveUser(env, u);
    await answer();
    await edit(env, chatId, msgId, `<b>1/6.</b> Пол: ${u.sex === "m" ? "👨 Мужской" : "👩 Женский"}`);
    return send(env, chatId, "<b>2/6.</b> Сколько тебе лет?");
  }
  if (kind === "act" && u.state?.step === "activity" && ACTIVITY[a]) {
    u.activity = a;
    u.state = { step: "goal" };
    await saveUser(env, u);
    await answer();
    await edit(env, chatId, msgId, `<b>5/6.</b> Активность: ${ACTIVITY[a]}`);
    return askGoal(env, chatId);
  }
  if (kind === "goal" && u.state?.step === "goal" && GOALS[a]) {
    u.goal = a;
    await answer();
    await edit(env, chatId, msgId, `<b>6/6.</b> Цель: ${GOALS[a]}`);
    return finishOnboarding(env, u, chatId);
  }
  if (kind === "reset") {
    await answer();
    return startOnboarding(env, u, chatId);
  }
  if (kind === "today") {
    await answer();
    return sendDay(env, u, chatId, today(u));
  }
  if (kind === "week") {
    await answer();
    return sendWeek(env, u, chatId);
  }
  if (kind === "askw") {
    u.state = { type: "weight" };
    await saveUser(env, u);
    await answer();
    return send(env, chatId, `Сколько ты сейчас весишь? Напиши в кг, например <b>${u.weight || 70}</b>`);
  }
  if (kind === "e" && isDate(a)) {
    const day = await getDay(env, u.id, a);
    const meal = day.meals.find((m) => m.id === b);
    const it = meal?.items[Number(c)];
    if (!it) return answer("Эта запись уже удалена");
    u.state = { type: "edit", date: a, mealId: b, idx: Number(c), msgId };
    await saveUser(env, u);
    await answer();
    return send(
      env, chatId,
      `✏️ Сейчас: «${esc(it.name)}» — <b>${it.grams} г</b>\n\n` +
        `Напиши, что исправить:\n` +
        `• только вес: <b>150</b>\n` +
        `• только название: <b>форель</b>\n` +
        `• всё вместе: <b>форель 200 г</b>\n\n` +
        `Если поменяешь название, я заново посчитаю калории для нового продукта.`,
      { reply_markup: { force_reply: true, input_field_placeholder: "Например: форель 200 г" } }
    );
  }
  if (kind === "w" && isDate(a)) {
    const delta = Number(b);
    if (![250, 500, -250].includes(delta)) return answer();
    const { day, reached } = await addWater(env, u, a, delta);
    await answer(delta > 0 ? `💧 +${delta} мл` : "Убрал 250 мл");
    await edit(env, chatId, msgId, waterText(u, day, a, delta), { reply_markup: waterKeyboard(a) });
    if (reached) return send(env, chatId, "🎉 Норма воды на сегодня выполнена! Так держать 💧", { message_effect_id: EFFECT_PARTY });
    return;
  }
  if (kind === "x" && isDate(a)) {
    const day = await getDay(env, u.id, a);
    const before = day.meals.length;
    day.meals = day.meals.filter((m) => m.id !== b);
    if (day.meals.length === before) return answer("Уже удалено");
    await saveDay(env, u.id, a, day);
    await answer("Удалено");
    return edit(env, chatId, msgId, `🗑 Приём пищи удалён\n\n${remainingText(u, day, a)}`);
  }
  return answer();
}

// ── Фото еды ──

function pickPhoto(msg) {
  if (msg.document) return msg.document.file_id;
  const photos = msg.photo;
  // Фото до 1000 px: нейросети хватает, а работает быстрее
  const ok = photos.filter((p) => Math.max(p.width, p.height) <= 1000);
  return (ok.length ? ok[ok.length - 1] : photos[0]).file_id;
}

async function onPhoto(env, u, chatId, msg) {
  if (!checkAiLimit(env, u)) {
    return send(env, chatId, "На сегодня лимит запросов к нейросети закончился 😔 Завтра снова можно! А пока можешь поправить записи в дневнике.");
  }
  await saveUser(env, u);
  tg(env, "sendChatAction", { chat_id: chatId, action: "typing" });
  const wait = await send(env, chatId, "🔍 Смотрю на фото и считаю калории…");
  const waitId = wait.result?.message_id;
  try {
    const f = await tg(env, "getFile", { file_id: pickPhoto(msg) });
    if (!f.ok) throw new Error("getFile failed");
    const path = f.result.file_path;
    const img = await fetch(`https://api.telegram.org/file/bot${env.BOT_TOKEN}/${path}`);
    if (!img.ok) throw new Error("download failed " + img.status);
    const b64 = toBase64(await img.arrayBuffer());
    const mime = /\.png$/i.test(path) ? "image/png" : /\.webp$/i.test(path) ? "image/webp" : "image/jpeg";
    const caption = (msg.caption || "").trim().slice(0, 300);
    const res = await gemini(env, [
      { text: PHOTO_PROMPT + (caption ? `\n\nПодсказка от пользователя (учти её в первую очередь): ${caption}` : "") },
      { inline_data: { mime_type: mime, data: b64 } },
    ], PHOTO_SCHEMA);
    const items = cleanItems(res.items);
    if (!res.is_food || !items.length) {
      return edit(env, chatId, waitId, "🤔 Не вижу на фото еды. Попробуй сфотографировать тарелку сверху и поближе.\n\nИли напиши текстом, что ты съел.");
    }
    // Упаковка: КБЖУ с этикетки, а если этикетки не видно — ищем по штрихкоду
    let comment = res.comment;
    let source = "photo";
    if (res.is_package) {
      source = "package";
      const code = cleanBarcode(res.barcode);
      if (res.label_found) {
        comment = "📦 КБЖУ взяты с этикетки. Если съел не всю упаковку — нажми ✏️ и впиши вес";
      } else if (code) {
        const p = await lookupBarcode(env, code);
        if (p) {
          items.splice(0, 1, { ...p, grams: p.grams || items[0]?.grams || 100 });
          comment = `📦 Нашёл по штрихкоду ${code} в базе Open Food Facts. Если съел не всю упаковку — нажми ✏️ и впиши вес`;
          source = "barcode";
        }
      }
      if (source === "package" && !res.label_found) {
        comment = "📦 Это упаковка, но КБЖУ я оценил примерно. Для точности сфотографируй этикетку с пищевой ценностью или пришли цифры штрихкода";
      }
    }
    return saveMealAndReply(env, u, chatId, waitId, res.title, items, source, comment);
  } catch (e) {
    console.error("photo error:", e && e.stack ? e.stack : e);
    return edit(env, chatId, waitId, "😔 Не получилось распознать фото. Попробуй ещё раз через минуту или напиши текстом, что ты съел.");
  }
}

// ── Штрихкод ──

// Проверка контрольной цифры EAN-8, UPC-A, EAN-13, GTIN-14: отсекает ошибки чтения
function cleanBarcode(s) {
  const code = String(s || "").replace(/[\s-]/g, "");
  if (!/^(\d{8}|\d{12,14})$/.test(code)) return null;
  const d = code.split("").map(Number);
  const check = d.pop();
  let sum = 0;
  d.reverse().forEach((x, i) => { sum += x * (i % 2 === 0 ? 3 : 1); });
  return (10 - (sum % 10)) % 10 === check ? code : null;
}

// Бесплатная открытая база продуктов Open Food Facts, ответы кэшируем в KV
async function lookupBarcode(env, code) {
  const key = `bc:${code}`;
  const cached = await env.DB.get(key, "json").catch(() => null);
  if (cached) return cached.miss ? null : cached;
  let product = null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,product_name_ru,generic_name,brands,product_quantity,nutriments`,
      { headers: { "user-agent": "FITTER-bot/1.3 (github.com/sailxx/FITTER-AI)" }, signal: ctrl.signal }
    );
    clearTimeout(timer);
    if (r.ok) {
      const j = await r.json();
      const p = j.status === 1 ? j.product : null;
      const n = p?.nutriments || {};
      const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : null);
      let kcal = num(n["energy-kcal_100g"]);
      if (kcal === null && num(n.energy_100g) !== null) kcal = num(n.energy_100g) / 4.184;
      const name = String(p?.product_name_ru || p?.product_name || p?.generic_name || "").trim();
      if (p && kcal !== null && name) {
        const brand = String(p.brands || "").split(",")[0].trim();
        const [item] = cleanItems([{
          name: brand && !name.toLowerCase().includes(brand.toLowerCase()) ? `${name} ${brand}` : name,
          grams: num(p.product_quantity) || 100,
          kcal_100: kcal,
          protein_100: num(n.proteins_100g) || 0,
          fat_100: num(n.fat_100g) || 0,
          carbs_100: num(n.carbohydrates_100g) || 0,
        }]);
        product = item;
      }
    } else if (r.status !== 404) {
      return null; // сбой базы: не кэшируем
    }
  } catch (e) {
    console.error("barcode lookup:", e && e.message);
    return null;
  }
  await env.DB.put(key, JSON.stringify(product || { miss: true }), { expirationTtl: product ? 30 * 86400 : 86400 }).catch(() => {});
  return product;
}

async function onBarcodeText(env, u, chatId, code) {
  tg(env, "sendChatAction", { chat_id: chatId, action: "typing" });
  const p = await lookupBarcode(env, code);
  if (!p) {
    return send(env, chatId, `📦 Не нашёл штрихкод ${code} в базе продуктов 😔\n\nСфотографируй этикетку с пищевой ценностью, и я перепишу КБЖУ с неё 📸`);
  }
  return saveMealAndReply(env, u, chatId, null, p.name, [p], "barcode",
    "📦 Нашёл по штрихкоду в базе Open Food Facts. Если съел не всю упаковку — нажми ✏️ и впиши вес");
}

// ── Вода ──

const waterGoal = (u) => Math.max(1500, Math.round(((u.weight || 70) * 30) / 50) * 50); // 30 мл на 1 кг веса
const liters = (ml) => String(Math.round(ml / 10) / 100).replace(".", ",") + " л";

// «вода 300», «+300», «300 мл воды», «выпил 0.5 л воды», «2 стакана воды»
function parseWater(text) {
  const t = String(text).toLowerCase().replace(",", ".").replace(/ё/g, "е").trim();
  let m;
  let ml = null;
  if ((m = t.match(/^\+\s*(\d{2,4})\s*(мл|ml)?$/))) ml = Number(m[1]);
  else if ((m = t.match(/^(?:вода|воды|💧)\s*\+?\s*(\d{2,4})\s*(?:мл|ml)?$/))) ml = Number(m[1]);
  else if ((m = t.match(/^(?:выпил[а]?\s+)?(\d{2,4})\s*(?:мл|ml)\s+воды$/))) ml = Number(m[1]);
  else if ((m = t.match(/^(?:выпил[а]?\s+)?(\d(?:\.\d+)?)\s*(?:л|литр[а-я]*)\s+воды$/))) ml = Number(m[1]) * 1000;
  else if ((m = t.match(/^(?:выпил[а]?\s+)?(\d{1,2})?\s*стакан(?:а|ов)?\s+воды$/))) ml = Number(m[1] || 1) * 250;
  if (ml === null) return null;
  return ml >= 30 && ml <= 3000 ? Math.round(ml) : null;
}

function waterText(u, day, date, added) {
  const ml = day.water || 0;
  const goal = waterGoal(u);
  const left = goal - ml;
  return (
    (added ? `💧 ${added > 0 ? "+" : "−"}${Math.abs(added)} мл записал\n\n` : "") +
    `💧 <b>Вода ${date === today(u) ? "за сегодня" : "за " + humanDate(date)}</b>\n` +
    `<b>${liters(ml)}</b> из ${liters(goal)}\n${bar(ml, goal)}\n\n` +
    (left > 0 ? `Осталось: <b>${left} мл</b>, это примерно ${Math.ceil(left / 250)} стак.` : "Норма воды выполнена 🎉") +
    `\n\n<i>Норма: 30 мл на 1 кг веса. Можно написать «вода 300» или «+500»</i>`
  );
}

function waterKeyboard(date) {
  return {
    inline_keyboard: [
      [{ text: "💧 +250 мл", callback_data: `w|${date}|250` }, { text: "💧 +500 мл", callback_data: `w|${date}|500` }],
      [{ text: "↩️ −250 мл", callback_data: `w|${date}|-250` }],
    ],
  };
}

// Анимация на весь экран в чате Telegram (работает в личных чатах)
const EFFECT_PARTY = "5046509860389126442"; // 🎉

async function addWater(env, u, date, delta) {
  const day = await getDay(env, u.id, date);
  const before = day.water || 0;
  day.water = Math.min(10000, Math.max(0, before + delta));
  await saveDay(env, u.id, date, day);
  const goal = waterGoal(u);
  return { day, reached: before < goal && day.water >= goal };
}

async function sendWater(env, u, chatId, delta = 0) {
  const date = today(u);
  const { day, reached } = delta ? await addWater(env, u, date, delta) : { day: await getDay(env, u.id, date), reached: false };
  const extra = { reply_markup: waterKeyboard(date) };
  if (reached) extra.message_effect_id = EFFECT_PARTY;
  return send(env, chatId, waterText(u, day, date, delta), extra);
}

async function saveMealAndReply(env, u, chatId, waitId, title, items, source, comment) {
  const date = today(u);
  const day = await getDay(env, u.id, date);
  const meal = {
    id: crypto.randomUUID().slice(0, 8),
    time: nowTime(u),
    title: String(title || items.map((i) => i.name).join(", ")).slice(0, 60),
    items,
    source,
  };
  day.meals.push(meal);
  await saveDay(env, u.id, date, day);
  const text = mealCard(u, meal, day, date, comment);
  const extra = { reply_markup: mealKeyboard(env, date, meal) };
  if (waitId) return edit(env, chatId, waitId, text, extra);
  return send(env, chatId, text, extra);
}

// Разбираем исправление: «150», «150 г», «форель», «форель 200 г», «200г форели»
function parseFix(text) {
  const t = text.trim().replace(/\s+/g, " ");
  if (/^\d+([.,]\d+)?\s*(г|гр|грамм[а-я]*|g)?\.?$/i.test(t)) {
    const g = parseNum(t);
    return g > 0 && g <= 3000 ? { grams: g } : null;
  }
  let grams = null;
  const m = t.match(/(\d+([.,]\d+)?)\s*(г|гр|грамм[а-я]*|g)\.?(?=\s|$)/i);
  let name = t;
  if (m) {
    grams = parseNum(m[1]);
    if (!(grams > 0 && grams <= 3000)) return null;
    name = (t.slice(0, m.index) + " " + t.slice(m.index + m[0].length)).trim();
  }
  name = name.replace(/^[,.\-–—:\s]+|[,.\-–—:\s]+$/g, "").slice(0, 60);
  if (!name) return grams ? { grams } : null;
  return { name, grams };
}

const FIX_SCHEMA = {
  type: "OBJECT",
  properties: {
    name: { type: "STRING", description: "Название продукта по-русски, коротко, с большой буквы" },
    kcal_100: { type: "NUMBER" },
    protein_100: { type: "NUMBER" },
    fat_100: { type: "NUMBER" },
    carbs_100: { type: "NUMBER" },
    meal_title: { type: "STRING", description: "Новое короткое название всего приёма пищи" },
  },
  required: ["name", "kcal_100", "protein_100", "fat_100", "carbs_100", "meal_title"],
};

// Нейросеть пересчитывает КБЖУ продукта под новое название
async function recalcItem(env, meal, idx, name, grams) {
  const it = meal.items[idx];
  const others = meal.items.filter((_, i) => i !== idx).map((x) => x.name).join(", ");
  const res = await gemini(env, [{
    text:
      `Ты нутрициолог. Пользователь исправил продукт в приёме пищи.\n` +
      `Было: «${it.name}». Стало: «${name}».\n` +
      `Остальные продукты в тарелке: ${others || "нет"}.\n` +
      `Дай типичные калории, белки, жиры и углеводы НА 100 ГРАММ для «${name}» в том виде, как его обычно едят ` +
      `(если в старом названии было указано приготовление, соус или гарнир — учти это).\n` +
      `В name верни аккуратное название продукта. В meal_title — новое короткое название всего приёма пищи.`,
  }], FIX_SCHEMA);
  const clean = cleanItems([{ ...res, grams: grams || it.grams }])[0];
  if (!clean) throw new Error("пустой ответ");
  Object.assign(it, clean);
  if (res.meal_title) meal.title = String(res.meal_title).slice(0, 60);
}

async function applyEdit(env, u, chatId, fix) {
  const { date, mealId, idx, msgId } = u.state;
  u.state = null;
  const day = await getDay(env, u.id, date);
  const meal = day.meals.find((m) => m.id === mealId);
  if (!meal || !meal.items[idx]) {
    await saveUser(env, u);
    return send(env, chatId, "Эта запись уже удалена 🤷");
  }
  const it = meal.items[idx];
  const before = { name: it.name, grams: it.grams, kcal: round(itemTotals(it).kcal) };
  let waitId = null;

  if (fix.name) {
    if (!checkAiLimit(env, u)) {
      await saveUser(env, u);
      return send(env, chatId, "На сегодня лимит запросов к нейросети закончился 😔 Вес можно поправить, а название — завтра.");
    }
    await saveUser(env, u);
    const wait = await send(env, chatId, "🔄 Пересчитываю для нового продукта…");
    waitId = wait.result?.message_id;
    try {
      await recalcItem(env, meal, idx, fix.name, fix.grams);
    } catch (e) {
      console.error("fix error:", e && e.stack ? e.stack : e);
      return edit(env, chatId, waitId, "😔 Не получилось пересчитать. Попробуй ещё раз: нажми ✏️ у продукта.");
    }
  } else {
    await saveUser(env, u);
    it.grams = round(fix.grams);
  }

  await saveDay(env, u.id, date, day);
  const text = mealCard(u, meal, day, date);
  const extra = { reply_markup: mealKeyboard(env, date, meal) };
  if (msgId) await edit(env, chatId, msgId, text, extra);
  const after = round(itemTotals(it).kcal);
  const what =
    before.name !== it.name
      ? `«${esc(before.name)}» ${before.grams} г → <b>«${esc(it.name)}» ${it.grams} г</b>`
      : `«${esc(it.name)}»: ${before.grams} г → <b>${it.grams} г</b>`;
  const summary = `✅ ${what}\n${before.kcal} → <b>${after} ккал</b>. Пересчитал!\n\n${remainingText(u, day, date)}`;
  if (waitId) return edit(env, chatId, waitId, summary);
  return send(env, chatId, summary, { reply_markup: MAIN_KEYBOARD });
}

// ── Текст: записать еду или ответить на вопрос ──

async function onText(env, u, chatId, text) {
  if (!checkAiLimit(env, u)) {
    return send(env, chatId, "На сегодня лимит запросов к нейросети закончился 😔 Завтра снова можно!");
  }
  await saveUser(env, u);
  tg(env, "sendChatAction", { chat_id: chatId, action: "typing" });
  const date = today(u);
  const t = dayTotals(await getDay(env, u.id, date));
  const ctx =
    `Данные пользователя: пол ${u.sex === "m" ? "мужской" : "женский"}, ${u.age} лет, рост ${u.height} см, вес ${u.weight} кг, ` +
    `цель: ${GOALS[u.goal]}. Норма: ${u.targets.kcal} ккал, Б ${u.targets.p} г, Ж ${u.targets.f} г, У ${u.targets.c} г. ` +
    `Уже съедено сегодня: ${round(t.kcal)} ккал, Б ${round(t.p)}, Ж ${round(t.f)}, У ${round(t.c)}.`;
  try {
    const res = await gemini(env, [{ text: `${TEXT_PROMPT}\n\n${ctx}\n\nСообщение пользователя: ${text.slice(0, 1500)}` }], TEXT_SCHEMA, 0.4);
    const items = cleanItems(res.items);
    if (res.intent === "food_log" && items.length) {
      return saveMealAndReply(env, u, chatId, null, res.title, items, "text", null);
    }
    return send(env, chatId, esc(res.answer || "Пришли фото еды 📸 — я посчитаю калории."), { reply_markup: MAIN_KEYBOARD });
  } catch (e) {
    console.error("text error:", e && e.stack ? e.stack : e);
    return send(env, chatId, "😔 Нейросеть сейчас не отвечает. Попробуй ещё раз через минуту.");
  }
}

// ── Итоги дня и недели ──

async function sendDay(env, u, chatId, date) {
  const day = await getDay(env, u.id, date);
  const t = dayTotals(day);
  const g = u.targets;
  let text =
    `📊 <b>${date === today(u) ? "Сегодня" : humanDate(date)}, ${humanDate(date)}</b>\n\n` +
    `🔥 ${round(t.kcal)} / ${g.kcal} ккал\n${bar(t.kcal, g.kcal)}\n\n` +
    `🥩 Белки: ${round(t.p)} / ${g.p} г\n🧈 Жиры: ${round(t.f)} / ${g.f} г\n🍞 Углеводы: ${round(t.c)} / ${g.c} г\n` +
    `💧 Вода: ${liters(day.water || 0)} / ${liters(waterGoal(u))}\n\n`;
  if (day.meals.length) {
    text += "<b>Приёмы пищи</b>\n" + day.meals.map((m) => `${m.time} · ${esc(m.title)} — ${round(sumItems(m.items).kcal)} ккал`).join("\n");
    const left = g.kcal - t.kcal;
    text += `\n\n${left >= 0 ? `Осталось: <b>${round(left)} ккал</b>` : `Перебор: <b>${round(-left)} ккал</b>`}`;
  } else {
    text += "Пока ничего не записано. Отправь фото еды 📸";
  }
  return send(env, chatId, text, { reply_markup: { inline_keyboard: [[{ text: "💧 +250 мл воды", callback_data: `w|${date}|250` }, appButton(env)]] } });
}

// Цветная полоска из 5 квадратиков: зелёный — норма, синий — мало, красный — больше нормы
function weekBar(pct) {
  if (pct === null) return "⬜⬜⬜⬜⬜";
  const sq = pct < 0.8 ? "🟦" : pct <= 1.1 ? "🟩" : "🟥";
  const n = Math.max(1, Math.min(5, Math.round(pct * 5)));
  return sq.repeat(n) + "⬜".repeat(5 - n);
}
const plural = (n, one, few, many) => {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
};

async function sendWeek(env, u, chatId) {
  const end = today(u);
  const norm = u.targets.kcal;
  const dates = [...Array(7)].map((_, i) => shiftDate(end, i - 6));
  const [days, weights] = await Promise.all([Promise.all(dates.map((d) => getDay(env, u.id, d))), getWeights(env, u.id)]);

  const rows = dates.map((d, i) => {
    const wd = WEEKDAYS[new Date(d + "T00:00:00Z").getUTCDay()];
    const has = days[i].meals.length > 0;
    const k = round(dayTotals(days[i]).kcal);
    const label = `${wd} ${d.slice(8)}`;
    if (!has) return { d, has, k: 0, line: `${weekBar(null)}  ${label} · <i>нет записей</i>` };
    const pct = k / norm;
    return { d, has, k, pct, line: `${weekBar(pct)}  ${d === end ? "<b>" + label + "</b>" : label} · <b>${k}</b> ккал` };
  });

  // Среднее считаем по законченным дням: сегодняшний ещё не завершён
  const done = rows.filter((r) => r.has && r.d !== end);
  const base = done.length ? done : rows.filter((r) => r.has);
  const avg = base.length ? round(base.reduce((a, r) => a + r.k, 0) / base.length) : 0;
  const inNorm = rows.filter((r) => r.has && r.pct >= 0.8 && r.pct <= 1.1).length;
  const recorded = rows.filter((r) => r.has).length;
  const best = rows.filter((r) => r.has).sort((a, b) => Math.abs(1 - a.pct) - Math.abs(1 - b.pct))[0];
  const water = days.map((d) => d.water || 0).filter(Boolean);
  const avgWater = water.length ? water.reduce((a, b) => a + b, 0) / water.length : 0;

  let text =
    `📅 <b>Неделя</b>\n<i>${humanDate(dates[0])} — ${humanDate(end)}</i>\n\n` +
    `${rows.map((r) => r.line).join("\n")}\n\n` +
    `<i>🟩 норма · 🟦 мало · 🟥 больше · норма ${norm} ккал</i>\n\n`;

  if (!recorded) {
    text += "📸 За неделю пока нет записей. Отправь фото еды, и я начну считать";
  } else {
    const stats = [
      `🔥 В среднем <b>${avg} ккал</b> в день${done.length ? "" : " (пока только сегодня)"}`,
      `🎯 В норме <b>${inNorm} из ${recorded}</b> ${recorded === 1 ? "дня" : "дней"}`,
    ];
    if (best) stats.push(`🏆 Лучший день: <b>${WEEKDAYS[new Date(best.d + "T00:00:00Z").getUTCDay()]}, ${humanDate(best.d)}</b> — ${best.k} ккал`);
    if (avgWater) stats.push(`💧 Вода в среднем <b>${liters(avgWater)}</b> из ${liters(waterGoal(u))}`);
    const wk = weights.filter((w) => w.date >= dates[0]);
    if (wk.length > 1) {
      const diff = r1(wk[wk.length - 1].kg - wk[0].kg);
      stats.push(`⚖️ Вес: <b>${wk[wk.length - 1].kg} кг</b> (${diff > 0 ? "+" : ""}${diff} кг за неделю)`);
    }
    text += `<blockquote>${stats.join("\n")}</blockquote>\n`;

    // Короткий совет по итогам недели
    const pct = avg / norm;
    let tip;
    if (pct < 0.8) {
      tip = u.goal === "gain"
        ? `Не хватает в среднем ${norm - avg} ккал. Для набора массы добавь перекусы: творог, орехи, банан, кашу`
        : `Ты ешь меньше нормы на ${norm - avg} ккал. Слишком большой дефицит мешает результату, держись хотя бы 80% нормы`;
    } else if (pct > 1.1) {
      tip = u.goal === "lose"
        ? `В среднем больше нормы на ${avg - norm} ккал. Попробуй заменить сладкое и снеки на фрукты и белок`
        : `В среднем больше нормы на ${avg - norm} ккал. Следи за порциями и вечерними перекусами`;
    } else {
      tip = "Отлично, ты держишься в норме! Так держать 💪";
    }
    text += `💡 ${tip}`;
  }
  return send(env, chatId, text, { reply_markup: { inline_keyboard: [[{ text: "📊 Сегодня", callback_data: "today" }, appButton(env, "📱 Дневник")]] } });
}

async function sendProfile(env, u, chatId) {
  const t = u.targets;
  const yrs = `${u.age} ${plural(u.age, "год", "года", "лет")}`;
  const text =
    `👤 <b>${esc(u.name || "Профиль")}</b>\n\n` +
    `<blockquote>${u.sex === "m" ? "👨 Мужской" : "👩 Женский"} · 🎂 ${yrs}\n` +
    `📏 ${u.height} см · ⚖️ ${u.weight} кг\n` +
    `${ACTIVITY[u.activity]}\n` +
    `${GOALS[u.goal]}</blockquote>\n\n` +
    `🎯 <b>Дневная норма</b>\n` +
    `🔥 <b>${t.kcal} ккал</b>\n` +
    `<blockquote>🥩 Белки — <b>${t.p} г</b>\n` +
    `🧈 Жиры — <b>${t.f} г</b>\n` +
    `🍞 Углеводы — <b>${t.c} г</b>\n` +
    `💧 Вода — <b>${liters(waterGoal(u))}</b></blockquote>\n` +
    `<i>Норма пересчитывается, когда ты записываешь новый вес</i>`;
  return send(env, chatId, text, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "⚖️ Записать вес", callback_data: "askw" }, { text: "📅 Неделя", callback_data: "week" }],
        [{ text: "✏️ Изменить анкету", callback_data: "reset" }],
      ],
    },
  });
}

async function logWeight(env, u, chatId, kg) {
  kg = r1(kg);
  const list = await getWeights(env, u.id);
  const date = today(u);
  const prev = list.length ? list[list.length - 1].kg : u.weight;
  const filtered = list.filter((w) => w.date !== date);
  filtered.push({ date, kg });
  await env.DB.put(`w:${u.id}`, JSON.stringify(filtered.slice(-365)));
  u.weight = kg;
  u.state = null;
  u.targets = calcTargets(u);
  await saveUser(env, u);
  const diff = r1(kg - prev);
  const first = list.length ? list[0].kg : kg;
  const total = r1(kg - first);
  return send(
    env, chatId,
    `⚖️ Записал: <b>${kg} кг</b>` +
      (diff ? ` (${diff > 0 ? "+" : ""}${diff} кг с прошлого раза)` : "") +
      (list.length && total ? `\nС начала: ${total > 0 ? "+" : ""}${total} кг` : "") +
      `\n\nНорма пересчитана: <b>${u.targets.kcal} ккал</b> в день`,
    { reply_markup: MAIN_KEYBOARD }
  );
}

// ───────────────────────────── Mini App API ─────────────────────────────

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

// Проверяем, что запрос действительно пришёл из Telegram (подпись initData)
async function verifyInitData(initData, token) {
  if (!initData || !token) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const dataCheck = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const enc = new TextEncoder();
  const k1 = await crypto.subtle.importKey("raw", enc.encode("WebAppData"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const secret = await crypto.subtle.sign("HMAC", k1, enc.encode(token));
  const k2 = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = hex(await crypto.subtle.sign("HMAC", k2, enc.encode(dataCheck)));
  if (sig.length !== hash.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ hash.charCodeAt(i);
  if (diff !== 0) return null;
  const authDate = Number(params.get("auth_date") || 0);
  if (Date.now() / 1000 - authDate > 7 * 86400) return null;
  try { return JSON.parse(params.get("user")); } catch { return null; }
}

async function api(request, url, env) {
  const tgUser = await verifyInitData(request.headers.get("X-Init-Data"), env.BOT_TOKEN);
  if (!tgUser) return json({ error: "unauthorized" }, 401);
  const u = await getUser(env, tgUser.id);
  if (!u || !u.targets) return json({ error: "no_profile" }, 404);

  if (url.pathname === "/api/day" && request.method === "GET") {
    const date = isDate(url.searchParams.get("date")) ? url.searchParams.get("date") : today(u);
    // Неделя (Пн–Вс), в которую входит выбранный день
    const wd = (new Date(date + "T00:00:00Z").getUTCDay() + 6) % 7;
    const monday = shiftDate(date, -wd);
    const dates = [...Array(7)].map((_, i) => shiftDate(monday, i));
    const [days, weights] = await Promise.all([Promise.all(dates.map((d) => getDay(env, u.id, d))), getWeights(env, u.id)]);
    const idx = dates.indexOf(date);
    const day = days[idx];
    const meals = day.meals.map((m) => ({ ...m, totals: sumItems(m.items), items: m.items.map((it) => ({ ...it, totals: itemTotals(it) })) }));
    return json({
      date,
      today: today(u),
      targets: u.targets,
      totals: dayTotals(day),
      meals,
      week: dates.map((d, i) => ({ date: d, kcal: round(dayTotals(days[i]).kcal), meals: days[i].meals.length })),
      weights: weights.slice(-30),
      water: day.water || 0,
      waterGoal: waterGoal(u),
      name: u.name,
    });
  }

  if (request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    if (!isDate(body.date)) return json({ error: "bad date" }, 400);
    if (url.pathname === "/api/water") {
      const delta = Number(body.delta);
      if (![250, -250].includes(delta)) return json({ error: "bad delta" }, 400);
      const { day: d, reached } = await addWater(env, u, body.date, delta);
      return json({ ok: true, water: d.water, reached });
    }
    const day = await getDay(env, u.id, body.date);
    const meal = day.meals.find((m) => m.id === body.mealId);
    if (!meal) return json({ error: "not found" }, 404);

    if (url.pathname === "/api/meal/delete") {
      day.meals = day.meals.filter((m) => m !== meal);
      await saveDay(env, u.id, body.date, day);
      return json({ ok: true });
    }
    if (url.pathname === "/api/item/edit") {
      const it = meal.items[Number(body.idx)];
      const g = Number(body.grams);
      if (!it || !(g > 0 && g <= 3000)) return json({ error: "bad grams" }, 400);
      it.grams = round(g);
      await saveDay(env, u.id, body.date, day);
      return json({ ok: true });
    }
    if (url.pathname === "/api/item/rename") {
      const idx = Number(body.idx);
      const name = String(body.name || "").trim().slice(0, 60);
      if (!meal.items[idx] || !name) return json({ error: "bad name" }, 400);
      if (!checkAiLimit(env, u)) return json({ error: "limit" }, 429);
      await saveUser(env, u);
      try {
        await recalcItem(env, meal, idx, name, null);
      } catch (e) {
        console.error("rename error:", e && e.stack ? e.stack : e);
        return json({ error: "ai" }, 502);
      }
      await saveDay(env, u.id, body.date, day);
      return json({ ok: true });
    }
    if (url.pathname === "/api/item/delete") {
      meal.items.splice(Number(body.idx), 1);
      if (!meal.items.length) day.meals = day.meals.filter((m) => m !== meal);
      await saveDay(env, u.id, body.date, day);
      return json({ ok: true });
    }
  }
  return json({ error: "not found" }, 404);
}

// ───────────────────────────── Первичная настройка ─────────────────────────────

async function setup(url, env) {
  const page = (rows) =>
    new Response(
      `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
        `<title>FITTER — настройка</title><body style="font:16px/1.5 system-ui;max-width:640px;margin:32px auto;padding:0 16px">` +
        `<h2>FITTER — настройка</h2>${rows.map(([ok, t]) => `<p>${ok ? "✅" : "❌"} ${t}</p>`).join("")}</body>`,
      { headers: { "content-type": "text/html; charset=utf-8" } }
    );
  if (!env.WEBHOOK_SECRET) return page([[false, "Не задана переменная WEBHOOK_SECRET"]]);
  if (url.searchParams.get("secret") !== env.WEBHOOK_SECRET) {
    return page([[false, "Открой эту страницу так: <code>/setup?secret=ТВОЙ_WEBHOOK_SECRET</code>"]]);
  }
  const rows = [];
  rows.push([!!env.BOT_TOKEN, "BOT_TOKEN задан"]);
  rows.push([!!env.GEMINI_API_KEY, "GEMINI_API_KEY задан"]);
  rows.push([!!env.DB, "База данных KV подключена (имя DB)"]);
  rows.push([/^[A-Za-z0-9_-]{1,256}$/.test(env.WEBHOOK_SECRET), "WEBHOOK_SECRET состоит только из латинских букв, цифр, _ и -"]);
  if (!env.BOT_TOKEN) return page(rows);

  const me = await tg(env, "getMe", {});
  rows.push([me.ok, me.ok ? `Бот найден: @${me.result.username}` : "Токен бота неверный — проверь BOT_TOKEN"]);
  if (!me.ok) return page(rows);

  const wh = await tg(env, "setWebhook", {
    url: `${env.ORIGIN}/webhook`,
    secret_token: env.WEBHOOK_SECRET,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
  rows.push([wh.ok, wh.ok ? "Webhook подключён — бот получает сообщения" : `Webhook: ${esc(wh.description || "ошибка")}`]);

  const cmds = await tg(env, "setMyCommands", {
    commands: [
      { command: "today", description: "Итоги дня" },
      { command: "week", description: "Последние 7 дней" },
      { command: "water", description: "Вода за сегодня" },
      { command: "weight", description: "Записать вес" },
      { command: "profile", description: "Профиль и норма" },
      { command: "app", description: "Открыть дневник" },
      { command: "help", description: "Как пользоваться" },
      { command: "reset", description: "Пройти анкету заново" },
    ],
  });
  rows.push([cmds.ok, "Меню команд установлено"]);

  const menu = await tg(env, "setChatMenuButton", {
    menu_button: { type: "web_app", text: "Дневник", web_app: { url: `${env.ORIGIN}/app` } },
  });
  rows.push([menu.ok, "Кнопка «Дневник» (Mini App) добавлена"]);

  await tg(env, "setMyDescription", {
    description: "FITTER — одно фото, полный контроль 📸\nОтправь фото еды, и нейросеть посчитает калории, белки, жиры и углеводы и запишет всё в дневник питания.",
  });
  await tg(env, "setMyShortDescription", { short_description: "Считаю калории по фото еды 📸 Одно фото. Полный контроль." });

  if (env.GEMINI_API_KEY) {
    try {
      const r = await gemini(env, [{ text: "Ответь словом ok" }], { type: "OBJECT", properties: { ok: { type: "STRING" } }, required: ["ok"] });
      rows.push([true, `Нейросеть Gemini отвечает (модель ${esc(lastModelUsed)})`]);
    } catch (e) {
      rows.push([false, `Gemini не отвечает: ${esc(String(e.message || e).slice(0, 300))}`]);
    }
  }
  if (rows.every(([ok]) => ok)) rows.push([true, `<b>Всё готово!</b> Открой бота: <a href="https://t.me/${me.result.username}">@${me.result.username}</a> и нажми «Старт»`]);
  return page(rows);
}

// ───────────────────────────── Mini App (дневник по дням) ─────────────────────────────

const APP_HTML = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<title>FITTER — дневник</title>
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<style>
  :root{
    --bg:var(--tg-theme-secondary-bg-color,#f3f5f2);
    --card:var(--tg-theme-bg-color,#ffffff);
    --text:var(--tg-theme-text-color,#13201a);
    --hint:var(--tg-theme-hint-color,#8a948e);
    --danger:#ff5a4e;
    --line:rgba(127,127,127,.14);
    --g1:#2ee59d; --g2:#16b86a; --g3:#0e8f6e;
    --p:#ff7a2f; --p-bg:rgba(255,122,47,.13);
    --f:#f5a524; --f-bg:rgba(245,165,36,.15);
    --c:#22b36b; --c-bg:rgba(34,179,107,.13);
    --w1:#5ab8ff; --w2:#2a7bf0;
    --shadow:0 6px 24px rgba(16,40,28,.08);
  }
  *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  html,body{margin:0;background:var(--bg);color:var(--text);font:15px/1.4 -apple-system,BlinkMacSystemFont,"SF Pro Rounded","Segoe UI",Roboto,sans-serif}
  body{padding-bottom:28px;overflow-x:hidden}
  button{font:inherit;border:0;cursor:pointer;transition:transform .14s cubic-bezier(.3,1.6,.5,1),filter .14s;touch-action:manipulation}
  button:active{transform:scale(.9);filter:brightness(.94)}
  .ic{width:24px;height:24px;flex:none;display:block}

  /* ── Шапка ── */
  .hero{position:relative;color:#fff;padding:14px 14px 22px;border-radius:0 0 30px 30px;overflow:hidden;
    background:radial-gradient(120% 90% at 100% 0,#7cf3c1 0,rgba(124,243,193,0) 55%),linear-gradient(150deg,var(--g1),var(--g2) 55%,var(--g3));
    box-shadow:0 14px 34px rgba(22,184,106,.28)}
  .hero:before,.hero:after{content:"";position:absolute;border-radius:50%;background:rgba(255,255,255,.12);pointer-events:none}
  .hero:before{width:220px;height:220px;right:-70px;top:-90px}
  .hero:after{width:150px;height:150px;left:-60px;bottom:-70px;background:rgba(255,255,255,.08)}
  .top{position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between}
  .logo{display:flex;align-items:center;gap:8px;font-weight:800;font-size:19px;letter-spacing:.5px}
  .logo .mk{width:30px;height:30px;border-radius:9px;background:#0d1512;display:flex;align-items:center;justify-content:center}
  .logo small{display:block;font-weight:500;font-size:11px;opacity:.85;letter-spacing:0;white-space:nowrap}
  .nav{display:flex;align-items:center;gap:6px}
  .nav button{width:34px;height:34px;border-radius:11px;background:rgba(255,255,255,.2);color:#fff;font-size:20px;line-height:1;backdrop-filter:blur(6px)}
  .nav .d{min-width:78px;text-align:center;font-weight:700;font-size:15px}
  .week{position:relative;z-index:1;display:grid;grid-template-columns:repeat(7,1fr);gap:5px;margin:14px 0 8px}
  .wd{background:rgba(255,255,255,.14);color:#fff;border-radius:14px;padding:7px 0 6px;display:flex;flex-direction:column;align-items:center;gap:1px}
  .wd small{font-size:11px;opacity:.8}
  .wd b{font-size:16px}
  .wd i{width:5px;height:5px;border-radius:50%;background:transparent;margin-top:2px}
  .wd.sel{background:#fff;color:var(--g3);box-shadow:0 6px 16px rgba(0,0,0,.12)}
  .wd.sel small{opacity:.7}
  .wd.today:not(.sel) b{text-decoration:underline;text-underline-offset:3px}
  .main{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;margin-top:6px}
  .ring{position:relative;width:196px;height:196px}
  .ring svg{transform:rotate(-90deg);overflow:visible}
  .ring .arc{transition:stroke-dashoffset 1.2s cubic-bezier(.2,.8,.2,1)}
  .ring.ok .arc{filter:drop-shadow(0 0 8px rgba(255,255,255,.9))}
  .ring .in{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
  .ring .in .ic{width:30px;height:30px;margin-bottom:2px}
  .ring .in b{font-size:40px;font-weight:800;letter-spacing:-1px;line-height:1.05}
  .ring .in small{font-size:13px;opacity:.9}
  .chip{margin-top:10px;display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:99px;background:rgba(255,255,255,.22);font-weight:600;font-size:14px;backdrop-filter:blur(6px)}
  .chip.over{background:rgba(255,90,78,.9)}

  .wrap{padding:0 12px}
  /* ── БЖУ ── */
  .macros{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:-14px;position:relative;z-index:2}
  .mc{background:var(--card);border-radius:20px;padding:12px 10px 11px;box-shadow:var(--shadow);position:relative;overflow:hidden}
  .mc .ib{width:38px;height:38px;border-radius:13px;display:flex;align-items:center;justify-content:center;margin-bottom:8px}
  .mc .ib .ic{width:26px;height:26px}
  .mc .lb{font-size:12px;color:var(--hint);font-weight:600}
  .mc .vl{font-size:18px;font-weight:800;margin:1px 0 7px}
  .mc .vl small{font-size:12px;color:var(--hint);font-weight:600}
  .bar{height:7px;border-radius:9px;background:var(--line);overflow:hidden}
  .bar div{height:100%;width:0;border-radius:9px;transition:width 1s cubic-bezier(.2,.8,.2,1)}
  .mc.p .ib{background:var(--p-bg)} .mc.p .bar div{background:linear-gradient(90deg,#ffb36b,var(--p))}
  .mc.f .ib{background:var(--f-bg)} .mc.f .bar div{background:linear-gradient(90deg,#ffe07a,var(--f))}
  .mc.c .ib{background:var(--c-bg)} .mc.c .bar div{background:linear-gradient(90deg,#8fe6b2,var(--c))}

  /* ── Вода ── */
  .water{margin-top:12px;border-radius:24px;padding:14px;color:#fff;display:flex;align-items:center;gap:14px;position:relative;overflow:hidden;
    background:linear-gradient(135deg,var(--w1),var(--w2));box-shadow:0 10px 26px rgba(42,123,240,.28);transition:box-shadow .4s}
  .water:after{content:"";position:absolute;width:160px;height:160px;border-radius:50%;right:-50px;top:-70px;background:rgba(255,255,255,.12)}
  .water.done{box-shadow:0 0 0 3px rgba(255,255,255,.7) inset,0 10px 30px rgba(42,123,240,.45)}
  .glass{width:58px;height:78px;flex:none;position:relative}
  .glass svg{width:100%;height:100%;overflow:visible}
  .glass .lvl{transition:transform 1s cubic-bezier(.2,.8,.2,1)}
  .glass .wave{animation:wave 2.4s linear infinite}
  .glass .wave2{animation:wave 3.6s linear infinite reverse;opacity:.55}
  @keyframes wave{from{transform:translateX(0)}to{transform:translateX(-40px)}}
  .wt{flex:1;position:relative;z-index:1}
  .wt .lb{font-size:13px;opacity:.9;font-weight:600}
  .wt b{font-size:26px;font-weight:800;letter-spacing:-.5px}
  .wt small{font-size:13px;opacity:.9}
  .wbtn{display:flex;flex-direction:column;gap:6px;position:relative;z-index:1}
  .wbtn button{height:38px;border-radius:13px;padding:0 14px;font-weight:700;background:rgba(255,255,255,.22);color:#fff}
  .wbtn button.add{background:#fff;color:var(--w2);box-shadow:0 4px 12px rgba(0,0,0,.12)}

  /* ── Приёмы пищи ── */
  h3{margin:20px 4px 10px;font-size:17px;font-weight:800;display:flex;align-items:center;justify-content:space-between}
  h3 small{font-size:13px;color:var(--hint);font-weight:600}
  .meal{background:var(--card);border-radius:22px;padding:12px 14px 6px;margin-bottom:10px;box-shadow:var(--shadow)}
  .meal .hd{display:flex;align-items:center;gap:10px;margin-bottom:4px}
  .meal .ib{width:42px;height:42px;border-radius:14px;background:var(--c-bg);display:flex;align-items:center;justify-content:center;flex:none}
  .meal .ib .ic{width:30px;height:30px}
  .meal .t{flex:1;min-width:0;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .meal .t small{display:block;color:var(--hint);font-weight:500;font-size:12px}
  .meal .k{flex:none;padding:6px 10px;border-radius:99px;background:linear-gradient(135deg,#ffb36b,#ff6a3d);color:#fff;font-weight:800;font-size:13px}
  .it{display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid var(--line)}
  .it .dot{width:8px;height:8px;border-radius:50%;flex:none}
  .it .n{flex:1;min-width:0}
  .it .n div{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600}
  .it .n small{color:var(--hint);font-size:12px}
  .it .nm{cursor:pointer}
  .it .nm:after{content:" ✎";font-size:12px;color:var(--hint)}
  .it .gr{display:flex;align-items:center;background:var(--bg);border-radius:11px;padding:0 8px 0 2px}
  .it input{width:52px;padding:7px 2px;border:0;background:transparent;color:var(--text);font:inherit;font-weight:700;text-align:right;outline:none}
  .it .g{color:var(--hint);font-size:13px}
  .it .ren{width:100%;padding:5px 8px;border-radius:9px;border:2px solid var(--g2);background:var(--bg);color:var(--text);font:inherit;outline:none}
  .del{display:block;width:100%;background:transparent;color:var(--danger);font-size:13px;font-weight:600;padding:8px 0;border-top:1px solid var(--line)}
  .empty{background:var(--card);border-radius:22px;padding:26px 16px;text-align:center;color:var(--hint);box-shadow:var(--shadow)}
  .empty .ib{width:64px;height:64px;border-radius:20px;margin:0 auto 10px;background:var(--c-bg);display:flex;align-items:center;justify-content:center}
  .empty .ib .ic{width:42px;height:42px}
  .empty b{display:block;color:var(--text);font-size:16px;margin-bottom:4px}

  /* ── Вес ── */
  .wcard{background:var(--card);border-radius:22px;padding:14px;box-shadow:var(--shadow);display:flex;align-items:center;gap:12px}
  .wcard .ib{width:42px;height:42px;border-radius:14px;background:rgba(127,140,155,.14);display:flex;align-items:center;justify-content:center;flex:none;color:#8e9aa6}
  .wcard .v{flex:1}
  .wcard .v b{font-size:22px;font-weight:800}
  .wcard .v small{display:block;color:var(--hint);font-size:12px}
  .err{color:var(--danger);text-align:center;padding:40px 24px}
  .load{padding:60px 0;text-align:center;opacity:.8}

  /* ── Анимации ── */
  .rise{animation:rise .45s cubic-bezier(.2,.8,.2,1) both}
  @keyframes rise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
  .pop{animation:pop .5s cubic-bezier(.3,1.6,.5,1)}
  @keyframes pop{0%{transform:scale(1)}35%{transform:scale(1.05)}100%{transform:scale(1)}}
  .fl{position:fixed;z-index:30;pointer-events:none;font-weight:800;font-size:15px;color:#fff;text-shadow:0 1px 4px rgba(0,0,0,.25);animation:fup .9s ease-out forwards}
  @keyframes fup{to{transform:translateY(-46px);opacity:0}}
  .fx{position:fixed;z-index:40;pointer-events:none;font-size:20px;line-height:1;will-change:transform,opacity}
  @media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style>
</head>
<body>
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><symbol id="i-plate" viewBox="0 0 24 24"><defs><linearGradient id="pl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#DCE3EA"/></linearGradient></defs> <ellipse cx="12" cy="13" rx="10" ry="9" fill="#AFBBC7"/> <ellipse cx="12" cy="12.4" rx="10" ry="9" fill="url(#pl)"/> <ellipse cx="12" cy="12.4" rx="6.6" ry="5.9" fill="#EEF2F6" stroke="#C9D3DD" stroke-width=".6"/> <path d="M8.2 13.6c-.6-2.6 1.2-4.6 3.4-4.4-1 1.4-1.6 2.9-1.5 4.6z" fill="#4CC38A"/> <path d="M10.1 13.8c0-2.6 2.2-4.2 4.3-3.4-1.4 1-2.4 2.2-2.6 3.6z" fill="#2FA36B"/> <circle cx="14.6" cy="13.4" r="1.9" fill="#FF6B4A"/> <circle cx="14.2" cy="12.8" r=".5" fill="#FFB4A3"/> <ellipse cx="11.6" cy="15.2" rx="2.4" ry="1.3" fill="#FFB547"/></symbol><symbol id="i-protein" viewBox="0 0 24 24"><defs><linearGradient id="pr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFB15C"/><stop offset="1" stop-color="#D9662B"/></linearGradient></defs> <path d="M15.2 2.8c3.5 0 6 2.7 6 6 0 4.2-3.9 7.3-8 6.6L10 18.6l-3.2-3.2 3.2-3.2c-.6-4.6 1.6-9.4 5.2-9.4z" fill="url(#pr)"/> <path d="M17.6 5.6c1.2.6 1.9 1.8 1.9 3.1" stroke="#FFD9AE" stroke-width="1.2" stroke-linecap="round" fill="none"/> <path d="M10.6 15.5 7.3 18.8" stroke="#F3E9DA" stroke-width="2.6" stroke-linecap="round"/> <circle cx="5.6" cy="18.4" r="1.9" fill="#F3E9DA" stroke="#C9BBA6" stroke-width=".5"/> <circle cx="7.6" cy="20.4" r="1.9" fill="#F3E9DA" stroke="#C9BBA6" stroke-width=".5"/></symbol><symbol id="i-fat" viewBox="0 0 24 24"><defs><linearGradient id="ft" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE27A"/><stop offset="1" stop-color="#F5A524"/></linearGradient></defs> <path d="M12 2.2c-1 1.8-7.2 8.7-7.2 13.1a7.2 7.2 0 0 0 14.4 0C19.2 10.9 13 4 12 2.2z" fill="url(#ft)"/> <path d="M12 2.2c-1 1.8-7.2 8.7-7.2 13.1a7.2 7.2 0 0 0 14.4 0C19.2 10.9 13 4 12 2.2z" fill="none" stroke="#D98A12" stroke-width=".6"/> <path d="M8.6 15.6a3.4 3.4 0 0 0 3 3.2" stroke="#FFF6CF" stroke-width="1.5" stroke-linecap="round" fill="none"/></symbol><symbol id="i-carbs" viewBox="0 0 24 24"><path d="M12 22.2V8.6" stroke="#C98A1F" stroke-width="2" stroke-linecap="round"/> <g fill="#F7C04A" stroke="#C98A1F" stroke-width=".6"> <path d="M11.6 12.6c-3.4.3-5.8-1.8-6-5 3.3-.2 5.7 1.8 6 5z"/> <path d="M12.4 12.6c3.4.3 5.8-1.8 6-5-3.3-.2-5.7 1.8-6 5z"/> <path d="M11.6 18c-3.4.3-5.8-1.8-6-5 3.3-.2 5.7 1.8 6 5z"/> <path d="M12.4 18c3.4.3 5.8-1.8 6-5-3.3-.2-5.7 1.8-6 5z"/> <path d="M12 9c-2-1.1-2-4.3 0-6.3 2 2 2 5.2 0 6.3z"/> </g> <g fill="#FFE6A3"><ellipse cx="8.4" cy="9.4" rx="1.2" ry=".6" transform="rotate(35 8.4 9.4)"/><ellipse cx="8.4" cy="14.8" rx="1.2" ry=".6" transform="rotate(35 8.4 14.8)"/></g></symbol><symbol id="i-kcal" viewBox="0 0 24 24"><defs><linearGradient id="fl" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#FF3D2E"/><stop offset=".6" stop-color="#FF8A1F"/><stop offset="1" stop-color="#FFC23D"/></linearGradient> <linearGradient id="fi" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#FFB02E"/><stop offset="1" stop-color="#FFF1A8"/></linearGradient></defs> <path d="M12.6 2c.6 3.4-1.3 5-3 6.8C7.8 10.7 6 12.6 6 15.6A6.2 6.2 0 0 0 12 22a6.4 6.4 0 0 0 6-6.6c0-2.6-1.2-4.3-2.3-5.6-.2 1.4-.9 2.4-1.9 2.8.6-4.6-.7-8.3-1.2-10.6z" fill="url(#fl)"/> <path d="M12.2 12.2c.2 1.9-1.3 2.6-2 3.7-.4.6-.6 1.2-.6 1.9A2.6 2.6 0 0 0 12.2 20.6a2.7 2.7 0 0 0 2.6-2.8c0-1.6-1.2-2.5-1.6-3.2-.5.5-.9.6-1.2.5.3-1 .3-2 .2-2.9z" fill="url(#fi)"/></symbol><symbol id="i-scales" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/> <path d="M8 9.2a5.6 5.6 0 0 1 8 0"/> <path d="M12 10.6l1.4-2"/> <circle cx="12" cy="10.8" r="0.4" fill="currentColor"/></g></symbol><symbol id="i-apple" viewBox="0 0 24 24"><g fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8V6.5a3 3 0 0 1 3-3H8"/> <path d="M16 3.5h1.5a3 3 0 0 1 3 3V8"/> <path d="M20.5 16v1.5a3 3 0 0 1-3 3H16"/> <path d="M8 20.5H6.5a3 3 0 0 1-3-3V16"/> <path d="M12 9.3c-1.2-.9-3.9-1.1-4.4 1.9-.4 2.4 1.2 5.4 2.9 5.4.6 0 1-.3 1.5-.3s.9.3 1.5.3c1.7 0 3.3-3 2.9-5.4-.5-3-3.2-2.8-4.4-1.9z"/> <path d="M12 9.3c0-1.3.6-2.2 1.7-2.6"/></g></symbol></defs></svg>
<div class="hero">
  <div class="top">
    <div class="logo"><span class="mk"><svg class="ic" style="width:22px;height:22px"><use href="#i-apple"/></svg></span><div>FITTER</div></div>
    <div class="nav"><button id="prev">‹</button><span class="d" id="dl">…</span><button id="next">›</button></div>
  </div>
  <div id="hero"><div class="load">Загрузка…</div></div>
</div>
<div class="wrap" id="root"></div>
<script>
(function(){
  var tg = window.Telegram && window.Telegram.WebApp;
  if (tg) { tg.ready(); tg.expand(); try { tg.setHeaderColor("#2ee59d"); } catch(e){} }
  var initData = tg ? tg.initData : "";
  var MONTHS = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
  var WD = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];
  var state = { date: null, data: null };
  var root = document.getElementById("root"), hero = document.getElementById("hero");

  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]; }); }
  function r(x){ return Math.round(x); }
  function shift(date, n){ var d = new Date(date + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0,10); }
  function human(date){ var d = new Date(date + "T00:00:00Z"); return d.getUTCDate() + " " + MONTHS[d.getUTCMonth()]; }
  function L(ml){ return String(Math.round(ml / 10) / 100).replace(".", ",") + " л"; }
  function icon(name, style){ return '<svg class="ic"' + (style ? ' style="' + style + '"' : '') + '><use href="#i-' + name + '"/></svg>'; }

  function haptic(style){ try { tg.HapticFeedback.impactOccurred(style || "light"); } catch(e){} }
  function notify(type){ try { tg.HapticFeedback.notificationOccurred(type); } catch(e){} }
  function tick(){ try { tg.HapticFeedback.selectionChanged(); } catch(e){} }
  var calm = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  function celebrate(el, chars){
    if (calm || !el || !el.animate) return;
    var rc = el.getBoundingClientRect(), cx = rc.left + rc.width / 2, cy = rc.top + rc.height / 2;
    for (var i = 0; i < 32; i++) {
      var s = document.createElement("span");
      s.className = "fx"; s.textContent = chars[i % chars.length];
      s.style.left = cx + "px"; s.style.top = cy + "px";
      document.body.appendChild(s);
      var a = Math.random() * Math.PI * 2, v = 80 + Math.random() * 120;
      var dx = Math.cos(a) * v, dy = Math.sin(a) * v - 60, rot = (Math.random() - .5) * 360;
      s.animate([
        { transform: "translate(-50%,-50%) scale(.4)", opacity: 1 },
        { transform: "translate(calc(-50% + " + dx + "px),calc(-50% + " + dy + "px)) rotate(" + rot / 2 + "deg) scale(1)", opacity: 1, offset: .55 },
        { transform: "translate(calc(-50% + " + dx * 1.2 + "px),calc(-50% + " + (dy + 140) + "px)) rotate(" + rot + "deg) scale(.8)", opacity: 0 }
      ], { duration: 1100 + Math.random() * 500, easing: "cubic-bezier(.2,.7,.4,1)" }).onfinish = (function(n){ return function(){ n.remove(); }; })(s);
    }
    el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop");
  }
  function floatText(btn, text){
    if (calm) return;
    var rc = btn.getBoundingClientRect(), f = document.createElement("span");
    f.className = "fl"; f.textContent = text;
    f.style.left = (rc.left + rc.width / 2 - 20) + "px"; f.style.top = (rc.top - 8) + "px";
    document.body.appendChild(f); setTimeout(function(){ f.remove(); }, 950);
  }
  function countUp(el, to){
    if (calm) { el.textContent = to; return; }
    var t0 = performance.now(), dur = 1000;
    (function step(now){
      var k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(to * e);
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  }
  function once(key){ try { if (localStorage.getItem(key)) return false; localStorage.setItem(key, "1"); } catch(e){} return true; }

  function call(method, path, body){
    return fetch(path, { method: method, headers: { "X-Init-Data": initData, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined })
      .then(function(res){ return res.json().then(function(j){ if (!res.ok) throw j; return j; }); });
  }

  function load(date){
    call("GET", "/api/day" + (date ? "?date=" + date : "")).then(function(d){
      state.date = d.date; state.data = d; render();
    }).catch(function(e){
      var msg = e && e.error === "no_profile" ? "Сначала пройди анкету в боте: нажми /start" :
                e && e.error === "unauthorized" ? "Открой дневник через кнопку в боте FITTER" : "Не получилось загрузить дневник. Попробуй ещё раз.";
      hero.innerHTML = ""; root.innerHTML = '<div class="err">' + msg + '</div>';
    });
  }

  // Большое кольцо калорий в шапке
  function ring(val, max){
    var R = 84, C = 2 * Math.PI * R, pct = max ? Math.min(1, val / max) : 0;
    var ok = val >= max * 0.9 && val <= max * 1.1, over = val > max * 1.1;
    return '<div class="ring' + (ok ? ' ok' : '') + '"><svg width="196" height="196" viewBox="0 0 196 196">' +
      '<circle cx="98" cy="98" r="' + R + '" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="16"/>' +
      '<circle class="arc" cx="98" cy="98" r="' + R + '" fill="none" stroke="' + (over ? '#ffd2cc' : '#fff') + '" stroke-width="16" stroke-linecap="round" stroke-dasharray="' + C + '" stroke-dashoffset="' + C + '" data-off="' + (C * (1 - pct)) + '"/></svg>' +
      '<div class="in"><b data-to="' + r(val) + '">0</b><small>из ' + max + ' ккал</small></div></div>';
  }

  function macro(cls, ic, label, val, max){
    var pct = max ? Math.min(100, val / max * 100) : 0;
    return '<div class="mc ' + cls + ' rise"><div class="ib">' + icon(ic) + '</div><div class="lb">' + label + '</div>' +
      '<div class="vl">' + r(val) + '<small> / ' + max + ' г</small></div><div class="bar"><div data-pct="' + pct + '"></div></div></div>';
  }

  // Стакан с волной: уровень воды поднимается
  function glass(pct){
    var y = 74 - 66 * Math.min(1, pct);
    return '<div class="glass"><svg viewBox="0 0 58 78"><defs><clipPath id="gc"><path d="M5 4h48l-5 66a6 6 0 0 1-6 5H16a6 6 0 0 1-6-5z"/></clipPath></defs>' +
      '<path d="M5 4h48l-5 66a6 6 0 0 1-6 5H16a6 6 0 0 1-6-5z" fill="rgba(255,255,255,.18)" stroke="rgba(255,255,255,.75)" stroke-width="2.4" stroke-linejoin="round"/>' +
      '<g clip-path="url(#gc)"><g class="lvl" style="transform:translateY(' + y + 'px)">' +
      '<path class="wave2" d="M0 4 Q10 -2 20 4 T40 4 T60 4 T80 4 T100 4 V90 H0z" fill="#d6f0ff"/>' +
      '<path class="wave" d="M0 6 Q10 0 20 6 T40 6 T60 6 T80 6 T100 6 V90 H0z" fill="#fff"/></g></g>' +
      '<path d="M14 14l3 44" stroke="rgba(255,255,255,.55)" stroke-width="3" stroke-linecap="round"/></svg></div>';
  }

  function weightBlock(ws){
    if (!ws || !ws.length) return "";
    var last = ws[ws.length - 1], first = ws[0], diff = Math.round((last.kg - first.kg) * 10) / 10;
    var spark = "";
    if (ws.length > 1) {
      var min = Infinity, max = -Infinity;
      ws.forEach(function(w){ min = Math.min(min, w.kg); max = Math.max(max, w.kg); });
      var span = max - min || 1, W = 120, H = 44;
      var pts = ws.map(function(w, i){ return (i / (ws.length - 1) * W).toFixed(1) + "," + (H - 6 - (w.kg - min) / span * (H - 12)).toFixed(1); });
      spark = '<svg width="' + W + '" height="' + H + '"><defs><linearGradient id="wg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#16b86a" stop-opacity=".35"/><stop offset="1" stop-color="#16b86a" stop-opacity="0"/></linearGradient></defs>' +
        '<polygon points="0,' + H + ' ' + pts.join(" ") + ' ' + W + ',' + H + '" fill="url(#wg)"/>' +
        '<polyline points="' + pts.join(" ") + '" fill="none" stroke="#16b86a" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/></svg>';
    }
    return '<h3>Вес</h3><div class="wcard rise"><div class="ib">' + icon("scales") + '</div><div class="v"><b>' + last.kg + ' кг</b><small>' +
      (ws.length > 1 ? (diff > 0 ? "+" : "") + diff + " кг с " + human(first.date) : "записан " + human(last.date)) +
      '</small></div>' + spark + '</div>';
  }

  var DOTS = ["#ff7a2f", "#22b36b", "#f5a524", "#2a7bf0", "#c86bff", "#ff5a8a"];

  function render(){
    var d = state.data, t = d.totals, g = d.targets;
    document.getElementById("dl").textContent = d.date === d.today ? "Сегодня" : human(d.date);
    document.getElementById("next").style.visibility = d.date >= d.today ? "hidden" : "visible";

    var week = '<div class="week">' + d.week.map(function(w, i){
      var dot = !w.meals ? "transparent" : w.kcal > g.kcal * 1.1 ? "#ffd2cc" : w.kcal >= g.kcal * 0.8 ? "#fff" : "rgba(255,255,255,.55)";
      if (w.date === d.date && w.meals) dot = w.kcal > g.kcal * 1.1 ? "var(--danger)" : "var(--g2)";
      var cls = "wd" + (w.date === d.date ? " sel" : "") + (w.date === d.today ? " today" : "");
      var dis = w.date > d.today ? ' disabled style="opacity:.4"' : "";
      return '<button class="' + cls + '" data-date="' + w.date + '"' + dis + '><small>' + WD[i] + '</small><b>' + Number(w.date.slice(8)) + '</b><i style="background:' + dot + '"></i></button>';
    }).join("") + '</div>';

    var left = g.kcal - t.kcal;
    hero.innerHTML = week + '<div class="main">' + ring(t.kcal, g.kcal) +
      '<div class="chip' + (left < 0 ? ' over' : '') + '">' + (left >= 0 ? 'Осталось ' + r(left) + ' ккал' : 'Больше нормы на ' + r(-left) + ' ккал') + '</div></div>';

    var macros = '<div class="macros">' + macro("p", "protein", "Белки", t.p, g.p) + macro("f", "fat", "Жиры", t.f, g.f) + macro("c", "carbs", "Углеводы", t.c, g.c) + '</div>';

    var wg = d.waterGoal || 2000, wv = d.water || 0;
    var water = '<div class="water rise' + (wv >= wg ? ' done' : '') + '">' + glass(wv / wg) +
      '<div class="wt"><div class="lb">Вода</div><b class="wv">' + L(wv) + '</b><br><small>из ' + L(wg) + '<span class="wn">' + (wv >= wg ? ' · норма ✓' : '') + '</span></small></div>' +
      '<div class="wbtn"><button class="add" data-w="250">+250 мл</button><button data-w="-250">− 250</button></div></div>';

    var total = d.meals.reduce(function(a, m){ return a + m.totals.kcal; }, 0);
    var meals = d.meals.length ? '<h3>Приёмы пищи <small>' + d.meals.length + ' · ' + r(total) + ' ккал</small></h3>' + d.meals.map(function(m, mi){
      return '<div class="meal rise" style="animation-delay:' + (0.05 * mi + 0.1) + 's"><div class="hd"><div class="ib">' + icon("plate") + '</div><div class="t">' + esc(m.title) + '<small>' + esc(m.time) + ' · ' + m.items.length + ' ' + (m.items.length === 1 ? 'продукт' : m.items.length < 5 ? 'продукта' : 'продуктов') + '</small></div><div class="k">' + r(m.totals.kcal) + ' ккал</div></div>' +
        m.items.map(function(it, i){
          return '<div class="it"><i class="dot" style="background:' + DOTS[i % DOTS.length] + '"></i><div class="n"><div class="nm" data-meal="' + m.id + '" data-idx="' + i + '">' + esc(it.name) + '</div><small>' + r(it.totals.kcal) + ' ккал · Б ' + r(it.totals.p) + ' · Ж ' + r(it.totals.f) + ' · У ' + r(it.totals.c) + '</small></div>' +
            '<div class="gr"><input type="number" inputmode="numeric" min="1" max="3000" value="' + it.grams + '" data-meal="' + m.id + '" data-idx="' + i + '"><span class="g">г</span></div></div>';
        }).join("") +
        '<button class="del" data-del="' + m.id + '">Удалить приём пищи</button></div>';
    }).join("") : '<h3>Приёмы пищи</h3><div class="empty rise"><div class="ib">' + icon("plate") + '</div><b>Здесь пока пусто</b>Отправь боту фото еды, и оно появится в дневнике 📸</div>';

    root.innerHTML = macros + water + meals + weightBlock(d.weights);
    animateIn();
  }

  function animateIn(){
    var d = state.data, t = d.totals, g = d.targets;
    requestAnimationFrame(function(){ requestAnimationFrame(function(){
      document.querySelectorAll("[data-pct]").forEach(function(el){ el.style.width = el.dataset.pct + "%"; });
      document.querySelectorAll("[data-off]").forEach(function(el){ el.setAttribute("stroke-dashoffset", el.dataset.off); });
      document.querySelectorAll("[data-to]").forEach(function(el){ countUp(el, Number(el.dataset.to)); });
    }); });
    if (d.date === d.today && d.meals.length && t.kcal >= g.kcal * 0.9 && t.kcal <= g.kcal * 1.1 && once("fx-kcal-" + d.date)) {
      setTimeout(function(){ celebrate(hero.querySelector(".ring"), ["✨", "🥦", "🍏"]); notify("success"); }, 1100);
    }
  }

  function waterUI(){
    var d = state.data, wg = d.waterGoal || 2000, wv = d.water || 0, card = root.querySelector(".water");
    if (!card) return;
    card.querySelector(".wv").textContent = L(wv);
    card.querySelector(".wn").textContent = wv >= wg ? " · норма ✓" : "";
    card.querySelector(".lvl").style.transform = "translateY(" + (74 - 66 * Math.min(1, wv / wg)) + "px)";
    card.classList.toggle("done", wv >= wg);
  }

  function addWater(btn){
    var d = state.data, delta = Number(btn.dataset.w), wg = d.waterGoal || 2000;
    var before = d.water || 0, after = Math.max(0, before + delta);
    if (after === before) { haptic("rigid"); return; }
    d.water = after; waterUI();
    floatText(btn, (delta > 0 ? "+" : "−") + Math.abs(delta));
    if (before < wg && after >= wg) { notify("success"); celebrate(root.querySelector(".water"), ["💧", "💦", "✨"]); }
    else haptic(delta > 0 ? "medium" : "light");
    call("POST", "/api/water", { date: state.date, delta: delta })
      .then(function(j){ if (typeof j.water === "number") { d.water += j.water - after; waterUI(); } },
            function(){ d.water -= delta; waterUI(); notify("error"); });
  }

  function rename(el){
    var old = el.textContent, mealId = el.dataset.meal, idx = Number(el.dataset.idx);
    var inp = document.createElement("input");
    inp.className = "ren"; inp.value = old; inp.placeholder = "Например: форель";
    el.replaceWith(inp); inp.focus(); inp.select();
    var done = false;
    function finish(save){
      if (done) return; done = true;
      var v = inp.value.trim();
      if (!save || !v || v === old) { load(state.date); return; }
      inp.disabled = true; inp.value = "Пересчитываю…";
      call("POST", "/api/item/rename", { date: state.date, mealId: mealId, idx: idx, name: v })
        .then(function(){ notify("success"); load(state.date); })
        .catch(function(err){
          var msg = err && err.error === "limit" ? "На сегодня лимит запросов к нейросети закончился" : "Не получилось пересчитать, попробуй ещё раз";
          if (tg && tg.showAlert) tg.showAlert(msg); else alert(msg);
          load(state.date);
        });
    }
    inp.addEventListener("keydown", function(e){ if (e.key === "Enter") finish(true); if (e.key === "Escape") finish(false); });
    inp.addEventListener("blur", function(){ finish(true); });
  }

  function onClick(e){
    var nm = e.target.closest(".nm");
    if (nm) { rename(nm); return; }
    var b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.date) { tick(); load(b.dataset.date); }
    if (b.dataset.w) addWater(b);
    if (b.dataset.del) {
      var id = b.dataset.del;
      haptic("rigid");
      var go = function(){ call("POST", "/api/meal/delete", { date: state.date, mealId: id }).then(function(){ notify("warning"); load(state.date); }); };
      if (tg && tg.showConfirm) tg.showConfirm("Удалить этот приём пищи?", function(ok){ if (ok) go(); }); else if (confirm("Удалить?")) go();
    }
  }
  root.addEventListener("click", onClick);
  hero.addEventListener("click", onClick);
  root.addEventListener("change", function(e){
    var inp = e.target;
    if (!inp.dataset.meal) return;
    var g = Number(inp.value);
    if (!(g > 0 && g <= 3000)) { load(state.date); return; }
    call("POST", "/api/item/edit", { date: state.date, mealId: inp.dataset.meal, idx: Number(inp.dataset.idx), grams: g })
      .then(function(){ notify("success"); load(state.date); });
  });
  document.getElementById("prev").onclick = function(){ if (state.date) { tick(); load(shift(state.date, -1)); } };
  document.getElementById("next").onclick = function(){ if (state.date) { tick(); load(shift(state.date, 1)); } };

  load(null);
})();
</script>
</body>
</html>`;

// Для тестов
export const _test = { baseEmoji, calcTargets, verifyInitData, cleanItems, sumItems, parseFix, parseWater, cleanBarcode, waterGoal, APP_HTML };
