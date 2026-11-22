#!/usr/bin/env node
/**
 * build.mjs — inline the sprite assets into a DSH client bundle.
 *
 * Why masks instead of <img>: DSH's own whale is a CSS mask over `currentColor`,
 * so masking keeps our mark crisp at any icon size and cheap to ship. A vertical
 * sprite strip of N frames is played by stepping `mask-position` through N stops:
 *
 *   mask-size: 100% (N * 100%)           -> the strip is N icon-heights tall
 *   stop i at t = i/N  with y = i*100/(N-1)
 *
 * The percentage works out because mask-position percentages resolve against
 * (container - image), i.e. -(N-1) icon-heights of travel, so p_i maps to exactly
 * -i icon-heights.
 *
 * Usage: node scripts/build.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const readBuf = (p) => fs.readFileSync(path.join(root, p));

const ID = 'dsh-spark-motion';
const SPARK_COLOR = '#D97757';

/** Sprite strips: [key, file, frameCount, frameMs] */
const SOURCES = [
  ['classic', 'assets/classic-thinking.svg', 9, 90],
  ['new', 'assets/new-dots.webp', 110, 1000 / 30],
];

const MIME = { '.svg': 'image/svg+xml', '.webp': 'image/webp' };

/** Frame-by-frame keyframes for one vertical strip. */
function keyframes(name, frames) {
  const stops = [];
  for (let i = 0; i < frames; i += 1) {
    const t = (i * 100) / frames;
    const y = (i * 100) / (frames - 1);
    stops.push(
      `  ${t.toFixed(4).replace(/\.?0+$/, '')}%{-webkit-mask-position:0 ${y.toFixed(4).replace(/\.?0+$/, '')}%;mask-position:0 ${y.toFixed(4).replace(/\.?0+$/, '')}%}`,
    );
  }
  return `@keyframes ${name}{\n${stops.join('\n')}\n}`;
}

const motion = [];
const vars = [];

for (const [key, file, frames, frameMs] of SOURCES) {
  const buf = readBuf(file);
  // A standalone SVG used as a mask/background MUST carry xmlns and an intrinsic
  // size; the shipped sprite strip has neither (it is only ever inlined into HTML).
  const normalized = file.endsWith('.svg')
    ? Buffer.from(
        buf
          .toString('utf8')
          .replace(
            /^<svg[^>]*>/,
            `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="${frames * 100}" viewBox="0 0 100 ${frames * 100}" preserveAspectRatio="none">`,
          ),
        'utf8',
      )
    : buf;
  const ext = path.extname(file);
  const uri = `data:${MIME[ext]};base64,${normalized.toString('base64')}`;
  const duration = (frames * frameMs).toFixed(4).replace(/\.?0+$/, '');

  vars.push(`  --dsh-spark-${key}-mask: url("${uri}");`);
  motion.push(keyframes(`dshspark-${key}`, frames));
  motion.push(
    `[data-dsh-spark-pv="${key}"]{` +
      `-webkit-mask-image:var(--dsh-spark-${key}-mask);mask-image:var(--dsh-spark-${key}-mask);` +
      `-webkit-mask-size:100% ${frames * 100}%;mask-size:100% ${frames * 100}%;` +
      `animation:dshspark-${key} ${duration}ms steps(1,end) infinite}`,
  );
  console.log(`  ${key.padEnd(8)} ${String(frames).padStart(3)} frames  ${frameMs.toFixed(2)}ms  ${(normalized.length / 1024).toFixed(1)}KB`);
}

const kinds = SOURCES.map(([k]) => k);

// Hide the shipped whale only for the kinds we actually replace.
const hideSelectors = kinds
  .flatMap((k) => [
    `html[data-dsh-spark-kind="${k}"] [class*="runningWhaleAnimated"]`,
    `html[data-dsh-spark-kind="${k}"] [class*="runningWhaleStill"]`,
  ])
  .join(',\n  ');

const beforeSelectors = kinds
  .map((k) => `html[data-dsh-spark-kind="${k}"] [class*="runningIcon"]::before`)
  .join(',\n  ');

const perKind = kinds
  .map((k, i) => {
    const [, , frames, frameMs] = SOURCES[i];
    const duration = (frames * frameMs).toFixed(4).replace(/\.?0+$/, '');
    return `html[data-dsh-spark-kind="${k}"] [class*="runningIcon"]::before{` +
      `-webkit-mask-image:var(--dsh-spark-${k}-mask);mask-image:var(--dsh-spark-${k}-mask);` +
      `-webkit-mask-size:100% ${frames * 100}%;mask-size:100% ${frames * 100}%;` +
      `animation:dshspark-${k} ${duration}ms steps(1,end) infinite}`;
  })
  .join('\n');

const css = `:root{
  --dsh-spark-color:${SPARK_COLOR};
${vars.join('\n')}
}
${motion.join('\n')}

[data-dsh-spark-pv]{
  display:block;width:20px;height:20px;background-color:var(--dsh-spark-color,${SPARK_COLOR});
  -webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;
  -webkit-mask-position:0 0;mask-position:0 0;
}

@media (prefers-reduced-motion: no-preference){
  @supports ((-webkit-mask-image:url("")) or (mask-image:url(""))){
    ${hideSelectors}{
      display:none!important;
    }
    ${beforeSelectors}{
      content:"";position:absolute;inset:0;display:block;
      background-color:var(--dsh-spark-color,${SPARK_COLOR});
      -webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;
      -webkit-mask-position:0 0;mask-position:0 0;
    }
${perKind}
  }
}

${read('src/section.css')}
`;

const pkg = JSON.parse(read('package.json'));
const body = read('src/client.js')
  .replace('__CSS__', () => JSON.stringify(css))
  .replace('__VERSION__', () => JSON.stringify(pkg.version));

const bundle = `window.__ModuleLoader__.load({
	id: ${JSON.stringify(ID)},
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
${body}
		return module.exports;
	}
});
`;

fs.mkdirSync(path.join(root, 'lib'), { recursive: true });
fs.writeFileSync(path.join(root, 'lib/client.js'), bundle);
console.log(`\nwrote lib/client.js  ${(bundle.length / 1024).toFixed(1)}KB`);
