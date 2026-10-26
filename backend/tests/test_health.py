from fastapi.testclient import TestClient

def test_root_health_check(client: TestClient):
    """Test that GET /health returns status 200 and expected health metadata."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "app_name" in data
    assert "version" in data
    assert "environment" in data
    assert "timestamp" in data

def test_api_v1_health_check(client: TestClient):
    """Test that GET /api/v1/health returns status 200."""
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"

def test_nonexistent_endpoint_returns_404(client: TestClient):
    """Test that querying a nonexistent endpoint returns a 404 response."""
    response = client.get("/api/v1/nonexistent")
    assert response.status_code == 404
