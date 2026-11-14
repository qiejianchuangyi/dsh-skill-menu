/**
 * Host-half smoke test: no DSH runtime needed.
 *   node --test tests/
 *
 * Proves the route registers, returns sorted rows for the session scope,
 * filters nothing away silently (userInvocable is passed through), and
 * survives a skills service that rejects the scoped call.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { apply } from '../index.js'

// 磁盘扫描会读本机真实的技能目录，测试里关掉，保证断言只看桩数据。
process.env.DSH_SKILL_MENU_DISK_SCAN = '0'

const makeCtx = (list, options = {}) => {
  let route
  const ctx = {
    webServer: {
      register(candidate) {
        route = candidate
        return () => { route = undefined }
      },
    },
    effect(fn) {
      fn()
      return () => {}
    },
    get(name) {
      if (name === 'agents') {
        return options.noAgents ? undefined : { get: () => ({ ctx: { scoped: true } }) }
      }
      if (name === 'skills') return { list }
      return undefined
    },
  }
  return { ctx, route: () => route }
}

const call = (route, url, method = 'GET', remoteAddress = '127.0.0.1') => new Promise((resolve) => {
  const req = { method, url, socket: { remoteAddress } }
  const res = {
    status: 0,
    headers: {},
    body: '',
    writeHead(status, headers) {
      this.status = status
      this.headers = headers || {}
    },
    end(body) {
      this.body = body || ''
      resolve({ status: this.status, body: JSON.parse(this.body || 'null') })
    },
  }
  route.handler(req, res).catch((error) => resolve({ status: 0, body: { ok: false, error: String(error) } }))
})

const sample = [
  { name: 'zulu', description: 'last', source: 'user-dsh', provider: 'fs', invocation: { modelInvocable: true, userInvocable: true } },
  { name: 'alpha', description: 'first', source: 'bundled', provider: 'fs', invocation: { modelInvocable: false, userInvocable: false } },
]

test('lists every skill sorted by name, with invocation flags passed through', async () => {
  const { ctx, route } = makeCtx(async () => sample)
  apply(ctx)
  assert.ok(route(), 'route registered')
  const response = await call(route(), '/dsh-skill-menu/list?sessionId=s1')
  assert.equal(response.status, 200)
  assert.equal(response.body.ok, true)
  assert.deepEqual(response.body.skills.map((row) => row.name), ['alpha', 'zulu'])
  assert.deepEqual(response.body.skills[0], {
    name: 'alpha',
    description: 'first',
    whenToUse: '',
    source: 'bundled',
    provider: 'fs',
    modelInvocable: false,
    userInvocable: false,
    managerSource: false,
  })
})

test('falls back to the global layer when the scoped call rejects', async () => {
  let callCount = 0
  const { ctx, route } = makeCtx(async () => {
    callCount += 1
    if (callCount === 1) throw new Error('bad scope')
    return sample
  })
  apply(ctx)
  const response = await call(route(), '/dsh-skill-menu/list?sessionId=s1')
  assert.equal(response.status, 200)
  assert.equal(response.body.skills.length, 2)
  assert.equal(callCount, 2)
})

test('survives a composition without an agents service', async () => {
  const { ctx, route } = makeCtx(async () => sample, { noAgents: true })
  apply(ctx)
  const response = await call(route(), '/dsh-skill-menu/list?sessionId=s1')
  assert.equal(response.status, 200)
  assert.equal(response.body.skills.length, 2)
})

test('rejects a non-GET method with 405', async () => {
  const { ctx, route } = makeCtx(async () => sample)
  apply(ctx)
  const response = await call(route(), '/dsh-skill-menu/list', 'POST')
  assert.equal(response.status, 405)
})

test('answers loopback only, so a direct LAN peer gets 403', async () => {
  const { ctx, route } = makeCtx(async () => sample)
  apply(ctx)
  const response = await call(route(), '/dsh-skill-menu/list', 'GET', '192.168.1.40')
  assert.equal(response.status, 403)
  assert.equal(response.body.ok, false)
})

test('reports how many skills still lack a Chinese note', async () => {
  const { ctx, route } = makeCtx(async () => sample)
  apply(ctx)
  const response = await call(route(), '/dsh-skill-menu/list?sessionId=s1')
  assert.equal(response.body.zhPending, 2, 'two English descriptions are still untranslated')
  assert.equal(response.body.zhAvailable, false, 'no translator and no llm service in this stub')
})

test('uses a Chinese description the skill author already wrote', async () => {
  const { ctx, route } = makeCtx(async () => [{
    name: 'native-zh',
    description: '读写画布文件，查看现状并结构化改图，支持导出图片和视频帧序列。',
    source: 'user-dsh',
    provider: 'fs',
  }])
  apply(ctx)
  const response = await call(route(), '/dsh-skill-menu/list?sessionId=s1')
  const row = response.body.skills[0]
  assert.equal(row.zhSource, 'native')
  assert.match(row.zh, /读写画布文件/)
  assert.equal(response.body.zhPending, 0)
})