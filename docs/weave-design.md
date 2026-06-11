# Weave — a better Bend, built invariant-first (consolidated)

> **Part of the [&] Protocol stack** · [Ecosystem overview](../../ECOSYSTEM.md) · [Three-protocol stack](../../PULSE/docs/THREE_PROTOCOL_STACK.md) · [Stack status](../../STACK_COMPLETION.md)

A design for a massively-parallel language in the lineage of Bend/HVM, derived invariant-first:
**find the invariants → state the rules → enforce them in code → close the loop.** This version
folds in everything the validation work established, including two places where testing overturned
an earlier claim. The companion files (`weave.mjs`, `weave-validate.mjs`, `weave-proptest.mjs`,
`weave-cost.mjs`, `weave-classify.mjs`) are runnable evidence for each section.

---

## Part 0 — Positioning (added after the [&]-stack reframe)

This document was written when Weave was framed as "a better Bend." That framing is now wrong, and
the right one sharpens everything below. **Weave is not a Bend/HVM competitor.** It is the
**resource rung** of the [&] stack (box-and-box's affine ledger, *"can we afford it"*) taken
seriously — turned from a runtime meter into a *static cost certificate* computed before a
computation runs. HVM4 (early-preview on GitHub) is the intended execution backend; because the
certificate is substrate-independent, lowering to it is an execution choice, not a correctness
dependency. Read Parts I–V as the technical derivation of that certificate. The companion
[Weave and the Ampersand Stack](weave-and-the-ampersand-stack.md) carries the positioning, the gap
analysis against the AIOS agent-OS reference, and the integration into `govern()`. Where this doc
says "a better Bend," read
"the resource rung's certificate."

---

Strip the marketing and Bend/HVM's bet is precise and correct: **the wires are incidental; the
algebra is essential.** Lafont's interaction combinators are three symbols and six rules, split into
*annihilation* (like meets like) and *commutation* (unlike meets unlike). Two facts do all the work:
**locality** (a rule fires only when two principal ports meet, touching nothing global) and **strong
confluence** (independent rewrites commute). Locality + confluence ⇒ every active pair can fire at
once with no synchronization. That is the entire source of "automatic" parallelism, and Taelin
sharpened it himself: HVM is not really interaction *nets* but a term-level Interaction Calculus with
the same local, confluent reduction. The graph is one representation of an algebraic property.

**The soundness boundary — the oracle.** The hard, classical fact: the naive sharing-graph reduction
of λ-terms is *not* correct in general, and the single hard question is "how do two meeting
duplicators reduce." Solving it in full requires bookkeeping machinery (brackets/croissants — the
*oracle*), whose overhead is real and, for the general case, provably not even elementary. The
escape is a **type discipline**: λ-terms typeable in Elementary Affine Logic reduce correctly
*without* the oracle. EAL is precisely the oracle-free-safe fragment. Bend silently expresses a
subset of it. **That boundary is not a first-class, checkable object in Bend — and that is the
opening this whole project is about.**

**The reframe that holds up.** "Invariant-first" is too broad to be a thesis. The strong, defensible
version is **substructural**: you obtain a guarantee by *removing the structural rule* that would let
you violate it, so the violation becomes inexpressible rather than merely forbidden. Linearity (drop
unrestricted contraction) makes unsafe duplication unwriteable; an annihilating dioid zero (drop the
ability to climb back from ⊥) makes a veto unforgeable; acyclicity (drop the order) makes a
single-pass cycle impossible. Linear logic is the canonical instance. This frame comes with theorems
attached, which "invariant calculus" never does.

---

## Part II — Where Bend leaves room

1. **The sound fragment is implicit.** "Will this duplicate correctly under parallel reduction?" is
   answered at runtime by surprise, not at compile time by a checker.
2. **Cost is opaque.** Interaction nets have irregular memory access; the programmer gets no model of
   *why* a program was slow, or that it will be.
3. **The runtime is illegible.** No static read on the parallelism found or the recursion depth.
4. **The loop isn't closed.** Search (SupGen) doesn't feed back to make the next run cheaper.

---

## Part III — The design

### The invariants

| # | Invariant | Guarantees | Status (see Part IV) |
|---|-----------|------------|----------------------|
| **I1** | **Affine use.** A binder is used ≤1 time unless consumed by an explicit `Dup`. | Marks every duplication. | A **source discipline**, *not* a soundness certificate (see correction). |
| **I2** | **Label coherence.** Each sharing carries a label; independent `Dup`s don't share one. | Names which fan pairs with which. | Same. Necessary, not sufficient. |
| **I3** | **κ (cyclicity).** Back-edges in the binding-dependency graph. κ=0 ⇒ single-pass; κ>0 ⇒ fixpoint. | Tells you where reduction goes sequential. | Implemented; honest as a routing signal. |
| **I4** | **Metered cost.** Reduction is counted, with time and space vetoes. | Cost becomes first-class and boundable. | Implemented (`weave.mjs`); cost-as-type prototyped (`weave-classify.mjs`). |
| **I5** | **Floor.** A program past a hard bound (budget, space, capability) is *annihilated*, not down-ranked. | No score resurrects an unsafe program. | Implemented — the box-and-box 0̄ pattern, applied to time and space. |

