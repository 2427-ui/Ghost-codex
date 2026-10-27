import { test } from 'node:test'
import assert from 'node:assert/strict'
import { STARTUP_DURATION, startupScene } from '../src/renderer/src/components/startup-scene'

test('code-only startup opens the mechanical eye and hands off to the workspace', () => {
  assert.equal(STARTUP_DURATION, 2750)
  assert.equal(startupScene(0).phase, 'awaken')
  assert.equal(startupScene(0).eyeReveal, 0)
  assert.ok(startupScene(550).eyeOpen > 0 && startupScene(550).eyeOpen < 1)
  assert.ok(startupScene(1330).eyeOpen < .2)
  assert.equal(startupScene(1600).phase, 'regard')
  assert.equal(startupScene(1600).eyeOpen, 1)
  assert.ok(startupScene(2250).sidebar > startupScene(2250).cards)
  assert.ok(startupScene(2250).cards > startupScene(2250).composer)
  assert.equal(startupScene(2750).opacity, 0)
  assert.equal(startupScene(2750).handoff, 1)
  for (let t = 0; t <= 3000; t += 25) {
    const scene = startupScene(t)
    for (const value of [scene.opacity, scene.eyeOpen, scene.eyeReveal, scene.arrival]) assert.ok(value >= 0 && value <= 1)
  }
})
