[English](README.md) · [العربية](README.ar.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [Čeština](README.cs.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Ελληνικά](README.el.md) · [Bahasa Indonesia](README.id.md) · [Gaeilge](README.ga.md) · [Italiano](README.it.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Polski](README.pl.md) · [Română](README.ro.md) · [Русский](README.ru.md) · [Español](README.es.md) · [Українська](README.uk.md) · [اردو](README.ur.md) · **ئۇيغۇرچە** · [Tiếng Việt](README.vi.md) · [Português](README.pt.md) · [Türkçe](README.tr.md)

<div align="center">


<br>

<img src="assets/readme/hero-en.svg" width="100%" alt="FITTER - تامىقىڭىزنى ئېلىڭ. AI ئىسسىقلىق مىقدارىنى ھېسابلايدۇ. كىچىك قوراللار بار ئەپ: سۈرەتتىكى ئىسسىقلىق ئېنېرگىيىسى ۋە ماكرو. Telegram bot سۈپىتىدە ئىشلەتكىلى بولىدۇ.">

<a href="https://github.com/sailxx/FITTER-AI/releases/latest/download/Fitter.apk"><img src="assets/readme/cta-app.svg" height="52" alt="Fitter.apk نى چۈشۈرۈڭ"></a>&nbsp; & nbsp;<a href="https://t.me/FitterFoodBot?start=github"><img src="assets/readme/cta-bot.svg" height="52" alt="Telegram دا @FitterFoodBot نى ئېچىڭ"></a>&nbsp; & nbsp;<a href="https://sailxx.github.io/FITTER-AI/"><img src="assets/readme/cta-site.svg" height="52" alt="FITTER تور بېكىتى"></a>

<sub><a href="#-features">Features</a> · <a href="#-how-it-works">قانداق ئىشلەيدۇ</a> · <a href="#-screenshots">ئېكران كۆرۈنۈشلىرى</a> · <a href="https://t.me/arkhitkovv">ئالاقىلىشىڭ</a></sub>

</div>

<hr />

> [!IMPORTANT]
> **FITTER تەخمىنەن ئىسسىقلىق ئېنېرگىيىسىنى مۆلچەرلەيدۇ.** رەسىم نەتىجىسى تەركىب ۋە بۆلەكنىڭ چوڭ-كىچىكلىكىگە باغلىق ، ھەر قانداق كىرىشنى قول بىلەن تۈزەتكىلى بولىدۇ. بوت دوختۇر ياكى يېمەك-ئىچمەك دوختۇرىنىڭ نەسىھىتىنىڭ ئورنىنى ئالمايدۇ.

<p align="center"><img src="assets/readme/about-en.svg" width="100%" alt="FITTER ھەققىدە"></p>

---

<a id="-screenshots"></a>

## 📸 ئېكران كۆرۈنۈشلىرى

<div align="center" id="-screenshots">
  <img src="assets/readme/screens-en.svg" width="100%" alt="Android غا ماس كېلىدىغان: بۈگۈنكى ئېكران يېنىك ۋە قاراڭغۇ تېمىلار ، سۇ ، دورا ۋە تاماقلار">
</div>

---

## ✨ Features

<p align="center"><img src="assets/readme/features-en.svg" width="100%" alt="FITTER"></p>

---

## 🤖 بۇيرۇقلار

<div align="center">

| بۇيرۇق | ئۇ نېمە قىلىدۇ |
|:---|:---|
| `/start` | تونۇشتۇرۇش ۋە تەكشۈرۈش |
| `/today` · `/week` | بۈگۈنكى خۇلاسە ۋە ئاخىرقى 7 كۈن |
| `/water` · `/remind` | بۈگۈنكى سۇ ۋە ئەسكەرتىش |
| `/advice` | نېمە يېيىش: 3 AI تەكلىپ |
| `/pills` | دورىلار: بەلگە ، قوشۇش ، ئۆچۈرۈش |
| `/weight 72.5` | ئېغىرلىقىڭىزنى خاتىرىلەڭ |
| `/profile` | ئارخىپ ۋە كۈندىلىك نىشان |
| `/awards` · `/analysis` | مۇۋەپپەقىيەتلەر ۋە AI ھەپتىلىك باھالاش |
| `/app` | كۈندىلىك خاتىرىسىنى ئېچىڭ |
| `/reset` · `/help` | تەكشۈرۈش ۋە ياردەمنى قايتۇرۇڭ |
| `/devices` | تىزىملاتقان Android ئۈسكۈنىلىرىنى كۆرۈش ۋە ئۈزۈش |
| `/delete` | بارلىق سانلىق مەلۇماتلىرىڭىزنى ئۆچۈرۈڭ |

</div>

---

<a id="-how-it-works"></a>

## 🧠 قانداق ئىشلەيدۇ

<div align="center">

```mermaid
sequenceDiagram
    autonumber
    actor U as You
    participant T as Telegram
    participant W as FITTER (Cloudflare Worker)
    participant G as Google Gemini
    participant D as Diary storage

    U->>T: Photo of a meal
    T->>W: Webhook
    W->>G: Photo + instructions
    G-->>W: Foods, grams, macros (JSON)
    W->>D: Save the meal
    W->>T: Card with macros and ✏️ buttons
    T-->>U: Reply in ~8 seconds
```

</div>

| Layer | تېخنىكا | نېمىشقا |
|:---|:---|:---|
| كۆرۈنمە يۈزى | Telegram Bot API + Mini App | ھەممەيلەندە Telegram بار ، چۈشۈرگىلى بولمايدۇ |
| مۇلازىمېتىر | Cloudflare Workers | ھەقسىز ، 24/7 ، باشقۇرغۇدەك مۇلازىمېتىر يوق |
| AI | Google Gemini (Flash / Flash-Lite) | رەسىملەرنى چۈشىنىدۇ ، قاتتىق JSON دا جاۋاب بېرىدۇ |
| ساندان | Cloudflare چىداملىق جىسىملار ۋە KV | ئىزچىل كۈندىلىك خاتىرىلەر سانلىق مەلۇماتلارنى يازىدۇ ۋە ساقلايدۇ |
| ئورۇنلاشتۇرۇش | GitHub → Cloudflare قۇردى | ھەر بىر ۋەدىسىنى ئۆزى مۇلازىمېتىرغا ئەۋەتىدۇ |

پۈتكۈل مۇلازىمېتىر بىرلا ھۆججەت, [`worker.js`](worker.js), تايىنىشچانلىقى نۆل.

---

## 🔒 بىخەتەرلىك ۋە مەخپىيەتلىك

- Webhook پەقەت Telegram نىڭ مەخپىي ماۋزۇسى بىلەن تەلەپلەرنى قوبۇل قىلىدۇ.
- كۈندىلىك خاتىرە Telegram نىڭ شىفىرلىق ئىمزاسىنى تەكشۈرىدۇ ، شۇڭا ھېچكىم باشقىلارنىڭ سانلىق مەلۇماتلىرىنى ئاچالمايدۇ.
- ئاچقۇچ كودتا ئەمەس ، Cloudflare مەخپىيىتىدە ياشايدۇ.
- سۈرەتلەر **ساقلانمىدى**: ئۇلار پەقەت Gemini غا بارىدۇ.

تېخىمۇ كۆپ: [مەخپىيەتلىك تۈزۈمى](https://sailxx.github.io/FITTER-AI/privacy.html).

---

## 🗺 يول خەرىتىسى

- [x] **v1** Cloudflare بوت ، تەكشۈرۈش ، نىشان ، رەسىم خاتىرىلەش ، كۈندىلىك خاتىرە ، ئېغىرلىق ، سۇ ، بەلگە ۋە تاياقچە كودى
- [x] **v2** “نېمە يېيىش »ياردەمچىسى ، ئەسكەرتىش ، ئانالىز ، يورۇقلۇق ۋە قاراڭغۇ تېما
- [x] **v2.6** يېڭى كۈندىلىك كۆرۈنۈش ، ماكرو بېشارەتلەر ، ھەپتە جەدۋىلى قايتا ياسالغان سۇ ۋە دورىلار
- [x] **v3.0** مەھسۇلات: كىچىك قوراللار بىلەن مۇستەقىل Android دېتالى
- [x] **v3.8** ھەممە يەردە ئىنگلىزچە ۋە رۇسچە: bot ، كۈندىلىك خاتىرە ، Android دېتالى ، كىچىك قوراللار ۋە تور بېكەت ، تىل ئالماشتۇرغۇچ
- [x] **v3.12** بىر قېتىم Android كىرىش كودى ، ئۈسكۈنىلەرنى ئەمەلدىن قالدۇرۇش ۋە كۈندىلىك كۈندىلىك ماسقەدەملەش

تولۇق تارىخ: [CHANGELOG.md](CHANGELOG.md) ([رۇس تىلىدا](CHANGELOG.ru.md)).

---

## ❓ سوئال ۋە پىكىر

كەمتۈك تېپىلدىمۇ ياكى ئىقتىدار ئىدىيىسى بارمۇ؟ ئېچىڭ [مەسىلە](https://github.com/sailxx/FITTER-AI/issues/new) ياكى ئاپتورغا Telegram غا ئۇچۇر يوللاڭ: [@arkhitkovv](https://t.me/arkhitkovv).

---

## ⚖️ ئىجازەتنامە

FITTER نىڭ ئاستىدا تارقىتىلدى **Apache 2.0** ئىجازەتنامە ، قاراڭ [LICENSE](LICENSE). ئۇ مۇستەقىل تۈر بولۇپ ، Telegram ، Google ياكى Cloudflare بىلەن مۇناسىۋىتى يوق. بارلىق ئىسىملار ئۇلارنىڭ ئىگىسىگە تەۋە.

<div align="center">
  <br />
  <img src="docs/logo.svg" width="48" height="48" alt="">
  <br />
  <sub><b>FITTER</b> · بىر پارچە رەسىم. تولۇق كونترول.</sub>
  <br />
</div>
