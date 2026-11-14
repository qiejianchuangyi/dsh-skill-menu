/**
 * @qiejianchuangyi/dsh-skill-menu — Host half.
 *
 * One read-only JSON route that lists the skills the requesting Session can
 * actually invoke: `ctx.skills.list({ scope })`, where `scope` is the Agent's
 * own Context so preset-scoped skills are merged in on top of the global layer.
 * No state is written; the Client half never touches the filesystem.
 */

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
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

/**
 * 四个标准技能目录 + 技能管家的收藏目录。DSH 的 skills 服务按 Agent 作用域
 * 给一份视图，新建的 skill 要等那层视图刷新才会出现；这里直接读盘，把服务
 * 还没看到的 skill 补进面板，装完立刻能看到。
 */
/** 会话自己的工作目录：优先问 workingDirectory 服务，再退回 Agent 携带的字段。 */
const sessionCwd = (ctx, agent) => {
  if (!agent) return undefined
  const service = safe(() => ctx.get('workingDirectory'))
  const fromService = service && typeof service.get === 'function'
    ? safe(() => service.get(agent.session))
    : undefined
  return fromService
    || safe(() => agent.options && agent.options.cwd)
    || safe(() => agent.session && agent.session.cwd)
    || undefined
}

const skillRoots = (cwd) => {
  const roots = [
    { dir: path.join(os.homedir(), '.dsh', 'skills'), source: 'user-dsh', provider: 'filesystem-scan' },
    { dir: path.join(os.homedir(), '.agents', 'skills'), source: 'user-agents', provider: 'filesystem-scan' },
    {
      dir: path.join(os.homedir(), '.dsh', 'skills-manager'),
      source: 'manager',
      provider: 'dsh-skills-manager',
      manager: true,
    },
  ]
  if (cwd) {
    roots.push({ dir: path.join(cwd, '.dsh', 'skills'), source: 'project-dsh', provider: 'filesystem-scan' })
    roots.push({ dir: path.join(cwd, '.agents', 'skills'), source: 'project-agents', provider: 'filesystem-scan' })
  }
  return roots
}

const scanSkillRoots = async (known, cwd) => {
  if (process.env.DSH_SKILL_MENU_DISK_SCAN === '0') return []
  const seen = new Set(known.map((name) => String(name).toLowerCase()))
  const found = []
  const walk = async (dir, depth, root) => {
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
        await walk(full, depth + 1, root)
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
        source: root.source,
        provider: root.provider,
        managerSource: Boolean(root.manager),
        diskSource: true,
        path: full,
        modelInvocable: true,
        userInvocable: true,
      })
    }
  }
  for (const root of skillRoots(cwd)) {
    await walk(root.dir, 1, root)
  }
  return found
}

/**
 * 中文说明缓存。人工词条（Client 的 CATALOG）只覆盖已知技能，用户之后新下载的
 * skill 不可能等人工补词，所以这里用 DSH 自带的 translator 服务自动把技能自述
 * 译成中文，落盘在 ~/.dsh/skill-menu/zh.json，下次直接命中缓存，不再联网。
 * 中文自述的 skill（作者本来就写了中文）原样使用，不翻译。
 */
const ZH_DIR = path.join(os.homedir(), '.dsh', 'skill-menu')
const ZH_FILE = path.join(ZH_DIR, 'zh.json')
const CJK_RE = /[\u3400-\u9fff]/
const hasCJK = (text) => CJK_RE.test(String(text || ''))

/**
 * 作者本来就写了中文说明的 skill（不是夹几个中文词的英文说明）才原样使用：
 * 中文字符够多，且在整句字符里占比够高。
 */
const looksChinese = (text) => {
  const value = String(text || '')
  const hits = value.match(/[\u3400-\u9fff]/g)
  const count = hits ? hits.length : 0
  if (count === 0) return false
  return count >= 12 && count / value.length >= 0.2
}

const zhSignature = (row) => createHash('sha1')
  .update(String(row.description || '') + '\n' + String(row.whenToUse || ''))
  .digest('hex')
  .slice(0, 16)

let zhCache = null
let zhTimer = null

const loadZh = async () => {
  if (zhCache) return zhCache
  zhCache = { version: 1, entries: {} }
  try {
    const parsed = JSON.parse(await readFile(ZH_FILE, 'utf8'))
    if (parsed && typeof parsed === 'object' && parsed.entries && typeof parsed.entries === 'object') {
      zhCache = parsed
      if (typeof zhCache.version !== 'number') zhCache.version = 1
    }
  } catch { /* 首次运行没有缓存文件，用空表 */ }
  return zhCache
}

