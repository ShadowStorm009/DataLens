import os
import shutil
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from backend.app.core.config import (
    parse_cors_origins,
    resolve_server_port,
    resolve_server_host,
    ensure_sqlite_parent_dir,
    settings,
)
from backend.app.main import app


def test_cors_origins_parsing():
    """Verify comma-separated CORS origins parsing, trimming, and dev/prod defaults."""
    # Development default
    dev_origins = parse_cors_origins(None, env="development")
    assert "http://localhost:5173" in dev_origins
    assert "http://127.0.0.1:5173" in dev_origins
    assert "http://localhost:8000" in dev_origins

    # Production default must be empty (never wildcard '*')
    prod_origins = parse_cors_origins(None, env="production")
    assert prod_origins == []

    prod_empty = parse_cors_origins("   ", env="production")
    assert prod_empty == []

    # Whitespace and trailing slash trimming
    custom = parse_cors_origins(
        " https://datalens-frontend.vercel.app/ , http://localhost:3000/ , , https://another.domain.com ",
        env="production",
    )
    assert custom == [
        "https://datalens-frontend.vercel.app",
        "http://localhost:3000",
        "https://another.domain.com",
    ]


def test_server_port_resolution(monkeypatch):
    """Verify listening port resolution hierarchy: PORT > DATALENS_PORT > production(10000) / dev(8000)."""
    # 1. Render assigned PORT
    monkeypatch.setenv("PORT", "10000")
    monkeypatch.delenv("DATALENS_PORT", raising=False)
    monkeypatch.setenv("DATALENS_ENV", "production")
    assert resolve_server_port() == 10000

    # 2. Application-specific DATALENS_PORT
    monkeypatch.delenv("PORT", raising=False)
    monkeypatch.setenv("DATALENS_PORT", "8080")
    assert resolve_server_port() == 8080

    # 3. Fallback when PORT is absent in production -> 10000
    monkeypatch.delenv("PORT", raising=False)
    monkeypatch.delenv("DATALENS_PORT", raising=False)
    monkeypatch.setenv("DATALENS_ENV", "production")
    assert resolve_server_port() == 10000

    # 4. Fallback in development -> 8000
    monkeypatch.setenv("DATALENS_ENV", "development")
    assert resolve_server_port() == 8000

    # 5. Malformed non-numeric port falls back safely
    monkeypatch.setenv("PORT", "not-a-number")
    assert resolve_server_port() == 8000


def test_server_host_resolution(monkeypatch):
    """Verify server host binding: 0.0.0.0 in production, 127.0.0.1 in development."""
    monkeypatch.delenv("DATALENS_HOST", raising=False)
    monkeypatch.delenv("HOST", raising=False)

    # Production binds to 0.0.0.0 for Docker/Render
    monkeypatch.setenv("DATALENS_ENV", "production")
    assert resolve_server_host() == "0.0.0.0"

    # Development binds to 127.0.0.1
    monkeypatch.setenv("DATALENS_ENV", "development")
    assert resolve_server_host() == "127.0.0.1"

    # Explicit override
    monkeypatch.setenv("DATALENS_HOST", "0.0.0.0")
    assert resolve_server_host() == "0.0.0.0"


def test_ensure_sqlite_parent_dir(tmp_path):
    """Verify SQLite directory auto-creation for various URL formats."""
    # 1. Relative style
    target_dir = tmp_path / "custom_sqlite_dir"
    db_file = target_dir / "app.db"
    assert not target_dir.exists()

    ensure_sqlite_parent_dir(f"sqlite:///{db_file}")
    assert target_dir.exists()

    # 2. Absolute style (sqlite:////...)
    abs_target_dir = tmp_path / "abs_sqlite_dir"
    abs_db_file = abs_target_dir / "app.db"
    assert not abs_target_dir.exists()

    ensure_sqlite_parent_dir(f"sqlite:////{abs_db_file}")
    assert abs_target_dir.exists()

    # 3. In-memory sqlite should not fail or create directories
    ensure_sqlite_parent_dir("sqlite:///:memory:")


def test_cors_middleware_with_client():
    """Verify CORS preflight and headers response."""
    client = TestClient(app)

    # Test GET /health
    res = client.get("/health", headers={"Origin": "http://localhost:5173"})
    assert res.status_code == 200
    assert res.json()["status"] == "ok"
    assert "access-control-allow-origin" in res.headers

    # Test HEAD /health
    head_res = client.head("/health", headers={"Origin": "http://localhost:5173"})
    assert head_res.status_code == 200
