document.addEventListener("DOMContentLoaded",async function(){
"use strict";
const C=window.BMSCore;
const $=id=>document.getElementById(id);

function render(profile,username){
  const scores=C.scoresFromLocal(profile);
  const rating=C.ratingFromScores(scores);

  $("hub-rating").textContent=rating.completed?rating.rating:"—";
  $("hub-class").textContent=rating.complete?rating.skillClass:(rating.completed?"PROVISIONAL "+rating.skillClass:"UNRANKED");
  $("hub-complete").textContent=rating.completed+" / 6";
  $("hub-overall").textContent=rating.completed?rating.overall.toFixed(1):"—";

  const root=$("hub-skill-bars");
  root.replaceChildren();

  C.ORDER.forEach(test=>{
    const score=Number(scores[test]||0);
    const row=document.createElement("div");
    row.className="skill-bar";
    const label=document.createElement("span");
    label.textContent=C.TESTS[test].name.toUpperCase();
    const track=document.createElement("div");
    track.className="skill-track";
    const fill=document.createElement("div");
    fill.className="skill-fill";
    fill.style.width=Math.max(0,Math.min(100,score))+"%";
    const val=document.createElement("b");
    val.textContent=score?Math.round(score):"—";
    track.appendChild(fill);row.append(label,track,val);root.appendChild(row);

    const best=$("hub-best-"+test);
    if(best){
      const entry=profile.tests?.[test];
      best.textContent=entry?C.formatRaw(test,entry.raw):"NOT TESTED";
    }
  });

  const dot=$("hub-sync-dot");
  dot.classList.toggle("online",Boolean(username));
  dot.title=username?"Synced as "+username:"Local profile only";
}

let profile=C.loadLocal();
render(profile,null);

try{
  const res=await fetch("/api/bms-profile",{cache:"no-store"});
  if(res.ok){
    const data=await res.json();
    profile=C.mergeServerProfile(data.profile);
    render(profile,data.username);
  }
}catch(e){}

try{
  const res=await fetch("/api/bms-leaderboard?limit=5",{cache:"no-store"});
  if(!res.ok)throw new Error();
  const data=await res.json();
  const root=$("hub-leaderboard");
  root.replaceChildren();

  const rows=Array.isArray(data.leaderboard)?data.leaderboard:[];
  if(!rows.length){
    const empty=document.createElement("div");
    empty.className="hub-loading";
    empty.textContent="No complete global profiles yet. Finish all six tests and be first.";
    root.appendChild(empty);
  }else{
    rows.forEach((row,i)=>{
      const el=document.createElement("div");el.className="hub-leaderboard-row";
      const pos=document.createElement("span");pos.className="pos";pos.textContent="#"+String(i+1).padStart(2,"0");
      const name=document.createElement("strong");name.className="name";name.textContent=row.username;
      const rating=document.createElement("strong");rating.className="rating";rating.textContent=row.rating;
      const cls=document.createElement("span");cls.className="class";cls.textContent=row.skillClass;
      el.append(pos,name,rating,cls);root.appendChild(el);
    });
  }
}catch(e){
  $("hub-leaderboard").innerHTML='<div class="hub-loading">Global BMS leaderboard is temporarily unavailable.</div>';
}
});