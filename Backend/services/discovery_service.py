"""Server-side natural-language discovery backed only by FragFriend's database."""
from __future__ import annotations

import os
import re
from pathlib import Path
from threading import Lock
from time import monotonic

from dotenv import load_dotenv
from openai import APIConnectionError, APIError, AuthenticationError, OpenAI, RateLimitError
from sqlalchemy import text

from Backend.database import engine
from Backend.models.fragrance import DiscoveryPreferences
from Backend.services.rating_sort import bayesian_rating_sql


load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

MODEL = "gpt-5.6-luna"
FOLLOW_UP = "What notes or scent style would you like, such as sweet, woody, floral, or fresh?"
PREFERENCE_CACHE_TTL_SECONDS = 300
_preference_cache: dict[str, tuple[float, DiscoveryPreferences]] = {}
_preference_cache_lock = Lock()

# Context heuristics, not measurements of projection or sillage.
CONTEXT_EXCLUDE_ACCORDS: dict[str, list[str]] = {
    "office": ["oud", "heavy amber", "heavy musk", "leather", "incense"],
    "beach": ["oud", "heavy amber", "gourmand", "heavy musk"],
    "gym": ["oud", "heavy amber", "leather", "gourmand", "incense"],
    "date_night": [], "formal_event": [],
    "everyday": ["oud", "heavy incense"], "other": [],
}


def _merge_context_exclusions(preferences: DiscoveryPreferences) -> list[str]:
    defaults = CONTEXT_EXCLUDE_ACCORDS.get(preferences.context or "", [])
    requested = preferences.accords + preferences.preferred_accords + preferences.notes + preferences.required_terms
    requested += [term for group in preferences.or_groups for term in group]
    included = {value.strip().casefold() for value in requested}
    existing = {value.strip().casefold() for value in preferences.exclude_accords if value.strip()}
    return sorted((existing | set(defaults)) - included)

INSTRUCTIONS = """Extract fragrance-search preferences from the user's request.
Return only the requested schema. Do not recommend any fragrance and do not invent
database facts. Extract a brand when the user names or asks for one. Use only Women,
Men, or Unisex for gender. Extract notes and accords as short lowercase search terms.
Set prefer_popular true when the user asks for popular, widely loved, well-known,
 or most reviewed fragrances. Do not infer popularity from the default result sort
 or from a request for a fresh, citrus, summer, or daytime scent. Extract a minimum vote count when the request says
"at least 1,000 votes", "above 1000 reviews", or similar. Map fall to autumn.

Any negated note, accord, or style ("not too sweet", "avoid vanilla", "nothing musky",
"no oud") goes into exclude_notes or exclude_accords, never into notes or accords.
Use sweet/musky as accords, vanilla/oud as notes when explicitly negated.
For "fresh citrus", require the citrus accord and put fresh in preferred_accords,
not accords. Preferred accords improve ranking without excluding other matches.
When a follow-up answer names only a scent style (for example, "fresh"), put
that style in accords so it filters results; do not put it only in preferred_accords.
When the user says "oud or leather", put the alternatives in one or_groups entry
like ["oud", "leather"], never as two required notes/accords. Each OR group
requires at least one of its terms; separate groups and other filters still combine
with AND. For "oud and leather", put both in required_terms; every required term
must be present as a note or accord. Never drop one side of an explicit pair. Only scent
notes or accords belong in or_groups; do not put seasons or contexts there.

Set context to office, beach, date_night, gym, formal_event, everyday, or other for
situational requests. Keep the free-text occasion for display. "Easy to wear" implies everyday.
Office includes work, professional, or not bothering coworkers; gym includes workouts.
Use beach context only when the user explicitly mentions the beach or seaside.
Summer, daytime, citrus, fresh, and hot weather alone do not imply a beach setting.
Context drives these deterministic accord exclusions on the server:
office: oud, heavy amber, heavy musk, leather, incense;
beach: oud, heavy amber, gourmand, heavy musk;
gym: oud, heavy amber, leather, gourmand, incense;
everyday: oud, heavy incense; date_night/formal_event/other: none.
These are scent-family heuristics, not evidence of projection or sillage.
Do not copy context defaults into exclude_accords: reserve exclusion fields for
the user's explicit exclusions, so removing context also removes its defaults.
Explicitly desired notes/accords override context defaults. Do not invent an
intensity measurement or claim a fragrance is guaranteed appropriate for a setting.
Ask exactly
one useful follow-up only when there is no usable database preference among brand,
gender, notes, accords, required_terms, or_groups, preferred_accords, exclude_notes, exclude_accords, context, season, time_of_day, minimum rating, minimum vote count, or year range. Otherwise set
needs_follow_up false and follow_up_question null."""

