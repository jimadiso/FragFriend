const API_BASE_URL = 'http://127.0.0.1:8000'
const AUTH_TOKEN_STORAGE_KEY = 'fragfriend_access_token'

export type BookmarkStatus = {
  fragrance_id: number
  bookmarked: boolean
}

export type BookmarkedFragrance = {
  id: number
  perfume: string
  brand: string
  country: string | null
  gender: string | null
  rating_value: number | null
  rating_count: number | null
  year: number | null
  image_url: string | null
}

function getAuthorizationHeaders() {
  const token = sessionStorage.getItem(
    AUTH_TOKEN_STORAGE_KEY,
  )

  if (!token) {
    throw new Error('You must sign in to manage bookmarks.')
  }

  return {
    Authorization: `Bearer ${token}`,
  }
}

async function parseBookmarkResponse(
  response: Response,
): Promise<BookmarkStatus> {
  if (response.status === 401) {
    throw new Error('Your session expired. Please sign in again.')
  }

  if (!response.ok) {
    throw new Error('We could not update this bookmark.')
  }

  return response.json()
}

export async function getBookmarkStatus(
  fragranceId: number,
): Promise<BookmarkStatus> {
  const response = await fetch(
    `${API_BASE_URL}/bookmarks/${fragranceId}/status`,
    {
      headers: getAuthorizationHeaders(),
    },
  )

  return parseBookmarkResponse(response)
}

export async function addBookmark(
  fragranceId: number,
): Promise<BookmarkStatus> {
  const response = await fetch(
    `${API_BASE_URL}/bookmarks/${fragranceId}`,
    {
      method: 'POST',
      headers: getAuthorizationHeaders(),
    },
  )

  return parseBookmarkResponse(response)
}

export async function removeBookmark(
  fragranceId: number,
): Promise<BookmarkStatus> {
  const response = await fetch(
    `${API_BASE_URL}/bookmarks/${fragranceId}`,
    {
      method: 'DELETE',
      headers: getAuthorizationHeaders(),
    },
  )

  return parseBookmarkResponse(response)
}

export async function getBookmarks(
  limit = 100,
  offset = 0,
): Promise<BookmarkedFragrance[]> {
  const parameters = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  })

  const response = await fetch(
    `${API_BASE_URL}/bookmarks/?${parameters}`,
    {
      headers: getAuthorizationHeaders(),
    },
  )

  if (response.status === 401) {
    throw new Error('Your session expired. Please sign in again.')
  }

  if (!response.ok) {
    throw new Error('We could not load your saved fragrances.')
  }

  return response.json()
}