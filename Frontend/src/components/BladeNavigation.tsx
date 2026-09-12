import { useEffect, useState, type CSSProperties } from 'react'
import { BLADE_PAGES, EDGE_THRESHOLD, EDGE_BAR_WIDTH, HEADER_CLEARANCE, type BladePage } from './useBladePages'
import './BladeNavigation.css'

function BladePageIcon({ icon }: { icon: 'search' | 'bookmark' }) {
  if (icon === 'bookmark') {
    return <span className="blade-edge-icon blade-edge-bookmark-icon" aria-hidden="true" />
  }

  return (
    <span className="blade-edge-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 5 5" />
      </svg>
    </span>
  )
}

export function BladeNavigation({ page, onNavigate, disabled }: {
  page: BladePage
  onNavigate: (page: BladePage) => void
  disabled: boolean
}) {
  const [edge, setEdge] = useState<'left' | 'right' | null>(null)
  const index = BLADE_PAGES.findIndex(p => p.id === page)
  useEffect(() => {
    let frame = 0
    let x = 0
    let y = 0
    const move = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      x = event.clientX; y = event.clientY
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const width = document.documentElement.clientWidth
        setEdge(y < HEADER_CLEARANCE || y > window.innerHeight - 24 || x > width
          ? null : x < EDGE_THRESHOLD ? 'left' : x > width - EDGE_THRESHOLD ? 'right' : null)
      })
    }
    const leave = () => { cancelAnimationFrame(frame); frame = 0; setEdge(null) }
    window.addEventListener('pointermove', move, { passive: true })
    document.documentElement.addEventListener('pointerleave', leave)
    window.addEventListener('blur', leave)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', move)
      document.documentElement.removeEventListener('pointerleave', leave)
      window.removeEventListener('blur', leave)
    }
  }, [page])

  if (disabled) return null
  return <nav aria-label="Page navigation" style={{ '--blade-width': `${EDGE_BAR_WIDTH}px` } as CSSProperties}>
    {([-1, 1] as const).map(offset => {
      const target = BLADE_PAGES[index + offset]
      if (!target) return null
      const side = offset < 0 ? 'left' : 'right'
      return <button key={side} type="button"
        className={`blade-edge blade-edge-${side} ${edge === side ? 'is-visible' : ''}`}
        aria-label={`Go to ${target.label}`} title={`Go to ${target.label}`}
        onClick={() => onNavigate(target.id)}>
        <span aria-hidden="true">{offset < 0 ? '‹' : '›'}</span>
        <BladePageIcon icon={target.icon} />
        <span className="blade-edge-label">{target.label}</span>
      </button>
    })}
  </nav>
}
