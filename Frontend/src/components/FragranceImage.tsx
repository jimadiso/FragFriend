import { useState } from 'react'

type Props = {
  fragrance: { brand: string; perfume: string; thumbnail_url: string | null; picture_url: string | null }
  detail?: boolean
}

export default function FragranceImage({ fragrance, detail = false }: Props) {
  const src = fragrance.picture_url || fragrance.thumbnail_url
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  if (!src || src === failedSrc) {
    return <div className={detail ? 'detail-image-placeholder' : 'fragrance-image-placeholder'}>
      <span>{fragrance.brand.charAt(0)}</span>
    </div>
  }
  return <img className={detail ? undefined : 'fragrance-image'} src={src}
    alt={`${fragrance.perfume} by ${fragrance.brand}`} loading="lazy"
    onError={() => setFailedSrc(src)} />
}
