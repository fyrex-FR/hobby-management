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
    if ack not in ("Success", "Warning"):
        messages = []
        for error_el in root.findall(_ns_tag("Errors"), NS):
            short = (error_el.findtext(_ns_tag("ShortMessage"), default="", namespaces=NS) or "").strip()
            long_msg = (error_el.findtext(_ns_tag("LongMessage"), default="", namespaces=NS) or "").strip()
            message = long_msg or short
            if message:
                messages.append(message)
        detail = " ; ".join(messages) or f"Ack={ack or 'inconnu'}"
        raise EbayApiError(step, resp.status_code, detail)
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
    """Renvoie {"picture_urls": [...], "has_variations": bool, "title": str}
    pour une annonce."""
    body = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">\n'
        f"  <ItemID>{xml_escape(item_id)}</ItemID>\n"
        "  <OutputSelector>Item.PictureDetails,Item.Variations,Item.Title</OutputSelector>\n"
        "</GetItemRequest>"
    )
    step = f"Lecture de l'annonce {item_id}"
    async with httpx.AsyncClient(timeout=20) as client:
        root = await _call(client, "GetItem", access_token, body, step)

    picture_path = f"{_ns_tag('Item')}/{_ns_tag('PictureDetails')}/{_ns_tag('PictureURL')}"
    picture_urls = [el.text for el in root.findall(picture_path, NS) if el.text]
    has_variations = root.find(f"{_ns_tag('Item')}/{_ns_tag('Variations')}", NS) is not None
    title = root.findtext(f"{_ns_tag('Item')}/{_ns_tag('Title')}", default="", namespaces=NS)
    return {"picture_urls": picture_urls, "has_variations": has_variations, "title": title}


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