POPULARITY_REQUEST = re.compile(
    r"\b(?:popular|widely loved|well[- ]known|most reviewed|most rated|most voted|"
    r"highly reviewed|many reviews|many votes|lots of reviews|lots of votes|"
    r"strong reviews|crowd favou?rite)\b",
    re.IGNORECASE,
)
EXPLICIT_SCENT_PAIR = re.compile(
    r"\b(?:with|featuring|containing)\s+([a-z][a-z'-]*)\s+(and|or)\s+([a-z][a-z'-]*)\b",
    re.IGNORECASE,
)


def normalize_preferences(request: str, preferences: DiscoveryPreferences) -> DiscoveryPreferences:
    """Keep optional scent descriptions separate from required filters and sorting."""
    normalized = preferences.model_copy(deep=True)
    normalized.prefer_popular = bool(POPULARITY_REQUEST.search(request))
    explicit_beach = re.search(r"\b(?:beach|seaside)\b", request, re.IGNORECASE)
    rejected_beach = re.search(
        r"\b(?:not|no|avoid|without)\s+(?:for\s+|the\s+|a\s+)?(?:beach|seaside)\b",
        request, re.IGNORECASE,
    )
    if normalized.context == "beach" and (not explicit_beach or rejected_beach):
        normalized.context = None
    if re.search(r"\bfresh[\s-]+citrus\b", request, re.IGNORECASE):
        normalized.notes = [value for value in normalized.notes if value.strip().casefold() != "citrus"]
        normalized.accords = [value for value in normalized.accords if value.strip().casefold() != "fresh"]
        if not any(value.strip().casefold() == "citrus" for value in normalized.accords):
            normalized.accords.append("citrus")
        if not any(value.strip().casefold() == "fresh" for value in normalized.preferred_accords):
            normalized.preferred_accords.append("fresh")
    # Explicit two-term requests must retain both terms even if the model drops one.
    for left, operator, right in EXPLICIT_SCENT_PAIR.findall(request):
        pair = [left.casefold(), right.casefold()]
        if operator.casefold() == "or":
            if not any({term.casefold() for term in group} == set(pair) for group in normalized.or_groups):
                normalized.or_groups.append(pair)
        else:
            normalized.or_groups = [
                group for group in normalized.or_groups
                if {term.casefold() for term in group} != set(pair)
            ]
            for term in pair:
                if term not in {value.casefold() for value in normalized.required_terms}:
                    normalized.required_terms.append(term)
    # Also preserve OR wording for multi-word terms recognized by the model.
    required_terms = normalized.notes + normalized.accords
    for left in required_terms:
        for right in required_terms:
            if left.casefold() == right.casefold():
                continue
            phrase = rf"(?<!\w){re.escape(left.strip())}\s+or\s+{re.escape(right.strip())}(?!\w)"
            if re.search(phrase, request, re.IGNORECASE):
                pair = [left.strip().casefold(), right.strip().casefold()]
                if not any({term.casefold() for term in group} == set(pair) for group in normalized.or_groups):
                    normalized.or_groups.append(pair)
    grouped_terms = {term.strip().casefold() for group in normalized.or_groups for term in group}
    grouped_terms.update(term.strip().casefold() for term in normalized.required_terms)
    normalized.notes = [term for term in normalized.notes if term.strip().casefold() not in grouped_terms]
    normalized.accords = [term for term in normalized.accords if term.strip().casefold() not in grouped_terms]
    # A sole scent-style preference is the requested filter, not just a sort hint.
    if normalized.preferred_accords and not (
        normalized.notes or normalized.accords or normalized.required_terms or normalized.or_groups
    ):
        normalized.accords = normalized.preferred_accords[:]
        normalized.preferred_accords = []
    return normalized


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
            max_output_tokens=1500,
            reasoning={"effort": "low"},
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
    preferences = normalize_preferences(request, response.output_parsed)
    if preferences.year_from and preferences.year_to and preferences.year_from > preferences.year_to:
        raise RuntimeError("The requested year range is invalid.")
    return preferences


def needs_follow_up(preferences: DiscoveryPreferences) -> bool:
    return not any((
        preferences.brand,
        preferences.gender,
        preferences.notes,
        preferences.accords,
        preferences.required_terms,
        preferences.or_groups,
        preferences.preferred_accords,
        preferences.exclude_notes,
        preferences.exclude_accords,
        preferences.context,
        preferences.season,
        preferences.time_of_day,
        preferences.min_rating is not None,
        preferences.min_votes is not None,
        preferences.prefer_popular,
        preferences.year_from is not None,
        preferences.year_to is not None,
    ))


def _phrase_matches(value: str | None, requested: str) -> bool:
    return requested.casefold() in (value or "").casefold()


