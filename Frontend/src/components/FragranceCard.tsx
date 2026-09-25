import type { ReactNode } from 'react'
import type { BookmarkedFragrance } from '../services/bookmarkApi'
import FragranceImage from './FragranceImage'

type Props = {
  fragrance: BookmarkedFragrance
  onOpen?: () => void
  children?: ReactNode
  actions?: ReactNode
  selection?: { selected: boolean; onToggle: () => void }
}

export default function FragranceCard({ fragrance, onOpen, children, actions, selection }: Props) {
  return <article className={`fragrance-card${selection?.selected ? ' is-selected' : ''}${selection ? ' selectable-card' : ''}`}
    onClick={selection ? selection.onToggle : undefined}>
    {children}
    {selection && <button type="button" className="compare-select" aria-pressed={selection.selected}
      aria-label={`${selection.selected ? 'Deselect' : 'Select'} ${fragrance.perfume} for comparison`}
      onClick={event => { event.stopPropagation(); selection.onToggle() }}>
      {selection.selected ? '✓ Selected' : 'Select to compare'}
    </button>}
    <div className="fragrance-image-wrapper"><FragranceImage key={fragrance.id} fragrance={fragrance} /></div>
    <p className="brand">{fragrance.brand}</p>
    <h2>{fragrance.perfume}</h2>
    <p>{fragrance.year ?? 'Year unknown'} · {fragrance.gender ?? 'Unisex'}</p>
    <p className="card-rating">Rating: {fragrance.rating_value !== null ? fragrance.rating_value.toFixed(2) : 'Not rated'}
      {fragrance.rating_count !== null && <span className="card-vote-count"> ({fragrance.rating_count.toLocaleString()} votes)</span>}
    </p>
    {!selection && (actions || (onOpen && <button type="button" className="card-action" onClick={onOpen}>View more info →</button>))}
  </article>
}
