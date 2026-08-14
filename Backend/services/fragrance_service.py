from sqlalchemy import text
from Backend.database import engine


def search_brands(
    name: str = None,
    limit: int = 8,
    offset: int = 0,
):
    query = """
        SELECT
            MIN(brand) AS brand,
            COUNT(*) AS fragrance_count,
            ROUND(AVG(rating_value)::numeric, 2)::float
                AS average_rating
        FROM fragrances
        WHERE brand IS NOT NULL
          AND TRIM(brand) != ''
    """

    params = {
        "limit": limit,
        "offset": offset,
    }

    if name:
        query += " AND brand ILIKE :name"
        params["name"] = f"%{name}%"

    query += """
        GROUP BY LOWER(brand)
        ORDER BY fragrance_count DESC, MIN(brand) ASC
        LIMIT :limit
        OFFSET :offset
    """

    with engine.connect() as conn:
        result = conn.execute(text(query), params)
        return [dict(row._mapping) for row in result]


def search_fragrances(
    name: str = None,
    brand: str = None,
    country: str = None,
    gender: str = None,
    accord: list[str] | None = None,
    note: list[str] | None = None,
    order: str = 'asc',
    sort_by: str = None,
    min_rating: float = None,
    max_rating: float = None,
    year_from: int = None,
    year_to: int = None,
    min_vote: int = None,
    max_vote: int = None,
    limit: int = 20,
    offset: int = 0
):
    query = """
        SELECT id, perfume, brand, country, gender, rating_value, rating_count, year, image_url,
               mainaccord1, mainaccord2, mainaccord3, mainaccord4, mainaccord5
        FROM fragrances
        WHERE 1=1
    """

    params = {"limit": limit, "offset": offset}

    allowed_sort_columns = {
    "rating": "rating_value",
    "popularity": "rating_count",
    "year": "year",
    "brand": "brand",
    "country": "country",
    "name": "perfume" 
    }

    if name:
        query += " AND perfume ILIKE :name"
        params["name"] = f"%{name}%"

    if brand:
        query += " AND brand ILIKE :brand"
        params["brand"] = f"%{brand}%"

    if country:
        query += " AND country ILIKE :country"
        params["country"] = f"%{country}%"

    if gender:
        query += " AND LOWER(gender) = LOWER(:gender)"
        params["gender"] = gender


    for index, accord_value in enumerate(accord or []):
        cleaned_accord = accord_value.strip()

        if not cleaned_accord:
            continue

        parameter_name = f"accord_{index}"

        query += f"""
            AND (
                mainaccord1 ILIKE :{parameter_name} OR
                mainaccord2 ILIKE :{parameter_name} OR
                mainaccord3 ILIKE :{parameter_name} OR
                mainaccord4 ILIKE :{parameter_name} OR
                mainaccord5 ILIKE :{parameter_name}
            )
        """

        params[parameter_name] = f"%{cleaned_accord}%"

    for index, note_value in enumerate(note or []):
        cleaned_note = note_value.strip()

        if not cleaned_note:
            continue

        parameter_name = f"note_{index}"

        query += f"""
            AND (
                top_notes ILIKE :{parameter_name} OR
                middle_notes ILIKE :{parameter_name} OR
                base_notes ILIKE :{parameter_name}
            )
        """

        params[parameter_name] = f"%{cleaned_note}%"
    
    if min_rating is not None:
        query += " AND rating_value >= :min_rating"
        params["min_rating"] = min_rating

    if max_rating is not None:
        query += " AND rating_value <= :max_rating"
        params["max_rating"] = max_rating
    
    if year_from is not None:
        query += " AND year >= :year_from"
        params["year_from"] = year_from
    
    if year_to is not None:
        query += " AND year <= :year_to"
        params["year_to"] = year_to
    
    if min_vote is not None:
        query += " AND rating_count >= :min_vote"
        params["min_vote"] = min_vote
    
    if max_vote is not None:
        query += " AND rating_count <= :max_vote"
        params["max_vote"] = max_vote
    
    if sort_by:
        column = allowed_sort_columns.get(sort_by.lower())
        if column:
            if order.lower() not in ('asc','desc'):
                order = 'asc'
            
            query += f" ORDER BY {column} {order.upper()} NULLS LAST"
    

    query += " LIMIT :limit OFFSET :offset"

    with engine.connect() as conn:
        result = conn.execute(text(query), params)
        return [dict(row._mapping) for row in result]

