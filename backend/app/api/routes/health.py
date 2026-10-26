from datetime import datetime, timezone
from fastapi import APIRouter
from backend.app.schemas.common import HealthResponse
from backend.app.core.config import settings

router = APIRouter(tags=["Health"])

@router.get("/health", response_model=HealthResponse)
def get_health():
    """Application health check endpoint confirming API readiness."""
    return HealthResponse(
        status="ok",
        app_name=settings.APP_NAME,
        version=settings.APP_VERSION,
        environment=settings.ENV,
        database="configured",
        timestamp=datetime.now(timezone.utc).isoformat(),
    )
