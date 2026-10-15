<div align="center">

[Русский](README.md) · [English](README.en.md) · [Español](README.es.md) · [Português](README.pt.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Italiano](README.it.md) · [Türkçe](README.tr.md) · [Українська](README.uk.md) · **Polski**

<br>

<img src="assets/readme/hero-pl.svg" width="100%" alt="FITTER — Zrób zdjęcie posiłku. AI policzy kalorie. Licznik kalorii i makro prosto w Telegramie.">

<a href="https://t.me/FitterFoodBot?start=github"><img src="assets/readme/cta-bot.svg" height="52" alt="Otwórz @FitterFoodBot w Telegramie"></a>&nbsp;&nbsp;<a href="https://sailxx.github.io/FITTER-AI/"><img src="assets/readme/cta-site.svg" height="52" alt="Strona FITTER"></a>

<sub><a href="#-funkcje">Funkcje</a> · <a href="#-jak-to-działa">Jak to działa</a> · <a href="#-zrzuty-ekranu">Zrzuty ekranu</a> · <a href="https://t.me/arkhitkovv">Kontakt</a></sub>

</div>

<hr />

> [!IMPORTANT]
> **FITTER szacuje kalorie w przybliżeniu.** Wynik ze zdjęcia zależy od składników i wielkości porcji, a każdy wpis można poprawić ręcznie. Bot nie zastępuje porady lekarza ani dietetyka.

> [!NOTE]
> Na razie bot mówi po rosyjsku. Ta strona to tłumaczenie [rosyjskiego README](README.md).

<p align="center"><img src="assets/readme/about-pl.svg" width="100%" alt="O projekcie FITTER"></p>

---

## 📸 Zrzuty ekranu

<div align="center" id="-zrzuty-ekranu">
  <img src="assets/readme/screens-pl.svg" width="100%" alt="Czat z botem FITTER i dziennik żywienia w Telegram Mini App">
</div>

---

## ✨ Funkcje

<p align="center"><img src="assets/readme/features-pl.svg" width="100%" alt="FITTER"></p>

---

## 🤖 Polecenia

<div align="center">

| Polecenie | Co robi |
|:---|:---|
| `/start` | Powitanie i ankieta |
| `/today` · `/week` | Podsumowanie dnia i ostatnich 7 dni |
| `/water` · `/remind` | Dzisiejsza woda i przypomnienia |
| `/advice` | Co zjeść: 3 propozycje od AI |
| `/pills` | Tabletki: oznaczanie, dodawanie, usuwanie |
| `/weight 72.5` | Zapis wagi |
| `/profile` | Profil i dzienne zapotrzebowanie |
| `/awards` · `/analysis` | Osiągnięcia i tygodniowe podsumowanie od AI |
| `/app` | Otwarcie dziennika |
| `/reset` · `/help` | Ponowna ankieta i pomoc |
| `/delete` | Usunięcie wszystkich twoich danych |

</div>

---

## 🧠 Jak to działa

<div align="center">

```mermaid
sequenceDiagram
    autonumber
    actor U as Ty
    participant T as Telegram
    participant W as FITTER (Cloudflare Worker)
    participant G as Google Gemini
    participant D as Cloudflare KV

    U->>T: Zdjęcie posiłku
    T->>W: Webhook
    W->>G: Zdjęcie + instrukcje
    G-->>W: Produkty, gramy, makro (JSON)
    W->>D: Zapis posiłku
    W->>T: Karta z makro i przyciskami ✏️
    T-->>U: Odpowiedź w ~8 sekund
```

</div>

| Warstwa | Technologia | Dlaczego |
|:---|:---|:---|
| Interfejs | Telegram Bot API + Mini App | Każdy ma już Telegrama, nic nie trzeba pobierać |
| Serwer | Cloudflare Workers | Za darmo, 24/7, bez własnych serwerów |
| AI | Google Gemini (Flash / Flash-Lite) | Rozumie zdjęcia, odpowiada ścisłym JSON-em |
| Baza danych | Cloudflare KV | Darmowa i wbudowana w Workers |
| Wdrożenie | GitHub → Cloudflare Builds | Każdy commit sam trafia na serwer |

Cały serwer to jeden plik, [`worker.js`](worker.js), bez zależności.

---

## 🔒 Bezpieczeństwo i prywatność

- Webhook przyjmuje tylko żądania z tajnym nagłówkiem Telegrama.
- Dziennik sprawdza kryptograficzny podpis Telegrama, więc nikt nie otworzy cudzych danych.
- Klucze są w sekretach Cloudflare, a nie w kodzie.
- Zdjęcia **nie są przechowywane**: trafiają do Gemini tylko do rozpoznania.

Więcej: [polityka prywatności](https://sailxx.github.io/FITTER-AI/privacy.html) (po rosyjsku).

---

## 🗺 Plan rozwoju

- [x] **v1** Bot na Cloudflare, ankieta, zapotrzebowanie, zapis ze zdjęcia, dziennik, waga, woda, etykiety i kody kreskowe
- [x] **v2** Asystent „Co zjeść”, tabletki z przypomnieniami, statystyki, jasny i ciemny motyw
- [x] **v2.6** Nowy wygląd dziennika, podpowiedzi do makro, wykres tygodnia; odświeżone woda i tabletki w bocie
- [ ] **v3.0** Produkt: osobna aplikacja

Pełna historia: [CHANGELOG.md](CHANGELOG.md) (po rosyjsku).

---

## ❓ Pytania i pomysły

Znalazłeś błąd albo masz pomysł? Otwórz [issue](https://github.com/sailxx/FITTER-AI/issues/new) lub napisz do autora na Telegramie: [@arkhitkovv](https://t.me/arkhitkovv).

---

## ⚖️ Licencja

FITTER jest udostępniany na licencji **MIT**, zobacz [LICENSE](LICENSE). To niezależny projekt, niezwiązany z Telegramem, Google ani Cloudflare. Wszystkie nazwy należą do ich właścicieli.

<div align="center">
  <br />
  <img src="docs/logo.svg" width="48" height="48" alt="">
  <br />
  <sub><b>FITTER</b> · Jedno zdjęcie. Pełna kontrola.</sub>
  <br />
  <sub>Stworzył <a href="https://t.me/arkhitkovv">Vlad</a>. Jeśli projekt ci pomógł, daj repozytorium ⭐</sub>
</div>
