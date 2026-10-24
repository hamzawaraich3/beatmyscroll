(function(){
"use strict";

const STORAGE_KEY="bmsBenchmarkProfileV2";

const TESTS={
  reaction:{name:"Reaction",weight:.20,unit:"ms"},
  flick:{name:"Flick",weight:.25,unit:"score"},
  tracking:{name:"Tracking",weight:.20,unit:"%"},
  switching:{name:"Switching",weight:.15,unit:"score"},
  precision:{name:"Precision",weight:.15,unit:"score"},
  click:{name:"Click Burst",weight:.05,unit:"CPS"}
};

const ORDER=["reaction","flick","tracking","switching","precision","click"];

function clamp(v,min=0,max=100){return Math.max(min,Math.min(max,v));}

function scoreTest(test,raw){
  if(!raw||!TESTS[test])return 0;
  let score=0;

  if(test==="reaction"){
    const ms=Number(raw.medianMs);
    score=clamp(((400-ms)/250)*100);
  }

  if(test==="click"){
    const cps=Number(raw.cps);
    score=clamp(((cps-3)/7)*100);
  }

  if(test==="tracking"){
    score=clamp(Number(raw.accuracy));
  }

  if(test==="flick"){
    const ms=Number(raw.avgMs);
    const accuracy=clamp(Number(raw.accuracy));
    const speed=clamp(((900-ms)/650)*100);
    score=clamp(speed*(.55+.45*(accuracy/100)));
  }

  if(test==="switching"){
    const ms=Number(raw.avgMs);
    const accuracy=clamp(Number(raw.accuracy));
    const speed=clamp(((850-ms)/600)*100);
    score=clamp(speed*(.62+.38*(accuracy/100)));
  }

  if(test==="precision"){
    const precision=clamp(Number(raw.precision));
    const ms=Number(raw.avgMs);
    const speed=clamp(((1400-ms)/1100)*100);
    score=clamp(precision*.78+speed*.22);
  }

  return Math.max(0.1,Math.round(score*10)/10);
}

function ratingFromScores(scores){
  let weighted=0,weights=0,completed=0;

  ORDER.forEach(test=>{
    const score=Number(scores?.[test]||0);
    if(score>0){
      completed++;
      weighted+=score*TESTS[test].weight;
      weights+=TESTS[test].weight;
    }
  });

  const overall=weights?weighted/weights:0;
  const rating=Math.round(clamp(1000+(overall-50)*20,0,2000));

  let skillClass="RECRUIT";
  if(rating>=1950)skillClass="DEMON";
  else if(rating>=1800)skillClass="IMMORTAL";
  else if(rating>=1600)skillClass="ASCENDANT";
  else if(rating>=1400)skillClass="DIAMOND";
  else if(rating>=1200)skillClass="PLATINUM";
  else if(rating>=1000)skillClass="GOLD";
  else if(rating>=800)skillClass="SILVER";
  else if(rating>=600)skillClass="BRONZE";

  return{
    overall:Math.round(overall*10)/10,
    rating,
    skillClass,
    completed,
    complete:completed===ORDER.length
  };
}

function emptyProfile(){
  return{
    tests:{},
    updatedAt:0
  };
}

function loadLocal(){
  try{
    const parsed=JSON.parse(localStorage.getItem(STORAGE_KEY)||"null");
    if(parsed&&typeof parsed==="object"&&parsed.tests)return parsed;
  }catch(e){}
  return emptyProfile();
}

function saveLocal(profile){
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(profile));}catch(e){}
}

function saveLocalResult(test,raw){
  const profile=loadLocal();
  const score=scoreTest(test,raw);
  const old=Number(profile.tests?.[test]?.score||0);

  if(!profile.tests)profile.tests={};

  if(score>=old){
    profile.tests[test]={score,raw,updatedAt:Date.now()};
  }

  profile.updatedAt=Date.now();
  saveLocal(profile);

  return{
    profile,
    score,
    personalBest:score>=old
  };
}

function scoresFromLocal(profile){
  const scores={};
  ORDER.forEach(test=>{scores[test]=Number(profile?.tests?.[test]?.score||0);});
  return scores;
}

function mergeServerProfile(server){
  const local=loadLocal();
  if(!server?.scores)return local;

  ORDER.forEach(test=>{
    const serverScore=Number(server.scores[test]||0);
    const localScore=Number(local.tests?.[test]?.score||0);

    if(serverScore>localScore){
      if(!local.tests)local.tests={};
      local.tests[test]={
        score:serverScore,
        raw:server.raw?.[test]||null,
        updatedAt:Number(server.updatedAt||Date.now())
      };
    }
  });

  local.updatedAt=Math.max(Number(local.updatedAt||0),Number(server.updatedAt||0));
  saveLocal(local);
  return local;
}

function formatRaw(test,raw){
  if(!raw)return"—";
  if(test==="reaction")return Math.round(raw.medianMs)+" ms";
  if(test==="click")return Number(raw.cps).toFixed(2)+" CPS";
  if(test==="tracking")return Number(raw.accuracy).toFixed(1)+"%";
  if(test==="flick")return Math.round(raw.avgMs)+" ms · "+Number(raw.accuracy).toFixed(1)+"%";
  if(test==="switching")return Math.round(raw.avgMs)+" ms · "+Number(raw.accuracy).toFixed(1)+"%";
  if(test==="precision")return Number(raw.precision).toFixed(1)+"% · "+Math.round(raw.avgMs)+" ms";
  return"—";
}

window.BMSCore={
  STORAGE_KEY,TESTS,ORDER,clamp,scoreTest,ratingFromScores,
  loadLocal,saveLocal,saveLocalResult,scoresFromLocal,
  mergeServerProfile,formatRaw
};
})();