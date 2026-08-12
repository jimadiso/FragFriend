from pydantic import BaseModel


class FragranceSummary(BaseModel):
    id: int
    perfume: str
    brand: str
    country: str
    gender: str
    rating_value: float
    rating_count: int
    year: int | None = None
    image_url: str | None = None


class FragranceSearchResult(FragranceSummary):
    mainaccord1: str
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
    url: str
    top_notes: str
    middle_notes: str
    base_notes: str
    perfumer1: str
    perfumer2: str | None = None
