import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './FragranceRating.css'

type Summary = { average: number | null; count: number }
type Props = { fragranceId: number; userId?: number; importedRating: number | null; importedCount: number | null; onSignIn: () => void }

async function request(path: string, options: RequestInit = {}) {
  const response = await fetch(`http://127.0.0.1:8000/ratings/${path}`, options)
  const body = await response.json()
  if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : 'Could not save this rating. Please try again.')
  return body
}

function authHeaders() {
  return { Authorization: `Bearer ${sessionStorage.getItem('fragfriend_access_token')}`, 'Content-Type': 'application/json' }
}

export default function FragranceRating({ fragranceId, userId, importedRating, importedCount, onSignIn }: Props) {
  const [source, setSource] = useState('imported')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [rating, setRating] = useState(0)
  const [saved, setSaved] = useState<number | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const returnFocus = trigger.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      returnFocus?.focus()
    }
  }, [open])

  useEffect(() => {
    let active = true
    Promise.all([
      request(String(fragranceId)),
      userId ? request(`${fragranceId}/mine`, { headers: authHeaders() }) : Promise.resolve({ rating: null }),
    ]).then(([total, mine]) => {
      if (!active) return
      setSummary(total)
      setSaved(mine.rating)
      setRating(mine.rating ?? 0)
    }).catch(() => { if (active) setError('Could not load FragFriend ratings. Reopen this fragrance to try again.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [fragranceId, userId])

  async function submit() {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const result = await request(String(fragranceId), { method: 'POST', headers: authHeaders(), body: JSON.stringify({ rating }) })
      setSummary(result)
      setSaved(result.rating)
      setSource('fragfriend')
      setMessage('Your rating has been saved.')
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save your rating.')
    } finally { setSaving(false) }
  }

  const average = source === 'imported' ? importedRating : summary?.average
  const count = source === 'imported' ? importedCount : summary?.count
  const fill = hover ?? rating
  return <>
    <p className="detail-summary">
      Rating: {importedRating !== null ? importedRating.toFixed(2) : 'Not rated'}
      {importedCount !== null && ` from ${importedCount.toLocaleString()} votes`}
    </p>
    <div className="rating-compact">
      <span className="rating-stars rating-stars-preview" aria-label={saved == null ? 'You have not rated this fragrance' : `Your rating: ${saved} out of 5 stars`}>
        {[1, 2, 3, 4, 5].map(star => <span className="rating-star" key={star} aria-hidden="true">
          <span className="rating-star-empty">★</span>
          <span className="rating-star-fill" style={{ width: String(Math.max(0, Math.min(1, (saved ?? 0) - star + 1)) * 100) + '%' }}>★</span>
        </span>)}
      </span>
      <button ref={trigger} type="button" className="rating-link" aria-haspopup="dialog" onClick={() => { setRating(saved ?? 0); setHover(null); setMessage(''); setOpen(true) }}>Rate</button>
    </div>
    {open && createPortal(<div className="rating-popup-backdrop" onClick={event => { event.stopPropagation(); if (!saving) setOpen(false) }}>
      <div ref={dialog} className="fragrance-rating rating-popup" role="dialog" aria-modal="true" aria-labelledby="rating-popup-title" tabIndex={-1}
        onClick={event => event.stopPropagation()}
        onKeyDown={event => {
          if (event.key === 'Escape') { event.stopPropagation(); if (!saving) setOpen(false) }
          if (event.key === 'Tab') {
            const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), select, input:not(:disabled)') ?? [])
            const first = controls[0]
            const last = controls[controls.length - 1]
            if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus() }
            else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first?.focus() }
          }
        }}>
      <button type="button" className="rating-popup-close" aria-label="Close rating popup" disabled={saving} onClick={() => setOpen(false)}>×</button>
      <h3 id="rating-popup-title">Rate this fragrance</h3>
      <p>FragFriend votes are counted separately from the original website ratings.</p>
    <label className="rating-source">Rating source
      <select value={source} onChange={event => setSource(event.target.value)}>
        <option value="imported">Imported website ratings</option>
        <option value="fragfriend">FragFriend community</option>
      </select>
    </label>
    <p>{source === 'fragfriend' && !summary ? (loading ? 'Loading ratings…' : 'Ratings unavailable') : <>
      {average == null ? 'Not rated' : Number(average).toFixed(2) + ' / 5'}
      {count == null ? '' : ' · ' + count.toLocaleString() + (count === 1 ? ' vote' : ' votes')}
    </>}</p>
    {userId ? <>
      <p className="rating-instruction">Your FragFriend rating · half-star increments</p>
      <div className="rating-stars" role="radiogroup" aria-label="Your rating" onMouseLeave={() => setHover(null)}>
        {[1, 2, 3, 4, 5].map(star => <span className="rating-star" key={star}>
          <span aria-hidden="true" className="rating-star-empty">★</span>
          <span aria-hidden="true" className="rating-star-fill" style={{ width: String(Math.max(0, Math.min(1, fill - star + 1)) * 100) + '%' }}>★</span>
          {[star - 0.5, star].map((value, half) => <input key={value} type="radio" name={`fragrance-rating-${fragranceId}`} aria-label={`${value} out of 5 stars`} checked={rating === value} disabled={loading || saving} onChange={() => { setRating(value); setMessage('') }} onMouseEnter={() => setHover(value)} className={half ? 'star-right' : 'star-left'} />)}
        </span>)}
      </div>
      <div className="rating-submit-row"><span>{rating ? `${rating} / 5` : 'Choose a rating'}</span>
        <button type="button" disabled={loading || saving || !rating || rating === saved} onClick={() => void submit()}>{saving ? 'Saving…' : saved == null ? 'Submit rating' : 'Update rating'}</button>
      </div>
      <small>One vote per fragrance. Updating your rating replaces your previous vote.</small>
    </> : <button type="button" onClick={() => { setOpen(false); onSignIn() }}>Sign in to rate</button>}
    {error && <p role="alert" className="rating-error">{error}</p>}
    {message && <p role="status">{message}</p>}
      </div>
    </div>, document.body)}
  </>
}
