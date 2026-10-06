// Проверка бота без интернета: подменяем Telegram, Gemini и базу данных.
// Запуск: node test/test.js
import assert from "node:assert/strict";
import worker, { _test } from "../worker.js";

const TOKEN = "123:TEST";
const sent = [];
let geminiReply = null;
let geminiCalls = [];
let offCalls = 0;
let rejectQuote = false;

class FakeKV {
  constructor() { this.m = new Map(); }
  async get(k, type) { const v = this.m.get(k); if (v == null) return null; return type === "json" ? JSON.parse(v) : v; }
  async put(k, v) { this.m.set(k, v); }
  async delete(k) { this.m.delete(k); }
  async list({ prefix = "" } = {}) { return { keys: [...this.m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }; }
}

let msgId = 100;
globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  if (url.startsWith(`https://api.telegram.org/file/bot${TOKEN}/`)) {
    return new Response(new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]));
  }
  if (url.startsWith(`https://api.telegram.org/bot${TOKEN}/`)) {
    const method = url.split("/").pop();
    const body = JSON.parse(opts.body || "{}");
    sent.push({ method, body });
    if (method === "getFile") return Response.json({ ok: true, result: { file_path: "photos/file_1.jpg" } });
    if (method === "getMe") return Response.json({ ok: true, result: { username: "fitter_test_bot" } });
    if (method === "getStickerSet") {
      if (body.name === "fitter_ui_by_fitter_test_bot") {
        const ui = ["👤", "❓", "✏️", "🗑", "💡", "✅", "📸", "🔍", "✍️", "👋", "🤔", "😔", "🔄", "🎉", "📱", "↩️", "✨", "⌨️"];
        return Response.json({ ok: true, result: { title: "FITTER UI", stickers: ui.map((e, i) => ({ emoji: e, custom_emoji_id: String(8000 + i) })) } });
      }
      if (body.name !== "fitter_by_fitter_test_bot") return Response.json({ ok: false, description: "STICKERSET_INVALID" });
      // Так Telegram может хранить эмодзи: с полом, оттенком кожи и без FE0F
      const em = ["🍽", "🍗", "💧", "🌾", "🔥", "⚖", "📔", "🍏", "🛋", "🚶‍♂️", "🏃‍♂️", "💪🏻", "📉", "🥤", "📦", "📏", "🎂", "🏆", "1️⃣", "2️⃣", "3️⃣", "4️⃣", "💊", "⏰", "🧠", "🎯", "📝", "💬", "🟩", "🟦", "🟥", "⬜", "📅", "🔒", "📷", "📓", "💯", "📊"];
      return Response.json({ ok: true, result: { title: "FITTER ICONS", stickers: em.map((e, i) => ({ emoji: e, file_id: "f" + i, custom_emoji_id: String(9000 + i) })) } });
    }
    if (method === "sendMessage" && rejectQuote && /<blockquote>[\s\S]*<tg-emoji/.test(body.text || "")) {
      return Response.json({ ok: false, description: "Bad Request: test reject" });
    }
    if (method === "sendMessage") return Response.json({ ok: true, result: { message_id: ++msgId } });
    return Response.json({ ok: true, result: true });
  }
  if (url.startsWith("https://generativelanguage.googleapis.com/")) {
    const body = JSON.parse(opts.body);
    geminiCalls.push({ url, body });
    if (url.includes("gemini-3.5-flash:")) return new Response("model not found", { status: 404 }); // проверяем запасную модель
    const reply = typeof geminiReply === "function" ? geminiReply(body) : geminiReply;
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] } }] });
  }
  if (url.startsWith("https://world.openfoodfacts.org/api/v2/product/")) {
    offCalls++;
    const code = url.split("/product/")[1].split(".")[0];
    if (code === "4607001771234") {
      return Response.json({ status: 1, product: { product_name: "Йогурт греческий 2%", brands: "Тестовый", product_quantity: 140,
        nutriments: { "energy-kcal_100g": 66, proteins_100g: 8, fat_100g: 2, carbohydrates_100g: 3.8 } } });
    }
    return Response.json({ status: 0 }, { status: 404 });
  }
  throw new Error("unexpected fetch " + url);
};

const env = { BOT_TOKEN: TOKEN, GEMINI_API_KEY: "k", WEBHOOK_SECRET: "s3cret", DB: new FakeKV() };
const pending = [];
const ctx = { waitUntil: (p) => pending.push(p) };
const base = "https://fitter.example.workers.dev";

async function call(update) {
  sent.length = 0;
  const res = await worker.fetch(new Request(base + "/webhook", {
    method: "POST",
    headers: { "X-Telegram-Bot-Api-Secret-Token": "s3cret", "content-type": "application/json" },
    body: JSON.stringify(update),
  }), env, ctx);
  assert.equal(res.status, 200);
  await Promise.all(pending.splice(0));
  return sent.slice();
}
const from = { id: 42, first_name: "Влад" };
const chat = { id: 42, type: "private" };
const msg = (text) => call({ message: { message_id: 1, from, chat, text } });
const cb = (data) => call({ callback_query: { id: "q", from, data, message: { message_id: 7, chat } } });
// Поздравления с наградами проверяем отдельно, здесь их пропускаем
const lastText = (s) => s.filter((x) => (x.method === "sendMessage" || x.method === "editMessageText") && !/^🏆 <b>Нов/.test(x.body.text || "")).map((x) => x.body.text).pop();

// 1. Неверный секрет webhook
{
  const r = await worker.fetch(new Request(base + "/webhook", { method: "POST", body: "{}" }), env, ctx);
  assert.equal(r.status, 403);
}

// 2. Анкета
let s = await msg("/start");
assert.match(lastText(s), /Твой пол/);
s = await cb("sex|m");
assert.match(lastText(s), /Сколько тебе лет/);
s = await msg("abc");
assert.match(lastText(s), /возраст числом/);
await msg("16");
await msg("178");
s = await msg("65,5");
assert.match(lastText(s), /активен/);
s = await cb("act|1.55");
assert.match(lastText(s), /цель/);
s = await cb("goal|gain");
const u = await env.DB.get("u:42", "json");
assert.ok(u.targets.kcal > 2500 && u.targets.kcal < 3300, "норма калорий " + u.targets.kcal);
assert.equal(u.weight, 65.5);
assert.ok(s.some((x) => /Твоя дневная норма/.test(x.body.text || "")));
console.log("✓ анкета, норма:", u.targets);

