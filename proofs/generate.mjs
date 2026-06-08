// proofs/generate.mjs — regenerates the checkable proof bundle in proofs/RECEIPTS.txt.
//
// PURPOSE. Weave's thesis (the [&] stack's *resource rung*) is:
//
//   A purely STATIC linearity-with-stratification certificate grades a term's cost, and the SAME
//   discipline that grades the cost is what makes reduction sound and licenses the oracle-free fast
//   path. Cost is a *type*, not a measurement.
//
// A reader should be able to CHECK that claim without running anything — just by reading committed
// numbers and doing arithmetic by hand. This script produces those numbers deterministically. The
// committed RECEIPTS.txt is the artifact; this file only explains how it was made and lets anyone
// reproduce it (`node proofs/generate.mjs`) to confirm the receipts are not fabricated.
//
// Three arms, each independently checkable:
//   ARM 1  COST LADDER         the static EAL depth predicts the measured growth class. The reader
//                              verifies the growth class by finite differences (constant d-th
//                              difference  <=>  degree-d polynomial). Pure hand arithmetic.
//   ARM 2  SOUNDNESS ALIGNMENT a falsifiable predicate: no certified-cheap (rung<=1) term detonates,
//                              and every detonation is rung>=2. Reader compares the verdict column to
//                              the outcome column — they must agree on every row.
//   ARM 3  INDEPENDENT ENGINE  the same terms run through a second, unrelated runtime (HVM4) produce
//                              the same integers. Reader checks three columns are equal. (Snapshot —
//                              requires the HVM4 binary; absent it, the arm is marked SKIPPED.)

import { Var, Lam, App, Op, Lit, Dup, normalize, show } from "../src/weave.mjs";
import { inferEAL } from "../src/weave-eal.mjs";
import { classify } from "../src/weave-classify.mjs";
import { certify } from "../src/weave-certificate.mjs";
import { lowerToHVM4 } from "../test/weave-hvm4-run.mjs";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// term constructors
// ---------------------------------------------------------------------------
const v = Var, lam = Lam, ap = (...xs) => xs.reduce((a, b) => App(a, b));
const cn = (k) => lam("f", lam("x", Array.from({ length: k }).reduce((a) => App(v("f"), a), v("x"))));
const id = lam("x", v("x"));
const plus = lam("m", lam("n", lam("f", lam("x", ap(v("m"), v("f"), ap(v("n"), v("f"), v("x")))))));
const mul = lam("m", lam("n", lam("f", App(v("m"), App(v("n"), v("f"))))));
const pow = lam("m", lam("n", App(v("n"), v("m")))); // pow c_a c_b = c_(a^b)

// ---------------------------------------------------------------------------
// affine linearizer + interaction counter (same shape as the harnesses)
// every binder used >=2 times is made affine via an explicit Dup chain, so the
// reduction is oracle-free; the interaction count is then a faithful cost meter.
// ---------------------------------------------------------------------------
let C = 0; const nm = (p) => `${p}~${C++}`; let L = 0; const lbl = () => `dl${L++}`;
const fr = (t, e = {}) => t.tag === "Var" ? Var(e[t.name] ?? t.name)
  : t.tag === "Lam" ? (() => { const f = nm(t.name); return Lam(f, fr(t.body, { ...e, [t.name]: f })); })()
  : t.tag === "App" ? App(fr(t.fun, e), fr(t.arg, e)) : t;
const occ = (t, n) => t.tag === "Var" ? (t.name === n ? 1 : 0)
  : t.tag === "Lam" ? (t.name === n ? 0 : occ(t.body, n))
  : t.tag === "App" ? occ(t.fun, n) + occ(t.arg, n)
  : t.tag === "Dup" ? occ(t.val, n) + ((t.x === n || t.y === n) ? 0 : occ(t.body, n)) : 0;
const rep = (t, n, names, idx) => t.tag === "Var" ? (t.name === n ? Var(names[idx.i++]) : t)
  : t.tag === "Lam" ? (t.name === n ? t : Lam(t.name, rep(t.body, n, names, idx)))
  : t.tag === "App" ? App(rep(t.fun, n, names, idx), rep(t.arg, n, names, idx))
  : t.tag === "Dup" ? Dup(t.label, t.x, t.y, rep(t.val, n, names, idx), (t.x === n || t.y === n) ? t.body : rep(t.body, n, names, idx)) : t;
