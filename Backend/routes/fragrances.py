from typing import Literal
from collections import defaultdict, deque
from time import monotonic

from fastapi import APIRouter, HTTPException, Query, Request

from Backend.models.fragrance import (
    FragranceDetail,
    FragranceSearchResult,
    FragranceSummary,
    BrandSearchResult,
    FragranceCountResult,
    DiscoveryRequest,
    DiscoveryMoreRequest,
    DiscoveryResponse,
)
from Backend.services import discovery_service, fragrance_service

router = APIRouter(
    prefix="/fragrances",
    tags=["Fragrances"]
)

DISCOVERY_RATE_LIMIT = 8
DISCOVERY_RATE_WINDOW_SECONDS = 60
_discovery_attempts: dict[str, deque[float]] = defaultdict(deque)


def _allow_uncached_discovery(client_id: str) -> bool:
    now = monotonic()
    attempts = _discovery_attempts[client_id]
    while attempts and attempts[0] <= now - DISCOVERY_RATE_WINDOW_SECONDS:
        attempts.popleft()
    if len(attempts) >= DISCOVERY_RATE_LIMIT:
        return False
    attempts.append(now)
    return True


@router.post("/discover", response_model=DiscoveryResponse)
def discover_fragrances(payload: DiscoveryRequest, request: Request):
    preferences = discovery_service.get_cached_preferences(payload.request)
    if preferences is None:
        client_id = request.client.host if request.client else "unknown"
        if not _allow_uncached_discovery(client_id):
            raise HTTPException(
                status_code=429,
                detail="Too many discovery requests. Please wait a minute before trying again.",
            )
        try:
            preferences = discovery_service.extract_preferences(payload.request)
        except RuntimeError as error:
            raise HTTPException(status_code=503, detail=str(error)) from error
        discovery_service.cache_preferences(payload.request, preferences)

    if discovery_service.needs_follow_up(preferences):
        return DiscoveryResponse(
            preferences=preferences,
            follow_up_question=preferences.follow_up_question or discovery_service.FOLLOW_UP,
        )

    matches = discovery_service.search_database(preferences)
    message = None
    if not matches:
        message = "No database fragrances matched those preferences. Try broadening a note, accord, rating, or year filter."
    return DiscoveryResponse(
        preferences=preferences,
        matches=matches,
        message=message,
    )


