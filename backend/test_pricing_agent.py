import os
import unittest
import uuid
from datetime import datetime, timezone

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient

os.environ["PRICING_AGENT_TOKEN"] = "tok"
OWNER = str(uuid.uuid4())
os.environ["PRICING_AGENT_USER_ID"] = OWNER

from routers import pricing_agent
from routers.admin import require_admin
from services.marketplace_pricing import propose_from_sold
from test_salon import FakeDB as _FakeDB


class FakeDB(_FakeDB):
    def match(self, row, params):
        nulls = {k: v for k, v in params.items() if v == "is.null"}
        rest = {k: v for k, v in params.items() if v != "is.null"}
        return all(row.get(k) is None for k in nulls) and super().match(row, rest)

H = {"X-Agent-Token": "tok"}


def make_client(db):
    real = httpx.AsyncClient
    pricing_agent.httpx.AsyncClient = lambda *a, **k: real(transport=httpx.MockTransport(db.handler))
    app = FastAPI()
    app.include_router(pricing_agent.router, prefix="/api")
    app.dependency_overrides[require_admin] = lambda: {"sub": OWNER, "email": "x"}

    async def fake_fetch(client, url, params, page=1000):
        return (await client.get(url, params=params)).json()

    pricing_agent.fetch_all_rows = fake_fetch
    return TestClient(app), real


class PricingTest(unittest.TestCase):
    def setUp(self):
        self.db = FakeDB()
        self.db.t["pricing_runs"] = []
        self.c, self.real = make_client(self.db)

    def tearDown(self):
        pricing_agent.httpx.AsyncClient = self.real

    def card(self, **kw):
        row = {"id": str(uuid.uuid4()), "user_id": OWNER, "status": "a_vendre", "player": "Wemby",
               "year": "2023", "set_name": "Prizm", "card_number": "136", **kw}
        self.db.t["cards"].append(row)
        return row

    def test_math(self):
        self.assertEqual(propose_from_sold([10, 20, 30]), (20.0, 24.0))   # 23.5 -> 24
        self.assertEqual(propose_from_sold([2, 2]), (2.0, 2.5))           # 2.35 -> 2.5
        self.assertEqual(propose_from_sold([0.35]), (0.35, 1.0))          # plancher 1 €
        with self.assertRaises(ValueError):
            propose_from_sold([])

    def test_token(self):
        self.assertEqual(self.c.get("/api/pricing-agent/queue").status_code, 401)
        self.assertEqual(self.c.get("/api/pricing-agent/queue", headers={"X-Agent-Token": "x"}).status_code, 401)

    def test_queue_filters(self):
        ok = self.card()
        self.card(price=5)
        self.card(ebay_price=5)
        self.card(user_id=str(uuid.uuid4()))
        recent = self.card()
        self.db.t["pricing_runs"].append({"user_id": OWNER, "card_id": recent["id"],
                                          "created_at": datetime.now(timezone.utc).isoformat()})
        r = self.c.get("/api/pricing-agent/queue", headers=H).json()["cards"]
        self.assertEqual([x["id"] for x in r], [ok["id"]])
        self.assertEqual(r[0]["query"], "Wemby 2023 Prizm 136")

    def run_body(self, card, **kw):
        return {"card_id": card["id"], "query": "q", "confidence": "high", "model": "m",
                "kept": [{"title": "a", "price": 10}, {"title": "b", "price": 20}, {"title": "c", "price": 30}],
                "rejected": [{"title": "d", "price": 99, "reason": "lot"}], **kw}

    def test_run_and_accept(self):
        card = self.card()
        run = self.c.post("/api/pricing-agent/runs", headers=H, json=self.run_body(card)).json()
        self.assertEqual((run["median"], run["proposed_price"], run["status"]), (20.0, 24.0, "pending"))
        self.assertNotIn("ebay_price", card)
        r = self.c.post(f"/api/pricing-runs/{run['id']}/accept", json={})
        self.assertEqual(r.json()["status"], "accepted")
        self.assertEqual(card["ebay_price"], 24.0)
        self.assertEqual(self.c.post(f"/api/pricing-runs/{run['id']}/accept", json={}).status_code, 409)

    def test_accept_custom_price_and_reject(self):
        card = self.card()
        run = self.c.post("/api/pricing-agent/runs", headers=H, json=self.run_body(card)).json()
        self.c.post(f"/api/pricing-runs/{run['id']}/accept", json={"price": 30})
        self.assertEqual(card["ebay_price"], 30)
        card2 = self.card()
        run2 = self.c.post("/api/pricing-agent/runs", headers=H, json=self.run_body(card2)).json()
        self.assertEqual(self.c.post(f"/api/pricing-runs/{run2['id']}/reject").json()["status"], "rejected")
        self.assertNotIn("ebay_price", card2)

    def test_no_kept_is_error_without_price(self):
        card = self.card()
        run = self.c.post("/api/pricing-agent/runs", headers=H, json=self.run_body(card, kept=[])).json()
        self.assertEqual(run["status"], "error")
        self.assertNotIn("proposed_price", run)
        self.assertEqual(self.c.post(f"/api/pricing-runs/{run['id']}/accept", json={}).status_code, 422)

    def test_foreign_card_and_currency(self):
        other = self.card(user_id=str(uuid.uuid4()))
        self.assertEqual(self.c.post("/api/pricing-agent/runs", headers=H, json=self.run_body(other)).status_code, 404)
        mine = self.card()
        body = self.run_body(mine, kept=[{"title": "a", "price": 10, "currency": "USD"}])
        self.assertEqual(self.c.post("/api/pricing-agent/runs", headers=H, json=body).status_code, 422)


if __name__ == "__main__":
    unittest.main()
