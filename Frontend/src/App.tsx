import { useState, type SyntheticEvent } from 'react'
import './App.css'

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
  const [brand, setBrand] = useState('')
  const [fragrances, setFragrances] = useState<Fragrance[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [hasSearched, setHasSearched] = useState(false)

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmedBrand = brand.trim()

    if (!trimmedBrand) {
      setError('Enter a fragrance brand.')
      return
    }

    setHasSearched(true)
    setLoading(true)
    setError('')

    try {
      const parameters = new URLSearchParams({
        brand: trimmedBrand,
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

  return (
    <main className="app">
      <section className="search-section">
        <p className="eyebrow">FragFriend</p>
        <h1>Find your next fragrance</h1>
        <p className="introduction">
          Search the fragrance collection by brand.
        </p>

        <form className="search-form" onSubmit={handleSubmit}>
          <label htmlFor="brand-search">Brand</label>

          <div className="search-controls">
            <input
              id="brand-search"
              type="search"
              value={brand}
              onChange={(event) => setBrand(event.target.value)}
              placeholder="Try Dior, Chanel, or Gucci"
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
              We couldn&apos;t find any fragrances from “{brand.trim()}”. Check the
              spelling or try another brand.
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