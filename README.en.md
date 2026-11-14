# dsh-skill-menu · Skill menu (English)

[中文](README.md)

Adds a `skill` button to the left of DeepSeek Harness (DSH) composer: it opens the list of every **invocable** skill on this machine, grouped by purpose and ordered by what people actually use, shows a four-part note on hover, and invokes the skill into the conversation with one click.

![Skill panel](screenshots/panel.png)

## Why

A DSH install ships dozens of skills (43 on this machine). Browsing the `/` menu or recalling names does not scale:

- names and descriptions are in English, so it is hard to tell what each skill is for;
- frequently used skills sit next to one-off ones;
- you have to remember the name before you can use it.

This plugin puts a browsable catalogue next to the composer: grouped by purpose, ordered by usage, explained plainly, invoked in one click.

## Features

- **Lists every invocable skill**: reads the DSH `skills` service in the current session's agent scope; rows with `userInvocable: false` are hidden. Skills contributed by `dsh-skills-manager` are recognised and tagged.
- **Grouped ordering**: pinned → recent → common (weight ≥ 70, top 10) → categories (docs & office / writing / research / design / dev & diagnostics / other). Two more modes: by name, by recency.
- **Search** across skill name, one-line purpose and category (typing `PPT` returns office-pptx, guizang-ppt-skill, nature-paper2ppt, nature-image2ppt).
- **Four-part note on hover**: name → what it does → when to use it → what it needs and returns.
- **Click to invoke**: writes `使用 skill「<name>」` into the composer and sends it; an existing draft is kept on the next line.
- **Local memory**: usage counts, pins and sort preference live in `localStorage`; one click in the footer clears them.
- **Keyboard**: `↑` / `↓` to move, `Enter` to run, `Esc` to close.
- **No network calls**: everything is read from the local DSH process.

## Install

Requires a working DSH installation; `git` only for method B/C.

**A. Release zip + Plugins UI (fewest steps)**

```bash
mkdir -p "$HOME/dsh-plugins"
curl -L -o /tmp/dsh-skill-menu.zip \
  https://github.com/qiejianchuangyi/dsh-skill-menu/releases/latest/download/dsh-skill-menu.zip
unzip -o /tmp/dsh-skill-menu.zip -d "$HOME/dsh-plugins/"
```

Windows PowerShell:

```powershell
Invoke-WebRequest -Uri https://github.com/qiejianchuangyi/dsh-skill-menu/releases/latest/download/dsh-skill-menu.zip -OutFile "$env:TEMP\dsh-skill-menu.zip"
Expand-Archive -Path "$env:TEMP\dsh-skill-menu.zip" -DestinationPath "$HOME\dsh-plugins" -Force
```

Then DSH → **Plugins → Add plugin** → select `~/dsh-plugins/dsh-skill-menu` → reload the page (`Ctrl+R`).

**B. git clone + Plugins UI**

```bash
git clone https://github.com/qiejianchuangyi/dsh-skill-menu.git "$HOME/dsh-plugins/dsh-skill-menu"
```

**C. Command line (let the agent install it)**

```bash
git clone https://github.com/qiejianchuangyi/dsh-skill-menu.git "$HOME/dsh-plugins/dsh-skill-menu"
```

Ask the DSH agent to install that directory; it maps to `plugin_manager` `install_bundle` with the absolute path as `target`. After it applies, toggle the plugin entry off and on once to reload it.

Details: [English usage guide](docs/USAGE.en.md) and [design notes](docs/DESIGN.md).

## Usage

1. A `skill` button appears in the composer tool row (right of the emoji picker, left of 优化).
2. Click it: panel titled `技能库`, subtitle `<N> skills available`, default mode "recommended".
3. Hover a row: the four-part note appears beside the panel.
4. Click a row: the panel closes and `使用 skill「<name>」` is sent; the agent then invokes that skill.

## Configuration

Constants at the top of `client.js`; a page reload applies them:

| Constant | Default | Effect |
| --- | --- | --- |
| `AUTO_SEND` | `true` | `false` fills the composer without sending |
| `PANEL_W` / `TIP_W` | `380` / `330` | panel and note width (auto-shrinks on narrow screens) |
| `COMMON_MIN_WEIGHT` / `COMMON_LIMIT` | `70` / `10` | "common" section threshold and size |
| `RECENT_LIMIT` / `PIN_LIMIT` | `5` / `5` | caps for recent and pinned |
| `TIP_SHOW_DELAY` / `TIP_HIDE_DELAY` | `280` / `140` | hover note delays in milliseconds |

The note catalogue is `CATALOG` in `client.js` (fields `cat / weight / short / scene / when[] / io`). Skills that are not in it fall back to their own English `description` and are marked as untranslated.

## Compatibility and limits

- The data route `/dsh-skill-menu/list` accepts **loopback requests only** (`127.0.0.1`, `::1`); anything else gets 403, and only GET is allowed.
- UI text is Chinese by design; `locale/*.json` only provides the Plugins-page title and description.
- Usage counts and pins live in the local browser `localStorage` (`dshsm.usage` / `dshsm.pins` / `dshsm.sort`).
- Read-only: skill metadata only, never skill file contents.

## Development

```bash
node --check index.js
node --check client.js
node --test tests/host.test.mjs      # 5 host-route tests
node tests/client-smoke.mjs          # client bundle structure assertions
```

Changing `cordis.patch.yml` or the package name requires reinstalling the plugin; `client.js` / `index.js` edits only need a page reload.

## License

[MIT](LICENSE)