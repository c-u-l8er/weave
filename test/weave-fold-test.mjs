// weave-fold-test.mjs — differential test for the primitive+structural-recursion layer.
// For random lists and random operators, the linearized Weave fold must equal JS's own fold.
// This stresses: Lit, Op, OP-SUP, and N-way duplication of an Op-carrying combiner via the
// affine linearizer (the exact path the Elixir surface lowers to).
import { Var, Lam, App, Dup, Lit, Op, normalize, show } from "../src/weave.mjs";

// --- replicate the backend's affine linearizer (multi-use binder -> explicit Dups) ---
let C = 0; const nm = (p) => `${p}~${C++}`; let L = 0; const lbl = () => `dl${L++}`;
const occ = (t, n) => t.tag === "Var" ? (t.name === n ? 1 : 0) : t.tag === "Lam" ? (t.name === n ? 0 : occ(t.body, n)) : t.tag === "App" ? occ(t.fun, n) + occ(t.arg, n) : t.tag === "Op" ? occ(t.a, n) + occ(t.b, n) : t.tag === "Dup" ? occ(t.val, n) + ((t.x === n || t.y === n) ? 0 : occ(t.body, n)) : 0;
const rep = (t, n, names, idx) => t.tag === "Var" ? (t.name === n ? Var(names[idx.i++]) : t) : t.tag === "Lam" ? (t.name === n ? t : Lam(t.name, rep(t.body, n, names, idx))) : t.tag === "App" ? App(rep(t.fun, n, names, idx), rep(t.arg, n, names, idx)) : t.tag === "Op" ? Op(t.op, rep(t.a, n, names, idx), rep(t.b, n, names, idx)) : t;
const lin = (t) => { if (t.tag === "Var") return t; if (t.tag === "App") return App(lin(t.fun), lin(t.arg)); if (t.tag === "Op") return Op(t.op, lin(t.a), lin(t.b)); if (t.tag === "Lam") { const b = lin(t.body); const k = occ(b, t.name); if (k <= 1) return Lam(t.name, b); const cs = Array.from({ length: k }, () => nm(t.name)); const b2 = rep(b, t.name, cs, { i: 0 }); const mk = (s, ci) => ci === k - 2 ? Dup(lbl(), cs[k - 2], cs[k - 1], Var(s), b2) : (() => { const r = nm("r"); return Dup(lbl(), cs[ci], r, Var(s), mk(r, ci + 1)); })(); return Lam(t.name, mk(t.name, 0)); } return t; };

// --- surface encodings (same as the Elixir compiler emits) ---
const clist = (xs) => Lam("c", Lam("n", xs.reduceRight((acc, x) => App(App(Var("c"), Lit(x)), acc), Var("n"))));
const fold = (opName, z, xs) => App(App(clist(xs), Lam("a", Lam("b", Op(opName, Var("a"), Var("b"))))), Lit(z));
const OPS = { add: [(a, b) => a + b, 0], mul: [(a, b) => a * b, 1], sub: [(a, b) => a - b, 0] };

const rng = (s) => () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const rand = rng(7);
let pass = 0, fail = 0; const fails = [];
for (let i = 0; i < 1200; i++) {
  const opName = ["add", "mul", "sub"][Math.floor(rand() * 3)];
  const [f, z] = OPS[opName];
  const len = Math.floor(rand() * 7);                       // lists length 0..6
  const xs = Array.from({ length: len }, () => Math.floor(rand() * 7));
  const truth = xs.reduceRight((acc, x) => f(x, acc), z);   // right fold, matches the encoding
  const r = normalize(lin(fold(opName, z, xs)), { budget: 2_000_000, maxNodes: 50_000 });
  const got = r.status === "normal" && r.term.tag === "Lit" ? r.term.value : `NON-LIT(${r.status})`;
  if (got === truth) pass++; else { fail++; if (fails.length < 8) fails.push(`${opName} ${JSON.stringify(xs)} -> got ${got}, want ${truth} [${show(r.term)}]`); }
}
console.log(`fold differential: ${pass} pass, ${fail} fail (random lists x {add,mul,sub})`);
if (fails.length) { console.log("FAILURES:"); fails.forEach((s) => console.log("  " + s)); }
console.log(fail === 0 ? "PASS — linearized structural recursion matches ground truth." : "FAIL");
process.exit(fail === 0 ? 0 : 1);
