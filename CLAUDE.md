# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

KDIPL / **TopDecor** B2B landing page (PVC Decor Film for membrane doors, PVC Laminates 1mm/3mm) with a password-protected admin CMS. Single-page React app at `/` plus admin SPA at `/admin`. Lead capture (sample / quote / distributor / comparison / catalogue) flows into a database and triggers Resend email notifications.

The site lives at `topdecor.in` (production sub-path `/PVC-LP1`); the admin password defaults to `kdipl@admin2025` (see `ADMIN_README.md`).

## Two backends, one frontend — read this first

The repo contains **three** FastAPI server files. Only two are live; pick the right one before editing:

| File | Status | DB | Used by |
|------|--------|----|---------|
| `api/index.py` | **Production** (Vercel serverless) | PostgreSQL (Supabase, `psycopg2`) | Vercel deploy via `vercel.json` rewrite `/api/(.*)` → `/api/index.py` |
| `backend/server.py` | Local dev / Procfile | MySQL (`databases[aiomysql]`) | `uvicorn server:app` |
| `backend/server_mongo_backup.py` | **Dead** — historical MongoDB version, do not edit | — | — |

`api/index.py` and `backend/server.py` expose the same routes and Pydantic models, but the SQL dialect, connection pooling, and table creation differ. **Any new endpoint must be added to both `api/index.py` and `backend/server.py`** if you want it to work in both environments, or the production code (`api/index.py`) at minimum. The MongoDB backup file is reference-only.

## Commands

### Frontend (`frontend/`, package manager: yarn 1.22; CRA via Craco)
```bash
cd frontend
npm install --legacy-peer-deps    # Vercel build uses --legacy-peer-deps
npm start                          # dev server on :3000 (proxies API via REACT_APP_BACKEND_URL)
npm run build                      # production build → frontend/build
npm test                           # CRA test runner
```

Dev server points to backend via `REACT_APP_BACKEND_URL` (falls back to `http://localhost:8000`). `frontend/.env.production` pins the prod URL.

### Backend — local MySQL (`backend/`)
```bash
cd backend
pip install -r requirements.txt
uvicorn server:app --reload --port 8000
```
Env vars: `DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME`, `ADMIN_PASSWORD`, `ADMIN_TOKEN_SECRET`, `RESEND_API_KEY`, `SENDER_EMAIL`, `LEAD_TO_EMAIL`, `LEAD_CC_EMAIL`, `CORS_ORIGINS`. Tables (`leads`, `cms_content`, `media`) auto-create on startup.

### Backend — Vercel/Supabase (`api/`)
The Vercel function uses psycopg2 against a Supabase pooler (`aws-1-ap-southeast-1.pooler.supabase.com`, port 6543). It maintains a single module-level connection that auto-reconnects. Hit `GET /api/health` to verify DB connectivity. Seed CMS data via authenticated `POST /api/admin/seed`.

### Tests
```bash
cd backend && pytest tests/test_kdipl_api.py    # hits BASE_URL env (live deploy by default)
```
The pytest suite is integration-style — it expects a running API at `REACT_APP_BACKEND_URL` and a known `ADMIN_PASSWORD`. There is no frontend test suite beyond CRA's default `npm test`. `tests/__init__.py` at repo root is empty.

### Lint
ESLint config lives inline in `frontend/craco.config.js` (`react-hooks/rules-of-hooks: error`, `react-hooks/exhaustive-deps: warn`). There is no `npm run lint` script — lint errors surface during `npm start`/`npm run build`.

## Architecture

### Frontend
- **Stack**: React 19 + Create React App through **Craco** + Tailwind + shadcn/ui (style `new-york`, baseColor `neutral`, components in `src/components/ui/`) + lucide-react + sonner toasts + axios.
- **Path alias**: `@/*` → `frontend/src/*` (configured in both `jsconfig.json` and Craco webpack).
- **Routes** (`src/App.js`): `/` → `pages/Landing.jsx`, `/admin` → `pages/Admin.jsx`. No other routes.
- **Landing** assembles sections from `src/components/landing/` (Header, Hero, Products, Distributors, Importers, Manufacturers, Catalog, Trust, LeadForms, Faq, Footer, WhatsAppFab). Each section that has editable copy fetches its data from the CMS on mount.
- **CMS client** (`src/lib/cms.js`): `fetchCMS(collection)` / `fetchCMSSingle(collection)` hit `GET /api/content/{collection}` with a 30-second in-memory TTL cache. After admin edits, call `clearCMSCache(collection)` so changes appear without reload. On fetch error the cache returns stale data rather than empty.
- **API client** (`src/lib/api.js`): two axios instances — `api` (public) and `adminApi` (auto-attaches `Bearer` from `localStorage["kdipl_admin_token"]`). `API` constant = `${REACT_APP_BACKEND_URL}/api`. `KDIPL` exports the hard-coded fallback brand constants (used before CMS hydrates).
- **Image URL resolution**: components define a local `resolveImg(url)` helper that rewrites `/api/media/...` paths to `${API_HOST}/api/media/...`. Repeat this pattern when surfacing CMS-uploaded images in new sections.
- **Analytics** (`src/lib/analytics.js`): GA4 + Meta Pixel, init from `REACT_APP_GA_MEASUREMENT_ID` / `REACT_APP_META_PIXEL_ID`. Separately, `public/index.html` hard-codes a Google Ads tag (`AW-17942233755`).
- **Visual edits**: `@emergentbase/visual-edits` is wrapped around the Craco config in dev only. Production builds skip it; missing module logs a warning, doesn't fail.

