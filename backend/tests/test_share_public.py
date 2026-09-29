import unittest

from services.share_public import public_card


CARD = {
    "id": "c1",
    "user_id": "u1",
    "player": "LeBron James",
    "price": 10.0,
    "vinted_price": 12.0,
    "ebay_price": 14.5,
    "ebay_sold_price": 13.0,
    "purchase_price": 3.0,
    "grading_cost": 25.0,
    "ebay_offer_id": "offer-1",
    "ebay_listing_id": "listing-1",
    "vinted_url": "https://www.vinted.fr/items/1",
}


class PublicCardTests(unittest.TestCase):
    def test_hides_every_price_when_prices_are_hidden(self):
        out = public_card(dict(CARD), show_prices=False)
        for key in ("price", "vinted_price", "ebay_price", "ebay_sold_price", "purchase_price", "grading_cost"):
            self.assertNotIn(key, out)

    def test_exposes_a_single_public_price_preferring_vinted(self):
        out = public_card(dict(CARD), show_prices=True)
        self.assertEqual(out["price"], 12.0)
        self.assertNotIn("vinted_price", out)
        self.assertNotIn("purchase_price", out)

    def test_falls_back_to_sale_price_without_vinted_price(self):
        out = public_card({**CARD, "vinted_price": None}, show_prices=True)
        self.assertEqual(out["price"], 10.0)

    def test_never_exposes_owner_or_internal_ebay_ids(self):
        out = public_card(dict(CARD), show_prices=True)
        for key in ("user_id", "ebay_offer_id", "ebay_listing_id"):
            self.assertNotIn(key, out)
        self.assertEqual(out["vinted_url"], CARD["vinted_url"])

    def test_does_not_mutate_the_input(self):
        card = dict(CARD)
        public_card(card, show_prices=False)
        self.assertEqual(card["purchase_price"], 3.0)


if __name__ == "__main__":
    unittest.main()
