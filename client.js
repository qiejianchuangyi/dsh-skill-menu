/**
 * @qiejianchuangyi/dsh-skill-menu — Client half.
 *
 * Two registrations, one module store:
 *   conversation.input.left     the "skill" chip in the composer tool row
 *   conversation.input.overlay  the floating skill list above the composer
 *
 * Data comes from the Host half: GET /dsh-skill-menu/list?sessionId=…
 * The Client never reads skill files itself. Panel and tooltip portal to
 * <body> because the composer sits inside transformed/overflow-hidden
 * containers that would otherwise clip a fixed overlay.
 *
 * Panel shape:
 *   标题 + 排序（推荐/名称/最近）        header
 *   搜索框                              search
 *   置顶 / 最近使用 / 常用 / 按分类     list
 *   收录覆盖率 + 清空使用记录            footer
 */
window.__ModuleLoader__.load({
  id: '@qiejianchuangyi/dsh-skill-menu',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    let ReactDOM = null
    try {
      ReactDOM = require('react-dom')
    } catch { ReactDOM = null }
    const portal = ReactDOM && typeof ReactDOM.createPortal === 'function'
      ? ReactDOM.createPortal
      : (node) => node

    const LIST_PATH = '/dsh-skill-menu/list'
    // true  = 点 skill 后立刻把这句话发出去（真正的调用）
    // false = 只填进输入框，用户自己按回车
    const AUTO_SEND = true
    const PANEL_W = 380
    const TIP_W = 330
    const TRIGGER_ATTR = 'data-dsh-skill-menu-trigger'
    const TIP_SHOW_DELAY = 280
    const TIP_HIDE_DELAY = 140
    const COMMON_MIN_WEIGHT = 70
    const COMMON_LIMIT = 10
    const RECENT_LIMIT = 5
    const PIN_LIMIT = 5

    const STORE_KEYS = { usage: 'dshsm.usage', pins: 'dshsm.pins', sort: 'dshsm.sort' }

    /** 分类：顺序即面板里的分组顺序。 */
    const CATEGORIES = [
      { id: 'doc', label: '文档办公' },
      { id: 'write', label: '写作表达' },
      { id: 'research', label: '研究检索' },
      { id: 'design', label: '设计排版' },
      { id: 'dev', label: '开发排查' },
      { id: 'other', label: '其他' },
    ]
    const CATEGORY_LABEL = {}
    for (const item of CATEGORIES) CATEGORY_LABEL[item.id] = item.label

    /**
     * 中文说明表。每条四个字段，都按“用户视角”写：
     *   short  做什么（≤ 20 字，列表第一行）
     *   scene  适合谁/什么时候（≤ 18 字，列表第二行，弱化显示）
     *   when   触发场景，用户会说的话（悬停第一段）
     *   io     需要什么 → 得到什么（悬停第二段）
     * weight 大众通用度 0-100，决定“常用”区与组内排序，不由名字决定。
     * 未收录的 skill 退回它自带的 description，并如实标注。
     */
    const CATALOG = {
      // ── 开发排查 ────────────────────────────────────────────────
      'dsh-doc': {
        cat: 'dev', weight: 95,
        short: '查 DSH 自身的功能与用法', scene: '不懂某个设置或插件时',
        when: ['不知道某个设置在哪', '想写 DSH 插件或工具'],
        io: '问一句话 → 基于官方文档与源码的回答',
      },
      'find-skills': {
        cat: 'dev', weight: 90,
        short: '找并安装新的技能', scene: '缺能力想扩展时',
        when: ['有没有能处理 X 的技能', '想装个新 skill'],
        io: '说需求 → 候选技能 + 安装方式',
      },
      caveman: {
        cat: 'dev', weight: 80,
        short: '极简语气，砍废话留事实', scene: '嫌回答太长太啰嗦时',
        when: ['想要更短的回答', '嫌回复太啰嗦'],
        io: '任意问题 → 极简回答，技术细节不丢',
      },
      'kimi-webbridge': {
        cat: 'dev', weight: 70,
        short: '操控你的真实浏览器', scene: '网页自动化、抓内容时',
        when: ['帮我在某网站点几下', '把某个网页的内容读下来'],
        io: '给网址和要做的事 → 浏览器里的实际操作',
      },
      'context-compression': {
        cat: 'dev', weight: 60,
        short: '压缩长会话上下文', scene: '任务超长、快塞满时',
        when: ['会话太长快爆上下文了', '想给下一个会话留交接摘要'],
        io: '当前会话 → 结构化摘要，可续接',
      },
      'diagnose-windows-sandbox-acl': {
        cat: 'dev', weight: 55,
        short: '修 Windows 沙箱拒绝访问', scene: '文件读不了写不进时',
        when: ['工作区文件写不进去', '某个目录读不了，报沙箱拒绝'],
        io: '报错路径 → 检查并修复 ACL',
      },
      grilling: {
        cat: 'dev', weight: 50,
        short: '追问拷问你的方案', scene: '决策前压力测试时',
        when: ['这个方案靠谱吗', '帮我把计划挑刺'],
        io: '方案或想法 → 连环追问',
      },
      'grill-me': {
        cat: 'dev', weight: 45,
        short: '追问拷问（同 grilling）', scene: '决策前压力测试时',
        when: ['这个方案靠谱吗', '帮我把计划挑刺'],
        io: '方案或想法 → 连环追问',
      },
      'planning-with-files': {
        cat: 'dev', weight: 45,
        short: '把多步计划落在磁盘上', scene: '长任务怕做到一半乱',
        when: ['这活好几步，容易乱', '想留下进度文件方便下次续'],
        io: '任务 → 计划 / 发现 / 进度三个文件',
      },
      'hindsight-coding-agent': {
        cat: 'dev', weight: 40,
        short: '本机记忆插件的用法', scene: '记忆/知识库相关问题时',
        when: ['想让它记住某件事', '记忆页面是干什么的'],
        io: '问题 → 记忆配置与用法说明',
      },

      // ── 文档办公 ────────────────────────────────────────────────
      office: {
        cat: 'doc', weight: 95,
        short: '做 / 改 Office 和 PDF', scene: '文档生成与转换时',
        when: ['做个 Excel 表格', '把这份 PDF 读一下'],
        io: '需求或文件 → Word / Excel / PPT / PDF',
      },
      'office-docx': {
        cat: 'doc', weight: 85,
        short: '做 / 改 Word 文档', scene: '合同、报告、简历',
        when: ['生成一份 Word 文件', '改现有的 docx'],
        io: '内容或模板 → .docx 文件',
      },
      'office-pptx': {
        cat: 'doc', weight: 85,
        short: '做 / 改 PPT 演示文稿', scene: '汇报、培训、路演',
        when: ['做一版汇报 PPT', '改这套幻灯片'],
        io: '大纲或内容 → .pptx 文件',
      },
      'office-xlsx': {
        cat: 'doc', weight: 85,
        short: '做 / 改 Excel 表格', scene: '数据表、公式、核对',
        when: ['把数据整理成 Excel', '核对表格里的公式'],
        io: '数据或需求 → .xlsx 文件',
      },

      // ── 写作表达 ────────────────────────────────────────────────
      'nature-polishing': {
        cat: 'write', weight: 65,
        short: '论文润色与学术翻译', scene: '稿件语言打磨时',
        when: ['这段英文润色一下', '把这段翻成学术英语'],
        io: '段落 → 润色稿，事实与术语不变',
      },
      'humanizer-zh': {
        cat: 'write', weight: 60,
        short: '中文去 AI 腔', scene: '文案、评论太像套话时',
        when: ['这段太像 AI 写的', '把空话和重复去掉'],
        io: '中文文本 → 更自然的表达',
      },
      'guizang-voice': {
        cat: 'write', weight: 55,
        short: '学你的语气再写', scene: '代笔、改稿要像本人',
        when: ['用我的口吻写一段', '学我的写作风格'],
        io: '旧文章或修改意见 → 语气档案 + 照着写的文字',
      },

      // ── 研究检索 ────────────────────────────────────────────────
      'nature-academic-search': {
        cat: 'research', weight: 70,
        short: '跨库检索文献', scene: '找文献、核对引文时',
        when: ['帮我找这几篇文献', '核对一下参考文献'],
        io: '主题或线索 → 文献清单与检索策略',
      },
      'nature-paper2ppt': {
        cat: 'research', weight: 70,
        short: '论文做成汇报 PPT', scene: '组会、答辩、文献汇报',
        when: ['把论文做成组会 PPT', '要做文献汇报'],
        io: '论文或笔记 → .pptx + 讲稿',
      },
      'nature-writing': {
        cat: 'research', weight: 65,
        short: '起草论文正文', scene: '从证据开始写稿时',
        when: ['帮我写引言这一节', '把这一段论证重构'],
        io: '证据与数据 → 正文草稿',
      },
      'nature-paper-trans': {
        cat: 'research', weight: 65,
        short: '论文逐页翻成中文', scene: '英文论文读不动时',
        when: ['把这篇论文翻成中文', '翻译但保留版式'],
        io: '英文 PDF → 中文 PDF，图表公式保留',
      },
      'researchwrite': {
        cat: 'research', weight: 60,
        short: '写开题与研究计划', scene: '开题、项目申请',
        when: ['写一份开题报告', '写项目申请书'],
        io: '方向与材料 → 研究计划书',
      },
      'nature-downloader': {
        cat: 'research', weight: 60,
        short: '合法拿到论文全文', scene: '拿不到 PDF 时',
        when: ['这篇论文下载不了', 'CNKI 校园网访问'],
        io: '文献信息 → PDF 全文',
      },
      'nature-citation': {
        cat: 'research', weight: 55,
        short: '为论点配 CNS 级引文', scene: '投稿前补引用',
        when: ['这句结论缺引用', '找 Nature/CNS 级别的支撑文献'],
        io: '稿件段落 → 论点对应的引文',
      },
      'nature-paper-card': {
        cat: 'research', weight: 55,
        short: '生成论文精读卡', scene: '快速吃透一篇论文',
        when: ['这篇论文讲什么', '做一张精读卡'],
        io: '论文 → 结构化卡片（方法/证据/局限）',
      },
      'nature-reader': {
        cat: 'research', weight: 55,
        short: '中英对照精读', scene: '要逐段对照读时',
        when: ['想要中英对照读', '图表公式要对齐'],
        io: '论文 → 对照阅读版',
      },
      'nature-response': {
        cat: 'research', weight: 55,
        short: '写审稿回复与返修信', scene: '返修阶段',
        when: ['审稿意见怎么回', '写一封返修信'],
        io: '意见 + 修改稿 → 逐点回复',
      },
      'nature-paper-xray': {
        cat: 'research', weight: 50,
        short: '深读论文还原作者思路', scene: '想吃透方法细节',
        when: ['这个公式怎么推出来的', '作者为什么这么设计'],
        io: '论文 → 逐层讲解与推导',
      },
      'nature-reviewer': {
        cat: 'research', weight: 50,
        short: '模拟同行评审', scene: '投稿前自审',
        when: ['帮我按审稿人视角挑毛病', '投稿前评估一下'],
        io: '稿件 → 评审意见（重大/次要）',
      },
      'nature-ref-verifier': {
        cat: 'research', weight: 50,
        short: '逐条核对参考文献', scene: '投稿前查错',
        when: ['参考文献有没有错', '批量校验引文'],
        io: '文献列表 → 结构化校验报告',
      },
      'nature-experiment-log': {
        cat: 'research', weight: 45,
        short: '标准化实验日志', scene: '日常实验记录',
        when: ['记录今天的实验', '把图片语音变成日志'],
        io: '图片/语音/文字 → 带 frontmatter 的 Markdown',
      },
      'nature-social-science': {
        cat: 'research', weight: 45,
        short: '社科选题与论证', scene: '开题、论文构思',
        when: ['帮我想一个论文题目', '这个论证站得住吗'],
        io: '研究方向 → 选题、综述与论证建议',
      },
      'nature-statistics': {
        cat: 'research', weight: 45,
        short: '审查统计报告', scene: '方法节与图注',
        when: ['统计写得对不对', '审稿人问统计怎么答'],
        io: '稿件 → 统计审查意见',
      },
      'nature-data': {
        cat: 'research', weight: 40,
        short: '写数据可用性声明', scene: '投稿材料准备',
        when: ['数据可用性声明怎么写', '要规划数据仓库'],
        io: '论文信息 → 声明文本与元数据建议',
      },
      'nature-paper-to-patent': {
        cat: 'research', weight: 40,
        short: '论文转专利稿', scene: '技术交底书、申请稿',
        when: ['把这论文写成专利', '帮我写技术交底书'],
        io: '论文或材料 → 中文专利文档',
      },
      'nature-literature-pipeline': {
        cat: 'research', weight: 35,
        short: '自动文献流水线', scene: '长期跟踪某个领域',
        when: ['每天给我推新文献', '自动检索打分精读'],
        io: '检索主题 → 定期推送与归档',
      },
      'nature-shared': {
        cat: 'research', weight: 5,
        short: 'Nature 系列内部共享包', scene: '不由用户单独调用',
        when: [],
        io: '由其他 nature-* 技能内部使用',
      },

      // ── 设计排版 ────────────────────────────────────────────────
      'guizang-page-skill': {
        cat: 'design', weight: 75,
        short: '文档排成精简单页网页', scene: '文章想变成网页时',
        when: ['把这篇文档排版成网页', '想要一张长图'],
        io: '文档或文章 → 单页 HTML（可导出 PDF/长图）',
      },
      'guizang-ppt-skill': {
        cat: 'design', weight: 75,
        short: '生成网页版 PPT', scene: '分享、发布会、演示',
        when: ['做个杂志风 PPT', '要能翻页的网页演示'],
        io: '主题或大纲 → 单 HTML 演示',
      },
      'guizang-social-card-skill': {
        cat: 'design', weight: 65,
        short: '生成小红书图文卡片', scene: '社交平台发布',
        when: ['做一组小红书图', '要一张公众号封面'],
        io: '文章或要点 → 卡片图片',
      },
      'nature-figure': {
        cat: 'design', weight: 60,
        short: '画论文级图表', scene: '投稿配图',
        when: ['这张图要投稿用', '画一组多面板科研图'],
        io: '数据 → 可直接投稿的图片',
      },
      'nature-image2ppt': {
        cat: 'design', weight: 50,
        short: '图片还原成可编辑 PPT', scene: '截图、扫描件要改',
        when: ['这张幻灯片截图能改吗', '把扫描 PDF 转成 PPT'],
        io: '图片或 PDF → 可编辑 .pptx',
      },
      'hyperframes-cli': {
        cat: 'design', weight: 35,
        short: '视频工程脚手架与渲染', scene: '用代码做视频时',
        when: ['用代码做一段视频', '渲染这个动画工程'],
        io: '工程文件 → 渲染好的视频',
      },
    }

    const SOURCE_LABEL = {
      'project-dsh': '项目',
      'project-agents': '项目',
      'user-dsh': '用户',
      'user-agents': '用户',
      bundled: '内置',
      runtime: '运行时',
      custom: '自定义',
      manager: '技能管家',
    }

    const hasCJK = (text) => /[\u3400-\u9fff]/.test(String(text || ''))
    const oneLine = (text) => String(text || '').replace(/\s+/g, ' ').trim()

    const entryOf = (skill) => CATALOG[skill && skill.name] || null
    const isCatalogued = (skill) => Boolean(entryOf(skill))
    /** 宿主给的中文说明（作者自带的中文，或本机自动翻译的）。新下载的 skill 靠它。 */
    const autoZh = (skill) => {
      const value = skill && typeof skill.zh === 'string' ? skill.zh.trim() : ''
      return value && hasCJK(value) ? value : ''
    }
    const zhOf = (skill) => {
      const auto = autoZh(skill)
      if (auto) return auto
      const raw = String((skill && skill.description) || '')
      return hasCJK(raw) ? oneLine(raw) : ''
    }
    const hasChinese = (skill) => isCatalogued(skill) || Boolean(zhOf(skill))

    /** 列表第一行：做什么。未收录时用自动中文，再退回自带原文。 */
    const shortOf = (skill) => {
      const entry = entryOf(skill)
      if (entry) return entry.short
      const zh = zhOf(skill)
      if (zh) {
        const sentence = zh.split(/[。！？!?]\s*/)[0]
        return sentence.length > 34 ? sentence.slice(0, 34) + '…' : sentence
      }
      const raw = oneLine(skill && skill.description)
      if (!raw) return '这个技能没有自带说明'
      const sentence = raw.split(/[。.!?]\s*/)[0]
      const text = sentence.length > 34 ? sentence.slice(0, 34) + '…' : sentence
      return '说明翻译中 · ' + text
    }

    /** 列表第二行：什么时候用。未收录时不占位，避免空白。 */
    const sceneOf = (skill) => {
      const entry = entryOf(skill)
      if (entry) return entry.scene
      const when = oneLine(skill && skill.whenToUse)
      if (!when) return ''
      const text = when.length > 30 ? when.slice(0, 30) + '…' : when
      return hasCJK(text) ? text : ''
    }

    /** 悬停内容：场景 + 输入产出 + 限制。 */
    const tipOf = (skill) => {
      const entry = entryOf(skill)
      const when = entry && Array.isArray(entry.when) ? entry.when.slice(0, 3) : []
      const zh = entry ? '' : zhOf(skill)
      if (when.length === 0) {
        const raw = oneLine(zh || (skill && (skill.whenToUse || skill.description)))
        if (raw) when.push(raw.length > 46 ? raw.slice(0, 46) + '…' : raw)
      }
      const io = entry ? entry.io : ''
      let limit = ''
      if (!entry) {
        if (zh) limit = skill.zhSource === 'cache' ? '中文说明由本机自动翻译' : ''
        else limit = '中文说明翻译中，稍后自动补上；先显示技能自带的原文'
      }
      return { when, io, limit }
    }

    // ── 本地偏好：使用次数、置顶、排序方式。只存本机，不上传。 ──────
    const readJSON = (key, fallback) => {
      try {
        if (typeof localStorage === 'undefined') return fallback
        const raw = localStorage.getItem(key)
        if (!raw) return fallback
        const parsed = JSON.parse(raw)
        return parsed === null || parsed === undefined ? fallback : parsed
      } catch { return fallback }
    }
    const writeJSON = (key, value) => {
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify(value))
      } catch { /* 存不了就只在内存里生效 */ }
    }

    const usage = (() => {
      const value = readJSON(STORE_KEYS.usage, {})
      return value && typeof value === 'object' ? value : {}
    })()
    const pins = (() => {
      const value = readJSON(STORE_KEYS.pins, [])
      return Array.isArray(value) ? value.filter((name) => typeof name === 'string') : []
    })()
    let sortMode = (() => {
      const value = readJSON(STORE_KEYS.sort, 'recommend')
      return ['recommend', 'name', 'recent'].includes(value) ? value : 'recommend'
    })()

    const usageOf = (name) => {
      const row = usage[name]
      return row && typeof row === 'object' ? row : { n: 0, t: 0 }
    }
    const recordUse = (name) => {
      const row = usageOf(name)
      usage[name] = { n: (Number(row.n) || 0) + 1, t: Date.now() }
      writeJSON(STORE_KEYS.usage, usage)
    }
    const togglePin = (name) => {
      const at = pins.indexOf(name)
      if (at >= 0) pins.splice(at, 1)
      else if (pins.length < PIN_LIMIT) pins.push(name)
      else return false
      writeJSON(STORE_KEYS.pins, pins)
      return true
    }
    const clearUsage = () => {
      for (const key of Object.keys(usage)) delete usage[key]
      writeJSON(STORE_KEYS.usage, usage)
    }

    const weightOf = (skill) => {
      const entry = entryOf(skill)
      return entry ? entry.weight : 20
    }
    const categoryOf = (skill) => {
      const entry = entryOf(skill)
      return entry ? entry.cat : 'other'
    }
    const pinyinless = (text) => String(text || '').toLowerCase()

    /** 搜索命中打分：名字 > 说明 > 分类。 */
    const scoreOf = (skill, query) => {
      const q = pinyinless(query)
      if (!q) return 0
      const entry = entryOf(skill)
      const hay = [skill.name, entry ? entry.short : '', entry ? entry.scene : '', entry ? entry.when.join(' ') : '', CATEGORY_LABEL[categoryOf(skill)]]
        .map(pinyinless)
      let score = 0
      if (hay[0].includes(q)) score += 100
      if (hay[1].includes(q)) score += 60
      if (hay[2].includes(q)) score += 40
      if (hay[3].includes(q)) score += 30
      if (hay[4].includes(q)) score += 20
      return score
    }

    /** Sub-path deployments: /<prefix>/plugins/<id>/client.js → /<prefix>. */
    const detectBase = () => {
      try {
        if (typeof document === 'undefined') return ''
        const fromPath = (path) => {
          const hit = /^(.*?)\/plugins\//.exec(String(path || ''))
          return hit ? hit[1].replace(/\/+$/, '') : null
        }
        const current = document.currentScript
        if (current && current.src) {
          const base = fromPath(new URL(current.src, document.baseURI).pathname)
          if (base !== null) return base
        }
        for (const script of document.querySelectorAll('script[src]')) {
          const base = fromPath(new URL(script.src, document.baseURI).pathname)
          if (base !== null) return base
        }
      } catch { /* 非浏览器环境 */ }
      return ''
    }

    const BASE = detectBase()
    const apiPath = (path) => (BASE && path.charAt(0) === '/' ? BASE + path : path)

    const makeStore = () => {
      let open = false
      const listeners = new Set()
      const emit = () => { for (const listener of listeners) listener() }
      return {
        get: () => open,
        set(next) {
          if (next === open) return
          open = next
          emit()
        },
        toggle() {
          open = !open
          emit()
        },
        subscribe(listener) {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
      }
    }

    const store = makeStore()

    // 宿主在 document 上以捕获阶段拦截了 panel 内的原生 click（弹层外点关闭逻辑），
    // React 的 portal 委托收不到，所以行/按钮的点击改由 window 捕获阶段分发。
    const rowActions = new Map()
    // 原生 click 有时会被宿主拦截；pointerdown 兜底。两条路都走时按 400ms 去重。
    let lastFire = { name: '', at: 0 }
    const fireOnce = (name, run) => {
      const now = Date.now()
      if (lastFire.name === name && now - lastFire.at < 400) return
      lastFire = { name, at: now }
      if (typeof run === 'function') run()
    }
    const panelActions = { close: null, sort: null, pin: null, retry: null, clear: null }
    const useOpen = () => React.useSyncExternalStore(store.subscribe, store.get, store.get)
    const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? React.useLayoutEffect : React.useEffect

    let cache = null

    const STYLE = [
      '.dshsm-trigger{height:28px;min-width:46px;padding:0 9px;border:1px solid transparent;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary,#6b7280);font-family:ui-sans-serif,system-ui,"Segoe UI",sans-serif;font-size:11.5px;font-weight:600;letter-spacing:.02em;line-height:1;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}',
      '.dshsm-trigger:hover{background:var(--dsw-alias-bg-layer-2,rgba(120,120,120,.14));color:var(--dsw-alias-label-primary,#111)}',
      '.dshsm-trigger[data-open="1"]{color:var(--dsw-alias-brand-primary,#2f6bff);border-color:var(--dsw-alias-border-l1,rgba(0,0,0,.12));background:var(--dsw-alias-bg-layer-2,rgba(120,120,120,.1))}',
      '.dshsm-panel{position:fixed;z-index:2147483000;display:flex;flex-direction:column;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));border-radius:12px;background:var(--dsw-alias-bg-layer-1,var(--dsw-alias-bg-base,#fff));backdrop-filter:blur(12px);box-shadow:0 12px 32px rgba(0,0,0,.18);overflow:hidden;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary,#111)}',
      '.dshsm-head{display:flex;align-items:center;gap:8px;padding:9px 12px 7px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08))}',
      '.dshsm-title{font-weight:600;font-size:13px}',
      '.dshsm-count{color:var(--dsw-alias-label-secondary,#6b7280);font-size:11.5px}',
      '.dshsm-head-actions{margin-left:auto;display:flex;gap:4px;align-items:center}',
      '.dshsm-small{height:22px;padding:0 8px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#6b7280);font-size:12px;cursor:pointer}',
      '.dshsm-small:hover{color:var(--dsw-alias-label-primary,#111);background:var(--dsw-alias-bg-layer-2,rgba(120,120,120,.12))}',
      '.dshsm-sort{display:inline-flex;gap:2px;margin-right:2px;padding:1px;border-radius:7px;background:var(--dsw-alias-bg-layer-2,rgba(120,120,120,.1))}',
      '.dshsm-sort button{height:20px;padding:0 7px;border:0;border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary,#6b7280);font-size:11.5px;cursor:pointer}',
      '.dshsm-sort button[data-on="1"]{background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#111);box-shadow:0 1px 2px rgba(0,0,0,.12)}',
      '.dshsm-search{padding:7px 12px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.06))}',
      '.dshsm-search input{width:100%;box-sizing:border-box;height:26px;padding:0 8px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.14));border-radius:7px;background:transparent;color:var(--dsw-alias-label-primary,#111);-webkit-text-fill-color:currentColor;caret-color:currentColor;font:inherit;font-size:12.5px;outline:none}',
      '.dshsm-search input::placeholder{color:var(--dsw-alias-label-secondary,#8a8a8a);opacity:1}',
      '.dshsm-search input:focus{border-color:var(--dsw-alias-brand-primary,#2f6bff)}',
      '.dshsm-list{overflow:auto;padding:4px 4px 6px;flex:1 1 auto;min-height:0}',
      '.dshsm-group{display:flex;align-items:baseline;gap:6px;padding:8px 8px 3px;color:var(--dsw-alias-label-secondary,#6b7280);font-size:11px;letter-spacing:.02em}',
      '.dshsm-group-hint{margin-left:auto;font-size:10.5px;opacity:.75}',
      '.dshsm-row{display:flex;flex-direction:column;gap:2px;width:100%;box-sizing:border-box;padding:6px 8px;border:0;border-radius:8px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}',
      '.dshsm-row:hover,.dshsm-row:focus-visible,.dshsm-row[data-sel="1"]{background:var(--dsw-alias-bg-layer-2,rgba(120,120,120,.12));outline:none}',
      '.dshsm-row--off{opacity:.55;cursor:default}',
      '.dshsm-row-top{display:flex;align-items:center;gap:8px;width:100%;min-width:0}',
      '.dshsm-name{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px}',
      '.dshsm-short{display:block;color:inherit;font-size:12px;line-height:1.35;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dshsm-scene{display:block;color:var(--dsw-alias-label-secondary,#6b7280);font-size:11px;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dshsm-src{flex:none;padding:1px 6px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));color:var(--dsw-alias-label-secondary,#6b7280);font-size:11px}',
      '.dshsm-pin{flex:none;height:18px;padding:0 5px;border:1px solid transparent;border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary,#6b7280);font-size:10.5px;cursor:pointer;visibility:hidden}',
      '.dshsm-row:hover .dshsm-pin,.dshsm-pin[data-on="1"],.dshsm-row[data-sel="1"] .dshsm-pin{visibility:visible}',
      '.dshsm-pin:hover{color:var(--dsw-alias-label-primary,#111);border-color:var(--dsw-alias-border-l1,rgba(0,0,0,.12))}',
      '.dshsm-empty{padding:16px 12px;color:var(--dsw-alias-label-secondary,#6b7280);font-size:12.5px;text-align:center}',
      '.dshsm-error{padding:12px;color:var(--dsw-alias-state-error-primary,#d93025);font-size:12.5px;word-break:break-word}',
      '.dshsm-error button{margin-top:8px}',
      '.dshsm-foot{display:flex;align-items:center;gap:8px;padding:7px 12px;border-top:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08));color:var(--dsw-alias-label-secondary,#6b7280);font-size:11px}',
      '.dshsm-foot-actions{margin-left:auto;display:flex;gap:6px}',
      '.dshsm-link{border:0;background:transparent;color:inherit;font-size:11px;cursor:pointer;text-decoration:underline;padding:0}',
      '.dshsm-tip{position:fixed;z-index:2147483001;box-sizing:border-box;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.16));border-radius:10px;background:var(--dsw-alias-bg-layer-1,var(--dsw-alias-bg-base,#fff));backdrop-filter:blur(12px);box-shadow:0 10px 26px rgba(0,0,0,.2);color:var(--dsw-alias-label-primary,#111);font-size:12.5px;line-height:1.55;pointer-events:none}',
      '.dshsm-tip-name{display:block;margin-bottom:2px;color:var(--dsw-alias-brand-primary,#2f6bff);font-weight:600;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}',
      '.dshsm-tip-short{display:block;margin-bottom:6px;font-weight:600}',
      '.dshsm-tip-label{display:block;margin:6px 0 2px;color:var(--dsw-alias-label-secondary,#6b7280);font-size:11px}',
      '.dshsm-tip-when{margin:0;padding-left:16px}',
      '.dshsm-tip-when li{margin:0}',
      '.dshsm-tip-io{display:block}',
      '.dshsm-tip-limit{display:block;margin-top:6px;color:var(--dsw-alias-label-secondary,#6b7280);font-size:11px}',
    ].join('\n')

    function SkillButton() {
      const open = useOpen()
      return h('button', {
        type: 'button',
        className: 'dshsm-trigger',
        title: '技能（点击选一个技能直接用）',
        'aria-label': '技能菜单',
        'aria-expanded': open ? 'true' : 'false',
        'data-open': open ? '1' : '0',
        [TRIGGER_ATTR]: '1',
        onClick: (event) => {
          event.preventDefault()
          event.stopPropagation()
          store.toggle()
        },
      }, 'skill')
    }

    function SkillPanel(props) {
      const open = useOpen()
      const [skills, setSkills] = React.useState(() => (cache ? cache.skills : []))
      const [loading, setLoading] = React.useState(false)
      const [error, setError] = React.useState('')
      const [tip, setTip] = React.useState(null)
      const [box, setBox] = React.useState(null)
      const [nonce, setNonce] = React.useState(0)
      const [zhPending, setZhPending] = React.useState(0)
      const [query, setQuery] = React.useState('')
      const [sort, setSort] = React.useState(sortMode)
      const [pinVersion, setPinVersion] = React.useState(0)
      const [usageVersion, setUsageVersion] = React.useState(0)
      const [sel, setSel] = React.useState(-1)

      const tipShowTimer = React.useRef(0)
      const tipHideTimer = React.useRef(0)
      const zhTries = React.useRef(0)
      const stateRef = React.useRef({ flat: [] })

      const useLiveInput = typeof props.useInput === 'function' ? props.useInput : (() => null)
      const inputState = useLiveInput((state) => state)
      const draft = inputState && typeof inputState.draft === 'string' ? inputState.draft : ''
      const actions = props.inputActions || {}
      const sessionId = props.sessionId

      // 面板和提示框都 portal 到 body：输入框所在的卡片带有 transform/overflow，
      // 直接在卡片里放 position:fixed 的元素会被裁掉。
      useIsomorphicLayoutEffect(() => {
        if (!open) return undefined
        const measure = () => {
          const trigger = typeof document !== 'undefined'
            ? document.querySelector('[' + TRIGGER_ATTR + '="1"]')
            : null
          const rect = trigger ? trigger.getBoundingClientRect() : null
          const viewportW = (typeof window !== 'undefined' && window.innerWidth) || 1024
          const viewportH = (typeof window !== 'undefined' && window.innerHeight) || 800
          const width = Math.min(PANEL_W, Math.max(280, viewportW - 24))
          const anchorLeft = rect ? rect.left : 16
          const left = Math.max(8, Math.min(anchorLeft, viewportW - width - 8))
          const anchorTop = rect ? rect.top : viewportH - 96
          setBox({
            left,
            bottom: Math.max(8, viewportH - anchorTop + 8),
            width,
            maxHeight: Math.min(520, Math.max(200, anchorTop - 24)),
          })
        }
        measure()
        window.addEventListener('resize', measure)
        return () => window.removeEventListener('resize', measure)
      }, [open])

      // 打开即拉列表；缓存命中先渲染旧结果，再后台刷新。
      React.useEffect(() => {
        if (!open) return undefined
        let alive = true
        setLoading(!cache)
        setError('')
        const suffix = sessionId ? '?sessionId=' + encodeURIComponent(String(sessionId)) : ''
        fetch(apiPath(LIST_PATH) + suffix, { headers: { accept: 'application/json' } })
          .then((response) => {
            if (!response.ok) throw new Error('HTTP ' + response.status)
            return response.json()
          })
          .then((payload) => {
            if (!alive) return
            if (!payload || !payload.ok) throw new Error((payload && payload.error) || '返回数据无效')
            const rows = Array.isArray(payload.skills) ? payload.skills : []
            cache = { at: Date.now(), skills: rows }
            setSkills(rows)
            setZhPending(payload.zhAvailable === false ? 0 : (Number(payload.zhPending) || 0))
            setError('')
          })
          .catch((reason) => {
            if (alive) setError('技能列表加载失败：' + ((reason && reason.message) || reason))
          })
          .finally(() => { if (alive) setLoading(false) })
        return () => { alive = false }
      }, [open, sessionId, nonce])

      // 宿主在后台自动翻译技能说明：还有待译条目就隔一会儿再拉一次，
      // 译好一条换一条，面板不用关掉重开。最多补拉 60 次（约 90 秒），
      // 翻译服务不通时自然停。
      React.useEffect(() => {
        if (!open || zhPending <= 0) return undefined
        if (zhTries.current >= 60) return undefined
        const timer = setTimeout(() => {
          zhTries.current += 1
          setNonce((value) => value + 1)
        }, 1500)
        return () => clearTimeout(timer)
      }, [open, zhPending, nonce])

      React.useEffect(() => {
        if (open) return
        zhTries.current = 0
      }, [open])

      // 点面板外 / Esc 收起。
      React.useEffect(() => {
        if (!open) return undefined
        const onPointerDown = (event) => {
          const target = event.target
          if (target && target.closest) {
            if (target.closest('.dshsm-panel') || target.closest('[' + TRIGGER_ATTR + '="1"]')) return
            if (target.closest('.dshsm-tip')) return
          }
          store.set(false)
        }
        const onKeyDown = (event) => {
          if (event.key === 'Escape') {
            store.set(false)
            return
          }
          const flat = stateRef.current.flat || []
          if (flat.length === 0) return
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            setSel((current) => {
              const start = current < 0 ? (event.key === 'ArrowDown' ? -1 : 0) : current
              const next = event.key === 'ArrowDown' ? start + 1 : start - 1
              return Math.max(0, Math.min(next, flat.length - 1))
            })
            return
          }
          if (event.key === 'Enter' && sel >= 0 && flat[sel]) {
            event.preventDefault()
            const run = rowActions.get(flat[sel].name)
            if (typeof run === 'function') run()
          }
        }
        document.addEventListener('pointerdown', onPointerDown, true)
        document.addEventListener('keydown', onKeyDown, true)
        return () => {
          document.removeEventListener('pointerdown', onPointerDown, true)
          document.removeEventListener('keydown', onKeyDown, true)
        }
      }, [open, sel])

      // 选中行跟随滚动。
      React.useEffect(() => {
        if (!open || sel < 0) return
        try {
          const node = document.querySelector('.dshsm-row[data-sel="1"]')
          if (node && typeof node.scrollIntoView === 'function') node.scrollIntoView({ block: 'nearest' })
        } catch { /* 纯增强 */ }
      }, [open, sel])

      // 收起时清理提示计时器。
      React.useEffect(() => {
        if (open) return undefined
        return () => {
          window.clearTimeout(tipShowTimer.current)
          window.clearTimeout(tipHideTimer.current)
        }
      }, [open])

      if (!open) return null

      const invoke = (skill) => {
        const sentence = '使用 skill「' + skill.name + '」'
        const next = draft.trim() ? sentence + '\n' + draft : sentence
        let filled = false
        try {
          if (typeof actions.setDraft === 'function') {
            actions.setDraft(next)
            filled = true
          }
        } catch { filled = false }
        if (!filled) {
          setError('当前输入框不可写：宿主的 inputActions.setDraft 不可用。')
          return
        }
        recordUse(skill.name)
        setUsageVersion((value) => value + 1)
        if (AUTO_SEND) {
          try { if (typeof actions.submit === 'function') actions.submit() } catch { /* 交给用户按回车 */ }
        }
        store.set(false)
        try {
          const editor = document.querySelector('[data-composer-card] [contenteditable="true"]')
          if (editor && typeof editor.focus === 'function') editor.focus()
        } catch { /* 纯增强 */ }
      }

      const showTipNow = (skill, element) => {
        try {
          setTip({ skill, rect: element.getBoundingClientRect() })
        } catch { setTip(null) }
      }
      const scheduleTip = (skill, element) => {
        window.clearTimeout(tipHideTimer.current)
        window.clearTimeout(tipShowTimer.current)
        tipShowTimer.current = window.setTimeout(() => showTipNow(skill, element), TIP_SHOW_DELAY)
      }
      const hideTip = () => {
        window.clearTimeout(tipShowTimer.current)
        window.clearTimeout(tipHideTimer.current)
        tipHideTimer.current = window.setTimeout(() => setTip(null), TIP_HIDE_DELAY)
      }

      const usable = skills.filter((skill) => skill.userInvocable !== false)
      const listed = skills
      const catalogued = listed.filter((skill) => hasChinese(skill)).length
      const pinnedNames = pins.slice()
      const now = Date.now()

      // 计算展示顺序：查询 > 排序方式 > 推荐分区。
      const q = query.trim()
      const byWeight = (a, b) => weightOf(b) - weightOf(a) || a.name.localeCompare(b.name)
      const byName = (a, b) => a.name.localeCompare(b.name)
      const byRecent = (a, b) => usageOf(b.name).t - usageOf(a.name).t || byWeight(a, b)

      const sections = []
      if (q) {
        const hits = listed
          .map((skill) => ({ skill, score: scoreOf(skill, q) }))
          .filter((row) => row.score > 0)
          .sort((a, b) => b.score - a.score || byWeight(a.skill, b.skill))
          .map((row) => row.skill)
        if (hits.length > 0) sections.push({ id: 'search', title: '搜索结果', items: hits })
      } else if (sort === 'name') {
        const pinned = listed.filter((skill) => pinnedNames.includes(skill.name))
        const rest = listed.filter((skill) => !pinnedNames.includes(skill.name)).sort(byName)
        if (pinned.length > 0) sections.push({ id: 'pins', title: '置顶', items: pinned, hint: '最多 5 个' })
        if (rest.length > 0) sections.push({ id: 'all', title: '全部技能', items: rest })
      } else if (sort === 'recent') {
        const ordered = listed.slice().sort(byRecent)
        const touched = ordered.filter((skill) => usageOf(skill.name).t > 0)
        const cold = ordered.filter((skill) => usageOf(skill.name).t === 0)
        if (touched.length > 0) sections.push({ id: 'recent', title: '最近使用', items: touched.slice(0, RECENT_LIMIT), hint: '本机记录' })
        if (cold.length > 0) sections.push({ id: 'rest', title: '还没用过', items: cold })
      } else {
        const pinned = pinnedNames
          .map((name) => listed.find((skill) => skill.name === name))
          .filter(Boolean)
        const usedRecently = listed
          .filter((skill) => !pinnedNames.includes(skill.name) && usageOf(skill.name).t > 0 && now - usageOf(skill.name).t < 1000 * 60 * 60 * 24 * 30)
          .sort(byRecent)
          .slice(0, RECENT_LIMIT)
        const recentNames = new Set(usedRecently.map((skill) => skill.name))
        const common = listed
          .filter((skill) => !pinnedNames.includes(skill.name) && !recentNames.has(skill.name) && weightOf(skill) >= COMMON_MIN_WEIGHT)
          .sort(byWeight)
          .slice(0, COMMON_LIMIT)
        const commonNames = new Set(common.map((skill) => skill.name))
        const rest = listed.filter((skill) => !pinnedNames.includes(skill.name) && !recentNames.has(skill.name) && !commonNames.has(skill.name))
        if (pinned.length > 0) sections.push({ id: 'pins', title: '置顶', items: pinned, hint: '最多 5 个' })
        if (usedRecently.length > 0) sections.push({ id: 'recent', title: '最近使用', items: usedRecently, hint: '本机记录' })
        if (common.length > 0) sections.push({ id: 'common', title: '常用', items: common, hint: '大多数人先看这些' })
        for (const category of CATEGORIES) {
          const items = rest.filter((skill) => categoryOf(skill) === category.id).sort(byWeight)
          if (items.length > 0) sections.push({ id: 'cat-' + category.id, title: category.label, items })
        }
      }

      const flat = []
      for (const section of sections) for (const skill of section.items) flat.push(skill)
      stateRef.current.flat = flat
      const activeIndex = sel >= 0 && sel < flat.length ? sel : -1

      rowActions.clear()
      for (const item of listed) rowActions.set(item.name, () => invoke(item))

      panelActions.retry = () => {
        cache = null
        setSkills([])
        setError('')
        setNonce((value) => value + 1)
      }
      panelActions.sort = (next) => {
        if (!['recommend', 'name', 'recent'].includes(next)) return
        sortMode = next
        writeJSON(STORE_KEYS.sort, next)
        setSort(next)
        setSel(-1)
      }
      panelActions.pin = (name) => {
        const changed = togglePin(name)
        if (changed) setPinVersion((value) => value + 1)
      }
      panelActions.clear = () => {
        clearUsage()
        setUsageVersion((value) => value + 1)
      }
      panelActions.close = () => store.set(false)

      const renderRow = (skill) => {
        const entry = entryOf(skill)
        const off = skill.userInvocable === false
        const selected = activeIndex >= 0 && flat[activeIndex] && flat[activeIndex].name === skill.name
        const isPinned = pinnedNames.includes(skill.name)
        return h('div', {
          key: skill.name,
          className: 'dshsm-row' + (off ? ' dshsm-row--off' : ''),
          role: 'option',
          tabIndex: off ? -1 : 0,
          'aria-selected': selected ? 'true' : 'false',
          'data-skill': skill.name,
          'data-dshsm-row': off ? undefined : skill.name,
          'data-sel': selected ? '1' : '0',
          onPointerDown: (event) => {
            event.preventDefault()
            event.stopPropagation()
            if (!off) fireOnce('row:' + skill.name, () => invoke(skill))
          },
          onPointerEnter: (event) => { if (!off) scheduleTip(skill, event.currentTarget) },
          onPointerLeave: hideTip,
          onFocus: (event) => { if (!off) showTipNow(skill, event.currentTarget) },
          onBlur: hideTip,
          onClick: (event) => {
            event.preventDefault()
            event.stopPropagation()
            if (!off) invoke(skill)
          },
        },
        h('span', { className: 'dshsm-row-top' },
          h('span', { className: 'dshsm-name' }, skill.name),
          h('button', {
            type: 'button',
            className: 'dshsm-pin',
            tabIndex: -1,
            title: isPinned ? '取消置顶' : '置顶（最多 5 个）',
            'data-on': isPinned ? '1' : '0',
            'data-dshsm-action': 'pin',
            'data-dshsm-pin': skill.name,
            onPointerDown: (event) => {
              event.preventDefault()
              event.stopPropagation()
              fireOnce('pin:' + skill.name, () => panelActions.pin(skill.name))
            },
            onClick: (event) => {
              event.preventDefault()
              event.stopPropagation()
              panelActions.pin(skill.name)
            },
          }, isPinned ? '已置顶' : '置顶'),
          h('span', { className: 'dshsm-src' }, skill.managerSource ? '技能管家' : (SOURCE_LABEL[skill.source] || skill.source || '其他'))),
        h('span', { className: 'dshsm-short' }, off ? '本会话不可调用' : shortOf(skill)),
        (sceneOf(skill) && !off) ? h('span', { className: 'dshsm-scene' }, sceneOf(skill)) : null)
      }

      const body = sections.length > 0
        ? h('div', { className: 'dshsm-list', role: 'listbox', 'aria-label': '技能列表' },
          sections.map((section) => h('div', { key: section.id, className: 'dshsm-group-wrap' },
            h('div', { className: 'dshsm-group' },
              h('span', null, section.title),
              section.hint ? h('span', { className: 'dshsm-group-hint' }, section.hint) : null),
            section.items.map(renderRow))))
        : (loading
          ? h('div', { className: 'dshsm-empty' }, '加载中…')
          : (error
            ? h('div', { className: 'dshsm-error' },
              error,
              h('button', {
                type: 'button',
                className: 'dshsm-small',
                'data-dshsm-action': 'retry',
                onPointerDown: (event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  fireOnce('retry', () => panelActions.retry())
                },
                onClick: (event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  panelActions.retry()
                },
              }, '重试'))
            : h('div', { className: 'dshsm-empty' },
              q ? '没有匹配的技能，换个词试试：PPT、论文、表格' : '本机还没有可调用的 skill')))

      const panel = portal(h('div', {
        className: 'dshsm-panel',
        role: 'dialog',
        'aria-label': '技能列表',
        'data-dshsm-panel': '1',
        style: box
          ? { left: box.left, bottom: box.bottom, width: box.width, maxHeight: box.maxHeight }
          : { left: 16, bottom: 80, width: Math.min(PANEL_W, 320), maxHeight: 280 },
      },
      h('div', { className: 'dshsm-head' },
        h('span', { className: 'dshsm-title' }, '技能库'),
        h('span', { className: 'dshsm-count' }, usable.length + ' 个可用'),
        h('span', { className: 'dshsm-head-actions' },
          h('span', { className: 'dshsm-sort' },
            [['recommend', '推荐'], ['name', '名称'], ['recent', '最近']].map((pair) => h('button', {
              key: pair[0],
              type: 'button',
              'data-on': sort === pair[0] ? '1' : '0',
              'data-dshsm-action': 'sort',
              'data-dshsm-sort': pair[0],
              onPointerDown: (event) => {
                event.preventDefault()
                event.stopPropagation()
                fireOnce('sort:' + pair[0], () => panelActions.sort(pair[0]))
              },
              onClick: (event) => {
                event.preventDefault()
                event.stopPropagation()
                panelActions.sort(pair[0])
              },
            }, pair[1]))),
          h('button', {
            type: 'button',
            className: 'dshsm-small',
            title: '关闭',
            'data-dshsm-action': 'close',
            onPointerDown: (event) => {
              event.preventDefault()
              event.stopPropagation()
              fireOnce('close', () => store.set(false))
            },
            onClick: (event) => {
              event.preventDefault()
              event.stopPropagation()
              store.set(false)
            },
          }, '关闭'))),
      h('div', { className: 'dshsm-search' },
        h('input', {
          type: 'search',
          value: query,
          placeholder: '搜技能名或用途，例如 PPT、论文、表格',
          'aria-label': '搜索技能',
          autoFocus: true,
          onChange: (event) => { setQuery(event.target.value); setSel(-1) },
        })),
      body,
      h('div', { className: 'dshsm-foot' },
        h('span', null, AUTO_SEND ? '悬停看说明 · 点击直接调用' : '悬停看说明 · 点击填入对话'),
        h('span', { className: 'dshsm-foot-actions' },
          h('span', null, '中文说明 ' + catalogued + '/' + listed.length),
          Object.keys(usage).length > 0
            ? h('button', {
              type: 'button',
              className: 'dshsm-link',
              title: '清空本机的使用记录',
              'data-dshsm-action': 'clear',
              onPointerDown: (event) => {
                event.preventDefault()
                event.stopPropagation()
                fireOnce('clear', () => panelActions.clear())
              },
              onClick: (event) => {
                event.preventDefault()
                event.stopPropagation()
                panelActions.clear()
              },
            }, '清空记录')
            : null))), document.body)

      if (!tip) return panel

      const viewportW = (typeof window !== 'undefined' && window.innerWidth) || 1024
      const viewportH = (typeof window !== 'undefined' && window.innerHeight) || 800
      const tipWidth = Math.min(TIP_W, viewportW - 16)
      const info = tipOf(tip.skill)
      let tipLeft = tip.rect.right + 10
      if (tipLeft + tipWidth > viewportW - 8) tipLeft = tip.rect.left - tipWidth - 10
      tipLeft = Math.max(8, Math.min(tipLeft, viewportW - tipWidth - 8))
      const tipTop = Math.max(8, Math.min(tip.rect.top - 8, viewportH - 8 - 220))
      const tipNode = portal(h('div', {
        className: 'dshsm-tip',
        role: 'tooltip',
        style: { left: tipLeft, top: tipTop, width: tipWidth, maxHeight: 260, overflow: 'auto' },
      },
      h('span', { className: 'dshsm-tip-name' }, tip.skill.name),
      h('span', { className: 'dshsm-tip-short' }, shortOf(tip.skill)),
      info.when.length > 0
        ? h('span', { className: 'dshsm-tip-label' }, '什么时候用')
        : null,
      info.when.length > 0
        ? h('ul', { className: 'dshsm-tip-when' }, info.when.map((line, index) => h('li', { key: index }, line)))
        : null,
      info.io ? h('span', { className: 'dshsm-tip-label' }, '需要什么 · 得到什么') : null,
      info.io ? h('span', { className: 'dshsm-tip-io' }, info.io) : null,
      info.limit ? h('span', { className: 'dshsm-tip-limit' }, info.limit) : null), document.body)

      return h(React.Fragment, null, panel, tipNode)
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const slots = ctx.slots
        if (slots === undefined) return

        const onClickCapture = (event) => {
          const target = event.target
          if (!target || typeof target.closest !== 'function') return
          const action = target.closest('[data-dshsm-action]')
          if (action !== null) {
            event.preventDefault()
            event.stopPropagation()
            const kind = action.getAttribute('data-dshsm-action')
            if (kind === 'sort') {
              if (typeof panelActions.sort === 'function') panelActions.sort(action.getAttribute('data-dshsm-sort'))
            } else if (kind === 'pin') {
              if (typeof panelActions.pin === 'function') panelActions.pin(action.getAttribute('data-dshsm-pin'))
            } else if (kind === 'clear') {
              if (typeof panelActions.clear === 'function') panelActions.clear()
            } else if (kind === 'retry') {
              if (typeof panelActions.retry === 'function') panelActions.retry()
            } else if (typeof panelActions.close === 'function') {
              panelActions.close()
            }
            return
          }
          const row = target.closest('[data-dshsm-row]')
          if (row !== null) {
            event.preventDefault()
            event.stopPropagation()
            const run = rowActions.get(row.getAttribute('data-dshsm-row'))
            if (typeof run === 'function') run()
          }
        }
        window.addEventListener('click', onClickCapture, true)



        const style = document.createElement('style')
        style.setAttribute('data-dsh-skill-menu', '1')
        style.textContent = STYLE
        document.head.appendChild(style)
        ctx.effect(() => () => {
          if (style.parentNode) style.parentNode.removeChild(style)
          window.removeEventListener('click', onClickCapture, true)
          }, 'dsh-skill-menu: styles')

        slots.inject('conversation.input.left', () => slots.register(
          { name: 'conversation.input.left', id: 'skill-menu', order: 6, label: '技能' },
          () => h(SkillButton, {}),
        ))

        slots.inject('conversation.input.overlay', () => slots.register(
          { name: 'conversation.input.overlay', id: 'skill-menu', order: 6, label: '技能' },
          (props) => h(SkillPanel, { inputActions: props.inputActions, useInput: props.useInput, sessionId: props.sessionId }),
        ))
      },
    }
  },
})