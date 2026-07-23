"""Client minimal pour la Trading API eBay (XML).

Les Sell APIs REST modernes (Inventory, Account, Taxonomy — voir
`ebay_selling.py`) ne permettent pas de modifier une annonce qui n'a pas été
créée via l'Inventory API. Pour ajouter l'image vendeur aux annonces créées à
la main sur eBay.com *avant* CardVaults, on doit passer par la Trading API
historique (XML, `api.ebay.com/ws/api.dll`) :

1. `upload_image_to_eps` héberge l'image vendeur dans EPS (eBay Picture
   Services) au nom du vendeur connecté — nécessaire car eBay interdit de
   mélanger, dans une même annonce, des photos EPS/hébergées eBay et des
   photos hébergées ailleurs (notre CDN R2). Une fois dans EPS, l'image peut
   être ajoutée à n'importe quelle annonce du vendeur (EPS + EPS = autorisé).
2. `get_active_item_ids` liste les annonces actives du vendeur (paginé).
3. `get_item_pictures` lit les photos actuelles d'une annonce.
4. `revise_item_pictures` réécrit la liste complète des photos (l'API ne
   permet pas d'en "ajouter" une seule : `PictureDetails` remplace tout).

Toute requête utilise le token OAuth utilisateur (transmis en IAF token) issu
de `ebay_oauth.get_valid_access_token(user_id)` — jamais de compte partagé.
"""

import logging
import re
from typing import Optional
from xml.etree import ElementTree as ET
from xml.sax.saxutils import escape as xml_escape

import httpx

from .ebay_selling import EbayApiError

logger = logging.getLogger("ebay_trading")

TRADING_API_URL = "https://api.ebay.com/ws/api.dll"
TRADING_API_SITEID = "71"  # eBay France
TRADING_API_COMPATIBILITY_LEVEL = "1193"

NS = {"e": "urn:ebay:apis:eBLBaseComponents"}

ENTRIES_PER_PAGE = 200
MAX_PAGES_SAFETY = 5  # 5 * 200 = 1000 annonces, cap de sécurité anti-boucle infinie

# Codes d'erreur Trading API observés (ou probables, cf. `is_inventory_based_error`)
# quand ReviseItem/ReviseFixedPriceItem cible une annonce créée via l'Inventory
# API ("inventory-based listing") : eBay refuse alors la modification et
# demande d'utiliser "l'outil utilisé pour créer l'annonce" (donc l'Inventory
# API, pas la Trading API). Ces codes n'ont pas pu être vérifiés contre la
# documentation eBay à jour (réseau eBay bloqué depuis ce sandbox) : le code
# 21916635 a été confirmé en production sur l'annonce 336700702189, les deux
# autres sont des variantes documentées ailleurs pour la même famille
# d'erreur. D'où l'importance du repli sur le texte du message
# (`is_inventory_based_error`) qui ne dépend pas de l'exhaustivité de cette liste.
INVENTORY_BASED_ERROR_CODES = {"21916635", "21916636", "21919474"}
_INVENTORY_BASED_TEXT_MARKERS = (
    "en fonction de l'inventaire",
    "inventory-based",
)


class EbayTradingApiError(EbayApiError):
    """EbayApiError enrichie des ErrorCode Trading API en échec (Ack=Failure
    ou PartialFailure), pour permettre un routage par code sans reparser le
    message. Le message hérité (`body`/`str(exc)`) ne contient déjà que les
    erreurs SeverityCode=Error — les warnings sont filtrés avant construction
    (voir `_call`)."""

    def __init__(self, step: str, status_code: int, body: str, error_codes: Optional[list[str]] = None):
        super().__init__(step, status_code, body)
        self.error_codes: list[str] = error_codes or []


def is_inventory_based_error(exc: Exception) -> bool:
    """Vrai si `exc` correspond à l'erreur Trading API « cette annonce a été
    créée via l'Inventory API, ReviseItem ne peut pas la modifier » : elle
    doit être mise à jour via l'Inventory API (voir
    `add_image_to_inventory_item`) plutôt que via `revise_item_pictures`."""
    codes = getattr(exc, "error_codes", None) or []
    if any(code in INVENTORY_BASED_ERROR_CODES for code in codes):
        return True
    message = str(exc).lower()
    return any(marker.lower() in message for marker in _INVENTORY_BASED_TEXT_MARKERS)


