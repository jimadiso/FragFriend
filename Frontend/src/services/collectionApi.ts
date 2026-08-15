import type { BookmarkedFragrance } from './bookmarkApi'

const API_BASE_URL = 'http://127.0.0.1:8000'
const AUTH_TOKEN_STORAGE_KEY = 'fragfriend_access_token'

export type FragranceCollection = {
  id: number
  name: string
  description: string | null
  fragrance_count: number
  created_at: string
}

export type FragranceCollectionDetail =
  FragranceCollection & {
    fragrances: BookmarkedFragrance[]
  }

export type CollectionMembership = {
  collection_id: number
  fragrance_id: number
  included: boolean
}

export type CreateCollectionInput = {
  name: string
  description: string | null
}

function getAuthorizationHeaders() {
  const token = sessionStorage.getItem(
    AUTH_TOKEN_STORAGE_KEY,
  )

  if (!token) {
    throw new Error('You must sign in to manage collections.')
  }

  return {
    Authorization: `Bearer ${token}`,
  }
}

async function readErrorMessage(
  response: Response,
  fallbackMessage: string,
) {
  try {
    const responseBody = await response.json()

    if (
      typeof responseBody === 'object' &&
      responseBody !== null &&
      'detail' in responseBody &&
      typeof responseBody.detail === 'string'
    ) {
      return responseBody.detail
    }
  } catch {
    return fallbackMessage
  }

  return fallbackMessage
}

export async function getCollections():
Promise<FragranceCollection[]> {
  const response = await fetch(
    `${API_BASE_URL}/collections/`,
    {
      headers: getAuthorizationHeaders(),
    },
  )

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(
        response,
        'We could not load your collections.',
      ),
    )
  }

  return response.json()
}

export async function createCollection(
  collection: CreateCollectionInput,
): Promise<FragranceCollection> {
  const response = await fetch(
    `${API_BASE_URL}/collections/`,
    {
      method: 'POST',
      headers: {
        ...getAuthorizationHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(collection),
    },
  )

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(
        response,
        'We could not create this collection.',
      ),
    )
  }

  return response.json()
}

export async function getCollection(
  collectionId: number,
): Promise<FragranceCollectionDetail> {
  const response = await fetch(
    `${API_BASE_URL}/collections/${collectionId}`,
    {
      headers: getAuthorizationHeaders(),
    },
  )

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(
        response,
        'We could not load this collection.',
      ),
    )
  }

  return response.json()
}

export async function addFragranceToCollection(
  collectionId: number,
  fragranceId: number,
): Promise<CollectionMembership> {
  const response = await fetch(
    `${API_BASE_URL}/collections/${collectionId}/fragrances/${fragranceId}`,
    {
      method: 'POST',
      headers: getAuthorizationHeaders(),
    },
  )

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(
        response,
        'We could not add this fragrance to the collection.',
      ),
    )
  }

  return response.json()
}

export async function removeFragranceFromCollection(
  collectionId: number,
  fragranceId: number,
): Promise<CollectionMembership> {
  const response = await fetch(
    `${API_BASE_URL}/collections/${collectionId}/fragrances/${fragranceId}`,
    {
      method: 'DELETE',
      headers: getAuthorizationHeaders(),
    },
  )

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(
        response,
        'We could not remove this fragrance from the collection.',
      ),
    )
  }

  return response.json()
}

export async function deleteCollection(
  collectionId: number,
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/collections/${collectionId}`,
    {
      method: 'DELETE',
      headers: getAuthorizationHeaders(),
    },
  )

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(
        response,
        'We could not delete this collection.',
      ),
    )
  }
}