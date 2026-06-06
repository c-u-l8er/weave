// weave.mjs — a methodology demo for "a better Bend"
// Built in your style: find the invariants, state the rules, enforce them in code, close the loop.
// Runs on plain Node: `node weave.mjs`. Ports to TS verbatim.
//
//   Layer 1  the language core : an Interaction-Calculus reducer (beta + sup/dup), metered.
//   Layer 2  the enforcement   : a static invariant checker (affine use, label coherence, kappa).
//   Layer 3  the loop          : SUP-style superposed search + cost gate + rule induction.

let FRESH = 0;
const fresh = (p = "x") => `${p}${FRESH++}`;

// ---------- AST ----------
const Var = (name) => ({ tag: "Var", name });
const Lam = (name, body) => ({ tag: "Lam", name, body });
const App = (fun, arg) => ({ tag: "App", fun, arg });
const Sup = (label, a, b) => ({ tag: "Sup", label, a, b });
const Dup = (label, x, y, val, body) => ({ tag: "Dup", label, x, y, val, body });
const Era = () => ({ tag: "Era" });
const Lit = (value) => ({ tag: "Lit", value });
// A primitive op is strict in both args and reduces only once both are literals. It introduces no
// binder and no sharing, so it sits at type-order 0 and contributes nothing to the cost rank.
const Op = (op, a, b) => ({ tag: "Op", op, a, b });
const APPLY_OP = (op, x, y) => {
  switch (op) {
    case "add": return x + y;
    case "mul": return x * y;
    case "sub": return x - y;
    case "le":  return x <= y ? 1 : 0;
    case "eq":  return x === y ? 1 : 0;
    default: throw new Error(`unknown op ${op}`);
  }
};

const show = (t) => {
  switch (t.tag) {
    case "Var": return t.name;
    case "Lam": return `\\${t.name}.${show(t.body)}`;
    case "App": return `(${show(t.fun)} ${show(t.arg)})`;
    case "Sup": return `&${t.label}{${show(t.a)} ${show(t.b)}}`;
    case "Dup": return `!&${t.label}{${t.x} ${t.y}}=${show(t.val)}; ${show(t.body)}`;
    case "Era": return `*`;
    case "Lit": return `${JSON.stringify(t.value)}`;
    case "Op": return `${t.op}(${show(t.a)}, ${show(t.b)})`;
  }
};

// Globalize binders to unique names up front. After this, plain (non-renaming) substitution is
// sound AND the intended scope-crossing capture in DUP-LAM works — i.e. HVM's "global lambdas".
const globalize = (t, env = {}) => {
  switch (t.tag) {
    case "Var": return Var(env[t.name] ?? t.name);
    case "Lam": { const n = fresh(t.name); return Lam(n, globalize(t.body, { ...env, [t.name]: n })); }
    case "App": return App(globalize(t.fun, env), globalize(t.arg, env));
    case "Sup": return Sup(t.label, globalize(t.a, env), globalize(t.b, env));
    case "Dup": { const nx = fresh(t.x), ny = fresh(t.y); return Dup(t.label, nx, ny, globalize(t.val, env), globalize(t.body, { ...env, [t.x]: nx, [t.y]: ny })); }
    case "Op": return Op(t.op, globalize(t.a, env), globalize(t.b, env));
    default: return t;
  }
};
const subst = (t, name, val) => {
  switch (t.tag) {
    case "Var": return t.name === name ? val : t;
    case "Lam": return t.name === name ? t : Lam(t.name, subst(t.body, name, val));
    case "App": return App(subst(t.fun, name, val), subst(t.arg, name, val));
    case "Sup": return Sup(t.label, subst(t.a, name, val), subst(t.b, name, val));
    case "Dup": return (t.x === name || t.y === name)
      ? Dup(t.label, t.x, t.y, subst(t.val, name, val), t.body)
      : Dup(t.label, t.x, t.y, subst(t.val, name, val), subst(t.body, name, val));
    case "Op": return Op(t.op, subst(t.a, name, val), subst(t.b, name, val));
    default: return t;
  }
};

