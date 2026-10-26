from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.app.core.config import settings
from backend.app.core.errors import register_error_handlers
from backend.app.db.session import init_db
from backend.app.api.api_v1 import api_router
from backend.app.api.routes.health import router as health_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize database tables on application startup
    init_db()
    yield

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Deterministic dataset profiling, quality auditing, non-mutating preview, and cleaning engine.",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register custom error handlers
register_error_handlers(app)

# Root-level health endpoint (GET /health)
app.include_router(health_router)

# Versioned API routes (under /api/v1)
app.include_router(api_router, prefix="/api/v1")
