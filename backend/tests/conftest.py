import pytest
import tempfile
import shutil
from pathlib import Path
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

from backend.app.db.base import Base
from backend.app.db.session import get_db, init_db
from backend.app.main import app
from backend.app.services.storage import StorageService
from backend.app.services.dataset_service import dataset_service

@pytest.fixture(scope="session")
def test_temp_dir():
    """Create a temporary directory for tests and clean it up afterwards."""
    temp_dir = tempfile.mkdtemp(prefix="datalens_test_")
    yield Path(temp_dir)
    shutil.rmtree(temp_dir, ignore_errors=True)

@pytest.fixture
def db_session(test_temp_dir):
    """
    Creates an isolated persistent SQLite database in a temp directory with
    foreign keys enforced, providing a SQLAlchemy session for testing.
    """
    db_file = test_temp_dir / f"test_{tempfile.mktemp(dir='')}.db"
    db_url = f"sqlite:///{db_file}"
    engine = create_engine(db_url, connect_args={"check_same_thread": False})

    @event.listens_for(Engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    init_db(engine_to_use=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestingSessionLocal()

    yield session

    session.close()
    if db_file.exists():
        db_file.unlink()

@pytest.fixture
def isolated_storage(test_temp_dir):
    """Provides an isolated StorageService pointed to a temporary folder."""
    storage_folder = test_temp_dir / "storage"
    storage_folder.mkdir(parents=True, exist_ok=True)
    svc = StorageService(base_dir=storage_folder)
    original_storage = dataset_service._storage
    dataset_service._storage = svc
    yield svc
    dataset_service._storage = original_storage

@pytest.fixture
def client(db_session):
    """Provides a TestClient overriding the get_db dependency."""
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
