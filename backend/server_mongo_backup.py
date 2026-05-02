from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header, Query, UploadFile, File, Form
from fastapi.responses import StreamingResponse, FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import io
import csv
import hmac
import hashlib
import base64
import asyncio
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Literal
import uuid
from datetime import datetime, timezone, timedelta

import resend

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'kdipl@admin2025')
ADMIN_SECRET = os.environ.get('ADMIN_TOKEN_SECRET', 'change-me')
RESEND_KEY = os.environ.get('RESEND_API_KEY', '').strip()
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev')
LEAD_TO_EMAIL = os.environ.get('LEAD_TO_EMAIL', 'sales@kdipl.in')
LEAD_CC_EMAIL = os.environ.get('LEAD_CC_EMAIL', '')

UPLOAD_DIR = ROOT_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)
MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB
ALLOWED_UPLOAD_EXT = {".pdf", ".jpg", ".jpeg", ".png", ".webp", ".xlsx", ".xls", ".csv", ".doc", ".docx"}

if RESEND_KEY:
    resend.api_key = RESEND_KEY

app = FastAPI(title="KDIPL Leads API")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# --------- Models ---------
LeadType = Literal["sample", "quote", "distributor", "comparison"]
LeadStatus = Literal["new", "contacted", "qualified", "closed", "spam"]


class FileMeta(BaseModel):
    filename: str
    stored: str
    size: int
    content_type: Optional[str] = None


class LeadIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    type: LeadType
    name: str = Field(min_length=2, max_length=120)
    company: Optional[str] = Field(default=None, max_length=180)
    email: EmailStr
    phone: str = Field(min_length=5, max_length=40)
    country: Optional[str] = Field(default=None, max_length=80)
    city: Optional[str] = Field(default=None, max_length=80)
    product_interest: Optional[str] = Field(default=None, max_length=180)
    quantity: Optional[str] = Field(default=None, max_length=80)
    territory: Optional[str] = Field(default=None, max_length=120)
    experience_years: Optional[str] = Field(default=None, max_length=40)
    expected_volume: Optional[str] = Field(default=None, max_length=120)
    current_supplier: Optional[str] = Field(default=None, max_length=180)
    monthly_volume_sqm: Optional[str] = Field(default=None, max_length=80)
    message: Optional[str] = Field(default=None, max_length=2000)


class Lead(LeadIn):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    status: LeadStatus = "new"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    file_meta: Optional[FileMeta] = None


class LeadStatusUpdate(BaseModel):
    status: LeadStatus


class AdminLogin(BaseModel):
    password: str


