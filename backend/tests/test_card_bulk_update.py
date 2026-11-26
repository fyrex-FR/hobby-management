import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from routers import cards
from routers.auth import current_user

A = "11111111-1111-1111-1111-111111111111"
B = "22222222-2222-2222-2222-222222222222"


class FakeResponse:
    def __init__(self, rows):
        self.status_code = 200
        self._rows = rows
        self.text = ""

    def json(self):
        return self._rows


class FakeClient:
    calls: list = []

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def patch(self, url, headers=None, params=None, json=None):
        FakeClient.calls.append({"params": params, "json": json})
        ids = params["id"][4:-1].split(",")
        return FakeResponse([{"id": i} for i in ids])


def make_client():
    app = FastAPI()
    app.include_router(cards.router)
    app.dependency_overrides[current_user] = lambda: {"sub": "user-1", "email": "a@b.c"}
    return TestClient(app)


@patch.object(cards.httpx, "AsyncClient", FakeClient)
class BulkUpdateTests(unittest.TestCase):
    def setUp(self):
        FakeClient.calls = []
        self.client = make_client()

    def test_applies_only_sent_fields_to_the_users_cards(self):
        r = self.client.post("/cards/bulk-update", json={
            "card_ids": [A, B, A],
            "changes": {"set_name": " Topps Flagship ", "year": "2025-26", "insert_name": ""},
        })
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json(), {"updated": 2})
        call = FakeClient.calls[0]
        self.assertEqual(call["params"]["user_id"], "eq.user-1")
        self.assertEqual(call["params"]["id"], f"in.({A},{B})")
        self.assertEqual(call["json"], {"set_name": "Topps Flagship", "year": "2025-26", "insert_name": None})

    def test_rejects_price_and_unknown_fields(self):
        r = self.client.post("/cards/bulk-update", json={"card_ids": [A], "changes": {"price": 3}})
        self.assertEqual(r.status_code, 422)
        self.assertEqual(FakeClient.calls, [])

    def test_rejects_ids_that_are_not_uuids(self):
        r = self.client.post("/cards/bulk-update", json={"card_ids": [f"{A})"], "changes": {"year": "2024"}})
        self.assertEqual(r.status_code, 422)
        self.assertEqual(FakeClient.calls, [])

    def test_rejects_empty_changes_and_clearing_required_fields(self):
        self.assertEqual(self.client.post("/cards/bulk-update", json={"card_ids": [A], "changes": {}}).status_code, 422)
        self.assertEqual(self.client.post("/cards/bulk-update", json={"card_ids": [A], "changes": {"status": None}}).status_code, 422)

    def test_splits_large_selections(self):
        ids = [f"00000000-0000-0000-0000-{i:012d}" for i in range(250)]
        r = self.client.post("/cards/bulk-update", json={"card_ids": ids, "changes": {"brand": "Topps"}})
        self.assertEqual(r.json(), {"updated": 250})
        self.assertEqual(len(FakeClient.calls), 3)


@patch.object(cards.httpx, "AsyncClient", FakeClient)
class SaleFieldsTests(unittest.TestCase):
    def setUp(self):
        FakeClient.calls = []
        self.client = make_client()

    def test_marking_sold_stamps_a_sale_date_only_where_missing(self):
        self.client.post("/cards/bulk-update", json={"card_ids": [A, B], "changes": {"status": "vendu"}})
        self.assertEqual(len(FakeClient.calls), 2)
        stamp = FakeClient.calls[1]
        self.assertEqual(stamp["params"]["sold_at"], "is.null")
        self.assertIn("sold_at", stamp["json"])

    def test_back_on_sale_clears_the_sale(self):
        self.client.post("/cards/bulk-update", json={"card_ids": [A], "changes": {"status": "a_vendre"}})
        self.assertEqual(FakeClient.calls[0]["json"], {"sold_price": None, "sold_at": None, "sold_channel": None, "status": "a_vendre"})

    def test_explicit_sale_fields_win(self):
        out = cards.with_sale_fields({"status": "vendu", "sold_price": 7.0})
        self.assertEqual(out, {"status": "vendu", "sold_price": 7.0})


if __name__ == "__main__":
    unittest.main()
