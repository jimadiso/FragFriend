from typing import Literal

from pydantic import BaseModel, Field


class FragranceSummary(BaseModel):
    id: int
    perfume: str
    brand: str
    country: str | None
    gender: str | None
    rating_value: float | None
    rating_count: int | None
    year: int | None = None
    image_url: str | None = None


class FragranceSearchResult(FragranceSummary):
    mainaccord1: str | None
    mainaccord2: str | None = None
    mainaccord3: str | None = None
    mainaccord4: str | None = None
    mainaccord5: str | None = None


class BrandSearchResult(BaseModel):
    brand: str
    fragrance_count: int
    average_rating: float | None = None


class FragranceCountResult(BaseModel):
    total: int


class FragranceDetail(FragranceSearchResult):
    url: str | None
    flat_notes: str | None = None
    top_notes: str | None
    middle_notes: str | None
    base_notes: str | None
    perfumer1: str | None
    perfumer2: str | None = None


class DiscoveryRequest(BaseModel):
    request: str = Field(min_length=3, max_length=600)


class DiscoveryMoreRequest(BaseModel):
    preferences: "DiscoveryPreferences"
    offset: int = Field(default=0, ge=0)
    limit: int = Field(default=8, ge=1, le=50)
    name: str = Field(default="", max_length=200)
    max_rating: float | None = Field(default=None, ge=0, le=5)
    sort_by: Literal["rating", "year", "popularity"] = "rating"
    order: Literal["asc", "desc"] = "desc"


class DiscoveryPreferences(BaseModel):
    brand: str | None = Field(default=None, max_length=100)
    gender: Literal["Women", "Men", "Unisex"] | None = None
    notes: list[str] = Field(default_factory=list, max_length=5)
    accords: list[str] = Field(default_factory=list, max_length=5)
    required_terms: list[str] = Field(default_factory=list, max_length=5)
    or_groups: list[list[str]] = Field(default_factory=list, max_length=3)
    preferred_accords: list[str] = Field(default_factory=list, max_length=5)
    exclude_notes: list[str] = Field(default_factory=list, max_length=5)
    exclude_accords: list[str] = Field(default_factory=list, max_length=5)
    context: Literal["office", "beach", "date_night", "gym", "formal_event", "everyday", "other"] | None = None
    season: Literal["winter", "spring", "summer", "autumn"] | None = None
    time_of_day: Literal["day", "night"] | None = None
    occasion: str | None = Field(default=None, max_length=80)
    min_rating: float | None = Field(default=None, ge=0, le=5)
    min_votes: int | None = Field(default=None, ge=0)
    prefer_popular: bool = False
    year_from: int | None = Field(default=None, ge=1700, le=2027)
    year_to: int | None = Field(default=None, ge=1700, le=2027)
    needs_follow_up: bool = False
    follow_up_question: str | None = Field(default=None, max_length=180)


class DiscoveryMatch(BaseModel):
    fragrance: FragranceSearchResult
    why_matched: list[str]


class DiscoveryResponse(BaseModel):
    total: int = 0
    preferences: DiscoveryPreferences
    follow_up_question: str | None = None
    matches: list[DiscoveryMatch] = Field(default_factory=list)
    message: str | None = None
