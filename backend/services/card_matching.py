"""Deterministic, explainable matching for imported trading cards."""
import re
import unicodedata
from typing import Any


def normalize(value: Any) -> str:
    if value is None:
        return ""
    text = unicodedata.normalize("NFKD", str(value)).encode("ascii", "ignore").decode()
    text = text.lower().strip().replace("#", "")
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def normalize_serial(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value or "")).encode("ascii", "ignore").decode().replace(" ", "")
    match = re.search(r"(\d+)/(\d+)", text)
    return f"{int(match.group(1))}/{int(match.group(2))}" if match else ""


def build_fingerprint(card: dict) -> dict:
    return {
        key: normalize(card.get(key))
        for key in ("year", "brand", "set_name", "card_number", "player", "insert_name", "parallel_name", "numbered")
    } | {"serial_number": normalize_serial(card.get("serial_number"))}


WEIGHTS = {
    "card_number": 25,
    "player": 18,
    "year": 12,
    "brand": 8,
    "set_name": 14,
    "insert_name": 8,
    "parallel_name": 10,
    "numbered": 5,
}

LABELS = {
    "card_number": "même numéro de carte",
    "player": "même joueur",
    "year": "même année",
    "brand": "même marque",
    "set_name": "même set",
    "insert_name": "même insert",
    "parallel_name": "même parallèle",
    "numbered": "même tirage",
}


def score_candidate(target: dict, candidate: dict, has_back: bool = True) -> dict | None:
    left = build_fingerprint(target)
    right = build_fingerprint(candidate)
    if left["serial_number"] and right["serial_number"] and left["serial_number"] != right["serial_number"]:
        return None

    score = 0
    possible = 0
    reasons: list[str] = []
    conflicts: list[str] = []
    for field, weight in WEIGHTS.items():
        if left[field]:
            possible += weight
            if right[field] == left[field]:
                score += weight
                reasons.append(LABELS[field])
            elif right[field]:
                conflicts.append(field)

    # A readable back makes card_number evidence materially stronger.
    if has_back and left["card_number"] and left["card_number"] == right["card_number"]:
        score += 8
        possible += 8
        reasons.insert(0, "numéro confirmé par le verso")
    if left["serial_number"] and left["serial_number"] == right["serial_number"]:
        score += 10
        possible += 10
        reasons.insert(0, "même numéro de série")

    coverage = possible / 100
    # Conflicts on identity fields prevent an automatic high-confidence result.
    hard_conflict = any(field in conflicts for field in ("card_number", "player", "year", "set_name", "parallel_name"))
    return {
        "card_id": candidate.get("id"),
        "score": min(score, 100),
        "coverage": round(coverage, 2),
        "reasons": reasons,
        "conflicts": conflicts,
        "hard_conflict": hard_conflict,
    }


def classify_matches(target: dict, cards: list[dict], has_back: bool = True, limit: int = 3) -> dict:
    fp = build_fingerprint(target)
    identity_fields = sum(bool(fp[key]) for key in ("player", "year", "brand", "set_name", "card_number"))
    if identity_fields < 3 or not fp["player"] or not (fp["card_number"] or fp["set_name"]):
        return {"classification": "insufficient", "fingerprint": fp, "matches": []}

    matches = [match for card in cards if (match := score_candidate(target, card, has_back)) is not None]
    matches = sorted(matches, key=lambda item: item["score"], reverse=True)[:limit]
    best = matches[0] if matches else None
    if best and best["score"] >= 85 and best["coverage"] >= 0.65 and not best["hard_conflict"]:
        classification = "match"
    elif best and best["score"] >= 55:
        classification = "probable"
    else:
        classification = "new"
    return {"classification": classification, "fingerprint": fp, "matches": matches}
