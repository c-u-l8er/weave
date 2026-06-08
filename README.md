# Weave — a static cost certificate for the [&] stack's resource rung

A research prototype, built invariant-first: find the invariants, state the rules, enforce them in
code, close the loop. Plain Node (v18+), no dependencies. Run any script with `node <path>` (e.g.
`node src/weave.mjs`), or use the npm scripts: `npm run demo`, `npm test`, `npm run proofs`.

**Positioning (read `weave-and-the-ampersand-stack.md` first).** Weave began as "a better Bend/HVM,"
but with box-and-box and OpenSentience in frame that framing is wrong. Weave is *not* a Bend/HVM
competitor — it is a deep probe of one rung of the [&] stack: the **resource rung** (the affine
ledger, "can we afford it"), and specifically the piece box-and-box doesn't yet have — a **static
cost certificate** computed before a computation runs, not a runtime meter read after. HVM4 (now on
GitHub in early preview) is the intended execution backend; the cost certificate is
substrate-independent, so lowering to HVM4 is an execution choice, not a correctness dependency.

## New here? Check the proof, don't take my word for it

[`proofs/`](./proofs/) holds **proof you can verify without running anything** from committed text — no
install, no run. Read [`proofs/README.md`](./proofs/README.md), then eyeball
[`proofs/RECEIPTS.txt`](./proofs/RECEIPTS.txt) (the static cost grade vs. measured growth, checkable by
finite differences; the falsifiable soundness predicate; a cross-check against the independent HVM4
runtime) and [`proofs/transcripts/`](./proofs/transcripts/) (the exact stdout of every script,
claim-by-claim). Regenerate with `node proofs/generate.mjs` and `node tools/regenerate-proofs.mjs`.

## Layout

```
weave/
  README.md                            this file
  proofs/     RECEIPTS.txt (by-hand-checkable) + transcripts/ (per-script) + generate.mjs + README.md
  src/        the engine (pure library, exports an API; each runs a demo when invoked directly)
  test/       the validation suites (differential / property / soundness / cross-engine)
  surface/    weave_surface.exs        the Elixir macro front-end
  tools/      regenerate-proofs.mjs    rebuilds proofs/transcripts/ (--check verifies no drift)
  docs/        positioning + design docs
```

### `docs/` — read these first

| File | What it is |
|------|------------|
| `docs/weave-and-the-ampersand-stack.md` | **Start here.** Repositions Weave inside the [&] stack, grades the stack against the AIOS agent-OS reference (gap analysis), and specifies the cost-certificate → resource-rung integration and the HVM4 backend plan. |
| `docs/weave-design.md` | The design doc: thesis, openings in Bend, the five invariants, the closed loop. **Read after the positioning doc — it predates the [&]-stack reframe and the validation work, so treat it as the starting hypothesis.** |

### `src/` — the engine

| File | What it is | Run |
|------|------------|-----|
| `src/weave.mjs` | The core. An Interaction-Calculus reducer (β + sup/dup, metered, with time and space vetoes), the static invariant checker (affine / label-coherence / κ), and a small superposed-search + evolution loop. | `node src/weave.mjs` |
| `src/weave-classify.mjs` | Cost as a type, statically. Infers types, reports the iteration *rank* (poly / exp / tower) with no execution, and cross-checks against measured cost. | `node src/weave-classify.mjs` |
| `src/weave-eal.mjs` | **The certificate.** Type-directed EAL box-decoration: the static box-nesting *depth* (= certified elementary tower height) with a per-binder certificate. Upgrades the rank proxy toward a real bound. | `node src/weave-eal.mjs` |
| `src/weave-eal-degree.mjs` | Stage B: recovers the polynomial *degree* inside the depth-1 rung by finite differences — the measured ground truth that static LAL (Baillot–Terui) would prove. | `node src/weave-eal-degree.mjs` |
| `src/weave-cost.mjs` | The cost cliff, measured: addition (linear), multiplication (polynomial), exponentiation towers (detonate). Shows source size ≠ cost. | `node src/weave-cost.mjs` |
| `src/weave-hvm4.mjs` | Local round-trip lowering to a generic HVM-core syntax + inverse parser (semantics-preserving validation, no external binary). | `node src/weave-hvm4.mjs` |
| `src/weave-backend.mjs` | The "backend" the surface lowers to (the Nx/EXLA role): reads an IR term as JSON and runs the real engine. | `node src/weave-backend.mjs <op> '<ir-json>'` |

### `test/` — the validation suites

| File | What it is | Run |
|------|------------|-----|
| `test/weave-validate.mjs` | Differential testing: linearize a pure λ-term, reduce with Weave, compare the normal form to a reference normal-order evaluator. **12/12.** | `node test/weave-validate.mjs` |
| `test/weave-proptest.mjs` | Checker-gated property testing over thousands of random simply-typed terms. None mis-evaluated. | `node test/weave-proptest.mjs` |
| `test/weave-soundness.mjs` | Stress-tests the classifier verdict against measured cost over an adversarial battery + ~2000 random terms. Falsifiable predicate: no rank≤1 term detonated. | `node test/weave-soundness.mjs` |
| `test/weave-fold-test.mjs` | Differential test for the structural-recursion layer: linearized `fold` vs JS ground truth over random lists × {add, mul, sub}. **1200/1200.** | `node test/weave-fold-test.mjs` |
| `test/weave-eal-test.mjs` | Validates the EAL **certificate** against *measured* cost (not the proxy): certified-cheap never detonates, `eal:true` reduces oracle-free (no residue), depth matches the validated rank. | `node test/weave-eal-test.mjs` |
| `test/weave-hvm4-run.mjs` | The real HVM4 backend: lowers to HVM4 surface syntax, shells to the built binary, and differential-tests integer outputs against the toy reducer. **6/6.** Needs `~/hvm4/src/hvm` (or `HVM4_BIN=`). | `node test/weave-hvm4-run.mjs` |

