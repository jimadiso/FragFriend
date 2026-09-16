"""Shared ranking expression for imported fragrance ratings.

The prior is the mean fragrance rating across the imported catalog, while 250
votes is enough to keep one-vote scores from dominating the highest-rated sort.
This never changes the rating or vote count displayed to users.
"""

PRIOR_VOTES = 250


def bayesian_rating_sql(alias: str = "f") -> str:
    """Return a nullable weighted score for SQL ORDER BY (trusted aliases only)."""
    if alias != "f":
        raise ValueError("Unsupported fragrance table alias")
    prior_mean = "(SELECT AVG(rating_value) FROM fragrances WHERE rating_value IS NOT NULL AND rating_count > 0)"
    return (
        f"CASE WHEN {alias}.rating_value IS NOT NULL AND {alias}.rating_count > 0 "
        f"THEN ({alias}.rating_value * {alias}.rating_count + {PRIOR_VOTES} * {prior_mean}) "
        f"/ ({alias}.rating_count + {PRIOR_VOTES}) END"
    )
