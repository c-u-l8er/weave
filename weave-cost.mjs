// weave-cost.mjs — the cost cliff, made visible.
// Church arithmetic: addition and multiplication stay in the elementary fragment (cheap); stacking
// numerals into an exponentiation tower climbs OUT of it and the interaction/space count detonates.
// The point: cost is a structural property (iteration depth) that source LENGTH cannot see — which
// is exactly why a cost *type* (EAL ⇒ elementary, LAL ⇒ polynomial) is worth more than a benchmark.
import { Var, Lam, App, Dup, normalize, size } from "./weave.mjs";

let C = 0; const nm = (p) => `${p}~${C++}`; let L = 0; const lbl = () => `dl${L++}`;
const fr = (t, e = {}) => t.tag === "Var" ? Var(e[t.name] ?? t.name) : t.tag === "Lam" ? (() => { const f = nm(t.name); return Lam(f, fr(t.body, { ...e, [t.name]: f })); })() : t.tag === "App" ? App(fr(t.fun, e), fr(t.arg, e)) : t;
const occ = (t, n) => t.tag === "Var" ? (t.name === n ? 1 : 0) : t.tag === "Lam" ? (t.name === n ? 0 : occ(t.body, n)) : t.tag === "App" ? occ(t.fun, n) + occ(t.arg, n) : t.tag === "Dup" ? occ(t.val, n) + ((t.x === n || t.y === n) ? 0 : occ(t.body, n)) : 0;
const rep = (t, n, names, idx) => t.tag === "Var" ? (t.name === n ? Var(names[idx.i++]) : t) : t.tag === "Lam" ? (t.name === n ? t : Lam(t.name, rep(t.body, n, names, idx))) : t.tag === "App" ? App(rep(t.fun, n, names, idx), rep(t.arg, n, names, idx)) : t.tag === "Dup" ? Dup(t.label, t.x, t.y, rep(t.val, n, names, idx), (t.x === n || t.y === n) ? t.body : rep(t.body, n, names, idx)) : t;
const lin = (t) => { if (t.tag === "Var") return t; if (t.tag === "App") return App(lin(t.fun), lin(t.arg)); if (t.tag === "Lam") { const b = lin(t.body); const k = occ(b, t.name); if (k <= 1) return Lam(t.name, b); const cs = Array.from({ length: k }, () => nm(t.name)); const b2 = rep(b, t.name, cs, { i: 0 }); const mk = (s, ci) => ci === k - 2 ? Dup(lbl(), cs[k - 2], cs[k - 1], Var(s), b2) : (() => { const r = nm("r"); return Dup(lbl(), cs[ci], r, Var(s), mk(r, ci + 1)); })(); return Lam(t.name, mk(t.name, 0)); } return t; };

const lam = Lam, v = Var, ap = (...xs) => xs.reduce((a, b) => App(a, b));
const cn = (k) => lam("f", lam("x", Array.from({ length: k }).reduce((acc) => App(v("f"), acc), v("x"))));
const plus = lam("m", lam("n", lam("f", lam("x", ap(v("m"), v("f"), ap(v("n"), v("f"), v("x")))))));
const mul  = lam("m", lam("n", lam("f", App(v("m"), App(v("n"), v("f"))))));
const tower = (k) => ap(...Array.from({ length: k }, () => cn(2)));   // c2 c2 ... c2  (k copies)

const BUD = 4000000, CAP = 2000;
function measure(term) {
  const lt = lin(fr(term));
  let w; try { w = normalize(lt, { budget: BUD, maxNodes: CAP }); } catch (e) { return { src: size(lt), interactions: NaN, out: "stack-overflow", status: "DETONATED" }; }
  const out = w.status === "normal" ? size(w.term) : (w.nodes ?? ">budget");
  return { src: size(lt), interactions: w.interactions, out, status: w.status };
}
const fmt = (n) => n.toLocaleString("en-US");
const row = (label, m) => console.log(`  ${label.padEnd(16)} src ${String(m.src).padStart(4)} | interactions ${fmt(m.interactions).padStart(11)} | nf-size ${String(m.out).padStart(8)} | ${m.status}`);

console.log("ADDITION  plus cN cN   (elementary — should stay cheap)");
for (const N of [2, 3, 4, 5, 6, 8]) row(`plus c${N} c${N}`, measure(ap(plus, cn(N), cn(N))));

console.log("\nMULTIPLICATION  mul cN cN   (still elementary — polynomial)");
for (const N of [2, 3, 4, 5, 6]) row(`mul c${N} c${N}`, measure(ap(mul, cn(N), cn(N))));

console.log("\nEXPONENTIATION TOWER  c2 c2 ... c2   (climbs OUT of elementary)");
for (const k of [2, 3, 4, 5, 6]) row(`tower(${k})`, measure(tower(k)));

console.log("\n--- the discriminator: source size cannot predict cost ---");
const a = measure(ap(plus, cn(2), cn(2)));
const b = measure(tower(4));
console.log(`  plus c2 c2   src ${a.src}  ->  ${fmt(a.interactions)} interactions, ${a.status}`);
console.log(`  c2 c2 c2 c2  src ${b.src}  ->  ${b.status} at ${fmt(b.interactions)} interactions, ${b.nodes ?? b.out}+ nodes`);
console.log(`  comparable syntax, opposite universe. The discriminator isn't length — it's iteration depth,`);
console.log(`  which is exactly what an EAL/Light-Affine type reads. EAL would certify the first (elementary)`);
console.log(`  and REFUSE the tower (non-elementary). The cost type sees the cliff without running into it.`);
