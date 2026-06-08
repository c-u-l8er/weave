// tools/regenerate-proofs.mjs — regenerate the committed proof transcripts.
//
// Every claim Weave makes is backed by a script that prints the evidence. This tool runs each of
// those scripts and captures its EXACT output into proofs/transcripts/<id>.txt, with a header that
// stamps the command, the date, the Node version, and the exit status. The committed transcripts are
// the "observable proof": a reader checks a claim by reading the file, without running anything.
//
//   node tools/regenerate-proofs.mjs          regenerate every transcript
//   node tools/regenerate-proofs.mjs --check   regenerate into memory and FAIL if anything drifted
//                                              (use in CI to keep the golden files honest)
//
// Two targets are ENVIRONMENT-GATED and may not reproduce on a fresh checkout:
//   - hvm4-run : needs a built HVM4 binary (see HVM4_BIN below)
//   - surface  : needs an `elixir` on PATH
// Their transcripts are still committed (captured where the tools exist) and clearly marked gated,
// so a reader without those tools can still SEE the result.

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "proofs", "transcripts");

// Each target: id, human title, the claim it backs, and how to run it.
const TARGETS = [
  // ---- soundness arm (claim 1) ----
  { id: "validate",    cmd: ["node", "test/weave-validate.mjs"],   title: "Differential validation (12-term battery)" },
  { id: "proptest",    cmd: ["node", "test/weave-proptest.mjs"],   title: "Checker-gated property test (3000 random simply-typed terms)" },
  { id: "fold-test",   cmd: ["node", "test/weave-fold-test.mjs"],  title: "Structural-recursion (fold) differential, 1200 cases" },
  // ---- cost cliff (claim 2) ----
  { id: "cost",        cmd: ["node", "src/weave-cost.mjs"],        title: "The cost cliff, measured (add/mul/tower)" },
  // ---- static prediction (claim 3) ----
  { id: "classify",    cmd: ["node", "src/weave-classify.mjs"],    title: "Static rank vs dynamic cost (the type sees the cliff first)" },
  { id: "soundness",   cmd: ["node", "test/weave-soundness.mjs"],  title: "Classifier soundness battery (no rank<=1 term detonated)" },
  // ---- EAL certificate (claim 4) ----
  { id: "eal",         cmd: ["node", "src/weave-eal.mjs"],         title: "EAL box decoration = certified elementary tower height" },
  { id: "eal-test",    cmd: ["node", "test/weave-eal-test.mjs"],   title: "Certificate vs measured cost; oracle-free-safe witness" },
  { id: "eal-degree",  cmd: ["node", "src/weave-eal-degree.mjs"],  title: "Polynomial degree inside the depth-1 rung (measured 1/2/3)" },
  // ---- core demo (the shape, all three faces) ----
  { id: "weave",       cmd: ["node", "src/weave.mjs"],             title: "Core demo: reducer + invariant checker + closed loop" },
  // ---- substrate independence (claim 5) ----
  { id: "hvm4",        cmd: ["node", "src/weave-hvm4.mjs"],        title: "HVM4 lowering round-trips (toy reducer, no binary needed)" },
  { id: "hvm4-run",    cmd: ["node", "test/weave-hvm4-run.mjs"],   title: "Differential vs real HVM4", gated: "needs a built HVM4 binary" },
  { id: "surface",     cmd: ["elixir", "surface/weave_surface.exs"], title: "Elixir defweave surface lowering to the backend", gated: "needs elixir on PATH" },
  // ---- stack integration: cost certificate -> box-and-box governance floor ----
  { id: "govern",      cmd: ["elixir", "surface/weave_govern.exs"],  title: "Stack e2e: certify → govern → run winner (210) → refused tower DETONATES", gated: "needs elixir + box-and-box" },
];

const NODE_VERSION = process.version;
const STAMP = new Date().toISOString().slice(0, 10);

function toolAvailable(bin) {
  if (bin === "node") return true;
  const r = spawnSync("sh", ["-c", `command -v ${bin}`], { encoding: "utf8" });
  return r.status === 0;
}

function header(t, exit, skipped) {
  const lines = [
    "=".repeat(78),
    `  weave proof transcript — ${t.id}`,
    `  ${t.title}`,
    "-".repeat(78),
    `  command   : ${t.cmd.join(" ")}`,
    `  generated : ${STAMP}   (regenerate: node tools/regenerate-proofs.mjs)`,
    `  node      : ${NODE_VERSION}`,
  ];
  if (t.gated) lines.push(`  gated     : ${t.gated}`);
  lines.push(skipped ? `  status    : SKIPPED (${skipped})` : `  exit code : ${exit}`);
  lines.push("=".repeat(78), "");
  return lines.join("\n");
}

function run(t) {
  const bin = t.cmd[0];
  if (!toolAvailable(bin)) {
    return header(t, null, `${bin} not found`) +
      `\n(this gated target was not run on the machine that generated these transcripts;\n` +
      `the committed copy, if present, was captured where ${bin} was available.)\n`;
  }
  const r = spawnSync(t.cmd[0], t.cmd.slice(1), { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const body = (r.stdout || "") + (r.stderr ? "\n[stderr]\n" + r.stderr : "");
  return header(t, r.status) + body.replace(/\s*$/, "") + "\n";
}

const check = process.argv.includes("--check");
mkdirSync(OUT, { recursive: true });

let drift = 0;
for (const t of TARGETS) {
  const path = join(OUT, `${t.id}.txt`);
  // In --check mode, do not let an unavailable gated tool clobber a previously-captured transcript.
  if (check && t.gated && !toolAvailable(t.cmd[0]) && existsSync(path)) {
    console.log(`  skip-check ${t.id.padEnd(11)} (gated tool absent; keeping committed transcript)`);
    continue;
  }
  const next = run(t);
  if (check) {
    const prev = existsSync(path) ? readFileSync(path, "utf8") : "";
    // Compare ignoring the volatile header (date/node) — only the captured body must be stable.
    const strip = (s) => s.split("=".repeat(78) + "\n\n").slice(1).join("");
    if (strip(prev) !== strip(next)) { drift++; console.log(`  DRIFT      ${t.id}`); }
    else console.log(`  ok         ${t.id}`);
  } else {
    writeFileSync(path, next);
    console.log(`  wrote      proofs/transcripts/${t.id}.txt`);
  }
}

if (check && drift) { console.error(`\n${drift} transcript(s) drifted from committed output.`); process.exit(1); }
if (check) console.log("\nall transcripts match committed output.");
