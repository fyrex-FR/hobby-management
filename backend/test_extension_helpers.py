import unittest

from services.extension_helpers import allowed_image_url, allowed_source_url, build_search_query


class ExtensionHelpersTest(unittest.TestCase):
    def test_image_allowlist(self):
        self.assertTrue(allowed_image_url("https://images1.vinted.net/card.jpg"))
        self.assertTrue(allowed_image_url("https://i.ebayimg.com/card.jpg"))
        self.assertFalse(allowed_image_url("http://i.ebayimg.com/card.jpg"))
        self.assertFalse(allowed_image_url("https://ebayimg.com.attacker.example/card.jpg"))
        self.assertFalse(allowed_image_url("https://127.0.0.1/card.jpg"))

    def test_search_query_prefers_identification(self):
        query = build_search_query({
            "year": "2023-24", "brand": "Panini", "set": "Prizm",
            "player": "Victor Wembanyama", "card_number": "136", "parallel": "Silver",
        }, "fallback")
        self.assertEqual(query, "2023-24 Panini Prizm Victor Wembanyama 136 Silver")

    def test_source_allowlist(self):
        self.assertTrue(allowed_source_url("vinted", "https://www.vinted.fr/items/123-card"))
        self.assertTrue(allowed_source_url("ebay", "https://www.ebay.fr/itm/456"))
        self.assertFalse(allowed_source_url("vinted", "https://www.vinted.fr/member/123"))
        self.assertFalse(allowed_source_url("ebay", "https://www.ebay.fr.attacker.example/itm/456"))


if __name__ == "__main__":
    unittest.main()
