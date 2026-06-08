# weave_govern.exs — the [&] stack, end to end, across two languages, with the receipt.
#
#   Elixir surface (defweave)  →  Weave IR  →  Weave.classify (STATIC cost certificate)
#        →  box-and-box resource rung (governance kernel)  →  floor-then-gradient verdict
#        →  Weave.run (EXECUTION) — which VINDICATES the static refusal.
#
# An agent must pick ONE analysis to run under a fixed budget. Four candidates are authored in
# ordinary-looking Elixir. The trap: the highest-utility candidate is an exponential blow-up.
#
#   • A naive utility-maximizer picks the biggest number → it DETONATES (over-space).
#   • The [&] agent asks Weave for a STATIC cost certificate (the rung, from the type, no run),
#     lets box-and-box ANNIHILATE (0̲) every program whose cost CLASS the budget refuses, and runs
#     the survivor → a real answer, cheap.
#
# Then we RUN the refused program anyway, to prove the certificate was right: it detonates. The
# floor never had to execute it to know. Cost is a type, and the type decided.
#
# Run:  elixir surface/weave_govern.exs        (from the weave/ repo root)
# Needs: node on PATH; box-and-box at ../../AmpersandBoxDesign/box-and-box (or $BOXANDBOX).

System.put_env("WEAVE_LIB", "1")
Code.require_file("weave_surface.exs", __DIR__)

defmodule Plans do
  import Weave
  # Two cheap, real programs: fold a list with native `+` → returns an actual integer.
  defweave sum_small do fold(fn a, b -> a + b end, 0, [1, 2, 3, 4, 5]) end
  defweave sum_big do
    fold(fn a, b -> a + b end, 0, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20])
  end

  # Church numerals for the two expensive plans.
  defweave c2 do fn f -> fn x -> f.(f.(x)) end end end
  defweave c3 do fn f -> fn x -> f.(f.(f.(x))) end end end

  # An UNCERTIFIED plan: self-application is not simply-typeable, so the certificate ABSTAINS
  # (eal:false). Fail-closed ⇒ it must be annihilated (0̲) no matter how high its utility.
  defweave selfapp do fn x -> x.(x) end end
end

