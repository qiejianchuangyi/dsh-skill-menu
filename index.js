/**
 * @qiejianchuangyi/dsh-skill-menu — Host half.
 *
 * One read-only JSON route that lists the skills the requesting Session can
 * actually invoke: `ctx.skills.list({ scope })`, where `scope` is the Agent's
 * own Context so preset-scoped skills are merged in on top of the global layer.
 * No state is written; the Client half never touches the filesystem.
 */

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

const LIST_PATH = '/dsh-skill-menu/list'

/**
 * 已安装的 dsh-skills-manager 把自己的外部技能注册成 provider，名字是
 * `dsh-skills-manager-external`。它的仓库/收藏目录里还有尚未进入 provider
 * 的 skill（用户装了但没启用、或装在子目录里），这里直接扫盘补齐，保证
 * 面板列的是“本机能用的全部 skill”，而不只是运行时已合并的那一层。
 */
const MANAGER_PROVIDER = 'dsh-skills-manager-external'

const parseFrontmatter = (text) => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(String(text || ''))
  if (!match) return {}
  const meta = {}
  for (const line of match[1].split(/\r?\n/)) {
    const hit = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line)
    if (!hit) continue
    let value = hit[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    meta[hit[1].toLowerCase()] = value
  }
  return meta
}

const scanManagerSkills = async (known) => {
  const root = path.join(os.homedir(), '.dsh', 'skills-manager')
  const seen = new Set(known.map((name) => String(name).toLowerCase()))
  const found = []
  const walk = async (dir, depth) => {
    if (depth > 3) return
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (!entry || String(entry.name).startsWith('.')) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(full, depth + 1)
        continue
      }
      if (!/^skill\.md$/i.test(entry.name)) continue
      let text = ''
      try {
        text = await readFile(full, 'utf8')
      } catch {
        continue
      }
      const meta = parseFrontmatter(text)
      const name = String(meta.name || path.basename(path.dirname(full))).trim()
      if (!name || seen.has(name.toLowerCase())) continue
      seen.add(name.toLowerCase())
      found.push({
        name,
        description: String(meta.description || '').trim(),
        whenToUse: '',
        source: 'manager',
        provider: 'dsh-skills-manager',
        managerSource: true,
        modelInvocable: true,
        userInvocable: true,
      })
    }
  }
  await walk(root, 0)
  return found
}

/**
 * The list is an inventory of your machine, so it answers loopback peers only.
 * A fronting proxy (the bundled remote Web UI, a reverse proxy on this host)
 * dials 127.0.0.1 and still works; a direct connection from another machine
 * gets 403 instead of the skill names.
 */
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

const isLoopback = (req) => {
  const address = req && req.socket ? req.socket.remoteAddress : undefined
  return typeof address === 'string' && LOOPBACK.has(address)
}

/** The route needs the browser carrier; the skills service stays optional. */
export const inject = ['webServer']

const writeJson = (res, status, payload) => {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(body)
}

/**
 * Build the ways this DSH release may expose the viewing Agent's layers.
 * `skills.list({ scope })` wants a ScopeKey; how that key is reached from a
 * live Agent differs between releases, so every plausible accessor is tried
 * and the widest catalogue wins. A missing session simply yields the global
 * layer, which is the same result as a session whose agent is not live.
 */
/**
 * A live Agent is keyed by its branded SessionId, which some releases expose
 * with a `session-` prefix and some without; the client only ever knows the
 * bare id. Try the exact value, then the prefixed form, then a suffix match.
 */
const findAgent = (agents, sessionId) => {
  if (!agents || !sessionId) return undefined
  const id = String(sessionId)
  try {
    const direct = agents.get(id)
    if (direct) return direct
    if (!id.startsWith('session-')) {
      const prefixed = agents.get('session-' + id)
      if (prefixed) return prefixed
    }
    if (typeof agents.list === 'function') {
      const wanted = id.startsWith('session-') ? [id, id.slice('session-'.length)] : [id, 'session-' + id]
      const hit = agents.list().find((entry) => {
        const candidate = String((entry && entry.id) || '')
        return wanted.includes(candidate) || candidate.endsWith(id)
      })
      if (hit) return hit
    }
  } catch {
    return undefined
  }
  return undefined
}

const safe = (read) => {
  try {
    return read()
  } catch {
    return undefined
  }
}

