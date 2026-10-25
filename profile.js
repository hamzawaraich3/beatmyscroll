document.addEventListener("DOMContentLoaded",async function(){
"use strict";
const C=window.BMSCore;
const H=window.BMSHouse;
const $=id=>document.getElementById(id);
const query=new URLSearchParams(location.search);
const publicUser=query.get("user");
let currentUsername=null;
let currentProfile=C.loadLocal();
let currentPercentile={total:0,percentile:0};
let currentRenderedRating=null;
let viewingPublic=Boolean(publicUser);

function pointsFor(values,radius=92,cx=130,cy=130){
  return values.map((v,i)=>{
    const a=-Math.PI/2+i*(Math.PI*2/6);
    const r=radius*Math.max(0,Math.min(100,v))/100;
    return[(cx+Math.cos(a)*r).toFixed(1),(cy+Math.sin(a)*r).toFixed(1)].join(",");
  }).join(" ");
}

function buildRadar(scores){
  const grid=$("radar-grid");
  const labels=$("radar-labels");
  grid.replaceChildren();labels.replaceChildren();
  const ns="http://www.w3.org/2000/svg";
  const cx=130,cy=130,r=92;

  [20,40,60,80,100].forEach(level=>{
    const poly=document.createElementNS(ns,"polygon");
    poly.setAttribute("class","radar-grid-line");
    poly.setAttribute("points",pointsFor(Array(6).fill(level),r,cx,cy));
    grid.appendChild(poly);
  });

  const names=["REACTION","FLICK","TRACK","SWITCH","PRECISION","CLICK"];
  C.ORDER.forEach((test,i)=>{
    const a=-Math.PI/2+i*Math.PI*2/6;
    const endX=cx+Math.cos(a)*r,endY=cy+Math.sin(a)*r;
    const line=document.createElementNS(ns,"line");
    line.setAttribute("class","radar-axis");
    line.setAttribute("x1",cx);line.setAttribute("y1",cy);
    line.setAttribute("x2",endX);line.setAttribute("y2",endY);
    grid.appendChild(line);

    const tx=cx+Math.cos(a)*(r+21),ty=cy+Math.sin(a)*(r+21);
    const label=document.createElementNS(ns,"text");
    label.setAttribute("class","radar-label");
    label.setAttribute("x",tx);label.setAttribute("y",ty);
    label.textContent=names[i];
    labels.appendChild(label);
  });

  $("radar-shape").setAttribute("points",pointsFor(C.ORDER.map(t=>Number(scores[t]||0)),r,cx,cy));
}

function rawText(test,raw){return C.formatRaw(test,raw)}

function render(username,profile,percentile){
  const scores=profile?.scores||C.scoresFromLocal(profile);
  const raw=profile?.raw||Object.fromEntries(C.ORDER.map(t=>[t,profile?.tests?.[t]?.raw||null]));
  const rating=profile?.rating||C.ratingFromScores(scores);
  currentRenderedRating=rating;

  $("profile-name").textContent=username||"LOCAL PROFILE";
  $("profile-rating").textContent=rating.completed?rating.rating:"—";
  $("profile-class").textContent=rating.completed?(rating.complete?rating.skillClass:"PROVISIONAL "+rating.skillClass):"UNRANKED";
  $("profile-overall").textContent=rating.completed?rating.overall.toFixed(1):"0.0";
  $("profile-percentile").textContent=rating.complete&&percentile?.total?Number(percentile.percentile).toFixed(1)+"%":"—";

  if(rating.complete){
    $("profile-status").textContent=(username?username+" · ":"")+"Complete 6-test profile"+(percentile?.total?" · ahead of roughly "+Number(percentile.percentile).toFixed(1)+"% of complete profiles.":".");
  }else{
    $("profile-status").textContent=rating.completed+" / 6 tests complete. Finish the suite for an official BMS Rating and global ranking.";
  }

  const root=$("profile-skills");root.replaceChildren();
  C.ORDER.forEach(test=>{
    const score=Number(scores[test]||0);
    const card=document.createElement("article");card.className="skill-card";
    const head=document.createElement("div");head.className="skill-card-head";
    const left=document.createElement("div");
    const label=document.createElement("span");label.textContent=(C.TESTS[test].weight*100).toFixed(0)+"% WEIGHT";
    const h=document.createElement("h3");h.textContent=C.TESTS[test].name;
    left.append(label,h);
    const scoreEl=document.createElement("strong");scoreEl.className="skill-score";scoreEl.textContent=score?Math.round(score):"—";
    head.append(left,scoreEl);
    const bar=document.createElement("div");bar.className="skill-bar";
    const fill=document.createElement("div");fill.style.width=Math.max(0,Math.min(100,score))+"%";bar.appendChild(fill);
    const p=document.createElement("p");p.textContent=score?rawText(test,raw[test]):"Not tested yet.";
    card.append(head,bar,p);root.appendChild(card);
  });

  buildRadar(scores);
  $("profile-claim").style.display=viewingPublic||username||!rating.completed?"none":"inline-block";
}

async function syncLocalImprovements(serverProfile){
  const local=C.loadLocal();
  const serverScores=serverProfile?.scores||{};
  let latest=null;

  for(const test of C.ORDER){
    const entry=local.tests?.[test];
    if(!entry)continue;

    if(Number(entry.score||0)>Number(serverScores[test]||0)+.05){
      const res=await fetch("/api/bms-submit",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({test,raw:entry.raw})
      });

      if(res.ok)latest=await res.json();
    }
  }

  return latest;
}

async function getCurrent(){
  try{
    const res=await fetch("/api/bms-profile",{cache:"no-store"});
    if(res.ok){
      const data=await res.json();
      currentUsername=data.username;

      let synced=null;
      if(currentUsername){
        synced=await syncLocalImprovements(data.profile);
      }

      const sourceProfile=synced?.profile||data.profile;
      currentProfile=C.mergeServerProfile(sourceProfile);
      currentPercentile=synced?.percentile||data.percentile||{total:0,percentile:0};
      const localScores=C.scoresFromLocal(currentProfile);
      render(currentUsername,{scores:localScores,raw:Object.fromEntries(C.ORDER.map(t=>[t,currentProfile.tests?.[t]?.raw||null])),rating:C.ratingFromScores(localScores)},currentPercentile);
      return;
    }
  }catch(e){}
  const scores=C.scoresFromLocal(currentProfile);
  render(null,{scores,raw:Object.fromEntries(C.ORDER.map(t=>[t,currentProfile.tests?.[t]?.raw||null])),rating:C.ratingFromScores(scores)},currentPercentile);
}

async function getPublic(username){
  try{
    const res=await fetch("/api/bms-user?username="+encodeURIComponent(username),{cache:"no-store"});
    if(!res.ok)throw new Error();
    const data=await res.json();
    currentUsername=data.username;
    render(data.username,data.profile,data.percentile);
    $("profile-claim").style.display="none";
  }catch(e){
    $("profile-name").textContent="PROFILE NOT FOUND";
    $("profile-status").textContent="That public BMS profile does not exist or has no synced data.";
    $("profile-claim").style.display="none";
  }
}

async function loadBoard(){
  const body=$("bms-board-body");
  if(body.dataset.loading==="1")return;
  body.dataset.loading="1";

  try{
    const res=await fetch("/api/bms-leaderboard?limit=25",{cache:"no-store"});
    if(!res.ok)throw new Error();

    const data=await res.json();
    const real=Array.isArray(data.leaderboard)?data.leaderboard:[];
    const rows=H?H.fillProfiles(real,8):real;

    body.replaceChildren();

    rows.forEach((row,i)=>{
      const el=document.createElement("div");
      el.className="bms-board-row"+
        (row.isHouse?" reference":"")+
        (currentUsername&&!row.isHouse&&row.username.toLowerCase()===currentUsername.toLowerCase()?" current":"");

      const rank=document.createElement("span");
      rank.className="rank";
      rank.textContent=row.isHouse?"REF":"#"+String(i+1).padStart(2,"0");

      const playerWrap=document.createElement("div");
      playerWrap.className="player-wrap";

      const player=row.isHouse?document.createElement("span"):document.createElement("a");
      player.className="player";
      player.textContent=row.username;

      if(!row.isHouse){
        player.href="/profile.html?user="+encodeURIComponent(row.username);
      }

      playerWrap.appendChild(player);

      if(row.isHouse){
        const badge=document.createElement("small");
        badge.className="house-badge";
        badge.textContent=row.badge||"HOUSE";
        playerWrap.appendChild(badge);
      }

      const rating=document.createElement("strong");
      rating.className="rating";
      rating.textContent=row.rating;

      const cls=document.createElement("span");
      cls.className="class";
      cls.textContent=row.skillClass;

      const overall=document.createElement("span");
      overall.className="overall";
      overall.textContent=Number(row.overall).toFixed(1);

      el.append(rank,playerWrap,rating,cls,overall);
      body.appendChild(el);
    });
  }catch(e){
    body.innerHTML='<div class="board-loading">Global BMS leaderboard is temporarily unavailable.</div>';
  }finally{
    body.dataset.loading="0";
  }
}

let activeSkillBoard="reaction";
const skillBoardCache=new Map();

function renderSkillBoard(test,realRows){
  const body=$("skill-board-body");
  const rows=H?H.fillSkill(test,realRows,5):realRows;

  body.replaceChildren();

  rows.forEach((row,i)=>{
    const el=document.createElement("div");
    el.className="skill-board-row"+(row.isHouse?" reference":"");

    const rank=document.createElement("span");
    rank.className="rank";
    rank.textContent=row.isHouse?"REF":"#"+String(i+1).padStart(2,"0");

    const playerWrap=document.createElement("div");
    playerWrap.className="player-wrap";

    const player=row.isHouse?document.createElement("span"):document.createElement("a");
    player.className="player";
    player.textContent=row.username;

    if(!row.isHouse){
      player.href="/profile.html?user="+encodeURIComponent(row.username);
    }

    playerWrap.appendChild(player);

    if(row.isHouse){
      const badge=document.createElement("small");
      badge.className="house-badge";
      badge.textContent=row.badge||"HOUSE";
      playerWrap.appendChild(badge);
    }

    const score=document.createElement("strong");
    score.className="score";
    score.textContent=Number(row.score).toFixed(1);

    const raw=document.createElement("span");
    raw.className="raw";
    raw.textContent=C.formatRaw(test,row.raw);

    el.append(rank,playerWrap,score,raw);
    body.appendChild(el);
  });
}

async function loadSkillBoard(test){
  activeSkillBoard=test;
  const body=$("skill-board-body");
  body.innerHTML='<div class="board-loading">Loading '+C.TESTS[test].name+' records…</div>';

  try{
    if(skillBoardCache.has(test)){
      renderSkillBoard(test,skillBoardCache.get(test));
      return;
    }

    const res=await fetch(
      "/api/bms-skill-leaderboard?test="+encodeURIComponent(test)+"&limit=25",
      {cache:"no-store"}
    );

    if(!res.ok)throw new Error();

    const data=await res.json();
    const real=Array.isArray(data.leaderboard)?data.leaderboard:[];

    skillBoardCache.set(test,real);
    renderSkillBoard(test,real);
  }catch(e){
    body.innerHTML='<div class="board-loading">Event records are temporarily unavailable.</div>';
  }
}

async function syncAll(name){
  const local=C.loadLocal();
  let first=true;
  for(const test of C.ORDER){
    const entry=local.tests?.[test];if(!entry)continue;
    const payload={test,raw:entry.raw};if(first&&name)payload.username=name;
    const res=await fetch("/api/bms-submit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||"Sync failed");
    currentUsername=data.username;currentProfile=C.mergeServerProfile(data.profile);currentPercentile=data.percentile||currentPercentile;first=false;
  }
}

$("profile-claim").addEventListener("click",()=>$("profile-claim-dialog").showModal());
$("profile-claim-cancel").addEventListener("click",()=>$("profile-claim-dialog").close());
$("profile-claim-form").addEventListener("submit",async e=>{
  e.preventDefault();
  const name=$("profile-claim-name").value.trim();
  if(!/^[A-Za-z0-9_-]{1,15}$/.test(name)){$("profile-claim-error").textContent="Use 1–15 letters, numbers, - or _.";return;}
  $("profile-claim-error").textContent="Syncing…";
  try{
    await syncAll(name);
    $("profile-claim-dialog").close();
    viewingPublic=false;
    await getCurrent();
    await loadBoard();
  }catch(err){$("profile-claim-error").textContent=err.message||"Could not sync profile.";}
});

document.querySelectorAll("[data-skill-board]").forEach(button=>{
  button.addEventListener("click",()=>{
    document.querySelectorAll("[data-skill-board]").forEach(item=>item.classList.toggle("active",item===button));
    loadSkillBoard(button.dataset.skillBoard);
  });
});

$("profile-share").addEventListener("click",async()=>{
  const status=$("profile-share-status");
  const username=currentUsername;

  if(!username){
    status.textContent="Claim / sync your profile first to create a public share link.";
    const localRating=C.ratingFromScores(C.scoresFromLocal(C.loadLocal()));
    if(localRating.completed)$("profile-claim-dialog").showModal();
    return;
  }

  const url="https://beatmyscroll.com/profile.html?user="+encodeURIComponent(username);
  const rating=currentRenderedRating;
  const text=username+"'s BeatMyScroll mechanics profile"+(rating?.complete?" — BMS Rating "+rating.rating+" "+rating.skillClass:"");
  try{
    if(navigator.share){await navigator.share({title:"BeatMyScroll BMS Profile",text,url});status.textContent="Shared.";return;}
  }catch(e){if(e.name==="AbortError")return;}
  try{await navigator.clipboard.writeText(text+" "+url);status.textContent="Profile link copied.";}catch(e){status.textContent="Copy the profile URL from your browser.";}
});

function lazyLoadBoards(){
  const overallSection=document.querySelector("#leaderboard");
  const skillSection=document.querySelector("#skill-board-tabs")?.closest(".profile-section");

  if(!("IntersectionObserver" in window)){
    loadBoard();
    loadSkillBoard(activeSkillBoard);
    return;
  }

  if(overallSection){
    const overallObserver=new IntersectionObserver(entries=>{
      if(entries.some(entry=>entry.isIntersecting)){
        overallObserver.disconnect();
        loadBoard();
      }
    },{rootMargin:"420px 0px"});
    overallObserver.observe(overallSection);
  }

  if(skillSection){
    const skillObserver=new IntersectionObserver(entries=>{
      if(entries.some(entry=>entry.isIntersecting)){
        skillObserver.disconnect();
        loadSkillBoard(activeSkillBoard);
      }
    },{rootMargin:"420px 0px"});
    skillObserver.observe(skillSection);
  }
}

if(viewingPublic)await getPublic(publicUser);else await getCurrent();
lazyLoadBoards();
});