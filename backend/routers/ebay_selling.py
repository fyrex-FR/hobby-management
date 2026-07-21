from fastapi import APIRouter, Depends, HTTPException

from .auth import current_user
from services import ebay_selling
from services.ebay_oauth import get_valid_access_token

router = APIRouter()


@router.get("/ebay/selling/preview/{card_id}")
async def preview_listing(card_id: str, user: dict = Depends(current_user)):
    """Aperçu d'une annonce (titre, catégorie, policies, prix) sans rien
    publier sur eBay. Ne modifie rien côté eBay ni côté carte."""
    card = await ebay_selling.get_card(card_id, user["sub"])
    if not card:
        raise HTTPException(status_code=404, detail="Carte introuvable")

    access_token = await get_valid_access_token(user["sub"])
    if not access_token:
        return {"connected": False}

    return await ebay_selling.build_preview(card, access_token)
