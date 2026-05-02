# TopDecor Admin Panel — README

## Login
- Navigate to `http://localhost:3002/admin`
- Enter the admin password (configured via `ADMIN_PASSWORD` env var, default: `kdipl@admin2025`)

## First-Time Setup
1. Start the backend: `cd backend && uvicorn server:app --reload --port 8000`
2. After logging in, click the **Seed CMS** button (database icon) in the Leads toolbar to populate default content

## Changing Admin Password
Set the `ADMIN_PASSWORD` environment variable in `backend/.env`:
```
ADMIN_PASSWORD=your-new-secure-password
```

## Admin Modules
| Module | Description |
|--------|-------------|
| **Leads / Forms** | View, filter, export (CSV) all form submissions |
| **Logo & Branding** | Edit brand name, tagline, logo/favicon/OG image URLs |
| **Hero Section** | Edit headline, sub-headline, CTAs |
| **Products** | CRUD product cards with category, specs, images |
| **Categories** | Manage product category list |
| **Audience Tiles** | Edit distributor/importer/manufacturer tiles |
| **Process & Trust** | Manage trust/process steps |
| **FAQ** | Manage Q&A (auto-updates JSON-LD schema) |
| **Testimonials** | Manage client quotes and ratings |
| **SEO Settings** | Edit title, meta description, OG tags, canonical |
| **Contact / CTA** | Edit phone, email, WhatsApp, address |
| **Media Library** | Upload images (drag-and-drop), auto-webp conversion |

## Database Backup
The CMS uses MongoDB. Back up with:
```bash
mongodump --db=YOUR_DB_NAME --out=./backup/$(date +%Y%m%d)
```
Restore:
```bash
mongorestore --db=YOUR_DB_NAME ./backup/YYYYMMDD/YOUR_DB_NAME
```

## Environment Variables
| Variable | Description | Default |
|----------|-------------|---------|
| `MONGO_URL` | MongoDB connection string | Required |
| `DB_NAME` | Database name | Required |
| `ADMIN_PASSWORD` | Admin login password | `kdipl@admin2025` |
| `ADMIN_TOKEN_SECRET` | JWT signing secret | `change-me` |
| `RESEND_API_KEY` | Email API key | Optional |
| `CORS_ORIGINS` | Allowed origins | `*` |

## Security
- All `/admin` routes require authentication (JWT token)
- `/admin` blocked in `robots.txt`
- Admin pages include `<meta name="robots" content="noindex, nofollow">`
- Tokens expire after 24 hours
