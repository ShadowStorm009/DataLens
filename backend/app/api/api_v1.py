from fastapi import APIRouter
from backend.app.api.routes import health

api_router = APIRouter()

# Include health also under /api/v1 for convenience
api_router.include_router(health.router)