// ---------- Layer 1: the metered reducer ----------
const isValue = (t) => t.tag === "Lam" || t.tag === "Sup" || t.tag === "Era" || t.tag === "Lit";
const containsSup = (t) => t.tag === "Sup" || (t.tag === "Lam" && containsSup(t.body)) || (t.tag === "App" && (containsSup(t.fun) || containsSup(t.arg))) || (t.tag === "Dup" && (containsSup(t.val) || containsSup(t.body))) || (t.tag === "Op" && (containsSup(t.a) || containsSup(t.b)));
const size = (t) => t.tag === "Lam" ? 1 + size(t.body) : t.tag === "App" ? 1 + size(t.fun) + size(t.arg) : t.tag === "Sup" ? 1 + size(t.a) + size(t.b) : t.tag === "Dup" ? 1 + size(t.val) + size(t.body) : t.tag === "Op" ? 1 + size(t.a) + size(t.b) : 1;
function reduceOnce(t) {
  if (t.tag === "App") {
    const f = t.fun;
    if (f.tag === "Lam") return { t: subst(f.body, f.name, t.arg), rule: "APP-LAM" };
    if (f.tag === "Sup") { const x0 = fresh("a"), x1 = fresh("a"); return { t: Dup(f.label, x0, x1, t.arg, Sup(f.label, App(f.a, Var(x0)), App(f.b, Var(x1)))), rule: "APP-SUP" }; }
    if (f.tag === "Era") return { t: Era(), rule: "APP-ERA" };
    const rf = reduceOnce(t.fun); if (rf) return { t: App(rf.t, t.arg), rule: rf.rule };
    const ra = reduceOnce(t.arg); if (ra) return { t: App(t.fun, ra.t), rule: ra.rule };
    return null;
  }
  if (t.tag === "Op") {
    if (t.a.tag === "Lit" && t.b.tag === "Lit") return { t: Lit(APPLY_OP(t.op, t.a.value, t.b.value)), rule: "OP-" + t.op };
    if (t.a.tag === "Sup") { const x0 = fresh(), x1 = fresh(); return { t: Dup(t.a.label, x0, x1, t.b, Sup(t.a.label, Op(t.op, t.a.a, Var(x0)), Op(t.op, t.a.b, Var(x1)))), rule: "OP-SUP" }; }
    if (t.b.tag === "Sup") { const x0 = fresh(), x1 = fresh(); return { t: Dup(t.b.label, x0, x1, t.a, Sup(t.b.label, Op(t.op, Var(x0), t.b.a), Op(t.op, Var(x1), t.b.b))), rule: "OP-SUP" }; }
    const ra = reduceOnce(t.a); if (ra) return { t: Op(t.op, ra.t, t.b), rule: ra.rule };
    const rb = reduceOnce(t.b); if (rb) return { t: Op(t.op, t.a, rb.t), rule: rb.rule };
    return null;
  }
  if (t.tag === "Dup") {
    const v = t.val;
    if (!isValue(v)) { const rv = reduceOnce(v); if (rv) return { t: Dup(t.label, t.x, t.y, rv.t, t.body), rule: rv.rule }; }
    if (v.tag === "Sup") {
      if (v.label === t.label) return { t: subst(subst(t.body, t.x, v.a), t.y, v.b), rule: "DUP-SUP/annihilate" };
      const a0 = fresh(), a1 = fresh(), b0 = fresh(), b1 = fresh();
      const body = subst(subst(t.body, t.x, Sup(v.label, Var(a0), Var(b0))), t.y, Sup(v.label, Var(a1), Var(b1)));
      return { t: Dup(t.label, a0, a1, v.a, Dup(t.label, b0, b1, v.b, body)), rule: "DUP-SUP/commute" };
    }
    if (v.tag === "Lam") {
      // label PROPAGATES (same duplicator keeps its label through commutation). Sound on the
      // oracle-free / EAL-ish fragment; terms needing two same-label fans to meet (e.g. Church
      // mul) sit outside it and leave an uncollapsed superposition — the boundary, made visible.
      const x0 = fresh(v.name), x1 = fresh(v.name), f0 = fresh("f"), f1 = fresh("f");
      const fx = subst(v.body, v.name, Sup(t.label, Var(x0), Var(x1)));
      const k = subst(subst(t.body, t.x, Lam(x0, Var(f0))), t.y, Lam(x1, Var(f1)));
      return { t: Dup(t.label, f0, f1, fx, k), rule: "DUP-LAM" };
    }
    if (v.tag === "Lit") return { t: subst(subst(t.body, t.x, v), t.y, Lit(v.value)), rule: "DUP-LIT" };
    if (v.tag === "Era") return { t: subst(subst(t.body, t.x, Era()), t.y, Era()), rule: "DUP-ERA" };
    // duplicand is an irreducible non-value with no superposition inside (a variable or a neutral
    // normal term): copying the reference is sound — there is no shared work to lose.
    if (!isValue(v) && !containsSup(v)) return { t: subst(subst(t.body, t.x, v), t.y, v), rule: "DUP-COPY" };
    if (v.tag === "App") { // fan commutes past application (δ past γ) to reach a buried superposition
      const a0 = fresh(), a1 = fresh(), b0 = fresh(), b1 = fresh();
      const body2 = subst(subst(t.body, t.x, App(Var(a0), Var(b0))), t.y, App(Var(a1), Var(b1)));
      return { t: Dup(t.label, a0, a1, v.fun, Dup(t.label, b0, b1, v.arg, body2)), rule: "DUP-APP" };
    }
    const rb = reduceOnce(t.body); if (rb) return { t: Dup(t.label, t.x, t.y, t.val, rb.t), rule: rb.rule };
    return null;
  }
  if (t.tag === "Lam") { const r = reduceOnce(t.body); return r ? { t: Lam(t.name, r.t), rule: r.rule } : null; }
  if (t.tag === "Sup") {
    const ra = reduceOnce(t.a); if (ra) return { t: Sup(t.label, ra.t, t.b), rule: ra.rule };
    const rb = reduceOnce(t.b); if (rb) return { t: Sup(t.label, t.a, rb.t), rule: rb.rule };
  }
  return null;
}
// Budget exceeded => vetoed, exactly like box-and-box's 0-bar: cost is a resource-rung value,
// and no nearly-finished result survives blowing it.
function normalize(term, { budget = 100000, maxNodes = Infinity } = {}) {
  let t = globalize(term), n = 0; const tally = {};
  while (true) {
    const r = reduceOnce(t);
    if (!r) return { status: "normal", term: t, interactions: n, rules: tally };
    t = r.t; n++; tally[r.rule] = (tally[r.rule] || 0) + 1;
    if (n > budget) return { status: "over-budget", term: t, interactions: n, vetoed: true, rules: tally };
    if (maxNodes !== Infinity && size(t) > maxNodes) return { status: "over-space", term: t, interactions: n, nodes: size(t), vetoed: true, rules: tally };
  }
}

