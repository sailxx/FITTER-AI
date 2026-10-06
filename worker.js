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
        if (!env.WEBHOOK_SECRET || !safeEqual(request.headers.get("X-Telegram-Bot-Api-Secret-Token"), env.WEBHOOK_SECRET)) {
          return new Response("forbidden", { status: 403 });
        }
        const update = await request.json();
        // Отвечаем Telegram сразу, а саму работу делаем в фоне
        ctx.waitUntil(handleUpdate(update, E).catch((e) => console.error("update error:", e && e.stack ? e.stack : e)));
        return new Response("ok");
      }
      if (url.pathname === "/setup") return await setup(request, E);
      if (url.pathname === "/app") {
        return new Response(APP_HTML, { headers: { "content-type": "text/html; charset=utf-8", ...(await appHeaders()) } });
      }
      if (url.pathname.startsWith("/api/")) return await api(request, url, E);
      if (url.pathname === "/") return new Response("FITTER работает ✅", { headers: { "content-type": "text/plain; charset=utf-8" } });
      return new Response("not found", { status: 404 });
    } catch (e) {
      console.error(e && e.stack ? e.stack : e);
      return new Response("error", { status: 500 });
    }
  },
  // Расписание (wrangler.toml → [triggers]): по воскресеньям вечером — разбор недели
  // «*/30 * * * *» — напоминания о воде, «0 17 * * SUN» — разбор недели по воскресеньям
  async scheduled(event, env, ctx) {
    const job = /^0 17 /.test(event.cron || "") ? weeklyRun(env) : Promise.all([waterTick(env), pillTick(env)]);
    ctx.waitUntil(job.catch((e) => console.error("cron error:", event.cron, e && e.stack ? e.stack : e)));
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
let emojiNorm = {};
function buildEmojiRe() {
  emojiNorm = {};
  for (const [k, v] of Object.entries(emojiMap)) emojiNorm[stripVS(k)] = v;
  const keys = Object.keys(emojiNorm).sort((a, b) => b.length - a.length);
  // FE0F может стоять после любого символа: 1️⃣ = «1» + FE0F + «⃣»
  emojiRe = keys.length
    ? new RegExp(keys.map((k) => [...k].map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\uFE0F?").join("")).join("|"), "gu")
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
const emojiId = (e) => emojiNorm[stripVS(e)];

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
    const failed = (r) => !r.ok && !(r.description || "").includes("message is not modified");
    if (failed(j)) {
      // Запоминаем причину, её можно посмотреть командой /emojierr
      console.error("custom emoji rejected:", j.description);
      if (env.DB) await env.DB.put("cfg:emojierr", JSON.stringify({ at: new Date().toISOString(), method, error: j.description || "" })).catch(() => {});
      // Вторая попытка: иконки оставляем, а цитаты-блоки превращаем в обычный текст
      if (p.text && p.text.includes("<blockquote>")) {
        j = await tgRaw(env, method, { ...p, text: p.text.replace(/<\/?blockquote>/g, "") });
      }
      // Последняя попытка: обычные эмодзи (например, если закончился Premium)
      if (failed(j)) j = await tgRaw(env, method, payload);
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
// Еда, весы, таблетки и квадратики шкал — цветные, дневник — серый, логотип — чёрно-белая плашка
// Картинки 100×100 лежат в репозитории в папке icons/pack/
const ICON_BASE = "https://raw.githubusercontent.com/sailxx/fitter-ai/main/icons/";
const ICON_SETS = [
  {
    suffix: "", title: "FITTER ICONS", repaint: false, folder: "pack/",
    // файл, эмодзи для набора, какой эмодзи в боте заменить, версия картинки (если её перерисовали)
    icons: [
      ["plate", "🍽", "🍽"], ["protein", "🍗", "🥩"], ["fat", "💧", "🧈"], ["carbs", "🌾", "🍞"], ["kcal", "🔥", "🔥"],
      ["scales", "⚖️", "⚖", 2], ["diary", "📔", "📱"], ["fitter", "🍏", "🍏"],
      ["sofa", "🛋", "🛋"], ["walk", "🚶", "🚶"], ["run", "🏃", "🏃"], ["muscle", "💪", "💪"], ["lose", "📉", "📉"],
      ["water", "🥤", "💧"], ["barcode", "📦", "📦"],
      ["ruler", "📏", "📏"], ["cake", "🎂", "🎂"], ["trophy", "🏆", "🏆"],
      ["num1", "1️⃣", "1️⃣"], ["num2", "2️⃣", "2️⃣"], ["num3", "3️⃣", "3️⃣"], ["num4", "4️⃣", "4️⃣"],
      ["pill", "💊", "💊"], ["alarm", "⏰", "⏰"], ["brain", "🧠", "🧠"], ["goal", "🎯", "🎯"], ["note", "📝", "📝"], ["ask", "💬", "💬"],
      ["sq_green", "🟩", "🟩"], ["sq_blue", "🟦", "🟦"], ["sq_red", "🟥", "🟥"], ["sq_empty", "⬜", "⬜"],
      ["calendar", "📅", "📅"], ["lock", "🔒", "🔒"], ["photo", "📷", "📷"], ["book", "📓", "📓"], ["hundred", "💯", "💯"], ["chart", "📊", "📊"],
    ],
  },
  {
    // Монохромные иконки интерфейса: Telegram перекрашивает их под цвет текста (белые в тёмной теме, чёрные в светлой)
    suffix: "ui", title: "FITTER UI", repaint: true, folder: "ui/",
    icons: [["profile", "👤", "👤"], ["help", "❓", "❓"], ["edit", "✏️", "✏"], ["trash", "🗑", "🗑"], ["tip", "💡", "💡"], ["check", "✅", "✅"], ["camera", "📸", "📸"], ["search", "🔍", "🔍"], ["write", "✍️", "✍"], ["hello", "👋", "👋"], ["think", "🤔", "🤔"], ["sad", "😔", "😔"], ["refresh", "🔄", "🔄"], ["party", "🎉", "🎉"], ["diary", "📱", "📱"], ["undo", "↩️", "↩"], ["sparkles", "✨", "✨"], ["keyboard", "⌨️", "⌨"]],
  },
];
// Старые наборы из прошлых версий — удаляются, чтобы остался один
const OLD_SETS = ["icons", "food"];

async function ensureEmojiSet(env, from, botName, cfg) {
  const name = `fitter${cfg.suffix ? "_" + cfg.suffix : ""}_by_${botName}`;
  // ?v= — чтобы Telegram скачал перерисованную картинку, а не взял старую из кэша
  const sticker = ([file, emoji, , ver]) => ({ sticker: ICON_BASE + cfg.folder + file + ".png" + (ver ? "?v=" + ver : ""), format: "static", emoji_list: [emoji] });
  const vers = (await env.DB.get("cfg:emojiver", "json").catch(() => null)) || {};
  let set = await tgRaw(env, "getStickerSet", { name });
  const fresh = !set.ok;
  if (fresh) {
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
  // Перерисованные иконки заменяем на месте: номер иконки меняется, поэтому набор читаем заново
  let replaced = false;
  for (const ic of cfg.icons) {
    const key = name + "/" + ic[0];
    if (!ic[3] || (vers[key] || 1) >= ic[3]) continue;
    const old = set.result.stickers.find((s) => baseEmoji(s.emoji) === baseEmoji(ic[1]));
    if (!fresh && old?.file_id) {
      const r = await tgRaw(env, "replaceStickerInSet", { user_id: from.id, name, old_sticker: old.file_id, sticker: sticker(ic) });
      if (!r.ok) throw new Error(`${cfg.title}: ${r.description || "не получилось заменить " + ic[0]}`);
      replaced = true;
    }
    vers[key] = ic[3];
  }
  await env.DB.put("cfg:emojiver", JSON.stringify(vers));
  if (replaced) set = await tgRaw(env, "getStickerSet", { name });
  const stickers = set.result.stickers;
  // Иконки добавлялись строго по порядку списка, поэтому сначала сопоставляем по позиции
  if (stickers.length === cfg.icons.length) {
    cfg.icons.forEach((ic, i) => { if (stickers[i].custom_emoji_id) map[ic[2]] = stickers[i].custom_emoji_id; });
  }
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
  if (!isAdmin(env, from)) return send(env, chatId, "Эта команда только для владельца бота");
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

// Владелец бота: ADMIN_ID обязателен, без него служебные команды закрыты для всех
function isAdmin(env, from) {
  return !!env.ADMIN_ID && !!from && String(from.id) === String(env.ADMIN_ID);
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
  if (!day.meals.length && !day.water && !Object.keys(day.pills || {}).length) return env.DB.delete(`d:${id}:${date}`);
  await env.DB.put(`d:${id}:${date}`, JSON.stringify(day));
}
async function getWeights(env, id) {
  return (await env.DB.get(`w:${id}`, "json")) || [];
}

// Полное удаление данных пользователя по команде /delete
async function deleteUserData(env, id) {
  const keys = [
    `u:${id}`, `w:${id}`, `adv:${id}`,
    ...(await listAll(env, `d:${id}:`)),
    ...(await listAll(env, `an:${id}:`)),
  ];
  await Promise.all(keys.map((k) => env.DB.delete(k)));
  await wrIndex(env, id, false);
  await plIndex(env, id, false);
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

// Счётчик запросов в памяти воркера: если человек шлёт много фото разом, параллельные запросы
// читают из базы старый счётчик. Здесь они видят свежий и не обходят дневной лимит
const aiSeen = new Map(); // "id:дата" → сколько запросов уже было

function checkAiLimit(env, u) {
  const limit = Number(env.DAILY_AI_LIMIT || 40);
  const d = today(u);
  if (!u.ai || u.ai.date !== d) u.ai = { date: d, n: 0 };
  const key = u.id + ":" + d;
  const n = Math.max(u.ai.n, aiSeen.get(key) || 0);
  if (n >= limit) return false;
  u.ai.n = n + 1;
  if (aiSeen.size > 10000) aiSeen.clear();
  aiSeen.set(key, n + 1);
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

function mealText(meal) {
  const t = sumItems(meal.items);
  const lines = meal.items.map((it) => `• ${esc(it.name)} — ${it.grams} г · <b>${round(itemTotals(it).kcal)}</b> ккал`);
  return (
    `🍽 <b>${esc(meal.title)}</b> · ${meal.time}\n` +
    `\n${lines.join("\n")}\n\n` +
    `🔥 <b>${round(t.kcal)} ккал</b>   🥩 ${round(t.p)} г   🧈 ${round(t.f)} г   🍞 ${round(t.c)} г`
  );
}

function remainingText(u, day, date) {
  const t = dayTotals(day);
  const left = u.targets.kcal - t.kcal;
  const label = date === today(u) ? "За сегодня" : `За ${humanDate(date)}`;
  return (
    `📊 ${label}  <b>${round(t.kcal)}</b> / ${u.targets.kcal} ккал\n${squares(t.kcal, u.targets.kcal)}\n` +
    (left >= 0 ? `<i>Осталось ${round(left)} ккал</i>` : `<i>Больше нормы на ${round(-left)} ккал</i>`)
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

const HELP = `🍏 <b>FITTER</b>
<i>Одно фото. Полный контроль.</i>


📸 <b>Как это работает</b>

1️⃣ Сфотографируй еду и отправь сюда
2️⃣ Я найду продукты и посчитаю КБЖУ
3️⃣ Ошибся? Нажми ✏️ под записью
4️⃣ Всё сохранится в дневник


✨ <b>Ещё умею</b>

📝 «съел 2 яйца и тост» — запишу
💬 «сколько белка в твороге?» — отвечу
📦 Этикетка или штрихкод — найду КБЖУ
💧 «вода 300» — отмечу воду
⚖️ <code>/weight 72.5</code> — запишу вес


⌨️ <b>Команды</b>

/today  итоги дня
/week  неделя
/water  вода  ·  /pills  таблетки
/weight  вес  ·  /remind  напоминания
/advice  что съесть
/analysis  разбор недели
/awards  достижения
/profile  профиль  ·  /app  дневник
/reset  анкета заново
/delete  удалить мои данные


<i>FITTER считает примерно и не заменяет врача</i>`;

// ───────────────────────────── Обработка сообщений ─────────────────────────────

async function handleUpdate(update, env) {
  if (update.message) return onMessage(update.message, env);
  if (update.callback_query) return onCallback(update.callback_query, env);
}

function newUser(from) {
  return { id: from.id, name: from.first_name || "", tz: DEFAULT_TZ, created: Date.now(), state: null };
}

// Метка источника из /start: только латиница, цифры, _ и -, до 32 символов
function startSource(text) {
  const m = String(text || "").match(/^\/start\s+([A-Za-z0-9_-]{1,32})$/);
  return m ? m[1].toLowerCase() : "direct";
}

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

// Все ключи с префиксом (KV отдаёт по 1000 за раз)
async function listAll(env, prefix) {
  const names = [];
  let cursor;
  do {
    const page = await env.DB.list({ prefix, cursor });
    names.push(...page.keys.map((k) => k.name));
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return names;
}

// Мини-график из столбиков: ▁ — ноль, █ — максимум
function spark(nums) {
  const bars = "▂▃▄▅▆▇█", max = Math.max(...nums);
  return nums.map((n) => (n && max ? bars[Math.min(6, Math.floor((n / max) * 6.999))] : "▁")).join("");
}

// /stats [дней] — статистика для владельца: рост, активность, удержание, источники
async function sendStats(env, chatId, from, text) {
  if (!env.ADMIN_ID) {
    return send(env, chatId,
      `Статистика доступна только владельцу.\n\nТвой Telegram ID: <code>${from.id}</code>\n` +
      `Добавь переменную <b>ADMIN_ID</b> с этим числом в настройках воркера в Cloudflare, и команда заработает.`);
  }
  if (!isAdmin(env, from)) return send(env, chatId, "Эта команда только для владельца бота");
  const days = Math.min(365, Math.max(1, parseInt(text.split(/\s+/)[1], 10) || 30));
  const users = (await Promise.all((await listAll(env, "u:")).map((k) => env.DB.get(k, "json")))).filter(Boolean);
  // Активный день = есть ключ дня d:{id}:{дата} (еда, вода или таблетки). Значения не читаем — хватает имён ключей
  const dayKeys = await listAll(env, "d:");
  return send(env, chatId, statsText(users, dayKeys, days, Date.now()));
}

function statsText(users, dayKeys, days, now) {
  const t = new Date(now + DEFAULT_TZ * 60000).toISOString().slice(0, 10);
  const back = (n) => shiftDate(t, -n);
  const active = new Map(); // id → множество дат с записями
  for (const k of dayKeys) {
    const [, id, date] = k.split(":");
    if (!isDate(date)) continue;
    (active.get(id) || active.set(id, new Set()).get(id)).add(date);
  }
  const dates = (u) => active.get(String(u.id)) || new Set();
  const born = (u) => new Date((u.created || now) + tzOf(u) * 60000).toISOString().slice(0, 10);
  const activeSince = (u, from) => [...dates(u)].some((d) => d >= from);
  const countOn = (d) => users.filter((u) => dates(u).has(d)).length;
  const ate = (u) => (u.st?.meals || 0) > 0 || !!u.streak?.last || dates(u).size > 0;

  // Рост и активность
  const dau = countOn(t), wau = users.filter((u) => activeSince(u, back(6))).length;
  const mau = users.filter((u) => activeSince(u, back(29))).length;
  const span = [...Array(14)].map((_, i) => back(13 - i));
  const newBy = span.map((d) => users.filter((u) => born(u) === d).length);
  const actBy = span.map(countOn);

  // Воронка новых за период
  const fresh = users.filter((u) => born(u) > back(days));
  const form = fresh.filter((u) => u.targets).length, food = fresh.filter(ate).length;
  // Удержание: вернулся через N+ дней. Считаем по тем, кто пришёл в окно из `days` дней, закончившееся N дней назад
  const ret = (n) => {
    const base = users.filter((u) => born(u) <= back(n) && born(u) > back(n + days));
    const ok = base.filter((u) => activeSince(u, shiftDate(born(u), n))).length;
    return base.length ? `<b>${pct(ok, base.length)}%</b> (${ok} из ${base.length})` : "пока рано";
  };

  // Когорты по неделям регистрации: доля активных на 1–4-й неделе после прихода
  const weekStart = (d) => shiftDate(d, -((new Date(d + "T00:00:00Z").getUTCDay() + 6) % 7));
  const cohorts = [];
  for (let w = 5; w >= 0; w--) {
    const start = shiftDate(weekStart(t), -7 * w), end = shiftDate(start, 6);
    const group = users.filter((u) => born(u) >= start && born(u) <= end);
    if (!group.length) continue;
    const cells = [1, 2, 3, 4].map((k) => {
      if (shiftDate(end, 7 * k) > t) return "   ·";
      const ok = group.filter((u) => [...dates(u)].some((d) => d >= shiftDate(born(u), 7 * k) && d <= shiftDate(born(u), 7 * k + 6))).length;
      return String(pct(ok, group.length) + "%").padStart(4);
    });
    cohorts.push(`${start.slice(8)}.${start.slice(5, 7)}  ${String(group.length).padStart(4)}  ${cells.join(" ")}`);
  }

  // Источники
  const bySrc = {};
  for (const u of fresh) {
    const r = (bySrc[u.src || "direct"] ||= { n: 0, form: 0, ate: 0, old: 0, back: 0 });
    r.n++;
    if (u.targets) r.form++;
    if (ate(u)) r.ate++;
    if (born(u) <= back(7)) { r.old++; if (activeSince(u, shiftDate(born(u), 7))) r.back++; }
  }
  const rows = Object.entries(bySrc).sort((a, b) => b[1].n - a[1].n).slice(0, 10)
    .map(([k, r]) => `• <b>${esc(k)}</b> — ${r.n} · анкета ${pct(r.form, r.n)}% · еда ${pct(r.ate, r.n)}%` +
      (r.old ? ` · неделя ${pct(r.back, r.old)}%` : ""));

  return `📊 <b>Статистика FITTER</b>\n\n` +
    `<b>Рост и активность</b>\n` +
    `<blockquote>👥 Всего: <b>${users.length}</b> · за сутки +${users.filter((u) => (u.created || 0) >= now - 864e5).length}\n` +
    `🔥 Активны сегодня: <b>${dau}</b> · 7 дн.: <b>${wau}</b> · 30 дн.: <b>${mau}</b>\n` +
    `📌 Возвращаемость (сегодня / 30 дн.): <b>${pct(dau, mau)}%</b></blockquote>\n` +
    `<b>14 дней</b> · ${humanDate(span[0])} — ${humanDate(t)}\n` +
    `<code>Новые    ${spark(newBy)}</code>  ${newBy.at(-1)} сегодня, всего ${newBy.reduce((a, b) => a + b, 0)}\n` +
    `<code>Активные ${spark(actBy)}</code>  ${dau} сегодня, макс. ${Math.max(...actBy)}\n\n` +
    `<b>Новые за ${days} дн.: ${fresh.length}</b>\n` +
    `<blockquote>📝 Прошли анкету: <b>${form}</b> (${pct(form, fresh.length)}%)\n🍽 Записали еду: <b>${food}</b> (${pct(food, fresh.length)}%)</blockquote>\n` +
    `<b>Удержание</b> · вернулись через…\n` +
    `<blockquote>1 день: ${ret(1)}\n7 дней: ${ret(7)}\n30 дней: ${ret(30)}</blockquote>\n` +
    (cohorts.length
      ? `<b>По неделям прихода</b> · активны на 1–4-й неделе\n<pre>Неделя  Люди  Нед1 Нед2 Нед3 Нед4\n${cohorts.join("\n")}</pre>\n`
      : "") +
    `<b>По источникам</b> · за ${days} дн.\n${rows.join("\n") || "Пока никого"}\n\n` +
    `<i>Активный день — любая запись: еда, вода или таблетки. Период: /stats 7 · метка: t.me/FitterFoodBot?start=habr</i>`;
}

function parseNum(text) {
  const m = String(text).replace(",", ".").match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : NaN;
}

async function onMessage(msg, env) {
  if (msg.chat.type !== "private" || !msg.from) return;
  const chatId = msg.chat.id;
  const known = await getUser(env, msg.from.id);
  let u = known || newUser(msg.from);
  const text = (msg.text || "").trim();
  // Откуда пришёл новый пользователь: t.me/FitterFoodBot?start=habr → «habr»
  if (!known) u.src = startSource(text);

  if (text === "/stats" || text.startsWith("/stats ")) return sendStats(env, chatId, msg.from, text);

  // Служебные команды для своих иконок — только владельцу бота (ADMIN_ID)
  const admin = isAdmin(env, msg.from);
  if (/^\/(emojipack|emojiid|makeemoji|emojierr)\b/.test(text) && !admin) return send(env, chatId, "Эта команда только для владельца бота");
  if (admin && (msg.entities || msg.caption_entities || []).some((e) => e.type === "custom_emoji")) return sendEmojiIds(env, chatId, msg);
  if (text.startsWith("/emojipack")) return sendEmojiPack(env, chatId, text.split(/\s+/)[1]);
  if (text === "/emojiid") return send(env, chatId, "Отправь мне иконки из набора, и я пришлю их номера 🔢");
  if (text === "/makeemoji") return makeEmojiPack(env, chatId, msg.from);
  if (text === "/emojierr") {
    const e = await env.DB.get("cfg:emojierr", "json");
    return tgRaw(env, "sendMessage", { chat_id: chatId, text: e ? `Последняя ошибка иконок (${e.at}, ${e.method}):\n${e.error}` : "Ошибок с иконками не было ✅" });
  }

  if (text === "/start" || text.startsWith("/start ")) {
    if (u.targets) {
      u.state = null;
      await saveUser(env, u);
      return send(env, chatId, `С возвращением, ${esc(u.name || "друг")}! 👋\nОтправь фото еды — я посчитаю калории.`, { reply_markup: MAIN_KEYBOARD });
    }
    return startOnboarding(env, u, chatId);
  }
  if (text === "/reset") return startOnboarding(env, u, chatId);
  if (text === "/delete") {
    if (!known) return send(env, chatId, "У меня нет твоих данных 🤷");
    return send(env, chatId,
      "🗑 <b>Удалить все твои данные?</b>\n\nАнкета, дневник питания, вода, вес, таблетки и напоминания будут стёрты навсегда. Восстановить их не получится.",
      { reply_markup: { inline_keyboard: [[{ text: "Да, удалить всё", callback_data: "delall" }, { text: "Отмена", callback_data: "delno" }]] } });
  }

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

  // Ждём новый препарат: «Витамин D, 1 капсула, 9:00 21:00»
  if (u.state && u.state.type === "pilladd") {
    if (text && !text.startsWith("/") && !isMenu(text)) {
      const p = parsePill(text);
      if (!p) return send(env, chatId, "Напиши название и время приёма, например: <b>Витамин D, 1 капсула, 9:00</b>");
      u.state = null;
      return addPill(env, u, chatId, p);
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
  if (msg.document && /^image\//.test(msg.document.mime_type || "")) {
    if ((msg.document.file_size || 0) > MAX_IMAGE_BYTES) return send(env, chatId, "📷 Файл слишком большой. Пришли картинку до 5 МБ или просто фото");
    return onPhoto(env, u, chatId, msg);
  }

  const cmd = MENU[menuLabel(text)] || text.split(/\s+/)[0].replace(/@\w+$/, "");
  switch (cmd) {
    case "/today": return sendDay(env, u, chatId, today(u));
    case "/week": return sendWeek(env, u, chatId);
    case "/profile": return sendProfile(env, u, chatId);
    case "/awards": return sendAwards(env, u, chatId);
    case "/remind": return sendReminders(env, u, chatId);
    case "/analysis": return sendAnalysis(env, u, chatId);
    case "/advice": return sendAdvice(env, u, chatId);
    case "/water": return sendWater(env, u, chatId);
    case "/pills": return sendPills(env, u, chatId);
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
// «Вес» остаётся для тех, у кого ещё старая клавиатура
const MENU = { "Сегодня": "/today", "Неделя": "/week", "Вода": "/water", "Таблетки": "/pills", "Вес": "/weight", "Профиль": "/profile", "Помощь": "/help" };
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
  if (kind === "delall") {
    await deleteUserData(env, u.id);
    await answer("Данные удалены");
    return edit(env, chatId, msgId, "🗑 Все твои данные удалены. Чтобы начать заново, напиши /start");
  }
  if (kind === "delno") {
    await answer();
    return edit(env, chatId, msgId, "Ничего не удалял 👌");
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
    const { day, reached, fresh } = await addWater(env, u, a, delta);
    await answer(delta > 0 ? `💧 +${delta} мл` : "Убрал 250 мл");
    await edit(env, chatId, msgId, waterText(u, day, a, delta), { reply_markup: waterKeyboard(a) });
    if (reached && !fresh.length) await send(env, chatId, "🎉 Норма воды на сегодня выполнена! Так держать 💧", { message_effect_id: EFFECT_PARTY });
    return announce(env, chatId, fresh);
  }
  if (kind === "wr") {
    if (a === "menu") {
      await answer();
      return edit(env, chatId, msgId, remindText(u), { reply_markup: remindKeyboard(u) });
    }
    return onRemindButton(env, u, chatId, msgId, a, b, answer);
  }
  if (kind === "awards") {
    await answer();
    return sendAwards(env, u, chatId);
  }
  if (kind === "pl") return onPillsButton(env, u, chatId, msgId, data.split("|"), answer);
  if (kind === "p") {
    const [, act, date, id, t] = data.split("|");
    return onPillButton(env, u, chatId, msgId, act, date, id, t, answer);
  }
  if (kind === "advice") {
    await answer("Подбираю варианты…");
    return sendAdvice(env, u, chatId);
  }
  if (kind === "adv") {
    const saved = await env.DB.get(`adv:${u.id}`, "json");
    const o = saved?.date === today(u) ? saved.options[Number(a)] : null;
    if (!o) return answer("Варианты устарели, нажми «Что съесть» ещё раз");
    await env.DB.delete(`adv:${u.id}`);
    await answer("Записываю ✅");
    await tg(env, "editMessageReplyMarkup", { chat_id: chatId, message_id: msgId, reply_markup: { inline_keyboard: [] } });
    return saveMealAndReply(env, u, chatId, null, o.title, o.items, "advice", null);
  }
  if (kind === "profile") {
    await answer();
    return sendProfile(env, u, chatId);
  }
  if (kind === "ai_week") {
    await answer();
    return sendAnalysis(env, u, chatId);
  }
  if (kind === "an_off" || kind === "an_on") {
    u.weekly = kind === "an_on";
    await saveUser(env, u);
    await answer(u.weekly ? "Буду присылать разбор по воскресеньям" : "Больше не буду присылать разбор по воскресеньям");
    return tg(env, "editMessageReplyMarkup", {
      chat_id: chatId, message_id: msgId,
      reply_markup: { inline_keyboard: [[u.weekly ? { text: "🔕 Не присылать по воскресеньям", callback_data: "an_off" } : { text: "🔔 Снова присылать по воскресеньям", callback_data: "an_on" }]] },
    });
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

// Картинки файлом больше 5 МБ не берём: нейросети хватает и обычного фото
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

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
    `💧 <b>Вода ${date === today(u) ? "за сегодня" : "за " + humanDate(date)}</b>` +
    (added ? ` · ${added > 0 ? "+" : "−"}${Math.abs(added)} мл записал` : "") + `\n\n\n` +
    `<b>${liters(ml)}</b> / ${liters(goal)}\n${squares(Math.min(ml, goal), goal, "🟦")}\n` +
    (left > 0 ? `<i>Осталось ${left} мл · ${pctOf(ml, goal)}%</i>` : "<i>Норма воды выполнена</i> 🎉") +
    `\n\n\n<i>Норма — 30 мл на кг веса. Можно написать «вода 300» или «+500»</i>`
  );
}

function waterKeyboard(date) {
  return {
    inline_keyboard: [
      [{ text: "💧 +250 мл", callback_data: `w|${date}|250` }, { text: "💧 +500 мл", callback_data: `w|${date}|500` }],
      [{ text: "↩️ −250 мл", callback_data: `w|${date}|-250` }, { text: "⏰ Напоминания", callback_data: "wr|menu" }],
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
  // Выпил воду — следующее напоминание отсчитываем заново
  if (delta > 0 && u.wr && u.wr.every) { u.wr.last = Date.now(); await saveUser(env, u); }
  const goal = waterGoal(u);
  const reached = before < goal && day.water >= goal;
  const fresh = reached ? await progress(env, u, "water", date) : [];
  return { day, reached, fresh };
}

async function sendWater(env, u, chatId, delta = 0) {
  const date = today(u);
  const { day, reached, fresh } = delta ? await addWater(env, u, date, delta) : { day: await getDay(env, u.id, date), reached: false, fresh: [] };
  const extra = { reply_markup: waterKeyboard(date) };
  if (reached) extra.message_effect_id = EFFECT_PARTY;
  const r = await send(env, chatId, waterText(u, day, date, delta), extra);
  await announce(env, chatId, fresh);
  return r;
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
  const r = waitId ? await edit(env, chatId, waitId, text, extra) : await send(env, chatId, text, extra);
  const fresh = await progress(env, u, "meal", date, {
    pack: source === "package" || source === "barcode",
    inNorm: inNorm(dayTotals(day).kcal, u.targets.kcal),
  });
  await announce(env, chatId, fresh);
  return r;
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

// Разбор сообщения нейросетью: запись еды или вопрос
async function askText(env, u, text, date) {
  const t = dayTotals(await getDay(env, u.id, date));
  const ctx =
    `Данные пользователя: пол ${u.sex === "m" ? "мужской" : "женский"}, ${u.age} лет, рост ${u.height} см, вес ${u.weight} кг, ` +
    `цель: ${GOALS[u.goal]}. Норма: ${u.targets.kcal} ккал, Б ${u.targets.p} г, Ж ${u.targets.f} г, У ${u.targets.c} г. ` +
    `Уже съедено ${date === today(u) ? "сегодня" : "за " + humanDate(date)}: ${round(t.kcal)} ккал, Б ${round(t.p)}, Ж ${round(t.f)}, У ${round(t.c)}.`;
  return gemini(env, [{ text: `${TEXT_PROMPT}\n\n${ctx}\n\nСообщение пользователя: ${String(text).slice(0, 1500)}` }], TEXT_SCHEMA, 0.4);
}

async function onText(env, u, chatId, text) {
  if (!checkAiLimit(env, u)) {
    return send(env, chatId, "На сегодня лимит запросов к нейросети закончился 😔 Завтра снова можно!");
  }
  await saveUser(env, u);
  tg(env, "sendChatAction", { chat_id: chatId, action: "typing" });
  try {
    const res = await askText(env, u, text, today(u));
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

// Полоска из 10 квадратиков: зелёный — в норме, красный — больше нормы
function squares(value, target, color = "🟩", len = 10) {
  const pct = target ? value / target : 0;
  const sq = pct > 1.1 ? "🟥" : color;
  const n = value > 0 ? Math.max(1, Math.min(len, Math.round(pct * len))) : 0;
  return sq.repeat(n) + "⬜".repeat(len - n);
}
const pctOf = (v, t) => (t ? Math.round((v / t) * 100) : 0);

async function sendDay(env, u, chatId, date) {
  const day = await getDay(env, u.id, date);
  const t = dayTotals(day);
  const g = u.targets;
  const isToday = date === today(u);
  const left = g.kcal - t.kcal;
  const water = day.water || 0;
  const wGoal = waterGoal(u);

  let text =
    `📊 <b>${isToday ? "Сегодня" : WEEKDAYS[new Date(date + "T00:00:00Z").getUTCDay()]}</b> · ${humanDate(date)}\n\n\n` +
    `🔥 <b>${round(t.kcal)}</b> / ${g.kcal} ккал\n` +
    `${squares(t.kcal, g.kcal)}\n` +
    (left >= 0 ? `<i>Осталось ${round(left)} ккал · ${pctOf(t.kcal, g.kcal)}%</i>` : `<i>Больше нормы на ${round(-left)} ккал</i>`) +
    (isToday && streakNow(u) >= 2 ? `\n🔥 Серия: <b>${streakNow(u)}</b> ${plural(streakNow(u), "день", "дня", "дней")} подряд` : "") + `\n\n` +
    `\n🥩 Белки  <b>${round(t.p)}</b> / ${g.p} г\n` +
    `🧈 Жиры  <b>${round(t.f)}</b> / ${g.f} г\n` +
    `🍞 Углеводы  <b>${round(t.c)}</b> / ${g.c} г\n` +
    `💧 Вода  <b>${liters(water)}</b> / ${liters(wGoal)}${water >= wGoal ? " ✓" : ""}\n\n\n`;

  if (day.meals.length) {
    text += `🍽 <b>Приёмы пищи</b>\n\n` +
      day.meals.map((m) => `${m.time}  ${esc(m.title)}  <b>${round(sumItems(m.items).kcal)}</b>`).join("\n");
    // Подсказка по белку во второй половине дня
    if (isToday && nowTime(u) >= "15:00" && t.p < g.p * 0.5 && left > 0) {
      text += `\n\n\n💡 <i>Белка пока мало. Добавь творог, яйца, курицу или рыбу</i>`;
    } else if (left < 0) {
      text += `\n\n\n💡 <i>Норма набрана. Если хочется есть, выбирай овощи и белок</i>`;
    }
  } else {
    text += isToday ? "📸 <i>Отправь фото еды — я всё посчитаю</i>" : "<i>За этот день записей нет</i>";
  }
  return send(env, chatId, text, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🥗 Что съесть", callback_data: "advice" }, { text: "💧 +250 мл воды", callback_data: `w|${date}|250` }],
        [{ text: "📅 Неделя", callback_data: "week" }, appButton(env, "📱 Дневник")],
      ],
    },
  });
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

const MON_SHORT = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const shortDate = (d) => `${Number(d.slice(8))} ${MON_SHORT[Number(d.slice(5, 7)) - 1]}`;
const wdOf = (d) => WEEKDAYS[new Date(d + "T00:00:00Z").getUTCDay()];

async function sendWeek(env, u, chatId) {
  const end = today(u);
  const norm = u.targets.kcal;
  const dates = [...Array(7)].map((_, i) => shiftDate(end, i - 6));
  const [days, weights] = await Promise.all([Promise.all(dates.map((d) => getDay(env, u.id, d))), getWeights(env, u.id)]);

  const rows = dates.map((d, i) => {
    const has = days[i].meals.length > 0;
    const k = round(dayTotals(days[i]).kcal);
    const label = `${wdOf(d)} ${d.slice(8)}`;
    const isToday = d === end;
    if (!has) return { d, has, k: 0, line: `${isToday ? "<b>" + label + "</b>" : label}  ${isToday ? "<i>сегодня пусто</i>" : "·"}` };
    const pct = k / norm;
    return { d, has, k, pct, line: `${isToday ? "<b>" + label + "</b>" : label}  ${weekBar(pct)}  <b>${k}</b>${isToday ? " · <i>сегодня</i>" : ""}` };
  });

  // Среднее считаем по законченным дням: сегодняшний ещё не завершён
  const done = rows.filter((r) => r.has && r.d !== end);
  const base = done.length ? done : rows.filter((r) => r.has);
  const avg = base.length ? round(base.reduce((a, r) => a + r.k, 0) / base.length) : 0;
  const inNormDays = rows.filter((r) => r.has && r.pct >= 0.8 && r.pct <= 1.1).length;
  const recorded = rows.filter((r) => r.has).length;
  const best = rows.filter((r) => r.has).sort((a, b) => Math.abs(1 - a.pct) - Math.abs(1 - b.pct))[0];
  const water = days.map((d) => d.water || 0).filter(Boolean);
  const avgWater = water.length ? water.reduce((a, b) => a + b, 0) / water.length : 0;

  let text =
    `📅 <b>Неделя</b> · ${shortDate(dates[0])} — ${shortDate(end)}\n\n\n` +
    `${rows.map((r) => r.line).join("\n")}\n\n` +
    `<i>🟩 норма   🟦 меньше   🟥 больше\nЦель ${norm} ккал</i>\n\n\n`;

  if (!recorded) {
    text += "📸 <i>За неделю пока нет записей. Отправь фото еды, и я начну считать</i>";
  } else {
    const stats = [
      `🔥 В среднем <b>${avg}</b> из ${norm} ккал${done.length ? "" : " (пока только сегодня)"}`,
      `🎯 В норме <b>${inNormDays} из ${recorded}</b> ${plural(recorded, "дня", "дней", "дней")}`,
    ];
    if (best) stats.push(`🏆 Лучший день — ${wdOf(best.d).toLowerCase()}, ${shortDate(best.d)} · <b>${best.k}</b> ккал`);
    if (avgWater) stats.push(`💧 Вода в среднем <b>${liters(avgWater)}</b> из ${liters(waterGoal(u))}`);
    const wk = weights.filter((w) => w.date >= dates[0]);
    if (wk.length > 1) {
      const diff = r1(wk[wk.length - 1].kg - wk[0].kg);
      stats.push(`⚖️ Вес <b>${wk[wk.length - 1].kg} кг</b> · ${diff > 0 ? "+" : ""}${diff} кг за неделю`);
    }
    text += `📊 <b>Итоги</b>\n\n${stats.join("\n")}\n\n\n`;
    text += `💡 <i>${weekTip(u, avg, norm)}</i>`;
  }
  return send(env, chatId, text, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🥗 Что съесть сегодня", callback_data: "advice" }, { text: "🧠 Разбор от ИИ", callback_data: "ai_week" }],
        [{ text: "📊 Сегодня", callback_data: "today" }, appButton(env, "📱 Дневник")],
      ],
    },
  });
}

// Короткий совет по итогам недели
function weekTip(u, avg, norm) {
  const pct = avg / norm;
  if (pct < 0.8) {
    return u.goal === "gain"
      ? `Не хватает в среднем ${norm - avg} ккал в день. Для набора массы добавь 2 перекуса: творог, орехи, банан, кашу`
      : `Ты ешь меньше нормы на ${norm - avg} ккал в день. Слишком большой дефицит мешает результату, держись хотя бы 80% нормы`;
  }
  if (pct > 1.1) {
    return u.goal === "lose"
      ? `В среднем больше нормы на ${avg - norm} ккал. Замени сладкое и снеки на фрукты и белок`
      : `В среднем больше нормы на ${avg - norm} ккал. Следи за порциями и вечерними перекусами`;
  }
  return "Ты держишься в норме, так держать 💪";
}

const ADVICE_SCHEMA = {
  type: "OBJECT",
  properties: {
    intro: { type: "STRING", description: "Одно короткое предложение: на что сейчас стоит сделать упор" },
    options: {
      type: "ARRAY",
      description: "Ровно 3 варианта приёма пищи",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING", description: "Название блюда, коротко" },
          why: { type: "STRING", description: "Чем подходит, 3–7 слов" },
          items: { type: "ARRAY", items: ITEM_SCHEMA },
        },
        required: ["title", "why", "items"],
      },
    },
  },
  required: ["intro", "options"],
};

const ADVICE_PROMPT = `Ты нутрициолог-ассистент Telegram-бота FITTER. Пиши по-русски, просто и дружелюбно.
Предложи 3 разных варианта следующего приёма пищи, которые помогут добрать или не превысить дневную норму.
Правила:
• Учитывай время суток: утром завтрак, днём обед, вечером лёгкий ужин, поздно вечером лёгкий перекус.
• Учитывай остаток калорий и особенно белка. Если белка не хватает — делай на него упор.
• Если калорий почти не осталось или норма превышена — предлагай лёгкие варианты до 200 ккал.
• Блюда простые, из обычных продуктов в России, готовятся за 15 минут или покупаются в магазине.
• Не повторяй то, что человек уже ел сегодня. Ориентируйся на его привычные продукты за неделю.
• Для каждого варианта дай продукты с весом в граммах и КБЖУ на 100 г.`;

// 🥗 Что съесть: 3 варианта под остаток нормы, любой можно сразу записать
async function sendAdvice(env, u, chatId) {
  if (!checkAiLimit(env, u)) return send(env, chatId, "На сегодня лимит запросов к нейросети закончился 😔 Завтра снова можно!");
  await saveUser(env, u);
  tg(env, "sendChatAction", { chat_id: chatId, action: "typing" });
  const date = today(u);
  const dates = [...Array(7)].map((_, i) => shiftDate(date, i - 6));
  const days = await Promise.all(dates.map((d) => getDay(env, u.id, d)));
  const day = days.at(-1);
  const t = dayTotals(day), g = u.targets;
  const left = { kcal: round(g.kcal - t.kcal), p: round(g.p - t.p), f: round(g.f - t.f), c: round(g.c - t.c) };
  const eaten = day.meals.map((m) => m.title).join(", ") || "пока ничего";
  const usual = [...new Set(days.slice(0, -1).flatMap((d) => d.meals.map((m) => m.title)))].slice(-15).join(", ") || "нет данных";
  const ctx =
    `Сейчас ${nowTime(u)}. Цель: ${GOALS[u.goal]}. Норма: ${g.kcal} ккал, Б ${g.p}, Ж ${g.f}, У ${g.c}.\n` +
    `Съедено сегодня: ${round(t.kcal)} ккал, Б ${round(t.p)}, Ж ${round(t.f)}, У ${round(t.c)} (${eaten}).\n` +
    `Осталось: ${left.kcal} ккал, Б ${left.p}, Ж ${left.f}, У ${left.c}.\nЕл за неделю: ${usual}.`;
  let res;
  try {
    res = await gemini(env, [{ text: `${ADVICE_PROMPT}\n\n${ctx}` }], ADVICE_SCHEMA, 0.8);
  } catch (e) {
    console.error("advice error:", e && e.stack ? e.stack : e);
    return send(env, chatId, "😔 Нейросеть сейчас не отвечает. Попробуй ещё раз через минуту.");
  }
  const options = (Array.isArray(res.options) ? res.options : [])
    .map((o) => ({ title: String(o.title || "").trim().slice(0, 60), why: String(o.why || "").trim().slice(0, 80), items: cleanItems(o.items) }))
    .filter((o) => o.title && o.items.length)
    .slice(0, 3);
  if (!options.length) return send(env, chatId, "Не получилось подобрать варианты, попробуй ещё раз 🙏");
  await env.DB.put(`adv:${u.id}`, JSON.stringify({ date, options }), { expirationTtl: 6 * 3600 });
  return send(env, chatId, adviceText(u, left, res.intro, options), { reply_markup: adviceKeyboard(options) });
}

const NUMS = ["1️⃣", "2️⃣", "3️⃣"];

function adviceText(u, left, intro, options) {
  const head = left.kcal > 0
    ? `Осталось на сегодня <b>${left.kcal} ккал</b> · 🥩 ${Math.max(0, left.p)} г · 🧈 ${Math.max(0, left.f)} г · 🍞 ${Math.max(0, left.c)} г`
    : `Норма на сегодня уже набрана${left.kcal < 0 ? `, сверху <b>${-left.kcal} ккал</b>` : ""}. Если хочется есть — вот лёгкие варианты`;
  const list = options.map((o, i) => {
    const t = sumItems(o.items);
    return `${NUMS[i]} <b>${esc(o.title)}</b> · ${round(t.kcal)} ккал\n` +
      `${o.items.map((it) => `${esc(it.name)} ${it.grams} г`).join(", ")}\n` +
      `<i>Б ${round(t.p)} · Ж ${round(t.f)} · У ${round(t.c)}${o.why ? " — " + esc(o.why) : ""}</i>`;
  });
  return `🥗 <b>Что съесть</b>\n\n${head}\n\n` +
    (intro ? `💡 <i>${esc(String(intro).slice(0, 200))}</i>\n\n` : "") +
    `\n${list.join("\n\n")}\n\n\n` +
    `<i>Съел вариант? Нажми его номер, и я запишу в дневник</i>`;
}

function adviceKeyboard(options) {
  return {
    inline_keyboard: [
      options.map((_, i) => ({ text: `✅ ${NUMS[i]}`, callback_data: `adv|${i}` })),
      [{ text: "🔄 Другие варианты", callback_data: "advice" }, { text: "📊 Сегодня", callback_data: "today" }],
    ],
  };
}

async function sendProfile(env, u, chatId) {
  const t = u.targets;
  const yrs = `${u.age} ${plural(u.age, "год", "года", "лет")}`;
  const text =
    `👤 <b>${esc(u.name || "Профиль")}</b>\n\n\n` +
    `${u.sex === "m" ? "👨 Мужской" : "👩 Женский"} · 🎂 ${yrs}\n` +
    `📏 ${u.height} см · ⚖️ ${u.weight} кг\n` +
    `${ACTIVITY[u.activity]}\n` +
    `${GOALS[u.goal]}\n\n\n` +
    `🎯 <b>Норма на день</b>\n\n` +
    `🔥 <b>${t.kcal}</b> ккал\n` +
    `🥩 Белки  <b>${t.p}</b> г\n` +
    `🧈 Жиры  <b>${t.f}</b> г\n` +
    `🍞 Углеводы  <b>${t.c}</b> г\n` +
    `💧 Вода  <b>${liters(waterGoal(u))}</b>\n\n` +
    `<i>Норма пересчитается, когда запишешь новый вес</i>`;
  return send(env, chatId, text, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "⚖️ Записать вес", callback_data: "askw" }, { text: "📅 Неделя", callback_data: "week" }],
        [{ text: "🏆 Достижения", callback_data: "awards" }],
        [{ text: "✏️ Изменить анкету", callback_data: "reset" }],
      ],
    },
  });
}

// Записываем вес за сегодня и пересчитываем норму
async function saveWeight(env, u, kg) {
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
  return { list, date, prev, fresh: await progress(env, u, "weigh", date) };
}

async function logWeight(env, u, chatId, kg) {
  const { list, prev, fresh } = await saveWeight(env, u, kg);
  kg = u.weight;
  const diff = r1(kg - prev);
  const first = list.length ? list[0].kg : kg;
  const total = r1(kg - first);
  const r = await send(
    env, chatId,
    `⚖️ Записал: <b>${kg} кг</b>` +
      (diff ? ` (${diff > 0 ? "+" : ""}${diff} кг с прошлого раза)` : "") +
      (list.length && total ? `\nС начала: ${total > 0 ? "+" : ""}${total} кг` : "") +
      `\n\nНорма пересчитана: <b>${u.targets.kcal} ккал</b> в день`,
    { reply_markup: MAIN_KEYBOARD }
  );
  await announce(env, chatId, fresh);
  return r;
}

// ───────────────────────────── Серии и достижения ─────────────────────────────

// [id, иконка, название, описание, какой счётчик смотреть, сколько нужно]
const ACHIEVEMENTS = [
  ["first_meal", "🍽", "Первый шаг", "Записать первый приём пищи", "meals", 1],
  ["meals_10", "📷", "Фотограф", "10 записей еды", "meals", 10],
  ["meals_50", "📓", "Дневник в деле", "50 записей еды", "meals", 50],
  ["meals_100", "💯", "Сотня", "100 записей еды", "meals", 100],
  ["streak_3", "🔥", "Разгон", "3 дня подряд с записями", "best", 3],
  ["streak_7", "🔥", "Неделя без пропусков", "7 дней подряд с записями", "best", 7],
  ["streak_30", "🔥", "Железная привычка", "30 дней подряд с записями", "best", 30],
  ["norm_1", "🎯", "Точно в цель", "Первый день в норме калорий", "normDays", 1],
  ["norm_7", "🎯", "Снайпер", "7 дней в норме калорий", "normDays", 7],
  ["water_1", "💧", "Водный баланс", "Выполнить норму воды", "waterDays", 1],
  ["water_7", "💧", "Как рыба в воде", "7 дней с нормой воды", "waterDays", 7],
  ["pack_1", "📦", "Сканер", "Добавить продукт по этикетке или штрихкоду", "packs", 1],
  ["weigh_4", "⚖️", "На контроле", "Записать вес 4 раза", "weighs", 4],
];

const inNorm = (kcal, norm) => kcal >= norm * 0.9 && kcal <= norm * 1.1;

// Для тех, кто пользовался ботом до появления наград: один раз считаем историю за 60 дней
async function ensureStats(env, u, grant) {
  if (u.st) return;
  const end = today(u);
  const dates = [...Array(60)].map((_, i) => shiftDate(end, -i));
  const days = await Promise.all(dates.map((d) => getDay(env, u.id, d)));
  const st = { meals: 0, packs: 0, normDays: 0, waterDays: 0, weighs: 0, normLast: "", waterLast: "" };
  const goal = waterGoal(u);
  days.forEach((day, i) => {
    st.meals += day.meals.length;
    st.packs += day.meals.filter((m) => m.source === "package" || m.source === "barcode").length;
    if (day.meals.length && inNorm(dayTotals(day).kcal, u.targets.kcal)) { st.normDays++; st.normLast = st.normLast || dates[i]; }
    if ((day.water || 0) >= goal) { st.waterDays++; st.waterLast = st.waterLast || dates[i]; }
  });
  st.weighs = Math.max(0, (await getWeights(env, u.id)).length - 1);
  // Серия: дни подряд с записями, заканчивая сегодня или вчера
  let n = 0, best = 0, run = 0, last = "";
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].meals.length) { run++; best = Math.max(best, run); last = dates[i]; } else run = 0;
  }
  const start = days[0].meals.length ? 0 : days[1].meals.length ? 1 : -1;
  if (start >= 0) for (let i = start; i < days.length && days[i].meals.length; i++) n++;
  u.streak = { n, best, last };
  u.st = st;
  u.ach = u.ach || {};
  // На экране наград выдаём заработанное тихо; после события — с поздравлением
  if (grant) for (const a of ACHIEVEMENTS) if (statValue(u, a[4]) >= a[5]) u.ach[a[0]] = end;
}

const statValue = (u, key) => (key === "best" ? (u.streak?.best || 0) : (u.st?.[key] || 0));

// Обновляем счётчики после события и возвращаем новые награды
async function progress(env, u, event, date, extra = {}) {
  // Первый раз история уже включает это событие, поэтому счётчики не увеличиваем
  const first = !u.st;
  await ensureStats(env, u, false);
  const st = u.st;
  if (first) event = "none";
  if (event === "meal") {
    st.meals++;
    if (extra.pack) st.packs++;
    const s = u.streak || (u.streak = { n: 0, best: 0, last: "" });
    if (s.last !== date) {
      s.n = s.last === shiftDate(date, -1) ? s.n + 1 : 1;
      s.last = date;
      s.best = Math.max(s.best, s.n);
    }
    if (extra.inNorm && st.normLast !== date) { st.normDays++; st.normLast = date; }
  }
  if (event === "water" && st.waterLast !== date) { st.waterDays++; st.waterLast = date; }
  if (event === "weigh") st.weighs++;
  u.ach = u.ach || {};
  const fresh = ACHIEVEMENTS.filter((a) => !u.ach[a[0]] && statValue(u, a[4]) >= a[5]);
  for (const a of fresh) u.ach[a[0]] = date;
  await saveUser(env, u);
  return fresh;
}

async function announce(env, chatId, fresh) {
  if (!fresh.length) return;
  const list = fresh.map((a) => `${a[1]} <b>${a[2]}</b>\n<i>${a[3]}</i>`).join("\n\n");
  return send(env, chatId, `🏆 <b>${fresh.length > 1 ? "Новые достижения!" : "Новое достижение!"}</b>\n\n${list}`, {
    message_effect_id: EFFECT_PARTY,
    reply_markup: { inline_keyboard: [[{ text: "🏆 Все достижения", callback_data: "awards" }]] },
  });
}

// Текущая серия: если вчера и сегодня не было записей — серия прервалась
function streakNow(u) {
  const s = u.streak;
  if (!s || !s.last) return 0;
  const t = today(u);
  return s.last === t || s.last === shiftDate(t, -1) ? s.n : 0;
}

async function sendAwards(env, u, chatId) {
  await ensureStats(env, u, true);
  await saveUser(env, u);
  const got = ACHIEVEMENTS.filter((a) => u.ach[a[0]]);
  const left = ACHIEVEMENTS.filter((a) => !u.ach[a[0]]);
  const n = streakNow(u);
  let text =
    `🏆 <b>Достижения</b> · ${got.length} из ${ACHIEVEMENTS.length}\n\n` +
    `🔥 Серия: <b>${n}</b> ${plural(n, "день", "дня", "дней")} подряд · рекорд ${u.streak?.best || 0}\n\n\n`;
  if (got.length) {
    text += `<b>Получено</b>\n\n${got.map((a) => `${a[1]} <b>${a[2]}</b> · ${a[3]}`).join("\n")}\n\n\n`;
  }
  if (left.length) {
    // Ближайшие награды — те, к которым ты ближе всего
    const near = [...left].sort((x, y) => statValue(u, y[4]) / y[5] - statValue(u, x[4]) / x[5]);
    const show = near.slice(0, 4);
    text += `<b>Ближайшие</b>\n\n${show.map((a) => `🔒 ${a[2]} · ${a[3]} · <i>${Math.min(statValue(u, a[4]), a[5])}/${a[5]}</i>`).join("\n")}` +
      (near.length > show.length ? `\n\n<i>И ещё ${near.length - show.length} впереди</i>` : "");
  } else {
    text += "Ты собрал все награды! 🎉";
  }
  return send(env, chatId, text.trim(), { reply_markup: { inline_keyboard: [[{ text: "👤 Профиль", callback_data: "profile" }, appButton(env, "📱 Дневник")]] } });
}

// ───────────────────────────── ИИ-разбор недели ─────────────────────────────

const ANALYSIS_SCHEMA = {
  type: "OBJECT",
  properties: {
    score: { type: "INTEGER", description: "Оценка питания за неделю от 1 до 10" },
    summary: { type: "STRING", description: "2–3 предложения: общий итог недели" },
    good: { type: "ARRAY", items: { type: "STRING" }, description: "2–3 конкретные вещи, которые получились" },
    improve: { type: "ARRAY", items: { type: "STRING" }, description: "1–3 конкретные вещи, которые стоит улучшить" },
    tips: { type: "ARRAY", items: { type: "STRING" }, description: "Ровно 3 простых практических совета на следующую неделю" },
  },
  required: ["score", "summary", "good", "improve", "tips"],
};

const ANALYSIS_PROMPT = `Ты дружелюбный нутрициолог приложения FITTER. Разбери питание пользователя за последние 7 дней.
Опирайся только на данные ниже: калории, белки, жиры, углеводы, воду, блюда и цель.
Пиши по-русски, коротко, конкретно и по-доброму, без markdown. Каждый пункт — одно предложение до 120 символов.
Хвали за реальные успехи, а улучшения предлагай мягко и выполнимо. Не ставь диагнозов и не советуй жёсткие диеты.
Если записей мало, учитывай, что часть еды могла быть не записана.`;

async function weekData(env, u) {
  const end = today(u);
  const dates = [...Array(7)].map((_, i) => shiftDate(end, i - 6));
  const [days, weights] = await Promise.all([Promise.all(dates.map((d) => getDay(env, u.id, d))), getWeights(env, u.id)]);
  return { end, dates, days, weights, recorded: days.filter((d) => d.meals.length).length };
}

async function makeAnalysis(env, u) {
  const { end, dates, days, weights, recorded } = await weekData(env, u);
  if (recorded < 2) return { short: true, recorded };
  const key = `an:${u.id}:${end}`;
  const cached = await env.DB.get(key, "json").catch(() => null);
  if (cached) return cached;
  if (!checkAiLimit(env, u)) return { limit: true };
  await saveUser(env, u);
  const g = u.targets;
  const lines = dates.map((d, i) => {
    const day = days[i];
    if (!day.meals.length) return `${d}: нет записей` + (day.water ? `, вода ${day.water} мл` : "");
    const t = dayTotals(day);
    return `${d}: ${round(t.kcal)} ккал, Б ${round(t.p)}, Ж ${round(t.f)}, У ${round(t.c)}, вода ${day.water || 0} мл; блюда: ` +
      day.meals.map((m) => m.title).join("; ");
  });
  const wk = weights.filter((w) => w.date >= dates[0]);
  const ctx =
    `Пользователь: ${u.sex === "m" ? "мужчина" : "женщина"}, ${u.age} лет, рост ${u.height} см, вес ${u.weight} кг, ` +
    `активность: ${ACTIVITY[u.activity]}, цель: ${GOALS[u.goal]}.\n` +
    `Норма в день: ${g.kcal} ккал, Б ${g.p} г, Ж ${g.f} г, У ${g.c} г, вода ${waterGoal(u)} мл.\n` +
    (wk.length > 1 ? `Вес за неделю: ${wk[0].kg} → ${wk[wk.length - 1].kg} кг.\n` : "") +
    `Дни:\n${lines.join("\n")}`;
  const res = await gemini(env, [{ text: `${ANALYSIS_PROMPT}\n\n${ctx}` }], ANALYSIS_SCHEMA, 0.5);
  const clean = (arr, n) => (Array.isArray(arr) ? arr : []).map((s) => String(s).trim()).filter(Boolean).slice(0, n);
  const out = {
    end, from: dates[0], recorded,
    score: Math.min(10, Math.max(1, Math.round(Number(res.score) || 5))),
    summary: String(res.summary || "").trim().slice(0, 500),
    good: clean(res.good, 3), improve: clean(res.improve, 3), tips: clean(res.tips, 3),
  };
  await env.DB.put(key, JSON.stringify(out), { expirationTtl: 12 * 3600 }).catch(() => {});
  return out;
}

function analysisText(a) {
  const nums = ["1️⃣", "2️⃣", "3️⃣"];
  return (
    `🧠 <b>Разбор недели</b>\n<i>${humanDate(a.from)} — ${humanDate(a.end)} · ${a.recorded} ${plural(a.recorded, "день", "дня", "дней")} с записями</i>\n\n` +
    `🎯 Оценка: <b>${a.score}</b> из 10\n${squares(a.score, 10)}\n\n` +
    (a.summary ? `<i>${esc(a.summary)}</i>\n\n\n` : "") +
    (a.good.length ? `✅ <b>Что получилось</b>\n\n${a.good.map((s) => `• ${esc(s)}`).join("\n")}\n\n\n` : "") +
    (a.improve.length ? `🔍 <b>Что улучшить</b>\n\n${a.improve.map((s) => `• ${esc(s)}`).join("\n")}\n\n\n` : "") +
    (a.tips.length ? `💡 <b>Советы на неделю</b>\n\n${a.tips.map((s, i) => `${nums[i]} ${esc(s)}`).join("\n")}\n\n\n` : "") +
    `<i>FITTER считает примерно и не заменяет врача или диетолога</i>`
  );
}

async function sendAnalysis(env, u, chatId, auto = false) {
  const wait = auto ? null : await send(env, chatId, "🧠 Разбираю твою неделю…");
  const waitId = wait?.result?.message_id;
  const reply = (text, extra = {}) => (waitId ? edit(env, chatId, waitId, text, extra) : send(env, chatId, text, extra));
  try {
    const a = await makeAnalysis(env, u);
    if (a.short) return auto ? null : reply(`🧠 Для разбора нужно хотя бы 2 дня с записями за неделю, а сейчас ${a.recorded}.\n\nЗаписывай еду каждый день, и в воскресенье я пришлю подробный разбор 📸`);
    if (a.limit) return auto ? null : reply("На сегодня лимит запросов к нейросети закончился 😔 Попробуй завтра!");
    const buttons = [[{ text: "📅 Неделя", callback_data: "week" }, appButton(env, "📱 Дневник")]];
    if (auto) buttons.push([{ text: "🔕 Не присылать по воскресеньям", callback_data: "an_off" }]);
    return reply(analysisText(a), { reply_markup: { inline_keyboard: buttons } });
  } catch (e) {
    console.error("analysis error:", e && e.stack ? e.stack : e);
    return auto ? null : reply("😔 Нейросеть сейчас не отвечает. Попробуй ещё раз через минуту.");
  }
}

// Каждое воскресенье вечером: разбор недели всем, у кого было 3+ дня с записями
async function weeklyRun(env) {
  let cursor, sent = 0;
  do {
    const page = await env.DB.list({ prefix: "u:", cursor });
    for (const k of page.keys) {
      if (sent >= 50) return;
      const u = await env.DB.get(k.name, "json");
      if (!u || !u.targets || u.weekly === false) continue;
      const { recorded } = await weekData(env, u);
      if (recorded < 3) continue;
      await sendAnalysis(env, u, u.id, true);
      sent++;
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
}

// ───────────────────────────── Напоминания о воде ─────────────────────────────

const WR_EVERY = [[30, "30 мин"], [60, "1 ч"], [90, "1,5 ч"], [120, "2 ч"]];
const WR_FROM = [6, 7, 8, 9, 10, 11];
const WR_TO = [20, 21, 22, 23, 24];
const hh = (h) => `${String(h % 24).padStart(2, "0")}:00`;
const everyLabel = (m) => (WR_EVERY.find((x) => x[0] === m) || [0, `${m} мин`])[1];

// Список тех, у кого включены напоминания: чтобы не перебирать всех пользователей каждые 30 минут
async function wrIndex(env, id, on) {
  const ids = (await env.DB.get("wr:ids", "json")) || [];
  const has = ids.includes(id);
  if (on && !has) ids.push(id);
  if (!on && has) ids.splice(ids.indexOf(id), 1);
  if (on !== has) await env.DB.put("wr:ids", JSON.stringify(ids));
}

function remindText(u, note = "") {
  const w = u.wr;
  const on = w && w.every;
  return (
    (note ? `${note}\n\n` : "") +
    `⏰ <b>Напоминания о воде</b>\n\n` +
    (on
      ? `🔔 Каждые <b>${everyLabel(w.every)}</b>\n🌅 С <b>${hh(w.from)}</b>\n🌙 До <b>${hh(w.to)}</b>\n\n` +
        `<i>Ночью молчу. Когда норма воды выполнена, напоминания на сегодня заканчиваются</i>`
      : `<i>Сейчас выключены. Выбери, как часто напоминать, и я буду писать днём, пока не наберётся норма</i>`)
  );
}

function remindKeyboard(u) {
  const w = u.wr || {};
  const rows = [WR_EVERY.map(([m, label]) => ({ text: (w.every === m ? "✅ " : "") + label, callback_data: `wr|every|${m}` }))];
  if (w.every) {
    rows.push([
      { text: `🌅 С ${hh(w.from)}`, callback_data: "wr|pick|from" },
      { text: `🌙 До ${hh(w.to)}`, callback_data: "wr|pick|to" },
    ]);
    rows.push([{ text: "🔕 Выключить", callback_data: "wr|off" }]);
  }
  return { inline_keyboard: rows };
}

function pickKeyboard(u, which) {
  const list = which === "from" ? WR_FROM : WR_TO;
  const cur = u.wr?.[which];
  return {
    inline_keyboard: [
      list.map((h) => ({ text: (cur === h ? "✅ " : "") + hh(h), callback_data: `wr|${which}|${h}` })),
      [{ text: "↩️ Назад", callback_data: "wr|menu" }],
    ],
  };
}

async function sendReminders(env, u, chatId) {
  return send(env, chatId, remindText(u), { reply_markup: remindKeyboard(u) });
}

// Нажатия в меню напоминаний
async function onRemindButton(env, u, chatId, msgId, action, value, answer) {
  const w = u.wr || (u.wr = { every: 0, from: 8, to: 22, last: 0 });
  let note = "";
  if (action === "every" && WR_EVERY.some((x) => x[0] === Number(value))) {
    const was = w.every;
    w.every = Number(value);
    w.last = Date.now();
    await wrIndex(env, u.id, true);
    note = was ? `✅ Теперь напоминаю каждые ${everyLabel(w.every)}` : `✅ Напоминания включены: каждые ${everyLabel(w.every)}`;
  } else if (action === "from" && WR_FROM.includes(Number(value))) {
    w.from = Number(value);
    note = `🌅 Начало дня: ${hh(w.from)}`;
  } else if (action === "to" && WR_TO.includes(Number(value))) {
    w.to = Number(value);
    note = `🌙 Конец дня: ${hh(w.to)}`;
  } else if (action === "off") {
    w.every = 0;
    await wrIndex(env, u.id, false);
    note = "🔕 Напоминания о воде выключены";
  } else if (action === "pick" && (value === "from" || value === "to")) {
    await answer();
    const q = value === "from" ? "🌅 <b>Когда начинается твой день?</b>\nРаньше этого времени я не напоминаю." : "🌙 <b>Когда заканчивается твой день?</b>\nПосле этого времени я не напоминаю.";
    return edit(env, chatId, msgId, q, { reply_markup: pickKeyboard(u, value) });
  }
  await saveUser(env, u);
  await answer(note.replace(/^\S+ /, ""));
  return edit(env, chatId, msgId, remindText(u, note), { reply_markup: remindKeyboard(u) });
}

// Каждые 30 минут: кому пора напомнить о воде
async function waterTick(env, now = Date.now()) {
  const ids = (await env.DB.get("wr:ids", "json")) || [];
  let sent = 0;
  for (const id of ids) {
    const u = await env.DB.get(`u:${id}`, "json");
    const w = u?.wr;
    if (!u || !u.targets || !w || !w.every) continue;
    const local = new Date(now + tzOf(u) * 60000);
    const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
    if (minutes < w.from * 60 || minutes >= w.to * 60) continue; // ночь
    if (now - (w.last || 0) < w.every * 60000 - 10 * 60000) continue; // ещё рано (запас 10 минут на расписание)
    const date = local.toISOString().slice(0, 10);
    const day = await getDay(env, u.id, date);
    const ml = day.water || 0;
    const goal = waterGoal(u);
    if (ml >= goal) continue; // норма уже выполнена
    w.last = now;
    await saveUser(env, u);
    const left = goal - ml;
    await send(env, u.id,
      `💧 <b>Время попить воды!</b>\n\n<b>${liters(ml)}</b> из ${liters(goal)} · ${pctOf(ml, goal)}%\n${squares(ml, goal, "🟦")}\n` +
      `Осталось ${left} мл, это примерно ${Math.ceil(left / 250)} стак.`,
      {
        disable_notification: false,
        reply_markup: {
          inline_keyboard: [
            [{ text: "💧 +250 мл", callback_data: `w|${date}|250` }, { text: "💧 +500 мл", callback_data: `w|${date}|500` }],
            [{ text: "⏰ Настроить напоминания", callback_data: "wr|menu" }],
          ],
        },
      });
    sent++;
  }
  return sent;
}

// ───────────────────────────── Таблетки ─────────────────────────────
// u.pills = [{ id, name, dose, times: ["09:00", "21:00"] }]
// day.pills = { "<id>@09:00": { s: "taken" | "skip" | "snooze" | "sent", at: "09:04" } }

const PILL_MAX = 10;
const isSlot = (t) => typeof t === "string" && /^([01]\d|2[0-3]):(00|30)$/.test(t);
const pillKey = (id, t) => `${id}@${t}`;
const slotOf = (hhmm) => `${hhmm.slice(0, 2)}:${Number(hhmm.slice(3, 5)) < 30 ? "00" : "30"}`;
const nextSlot = (t) => { const m = (Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) + 30) % 1440; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };

async function plIndex(env, id, on) {
  const ids = (await env.DB.get("pl:ids", "json")) || [];
  const has = ids.includes(id);
  if (on && !has) ids.push(id);
  if (!on && has) ids.splice(ids.indexOf(id), 1);
  if (on !== has) await env.DB.put("pl:ids", JSON.stringify(ids));
}

// Список приёмов на день для дневника: что принять и что уже отмечено
function pillDoses(u, day) {
  const log = day.pills || {};
  return (u.pills || [])
    .flatMap((p) => p.times.map((t) => ({ id: p.id, name: p.name, dose: p.dose || "", time: t, s: log[pillKey(p.id, t)]?.s || "", at: log[pillKey(p.id, t)]?.at || "" })))
    .sort((a, b) => a.time.localeCompare(b.time) || a.name.localeCompare(b.name));
}

function pillReminderKeyboard(date, p, t) {
  return {
    inline_keyboard: [
      [{ text: "✅ Принял", callback_data: `p|t|${date}|${p.id}|${t}` }],
      [{ text: "⏰ Через 30 мин", callback_data: `p|z|${date}|${p.id}|${t}` }, { text: "Пропустить", callback_data: `p|s|${date}|${p.id}|${t}` }],
    ],
  };
}

const pillLine = (p) => `<b>${esc(p.name)}</b>${p.dose ? " · " + esc(p.dose) : ""}`;

// Каждые 30 минут: кому пора принять таблетку
async function pillTick(env, now = Date.now()) {
  const ids = (await env.DB.get("pl:ids", "json")) || [];
  let sent = 0;
  for (const id of ids) {
    const u = await env.DB.get(`u:${id}`, "json");
    if (!u || !u.pills?.length) continue;
    const local = new Date(now + tzOf(u) * 60000);
    const today = local.toISOString().slice(0, 10);
    const slot = slotOf(local.toISOString().slice(11, 16));
    // Отложенное после 23:30 приходится на 00:00 — оно лежит во вчерашнем дне
    const dates = slot === "00:00" ? [new Date(local.getTime() - 86400000).toISOString().slice(0, 10), today] : [today];
    for (const date of dates) {
      const day = await getDay(env, u.id, date);
      day.pills = day.pills || {};
      let changed = false;
      for (const p of u.pills) {
        for (const t of p.times) {
          const key = pillKey(p.id, t);
          const rec = day.pills[key];
          const due = (!rec && t === slot && date === today) || (rec?.s === "snooze" && rec.at === slot);
          if (!due) continue;
          day.pills[key] = { s: "sent", at: slot };
          changed = true;
          await send(env, u.id, `💊 <b>Время принять</b>\n${pillLine(p)} · ${t}`, { reply_markup: pillReminderKeyboard(date, p, t) });
          sent++;
        }
      }
      if (changed) await saveDay(env, u.id, date, day);
    }
  }
  return sent;
}

// Отметка приёма: из напоминания в чате и из дневника
async function markPill(env, u, date, id, t, s) {
  const p = (u.pills || []).find((x) => x.id === id);
  if (!p || !p.times.includes(t)) return null;
  const day = await getDay(env, u.id, date);
  day.pills = day.pills || {};
  const key = pillKey(id, t);
  if (s === "") delete day.pills[key];
  else day.pills[key] = { s, at: s === "snooze" ? nextSlot(slotOf(nowTime(u))) : nowTime(u) };
  await saveDay(env, u.id, date, day);
  return { p, rec: day.pills[key] || null };
}

async function onPillButton(env, u, chatId, msgId, action, date, id, t, answer) {
  const s = { t: "taken", s: "skip", z: "snooze" }[action];
  if (!s || !isDate(date) || !isSlot(t)) return answer();
  const r = await markPill(env, u, date, id, t, s);
  if (!r) {
    await answer("Этого препарата уже нет в списке");
    return tg(env, "editMessageReplyMarkup", { chat_id: chatId, message_id: msgId, reply_markup: { inline_keyboard: [] } });
  }
  const head = `${pillLine(r.p)} · ${t}`;
  const tail = s === "taken" ? `✅ Принято в ${r.rec.at}` : s === "skip" ? "⏭ Пропущено" : `⏰ Напомню в ${r.rec.at}`;
  await answer(s === "taken" ? "Отмечено ✅" : s === "skip" ? "Пропущено" : `Напомню в ${r.rec.at}`);
  return edit(env, chatId, msgId, `💊 ${head}\n${tail}`, s === "snooze" ? {} : { reply_markup: { inline_keyboard: [[appButton(env, "📱 Все таблетки в дневнике")]] } });
}

// ── Таблетки в чате: список на сегодня, отметки, добавление и удаление ──

// «Витамин D, 1 капсула, 9:00 21:00» → { name, dose, times }; время округляем до 30 минут
function parsePill(text) {
  const times = [];
  let rest = String(text).replace(/(^|[^\d])([01]?\d|2[0-3])[:.]([0-5]\d)(?!\d)/g, (m, pre, h, mm) => {
    times.push(slotOf(`${h.padStart(2, "0")}:${mm}`));
    return pre;
  });
  rest = rest.replace(/(^|\s)(в|и|утром|вечером)(?=\s|,|$)/gi, " ").replace(/\s+/g, " ").replace(/[\s,;]+$/g, "").trim();
  const uniq = [...new Set(times)].sort().slice(0, 6);
  if (!uniq.length) return null;
  let [name, ...more] = rest.split(",").map((x) => x.trim()).filter(Boolean);
  let dose = more.join(", ");
  if (name && !dose) {
    const m = name.match(/^(.+?)\s+(\d+[.,]?\d*\s*[а-яёa-z.]*)$/i);
    if (m) [, name, dose] = m;
  }
  if (!name) return null;
  return { name: name.slice(0, 40), dose: (dose || "").slice(0, 30), times: uniq };
}

const PILL_ICON = { taken: "✅", skip: "⏭", snooze: "⏰", sent: "🔔" };

function pillsView(env, u, day, date, mode) {
  const list = u.pills || [];
  if (!list.length) {
    return {
      text: "💊 <b>Таблетки</b>\n\n<i>Добавь витамины или лекарства, и я напомню в чате, когда их принять</i> ⏰",
      kb: [[{ text: "➕ Добавить препарат", callback_data: "pl|add" }], [appButton(env)]],
    };
  }
  if (mode === "edit") {
    return {
      text: "💊 <b>Мои препараты</b>\n\n\n" + list.map((p) => `${pillLine(p)}\n⏰ ${p.times.join(", ")}`).join("\n\n") + "\n\n\n<i>Нажми 🗑, чтобы удалить препарат и его напоминания</i>",
      kb: [
        ...list.map((p) => [{ text: `🗑 ${p.name}`.slice(0, 60), callback_data: `pl|x|${p.id}` }]),
        list.length < PILL_MAX ? [{ text: "➕ Добавить", callback_data: "pl|add" }, { text: "↩️ Назад", callback_data: "pl|back" }] : [{ text: "↩️ Назад", callback_data: "pl|back" }],
      ],
    };
  }
  const doses = pillDoses(u, day);
  const taken = doses.filter((x) => x.s === "taken").length;
  const lines = doses.map((x) => {
    const tail = x.s === "taken" && x.at ? ` — в ${x.at}` : x.s === "skip" ? " — пропущено" : x.s === "snooze" ? ` — напомню в ${x.at}` : "";
    return `${PILL_ICON[x.s] || "⬜"} ${x.time} <b>${esc(x.name)}</b>${x.dose ? " · " + esc(x.dose) : ""}${tail}`;
  });
  return {
    text: `💊 <b>Таблетки на сегодня</b> · ${taken} из ${doses.length} принято\n\n\n${lines.join("\n")}\n\n\n<i>Нажми на приём, чтобы отметить. Напомню в нужное время</i>`,
    kb: [
      ...doses.map((x) => [{ text: `${x.s === "taken" ? "✅" : "⬜"} ${x.time} ${x.name}`.slice(0, 60), callback_data: `pl|m|${date}|${x.id}|${x.time}` }]),
      [{ text: "➕ Добавить", callback_data: "pl|add" }, { text: "✏️ Изменить", callback_data: "pl|edit" }],
      [appButton(env)],
    ],
  };
}

async function sendPills(env, u, chatId, msgId = null, mode = "") {
  const date = today(u);
  const v = pillsView(env, u, await getDay(env, u.id, date), date, mode);
  const extra = { reply_markup: { inline_keyboard: v.kb } };
  return msgId ? edit(env, chatId, msgId, v.text, extra) : send(env, chatId, v.text, extra);
}

async function addPill(env, u, chatId, p) {
  u.pills = u.pills || [];
  if (u.pills.length >= PILL_MAX) {
    await saveUser(env, u);
    return send(env, chatId, `Можно добавить не больше ${PILL_MAX} препаратов. Удали лишний через «✏️ Изменить»`);
  }
  u.pills.push({ id: crypto.randomUUID().slice(0, 6), ...p });
  await saveUser(env, u);
  await plIndex(env, u.id, true);
  await send(env, chatId, `✅ Добавил: ${pillLine(p)}\n⏰ Напомню в ${p.times.join(", ")}`, { reply_markup: MAIN_KEYBOARD });
  return sendPills(env, u, chatId);
}

async function onPillsButton(env, u, chatId, msgId, [, act, a, b, c], answer) {
  if (act === "add") {
    if ((u.pills || []).length >= PILL_MAX) return answer(`Не больше ${PILL_MAX} препаратов`);
    u.state = { type: "pilladd" };
    await saveUser(env, u);
    await answer();
    return send(
      env, chatId,
      "💊 Напиши название, дозу и время приёма через запятую:\n\n" +
        "<blockquote>Витамин D, 1 капсула, 9:00\nОмега-3, 2 капсулы, 9:00 21:00\nМагний 14:30</blockquote>\n" +
        "<i>Время — с шагом 30 минут, можно несколько через пробел</i>",
      { reply_markup: { force_reply: true, input_field_placeholder: "Витамин D, 1 капсула, 9:00" } }
    );
  }
  if (act === "m" && isDate(a) && isSlot(c)) {
    const day = await getDay(env, u.id, a);
    const was = day.pills?.[pillKey(b, c)]?.s;
    const r = await markPill(env, u, a, b, c, was === "taken" ? "" : "taken");
    if (!r) return answer("Этого препарата уже нет в списке");
    await answer(was === "taken" ? "Отметка снята" : "Отмечено ✅");
    return sendPills(env, u, chatId, msgId);
  }
  if (act === "x") {
    const p = (u.pills || []).find((x) => x.id === a);
    u.pills = (u.pills || []).filter((x) => x.id !== a);
    await saveUser(env, u);
    await plIndex(env, u.id, u.pills.length > 0);
    await answer(p ? `Удалил «${p.name}»` : "Уже удалено");
    return sendPills(env, u, chatId, msgId, u.pills.length ? "edit" : "");
  }
  await answer();
  return sendPills(env, u, chatId, msgId, act === "edit" ? "edit" : "");
}

// ───────────────────────────── Mini App API ─────────────────────────────

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

// Заголовки безопасности дневника. CSP разрешает только наш встроенный скрипт (по хэшу) и скрипт Telegram,
// запросы — только к своему серверу, встраивать страницу — только в веб-версию Telegram.
// Если в дневнике когда-нибудь найдётся ошибка с выводом HTML, чужой скрипт всё равно не запустится и данные не уйдут наружу
let appCsp = null;
async function appHeaders() {
  if (!appCsp) {
    const js = APP_HTML.split("<script>")[1].split("</script>")[0];
    const hash = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(js)))));
    appCsp = [
      "default-src 'none'",
      `script-src 'sha256-${hash}' https://telegram.org`,
      "style-src 'unsafe-inline'",
      "img-src 'self' data:",
      "connect-src 'self'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors https://web.telegram.org https://*.web.telegram.org",
    ].join("; ");
  }
  return { "content-security-policy": appCsp, "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" };
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

// Сравнение строк за одинаковое время: по скорости ответа нельзя подобрать секрет
function safeEqual(a, b) {
  a = String(a ?? "");
  b = String(b ?? "");
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Подпись дневника действует сутки: утёкшие данные нельзя использовать долго
const INIT_DATA_TTL = 86400;

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
  if (!safeEqual(sig, hash)) return null;
  const authDate = Number(params.get("auth_date") || 0);
  if (Date.now() / 1000 - authDate > INIT_DATA_TTL) return null;
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
      streak: streakNow(u),
      water: day.water || 0,
      waterGoal: waterGoal(u),
      pills: pillDoses(u, day),
      pillList: (u.pills || []).map((p) => ({ id: p.id, name: p.name, dose: p.dose || "", times: p.times })),
      name: u.name,
    });
  }

  if (request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    if (!isDate(body.date)) return json({ error: "bad date" }, 400);
    if (url.pathname === "/api/water") {
      const delta = Number(body.delta);
      if (![250, -250].includes(delta)) return json({ error: "bad delta" }, 400);
      const { day: d, reached, fresh } = await addWater(env, u, body.date, delta);
      await announce(env, u.id, fresh);
      return json({ ok: true, water: d.water, reached });
    }
    if (url.pathname === "/api/weight") {
      const kg = Number(body.kg);
      if (!(kg >= 30 && kg <= 300)) return json({ error: "bad weight" }, 400);
      const { fresh } = await saveWeight(env, u, kg);
      await announce(env, u.id, fresh);
      return json({ ok: true, kg: u.weight, targets: u.targets });
    }
    if (url.pathname === "/api/pill/add") {
      const name = String(body.name || "").trim().slice(0, 40);
      const dose = String(body.dose || "").trim().slice(0, 30);
      const times = [...new Set((Array.isArray(body.times) ? body.times : []).filter(isSlot))].sort().slice(0, 6);
      if (!name || !times.length) return json({ error: "bad pill" }, 400);
      u.pills = u.pills || [];
      if (u.pills.length >= PILL_MAX) return json({ error: "too many" }, 400);
      u.pills.push({ id: crypto.randomUUID().slice(0, 6), name, dose, times });
      await saveUser(env, u);
      await plIndex(env, u.id, true);
      return json({ ok: true });
    }
    if (url.pathname === "/api/pill/delete") {
      u.pills = (u.pills || []).filter((p) => p.id !== body.id);
      await saveUser(env, u);
      await plIndex(env, u.id, u.pills.length > 0);
      return json({ ok: true });
    }
    if (url.pathname === "/api/pill/mark") {
      const s = body.s === "taken" || body.s === "skip" ? body.s : "";
      if (!isSlot(body.time)) return json({ error: "bad time" }, 400);
      const r = await markPill(env, u, body.date, String(body.id || ""), body.time, s);
      if (!r) return json({ error: "not found" }, 404);
      return json({ ok: true, s: r.rec?.s || "", at: r.rec?.at || "" });
    }

    if (url.pathname === "/api/meal/add") {
      const text = String(body.text || "").trim().slice(0, 500);
      if (text.length < 2) return json({ error: "empty" }, 400);
      if (body.date > today(u)) return json({ error: "future" }, 400);
      if (!checkAiLimit(env, u)) return json({ error: "limit" }, 429);
      await saveUser(env, u);
      let res;
      try {
        res = await askText(env, u, text, body.date);
      } catch (e) {
        console.error("app text error:", e && e.stack ? e.stack : e);
        return json({ error: "ai" }, 502);
      }
      const items = cleanItems(res.items);
      if (res.intent !== "food_log" || !items.length) return json({ error: "not_food", answer: res.answer || "" }, 422);
      const day = await getDay(env, u.id, body.date);
      const meal = {
        id: crypto.randomUUID().slice(0, 8),
        time: body.date === today(u) ? nowTime(u) : "—",
        title: String(res.title || items.map((i) => i.name).join(", ")).slice(0, 60),
        items,
        source: "app",
      };
      day.meals.push(meal);
      await saveDay(env, u.id, body.date, day);
      if (body.date === today(u)) {
        const fresh = await progress(env, u, "meal", body.date, { pack: false, inNorm: inNorm(dayTotals(day).kcal, u.targets.kcal) });
        await announce(env, u.id, fresh);
      } else {
        // Запись задним числом: серию и счётчики пересчитываем по истории
        delete u.st;
        await ensureStats(env, u, false);
        await saveUser(env, u);
      }
      return json({ ok: true, id: meal.id, title: meal.title, kcal: round(sumItems(items).kcal) });
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
      const idx = Number(body.idx);
      if (!Number.isInteger(idx) || !meal.items[idx]) return json({ error: "bad idx" }, 400);
      meal.items.splice(idx, 1);
      if (!meal.items.length) day.meals = day.meals.filter((m) => m !== meal);
      await saveDay(env, u.id, body.date, day);
      return json({ ok: true });
    }
  }
  return json({ error: "not found" }, 404);
}

