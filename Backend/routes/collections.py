from fastapi import ( APIRouter, Depends, HTTPException, Response, status, )
from sqlalchemy.exc import IntegrityError

from Backend.models.collection import (
    CollectionCreate,
    CollectionDetail,
    CollectionMembership,
    CollectionSummary,
    CollectionUpdate,
)
from Backend.routes.auth import get_current_user
from Backend.services import collection_service


router = APIRouter(
    prefix="/collections",
    tags=["Collections"],
)


@router.get(
    "/",
    response_model=list[CollectionSummary],
)
def read_collections(
    current_user: dict = Depends(get_current_user),
):
    return collection_service.get_collections(
        user_id=current_user["id"],
    )


@router.post(
    "/",
    response_model=CollectionSummary,
    status_code=status.HTTP_201_CREATED,
)
def create_collection(
    collection_data: CollectionCreate,
    current_user: dict = Depends(get_current_user),
):
    try:
        collection = collection_service.create_collection(
            user_id=current_user["id"],
            name=collection_data.name,
            description=collection_data.description,
        )
    except collection_service.CollectionLimitReached as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You have reached the limit of 10 collections. Delete a collection before creating another.",
        ) from error

    if collection is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A collection with this name already exists",
        )

    return collection

@router.get(
    "/{collection_id}",
    response_model=CollectionDetail,
)
def read_collection(
    collection_id: int,
    current_user: dict = Depends(get_current_user),
):
    collection = collection_service.get_collection(
        user_id=current_user["id"],
        collection_id=collection_id,
    )

    if collection is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Collection not found",
        )

    return collection


@router.patch(
    "/{collection_id}",
    response_model=CollectionSummary,
)
def update_collection(
    collection_id: int,
    collection_data: CollectionUpdate,
    current_user: dict = Depends(get_current_user),
):
    try:
        collection = collection_service.update_collection(
            user_id=current_user["id"],
            collection_id=collection_id,
            name=collection_data.name,
            description=collection_data.description,
        )
    except IntegrityError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A collection with this name already exists",
        ) from error

    if collection is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Collection not found",
        )

    return collection


@router.post(
    "/{collection_id}/fragrances/{fragrance_id}",
    response_model=CollectionMembership,
    status_code=status.HTTP_201_CREATED,
)
def add_fragrance_to_collection(
    collection_id: int,
    fragrance_id: int,
    current_user: dict = Depends(get_current_user),
):
    try:
        membership = (
            collection_service.add_fragrance_to_collection(
                user_id=current_user["id"],
                collection_id=collection_id,
                fragrance_id=fragrance_id,
            )
        )
    except collection_service.SavedFragranceLimitReached as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Your Library is full. Remove a saved fragrance before adding another (100 maximum).",
        ) from error

    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Collection or fragrance not found",
        )

    return membership


@router.delete(
    "/{collection_id}/fragrances/{fragrance_id}",
    response_model=CollectionMembership,
)
def remove_fragrance_from_collection(
    collection_id: int,
    fragrance_id: int,
    current_user: dict = Depends(get_current_user),
):
    membership = (
        collection_service.remove_fragrance_from_collection(
            user_id=current_user["id"],
            collection_id=collection_id,
            fragrance_id=fragrance_id,
        )
    )

    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Collection not found",
        )

    return membership


@router.delete(
    "/{collection_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_collection(
    collection_id: int,
    current_user: dict = Depends(get_current_user),
):
    collection_deleted = (
        collection_service.delete_collection(
            user_id=current_user["id"],
            collection_id=collection_id,
        )
    )

    if not collection_deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Collection not found",
        )

    return Response(
        status_code=status.HTTP_204_NO_CONTENT,
    )
