(function(){
"use strict";
const form=document.getElementById("benchmark-form");
const metric=document.getElementById("benchmark-metric");
const value=document.getElementById("benchmark-value");
const pct=document.getElementById("benchmark-percentile");
const copy=document.getElementById("benchmark-copy");
const bars=document.getElementById("tier-bars");
const count=document.getElementById("tier-count");
function fmt(n){const x=Number(n);return Number.isFinite(x)?x.toFixed(1)+" /s":"—";}
function renderTiers(q){
  bars.replaceChildren();
  if(!q||!q.count){
    const x=document.createElement("div");x.className="loading";x.textContent="No benchmark data yet.";bars.appendChild(x);return;
  }
  count.textContent=q.count.toLocaleString()+" PLAYERS";
  const rows=[
    ["Median","p50",50],
    ["Top 25%","p75",75],
    ["Top 10%","p90",90],
    ["Top 5%","p95",95],
    ["Top 1%","p99",99]
  ];
  rows.forEach(([label,key,width])=>{
    const row=document.createElement("div");row.className="benchmark-row";
    const a=document.createElement("span");a.textContent=label;
    const track=document.createElement("div");track.className="benchmark-track";
    const fill=document.createElement("div");fill.className="benchmark-fill";fill.style.width=width+"%";
    const v=document.createElement("div");v.className="benchmark-value";v.textContent=fmt(q[key]);
    track.appendChild(fill);row.append(a,track,v);bars.appendChild(row);
  });
}
fetch("/api/stats",{cache:"no-store"})
.then(r=>{if(!r.ok)throw new Error();return r.json()})
.then(data=>renderTiers(data.benchmarks?.averageSpeed))
.catch(()=>{
  bars.replaceChildren();
  const x=document.createElement("div");x.className="loading error-note";x.textContent="Live tiers are temporarily unavailable.";bars.appendChild(x);
});
form.addEventListener("submit",async event=>{
  event.preventDefault();
  const n=Number(value.value);
  if(!Number.isFinite(n)||n<0){value.focus();return;}
  pct.textContent="…";
  copy.textContent="Comparing your result with the current leaderboard population…";
  try{
    const response=await fetch("/api/benchmark?metric="+encodeURIComponent(metric.value)+"&value="+encodeURIComponent(n),{cache:"no-store"});
    if(!response.ok)throw new Error();
    const data=await response.json();
    const p=Number(data.percentile)||0;
    const top=Math.max(0,100-p);
    pct.textContent=p.toFixed(1)+"%";
    if(!data.total){
      copy.textContent="There is not enough leaderboard data for a comparison yet.";
      return;
    }
    if(p>=99) copy.textContent="That result is around the top 1% of "+data.total.toLocaleString()+" registered competitors in this metric.";
    else if(p>=95) copy.textContent="That result is around the top "+top.toFixed(1)+"% of "+data.total.toLocaleString()+" registered competitors.";
    else if(p>=50) copy.textContent="You are ahead of roughly "+p.toFixed(1)+"% of "+data.total.toLocaleString()+" registered competitors.";
    else copy.textContent="You are currently ahead of roughly "+p.toFixed(1)+"% of "+data.total.toLocaleString()+" registered competitors. There is room to cook.";
  }catch(error){
    pct.textContent="—";
    copy.textContent="The live benchmark is temporarily unavailable. Your game data is unaffected.";
  }
});
})();