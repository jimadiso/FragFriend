from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text

from Backend.database import engine
from Backend.routes.auth import get_current_user

router = APIRouter(prefix="/ratings", tags=["Ratings"])


class RatingInput(BaseModel):
    rating: float = Field(ge=0.5, le=5, multiple_of=0.5)


def summary(connection, fragrance_id):
    row = connection.execute(text(
        "SELECT AVG(rating) AS average, COUNT(*) AS count FROM fragrance_ratings WHERE fragrance_id = :id"
    ), {"id": fragrance_id}).mappings().one()
    return dict(row)


def require_fragrance(connection, fragrance_id):
    if connection.execute(text("SELECT id FROM fragrances WHERE id = :id"), {"id": fragrance_id}).first() is None:
        raise HTTPException(404, "Fragrance not found")


@router.get("/{fragrance_id}")
def read_rating(fragrance_id: int):
    with engine.connect() as connection:
        require_fragrance(connection, fragrance_id)
        return summary(connection, fragrance_id)


@router.get("/{fragrance_id}/mine")
def read_my_rating(fragrance_id: int, user: dict = Depends(get_current_user)):
    with engine.connect() as connection:
        require_fragrance(connection, fragrance_id)
        rating = connection.execute(text(
            "SELECT rating FROM fragrance_ratings WHERE fragrance_id = :id AND user_id = :user"
        ), {"id": fragrance_id, "user": user["id"]}).scalar_one_or_none()
        return {"rating": rating}


@router.post("/{fragrance_id}")
def submit_rating(fragrance_id: int, payload: RatingInput, user: dict = Depends(get_current_user)):
    with engine.begin() as connection:
        require_fragrance(connection, fragrance_id)
        connection.execute(text("""
            INSERT INTO fragrance_ratings (user_id, fragrance_id, rating)
            VALUES (:user, :id, :rating)
            ON CONFLICT (user_id, fragrance_id) DO UPDATE
            SET rating = EXCLUDED.rating, updated_at = CURRENT_TIMESTAMP
        """), {"id": fragrance_id, "user": user["id"], "rating": payload.rating})
        return {**summary(connection, fragrance_id), "rating": payload.rating}
