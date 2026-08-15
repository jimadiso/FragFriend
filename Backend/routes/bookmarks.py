from fastapi import APIRouter, Depends, HTTPException, Query, status

from Backend.models.bookmark import BookmarkStatus
from Backend.models.fragrance import FragranceSummary
from Backend.routes.auth import get_current_user
from Backend.services import bookmark_service


router = APIRouter(
    prefix="/bookmarks",
    tags=["Bookmarks"],
)


@router.get(
    "/",
    response_model=list[FragranceSummary],
)
def read_bookmarks(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user),
):
    return bookmark_service.get_bookmarks(
        user_id=current_user["id"],
        limit=limit,
        offset=offset,
    )


@router.get(
    "/{fragrance_id}/status",
    response_model=BookmarkStatus,
)
def read_bookmark_status(
    fragrance_id: int,
    current_user: dict = Depends(get_current_user),
):
    return {
        "fragrance_id": fragrance_id,
        "bookmarked": bookmark_service.is_bookmarked(
            user_id=current_user["id"],
            fragrance_id=fragrance_id,
        ),
    }


@router.post(
    "/{fragrance_id}",
    response_model=BookmarkStatus,
    status_code=status.HTTP_201_CREATED,
)
def create_bookmark(
    fragrance_id: int,
    current_user: dict = Depends(get_current_user),
):
    fragrance_found = bookmark_service.add_bookmark(
        user_id=current_user["id"],
        fragrance_id=fragrance_id,
    )

    if not fragrance_found:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Fragrance not found",
        )

    return {
        "fragrance_id": fragrance_id,
        "bookmarked": True,
    }


@router.delete(
    "/{fragrance_id}",
    response_model=BookmarkStatus,
)
def delete_bookmark(
    fragrance_id: int,
    current_user: dict = Depends(get_current_user),
):
    bookmark_service.remove_bookmark(
        user_id=current_user["id"],
        fragrance_id=fragrance_id,
    )

    return {
        "fragrance_id": fragrance_id,
        "bookmarked": False,
    }