// weave-proptest.mjs — checker-gated property testing.
// Generate random simply-typed (hence normalizing) closed lambda-terms, linearize (insert Dups),
// run the static checker, reduce with Weave, and compare to a reference normal-order evaluator.
// We are hunting for the dangerous case: a term the checker ACCEPTS but Weave mis-evaluates.
import { Var, Lam, App, Dup, normalize, checkInvariants } from "../src/weave.mjs";

let C = 0; const nm = (p) => `${p}~${C++}`; let L = 0; const lbl = () => `dl${L++}`;
// ---- reference evaluator (ground truth) ----
const rfv=(t,a=new Set())=>{if(t.tag==="Var")a.add(t.name);else if(t.tag==="Lam"){const i=new Set();rfv(t.body,i);i.delete(t.name);i.forEach(x=>a.add(x));}else if(t.tag==="App"){rfv(t.fun,a);rfv(t.arg,a);}return a;};
const rsub=(t,n,v)=>{if(t.tag==="Var")return t.name===n?v:t;if(t.tag==="App")return App(rsub(t.fun,n,v),rsub(t.arg,n,v));if(t.tag==="Lam"){if(t.name===n)return t;if(rfv(v).has(t.name)){const f=nm(t.name);return Lam(f,rsub(rsub(t.body,t.name,Var(f)),n,v));}return Lam(t.name,rsub(t.body,n,v));}return t;};
const rstep=(t)=>{if(t.tag==="App"){if(t.fun.tag==="Lam")return rsub(t.fun.body,t.fun.name,t.arg);const f=rstep(t.fun);if(f)return App(f,t.arg);const a=rstep(t.arg);if(a)return App(t.fun,a);return null;}if(t.tag==="Lam"){const b=rstep(t.body);return b?Lam(t.name,b):null;}return null;};
const refNF=(t,cap=20000)=>{let n=0;while(true){const s=rstep(t);if(!s)return{term:t,steps:n};t=s;if(++n>cap)return{term:t,diverged:true};}};
// ---- alpha-canonical ----
const canon=(t,e=[])=>{switch(t.tag){case"Var":{const i=e.indexOf(t.name);return i>=0?`#${i}`:`F:${t.name}`;}case"Lam":return`(L ${canon(t.body,[t.name,...e])})`;case"App":return`(${canon(t.fun,e)} ${canon(t.arg,e)})`;case"Sup":return`&{${canon(t.a,e)} ${canon(t.b,e)}}`;case"Dup":return`DUP(${canon(t.val,e)})`;case"Lit":return`lit`;}};
const residue=(t)=>t.tag==="Sup"||t.tag==="Dup"||(t.tag==="Lam"&&residue(t.body))||(t.tag==="App"&&(residue(t.fun)||residue(t.arg)));
const show=(t)=>{switch(t.tag){case"Var":return t.name;case"Lam":return`λ${t.name}.${show(t.body)}`;case"App":return`(${show(t.fun)} ${show(t.arg)})`;default:return"?";}};
// ---- freshen + linearize ----
const fr=(t,e={})=>t.tag==="Var"?Var(e[t.name]??t.name):t.tag==="Lam"?(()=>{const f=nm(t.name);return Lam(f,fr(t.body,{...e,[t.name]:f}));})():t.tag==="App"?App(fr(t.fun,e),fr(t.arg,e)):t;
const occ=(t,n)=>t.tag==="Var"?(t.name===n?1:0):t.tag==="Lam"?(t.name===n?0:occ(t.body,n)):t.tag==="App"?occ(t.fun,n)+occ(t.arg,n):t.tag==="Dup"?occ(t.val,n)+((t.x===n||t.y===n)?0:occ(t.body,n)):0;
const rep=(t,n,names,idx)=>t.tag==="Var"?(t.name===n?Var(names[idx.i++]):t):t.tag==="Lam"?(t.name===n?t:Lam(t.name,rep(t.body,n,names,idx))):t.tag==="App"?App(rep(t.fun,n,names,idx),rep(t.arg,n,names,idx)):t.tag==="Dup"?Dup(t.label,t.x,t.y,rep(t.val,n,names,idx),(t.x===n||t.y===n)?t.body:rep(t.body,n,names,idx)):t;
const lin=(t)=>{if(t.tag==="Var")return t;if(t.tag==="App")return App(lin(t.fun),lin(t.arg));if(t.tag==="Lam"){const b=lin(t.body);const k=occ(b,t.name);if(k<=1)return Lam(t.name,b);const cs=Array.from({length:k},()=>nm(t.name));const b2=rep(b,t.name,cs,{i:0});const mk=(s,ci)=>ci===k-2?Dup(lbl(),cs[k-2],cs[k-1],Var(s),b2):(()=>{const r=nm("r");return Dup(lbl(),cs[ci],r,Var(s),mk(r,ci+1));})();return Lam(t.name,mk(t.name,0));}return t;};

