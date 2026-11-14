# dsh-skill-menu · 技能菜单（中文）

[English](README.en.md)

在 DeepSeek Harness（DSH）的对话输入框左侧加一个 `skill` 按钮：点开就是本机所有**可调用**的 skill，按常用与分类排好，悬停显示四段中文说明，点一下直接把该 skill 调用进对话。

![技能库面板](screenshots/panel.png)

## 为什么做这个

DSH 里的 skill 越来越多（本机默认 43 个），靠 `/` 菜单或记名字都不现实：

- 名字是英文、说明是英文，不知道每个 skill 到底干什么；
- 常用的和一次性的混在一起，找起来费劲；
- 想用某个 skill，还得先想起来它叫什么。

这个插件把「技能库」放到输入框旁边：**按用途分类、按常用排序、用中文说清楚、点一下就调用**。

## 功能

- **一键列出全部可调用 skill**：读 DSH 的 `skills` 服务，按当前会话的 Agent 作用域取目录，`userInvocable: false` 的不显示；同时识别 `dsh-skills-manager` 的外部技能，行上标「技能管家」。
- **分区排序**：置顶 → 最近使用 → 常用（权重 ≥ 70 取前 10）→ 分类（文档办公 / 写作表达 / 研究检索 / 设计排版 / 开发排查 / 其他）；另有两档「名称」「最近」。
- **搜索**：按 skill 名、中文一句话作用、分类名实时过滤（搜 `PPT` 出 office-pptx、guizang-ppt-skill、nature-paper2ppt、nature-image2ppt）。
- **四段中文说明**：名称 → 做什么 → 什么时候用 → 需要什么 · 得到什么；放不下时自动翻到左侧。
- **点击即调用**：把 `使用 skill「<name>」` 写进输入框并发送；已有草稿会保留在下一行。
- **本机记忆**：使用次数、置顶、排序偏好存 `localStorage`，页脚可一键清空。
- **键盘可用**：`↑`/`↓` 选行、`Enter` 执行、`Esc` 关闭。
- **无外网请求**：列表数据全部来自本机 DSH 进程。

## 安装

需要：DSH 已安装并能正常启动；`git`（方式 C 可不用）。

**方式 A：下载 Release 包 + 界面安装（最省事）**

```bash
mkdir -p "$HOME/dsh-plugins"
curl -L -o /tmp/dsh-skill-menu.zip \
  https://github.com/qiejianchuangyi/dsh-skill-menu/releases/latest/download/dsh-skill-menu.zip
unzip -o /tmp/dsh-skill-menu.zip -d "$HOME/dsh-plugins/"
```

Windows PowerShell：

```powershell
Invoke-WebRequest -Uri https://github.com/qiejianchuangyi/dsh-skill-menu/releases/latest/download/dsh-skill-menu.zip -OutFile "$env:TEMP\dsh-skill-menu.zip"
Expand-Archive -Path "$env:TEMP\dsh-skill-menu.zip" -DestinationPath "$HOME\dsh-plugins" -Force
```

然后 DSH → **插件 → 添加插件** → 选择 `~/dsh-plugins/dsh-skill-menu` → 刷新页面（`Ctrl+R`）。

**方式 B：git clone + 界面安装**

```bash
git clone https://github.com/qiejianchuangyi/dsh-skill-menu.git "$HOME/dsh-plugins/dsh-skill-menu"
```

同样在 **插件 → 添加插件** 里选该目录。

**方式 C：命令行安装（让 DSH 里的 agent 装）**

```bash
git clone https://github.com/qiejianchuangyi/dsh-skill-menu.git "$HOME/dsh-plugins/dsh-skill-menu"
```

在 DSH 会话里说「把这个目录装成插件」，等价于 `plugin_manager` 的 `install_bundle`，`target` 传 `~/dsh-plugins/dsh-skill-menu` 的绝对路径。装完对该条目做一次「禁用 → 启用」以确保重载。

更多细节见 [中文使用说明](docs/USAGE.zh.md) 与 [实现说明](docs/DESIGN.md)。

## 使用

1. 输入框左侧工具栏出现 `skill` 按钮（表情包按钮右侧、优化左侧）。
2. 点开：标题「技能库」，副标题「N 个可用」，默认「推荐」排序，首屏是「常用」。
3. 悬停某行：浮出四段中文说明。
4. 点击某行：面板收起，对话里发出 `使用 skill「<name>」`，Agent 随即调用该 skill。

## 配置

`client.js` 顶部常量，改完刷新页面即生效：

| 常量 | 默认 | 作用 |
| --- | --- | --- |
| `AUTO_SEND` | `true` | `false` 时只填入输入框、不自动发送 |
| `PANEL_W` / `TIP_W` | `380` / `330` | 面板与说明框宽度，窄屏自动收窄 |
| `COMMON_MIN_WEIGHT` / `COMMON_LIMIT` | `70` / `10` | 「常用」分区的权重阈值与条数 |
| `RECENT_LIMIT` / `PIN_LIMIT` | `5` / `5` | 「最近使用」「置顶」上限 |
| `TIP_SHOW_DELAY` / `TIP_HIDE_DELAY` | `280` / `140` | 悬停说明的显示/隐藏延迟（毫秒） |

中文说明词表在 `client.js` 的 `CATALOG`，新增 skill 想配中文说明就补一条（字段 `cat / weight / short / scene / when[] / io`）；没补的显示英文原文并标注「暂未收录中文说明」。

## 兼容与限制

- 数据路由 `/dsh-skill-menu/list` **只接受本机回环请求**（`127.0.0.1`、`::1`），非回环返回 403；只接受 GET。
- 界面语言固定中文；`locale/*.json` 只提供插件管理页的标题与描述。
- 使用次数与置顶只存在本机浏览器 `localStorage`（键 `dshsm.usage` / `dshsm.pins` / `dshsm.sort`），换机器或清缓存即丢。
- 只读 skill 元数据，不读取也不修改 skill 文件内容。

## 开发

```bash
node --check index.js
node --check client.js
node --test tests/host.test.mjs      # 5 个宿主路由用例
node tests/client-smoke.mjs          # 客户端 bundle 结构断言
```

改了 `cordis.patch.yml` 或包名后要重新安装插件；只改 `client.js`/`index.js` 刷新页面即可。

## 许可证

[MIT](LICENSE)