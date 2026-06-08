// compose.mjs — the CC2 compose runtime: the lego layer (COMPOSE_RUNTIME.md §2–4).
//
// A BRICK is a capability annotated with everything needed to compose it lawfully: a holder
// (provenance), a contract (the |> hand-off types), a box-and-box modal Value (the alethic floor
// input), a Weave-shaped cost certificate (the invariant), plus utility/laws/floor. Two operators
// snap bricks together and YIELD ANOTHER BRICK (closure — "a brick of bricks is a brick"):
//
//   &   combine (parallel)   — lifts value.combine: lattice merge of capabilities, holder-tagged.
//   |>  pipeline (sequence)  — lifts value.chain:   governed, phase-graded, type-checked hand-off.
//
// Both rest on the SAME floor: any infeasible / backward / forbidden / UNCERTIFIED branch collapses
// to 0̲ (ZERO) — the absorbing element — never a down-ranked-but-surviving option. This is the alethic
// `consume` gate lifted to bricks. The composite carries a composite cost certificate and the CC2
// semiring quantities (confidence = product, cost = sum, latency = max).
//
// Pure library, zero deps: the cost certificate is DUCK-TYPED (weave emits it; we only read
// verdict.certified / verdict.costClass / policy.resourceDecision), so box-and-box stays
// dependency-free and weave stays an optional producer.

import { V, V0, combine, chain, consume, phaseIdx } from './value.mjs';

// ---------------------------------------------------------------------------
// cost-class lattice — worst (join) wins under composition. unknown ⇒ uncertified ⇒ 0̲.
// ---------------------------------------------------------------------------
const COST_ORDER = ['poly', 'elementary', 'exponential', 'tower', 'unknown'];
const costRank = (c) => { const i = COST_ORDER.indexOf(c); return i < 0 ? COST_ORDER.length : i; };
const worseCost = (a, b) => (costRank(a) >= costRank(b) ? a : b);

// resource decision from a composite cost class — fail-closed (mirrors weave-certificate.mjs).
const decisionOf = (certified, costClass) =>
  !certified ? 'annihilate'
  : costClass === 'poly' ? 'allow'
  : costClass === 'tower' ? 'escalate'
  : 'budget_check'; // elementary | exponential

// a certified-poly identity certificate (used by the identity bricks none/id; they cost nothing).
const FREE_COST = () => ({
  subject: { kind: 'weave-ir', hash: '00000000' },
  analyzer: { name: 'identity', version: '0' },
  verdict: { certified: true, total: true, oracleFree: true, costClass: 'poly' },
  policy: { resourceDecision: 'allow', reason: 'identity brick — costless' }
});
// fail-closed default for a brick that arrives without a certificate: uncertified ⇒ 0̲.
const UNCERTIFIED_COST = () => ({
  subject: { kind: 'weave-ir', hash: '00000000' },
  analyzer: { name: 'none', version: '0' },
  verdict: { certified: false, total: false, oracleFree: false, costClass: 'unknown' },
  policy: { resourceDecision: 'annihilate', reason: 'no certificate supplied — fail-closed' }
});

function composeCost(a, b) {
  const certified = !!(a?.verdict?.certified && b?.verdict?.certified);
  const ca = a?.verdict?.costClass ?? 'unknown';
  const cb = b?.verdict?.costClass ?? 'unknown';
  let costClass = worseCost(ca, cb);
  if (!certified) costClass = costClass === 'poly' ? 'unknown' : costClass; // uncertified can't be "poly"
  const resourceDecision = decisionOf(certified, costClass);
  return {
    subject: { kind: 'weave-composite', parts: [a?.subject?.hash, b?.subject?.hash].filter(Boolean) },
    analyzer: { name: 'compose', version: '0.1.0' },
    verdict: { certified, costClass },
    policy: { resourceDecision, reason: `composite of {${ca}, ${cb}} ⇒ ${costClass}` }
  };
}

// ---------------------------------------------------------------------------
// CC2 semiring quantities — confidence (product), cost (sum), latency (max). One identity
// {confidence:1, cost:0, latency:0} serves both operators (1 = ⊗-id, 0 = +-id and max-id over ℝ≥0).
// ---------------------------------------------------------------------------
const Q0 = () => ({ confidence: 1, cost: 0, latency: 0 });
const q = (b) => ({ ...Q0(), ...(b.q || {}) });
function composeQ(a, b) {
  return {
    confidence: a.confidence * b.confidence,
    cost: a.cost + b.cost,
    latency: Math.max(a.latency, b.latency)
  };
}

// ---------------------------------------------------------------------------
// contract types — '*' is a wildcard; a string or array of strings otherwise. A hand-off is
// feasible iff the producer's feeds_into intersects the consumer's accepts_from (or either is '*').
// ---------------------------------------------------------------------------
const asSet = (t) => (t == null ? [] : Array.isArray(t) ? t : [t]);
const uni = (a, b) => [...new Set([...asSet(a), ...asSet(b)])];
function typeMatch(out, inn) {
  if (out === '*' || inn === '*' || out == null || inn == null) return true;
  const O = asSet(out), I = asSet(inn);
  return O.includes('*') || I.includes('*') || O.some((t) => I.includes(t));
}

