from datetime import datetime, timezone

from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError

from Backend.main import app
from Backend.routes import auth as auth_routes
from Backend.security import create_access_token
from Backend.services import auth_service


client = TestClient(app)

USER_RECORD = {
    "id": 1,
    "email": "test@example.com",
    "display_name": "Test User",
    "password_hash": "stored-password-hash",
    "created_at": datetime(
        2026,
        1,
        1,
        tzinfo=timezone.utc,
    ),
}


def test_register_user(monkeypatch):
    received_parameters = {}

    def fake_create_user(**kwargs):
        received_parameters.update(kwargs)
        return USER_RECORD

    monkeypatch.setattr(
        auth_service,
        "create_user",
        fake_create_user,
    )

    response = client.post(
        "/auth/register",
        json={
            "email": "TEST@example.com",
            "display_name": "Test User",
            "password": "SecurePassword123!",
        },
    )

    assert response.status_code == 201
    assert response.json()["email"] == "test@example.com"
    assert response.json()["display_name"] == "Test User"
    assert "password" not in response.json()
    assert "password_hash" not in response.json()
    assert received_parameters["password"] == "SecurePassword123!"


def test_duplicate_email_returns_409(monkeypatch):
    def fake_create_user(**kwargs):
        raise IntegrityError(
            "INSERT",
            {},
            Exception("duplicate email"),
        )

    monkeypatch.setattr(
        auth_service,
        "create_user",
        fake_create_user,
    )

    response = client.post(
        "/auth/register",
        json={
            "email": "test@example.com",
            "display_name": "Test User",
            "password": "SecurePassword123!",
        },
    )

    assert response.status_code == 409
    assert response.json() == {
        "detail": "An account with this email already exists"
    }


def test_login_returns_access_token(monkeypatch):
    monkeypatch.setattr(
        auth_service,
        "authenticate_user",
        lambda email, password: USER_RECORD,
    )
    monkeypatch.setattr(
        auth_routes,
        "create_access_token",
        lambda user_id: "test-access-token",
    )

    response = client.post(
        "/auth/login",
        json={
            "email": "test@example.com",
            "password": "SecurePassword123!",
        },
    )

    assert response.status_code == 200
    assert response.json()["access_token"] == "test-access-token"
    assert response.json()["token_type"] == "bearer"
    assert "password_hash" not in response.json()["user"]


def test_invalid_login_returns_401(monkeypatch):
    monkeypatch.setattr(
        auth_service,
        "authenticate_user",
        lambda email, password: None,
    )

    response = client.post(
        "/auth/login",
        json={
            "email": "test@example.com",
            "password": "WrongPassword123!",
        },
    )

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_get_current_user(monkeypatch):
    monkeypatch.setattr(
        auth_service,
        "get_user_by_id",
        lambda user_id: USER_RECORD,
    )

    token = create_access_token(USER_RECORD["id"])

    response = client.get(
        "/auth/me",
        headers={
            "Authorization": f"Bearer {token}",
        },
    )

    assert response.status_code == 200
    assert response.json()["id"] == USER_RECORD["id"]
    assert response.json()["email"] == USER_RECORD["email"]
    assert "password_hash" not in response.json()


def test_get_current_user_requires_token():
    response = client.get("/auth/me")

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"