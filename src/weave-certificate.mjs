// weave-certificate.mjs — the resource-rung atom: a canonical, IR-hash-bound, FAIL-CLOSED
// WeaveCostCertificate emitted from Weave IR. This is `Brick.cost` (COMPOSE_RUNTIME.md §2.1):
// the certificate is the atom, the compose runtime is the molecule. It must exist before any
// composition can rest on it.
//
// What it is NOT: it does not RUN the term. `classify.measure` and `weave-eal-degree` run terms;
// they are dynamic. This module is purely static — `certified`/`total`/`oracleFree` all derive from
// the EAL box-decoration soundness flag (`inferEAL().eal`), and `costClass` from the certified
// tower-height (`inferEAL().depth`). `polynomialDegree` is therefore OMITTED here: it is measured,
// not statically proven, and will only be filled once static LAL inference lands.
//
// Fail-closed is the whole point of the floor. Uncertified / non-total / non-oracle-free / analyzer
// error ⇒ resourceDecision "annihilate" (0̲) in production. Uncertified is VETOED, not low-scored —
// utility can never resurrect it. `mode:"development"` may downgrade an unknown to a budget_check so
// authors can iterate, but production unknown is always 0̲.

import { Var, Lam, App, Sup, Dup, Era, Lit, Op } from "./weave.mjs";
import { classify } from "./weave-classify.mjs";
import { inferEAL } from "./weave-eal.mjs";

export const ANALYZER_VERSION = "0.1.0";

// ---------------------------------------------------------------------------
// Deterministic IR hash. FNV-1a (32-bit) over an alpha-invariant De Bruijn
// serialization, mirroring box-and-box/evolution.mjs's hash so certificates
// share the cross-stack digest discipline. Alpha-invariant: a binder rename does
// NOT invalidate the cert, but ANY structural change (operator, literal, app shape,
// duplication) flips the hash — that is the binding the certificate promises.
// ---------------------------------------------------------------------------
function canonIR(t, depth = 0, env = Object.create(null)) {
  switch (t.tag) {
    case "Var": {
      const d = env[t.name];
      return d === undefined ? `f:${t.name}` : `#${depth - 1 - d}`;
    }
    case "Lam":
      return `L.${canonIR(t.body, depth + 1, { ...env, [t.name]: depth })}`;
    case "App":
      return `(${canonIR(t.fun, depth, env)} ${canonIR(t.arg, depth, env)})`;
    case "Op":
      return `${t.op}[${canonIR(t.a, depth, env)},${canonIR(t.b, depth, env)}]`;
    case "Lit":
      return `n:${t.value}`;
    case "Sup":
      return `S${t.label}{${canonIR(t.a, depth, env)} ${canonIR(t.b, depth, env)}}`;
    case "Dup": {
      const e2 = { ...env, [t.x]: depth, [t.y]: depth + 1 };
      return `D${t.label}{${canonIR(t.val, depth, env)};${canonIR(t.body, depth + 2, e2)}}`;
    }
    case "Era":
      return "E";
    default:
      return `?${JSON.stringify(t)}`;
  }
}

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export const irHash = (raw) => fnv1a(canonIR(raw));

// ---------------------------------------------------------------------------
// costClass from the CERTIFIED tower height (only meaningful when eal:true).
//   depth ≤ 1 → "poly"          the cheap/safe rung
//   depth = 2 → "exponential"
//   depth ≥ 3 → "tower"         non-elementary
// ---------------------------------------------------------------------------
const costClassOf = (depth) => (depth <= 1 ? "poly" : depth === 2 ? "exponential" : "tower");

// Resource-rung mapping (COMPOSE_RUNTIME.md §2.1 table), applied ONLY to certified terms.
// Uncertified is handled by the fail-closed branch in certify() and never reaches here.
const decideCertified = (depth) =>
  depth <= 1 ? "allow" : depth === 2 ? "budget_check" : "escalate";

