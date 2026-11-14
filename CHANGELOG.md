# Changelog

All notable changes to this plugin are recorded here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning is
[semver](https://semver.org/).

## [0.2.2] - 2026-11-14

### Added

- Chinese notes are now collected automatically, so a skill downloaded later
  needs no code change: the host half reuses an author-written Chinese
  description, falls back to a disk cache, then asks the machine's default
  model (`llm.stream`, 12 skills per call) for a one-line Chinese summary, and
  prefers the `translator` service when that bundle is installed.
- `~/.dsh/skill-menu/zh.json` caches every generated note, keyed by a hash of
  the skill name plus its description.
- The panel refetches while notes are still being written (`zhPending`), so
  rows fill in by themselves; the footer's coverage climbs to N/N.

### Changed

- A description only counts as Chinese when it has at least 12 CJK characters
  making up 20% of the text, so English prose carrying a few Chinese words is
  translated instead of shown raw.

## [0.2.1] - 2026-11-14

### Changed

- README rewritten (zh + en): fuller description of every feature, a new
  "how it works" section covering the host route, session scope resolution,
  portal rendering and click dispatch, plus a configuration table.
- README image set grown from one screenshot to five: composer trigger,
  panel, hover note, name-sorted list, search results.

## [0.2.0] - 2026-11-14

### Added

- Chinese note catalogue (`CATALOG`, 43 skills) with four fields per skill:
  one-line purpose, when to use it, trigger list, needs/returns.
- Four-part hover note (name → purpose → when → needs/returns), flips to the
  left when it would overflow.
- Sectioned ordering: pinned → recent → common (weight ≥ 70, top 10) → six
  categories. Extra modes: by name, by recency.
- Search across skill name, Chinese purpose and category label.
- Pin (max 5), usage counters, sort preference, all in `localStorage`
  (`dshsm.pins`, `dshsm.usage`, `dshsm.sort`), with a footer clear action.
- Keyboard navigation: `↑` / `↓` select, `Enter` run, `Esc` close.
- Row source tags, including 技能管家 for skills contributed by
  `dsh-skills-manager`.

### Changed

- Trigger is a `skill` text button instead of a sparkle icon (the sparkle was
  indistinguishable from the 优化 button next to it).
- Panel and hover note render through a `document.body` portal, so the
  composer card's `transform` / `overflow` no longer clips them.
- Click dispatch moved to a capture-phase listener on `window`
  (`data-dshsm-row` / `data-dshsm-action`), with `onPointerDown` as fallback
  and 400 ms de-duplication; rows no longer set a native `title` attribute.
- Skill listing resolves the viewer scope through the session's Agent object,
  which returns the full per-session catalogue (43 rows) instead of the global
  layer only (12 rows).
- `agents.get()` id matching tries the bare session id, then `session-<id>`,
  then a suffix scan.

### Fixed

- Hover note never appeared (clipped overlay).
- Panel listed only globally mounted skills.
- Rows without a Chinese entry showed an empty second line.

## [0.1.0] - 2026-11-14

### Added

- Initial release: `skill` button in `conversation.input.left`, panel in
  `conversation.input.overlay`, host route `/dsh-skill-menu/list`
  (loopback-only, GET-only), click to write `使用 skill「<name>」` into the
  composer and submit.