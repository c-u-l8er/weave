# Generated: box-and-box compose runtime (do not edit)

These files are **copied verbatim from the `box-and-box` npm package** by
`tools/sync-box-and-box.mjs` (runs on `npm install` via the `prepare` script):

- `value.mjs`   — the alethic value carrier + `combine` / `chain` / `consume` / `phaseIdx`
- `compose.mjs` — the CC2 compose runtime (the Brick, `&` / `|>`, the shared floor `0̲`)

They live here because `weave/` is a standalone, no-bundler static site: the Forge canvas
(`compose.html`) imports them locally (`./src/box-and-box/…`) so the page works as plain files
with no runtime CDN, exactly like `forge.html` imports `./src/weave.mjs`.

**Do not edit these files** — they are regenerated from the pinned dependency.
Source of truth: `box-and-box` on npm (currently `@0.10.0`). To change the runtime,
bump the dependency in `package.json` and run `npm install` (or `npm run sync:box`).