// 3. Фото еды
geminiReply = {
  is_food: true, title: "Гречка с курицей", comment: "Хороший баланс белков и углеводов",
  items: [
    { name: "Гречка", grams: 150, kcal_100: 110, protein_100: 4.2, fat_100: 1.1, carbs_100: 21.3 },
    { name: "Куриная грудка", grams: 120, kcal_100: 165, protein_100: 31, fat_100: 3.6, carbs_100: 0 },
  ],
};
geminiCalls = [];
s = await call({ message: { message_id: 2, from, chat, photo: [
  { file_id: "small", width: 90, height: 90 }, { file_id: "mid", width: 800, height: 600 }, { file_id: "big", width: 1280, height: 960 },
], caption: "это обед" } });
assert.equal(s.find((x) => x.method === "getFile").body.file_id, "mid", "выбираем фото до 1000px");
assert.equal(geminiCalls.length, 2, "первая модель 404 → запасная");
const g = geminiCalls[1].body;
assert.equal(g.contents[0].parts[1].inline_data.mime_type, "image/jpeg");
assert.ok(g.contents[0].parts[0].text.includes("это обед"));
const card = s.find((x) => x.method === "editMessageText");
assert.match(card.body.text, /Гречка — 150 г · <b>165<\/b> ккал/);
assert.match(card.body.text, /🔥(<\/tg-emoji>)? <b>363 ккал<\/b>/);
const kb = card.body.reply_markup.inline_keyboard;
const editBtn = kb[0][0].callback_data;
assert.ok(Buffer.byteLength(editBtn) <= 64);
console.log("✓ фото распознано:\n" + card.body.text + "\n");

// 4. Исправление веса
s = await cb(editBtn);
assert.match(lastText(s), /Напиши, что исправить/);
s = await msg("200");
assert.match(lastText(s), /150 г → <b>200 г<\/b>/);
const date = editBtn.split("|")[1];
let day = await env.DB.get(`d:42:${date}`, "json");
assert.equal(day.meals[0].items[0].grams, 200);
console.log("✓ вес исправлен");

// 4б. Исправление названия: «форель 180 г» → нейросеть пересчитывает КБЖУ
const pf = _test.parseFix;
assert.deepEqual(pf("150"), { grams: 150 });
assert.deepEqual(pf("150 г"), { grams: 150 });
assert.deepEqual(pf("форель"), { name: "форель", grams: null });
assert.deepEqual(pf("форель 200 г"), { name: "форель", grams: 200 });
assert.deepEqual(pf("200 грамм форели"), { name: "форели", grams: 200 });
assert.deepEqual(pf("2 яйца"), { name: "2 яйца", grams: null });
assert.equal(pf("0"), null);
geminiReply = { name: "Форель с овощами", kcal_100: 150, protein_100: 20, fat_100: 7, carbs_100: 2, meal_title: "Форель с рисом" };
s = await cb(editBtn);
assert.match(lastText(s), /всё вместе/);
s = await msg("форель 180 г");
assert.match(lastText(s), /«Гречка» 200 г → <b>«Форель с овощами» 180 г<\/b>/);
assert.match(lastText(s), /270 ккал/);
day = await env.DB.get(`d:42:${date}`, "json");
assert.equal(day.meals[0].title, "Форель с рисом");
assert.equal(day.meals[0].items[0].kcal_100, 150);
assert.ok(geminiCalls.at(-1).body.contents[0].parts[0].text.includes("Стало: «форель»"));
console.log("✓ название исправлено, КБЖУ пересчитаны");

// 5. Текст: запись еды и вопрос
geminiReply = { intent: "food_log", answer: "Записал!", title: "Банан", items: [{ name: "Банан", grams: 120, kcal_100: 89, protein_100: 1.1, fat_100: 0.3, carbs_100: 22.8 }] };
s = await msg("съел банан");
assert.match(lastText(s), /Банан — 120 г · <b>107<\/b> ккал/);
geminiReply = { intent: "question", answer: "В твороге 5% около 17 г белка на 100 г 💪", title: "", items: [] };
s = await msg("сколько белка в твороге?");
assert.match(lastText(s), /17 г белка/);
assert.ok(geminiCalls.at(-1).body.contents[0].parts[0].text.includes("Уже съедено сегодня"));
console.log("✓ текст: запись и вопрос");

// 6. Не еда
geminiReply = { is_food: false, title: "", comment: "", items: [] };
s = await call({ message: { message_id: 3, from, chat, photo: [{ file_id: "cat", width: 800, height: 600 }] } });
assert.match(lastText(s), /Не вижу на фото еды/);

// 7. Итоги, неделя, профиль, вес
s = await msg("📊 Сегодня");
assert.match(lastText(s), /Приёмы пищи/);
s = await msg("📅 Неделя");
assert.match(lastText(s), /<b>Неделя<\/b>/);
assert.match(lastText(s), /🟩|🟦|🟥/);
assert.match(lastText(s), /В норме <b>\d из \d<\/b>/);
assert.match(lastText(s), /💡/);
assert.match(lastText(s), /📊(<\/tg-emoji>)? <b>Итоги<\/b>/);
assert.match(lastText(s), /<i>сегодня<\/i>/);
assert.ok(s.at(-1).body.reply_markup.inline_keyboard.flat().some((b) => b.callback_data === "advice"));
s = await msg("👤 Профиль");
assert.match(lastText(s), /💪 Набрать массу\n\n\n/);
assert.ok(!lastText(s).includes("<blockquote>"));
assert.match(lastText(s), /🎂 16 лет/);
assert.match(lastText(s), /💧 Вода  <b>/);
s = await msg("/weight 66.2");
assert.match(lastText(s), /66.2 кг/);
s = await msg("⚖️ Вес");
assert.match(lastText(s), /Сколько ты сейчас весишь/);
s = await msg("66");
assert.match(lastText(s), /Записал: <b>66 кг/);
console.log("✓ сегодня, неделя, профиль, вес");

