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
            "image_url": None, "picture_url": "https://fimgs.net/mdimg/perfume/375x500.3.jpg", "thumbnail_url": "https://fimgs.net/mdimg/perfume/m.3.jpg", "mainaccord1": "sweet", "mainaccord2": None,
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


def test_exclusions_and_context_are_searchable():
    for preferences in [DiscoveryPreferences(exclude_notes=['vanilla']), DiscoveryPreferences(exclude_accords=['sweet']), DiscoveryPreferences(context='office')]:
        assert not discovery_service.needs_follow_up(preferences)


def test_context_defaults_respect_explicit_notes_and_accords():
    preferences = DiscoveryPreferences(context='office', notes=['Oud'], accords=['Leather'], exclude_accords=[' SWEET ', 'sweet'])
    excluded = discovery_service._merge_context_exclusions(preferences)
    assert 'oud' not in excluded
    assert 'leather' not in excluded
    assert excluded.count('sweet') == 1
    assert 'incense' in excluded
    assert preferences.exclude_accords == [' SWEET ', 'sweet']
    assert discovery_service._merge_context_exclusions(DiscoveryPreferences(context='date_night')) == []


def test_exclusions_apply_to_results_and_count(monkeypatch):
    executed = []

    class Result:
        def __iter__(self):
            return iter([])
        def scalar_one(self):
            return 0

    class Connection:
        def execute(self, statement, params):
            executed.append((str(statement), dict(params)))
            return Result()
        def __enter__(self):
            return self
        def __exit__(self, *args):
            return False

    monkeypatch.setattr(discovery_service.engine, 'connect', lambda: Connection())
    preferences = DiscoveryPreferences(context='gym', exclude_notes=['vanilla', ' '], exclude_accords=['sweet'])
    discovery_service.search_database(preferences)
    discovery_service.search_database(preferences, count_only=True)
    for query, params in executed:
        assert '!~* :exclude_note_0' in query
        assert "COALESCE(f.accords_all, '') !~*" in query
        assert params['exclude_note_0'] == discovery_service._scent_term_pattern('vanilla')
        assert 'exclude_note_1' not in params
        assert discovery_service._scent_term_pattern('sweet') in params.values()
        assert discovery_service._scent_term_pattern('oud') in params.values()


def test_exclusion_reason_uses_listed_data_not_projection_guarantees():
    row = {'brand': 'Example', 'all_notes': 'citrus', 'accords_all': 'fresh'}
    reasons = discovery_service._reasons(row, DiscoveryPreferences(context='office', exclude_notes=['vanilla']))
    assert 'Does not list vanilla among its notes.' in reasons
    assert any('office context filter' in reason for reason in reasons)
    assert not any('Fits a' in reason for reason in reasons)


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


def test_fresh_citrus_is_required_citrus_with_optional_fresh():
    parsed = DiscoveryPreferences(accords=["fresh", "citrus"], prefer_popular=True, season="summer", context="beach")
    normalized = discovery_service.normalize_preferences(
        "A fresh citrus fragrance for summer days", parsed,
    )
    assert normalized.accords == ["citrus"]
    assert normalized.preferred_accords == ["fresh"]
    assert normalized.prefer_popular is False
    assert normalized.season == "summer"
    assert normalized.context is None
    assert parsed.accords == ["fresh", "citrus"]
    assert parsed.prefer_popular is True
    assert parsed.context == "beach"


def test_standalone_fresh_follow_up_filters_exact_fresh_accord(monkeypatch):
    parsed = DiscoveryPreferences(preferred_accords=["fresh"])
    normalized = discovery_service.normalize_preferences(
        "Original request: Something nice\nAdditional preference: fresh", parsed,
    )
    assert normalized.accords == ["fresh"]
    assert normalized.preferred_accords == []
    assert parsed.preferred_accords == ["fresh"]

    executed = []

    class Connection:
        def execute(self, statement, params):
            executed.append((str(statement), dict(params)))
            return type("Result", (), {"scalar_one": lambda self: 42})()

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    monkeypatch.setattr(discovery_service.engine, "connect", lambda: Connection())
    assert discovery_service.search_database(normalized, count_only=True) == 42
    query, params = executed[0]
    assert ":accord_0 = ANY(regexp_split_to_array" in query
    assert params["accord_0"] == "fresh"
    row = {"brand": "Example", "all_notes": "", "accords_all": "fresh spicy"}
    assert not any("fresh accord" in reason for reason in discovery_service._reasons(row, normalized))
    row["accords_all"] = "fresh spicy, fresh"
    assert any("fresh accord" in reason for reason in discovery_service._reasons(row, normalized))


def test_beach_context_requires_an_explicit_beach_request():
    parsed = DiscoveryPreferences(context="beach", season="summer", time_of_day="day")
    assert discovery_service.normalize_preferences("Fresh for a hot summer day", parsed).context is None
    assert discovery_service.normalize_preferences("Fresh for a day at the beach", parsed).context == "beach"
    assert discovery_service.normalize_preferences("Fresh for summer, not the beach", parsed).context is None


def test_popularity_only_when_explicitly_requested():
    parsed = DiscoveryPreferences(accords=["citrus"])
    assert discovery_service.normalize_preferences("Most reviewed citrus fragrances", parsed).prefer_popular
    assert not discovery_service.normalize_preferences("Citrus fragrances with 1000 votes", parsed).prefer_popular


