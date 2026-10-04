<div align="center">
  <img src="docs/logo.svg" width="160" height="160" alt="Логотип FITTER">

  <h1>FITTER</h1>

  <p align="center">
    <strong>Считай калории одним фото.</strong>
    <br />
    <em>Telegram-бот и дневник питания с ИИ: быстро, бесплатно и без скачивания приложений.</em>
  </p>

  <p align="center">
    <a href="https://t.me/FitterFoodBot?start=github"><b>Открыть бота</b></a> •
    <a href="#-возможности"><b>Возможности</b></a> •
    <a href="#-как-это-работает"><b>Как работает</b></a> •
    <a href="#-запусти-свою-копию"><b>Запуск</b></a> •
    <a href="#-скриншоты"><b>Скриншоты</b></a> •
    <a href="https://t.me/arkhitkovv"><b>Связь</b></a>
  </p>

  <div align="center">
    <img src="https://img.shields.io/github/package-json/v/sailxx/FITTER-AI?style=for-the-badge&color=c9f36b&labelColor=171916&logo=github&label=version" alt="Версия" />
    <img src="https://img.shields.io/github/stars/sailxx/FITTER-AI?style=for-the-badge&color=c9f36b&labelColor=171916&logo=github" alt="Звёзды" />
    <img src="https://img.shields.io/github/license/sailxx/FITTER-AI?style=for-the-badge&color=c9f36b&labelColor=171916" alt="Лицензия" />
    <img src="https://img.shields.io/badge/Стоимость-0%20₽-c9f36b?style=for-the-badge&labelColor=171916" alt="Бесплатно" />
    <img src="https://img.shields.io/badge/Runtime-Cloudflare_Workers-c9f36b?style=for-the-badge&labelColor=171916&logo=cloudflare&logoColor=F38020" alt="Cloudflare Workers" />
    <img src="https://img.shields.io/badge/AI-Google_Gemini-c9f36b?style=for-the-badge&labelColor=171916&logo=googlegemini&logoColor=4285F4" alt="Google Gemini" />
    <img src="https://img.shields.io/badge/Language-JavaScript-c9f36b?style=for-the-badge&labelColor=171916&logo=javascript&logoColor=F7DF1E" alt="JavaScript" />
    <img src="https://img.shields.io/badge/Dependencies-0-c9f36b?style=for-the-badge&labelColor=171916" alt="Без зависимостей" />
    <a href="https://t.me/FitterFoodBot?start=github"><img src="https://img.shields.io/badge/Telegram-@FitterFoodBot-2CA5E0?style=for-the-badge&logo=telegram&logoColor=white" alt="Telegram" /></a>
  </div>
</div>

<hr />

> [!IMPORTANT]
> **FITTER оценивает калории приблизительно.** Результат по фото зависит от состава и размера порции, а любую запись можно поправить вручную. Бот не заменяет консультацию врача или диетолога.

## 💡 О проекте

**FITTER** не ещё одна таблица продуктов, где нужно взвешивать каждый ингредиент и искать состав вручную. Это бот, который смотрит на твою тарелку: нейросеть находит продукты, оценивает вес, считает калории, белки, жиры и углеводы и сама ведёт дневник.

Он живёт прямо в Telegram, поэтому начать можно за секунду: без установки, регистрации и подписок. А если захочется полного контроля, бота можно запустить у себя бесплатно за 20 минут.

<div align="center">

| 📸 Фото вместо таблиц | ✏️ Всегда можно поправить | 📅 Дневник в Mini App | 💸 Бесплатно |
|:---:|:---:|:---:|:---:|
| ИИ распознаёт еду и порцию за пару секунд | Исправь продукт или вес, КБЖУ пересчитаются | Календарь, кольцо калорий, вода и вес | Работает на бесплатных тарифах |

</div>

---

## 📸 Скриншоты

<div align="center" id="-скриншоты">
  <img src="docs/screens.webp" width="100%" alt="Чат с ботом FITTER и дневник питания в Telegram Mini App">
