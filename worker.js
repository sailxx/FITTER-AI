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
      if (url.pathname === "/") return new Response("Fitter AI работает ✅", { headers: { "content-type": "text/plain; charset=utf-8" } });
      return new Response("not found", { status: 404 });
    } catch (e) {
      console.error(e && e.stack ? e.stack : e);
      return new Response("error", { status: 500 });
    }
  },
};

// ───────────────────────────── Telegram ─────────────────────────────

async function tg(env, method, payload) {
  const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const j = await r.json().catch(() => ({ ok: false, description: "bad json" }));
  if (!j.ok && !(j.description || "").includes("message is not modified")) {
    console.error("telegram error", method, JSON.stringify(j));
  }
  return j;
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
    [{ text: "⚖️ Вес" }, { text: "👤 Профиль" }],
    [{ text: "❓ Помощь" }],
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
  if (!day.meals.length) return env.DB.delete(`d:${id}:${date}`);
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
  },
  required: ["is_food", "title", "items", "comment"],
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

const PHOTO_PROMPT = `Ты нутрициолог-ассистент приложения Fitter AI. Посмотри на фото.
Если на фото нет еды или напитков — верни is_food=false и пустой items.
Если еда есть — перечисли каждый отдельный продукт или блюдо на фото.
Для каждого оцени вес порции в граммах по размеру тарелки, приборов и упаковки,
и укажи типичные калории, белки, жиры и углеводы НА 100 ГРАММ.
Если на упаковке видна этикетка с КБЖУ — используй её.
Не дроби блюдо слишком мелко: суп, салат, бутерброд — одна позиция.
Названия пиши по-русски, коротко. Будь реалистичен, не занижай и не завышай.`;

const TEXT_PROMPT = `Ты дружелюбный нутрициолог-ассистент Telegram-бота Fitter AI. Пиши по-русски.
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
  return mealText(meal) + (comment ? `\n\n💡 ${esc(comment)}` : "") + "\n\n" + remainingText(u, day, date);
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

const HELP = `<b>Fitter AI</b> — одно фото, полный контроль 📸

<b>Как пользоваться</b>
1. Сфотографируй еду и отправь сюда фото
2. Я определю продукты, вес и посчитаю КБЖУ
3. Если я ошибся с весом — нажми ✏️ и впиши правильный
4. Всё сохраняется в дневник питания

<b>Ещё можно</b>
✍️ Написать текстом: «съел 2 яйца и тост»
❓ Задать вопрос: «сколько белка в твороге?»
⚖️ Записать вес: /weight 72.5

<b>Команды</b>
/today — итоги дня
/week — неделя
/weight — записать вес
/profile — мой профиль и норма
/app — открыть дневник
/reset — пройти анкету заново

