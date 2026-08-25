import unittest

from services.card_taxonomy import apply_refine, classify, refine_keywords
from services.extension_helpers import (
    allowed_image_url, allowed_source_url, annotate_comparables, build_browse_queries,
    build_search_queries, comparable_key, ebay_item_id, exclude_source_listing,
    match_level, merge_ranked_results,
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


WEMBY = "Panini Phoenix Basketball 2023-24 Victor Wembanyama RC Spurs #256"


class MarketplaceNoiseTest(unittest.TestCase):
    """Le nom du site ne doit jamais devenir un mot-clé de recherche eBay."""

    LEAKED = "Carte Pokémon Dracaufeu V Gradée 10 Collect Aura | Vinted"

    def test_site_name_never_reaches_a_sold_query(self):
        for query in build_search_queries(self.LEAKED):
            self.assertNotIn("vinted", query)

    def test_site_name_never_reaches_a_browse_query(self):
        for query in build_browse_queries(self.LEAKED):
            self.assertNotIn("vinted", query)

    def test_the_card_itself_survives(self):
        self.assertIn("dracaufeu", build_search_queries(self.LEAKED)[0])


class BrowseQueryTest(unittest.TestCase):
    """La Browse API combine les mots en ET : un titre entier ne matche rien."""

    def test_queries_get_shorter_not_longer(self):
        queries = build_browse_queries(WEMBY)
        lengths = [len(query.split()) for query in queries]
        self.assertEqual(lengths, sorted(lengths, reverse=True))
        self.assertLessEqual(lengths[0], 5)

    def test_the_player_name_survives_every_shortening(self):
        for query in build_browse_queries(WEMBY):
            self.assertIn("wembanyama", query)

    def test_generic_sport_words_are_dropped(self):
        joined = " ".join(build_browse_queries(WEMBY))
        self.assertNotIn("basketball", joined)
        self.assertNotIn(" rc", joined)

    def test_card_number_travels_without_its_hash(self):
        first = build_browse_queries(WEMBY)[0]
        self.assertIn("256", first)
        self.assertNotIn("#", first)

    def test_refine_keywords_are_appended_to_every_query(self):
        refine = {"variant_text": "Silver", "grader": "PSA", "grade": 10.0, "grade_label": None}
        for query in build_browse_queries(WEMBY, refine_keywords(refine)):
            self.assertTrue(query.endswith("Silver PSA 10"), query)

    def test_a_short_title_still_produces_a_query(self):
        self.assertTrue(build_browse_queries("Pikachu"))


class RefineTest(unittest.TestCase):
    def test_manual_grade_overrides_an_ungraded_detection(self):
        detected = classify(WEMBY, condition="Non gradée - Quasi neuf ou mieux")
        self.assertEqual(detected["bucket_text"], "Base · Brut")
        refined = apply_refine(detected, {"variant_text": "Base", "grader": "PSA", "grade": 10.0, "grade_label": None})
        self.assertEqual(refined["bucket_text"], "Base · PSA 10")
        self.assertEqual(refined["bucket_key"], "base|psa-10")
        self.assertTrue(refined["refined"])

    def test_refine_keeps_the_card_number(self):
        refined = apply_refine(classify(WEMBY), {"grader": "PSA", "grade": 9.0})
        self.assertEqual(refined["card_number"], "256")

    def test_clearing_the_grade_returns_to_raw(self):
        refined = apply_refine(classify(WEMBY), {"variant_text": "Teal Lazer"})
        self.assertEqual(refined["bucket_text"], "Teal Lazer · Brut")

    def test_a_serial_is_not_used_as_a_search_keyword(self):
        self.assertEqual(refine_keywords({"variant_text": "Gold /25"}), ["Gold"])

    def test_base_alone_adds_no_keyword(self):
        self.assertEqual(refine_keywords({"variant_text": "Base"}), [])


class DeduplicationTest(unittest.TestCase):
    """Les URL eBay portent un suivi différent à chaque recherche."""

    def test_tracking_parameters_do_not_create_a_duplicate(self):
        first = {"url": "https://www.ebay.fr/itm/226889222941?_skw=wemby&_trkparms=a", "title": "Wemby #256", "price": 8.23}
        second = {"url": "https://www.ebay.fr/itm/226889222941?_skw=phoenix&_trkparms=b", "title": "Wemby #256", "price": 8.23}
        self.assertEqual(comparable_key(first), comparable_key(second))
        self.assertEqual(len(merge_ranked_results([[first], [second]], "Wemby #256")), 1)

    def test_distinct_listings_are_kept_apart(self):
        results = merge_ranked_results([[
            {"url": "https://www.ebay.fr/itm/111111111111", "title": "Wemby #256", "price": 8.0},
            {"url": "https://www.ebay.fr/itm/222222222222", "title": "Wemby #256", "price": 9.0},
        ]], "Wemby #256")
        self.assertEqual(len(results), 2)


if __name__ == "__main__":
    unittest.main()
