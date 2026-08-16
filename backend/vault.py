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

# Cost is stored in paise/cents as an integer so money never drifts.
CURRENCY_MINOR = 100


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
]


async def ensure_schema(database):
    for statement in SCHEMA:
        await database.execute(statement)


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
    made_on: Optional[str] = None
    repeat_mm: Optional[float] = None
    web_width: Optional[float] = None
    actual_cost_minor: Optional[int] = None
    currency: Optional[str] = "INR"
    paid_by: Optional[str] = None
    paid_by_note: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    lines: List[PlateLine] = Field(default_factory=list)


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
        return {**dict(plate), "lines": [dict(r) for r in lines]}

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
            SELECT p.*, v.name AS vendor_name, d.kld_number,
                   (SELECT COUNT(*) FROM vault_plate_lines l WHERE l.plate_id = p.id) AS artwork_count
            FROM vault_plates p
            LEFT JOIN vault_vendors v ON v.id = p.vendor_id
            LEFT JOIN vault_dies d ON d.id = p.die_id
            ORDER BY p.made_on DESC, p.plate_number
            """
        )
        return {"items": [dict(r) for r in rows]}

    @router.get("/plates/{plate_id}")
    async def get_plate(plate_id: str, _: bool = Depends(require_admin)):
        return await _plate_with_lines(plate_id)

    @router.post("/plates")
    async def create_plate(body: Plate, _: bool = Depends(require_admin)):
        if body.paid_by and body.paid_by not in PAID_BY:
            raise HTTPException(status_code=400, detail=f"paid_by must be one of {sorted(PAID_BY)}")
        data = body.model_dump()
        lines = [PlateLine(**line) for line in data.pop("lines", [])]
        await _check_refs("plates", data)
        plate_id = _new_id()
        row = {"id": plate_id, "created_at": _now(), **data}
        cols = ", ".join(row.keys())
        vals = ", ".join(f":{k}" for k in row.keys())
        await database.execute(f"INSERT INTO vault_plates ({cols}) VALUES ({vals})", row)
        await _write_lines(plate_id, lines)
        return await _plate_with_lines(plate_id)

    @router.put("/plates/{plate_id}")
    async def update_plate(plate_id: str, body: Plate, _: bool = Depends(require_admin)):
        existing = await database.fetch_one("SELECT id FROM vault_plates WHERE id = :id", {"id": plate_id})
        if not existing:
            raise HTTPException(status_code=404, detail="Not found")
        if body.paid_by and body.paid_by not in PAID_BY:
            raise HTTPException(status_code=400, detail=f"paid_by must be one of {sorted(PAID_BY)}")
        data = body.model_dump()
        lines = [PlateLine(**line) for line in data.pop("lines", [])]
        await _check_refs("plates", data)
        sets = ", ".join(f"{k} = :{k}" for k in data.keys())
        await database.execute(f"UPDATE vault_plates SET {sets} WHERE id = :id", {"id": plate_id, **data})
        await _write_lines(plate_id, lines)
        return await _plate_with_lines(plate_id)

    @router.delete("/plates/{plate_id}")
    async def delete_plate(plate_id: str, _: bool = Depends(require_admin)):
        await database.execute("DELETE FROM vault_plate_lines WHERE plate_id = :id", {"id": plate_id})
        await database.execute("DELETE FROM vault_plates WHERE id = :id", {"id": plate_id})
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
            "customers": [("vault_artworks", "customer_id", "artworks")],
            "dies": [("vault_artworks", "die_id", "artworks"), ("vault_plates", "die_id", "plates")],
            "moulds": [("vault_artworks", "mould_id", "artworks")],
            "vendors": [("vault_plates", "vendor_id", "plates")],
            "artworks": [("vault_plate_lines", "artwork_id", "plates")],
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