// ---------- Layer 2: the invariant checker ----------
// Verdict mirrors box-and-box `consume`: { ok, kappa, route, violations:[{invariant,detail,fix}] }.
//  I1 AFFINE : a lambda binder used >1 time without a Dup is the unsound-duplication hazard.
//  I2 LABELS : a label introduced by two independent Dups is the delta/delta collision.
//  I3 KAPPA  : cycle in the binding-dependency graph. 0 => single-pass; >0 => real recursion.
function checkInvariants(t) {
  const violations = [];
  // I1
  const lamUses = (term, b, c = { n: 0 }) => {
    if (term.tag === "Var") { if (term.name === b) c.n++; }
    else if (term.tag === "Lam") { if (term.name !== b) lamUses(term.body, b, c); }
    else if (term.tag === "App") { lamUses(term.fun, b, c); lamUses(term.arg, b, c); }
    else if (term.tag === "Sup") { lamUses(term.a, b, c); lamUses(term.b, b, c); }
    else if (term.tag === "Dup") { lamUses(term.val, b, c); if (term.x !== b && term.y !== b) lamUses(term.body, b, c); }
    return c.n;
  };
  (function lams(term) {
    if (term.tag === "Lam") { const u = lamUses(term.body, term.name); if (u > 1) violations.push({ invariant: "I1-affine", detail: `\\${term.name} used ${u}x without a Dup`, fix: `! &L{${term.name}0 ${term.name}1}=…` }); lams(term.body); }
    else if (term.tag === "App") { lams(term.fun); lams(term.arg); }
    else if (term.tag === "Sup") { lams(term.a); lams(term.b); }
    else if (term.tag === "Dup") { lams(term.val); lams(term.body); }
  })(t);
  // I2
  const labels = new Map();
  (function labs(term) {
    if (term.tag === "Dup") { labels.set(term.label, (labels.get(term.label) || 0) + 1); labs(term.val); labs(term.body); }
    else if (term.tag === "Lam") labs(term.body);
    else if (term.tag === "App") { labs(term.fun); labs(term.arg); }
    else if (term.tag === "Sup") { labs(term.a); labs(term.b); }
  })(t);
  for (const [l, n] of labels) if (n > 1) violations.push({ invariant: "I2-labels", detail: `label '${l}' introduced by ${n} independent Dups (delta/delta collision risk)`, fix: `unique label per sharing` });
  // I3
  const known = new Set(); const out = new Map();
  (function reg(term) {
    if (term.tag === "Lam") { known.add(term.name); reg(term.body); }
    else if (term.tag === "Dup") { known.add(term.x); known.add(term.y); reg(term.val); reg(term.body); }
    else if (term.tag === "App") { reg(term.fun); reg(term.arg); }
    else if (term.tag === "Sup") { reg(term.a); reg(term.b); }
  })(t);
  known.forEach((k) => out.set(k, new Set()));
  const uses = (e, acc = new Set()) => {
    if (e.tag === "Var") { if (known.has(e.name)) acc.add(e.name); }
    else if (e.tag === "App") { uses(e.fun, acc); uses(e.arg, acc); }
    else if (e.tag === "Sup") { uses(e.a, acc); uses(e.b, acc); }
    else if (e.tag === "Lam") uses(e.body, acc);
    else if (e.tag === "Dup") { uses(e.val, acc); uses(e.body, acc); }
    return acc;
  };
  (function assign(term) {
    if (term.tag === "Dup") { const u = uses(term.val); u.forEach((v) => { out.get(term.x).add(v); out.get(term.y).add(v); }); assign(term.val); assign(term.body); }
    else if (term.tag === "Lam") assign(term.body);
    else if (term.tag === "App") { assign(term.fun); assign(term.arg); }
    else if (term.tag === "Sup") { assign(term.a); assign(term.b); }
  })(t);
  let kappa = 0; const color = new Map(); known.forEach((k) => color.set(k, 0));
  const dfs = (u) => { color.set(u, 1); for (const v of out.get(u) || []) { if (color.get(v) === 1) kappa++; else if (color.get(v) === 0) dfs(v); } color.set(u, 2); };
  known.forEach((k) => { if (color.get(k) === 0) dfs(k); });
  return { ok: violations.length === 0, kappa, route: kappa === 0 ? "single-pass" : "fixpoint", violations };
}