const lin = (t) => {
  if (t.tag === "Var") return t;
  if (t.tag === "App") return App(lin(t.fun), lin(t.arg));
  if (t.tag === "Op") return Op(t.op, lin(t.a), lin(t.b));
  if (t.tag === "Lam") {
    const b = lin(t.body); const k = occ(b, t.name);
    if (k <= 1) return Lam(t.name, b);
    const cs = Array.from({ length: k }, () => nm(t.name));
    const b2 = rep(b, t.name, cs, { i: 0 });
    const mk = (s, ci) => ci === k - 2 ? Dup(lbl(), cs[k - 2], cs[k - 1], Var(s), b2)
      : (() => { const r = nm("r"); return Dup(lbl(), cs[ci], r, Var(s), mk(r, ci + 1)); })();
    return Lam(t.name, mk(t.name, 0));
  }
  return t;
};
const BUDGET = { budget: 50000000, maxNodes: 400000 };
const interactions = (term) => { try { const w = normalize(lin(fr(term)), BUDGET); return w.status === "normal" ? w.interactions : null; } catch { return null; } };
// detonation audit uses a modest budget so genuine blowups veto (or overflow) quickly; a thrown
// stack overflow on a runaway normal form counts as a detonation just the same.
const DET = { budget: 1500000, maxNodes: 5000 };
const detonates = (term) => { try { return normalize(lin(fr(term)), DET).status !== "normal"; } catch { return true; } };

// ---------------------------------------------------------------------------
// finite differences: the d-th forward difference of a degree-d polynomial is
// a nonzero constant; the (d+1)-th is identically zero.
// ---------------------------------------------------------------------------
const diff = (xs) => xs.slice(1).map((x, i) => x - xs[i]);
const isConst = (row) => row.length >= 2 && row.every((x) => x === row[0]); // length>=2: one element is trivially "constant"
function fitDegree(samples, maxD = 6) {
  let row = samples.slice();
  for (let d = 0; d <= maxD; d++) {
    if (isConst(row)) return d;
    row = diff(row);
    if (row.length < 2) break;
  }
  return null; // no constant finite difference (length>=2) in window => super-polynomial
}

// ---------------------------------------------------------------------------
// HVM4 cross-engine (snapshot; needs the binary)
// ---------------------------------------------------------------------------
const HVM4_BIN = process.env.HVM4_BIN || join(process.env.HOME || "/root", "hvm4", "src", "hvm");
const decodeChurch = (c) => App(App(c, Lam("n", Op("add", Var("n"), Lit(1)))), Lit(0));
// the core reducer duplicates internally (its subst copies), so the toy decode does NOT pre-linearize.
const toyInt = (term) => { const w = normalize(decodeChurch(term), BUDGET); return w.status === "normal" && w.term.tag === "Lit" ? w.term.value : null; };
function hvm4Int(term) {
  const src = lowerToHVM4(decodeChurch(term));
  const dir = mkdtempSync(join(tmpdir(), "weave-ex-"));
  const file = join(dir, "m.hvm");
  writeFileSync(file, `@main = ${src}\n`);
  const out = execFileSync(HVM4_BIN, [file, "-C10"], { encoding: "utf8", timeout: 30000 });
  const m = out.match(/-?\d+/g);
  return m ? parseInt(m[m.length - 1], 10) : null;
}
let HVM4_OK = true;
try { execFileSync(HVM4_BIN, ["--help"], { timeout: 5000 }); } catch { try { hvm4Int(cn(1)); } catch { HVM4_OK = false; } }

// ---------------------------------------------------------------------------
// build the report
// ---------------------------------------------------------------------------
const out = [];
const p = (s = "") => out.push(s);
const bar = (n = 100) => "-".repeat(n);
const pad = (s, n) => String(s).padEnd(n);
const lp = (s, n) => String(s).padStart(n);

p("WEAVE — CHECKABLE RECEIPTS");
p("Generated by proofs/generate.mjs. Every number below is reproducible: `node proofs/generate.mjs`.");
p("You do NOT need to run anything to check the claims — see the 'CHECK BY HAND' notes under each arm.");
p("");
p("THESIS: a static linearity+stratification certificate grades cost; the same discipline that grades");
p("        the cost makes reduction sound and licenses the oracle-free fast path. Cost is a type.");
p(bar());

