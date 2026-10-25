# Changelog

**English** · [Русский](CHANGELOG.ru.md)

## v3.8 — English and Russian
- 🌐 The bot, the Telegram diary, the Android app and the widgets speak English and Russian. The language follows Telegram on first launch (Russian for ru, be, kk, English otherwise); people who used FITTER before keep Russian
- 🔁 Switch it anywhere: `/lang` or the “🌐 Language” button in the profile, the EN/RU button in the diary header, Settings → Language in the app. One choice per account, synced between the bot, the diary, the app and the widgets
- 🤖 AI answers (food names, tips, recipes, the weekly review) follow the chosen language; the bot understands English phrases (“water 300”, “2 glasses of water”, “trout 200 g”, “Vitamin D, 1 capsule, 9:00”)
- 🏋️ The exercise catalog, notifications and widgets are in English; widget names in the picker follow the phone's language
- 🌍 Website and privacy policy: English at the root, Russian in `/ru/`, with hreflang and an EN/RU switch. README, SETUP and CHANGELOG exist in both languages

## v3.7.2 — Widgets without an outline
- 🔲 Removed the thin outline around the widget edges

## v3.7.1 — Centered water widget
- 💧 “Water” widget: the glass and text are centered and no longer cling to the edge at wide sizes

## v3.7 — OLED and a 1×1 water widget
- 🖤 The dark theme is a pure OLED black, the light theme a pure white; cards are slightly lighter/darker than the background
- 💧 The “Water” widget can now be placed at 1×1: a glass with the liters below

## v3.6 — Dark icon
- 🖤 “Settings → Appearance → Icon”: green or dark — the same apple logo on a black background. The home-screen icon changes in a few seconds

## v3.5 — New logo and reminders
- 🔔 Reminders in the app: “Settings → Reminders” — water, food and pills, delivered without the internet or the bot
- 💧 Water: how often (1–3 h), from and until which hour, stay quiet once the goal is reached. The notification shows how much you've had with a progress bar, plus “＋ Glass 250 ml” (logs right away) and “In 30 min” buttons
- 🍽 Food: breakfast, lunch and dinner each with its own time; “📸 Take a photo” (opens the camera right away) and “✍️ Type it” buttons; no reminder if the food was already logged
- 💊 Pills: on the schedule from the bot, with “✓ Taken” and “Skip” buttons right in the notification
- 🎨 The “Protein / Carbs / Fat left” cards — each in a light tint of its own color
- 🍏 New FITTER logo: a green apple tile with a leaf, lens eyes and a camera flash, sparkly grain
- 📱 Adaptive Android app icon (circle, squircle) with a monochrome variant for themed icons on Android 13+
- 🔐 The new logo on the sign-in screen and in the widgets
- 🌐 The logo on the website, in favicons and in the README; the bot's avatar
- 🎨 First stable release with the v3.2 design (before that — beta)

## v3.2 — New app design
- 🌙 The Android app in the spirit of Cal AI: graphite background (gray in the light theme), neutral cards with a 24 radius, 20 margins, contrasting capsule buttons
- 🔥 “Today”: a green calorie card with a gradient into teal and sparkly grain — the big remainder on the left, a white ring with a flame on the right
- 🎯 Protein, carbs and fat as in Cal AI: how much is left or over on top, a colored ring with an icon below
- 💧 Water — a full-width card: “+” adds a glass, a long press removes one
- 💊 Pills — a separate card: full names, dose, time and a “taken” bar; tap to mark
- ✏️ Tapping a meal opens editing: each product has a name, weight, calories, protein, fat and carbs; when you change the weight the values recalculate on their own, “Recalculate with AI” picks values for a new name (`/api/item/set` on the server)
- ✨ “AI tips”, “Workouts”, “Settings” and the “Add food” sheet in the same style: a regular heading instead of the green header, cards, chips and capsule buttons
- ⚖️ A weight tile with a chart and the change over the period
- 🍽 “Recently added”: each meal has a picture based on the dish name, time, calories and macros
- 🗓 The calendar button next to the 🔥 streak expands the week; a long press opens a menu (refresh, settings, bot, sign out)
- 🫧 A liquid-glass bottom bar: the content behind it is blurred (Android 12+), the glass camera button in the middle opens the camera right away

