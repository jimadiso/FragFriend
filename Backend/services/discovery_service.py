"""Server-side natural-language discovery backed only by FragFriend's database."""
from __future__ import annotations

import os
from pathlib import Path
from threading import Lock
from time import monotonic

from dotenv import load_dotenv
from openai import APIConnectionError, APIError, AuthenticationError, OpenAI, RateLimitError
from sqlalchemy import text

from Backend.database import engine
from Backend.models.fragrance import DiscoveryPreferences


load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

MODEL = "gpt-5.6-luna"
FOLLOW_UP = "What notes or scent style would you like, such as sweet, woody, floral, or fresh?"
PREFERENCE_CACHE_TTL_SECONDS = 300
_preference_cache: dict[str, tuple[float, DiscoveryPreferences]] = {}
_preference_cache_lock = Lock()

INSTRUCTIONS = """Extract fragrance-search preferences from the user's request.
Return only the requested schema. Do not recommend any fragrance and do not invent
database facts. Extract a brand when the user names or asks for one. Use only Women,
Men, or Unisex for gender. Extract notes and accords as short lowercase search terms.
Set prefer_popular true when the user asks for popular, widely loved, well-known,
or most reviewed fragrances. Map fall to autumn. An occasion is context only:
FragFriend has no occasion field, so never treat it as a database filter. Ask exactly
one useful follow-up only when there is no usable database preference among brand,
gender, notes, accords, season, time_of_day, minimum rating, or year range. Otherwise set
needs_follow_up false and follow_up_question null."""


def _cache_key(request: str) -> str:
    return " ".join(request.casefold().split())


def get_cached_preferences(request: str) -> DiscoveryPreferences | None:
    key = _cache_key(request)
    now = monotonic()
    with _preference_cache_lock:
        cached = _preference_cache.get(key)
        if cached is None:
            return None
        expires_at, preferences = cached
        if expires_at <= now:
            del _preference_cache[key]
            return None
        return preferences.model_copy(deep=True)


def cache_preferences(request: str, preferences: DiscoveryPreferences) -> None:
    with _preference_cache_lock:
        _preference_cache[_cache_key(request)] = (
            monotonic() + PREFERENCE_CACHE_TTL_SECONDS,
            preferences.model_copy(deep=True),
        )


def clear_preference_cache() -> None:
    with _preference_cache_lock:
        _preference_cache.clear()


def extract_preferences(request: str) -> DiscoveryPreferences:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OpenAI is not configured.")
    try:
        response = OpenAI(api_key=api_key).responses.parse(
            model=MODEL,
            instructions=INSTRUCTIONS,
            input=request,
            text_format=DiscoveryPreferences,
            max_output_tokens=300,
            reasoning={"effort": "none"},
            store=False,
        )
    except AuthenticationError as error:
        raise RuntimeError("OpenAI authentication failed. Check the local API key.") from error
    except RateLimitError as error:
        raise RuntimeError("OpenAI is temporarily rate limited. Please try again shortly.") from error
    except (APIConnectionError, APIError) as error:
        raise RuntimeError("OpenAI is unavailable right now. Please try again shortly.") from error
    if response.output_parsed is None:
        raise RuntimeError("OpenAI could not extract preferences. Please rephrase your request.")
    preferences = response.output_parsed
    if preferences.year_from and preferences.year_to and preferences.year_from > preferences.year_to:
        raise RuntimeError("The requested year range is invalid.")
    return preferences


def needs_follow_up(preferences: DiscoveryPreferences) -> bool:
    return not any((
        preferences.brand,
        preferences.gender,
        preferences.notes,
        preferences.accords,
        preferences.season,
        preferences.time_of_day,
        preferences.min_rating is not None,
        preferences.prefer_popular,
        preferences.year_from is not None,
        preferences.year_to is not None,
    ))


def _phrase_matches(value: str | None, requested: str) -> bool:
    return requested.casefold() in (value or "").casefold()


