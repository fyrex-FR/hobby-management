from fastapi import APIRouter, Depends
from pydantic import BaseModel
from .auth import current_user
from services.ebay_service import search_ebay_listings

router = APIRouter()


class EbaySearchRequest(BaseModel):
    query: str


@router.post("/ebay/sold-items")
async def get_sold_items(body: EbaySearchRequest, user: dict = Depends(current_user)):
    return await search_ebay_listings(body.query)
