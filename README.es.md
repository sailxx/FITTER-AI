<div align="center">

[Русский](README.md) · [English](README.en.md) · **Español** · [Português](README.pt.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Italiano](README.it.md) · [Türkçe](README.tr.md) · [Українська](README.uk.md) · [Polski](README.pl.md)

<br>

<img src="assets/readme/hero-es.svg" width="100%" alt="FITTER — Fotografía tu comida. La IA cuenta las calorías. Contador de calorías y macros dentro de Telegram.">

<a href="https://t.me/FitterFoodBot?start=github"><img src="assets/readme/cta-bot.svg" height="52" alt="Abrir @FitterFoodBot en Telegram"></a>&nbsp;&nbsp;<a href="https://sailxx.github.io/FITTER-AI/"><img src="assets/readme/cta-site.svg" height="52" alt="Web de FITTER"></a>

<sub><a href="#-funciones">Funciones</a> · <a href="#-cómo-funciona">Cómo funciona</a> · <a href="#-capturas">Capturas</a> · <a href="https://t.me/arkhitkovv">Contacto</a></sub>

</div>

<hr />

> [!IMPORTANT]
> **FITTER calcula las calorías de forma aproximada.** El resultado de una foto depende de los ingredientes y del tamaño de la ración, y cualquier registro se puede corregir a mano. El bot no sustituye la consulta con un médico o nutricionista.

> [!NOTE]
> Por ahora el bot habla ruso. Esta página es una traducción del [README en ruso](README.md).

<p align="center"><img src="assets/readme/about-es.svg" width="100%" alt="Sobre FITTER"></p>

---

## 📸 Capturas

<div align="center" id="-capturas">
  <img src="assets/readme/screens-es.svg" width="100%" alt="Chat con el bot FITTER y el diario de comidas en una Mini App de Telegram">
</div>

---

## ✨ Funciones

<p align="center"><img src="assets/readme/features-es.svg" width="100%" alt="FITTER"></p>

---

## 🤖 Comandos

<div align="center">

| Comando | Qué hace |
|:---|:---|
| `/start` | Presentación y encuesta |
| `/today` · `/week` | Resumen de hoy y de los últimos 7 días |
| `/water` · `/remind` | Agua de hoy y recordatorios |
| `/advice` | Qué comer: 3 sugerencias de la IA |
| `/pills` | Pastillas: marcar, añadir, borrar |
| `/weight 72.5` | Registrar el peso |
| `/profile` | Perfil y objetivo diario |
| `/awards` · `/analysis` | Logros y resumen semanal con IA |
| `/app` | Abrir el diario |
| `/reset` · `/help` | Repetir la encuesta y ayuda |
| `/delete` | Borrar todos tus datos |

</div>

---

## 🧠 Cómo funciona

<div align="center">

```mermaid
sequenceDiagram
    autonumber
    actor U as Tú
    participant T as Telegram
    participant W as FITTER (Cloudflare Worker)
    participant G as Google Gemini
    participant D as Cloudflare KV

    U->>T: Foto de la comida
    T->>W: Webhook
    W->>G: Foto + instrucciones
    G-->>W: Alimentos, gramos, macros (JSON)
    W->>D: Guardar la comida
    W->>T: Tarjeta con macros y botones ✏️
    T-->>U: Respuesta en ~8 segundos
```

</div>

| Capa | Tecnología | Por qué |
|:---|:---|:---|
| Interfaz | Telegram Bot API + Mini App | Todo el mundo tiene Telegram, no hay nada que descargar |
| Servidor | Cloudflare Workers | Gratis, 24/7, sin servidores que mantener |
| IA | Google Gemini (Flash / Flash-Lite) | Entiende fotos y responde en JSON estricto |
| Base de datos | Cloudflare KV | Gratis e integrada en Workers |
| Despliegue | GitHub → Cloudflare Builds | Cada commit llega solo al servidor |

Todo el servidor es un único archivo, [`worker.js`](worker.js), sin dependencias.

---

## 🔒 Seguridad y privacidad

- El webhook solo acepta solicitudes con la cabecera secreta de Telegram.
- El diario comprueba la firma criptográfica de Telegram: nadie puede abrir datos ajenos.
- Las claves están en los secretos de Cloudflare, no en el código.
- Las fotos **no se guardan**: solo se envían a Gemini para el reconocimiento.

Más información: [política de privacidad](https://sailxx.github.io/FITTER-AI/privacy.html) (en ruso).

---

## 🗺 Hoja de ruta

- [x] **v1** Bot en Cloudflare, encuesta, objetivo, registro por foto, diario, peso, agua, etiquetas y códigos de barras
- [x] **v2** Asistente «Qué comer», pastillas con recordatorios, estadísticas, tema claro y oscuro
- [x] **v2.6** Nuevo diseño del diario, consejos de macros, gráfico semanal; agua y pastillas renovadas en el bot
- [ ] **v3.0** Producto: app independiente

Historial completo: [CHANGELOG.md](CHANGELOG.md) (en ruso).

---

## ❓ Preguntas e ideas

¿Encontraste un error o tienes una idea? Abre un [issue](https://github.com/sailxx/FITTER-AI/issues/new) o escribe al autor en Telegram: [@arkhitkovv](https://t.me/arkhitkovv).

---

## ⚖️ Licencia

FITTER se distribuye bajo la licencia **MIT**, consulta [LICENSE](LICENSE). Es un proyecto independiente y no está vinculado a Telegram, Google ni Cloudflare. Los nombres pertenecen a sus propietarios.

<div align="center">
  <br />
  <img src="docs/logo.svg" width="48" height="48" alt="">
  <br />
  <sub><b>FITTER</b> · Una foto. Control total.</sub>
  <br />
  <sub>Hecho por <a href="https://t.me/arkhitkovv">Vlad</a>. Si el proyecto te sirvió, dale una ⭐ al repositorio.</sub>
</div>
