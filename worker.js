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

// ───────────────────────────── Язык ─────────────────────────────
// u.lang = "en" | "ru". Поля нет — человек из версии до перевода, ему остаётся русский.
// Новым пользователям язык выбирается по языку Telegram, сменить можно в /lang, в дневнике и в приложении.
const langOf = (u) => (u && u.lang === "en" ? "en" : "ru");
const L = (u, ru, en) => (langOf(u) === "en" ? en : ru);
const aiLang = (u) => L(u, "Russian", "English");
const guessLang = (from) => (/^(ru|be|kk)\b/i.test((from && from.language_code) || "") ? "ru" : "en");
const dayWord = (u, n) => L(u, plural(n, "день", "дня", "дней"), n === 1 ? "day" : "days");
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
        const who = update.message?.from?.id || update.callback_query?.from?.id;
        ctx.waitUntil(
          handleUpdate(update, E)
            .catch((e) => console.error("update error:", e && e.stack ? e.stack : e))
            .then(() => live(E, who)),
        );
        return new Response("ok");
      }
      if (url.pathname === "/setup") return await setup(request, E);
      if (url.pathname === "/app") {
        return new Response(APP_HTML, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache", ...(await appHeaders()) } });
      }
      if (url.pathname.startsWith("/api/")) {
        const res = await api(request, url, E);
        // Изменение из приложения или дневника — сразу рассылаем открытым приложениям
        if (request.method === "POST" && E.liveUid && res.status < 400) ctx.waitUntil(live(E, E.liveUid));
        return res;
      }
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
    // В воскресенье с 17:30 до 21:30 UTC каждый запуск «*/30» добирает тех, кому не хватило лимита основного разбора в 17:00
    const at = new Date(event.scheduledTime || Date.now());
    const resume = at.getUTCDay() === 0 && at.getUTCHours() >= 17 && at.getUTCHours() < 22 && !(at.getUTCHours() === 17 && at.getUTCMinutes() === 0);
    const job = /^0 17 /.test(event.cron || "") ? weeklyRun(env) : Promise.all([waterTick(env), pillTick(env), resume ? weeklyRun(env) : null]);
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

// Свои иконки FITTER: бот создаёт набор «FITTER» в аккаунте того, кто отправил /makeemoji
// Все иконки цветные и весёлые, в одном стиле: объёмный градиент, белый блик, мягкая тень
// Картинки 100×100 рисует tools/emoji/build.mjs, они лежат в репозитории в папке icons/fun/
const ICON_BASE = "https://raw.githubusercontent.com/sailxx/fitter-ai/main/icons/";
const ICON_SETS = [
  {
    suffix: "fun", title: "FITTER", repaint: false, folder: "fun/",
    // файл, эмодзи для набора, какой эмодзи в боте заменить, версия картинки (если её перерисовали)
    icons: [
      // еда и БЖУ
      ["plate", "🍽", "🍽"], ["protein", "🍗", "🥩"], ["fat", "🧈", "🧈"], ["carbs", "🍞", "🍞"], ["kcal", "🔥", "🔥"],
      ["logo", "🍏", "🍏", 2], ["salad", "🥗", "🥗"], ["broccoli", "🥦", "🥦"],
      // тело и активность
      ["scales", "⚖️", "⚖"], ["sofa", "🛋", "🛋"], ["walk", "🚶", "🚶"], ["run", "🏃", "🏃"], ["muscle", "💪", "💪"], ["lose", "📉", "📉"],
      ["ruler", "📏", "📏"], ["cake", "🎂", "🎂"], ["man", "👨", "👨"], ["woman", "👩", "👩"],
      // вода, таблетки, напоминания
      ["water", "💧", "💧"], ["pill", "💊", "💊"], ["alarm", "⏰", "⏰"], ["bell", "🔔", "🔔"], ["bellOff", "🔕", "🔕"], ["timer", "⏱️", "⏱"],
      // итоги, время, награды
      ["chart", "📊", "📊"], ["calendar", "📅", "📅"], ["sunrise", "🌅", "🌅"], ["moon", "🌙", "🌙"], ["hundred", "💯", "💯"],
      ["trophy", "🏆", "🏆"], ["star", "⭐", "⭐"], ["goal", "🎯", "🎯"],
      // интерфейс
      ["barcode", "📦", "📦"], ["diary", "📱", "📱"], ["book", "📓", "📓"], ["note", "📝", "📝"], ["brain", "🧠", "🧠"], ["ask", "💬", "💬"],
      ["lock", "🔒", "🔒"], ["photo", "📷", "📷"], ["camera", "📸", "📸"], ["search", "🔍", "🔍"], ["write", "✍️", "✍"], ["edit", "✏️", "✏"],
      ["trash", "🗑", "🗑"], ["tip", "💡", "💡"], ["check", "✅", "✅"], ["cross", "❌", "❌"], ["plus", "➕", "➕"], ["refresh", "🔄", "🔄"],
      ["undo", "↩️", "↩"], ["skip", "⏭", "⏭"], ["sparkles", "✨", "✨"], ["keyboard", "⌨️", "⌨"], ["party", "🎉", "🎉"],
      ["profile", "👤", "👤"], ["help", "❓", "❓"], ["down", "👇", "👇"],
      // смайлики
      ["hello", "👋", "👋"], ["think", "🤔", "🤔"], ["sad", "😔", "😔"], ["shrug", "🤷", "🤷"], ["ok", "👌", "👌"], ["heart", "🙏", "🙏"],
      // цифры и квадратики шкал
      ["num1", "1️⃣", "1️⃣"], ["num2", "2️⃣", "2️⃣"], ["num3", "3️⃣", "3️⃣"], ["num4", "4️⃣", "4️⃣"],
      ["sq_green", "🟩", "🟩"], ["sq_blue", "🟦", "🟦"], ["sq_red", "🟥", "🟥"], ["sq_empty", "⬜", "⬜"],
    ],
  },
];
// Наборы прошлых версий — удаляются после того, как новый набор готов
const OLD_SETS = ["fitter", "fitter_ui", "fitter_icons", "fitter_food"];
// createNewStickerSet принимает не больше 50 иконок, остальные добавляются по одной
const SET_FIRST = 50;

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
      needs_repainting: cfg.repaint, stickers: cfg.icons.slice(0, SET_FIRST).map(sticker),
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
  await send(env, chatId, "🔄 Создаю набор иконок FITTER…");
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
  // Новый набор подключён — наборы прошлых версий больше не нужны
  for (const o of OLD_SETS) await tgRaw(env, "deleteStickerSet", { name: `${o}_by_${me.result.username}` });
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

function mainKb(u) {
  return {
    keyboard: L(u,
      [[{ text: "📊 Сегодня" }, { text: "📅 Неделя" }], [{ text: "👤 Профиль" }, { text: "❓ Помощь" }]],
      [[{ text: "📊 Today" }, { text: "📅 Week" }], [{ text: "👤 Profile" }, { text: "❓ Help" }]]),
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: L(u, "Отправь фото еды или задай вопрос", "Send a photo of food or ask a question"),
  };
}

function appButton(env, u, ru = "📱 Открыть дневник", en = "📱 Open diary") {
  return { text: L(u, ru, en), web_app: { url: `${env.ORIGIN}/app` } };
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
  const u = await getUser(env, id);
  const keys = [
    `u:${id}`, `w:${id}`, `adv:${id}`, `wo:${id}`,
    ...((u && u.apps) || []).map((a) => `tk:${a.h}`),
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
const MONTHS = {
  ru: ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};
const WEEKDAYS = {
  ru: ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
};
function humanDate(date, u) {
  const d = new Date(date + "T00:00:00Z");
  return L(u, `${d.getUTCDate()} ${MONTHS.ru[d.getUTCMonth()]}`, `${MONTHS.en[d.getUTCMonth()]} ${d.getUTCDate()}`);
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

// ── Микронутриенты: на 100 г продукта хранятся в it.mi, ключ → [название ru, название en, единица, максимум на 100 г, суточная норма]
const MICRO = {
  fiber: ["Клетчатка", "Fiber", "g", 60, 28],
  sugar: ["Сахар", "Sugar", "g", 100, 50],
  satfat: ["Насыщенные жиры", "Saturated fat", "g", 100, 20],
  cholesterol: ["Холестерин", "Cholesterol", "mg", 3000, 300],
  sodium: ["Натрий", "Sodium", "mg", 40000, 2300],
  potassium: ["Калий", "Potassium", "mg", 5000, 3400],
  calcium: ["Кальций", "Calcium", "mg", 3000, 1000],
  iron: ["Железо", "Iron", "mg", 100, 14],
  magnesium: ["Магний", "Magnesium", "mg", 1000, 400],
  zinc: ["Цинк", "Zinc", "mg", 100, 11],
  vitc: ["Витамин C", "Vitamin C", "mg", 3000, 90],
  vita: ["Витамин A", "Vitamin A", "µg", 30000, 900],
  vitd: ["Витамин D", "Vitamin D", "µg", 300, 15],
  b12: ["Витамин B12", "Vitamin B12", "µg", 300, 2.4],
};
const MICRO_KEYS = Object.keys(MICRO);

// Микронутриенты порции или набора продуктов: { ключ: количество }; null — данных нет (старые записи)
function sumMicro(items) {
  const out = {};
  let any = false;
  for (const it of items) {
    if (!it.mi) continue;
    any = true;
    for (const k of MICRO_KEYS) out[k] = (out[k] || 0) + (it.mi[k] || 0) * (it.grams / 100);
  }
  return any ? out : null;
}
const microNum = (v) => (v >= 100 ? String(round(v)) : String(r1(v)));

const ACTIVITY = {
  "1.2": ["🛋 Почти не двигаюсь", "🛋 Barely move"],
  "1.375": ["🚶 1–3 тренировки в неделю", "🚶 1–3 workouts a week"],
  "1.55": ["🏃 3–5 тренировок в неделю", "🏃 3–5 workouts a week"],
  "1.725": ["🔥 6–7 тренировок в неделю", "🔥 6–7 workouts a week"],
};
const GOALS = {
  lose: ["📉 Похудеть", "📉 Lose weight"],
  keep: ["⚖️ Держать вес", "⚖️ Maintain weight"],
  gain: ["💪 Набрать массу", "💪 Gain muscle"],
};
const activityText = (u, k) => L(u, ACTIVITY[k][0], ACTIVITY[k][1]);
const goalText = (u, k) => L(u, GOALS[k][0], GOALS[k][1]);

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
    name: { type: "STRING", description: "Product or dish name, short, in the requested language" },
    grams: { type: "NUMBER", description: "Approximate portion weight in grams" },
    kcal_100: { type: "NUMBER", description: "Calories per 100 g" },
    protein_100: { type: "NUMBER", description: "Protein per 100 g" },
    fat_100: { type: "NUMBER", description: "Fat per 100 g" },
    carbs_100: { type: "NUMBER", description: "Carbs per 100 g" },
    usda_query: { type: "STRING", description: "English USDA FoodData Central search phrase for this single, simple food as eaten, for example “chicken breast, roasted, cooked” or “rice, white, cooked”. Empty string for mixed dishes, soups, sandwiches and branded products" },
    micro_100: {
      type: "OBJECT",
      description: "Micronutrients per 100 g of this product as eaten. Fill ONLY when usda_query is empty: for foods with a usda_query the values come from USDA, so omit this field",
      properties: {
        fiber: { type: "NUMBER", description: "Dietary fiber, g" },
        sugar: { type: "NUMBER", description: "Total sugars, g" },
        satfat: { type: "NUMBER", description: "Saturated fat, g" },
        cholesterol: { type: "NUMBER", description: "mg" },
        sodium: { type: "NUMBER", description: "mg" },
        potassium: { type: "NUMBER", description: "mg" },
        calcium: { type: "NUMBER", description: "mg" },
        iron: { type: "NUMBER", description: "mg" },
        magnesium: { type: "NUMBER", description: "mg" },
        zinc: { type: "NUMBER", description: "mg" },
        vitc: { type: "NUMBER", description: "Vitamin C, mg" },
        vita: { type: "NUMBER", description: "Vitamin A, µg RAE" },
        vitd: { type: "NUMBER", description: "Vitamin D, µg" },
        b12: { type: "NUMBER", description: "Vitamin B12, µg" },
      },
    },
  },
  required: ["name", "grams", "kcal_100", "protein_100", "fat_100", "carbs_100"],
};

const PHOTO_SCHEMA = {
  type: "OBJECT",
  properties: {
    is_food: { type: "BOOLEAN" },
    title: { type: "STRING", description: "Short name of the meal, for example “Buckwheat with chicken”, in the requested language" },
    items: { type: "ARRAY", items: ITEM_SCHEMA },
    comment: { type: "STRING", description: "One short useful note about the dish, in the requested language" },
    is_package: { type: "BOOLEAN", description: "The photo shows a store-bought product package" },
    label_found: { type: "BOOLEAN", description: "A nutrition facts table is readable on the package" },
    barcode: { type: "STRING", description: "Barcode digits if visible under the barcode, otherwise an empty string" },
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

const photoPrompt = (u) => `You are a nutritionist assistant in the FITTER app. Look at the photo.
If there is no food or drink in the photo, return is_food=false and an empty items.
If there is food, list every separate product or dish in the photo.
For each one estimate the portion weight in grams from the size of the plate, cutlery and packaging,
and give typical calories, protein, fat and carbs PER 100 GRAMS.
Don't split a dish too finely: soup, salad, a sandwich are one item.
If the photo shows a product package (yogurt, bar, pack, bottle): is_package=true, one item with the product name and brand.
If a nutrition facts table is visible, copy the per-100 g values exactly from the label (label_found=true).
If the label shows values per serving rather than per 100 g, convert them to 100 g.
grams is the net weight from the package; if it is not visible, the typical weight of such a package.
If digits are visible under a barcode, copy them into barcode without spaces, otherwise leave barcode empty.
Accuracy rules:
• Take per-100 g values from reliable references (USDA FoodData Central, manufacturer labels) for the dish exactly as eaten: cooked, not raw, unless it is clearly raw.
• Count hidden calories: cooking oil, butter, sauces, dressings, sugar in drinks, cheese on top. Fried and creamy dishes are far denser than boiled or grilled ones.
• Estimate weight with scale cues: a standard dinner plate is about 26 cm, a fork about 19 cm, a hand-sized portion of meat about 100–120 g. Weigh cooked food, not dry.
• Calories must match macros: kcal_100 ≈ 4·protein + 9·fat + 4·carbs (alcohol 7 per gram adds on top).
• For each simple single food fill usda_query with an English USDA FoodData Central search phrase for it as eaten (“chicken breast, roasted, cooked”, “rice, white, cooked”); leave it empty for mixed dishes, soups, sandwiches and branded products. Values from USDA replace your per-100 g numbers, so the name and the weight must be right.
• Fill micro_100 (fiber, sugars, saturated fat, cholesterol, sodium, potassium, calcium, iron, magnesium, zinc, vitamins C, A, D, B12 per 100 g) ONLY for items with an empty usda_query; omit it when usda_query is set, to keep the answer short.
Write names and comments in ${aiLang(u)}, short. Be realistic, neither under- nor overestimate.`;

const textPrompt = (u) => `You are a friendly nutritionist assistant in the FITTER Telegram bot. Write in ${aiLang(u)}.
Decide what the user sent:
• food_log — they say what they ate or drank (for example “ate 2 eggs and toast”, “drank a 300 ml latte”).
  Then fill items: products, weight in grams (estimate if not given), calories/protein/fat/carbs per 100 g; title is a short name;
  answer is one short phrase.
• question — a question about nutrition, calories, food, sports, a healthy lifestyle.
  Then answer clearly and briefly in answer (up to 700 characters), without markdown, emoji are fine.
  Take the user's data below into account where appropriate. Do not diagnose; for health problems advise seeing a doctor.
• other — everything else. In answer politely remind that you help with nutrition and they can send a photo of food.
For food_log: fill usda_query (English USDA FoodData Central phrase for a simple food as eaten, empty for mixed dishes); calories must match macros (kcal ≈ 4·protein + 9·fat + 4·carbs), count cooking oil and sauces, weigh cooked food, and fill micro_100 (fiber, sugars, saturated fat, cholesterol, sodium, potassium, calcium, iron, magnesium, zinc, vitamins C, A, D, B12 per 100 g).
For question and other return empty items and an empty title.`;

const noThinkingParam = new Set(); // модели, которые отвергли thinkingConfig
let lastModelUsed = null;
let workingModel = null; // модель, которая ответила в прошлый раз (чтобы не тратить время на недоступные)

// Cloudflare даёт фоновой задаче ~30 секунд, поэтому укладываемся в 24
const AI_DEADLINE_MS = 24000;

async function gemini(env, parts, schema, temperature = 0.2) {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY не задан");
  const started = Date.now();
  if (!workingModel && env.DB) workingModel = await env.DB.get("cfg:model").catch(() => null);
  const models = [...new Set([env.GEMINI_MODEL, workingModel, ...MODEL_FALLBACKS].filter(Boolean))];
  // Размышления модели — главная причина медленного ответа: для подсчёта еды они почти не нужны, просим минимум.
  // Если модель параметр не принимает, запоминаем это и повторяем запрос без него
  const bodyFor = (model) => JSON.stringify({
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature, responseMimeType: "application/json", responseSchema: schema,
      ...(noThinkingParam.has(model) ? {} : { thinkingConfig: { thinkingLevel: "minimal" } }),
    },
  });
  let lastErr = null;
  for (let mi = 0; mi < models.length; mi++) {
    const model = models[mi];
    const body = bodyFor(model);
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
    if (r.status === 400 && /thinking/i.test(errText) && !noThinkingParam.has(model)) {
      noThinkingParam.add(model);
      mi--; // та же модель, но без thinkingConfig
      continue;
    }
    if (model === workingModel) workingModel = null;
    // Модель не найдена / лимит / сбой — пробуем следующую. Неверный ключ — нет смысла пробовать дальше.
    if (![404, 429, 500, 503].includes(r.status)) break;
  }
  throw lastErr || new Error("Gemini: не успели получить ответ");
}

// Калории должны сходиться с макросами (Этуотер: 4·Б + 9·Ж + 4·У). Нейросеть часто ошибается именно в калориях
// отдельно от БЖУ, поэтому при расхождении больше 15% калории берём по макросам. trust — данные с этикетки или из базы, их не трогаем
const ATWATER_TOLERANCE = 0.15;
function reconcile(it) {
  let { protein_100: p, fat_100: f, carbs_100: c, kcal_100: k } = it;
  const mass = p + f + c;
  // БЖУ на 100 г не могут весить больше 100 г
  if (mass > 100) { const s = 100 / mass; p = r1(p * s); f = r1(f * s); c = r1(c * s); }
  const est = 4 * p + 9 * f + 4 * c;
  if (est >= 10 && Math.abs(k - est) / est > ATWATER_TOLERANCE) k = round(est);
  return { ...it, protein_100: p, fat_100: f, carbs_100: c, kcal_100: r1(k) };
}

function cleanItems(items, { trust = false } = {}) {
  const num = (x, max) => {
    const n = Number(x);
    return Number.isFinite(n) ? Math.min(Math.max(n, 0), max) : 0;
  };
  return (Array.isArray(items) ? items : [])
    .map((it) => {
      const base = {
        name: String(it.name || "Продукт").trim().slice(0, 60),
        grams: Math.max(1, round(num(it.grams, 3000))),
        kcal_100: r1(num(it.kcal_100, 900)),
        protein_100: r1(num(it.protein_100, 100)),
        fat_100: r1(num(it.fat_100, 100)),
        carbs_100: r1(num(it.carbs_100, 100)),
      };
      const uq = String(it.usda_query || "").trim().slice(0, 80);
      if (uq) base.usda = uq;
      const src = it.mi || it.micro_100;
      if (src && typeof src === "object") {
        const mi = {};
        for (const k of MICRO_KEYS) {
          const v = num(src[k], MICRO[k][3]);
          if (v > 0) mi[k] = r1(v);
        }
        if (Object.keys(mi).length) base.mi = mi;
      }
      return trust ? base : reconcile(base);
    })
    .slice(0, 12);
}

// ───────────────────────────── USDA FoodData Central ─────────────────────────────
// Нейросеть оценивает вес порции и называет продукт, а питательность на 100 г берём из базы USDA:
// это измеренные значения, а не память модели. Нужен бесплатный ключ USDA_API_KEY (секрет Cloudflare, https://fdc.nal.usda.gov/api-key-signup);
// без ключа или если продукт не нашёлся, остаются значения нейросети.

const USDA_URL = "https://api.nal.usda.gov/fdc/v1/foods/search";
const USDA_TIMEOUT_MS = 2500;
// Номера нутриентов в USDA → наши поля (на 100 г)
const USDA_IDS = {
  1003: "protein_100", 1004: "fat_100", 1005: "carbs_100",
  1079: "fiber", 2000: "sugar", 1258: "satfat", 1253: "cholesterol", 1093: "sodium", 1092: "potassium",
  1087: "calcium", 1089: "iron", 1090: "magnesium", 1095: "zinc", 1162: "vitc", 1106: "vita", 1114: "vitd", 1178: "b12",
};

// Ответ поиска USDA → { kcal_100, protein_100, fat_100, carbs_100, mi } или null
function parseUsda(json) {
  const food = (json && json.foods || [])[0];
  if (!food) return null;
  const out = { mi: {}, name: String(food.description || "") };
  const by = {};
  for (const n of food.foodNutrients || []) by[n.nutrientId] = Number(n.value);
  // Энергия: у Foundation-продуктов бывает только расчётная (2047 / 2048)
  const kcal = [1008, 2047, 2048].map((id) => by[id]).find((v) => Number.isFinite(v));
  if (!Number.isFinite(kcal)) return null;
  out.kcal_100 = kcal;
  for (const [id, key] of Object.entries(USDA_IDS)) {
    const v = by[id];
    if (!Number.isFinite(v)) continue;
    if (key.endsWith("_100")) out[key] = v; else out.mi[key] = v;
  }
  if (out.protein_100 === undefined || out.fat_100 === undefined || out.carbs_100 === undefined) return null;
  return out;
}

async function lookupUsda(env, query) {
  const q = String(query || "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 80);
  if (!env.USDA_API_KEY || q.length < 2) return null;
  const key = `usda:${q}`;
  const cached = await env.DB.get(key, "json").catch(() => null);
  if (cached) return cached.miss ? null : cached;
  let found = null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), USDA_TIMEOUT_MS);
    const url = `${USDA_URL}?query=${encodeURIComponent(q)}&dataType=${encodeURIComponent("Foundation,SR Legacy")}&pageSize=1&api_key=${encodeURIComponent(env.USDA_API_KEY)}`;
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) return null; // лимит или сбой: не кэшируем
    found = parseUsda(await r.json());
  } catch (e) {
    console.error("usda lookup:", e && e.message);
    return null;
  }
  await env.DB.put(key, JSON.stringify(found || { miss: true }), { expirationTtl: found ? 30 * 86400 : 86400 }).catch(() => {});
  return found;
}

// Подменяет питательность продуктов значениями USDA. Продукты без запроса (сложные блюда) и ненайденные остаются как есть
async function applyUsda(env, items) {
  if (!env.USDA_API_KEY) { for (const it of items) delete it.usda; return items; }
  await Promise.all(items.map(async (it) => {
    const q = it.usda;
    delete it.usda;
    if (!q) return;
    const u = await lookupUsda(env, q);
    if (!u) return;
    it.kcal_100 = r1(u.kcal_100);
    it.protein_100 = r1(u.protein_100);
    it.fat_100 = r1(u.fat_100);
    it.carbs_100 = r1(u.carbs_100);
    const mi = {};
    for (const k of MICRO_KEYS) { const v = Math.min(u.mi[k] || 0, MICRO[k][3]); if (v > 0) mi[k] = r1(v); }
    if (Object.keys(mi).length) it.mi = mi; else delete it.mi;
    it.src = "usda";
  }));
  return items;
}

// Очистить ответ нейросети и подтянуть значения из USDA
const finalizeItems = async (env, raw, opts) => applyUsda(env, cleanItems(raw, opts));

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

function mealText(meal, u) {
  const t = sumItems(meal.items);
  const kcalU = L(u, "ккал", "kcal"), gU = L(u, "г", "g");
  const lines = meal.items.map((it) => `• ${esc(it.name)} — ${it.grams} ${gU} · <b>${round(itemTotals(it).kcal)}</b> ${kcalU}`);
  return (
    `🍽 <b>${esc(meal.title)}</b> · ${meal.time}\n` +
    `\n${lines.join("\n")}\n\n` +
    `🔥 <b>${round(t.kcal)} ${kcalU}</b>   🥩 ${round(t.p)} ${gU}   🧈 ${round(t.f)} ${gU}   🍞 ${round(t.c)} ${gU}`
  );
}

function remainingText(u, day, date) {
  const t = dayTotals(day);
  const left = u.targets.kcal - t.kcal;
  const label = date === today(u) ? L(u, "За сегодня", "Today") : L(u, `За ${humanDate(date, u)}`, humanDate(date, u));
  return (
    `📊 ${label}  <b>${round(t.kcal)}</b> / ${u.targets.kcal} ${L(u, "ккал", "kcal")}\n${squares(t.kcal, u.targets.kcal)}\n` +
    (left >= 0 ? `<i>${L(u, `Осталось ${round(left)} ккал`, `${round(left)} kcal left`)}</i>` : `<i>${L(u, `Больше нормы на ${round(-left)} ккал`, `${round(-left)} kcal over your goal`)}</i>`)
  );
}

function mealCard(u, meal, day, date, comment) {
  return mealText(meal, u) + (comment ? `\n\n${/^📦/.test(comment) ? "" : "💡 "}${esc(comment)}` : "") + "\n\n" + remainingText(u, day, date);
}

function mealKeyboard(env, u, date, meal) {
  const rows = [];
  let row = [];
  meal.items.forEach((it, i) => {
    const name = it.name.length > 14 ? it.name.slice(0, 13) + "…" : it.name;
    row.push({ text: `✏️ ${name} ${it.grams}${L(u, "г", "g")}`, callback_data: `e|${date}|${meal.id}|${i}` });
    if (row.length === 2) { rows.push(row); row = []; }
  });
  if (row.length) rows.push(row);
  rows.push([{ text: L(u, "🔬 Подробнее", "🔬 Details"), callback_data: `n|${date}|${meal.id}` }]);
  rows.push([{ text: L(u, "🗑 Удалить", "🗑 Delete"), callback_data: `x|${date}|${meal.id}` }, appButton(env, u, "📱 Дневник", "📱 Diary")]);
  return { inline_keyboard: rows };
}

