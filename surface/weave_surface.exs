# weave_surface.exs — an Elixir macro surface for Weave.
# `defweave` compiles Elixir's own `fn` syntax into the Weave IR (interaction-calculus terms as
# data). It does NOT produce a BEAM closure — the macro intercepts the AST at compile time and emits
# IR, exactly like Nx's `defn` emits a tensor expression for a backend. The existing JS engine
# (weave-backend.mjs) is that backend: it reduces, classifies, and checks the IR. The BEAM only
# orchestrates; the substructural core stays in the IR where the analyzer can see it.

defmodule Weave.Compile do
  # Elixir AST  ->  Weave IR (maps mirroring weave.mjs term shapes)
  def compile({:fn, _, [{:->, _, [args, body]}]}) when is_list(args) do
    args |> Enum.reverse() |> Enum.reduce(compile(body), fn a, acc ->
      %{"tag" => "Lam", "name" => vname(a), "body" => acc}
    end)
  end
  # fold(f, z, list): a Church-encoded list IS its own right fold, so this is just (list f z).
  # This is structural recursion on the list spine — total, no fixpoint, stays in the certified fragment.
  def compile({:fold, _, [f, z, list]}) do
    %{"tag" => "App",
      "fun" => %{"tag" => "App", "fun" => compile(list), "arg" => compile(f)},
      "arg" => compile(z)}
  end
  # native arithmetic -> primitive Op node (strict, type-order 0, contributes nothing to cost rank)
  def compile({op, _, [a, b]}) when op in [:+, :*, :-] do
    %{"tag" => "Op", "op" => opname(op), "a" => compile(a), "b" => compile(b)}
  end
  def compile({{:., _, [f]}, _, xs}) when is_list(xs) do           # f.(x) and f.(x, y)
    Enum.reduce(xs, compile(f), fn x, acc -> %{"tag" => "App", "fun" => acc, "arg" => compile(x)} end)
  end
  def compile({name, _, ctx}) when is_atom(name) and (is_atom(ctx) or is_nil(ctx)) do
    %{"tag" => "Var", "name" => Atom.to_string(name)}
  end
  def compile(n) when is_integer(n), do: %{"tag" => "Lit", "value" => n}
  # list literal -> Church list  \c.\n. c e0 (c e1 (... (c en n)))
  def compile(xs) when is_list(xs) do
    spine = xs |> Enum.reverse() |> Enum.reduce(%{"tag" => "Var", "name" => "n"}, fn x, acc ->
      %{"tag" => "App",
        "fun" => %{"tag" => "App", "fun" => %{"tag" => "Var", "name" => "c"}, "arg" => compile(x)},
        "arg" => acc}
    end)
    %{"tag" => "Lam", "name" => "c", "body" => %{"tag" => "Lam", "name" => "n", "body" => spine}}
  end
  defp vname({n, _, _}) when is_atom(n), do: Atom.to_string(n)
  defp opname(:+), do: "add"
  defp opname(:*), do: "mul"
  defp opname(:-), do: "sub"
end