def count_fragrances(
    name: str = None,
    brand: str = None,
    country: str = None,
    gender: str = None,
    accord: list[str] | None = None,
    note: list[str] | None = None,
    min_rating: float = None,
    max_rating: float = None,
    year_from: int = None,
    year_to: int = None,
    min_vote: int = None,
    max_vote: int = None,
):
    query = """
        SELECT COUNT(*) AS total
        FROM fragrances
        WHERE 1=1
    """

    params = {}

    if name:
        query += " AND perfume ILIKE :name"
        params["name"] = f"%{name}%"

    if brand:
        query += " AND brand ILIKE :brand"
        params["brand"] = f"%{brand}%"

    if country:
        query += " AND country ILIKE :country"
        params["country"] = f"%{country}%"

    if gender:
        query += " AND LOWER(gender) = LOWER(:gender)"
        params["gender"] = gender

    for index, accord_value in enumerate(accord or []):
        cleaned_accord = accord_value.strip()

        if not cleaned_accord:
            continue

        parameter_name = f"accord_{index}"

        query += f"""
            AND (
                mainaccord1 ILIKE :{parameter_name} OR
                mainaccord2 ILIKE :{parameter_name} OR
                mainaccord3 ILIKE :{parameter_name} OR
                mainaccord4 ILIKE :{parameter_name} OR
                mainaccord5 ILIKE :{parameter_name}
            )
        """

        params[parameter_name] = f"%{cleaned_accord}%"

    for index, note_value in enumerate(note or []):
        cleaned_note = note_value.strip()

        if not cleaned_note:
            continue

        parameter_name = f"note_{index}"

        query += f"""
            AND (
                top_notes ILIKE :{parameter_name} OR
                middle_notes ILIKE :{parameter_name} OR
                base_notes ILIKE :{parameter_name}
            )
        """

        params[parameter_name] = f"%{cleaned_note}%"

    if min_rating is not None:
        query += " AND rating_value >= :min_rating"
        params["min_rating"] = min_rating

    if max_rating is not None:
        query += " AND rating_value <= :max_rating"
        params["max_rating"] = max_rating

    if year_from is not None:
        query += " AND year >= :year_from"
        params["year_from"] = year_from

    if year_to is not None:
        query += " AND year <= :year_to"
        params["year_to"] = year_to

    if min_vote is not None:
        query += " AND rating_count >= :min_vote"
        params["min_vote"] = min_vote

    if max_vote is not None:
        query += " AND rating_count <= :max_vote"
        params["max_vote"] = max_vote

    with engine.connect() as conn:
        total = conn.execute(text(query), params).scalar_one()
        return {"total": total}

def get_filter_options(
    option_type: str,
    query: str = "",
    limit: int = 12,
):
    params = {
        "query": f"%{query.strip()}%",
        "limit": limit,
    }

    if option_type == "accords":
        sql = """
            SELECT value
            FROM (
                SELECT TRIM(mainaccord1) AS value FROM fragrances
                UNION
                SELECT TRIM(mainaccord2) AS value FROM fragrances
                UNION
                SELECT TRIM(mainaccord3) AS value FROM fragrances
                UNION
                SELECT TRIM(mainaccord4) AS value FROM fragrances
                UNION
                SELECT TRIM(mainaccord5) AS value FROM fragrances
            ) AS accord_options
            WHERE value IS NOT NULL
              AND value != ''
              AND value ILIKE :query
            ORDER BY value
            LIMIT :limit
        """
    elif option_type == "notes":
        sql = """
            SELECT DISTINCT TRIM(note_value) AS value
            FROM fragrances
            CROSS JOIN LATERAL unnest(
                string_to_array(
                    concat_ws(',', top_notes, middle_notes, base_notes),
                    ','
                )
            ) AS note_value
            WHERE TRIM(note_value) != ''
              AND TRIM(note_value) ILIKE :query
            ORDER BY value
            LIMIT :limit
        """
    else:
        return []

    with engine.connect() as conn:
        result = conn.execute(text(sql), params)

        return [
            row._mapping["value"]
            for row in result
        ]

def get_fragrance_by_id(fragrance_id: int):
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                SELECT *
                FROM fragrances
                WHERE id = :fragrance_id
            """),
            {"fragrance_id": fragrance_id}
        )

        row = result.fetchone()

        if row is None:
            return None

        return dict(row._mapping)

def get_fragrances(limit: int = 20, offset: int = 0):
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                SELECT id, perfume, brand, country, gender, image_url,
                       rating_value, rating_count, year
                FROM fragrances
                LIMIT :limit
                OFFSET :offset
            """),
            {
                "limit": limit,
                "offset": offset
            }
        )

        return [dict(row._mapping) for row in result]