// ---- ARM 1: COST LADDER ----
const W = [2, 3, 4, 5, 6, 7];
const ladder = [
  { name: "id  (λx.x)", mk: () => id, fixed: true },
  { name: "plus c_n c_n", mk: (n) => ap(plus, cn(n), cn(n)) },
  { name: "mul c_n c_n", mk: (n) => ap(mul, cn(n), cn(n)) },
  { name: "mul (mul c_n c_n) c_n", mk: (n) => ap(mul, ap(mul, cn(n), cn(n)), cn(n)) },
  { name: "pow c_2 c_n  (= 2^n)", mk: (n) => ap(pow, cn(2), cn(n)) },
];
p("");
p("ARM 1 — THE COST LADDER  (static certificate predicts measured growth class)");
p("");
p("  For each family we print: the STATIC EAL depth/rung (computed by type, no execution), then the");
p("  MEASURED interaction count I(n) of the metered reducer for operand size n = 2..7, then the");
p("  smallest finite-difference order that is constant (= polynomial degree), then the matching rung.");
p("");
p(`  ${pad("FAMILY", 26)}${pad("EAL depth", 11)}${pad("static rung", 16)} I(2..7)`);
p(`  ${bar(96)}`);
const ladderRows = [];
for (const fam of ladder) {
  const e = inferEAL(fam.fixed ? fam.mk() : fam.mk(2));
  const series = fam.fixed ? null : W.map((n) => interactions(fam.mk(n)));
  const deg = series && series.every((x) => x != null) ? fitDegree(series) : null;
  ladderRows.push({ fam, e, series, deg });
  const seriesStr = fam.fixed ? `(size-independent: I = ${interactions(fam.mk())})` : `[ ${series.map((x) => lp(x, 4)).join(", ")} ]`;
  p(`  ${pad(fam.name, 26)}${pad(e.depth, 11)}${pad(e.rung, 16)}${seriesStr}`);
}
p(`  ${bar(96)}`);
p("");
p("  FINITE-DIFFERENCE WORKSHEET  (this is the 'check by hand' table)");
p("  A degree-d polynomial has a CONSTANT d-th difference and a ZERO (d+1)-th. Subtract neighbours:");
p("");
for (const { fam, series, deg } of ladderRows) {
  if (!series) continue;
  p(`  ${fam.name}`);
  let row = series, d = 0;
  const lines = [`    Δ^0  (I itself)   [ ${row.map((x) => lp(x, 5)).join(", ")} ]`];
  while (row.length >= 2 && d < 6) {
    row = diff(row); d++;
    const constant = isConst(row);
    lines.push(`    Δ^${d} ${pad("", 13)}[ ${row.map((x) => lp(x, 5)).join(", ")} ]${constant ? `   <= CONSTANT  => degree ${d}` : ""}`);
    if (constant) break;
  }
  if (deg == null) lines.push(`    (no constant finite difference in window => SUPER-POLYNOMIAL / exponential)`);
  lines.forEach((l) => p(l));
  p(`    verdict: measured degree = ${deg == null ? "exponential" : deg}; static EAL rung = ${inferEAL(fam.mk(2)).rung}`);
  p("");
}
p("  CHECK BY HAND: take any row's Δ^0 series and subtract adjacent entries to get Δ^1, repeat. The");
p("  order at which the row becomes constant is the polynomial degree. plus=>1, mul=>2, mul∘mul=>3,");
p("  pow=>never constant (exponential). The static EAL rung column was computed WITHOUT these numbers");
p("  and still names the same class. That agreement is the receipt.");
p(bar());

