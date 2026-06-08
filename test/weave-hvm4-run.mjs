// weave-hvm4-run.mjs — the gated backend step: run Weave terms through REAL HVM4 and diff.
//
// Closes the loop §4 of weave-and-the-ampersand-stack.md asked for: the toy reducer and HVM4 are two
// engines for the same Interaction Calculus, so a faithful lowering must make them agree on normal
// forms. We compare on INTEGER outputs (decode Church results with succ/zero) so the comparison is a
// plain number on both sides, independent of how each engine prints lambdas.
//
// Reconciled to the actual HVM4 surface (docs/hvm/core.md + observed parser behavior):
//   - application is CALL syntax  f(a)        (NOT the grammar doc's "(f a)")
//   - lambda    λx. body          ops infix   (a + b)
//   - sup       &L{a, b}          era  &{}
//   - dup       ! d &L= v; body   with the two uses written d₀ / d₁  (affine, global vars)
//   => because HVM4 vars are affine, we lower the LINEARIZED Weave term (explicit Dups).
//
// Requires the HVM4 binary. Defaults to ~/hvm4/src/hvm; override with HVM4_BIN=/path/to/hvm.
// Pinned build: `clang -O2 -o src/hvm src/hvm.c` in the HigherOrderCO/HVM4 checkout.

import { Var, Lam, App, Dup, Op, Lit, normalize } from "../src/weave.mjs";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HVM4_BIN = process.env.HVM4_BIN || join(process.env.HOME || "/root", "hvm4", "src", "hvm");

// ---- linearize (affine form with explicit Dups) — shared shape with the other harnesses ----
let C = 0; const nm = (p) => `${p}_${C++}`; let L = 0; const lbl = () => `dl${L++}`;
const fr = (t, e = {}) => t.tag === "Var" ? Var(e[t.name] ?? t.name) : t.tag === "Lam" ? (() => { const f = nm(t.name); return Lam(f, fr(t.body, { ...e, [t.name]: f })); })() : t.tag === "App" ? App(fr(t.fun, e), fr(t.arg, e)) : t.tag === "Op" ? Op(t.op, fr(t.a, e), fr(t.b, e)) : t;
const occ = (t, n) => t.tag === "Var" ? (t.name === n ? 1 : 0) : t.tag === "Lam" ? (t.name === n ? 0 : occ(t.body, n)) : t.tag === "App" ? occ(t.fun, n) + occ(t.arg, n) : t.tag === "Dup" ? occ(t.val, n) + ((t.x === n || t.y === n) ? 0 : occ(t.body, n)) : t.tag === "Op" ? occ(t.a, n) + occ(t.b, n) : 0;
const rep = (t, n, names, idx) => t.tag === "Var" ? (t.name === n ? Var(names[idx.i++]) : t) : t.tag === "Lam" ? (t.name === n ? t : Lam(t.name, rep(t.body, n, names, idx))) : t.tag === "App" ? App(rep(t.fun, n, names, idx), rep(t.arg, n, names, idx)) : t.tag === "Op" ? Op(t.op, rep(t.a, n, names, idx), rep(t.b, n, names, idx)) : t.tag === "Dup" ? Dup(t.label, t.x, t.y, rep(t.val, n, names, idx), (t.x === n || t.y === n) ? t.body : rep(t.body, n, names, idx)) : t;
const lin = (t) => { if (t.tag === "Var") return t; if (t.tag === "App") return App(lin(t.fun), lin(t.arg)); if (t.tag === "Op") return Op(t.op, lin(t.a), lin(t.b)); if (t.tag === "Lam") { const b = lin(t.body); const k = occ(b, t.name); if (k <= 1) return Lam(t.name, b); const cs = Array.from({ length: k }, () => nm(t.name)); const b2 = rep(b, t.name, cs, { i: 0 }); const mk = (s, ci) => ci === k - 2 ? Dup(lbl(), cs[k - 2], cs[k - 1], Var(s), b2) : (() => { const r = nm("r"); return Dup(lbl(), cs[ci], r, Var(s), mk(r, ci + 1)); })(); return Lam(t.name, mk(t.name, 0)); } return t; };

// ---- emit real HVM4 source ----
const OP2SYM = { add: "+", mul: "*", sub: "-", le: "<=", eq: "==" };
const SUB0 = "\u2080", SUB1 = "\u2081"; // ₀ ₁
const san = (n) => { let s = String(n).replace(/[^_A-Za-z0-9]/g, "_"); return /^[0-9]/.test(s) ? "_" + s : s; };
const atomCallee = (t) => t.tag === "Var" || t.tag === "App"; // forms that need no parens in callee position
let D = 0; const freshDup = () => `d${D++}`;