# --------- Auth Helpers ---------
def _sign(payload: str) -> str:
    sig = hmac.new(ADMIN_SECRET.encode(), payload.encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(sig).decode().rstrip("=")


def create_token(hours: int = 24) -> str:
    exp = int((datetime.now(timezone.utc) + timedelta(hours=hours)).timestamp())
    payload = f"admin:{exp}"
    return f"{base64.urlsafe_b64encode(payload.encode()).decode().rstrip('=')}.{_sign(payload)}"


def verify_token(token: str) -> bool:
    try:
        body, sig = token.split(".")
        padded = body + "=" * (-len(body) % 4)
        payload = base64.urlsafe_b64decode(padded.encode()).decode()
        if _sign(payload) != sig:
            return False
        _, exp = payload.split(":")
        return int(exp) > int(datetime.now(timezone.utc).timestamp())
    except Exception:
        return False


async def require_admin(authorization: Optional[str] = Header(default=None)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    if not verify_token(authorization.split(" ", 1)[1]):
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return True


# --------- Email ---------
def _build_email_html(lead: Lead) -> str:
    rows = []
    for field, label in [
        ("type", "Lead Type"), ("name", "Name"), ("company", "Company"),
        ("email", "Email"), ("phone", "Phone"), ("country", "Country"),
        ("city", "City"), ("product_interest", "Product Interest"),
        ("quantity", "Quantity"), ("territory", "Territory"),
        ("experience_years", "Experience"), ("expected_volume", "Expected Volume"),
        ("message", "Message"),
    ]:
        val = getattr(lead, field, None)
        if val:
            rows.append(
                f'<tr><td style="padding:8px 12px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:600;color:#0f172a;width:180px;">{label}</td>'
                f'<td style="padding:8px 12px;border:1px solid #e2e8f0;color:#334155;">{val}</td></tr>'
            )
    return (
        '<div style="font-family:Arial,sans-serif;background:#f1f5f9;padding:24px;">'
        '<div style="max-width:640px;margin:auto;background:#ffffff;border:1px solid #e2e8f0;">'
        '<div style="padding:20px 28px;background:#0f172a;color:#ffffff;">'
        f'<div style="font-size:12px;letter-spacing:3px;color:#f97316;font-weight:700;">KDIPL &middot; NEW LEAD</div>'
        f'<div style="font-size:22px;font-weight:800;margin-top:6px;">{lead.type.upper()} &mdash; {lead.name}</div>'
        '</div>'
        f'<table style="width:100%;border-collapse:collapse;">{"".join(rows)}</table>'
        '<div style="padding:14px 28px;color:#64748b;font-size:12px;border-top:1px solid #e2e8f0;">'
        f'Submitted: {lead.created_at.isoformat()} UTC &nbsp;|&nbsp; Lead ID: {lead.id}'
        '</div></div></div>'
    )


async def send_lead_email(lead: Lead):
    if not RESEND_KEY:
        logger.info("RESEND_API_KEY not set — skipping email for lead %s", lead.id)
        return
    try:
        params = {
            "from": f"KDIPL Leads <{SENDER_EMAIL}>",
            "to": [LEAD_TO_EMAIL],
            "subject": f"[KDIPL] New {lead.type} lead — {lead.name}" + (f" ({lead.company})" if lead.company else ""),
            "html": _build_email_html(lead),
            "reply_to": lead.email,
        }
        if LEAD_CC_EMAIL:
            params["cc"] = [LEAD_CC_EMAIL]
        await asyncio.to_thread(resend.Emails.send, params)
        logger.info("Email sent for lead %s", lead.id)
    except Exception as e:
        logger.error("Email send failed for lead %s: %s", lead.id, str(e))


# --------- Public Routes ---------
@api_router.get("/")
async def root():
    return {"service": "KDIPL Leads API", "status": "ok"}


@api_router.post("/leads", response_model=Lead)
async def create_lead(payload: LeadIn):
    lead = Lead(**payload.model_dump())
    doc = lead.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.leads.insert_one(doc)
    # Fire and forget email
    asyncio.create_task(send_lead_email(lead))
    return lead


@api_router.post("/leads/comparison", response_model=Lead)
async def create_comparison_lead(
    name: str = Form(...),
    email: EmailStr = Form(...),
    phone: str = Form(...),
    company: Optional[str] = Form(None),
    country: Optional[str] = Form(None),
    city: Optional[str] = Form(None),
    current_supplier: Optional[str] = Form(None),
    monthly_volume_sqm: Optional[str] = Form(None),
    product_interest: Optional[str] = Form(None),
    message: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
):
    file_meta = None
    if file is not None and file.filename:
        ext = Path(file.filename).suffix.lower()
        if ext not in ALLOWED_UPLOAD_EXT:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")
        contents = await file.read()
        if len(contents) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=400, detail="File exceeds 10MB limit")
        if not contents:
            raise HTTPException(status_code=400, detail="Empty file uploaded")
        stored_name = f"{uuid.uuid4().hex}{ext}"
        target = UPLOAD_DIR / stored_name
        target.write_bytes(contents)
        file_meta = FileMeta(
            filename=file.filename,
            stored=stored_name,
            size=len(contents),
            content_type=file.content_type,
        )

    lead = Lead(
        type="comparison",
        name=name, email=email, phone=phone, company=company,
        country=country, city=city,
        current_supplier=current_supplier, monthly_volume_sqm=monthly_volume_sqm,
        product_interest=product_interest, message=message,
        file_meta=file_meta,
    )
    doc = lead.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.leads.insert_one(doc)
    asyncio.create_task(send_lead_email(lead))
    return lead


# --------- Admin Routes ---------
@api_router.post("/admin/login")
async def admin_login(body: AdminLogin):
    if body.password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid password")
    return {"token": create_token(), "expires_in_hours": 24}


@api_router.get("/admin/verify")
async def admin_verify(_: bool = Depends(require_admin)):
    return {"ok": True}


@api_router.get("/admin/stats")
async def admin_stats(_: bool = Depends(require_admin)):
    total = await db.leads.count_documents({})
    by_type = {}
    by_status = {}
    for t in ["sample", "quote", "distributor", "comparison"]:
        by_type[t] = await db.leads.count_documents({"type": t})
    for s in ["new", "contacted", "qualified", "closed", "spam"]:
        by_status[s] = await db.leads.count_documents({"status": s})
    return {"total": total, "by_type": by_type, "by_status": by_status}


@api_router.get("/admin/leads")
async def admin_list_leads(
    _: bool = Depends(require_admin),
    type: Optional[LeadType] = None,
    status: Optional[LeadStatus] = None,
    q: Optional[str] = None,
    limit: int = Query(200, le=1000),
):
    query: dict = {}
    if type:
        query["type"] = type
    if status:
        query["status"] = status
    if q:
        rx = {"$regex": q, "$options": "i"}
        query["$or"] = [{"name": rx}, {"company": rx}, {"email": rx}, {"phone": rx}, {"country": rx}]
    cursor = db.leads.find(query, {"_id": 0}).sort("created_at", -1).limit(limit)
    leads = await cursor.to_list(length=limit)
    return {"items": leads, "count": len(leads)}


@api_router.patch("/admin/leads/{lead_id}")
async def admin_update_lead(lead_id: str, body: LeadStatusUpdate, _: bool = Depends(require_admin)):
    result = await db.leads.update_one({"id": lead_id}, {"$set": {"status": body.status}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found")
    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    return lead


@api_router.delete("/admin/leads/{lead_id}")
async def admin_delete_lead(lead_id: str, _: bool = Depends(require_admin)):
    result = await db.leads.delete_one({"id": lead_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found")
    return {"ok": True}


@api_router.get("/admin/leads/export.csv")
async def admin_export_csv(_: bool = Depends(require_admin)):
    cursor = db.leads.find({}, {"_id": 0}).sort("created_at", -1)
    leads = await cursor.to_list(length=5000)
    buf = io.StringIO()
    fields = [
        "created_at", "type", "status", "name", "company", "email", "phone",
        "country", "city", "product_interest", "quantity", "territory",
        "experience_years", "expected_volume", "current_supplier",
        "monthly_volume_sqm", "message", "id",
    ]
    writer = csv.DictWriter(buf, fieldnames=fields, extrasaction="ignore")
    writer.writeheader()
    for lead in leads:
        writer.writerow(lead)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="kdipl-leads-{datetime.now(timezone.utc).strftime("%Y%m%d")}.csv"'},
    )


@api_router.get("/admin/leads/{lead_id}/file")
async def admin_download_lead_file(lead_id: str, _: bool = Depends(require_admin)):
    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    fm = lead.get("file_meta")
    if not fm or not fm.get("stored"):
        raise HTTPException(status_code=404, detail="No file attached")
    path = UPLOAD_DIR / fm["stored"]
    if not path.exists():
        raise HTTPException(status_code=404, detail="File missing on disk")
    return FileResponse(
        path,
        filename=fm.get("filename") or fm["stored"],
        media_type=fm.get("content_type") or "application/octet-stream",
    )


# --------- CMS Content Routes ---------
CMS_COLLECTIONS = [
    "branding", "hero", "products", "categories", "audience",
    "trust", "faq", "testimonials", "seo_settings", "contact",
]

# Public: fetch content (no auth)
@api_router.get("/content/{collection}")
async def get_content(collection: str):
    if collection not in CMS_COLLECTIONS:
        raise HTTPException(status_code=404, detail="Unknown collection")
    items = await db[f"cms_{collection}"].find({}, {"_id": 0}).sort("sort_order", 1).to_list(500)
    return {"items": items}


# Admin: list content
@api_router.get("/admin/content/{collection}")
async def admin_list_content(collection: str, _: bool = Depends(require_admin)):
    if collection not in CMS_COLLECTIONS:
        raise HTTPException(status_code=404, detail="Unknown collection")
    items = await db[f"cms_{collection}"].find({}, {"_id": 0}).sort("sort_order", 1).to_list(500)
    return {"items": items}


# Flexible create/update using raw body
from starlette.requests import Request as StarletteRequest
import json as json_lib

@api_router.post("/admin/content/{collection}/item")
async def admin_create_item(collection: str, request: StarletteRequest, _: bool = Depends(require_admin)):
    if collection not in CMS_COLLECTIONS:
        raise HTTPException(status_code=404, detail="Unknown collection")
    body = await request.json()
    item_id = body.get("id") or str(uuid.uuid4())
    body["id"] = item_id
    if "sort_order" not in body:
        count = await db[f"cms_{collection}"].count_documents({})
        body["sort_order"] = count
    body["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db[f"cms_{collection}"].insert_one({**body, "_id": item_id})
    return {"ok": True, "id": item_id}


@api_router.put("/admin/content/{collection}/item/{item_id}")
async def admin_update_item(collection: str, item_id: str, request: StarletteRequest, _: bool = Depends(require_admin)):
    if collection not in CMS_COLLECTIONS:
        raise HTTPException(status_code=404, detail="Unknown collection")
    body = await request.json()
    body["updated_at"] = datetime.now(timezone.utc).isoformat()
    body.pop("_id", None)
    result = await db[f"cms_{collection}"].update_one({"id": item_id}, {"$set": body})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"ok": True}


@api_router.delete("/admin/content/{collection}/item/{item_id}")
async def admin_delete_item(collection: str, item_id: str, _: bool = Depends(require_admin)):
    if collection not in CMS_COLLECTIONS:
        raise HTTPException(status_code=404, detail="Unknown collection")
    result = await db[f"cms_{collection}"].delete_one({"id": item_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"ok": True}


@api_router.put("/admin/content/{collection}/reorder")
async def admin_reorder(collection: str, request: StarletteRequest, _: bool = Depends(require_admin)):
    if collection not in CMS_COLLECTIONS:
        raise HTTPException(status_code=404, detail="Unknown collection")
    body = await request.json()
    ids = body.get("ids", [])
    for i, item_id in enumerate(ids):
        await db[f"cms_{collection}"].update_one({"id": item_id}, {"$set": {"sort_order": i}})
    return {"ok": True}


# --------- Media Library ---------
MEDIA_DIR = ROOT_DIR / "uploads" / "media"
MEDIA_DIR.mkdir(parents=True, exist_ok=True)

@api_router.post("/admin/media/upload")
async def admin_upload_media(file: UploadFile = File(...), _: bool = Depends(require_admin)):
    ext = Path(file.filename).suffix.lower()
    allowed = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"}
    if ext not in allowed:
        raise HTTPException(status_code=400, detail=f"Unsupported: {ext}")
    contents = await file.read()
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="File exceeds 10MB")

    file_id = uuid.uuid4().hex
    orig_name = f"{file_id}{ext}"
    orig_path = MEDIA_DIR / orig_name
    orig_path.write_bytes(contents)

    # Try webp conversion
    webp_url = None
    try:
        from PIL import Image as PILImage
        if ext in {".jpg", ".jpeg", ".png"}:
            img = PILImage.open(io.BytesIO(contents))
            webp_name = f"{file_id}.webp"
            webp_path = MEDIA_DIR / webp_name
            img.save(str(webp_path), "WEBP", quality=82)
            webp_url = f"/api/media/{webp_name}"
    except ImportError:
        pass  # Pillow not installed, skip webp
    except Exception as e:
        logger.warning("WebP conversion failed: %s", e)

    media_doc = {
        "id": file_id,
        "filename": file.filename,
        "stored": orig_name,
        "size": len(contents),
        "content_type": file.content_type,
        "url": f"/api/media/{orig_name}",
        "webp_url": webp_url,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.media.insert_one({**media_doc, "_id": file_id})
    return media_doc


@api_router.get("/admin/media")
async def admin_list_media(_: bool = Depends(require_admin)):
    items = await db.media.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return {"items": items}


@api_router.delete("/admin/media/{media_id}")
async def admin_delete_media(media_id: str, _: bool = Depends(require_admin)):
    doc = await db.media.find_one({"id": media_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    for key in ["stored"]:
        p = MEDIA_DIR / doc.get(key, "")
        if p.exists():
            p.unlink()
    # Also delete webp
    webp_p = MEDIA_DIR / f"{media_id}.webp"
    if webp_p.exists():
        webp_p.unlink()
    await db.media.delete_one({"id": media_id})
    return {"ok": True}


# Serve media files (public)
@api_router.get("/media/{filename}")
async def serve_media(filename: str):
    path = MEDIA_DIR / filename
    if not path.exists():
        raise HTTPException(status_code=404)
    ct = "image/webp" if filename.endswith(".webp") else "application/octet-stream"
    return FileResponse(path, media_type=ct)


# --------- Seed Default Content ---------
@api_router.post("/admin/seed")
async def admin_seed(_: bool = Depends(require_admin)):
    """Seed CMS collections with default content from the hardcoded landing page data."""
    seeded = []

    # Only seed if collection is empty
    async def seed_if_empty(name, items):
        count = await db[f"cms_{name}"].count_documents({})
        if count == 0:
            for i, item in enumerate(items):
                item["id"] = item.get("id") or str(uuid.uuid4())
                item["sort_order"] = i
                item["updated_at"] = datetime.now(timezone.utc).isoformat()
                await db[f"cms_{name}"].insert_one({**item, "_id": item["id"]})
            seeded.append(name)

    await seed_if_empty("branding", [{"brand_name": "TopDecor", "legal_name": "Kiana Decor India Pvt Ltd", "tagline": "Sajao Bharat, Badhao Bharat", "logo_url": "/logo.png", "favicon_url": "/favicon.png", "og_image_url": "/og-image.jpg"}])
    await seed_if_empty("hero", [{"headline": "Imports are slow.", "sub_headline": "And expensive. And, honestly — OPTIONAL.", "twist_line": "OPTIONAL.", "description": "We press PVC Decor Film for membrane doors and now PVC Laminates 1 mm & 3 mm for acrylic sheets.", "cta_text": "Get a Free Sample Box", "cta_link": "#contact", "cta2_text": "Beat My Import Price", "image_url": ""}])
    await seed_if_empty("products", [
        {"name": "PVC Decor Film", "category": "Membrane Door", "tag": "Flagship", "subtitle": "For PVC Membrane Doors", "process": "Vacuum Press Process", "points": "3D wrap ready|Scratch & moisture resistant|Wide design library|Custom print runs", "image": "/images/pvc-decor-film.jpg", "active": True},
        {"name": "PVC Laminate 1 mm", "category": "Acrylic", "tag": "New Launch", "subtitle": "For Acrylic Sheets & Panels", "process": "Pressed & Polished", "points": "High-gloss finish|UV stable|Easy to fabricate|Uniform thickness", "image": "/images/walnut-texture.jpg", "active": True},
        {"name": "PVC Laminate 3 mm", "category": "Laminates", "tag": "New Launch", "subtitle": "Rigid Decorative Sheets", "process": "Pressed & Polished", "points": "Structural thickness|Textured & solid ranges|Cut-to-size|Contract pricing", "image": "/images/marble-texture.jpg", "active": True},
    ])
    await seed_if_empty("categories", [
        {"name": "Membrane Door"}, {"name": "Furniture"}, {"name": "Wall Panels"}, {"name": "Acrylic"}, {"name": "Laminates"},
    ])
    await seed_if_empty("audience", [
        {"audience_id": "distributors", "label": "Distributor", "icon": "Truck", "target": "#distributors"},
        {"audience_id": "importers", "label": "Importer", "icon": "Globe", "target": "#importers"},
        {"audience_id": "manufacturers", "label": "Manufacturer", "icon": "Factory", "target": "#manufacturers"},
    ])
    await seed_if_empty("trust", [
        {"step": "01", "title": "Raw Material QC", "body": "Sourced PVC and additives tested for tensile, gloss and colour stability."},
        {"step": "02", "title": "Printing & Coating", "body": "High-definition texture printing with protective top coats for durability."},
        {"step": "03", "title": "Vacuum Press / Lamination", "body": "Industrial presses for films; precision pressing for 1mm & 3mm laminates."},
        {"step": "04", "title": "Inspection & Dispatch", "body": "Batch-wise QC, roll/sheet labelling, and secure freight-ready packaging."},
    ])
    await seed_if_empty("faq", [
        {"q": "What is the MOQ for importers and distributors?", "a": "We work with flexible MOQs — much lower than container-load imports. Exact MOQ depends on product and customization."},
        {"q": "Do you ship internationally?", "a": "Yes. We ship to ports worldwide. Typical lead time from PO to dispatch is 5–15 days."},
        {"q": "Can I get custom designs or private-label prints?", "a": "Absolutely. Private label and custom prints are available above a minimum order."},
        {"q": "How do I become a KDIPL distributor?", "a": "Fill the Distributor Application tab in the contact form. Our team reviews within 24 hours."},
        {"q": "Are samples free?", "a": "Yes, a physical sample box is free for serious enquiries in India."},
        {"q": "What applications are 1mm and 3mm PVC laminates used for?", "a": "1mm is bonded with acrylic sheets for cabinet shutters; 3mm is used as rigid decorative panelling."},
    ])
    await seed_if_empty("testimonials", [
        {"quote": "We switched from a Chinese supplier to KDIPL last year. Lead time dropped from 45 days to under a week.", "name": "R. Sundaresan", "role": "Production Head", "company": "Door Manufacturer · Tamil Nadu", "audience": "Manufacturer", "rating": 5},
        {"quote": "Started as a regional distributor three years ago. Today my territory does 4× the volume I planned.", "name": "Vikas Mehta", "role": "Founder", "company": "Plywood & Laminate Distributor · Pune", "audience": "Distributor", "rating": 5},
    ])
    await seed_if_empty("seo_settings", [{"title": "TopDecor — PVC Decor Film for Membrane Doors | Manufacturer in India", "description": "TopDecor manufactures PVC Decor Film, Acrylic Sheets and Laminate Wall Panels for membrane doors and furniture in India.", "og_title": "TopDecor — PVC Decor Film for Membrane Doors", "og_description": "Indian manufacturer of PVC Decor Film, Acrylic Sheets, and Laminate Wall Panels.", "og_image": "/og-image.jpg", "canonical": "https://topdecor.in/"}])
    await seed_if_empty("contact", [{"phone": "+91 93113 42988", "whatsapp": "919311342988", "email": "sales@kdipl.in", "email_cc": "nm@kdipl.in", "address": "Kundli, Sonipat, Haryana, India", "form_destination": "sales@kdipl.in"}])

    return {"seeded": seeded}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
