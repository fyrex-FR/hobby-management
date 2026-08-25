"""Étiquetage des cartes par variante (parallèle) et par note de gradation.

Une recherche eBay sur une carte ramène pêle-mêle la base brute, ses
parallèles et ses versions gradées, dont les prix n'ont aucun rapport. Ce
module attribue à chaque annonce une « case » variante × note pour que
l'extension compare l'annonce consultée au bon sous-marché au lieu d'une
médiane composite.

Rien n'est inventé : en l'absence de signal explicite dans le titre, la carte
est considérée brute et en variante de base.
"""

import re
import unicodedata

GRADERS = {
    "psa": "PSA", "bgs": "BGS", "beckett": "BGS", "sgc": "SGC", "cgc": "CGC",
    "ccc": "CCC", "ace": "ACE", "pca": "PCA", "gma": "GMA", "hga": "HGA",
    "tag": "TAG", "isa": "ISA", "ags": "AGS", "ksa": "KSA", "csg": "CSG",
    "mnt": "MNT", "rcg": "RCG",
}

_GRADER_ALT = "|".join(sorted(GRADERS, key=len, reverse=True))
_SCORE = r"10|9[.,]5|9|8[.,]5|8|7[.,]5|7|6[.,]5|6|5[.,]5|5|4[.,]5|4|3|2|1"

# « PSA 10 », « CCC Grading 10 », « BGS-9.5 » : société puis note.
_GRADE_BEFORE = re.compile(
    rf"\b({_GRADER_ALT})\b\s*(?:grading|graded|grade|gradee|gradation|note)?\s*[-:#]?\s*({_SCORE})(?![\d.,/])"
)
# « 10 PSA » : note puis société, sans confondre avec un numéro de carte.
_GRADE_AFTER = re.compile(rf"(?<![\d.,/#-])({_SCORE})\s*\b({_GRADER_ALT})\b")
# Note sans société identifiable : « gradée 10 », « gem mint 9.5 ».
_GRADE_GENERIC = re.compile(
    rf"\b(?:gem\s*(?:mint|mt)|grad(?:ee?s?|ed|ing)|slab(?:bee?d?)?|note)\s*[-:#]?\s*({_SCORE})(?![\d.,/])"
)
_GRADER_ONLY = re.compile(rf"\b({_GRADER_ALT})\b")
_RAW = re.compile(r"non\s*grad|ungraded|not\s*graded|\braw\b|\bbrute?\b|sans\s*grad")
# Sous-label d'un slab : ne jamais confondre « Gold Label » avec un parallèle or.
_GRADE_LABEL = re.compile(r"\b(gold|black|silver|pristine|perfect|argent)\s*label\b")

# Noms d'équipes contenant une couleur : « Red Sox » n'est pas un parallèle.
_TEAM_COLORS = re.compile(
    r"\bred\s*(?:sox|wings?|bulls?|devils?|raiders?|stars?|army)\b"
    r"|\bblue\s*(?:jays?|devils?|jackets?)\b"
    r"|\bwhite\s*sox\b|\bgreen\s*bay\b|\bblack\s*hawks?\b|\bblackhawks\b"
)

# Couleurs de parallèle. Les mots français ambigus (rose, blanc) sont exclus :
# ce sont plus souvent des patronymes que des parallèles.
_COLORS: list[tuple[str, str]] = [
    ("Silver", r"silver|argente?e?"),
    ("Gold", r"gold(?!en)|doree?"),
    ("Bronze", r"bronze"),
    ("Teal", r"teal"),
    ("Red", r"red|rouge"),
    ("Blue", r"blue|bleue?"),
    ("Green", r"green|verte?"),
    ("Purple", r"purple|violette?"),
    ("Pink", r"pink"),
    ("Orange", r"orange"),
    ("Black", r"black"),
    ("White", r"white"),
    ("Yellow", r"yellow|jaune"),
    ("Aqua", r"aqua"),
    ("Neon", r"neon"),
    ("Camo", r"camo(?:uflage)?"),
]

