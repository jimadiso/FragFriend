import {useEffect, useRef, useState, type SyntheticEvent,} from 'react'
import './App.css'

type SearchMode = 'brand' | 'name'

type Fragrance = {
  id: number
  perfume: string
  brand: string
  country: string | null
  gender: string | null
  rating_value: number | null
  rating_count: number | null
  year: number | null
}

function App() {
  const [searchMode, setSearchMode] = useState<SearchMode>('brand')
  const [query, setQuery] = useState('')
  const [fragrances, setFragrances] = useState<Fragrance[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [hasSearched, setHasSearched] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const filterButtonRef = useRef<HTMLButtonElement>(null)
  const filterPanelRef = useRef<HTMLElement>(null)
  const [minRating, setMinRating] = useState('')
  const [maxRating, setMaxRating] = useState('')
  const [yearFrom, setYearFrom] = useState('')
  const [yearTo, setYearTo] = useState('')
  const [gender, setGender] = useState('')
  const [accord, setAccord] = useState('')
  const [note, setNote] = useState('')
  const activeFilterCount = [minRating, maxRating, yearFrom, yearTo, gender, accord, note,].filter(Boolean).length

  useEffect(() => {
    function handleClickOutside(event: PointerEvent) {
      const clickedElement = event.target as Node

      const clickedButton =
        filterButtonRef.current?.contains(clickedElement)

      const clickedPanel =
        filterPanelRef.current?.contains(clickedElement)

      if (!clickedButton && !clickedPanel) {
        setFiltersOpen(false)
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setFiltersOpen(false)
        filterButtonRef.current?.focus()
      }
    }

    if (filtersOpen) {
      document.addEventListener('pointerdown', handleClickOutside)
      document.addEventListener('keydown', handleEscape)
    }

    return () => {
      document.removeEventListener('pointerdown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [filtersOpen])

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmedQuery = query.trim()

    const hasActiveFilters = activeFilterCount > 0

    if (!trimmedQuery && !hasActiveFilters) {
      setError('Enter a brand, fragrance, or select at least one filter.')
      return
    }
    if (
      minRating &&
      maxRating &&
      Number(minRating) > Number(maxRating)
    ) {
      setError('Minimum rating cannot be greater than maximum rating.')
      return
    }

    if (
      yearFrom &&
      yearTo &&
      Number(yearFrom) > Number(yearTo)
    ) {
      setError('Starting year cannot be greater than ending year.')
      return
    }

    setHasSearched(true)
    setLoading(true)
    setError('')
    setFiltersOpen(false)

    try {
      const parameters = new URLSearchParams({
        limit: '10',
        offset: '0',
        sort_by: 'rating',
        order: 'desc',
      })

      if (trimmedQuery) {
        parameters.set(searchMode, trimmedQuery)
      }

      if (minRating) parameters.set('min_rating', minRating)
      if (maxRating) parameters.set('max_rating', maxRating)
      if (yearFrom) parameters.set('year_from', yearFrom)
      if (yearTo) parameters.set('year_to', yearTo)
      if (gender) parameters.set('gender', gender)
      if (accord.trim()) parameters.set('accord', accord.trim())
      if (note.trim()) parameters.set('note', note.trim())

      const response = await fetch(
        `http://127.0.0.1:8000/fragrances/search?${parameters}`,
      )

      if (!response.ok) {
        throw new Error('The fragrance search failed.')
      }

      const data: Fragrance[] = await response.json()
      setFragrances(data)
    } catch {
      setError(
        'Could not connect to the FragFriend API. Make sure the backend is running.',
      )
      setFragrances([])
    } finally {
      setLoading(false)
    }
  }

  function changeSearchMode(mode: SearchMode) {
    setSearchMode(mode)
    setQuery('')
    setFragrances([])
    setError('')
    setHasSearched(false)
  }

  function clearFilters() {
    setMinRating('')
    setMaxRating('')
    setYearFrom('')
    setYearTo('')
    setGender('')
    setAccord('')
    setNote('')
    setError('')
  }

  return (
    <main className="app">
      <section className="search-section">
        <p className="eyebrow">FragFriend</p>
        <h1>Find <span className="headline-emphasis">your</span> next scent</h1>
        <p className="introduction">
          Search the fragrance collection by{' '}{searchMode === 'brand' ? 'brand' : 'fragrance'} name.
        </p>

        <form className="search-form" onSubmit={handleSubmit}>
          <div className="search-label-row">
            <div className="search-modifier" aria-label="Search type">
              <button
                type="button"
                className={searchMode === 'brand' ? 'active' : ''}
                aria-pressed={searchMode === 'brand'}
                onClick={() => changeSearchMode('brand')}
              >
                Brand
              </button>

              <button
                type="button"
                className={searchMode === 'name' ? 'active' : ''}
                aria-pressed={searchMode === 'name'}
                onClick={() => changeSearchMode('name')}
              >
                Fragrance
              </button>
            </div>

          <div className="search-label-actions">
            <label htmlFor="fragrance-search">
              Search by {searchMode === 'brand' ? 'brand' : 'fragrance'}
            </label>

            <button
              ref={filterButtonRef}
              type="button"
              className="filter-toggle"
              aria-expanded={filtersOpen}
              aria-controls="filter-panel"
              onClick={() => setFiltersOpen((open) => !open)}
            >
              Filters
              {activeFilterCount > 0 && (
                <span className="filter-count">{activeFilterCount}</span>
              )}
            </button>
          </div>
        </div>

          <div className="search-controls">
            <input
              id="fragrance-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={
                searchMode === 'brand'
                  ? 'Try Dior, Chanel, or Gucci'
                  : 'Try Dior Me Dior Me Not'
              }
            />

            <button type="submit" disabled={loading}>
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>

          {filtersOpen && (
            <section
              ref={filterPanelRef}
              id="filter-panel"
              className="filter-panel"
              aria-label="Search filters"
            >
              <div className="filter-panel-heading">
                <div>
                  <h2>Refine your search</h2>
                  <p>Narrow the results without changing your search.</p>
                </div>

                <div className="filter-panel-actions">
                  <button
                    type="button"
                    className="clear-filters"
                    onClick={clearFilters}
                  >
                    Clear filters
                  </button>

                  <button
                    type="button"
                    className="filter-close"
                    aria-label="Close filters"
                    onClick={() => {
                      setFiltersOpen(false)
                      filterButtonRef.current?.focus()
                    }}
                  >
                    ×
                  </button>
                </div>
              </div>

              <div className="filter-grid">
                <label className="filter-field">
                  <span>Minimum rating</span>
                  <select
                    value={minRating}
                    onChange={(event) => setMinRating(event.target.value)}
                  >
                    <option value="">Any rating</option>
                    <option value="2">2.0+</option>
                    <option value="3">3.0+</option>
                    <option value="3.5">3.5+</option>
                    <option value="4">4.0+</option>
                    <option value="4.5">4.5+</option>
                  </select>
                </label>

                <label className="filter-field">
                  <span>Maximum rating</span>
                  <select
                    value={maxRating}
                    onChange={(event) => setMaxRating(event.target.value)}
                  >
                    <option value="">Any rating</option>
                    <option value="2">Up to 2.0</option>
                    <option value="3">Up to 3.0</option>
                    <option value="3.5">Up to 3.5</option>
                    <option value="4">Up to 4.0</option>
                    <option value="4.5">Up to 4.5</option>
                    <option value="5">Up to 5.0</option>
                  </select>
                </label>

                <label className="filter-field">
                  <span>Starting year</span>
                  <input
                    type="number"
                    min="1700"
                    max="2027"
                    value={yearFrom}
                    placeholder="1900"
                    onChange={(event) => setYearFrom(event.target.value)}
                  />
                </label>

                <label className="filter-field">
                  <span>Ending year</span>
                  <input
                    type="number"
                    min="1700"
                    max="2027"
                    value={yearTo}
                    placeholder="2027"
                    onChange={(event) => setYearTo(event.target.value)}
                  />
                </label>

                <label className="filter-field">
                  <span>Gender</span>
                  <select
                    value={gender}
                    onChange={(event) => setGender(event.target.value)}
                  >
                    <option value="">All genders</option>
                    <option value="Men">Men</option>
                    <option value="Women">Women</option>
                    <option value="Unisex">Unisex</option>
                  </select>
                </label>
              </div>

              <details className="advanced-filters">
                <summary>Advanced filters</summary>

                <div className="advanced-filter-grid">
                  <label className="filter-field">
                    <span>Main accord</span>
                    <input
                      type="text"
                      value={accord}
                      placeholder="Floral, woody, fresh..."
                      onChange={(event) => setAccord(event.target.value)}
                    />
                  </label>

                  <label className="filter-field">
                    <span>Fragrance note</span>
                    <input
                      type="text"
                      value={note}
                      placeholder="Vanilla, bergamot, musk..."
                      onChange={(event) => setNote(event.target.value)}
                    />
                  </label>
                </div>
              </details>
              <div className="filter-footer">
                <button
                  type="submit"
                  className="apply-filters"
                  disabled={loading}
                >
                  {loading ? 'Applying...' : 'Apply filters'}
                </button>
              </div>
            </section>
          )}

        </form>

        {error && <p className="error-message">{error}</p>}
      </section>

      <section className="results" aria-live="polite">
        {!loading && !hasSearched && !error && (
          <p>Your search results will appear here.</p>
        )}

        {!loading && hasSearched && fragrances.length === 0 && !error && (
          <div className="no-results">
            <h2>No matching fragrances found</h2>
            <p>
              We couldn&apos;t find any fragrances from “{query.trim()}”. Check the
              spelling or try another{' '}{searchMode === 'brand' ? 'brand' : 'fragrance'}.
            </p>
          </div>
        )}

        {fragrances.map((fragrance) => (
          <article className="fragrance-card" key={fragrance.id}>
            <p className="brand">{fragrance.brand}</p>
            <h2>{fragrance.perfume}</h2>
            <p>
              {fragrance.year ?? 'Year unknown'} ·{' '}
              {fragrance.gender ?? 'Unisex'}
            </p>
            <p>
              Rating:{' '}
              {fragrance.rating_value !== null
                ? fragrance.rating_value.toFixed(2)
                : 'Not rated'}
            </p>
          </article>
        ))}
      </section>
    </main>
  )
}

export default App