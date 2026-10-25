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
4. Click **Edit code**
5. Delete all the code in the editor and paste the whole code from [`worker.js`](worker.js) instead
   (on GitHub open the file → the **Copy raw file** button at the top right)
6. Click **Deploy** at the top right

## Step 4. Connect the database

1. On the left open **Storage & Databases** → **KV** → **Create** (or **Create instance**)
2. Name: `fitter-db` → **Create**
3. Go back to your `fitter-ai` worker → the **Bindings** tab (or **Settings → Bindings**) → **Add binding**
4. Choose **KV namespace**
5. Variable name: **`DB`** (in capital letters, this is important!)
6. KV namespace: `fitter-db` → **Add binding** / **Save**

## Step 5. Add the secret keys

In the worker open **Settings** → **Variables and Secrets** → **Add**. Add three of them, type **Secret**:

| Variable name | Value |
|---|---|
| `BOT_TOKEN` | the BotFather token from step 1 |
| `GEMINI_API_KEY` | the Gemini key from step 2 |
| `WEBHOOK_SECRET` | any password of Latin letters and digits, for example `fitter2026secret` |

Click **Deploy** / **Save**.

## Step 6. Turn the bot on

1. Find your worker's address. It's shown on the worker page and looks like this:
   `https://fitter-ai.YOUR-NAME.workers.dev`
2. Open this address in a browser, adding `/setup` at the end:
   ```
   https://fitter-ai.YOUR-NAME.workers.dev/setup
   ```
3. Enter your WEBHOOK_SECRET in the field and click **Set up the bot**. Every line should have a ✅
   (the page is shown in Russian if your browser is set to Russian, otherwise in English)
   The bot also installs an English and a Russian command menu: the language follows the user's Telegram, and anyone can change it with `/lang`
4. Open your bot in Telegram and tap **Start** 🎉

---

## If something doesn't work

| Problem | What to do |
|---|---|
| On /setup ❌ “The bot token is wrong” | Check BOT_TOKEN: copy it again from @BotFather, with no spaces |
| ❌ “The KV database is connected” | In step 4 the variable name must be exactly `DB` |
| ❌ “Gemini is not responding” with code 400 or 403 | The Gemini key is wrong, create a new one in AI Studio |
| ❌ “Gemini is not responding” with code 429 | The free limit is used up, wait until tomorrow or create a key in another Google account |
| The bot is silent | Open /setup again. In Cloudflare open the worker → **Logs**, errors are visible there |
| The diary (Mini App) doesn't open | The workers.dev domain sometimes works poorly in some countries. You can connect your own domain in Cloudflare (Settings → Domains & Routes) and open /setup again on the new address |
| The Gemini model is outdated | Add a `GEMINI_MODEL` variable with the name of a new model from https://ai.google.dev/gemini-api/docs/models |

## Extra settings

| Variable | What it does | Default |
|---|---|---|
| `GEMINI_MODEL` | Which Gemini model to use | `gemini-3.5-flash`; if it's unavailable, the bot tries fallbacks itself |
| `DAILY_AI_LIMIT` | How many photos and questions a day one person can send | `40` |

## Update the bot

When a new version of `worker.js` appears: Cloudflare → the worker → **Edit code** → paste the new code → **Deploy**. Users' data is not lost, it lives in the database.

## For those comfortable with the command line

```bash
npm test                         # check without the internet
npx wrangler kv namespace create fitter-db   # put the id into wrangler.toml
npx wrangler secret put BOT_TOKEN
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put WEBHOOK_SECRET
npx wrangler deploy
```
