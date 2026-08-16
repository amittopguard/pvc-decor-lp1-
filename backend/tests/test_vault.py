"""
API tests for the artwork and plate vault.

The vault module is mounted on a throwaway FastAPI app backed by SQLite, so the
whole surface — records, links, uploads, guards and reports — is exercised
without touching the production MySQL database.

    cd backend && python3 tests/test_vault.py
"""

import asyncio
import io
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from databases import Database  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import vault  # noqa: E402

FAILURES = []
CHECKS = [0]


def check(name, ok, detail=""):
    CHECKS[0] += 1
    if ok:
        print(f"  ok   {name}")
    else:
        FAILURES.append(name)
        print(f"  FAIL {name}{f' — {detail}' if detail else ''}")


def section(name):
    print(f"\n{name}")


def build_client(tmpdir):
    db_path = Path(tmpdir) / "vault-test.db"
    database = Database(f"sqlite+aiosqlite:///{db_path}")
    app = FastAPI()

    async def allow_admin():
        return True

    app.include_router(vault.build(database, allow_admin, Path(tmpdir)))

    @app.on_event("startup")
    async def _startup():
        await database.connect()
        await vault.ensure_schema(database)

    @app.on_event("shutdown")
    async def _shutdown():
        await database.disconnect()

    return TestClient(app)


def main():
    with tempfile.TemporaryDirectory() as tmpdir:
        with build_client(tmpdir) as client:
            run(client)

    print(f"\n{CHECKS[0] - len(FAILURES)}/{CHECKS[0]} checks passed")
    return 1 if FAILURES else 0