// ---------------------------------------------------------------------------
// Brick + the distinguished elements.
// ---------------------------------------------------------------------------
export function Brick(p = {}) {
  return {
    id: p.id ?? 'brick',
    holder: p.holder ?? null,
    contract: { accepts_from: p.contract?.accepts_from ?? '*', feeds_into: p.contract?.feeds_into ?? '*' },
    value: p.value ?? V0(),
    cost: p.cost ?? UNCERTIFIED_COST(),
    q: { ...Q0(), ...(p.q || {}) },
    utility: p.utility ?? 0,
    laws: [...(p.laws || [])],
    floor: [...(p.floor || [])],
    annihilated: !!p.annihilated
  };
}

// 0̲ — the absorbing zero of BOTH operators (an annihilated branch).
export const ZERO = Object.freeze(Brick({
  id: '0̲', annihilated: true,
  value: V({ sigma: ['annihilated'] }),
  cost: UNCERTIFIED_COST(),
  q: { confidence: 0, cost: Infinity, latency: Infinity },
  utility: 0
}));
export const isZero = (b) => !b || b === ZERO || b.annihilated === true;

// &none — identity for &.   id — identity (typed pass-through) for |>.   Both cost nothing.
export const none = () => Brick({ id: '&none', value: V0(), cost: FREE_COST(), q: Q0(), contract: { accepts_from: '*', feeds_into: '*' } });
export const idBrick = () => Brick({ id: 'id', value: V0(), cost: FREE_COST(), q: Q0(), contract: { accepts_from: '*', feeds_into: '*' } });

const holders = (a, b) => {
  // provenance is a SET of holders — flatten any already-composite holder so the union stays
  // flat and the operator stays associative & commutative (a nested holder breaks both laws).
  const flat = [a.holder, b.holder].flatMap((h) => (h == null ? [] : Array.isArray(h) ? h : [h]));
  const hs = [...new Set(flat)];
  return hs.length === 0 ? null : hs.length === 1 ? hs[0] : hs;
};

// The floor every operator shares: a composed value that still carries an unresolved conflict, a
// cycle, or an uncertified cost collapses to 0̲ — utility cannot resurrect it.
function floored(value, cost, floorReqs) {
  if (cost.verdict.certified === false) return true;             // uncertified ⇒ 0̲ (conservative rule)
  const req = Object.assign({ sigma_empty: true, acyclic: true }, floorReqs || {});
  return !consume(value, req).ok;                                // forbidden / cyclic / unresolved ⇒ 0̲
}

// ---------------------------------------------------------------------------
// &  — combine (parallel). Lattice merge of capabilities; holder-tagged; cost & quantities accrue.
// ---------------------------------------------------------------------------
export function composeAnd(a, b) {
  if (isZero(a) || isZero(b)) return ZERO;                       // 0̲ absorbs
  const value = combine(a.value, b.value);
  const cost = composeCost(a.cost, b.cost);
  if (floored(value, cost)) return ZERO;
  return Brick({
    id: `(${a.id} & ${b.id})`,
    holder: holders(a, b),
    contract: { accepts_from: uni(a.contract.accepts_from, b.contract.accepts_from),
                feeds_into: uni(a.contract.feeds_into, b.contract.feeds_into) },
    value,
    cost,
    q: composeQ(q(a), q(b)),
    utility: a.utility + b.utility,
    laws: [...new Set([...a.laws, ...b.laws, 'CC2.&'])],
    floor: [...new Set([...a.floor, ...b.floor])]
  });
}

// ---------------------------------------------------------------------------
// |> — pipeline (sequence). Governed, phase-graded, type-checked hand-off. The operator CC1 left
// lawless. A type mismatch, a backward phase, or an uncertified/forbidden step IS the zero.
// ---------------------------------------------------------------------------
export function composePipe(a, b) {
  if (isZero(a) || isZero(b)) return ZERO;                       // 0̲ absorbs
  if (!typeMatch(a.contract.feeds_into, b.contract.accepts_from)) return ZERO; // infeasible hand-off ⇒ 0̲
  const chained = chain(a.value, b.value);
  if (chained.error) return ZERO;                               // π-violation (backward phase) ⇒ 0̲
  const cost = composeCost(a.cost, b.cost);
  if (floored(chained, cost)) return ZERO;
  return Brick({
    id: `(${a.id} |> ${b.id})`,
    holder: holders(a, b),
    contract: { accepts_from: a.contract.accepts_from, feeds_into: b.contract.feeds_into }, // external interface
    value: chained,
    cost,
    q: composeQ(q(a), q(b)),
    utility: a.utility + b.utility,
    laws: [...new Set([...a.laws, ...b.laws, 'CC2.|>'])],
    floor: [...new Set([...a.floor, ...b.floor])]
  });
}

// ---------------------------------------------------------------------------
// composeTree — fold an AST of { op:'&'|'|>', a, b } (leaves are bricks) into one brick.
// ---------------------------------------------------------------------------
export function composeTree(node) {
  if (!node || node.op == null) return node;                    // leaf brick (or null)
  const a = composeTree(node.a), b = composeTree(node.b);
  return node.op === '&' ? composeAnd(a, b)
       : node.op === '|>' ? composePipe(a, b)
       : (() => { throw new Error(`unknown compose op: ${node.op}`); })();
}

export default { Brick, ZERO, isZero, none, idBrick, composeAnd, composePipe, composeTree };