def _headers(call_name: str, access_token: str) -> dict:
    return {
        "X-EBAY-API-COMPATIBILITY-LEVEL": TRADING_API_COMPATIBILITY_LEVEL,
        "X-EBAY-API-CALL-NAME": call_name,
        "X-EBAY-API-SITEID": TRADING_API_SITEID,
        "X-EBAY-API-IAF-TOKEN": access_token,
        "Content-Type": "text/xml",
    }


def _ns_tag(tag: str) -> str:
    return f"e:{tag}"


async def _call(client: httpx.AsyncClient, call_name: str, access_token: str, body: str, step: str) -> ET.Element:
    resp = await client.post(
        TRADING_API_URL,
        headers=_headers(call_name, access_token),
        content=body.encode("utf-8"),
    )
    if resp.status_code != 200:
        raise EbayApiError(step, resp.status_code, resp.text)
    try:
        root = ET.fromstring(resp.text)
    except ET.ParseError as e:
        raise EbayApiError(step, resp.status_code, f"Réponse XML illisible : {e}")

    ack = root.findtext(_ns_tag("Ack"), default="", namespaces=NS)
    # Ack=Warning est un succès (eBay signale un point d'attention mais a bien
    # appliqué la requête) ; seuls Failure/PartialFailure sont des échecs.
    if ack not in ("Success", "Warning"):
        messages = []
        error_codes: list[str] = []
        for error_el in root.findall(_ns_tag("Errors"), NS):
            severity = (error_el.findtext(_ns_tag("SeverityCode"), default="", namespaces=NS) or "").strip()
            # Les warnings imbriqués dans une réponse Failure sont du bruit
            # (ex. "Gestionnaire des conditions de vente", "Offre directe") :
            # seules les erreurs SeverityCode=Error expliquent l'échec réel.
            if severity == "Warning":
                continue
            short = (error_el.findtext(_ns_tag("ShortMessage"), default="", namespaces=NS) or "").strip()
            long_msg = (error_el.findtext(_ns_tag("LongMessage"), default="", namespaces=NS) or "").strip()
            message = long_msg or short
            if message:
                messages.append(message)
            code = (error_el.findtext(_ns_tag("ErrorCode"), default="", namespaces=NS) or "").strip()
            if code:
                error_codes.append(code)
        detail = " ; ".join(messages) or f"Ack={ack or 'inconnu'}"
        raise EbayTradingApiError(step, resp.status_code, detail, error_codes)
    return root


async def upload_image_to_eps(access_token: str, external_url: str) -> str:
    """Héberge `external_url` dans EPS au nom du vendeur, renvoie l'URL EPS
    (i.ebayimg.com) résultante."""
    body = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<UploadSiteHostedPicturesRequest xmlns="urn:ebay:apis:eBLBaseComponents">\n'
        f"  <ExternalPictureURL>{xml_escape(external_url)}</ExternalPictureURL>\n"
        "  <PictureName>CardVaults seller image</PictureName>\n"
        "  <ExtensionInDays>30</ExtensionInDays>\n"
        "</UploadSiteHostedPicturesRequest>"
    )
    step = "Upload de l'image vendeur (EPS)"
    async with httpx.AsyncClient(timeout=30) as client:
        root = await _call(client, "UploadSiteHostedPictures", access_token, body, step)

    full_url = root.findtext(
        f"{_ns_tag('SiteHostedPictureDetails')}/{_ns_tag('FullURL')}", default="", namespaces=NS
    )
    if not full_url:
        raise EbayApiError(step, 200, "FullURL manquante dans la réponse eBay.")
    return full_url


