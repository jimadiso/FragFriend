from sqlalchemy import text
from Backend.database import engine

def search_fragrances(
    brand: str = None,
    country: str = None,
    gender: str = None,
    accord: str = None,
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
        SELECT id, perfume, brand, country, gender, rating_value, rating_count, year,
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

    if brand:
        query += " AND brand ILIKE :brand"
        params["brand"] = f"%{brand}%"

    if country:
        query += " AND country ILIKE :country"
        params["country"] = f"%{country}%"

    if gender:
        query += " AND gender ILIKE :gender"
        params["gender"] = f"%{gender}%"


    if accord:
        query += """
            AND (
                mainaccord1 ILIKE :accord OR
                mainaccord2 ILIKE :accord OR
                mainaccord3 ILIKE :accord OR
                mainaccord4 ILIKE :accord OR
                mainaccord5 ILIKE :accord
            )
        """
        params["accord"] = f"%{accord}%"
    
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
            
            query += f" ORDER BY {column} {order.upper()}"
    

    query += " LIMIT :limit OFFSET :offset"

    with engine.connect() as conn:
        result = conn.execute(text(query), params)
        return [dict(row._mapping) for row in result]

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
                SELECT id, perfume, brand, country, gender,
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