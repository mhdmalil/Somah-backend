# SOMAHLAND Backend

Node.js + TypeScript Express API for the SOMAHLAND auto-parts storefront.

## Setup

1. Copy `.env.example` → `.env` and fill values (JWT secrets required).
2. In Supabase SQL editor, run `schema.sql` (**destructive** for SOMAHLAND retail tables). Backup first.
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

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | API with hot reload |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled server |
| `npm run typecheck` | `tsc --noEmit` |

## Note on secrets

Never commit `.env`. If an old `.env` was previously pushed to git history, rotate the Supabase service role key.
