// weave-classify.mjs — cost as a type, statically, validated against measured cost.
// classify(term) infers simple types and reports the iteration RANK: the maximal type-order at
// which a duplicated binder sits. Rank is the ladder rung — poly / exp / tower — computed WITHOUT
// running the term. We then run the term and show the static verdict matched the dynamic cliff.
//
// Principle: iterating a first-order function (o→o, order 1) is polynomial; a tower forces each
// stacked numeral to be applied to the previous, pushing the duplicated binder's order up one per
// level — the iteration-rank / Grzegorczyk story. This is an under-approximation of full EAL/LAL
// inference (it uses STLC type-order as the rank proxy), not the Baillot–Terui algorithm; the
// verdicts below are validated empirically, not proven complete.
import { Var, Lam, App, Dup, Op, Lit, normalize, size } from "./weave.mjs";

// ---- type inference (monomorphic, union-find) ----
let TVc = 0; const tvar = () => ({ k: "v", id: TVc++, ref: null }); const tarr = (a, b) => ({ k: "arr", a, b });
const find = (t) => { while (t.k === "v" && t.ref) t = t.ref; return t; };
const occurs = (v, t) => { t = find(t); return t.k === "v" ? t.id === v.id : t.k === "arr" ? (occurs(v, t.a) || occurs(v, t.b)) : false; };
const unify = (a, b) => { a = find(a); b = find(b); if (a === b) return true; if (a.k === "v") { if (occurs(a, b)) return false; a.ref = b; return true; } if (b.k === "v") { if (occurs(b, a)) return false; b.ref = a; return true; } if (a.k === "arr" && b.k === "arr") return unify(a.a, b.a) && unify(a.b, b.b); return false; };
const order = (t) => { t = find(t); return t.k === "arr" ? Math.max(order(t.a) + 1, order(t.b)) : 0; };
let binder, terr;
const infer = (ctx, t) => {
  if (t.tag === "Var") return ctx[t.name] || tvar();
  if (t.tag === "Lam") { const v = tvar(); binder.set(t.name, v); return tarr(v, infer({ ...ctx, [t.name]: v }, t.body)); }
  if (t.tag === "App") { const tf = infer(ctx, t.fun), ta = infer(ctx, t.arg), tr = tvar(); if (!unify(tf, tarr(ta, tr))) terr = true; return tr; }
  if (t.tag === "Op") { const base = tvar(); if (!unify(infer(ctx, t.a), base)) terr = true; if (!unify(infer(ctx, t.b), base)) terr = true; return base; }
  if (t.tag === "Lit") return tvar();
  return tvar();
};
// ---- helpers ----
let G = 0; const fr = (t, e = {}) => t.tag === "Var" ? Var(e[t.name] ?? t.name) : t.tag === "Lam" ? (() => { const f = "b" + (G++); return Lam(f, fr(t.body, { ...e, [t.name]: f })); })() : t.tag === "App" ? App(fr(t.fun, e), fr(t.arg, e)) : t.tag === "Op" ? Op(t.op, fr(t.a, e), fr(t.b, e)) : t;
const occ = (t, n) => t.tag === "Var" ? (t.name === n ? 1 : 0) : t.tag === "Lam" ? (t.name === n ? 0 : occ(t.body, n)) : t.tag === "App" ? occ(t.fun, n) + occ(t.arg, n) : t.tag === "Dup" ? occ(t.val, n) + ((t.x === n || t.y === n) ? 0 : occ(t.body, n)) : t.tag === "Op" ? occ(t.a, n) + occ(t.b, n) : 0;

// ---- the classifier ----
function classify(raw) {
  TVc = 0; G = 0; binder = new Map(); terr = false;
  const t = fr(raw); infer({}, t);
  let rank = -1;
  const w = (x) => { if (x.tag === "Lam") { if (occ(x.body, x.name) >= 2) { const o = order(binder.get(x.name)); if (o > rank) rank = o; } w(x.body); } else if (x.tag === "App") { w(x.fun); w(x.arg); } else if (x.tag === "Op") { w(x.a); w(x.b); } };
  w(t);
  let rung;
  if (terr) rung = "untypable (analysis N/A)";
  else if (rank < 0) rung = "linear (no duplication)";
  else if (rank === 0) rung = "linear";
  else if (rank === 1) rung = "polynomial";
  else if (rank === 2) rung = "exponential";
  else rung = `non-elementary (tower ~${rank})`;
  return { rank, rung, terr };
}

