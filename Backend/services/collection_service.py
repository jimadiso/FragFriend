from sqlalchemy import text

from Backend.database import engine


def get_collections(user_id: int) -> list[dict]:
    sql = """
        SELECT
            fragrance_collections.id,
            fragrance_collections.name,
            fragrance_collections.description,
            CAST(
                COUNT(collection_fragrances.fragrance_id)
                AS INTEGER
            ) AS fragrance_count,
            fragrance_collections.created_at
        FROM fragrance_collections
        LEFT JOIN collection_fragrances
          ON collection_fragrances.collection_id =
             fragrance_collections.id
        WHERE fragrance_collections.user_id = :user_id
        GROUP BY fragrance_collections.id
        ORDER BY fragrance_collections.created_at DESC
    """

    with engine.connect() as connection:
        result = connection.execute(
            text(sql),
            {"user_id": user_id},
        )

        return [
            dict(row._mapping)
            for row in result
        ]


def create_collection(
    user_id: int,
    name: str,
    description: str | None,
) -> dict | None:
    sql = """
        INSERT INTO fragrance_collections (
            user_id,
            name,
            description
        )
        VALUES (
            :user_id,
            :name,
            :description
        )
        ON CONFLICT DO NOTHING
        RETURNING
            id,
            name,
            description,
            created_at
    """

    with engine.begin() as connection:
        result = connection.execute(
            text(sql),
            {
                "user_id": user_id,
                "name": name,
                "description": description,
            },
        )

        row = result.mappings().one_or_none()

    if row is None:
        return None

    collection = dict(row)
    collection["fragrance_count"] = 0
    return collection

def collection_belongs_to_user(
    user_id: int,
    collection_id: int,
) -> bool:
    sql = """
        SELECT EXISTS (
            SELECT 1
            FROM fragrance_collections
            WHERE id = :collection_id
              AND user_id = :user_id
        )
    """

    with engine.connect() as connection:
        result = connection.execute(
            text(sql),
            {
                "user_id": user_id,
                "collection_id": collection_id,
            },
        )

        return bool(result.scalar_one())


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


def get_collection(
    user_id: int,
    collection_id: int,
) -> dict | None:
    collection_sql = """
        SELECT
            fragrance_collections.id,
            fragrance_collections.name,
            fragrance_collections.description,
            CAST(
                COUNT(collection_fragrances.fragrance_id)
                AS INTEGER
            ) AS fragrance_count,
            fragrance_collections.created_at
        FROM fragrance_collections
        LEFT JOIN collection_fragrances
          ON collection_fragrances.collection_id =
             fragrance_collections.id
        WHERE fragrance_collections.id = :collection_id
          AND fragrance_collections.user_id = :user_id
        GROUP BY fragrance_collections.id
    """

    fragrances_sql = """
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
        FROM collection_fragrances
        JOIN fragrances
          ON fragrances.id =
             collection_fragrances.fragrance_id
        JOIN fragrance_collections
          ON fragrance_collections.id =
             collection_fragrances.collection_id
        WHERE collection_fragrances.collection_id =
              :collection_id
          AND fragrance_collections.user_id = :user_id
        ORDER BY collection_fragrances.created_at DESC
    """

    with engine.connect() as connection:
        collection_result = connection.execute(
            text(collection_sql),
            {
                "user_id": user_id,
                "collection_id": collection_id,
            },
        )

        collection_row = (
            collection_result.mappings().one_or_none()
        )

        if collection_row is None:
            return None

        fragrance_result = connection.execute(
            text(fragrances_sql),
            {
                "user_id": user_id,
                "collection_id": collection_id,
            },
        )

        fragrances = [
            dict(row)
            for row in fragrance_result.mappings()
        ]

    collection = dict(collection_row)
    collection["fragrances"] = fragrances
    return collection


def add_fragrance_to_collection(
    user_id: int,
    collection_id: int,
    fragrance_id: int,
) -> dict | None:
    if not collection_belongs_to_user(
        user_id=user_id,
        collection_id=collection_id,
    ):
        return None

    if not fragrance_exists(fragrance_id):
        return None

    bookmark_sql = """
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

    collection_sql = """
        INSERT INTO collection_fragrances (
            collection_id,
            fragrance_id
        )
        VALUES (
            :collection_id,
            :fragrance_id
        )
        ON CONFLICT (collection_id, fragrance_id)
        DO NOTHING
    """

    with engine.begin() as connection:
        connection.execute(
            text(bookmark_sql),
            {
                "user_id": user_id,
                "fragrance_id": fragrance_id,
            },
        )
        connection.execute(
            text(collection_sql),
            {
                "collection_id": collection_id,
                "fragrance_id": fragrance_id,
            },
        )

    return {
        "collection_id": collection_id,
        "fragrance_id": fragrance_id,
        "included": True,
    }


def remove_fragrance_from_collection(
    user_id: int,
    collection_id: int,
    fragrance_id: int,
) -> dict | None:
    if not collection_belongs_to_user(
        user_id=user_id,
        collection_id=collection_id,
    ):
        return None

    sql = """
        DELETE FROM collection_fragrances
        WHERE collection_id = :collection_id
          AND fragrance_id = :fragrance_id
    """

    with engine.begin() as connection:
        connection.execute(
            text(sql),
            {
                "collection_id": collection_id,
                "fragrance_id": fragrance_id,
            },
        )

    return {
        "collection_id": collection_id,
        "fragrance_id": fragrance_id,
        "included": False,
    }


def delete_collection(
    user_id: int,
    collection_id: int,
) -> bool:
    sql = """
        DELETE FROM fragrance_collections
        WHERE id = :collection_id
          AND user_id = :user_id
    """

    with engine.begin() as connection:
        result = connection.execute(
            text(sql),
            {
                "user_id": user_id,
                "collection_id": collection_id,
            },
        )

        return result.rowcount > 0