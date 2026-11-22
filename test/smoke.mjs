#!/usr/bin/env node
/**
 * smoke.mjs — load lib/client.js the way DSH's ModuleLoader would, with a stub
 * browser, and assert the plugin actually does its job. No app, no network.
 *
 *   node test/smoke.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const code = fs.readFileSync(path.join(root, 'lib/client.js'), 'utf8');

// ---- stub browser ----------------------------------------------------------
const appended = [];
const attributes = new Map();
const store = new Map();

const document = {
  documentElement: {
    setAttribute: (k, v) => attributes.set(k, v),
    getAttribute: (k) => attributes.get(k) ?? null,
  },
  head: { appendChild: (node) => appended.push(node) },
  getElementById: () => null,
  createElement: () => ({ dataset: {}, textContent: '', id: '' }),
};

const window = {
  __ModuleLoader__: { load: (m) => (window.__module = m) },
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  },
};

let fetchImpl = async () => ({ ok: false, status: 404, json: async () => null });
const fetchCalls = [];
const fetchStub = (url, init) => {
  fetchCalls.push(String(url));
  return fetchImpl(String(url), init);
};

vm.runInNewContext(code, { window, document, console, fetch: fetchStub });

const mod = window.__module;
assert.ok(mod, 'bundle must call window.__ModuleLoader__.load');
assert.equal(mod.id, 'dsh-spark-motion', 'module id must match the package name');

// ---- stub react + ctx ------------------------------------------------------
const React = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useState: (v) => [v, () => {}],
  useEffect: () => {},
};
const require = (name) => {
  if (name === 'react') return React;
  throw new Error(`unexpected require(${name})`);
};

const exports = mod.factory(require);
assert.equal(typeof exports.apply, 'function', 'client must export apply()');
assert.ok(Array.isArray(exports.inject), 'client must export an inject list');
assert.ok(exports.inject.includes('slots'), 'client must inject the slots service');

// ---- run apply -------------------------------------------------------------
const registrations = [];
const ctx = {
  slots: {
    inject: (name, fn) => fn(),
    register: (meta, component) => {
      registrations.push({ meta, component });
      return () => {};
    },
  },
};

exports.apply(ctx);

assert.equal(appended.length, 1, 'apply must inject exactly one <style>');
const css = appended[0].textContent;
assert.ok(css.length > 1000, 'stylesheet must not be empty');

assert.equal(registrations.length, 1, 'apply must register exactly one slot entry');
const { meta, component } = registrations[0];
assert.equal(meta.name, 'settings.section', 'must register into the settings section slot');
assert.equal(typeof meta.label, 'function', 'section label must be lazy');
assert.equal(meta.label(), '思考动效');
assert.equal(typeof component, 'function', 'slot must receive a component');

// ---- the rendered section must expose the repository link -----------------
const REPO = 'https://github.com/Dos7t3r/dsh-spark-motion';
const tree = component();
const seen = [];
(function walk(node) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) return node.forEach(walk);
  seen.push(node);
  (node.children ?? (node.props && node.props.children) ?? []).forEach?.(walk);
})(tree);
const link = seen.find((n) => n.type === 'a' && n.props && n.props.href === REPO);
assert.ok(link, 'settings section must render a link to the repository');
assert.equal(typeof link.props.onClick, 'function', 'link must intercept the click');
const flat = JSON.stringify(tree);
assert.ok(flat.includes('Dos7t3r/dsh-spark-motion'), 'link label must show the repo slug');
assert.ok(/v\d+\.\d+\.\d+/.test(flat), 'section must show the plugin version');

// ---- stylesheet must actually target DSH's running indicator ---------------
assert.match(css, /\[class\*="runningIcon"\]::before/, 'must paint over the running icon');
assert.match(css, /runningWhaleAnimated/, 'must hide the shipped animated whale');
assert.match(css, /runningWhaleStill/, 'must hide the shipped still whale');
assert.match(css, /data-dsh-spark-kind="classic"/, 'must scope by kind attribute');
assert.match(css, /data-dsh-spark-kind="new"/, 'must scope by kind attribute');
assert.match(css, /prefers-reduced-motion: no-preference/, 'must respect reduced motion');
assert.match(css, /@keyframes dshspark-classic/, 'needs classic keyframes');
assert.match(css, /@keyframes dshspark-new/, 'needs dots keyframes');

// embedded assets
const dataUris = css.match(/data:image\/(svg\+xml|webp);base64,[A-Za-z0-9+/=]+/g) ?? [];
assert.equal(dataUris.length, 2, 'both sprites must be inlined, and nothing else');
assert.ok(
  dataUris.some((u) => u.startsWith('data:image/svg+xml')),
  'classic spark ships as SVG',
);
assert.ok(
  dataUris.some((u) => u.startsWith('data:image/webp')),
  'current dots ship as WebP',
);

// ---- keyframe geometry -----------------------------------------------------
// N frames => N stops, i-th at t = i*100/N and y = i*100/(N-1).
function checkKeyframes(name, frames) {
  const body = css.match(new RegExp(`@keyframes ${name}\\{([\\s\\S]*?)\\n\\}`));
  assert.ok(body, `${name} keyframes present`);
  const stops = [...body[1].matchAll(/([\d.]+)%\{-webkit-mask-position:0 ([\d.]+)%/g)];
  assert.equal(stops.length, frames, `${name} must have one stop per frame`);

  stops.forEach(([, t, y], i) => {
    const wantT = (i * 100) / frames;
    const wantY = (i * 100) / (frames - 1);
    assert.ok(Math.abs(Number(t) - wantT) < 1e-3, `${name} stop ${i} time ${t} != ${wantT}`);
    assert.ok(Math.abs(Number(y) - wantY) < 1e-3, `${name} stop ${i} y ${y} != ${wantY}`);
  });

  // every frame must land exactly one icon-height apart
  for (let i = 1; i < frames; i += 1) {
    const step = (100 / (frames - 1)) * (frames - 1) / frames;
    assert.ok(step > 0);
  }
  return stops.length;
}
checkKeyframes('dshspark-classic', 9);
checkKeyframes('dshspark-new', 110);

// mask-size must be N * 100%
assert.match(css, /mask-size:100% 900%/, 'classic strip is 9 icon-heights');
assert.match(css, /mask-size:100% 11000%/, 'dots strip is 110 icon-heights');

// ---- timing ----------------------------------------------------------------
assert.match(css, /dshspark-classic 810ms steps\(1,end\) infinite/, '9 * 90ms = 810ms');
assert.match(css, /dshspark-new 3666\.6\d*ms steps\(1,end\) infinite/, '110 * 33.33ms');

// ---- default + persistence -------------------------------------------------
assert.equal(attributes.get('data-dsh-spark-kind'), 'dsh', 'boots on the DeepSeek original');

exports.setKind('classic');
assert.equal(attributes.get('data-dsh-spark-kind'), 'classic');
assert.equal(store.get('dsh-spark-motion:kind'), 'classic');

exports.setKind('nonsense');
assert.equal(attributes.get('data-dsh-spark-kind'), 'dsh', 'unknown kinds fall back to dsh');

// ---- version comparison ----------------------------------------------------
assert.equal(exports.VERSION, JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version,
  'bundle version must match package.json');
assert.equal(exports.isNewer('0.3.0', '0.2.0'), true);
assert.equal(exports.isNewer('v0.10.0', 'v0.9.0'), true, 'numeric compare, not lexical');
assert.equal(exports.isNewer('v0.9.0', 'v0.10.0'), false);
assert.equal(exports.isNewer('v0.2.0', 'v0.2.0'), false);
assert.equal(exports.isNewer('garbage', 'v0.2.0'), false);

// ---- update check: releases path ------------------------------------------
assert.match(code, /api\.github\.com\/repos\/Dos7t3r\/dsh-spark-motion/, 'bundle must target the repo API');
assert.equal(typeof exports.checkForUpdates, 'function');

fetchCalls.length = 0;
fetchImpl = async (url) =>
  url.endsWith('/releases/latest')
    ? { ok: true, json: async () => ({ tag_name: 'v9.9.9' }) }
    : { ok: false, json: async () => null };
const happy = await exports.checkForUpdates();
assert.equal(happy.failed, false);
assert.equal(happy.version, 'v9.9.9');
assert.equal(happy.newer, true, 'a much newer release must be reported');
assert.equal(fetchCalls.length, 1, 'a working releases endpoint needs no tag fallback');

// ---- update check: tag fallback picks the highest, not the first -----------
fetchCalls.length = 0;
fetchImpl = async (url) => {
  if (url.endsWith('/releases/latest')) return { ok: false, json: async () => null };
  return {
    ok: true,
    json: async () => [{ name: 'v0.2.0' }, { name: 'v0.10.0' }, { name: 'v0.3.1' }],
  };
};
const fallback = await exports.checkForUpdates();
assert.equal(fallback.version, 'v0.10.0', 'highest tag wins');
assert.equal(fallback.newer, true);
assert.equal(fetchCalls.length, 2, 'falls back to tags after a missing release');

// ---- update check: total failure degrades quietly --------------------------
fetchImpl = async () => {
  throw new Error('offline');
};
const broken = await exports.checkForUpdates();
// realm-safe: the object comes from the vm sandbox, so compare fields, not prototypes
assert.equal(broken.failed, true, 'must never throw');
assert.equal(broken.version, null);
assert.equal(broken.newer, false);

console.log('smoke: OK');
console.log(`  stylesheet  ${(css.length / 1024).toFixed(1)}KB`);
console.log(`  bundle      ${(code.length / 1024).toFixed(1)}KB`);
console.log(`  registrations ${registrations.length} (settings.section → SparkSection)`);
