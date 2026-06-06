# Weave — a static cost certificate for the [&] stack's resource rung

A research prototype, built invariant-first: find the invariants, state the rules, enforce them in
code, close the loop. Plain Node (v18+), no dependencies. Run any file with `node <file>`.

**Positioning (read `weave-and-the-ampersand-stack.md` first).** Weave began as "a better Bend/HVM,"
but with box-and-box and OpenSentience in frame that framing is wrong. Weave is *not* a Bend/HVM
competitor — it is a deep probe of one rung of the [&] stack: the **resource rung** (the affine
ledger, "can we afford it"), and specifically the piece box-and-box doesn't yet have — a **static
cost certificate** computed before a computation runs, not a runtime meter read after. HVM4 (now on
GitHub in early preview) is the intended execution backend; the cost certificate is
substrate-independent, so lowering to HVM4 is an execution choice, not a correctness dependency.

## Files

| File | What it is | Run |
|------|------------|-----|
| `weave-and-the-ampersand-stack.md` | **Start here.** Repositions Weave inside the [&] stack, grades the whole stack against the AIOS agent-OS reference (the "what else does the house need" gap analysis), and specifies the cost-certificate → resource-rung integration and the HVM4 backend plan. | — |
| `weave-design.md` | The design doc: the thesis, the openings in Bend, the five invariants, the closed loop. **Read after the positioning doc — it predates the [&]-stack reframe and the validation work, so treat it as the starting hypothesis.** | — |
| `weave.mjs` | The core. An Interaction-Calculus reducer (β + sup/dup, metered, with time and space vetoes), the static invariant checker (affine / label-coherence / κ), and a small superposed-search + evolution loop. Exports its API; runs a demo when invoked directly. | `node weave.mjs` |
| `weave-validate.mjs` | Differential testing: linearize a pure λ-term, reduce with Weave, compare the normal form to a reference normal-order evaluator. **12/12.** | `node weave-validate.mjs` |
| `weave-proptest.mjs` | Checker-gated property testing over thousands of random simply-typed terms. Hunts for any term the checker accepts but the reducer mis-evaluates. None found. | `node weave-proptest.mjs` |
| `weave-cost.mjs` | The cost cliff, measured: addition (linear), multiplication (polynomial), exponentiation towers (detonate). Shows source size ≠ cost. | `node weave-cost.mjs` |
| `weave-classify.mjs` | Cost as a type, statically. Infers types, reports the iteration *rank* (poly / exp / tower) with no execution, and cross-checks against measured cost. | `node weave-classify.mjs` |
| `weave-soundness.mjs` | Stress-tests the classifier's verdict against measured cost over an adversarial battery plus ~2000 random terms. Falsifiable predicate: no rank≤1 term detonated. | `node weave-soundness.mjs` |
| `weave-backend.mjs` | The "backend" the surface lowers to (the Nx/EXLA role): reads an IR term as JSON and runs the real engine (normalize / classify / check). | `node weave-backend.mjs <op> '<ir-json>'` |
| `weave_surface.exs` | An Elixir macro surface. `defweave` compiles native `fn` syntax — plus integer literals, `+`/`*`/`-`, list literals, and `fold` — into Weave IR at compile time, then shells to the backend. | `elixir weave_surface.exs` |
| `weave-fold-test.mjs` | Differential test for the primitive + structural-recursion layer: linearized `fold` vs JS ground truth over random lists × {add, mul, sub}. **1200/1200.** | `node weave-fold-test.mjs` |

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
running artifacts (soundness: `weave-validate`; cost: `weave-classify`).

Placed in the [&] stack, this is the **resource rung** made into a static certificate. box-and-box's
resource rung is a *runtime* ledger ("what was spent"); Weave is the *static* certificate ("what can
be spent, in what class, with termination guaranteed"). Wired into `govern()`, a computation that
can't be certified to halt within budget becomes `0̄` — annihilated, not down-ranked — the same floor
pattern the kernel already uses for forbidden actions. Three of your theses converge here:
**symbol-as-system** (the verdict is the arithmetic), **topology-as-warrant** (κ licenses the shape of
the reasoning), and **cost-as-certificate** (the discipline that makes the fast path sound is the one
that bounds cost). See `weave-and-the-ampersand-stack.md` for the full integration and gap analysis.

The single next step that would convert the cost classifier from validated heuristic to certified
bound: replace the STLC-type-order proxy with real Elementary/Light-Affine inference (Baillot–Terui;
decidable, polynomial), so the rung carries a theorem and the analysis stops going silent on harder
terms.
