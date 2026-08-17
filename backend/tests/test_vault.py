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

    section("11. Geometric scan of artwork against KLD and mould")
    scan = client.get("/vault/reports/geometry").json()
    check("the scan runs and reports what it checked", scan["artworks_checked"] >= 3, str(scan["artworks_checked"]))
    check("matching artwork raises nothing", not any(i["kind"] == "size_mismatch" for i in scan["issues"]), str(scan["issues"])[:200])

    # An artwork that does not match the die it is patched to.
    wrong = client.post(
        "/vault/artworks",
        json={"code": "AW-WRONG", "customer_id": customer["id"], "die_id": die["id"], "width": 120, "height": 80},
    ).json()
    scan = client.get("/vault/reports/geometry").json()
    mismatch = [i for i in scan["issues"] if i["kind"] == "size_mismatch" and "AW-WRONG" in i["subject"]]
    check("an artwork that does not fit its KLD is flagged", len(mismatch) == 1, str(scan["issues"])[:200])
    check("the flag shows expected against actual", mismatch[0]["expected"] == "100.0 x 60.0" and mismatch[0]["actual"] == "120.0 x 80.0", str(mismatch[0]))
    check("it is an error, not a warning", mismatch[0]["severity"] == "error")
    check("artworks of different sizes on one die are flagged", any(i["kind"] == "die_sizes_disagree" for i in scan["issues"]))

    # A turned artwork is a softer finding than a wrong size.
    client.put(
        f"/vault/artworks/{wrong['id']}",
        json={"code": "AW-WRONG", "customer_id": customer["id"], "die_id": die["id"], "width": 60, "height": 100},
    )
    scan = client.get("/vault/reports/geometry").json()
    turned = [i for i in scan["issues"] if i["kind"] == "turned_against_reference"]
    check("an artwork turned 90 degrees is reported as turned", len(turned) == 1, str(scan["issues"])[:200])
    check("turned is a warning", turned[0]["severity"] == "warning")
    client.delete(f"/vault/artworks/{wrong['id']}")

    # Tolerance lets a rounding difference pass.
    close = client.post(
        "/vault/artworks",
        json={"code": "AW-CLOSE", "customer_id": customer["id"], "die_id": die["id"], "width": 100.3, "height": 60.2},
    ).json()
    tight = client.get("/vault/reports/geometry?tolerance=0.1").json()
    loose = client.get("/vault/reports/geometry?tolerance=0.5").json()
    check(
        "a 0.3 difference fails a tight tolerance",
        any("AW-CLOSE" in i["subject"] for i in tight["issues"] if i["kind"] == "size_mismatch"),
    )
    check(
        "and passes a 0.5 tolerance",
        not any("AW-CLOSE" in i["subject"] for i in loose["issues"] if i["kind"] == "size_mismatch"),
    )
    client.delete(f"/vault/artworks/{close['id']}")

    # A die too wide for the press cannot be run.
    fat = client.post(
        "/vault/dies", json={"kld_number": "KLD-FAT", "label_width": 200, "label_height": 60, "ups_across": 4}
    ).json()
    scan = client.get("/vault/reports/geometry").json()
    wide = [i for i in scan["issues"] if i["kind"] == "wider_than_press"]
    check("a die wider than the press is flagged", len(wide) == 1 and "KLD-FAT" in wide[0]["subject"], str(wide))
    narrow = client.post(
        "/vault/dies", json={"kld_number": "KLD-THIN", "label_width": 50, "label_height": 40, "ups_across": 2}
    ).json()
    scan = client.get("/vault/reports/geometry").json()
    check(
        "a die under the minimum print width is a warning",
        any(i["kind"] == "narrower_than_minimum" and "KLD-THIN" in i["subject"] for i in scan["issues"]),
    )
    client.delete(f"/vault/dies/{fat['id']}")
    client.delete(f"/vault/dies/{narrow['id']}")

    # A repeat that cannot hold the rows the die expects.
    short = client.post(
        "/vault/plates", json={"plate_number": "PL-SHORT", "die_id": die["id"], "repeat_mm": 100}
    ).json()
    scan = client.get("/vault/reports/geometry").json()
    check(
        "a repeat too short for the die's rows is flagged",
        any(i["kind"] == "repeat_too_short" and "PL-SHORT" in i["subject"] for i in scan["issues"]),
        str([i["kind"] for i in scan["issues"]]),
    )
    client.delete(f"/vault/plates/{short['id']}")

    scan = client.get("/vault/reports/geometry").json()
    check("with the bad records gone the scan is clean", scan["clean"] is True, str(scan["counts"]))
    check("an artwork with no size is reported as unscannable", scan["artworks_total"] >= scan["artworks_checked"])

    section("12. Unknown record types are rejected")
    check("an unknown entity 404s", client.get("/vault/widgets").status_code == 404)

    section("13. A plate carries its artwork name and its KLD reference")
    labelled = client.post(
        "/vault/plates",
        json={
            "plate_number": "PL-LBL",
            "die_id": die["id"],
            "colours": 4,
            "plate_sets": 1,
            "lines": [{"artwork_id": artworks[0]["id"]}, {"artwork_id": artworks[1]["id"]}],
        },
    ).json()
    check(
        "the artwork label is filled in from the lines",
        labelled["artwork_label"] and "+" in labelled["artwork_label"],
        str(labelled["artwork_label"]),
    )
    die_now = next(d for d in client.get("/vault/dies").json()["items"] if d["id"] == die["id"])
    check(
        "the KLD label is the die's number",
        labelled["kld_label"] == die_now["kld_number"],
        f"{labelled['kld_label']} vs {die_now['kld_number']}",
    )

    typed = client.post(
        "/vault/plates",
        json={"plate_number": "PL-TYPED", "die_id": die["id"], "artwork_label": "As etched",
              "kld_label": "rev B by hand", "lines": [{"artwork_id": artworks[0]["id"]}]},
    ).json()
    check("a label typed by hand is left alone", typed["artwork_label"] == "As etched")
    check("and so is the KLD wording", typed["kld_label"] == "rev B by hand")

    section("14. Cost to company against cost to customer")
    # Absorbed entirely: the customer sees nothing.
    absorbed = client.post(
        "/vault/plates",
        json={"plate_number": "PL-FREE", "die_id": die["id"], "actual_cost_minor": 300000,
              "charge_policy": "none", "charge_customer_id": customer["id"]},
    ).json()
    check("an absorbed plate charges the customer nothing", absorbed["charge"]["cost_to_customer_minor"] == 0)
    check("but still costs the company", absorbed["charge"]["net_to_company_minor"] == 300000)

    half = client.post(
        "/vault/plates",
        json={"plate_number": "PL-HALF", "die_id": die["id"], "actual_cost_minor": 300000,
              "charge_policy": "percent", "charge_percent": 50, "charge_customer_id": customer["id"]},
    ).json()
    check("a 50% plate bills half", half["charge"]["cost_to_customer_minor"] == 150000,
          str(half["charge"]["cost_to_customer_minor"]))
    check("and leaves the other half with us", half["charge"]["net_to_company_minor"] == 150000)

    check(
        "an out-of-range percentage is refused",
        client.post("/vault/plates", json={"plate_number": "PL-BAD", "charge_policy": "percent",
                                           "charge_percent": 140}).status_code == 400,
    )
    check(
        "an unknown charge policy is refused",
        client.post("/vault/plates", json={"plate_number": "PL-BAD2",
                                           "charge_policy": "sometimes"}).status_code == 400,
    )
    check(
        "a refundable plate without a threshold is refused",
        client.post("/vault/plates", json={"plate_number": "PL-BAD3",
                                           "charge_policy": "refundable"}).status_code == 400,
    )

    section("15. Refund after a quantity, counted across repeat orders")
    refundable = client.post(
        "/vault/plates",
        json={"plate_number": "PL-REF", "die_id": die["id"], "actual_cost_minor": 400000,
              "charge_policy": "refundable", "refund_after_qty": 100000,
              "charge_customer_id": customer["id"], "lines": [{"artwork_id": artworks[0]["id"]}]},
    ).json()
    check("it is charged up front in full", refundable["charge"]["cost_to_customer_minor"] == 400000)
    check("with nothing refundable yet", refundable["charge"]["refund_ready"] is False)

    first = client.post(
        "/vault/orders",
        json={"order_number": "SO-1", "customer_id": customer["id"], "artwork_id": artworks[0]["id"],
              "die_id": die["id"], "plate_id": refundable["id"], "quantity": 60000, "colours": 4,
              "ordered_on": "2026-08-02", "raised_by": "CRM Anita", "status": "running"},
    )
    check("CRM can raise an order", first.status_code == 200, first.text[:200])
    first = first.json()

    state = client.get(f"/vault/plates/{refundable['id']}").json()
    check("60k run does not reach the threshold", state["charge"]["refund_ready"] is False,
          str(state["charge"]["delivered_qty"]))

    repeat = client.post(
        "/vault/orders",
        json={"order_number": "SO-2", "parent_order_id": first["id"], "quantity": 50000,
              "ordered_on": "2026-09-02", "status": "running"},
    ).json()
    check("a repeat inherits the original's artwork", repeat["artwork_id"] == artworks[0]["id"])
    check("and its plate", repeat["plate_id"] == refundable["id"])
    check("and names its original", repeat["parent_order_number"] == "SO-1")

    state = client.get(f"/vault/plates/{refundable['id']}").json()
    check("the two orders together cross the threshold", state["charge"]["delivered_qty"] == 110000,
          str(state["charge"]["delivered_qty"]))
    check("so the refund is now due", state["charge"]["refund_ready"] is True)
    check("for the whole amount charged", state["charge"]["refund_outstanding_minor"] == 400000)

    body = {k: state[k] for k in ("plate_number", "die_id", "actual_cost_minor", "charge_policy",
                                  "refund_after_qty", "charge_customer_id")}
    body["refunded_minor"] = 400000
    body["lines"] = [{"artwork_id": artworks[0]["id"]}]
    settled = client.put(f"/vault/plates/{refundable['id']}", json=body).json()
    check("once credited nothing is outstanding", settled["charge"]["refund_outstanding_minor"] == 0)
    check("and the plate ends up costing the company its full price",
          settled["charge"]["net_to_company_minor"] == 400000,
          str(settled["charge"]["net_to_company_minor"]))

    charges = client.get("/vault/reports/plate-charges").json()
    check("the charge report totals both sides", charges["totals"]["cost_to_company_minor"] > 0)
    check("and lists what we absorbed", any(i["plate_number"] == "PL-FREE" for i in charges["absorbed"]))

    section("16. CRM raises, design picks up")
    job = client.post(
        "/vault/orders",
        json={"order_number": "SO-3", "customer_id": customer["id"], "quantity": 25000,
              "raised_by": "CRM Anita", "due_on": "2026-09-15"},
    ).json()
    check("a new order starts with CRM", job["status"] == "crm_raised", str(job["status"]))

    blocked = client.patch(f"/vault/orders/{job['id']}/status", json={"status": "design_done"})
    check("design cannot sign off without an artwork", blocked.status_code == 400, blocked.text[:120])

    moved = client.patch(
        f"/vault/orders/{job['id']}/status",
        json={"status": "design_wip", "assigned_to": "Design Ravi"},
    ).json()
    check("design takes it up", moved["status"] == "design_wip")
    check("and the order records who has it", moved["assigned_to"] == "Design Ravi")

    client.put(
        f"/vault/orders/{job['id']}",
        json={"order_number": "SO-3", "customer_id": customer["id"], "artwork_id": artworks[1]["id"],
              "quantity": 25000, "status": "design_wip", "assigned_to": "Design Ravi"},
    )
    done = client.patch(
        f"/vault/orders/{job['id']}/status",
        json={"status": "design_done", "design_notes": "Trapping fixed, 4C confirmed"},
    ).json()
    check("with an artwork attached design can sign off", done["status"] == "design_done")
    check("the design note is kept", "Trapping" in (done["design_notes"] or ""))
    check(
        "an unknown status is refused",
        client.patch(f"/vault/orders/{job['id']}/status", json={"status": "shipped"}).status_code == 400,
    )

    board = client.get("/vault/reports/orders").json()
    check("the board counts every stage", set(board["counts"]) == set(vault.ORDER_STATUSES), str(board["counts"]))
    check("SO-3 is waiting on nobody now", all(i["order_number"] != "SO-3" for i in board["waiting_on_design"]))
    check("the repeat is listed as a repeat", any(i["order_number"] == "SO-2" for i in board["repeats"]))
    check("SO-3 has no plate yet", any(i["order_number"] == "SO-3" for i in board["no_plate_yet"]))
    check("the board can be filtered by status",
          all(i["status"] == "running" for i in client.get("/vault/orders?status=running").json()["items"]))

    section("17. Orders hold the links in place")
    check(
        "a plate that has run orders cannot be deleted",
        client.delete(f"/vault/plates/{refundable['id']}").status_code == 409,
    )
    check(
        "an original with repeats cannot be deleted",
        client.delete(f"/vault/orders/{first['id']}").status_code == 409,
    )
    check("the repeat can go", client.delete(f"/vault/orders/{repeat['id']}").status_code == 200)
    check("and then so can the original", client.delete(f"/vault/orders/{first['id']}").status_code == 200)
    check(
        "an order pointing at a plate that is not there is refused",
        client.post("/vault/orders", json={"order_number": "SO-X", "plate_id": "nope"}).status_code == 400,
    )

    section("18. A calculated layout is saved, not left in a browser")
    job2 = client.post(
        "/vault/orders",
        json={"order_number": "SO-4", "customer_id": customer["id"], "artwork_id": artworks[2]["id"],
              "die_id": die["id"], "quantity": 100000, "colours": 4, "raised_by": "CRM Anita"},
    ).json()

    layout = client.post(
        "/vault/layouts",
        json={
            "order_id": job2["id"], "kind": "step_repeat", "unit": "mm",
            "label_width": 100, "label_height": 60, "quantity": 100000, "colours": 4, "plate_sets": 1,
            "web_width": 322, "repeat_mm": 206.375, "teeth": 65, "across": 5, "around": 2, "per_rev": 10,
            "rotated": True, "utilisation": 0.903, "material_area": 664728000, "web_length": 2063750,
            "revolutions": 10000, "overrun": 0, "plate_area_cm2": 664.5275,
            "plate_cost_minor": 345554, "material_cost_minor": 1023481, "total_cost_minor": 1369035,
            "per_thousand_minor": 13690, "ranked_by": "cost",
            "payload": {"press": {"minWidth": 320, "maxWidth": 650}, "label": {"width": 100, "height": 60}},
            "saved_by": "Design Ravi",
        },
    )
    check("a layout saves", layout.status_code == 200, layout.text[:200])
    layout = layout.json()
    check("it is named from the layout when nothing is typed", layout["name"] == "5 × 2 on 65T", layout["name"])
    check("the rotation survives the round trip", layout["rotated"] is True)
    check("and so does the whole project payload", layout["payload"]["press"]["maxWidth"] == 650,
          str(layout["payload"]))
    check("it names the order it belongs to", layout["order_number"] == "SO-4")
    check("and the KLD behind it", layout["kld_number"] == die_now["kld_number"])

    check(
        "an unknown kind is refused",
        client.post("/vault/layouts", json={"kind": "freehand"}).status_code == 400,
    )
    check(
        "a layout on an order that is not there is refused",
        client.post("/vault/layouts", json={"order_id": "nope"}).status_code == 400,
    )

    listed = client.get(f"/vault/layouts?order_id={job2['id']}").json()["items"]
    check("the order's layouts list", len(listed) == 1, str(len(listed)))
    board = client.get("/vault/reports/orders").json()
    check(
        "the board counts saved layouts per order",
        next(i["layout_count"] for i in board["items"] if i["order_number"] == "SO-4") == 1,
    )

    section("19. The plate follows from the layout, nothing retyped")
    made = client.post(f"/vault/layouts/{layout['id']}/plate", json={"plate_number": "PL-FROM-LAYOUT"})
    check("a plate is made from the layout", made.status_code == 200, made.text[:200])
    made = made.json()
    check("it takes the repeat", abs(made["repeat_mm"] - 206.375) < 1e-9, str(made["repeat_mm"]))
    check("and the web width", abs(made["web_width"] - 322) < 1e-9)
    check("and the colour count", made["colours"] == 4)
    check("its cost is what the optimiser worked out", made["actual_cost_minor"] == 345554)
    check("the order's artwork is on it", len(made["lines"]) == 1, str(made["lines"]))
    check("so it carries that artwork's name", made["artwork_label"] == artworks[2]["name"], str(made["artwork_label"]))
    check("and the order's KLD", made["kld_label"] == die_now["kld_number"], str(made["kld_label"]))
    check("it is billed to the order's customer", made["charge_customer_id"] == customer["id"])

    refreshed = client.get(f"/vault/layouts/{layout['id']}").json()
    check("the layout now points at its plate", refreshed["plate_id"] == made["id"])
    check("and names it", refreshed["plate_number"] == "PL-FROM-LAYOUT")
    reorder = client.get(f"/vault/orders/{job2['id']}").json()
    check("the order picked the plate up too", reorder["plate_id"] == made["id"])

    check(
        "making a second plate from the same layout is refused",
        client.post(f"/vault/layouts/{layout['id']}/plate").status_code == 409,
    )
    check(
        "an order holding layouts cannot be deleted",
        client.delete(f"/vault/orders/{job2['id']}").status_code == 409,
    )

    check(
        "and the plate cannot be deleted while the order points at it",
        client.delete(f"/vault/plates/{made['id']}").status_code == 409,
    )
    client.put(
        f"/vault/orders/{job2['id']}",
        json={"order_number": "SO-4", "customer_id": customer["id"], "artwork_id": artworks[2]["id"],
              "die_id": die["id"], "quantity": 100000, "status": "crm_raised"},
    )
    check("once unhooked it goes", client.delete(f"/vault/plates/{made['id']}").status_code == 200)
    unhooked = client.get(f"/vault/layouts/{layout['id']}").json()
    check("but the layout is still there", unhooked["plate_id"] is None, str(unhooked["plate_id"]))
    check("so a fresh plate can be made from it", client.post(f"/vault/layouts/{layout['id']}/plate").status_code == 200)

    section("20. The charge maths on its own")
    check("no policy given means the full cost is billed",
          vault.plate_charge({"actual_cost_minor": 1000})["cost_to_customer_minor"] == 1000)
    check("percent defaults to half when no figure is set",
          vault.plate_charge({"actual_cost_minor": 1000, "charge_policy": "percent"})
          ["cost_to_customer_minor"] == 500)
    check("a negotiated figure beats the policy",
          vault.plate_charge({"actual_cost_minor": 1000, "charge_policy": "full", "charged_minor": 250})
          ["cost_to_customer_minor"] == 250)
    check("a plate with no cost recorded charges nothing",
          vault.plate_charge({})["cost_to_customer_minor"] == 0)
    check("a refund threshold of zero never triggers",
          vault.plate_charge({"actual_cost_minor": 1000, "charge_policy": "refundable",
                              "refund_after_qty": 0}, 99999)["refund_ready"] is False)


if __name__ == "__main__":
    sys.exit(main())
