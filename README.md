# Telegram Profile Mini App

Telegram bot and Mini App for showing profile fields Telegram makes available to the bot. Phone number, location, and permission to message are requested separately; declining is always allowed.

## Run locally

1. Install Node.js 18 or newer.
2. Install dependencies with `npm install`.
3. Keep the existing `.env` private and add `WEB_APP_URL` with the public HTTPS address where this app will be hosted. `.env.example` lists the required variables.
4. Start the service with `npm start`, or use `npm run dev` during development.
5. In BotFather, configure the bot's Mini App domain and use `/start` to open the app.

Telegram does not open a Mini App hosted at `localhost`. A public HTTPS deployment is required. For continuous operation, deploy to a Node.js host that keeps the process running and restarts it after failures. The service listens on `PORT` and exposes `/health` for host health checks.

## Supabase setup

1. In the Supabase Dashboard, open **SQL Editor** and run [`supabase/schema.sql`](supabase/schema.sql). The table has Row Level Security enabled and no browser-accessible policies.
2. In **Project Settings -> API Keys**, copy the Project URL and create a server-side Secret key. A legacy `service_role` key can also be used.
3. Set `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in the private `.env` on the Node host. `SUPABASE_ANON_KEY` is not used for profile writes. Never put a Secret/service-role key in frontend code or commit it.
4. Restart the Node service. Both `/start` and a verified Mini App profile request will upsert the user's basic Telegram profile into `telegram_profiles`. The Mini App API response reports whether the Supabase write succeeded.

The database stores only Telegram profile fields and last-seen metadata. Phone numbers and precise locations are not stored. The Node API must be deployed and `/api/*` must route to it; hosting the static `public/` directory alone is not enough.

## Data and consent

- Profile identity, username, language, and the Premium flag come from signed Telegram `initData`. The server verifies the signature and rejects expired data.
- Profile photos are fetched through the Bot API. Telegram may not make them available to the bot. Image URLs are temporary and the bot token is never sent to the browser.
- The phone number is stored in server memory for up to 30 minutes after Telegram sends the user's own contact to the bot. It is not written to a database.
- Location is requested by Telegram and kept in the Mini App page only. It is not sent to this server.
- Telegram does not provide a complete private account record to bots. Email, private messages, contacts, and other hidden account information are not available through this app.

For production, use a managed process host with HTTPS, configure log retention and access controls, and avoid sharing `.env` or bot tokens.