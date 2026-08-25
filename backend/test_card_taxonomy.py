import unittest

from services.card_taxonomy import classify, detect_card_number, same_card_number, strip_grading


def bucket(title, **kwargs):
    return classify(title, **kwargs)["bucket_text"]


class WembanyamaComparablesTest(unittest.TestCase):
    """Titres réellement renvoyés par Scout sur la Phoenix #256 de Wembanyama."""

    def test_base_raw(self):
        self.assertEqual(
            bucket("Panini 2023-24 Phoenix Rookies Victor Wembanyama #256 RC Base Spurs"),
            "Base · Brut",
        )

    def test_emoji_title_stays_base_raw(self):
        self.assertEqual(
            bucket("🟠VICTOR WEMBANYAMA🟠2023-24 Panini Phoenix ROOKIE CARD RC #256 SPURS"),
            "Base · Brut",
        )

    def test_psa_9_base(self):
        self.assertEqual(
            bucket("Panini Phoenix Victor Wembanyama Spurs Rookie #256 PSA 9 2023-24"),
            "Base · PSA 9",
        )

    def test_teal_lazer_stays_raw(self):
        self.assertEqual(
            bucket("VICTOR WEMBANYAMA 2023-24 PANINI PHOENIX ROOKIE TEAL LAZER #256 SPURS Q7689"),
            "Teal Lazer · Brut",
        )

    def test_silver_psa_10(self):
        self.assertEqual(
            bucket("2023-24 Phoenix Basketball Victor Wembanyama #256 Silver Rookie PSA 10 Spurs"),
            "Silver · PSA 10",
        )

    def test_blue_cracked_ice(self):
        self.assertEqual(
            bucket("Panini 2023-24 Phoenix Victor Wembanyama Rookie Blue Cracked Ice #256 Spurs"),
            "Blue Cracked Ice · Brut",
        )

    def test_gem_mention_does_not_shift_the_grade(self):
        self.assertEqual(
            bucket("Victor Wembanyama Rookie PSA 10 - GEM - 2023-24 Panini Phoenix #256 Spurs"),
            "Base · PSA 10",
        )

    def test_source_listing_is_base_raw(self):
        result = classify(
            "Panini Phoenix Basketball 2023-24 Victor Wembanyama RC Spurs #256",
            condition="Non gradée - Quasi neuf ou mieux",
        )
        self.assertEqual(result["bucket_text"], "Base · Brut")
        self.assertEqual(result["card_number"], "256")


class GradingTest(unittest.TestCase):
    def test_gold_label_is_a_slab_label_not_a_gold_parallel(self):
        result = classify("Pashmilla 119/086 ccc 10 Gold label")
        self.assertEqual(result["bucket_text"], "Base · CCC 10 Gold Label")
        # Le zéro de tête est retiré pour que « 119/086 » et « 119/86 » se rejoignent.
        self.assertEqual(result["card_number"], "119/86")

    def test_grading_wording_between_company_and_score(self):
        self.assertEqual(bucket("Pikachu 276/217 CCC Grading 10 FR"), "Base · CCC 10")

    def test_french_graded_wording(self):
        self.assertEqual(bucket("Pikachu alt 276/217 gradée CCC 10"), "Alt Art · CCC 10")

    def test_half_grades(self):
        self.assertEqual(bucket("Michael Jordan Fleer BGS 9.5 rookie"), "Base · BGS 9.5")

    def test_explicit_raw_beats_a_bare_company_mention(self):
        self.assertEqual(bucket("Carte non gradée, envoi possible en PSA"), "Base · Brut")

    def test_ebay_condition_carries_the_grade(self):
        self.assertEqual(
            bucket("Victor Wembanyama Phoenix #256", condition="Gradée - PSA 10"),
            "Base · PSA 10",
        )

    def test_specifics_win_over_the_title(self):
        result = classify(
            "Wembanyama Phoenix #256 rookie",
            specifics={"Société de notation": "PSA", "Note": "10", "Professionnel noté": "Oui"},
        )
        self.assertEqual(result["bucket_text"], "Base · PSA 10")

    def test_specifics_can_declare_the_card_ungraded(self):
        result = classify("Wembanyama Phoenix #256 PSA", specifics={"Professionnel noté": "Non"})
        self.assertFalse(result["graded"])