## v3.1 — Workout diary
- 💪 A new “Workouts” section in the Fitter Android app — a tab in the bottom bar
- 📋 More than 140 exercises: chest, back, legs, glutes, shoulders, biceps, triceps, abs, cardio, stretching; search and a “🏠 At home” filter for workouts without a gym
- ➕ Custom exercises: a name, a muscle group and how to log it — weight × reps, reps, time or cardio (minutes and km); hold to delete
- 🔁 Sets: “＋ Add set” copies the previous one, a new exercise fills in the sets from last time
- 😌😐🥵 Every exercise gets an “Easy”, “Medium” or “Hard” mark
- 🗓 A workout can be logged for a past date, edited or deleted; the list shows sets, tonnage and a 7-day total
- ☁️ Workouts are stored on the server (`/api/workouts`), visible on all phones and erased by `/delete`

## v3.0 — The Fitter Android app
**App**
- 📱 A separate Fitter app (Kotlin + Compose) with the FITTER logo: `Fitter.apk` in the GitHub release, Android 8.0+
- 🔐 Sign-in through the bot: “Sign in with Telegram” → a confirmation button in @FitterFoodBot, no passwords
- 🟢 The “Today” screen like the diary in the bot: calorie ring, macros with a hint, water in glasses, pills (tap to mark), the day's food
- 📸 The green “+”: food by text, a camera shot or a photo from the gallery — the AI counts calories and macros as in the bot; a long press on a meal deletes it
- ✨ “AI tips”: “What to eat now” for what's left of your goal (an option is logged with one button) and a weekly review with a score; tapping an option opens the full recipe and “Find similar”
- ⚡ Live sync: while the app is open, entries from the bot and the diary show up in it instantly
- 🧭 Bottom bar: “Today”, “Tips”, “Settings” and a raised green “+” in the notch
- ⚙️ “Settings”: the theme (system, light, dark) and everything about widgets

**Widgets**
- 🧩 8 widgets: “Calories”, “Today”, “Water”, “Macros”, “Week”, “Pills”, “Left”, “Food photo”
- ⚪⚫ White in the light Fitter theme and black in the dark one; background opacity, corners, “left” or “eaten”, macros and water in “Today”
- 🔠 Text size: S, M, L, XL presets, separate “Main number”, “Text” and “Captions”, with the option to ignore the system font
- 📐 They adapt to size: stretch one and it gets bigger with more content (macros, meals, the pill list, the week summary)
- 👀 Display only; “Food photo” opens the app with the camera right away. They refresh in the background every 15 minutes and right after entries in the app

**Bot and diary in Telegram**
- 🩹 The Android diary no longer falls apart: no heavy filters, shadows or endless animations; the water glass is drawn without a mask, the page isn't cached
- 🌐 A server for the app: food photos, AI tips, live sync via a Durable Object

## v2.10 — Preparing for the Android app
- 📱 Sign-in to the upcoming Fitter app through the bot: a “Sign in with Telegram” link and a confirmation button, no passwords
- 🔑 The app gets its own access key (only a hash is stored), up to 5 phones, signing out disables the key, `/delete` erases all keys
- 🧩 `/api/widget` — a short summary for today for widgets: calories, macros, water, pills, streak

## v2.9.5 — Air in the diary
- 👤 Removed the account-letter circle to the right of the theme button
- 🟢 The header is bright green again in the light theme
- 📐 The diary tiles are roomier: more inner padding and gaps between them

