# Weave and the [&] stack — positioning, gaps, and the integration plan

*A review written after box-and-box, OpenSentience, and HVM4's early-preview release came into
frame. It repositions Weave inside the stack, grades the whole stack against the canonical agent-OS
reference architecture to answer "what else does the house need," and specifies the one integration
that ties the cost work to the kernel. Companion to `README.md` and `weave-design.md`.*

---

## 0. What changed

Weave was built as "a better Bend." With box-and-box and OpenSentience in view, that framing is
wrong, and keeping it would mislead. **Weave is not a Bend/HVM competitor.** It is R&D into one rung
of the [&] stack — the **resource rung** (the affine ledger, *"can we afford it"*) — and
specifically into the piece box-and-box does not yet have: a **static cost certificate** computed
*before* a computation runs, rather than a runtime meter read *after*.

Re-read every Weave artifact through that lens. The reducer, the invariant checker, the cost
classifier, the Elixir surface — they are a deep probe of what it takes to make the resource rung's
verdict *certified* instead of *asserted*. They were never a runtime play, and they don't need to be.

---

## 1. The stack, as it actually is

A compressed, accurate map (from ampersandboxdesign.com and opensentience.org), so the positioning
is grounded rather than remembered:

- **box-and-box — ring 0, the governance kernel.** Eight modal rungs, each a small algebra with
  stated laws (alethic/feasibility, deontic/permission, axiological/preference, temporal,
  resource, epistemic, strategic, reflexive), composed by one bridge in fixed precedence —
  `feasible ▸ permitted ▸ best` — over an **un-weakenable floor**: a vetoed option becomes `0̄`, and
  `u ⊗ 0̄ = 0̄`, so no downstream utility can resurrect it. Every verdict ships a certificate.
  97 property-tested laws × 2000 trials. Ships as the `box-and-box` npm package (zero-dependency,
  deterministic) plus an Elixir/OTP reference host.
- **Userland (runs on the kernel).** Graphonomous (`&memory` — continual-learning knowledge graphs;
  shipped; LongMemEval 92.6%), Deliberatic (`&reason` — deliberation with Merkle-chained proofs),
  TickTickClock (`&time`), GeoFleetic (`&space`), Delegatic / AgenTroMatic (orchestration / IPC).
- **Cross-cutting.** PULSE (the temporal/loop algebra — the clock), PRISM (the profiler/benchmark —
  the gauge), SCOPE (the spatial bounds), Embodiment (the sensorimotor loop), and **κ-routing**
  (cyclicity as a cognition signal — κ=0 retrieve in one pass, κ>0 deliberate; proved exhaustively
  on 1,926,351 finite systems).
- **Weave.** A deep dive into the **resource rung** — the affine ledger made into a static cost
  certificate. Not on the public map yet, because it's research, not a product.

---

## 2. Does the house have all its utilities?

You asked the right question: a house needs electrical, plumbing, HVAC — what else does the stack
require, if anything? The disciplined way to answer is to grade against a published reference rather
than improvise a wishlist. The reference is the **AIOS LLM-agent operating system** (Rutgers, COLM
2025) — the same research line OpenSentience cites. Its kernel modules are the checklist.

| AIOS kernel module | What it provides | [&] coverage | Verdict |
|---|---|---|---|
| Syscall interface | agent → kernel calls | `[&]` composition (validate ▸ compose ▸ compile to MCP/A2A); `govern()` is the gate | **covered** |
| Agent scheduler | dispatch / prioritize | PULSE loops + box-and-box axiological (priority) + resource (quota) | **covered** |
| Context manager | snapshot / interrupt / resume in-flight inference | not a named subsystem | **gap (serving-level)** |
| Memory manager | runtime memory | Graphonomous — typed graph, confidence, provenance | **covered, exceeds** |
| Storage manager | persistent store | Graphonomous — SQLite + embeddings | **covered** |
| Tool manager | tool calls | governance-shim tool permission + composition surface | **covered** |
| Access manager | access control between agents | box-and-box deontic + governance shim | **covered, exceeds** (8 rungs vs 1) |
| LLM core(s) | model-agnostic interface | "any model — Claude / GPT / Gemini / local" | **covered** |

**Reading:** the [&] stack meets or exceeds the published reference on every module, and exceeds it
decisively on governance — eight composed modal rungs with certificates where AIOS has a single
access manager. So the honest answer to *"what else does the house need"* is **not "more rooms."**
It needs three specific things, and then it needs occupants.

