import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { CodexClient } from '../src/main/codex'

test('JSONL RPC correlates out-of-order responses, split frames, approvals and errors', async () => {
  const client = new CodexClient(process.execPath, [resolve('tests/fixtures/rpc-server.cjs')])
  try {
    await client.start()
    const [slow, fast] = await Promise.all([client.request('echo', { value: 'slow', delay: 30 }), client.request('echo', { value: 'fast', delay: 1 })])
    assert.equal(slow.value, 'slow'); assert.equal(fast.value, 'fast')
    assert.equal((await client.request('split')).text, 'Ghost 中文')
    assert.equal((await client.request('large-catalog')).artwork.length, 17 * 1024 * 1024)
    const approval = new Promise<any>(resolve => client.once('request', resolve))
    await client.request('approval')
    assert.equal((await approval).params.threadId, 't1')
    await assert.rejects(client.request('fail'), /fixture error/)
    await assert.rejects(client.request('no-response', {}, 30), /超时/)
    const pending = client.request('no-response')
    client.stop()
    await assert.rejects(pending, /关闭/)
  } finally { client.removeAllListeners(); client.stop() }
})

test('process death rejects requests rather than leaving promises pending', async () => {
  const client = new CodexClient(process.execPath, [resolve('tests/fixtures/rpc-server.cjs')])
  try { await client.start(); await assert.rejects(client.request('exit'), /退出/) } finally { client.removeAllListeners(); client.stop() }
})