function emit(t, sub = {}) {
  switch (t.tag) {
    case "Var": return sub[t.name] ?? san(t.name);
    case "Lit": return String(t.value);
    case "Era": return "&{}";
    case "Lam": return `λ${san(t.name)}. ${emit(t.body, sub)}`;
    case "App": { const f = emit(t.fun, sub); return `${atomCallee(t.fun) ? f : `(${f})`}(${emit(t.arg, sub)})`; }
    case "Op": return `(${emit(t.a, sub)} ${OP2SYM[t.op]} ${emit(t.b, sub)})`;
    case "Dup": { const base = freshDup(); const sub2 = { ...sub, [t.x]: base + SUB0, [t.y]: base + SUB1 }; return `! ${base} &${san(t.label)}= ${emit(t.val, sub)}; ${emit(t.body, sub2)}`; }
    default: throw new Error(`emit: cannot lower ${t.tag}`);
  }
}
export function lowerToHVM4(term) { D = 0; return emit(lin(term)); }

// ---- run HVM4, parse integer output ----
function runHVM4(term) {
  const src = `@main = ${lowerToHVM4(term)}\n`;
  const file = join(tmpdir(), `weave_${Date.now()}_${Math.random().toString(36).slice(2)}.hvm`);
  writeFileSync(file, src);
  let out;
  try { out = execFileSync(HVM4_BIN, [file, "-C10"], { encoding: "utf8", timeout: 30000 }); }
  catch (e) { return { src, error: (e.stdout || "") + (e.stderr || e.message) }; }
  const ints = out.split("\n").map((s) => s.trim()).filter((s) => /^-?[0-9]+$/.test(s)).map(Number);
  return { src, ints, raw: out.trim() };
}

// ---- toy reducer integer ----
const decodeChurch = (c) => App(App(c, Lam("n", Op("add", Var("n"), Lit(1)))), Lit(0)); // c succ 0 -> integer
function toyInt(term) { const w = normalize(term, { budget: 5000000, maxNodes: 200000 }); return w.status === "normal" && w.term.tag === "Lit" ? w.term.value : `<${w.status}/${w.term.tag}>`; }

// ---- battery ----
const v = Var, lam = Lam, ap = (...xs) => xs.reduce((a, b) => App(a, b));
const cn = (k) => lam("f", lam("x", Array.from({ length: k }).reduce((a) => App(v("f"), a), v("x"))));
const plus = lam("m", lam("n", lam("f", lam("x", ap(v("m"), v("f"), ap(v("n"), v("f"), v("x")))))));
const mul = lam("m", lam("n", lam("f", App(v("m"), App(v("n"), v("f"))))));

const battery = [
  ["pure arith (2+3)*4", Op("mul", Op("add", Lit(2), Lit(3)), Lit(4)), 20],
  ["decode c5", decodeChurch(cn(5)), 5],
  ["plus c2 c3", decodeChurch(ap(plus, cn(2), cn(3))), 5],
  ["mul c3 c4", decodeChurch(ap(mul, cn(3), cn(4))), 12],
  ["mul c2 c2 (dup-heavy)", decodeChurch(ap(mul, cn(2), cn(2))), 4],
  ["exp c3 c2 (=2^3)", decodeChurch(ap(cn(3), cn(2))), 8],
];

const RUN = import.meta.url === `file://${process.argv[1]}`;
if (RUN) {
  console.log(`HVM4 binary: ${HVM4_BIN}\n`);
  console.log("DIFFERENTIAL: toy reducer vs HVM4 (integer outputs)\n");
  let pass = 0;
  for (const [name, term, expected] of battery) {
    const toy = toyInt(term);
    const h = runHVM4(term);
    const hvm = h.error ? `ERR` : (h.ints && h.ints.length ? h.ints[0] : `?(${h.raw})`);
    const ok = !h.error && toy === expected && hvm === expected;
    if (ok) pass++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${name.padEnd(24)} expected ${String(expected).padStart(3)} | toy ${String(toy).padStart(3)} | hvm4 ${String(hvm).padStart(3)}`);
    if (h.error) console.log(`        HVM4 error: ${h.error.split("\n")[0]}`);
  }
  console.log(`\n${pass}/${battery.length} terms agreed across the toy reducer AND HVM4.`);
  console.log("\nSample emitted HVM4 source (mul c2 c2, decoded):");
  console.log("  @main = " + lowerToHVM4(decodeChurch(ap(mul, cn(2), cn(2)))));
}
