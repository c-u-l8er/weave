// weave-validate.mjs — differential testing of Weave's reducer against ground-truth beta.
// For each pure lambda-term: (1) reference normal-order normal form; (2) linearize (auto-insert
// Dups for every binder used >1x, unique label each, satisfying I1/I2), reduce with Weave, read
// back. PASS iff the two normal forms are alpha-equal. Any FAIL is a real soundness bug in the
// DUP-LAM / DUP-SUP machinery.
import { Var, Lam, App, Sup, Dup, normalize } from "./weave.mjs";

let C = 0; const nm = (p) => `${p}~${C++}`;
let L = 0; const lbl = () => `dl${L++}`;

// ---- reference: capture-avoiding subst + normal-order normalization (ground truth) ----
const rfv = (t, a = new Set()) => { if (t.tag==="Var") a.add(t.name); else if (t.tag==="Lam"){const i=new Set();rfv(t.body,i);i.delete(t.name);i.forEach(x=>a.add(x));} else if (t.tag==="App"){rfv(t.fun,a);rfv(t.arg,a);} return a; };
const rsub = (t, n, v) => {
  if (t.tag==="Var") return t.name===n?v:t;
  if (t.tag==="App") return App(rsub(t.fun,n,v),rsub(t.arg,n,v));
  if (t.tag==="Lam") { if (t.name===n) return t; if (rfv(v).has(t.name)){const f=nm(t.name);return Lam(f,rsub(rsub(t.body,t.name,Var(f)),n,v));} return Lam(t.name,rsub(t.body,n,v)); }
  return t;
};
const rstep = (t) => {
  if (t.tag==="App") { if (t.fun.tag==="Lam") return rsub(t.fun.body,t.fun.name,t.arg); const f=rstep(t.fun); if(f) return App(f,t.arg); const a=rstep(t.arg); if(a) return App(t.fun,a); return null; }
  if (t.tag==="Lam") { const b=rstep(t.body); return b?Lam(t.name,b):null; }
  return null;
};
const refNF = (t, cap=200000) => { let n=0; while(true){const s=rstep(t); if(!s) return {term:t,steps:n}; t=s; if(++n>cap) return {term:t,steps:n,diverged:true};} };

// ---- alpha-canonical form (de Bruijn) so comparison ignores names ----
const canon = (t, env=[]) => {
  switch (t.tag) {
    case "Var": { const i=env.indexOf(t.name); return i>=0?`#${i}`:`F:${t.name}`; }
    case "Lam": return `(L ${canon(t.body,[t.name,...env])})`;
    case "App": return `(${canon(t.fun,env)} ${canon(t.arg,env)})`;
    case "Sup": return `&{${canon(t.a,env)} ${canon(t.b,env)}}`;
    case "Dup": return `DUP(${canon(t.val,env)})`;
    case "Lit": return `lit:${JSON.stringify(t.value)}`;
  }
};
const hasResidue = (t) => t.tag==="Sup"||t.tag==="Dup" || (t.tag==="Lam"&&hasResidue(t.body)) || (t.tag==="App"&&(hasResidue(t.fun)||hasResidue(t.arg)));

// ---- freshen all binders to unique names ----
const freshen = (t, env={}) => {
  if (t.tag==="Var") return Var(env[t.name] ?? t.name);
  if (t.tag==="Lam") { const f=nm(t.name); return Lam(f,freshen(t.body,{...env,[t.name]:f})); }
  if (t.tag==="App") return App(freshen(t.fun,env),freshen(t.arg,env));
  return t;
};

