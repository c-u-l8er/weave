#!/usr/bin/env node
// sync-box-and-box.mjs — copy the browser-needed kernel modules out of the installed
// `box-and-box` npm package into src/box-and-box/, so the static Forge canvas (compose.html)
// can import them locally with no bundler and no runtime CDN.
//
// The npm package is the single, version-pinned source of truth (see package.json dependency);
// src/box-and-box/{value,compose}.mjs are GENERATED artifacts — never hand-edit them.
// Runs automatically via the `prepare` script after `npm install`; re-run with `npm run sync:box`.
import { createRequire } from 'node:module';
import { mkdirSync, copyFileSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const dest = join(here, '..', 'src', 'box-and-box');

// resolve the package's own files via its export map, so we copy exactly what's published
const FILES = ['value.mjs', 'compose.mjs'];

// resolve a published file to find the package root, then read version straight off disk
// (box-and-box's `exports` map intentionally does not expose ./package.json)
const anchor = require.resolve('box-and-box/compose'); // .../node_modules/box-and-box/compose.mjs
const pkgRoot = dirname(anchor);
let pkgVersion = 'unknown';
try {
  pkgVersion = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8')).version;
} catch {
  /* leave 'unknown' if the layout is unexpected */
}

mkdirSync(dest, { recursive: true });

for (const f of FILES) {
  copyFileSync(join(pkgRoot, f), join(dest, f));
  process.stdout.write(`  synced ${f}  ←  box-and-box@${pkgVersion}\n`);
}

writeFileSync(
  join(dest, 'README.md'),
  `# Generated: box-and-box compose runtime (do not edit)

These files are **copied verbatim from the \`box-and-box\` npm package** by
\`tools/sync-box-and-box.mjs\` (runs on \`npm install\` via the \`prepare\` script):

- \`value.mjs\`   — the alethic value carrier + \`combine\` / \`chain\` / \`consume\` / \`phaseIdx\`
- \`compose.mjs\` — the CC2 compose runtime (the Brick, \`&\` / \`|>\`, the shared floor \`0̲\`)

They live here because \`weave/\` is a standalone, no-bundler static site: the Forge canvas
(\`compose.html\`) imports them locally (\`./src/box-and-box/…\`) so the page works as plain files
with no runtime CDN, exactly like \`forge.html\` imports \`./src/weave.mjs\`.

**Do not edit these files** — they are regenerated from the pinned dependency.
Source of truth: \`box-and-box\` on npm (currently \`@${pkgVersion}\`). To change the runtime,
bump the dependency in \`package.json\` and run \`npm install\` (or \`npm run sync:box\`).
`,
);

process.stdout.write(`  synced README.md (generated)  ←  box-and-box@${pkgVersion}\n`);
