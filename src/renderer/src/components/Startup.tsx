import { useEffect, useRef } from 'react'
import { Ghost } from './Ghost'
import type { Settings } from '../../../shared/types'
import { STARTUP_DURATION, startupScene } from './startup-scene'

const STARTUP_KEY = 'ghost-startup-seen'
export function shouldPlayStartup(settings: Settings) {
  let seen = false
  try { seen = sessionStorage.getItem(STARTUP_KEY) === '1'; sessionStorage.setItem(STARTUP_KEY, '1') } catch { /* A blocked store must not prevent startup. */ }
  return settings.startupAnimation !== false && settings.motion !== 'off' && !seen
}

export function Startup({ motion, onFinish }: { motion: Settings['motion']; onFinish: () => void }) {
  const root = useRef<HTMLDivElement>(null)
  const fullMotion = motion === 'full' && !matchMedia('(prefers-reduced-motion: reduce)').matches
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const duration = motion === 'off' ? 0 : motion === 'reduced' || media.matches ? 160 : STARTUP_DURATION
    const element = root.current!
    let frame = 0, finished = false
    const finish = () => { if (!finished) { finished = true; cancelAnimationFrame(frame); onFinish() } }
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); finish() }
    }
    const visibility = () => { if (document.hidden) finish() }
    document.addEventListener('keydown', keydown, true)
    document.addEventListener('visibilitychange', visibility)
    media.addEventListener('change', finish)
    // A stalled animation frame must never block access to the workspace.
    const deadline = setTimeout(finish, duration + 500)
    try {
      const width = innerWidth, height = innerHeight
      const target = document.querySelector('.hero .ghost-eye')?.getBoundingClientRect()
      const endX = target ? target.x + target.width / 2 : width / 2
      const endY = target ? target.y + target.height / 2 : height * .38
      const wordmark = document.querySelector('.hero-wordmark')?.getBoundingClientRect()
      const workspace = document.querySelector<HTMLElement>('.app-shell')
      const endWordmarkY = wordmark ? wordmark.y + wordmark.height / 2 : height * .58
      element.style.setProperty('--landing-size', `${target?.width || 224}px`)
      element.dataset.mode = duration > 160 ? 'full' : 'reduced'
      const started = performance.now()
      const draw = (now: number) => {
        try {
          if (finished) return
          const elapsed = now - started
          if (duration > 160) {
            const scene = startupScene(elapsed)
            element.dataset.phase = scene.phase
            element.style.setProperty('--scene-opacity', `${scene.opacity}`)
            const cx = width / 2 + (endX - width / 2) * scene.arrival
            const cy = height * .42 + (endY - height * .42) * scene.arrival
            const heroSize = target?.width || 224
            const introSize = Math.min(360, height * .39, width * .36)
            element.style.setProperty('--landing-size', `${introSize + (heroSize - introSize) * scene.arrival}px`)
            element.style.setProperty('--intro-x', `${cx}px`)
            element.style.setProperty('--intro-y', `${cy}px`)
            element.style.setProperty('--wordmark-y', `${height * .73 + (endWordmarkY - height * .73) * scene.arrival}px`)
            element.style.setProperty('--eye-reveal', `${scene.eyeReveal * (1 - scene.handoff)}`)
            element.style.setProperty('--eye-open', `${scene.eyeOpen}`)
            element.style.setProperty('--iris-scale', `${.65 + .35 * scene.eyeOpen}`)
            element.style.setProperty('--look-x', `${scene.look}px`)
            element.style.setProperty('--metal-spin', `${scene.metalSpin}deg`)
            element.style.setProperty('--bezel-spin', `${-scene.metalSpin * .65}deg`)
            element.style.setProperty('--highlight', `${scene.highlight}`)
            element.style.setProperty('--identity', `${scene.identity * (1 - scene.arrival)}`)
            element.style.setProperty('--arrival-cards', `${scene.cards}`)
            workspace?.style.setProperty('--arrival-sidebar', `${scene.sidebar}`)
            workspace?.style.setProperty('--arrival-cards', `${scene.cards}`)
            workspace?.style.setProperty('--arrival-composer', `${scene.composer}`)
            workspace?.style.setProperty('--arrival-eye', `${scene.handoff}`)
          } else element.style.setProperty('--startup-opacity', `${1 - Math.min(1, elapsed / Math.max(1, duration))}`)
          element.style.setProperty('--startup-progress', `${Math.min(1, elapsed / Math.max(1, duration))}`)
          if (elapsed >= duration) finish(); else frame = requestAnimationFrame(draw)
        } catch { finish() }
      }
      frame = requestAnimationFrame(draw)
    } catch { finish() }
    return () => {
      const workspace = document.querySelector<HTMLElement>('.app-shell')
      for (const key of ['--arrival-sidebar', '--arrival-cards', '--arrival-composer', '--arrival-eye']) workspace?.style.removeProperty(key)
      finished = true; cancelAnimationFrame(frame); clearTimeout(deadline)
      document.removeEventListener('keydown', keydown, true)
      document.removeEventListener('visibilitychange', visibility)
      media.removeEventListener('change', finish)
    }
  }, [motion, onFinish])
  return <div ref={root} className="startup-overlay" data-mode={fullMotion ? 'full' : 'reduced'} role="dialog" aria-modal="true" aria-label="Ghost 启动动画" onKeyDownCapture={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onFinish() } }}>
    <div className="startup-identity" aria-hidden="true"><span>GHOST STUDIO</span><strong>GHOST<span>.</span></strong><small>正在唤醒工作空间</small></div>
    <div className="startup-eye" aria-hidden="true"><div className="startup-bezel" /><Ghost small motion="off" /></div>
    <button autoFocus className="startup-skip secondary-button" onClick={onFinish}>跳过<span>Esc</span></button>
  </div>
}
