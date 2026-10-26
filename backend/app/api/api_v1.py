from fastapi import APIRouter
from backend.app.api.routes import health
from backend.app.api.routes import datasets

api_router = APIRouter()

# Health endpoints
api_router.include_router(health.router)

# Dataset management, upload, and preview endpoints
api_router.include_router(datasets.router)
