import { useEffect, useRef, useState } from 'react'
import type { BookmarkedFragrance } from '../services/bookmarkApi'
import FragranceComparisonCard, { type ComparisonDetails } from './FragranceComparisonCard'

type Props = { fragrances: BookmarkedFragrance[]; onExit: () => void; userId?: number; onSignIn: () => void }

export default function LibraryComparison({ fragrances, onExit, userId, onSignIn }: Props) {
  const [details, setDetails] = useState<Record<number, ComparisonDetails>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const heading = useRef<HTMLHeadingElement>(null)
  const first = fragrances[0]?.id
  const second = fragrances[1]?.id
  useEffect(() => { heading.current?.focus() }, [])
  useEffect(() => {
    const controller = new AbortController()
    Promise.all([first, second].map(async id => {
      const response = await fetch(`http://127.0.0.1:8000/fragrances/${id}`, { signal: controller.signal })
      if (!response.ok) throw new Error('Could not load comparison details. Please try again.')
      return [id, await response.json()] as const
    })).then(rows => { setDetails(Object.fromEntries(rows)); setError('') })
      .catch(cause => { if (!controller.signal.aborted) setError(cause.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [first, second, attempt])
  return <section className="library-comparison" aria-labelledby="comparison-title">
    <div className="comparison-heading">
      <h2 id="comparison-title" tabIndex={-1} ref={heading}>Compare fragrances</h2>
      <button type="button" onClick={onExit}>Back to Library</button>
    </div>
    {loading && <p role="status">Loading notes and accords…</p>}
    {error && <p role="alert">{error} <button type="button" onClick={() => { setLoading(true); setError(''); setAttempt(value => value + 1) }}>Retry</button></p>}
    <div className="comparison-grid">
      {fragrances.map(fragrance => <FragranceComparisonCard key={fragrance.id} fragrance={fragrance}
        details={details[fragrance.id]} userId={userId} onSignIn={onSignIn} />)}
    </div>
  </section>
}
