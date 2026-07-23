import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, field_validator

from .auth import current_user
from services import ebay_oauth, ebay_settings_store, ebay_trading
from services.ebay_oauth import OAuthError
from services.ebay_oauth import get_valid_access_token
from services.ebay_selling import EbayApiError, create_inventory_location, get_business_policies, list_inventory_locations
from services.ebay_token_crypto import EncryptionNotConfigured

router = APIRouter()
logger = logging.getLogger("ebay_account")


class LocationRequest(BaseModel):
    postal_code: str
    city: str
    country: Optional[str] = "FR"
    name: Optional[str] = "CardVaults"


class SellerSettingsRequest(BaseModel):
    extra_image_url: Optional[str] = None

    @field_validator("extra_image_url")
    @classmethod
    def _validate_url(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip()
        if not value:
            return None
        if not value.startswith("https://"):
            raise ValueError("L'image doit être une URL https valide.")
        return value


@router.post("/ebay/account/login")
async def start_login(user: dict = Depends(current_user)):
    """Retourne l'URL de consentement eBay vers laquelle le frontend redirige
    le navigateur (window.location.href = url)."""
    try:
        url = ebay_oauth.build_authorize_url(user["sub"])
    except OAuthError as e:
        return {"error": str(e)}
    return {"url": url}


@router.get("/ebay/account/callback")
async def oauth_callback(code: str | None = None, state: str | None = None, error: str | None = None):
    """Reçoit la redirection eBay (navigation navigateur, pas d'auth header) :
    vérifie le `state` signé pour retrouver l'utilisateur, échange le code,
    stocke les tokens, puis renvoie l'utilisateur vers l'app."""
    if error or not code or not state:
        reason = error or "missing_code"
        return RedirectResponse(f"{ebay_oauth.FRONTEND_URL}/?ebay=error&reason={reason}")

    try:
        user_id = ebay_oauth.verify_state(state)
        token_data = await ebay_oauth.exchange_code(code)
        await ebay_oauth.save_new_connection(user_id, token_data)
    except OAuthError as e:
        return RedirectResponse(f"{ebay_oauth.FRONTEND_URL}/?ebay=error&reason={urlsafe(str(e))}")
    except EncryptionNotConfigured as e:
        return RedirectResponse(f"{ebay_oauth.FRONTEND_URL}/?ebay=error&reason={urlsafe(str(e))}")
    except Exception as e:
        return RedirectResponse(f"{ebay_oauth.FRONTEND_URL}/?ebay=error&reason={urlsafe(str(e))}")

    return RedirectResponse(f"{ebay_oauth.FRONTEND_URL}/?ebay=connected")


def urlsafe(text: str) -> str:
    import urllib.parse
    return urllib.parse.quote(text[:200])


@router.get("/ebay/account/status")
async def account_status(user: dict = Depends(current_user)):
    return await ebay_oauth.get_status(user["sub"])


@router.get("/ebay/account/location")
async def account_location(user: dict = Depends(current_user)):
    access_token = await get_valid_access_token(user["sub"])
    if not access_token:
        return {"connected": False, "locations": []}
    return {"connected": True, "locations": await list_inventory_locations(access_token)}


@router.get("/ebay/account/setup")
async def account_setup(user: dict = Depends(current_user)):
    access_token = await get_valid_access_token(user["sub"])
    if not access_token:
        return {
            "connected": False,
            "locations": [],
            "policies": {
                "payment": None,
                "return": None,
                "fulfillment": None,
                "options": {"payment": [], "return": [], "fulfillment": []},
                "configured": False,
            },
        }

    locations, policies = await list_inventory_locations(access_token), await get_business_policies(access_token)
    return {"connected": True, "locations": locations, "policies": policies}


@router.post("/ebay/account/location")
async def account_location_create(body: LocationRequest, user: dict = Depends(current_user)):
    access_token = await get_valid_access_token(user["sub"])
    if not access_token:
        return {"connected": False, "locations": []}
    try:
        location = await create_inventory_location(
            access_token,
            postal_code=body.postal_code,
            city=body.city,
            country=body.country or "FR",
            name=body.name or "CardVaults",
        )
    except EbayApiError as e:
        raise HTTPException(status_code=502, detail=f"{e.step} : {e.body}")
    return {"connected": True, "location": location, "locations": await list_inventory_locations(access_token)}


@router.delete("/ebay/account")
async def account_disconnect(user: dict = Depends(current_user)):
    await ebay_oauth.disconnect(user["sub"])
    return {"connected": False}


@router.get("/ebay/account/settings")
async def account_settings(user: dict = Depends(current_user)):
    """Réglages vendeur CardVaults (indépendants du compte eBay connecté) :
    pour l'instant l'image « vendeur » ajoutée automatiquement en 3e photo de
    chaque annonce publiée."""
    settings = await ebay_settings_store.get_settings(user["sub"])
    return {"extra_image_url": (settings or {}).get("extra_image_url")}


@router.put("/ebay/account/settings")
async def account_settings_update(body: SellerSettingsRequest, user: dict = Depends(current_user)):
    await ebay_settings_store.upsert_settings(user["sub"], {"extra_image_url": body.extra_image_url})
    return {"extra_image_url": body.extra_image_url}


class ApplyImageRequest(BaseModel):
    offset: int = 0
    batch: int = 20

    @field_validator("offset")
    @classmethod
    def _clamp_offset(cls, value: int) -> int:
        return max(0, value)

    @field_validator("batch")
    @classmethod
    def _clamp_batch(cls, value: int) -> int:
        return max(1, min(25, value))


MAX_LISTING_PICTURES = 24
APPLY_IMAGE_CONCURRENCY = 4


@router.post("/ebay/account/apply-image-to-listings")
async def apply_image_to_listings(body: ApplyImageRequest, user: dict = Depends(current_user)):
    """Ajoute l'image vendeur configurée en 3e photo (ou dernière) de chaque
    annonce eBay active du vendeur, y compris celles créées à la main sur
    eBay avant CardVaults. Traité par lots (`offset`/`batch`) car un vendeur
    peut avoir des centaines d'annonces actives — le frontend rappelle cet
    endpoint en boucle jusqu'à `done: true`."""
    try:
        settings = await ebay_settings_store.get_settings(user["sub"])
        extra_image_url = (settings or {}).get("extra_image_url")
        if not extra_image_url:
            raise HTTPException(status_code=422, detail="Configure d'abord une image d'annonce.")

        access_token = await get_valid_access_token(user["sub"])
        if not access_token:
            return {"connected": False}

        eps_image_url = (settings or {}).get("eps_image_url")
        eps_source_url = (settings or {}).get("eps_source_url")
        if not eps_image_url or eps_source_url != extra_image_url:
            try:
                eps_image_url = await ebay_trading.upload_image_to_eps(access_token, extra_image_url)
            except EbayApiError as e:
                raise HTTPException(status_code=502, detail=f"{e.step} : {e.body}")
            await ebay_settings_store.upsert_settings(
                user["sub"],
                {"eps_image_url": eps_image_url, "eps_source_url": extra_image_url},
            )

        try:
            item_ids = await ebay_trading.get_active_item_ids(access_token)
        except EbayApiError as e:
            raise HTTPException(status_code=502, detail=f"{e.step} : {e.body}")

        total = len(item_ids)
        batch_ids = item_ids[body.offset:body.offset + body.batch]

        updated = 0
        skipped = 0
        errors: list[dict] = []
        semaphore = asyncio.Semaphore(APPLY_IMAGE_CONCURRENCY)

        async def process(item_id: str) -> None:
            nonlocal updated, skipped
            async with semaphore:
                try:
                    info = await ebay_trading.get_item_pictures(access_token, item_id)
                except EbayApiError as e:
                    errors.append({"item_id": item_id, "title": None, "message": f"{e.step} : {e.body}"})
                    return

                title = info.get("title") or item_id
                if info.get("has_variations"):
                    errors.append({
                        "item_id": item_id,
                        "title": title,
                        "message": "Annonce à variations non prise en charge.",
                    })
                    return

                picture_urls = info.get("picture_urls") or []
                if ebay_trading.image_already_present(eps_image_url, picture_urls):
                    skipped += 1
                    return

                if len(picture_urls) >= MAX_LISTING_PICTURES:
                    errors.append({
                        "item_id": item_id,
                        "title": title,
                        "message": "24 photos max atteintes sur cette annonce.",
                    })
                    return

                try:
                    await ebay_trading.revise_item_pictures(access_token, item_id, picture_urls + [eps_image_url])
                    updated += 1
                except EbayApiError as e:
                    errors.append({"item_id": item_id, "title": title, "message": f"{e.step} : {e.body}"})

        await asyncio.gather(*(process(item_id) for item_id in batch_ids))

        next_offset = body.offset + body.batch
        return {
            "done": next_offset >= total,
            "next_offset": next_offset,
            "total": total,
            "updated": updated,
            "skipped": skipped,
            "errors": errors,
            "eps_image_url": eps_image_url,
        }
    except HTTPException:
        raise
    except EbayApiError as e:
        raise HTTPException(status_code=502, detail=f"{e.step} : {e.body}")
    except Exception as e:
        logger.exception("Application de l'image vendeur aux annonces existantes : erreur inattendue")
        raise HTTPException(status_code=500, detail=f"Erreur inattendue : {e}")