defmodule Weave do
  @here Path.dirname(__ENV__.file)
  @backend Path.join([@here, "..", "src", "weave-backend.mjs"])

  defmacro defweave({name, _, _}, do: body) do
    ir = Weave.Compile.compile(body)
    quote do
      def unquote(name)(), do: unquote(Macro.escape(ir))
    end
  end

  # combine IRs (so you can apply numerals/ops without a symbol table)
  def app(f, a), do: %{"tag" => "App", "fun" => f, "arg" => a}
  def apply(f, args), do: Enum.reduce(args, f, fn a, acc -> app(acc, a) end)

  # IR -> JSON (dep-free; names are alphanumeric)
  def to_json(%{"tag" => "Var", "name" => n}), do: ~s({"tag":"Var","name":"#{n}"})
  def to_json(%{"tag" => "Lam", "name" => n, "body" => b}), do: ~s({"tag":"Lam","name":"#{n}","body":#{to_json(b)}})
  def to_json(%{"tag" => "App", "fun" => f, "arg" => a}), do: ~s({"tag":"App","fun":#{to_json(f)},"arg":#{to_json(a)}})
  def to_json(%{"tag" => "Op", "op" => op, "a" => a, "b" => b}), do: ~s({"tag":"Op","op":"#{op}","a":#{to_json(a)},"b":#{to_json(b)}})
  def to_json(%{"tag" => "Lit", "value" => v}), do: ~s({"tag":"Lit","value":#{v}})

  # lower to the backend
  def run(ir), do: backend("normalize", ir)
  def classify(ir), do: backend("classify", ir)
  def check(ir), do: backend("check", ir)

  # certify: return the WeaveCostCertificate as a decoded map (binary keys), NOT a prose string.
  # This is the §2.1 contract object — callers consume verdict/policy fields, never re-parse text.
  def certify(ir, mode \\ "production") do
    {out, _} = System.cmd("node", [@backend, "certify", to_json(ir), mode], cd: @here)
    :json.decode(String.trim(out))
  end

  defp backend(op, ir) do
    {out, _} = System.cmd("node", [@backend, op, to_json(ir)], cd: @here)
    String.trim(out)
  end
end

defmodule Demo do
  import Weave
  defweave id  do fn x -> x end end
  defweave c2  do fn f -> fn x -> f.(f.(x)) end end end
  defweave c3  do fn f -> fn x -> f.(f.(f.(x))) end end end
  defweave add do fn m -> fn n -> fn f -> fn x -> m.(f).(n.(f).(x)) end end end end end
  defweave mul do fn m -> fn n -> fn f -> m.(n.(f)) end end end end

  # --- the now-writable surface: native arithmetic, list literals, structural recursion via fold ---
  defweave arith    do (2 + 3) * 4 end
  defweave sumlist  do fold(fn a, b -> a + b end, 0, [1, 2, 3, 4, 5]) end
  defweave prodlist do fold(fn a, b -> a * b end, 1, [1, 2, 3, 4, 5]) end
  defweave sumbig   do fold(fn a, b -> a + b end, 0, [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]) end
end

# The demo runs when this file is the entry point (`elixir weave_surface.exs`). When another
# script reuses these modules via Code.require_file, it sets WEAVE_LIB=1 to suppress the demo.
unless System.get_env("WEAVE_LIB") do
  IO.puts("== surface compiles to IR ==")
  IO.puts("church_two  =>  " <> Weave.to_json(Demo.c2()))
  IO.puts("")
  IO.puts("== analyzer (the backend) reads the IR ==")
  IO.puts("classify add        : " <> Weave.classify(Demo.add()))
  IO.puts("classify mul        : " <> Weave.classify(Demo.mul()))
  IO.puts("check    add        : " <> Weave.check(Demo.add()))
  IO.puts("")
  IO.puts("== reduce, via the backend ==")
  six = Weave.apply(Demo.add(), [Demo.c2(), Demo.c3()])
  IO.puts("add c2 c3   =>  " <> Weave.run(six))
  tower = Weave.apply(Demo.c2(), [Weave.apply(Demo.c2(), [Demo.c2()])])
  IO.puts("classify c2 c2 c2   : " <> Weave.classify(tower))
  IO.puts("reduce  c2 c2        : " <> Weave.run(Weave.apply(Demo.c2(), [Demo.c2()])))
  IO.puts("")
  IO.puts("== writable surface: primitives + list ADT + structural recursion (fold) ==")
  IO.puts("arith    (2+3)*4         =>  " <> Weave.run(Demo.arith()))
  IO.puts("sumlist  [1..5]          =>  " <> Weave.run(Demo.sumlist()))
  IO.puts("prodlist [1..5]          =>  " <> Weave.run(Demo.prodlist()))
  IO.puts("sumbig   [1..20]         =>  " <> Weave.run(Demo.sumbig()))
  IO.puts("")
  IO.puts("classify sumlist         : " <> Weave.classify(Demo.sumlist()))
  IO.puts("classify sumbig [1..20]  : " <> Weave.classify(Demo.sumbig()) <> "   (rank unchanged by length => flat/polynomial)")
  IO.puts("check    sumlist         : " <> Weave.check(Demo.sumlist()))
end
