import unittest

from services.card_matching import classify_matches, recommended_action


BASE = {
    "id": "existing", "player": "Victor Wembanyama", "year": "2023-24", "brand": "Panini",
    "set_name": "Prizm", "card_number": "#136", "insert_name": "", "parallel_name": "Silver Prizm",
    "numbered": "/99", "serial_number": "23/99",
}


class CardMatchingTests(unittest.TestCase):
    def test_exact_match_is_high_confidence(self):
        result = classify_matches(BASE, [BASE], has_back=True)
        self.assertEqual(result["classification"], "match")
        self.assertGreaterEqual(result["matches"][0]["score"], 85)

    def test_distinct_serials_are_never_matches(self):
        target = {**BASE, "serial_number": "24/99"}
        result = classify_matches(target, [BASE], has_back=True)
        self.assertEqual(result["classification"], "new")
        self.assertEqual(result["matches"], [])

    def test_missing_identity_is_insufficient(self):
        result = classify_matches({"player": "Victor Wembanyama", "year": "2023-24"}, [BASE])
        self.assertEqual(result["classification"], "insufficient")

    def test_parallel_conflict_is_not_automatic(self):
        target = {**BASE, "parallel_name": "Gold Prizm", "serial_number": ""}
        result = classify_matches(target, [BASE], has_back=True)
        self.assertNotEqual(result["classification"], "match")

    def test_medium_match_requires_review(self):
        target = {**BASE, "brand": "", "set_name": "", "parallel_name": "", "numbered": "", "serial_number": ""}
        result = classify_matches(target, [BASE], has_back=False)
        self.assertEqual(result["classification"], "probable")

    def test_bulk_recommendations_are_conservative(self):
        self.assertEqual(recommended_action({"classification": "new", "matches": [{"score": 30}]}), ("create", None))
        self.assertEqual(recommended_action({"classification": "match", "matches": [{"score": 91, "card_id": "card-1"}]}), ("shelve", "card-1"))
        self.assertIsNone(recommended_action({"classification": "probable", "matches": [{"score": 70, "card_id": "card-2"}]}))
        self.assertIsNone(recommended_action({"classification": "insufficient", "matches": []}))


if __name__ == "__main__":
    unittest.main()
