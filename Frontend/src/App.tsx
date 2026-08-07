import { useState, type SyntheticEvent } from 'react'
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

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmedQuery = query.trim()

    if (!trimmedQuery) {
      setError(
        searchMode === 'brand'
          ? 'Enter a fragrance brand.'
          : 'Enter a fragrance name.',
      )
      return
    }

    setHasSearched(true)
    setLoading(true)
    setError('')

    try {
      const parameters = new URLSearchParams({
        [searchMode]: trimmedQuery,
        limit: '20',
        offset: '0',
      })

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

  return (
    <main className="app">
      <section className="search-section">
        <p className="eyebrow">FragFriend</p>
        <h1>Find your next fragrance</h1>
        <p className="introduction">
          Search the fragrance collection by{' '}{searchMode === 'brand' ? 'brand' : 'fragrance name'}.
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

            <label htmlFor="fragrance-search">
              Search by {searchMode === 'brand' ? 'brand' : 'fragrance'}
            </label>
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