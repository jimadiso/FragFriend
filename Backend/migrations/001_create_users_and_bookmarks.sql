BEGIN;

CREATE TABLE IF NOT EXISTS app_users (
    id BIGSERIAL PRIMARY KEY,
    email TEXT NOT NULL,
    display_name VARCHAR(80) NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS app_users_email_lower_unique
ON app_users (LOWER(email));

CREATE TABLE IF NOT EXISTS bookmarks (
    user_id BIGINT NOT NULL
        REFERENCES app_users(id)
        ON DELETE CASCADE,
    fragrance_id INTEGER NOT NULL
        REFERENCES fragrances(id)
        ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, fragrance_id)
);

COMMIT;