/** 合并写盘：一次请求可能连续补几条，等 400ms 攒成一次写。 */
const persistZh = () => {
  if (zhTimer) return
  zhTimer = setTimeout(() => {
    zhTimer = null
    const snapshot = JSON.stringify(zhCache || { version: 1, entries: {} }, null, 2)
    mkdir(ZH_DIR, { recursive: true })
      .then(() => writeFile(ZH_FILE, snapshot, 'utf8'))
      .catch(() => { /* 写不进去只影响下次启动，不影响本次显示 */ })
  }, 400)
  if (typeof zhTimer.unref === 'function') zhTimer.unref()
}

/** 把缓存里的中文说明挂到行上。中文自述的行直接标成 native。 */
const applyZh = async (rows) => {
  const cache = await loadZh()
  for (const row of rows) {
    if (looksChinese(row.description)) {
      row.zh = String(row.description).trim()
      row.zhSource = 'native'
      continue
    }
    const hit = cache.entries[row.name]
    if (hit && hit.zh && hit.signature === zhSignature(row)) {
      row.zh = hit.zh
      row.zhSource = 'cache'
    }
  }
}

/** 逐个来源试：不指定来源（服务自己挑），再试 bing、google。 */
const translateText = async (ctx, text) => {
  const translator = safe(() => ctx.get('translator'))
  if (!translator || typeof translator.resolve !== 'function' || typeof translator.translate !== 'function') return null
  for (const provider of [undefined, 'bing', 'google']) {
    try {
      const request = { text, targetLanguage: 'zh-CN' }
      if (provider) request.provider = provider
      const spec = translator.resolve(request)
      if (!spec) continue
      const out = await translator.translate(spec)
      const zh = String(out || '').replace(/\s+/g, ' ').trim()
      if (zh && hasCJK(zh)) return zh
    } catch { /* 这个来源不通，换下一个 */ }
  }
  return null
}

const zhInFlight = new Set()

/** 当前默认模型路由；没有选择就用第一个可用 provider 的第一个模型。 */
const routeOf = (ctx) => {
  const llm = safe(() => ctx.get('llm'))
  if (!llm || typeof llm.stream !== 'function') return null
  const selection = safe(() => ctx.get('agentDefaultModel').currentSelection())
  if (selection && selection.provider && selection.model) {
    return { provider: String(selection.provider), model: String(selection.model) }
  }
  const providers = safe(() => llm.listProviders())
  const first = Array.isArray(providers) ? providers[0] : null
  if (!first || !first.id) return null
  const models = safe(() => llm.listModels(first.id))
  if (!models || typeof models.then !== 'function') return null
  return { provider: String(first.id), models }
}

/** 用本机默认模型批量改写中文说明；只发一次请求，结果进缓存。 */
const askModel = async (ctx, route, payload) => {
  const llm = safe(() => ctx.get('llm'))
  if (!llm) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60000)
  let text = ''
  try {
    const stream = llm.stream({
      provider: route.provider,
      model: route.model,
      system: '你是技能目录的中文编辑。把英文的 Agent Skill 说明改写成简洁中文，面向普通用户，说清"做什么"，不逐字直译，不写营销词。只输出 JSON。',
      messages: [{
        role: 'user',
        content: [{
          type: 'text',
          text: '为下面每个技能写一句中文说明（8 到 32 个字，说明做什么，不要以技能名开头）。'
            + '严格按 {"items":[{"name":"技能名","zh":"中文说明"}]} 输出，不要代码块，不要解释。\n\n'
            + JSON.stringify(payload),
        }],
      }],
      temperature: 0,
      maxTokens: 1600,
      signal: controller.signal,
    })
    for await (const chunk of stream) {
      if (!chunk) continue
      if (chunk.type === 'text-delta') text += chunk.text
      else if (chunk.type === 'finish' && chunk.reason && chunk.reason.kind === 'error') return null
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
  const raw = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1))
    return Array.isArray(parsed.items) ? parsed.items : null
  } catch {
    return null
  }
}

let llmBusy = false
let llmFailAt = 0

