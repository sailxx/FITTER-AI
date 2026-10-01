// Проверка бота без интернета: подменяем Telegram, Gemini и базу данных.
// Запуск: node test/test.js
import assert from "node:assert/strict";
import worker, { _test } from "../worker.js";

const TOKEN = "123:TEST";
const sent = [];
let geminiReply = null;
let geminiCalls = [];

class FakeKV {
  constructor() { this.m = new Map(); }
  async get(k, type) { const v = this.m.get(k); if (v == null) return null; return type === "json" ? JSON.parse(v) : v; }
  async put(k, v) { this.m.set(k, v); }
  async delete(k) { this.m.delete(k); }
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
const lastText = (s) => s.filter((x) => x.method === "sendMessage" || x.method === "editMessageText").map((x) => x.body.text).pop();

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
assert.match(card.body.text, /Гречка — 150 г — 165 ккал/);
assert.match(card.body.text, /Итого: 363 ккал/);
const kb = card.body.reply_markup.inline_keyboard;
const editBtn = kb[0][0].callback_data;
assert.ok(Buffer.byteLength(editBtn) <= 64);
console.log("✓ фото распознано:\n" + card.body.text + "\n");

// 4. Исправление веса
s = await cb(editBtn);
assert.match(lastText(s), /Сколько граммов/);
s = await msg("200");
assert.match(lastText(s), /150 г → <b>200 г<\/b>/);
const date = editBtn.split("|")[1];
let day = await env.DB.get(`d:42:${date}`, "json");
assert.equal(day.meals[0].items[0].grams, 200);
console.log("✓ вес исправлен");

// 5. Текст: запись еды и вопрос
geminiReply = { intent: "food_log", answer: "Записал!", title: "Банан", items: [{ name: "Банан", grams: 120, kcal_100: 89, protein_100: 1.1, fat_100: 0.3, carbs_100: 22.8 }] };
s = await msg("съел банан");
assert.match(lastText(s), /Банан — 120 г — 107 ккал/);
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
assert.match(lastText(s), /Последние 7 дней/);
s = await msg("👤 Профиль");
assert.match(lastText(s), /Цель: 💪 Набрать массу/);
s = await msg("/weight 66.2");
assert.match(lastText(s), /66.2 кг/);
s = await msg("⚖️ Вес");
assert.match(lastText(s), /Сколько ты сейчас весишь/);
s = await msg("66");
assert.match(lastText(s), /Записал: <b>66 кг/);
console.log("✓ сегодня, неделя, профиль, вес");

// 8. Mini App API с настоящей подписью Telegram
async function signInit(user, token) {
  const p = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), query_id: "AA", user: JSON.stringify(user) });
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
r = await apiCall("/api/day");
assert.equal(r.status, 200);
let d = await r.json();
assert.equal(d.meals.length, 2);
assert.equal(d.week.length, 7);
assert.ok(d.week.some((w) => w.date === d.date && w.meals === 2));
r = await apiCall("/api/item/edit", "POST", { date: d.date, mealId: d.meals[0].id, idx: 1, grams: 100 });
assert.equal(r.status, 200);
r = await apiCall("/api/meal/delete", "POST", { date: d.date, mealId: d.meals[1].id });
assert.equal(r.status, 200);
d = await (await apiCall("/api/day?date=" + d.date)).json();
assert.equal(d.meals.length, 1);
assert.equal(d.meals[0].items[1].grams, 100);
console.log("✓ Mini App API, итого за день:", Math.round(d.totals.kcal), "ккал");

// 9. Страницы
r = await worker.fetch(new Request(base + "/app"), env, ctx);
const html = await r.text();
assert.match(html, /telegram-web-app\.js/);
// Проверяем, что JS внутри Mini App без синтаксических ошибок
const script = html.split("<script>")[1].split("</script>")[0];
new Function(script);
r = await worker.fetch(new Request(base + "/setup?secret=s3cret"), env, ctx);
const setupHtml = await r.text();
assert.match(setupHtml, /Всё готово/);
assert.equal(sent.find((x) => x.method === "setWebhook").body.url, base + "/webhook");
console.log("✓ /app и /setup");

// 10. Лимит запросов к ИИ
env.DAILY_AI_LIMIT = "1";
s = await msg("что поесть?");
assert.match(lastText(s), /лимит/);
console.log("\nВсе проверки пройдены ✅");
