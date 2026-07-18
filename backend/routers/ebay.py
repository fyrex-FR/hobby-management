from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from .auth import current_user
from services.ebay_service import (
    search_ebay_listings,
    search_ebay_by_image,
    search_ebay_sold,
)
from services.sales_cache import get_cached, set_cached, is_fresh

router = APIRouter()


class EbaySearchRequest(BaseModel):
    query: str
    card_id: Optional[str] = None
    refresh: bool = False


class EbayImageRequest(BaseModel):
    image_base64: str


@router.post("/ebay/sold-items")
async def get_sold_items(body: EbaySearchRequest, user: dict = Depends(current_user)):
    """Ventes réelles (« Vendues »), avec cache par carte (24 h)."""
    # Sert le cache si frais (sauf refresh explicite).
    if body.card_id and not body.refresh:
        cached = await get_cached(body.card_id)
        if cached and is_fresh(cached.get("fetched_at", "")):
            payload = dict(cached.get("payload") or {})
            payload["cached"] = True
            payload["fetched_at"] = cached.get("fetched_at")
            return payload

    result = await search_ebay_sold(body.query)
    # On ne met en cache que les résultats exploitables (pas les erreurs).
    if body.card_id and result.get("results"):
        await set_cached(body.card_id, result)
    return result


@router.post("/ebay/active-items")
async def get_active_items(body: EbaySearchRequest, user: dict = Depends(current_user)):
    """Annonces actives (« En vente ») via la Browse API."""
    return await search_ebay_listings(body.query)


@router.post("/ebay/visual-match")
async def get_visual_match(body: EbayImageRequest, user: dict = Depends(current_user)):
    """Correspondances visuelles eBay à partir d'une photo de carte."""
    return await search_ebay_by_image(body.image_base64)
