from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from .auth import current_user
from services import ebay_oauth
from services.ebay_oauth import OAuthError
from services.ebay_oauth import get_valid_access_token
from services.ebay_selling import EbayApiError, create_inventory_location, get_business_policies, list_inventory_locations
from services.ebay_token_crypto import EncryptionNotConfigured

router = APIRouter()


class LocationRequest(BaseModel):
    postal_code: str
    city: str
    country: Optional[str] = "FR"
    name: Optional[str] = "CardVaults"


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
