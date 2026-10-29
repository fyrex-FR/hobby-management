import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient

from routers import extension
from services.vinted_draft import add_hashtags, build_draft, build_hashtags, ebay_sold_query, normalize_hashtag


class VintedDraftTest(unittest.TestCase):
    """Mêmes attentes que frontend/src/lib/vintedHashtags.test.ts."""

    def test_normalise(self):
        self.assertEqual(normalize_hashtag("Jérémy Sochan Jr."), "jeremysochanjr")

    def test_equipes_nba_courtes(self):
        self.assertEqual(
            build_hashtags("Stephen Curry", "Golden State Warriors", "Donruss Optic"),
            ["#fyrex_stephencurry", "#fyrex_warriors", "#fyrex_donrussoptic"],
        )

    def test_equipe_hors_nba_et_doublons(self):
        self.assertEqual(build_hashtags(team="Paris Saint-Germain"), ["#fyrex_parissaintgermain"])
        self.assertEqual(build_hashtags("Magic", "Orlando Magic"), ["#fyrex_magic"])

    def test_bloc_avant_description(self):
        self.assertEqual(
            add_hashtags("Carte protégée.", "Derrick Rose", "Chicago Bulls", "Donruss Optic"),
            "🔎 Explorez ma collection via les hashtags ci-dessous pour découvrir d’autres cartes similaires :\n\n"
            "#fyrex_derrickrose\n#fyrex_bulls\n#fyrex_donrussoptic\n\nCarte protégée.",
        )

    def test_draft(self):
        draft = build_draft({
            "player": "Victor Wembanyama", "team": "San Antonio Spurs", "year": "2023-24", "brand": "Panini",
            "set_name": "Prizm", "parallel_name": "Silver", "numbered": "/99", "card_number": "136",
            "price": 40, "vinted_price": None,
        })
        self.assertEqual(draft["title"], "Victor Wembanyama 2023-24 Panini Prizm Silver /99")
        self.assertEqual(draft["price"], 40)
        self.assertTrue(draft["description"].endswith(
            "Panini Prizm\nParallel : Silver\nCarte 136\nNumérotée /99\nExcellent état, jamais joué"))
        self.assertIn("#fyrex_spurs", draft["description"])
        self.assertEqual(build_draft({"player": "X", "parallel_name": "Base", "vinted_price": 3})["title"], "X")

    def test_ebay_sold_query(self):
        self.assertEqual(
            ebay_sold_query({"player": "Victor Wembanyama", "year": "2023-24", "brand": "Panini", "set_name": "Prizm",
                             "card_number": "136", "parallel_name": "Silver", "numbered": "/99"}),
            "Victor Wembanyama 2023-24 Prizm #136 Silver /99",
        )
        self.assertEqual(ebay_sold_query({"player": "A", "brand": "Topps", "card_number": "#5"}), "A Topps #5")


USER = "user-1"


