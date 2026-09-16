import importlib.util
from pathlib import Path
import sys

import pytest
from fastapi.testclient import TestClient

from Backend.main import app
from Backend.models.fragrance import FragranceDetail
from Backend.services import fragrance_service

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'Tool_Scripts'))
from merge_fragrance_import import project
from preview_fragrance_import import InputError


def incoming():
    return {'id': 100, 'name': 'Test', 'brand': 'Example',
            'url': 'https://www.fragrantica.com/perfume/Example/Test-100.html',
            'gender': 'unisex', 'year': None, 'accords': [], 'perfumers': [],
            'notes': {'flat': [{'name': 'Rose'}], 'tiered': {}},
            'rating': {'average': 1, 'histogram': [{'bucket': 4, 'count': 8}, {'bucket': 5, 'count': 2}]},
            'people': 99, 'meta': {'scraped_at': 1780102667}}


def test_preserves_identity_local_fields_and_uses_coherent_rating_votes():
    old = {'id': 7, 'year': 2000, 'country': 'France', 'image_url': '/local.jpg',
           'top_notes': 'Old top', 'middle_notes': 'Old middle', 'base_notes': 'Old base'}
    row, meta = project(incoming(), old, 7)
    assert row['id'] == 7 and meta[1] == 100
    assert row['year'] == 2000 and row['country'] == 'France'
    assert row['image_url'] == '/local.jpg'
    assert float(row['rating_value']) == 4.2 and row['rating_count'] == 10
    assert row['flat_notes'] == 'Rose'
    assert all(row[k] is None for k in ['top_notes','middle_notes','base_notes'])
    assert meta[3]['rating']['average'] == 1


def test_unknown_new_values_validate_in_api_and_remain_unknown():
    source = incoming()
    source['rating'] = {'average': None, 'histogram': []}
    row, _ = project(source, None, 8)
    detail = FragranceDetail.model_validate(row)
    assert detail.country is None and detail.rating_count is None
    assert detail.rating_value is None and detail.mainaccord1 is None


def test_missing_incoming_notes_and_rating_preserve_existing():
    source = incoming()
    source['notes'] = {}
    source['rating'] = {'average': None, 'histogram': []}
    row, _ = project(source, {'top_notes': 'Bergamot', 'rating_count': 13, 'rating_value': 3.5}, 9)
    assert row['top_notes'] == 'Bergamot'
    assert row['rating_count'] == 13 and row['rating_value'] == 3.5


def test_conflicting_note_shapes_stop_import():
    source = incoming()
    source['notes']['tiered'] = {'top': [{'name': 'Mint'}]}
    with pytest.raises(InputError, match='both flat and tiered'):
        project(source, None, 9)


def test_detail_endpoint_handles_flat_notes_and_null_country(monkeypatch):
    row, _ = project(incoming(), None, 9)
    monkeypatch.setattr(fragrance_service, 'get_fragrance_by_id', lambda fragrance_id: row)
    response = TestClient(app).get('/fragrances/9')
    assert response.status_code == 200
    assert response.json()['flat_notes'] == 'Rose'
    assert response.json()['country'] is None


def test_image_links_are_imported_and_missing_values_are_nullable():
    record = incoming()
    record.update(picture="https://fimgs.net/mdimg/perfume/375x500.100.jpg",
                  thumbnail="https://fimgs.net/mdimg/perfume/m.100.jpg")
    row, _ = project(record, None, 7)
    assert row["picture_url"] == record["picture"]
    assert row["thumbnail_url"] == record["thumbnail"]
    row, _ = project(incoming(), None, 7)
    assert row["picture_url"] is None and row["thumbnail_url"] is None
