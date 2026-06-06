// weave-backend.mjs — the "backend" the Elixir surface lowers to (the Nx/EXLA role).
// Reads an IR term as JSON (the exact shape weave.mjs uses), runs the real engine, prints a result.
// Usage: node weave-backend.mjs <normalize|classify|check> '<ir-json>'
import { normalize, checkInvariants, size } from "./weave.mjs";
import { classify } from "./weave-classify.mjs";

const Var = (name) => ({ tag: "Var", name }), Lam = (n, b) => ({ tag: "Lam", name: n, body: b }), App = (f, a) => ({ tag: "App", fun: f, arg: a }), Dup = (label, x, y, val, body) => ({ tag: "Dup", label, x, y, val, body }), Op = (op, a, b) => ({ tag: "Op", op, a, b });
let C = 0; const nm = (p) => `${p}~${C++}`; let L = 0; const lbl = () => `dl${L++}`;
const occ = (t, n) => t.tag === "Var" ? (t.name === n ? 1 : 0) : t.tag === "Lam" ? (t.name === n ? 0 : occ(t.body, n)) : t.tag === "App" ? occ(t.fun, n) + occ(t.arg, n) : t.tag === "Dup" ? occ(t.val, n) + ((t.x === n || t.y === n) ? 0 : occ(t.body, n)) : t.tag === "Op" ? occ(t.a, n) + occ(t.b, n) : 0;
const rep = (t, n, names, idx) => t.tag === "Var" ? (t.name === n ? Var(names[idx.i++]) : t) : t.tag === "Lam" ? (t.name === n ? t : Lam(t.name, rep(t.body, n, names, idx))) : t.tag === "App" ? App(rep(t.fun, n, names, idx), rep(t.arg, n, names, idx)) : t.tag === "Op" ? Op(t.op, rep(t.a, n, names, idx), rep(t.b, n, names, idx)) : t;
const lin = (t) => { if (t.tag === "Var") return t; if (t.tag === "App") return App(lin(t.fun), lin(t.arg)); if (t.tag === "Op") return Op(t.op, lin(t.a), lin(t.b)); if (t.tag === "Lam") { const b = lin(t.body); const k = occ(b, t.name); if (k <= 1) return Lam(t.name, b); const cs = Array.from({ length: k }, () => nm(t.name)); const b2 = rep(b, t.name, cs, { i: 0 }); const mk = (s, ci) => ci === k - 2 ? Dup(lbl(), cs[k - 2], cs[k - 1], Var(s), b2) : (() => { const r = nm("r"); return Dup(lbl(), cs[ci], r, Var(s), mk(r, ci + 1)); })(); return Lam(t.name, mk(t.name, 0)); } return t; };
const show = (t) => t.tag === "Var" ? t.name : t.tag === "Lam" ? `\\${t.name}.${show(t.body)}` : t.tag === "App" ? `(${show(t.fun)} ${show(t.arg)})` : t.tag === "Sup" ? `&${t.label}{${show(t.a)} ${show(t.b)}}` : t.tag === "Dup" ? `!&${t.label}{${t.x} ${t.y}}=${show(t.val)};${show(t.body)}` : t.tag === "Op" ? `${t.op}(${show(t.a)}, ${show(t.b)})` : t.tag === "Lit" ? JSON.stringify(t.value) : "*";

const [, , op, json] = process.argv;
const term = JSON.parse(json);
if (op === "normalize") {
  const w = normalize(lin(term), { budget: 2000000, maxNodes: 20000 });
  console.log(`${w.status}  ${show(w.term)}   [${w.interactions} interactions]`);
} else if (op === "classify") {
  const c = classify(term);
  console.log(`rank ${c.rank}  ${c.rung}`);
} else if (op === "check") {
  const v = checkInvariants(lin(term));
  console.log(`ok=${v.ok}  κ=${v.kappa} (${v.route})` + (v.ok ? "" : "  violations: " + v.violations.map(x => x.invariant).join(",")));
} else console.log("unknown op");