def test_preferred_fresh_ranks_without_filtering_or_matching_fresh_spicy(monkeypatch):
    executed = []

    class Connection:
        def execute(self, statement, params):
            executed.append((str(statement), dict(params)))
            return []
        def __enter__(self):
            return self
        def __exit__(self, *args):
            return False

    monkeypatch.setattr(discovery_service.engine, "connect", lambda: Connection())
    preferences = DiscoveryPreferences(accords=["citrus"], preferred_accords=["fresh"])
    assert discovery_service.search_database(preferences, sort_by="popularity") == []
    query, params = executed[0]
    where_clause = query.split("WHERE", 1)[1].split("ORDER BY", 1)[0]
    order_clause = query.split("ORDER BY", 1)[1]
    assert "preferred_accord" not in where_clause
    assert "preferred_accord_0" in order_clause
    assert order_clause.index("preferred_accord_0") < order_clause.index("f.rating_count")
    assert params["preferred_accord_0"] == "fresh"
    row = {"brand": "Example", "all_notes": "", "accords_all": "citrus, fresh spicy"}
    assert not any("preferred fresh" in reason for reason in discovery_service._reasons(row, preferences))
    row["accords_all"] = "citrus, fresh"
    assert any("preferred fresh" in reason for reason in discovery_service._reasons(row, preferences))


def test_or_terms_are_one_alternative_group_instead_of_two_required_terms():
    parsed = DiscoveryPreferences(notes=["oud"], accords=["leather"], preferred_accords=["fresh"])
    normalized = discovery_service.normalize_preferences("A fresh scent with oud or leather", parsed)
    assert normalized.notes == []
    assert normalized.accords == []
    assert normalized.or_groups == [["oud", "leather"]]
    assert normalized.preferred_accords == ["fresh"]
    assert not discovery_service.needs_follow_up(normalized)

    strict = discovery_service.normalize_preferences("A fresh scent with oud and leather", parsed)
    assert strict.or_groups == []
    assert strict.required_terms == ["oud", "leather"]
    assert strict.notes == []
    assert strict.accords == []


def test_explicit_pair_restores_a_term_the_model_omitted():
    missing_oud = DiscoveryPreferences(accords=["leather"], preferred_accords=["fresh"])
    strict = discovery_service.normalize_preferences("A fresh scent with oud and leather", missing_oud)
    assert strict.required_terms == ["oud", "leather"]
    assert strict.accords == []
    assert strict.or_groups == []

    alternatives = discovery_service.normalize_preferences("A fresh scent with oud or leather", missing_oud)
    assert alternatives.or_groups == [["oud", "leather"]]
    assert alternatives.accords == []


def test_or_group_is_shared_by_results_and_count_queries(monkeypatch):
    executed = []

    class Result:
        def __iter__(self):
            return iter([])
        def scalar_one(self):
            return 0

    class Connection:
        def execute(self, statement, params):
            executed.append((str(statement), dict(params)))
            return Result()
        def __enter__(self):
            return self
        def __exit__(self, *args):
            return False

    monkeypatch.setattr(discovery_service.engine, "connect", lambda: Connection())
    preferences = DiscoveryPreferences(or_groups=[["oud", "leather"]], preferred_accords=["fresh"])
    discovery_service.search_database(preferences)
    discovery_service.search_database(preferences, count_only=True)
    for query, params in executed:
        where_clause = query.split("WHERE", 1)[1].split("ORDER BY", 1)[0]
        assert "OR COALESCE(f.accords_all, '') ~* :or_0_0" in where_clause
        assert "OR COALESCE(f.accords_all, '') ~* :or_0_1" in where_clause
        assert " OR (concat_ws" in where_clause
        assert params["or_0_0"] == discovery_service._scent_term_pattern("oud")
        assert params["or_0_1"] == discovery_service._scent_term_pattern("leather")


def test_required_pair_is_two_independent_conditions(monkeypatch):
    executed = []

    class Connection:
        def execute(self, statement, params):
            executed.append((str(statement), dict(params)))
            return []
        def __enter__(self):
            return self
        def __exit__(self, *args):
            return False

    monkeypatch.setattr(discovery_service.engine, "connect", lambda: Connection())
    discovery_service.search_database(DiscoveryPreferences(required_terms=["oud", "leather"]))
    query, params = executed[0]
    where_clause = query.split("WHERE", 1)[1].split("ORDER BY", 1)[0]
    assert "~* :required_term_0) AND (" in where_clause
    assert "~* :required_term_1)" in where_clause
    assert params["required_term_0"] == discovery_service._scent_term_pattern("oud")
    assert params["required_term_1"] == discovery_service._scent_term_pattern("leather")


def test_oud_does_not_match_inside_akigalawood():
    row = {"brand": "Montblanc", "all_notes": "Bergamot, Leather, Ambroxan, Akigalawood",
           "accords_all": "woody, citrus, aromatic"}
    assert not discovery_service._listed_scent_matches(row["all_notes"], "oud")
    assert not discovery_service._listed_scent_matches(row["accords_all"], "oud")
    assert not any("required oud" in reason for reason in discovery_service._reasons(
        row, DiscoveryPreferences(required_terms=["oud", "leather"]),
    ))
    assert discovery_service._listed_scent_matches("Agarwood (Oud), Leather", "oud")
    assert discovery_service._listed_scent_matches("Oud, Leather", "oud")
