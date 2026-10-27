# Production Deployment Guide: Render (Backend) & Vercel (Frontend)

This guide provides step-by-step instructions for deploying DataLens in a decoupled production architecture:
- **Backend API**: Hosted on **Render** as a Docker Web Service with an attached Persistent Disk.
- **Frontend SPA**: Hosted on **Vercel** as a static React + Vite Single Page Application.
- **Local / Self-Hosted**: Supported via Docker Compose (both services run together on port 8000).

---

## Architecture Overview

```
┌─────────────────────────────────┐                 ┌──────────────────────────────────────┐
│        Vercel (Frontend)        │                 │        Render (Docker Backend)       │
│  React 18 + Vite SPA            │                 │  FastAPI + Uvicorn                   │
│  https://<app>.vercel.app       │ ──── HTTPS ───> │  https://<backend>.onrender.com      │
│  Env: VITE_API_BASE_URL         │                 │  Env: PORT, CORS_ORIGINS             │
└─────────────────────────────────┘                 └──────────────────┬───────────────────┘
                                                                       │
                                                            Mount: /app/storage
                                                                       ▼
                                                    ┌──────────────────────────────────────┐
                                                    │        Render Persistent Disk        │
                                                    │  • datalens.db (SQLite database)     │
                                                    │  • *.csv (Versioned datasets)        │
                                                    │  • *.json (Cached profile metrics)   │
                                                    └──────────────────────────────────────┘
```

---

## Part 1: Deploy Backend on Render (Docker Web Service)

Render builds and runs the container using the dedicated backend-only Dockerfile at `backend/Dockerfile.render`.

> [!TIP]
> **Automated Blueprint Option**: The repository includes [`render.yaml`](../render.yaml). You can deploy via **New +** $\rightarrow$ **Blueprint** on Render to automatically configure the service, disk, and environment variables.

