const readline = require('node:readline')
const input = readline.createInterface({ input: process.stdin })
function send(data) { process.stdout.write(JSON.stringify(data) + '\n') }
input.on('line', line => {
  const m = JSON.parse(line)
  if (m.method === 'initialize') return send({ id: m.id, result: { userAgent: 'fixture' } })
  if (m.method === 'echo') return setTimeout(() => send({ id: m.id, result: m.params }), m.params.delay || 0)
  if (m.method === 'fail') return send({ id: m.id, error: { code: 42, message: 'fixture error' } })
  if (m.method === 'large-catalog') return send({ id: m.id, result: { artwork: 'x'.repeat(17 * 1024 * 1024) } })
  if (m.method === 'approval') { send({ id: 'approval-1', method: 'item/commandExecution/requestApproval', params: { threadId: 't1', command: 'echo test' } }); return send({ id: m.id, result: {} }) }
  if (m.method === 'split') { const value = JSON.stringify({ id: m.id, result: { text: 'Ghost 中文' } }) + '\n'; process.stdout.write(value.slice(0, 8)); return setTimeout(() => process.stdout.write(value.slice(8)), 10) }
  if (m.method === 'exit') process.exit(1)
})