<i>Fitter AI считает примерно и не заменяет врача или диетолога.</i>`;

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

  // Ждём новый вес продукта
  if (u.state && u.state.type === "edit") {
    const g = parseNum(text);
    if (text && !text.startsWith("/") && !isMenu(text)) {
      if (!(g > 0 && g <= 3000)) return send(env, chatId, "Напиши вес числом в граммах, например <b>150</b>");
      return applyEdit(env, u, chatId, g);
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
  if (msg.document && /^image\//.test(msg.document.mime_type || "")) return onPhoto(env, u, chatId, msg);

  const cmd = text.split(/\s+/)[0].replace(/@\w+$/, "");
  switch (cmd) {
    case "/today": case "📊": return sendDay(env, u, chatId, today(u));
    case "/week": case "📅": return sendWeek(env, u, chatId);
    case "/profile": case "👤": return sendProfile(env, u, chatId);
    case "/help": case "❓": return send(env, chatId, HELP, { reply_markup: MAIN_KEYBOARD });
    case "/app":
      return send(env, chatId, "Твой дневник питания по дням 👇", { reply_markup: { inline_keyboard: [[appButton(env)]] } });
    case "/weight": case "⚖️": {
      const kg = parseNum(text.slice(cmd.length));
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

const isMenu = (t) => ["📊 Сегодня", "📅 Неделя", "⚖️ Вес", "👤 Профиль", "❓ Помощь"].includes(t);

// ── Анкета ──

async function startOnboarding(env, u, chatId) {
  u.state = { step: "sex" };
  await saveUser(env, u);
  await send(
    env, chatId,
    `Привет${u.name ? ", " + esc(u.name) : ""}! 👋 Я <b>Fitter AI</b>.\n\n` +
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
  if (kind === "e" && isDate(a)) {
    const day = await getDay(env, u.id, a);
    const meal = day.meals.find((m) => m.id === b);
    const it = meal?.items[Number(c)];
    if (!it) return answer("Эта запись уже удалена");
    u.state = { type: "edit", date: a, mealId: b, idx: Number(c), msgId };
    await saveUser(env, u);
    await answer();
    return send(env, chatId, `Сколько граммов на самом деле? Сейчас «${esc(it.name)}» — <b>${it.grams} г</b>.\nНапиши число, например <b>${it.grams}</b>`, {
      reply_markup: { force_reply: true, input_field_placeholder: "Вес в граммах" },
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
    return saveMealAndReply(env, u, chatId, waitId, res.title, items, "photo", res.comment);
  } catch (e) {
    console.error("photo error:", e && e.stack ? e.stack : e);
    return edit(env, chatId, waitId, "😔 Не получилось распознать фото. Попробуй ещё раз через минуту или напиши текстом, что ты съел.");
  }
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

async function applyEdit(env, u, chatId, grams) {
  const { date, mealId, idx, msgId } = u.state;
  u.state = null;
  await saveUser(env, u);
  const day = await getDay(env, u.id, date);
  const meal = day.meals.find((m) => m.id === mealId);
  if (!meal || !meal.items[idx]) return send(env, chatId, "Эта запись уже удалена 🤷");
  const old = meal.items[idx].grams;
  meal.items[idx].grams = round(grams);
  await saveDay(env, u.id, date, day);
  const text = mealCard(u, meal, day, date);
  const extra = { reply_markup: mealKeyboard(env, date, meal) };
  if (msgId) await edit(env, chatId, msgId, text, extra);
  return send(env, chatId, `✅ «${esc(meal.items[idx].name)}»: ${old} г → <b>${meal.items[idx].grams} г</b>. Пересчитал!\n\n${remainingText(u, day, date)}`, {
    reply_markup: MAIN_KEYBOARD,
  });
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
    `🥩 Белки: ${round(t.p)} / ${g.p} г\n🧈 Жиры: ${round(t.f)} / ${g.f} г\n🍞 Углеводы: ${round(t.c)} / ${g.c} г\n\n`;
  if (day.meals.length) {
    text += "<b>Приёмы пищи</b>\n" + day.meals.map((m) => `${m.time} · ${esc(m.title)} — ${round(sumItems(m.items).kcal)} ккал`).join("\n");
    const left = g.kcal - t.kcal;
    text += `\n\n${left >= 0 ? `Осталось: <b>${round(left)} ккал</b>` : `Перебор: <b>${round(-left)} ккал</b>`}`;
  } else {
    text += "Пока ничего не записано. Отправь фото еды 📸";
  }
  return send(env, chatId, text, { reply_markup: { inline_keyboard: [[appButton(env)]] } });
}

async function sendWeek(env, u, chatId) {
  const end = today(u);
  const dates = [...Array(7)].map((_, i) => shiftDate(end, i - 6));
  const days = await Promise.all(dates.map((d) => getDay(env, u.id, d)));
  let sum = 0, cnt = 0;
  const lines = dates.map((d, i) => {
    const k = round(dayTotals(days[i]).kcal);
    const wd = WEEKDAYS[new Date(d + "T00:00:00Z").getUTCDay()];
    if (!days[i].meals.length) return `${wd} ${d.slice(8)}.${d.slice(5, 7)} — нет записей`;
    sum += k; cnt++;
    const pct = k / u.targets.kcal;
    const mark = pct < 0.8 ? "🔵" : pct <= 1.1 ? "🟢" : "🔴";
    return `${mark} ${wd} ${d.slice(8)}.${d.slice(5, 7)} — ${k} ккал`;
  });
  const avg = cnt ? round(sum / cnt) : 0;
  const text =
    `📅 <b>Последние 7 дней</b>\nНорма: ${u.targets.kcal} ккал\n\n${lines.join("\n")}\n\n` +
    (cnt ? `В среднем: <b>${avg} ккал</b> в день (${cnt} дн. с записями)\n` : "") +
    `🔵 мало · 🟢 в норме · 🔴 больше нормы`;
  return send(env, chatId, text, { reply_markup: { inline_keyboard: [[appButton(env)]] } });
}

async function sendProfile(env, u, chatId) {
  const text =
    `👤 <b>Профиль</b>\n` +
    `Пол: ${u.sex === "m" ? "мужской" : "женский"}\nВозраст: ${u.age}\nРост: ${u.height} см\nВес: ${u.weight} кг\n` +
    `Активность: ${ACTIVITY[u.activity]}\nЦель: ${GOALS[u.goal]}\n\n${targetsText(u)}`;
  return send(env, chatId, text, { reply_markup: { inline_keyboard: [[{ text: "✏️ Пройти анкету заново", callback_data: "reset" }]] } });
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
      name: u.name,
    });
  }

  if (request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    if (!isDate(body.date)) return json({ error: "bad date" }, 400);
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
        `<title>Fitter AI — настройка</title><body style="font:16px/1.5 system-ui;max-width:640px;margin:32px auto;padding:0 16px">` +
        `<h2>Fitter AI — настройка</h2>${rows.map(([ok, t]) => `<p>${ok ? "✅" : "❌"} ${t}</p>`).join("")}</body>`,
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
    description: "Fitter AI — одно фото, полный контроль 📸\nОтправь фото еды, и нейросеть посчитает калории, белки, жиры и углеводы и запишет всё в дневник питания.",
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
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>Fitter AI — дневник</title>
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<style>
  :root{
    --bg:var(--tg-theme-secondary-bg-color,#f2f3f5);
    --card:var(--tg-theme-bg-color,#ffffff);
    --text:var(--tg-theme-text-color,#14171a);
    --hint:var(--tg-theme-hint-color,#8a8f98);
    --accent:var(--tg-theme-button-color,#2fb36b);
    --accent-text:var(--tg-theme-button-text-color,#ffffff);
    --danger:var(--tg-theme-destructive-text-color,#e5484d);
    --line:rgba(127,127,127,.15);
    --p:#4f8cff; --f:#f5a524; --c:#2fb36b;
  }
  *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  body{margin:0;background:var(--bg);color:var(--text);font:15px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:12px 12px 32px}
  .top{display:flex;align-items:center;justify-content:space-between;margin:4px 4px 12px}
  .logo{font-weight:700;font-size:18px}
  .logo small{display:block;font-weight:400;font-size:12px;color:var(--hint)}
  .nav{display:flex;align-items:center;gap:6px}
  .nav button{border:0;background:var(--card);color:var(--text);width:36px;height:36px;border-radius:10px;font-size:18px}
  .nav .d{min-width:110px;text-align:center;font-weight:600}
  .card{background:var(--card);border-radius:16px;padding:14px;margin-bottom:12px}
  .week{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}
  .wd{border:0;background:transparent;color:var(--text);border-radius:12px;padding:6px 0;display:flex;flex-direction:column;align-items:center;gap:2px;font:inherit}
  .wd small{color:var(--hint);font-size:11px}
  .wd b{font-size:16px}
  .wd i{width:6px;height:6px;border-radius:50%;background:transparent}
  .wd.sel{background:var(--accent);color:var(--accent-text)}
  .wd.sel small{color:var(--accent-text);opacity:.8}
  .wd.today b{text-decoration:underline}
  .sum{display:flex;gap:16px;align-items:center}
  .ring{position:relative;width:120px;height:120px;flex:none}
  .ring svg{transform:rotate(-90deg)}
  .ring .in{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
  .ring .in b{font-size:22px}
  .ring .in small{color:var(--hint);font-size:12px}
  .macros{flex:1;display:flex;flex-direction:column;gap:10px}
  .m .row{display:flex;justify-content:space-between;font-size:13px}
  .m .row span{color:var(--hint)}
  .track{height:6px;border-radius:3px;background:var(--line);overflow:hidden;margin-top:3px}
  .track div{height:100%;border-radius:3px}
  .left{margin-top:12px;padding-top:10px;border-top:1px solid var(--line);font-size:14px;color:var(--hint)}
  .left b{color:var(--text)}
  h3{margin:18px 4px 8px;font-size:15px;color:var(--hint);font-weight:600}
  .meal .hd{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
  .meal .t{font-weight:600}
  .meal .tm{color:var(--hint);font-size:12px;margin-left:6px;font-weight:400}
  .meal .k{font-weight:700;white-space:nowrap}
  .it{display:flex;align-items:center;gap:8px;padding:8px 0;border-top:1px solid var(--line)}
  .it:first-of-type{margin-top:8px}
  .it .n{flex:1;min-width:0}
  .it .n div{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .it .n small{color:var(--hint);font-size:12px}
  .it input{width:64px;padding:6px 8px;border-radius:8px;border:1px solid var(--line);background:var(--bg);color:var(--text);font:inherit;text-align:right}
  .it .g{color:var(--hint);font-size:13px}
  .del{border:0;background:transparent;color:var(--danger);font:inherit;font-size:13px;padding:8px 0 0}
  .empty{text-align:center;color:var(--hint);padding:28px 12px}
  .empty div{font-size:40px;margin-bottom:6px}
  .wt{display:flex;justify-content:space-between;align-items:center}
  .wt b{font-size:20px}
  .err{color:var(--danger);text-align:center;padding:24px}
</style>
</head>
<body>
<div class="top">
  <div class="logo">Fitter AI<small>Одно фото. Полный контроль.</small></div>
  <div class="nav"><button id="prev">‹</button><span class="d" id="dl">…</span><button id="next">›</button></div>
</div>
<div id="root"><div class="empty">Загрузка…</div></div>
<script>
(function(){
  var tg = window.Telegram && window.Telegram.WebApp;
  if (tg) { tg.ready(); tg.expand(); }
  var initData = tg ? tg.initData : "";
  var MONTHS = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
  var WD = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];
  var state = { date: null, data: null };
  var root = document.getElementById("root");

  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;"}[c]; }); }
  function r(x){ return Math.round(x); }
  function shift(date, n){ var d = new Date(date + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0,10); }
  function human(date){ var d = new Date(date + "T00:00:00Z"); return d.getUTCDate() + " " + MONTHS[d.getUTCMonth()]; }
  function haptic(){ try { tg.HapticFeedback.impactOccurred("light"); } catch(e){} }

  function call(method, path, body){
    return fetch(path, { method: method, headers: { "X-Init-Data": initData, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined })
      .then(function(res){ return res.json().then(function(j){ if (!res.ok) throw j; return j; }); });
  }

  function load(date){
    call("GET", "/api/day" + (date ? "?date=" + date : "")).then(function(d){
      state.date = d.date; state.data = d; render();
    }).catch(function(e){
      var msg = e && e.error === "no_profile" ? "Сначала пройди анкету в боте: нажми /start" :
                e && e.error === "unauthorized" ? "Открой дневник через кнопку в боте Fitter AI" : "Не получилось загрузить дневник. Попробуй ещё раз.";
      root.innerHTML = '<div class="err">' + msg + '</div>';
    });
  }

  function bar(label, val, max, color){
    var pct = max ? Math.min(100, val / max * 100) : 0;
    return '<div class="m"><div class="row"><b>' + label + '</b><span>' + r(val) + ' / ' + max + ' г</span></div>' +
           '<div class="track"><div style="width:' + pct + '%;background:' + color + '"></div></div></div>';
  }

  function ring(val, max){
    var R = 52, C = 2 * Math.PI * R, pct = max ? Math.min(1, val / max) : 0;
    var color = val > max * 1.1 ? "var(--danger)" : "var(--accent)";
    return '<div class="ring"><svg width="120" height="120"><circle cx="60" cy="60" r="' + R + '" fill="none" stroke="var(--line)" stroke-width="10"/>' +
      '<circle cx="60" cy="60" r="' + R + '" fill="none" stroke="' + color + '" stroke-width="10" stroke-linecap="round" stroke-dasharray="' + C + '" stroke-dashoffset="' + (C * (1 - pct)) + '"/></svg>' +
      '<div class="in"><b>' + r(val) + '</b><small>из ' + max + ' ккал</small></div></div>';
  }

  function weightBlock(ws){
    if (!ws || !ws.length) return "";
    var last = ws[ws.length - 1], first = ws[0], diff = Math.round((last.kg - first.kg) * 10) / 10;
    var spark = "";
    if (ws.length > 1) {
      var min = Infinity, max = -Infinity;
      ws.forEach(function(w){ min = Math.min(min, w.kg); max = Math.max(max, w.kg); });
      var span = max - min || 1, W = 120, H = 36;
      var pts = ws.map(function(w, i){ return (i / (ws.length - 1) * W).toFixed(1) + "," + (H - 4 - (w.kg - min) / span * (H - 8)).toFixed(1); }).join(" ");
      spark = '<svg width="' + W + '" height="' + H + '"><polyline points="' + pts + '" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>';
    }
    return '<h3>Вес</h3><div class="card wt"><div><b>' + last.kg + ' кг</b><br><small style="color:var(--hint)">' +
      (ws.length > 1 ? (diff > 0 ? "+" : "") + diff + " кг с " + human(first.date) : "записан " + human(last.date)) +
      '</small></div>' + spark + '</div>';
  }

  function render(){
    var d = state.data, t = d.totals, g = d.targets;
    document.getElementById("dl").textContent = d.date === d.today ? "Сегодня" : human(d.date);
    document.getElementById("next").style.visibility = d.date >= d.today ? "hidden" : "visible";

    var week = '<div class="card week">' + d.week.map(function(w, i){
      var dot = !w.meals ? "transparent" : w.kcal > g.kcal * 1.1 ? "var(--danger)" : w.kcal >= g.kcal * 0.8 ? "var(--c)" : "var(--p)";
      var cls = "wd" + (w.date === d.date ? " sel" : "") + (w.date === d.today ? " today" : "");
      var dis = w.date > d.today ? " disabled style=\\"opacity:.35\\"" : "";
      return '<button class="' + cls + '" data-date="' + w.date + '"' + dis + '><small>' + WD[i] + '</small><b>' + Number(w.date.slice(8)) + '</b><i style="background:' + dot + '"></i></button>';
    }).join("") + '</div>';

    var left = g.kcal - t.kcal;
    var sum = '<div class="card"><div class="sum">' + ring(t.kcal, g.kcal) + '<div class="macros">' +
      bar("Белки", t.p, g.p, "var(--p)") + bar("Жиры", t.f, g.f, "var(--f)") + bar("Углеводы", t.c, g.c, "var(--c)") +
      '</div></div><div class="left">' + (left >= 0 ? 'Осталось <b>' + r(left) + ' ккал</b>' : 'Больше нормы на <b>' + r(-left) + ' ккал</b>') + '</div></div>';

    var meals = d.meals.length ? '<h3>Приёмы пищи</h3>' + d.meals.map(function(m){
      return '<div class="card meal"><div class="hd"><div class="t">' + esc(m.title) + '<span class="tm">' + esc(m.time) + '</span></div><div class="k">' + r(m.totals.kcal) + ' ккал</div></div>' +
        m.items.map(function(it, i){
          return '<div class="it"><div class="n"><div>' + esc(it.name) + '</div><small>' + r(it.totals.kcal) + ' ккал · Б ' + r(it.totals.p) + ' · Ж ' + r(it.totals.f) + ' · У ' + r(it.totals.c) + '</small></div>' +
            '<input type="number" inputmode="numeric" min="1" max="3000" value="' + it.grams + '" data-meal="' + m.id + '" data-idx="' + i + '"><span class="g">г</span></div>';
        }).join("") +
        '<button class="del" data-del="' + m.id + '">Удалить приём пищи</button></div>';
    }).join("") : '<div class="card empty"><div>📸</div>Здесь пока пусто.<br>Отправь боту фото еды — и оно появится в дневнике.</div>';

    root.innerHTML = week + sum + meals + weightBlock(d.weights);
  }

  root.addEventListener("click", function(e){
    var b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.date) { haptic(); load(b.dataset.date); }
    if (b.dataset.del) {
      var id = b.dataset.del;
      var go = function(){ call("POST", "/api/meal/delete", { date: state.date, mealId: id }).then(function(){ haptic(); load(state.date); }); };
      if (tg && tg.showConfirm) tg.showConfirm("Удалить этот приём пищи?", function(ok){ if (ok) go(); }); else if (confirm("Удалить?")) go();
    }
  });
  root.addEventListener("change", function(e){
    var inp = e.target;
    if (!inp.dataset.meal) return;
    var g = Number(inp.value);
    if (!(g > 0 && g <= 3000)) { load(state.date); return; }
    call("POST", "/api/item/edit", { date: state.date, mealId: inp.dataset.meal, idx: Number(inp.dataset.idx), grams: g })
      .then(function(){ haptic(); load(state.date); });
  });
  document.getElementById("prev").onclick = function(){ if (state.date) { haptic(); load(shift(state.date, -1)); } };
  document.getElementById("next").onclick = function(){ if (state.date) { haptic(); load(shift(state.date, 1)); } };

  load(null);
})();
</script>
</body>
</html>`;

// Для тестов
export const _test = { calcTargets, verifyInitData, cleanItems, sumItems, APP_HTML };
