from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header, Query
from fastapi.responses import StreamingResponse
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

if RESEND_KEY:
    resend.api_key = RESEND_KEY

app = FastAPI(title="KDIPL Leads API")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# --------- Models ---------
LeadType = Literal["sample", "quote", "distributor"]
LeadStatus = Literal["new", "contacted", "qualified", "closed", "spam"]


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
    message: Optional[str] = Field(default=None, max_length=2000)


class Lead(LeadIn):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    status: LeadStatus = "new"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


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
    for t in ["sample", "quote", "distributor"]:
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
        "experience_years", "expected_volume", "message", "id",
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
