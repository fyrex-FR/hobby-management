import asyncio
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator

from .auth import current_user
from services import ebay_selling, ebay_settings_store
from services.ebay_oauth import get_valid_access_token
from services.ebay_selling import EbayApiError

router = APIRouter()
logger = logging.getLogger("ebay_selling")


class PublishRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    allow_offers: Optional[bool] = False
    minimum_offer_price: Optional[float] = None
    payment_policy_id: Optional[str] = None
    return_policy_id: Optional[str] = None
    fulfillment_policy_id: Optional[str] = None
    include_extra_image: bool = True


class PriceUpdateRequest(BaseModel):
    price: float


class PublishBatchRequest(BaseModel):
    """Un lot de cartes à publier d'un coup. Le frontend découpe la liste des
    cartes prêtes en lots (par ex. 5) et rappelle cet endpoint pour chaque lot
    afin d'afficher la progression et rester sous les limites de temps/débit."""
    card_ids: List[str]
    include_extra_image: bool = True

    @field_validator("card_ids")
    @classmethod
    def _limit_batch(cls, value: List[str]) -> List[str]:
        if not value:
            raise ValueError("Aucune carte à publier.")
        if len(value) > 10:
            raise ValueError("10 cartes maximum par lot.")
        return value


PUBLISH_BATCH_CONCURRENCY = 2


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
        preview = await ebay_selling.build_preview(card, access_token)
        settings = await ebay_settings_store.get_settings(user["sub"])
        preview["extra_image_url"] = (settings or {}).get("extra_image_url")
        preview["shipping_rules"] = (settings or {}).get("shipping_rules") or []
        return preview
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
        allow_offers = bool(body.allow_offers)
        minimum_offer_price = body.minimum_offer_price
        if allow_offers:
            if minimum_offer_price is None or minimum_offer_price <= 0:
                raise HTTPException(status_code=422, detail="Indique un montant minimum positif pour autoriser les offres.")
            if minimum_offer_price >= price:
                raise HTTPException(status_code=422, detail="Le montant minimum des offres doit être inférieur au prix de vente.")
        if not card.get("image_front_url"):
            raise HTTPException(status_code=422, detail="Ajoute au moins la photo recto avant de publier.")

        title = body.title.strip() if body.title and body.title.strip() else ebay_selling.build_listing_title(card)
        if len(title) > 80:
            raise HTTPException(status_code=422, detail="Le titre doit faire 80 caractères maximum.")
        description = body.description.strip() if body.description and body.description.strip() else None
        if description and len(description) > 5000:
            raise HTTPException(status_code=422, detail="La description doit faire 5000 caractères maximum.")

        policies = await ebay_selling.get_business_policies(access_token)
        if not policies.get("configured"):
            missing = [k for k in ("payment", "return", "fulfillment") if not policies.get(k)]
            raise HTTPException(
                status_code=422,
                detail=f"Configure d'abord tes options de vente sur eBay (manquant : {', '.join(missing)}).",
            )
        selected_policies = {
            "payment": body.payment_policy_id or policies["payment"],
            "return": body.return_policy_id or policies["return"],
            "fulfillment": body.fulfillment_policy_id or policies["fulfillment"],
        }
        policy_options = policies.get("options") or {}
        for key, selected_id in selected_policies.items():
            allowed_ids = {policy["id"] for policy in policy_options.get(key, []) if policy.get("id")}
            if allowed_ids and selected_id not in allowed_ids:
                raise HTTPException(status_code=422, detail="Option de vente eBay invalide pour ce compte vendeur.")

        category = await ebay_selling.suggest_category(access_token, title)
        if not category or not category.get("id"):
            raise HTTPException(status_code=422, detail="Impossible de déterminer une catégorie eBay pour cette carte.")

        extra_image_url = None
        if body.include_extra_image:
            settings = await ebay_settings_store.get_settings(user["sub"])
            extra_image_url = (settings or {}).get("extra_image_url")

        try:
            return await ebay_selling.publish_card(
                card,
                access_token,
                title,
                price,
                category["id"],
                selected_policies,
                description,
                allow_offers=allow_offers,
                minimum_offer_price=minimum_offer_price,
                extra_image_url=extra_image_url,
            )
        except EbayApiError as e:
            logger.warning("Publication eBay refusée pour la carte %s: %s", card_id, e)
            raise HTTPException(status_code=502, detail=f"{e.step} : {e.body}")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Publication eBay: erreur inattendue pour la carte %s", card_id)
        raise HTTPException(status_code=500, detail=f"Erreur inattendue lors de la publication : {e}")