# Motifs de parallèle. Volontairement sans nom de set (Prizm, Optic, Mosaic…),
# qui désignent la collection et non la variante.
_PATTERNS: list[tuple[str, str]] = [
    ("Cracked Ice", r"cracked\s*ice"),
    ("Lazer", r"la[sz]er"),
    ("Die-Cut", r"die[\s-]*cut"),
    ("Tie-Dye", r"tie[\s-]*dye"),
    ("Snakeskin", r"snake\s*skin"),
    ("Fireworks", r"fireworks?"),
    ("Refractor", r"refractor"),
    ("Reactive", r"reactive"),
    ("Shimmer", r"shimmer"),
    ("Sparkle", r"sparkle"),
    ("Nebula", r"nebula"),
    ("Genesis", r"genesis"),
    ("Marble", r"marble"),
    ("Pulsar", r"pulsar"),
    ("Mojo", r"mojo"),
    ("Hyper", r"hyper"),
    ("Disco", r"disco"),
    ("Scope", r"scope"),
    ("Wave", r"wave"),
    ("Holo", r"holo(?:foil|graphique)?"),
    # Cartes à jouer (Pokémon & co).
    ("Special Art", r"special\s*(?:illustration|art)|\bsar\b"),
    ("Full Art", r"full\s*art"),
    ("Alt Art", r"alt(?:ernative)?\s*art|\balt\b|\bchromatique\b"),
    ("Reverse", r"reverse"),
    ("Secret Rare", r"secret\s*rare"),
    ("Rainbow", r"rainbow"),
]

# Tirages numérotés courants. Restreindre à cette liste évite de prendre un
# numéro de carte Pokémon (« 276/217 ») pour un tirage limité.
_PRINT_RUNS = {
    1, 5, 8, 10, 15, 20, 23, 25, 30, 35, 40, 49, 50, 60, 65, 70, 75, 88, 99,
    125, 149, 175, 199, 249, 299, 349, 399, 499,
}
_SERIAL = re.compile(r"(?<![\d/])(\d{1,4})\s*/\s*(\d{1,4})(?![\d/])")

_CARD_NUMBER = re.compile(r"#\s*([a-z]{0,3}-?\d{1,4})\b|\bn[o°]\s*(\d{1,4})\b")

_LOT = re.compile(
    r"\blots?\b|\bbundle\b|\bx\s*\d{2,}\b|\b\d{2,}\s*cartes?\b|au\s*choix"
    r"|your\s*choice|\bpick\s*(?:your|a|one)\b|\bmyst(?:ery|ere)\b"
    r"|\bboo?ster\b|\bdisplay\b|\bcoffret\b|\bblister\b|\bscell?ee?\b|\bsealed\b"
)

_REPRINT = re.compile(r"\breprint\b|\breimpression\b|\bcustom\b|\bproxy\b|\bfan\s*art\b|\bnon\s*officiel")


def ascii_lower(value: str) -> str:
    """Minuscules sans accents, pour comparer des titres de marketplaces."""
    return unicodedata.normalize("NFKD", str(value or "")).encode("ascii", "ignore").decode().lower()


def _slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", ascii_lower(value)).strip("-")


def _cut(text: str, spans: list[tuple[int, int]]) -> str:
    """Retire du texte les portions déjà consommées par une autre détection."""
    for start, end in sorted(spans, reverse=True):
        text = f"{text[:start]} {text[end:]}"
    return text


def detect_grade(text: str) -> dict:
    """Reconnaît la société de notation, la note et le sous-label éventuels."""
    spans: list[tuple[int, int]] = []
    company = score = None

    label_match = _GRADE_LABEL.search(text)
    label = None
    if label_match:
        label = label_match.group(1).replace("argent", "silver").title()
        spans.append(label_match.span())

    match = _GRADE_BEFORE.search(text)
    if match:
        company, score = GRADERS[match.group(1)], match.group(2)
        spans.append(match.span())
    else:
        match = _GRADE_AFTER.search(text)
        if match:
            company, score = GRADERS[match.group(2)], match.group(1)
            spans.append(match.span())
        else:
            match = _GRADE_GENERIC.search(text)
            if match:
                score = match.group(1)
                spans.append(match.span())

    if company is None and score is None and label is None:
        # Une société citée sans note reste un signal de slab (« carte PSA »),
        # sauf si le titre annonce explicitement une carte brute.
        only = _GRADER_ONLY.search(text)
        if only and not _RAW.search(text):
            company = GRADERS[only.group(1)]
            spans.append(only.span())

    graded = bool(company or score or label)
    if graded and _RAW.search(_cut(text, spans)) and score is None:
        graded, company, label = False, None, None

    value = float(str(score).replace(",", ".")) if score else None
    return {"graded": graded, "grader": company, "grade": value, "grade_label": label, "spans": spans}


def detect_variant(text: str) -> dict:
    """Reconnaît la variante : couleur, motif et tirage numéroté."""
    cleaned = _TEAM_COLORS.sub(" ", text)
    spans: list[tuple[int, int]] = []

    pattern = None
    for name, expression in _PATTERNS:
        match = re.search(rf"\b(?:{expression})", cleaned)
        if match:
            pattern, cleaned = name, _cut(cleaned, [match.span()])
            break

    color = None
    for name, expression in _COLORS:
        if re.search(rf"\b(?:{expression})\b", cleaned):
            color = name
            break

    serial = None
    for numerator, denominator in _SERIAL.findall(text):
        if int(denominator) in _PRINT_RUNS and int(numerator) <= int(denominator):
            serial = f"/{int(denominator)}"
            break

    return {"color": color, "pattern": pattern, "serial": serial, "spans": spans}


