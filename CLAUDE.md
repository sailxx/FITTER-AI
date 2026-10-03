# FITTER Project Instructions

## Language and Output

Think and plan in English without exposing private chain-of-thought. Reply in Russian unless the user requests another language; the user is Vlad.

Lead with the result; include only necessary details, checks, risks, or blockers. No introductions, restatement, or long logs.

FITTER is a Telegram calorie-tracking bot + Mini App (@FitterFoodBot) on Cloudflare Workers, KV, and Gemini.

Example: after a fix, report what changed, test result, and what Vlad must do (e.g. open `/setup`).

## Project Index

- `worker.js` — entire server, no dependencies: `fetch` routes (`/webhook`, `/setup`, `/app`, `/api/*`), `scheduled` crons, Gemini calls (`MODEL_FALLBACKS`, `responseSchema`), KV logic, Mini App in `APP_HTML`, `_test` export.
- `test/test.js` — offline tests with faked Telegram, Gemini, and KV.
- `wrangler.toml` — KV binding `DB`, crons, `[vars]`; `package.json` — version.
- `README.md` — features, structure, roadmap; `CHANGELOG.md` — version history; `SETUP.md` — deploy guide.
- `docs/` — GitHub Pages landing, `privacy.html`, SEO files; `icons/` — custom emoji PNG/SVG sources.

Example: a Mini App bug routes to `APP_HTML` and `/api/*` handlers in `worker.js`, then `test/test.js`.

## Search First, Frugal Reading, and Deny Noise

1. Open an exact user-named file; otherwise use `rg` for the symbol, route, KV prefix (`u:`, `d:`, `w:`, `wr:`, `pl:`, `adv:`, `an:`), or Russian UI text.
2. In `worker.js`, never read the whole file: locate the function or route and read it as a full unit.
3. Expand only to callers, `_test` exports, and matching tests; stop when evidence is sufficient.

Deny by default unless required: secrets, `.wrangler/`, `node_modules/`, `icons/**` and `docs/*.png|webp` binaries, full logs.

Example: pill reminder bug → `rg "pillTick|pl:ids"` → read `pillTick` and its test block.

## Tooling

- Windows. PowerShell blocks `.ps1` shims: call `npx.cmd` / `npm.cmd`. If `node` is missing from PATH, prepend `C:\Program Files\nodejs`.
- `git push` works via `gh` credentials (account `sailxx`).
- Every push to `main` auto-deploys via Workers Builds — never run `wrangler deploy`. Check with `npx.cmd wrangler deployments list`; read live logs with `npx.cmd wrangler tail`.
- Telegram (BotFather), Google Search Console, Yandex Webmaster: via Claude in Chrome in Vlad's logged-in session.

## Project-Specific Rules

- Never invent facts, APIs, or paths; ask only when information cannot be found.
- Run `node test/test.js` before every code commit; it must end with "Все проверки пройдены ✅". Tests swap emoji for `<tg-emoji>`, so regexes need `(<\/tg-emoji>)?`.
- Inside `APP_HTML` embedded JS: no backticks, no `${`, no backslashes; validate the JS with `new Function(js)`.
- Custom emoji (`<tg-emoji>`) must keep a plain-emoji fallback.
- Cron weekday must be letters (`SUN`), never `0`. New env vars must be Cloudflare Secrets, never Text vars (`[vars]` overwrites them on deploy).
- Never write secrets (`BOT_TOKEN`, `GEMINI_API_KEY`, `WEBHOOK_SECRET`, `ADMIN_ID`) in chat, code, or the repo.
- After new bot commands, tell Vlad to open `/setup`.
- When data collection or processing changes, update `docs/privacy.html`.
- With each release, update `CHANGELOG.md`, the README roadmap, and `package.json` version; major versions also get a GitHub Release.
- Commits: no `Co-Authored-By` or `Claude-Session` trailers. `git pull` before work — Vlad edits README on GitHub.
- Feature work goes on a branch + PR; small docs/site fixes may go straight to `main`. Push or publish only with Vlad's go-ahead.
- Vlad handles passwords, captchas, logins, and creating public repos.
- Match code style: Russian comments, plain functions, no frameworks.
