"""
TopDecor API — Vercel Serverless (PostgreSQL/Supabase)
"""
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header, Query, UploadFile, File, Form
from fastapi.responses import StreamingResponse, Response
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request as StarletteRequest
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import Optional, Literal
import os, io, csv, hmac, hashlib, base64, json, uuid, logging, asyncio, urllib.parse
from datetime import datetime, timezone, timedelta
from contextlib import contextmanager
import psycopg2
import psycopg2.extras

try:
    import resend
except ImportError:
    resend = None

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Config ──
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'kdipl@admin2025')
ADMIN_SECRET = os.environ.get('ADMIN_TOKEN_SECRET', 'dev-secret-change-me')
RESEND_KEY = os.environ.get('RESEND_API_KEY', '').strip()
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev')
LEAD_TO_EMAIL = os.environ.get('LEAD_TO_EMAIL', 'sales@kdipl.in')
LEAD_CC_EMAIL = os.environ.get('LEAD_CC_EMAIL', '')

DB_HOST = os.environ.get('DB_HOST', 'aws-1-ap-southeast-1.pooler.supabase.com')
DB_PORT = int(os.environ.get('DB_PORT', '5432'))
DB_NAME = os.environ.get('DB_NAME', 'postgres')
DB_USER = os.environ.get('DB_USER', 'postgres.rycahettjebpaqrlmtsy')
DB_PASS = os.environ.get('DB_PASS', 'Mittal@01pvc')

if RESEND_KEY and resend:
    resend.api_key = RESEND_KEY

MAX_UPLOAD_BYTES = 10 * 1024 * 1024

# ── Database ──
_conn = None

def get_db():
    global _conn
    try:
        if _conn and not _conn.closed:
            # Quick test to see if connection is alive
            with _conn.cursor() as cur:
                cur.execute("SELECT 1")
            return _conn
    except Exception:
        try:
            if _conn: _conn.close()
        except: pass
        _conn = None
    _conn = psycopg2.connect(host=DB_HOST, port=DB_PORT, dbname=DB_NAME,
                             user=DB_USER, password=DB_PASS, sslmode='require',
                             connect_timeout=10)
    _conn.autocommit = True
    return _conn

def _safe_db():
    """Get DB connection with retry on failure."""
    try:
        return get_db()
    except Exception as e:
        logger.error("DB connection failed (attempt 1): %s", e)
        global _conn
        _conn = None
        return get_db()  # retry once

def db_exec(sql, params=None):
    conn = _safe_db()
    with conn.cursor() as cur:
        cur.execute(sql, params)

def db_fetch_all(sql, params=None):
    conn = _safe_db()
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql, params)
        return cur.fetchall()

def db_fetch_one(sql, params=None):
    conn = _safe_db()
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql, params)
        return cur.fetchone()

def db_fetch_val(sql, params=None):
    conn = _safe_db()
    with conn.cursor() as cur:
        cur.execute(sql, params)
        row = cur.fetchone()
        return row[0] if row else None

# ── Models ──
LeadType = Literal["sample", "quote", "distributor", "comparison", "catalogue"]
LeadStatus = Literal["new", "contacted", "qualified", "closed", "spam"]

class FileMeta(BaseModel):
    filename: str; stored: str; size: int; content_type: Optional[str] = None

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

# ── Auth ──
def _sign(payload: str) -> str:
    sig = hmac.new(ADMIN_SECRET.encode(), payload.encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(sig).decode().rstrip("=")

def create_token(hours=24):
    exp = int((datetime.now(timezone.utc) + timedelta(hours=hours)).timestamp())
    payload = f"admin:{exp}"
    return f"{base64.urlsafe_b64encode(payload.encode()).decode().rstrip('=')}.{_sign(payload)}"

def verify_token(token):
    try:
        body, sig = token.split(".")
        payload = base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)).decode()
        if _sign(payload) != sig: return False
        return int(payload.split(":")[1]) > int(datetime.now(timezone.utc).timestamp())
    except Exception:
        return False

