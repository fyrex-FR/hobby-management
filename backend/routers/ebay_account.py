from fastapi import APIRouter, Depends
from fastapi.responses import RedirectResponse

from .auth import current_user
from services import ebay_oauth
from services.ebay_oauth import OAuthError
from services.ebay_token_crypto import EncryptionNotConfigured

router = APIRouter()


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


@router.delete("/ebay/account")
async def account_disconnect(user: dict = Depends(current_user)):
    await ebay_oauth.disconnect(user["sub"])
    return {"connected": False}
