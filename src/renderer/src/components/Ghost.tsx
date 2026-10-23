import { useEffect, useId, useMemo, useRef, useState } from 'react'
import svg from './ghost/mascot-eye-svg'
import type { Activity, Settings } from '../../../shared/types'

export function Ghost({ activity = 'idle', motion = 'full', small = false }: { activity?: Activity; motion?: Settings['motion']; small?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  // Each eye owns its paint servers, including when a small avatar is also mounted.
  const artwork = useMemo(() => svg
    .replace(/\bid="([^"]+)"/g, `id="$1-${id}"`)
    .replace(/url\(#([^)]+)\)/g, `url(#$1-${id})`)
    .replace(/href="#([^"]+)"/g, `href="#$1-${id}"`), [id])
  const [visible, setVisible] = useState(!document.hidden)
  useEffect(() => {
    const visibility = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', visibility)
    return () => document.removeEventListener('visibilitychange', visibility)
  }, [])
  useEffect(() => {
    if (small || motion !== 'full' || !visible) return
    const element = ref.current!
    const move = (event: PointerEvent) => {
      const bounds = element.getBoundingClientRect()
      const x = Math.max(-4, Math.min(4, (event.clientX - bounds.x - bounds.width / 2) / 70))
      const y = Math.max(-3, Math.min(3, (event.clientY - bounds.y - bounds.height / 2) / 100))
      element.style.setProperty('--eye-x', `${x}px`)
      element.style.setProperty('--eye-y', `${y}px`)
    }
    window.addEventListener('pointermove', move, { passive: true })
    return () => window.removeEventListener('pointermove', move)
  }, [small, motion, visible])
  return <div ref={ref} className={`ghost-stage ${small ? 'small' : ''}`} data-activity={activity} data-motion={motion} data-paused={!visible} role="img" aria-label={`Ghost：${activity}`}>
    <div className="ghost-orbit orbit-one" /><div className="ghost-orbit orbit-two" />
    <span className="ghost-coordinate coordinate-left">G · 01</span><span className="ghost-coordinate coordinate-right">ONLINE</span>
    <div className="ghost-eye" dangerouslySetInnerHTML={{ __html: artwork }} />
    <div className="ghost-ground" /><div className="ghost-cross cross-one" /><div className="ghost-cross cross-two" />
  </div>
}
