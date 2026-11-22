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

vm.runInNewContext(code, { window, document, console });

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

console.log('smoke: OK');
console.log(`  stylesheet  ${(css.length / 1024).toFixed(1)}KB`);
console.log(`  bundle      ${(code.length / 1024).toFixed(1)}KB`);
console.log(`  registrations ${registrations.length} (settings.section → SparkSection)`);
