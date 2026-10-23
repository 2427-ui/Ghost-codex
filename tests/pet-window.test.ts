import { test } from 'node:test'
import assert from 'node:assert/strict'
import { collapsedPetBounds, fitPetBounds, PET_SIZE, resizedPetBounds } from '../src/main/pet-window'

test('pet expands around the eye anchor and collapses without drifting', () => {
  const area = { x: 0, y: 0, width: 1920, height: 1040 }
  const original = { x: 1500, y: 700, ...PET_SIZE }
  const expanded = resizedPetBounds(original, true, area)
  assert.equal(expanded.x + expanded.width, original.x + original.width)
  assert.equal(expanded.y + expanded.height, original.y + original.height)
  assert.deepEqual(resizedPetBounds(expanded, false, area), original)
})
test('pet resizing and legacy window bounds stay visible on smaller/negative-coordinate displays', () => {
  const area = { x: -1280, y: 0, width: 1280, height: 720 }
  const expanded = resizedPetBounds({ x: -1270, y: 10, ...PET_SIZE }, true, area)
  assert.ok(expanded.x >= area.x && expanded.y >= area.y)
  assert.ok(expanded.x + expanded.width <= 0)
  assert.deepEqual(collapsedPetBounds({ x: 0, y: 0, width: 276, height: 170 }), { x: 80, y: -66, ...PET_SIZE })
  assert.equal(fitPetBounds({ x: 3000, y: 2000, ...PET_SIZE }, area).x, -196)
})
