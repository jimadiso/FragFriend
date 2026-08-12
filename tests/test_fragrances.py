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
    "image_url": None,
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
    received_parameters = {}

    def fake_search(**kwargs):
        received_parameters.update(kwargs)
        return [SEARCH_RESULT]

    monkeypatch.setattr(
        fragrance_service,
        "search_fragrances",
        fake_search,
    )

    response = client.get(
        "/fragrances/search"
        "?name=Dior%20Me"
        "&gender=Women"
        "&note=Cherry"
        "&min_rating=3.5"
        "&year_from=2000"
        "&year_to=2010"
        "&limit=5"
        "&offset=0"
    )

    assert response.status_code == 200
    assert response.json() == [SEARCH_RESULT]
    assert received_parameters["name"] == "Dior Me"
    assert received_parameters["gender"] == "Women"
    assert received_parameters["note"] == "Cherry"
    assert received_parameters["min_rating"] == 3.5
    assert received_parameters["year_from"] == 2000
    assert received_parameters["year_to"] == 2010

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


def test_search_brands(monkeypatch):
    brand_result = {
        "brand": "Dior",
        "fragrance_count": 196,
        "average_rating": 4.12,
    }

    monkeypatch.setattr(
        fragrance_service,
        "search_brands",
        lambda name, limit, offset: [brand_result],
    )

    response = client.get(
        "/fragrances/brands/search?name=Dior&limit=8&offset=0"
    )

    assert response.status_code == 200
    assert response.json() == [brand_result]