async def require_admin(authorization: Optional[str] = Header(default=None)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing token")
    if not verify_token(authorization.split(" ", 1)[1]):
        raise HTTPException(401, "Invalid or expired token")
    return True

# ── Email ──
def _build_email_html(lead):
    rows = []
    for field, label in [("type","Lead Type"),("name","Name"),("company","Company"),
        ("email","Email"),("phone","Phone"),("country","Country"),("city","City"),
        ("product_interest","Product Interest"),("quantity","Quantity"),
        ("territory","Territory"),("message","Message")]:
        val = getattr(lead, field, None)
        if val:
            rows.append(f'<tr><td style="padding:8px 12px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:600;width:180px;">{label}</td>'
                        f'<td style="padding:8px 12px;border:1px solid #e2e8f0;">{val}</td></tr>')
    return (f'<div style="font-family:Arial;background:#f1f5f9;padding:24px;"><div style="max-width:640px;margin:auto;background:#fff;border:1px solid #e2e8f0;">'
            f'<div style="padding:20px 28px;background:#0f172a;color:#fff;"><div style="font-size:12px;letter-spacing:3px;color:#f97316;font-weight:700;">TOPDECOR · NEW LEAD</div>'
            f'<div style="font-size:22px;font-weight:800;margin-top:6px;">{lead.type.upper()} — {lead.name}</div></div>'
            f'<table style="width:100%;border-collapse:collapse;">{"".join(rows)}</table></div></div>')

def send_lead_email_sync(lead):
    if not RESEND_KEY or not resend: return
    try:
        params = {"from": f"TopDecor Leads <{SENDER_EMAIL}>", "to": [LEAD_TO_EMAIL],
                  "subject": f"[TopDecor] New {lead.type} lead — {lead.name}" + (f" ({lead.company})" if lead.company else ""),
                  "html": _build_email_html(lead), "reply_to": lead.email}
        if LEAD_CC_EMAIL: params["cc"] = [LEAD_CC_EMAIL]
        resend.Emails.send(params)
    except Exception as e:
        logger.error("Email failed: %s", e)

# ── App ──
app = FastAPI(title="TopDecor API")
r = APIRouter(prefix="/api")

# ── Public ──
@r.get("/")
def root():
    return {"service": "TopDecor API", "status": "ok"}

@r.get("/health")
def health():
    """Debug endpoint to check DB connectivity and env vars."""
    info = {"db_host": DB_HOST, "db_name": DB_NAME, "db_user": DB_USER,
            "has_password": bool(DB_PASS), "db_port": DB_PORT}
    try:
        conn = get_db()
        info["db_connected"] = True
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM cms_content")
            info["cms_rows"] = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM leads")
            info["lead_rows"] = cur.fetchone()[0]
    except Exception as e:
        info["db_connected"] = False
        info["db_error"] = str(e)
    return info

@r.post("/leads")
def create_lead(payload: LeadIn):
    lead = Lead(**payload.model_dump())
    doc = lead.model_dump(); doc["created_at"] = doc["created_at"].isoformat()
    db_exec("INSERT INTO leads (id,type,status,created_at,data) VALUES (%s,%s,%s,%s,%s)",
            (doc["id"], doc["type"], doc["status"], doc["created_at"], json.dumps(doc)))
    try: send_lead_email_sync(lead)
    except: pass
    return lead

@r.post("/leads/comparison")
async def create_comparison_lead(
    name: str = Form(...), email: EmailStr = Form(...), phone: str = Form(...),
    company: Optional[str] = Form(None), country: Optional[str] = Form(None),
    city: Optional[str] = Form(None), current_supplier: Optional[str] = Form(None),
    monthly_volume_sqm: Optional[str] = Form(None), product_interest: Optional[str] = Form(None),
    message: Optional[str] = Form(None), file: Optional[UploadFile] = File(None),
):
    file_meta = None
    file_bytes = None
    if file and file.filename:
        contents = await file.read()
        if len(contents) > MAX_UPLOAD_BYTES:
            raise HTTPException(400, "File exceeds 10MB")
        stored_name = f"{uuid.uuid4().hex}{os.path.splitext(file.filename)[1].lower()}"
        file_meta = FileMeta(filename=file.filename, stored=stored_name, size=len(contents), content_type=file.content_type)
        file_bytes = contents

    lead = Lead(type="comparison", name=name, email=email, phone=phone, company=company,
                country=country, city=city, current_supplier=current_supplier,
                monthly_volume_sqm=monthly_volume_sqm, product_interest=product_interest,
                message=message, file_meta=file_meta)
    doc = lead.model_dump(); doc["created_at"] = doc["created_at"].isoformat()
    db_exec("INSERT INTO leads (id,type,status,created_at,data) VALUES (%s,%s,%s,%s,%s)",
            (doc["id"], doc["type"], doc["status"], doc["created_at"], json.dumps(doc)))
    try: send_lead_email_sync(lead)
    except: pass
    return lead

# ── CMS Content ──
CMS_COLLECTIONS = ["branding","hero","products","categories","audience","trust","faq","testimonials","seo_settings","contact"]

@r.get("/content/{collection}")
def get_content(collection: str):
    if collection not in CMS_COLLECTIONS: raise HTTPException(404, "Unknown collection")
    rows = db_fetch_all("SELECT data FROM cms_content WHERE collection=%s ORDER BY sort_order ASC", (collection,))
    return {"items": [r["data"] for r in rows]}

@r.get("/admin/content/{collection}")
def admin_list_content(collection: str, _=Depends(require_admin)):
    if collection not in CMS_COLLECTIONS: raise HTTPException(404)
    rows = db_fetch_all("SELECT data FROM cms_content WHERE collection=%s ORDER BY sort_order ASC", (collection,))
    return {"items": [r["data"] for r in rows]}

@r.post("/admin/content/{collection}/item")
async def admin_create_item(collection: str, request: StarletteRequest, _=Depends(require_admin)):
    if collection not in CMS_COLLECTIONS: raise HTTPException(404)
    body = await request.json()
    item_id = body.get("id") or str(uuid.uuid4()); body["id"] = item_id
    if "sort_order" not in body:
        body["sort_order"] = db_fetch_val("SELECT COUNT(*) FROM cms_content WHERE collection=%s", (collection,)) or 0
    body["updated_at"] = datetime.now(timezone.utc).isoformat()
    db_exec("INSERT INTO cms_content (id,collection,sort_order,data) VALUES (%s,%s,%s,%s)",
            (item_id, collection, body["sort_order"], json.dumps(body)))
    return {"ok": True, "id": item_id}

@r.put("/admin/content/{collection}/item/{item_id}")
async def admin_update_item(collection: str, item_id: str, request: StarletteRequest, _=Depends(require_admin)):
    if collection not in CMS_COLLECTIONS: raise HTTPException(404)
    body = await request.json()
    body["updated_at"] = datetime.now(timezone.utc).isoformat(); body["id"] = item_id
    db_exec("UPDATE cms_content SET data=%s, sort_order=%s WHERE id=%s AND collection=%s",
            (json.dumps(body), body.get("sort_order", 0), item_id, collection))
    return {"ok": True}

@r.delete("/admin/content/{collection}/item/{item_id}")
def admin_delete_item(collection: str, item_id: str, _=Depends(require_admin)):
    if collection not in CMS_COLLECTIONS: raise HTTPException(404)
    db_exec("DELETE FROM cms_content WHERE id=%s AND collection=%s", (item_id, collection))
    return {"ok": True}

@r.put("/admin/content/{collection}/reorder")
async def admin_reorder(collection: str, request: StarletteRequest, _=Depends(require_admin)):
    if collection not in CMS_COLLECTIONS: raise HTTPException(404)
    body = await request.json()
    for i, iid in enumerate(body.get("ids", [])):
        row = db_fetch_one("SELECT data FROM cms_content WHERE id=%s AND collection=%s", (iid, collection))
        if row:
            doc = row["data"] if isinstance(row["data"], dict) else json.loads(row["data"])
            doc["sort_order"] = i
            db_exec("UPDATE cms_content SET sort_order=%s, data=%s WHERE id=%s", (i, json.dumps(doc), iid))
    return {"ok": True}

# ── Admin Auth ──
@r.post("/admin/login")
def admin_login(body: AdminLogin):
    if body.password != ADMIN_PASSWORD: raise HTTPException(401, "Invalid password")
    return {"token": create_token(), "expires_in_hours": 24}

@r.get("/admin/verify")
def admin_verify(_=Depends(require_admin)):
    return {"ok": True}

@r.get("/admin/stats")
def admin_stats(_=Depends(require_admin)):
    total = db_fetch_val("SELECT COUNT(*) FROM leads")
    by_type = {t: db_fetch_val("SELECT COUNT(*) FROM leads WHERE type=%s", (t,)) for t in ["sample","quote","distributor","comparison"]}
    by_status = {s: db_fetch_val("SELECT COUNT(*) FROM leads WHERE status=%s", (s,)) for s in ["new","contacted","qualified","closed","spam"]}
    return {"total": total, "by_type": by_type, "by_status": by_status}

@r.get("/admin/leads")
def admin_list_leads(_=Depends(require_admin), type: Optional[str]=None, status: Optional[str]=None, q: Optional[str]=None, limit: int=Query(200, le=1000)):
    sql = "SELECT data FROM leads"; conds = []; params = []
    if type: conds.append("type=%s"); params.append(type)
    if status: conds.append("status=%s"); params.append(status)
    if q: conds.append("LOWER(data::text) LIKE %s"); params.append(f"%{q.lower()}%")
    if conds: sql += " WHERE " + " AND ".join(conds)
    sql += " ORDER BY created_at DESC LIMIT %s"; params.append(limit)
    rows = db_fetch_all(sql, tuple(params))
    items = [r["data"] if isinstance(r["data"], dict) else json.loads(r["data"]) for r in rows]
    return {"items": items, "count": len(items)}

@r.patch("/admin/leads/{lead_id}")
def admin_update_lead(lead_id: str, body: LeadStatusUpdate, _=Depends(require_admin)):
    row = db_fetch_one("SELECT data FROM leads WHERE id=%s", (lead_id,))
    if not row: raise HTTPException(404)
    doc = row["data"] if isinstance(row["data"], dict) else json.loads(row["data"])
    doc["status"] = body.status
    db_exec("UPDATE leads SET status=%s, data=%s WHERE id=%s", (body.status, json.dumps(doc), lead_id))
    return doc

@r.delete("/admin/leads/{lead_id}")
def admin_delete_lead(lead_id: str, _=Depends(require_admin)):
    db_exec("DELETE FROM leads WHERE id=%s", (lead_id,))
    return {"ok": True}

@r.get("/admin/leads/export.csv")
def admin_export_csv(_=Depends(require_admin)):
    rows = db_fetch_all("SELECT data FROM leads ORDER BY created_at DESC LIMIT 5000")
    items = [r["data"] if isinstance(r["data"], dict) else json.loads(r["data"]) for r in rows]
    buf = io.StringIO()
    fields = ["created_at","type","status","name","company","email","phone","country","city",
              "product_interest","quantity","territory","experience_years","expected_volume","message","id"]
    writer = csv.DictWriter(buf, fieldnames=fields, extrasaction="ignore"); writer.writeheader()
    for item in items: writer.writerow(item)
    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="leads-{datetime.now(timezone.utc).strftime("%Y%m%d")}.csv"'})

# ── Media (stored in PostgreSQL) ──
@r.post("/admin/media/upload")
async def admin_upload_media(file: UploadFile = File(...), _=Depends(require_admin)):
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in {".jpg",".jpeg",".png",".webp",".gif",".svg",".ico"}:
        raise HTTPException(400, f"Unsupported: {ext}")
    contents = await file.read()
    if len(contents) > MAX_UPLOAD_BYTES: raise HTTPException(400, "File exceeds 10MB")
    file_id = uuid.uuid4().hex
    orig_name = f"{file_id}{ext}"
    ct_map = {".jpg":"image/jpeg",".jpeg":"image/jpeg",".png":"image/png",".webp":"image/webp",
              ".gif":"image/gif",".svg":"image/svg+xml",".ico":"image/x-icon"}
    media_doc = {"id": file_id, "filename": file.filename, "stored": orig_name, "size": len(contents),
                 "content_type": ct_map.get(ext, file.content_type), "url": f"/api/media/{orig_name}",
                 "created_at": datetime.now(timezone.utc).isoformat()}
    db_exec("INSERT INTO media (id,created_at,data,file_data) VALUES (%s,%s,%s,%s)",
            (file_id, media_doc["created_at"], json.dumps(media_doc), psycopg2.Binary(contents)))
    return media_doc

@r.get("/admin/media")
def admin_list_media(_=Depends(require_admin)):
    rows = db_fetch_all("SELECT data FROM media ORDER BY created_at DESC")
    return {"items": [r["data"] if isinstance(r["data"], dict) else json.loads(r["data"]) for r in rows]}

@r.delete("/admin/media/{media_id}")
def admin_delete_media(media_id: str, _=Depends(require_admin)):
    db_exec("DELETE FROM media WHERE id=%s", (media_id,))
    return {"ok": True}

@r.get("/media/{filename}")
def serve_media(filename: str):
    file_id = filename.rsplit(".", 1)[0] if "." in filename else filename
    row = db_fetch_one("SELECT data, file_data FROM media WHERE id=%s", (file_id,))
    if not row or not row.get("file_data"): raise HTTPException(404, "Not found")
    doc = row["data"] if isinstance(row["data"], dict) else json.loads(row["data"])
    ct = doc.get("content_type", "application/octet-stream")
    return Response(content=bytes(row["file_data"]), media_type=ct,
                    headers={"Cache-Control": "public, max-age=31536000, immutable"})

# ── Seed ──
@r.post("/admin/seed")
def admin_seed(_=Depends(require_admin)):
    seeded = []
    def seed_if_empty(name, items):
        count = db_fetch_val("SELECT COUNT(*) FROM cms_content WHERE collection=%s", (name,))
        if count == 0:
            for i, item in enumerate(items):
                item["id"] = item.get("id") or str(uuid.uuid4())
                item["sort_order"] = i
                item["updated_at"] = datetime.now(timezone.utc).isoformat()
                db_exec("INSERT INTO cms_content (id,collection,sort_order,data) VALUES (%s,%s,%s,%s)",
                        (item["id"], name, i, json.dumps(item)))
            seeded.append(name)

    seed_if_empty("branding", [{"brand_name":"TopDecor","legal_name":"Kiana Decor India Pvt Ltd","tagline":"Sajao Bharat, Badhao Bharat","logo_url":"","favicon_url":"","og_image_url":""}])
    seed_if_empty("hero", [{"headline":"Imports are slow.","sub_headline":"And expensive. And, honestly — OPTIONAL.","twist_line":"OPTIONAL.","description":"We press PVC Decor Film for membrane doors and now PVC Laminates 1 mm & 3 mm for acrylic sheets.","cta_text":"Get a Free Sample Box","cta_link":"#contact","cta2_text":"Beat My Import Price","image_url":""}])
    seed_if_empty("products", [
        {"name":"PVC Decor Film","category":"Membrane Door","tag":"Flagship","subtitle":"For PVC Membrane Doors","process":"Vacuum Press Process","points":"3D wrap ready|Scratch & moisture resistant|Wide design library|Custom print runs","image":"/images/pvc-decor-film.jpg","active":True},
        {"name":"PVC Laminate 1 mm","category":"Acrylic","tag":"New Launch","subtitle":"For Acrylic Sheets & Panels","process":"Pressed & Polished","points":"High-gloss finish|UV stable|Easy to fabricate|Uniform thickness","image":"/images/walnut-texture.jpg","active":True},
        {"name":"PVC Laminate 3 mm","category":"Laminates","tag":"New Launch","subtitle":"Rigid Decorative Sheets","process":"Pressed & Polished","points":"Structural thickness|Textured & solid ranges|Cut-to-size|Contract pricing","image":"/images/marble-texture.jpg","active":True},
    ])
    seed_if_empty("categories", [{"name":"Membrane Door"},{"name":"Furniture"},{"name":"Wall Panels"},{"name":"Acrylic"},{"name":"Laminates"}])
    seed_if_empty("audience", [
        {"audience_id":"distributors","label":"Distributor","icon":"Truck","target":"#distributors"},
        {"audience_id":"importers","label":"Importer","icon":"Globe","target":"#importers"},
        {"audience_id":"manufacturers","label":"Manufacturer","icon":"Factory","target":"#manufacturers"},
    ])
    seed_if_empty("trust", [
        {"step":"01","title":"Raw Material QC","body":"Sourced PVC and additives tested for tensile, gloss and colour stability."},
        {"step":"02","title":"Printing & Coating","body":"High-definition texture printing with protective top coats for durability."},
        {"step":"03","title":"Vacuum Press / Lamination","body":"Industrial presses for films; precision pressing for 1mm & 3mm laminates."},
        {"step":"04","title":"Inspection & Dispatch","body":"Batch-wise QC, roll/sheet labelling, and secure freight-ready packaging."},
    ])
    seed_if_empty("faq", [
        {"q":"What is the MOQ for importers and distributors?","a":"We work with flexible MOQs — much lower than container-load imports."},
        {"q":"Do you ship internationally?","a":"Yes. We ship to ports worldwide. Typical lead time is 5–15 days."},
        {"q":"Can I get custom designs or private-label prints?","a":"Absolutely. Private label and custom prints available above a minimum order."},
        {"q":"How do I become a TopDecor distributor?","a":"Fill the Distributor Application tab in the contact form."},
        {"q":"Are samples free?","a":"Yes, a physical sample box is free for serious enquiries in India."},
        {"q":"What applications are 1mm and 3mm PVC laminates used for?","a":"1mm is bonded with acrylic sheets for cabinet shutters; 3mm is used as rigid decorative panelling."},
    ])
    seed_if_empty("testimonials", [
        {"quote":"We switched from a Chinese supplier to TopDecor last year. Lead time dropped from 45 days to under a week.","name":"R. Sundaresan","role":"Production Head","company":"Door Manufacturer · Tamil Nadu","audience":"Manufacturer","rating":5},
        {"quote":"Started as a regional distributor three years ago. Today my territory does 4× the volume I planned.","name":"Vikas Mehta","role":"Founder","company":"Plywood & Laminate Distributor · Pune","audience":"Distributor","rating":5},
    ])
    seed_if_empty("seo_settings", [{"title":"TopDecor — PVC Decor Film for Membrane Doors | Manufacturer in India","description":"TopDecor manufactures PVC Decor Film, Acrylic Sheets and Laminate Wall Panels.","og_title":"TopDecor — PVC Decor Film for Membrane Doors","og_description":"Indian manufacturer of PVC Decor Film.","og_image":"","canonical":"https://topdecor.in/"}])
    seed_if_empty("contact", [{"phone":"+91 93113 42988","whatsapp":"919311342988","email":"sales@kdipl.in","email_cc":"nm@kdipl.in","address":"Kundli, Sonipat, Haryana, India","form_destination":"sales@kdipl.in"}])
    return {"seeded": seeded}

app.include_router(r)
app.add_middleware(CORSMiddleware, allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"], allow_headers=["*"])
