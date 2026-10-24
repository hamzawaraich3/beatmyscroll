document.addEventListener("DOMContentLoaded",async function(){
"use strict";
const C=window.BMSCore;
const $=id=>document.getElementById(id);
const query=new URLSearchParams(location.search);
const publicUser=query.get("user");
let currentUsername=null;
let currentProfile=C.loadLocal();
let currentPercentile={total:0,percentile:0};
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
  $("profile-claim").style.display=viewingPublic||username?"none":"inline-block";
}

async function getCurrent(){
  try{
    const res=await fetch("/api/bms-profile",{cache:"no-store"});
    if(res.ok){
      const data=await res.json();
      currentUsername=data.username;
      currentProfile=C.mergeServerProfile(data.profile);
      currentPercentile=data.percentile||{total:0,percentile:0};
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
  try{
    const res=await fetch("/api/bms-leaderboard?limit=50",{cache:"no-store"});
    if(!res.ok)throw new Error();
    const data=await res.json();
    const rows=Array.isArray(data.leaderboard)?data.leaderboard:[];
    body.replaceChildren();
    if(!rows.length){
      const empty=document.createElement("div");empty.className="board-loading";empty.textContent="No complete global profiles yet. Finish all six tests and become the first.";body.appendChild(empty);return;
    }
    rows.forEach((row,i)=>{
      const el=document.createElement("div");el.className="bms-board-row"+(currentUsername&&row.username.toLowerCase()===currentUsername.toLowerCase()?" current":"");
      const rank=document.createElement("span");rank.className="rank";rank.textContent="#"+String(i+1).padStart(2,"0");
      const player=document.createElement("a");player.className="player";player.href="/profile.html?user="+encodeURIComponent(row.username);player.textContent=row.username;player.style.textDecoration="none";
      const rating=document.createElement("strong");rating.className="rating";rating.textContent=row.rating;
      const cls=document.createElement("span");cls.className="class";cls.textContent=row.skillClass;
      const overall=document.createElement("span");overall.className="overall";overall.textContent=Number(row.overall).toFixed(1);
      el.append(rank,player,rating,cls,overall);body.appendChild(el);
    });
  }catch(e){
    body.innerHTML='<div class="board-loading">Global BMS leaderboard is temporarily unavailable.</div>';
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

$("profile-share").addEventListener("click",async()=>{
  const status=$("profile-share-status");
  const username=currentUsername;
  const url=username?"https://beatmyscroll.com/profile.html?user="+encodeURIComponent(username):location.href;
  const scores=viewingPublic?null:C.scoresFromLocal(C.loadLocal());
  const rating=scores?C.ratingFromScores(scores):null;
  const text=username?(username+"'s BeatMyScroll mechanics profile"+(rating?.complete?" — BMS Rating "+rating.rating+" "+rating.skillClass:"")):"My BeatMyScroll mechanics profile";
  try{
    if(navigator.share){await navigator.share({title:"BeatMyScroll BMS Profile",text,url});status.textContent="Shared.";return;}
  }catch(e){if(e.name==="AbortError")return;}
  try{await navigator.clipboard.writeText(text+" "+url);status.textContent="Profile link copied.";}catch(e){status.textContent="Copy the profile URL from your browser.";}
});

if(viewingPublic)await getPublic(publicUser);else await getCurrent();
await loadBoard();
});