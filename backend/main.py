import os
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import auth, cards, identify, upload, compare, vinted, ebay

app = FastAPI(title="NBA Card Studio API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://hobby-management.pages.dev",
        "https://*.hobby-management.pages.dev",
        "https://hobby-management.onrender.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(cards.router, prefix="/api")
app.include_router(identify.router, prefix="/api")
app.include_router(upload.router, prefix="/api")
app.include_router(compare.router, prefix="/api")
app.include_router(vinted.router, prefix="/api")
app.include_router(ebay.router, prefix="/api")


@app.get("/api/health")
async def health():
    return {"ok": True}