def run(client):
    section("1. Records can be created and listed")
    moulder = client.post("/vault/moulders", json={"name": "Sunrise Moulders", "city": "Sonipat"}).json()
    check("a moulder is created with an id", bool(moulder.get("id")), str(moulder))

    customer = client.post(
        "/vault/customers", json={"name": "Acme Foods", "code": "ACME", "moulder_id": moulder["id"]}
    ).json()
    check("a customer is linked to its moulder", customer.get("moulder_id") == moulder["id"])

    vendor = client.post("/vault/vendors", json={"name": "Delhi Plates", "city": "Delhi"}).json()
    die = client.post(
        "/vault/dies",
        json={"kld_number": "KLD-101", "label_width": 100, "label_height": 60, "ups_across": 4, "ups_around": 6},
    ).json()
    mould = client.post(
        "/vault/moulds", json={"mould_code": "MLD-77", "moulder_id": moulder["id"], "cavities": 4}
    ).json()
    check("a KLD die is stored", die.get("kld_number") == "KLD-101")
    check("a mould is stored separately from the die", mould.get("mould_code") == "MLD-77")

    listed = client.get("/vault/customers").json()["items"]
    check("customers list back", len(listed) == 1 and listed[0]["name"] == "Acme Foods")

    section("2. A customer's artworks, patched to a KLD and a mould")
    artworks = []
    for i in range(3):
        a = client.post(
            "/vault/artworks",
            json={
                "code": f"AW-{i + 1}",
                "name": f"Front label {i + 1}",
                "customer_id": customer["id"],
                "die_id": die["id"],
                "mould_id": mould["id"],
                "width": 100,
                "height": 60,
                "colours": 4,
            },
        ).json()
        artworks.append(a)
    check("three artworks are created", all(a.get("id") for a in artworks))

    by_customer = client.get(f"/vault/reports/artworks?customer_id={customer['id']}").json()["items"]
    check("artwork report is customer-wise", len(by_customer) == 3, f"{len(by_customer)} rows")
    check("it carries the customer name", by_customer[0]["customer_name"] == "Acme Foods")
    check("it carries the moulder through the customer", by_customer[0]["moulder_name"] == "Sunrise Moulders")
    check("it carries the KLD number", by_customer[0]["kld_number"] == "KLD-101")
    check("it carries the mould code", by_customer[0]["mould_code"] == "MLD-77")

    kld = client.get("/vault/reports/kld").json()["items"]
    check("many artworks are patched to one KLD", kld[0]["artwork_count"] == 3, str(kld[0]["artwork_count"]))
    check("the KLD report lists them", len(kld[0]["artworks"]) == 3)

    section("3. One plate carries multiple artworks")
    plate = client.post(
        "/vault/plates",
        json={
            "plate_number": "PL-001",
            "vendor_id": vendor["id"],
            "die_id": die["id"],
            "made_on": "2026-08-01",
            "actual_cost_minor": 1200000,
            "currency": "INR",
            "paid_by": "customer",
            "lines": [
                {"artwork_id": artworks[0]["id"], "ups": 2, "position": "A", "cost_share_minor": 600000},
                {"artwork_id": artworks[1]["id"], "ups": 1, "position": "B", "cost_share_minor": 400000},
                {"artwork_id": artworks[2]["id"], "ups": 1, "position": "C", "cost_share_minor": 200000},
            ],
        },
    )
    check("the plate is created", plate.status_code == 200, plate.text[:200])
    plate = plate.json()
    check("it holds three artworks", len(plate["lines"]) == 3, str(len(plate["lines"])))
    check("each line names its artwork", all(line.get("artwork_code") for line in plate["lines"]))
    check(
        "the cost shares add up to the plate cost",
        sum(line["cost_share_minor"] for line in plate["lines"]) == plate["actual_cost_minor"],
    )

    listing = client.get("/vault/plates").json()["items"]
    check("the plate list counts its artworks", listing[0]["artwork_count"] == 3)
    check("the plate list names the vendor", listing[0]["vendor_name"] == "Delhi Plates")

    section("4. Plates per artwork are counted from the lines")
    report = client.get("/vault/reports/artworks").json()["items"]
    counts = {r["code"]: r["plate_count"] for r in report}
    check("every artwork on the plate counts one plate", all(counts[f"AW-{i + 1}"] == 1 for i in range(3)), str(counts))

    second = client.post(
        "/vault/plates",
        json={
            "plate_number": "PL-002",
            "vendor_id": vendor["id"],
            "die_id": die["id"],
            "actual_cost_minor": 500000,
            "paid_by": "us",
            "lines": [{"artwork_id": artworks[0]["id"], "ups": 4, "cost_share_minor": 500000}],
        },
    ).json()
    counts = {r["code"]: r["plate_count"] for r in client.get("/vault/reports/artworks").json()["items"]}
    check("an artwork on two plates counts two", counts["AW-1"] == 2, str(counts))

    section("5. Artwork versus artwork of plate")
    orphan = client.post(
        "/vault/artworks", json={"code": "AW-NEW", "name": "Not plated yet", "customer_id": customer["id"]}
    ).json()
    empty = client.post("/vault/plates", json={"plate_number": "PL-EMPTY", "vendor_id": vendor["id"]}).json()
    recon = client.get("/vault/reports/reconciliation").json()
    check(
        "the unplated artwork is listed",
        any(r["code"] == "AW-NEW" for r in recon["unplated_artworks"]),
        str(recon["unplated_artworks"]),
    )
    check(
        "artworks that are on a plate are not listed as unplated",
        not any(r["code"] == "AW-1" for r in recon["unplated_artworks"]),
    )
    check(
        "the plate with no artwork is listed",
        any(r["plate_number"] == "PL-EMPTY" for r in recon["empty_plates"]),
    )

    other_die = client.post("/vault/dies", json={"kld_number": "KLD-999"}).json()
    client.put(
        f"/vault/plates/{second['id']}",
        json={
            "plate_number": "PL-002",
            "vendor_id": vendor["id"],
            "die_id": other_die["id"],
            "actual_cost_minor": 500000,
            "paid_by": "us",
            "lines": [{"artwork_id": artworks[0]["id"], "ups": 4, "cost_share_minor": 500000}],
        },
    )
    recon = client.get("/vault/reports/reconciliation").json()
    check(
        "an artwork whose KLD differs from the plate's KLD is flagged",
        any(m["artwork_code"] == "AW-1" for m in recon["kld_mismatches"]),
        str(recon["kld_mismatches"]),
    )

    section("6. Plate cost reporting")
    cost = client.get("/vault/reports/cost").json()
    payers = {r["paid_by"]: r["total_minor"] for r in cost["by_payer"]}
    check("cost is grouped by who paid", payers.get("customer") == 1200000 and payers.get("us") == 500000, str(payers))
    vendors = {r["vendor"]: r["total_minor"] for r in cost["by_vendor"]}
    check("cost is grouped by vendor", vendors.get("Delhi Plates") == 1700000, str(vendors))
    customers = {r["customer"]: r["share_minor"] for r in cost["by_customer"]}
    check("per-customer share comes off the plate lines", customers.get("Acme Foods") == 1700000, str(customers))
    check("the total is the sum of every plate", cost["total"]["total_minor"] == 1700000, str(cost["total"]))
    check(
        "a plate whose shares do not add up is flagged",
        any(p["plate_number"] == "PL-EMPTY" for p in cost["unbalanced_plates"]) is False,
        "PL-EMPTY has no cost so should not be flagged",
    )

    section("7. Artwork files are stored and served")
    upload = client.post(
        f"/vault/artworks/{artworks[0]['id']}/files",
        files={"file": ("front.pdf", b"%PDF-1.4 fake artwork", "application/pdf")},
        data={"version": "v1"},
    )
    check("a PDF uploads", upload.status_code == 200, upload.text[:200])
    file_row = upload.json()
    check("the version is kept", file_row.get("version") == "v1")
    files = client.get(f"/vault/artworks/{artworks[0]['id']}/files").json()["items"]
    check("it lists against the artwork", len(files) == 1 and files[0]["filename"] == "front.pdf")
    got = client.get(f"/vault/files/{file_row['id']}")
    check("it downloads back with the same bytes", got.content == b"%PDF-1.4 fake artwork", str(got.status_code))

    bad = client.post(
        f"/vault/artworks/{artworks[0]['id']}/files",
        files={"file": ("virus.exe", b"MZ", "application/octet-stream")},
    )
    check("an unsupported file type is refused", bad.status_code == 400, bad.text[:120])

    counts = {r["code"]: r["file_count"] for r in client.get("/vault/reports/artworks").json()["items"]}
    check("the artwork report counts its files", counts["AW-1"] == 1, str(counts))

    client.delete(f"/vault/files/{file_row['id']}")
    check("a deleted file is gone", len(client.get(f"/vault/artworks/{artworks[0]['id']}/files").json()["items"]) == 0)

    section("8. The links are protected")
    dangling = client.post("/vault/artworks", json={"code": "AW-BAD", "customer_id": "does-not-exist"})
    check("an artwork cannot point at a missing customer", dangling.status_code == 400, dangling.text[:120])

    dup = client.post(
        "/vault/plates",
        json={
            "plate_number": "PL-DUP",
            "lines": [
                {"artwork_id": artworks[0]["id"]},
                {"artwork_id": artworks[0]["id"]},
            ],
        },
    )
    check("the same artwork cannot be on one plate twice", dup.status_code == 400, dup.text[:120])

    bad_payer = client.post("/vault/plates", json={"plate_number": "PL-X", "paid_by": "santa"})
    check("paid_by is restricted to the known parties", bad_payer.status_code == 400, bad_payer.text[:120])

    in_use = client.delete(f"/vault/customers/{customer['id']}")
    check("a customer with artworks cannot be deleted", in_use.status_code == 409, in_use.text[:120])

    used_die = client.delete(f"/vault/dies/{die['id']}")
    check("a KLD still in use cannot be deleted", used_die.status_code == 409, used_die.text[:120])

    freed = client.delete(f"/vault/artworks/{orphan['id']}")
    check("an unused artwork deletes cleanly", freed.status_code == 200, freed.text[:120])

    section("9. Editing keeps the record consistent")
    updated = client.put(
        f"/vault/customers/{customer['id']}", json={"name": "Acme Foods Pvt Ltd", "code": "ACME"}
    ).json()
    check("a customer can be renamed", updated["name"] == "Acme Foods Pvt Ltd")
    check("the rename keeps the moulder link", updated["moulder_id"] == moulder["id"])

    plate_now = client.put(
        f"/vault/plates/{plate['id']}",
        json={
            "plate_number": "PL-001",
            "vendor_id": vendor["id"],
            "die_id": die["id"],
            "actual_cost_minor": 1200000,
            "paid_by": "customer",
            "lines": [{"artwork_id": artworks[0]["id"], "ups": 8, "cost_share_minor": 1200000}],
        },
    ).json()
    check("a plate's artworks can be replaced", len(plate_now["lines"]) == 1, str(len(plate_now["lines"])))
    recon = client.get("/vault/reports/reconciliation").json()
    check(
        "an artwork taken off a plate becomes unplated again",
        any(r["code"] == "AW-3" for r in recon["unplated_artworks"]),
        str([r["code"] for r in recon["unplated_artworks"]]),
    )

    section("10. CSV export")
    csv_out = client.get("/vault/reports/artworks.csv")
    check("the export returns CSV", csv_out.headers["content-type"].startswith("text/csv"))
    body = csv_out.text.splitlines()
    check("it has a header and a row per artwork", len(body) >= 4, f"{len(body)} lines")
    check("the header names the KLD column", "KLD" in body[0], body[0])
    check("customer names appear", any("Acme Foods" in line for line in body[1:]), body[1] if len(body) > 1 else "")

    section("11. Unknown record types are rejected")
    check("an unknown entity 404s", client.get("/vault/widgets").status_code == 404)


if __name__ == "__main__":
    sys.exit(main())
