import unittest
from unittest.mock import patch

from routers import cards


class CardImageUrlTests(unittest.TestCase):
    @patch.object(cards, "R2_PUBLIC_URL", "https://images.cardvaults.app")
    def test_accepts_configured_r2_host(self):
        self.assertTrue(
            cards._is_allowed_card_image_url("https://images.cardvaults.app/user/card_front.jpg")
        )

    @patch.object(cards, "R2_PUBLIC_URL", "https://images.cardvaults.app")
    def test_rejects_other_hosts_and_http(self):
        self.assertFalse(cards._is_allowed_card_image_url("https://example.com/card.jpg"))
        self.assertFalse(cards._is_allowed_card_image_url("http://images.cardvaults.app/card.jpg"))


if __name__ == "__main__":
    unittest.main()
