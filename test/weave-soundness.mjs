// weave-soundness.mjs — stress-testing the cost classifier's verdict against measured cost.
// Falsifiable claim: NO term classified "polynomial" (rank<=1) detonates, and EVERY detonation was
// flagged exponential-or-worse (rank>=2). A counterexample = the cost verdict is unsound. This is
// the empirical soundness arm of "cost as a type" — the standard we held the reducer to — NOT a
// proof of EAL faithfulness.
import { classify } from "../src/weave-classify.mjs";
import { Var, Lam, App, Dup, normalize, size } from "../src/weave.mjs";

let C = 0; const nm = (p) => `${p}~${C++}`; let L = 0; const lbl = () => `dl${L++}`;
const fr = (t, e = {}) => t.tag === "Var" ? Var(e[t.name] ?? t.name) : t.tag === "Lam" ? (() => { const f = nm(t.name); return Lam(f, fr(t.body, { ...e, [t.name]: f })); })() : t.tag === "App" ? App(fr(t.fun, e), fr(t.arg, e)) : t;
const occ = (t, n) => t.tag === "Var" ? (t.name === n ? 1 : 0) : t.tag === "Lam" ? (t.name === n ? 0 : occ(t.body, n)) : t.tag === "App" ? occ(t.fun, n) + occ(t.arg, n) : t.tag === "Dup" ? occ(t.val, n) + ((t.x === n || t.y === n) ? 0 : occ(t.body, n)) : 0;
const rep = (t, n, names, idx) => t.tag === "Var" ? (t.name === n ? Var(names[idx.i++]) : t) : t.tag === "Lam" ? (t.name === n ? t : Lam(t.name, rep(t.body, n, names, idx))) : t.tag === "App" ? App(rep(t.fun, n, names, idx), rep(t.arg, n, names, idx)) : t.tag === "Dup" ? Dup(t.label, t.x, t.y, rep(t.val, n, names, idx), (t.x === n || t.y === n) ? t.body : rep(t.body, n, names, idx)) : t;
const lin = (t) => { if (t.tag === "Var") return t; if (t.tag === "App") return App(lin(t.fun), lin(t.arg)); if (t.tag === "Lam") { const b = lin(t.body); const k = occ(b, t.name); if (k <= 1) return Lam(t.name, b); const cs = Array.from({ length: k }, () => nm(t.name)); const b2 = rep(b, t.name, cs, { i: 0 }); const mk = (s, ci) => ci === k - 2 ? Dup(lbl(), cs[k - 2], cs[k - 1], Var(s), b2) : (() => { const r = nm("r"); return Dup(lbl(), cs[ci], r, Var(s), mk(r, ci + 1)); })(); return Lam(t.name, mk(t.name, 0)); } return t; };

const BUD = 1500000, CAP = 5000;
function run(term) { let w; try { w = normalize(lin(fr(term)), { budget: BUD, maxNodes: CAP }); } catch { return { detonated: true, why: "stack", i: NaN }; } return { detonated: w.status !== "normal", why: w.status, i: w.interactions }; }

const v = Var, lam = Lam, ap = (...xs) => xs.reduce((a, b) => App(a, b));
const cn = (k) => lam("f", lam("x", Array.from({ length: k }).reduce((a) => App(v("f"), a), v("x"))));
const plus = lam("m", lam("n", lam("f", lam("x", ap(v("m"), v("f"), ap(v("n"), v("f"), v("x")))))));
const mul = lam("m", lam("n", lam("f", App(v("m"), App(v("n"), v("f"))))));
const tower = (k) => ap(...Array.from({ length: k }, () => cn(2)));

// ---- adversarial battery: spans the boundary, designed to catch a mislabel ----
const battery = [
  // should be polynomial (rank<=1) AND must not detonate:
  ["plus c20 c20", ap(plus, cn(20), cn(20))],
  ["mul c8 c8", ap(mul, cn(8), cn(8))],
  ["mul c12 c12", ap(mul, cn(12), cn(12))],
  ["mul (mul c4 c4) c4", ap(mul, ap(mul, cn(4), cn(4)), cn(4))],
  ["plus (mul c6 c6) (mul c6 c6)", ap(plus, ap(mul, cn(6), cn(6)), ap(mul, cn(6), cn(6)))],
  ["mul (plus c5 c5) (plus c5 c5)", ap(mul, ap(plus, cn(5), cn(5)), ap(plus, cn(5), cn(5)))],
  // exponential (rank 2): small complete, large detonate — both must be flagged >=2:
  ["c4 c2 (=2^4)", ap(cn(4), cn(2))],
  ["c10 c2 (=2^10)", ap(cn(10), cn(2))],
  ["c12 c2 (=2^12)", ap(cn(12), cn(2))],
  ["c18 c2 (=2^18)", ap(cn(18), cn(2))],
  // non-elementary (rank>=3): detonate:
  ["tower(4)", tower(4)],
  ["tower(5)", tower(5)],
];

