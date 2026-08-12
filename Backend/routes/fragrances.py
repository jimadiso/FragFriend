from typing import Literal

from fastapi import APIRouter, HTTPException, Query

from Backend.models.fragrance import (
    FragranceDetail,
    FragranceSearchResult,
    FragranceSummary,
    BrandSearchResult,
)
from Backend.services import fragrance_service

router = APIRouter(
    prefix="/fragrances",
    tags=["Fragrances"]
)

@router.get("/", response_model=list[FragranceSummary])
def get_fragrances(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0)
):
    return fragrance_service.get_fragrances(
        limit=limit,
        offset=offset
    )


@router.get("/brands/search", response_model=list[BrandSearchResult])
def search_brands(
    name: str | None = None,
    limit: int = Query(8, ge=1, le=50),
    offset: int = Query(0, ge=0),
):
    return fragrance_service.search_brands(
        name=name,
        limit=limit,
        offset=offset,
    )

@router.get("/search", response_model=list[FragranceSearchResult])
def search_fragrances(
    name: str = None,
    brand: str = None,
    country: str = None,
    gender: str = None,
    accord: str = None,
    note: str = None,
    sort_by: Literal[
    "rating",
    "popularity",
    "year",
    "brand",
    "country",
    "name",
    ] | None = None,
    min_rating: float | None = Query(None, ge=0, le=5),
    max_rating: float | None = Query(None, ge=0, le=5),
    year_from: int | None = Query(None, ge=1700, le=2027),
    year_to: int | None = Query(None, ge=1700, le=2027),
    min_vote: int | None = Query(None, ge=0),
    max_vote: int | None = Query(None, ge=0),
    order: Literal['asc', 'desc'] = 'asc',
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0)   
):
    if (
        min_rating is not None
        and max_rating is not None
        and min_rating > max_rating
    ):
        raise HTTPException(
            status_code=422,
            detail="min_rating cannot be greater than max_rating",
        )

    if (
        year_from is not None
        and year_to is not None
        and year_from > year_to
    ):
        raise HTTPException(
            status_code=422,
            detail="year_from cannot be greater than year_to",
        )

    if (
        min_vote is not None
        and max_vote is not None
        and min_vote > max_vote
    ):
        raise HTTPException(
            status_code=422,
            detail="min_vote cannot be greater than max_vote",
        )

    return fragrance_service.search_fragrances(
        name=name,
        brand=brand,
        country=country,
        gender=gender,
        accord=accord,
        note=note,
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

@router.get("/{fragrance_id}", response_model=FragranceDetail)
def get_fragrance_by_id(fragrance_id: int):
    fragrance = fragrance_service.get_fragrance_by_id(fragrance_id)

    if fragrance is None:
        raise HTTPException(
            status_code=404,
            detail="Fragrance not found",
        )

    return fragrance
