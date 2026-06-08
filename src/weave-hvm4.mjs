// weave-hvm4.mjs — lower Weave IR to HVM-core source, and validate the lowering is faithful.
//
// Per weave-and-the-ampersand-stack.md §4: the honest backend move is to LOWER Weave's IR to HVM4
// rather than build a fast parallel runtime. This file is the lowering pass plus its LOCAL validation.
// It does NOT require HVM4 to be installed: it proves the lowering is semantics-preserving by a
// ROUND-TRIP through the toy reducer —
//
//        term  --lower-->  HVM source  --parse-->  term'        and        NF(term) == NF(term').
//
// If lower/parse are mutual inverses up to alpha-equivalence and the reducer agrees on both, the
// lowering preserves meaning under the one engine we can already trust. Running the SAME emitted
// source through the real HVM4 (and checking its normal form matches) is the remaining step, gated on
// cloning + building the HVM4 pre-release (see weave-hvm4-backend notes / the repo TODO).
//
// SYNTAX TARGET: "HVM-core", the common subset of HVM2/3/4 surface syntax. The exact lexemes HVM4
// settles on are centralized in EMIT/lex below so the final reconciliation is a one-place edit, not a
// rewrite — which is the whole point of keeping the certificate substrate-independent.
//
//   Var   x                     Lam   λx body              App   (f a)
//   Sup   &L{a b}               Dup   ! &L{x y} = v; k     Era   *
//   Lit   42                    Op    (+ a b) (* a b) (- a b) (<= a b) (== a b)

import { Var, Lam, App, Sup, Dup, Era, Lit, Op, normalize } from "./weave.mjs";

// operator <-> HVM symbol
const OP2SYM = { add: "+", mul: "*", sub: "-", le: "<=", eq: "==" };
const SYM2OP = Object.fromEntries(Object.entries(OP2SYM).map(([k, v]) => [v, k]));

// ---------------------------------------------------------------------------
// EMIT: Weave IR -> HVM-core source string
// ---------------------------------------------------------------------------
export function lowerToHVM(t) {
  switch (t.tag) {
    case "Var": return t.name;
    case "Lam": return `λ${t.name} ${lowerToHVM(t.body)}`;
    case "App": return `(${lowerToHVM(t.fun)} ${lowerToHVM(t.arg)})`;
    case "Sup": return `&${t.label}{${lowerToHVM(t.a)} ${lowerToHVM(t.b)}}`;
    case "Dup": return `! &${t.label}{${t.x} ${t.y}} = ${lowerToHVM(t.val)}; ${lowerToHVM(t.body)}`;
    case "Era": return `*`;
    case "Lit": return `${t.value}`;
    case "Op": return `(${OP2SYM[t.op]} ${lowerToHVM(t.a)} ${lowerToHVM(t.b)})`;
    default: throw new Error(`cannot lower tag ${t.tag}`);
  }
}

// ---------------------------------------------------------------------------
// LEX + PARSE: HVM-core source -> Weave IR (the inverse of lowerToHVM)
// ---------------------------------------------------------------------------
function lex(src) {
  const toks = []; let i = 0;
  const isIdent = (c) => /[A-Za-z0-9_~]/.test(c);
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\n" || c === "\t") { i++; continue; }
    if ("()&{}!=;*".includes(c)) { toks.push(c); i++; continue; }
    if (c === "λ") { toks.push("λ"); i++; continue; }
    // multi-char operator symbols
    if (src.startsWith("<=", i)) { toks.push("<="); i += 2; continue; }
    if (src.startsWith("==", i)) { toks.push("=="); i += 2; continue; }
    if ("+-*".includes(c)) { toks.push(c); i++; continue; }
    if (isIdent(c)) { let j = i; while (j < src.length && isIdent(src[j])) j++; toks.push(src.slice(i, j)); i = j; continue; }
    throw new Error(`lex: unexpected '${c}' at ${i}`);
  }
  return toks;
}