// ---- random simply-typed terms for breadth ----
const O = { t: "o" }, Arr = (a, b) => ({ t: "arr", a, b });
const teq = (x, y) => x.t === "o" && y.t === "o" ? true : x.t === "arr" && y.t === "arr" ? teq(x.a, y.a) && teq(x.b, y.b) : false;
const rT = (d) => d <= 0 || Math.random() < 0.55 ? O : Arr(rT(d - 1), rT(d - 1));
let g = 0; const gv = () => `u${g++}`;
function gen(ctx, type, fuel) { const cs = ctx.filter(b => teq(b.type, type)); const o = []; if (type.t === "arr") o.push("lam"); if (cs.length) o.push("var", "var"); if (fuel > 0) o.push("app", "app"); if (!o.length) return null; for (let k = 0; k < 6; k++) { const c = o[Math.floor(Math.random() * o.length)]; if (c === "var") return Var(cs[Math.floor(Math.random() * cs.length)].name); if (c === "lam") { const x = gv(); const b = gen([...ctx, { name: x, type: type.a }], type.b, fuel - 1); if (b) return Lam(x, b); } if (c === "app") { const A = rT(1); const f = gen(ctx, Arr(A, type), fuel - 1); if (f) { const a = gen(ctx, A, fuel - 1); if (a) return App(f, a); } } } return cs.length ? Var(cs[Math.floor(Math.random() * cs.length)].name) : null; }
const targets = [Arr(Arr(O, O), Arr(O, O)), Arr(O, O), Arr(Arr(O, O), O), Arr(Arr(Arr(O, O), O), Arr(O, O))];
const sz = (t) => t.tag === "Var" ? 1 : t.tag === "Lam" ? 1 + sz(t.body) : t.tag === "App" ? 1 + sz(t.fun) + sz(t.arg) : 1;
function genClosed() { for (let i = 0; i < 120; i++) { const T = targets[Math.floor(Math.random() * targets.length)]; const t = gen([], T, 3 + Math.floor(Math.random() * 2)); if (t && sz(t) <= 16) return t; } return null; }

// ---- run battery + random, check the predicate ----
const START = Date.now();
let total = 0, viol = 0, detonations = 0, minDetoRank = 99;
const rankHist = {}; const violWitness = [];
function check(name, term, verbose) {
  total++;
  const c = classify(term);
  const r = run(term);
  rankHist[c.rank] = (rankHist[c.rank] || 0) + 1;
  if (r.detonated) { detonations++; if (c.rank < minDetoRank) minDetoRank = c.rank; }
  const violation = (c.rank <= 1) && r.detonated;   // claimed polynomial, yet blew up
  if (violation) { viol++; violWitness.push(name || "(random)"); }
  if (verbose) console.log(`  ${(name || "").padEnd(30)} rank ${String(c.rank).padStart(2)} ${c.rung.padEnd(26)} ${r.detonated ? "DETONATED (" + r.why + ")" : r.i + " i"}${violation ? "   <-- VIOLATION" : ""}`);
}
console.log("ADVERSARIAL BATTERY (verdict vs measured):");
for (const [name, term] of battery) check(name, term, true);
let rnd = 0;
for (let i = 0; i < 2000; i++) { if (Date.now() - START > 60000) break; const raw = genClosed(); if (!raw) continue; rnd++; check(null, raw, false); }

console.log(`\nrandom simply-typed terms checked: ${rnd}`);
console.log(`rank histogram: ${JSON.stringify(rankHist)}`);
console.log(`detonations: ${detonations}   (minimum rank among them: ${detonations ? minDetoRank : "n/a"})`);
console.log(`\nFALSIFIABLE PREDICATE — rank<=1 terms that detonated: ${viol}`);
if (viol) console.log("  VIOLATIONS:", violWitness.slice(0, 8));
console.log(viol === 0 && (detonations === 0 || minDetoRank >= 2)
  ? `\nPASS: no "polynomial" verdict detonated; every detonation was flagged rank>=2. Verdict sound on this population.`
  : `\nFAIL: the cost verdict mislabeled at least one term.`);
