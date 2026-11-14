# 技能菜单（Skill menu）

在对话输入框工具栏左侧加一个 `skill` 按钮。点击后列出这台机器上**已安装、当前会话可调用**的 skill，按「常用 / 分类」排好；悬停某个 skill 显示四段中文说明；点击即把该 skill 调用进对话。

## 行为

| 位置 | 槽位 | 内容 |
| --- | --- | --- |
| 输入框工具栏左侧 | `conversation.input.left` | `skill` 按钮（`id: skill-menu`，`order: 6`） |
| 输入框上方浮层 | `conversation.input.overlay` | 技能库面板 + 悬停中文说明 |

### 列表怎么排

- **推荐（默认）**：置顶 → 最近使用 → 常用（`weight ≥ 70` 取前 10，带「大多数人先看这些」提示）→ 其余按分类（文档办公 / 写作表达 / 研究检索 / 设计排版 / 开发排查 / 其他）。
- **名称**：全部技能，按名字母序扁平排列。
- **最近**：按本机使用次数从多到少。
- 输入关键词时切换成扁平的「搜索结果」，匹配 skill 名、中文一句话作用与分类名（例如搜「PPT」命中 office-pptx、guizang-ppt-skill、nature-paper2ppt、nature-image2ppt）。
- 每行三层：skill 名 → 一句话「做什么」→ 「什么时候用」；右侧是来源标签（用户 / 项目 / 内置 / 运行时 / 技能管家）。悬停行时行内出现「置顶」按钮，最多 5 个。
- 面板页脚显示中文说明覆盖率（`中文说明 43/43`）与「清空记录」。

### 中文说明

- 插件内置 `CATALOG`：43 条中文卡片，字段 `short`（做什么）、`scene`（什么时候用）、`when[]`（触发场景，2–3 条）、`io`（需要什么 · 得到什么）。
- 悬停面板：名称 → 一句话作用 → 「什么时候用」列表 → 「需要什么 · 得到什么」，放不下时自动翻到左侧。
- 未收录的 skill 退回它自己的 `description`，英文的如实标注「暂未收录中文说明」，不编造假翻译。

### 点击

把 `使用 skill「<name>」` 写进输入框（已有草稿保留在下一行），按 `AUTO_SEND` 决定是否立即提交；同时记一次使用次数（`localStorage` 键 `dshsm.usage`）。真正的 skill 调用由 Agent 侧 `skill` 工具完成，与在对话里说「用 xxx skill」等价。

键盘：`↑`/`↓` 选行、`Enter` 执行、`Esc` 关闭。

## 配置

`client.js` 顶部常量：

- `AUTO_SEND`（默认 `true`）：`false` 时只填输入框不发送。
- `PANEL_W = 380`、`TIP_W = 330`：面板与说明框宽度，窄屏自动收窄、说明框自动翻边。
- `COMMON_MIN_WEIGHT = 70`、`COMMON_LIMIT = 10`、`RECENT_LIMIT = 5`、`PIN_LIMIT = 5`：分区阈值。
- `TIP_SHOW_DELAY = 280`、`TIP_HIDE_DELAY = 140`：悬停说明的显示/隐藏延迟（毫秒）。

改完刷新页面即可生效（本地目录安装是软链，不用重装）。

## 安装

1. 包目录放在**工作区**里，不要写进 profile：`plugins/dsh-skill-menu/`
2. **插件 → 添加插件** 里选择该目录；或用 `plugin_manager` 的 `install_bundle`，`target` 传目录绝对路径。已装过的刷新页面即可。
3. 插件管理页显示「技能菜单 / 在输入框左侧加一个 skill 按钮…」。

## 验证

1. 输入框工具栏左侧出现 `skill` 字样按钮（表情包按钮右侧、优化左侧）。
2. 点一下：面板向上弹出，标题「技能库」，副标题「N 个可用」，默认「推荐」排序，首屏是「常用」分区。
3. 悬停任意一行：左侧（或右侧）浮出四段中文说明；行内出现「置顶」。
4. 点任意一行：面板关闭，输入框出现 `使用 skill「<name>」` 并发出。
5. 排序/搜索：点头部「名称」→ 列表变字母序「全部技能」；搜索框输入「PPT」→ 4 条结果。
6. 校验数量：`curl http://127.0.0.1:<端口>/dsh-skill-menu/list?sessionId=<会话 id>` 的 `skills` 条数 = 面板「N 个可用」。

## 限制

- 数据路由 `/dsh-skill-menu/list` **只接受本机回环请求**，非回环 403；非 GET 405。
- 中文说明是内置词表，新增 skill 需补一条；未补的显示原文并标注。
- 使用次数、置顶只存本机 `localStorage`，换机器/清缓存即丢。
- 面板在上次打开时拉取列表，缓存在本次页面会话；面板内错误行带「重试」。
- 不读取、不修改 skill 文件本身。
- 界面文案固定中文（需求即中文界面）；`locale/*.json` 只提供插件管理页的标题与描述。

## 已知实现细节（调试中确认）

- 面板与中文说明框都通过 `ReactDOM.createPortal(..., document.body)` 渲染：输入框外层容器带 `transform`/`overflow`，内联渲染会被裁切。
- 宿主在 `document` 上以捕获阶段处理弹层里的原生 `click`，React 的 portal 委托收不到，所以行的点击改由 `window` 捕获阶段按 `data-dshsm-row` / `data-dshsm-action` 分发；React 的 `onPointerDown` 仅作兜底，两条路用 400ms 去重。
- 行元素不设 `title` 属性，避免和自绘中文说明同时弹出原生提示。
- 技能列表来自宿主 `skills` 服务：`scope` 必须传 **Agent 对象**才能拿到当前会话完整目录（43 条），传 `agent.ctx` 只有全局层（12 条）。
- `agents.get()` 的 id 带 `session-` 前缀，而客户端拿到的 `props.sessionId` 是裸 uuid，所以要依次尝试原值、`session-<uuid>`、后缀匹配。
- 自家 `dsh-skills-manager` 的外部技能通过 `provider === 'dsh-skills-manager-external'` 识别，并在 `~/.dsh/skills-manager` 里补扫磁盘 `SKILL.md`；这类行标「技能管家」。
- 面板定位：`position: fixed` + 触发器的 `getBoundingClientRect()` 算 `left`，`bottom = innerHeight - rect.top + 8`，高度上限 `min(520, rect.top - 24)`；实测该组合在 Electron 窗口里视觉位置与命中位置一致。