## v2.9.4 — A lighter diary
- 🗑 The Okto theme is gone: the diary has a single look with a green ring, the look-switch button disappeared
- ☀️ The light theme is airier: a mint header instead of bright green, a lighter background, soft card shadows

## v2.9.3 — Logo in “Help”
- 🟩 Instead of the apple, the FITTER name now has the real logo: a green tile with a viewfinder and an apple (in “Help” and the greeting)

## v2.9.2 — Quotes and text styles
- 💬 Quotes are back in “Help” and “Profile”: a subtitle, a reminder about doctors and how the goal is calculated (the Mifflin–St Jeor formula)
- ✍️ Different styles: bold and underlined text, <code>monospaced</code> examples — tap to copy, a pro tip under a spoiler
- 🗂 Commands are split into groups: “Every day”, “Summaries”, “Profile”

## v2.9.1 — New “Help” and “Profile”
- ❓ “Help”: a clear subtitle, live hints and its own icon for every command
- 👤 “Profile”: height and weight on separate lines, the share of calories from protein, fat and carbs, water in glasses
- 🔘 Profile buttons in two rows: “Log weight”, “Achievements”, “Week”, “Edit profile”

## v2.9 — Fun icons
- 🎨 All bot icons redrawn in one colorful, fun style: a volumetric gradient, a highlight and a soft shadow — 72 premium emoji
- 🧩 One FITTER set instead of three: no more monochrome or foreign icons in messages and on buttons
- 👋 Own icons for smileys, reminders, sex, sunrise and sunset, “What to eat”, “Add” and “Skip”

## v2.8 — Okto theme
- 🎛 An exclusive Okto theme to celebrate the launch of my Okto app: the diary as a monochrome “instrument” — day keys, “left” on the left of the calorie display, a big “eaten” on the right, a segmented scale below, macros on three displays, food in rows without cards
- 🔁 The classic look with the green header and ring is still there: the theme switches with a button in the header, the choice is remembered on the device
- 🥛 Water is counted in glasses of 250 ml in both looks: “5 of 10 glasses”, the cells light up one by one

## v2.7 — Tidy messages
- 🌿 Bot messages are cleaner: no quote blocks, more air between groups, shorter captions
- 📊 “Today”, “Week”, “Profile”, “Help”, water, pills, achievements, the weekly review and “What to eat” — in one minimalist style
- 🎨 All FITTER icons are in place

## v2.6.1 — Short menu
- 🧹 Removed the “Water” and “Pills” buttons from the bot menu — “Today”, “Week”, “Profile” and “Help” remain; water and pills are available through /water and /pills

## v2.6 — New diary look
- 🟢 A bright green header: a big “Today”, the date, an initial and the week with the selected day; the text reads well in both themes
- ⭕ A new calorie ring: a white arc with a knob, the number on a white disc and the percentage of your goal
- 💡 A macro hint: what's missing the most and how to make it up, or what is already over your goal
- 🥗 Macro cards show “N g to go” or “on goal”, meals show the share of the day, P/F/C and a colored bar
- 📊 The week chart: bars with a goal line, the average and how many days were on goal; tap a day to open it
- ✨ Neat tiles in a single style in the light and dark themes, numbers with thousands separators (1,240) and weight with a decimal point

## v2.5.3 — Diary protection
- 🛡 The diary is protected by a CSP policy: only its own script and Telegram's script run, data goes only to the FITTER server
- 🔢 The daily limit of AI requests can't be bypassed by sending many photos at once

## v2.5.2 — Syncing with the diary
- 🔄 An open diary picks up changes from the chat on its own: pill marks, new and deleted medications, water and food entries — without a restart

## v2.5.1 — Security
- 🗑 The /delete command: erases the profile, diary, water, weight, pills and reminders after confirmation
- 🔒 The icon admin commands and /stats work only for the owner (ADMIN_ID); without ADMIN_ID they are closed
- 🔑 /setup: the secret is entered in a form, not in the page address; a separate SETUP_SECRET can be set
- ⏱ The diary signature is valid for a day instead of a week
- 📷 Images sent as files larger than 5 MB are not passed to the AI
- 🛠 Diary: the product index is checked on deletion

