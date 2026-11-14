第一次公开发布。

**功能**

- 技能库面板：置顶 → 最近使用 → 常用 → 六个分类，另有「名称」「最近」两档排序
- 搜索：按技能名、中文用途、分类名实时过滤
- 悬停四段中文说明（内置 43 条文案）：做什么 / 什么时候用 / 需要什么 · 得到什么
- 点击直接调用：写入 `使用 skill「<name>」` 并发送
- 键盘：↑↓ 选行、Enter 执行、Esc 关闭
- 本机记忆：使用次数、置顶、排序偏好（localStorage），页脚可清空
- 只列当前会话可调用的 skill（读 DSH `skills` 服务，按 Agent 作用域解析）；识别 `dsh-skills-manager` 的外部技能

**安装**

```bash
git clone https://github.com/qiejianchuangyi/dsh-skill-menu.git "$HOME/dsh-plugins/dsh-skill-menu"
```

然后在 DSH 的 插件 → 添加插件 里选择该目录，刷新页面。也可以直接下载下方 `dsh-skill-menu.zip` 解压后安装。

**说明**

- 宿主路由 `/dsh-skill-menu/list` 仅接受本机回环请求、仅 GET
- 双语文档：[中文](https://github.com/qiejianchuangyi/dsh-skill-menu/blob/main/docs/USAGE.zh.md) · [English](https://github.com/qiejianchuangyi/dsh-skill-menu/blob/main/docs/USAGE.en.md)
- 变更记录见 [CHANGELOG](https://github.com/qiejianchuangyi/dsh-skill-menu/blob/main/CHANGELOG.md)