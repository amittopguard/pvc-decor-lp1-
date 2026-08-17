"""
Artwork and plate vault.

Keeps the record of who owns which artwork, which KLD die and which mould it is
patched to, and which plates carry it. A plate carries many artworks, so the
link between the two is its own table — that is also where each artwork's share
of the plate cost sits.

The schema deliberately sticks to column types MySQL and SQLite both accept, so
the API can be exercised against SQLite in tests and run on MySQL in production.
"""

import csv
import io
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel, Field

MAX_ARTWORK_BYTES = 10 * 1024 * 1024
ALLOWED_ARTWORK_EXT = {".pdf", ".ai", ".eps", ".svg", ".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".cdr", ".zip"}

PAID_BY = {"us", "customer", "moulder", "vendor", "other"}

# How a plate is billed on to the customer. The plate always costs the company
# what the vendor charged; these decide how much of that is recovered.
#   none        the customer is not charged at all — we absorb the plate
#   full        the whole plate cost is passed on
#   percent     a share of it is passed on (charge_percent, typically 50)
#   refundable  charged up front, credited back once the customer has taken
#               refund_after_qty labels off that plate
CHARGE_POLICIES = {"none", "full", "percent", "refundable"}
DEFAULT_CHARGE_PERCENT = 50.0

# An order moves left to right. CRM raises it, design picks it up, and only
# after design signs off does a plate get ordered.
ORDER_STATUSES = ["crm_raised", "design_wip", "design_done", "plate_ordered", "running", "closed"]

# Cost is stored in paise/cents as an integer so money never drifts.
CURRENCY_MINOR = 100


def plate_charge(plate: dict, delivered_qty: int = 0) -> dict:
    """
    Split one plate's money into what it cost us and what the customer pays.

    `delivered_qty` is everything run off this plate across all its orders,
    repeats included — that is what a refund threshold is measured against, not
    any single order.
    """
    cost = int(plate.get("actual_cost_minor") or 0)
    policy = (plate.get("charge_policy") or "full").lower()
    if policy not in CHARGE_POLICIES:
        policy = "full"

    if policy == "none":
        charged = 0
    elif policy == "percent":
        pct = plate.get("charge_percent")
        pct = DEFAULT_CHARGE_PERCENT if pct is None else float(pct)
        charged = int(round(cost * pct / 100.0))
    else:  # full, refundable
        charged = cost

    # An explicit figure on the plate beats the policy — a negotiated number is
    # still the number that was invoiced.
    override = plate.get("charged_minor")
    if override is not None:
        charged = int(override)

    after = int(plate.get("refund_after_qty") or 0)
    delivered = int(delivered_qty or 0)
    refund_ready = policy == "refundable" and after > 0 and delivered >= after
    refund_due = charged if refund_ready else 0
    refunded = int(plate.get("refunded_minor") or 0)

    return {
        "charge_policy": policy,
        "cost_to_company_minor": cost,
        "cost_to_customer_minor": charged,
        "delivered_qty": delivered,
        "refund_after_qty": after,
        "refund_ready": refund_ready,
        "refund_due_minor": refund_due,
        "refunded_minor": refunded,
        "refund_outstanding_minor": max(0, refund_due - refunded),
        # What the plate finally costs the company once billing and any refund
        # have settled.
        "net_to_company_minor": cost - charged + refunded,
    }


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id() -> str:
    return uuid.uuid4().hex


SCHEMA = [
    """
    CREATE TABLE IF NOT EXISTS vault_moulders (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        city VARCHAR(255),
        contact VARCHAR(255),
        notes TEXT,
        created_at VARCHAR(64)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS vault_customers (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        code VARCHAR(64),
        moulder_id VARCHAR(64),
        contact VARCHAR(255),
        gst VARCHAR(64),
        notes TEXT,
        created_at VARCHAR(64)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS vault_vendors (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        city VARCHAR(255),
        contact VARCHAR(255),
        rate_note VARCHAR(255),
        notes TEXT,
        created_at VARCHAR(64)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS vault_dies (
        id VARCHAR(64) PRIMARY KEY,
        kld_number VARCHAR(128) NOT NULL,
        name VARCHAR(255),
        label_width DOUBLE,
        label_height DOUBLE,
        ups_across INT,
        ups_around INT,
        notes TEXT,
        created_at VARCHAR(64)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS vault_moulds (
        id VARCHAR(64) PRIMARY KEY,
        mould_code VARCHAR(128) NOT NULL,
        name VARCHAR(255),
        moulder_id VARCHAR(64),
        cavities INT,
        label_width DOUBLE,
        label_height DOUBLE,
        notes TEXT,
        created_at VARCHAR(64)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS vault_artworks (
        id VARCHAR(64) PRIMARY KEY,
        code VARCHAR(128) NOT NULL,
        name VARCHAR(255),
        customer_id VARCHAR(64),
        die_id VARCHAR(64),
        mould_id VARCHAR(64),
        width DOUBLE,
        height DOUBLE,
        colours INT,
        version VARCHAR(64),
        status VARCHAR(64),
        notes TEXT,
        created_at VARCHAR(64)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS vault_artwork_files (
        id VARCHAR(64) PRIMARY KEY,
        artwork_id VARCHAR(64) NOT NULL,
        filename VARCHAR(255),
        stored VARCHAR(255),
        size INT,
        content_type VARCHAR(128),
        version VARCHAR(64),
        uploaded_at VARCHAR(64)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS vault_plates (
        id VARCHAR(64) PRIMARY KEY,
        plate_number VARCHAR(128) NOT NULL,
        vendor_id VARCHAR(64),
        die_id VARCHAR(64),
        made_on VARCHAR(64),
        repeat_mm DOUBLE,
        web_width DOUBLE,
        actual_cost_minor INT,
        currency VARCHAR(8),
        paid_by VARCHAR(32),
        paid_by_note VARCHAR(255),
        status VARCHAR(64),
        notes TEXT,
        created_at VARCHAR(64)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS vault_plate_lines (
        id VARCHAR(64) PRIMARY KEY,
        plate_id VARCHAR(64) NOT NULL,
        artwork_id VARCHAR(64) NOT NULL,
        ups INT,
        position VARCHAR(64),
        cost_share_minor INT,
        notes TEXT,
        created_at VARCHAR(64)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS vault_orders (
        id VARCHAR(64) PRIMARY KEY,
        order_number VARCHAR(128) NOT NULL,
        customer_id VARCHAR(64),
        artwork_id VARCHAR(64),
        die_id VARCHAR(64),
        plate_id VARCHAR(64),
        parent_order_id VARCHAR(64),
        quantity INT,
        colours INT,
        ordered_on VARCHAR(64),
        due_on VARCHAR(64),
        status VARCHAR(32),
        raised_by VARCHAR(128),
        assigned_to VARCHAR(128),
        design_notes TEXT,
        notes TEXT,
        created_at VARCHAR(64),
        updated_at VARCHAR(64)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS vault_layouts (
        id VARCHAR(64) PRIMARY KEY,
        order_id VARCHAR(64),
        plate_id VARCHAR(64),
        name VARCHAR(255),
        kind VARCHAR(32),
        unit VARCHAR(8),
        label_width DOUBLE,
        label_height DOUBLE,
        quantity INT,
        colours INT,
        plate_sets INT,
        web_width DOUBLE,
        repeat_mm DOUBLE,
        teeth INT,
        across INT,
        around INT,
        per_rev INT,
        rotated INT,
        utilisation DOUBLE,
        material_area DOUBLE,
        web_length DOUBLE,
        revolutions INT,
        overrun INT,
        plate_area_cm2 DOUBLE,
        plate_cost_minor INT,
        material_cost_minor INT,
        total_cost_minor INT,
        per_thousand_minor INT,
        ranked_by VARCHAR(16),
        payload TEXT,
        saved_by VARCHAR(128),
        notes TEXT,
        created_at VARCHAR(64)
    )
    """,
]

# Columns added after the first release. CREATE TABLE IF NOT EXISTS leaves an
# existing table alone, so these have to be bolted on separately.
ADDED_COLUMNS = {
    "vault_plates": {
        "mould_id": "VARCHAR(64)",
        # What the plate says on it: the artwork it carries and the KLD it was
        # cut against. Derived from the lines when left blank, but stored so a
        # plate that has been physically etched keeps its own wording.
        "artwork_label": "VARCHAR(255)",
        "kld_label": "VARCHAR(128)",
        "colours": "INT",
        "plate_sets": "INT",
        # Cost to company is actual_cost_minor. Everything below is the
        # customer side of the same plate.
        "charge_policy": "VARCHAR(32)",
        "charge_percent": "DOUBLE",
        "charge_customer_id": "VARCHAR(64)",
        "charged_minor": "INT",
        "refund_after_qty": "INT",
        "refunded_minor": "INT",
    },
}


async def _ensure_columns(database):
    """
    Add any column an older install is missing.

    Probing with a SELECT rather than reading the catalogue keeps this working
    on SQLite and MySQL alike without writing the query twice.
    """
    for table, columns in ADDED_COLUMNS.items():
        for name, ddl in columns.items():
            try:
                await database.execute(f"SELECT {name} FROM {table} LIMIT 1")
            except Exception:
                await database.execute(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}")


async def ensure_schema(database):
    for statement in SCHEMA:
        await database.execute(statement)
    await _ensure_columns(database)


# --------------------------------------------------------------------------
# models
# --------------------------------------------------------------------------


class Moulder(BaseModel):
    name: str
    city: Optional[str] = None
    contact: Optional[str] = None
    notes: Optional[str] = None


class Customer(BaseModel):
    name: str
    code: Optional[str] = None
    moulder_id: Optional[str] = None
    contact: Optional[str] = None
    gst: Optional[str] = None
    notes: Optional[str] = None


class Vendor(BaseModel):
    name: str
    city: Optional[str] = None
    contact: Optional[str] = None
    rate_note: Optional[str] = None
    notes: Optional[str] = None


class Die(BaseModel):
    kld_number: str
    name: Optional[str] = None
    label_width: Optional[float] = None
    label_height: Optional[float] = None
    ups_across: Optional[int] = None
    ups_around: Optional[int] = None
    notes: Optional[str] = None


class Mould(BaseModel):
    mould_code: str
    name: Optional[str] = None
    moulder_id: Optional[str] = None
    cavities: Optional[int] = None
    label_width: Optional[float] = None
    label_height: Optional[float] = None
    notes: Optional[str] = None


class Artwork(BaseModel):
    code: str
    name: Optional[str] = None
    customer_id: Optional[str] = None
    die_id: Optional[str] = None
    mould_id: Optional[str] = None
    width: Optional[float] = None
    height: Optional[float] = None
    colours: Optional[int] = None
    version: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class PlateLine(BaseModel):
    artwork_id: str
    ups: Optional[int] = None
    position: Optional[str] = None
    cost_share_minor: Optional[int] = None
    notes: Optional[str] = None


class Plate(BaseModel):
    plate_number: str
    vendor_id: Optional[str] = None
    die_id: Optional[str] = None
    mould_id: Optional[str] = None
    made_on: Optional[str] = None
    repeat_mm: Optional[float] = None
    web_width: Optional[float] = None
    colours: Optional[int] = None
    plate_sets: Optional[int] = None
    # Left blank these are filled in from the plate's lines and its KLD, so the
    # plate always carries a readable artwork name and KLD reference.
    artwork_label: Optional[str] = None
    kld_label: Optional[str] = None
    actual_cost_minor: Optional[int] = None
    currency: Optional[str] = "INR"
    paid_by: Optional[str] = None
    paid_by_note: Optional[str] = None
    charge_policy: Optional[str] = None
    charge_percent: Optional[float] = None
    charge_customer_id: Optional[str] = None
    charged_minor: Optional[int] = None
    refund_after_qty: Optional[int] = None
    refunded_minor: Optional[int] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    lines: List[PlateLine] = Field(default_factory=list)


class Order(BaseModel):
    """A CRM order that design works against. A repeat points at its original."""

    order_number: str
    customer_id: Optional[str] = None
    artwork_id: Optional[str] = None
    die_id: Optional[str] = None
    plate_id: Optional[str] = None
    parent_order_id: Optional[str] = None
    quantity: Optional[int] = None
    colours: Optional[int] = None
    ordered_on: Optional[str] = None
    due_on: Optional[str] = None
    status: Optional[str] = None
    raised_by: Optional[str] = None
    assigned_to: Optional[str] = None
    design_notes: Optional[str] = None
    notes: Optional[str] = None


class OrderStatus(BaseModel):
    status: str
    assigned_to: Optional[str] = None
    design_notes: Optional[str] = None


class Layout(BaseModel):
    """
    A calculation the optimiser produced, kept so it survives the browser it
    was worked out in and so the plate that follows from it can be made
    without anybody retyping the numbers.
    """

    name: Optional[str] = None
    kind: Optional[str] = "step_repeat"
    order_id: Optional[str] = None
    plate_id: Optional[str] = None
    unit: Optional[str] = "mm"
    label_width: Optional[float] = None
    label_height: Optional[float] = None
    quantity: Optional[int] = None
    colours: Optional[int] = None
    plate_sets: Optional[int] = None
    web_width: Optional[float] = None
    repeat_mm: Optional[float] = None
    teeth: Optional[int] = None
    across: Optional[int] = None
    around: Optional[int] = None
    per_rev: Optional[int] = None
    rotated: Optional[bool] = None
    utilisation: Optional[float] = None
    material_area: Optional[float] = None
    web_length: Optional[float] = None
    revolutions: Optional[int] = None
    overrun: Optional[int] = None
    plate_area_cm2: Optional[float] = None
    plate_cost_minor: Optional[int] = None
    material_cost_minor: Optional[int] = None
    total_cost_minor: Optional[int] = None
    per_thousand_minor: Optional[int] = None
    ranked_by: Optional[str] = None
    # The whole project as the optimiser had it, so the layout can be reopened
    # and recalculated rather than only read back.
    payload: Optional[dict] = None
    saved_by: Optional[str] = None
    notes: Optional[str] = None


LAYOUT_KINDS = {"step_repeat", "gang", "plate_nest"}


class PlateFromLayout(BaseModel):
    """
    Overrides when turning a layout into a plate. Every field is optional —
    the layout and its order already supply the rest — so an empty body is a
    perfectly good request.
    """

    plate_number: Optional[str] = None
    vendor_id: Optional[str] = None
    die_id: Optional[str] = None
    mould_id: Optional[str] = None
    made_on: Optional[str] = None
    artwork_label: Optional[str] = None
    kld_label: Optional[str] = None
    actual_cost_minor: Optional[int] = None
    currency: Optional[str] = None
    paid_by: Optional[str] = None
    paid_by_note: Optional[str] = None
    charge_policy: Optional[str] = None
    charge_percent: Optional[float] = None
    charge_customer_id: Optional[str] = None
    charged_minor: Optional[int] = None
    refund_after_qty: Optional[int] = None
    refunded_minor: Optional[int] = None
    status: Optional[str] = None
    notes: Optional[str] = None


ENTITIES = {
    "moulders": ("vault_moulders", Moulder, ["name", "city", "contact", "notes"], "name"),
    "customers": ("vault_customers", Customer, ["name", "code", "moulder_id", "contact", "gst", "notes"], "name"),
    "vendors": ("vault_vendors", Vendor, ["name", "city", "contact", "rate_note", "notes"], "name"),
    "dies": (
        "vault_dies",
        Die,
        ["kld_number", "name", "label_width", "label_height", "ups_across", "ups_around", "notes"],
        "kld_number",
    ),
    "moulds": (
        "vault_moulds",
        Mould,
        ["mould_code", "name", "moulder_id", "cavities", "label_width", "label_height", "notes"],
        "mould_code",
    ),
    "artworks": (
        "vault_artworks",
        Artwork,
        [
            "code", "name", "customer_id", "die_id", "mould_id",
            "width", "height", "colours", "version", "status", "notes",
        ],
        "code",
    ),
}


def build(database, require_admin, upload_dir: Path):
    """Wire the vault routes against the app's database and admin guard."""

    # Built per call so the routes are never registered onto a shared router twice.
    router = APIRouter(prefix="/vault")

    art_dir = upload_dir / "artwork"
    art_dir.mkdir(parents=True, exist_ok=True)

    async def _exists(table: str, row_id: Optional[str]) -> bool:
        if not row_id:
            return True
        row = await database.fetch_one(f"SELECT id FROM {table} WHERE id = :id", {"id": row_id})
        return row is not None

    async def _check_refs(name: str, payload: dict):
        """A reference to a record that is not there is a client error, not a 500."""
        refs = {
            "moulder_id": "vault_moulders",
            "customer_id": "vault_customers",
            "die_id": "vault_dies",
            "mould_id": "vault_moulds",
            "vendor_id": "vault_vendors",
            "artwork_id": "vault_artworks",
            "charge_customer_id": "vault_customers",
            "plate_id": "vault_plates",
            "order_id": "vault_orders",
            "parent_order_id": "vault_orders",
        }
        for field, table in refs.items():
            if field in payload and payload.get(field):
                if not await _exists(table, payload[field]):
                    raise HTTPException(status_code=400, detail=f"{field} does not exist")

    # ---- artwork files ---------------------------------------------------

    @router.post("/artworks/{artwork_id}/files")
    async def upload_artwork_file(
        artwork_id: str,
        file: UploadFile = File(...),
        version: Optional[str] = Form(default=None),
        _: bool = Depends(require_admin),
    ):
        if not await _exists("vault_artworks", artwork_id):
            raise HTTPException(status_code=404, detail="Artwork not found")
        ext = Path(file.filename or "").suffix.lower()
        if ext not in ALLOWED_ARTWORK_EXT:
            raise HTTPException(status_code=400, detail=f"Unsupported artwork file: {ext or 'no extension'}")
        contents = await file.read()
        if len(contents) > MAX_ARTWORK_BYTES:
            raise HTTPException(status_code=400, detail="File exceeds 10MB")

        file_id = _new_id()
        stored = f"{file_id}{ext}"
        (art_dir / stored).write_bytes(contents)
        row = {
            "id": file_id,
            "artwork_id": artwork_id,
            "filename": file.filename,
            "stored": stored,
            "size": len(contents),
            "content_type": file.content_type,
            "version": version,
            "uploaded_at": _now(),
        }
        cols = ", ".join(row.keys())
        vals = ", ".join(f":{k}" for k in row.keys())
        await database.execute(f"INSERT INTO vault_artwork_files ({cols}) VALUES ({vals})", row)
        return row

    @router.get("/artworks/{artwork_id}/files")
    async def list_artwork_files(artwork_id: str, _: bool = Depends(require_admin)):
        rows = await database.fetch_all(
            "SELECT * FROM vault_artwork_files WHERE artwork_id = :id ORDER BY uploaded_at DESC",
            {"id": artwork_id},
        )
        return {"items": [dict(r) for r in rows]}

    @router.get("/files/{file_id}")
    async def download_artwork_file(file_id: str, _: bool = Depends(require_admin)):
        row = await database.fetch_one("SELECT * FROM vault_artwork_files WHERE id = :id", {"id": file_id})
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        path = art_dir / (row["stored"] or "")
        if not path.exists():
            raise HTTPException(status_code=404, detail="File missing on disk")
        return FileResponse(str(path), filename=row["filename"] or row["stored"])

    @router.delete("/files/{file_id}")
    async def delete_artwork_file(file_id: str, _: bool = Depends(require_admin)):
        row = await database.fetch_one("SELECT * FROM vault_artwork_files WHERE id = :id", {"id": file_id})
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        path = art_dir / (row["stored"] or "")
        if path.exists():
            path.unlink()
        await database.execute("DELETE FROM vault_artwork_files WHERE id = :id", {"id": file_id})
        return {"ok": True}

    # ---- plates and their lines -----------------------------------------

    async def _delivered_qty(plate_id: str) -> int:
        """Everything run off this plate, first order and repeats together."""
        row = await database.fetch_one(
            """
            SELECT COALESCE(SUM(quantity), 0) AS qty FROM vault_orders
            WHERE plate_id = :id AND status IN ('running', 'closed')
            """,
            {"id": plate_id},
        )
        return int(row["qty"] or 0) if row else 0

    async def _derive_labels(plate_id: str):
        """
        Give the plate the wording it should physically carry: the artwork names
        it holds and the KLD it belongs to. Only fills what was left blank, so a
        hand-typed label is never overwritten.
        """
        plate = await database.fetch_one("SELECT * FROM vault_plates WHERE id = :id", {"id": plate_id})
        if not plate:
            return
        updates = {}
        if not (plate["artwork_label"] or "").strip():
            names = await database.fetch_all(
                """
                SELECT COALESCE(NULLIF(a.name, ''), a.code) AS label
                FROM vault_plate_lines l JOIN vault_artworks a ON a.id = l.artwork_id
                WHERE l.plate_id = :id ORDER BY l.position, a.code
                """,
                {"id": plate_id},
            )
            joined = " + ".join(r["label"] for r in names if r["label"])
            if joined:
                updates["artwork_label"] = joined[:255]
        if not (plate["kld_label"] or "").strip():
            ref = await database.fetch_one(
                """
                SELECT d.kld_number AS die_ref, mo.mould_code AS mould_ref
                FROM vault_plates p
                LEFT JOIN vault_dies d ON d.id = p.die_id
                LEFT JOIN vault_moulds mo ON mo.id = p.mould_id
                WHERE p.id = :id
                """,
                {"id": plate_id},
            )
            label = (ref["die_ref"] or ref["mould_ref"] or "") if ref else ""
            if label:
                updates["kld_label"] = label[:128]
        if updates:
            sets = ", ".join(f"{k} = :{k}" for k in updates)
            await database.execute(
                f"UPDATE vault_plates SET {sets} WHERE id = :id", {"id": plate_id, **updates}
            )

    async def _plate_with_lines(plate_id: str) -> dict:
        plate = await database.fetch_one("SELECT * FROM vault_plates WHERE id = :id", {"id": plate_id})
        if not plate:
            raise HTTPException(status_code=404, detail="Not found")
        lines = await database.fetch_all(
            """
            SELECT l.*, a.code AS artwork_code, a.name AS artwork_name, a.customer_id
            FROM vault_plate_lines l
            LEFT JOIN vault_artworks a ON a.id = l.artwork_id
            WHERE l.plate_id = :id
            ORDER BY l.position, a.code
            """,
            {"id": plate_id},
        )
        orders = await database.fetch_all(
            """
            SELECT o.id, o.order_number, o.quantity, o.status, o.ordered_on,
                   o.parent_order_id, c.name AS customer_name
            FROM vault_orders o
            LEFT JOIN vault_customers c ON c.id = o.customer_id
            WHERE o.plate_id = :id ORDER BY o.ordered_on, o.order_number
            """,
            {"id": plate_id},
        )
        row = dict(plate)
        return {
            **row,
            "lines": [dict(r) for r in lines],
            "orders": [dict(r) for r in orders],
            "charge": plate_charge(row, await _delivered_qty(plate_id)),
        }

    async def _write_lines(plate_id: str, lines: List[PlateLine]):
        seen = set()
        for line in lines:
            if not await _exists("vault_artworks", line.artwork_id):
                raise HTTPException(status_code=400, detail="artwork_id does not exist")
            if line.artwork_id in seen:
                raise HTTPException(status_code=400, detail="The same artwork is on this plate twice")
            seen.add(line.artwork_id)
        await database.execute("DELETE FROM vault_plate_lines WHERE plate_id = :id", {"id": plate_id})
        for line in lines:
            row = {
                "id": _new_id(),
                "plate_id": plate_id,
                "created_at": _now(),
                **line.model_dump(),
            }
            cols = ", ".join(row.keys())
            vals = ", ".join(f":{k}" for k in row.keys())
            await database.execute(f"INSERT INTO vault_plate_lines ({cols}) VALUES ({vals})", row)

    @router.get("/plates")
    async def list_plates(_: bool = Depends(require_admin)):
        rows = await database.fetch_all(
            """
            SELECT p.*, v.name AS vendor_name, d.kld_number, mo.mould_code,
                   (SELECT COUNT(*) FROM vault_plate_lines l WHERE l.plate_id = p.id) AS artwork_count,
                   COALESCE((SELECT SUM(o.quantity) FROM vault_orders o
                             WHERE o.plate_id = p.id AND o.status IN ('running', 'closed')), 0) AS delivered_qty
            FROM vault_plates p
            LEFT JOIN vault_vendors v ON v.id = p.vendor_id
            LEFT JOIN vault_dies d ON d.id = p.die_id
            LEFT JOIN vault_moulds mo ON mo.id = p.mould_id
            ORDER BY p.made_on DESC, p.plate_number
            """
        )
        items = []
        for r in rows:
            row = dict(r)
            items.append({**row, "charge": plate_charge(row, row.get("delivered_qty") or 0)})
        return {"items": items}

    @router.get("/plates/{plate_id}")
    async def get_plate(plate_id: str, _: bool = Depends(require_admin)):
        return await _plate_with_lines(plate_id)

    def _check_plate_policy(body: Plate):
        if body.paid_by and body.paid_by not in PAID_BY:
            raise HTTPException(status_code=400, detail=f"paid_by must be one of {sorted(PAID_BY)}")
        if body.charge_policy and body.charge_policy not in CHARGE_POLICIES:
            raise HTTPException(
                status_code=400, detail=f"charge_policy must be one of {sorted(CHARGE_POLICIES)}"
            )
        if body.charge_percent is not None and not (0 <= body.charge_percent <= 100):
            raise HTTPException(status_code=400, detail="charge_percent must be between 0 and 100")
        if body.charge_policy == "refundable" and not body.refund_after_qty:
            raise HTTPException(
                status_code=400, detail="A refundable plate needs the quantity after which it is refunded"
            )

    @router.post("/plates")
    async def create_plate(body: Plate, _: bool = Depends(require_admin)):
        _check_plate_policy(body)
        data = body.model_dump()
        lines = [PlateLine(**line) for line in data.pop("lines", [])]
        await _check_refs("plates", data)
        plate_id = _new_id()
        row = {"id": plate_id, "created_at": _now(), **data}
        cols = ", ".join(row.keys())
        vals = ", ".join(f":{k}" for k in row.keys())
        await database.execute(f"INSERT INTO vault_plates ({cols}) VALUES ({vals})", row)
        await _write_lines(plate_id, lines)
        await _derive_labels(plate_id)
        return await _plate_with_lines(plate_id)

    @router.put("/plates/{plate_id}")
    async def update_plate(plate_id: str, body: Plate, _: bool = Depends(require_admin)):
        existing = await database.fetch_one("SELECT id FROM vault_plates WHERE id = :id", {"id": plate_id})
        if not existing:
            raise HTTPException(status_code=404, detail="Not found")
        _check_plate_policy(body)
        data = body.model_dump()
        lines = [PlateLine(**line) for line in data.pop("lines", [])]
        await _check_refs("plates", data)
        sets = ", ".join(f"{k} = :{k}" for k in data.keys())
        await database.execute(f"UPDATE vault_plates SET {sets} WHERE id = :id", {"id": plate_id, **data})
        await _write_lines(plate_id, lines)
        await _derive_labels(plate_id)
        return await _plate_with_lines(plate_id)

    @router.delete("/plates/{plate_id}")
    async def delete_plate(plate_id: str, _: bool = Depends(require_admin)):
        used = await database.fetch_one(
            "SELECT COUNT(*) AS n FROM vault_orders WHERE plate_id = :id", {"id": plate_id}
        )
        if used and used["n"]:
            raise HTTPException(
                status_code=409, detail=f"Still used by {used['n']} orders. Remove those first."
            )
        await database.execute("DELETE FROM vault_plate_lines WHERE plate_id = :id", {"id": plate_id})
        # A saved layout outlives the plate that came out of it, so it is
        # unhooked rather than deleted.
        await database.execute(
            "UPDATE vault_layouts SET plate_id = NULL WHERE plate_id = :id", {"id": plate_id}
        )
        await database.execute("DELETE FROM vault_plates WHERE id = :id", {"id": plate_id})
        return {"ok": True}

    # ---- orders: CRM raises, design works ---------------------------------

    ORDER_FIELDS = [
        "order_number", "customer_id", "artwork_id", "die_id", "plate_id", "parent_order_id",
        "quantity", "colours", "ordered_on", "due_on", "status", "raised_by", "assigned_to",
        "design_notes", "notes",
    ]

    ORDER_SELECT = """
        SELECT o.*, c.name AS customer_name, a.code AS artwork_code, a.name AS artwork_name,
               d.kld_number, p.plate_number, p.artwork_label, p.kld_label,
               po.order_number AS parent_order_number,
               (SELECT COUNT(*) FROM vault_orders r WHERE r.parent_order_id = o.id) AS repeat_count,
               (SELECT COUNT(*) FROM vault_layouts y WHERE y.order_id = o.id) AS layout_count
        FROM vault_orders o
        LEFT JOIN vault_customers c ON c.id = o.customer_id
        LEFT JOIN vault_artworks a ON a.id = o.artwork_id
        LEFT JOIN vault_dies d ON d.id = o.die_id
        LEFT JOIN vault_plates p ON p.id = o.plate_id
        LEFT JOIN vault_orders po ON po.id = o.parent_order_id
    """

    @router.get("/orders")
    async def list_orders(
        status: Optional[str] = None,
        customer_id: Optional[str] = None,
        plate_id: Optional[str] = None,
        _: bool = Depends(require_admin),
    ):
        clauses, params = [], {}
        for field, value in (("o.status", status), ("o.customer_id", customer_id), ("o.plate_id", plate_id)):
            if value:
                key = field.split(".")[1]
                clauses.append(f"{field} = :{key}")
                params[key] = value
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        rows = await database.fetch_all(
            f"{ORDER_SELECT} {where} ORDER BY o.ordered_on DESC, o.order_number", params
        )
        return {"items": [dict(r) for r in rows]}

    @router.get("/orders/{order_id}")
    async def get_order(order_id: str, _: bool = Depends(require_admin)):
        row = await database.fetch_one(f"{ORDER_SELECT} WHERE o.id = :id", {"id": order_id})
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        repeats = await database.fetch_all(
            "SELECT id, order_number, quantity, status, ordered_on FROM vault_orders "
            "WHERE parent_order_id = :id ORDER BY ordered_on",
            {"id": order_id},
        )
        return {**dict(row), "repeats": [dict(r) for r in repeats]}

    def _check_order(body: Order, order_id: Optional[str] = None):
        if body.status and body.status not in ORDER_STATUSES:
            raise HTTPException(status_code=400, detail=f"status must be one of {ORDER_STATUSES}")
        if order_id and body.parent_order_id == order_id:
            raise HTTPException(status_code=400, detail="An order cannot be its own repeat")

    @router.post("/orders")
    async def create_order(body: Order, _: bool = Depends(require_admin)):
        _check_order(body)
        data = body.model_dump()
        await _check_refs("orders", data)
        # A repeat inherits the original's artwork, KLD and plate unless it says
        # otherwise — that is the whole point of calling it a repeat.
        if data.get("parent_order_id"):
            parent = await database.fetch_one(
                "SELECT * FROM vault_orders WHERE id = :id", {"id": data["parent_order_id"]}
            )
            for field in ("customer_id", "artwork_id", "die_id", "plate_id", "colours"):
                if data.get(field) is None:
                    data[field] = parent[field]
        now = _now()
        row = {
            "id": _new_id(),
            "created_at": now,
            "updated_at": now,
            **{f: data.get(f) for f in ORDER_FIELDS},
        }
        row["status"] = row["status"] or "crm_raised"
        cols = ", ".join(row.keys())
        vals = ", ".join(f":{k}" for k in row.keys())
        await database.execute(f"INSERT INTO vault_orders ({cols}) VALUES ({vals})", row)
        return await get_order(row["id"], True)

    @router.put("/orders/{order_id}")
    async def update_order(order_id: str, body: Order, _: bool = Depends(require_admin)):
        existing = await database.fetch_one("SELECT id FROM vault_orders WHERE id = :id", {"id": order_id})
        if not existing:
            raise HTTPException(status_code=404, detail="Not found")
        _check_order(body, order_id)
        data = body.model_dump()
        await _check_refs("orders", data)
        values = {f: data.get(f) for f in ORDER_FIELDS}
        values["status"] = values["status"] or "crm_raised"
        sets = ", ".join(f"{f} = :{f}" for f in ORDER_FIELDS)
        await database.execute(
            f"UPDATE vault_orders SET {sets}, updated_at = :updated_at WHERE id = :id",
            {"id": order_id, "updated_at": _now(), **values},
        )
        return await get_order(order_id, True)

    @router.patch("/orders/{order_id}/status")
    async def set_order_status(order_id: str, body: OrderStatus, _: bool = Depends(require_admin)):
        """Move one order along the CRM-to-design track without touching the rest of it."""
        existing = await database.fetch_one("SELECT * FROM vault_orders WHERE id = :id", {"id": order_id})
        if not existing:
            raise HTTPException(status_code=404, detail="Not found")
        if body.status not in ORDER_STATUSES:
            raise HTTPException(status_code=400, detail=f"status must be one of {ORDER_STATUSES}")
        # Design cannot sign off on an order that has no artwork on it yet.
        if body.status in ("design_done", "plate_ordered", "running") and not existing["artwork_id"]:
            raise HTTPException(status_code=400, detail="Attach an artwork before design can sign this off")
        await database.execute(
            "UPDATE vault_orders SET status = :status, assigned_to = :assigned_to, "
            "design_notes = :design_notes, updated_at = :updated_at WHERE id = :id",
            {
                "id": order_id,
                "status": body.status,
                "assigned_to": body.assigned_to if body.assigned_to is not None else existing["assigned_to"],
                "design_notes": body.design_notes if body.design_notes is not None else existing["design_notes"],
                "updated_at": _now(),
            },
        )
        return await get_order(order_id, True)

    # ---- saved optimiser layouts ------------------------------------------

    LAYOUT_FIELDS = [
        "order_id", "plate_id", "name", "kind", "unit", "label_width", "label_height",
        "quantity", "colours", "plate_sets", "web_width", "repeat_mm", "teeth", "across",
        "around", "per_rev", "rotated", "utilisation", "material_area", "web_length",
        "revolutions", "overrun", "plate_area_cm2", "plate_cost_minor", "material_cost_minor",
        "total_cost_minor", "per_thousand_minor", "ranked_by", "payload", "saved_by", "notes",
    ]

    LAYOUT_SELECT = """
        SELECT l.*, o.order_number, c.name AS customer_name, p.plate_number,
               a.code AS artwork_code, d.kld_number
        FROM vault_layouts l
        LEFT JOIN vault_orders o ON o.id = l.order_id
        LEFT JOIN vault_customers c ON c.id = o.customer_id
        LEFT JOIN vault_plates p ON p.id = l.plate_id
        LEFT JOIN vault_artworks a ON a.id = o.artwork_id
        LEFT JOIN vault_dies d ON d.id = o.die_id
    """

    def _layout_out(row) -> dict:
        out = dict(row)
        # The payload goes in as JSON text and comes back as an object.
        try:
            out["payload"] = json.loads(out["payload"]) if out.get("payload") else None
        except (TypeError, ValueError):
            out["payload"] = None
        out["rotated"] = bool(out.get("rotated"))
        return out

    @router.get("/layouts")
    async def list_layouts(
        order_id: Optional[str] = None,
        plate_id: Optional[str] = None,
        _: bool = Depends(require_admin),
    ):
        clauses, params = [], {}
        for field, value in (("l.order_id", order_id), ("l.plate_id", plate_id)):
            if value:
                key = field.split(".")[1]
                clauses.append(f"{field} = :{key}")
                params[key] = value
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        rows = await database.fetch_all(f"{LAYOUT_SELECT} {where} ORDER BY l.created_at DESC", params)
        return {"items": [_layout_out(r) for r in rows]}

    @router.get("/layouts/{layout_id}")
    async def get_layout(layout_id: str, _: bool = Depends(require_admin)):
        row = await database.fetch_one(f"{LAYOUT_SELECT} WHERE l.id = :id", {"id": layout_id})
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        return _layout_out(row)

    @router.post("/layouts")
    async def create_layout(body: Layout, _: bool = Depends(require_admin)):
        if body.kind and body.kind not in LAYOUT_KINDS:
            raise HTTPException(status_code=400, detail=f"kind must be one of {sorted(LAYOUT_KINDS)}")
        data = body.model_dump()
        await _check_refs("layouts", data)
        row = {"id": _new_id(), "created_at": _now(), **{f: data.get(f) for f in LAYOUT_FIELDS}}
        row["kind"] = row["kind"] or "step_repeat"
        row["rotated"] = 1 if row["rotated"] else 0
        row["payload"] = json.dumps(row["payload"]) if row["payload"] is not None else None
        if not (row["name"] or "").strip():
            row["name"] = f"{row['across'] or '?'} × {row['around'] or '?'} on {row['teeth'] or '?'}T"
        cols = ", ".join(row.keys())
        vals = ", ".join(f":{k}" for k in row.keys())
        await database.execute(f"INSERT INTO vault_layouts ({cols}) VALUES ({vals})", row)
        return await get_layout(row["id"], True)

    @router.post("/layouts/{layout_id}/plate")
    async def plate_from_layout(
        layout_id: str, body: Optional[PlateFromLayout] = None, _: bool = Depends(require_admin)
    ):
        """
        Turn a saved layout into a plate record.

        Everything the plate needs is already in the layout — the repeat, the web
        width, the colours and what it works out at — and everything else comes
        from the order it was saved against, so nothing is retyped.
        """
        row = await database.fetch_one("SELECT * FROM vault_layouts WHERE id = :id", {"id": layout_id})
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        if row["plate_id"]:
            raise HTTPException(status_code=409, detail="This layout already has a plate")
        # A gang plan spread over several plates has no single repeat, so there
        # is no one plate to make from it.
        if not row["repeat_mm"]:
            raise HTTPException(
                status_code=400,
                detail="This layout has no single repeat to make a plate from — open it and pick one plate first.",
            )

        order = None
        if row["order_id"]:
            order = await database.fetch_one(
                "SELECT * FROM vault_orders WHERE id = :id", {"id": row["order_id"]}
            )

        given = body.model_dump() if body else {}
        plate_id = _new_id()
        plate = {
            "id": plate_id,
            "created_at": _now(),
            "plate_number": (given.get("plate_number") or "").strip()
            or f"PL-{(order['order_number'] if order else row['id'][:6]).upper()}",
            "vendor_id": given.get("vendor_id"),
            "die_id": given.get("die_id") or (order["die_id"] if order else None),
            "mould_id": given.get("mould_id"),
            "made_on": given.get("made_on"),
            "repeat_mm": row["repeat_mm"],
            "web_width": row["web_width"],
            "colours": row["colours"],
            "plate_sets": row["plate_sets"] or 1,
            "artwork_label": given.get("artwork_label"),
            "kld_label": given.get("kld_label"),
            "actual_cost_minor": given.get("actual_cost_minor")
            if given.get("actual_cost_minor") is not None
            else row["plate_cost_minor"],
            "currency": given.get("currency") or "INR",
            "paid_by": given.get("paid_by"),
            "paid_by_note": given.get("paid_by_note"),
            "charge_policy": given.get("charge_policy") or "full",
            "charge_percent": given.get("charge_percent"),
            "charge_customer_id": given.get("charge_customer_id")
            or (order["customer_id"] if order else None),
            "charged_minor": given.get("charged_minor"),
            "refund_after_qty": given.get("refund_after_qty"),
            "refunded_minor": given.get("refunded_minor"),
            "status": given.get("status") or "planned",
            "notes": given.get("notes") or f"From layout {row['name']}",
        }
        cols = ", ".join(plate.keys())
        vals = ", ".join(f":{k}" for k in plate.keys())
        await database.execute(f"INSERT INTO vault_plates ({cols}) VALUES ({vals})", plate)

        # The order's artwork goes on the plate, which is what gives the plate
        # its artwork name.
        if order and order["artwork_id"]:
            await _write_lines(plate_id, [PlateLine(artwork_id=order["artwork_id"], ups=row["per_rev"])])
        await _derive_labels(plate_id)

        await database.execute(
            "UPDATE vault_layouts SET plate_id = :plate WHERE id = :id", {"plate": plate_id, "id": layout_id}
        )
        if order and not order["plate_id"]:
            await database.execute(
                "UPDATE vault_orders SET plate_id = :plate, updated_at = :now WHERE id = :id",
                {"plate": plate_id, "now": _now(), "id": order["id"]},
            )
        return await _plate_with_lines(plate_id)

    @router.delete("/layouts/{layout_id}")
    async def delete_layout(layout_id: str, _: bool = Depends(require_admin)):
        await database.execute("DELETE FROM vault_layouts WHERE id = :id", {"id": layout_id})
        return {"ok": True}

    @router.delete("/orders/{order_id}")
    async def delete_order(order_id: str, _: bool = Depends(require_admin)):
        repeats = await database.fetch_one(
            "SELECT COUNT(*) AS n FROM vault_orders WHERE parent_order_id = :id", {"id": order_id}
        )
        if repeats and repeats["n"]:
            raise HTTPException(
                status_code=409, detail=f"Still the original for {repeats['n']} repeat orders. Remove those first."
            )
        saved = await database.fetch_one(
            "SELECT COUNT(*) AS n FROM vault_layouts WHERE order_id = :id", {"id": order_id}
        )
        if saved and saved["n"]:
            raise HTTPException(
                status_code=409, detail=f"Still holds {saved['n']} saved layouts. Remove those first."
            )
        await database.execute("DELETE FROM vault_orders WHERE id = :id", {"id": order_id})
        return {"ok": True}

    # ---- reports ---------------------------------------------------------

    @router.get("/reports/artworks")
    async def report_artworks(customer_id: Optional[str] = None, _: bool = Depends(require_admin)):
        """Every artwork with its customer, KLD, mould and how many plates carry it."""
        where = "WHERE a.customer_id = :customer_id" if customer_id else ""
        rows = await database.fetch_all(
            f"""
            SELECT a.*, c.name AS customer_name, c.code AS customer_code,
                   m.name AS moulder_name,
                   d.kld_number, mo.mould_code,
                   (SELECT COUNT(*) FROM vault_plate_lines l WHERE l.artwork_id = a.id) AS plate_count,
                   (SELECT COUNT(*) FROM vault_artwork_files f WHERE f.artwork_id = a.id) AS file_count
            FROM vault_artworks a
            LEFT JOIN vault_customers c ON c.id = a.customer_id
            LEFT JOIN vault_moulders m ON m.id = c.moulder_id
            LEFT JOIN vault_dies d ON d.id = a.die_id
            LEFT JOIN vault_moulds mo ON mo.id = a.mould_id
            {where}
            ORDER BY c.name, a.code
            """,
            {"customer_id": customer_id} if customer_id else {},
        )
        return {"items": [dict(r) for r in rows]}

    @router.get("/reports/kld")
    async def report_kld(_: bool = Depends(require_admin)):
        """Each KLD die with the artworks patched to it and the plates made from it."""
        rows = await database.fetch_all(
            """
            SELECT d.*,
                   (SELECT COUNT(*) FROM vault_artworks a WHERE a.die_id = d.id) AS artwork_count,
                   (SELECT COUNT(*) FROM vault_plates p WHERE p.die_id = d.id) AS plate_count
            FROM vault_dies d
            ORDER BY d.kld_number
            """
        )
        out = []
        for die in rows:
            arts = await database.fetch_all(
                """
                SELECT a.id, a.code, a.name, c.name AS customer_name
                FROM vault_artworks a
                LEFT JOIN vault_customers c ON c.id = a.customer_id
                WHERE a.die_id = :id ORDER BY a.code
                """,
                {"id": die["id"]},
            )
            out.append({**dict(die), "artworks": [dict(a) for a in arts]})
        return {"items": out}

    @router.get("/reports/reconciliation")
    async def report_reconciliation(_: bool = Depends(require_admin)):
        """
        Artwork on record against artwork actually on a plate: what is still
        unplated, and which plates carry nothing.
        """
        unplated = await database.fetch_all(
            """
            SELECT a.id, a.code, a.name, c.name AS customer_name, d.kld_number
            FROM vault_artworks a
            LEFT JOIN vault_customers c ON c.id = a.customer_id
            LEFT JOIN vault_dies d ON d.id = a.die_id
            WHERE NOT EXISTS (SELECT 1 FROM vault_plate_lines l WHERE l.artwork_id = a.id)
            ORDER BY c.name, a.code
            """
        )
        empty_plates = await database.fetch_all(
            """
            SELECT p.id, p.plate_number, v.name AS vendor_name
            FROM vault_plates p
            LEFT JOIN vault_vendors v ON v.id = p.vendor_id
            WHERE NOT EXISTS (SELECT 1 FROM vault_plate_lines l WHERE l.plate_id = p.id)
            ORDER BY p.plate_number
            """
        )
        # A plate line whose artwork points at a different KLD than the plate.
        mismatched = await database.fetch_all(
            """
            SELECT p.plate_number, a.code AS artwork_code, d1.kld_number AS plate_kld, d2.kld_number AS artwork_kld
            FROM vault_plate_lines l
            JOIN vault_plates p ON p.id = l.plate_id
            JOIN vault_artworks a ON a.id = l.artwork_id
            LEFT JOIN vault_dies d1 ON d1.id = p.die_id
            LEFT JOIN vault_dies d2 ON d2.id = a.die_id
            WHERE p.die_id IS NOT NULL AND a.die_id IS NOT NULL AND p.die_id <> a.die_id
            ORDER BY p.plate_number
            """
        )
        return {
            "unplated_artworks": [dict(r) for r in unplated],
            "empty_plates": [dict(r) for r in empty_plates],
            "kld_mismatches": [dict(r) for r in mismatched],
        }

    @router.get("/reports/geometry")
    async def report_geometry(
        tolerance: float = 0.5,
        min_web: float = 320.0,
        max_web: float = 650.0,
        gutter: float = 3.0,
        margin: float = 5.0,
        _: bool = Depends(require_admin),
    ):
        """
        Geometric scan: does every artwork actually fit the die and mould it is
        patched to, and does every die fit the press?

        The reconciliation report compares which records point at which. This
        one compares their dimensions, which is where the real trouble hides —
        an artwork can be patched to the right KLD and still be the wrong size
        for it.
        """
        tol = max(0.0, float(tolerance))
        issues = []

        def near(a, b):
            return a is not None and b is not None and abs(float(a) - float(b)) <= tol

        rows = await database.fetch_all(
            """
            SELECT a.id, a.code, a.name, a.width, a.height, a.die_id, a.mould_id,
                   c.name AS customer_name,
                   d.kld_number, d.label_width AS die_w, d.label_height AS die_h,
                   d.ups_across, d.ups_around,
                   mo.mould_code, mo.label_width AS mould_w, mo.label_height AS mould_h
            FROM vault_artworks a
            LEFT JOIN vault_customers c ON c.id = a.customer_id
            LEFT JOIN vault_dies d ON d.id = a.die_id
            LEFT JOIN vault_moulds mo ON mo.id = a.mould_id
            ORDER BY c.name, a.code
            """
        )

        checked = 0
        for r in rows:
            aw, ah = r["width"], r["height"]
            label = f'{r["code"]}{" — " + r["name"] if r["name"] else ""}'

            if aw is None or ah is None:
                issues.append({
                    "kind": "artwork_size_missing",
                    "severity": "info",
                    "subject": label,
                    "customer": r["customer_name"],
                    "message": "No size recorded, so it cannot be scanned.",
                })
                continue

            checked += 1

            for ref, code, rw, rh in (
                ("KLD", r["kld_number"], r["die_w"], r["die_h"]),
                ("mould", r["mould_code"], r["mould_w"], r["mould_h"]),
            ):
                if not code or rw is None or rh is None:
                    continue
                if near(aw, rw) and near(ah, rh):
                    continue
                turned = near(aw, rh) and near(ah, rw)
                issues.append({
                    "kind": "turned_against_reference" if turned else "size_mismatch",
                    "severity": "warning" if turned else "error",
                    "subject": label,
                    "customer": r["customer_name"],
                    "reference": f"{ref} {code}",
                    "expected": f"{rw} x {rh}",
                    "actual": f"{aw} x {ah}",
                    "message": (
                        f"Artwork is turned 90 degrees against {ref} {code}."
                        if turned
                        else f"Artwork does not match {ref} {code}."
                    ),
                })

        # Every artwork on one die is cut by that die, so they must agree in size.
        by_die = {}
        for r in rows:
            if not r["die_id"] or r["width"] is None or r["height"] is None:
                continue
            key = (round(float(r["width"]), 3), round(float(r["height"]), 3))
            by_die.setdefault((r["die_id"], r["kld_number"]), {}).setdefault(key, []).append(r["code"])
        for (die_id, kld), sizes in by_die.items():
            if len(sizes) > 1:
                detail = "; ".join(
                    f'{w} x {h}: {", ".join(codes)}' for (w, h), codes in sorted(sizes.items())
                )
                issues.append({
                    "kind": "die_sizes_disagree",
                    "severity": "error",
                    "subject": f"KLD {kld}",
                    "message": f"Artworks on this die are different sizes — {detail}.",
                })

        # A die whose lanes cannot fit the press is a die that cannot be run.
        dies = await database.fetch_all("SELECT * FROM vault_dies")
        for d in dies:
            if d["label_width"] is None or not d["ups_across"]:
                continue
            across = int(d["ups_across"])
            needed = across * float(d["label_width"]) + max(0, across - 1) * gutter + 2 * margin
            if needed > max_web + 1e-9:
                issues.append({
                    "kind": "wider_than_press",
                    "severity": "error",
                    "subject": f'KLD {d["kld_number"]}',
                    "expected": f"at most {max_web}",
                    "actual": f"{round(needed, 2)}",
                    "message": (
                        f"{across} across at {d['label_width']} needs {round(needed, 2)} mm, "
                        f"wider than the {max_web} mm press."
                    ),
                })
            elif needed < min_web - 1e-9:
                issues.append({
                    "kind": "narrower_than_minimum",
                    "severity": "warning",
                    "subject": f'KLD {d["kld_number"]}',
                    "expected": f"at least {min_web}",
                    "actual": f"{round(needed, 2)}",
                    "message": (
                        f"{across} across needs only {round(needed, 2)} mm, under the {min_web} mm "
                        f"minimum print width — the run is charged at the minimum."
                    ),
                })

        # A plate repeat has to hold the rows the die expects.
        plates = await database.fetch_all(
            """
            SELECT p.plate_number, p.repeat_mm, d.kld_number, d.label_height, d.ups_around
            FROM vault_plates p JOIN vault_dies d ON d.id = p.die_id
            WHERE p.repeat_mm IS NOT NULL AND d.label_height IS NOT NULL AND d.ups_around IS NOT NULL
            """
        )
        for p in plates:
            needed = float(p["label_height"]) * int(p["ups_around"])
            if float(p["repeat_mm"]) + 1e-9 < needed:
                issues.append({
                    "kind": "repeat_too_short",
                    "severity": "error",
                    "subject": f'Plate {p["plate_number"]}',
                    "reference": f'KLD {p["kld_number"]}',
                    "expected": f"at least {round(needed, 2)}",
                    "actual": f'{p["repeat_mm"]}',
                    "message": (
                        f'{p["ups_around"]} rows of {p["label_height"]} need {round(needed, 2)} mm, '
                        f'but the repeat is {p["repeat_mm"]} mm.'
                    ),
                })

        counts = {"error": 0, "warning": 0, "info": 0}
        for i in issues:
            counts[i["severity"]] = counts.get(i["severity"], 0) + 1

        return {
            "scanned_at": _now(),
            "artworks_total": len(rows),
            "artworks_checked": checked,
            "dies_total": len(dies),
            "tolerance": tol,
            "counts": counts,
            "clean": counts["error"] == 0 and counts["warning"] == 0,
            "issues": issues,
        }

    @router.get("/reports/cost")
    async def report_cost(_: bool = Depends(require_admin)):
        """Plate spend by who paid, by vendor, and per customer via the plate lines."""
        by_payer = await database.fetch_all(
            """
            SELECT COALESCE(paid_by, 'unspecified') AS paid_by,
                   COUNT(*) AS plates,
                   COALESCE(SUM(actual_cost_minor), 0) AS total_minor
            FROM vault_plates GROUP BY COALESCE(paid_by, 'unspecified') ORDER BY total_minor DESC
            """
        )
        by_vendor = await database.fetch_all(
            """
            SELECT COALESCE(v.name, 'unassigned') AS vendor,
                   COUNT(*) AS plates,
                   COALESCE(SUM(p.actual_cost_minor), 0) AS total_minor
            FROM vault_plates p LEFT JOIN vault_vendors v ON v.id = p.vendor_id
            GROUP BY COALESCE(v.name, 'unassigned') ORDER BY total_minor DESC
            """
        )
        by_customer = await database.fetch_all(
            """
            SELECT COALESCE(c.name, 'unassigned') AS customer,
                   COUNT(DISTINCT l.plate_id) AS plates,
                   COALESCE(SUM(l.cost_share_minor), 0) AS share_minor
            FROM vault_plate_lines l
            LEFT JOIN vault_artworks a ON a.id = l.artwork_id
            LEFT JOIN vault_customers c ON c.id = a.customer_id
            GROUP BY COALESCE(c.name, 'unassigned') ORDER BY share_minor DESC
            """
        )
        total = await database.fetch_one(
            "SELECT COALESCE(SUM(actual_cost_minor), 0) AS total_minor, COUNT(*) AS plates FROM vault_plates"
        )
        # Cost shares that do not add up to the plate cost are worth flagging.
        unbalanced = await database.fetch_all(
            """
            SELECT p.id, p.plate_number, p.actual_cost_minor,
                   COALESCE((SELECT SUM(l.cost_share_minor) FROM vault_plate_lines l WHERE l.plate_id = p.id), 0) AS shared_minor
            FROM vault_plates p
            WHERE p.actual_cost_minor IS NOT NULL
              AND p.actual_cost_minor <> COALESCE(
                    (SELECT SUM(l.cost_share_minor) FROM vault_plate_lines l WHERE l.plate_id = p.id), 0)
            ORDER BY p.plate_number
            """
        )
        return {
            "by_payer": [dict(r) for r in by_payer],
            "by_vendor": [dict(r) for r in by_vendor],
            "by_customer": [dict(r) for r in by_customer],
            "total": dict(total) if total else {"total_minor": 0, "plates": 0},
            "unbalanced_plates": [dict(r) for r in unbalanced],
        }

    @router.get("/reports/plate-charges")
    async def report_plate_charges(_: bool = Depends(require_admin)):
        """
        Every plate with both sides of its money: what it cost the company and
        what the customer was charged for it under whichever policy applies.
        """
        rows = await database.fetch_all(
            """
            SELECT p.*, v.name AS vendor_name, d.kld_number, mo.mould_code,
                   c.name AS charge_customer_name,
                   COALESCE((SELECT SUM(o.quantity) FROM vault_orders o
                             WHERE o.plate_id = p.id AND o.status IN ('running', 'closed')), 0) AS delivered_qty,
                   (SELECT COUNT(*) FROM vault_orders o WHERE o.plate_id = p.id) AS order_count
            FROM vault_plates p
            LEFT JOIN vault_vendors v ON v.id = p.vendor_id
            LEFT JOIN vault_dies d ON d.id = p.die_id
            LEFT JOIN vault_moulds mo ON mo.id = p.mould_id
            LEFT JOIN vault_customers c ON c.id = p.charge_customer_id
            ORDER BY p.made_on DESC, p.plate_number
            """
        )
        items, totals = [], {
            "cost_to_company_minor": 0,
            "cost_to_customer_minor": 0,
            "refund_outstanding_minor": 0,
            "net_to_company_minor": 0,
        }
        for r in rows:
            row = dict(r)
            charge = plate_charge(row, row.get("delivered_qty") or 0)
            for key in totals:
                totals[key] += charge[key]
            items.append({**row, **charge})
        return {
            "items": items,
            "totals": totals,
            # Plates that have earned their refund but have not been credited yet.
            "refunds_due": [i for i in items if i["refund_outstanding_minor"] > 0],
            "absorbed": [i for i in items if i["charge_policy"] == "none" and i["cost_to_company_minor"] > 0],
        }

    @router.get("/reports/orders")
    async def report_orders(_: bool = Depends(require_admin)):
        """The CRM-to-design board: where every order is, and which are repeats."""
        rows = await database.fetch_all(f"{ORDER_SELECT} ORDER BY o.ordered_on DESC, o.order_number")
        items = [dict(r) for r in rows]
        by_status = {
            status: [i for i in items if (i["status"] or "crm_raised") == status] for status in ORDER_STATUSES
        }
        waiting = [
            i for i in items
            if (i["status"] or "crm_raised") in ("crm_raised", "design_wip")
        ]
        return {
            "items": items,
            "statuses": ORDER_STATUSES,
            "counts": {k: len(v) for k, v in by_status.items()},
            "quantity_by_status": {
                k: sum(int(i["quantity"] or 0) for i in v) for k, v in by_status.items()
            },
            # What design still owes CRM.
            "waiting_on_design": waiting,
            "repeats": [i for i in items if i["parent_order_id"]],
            "no_plate_yet": [i for i in items if not i["plate_id"]],
        }

    @router.get("/reports/artworks.csv")
    async def export_artworks_csv(_: bool = Depends(require_admin)):
        rows = await database.fetch_all(
            """
            SELECT c.name AS customer, a.code, a.name, d.kld_number, mo.mould_code,
                   a.width, a.height, a.colours, a.version, a.status,
                   (SELECT COUNT(*) FROM vault_plate_lines l WHERE l.artwork_id = a.id) AS plates
            FROM vault_artworks a
            LEFT JOIN vault_customers c ON c.id = a.customer_id
            LEFT JOIN vault_dies d ON d.id = a.die_id
            LEFT JOIN vault_moulds mo ON mo.id = a.mould_id
            ORDER BY c.name, a.code
            """
        )
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(
            ["Customer", "Artwork code", "Artwork name", "KLD", "Mould", "Width", "Height",
             "Colours", "Version", "Status", "Plates"]
        )
        for r in rows:
            writer.writerow([r[k] if r[k] is not None else "" for k in r.keys()])
        buffer.seek(0)
        return StreamingResponse(
            iter([buffer.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=artworks.csv"},
        )

    # ---- generic CRUD ----------------------------------------------------

    @router.get("/{entity}")
    async def list_entity(entity: str, _: bool = Depends(require_admin)):
        if entity not in ENTITIES:
            raise HTTPException(status_code=404, detail="Unknown record type")
        table, _model, fields, order = ENTITIES[entity]
        rows = await database.fetch_all(f"SELECT * FROM {table} ORDER BY {order}")
        return {"items": [dict(r) for r in rows]}

    @router.post("/{entity}")
    async def create_entity(entity: str, body: dict, _: bool = Depends(require_admin)):
        if entity not in ENTITIES:
            raise HTTPException(status_code=404, detail="Unknown record type")
        table, model, fields, _order = ENTITIES[entity]
        data = model(**body).model_dump()
        await _check_refs(entity, data)
        row = {"id": _new_id(), "created_at": _now(), **{f: data.get(f) for f in fields}}
        cols = ", ".join(row.keys())
        vals = ", ".join(f":{k}" for k in row.keys())
        await database.execute(f"INSERT INTO {table} ({cols}) VALUES ({vals})", row)
        return row

    @router.put("/{entity}/{row_id}")
    async def update_entity(entity: str, row_id: str, body: dict, _: bool = Depends(require_admin)):
        if entity not in ENTITIES:
            raise HTTPException(status_code=404, detail="Unknown record type")
        table, model, fields, _order = ENTITIES[entity]
        existing = await database.fetch_one(f"SELECT * FROM {table} WHERE id = :id", {"id": row_id})
        if not existing:
            raise HTTPException(status_code=404, detail="Not found")
        merged = {**dict(existing), **{k: v for k, v in body.items() if k in fields}}
        data = model(**{f: merged.get(f) for f in fields}).model_dump()
        await _check_refs(entity, data)
        sets = ", ".join(f"{f} = :{f}" for f in fields)
        await database.execute(
            f"UPDATE {table} SET {sets} WHERE id = :id", {"id": row_id, **{f: data.get(f) for f in fields}}
        )
        row = await database.fetch_one(f"SELECT * FROM {table} WHERE id = :id", {"id": row_id})
        return dict(row)

    @router.delete("/{entity}/{row_id}")
    async def delete_entity(entity: str, row_id: str, _: bool = Depends(require_admin)):
        if entity not in ENTITIES:
            raise HTTPException(status_code=404, detail="Unknown record type")
        table, _model, _fields, _order = ENTITIES[entity]

        # Refuse to orphan records rather than silently breaking the links.
        guards = {
            "moulders": [("vault_customers", "moulder_id", "customers"), ("vault_moulds", "moulder_id", "moulds")],
            "customers": [
                ("vault_artworks", "customer_id", "artworks"),
                ("vault_plates", "charge_customer_id", "plates"),
                ("vault_orders", "customer_id", "orders"),
            ],
            "dies": [
                ("vault_artworks", "die_id", "artworks"),
                ("vault_plates", "die_id", "plates"),
                ("vault_orders", "die_id", "orders"),
            ],
            "moulds": [("vault_artworks", "mould_id", "artworks"), ("vault_plates", "mould_id", "plates")],
            "vendors": [("vault_plates", "vendor_id", "plates")],
            "artworks": [("vault_plate_lines", "artwork_id", "plates"), ("vault_orders", "artwork_id", "orders")],
        }
        for child_table, column, label in guards.get(entity, []):
            row = await database.fetch_one(
                f"SELECT COUNT(*) AS n FROM {child_table} WHERE {column} = :id", {"id": row_id}
            )
            if row and row["n"]:
                raise HTTPException(
                    status_code=409, detail=f"Still used by {row['n']} {label}. Remove those first."
                )

        if entity == "artworks":
            files = await database.fetch_all(
                "SELECT stored FROM vault_artwork_files WHERE artwork_id = :id", {"id": row_id}
            )
            for f in files:
                p = art_dir / (f["stored"] or "")
                if f["stored"] and p.exists():
                    p.unlink()
            await database.execute("DELETE FROM vault_artwork_files WHERE artwork_id = :id", {"id": row_id})

        await database.execute(f"DELETE FROM {table} WHERE id = :id", {"id": row_id})
        return {"ok": True}

    return router