### Gap 1 — a static cost certificate (the electrical load calculation)
The resource rung answers "can we afford it" as a **runtime ledger** — it prices tokens and compute
as they're spent. What it does not do is certify, *before running*, that a deliberation is total and
sits in a known complexity class. That is exactly what Weave's classifier computes. In the house
metaphor: you don't only put a meter on the panel — you do a load calculation and an inspection so
you know the wiring won't catch fire under load. This is your own idea ("add the cost idea to
symbol-as-system"), and the integration is §3.

### Gap 2 — agent identity & attestation (the front-door lock)
AIOS's access manager controls *what* an agent may touch; neither AIOS nor the [&] stack deeply owns
*who an agent is and how it proves it*. OS-007 names impersonation as a threat and the strategic rung
reasons about coalition ability, but cryptographic agent identity / attestation / provenance-of-the-
actor is not a first-class subsystem. In a multi-agent world this is the front-door lock: a
permission is meaningless if it can't be bound to a verified identity. This is a real, field-wide
gap and a clean place to be early — and it composes with what you have (identity is the precondition
the deontic and strategic rungs quietly assume).

### Gap 3 — context management at the serving layer (probably delegate, don't own)
AIOS's context manager snapshots and resumes in-flight model inference for scheduling efficiency. The
[&] stack governs and remembers but doesn't own this. Honest call: this is a **serving** concern (the
province of vLLM / SGLang-class infrastructure), not a cognition concern. Delegate it to whatever
serves the model rather than build it. Listed for completeness, not as a thing to build.

### The real gap — occupancy
The architecture is *more* complete than the published reference. What it is not is **occupied**: one
shipped userland app (Graphonomous), one proved invariant (κ), one property-tested kernel
(box-and-box), and a large surface of spec/draft. A house passes inspection when its utilities work;
it becomes a home when someone lives in it. The missing thing is users and depth on the few
load-bearing pieces — not additional subsystems. This is the same counsel as the stack review:
**pick the spearhead, don't add rooms.**

---

## 3. The integration: cost as the resource rung's certificate

Weave's classifier and box-and-box's resource rung are the same concern at two different times. The
rung is the **runtime** ledger (what *was* spent). Weave is the **static** certificate (what *can* be
spent, in what complexity class, with a guarantee of termination). Wire them together and the
resource rung gains a pre-flight verdict.

Concretely: `govern(action)` already runs `feasible ▸ permitted ▸ best`. Add a step — before an
action that triggers a deliberation, the resource rung consults a **static cost certificate** for
that deliberation:

- **rank ≤ 1** (polynomial, cheap) → clears the resource gate.
- **rank ≥ 2** (exponential) → routes to escalation, a cheaper plan, or a budget check.
- **no certificate** (the term escapes the total/elementary fragment — e.g. unbounded recursion) →
  treated as `0̄`. Not down-ranked. *Annihilated* — exactly the floor pattern, now applied to
  *cost* the way the existing floor applies to forbidden actions.

The certificate becomes part of the verdict, and the same arithmetic that makes box-and-box's
governance compose makes the cost rung compose with it.

This is also where your three theses lock into one stance instead of three slogans:

- **Symbol as system** — the verdict *is* the arithmetic, not a description of a judgment made
  elsewhere. box-and-box's laws are the specification; Weave's reduction is the meaning.
- **Topology as warrant** — κ licenses the *shape* of the reasoning (retrieve vs deliberate; the
  fault-lines as the decomposition boundaries). The structure is the inference license, not a
  picture of one.
- **Cost as certificate** — the substructural discipline that makes a computation sound on the
  oracle-free fast path is the *same object* that bounds its cost. The certificate isn't a separate
  analysis bolted on; it falls out of the structure.

Three faces, one structural restriction. The Weave design doc already earns this for *soundness +
cost*; the integration extends it to *soundness + cost + governance floor* — with the honest caveat
carried from the earlier review: **the modal rungs above resource are composed, not reduced.** The
floor's annihilation is the only substructural move at the composition layer; deontic, epistemic, and
strategic remain distinct algebras with their own laws. The unification is by the bridge, not by
forcing every rung to be substructural — which is exactly why it holds.

---

## 4. HVM4 as the backend — use the grid, don't build a generator

Weave's reducer is a correctness-only toy; it was never meant to be fast. HVM4 is now on GitHub in
early preview, with ahead-of-time compilation to machine code (including superpositions) and SupGen
built in. The honest move is to **lower Weave's IR to HVM4** rather than reimplement a fast parallel
runtime from scratch. Two facts make this clean:

- **The cost certificate is substrate-independent.** The classifier analyzes the term's *structure*,
  so it certifies the same bound whether the term runs on the toy reducer or on HVM4. Lowering to
  HVM4 is an execution choice, not a correctness dependency — nothing about the certificate changes.
