import { useEffect, useState } from 'react'

export function useVisualEnvironment() {
  const [visible, setVisible] = useState(!document.hidden)
  const [nativeVisible, setNativeVisible] = useState(true)
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const visibility = () => setVisible(!document.hidden)
    const preference = () => setReduced(media.matches)
    document.addEventListener('visibilitychange', visibility)
    media.addEventListener('change', preference)
    const unsubscribe = window.ghost.subscribe(event => {
      if (event.type === 'visibility') setNativeVisible(event.visible)
    })
    return () => {
      document.removeEventListener('visibilitychange', visibility)
      media.removeEventListener('change', preference)
      unsubscribe()
    }
  }, [])
  return { visible: visible && nativeVisible, reduced }
}

// One delegated listener, with no idle render loop or per-button React updates.
export function useGlassLight() {
  useEffect(() => {
    const selector = '.new-session,.quick-actions button,.composer-card,.primary-button,.secondary-button,.send-button,.settings-modal,.capability-modal,.pet-status,.pet-tools,.pet-chat'
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    let target: HTMLElement | null = null
    let frame = 0
    let x = 0, y = 0
    const reset = () => {
      cancelAnimationFrame(frame); frame = 0
      target?.style.removeProperty('--glass-x')
      target?.style.removeProperty('--glass-y')
      target = null
    }
    const move = (event: PointerEvent) => {
      const next = event.target instanceof Element ? event.target.closest<HTMLElement>(selector) : null
      const motion = next?.closest('[data-motion]')?.getAttribute('data-motion')
      if (event.pointerType !== 'mouse' || document.hidden || media.matches || motion === 'off' || motion === 'reduced') { reset(); return }
      if (next !== target) { reset(); target = next }
      x = event.clientX; y = event.clientY
      if (!target || frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        if (!target) return
        const rect = target.getBoundingClientRect()
        target.style.setProperty('--glass-x', `${Math.max(0, Math.min(100, (x - rect.x) / rect.width * 100))}%`)
        target.style.setProperty('--glass-y', `${Math.max(0, Math.min(100, (y - rect.y) / rect.height * 100))}%`)
      })
    }
    document.addEventListener('pointermove', move, { passive: true })
    document.addEventListener('pointerleave', reset)
    document.addEventListener('visibilitychange', reset)
    media.addEventListener('change', reset)
    return () => {
      reset()
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerleave', reset)
      document.removeEventListener('visibilitychange', reset)
      media.removeEventListener('change', reset)
    }
  }, [])
}