// Подробный состав приёма пищи: БЖУ с долей от нормы и микронутриенты с долей от суточной нормы
function mealDetails(u, meal) {
  const t = sumItems(meal.items), g = u.targets;
  const kcalU = L(u, "ккал", "kcal"), gU = L(u, "г", "g");
  const share = (v, norm) => (norm ? ` · <i>${pctOf(v, norm)}%</i>` : "");
  const head = `🔬 <b>${esc(meal.title)}</b> · ${meal.time}\n\n` +
    `🔥 <b>${round(t.kcal)}</b> ${kcalU}${share(t.kcal, g.kcal)}\n` +
    `🥩 ${L(u, "Белки", "Protein")} <b>${r1(t.p)}</b> ${gU}${share(t.p, g.p)}\n` +
    `🧈 ${L(u, "Жиры", "Fat")} <b>${r1(t.f)}</b> ${gU}${share(t.f, g.f)}\n` +
    `🍞 ${L(u, "Углеводы", "Carbs")} <b>${r1(t.c)}</b> ${gU}${share(t.c, g.c)}`;
  const m = sumMicro(meal.items);
  if (!m) return head + "\n\n" + L(u, "<i>Микронутриентов в этой записи нет: они считаются для новых записей</i>", "<i>No micronutrient data for this entry: it is calculated for new entries</i>");
  const lines = MICRO_KEYS.filter((k) => m[k] > 0).map((k) => {
    const [ru, en, unit, , dv] = MICRO[k];
    return `• ${L(u, ru, en)} <b>${microNum(m[k])}</b> ${unit === "g" ? gU : unit}${share(m[k], dv)}`;
  });
  return head + `\n\n<b>${L(u, "Микронутриенты", "Micronutrients")}</b>\n${lines.join("\n")}\n\n` +
    L(u, "<i>Проценты — от суточной нормы. Значения оценочные</i>", "<i>Percentages are of the daily value. Values are estimates</i>");
}

// Цитаты — без иконок внутри: так Telegram принимает сообщение с первой попытки
const HELP_TEXT = {
  ru: `🍏 <b>FITTER</b>
<blockquote><i>Считаю калории по фото — быстро, весело и без кухонных весов</i></blockquote>


📸 <b>Как это работает</b>

1️⃣ <b>Сфоткай</b> еду и пришли мне
2️⃣ Узнаю блюда и посчитаю <b>КБЖУ</b>
3️⃣ Что-то не так? Нажми ✏️ — <u>поправлю</u>
4️⃣ Всё ляжет в <b>дневник</b> 📱


✨ <b>Ещё умею</b> — <i>просто напиши</i>

📝 <code>съел 2 яйца и тост</code> — запишу без фото
💬 <code>сколько белка в твороге?</code> — отвечу
💧 <code>вода 300</code> — отмечу воду
⚖️ <code>/weight 72.5</code> — запишу вес и обновлю норму
📦 Фото <b>этикетки</b> или <b>штрихкода</b> — найду КБЖУ

💡 <b>Лайфхак:</b> <tg-spoiler>пиши «+500» — сразу запишу пол-литра воды</tg-spoiler>


⌨️ <b>Команды</b>

<u>Каждый день</u>
📊 /today — итоги дня
🥗 /advice — что съесть
💧 /water — вода
💊 /pills — таблетки

<u>Итоги</u>
📅 /week — неделя
🧠 /analysis — разбор недели
🏆 /awards — достижения

<u>Профиль</u>
👤 /profile — профиль и норма
📱 /app — дневник
⏰ /remind — напоминания
🌐 /lang — язык
🔄 /reset — пройти анкету заново
🗑 /delete — удалить мои данные


<blockquote><i>FITTER считает примерно и не заменяет врача или диетолога</i></blockquote>`,
  en: `🍏 <b>FITTER</b>
<blockquote><i>I count calories from photos — fast, fun and no kitchen scale</i></blockquote>


📸 <b>How it works</b>

1️⃣ <b>Snap</b> your food and send it to me
2️⃣ I recognize the dishes and count the <b>macros</b>
3️⃣ Something off? Tap ✏️ — <u>I'll fix it</u>
4️⃣ Everything goes into your <b>diary</b> 📱


✨ <b>Also</b> — <i>just type</i>

📝 <code>ate 2 eggs and toast</code> — I'll log it without a photo
💬 <code>how much protein is in cottage cheese?</code> — I'll answer
💧 <code>water 300</code> — I'll log your water
⚖️ <code>/weight 72.5</code> — log your weight and update your goal
📦 A photo of a <b>label</b> or <b>barcode</b> — I'll find the nutrition values

💡 <b>Pro tip:</b> <tg-spoiler>type “+500” — I'll instantly log half a liter of water</tg-spoiler>


⌨️ <b>Commands</b>

<u>Every day</u>
📊 /today — today's summary
🥗 /advice — what to eat
💧 /water — water
💊 /pills — pills

<u>Summaries</u>
📅 /week — week
🧠 /analysis — weekly review
🏆 /awards — achievements

<u>Profile</u>
👤 /profile — profile and goal
📱 /app — diary
⏰ /remind — reminders
🌐 /lang — language
🔄 /reset — redo the questionnaire
🗑 /delete — delete my data


<blockquote><i>FITTER's numbers are approximate and don't replace a doctor or dietitian</i></blockquote>`,
};
const HELP = HELP_TEXT.ru;
const helpText = (u) => HELP_TEXT[langOf(u)];

// ───────────────────────────── Обработка сообщений ─────────────────────────────

async function handleUpdate(update, env) {
  if (update.message) return onMessage(update.message, env);
  if (update.callback_query) return onCallback(update.callback_query, env);
}

function newUser(from) {
  return { id: from.id, name: from.first_name || "", tz: DEFAULT_TZ, created: Date.now(), state: null, lang: guessLang(from) };
}

// Метка источника из /start: только латиница, цифры, _ и -, до 32 символов
function startSource(text) {
  const m = String(text || "").match(/^\/start\s+([A-Za-z0-9_-]{1,32})$/);
  if (m && m[1].startsWith("link_")) return "app"; // пришёл из приложения Android
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
  if (/^\/(emojipack|emojiid|makeemoji|emojierr)\b/.test(text) && !admin) return send(env, chatId, L(u, "Эта команда только для владельца бота", "This command is for the bot owner only"));
  if (admin && (msg.entities || msg.caption_entities || []).some((e) => e.type === "custom_emoji")) return sendEmojiIds(env, chatId, msg);
  if (text.startsWith("/emojipack")) return sendEmojiPack(env, chatId, text.split(/\s+/)[1]);
  if (text === "/emojiid") return send(env, chatId, "Отправь мне иконки из набора, и я пришлю их номера 🔢");
  if (text === "/makeemoji") return makeEmojiPack(env, chatId, msg.from);
  if (text === "/emojierr") {
    const e = await env.DB.get("cfg:emojierr", "json");
    return tgRaw(env, "sendMessage", { chat_id: chatId, text: e ? `Последняя ошибка иконок (${e.at}, ${e.method}):\n${e.error}` : "Ошибок с иконками не было ✅" });
  }

  // Язык: /lang — выбор кнопками, /lang en и /lang ru — сразу
  if (text === "/lang" || text.startsWith("/lang ")) {
    const arg = text.split(/\s+/)[1]?.toLowerCase();
    if (arg !== "en" && arg !== "ru") return sendLang(env, u, chatId);
    u.lang = arg;
    await saveUser(env, u);
    return send(env, chatId, L(u, "🌐 Язык: <b>Русский</b>", "🌐 Language: <b>English</b>"), u.targets ? { reply_markup: mainKb(u) } : {});
  }

  const linkCode = text.match(/^\/start link_([0-9a-z]{20})$/);
  if (linkCode && u.targets) return askLinkConfirm(env, u, chatId, linkCode[1]);
  if (text === "/start" || text.startsWith("/start ")) {
    if (u.targets) {
      u.state = null;
      await saveUser(env, u);
      return send(env, chatId, L(u,
        `С возвращением, ${esc(u.name || "друг")}! 👋\nОтправь фото еды — я посчитаю калории.`,
        `Welcome back, ${esc(u.name || "friend")}! 👋\nSend a photo of your food and I'll count the calories.`), { reply_markup: mainKb(u) });
    }
    return startOnboarding(env, u, chatId);
  }
  if (text === "/reset") return startOnboarding(env, u, chatId);
  if (text === "/delete") {
    if (!known) return send(env, chatId, L(u, "У меня нет твоих данных 🤷", "I don't have any of your data 🤷"));
    return send(env, chatId,
      L(u,
        "🗑 <b>Удалить все твои данные?</b>\n\nАнкета, дневник питания, вода, вес, таблетки и напоминания будут стёрты навсегда. Восстановить их не получится.",
        "🗑 <b>Delete all your data?</b>\n\nYour profile, food diary, water, weight, pills and reminders will be erased permanently. This can't be undone."),
      { reply_markup: { inline_keyboard: [[{ text: L(u, "Да, удалить всё", "Yes, delete everything"), callback_data: "delall" }, { text: L(u, "Отмена", "Cancel"), callback_data: "delno" }]] } });
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
      if (!fix) return send(env, chatId, L(u, "Напиши вес (<b>150</b>), название (<b>форель</b>) или всё вместе (<b>форель 200 г</b>)", "Send a weight (<b>150</b>), a name (<b>trout</b>) or both (<b>trout 200 g</b>)"));
      return applyEdit(env, u, chatId, fix);
    }
    u.state = null;
    await saveUser(env, u);
  }

  // Ждём новый препарат: «Витамин D, 1 капсула, 9:00 21:00»
  if (u.state && u.state.type === "pilladd") {
    if (text && !text.startsWith("/") && !isMenu(text)) {
      const p = parsePill(text);
      if (!p) return send(env, chatId, L(u, "Напиши название и время приёма, например: <b>Витамин D, 1 капсула, 9:00</b>", "Send the name and time, for example: <b>Vitamin D, 1 capsule, 9:00</b>"));
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
      if (!(kg >= 30 && kg <= 300)) return send(env, chatId, L(u, "Напиши вес числом в килограммах, например <b>72.5</b>", "Send your weight as a number in kilograms, for example <b>72.5</b>"));
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
    return send(env, chatId, L(u,
      "📦 Похоже на штрихкод, но цифры не сходятся. Проверь и пришли ещё раз, или сфотографируй этикетку 📸",
      "📦 This looks like a barcode, but the digits don't add up. Check and send it again, or photograph the label 📸"));
  }
  if (msg.document && /^image\//.test(msg.document.mime_type || "")) {
    if ((msg.document.file_size || 0) > MAX_IMAGE_BYTES) return send(env, chatId, L(u, "📷 Файл слишком большой. Пришли картинку до 5 МБ или просто фото", "📷 The file is too big. Send an image under 5 MB or just a regular photo"));
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
    case "/help": return send(env, chatId, helpText(u), { reply_markup: mainKb(u) });
    case "/app":
      return send(env, chatId, L(u, "Твой дневник питания по дням 👇", "Your food diary, day by day 👇"), { reply_markup: { inline_keyboard: [[appButton(env, u)]] } });
    case "/weight": {
      const kg = text.startsWith("/weight") ? parseNum(text.slice(7)) : NaN;
      if (kg >= 30 && kg <= 300) return logWeight(env, u, chatId, kg);
      u.state = { type: "weight" };
      await saveUser(env, u);
      return send(env, chatId, L(u, `Сколько ты сейчас весишь? Напиши в кг, например <b>${u.weight || 70}</b>`, `How much do you weigh now? Send it in kg, for example <b>${u.weight || 70}</b>`));
    }
  }
  if (text.startsWith("/")) return send(env, chatId, L(u, "Не знаю такой команды 🤔\n\n", "I don't know that command 🤔\n\n") + helpText(u), { reply_markup: mainKb(u) });
  if (text) return onText(env, u, chatId, text);
  return send(env, chatId, L(u, "Пришли фото еды 📸 или напиши, что съел ✍️", "Send a photo of your food 📸 or type what you ate ✍️"));
}

// Выбор языка бота и приложения: один на аккаунт
function sendLang(env, u, chatId) {
  return send(env, chatId, "🌐 <b>Language / Язык</b>\n\n" + L(u, "Выбери язык бота и приложения", "Choose the language of the bot and the app"), {
    reply_markup: { inline_keyboard: [[{ text: "🇬🇧 English", callback_data: "lang|en" }, { text: "🇷🇺 Русский", callback_data: "lang|ru" }]] },
  });
}

// Кнопки меню: с иконкой Telegram присылает текст без эмодзи, поэтому смотрим только на слово
// «Вес» остаётся для тех, у кого ещё старая клавиатура
const MENU = {
  "Сегодня": "/today", "Неделя": "/week", "Вода": "/water", "Таблетки": "/pills", "Вес": "/weight", "Профиль": "/profile", "Помощь": "/help",
  "Today": "/today", "Week": "/week", "Water": "/water", "Pills": "/pills", "Weight": "/weight", "Profile": "/profile", "Help": "/help",
};
const menuLabel = (t) => String(t).replace(/^[^A-Za-zА-Яа-яЁё]+/, "").trim();
const isMenu = (t) => !!MENU[menuLabel(t)];

// ── Анкета ──

async function startOnboarding(env, u, chatId) {
  u.state = { step: "sex" };
  await saveUser(env, u);
  await send(
    env, chatId,
    L(u,
      `Привет${u.name ? ", " + esc(u.name) : ""}! 👋 Я 🍏 <b>FITTER</b> — твой счётчик калорий 🥦\n\n` +
        `Отправляешь фото еды — я определяю продукты, считаю калории, белки, жиры и углеводы и веду твой дневник питания.\n\n` +
        `Сначала короткая анкета, чтобы посчитать твою дневную норму. Это 6 вопросов ⏱`,
      `Hi${u.name ? ", " + esc(u.name) : ""}! 👋 I'm 🍏 <b>FITTER</b> — your calorie counter 🥦\n\n` +
        `Send a photo of your food and I'll recognize the dishes, count calories, protein, fat and carbs, and keep your food diary.\n\n` +
        `First, a short questionnaire to work out your daily goal. It's 6 questions ⏱`),
    { reply_markup: { remove_keyboard: true } }
  );
  return send(env, chatId, L(u, "<b>1/6.</b> Твой пол?", "<b>1/6.</b> Your sex?"), {
    reply_markup: {
      inline_keyboard: [
        [{ text: L(u, "👨 Мужской", "👨 Male"), callback_data: "sex|m" }, { text: L(u, "👩 Женский", "👩 Female"), callback_data: "sex|f" }],
        [{ text: u.lang === "en" ? "🌐 Русский" : "🌐 English", callback_data: u.lang === "en" ? "lang|ru" : "lang|en" }],
      ],
    },
  });
}

async function onboardingText(env, u, chatId, text) {
  const n = parseNum(text);
  const step = u.state.step;
  if (step === "age") {
    if (!(n >= 10 && n <= 100)) return send(env, chatId, L(u, "Напиши возраст числом, например <b>16</b>", "Send your age as a number, for example <b>16</b>"));
    u.age = round(n);
    u.state = { step: "height" };
    await saveUser(env, u);
    return send(env, chatId, L(u, "<b>3/6.</b> Твой рост в сантиметрах? Например <b>175</b>", "<b>3/6.</b> Your height in centimeters? For example <b>175</b>"));
  }
  if (step === "height") {
    if (!(n >= 100 && n <= 250)) return send(env, chatId, L(u, "Напиши рост в сантиметрах, например <b>175</b>", "Send your height in centimeters, for example <b>175</b>"));
    u.height = round(n);
    u.state = { step: "weight" };
    await saveUser(env, u);
    return send(env, chatId, L(u, "<b>4/6.</b> Твой вес в килограммах? Например <b>68.5</b>", "<b>4/6.</b> Your weight in kilograms? For example <b>68.5</b>"));
  }
  if (step === "weight") {
    if (!(n >= 30 && n <= 300)) return send(env, chatId, L(u, "Напиши вес в килограммах, например <b>68.5</b>", "Send your weight in kilograms, for example <b>68.5</b>"));
    u.weight = r1(n);
    u.state = { step: "activity" };
    await saveUser(env, u);
    return askActivity(env, u, chatId);
  }
  if (step === "sex") return send(env, chatId, L(u, "Нажми кнопку выше: 👨 Мужской или 👩 Женский", "Tap a button above: 👨 Male or 👩 Female"));
  if (step === "activity") return askActivity(env, u, chatId);
  if (step === "goal") return askGoal(env, u, chatId);
}

function askActivity(env, u, chatId) {
  return send(env, chatId, L(u, "<b>5/6.</b> Насколько ты активен?", "<b>5/6.</b> How active are you?"), {
    reply_markup: { inline_keyboard: Object.keys(ACTIVITY).map((k) => [{ text: activityText(u, k), callback_data: `act|${k}` }]) },
  });
}
function askGoal(env, u, chatId) {
  return send(env, chatId, L(u, "<b>6/6.</b> Какая у тебя цель?", "<b>6/6.</b> What is your goal?"), {
    reply_markup: { inline_keyboard: Object.keys(GOALS).map((k) => [{ text: goalText(u, k), callback_data: `goal|${k}` }]) },
  });
}

function targetsText(u) {
  const t = u.targets;
  return L(u,
    `🎯 <b>Твоя дневная норма</b>\n🔥 Калории: <b>${t.kcal} ккал</b>\n🥩 Белки: ${t.p} г\n🧈 Жиры: ${t.f} г\n🍞 Углеводы: ${t.c} г`,
    `🎯 <b>Your daily goal</b>\n🔥 Calories: <b>${t.kcal} kcal</b>\n🥩 Protein: ${t.p} g\n🧈 Fat: ${t.f} g\n🍞 Carbs: ${t.c} g`);
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
    L(u,
      `${first ? "Готово! ✅" : "Анкета обновлена ✅"}\n\n${targetsText(u)}\n\n` +
        `Теперь просто <b>отправь фото своей еды</b> 📸 — я всё посчитаю и запишу в дневник.\n` +
        `Ещё можно написать текстом, например «съел банан и йогурт».`,
      `${first ? "All set! ✅" : "Profile updated ✅"}\n\n${targetsText(u)}\n\n` +
        `Now just <b>send a photo of your food</b> 📸 — I'll count everything and log it in your diary.\n` +
        `You can also type it, for example “ate a banana and yogurt”.`),
    { reply_markup: mainKb(u) }
  );
  return send(env, chatId, L(u, "Дневник по дням всегда здесь 👇", "Your day-by-day diary is always here 👇"), { reply_markup: { inline_keyboard: [[appButton(env, u)]] } });
}

// ── Кнопки ──

async function onCallback(q, env) {
  const data = q.data || "";
  const chatId = q.message?.chat?.id;
  const msgId = q.message?.message_id;
  const u = await getUser(env, q.from.id);
  const answer = (text) => tg(env, "answerCallbackQuery", { callback_query_id: q.id, text });
  if (!u || !chatId) return answer(L({ lang: guessLang(q.from) }, "Напиши /start", "Send /start"));
  const [kind, a, b, c] = data.split("|");
  if (kind === "lnk" && u.targets) return onLinkCallback(env, u, chatId, msgId, a === "y", b || "", answer);

  if (kind === "lang") {
    if (a === "en" || a === "ru") {
      u.lang = a;
      await saveUser(env, u);
      await answer(L(u, "Язык: Русский", "Language: English"));
      // Во время анкеты просто начинаем её заново на выбранном языке
      if (!u.targets) return startOnboarding(env, u, chatId);
      await edit(env, chatId, msgId, L(u, "🌐 Язык: <b>Русский</b>", "🌐 Language: <b>English</b>"));
      return send(env, chatId, L(u, "Готово! Меню обновлено 👇", "Done! The menu is updated 👇"), { reply_markup: mainKb(u) });
    }
    await answer();
    return sendLang(env, u, chatId);
  }

  if (kind === "sex" && u.state?.step === "sex") {
    u.sex = a === "f" ? "f" : "m";
    u.state = { step: "age" };
    await saveUser(env, u);
    await answer();
    await edit(env, chatId, msgId, `<b>1/6.</b> ${L(u, "Пол", "Sex")}: ${u.sex === "m" ? L(u, "👨 Мужской", "👨 Male") : L(u, "👩 Женский", "👩 Female")}`);
    return send(env, chatId, L(u, "<b>2/6.</b> Сколько тебе лет?", "<b>2/6.</b> How old are you?"));
  }
  if (kind === "act" && u.state?.step === "activity" && ACTIVITY[a]) {
    u.activity = a;
    u.state = { step: "goal" };
    await saveUser(env, u);
    await answer();
    await edit(env, chatId, msgId, `<b>5/6.</b> ${L(u, "Активность", "Activity")}: ${activityText(u, a)}`);
    return askGoal(env, u, chatId);
  }
  if (kind === "goal" && u.state?.step === "goal" && GOALS[a]) {
    u.goal = a;
    await answer();
    await edit(env, chatId, msgId, `<b>6/6.</b> ${L(u, "Цель", "Goal")}: ${goalText(u, a)}`);
    return finishOnboarding(env, u, chatId);
  }
  if (kind === "delall") {
    await deleteUserData(env, u.id);
    await answer(L(u, "Данные удалены", "Data deleted"));
    return edit(env, chatId, msgId, L(u, "🗑 Все твои данные удалены. Чтобы начать заново, напиши /start", "🗑 All your data has been deleted. To start over, send /start"));
  }
  if (kind === "delno") {
    await answer();
    return edit(env, chatId, msgId, L(u, "Ничего не удалял 👌", "Nothing was deleted 👌"));
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
    return send(env, chatId, L(u, `Сколько ты сейчас весишь? Напиши в кг, например <b>${u.weight || 70}</b>`, `How much do you weigh now? Send it in kg, for example <b>${u.weight || 70}</b>`));
  }
  if (kind === "e" && isDate(a)) {
    const day = await getDay(env, u.id, a);
    const meal = day.meals.find((m) => m.id === b);
    const it = meal?.items[Number(c)];
    if (!it) return answer(L(u, "Эта запись уже удалена", "This entry has already been deleted"));
    u.state = { type: "edit", date: a, mealId: b, idx: Number(c), msgId };
    await saveUser(env, u);
    await answer();
    return send(
      env, chatId,
      L(u,
        `✏️ Сейчас: «${esc(it.name)}» — <b>${it.grams} г</b>\n\n` +
          `Напиши, что исправить:\n` +
          `• только вес: <b>150</b>\n` +
          `• только название: <b>форель</b>\n` +
          `• всё вместе: <b>форель 200 г</b>\n\n` +
          `Если поменяешь название, я заново посчитаю калории для нового продукта.`,
        `✏️ Currently: “${esc(it.name)}” — <b>${it.grams} g</b>\n\n` +
          `Send what to fix:\n` +
          `• weight only: <b>150</b>\n` +
          `• name only: <b>trout</b>\n` +
          `• both: <b>trout 200 g</b>\n\n` +
          `If you change the name, I'll recalculate the calories for the new product.`),
      { reply_markup: { force_reply: true, input_field_placeholder: L(u, "Например: форель 200 г", "For example: trout 200 g") } }
    );
  }
  if (kind === "w" && isDate(a)) {
    const delta = Number(b);
    if (![250, 500, -250].includes(delta)) return answer();
    const { day, reached, fresh } = await addWater(env, u, a, delta);
    await answer(delta > 0 ? `💧 +${delta} ${L(u, "мл", "ml")}` : L(u, "Убрал 250 мл", "Removed 250 ml"));
    await edit(env, chatId, msgId, waterText(u, day, a, delta), { reply_markup: waterKeyboard(u, a) });
    if (reached && !fresh.length) await send(env, chatId, L(u, "🎉 Норма воды на сегодня выполнена! Так держать 💧", "🎉 Water goal for today reached! Keep it up 💧"), { message_effect_id: EFFECT_PARTY });
    return announce(env, chatId, fresh, u);
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
    await answer(L(u, "Подбираю варианты…", "Picking options…"));
    return sendAdvice(env, u, chatId);
  }
  if (kind === "adv") {
    const saved = await env.DB.get(`adv:${u.id}`, "json");
    const o = saved?.date === today(u) ? saved.options[Number(a)] : null;
    if (!o) return answer(L(u, "Варианты устарели, нажми «Что съесть» ещё раз", "These options are out of date, tap “What to eat” again"));
    await env.DB.delete(`adv:${u.id}`);
    await answer(L(u, "Записываю ✅", "Logging ✅"));
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
    await answer(u.weekly ? L(u, "Буду присылать разбор по воскресеньям", "I'll send the review on Sundays") : L(u, "Больше не буду присылать разбор по воскресеньям", "I won't send the Sunday review anymore"));
    return tg(env, "editMessageReplyMarkup", {
      chat_id: chatId, message_id: msgId,
      reply_markup: { inline_keyboard: [[u.weekly ? { text: L(u, "🔕 Не присылать по воскресеньям", "🔕 Stop Sunday reviews"), callback_data: "an_off" } : { text: L(u, "🔔 Снова присылать по воскресеньям", "🔔 Resume Sunday reviews"), callback_data: "an_on" }]] },
    });
  }
  if (kind === "n" && isDate(a)) {
    const day = await getDay(env, u.id, a);
    const meal = day.meals.find((m) => m.id === b);
    if (!meal) return answer(L(u, "Эта запись уже удалена", "This entry has already been deleted"));
    await answer();
    return send(env, chatId, mealDetails(u, meal));
  }
  if (kind === "x" && isDate(a)) {
    const day = await getDay(env, u.id, a);
    const before = day.meals.length;
    day.meals = day.meals.filter((m) => m.id !== b);
    if (day.meals.length === before) return answer(L(u, "Уже удалено", "Already deleted"));
    await saveDay(env, u.id, a, day);
    await answer(L(u, "Удалено", "Deleted"));
    return edit(env, chatId, msgId, `${L(u, "🗑 Приём пищи удалён", "🗑 Meal deleted")}\n\n${remainingText(u, day, a)}`);
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
    return send(env, chatId, L(u, "На сегодня лимит запросов к нейросети закончился 😔 Завтра снова можно! А пока можешь поправить записи в дневнике.", "You've used up today's AI requests 😔 Try again tomorrow! Meanwhile you can edit your diary entries."));
  }
  tg(env, "sendChatAction", { chat_id: chatId, action: "typing" });
  // Фото скачиваем сразу, пока сохраняется пользователь и уходит «Смотрю на фото…»: три дела вместо цепочки
  const download = (async () => {
    const f = await tg(env, "getFile", { file_id: pickPhoto(msg) });
    if (!f.ok) throw new Error("getFile failed");
    const path = f.result.file_path;
    const img = await fetch(`https://api.telegram.org/file/bot${env.BOT_TOKEN}/${path}`);
    if (!img.ok) throw new Error("download failed " + img.status);
    return { b64: toBase64(await img.arrayBuffer()), mime: /\.png$/i.test(path) ? "image/png" : /\.webp$/i.test(path) ? "image/webp" : "image/jpeg" };
  })();
  download.catch(() => {}); // ошибку разберём ниже, а здесь не оставляем необработанной
  const [, wait] = await Promise.all([
    saveUser(env, u),
    send(env, chatId, L(u, "🔍 Смотрю на фото и считаю калории…", "🔍 Looking at the photo and counting calories…")),
  ]);
  const waitId = wait.result?.message_id;
  try {
    const { b64, mime } = await download;
    const r = await analyzePhoto(env, b64, mime, (msg.caption || "").trim().slice(0, 300), u);
    if (!r) {
      return edit(env, chatId, waitId, L(u,
        "🤔 Не вижу на фото еды. Попробуй сфотографировать тарелку сверху и поближе.\n\nИли напиши текстом, что ты съел.",
        "🤔 I can't see any food in the photo. Try shooting the plate from above and closer.\n\nOr just type what you ate."));
    }
    return saveMealAndReply(env, u, chatId, waitId, r.title, r.items, r.source, r.comment);
  } catch (e) {
    console.error("photo error:", e && e.stack ? e.stack : e);
    return edit(env, chatId, waitId, L(u, "😔 Не получилось распознать фото. Попробуй ещё раз через минуту или напиши текстом, что ты съел.", "😔 Couldn't recognize the photo. Try again in a minute or just type what you ate."));
  }
}

