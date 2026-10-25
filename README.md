<div align="center">

[Русский](README.ru.md) · **English** · [Español](README.es.md) · [Português](README.pt.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Italiano](README.it.md) · [Türkçe](README.tr.md) · [Українська](README.uk.md) · [Polski](README.pl.md)

<br>

<img src="assets/readme/hero-en.svg" width="100%" alt="FITTER — Snap your meal. AI counts the calories. An app with widgets: calories and macros from a photo. Also available as a Telegram bot.">

<a href="https://github.com/sailxx/FITTER-AI/releases/latest/download/Fitter.apk"><img src="assets/readme/cta-app.svg" height="52" alt="Download Fitter.apk"></a>&nbsp;&nbsp;<a href="https://t.me/FitterFoodBot?start=github"><img src="assets/readme/cta-bot.svg" height="52" alt="Open @FitterFoodBot in Telegram"></a>&nbsp;&nbsp;<a href="https://sailxx.github.io/FITTER-AI/"><img src="assets/readme/cta-site.svg" height="52" alt="FITTER website"></a>

<sub><a href="#-features">Features</a> · <a href="#-how-it-works">How it works</a> · <a href="#-screenshots">Screenshots</a> · <a href="https://t.me/arkhitkovv">Contact</a></sub>

</div>

<hr />

> [!IMPORTANT]
> **FITTER estimates calories approximately.** Photo results depend on the ingredients and portion size, and any entry can be corrected by hand. The bot does not replace advice from a doctor or dietitian.

> [!NOTE]
> The bot currently speaks Russian. This page is a translation of the [Russian README](README.md).

<p align="center"><img src="assets/readme/about-en.svg" width="100%" alt="About FITTER"></p>

---

## 📸 Screenshots

<div align="center" id="-screenshots">
  <img src="assets/readme/screens-en.svg" width="100%" alt="Fitter for Android: the Today screen in light and dark themes, water, pills and meals">
</div>

---

## ✨ Features

<p align="center"><img src="assets/readme/features-en.svg" width="100%" alt="FITTER"></p>

---

## 🤖 Commands

<div align="center">

| Command | What it does |
|:---|:---|
| `/start` | Introduction and survey |
| `/today` · `/week` | Today’s summary and the last 7 days |
| `/water` · `/remind` | Today’s water and reminders |
| `/advice` | What to eat: 3 AI suggestions |
| `/pills` | Pills: mark, add, delete |
| `/weight 72.5` | Log your weight |
| `/profile` | Profile and daily target |
| `/awards` · `/analysis` | Achievements and AI weekly review |
| `/app` | Open the diary |
| `/reset` · `/help` | Retake the survey and help |
| `/delete` | Delete all your data |

</div>

---

## 🧠 How it works

<div align="center">

```mermaid
sequenceDiagram
    autonumber
    actor U as You
    participant T as Telegram
    participant W as FITTER (Cloudflare Worker)
    participant G as Google Gemini
    participant D as Cloudflare KV

    U->>T: Photo of a meal
    T->>W: Webhook
    W->>G: Photo + instructions
    G-->>W: Foods, grams, macros (JSON)
    W->>D: Save the meal
    W->>T: Card with macros and ✏️ buttons
    T-->>U: Reply in ~8 seconds
```

</div>

| Layer | Technology | Why |
|:---|:---|:---|
| Interface | Telegram Bot API + Mini App | Everyone already has Telegram, nothing to download |
| Server | Cloudflare Workers | Free, 24/7, no servers to manage |
| AI | Google Gemini (Flash / Flash-Lite) | Understands photos, replies in strict JSON |
| Database | Cloudflare KV | Free and built into Workers |
| Deploy | GitHub → Cloudflare Builds | Every commit ships to the server by itself |

The whole server is a single file, [`worker.js`](worker.js), with zero dependencies.

---

## 🔒 Security and privacy

- The webhook only accepts requests with Telegram’s secret header.
- The diary checks Telegram’s cryptographic signature, so nobody can open someone else’s data.
- Keys live in Cloudflare secrets, not in the code.
- Photos are **not stored**: they go to Gemini only for recognition.

More: [privacy policy](https://sailxx.github.io/FITTER-AI/privacy.html) (in Russian).

---

## 🗺 Roadmap

- [x] **v1** Cloudflare bot, survey, target, photo logging, diary, weight, water, labels and barcodes
- [x] **v2** “What to eat” assistant, pills with reminders, analytics, light and dark theme
- [x] **v2.6** New diary look, macro hints, week chart; redesigned water and pills in the bot
- [ ] **v3.0** Product: a standalone app

Full history: [CHANGELOG.md](CHANGELOG.md) (in Russian).

---

## ❓ Questions and ideas

Found a bug or have a feature idea? Open an [issue](https://github.com/sailxx/FITTER-AI/issues/new) or message the author on Telegram: [@arkhitkovv](https://t.me/arkhitkovv).

---

## ⚖️ License

FITTER is released under the **MIT** license, see [LICENSE](LICENSE). It is an independent project and is not affiliated with Telegram, Google or Cloudflare. All names belong to their owners.

<div align="center">
  <br />
  <img src="docs/logo.svg" width="48" height="48" alt="">
  <br />
  <sub><b>FITTER</b> · One photo. Full control.</sub>
  <br />
</div>
