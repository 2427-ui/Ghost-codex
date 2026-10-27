import type { GhostApi } from '../../shared/types'
declare global { interface Window { ghost: GhostApi; ghostFiles?: { path(file: File): string } } }
export {}