// 8. Mini App API с настоящей подписью Telegram
async function signInit(user, token, authDate = Math.floor(Date.now() / 1000)) {
  const p = new URLSearchParams({ auth_date: String(authDate), query_id: "AA", user: JSON.stringify(user) });
  const dcs = [...p.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join("\n");
  const enc = new TextEncoder();
  const k1 = await crypto.subtle.importKey("raw", enc.encode("WebAppData"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sec = await crypto.subtle.sign("HMAC", k1, enc.encode(token));
  const k2 = await crypto.subtle.importKey("raw", sec, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const h = [...new Uint8Array(await crypto.subtle.sign("HMAC", k2, enc.encode(dcs)))].map((b) => b.toString(16).padStart(2, "0")).join("");
  p.set("hash", h);
  return p.toString();
}
const init = await signInit({ id: 42, first_name: "Влад" }, TOKEN);
const apiCall = (path, method = "GET", body, initData = init) =>
  worker.fetch(new Request(base + path, { method, headers: { "X-Init-Data": initData, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }), env, ctx);

let r = await apiCall("/api/day", "GET", null, init.replace(/hash=[0-9a-f]{4}/, "hash=0000"));
assert.equal(r.status, 401, "поддельная подпись");
r = await apiCall("/api/day", "GET", null, await signInit({ id: 42, first_name: "Влад" }, TOKEN, Math.floor(Date.now() / 1000) - 2 * 86400));
assert.equal(r.status, 401, "подпись старше суток");
r = await apiCall("/api/day");
assert.equal(r.status, 200);
let d = await r.json();
assert.equal(d.meals.length, 2);
assert.equal(d.week.length, 7);
assert.ok(d.week.some((w) => w.date === d.date && w.meals === 2));
for (const idx of [undefined, -1, 99, "x"]) {
  r = await apiCall("/api/item/delete", "POST", { date: d.date, mealId: d.meals[0].id, idx });
  assert.equal(r.status, 400, "неверный номер продукта: " + idx);
}
r = await apiCall("/api/item/edit", "POST", { date: d.date, mealId: d.meals[0].id, idx: 1, grams: 100 });
assert.equal(r.status, 200);
geminiReply = { name: "Индейка", kcal_100: 140, protein_100: 29, fat_100: 2, carbs_100: 0, meal_title: "Форель и индейка" };
r = await apiCall("/api/item/rename", "POST", { date: d.date, mealId: d.meals[0].id, idx: 1, name: "индейка" });
assert.equal(r.status, 200);
r = await apiCall("/api/meal/delete", "POST", { date: d.date, mealId: d.meals[1].id });
assert.equal(r.status, 200);
d = await (await apiCall("/api/day?date=" + d.date)).json();
assert.equal(d.meals.length, 1);
assert.equal(d.meals[0].items[1].grams, 100);
assert.equal(d.meals[0].items[1].name, "Индейка");
assert.equal(Math.round(d.meals[0].items[1].totals.kcal), 140);
console.log("✓ Mini App API, итого за день:", Math.round(d.totals.kcal), "ккал");

// 8b. Запись еды текстом из дневника
{
  geminiReply = { intent: "food_log", answer: "", title: "Яйца и тост", items: [
    { name: "Яйцо варёное", grams: 110, kcal_100: 155, protein_100: 13, fat_100: 11, carbs_100: 1.1 },
    { name: "Тост", grams: 30, kcal_100: 265, protein_100: 9, fat_100: 3.2, carbs_100: 49 }] };
  let a = await apiCall("/api/meal/add", "POST", { date: d.date, text: "2 яйца и тост" });
  assert.equal(a.status, 200);
  const added = await a.json();
  assert.equal(added.title, "Яйца и тост");
  assert.equal(added.kcal, 250);
  let dd = await (await apiCall("/api/day?date=" + d.date)).json();
  const m = dd.meals.find((x) => x.id === added.id);
  assert.equal(m.source, "app");
  assert.equal(m.items.length, 2);
  geminiReply = { intent: "question", answer: "Это не похоже на еду 🙂", title: "", items: [] };
  a = await apiCall("/api/meal/add", "POST", { date: d.date, text: "как дела" });
  assert.equal(a.status, 422);
  assert.equal((await a.json()).answer, "Это не похоже на еду 🙂");
  a = await apiCall("/api/meal/add", "POST", { date: d.date, text: " " });
  assert.equal(a.status, 400);
  a = await apiCall("/api/meal/add", "POST", { date: "2099-01-01", text: "банан" });
  assert.equal(a.status, 400);
  // Вчерашний день: запись попадает в нужный день
  geminiReply = { intent: "food_log", answer: "", title: "Банан", items: [{ name: "Банан", grams: 120, kcal_100: 89, protein_100: 1.1, fat_100: 0.3, carbs_100: 22.8 }] };
  const y = new Date(Date.parse(d.date + "T00:00:00Z") - 864e5).toISOString().slice(0, 10);
  a = await apiCall("/api/meal/add", "POST", { date: y, text: "банан" });
  assert.equal(a.status, 200);
  dd = await (await apiCall("/api/day?date=" + y)).json();
  assert.ok(dd.meals.some((x) => x.title === "Банан" && x.time === "—"));
  a = await apiCall("/api/meal/delete", "POST", { date: y, mealId: dd.meals.find((x) => x.title === "Банан").id });
  a = await apiCall("/api/meal/delete", "POST", { date: d.date, mealId: added.id });
  assert.equal(a.status, 200);
  assert.match(_test.APP_HTML, /id="addt"/);
  console.log("✓ дневник: запись еды текстом");
}

// 8c. Таблетки: дневник, напоминания и кнопки в чате
{
  const u42 = await env.DB.get("u:42", "json");
  const tz = typeof u42.tz === "number" ? u42.tz : 180;
  const now = Date.now();
  const local = new Date(now + tz * 60000).toISOString();
  const date = local.slice(0, 10);
  const slot = _test.slotOf(local.slice(11, 16));
  let a = await apiCall("/api/pill/add", "POST", { date, name: "Витамин D", dose: "1 капсула", times: [slot, "09:15", "bad"] });
  assert.equal(a.status, 200);
  a = await apiCall("/api/pill/add", "POST", { date, name: "", times: [slot] });
  assert.equal(a.status, 400);
  let dd = await (await apiCall("/api/day?date=" + date)).json();
  assert.equal(dd.pillList.length, 1);
  assert.deepEqual(dd.pillList[0].times, [slot]);
  assert.equal(dd.pills.length, 1);
  const pid = dd.pillList[0].id;
  assert.ok((await env.DB.get("pl:ids", "json")).includes(42));
  // Напоминание приходит в свой слот один раз
  sent.length = 0;
  assert.equal(await _test.pillTick(env, now), 1);
  assert.match(sent.at(-1).body.text, /Время принять[\s\S]*Витамин D<\/b> · 1 капсула/);
  assert.equal(sent.at(-1).body.reply_markup.inline_keyboard[0][0].callback_data, `p|t|${date}|${pid}|${slot}`);
  assert.equal(await _test.pillTick(env, now), 0);
  // «Через 30 минут» — напомнит в следующий слот
  let r = await cb(`p|z|${date}|${pid}|${slot}`);
  assert.match(lastText(r), /Напомню в/);
  assert.equal(await _test.pillTick(env, now + 30 * 60000), 1);
  // «Принял» из чата видно в дневнике
  r = await cb(`p|t|${date}|${pid}|${slot}`);
  assert.match(lastText(r), /✅(<\/tg-emoji>)? Принято в/);
  dd = await (await apiCall("/api/day?date=" + date)).json();
  assert.equal(dd.pills[0].s, "taken");
  // Снять отметку и поставить снова из дневника
  a = await apiCall("/api/pill/mark", "POST", { date, id: pid, time: slot, s: "" });
  assert.equal((await a.json()).s, "");
  a = await apiCall("/api/pill/mark", "POST", { date, id: pid, time: slot, s: "taken" });
  assert.equal((await a.json()).s, "taken");
  a = await apiCall("/api/pill/mark", "POST", { date, id: "nope", time: slot, s: "taken" });
  assert.equal(a.status, 404);
  // Отложенное в 23:30 приходит в 00:00 уже следующих суток
  await env.DB.put("d:42:2030-01-01", JSON.stringify({ meals: [], pills: { [`${pid}@${slot}`]: { s: "snooze", at: "00:00" } } }));
  sent.length = 0;
  // (если приём сам стоит на 00:00, придёт ещё и сегодняшнее)
  assert.equal(await _test.pillTick(env, Date.UTC(2030, 0, 2, 0, 5) - tz * 60000), slot === "00:00" ? 2 : 1);
  assert.equal(sent[0].body.reply_markup.inline_keyboard[0][0].callback_data, `p|t|2030-01-01|${pid}|${slot}`);
  assert.equal(JSON.parse(await env.DB.get("d:42:2030-01-01")).pills[`${pid}@${slot}`].s, "sent");
  await env.DB.delete("d:42:2030-01-01");
  await env.DB.delete("d:42:2030-01-02");
  // Удаление убирает и из рассылки
  a = await apiCall("/api/pill/delete", "POST", { date, id: pid });
  assert.equal(a.status, 200);
  assert.ok(!(await env.DB.get("pl:ids", "json")).includes(42));
  r = await cb(`p|t|${date}|${pid}|${slot}`);
  assert.equal(r.find((x) => x.method === "answerCallbackQuery").body.text, "Этого препарата уже нет в списке");
  assert.equal(_test.nextSlot("23:30"), "00:00");
  assert.match(_test.APP_HTML, /Таблетки/);
  // Переключатель темы: кнопка и обе палитры
  assert.match(_test.APP_HTML, /id="theme"/);
  assert.match(_test.APP_HTML, /data-theme="light"]/);
  assert.match(_test.APP_HTML, /data-theme="dark"]/);
  console.log("✓ таблетки: дневник, напоминания, кнопки");
}

// 8d. Таблетки в чате и вес в дневнике
{
  assert.deepEqual(_test.parsePill("Витамин D, 1 капсула, 9:00 21:00"), { name: "Витамин D", dose: "1 капсула", times: ["09:00", "21:00"] });
  assert.deepEqual(_test.parsePill("Магний 2 таб в 14:40"), { name: "Магний", dose: "2 таб", times: ["14:30"] });
  assert.equal(_test.parsePill("Омега-3"), null);
  assert.equal(_test.parsePill("9:00"), null);
  // Кнопка меню вместо «Вес»
  let r = await msg("/start");
  const kb = r.find((x) => x.body.reply_markup?.keyboard).body.reply_markup.keyboard.flat().map((b) => b.text);
  // В меню только «Сегодня», «Неделя», «Профиль», «Помощь»; старые кнопки текстом работают
  assert.ok(!kb.some((t) => /Таблетки|Вода|Вес$/.test(t)) && kb.length === 4);
  r = await msg("💊 Таблетки");
  assert.match(lastText(r), /Добавь витамины/);
  r = await cb("pl|add");
  assert.match(lastText(r), /название, дозу и время/);
  r = await msg("Омега-3");
  assert.match(lastText(r), /Напиши название и время/);
  r = await msg("Омега-3, 2 капсулы, 9:00 21:00");
  assert.ok(r.some((x) => /Добавил[\s\S]*Омега-3/.test(x.body.text || "")));
  assert.match(lastText(r), /Таблетки на сегодня<\/b> · 0 из 2/);
  const u42 = await env.DB.get("u:42", "json");
  const pid = u42.pills[0].id;
  const date = r.at(-1).body.reply_markup.inline_keyboard[0][0].callback_data.split("|")[2];
  assert.ok((await env.DB.get("pl:ids", "json")).includes(42));
  // Отметка и снятие отметки из списка
  r = await cb(`pl|m|${date}|${pid}|09:00`);
  assert.match(lastText(r), /1 из 2/);
  r = await cb(`pl|m|${date}|${pid}|09:00`);
  assert.match(lastText(r), /0 из 2/);
  // Удаление
  r = await cb("pl|edit");
  assert.match(lastText(r), /Мои препараты/);
  r = await cb(`pl|x|${pid}`);
  assert.match(lastText(r), /Добавь витамины/);
  assert.ok(!(await env.DB.get("pl:ids", "json")).includes(42));
  // Вес из дневника: карандаш и /api/weight
  let a = await apiCall("/api/weight", "POST", { date, kg: 500 });
  assert.equal(a.status, 400);
  a = await apiCall("/api/weight", "POST", { date, kg: 70.44 });
  assert.equal(a.status, 200);
  assert.equal((await a.json()).kg, 70.4);
  const dd = await (await apiCall("/api/day?date=" + date)).json();
  assert.equal(dd.weights.at(-1).kg, 70.4);
  assert.match(_test.APP_HTML, /data-wedit/);
  // Дневник сам подтягивает отметки из чата
  assert.match(_test.APP_HTML, /setInterval\(sync, 20000\)/);
  console.log("✓ таблетки в чате, вес в дневнике");
}

// 9. Страницы
r = await worker.fetch(new Request(base + "/app"), env, ctx);
const html = await r.text();
assert.match(html, /telegram-web-app\.js/);
// Проверяем, что JS внутри Mini App без синтаксических ошибок
const script = html.split("<script>")[1].split("</script>")[0];
new Function(script);
// CSP: встроенный скрипт разрешён по хэшу, запросы только к себе
{
  const csp = r.headers.get("content-security-policy");
  const hash = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(script))).toString("base64");
  assert.ok(csp.includes("'sha256-" + hash + "'"), "хэш скрипта дневника");
  assert.match(csp, /connect-src 'self'/);
  assert.doesNotMatch(csp, /script-src[^;]*unsafe-inline/);
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
}
r = await worker.fetch(new Request(base + "/setup?secret=s3cret"), env, ctx);
assert.doesNotMatch(await r.text(), /Всё готово/, "секрет в адресе не принимается");
const setupPost = (secret) => worker.fetch(new Request(base + "/setup", { method: "POST", body: new URLSearchParams({ secret }) }), env, ctx);
r = await setupPost("wrong");
assert.equal(r.status, 403);
assert.ok(!sent.some((x) => x.method === "setWebhook"));
r = await setupPost("s3cret");
const setupHtml = await r.text();
assert.match(setupHtml, /Всё готово/);
assert.equal(sent.find((x) => x.method === "setWebhook").body.url, base + "/webhook");
console.log("✓ /app и /setup");

// 10. Вода
{
  const pw = _test.parseWater;
  assert.equal(pw("вода 300"), 300);
  assert.equal(pw("+500"), 500);
  assert.equal(pw("выпил 330 мл воды"), 330);
  assert.equal(pw("0,5 л воды"), 500);
  assert.equal(pw("2 стакана воды"), 500);
  assert.equal(pw("стакан воды"), 250);
  assert.equal(pw("200"), null);
  assert.equal(pw("съел 2 яйца"), null);
  assert.equal(_test.waterGoal({ weight: 65.5 }), 1950);
  const W = (await env.DB.get("u:42", "json")).weight;
  const goalL = String(_test.waterGoal({ weight: W }) / 1000).replace(".", ",") + " л";
  s = await msg("💧 Вода");
  assert.match(lastText(s), /Вода за сегодня/);
  assert.ok(lastText(s).includes("0 л</b> / " + goalL));
  const wbtn = s.find((x) => x.method === "sendMessage").body.reply_markup.inline_keyboard[0][0].callback_data;
  s = await cb(wbtn);
  assert.ok(lastText(s).includes("0,25 л</b> / " + goalL));
  s = await msg("вода 500");
  assert.match(lastText(s), /\+500 мл записал/);
  assert.match(lastText(s), /0,75 л/);
  s = await msg("/today");
  assert.ok(lastText(s).includes("💧 Вода  <b>0,75 л</b> / " + goalL));
  d = await (await apiCall("/api/day")).json();
  assert.equal(d.water, 750);
  r = await apiCall("/api/water", "POST", { date: d.date, delta: -250 });
  assert.equal((await r.json()).water, 500);
  r = await apiCall("/api/water", "POST", { date: d.date, delta: 9999 });
  assert.equal(r.status, 400);
  // Достиг нормы: салют 🎉 в чате
  const goalMl = _test.waterGoal({ weight: W });
  s = await msg("вода " + Math.min(3000, goalMl - 500));
  assert.equal(s.find((x) => x.method === "sendMessage").body.message_effect_id, "5046509860389126442");
  s = await cb(wbtn);
  assert.ok(!s.some((x) => x.body.message_effect_id), "второй раз салюта нет");
  console.log("✓ вода: кнопки, текст, дневник, Mini App, салют на норме");
}

// 11. Штрихкод и упаковка
{
  assert.equal(_test.cleanBarcode("4607001771234"), "4607001771234");
  assert.equal(_test.cleanBarcode("4607001771235"), null, "неверная контрольная цифра");
  assert.equal(_test.cleanBarcode("96385074"), "96385074", "EAN-8");
  s = await msg("4607001771234");
  assert.match(lastText(s), /Йогурт греческий 2% Тестовый — 140 г · <b>92<\/b> ккал/);
  assert.match(lastText(s), /Нашёл по штрихкоду/);
  assert.doesNotMatch(lastText(s), /💡 📦/);
  const calls = offCalls;
  await msg("4607001771234");
  assert.equal(offCalls, calls, "второй раз берём из кэша");
  s = await msg("4600000000008");
  assert.match(lastText(s), /Не нашёл штрихкод/);
  s = await msg("4607001771235");
  assert.match(lastText(s), /цифры не сходятся/);
  // Фото упаковки без этикетки, но со штрихкодом: КБЖУ из базы
  geminiReply = { is_food: true, title: "Йогурт", comment: "", is_package: true, label_found: false, barcode: "4607001771234",
    items: [{ name: "Йогурт", grams: 120, kcal_100: 90, protein_100: 3, fat_100: 3, carbs_100: 12 }] };
  s = await call({ message: { message_id: 3, from, chat, photo: [{ file_id: "p", width: 800, height: 800 }] } });
  assert.match(lastText(s), /Йогурт греческий 2% Тестовый — 140 г · <b>92<\/b> ккал/);
  // Фото этикетки: КБЖУ как на этикетке
  geminiReply = { is_food: true, title: "Батончик", comment: "", is_package: true, label_found: true, barcode: "",
    items: [{ name: "Протеиновый батончик", grams: 60, kcal_100: 350, protein_100: 33, fat_100: 10, carbs_100: 30 }] };
  s = await call({ message: { message_id: 4, from, chat, photo: [{ file_id: "p", width: 800, height: 800 }] } });
  assert.match(lastText(s), /Протеиновый батончик — 60 г · <b>210<\/b> ккал/);
  assert.match(lastText(s), /КБЖУ взяты с этикетки/);
  console.log("✓ штрихкод, кэш, фото упаковки и этикетки");
}

// Иконки в цитатах не приняты — отправляем с иконками, но без цитат, и запоминаем ошибку
{
  // Меню бота без цитат — уходят с первой попытки
  rejectQuote = true;
  s = await msg("/help");
  assert.equal(s.filter((x) => x.method === "sendMessage").length, 1);
  // Цитаты остались в статистике владельца
  env.ADMIN_ID = "42";
  s = await msg("/stats");
  delete env.ADMIN_ID;
  const sends = s.filter((x) => x.method === "sendMessage");
  rejectQuote = false;
  assert.equal(sends.length, 2);
  assert.ok(!sends[1].body.text.includes("<blockquote>") && sends[1].body.text.includes("<tg-emoji"));
  s = await msg("/emojierr");
  assert.match(lastText(s), /только для владельца/, "без ADMIN_ID закрыто");
  env.ADMIN_ID = "42";
  s = await msg("/emojierr");
  delete env.ADMIN_ID;
  assert.match(lastText(s), /test reject/);
  console.log("✓ иконки: запасной вариант без цитат и /emojierr");
}

// Серии, достижения и ИИ-разбор недели (отдельный пользователь)
{
  const from2 = { id: 77, first_name: "Аня" }, chat2 = { id: 77, type: "private" };
  const m2 = (text) => call({ message: { message_id: 1, from: from2, chat: chat2, text } });
  const t0 = new Date(Date.now() + 180 * 60000).toISOString().slice(0, 10);
  const sh = (n) => { const d = new Date(t0 + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const u2 = { id: 77, name: "Аня", sex: "f", age: 20, height: 165, weight: 55, activity: "1.375", goal: "keep", tz: 180, targets: { kcal: 1900, p: 99, f: 50, c: 260 } };
  await env.DB.put("u:77", JSON.stringify(u2));
  const day = (k) => ({ meals: [{ id: "m" + k, time: "12:00", title: "Обед", source: "photo", items: [{ name: "Еда", grams: 100, kcal_100: k, protein_100: 10, fat_100: 5, carbs_100: 20 }] }] });
  await env.DB.put("d:77:" + sh(-2), JSON.stringify(day(1800)));
  await env.DB.put("d:77:" + sh(-1), JSON.stringify(day(1700)));
  s = await m2("4607001771234");
  const aw = s.filter((x) => /^🏆 <b>Нов/.test(x.body.text || ""));
  assert.equal(aw.length, 1, "одно поздравление");
  assert.match(aw[0].body.text, /Первый шаг/);
  assert.match(aw[0].body.text, /Разгон/, "3 дня подряд");
  assert.match(aw[0].body.text, /Сканер/);
  assert.match(aw[0].body.text, /Точно в цель/);
  assert.equal(aw[0].body.message_effect_id, "5046509860389126442");
  let uu = await env.DB.get("u:77", "json");
  assert.equal(uu.streak.n, 3);
  assert.equal(uu.st.meals, 3);
  s = await m2("4607001771234");
  assert.ok(!s.some((x) => /^🏆 <b>Нов/.test(x.body.text || "")), "повторно не поздравляем");
  uu = await env.DB.get("u:77", "json");
  assert.equal(uu.st.meals, 4);
  assert.equal(uu.streak.n, 3);
  s = await m2("/awards");
  assert.match(lastText(s), /Достижения<\/b> · 4 из 13/);
  assert.match(lastText(s), /Серия: <b>3<\/b> дня подряд/);
  assert.match(lastText(s), /🔒 Фотограф · 10 записей еды · <i>4\/10<\/i>|Ближайшие/);
  s = await m2("/today");
  assert.match(lastText(s), /Серия: <b>3<\/b> дня подряд/);
  // ИИ-разбор
  geminiReply = { score: 8, summary: "Хорошая неделя.", good: ["Есть завтраки"], improve: ["Мало овощей"], tips: ["Добавь салат", "Пей воду", "Ешь рыбу"] };
  geminiCalls = [];
  s = await m2("/analysis");
  const an = lastText(s);
  assert.match(an, /Разбор недели/);
  assert.match(an, /Оценка: <b>8<\/b> из 10/);
  assert.match(an, /1️⃣ Добавь салат/);
  assert.ok(geminiCalls.at(-1).body.contents[0].parts[0].text.includes("Обед"));
  const calls = geminiCalls.length;
  await m2("/analysis");
  assert.equal(geminiCalls.length, calls, "разбор берётся из кэша");
  // Воскресная рассылка
  sent.length = 0;
  await worker.scheduled({ cron: "0 17 * * SUN" }, env, ctx);
  await Promise.all(pending.splice(0));
  assert.ok(sent.some((x) => x.body.chat_id === 77 && /Разбор недели/.test(x.body.text || "")), "разбор пришёл по расписанию");
  const off = sent.find((x) => x.body.chat_id === 77).body.reply_markup.inline_keyboard.flat().find((b) => b.callback_data === "an_off");
  assert.ok(off);
  await call({ callback_query: { id: "q", from: from2, data: "an_off", message: { message_id: 5, chat: chat2 } } });
  assert.equal((await env.DB.get("u:77", "json")).weekly, false);
  console.log("✓ серия, достижения, ИИ-разбор и воскресная рассылка");
}

// Напоминания о воде
{
  s = await msg("/remind");
  assert.match(lastText(s), /Напоминания о воде[\s\S]*выключены/);
  const kb = s.find((x) => x.method === "sendMessage").body.reply_markup.inline_keyboard[0].map((b) => b.callback_data);
  assert.deepEqual(kb, ["wr|every|30", "wr|every|60", "wr|every|90", "wr|every|120"]);
  s = await cb("wr|every|90");
  assert.match(lastText(s), /Каждые <b>1,5 ч<\/b>/);
  assert.match(lastText(s), /С <b>08:00<\/b>[\s\S]*До <b>22:00<\/b>/);
  s = await cb("wr|pick|from");
  assert.match(lastText(s), /Когда начинается твой день/);
  s = await cb("wr|from|7");
  s = await cb("wr|to|23");
  let w = (await env.DB.get("u:42", "json")).wr;
  assert.deepEqual([w.every, w.from, w.to], [90, 7, 23]);
  assert.deepEqual(JSON.parse(await env.DB.get("wr:ids")), [42]);
  const base = w.last;
  // Через 1,5 часа днём (13:00 по Москве) — напоминание, сразу же повторно — нет
  const day13 = Date.UTC(2026, 9, 5, 10, 0);
  w.last = day13 - 91 * 60000;
  const u42 = await env.DB.get("u:42", "json"); u42.wr = w; await env.DB.put("u:42", JSON.stringify(u42));
  sent.length = 0;
  assert.equal(await _test.waterTick(env, day13), 1);
  assert.match(sent.find((x) => x.method === "sendMessage").body.text, /Время попить воды/);
  assert.equal(await _test.waterTick(env, day13 + 30 * 60000), 0, "рано");
  assert.equal(await _test.waterTick(env, day13 + 90 * 60000), 1, "через 1,5 часа снова");
  // Ночью (02:00 по Москве) — молчим
  const night = Date.UTC(2026, 9, 5, 23, 0);
  assert.equal(await _test.waterTick(env, night), 0, "ночью тихо");
  // Норма выполнена — молчим
  await env.DB.put("d:42:2026-10-05", JSON.stringify({ meals: [], water: 5000 }));
  assert.equal(await _test.waterTick(env, day13 + 300 * 60000), 0, "норма выполнена");
  s = await cb("wr|off");
  assert.match(lastText(s), /выключены/);
  assert.deepEqual(JSON.parse(await env.DB.get("wr:ids")), []);
  assert.ok(base > 0);
  console.log("✓ напоминания о воде: частота, начало и конец дня, ночь, норма");
}

// 11a. Что съесть: советы от ИИ и запись варианта
{
  geminiReply = { intro: "Сделай упор на белок", options: [
    { title: "Творог с бананом", why: "много белка", items: [{ name: "Творог 5%", grams: 200, kcal_100: 121, protein_100: 17, fat_100: 5, carbs_100: 1.8 }, { name: "Банан", grams: 120, kcal_100: 89, protein_100: 1.1, fat_100: 0.3, carbs_100: 22.8 }] },
    { title: "Омлет", why: "быстро", items: [{ name: "Омлет", grams: 180, kcal_100: 154, protein_100: 10, fat_100: 12, carbs_100: 1 }] },
    { title: "Кефир", why: "лёгкий перекус", items: [{ name: "Кефир 1%", grams: 250, kcal_100: 40, protein_100: 3, fat_100: 1, carbs_100: 4 }] }] };
  let a = await msg("/advice");
  let t = lastText(a);
  assert.match(t, /🥗(<\/tg-emoji>)? <b>Что съесть<\/b>/);
  assert.match(t, /<b>Творог с бананом<\/b> · 349 ккал/);
  assert.match(t, /Творог 5% 200 г, Банан 120 г/);
  assert.ok(geminiCalls.at(-1).body.contents[0].parts[0].text.includes("Осталось:"));
  const kb = a.at(-1).body.reply_markup.inline_keyboard;
  assert.equal(kb[0].length, 3);
  assert.equal(kb[0][0].callback_data, "adv|0");
  a = await cb("adv|0");
  assert.match(lastText(a), /Творог с бананом/);
  const advMeal = [...env.DB.m.entries()].filter(([k]) => k.startsWith("d:42:")).flatMap(([, v]) => JSON.parse(v).meals).find((m) => m.source === "advice");
  assert.equal(advMeal.title, "Творог с бананом");
  assert.equal(advMeal.items.length, 2);
  a = await cb("adv|1");
  assert.equal(a.find((x) => x.method === "answerCallbackQuery").body.text, "Варианты устарели, нажми «Что съесть» ещё раз");
  assert.match(_test.weekTip({ goal: "gain" }, 1000, 2500), /Не хватает в среднем 1500 ккал/);
  console.log("✓ что съесть: советы и запись варианта");
}

// 11b. Метки источников и /stats
{
  assert.equal(_test.startSource("/start habr"), "habr");
  assert.equal(_test.startSource("/start"), "direct");
  assert.equal(_test.startSource("/start a b"), "direct");
  assert.equal((await env.DB.get("u:42", "json")).src, "direct");
  const other = { id: 88, first_name: "Оля" };
  await call({ message: { message_id: 1, from: other, chat: { id: 88, type: "private" }, text: "/start VC_ru" } });
  assert.equal((await env.DB.get("u:88", "json")).src, "vc_ru");
  // Повторный /start с другой меткой не перезаписывает источник
  await call({ message: { message_id: 1, from: other, chat: { id: 88, type: "private" }, text: "/start habr" } });
  assert.equal((await env.DB.get("u:88", "json")).src, "vc_ru");
  let st = await msg("/stats");
  assert.match(lastText(st), /Твой Telegram ID: <code>42<\/code>/);
  env.ADMIN_ID = "42";
  st = await msg("/stats");
  const t = lastText(st);
  const total = (await env.DB.list({ prefix: "u:" })).keys.length;
  assert.match(t, new RegExp(`Всего: <b>${total}</b>`));
  assert.match(t, /<b>direct<\/b> — \d+ · анкета \d+% · еда \d+%/);
  assert.match(t, /<b>vc_ru<\/b> — 1 · анкета 0% · еда 0%/);
  st = await call({ message: { message_id: 1, from: other, chat: { id: 88, type: "private" }, text: "/stats" } });
  assert.match(lastText(st), /только для владельца/);
  delete env.ADMIN_ID;

  // Расчёт на известных данных: двое пришли 20 дней назад из habr, один сегодня
  const now = Date.parse("2026-10-03T09:00:00Z");
  const users = [
    { id: 1, src: "habr", targets: {}, created: now - 20 * 864e5 },
    { id: 2, src: "habr", created: now - 20 * 864e5 },
    { id: 3, created: now },
  ];
  const keys = ["d:1:2026-09-13", "d:1:2026-09-14", "d:1:2026-09-21", "d:3:2026-10-03", "d:3:bad"];
  const s = _test.statsText(users, keys, 30, now);
  assert.match(s, /Всего: <b>3<\/b> · за сутки \+1/);
  assert.match(s, /Активны сегодня: <b>1<\/b> · 7 дн\.: <b>1<\/b> · 30 дн\.: <b>2<\/b>/);
  assert.match(s, /1 день: <b>50%<\/b> \(1 из 2\)/);
  assert.match(s, /7 дней: <b>50%<\/b> \(1 из 2\)/);
  assert.match(s, /30 дней: пока рано/);
  assert.match(s, /<b>habr<\/b> — 2 · анкета 50% · еда 50% · неделя 50%/);
  assert.match(s, /07\.09 +2 +50% +0% +· +·/);
  assert.equal(_test.spark([0, 1, 2]), "▁▅█");
  console.log("✓ /stats: метки источников, рост, удержание, когорты");
}

// 12. Набор иконок: эмодзи с полом и оттенком кожи тоже находятся
{
  assert.equal(_test.baseEmoji("🏃‍♂️"), "🏃");
  assert.equal(_test.baseEmoji("💪🏻"), "💪");
  s = await msg("/makeemoji");
  assert.match(lastText(s), /только для владельца/);
  assert.ok(!s.some((x) => x.method === "deleteStickerSet"), "чужой не трогает наборы");
  env.ADMIN_ID = "42";
  s = await msg("/makeemoji");
  const map = JSON.parse(await env.DB.get("cfg:emoji"));
  assert.equal(map["🏃"], "9010", "бег");
  assert.equal(map["💪"], "9011", "бицепс");
  assert.equal(map["🚶"], "9009");
  assert.equal(map["💧"], "9013", "вода — стакан");
  assert.equal(map["🧈"], "9002", "жиры — капля");
  assert.equal(map["📊"], "9037", "цветная иконка «Сегодня»");
  assert.equal(map["👤"], "8000", "монохромный профиль");
  assert.equal(map["⚖"], "9005", "цветные весы из FITTER ICONS");
  assert.equal(map["🎯"], "9025", "цветная мишень");
  assert.equal(map["💊"], "9022");
  assert.equal(map["🟩"], "9028");
  assert.equal(map["↩"], "8015");
  assert.equal(map["📅"], "9032", "цветной календарь");
  assert.equal(map["🔒"], "9033", "замок в достижениях");
  assert.equal(Object.keys(map).length, 38 + 17);
  assert.equal(map["1️⃣"], "9018");
  assert.ok(!s.some((x) => x.method === "addStickerToSet"), "ничего не добавляем заново");
  const rp = s.filter((x) => x.method === "replaceStickerInSet");
  assert.equal(rp.length, 1, "перерисованные весы заменяются");
  assert.equal(rp[0].body.old_sticker, "f5");
  assert.match(rp[0].body.sticker.sticker, /pack\/scales\.png\?v=2$/);
  s = await msg("/makeemoji");
  assert.ok(!s.some((x) => x.method === "replaceStickerInSet"), "второй раз не заменяем");
  // Кастомные эмодзи от обычного пользователя не перехватываются служебной командой
  const ent = [{ type: "custom_emoji", offset: 0, length: 2, custom_emoji_id: "1" }];
  s = await call({ message: { message_id: 1, from, chat, text: "🍏", entities: ent } });
  assert.match(lastText(s), /Номера иконок/);
  const other2 = { id: 77, first_name: "Гость" };
  s = await call({ message: { message_id: 1, from: other2, chat: { id: 77, type: "private" }, text: "🍏", entities: ent } });
  assert.doesNotMatch(lastText(s) || "", /Номера иконок/);
  s = await call({ message: { message_id: 1, from: other2, chat: { id: 77, type: "private" }, text: "/makeemoji" } });
  assert.match(lastText(s), /только для владельца/);
  delete env.ADMIN_ID;
  s = await msg("/profile");
  const prof = s.find((x) => x.method === "sendMessage").body.text;
  assert.match(prof, /<tg-emoji emoji-id="9010">🏃<\/tg-emoji> 3–5 тренировок/);
  assert.match(prof, /<tg-emoji emoji-id="9011">💪<\/tg-emoji> Набрать массу/);
  s = await msg("/help");
  assert.match(s.find((x) => x.method === "sendMessage").body.text, /<tg-emoji emoji-id="9018">1️⃣<\/tg-emoji> Сфотографируй/);
  console.log("✓ FITTER ICONS: бег, бицепс и цифры");
}

// 13. Картинка файлом больше 5 МБ не уходит в нейросеть
{
  const before = sent.length;
  s = await call({ message: { message_id: 5, from, chat, document: { file_id: "big", mime_type: "image/jpeg", file_size: 6 * 1024 * 1024 } } });
  assert.match(lastText(s), /слишком большой/);
  assert.ok(!s.some((x) => x.method === "getFile"));
  console.log("✓ лимит размера картинки");
}

// 14. /delete: все данные пользователя стираются
{
  const del = { id: 55, first_name: "Удалю" };
  const dchat = { id: 55, type: "private" };
  await env.DB.put("u:55", JSON.stringify({ id: 55, targets: { kcal: 2000 }, pills: [{ id: "a", name: "Д", times: ["09:00"] }] }));
  await env.DB.put("d:55:2026-10-01", JSON.stringify({ meals: [] }));
  await env.DB.put("w:55", "[]");
  await env.DB.put("an:55:2026-10-01", "{}");
  await env.DB.put("d:555:2026-10-01", JSON.stringify({ meals: [] }));
  await env.DB.put("wr:ids", JSON.stringify([55, 42]));
  await env.DB.put("pl:ids", JSON.stringify([55]));
  s = await call({ message: { message_id: 1, from: del, chat: dchat, text: "/delete" } });
  assert.match(lastText(s), /Удалить все твои данные/);
  assert.ok(await env.DB.get("u:55"), "без подтверждения ничего не удаляем");
  s = await call({ callback_query: { id: "q", from: del, data: "delno", message: { message_id: 7, chat: dchat } } });
  assert.ok(await env.DB.get("u:55"));
  s = await call({ callback_query: { id: "q", from: del, data: "delall", message: { message_id: 7, chat: dchat } } });
  assert.match(lastText(s), /данные удалены/);
  const left = (await env.DB.list({ prefix: "" })).keys.map((k) => k.name).filter((k) => /^(u|w|adv):55$|^(d|an):55:/.test(k));
  assert.deepEqual(left, []);
  assert.ok(await env.DB.get("d:555:2026-10-01"), "чужие данные на месте");
  assert.deepEqual(JSON.parse(await env.DB.get("wr:ids")), [42]);
  assert.deepEqual(JSON.parse(await env.DB.get("pl:ids")), []);
  s = await call({ message: { message_id: 1, from: { id: 56 }, chat: { id: 56, type: "private" }, text: "/delete" } });
  assert.match(lastText(s), /нет твоих данных/);
  console.log("✓ /delete: удаление всех данных");
}

// 15. Лимит ИИ: параллельные запросы со старым счётчиком из базы не обходят лимит
{
  const lim = { DAILY_AI_LIMIT: "1" };
  const a = { id: 991, tz: 180 }, b = { id: 991, tz: 180 };
  assert.equal(_test.checkAiLimit(lim, a), true);
  assert.equal(_test.checkAiLimit(lim, b), false, "второй запрос с устаревшими данными");
  assert.equal(_test.checkAiLimit(lim, { id: 992, tz: 180 }), true, "другой пользователь не задет");
  console.log("✓ лимит ИИ при параллельных запросах");
}

// 12. Лимит запросов к ИИ
env.DAILY_AI_LIMIT = "1";
s = await msg("что поесть?");
assert.match(lastText(s), /лимит/);
console.log("\nВсе проверки пройдены ✅");
