const API_BASE_URL = 'http://127.0.0.1:8000'

export type DiscoveryFragrance = {
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

export type DiscoveryResponse = {
  total: number
  preferences: {
    brand: string | null
    gender: 'Women' | 'Men' | 'Unisex' | null
    notes: string[]
    accords: string[]
    required_terms: string[]
    or_groups: string[][]
    preferred_accords: string[]
    exclude_notes: string[]
    exclude_accords: string[]
    context: 'office' | 'beach' | 'date_night' | 'gym' | 'formal_event' | 'everyday' | 'other' | null
    season: 'winter' | 'spring' | 'summer' | 'autumn' | null
    time_of_day: 'day' | 'night' | null
    occasion: string | null
    min_rating: number | null
    min_votes: number | null
    prefer_popular: boolean
    year_from: number | null
    year_to: number | null
    needs_follow_up: boolean
    follow_up_question: string | null
  }
  follow_up_question: string | null
  matches: Array<{
    fragrance: DiscoveryFragrance
    why_matched: string[]
  }>
  message: string | null
}

export async function discoverFragrances(
  request: string,
): Promise<DiscoveryResponse> {
  const response = await fetch(`${API_BASE_URL}/fragrances/discover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ request }),
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null) as {
      detail?: string
    } | null
    throw new Error(body?.detail || 'Discovery is unavailable right now.')
  }

  return response.json() as Promise<DiscoveryResponse>
}

export async function discoverMoreFragrances(
  preferences: DiscoveryResponse['preferences'],
  offset: number,
  options: { limit: number; name: string; max_rating: number | null; sort_by: string; order: string },
): Promise<DiscoveryResponse> {
  const response = await fetch(`${API_BASE_URL}/fragrances/discover/more`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ preferences, offset, ...options }),
  })

  if (!response.ok) {
    throw new Error('Could not load different matches. Please try again.')
  }

  return response.json() as Promise<DiscoveryResponse>
}
