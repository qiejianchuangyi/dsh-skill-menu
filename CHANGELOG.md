# Changelog

All notable changes to this plugin are recorded here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning is
[semver](https://semver.org/).

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