@router.post("/discover/more", response_model=DiscoveryResponse)
def discover_more_fragrances(payload: DiscoveryMoreRequest):
    if payload.preferences.min_rating is not None and payload.max_rating is not None and payload.preferences.min_rating > payload.max_rating:
        raise HTTPException(status_code=422, detail="Minimum rating exceeds maximum rating.")
    if payload.preferences.year_from is not None and payload.preferences.year_to is not None and payload.preferences.year_from > payload.preferences.year_to:
        raise HTTPException(status_code=422, detail="Starting year exceeds ending year.")
    options = dict(limit=payload.limit, offset=payload.offset, name=payload.name,
                   max_rating=payload.max_rating, sort_by=payload.sort_by, order=payload.order)
    matches = discovery_service.search_database(
        payload.preferences,
        **options,
    )
    return DiscoveryResponse(
        preferences=payload.preferences,
        matches=matches,
        total=discovery_service.search_database(payload.preferences, count_only=True, **options),
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


def _validate_brand_filter_ranges(
    min_rating: float | None,
    max_rating: float | None,
    year_from: int | None,
    year_to: int | None,
    min_vote: int | None,
    max_vote: int | None,
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


@router.get("/brands/search", response_model=list[BrandSearchResult])
def search_brands(
    name: str | None = None,
    gender: str | None = None,
    accord: list[str] = Query(default=[]),
    note: list[str] = Query(default=[]),
    min_rating: float | None = Query(None, ge=0, le=5),
    max_rating: float | None = Query(None, ge=0, le=5),
    year_from: int | None = Query(None, ge=1700, le=2027),
    year_to: int | None = Query(None, ge=1700, le=2027),
    min_vote: int | None = Query(None, ge=0),
    max_vote: int | None = Query(None, ge=0),
    sort_by: Literal["count", "rating", "name"] = "count",
    order: Literal["asc", "desc"] = "desc",
    limit: int = Query(8, ge=1, le=50),
    offset: int = Query(0, ge=0),
):
    _validate_brand_filter_ranges(
        min_rating=min_rating,
        max_rating=max_rating,
        year_from=year_from,
        year_to=year_to,
        min_vote=min_vote,
        max_vote=max_vote,
    )

    return fragrance_service.search_brands(
        name=name,
        gender=gender,
        accord=accord,
        note=note,
        min_rating=min_rating,
        max_rating=max_rating,
        year_from=year_from,
        year_to=year_to,
        min_vote=min_vote,
        max_vote=max_vote,
        sort_by=sort_by,
        order=order,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/brands/search/count",
    response_model=FragranceCountResult,
)
def count_brands(
    name: str | None = None,
    gender: str | None = None,
    accord: list[str] = Query(default=[]),
    note: list[str] = Query(default=[]),
    min_rating: float | None = Query(None, ge=0, le=5),
    max_rating: float | None = Query(None, ge=0, le=5),
    year_from: int | None = Query(None, ge=1700, le=2027),
    year_to: int | None = Query(None, ge=1700, le=2027),
    min_vote: int | None = Query(None, ge=0),
    max_vote: int | None = Query(None, ge=0),
    sort_by: Literal["count", "rating", "name"] = "count",
):
    _validate_brand_filter_ranges(
        min_rating=min_rating,
        max_rating=max_rating,
        year_from=year_from,
        year_to=year_to,
        min_vote=min_vote,
        max_vote=max_vote,
    )

    return fragrance_service.count_brands(
        name=name,
        gender=gender,
        accord=accord,
        note=note,
        min_rating=min_rating,
        max_rating=max_rating,
        year_from=year_from,
        year_to=year_to,
        min_vote=min_vote,
        max_vote=max_vote,
        sort_by=sort_by,
    )

@router.get("/search", response_model=list[FragranceSearchResult])
def search_fragrances(
    name: str = None,
    brand: str = None,
    country: str = None,
    gender: str = None,
    accord: list[str] = Query(default=[]),
    note: list[str] = Query(default=[]),
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
    season: Literal["winter", "spring", "summer", "autumn"] | None = None,
    time_of_day: Literal["day", "night"] | None = None,
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
        season=season,
        time_of_day=time_of_day,
        order=order,
        limit=limit,
        offset=offset
    )

@router.get("/search/count", response_model=FragranceCountResult)
def count_fragrances(
    name: str = None,
    brand: str = None,
    country: str = None,
    gender: str = None,
    accord: list[str] = Query(default=[]),
    note: list[str] = Query(default=[]),
    min_rating: float | None = Query(None, ge=0, le=5),
    max_rating: float | None = Query(None, ge=0, le=5),
    year_from: int | None = Query(None, ge=1700, le=2027),
    year_to: int | None = Query(None, ge=1700, le=2027),
    min_vote: int | None = Query(None, ge=0),
    max_vote: int | None = Query(None, ge=0),
    season: Literal["winter", "spring", "summer", "autumn"] | None = None,
    time_of_day: Literal["day", "night"] | None = None,
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

    return fragrance_service.count_fragrances(
        name=name,
        brand=brand,
        country=country,
        gender=gender,
        accord=accord,
        note=note,
        min_rating=min_rating,
        max_rating=max_rating,
        year_from=year_from,
        year_to=year_to,
        min_vote=min_vote,
        max_vote=max_vote,
        season=season,
        time_of_day=time_of_day,
    )

@router.get(
    "/filter-options/{option_type}",
    response_model=list[str],
)
def get_filter_options(
    option_type: Literal["accords", "notes"],
    query: str = "",
    limit: int = Query(12, ge=1, le=50),
):
    return fragrance_service.get_filter_options(
        option_type=option_type,
        query=query,
        limit=limit,
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
