/**
 * Client-half smoke test without a browser: a tiny React/DOM shim records what
 * the bundle registers and renders each registered component once.
 *   node tests/client-smoke.mjs
 *
 * Catches things a syntax check misses: a broken element tree, a missing slot
 * registration, or a hook used in the wrong order in the open panel.
 */
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const source = fs.readFileSync(path.join(here, '..', 'client.js'), 'utf8')

let open = false
const listeners = new Set()

const React = {
  Fragment: Symbol('Fragment'),
  createElement(type, props, ...children) {
    return { type, props: { ...(props || {}), children: children.length === 0 ? undefined : (children.length === 1 ? children[0] : children) } }
  },
  useState(initial) {
    return [typeof initial === 'function' ? initial() : initial, () => {}]
  },
  useEffect() {},
  useLayoutEffect() {},
  useSyncExternalStore(subscribe, get) {
    listeners.add(subscribe)
    return open ? true : get()
  },
  useRef(value) { return { current: value } },
}

const element = (tag) => ({
  tag, children: [], attributes: {}, textContent: '', parentNode: null,
  setAttribute(name, value) { this.attributes[name] = value },
  appendChild(child) { this.children.push(child); child.parentNode = this; return child },
  removeChild(child) { this.children = this.children.filter((item) => item !== child); return child },
})

const document = {
  head: element('head'),
  currentScript: null,
  baseURI: 'http://127.0.0.1:63869/',
  createElement: (tag) => element(tag),
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener() {},
  removeEventListener() {},
}

let loaded = null
globalThis.window = {
  __ModuleLoader__: { load(definition) { loaded = definition } },
  innerWidth: 1280,
  innerHeight: 900,
  addEventListener() {},
  removeEventListener() {},
}
globalThis.document = document
globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true, skills: [] }) })

new Function('window', 'document', source)(globalThis.window, document)
assert.ok(loaded, 'bundle calls window.__ModuleLoader__.load')
assert.equal(loaded.id, '@qiejianchuangyi/dsh-skill-menu')

const mod = loaded.factory((name) => {
  assert.equal(name, 'react', 'only react is required')
  return React
})
assert.equal(typeof mod.apply, 'function')
assert.deepEqual(mod.inject, ['slots'])

const registrations = []
let styleNode = null
const ctx = {
  slots: {
    inject(name, callback) {
      const component = callback()
      assert.equal(typeof component, 'function', 'slot contribution is a component')
      registrations.push({ name, component })
      return () => {}
    },
    register(definition, component) { return component },
  },
  effect(fn) {
    const dispose = fn()
    assert.equal(typeof dispose, 'function', 'style registration returns its cleanup')
    styleNode = document.head.children[document.head.children.length - 1]
    return () => {}
  },
}

mod.apply(ctx)
assert.deepEqual(registrations.map((entry) => entry.name), ['conversation.input.left', 'conversation.input.overlay'])
assert.ok(styleNode && styleNode.tag === 'style' && styleNode.textContent.includes('.dshsm-panel'), 'styles injected')

// The slot callback wraps the component in one createElement, so render twice.
const mount = (component, props) => {
  const element = component(props)
  return element && element.type ? element.type(element.props || {}) : element
}

// Closed panel renders nothing.
open = false
const panelComponent = registrations.find((entry) => entry.name === 'conversation.input.overlay').component
assert.equal(mount(panelComponent, { inputActions: {}, useInput: undefined, sessionId: 's1' }), null)

// Button renders a labelled trigger.
const button = mount(registrations.find((entry) => entry.name === 'conversation.input.left').component, {})
assert.equal(button.type, 'button')
assert.equal(button.props['data-dsh-skill-menu-trigger'], '1')
assert.equal(button.props['aria-expanded'], 'false')

// Open panel still renders (hooks fire in a stable order) before any fetch lands.
open = true
const rendered = mount(panelComponent, {
  inputActions: { setDraft() {}, submit() {} },
  useInput: undefined,
  sessionId: 's1',
})
assert.ok(rendered && rendered.type === 'div', 'panel root rendered')
assert.equal(rendered.props.className, 'dshsm-panel')
assert.equal(rendered.props.role, 'dialog')
const children = Array.isArray(rendered.props.children) ? rendered.props.children : [rendered.props.children]
const classes = children.map((child) => (child && child.props ? child.props.className : null))
assert.deepEqual(classes, ['dshsm-head', 'dshsm-search', 'dshsm-empty', 'dshsm-foot'], 'panel = header + search + body + footer')
const headParts = children[0].props.children
const headFlat = Array.isArray(headParts) ? headParts : [headParts]
assert.equal(headFlat[0].props.className, 'dshsm-title')
assert.equal(headFlat[0].props.children, '技能库')
const searchInput = children[1].props.children
assert.equal(searchInput.type, 'input')
assert.equal(searchInput.props.type, 'search')

console.log('client smoke ok:', registrations.map((entry) => entry.name).join(', '))