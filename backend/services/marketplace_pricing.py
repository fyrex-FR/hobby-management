import math


def calculate_ebay_price(vinted_price: float) -> float:
    if not math.isfinite(vinted_price) or vinted_price < 0:
        raise ValueError("Le prix Vinted doit être positif ou nul.")
    before_rounding = (vinted_price + 0.35) / 0.91
    step = 0.5 if before_rounding < 5 else 1
    return round(math.ceil((before_rounding - 1e-12) / step) * step, 2)


PRICING_MARKUP = 1.175


def propose_from_sold(prices: list[float]) -> tuple[float, float]:
    """Médiane des ventes retenues et prix proposé (médiane + majoration, arrondi supérieur, plancher 1 €)."""
    if not prices:
        raise ValueError("Aucune vente retenue.")
    s = sorted(prices)
    n = len(s)
    median = s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2
    raw = median * PRICING_MARKUP
    step = 0.5 if raw < 5 else 1
    return round(median, 2), max(1.0, round(math.ceil((raw - 1e-12) / step) * step, 2))