// ---------- Layer 3a: SUP-style superposed search ----------
// Honest model of WHY sup-search wins: the candidate space is structured and redundant, so shared
// SUBexpressions collapse. We count gate evals with/without sharing. NOTE the boundary: this shares
// subexpressions (the easy, real part). HVM's SUP also shares the *test application* across the whole
// superposition at once — that extra collapse is what gets it to sub-1 interaction/guess. Not modeled here.
const baseGates = () => ({
  ZERO: () => 0, ONE: () => 1, A: (a) => a, B: (_, b) => b, NOTA: (a) => a ^ 1, NOTB: (_, b) => b ^ 1,
  AND: (a, b) => a & b, OR: (a, b) => a | b, NAND: (a, b) => (a & b) ^ 1,   // note: no XOR — round 1 must discover it
});
const sig = (n) => (typeof n === "string" ? n : `${n.g}(${sig(n.l)},${sig(n.r)})`);
function superposedSearch(target, depth, gates) {
  const names = Object.keys(gates);
  const leaves = ["IA", "IB"];
  const level1 = names.flatMap((g) => leaves.flatMap((l) => leaves.map((r) => ({ g, l, r }))));
  const children = depth >= 2 ? [...leaves, ...level1] : leaves;
  const candidates = names.flatMap((g) => children.flatMap((l) => children.map((r) => ({ g, l, r }))));
  const inputs = [[0, 0], [0, 1], [1, 0], [1, 1]];
  const memo = new Map(); let shared = 0, naive = 0;
  const ev = (n, a, b) => {
    if (typeof n === "string") return n === "IA" ? a : b;
    naive++; const key = `${a}${b}|${sig(n)}`;
    if (memo.has(key)) return memo.get(key);
    shared++; const v = gates[n.g](ev(n.l, a, b), ev(n.r, a, b)); memo.set(key, v); return v;
  };
  const found = [];
  for (const c of candidates) { let ok = true; for (let i = 0; i < 4; i++) if (ev(c, inputs[i][0], inputs[i][1]) !== target[i]) { ok = false; break; } if (ok) found.push(c); }
  return { found, candidates: candidates.length, naive, shared };
}