async def get_active_item_ids(access_token: str) -> list[str]:
    """Liste les ItemID des annonces actives du vendeur, toutes pages
    confondues, dans un ordre stable (celui renvoyé par eBay)."""
    item_ids: list[str] = []
    page = 1
    total_pages = 1
    step = "Liste des annonces actives"
    async with httpx.AsyncClient(timeout=30) as client:
        while page <= total_pages and page <= MAX_PAGES_SAFETY:
            body = (
                '<?xml version="1.0" encoding="utf-8"?>\n'
                '<GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">\n'
                "  <ActiveList>\n"
                "    <Include>true</Include>\n"
                "    <Pagination>\n"
                f"      <EntriesPerPage>{ENTRIES_PER_PAGE}</EntriesPerPage>\n"
                f"      <PageNumber>{page}</PageNumber>\n"
                "    </Pagination>\n"
                "  </ActiveList>\n"
                "</GetMyeBaySellingRequest>"
            )
            root = await _call(client, "GetMyeBaySelling", access_token, body, step)

            item_path = (
                f"{_ns_tag('ActiveList')}/{_ns_tag('ItemArray')}/{_ns_tag('Item')}/{_ns_tag('ItemID')}"
            )
            for item_id_el in root.findall(item_path, NS):
                if item_id_el.text:
                    item_ids.append(item_id_el.text)

            total_pages_text = root.findtext(
                f"{_ns_tag('ActiveList')}/{_ns_tag('PaginationResult')}/{_ns_tag('TotalNumberOfPages')}",
                default="1",
                namespaces=NS,
            )
            try:
                total_pages = int(total_pages_text)
            except (TypeError, ValueError):
                total_pages = page
            page += 1

    return item_ids[: MAX_PAGES_SAFETY * ENTRIES_PER_PAGE]


async def get_item_pictures(access_token: str, item_id: str) -> dict:
    """Renvoie {"picture_urls": [...], "has_variations": bool, "title": str,
    "sku": str} pour une annonce. `sku` est vide si l'annonce n'en a pas
    (annonces créées via la Trading API sans SKU) — utile pour router vers
    l'Inventory API en repli quand ReviseItem échoue (voir
    `is_inventory_based_error` dans le routeur)."""
    body = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">\n'
        f"  <ItemID>{xml_escape(item_id)}</ItemID>\n"
        "  <OutputSelector>Item.PictureDetails,Item.Variations,Item.Title,Item.SKU</OutputSelector>\n"
        "</GetItemRequest>"
    )
    step = f"Lecture de l'annonce {item_id}"
    async with httpx.AsyncClient(timeout=20) as client:
        root = await _call(client, "GetItem", access_token, body, step)

    picture_path = f"{_ns_tag('Item')}/{_ns_tag('PictureDetails')}/{_ns_tag('PictureURL')}"
    picture_urls = [el.text for el in root.findall(picture_path, NS) if el.text]
    has_variations = root.find(f"{_ns_tag('Item')}/{_ns_tag('Variations')}", NS) is not None
    title = root.findtext(f"{_ns_tag('Item')}/{_ns_tag('Title')}", default="", namespaces=NS)
    sku = root.findtext(f"{_ns_tag('Item')}/{_ns_tag('SKU')}", default="", namespaces=NS) or ""
    return {"picture_urls": picture_urls, "has_variations": has_variations, "title": title, "sku": sku}


async def revise_item_pictures(access_token: str, item_id: str, picture_urls: list[str]) -> None:
    """Réécrit la liste complète des photos d'une annonce (ReviseItem ne
    permet pas d'en ajouter une seule : `PictureDetails` remplace tout)."""
    pictures_xml = "".join(f"<PictureURL>{xml_escape(u)}</PictureURL>" for u in picture_urls)
    body = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<ReviseItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">\n'
        "  <Item>\n"
        f"    <ItemID>{xml_escape(item_id)}</ItemID>\n"
        f"    <PictureDetails>{pictures_xml}</PictureDetails>\n"
        "  </Item>\n"
        "</ReviseItemRequest>"
    )
    step = f"Mise à jour des photos de l'annonce {item_id}"
    async with httpx.AsyncClient(timeout=20) as client:
        await _call(client, "ReviseItem", access_token, body, step)


_EPS_ID_RE = re.compile(r"/images/g/([^/]+)/")


def eps_image_id(url: Optional[str]) -> Optional[str]:
    """Extrait l'identifiant d'image d'une URL EPS classique
    (https://i.ebayimg.com/images/g/<ID>/s-l1600.jpg), ou None si l'URL ne
    correspond pas à ce format."""
    if not url:
        return None
    match = _EPS_ID_RE.search(url)
    return match.group(1) if match else None


def image_already_present(eps_url: str, picture_urls: list[str]) -> bool:
    """L'image vendeur (URL EPS) est-elle déjà l'une des photos de
    l'annonce ? Compare par identifiant d'image EPS (robuste aux variantes de
    taille d'URL, ex. s-l500 vs s-l1600), avec repli sur l'égalité stricte
    d'URL si l'identifiant n'est pas extractible."""
    target_id = eps_image_id(eps_url)
    for url in picture_urls:
        if url == eps_url:
            return True
        if target_id and eps_image_id(url) == target_id:
            return True
    return False
