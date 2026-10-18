(function(){
"use strict";
const $=id=>document.getElementById(id);
const fmt=new Intl.NumberFormat();
function number(value,digits=0){
  const n=Number(value);
  if(!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined,{maximumFractionDigits:digits,minimumFractionDigits:digits});
}
function record(row,type){
  if(!row) return {value:"—",name:"No record yet"};
  return {
    value:type==="score"?fmt.format(Math.floor(row.value)):number(row.value,1)+" /s",
    name:String(row.username||"Unknown")
  };
}
function renderBars(q){
  const root=$("benchmark-bars");
  root.replaceChildren();
  if(!q||!q.count){
    const empty=document.createElement("div");
    empty.className="loading";
    empty.textContent="No benchmark data yet.";
    root.appendChild(empty);
    return;
  }
  const rows=[
    ["25th percentile","p25",25],
    ["Median","p50",50],
    ["75th percentile","p75",75],
    ["Top 10% threshold","p90",90],
    ["Top 5% threshold","p95",95],
    ["Top 1% threshold","p99",99]
  ];
  rows.forEach(([label,key,p])=>{
    const row=document.createElement("div");
    row.className="benchmark-row";
    const a=document.createElement("span");a.textContent=label;
    const track=document.createElement("div");track.className="benchmark-track";
    const fill=document.createElement("div");fill.className="benchmark-fill";fill.style.width=p+"%";
    const v=document.createElement("div");v.className="benchmark-value";v.textContent=number(q[key],1)+" /s";
    track.appendChild(fill);row.append(a,track,v);root.appendChild(row);
  });
  $("benchmark-count").textContent=fmt.format(q.count)+" PLAYERS";
}
fetch("/api/stats",{cache:"no-store"})
.then(r=>{if(!r.ok)throw new Error();return r.json()})
.then(data=>{
  $("stat-players").textContent=fmt.format(data.players||0);
  $("stat-runs").textContent=fmt.format(data.submittedRuns||0);
  $("stat-active").textContent=fmt.format(data.activity?.active7d||0);
  $("stat-new").textContent=fmt.format(data.activity?.new30d||0);
  $("stat-runs-player").textContent=number(data.averages?.runsPerPlayer||0,1);
  $("avg-best-score").textContent=number(data.averages?.bestScore||0,0);
  $("avg-best-average").textContent=number(data.averages?.bestAverageSpeed||0,1)+" /s";
  $("avg-best-maximum").textContent=number(data.averages?.bestMaxSpeed||0,1)+" /s";
  const rs=record(data.records?.score,"score");
  const ra=record(data.records?.average,"speed");
  const rm=record(data.records?.maximum,"speed");
  $("record-score").textContent=rs.value;$("record-score-name").textContent=rs.name;
  $("record-average").textContent=ra.value;$("record-average-name").textContent=ra.name;
  $("record-maximum").textContent=rm.value;$("record-maximum-name").textContent=rm.name;
  renderBars(data.benchmarks?.averageSpeed);
})
.catch(()=>{
  document.querySelectorAll(".loading").forEach(el=>{
    el.textContent="Live stats are temporarily unavailable. The game still works.";
    el.classList.add("error-note");
  });
});
})();