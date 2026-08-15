from sqlalchemy import text

from Backend.database import engine


def fragrance_exists(fragrance_id: int) -> bool:
    sql = """
        SELECT EXISTS (
            SELECT 1
            FROM fragrances
            WHERE id = :fragrance_id
        )
    """

    with engine.connect() as connection:
        result = connection.execute(
            text(sql),
            {"fragrance_id": fragrance_id},
        )

        return bool(result.scalar_one())


def add_bookmark(
    user_id: int,
    fragrance_id: int,
) -> bool:
    if not fragrance_exists(fragrance_id):
        return False

    sql = """
        INSERT INTO bookmarks (
            user_id,
            fragrance_id
        )
        VALUES (
            :user_id,
            :fragrance_id
        )
        ON CONFLICT (user_id, fragrance_id)
        DO NOTHING
    """

    with engine.begin() as connection:
        connection.execute(
            text(sql),
            {
                "user_id": user_id,
                "fragrance_id": fragrance_id,
            },
        )

    return True


def remove_bookmark(
    user_id: int,
    fragrance_id: int,
) -> bool:
    sql = """
        DELETE FROM bookmarks
        WHERE user_id = :user_id
          AND fragrance_id = :fragrance_id
    """

    with engine.begin() as connection:
        result = connection.execute(
            text(sql),
            {
                "user_id": user_id,
                "fragrance_id": fragrance_id,
            },
        )

        return result.rowcount > 0


def is_bookmarked(
    user_id: int,
    fragrance_id: int,
) -> bool:
    sql = """
        SELECT EXISTS (
            SELECT 1
            FROM bookmarks
            WHERE user_id = :user_id
              AND fragrance_id = :fragrance_id
        )
    """

    with engine.connect() as connection:
        result = connection.execute(
            text(sql),
            {
                "user_id": user_id,
                "fragrance_id": fragrance_id,
            },
        )

        return bool(result.scalar_one())


def get_bookmarks(
    user_id: int,
    limit: int,
    offset: int,
) -> list[dict]:
    sql = """
        SELECT
            fragrances.id,
            fragrances.perfume,
            fragrances.brand,
            fragrances.country,
            fragrances.gender,
            fragrances.rating_value,
            fragrances.rating_count,
            fragrances.year,
            fragrances.image_url
        FROM bookmarks
        JOIN fragrances
          ON fragrances.id = bookmarks.fragrance_id
        WHERE bookmarks.user_id = :user_id
        ORDER BY bookmarks.created_at DESC
        LIMIT :limit
        OFFSET :offset
    """

    with engine.connect() as connection:
        result = connection.execute(
            text(sql),
            {
                "user_id": user_id,
                "limit": limit,
                "offset": offset,
            },
        )

        return [
            dict(row._mapping)
            for row in result
        ]