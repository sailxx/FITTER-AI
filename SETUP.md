# Как запустить Fitter AI бесплатно

Понадобится примерно 20 минут. Программировать не нужно, только копировать и вставлять.

Всё бесплатно:

| Что | Зачем | Цена |
|---|---|---|
| Telegram и @BotFather | сам бот | бесплатно |
| Google AI Studio | ключ к нейросети Gemini, которая смотрит на фото | бесплатно |
| Cloudflare Workers | сервер, на котором работает бот 24/7 | бесплатно, 100 000 запросов в день |
| Cloudflare KV | база данных: анкеты и дневники | бесплатно |

---

## Шаг 1. Создать бота в Telegram

1. Открой в Telegram бота **@BotFather**
2. Отправь `/newbot`
3. Придумай имя, например `Fitter AI`
4. Придумай адрес, он должен заканчиваться на `bot`, например `fitter_ai_vlad_bot`
5. BotFather пришлёт **токен**, он выглядит так: `7123456789:AAH...`
6. Сохрани токен в заметки. Это пароль от бота, никому его не показывай

## Шаг 2. Получить ключ нейросети Gemini

1. Открой https://aistudio.google.com/apikey и войди через Google‑аккаунт
2. Нажми **Create API key**
3. Скопируй ключ, он начинается на `AIza...`, и сохрани в заметки

> Если сайт пишет, что недоступен в твоей стране, ключ нужно получить через VPN.
> Сам бот потом работает без VPN: к нейросети обращается сервер Cloudflare, а не твой телефон.

## Шаг 3. Создать сервер на Cloudflare

1. Зарегистрируйся на https://dash.cloudflare.com/sign-up (бесплатно, карта не нужна)
2. Слева открой **Compute (Workers)** → **Workers & Pages** → **Create** → **Create Worker**
   (кнопка может называться **Start with Hello World!**)
3. Назови его `fitter-ai` и нажми **Deploy**
4. Нажми **Edit code**
5. Удали весь код в редакторе и вставь вместо него весь код из файла [`worker.js`](worker.js)
   (на GitHub открой файл → кнопка **Copy raw file** справа сверху)
6. Нажми **Deploy** справа сверху

## Шаг 4. Подключить базу данных

1. Слева открой **Storage & Databases** → **KV** → **Create** (или **Create instance**)
2. Название: `fitter-db` → **Create**
3. Вернись в свой воркер `fitter-ai` → вкладка **Bindings** (или **Settings → Bindings**) → **Add binding**
4. Выбери **KV namespace**
5. Variable name: **`DB`** (большими буквами, это важно!)
6. KV namespace: `fitter-db` → **Add binding** / **Save**

## Шаг 5. Добавить секретные ключи

В воркере открой **Settings** → **Variables and Secrets** → **Add**. Добавь три штуки, тип **Secret**:

| Variable name | Value |
|---|---|
| `BOT_TOKEN` | токен от BotFather из шага 1 |
| `GEMINI_API_KEY` | ключ Gemini из шага 2 |
| `WEBHOOK_SECRET` | любой пароль из латинских букв и цифр, например `fitter2026secret` |

Нажми **Deploy** / **Save**.

## Шаг 6. Включить бота

1. Найди адрес своего воркера. Он показан на странице воркера, выглядит так:
   `https://fitter-ai.ТВОЁ-ИМЯ.workers.dev`
2. Открой в браузере этот адрес, добавив в конце `/setup?secret=` и свой WEBHOOK_SECRET:
   ```
   https://fitter-ai.ТВОЁ-ИМЯ.workers.dev/setup?secret=fitter2026secret
   ```
3. На странице все пункты должны быть с ✅
4. Открой своего бота в Telegram и нажми **Старт** 🎉

---

## Если что‑то не работает

| Проблема | Что сделать |
|---|---|
| На /setup ❌ «Токен бота неверный» | Проверь BOT_TOKEN: скопируй заново из @BotFather, без пробелов |
| ❌ «База данных KV подключена» | В шаге 4 имя переменной должно быть ровно `DB` |
| ❌ «Gemini не отвечает» с кодом 400 или 403 | Ключ Gemini неверный, создай новый в AI Studio |
| ❌ «Gemini не отвечает» с кодом 429 | Закончился бесплатный лимит, подожди до завтра или создай ключ в другом Google‑аккаунте |
| Бот молчит | Открой /setup ещё раз. В Cloudflare открой воркер → **Logs**, там видны ошибки |
| Дневник (Mini App) не открывается | Иногда в России домен workers.dev работает плохо. Можно подключить свой домен в Cloudflare (Settings → Domains & Routes) и снова открыть /setup на новом адресе |
| Модель Gemini устарела | Добавь переменную `GEMINI_MODEL` с названием новой модели из https://ai.google.dev/gemini-api/docs/models |

## Дополнительные настройки

| Переменная | Что делает | По умолчанию |
|---|---|---|
| `GEMINI_MODEL` | Какую модель Gemini использовать | `gemini-3.5-flash`, если она недоступна, бот сам пробует запасные |
| `DAILY_AI_LIMIT` | Сколько фото и вопросов в день можно одному человеку | `40` |

## Обновить бота

Когда в `worker.js` появится новая версия: Cloudflare → воркер → **Edit code** → вставить новый код → **Deploy**. Данные пользователей не пропадут, они хранятся в базе.

## Для тех, кто умеет в командную строку

```bash
npm test                         # проверка без интернета
npx wrangler kv namespace create fitter-db   # id вставить в wrangler.toml
npx wrangler secret put BOT_TOKEN
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put WEBHOOK_SECRET
npx wrangler deploy
```
