import json
import unittest
import uuid
from urllib.parse import unquote

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient

from routers import salon
from routers.admin import require_admin

USER = str(uuid.uuid4())


class FakeDB:
    """Mini PostgREST en mémoire : eq./in./gt./gte. sur les colonnes utilisées par le module."""

    def __init__(self):
        self.t = {"cards": [], "salon_stands": [], "salon_carts": []}

    def match(self, row, params):
        for k, v in params.items():
            if k in ("order", "limit", "select"):
                continue
            op, _, val = v.partition(".")
            cur = row.get(k)
            if op == "eq" and str(cur) != val:
                return False
            if op == "in" and str(cur) not in unquote(val).strip("()").split(","):
                return False
            if op in ("gt", "gte") and not (str(cur) > val if op == "gt" else str(cur) >= val):
                return False
        return True

    def handler(self, request: httpx.Request) -> httpx.Response:
        table = request.url.path.rsplit("/", 1)[-1]
        rows = self.t[table]
        params = dict(request.url.params)
        if request.method == "GET":
            return httpx.Response(200, json=[r for r in rows if self.match(r, params)])
        body = json.loads(request.content or b"{}")
        if request.method == "POST":
            row = {"id": str(uuid.uuid4()), "status": "active", "is_open": True, **body}
            rows.append(row)
            return httpx.Response(201, json=[row])
        hit = [r for r in rows if self.match(r, params)]
        for r in hit:
            r.update(body)
        return httpx.Response(200, json=hit)


def make_client(db):
    real = httpx.AsyncClient
    salon.httpx.AsyncClient = lambda *a, **k: real(transport=httpx.MockTransport(db.handler))
    app = FastAPI()
    app.include_router(salon.router, prefix="/api")
    app.dependency_overrides[require_admin] = lambda: {"sub": USER, "email": "xavier.andrieux@gmail.com"}
    return TestClient(app), real