### The rules

Reduction is the Interaction-Calculus rule set: `APP-LAM` (β), `APP-SUP` (application commutes through
a superposition), `DUP-SUP` (annihilate on equal labels, commute on distinct), `DUP-LAM` and
**`DUP-APP`** (a duplicator commutes past a lambda *and* past an application), and `DUP-COPY`
(duplicating a variable or any superposition-free normal term is a structural copy). `DUP-APP` was
added after differential testing — see the correction below. These rules are local and confluent, so
I3/I4 are meaningful and parallelism is free.

### The closed loop

Superposed search finds correct programs; equality-saturation-style rule induction over the I4 cost
model extracts cheap ones; each feeds the other. `weave.mjs`'s `evolve()` shows the smallest honest
version: round 1 discovers an XOR circuit the hard way, it's induced as a primitive, round 2 finds
the same target at a fraction of the search. This mirrors the PRISM↔Graphonomous interlock as a
compiler architecture. (The toy models subexpression sharing, not HVM's deeper test-application
collapse; the real engine is HVM.)

---

## Part IV — What runs, and the honest ledger

**Validated:**
- The reducer is sound on every term tested: a 12-term battery (`weave-validate.mjs`, 12/12) plus
  ~3000 random simply-typed terms (`weave-proptest.mjs`, zero divergences) plus Church arithmetic.
- The cost cliff is real and measured (`weave-cost.mjs`): addition linear, multiplication
  polynomial, exponentiation towers detonate.
- A static classifier (`weave-classify.mjs`) predicts the rung — poly / exp / tower — from type
  structure *before running*, and the prediction matches the measured cliff.

**Corrected by testing (claims retracted):**
- Church multiplication was once called the "two-meeting-fans oracle boundary." Wrong: it was a
  missing `DUP-APP` commutation rule, now fixed. No boundary is known within the tested fragment.
- **I1 + I2 are not sufficient for soundness.** `checkInvariants` accepts the linearized `mul c2 c3`
  while a naive reducer mis-evaluates it (a superposition trapped behind a neutral). They are a
  source-level discipline; the soundness guarantee needs the EAL/stratification typing below.

**Heuristic, not yet theorem:**
- `weave-classify` uses STLC type-order as the rank proxy. Principled (higher-order iteration climbs
  the Grzegorczyk hierarchy) and validated on these families, but an under-approximation of full
  Elementary/Light-Affine inference; it reports the ladder *rung*, not the polynomial degree, and is
  silent on terms that aren't simply-typable.

---

## Part V — The thesis as far as it's earned, and the one next step

The earned core is substructural and narrow: **the safety invariant and the cost guarantee are the
same object.** Linearity-with-stratification simultaneously (a) makes reduction sound, (b) licenses
the oracle-free fast path, and (c) grades cost. These are not three features built separately; they
fall out of one structural restriction. Two of those faces now have running artifacts —
soundness (`weave-validate`) and cost (`weave-classify`). The other two things sometimes bundled into
the pitch — functional-correctness against a spec, and a faithfully-modal permission layer — are
*different* disciplines (Curry–Howard; deontic/modal logic) and are **not** evidenced here. The claim
is exactly this large and no larger.

**The single next step** that converts the cost classifier from validated heuristic to certified
bound: replace the STLC-type-order proxy with real Elementary/Light-Affine inference (Baillot–Terui;
decidable, polynomial). Then the rung carries a theorem (EAL ⟺ elementary, LAL ⟺ polynomial), the
soundness gap from Part IV closes (the same typing that bounds cost is what licenses oracle-free
reduction), and the analysis stops going silent on harder terms. That is the version you hand a
performance-obsessed audience: feed a program in, get back its complexity rung *and* a "safe on the
fast path" verdict, before a single interaction fires.

---

### References
- Lafont (1997), *Interaction Combinators*. Mazza, symmetric interaction combinators (2-SIC).
- Asperti, *About the efficient reduction of lambda terms*; Coppola–Martini; Baillot–Terui (EAL/LAL inference, decidable & polynomial).
- Girard, Linear Logic / Light Linear Logic; Terui, light-affine polytime strong normalization.
- Willsey et al. (POPL 2021), *egg: Fast and Extensible Equality Saturation*.
- Taelin, *Interaction Calculus*; HVM/SupGen notes.
