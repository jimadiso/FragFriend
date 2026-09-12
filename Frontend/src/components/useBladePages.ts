import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export const BLADE_PAGES = [
  { id: 'search', label: 'Search', icon: 'search' },
  { id: 'saved', label: 'Collections', icon: 'bookmark' },
] as const
export type BladePage = typeof BLADE_PAGES[number]['id']
export const EDGE_THRESHOLD = 90
export const EDGE_BAR_WIDTH = 60
export const HEADER_CLEARANCE = 96

export function useBladePages() {
  const [page, setPage] = useState<BladePage>('search')
  const surface = useRef<HTMLDivElement>(null)
  const scroll = useRef<Partial<Record<BladePage, number>>>({})
  const direction = useRef(1)
  const busy = useRef(false)
  const animation = useRef<Animation | null>(null)

  function navigate(next: BladePage) {
    if (next === page || busy.current) return
    scroll.current[page] = window.scrollY
    direction.current = Math.sign(BLADE_PAGES.findIndex(p => p.id === next) - BLADE_PAGES.findIndex(p => p.id === page))
    busy.current = true
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const element = surface.current
    if (!element || reduced) { setPage(next); return }
    animation.current = element.animate([
      { opacity: 1, transform: 'translateX(0)' },
      { opacity: 0, transform: `translateX(${-direction.current * 64}px)` },
    ], { duration: 160, easing: 'ease-in', fill: 'forwards' })
    animation.current.onfinish = () => setPage(next)
  }

  useLayoutEffect(() => {
    animation.current?.cancel()
    window.scrollTo({ top: scroll.current[page] ?? 0, behavior: 'instant' })
    if (busy.current && surface.current) {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      animation.current = surface.current.animate([
        { opacity: 0, transform: `translateX(${reduced ? 0 : direction.current * 64}px)` },
        { opacity: 1, transform: 'translateX(0)' },
      ], { duration: reduced ? 0 : 260, easing: 'cubic-bezier(.2,.7,.2,1)' })
      surface.current.focus({ preventScroll: true })
    }
    busy.current = false
  }, [page])
  useEffect(() => () => { animation.current?.cancel() }, [])
  return { page, navigate, surface }
}
