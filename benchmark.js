document.addEventListener("DOMContentLoaded",function(){
"use strict";

const C=window.BMSCore;
const $=id=>document.getElementById(id);

const runner=$("runner");
const intro=$("runner-intro");
const arena=$("arena");
const resultPanel=$("runner-result");
const runnerName=$("runner-name");
const runnerIndex=$("runner-index");
const runnerProgress=$("runner-progress");
const runnerTitle=$("runner-title");
const runnerInstructions=$("runner-instructions");
const runnerSpecs=$("runner-specs");
const runnerStart=$("runner-start");
const runnerExit=$("runner-exit");
const resultScore=$("result-score");
const resultRaw=$("result-raw");
const resultPb=$("result-pb");
const resultRetry=$("result-retry");
const resultContinue=$("result-continue");
const syncStatus=$("sync-status");
const claimDialog=$("claim-dialog");
const claimForm=$("claim-form");
const claimName=$("claim-name");
const claimError=$("claim-error");
const claimCancel=$("claim-cancel");

const META={
  reaction:{
    title:"Reaction",
    instructions:"Wait for the field to turn green, then click as quickly as possible. Early clicks do not count and repeat the trial.",
    specs:[["TRIALS","5"],["RESULT","MEDIAN MS"],["WEIGHT","20%"]]
  },
  flick:{
    title:"Flick Acquisition",
    instructions:"Acquire 20 sequential targets. Misses hurt accuracy; slow acquisition hurts speed. Both are combined.",
    specs:[["TARGETS","20"],["RESULT","MS + ACC"],["WEIGHT","25%"]]
  },
  tracking:{
    title:"Tracking",
    instructions:"Keep your pointer inside the moving target for 15 seconds. Continuous time on target is the score.",
    specs:[["TIME","15 SEC"],["RESULT","ON-TARGET %"],["WEIGHT","20%"]]
  },
  switching:{
    title:"Target Switching",
    instructions:"Click the active green target, then transfer immediately to the next active target. Non-active clicks count as misses.",
    specs:[["SWITCHES","25"],["RESULT","MS + ACC"],["WEIGHT","15%"]]
  },
  precision:{
    title:"Micro Precision",
    instructions:"Hit 15 small targets as close to center as possible. Edge hits score less; misses also reduce precision.",
    specs:[["TARGETS","15"],["RESULT","CENTER % + MS"],["WEIGHT","15%"]]
  },
  click:{
    title:"Click Burst",
    instructions:"Click the fixed pad as many times as possible in exactly five seconds. No aim component.",
    specs:[["TIME","5 SEC"],["RESULT","CLICKS / SEC"],["WEIGHT","5%"]]
  }
};

let profile=C.loadLocal();
let currentUsername=null;
let currentTest=null;
let suiteMode=false;
let suiteQueue=[];
let suitePosition=0;
let lastRaw=null;
let activeCleanups=[];

function cleanupActive(){
  activeCleanups.splice(0).forEach(fn=>{try{fn();}catch(e){}});
  arena.replaceChildren();
  arena.classList.add("hidden");
}

function addCleanup(fn){activeCleanups.push(fn);return fn;}
function on(el,event,fn,opts){
  el.addEventListener(event,fn,opts);
  addCleanup(()=>el.removeEventListener(event,fn,opts));
}
function later(fn,ms){
  const id=setTimeout(fn,ms);
  addCleanup(()=>clearTimeout(id));
  return id;
}
function rafLoop(fn){
  let id=0,stopped=false;
  function tick(now){if(stopped)return;fn(now);if(!stopped)id=requestAnimationFrame(tick);}
  id=requestAnimationFrame(tick);
  addCleanup(()=>{stopped=true;cancelAnimationFrame(id);});
}
function sleep(ms){
  return new Promise(resolve=>{
    const id=setTimeout(resolve,ms);
    addCleanup(()=>clearTimeout(id));
  });
}
function median(values){
  const arr=[...values].sort((a,b)=>a-b);
  const m=Math.floor(arr.length/2);
  return arr.length%2?arr[m]:(arr[m-1]+arr[m])/2;
}
function arenaHud(left,right){
  const hud=document.createElement("div");
  hud.className="arena-hud";
  const a=document.createElement("span");a.innerHTML=left;
  const b=document.createElement("span");b.innerHTML=right;
  hud.append(a,b);arena.appendChild(hud);
  return{left:a,right:b};
}
async function countdown(){
  const box=document.createElement("div");
  box.className="arena-message";
  const strong=document.createElement("strong");
  const small=document.createElement("span");
  small.textContent="GET READY";
  box.append(strong,small);arena.appendChild(box);
  for(const n of [3,2,1]){
    strong.textContent=n;
    await sleep(500);
  }
  strong.textContent="GO";
  await sleep(260);
  box.remove();
}
function showProfile(){
  profile=C.loadLocal();
  const scores=C.scoresFromLocal(profile);
  const rating=C.ratingFromScores(scores);
  $("suite-rating").textContent=rating.completed?rating.rating:"—";
  $("suite-class").textContent=rating.complete?rating.skillClass:(rating.completed?"PROVISIONAL "+rating.skillClass:"UNRANKED");
  $("suite-progress").textContent=rating.completed+" / 6 TESTS COMPLETE";
  $("suite-meter-fill").style.width=(rating.completed/6*100)+"%";
  C.ORDER.forEach(test=>{
    const el=$("best-"+test);
    const entry=profile.tests?.[test];
    el.textContent=entry?C.formatRaw(test,entry.raw)+" · "+Math.round(entry.score):"NOT TESTED";
  });
}
function showIntro(test){
  cleanupActive();
  currentTest=test;
  const meta=META[test];
  runner.classList.remove("hidden");
  intro.classList.remove("hidden");
  resultPanel.classList.add("hidden");
  arena.classList.add("hidden");
  runnerName.textContent=meta.title.toUpperCase();
  runnerTitle.textContent=meta.title;
  runnerInstructions.textContent=meta.instructions;
  runnerIndex.textContent="TEST "+String(C.ORDER.indexOf(test)+1).padStart(2,"0")+" / 06";
  runnerProgress.textContent=suiteMode?"SUITE "+(suitePosition+1)+" / "+suiteQueue.length:"READY";
  runnerSpecs.replaceChildren();
  meta.specs.forEach(([label,value])=>{
    const d=document.createElement("div");
    const s=document.createElement("span");s.textContent=label;
    const b=document.createElement("strong");b.textContent=value;
    d.append(s,b);runnerSpecs.appendChild(d);
  });
}
function closeRunner(){
  cleanupActive();
  runner.classList.add("hidden");
  suiteMode=false;suiteQueue=[];suitePosition=0;
  document.body.style.overflow="";
}
function openTest(test,asSuite=false){
  if(!META[test])return;
  if(asSuite){
    suiteMode=true;
    suiteQueue=[...C.ORDER];
    suitePosition=Math.max(0,suiteQueue.indexOf(test));
  }else{
    suiteMode=false;
    suiteQueue=[];
    suitePosition=0;
  }
  document.body.style.overflow="hidden";
  showIntro(test);
}

async function startTest(){
  cleanupActive();
  intro.classList.add("hidden");
  resultPanel.classList.add("hidden");
  arena.classList.remove("hidden");
  runnerProgress.textContent="LIVE";

  let raw;
  try{
    if(currentTest==="reaction")raw=await runReaction();
    if(currentTest==="flick")raw=await runFlick();
    if(currentTest==="tracking")raw=await runTracking();
    if(currentTest==="switching")raw=await runSwitching();
    if(currentTest==="precision")raw=await runPrecision();
    if(currentTest==="click")raw=await runClick();
  }catch(e){
    if(e?.message==="ABORT")return;
    console.error(e);
    runnerProgress.textContent="ERROR";
    showIntro(currentTest);
    return;
  }

  if(raw)finishTest(currentTest,raw);
}

function runReaction(){
  return new Promise(resolve=>{
    const surface=document.createElement("div");
    surface.className="reaction-surface waiting";
    const wrap=document.createElement("div");
    const label=document.createElement("strong");
    const sub=document.createElement("small");
    wrap.append(label,sub);surface.appendChild(wrap);arena.appendChild(surface);

    let trial=0,state="idle",goTime=0,timer=null;
    const samples=[];

    function clearTimer(){if(timer){clearTimeout(timer);timer=null;}}
    addCleanup(clearTimer);

    function schedule(){
      state="waiting";
      surface.className="reaction-surface waiting";
      label.textContent="WAIT";
      sub.textContent="Trial "+(trial+1)+" / 5";
      timer=setTimeout(()=>{
        state="go";
        goTime=performance.now();
        surface.className="reaction-surface go";
        label.textContent="CLICK";
        sub.textContent="NOW";
      },900+Math.random()*1900);
    }

    function next(){
      if(trial>=5){
        resolve({medianMs:Math.round(median(samples))});
        return;
      }
      later(schedule,620);
    }

    on(surface,"pointerdown",event=>{
      event.preventDefault();
      if(state==="waiting"){
        clearTimer();
        state="early";
        surface.className="reaction-surface too-early";
        label.textContent="TOO EARLY";
        sub.textContent="This trial repeats.";
        later(schedule,850);
        return;
      }
      if(state==="go"){
        const ms=performance.now()-goTime;
        samples.push(ms);
        trial++;
        state="result";
        surface.className="reaction-surface";
        label.textContent=Math.round(ms)+" ms";
        sub.textContent=trial<5?"LOCKED · NEXT TRIAL":"COMPLETE";
        next();
      }
    });

    schedule();
  });
}

async function runFlick(){
  await countdown();
  return new Promise(resolve=>{
    const total=20;
    let hits=0,misses=0;
    const started=performance.now();
    const hud=arenaHud("TARGET <strong>1 / 20</strong>","MISSES <strong>0</strong>");

    function spawn(){
      const rect=arena.getBoundingClientRect();
      const radius=matchMedia("(pointer:coarse)").matches?30:24;
      const x=radius+18+Math.random()*Math.max(20,rect.width-(radius+18)*2);
      const y=radius+54+Math.random()*Math.max(20,rect.height-radius-78);
      const target=document.createElement("button");
      target.type="button";target.className="bench-target";
      target.style.width=target.style.height=(radius*2)+"px";
      target.style.left=x+"px";target.style.top=y+"px";
      target.setAttribute("aria-label","Aim target");
      target.addEventListener("pointerdown",event=>{
        event.preventDefault();event.stopPropagation();
        hits++;target.remove();
        hud.left.innerHTML="TARGET <strong>"+Math.min(total,hits+1)+" / "+total+"</strong>";
        if(hits>=total){
          const elapsed=performance.now()-started;
          const accuracy=hits/(hits+misses)*100;
          resolve({avgMs:elapsed/total,accuracy});
        }else spawn();
      },{once:true});
      arena.appendChild(target);
    }

    on(arena,"pointerdown",event=>{
      if(!event.target.classList.contains("bench-target")){
        misses++;
        hud.right.innerHTML="MISSES <strong>"+misses+"</strong>";
      }
    });
    spawn();
  });
}

async function runTracking(){
  await countdown();
  return new Promise(resolve=>{
    const duration=15000;
    const target=document.createElement("div");
    target.className="tracking-target";
    const diameter=matchMedia("(pointer:coarse)").matches?74:62;
    target.style.width=target.style.height=diameter+"px";
    arena.appendChild(target);
    const hud=arenaHud("ON TARGET <strong>0.0%</strong>","TIME <strong>15.0</strong>");

    let px=-9999,py=-9999,onTime=0,last=performance.now();
    const started=last;

    function updatePointer(event){
      const rect=arena.getBoundingClientRect();
      px=event.clientX-rect.left;py=event.clientY-rect.top;
    }
    on(arena,"pointermove",updatePointer);
    on(arena,"pointerdown",updatePointer);

    rafLoop(now=>{
      const rect=arena.getBoundingClientRect();
      const elapsed=now-started;
      const dt=Math.min(40,now-last);last=now;
      const t=elapsed/1000;
      const rx=Math.max(30,(rect.width-diameter)/2-24);
      const ry=Math.max(30,(rect.height-diameter)/2-48);
      const cx=rect.width/2+Math.sin(t*1.47)*rx*.68+Math.sin(t*2.53)*rx*.22;
      const cy=rect.height/2+Math.cos(t*1.21)*ry*.62+Math.sin(t*2.09)*ry*.24;
      target.style.left=cx+"px";target.style.top=cy+"px";

      const dist=Math.hypot(px-cx,py-cy);
      if(dist<=diameter/2)onTime+=dt;

      const used=Math.min(duration,elapsed);
      const acc=used?onTime/used*100:0;
      hud.left.innerHTML="ON TARGET <strong>"+acc.toFixed(1)+"%</strong>";
      hud.right.innerHTML="TIME <strong>"+Math.max(0,(duration-elapsed)/1000).toFixed(1)+"</strong>";

      if(elapsed>=duration){
        resolve({accuracy:Math.min(100,onTime/duration*100)});
        cleanupActive();
      }
    });
  });
}

async function runSwitching(){
  await countdown();
  return new Promise(resolve=>{
    const positions=[[18,28],[50,20],[82,30],[29,72],[70,70],[50,50]];
    const nodes=[];
    let active=-1,hits=0,misses=0,activatedAt=performance.now();
    const times=[];
    const hud=arenaHud("SWITCH <strong>1 / 25</strong>","MISSES <strong>0</strong>");

    positions.forEach((pos,index)=>{
      const node=document.createElement("button");
      node.type="button";node.className="switch-node";
      node.style.left=pos[0]+"%";node.style.top=pos[1]+"%";
      node.addEventListener("pointerdown",event=>{
        event.preventDefault();event.stopPropagation();
        if(index!==active){
          misses++;hud.right.innerHTML="MISSES <strong>"+misses+"</strong>";return;
        }
        times.push(performance.now()-activatedAt);
        hits++;
        if(hits>=25){
          resolve({avgMs:times.reduce((a,b)=>a+b,0)/times.length,accuracy:hits/(hits+misses)*100});
          return;
        }
        activate();
      });
      nodes.push(node);arena.appendChild(node);
    });

    function activate(){
      nodes.forEach(n=>n.classList.remove("active"));
      let next=active;
      while(next===active)next=Math.floor(Math.random()*nodes.length);
      active=next;nodes[active].classList.add("active");
      activatedAt=performance.now();
      hud.left.innerHTML="SWITCH <strong>"+(hits+1)+" / 25</strong>";
    }

    on(arena,"pointerdown",event=>{
      if(!event.target.classList.contains("switch-node")){
        misses++;hud.right.innerHTML="MISSES <strong>"+misses+"</strong>";
      }
    });
    activate();
  });
}

async function runPrecision(){
  await countdown();
  return new Promise(resolve=>{
    const total=15;
    let hits=0,misses=0;
    const centerScores=[];
    const started=performance.now();
    const hud=arenaHud("TARGET <strong>1 / 15</strong>","CENTER <strong>—</strong>");

    function spawn(){
      const rect=arena.getBoundingClientRect();
      const radius=(matchMedia("(pointer:coarse)").matches?16:11)+Math.random()*7;
      const x=radius+18+Math.random()*Math.max(20,rect.width-(radius+18)*2);
      const y=radius+54+Math.random()*Math.max(20,rect.height-radius-78);
      const target=document.createElement("button");
      target.type="button";target.className="bench-target small";
      target.style.width=target.style.height=(radius*2)+"px";
      target.style.left=x+"px";target.style.top=y+"px";
      target.addEventListener("pointerdown",event=>{
        event.preventDefault();event.stopPropagation();
        const r=target.getBoundingClientRect();
        const cx=r.left+r.width/2,cy=r.top+r.height/2;
        const distance=Math.hypot(event.clientX-cx,event.clientY-cy);
        const center=Math.max(0,100*(1-distance/(r.width/2)));
        centerScores.push(center);hits++;
        hud.right.innerHTML="CENTER <strong>"+center.toFixed(0)+"%</strong>";
        target.remove();
        if(hits>=total){
          const elapsed=performance.now()-started;
          const mean=centerScores.reduce((a,b)=>a+b,0)/centerScores.length;
          const hitAccuracy=hits/(hits+misses);
          resolve({precision:mean*hitAccuracy,avgMs:elapsed/total});
        }else{
          hud.left.innerHTML="TARGET <strong>"+(hits+1)+" / "+total+"</strong>";
          spawn();
        }
      },{once:true});
      arena.appendChild(target);
    }

    on(arena,"pointerdown",event=>{
      if(!event.target.classList.contains("bench-target")){
        misses++;
      }
    });
    spawn();
  });
}

async function runClick(){
  await countdown();
  return new Promise(resolve=>{
    const duration=5000;
    const pad=document.createElement("button");
    pad.type="button";pad.className="click-pad";
    const wrap=document.createElement("div");
    const countEl=document.createElement("strong");countEl.textContent="0";
    const label=document.createElement("span");label.textContent="CLICKS";
    wrap.append(countEl,label);pad.appendChild(wrap);arena.appendChild(pad);
    const hud=arenaHud("RATE <strong>0.00 CPS</strong>","TIME <strong>5.0</strong>");
    let clicks=0;
    const started=performance.now();

    on(pad,"pointerdown",event=>{
      event.preventDefault();
      clicks++;countEl.textContent=clicks;
      const elapsed=Math.max(.1,(performance.now()-started)/1000);
      hud.left.innerHTML="RATE <strong>"+(clicks/elapsed).toFixed(2)+" CPS</strong>";
    });

    rafLoop(now=>{
      const elapsed=now-started;
      hud.right.innerHTML="TIME <strong>"+Math.max(0,(duration-elapsed)/1000).toFixed(1)+"</strong>";
      if(elapsed>=duration){
        resolve({cps:clicks/5});
        cleanupActive();
      }
    });
  });
}

function rawCards(test,raw){
  const rows=[];
  if(test==="reaction")rows.push(["MEDIAN",Math.round(raw.medianMs)+" ms"]);
  if(test==="click")rows.push(["BURST",Number(raw.cps).toFixed(2)+" CPS"]);
  if(test==="tracking")rows.push(["ON TARGET",Number(raw.accuracy).toFixed(1)+"%"]);
  if(test==="flick"){rows.push(["AVG ACQUIRE",Math.round(raw.avgMs)+" ms"],["ACCURACY",Number(raw.accuracy).toFixed(1)+"%"]);}
  if(test==="switching"){rows.push(["AVG SWITCH",Math.round(raw.avgMs)+" ms"],["ACCURACY",Number(raw.accuracy).toFixed(1)+"%"]);}
  if(test==="precision"){rows.push(["CENTER SCORE",Number(raw.precision).toFixed(1)+"%"],["AVG TARGET",Math.round(raw.avgMs)+" ms"]);}
  return rows;
}

async function finishTest(test,raw){
  cleanupActive();
  lastRaw=raw;
  const saved=C.saveLocalResult(test,raw);
  profile=saved.profile;
  showProfile();

  intro.classList.add("hidden");
  arena.classList.add("hidden");
  resultPanel.classList.remove("hidden");
  runnerProgress.textContent="COMPLETE";
  resultScore.textContent=Math.round(saved.score);
  resultPb.textContent=saved.personalBest?"NEW PERSONAL BEST":"Local best preserved";
  resultRaw.replaceChildren();

  rawCards(test,raw).forEach(([label,value])=>{
    const d=document.createElement("div");
    const s=document.createElement("span");s.textContent=label;
    const b=document.createElement("strong");b.textContent=value;
    d.append(s,b);resultRaw.appendChild(d);
  });

  if(suiteMode&&suitePosition<suiteQueue.length-1){
    resultContinue.textContent="NEXT TEST →";
  }else if(suiteMode){
    resultContinue.textContent="VIEW PROFILE →";
  }else{
    resultContinue.textContent="DONE";
  }

  await syncResult(test,raw);
}

function setSync(text,type=""){
  syncStatus.className="sync-status"+(type?" "+type:"");
  syncStatus.replaceChildren();
  const span=document.createElement("span");span.textContent=text;syncStatus.appendChild(span);
}

async function syncResult(test,raw,username){
  setSync("Saving locally…");
  try{
    const payload={test,raw};
    if(username)payload.username=username;
    const res=await fetch("/api/bms-submit",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(payload)
    });
    const data=await res.json();

    if(res.ok){
      currentUsername=data.username;
      profile=C.mergeServerProfile(data.profile);
      showProfile();
      setSync("Synced globally as "+currentUsername+(data.result?.personalBest?" · SERVER PB":" · result logged"),"success");
      return true;
    }

    if(data.code==="NAME_REQUIRED"){
      setSync("Saved locally. Claim a username to sync globally.");
      const btn=document.createElement("button");
      btn.type="button";btn.className="inline-sync";btn.textContent="CLAIM PROFILE";
      btn.addEventListener("click",()=>claimDialog.showModal());
      syncStatus.appendChild(btn);
      return false;
    }

    setSync(data.error||"Global sync failed. Local result is safe.","error");
    return false;
  }catch(e){
    setSync("Offline/local mode. Result is saved on this browser.","error");
    return false;
  }
}

async function syncAllLocal(username){
  profile=C.loadLocal();
  let first=true;
  for(const test of C.ORDER){
    const entry=profile.tests?.[test];
    if(!entry)continue;
    const payload={test,raw:entry.raw};
    if(first&&username)payload.username=username;
    const res=await fetch("/api/bms-submit",{
      method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)
    });
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||"Sync failed");
    currentUsername=data.username;
    profile=C.mergeServerProfile(data.profile);
    first=false;
  }
  showProfile();
}

