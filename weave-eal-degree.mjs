// weave-eal-degree.mjs — Stage B: the polynomial DEGREE inside the depth-1 rung.
//
// EAL depth (weave-eal.mjs) certifies the elementary tower height: depth 1 = "polynomial", flat.
// But "polynomial" hides a ladder — plus is linear, mul is quadratic, mul-of-mul is cubic. LAL
// (Light Affine Logic) is the system that pins the *degree*: a §-box (paragraph modality) structure
// whose count is the polynomial degree. Inferring that statically is the named next step beyond EAL
// (Baillot-Terui). This file delivers the *measured* arm of that refinement — it recovers the degree
// from the reducer's interaction count by finite differences — so the target is concrete and the
// eventual static LAL predictor has a ground truth to be checked against.
//
// METHOD: a degree-d polynomial has a constant d-th finite difference and a zero (d+1)-th. We sample
// I(n) (interactions to normalize the family at operand size n) over a window of n and report the
// smallest d whose finite difference is constant (within an integer-ratio tolerance).
//
// HONEST STATUS: degree here is MEASURED, not statically inferred. The EAL depth is the certified
// static quantity; the degree is the validated empirical refinement that static LAL would prove.

import { Var, Lam, App, Dup, normalize } from "./weave.mjs";
import { inferEAL } from "./weave-eal.mjs";

// ---- linearize + measure (shared shape with the other harnesses) ----
let C = 0; const nm = (p) => `${p}~${C++}`; let L = 0; const lbl = () => `dl${L++}`;
const fr = (t, e = {}) => t.tag === "Var" ? Var(e[t.name] ?? t.name) : t.tag === "Lam" ? (() => { const f = nm(t.name); return Lam(f, fr(t.body, { ...e, [t.name]: f })); })() : t.tag === "App" ? App(fr(t.fun, e), fr(t.arg, e)) : t;
const occ = (t, n) => t.tag === "Var" ? (t.name === n ? 1 : 0) : t.tag === "Lam" ? (t.name === n ? 0 : occ(t.body, n)) : t.tag === "App" ? occ(t.fun, n) + occ(t.arg, n) : t.tag === "Dup" ? occ(t.val, n) + ((t.x === n || t.y === n) ? 0 : occ(t.body, n)) : 0;
const rep = (t, n, names, idx) => t.tag === "Var" ? (t.name === n ? Var(names[idx.i++]) : t) : t.tag === "Lam" ? (t.name === n ? t : Lam(t.name, rep(t.body, n, names, idx))) : t.tag === "App" ? App(rep(t.fun, n, names, idx), rep(t.arg, n, names, idx)) : t.tag === "Dup" ? Dup(t.label, t.x, t.y, rep(t.val, n, names, idx), (t.x === n || t.y === n) ? t.body : rep(t.body, n, names, idx)) : t;
const lin = (t) => { if (t.tag === "Var") return t; if (t.tag === "App") return App(lin(t.fun), lin(t.arg)); if (t.tag === "Lam") { const b = lin(t.body); const k = occ(b, t.name); if (k <= 1) return Lam(t.name, b); const cs = Array.from({ length: k }, () => nm(t.name)); const b2 = rep(b, t.name, cs, { i: 0 }); const mk = (s, ci) => ci === k - 2 ? Dup(lbl(), cs[k - 2], cs[k - 1], Var(s), b2) : (() => { const r = nm("r"); return Dup(lbl(), cs[ci], r, Var(s), mk(r, ci + 1)); })(); return Lam(t.name, mk(t.name, 0)); } return t; };
const interactions = (term) => { const w = normalize(lin(fr(term)), { budget: 50000000, maxNodes: 200000 }); return w.status === "normal" ? w.interactions : null; };

// ---- finite-difference degree estimator ----
// Returns the least d such that the d-th forward difference of the samples is (near-)constant.
function fitDegree(samples, maxD = 6) {
  let row = samples.slice();
  for (let d = 0; d <= maxD; d++) {
    const allEqual = row.every((x) => Math.abs(x - row[0]) <= 1e-9);
    if (allEqual && row.length) return d;
    const next = [];
    for (let i = 0; i + 1 < row.length; i++) next.push(row[i + 1] - row[i]);
    row = next;
    if (!row.length) break;
  }
  return null; // not polynomial within maxD over this window (e.g. exponential)
}

// ---- families parameterized by operand size n ----
const v = Var, lam = Lam, ap = (...xs) => xs.reduce((a, b) => App(a, b));
const cn = (k) => lam("f", lam("x", Array.from({ length: k }).reduce((a) => App(v("f"), a), v("x"))));
const plus = lam("m", lam("n", lam("f", lam("x", ap(v("m"), v("f"), ap(v("n"), v("f"), v("x")))))));
const mul = lam("m", lam("n", lam("f", App(v("m"), App(v("n"), v("f"))))));

const families = [
  { name: "plus c_n c_n", expect: 1, mk: (n) => ap(plus, cn(n), cn(n)) },
  { name: "mul c_n c_n", expect: 2, mk: (n) => ap(mul, cn(n), cn(n)) },
  { name: "mul (mul c_n c_n) c_n", expect: 3, mk: (n) => ap(mul, ap(mul, cn(n), cn(n)), cn(n)) },
];

const RUN = import.meta.url === `file://${process.argv[1]}`;
if (RUN) {
  const window = [2, 3, 4, 5, 6, 7, 8];
  console.log("FAMILY                       EAL depth   samples I(n) over n=2..8                 degree (measured / expected)");
  console.log("-".repeat(110));
  let pass = true;
  for (const fam of families) {
    const depth = inferEAL(fam.mk(2)).depth;       // static, certified — should be 1 (polynomial) for all
    const samples = window.map((n) => interactions(fam.mk(n)));
    const ok = samples.every((s) => s !== null);
    const deg = ok ? fitDegree(samples) : null;
    const good = deg === fam.expect && depth === 1;
    if (!good) pass = false;
    console.log(`  ${fam.name.padEnd(26)} ${String(depth).padStart(5)}     [${samples.join(", ").padEnd(38)}]  ${String(deg)} / ${fam.expect}  ${good ? "OK" : "<-- MISMATCH"}`);
  }
  console.log("-".repeat(110));
  console.log(pass
    ? "PASS: every family is EAL-depth 1 (certified polynomial), and the measured degree splits the\n      flat 'polynomial' rung into 1 (add) / 2 (mul) / 3 (mul-of-mul) — exactly the ladder LAL grades."
    : "FAIL: a family's measured degree or EAL depth did not match expectation.");
  console.log("\nNote: EAL depth is the STATIC CERTIFICATE; degree is MEASURED. Static LAL degree inference");
  console.log("(Baillot-Terui §-box counting) is the named next step that would make the degree static too.");
}

export { fitDegree, interactions };