// ---------------------------------------------------------------------------
// certify(raw, opts) → WeaveCostCertificate
//   opts.mode  : "production" (default) | "development"
//   opts.source: optional provenance string for evidence
//   opts.now   : optional ISO timestamp injector (determinism in tests)
// ---------------------------------------------------------------------------
export function certify(raw, opts = {}) {
  const mode = opts.mode === "development" ? "development" : "production";
  const now = opts.now ?? new Date().toISOString();

  const eal = inferEAL(raw); // { eal, depth, rung, certificate, note }
  const cls = classify(raw); // { rank, rung, terr } — legacy STLC proxy
  const hash = irHash(raw);

  // certified / total / oracle-free ALL derive from the single EAL soundness flag:
  // eal:true ⟹ the box decoration is a valid EAL derivation ⟹ total + reduces oracle-free.
  const certified = eal.eal === true;
  const total = certified;
  const oracleFree = certified;

  const costClass = certified ? costClassOf(eal.depth) : "unknown";

  // Fail-closed resource decision.
  let resourceDecision, reason;
  if (certified) {
    resourceDecision = decideCertified(eal.depth);
    reason =
      `certified EAL bound: ${eal.rung} (depth ${eal.depth}, costClass ${costClass}); ` +
      `legacy rank ${cls.rank} (${cls.rung}).`;
  } else if (mode === "development") {
    // Dev override: let authors iterate on an uncertified term without 0̲, but flag it loudly.
    resourceDecision = "budget_check";
    reason =
      `UNCERTIFIED (${eal.note}) — dev-mode override to budget_check; ` +
      `would be annihilated (0̲) in production. legacy rank ${cls.rank} (${cls.rung}).`;
  } else {
    resourceDecision = "annihilate";
    reason =
      `UNCERTIFIED (${eal.note}) — fail-closed: vetoed to 0̲, utility cannot resurrect it. ` +
      `legacy rank ${cls.rank} (${cls.rung})${cls.terr ? " [not simply-typeable]" : ""}.`;
  }

  const verdict = {
    certified,
    total,
    oracleFree,
    costClass,
    rank: cls.rank, // legacy STLC type-order proxy ONLY — not the certificate's class
  };
  if (certified) verdict.ealDepth = eal.depth;
  // polynomialDegree intentionally omitted (measured, not static — see header).

  return {
    subject: { kind: "weave-ir", hash },
    analyzer: { name: "weave-eal", version: ANALYZER_VERSION },
    verdict,
    policy: { resourceDecision, reason },
    evidence: { source: opts.source, generatedAt: now },
    mode,
  };
}

// ---------------------------------------------------------------------------
// Demo
// ---------------------------------------------------------------------------
const RUN = import.meta.url === `file://${process.argv[1]}`;
if (RUN) {
  const v = Var, lam = Lam, ap = (...xs) => xs.reduce((a, b) => App(a, b));
  const cn = (k) => lam("f", lam("x", Array.from({ length: k }).reduce((a) => App(v("f"), a), v("x"))));
  const plus = lam("m", lam("n", lam("f", lam("x", ap(v("m"), v("f"), ap(v("n"), v("f"), v("x")))))));
  const mul = lam("m", lam("n", lam("f", App(v("m"), App(v("n"), v("f"))))));
  const tower = (k) => ap(...Array.from({ length: k }, () => cn(2)));
  const rows = [
    ["plus c2 c2", ap(plus, cn(2), cn(2))],
    ["mul c6 c6", ap(mul, cn(6), cn(6))],
    ["c3 c2 (exp)", ap(cn(3), cn(2))],
    ["tower(4)", tower(4)],
  ];
  console.log("TERM           hash      certClass    decision      certified");
  console.log("-".repeat(72));
  for (const [name, term] of rows) {
    const c = certify(term, { now: "1970-01-01T00:00:00.000Z" });
    console.log(
      `  ${name.padEnd(12)} ${c.subject.hash}  ${c.verdict.costClass.padEnd(11)}  ` +
      `${c.policy.resourceDecision.padEnd(12)}  ${c.verdict.certified}`
    );
  }
  console.log("-".repeat(72));
  console.log("The certificate is BOUND to subject.hash; any IR change flips it and invalidates the cert.");
  console.log("Uncertified ⇒ resourceDecision 'annihilate' (0̲) in production — fail-closed.");
}
