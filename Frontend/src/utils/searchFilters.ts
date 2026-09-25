import type { DiscoveryResponse } from '../services/discoveryApi'
export type SearchFilters = DiscoveryResponse['preferences'] & { max_rating: number | null }
export function emptyFilters(): SearchFilters {
  return { brand: null, gender: null, notes: [], accords: [], required_terms: [], or_groups: [],
    preferred_accords: [], exclude_notes: [], exclude_accords: [], context: null, season: null,
    time_of_day: null, occasion: null, min_rating: null, max_rating: null, min_votes: null,
    prefer_popular: false, year_from: null, year_to: null, needs_follow_up: false, follow_up_question: null }
}
export function toPreferences(filters: SearchFilters): DiscoveryResponse['preferences'] {
  const { max_rating: _maximum, ...preferences } = filters
  void _maximum
  return preferences
}
type DiscoveryPreferenceChip = {
  key: string
  label: string
}

export function toScentTitle(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\b\p{L}/gu, (letter) => letter.toUpperCase())
}

export function getFilterChips(
  preferences: SearchFilters,
) {
  const chips: DiscoveryPreferenceChip[] = []
  preferences.exclude_notes.forEach((note, index) => chips.push({ key: `exclude-note-${index}`, label: `Avoid note: ${toScentTitle(note)}` }))
  preferences.exclude_accords.forEach((accord, index) => chips.push({ key: `exclude-accord-${index}`, label: `Avoid accord: ${toScentTitle(accord)}` }))
  if (preferences.context) chips.push({ key: 'context', label: `Context: ${toScentTitle(preferences.context.replaceAll('_', ' '))}` })

  if (preferences.brand) chips.push({ key: 'brand', label: `Brand: ${preferences.brand}` })
  if (preferences.gender) chips.push({ key: 'gender', label: preferences.gender })
  preferences.notes.forEach((note, index) => chips.push({ key: `note-${index}`, label: `Note: ${toScentTitle(note)}` }))
  preferences.accords.forEach((accord, index) => chips.push({ key: `accord-${index}`, label: `Accord: ${toScentTitle(accord)}` }))
  preferences.required_terms.forEach((term, index) => chips.push({ key: `required-term-${index}`, label: `Requires: ${toScentTitle(term)}` }))
  preferences.or_groups.forEach((terms, index) => chips.push({ key: `or-group-${index}`, label: `Any of: ${terms.map(toScentTitle).join(' or ')}` }))
  preferences.preferred_accords.forEach((accord, index) => chips.push({ key: `preferred-accord-${index}`, label: `Prefer accord: ${toScentTitle(accord)}` }))
  if (preferences.season) {
    chips.push({ key: 'season', label: `Season: ${toScentTitle(preferences.season)}` })
  }
  if (preferences.time_of_day) {
    chips.push({ key: 'time-of-day', label: `Time: ${toScentTitle(preferences.time_of_day)}` })
  }
  if (preferences.min_rating !== null) {
    chips.push({ key: 'min-rating', label: `${preferences.min_rating.toFixed(1)}+ rating` })
  }
  if (preferences.min_votes !== null) {
    chips.push({ key: 'min-votes', label: `${preferences.min_votes.toLocaleString()}+ votes` })
  }
  if (preferences.prefer_popular) chips.push({ key: 'popular', label: 'Popular' })
  if (preferences.year_from !== null) chips.push({ key: 'year-from', label: `From year: ${preferences.year_from}` })
  if (preferences.year_to !== null) chips.push({ key: 'year-to', label: `Through year: ${preferences.year_to}` })
  if (preferences.max_rating !== null) chips.push({ key: 'max-rating', label: `Max rating: ${preferences.max_rating.toFixed(1)}` })

  return chips
}

export function removeFilter(
  preferences: SearchFilters,
  key: string,
) {
  if (key === 'brand') return { ...preferences, brand: null }
  if (key === 'context') return { ...preferences, context: null, occasion: null }
  if (key.startsWith('exclude-note-')) return { ...preferences, exclude_notes: preferences.exclude_notes.filter((_, index) => index !== Number(key.slice('exclude-note-'.length))) }
  if (key.startsWith('exclude-accord-')) return { ...preferences, exclude_accords: preferences.exclude_accords.filter((_, index) => index !== Number(key.slice('exclude-accord-'.length))) }
  if (key === 'gender') return { ...preferences, gender: null }
  if (key === 'season') return { ...preferences, season: null }
  if (key === 'time-of-day') return { ...preferences, time_of_day: null }
  if (key === 'min-rating') return { ...preferences, min_rating: null }
  if (key === 'min-votes') return { ...preferences, min_votes: null }
  if (key === 'popular') return { ...preferences, prefer_popular: false }
  if (key.startsWith('required-term-')) return { ...preferences, required_terms: preferences.required_terms.filter((_, index) => index !== Number(key.slice('required-term-'.length))) }
  if (key.startsWith('or-group-')) return { ...preferences, or_groups: preferences.or_groups.filter((_, index) => index !== Number(key.slice('or-group-'.length))) }
  if (key === 'year-from') return { ...preferences, year_from: null }
  if (key === 'year-to') return { ...preferences, year_to: null }
  if (key === 'max-rating') return { ...preferences, max_rating: null }
  if (key.startsWith('note-')) {
    const index = Number(key.slice('note-'.length))
    return { ...preferences, notes: preferences.notes.filter((_, itemIndex) => itemIndex !== index) }
  }
  if (key.startsWith('accord-')) {
    const index = Number(key.slice('accord-'.length))
    return { ...preferences, accords: preferences.accords.filter((_, itemIndex) => itemIndex !== index) }
  }
  if (key.startsWith('preferred-accord-')) {
    const index = Number(key.slice('preferred-accord-'.length))
    return { ...preferences, preferred_accords: preferences.preferred_accords.filter((_, itemIndex) => itemIndex !== index) }
  }
  return preferences
}

