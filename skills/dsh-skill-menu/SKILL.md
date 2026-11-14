---
name: dsh-skill-menu
description: Install, verify and troubleshoot the dsh-skill-menu plugin for DeepSeek Harness — a skill button beside the composer that lists invocable skills, shows a Chinese note on hover, and invokes the clicked skill. Use when a DSH user wants to install this plugin, report that the skill button or panel is missing, or ask why the listed skill count differs from the skills service.
---

# dsh-skill-menu installer

This skill does not run anything by itself. It tells you how to install and
verify the `dsh-skill-menu` plugin from
<https://github.com/qiejianchuangyi/dsh-skill-menu>.

The plugin is a DSH **bundle** (host half + client half). Installing copies or
links its directory into the user's DSH profile; nothing is published to npm.

## What the plugin does

- Adds a `skill` button to the composer tool row (`conversation.input.left`,
  id `skill-menu`, order 6).
- Opens a panel in `conversation.input.overlay` that lists every skill the
  current session can invoke, grouped as pinned / recent / common / six
  categories, with search and three sort modes.
- Shows a four-part Chinese note on hover: name, purpose, when to use it,
  needs/returns.
- Writes `使用 skill「<name>」` into the composer and submits it on click.

## Install

1. Get the directory onto the machine:

   ```bash
   git clone https://github.com/qiejianchuangyi/dsh-skill-menu.git "$HOME/dsh-plugins/dsh-skill-menu"
   ```

   or download the release zip and extract it to `~/dsh-plugins/`.

2. Register it as a plugin. Preferred: the user clicks **Plugins → Add plugin**
   and selects that directory. Equivalent command line for the agent:
   `plugin_manager` `install_bundle` with `target` set to the absolute
   directory path. Expect `application: applied`.

3. Reload the page (`Ctrl+R`). If the button does not appear, toggle the
   plugin entry off and on once, then reload again.

## Verify

```bash
# host route answers (port: DSH web port, e.g. 63869)
curl -s http://127.0.0.1:<port>/dsh-skill-menu/list | head -c 200

# repository self-checks
node --test tests/host.test.mjs   # expect pass 5
node tests/client-smoke.mjs       # expect "client smoke ok: ..."
```

In the UI: button present, panel shows `N 个可用` equal to the `skills` array
length from the route, hover shows the Chinese note, clicking a row sends
`使用 skill「<name>」`.

## Troubleshoot

| Symptom | Check |
| --- | --- |
| No `skill` button | Plugin disabled or failed to load; check DSH logs, then toggle and reload |
| Panel stuck loading | Route unreachable; `curl` it directly; confirm the port |
| Count smaller than expected | Only `userInvocable: true` rows are listed; also the count is per session |
| Count differs from `curl` | Panel caches the previous fetch; reopen it |
| Hover shows nothing | The note needs ~0.28 s; the panel must be open |
| Click does not send | `AUTO_SEND` may be `false` in `client.js` (fills only); or the composer is read-only |

## Constraints

- The host route accepts loopback requests only and only GET; do not try to
  expose it on a LAN interface.
- UI text is Chinese by design; do not translate the panel unless the user
  asks, and do not rewrite `client.js` for a one-off complaint — point at the
  configuration constants instead.
- Never copy the plugin into the DSH program directory; it lives in the
  workspace and is linked into the profile.