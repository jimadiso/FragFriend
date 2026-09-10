from fastapi.testclient import TestClient

from Backend.main import app
from Backend.models.fragrance import DiscoveryPreferences
from Backend.services import discovery_service


client = TestClient(app)


def test_discovery_asks_one_follow_up_when_no_searchable_preference(monkeypatch):
    preferences = DiscoveryPreferences(
        occasion="date night", needs_follow_up=True,
        follow_up_question="Do you prefer a sweet, woody, floral, or fresh scent?",
    )
    monkeypatch.setattr(discovery_service, "extract_preferences", lambda request: preferences)
    response = client.post("/fragrances/discover", json={"request": "I need something for date night"})
    assert response.status_code == 200
    body = response.json()
    assert body["follow_up_question"] == preferences.follow_up_question
    assert body["matches"] == []


def test_discovery_returns_only_database_matches(monkeypatch):
    preferences = DiscoveryPreferences(accords=["sweet"], time_of_day="night")
    match = {
        "fragrance": {
            "id": 77, "perfume": "Database Scent", "brand": "Example", "country": None,
            "gender": "Unisex", "rating_value": 4.2, "rating_count": 10, "year": 2020,
            "image_url": None, "mainaccord1": "sweet", "mainaccord2": None,
            "mainaccord3": None, "mainaccord4": None, "mainaccord5": None,
        },
        "why_matched": ["Has a sweet accord.", "Has 30 community night votes."],
    }
    monkeypatch.setattr(discovery_service, "extract_preferences", lambda request: preferences)
    monkeypatch.setattr(discovery_service, "search_database", lambda parsed: [match])
    response = client.post("/fragrances/discover", json={"request": "sweet fragrance for nighttime"})
    assert response.status_code == 200
    assert response.json()["matches"] == [match]


def test_brand_is_a_usable_discovery_preference():
    assert not discovery_service.needs_follow_up(
        DiscoveryPreferences(brand="Dior"),
    )


def test_popularity_is_a_usable_discovery_preference():
    assert not discovery_service.needs_follow_up(
        DiscoveryPreferences(prefer_popular=True),
    )


def test_discovery_hides_provider_error_details(monkeypatch):
    monkeypatch.setattr(discovery_service, "extract_preferences", lambda request: (_ for _ in ()).throw(RuntimeError("OpenAI is unavailable right now. Please try again shortly.")))
    response = client.post("/fragrances/discover", json={"request": "sweet fragrance"})
    assert response.status_code == 503
    assert response.json()["detail"] == "OpenAI is unavailable right now. Please try again shortly."
