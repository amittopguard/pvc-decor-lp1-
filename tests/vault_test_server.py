"""
A throwaway vault API for the browser check.

Mounts the real vault module and the real admin-token flow on a SQLite file, so
the frontend is driven against the same request/response path it will use in
production, without touching the production database.

    python3 tests/vault_test_server.py 4191
"""

import base64
import hashlib
import hmac
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

BACKEND = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND))

import uvicorn  # noqa: E402
from databases import Database  # noqa: E402
from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException  # noqa: E402
from starlette.middleware.cors import CORSMiddleware  # noqa: E402
from pydantic import BaseModel  # noqa: E402

import vault  # noqa: E402

PASSWORD = "test-password"
SECRET = "test-secret"


def _sign(payload: str) -> str:
    return hmac.new(SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()[:32]


def make_token(hours: int = 8) -> str:
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


class Login(BaseModel):
    password: str


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4191
    tmpdir = Path(tempfile.mkdtemp(prefix="vault-browser-"))
    database = Database(f"sqlite+aiosqlite:///{tmpdir / 'vault.db'}")

    app = FastAPI()
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

    api = APIRouter(prefix="/api")

    @api.post("/admin/login")
    async def login(body: Login):
        if body.password != PASSWORD:
            raise HTTPException(status_code=401, detail="Wrong password")
        return {"token": make_token()}

    api.include_router(vault.build(database, require_admin, tmpdir))
    app.include_router(api)

    @app.on_event("startup")
    async def startup():
        await database.connect()
        await vault.ensure_schema(database)

    @app.on_event("shutdown")
    async def shutdown():
        await database.disconnect()

    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")


if __name__ == "__main__":
    main()