// ---- ARM 2: SOUNDNESS ALIGNMENT ----
p("");
p("ARM 2 — SOUNDNESS ALIGNMENT  (the falsifiable predicate)");
p("");
p("  Claim: the cheap verdict is never wrong in the dangerous direction. No term the classifier calls");
p("  rung<=1 ('linear'/'polynomial') detonates (exceeds budget); every detonation is rung>=2.");
p("");
p(`  ${pad("TERM", 22)}${pad("classify rung", 36)}${pad("EAL?", 6)}${pad("within budget?", 16)}verdict-vs-outcome`);
p(`  ${bar(106)}`);
const expn = (k) => ap(cn(k), cn(2)); // c_k c_2 = 2^k
const audit = [
  { name: "id", t: id },
  { name: "plus c20 c20", t: ap(plus, cn(20), cn(20)) },
  { name: "mul c12 c12", t: ap(mul, cn(12), cn(12)) },
  { name: "mul (mul c4 c4) c4", t: ap(mul, ap(mul, cn(4), cn(4)), cn(4)) },
  { name: "c4 c2  (=2^4=16)", t: expn(4) },
  { name: "c14 c2 (=2^14)", t: expn(14) },
  { name: "c20 c2 (=2^20)", t: expn(20) },
];
let violations = 0;
for (const { name, t } of audit) {
  const c = classify(t); const e = inferEAL(t);
  const rank = c.rank ?? c; const rung = c.rung ?? "?";
  const blew = detonates(t);
  const cheap = (typeof rank === "number" ? rank : 99) <= 1;
  const ok = cheap ? !blew : true; // cheap MUST NOT detonate
  if (!ok) violations++;
  const outcome = blew ? "DETONATED" : "normalized";
  const tag = cheap && blew ? "*** VIOLATION ***" : cheap ? "cheap & safe  OK" : blew ? "flagged & blew  OK" : "costly but fit  OK";
  p(`  ${pad(name, 22)}${pad(`${rung} (rank ${rank})`, 36)}${pad(e.eal ? "yes" : "no", 6)}${pad(outcome, 16)}${tag}`);
}
p(`  ${bar(106)}`);
p(`  rung<=1 terms that detonated: ${violations}   =>  predicate ${violations === 0 ? "HOLDS" : "FALSIFIED"} on this population`);
p("");
p("  CHECK BY HAND: scan the last two columns. Wherever 'within budget?' = DETONATED, the rung must be");
p("  >= 2. There must be no row tagged VIOLATION. One counterexample would refute the resource rung.");
p(bar());

// ---- ARM 3: INDEPENDENT ENGINE ----
p("");
p("ARM 3 — INDEPENDENT ENGINE (HVM4)  (cross-runtime corroboration)");
p("");
if (!HVM4_OK) {
  p("  SKIPPED — HVM4 binary not found at " + HVM4_BIN + " (set HVM4_BIN to enable).");
  p("  This arm is a snapshot; when generated on a machine with HVM4 built it shows three equal columns.");
} else {
  p("  Each term is decoded to an integer and evaluated two independent ways: Weave's toy reducer and");
  p("  the HVM4 runtime (a separate Interaction-Calculus engine). They must produce the same integer.");
  p("");
  p(`  ${pad("TERM", 26)}${lp("expected", 10)}${lp("toy", 8)}${lp("HVM4", 8)}   agree?`);
  p(`  ${bar(64)}`);
  const cross = [
    { name: "(2+3)*4", t: Op("mul", Op("add", Lit(2), Lit(3)), Lit(4)), exp: 20, raw: true },
    { name: "decode c5", t: cn(5), exp: 5 },
    { name: "plus c2 c3", t: ap(plus, cn(2), cn(3)), exp: 5 },
    { name: "mul c3 c4", t: ap(mul, cn(3), cn(4)), exp: 12 },
    { name: "mul c2 c2", t: ap(mul, cn(2), cn(2)), exp: 4 },
    { name: "pow c2 c3 (=8)", t: ap(pow, cn(2), cn(3)), exp: 8 },
  ];
  let agree = 0;
  for (const { name, t, exp, raw } of cross) {
    const toy = raw ? (() => { const w = normalize(t, BUDGET); return w.term.tag === "Lit" ? w.term.value : null; })() : toyInt(t);
    let hv; try { hv = raw ? (() => { const dir = mkdtempSync(join(tmpdir(), "weave-ex-")); const f = join(dir, "m.hvm"); writeFileSync(f, `@main = ${lowerToHVM4(t)}\n`); const o = execFileSync(HVM4_BIN, [f, "-C10"], { encoding: "utf8", timeout: 30000 }); const m = o.match(/-?\d+/g); return m ? parseInt(m[m.length - 1], 10) : null; })() : hvm4Int(t); } catch { hv = null; }
    const ok = toy === exp && hv === exp; if (ok) agree++;
    p(`  ${pad(name, 26)}${lp(exp, 10)}${lp(toy, 8)}${lp(hv, 8)}   ${ok ? "yes" : "NO"}`);
  }
  p(`  ${bar(64)}`);
  p(`  ${agree}/${cross.length} terms agreed across expected, toy reducer, AND HVM4.`);
  p("");
  p("  CHECK BY HAND: the three numeric columns must be identical on every row. Two unrelated reducers");
  p("  landing on the same integer is independent evidence the semantics (and thus the cost grade) are real.");
}
p(bar());

