import os
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
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
allow_creds = "*" not in settings.CORS_ORIGINS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=allow_creds,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "Content-Length", "X-Spreadsheet-Safe"],
)

# Register custom error handlers
register_error_handlers(app)

# Root-level health endpoint (GET /health)
app.include_router(health_router)

# Versioned API routes (under /api/v1)
app.include_router(api_router, prefix="/api/v1")

# Mount production frontend static assets if dist directory exists
candidate_dist_dirs = [
    Path(__file__).resolve().parent.parent.parent / "frontend" / "dist",
    Path(os.getcwd()) / "frontend" / "dist",
    Path("/app/frontend/dist"),
]
frontend_dist: Path | None = None
for candidate in candidate_dist_dirs:
    if candidate.is_dir() and (candidate / "index.html").is_file():
        frontend_dist = candidate.resolve()
        break

if frontend_dist is not None:
    assets_dir = frontend_dist / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.api_route("/{full_path:path}", methods=["GET", "HEAD"], include_in_schema=False)
    async def serve_spa(full_path: str):
        # Never intercept API, health, or OpenAPI documentation endpoints
        normalized = full_path.strip("/")
        if (
            normalized == "api"
            or normalized.startswith("api/")
            or normalized in ("health", "docs", "redoc", "openapi.json")
        ):
            return Response(status_code=404)
        
        target = (frontend_dist / full_path).resolve()
        try:
            target.relative_to(frontend_dist)
            if full_path and target.is_file():
                return FileResponse(str(target))
        except ValueError:
            pass
        return FileResponse(str(frontend_dist / "index.html"))

