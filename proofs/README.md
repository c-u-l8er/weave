# Proofs — the thesis, checkable without running anything

Weave makes **one** claim, in three faces:

> A single structural restriction — *linearity with stratification* — simultaneously
> (1) makes reduction **sound**, (2) licenses the **oracle-free fast path**, and
> (3) **grades cost**. The safety invariant and the cost guarantee are the same object.
> Packaged for the [&] stack, it is the **resource rung** turned from a runtime meter into a
> **static cost certificate** computed *before* a computation runs. **Cost is a type, not a measurement.**

This directory lets you verify that claim by *reading committed text* — no Node, no HVM4, no Elixir.
There are two complementary artifacts, from weakest to strongest form of "observable":

| Artifact | What it gives you | How you check it |
|---|---|---|
| [`RECEIPTS.txt`](RECEIPTS.txt) | A curated bundle whose numbers you can **re-derive with pencil arithmetic** | finite differences, column scans, integer equality — **by hand** |
| [`transcripts/`](transcripts/) | The **exact stdout of every script**, one file each, claim-by-claim | read the headline numbers; re-run to confirm |

Regenerate everything:

```
node proofs/generate.mjs              # rebuilds RECEIPTS.txt (deterministic)
node tools/regenerate-proofs.mjs      # rebuilds transcripts/*.txt
node tools/regenerate-proofs.mjs --check   # CI: fail if any transcript drifted from the code
```

If a committed file differs from what you regenerate, the proof was fabricated. It is not.

---

# Part A — `RECEIPTS.txt`: check it by hand

[`RECEIPTS.txt`](RECEIPTS.txt) is built by [`generate.mjs`](generate.mjs) and is designed so a
skeptical reader needs *only arithmetic*. Three independent arms:

### ARM 1 — the cost ladder (static grade predicts measured growth)

