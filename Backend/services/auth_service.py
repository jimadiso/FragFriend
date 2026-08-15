from sqlalchemy import text

from Backend.database import engine
from Backend.security import hash_password, verify_password


def get_user_by_email(email: str) -> dict | None:
    sql = """
        SELECT
            id,
            email,
            display_name,
            password_hash,
            created_at
        FROM app_users
        WHERE LOWER(email) = LOWER(:email)
    """

    with engine.connect() as connection:
        result = connection.execute(
            text(sql),
            {"email": email.strip()},
        )
        row = result.first()

    if row is None:
        return None

    return dict(row._mapping)


def get_user_by_id(user_id: int) -> dict | None:
    sql = """
        SELECT
            id,
            email,
            display_name,
            password_hash,
            created_at
        FROM app_users
        WHERE id = :user_id
    """

    with engine.connect() as connection:
        result = connection.execute(
            text(sql),
            {"user_id": user_id},
        )
        row = result.first()

    if row is None:
        return None

    return dict(row._mapping)


def create_user(
    email: str,
    display_name: str,
    password: str,
) -> dict:
    normalized_email = email.strip().lower()
    stored_password_hash = hash_password(password)

    sql = """
        INSERT INTO app_users (
            email,
            display_name,
            password_hash
        )
        VALUES (
            :email,
            :display_name,
            :password_hash
        )
        RETURNING
            id,
            email,
            display_name,
            created_at
    """

    with engine.begin() as connection:
        result = connection.execute(
            text(sql),
            {
                "email": normalized_email,
                "display_name": display_name.strip(),
                "password_hash": stored_password_hash,
            },
        )
        row = result.one()

    return dict(row._mapping)


def authenticate_user(
    email: str,
    password: str,
) -> dict | None:
    user = get_user_by_email(email)

    if user is None:
        return None

    if not verify_password(
        password,
        user["password_hash"],
    ):
        return None

    return user