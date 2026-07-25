from fastapi import APIRouter
from Backend.services import fragrance_service

router = APIRouter(
    prefix="/fragrances",
    tags=["Fragrances"]
)

@router.get("/")
def get_fragrances(
    limit: int = 20,
    offset: int = 0
):
    return fragrance_service.get_fragrances(
        limit=limit,
        offset=offset
    )


@router.get("/search")
def search_fragrances(
    brand: str = None,
    country: str = None,
    gender: str = None,
    accord: str = None,
    sort_by: str = None,
    min_rating: float = None,
    max_rating: float = None,
    year_from: int = None,
    year_to: int = None,
    min_vote: int = None,
    max_vote: int = None,
    order: str = 'asc',
    limit: int = 20,
    offset: int = 0
):
    return fragrance_service.search_fragrances(
        brand=brand,
        country=country,
        gender=gender,
        accord=accord,
        sort_by=sort_by,
        min_rating=min_rating,
        max_rating=max_rating,
        year_from=year_from,
        year_to=year_to,
        min_vote=min_vote,
        max_vote=max_vote,
        order=order,
        limit=limit,
        offset=offset
    )

@router.get("/{fragrance_id}")
def get_fragrance_by_id(fragrance_id: int):
    return fragrance_service.get_fragrance_by_id(fragrance_id)