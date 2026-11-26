[English](README.md) · [العربية](README.ar.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [Čeština](README.cs.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · **Ελληνικά** · [Bahasa Indonesia](README.id.md) · [Gaeilge](README.ga.md) · [Italiano](README.it.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Polski](README.pl.md) · [Română](README.ro.md) · [Русский](README.ru.md) · [Español](README.es.md) · [Українська](README.uk.md) · [اردو](README.ur.md) · [ئۇيغۇرچە](README.ug.md) · [Tiếng Việt](README.vi.md) · [Português](README.pt.md) · [Türkçe](README.tr.md)

<div align="center">


<br>

<img src="assets/readme/hero-en.svg" width="100%" alt="FITTER — Τρίψτε το γεύμα σας. Το AI μετράει τις θερμίδες. Μια εφαρμογή με γραφικά στοιχεία: θερμίδες και μακροεντολές από μια φωτογραφία. Διατίθεται επίσης ως bot Telegram.">

<a href="https://github.com/sailxx/FITTER-AI/releases/latest/download/Fitter.apk"><img src="assets/readme/cta-app.svg" height="52" alt="Κατεβάστε το Fitter.apk"></a>&nbsp; &nbsp;<a href="https://t.me/FitterFoodBot?start=github"><img src="assets/readme/cta-bot.svg" height="52" alt="Ανοίξτε το @FitterFoodBot στο Telegram"></a>&nbsp; &nbsp;<a href="https://sailxx.github.io/FITTER-AI/"><img src="assets/readme/cta-site.svg" height="52" alt="Ιστότοπος FITTER"></a>

<sub><a href="#-features">Χαρακτηριστικά</a> · <a href="#-how-it-works">Πώς λειτουργεί</a> · <a href="#-screenshots">Στιγμιότυπα οθόνης</a> · <a href="https://t.me/arkhitkovv">Επαφή</a></sub>

</div>

<hr />

> [!IMPORTANT]
> **Το FITTER υπολογίζει τις θερμίδες κατά προσέγγιση.** Τα αποτελέσματα των φωτογραφιών εξαρτώνται από τα συστατικά και το μέγεθος της μερίδας και οποιαδήποτε καταχώριση μπορεί να διορθωθεί με το χέρι. Το bot δεν αντικαθιστά τις συμβουλές γιατρού ή διαιτολόγου.

<p align="center"><img src="assets/readme/about-en.svg" width="100%" alt="Σχετικά με το FITTER"></p>

---

<a id="-screenshots"></a>

## 📸 Στιγμιότυπα οθόνης

<div align="center" id="-screenshots">
  <img src="assets/readme/screens-en.svg" width="100%" alt="Εφαρμογή για Android: η οθόνη Today σε ανοιχτόχρωμα και σκούρα θέματα, νερό, χάπια και γεύματα">
</div>

---

<a id="-features"></a>

## ✨ Χαρακτηριστικά

<p align="center"><img src="assets/readme/features-en.svg" width="100%" alt="FITTER"></p>

---

## 🤖 Εντολές

<div align="center">

| Εντολή | Τι κάνει |
|:---|:---|
| `/start` | Εισαγωγή και έρευνα |
| `/today` · `/week` | Η σημερινή σύνοψη και οι τελευταίες 7 ημέρες |
| `/water` · `/remind` | Το σημερινό νερό και υπενθυμίσεις |
| `/advice` | Τι να φάτε: 3 προτάσεις AI |
| `/pills` | Χάπια: επισήμανση, προσθήκη, διαγραφή |
| `/weight 72.5` | Καταγράψτε το βάρος σας |
| `/profile` | Προφίλ και ημερήσιος στόχος |
| `/awards` · `/analysis` | Επιτεύγματα και εβδομαδιαία ανασκόπηση AI |
| `/app` | Ανοίξτε το ημερολόγιο |
| `/reset` · `/help` | Κάντε ξανά την έρευνα και βοηθήστε |
| `/devices` | Δείτε και αποσυνδέστε τις συνδεδεμένες συσκευές Android |
| `/delete` | Διαγράψτε όλα τα δεδομένα σας |

</div>

---

<a id="-how-it-works"></a>

## 🧠 Πώς λειτουργεί

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

| Στρώμα | Τεχνολογία | Γιατί |
|:---|:---|:---|
| Διασύνδεση | Telegram Bot API + Μίνι εφαρμογή | Όλοι έχουν ήδη το Telegram, τίποτα για λήψη |
| Υπηρέτης | Cloudflare Workers | Δωρεάν, 24/7, χωρίς διακομιστές για διαχείριση |
| AI | Google Gemini (Flash / Flash-Lite) | Κατανοεί φωτογραφίες, απαντά αυστηρά JSON |
| Βάση δεδομένων | Cloudflare Durable Objects και KV | Συνεπής εγγραφή ημερολογίου και αποθήκευση δεδομένων στην κρυφή μνήμη |
| Αναπτύσσω | GitHub → Κατασκευές Cloudflare | Κάθε δέσμευση αποστέλλεται στον διακομιστή από μόνη της |

Ολόκληρος ο διακομιστής είναι ένα μόνο αρχείο, [`worker.js`](worker.js), με μηδενικές εξαρτήσεις.

---

## 🔒 Ασφάλεια και ιδιωτικότητα

- Το webhook δέχεται μόνο αιτήματα με τη μυστική κεφαλίδα του Telegram.
- Το ημερολόγιο ελέγχει την κρυπτογραφική υπογραφή του Telegram, ώστε κανείς να μην μπορεί να ανοίξει τα δεδομένα κάποιου άλλου.
- Τα κλειδιά ζουν στα μυστικά του Cloudflare, όχι στον κώδικα.
- Οι φωτογραφίες είναι **δεν αποθηκεύεται**: πάνε στους Διδύμους μόνο για αναγνώριση.

Περισσότερο: [πολιτική απορρήτου](https://sailxx.github.io/FITTER-AI/privacy.html).

---

## 🗺 Οδικός Χάρτης

- [x] **v1** Cloudflare bot, έρευνα, στόχος, καταγραφή φωτογραφιών, ημερολόγιο, βάρος, νερό, ετικέτες και γραμμωτοί κώδικες
- [x] **v2** “What to eat” βοηθός, χάπια με υπενθυμίσεις, αναλυτικά στοιχεία, ανοιχτό και σκοτεινό θέμα
- [x] **v2.6** Νέα εμφάνιση ημερολογίου, μακροεντολές, διάγραμμα εβδομάδας. επανασχεδιασμένο νερό και χάπια στο bot
- [x] **v3.0** Προϊόν: μια αυτόνομη εφαρμογή Android με γραφικά στοιχεία
- [x] **v3.8** Αγγλικά και ρωσικά παντού: bot, ημερολόγιο, εφαρμογή Android, γραφικά στοιχεία και ιστότοπος, με διακόπτη γλώσσας
- [x] **v3.12** Εφάπαξ κωδικοί σύνδεσης Android, ανάκληση συσκευής και ταχύτερος συγχρονισμός ημερολογίου

Πλήρες ιστορικό: [CHANGELOG.md](CHANGELOG.md) ([στα ρωσικά](CHANGELOG.ru.md)).

---

## ❓ Ερωτήσεις και ιδέες

Βρήκατε ένα σφάλμα ή έχετε μια ιδέα για το χαρακτηριστικό; Ανοίξτε ένα [ζήτημα](https://github.com/sailxx/FITTER-AI/issues/new) ή στείλτε μήνυμα στον συγγραφέα στο Telegram: [@arkhitkovv](https://t.me/arkhitkovv).

---

## ⚖️ Αδεια

Το FITTER κυκλοφορεί κάτω από το **Apache 2.0** άδεια, βλ [LICENSE](LICENSE). Είναι ένα ανεξάρτητο έργο και δεν συνδέεται με το Telegram, το Google ή το Cloudflare. Όλα τα ονόματα ανήκουν στους ιδιοκτήτες τους.

<div align="center">
  <br />
  <img src="docs/logo.svg" width="48" height="48" alt="">
  <br />
  <sub><b>FITTER</b> · Μία φωτογραφία. Πλήρης έλεγχος.</sub>
  <br />
</div>