runnerStart.addEventListener("click",startTest);
runnerExit.addEventListener("click",closeRunner);
resultRetry.addEventListener("click",()=>showIntro(currentTest));
resultContinue.addEventListener("click",()=>{
  if(suiteMode){
    if(suitePosition<suiteQueue.length-1){
      suitePosition++;
      showIntro(suiteQueue[suitePosition]);
    }else{
      closeRunner();
      location.href="/profile.html";
    }
  }else closeRunner();
});

document.querySelectorAll("[data-test]").forEach(btn=>{
  btn.addEventListener("click",()=>openTest(btn.dataset.test,false));
});
$("start-suite").addEventListener("click",()=>{
  suiteMode=true;suiteQueue=[...C.ORDER];suitePosition=0;
  document.body.style.overflow="hidden";
  showIntro(suiteQueue[0]);
});
claimCancel.addEventListener("click",()=>claimDialog.close());
claimForm.addEventListener("submit",async event=>{
  event.preventDefault();
  const name=claimName.value.trim();
  if(!/^[A-Za-z0-9_-]{1,15}$/.test(name)){
    claimError.textContent="Use 1–15 letters, numbers, - or _.";return;
  }
  claimError.textContent="Syncing your local bests…";
  try{
    await syncAllLocal(name);
    claimDialog.close();
    claimError.textContent="";
    setSync("Profile synced globally as "+currentUsername,"success");
  }catch(e){
    claimError.textContent=e.message||"Could not claim that username.";
  }
});

showProfile();

fetch("/api/bms-profile",{cache:"no-store"})
.then(r=>r.ok?r.json():null)
.then(data=>{
  if(!data)return;
  currentUsername=data.username;
  profile=C.mergeServerProfile(data.profile);
  showProfile();
})
.catch(()=>{});

const params=new URLSearchParams(location.search);
const requested=params.get("test");
if(META[requested])openTest(requested,false);
else if(params.get("mode")==="full"){
  suiteMode=true;suiteQueue=[...C.ORDER];suitePosition=0;
  document.body.style.overflow="hidden";
  showIntro(suiteQueue[0]);
}
});