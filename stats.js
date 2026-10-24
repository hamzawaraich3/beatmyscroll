(function(){
"use strict";
const $=id=>document.getElementById(id);
const fmt=new Intl.NumberFormat();

function num(v,d=0){
  const n=Number(v);
  return Number.isFinite(n)
    ? n.toLocaleString(undefined,{minimumFractionDigits:d,maximumFractionDigits:d})
    : "—";
}

function renderMechanicsBars(skills){
  const root=$("mechanics-bars");
  root.replaceChildren();
  const rows=[
    ["REACTION","reaction"],
    ["FLICK","flick"],
    ["TRACKING","tracking"],
    ["SWITCHING","switching"],
    ["PRECISION","precision"],
    ["CLICK BURST","click"]
  ];

  rows.forEach(([label,key])=>{
    const value=Number(skills?.[key]||0);
    const row=document.createElement("div");
    row.className="benchmark-row";
    const name=document.createElement("span");name.textContent=label;
    const track=document.createElement("div");track.className="benchmark-track";
    const fill=document.createElement("div");fill.className="benchmark-fill";fill.style.width=Math.max(0,Math.min(100,value))+"%";
    const score=document.createElement("div");score.className="benchmark-value";score.textContent=value?value.toFixed(1):"—";
    track.appendChild(fill);row.append(name,track,score);root.appendChild(row);
  });
}

function classicRecord(row,type){
  if(!row)return{value:"—",name:"No record yet"};
  return{
    value:type==="score"?fmt.format(Math.floor(row.value)):Number(row.value).toFixed(1)+" /s",
    name:String(row.username||"Unknown")
  };
}

fetch("/api/stats",{cache:"no-store"})
.then(r=>{if(!r.ok)throw new Error();return r.json()})
.then(data=>{
  const m=data.mechanics||{};
  $("mech-profiles").textContent=fmt.format(m.profiles||0);
  $("mech-complete").textContent=fmt.format(m.completeProfiles||0);
  $("mech-submissions").textContent=fmt.format(m.submissions||0);
  $("mech-rating").textContent=m.completeProfiles?num(m.averageRating,0):"—";
  $("mech-overall").textContent=m.completeProfiles?num(m.averageOverall,1):"—";
  $("mech-top-rating").textContent=m.topProfile?fmt.format(m.topProfile.rating):"—";
  $("mech-top-name").textContent=m.topProfile?(m.topProfile.username+" · "+m.topProfile.skillClass):"No complete profile yet";
  renderMechanicsBars(m.skillAverages);

  $("stat-players").textContent=fmt.format(data.players||0);
  $("stat-runs").textContent=fmt.format(data.submittedRuns||0);
  $("stat-active").textContent=fmt.format(data.activity?.active7d||0);
  $("stat-runs-player").textContent=num(data.averages?.runsPerPlayer||0,1);

  const score=classicRecord(data.records?.score,"score");
  const avg=classicRecord(data.records?.average,"speed");
  const max=classicRecord(data.records?.maximum,"speed");

  $("record-score").textContent=score.value;
  $("record-score-name").textContent=score.name;
  $("record-average").textContent=avg.value;
  $("record-average-name").textContent=avg.name;
  $("record-maximum").textContent=max.value;
  $("record-maximum-name").textContent=max.name;
})
.catch(()=>{
  $("mechanics-bars").innerHTML='<div class="loading error-note">Live stats are temporarily unavailable.</div>';
});
})();