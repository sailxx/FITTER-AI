# How to run FITTER for free

**English** · [Русский](SETUP.ru.md)

It takes about 20 minutes. No programming — just copy and paste.

Everything is free:

| What | Why | Price |
|---|---|---|
| Telegram and @BotFather | the bot itself | free |
| Google AI Studio | a key to the Gemini AI that looks at the photos | free |
| Cloudflare Workers | the server the bot runs on 24/7 | free, 100,000 requests a day |
| Cloudflare KV | the database: profiles and diaries | free |

---

## Step 1. Create the bot in Telegram

1. Open the **@BotFather** bot in Telegram
2. Send `/newbot`
3. Pick a name, for example `Fitter AI`
4. Pick a username that ends in `bot`, for example `fitter_ai_vlad_bot`
5. BotFather sends you a **token** that looks like `7123456789:AAH...`
6. Save the token in your notes. It's the bot's password — show it to no one

## Step 2. Get a Gemini API key

1. Open https://aistudio.google.com/apikey and sign in with your Google account
2. Click **Create API key**
3. Copy the key (it starts with `AIza...`) and save it in your notes

> If the site says it's unavailable in your country, get the key through a VPN.
> The bot itself later works without a VPN: the AI is called by the Cloudflare server, not by your phone.

## Step 3. Create the server on Cloudflare

1. Sign up at https://dash.cloudflare.com/sign-up (free, no card needed)
2. On the left open **Compute (Workers)** → **Workers & Pages** → **Create** → **Create Worker**
   (the button may be called **Start with Hello World!**)
3. Name it `fitter-ai` and click **Deploy**
4. Connect this repository to Workers Builds, or deploy the repository with Wrangler using [`wrangler.toml`](wrangler.toml). The Worker imports multiple files and needs the `LIVE` Durable Object binding.
5. Set `PUBLIC_ORIGIN` to the HTTPS address of your Worker, without a trailing slash.

## Step 4. Connect the database

1. On the left open **Storage & Databases** → **KV** → **Create** (or **Create instance**)
2. Name: `fitter-db` → **Create**
3. Go back to your `fitter-ai` worker → the **Bindings** tab (or **Settings → Bindings**) → **Add binding**
4. Choose **KV namespace**
5. Variable name: **`DB`** (in capital letters, this is important!)
6. KV namespace: `fitter-db` → **Add binding** / **Save**

## Step 5. Add the secret keys

In the worker open **Settings** → **Variables and Secrets** → **Add**. Add these as **Secret**:

| Variable name | Value |
|---|---|
| `BOT_TOKEN` | the BotFather token from step 1 |
| `GEMINI_API_KEY` | the Gemini key from step 2 |
| `WEBHOOK_SECRET` | a random secret using letters, digits, `_` or `-` |
| `SETUP_SECRET` | a separate random secret of at least 24 characters. `/setup` is disabled when this is unset |

Click **Deploy** / **Save**.

## Step 6. Turn the bot on

1. Find your worker's address. It's shown on the worker page and looks like this:
   `https://fitter-ai.YOUR-NAME.workers.dev`
2. Open this address in a browser, adding `/setup` at the end:
   ```
   https://fitter-ai.YOUR-NAME.workers.dev/setup
   ```
3. Enter your `SETUP_SECRET` in the field and click **Set up the bot**. Every line should have a ✅
   (the page is shown in Russian if your browser is set to Russian, otherwise in English)
   Telegram shows the English or Russian command list based on its own language setting. Users choose the language of Fitter before the first questionnaire and can change it with `/lang`.
4. Open your bot in Telegram and tap **Start** 🎉
5. To add the Fitter flag icons to the language buttons, send `/makeemoji` from the bot owner's account after deployment. The language card itself already includes both illustrations.

---

## If something doesn't work

| Problem | What to do |
|---|---|
| On /setup ❌ “The bot token is wrong” | Check BOT_TOKEN: copy it again from @BotFather, with no spaces |
| ❌ “The KV database is connected” | In step 4 the variable name must be exactly `DB` |
| ❌ “Gemini is not responding” with code 400 or 403 | The Gemini key is wrong, create a new one in AI Studio |
| ❌ “Gemini is not responding” with code 429 | The free limit is used up, wait until tomorrow or create a key in another Google account |
| The bot is silent | Open /setup again. In Cloudflare open the worker → **Logs**, errors are visible there |
| The diary (Mini App) doesn't open | If you connect a custom domain, update `PUBLIC_ORIGIN` and run `/setup` again |
| The Gemini model is outdated | Add a `GEMINI_MODEL` variable with the name of a new model from https://ai.google.dev/gemini-api/docs/models |

## Extra settings

| Variable | What it does | Default |
|---|---|---|
| `GEMINI_MODEL` | Which Gemini model to use | `gemini-3.5-flash`; if it's unavailable, the bot tries fallbacks itself |
| `USDA_API_KEY` | Optional **Secret**. A free key from https://fdc.nal.usda.gov/api-key-signup: nutrition per 100 g is then taken from the USDA database instead of the AI's memory | not set |
| `DAILY_AI_LIMIT` | How many photos and questions a day one person can send | `40` |

## Update the bot

Deploy the updated repository with the existing `DB` and `LIVE` bindings. After the security update users of the Android app need the version with Telegram code entry and must sign in again. Run `/setup` with the separate secret to refresh the bot commands, including `/devices`.

## For those comfortable with the command line

```bash
npm test                         # check without the internet
npx wrangler kv namespace create fitter-db   # put the id into wrangler.toml
npx wrangler secret put BOT_TOKEN
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put WEBHOOK_SECRET
npx wrangler secret put SETUP_SECRET
npx wrangler deploy
```
