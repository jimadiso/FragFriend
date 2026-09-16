import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.pool import StaticPool

from Backend.main import app
from Backend.routes import ratings
from Backend.routes.auth import get_current_user


@pytest.fixture
def client(monkeypatch):
    engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    with engine.begin() as connection:
        connection.execute(text('CREATE TABLE fragrances (id INTEGER PRIMARY KEY)'))
        connection.execute(text('INSERT INTO fragrances VALUES (1)'))
        connection.execute(text('CREATE TABLE fragrance_ratings (user_id INTEGER, fragrance_id INTEGER, rating NUMERIC, updated_at TEXT DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, fragrance_id))'))
    monkeypatch.setattr(ratings, 'engine', engine)
    app.dependency_overrides[get_current_user] = lambda: {'id': 7}
    yield TestClient(app)
    app.dependency_overrides.pop(get_current_user, None)
    engine.dispose()


def test_vote_update_does_not_increment_count(client):
    assert client.get('/ratings/1').json() == {'average': None, 'count': 0}
    first = client.post('/ratings/1', json={'rating': 3.5})
    assert first.status_code == 200
    assert first.json() == {'average': 3.5, 'count': 1, 'rating': 3.5}
    assert client.post('/ratings/1', json={'rating': 5}).json()['count'] == 1
    assert client.get('/ratings/1/mine').json()['rating'] == 5
    app.dependency_overrides[get_current_user] = lambda: {'id': 8}
    assert client.get('/ratings/1/mine').json()['rating'] is None
    result = client.post('/ratings/1', json={'rating': 2}).json()
    assert result['count'] == 2
    assert result['average'] == 3.5


@pytest.mark.parametrize('rating', [0, -1, 5.5, 3.2, None])
def test_invalid_ratings_rejected(client, rating):
    assert client.post('/ratings/1', json={'rating': rating}).status_code == 422
    assert client.get('/ratings/1').json()['count'] == 0


def test_guests_cannot_vote(client):
    app.dependency_overrides.pop(get_current_user)
    assert client.post('/ratings/1', json={'rating': 4}).status_code == 401
    assert client.get('/ratings/1').status_code == 200


def test_missing_fragrance(client):
    assert client.post('/ratings/999', json={'rating': 4}).status_code == 404
