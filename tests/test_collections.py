from datetime import datetime, timezone

from fastapi.testclient import TestClient
import pytest
from sqlalchemy.exc import IntegrityError

from Backend.main import app
from Backend.routes.auth import get_current_user
from Backend.services import collection_service


client = TestClient(app)
CURRENT_USER = {
    "id": 7,
    "email": "test@example.com",
    "display_name": "Test User",
    "password_hash": "stored-password-hash",
}
UPDATED_COLLECTION = {
    "id": 12,
    "name": "Autumn Evenings",
    "description": "Warm scents for cool nights.",
    "fragrance_count": 3,
    "created_at": datetime(2026, 1, 1, tzinfo=timezone.utc),
}


@pytest.fixture(autouse=True)
def authenticated_user():
    app.dependency_overrides[get_current_user] = lambda: CURRENT_USER
    yield
    app.dependency_overrides.pop(get_current_user, None)


def test_update_collection(monkeypatch):
    received_parameters = {}

    def fake_update_collection(**kwargs):
        received_parameters.update(kwargs)
        return UPDATED_COLLECTION

    monkeypatch.setattr(
        collection_service,
        "update_collection",
        fake_update_collection,
    )

    response = client.patch(
        "/collections/12",
        json={
            "name": " Autumn Evenings ",
            "description": " Warm scents for cool nights. ",
        },
    )

    assert response.status_code == 200
    assert response.json()["name"] == "Autumn Evenings"
    assert response.json()["fragrance_count"] == 3
    assert received_parameters == {
        "user_id": CURRENT_USER["id"],
        "collection_id": 12,
        "name": "Autumn Evenings",
        "description": "Warm scents for cool nights.",
    }


def test_collection_update_cors_preflight_allows_patch():
    response = client.options(
        "/collections/12",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "PATCH",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )

    assert response.status_code == 200
    assert "PATCH" in response.headers["access-control-allow-methods"]


def test_update_missing_collection_returns_404(monkeypatch):
    monkeypatch.setattr(
        collection_service,
        "update_collection",
        lambda **kwargs: None,
    )

    response = client.patch(
        "/collections/999",
        json={"name": "Missing", "description": None},
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Collection not found"}


def test_update_duplicate_collection_name_returns_409(monkeypatch):
    def duplicate_name(**kwargs):
        raise IntegrityError(
            "UPDATE",
            {},
            Exception("duplicate collection name"),
        )

    monkeypatch.setattr(
        collection_service,
        "update_collection",
        duplicate_name,
    )

    response = client.patch(
        "/collections/12",
        json={"name": "Already Exists", "description": None},
    )

    assert response.status_code == 409
    assert response.json() == {
        "detail": "A collection with this name already exists"
    }