const viewAttempts = (ctx, sessionId) => {
  const attempts = []
  let agents
  let agent
  let agentIds = null
  let agentError = null
  try {
    agents = ctx.get('agents')
    agent = findAgent(agents, sessionId)
    if (!agent && agents && typeof agents.list === 'function') {
      agentIds = agents.list().map((entry) => String((entry && entry.id) || ''))
    }
  } catch (error) {
    agent = undefined
    agentError = String((error && error.message) || error)
  }
  const skills = safe(() => ctx.get('skills'))
  const agentCtx = safe(() => (agent ? agent.ctx : undefined))
  const agentCtxSkills = safe(() => (agentCtx ? agentCtx.skills : undefined))
  const agentCtxScope = safe(() => (agentCtx ? agentCtx.scope : undefined))
  const agentScope = safe(() => (agent ? agent.scope : undefined))
  const push = (label, run) => attempts.push({ label, run })
  if (agentCtxSkills && typeof agentCtxSkills.list === 'function') {
    push('agent-ctx', () => agentCtxSkills.list())
  }
  if (skills !== undefined && typeof skills.list === 'function') {
    if (agentCtx) push('scope-agent-ctx', () => skills.list({ scope: agentCtx }))
    if (agentCtxScope) push('scope-ctx-scope', () => skills.list({ scope: agentCtxScope }))
    if (agentScope) push('scope-agent-scope', () => skills.list({ scope: agentScope }))
    if (agent) push('scope-agent', () => skills.list({ scope: agent }))
    push('global', () => skills.list({}))
  }
  return {
    attempts,
    agent,
    diagnostic: {
      hasAgents: agents !== undefined,
      hasSkills: skills !== undefined,
      agentFound: agent !== undefined,
      hasAgentCtx: agentCtx !== undefined,
      hasAgentCtxSkills: agentCtxSkills !== undefined,
      hasAgentScope: agentScope !== undefined,
      agentIds,
      agentError,
    },
  }
}

const toRow = (skill) => ({
  name: skill.name,
  description: skill.description || '',
  whenToUse: skill.whenToUse || '',
  source: skill.source || 'unknown',
  provider: skill.provider || '',
  modelInvocable: skill.invocation ? skill.invocation.modelInvocable !== false : true,
  userInvocable: skill.invocation ? skill.invocation.userInvocable !== false : true,
  managerSource: Boolean(skill.managerSource) || skill.provider === MANAGER_PROVIDER,
})

export function apply(ctx) {
  const webServer = ctx.webServer ?? ctx.get('webServer')
  if (webServer === undefined) return

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: LIST_PATH,
    async handler(req, res) {
      if (req.method !== 'GET') {
        writeJson(res, 405, { ok: false, error: 'only GET is supported' })
        return
      }
      if (!isLoopback(req)) {
        writeJson(res, 403, { ok: false, error: '只有本机请求可以读取 skill 列表' })
        return
      }
      const skills = ctx.get('skills')
      if (skills === undefined) {
        writeJson(res, 503, { ok: false, error: '本机没有 skills 服务' })
        return
      }
      let sessionId
      try {
        sessionId = new URL(req.url || LIST_PATH, 'http://localhost').searchParams.get('sessionId') || undefined
      } catch {
        sessionId = undefined
      }
      const { attempts, diagnostic } = viewAttempts(ctx, sessionId)
      const wanted = (result) => (Array.isArray(result) ? result : [])
      const tried = []
      // Read the global layer first: it is the safe baseline and the yardstick
      // for "did the viewer's own layers add anything?".
      let list = []
      let chosen = 'global'
      for (const attempt of attempts) {
        if (attempt.label !== 'global') continue
        try {
          list = wanted(await attempt.run())
          tried.push({ label: attempt.label, count: list.length })
        } catch (error) {
          tried.push({ label: attempt.label, error: String((error && error.message) || error) })
        }
      }
      for (const attempt of attempts) {
        if (attempt.label === 'global') continue
        try {
          const rows = wanted(await attempt.run())
          tried.push({ label: attempt.label, count: rows.length })
          if (rows.length > list.length) {
            list = rows
            chosen = attempt.label
            break
          }
        } catch (error) {
          tried.push({ label: attempt.label, error: String((error && error.message) || error) })
        }
      }
      const rows = list.map(toRow)
      let scanned = 0
      try {
        const extra = await scanManagerSkills(rows.map((row) => row.name))
        scanned = extra.length
        rows.push(...extra)
      } catch {
        scanned = 0
      }
      rows.sort((a, b) => a.name.localeCompare(b.name))
      const managerCount = rows.filter((row) => row.managerSource).length
      writeJson(res, 200, {
        ok: true,
        generatedAt: Date.now(),
        sessionId,
        managerCount,
        debug: String(req.url || '').includes('debug=1')
          ? { chosen, tried, managerScanned: scanned, ...diagnostic }
          : undefined,
        skills: rows,
      })
    },
  }), 'dsh-skill-menu: GET ' + LIST_PATH)
}