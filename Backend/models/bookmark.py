from pydantic import BaseModel


class BookmarkStatus(BaseModel):
    fragrance_id: int
    bookmarked: bool