/** 没有 translator 服务时（多数 profile 都是这样）走本机模型，一次批量补一批。 */
const warmLlm = (ctx, missing) => {
  if (llmBusy || Date.now() - llmFailAt < 600000) return
  llmBusy = true
  ;(async () => {
    try {
      const route = routeOf(ctx)
      if (!route) return
      let provider = route.provider
      let model = route.model
      if (!model && route.models) {
        const list = await route.models
        model = Array.isArray(list) && list[0] ? String(list[0].id) : undefined
      }
      if (!model) return
      const batch = missing.slice(0, 12)
      const items = await askModel(ctx, { provider, model }, batch.map((row) => ({
        name: row.name,
        description: String(row.description || '').slice(0, 400),
        whenToUse: String(row.whenToUse || '').slice(0, 200),
      })))
      if (!items) {
        llmFailAt = Date.now()
        return
      }
      const cache = await loadZh()
      for (const item of items) {
        const name = item && typeof item.name === 'string' ? item.name : ''
        const zh = item && typeof item.zh === 'string' ? item.zh.replace(/\s+/g, ' ').trim() : ''
        if (!name || !zh || !hasCJK(zh)) continue
        const row = batch.find((entry) => entry.name === name)
        if (!row) continue
        cache.entries[name] = { signature: zhSignature(row), zh, at: Date.now() }
      }
      persistZh()
    } catch {
      llmFailAt = Date.now()
    } finally {
      llmBusy = false
    }
  })()
}

/**
 * 后台补翻译，不阻塞这次响应：面板先按已有中文渲染，客户端看到 zhPending > 0
 * 会自动再拉一次，新词条就位后说明文字自动补上。
 */
const warmZh = (ctx, rows) => {
  const missing = []
  for (const row of rows) {
    if (row.zh || !row.description || looksChinese(row.description)) continue
    missing.push(row)
  }
  if (missing.length === 0) return
  const translator = safe(() => ctx.get('translator'))
  if (translator && typeof translator.translate === 'function') {
    for (const row of missing) {
      if (zhInFlight.has(row.name)) continue
      if (zhInFlight.size >= 6) break
      zhInFlight.add(row.name)
      translateText(ctx, row.description)
        .then(async (zh) => {
          if (!zh) return
          const cache = await loadZh()
          cache.entries[row.name] = { signature: zhSignature(row), zh, at: Date.now() }
          persistZh()
        })
        .catch(() => {})
        .finally(() => zhInFlight.delete(row.name))
    }
    return
  }
  warmLlm(ctx, missing)
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
      agentKeys: agent ? safe(() => Object.keys(agent)) : null,
      agentCwd: agent
        ? (safe(() => agent.cwd)
          || safe(() => agent.meta && agent.meta.cwd)
          || safe(() => agent.session && agent.session.cwd)
          || safe(() => agent.options && agent.options.cwd))
        : null,
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
      const cwd = sessionCwd(ctx, findAgent(ctx.get('agents'), sessionId)) || process.cwd()
      let scanned = 0
      try {
        const extra = await scanSkillRoots(rows.map((row) => row.name), cwd)
        scanned = extra.length
        rows.push(...extra)
      } catch {
        scanned = 0
      }
      rows.sort((a, b) => a.name.localeCompare(b.name))
      await applyZh(rows)
      warmZh(ctx, rows)
      const zhPending = rows.filter((row) => !row.zh).length
      const zhAvailable = Boolean(safe(() => ctx.get('translator')))
        || Boolean(safe(() => ctx.get('llm')))
      const managerCount = rows.filter((row) => row.managerSource).length
      writeJson(res, 200, {
        ok: true,
        generatedAt: Date.now(),
        sessionId,
        managerCount,
        zhPending,
        zhAvailable,
        debug: String(req.url || '').includes('debug=1')
          ? {
            chosen,
            tried,
            managerScanned: scanned,
            scanCwd: cwd,
            agentCwd: diagnostic.agentCwd,
            scanRoots: skillRoots(cwd).map((root) => root.dir),
            services: {
              translator: safe(() => ctx.get('translator')) !== undefined,
              cotTranslation: safe(() => ctx.get('cotTranslation')) !== undefined,
              deepseekAccount: safe(() => ctx.get('deepseekAccount')) !== undefined,
              agentDefaultModel: safe(() => ctx.get('agentDefaultModel')) !== undefined,
            },
            ...diagnostic,
          }
          : undefined,
        skills: rows,
      })
    },
  }), 'dsh-skill-menu: GET ' + LIST_PATH)
}