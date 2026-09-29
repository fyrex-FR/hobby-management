"""Filtrage des cartes exposées sur un lien de partage public."""

# Champs qui ne sortent jamais par un lien public : identité, prix d'achat,
# prix et identifiants eBay internes, coûts de grading.
PRIVATE_CARD_FIELDS = (
    "user_id",
    "purchase_price",
    "grading_cost",
    "vinted_price",
    "ebay_price",
    "ebay_sold_price",
    "ebay_sold_at",
    "price_inflation",
    "ebay_offer_id",
    "ebay_listing_id",
)


def public_card(card: dict, show_prices: bool) -> dict:
    """Version d'une carte exposable sur un lien de partage public.

    Un seul prix public : le prix Vinted s'il existe, sinon le prix de vente
    (même règle que l'application), et seulement si le lien affiche les prix.
    """
    out = {k: v for k, v in card.items() if k not in PRIVATE_CARD_FIELDS}
    vinted = card.get("vinted_price")
    public_price = vinted if vinted is not None else card.get("price")
    if show_prices:
        out["price"] = public_price
    else:
        out.pop("price", None)
    return out