## v2.5 — Pills in the menu
- 💊 A “Pills” button in the bot menu instead of “Weight”: today's doses, marked with one tap
- ➕ Add a medication right in the chat: “Vitamin D, 1 capsule, 9:00 21:00” — reminders arrive in the bot
- 🗑 Deleting medications from the chat, the /pills command
- ✏️ A pencil next to the weight in the diary: change your weight right there, the goal is recalculated
- ⚖️ Log weight — in the profile and with the /weight command

## v2.4.2 — “Today” icon
- 📊 Colored bars on the “Today” buttons in the menu and messages

## v2.4.1 — Achievement icons
- 🔒 A colored lock on achievements not yet earned; after earning it is replaced by the award icon
- 📷 📓 💯 Colored icons for “Photographer”, “Diary in action” and “The hundred”
- 📅 A colored calendar on the “Week” buttons

## v2.4 — Colored icons
- 💊 Own colored icons for pills, the reminder alarm clock, the AI review and the goal target
- ⚖️ The scales are redrawn in color; colored icons for typing and questions in the help
- 🟩 The scale squares in the daily and weekly summaries are in the FITTER ICONS style
- /makeemoji replaces redrawn icons in the set by itself

## v2.3 — Light and dark theme
- ☀️ A button in the diary header switches between the light and dark theme
- By default the theme follows Telegram, the choice is remembered on the device

## v2.2 — Analytics
- 📊 Detailed owner statistics in /stats: active today, in 7 and 30 days, mini-charts of new and active users over 14 days
- A funnel of new users: the questionnaire and the first entry; retention after 1, 7 and 30 days
- Retention by sign-up week and by source

## v2.1.1 — Fix
- 💊 “In 30 min” after 23:30 now works: the reminder arrives at 00:00, where before it was lost at the date change

## v2.1 — Pills
- 💊 A “Pills” block in the diary: add vitamins or medications and the dose times, mark a dose with one tap
- Reminders in the chat at the right time with “Taken”, “In 30 min” and “Skip” buttons
- Marks from the chat and the diary are synced, and you can see what time it was taken
- You can view and mark doses for past days

## v2.0 — Assistant
- 🥗 “What to eat”: the AI suggests 3 options for your next meal based on the calories and protein left, the time of day and your goal. Any option is logged in the diary with one button
- It takes into account what you've eaten today and what you usually eat during the week, to avoid repeats
- A “What to eat” button in “Today” and “Week”, the /advice command
- A new “Week”: a compact chart by day, “Summary” and “Tip” blocks, days without entries no longer take up space

## v1.8 — Logging food in the diary
- The diary (Mini App) got a “What did you eat?” field: type it, the AI counts calories and macros and adds the meal
- You can add food for a past day: open the date in the diary
- The new entry is highlighted in the list, and the button spins while the AI is counting

## v1.7.1 — Where people come from
- Tagged links: t.me/FitterFoodBot?start=habr — the bot remembers where a new user came from
- The /stats command for the owner: new users, questionnaire, first food entry and returns after a week for every source
- Links to the bot with the tags site and github on the website and in the README

## v1.7 — Water reminders
- Water reminders: every 30 minutes, 1 hour, 1.5 hours or 2 hours — /remind or the “⏰ Reminders” button
- Adjustable start (06:00–11:00) and end of the day (20:00–24:00): the bot stays quiet at night
- Once the water goal is reached, reminders for today stop; every glass resets the timer
- A new meal card: products in a quote, the total and macros in one line, a “today” bar
- New screens in the description: the chat and the diary in the current design