class SalonTest(unittest.TestCase):
    def setUp(self):
        self.db = FakeDB()
        self.client, self.real = make_client(self.db)
        for i, price in enumerate([10, 20, None]):
            self.db.t["cards"].append({"id": str(uuid.uuid4()), "user_id": USER, "status": "a_vendre", "price": price, "player": f"P{i}"})
        self.db.t["cards"].append({"id": str(uuid.uuid4()), "user_id": USER, "status": "collection", "price": 5})
        self.token = self.client.get("/api/salon/stand").json()["token"]

    def tearDown(self):
        salon.httpx.AsyncClient = self.real

    def test_stock_only_priced_for_sale_cards(self):
        stock = self.client.get(f"/api/salon/{self.token}/stock").json()
        self.assertEqual(sorted(c["price"] for c in stock["cards"]), [10, 20])
        self.assertTrue(all("purchase_price" not in c and "user_id" not in c for c in stock["cards"]))

    def test_unknown_or_closed_stand_is_404(self):
        self.assertEqual(self.client.get("/api/salon/nope/stock").status_code, 404)
        self.client.patch("/api/salon/stand", json={"is_open": False})
        self.assertEqual(self.client.get(f"/api/salon/{self.token}/stock").status_code, 404)

    def test_cart_reserves_then_second_cart_conflicts_then_pay(self):
        ids = [c["id"] for c in self.db.t["cards"][:2]]
        r = self.client.post(f"/api/salon/{self.token}/carts", json={"card_ids": ids})
        self.assertEqual(r.status_code, 201)
        cart = r.json()
        self.assertEqual(cart["total"], 30)
        self.assertEqual(len(cart["code"]), 4)
        stock = self.client.get(f"/api/salon/{self.token}/stock").json()
        self.assertEqual(sorted(stock["reserved"]), sorted(ids))
        r2 = self.client.post(f"/api/salon/{self.token}/carts", json={"card_ids": ids[:1]})
        self.assertEqual(r2.status_code, 409)
        self.assertEqual(r2.json()["detail"]["unavailable"], ids[:1])
        found = self.client.get(f"/api/salon/carts/by-code/{cart['code'].lower()}").json()
        self.assertEqual(len(found["cards"]), 2)
        paid = self.client.post(f"/api/salon/carts/{found['id']}/pay").json()
        self.assertEqual(paid["status"], "paid")
        self.assertEqual([c["status"] for c in self.db.t["cards"][:2]], ["vendu", "vendu"])
        self.assertEqual(self.client.get(f"/api/salon/{self.token}/stock").json()["cards"], [])

    def test_cancel_releases_cards(self):
        ids = [self.db.t["cards"][0]["id"]]
        cart = self.client.post(f"/api/salon/{self.token}/carts", json={"card_ids": ids}).json()
        cid = self.db.t["salon_carts"][0]["id"]
        self.client.post(f"/api/salon/carts/{cid}/cancel")
        self.assertEqual(self.client.get(f"/api/salon/{self.token}/stock").json()["reserved"], [])
        self.assertEqual(self.client.post(f"/api/salon/{self.token}/carts", json={"card_ids": ids}).status_code, 201)
        self.assertTrue(cart["code"])

    def test_pay_refuses_card_sold_meanwhile(self):
        ids = [self.db.t["cards"][0]["id"]]
        self.client.post(f"/api/salon/{self.token}/carts", json={"card_ids": ids})
        self.db.t["cards"][0]["status"] = "vendu"
        cid = self.db.t["salon_carts"][0]["id"]
        r = self.client.post(f"/api/salon/carts/{cid}/pay")
        self.assertEqual(r.status_code, 409)

    def test_rejects_invalid_and_empty_cart(self):
        self.assertEqual(self.client.post(f"/api/salon/{self.token}/carts", json={"card_ids": ["x"]}).status_code, 400)
        self.assertEqual(self.client.post(f"/api/salon/{self.token}/carts", json={"card_ids": []}).status_code, 400)

    def test_offers_counter_and_pay_final_prices(self):
        ids = [c["id"] for c in self.db.t["cards"][:2]]
        base = f"/api/salon/{self.token}/carts"
        for bad in (0, 10, 15):
            self.assertEqual(self.client.post(base, json={"card_ids": ids, "offers": {ids[0]: bad}}).status_code, 400)
        r = self.client.post(base, json={"card_ids": ids, "offers": {ids[0]: 8}})
        self.assertEqual((r.status_code, r.json()["total"]), (201, 30))
        code, cid = r.json()["code"], self.db.t["salon_carts"][0]["id"]
        self.assertEqual(self.client.patch(f"/api/salon/carts/{cid}/lines/{ids[0]}", json={"final": 9}).json()["total"], 29)
        pub = self.client.get(f"{base}/{code}").json()
        self.assertEqual((pub["status"], pub["lines"][0]["state"], pub["lines"][0]["final"]), ("active", "countered", 9))
        self.client.post(f"/api/salon/carts/{cid}/pay")
        self.assertEqual(self.db.t["cards"][0]["price"], 9)
        self.assertEqual(self.client.get(f"/api/salon/{self.token}/live").json()["sold"], sorted(ids))

    def test_paypal_handle(self):
        r = self.client.patch("/api/salon/stand", json={"paypal_me": "https://paypal.me/xavier.a/"})
        self.assertEqual(r.json()["paypal_me"], "xavier.a")
        self.assertEqual(self.client.get(f"/api/salon/{self.token}/stock").json()["paypal_me"], "xavier.a")
        self.assertEqual(self.client.patch("/api/salon/stand", json={"paypal_me": "a/b?x=1"}).status_code, 400)
        self.assertIsNone(self.client.patch("/api/salon/stand", json={"paypal_me": ""}).json()["paypal_me"])

    def test_admin_routes_need_admin(self):
        from fastapi import HTTPException
        def deny():
            raise HTTPException(status_code=403, detail="Admin only")
        self.client.app.dependency_overrides[require_admin] = deny
        self.assertEqual(self.client.get("/api/salon/stand").status_code, 403)
        self.assertEqual(self.client.get("/api/salon/carts").status_code, 403)


if __name__ == "__main__":
    unittest.main()