// Распознать еду на фото — общий шаг для бота и приложения. null — еды на фото нет
async function analyzePhoto(env, b64, mime, caption, u) {
  const res = await gemini(env, [
    { text: photoPrompt(u) + (caption ? `\n\nHint from the user (take it into account first): ${caption}` : "") },
    { inline_data: { mime_type: mime, data: b64 } },
  ], PHOTO_SCHEMA);
  const items = await finalizeItems(env, res.items, { trust: !!res.label_found });
  if (!res.is_food || !items.length) return null;
  // Упаковка: КБЖУ с этикетки, а если этикетки не видно — ищем по штрихкоду
  let comment = res.comment;
  let source = "photo";
  if (res.is_package) {
    source = "package";
    const code = cleanBarcode(res.barcode);
    if (res.label_found) {
      comment = L(u, "📦 КБЖУ взяты с этикетки. Если съел не всю упаковку — нажми ✏️ и впиши вес", "📦 Values taken from the label. If you didn't eat the whole pack, tap ✏️ and enter the weight");
    } else if (code) {
      const p = await lookupBarcode(env, code, u);
      if (p) {
        items.splice(0, 1, { ...p, grams: p.grams || items[0]?.grams || 100 });
        comment = L(u, `📦 Нашёл по штрихкоду ${code} в базе Open Food Facts. Если съел не всю упаковку — нажми ✏️ и впиши вес`, `📦 Found by barcode ${code} in the Open Food Facts database. If you didn't eat the whole pack, tap ✏️ and enter the weight`);
        source = "barcode";
      }
    }
    if (source === "package" && !res.label_found) {
      comment = L(u, "📦 Это упаковка, но КБЖУ я оценил примерно. Для точности сфотографируй этикетку с пищевой ценностью или пришли цифры штрихкода", "📦 This is a package, but I only estimated the values. For accuracy, photograph the nutrition label or send the barcode digits");
    }
  }
  return { title: res.title, items, source, comment };
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
async function lookupBarcode(env, code, u) {
  // Название продукта зависит от языка, поэтому английский кэш лежит отдельно
  const key = langOf(u) === "en" ? `bc:${code}:en` : `bc:${code}`;
  const cached = await env.DB.get(key, "json").catch(() => null);
  if (cached) return cached.miss ? null : cached;
  let product = null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,product_name_ru,product_name_en,generic_name,brands,product_quantity,nutriments`,
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
      const name = String(langOf(u) === "en" ? p?.product_name_en || p?.product_name || p?.generic_name || p?.product_name_ru || "" : p?.product_name_ru || p?.product_name || p?.generic_name || "").trim();
      if (p && kcal !== null && name) {
        const brand = String(p.brands || "").split(",")[0].trim();
        const [item] = cleanItems([{
          name: brand && !name.toLowerCase().includes(brand.toLowerCase()) ? `${name} ${brand}` : name,
          grams: num(p.product_quantity) || 100,
          kcal_100: kcal,
          protein_100: num(n.proteins_100g) || 0,
          fat_100: num(n.fat_100g) || 0,
          carbs_100: num(n.carbohydrates_100g) || 0,
          micro_100: {
            fiber: num(n.fiber_100g) || 0, sugar: num(n.sugars_100g) || 0, satfat: num(n["saturated-fat_100g"]) || 0,
            sodium: (num(n.sodium_100g) || 0) * 1000, // в базе натрий в граммах
          },
        }], { trust: true });
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
  const p = await lookupBarcode(env, code, u);
  if (!p) {
    return send(env, chatId, L(u,
      `📦 Не нашёл штрихкод ${code} в базе продуктов 😔\n\nСфотографируй этикетку с пищевой ценностью, и я перепишу КБЖУ с неё 📸`,
      `📦 I couldn't find barcode ${code} in the product database 😔\n\nTake a photo of the nutrition label and I'll copy the values from it 📸`));
  }
  return saveMealAndReply(env, u, chatId, null, p.name, [p], "barcode",
    L(u, "📦 Нашёл по штрихкоду в базе Open Food Facts. Если съел не всю упаковку — нажми ✏️ и впиши вес",
      "📦 Found by barcode in the Open Food Facts database. If you didn't eat the whole pack, tap ✏️ and enter the weight"));
}

// ── Вода ──

const waterGoal = (u) => Math.max(1500, Math.round(((u.weight || 70) * 30) / 50) * 50); // 30 мл на 1 кг веса
const liters = (ml, u) => {
  const n = String(Math.round(ml / 10) / 100);
  return langOf(u) === "en" ? n + " L" : n.replace(".", ",") + " л";
};

// «вода 300», «+300», «300 мл воды», «выпил 0.5 л воды», «2 стакана воды»; по-английски: «water 300», «drank 0.5 l of water», «2 glasses of water»
function parseWater(text) {
  const t = String(text).toLowerCase().replace(",", ".").replace(/ё/g, "е").trim();
  const drank = "(?:(?:выпил[а]?|drank|had)\\s+)?";
  let m;
  let ml = null;
  if ((m = t.match(/^\+\s*(\d{2,4})\s*(мл|ml)?$/))) ml = Number(m[1]);
  else if ((m = t.match(/^(?:вода|воды|water|💧)\s*\+?\s*(\d{2,4})\s*(?:мл|ml)?$/))) ml = Number(m[1]);
  else if ((m = t.match(new RegExp("^" + drank + "(\\d{2,4})\\s*(?:мл|ml)\\s+(?:воды|of water|water)$")))) ml = Number(m[1]);
  else if ((m = t.match(new RegExp("^" + drank + "(\\d(?:\\.\\d+)?)\\s*(?:л|литр[а-я]*|l|liters?|litres?)\\s+(?:воды|of water|water)$")))) ml = Number(m[1]) * 1000;
  else if ((m = t.match(new RegExp("^" + drank + "(\\d{1,2}|a|one)?\\s*(?:стакан(?:а|ов)?\\s+воды|glass(?:es)?\\s+of\\s+water)$")))) ml = (/^\d/.test(m[1] || "") ? Number(m[1]) : 1) * 250;
  if (ml === null) return null;
  return ml >= 30 && ml <= 3000 ? Math.round(ml) : null;
}

function waterText(u, day, date, added) {
  const ml = day.water || 0;
  const goal = waterGoal(u);
  const left = goal - ml;
  return (
    `💧 <b>${L(u, "Вода " + (date === today(u) ? "за сегодня" : "за " + humanDate(date, u)), "Water " + (date === today(u) ? "today" : "on " + humanDate(date, u)))}</b>` +
    (added ? L(u, ` · ${added > 0 ? "+" : "−"}${Math.abs(added)} мл записал`, ` · ${added > 0 ? "+" : "−"}${Math.abs(added)} ml logged`) : "") + `\n\n\n` +
    `<b>${liters(ml, u)}</b> / ${liters(goal, u)}\n${squares(Math.min(ml, goal), goal, "🟦")}\n` +
    (left > 0 ? `<i>${L(u, `Осталось ${left} мл`, `${left} ml left`)} · ${pctOf(ml, goal)}%</i>` : `<i>${L(u, "Норма воды выполнена", "Water goal reached")}</i> 🎉`) +
    `\n\n\n<i>${L(u, "Норма — 30 мл на кг веса. Можно написать «вода 300» или «+500»", "Goal: 30 ml per kg of body weight. You can type “water 300” or “+500”")}</i>`
  );
}

function waterKeyboard(u, date) {
  const ml = L(u, "мл", "ml");
  return {
    inline_keyboard: [
      [{ text: `💧 +250 ${ml}`, callback_data: `w|${date}|250` }, { text: `💧 +500 ${ml}`, callback_data: `w|${date}|500` }],
      [{ text: `↩️ −250 ${ml}`, callback_data: `w|${date}|-250` }, { text: L(u, "⏰ Напоминания", "⏰ Reminders"), callback_data: "wr|menu" }],
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
  const extra = { reply_markup: waterKeyboard(u, date) };
  if (reached) extra.message_effect_id = EFFECT_PARTY;
  const r = await send(env, chatId, waterText(u, day, date, delta), extra);
  await announce(env, chatId, fresh, u);
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
  const extra = { reply_markup: mealKeyboard(env, u, date, meal) };
  const r = waitId ? await edit(env, chatId, waitId, text, extra) : await send(env, chatId, text, extra);
  const fresh = await progress(env, u, "meal", date, {
    pack: source === "package" || source === "barcode",
    inNorm: inNorm(dayTotals(day).kcal, u.targets.kcal),
  });
  await announce(env, chatId, fresh, u);
  return r;
}

// Разбираем исправление: «150», «150 г», «форель», «форель 200 г», «200г форели»
function parseFix(text) {
  const t = text.trim().replace(/\s+/g, " ");
  if (/^\d+([.,]\d+)?\s*(г|гр|грамм[а-я]*|g|gr|grams?)?\.?$/i.test(t)) {
    const g = parseNum(t);
    return g > 0 && g <= 3000 ? { grams: g } : null;
  }
  let grams = null;
  const m = t.match(/(\d+([.,]\d+)?)\s*(г|гр|грамм[а-я]*|g|gr|grams?)\.?(?=\s|$)/i);
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
    name: { type: "STRING", description: "Product name, short, capitalized, in the requested language" },
    kcal_100: { type: "NUMBER" },
    protein_100: { type: "NUMBER" },
    fat_100: { type: "NUMBER" },
    carbs_100: { type: "NUMBER" },
    micro_100: ITEM_SCHEMA.properties.micro_100,
    usda_query: ITEM_SCHEMA.properties.usda_query,
    meal_title: { type: "STRING", description: "New short name of the whole meal" },
  },
  required: ["name", "kcal_100", "protein_100", "fat_100", "carbs_100", "meal_title"],
};

// Нейросеть пересчитывает КБЖУ продукта под новое название
async function recalcItem(env, meal, idx, name, grams, u) {
  const it = meal.items[idx];
  const others = meal.items.filter((_, i) => i !== idx).map((x) => x.name).join(", ");
  const res = await gemini(env, [{
    text:
      `You are a nutritionist. The user corrected a product in a meal. Write all text in ${aiLang(u)}.\n` +
      `Was: “${it.name}”. Now: “${name}”.\n` +
      `Other products on the plate: ${others || "none"}.\n` +
      `Give typical calories, protein, fat and carbs PER 100 GRAMS for “${name}” the way it is usually eaten ` +
      `(if the old name mentioned cooking method, sauce or side dish, take that into account).\n` +
      `Fill usda_query with an English USDA FoodData Central search phrase for the product as eaten (empty for mixed dishes). Calories must match macros (kcal ≈ 4·protein + 9·fat + 4·carbs). Also fill micro_100 per 100 g (fiber, sugars, saturated fat, cholesterol, sodium, potassium, calcium, iron, magnesium, zinc, vitamins C, A, D, B12).\n` +
      `In name return a tidy product name. In meal_title return the new short name of the whole meal.`,
  }], FIX_SCHEMA);
  const clean = (await finalizeItems(env, [{ ...res, grams: grams || it.grams }]))[0];
  if (!clean) throw new Error("пустой ответ");
  Object.assign(it, clean);
  if (!clean.mi) delete it.mi; // микронутриенты прежнего продукта к новому не относятся
  if (res.meal_title) meal.title = String(res.meal_title).slice(0, 60);
}

async function applyEdit(env, u, chatId, fix) {
  const { date, mealId, idx, msgId } = u.state;
  u.state = null;
  const day = await getDay(env, u.id, date);
  const meal = day.meals.find((m) => m.id === mealId);
  if (!meal || !meal.items[idx]) {
    await saveUser(env, u);
    return send(env, chatId, L(u, "Эта запись уже удалена 🤷", "This entry has already been deleted 🤷"));
  }
  const it = meal.items[idx];
  const before = { name: it.name, grams: it.grams, kcal: round(itemTotals(it).kcal) };
  let waitId = null;

  if (fix.name) {
    if (!checkAiLimit(env, u)) {
      await saveUser(env, u);
      return send(env, chatId, L(u, "На сегодня лимит запросов к нейросети закончился 😔 Вес можно поправить, а название — завтра.", "You've used up today's AI requests 😔 You can still fix the weight; the name can wait until tomorrow."));
    }
    await saveUser(env, u);
    const wait = await send(env, chatId, L(u, "🔄 Пересчитываю для нового продукта…", "🔄 Recalculating for the new product…"));
    waitId = wait.result?.message_id;
    try {
      await recalcItem(env, meal, idx, fix.name, fix.grams, u);
    } catch (e) {
      console.error("fix error:", e && e.stack ? e.stack : e);
      return edit(env, chatId, waitId, L(u, "😔 Не получилось пересчитать. Попробуй ещё раз: нажми ✏️ у продукта.", "😔 Couldn't recalculate. Try again: tap ✏️ next to the product."));
    }
  } else {
    await saveUser(env, u);
    it.grams = round(fix.grams);
  }

  await saveDay(env, u.id, date, day);
  const text = mealCard(u, meal, day, date);
  const extra = { reply_markup: mealKeyboard(env, u, date, meal) };
  if (msgId) await edit(env, chatId, msgId, text, extra);
  const after = round(itemTotals(it).kcal);
  const gU = L(u, "г", "g");
  const what =
    before.name !== it.name
      ? `«${esc(before.name)}» ${before.grams} ${gU} → <b>«${esc(it.name)}» ${it.grams} ${gU}</b>`
      : `«${esc(it.name)}»: ${before.grams} ${gU} → <b>${it.grams} ${gU}</b>`;
  const summary = `✅ ${what}\n${before.kcal} → <b>${after} ${L(u, "ккал", "kcal")}</b>. ${L(u, "Пересчитал!", "Recalculated!")}\n\n${remainingText(u, day, date)}`;
  if (waitId) return edit(env, chatId, waitId, summary);
  return send(env, chatId, summary, { reply_markup: mainKb(u) });
}

// ── Текст: записать еду или ответить на вопрос ──

// Разбор сообщения нейросетью: запись еды или вопрос
async function askText(env, u, text, date) {
  const t = dayTotals(await getDay(env, u.id, date));
  const ctx =
    `User data: ${u.sex === "m" ? "male" : "female"}, ${u.age} years old, height ${u.height} cm, weight ${u.weight} kg, ` +
    `goal: ${GOALS[u.goal][1]}. Daily target: ${u.targets.kcal} kcal, protein ${u.targets.p} g, fat ${u.targets.f} g, carbs ${u.targets.c} g. ` +
    `Already eaten ${date === today(u) ? "today" : "on " + date}: ${round(t.kcal)} kcal, protein ${round(t.p)}, fat ${round(t.f)}, carbs ${round(t.c)}.`;
  return gemini(env, [{ text: `${textPrompt(u)}\n\n${ctx}\n\nUser message: ${String(text).slice(0, 1500)}` }], TEXT_SCHEMA, 0.4);
}

async function onText(env, u, chatId, text) {
  if (!checkAiLimit(env, u)) {
    return send(env, chatId, L(u, "На сегодня лимит запросов к нейросети закончился 😔 Завтра снова можно!", "You've used up today's AI requests 😔 Try again tomorrow!"));
  }
  await saveUser(env, u);
  tg(env, "sendChatAction", { chat_id: chatId, action: "typing" });
  try {
    const res = await askText(env, u, text, today(u));
    const items = res.intent === "food_log" ? await finalizeItems(env, res.items) : cleanItems(res.items);
    if (res.intent === "food_log" && items.length) {
      return saveMealAndReply(env, u, chatId, null, res.title, items, "text", null);
    }
    return send(env, chatId, esc(res.answer || L(u, "Пришли фото еды 📸 — я посчитаю калории.", "Send a photo of your food 📸 and I'll count the calories.")), { reply_markup: mainKb(u) });
  } catch (e) {
    console.error("text error:", e && e.stack ? e.stack : e);
    return send(env, chatId, L(u, "😔 Нейросеть сейчас не отвечает. Попробуй ещё раз через минуту.", "😔 The AI isn't responding right now. Please try again in a minute."));
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
  const kcalU = L(u, "ккал", "kcal"), gU = L(u, "г", "g");

  let text =
    `📊 <b>${isToday ? L(u, "Сегодня", "Today") : wdOf(date, u)}</b> · ${humanDate(date, u)}\n\n\n` +
    `🔥 <b>${round(t.kcal)}</b> / ${g.kcal} ${kcalU}\n` +
    `${squares(t.kcal, g.kcal)}\n` +
    (left >= 0 ? `<i>${L(u, `Осталось ${round(left)} ккал`, `${round(left)} kcal left`)} · ${pctOf(t.kcal, g.kcal)}%</i>` : `<i>${L(u, `Больше нормы на ${round(-left)} ккал`, `${round(-left)} kcal over your goal`)}</i>`) +
    (isToday && streakNow(u) >= 2 ? `\n🔥 ${L(u, "Серия", "Streak")}: <b>${streakNow(u)}</b> ${dayWord(u, streakNow(u))}${L(u, " подряд", " in a row")}` : "") + `\n\n` +
    `\n🥩 ${L(u, "Белки", "Protein")}  <b>${round(t.p)}</b> / ${g.p} ${gU}\n` +
    `🧈 ${L(u, "Жиры", "Fat")}  <b>${round(t.f)}</b> / ${g.f} ${gU}\n` +
    `🍞 ${L(u, "Углеводы", "Carbs")}  <b>${round(t.c)}</b> / ${g.c} ${gU}\n` +
    `💧 ${L(u, "Вода", "Water")}  <b>${liters(water, u)}</b> / ${liters(wGoal, u)}${water >= wGoal ? " ✓" : ""}\n\n\n`;

  if (day.meals.length) {
    text += `🍽 <b>${L(u, "Приёмы пищи", "Meals")}</b>\n\n` +
      day.meals.map((m) => `${m.time}  ${esc(m.title)}  <b>${round(sumItems(m.items).kcal)}</b>`).join("\n");
    // Подсказка по белку во второй половине дня
    if (isToday && nowTime(u) >= "15:00" && t.p < g.p * 0.5 && left > 0) {
      text += L(u, `\n\n\n💡 <i>Белка пока мало. Добавь творог, яйца, курицу или рыбу</i>`, `\n\n\n💡 <i>Protein is low so far. Add cottage cheese, eggs, chicken or fish</i>`);
    } else if (left < 0) {
      text += L(u, `\n\n\n💡 <i>Норма набрана. Если хочется есть, выбирай овощи и белок</i>`, `\n\n\n💡 <i>Goal reached. If you're still hungry, go for vegetables and protein</i>`);
    }
  } else {
    text += isToday
      ? L(u, "📸 <i>Отправь фото еды — я всё посчитаю</i>", "📸 <i>Send a photo of your food and I'll count everything</i>")
      : L(u, "<i>За этот день записей нет</i>", "<i>No entries for this day</i>");
  }
  return send(env, chatId, text, {
    reply_markup: {
      inline_keyboard: [
        [{ text: L(u, "🥗 Что съесть", "🥗 What to eat"), callback_data: "advice" }, { text: L(u, "💧 +250 мл воды", "💧 +250 ml water"), callback_data: `w|${date}|250` }],
        [{ text: L(u, "📅 Неделя", "📅 Week"), callback_data: "week" }, appButton(env, u, "📱 Дневник", "📱 Diary")],
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

const MON_SHORT = {
  ru: ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};
const shortDate = (d, u) => {
  const m = Number(d.slice(5, 7)) - 1, n = Number(d.slice(8));
  return L(u, `${n} ${MON_SHORT.ru[m]}`, `${MON_SHORT.en[m]} ${n}`);
};
const wdOf = (d, u) => WEEKDAYS[langOf(u)][new Date(d + "T00:00:00Z").getUTCDay()];

async function sendWeek(env, u, chatId) {
  const end = today(u);
  const norm = u.targets.kcal;
  const dates = [...Array(7)].map((_, i) => shiftDate(end, i - 6));
  const [days, weights] = await Promise.all([Promise.all(dates.map((d) => getDay(env, u.id, d))), getWeights(env, u.id)]);

  const rows = dates.map((d, i) => {
    const has = days[i].meals.length > 0;
    const k = round(dayTotals(days[i]).kcal);
    const label = `${wdOf(d, u)} ${d.slice(8)}`;
    const isToday = d === end;
    if (!has) return { d, has, k: 0, line: `${isToday ? "<b>" + label + "</b>" : label}  ${isToday ? L(u, "<i>сегодня пусто</i>", "<i>empty today</i>") : "·"}` };
    const pct = k / norm;
    return { d, has, k, pct, line: `${isToday ? "<b>" + label + "</b>" : label}  ${weekBar(pct)}  <b>${k}</b>${isToday ? ` · <i>${L(u, "сегодня", "today")}</i>` : ""}` };
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
    `📅 <b>${L(u, "Неделя", "Week")}</b> · ${shortDate(dates[0], u)} — ${shortDate(end, u)}\n\n\n` +
    `${rows.map((r) => r.line).join("\n")}\n\n` +
    L(u, `<i>🟩 норма   🟦 меньше   🟥 больше\nЦель ${norm} ккал</i>\n\n\n`, `<i>🟩 on goal   🟦 under   🟥 over\nGoal ${norm} kcal</i>\n\n\n`);

  if (!recorded) {
    text += L(u, "📸 <i>За неделю пока нет записей. Отправь фото еды, и я начну считать</i>", "📸 <i>No entries this week yet. Send a photo of your food and I'll start counting</i>");
  } else {
    const stats = [
      L(u, `🔥 В среднем <b>${avg}</b> из ${norm} ккал${done.length ? "" : " (пока только сегодня)"}`, `🔥 Average <b>${avg}</b> of ${norm} kcal${done.length ? "" : " (today only so far)"}`),
      L(u, `🎯 В норме <b>${inNormDays} из ${recorded}</b> ${plural(recorded, "дня", "дней", "дней")}`, `🎯 On goal <b>${inNormDays} of ${recorded}</b> ${dayWord(u, recorded)}`),
    ];
    if (best) stats.push(L(u, `🏆 Лучший день — ${wdOf(best.d, u).toLowerCase()}, ${shortDate(best.d, u)} · <b>${best.k}</b> ккал`, `🏆 Best day — ${wdOf(best.d, u)}, ${shortDate(best.d, u)} · <b>${best.k}</b> kcal`));
    if (avgWater) stats.push(L(u, `💧 Вода в среднем <b>${liters(avgWater, u)}</b> из ${liters(waterGoal(u), u)}`, `💧 Average water <b>${liters(avgWater, u)}</b> of ${liters(waterGoal(u), u)}`));
    const wk = weights.filter((w) => w.date >= dates[0]);
    if (wk.length > 1) {
      const diff = r1(wk[wk.length - 1].kg - wk[0].kg);
      stats.push(L(u, `⚖️ Вес <b>${wk[wk.length - 1].kg} кг</b> · ${diff > 0 ? "+" : ""}${diff} кг за неделю`, `⚖️ Weight <b>${wk[wk.length - 1].kg} kg</b> · ${diff > 0 ? "+" : ""}${diff} kg this week`));
    }
    text += `📊 <b>${L(u, "Итоги", "Summary")}</b>\n\n${stats.join("\n")}\n\n\n`;
    text += `💡 <i>${weekTip(u, avg, norm)}</i>`;
  }
  return send(env, chatId, text, {
    reply_markup: {
      inline_keyboard: [
        [{ text: L(u, "🥗 Что съесть сегодня", "🥗 What to eat today"), callback_data: "advice" }, { text: L(u, "🧠 Разбор от ИИ", "🧠 AI review"), callback_data: "ai_week" }],
        [{ text: L(u, "📊 Сегодня", "📊 Today"), callback_data: "today" }, appButton(env, u, "📱 Дневник", "📱 Diary")],
      ],
    },
  });
}

// Короткий совет по итогам недели
function weekTip(u, avg, norm) {
  const pct = avg / norm;
  if (pct < 0.8) {
    return u.goal === "gain"
      ? L(u, `Не хватает в среднем ${norm - avg} ккал в день. Для набора массы добавь 2 перекуса: творог, орехи, банан, кашу`,
             `You're short by ${norm - avg} kcal a day on average. To gain mass, add 2 snacks: cottage cheese, nuts, a banana, oatmeal`)
      : L(u, `Ты ешь меньше нормы на ${norm - avg} ккал в день. Слишком большой дефицит мешает результату, держись хотя бы 80% нормы`,
             `You're eating ${norm - avg} kcal a day below your goal. Too big a deficit hurts results — stay at 80% of your goal at least`);
  }
  if (pct > 1.1) {
    return u.goal === "lose"
      ? L(u, `В среднем больше нормы на ${avg - norm} ккал. Замени сладкое и снеки на фрукты и белок`,
             `You're ${avg - norm} kcal a day over your goal on average. Swap sweets and snacks for fruit and protein`)
      : L(u, `В среднем больше нормы на ${avg - norm} ккал. Следи за порциями и вечерними перекусами`,
             `You're ${avg - norm} kcal a day over your goal on average. Watch portion sizes and evening snacks`);
  }
  return L(u, "Ты держишься в норме, так держать 💪", "You're staying within your goal, keep it up 💪");
}

const ADVICE_SCHEMA = {
  type: "OBJECT",
  properties: {
    intro: { type: "STRING", description: "One short sentence: what to focus on right now" },
    options: {
      type: "ARRAY",
      description: "Exactly 3 meal options",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING", description: "Dish name, short" },
          why: { type: "STRING", description: "Why it fits, 3–7 words" },
          items: { type: "ARRAY", items: ITEM_SCHEMA },
        },
        required: ["title", "why", "items"],
      },
    },
  },
  required: ["intro", "options"],
};

const advicePrompt = (u) => `You are a nutritionist assistant in the FITTER Telegram bot. Write in ${aiLang(u)}, simply and in a friendly way.
Suggest 3 different options for the next meal that help reach or not exceed the daily goal.
Rules:
• Consider the time of day: breakfast in the morning, lunch in the afternoon, a light dinner in the evening, a light snack late at night.
• Consider the remaining calories and especially protein. If protein is short, focus on it.
• If almost no calories are left or the goal is exceeded, suggest light options up to 200 kcal.
• Dishes are simple, made from common ingredients available in regular supermarkets, ready in 15 minutes or bought in a shop.
• Do not repeat what the person has already eaten today. Rely on the foods they usually eat during the week.
• For each option give the products with weight in grams and calories/protein/fat/carbs per 100 g.`;

// 🥗 Что съесть: 3 варианта под остаток нормы, любой можно сразу записать
async function sendAdvice(env, u, chatId) {
  if (!checkAiLimit(env, u)) return send(env, chatId, L(u, "На сегодня лимит запросов к нейросети закончился 😔 Завтра снова можно!", "You've used up today's AI requests 😔 Try again tomorrow!"));
  await saveUser(env, u);
  tg(env, "sendChatAction", { chat_id: chatId, action: "typing" });
  let a;
  try {
    a = await makeAdvice(env, u);
  } catch (e) {
    console.error("advice error:", e && e.stack ? e.stack : e);
    return send(env, chatId, L(u, "😔 Нейросеть сейчас не отвечает. Попробуй ещё раз через минуту.", "😔 The AI isn't responding right now. Please try again in a minute."));
  }
  if (!a) return send(env, chatId, L(u, "Не получилось подобрать варианты, попробуй ещё раз 🙏", "Couldn't come up with options, please try again 🙏"));
  return send(env, chatId, adviceText(u, a.left, a.intro, a.options), { reply_markup: adviceKeyboard(u, a.options) });
}

// Подобрать 3 варианта под остаток нормы и запомнить их на 6 часов. null — нейросеть ничего не предложила
async function makeAdvice(env, u, like = "") {
  const date = today(u);
  const dates = [...Array(7)].map((_, i) => shiftDate(date, i - 6));
  const days = await Promise.all(dates.map((d) => getDay(env, u.id, d)));
  const day = days.at(-1);
  const t = dayTotals(day), g = u.targets;
  const left = { kcal: round(g.kcal - t.kcal), p: round(g.p - t.p), f: round(g.f - t.f), c: round(g.c - t.c) };
  const eaten = day.meals.map((m) => m.title).join(", ") || "nothing yet";
  const usual = [...new Set(days.slice(0, -1).flatMap((d) => d.meals.map((m) => m.title)))].slice(-15).join(", ") || "no data";
  const ctx =
    `It is ${nowTime(u)} now. Goal: ${GOALS[u.goal][1]}. Daily target: ${g.kcal} kcal, protein ${g.p}, fat ${g.f}, carbs ${g.c}.\n` +
    `Eaten today: ${round(t.kcal)} kcal, protein ${round(t.p)}, fat ${round(t.f)}, carbs ${round(t.c)} (${eaten}).\n` +
    `Left: ${left.kcal} kcal, protein ${left.p}, fat ${left.f}, carbs ${left.c}.\nAte this week: ${usual}.` +
    (like ? `\nThe person liked “${like}”: suggest 3 dishes similar in taste and composition, but not this dish itself.` : "");
  const res = await gemini(env, [{ text: `${advicePrompt(u)}\n\n${ctx}` }], ADVICE_SCHEMA, 0.8);
  const options = (Array.isArray(res.options) ? res.options : [])
    .map((o) => ({ title: String(o.title || "").trim().slice(0, 60), why: String(o.why || "").trim().slice(0, 80), items: cleanItems(o.items) }))
    .filter((o) => o.title && o.items.length)
    .slice(0, 3);
  if (!options.length) return null;
  const intro = String(res.intro || "").trim().slice(0, 200);
  await env.DB.put(`adv:${u.id}`, JSON.stringify({ date, options, intro, left }), { expirationTtl: 6 * 3600 });
  return { date, options, intro, left };
}

const RECIPE_SCHEMA = {
  type: "OBJECT",
  properties: {
    time: { type: "STRING", description: "Cooking time, for example “10 minutes”" },
    ingredients: { type: "ARRAY", items: { type: "STRING" }, description: "Ingredients with amounts" },
    steps: { type: "ARRAY", items: { type: "STRING" }, description: "Cooking steps, short" },
    tip: { type: "STRING", description: "One tip for the dish, may be an empty string" },
  },
  required: ["time", "ingredients", "steps"],
};

// Полный рецепт варианта «Что съесть» (кэшируется внутри adv:, пока варианты живы)
async function makeRecipe(env, u, saved, i) {
  const o = saved.options[i];
  if (saved.recipes?.[i]) return saved.recipes[i];
  const list = o.items.map((it) => `${it.name} ${it.grams} g`).join(", ");
  const res = await gemini(env, [{ text:
    `You are FITTER's cooking assistant. Write a simple recipe in ${aiLang(u)} for “${o.title}” made from: ${list}. ` +
    `Keep the same weights. No more than 6 short steps, no filler.` }], RECIPE_SCHEMA, 0.5);
  const strs = (a, n, len) => (Array.isArray(a) ? a : []).map((x) => String(x || "").trim().slice(0, len)).filter(Boolean).slice(0, n);
  const recipe = {
    time: String(res.time || "").trim().slice(0, 40),
    ingredients: strs(res.ingredients, 15, 100),
    steps: strs(res.steps, 8, 300),
    tip: String(res.tip || "").trim().slice(0, 200),
  };
  if (!recipe.steps.length) return null;
  saved.recipes = { ...(saved.recipes || {}), [i]: recipe };
  await env.DB.put(`adv:${u.id}`, JSON.stringify(saved), { expirationTtl: 6 * 3600 });
  return recipe;
}

// Варианты «Что съесть» для приложения: КБЖУ каждого варианта уже посчитаны
function advicePayload(a) {
  return {
    date: a.date, intro: a.intro || "", left: a.left || null,
    options: a.options.map((o) => {
      const t = sumItems(o.items);
      return { title: o.title, why: o.why, kcal: round(t.kcal), p: round(t.p), f: round(t.f), c: round(t.c), items: o.items.map((it) => ({ name: it.name, grams: it.grams })) };
    }),
  };
}

const NUMS = ["1️⃣", "2️⃣", "3️⃣"];

function adviceText(u, left, intro, options) {
  const head = left.kcal > 0
    ? L(u,
        `Осталось на сегодня <b>${left.kcal} ккал</b> · 🥩 ${Math.max(0, left.p)} г · 🧈 ${Math.max(0, left.f)} г · 🍞 ${Math.max(0, left.c)} г`,
        `<b>${left.kcal} kcal</b> left today · 🥩 ${Math.max(0, left.p)} g · 🧈 ${Math.max(0, left.f)} g · 🍞 ${Math.max(0, left.c)} g`)
    : L(u,
        `Норма на сегодня уже набрана${left.kcal < 0 ? `, сверху <b>${-left.kcal} ккал</b>` : ""}. Если хочется есть — вот лёгкие варианты`,
        `Today's goal is already reached${left.kcal < 0 ? `, <b>${-left.kcal} kcal</b> over` : ""}. If you're still hungry, here are some light options`);
  const list = options.map((o, i) => {
    const t = sumItems(o.items);
    return `${NUMS[i]} <b>${esc(o.title)}</b> · ${round(t.kcal)} ${L(u, "ккал", "kcal")}\n` +
      `${o.items.map((it) => `${esc(it.name)} ${it.grams} ${L(u, "г", "g")}`).join(", ")}\n` +
      `<i>${L(u, "Б", "P")} ${round(t.p)} · ${L(u, "Ж", "F")} ${round(t.f)} · ${L(u, "У", "C")} ${round(t.c)}${o.why ? " — " + esc(o.why) : ""}</i>`;
  });
  return `🥗 <b>${L(u, "Что съесть", "What to eat")}</b>\n\n${head}\n\n` +
    (intro ? `💡 <i>${esc(String(intro).slice(0, 200))}</i>\n\n` : "") +
    `\n${list.join("\n\n")}\n\n\n` +
    `<i>${L(u, "Съел вариант? Нажми его номер, и я запишу в дневник", "Ate one of these? Tap its number and I'll log it in your diary")}</i>`;
}

function adviceKeyboard(u, options) {
  return {
    inline_keyboard: [
      options.map((_, i) => ({ text: `✅ ${NUMS[i]}`, callback_data: `adv|${i}` })),
      [{ text: L(u, "🔄 Другие варианты", "🔄 Other options"), callback_data: "advice" }, { text: L(u, "📊 Сегодня", "📊 Today"), callback_data: "today" }],
    ],
  };
}

async function sendProfile(env, u, chatId) {
  const t = u.targets;
  const yrs = L(u, `${u.age} ${plural(u.age, "год", "года", "лет")}`, `${u.age} years old`);
  // Доля калорий из белков, жиров и углеводов
  const share = (g, k) => `${Math.round((g * k * 100) / t.kcal)}%`;
  const glasses = Math.round(waterGoal(u) / 250);
  const text =
    `👤 <b>${esc(u.name || L(u, "Профиль", "Profile"))}</b>\n<i>${L(u, "Твои данные и норма на день", "Your details and daily goal")}</i>\n\n\n` +
    `${u.sex === "m" ? L(u, "👨 Мужчина", "👨 Man") : L(u, "👩 Женщина", "👩 Woman")} · 🎂 ${yrs}\n` +
    L(u, `📏 Рост  <b>${u.height}</b> см\n⚖️ Вес  <b>${u.weight}</b> кг\n`, `📏 Height  <b>${u.height}</b> cm\n⚖️ Weight  <b>${u.weight}</b> kg\n`) +
    `${activityText(u, u.activity)}\n` +
    `${goalText(u, u.goal)}\n\n\n` +
    `🎯 <b>${L(u, "Норма на день", "Daily goal")}</b>\n\n` +
    `🔥 <b>${t.kcal}</b> ${L(u, "ккал", "kcal")}\n` +
    `🥩 ${L(u, "Белки", "Protein")}  <b>${t.p}</b> ${L(u, "г", "g")} · <i>${share(t.p, 4)}</i>\n` +
    `🧈 ${L(u, "Жиры", "Fat")}  <b>${t.f}</b> ${L(u, "г", "g")} · <i>${share(t.f, 9)}</i>\n` +
    `🍞 ${L(u, "Углеводы", "Carbs")}  <b>${t.c}</b> ${L(u, "г", "g")} · <i>${share(t.c, 4)}</i>\n` +
    `💧 ${L(u, "Вода", "Water")}  <b>${liters(waterGoal(u), u)}</b> · <i>${glasses} ${L(u, plural(glasses, "стакан", "стакана", "стаканов"), glasses === 1 ? "glass" : "glasses")}</i>\n\n` +
    // Цитата без иконок: так Telegram принимает сообщение с первой попытки
    L(u,
      `<blockquote>Считаю по формуле <b>Миффлина — Сан-Жеора</b> с учётом активности и цели.\nНорма пересчитается сама, когда запишешь новый вес</blockquote>`,
      `<blockquote>Calculated with the <b>Mifflin–St Jeor</b> formula, based on your activity and goal.\nYour goal updates automatically when you log a new weight</blockquote>`);
  return send(env, chatId, text, {
    reply_markup: {
      inline_keyboard: [
        [{ text: L(u, "⚖️ Записать вес", "⚖️ Log weight"), callback_data: "askw" }, { text: L(u, "🏆 Достижения", "🏆 Achievements"), callback_data: "awards" }],
        [{ text: L(u, "📅 Неделя", "📅 Week"), callback_data: "week" }, { text: L(u, "✏️ Изменить анкету", "✏️ Edit profile"), callback_data: "reset" }],
        [{ text: L(u, "🌐 Язык: Русский", "🌐 Language: English"), callback_data: "lang" }],
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
    L(u, `⚖️ Записал: <b>${kg} кг</b>`, `⚖️ Logged: <b>${kg} kg</b>`) +
      (diff ? L(u, ` (${diff > 0 ? "+" : ""}${diff} кг с прошлого раза)`, ` (${diff > 0 ? "+" : ""}${diff} kg since last time)`) : "") +
      (list.length && total ? L(u, `\nС начала: ${total > 0 ? "+" : ""}${total} кг`, `\nSince the start: ${total > 0 ? "+" : ""}${total} kg`) : "") +
      L(u, `\n\nНорма пересчитана: <b>${u.targets.kcal} ккал</b> в день`, `\n\nYour goal is recalculated: <b>${u.targets.kcal} kcal</b> a day`),
    { reply_markup: mainKb(u) }
  );
  await announce(env, chatId, fresh, u);
  return r;
}

// ───────────────────────────── Серии и достижения ─────────────────────────────

// [id, иконка, название, описание, какой счётчик смотреть, сколько нужно, название (en), описание (en)]
const ACHIEVEMENTS = [
  ["first_meal", "🍽", "Первый шаг", "Записать первый приём пищи", "meals", 1, "First step", "Log your first meal"],
  ["meals_10", "📷", "Фотограф", "10 записей еды", "meals", 10, "Photographer", "10 food entries"],
  ["meals_50", "📓", "Дневник в деле", "50 записей еды", "meals", 50, "Diary in action", "50 food entries"],
  ["meals_100", "💯", "Сотня", "100 записей еды", "meals", 100, "The hundred", "100 food entries"],
  ["streak_3", "🔥", "Разгон", "3 дня подряд с записями", "best", 3, "Warming up", "3 days in a row with entries"],
  ["streak_7", "🔥", "Неделя без пропусков", "7 дней подряд с записями", "best", 7, "A week without gaps", "7 days in a row with entries"],
  ["streak_30", "🔥", "Железная привычка", "30 дней подряд с записями", "best", 30, "Iron habit", "30 days in a row with entries"],
  ["norm_1", "🎯", "Точно в цель", "Первый день в норме калорий", "normDays", 1, "Bullseye", "First day within your calorie goal"],
  ["norm_7", "🎯", "Снайпер", "7 дней в норме калорий", "normDays", 7, "Sharpshooter", "7 days within your calorie goal"],
  ["water_1", "💧", "Водный баланс", "Выполнить норму воды", "waterDays", 1, "Water balance", "Reach your water goal"],
  ["water_7", "💧", "Как рыба в воде", "7 дней с нормой воды", "waterDays", 7, "Like a fish in water", "7 days of reaching your water goal"],
  ["pack_1", "📦", "Сканер", "Добавить продукт по этикетке или штрихкоду", "packs", 1, "Scanner", "Add a product from a label or barcode"],
  ["weigh_4", "⚖️", "На контроле", "Записать вес 4 раза", "weighs", 4, "Keeping track", "Log your weight 4 times"],
];
const achName = (u, a) => L(u, a[2], a[6]);
const achDesc = (u, a) => L(u, a[3], a[7]);

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

async function announce(env, chatId, fresh, u) {
  if (!fresh.length) return;
  const list = fresh.map((a) => `${a[1]} <b>${achName(u, a)}</b>\n<i>${achDesc(u, a)}</i>`).join("\n\n");
  return send(env, chatId, `🏆 <b>${fresh.length > 1 ? L(u, "Новые достижения!", "New achievements!") : L(u, "Новое достижение!", "New achievement!")}</b>\n\n${list}`, {
    message_effect_id: EFFECT_PARTY,
    reply_markup: { inline_keyboard: [[{ text: L(u, "🏆 Все достижения", "🏆 All achievements"), callback_data: "awards" }]] },
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
    L(u, `🏆 <b>Достижения</b> · ${got.length} из ${ACHIEVEMENTS.length}\n\n`, `🏆 <b>Achievements</b> · ${got.length} of ${ACHIEVEMENTS.length}\n\n`) +
    L(u, `🔥 Серия: <b>${n}</b> ${dayWord(u, n)} подряд · рекорд ${u.streak?.best || 0}\n\n\n`, `🔥 Streak: <b>${n}</b> ${dayWord(u, n)} in a row · best ${u.streak?.best || 0}\n\n\n`);
  if (got.length) {
    text += `<b>${L(u, "Получено", "Earned")}</b>\n\n${got.map((a) => `${a[1]} <b>${achName(u, a)}</b> · ${achDesc(u, a)}`).join("\n")}\n\n\n`;
  }
  if (left.length) {
    // Ближайшие награды — те, к которым ты ближе всего
    const near = [...left].sort((x, y) => statValue(u, y[4]) / y[5] - statValue(u, x[4]) / x[5]);
    const show = near.slice(0, 4);
    text += `<b>${L(u, "Ближайшие", "Up next")}</b>\n\n${show.map((a) => `🔒 ${achName(u, a)} · ${achDesc(u, a)} · <i>${Math.min(statValue(u, a[4]), a[5])}/${a[5]}</i>`).join("\n")}` +
      (near.length > show.length ? L(u, `\n\n<i>И ещё ${near.length - show.length} впереди</i>`, `\n\n<i>${near.length - show.length} more ahead</i>`) : "");
  } else {
    text += L(u, "Ты собрал все награды! 🎉", "You've earned every award! 🎉");
  }
  return send(env, chatId, text.trim(), { reply_markup: { inline_keyboard: [[{ text: L(u, "👤 Профиль", "👤 Profile"), callback_data: "profile" }, appButton(env, u, "📱 Дневник", "📱 Diary")]] } });
}

// ───────────────────────────── ИИ-разбор недели ─────────────────────────────

const ANALYSIS_SCHEMA = {
  type: "OBJECT",
  properties: {
    score: { type: "INTEGER", description: "Nutrition score for the week from 1 to 10" },
    summary: { type: "STRING", description: "2–3 sentences: overall result of the week" },
    good: { type: "ARRAY", items: { type: "STRING" }, description: "2–3 specific things that went well" },
    improve: { type: "ARRAY", items: { type: "STRING" }, description: "1–3 specific things worth improving" },
    tips: { type: "ARRAY", items: { type: "STRING" }, description: "Exactly 3 simple practical tips for next week" },
  },
  required: ["score", "summary", "good", "improve", "tips"],
};

const analysisPrompt = (u) => `You are a friendly nutritionist in the FITTER app. Review the user's nutrition for the last 7 days.
Rely only on the data below: calories, protein, fat, carbs, water, meals and the goal.
Write in ${aiLang(u)}, briefly, specifically and kindly, without markdown. Each item is one sentence up to 120 characters.
Praise real successes and suggest improvements gently and realistically. Do not diagnose and do not recommend strict diets.
If there are few entries, keep in mind that some food may not have been logged.`;

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
  // Разбор в кэше написан на том языке, который был тогда: после смены языка считаем заново
  if (cached && (cached.lang || "ru") === langOf(u)) return cached;
  if (!checkAiLimit(env, u)) return { limit: true };
  await saveUser(env, u);
  const g = u.targets;
  const lines = dates.map((d, i) => {
    const day = days[i];
    if (!day.meals.length) return `${d}: no entries` + (day.water ? `, water ${day.water} ml` : "");
    const t = dayTotals(day);
    return `${d}: ${round(t.kcal)} kcal, protein ${round(t.p)}, fat ${round(t.f)}, carbs ${round(t.c)}, water ${day.water || 0} ml; meals: ` +
      day.meals.map((m) => m.title).join("; ");
  });
  const wk = weights.filter((w) => w.date >= dates[0]);
  const ctx =
    `User: ${u.sex === "m" ? "man" : "woman"}, ${u.age} years old, height ${u.height} cm, weight ${u.weight} kg, ` +
    `activity: ${ACTIVITY[u.activity][1]}, goal: ${GOALS[u.goal][1]}.\n` +
    `Daily goal: ${g.kcal} kcal, protein ${g.p} g, fat ${g.f} g, carbs ${g.c} g, water ${waterGoal(u)} ml.\n` +
    (wk.length > 1 ? `Weight this week: ${wk[0].kg} → ${wk[wk.length - 1].kg} kg.\n` : "") +
    `Days:\n${lines.join("\n")}`;
  const res = await gemini(env, [{ text: `${analysisPrompt(u)}\n\n${ctx}` }], ANALYSIS_SCHEMA, 0.5);
  const clean = (arr, n) => (Array.isArray(arr) ? arr : []).map((s) => String(s).trim()).filter(Boolean).slice(0, n);
  const out = {
    end, from: dates[0], recorded, lang: langOf(u),
    score: Math.min(10, Math.max(1, Math.round(Number(res.score) || 5))),
    summary: String(res.summary || "").trim().slice(0, 500),
    good: clean(res.good, 3), improve: clean(res.improve, 3), tips: clean(res.tips, 3),
  };
  await env.DB.put(key, JSON.stringify(out), { expirationTtl: 12 * 3600 }).catch(() => {});
  return out;
}

function analysisText(u, a) {
  const nums = ["1️⃣", "2️⃣", "3️⃣"];
  return (
    L(u, `🧠 <b>Разбор недели</b>\n<i>${humanDate(a.from, u)} — ${humanDate(a.end, u)} · ${a.recorded} ${dayWord(u, a.recorded)} с записями</i>\n\n`,
      `🧠 <b>Weekly review</b>\n<i>${humanDate(a.from, u)} — ${humanDate(a.end, u)} · ${a.recorded} ${dayWord(u, a.recorded)} with entries</i>\n\n`) +
    L(u, `🎯 Оценка: <b>${a.score}</b> из 10\n`, `🎯 Score: <b>${a.score}</b> out of 10\n`) + `${squares(a.score, 10)}\n\n` +
    (a.summary ? `<i>${esc(a.summary)}</i>\n\n\n` : "") +
    (a.good.length ? `✅ <b>${L(u, "Что получилось", "What went well")}</b>\n\n${a.good.map((s) => `• ${esc(s)}`).join("\n")}\n\n\n` : "") +
    (a.improve.length ? `🔍 <b>${L(u, "Что улучшить", "What to improve")}</b>\n\n${a.improve.map((s) => `• ${esc(s)}`).join("\n")}\n\n\n` : "") +
    (a.tips.length ? `💡 <b>${L(u, "Советы на неделю", "Tips for the week")}</b>\n\n${a.tips.map((s, i) => `${nums[i]} ${esc(s)}`).join("\n")}\n\n\n` : "") +
    `<i>${L(u, "FITTER считает примерно и не заменяет врача или диетолога", "FITTER's numbers are approximate and don't replace a doctor or dietitian")}</i>`
  );
}

async function sendAnalysis(env, u, chatId, auto = false) {
  const wait = auto ? null : await send(env, chatId, L(u, "🧠 Разбираю твою неделю…", "🧠 Reviewing your week…"));
  const waitId = wait?.result?.message_id;
  const reply = (text, extra = {}) => (waitId ? edit(env, chatId, waitId, text, extra) : send(env, chatId, text, extra));
  try {
    const a = await makeAnalysis(env, u);
    if (a.short) {
      return auto ? null : reply(L(u,
        `🧠 Для разбора нужно хотя бы 2 дня с записями за неделю, а сейчас ${a.recorded}.\n\nЗаписывай еду каждый день, и в воскресенье я пришлю подробный разбор 📸`,
        `🧠 A review needs at least 2 days with entries this week, and you have ${a.recorded}.\n\nLog your food every day and on Sunday I'll send a detailed review 📸`));
    }
    if (a.limit) return auto ? null : reply(L(u, "На сегодня лимит запросов к нейросети закончился 😔 Попробуй завтра!", "You've used up today's AI requests 😔 Try again tomorrow!"));
    const buttons = [[{ text: L(u, "📅 Неделя", "📅 Week"), callback_data: "week" }, appButton(env, u, "📱 Дневник", "📱 Diary")]];
    if (auto) buttons.push([{ text: L(u, "🔕 Не присылать по воскресеньям", "🔕 Stop Sunday reviews"), callback_data: "an_off" }]);
    return reply(analysisText(u, a), { reply_markup: { inline_keyboard: buttons } });
  } catch (e) {
    console.error("analysis error:", e && e.stack ? e.stack : e);
    return auto ? null : reply(L(u, "😔 Нейросеть сейчас не отвечает. Попробуй ещё раз через минуту.", "😔 The AI isn't responding right now. Please try again in a minute."));
  }
}

// Каждое воскресенье вечером: разбор недели всем, у кого было 3+ дня с записями
// За запуск рассылается не больше WEEKLY_PER_RUN разборов; остальных добирают следующие запуски (см. scheduled).
// Отметка wk:<id>:<дата> не даёт разобрать одного и того же пользователя дважды и не даёт одним и тем же людям занимать лимит.
const WEEKLY_PER_RUN = 50;

async function weeklyRun(env) {
  let cursor, sent = 0;
  do {
    const page = await env.DB.list({ prefix: "u:", cursor });
    for (const k of page.keys) {
      if (sent >= WEEKLY_PER_RUN) return;
      const u = await env.DB.get(k.name, "json");
      if (!u || !u.targets || u.weekly === false) continue;
      const mark = `wk:${u.id}:${today(u)}`;
      if (await env.DB.get(mark)) continue;
      const { recorded } = await weekData(env, u);
      await env.DB.put(mark, "1", { expirationTtl: 8 * 86400 });
      if (recorded < 3) continue;
      await sendAnalysis(env, u, u.id, true);
      sent++;
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
}

// ───────────────────────────── Напоминания о воде ─────────────────────────────

const WR_EVERY = [30, 60, 90, 120];
const WR_FROM = [6, 7, 8, 9, 10, 11];
const WR_TO = [20, 21, 22, 23, 24];
const hh = (h) => `${String(h % 24).padStart(2, "0")}:00`;
const everyLabel = (m, u) => ({ 30: L(u, "30 мин", "30 min"), 60: L(u, "1 ч", "1 h"), 90: L(u, "1,5 ч", "1.5 h"), 120: L(u, "2 ч", "2 h") })[m] || L(u, `${m} мин`, `${m} min`);

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
    L(u, `⏰ <b>Напоминания о воде</b>\n\n`, `⏰ <b>Water reminders</b>\n\n`) +
    (on
      ? L(u,
          `🔔 Каждые <b>${everyLabel(w.every, u)}</b>\n🌅 С <b>${hh(w.from)}</b>\n🌙 До <b>${hh(w.to)}</b>\n\n` +
            `<i>Ночью молчу. Когда норма воды выполнена, напоминания на сегодня заканчиваются</i>`,
          `🔔 Every <b>${everyLabel(w.every, u)}</b>\n🌅 From <b>${hh(w.from)}</b>\n🌙 Until <b>${hh(w.to)}</b>\n\n` +
            `<i>I stay quiet at night. Once your water goal is reached, reminders stop for the day</i>`)
      : L(u,
          `<i>Сейчас выключены. Выбери, как часто напоминать, и я буду писать днём, пока не наберётся норма</i>`,
          `<i>Currently off. Choose how often to remind you and I'll message you during the day until you reach your goal</i>`))
  );
}

function remindKeyboard(u) {
  const w = u.wr || {};
  const rows = [WR_EVERY.map((m) => ({ text: (w.every === m ? "✅ " : "") + everyLabel(m, u), callback_data: `wr|every|${m}` }))];
  if (w.every) {
    rows.push([
      { text: L(u, `🌅 С ${hh(w.from)}`, `🌅 From ${hh(w.from)}`), callback_data: "wr|pick|from" },
      { text: L(u, `🌙 До ${hh(w.to)}`, `🌙 Until ${hh(w.to)}`), callback_data: "wr|pick|to" },
    ]);
    rows.push([{ text: L(u, "🔕 Выключить", "🔕 Turn off"), callback_data: "wr|off" }]);
  }
  return { inline_keyboard: rows };
}

function pickKeyboard(u, which) {
  const list = which === "from" ? WR_FROM : WR_TO;
  const cur = u.wr?.[which];
  return {
    inline_keyboard: [
      list.map((h) => ({ text: (cur === h ? "✅ " : "") + hh(h), callback_data: `wr|${which}|${h}` })),
      [{ text: L(u, "↩️ Назад", "↩️ Back"), callback_data: "wr|menu" }],
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
  if (action === "every" && WR_EVERY.includes(Number(value))) {
    const was = w.every;
    w.every = Number(value);
    w.last = Date.now();
    await wrIndex(env, u.id, true);
    const lbl = everyLabel(w.every, u);
    note = was ? L(u, `✅ Теперь напоминаю каждые ${lbl}`, `✅ Now reminding you every ${lbl}`) : L(u, `✅ Напоминания включены: каждые ${lbl}`, `✅ Reminders on: every ${lbl}`);
  } else if (action === "from" && WR_FROM.includes(Number(value))) {
    w.from = Number(value);
    note = L(u, `🌅 Начало дня: ${hh(w.from)}`, `🌅 Day starts at ${hh(w.from)}`);
  } else if (action === "to" && WR_TO.includes(Number(value))) {
    w.to = Number(value);
    note = L(u, `🌙 Конец дня: ${hh(w.to)}`, `🌙 Day ends at ${hh(w.to)}`);
  } else if (action === "off") {
    w.every = 0;
    await wrIndex(env, u.id, false);
    note = L(u, "🔕 Напоминания о воде выключены", "🔕 Water reminders are off");
  } else if (action === "pick" && (value === "from" || value === "to")) {
    await answer();
    const q = value === "from"
      ? L(u, "🌅 <b>Когда начинается твой день?</b>\nРаньше этого времени я не напоминаю.", "🌅 <b>When does your day start?</b>\nI won't remind you before this time.")
      : L(u, "🌙 <b>Когда заканчивается твой день?</b>\nПосле этого времени я не напоминаю.", "🌙 <b>When does your day end?</b>\nI won't remind you after this time.");
    return edit(env, chatId, msgId, q, { reply_markup: pickKeyboard(u, value) });
  }
  await saveUser(env, u);
  await answer(note.replace(/^\S+ /, ""));
  return edit(env, chatId, msgId, remindText(u, note), { reply_markup: remindKeyboard(u) });
}

// Каждые 30 минут: кому пора напомнить о воде
async function waterTick(env, now = Date.now()) {
  const ids = (await env.DB.get("wr:ids", "json")) || [];
  const results = await perUser(ids, (id) => waterOne(env, id, now));
  return results.reduce((a, b) => a + b, 0);
}

// Пользователи обрабатываются пачками по 10: один сбой не рвёт остальных, а отправка не идёт по одному
async function perUser(items, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += 10) {
    out.push(...(await Promise.all(items.slice(i, i + 10).map((x) => fn(x).catch((e) => { console.error("cron user error:", e && e.stack ? e.stack : e); return 0; })))));
  }
  return out;
}

async function waterOne(env, id, now) {
  const u = await env.DB.get(`u:${id}`, "json");
  const w = u?.wr;
  if (!u || !u.targets || !w || !w.every) return 0;
  const local = new Date(now + tzOf(u) * 60000);
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  if (minutes < w.from * 60 || minutes >= w.to * 60) return 0; // ночь
  if (now - (w.last || 0) < w.every * 60000 - 10 * 60000) return 0; // ещё рано (запас 10 минут на расписание)
  const date = local.toISOString().slice(0, 10);
  const day = await getDay(env, u.id, date);
  const ml = day.water || 0;
  const goal = waterGoal(u);
  if (ml >= goal) return 0; // норма уже выполнена
  // Перечитываем пользователя: пока шёл запрос, он мог поменять настройки, и целиком перезаписывать старую копию нельзя
  const fresh = await getUser(env, u.id);
  if (!fresh?.wr?.every) return 0;
  fresh.wr.last = now;
  await saveUser(env, fresh);
  const left = goal - ml;
  await send(env, u.id,
    L(u,
      `💧 <b>Время попить воды!</b>\n\n<b>${liters(ml, u)}</b> из ${liters(goal, u)} · ${pctOf(ml, goal)}%\n${squares(ml, goal, "🟦")}\n` +
        `Осталось ${left} мл, это примерно ${Math.ceil(left / 250)} стак.`,
      `💧 <b>Time for some water!</b>\n\n<b>${liters(ml, u)}</b> of ${liters(goal, u)} · ${pctOf(ml, goal)}%\n${squares(ml, goal, "🟦")}\n` +
        `${left} ml left, about ${Math.ceil(left / 250)} glasses.`),
    {
      disable_notification: false,
      reply_markup: {
        inline_keyboard: [
          [{ text: "💧 +250 " + L(u, "мл", "ml"), callback_data: `w|${date}|250` }, { text: "💧 +500 " + L(u, "мл", "ml"), callback_data: `w|${date}|500` }],
          [{ text: L(u, "⏰ Настроить напоминания", "⏰ Set up reminders"), callback_data: "wr|menu" }],
        ],
      },
    });
  return 1;
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

function pillReminderKeyboard(u, date, p, t) {
  return {
    inline_keyboard: [
      [{ text: L(u, "✅ Принял", "✅ Taken"), callback_data: `p|t|${date}|${p.id}|${t}` }],
      [{ text: L(u, "⏰ Через 30 мин", "⏰ In 30 min"), callback_data: `p|z|${date}|${p.id}|${t}` }, { text: L(u, "Пропустить", "Skip"), callback_data: `p|s|${date}|${p.id}|${t}` }],
    ],
  };
}

const pillLine = (p) => `<b>${esc(p.name)}</b>${p.dose ? " · " + esc(p.dose) : ""}`;

// Каждые 30 минут: кому пора принять таблетку
async function pillTick(env, now = Date.now()) {
  const ids = (await env.DB.get("pl:ids", "json")) || [];
  const results = await perUser(ids, (id) => pillOne(env, id, now));
  return results.reduce((a, b) => a + b, 0);
}

async function pillOne(env, id, now) {
  let sent = 0;
  const u = await env.DB.get(`u:${id}`, "json");
  if (!u || !u.pills?.length) return 0;
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
        await send(env, u.id, L(u, `💊 <b>Время принять</b>\n${pillLine(p)} · ${t}`, `💊 <b>Time to take</b>\n${pillLine(p)} · ${t}`), { reply_markup: pillReminderKeyboard(u, date, p, t) });
        sent++;
      }
    }
    if (changed) await saveDay(env, u.id, date, day);
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
    await answer(L(u, "Этого препарата уже нет в списке", "This medication is no longer in the list"));
    return tg(env, "editMessageReplyMarkup", { chat_id: chatId, message_id: msgId, reply_markup: { inline_keyboard: [] } });
  }
  const head = `${pillLine(r.p)} · ${t}`;
  const tail = s === "taken" ? L(u, `✅ Принято в ${r.rec.at}`, `✅ Taken at ${r.rec.at}`) : s === "skip" ? L(u, "⏭ Пропущено", "⏭ Skipped") : L(u, `⏰ Напомню в ${r.rec.at}`, `⏰ I'll remind you at ${r.rec.at}`);
  await answer(s === "taken" ? L(u, "Отмечено ✅", "Marked ✅") : s === "skip" ? L(u, "Пропущено", "Skipped") : L(u, `Напомню в ${r.rec.at}`, `I'll remind you at ${r.rec.at}`));
  return edit(env, chatId, msgId, `💊 ${head}\n${tail}`, s === "snooze" ? {} : { reply_markup: { inline_keyboard: [[appButton(env, u, "📱 Все таблетки в дневнике", "📱 All pills in the diary")]] } });
}

// ── Таблетки в чате: список на сегодня, отметки, добавление и удаление ──

// «Витамин D, 1 капсула, 9:00 21:00» → { name, dose, times }; время округляем до 30 минут
function parsePill(text) {
  const times = [];
  let rest = String(text).replace(/(^|[^\d])([01]?\d|2[0-3])[:.]([0-5]\d)(?!\d)/g, (m, pre, h, mm) => {
    times.push(slotOf(`${h.padStart(2, "0")}:${mm}`));
    return pre;
  });
  rest = rest.replace(/(^|\s)(в|и|утром|вечером|at|and|morning|evening)(?=\s|,|$)/gi, " ").replace(/\s+/g, " ").replace(/[\s,;]+$/g, "").trim();
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
      text: L(u, "💊 <b>Таблетки</b>\n\n<i>Добавь витамины или лекарства, и я напомню в чате, когда их принять</i> ⏰", "💊 <b>Pills</b>\n\n<i>Add vitamins or medications and I'll remind you in the chat when to take them</i> ⏰"),
      kb: [[{ text: L(u, "➕ Добавить препарат", "➕ Add medication"), callback_data: "pl|add" }], [appButton(env, u)]],
    };
  }
  if (mode === "edit") {
    return {
      text: L(u, "💊 <b>Мои препараты</b>\n\n\n", "💊 <b>My medications</b>\n\n\n") + list.map((p) => `${pillLine(p)}\n⏰ ${p.times.join(", ")}`).join("\n\n") +
        L(u, "\n\n\n<i>Нажми 🗑, чтобы удалить препарат и его напоминания</i>", "\n\n\n<i>Tap 🗑 to delete a medication and its reminders</i>"),
      kb: [
        ...list.map((p) => [{ text: `🗑 ${p.name}`.slice(0, 60), callback_data: `pl|x|${p.id}` }]),
        list.length < PILL_MAX
          ? [{ text: L(u, "➕ Добавить", "➕ Add"), callback_data: "pl|add" }, { text: L(u, "↩️ Назад", "↩️ Back"), callback_data: "pl|back" }]
          : [{ text: L(u, "↩️ Назад", "↩️ Back"), callback_data: "pl|back" }],
      ],
    };
  }
  const doses = pillDoses(u, day);
  const taken = doses.filter((x) => x.s === "taken").length;
  const lines = doses.map((x) => {
    const tail = x.s === "taken" && x.at ? L(u, ` — в ${x.at}`, ` — at ${x.at}`)
      : x.s === "skip" ? L(u, " — пропущено", " — skipped")
      : x.s === "snooze" ? L(u, ` — напомню в ${x.at}`, ` — reminder at ${x.at}`) : "";
    return `${PILL_ICON[x.s] || "⬜"} ${x.time} <b>${esc(x.name)}</b>${x.dose ? " · " + esc(x.dose) : ""}${tail}`;
  });
  return {
    text: L(u, `💊 <b>Таблетки на сегодня</b> · ${taken} из ${doses.length} принято`, `💊 <b>Pills today</b> · ${taken} of ${doses.length} taken`) +
      `\n\n\n${lines.join("\n")}\n\n\n` +
      L(u, "<i>Нажми на приём, чтобы отметить. Напомню в нужное время</i>", "<i>Tap a dose to mark it. I'll remind you at the right time</i>"),
    kb: [
      ...doses.map((x) => [{ text: `${x.s === "taken" ? "✅" : "⬜"} ${x.time} ${x.name}`.slice(0, 60), callback_data: `pl|m|${date}|${x.id}|${x.time}` }]),
      [{ text: L(u, "➕ Добавить", "➕ Add"), callback_data: "pl|add" }, { text: L(u, "✏️ Изменить", "✏️ Edit"), callback_data: "pl|edit" }],
      [appButton(env, u)],
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
    return send(env, chatId, L(u, `Можно добавить не больше ${PILL_MAX} препаратов. Удали лишний через «✏️ Изменить»`, `You can add up to ${PILL_MAX} medications. Remove one with “✏️ Edit”`));
  }
  u.pills.push({ id: crypto.randomUUID().slice(0, 6), ...p });
  await saveUser(env, u);
  await plIndex(env, u.id, true);
  await send(env, chatId, L(u, `✅ Добавил: ${pillLine(p)}\n⏰ Напомню в ${p.times.join(", ")}`, `✅ Added: ${pillLine(p)}\n⏰ I'll remind you at ${p.times.join(", ")}`), { reply_markup: mainKb(u) });
  return sendPills(env, u, chatId);
}

async function onPillsButton(env, u, chatId, msgId, [, act, a, b, c], answer) {
  if (act === "add") {
    if ((u.pills || []).length >= PILL_MAX) return answer(L(u, `Не больше ${PILL_MAX} препаратов`, `No more than ${PILL_MAX} medications`));
    u.state = { type: "pilladd" };
    await saveUser(env, u);
    await answer();
    return send(
      env, chatId,
      L(u,
        "💊 Напиши название, дозу и время приёма через запятую:\n\n" +
          "<blockquote>Витамин D, 1 капсула, 9:00\nОмега-3, 2 капсулы, 9:00 21:00\nМагний 14:30</blockquote>\n" +
          "<i>Время — с шагом 30 минут, можно несколько через пробел</i>",
        "💊 Send the name, dose and time, separated by commas:\n\n" +
          "<blockquote>Vitamin D, 1 capsule, 9:00\nOmega-3, 2 capsules, 9:00 21:00\nMagnesium 14:30</blockquote>\n" +
          "<i>Time is in 30-minute steps; you can list several separated by spaces</i>"),
      { reply_markup: { force_reply: true, input_field_placeholder: L(u, "Витамин D, 1 капсула, 9:00", "Vitamin D, 1 capsule, 9:00") } }
    );
  }
  if (act === "m" && isDate(a) && isSlot(c)) {
    const day = await getDay(env, u.id, a);
    const was = day.pills?.[pillKey(b, c)]?.s;
    const r = await markPill(env, u, a, b, c, was === "taken" ? "" : "taken");
    if (!r) return answer(L(u, "Этого препарата уже нет в списке", "This medication is no longer in the list"));
    await answer(was === "taken" ? L(u, "Отметка снята", "Mark removed") : L(u, "Отмечено ✅", "Marked ✅"));
    return sendPills(env, u, chatId, msgId);
  }
  if (act === "x") {
    const p = (u.pills || []).find((x) => x.id === a);
    u.pills = (u.pills || []).filter((x) => x.id !== a);
    await saveUser(env, u);
    await plIndex(env, u.id, u.pills.length > 0);
    await answer(p ? L(u, `Удалил «${p.name}»`, `Deleted “${p.name}”`) : L(u, "Уже удалено", "Already deleted"));
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

// ───────────────────────────── Приложение Android: вход через бота ─────────────────────────────
//
// 1. Приложение: POST /api/link/start → { code, secret, url }. Ничего не пишем в базу: код подписан ключом бота.
// 2. Пользователь открывает url (t.me/FitterFoodBot?start=link_<code>) и подтверждает вход кнопкой в боте → lk:<code> = { uid }.
// 3. Приложение раз в пару секунд шлёт POST /api/link/poll { code, secret } и один раз получает постоянный токен.
// 4. Дальше все запросы /api/* — с заголовком Authorization: Bearer <токен>. В базе только хэш: tk:<sha256> = { uid, device, at }.

const LINK_TTL = 600; // ссылка для входа живёт 10 минут
const APP_TOKENS_MAX = 5; // столько телефонов можно подключить, самый старый вход отключается
const BOT_LINK = "https://t.me/FitterFoodBot";

const sha256 = async (s) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
const randHex = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));
async function linkSecret(env, code) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("FitterLink" + env.BOT_TOKEN), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(code)));
}
// Код: время создания (base36) + случайная часть. По времени проверяем срок без базы
function linkCodeAlive(code) {
  if (!/^[0-9a-z]{8}[0-9a-f]{12}$/.test(code || "")) return false;
  const age = Date.now() - parseInt(code.slice(0, 8), 36);
  return age >= 0 && age < LINK_TTL * 1000;
}

async function linkApi(request, url, env) {
  if (request.method !== "POST") return json({ error: "not found" }, 404);
  const body = await request.json().catch(() => ({}));
  if (url.pathname === "/api/link/start") {
    const code = Date.now().toString(36).padStart(8, "0") + randHex(6);
    return json({ code, secret: await linkSecret(env, code), url: `${BOT_LINK}?start=link_${code}`, ttl: LINK_TTL });
  }
  if (url.pathname === "/api/link/poll") {
    const code = String(body.code || "");
    if (!linkCodeAlive(code) || !safeEqual(body.secret, await linkSecret(env, code))) return json({ error: "expired" }, 410);
    // cacheTtl 30 — меньше разрешённого KV не бывает: подтверждение из бота дойдёт до телефона не дольше чем за полминуты
    const link = await env.DB.get(`lk:${code}`, { type: "json", cacheTtl: 30 });
    if (!link) return json({ status: "wait" });
    if (!link.uid) return json({ error: "denied" }, 403);
    await env.DB.delete(`lk:${code}`);
    const u = await getUser(env, link.uid);
    if (!u || !u.targets) return json({ error: "no_profile" }, 404);
    const token = "ft_" + randHex(32);
    const h = await sha256(token);
    const device = String(body.device || "Android").replace(/[<>&\n\r]/g, "").trim().slice(0, 40) || "Android";
    const at = new Date().toISOString();
    u.apps = [...(u.apps || []), { h, device, at }];
    const old = u.apps.slice(0, Math.max(0, u.apps.length - APP_TOKENS_MAX));
    u.apps = u.apps.slice(old.length);
    await Promise.all([env.DB.put(`tk:${h}`, JSON.stringify({ uid: u.id, device, at })), saveUser(env, u), ...old.map((a) => env.DB.delete(`tk:${a.h}`))]);
    return json({ token, name: u.name || "" });
  }
  return json({ error: "not found" }, 404);
}

// Бот: /start link_<code> → просим подтвердить вход, чтобы по чужой ссылке нельзя было увести дневник
async function askLinkConfirm(env, u, chatId, code) {
  if (!linkCodeAlive(code)) return send(env, chatId, L(u, "⌛ Ссылка для входа устарела. Нажми «Войти через Telegram» в приложении ещё раз.", "⌛ The sign-in link has expired. Tap “Sign in with Telegram” in the app again."));
  return send(env, chatId,
    L(u, "📱 <b>Войти в приложение Fitter?</b>\n\nПриложение получит доступ к твоему дневнику: еде, воде, весу и таблеткам.\n\n" +
      "Подтверждай, только если ты сам сейчас нажал «Войти» в приложении Fitter на своём телефоне.",
      "📱 <b>Sign in to the Fitter app?</b>\n\nThe app will get access to your diary: food, water, weight and pills.\n\n" +
      "Confirm only if you just tapped “Sign in” in the Fitter app on your phone."),
    { reply_markup: { inline_keyboard: [[{ text: L(u, "✅ Да, это я", "✅ Yes, it's me"), callback_data: `lnk|y|${code}` }, { text: L(u, "Отмена", "Cancel"), callback_data: `lnk|n|${code}` }]] } });
}

// Бот: кнопки подтверждения входа
async function onLinkCallback(env, u, chatId, msgId, yes, code, answer) {
  if (!linkCodeAlive(code)) {
    await answer(L(u, "Ссылка устарела", "Link expired"));
    return edit(env, chatId, msgId, L(u, "⌛ Ссылка для входа устарела. Нажми «Войти через Telegram» в приложении ещё раз.", "⌛ The sign-in link has expired. Tap “Sign in with Telegram” in the app again."));
  }
  // Отказ тоже записываем: приложение сразу покажет, что вход отменён
  await env.DB.put(`lk:${code}`, JSON.stringify(yes ? { uid: u.id } : { denied: true }), { expirationTtl: LINK_TTL });
  await answer(yes ? L(u, "Готово", "Done") : L(u, "Отменено", "Cancelled"));
  return edit(env, chatId, msgId, yes ? L(u, "✅ Приложение Fitter подключено. Можно вернуться в него.", "✅ The Fitter app is connected. You can go back to it.") : L(u, "Вход в приложение отменён.", "Sign-in cancelled."));
}

// Кто делает запрос: телефон с токеном или дневник в Telegram с подписью initData
async function apiUserId(request, env) {
  const m = (request.headers.get("Authorization") || "").match(/^Bearer (ft_[0-9a-f]{64})$/);
  if (m) {
    const t = await env.DB.get(`tk:${await sha256(m[1])}`, "json");
    return t ? t.uid : null;
  }
  const tgUser = await verifyInitData(request.headers.get("X-Init-Data"), env.BOT_TOKEN);
  return tgUser ? tgUser.id : null;
}

// Записать приём пищи из приложения: время, серия, достижения — как у записи в боте
async function addAppMeal(env, u, date, title, items, source) {
  const day = await getDay(env, u.id, date);
  const meal = {
    id: crypto.randomUUID().slice(0, 8),
    time: date === today(u) ? nowTime(u) : "—",
    title: String(title || items.map((i) => i.name).join(", ")).slice(0, 60),
    items,
    source,
  };
  day.meals.push(meal);
  await saveDay(env, u.id, date, day);
  if (date === today(u)) {
    const fresh = await progress(env, u, "meal", date, { pack: false, inNorm: inNorm(dayTotals(day).kcal, u.targets.kcal) });
    await announce(env, u.id, fresh, u);
  } else {
    // Запись задним числом: серию и счётчики пересчитываем по истории
    delete u.st;
    await ensureStats(env, u, false);
    await saveUser(env, u);
  }
  const t = sumItems(items);
  return { ok: true, id: meal.id, title: meal.title, kcal: round(t.kcal), p: round(t.p), f: round(t.f), c: round(t.c) };
}

// Текст из сообщения бота без HTML-тегов — для приложения
const plainText = (s) => String(s || "").replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

// Сводка за сегодня: виджеты, шапка приложения и живая синхронизация
async function widgetPayload(env, u) {
  const date = today(u);
  const day = await getDay(env, u.id, date);
  const t = dayTotals(day);
  const pills = pillDoses(u, day);
  return {
    date,
    kcal: round(t.kcal), p: round(t.p), f: round(t.f), c: round(t.c),
    targets: u.targets,
    water: day.water || 0,
    waterGoal: waterGoal(u),
    meals: day.meals.length,
    streak: streakNow(u),
    pills: { total: pills.length, taken: pills.filter((x) => x.s === "taken").length, next: pills.find((x) => !x.s && x.time >= nowTime(u))?.time || "" },
    name: u.name || "",
    lang: langOf(u),
  };
}

// День с неделей (Пн–Вс), в которую он входит: дневник и приложение
async function dayPayload(env, u, date) {
  const wd = (new Date(date + "T00:00:00Z").getUTCDay() + 6) % 7;
  const monday = shiftDate(date, -wd);
  const dates = [...Array(7)].map((_, i) => shiftDate(monday, i));
  const [days, weights] = await Promise.all([Promise.all(dates.map((d) => getDay(env, u.id, d))), getWeights(env, u.id)]);
  const day = days[dates.indexOf(date)];
  const meals = day.meals.map((m) => ({ ...m, totals: sumItems(m.items), micro: sumMicro(m.items), items: m.items.map((it) => ({ ...it, totals: itemTotals(it), micro: sumMicro([it]) })) }));
  return {
    date,
    today: today(u),
    targets: u.targets,
    totals: dayTotals(day),
    micro: sumMicro(day.meals.flatMap((m) => m.items)),
    meals,
    week: dates.map((d, i) => ({ date: d, kcal: round(dayTotals(days[i]).kcal), meals: days[i].meals.length })),
    weights: weights.slice(-30),
    streak: streakNow(u),
    water: day.water || 0,
    waterGoal: waterGoal(u),
    pills: pillDoses(u, day),
    pillList: (u.pills || []).map((p) => ({ id: p.id, name: p.name, dose: p.dose || "", times: p.times })),
    name: u.name,
    lang: langOf(u),
  };
}

// ───────────────────────────── Тренировки ─────────────────────────────
//
// Дневник тренировок из приложения: одна запись wo:<id> = { list: [тренировки], custom: [свои упражнения] }.
// Каталог упражнений живёт в приложении, сервер хранит только то, что записано.
// Тренировка: { id, date, title, ex: [{ id, name, kind, effort, sets: [{ w, r, s, km }] }] }
//   kind: w — вес × повторы, r — повторы, t — время, c — кардио (минуты и км); effort: easy | medium | hard | ""

const WO_MAX = 500; // старые тренировки сверх лимита отбрасываются
const WO_CUSTOM_MAX = 100;
const WO_KINDS = ["w", "r", "t", "c"];
const WO_EFFORTS = ["easy", "medium", "hard"];

async function getWorkouts(env, id) {
  const w = await env.DB.get(`wo:${id}`, "json");
  return { list: (w && w.list) || [], custom: (w && w.custom) || [] };
}
async function saveWorkouts(env, id, w) {
  if (!w.list.length && !w.custom.length) return env.DB.delete(`wo:${id}`);
  await env.DB.put(`wo:${id}`, JSON.stringify(w));
}

// Число из тела запроса в разумных пределах, иначе 0
const woNum = (x, max) => {
  const n = Number(x);
  return n > 0 && n <= max ? Math.round(n * 100) / 100 : 0;
};
const woId = (s) => String(s || "").replace(/[^\w:-]/g, "").slice(0, 40);

// Чистим тренировку от приложения: только известные поля и пределы
function cleanWorkout(w, date) {
  const ex = (Array.isArray(w && w.ex) ? w.ex : []).slice(0, 40).map((e) => ({
    id: woId(e && e.id),
    name: String((e && e.name) || "").trim().slice(0, 60),
    kind: WO_KINDS.includes(e && e.kind) ? e.kind : "w",
    effort: WO_EFFORTS.includes(e && e.effort) ? e.effort : "",
    sets: (Array.isArray(e && e.sets) ? e.sets : []).slice(0, 30).map((s) => ({
      w: woNum(s && s.w, 1000), r: Math.round(woNum(s && s.r, 1000)), s: Math.round(woNum(s && s.s, 86400)), km: woNum(s && s.km, 500),
    })),
  })).filter((e) => e.name);
  if (!ex.length) return null;
  return { id: woId(w.id) || crypto.randomUUID().slice(0, 8), date, title: String(w.title || "").trim().slice(0, 60), ex };
}

// Новые сверху: по дате, а в один день — по порядку записи
const woSort = (list) => list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

// ───────────────────────────── Живая синхронизация ─────────────────────────────
//
// На каждого пользователя — свой Durable Object «Live»: держит WebSocket-соединения открытых приложений.
// После любого изменения (бот, дневник, приложение) live() собирает свежую сводку там же, где данные
// только что записаны, и рассылает её. Так приложение не ждёт, пока KV разнесёт запись по миру.

async function live(env, uid) {
  if (!env.LIVE || !uid) return;
  try {
    const stub = env.LIVE.get(env.LIVE.idFromName(String(uid)));
    const n = Number(await (await stub.fetch("https://live/count")).text());
    if (!n) return; // приложение не открыто — не тратим чтения базы
    const u = await getUser(env, uid);
    if (!u || !u.targets) return;
    const [widget, day] = await Promise.all([widgetPayload(env, u), dayPayload(env, u, today(u))]);
    await stub.fetch("https://live/push", { method: "POST", body: JSON.stringify({ type: "sync", widget, day }) });
  } catch (e) {
    console.error("live error:", e && e.stack ? e.stack : e);
  }
}

export class Live {
  constructor(ctx) {
    this.ctx = ctx;
    // Пинг от приложения отвечаем, не будя объект: соединения живут почти бесплатно
    if (typeof WebSocketRequestResponsePair !== "undefined") ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1]);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    const path = new URL(request.url).pathname;
    if (path === "/count") return new Response(String(this.ctx.getWebSockets().length));
    if (path === "/push") {
      const msg = await request.text();
      for (const ws of this.ctx.getWebSockets()) {
        try { ws.send(msg); } catch {}
      }
      return new Response("ok");
    }
    return new Response("not found", { status: 404 });
  }

  async webSocketMessage() {}

  async webSocketClose(ws, code) {
    try { ws.close(code, "bye"); } catch {}
  }
}

async function api(request, url, env) {
  if (url.pathname.startsWith("/api/link/")) return linkApi(request, url, env);
  const uid = await apiUserId(request, env);
  if (!uid) return json({ error: "unauthorized" }, 401);
  env.liveUid = uid;
  const u = await getUser(env, uid);
  if (!u || !u.targets) return json({ error: "no_profile" }, 404);

  // Выход из приложения: токен больше не работает
  if (url.pathname === "/api/logout" && request.method === "POST") {
    const m = (request.headers.get("Authorization") || "").match(/^Bearer (ft_[0-9a-f]{64})$/);
    if (!m) return json({ error: "no token" }, 400);
    const h = await sha256(m[1]);
    u.apps = (u.apps || []).filter((a) => a.h !== h);
    await Promise.all([env.DB.delete(`tk:${h}`), saveUser(env, u)]);
    return json({ ok: true });
  }

  // Живая синхронизация: приложение держит WebSocket, сервер присылает свежие данные при каждом изменении
  if (url.pathname === "/api/live") {
    if (!env.LIVE) return json({ error: "no live" }, 501);
    if (request.headers.get("Upgrade") !== "websocket") return json({ error: "websocket only" }, 426);
    return env.LIVE.get(env.LIVE.idFromName(String(u.id))).fetch(request);
  }

  // Короткая сводка за сегодня для виджетов: одно чтение дня из базы
  if (url.pathname === "/api/widget" && request.method === "GET") return json(await widgetPayload(env, u));

  if (url.pathname === "/api/day" && request.method === "GET") {
    return json(await dayPayload(env, u, isDate(url.searchParams.get("date")) ? url.searchParams.get("date") : today(u)));
  }

  // Советы ИИ в приложении: то, что уже подобрано, без новых запросов к нейросети
  if (url.pathname === "/api/tips" && request.method === "GET") {
    const date = today(u);
    const [adv, an] = await Promise.all([env.DB.get(`adv:${u.id}`, "json"), env.DB.get(`an:${u.id}:${date}`, "json")]);
    return json({ advice: adv && adv.date === date ? advicePayload(adv) : null, analysis: an || null });
  }

  // Дневник тренировок: все записи и свои упражнения
  if (url.pathname === "/api/workouts" && request.method === "GET") return json(await getWorkouts(env, u.id));

  if (request.method === "POST") {
    // Фото приходит в теле запроса (base64), поэтому ограничиваем размер до чтения
    if (Number(request.headers.get("content-length") || 0) > MAX_IMAGE_BYTES * 1.4) return json({ error: "too big" }, 413);
    const body = await request.json().catch(() => ({}));
    // Язык бота и приложения: один на аккаунт, общий для Telegram, дневника и Android
    if (url.pathname === "/api/lang") {
      if (body.lang !== "en" && body.lang !== "ru") return json({ error: "bad lang" }, 400);
      u.lang = body.lang;
      await saveUser(env, u);
      return json({ ok: true, lang: u.lang });
    }
    if (!isDate(body.date)) return json({ error: "bad date" }, 400);
    // Тренировка: новая или исправленная (тот же id)
    if (url.pathname === "/api/workout/save") {
      if (body.date > today(u)) return json({ error: "future" }, 400);
      const w = cleanWorkout(body.workout, body.date);
      if (!w) return json({ error: "empty" }, 400);
      const all = await getWorkouts(env, u.id);
      const i = all.list.findIndex((x) => x.id === w.id);
      if (i >= 0) all.list[i] = w;
      else all.list.unshift(w);
      all.list = woSort(all.list).slice(0, WO_MAX);
      await saveWorkouts(env, u.id, all);
      return json({ ok: true, workout: w });
    }
    if (url.pathname === "/api/workout/delete") {
      const all = await getWorkouts(env, u.id);
      all.list = all.list.filter((x) => x.id !== body.id);
      await saveWorkouts(env, u.id, all);
      return json({ ok: true });
    }
    // Своё упражнение: название и тип (вес × повторы, повторы, время, кардио)
    if (url.pathname === "/api/exercise/add") {
      const name = String(body.name || "").trim().slice(0, 60);
      if (name.length < 2) return json({ error: "empty" }, 400);
      const all = await getWorkouts(env, u.id);
      if (all.custom.length >= WO_CUSTOM_MAX) return json({ error: "too many" }, 400);
      const ex = { id: "c:" + crypto.randomUUID().slice(0, 6), name, kind: WO_KINDS.includes(body.kind) ? body.kind : "w", group: String(body.group || "").slice(0, 20) };
      all.custom.push(ex);
      await saveWorkouts(env, u.id, all);
      return json({ ok: true, exercise: ex });
    }
    if (url.pathname === "/api/exercise/delete") {
      const all = await getWorkouts(env, u.id);
      all.custom = all.custom.filter((x) => x.id !== body.id);
      await saveWorkouts(env, u.id, all);
      return json({ ok: true });
    }
    if (url.pathname === "/api/water") {
      const delta = Number(body.delta);
      if (![250, -250].includes(delta)) return json({ error: "bad delta" }, 400);
      const { day: d, reached, fresh } = await addWater(env, u, body.date, delta);
      await announce(env, u.id, fresh, u);
      return json({ ok: true, water: d.water, reached });
    }
    if (url.pathname === "/api/weight") {
      const kg = Number(body.kg);
      if (!(kg >= 30 && kg <= 300)) return json({ error: "bad weight" }, 400);
      const { fresh } = await saveWeight(env, u, kg);
      await announce(env, u.id, fresh, u);
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
      const items = res.intent === "food_log" ? await finalizeItems(env, res.items) : cleanItems(res.items);
      if (res.intent !== "food_log" || !items.length) return json({ error: "not_food", answer: res.answer || "" }, 422);
      return json(await addAppMeal(env, u, body.date, res.title, items, "app"));
    }

    // Фото еды из приложения: камера или галерея, сжатый JPEG в base64
    if (url.pathname === "/api/meal/photo") {
      const image = String(body.image || "");
      if (image.length < 100 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image)) return json({ error: "bad image" }, 400);
      if (image.length > MAX_IMAGE_BYTES * 1.37) return json({ error: "too big" }, 413);
      if (body.date > today(u)) return json({ error: "future" }, 400);
      if (!checkAiLimit(env, u)) return json({ error: "limit" }, 429);
      await saveUser(env, u);
      let r;
      try {
        r = await analyzePhoto(env, image, "image/jpeg", String(body.caption || "").trim().slice(0, 300), u);
      } catch (e) {
        console.error("app photo error:", e && e.stack ? e.stack : e);
        return json({ error: "ai" }, 502);
      }
      if (!r) return json({ error: "not_food" }, 422);
      return json({ ...(await addAppMeal(env, u, body.date, r.title, r.items, r.source === "photo" ? "app_photo" : r.source)), comment: plainText(r.comment) });
    }

    // «Что съесть»: новые варианты от нейросети
    if (url.pathname === "/api/advice") {
      if (!checkAiLimit(env, u)) return json({ error: "limit" }, 429);
      await saveUser(env, u);
      let a;
      try {
        a = await makeAdvice(env, u);
      } catch (e) {
        console.error("app advice error:", e && e.stack ? e.stack : e);
        return json({ error: "ai" }, 502);
      }
      if (!a) return json({ error: "empty" }, 502);
      return json(advicePayload(a));
    }

    // Полный рецепт варианта
    if (url.pathname === "/api/advice/recipe") {
      const saved = await env.DB.get(`adv:${u.id}`, "json");
      const o = saved?.date === today(u) ? saved.options[Number(body.i)] : null;
      if (!o) return json({ error: "expired" }, 410);
      if (!saved.recipes?.[Number(body.i)] && !checkAiLimit(env, u)) return json({ error: "limit" }, 429);
      await saveUser(env, u);
      let recipe;
      try {
        recipe = await makeRecipe(env, u, saved, Number(body.i));
      } catch (e) {
        console.error("app recipe error:", e && e.stack ? e.stack : e);
        return json({ error: "ai" }, 502);
      }
      if (!recipe) return json({ error: "empty" }, 502);
      return json(recipe);
    }

    // Похожие блюда на выбранный вариант: заменяют текущий список вариантов
    if (url.pathname === "/api/advice/similar") {
      const saved = await env.DB.get(`adv:${u.id}`, "json");
      const o = saved?.date === today(u) ? saved.options[Number(body.i)] : null;
      if (!o) return json({ error: "expired" }, 410);
      if (!checkAiLimit(env, u)) return json({ error: "limit" }, 429);
      await saveUser(env, u);
      let a;
      try {
        a = await makeAdvice(env, u, o.title);
      } catch (e) {
        console.error("app similar error:", e && e.stack ? e.stack : e);
        return json({ error: "ai" }, 502);
      }
      if (!a) return json({ error: "empty" }, 502);
      return json(advicePayload(a));
    }

    // «Съел этот вариант» — записываем в дневник
    if (url.pathname === "/api/advice/eat") {
      const saved = await env.DB.get(`adv:${u.id}`, "json");
      const o = saved?.date === today(u) ? saved.options[Number(body.i)] : null;
      if (!o) return json({ error: "expired" }, 410);
      await env.DB.delete(`adv:${u.id}`);
      return json(await addAppMeal(env, u, today(u), o.title, o.items, "advice"));
    }

    // Разбор недели от нейросети (кэш на 12 часов)
    if (url.pathname === "/api/analysis") {
      let a;
      try {
        a = await makeAnalysis(env, u);
      } catch (e) {
        console.error("app analysis error:", e && e.stack ? e.stack : e);
        return json({ error: "ai" }, 502);
      }
      if (a.short) return json({ error: "short", recorded: a.recorded }, 422);
      if (a.limit) return json({ error: "limit" }, 429);
      return json(a);
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
    // Ручная правка продукта из приложения: название, вес и КБЖУ порции; храним пересчитанными на 100 г
    if (url.pathname === "/api/item/set") {
      const it = meal.items[Number(body.idx)];
      const g = Number(body.grams);
      if (!it || !(g > 0 && g <= 3000)) return json({ error: "bad grams" }, 400);
      const per100 = (x, max) => {
        const n = Number(x);
        return Number.isFinite(n) && n >= 0 && (n * 100) / g <= max ? r1((n * 100) / g) : null;
      };
      const vals = [per100(body.kcal, 900), per100(body.p, 100), per100(body.f, 100), per100(body.c, 100)];
      if (vals.includes(null)) return json({ error: "bad values" }, 400);
      const name = String(body.name || "").trim().slice(0, 60);
      if (name) it.name = name;
      it.grams = round(g);
      [it.kcal_100, it.protein_100, it.fat_100, it.carbs_100] = vals;
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
  // Страница настройки — на языке браузера: русский для ru, иначе английский
  const ruPage = /^\s*ru\b/i.test(request.headers.get("accept-language") || "");
  const R = (ru, en) => (ruPage ? ru : en);
  const page = (rows, form = "", status = 200) =>
    new Response(
      `<!doctype html><html lang="${ruPage ? "ru" : "en"}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
        `<title>${R("FITTER — настройка", "FITTER — setup")}</title><body style="font:16px/1.5 system-ui;max-width:640px;margin:32px auto;padding:0 16px">` +
        `<h2>${R("FITTER — настройка", "FITTER — setup")}</h2>${rows.map(([ok, t]) => `<p>${ok ? "✅" : "❌"} ${t}</p>`).join("")}${form}</body>`,
      { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer", "x-frame-options": "DENY" } }
    );
  if (!env.WEBHOOK_SECRET) return page([[false, R("Не задана переменная WEBHOOK_SECRET", "The WEBHOOK_SECRET variable is not set")]]);
  const form =
    `<form method="post" action="/setup"><p><input type="password" name="secret" placeholder="${R("Секрет", "Secret")}" autocomplete="off" required ` +
    `style="font:inherit;padding:8px;width:100%;box-sizing:border-box"></p><p><button style="font:inherit;padding:8px 16px">${R("Настроить бота", "Set up the bot")}</button></p></form>`;
  if (request.method !== "POST") return page([], `<p>${R("Введи", "Enter")} ${env.SETUP_SECRET ? "SETUP_SECRET" : "WEBHOOK_SECRET"}:</p>` + form);
  const fd = await request.formData().catch(() => null);
  if (!safeEqual(fd && fd.get("secret"), env.SETUP_SECRET || env.WEBHOOK_SECRET)) {
    return page([[false, R("Неверный секрет", "Wrong secret")]], form, 403);
  }
  const rows = [];
  rows.push([!!env.BOT_TOKEN, R("BOT_TOKEN задан", "BOT_TOKEN is set")]);
  rows.push([!!env.GEMINI_API_KEY, R("GEMINI_API_KEY задан", "GEMINI_API_KEY is set")]);
  rows.push([!!env.DB, R("База данных KV подключена (имя DB)", "The KV database is connected (name DB)")]);
  rows.push([true, env.USDA_API_KEY ? R("USDA_API_KEY задан: КБЖУ берутся из базы USDA", "USDA_API_KEY is set: nutrition comes from the USDA database") : R("USDA_API_KEY не задан (необязательно): КБЖУ оценивает только нейросеть", "USDA_API_KEY is not set (optional): nutrition is estimated by the AI only")]);
  rows.push([/^[A-Za-z0-9_-]{1,256}$/.test(env.WEBHOOK_SECRET), R("WEBHOOK_SECRET состоит только из латинских букв, цифр, _ и -", "WEBHOOK_SECRET contains only Latin letters, digits, _ and -")]);
  if (!env.BOT_TOKEN) return page(rows);

  const me = await tg(env, "getMe", {});
  rows.push([me.ok, me.ok ? R(`Бот найден: @${me.result.username}`, `Bot found: @${me.result.username}`) : R("Токен бота неверный — проверь BOT_TOKEN", "The bot token is wrong — check BOT_TOKEN")]);
  if (!me.ok) return page(rows);

  const wh = await tg(env, "setWebhook", {
    url: `${env.ORIGIN}/webhook`,
    secret_token: env.WEBHOOK_SECRET,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
  rows.push([wh.ok, wh.ok ? R("Webhook подключён — бот получает сообщения", "Webhook connected — the bot receives messages") : `Webhook: ${esc(wh.description || R("ошибка", "error"))}`]);

  // Меню команд и описание: английский по умолчанию, русский — для тех, у кого Telegram на русском
  const COMMANDS = [
    ["today", "Today's summary", "Итоги дня"],
    ["week", "Last 7 days", "Последние 7 дней"],
    ["water", "Water today", "Вода за сегодня"],
    ["remind", "Water reminders", "Напоминания о воде"],
    ["pills", "Pills and reminders", "Таблетки и напоминания"],
    ["weight", "Log weight", "Записать вес"],
    ["profile", "Profile and daily goal", "Профиль и норма"],
    ["awards", "Achievements and streak", "Достижения и серия"],
    ["advice", "What to eat: AI tips", "Что съесть: советы от ИИ"],
    ["analysis", "AI weekly review", "Разбор недели от ИИ"],
    ["app", "Open the diary", "Открыть дневник"],
    ["lang", "Language: English / Русский", "Язык: English / Русский"],
    ["help", "How to use", "Как пользоваться"],
    ["reset", "Redo the questionnaire", "Пройти анкету заново"],
    ["delete", "Delete my data", "Удалить мои данные"],
  ];
  const cmds = await tg(env, "setMyCommands", { commands: COMMANDS.map(([command, description]) => ({ command, description })) });
  const cmdsRu = await tg(env, "setMyCommands", { language_code: "ru", commands: COMMANDS.map(([command, , description]) => ({ command, description })) });
  rows.push([cmds.ok && cmdsRu.ok, R("Меню команд установлено (English + Русский)", "Command menu installed (English + Русский)")]);

  const menu = await tg(env, "setChatMenuButton", {
    menu_button: { type: "web_app", text: "Diary", web_app: { url: `${env.ORIGIN}/app` } },
  });
  rows.push([menu.ok, R("Кнопка «Diary» (Mini App) добавлена", "The “Diary” (Mini App) button is added")]);

  await tg(env, "setMyDescription", {
    description: "FITTER — one photo, full control 📸\nSend a photo of your food and the AI counts calories, protein, fat and carbs and logs it all in your food diary.",
  });
  await tg(env, "setMyDescription", {
    language_code: "ru",
    description: "FITTER — одно фото, полный контроль 📸\nОтправь фото еды, и нейросеть посчитает калории, белки, жиры и углеводы и запишет всё в дневник питания.",
  });
  await tg(env, "setMyShortDescription", { short_description: "Counts calories from food photos 📸 One photo. Full control." });
  await tg(env, "setMyShortDescription", { language_code: "ru", short_description: "Считаю калории по фото еды 📸 Одно фото. Полный контроль." });

  if (env.GEMINI_API_KEY) {
    try {
      const r = await gemini(env, [{ text: "Reply with the word ok" }], { type: "OBJECT", properties: { ok: { type: "STRING" } }, required: ["ok"] });
      rows.push([true, R(`Нейросеть Gemini отвечает (модель ${esc(lastModelUsed)})`, `The Gemini AI is responding (model ${esc(lastModelUsed)})`)]);
    } catch (e) {
      rows.push([false, R("Gemini не отвечает: ", "Gemini is not responding: ") + esc(String(e.message || e).slice(0, 300))]);
    }
  }
  if (rows.every(([ok]) => ok)) {
    const u = `<a href="https://t.me/${me.result.username}">@${me.result.username}</a>`;
    rows.push([true, R(`<b>Всё готово!</b> Открой бота: ${u} и нажми «Старт»`, `<b>All set!</b> Open the bot: ${u} and tap “Start”`)]);
  }
  return page(rows);
}

// ───────────────────────────── Mini App (дневник по дням) ─────────────────────────────

const APP_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<title>FITTER — diary</title>
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<style>
  /* Оформление как в приложении FITTER для Android: белый или OLED-чёрный фон, серые карточки без рамок,
     зелёная карточка калорий, плитки БЖУ, воды и таблеток, тонированные цветом показателя */
  :root{
    --bg:#ffffff; --card:#f4f4f6; --text:#111114; --hint:#8a8a94;
    --danger:#ff5a4e;
    --line:rgba(17,17,20,.08);
    --fill:rgba(17,17,20,.05);
    --track:rgba(19,32,26,.07);
    --g1:#2ee59d; --g2:#16b86a; --g3:#0e8f6e;
    --mp:#ec6a6a; --mc:#e3a35e; --mf:#5c92e6;
    --tp:rgba(236,106,106,.10); --tc:rgba(227,163,94,.10); --tf:rgba(92,146,230,.10);
    --w1:#4fb3ff; --w2:#2a7bf0; --pill:#a98bff; --pill-ink:#7b5cf0;
    --chip:#f4f4f6;
    --r:24px;
  }
  html[data-theme="light"]{color-scheme:light}
  html[data-theme="dark"]{
    color-scheme:dark;
    --bg:#000000; --card:#141417; --text:#f4f4f6; --hint:#9a9aa6;
    --line:rgba(255,255,255,.08); --fill:rgba(255,255,255,.08); --track:rgba(255,255,255,.13);
    --tp:rgba(236,106,106,.13); --tc:rgba(227,163,94,.13); --tf:rgba(92,146,230,.13);
    --chip:#0f0f12;
  }
  html.tt,html.tt *{transition:background-color .3s,color .3s,border-color .3s!important}
  *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  html,body{margin:0;background:var(--bg);color:var(--text);font:15px/1.4 -apple-system,BlinkMacSystemFont,"SF Pro Rounded","Segoe UI",Roboto,sans-serif}
  body{position:relative;padding-bottom:40px;overflow-x:hidden}
  /* В тёмной теме сверху справа лёгкое сиреневое свечение, как на экранах приложения */
  html[data-theme="dark"] body:before{content:"";position:absolute;left:0;right:0;top:0;height:460px;pointer-events:none;background:radial-gradient(circle at 85% 0,#2e2a3a,rgba(46,42,58,0) 72%)}
  button{font:inherit;border:0;cursor:pointer;transition:transform .14s cubic-bezier(.3,1.6,.5,1),filter .14s;touch-action:manipulation}
  button:active{transform:scale(.92);filter:brightness(.94)}
  .ic{width:24px;height:24px;flex:none;display:block}

  /* ── Шапка: крупное название, справа круглые кнопки ── */
  .head{position:relative;z-index:1;padding:14px 20px 4px}
  .top{display:flex;align-items:center;justify-content:space-between;gap:8px}
  .ttl{min-width:0}
  .ttl b{display:block;font-size:34px;font-weight:800;letter-spacing:-.025em;line-height:1.1;white-space:nowrap}
  .ttl small{display:block;margin-top:1px;font-size:14px;font-weight:600;color:var(--hint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .nav{display:flex;align-items:center;gap:6px;flex:none}
  .nav button{width:38px;height:38px;border-radius:19px;background:var(--chip);color:var(--text);display:flex;align-items:center;justify-content:center}
  .nav button svg{width:18px;height:18px}
  .nav button#lang{font-size:12px;font-weight:800;letter-spacing:.02em}
  .week{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin:14px 0 2px}
  .wd{background:transparent;color:var(--text);border-radius:14px;padding:7px 0;display:flex;flex-direction:column;align-items:center;gap:2px}
  .wd small{font-size:12px;font-weight:600;color:var(--hint)}
  .wd b{font-size:17px;font-weight:800}
  .wd i{width:6px;height:6px;border-radius:50%;background:transparent;margin-top:2px}
  .wd i.ok{background:var(--g1)} .wd i.lo{background:var(--track)} .wd i.ov{background:#d93a2f}
  .wd.sel{background:var(--g1);color:#03301a}
  .wd.sel small{color:rgba(3,48,26,.75)}
  .wd.sel i.ok{background:#03301a} .wd.sel i.lo{background:rgba(3,48,26,.4)}
  .wd.today:not(.sel) b{text-decoration:underline;text-decoration-thickness:2px;text-underline-offset:4px}
  .wd[disabled]{opacity:.4}

  /* ── Калории: зелёная карточка с остатком слева и кольцом справа ── */
  .cal{position:relative;display:flex;align-items:center;gap:12px;margin-top:12px;padding:20px 18px 20px 24px;border-radius:var(--r);color:#fff;overflow:hidden;
    background:radial-gradient(60% 90% at 18% 4%,rgba(233,255,216,.42),rgba(233,255,216,0) 70%),linear-gradient(135deg,#5bef5e,#22d97a 52%,#2cd3b4);
    box-shadow:0 12px 30px rgba(30,211,138,.32)}
  html[data-theme="dark"] .cal{box-shadow:0 10px 28px rgba(30,211,138,.2)}
  .cal .tx{flex:1;min-width:0}
  .cal .big{font-size:50px;font-weight:800;letter-spacing:-.036em;line-height:1.05;white-space:nowrap;font-variant-numeric:tabular-nums}
  .cal .lbl{font-size:15px;font-weight:700;color:rgba(255,255,255,.95)}
  .cal .sub{margin-top:4px;font-size:13px;font-weight:600;color:rgba(255,255,255,.78)}
  .cal .stk{display:inline-block;margin-top:10px;padding:4px 11px;border-radius:99px;background:rgba(255,255,255,.24);font-size:13px;font-weight:800}
  .ring{position:relative;width:118px;height:118px;flex:none}
  .ring > svg{position:absolute;inset:0;transform:rotate(-90deg);overflow:visible}
  .ring .trk{stroke:rgba(255,255,255,.28)}
  .ring .arc{stroke:#fff;transition:stroke-dashoffset 1.1s cubic-bezier(.2,.8,.2,1)}
  .ring.over .arc{stroke:#b4231a}
  .ring .in{position:absolute;left:38px;top:38px;width:42px;height:42px;border-radius:50%;background:rgba(255,255,255,.24);display:flex;align-items:center;justify-content:center}
  .ring .in .ic{width:22px;height:22px}

  .wrap{position:relative;z-index:1;padding:0 20px}
  /* ── БЖУ: плитки, тонированные цветом нутриента, с кольцом ── */
  .macros{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:12px}
  .mc{border-radius:var(--r);padding:16px 10px 16px 14px;background:linear-gradient(var(--tint),var(--tint)),var(--card);min-width:0}
  .mc.p{--tint:var(--tp);--col:var(--mp)} .mc.c{--tint:var(--tc);--col:var(--mc)} .mc.f{--tint:var(--tf);--col:var(--mf)}
  .mc .vl{font-size:20px;font-weight:800;letter-spacing:-.015em;white-space:nowrap;font-variant-numeric:tabular-nums}
  .mc .lb{font-size:13px;font-weight:600;color:var(--text);opacity:.8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .mc .lb.ok{color:var(--g3);opacity:1} .mc .lb.ov{color:var(--danger);opacity:1}
  html[data-theme="dark"] .mc .lb.ok{color:var(--g1)}
  .mc .rg{position:relative;width:66px;height:66px;margin:14px auto 0}
  .mc .rg > svg{position:absolute;inset:0;transform:rotate(-90deg)}
  .mc .trk{stroke:var(--track)}
  .mc .arc{stroke:var(--col);transition:stroke-dashoffset 1s cubic-bezier(.2,.8,.2,1)}
  .mc.over .arc{stroke:var(--danger)}
  .mc .mi{position:absolute;left:19px;top:19px;width:28px;height:28px;border-radius:50%;background:var(--tint);display:flex;align-items:center;justify-content:center}
  .mc .mi .ic{width:17px;height:17px}
  /* Подсказка по БЖУ */
  .hint{display:flex;align-items:center;gap:12px;margin-top:12px;background:var(--card);border-radius:var(--r);padding:16px;font-size:14px;line-height:1.4;font-weight:500;text-wrap:pretty}
  .hint .hi{flex:none;width:36px;height:36px;border-radius:12px;background:linear-gradient(135deg,#2ee59d,#16b86a);display:flex;align-items:center;justify-content:center}
  .hint .hi svg{width:20px;height:20px}
  .hint.warn .hi{background:linear-gradient(135deg,#ff6a4d,#b4231a)}
  .hint b{font-weight:800}

  /* ── Вода ── */
  .water{margin-top:12px;border-radius:var(--r);padding:18px;background:var(--card);position:relative}
  .wh{display:flex;align-items:center;gap:12px}
  .wi{flex:none;width:44px;height:44px;border-radius:50%;background:rgba(79,179,255,.16);color:var(--w2);display:flex;align-items:center;justify-content:center}
  html[data-theme="dark"] .wi{color:var(--w1)}
  .wi svg{width:22px;height:22px}
  .wt{flex:1;min-width:0}
  .wt b{font-size:24px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
  .wt small{font-size:14px;font-weight:600;color:var(--hint)}
  .wt .wn{display:block;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .wbtn{display:flex;align-items:center;gap:8px;flex:none}
  .wbtn button{width:44px;height:44px;border-radius:50%;background:var(--w1);color:#04263f;display:flex;align-items:center;justify-content:center}
  .wbtn button svg{width:20px;height:20px}
  .wbtn button.sub{width:36px;height:36px;background:var(--fill);color:var(--text)}
  .wbtn button.sub svg{width:16px;height:16px}
  .cups{display:flex;gap:4px;margin-top:14px}
  .cups i{flex:1;height:10px;border-radius:5px;background:var(--track);transition:background .3s}
  .cups i.on{background:var(--w1)}
  /* ── Таблетки ── */
  .pills{background:var(--card);border-radius:var(--r);padding:18px 18px 8px;margin-top:12px}
  .pills .ph{display:flex;align-items:center;gap:12px}
  .pills .ib{width:44px;height:44px;border-radius:50%;background:rgba(169,139,255,.16);display:flex;align-items:center;justify-content:center;flex:none;font-size:20px}
  .pills .t{flex:1;min-width:0;font-weight:800;font-size:18px}
  .pills .t small{display:block;color:var(--hint);font-weight:600;font-size:12px}
  .pbtn{flex:none;height:34px;padding:0 14px;border-radius:17px;background:var(--fill);color:var(--text);font-weight:700;font-size:13px}
  .pbar{height:6px;border-radius:3px;background:var(--track);margin:14px 0 4px;overflow:hidden}
  .pbar i{display:block;height:100%;width:0;border-radius:3px;background:var(--pill);transition:width .8s cubic-bezier(.2,.8,.2,1)}
  .dose{display:flex;align-items:center;gap:12px;width:100%;padding:11px 0;border-top:1px solid var(--line);background:transparent;color:var(--text);text-align:left;border-radius:0}
  .dose:first-of-type{border-top:0}
  .dose .nm{flex:1;min-width:0;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .dose .nm small{display:block;color:var(--hint);font-size:12px;font-weight:500}
  .dose .tm{flex:none;order:3;font-weight:700;font-size:13px;color:var(--hint);background:var(--fill);border-radius:10px;padding:4px 9px}
  .dose .ck{order:0;flex:none;width:28px;height:28px;border-radius:50%;border:2px solid var(--hint);opacity:.9;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:800;color:#1a1033;transition:background .2s,border-color .2s}
  .dose .nm{order:1}
  .dose.taken .ck{background:var(--pill);border-color:var(--pill);opacity:1}
  .dose.taken .pn{color:var(--hint);text-decoration:line-through}
  .dose.skip .ck{border-style:dashed}
  .dose[disabled]{opacity:.55}
  .pform{display:flex;flex-direction:column;gap:8px;margin:12px 0 10px}
  .pform input,.pform select{width:100%;padding:12px 14px;border-radius:14px;border:2px solid transparent;background:var(--fill);color:var(--text);font:inherit;outline:none}
  .pform input:focus,.pform select:focus{border-color:var(--pill)}
  .ptimes{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
  .ptimes .chip{display:flex;align-items:center;gap:4px;height:34px;padding:0 6px 0 12px;border-radius:17px;background:rgba(169,139,255,.18);color:var(--text);font-weight:700}
  .ptimes .chip b{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--hint);font-weight:700}
  .ptimes select{width:auto;flex:1;min-width:110px;padding:8px 10px}
  .psave{height:48px;border-radius:24px;background:var(--text);color:var(--bg);font-weight:800}
  .plist{margin-top:6px}
  .plist .row{display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid var(--line)}
  .plist .row div{flex:1;min-width:0;font-weight:600}
  .plist .row small{display:block;color:var(--hint);font-size:12px;font-weight:500}
  .plist .x{flex:none;height:34px;padding:0 14px;border-radius:17px;background:rgba(255,90,78,.12);color:var(--danger);font-weight:700;font-size:13px}
  .phint{color:var(--hint);font-size:13px;margin:8px 0 10px;line-height:1.45}

  /* ── Приёмы пищи ── */
  h3{margin:26px 2px 12px;font-size:20px;font-weight:800;letter-spacing:-.01em;display:flex;align-items:center;justify-content:space-between}
  h3 small{font-size:13px;color:var(--hint);font-weight:600}
  .meal{background:var(--card);border-radius:var(--r);padding:12px 16px 4px 12px;margin-bottom:12px}
  .meal .hd{display:flex;align-items:center;gap:12px;margin-bottom:6px}
  .meal .ib{width:56px;height:56px;border-radius:18px;display:flex;align-items:center;justify-content:center;flex:none;font-size:26px;position:relative;overflow:hidden}
  .meal .ib:after{content:"";position:absolute;inset:0;background:linear-gradient(135deg,rgba(255,255,255,.22),rgba(255,255,255,0) 60%)}
  .meal .t{flex:1;min-width:0;font-weight:800;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .meal .t small{display:block;color:var(--hint);font-weight:600;font-size:12px;overflow:hidden;text-overflow:ellipsis}
  .meal .k{flex:none;padding:5px 10px;border-radius:12px;background:var(--fill);color:var(--text);font-weight:800;font-size:14px}
  .it{display:flex;align-items:center;gap:10px;padding:10px 0 10px 4px;border-top:1px solid var(--line)}
  .it .dot{width:8px;height:8px;border-radius:50%;flex:none}
  .it .n{flex:1;min-width:0}
  .it .n div{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600}
  .it .n small{color:var(--hint);font-size:12px}
  .it .nm{cursor:pointer}
  .it .nm:after{content:" ✎";font-size:12px;color:var(--hint)}
  .it .gr{display:flex;align-items:center;background:var(--fill);border-radius:12px;padding:0 10px 0 2px}
  .it input{width:52px;padding:8px 2px;border:0;background:transparent;color:var(--text);font:inherit;font-weight:700;text-align:right;outline:none}
  .it .g{color:var(--hint);font-size:13px}
  .it .ren{width:100%;padding:6px 10px;border-radius:12px;border:2px solid var(--g2);background:var(--bg);color:var(--text);font:inherit;outline:none}
  .mdet{border-top:1px solid var(--line);padding:11px 4px}
  .mdet summary{cursor:pointer;color:var(--hint);font-size:13px;font-weight:600;list-style:none}
  .mdet summary::-webkit-details-marker{display:none}
  .mdet[open] summary{color:var(--text);margin-bottom:6px}
  .mrow{display:flex;align-items:center;gap:8px;font-size:13px;padding:3px 0}
  .mrow span{flex:1;color:var(--hint)} .mrow b{font-weight:700} .mrow em{width:42px;text-align:right;font-style:normal;color:var(--hint);font-variant-numeric:tabular-nums}
  .mnone{color:var(--hint);font-size:12px;margin-top:6px}
  .del{display:block;width:100%;background:transparent;color:var(--danger);font-size:13px;font-weight:600;padding:11px 0;border-top:1px solid var(--line);opacity:.85}
  .addm{display:flex;align-items:flex-end;gap:8px;background:var(--card);border-radius:var(--r);padding:8px 8px 8px 20px;border:2px solid transparent;transition:border-color .2s}
  .addm:focus-within{border-color:var(--hint)}
  .addm textarea{flex:1;min-width:0;border:0;background:transparent;color:var(--text);font:inherit;font-size:15px;line-height:1.4;padding:10px 0;resize:none;outline:none;max-height:120px}
  .addm textarea::placeholder{color:var(--hint)}
  .addb{flex:none;width:44px;height:44px;border-radius:50%;background:var(--text);color:var(--bg);font-size:26px;font-weight:600;line-height:1}
  .addm.busy .addb{font-size:0}
  .addm.busy .addb:after{content:"";display:block;width:18px;height:18px;margin:auto;border:3px solid rgba(127,127,127,.4);border-top-color:var(--bg);border-radius:50%;animation:spin .8s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  .addh{margin:8px 10px 12px;color:var(--hint);font-size:12px}
  .empty{background:var(--card);border-radius:var(--r);padding:26px 16px;text-align:center;color:var(--hint)}
  .empty .ib{width:60px;height:60px;border-radius:18px;margin:0 auto 10px;background:linear-gradient(135deg,#b9e39a,#4f8f3e);display:flex;align-items:center;justify-content:center;font-size:28px}
  .empty b{display:block;color:var(--text);font-size:16px;margin-bottom:4px}

  /* ── Неделя ── */
  .wkc{background:var(--card);border-radius:var(--r);padding:24px 14px 16px}
  .wkc .bars{position:relative;display:grid;grid-template-columns:repeat(7,1fr);gap:4px;height:156px}
  .wkc .nl{position:absolute;left:4px;right:4px;height:0;border-top:1.5px dashed var(--hint);opacity:.6;pointer-events:none;z-index:1}
  .wkc .nl span{position:absolute;right:0;top:-18px;font-size:11px;font-weight:700;color:var(--hint);background:var(--card);padding:0 4px}
  .wkc .plot{position:absolute;left:0;right:0;top:0;bottom:30px;pointer-events:none}
  .wb{display:flex;flex-direction:column;align-items:center;gap:4px;background:transparent;color:var(--text);padding:0;min-width:0}
  .wb .col{flex:1;width:100%;display:flex;align-items:flex-end;justify-content:center}
  .wb .col i{display:block;width:62%;max-width:26px;height:0;border-radius:8px;background:var(--track);transition:height 1s cubic-bezier(.2,.8,.2,1)}
  .wb .col i.ok{background:var(--g1)}
  .wb .col i.lo{background:#9fe3bf}
  .wb .col i.ov{background:#ff9f0a}
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
  .wsum .lg i.ok{background:var(--g1)} .wsum .lg i.lo{background:#9fe3bf} .wsum .lg i.ov{background:#ff9f0a}

  /* ── Вес ── */
  .wcard{background:var(--card);border-radius:var(--r);padding:16px 18px;display:flex;align-items:center;gap:14px}
  .wcard .ib{width:36px;height:36px;border-radius:12px;background:var(--fill);display:flex;align-items:center;justify-content:center;flex:none;color:var(--hint)}
  .wcard .v{flex:1}
  .wcard .v b{font-size:24px;font-weight:800;letter-spacing:-.02em}
  .wcard .v small{display:block;color:var(--g3);font-size:13px;font-weight:800}
  html[data-theme="dark"] .wcard .v small{color:var(--g1)}
  .wcard .wed{flex:none;width:36px;height:36px;border-radius:50%;background:var(--fill);color:var(--text);font-size:16px;display:flex;align-items:center;justify-content:center}
  .wcard .win{width:84px;padding:4px 8px;border:2px solid var(--g1);border-radius:12px;background:var(--bg);color:var(--text);font:inherit;font-size:20px;font-weight:800;outline:none}
  .mc .vl,.meal .k,.wt b,.wb em{font-variant-numeric:tabular-nums}
  .err{color:var(--danger);text-align:center;padding:40px 24px}
  .load{padding:60px 0;text-align:center;opacity:.8}

  /* ── Анимации ── */
  .rise{animation:rise .45s cubic-bezier(.2,.8,.2,1) backwards}
  @keyframes rise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
  .pop{animation:pop .5s cubic-bezier(.3,1.6,.5,1)}
  @keyframes pop{0%{transform:scale(1)}35%{transform:scale(1.05)}100%{transform:scale(1)}}
  /* Всплывающая цифра у кнопки воды: обычный элемент страницы без тени — закреплённый слой с тенью ломал отрисовку на Android */
  .fl{position:absolute;z-index:30;pointer-events:none;font-weight:800;font-size:15px;color:var(--w2);animation:fup .9s ease-out forwards}
  @keyframes fup{to{transform:translateY(-46px);opacity:0}}
  .fx{position:fixed;z-index:40;pointer-events:none;font-size:20px;line-height:1;will-change:transform,opacity}
  @media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style>
</head>
<body>
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><symbol id="i-plate" viewBox="0 0 24 24"><defs><linearGradient id="pl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#DCE3EA"/></linearGradient></defs> <ellipse cx="12" cy="13" rx="10" ry="9" fill="#AFBBC7"/> <ellipse cx="12" cy="12.4" rx="10" ry="9" fill="url(#pl)"/> <ellipse cx="12" cy="12.4" rx="6.6" ry="5.9" fill="#EEF2F6" stroke="#C9D3DD" stroke-width=".6"/> <path d="M8.2 13.6c-.6-2.6 1.2-4.6 3.4-4.4-1 1.4-1.6 2.9-1.5 4.6z" fill="#4CC38A"/> <path d="M10.1 13.8c0-2.6 2.2-4.2 4.3-3.4-1.4 1-2.4 2.2-2.6 3.6z" fill="#2FA36B"/> <circle cx="14.6" cy="13.4" r="1.9" fill="#FF6B4A"/> <circle cx="14.2" cy="12.8" r=".5" fill="#FFB4A3"/> <ellipse cx="11.6" cy="15.2" rx="2.4" ry="1.3" fill="#FFB547"/></symbol><symbol id="i-protein" viewBox="0 0 24 24"><defs><linearGradient id="pr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFB15C"/><stop offset="1" stop-color="#D9662B"/></linearGradient></defs> <path d="M15.2 2.8c3.5 0 6 2.7 6 6 0 4.2-3.9 7.3-8 6.6L10 18.6l-3.2-3.2 3.2-3.2c-.6-4.6 1.6-9.4 5.2-9.4z" fill="url(#pr)"/> <path d="M17.6 5.6c1.2.6 1.9 1.8 1.9 3.1" stroke="#FFD9AE" stroke-width="1.2" stroke-linecap="round" fill="none"/> <path d="M10.6 15.5 7.3 18.8" stroke="#F3E9DA" stroke-width="2.6" stroke-linecap="round"/> <circle cx="5.6" cy="18.4" r="1.9" fill="#F3E9DA" stroke="#C9BBA6" stroke-width=".5"/> <circle cx="7.6" cy="20.4" r="1.9" fill="#F3E9DA" stroke="#C9BBA6" stroke-width=".5"/></symbol><symbol id="i-fat" viewBox="0 0 24 24"><defs><linearGradient id="ft" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE27A"/><stop offset="1" stop-color="#F5A524"/></linearGradient></defs> <path d="M12 2.2c-1 1.8-7.2 8.7-7.2 13.1a7.2 7.2 0 0 0 14.4 0C19.2 10.9 13 4 12 2.2z" fill="url(#ft)"/> <path d="M12 2.2c-1 1.8-7.2 8.7-7.2 13.1a7.2 7.2 0 0 0 14.4 0C19.2 10.9 13 4 12 2.2z" fill="none" stroke="#D98A12" stroke-width=".6"/> <path d="M8.6 15.6a3.4 3.4 0 0 0 3 3.2" stroke="#FFF6CF" stroke-width="1.5" stroke-linecap="round" fill="none"/></symbol><symbol id="i-carbs" viewBox="0 0 24 24"><path d="M12 22.2V8.6" stroke="#C98A1F" stroke-width="2" stroke-linecap="round"/> <g fill="#F7C04A" stroke="#C98A1F" stroke-width=".6"> <path d="M11.6 12.6c-3.4.3-5.8-1.8-6-5 3.3-.2 5.7 1.8 6 5z"/> <path d="M12.4 12.6c3.4.3 5.8-1.8 6-5-3.3-.2-5.7 1.8-6 5z"/> <path d="M11.6 18c-3.4.3-5.8-1.8-6-5 3.3-.2 5.7 1.8 6 5z"/> <path d="M12.4 18c3.4.3 5.8-1.8 6-5-3.3-.2-5.7 1.8-6 5z"/> <path d="M12 9c-2-1.1-2-4.3 0-6.3 2 2 2 5.2 0 6.3z"/> </g> <g fill="#FFE6A3"><ellipse cx="8.4" cy="9.4" rx="1.2" ry=".6" transform="rotate(35 8.4 9.4)"/><ellipse cx="8.4" cy="14.8" rx="1.2" ry=".6" transform="rotate(35 8.4 14.8)"/></g></symbol><symbol id="i-kcal" viewBox="0 0 24 24"><defs><linearGradient id="fl" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#FF3D2E"/><stop offset=".6" stop-color="#FF8A1F"/><stop offset="1" stop-color="#FFC23D"/></linearGradient> <linearGradient id="fi" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#FFB02E"/><stop offset="1" stop-color="#FFF1A8"/></linearGradient></defs> <path d="M12.6 2c.6 3.4-1.3 5-3 6.8C7.8 10.7 6 12.6 6 15.6A6.2 6.2 0 0 0 12 22a6.4 6.4 0 0 0 6-6.6c0-2.6-1.2-4.3-2.3-5.6-.2 1.4-.9 2.4-1.9 2.8.6-4.6-.7-8.3-1.2-10.6z" fill="url(#fl)"/> <path d="M12.2 12.2c.2 1.9-1.3 2.6-2 3.7-.4.6-.6 1.2-.6 1.9A2.6 2.6 0 0 0 12.2 20.6a2.7 2.7 0 0 0 2.6-2.8c0-1.6-1.2-2.5-1.6-3.2-.5.5-.9.6-1.2.5.3-1 .3-2 .2-2.9z" fill="url(#fi)"/></symbol><symbol id="i-scales" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/> <path d="M8 9.2a5.6 5.6 0 0 1 8 0"/> <path d="M12 10.6l1.4-2"/> <circle cx="12" cy="10.8" r="0.4" fill="currentColor"/></g></symbol><symbol id="i-apple" viewBox="0 0 24 24"><g fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8V6.5a3 3 0 0 1 3-3H8"/> <path d="M16 3.5h1.5a3 3 0 0 1 3 3V8"/> <path d="M20.5 16v1.5a3 3 0 0 1-3 3H16"/> <path d="M8 20.5H6.5a3 3 0 0 1-3-3V16"/> <path d="M12 9.3c-1.2-.9-3.9-1.1-4.4 1.9-.4 2.4 1.2 5.4 2.9 5.4.6 0 1-.3 1.5-.3s.9.3 1.5.3c1.7 0 3.3-3 2.9-5.4-.5-3-3.2-2.8-4.4-1.9z"/> <path d="M12 9.3c0-1.3.6-2.2 1.7-2.6"/></g></symbol></defs></svg>
<div class="head">
  <div class="top">
    <div class="ttl"><b id="dl">Diary</b><small id="ds">FITTER</small></div>
    <div class="nav"><button id="prev" aria-label="Previous day"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></button><button id="next" aria-label="Next day"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg></button><button id="lang" aria-label="Language">EN</button><button id="theme" aria-label="Switch theme"></button></div>
  </div>
  <div id="hero"><div class="load">Loading…</div></div>
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
      var bg = dark ? "#000000" : "#ffffff"; tg.setBackgroundColor(bg); tg.setHeaderColor(bg); tg.setBottomBarColor(bg);
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

  var initData = tg ? tg.initData : "";
  // Язык: сначала выбор на этом устройстве, иначе язык Telegram; когда придут данные, берём язык аккаунта
  var LANG = "en";
  try {
    var savedLang = localStorage.getItem("fitter_lang");
    if (savedLang !== "ru" && savedLang !== "en") throw 0;
    LANG = savedLang;
  } catch(e) {
    var lc = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.language_code) || "";
    LANG = /^(ru|be|kk)/i.test(lc) ? "ru" : "en";
  }
  var MONTHS = {
    ru: ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"],
    en: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
  };
  var WD = { ru: ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"], en: ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"] };
  var WDF = {
    ru: ["понедельник","вторник","среда","четверг","пятница","суббота","воскресенье"],
    en: ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]
  };
  var state = { date: null, data: null };
  var root = document.getElementById("root"), hero = document.getElementById("hero");

  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]; }); }
  function r(x){ return Math.round(x); }
  function T(ru, en){ return LANG === "en" ? en : ru; }
  function KC(){ return T("ккал", "kcal"); }
  // Б · Ж · У у блюда
  function pfc(t){ return T("Б ", "P ") + r(t.p) + T(" · Ж ", " · F ") + r(t.f) + T(" · У ", " · C ") + r(t.c); }
  // Число с разрядами: 2 100
  function n(x){ return Math.round(x).toLocaleString(LANG === "en" ? "en-US" : "ru-RU"); }
  function kg(x){ return LANG === "en" ? String(x) : String(x).replace(".", ","); }
  function shift(date, n){ var d = new Date(date + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0,10); }
  function human(date){ var d = new Date(date + "T00:00:00Z"); return LANG === "en" ? MONTHS.en[d.getUTCMonth()] + " " + d.getUTCDate() : d.getUTCDate() + " " + MONTHS.ru[d.getUTCMonth()]; }
  function L(ml){ var s = String(Math.round(ml / 10) / 100); return LANG === "en" ? s + " L" : s.replace(".", ",") + " л"; }
  // Всё, что лежит в разметке: подписи кнопок, заголовок страницы
  function applyStatic(){
    document.documentElement.lang = LANG;
    document.title = T("FITTER — дневник", "FITTER — diary");
    document.getElementById("prev").setAttribute("aria-label", T("Предыдущий день", "Previous day"));
    document.getElementById("next").setAttribute("aria-label", T("Следующий день", "Next day"));
    document.getElementById("theme").setAttribute("aria-label", T("Сменить тему", "Switch theme"));
    var lb = document.getElementById("lang"); lb.textContent = LANG === "en" ? "EN" : "RU"; lb.setAttribute("aria-label", "Language / Язык");
    if (!state.data) {
      document.getElementById("dl").textContent = T("Дневник", "Diary");
      var ld = hero.querySelector(".load"); if (ld) ld.textContent = T("Загрузка…", "Loading…");
    }
  }
  function setLang(l, save){
    LANG = l;
    if (save) try { localStorage.setItem("fitter_lang", l); } catch(e){}
    applyStatic();
    if (state.data) render();
  }
  function icon(name, style){ return '<svg class="ic"' + (style ? ' style="' + style + '"' : '') + '><use href="#i-' + name + '"/></svg>'; }
  function plural(x, a, b, c){ var m = x % 10, h = x % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c; }

  // Вода считается стаканами по 250 мл
  var CUP = 250;
  function cupsOf(ml){ return Math.floor(ml / CUP); }
  function cupsGoal(ml){ return Math.max(1, Math.ceil(ml / CUP)); }
  function cupWord(x){ return LANG === "en" ? (x === 1 ? "glass" : "glasses") : plural(x, "стакан", "стакана", "стаканов"); }
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
    f.style.left = (rc.left + window.scrollX + rc.width / 2 - 20) + "px"; f.style.top = (rc.top + window.scrollY - 8) + "px";
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
      if (d.lang && d.lang !== LANG) { LANG = d.lang; try { localStorage.setItem("fitter_lang", LANG); } catch(e){} applyStatic(); }
      if (state.date !== d.date) state.pillMode = null;
      state.date = d.date; state.data = d; render();
    }).catch(function(e){
      var msg = e && e.error === "no_profile" ? T("Сначала пройди анкету в боте: нажми /start", "First complete the questionnaire in the bot: send /start") :
                e && e.error === "unauthorized" ? T("Открой дневник через кнопку в боте FITTER", "Open the diary with the button in the FITTER bot") : T("Не получилось загрузить дневник. Попробуй ещё раз.", "Couldn't load the diary. Please try again.");
      hero.innerHTML = ""; root.innerHTML = '<div class="err">' + msg + '</div>';
    });
  }

  // Кольцо прогресса: дуга набегает через stroke-dashoffset (см. animateIn)
  function arcSvg(size, sw, val, max){
    var R = (size - sw) / 2, C = 2 * Math.PI * R, pct = max ? Math.min(1, val / max) : 0;
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">' +
      '<circle class="trk" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + R + '" fill="none" stroke-width="' + sw + '"/>' +
      '<circle class="arc" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + R + '" fill="none" stroke-width="' + sw + '" stroke-dasharray="' + C + '" stroke-dashoffset="' + C + '" data-off="' + (C * (1 - pct)) + '"/></svg>';
  }

  // Карточка калорий как в приложении: остаток слева, кольцо справа
  function calCard(val, max, left, streak){
    var over = left < 0, eaten = T(n(val) + ' из ' + n(max) + ' съедено', n(val) + ' of ' + n(max) + ' eaten');
    return '<div class="cal rise"><div class="tx"><div class="big">' + (over ? '+' : '') + '<span data-to="' + Math.abs(r(left)) + '">0</span></div>' +
      '<div class="lbl">' + (over ? T('Ккал сверх нормы', 'kcal over goal') : T('Ккал осталось', 'kcal left')) + '</div><div class="sub">' + eaten + '</div>' + streak + '</div>' +
      '<div class="ring' + (over ? ' over' : '') + '">' + arcSvg(118, 15, val, max) + '<div class="in">' + icon("kcal") + '</div></div></div>';
  }

  function macro(cls, ic, label, val, max){
    var left = max - val, ok = max && val >= max * 0.9 && val <= max * 1.1, over = max && !ok && left < 0;
    var g = T("г", "g");
    var vl = !max || ok ? r(val) : over ? r(-left) : r(left);
    var cap = !max ? label : ok ? T("в норме", "on goal") : over ? label + T(" сверх", " over") : label + T(" ост.", " left");
    return '<div class="mc ' + cls + (over ? ' over' : '') + ' rise"><div class="vl">' + vl + ' ' + g + '</div><div class="lb' + (ok ? ' ok' : over ? ' ov' : '') + '">' + cap + '</div>' +
      '<div class="rg">' + arcSvg(66, 9, val, max) + '<div class="mi">' + icon(ic) + '</div></div></div>';
  }

  // Подсказка под БЖУ: чего не хватает сильнее всего и чего уже много
  var FOODS = {
    ru: { p: "творог 200 г или куриная грудка 150 г", f: "горсть орехов или ложка масла в салат", c: "порция каши, хлеб или фрукт" },
    en: { p: "200 g of cottage cheese or 150 g of chicken breast", f: "a handful of nuts or a spoon of oil in a salad", c: "a serving of oatmeal, bread or a piece of fruit" }
  };
  var NAMES = {
    ru: { p: "белка", f: "жиров", c: "углеводов" },
    en: { p: "protein", f: "fat", c: "carbs" }
  };
  function macroHint(d){
    var t = d.totals, g = d.targets, NM = NAMES[LANG];
    if (!d.meals.length || d.date > d.today) return "";
    var keys = ["p", "f", "c"], over = null, need = null;
    keys.forEach(function(k){
      if (!g[k]) return;
      var k1 = t[k] / g[k];
      if (k1 > 1.1 && (!over || k1 > t[over] / g[over])) over = k;
      if (k1 < 0.9 && (!need || k1 < t[need] / g[need])) need = k;
    });
    var txt, cls = "";
    if (over) { txt = T("<b>" + NM[over].charAt(0).toUpperCase() + NM[over].slice(1) + " уже больше нормы на " + r(t[over] - g[over]) + " г.</b> " + (need ? "А вот " + NM[need] + " не хватает " + r(g[need] - t[need]) + " г." : "Остальное в порядке."),
                        "<b>" + NM[over].charAt(0).toUpperCase() + NM[over].slice(1) + " is already " + r(t[over] - g[over]) + " g over your goal.</b> " + (need ? "But you're " + r(g[need] - t[need]) + " g short on " + NM[need] + "." : "Everything else is fine.")); cls = " warn"; }
    else if (need && d.date === d.today) txt = T("Сильнее всего не хватает " + NM[need] + ": <b>добери " + r(g[need] - t[need]) + "&nbsp;г</b>&nbsp;— например, " + FOODS.ru[need] + ".",
                                                "Biggest gap is " + NM[need] + ": <b>add " + r(g[need] - t[need]) + "&nbsp;g</b>&nbsp;— for example, " + FOODS.en[need] + ".");
    else if (need) txt = T("В этот день не хватило " + NM[need] + ": " + r(t[need]) + " из " + g[need] + " г.", "Short on " + NM[need] + " that day: " + r(t[need]) + " of " + g[need] + " g.");
    else { txt = T("<b>БЖУ в балансе.</b> Белки, жиры и углеводы — все в пределах нормы.", "<b>Macros are balanced.</b> Protein, fat and carbs are all within your goal."); cls = " good"; }
    return '<div class="hint rise' + cls + '"><span class="hi"><svg viewBox="0 0 24 24" fill="#fff"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M18.5 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/></svg></span><div>' + txt + '</div></div>';
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
        '<span class="col"><i class="' + c + '" data-h="' + h + '"></i></span><small>' + WD[LANG][i] + '</small><em>' + (w.meals ? n(w.kcal) : "—") + '</em></button>';
    }).join("");
    return '<h3>' + T("Неделя", "Week") + ' <small>' + T("в среднем ", "average ") + n(sum / days.length) + ' ' + KC() + '</small></h3><div class="wkc rise"><div class="bars"><div class="plot"><div class="nl" style="bottom:' + (g / top * 100) + '%"><span>' + T("норма ", "goal ") + n(g) + '</span></div></div>' + bars + '</div>' +
      '<div class="wsum"><span>' + T("В норме ", "On goal ") + '<b>' + inN + T(" из ", " of ") + days.length + '</b> ' + T(days.length === 1 ? 'дня' : 'дней', days.length === 1 ? 'day' : 'days') + '</span><span class="lg"><i class="ok"></i>' + T("норма ", "on goal ") + '<i class="lo"></i>' + T("меньше ", "under ") + '<i class="ov"></i>' + T("больше", "over") + '</span></div></div>';
  }

  // Вода: значок стакана в круге и число литров, как в приложении
  var GLASS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M6 3h12l-1.4 16.2a2 2 0 0 1-2 1.8H9.4a2 2 0 0 1-2-1.8z"/><path d="M6.7 10.5c1.7-1 3.4 1 5.3 0s3.4-1 5.3 0"/></svg>';
  var PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
  var MINUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M5 12h14"/></svg>';
  function lit(ml){ var s = String(Math.round(ml / 10) / 100); return LANG === "en" ? s : s.replace(".", ","); }
  function waterSub(wv, wg){ return T("Вода · ", "Water · ") + cupsOf(wv) + T(" из ", " of ") + cupsGoal(wg) + " " + cupWord(cupsGoal(wg)) + (wv >= wg ? T(" · норма ✓", " · goal reached ✓") : ""); }

  // ── Таблетки ──
  var SLOTS = [];
  for (var hh = 0; hh < 24; hh++) { SLOTS.push((hh < 10 ? "0" : "") + hh + ":00"); SLOTS.push((hh < 10 ? "0" : "") + hh + ":30"); }
  function slotSelect(cls){ return '<select class="' + cls + '"><option value="">' + T("+ время", "+ time") + '</option>' + SLOTS.map(function(t){ return '<option>' + t + '</option>'; }).join("") + '</select>'; }

  function pillsBlock(d){
    var doses = d.pills || [], list = d.pillList || [], mode = state.pillMode;
    var taken = doses.filter(function(x){ return x.s === "taken"; }).length;
    var future = d.date > d.today;
    var sub = !list.length ? T("Напомню вовремя", "I'll remind you on time") : doses.length ? taken + T(" из ", " of ") + doses.length + T(" принято", " taken") : T("Нет приёмов", "No doses");
    var btn = mode ? '<button class="pbtn" data-pmode="">' + T("Готово", "Done") + '</button>' :
      (list.length ? '<button class="pbtn" data-pmode="edit">' + T("Изменить", "Edit") + '</button>' : '<button class="pbtn" data-pmode="add">' + T("+ Добавить", "+ Add") + '</button>');
    var h = '<div class="pills rise"><div class="ph"><div class="ib">💊</div><div class="t">' + T("Таблетки", "Pills") + '<small>' + sub + '</small></div>' + btn + '</div>';
    if (mode === "add") {
      var tm = state.ptimes || [];
      h += '<div class="pform"><input id="pname" maxlength="40" placeholder="' + T("Название, например: Витамин D", "Name, for example: Vitamin D") + '"><input id="pdose" maxlength="30" placeholder="' + T("Доза, например: 1 таблетка (необязательно)", "Dose, for example: 1 tablet (optional)") + '">' +
        '<div class="ptimes">' + tm.map(function(t, i){ return '<span class="chip">' + t + '<b data-prm="' + i + '">×</b></span>'; }).join("") + slotSelect("pslot") + '</div>' +
        '<button class="psave" data-psave="1">' + T("Сохранить", "Save") + '</button></div>';
    } else if (mode === "edit") {
      h += '<div class="plist">' + list.map(function(p){
        return '<div class="row"><div>' + esc(p.name) + '<small>' + (p.dose ? esc(p.dose) + ' · ' : '') + p.times.join(", ") + '</small></div><button class="x" data-pdel="' + p.id + '">' + T("Удалить", "Delete") + '</button></div>';
      }).join("") + '</div>' + (list.length < 10 ? '<button class="pbtn" style="width:100%;margin-top:8px" data-pmode="add">' + T("+ Добавить препарат", "+ Add medication") + '</button>' : '');
    } else if (!list.length) {
      h += '<div class="phint">' + T("Добавь витамины или лекарства, и я напомню в чате, когда их принять.", "Add vitamins or medications and I'll remind you in the chat when to take them.") + '</div>';
    } else if (!doses.length) {
      h += '<div class="phint">' + T("На этот день приёмов нет.", "No doses for this day.") + '</div>';
    } else {
      h += '<div class="pbar"><i data-pct="' + Math.round(taken / doses.length * 100) + '"></i></div>' + doses.map(function(x){
        return '<button class="dose ' + x.s + '"' + (future ? ' disabled' : '') + ' data-pmark="' + x.id + '|' + x.time + '|' + x.s + '"><span class="tm">' + x.time + '</span><span class="nm"><span class="pn">' + esc(x.name) + '</span>' +
          '<small>' + (x.dose ? esc(x.dose) : '') + (x.s === "taken" && x.at ? (x.dose ? ' · ' : '') + T('принято в ', 'taken at ') + x.at : x.s === "skip" ? (x.dose ? ' · ' : '') + T('пропущено', 'skipped') : '') + '</small></span><span class="ck">' + (x.s === "taken" ? "✓" : "") + '</span></button>';
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
    var msg = !name ? T("Напиши название препарата", "Enter the medication name") : !times.length ? T("Выбери хотя бы одно время приёма", "Pick at least one time") : "";
    if (msg) { haptic("rigid"); if (tg && tg.showAlert) tg.showAlert(msg); else alert(msg); return; }
    call("POST", "/api/pill/add", { date: state.date, name: name, dose: dose, times: times })
      .then(function(){ notify("success"); state.pillMode = null; state.ptimes = []; load(state.date); })
      .catch(function(){ notify("error"); var m = T("Не получилось сохранить, попробуй ещё раз", "Couldn't save, please try again"); if (tg && tg.showAlert) tg.showAlert(m); else alert(m); });
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
      if (tg && tg.showConfirm) tg.showConfirm(T("Удалить препарат и его напоминания?", "Delete this medication and its reminders?"), function(ok){ if (ok) go(); }); else if (confirm(T("Удалить?", "Delete?"))) go();
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
    return '<h3>' + T("Вес", "Weight") + '</h3><div class="wcard rise"><div class="ib">' + icon("scales") + '</div><div class="v"><b>' + kg(last.kg) + ' ' + T("кг", "kg") + '</b><small>' +
      (ws.length > 1 ? (diff > 0 ? "+" : diff < 0 ? "−" : "") + kg(Math.abs(diff)) + T(" кг с ", " kg since ") + human(first.date) : T("записан ", "logged ") + human(last.date)) +
      '</small></div>' + spark + '<button class="wed" data-wedit="1" aria-label="' + T("Изменить вес", "Edit weight") + '">✏️</button></div>';
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
      if (!(kg >= 30 && kg <= 300)) { haptic("rigid"); var m = T("Вес — от 30 до 300 кг", "Weight must be between 30 and 300 kg"); if (tg && tg.showAlert) tg.showAlert(m); else alert(m); render(); return; }
      inp.disabled = true;
      call("POST", "/api/weight", { date: state.date, kg: kg })
        .then(function(){ notify("success"); load(state.date); })
        .catch(function(){ notify("error"); var m2 = T("Не получилось сохранить вес, попробуй ещё раз", "Couldn't save your weight, please try again"); if (tg && tg.showAlert) tg.showAlert(m2); else alert(m2); render(); });
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

  // Картинка блюда: эмодзи по названию на цветной подложке (как в приложении)
  var FOOD = [["салат|цезар|salad|caesar","🥗",0],["суп|борщ|щи|солянк|бульон|рамен|soup|borscht|broth|ramen","🍲",3],["каш|овсян|гречк|мюсли|гранол|porridge|oatmeal|buckwheat|muesli|granola","🥣",1],
    ["яйц|омлет|яичниц|egg|omelet","🍳",1],["кофе|капуч|латте|американо|раф|coffee|cappuccino|latte|americano","☕",6],["чай|tea","🍵",0],["пицц|pizza","🍕",3],["бургер|шаурм|хот-дог|хотдог|burger|shawarma|hot dog|hotdog","🍔",3],
    ["паст|макарон|спагет|лапш|pasta|macaroni|spaghetti|noodle","🍝",3],["рис|плов|ризотто|rice|pilaf|risotto","🍚",1],["суши|ролл|сашими|sushi|sashimi","🍣",4],["рыб|лосос|сёмг|семг|тунец|форел|треск|fish|salmon|tuna|trout|cod","🐟",5],
    ["кур|индей|крыл|наггетс|chicken|turkey|wings|nugget","🍗",3],["мяс|говя|свин|стейк|котлет|фарш|шашлык|meat|beef|pork|steak|cutlet|patty|kebab","🥩",3],["пельмен|вареник|манты|хинкал|dumpling|pelmeni|vareniki|manti","🥟",1],
    ["блин|сырник|оладь|панкейк|pancake|syrniki|crepe","🥞",1],["творог|йогурт|кефир|молок|ряженк|протеин|cottage cheese|yogurt|kefir|milk|protein","🥛",2],["сыр|cheese","🧀",1],["хлеб|бутер|тост|сэндв|лаваш|батон|bread|sandwich|toast|wrap","🥪",6],
    ["банан|banana","🍌",1],["яблок|apple","🍎",4],["ягод|клубник|черник|малин|berr|strawberr|blueberr|raspberr","🍓",4],["фрукт|апельсин|мандарин|груш|виноград|fruit|orange|tangerine|pear|grape","🍊",3],["орех|миндал|арахис|nut|almond|peanut","🥜",1],
    ["шоколад|конфет|торт|печень|десерт|пирож|мороже|chocolate|candy|cake|cookie|dessert|pastry|ice cream","🍰",2],["картоф|пюре|фри|potato|mash|fries","🥔",1],["овощ|брокк|огур|помидор|томат|морков|veg|broccoli|cucumber|tomato|carrot","🥦",0],
    ["сок|смузи|лимонад|кола|напит|juice|smoothie|lemonade|cola|drink","🧃",5],["завтрак|breakfast","🍳",1],["обед|lunch","🍲",3],["ужин|dinner","🍽",3],["перекус|snack","🍎",4]];
  var GRADS = [["#b9e39a","#4f8f3e"],["#fbe6bd","#c08a45"],["#f5f2ff","#9f92d0"],["#ffcba0","#c9592e"],["#ffc2b8","#cf4a48"],["#cdebff","#3f82cf"],["#f1d7b4","#8f5b33"]];
  function foodLook(title){
    var low = String(title).toLowerCase(), hit = null;
    for (var i = 0; i < FOOD.length && !hit; i++) if (FOOD[i][0].split("|").some(function(k){ return low.indexOf(k) >= 0; })) hit = FOOD[i];
    var gr = GRADS[hit ? hit[2] : 1];
    return { e: hit ? hit[1] : "🍽", bg: "linear-gradient(135deg," + gr[0] + "," + gr[1] + ")" };
  }

  var DOTS = ["#ff7a2f", "#22b36b", "#f5a524", "#2a7bf0", "#c86bff", "#ff5a8a"];

  // Подробный состав приёма пищи: БЖУ с долей от нормы и микронутриенты (данные есть у новых записей)
  var MICRO = [["fiber","Клетчатка","Fiber","g",28],["sugar","Сахар","Sugar","g",50],["satfat","Насыщенные жиры","Saturated fat","g",20],["cholesterol","Холестерин","Cholesterol","mg",300],["sodium","Натрий","Sodium","mg",2300],["potassium","Калий","Potassium","mg",3400],["calcium","Кальций","Calcium","mg",1000],["iron","Железо","Iron","mg",14],["magnesium","Магний","Magnesium","mg",400],["zinc","Цинк","Zinc","mg",11],["vitc","Витамин C","Vitamin C","mg",90],["vita","Витамин A","Vitamin A","µg",900],["vitd","Витамин D","Vitamin D","µg",15],["b12","Витамин B12","Vitamin B12","µg",2.4]];
  function microNum(v){ return v >= 100 ? String(r(v)) : String(Math.round(v * 10) / 10); }
  function microBlock(m, g){
    var mi = m.micro, rows = "";
    function line(name, val, unit, norm){ return '<div class="mrow"><span>' + name + '</span><b>' + val + ' ' + unit + '</b><em>' + (norm ? r(val / norm * 100) + '%' : '') + '</em></div>'; }
    rows += line(T("Белки", "Protein"), r(m.totals.p * 10) / 10, T("г", "g"), g.p) + line(T("Жиры", "Fat"), r(m.totals.f * 10) / 10, T("г", "g"), g.f) + line(T("Углеводы", "Carbs"), r(m.totals.c * 10) / 10, T("г", "g"), g.c);
    if (mi) MICRO.forEach(function(k){ if (mi[k[0]] > 0) rows += line(T(k[1], k[2]), microNum(mi[k[0]]), k[3] === "g" ? T("г", "g") : k[3], k[4]); });
    else rows += '<div class="mnone">' + T("Микронутриентов в этой записи нет: они считаются для новых записей", "No micronutrient data for this entry: it is calculated for new entries") + '</div>';
    return '<details class="mdet"><summary>' + T("Подробнее", "Details") + '</summary>' + rows + '<div class="mnone">' + T("Проценты — от суточной нормы. Значения оценочные", "Percentages are of the daily value. Values are estimates") + '</div></details>';
  }

  function render(){
    var d = state.data, t = d.totals, g = d.targets;
    var wdi = (new Date(d.date + "T00:00:00Z").getUTCDay() + 6) % 7;
    document.getElementById("dl").textContent = d.date === d.today ? T("Сегодня", "Today") : d.date === shift(d.today, -1) ? T("Вчера", "Yesterday") : human(d.date);
    document.getElementById("ds").textContent = d.date === d.today ? WDF[LANG][wdi] + ", " + human(d.date) : WDF[LANG][wdi];
    document.getElementById("next").style.visibility = d.date >= d.today ? "hidden" : "visible";

    var week = '<div class="week">' + d.week.map(function(w, i){
      var dot = !w.meals ? "" : w.kcal > g.kcal * 1.1 ? "ov" : w.kcal >= g.kcal * 0.8 ? "ok" : "lo";
      var cls = "wd" + (w.date === d.date ? " sel" : "") + (w.date === d.today ? " today" : "");
      var dis = w.date > d.today ? " disabled" : "";
      return '<button class="' + cls + '" data-date="' + w.date + '"' + dis + '><small>' + WD[LANG][i] + '</small><b>' + Number(w.date.slice(8)) + '</b><i class="' + dot + '"></i></button>';
    }).join("") + '</div>';

    var left = g.kcal - t.kcal;
    var days = d.date === d.today && d.streak >= 2 ? d.streak + ' ' + T(plural(d.streak, 'день', 'дня', 'дней'), 'days') : '';
    var streak = days ? '<div class="stk">🔥 ' + days + '</div>' : '';
    hero.innerHTML = week + calCard(t.kcal, g.kcal, left, streak);

    var macros = '<div class="macros">' + macro("p", "protein", T("Белки", "Protein"), t.p, g.p) + macro("c", "carbs", T("Углев.", "Carbs"), t.c, g.c) + macro("f", "fat", T("Жиры", "Fat"), t.f, g.f) + '</div>';

    var wg = d.waterGoal || 2000, wv = d.water || 0;
    var water =
      '<div class="water rise' + (wv >= wg ? ' done' : '') + '"><div class="wh"><div class="wi">' + GLASS + '</div>' +
      '<div class="wt"><b class="wv">' + lit(wv) + '</b><small class="wl"> / ' + L(wg) + '</small><small class="wn">' + waterSub(wv, wg) + '</small></div>' +
      '<div class="wbtn"><button class="sub" data-w="-250" aria-label="' + T("Убрать стакан", "Remove a glass") + '">' + MINUS + '</button><button class="add" data-w="250" aria-label="' + T("Добавить стакан", "Add a glass") + '">' + PLUS + '</button></div></div>' +
      cupCells(wv, wg, "cups") + '</div>';

    var total = d.meals.reduce(function(a, m){ return a + m.totals.kcal; }, 0);
    var add = d.date <= d.today ? '<div class="addm rise"><textarea id="addt" rows="1" maxlength="500" enterkeyhint="send" placeholder="' + T("Что съел? Например: 2 яйца и тост", "What did you eat? For example: 2 eggs and toast") + '"></textarea><button class="addb" id="addb" aria-label="' + T("Добавить еду", "Add food") + '">+</button></div>' +
      '<div class="addh">' + T('ИИ посчитает калории и БЖУ', 'AI will count calories and macros') + (d.date !== d.today ? T(' · запишу на ' + human(d.date), ' · will be logged for ' + human(d.date)) : '') + '</div>' : '';
    var meals = (d.meals.length ? '<h3>' + T("Приёмы пищи", "Meals") + ' <small>' + d.meals.length + ' · ' + n(total) + ' ' + KC() + '</small></h3>' : '<h3>' + T("Приёмы пищи", "Meals") + '</h3>') + add + (d.meals.length ? d.meals.map(function(m, mi){
      return '<div class="meal rise" data-id="' + m.id + '" style="animation-delay:' + (0.05 * mi + 0.1) + 's"><div class="hd"><div class="ib" style="background:' + foodLook(m.title).bg + '">' + foodLook(m.title).e + '</div><div class="t">' + esc(m.title) + '<small>' + esc(m.time) + (total ? ' · ' + r(m.totals.kcal / total * 100) + T('% дня', '% of day') : '') + ' · ' + pfc(m.totals) + '</small></div><div class="k">' + r(m.totals.kcal) + ' ' + KC() + '</div></div>' + mbar(m.totals) +
        m.items.map(function(it, i){
          return '<div class="it"><i class="dot" style="background:' + DOTS[i % DOTS.length] + '"></i><div class="n"><div class="nm" data-meal="' + m.id + '" data-idx="' + i + '">' + esc(it.name) + '</div><small>' + r(it.totals.kcal) + ' ' + KC() + ' · ' + pfc(it.totals) + '</small></div>' +
            '<div class="gr"><input type="number" inputmode="numeric" min="1" max="3000" value="' + it.grams + '" data-meal="' + m.id + '" data-idx="' + i + '"><span class="g">' + T("г", "g") + '</span></div></div>';
        }).join("") +
        microBlock(m, g) + '<button class="del" data-del="' + m.id + '">' + T("Удалить приём пищи", "Delete meal") + '</button></div>';
    }).join("") : '<div class="empty rise"><div class="ib">🥗</div><b>' + T("Здесь пока пусто", "Nothing here yet") + '</b>' + (add ? T('Напиши выше, что ты съел, или отправь боту фото еды 📸', 'Type above what you ate, or send the bot a photo of your food 📸') : T('Отправь боту фото еды, и оно появится в дневнике 📸', 'Send the bot a photo of your food and it will show up in the diary 📸')) + '</div>');

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
    var c = cupsOf(wv);
    card.querySelector(".wv").textContent = lit(wv);
    card.querySelector(".wl").textContent = " / " + L(wg);
    card.querySelector(".wn").textContent = waterSub(wv, wg);
    card.querySelectorAll(".cups i").forEach(function(el, i){ el.className = i < c ? "on" : ""; });
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
        var msg = err && err.error === "limit" ? T("На сегодня лимит запросов к нейросети закончился", "You've used up today's AI requests") :
                  err && err.error === "not_food" ? (err.answer ? String(err.answer).slice(0, 220) : T("Не похоже на еду. Напиши, что ты съел, например: гречка 150 г и котлета", "That doesn't look like food. Type what you ate, for example: buckwheat 150 g and a cutlet")) :
                  T("Не получилось посчитать, попробуй ещё раз", "Couldn't calculate, please try again");
        if (tg && tg.showAlert) tg.showAlert(msg); else alert(msg);
      });
  }
  function grow(ta){ ta.style.height = "auto"; ta.style.height = Math.min(120, ta.scrollHeight) + "px"; }

  function rename(el){
    var old = el.textContent, mealId = el.dataset.meal, idx = Number(el.dataset.idx);
    var inp = document.createElement("input");
    inp.className = "ren"; inp.value = old; inp.placeholder = T("Например: форель", "For example: trout");
    el.replaceWith(inp); inp.focus(); inp.select();
    var done = false;
    function finish(save){
      if (done) return; done = true;
      var v = inp.value.trim();
      if (!save || !v || v === old) { load(state.date); return; }
      inp.disabled = true; inp.value = T("Пересчитываю…", "Recalculating…");
      call("POST", "/api/item/rename", { date: state.date, mealId: mealId, idx: idx, name: v })
        .then(function(){ notify("success"); load(state.date); })
        .catch(function(err){
          var msg = err && err.error === "limit" ? T("На сегодня лимит запросов к нейросети закончился", "You've used up today's AI requests") : T("Не получилось пересчитать, попробуй ещё раз", "Couldn't recalculate, please try again");
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
      if (tg && tg.showConfirm) tg.showConfirm(T("Удалить этот приём пищи?", "Delete this meal?"), function(ok){ if (ok) go(); }); else if (confirm(T("Удалить?", "Delete?"))) go();
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
      if (d.lang && d.lang !== LANG) { state.data = d; setLang(d.lang, true); return; }
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

  // Язык: кнопка в шапке, выбор сохраняется на аккаунте (бот и приложение Android читают то же самое)
  document.getElementById("lang").onclick = function(){
    var next = LANG === "en" ? "ru" : "en";
    tick();
    setLang(next, true);
    call("POST", "/api/lang", { lang: next }).catch(function(){});
  };
  applyStatic();
  load(null);
})();
</script>
</body>
</html>`;

// Для тестов
export const _test = { perUser, parseUsda, lookupUsda, MICRO, sumMicro, reconcile, mealDetails, live, widgetPayload, analyzePhoto, checkAiLimit, appHeaders, waterTick, pillTick, parsePill, nextSlot, slotOf, adviceText, weekTip, startSource, statsText, spark, ACHIEVEMENTS, baseEmoji, calcTargets, verifyInitData, cleanItems, sumItems, parseFix, parseWater, cleanBarcode, waterGoal, HELP, APP_HTML };
