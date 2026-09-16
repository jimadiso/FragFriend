CREATE TABLE IF NOT EXISTS fragrance_ratings (
    user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    fragrance_id INTEGER NOT NULL REFERENCES fragrances(id) ON DELETE CASCADE,
    rating NUMERIC(2,1) NOT NULL CHECK (rating >= 0.5 AND rating <= 5 AND MOD(rating, 0.5) = 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, fragrance_id)
);
CREATE INDEX IF NOT EXISTS fragrance_ratings_fragrance_idx ON fragrance_ratings(fragrance_id);
