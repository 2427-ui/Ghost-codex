export interface Rect { x: number; y: number; width: number; height: number }
export const PET_SIZE = { width: 196, height: 236 }
export function collapsedPetBounds(bounds: Rect): Rect {
  return { x: bounds.x + bounds.width - PET_SIZE.width, y: bounds.y + bounds.height - PET_SIZE.height, ...PET_SIZE }
}
export function fitPetBounds(bounds: Rect, area: Rect): Rect {
  return { ...bounds, x: Math.max(area.x, Math.min(bounds.x, area.x + area.width - bounds.width)), y: Math.max(area.y, Math.min(bounds.y, area.y + area.height - bounds.height)) }
}
export function resizedPetBounds(bounds: Rect, expanded: boolean, area: Rect): Rect {
  const size = expanded ? { width: Math.min(420, area.width), height: Math.min(610, area.height - 16) } : PET_SIZE
  return fitPetBounds({ x: bounds.x + bounds.width - size.width, y: bounds.y + bounds.height - size.height, ...size }, area)
}