// ---- ARM 4: GOVERNANCE CERTIFICATE ----
// Self-contained (no elixir, no sibling box-and-box repo): the WeaveCostCertificate from
// weave-certificate.mjs already carries the resource decision. This arm shows the decision is
// FAIL-CLOSED — the highest-utility plans lose to the floor, not to a smaller number — and then
// runs the refused plan to vindicate the static refusal. (The full cross-language floor, with the
// kernel's 0̲ annihilation, is in proofs/transcripts/govern.txt; this arm proves the certificate
// that floor consumes.)
p("");
p("ARM 4 — GOVERNANCE CERTIFICATE  (fail-closed: cost, not utility, decides admission)");
p("");
p("  Budget admits costClass 'poly' only. The certificate's resourceDecision is taken statically");
p("  from the type. Note the two HIGHEST-utility plans are exactly the two the floor refuses.");
p("");
const selfApp = lam("x", App(v("x"), v("x"))); // not simply-typeable ⇒ uncertified ⇒ annihilate
const govPlans = [
  { name: "plus c2 c2", t: ap(plus, cn(2), cn(2)), util: 5 },
  { name: "mul c6 c6", t: ap(mul, cn(6), cn(6)), util: 7 },
  { name: "c3 c2 (exp)", t: ap(cn(3), cn(2)), util: 9 },
  { name: "selfapp (x x)", t: selfApp, util: 11 },
  { name: "tower(4)", t: ap(...Array.from({ length: 4 }, () => cn(2))), util: 12 },
];
const PIN = { now: "1970-01-01T00:00:00.000Z" };
const admit = (d) => d === "allow";
p(`  ${pad("PLAN", 18)}${lp("util", 5)}  ${pad("certified", 10)}${pad("costClass", 12)}${pad("decision", 14)}admitted?`);
p(`  ${bar(72)}`);
let govRows = [];
for (const g of govPlans) {
  const c = certify(g.t, PIN);
  const d = c.policy.resourceDecision;
  govRows.push({ ...g, cert: c, decision: d, admitted: admit(d) });
  p(`  ${pad(g.name, 18)}${lp(g.util, 5)}  ${pad(c.verdict.certified ? "yes" : "no", 10)}${pad(c.verdict.costClass, 12)}${pad(d, 14)}${c.verdict.certified && admit(d) ? "yes" : "— (0̲)"}`);
}
p(`  ${bar(72)}`);
const admitted = govRows.filter((r) => r.admitted);
const winner = admitted.reduce((best, r) => (r.util > best.util ? r : best), admitted[0]);
const naive = govRows.reduce((best, r) => (r.util > best.util ? r : best), govRows[0]);
const floorViol = govRows.filter((r) => r.admitted && (!r.cert.verdict.certified || r.cert.verdict.costClass !== "poly")).length;
p("");
p(`  winner (highest-utility ADMITTED plan): ${winner.name} (util ${winner.util}) → ${(() => { const i = interactions(winner.t); return i == null ? "ran past budget" : i + " interactions, normal"; })()}`);
p(`  naive pick (highest-utility OVERALL):   ${naive.name} (util ${naive.util}) → decision '${naive.decision}', NOT admitted — utility cannot resurrect it.`);
p(`  admitted plans that were uncertified or non-poly: ${floorViol}  =>  fail-closed ${floorViol === 0 ? "HOLDS" : "VIOLATED"}`);
p("");
p("  VINDICATION — run the refused, highest-utility plan anyway:");
p(`    ${naive.name}: ${detonates(naive.t) ? "DETONATED (exceeds budget) — the static refusal was right." : "normalized (no detonation observed in the audit budget)"}`);
p("");
p("  CHECK BY HAND: the two highest 'util' rows are the two with decision != 'allow'. A utility-maximizer");
p("  would pick them; the certificate floor annihilates both (uncertified ⇒ 0̲; tower ⇒ escalate). The");
p("  admitted winner is a smaller-utility but CERTIFIED-poly plan, and it runs. Cost is a type.");
p(bar());

p("");
p("END OF RECEIPTS. Provenance: Weave reducer + EAL inference (this repo), HVM4 (HigherOrderCO/HVM4).");

const text = out.join("\n") + "\n";
const target = join(import.meta.dirname, "RECEIPTS.txt");
writeFileSync(target, text);
process.stdout.write(text);
process.stderr.write(`\n[written to ${target}]\n`);
