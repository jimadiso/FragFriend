import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptyFilters, getFilterChips, removeFilter, toPreferences } from '../src/utils/searchFilters.ts'

test('manual and AI fields appear together, including individual range bounds', () => {
  const filters = { ...emptyFilters(), notes: ['Vanilla', 'Rose'], season: 'summer' as const,
    max_rating: 4.5, year_from: 2000, year_to: 2020, context: 'office' as const }
  const chips = getFilterChips(filters)
  assert.deepEqual(chips.map(item => item.key), ['context', 'note-0', 'note-1', 'season', 'year-from', 'year-to', 'max-rating'])
  assert.ok(chips.some(item => item.label === 'Season: Summer'))
})

test('removing one chip preserves other values and leaves its input unchanged', () => {
  const filters = { ...emptyFilters(), notes: ['Vanilla', 'Rose'], max_rating: 4.5, min_rating: 3,
    year_from: 2000, year_to: 2020, required_terms: ['oud'], or_groups: [['citrus', 'floral']] }
  const removed = removeFilter(filters, 'note-0')
  assert.deepEqual(removed.notes, ['Rose'])
  assert.deepEqual(filters.notes, ['Vanilla', 'Rose'])
  assert.equal(removed.min_rating, 3)
  assert.deepEqual(removed.or_groups, [['citrus', 'floral']])
  assert.equal(removeFilter(removed, 'year-from').year_to, 2020)
  assert.equal(removeFilter(removed, 'max-rating').min_rating, 3)
  assert.equal(removeFilter(removed, 'max-rating').max_rating, null)
})

test('clearing all filters removes every chip; zero is a valid rating or vote filter', () => {
  assert.deepEqual(getFilterChips(emptyFilters()), [])
  assert.equal(getFilterChips({ ...emptyFilters(), min_rating: 0, min_votes: 0 }).length, 2)
  assert.equal('max_rating' in toPreferences(emptyFilters()), false)
})
