// weave-eal-test.mjs — validate the EAL certificate against MEASURED cost and against soundness.
//
// Three checks, none of them circular with the type-order proxy:
//   A. FALSIFIABLE COST PREDICATE (same standard as weave-soundness): no term EAL-certified at
//      depth<=1 detonates, and every detonation carried depth>=2. Checked against the reducer's
//      measured cost, not against classify.
//   B. ORACLE-FREE-SAFE WITNESS: every eal:true term normalizes with NO residual superposition.
//      This is the property I1+I2 alone could not guarantee (weave-design.md Part IV) — the box
//      decoration is the missing certificate.
//   C. AGREEMENT with the validated proxy on the iteration fragment: EAL depth == classify rank.
//      Expected to hold (the proxy was a sound correlate there); a divergence would flag a bug in
//      one of them. The value EAL adds over agreement is the certificate (A/B), not a new number.

import { inferEAL } from "../src/weave-eal.mjs";
import { classify } from "../src/weave-classify.mjs";
import { Var, Lam, App, Dup, normalize } from "../src/weave.mjs";

// ---- linearize + measure (shared shape with weave-soundness.mjs) ----
let C = 0; const nm = (p) => `${p}~${C++}`; let L = 0; const lbl = () => `dl${L++}`;
const fr = (t, e = {}) => t.tag === "Var" ? Var(e[t.name] ?? t.name) : t.tag === "Lam" ? (() => { const f = nm(t.name); return Lam(f, fr(t.body, { ...e, [t.name]: f })); })() : t.tag === "App" ? App(fr(t.fun, e), fr(t.arg, e)) : t;
const occ = (t, n) => t.tag === "Var" ? (t.name === n ? 1 : 0) : t.tag === "Lam" ? (t.name === n ? 0 : occ(t.body, n)) : t.tag === "App" ? occ(t.fun, n) + occ(t.arg, n) : t.tag === "Dup" ? occ(t.val, n) + ((t.x === n || t.y === n) ? 0 : occ(t.body, n)) : 0;
const rep = (t, n, names, idx) => t.tag === "Var" ? (t.name === n ? Var(names[idx.i++]) : t) : t.tag === "Lam" ? (t.name === n ? t : Lam(t.name, rep(t.body, n, names, idx))) : t.tag === "App" ? App(rep(t.fun, n, names, idx), rep(t.arg, n, names, idx)) : t.tag === "Dup" ? Dup(t.label, t.x, t.y, rep(t.val, n, names, idx), (t.x === n || t.y === n) ? t.body : rep(t.body, n, names, idx)) : t;
const lin = (t) => { if (t.tag === "Var") return t; if (t.tag === "App") return App(lin(t.fun), lin(t.arg)); if (t.tag === "Lam") { const b = lin(t.body); const k = occ(b, t.name); if (k <= 1) return Lam(t.name, b); const cs = Array.from({ length: k }, () => nm(t.name)); const b2 = rep(b, t.name, cs, { i: 0 }); const mk = (s, ci) => ci === k - 2 ? Dup(lbl(), cs[k - 2], cs[k - 1], Var(s), b2) : (() => { const r = nm("r"); return Dup(lbl(), cs[ci], r, Var(s), mk(r, ci + 1)); })(); return Lam(t.name, mk(t.name, 0)); } return t; };
// residual superposition = the reducer left an uncollapsed &{} / Dup behind (oracle would be needed).
const residue = (t) => t.tag === "Sup" || t.tag === "Dup" || (t.tag === "Lam" && residue(t.body)) || (t.tag === "App" && (residue(t.fun) || residue(t.arg)));

const BUD = 1500000, CAP = 5000;
function run(term) {
  let w; try { w = normalize(lin(fr(term)), { budget: BUD, maxNodes: CAP }); } catch { return { detonated: true, why: "stack", residue: false }; }
  return { detonated: w.status !== "normal", why: w.status, i: w.interactions, residue: w.status === "normal" && residue(w.term) };
}

// ---- term families (same as weave-soundness.mjs) ----
const v = Var, lam = Lam, ap = (...xs) => xs.reduce((a, b) => App(a, b));
const cn = (k) => lam("f", lam("x", Array.from({ length: k }).reduce((a) => App(v("f"), a), v("x"))));
const plus = lam("m", lam("n", lam("f", lam("x", ap(v("m"), v("f"), ap(v("n"), v("f"), v("x")))))));
const mul = lam("m", lam("n", lam("f", App(v("m"), App(v("n"), v("f"))))));
const tower = (k) => ap(...Array.from({ length: k }, () => cn(2)));

const battery = [
  ["plus c20 c20", ap(plus, cn(20), cn(20))],
  ["mul c8 c8", ap(mul, cn(8), cn(8))],
  ["mul c12 c12", ap(mul, cn(12), cn(12))],
  ["mul (mul c4 c4) c4", ap(mul, ap(mul, cn(4), cn(4)), cn(4))],
  ["plus (mul c6 c6) (mul c6 c6)", ap(plus, ap(mul, cn(6), cn(6)), ap(mul, cn(6), cn(6)))],
  ["c4 c2 (=2^4)", ap(cn(4), cn(2))],
  ["c10 c2 (=2^10)", ap(cn(10), cn(2))],
  ["c12 c2 (=2^12)", ap(cn(12), cn(2))],
  ["tower(4)", tower(4)],
  ["tower(5)", tower(5)],
];