- **HVM4's types are orthogonal to Weave's.** HVM4's type system is for *correctness* (dependent
  types, a proof verifier in the Calculus-of-Constructions lineage). Weave's is for *cost*. They
  compose rather than collide: HVM4 says "well-typed and runs fast," Weave says "total and costs
  ≤ rung k." Together that's "correct, fast, and provably affordable."

The caveat, plainly: HVM4 is **pre-release** — Bend2 was unlaunched and the AOT compiler still in
progress as of early 2026. Building on it means building on a moving foundation. Treat it as a
backend target to *track and prototype against*, not a stable dependency to commit the stack to yet.
The point of keeping the classifier substrate-independent is precisely so this choice stays reversible.

---

## 5. Honest status and the verdict

**Proven / shipped (the receipts):**
- Reducer sound on every term tested — 12/12 differential battery, ~3000 random simply-typed terms,
  Church arithmetic, and 1200/1200 random folds vs ground truth. No counterexample.
- Cost cliff real and measured; the static classifier predicts the rung *before running* and matches.
- Recursion fork decided (structural recursion via `fold`, total, in the elementary fragment);
  primitives + a list ADT in; the Elixir surface writable end-to-end.

**Heuristic, not yet theorem:** the classifier uses STLC type-order as the rank proxy — principled
and validated, but an under-approximation of full Elementary/Light-Affine inference; it reports the
*rung*, not the polynomial degree, and goes silent on terms that aren't simply-typable.

**The single upgrade that matters (updated — EAL has since shipped).** This doc predates
`src/weave-eal.mjs`: the type-order proxy has *already* been promoted to a real EAL box-decoration
certificate (box-nesting depth = certified elementary tower height), validated against measured cost
in `test/weave-eal-test.mjs` (`eal:true` ⟹ no residue, closing the I1+I2 soundness gap), with the
depth-1 polynomial *degree* recovered empirically in `src/weave-eal-degree.mjs`. So the live target is
no longer "replace the STLC proxy with EAL" — it is two distinct, smaller steps: **(1) promote the
existing EAL depth certificate into the resource-rung contract** (a stable, IR-hash-bound certificate
object — see `AmpersandBoxDesign/docs/COMPOSE_RUNTIME.md` §2, which consumes it as `Brick.cost`), and
**(2) static LAL polynomial-degree inference** (Baillot–Terui §-boxes; decidable, polynomial) as the
next *proof* upgrade — EAL certifies the tower height; LAL would certify the degree. The certificate
is what makes Weave a real resource rung; LAL is what turns its degree claim from measured to proven.

**The strategic read (unchanged, and now sharper):** the [&] stack's core idea — governance as an
annihilating-floor algebra, cognition routed by proved topology, every verdict a certificate, and a
"ship the receipts / no hype" discipline — is strong and genuinely differentiated. The risk is *not*
the idea; it is **breadth**. Twelve protocols and six userland products across a half-dozen domains is
too much surface for a small team, and most of it is spec/draft. The spearhead is the governance
kernel (box-and-box, with the "we compose over your OPA/Cedar" wedge) plus κ-routing (the one
mechanism with a proof) plus one shipped app (Graphonomous) as proof-of-life. Weave is the resource
rung's depth, and the cost certificate above is how it earns its place in the kernel. HVM4 is the
backend to track, not a rival to beat.

**Is it worth going after?** Yes — as a focused thing, not as twelve. The architecture is more
complete than the published reference; the differentiation is real; the honesty discipline is a moat
in a hype-saturated field. What's required is depth on the load-bearing pieces, one genuinely missing
utility (agent identity), the cost certificate wired into the resource rung, and occupants. Not more
rooms.

---

### References
- AIOS: *LLM Agent Operating System* (Rutgers; arXiv:2403.16971; COLM 2025) — kernel-module reference.
- Lafont (1997), *Interaction Combinators*; Mazza, symmetric interaction combinators (2-SIC).
- Asperti, *About the efficient reduction of lambda terms*; Baillot–Terui (EAL/LAL inference,
  decidable & polynomial); Terui, light-affine polytime strong normalization.
- Orchard, Petricek, Gaboardi — graded / coeffect type systems (Granule); semiring-indexed resource
  disciplines (the academic home for "the dioid floor and the affine ledger under one frame").
- Taelin / Higher Order Co — HVM4 (early preview), SupGen, Interaction Type Theory.
- ampersandboxdesign.com (box-and-box kernel; 97 laws); opensentience.org (the 12 protocols; the κ proof).