### `surface/` — the Elixir front-end

| File | What it is | Run |
|------|------------|-----|
| `surface/weave_surface.exs` | An Elixir macro surface. `defweave` compiles native `fn` syntax — integer literals, `+`/`*`/`-`, list literals, `fold` — into Weave IR at compile time, then shells to `../src/weave-backend.mjs`. | `elixir surface/weave_surface.exs` |
| `surface/weave_govern.exs` | **The stack, end to end.** Authors four plans with `defweave`, certifies each one's cost class with `Weave.classify` (static — no execution), shells to the box-and-box governance kernel (the highest-utility exponential is **annihilated** `0̲` by the resource-rung floor), **runs** the polynomial winner to a real answer (`210`), then runs the refused tower anyway and watches it **detonate** (`over-space`) — vindicating the static refusal. Cost is a type, and the type decides. | `elixir surface/weave_govern.exs` |

## Honest status

What runs and is validated:
- The reducer is sound on every term tested — the 12-term battery plus ~3000 random simply-typed
  terms plus Church arithmetic. No counterexample found.
- The cost cliff is real and measured; the static classifier predicts it from structure before
  running, and the prediction matches.
- **Recursion fork: decided.** The surface offers *structural* recursion (fold over a list),
  not a general `fix`. A Church-encoded list is its own right fold, so recursion on the spine is
  total, has no fixpoint, and stays in the elementary/certified fragment — the feature is also the
  limit, by design.
- **Primitives + a list ADT are in, and the surface is now writable.** Native integers and `+`/`*`/`-`
  lower to a strict `Op` node (type-order 0, no cost-rank contribution); list literals lower to Church
  lists; `fold` is the list applied. Duplicating an `Op`-carrying combiner needed one new rule —
  `OP-SUP`, the operator/superposition commutation, exactly parallel to the existing `APP-SUP`.
  With it, linearized folds match JS ground truth **1200/1200** over random lists and operators, and
  `sum`/`product` over a list literal run end-to-end through Elixir and classify rank-1 polynomial.

What is a corrected claim (the validation overturned earlier guesses):
- An early discussion called Church multiplication the "oracle boundary." That was wrong — it was a
  missing `DUP-APP` commutation rule in the reducer, since fixed. There is no known boundary within
  the tested fragment.
- The static invariants `I1` (affine) + `I2` (labels) are **not** sufficient for soundness — a term
  exists that they accept but a naive reducer mis-evaluates. They are a source-level discipline, not
  a soundness certificate.

What is a heuristic, not a theorem:
- `weave-classify` uses STLC type-order as a proxy for the complexity rung. It is principled
  (higher-order iteration climbs the Grzegorczyk hierarchy) and validated on these families, but it
  is an under-approximation of full Elementary/Light-Affine inference, reports the ladder *rung* not
  the polynomial degree, and goes silent on terms that aren't simply-typable.

## The thesis, as far as it's earned

The defensible core is substructural: you get a guarantee by removing the structural rule that would
let you violate it, so the violation becomes inexpressible. In this style the *safety invariant* and
the *cost guarantee* are the same object — linearity-with-stratification simultaneously makes
reduction sound, licenses the oracle-free fast path, and grades cost. Two of those faces now have
running artifacts (soundness: `test/weave-validate`; cost: `src/weave-classify`), and all three are
exhibited together — checkable by hand — in [`proofs/RECEIPTS.txt`](./proofs/RECEIPTS.txt).

Placed in the [&] stack, this is the **resource rung** made into a static certificate. box-and-box's
resource rung is a *runtime* ledger ("what was spent"); Weave is the *static* certificate ("what can
be spent, in what class, with termination guaranteed"). Wired into `govern()`, a computation that
can't be certified to halt within budget becomes `0̄` — annihilated, not down-ranked — the same floor
pattern the kernel already uses for forbidden actions. Three of your theses converge here:
**symbol-as-system** (the verdict is the arithmetic), **topology-as-warrant** (κ licenses the shape of
the reasoning), and **cost-as-certificate** (the discipline that makes the fast path sound is the one
that bounds cost). See `weave-and-the-ampersand-stack.md` for the full integration and gap analysis.

**Update — the next step is taken (partway).** `src/weave-eal.mjs` now computes a real EAL
box-decoration: a static box-nesting *depth* (= certified elementary tower height) with a per-binder
certificate, validated against *measured* cost in `test/weave-eal-test.mjs` (certified-cheap never
detonated; every `eal:true` term reduced oracle-free). The depth-1 rung's polynomial *degree* is
recovered empirically in `src/weave-eal-degree.mjs`. And `test/weave-hvm4-run.mjs` wires the real
HVM4 backend (6/6 differential agreement), confirming the certificate is substrate-independent.

What remains genuinely open: the polynomial **degree** is still *measured*, not statically inferred.
Pinning it by type is **static LAL** inference (Light Affine Logic / Baillot–Terui §-boxes) — the
named boundary. EAL gives the certified *tower height*; LAL would give the certified *degree*.