## v1.6 — Habits and AI review
- A streak of days in a row with entries: in “Today”, in the diary and in achievements
- 13 achievements: first entries, streaks, days on goal, water, labels, weight; a congratulation with a 🎉 animation
- The /awards command and the “Achievements” button in the profile
- An AI weekly review: a score, a summary, what went well, what to improve and 3 tips — /analysis and a button in “Week”
- Every Sunday at 20:00 Moscow time the review arrives by itself (it can be turned off with a button)

## v1.5 — FITTER UI
- Its own monochrome FITTER UI set of 22 interface icons instead of someone else's tgiosicons
- Icons are recolored to match the Telegram theme: white in dark, black in light
- Soft fill and a uniform line width: today, week, weight, profile, help, pencil, trash, light bulb and others

## v1.4.3 — Digits and reliable icons
- Digit icons 1–4 in the FITTER style for the steps in “Help”
- Set icons are matched by order, so the FITTER logo and other icons don't get lost
- If Telegram rejects icons in quotes, the bot sends the icons without quotes; /emojierr shows the reason

## v1.4.2 — Today and help
- “Today”: a colored calorie bar, macro percentages, meals in a separate block, protein hints
- “+250 ml water”, “Week” and “Open diary” buttons under the daily summary
- Water: a blue bar of squares and percentages
- A new “Help”: steps, features and commands in neat blocks

## v1.4.1 — Week and profile
- Week: colored bars by day, the average, days on goal, the best day, water, weight and a tip
- Profile: neat blocks with your data and goal, water goal, “Log weight” and “Week” buttons
- New icons in FITTER ICONS: a ruler, a cake and a trophy

## v1.4 — New diary
- A bright green header with a big calorie ring and a week calendar
- Protein, fat and carbs cards with colored FITTER icons
- Water: a glass that fills with a wave
- Meals with icons, colored product markers and a calorie counter
- A weight chart with a fill
- Looks good in both the light and dark Telegram themes

## v1.3.1 — Effects
- Buttons in the diary spring on tap and answer with a phone vibration
- The calorie ring and the macro and water bars fill smoothly, the calorie number counts up
- Water is added instantly, a “+250” floats up above the button
- Water goal reached: a water-drop fireworks in the diary and a 🎉 animation in the chat
- Calories on goal today: fireworks at the ring once a day
- If “Reduce motion” is on in the phone, animations are turned off

## v1.3 — Water and packages
- Water tracking: a “💧 Water” button, the `/water` command, +250 and +500 ml buttons, typing “water 300”
- A water goal of 30 ml per kg of weight, water in the daily summary and in the Mini App diary
- Package photos: nutrition values are copied from the label
- Barcode lookup in the open Open Food Facts database: with a photo or digits in the chat
- Barcode check-digit validation and a cache of found products
- Two new icons in the FITTER ICONS set: a glass of water and a barcode box

## v1.2 — Style
- A new brand: **FITTER — your calorie counter 🥦** and a logo
- Own iOS-style icons in messages and on buttons
- The FITTER Icons set: plate, scales, protein, fat, carbs, diary, logo
- The `/emojipack`, `/emojiid`, `/makeemoji` commands
- If Telegram rejects the icons, the message is sent with regular emoji

## v1.1 — Accuracy and speed
- You can correct a product name: `trout 200 g`, the AI recalculates the values
- Renaming products in the Mini App diary
- Photos are processed faster: the bot remembers the working Gemini model and sends smaller photos
- A time limit: the bot no longer hangs on “Looking at the photo…”
- Cloudflare logs are on

## v1.0 — The bot
- Moved from n8n to free Cloudflare Workers
- The questionnaire and daily goal with the Mifflin–St Jeor formula
- Food recognition from a photo and from text with Google Gemini
- Fixing the portion weight with the ✏️ button
- Daily and weekly summaries, weight tracking
- The Mini App diary by day
- Answers to nutrition questions
- Automated tests

## v0.1 — Prototype
- A no-code scheme in n8n: Telegram → Gemini → Google Sheets
