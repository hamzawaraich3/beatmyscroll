document.addEventListener("DOMContentLoaded",async function(){
"use strict";

const C=window.BMSCore;
const H=window.BMSHouse;
const $=id=>document.getElementById(id);

function renderProfile(profile,username){
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
    fill.style.transform="scaleX("+(Math.max(0,Math.min(100,score))/100).toFixed(3)+")";

    const val=document.createElement("b");
    val.textContent=score?Math.round(score):"—";

    track.appendChild(fill);
    row.append(label,track,val);
    root.appendChild(row);

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

function createBadge(row){
  if(!row.isHouse)return null;
  const badge=document.createElement("small");
  badge.className="house-badge";
  badge.textContent=row.badge||"HOUSE";
  return badge;
}

async function loadLeaderboard(){
  const root=$("hub-leaderboard");
  if(!root||root.dataset.loaded==="1")return;
  root.dataset.loaded="1";

  try{
    const res=await fetch("/api/bms-leaderboard?limit=8",{cache:"no-store"});
    if(!res.ok)throw new Error();

    const data=await res.json();
    const real=Array.isArray(data.leaderboard)?data.leaderboard:[];
    const rows=H?H.fillProfiles(real,8):real;

    root.replaceChildren();

    if(!rows.length){
      const empty=document.createElement("div");
      empty.className="hub-loading";
      empty.textContent="No complete global profiles yet.";
      root.appendChild(empty);
      return;
    }

    rows.forEach((row,i)=>{
      const el=document.createElement("div");
      el.className="hub-leaderboard-row"+(row.isHouse?" reference":"");

      const pos=document.createElement("span");
      pos.className="pos";
      pos.textContent=row.isHouse?"REF":"#"+String(i+1).padStart(2,"0");

      const nameWrap=document.createElement("div");
      nameWrap.className="name-wrap";

      const name=document.createElement("strong");
      name.className="name";
      name.textContent=row.username;
      nameWrap.appendChild(name);

      const badge=createBadge(row);
      if(badge)nameWrap.appendChild(badge);

      const rating=document.createElement("strong");
      rating.className="rating";
      rating.textContent=row.rating;

      const cls=document.createElement("span");
      cls.className="class";
      cls.textContent=row.skillClass;

      el.append(pos,nameWrap,rating,cls);
      root.appendChild(el);
    });
  }catch(e){
    root.innerHTML='<div class="hub-loading">Global BMS leaderboard is temporarily unavailable.</div>';
  }
}

function lazyLeaderboard(){
  const section=document.querySelector(".leaderboard-preview");
  if(!section){loadLeaderboard();return;}

  if("IntersectionObserver" in window){
    const observer=new IntersectionObserver(entries=>{
      if(entries.some(entry=>entry.isIntersecting)){
        observer.disconnect();
        loadLeaderboard();
      }
    },{rootMargin:"420px 0px"});
    observer.observe(section);
  }else{
    const idle=window.requestIdleCallback||function(cb){return setTimeout(cb,500);};
    idle(loadLeaderboard);
  }
}

function prefetchBenchmark(){
  if(document.querySelector('link[data-bms-prefetch]'))return;
  const link=document.createElement("link");
  link.rel="prefetch";
  link.href="/benchmark.html";
  link.dataset.bmsPrefetch="1";
  document.head.appendChild(link);
}

let profile=C.loadLocal();
renderProfile(profile,null);

try{
  const res=await fetch("/api/bms-profile",{cache:"no-store"});
  if(res.ok){
    const data=await res.json();
    profile=C.mergeServerProfile(data.profile);
    renderProfile(profile,data.username);
  }
}catch(e){}

lazyLeaderboard();

document.addEventListener("pointerover",event=>{
  if(event.target.closest('a[href^="/benchmark.html"]'))prefetchBenchmark();
},{passive:true});
});