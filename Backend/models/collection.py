from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, StringConstraints

from Backend.models.fragrance import FragranceSummary


CollectionName = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=1,
        max_length=80,
    ),
]

CollectionDescription = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        max_length=240,
    ),
]


class CollectionCreate(BaseModel):
    name: CollectionName
    description: CollectionDescription | None = None


class CollectionSummary(BaseModel):
    id: int
    name: str
    description: str | None
    fragrance_count: int
    created_at: datetime


class CollectionDetail(CollectionSummary):
    fragrances: list[FragranceSummary]


class CollectionMembership(BaseModel):
    collection_id: int
    fragrance_id: int
    included: bool