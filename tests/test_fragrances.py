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
        "&note=Musk"
        "&accord=Floral"
        "&accord=Fresh"
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
    assert received_parameters["note"] == ["Cherry", "Musk"]
    assert received_parameters["accord"] == ["Floral", "Fresh"]
    assert received_parameters["min_rating"] == 3.5
    assert received_parameters["year_from"] == 2000
    assert received_parameters["year_to"] == 2010

def test_count_fragrances(monkeypatch):
    received_parameters = {}

    def fake_count(**kwargs):
        received_parameters.update(kwargs)
        return {"total": 89}

    monkeypatch.setattr(
        fragrance_service,
        "count_fragrances",
        fake_count,
    )

    response = client.get(
        "/fragrances/search/count"
        "?name=Dior"
        "&gender=Women"
        "&note=Cherry"
        "&note=Musk"
        "&accord=Floral"
        "&accord=Fresh"
        "&min_rating=3.5"
        "&max_rating=5"
        "&year_from=2000"
        "&year_to=2020"
    )

    assert response.status_code == 200
    assert response.json() == {"total": 89}
    assert received_parameters["name"] == "Dior"
    assert received_parameters["gender"] == "Women"
    assert received_parameters["note"] == ["Cherry", "Musk"]
    assert received_parameters["accord"] == ["Floral", "Fresh"]
    assert received_parameters["min_rating"] == 3.5
    assert received_parameters["max_rating"] == 5
    assert received_parameters["year_from"] == 2000
    assert received_parameters["year_to"] == 2020

def test_get_accord_filter_options(monkeypatch):
    monkeypatch.setattr(
        fragrance_service,
        "get_filter_options",
        lambda option_type, query, limit: ["Fresh", "Fresh Spicy"],
    )

    response = client.get(
        "/fragrances/filter-options/accords"
        "?query=fresh"
        "&limit=12"
    )

    assert response.status_code == 200
    assert response.json() == ["Fresh", "Fresh Spicy"]


def test_get_note_filter_options(monkeypatch):
    monkeypatch.setattr(
        fragrance_service,
        "get_filter_options",
        lambda option_type, query, limit: ["Vanilla", "Vanilla Flower"],
    )

    response = client.get(
        "/fragrances/filter-options/notes"
        "?query=vanilla"
        "&limit=12"
    )

    assert response.status_code == 200
    assert response.json() == ["Vanilla", "Vanilla Flower"]

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
        "/fragrances/search/count?min_rating=-1",
        "/fragrances/search/count?max_rating=6",
        "/fragrances/search/count?min_rating=4&max_rating=2",
        "/fragrances/search/count?year_from=2020&year_to=1990",
        "/fragrances/search/count?min_vote=-1",
        "/fragrances/search/count?min_vote=10&max_vote=2",
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


def test_search_brands_forwards_filters_and_pagination(monkeypatch):
    brand_result = {
        "brand": "Dior",
        "fragrance_count": 12,
        "average_rating": 4.35,
    }
    received = {}

    def fake_search_brands(**kwargs):
        received.update(kwargs)
        return [brand_result]

    monkeypatch.setattr(
        fragrance_service,
        "search_brands",
        fake_search_brands,
    )

    response = client.get(
        "/fragrances/brands/search"
        "?name=Dior"
        "&gender=Women"
        "&accord=Floral"
        "&accord=Fresh"
        "&note=Rose"
        "&note=Musk"
        "&min_rating=4"
        "&max_rating=5"
        "&year_from=2010"
        "&year_to=2026"
        "&min_vote=100"
        "&max_vote=10000"
        "&sort_by=rating"
        "&order=desc"
        "&limit=8"
        "&offset=8"
    )

    assert response.status_code == 200
    assert response.json() == [brand_result]
    assert received == {
        "name": "Dior",
        "gender": "Women",
        "accord": ["Floral", "Fresh"],
        "note": ["Rose", "Musk"],
        "min_rating": 4.0,
        "max_rating": 5.0,
        "year_from": 2010,
        "year_to": 2026,
        "min_vote": 100,
        "max_vote": 10000,
        "sort_by": "rating",
        "order": "desc",
        "limit": 8,
        "offset": 8,
    }


def test_count_brands_forwards_filters(monkeypatch):
    received = {}

    def fake_count_brands(**kwargs):
        received.update(kwargs)
        return {"total": 17}

    monkeypatch.setattr(
        fragrance_service,
        "count_brands",
        fake_count_brands,
    )

    response = client.get(
        "/fragrances/brands/search/count"
        "?name=Dior"
        "&gender=Men"
        "&min_rating=4"
        "&year_from=2020"
        "&note=Bergamot"
        "&sort_by=rating"
    )

    assert response.status_code == 200
    assert response.json() == {"total": 17}
    assert received == {
        "name": "Dior",
        "gender": "Men",
        "accord": [],
        "note": ["Bergamot"],
        "min_rating": 4.0,
        "max_rating": None,
        "year_from": 2020,
        "year_to": None,
        "min_vote": None,
        "max_vote": None,
        "sort_by": "rating",
    }


def test_search_brands_rejects_invalid_filter_range():
    response = client.get(
        "/fragrances/brands/search"
        "?min_rating=4.5"
        "&max_rating=3"
    )

    assert response.status_code == 422
    assert response.json() == {
        "detail": "min_rating cannot be greater than max_rating"
    }
