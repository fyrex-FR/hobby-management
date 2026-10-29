"""Texte d'une annonce Vinted pour une carte.

Même règles que `frontend/src/lib/vintedDraft.ts` et `vintedHashtags.ts`
(titre, description, hashtags #fyrex_…) : l'extension prend ce texte tel
quel, l'app web garde sa copie pour l'ouverture manuelle d'une seule carte.
"""
import re
import unicodedata
from typing import Optional

NBA_TEAM_SLUGS = {
    "atlanta hawks": "hawks",
    "boston celtics": "celtics",
    "brooklyn nets": "nets",
    "charlotte hornets": "hornets",
    "chicago bulls": "bulls",
    "cleveland cavaliers": "cavaliers",
    "dallas mavericks": "mavericks",
    "denver nuggets": "nuggets",
    "detroit pistons": "pistons",
    "golden state warriors": "warriors",
    "houston rockets": "rockets",
    "indiana pacers": "pacers",
    "la clippers": "clippers",
    "los angeles clippers": "clippers",
    "los angeles lakers": "lakers",
    "memphis grizzlies": "grizzlies",
    "miami heat": "heat",
    "milwaukee bucks": "bucks",
    "minnesota timberwolves": "timberwolves",
    "new orleans pelicans": "pelicans",
    "new york knicks": "knicks",
    "oklahoma city thunder": "thunder",
    "orlando magic": "magic",
    "philadelphia 76ers": "76ers",
    "phoenix suns": "suns",
    "portland trail blazers": "trailblazers",
    "sacramento kings": "kings",
    "san antonio spurs": "spurs",
    "toronto raptors": "raptors",
    "utah jazz": "jazz",
    "washington wizards": "wizards",
}

HASHTAG_INTRO = "🔎 Explorez ma collection via les hashtags ci-dessous pour découvrir d’autres cartes similaires :"


def _strip_accents(value: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", value) if not unicodedata.combining(c))


def normalize_hashtag(value: Optional[str]) -> str:
    return re.sub(r"[^a-z0-9]", "", _strip_accents(value or "").lower())


def _team_slug(team: Optional[str]) -> str:
    normalized = re.sub(r"[^a-z0-9]+", " ", _strip_accents(team or "").lower()).strip()
    return NBA_TEAM_SLUGS.get(normalized) or normalize_hashtag(team)


def build_hashtags(player: Optional[str] = None, team: Optional[str] = None, series: Optional[str] = None) -> list[str]:
    slugs = [s for s in (normalize_hashtag(player), _team_slug(team), normalize_hashtag(series)) if s]
    return [f"#fyrex_{s}" for s in dict.fromkeys(slugs)]


def add_hashtags(description: str, player=None, team=None, series=None) -> str:
    tags = build_hashtags(player, team, series)
    if not tags:
        return description
    return "\n".join([HASHTAG_INTRO, "", *tags, "", description])


def listing_price(card: dict) -> Optional[float]:
    value = card.get("vinted_price")
    if value is None:
        value = card.get("price")
    return float(value) if value is not None else None


def build_draft(card: dict) -> dict:
    parallel = card.get("parallel_name")
    title = " ".join(str(v) for v in (
        card.get("player"), card.get("year"), card.get("brand"), card.get("set_name"), card.get("insert_name"),
        parallel if parallel and parallel != "Base" else None,
        card.get("numbered"),
    ) if v)
    brand, set_name = card.get("brand"), card.get("set_name")
    lines = [
        f"{brand} {set_name}" if brand and set_name else None,
        f"Insert : {card['insert_name']}" if card.get("insert_name") else None,
        f"Parallel : {parallel}" if parallel else None,
        f"Carte {card['card_number']}" if card.get("card_number") else None,
        f"Numérotée {card['numbered']}" if card.get("numbered") else None,
        f"État : {card['condition_notes']}" if card.get("condition_notes") else "Excellent état, jamais joué",
    ]
    description = add_hashtags(
        "\n".join(l for l in lines if l),
        player=card.get("player"), team=card.get("team"), series=set_name or brand,
    )
    return {"title": title, "description": description, "price": listing_price(card) or 0, "brand": brand or ""}


def ebay_sold_query(card: dict) -> str:
    """Recherche eBay des ventes, comme le bouton « eBay Sold » de la fiche carte
    (frontend CardDetail.buildPriceSearchText)."""
    number = (card.get("card_number") or "").strip()
    if number and not number.startswith("#"):
        number = f"#{number}"
    parts = (
        card.get("player"), card.get("year"), card.get("set_name") or card.get("brand"), number or None,
        card.get("insert_name"), card.get("parallel_name"), card.get("numbered"),
    )
    return " ".join(" ".join(str(p) for p in parts if p).split())