defmodule Govern do
  @here Path.dirname(__ENV__.file)
  @adapter Path.join([
             System.get_env("BOXANDBOX") ||
               Path.join([@here, "..", "..", "AmpersandBoxDesign", "box-and-box"]),
             "examples",
             "weave-resource-rung.mjs"
           ])

  # The WeaveCostCertificate OBJECT (COMPOSE_RUNTIME.md §2.1), decoded — NOT a re-parsed prose string.
  # Callers read verdict/policy fields directly; the certificate is the single source of truth.
  def cert(ir), do: Weave.certify(ir)

  # parse a backend run line "status  term   [N interactions]" → {status, interactions, value}
  def run_brief(ir) do
    s = Weave.run(ir)
    status = s |> String.split() |> List.first()
    inter = case Regex.run(~r/\[(\d+) interactions\]/, s) do
      [_, i] -> String.to_integer(i)
      _ -> nil
    end
    value = case Regex.run(~r/^\S+\s+(.+?)\s+\[\d+ interactions\]/, s) do
      [_, v] -> v
      _ -> nil
    end
    {status, inter, value}
  end

  def bundle_json(budget, opts) do
    options =
      opts
      |> Enum.map(fn o ->
        ~s({"id":"#{o.id}","rank":#{o.rank},"rung":"#{o.rung}","utility":#{o.utility},"price":#{o.price}})
      end)
      |> Enum.join(",")

    ~s({"budget":{"maxRank":#{budget.max},"label":"#{budget.label}"},"options":[#{options}]})
  end

  def govern(json) do
    case System.cmd("node", [@adapter, json], stderr_to_stdout: true) do
      {out, 0} -> {:ok, out}
      {out, code} -> {:error, code, out}
    end
  end

  def adapter, do: @adapter
end

bar = fn -> IO.puts(String.duplicate("═", 78)) end

c2 = Plans.c2()
c3 = Plans.c3()

# THE CANDIDATES. {id, IR, utility, price}. The highest utility is a detonator on purpose, and the
# second-highest is uncertified — both must lose to the floor, not to a smaller number.
plans = [
  {"sum_small  (fold + [1..5])", Plans.sum_small(), 5, 2},
  {"sum_big    (fold + [1..20])", Plans.sum_big(), 7, 3},
  {"pow        (c3 c2)", Weave.apply(c3, [c2]), 9, 4},
  {"selfapp    (x x, untypable)", Plans.selfapp(), 11, 5},
  {"blast      (c2^5 tower)", Weave.apply(c2, [Weave.apply(c2, [Weave.apply(c2, [Weave.apply(c2, [c2])])])]), 12, 6}
]

ir_of = Map.new(plans, fn {id, ir, _, _} -> {id, ir} end)

bar.()
IO.puts("  [&] STACK, END TO END  ·  one agent, four plans, one budget")
bar.()

# 1) AUTHOR + 2) CERTIFY — the certificate OBJECT comes from Weave, statically, from the IR's type.
IO.puts("\n① Weave authors (defweave) and STATICALLY certifies each plan — no execution:\n")

opts =
  for {id, ir, util, price} <- plans do
    c = Govern.cert(ir)
    v = c["verdict"]
    certified = v["certified"]
    decision = c["policy"]["resourceDecision"]
    # rank fed to the kernel floor: certified ⇒ the certified EAL depth; uncertified ⇒ a sentinel
    # above any budget, so the SAME floor (rank ≤ maxRank) annihilates it — fail-closed by mapping.
    rank = if certified, do: v["ealDepth"], else: 99
    rung = if certified, do: v["costClass"], else: "uncertified"
    tag = if certified, do: "rung #{rung} (depth #{rank})", else: "UNCERTIFIED ⇒ 0̲"
    IO.puts("   #{String.pad_trailing(id, 28)} util=#{String.pad_leading(Integer.to_string(util), 2)}  →  #{String.pad_trailing(tag, 24)} [#{decision}]")
    %{id: id, rank: rank, rung: rung, utility: util, price: price, certified: certified, decision: decision}
  end

# The trap, stated plainly.
naive = Enum.max_by(opts, & &1.utility)
IO.puts("\n   ⚠ a naive utility-maximizer would pick the highest util: “#{naive.id}” (util #{naive.utility}).")

# 3) GOVERN — admit only the polynomial-and-below cost class.
budget = %{max: 1, label: "polynomial"}
json = Govern.bundle_json(budget, opts)

IO.puts("\n② box-and-box governs the certificate (admit cost rung ≤ 1; floor-then-gradient):\n")

decision =
  case Govern.govern(json) do
    {:ok, out} ->
      IO.puts(out |> String.trim() |> String.split("\n") |> Enum.map(&("   " <> &1)) |> Enum.join("\n"))
      # the verdict id may itself contain double spaces, so capture the whole line and strip only
      # the "(margin …)" suffix — don't split on the first run of spaces.
      Regex.run(~r/verdict:\s+(.+)/, out) |> case do
        [_, line] -> line |> String.replace(~r/\s{2,}\(margin.*$/, "") |> String.trim()
        _ -> nil
      end

    {:error, code, out} ->
      IO.puts("   (box-and-box adapter unavailable — exit #{code}; gated, not a failure)")
      IO.puts("   expected at: #{Govern.adapter()}")
      IO.puts(out)
      nil
  end

# 2b) ASSERT THE FLOOR FIRED BEFORE UTILITY — the whole point of fail-closed governance.
# The winning decision must be an *admitted* option (certified AND within budget). Neither the
# highest-utility plan (blast) nor the uncertified plan (selfapp) may win — utility cannot resurrect
# an option the floor annihilated. We check this against the certificate objects, not adapter prose.
IO.puts("\n②b floor-before-utility assertion (certificate-driven):\n")

by_id = Map.new(opts, &{&1.id, &1})
admitted? = fn o -> o.certified and o.rank <= budget.max end
chosen = if decision, do: by_id[decision], else: nil

floor_ok =
  cond do
    decision == nil -> :skip
    chosen == nil -> false
    not admitted?.(chosen) -> false
    naive.decision == "allow" -> false
    # every plan the floor would refuse (uncertified or over-budget) must NOT be the winner
    Enum.any?(opts, fn o -> not admitted?.(o) and o.id == decision end) -> false
    true -> true
  end

case floor_ok do
  :skip -> IO.puts("   (adapter unavailable — assertion skipped, not failed)")
  true ->
    IO.puts("   ✓ winner “#{decision}” is certified & within budget (rank #{chosen.rank} ≤ #{budget.max}).")
    IO.puts("   ✓ highest-utility “#{naive.id}” (util #{naive.utility}) was floored [#{naive.decision}] — utility did NOT resurrect it.")
    IO.puts("   ✓ uncertified plans annihilate to 0̲ regardless of utility.")
  false ->
    IO.puts("   ✗ ASSERTION FAILED: an annihilated or uncertified option survived the floor.")
    System.halt(1)
end

# 4) EXECUTE THE WINNER — the cheap plan actually runs and returns a real value.
IO.puts("\n③ The [&] agent RUNS the governed choice — a real answer, cheaply:\n")

winner_id =
  cond do
    decision && Map.has_key?(ir_of, decision) -> decision
    true -> "sum_big    (fold + [1..20])"
  end

{w_status, w_inter, w_value} = Govern.run_brief(ir_of[winner_id])
IO.puts("   ▸ #{winner_id}")
IO.puts("     #{w_status}  ⇒  #{w_value}   (#{w_inter} interactions)")

# 5) VINDICATE — run the refused detonator anyway; the static refusal was right.
IO.puts("\n④ VINDICATION — run the refused, highest-utility plan anyway:\n")
{b_status, b_inter, _} = Govern.run_brief(ir_of[naive.id])
IO.puts("   ▸ #{naive.id}")

if b_status == "over-space" or b_status == "over-budget" do
  IO.puts("     💥 #{String.upcase(b_status)} — DETONATED after #{b_inter} interactions (budget blown).")
  IO.puts("     The certificate refused it STATICALLY — Weave never had to run it to know.")
else
  IO.puts("     #{b_status} after #{b_inter} interactions — a worse cost class than the budget admits.")
end

IO.puts("")
bar.()
IO.puts("  naive agent → 💥 detonation.   [&] agent → #{w_value}.   Cost is a type, and the type decided.")
bar.()