// ---- simply-typed random generator (terms normalize => reference terminates) ----
const O={t:"o"}, Arr=(a,b)=>({t:"arr",a,b});
const teq=(x,y)=>x.t==="o"&&y.t==="o"?true:x.t==="arr"&&y.t==="arr"?teq(x.a,y.a)&&teq(x.b,y.b):false;
const rT=(d)=> d<=0||Math.random()<0.55 ? O : Arr(rT(d-1),rT(d-1));
let g=0; const gv=()=>`v${g++}`;
function gen(ctx,type,fuel){
  const cands=ctx.filter(b=>teq(b.type,type)); const opts=[];
  if(type.t==="arr")opts.push("lam"); if(cands.length)opts.push("var","var"); if(fuel>0)opts.push("app","app");
  if(!opts.length)return null;
  for(let k=0;k<6;k++){
    const c=opts[Math.floor(Math.random()*opts.length)];
    if(c==="var")return Var(cands[Math.floor(Math.random()*cands.length)].name);
    if(c==="lam"){const x=gv();const b=gen([...ctx,{name:x,type:type.a}],type.b,fuel-1);if(b)return Lam(x,b);}
    if(c==="app"){const A=rT(1);const f=gen(ctx,Arr(A,type),fuel-1);if(f){const a=gen(ctx,A,fuel-1);if(a)return App(f,a);}}
  }
  return cands.length?Var(cands[Math.floor(Math.random()*cands.length)].name):null;
}
const targets=[Arr(Arr(O,O),Arr(O,O)),Arr(O,O),Arr(Arr(O,O),O),Arr(Arr(Arr(O,O),O),Arr(O,O))];
function genClosed(){for(let i=0;i<300;i++){const T=targets[Math.floor(Math.random()*targets.length)];const t=gen([],T,6+Math.floor(Math.random()*6));if(t)return t;}return null;}

const sz = (t) => t.tag==="Var"?1 : t.tag==="Lam"?1+sz(t.body) : t.tag==="App"?1+sz(t.fun)+sz(t.arg) : t.tag==="Sup"?1+sz(t.a)+sz(t.b) : t.tag==="Dup"?1+sz(t.val)+sz(t.body) : 1;
function genClosedSmall(){for(let i=0;i<120;i++){const T=targets[Math.floor(Math.random()*targets.length)];const t=gen([],T,3+Math.floor(Math.random()*2));if(t&&sz(t)<=16)return t;}return null;}

const N = 3000, START = Date.now(), TIME = 70000;
let total=0, accepted=0, rejected=0, match=0, budget=0, diverged=0, skipped=0;
const witnesses=[];
for(let i=0;i<N;i++){
  if(Date.now()-START>TIME){console.log(`(time budget hit at term ${i})`);break;}
  if(i%400===0 && i>0) process.stdout.write(`..${i}`);
  const raw=genClosedSmall(); if(!raw){skipped++;continue;} total++;
  try{
    const t0=fr(raw);
    const term=lin(fr(raw));
    if(sz(term)>60){skipped++;continue;}
    const verdict=checkInvariants(term);
    if(!verdict.ok){rejected++;continue;}
    accepted++;
    const ref=refNF(t0,8000); if(ref.diverged){diverged++;continue;}
    const w=normalize(term,{budget:4000});
    if(w.status!=="normal"){budget++;continue;}
    if(residue(w.term)){witnesses.push({why:"residue",src:show(t0),ref:canon(ref.term),got:canon(w.term)}); continue;}
    if(canon(ref.term)===canon(w.term)) match++;
    else witnesses.push({why:"MISMATCH",src:show(t0),ref:canon(ref.term),got:canon(w.term)});
  }catch(e){skipped++;}
}
console.log(`\nusable terms: ${total}  (skipped ${skipped})`);
console.log(`checker:  accepted ${accepted}   rejected ${rejected}`);
console.log(`accepted -> match ${match} | over-budget(4k) ${budget} | ref-diverged ${diverged} | residue/mismatch ${witnesses.length}`);
console.log(`\nDANGEROUS (checker accepted but Weave wrong): ${witnesses.length}`);
for(const w of witnesses.slice(0,6)){console.log(`  [${w.why}] ${w.src}\n     ref = ${w.ref}\n     got = ${w.got}`);}

console.log("\n--- targeted stress (Church arithmetic) ---");
const lam=Lam,v=Var,ap=(...xs)=>xs.reduce((a,b)=>App(a,b));
const cn=(n)=>lam("f",lam("x",Array.from({length:n}).reduce((acc)=>App(v("f"),acc),v("x"))));
const stress=[["c2 c2",ap(cn(2),cn(2))],["c3 c2",ap(cn(3),cn(2))],["c2 c2 c2",ap(cn(2),cn(2),cn(2))],["c2 c3 applied",ap(cn(2),cn(3),lam("w",v("w")))]];
for(const [name,term] of stress){
  try{
    const t0=fr(term); const ref=refNF(t0,200000);
    const w=normalize(lin(fr(term)),{budget:600000});
    const ok = !ref.diverged && w.status==="normal" && !residue(w.term) && canon(ref.term)===canon(w.term);
    console.log(`  ${ok?"PASS":"----"}  ${name.padEnd(16)} ref:${ref.diverged?">cap":ref.steps+"β"}  weave:${w.interactions}i ${w.status}${residue(w.term)?" +RESIDUE":""}`);
    if(!ok && w.status==="normal" && !ref.diverged){console.log(`       ref=${canon(ref.term)}\n       got=${canon(w.term)}`);}
  }catch(e){console.log(`  ERR  ${name}: ${e.message}`);}
}