</div>

---

## ✨ Возможности

<div align="center">
<table>
  <tr>
    <td width="50%" valign="top">
      <div align="left">
        <h3>📷 Запись еды</h3>
        <ul>
          <li>Распознавание блюд по фото: продукты, вес и КБЖУ на 100 г</li>
          <li>Подпись к фото работает как подсказка: «это 200 г риса»</li>
          <li>Запись текстом: «съел 2 яйца и тост»</li>
          <li>Правка названия и граммов, нейросеть пересчитывает КБЖУ</li>
          <li>Удаление записей в один клик</li>
        </ul>
      </div>
    </td>
    <td width="50%" valign="top">
      <div align="left">
        <h3>🏷️ Упаковки</h3>
        <ul>
          <li>Фото этикетки: бот перепишет КБЖУ точно с неё</li>
          <li>Чтение штрихкода и поиск в базе <a href="https://world.openfoodfacts.org">Open Food Facts</a></li>
          <li>Можно просто прислать цифры штрихкода</li>
        </ul>
      </div>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <div align="left">
        <h3>🎯 Цели и прогресс</h3>
        <ul>
          <li>Анкета из 6 вопросов и норма по формуле Миффлина — Сан-Жеора</li>
          <li>Цели: похудеть, держать вес или набрать массу</li>
          <li>Итоги дня и недели: съедено, осталось, где перебор</li>
          <li>Учёт веса с графиком и автопересчётом нормы</li>
        </ul>
      </div>
    </td>
    <td width="50%" valign="top">
      <div align="left">
        <h3>💧 Вода и таблетки</h3>
        <ul>
          <li>Норма воды 30 мл на 1 кг веса, кнопки +250 и +500 мл</li>
          <li>Напоминания каждые 30 минут — 2 часа, ночью тишина</li>
          <li>Витамины и лекарства по времени приёма</li>
          <li>Кнопки «Принял», «Через 30 мин» и «Пропустить»</li>
        </ul>
      </div>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <div align="left">
        <h3>🧠 ИИ-ассистент</h3>
        <ul>
          <li>«Что съесть»: 3 варианта под остаток калорий и белка</li>
          <li>Любой вариант попадает в дневник одной кнопкой</li>
          <li>Разбор недели с оценкой, похвалой и 3 советами</li>
          <li>Ответы на вопросы о питании с учётом твоей нормы</li>
        </ul>
      </div>
    </td>
    <td width="50%" valign="top">
      <div align="left">
        <h3>🏆 Привычки</h3>
        <ul>
          <li>Серия дней подряд, которую жалко прерывать</li>
          <li>13 достижений: серии, дни в норме, вода, этикетки, вес</li>
          <li>Анимации-праздники при выполнении нормы</li>
        </ul>
      </div>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <div align="left">
        <h3>📱 Дневник (Mini App)</h3>
        <ul>
          <li>Кольцо калорий, календарь недели, карточки БЖУ</li>
          <li>Стакан воды с волной и кнопками ±250 мл</li>
          <li>Запись еды текстом и дописывание за прошлые дни</li>
          <li>Светлая и тёмная тема Telegram</li>
        </ul>
      </div>
    </td>
    <td width="50%" valign="top">
      <div align="left">
        <h3>🎨 Дизайн и надёжность</h3>
        <ul>
          <li>Собственный набор иконок <a href="icons/">FITTER Icons</a></li>
          <li>Автопереход на запасную модель Gemini при сбое</li>
          <li>Таймаут ИИ 24 секунды: понятный ответ вместо вечной загрузки</li>
          <li>Дневной лимит запросов защищает бесплатную квоту</li>
        </ul>
      </div>
    </td>
  </tr>
</table>
</div>

---

## 🤖 Команды

<div align="center">