### Backend (both implementations)
- **Auth**: HMAC-SHA256 token (`{base64(payload)}.{base64(sig)}`), 24-hour expiry, signed with `ADMIN_TOKEN_SECRET`. `require_admin` Depends-guard wraps every `/api/admin/*` route. No JWT library — keep the `_sign` / `create_token` / `verify_token` trio in sync between `api/index.py` and `backend/server.py`.
- **Lead flow**: `POST /api/leads` (JSON) or `POST /api/leads/comparison` (multipart, accepts a file ≤10MB). Both insert into `leads` (id, type, status, created_at, JSON `data`) and fire an async Resend email. Missing `RESEND_API_KEY` logs and skips silently — never raises.
- **CMS**: `cms_content` table keyed by `(id, collection, sort_order, data)`. Collections are whitelisted in `CMS_COLLECTIONS` (`branding, hero, products, categories, audience, trust, faq, testimonials, seo_settings, contact`) — adding a new collection requires editing this list in **both** server files plus the admin UI. `POST /api/admin/seed` is idempotent (seeds only empty collections).
- **Media**: `POST /api/admin/media/upload` stores originals + (optionally) WebP copies in `backend/uploads/media/`, served from `GET /api/media/{filename}`. Vercel's filesystem is ephemeral, so production media uploads behave differently than local — assume images are stored as URLs in CMS docs rather than as durable server files.
- **CORS**: `CORS_ORIGINS` env var, comma-separated. Defaults to `*`.

### Deployment (`vercel.json`)
- Builds `frontend/` (with `--legacy-peer-deps`) and serves `frontend/build` as static.
- Rewrites: `/api/(.*)` → `api/index.py`; `/PVC-LP1/(.*)` → `/PVC-LP1/index.html`; everything else → `/index.html` (SPA fallback).
- Procfile (`backend/Procfile`) targets Heroku-style hosts but is **not** the production runtime — Vercel serverless is.

## Conventions

- **Sharp corners, 1px borders, slate-900 + orange-600**: the design language is "Swiss industrial" (see `design_guidelines.json`). Avoid `rounded-*` beyond what shadcn defaults dictate; section spacing is `py-20 sm:py-32`; overlines use `tracking-[0.2em] uppercase`.
- **`data-testid` everywhere** that user actions or content matter (`admin-login-page`, `admin-password-input`, `landing-page`, etc.) — preserve these when refactoring; the test suite and any future Playwright runs rely on them.
- **Admin no-index**: every admin view renders `<meta name="robots" content="noindex, nofollow">`, and `/admin` is blocked in `public/robots.txt`. Keep both when touching admin routes.
- **Component placement**: shadcn primitives in `src/components/ui/` (do not hand-edit; regenerate via `npx shadcn` if the CLI is available — `components.json` declares aliases). Landing sections in `src/components/landing/`. Admin pieces in `src/components/admin/` (`AdminLayout`, `ContentEditor`, `MediaLibrary`).
- **Frontend talks to backend only through `src/lib/api.js`** — don't `import axios from "axios"` directly in components; use `api` / `adminApi` so the base URL and auth headers stay consistent.
- **CMS edits**: after a successful admin save, always `clearCMSCache(collection)` so the landing page re-fetches on next visit instead of showing stale 30-second cached data.

## Operational state (per `memory/PRD.md` and `test_result.md`)

- `test_result.md` is a **protocol file** between agents (main + testing). It has a "DO NOT EDIT OR REMOVE" header block; the yaml structure below it tracks task status. If you implement or test something significant, append a status entry rather than rewriting.
- `memory/PRD.md` is the canonical product spec / backlog. Outdated entries reference MongoDB — production has since migrated to Supabase Postgres (`api/index.py`). Treat the architecture section as historical, the user personas and backlog as current.
- `ADMIN_README.md` documents the admin panel for end-users; `README.md` is a placeholder ("Here are your Instructions").
