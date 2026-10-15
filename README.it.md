<div align="center">

[Русский](README.md) · [English](README.en.md) · [Español](README.es.md) · [Português](README.pt.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · **Italiano** · [Türkçe](README.tr.md) · [Українська](README.uk.md) · [Polski](README.pl.md)

<br>

<img src="assets/readme/hero-it.svg" width="100%" alt="FITTER — Fotografa il tuo piatto. L’IA conta le calorie. Contacalorie e macro direttamente in Telegram.">

<a href="https://t.me/FitterFoodBot?start=github"><img src="assets/readme/cta-bot.svg" height="52" alt="Apri @FitterFoodBot in Telegram"></a>&nbsp;&nbsp;<a href="https://sailxx.github.io/FITTER-AI/"><img src="assets/readme/cta-site.svg" height="52" alt="Sito di FITTER"></a>

<sub><a href="#-funzioni">Funzioni</a> · <a href="#-come-funziona">Come funziona</a> · <a href="#-screenshot">Screenshot</a> · <a href="https://t.me/arkhitkovv">Contatti</a></sub>

</div>

<hr />

> [!IMPORTANT]
> **FITTER stima le calorie in modo approssimativo.** Il risultato da foto dipende dagli ingredienti e dalla dimensione della porzione, e ogni voce si può correggere a mano. Il bot non sostituisce il parere di un medico o di un dietologo.

> [!NOTE]
> Per ora il bot parla russo. Questa pagina è una traduzione del [README in russo](README.md).

<p align="center"><img src="assets/readme/about-it.svg" width="100%" alt="Il progetto FITTER"></p>

---

## 📸 Screenshot

<div align="center" id="-screenshot">
  <img src="assets/readme/screens-it.svg" width="100%" alt="Chat con il bot FITTER e diario alimentare in una Mini App di Telegram">
</div>

---

## ✨ Funzioni

<p align="center"><img src="assets/readme/features-it.svg" width="100%" alt="FITTER"></p>

---

## 🤖 Comandi

<div align="center">

| Comando | Cosa fa |
|:---|:---|
| `/start` | Presentazione e questionario |
| `/today` · `/week` | Riepilogo di oggi e degli ultimi 7 giorni |
| `/water` · `/remind` | Acqua di oggi e promemoria |
| `/advice` | Cosa mangiare: 3 proposte dell’IA |
| `/pills` | Integratori: segnare, aggiungere, eliminare |
| `/weight 72.5` | Registrare il peso |
| `/profile` | Profilo e fabbisogno giornaliero |
| `/awards` · `/analysis` | Traguardi e analisi settimanale dell’IA |
| `/app` | Aprire il diario |
| `/reset` · `/help` | Rifare il questionario e aiuto |
| `/delete` | Eliminare tutti i tuoi dati |

</div>

---

## 🧠 Come funziona

<div align="center">

```mermaid
sequenceDiagram
    autonumber
    actor U as Tu
    participant T as Telegram
    participant W as FITTER (Cloudflare Worker)
    participant G as Google Gemini
    participant D as Cloudflare KV

    U->>T: Foto del piatto
    T->>W: Webhook
    W->>G: Foto + istruzioni
    G-->>W: Alimenti, grammi, macro (JSON)
    W->>D: Salva il pasto
    W->>T: Scheda con macro e pulsanti ✏️
    T-->>U: Risposta in ~8 secondi
```

</div>

| Livello | Tecnologia | Perché |
|:---|:---|:---|
| Interfaccia | Telegram Bot API + Mini App | Tutti hanno già Telegram, niente da scaricare |
| Server | Cloudflare Workers | Gratis, 24/7, nessun server da gestire |
| IA | Google Gemini (Flash / Flash-Lite) | Capisce le foto, risponde in JSON rigoroso |
| Database | Cloudflare KV | Gratis e integrato in Workers |
| Deploy | GitHub → Cloudflare Builds | Ogni commit arriva sul server da solo |

L’intero server è un solo file, [`worker.js`](worker.js), senza dipendenze.

---

## 🔒 Sicurezza e privacy

- Il webhook accetta solo richieste con l’intestazione segreta di Telegram.
- Il diario verifica la firma crittografica di Telegram, così nessuno può aprire i dati di un altro.
- Le chiavi sono nei secret di Cloudflare, non nel codice.
- Le foto **non vengono conservate**: vanno a Gemini solo per il riconoscimento.

Altro: [informativa sulla privacy](https://sailxx.github.io/FITTER-AI/privacy.html) (in russo).

---

## 🗺 Roadmap

- [x] **v1** Bot su Cloudflare, questionario, fabbisogno, registrazione da foto, diario, peso, acqua, etichette e codici a barre
- [x] **v2** Assistente «Cosa mangiare», integratori con promemoria, statistiche, tema chiaro e scuro
- [x] **v2.6** Nuovo aspetto del diario, suggerimenti sulle macro, grafico della settimana; acqua e integratori ridisegnati nel bot
- [ ] **v3.0** Prodotto: app indipendente

Cronologia completa: [CHANGELOG.md](CHANGELOG.md) (in russo).

---

## ❓ Domande e idee

Hai trovato un bug o hai un’idea? Apri una [issue](https://github.com/sailxx/FITTER-AI/issues/new) o scrivi all’autore su Telegram: [@arkhitkovv](https://t.me/arkhitkovv).

---

## ⚖️ Licenza

FITTER è distribuito con licenza **MIT**, vedi [LICENSE](LICENSE). È un progetto indipendente, non affiliato a Telegram, Google o Cloudflare. Tutti i nomi appartengono ai rispettivi proprietari.

<div align="center">
  <br />
  <img src="docs/logo.svg" width="48" height="48" alt="">
  <br />
  <sub><b>FITTER</b> · Una foto. Pieno controllo.</sub>
  <br />
  <sub>Creato da <a href="https://t.me/arkhitkovv">Vlad</a>. Se il progetto ti è stato utile, lascia una ⭐ al repository.</sub>
</div>