### Step 1: Create a New Web Service on Render
1. Log in to your [Render Dashboard](https://dashboard.render.com/).
2. Click **New +** $\rightarrow$ **Web Service**.
3. Connect your GitHub account and select the **DataLens** repository (`main` branch).

### Step 2: Configure Service Settings
- **Name**: `datalens-backend` (or your preferred service name).
- **Region**: Choose the region closest to your users.
- **Branch**: `main`.
- **Root Directory**: Leave blank (Render defaults to the repository root `.`).
- **Runtime / Language**: Select **Docker**.
- **Instance Type**: `Starter` (512 MB+ RAM recommended for Pandas DataFrame operations and persistent disk support).

### Step 3: Configure Docker Build Context & Dockerfile Path (CRITICAL)
In the Render Web Service creation screen (or under **Settings** $\rightarrow$ **Build & Deploy**):
- Click **Advanced**.
- **Dockerfile Path**: Set to `backend/Dockerfile.render` (relative to the repository root).
- **Docker Context**: Set to `.` (or leave blank, which defaults to the repository root).

> [!IMPORTANT]
> **Build Context Requirement**:  
> The Docker build context **must** be the repository root (`.`), not the `backend` subdirectory. This ensures `COPY backend/requirements.txt ./` and `COPY backend/ ./backend/` properly copy files and preserve the working FastAPI import path `backend.app.main:app`.  
> `backend/Dockerfile.render` contains only the Python 3.11 runtime, FastAPI dependencies, and application code. It does **not** install Node.js, run npm, or copy frontend static files. (The root `Dockerfile` remains available for full-stack all-in-one local builds with Docker Compose).

### Step 4: Configure Environment Variables
In the **Environment** tab, add the following variables:

| Key | Value / Example | Required | Purpose |
| :--- | :--- | :---: | :--- |
| `DATALENS_ENV` | `production` | **Yes** | Sets production mode, disables debug endpoints, enables strict CORS |
| `DATALENS_HOST` | `0.0.0.0` | **Yes** | Binds Uvicorn to all network interfaces |
| `DATABASE_URL` | `sqlite:////app/storage/datalens.db` | **Yes** | Directs SQLite to the persistent disk path |
| `STORAGE_DIR` | `/app/storage` | **Yes** | Directs dataset CSVs and profile caches to persistent disk |
| `MAX_UPLOAD_SIZE_BYTES` | `10485760` | Optional | Max upload size (10 MB default) |
| `CORS_ORIGINS` | `https://<your-vercel-domain>.vercel.app` | **Yes** | Allows cross-origin requests from your Vercel frontend |

> [!NOTE]
> **Port Configuration on Render**: Render automatically injects the `PORT` environment variable (typically `10000`). The DataLens `backend/Dockerfile.render` startup command automatically evaluates `${PORT:-10000}`. You do **not** need to manually add `PORT` to your Render environment variables.

### Step 5: Configure Health Check Path
Render uses HTTP health checks to verify that your service is healthy before routing live traffic:
- **Health Check Path**: `/health` (or `/api/v1/health`)
- HTTP Methods supported: `GET` and `HEAD` (both return HTTP 200 `{"status": "ok", ...}`).

### Step 6: Attach a Render Persistent Disk (CRITICAL)

> [!CAUTION]
> **Data Persistence Requirement**:  
> A standard Docker container on Render has an **ephemeral** filesystem. Any file written inside the container (including SQLite tables and uploaded CSVs) will be **permanently lost** whenever Render restarts, deploys a new commit, or moves instances.  
> Declaring `VOLUME ["/app/storage"]` in the Dockerfile does **not** guarantee persistence on Render by itself. You **must** attach a Render Persistent Disk.

1. In your Render Web Service dashboard, go to the **Disks** tab (available on paid plans, e.g. Starter).
2. Click **Add Disk** or **Attach Persistent Disk**.
3. Configure the disk:
   - **Name**: `datalens-storage`
   - **Mount Path**: `/app/storage`
   - **Size**: `1 GB` (or `5 GB` depending on dataset volume).
4. Save the disk configuration. Render will restart the service with the disk mounted at `/app/storage`.

> [!IMPORTANT]
> **Single Instance Constraint**:  
> SQLite operates via POSIX filesystem locks and is designed for a **single backend instance** (`Instance Count = 1`). Do not scale the Render Web Service to multiple instances (`instances > 1`), as multiple containers cannot safely share a single SQLite database file concurrently without locking conflicts.

### Step 7: Deploy and Verify
1. Click **Create Web Service** (or **Manual Deploy** $\rightarrow$ **Deploy latest commit**).
2. Monitor the Render build logs. Docker will install dependencies and start Uvicorn.
3. Once deployed, verify your service by navigating to:
   ```
   https://<your-render-service>.onrender.com/health
   ```
   You should see:
   ```json
   {
     "status": "ok",
     "app_name": "DataLens API",
     "version": "1.0.0",
     "environment": "production",
     "database": "configured"
   }
   ```
4. Note your Render URL (e.g. `https://datalens-backend.onrender.com`). You will need it in the Vercel setup.

---

## Part 2: Deploy Frontend on Vercel

### Step 1: Import Repository to Vercel
1. Log in to your [Vercel Dashboard](https://vercel.com/dashboard).
2. Click **Add New...** $\rightarrow$ **Project**.
3. Import your **DataLens** GitHub repository.

### Step 2: Configure Project Root & Build Settings
- **Framework Preset**: `Vite` (Vercel automatically detects this).
- **Root Directory**: Click **Edit** and select `frontend`.
- **Build Command**: `npm run build` (or default `vite build`).
- **Output Directory**: `dist`.
- **Install Command**: `npm install` (or `npm ci`).

### Step 3: Configure Environment Variables
In Vercel's **Environment Variables** section, add:

| Key | Value | Purpose |
| :--- | :--- | :--- |
| `VITE_API_BASE_URL` | `https://<your-render-service>.onrender.com/api/v1` | Points the frontend API client to the Render backend |

> [!TIP]
> The DataLens frontend client automatically normalizes the URL. Whether you provide `https://<backend>.onrender.com` or `https://<backend>.onrender.com/api/v1` (with or without a trailing slash), it safely resolves to `/api/v1` without duplicate path segments.

### Step 4: Deploy & Link CORS
1. Click **Deploy**.
2. Once the build finishes, Vercel will provide your production URL:
   ```
   https://<your-project>.vercel.app
   ```
3. Copy this Vercel domain.
4. **Return to Render**:
   - Go to your Render Web Service $\rightarrow$ **Environment**.
   - Update `CORS_ORIGINS` to include your Vercel URL:
     ```
     CORS_ORIGINS=https://<your-project>.vercel.app
     ```
   - Click **Save Changes**. Render will automatically redeploy the backend with the new CORS origin enabled.

---

## Part 3: Local Development & Docker Compose (Self-Hosted)

For running the complete application locally with a single command:

```bash
# 1. Start the entire application:
docker compose up --build -d

# 2. Check health status:
curl -I http://localhost:8000/health

# 3. Access the application in your browser:
http://localhost:8000
```

In Docker Compose:
- The backend listens on port `8000`.
- The SQLite database and datasets are stored on the `datalens_data` local volume.
- FastAPI automatically serves both the API endpoints (`/api/v1/*`) and the compiled Vite frontend SPA (`/`).

---

## Deployment Checklist & Verification Summary

- [ ] **Render Backend created**: Runtime set to `Docker`, Root directory left blank, Dockerfile path set to `backend/Dockerfile.render` (or deployed via `render.yaml` Blueprint).
- [ ] **Render Environment configured**: `DATALENS_ENV=production`, `DATABASE_URL=sqlite:////app/storage/datalens.db`, `STORAGE_DIR=/app/storage`.
- [ ] **Persistent Disk attached**: Mount path set to `/app/storage`.
- [ ] **Single Instance verified**: Instance count kept at `1` for SQLite safety.
- [ ] **Health endpoint verified**: `GET https://<render-url>/health` returns `200 OK`.
- [ ] **Vercel Frontend created**: Root directory set to `frontend`, output directory set to `dist`.
- [ ] **Vercel Environment configured**: `VITE_API_BASE_URL=https://<render-url>/api/v1`.
- [ ] **CORS updated on Render**: `CORS_ORIGINS` set to `https://<vercel-url>`.