// ---- random simply-typed terms (same generator as weave-soundness.mjs) ----
const O = { t: "o" }, Arr = (a, b) => ({ t: "arr", a, b });
const teq = (x, y) => x.t === "o" && y.t === "o" ? true : x.t === "arr" && y.t === "arr" ? teq(x.a, y.a) && teq(x.b, y.b) : false;
const rT = (d) => d <= 0 || Math.random() < 0.55 ? O : Arr(rT(d - 1), rT(d - 1));
let g = 0; const gv = () => `u${g++}`;
function gen(ctx, type, fuel) { const cs = ctx.filter(b => teq(b.type, type)); const o = []; if (type.t === "arr") o.push("lam"); if (cs.length) o.push("var", "var"); if (fuel > 0) o.push("app", "app"); if (!o.length) return null; for (let k = 0; k < 6; k++) { const c = o[Math.floor(Math.random() * o.length)]; if (c === "var") return Var(cs[Math.floor(Math.random() * cs.length)].name); if (c === "lam") { const x = gv(); const b = gen([...ctx, { name: x, type: type.a }], type.b, fuel - 1); if (b) return Lam(x, b); } if (c === "app") { const A = rT(1); const f = gen(ctx, Arr(A, type), fuel - 1); if (f) { const a = gen(ctx, A, fuel - 1); if (a) return App(f, a); } } } return cs.length ? Var(cs[Math.floor(Math.random() * cs.length)].name) : null; }
const targets = [Arr(Arr(O, O), Arr(O, O)), Arr(O, O), Arr(Arr(O, O), O), Arr(Arr(Arr(O, O), O), Arr(O, O))];
const sz = (t) => t.tag === "Var" ? 1 : t.tag === "Lam" ? 1 + sz(t.body) : t.tag === "App" ? 1 + sz(t.fun) + sz(t.arg) : 1;
function genClosed() { for (let i = 0; i < 120; i++) { const T = targets[Math.floor(Math.random() * targets.length)]; const t = gen([], T, 3 + Math.floor(Math.random() * 2)); if (t && sz(t) <= 16) return t; } return null; }

// =====================================================================================
const START = Date.now();
let costViol = 0, residueViol = 0, agreeChecked = 0, agreeDiverge = 0;
let detonations = 0, minDetoDepth = 99, ealTrue = 0;
const costWit = [], resWit = [], divWit = [];

function check(name, term, verbose) {
  const e = inferEAL(term);
  const r = run(term);
  if (e.eal) ealTrue++;
  if (r.detonated) { detonations++; if (e.depth < minDetoDepth) minDetoDepth = e.depth; }

  // A. cost predicate: certified depth<=1 must not detonate
  if (e.eal && e.depth <= 1 && r.detonated) { costViol++; costWit.push(name || "(random)"); }
  // B. oracle-free-safe: eal:true must leave no residue (when it finished within budget)
  if (e.eal && !r.detonated && r.residue) { residueViol++; resWit.push(name || "(random)"); }
  // C. agreement vs validated proxy on simply-typeable terms
  const c = classify(term);
  if (!c.terr && c.rank >= 0 && e.eal) { agreeChecked++; if (c.rank !== e.depth) { agreeDiverge++; divWit.push(`${name || "(random)"}: classify ${c.rank} vs eal ${e.depth}`); } }

  if (verbose) console.log(`  ${(name || "").padEnd(30)} eal=${(e.eal ? "Y" : "n")} depth ${String(e.depth).padStart(2)} ${e.rung.padEnd(26)} ${r.detonated ? "DETONATED (" + r.why + ")" : r.i + " i" + (r.residue ? " +RESIDUE" : "")}`);
}

console.log("ADVERSARIAL BATTERY (EAL certificate vs measured cost):");
for (const [name, term] of battery) check(name, term, true);
let rnd = 0;
for (let i = 0; i < 2000; i++) { if (Date.now() - START > 60000) break; const raw = genClosed(); if (!raw) continue; rnd++; check(null, raw, false); }

console.log(`\nrandom simply-typed terms checked: ${rnd}   (EAL-certified: ${ealTrue} of ${rnd + battery.length})`);
console.log(`detonations: ${detonations}   (min EAL depth among them: ${detonations ? minDetoDepth : "n/a"})`);
console.log(`\nA. COST PREDICATE — eal depth<=1 terms that detonated: ${costViol}`);
if (costViol) console.log("   VIOLATIONS:", costWit.slice(0, 8));
console.log(`B. ORACLE-FREE-SAFE — eal:true terms with residual superposition: ${residueViol}`);
if (residueViol) console.log("   VIOLATIONS:", resWit.slice(0, 8));
console.log(`C. AGREEMENT vs proxy — checked ${agreeChecked}, divergences: ${agreeDiverge}`);
if (agreeDiverge) console.log("   DIVERGENCES:", divWit.slice(0, 8));

const okA = costViol === 0 && (detonations === 0 || minDetoDepth >= 2);
const pass = okA && residueViol === 0 && agreeDiverge === 0;
console.log(pass
  ? `\nPASS: certificate sound on this population — no certified-cheap term detonated, every eal:true\n      term reduced oracle-free (no residue), and EAL depth matched the validated proxy rank.`
  : `\nFAIL: ${!okA ? "cost predicate broken; " : ""}${residueViol ? "residue under eal:true; " : ""}${agreeDiverge ? "depth disagreement with proxy; " : ""}`);