// ---- linearize: insert Dups so every binder is used <=1x ----
const occ = (t, n) => {
  if (t.tag==="Var") return t.name===n?1:0;
  if (t.tag==="Lam") return t.name===n?0:occ(t.body,n);
  if (t.tag==="App") return occ(t.fun,n)+occ(t.arg,n);
  if (t.tag==="Sup") return occ(t.a,n)+occ(t.b,n);
  if (t.tag==="Dup") return occ(t.val,n)+((t.x===n||t.y===n)?0:occ(t.body,n));
  return 0;
};
const replaceSeq = (t, n, names, idx) => {
  if (t.tag==="Var") return t.name===n?Var(names[idx.i++]):t;
  if (t.tag==="Lam") return t.name===n?t:Lam(t.name,replaceSeq(t.body,n,names,idx));
  if (t.tag==="App") { const f=replaceSeq(t.fun,n,names,idx); const a=replaceSeq(t.arg,n,names,idx); return App(f,a); }
  if (t.tag==="Sup") { const a=replaceSeq(t.a,n,names,idx); const b=replaceSeq(t.b,n,names,idx); return Sup(t.label,a,b); }
  if (t.tag==="Dup") { const v=replaceSeq(t.val,n,names,idx); const bd=(t.x===n||t.y===n)?t.body:replaceSeq(t.body,n,names,idx); return Dup(t.label,t.x,t.y,v,bd); }
  return t;
};
const linearize = (t) => {
  if (t.tag==="Var") return t;
  if (t.tag==="App") return App(linearize(t.fun),linearize(t.arg));
  if (t.tag==="Lam") {
    const body = linearize(t.body);
    const k = occ(body, t.name);
    if (k <= 1) return Lam(t.name, body);
    const copies = Array.from({length:k}, () => nm(t.name));
    const body2 = replaceSeq(body, t.name, copies, {i:0});
    const mk = (src, ci) => ci === k-2
      ? Dup(lbl(), copies[k-2], copies[k-1], Var(src), body2)
      : (() => { const r = nm("r"); return Dup(lbl(), copies[ci], r, Var(src), mk(r, ci+1)); })();
    return Lam(t.name, mk(t.name, 0));
  }
  return t;
};

// ---- battery ----
const v=Var, lam=Lam; const ap=(...ts)=>ts.reduce((a,b)=>App(a,b));
const I=lam("x",v("x")), K=lam("x",lam("y",v("x")));
const S=lam("x",lam("y",lam("z", ap(v("x"),v("z"),App(v("y"),v("z"))))));
const c0=lam("f",lam("x",v("x"))), c1=lam("f",lam("x",App(v("f"),v("x"))));
const c2=lam("f",lam("x",App(v("f"),App(v("f"),v("x")))));
const c3=lam("f",lam("x",App(v("f"),App(v("f"),App(v("f"),v("x"))))));
const succ=lam("n",lam("f",lam("x", App(v("f"), ap(v("n"),v("f"),v("x"))))));
const plus=lam("m",lam("n",lam("f",lam("x", ap(v("m"),v("f"), ap(v("n"),v("f"),v("x")))))));
const mul=lam("m",lam("n",lam("f", App(v("m"), App(v("n"),v("f"))))));
const tru=lam("t",lam("f",v("t"))), fls=lam("t",lam("f",v("f")));
const And=lam("p",lam("q", ap(v("p"),v("q"),v("p")))), Not=lam("p", ap(v("p"),fls,tru));
const W=lam("w",v("w"));

const tests = [
  ["I I", App(I,I)],
  ["K c0 c1", ap(K,c0,c1)],
  ["succ c2  (=c3)", App(succ,c2)],
  ["plus c2 c3  (=c5)", ap(plus,c2,c3)],
  ["mul c2 c3  (=c6)", ap(mul,c2,c3)],
  ["mul c3 c3  (=c9)", ap(mul,c3,c3)],
  ["And tru fls (=fls)", ap(And,tru,fls)],
  ["And tru tru (=tru)", ap(And,tru,tru)],
  ["Not tru (=fls)", App(Not,tru)],
  ["S K K W  (SKK=I)", ap(S,K,K,W)],
  ["c2 c2 W  (2^2 apply)", ap(c2,c2,W)],
  ["plus (succ c1) c2 (=c4)", ap(plus,App(succ,c1),c2)],
];

let pass=0, fail=0;
for (const [name, term] of tests) {
  const t0 = freshen(term);
  const ref = refNF(t0);
  const refC = canon(ref.term);
  const lin = linearize(freshen(term));
  const w = normalize(lin, { budget: 500000 });
  const wC = canon(w.term);
  const residue = hasResidue(w.term);
  const ok = (refC === wC) && w.status === "normal" && !residue;
  if (ok) pass++; else fail++;
  console.log(`${ok?"PASS":"FAIL"}  ${name.padEnd(22)} ref:${ref.steps}β  weave:${w.interactions}i ${w.status}${residue?" +RESIDUE":""}`);
  if (!ok) { console.log(`      ref   = ${refC}`); console.log(`      weave = ${wC}`); }
}
console.log(`\n${pass}/${pass+fail} passed`);
