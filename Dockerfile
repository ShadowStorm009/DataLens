# DataLens Production Dockerfile
# Multi-stage build: Stage 1 builds the Vite frontend; Stage 2 runs FastAPI

# --- Stage 1: Build Frontend Assets ---
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# --- Stage 2: Production Python Backend & Runtime ---
FROM python:3.11-slim AS production
WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    DATALENS_ENV=production \
    DATALENS_HOST=0.0.0.0 \
    DATALENS_PORT=8000 \
    DATABASE_URL=sqlite:////app/storage/datalens.db \
    STORAGE_DIR=/app/storage \
    MAX_UPLOAD_SIZE_BYTES=10485760 \
    CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python backend dependencies
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source and compiled frontend
COPY backend/ ./backend/
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Create storage directory for SQLite database and versioned CSVs
RUN mkdir -p /app/storage

EXPOSE 8000

# Persistent storage mount point for SQLite and versioned CSV datasets
VOLUME ["/app/storage"]

CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
