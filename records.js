(function(){
"use strict";
const list=document.getElementById("records-list");
const heading=document.getElementById("records-heading");
const tabs=Array.from(document.querySelectorAll("[data-records]"));
const updated=document.getElementById("records-updated");
const boards={score:[],average:[],maximum:[]};
let current="score";
const labels={score:"RAW SCORE",average:"AVG SPEED",maximum:"MAX SPEED"};
function fmt(v,cat){
  const n=Number(v);
  if(!Number.isFinite(n)) return "—";
  return cat==="score"?Math.floor(n).toLocaleString():n.toFixed(1)+" /s";
}
function render(){
  list.replaceChildren();
  heading.textContent="TOP 50 — "+labels[current];
  const rows=boards[current]||[];
  if(!rows.length){
    const li=document.createElement("li");li.className="loading";li.textContent="No records yet.";list.appendChild(li);return;
  }
  rows.forEach((row,index)=>{
    const li=document.createElement("li");li.className="records-row";
    const rank=document.createElement("span");rank.className="records-rank";rank.textContent="#"+String(index+1).padStart(2,"0");
    const name=document.createElement("span");name.className="records-name";name.textContent=String(row.username||"Unknown");
    const value=document.createElement("strong");value.className="records-value";value.textContent=fmt(row.value,current);
    const runs=document.createElement("span");runs.className="records-runs";runs.textContent=(Number(row.runs)||0).toLocaleString()+" runs";
    li.append(rank,name,value,runs);list.appendChild(li);
  });
}
tabs.forEach(tab=>tab.addEventListener("click",()=>{
  current=tab.dataset.records;
  tabs.forEach(t=>t.classList.toggle("active",t===tab));
  render();
}));
fetch("/api/records?limit=50",{cache:"no-store"})
.then(r=>{if(!r.ok)throw new Error();return r.json()})
.then(data=>{
  for(const key of ["score","average","maximum"])boards[key]=Array.isArray(data[key])?data[key]:[];
  const d=new Date(Number(data.generatedAt)||Date.now());
  updated.textContent="UPDATED "+d.toLocaleTimeString([], {hour:"numeric",minute:"2-digit"});
  render();
})
.catch(()=>{
  list.replaceChildren();
  const li=document.createElement("li");li.className="loading error-note";li.textContent="Records are temporarily unavailable. Try again later.";list.appendChild(li);
});
})();