class VintedRoutesTest(unittest.TestCase):
    def setUp(self):
        self.cards = [
            {"id": "c1", "user_id": USER, "status": "a_vendre", "player": "A", "image_front_url": "https://i/1.jpg", "price": 5, "vinted_price": None, "vinted_url": None},
            {"id": "c2", "user_id": USER, "status": "collection", "player": "B", "image_front_url": "https://i/2.jpg", "price": None, "vinted_price": 8, "vinted_url": None},
            {"id": "c3", "user_id": USER, "status": "a_vendre", "player": "C", "image_front_url": "https://i/3.jpg", "price": None, "vinted_price": None, "vinted_url": None},
        ]
        self.calls = []

        async def fake_rest(method, table, *, params=None, json=None, prefer=None):
            self.calls.append((method, params, json))
            if method == "GET":
                if params.get("select") == "id":
                    return [{"id": c["id"]} for c in self.cards if c["id"] == params["id"][3:]]
                return self.cards
            card = next(c for c in self.cards if c["id"] == params["id"][3:])
            card.update(json)
            return [card]

        self._saved = extension._rest
        extension._rest = fake_rest
        app = FastAPI()
        app.include_router(extension.router, prefix="/api")
        app.dependency_overrides[extension.current_extension_user] = lambda: {"sub": USER}
        self.client = TestClient(app)

    def tearDown(self):
        extension._rest = self._saved

    def test_queue_includes_cards_without_price(self):
        queue = self.client.get("/api/extension/vinted-queue").json()
        self.assertEqual([c["id"] for c in queue], ["c1", "c2", "c3"])
        self.assertEqual([c["price"] for c in queue], [5, 8, None])
        self.assertEqual(queue[0]["draft"]["title"], "A")
        self.assertEqual(queue[2]["ebay_query"], "C")
        params = self.calls[0][1]
        self.assertEqual((params["vinted_url"], params["status"]), ("is.null", "in.(collection,a_vendre)"))

    def test_sync_cards_bring_links_and_titles(self):
        self.cards[0].update({"vinted_url": "https://www.vinted.fr/items/1-bidon", "year": "2023-24"})
        cards = self.client.get("/api/extension/vinted-sync/cards").json()
        self.assertEqual([c["id"] for c in cards], ["c1", "c2", "c3"])
        self.assertEqual(cards[0]["vinted_url"], "https://www.vinted.fr/items/1-bidon")
        self.assertEqual(cards[0]["title"], "A 2023-24")
        self.assertEqual(self.calls[-1][1]["status"], "in.(collection,a_vendre,reserve,vendu)")

    def test_sync_apply_links_sells_and_withdraws_ebay(self):
        withdrawn = []

        async def fake_withdraw(user_id, cards):
            withdrawn.extend(c["id"] for c in cards)
            return {"withdrawn": len(cards), "failed": []}

        saved = extension._withdraw_ebay
        extension._withdraw_ebay = fake_withdraw
        self.addCleanup(lambda: setattr(extension, "_withdraw_ebay", saved))

        async def fake_rest(method, table, *, params=None, json=None, prefer=None):
            if method == "GET":
                ids = params["id"][4:-1].split(",")
                return [c for c in self.cards if c["id"] in ids]
            card = next((c for c in self.cards if c["id"] == params["id"][3:]), None)
            if not card:
                return []
            card.update(json)
            return [card]

        extension._rest = fake_rest
        r = self.client.post("/api/extension/vinted-sync/apply", json={"actions": [
            {"card_id": "c1", "vinted_url": "https://www.vinted.fr/items/77-a?ref=x", "status": "vendu", "price": 6},
            {"card_id": "c2", "clear_url": True},
            {"card_id": "c3", "status": "a_vendre", "vinted_url": "https://www.vinted.fr/items/78-c"},
            {"card_id": "inconnue", "status": "vendu"},
        ]}).json()
        self.assertEqual((r["updated"], r["errors"], r["ebay_withdrawn"]), (3, ["inconnue"], 1))
        self.assertEqual((self.cards[0]["vinted_url"], self.cards[0]["status"], self.cards[0]["price"], self.cards[0]["vinted_price"]),
                         ("https://www.vinted.fr/items/77-a", "vendu", 6, 6))
        self.assertIsNone(self.cards[1]["vinted_url"])
        self.assertEqual(withdrawn, ["c1"])
        bad = self.client.post("/api/extension/vinted-sync/apply", json={"actions": [{"card_id": "c1", "vinted_url": "https://evil.example/items/1"}]})
        self.assertEqual(bad.status_code, 422)

    def test_set_price_mirrors_vinted_price(self):
        r = self.client.patch("/api/extension/cards/c3/price", json={"price": 12.345})
        self.assertEqual(r.json(), {"card_id": "c3", "price": 12.35})
        self.assertEqual((self.cards[2]["price"], self.cards[2]["vinted_price"]), (12.35, 12.35))
        self.assertEqual(self.client.patch("/api/extension/cards/c3/price", json={"price": 0}).status_code, 422)

    def test_attach_then_undo_restores_status(self):
        url = "https://www.vinted.fr/items/123456789-carte-b?referrer=catalog"
        r = self.client.patch("/api/extension/cards/c2/vinted-listing", json={"url": url})
        self.assertEqual(r.json(), {"card_id": "c2", "vinted_url": "https://www.vinted.fr/items/123456789-carte-b", "status": "a_vendre"})
        r = self.client.patch("/api/extension/cards/c2/vinted-listing", json={"url": None, "restore_status": "collection"})
        self.assertEqual((r.json()["vinted_url"], self.cards[1]["status"]), (None, "collection"))
        self.assertEqual(self.client.patch("/api/extension/cards/c2/vinted-listing", json={"url": "https://www.vinted.fr/member/1"}).status_code, 422)


if __name__ == "__main__":
    unittest.main()
