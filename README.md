# SOMAHLAND Backend

Node.js + TypeScript Express API for the SOMAHLAND auto-parts storefront.

## Setup

1. Copy `.env.example` → `.env` and fill values (JWT secrets required).
2. In Supabase SQL editor, run `schema.sql` (**destructive** — wipes legacy marketplace tables).
3. Install and run:

```bash
npm install
npm run dev
```

API default: `http://localhost:3001`

## Admin bootstrap

Set in `.env`:

```text
ADMIN_EMAIL=you@example.com
ADMIN_PASSWORD=long-secure-password
ADMIN_NAME=SOMAHLAND Admin
```

On first start, if `admins` is empty, this creates the first admin.

## Telegram

Set a **new** `TELEGRAM_BOT_TOKEN` (do not reuse any old marketplace bot).  
Optionally set `TELEGRAM_CHAT_ID`, or add the bot to a group and send a message so it can capture the chat ID.

Order create → `telegram_notifications` outbox → poller/send.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | API with hot reload |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled server |
| `npm run bot` | Telegram poller (if run separately) |
| `npm run typecheck` | `tsc --noEmit` |

## Note on secrets

Never commit `.env`. If an old `.env` was previously pushed to git history, rotate Supabase service role and Telegram tokens.