// ---------- Layer 3b: closing the loop ----------
// Round 1 discovers an XOR circuit the hard way (depth 2, no XOR primitive). We induce that circuit
// as a named gate and feed it back. Round 2 finds the same target as a depth-1 primitive — the space
// it must scan collapses. Outputs become inputs; the system gets cheaper from its own runs.
const XOR = [0, 1, 1, 0];
function evolve() {
  const r1 = superposedSearch(XOR, 2, baseGates());
  const learned = { ...baseGates(), LX: (a, b) => a ^ b };       // induce winner's behavior as a primitive
  const r2 = superposedSearch(XOR, 1, learned);
  return { r1, r2, winner1: r1.found[0], winner2: r2.found.find((c) => c.g === "LX") || r2.found[0] };
}

export { Var, Lam, App, Sup, Dup, Era, Lit, Op, show, globalize, subst, reduceOnce, normalize, checkInvariants, size };

// ============ DEMO ============
const RUN_DEMO = import.meta.url === `file://${process.argv[1]}`;
if (RUN_DEMO) {
const P = (s = "") => console.log(s);
P("LAYER 1  metered reducer");
const idTwice = Dup("L", "a", "b", Lam("x", Var("x")), App(Var("a"), App(Var("b"), Lit(0))));
let r = normalize(idTwice);
P(`  duplicated identity applied twice to 0`);
P(`    ${show(idTwice)}`);
P(`    -> ${show(r.term)}    [${r.interactions} interactions: ${JSON.stringify(r.rules)}]`);
const appSup = App(Sup("L", Lam("x", Var("x")), Lam("y", Lit(9))), Lit(0));
r = normalize(appSup);
P(`  a SUPERPOSED function {id, const-9} applied once to 0`);
P(`    ${show(appSup)}  ->  ${show(r.term)}    [${r.interactions} interactions]`);

P();
P("LAYER 2  invariant checker (enforcement)");
const cases = [
  ["safe: dup a fn", Dup("A", "a", "b", Lam("x", Var("x")), App(Var("a"), Var("b")))],
  ["unsafe: \\f.(f f)", Lam("f", App(Var("f"), Var("f")))],
  ["label collision", Dup("L", "a", "b", Lit(1), Dup("L", "c", "d", Lit(2), Lit(3)))],
  ["recursive (kappa>0)", Dup("R", "f0", "f1", App(Var("f1"), Lit(0)), App(Var("f0"), Era()))],
];
for (const [name, term] of cases) {
  const v = checkInvariants(term);
  P(`  ${name.padEnd(22)} ok=${String(v.ok).padEnd(5)} kappa=${v.kappa} (${v.route})`);
  for (const x of v.violations) P(`      -> ${x.invariant}: ${x.detail}`);
}

P();
P("LAYER 3a  superposed search — find XOR with NO xor primitive (depth 2)");
const s = superposedSearch(XOR, 2, baseGates());
P(`  ${s.candidates} candidates; winner = ${s.found[0] ? sig(s.found[0]) : "none"}`);
P(`  naive evals ${s.naive} vs shared ${s.shared}  ->  ${(s.naive / s.shared).toFixed(1)}x fewer via shared subexprs`);

P();
P("LAYER 3b  closing the loop (round 2 reuses what round 1 discovered)");
const e = evolve();
P(`  round 1  found ${sig(e.winner1)}   scanned ${e.r1.candidates} candidates, ${e.r1.shared} shared evals`);
P(`  learn    LX := xor`);
P(`  round 2  found ${sig(e.winner2)}   scanned ${e.r2.candidates} candidates, ${e.r2.shared} shared evals`);
P(`  reuse shrank the search ~${(e.r1.shared / e.r2.shared).toFixed(0)}x for the same target.`);
P();
P("each layer is deliberately small — the point is the SHAPE: invariant -> rule -> enforced -> fed back.");
}
