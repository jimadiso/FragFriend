import type { BookmarkedFragrance } from '../services/bookmarkApi'
import FragranceImage from './FragranceImage'
import FragranceRating from './FragranceRating'
import { toScentTitle } from '../utils/searchFilters'

export type ComparisonDetails = {
  top_notes: string | null
  middle_notes: string | null
  base_notes: string | null
  flat_notes?: string | null
  perfumer1?: string | null
  perfumer2?: string | null
  url?: string | null
  mainaccord1: string | null
  mainaccord2: string | null
  mainaccord3: string | null
  mainaccord4: string | null
  mainaccord5: string | null
}

type Props = {
  fragrance: BookmarkedFragrance
  details?: ComparisonDetails
  userId?: number
  onSignIn: () => void
}

export default function FragranceComparisonCard({ fragrance, details, userId, onSignIn }: Props) {
  const accords = [details?.mainaccord1, details?.mainaccord2, details?.mainaccord3,
    details?.mainaccord4, details?.mainaccord5].filter((value): value is string => Boolean(value))
  const perfumers = [details?.perfumer1, details?.perfumer2].filter(Boolean)
  return <article className="detail-modal comparison-detail-card" aria-label={`${fragrance.brand} ${fragrance.perfume}`}>
    <div className="detail-image-wrapper"><FragranceImage fragrance={fragrance} detail /></div>
    <div className="detail-content">
      <p className="detail-brand">{fragrance.brand}</p>
      <h2>{fragrance.perfume}</h2>
      <p className="detail-summary">{fragrance.year ?? 'Year unknown'} · {fragrance.gender ?? 'Unisex'}</p>
      <FragranceRating fragranceId={fragrance.id} userId={userId} importedRating={fragrance.rating_value}
        importedCount={fragrance.rating_count} onSignIn={onSignIn} />
      {details?.flat_notes && <div className="detail-notes"><div><h3>Notes (pyramid not specified)</h3><p>{toScentTitle(details.flat_notes)}</p></div></div>}
      {(details?.top_notes || details?.middle_notes || details?.base_notes || !details?.flat_notes) &&
        <div className="detail-notes">
          <div><h3>Top notes</h3><p>{details?.top_notes ? toScentTitle(details.top_notes) : 'Not listed'}</p></div>
          <div><h3>Middle notes</h3><p>{details?.middle_notes ? toScentTitle(details.middle_notes) : 'Not listed'}</p></div>
          <div><h3>Base notes</h3><p>{details?.base_notes ? toScentTitle(details.base_notes) : 'Not listed'}</p></div>
        </div>}
      <div className="detail-accords"><h3>Main accords</h3><div>
        {accords.length ? accords.map(accord => <span key={accord}>{toScentTitle(accord)}</span>) : <span>Not listed</span>}
      </div></div>
      {perfumers.length > 0 && <p className="detail-perfumer">Perfumer: {perfumers.join(', ')}</p>}
      {details?.url && <a className="detail-source" href={details.url} target="_blank" rel="noreferrer">View original listing →</a>}
    </div>
  </article>
}
