from fastapi.testclient import TestClient
import pytest

from Backend.main import app
from Backend.routes.auth import get_current_user
from Backend.services import bookmark_service


client = TestClient(app)

CURRENT_USER = {
    "id": 7,
    "email": "test@example.com",
    "display_name": "Test User",
    "password_hash": "stored-password-hash",
}

BOOKMARKED_FRAGRANCE = {
    "id": 3785,
    "perfume": "Dior Me Dior Me Not",
    "brand": "Dior",
    "country": "France",
    "gender": "Women",
    "rating_value": 3.7,
    "rating_count": 271,
    "year": 2004,
    "image_url": None,
}


@pytest.fixture(autouse=True)
def authenticated_user():
    app.dependency_overrides[get_current_user] = (
        lambda: CURRENT_USER
    )

    yield

    app.dependency_overrides.pop(
        get_current_user,
        None,
    )


def test_get_bookmarks(monkeypatch):
    received_parameters = {}

    def fake_get_bookmarks(**kwargs):
        received_parameters.update(kwargs)
        return [BOOKMARKED_FRAGRANCE]

    monkeypatch.setattr(
        bookmark_service,
        "get_bookmarks",
        fake_get_bookmarks,
    )

    response = client.get(
        "/bookmarks/?limit=20&offset=0"
    )

    assert response.status_code == 200
    assert response.json() == [BOOKMARKED_FRAGRANCE]
    assert received_parameters == {
        "user_id": CURRENT_USER["id"],
        "limit": 20,
        "offset": 0,
    }


def test_get_bookmark_status(monkeypatch):
    monkeypatch.setattr(
        bookmark_service,
        "is_bookmarked",
        lambda user_id, fragrance_id: True,
    )

    response = client.get(
        "/bookmarks/3785/status"
    )

    assert response.status_code == 200
    assert response.json() == {
        "fragrance_id": 3785,
        "bookmarked": True,
    }


def test_add_bookmark(monkeypatch):
    received_parameters = {}

    def fake_add_bookmark(**kwargs):
        received_parameters.update(kwargs)
        return True

    monkeypatch.setattr(
        bookmark_service,
        "add_bookmark",
        fake_add_bookmark,
    )

    response = client.post("/bookmarks/3785")

    assert response.status_code == 201
    assert response.json() == {
        "fragrance_id": 3785,
        "bookmarked": True,
    }
    assert received_parameters == {
        "user_id": CURRENT_USER["id"],
        "fragrance_id": 3785,
    }


def test_missing_fragrance_cannot_be_bookmarked(monkeypatch):
    monkeypatch.setattr(
        bookmark_service,
        "add_bookmark",
        lambda user_id, fragrance_id: False,
    )

    response = client.post("/bookmarks/9999999")

    assert response.status_code == 404
    assert response.json() == {
        "detail": "Fragrance not found"
    }


def test_remove_bookmark(monkeypatch):
    received_parameters = {}

    def fake_remove_bookmark(**kwargs):
        received_parameters.update(kwargs)
        return True

    monkeypatch.setattr(
        bookmark_service,
        "remove_bookmark",
        fake_remove_bookmark,
    )

    response = client.delete("/bookmarks/3785")

    assert response.status_code == 200
    assert response.json() == {
        "fragrance_id": 3785,
        "bookmarked": False,
    }
    assert received_parameters == {
        "user_id": CURRENT_USER["id"],
        "fragrance_id": 3785,
    }