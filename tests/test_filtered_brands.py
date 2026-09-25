from fastapi.testclient import TestClient
from Backend.main import app
from Backend.models.fragrance import DiscoveryPreferences
from Backend.services import discovery_service


def test_brand_rows_and_count_share_all_applied_filters(monkeypatch):
    calls = []

    class Connection:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def execute(self, statement, params):
            calls.append((str(statement), dict(params)))
            return type('Result', (), {'__iter__': lambda self: iter([]), 'scalar_one': lambda self: 0})()

    monkeypatch.setattr(discovery_service.engine, 'connect', lambda: Connection())
    filters = DiscoveryPreferences(season='summer', time_of_day='day', notes=['vanilla'], context='office', gender='Men')
    for count in (False, True):
        discovery_service.search_database(filters, name='Dior', max_rating=4.5, group_by_brand=True, count_only=count)
    for query, params in calls:
        assert 'f.brand ILIKE :name' in query
        assert 'f.perfume ILIKE' not in query
        assert "m.attributes -> 'seasons'" in query
        assert "m.attributes -> 'daypart'" in query
        assert 'f.rating_value <= :max_rating' in query
        assert params['season'] == 'summer'
        assert params['time_of_day'] == 'day'
        assert params['gender'] == 'Men'
        assert params['max_rating'] == 4.5
        assert any(key.startswith('exclude_accord') for key in params)
        assert params['note_0']
    assert 'GROUP BY f.brand' in calls[0][0]
    assert 'count(DISTINCT f.brand)' in calls[1][0]


def test_brand_filter_endpoint_validates_and_counts_without_ai(monkeypatch):
    calls = []
    def search(preferences, **options):
        calls.append((preferences, options))
        return 1 if options.get('count_only') else [{'brand': 'Example', 'fragrance_count': 2, 'average_rating': 4}]
    monkeypatch.setattr(discovery_service, 'search_database', search)
    client = TestClient(app)
    result = client.post('/fragrances/discover/brands', json={'preferences': {'season': 'summer'}, 'sort_by': 'name', 'order': 'asc'})
    assert result.status_code == 200
    assert result.json()['total'] == 1
    assert len(calls) == 2
    assert all(preferences.season == 'summer' for preferences, _ in calls)
    assert all(options['group_by_brand'] for _, options in calls)
    invalid = client.post('/fragrances/discover/brands', json={'preferences': {'min_rating': 4}, 'max_rating': 3})
    assert invalid.status_code == 422
