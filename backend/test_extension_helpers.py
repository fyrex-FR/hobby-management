import unittest

from services.card_taxonomy import classify
from services.extension_helpers import (
    allowed_image_url, allowed_source_url, annotate_comparables, build_search_queries,
    ebay_item_id, exclude_source_listing, match_level, merge_ranked_results,
)


class ExtensionHelpersTest(unittest.TestCase):
    def test_image_allowlist(self):
        self.assertTrue(allowed_image_url("https://images1.vinted.net/card.jpg"))
        self.assertTrue(allowed_image_url("https://i.ebayimg.com/card.jpg"))
        self.assertFalse(allowed_image_url("http://i.ebayimg.com/card.jpg"))
        self.assertFalse(allowed_image_url("https://ebayimg.com.attacker.example/card.jpg"))
        self.assertFalse(allowed_image_url("https://127.0.0.1/card.jpg"))

    def test_kroupi_queries_keep_insert_and_card_details(self):
        queries = build_search_queries("2023 2024 Hot Rookies Eli Junior Kroupi RC Panini Score 23/24 #20 L1 Lorient Mint")
        self.assertEqual(queries[0], "2023 2024 hot rookies eli junior kroupi rc panini score 23/24 #20 l1")
        self.assertIn("hot", queries[0])
        self.assertNotIn("base", " ".join(queries))

    def test_results_are_deduplicated_and_ranked(self):
        groups = [[
            {"item_id": "1", "title": "Eli Junior Kroupi Hot Rookies #20", "price": 4.0},
            {"item_id": "2", "title": "Random football card", "price": 2.0},
        ], [{"item_id": "1", "title": "Eli Junior Kroupi Hot Rookies #20 RC", "price": 4.0}]]
        results = merge_ranked_results(groups, "Hot Rookies Eli Junior Kroupi RC Panini Score #20")
        self.assertEqual([item["item_id"] for item in results], ["1", "2"])
        self.assertGreater(results[0]["relevance"], results[1]["relevance"])

    def test_source_allowlist(self):
        self.assertTrue(allowed_source_url("vinted", "https://www.vinted.fr/items/123-card"))
        self.assertTrue(allowed_source_url("ebay", "https://www.ebay.fr/itm/456"))
        self.assertFalse(allowed_source_url("vinted", "https://www.vinted.fr/member/123"))
        self.assertFalse(allowed_source_url("ebay", "https://www.ebay.fr.attacker.example/itm/456"))

    def test_source_listing_is_excluded_by_id_or_url(self):
        source = "https://www.ebay.fr/itm/hot-rookies/123456789012?hash=abc"
        results = [
            {"item_id": "123456789012", "url": "https://www.ebay.com/itm/123456789012", "title": "source"},
            {"item_id": "987654321098", "url": "https://www.ebay.fr/itm/987654321098", "title": "other"},
        ]
        self.assertEqual(ebay_item_id(source), "123456789012")
        self.assertEqual([item["title"] for item in exclude_source_listing(results, source)], ["other"])


class ComparableMatchingTest(unittest.TestCase):
    """La #256 brute de Wembanyama ne doit être chiffrée que sur ses semblables."""

    REFERENCE = classify(
        "Panini Phoenix Basketball 2023-24 Victor Wembanyama RC Spurs #256",
        condition="Non gradée - Quasi neuf ou mieux",
    )

    def level(self, title):
        return match_level(self.REFERENCE, classify(title))

    def test_same_variant_and_grade_is_exact(self):
        self.assertEqual(self.level("Panini 2023-24 Phoenix Rookies Victor Wembanyama #256 RC Base Spurs"), "exact")

    def test_slab_of_the_same_variant_is_only_a_variant_match(self):
        self.assertEqual(self.level("Panini Phoenix Victor Wembanyama Spurs Rookie #256 PSA 9 2023-24"), "variant")

    def test_raw_parallel_shares_the_grade_not_the_card(self):
        self.assertEqual(self.level("VICTOR WEMBANYAMA 2023-24 PANINI PHOENIX ROOKIE TEAL LAZER #256 SPURS"), "grade")

    def test_parallel_slab_matches_nothing(self):
        self.assertEqual(self.level("2023-24 Phoenix Victor Wembanyama #256 Silver Rookie PSA 10 Spurs"), "other")

    def test_another_card_number_is_off_card(self):
        self.assertEqual(self.level("Panini Phoenix 2023-24 Victor Wembanyama #12 Spurs"), "off_card")

    def test_lots_are_off_card(self):
        self.assertEqual(self.level("Lot de 30 cartes Panini Phoenix 2023-24 Wembanyama #256"), "off_card")

    def test_annotation_keeps_the_original_fields(self):
        annotated = annotate_comparables(
            [{"title": "Wembanyama Phoenix #256 RC Spurs", "price": 8.23, "url": "https://ebay.fr/itm/1"}],
            self.REFERENCE,
        )
        self.assertEqual(annotated[0]["price"], 8.23)
        self.assertEqual(annotated[0]["match"], "exact")
        self.assertEqual(annotated[0]["classification"]["bucket_text"], "Base · Brut")

    def test_ebay_condition_of_a_comparable_is_taken_into_account(self):
        annotated = annotate_comparables(
            [{"title": "Wembanyama Phoenix #256 Spurs", "condition": "Gradée - PSA 10", "price": 205.0}],
            self.REFERENCE,
        )
        self.assertEqual(annotated[0]["match"], "variant")


if __name__ == "__main__":
    unittest.main()
