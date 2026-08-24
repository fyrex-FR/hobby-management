import math


def calculate_ebay_price(vinted_price: float) -> float:
    if not math.isfinite(vinted_price) or vinted_price < 0:
        raise ValueError("Le prix Vinted doit être positif ou nul.")
    before_rounding = (vinted_price + 0.35) / 0.91
    step = 0.5 if before_rounding < 5 else 1
    return round(math.ceil((before_rounding - 1e-12) / step) * step, 2)
