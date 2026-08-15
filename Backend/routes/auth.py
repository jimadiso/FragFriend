from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import (
    HTTPAuthorizationCredentials,
    HTTPBearer,
)
from sqlalchemy.exc import IntegrityError

from Backend.models.user import (
    TokenResponse,
    UserCreate,
    UserLogin,
    UserPublic,
)
from Backend.security import (
    create_access_token,
    decode_access_token,
)
from Backend.services import auth_service


router = APIRouter(
    prefix="/auth",
    tags=["Authentication"],
)

bearer_scheme = HTTPBearer(auto_error=False)


def unauthorized_exception() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired authentication credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(
        bearer_scheme
    ),
) -> dict:
    if credentials is None:
        raise unauthorized_exception()

    user_id = decode_access_token(credentials.credentials)
    if user_id is None:
        raise unauthorized_exception()

    user = auth_service.get_user_by_id(user_id)
    if user is None:
        raise unauthorized_exception()

    return user


@router.post(
    "/register",
    response_model=UserPublic,
    status_code=status.HTTP_201_CREATED,
)
def register_user(user_data: UserCreate):
    try:
        return auth_service.create_user(
            email=str(user_data.email),
            display_name=user_data.display_name,
            password=user_data.password,
        )
    except IntegrityError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        ) from error


@router.post(
    "/login",
    response_model=TokenResponse,
)
def login_user(user_data: UserLogin):
    user = auth_service.authenticate_user(
        email=str(user_data.email),
        password=user_data.password,
    )

    if user is None:
        raise unauthorized_exception()

    return {
        "access_token": create_access_token(user["id"]),
        "token_type": "bearer",
        "user": user,
    }


@router.get(
    "/me",
    response_model=UserPublic,
)
def read_current_user(
    current_user: dict = Depends(get_current_user),
):
    return current_user