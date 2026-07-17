from fastapi import APIRouter, Depends
from pydantic import BaseModel
from .auth import current_user
from services.ebay_service import (
    search_ebay_listings,
    search_ebay_by_image,
    search_ebay_sold,
)

router = APIRouter()


class EbaySearchRequest(BaseModel):
    query: str


class EbayImageRequest(BaseModel):
    image_base64: str


@router.post("/ebay/sold-items")
async def get_sold_items(body: EbaySearchRequest, user: dict = Depends(current_user)):
    """Ventes réelles (« Vendues ») via Marketplace Insights."""
    return await search_ebay_sold(body.query)


@router.post("/ebay/active-items")
async def get_active_items(body: EbaySearchRequest, user: dict = Depends(current_user)):
    """Annonces actives (« En vente ») via la Browse API."""
    return await search_ebay_listings(body.query)


@router.post("/ebay/visual-match")
async def get_visual_match(body: EbayImageRequest, user: dict = Depends(current_user)):
    """Correspondances visuelles eBay à partir d'une photo de carte."""
    return await search_ebay_by_image(body.image_base64)
