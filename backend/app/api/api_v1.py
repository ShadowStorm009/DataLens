from fastapi import APIRouter
from backend.app.api.routes import health
from backend.app.api.routes import datasets
from backend.app.api.routes import audits
from backend.app.api.routes import transformations

api_router = APIRouter()

# Health endpoints
api_router.include_router(health.router)

# Dataset management, upload, and preview endpoints
api_router.include_router(datasets.router)

# Quality audit endpoints
api_router.include_router(audits.router)

# Cleaning transformations and preview endpoints
api_router.include_router(transformations.router)