def _scent_term_pattern(term: str) -> str:
    """Match a whole scent term, including a parenthetical alias like (Oud)."""
    return rf"(^|[^[:alnum:]]){re.escape(term.strip())}([^[:alnum:]]|$)"


def _listed_scent_matches(value: str | None, term: str) -> bool:
    return bool(term.strip() and re.search(
        rf"(?<!\w){re.escape(term.strip())}(?!\w)", value or "", re.IGNORECASE,
    ))


def _reasons(row: dict, preferences: DiscoveryPreferences) -> list[str]:
    reasons = []
    if preferences.brand and _phrase_matches(row["brand"], preferences.brand):
        reasons.append(f"Brand matches {row['brand']}.")
    for note in preferences.notes:
        if _listed_scent_matches(row["all_notes"], note):
            reasons.append(f"Lists {note} among its notes.")
    listed_accords = {value.strip().casefold() for value in (row["accords_all"] or "").split(",")}
    for accord in preferences.accords:
        matches = (accord.strip().casefold() in listed_accords if accord.strip().casefold() == "fresh"
                   else _listed_scent_matches(row["accords_all"], accord))
        if matches:
            reasons.append(f"Has a {accord} accord.")
    for term in preferences.required_terms:
        if _listed_scent_matches(row["all_notes"], term) or _listed_scent_matches(row["accords_all"], term):
            reasons.append(f"Has your required {term} note or accord.")
    for group in preferences.or_groups:
        matched = [term for term in group if _listed_scent_matches(row["all_notes"], term) or _listed_scent_matches(row["accords_all"], term)]
        if matched:
            reasons.append(f"Matches {' or '.join(group)} through {', '.join(matched)}.")
    for accord in preferences.preferred_accords:
        if accord.strip().casefold() in listed_accords:
            reasons.append(f"Also has your preferred {accord} accord.")
    for note in preferences.exclude_notes:
        if note.strip() and not _listed_scent_matches(row["all_notes"], note.strip()):
            reasons.append(f"Does not list {note.strip()} among its notes.")
    excluded = _merge_context_exclusions(preferences)
    if excluded:
        prefix = f"Uses your {preferences.context.replace('_', ' ')} context filter" if preferences.context else "Matches your exclusions"
        reasons.append(f"{prefix}: no listed {', '.join(excluded)} accords. Unlisted accords do not establish projection strength.")
    if preferences.gender and row["gender"] == preferences.gender:
        reasons.append(f"Listed for {preferences.gender.lower()}.")
    if preferences.min_rating is not None and row["rating_value"] is not None:
        reasons.append(f"Rated {float(row['rating_value']):.2f}, meeting your minimum rating.")
    if preferences.min_votes is not None and row["rating_count"] is not None:
        reasons.append(f"Has {row['rating_count']:,} ratings, meeting your {preferences.min_votes:,}+ vote minimum.")
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
    name: str = "",
    max_rating: float | None = None,
    sort_by: str | None = None,
    order: str = "desc",
    count_only: bool = False,
    group_by_brand: bool = False,
    brand_sort: str = "count",
) -> list[dict] | int:
    conditions = ["1=1"]
    params: dict[str, object] = {"limit": limit, "offset": offset}
    effective_exclude_accords = _merge_context_exclusions(preferences)
    if name:
        conditions.append("f.brand ILIKE :name" if group_by_brand else "(f.perfume ILIKE :name OR f.brand ILIKE :name)")
        params["name"] = f"%{name.strip()}%"
    if max_rating is not None:
        conditions.append("f.rating_value <= :max_rating")
        params["max_rating"] = max_rating
    if preferences.brand:
        conditions.append("f.brand ILIKE :brand")
        params["brand"] = f"%{preferences.brand.strip()}%"
    if preferences.gender:
        conditions.append("f.gender = :gender")
        params["gender"] = preferences.gender
    for index, value in enumerate(preferences.notes):
        key = f"note_{index}"
        conditions.append("concat_ws(',', f.top_notes, f.middle_notes, f.base_notes, f.flat_notes) ~* :" + key)
        params[key] = _scent_term_pattern(value)
    for index, value in enumerate(preferences.accords):
        key = f"accord_{index}"
        if value.strip().casefold() == "fresh":
            conditions.append(
                f":{key} = ANY(regexp_split_to_array(lower(COALESCE(f.accords_all, '')), "
                "'[[:space:]]*,[[:space:]]*'))"
            )
            params[key] = "fresh"
        else:
            conditions.append("COALESCE(f.accords_all, '') ~* :" + key)
            params[key] = _scent_term_pattern(value)
    for index, value in enumerate(preferences.exclude_notes):
        if not value.strip():
            continue
        key = f"exclude_note_{index}"
        conditions.append("concat_ws(',', f.top_notes, f.middle_notes, f.base_notes, f.flat_notes) !~* :" + key)
        params[key] = _scent_term_pattern(value)
    for index, value in enumerate(preferences.required_terms):
        if not value.strip():
            continue
        key = f"required_term_{index}"
        conditions.append(
            "(concat_ws(',', f.top_notes, f.middle_notes, f.base_notes, f.flat_notes) "
            f"~* :{key} OR COALESCE(f.accords_all, '') ~* :{key})"
        )
        params[key] = _scent_term_pattern(value)
    for group_index, group in enumerate(preferences.or_groups):
        alternatives = []
        for term_index, value in enumerate(group):
            if not value.strip():
                continue
            key = f"or_{group_index}_{term_index}"
            alternatives.append(
                "(concat_ws(',', f.top_notes, f.middle_notes, f.base_notes, f.flat_notes) "
                f"~* :{key} OR COALESCE(f.accords_all, '') ~* :{key})"
            )
            params[key] = _scent_term_pattern(value)
        if alternatives:
            conditions.append("(" + " OR ".join(alternatives) + ")")
    for index, value in enumerate(effective_exclude_accords):
        key = f"exclude_accord_{index}"
        conditions.append("COALESCE(f.accords_all, '') !~* :" + key)
        params[key] = _scent_term_pattern(value)
    if preferences.min_rating is not None:
        conditions.append("f.rating_value >= :min_rating")
        params["min_rating"] = preferences.min_rating
    if preferences.min_votes is not None:
        conditions.append("COALESCE(f.rating_count, 0) >= :min_votes")
        params["min_votes"] = preferences.min_votes
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
    if group_by_brand:
        source = f"FROM fragrances f LEFT JOIN fragrance_source_metadata m ON m.fragrance_id = f.id WHERE {' AND '.join(conditions)} AND f.brand IS NOT NULL"
        with engine.connect() as connection:
            if count_only:
                return connection.execute(text(f"SELECT count(DISTINCT f.brand) {source}"), params).scalar_one()
            column = {"count": "fragrance_count", "rating": "average_rating", "name": "f.brand"}[brand_sort]
            direction = "ASC" if order == "asc" else "DESC"
            query = f"""SELECT f.brand, count(*) AS fragrance_count, AVG(f.rating_value) AS average_rating
                {source} GROUP BY f.brand ORDER BY {column} {direction} NULLS LAST, f.brand ASC
                LIMIT :limit OFFSET :offset"""
            return [dict(row._mapping) for row in connection.execute(text(query), params)]
    order_by = (
        "f.rating_count DESC NULLS LAST, f.rating_value DESC NULLS LAST, f.perfume ASC"
        if preferences.prefer_popular
        else "season_votes DESC, daypart_votes DESC, f.rating_value DESC NULLS LAST, f.rating_count DESC NULLS LAST, f.perfume ASC"
    )
    if sort_by is not None:
        column = {"rating": "f.rating_value", "year": "f.year", "popularity": "f.rating_count"}[sort_by]
        direction = "ASC" if order == "asc" else "DESC"
        if sort_by == "rating" and direction == "DESC":
            order_by = (
                f"{bayesian_rating_sql()} DESC NULLS LAST, "
                "f.rating_count DESC NULLS LAST, f.rating_value DESC NULLS LAST, f.perfume ASC"
            )
        else:
            order_by = f"{column} {direction} NULLS LAST, f.perfume ASC"
    preferred_ranks = []
    for index, accord in enumerate(preferences.preferred_accords):
        if not accord.strip():
            continue
        key = f"preferred_accord_{index}"
        params[key] = accord.strip().casefold()
        preferred_ranks.append(
            f"CASE WHEN :{key} = ANY(regexp_split_to_array(lower(COALESCE(f.accords_all, '')), "
            "'[[:space:]]*,[[:space:]]*')) THEN 1 ELSE 0 END DESC"
        )
    if preferred_ranks:
        order_by = ", ".join(preferred_ranks + [order_by])
    order_by += ", f.id ASC"
    if count_only:
        with engine.connect() as connection:
            return connection.execute(text(f"SELECT count(*) FROM fragrances f LEFT JOIN fragrance_source_metadata m ON m.fragrance_id = f.id WHERE {' AND '.join(conditions)}"), params).scalar_one()
    query = f"""
        SELECT f.id, f.perfume, f.brand, f.country, f.gender, f.rating_value,
               f.rating_count, f.year, f.image_url, f.picture_url, f.thumbnail_url, f.mainaccord1, f.mainaccord2,
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
            "rating_count", "year", "image_url", "picture_url", "thumbnail_url", "mainaccord1", "mainaccord2",
            "mainaccord3", "mainaccord4", "mainaccord5",
        )}
        matches.append({"fragrance": fragrance, "why_matched": _reasons(row, preferences)})
    return matches
