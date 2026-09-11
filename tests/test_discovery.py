from fastapi.testclient import TestClient

from Backend.main import app
from Backend.routes import fragrances as fragrance_routes
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


def test_discovery_reuses_cached_preferences(monkeypatch):
    discovery_service.clear_preference_cache()
    preferences = DiscoveryPreferences(accords=["sweet"])
    calls = 0

    def extract(request):
        nonlocal calls
        calls += 1
        return preferences

    monkeypatch.setattr(discovery_service, "extract_preferences", extract)
    monkeypatch.setattr(discovery_service, "search_database", lambda parsed: [])

    first = client.post("/fragrances/discover", json={"request": "sweet fragrance"})
    second = client.post("/fragrances/discover", json={"request": "  Sweet   fragrance  "})

    assert first.status_code == 200
    assert second.status_code == 200
    assert calls == 1


def test_discovery_limits_uncached_model_requests(monkeypatch):
    discovery_service.clear_preference_cache()
    fragrance_routes._discovery_attempts.clear()
    monkeypatch.setattr(
        discovery_service,
        "extract_preferences",
        lambda request: DiscoveryPreferences(accords=["sweet"]),
    )
    monkeypatch.setattr(discovery_service, "search_database", lambda parsed: [])

    for index in range(fragrance_routes.DISCOVERY_RATE_LIMIT):
        response = client.post(
            "/fragrances/discover",
            json={"request": f"sweet fragrance request {index}"},
        )
        assert response.status_code == 200

    response = client.post(
        "/fragrances/discover",
        json={"request": "a different sweet fragrance request"},
    )
    assert response.status_code == 429
    fragrance_routes._discovery_attempts.clear()


def test_brand_is_a_usable_discovery_preference():
    assert not discovery_service.needs_follow_up(
        DiscoveryPreferences(brand="Dior"),
    )


def test_popularity_is_a_usable_discovery_preference():
    assert not discovery_service.needs_follow_up(
        DiscoveryPreferences(prefer_popular=True),
    )


def test_discovery_hides_provider_error_details(monkeypatch):
    discovery_service.clear_preference_cache()
    monkeypatch.setattr(discovery_service, "extract_preferences", lambda request: (_ for _ in ()).throw(RuntimeError("OpenAI is unavailable right now. Please try again shortly.")))
    response = client.post("/fragrances/discover", json={"request": "sweet fragrance"})
    assert response.status_code == 503
    assert response.json()["detail"] == "OpenAI is unavailable right now. Please try again shortly."


def test_discovery_pagination_uses_filters_for_results_and_total(monkeypatch):
    calls = []
    def search(preferences, **options):
        calls.append((preferences, options))
        return 23 if options.get("count_only") else []
    monkeypatch.setattr(discovery_service, "search_database", search)
    def unexpected_model_call(*args):
        raise AssertionError("Paging must not call the model")
    monkeypatch.setattr(discovery_service, "extract_preferences", unexpected_model_call)
    response = client.post("/fragrances/discover/more", json={
        "preferences": {"brand": "Dior", "accords": ["fresh"], "season": "summer", "min_votes": 1000},
        "offset": 8, "limit": 8, "name": "Homme", "max_rating": 4.8,
        "sort_by": "popularity", "order": "desc",
    })
    assert response.status_code == 200
    assert response.json()["total"] == 23
    assert calls[0][0].brand == "Dior"
    assert calls[0][0].min_votes == 1000
    assert calls[0][1] == {"limit": 8, "offset": 8, "name": "Homme", "max_rating": 4.8, "sort_by": "popularity", "order": "desc"}
    assert calls[1][1] == {**calls[0][1], "count_only": True}


def test_discovery_page_rejects_invalid_filter_ranges():
    response = client.post("/fragrances/discover/more", json={
        "preferences": {"min_rating": 4}, "max_rating": 3,
    })
    assert response.status_code == 422


def test_database_discovery_filters_by_minimum_votes(monkeypatch):
    executed = []

    class Connection:
        def execute(self, statement, params):
            executed.append((str(statement), params))
            return []

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    monkeypatch.setattr(discovery_service.engine, "connect", lambda: Connection())

    assert discovery_service.search_database(
        DiscoveryPreferences(min_votes=1000),
    ) == []
    statement, parameters = executed[0]
    assert "COALESCE(f.rating_count, 0) >= :min_votes" in statement
    assert parameters["min_votes"] == 1000
