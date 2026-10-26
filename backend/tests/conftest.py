import pytest
from fastapi.testclient import TestClient
from backend.app.main import app

@pytest.fixture
def client():
    """Provides a TestClient fixture for invoking FastAPI endpoints."""
    return TestClient(app)