def _reasons(row: dict, preferences: DiscoveryPreferences) -> list[str]:
    reasons = []
    if preferences.brand and _phrase_matches(row["brand"], preferences.brand):
        reasons.append(f"Brand matches {row['brand']}.")
    for note in preferences.notes:
        if _phrase_matches(row["all_notes"], note):
            reasons.append(f"Lists {note} among its notes.")
    for accord in preferences.accords:
        if _phrase_matches(row["accords_all"], accord):
            reasons.append(f"Has a {accord} accord.")
    if preferences.gender and row["gender"] == preferences.gender:
        reasons.append(f"Listed for {preferences.gender.lower()}.")
    if preferences.min_rating is not None and row["rating_value"] is not None:
        reasons.append(f"Rated {float(row['rating_value']):.2f}, meeting your minimum rating.")
    if preferences.prefer_popular and row["rating_count"] is not None:
        reasons.append(f"Popular with {row['rating_count']:,} community ratings.")
    if preferences.year_from is not None and row["year"] is not None:
        reasons.append(f"Released in {row['year']}, within your requested year range.")
    if preferences.season:
        votes = row.get("season_votes") or 0
        reasons.append(f"Has {votes:,} community {preferences.season} vote{'s' if votes != 1 else ''}.")
    if preferences.time_of_day:
        votes = row.get("daypart_votes") or 0
        reasons.append(f"Has {votes:,} community {preferences.time_of_day} vote{'s' if votes != 1 else ''}.")
    return reasons


def search_database(
    preferences: DiscoveryPreferences,
    limit: int = 5,
    offset: int = 0,
) -> list[dict]:
    conditions = ["1=1"]
    params: dict[str, object] = {"limit": limit, "offset": offset}
    if preferences.brand:
        conditions.append("f.brand ILIKE :brand")
        params["brand"] = f"%{preferences.brand.strip()}%"
    if preferences.gender:
        conditions.append("f.gender = :gender")
        params["gender"] = preferences.gender
    for index, value in enumerate(preferences.notes):
        key = f"note_{index}"
        conditions.append("concat_ws(',', f.top_notes, f.middle_notes, f.base_notes, f.flat_notes) ILIKE :" + key)
        params[key] = f"%{value.strip()}%"
    for index, value in enumerate(preferences.accords):
        key = f"accord_{index}"
        conditions.append("f.accords_all ILIKE :" + key)
        params[key] = f"%{value.strip()}%"
    if preferences.min_rating is not None:
        conditions.append("f.rating_value >= :min_rating")
        params["min_rating"] = preferences.min_rating
    if preferences.year_from is not None:
        conditions.append("f.year >= :year_from")
        params["year_from"] = preferences.year_from
    if preferences.year_to is not None:
        conditions.append("f.year <= :year_to")
        params["year_to"] = preferences.year_to
    if preferences.season:
        conditions.append("COALESCE((m.attributes -> 'seasons' ->> :season)::integer, 0) > 0")
        params["season"] = preferences.season
    if preferences.time_of_day:
        conditions.append("COALESCE((m.attributes -> 'daypart' ->> :time_of_day)::integer, 0) > 0")
        params["time_of_day"] = preferences.time_of_day
    order_by = (
        "f.rating_count DESC NULLS LAST, f.rating_value DESC NULLS LAST, f.perfume ASC"
        if preferences.prefer_popular
        else "season_votes DESC, daypart_votes DESC, f.rating_value DESC NULLS LAST, f.rating_count DESC NULLS LAST, f.perfume ASC"
    )
    query = f"""
        SELECT f.id, f.perfume, f.brand, f.country, f.gender, f.rating_value,
               f.rating_count, f.year, f.image_url, f.mainaccord1, f.mainaccord2,
               f.mainaccord3, f.mainaccord4, f.mainaccord5,
               concat_ws(',', f.top_notes, f.middle_notes, f.base_notes, f.flat_notes) AS all_notes,
               f.accords_all,
               COALESCE((m.attributes -> 'seasons' ->> :season)::integer, 0) AS season_votes,
               COALESCE((m.attributes -> 'daypart' ->> :time_of_day)::integer, 0) AS daypart_votes
        FROM fragrances f
        LEFT JOIN fragrance_source_metadata m ON m.fragrance_id = f.id
        WHERE {' AND '.join(conditions)}
        ORDER BY {order_by}
        LIMIT :limit
        OFFSET :offset
    """
    params.setdefault("season", preferences.season or "")
    params.setdefault("time_of_day", preferences.time_of_day or "")
    with engine.connect() as connection:
        rows = [dict(row._mapping) for row in connection.execute(text(query), params)]
    matches = []
    for row in rows:
        fragrance = {key: row[key] for key in (
            "id", "perfume", "brand", "country", "gender", "rating_value",
            "rating_count", "year", "image_url", "mainaccord1", "mainaccord2",
            "mainaccord3", "mainaccord4", "mainaccord5",
        )}
        matches.append({"fragrance": fragrance, "why_matched": _reasons(row, preferences)})
    return matches
