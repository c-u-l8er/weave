// weave-certificate-test.mjs — the WeaveCostCertificate contract (COMPOSE_RUNTIME.md §2.1).
//
// Four properties, each a distinct promise the certificate makes:
//   1. RESOURCE-RUNG MAPPING — cheap/poly → allow, exponential → budget_check, tower → escalate.
//   2. FAIL-CLOSED — uncertified (production) → annihilate (0̲); utility cannot resurrect it.
//      dev-mode may downgrade the same term to budget_check, but production is always 0̲.
//   3. IR-HASH BINDING — the cert is bound to subject.hash: any structural IR change flips the
//      hash (invalidating the cert), while a pure alpha-rename does NOT (the cert is semantic).
//   4. DETERMINISM — same IR ⇒ byte-identical certificate (with a pinned timestamp).

import { certify, irHash, ANALYZER_VERSION } from "../src/weave-certificate.mjs";
import { Var, Lam, App } from "../src/weave.mjs";

const v = Var, lam = Lam, ap = (...xs) => xs.reduce((a, b) => App(a, b));
const cn = (k) => lam("f", lam("x", Array.from({ length: k }).reduce((a) => App(v("f"), a), v("x"))));
const plus = lam("m", lam("n", lam("f", lam("x", ap(v("m"), v("f"), ap(v("n"), v("f"), v("x")))))));
const mul = lam("m", lam("n", lam("f", App(v("m"), App(v("n"), v("f"))))));
const tower = (k) => ap(...Array.from({ length: k }, () => cn(2)));
const selfApp = lam("x", App(v("x"), v("x"))); // not simply-typeable ⇒ uncertified

const PIN = { now: "1970-01-01T00:00:00.000Z" };
let fail = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? "ok  " : "FAIL"} ${msg}`); if (!cond) fail++; };

// ---------------------------------------------------------------------------
console.log("1. RESOURCE-RUNG MAPPING");
{
  const cheap = certify(ap(plus, cn(2), cn(2)), PIN);
  ok(cheap.verdict.certified && cheap.verdict.costClass === "poly" && cheap.policy.resourceDecision === "allow",
    `poly term → allow (got ${cheap.verdict.costClass}/${cheap.policy.resourceDecision})`);
  ok(cheap.verdict.ealDepth <= 1, `poly term ealDepth ≤ 1 (got ${cheap.verdict.ealDepth})`);

  const expo = certify(ap(cn(3), cn(2)), PIN);
  ok(expo.verdict.certified && expo.verdict.costClass === "exponential" && expo.policy.resourceDecision === "budget_check",
    `exponential term → budget_check (got ${expo.verdict.costClass}/${expo.policy.resourceDecision})`);

  const expensive = certify(tower(4), PIN);
  ok(expensive.verdict.certified && expensive.verdict.costClass === "tower" && expensive.policy.resourceDecision === "escalate",
    `tower term → escalate (got ${expensive.verdict.costClass}/${expensive.policy.resourceDecision})`);
}

// ---------------------------------------------------------------------------
console.log("2. FAIL-CLOSED (uncertified is VETOED, not low-scored)");
{
  const prod = certify(selfApp, PIN);
  ok(!prod.verdict.certified, "self-application is uncertified");
  ok(prod.verdict.costClass === "unknown", `uncertified costClass is 'unknown' (got ${prod.verdict.costClass})`);
  ok(prod.verdict.ealDepth === undefined, "uncertified cert omits ealDepth");
  ok(prod.policy.resourceDecision === "annihilate", `production uncertified → annihilate (got ${prod.policy.resourceDecision})`);
  ok(prod.verdict.total === false && prod.verdict.oracleFree === false, "uncertified ⇒ total=false, oracleFree=false");

  const dev = certify(selfApp, { ...PIN, mode: "development" });
  ok(dev.policy.resourceDecision === "budget_check", `dev-mode uncertified → budget_check override (got ${dev.policy.resourceDecision})`);
  ok(dev.verdict.certified === false, "dev override does NOT fake certification");
}

// ---------------------------------------------------------------------------
console.log("3. IR-HASH BINDING");
{
  const a = certify(ap(mul, cn(4), cn(4)), PIN);
  const b = certify(ap(mul, cn(4), cn(5)), PIN); // structural change: c4 → c5
  ok(a.subject.hash !== b.subject.hash, `structural IR change flips the hash (${a.subject.hash} vs ${b.subject.hash})`);

  // pure alpha-rename: \f.\x. f (f x)  ≡  \g.\y. g (g y)
  const c2a = lam("f", lam("x", ap(v("f"), ap(v("f"), v("x")))));
  const c2b = lam("g", lam("y", ap(v("g"), ap(v("g"), v("y")))));
  ok(irHash(c2a) === irHash(c2b), `alpha-rename does NOT change the hash (${irHash(c2a)})`);

  // changing the operator structure (app shape) flips it
  ok(irHash(ap(plus, cn(2), cn(2))) !== irHash(ap(mul, cn(2), cn(2))), "different head (plus vs mul) flips the hash");
}

// ---------------------------------------------------------------------------
console.log("4. DETERMINISM & ENVELOPE");
{
  const t = ap(plus, cn(6), cn(6));
  const a = certify(t, PIN), b = certify(t, PIN);
  ok(JSON.stringify(a) === JSON.stringify(b), "same IR + pinned timestamp ⇒ byte-identical certificate");
  ok(a.subject.kind === "weave-ir", "subject.kind is 'weave-ir'");
  ok(a.analyzer.name === "weave-eal" && a.analyzer.version === ANALYZER_VERSION, "analyzer identity carried");
  ok(typeof a.verdict.rank === "number", "legacy STLC rank surfaced (proxy only)");
  ok(a.verdict.polynomialDegree === undefined, "polynomialDegree omitted (measured, not static)");
  ok(typeof a.policy.reason === "string" && a.policy.reason.length > 0, "policy carries a human-readable reason");
}

// ---------------------------------------------------------------------------
console.log(fail === 0
  ? "\nPASS: WeaveCostCertificate honours its §2.1 contract — rung mapping, fail-closed floor,\n      IR-hash binding (semantic, alpha-invariant), and deterministic envelope."
  : `\nFAIL: ${fail} assertion(s) broke the certificate contract.`);
process.exit(fail === 0 ? 0 : 1);
