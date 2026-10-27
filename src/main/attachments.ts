import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { InputAttachment } from '../shared/types'

export async function importAttachments(directory: string, inputs: { path?: string; name: string; bytes?: Uint8Array }[], authorized: Set<string>): Promise<InputAttachment[]> {
  if (!Array.isArray(inputs) || inputs.length > 20) throw new Error('每次最多添加 20 个附件。')
  const result: InputAttachment[] = []
  for (const input of inputs) {
    let path: string
    if (typeof input.path === 'string' && input.path) path = await realpath(input.path)
    else {
      const bytes = input.bytes
      if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > 20 * 1024 * 1024) throw new Error('粘贴的图片须小于 20 MB。')
      const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71
      const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      if (!png && !jpeg) throw new Error('无路径的剪贴板图片仅支持 PNG/JPEG。')
      const folder = join(directory, 'attachments')
      await mkdir(folder, { recursive: true })
      path = join(folder, `${randomUUID()}.${png ? 'png' : 'jpg'}`)
      await writeFile(path, bytes, { flag: 'wx' })
    }
    const info = await stat(path)
    if (!info.isFile() || info.size > 20 * 1024 * 1024) throw new Error('附件须为不超过 20 MB 的文件。')
    const name = basename(path), extension = name.split('.').at(-1)?.toLowerCase() || ''
    const type = ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(extension) ? 'image' : ['wav', 'mp3', 'm4a', 'ogg', 'flac'].includes(extension) ? 'audio' : 'file'
    const preview = type === 'image' ? `data:image/${extension === 'jpg' ? 'jpeg' : extension};base64,${(await readFile(path)).toString('base64')}` : undefined
    result.push({ id: randomUUID(), path, name, type, preview })
  }
  for (const file of result) authorized.add(file.path)
  return result
}
