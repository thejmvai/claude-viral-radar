# Setup — Telegram digest

Get a Viral Radar digest pushed to your phone after every run. One-time setup, ~3 minutes. Optional —
if you skip it, the radar still runs and writes the HTML report; it just won't message you.

## 1. Create a bot and get the token
1. In Telegram, open a chat with **@BotFather**.
2. Send `/newbot`, then follow the prompts (give it a name and a username ending in `bot`).
3. BotFather replies with a token like `123456789:AAExampleTokenStringHere`. That's your
   `TELEGRAM_BOT_TOKEN`. Keep it secret.

## 2. Get your chat id
1. Open a chat with **your new bot** and send it any message (e.g. `hi`). This is required — a bot can't
   message you until you message it first.
2. In a browser, open (replace `<TOKEN>`):
   `https://api.telegram.org/bot<TOKEN>/getUpdates`
3. Find `"chat":{"id":123456789,...}` in the JSON. That number is your `TELEGRAM_CHAT_ID`.
   - No `result` yet? Send your bot another message and refresh.
   - For a group/channel digest instead of a DM, add the bot to it, post a message there, and use that
     chat's id (group ids are negative, e.g. `-100...`).

## 3. Store the credentials
Create `.claude/viral-radar.env` in your project (the same folder you run `/viral-radar` from). This file
is gitignored — never commit it.

```
TELEGRAM_BOT_TOKEN=123456789:AAExampleTokenStringHere
TELEGRAM_CHAT_ID=123456789
```

(There's a template at `skills/viral-radar/.env.example`.) The credentials are also picked up from real
environment variables or `~/.config/viral-radar/.env` if you prefer.

## 4. Test it
```
# Preview the digest without sending:
node skills/viral-radar/scripts/notify-telegram.mjs --niche=<niche> --dry-run

# Send it for real (needs the credentials above):
node skills/viral-radar/scripts/notify-telegram.mjs --niche=<niche>
```
A success prints `Telegram digest sent (message_id …)` and the message lands in your Telegram chat.

## Troubleshooting
- **`chat not found`** — you used the wrong `TELEGRAM_CHAT_ID`, or you never messaged the bot first (step 2.1).
- **`Unauthorized`** — the `TELEGRAM_BOT_TOKEN` is wrong or has a stray space.
- **No message but exit 0** — credentials weren't found, so it only printed the digest. Check the file path
  and variable names.

## What gets sent
Run date, the top reels by rank (tappable to the reel), per-channel coverage, and the top "Hot across the
niche" cross-platform items. See `workflows/telegram-digest.md` for the exact layout.
