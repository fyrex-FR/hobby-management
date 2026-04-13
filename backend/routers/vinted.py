from fastapi import APIRouter, Depends
from pydantic import BaseModel
from .auth import current_user
from services.vinted_scraper import search_vinted_prices

router = APIRouter()


class PriceEstimateRequest(BaseModel):
    query: str


@router.post("/vinted/price-estimate")
async def estimate_price(body: PriceEstimateRequest, user: dict = Depends(current_user)):
    return await search_vinted_prices(body.query)