| Команда | Что делает |
|:---|:---|
| `/start` | Знакомство и анкета |
| `/today` · `/week` | Итоги дня и последние 7 дней |
| `/water` · `/remind` | Вода за сегодня и напоминания |
| `/advice` | Что съесть: 3 варианта от ИИ |
| `/pills` | Таблетки: отметить, добавить, удалить |
| `/weight 72.5` | Записать вес |
| `/profile` | Профиль и дневная норма |
| `/awards` · `/analysis` | Достижения и ИИ-разбор недели |
| `/app` | Открыть дневник |
| `/reset` · `/help` | Пройти анкету заново и справка |
| `/delete` | Удалить все свои данные |

</div>

---

## 🧠 Как это работает

<div align="center">

```mermaid
sequenceDiagram
    autonumber
    actor U as Ты
    participant T as Telegram
    participant W as FITTER (Cloudflare Worker)
    participant G as Google Gemini
    participant D as Cloudflare KV

    U->>T: Фото еды
    T->>W: Webhook
    W->>G: Фото + инструкция
    G-->>W: Продукты, вес, КБЖУ (JSON)
    W->>D: Сохранить приём пищи
    W->>T: Карточка с КБЖУ и кнопками ✏️
    T-->>U: Ответ за ~8 секунд
```

</div>

| Слой | Технология | Почему |
|:---|:---|:---|
| Интерфейс | Telegram Bot API + Mini App | У всех уже есть Telegram, ничего не нужно скачивать |
| Сервер | Cloudflare Workers | Бесплатно, 24/7, без настройки серверов |
| ИИ | Google Gemini (Flash / Flash-Lite) | Понимает фото, ответ в строгом JSON |
| База | Cloudflare KV | Бесплатно и встроена в Workers |
| Деплой | GitHub → Cloudflare Builds | Каждый коммит сам попадает на сервер |

Весь сервер — один файл [`worker.js`](worker.js) без единой зависимости.

---

## 🚀 Запусти свою копию

Бесплатно, примерно за 20 минут и без программирования.

> [!TIP]
> Пошаговая инструкция для новичков с каждым кликом: **[SETUP.md](SETUP.md)**.

<details>
<summary><b>Для разработчиков</b></summary>

```bash
git clone https://github.com/sailxx/FITTER-AI.git
cd FITTER-AI
npm test                                      # тесты без интернета
npx wrangler kv namespace create fitter-db    # id вставить в wrangler.toml
npx wrangler secret put BOT_TOKEN
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put WEBHOOK_SECRET
npx wrangler deploy
```

Затем открой `https://<твой-воркер>.workers.dev/setup` и введи `WEBHOOK_SECRET` (или `SETUP_SECRET`): все пункты должны быть с ✅.

</details>

<details>
<summary><b>Переменные окружения</b></summary>

| Переменная | Обязательна | Описание |
|:---|:---:|:---|
| `BOT_TOKEN` | ✅ | Токен бота от @BotFather |
| `GEMINI_API_KEY` | ✅ | Ключ Google AI Studio |
| `WEBHOOK_SECRET` | ✅ | Пароль для webhook и страницы `/setup` |
| `DB` | ✅ | Привязка Cloudflare KV |
| `GEMINI_MODEL` | | Модель Gemini, по умолчанию `gemini-3.5-flash` с запасными |
| `DAILY_AI_LIMIT` | | Запросов к ИИ в день на человека, по умолчанию `40` |
| `SETUP_SECRET` | | Отдельный пароль для страницы `/setup`, по умолчанию подходит `WEBHOOK_SECRET` |
| `ADMIN_ID` | | Telegram ID владельца для `/stats` и служебных команд иконок; без него они закрыты для всех |
| `CUSTOM_EMOJI` | | `off` — выключить свои иконки |

</details>

<details>
<summary><b>API дневника</b></summary>

Все запросы подписаны данными Telegram (`X-Init-Data`), сервер проверяет подпись HMAC-SHA256.