// ───────────────────────────── Первичная настройка ─────────────────────────────

// Секрет вводится в форме и уходит POST-запросом: в адресе, истории браузера и логах его нет.
// Можно задать отдельный секрет SETUP_SECRET, иначе подходит WEBHOOK_SECRET
async function setup(request, env) {
  const page = (rows, form = "", status = 200) =>
    new Response(
      `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
        `<title>FITTER — настройка</title><body style="font:16px/1.5 system-ui;max-width:640px;margin:32px auto;padding:0 16px">` +
        `<h2>FITTER — настройка</h2>${rows.map(([ok, t]) => `<p>${ok ? "✅" : "❌"} ${t}</p>`).join("")}${form}</body>`,
      { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer", "x-frame-options": "DENY" } }
    );
  if (!env.WEBHOOK_SECRET) return page([[false, "Не задана переменная WEBHOOK_SECRET"]]);
  const form =
    `<form method="post" action="/setup"><p><input type="password" name="secret" placeholder="Секрет" autocomplete="off" required ` +
    `style="font:inherit;padding:8px;width:100%;box-sizing:border-box"></p><p><button style="font:inherit;padding:8px 16px">Настроить бота</button></p></form>`;
  if (request.method !== "POST") return page([], `<p>Введи ${env.SETUP_SECRET ? "SETUP_SECRET" : "WEBHOOK_SECRET"}:</p>` + form);
  const fd = await request.formData().catch(() => null);
  if (!safeEqual(fd && fd.get("secret"), env.SETUP_SECRET || env.WEBHOOK_SECRET)) {
    return page([[false, "Неверный секрет"]], form, 403);
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
      { command: "remind", description: "Напоминания о воде" },
      { command: "pills", description: "Таблетки и напоминания" },
      { command: "weight", description: "Записать вес" },
      { command: "profile", description: "Профиль и норма" },
      { command: "awards", description: "Достижения и серия" },
      { command: "advice", description: "Что съесть: советы от ИИ" },
      { command: "analysis", description: "Разбор недели от ИИ" },
      { command: "app", description: "Открыть дневник" },
      { command: "help", description: "Как пользоваться" },
      { command: "reset", description: "Пройти анкету заново" },
      { command: "delete", description: "Удалить мои данные" },
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
    --edge:rgba(19,32,26,.07);
    --fill:rgba(19,32,26,.05);
    --shadow:0 1px 2px rgba(16,40,28,.04),0 4px 14px rgba(16,40,28,.04);
    --r:20px;
  }
  /* Тема, выбранная кнопкой: перекрывает цвета Telegram */
  html[data-theme="light"]{--bg:#f3f5f2;--card:#ffffff;--text:#13201a;--hint:#8a948e;--line:rgba(127,127,127,.14);--edge:rgba(19,32,26,.07);--fill:rgba(19,32,26,.05);--shadow:0 1px 2px rgba(16,40,28,.04),0 4px 14px rgba(16,40,28,.04)}
  html[data-theme="dark"]{--bg:#0c100e;--card:#161c19;--text:#eef3f0;--hint:#8b968f;--line:rgba(255,255,255,.08);--edge:rgba(255,255,255,.06);--fill:rgba(255,255,255,.07);--shadow:none}
  /* Шапка: максимально яркий зелёный в обеих темах, текст тёмно-зелёный (контраст от 9:1) */
  html{--h-bg:radial-gradient(90% 70% at 90% -12%,rgba(220,255,236,.8),rgba(220,255,236,0) 60%),linear-gradient(165deg,#5dffad,#33f792 50%,#1fec84);
    --h-ink:#03301a;--h-sub:rgba(3,48,26,.75);--h-btn:rgba(255,255,255,.42);--h-chip:rgba(255,255,255,.5);--h-track:rgba(3,48,26,.12);--h-arc:#ffffff;--h-arc2:#e6fff1;
    --h-sel:#03301a;--h-sel-ink:#5dffad;--h-sel-sub:rgba(93,255,173,.7);--h-dot-ok:#03301a;--h-dot-lo:rgba(3,48,26,.3);--h-dot-ov:#d93a2f;--h-shadow:0 12px 30px rgba(31,236,132,.3)}
  html[data-theme="dark"]{--h-shadow:0 12px 30px rgba(31,236,132,.18)}
  html.tt,html.tt *{transition:background-color .3s,color .3s,border-color .3s!important}
  *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  html,body{margin:0;background:var(--bg);color:var(--text);font:15px/1.4 -apple-system,BlinkMacSystemFont,"SF Pro Rounded","Segoe UI",Roboto,sans-serif}
  body{padding-bottom:28px;overflow-x:hidden}
  button{font:inherit;border:0;cursor:pointer;transition:transform .14s cubic-bezier(.3,1.6,.5,1),filter .14s;touch-action:manipulation}
  button:active{transform:scale(.9);filter:brightness(.94)}
  .ic{width:24px;height:24px;flex:none;display:block}

  /* ── Шапка (цвета — токены --h-*) ── */
  .hero{position:relative;color:var(--h-ink);padding:14px 14px 22px;border-radius:0 0 30px 30px;overflow:hidden;background:var(--h-bg);box-shadow:var(--h-shadow)}
  .hero:before{content:"";position:absolute;width:240px;height:240px;right:-80px;top:-110px;border-radius:50%;background:rgba(255,255,255,.1);pointer-events:none}
  .top{position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:10px}
  .ttl{min-width:0}
  .ttl b{display:block;font-size:30px;font-weight:800;letter-spacing:-.02em;line-height:1.1;white-space:nowrap}
  .ttl small{display:block;margin-top:2px;font-size:14px;font-weight:600;color:var(--h-sub);white-space:nowrap}
  .nav{display:flex;align-items:center;gap:6px;flex:none}
  .nav button{width:36px;height:36px;border-radius:12px;background:var(--h-btn);color:var(--h-ink);display:flex;align-items:center;justify-content:center}
  .nav button svg{width:18px;height:18px}
  .av{width:40px;height:40px;border-radius:50%;background:#fff;color:#0a7a43;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:17px;margin-left:2px;box-shadow:0 4px 12px rgba(5,46,28,.14)}
  .av:empty{display:none}
  .week{position:relative;z-index:1;display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin:16px 0 8px}
  .wd{background:transparent;color:var(--h-ink);border-radius:14px;padding:7px 0;display:flex;flex-direction:column;align-items:center;gap:2px}
  .wd small{font-size:12px;font-weight:600;color:var(--h-sub)}
  .wd b{font-size:17px;font-weight:800}
  .wd i{width:6px;height:6px;border-radius:50%;background:transparent;margin-top:2px}
  .wd i.ok{background:var(--h-dot-ok)} .wd i.lo{background:var(--h-dot-lo)} .wd i.ov{background:var(--h-dot-ov)}
  .wd.sel{background:var(--h-sel);color:var(--h-sel-ink);box-shadow:0 6px 16px rgba(5,46,28,.22)}
  .wd.sel small{color:var(--h-sel-sub)}
  .wd.sel i.ok{background:var(--h-sel-ink)} .wd.sel i.lo{background:var(--h-sel-sub)} .wd.sel i.ov{background:var(--danger)}
  .wd.today:not(.sel) b{text-decoration:underline;text-decoration-thickness:2px;text-underline-offset:4px}
  .wd[disabled]{opacity:.4}
  .main{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;margin-top:6px}
  /* Кольцо калорий: светлая дорожка, градиентная дуга с бегунком, белый диск с числом */
  .ring{position:relative;width:204px;height:204px}
  .ring > svg{position:absolute;inset:0;transform:rotate(-90deg);overflow:visible}
  .ring .trk{stroke:var(--h-track)}
  .ring .arc{transition:stroke-dashoffset 1.2s cubic-bezier(.2,.8,.2,1);filter:drop-shadow(0 3px 8px rgba(3,48,26,.22))}
  .ring .s1{stop-color:var(--h-arc)} .ring .s2{stop-color:var(--h-arc2)}
  .ring.over .s1{stop-color:#b4231a} .ring.over .s2{stop-color:#ff6a4d}
  .ring .knob{transform-origin:102px 102px;transition:transform 1.2s cubic-bezier(.2,.8,.2,1)}
  .ring .knob circle{fill:#13a35a;stroke:#fff;stroke-width:4}
  .ring.over .knob circle{fill:#d93a2f}
  .ring.ok .arc{filter:drop-shadow(0 0 8px rgba(255,255,255,.9))}
  .ring .in{position:absolute;left:34px;top:34px;width:136px;height:136px;border-radius:50%;background:#fff;color:#03301a;
    box-shadow:0 10px 26px rgba(3,48,26,.16),inset 0 -6px 14px rgba(3,48,26,.05);display:flex;flex-direction:column;align-items:center;justify-content:center}
  .ring .in .ic{width:22px;height:22px;margin-bottom:1px}
  .ring .in b{font-size:36px;font-weight:800;letter-spacing:-.03em;line-height:1.05}
  .ring .in small{font-size:12px;font-weight:600;color:#55705f}
  .ring .in em{margin-top:5px;font-style:normal;font-size:12px;font-weight:800;padding:2px 8px;border-radius:99px;background:#e3fbee;color:#0b6b3a}
  .ring.over .in em{background:#ffe6e2;color:#b4231a}
  .chip{margin-top:10px;display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:99px;background:var(--h-chip);font-weight:700;font-size:14px}
  .chip.over{background:#d93a2f;color:#fff}
  .chips{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}

  .wrap{padding:0 12px}
  /* ── БЖУ ── */
  .macros{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:-14px;position:relative;z-index:2}
  .mc{background:var(--card);border:1px solid var(--edge);border-radius:var(--r);padding:12px;box-shadow:var(--shadow);position:relative;overflow:hidden}
  .mc .ib{width:30px;height:30px;border-radius:10px;display:flex;align-items:center;justify-content:center;margin-bottom:10px}
  .mc .ib .ic{width:20px;height:20px}
  .mc .lb{font-size:12px;color:var(--hint);font-weight:600}
  .mc .vl{font-size:20px;font-weight:800;letter-spacing:-.02em;margin:1px 0 8px}
  .mc .vl small{font-size:12px;color:var(--hint);font-weight:600}
  .bar{height:5px;border-radius:9px;background:var(--line);overflow:hidden}
  .bar div{height:100%;width:0;border-radius:9px;transition:width 1s cubic-bezier(.2,.8,.2,1)}
  .mc.p .ib{background:var(--p-bg)} .mc.p .bar div{background:var(--p)}
  .mc.f .ib{background:var(--f-bg)} .mc.f .bar div{background:var(--f)}
  .mc.c .ib{background:var(--c-bg)} .mc.c .bar div{background:var(--c)}
  .mc .st{margin-top:8px;font-size:12px;font-weight:700;color:var(--hint);font-variant-numeric:tabular-nums}
  .mc .st .ok{color:var(--g3)} .mc .st .ov{color:var(--danger)}
  html[data-theme="dark"] .mc .st .ok{color:var(--g1)}
  .mc .vl,.meal .k,.wt b,.ring .in b,.wb em{font-variant-numeric:tabular-nums}
  /* Подсказка по БЖУ */
  .hint{margin-top:8px;background:var(--card);border:1px solid var(--edge);border-radius:var(--r);padding:12px 14px 12px 32px;font-size:14px;line-height:1.4;box-shadow:var(--shadow);position:relative;text-wrap:pretty}
  .hint:before{content:"";position:absolute;left:14px;top:18px;width:8px;height:8px;border-radius:50%;background:var(--p)}
  .hint b{font-weight:800}
  .hint.good:before{background:var(--c)}
  .hint.warn:before{background:var(--danger)}

  /* ── Вода ── */
  .water{margin-top:8px;border-radius:var(--r);padding:14px;color:#fff;display:flex;align-items:center;gap:14px;position:relative;overflow:hidden;
    background:linear-gradient(135deg,var(--w1),var(--w2));box-shadow:0 8px 22px rgba(42,123,240,.24);transition:box-shadow .4s}
  .water:after{content:"";position:absolute;width:160px;height:160px;border-radius:50%;right:-50px;top:-70px;background:rgba(255,255,255,.12)}
  .water.done{box-shadow:0 0 0 2px rgba(255,255,255,.7) inset,0 8px 26px rgba(42,123,240,.4)}
  html[data-theme="dark"] .water:not(.done){box-shadow:none}
  .glass{width:52px;height:70px;flex:none;position:relative}
  .glass svg{width:100%;height:100%;overflow:visible}
  .glass .lvl{transition:transform 1s cubic-bezier(.2,.8,.2,1)}
  .glass .wave{animation:wave 2.4s linear infinite}
  .glass .wave2{animation:wave 3.6s linear infinite reverse;opacity:.55}
  @keyframes wave{from{transform:translateX(0)}to{transform:translateX(-40px)}}
  .wt{flex:1;position:relative;z-index:1}
  .wt .lb{font-size:12px;font-weight:600;color:rgba(255,255,255,.85)}
  .wt b{font-size:24px;font-weight:800;letter-spacing:-.02em}
  .wt small{font-size:12px;font-weight:600;color:rgba(255,255,255,.85)}
  .cups{display:flex;flex-wrap:wrap;gap:4px;margin-top:7px}
  .cups i{width:9px;height:12px;border-radius:1px 1px 3px 3px;background:rgba(255,255,255,.28);transition:background .3s}
  .cups i.on{background:#fff}
  .wbtn{display:flex;flex-direction:column;gap:6px;position:relative;z-index:1}
  .wbtn button{height:36px;border-radius:12px;padding:0 14px;font-weight:700;font-size:14px;background:rgba(255,255,255,.22);color:#fff}
  .wbtn button.add{background:#fff;color:var(--w2)}
  /* ── Таблетки ── */
  .pills{background:var(--card);border:1px solid var(--edge);border-radius:var(--r);padding:12px 14px;margin-top:8px;box-shadow:var(--shadow)}
  .pills .ph{display:flex;align-items:center;gap:10px}
  .pills .ib{width:36px;height:36px;border-radius:12px;background:rgba(143,91,255,.1);display:flex;align-items:center;justify-content:center;flex:none;font-size:18px}
  .pills .t{flex:1;min-width:0;font-weight:800}
  .pills .t small{display:block;color:var(--hint);font-weight:600;font-size:12px}
  .pbtn{flex:none;height:32px;padding:0 12px;border-radius:10px;background:var(--fill);color:var(--text);font-weight:700;font-size:13px}
  .pbar{height:5px;border-radius:9px;background:var(--line);margin:12px 0 4px;overflow:hidden}
  .pbar i{display:block;height:100%;width:0;border-radius:9px;background:#8f5bff;transition:width .8s cubic-bezier(.2,.8,.2,1)}
  .dose{display:flex;align-items:center;gap:10px;width:100%;padding:10px 0;border-top:1px solid var(--line);background:transparent;color:var(--text);text-align:left}
  .dose:first-of-type{border-top:0}
  .dose .tm{flex:none;width:44px;font-weight:800;font-size:13px;color:var(--hint)}
  .dose .nm{flex:1;min-width:0;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .dose .nm small{display:block;color:var(--hint);font-size:12px;font-weight:500}
  .dose .ck{flex:none;width:26px;height:26px;border-radius:50%;border:2px solid var(--line);display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:800;color:#fff;transition:background .2s,border-color .2s}
  .dose.taken .ck{background:#8f5bff;border-color:#8f5bff}
  .dose.taken .pn{color:var(--hint);text-decoration:line-through}
  .dose.skip .ck{border-style:dashed}
  .dose[disabled]{opacity:.55}
  .pform{display:flex;flex-direction:column;gap:8px;margin-top:10px}
  .pform input,.pform select{width:100%;padding:11px 12px;border-radius:13px;border:2px solid transparent;background:var(--bg);color:var(--text);font:inherit;outline:none}
  .pform input:focus,.pform select:focus{border-color:#8f5bff}
  .ptimes{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
  .ptimes .chip{display:flex;align-items:center;gap:4px;height:34px;padding:0 6px 0 12px;border-radius:11px;background:rgba(143,91,255,.14);color:var(--text);font-weight:700}
  .ptimes .chip b{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--hint);font-weight:700}
  .ptimes select{width:auto;flex:1;min-width:110px;padding:8px 10px}
  .psave{height:44px;border-radius:12px;background:#8f5bff;color:#fff;font-weight:800}
  .plist{margin-top:6px}
  .plist .row{display:flex;align-items:center;gap:10px;padding:9px 0;border-top:1px solid var(--line)}
  .plist .row div{flex:1;min-width:0;font-weight:600}
  .plist .row small{display:block;color:var(--hint);font-size:12px;font-weight:500}
  .plist .x{flex:none;height:32px;padding:0 12px;border-radius:10px;background:rgba(255,90,78,.12);color:var(--danger);font-weight:700;font-size:13px}
  .phint{color:var(--hint);font-size:13px;margin:8px 0 2px;line-height:1.45}

  /* ── Приёмы пищи ── */
  h3{margin:24px 4px 10px;font-size:17px;font-weight:800;display:flex;align-items:center;justify-content:space-between}
  h3 small{font-size:13px;color:var(--hint);font-weight:600}
  .meal{background:var(--card);border:1px solid var(--edge);border-radius:var(--r);padding:12px 14px 4px;margin-bottom:8px;box-shadow:var(--shadow)}
  .meal .hd{display:flex;align-items:center;gap:10px;margin-bottom:4px}
  .meal .ib{width:36px;height:36px;border-radius:12px;background:var(--c-bg);display:flex;align-items:center;justify-content:center;flex:none}
  .meal .ib .ic{width:24px;height:24px}
  .meal .t{flex:1;min-width:0;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .meal .t small{display:block;color:var(--hint);font-weight:500;font-size:12px}
  .meal .k{flex:none;padding:5px 9px;border-radius:10px;background:var(--fill);color:var(--text);font-weight:800;font-size:14px}
  .it{display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid var(--line)}
  .it .dot{width:8px;height:8px;border-radius:50%;flex:none}
  .it .n{flex:1;min-width:0}
  .it .n div{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600}
  .it .n small{color:var(--hint);font-size:12px}
  .it .nm{cursor:pointer}
  .it .nm:after{content:" ✎";font-size:12px;color:var(--hint)}
  .it .gr{display:flex;align-items:center;background:var(--fill);border-radius:10px;padding:0 8px 0 2px}
  .it input{width:52px;padding:7px 2px;border:0;background:transparent;color:var(--text);font:inherit;font-weight:700;text-align:right;outline:none}
  .it .g{color:var(--hint);font-size:13px}
  .it .ren{width:100%;padding:5px 8px;border-radius:9px;border:2px solid var(--g2);background:var(--bg);color:var(--text);font:inherit;outline:none}
  .del{display:block;width:100%;background:transparent;color:var(--danger);font-size:13px;font-weight:600;padding:10px 0;border-top:1px solid var(--line);opacity:.85}
  .addm{display:flex;align-items:flex-end;gap:8px;background:var(--card);border-radius:var(--r);padding:6px 6px 6px 15px;box-shadow:var(--shadow);border:1px solid var(--edge);transition:border-color .2s,box-shadow .2s}
  .addm:focus-within{border-color:var(--g2);box-shadow:0 0 0 3px var(--c-bg)}
  .addm textarea{flex:1;min-width:0;border:0;background:transparent;color:var(--text);font:inherit;font-size:15px;line-height:1.4;padding:10px 0;resize:none;outline:none;max-height:120px}
  .addm textarea::placeholder{color:var(--hint)}
  .addb{flex:none;width:44px;height:44px;border-radius:14px;background:var(--g2);color:#fff;font-size:26px;font-weight:600;line-height:1}
  .addb:active{transform:scale(.92)}
  .addm.busy .addb{font-size:0}
  .addm.busy .addb:after{content:"";display:block;width:18px;height:18px;margin:auto;border:3px solid rgba(255,255,255,.45);border-top-color:#fff;border-radius:50%;animation:spin .8s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  .addh{margin:7px 8px 12px;color:var(--hint);font-size:12px}
  .empty{background:var(--card);border:1px solid var(--edge);border-radius:var(--r);padding:26px 16px;text-align:center;color:var(--hint);box-shadow:var(--shadow)}
  .empty .ib{width:56px;height:56px;border-radius:18px;margin:0 auto 10px;background:var(--c-bg);display:flex;align-items:center;justify-content:center}
  .empty .ib .ic{width:42px;height:42px}
  .empty b{display:block;color:var(--text);font-size:16px;margin-bottom:4px}

  /* ── Полоска БЖУ у приёма пищи ── */
  .mbar{display:flex;gap:3px;height:4px;margin:6px 0 8px}
  .mbar i{border-radius:3px;min-width:3px}
  .mbar .p{background:var(--p)} .mbar .f{background:var(--f)} .mbar .c{background:var(--c)}

  /* ── Неделя ── */
  .wkc{background:var(--card);border:1px solid var(--edge);border-radius:var(--r);padding:22px 10px 12px;box-shadow:var(--shadow)}
  .wkc .bars{position:relative;display:grid;grid-template-columns:repeat(7,1fr);gap:4px;height:156px}
  .wkc .nl{position:absolute;left:4px;right:4px;height:0;border-top:1.5px dashed var(--hint);opacity:.6;pointer-events:none;z-index:1}
  .wkc .nl span{position:absolute;right:0;top:-18px;font-size:11px;font-weight:700;color:var(--hint);background:var(--card);padding:0 4px}
  .wkc .plot{position:absolute;left:0;right:0;top:0;bottom:30px;pointer-events:none}
  .wb{display:flex;flex-direction:column;align-items:center;gap:4px;background:transparent;color:var(--text);padding:0;min-width:0}
  .wb .col{flex:1;width:100%;display:flex;align-items:flex-end;justify-content:center}
  .wb .col i{display:block;width:62%;max-width:26px;height:0;border-radius:7px;background:var(--line);transition:height 1s cubic-bezier(.2,.8,.2,1)}
  .wb .col i.ok{background:var(--g2)}
  .wb .col i.lo{background:#9fe3bf}
  .wb .col i.ov{background:var(--p)}
  html[data-theme="dark"] .wb .col i.lo,html[data-theme="dark"] .wsum .lg i.lo{background:#2f6b4f}
  .wb small{font-size:11px;font-weight:700;color:var(--hint);line-height:1}
  .wb em{font-style:normal;font-size:11px;font-weight:700;color:var(--hint);line-height:1}
  .wb.sel small,.wb.sel em{color:var(--text)}
  .wb.sel .col i{box-shadow:0 0 0 2px var(--card),0 0 0 4px var(--g2)}
  .wb[disabled]{opacity:.45}
  .wsum{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin:12px 6px 0;padding-top:11px;border-top:1px solid var(--line);font-size:13px;color:var(--hint);font-weight:600}
  .wsum b{color:var(--text)}
  .wsum .lg{display:flex;align-items:center;gap:4px;font-size:12px}
  .wsum .lg i{width:8px;height:8px;border-radius:3px;margin-left:6px}
  .wsum .lg i.ok{background:var(--g2)} .wsum .lg i.lo{background:#9fe3bf} .wsum .lg i.ov{background:var(--p)}

  /* ── Вес ── */
  .wcard{background:var(--card);border:1px solid var(--edge);border-radius:var(--r);padding:12px 14px;box-shadow:var(--shadow);display:flex;align-items:center;gap:12px}
  .wcard .ib{width:36px;height:36px;border-radius:12px;background:rgba(127,140,155,.14);display:flex;align-items:center;justify-content:center;flex:none;color:#8e9aa6}
  .wcard .v{flex:1}
  .wcard .v b{font-size:22px;font-weight:800}
  .wcard .v small{display:block;color:var(--hint);font-size:12px}
  .wcard .wed{flex:none;width:34px;height:34px;border-radius:10px;background:var(--fill);color:var(--text);font-size:16px;display:flex;align-items:center;justify-content:center}
  .wcard .win{width:84px;padding:4px 8px;border:2px solid var(--g1);border-radius:10px;background:var(--bg);color:var(--text);font:inherit;font-size:20px;font-weight:800;outline:none}
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

  /* ══════ Новое оформление: монохромный прибор в стиле Okto — корпус, клавиши, утопленные дисплеи, моноширинные цифры ══════ */
  html[data-skin="okto"]{--o-bg:#ffffff;--o-ink:#141414;--o-muted:#5f5f5c;--o-line:#e4e4e1;--o-soft:#f3f3f1;--o-key:#ffffff;--o-key-edge:#cfcfcc;--o-key-hi:#ffffff;
    --o-well:#f1f1ef;--o-well-ink:#111111;--o-well-dim:#5a5a57;--o-well-edge:rgba(0,0,0,.13);--o-red:#d33a3f;
    --o-ghost:rgba(17,17,17,.07);--o-rest:rgba(17,17,17,.28);--o-dim:rgba(20,20,20,.35);--o-ink55:rgba(20,20,20,.55);--o-ink25:rgba(20,20,20,.25);
    --o-mono:ui-monospace,"SF Mono","Cascadia Mono","Roboto Mono",Menlo,Consolas,monospace;--o-ease:cubic-bezier(.16,1,.3,1);
    --bg:var(--o-bg);--card:var(--o-bg);--text:var(--o-ink);--hint:var(--o-muted);--line:var(--o-line);--danger:var(--o-red)}
  html[data-skin="okto"][data-theme="dark"]{--o-bg:#141414;--o-ink:#ededed;--o-muted:#8e8e8e;--o-line:#2a2a2a;--o-soft:#1d1d1d;--o-key:#262626;--o-key-edge:#070707;--o-key-hi:rgba(255,255,255,.07);
    --o-well:#0a0a0a;--o-well-ink:#f2f2f2;--o-well-dim:#8a8a8a;--o-well-edge:rgba(0,0,0,.7);--o-red:#ef5a5f;
    --o-ghost:rgba(242,242,242,.08);--o-rest:rgba(242,242,242,.28);--o-dim:rgba(237,237,237,.35);--o-ink55:rgba(237,237,237,.55);--o-ink25:rgba(237,237,237,.25)}
  html[data-skin="okto"] body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
  html[data-skin="okto"] button:active{transform:translateY(1px);filter:none}
  /* Клавиши: светлая грань сверху, 1px «ход» снизу, при нажатии утапливаются */
  html[data-skin="okto"] .nav button,html[data-skin="okto"] .av,html[data-skin="okto"] .wd,html[data-skin="okto"] .wbtn button,html[data-skin="okto"] .pbtn,
  html[data-skin="okto"] .dose .ck,html[data-skin="okto"] .wcard .wed,html[data-skin="okto"] .plist .x,html[data-skin="okto"] .ptimes .chip{
    background:var(--o-key);color:var(--o-ink);border:0;border-radius:10px;box-shadow:inset 0 1px 0 var(--o-key-hi),0 1px 0 var(--o-key-edge),0 2px 3px -1px rgba(0,0,0,.22);
    transition:transform 90ms var(--o-ease),box-shadow 90ms var(--o-ease)}
  html[data-skin="okto"] .nav button:active,html[data-skin="okto"] .wd:active,html[data-skin="okto"] .wbtn button:active,html[data-skin="okto"] .pbtn:active,html[data-skin="okto"] .wcard .wed:active,html[data-skin="okto"] .plist .x:active{
    transform:translateY(1px);box-shadow:inset 0 1px 2px rgba(0,0,0,.18)}
  /* Дисплеи: всё, что показывает показания, утоплено в корпус */
  html[data-skin="okto"] .kw,html[data-skin="okto"] .mc,html[data-skin="okto"] .water.ow,html[data-skin="okto"] .pills,html[data-skin="okto"] .wkc,html[data-skin="okto"] .wcard,html[data-skin="okto"] .empty,html[data-skin="okto"] .addm,html[data-skin="okto"] .it .gr{
    background:var(--o-well);color:var(--o-well-ink);border:0;border-radius:8px;box-shadow:inset 0 2px 3px var(--o-well-edge),inset 0 0 0 1px var(--o-well-edge),0 1px 0 var(--o-key-hi)}
  /* Цифры с погашенными «восьмёрками» под ними и сегментные шкалы */
  html[data-skin="okto"] .dg{display:inline-grid;font-family:var(--o-mono);font-weight:700;font-variant-numeric:tabular-nums;line-height:.92;letter-spacing:-.045em;white-space:nowrap}
  html[data-skin="okto"] .dg > span{grid-area:1/1;text-align:right}
  html[data-skin="okto"] .dg .gh{color:var(--o-ghost)}
  html[data-skin="okto"] .dg .lv.r{color:var(--o-red)}
  html[data-skin="okto"] .oseg{display:flex;gap:3px;height:8px}
  html[data-skin="okto"] .oseg i{flex:1;border-radius:1.5px;background:var(--o-ghost);transition:background .3s}
  html[data-skin="okto"] .oseg i.on{background:var(--o-well-ink)}
  html[data-skin="okto"] .oseg i.r{background:var(--o-red)}
  html[data-skin="okto"] .olr{display:flex;align-items:center;justify-content:space-between;gap:8px}
  html[data-skin="okto"] .olg{font:500 11px var(--o-mono);letter-spacing:.12em;text-transform:uppercase;color:var(--o-well-dim)}
  html[data-skin="okto"] .ord{font:500 12px var(--o-mono);color:var(--o-well-dim);font-variant-numeric:tabular-nums}

  /* Шапка — это корпус: без градиента, дни — ряд клавиш с LED */
  html[data-skin="okto"] .hero{background:var(--o-bg);color:var(--o-ink);box-shadow:none;border-radius:0;padding:12px 14px 4px;overflow:visible}
  html[data-skin="okto"] .hero:before{display:none}
  html[data-skin="okto"] .ttl b{font-size:30px;font-weight:700;letter-spacing:-.03em}
  html[data-skin="okto"] .ttl small{margin-top:4px;font:500 12px var(--o-mono);letter-spacing:.02em;color:var(--o-muted)}
  html[data-skin="okto"] .nav button{width:38px;height:38px}
  html[data-skin="okto"] .av{width:38px;height:38px;margin-left:0;font:700 15px var(--o-mono)}
  html[data-skin="okto"] .week{gap:5px;margin:16px 0 12px}
  html[data-skin="okto"] .wd{height:58px;padding:0;justify-content:center;gap:3px}
  html[data-skin="okto"] .wd small{font:500 10px var(--o-mono);letter-spacing:.08em;text-transform:uppercase;color:var(--o-muted)}
  html[data-skin="okto"] .wd b{font:700 16px var(--o-mono);letter-spacing:-.02em}
  html[data-skin="okto"] .wd i{width:5px;height:5px;margin-top:1px}
  html[data-skin="okto"] .wd i.ok,html[data-skin="okto"] .wd.sel i.ok{background:var(--o-ink)}
  html[data-skin="okto"] .wd i.lo,html[data-skin="okto"] .wd.sel i.lo{background:var(--o-dim)}
  html[data-skin="okto"] .wd i.ov,html[data-skin="okto"] .wd.sel i.ov{background:var(--o-red)}
  html[data-skin="okto"] .wd.sel{background:var(--o-soft);color:var(--o-ink);transform:translateY(1px);box-shadow:inset 0 1px 2px rgba(0,0,0,.18)}
  html[data-skin="okto"] .wd.sel small,html[data-skin="okto"] .wd.today small{color:var(--o-ink)}
  html[data-skin="okto"] .wd.today:not(.sel) b{text-decoration:none}
  html[data-skin="okto"] .wd[disabled]{opacity:.35}
  /* Калории: крупная цифра «осталось» и линейка из 20 сегментов вместо кольца */
  html[data-skin="okto"] .kw{padding:14px}
  html[data-skin="okto"] .kw .ro{text-align:right;margin:12px 0}
  html[data-skin="okto"] .kw .ro .dg{font-size:76px}
  html[data-skin="okto"] .kw .oseg{height:12px;margin-bottom:10px}
  html[data-skin="okto"] .wrap{padding:0 14px}
  /* БЖУ: три дисплея, нутриенты различаются подписью, а не цветом */
  html[data-skin="okto"] .macros{margin-top:10px;gap:8px}
  html[data-skin="okto"] .mc{padding:12px}
  html[data-skin="okto"] .mc .ib{display:none}
  html[data-skin="okto"] .mc .lb{font:500 11px var(--o-mono);letter-spacing:.1em;text-transform:uppercase;color:var(--o-well-dim)}
  html[data-skin="okto"] .mc .vl{margin:10px 0 8px}
  html[data-skin="okto"] .mc .vl .dg{font-size:28px}
  html[data-skin="okto"] .mc .vl small{display:block;margin-top:4px;font:500 12px var(--o-mono);color:var(--o-well-dim)}
  html[data-skin="okto"] .mc .st{font:500 12px var(--o-mono);color:var(--o-well-dim)}
  html[data-skin="okto"] .mc .st .ok{color:var(--o-well-ink)}
  html[data-skin="okto"] .mc .st .ov{color:var(--o-red)}
  html[data-skin="okto"] .hint{background:transparent;border:0;box-shadow:none;padding:4px 4px 2px 20px;margin-top:10px}
  html[data-skin="okto"] .hint:before,html[data-skin="okto"] .hint.good:before{left:4px;top:11px;width:6px;height:6px;background:var(--o-ink)}
  html[data-skin="okto"] .hint.warn:before{background:var(--o-red)}
  /* Вода: стаканы — ячейки, которые загораются по одной */
  html[data-skin="okto"] .water.ow{display:block;margin-top:10px;padding:14px;color:var(--o-well-ink)}
  html[data-skin="okto"] .water.ow:after{display:none}
  html[data-skin="okto"] .water.ow .vl{margin:10px 0;display:flex;align-items:baseline;gap:6px}
  html[data-skin="okto"] .water.ow .vl .dg{font-size:34px}
  html[data-skin="okto"] .water.ow .vl small{font:500 12px var(--o-mono);color:var(--o-well-dim)}
  html[data-skin="okto"] .ocup{display:grid;grid-template-columns:repeat(var(--n),1fr);gap:4px;height:26px}
  html[data-skin="okto"] .ocup i{border-radius:3px;background:var(--o-ghost);transition:background .3s}
  html[data-skin="okto"] .ocup i.on{background:var(--o-well-ink)}
  html[data-skin="okto"] .water.ow .wbtn{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}
  html[data-skin="okto"] .water.ow .wbtn button{height:40px;font:500 12px var(--o-mono);letter-spacing:.08em;text-transform:uppercase}
  /* Таблетки */
  html[data-skin="okto"] .pills{margin-top:10px;padding:12px 14px}
  html[data-skin="okto"] .pills .ib{display:none}
  html[data-skin="okto"] .pills .t{font:500 11px var(--o-mono);letter-spacing:.12em;text-transform:uppercase;color:var(--o-well-dim)}
  html[data-skin="okto"] .pills .t small{margin-top:3px;font:500 12px var(--o-mono);letter-spacing:0;text-transform:none;color:var(--o-well-dim)}
  html[data-skin="okto"] .pbtn{height:32px;font:500 11px var(--o-mono);letter-spacing:.08em;text-transform:uppercase}
  html[data-skin="okto"] .pbar{height:6px;border-radius:1.5px;background:var(--o-ghost)}
  html[data-skin="okto"] .pbar i{border-radius:1.5px;background:var(--o-well-ink)}
  html[data-skin="okto"] .dose{color:var(--o-well-ink);border-top-color:rgba(127,127,127,.18)}
  html[data-skin="okto"] .dose .tm{font:500 12px var(--o-mono);color:var(--o-well-dim)}
  html[data-skin="okto"] .dose .nm small,html[data-skin="okto"] .dose.taken .pn{color:var(--o-well-dim)}
  html[data-skin="okto"] .dose .ck{width:30px;height:30px;font-size:14px;color:var(--o-ink)}
  html[data-skin="okto"] .dose.taken .ck{background:var(--o-key);color:var(--o-ink);transform:translateY(1px);box-shadow:inset 0 1px 2px rgba(0,0,0,.18)}
  html[data-skin="okto"] .dose.skip .ck{opacity:.5}
  html[data-skin="okto"] .pform input,html[data-skin="okto"] .pform select{background:var(--o-key);color:var(--o-ink);border:1px solid var(--o-line);border-radius:8px}
  html[data-skin="okto"] .pform input:focus,html[data-skin="okto"] .pform select:focus{border-color:var(--o-ink)}
  html[data-skin="okto"] .ptimes .chip b{color:var(--o-muted)}
  html[data-skin="okto"] .psave{background:var(--o-ink);color:var(--o-bg);border-radius:10px;font-weight:600}
  html[data-skin="okto"] .plist .row{border-top-color:rgba(127,127,127,.18)}
  html[data-skin="okto"] .plist .row small,html[data-skin="okto"] .phint{color:var(--o-well-dim)}
  html[data-skin="okto"] .plist .x{color:var(--o-red)}
  /* Еда: не карточки, а строки на корпусе с тонкими линиями */
  html[data-skin="okto"] h3{margin:24px 2px 8px;font-size:20px;font-weight:700;letter-spacing:-.02em}
  html[data-skin="okto"] h3 small{font:500 12px var(--o-mono);color:var(--o-muted)}
  html[data-skin="okto"] .meal{background:transparent;border:0;border-top:1px solid var(--o-line);border-radius:0;box-shadow:none;padding:12px 2px 2px;margin:0}
  html[data-skin="okto"] .meal .ib,html[data-skin="okto"] .empty .ib,html[data-skin="okto"] .wcard .ib,html[data-skin="okto"] .it .dot{display:none}
  html[data-skin="okto"] .meal .t{font-size:16px;font-weight:600}
  html[data-skin="okto"] .meal .t small,html[data-skin="okto"] .it .n small{margin-top:2px;font:500 11.5px var(--o-mono);color:var(--o-muted)}
  html[data-skin="okto"] .meal .k{background:transparent;padding:0;font:700 15px var(--o-mono)}
  html[data-skin="okto"] .mbar{height:4px;gap:2px}
  html[data-skin="okto"] .mbar i{border-radius:1px}
  html[data-skin="okto"] .mbar .p{background:var(--o-ink)}
  html[data-skin="okto"] .mbar .f{background:var(--o-ink55)}
  html[data-skin="okto"] .mbar .c{background:var(--o-ink25)}
  html[data-skin="okto"] .it{border-top-color:var(--o-line)}
  html[data-skin="okto"] .it input{font-family:var(--o-mono);color:var(--o-well-ink)}
  html[data-skin="okto"] .it .g{font-family:var(--o-mono);color:var(--o-well-dim)}
  html[data-skin="okto"] .it .ren{border-color:var(--o-ink);border-radius:8px;background:var(--o-well)}
  html[data-skin="okto"] .del{text-align:left;font:500 11px var(--o-mono);letter-spacing:.1em;text-transform:uppercase;color:var(--o-red);border-top-color:var(--o-line)}
  html[data-skin="okto"] .addm{border-radius:10px;padding:6px 6px 6px 14px}
  html[data-skin="okto"] .addm:focus-within{box-shadow:inset 0 0 0 2px var(--o-ink)}
  html[data-skin="okto"] .addm textarea{color:var(--o-well-ink)}
  html[data-skin="okto"] .addm textarea::placeholder{color:var(--o-well-dim)}
  html[data-skin="okto"] .addb{background:var(--o-ink);color:var(--o-bg);border-radius:10px;font-weight:500;box-shadow:inset 0 1px 0 rgba(255,255,255,.35),0 2px 0 var(--o-key-edge),0 8px 18px -8px rgba(0,0,0,.4)}
  html[data-skin="okto"] .addm.busy .addb:after{border-color:rgba(127,127,127,.4);border-top-color:var(--o-bg)}
  html[data-skin="okto"] .addh{font:500 11px var(--o-mono);color:var(--o-muted)}
  html[data-skin="okto"] .empty{color:var(--o-well-dim)}
  html[data-skin="okto"] .empty b{color:var(--o-well-ink)}
  /* Неделя: норма — сплошной столбик, недобор — бледный, перебор — красный */
  html[data-skin="okto"] .wkc .nl{border-top:1px dashed var(--o-well-dim)}
  html[data-skin="okto"] .wkc .nl span{background:var(--o-well);color:var(--o-well-dim);font:500 10px var(--o-mono)}
  html[data-skin="okto"] .wb .col i{max-width:22px;border-radius:2px 2px 0 0;background:var(--o-ghost)}
  html[data-skin="okto"] .wb .col i.ok,html[data-skin="okto"] .wsum .lg i.ok{background:var(--o-well-ink)}
  html[data-skin="okto"] .wb .col i.lo,html[data-skin="okto"] .wsum .lg i.lo{background:var(--o-rest)}
  html[data-skin="okto"] .wb .col i.ov,html[data-skin="okto"] .wsum .lg i.ov{background:var(--o-red)}
  html[data-skin="okto"] .wb small,html[data-skin="okto"] .wb em{font-family:var(--o-mono);color:var(--o-well-dim)}
  html[data-skin="okto"] .wb.sel small,html[data-skin="okto"] .wb.sel em{color:var(--o-well-ink)}
  html[data-skin="okto"] .wb.sel .col i{box-shadow:none;outline:1px solid var(--o-well-ink);outline-offset:2px}
  html[data-skin="okto"] .wsum{border-top-color:rgba(127,127,127,.2);color:var(--o-well-dim)}
  html[data-skin="okto"] .wsum b{color:var(--o-well-ink)}
  html[data-skin="okto"] .wsum .lg i{border-radius:1.5px}
  /* Вес */
  html[data-skin="okto"] .wcard{padding:14px}
  html[data-skin="okto"] .wcard .v b{font:700 30px var(--o-mono);letter-spacing:-.04em;color:var(--o-well-ink)}
  html[data-skin="okto"] .wcard .v small{font:500 12px var(--o-mono);color:var(--o-well-dim)}
  html[data-skin="okto"] .wcard polyline{stroke:var(--o-well-ink)}
  html[data-skin="okto"] .wcard polygon{fill:var(--o-ghost)}
  html[data-skin="okto"] .wcard .wed{font-size:14px}
  html[data-skin="okto"] .wcard .win{border-color:var(--o-ink);background:var(--o-key);font-family:var(--o-mono)}
  html[data-skin="okto"] .fl{color:var(--o-ink);text-shadow:none;font-family:var(--o-mono)}
</style>
</head>
<body>
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><symbol id="i-plate" viewBox="0 0 24 24"><defs><linearGradient id="pl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#DCE3EA"/></linearGradient></defs> <ellipse cx="12" cy="13" rx="10" ry="9" fill="#AFBBC7"/> <ellipse cx="12" cy="12.4" rx="10" ry="9" fill="url(#pl)"/> <ellipse cx="12" cy="12.4" rx="6.6" ry="5.9" fill="#EEF2F6" stroke="#C9D3DD" stroke-width=".6"/> <path d="M8.2 13.6c-.6-2.6 1.2-4.6 3.4-4.4-1 1.4-1.6 2.9-1.5 4.6z" fill="#4CC38A"/> <path d="M10.1 13.8c0-2.6 2.2-4.2 4.3-3.4-1.4 1-2.4 2.2-2.6 3.6z" fill="#2FA36B"/> <circle cx="14.6" cy="13.4" r="1.9" fill="#FF6B4A"/> <circle cx="14.2" cy="12.8" r=".5" fill="#FFB4A3"/> <ellipse cx="11.6" cy="15.2" rx="2.4" ry="1.3" fill="#FFB547"/></symbol><symbol id="i-protein" viewBox="0 0 24 24"><defs><linearGradient id="pr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFB15C"/><stop offset="1" stop-color="#D9662B"/></linearGradient></defs> <path d="M15.2 2.8c3.5 0 6 2.7 6 6 0 4.2-3.9 7.3-8 6.6L10 18.6l-3.2-3.2 3.2-3.2c-.6-4.6 1.6-9.4 5.2-9.4z" fill="url(#pr)"/> <path d="M17.6 5.6c1.2.6 1.9 1.8 1.9 3.1" stroke="#FFD9AE" stroke-width="1.2" stroke-linecap="round" fill="none"/> <path d="M10.6 15.5 7.3 18.8" stroke="#F3E9DA" stroke-width="2.6" stroke-linecap="round"/> <circle cx="5.6" cy="18.4" r="1.9" fill="#F3E9DA" stroke="#C9BBA6" stroke-width=".5"/> <circle cx="7.6" cy="20.4" r="1.9" fill="#F3E9DA" stroke="#C9BBA6" stroke-width=".5"/></symbol><symbol id="i-fat" viewBox="0 0 24 24"><defs><linearGradient id="ft" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE27A"/><stop offset="1" stop-color="#F5A524"/></linearGradient></defs> <path d="M12 2.2c-1 1.8-7.2 8.7-7.2 13.1a7.2 7.2 0 0 0 14.4 0C19.2 10.9 13 4 12 2.2z" fill="url(#ft)"/> <path d="M12 2.2c-1 1.8-7.2 8.7-7.2 13.1a7.2 7.2 0 0 0 14.4 0C19.2 10.9 13 4 12 2.2z" fill="none" stroke="#D98A12" stroke-width=".6"/> <path d="M8.6 15.6a3.4 3.4 0 0 0 3 3.2" stroke="#FFF6CF" stroke-width="1.5" stroke-linecap="round" fill="none"/></symbol><symbol id="i-carbs" viewBox="0 0 24 24"><path d="M12 22.2V8.6" stroke="#C98A1F" stroke-width="2" stroke-linecap="round"/> <g fill="#F7C04A" stroke="#C98A1F" stroke-width=".6"> <path d="M11.6 12.6c-3.4.3-5.8-1.8-6-5 3.3-.2 5.7 1.8 6 5z"/> <path d="M12.4 12.6c3.4.3 5.8-1.8 6-5-3.3-.2-5.7 1.8-6 5z"/> <path d="M11.6 18c-3.4.3-5.8-1.8-6-5 3.3-.2 5.7 1.8 6 5z"/> <path d="M12.4 18c3.4.3 5.8-1.8 6-5-3.3-.2-5.7 1.8-6 5z"/> <path d="M12 9c-2-1.1-2-4.3 0-6.3 2 2 2 5.2 0 6.3z"/> </g> <g fill="#FFE6A3"><ellipse cx="8.4" cy="9.4" rx="1.2" ry=".6" transform="rotate(35 8.4 9.4)"/><ellipse cx="8.4" cy="14.8" rx="1.2" ry=".6" transform="rotate(35 8.4 14.8)"/></g></symbol><symbol id="i-kcal" viewBox="0 0 24 24"><defs><linearGradient id="fl" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#FF3D2E"/><stop offset=".6" stop-color="#FF8A1F"/><stop offset="1" stop-color="#FFC23D"/></linearGradient> <linearGradient id="fi" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#FFB02E"/><stop offset="1" stop-color="#FFF1A8"/></linearGradient></defs> <path d="M12.6 2c.6 3.4-1.3 5-3 6.8C7.8 10.7 6 12.6 6 15.6A6.2 6.2 0 0 0 12 22a6.4 6.4 0 0 0 6-6.6c0-2.6-1.2-4.3-2.3-5.6-.2 1.4-.9 2.4-1.9 2.8.6-4.6-.7-8.3-1.2-10.6z" fill="url(#fl)"/> <path d="M12.2 12.2c.2 1.9-1.3 2.6-2 3.7-.4.6-.6 1.2-.6 1.9A2.6 2.6 0 0 0 12.2 20.6a2.7 2.7 0 0 0 2.6-2.8c0-1.6-1.2-2.5-1.6-3.2-.5.5-.9.6-1.2.5.3-1 .3-2 .2-2.9z" fill="url(#fi)"/></symbol><symbol id="i-scales" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/> <path d="M8 9.2a5.6 5.6 0 0 1 8 0"/> <path d="M12 10.6l1.4-2"/> <circle cx="12" cy="10.8" r="0.4" fill="currentColor"/></g></symbol><symbol id="i-apple" viewBox="0 0 24 24"><g fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8V6.5a3 3 0 0 1 3-3H8"/> <path d="M16 3.5h1.5a3 3 0 0 1 3 3V8"/> <path d="M20.5 16v1.5a3 3 0 0 1-3 3H16"/> <path d="M8 20.5H6.5a3 3 0 0 1-3-3V16"/> <path d="M12 9.3c-1.2-.9-3.9-1.1-4.4 1.9-.4 2.4 1.2 5.4 2.9 5.4.6 0 1-.3 1.5-.3s.9.3 1.5.3c1.7 0 3.3-3 2.9-5.4-.5-3-3.2-2.8-4.4-1.9z"/> <path d="M12 9.3c0-1.3.6-2.2 1.7-2.6"/></g></symbol></defs></svg>
<div class="hero">
  <div class="top">
    <div class="ttl"><b id="dl">Дневник</b><small id="ds">FITTER</small></div>
    <div class="nav"><button id="prev" aria-label="Предыдущий день"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></button><button id="next" aria-label="Следующий день"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg></button><button id="skin"></button><button id="theme" aria-label="Сменить тему"></button><span class="av" id="av"></span></div>
  </div>
  <div id="hero"><div class="load">Загрузка…</div></div>
</div>
<div class="wrap" id="root"></div>
<script>
(function(){
  var tg = window.Telegram && window.Telegram.WebApp;
  if (tg) { tg.ready(); tg.expand();  }

  // Тема: выбор сохраняется на устройстве, по умолчанию — как в Telegram
  var themeBtn = document.getElementById("theme");
  var SUN = '<svg class="ic" style="width:19px;height:19px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>';
  var MOON = '<svg class="ic" style="width:18px;height:18px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';
  // Оформление: новое (прибор в стиле Okto) по умолчанию, классическое с зелёной шапкой — по кнопке. Выбор хранится на устройстве
  var skinBtn = document.getElementById("skin");
  var KEYS = '<svg class="ic" style="width:18px;height:18px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/></svg>';
  var RING = '<svg class="ic" style="width:18px;height:18px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="8" opacity=".35"/><path d="M12 4a8 8 0 0 1 7.6 10.5"/></svg>';
  function OK(){ return document.documentElement.getAttribute("data-skin") === "okto"; }
  function setSkin(s, save){
    document.documentElement.setAttribute("data-skin", s);
    skinBtn.innerHTML = s === "okto" ? RING : KEYS;
    skinBtn.setAttribute("aria-label", s === "okto" ? "Классическое оформление" : "Новое оформление");
    if (save) try { localStorage.setItem("fitter_skin", s); } catch(e){}
  }
  try { setSkin(localStorage.getItem("fitter_skin") === "classic" ? "classic" : "okto", false); } catch(e){ setSkin("okto", false); }

  function savedTheme(){ try { return localStorage.getItem("fitter_theme"); } catch(e){ return null; } }
  function setTheme(t, save){
    document.documentElement.setAttribute("data-theme", t);
    themeBtn.innerHTML = t === "dark" ? SUN : MOON;
    chrome();
    if (save) try { localStorage.setItem("fitter_theme", t); } catch(e){}
  }
  // Цвет шапки и фона Telegram под оформление и тему
  function chrome(){
    var dark = document.documentElement.getAttribute("data-theme") === "dark";
    try {
      if (OK()) { tg.setBackgroundColor(dark ? "#141414" : "#ffffff"); tg.setHeaderColor(dark ? "#141414" : "#ffffff"); }
      else { tg.setBackgroundColor(dark ? "#0c100e" : "#f3f5f2"); tg.setHeaderColor("#5dffad"); }
    } catch(e){}
  }
  var sysTheme = (tg && tg.colorScheme) || (window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  setTheme(savedTheme() || sysTheme, false);
  themeBtn.onclick = function(){
    var el = document.documentElement;
    el.classList.add("tt");
    setTheme(el.getAttribute("data-theme") === "dark" ? "light" : "dark", true);
    tick();
    setTimeout(function(){ el.classList.remove("tt"); }, 350);
  };
  skinBtn.onclick = function(){
    setSkin(OK() ? "classic" : "okto", true);
    chrome(); tick();
    if (state.data) render();
  };

  var initData = tg ? tg.initData : "";
  var MONTHS = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
  var WD = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];
  var WDF = ["понедельник","вторник","среда","четверг","пятница","суббота","воскресенье"];
  var state = { date: null, data: null };
  var root = document.getElementById("root"), hero = document.getElementById("hero");

  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]; }); }
  function r(x){ return Math.round(x); }
  // Число с разрядами: 2 100
  function n(x){ return Math.round(x).toLocaleString("ru-RU"); }
  function kg(x){ return String(x).replace(".", ","); }
  function shift(date, n){ var d = new Date(date + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0,10); }
  function human(date){ var d = new Date(date + "T00:00:00Z"); return d.getUTCDate() + " " + MONTHS[d.getUTCMonth()]; }
  function L(ml){ return String(Math.round(ml / 10) / 100).replace(".", ",") + " л"; }
  function icon(name, style){ return '<svg class="ic"' + (style ? ' style="' + style + '"' : '') + '><use href="#i-' + name + '"/></svg>'; }
  function plural(x, a, b, c){ var m = x % 10, h = x % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c; }

  // ── Детали нового оформления ──
  // Цифры дисплея: под живым числом погашенные «восьмёрки», как на сегментном индикаторе
  function ghost(s){ return String(s).replace(/[0-9]/g, "8"); }
  function dg(s, cls, to){ return '<span class="dg"><span class="gh">' + ghost(s) + '</span><span class="lv' + (cls ? ' ' + cls : '') + '"' + (to !== undefined ? ' data-to="' + to + '">0' : '>' + s) + '</span></span>'; }
  function setDg(el, s){ el.textContent = s; if (el.previousSibling) el.previousSibling.textContent = ghost(s); }
  // Шкала из сегментов; при перерасходе горит красным целиком
  function seg(cnt, frac, red){
    var lit = Math.round(Math.min(1, frac || 0) * cnt), h = '<div class="oseg">';
    for (var i = 0; i < cnt; i++) h += '<i class="' + (i < lit ? (red ? "r" : "on") : "") + '"></i>';
    return h + '</div>';
  }
  // Вода считается стаканами по 250 мл
  var CUP = 250;
  function cupsOf(ml){ return Math.floor(ml / CUP); }
  function cupsGoal(ml){ return Math.max(1, Math.ceil(ml / CUP)); }
  function cupWord(x){ return plural(x, "стакан", "стакана", "стаканов"); }
  function cupCells(wv, wg, cls){
    var all = cupsGoal(wg), on = cupsOf(wv), h = '<div class="' + cls + '" style="--n:' + all + '">';
    for (var i = 0; i < all; i++) h += '<i class="' + (i < on ? "on" : "") + '"></i>';
    return h + '</div>';
  }

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
    if (calm) { el.textContent = n(to); return; }
    var t0 = performance.now(), dur = 1000;
    (function step(now){
      var k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = n(to * e);
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  }
  function once(key){ try { if (localStorage.getItem(key)) return false; localStorage.setItem(key, "1"); } catch(e){} return true; }

  var inflight = 0;
  function call(method, path, body){
    inflight++;
    var done = function(){ inflight--; };
    return fetch(path, { method: method, headers: { "X-Init-Data": initData, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined })
      .then(function(res){ return res.json().then(function(j){ if (!res.ok) throw j; return j; }); })
      .then(function(j){ done(); return j; }, function(e){ done(); throw e; });
  }

  function load(date){
    call("GET", "/api/day" + (date ? "?date=" + date : "")).then(function(d){
      if (state.date !== d.date) state.pillMode = null;
      state.date = d.date; state.data = d; render();
    }).catch(function(e){
      var msg = e && e.error === "no_profile" ? "Сначала пройди анкету в боте: нажми /start" :
                e && e.error === "unauthorized" ? "Открой дневник через кнопку в боте FITTER" : "Не получилось загрузить дневник. Попробуй ещё раз.";
      hero.innerHTML = ""; root.innerHTML = '<div class="err">' + msg + '</div>';
    });
  }

  // Большое кольцо калорий в шапке
  function ring(val, max){
    var R = 88, C = 2 * Math.PI * R, pct = max ? Math.min(1, val / max) : 0;
    var ok = val >= max * 0.9 && val <= max * 1.1, over = val > max * 1.1;
    var share = max ? Math.round(val / max * 100) : 0;
    return '<div class="ring' + (ok ? ' ok' : '') + (over ? ' over' : '') + '"><svg width="204" height="204" viewBox="0 0 204 204">' +
      '<defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop class="s1" offset="0"/><stop class="s2" offset="1"/></linearGradient></defs>' +
      '<circle class="trk" cx="102" cy="102" r="' + R + '" fill="none" stroke-width="14"/>' +
      '<circle class="arc" cx="102" cy="102" r="' + R + '" fill="none" stroke="url(#rg)" stroke-width="14" stroke-linecap="round" stroke-dasharray="' + C + '" stroke-dashoffset="' + C + '" data-off="' + (C * (1 - pct)) + '"/>' +
      (pct > 0.02 ? '<g class="knob" data-rot="' + (pct * 360) + '"><circle cx="' + (102 + R) + '" cy="102" r="8"/></g>' : '') + '</svg>' +
      '<div class="in">' + icon("kcal") + '<b data-to="' + r(val) + '">0</b><small>из ' + n(max) + ' ккал</small><em>' + share + '%</em></div></div>';
  }

  function macro(cls, ic, label, val, max){
    var pct = max ? Math.min(100, val / max * 100) : 0;
    var left = max - val, ok = max && val >= max * 0.9 && val <= max * 1.1;
    var st = !max ? '' : ok ? '<span class="ok">в норме</span>' : left > 0 ? 'ещё ' + r(left) + ' г' : '<span class="ov">+' + r(-left) + ' г</span>';
    if (OK()) return '<div class="mc ' + cls + ' rise"><div class="lb">' + label + '</div>' +
      '<div class="vl">' + dg(r(val), max && val > max * 1.1 ? "r" : "") + '<small>/ ' + max + ' г</small></div>' + seg(10, max ? val / max : 0, max && val > max * 1.1) + '<div class="st" style="margin-top:8px">' + st + '</div></div>';
    return '<div class="mc ' + cls + ' rise"><div class="ib">' + icon(ic) + '</div><div class="lb">' + label + '</div>' +
      '<div class="vl">' + r(val) + '<small> / ' + max + ' г</small></div><div class="bar"><div data-pct="' + pct + '"></div></div><div class="st">' + st + '</div></div>';
  }

  // Подсказка под БЖУ: чего не хватает сильнее всего и чего уже много
  var FOODS = { p: "творог 200 г или куриная грудка 150 г", f: "горсть орехов или ложка масла в салат", c: "порция каши, хлеб или фрукт" };
  var NAMES = { p: "белка", f: "жиров", c: "углеводов" };
  function macroHint(d){
    var t = d.totals, g = d.targets;
    if (!d.meals.length || d.date > d.today) return "";
    var keys = ["p", "f", "c"], over = null, need = null;
    keys.forEach(function(k){
      if (!g[k]) return;
      var k1 = t[k] / g[k];
      if (k1 > 1.1 && (!over || k1 > t[over] / g[over])) over = k;
      if (k1 < 0.9 && (!need || k1 < t[need] / g[need])) need = k;
    });
    var txt, cls = "";
    if (over) { txt = "<b>" + NAMES[over].charAt(0).toUpperCase() + NAMES[over].slice(1) + " уже больше нормы на " + r(t[over] - g[over]) + " г.</b> " + (need ? "А вот " + NAMES[need] + " не хватает " + r(g[need] - t[need]) + " г." : "Остальное в порядке."); cls = " warn"; }
    else if (need && d.date === d.today) txt = "Сильнее всего не хватает " + NAMES[need] + ": <b>добери " + r(g[need] - t[need]) + "&nbsp;г</b>&nbsp;— например, " + FOODS[need] + ".";
    else if (need) txt = "В этот день не хватило " + NAMES[need] + ": " + r(t[need]) + " из " + g[need] + " г.";
    else { txt = "<b>БЖУ в балансе.</b> Белки, жиры и углеводы — все в пределах нормы."; cls = " good"; }
    return '<div class="hint rise' + cls + '">' + txt + '</div>';
  }

  // Неделя: столбики в одном масштабе с линией нормы
  function weekBlock(d){
    var g = d.targets.kcal, days = d.week.filter(function(w){ return w.meals; });
    if (days.length < 2) return "";
    var top = Math.max(g * 1.25, Math.max.apply(null, d.week.map(function(w){ return w.kcal; })));
    var sum = 0, inN = 0;
    days.forEach(function(w){ sum += w.kcal; if (w.kcal >= g * 0.9 && w.kcal <= g * 1.1) inN++; });
    var bars = d.week.map(function(w, i){
      var h = w.meals ? Math.max(4, w.kcal / top * 100) : 0;
      var c = !w.meals ? "" : w.kcal > g * 1.1 ? " ov" : w.kcal >= g * 0.9 ? " ok" : " lo";
      return '<button class="wb' + (w.date === d.date ? " sel" : "") + '" data-date="' + w.date + '"' + (w.date > d.today ? " disabled" : "") + '>' +
        '<span class="col"><i class="' + c + '" data-h="' + h + '"></i></span><small>' + WD[i] + '</small><em>' + (w.meals ? n(w.kcal) : "—") + '</em></button>';
    }).join("");
    return '<h3>Неделя <small>в среднем ' + n(sum / days.length) + ' ккал</small></h3><div class="wkc rise"><div class="bars"><div class="plot"><div class="nl" style="bottom:' + (g / top * 100) + '%"><span>норма ' + n(g) + '</span></div></div>' + bars + '</div>' +
      '<div class="wsum"><span>В норме <b>' + inN + ' из ' + days.length + '</b> ' + (days.length === 1 ? 'дня' : 'дней') + '</span><span class="lg"><i class="ok"></i>норма <i class="lo"></i>меньше <i class="ov"></i>больше</span></div></div>';
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

  // ── Таблетки ──
  var SLOTS = [];
  for (var hh = 0; hh < 24; hh++) { SLOTS.push((hh < 10 ? "0" : "") + hh + ":00"); SLOTS.push((hh < 10 ? "0" : "") + hh + ":30"); }
  function slotSelect(cls){ return '<select class="' + cls + '"><option value="">+ время</option>' + SLOTS.map(function(t){ return '<option>' + t + '</option>'; }).join("") + '</select>'; }

  function pillsBlock(d){
    var doses = d.pills || [], list = d.pillList || [], mode = state.pillMode;
    var taken = doses.filter(function(x){ return x.s === "taken"; }).length;
    var future = d.date > d.today;
    var sub = !list.length ? "Напомню вовремя" : doses.length ? taken + " из " + doses.length + " принято" : "Нет приёмов";
    var btn = mode ? '<button class="pbtn" data-pmode="">Готово</button>' :
      (list.length ? '<button class="pbtn" data-pmode="edit">Изменить</button>' : '<button class="pbtn" data-pmode="add">+ Добавить</button>');
    var h = '<div class="pills rise"><div class="ph"><div class="ib">💊</div><div class="t">Таблетки<small>' + sub + '</small></div>' + btn + '</div>';
    if (mode === "add") {
      var tm = state.ptimes || [];
      h += '<div class="pform"><input id="pname" maxlength="40" placeholder="Название, например: Витамин D"><input id="pdose" maxlength="30" placeholder="Доза, например: 1 таблетка (необязательно)">' +
        '<div class="ptimes">' + tm.map(function(t, i){ return '<span class="chip">' + t + '<b data-prm="' + i + '">×</b></span>'; }).join("") + slotSelect("pslot") + '</div>' +
        '<button class="psave" data-psave="1">Сохранить</button></div>';
    } else if (mode === "edit") {
      h += '<div class="plist">' + list.map(function(p){
        return '<div class="row"><div>' + esc(p.name) + '<small>' + (p.dose ? esc(p.dose) + ' · ' : '') + p.times.join(", ") + '</small></div><button class="x" data-pdel="' + p.id + '">Удалить</button></div>';
      }).join("") + '</div>' + (list.length < 10 ? '<button class="pbtn" style="width:100%;margin-top:8px" data-pmode="add">+ Добавить препарат</button>' : '');
    } else if (!list.length) {
      h += '<div class="phint">Добавь витамины или лекарства, и я напомню в чате, когда их принять.</div>';
    } else if (!doses.length) {
      h += '<div class="phint">На этот день приёмов нет.</div>';
    } else {
      h += '<div class="pbar"><i data-pct="' + Math.round(taken / doses.length * 100) + '"></i></div>' + doses.map(function(x){
        return '<button class="dose ' + x.s + '"' + (future ? ' disabled' : '') + ' data-pmark="' + x.id + '|' + x.time + '|' + x.s + '"><span class="tm">' + x.time + '</span><span class="nm"><span class="pn">' + esc(x.name) + '</span>' +
          '<small>' + (x.dose ? esc(x.dose) : '') + (x.s === "taken" && x.at ? (x.dose ? ' · ' : '') + 'принято в ' + x.at : x.s === "skip" ? (x.dose ? ' · ' : '') + 'пропущено' : '') + '</small></span><span class="ck">' + (x.s === "taken" ? "✓" : "") + '</span></button>';
      }).join("");
    }
    return h + '</div>';
  }

  function rerenderPills(){
    var old = root.querySelector(".pills");
    if (!old) return;
    var tmp = document.createElement("div"); tmp.innerHTML = pillsBlock(state.data);
    var nw = tmp.firstChild; nw.classList.remove("rise");
    old.replaceWith(nw);
    requestAnimationFrame(function(){ requestAnimationFrame(function(){ nw.querySelectorAll("[data-pct]").forEach(function(el){ el.style.width = el.dataset.pct + "%"; }); }); });
  }

  function markDose(btn){
    var parts = btn.dataset.pmark.split("|"), id = parts[0], time = parts[1], was = parts[2];
    var s = was === "taken" ? "" : "taken";
    var dose = (state.data.pills || []).filter(function(x){ return x.id === id && x.time === time; })[0];
    if (!dose) return;
    var prev = { s: dose.s, at: dose.at };
    dose.s = s; dose.at = "";
    var all = state.data.pills.length && state.data.pills.every(function(x){ return x.s === "taken"; });
    rerenderPills();
    if (s === "taken") { if (all) { notify("success"); celebrate(root.querySelector(".pills"), ["💊", "✨", "💜"]); } else haptic("medium"); } else haptic("light");
    call("POST", "/api/pill/mark", { date: state.date, id: id, time: time, s: s })
      .then(function(j){ dose.at = j.at || ""; rerenderPills(); },
            function(){ dose.s = prev.s; dose.at = prev.at; rerenderPills(); notify("error"); });
  }

  function savePill(){
    var name = (document.getElementById("pname").value || "").trim();
    var dose = (document.getElementById("pdose").value || "").trim();
    var times = state.ptimes || [];
    var msg = !name ? "Напиши название препарата" : !times.length ? "Выбери хотя бы одно время приёма" : "";
    if (msg) { haptic("rigid"); if (tg && tg.showAlert) tg.showAlert(msg); else alert(msg); return; }
    call("POST", "/api/pill/add", { date: state.date, name: name, dose: dose, times: times })
      .then(function(){ notify("success"); state.pillMode = null; state.ptimes = []; load(state.date); })
      .catch(function(){ notify("error"); var m = "Не получилось сохранить, попробуй ещё раз"; if (tg && tg.showAlert) tg.showAlert(m); else alert(m); });
  }

  function pillClick(e){
    var t = e.target;
    var rm = t.closest("[data-prm]");
    if (rm) { state.ptimes.splice(Number(rm.dataset.prm), 1); keepForm(); rerenderPills(); restoreForm(); return true; }
    var b = t.closest("button");
    if (!b) return false;
    if (b.dataset.pmode !== undefined) { tick(); state.pillMode = b.dataset.pmode || null; if (state.pillMode === "add") state.ptimes = state.ptimes && state.ptimes.length ? state.ptimes : ["09:00"]; rerenderPills(); var n = document.getElementById("pname"); if (n) n.focus(); return true; }
    if (b.dataset.pmark) { markDose(b); return true; }
    if (b.dataset.psave) { savePill(); return true; }
    if (b.dataset.pdel) {
      var id = b.dataset.pdel; haptic("rigid");
      var go = function(){ call("POST", "/api/pill/delete", { date: state.date, id: id }).then(function(){ notify("warning"); load(state.date); }); };
      if (tg && tg.showConfirm) tg.showConfirm("Удалить препарат и его напоминания?", function(ok){ if (ok) go(); }); else if (confirm("Удалить?")) go();
      return true;
    }
    return false;
  }
  var formDraft = null;
  function keepForm(){ var n = document.getElementById("pname"), d = document.getElementById("pdose"); formDraft = n ? { n: n.value, d: d.value } : null; }
  function restoreForm(){ if (!formDraft) return; var n = document.getElementById("pname"), d = document.getElementById("pdose"); if (n) { n.value = formDraft.n; d.value = formDraft.d; } formDraft = null; }

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
    return '<h3>Вес</h3><div class="wcard rise"><div class="ib">' + icon("scales") + '</div><div class="v"><b>' + kg(last.kg) + ' кг</b><small>' +
      (ws.length > 1 ? (diff > 0 ? "+" : diff < 0 ? "−" : "") + kg(Math.abs(diff)) + " кг с " + human(first.date) : "записан " + human(last.date)) +
      '</small></div>' + spark + '<button class="wed" data-wedit="1" aria-label="Изменить вес">✏️</button></div>';
  }

  // Карандаш у веса: меняем вес за сегодня прямо в дневнике
  function editWeight(btn){
    var card = btn.closest(".wcard"), b = card.querySelector(".v b");
    if (!b || card.querySelector(".win")) return;
    var ws = state.data.weights || [], old = ws.length ? ws[ws.length - 1].kg : "";
    var inp = document.createElement("input");
    inp.className = "win"; inp.type = "number"; inp.inputMode = "decimal"; inp.step = "0.1"; inp.min = "30"; inp.max = "300"; inp.value = old;
    b.replaceWith(inp); inp.focus(); inp.select(); tick();
    var done = false;
    function finish(save){
      if (done) return; done = true;
      var kg = Number(String(inp.value).replace(",", "."));
      if (!save || !kg || kg === old) { render(); return; }
      if (!(kg >= 30 && kg <= 300)) { haptic("rigid"); var m = "Вес — от 30 до 300 кг"; if (tg && tg.showAlert) tg.showAlert(m); else alert(m); render(); return; }
      inp.disabled = true;
      call("POST", "/api/weight", { date: state.date, kg: kg })
        .then(function(){ notify("success"); load(state.date); })
        .catch(function(){ notify("error"); var m2 = "Не получилось сохранить вес, попробуй ещё раз"; if (tg && tg.showAlert) tg.showAlert(m2); else alert(m2); render(); });
    }
    inp.addEventListener("keydown", function(e){ if (e.key === "Enter") finish(true); if (e.key === "Escape") finish(false); });
    inp.addEventListener("blur", function(){ finish(true); });
  }

  // Полоска БЖУ приёма пищи: доля калорий из белков, жиров и углеводов
  function mbar(t){
    var p = t.p * 4, f = t.f * 9, c = t.c * 4, s = p + f + c;
    if (!s) return "";
    return '<div class="mbar"><i class="p" style="flex:' + p + '"></i><i class="f" style="flex:' + f + '"></i><i class="c" style="flex:' + c + '"></i></div>';
  }

  var DOTS = ["#ff7a2f", "#22b36b", "#f5a524", "#2a7bf0", "#c86bff", "#ff5a8a"];

  function render(){
    var d = state.data, t = d.totals, g = d.targets;
    var wdi = (new Date(d.date + "T00:00:00Z").getUTCDay() + 6) % 7;
    document.getElementById("dl").textContent = d.date === d.today ? "Сегодня" : d.date === shift(d.today, -1) ? "Вчера" : human(d.date);
    document.getElementById("ds").textContent = d.date === d.today ? WDF[wdi] + ", " + human(d.date) : WDF[wdi];
    document.getElementById("av").textContent = d.name ? String(d.name).trim().charAt(0).toUpperCase() : "";
    document.getElementById("next").style.visibility = d.date >= d.today ? "hidden" : "visible";

    var week = '<div class="week">' + d.week.map(function(w, i){
      var dot = !w.meals ? "" : w.kcal > g.kcal * 1.1 ? "ov" : w.kcal >= g.kcal * 0.8 ? "ok" : "lo";
      var cls = "wd" + (w.date === d.date ? " sel" : "") + (w.date === d.today ? " today" : "");
      var dis = w.date > d.today ? " disabled" : "";
      return '<button class="' + cls + '" data-date="' + w.date + '"' + dis + '><small>' + WD[i] + '</small><b>' + Number(w.date.slice(8)) + '</b><i class="' + dot + '"></i></button>';
    }).join("") + '</div>';

    var left = g.kcal - t.kcal;
    var days = d.date === d.today && d.streak >= 2 ? d.streak + ' ' + plural(d.streak, 'день', 'дня', 'дней') : '';
    var streak = days ? '<div class="chip">🔥 ' + days + ' подряд</div>' : '';
    if (OK()) {
      // Дисплей калорий: сколько осталось (или перебор красным), линейка из 20 сегментов
      var share = g.kcal ? Math.round(t.kcal / g.kcal * 100) : 0;
      hero.innerHTML = week + '<div class="kw rise"><div class="olr"><span class="olg">' + (left >= 0 ? 'Осталось · ккал' : 'Перебор · ккал') + '</span><span class="ord">норма ' + n(g.kcal) + '</span></div>' +
        '<div class="ro">' + dg(n(Math.abs(left)), left < 0 ? "r" : "", r(Math.abs(left))) + '</div>' + seg(20, g.kcal ? t.kcal / g.kcal : 0, left < 0) +
        '<div class="olr"><span class="olg">Съедено ' + n(t.kcal) + '</span><span class="ord">' + (days ? '🔥 ' + days + ' · ' : '') + share + '%</span></div></div>';
    } else hero.innerHTML = week + '<div class="main">' + ring(t.kcal, g.kcal) +
      '<div class="chips"><div class="chip' + (left < 0 ? ' over' : '') + '">' + (left >= 0 ? 'Осталось ' + n(left) + ' ккал' : 'Больше нормы на ' + n(-left) + ' ккал') + '</div>' + streak + '</div></div>';

    var macros = '<div class="macros">' + macro("p", "protein", "Белки", t.p, g.p) + macro("f", "fat", "Жиры", t.f, g.f) + macro("c", "carbs", "Углеводы", t.c, g.c) + '</div>';

    var wg = d.waterGoal || 2000, wv = d.water || 0;
    var water = OK() ?
      '<div class="water ow rise' + (wv >= wg ? ' done' : '') + '"><div class="olr"><span class="olg">Вода · стаканы по 250 мл</span><span class="ord wl">' + L(wv) + ' из ' + L(wg) + '</span></div>' +
        '<div class="vl">' + dg(String(cupsOf(wv)), "wv") + '<small class="wc">из ' + cupsGoal(wg) + ' ' + cupWord(cupsGoal(wg)) + '<span class="wn">' + (wv >= wg ? ' · норма ✓' : '') + '</span></small></div>' +
        cupCells(wv, wg, "ocup") + '<div class="wbtn"><button data-w="-250">− стакан</button><button class="add" data-w="250">+ стакан</button></div></div>' :
      '<div class="water rise' + (wv >= wg ? ' done' : '') + '">' + glass(wv / wg) +
      '<div class="wt"><div class="lb">Вода</div><b class="wv">' + cupsOf(wv) + ' из ' + cupsGoal(wg) + '</b> <small class="wc">' + cupWord(cupsGoal(wg)) + '</small><br><small class="wl">' + L(wv) + ' из ' + L(wg) + '</small><small class="wn">' + (wv >= wg ? ' · норма ✓' : '') + '</small>' +
        cupCells(wv, wg, "cups") + '</div>' +
      '<div class="wbtn"><button class="add" data-w="250">+ стакан</button><button data-w="-250">− стакан</button></div></div>';

    var total = d.meals.reduce(function(a, m){ return a + m.totals.kcal; }, 0);
    var add = d.date <= d.today ? '<div class="addm rise"><textarea id="addt" rows="1" maxlength="500" enterkeyhint="send" placeholder="Что съел? Например: 2 яйца и тост"></textarea><button class="addb" id="addb" aria-label="Добавить еду">+</button></div>' +
      '<div class="addh">ИИ посчитает калории и БЖУ' + (d.date !== d.today ? ' · запишу на ' + human(d.date) : '') + '</div>' : '';
    var meals = (d.meals.length ? '<h3>Приёмы пищи <small>' + d.meals.length + ' · ' + n(total) + ' ккал</small></h3>' : '<h3>Приёмы пищи</h3>') + add + (d.meals.length ? d.meals.map(function(m, mi){
      return '<div class="meal rise" data-id="' + m.id + '" style="animation-delay:' + (0.05 * mi + 0.1) + 's"><div class="hd"><div class="ib">' + icon("plate") + '</div><div class="t">' + esc(m.title) + '<small>' + esc(m.time) + (total ? ' · ' + r(m.totals.kcal / total * 100) + '% дня' : '') + ' · Б ' + r(m.totals.p) + ' · Ж ' + r(m.totals.f) + ' · У ' + r(m.totals.c) + '</small></div><div class="k">' + r(m.totals.kcal) + ' ккал</div></div>' + mbar(m.totals) +
        m.items.map(function(it, i){
          return '<div class="it"><i class="dot" style="background:' + DOTS[i % DOTS.length] + '"></i><div class="n"><div class="nm" data-meal="' + m.id + '" data-idx="' + i + '">' + esc(it.name) + '</div><small>' + r(it.totals.kcal) + ' ккал · Б ' + r(it.totals.p) + ' · Ж ' + r(it.totals.f) + ' · У ' + r(it.totals.c) + '</small></div>' +
            '<div class="gr"><input type="number" inputmode="numeric" min="1" max="3000" value="' + it.grams + '" data-meal="' + m.id + '" data-idx="' + i + '"><span class="g">г</span></div></div>';
        }).join("") +
        '<button class="del" data-del="' + m.id + '">Удалить приём пищи</button></div>';
    }).join("") : '<div class="empty rise"><div class="ib">' + icon("plate") + '</div><b>Здесь пока пусто</b>' + (add ? 'Напиши выше, что ты съел, или отправь боту фото еды 📸' : 'Отправь боту фото еды, и оно появится в дневнике 📸') + '</div>');

    root.innerHTML = macros + macroHint(d) + water + pillsBlock(d) + meals + weekBlock(d) + weightBlock(d.weights);
    animateIn();
  }

  function animateIn(){
    var d = state.data, t = d.totals, g = d.targets;
    requestAnimationFrame(function(){ requestAnimationFrame(function(){
      document.querySelectorAll("[data-pct]").forEach(function(el){ el.style.width = el.dataset.pct + "%"; });
      document.querySelectorAll("[data-h]").forEach(function(el){ el.style.height = el.dataset.h + "%"; });
      document.querySelectorAll("[data-off]").forEach(function(el){ el.setAttribute("stroke-dashoffset", el.dataset.off); });
      document.querySelectorAll("[data-rot]").forEach(function(el){ el.style.transform = "rotate(" + el.dataset.rot + "deg)"; });
      document.querySelectorAll("[data-to]").forEach(function(el){ countUp(el, Number(el.dataset.to)); });
    }); });
    if (state.flash) {
      var nm = root.querySelector('[data-id="' + state.flash + '"]');
      if (nm) { nm.classList.add("pop"); nm.scrollIntoView({ behavior: "smooth", block: "center" }); }
      state.flash = null;
    }
    if (d.date === d.today && d.meals.length && t.kcal >= g.kcal * 0.9 && t.kcal <= g.kcal * 1.1 && once("fx-kcal-" + d.date)) {
      setTimeout(function(){ celebrate(hero.querySelector(".ring, .kw"),["✨", "🥦", "🍏"]); notify("success"); }, 1100);
    }
  }

  function waterUI(){
    var d = state.data, wg = d.waterGoal || 2000, wv = d.water || 0, card = root.querySelector(".water");
    if (!card) return;
    var c = cupsOf(wv), lvl = card.querySelector(".lvl");
    if (OK()) setDg(card.querySelector(".wv"), String(c)); else card.querySelector(".wv").textContent = c + " из " + cupsGoal(wg);
    card.querySelector(".wl").textContent = L(wv) + " из " + L(wg);
    card.querySelector(".wn").textContent = wv >= wg ? " · норма ✓" : "";
    card.querySelectorAll(".cups i, .ocup i").forEach(function(el, i){ el.className = i < c ? "on" : ""; });
    if (lvl) lvl.style.transform = "translateY(" + (74 - 66 * Math.min(1, wv / wg)) + "px)";
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

  // Запись еды текстом прямо в дневнике
  function addMeal(){
    var ta = document.getElementById("addt"), btn = document.getElementById("addb");
    if (!ta) return;
    var box = ta.parentNode, v = ta.value.trim();
    if (box.classList.contains("busy")) return;
    if (v.length < 2) { haptic("rigid"); ta.focus(); return; }
    box.classList.add("busy"); ta.disabled = true; btn.disabled = true; ta.blur(); haptic("medium");
    call("POST", "/api/meal/add", { date: state.date, text: v })
      .then(function(j){ notify("success"); state.flash = j.id; load(state.date); })
      .catch(function(err){
        box.classList.remove("busy"); ta.disabled = false; btn.disabled = false; notify("error");
        var msg = err && err.error === "limit" ? "На сегодня лимит запросов к нейросети закончился" :
                  err && err.error === "not_food" ? (err.answer ? String(err.answer).slice(0, 220) : "Не похоже на еду. Напиши, что ты съел, например: гречка 150 г и котлета") :
                  "Не получилось посчитать, попробуй ещё раз";
        if (tg && tg.showAlert) tg.showAlert(msg); else alert(msg);
      });
  }
  function grow(ta){ ta.style.height = "auto"; ta.style.height = Math.min(120, ta.scrollHeight) + "px"; }

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
    if (e.target.closest(".pills")) { pillClick(e); return; }
    var nm = e.target.closest(".nm");
    if (nm) { rename(nm); return; }
    var b = e.target.closest("button");
    if (!b) return;
    if (b.id === "addb") { addMeal(); return; }
    if (b.dataset.wedit) { editWeight(b); return; }
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
  root.addEventListener("input", function(e){ if (e.target.id === "addt") grow(e.target); });
  root.addEventListener("keydown", function(e){ if (e.target.id === "addt" && e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addMeal(); } });
  hero.addEventListener("click", onClick);
  root.addEventListener("change", function(e){
    var inp = e.target;
    if (inp.classList && inp.classList.contains("pslot")) {
      if (inp.value && state.ptimes.indexOf(inp.value) < 0 && state.ptimes.length < 6) { state.ptimes.push(inp.value); state.ptimes.sort(); }
      keepForm(); rerenderPills(); restoreForm(); return;
    }
    if (!inp.dataset.meal) return;
    var g = Number(inp.value);
    if (!(g > 0 && g <= 3000)) { load(state.date); return; }
    call("POST", "/api/item/edit", { date: state.date, mealId: inp.dataset.meal, idx: Number(inp.dataset.idx), grams: g })
      .then(function(){ notify("success"); load(state.date); });
  });
  document.getElementById("prev").onclick = function(){ if (state.date) { tick(); load(shift(state.date, -1)); } };
  document.getElementById("next").onclick = function(){ if (state.date) { tick(); load(shift(state.date, 1)); } };

  // Синхронизация с чатом: отметки таблеток, вода и записи из бота появляются без перезапуска дневника
  function sync(){
    var a = document.activeElement;
    if (!state.data || inflight || state.pillMode || document.hidden) return;
    if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT")) return;
    var date = state.date, was = state.data;
    call("GET", "/api/day?date=" + date).then(function(d){
      if (inflight || state.pillMode || state.date !== date || state.data !== was) return;
      var pk = function(x){ return JSON.stringify([x.pills, x.pillList]); };
      var rest = function(x){ return JSON.stringify([x.meals, x.totals, x.targets, x.weights, x.today]); };
      if (rest(d) !== rest(was)) { state.data = d; render(); return; }
      state.data = d;
      if (d.water !== was.water) waterUI();
      if (pk(d) !== pk(was)) rerenderPills();
    }, function(){});
  }
  // Раз в 20 секунд: каждый опрос — около 9 чтений из KV, чаще выходит дорого
  setInterval(sync, 20000);
  document.addEventListener("visibilitychange", function(){ if (!document.hidden) sync(); });
  window.addEventListener("focus", sync);
  if (tg && tg.onEvent) { try { tg.onEvent("activated", sync); } catch(e){} }

  load(null);
})();
</script>
</body>
</html>`;

// Для тестов
export const _test = { checkAiLimit, appHeaders, waterTick, pillTick, parsePill, nextSlot, slotOf, adviceText, weekTip, startSource, statsText, spark, ACHIEVEMENTS, baseEmoji, calcTargets, verifyInitData, cleanItems, sumItems, parseFix, parseWater, cleanBarcode, waterGoal, APP_HTML };
