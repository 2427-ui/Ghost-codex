import { useEffect, useId, useMemo, useRef, useState } from 'react'
import svg from './ghost/mascot-eye-svg'
import type { Activity, Runtime, Settings } from '../../../shared/types'
import { useVisualEnvironment } from './visual-effects'

export function Ghost({ activity = 'idle', connection = 'disconnected', motion = 'full', small = false }: { activity?: Activity; connection?: Runtime['connection']; motion?: Settings['motion']; small?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  // Each eye owns its paint servers, including when a small avatar is also mounted.
  const artwork = useMemo(() => svg
    .replace(/\bid="([^"]+)"/g, `id="$1-${id}"`)
    .replace(/url\(#([^)]+)\)/g, `url(#$1-${id})`)
    .replace(/href="#([^"]+)"/g, `href="#$1-${id}"`), [id])
  const { visible, reduced } = useVisualEnvironment()
  const effectiveMotion = motion === 'off' ? 'off' : reduced ? 'reduced' : motion
  const previousActivity = useRef(activity)
  const [feedback, setFeedback] = useState(false)
  useEffect(() => {
    const completed = activity === 'completed' && previousActivity.current !== 'completed'
    previousActivity.current = activity
    setFeedback(completed && visible && effectiveMotion === 'full')
    if (completed && visible && effectiveMotion === 'full') {
      const timer = setTimeout(() => setFeedback(false), 850)
      return () => clearTimeout(timer)
    }
  }, [activity, visible, effectiveMotion])
  useEffect(() => {
    const element = ref.current!
    if (small || effectiveMotion !== 'full' || !visible || ['interrupted', 'error'].includes(activity)) {
      element.style.removeProperty('--eye-x'); element.style.removeProperty('--eye-y')
      return
    }
    const move = (event: PointerEvent) => {
      const bounds = element.getBoundingClientRect()
      const x = Math.max(-4, Math.min(4, (event.clientX - bounds.x - bounds.width / 2) / 70))
      const y = Math.max(-3, Math.min(3, (event.clientY - bounds.y - bounds.height / 2) / 100))
      element.style.setProperty('--eye-x', `${x}px`)
      element.style.setProperty('--eye-y', `${y}px`)
    }
    window.addEventListener('pointermove', move, { passive: true })
    return () => window.removeEventListener('pointermove', move)
  }, [small, effectiveMotion, visible, activity])
  const connectionLabel = { connected: 'ONLINE', connecting: 'CONNECTING', disconnected: 'OFFLINE' }[connection]
  const activityLabel = { idle: '等待指令', running: '正在执行', approval: '等待确认', completed: '任务完成', interrupted: '任务停止', error: '需要检查' }[activity]
  return <div ref={ref} className={`ghost-stage ${small ? 'small' : ''}`} data-activity={activity} data-connection={connection} data-feedback={feedback ? 'complete' : 'none'} data-motion={effectiveMotion} data-paused={!visible} role="img" aria-label={`Ghost：${activityLabel} · ${connectionLabel}`}>
    <div className="ghost-orbit orbit-one" /><div className="ghost-orbit orbit-two" />
    <span className="ghost-coordinate coordinate-left">G · 01</span><span className="ghost-coordinate coordinate-right">{connectionLabel}</span>
    <div className="ghost-eye" dangerouslySetInnerHTML={{ __html: artwork }} />
    <div className="ghost-ground" /><div className="ghost-cross cross-one" /><div className="ghost-cross cross-two" />
  </div>
}
