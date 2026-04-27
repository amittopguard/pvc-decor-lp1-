"""KDIPL Leads API tests — leads CRUD, admin auth, filters, CSV export."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://laminate-solutions.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_PASSWORD = "kdipl@admin2025"

session = requests.Session()
session.headers.update({"Content-Type": "application/json"})

created_ids = []


@pytest.fixture(scope="module")
def admin_token():
    r = session.post(f"{API}/admin/login", json={"password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "token" in data and data["expires_in_hours"] == 24
    return data["token"]


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# -------- Public lead creation --------
class TestLeadCreate:
    def test_create_sample_lead(self):
        payload = {
            "type": "sample",
            "name": "TEST_Sample User",
            "email": "test_sample@example.com",
            "phone": "+919999990001",
            "company": "TEST Co",
            "country": "India",
            "product_interest": "PVC Decor Film",
        }
        r = session.post(f"{API}/leads", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["id"] and data["status"] == "new"
        assert data["type"] == "sample"
        assert data["name"] == "TEST_Sample User"
        assert "_id" not in data
        created_ids.append(data["id"])

    def test_create_quote_lead(self):
        payload = {
            "type": "quote",
            "name": "TEST_Quote User",
            "email": "test_quote@example.com",
            "phone": "+919999990002",
            "quantity": "5000 sqm",
        }
        r = session.post(f"{API}/leads", json=payload, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["type"] == "quote" and d["quantity"] == "5000 sqm"
        created_ids.append(d["id"])

    def test_create_distributor_lead(self):
        payload = {
            "type": "distributor",
            "name": "TEST_Dist User",
            "email": "test_dist@example.com",
            "phone": "+919999990003",
            "territory": "Mumbai",
            "experience_years": "10 years",
            "expected_volume": "10000 sqm/month",
        }
        r = session.post(f"{API}/leads", json=payload, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["type"] == "distributor" and d["territory"] == "Mumbai"
        created_ids.append(d["id"])

    def test_missing_required_fields_returns_422(self):
        r = session.post(f"{API}/leads", json={"type": "sample", "name": "x"}, timeout=15)
        assert r.status_code == 422

    def test_invalid_email_returns_422(self):
        r = session.post(f"{API}/leads", json={
            "type": "sample", "name": "TEST_X", "email": "not-an-email", "phone": "12345"
        }, timeout=15)
        assert r.status_code == 422

    def test_invalid_type_returns_422(self):
        r = session.post(f"{API}/leads", json={
            "type": "invalid", "name": "TEST_X", "email": "a@b.com", "phone": "12345"
        }, timeout=15)
        assert r.status_code == 422

    def test_lead_persists_no_resend_key(self):
        """Should still create lead even with empty RESEND_API_KEY (graceful skip)."""
        r = session.post(f"{API}/leads", json={
            "type": "sample",
            "name": "TEST_Resend Skip",
            "email": "test_resend@example.com",
            "phone": "+919999990004",
        }, timeout=15)
        assert r.status_code == 200
        created_ids.append(r.json()["id"])


# -------- Admin auth --------
class TestAdminAuth:
    def test_login_correct_password(self):
        r = session.post(f"{API}/admin/login", json={"password": ADMIN_PASSWORD}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["token"] and d["expires_in_hours"] == 24

    def test_login_wrong_password(self):
        r = session.post(f"{API}/admin/login", json={"password": "wrong"}, timeout=15)
        assert r.status_code == 401

    def test_verify_no_token(self):
        r = session.get(f"{API}/admin/verify", timeout=15)
        assert r.status_code == 401

    def test_verify_invalid_token(self):
        r = session.get(f"{API}/admin/verify", headers={"Authorization": "Bearer junk"}, timeout=15)
        assert r.status_code == 401

    def test_verify_valid_token(self, auth_headers):
        r = session.get(f"{API}/admin/verify", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        assert r.json() == {"ok": True}


# -------- Admin CRUD / filters --------
class TestAdminLeads:
    def test_list_requires_auth(self):
        r = session.get(f"{API}/admin/leads", timeout=15)
        assert r.status_code == 401

    def test_list_all(self, auth_headers):
        r = session.get(f"{API}/admin/leads", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "items" in d and "count" in d
        # No mongo _id
        for item in d["items"]:
            assert "_id" not in item

    def test_filter_by_type_sample(self, auth_headers):
        r = session.get(f"{API}/admin/leads?type=sample", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        for item in r.json()["items"]:
            assert item["type"] == "sample"

    def test_filter_by_status_new(self, auth_headers):
        r = session.get(f"{API}/admin/leads?status=new", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        for item in r.json()["items"]:
            assert item["status"] == "new"

    def test_search_query(self, auth_headers):
        r = session.get(f"{API}/admin/leads?q=TEST_Sample", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        items = r.json()["items"]
        assert any("TEST_Sample" in (i.get("name") or "") for i in items)

    def test_stats(self, auth_headers):
        r = session.get(f"{API}/admin/stats", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "total" in d
        assert set(d["by_type"].keys()) == {"sample", "quote", "distributor"}
        assert set(d["by_status"].keys()) == {"new", "contacted", "qualified", "closed", "spam"}

    def test_update_status(self, auth_headers):
        assert created_ids, "need a lead to update"
        lead_id = created_ids[0]
        r = session.patch(f"{API}/admin/leads/{lead_id}",
                          headers=auth_headers, json={"status": "contacted"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["status"] == "contacted"
        # Verify persisted
        r2 = session.get(f"{API}/admin/leads?q={lead_id[:8]}", headers=auth_headers, timeout=15)
        # fallback: just refetch list
        r3 = session.get(f"{API}/admin/leads", headers=auth_headers, timeout=15)
        match = next((i for i in r3.json()["items"] if i["id"] == lead_id), None)
        assert match and match["status"] == "contacted"

    def test_update_invalid_status(self, auth_headers):
        if not created_ids:
            pytest.skip("no lead")
        r = session.patch(f"{API}/admin/leads/{created_ids[0]}",
                          headers=auth_headers, json={"status": "bogus"}, timeout=15)
        assert r.status_code == 422

    def test_update_missing_lead(self, auth_headers):
        r = session.patch(f"{API}/admin/leads/nonexistent-id-xyz",
                          headers=auth_headers, json={"status": "new"}, timeout=15)
        assert r.status_code == 404

    def test_csv_export(self, auth_headers):
        r = session.get(f"{API}/admin/leads/export.csv", headers=auth_headers, timeout=20)
        assert r.status_code == 200
        ct = r.headers.get("content-type", "")
        assert "text/csv" in ct, ct
        cd = r.headers.get("content-disposition", "")
        assert "attachment" in cd and ".csv" in cd
        body = r.text
        assert "created_at" in body and "type" in body and "name" in body

    def test_delete_lead(self, auth_headers):
        if not created_ids:
            pytest.skip("no lead")
        lead_id = created_ids[-1]
        r = session.delete(f"{API}/admin/leads/{lead_id}", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        assert r.json() == {"ok": True}
        # verify gone
        r2 = session.delete(f"{API}/admin/leads/{lead_id}", headers=auth_headers, timeout=15)
        assert r2.status_code == 404
        created_ids.remove(lead_id)


def test_zz_cleanup():
    """Cleanup remaining TEST_ leads."""
    r = session.post(f"{API}/admin/login", json={"password": ADMIN_PASSWORD}, timeout=15)
    token = r.json()["token"]
    h = {"Authorization": f"Bearer {token}"}
    for lid in list(created_ids):
        session.delete(f"{API}/admin/leads/{lid}", headers=h, timeout=15)
