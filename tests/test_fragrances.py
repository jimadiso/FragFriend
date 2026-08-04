import pytest
from fastapi.testclient import TestClient

from Backend.main import app
from Backend.services import fragrance_service


client = TestClient(app)

SUMMARY = {
    "id": 3785,
    "perfume": "Dior Me Dior Me Not",
    "brand": "Dior",
    "country": "France",
    "gender": "Women",
    "rating_value": 3.7,
    "rating_count": 271,
    "year": 2004,
}

SEARCH_RESULT = {
    **SUMMARY,
    "mainaccord1": "Floral",
    "mainaccord2": "Fresh",
    "mainaccord3": "Aquatic",
    "mainaccord4": "Sweet",
    "mainaccord5": "Powdery",
}

DETAIL = {
    **SEARCH_RESULT,
    "url": "https://example.com/fragrance",
    "top_notes": "Water Notes, Sweet Pea",
    "middle_notes": "Peony, Freesia, Violet",
    "base_notes": "Cherry, Musk",
    "perfumer1": "Unknown",
    "perfumer2": None,
}


def test_home():
    response = client.get("/")

    assert response.status_code == 200
    assert response.json() == {
        "message": "Frag Friend API is running"
    }


def test_get_fragrances(monkeypatch):
    monkeypatch.setattr(
        fragrance_service,
        "get_fragrances",
        lambda limit, offset: [SUMMARY],
    )

    response = client.get("/fragrances/?limit=5&offset=0")

    assert response.status_code == 200
    assert response.json() == [SUMMARY]


def test_search_fragrances(monkeypatch):
    monkeypatch.setattr(
        fragrance_service,
        "search_fragrances",
        lambda **kwargs: [SEARCH_RESULT],
    )

    response = client.get(
        "/fragrances/search?brand=Dior&limit=5&offset=0"
    )

    assert response.status_code == 200
    assert response.json() == [SEARCH_RESULT]


def test_get_fragrance_by_id(monkeypatch):
    monkeypatch.setattr(
        fragrance_service,
        "get_fragrance_by_id",
        lambda fragrance_id: DETAIL,
    )

    response = client.get("/fragrances/3785")

    assert response.status_code == 200
    assert response.json() == DETAIL


def test_missing_fragrance_returns_404(monkeypatch):
    monkeypatch.setattr(
        fragrance_service,
        "get_fragrance_by_id",
        lambda fragrance_id: None,
    )

    response = client.get("/fragrances/9999999")

    assert response.status_code == 404
    assert response.json() == {
        "detail": "Fragrance not found"
    }


@pytest.mark.parametrize(
    "url",
    [
        "/fragrances/?limit=101",
        "/fragrances/?offset=-1",
        "/fragrances/search?min_rating=-1",
        "/fragrances/search?max_rating=6",
        "/fragrances/search?min_rating=4&max_rating=2",
        "/fragrances/search?year_from=2020&year_to=1990",
        "/fragrances/search?min_vote=-1",
        "/fragrances/search?min_vote=10&max_vote=2",
        "/fragrances/search?order=random",
        "/fragrances/search?sort_by=unsupported",
    ],
)
def test_invalid_parameters_return_422(url):
    response = client.get(url)

    assert response.status_code == 422

def test_cors_allows_frontend_origin():
    response = client.options(
        "/fragrances/",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 200
    assert (
        response.headers["access-control-allow-origin"]
        == "http://localhost:5173"
    )
    assert "GET" in response.headers["access-control-allow-methods"]


def test_cors_rejects_unknown_origin():
    response = client.options(
        "/fragrances/",
        headers={
            "Origin": "https://untrusted.example",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers