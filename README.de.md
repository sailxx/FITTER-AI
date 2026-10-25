<div align="center">

[Русский](README.ru.md) · [English](README.md) · [Español](README.es.md) · [Português](README.pt.md) · **Deutsch** · [Français](README.fr.md) · [Italiano](README.it.md) · [Türkçe](README.tr.md) · [Українська](README.uk.md) · [Polski](README.pl.md)

<br>

<img src="assets/readme/hero-de.svg" width="100%" alt="FITTER — Fotografiere dein Essen. Die KI zählt die Kalorien. App mit Widgets: Kalorien und Makros per Foto. Auch als Telegram-Bot verfügbar.">

<a href="https://github.com/sailxx/FITTER-AI/releases/latest/download/Fitter.apk"><img src="assets/readme/cta-app.svg" height="52" alt="Fitter.apk herunterladen"></a>&nbsp;&nbsp;<a href="https://t.me/FitterFoodBot?start=github"><img src="assets/readme/cta-bot.svg" height="52" alt="@FitterFoodBot in Telegram öffnen"></a>&nbsp;&nbsp;<a href="https://sailxx.github.io/FITTER-AI/"><img src="assets/readme/cta-site.svg" height="52" alt="FITTER-Website"></a>

<sub><a href="#-funktionen">Funktionen</a> · <a href="#-so-funktionierts">So funktioniert’s</a> · <a href="#-screenshots">Screenshots</a> · <a href="https://t.me/arkhitkovv">Kontakt</a></sub>

</div>

<hr />

> [!IMPORTANT]
> **FITTER schätzt Kalorien nur ungefähr.** Das Ergebnis eines Fotos hängt von den Zutaten und der Portionsgröße ab, und jeder Eintrag lässt sich von Hand korrigieren. Der Bot ersetzt keine ärztliche oder ernährungsberaterische Beratung.

> [!NOTE]
> Der Bot spricht derzeit Russisch. Diese Seite ist eine Übersetzung der [russischen README](README.md).

<p align="center"><img src="assets/readme/about-de.svg" width="100%" alt="Über FITTER"></p>

---

## 📸 Screenshots

<div align="center" id="-screenshots">
  <img src="assets/readme/screens-de.svg" width="100%" alt="Fitter für Android: Heute-Bildschirm im hellen und dunklen Design, Wasser, Pillen und Mahlzeiten">
</div>

---

## ✨ Funktionen

<p align="center"><img src="assets/readme/features-de.svg" width="100%" alt="FITTER"></p>

---

## 🤖 Befehle

<div align="center">

| Befehl | Was er tut |
|:---|:---|
| `/start` | Begrüßung und Fragebogen |
| `/today` · `/week` | Heute und die letzten 7 Tage |
| `/water` · `/remind` | Wasser heute und Erinnerungen |
| `/advice` | Was essen: 3 KI-Vorschläge |
| `/pills` | Tabletten: abhaken, hinzufügen, löschen |
| `/weight 72.5` | Gewicht eintragen |
| `/profile` | Profil und Tagesziel |
| `/awards` · `/analysis` | Erfolge und KI-Wochenrückblick |
| `/app` | Tagebuch öffnen |
| `/reset` · `/help` | Fragebogen neu ausfüllen und Hilfe |
| `/delete` | Alle deine Daten löschen |

</div>

---

## 🧠 So funktioniert’s

<div align="center">

```mermaid
sequenceDiagram
    autonumber
    actor U as Du
    participant T as Telegram
    participant W as FITTER (Cloudflare Worker)
    participant G as Google Gemini
    participant D as Cloudflare KV

    U->>T: Foto vom Essen
    T->>W: Webhook
    W->>G: Foto + Anweisungen
    G-->>W: Lebensmittel, Gramm, Makros (JSON)
    W->>D: Mahlzeit speichern
    W->>T: Karte mit Makros und ✏️-Tasten
    T-->>U: Antwort in ~8 Sekunden
```

</div>

| Schicht | Technologie | Warum |
|:---|:---|:---|
| Oberfläche | Telegram Bot API + Mini App | Alle haben schon Telegram, nichts herunterzuladen |
| Server | Cloudflare Workers | Kostenlos, rund um die Uhr, keine Server zu pflegen |
| KI | Google Gemini (Flash / Flash-Lite) | Versteht Fotos, antwortet in strengem JSON |
| Datenbank | Cloudflare KV | Kostenlos und in Workers integriert |
| Deployment | GitHub → Cloudflare Builds | Jeder Commit landet von selbst auf dem Server |

Der gesamte Server ist eine einzige Datei, [`worker.js`](worker.js), ohne Abhängigkeiten.

---

## 🔒 Sicherheit und Datenschutz

- Der Webhook akzeptiert nur Anfragen mit dem geheimen Telegram-Header.
- Das Tagebuch prüft die kryptografische Signatur von Telegram: Fremde Daten lassen sich nicht öffnen.
- Schlüssel liegen in den Cloudflare-Secrets, nicht im Code.
- Fotos werden **nicht gespeichert**: Sie gehen nur zur Erkennung an Gemini.

Mehr dazu: [Datenschutzerklärung](https://sailxx.github.io/FITTER-AI/privacy.html) (auf Russisch).

---

## 🗺 Roadmap

- [x] **v1** Bot auf Cloudflare, Fragebogen, Tagesziel, Foto-Erfassung, Tagebuch, Gewicht, Wasser, Etiketten und Barcodes
- [x] **v2** Assistent „Was essen“, Tabletten mit Erinnerungen, Statistiken, helles und dunkles Design
- [x] **v2.6** Neues Tagebuch-Design, Makro-Tipps, Wochendiagramm; Wasser und Tabletten im Bot überarbeitet
- [ ] **v3.0** Produkt: eigenständige App

Vollständiger Verlauf: [CHANGELOG.md](CHANGELOG.md) (auf Russisch).

---

## ❓ Fragen und Ideen

Einen Fehler gefunden oder eine Idee? Öffne ein [Issue](https://github.com/sailxx/FITTER-AI/issues/new) oder schreib dem Autor auf Telegram: [@arkhitkovv](https://t.me/arkhitkovv).

---

## ⚖️ Lizenz

FITTER steht unter der **MIT**-Lizenz, siehe [LICENSE](LICENSE). Das Projekt ist unabhängig und steht in keiner Verbindung zu Telegram, Google oder Cloudflare. Die Namen gehören ihren Inhabern.

<div align="center">
  <br />
  <img src="docs/logo.svg" width="48" height="48" alt="">
  <br />
  <sub><b>FITTER</b> · Ein Foto. Volle Kontrolle.</sub>
  <br />
  <sub>Gemacht von <a href="https://t.me/arkhitkovv">Vlad</a>. Wenn dir das Projekt geholfen hat, gib dem Repo einen ⭐</sub>
</div>
