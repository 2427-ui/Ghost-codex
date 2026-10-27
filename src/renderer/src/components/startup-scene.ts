// Code-only mechanical eye animation; no game footage is distributed.
export const STARTUP_DURATION = 2750
const smooth = (from: number, to: number, time: number) => {
  const x = Math.max(0, Math.min(1, (time - from) / (to - from)))
  return x * x * (3 - 2 * x)
}

export function startupScene(milliseconds: number) {
  const t = milliseconds / 1000
  const blink = smooth(1.22, 1.32, t) * (1 - smooth(1.34, 1.5, t))
  return {
    phase: t < 1.5 ? 'awaken' : t < 1.85 ? 'regard' : 'arrival',
    eyeReveal: smooth(.05, .32, t),
    eyeOpen: smooth(.25, 1.02, t) * (1 - blink * .92),
    highlight: smooth(.6, 1.1, t),
    metalSpin: -125 * (1 - smooth(0, 1.2, t)),
    look: 4 * smooth(1.5, 1.62, t) * (1 - smooth(1.7, 1.84, t)),
    identity: smooth(.9, 1.4, t),
    arrival: smooth(1.85, 2.6, t),
    handoff: smooth(2.6, 2.75, t),
    opacity: 1 - smooth(1.92, 2.75, t),
    sidebar: smooth(1.92, 2.35, t),
    cards: smooth(2.08, 2.5, t),
    composer: smooth(2.24, 2.73, t),
  }
}