def detect_card_number(text: str) -> str:
    """Numéro de carte : « #256 », « n°20 », ou numérotation « 276/217 »."""
    match = _CARD_NUMBER.search(text)
    if match:
        return (match.group(1) or match.group(2)).lstrip("0") or "0"
    for numerator, denominator in _SERIAL.findall(text):
        if int(denominator) not in _PRINT_RUNS or int(numerator) > int(denominator):
            return f"{int(numerator)}/{int(denominator)}"
    return ""


def _grade_key(grade: dict) -> str:
    if not grade["graded"]:
        return "raw"
    parts = [_slug(grade["grader"] or "gradee")]
    if grade["grade"] is not None:
        parts.append(f"{grade['grade']:g}".replace(".", "-"))
    if grade["grade_label"]:
        parts.append(_slug(grade["grade_label"]))
    return "-".join(parts)


def _grade_text(grade: dict) -> str:
    if not grade["graded"]:
        return "Brut"
    parts = [grade["grader"] or "Gradée"]
    if grade["grade"] is not None:
        parts.append(f"{grade['grade']:g}")
    if grade["grade_label"]:
        parts.append(grade["grade_label"] + " Label")
    return " ".join(parts)


def _variant_text(variant: dict) -> str:
    parts = [part for part in (variant["color"], variant["pattern"]) if part]
    text = " ".join(parts) or "Base"
    return f"{text} {variant['serial']}" if variant["serial"] else text


def _from_specifics(specifics: dict | None) -> dict:
    """Lit les caractéristiques structurées eBay, plus fiables que le titre."""
    read: dict[str, str] = {}
    for raw_key, raw_value in (specifics or {}).items():
        key, value = ascii_lower(raw_key), str(raw_value or "").strip()
        if not value:
            continue
        if "notation" in key or "grading" in key or "grader" in key:
            read.setdefault("grader", value)
        elif key.startswith("note") or "grade" == key or key == "grading grade":
            read.setdefault("grade", value)
        elif "professionnel note" in key or "professional grade" in key or key == "graded":
            read.setdefault("graded", value)
        elif "parallele" in key or "variete" in key or "variant" in key or "parallel" in key:
            read.setdefault("variant", value)
        elif "numero de la carte" in key or "numero de carte" in key or "card number" in key:
            read.setdefault("card_number", value)
    return read


def classify(title: str, *, condition: str = "", specifics: dict | None = None) -> dict:
    """Étiquette une annonce : variante, note, numéro et signaux d'exclusion."""
    text = ascii_lower(f"{title} {condition}")
    read = _from_specifics(specifics)

    grade = detect_grade(ascii_lower(" ".join(filter(None, [read.get("grader"), read.get("grade")])))) \
        if read.get("grader") or read.get("grade") else detect_grade(text)
    if ascii_lower(read.get("graded", "")) in {"non", "no", "false", "0"}:
        grade = {"graded": False, "grader": None, "grade": None, "grade_label": None, "spans": []}

    variant = detect_variant(_cut(text, grade["spans"]))
    if read.get("variant"):
        declared = detect_variant(ascii_lower(read["variant"]))
        if declared["color"] or declared["pattern"]:
            variant = {**declared, "serial": declared["serial"] or variant["serial"]}

    number = detect_card_number(ascii_lower(read.get("card_number", ""))) or detect_card_number(text)
    variant_text = _variant_text(variant)
    grade_text = _grade_text(grade)
    variant_key = _slug(variant_text)
    grade_key = _grade_key(grade)

    return {
        "graded": grade["graded"],
        "grader": grade["grader"],
        "grade": grade["grade"],
        "grade_label": grade["grade_label"],
        "grade_key": grade_key,
        "grade_text": grade_text,
        "color": variant["color"],
        "pattern": variant["pattern"],
        "serial": variant["serial"],
        "variant_key": variant_key,
        "variant_text": variant_text,
        "card_number": number,
        "is_lot": bool(_LOT.search(text)),
        "is_reprint": bool(_REPRINT.search(text)),
        "bucket_key": f"{variant_key}|{grade_key}",
        "bucket_text": f"{variant_text} · {grade_text}",
    }


def same_card_number(reference: str, candidate: str) -> bool:
    """Deux numéros désignent-ils la même carte ? Inconnu = on ne tranche pas."""
    if not reference or not candidate:
        return True
    if reference == candidate:
        return True
    return reference.split("/")[0] == candidate.split("/")[0]
