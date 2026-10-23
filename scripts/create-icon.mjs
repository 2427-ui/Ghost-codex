// Render Studio's vector eye at native Windows sizes instead of drawing a separate logo.
import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import svg from '../src/renderer/src/components/ghost/mascot-eye-svg.js'

const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256]
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 })
  // Remove the halo for a crisp small icon, retaining the actual C3 anatomy.
  const artwork = svg.replace('viewBox="0 0 160 160"', 'viewBox="9 9 142 142"')
  await page.setContent(`<style>
    html,body{margin:0;background:transparent;overflow:hidden}
    svg{display:block;width:100vw;height:100vh;--dsh-fairy-outer-halo-color:#999}
    .dsh-fairy-outer-halo,.dsh-fairy-eye-flicker,.dsh-fairy-glitch-blocks,.dsh-fairy-scanlines{display:none}
  </style>${artwork}`)
  const images = []
  for (const size of sizes) {
    await page.setViewportSize({ width: size, height: size })
    images.push(await page.screenshot({ omitBackground: true }))
  }
  const header = Buffer.alloc(6 + 16 * sizes.length)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(sizes.length, 4)
  let offset = header.length
  sizes.forEach((size, index) => {
    const entry = 6 + 16 * index
    header[entry] = header[entry + 1] = size === 256 ? 0 : size
    header.writeUInt16LE(1, entry + 4)
    header.writeUInt16LE(32, entry + 6)
    header.writeUInt32LE(images[index].length, entry + 8)
    header.writeUInt32LE(offset, entry + 12)
    offset += images[index].length
  })
  await mkdir('resources', { recursive: true })
  await writeFile('resources/ghost.png', images.at(-1))
  await writeFile('resources/ghost.ico', Buffer.concat([header, ...images]))
  console.log(`C3 icon generated: transparent PNG and ICO (${sizes.join(', ')} px).`)
} finally {
  await browser.close()
}