class VariantTest(unittest.TestCase):
    def test_team_colour_is_not_a_parallel(self):
        self.assertEqual(bucket("2023 Topps Boston Red Sox rookie #45"), "Base · Brut")

    def test_set_name_is_not_a_parallel(self):
        self.assertEqual(bucket("2023-24 Panini Prizm Basketball Wembanyama #1"), "Base · Brut")

    def test_numbered_print_run_splits_the_variant(self):
        self.assertEqual(bucket("Wembanyama Gold Prizm 07/10 #256"), "Gold /10 · Brut")

    def test_pokemon_numbering_is_not_a_print_run(self):
        result = classify("Pikachu ex 276/217 Héros Transcendants")
        self.assertIsNone(result["serial"])
        self.assertEqual(result["card_number"], "276/217")

    def test_lots_and_sealed_products_are_flagged(self):
        self.assertTrue(classify("Lot de 20 cartes Panini Phoenix")["is_lot"])
        self.assertTrue(classify("Display scellé Panini Prizm 2023-24")["is_lot"])
        self.assertFalse(classify("Panini Phoenix Wembanyama #256")["is_lot"])


class CardNumberTest(unittest.TestCase):
    def test_number_formats(self):
        self.assertEqual(detect_card_number("panini score #20 l1"), "20")
        self.assertEqual(detect_card_number("carte n°45 lorient"), "45")
        self.assertEqual(detect_card_number("#005 rookie"), "5")

    def test_unknown_number_never_rejects_a_comparable(self):
        self.assertTrue(same_card_number("256", ""))
        self.assertTrue(same_card_number("", "256"))
        self.assertTrue(same_card_number("256", "256"))
        self.assertFalse(same_card_number("256", "12"))


class VintedSourceTest(unittest.TestCase):
    """Sur Vinted, la note vit dans le titre libre ou dans la description."""

    DESCRIPTION = ("Je vends cette carte Pokémon Dracaufeu V certifiée Gem Mint 10 par la "
                   "société de gradation Collect Aura. Carte japonaise numéro 014/100 de "
                   "l'extension Star Birth, sortie en 2021.")

    def test_french_grader_in_a_free_form_title(self):
        result = classify("Carte Pokémon Dracaufeu V Gradée 10 Collect Aura - Star Birth (Japonais)")
        self.assertEqual(result["bucket_text"], "Base · Collect Aura 10")

    def test_description_fills_in_what_the_title_omits(self):
        result = classify("Carte Pokémon Dracaufeu V Star Birth", description=self.DESCRIPTION)
        self.assertTrue(result["graded"])
        self.assertEqual(result["grade"], 10.0)
        self.assertEqual(result["card_number"], "14/100")

    def test_the_title_wins_over_the_description(self):
        result = classify("Dracaufeu V PSA 9", description=self.DESCRIPTION)
        self.assertEqual(result["bucket_text"], "Base · PSA 9")

    def test_a_card_declared_raw_stays_raw(self):
        result = classify("Dracaufeu V non gradée", description="J'ai aussi des PSA 10 en vente.")
        self.assertFalse(result["graded"])


class StripGradingTest(unittest.TestCase):
    """La note range la carte dans sa case ; elle n'a rien à faire dans la requête."""

    def test_grading_leaves_the_card_identity_intact(self):
        subject = strip_grading("Carte Pokémon Dracaufeu V Gradée 10 Collect Aura - Star Birth (Japonais)")
        self.assertIn("dracaufeu", subject)
        self.assertIn("star birth", subject)
        for removed in ("gradee", "collect aura", "10"):
            self.assertNotIn(removed, subject)

    def test_slab_label_is_removed_with_its_grade(self):
        self.assertEqual(strip_grading("Pashmilla 119/086 ccc 10 Gold label"), "pashmilla 119/086")

    def test_an_ungraded_title_is_left_alone(self):
        subject = strip_grading("Panini Phoenix Basketball 2023-24 Victor Wembanyama RC Spurs #256")
        self.assertIn("wembanyama", subject)
        self.assertIn("#256", subject)

    def test_a_title_made_only_of_grading_does_not_vanish_silently(self):
        self.assertEqual(strip_grading("PSA 10"), "")


if __name__ == "__main__":
    unittest.main()
