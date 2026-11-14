# Skill menu · English usage guide

Version 0.2.0 ｜ Package `@qiejianchuangyi/dsh-skill-menu` ｜ [中文](USAGE.zh.md)

---

## 1. Where it sits

A button labelled `skill` joins the tool row under the composer, to the right of the emoji picker and to the left of 优化.

```
[ + ] [ full access ] [ standard ] [ 😊 ] [ skill ] ............ [ 优化 ] [ send ]
```

Click it and the "skill library" panel opens above the composer.

## 2. Panel anatomy

```
┌──────────────────────────────────────────────┐
│ 技能库   43 available    推荐  名称  最近  关闭 │
│ ┌──────────────────────────────────────────┐ │
│ │ search by name or purpose, e.g. PPT       │ │
│ └──────────────────────────────────────────┘ │
│  常用                       大多数人先看这些   │
│  dsh-doc                          自定义  置顶 │
│  查 DSH 自身功能与用法                          │
│  不懂某个设置或插件时                           │
│  …                                            │
│  悬停看说明 · 点击直接调用   中文说明 43/43 清空记录 │
└──────────────────────────────────────────────┘
```

- **Header**: title, number of available skills, three sort modes, close button.
- **Search box**: filters as you type.
- **List**: sections per the active sort; each row has three lines (name / what it does / when to use it) and a source tag.
- **Footer**: hints, Chinese-description coverage, `清空记录`.

(The interface shipped to end users is Chinese; this guide translates the labels.)

## 3. Sorting and sections

| Mode | First screen | When to use |
| --- | --- | --- |
| **推荐** recommended (default) | pinned → recent → common (weight ≥ 70, top 10) → six categories | everyday browsing |
| **名称** name | every skill, alphabetical | you know the name |
| **最近** recent | most used on this machine first | last week's favourites |

Categories are fixed: docs & office / writing / research / design / dev & diagnostics / other. The chosen mode is remembered (`localStorage` key `dshsm.sort`).

## 4. Search

Typing switches the panel to a flat "search results" list matching three things: the skill name (`office`, `nature-`), the Chinese one-line purpose (`论文`, `PPT`, `修复 ACL`), and the category label (`设计排版`, `开发排查`).

Example: `PPT` returns office-pptx, guizang-ppt-skill, nature-paper2ppt, nature-image2ppt. Clearing the box restores the previous sorting.

## 5. Hover note

Rest the pointer on a row for ~0.28 s; a note appears at the left of the panel (right when it would overflow) with four parts:

```
office-pptx
create / edit a slide deck
when to use
  · reporting, training, pitch
  · a draft outline that must become an editable deck
needs · returns
  outline or bullet points → an editable .pptx file
```

A `置顶` (pin) button appears inside the row while hovering; up to 5 pins. Skills without a Chinese entry show their own English `description` plus a "not translated yet" marker.

## 6. Invoke with one click

Clicking a row (or selecting it and pressing `Enter`):

1. closes the panel;
2. writes `使用 skill「<name>」` into the composer, keeping any existing draft on the next line;
3. sends it immediately (`AUTO_SEND = true`);
4. the agent then invokes that skill.

Set `AUTO_SEND = false` at the top of `client.js` and reload to only fill the composer without sending.

## 7. Keyboard

| Key | Action |
| --- | --- |
| `↑` / `↓` | move the selection |
| `Enter` | run the selected skill |
| `Esc` | close the panel |

Clicking outside the panel also closes it.

## 8. Usage counts and pins

- Each invocation increments a counter (`localStorage` key `dshsm.usage`) used by "recent" and "common".
- Pins live in `dshsm.pins` (max 5), toggled by the in-row button.
- Footer `清空记录` clears counters; pins must be removed one by one.
- Records are per browser profile and disappear when that storage is cleared.

## 9. Configuration

Top of `client.js`; a page reload (`Ctrl+R`) applies changes:

| Constant | Default | Meaning |
| --- | --- | --- |
| `AUTO_SEND` | `true` | send after a click, or only fill the composer |
| `PANEL_W` | `380` | panel width in CSS px (shrinks on narrow screens) |
| `TIP_W` | `330` | hover note width |
| `COMMON_MIN_WEIGHT` | `70` | weight threshold for "common" |
| `COMMON_LIMIT` | `10` | max rows in "common" |
| `RECENT_LIMIT` | `5` | max rows in "recent" |
| `PIN_LIMIT` | `5` | max pins |
| `TIP_SHOW_DELAY` | `280` | hover delay before the note shows (ms) |
| `TIP_HIDE_DELAY` | `140` | delay before it hides (ms) |

## 10. Adding a Chinese note for a new skill

1. Open `client.js`, find `CATALOG`.
2. Add an entry keyed by skill name:

```js
'your-skill-name': {
  cat: 'doc',            // doc/write/research/design/dev/other
  weight: 80,            // ≥70 lands in "common"
  short: 'one line: what it does',
  scene: 'when to reach for it',
  when: ['trigger one', 'trigger two'],
  io: 'needs · returns',
},
```

3. Reload: the footer coverage goes from `43/43` to `44/44`.

## 11. Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| No `skill` button | Plugin disabled or failed to load: enable it on the Plugins page, check DSH logs, then reload |
| Panel stuck on "loading…" | Host route unreachable: `curl http://127.0.0.1:<port>/dsh-skill-menu/list`; find the port in DSH settings |
| Fewer skills than expected | Only `userInvocable: true` rows are listed; the count differs per session (agent scope) |
| No hover note | It needs ~0.28 s; or use the keyboard so the row stays selected |
| Click does nothing | `AUTO_SEND = false` only fills the composer; check the composer is writable; look for an `inputActions` error in the console |
| Pin does not stick | Pin limit is 5, unpin one first |
| Count differs from `curl` | The panel cached the previous fetch; reopen it to refresh |

## 12. Privacy and security

- Data comes only from the local DSH process; the plugin makes no outbound requests.
- The data route `/dsh-skill-menu/list` accepts loopback requests only (`127.0.0.1`, `::1`); anything else gets 403, and only GET is allowed.
- Only names and descriptions are read; skill files are never opened or modified.
- Usage records stay in the local browser `localStorage`.