import unittest

from services.marketplace_pricing import calculate_ebay_price


class MarketplacePricingTest(unittest.TestCase):
    def test_sans_surplus_reprend_le_prix_vinted(self):
        self.assertEqual(calculate_ebay_price(10, fee_markup=False), 10)
        self.assertEqual(calculate_ebay_price(3.2, fee_markup=False), 3.5)

    def test_surplus_actif_par_defaut(self):
        self.assertEqual(calculate_ebay_price(10), calculate_ebay_price(10, fee_markup=True))

    def test_rounds_to_euro_above_five(self):
        self.assertEqual(calculate_ebay_price(10), 12)

    def test_rounds_to_half_euro_below_five(self):
        self.assertEqual(calculate_ebay_price(3.2), 4)

    def test_rejects_negative_price(self):
        with self.assertRaises(ValueError):
            calculate_ebay_price(-1)


if __name__ == "__main__":
    unittest.main()