For each family it prints the **static** EAL depth/rung (from the term's type, no execution) beside
the **measured** interaction count `I(n)` at operand sizes `n = 2..7`:

```
FAMILY                  EAL depth  static rung   I(2..7)
plus c_n c_n            1          polynomial    [   9,  11,  13,  15,  17,  19 ]
mul c_n c_n             1          polynomial    [  13,  25,  41,  61,  85, 113 ]
mul (mul c_n c_n) c_n   1          polynomial    [  29,  72, 151, 278, 465, 724 ]
pow c_2 c_n  (= 2^n)    2          exponential   [  18,  33,  56,  95, 166, 301 ]
```

**Check by hand (finite differences).** A degree-`d` polynomial has a *constant* `d`-th forward
difference. Subtract adjacent entries until the row goes constant; the order it does is the degree:

```
mul c_n c_n
  Δ^0   13   25   41   61   85  113
  Δ^1      12   16   20   24   28
  Δ^2          4    4    4    4      ← constant ⟹ degree 2
```

`plus` goes constant at `Δ^1` (degree 1); `mul∘mul` at `Δ^3` (degree 3); `pow c_2 c_n` **never** goes
constant — its differences keep doubling (`8,16,32,64…`), the signature of `2^n`. The static EAL rung
column was computed **without looking at these numbers** and names the same class. *That agreement is
the receipt.*

### ARM 2 — soundness alignment (the falsifiable predicate)

> No term the classifier calls `rung ≤ 1` detonates, and every detonation is `rung ≥ 2`.

The receipts list terms that try to break it. **Check by hand:** scan the last two columns — every
`DETONATED` row must be `rung ≥ 2`, and no row may be tagged `*** VIOLATION ***`. A single
counterexample would refute the resource rung; the bundle shows `0` on this population. (Note `c4 c2`
is *flagged* exponential yet still finishes — being graded costly does not require detonation; it
requires that **cheap is never a lie**.)

### ARM 3 — independent engine (cross-runtime corroboration)

Each term is decoded to an integer and evaluated **two unrelated ways** — Weave's toy reducer and the
real **HVM4** runtime (a separate C codebase). **Check by hand:** the three numeric columns must be
identical on every row. Two reducers with no shared code agreeing is independent evidence the
semantics — and thus the cost grade defined over them — are real.

> ARM 3 is a **snapshot**: it needs the HVM4 binary (`~/hvm4/src/hvm`, or `HVM4_BIN=…`). Without it the
> generator prints `SKIPPED` and ARMs 1–2 (which need nothing external) still stand. The committed
> `RECEIPTS.txt` was generated on a machine with HVM4 built.

| Arm | Question | Checkable by |
|---|---|---|
| 1 | Does the static grade predict real growth? | finite differences (subtraction) |
| 2 | Is the cheap verdict ever a dangerous lie? | scanning two columns for a violation |
| 3 | Is the underlying computation correct at all? | comparing three equal integers |

---

# Part B — `transcripts/`: the exact output of every script

Each face of the thesis is also backed by a runnable script; [`transcripts/`](transcripts/) commits its
exact stdout (with a header stamping command, date, Node version, exit code). Numbers below are copied
from those files; `tools/regenerate-proofs.mjs --check` fails if the code ever drifts from them.

### Claim 1 — the reducer is **sound**

| Evidence | Transcript | Headline |
|---|---|---|
| 12-term differential battery vs normal-order reference | [`validate.txt`](transcripts/validate.txt) | **`12/12 passed`** |
| Checker-gated property test, random simply-typed terms | [`proptest.txt`](transcripts/proptest.txt) | `match 3000` · **`DANGEROUS … : 0`** |
| Structural recursion (`fold`) vs JS ground truth | [`fold-test.txt`](transcripts/fold-test.txt) | **`1200 pass, 0 fail`** |

### Claim 2 — the cost cliff is real and source size cannot see it

[`cost.txt`](transcripts/cost.txt): `plus c2 c2` (src 35) → **9** interactions; `c2 c2 c2 c2`
(src **39**, *bigger*) → **detonates** (`over-space`). Length is not a cost signal; iteration depth is.

### Claim 3 — a static verdict predicts the cliff before the term runs

| Evidence | Transcript | Headline |
|---|---|---|
| Static rank vs dynamic cost, side by side | [`classify.txt`](transcripts/classify.txt) | `tower(4)` flagged `rank 4 non-elementary` **before** its `OVER-SPACE` |
| Adversarial + ~2000 random terms; falsifiable predicate | [`soundness.txt`](transcripts/soundness.txt) | **`rank<=1 terms that detonated: 0`** |

### Claim 4 — the proxy becomes a **certificate** (EAL box decoration)

| Evidence | Transcript | Headline |
|---|---|---|
| EAL box decoration; depth = certified tower height | [`eal.txt`](transcripts/eal.txt) | `tower(5)` → `depth 5` + per-binder box certificate |
| Certificate vs measured cost; oracle-free-safe witness | [`eal-test.txt`](transcripts/eal-test.txt) | cost/residue/agreement failures all **0** |
| Polynomial **degree** inside the depth-1 rung | [`eal-degree.txt`](transcripts/eal-degree.txt) | degree **1 / 2 / 3** for add / mul / mul-of-mul |

### Claim 5 — the certificate is **substrate-independent** (HVM4)

| Evidence | Transcript | Headline |
|---|---|---|
| Term → HVM source → term′, NF preserved (no binary needed) | [`hvm4.txt`](transcripts/hvm4.txt) | **`8/8 round-trips`** |
| Differential vs the real HVM4 binary | [`hvm4-run.txt`](transcripts/hvm4-run.txt) | **`6/6 terms agreed`** (env-gated) |
| Elixir `defweave` surface lowering to the backend | [`surface.txt`](transcripts/surface.txt) | `add c2 c3 ⇒ c5` (env-gated) |

### Claim 6 — the certificate **governs** (Weave → box-and-box, the stack end to end)

| Evidence | Transcript | Headline |
|---|---|---|
| `defweave` programs → static cost certificate → box-and-box floor → execution | [`govern.txt`](transcripts/govern.txt) | naive utility-max → 💥 **detonation**; the [&] agent → **210** (env-gated) |

The full arc, in one run: four plans are authored in Elixir and **statically** certified by Weave (rank
from the type, no execution). box-and-box **annihilates** (`0̲`) the two exponential plans — including the
highest-utility one — leaving the polynomial `sum_big`, which is then **executed** to a real answer
(`210`, 157 interactions). Finally the refused tower is run anyway and **detonates** (`over-space`, 623
interactions) — proving the static refusal was right. This is "*wired into `govern()`, a computation that
can't be certified within budget becomes `0̄` — annihilated, not down-ranked*" made executable: the
verdict is taken from the certificate's **rung**, never by running the program. Cost is a type, and the
type — not the utility heuristic — decides. The Node adapter is `box-and-box/examples/weave-resource-rung.mjs`.

The core demo [`weave.txt`](transcripts/weave.txt) shows all three faces together (reducer + invariant
checker + closed loop).

---

## The honest ledger (carried into the proof, not buried)

- Soundness is empirical over the tested population, **not** a mechanized theorem.
- `classify`'s rank is a validated **proxy**; `eal` upgrades it to a certificate only on the inferable
  fragment and **abstains** (`eal:false`, no bound) elsewhere — never "proven non-elementary".
- The polynomial **degree** is measured; static LAL §-box inference is the named next step.
- `hvm4-run` and `surface` depend on external tools and won't regenerate on a bare checkout — which is
  exactly why their output is committed here.

The claim is exactly this large and no larger — and now you can check each piece by reading a file.
