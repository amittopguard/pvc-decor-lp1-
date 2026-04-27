# KDIPL — PVC Decor Film & Laminates — B2B Landing Page

## Original Problem Statement
KDIPL manufactures PVC Decor Film for PVC membrane doors (vacuum press process) and is launching PVC Laminates 1mm & 3mm for acrylic sheets. Target audiences in priority order:
1. Prospect Distributors
2. Importers ("stop importing — buy from us")
3. Manufacturers who consume the film

User asked for guidance and flow of a landing page.

## Architecture
- **Backend**: FastAPI + MongoDB (motor), Pydantic models, HMAC-SHA256 admin tokens, Resend email (graceful skip when key missing).
- **Frontend**: React 19 + Tailwind + shadcn/ui + lucide-react. Routes: `/` (Landing), `/admin` (Admin). sonner for toasts.
- **Design**: Swiss industrial B2B — Space Grotesk + IBM Plex Sans, slate-900 + orange-600, sharp corners, 1px borders.
- **Database**: MongoDB collection `leads` in DB `kdipl_leads`.

## User Personas
1. **Distributor prospect** — existing trader in plywood/laminate/hardware wanting territory + margins.
2. **Importer** — currently importing PVC films; open to local India supply for cost/lead-time savings.
3. **Manufacturer** — door/furniture maker needing consistent supply of film/laminate.
4. **Admin (KDIPL internal)** — manages incoming leads via password-protected panel.

## Core Requirements
- Multi-type lead capture: Sample / Quote / Distributor (tabs in one form).
- Contact: WhatsApp +91 93113 42988, sales@kdipl.in (CC nm@kdipl.in).
- Downloadable catalog CTA (currently routes to WhatsApp; PDF upload pending).
- "Why us vs imports" comparison table.
- Product catalog grid (8 textures — Wood / Marble / Solid).
- FAQ, footer, floating WhatsApp button.
- Admin panel: login, stats, filter by type/status, search, status update, delete, CSV export.
- Email notifications on each lead (Resend — pending API key).

## What's Been Implemented (2025-12)
- Full landing page with 10 sections (Hero, Products, Distributors, Importers+comparison, Manufacturers, Catalog, Trust/Process, Lead Forms, FAQ, Footer).
- WhatsApp FAB (chat on WhatsApp).
- Multi-tab lead form with conditional fields (quote → quantity; distributor → territory, experience, volume).
- Admin panel `/admin` — login, dashboard with stats cards, leads table (filter, search, inline status update, delete), View detail dialog, CSV export, logout.
- Backend endpoints: POST /api/leads, POST /api/admin/login, GET /api/admin/verify, GET /api/admin/stats, GET/PATCH/DELETE /api/admin/leads, GET /api/admin/leads/export.csv.
- Resend integration wired (graceful skip when RESEND_API_KEY empty).
- Tests: 24/24 backend pytest + full frontend Playwright = 100% pass.

## Prioritized Backlog
### P0 (before launch)
- [ ] Add real Resend API key + verify kdipl.in domain in Resend dashboard to enable email notifications.
- [ ] Replace KDIPL placeholder logo with actual logo.
- [ ] Upload real PDF catalog and link from "Download Full Catalog" button.
- [ ] Replace stock catalog images with real product textures.
- [ ] Add rate-limit / hCaptcha to public /api/leads to prevent form spam.

### P1
- [ ] Add certifications / client-logo strip (ISO, major brands).
- [ ] Multi-language support (English + Hindi minimum, Arabic for export markets).
- [ ] Admin: bulk status update, archive view, email lead directly from row.
- [ ] Add Google Analytics / Meta Pixel + conversion event on form submit.
- [ ] Add product deep pages (Decor Film, Laminate 1mm, Laminate 3mm) with SEO meta.

### P2
- [ ] Distributor portal with price lists behind login.
- [ ] CRM integration (Zoho / HubSpot) for leads push.
- [ ] Live inventory / sample availability.

## Credentials / Env
- Admin password: in `/app/memory/test_credentials.md` (`kdipl@admin2025`)
- Change `ADMIN_PASSWORD` in `/app/backend/.env` for production.

## Next Tasks
See Backlog → P0.