| Метод | Путь | Что делает |
|:---|:---|:---|
| `GET` | `/api/day?date=YYYY-MM-DD` | День, неделя, норма, вес |
| `POST` | `/api/item/edit` | Изменить граммы продукта |
| `POST` | `/api/item/rename` | Переименовать продукт и пересчитать КБЖУ |
| `POST` | `/api/item/delete` | Удалить продукт |
| `POST` | `/api/meal/add` | Записать еду текстом |
| `POST` | `/api/meal/delete` | Удалить приём пищи |
| `POST` | `/api/water` | Добавить или убрать 250 мл воды |
| `POST` | `/api/pill/add` | Добавить препарат и время приёма |
| `POST` | `/api/pill/mark` | Отметить приём |
| `POST` | `/api/pill/delete` | Удалить препарат и напоминания |

</details>

<details>
<summary><b>Структура проекта</b></summary>

```
FITTER-AI/
├── worker.js          # весь сервер: бот, ИИ, база, API и Mini App
├── test/test.js       # автотесты: Telegram, Gemini и база подменены
├── icons/             # FITTER Icons: PNG 100×100 и SVG
├── docs/              # лендинг, политика конфиденциальности, картинки
├── SETUP.md           # инструкция по запуску
├── CHANGELOG.md       # история версий
└── wrangler.toml      # настройки Cloudflare
```

</details>

---

## 🔒 Безопасность и приватность

- Webhook принимает запросы только с секретным заголовком Telegram.
- Дневник проверяет криптографическую подпись Telegram: чужие данные открыть нельзя.
- Ключи лежат в секретах Cloudflare, а не в коде.
- Фото **не сохраняются**: они уходят в Gemini только для распознавания.

Подробнее: [политика конфиденциальности](https://sailxx.github.io/FITTER-AI/privacy.html).

---

## 🗺 Дорожная карта

- [x] **v1.0** Бот на Cloudflare, анкета, норма, фото, дневник, учёт веса
- [x] **v1.x** Точность, свои иконки, вода, этикетки и штрихкоды, новый дневник
- [x] **v1.6–1.7** Серии, достижения, ИИ-разбор недели, напоминания о воде
- [x] **v2.0** Ассистент «Что съесть» и новая «Неделя»
- [x] **v2.1** Таблетки и витамины с напоминаниями
- [x] **v2.2–2.4** Аналитика, светлая и тёмная тема, цветные иконки
- [x] **v2.5** Таблетки в меню бота, вес в профиле и дневнике
- [x] **v2.5.1** Безопасность: команда /delete, строже служебные команды и /setup
- [x] **v2.5.2** Дневник сам подтягивает отметки таблеток и записи из чата
- [x] **v2.5.3** Защита дневника (CSP) и честный лимит ИИ
- [ ] **v3.0** Продукт: подписка и отдельное приложение

Полная история версий — в [CHANGELOG.md](CHANGELOG.md).

---

## ❓ Вопросы и идеи

Нашёл ошибку или хочешь предложить фичу? Открой [issue](https://github.com/sailxx/FITTER-AI/issues/new) или напиши автору.

<div align="center">

[![Бот](https://img.shields.io/badge/Telegram-@FitterFoodBot-2CA5E0?style=for-the-badge&logo=telegram&logoColor=white)](https://t.me/FitterFoodBot?start=github)
[![Автор](https://img.shields.io/badge/Автор-@arkhitkovv-c9f36b?style=for-the-badge&labelColor=171916&logo=telegram&logoColor=white)](https://t.me/arkhitkovv)

</div>

---

## ⚖️ Лицензия

FITTER распространяется по лицензии **MIT**, см. файл [LICENSE](LICENSE). Проект независимый и не связан с Telegram, Google или Cloudflare. Названия принадлежат их владельцам.

<div align="center">
  <br />
  <img src="docs/logo.svg" width="48" height="48" alt="">
  <br />
  <sub><b>FITTER</b> · Одно фото. Полный контроль.</sub>
  <br />
  <sub>Сделал <a href="https://t.me/arkhitkovv">Владислав</a>. Если проект пригодился, поставь ⭐ репозиторию.</sub>
</div>
