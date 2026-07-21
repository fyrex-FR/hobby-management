import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .auth import current_user
from services import ebay_selling
from services.ebay_oauth import get_valid_access_token
from services.ebay_selling import EbayApiError

router = APIRouter()
logger = logging.getLogger("ebay_selling")


class PublishRequest(BaseModel):
    title: Optional[str] = None
    price: Optional[float] = None


class PriceUpdateRequest(BaseModel):
    price: float


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

    try:
        return await ebay_selling.build_preview(card, access_token)
    except Exception as e:
        logger.exception("Preview eBay: erreur inattendue pour la carte %s", card_id)
        raise HTTPException(status_code=500, detail=f"Erreur inattendue lors de l'aperçu : {e}")


@router.post("/ebay/selling/publish/{card_id}")
async def publish_listing(card_id: str, body: PublishRequest, user: dict = Depends(current_user)):
    try:
        card = await ebay_selling.get_card(card_id, user["sub"])
        if not card:
            raise HTTPException(status_code=404, detail="Carte introuvable")

        access_token = await get_valid_access_token(user["sub"])
        if not access_token:
            return {"connected": False}

        price = body.price if body.price is not None else card.get("price")
        if not price or price <= 0:
            raise HTTPException(status_code=422, detail="Indique un prix de vente avant de publier.")
        if not card.get("image_front_url"):
            raise HTTPException(status_code=422, detail="Ajoute au moins la photo recto avant de publier.")

        title = body.title.strip() if body.title and body.title.strip() else ebay_selling.build_listing_title(card)
        if len(title) > 80:
            raise HTTPException(status_code=422, detail="Le titre doit faire 80 caractères maximum.")

        policies = await ebay_selling.get_business_policies(access_token)
        if not policies.get("configured"):
            missing = [k for k in ("payment", "return", "fulfillment") if not policies.get(k)]
            raise HTTPException(
                status_code=422,
                detail=f"Configure d'abord tes options de vente sur eBay (manquant : {', '.join(missing)}).",
            )

        category = await ebay_selling.suggest_category(access_token, title)
        if not category or not category.get("id"):
            raise HTTPException(status_code=422, detail="Impossible de déterminer une catégorie eBay pour cette carte.")

        try:
            return await ebay_selling.publish_card(card, access_token, title, price, category["id"], policies)
        except EbayApiError as e:
            raise HTTPException(status_code=502, detail=f"{e.step} : {e.body}")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Publication eBay: erreur inattendue pour la carte %s", card_id)
        raise HTTPException(status_code=500, detail=f"Erreur inattendue lors de la publication : {e}")


@router.post("/ebay/selling/withdraw/{card_id}")
async def withdraw_listing(card_id: str, user: dict = Depends(current_user)):
    try:
        card = await ebay_selling.get_card(card_id, user["sub"])
        if not card:
            raise HTTPException(status_code=404, detail="Carte introuvable")

        access_token = await get_valid_access_token(user["sub"])
        if not access_token:
            return {"connected": False}

        try:
            return await ebay_selling.withdraw_card(card, access_token)
        except EbayApiError as e:
            raise HTTPException(status_code=502, detail=f"{e.step} : {e.body}")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Retrait eBay: erreur inattendue pour la carte %s", card_id)
        raise HTTPException(status_code=500, detail=f"Erreur inattendue lors du retrait : {e}")


@router.patch("/ebay/selling/price/{card_id}")
async def update_listing_price(card_id: str, body: PriceUpdateRequest, user: dict = Depends(current_user)):
    try:
        if body.price <= 0:
            raise HTTPException(status_code=422, detail="Le prix doit être positif.")

        card = await ebay_selling.get_card(card_id, user["sub"])
        if not card:
            raise HTTPException(status_code=404, detail="Carte introuvable")

        access_token = await get_valid_access_token(user["sub"])
        if not access_token:
            return {"connected": False}

        try:
            return await ebay_selling.update_offer_price(card, access_token, body.price)
        except EbayApiError as e:
            raise HTTPException(status_code=502, detail=f"{e.step} : {e.body}")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Mise à jour prix eBay: erreur inattendue pour la carte %s", card_id)
        raise HTTPException(status_code=500, detail=f"Erreur inattendue lors de la mise à jour du prix : {e}")
