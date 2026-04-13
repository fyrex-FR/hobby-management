import os
import jwt as pyjwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer

bearer = HTTPBearer()

# Supabase JWKS public key (EC P-256)
SUPABASE_PUBLIC_KEY = {
    "alg": "ES256",
    "crv": "P-256",
    "kid": "ed3a0d01-318d-4e00-a40c-0e0233cd3d3f",
    "kty": "EC",
    "use": "sig",
    "x": "YCp9zlNRQ9_KENWBJlksJL1Lrjw3DaRZp4GSmm6OeMM",
    "y": "obAm1VW4xqeVZbv2ulpIaHZyFdhjuOzY5uJ5xr3i7Qc",
}

_public_key = pyjwt.algorithms.ECAlgorithm.from_jwk(SUPABASE_PUBLIC_KEY)


async def current_user(token=Depends(bearer)) -> dict:
    try:
        payload = pyjwt.decode(
            token.credentials,
            _public_key,
            algorithms=["ES256"],
            audience="authenticated",
        )
        return payload
    except pyjwt.PyJWTError as e:
        raise HTTPException(status_code=401, detail=f"invalid_token: {e}")