@router.post("/ebay/selling/publish-batch")
async def publish_listings_batch(body: PublishBatchRequest, user: dict = Depends(current_user)):
    """Publie en masse un lot de cartes avec des valeurs entièrement
    automatiques : titre/description/catégorie générés, prix déjà saisi sur la
    carte, politique d'expédition choisie selon les règles prix -> livraison
    (repli sur la policy par défaut), paiement/retours par défaut du compte.
    Chaque carte est traitée indépendamment : une erreur sur une carte
    n'interrompt pas le lot. `publish_card` étant idempotent, une carte déjà en
    ligne est ignorée."""
    try:
        access_token = await get_valid_access_token(user["sub"])
        if not access_token:
            return {"connected": False}

        policies = await ebay_selling.get_business_policies(access_token)
        if not policies.get("configured"):
            missing = [k for k in ("payment", "return", "fulfillment") if not policies.get(k)]
            raise HTTPException(
                status_code=422,
                detail=f"Configure d'abord tes options de vente sur eBay (manquant : {', '.join(missing)}).",
            )
        policy_options = policies.get("options") or {}
        fulfillment_ids = {p["id"] for p in policy_options.get("fulfillment", []) if p.get("id")}

        settings = await ebay_settings_store.get_settings(user["sub"])
        shipping_rules = (settings or {}).get("shipping_rules") or []
        extra_image_url = (settings or {}).get("extra_image_url") if body.include_extra_image else None

        semaphore = asyncio.Semaphore(PUBLISH_BATCH_CONCURRENCY)
        results: List[dict] = []

        async def process(card_id: str) -> None:
            async with semaphore:
                entry: dict = {"card_id": card_id, "status": "error", "title": None, "price": None}
                try:
                    card = await ebay_selling.get_card(card_id, user["sub"])
                    if not card:
                        entry["message"] = "Carte introuvable."
                        results.append(entry)
                        return

                    price = card.get("price")
                    entry["price"] = price
                    if card.get("ebay_url"):
                        entry.update(status="skipped", message="Déjà en ligne sur eBay.")
                        results.append(entry)
                        return
                    if not card.get("image_front_url"):
                        entry["message"] = "Photo recto manquante."
                        results.append(entry)
                        return
                    if not price or price <= 0:
                        entry["message"] = "Prix de vente manquant."
                        results.append(entry)
                        return

                    title = ebay_selling.build_listing_title(card)
                    entry["title"] = title
                    if len(title) > 80:
                        title = title[:80]

                    category = await ebay_selling.suggest_category(access_token, title)
                    if not category or not category.get("id"):
                        entry["message"] = "Catégorie eBay introuvable."
                        results.append(entry)
                        return

                    fulfillment = ebay_selling.match_shipping_rule(shipping_rules, price) or policies["fulfillment"]
                    if fulfillment_ids and fulfillment not in fulfillment_ids:
                        fulfillment = policies["fulfillment"]
                    selected_policies = {
                        "payment": policies["payment"],
                        "return": policies["return"],
                        "fulfillment": fulfillment,
                    }

                    result = await ebay_selling.publish_card(
                        card,
                        access_token,
                        title,
                        price,
                        category["id"],
                        selected_policies,
                        None,
                        extra_image_url=extra_image_url,
                    )
                    entry.update(status="published", ebay_url=result.get("ebay_url"))
                    results.append(entry)
                except EbayApiError as e:
                    entry["message"] = f"{e.step} : {e.body}"
                    results.append(entry)
                except Exception as e:  # noqa: BLE001 - on isole l'échec d'une carte
                    logger.exception("Publication de masse: échec inattendu sur la carte %s", card_id)
                    entry["message"] = f"Erreur inattendue : {e}"
                    results.append(entry)

        await asyncio.gather(*(process(card_id) for card_id in body.card_ids))

        # Réordonne selon l'ordre d'entrée (asyncio.gather préserve l'ordre des
        # tâches mais les append concurrents non ; on réaligne pour le front).
        by_id = {r["card_id"]: r for r in results}
        ordered = [by_id[cid] for cid in body.card_ids if cid in by_id]
        return {
            "results": ordered,
            "published": sum(1 for r in ordered if r["status"] == "published"),
            "skipped": sum(1 for r in ordered if r["status"] == "skipped"),
            "errors": sum(1 for r in ordered if r["status"] == "error"),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Publication de masse eBay: erreur inattendue")
        raise HTTPException(status_code=500, detail=f"Erreur inattendue lors de la publication de masse : {e}")


@router.post("/ebay/selling/sync-sold")
async def sync_sold(user: dict = Depends(current_user)):
    """Synchronise le statut « vendu » : interroge les commandes eBay récentes
    et marque en vendu les cartes correspondantes (prix réel + date). Déclenché
    manuellement depuis l'onglet Annonces."""
    try:
        access_token = await get_valid_access_token(user["sub"])
        if not access_token:
            return {"connected": False}
        try:
            return await ebay_selling.sync_sold_cards(access_token, user["sub"])
        except EbayApiError as e:
            logger.warning("Sync vendu eBay refusé pour %s: %s", user["sub"], e)
            raise HTTPException(status_code=502, detail=f"{e.step} : {e.body}")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Sync vendu eBay: erreur inattendue")
        raise HTTPException(status_code=500, detail=f"Erreur inattendue lors de la synchronisation : {e}")


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
            logger.warning("Retrait eBay refusé pour la carte %s: %s", card_id, e)
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
            logger.warning("Mise à jour prix eBay refusée pour la carte %s: %s", card_id, e)
            raise HTTPException(status_code=502, detail=f"{e.step} : {e.body}")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Mise à jour prix eBay: erreur inattendue pour la carte %s", card_id)
        raise HTTPException(status_code=500, detail=f"Erreur inattendue lors de la mise à jour du prix : {e}")
