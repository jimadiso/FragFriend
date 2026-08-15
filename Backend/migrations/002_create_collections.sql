BEGIN;

CREATE TABLE IF NOT EXISTS fragrance_collections (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL
        REFERENCES app_users(id)
        ON DELETE CASCADE,
    name VARCHAR(80) NOT NULL,
    description VARCHAR(240),
    created_at TIMESTAMPTZ NOT NULL
        DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS
fragrance_collections_user_name_unique
ON fragrance_collections (
    user_id,
    LOWER(name)
);

CREATE TABLE IF NOT EXISTS collection_fragrances (
    collection_id BIGINT NOT NULL
        REFERENCES fragrance_collections(id)
        ON DELETE CASCADE,
    fragrance_id INTEGER NOT NULL
        REFERENCES fragrances(id)
        ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL
        DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (
        collection_id,
        fragrance_id
    )
);

CREATE INDEX IF NOT EXISTS
collection_fragrances_fragrance_id_index
ON collection_fragrances (fragrance_id);

COMMIT;