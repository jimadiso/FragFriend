from Backend.models.fragrance import DiscoveryPreferences
from Backend.services import discovery_service, fragrance_service
from Backend.services.rating_sort import PRIOR_VOTES, bayesian_rating_sql


def _capture_queries(monkeypatch):
    queries = []

    class Connection:
        def execute(self, statement, params):
            queries.append((str(statement), dict(params)))
            return []

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    monkeypatch.setattr(fragrance_service.engine, "connect", lambda: Connection())
    return queries


def test_highest_rating_uses_same_weighted_order_for_search_and_discovery(monkeypatch):
    queries = _capture_queries(monkeypatch)
    fragrance_service.search_fragrances(sort_by="rating", order="desc", limit=10)
    discovery_service.search_database(
        DiscoveryPreferences(accords=["citrus"]), sort_by="rating", order="desc", limit=10,
    )

    weighted = bayesian_rating_sql()
    assert PRIOR_VOTES == 250
    for query, _ in queries:
        assert f"ORDER BY {weighted} DESC NULLS LAST" in query
        assert "f.rating_count DESC NULLS LAST" in query
        selected_columns = query.split("FROM fragrances f", 1)[0]
        assert "f.rating_value" in selected_columns
        assert "f.rating_count" in selected_columns  # Displayed ratings remain raw.


def test_lowest_rating_and_minimum_rating_keep_raw_rating(monkeypatch):
    queries = _capture_queries(monkeypatch)
    fragrance_service.search_fragrances(sort_by="rating", order="asc", min_rating=4)
    discovery_service.search_database(
        DiscoveryPreferences(min_rating=4), sort_by="rating", order="asc",
    )
    assert bayesian_rating_sql() not in queries[0][0]
    assert bayesian_rating_sql() not in queries[1][0]
    assert "rating_value >= :min_rating" in queries[0][0]
    assert "f.rating_value >= :min_rating" in queries[1][0]