export function parseHVM(src) {
  const toks = lex(src);
  let p = 0;
  const peek = () => toks[p];
  const next = () => toks[p++];
  const expect = (t) => { const g = next(); if (g !== t) throw new Error(`parse: expected '${t}' got '${g}'`); };
  const isNum = (s) => /^[0-9]+$/.test(s);

  function term() {
    const t = peek();
    if (t === "λ") { next(); const name = next(); return Lam(name, term()); }
    if (t === "!") { // Dup:  ! &L{x y} = v; body
      next(); expect("&"); const label = next(); expect("{"); const x = next(); const y = next(); expect("}");
      expect("="); const val = term(); expect(";"); const body = term();
      return Dup(label, x, y, val, body);
    }
    if (t === "&") { next(); const label = next(); expect("{"); const a = term(); const b = term(); expect("}"); return Sup(label, a, b); }
    if (t === "*") { next(); return Era(); }
    if (t === "(") {
      next();
      const head = peek();
      if (head in SYM2OP) { next(); const a = term(); const b = term(); expect(")"); return Op(SYM2OP[head], a, b); }
      const f = term(); const a = term(); expect(")"); return App(f, a);
    }
    if (isNum(t)) { next(); return Lit(parseInt(t, 10)); }
    // identifier => variable
    next(); return Var(t);
  }
  const out = term();
  if (p !== toks.length) throw new Error(`parse: trailing tokens from ${p}`);
  return out;
}

// ---------------------------------------------------------------------------
// alpha-canonical normal form (for comparison; covers every node type)
// ---------------------------------------------------------------------------
const canon = (t, env = []) => {
  switch (t.tag) {
    case "Var": { const i = env.indexOf(t.name); return i >= 0 ? `#${i}` : `F:${t.name}`; }
    case "Lam": return `(L ${canon(t.body, [t.name, ...env])})`;
    case "App": return `(@ ${canon(t.fun, env)} ${canon(t.arg, env)})`;
    case "Sup": return `&{${canon(t.a, env)} ${canon(t.b, env)}}`;
    case "Dup": return `(D ${canon(t.val, env)} . ${canon(t.body, [t.x, t.y, ...env])})`;
    case "Era": return "*";
    case "Lit": return `n:${t.value}`;
    case "Op": return `o:${t.op}(${canon(t.a, env)} ${canon(t.b, env)})`;
    default: return "?";
  }
};
const nf = (t) => { const w = normalize(t, { budget: 2000000, maxNodes: 20000 }); return w.status === "normal" ? canon(w.term) : `<${w.status}>`; };

// ---------------------------------------------------------------------------
// Demo + round-trip differential harness
// ---------------------------------------------------------------------------
const RUN = import.meta.url === `file://${process.argv[1]}`;
if (RUN) {
  const v = Var, lam = Lam, ap = (...xs) => xs.reduce((a, b) => App(a, b));
  const cn = (k) => lam("f", lam("x", Array.from({ length: k }).reduce((a) => App(v("f"), a), v("x"))));
  const plus = lam("m", lam("n", lam("f", lam("x", ap(v("m"), v("f"), ap(v("n"), v("f"), v("x")))))));
  const mul = lam("m", lam("n", lam("f", App(v("m"), App(v("n"), v("f"))))));

  const battery = [
    ["id", lam("x", v("x"))],
    ["K", lam("x", lam("y", v("x")))],
    ["plus c2 c3", ap(plus, cn(2), cn(3))],
    ["mul c2 c3", ap(mul, cn(2), cn(3))],
    ["arith (2+3)*4", Op("mul", Op("add", Lit(2), Lit(3)), Lit(4))],
    ["explicit Dup", Dup("L", "a", "b", Lam("x", v("x")), App(v("a"), App(v("b"), Lit(0))))],
    ["explicit Sup app", App(Sup("L", Lam("x", v("x")), Lam("y", Lit(9))), Lit(0))],
    ["Era", App(Lam("z", Lit(7)), Era())],
  ];

  console.log("ROUND-TRIP LOWERING  (term -> HVM source -> term'; NF must match)\n");
  let pass = 0;
  for (const [name, term] of battery) {
    const src = lowerToHVM(term);
    let back, ok, err = "";
    try { back = parseHVM(src); ok = nf(term) === nf(back); } catch (e) { ok = false; err = e.message; }
    if (ok) pass++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${name.padEnd(16)} ⤳  ${src}${err ? "   [" + err + "]" : ""}`);
  }
  console.log(`\n${pass}/${battery.length} round-trips preserved the normal form under the toy reducer.`);
  console.log("\nThe emitted strings above are HVM-core source. Running them through the real HVM4 and");
  console.log("checking the normal form matches is the gated next step (clone + cargo build HVM4 preview).");
}

export { canon, nf };