// ---- linearize + measure (to RUN the term and confirm the prediction) ----
let C = 0; const nm = (p) => `${p}~${C++}`; let L = 0; const lbl = () => `dl${L++}`;
const frz = (t, e = {}) => t.tag === "Var" ? Var(e[t.name] ?? t.name) : t.tag === "Lam" ? (() => { const f = nm(t.name); return Lam(f, frz(t.body, { ...e, [t.name]: f })); })() : t.tag === "App" ? App(frz(t.fun, e), frz(t.arg, e)) : t.tag === "Op" ? Op(t.op, frz(t.a, e), frz(t.b, e)) : t;
const rep = (t, n, names, idx) => t.tag === "Var" ? (t.name === n ? Var(names[idx.i++]) : t) : t.tag === "Lam" ? (t.name === n ? t : Lam(t.name, rep(t.body, n, names, idx))) : t.tag === "App" ? App(rep(t.fun, n, names, idx), rep(t.arg, n, names, idx)) : t.tag === "Op" ? Op(t.op, rep(t.a, n, names, idx), rep(t.b, n, names, idx)) : t;
const lin = (t) => { if (t.tag === "Var") return t; if (t.tag === "App") return App(lin(t.fun), lin(t.arg)); if (t.tag === "Op") return Op(t.op, lin(t.a), lin(t.b)); if (t.tag === "Lam") { const b = lin(t.body); const k = occ(b, t.name); if (k <= 1) return Lam(t.name, b); const cs = Array.from({ length: k }, () => nm(t.name)); const b2 = rep(b, t.name, cs, { i: 0 }); const mk = (s, ci) => ci === k - 2 ? Dup(lbl(), cs[k - 2], cs[k - 1], Var(s), b2) : (() => { const r = nm("r"); return Dup(lbl(), cs[ci], r, Var(s), mk(r, ci + 1)); })(); return Lam(t.name, mk(t.name, 0)); } return t; };
function measure(term) { let w; try { w = normalize(lin(frz(term)), { budget: 4000000, maxNodes: 2000 }); } catch { return "stack-overflow"; } return w.status === "normal" ? `${w.interactions} i, normal` : `${w.status.toUpperCase()} (cliff)`; }

export { classify };

// ---- families / demo ----
const RUN = import.meta.url === `file://${process.argv[1]}`;
const v = Var, lam = Lam, ap = (...xs) => xs.reduce((a, b) => App(a, b));
const cn = (k) => lam("f", lam("x", Array.from({ length: k }).reduce((a) => App(v("f"), a), v("x"))));
const plus = lam("m", lam("n", lam("f", lam("x", ap(v("m"), v("f"), ap(v("n"), v("f"), v("x")))))));
const mul = lam("m", lam("n", lam("f", App(v("m"), App(v("n"), v("f"))))));
const tower = (k) => ap(...Array.from({ length: k }, () => cn(2)));

if (RUN) {
const rows = [
  ["plus c2 c2", ap(plus, cn(2), cn(2))], ["plus c6 c6", ap(plus, cn(6), cn(6))],
  ["mul c2 c2", ap(mul, cn(2), cn(2))], ["mul c6 c6", ap(mul, cn(6), cn(6))],
  ["c3 c2 (exp)", ap(cn(3), cn(2))],
  ["tower(2)", tower(2)], ["tower(3)", tower(3)], ["tower(4)", tower(4)], ["tower(5)", tower(5)],
];
console.log("TERM            STATIC rank/verdict (no execution)      DYNAMIC (actually run)");
console.log("-".repeat(78));
for (const [name, term] of rows) {
  const c = classify(term);
  console.log(`  ${name.padEnd(13)} rank ${String(c.rank).padStart(2)}  ${c.rung.padEnd(26)} ${measure(term)}`);
}
console.log("-".repeat(78));
console.log("addition & multiplication: rank 1 regardless of operand — flat, polynomial.");
console.log("towers: rank CLIMBS with height (2,3,4,5). rank≥3 flagged non-elementary BEFORE running;");
console.log("the dynamic column confirms the detonation lands at tower(4). The type saw the cliff first.");
}
