(function(){
"use strict";

const HOUSE_PROFILES=[
  {
    username:"HOUSE_RIVAL",
    badge:"HOUSE",
    rating:1568,
    overall:78.4,
    skillClass:"DIAMOND",
    scores:{reaction:79.2,flick:82.1,tracking:76.5,switching:80.4,precision:79.8,click:62.0}
  },
  {
    username:"DEMO_TRACKER",
    badge:"DEMO",
    rating:1486,
    overall:74.3,
    skillClass:"DIAMOND",
    scores:{reaction:71.5,flick:72.8,tracking:91.2,switching:70.6,precision:76.9,click:58.1}
  },
  {
    username:"HOUSE_FLICK",
    badge:"HOUSE",
    rating:1424,
    overall:71.2,
    skillClass:"DIAMOND",
    scores:{reaction:68.1,flick:92.0,tracking:64.8,switching:74.4,precision:69.9,click:55.2}
  },
  {
    username:"DEMO_ANCHOR",
    badge:"DEMO",
    rating:1338,
    overall:66.9,
    skillClass:"PLATINUM",
    scores:{reaction:72.4,flick:67.0,tracking:65.5,switching:61.8,precision:76.4,click:52.7}
  },
  {
    username:"HOUSE_ENTRY",
    badge:"HOUSE",
    rating:1212,
    overall:60.6,
    skillClass:"PLATINUM",
    scores:{reaction:61.0,flick:63.8,tracking:57.7,switching:60.2,precision:62.4,click:48.5}
  },
  {
    username:"DEMO_PRECISION",
    badge:"DEMO",
    rating:1176,
    overall:58.8,
    skillClass:"GOLD",
    scores:{reaction:55.2,flick:57.8,tracking:54.9,switching:56.1,precision:82.5,click:49.2}
  },
  {
    username:"HOUSE_REACT",
    badge:"HOUSE",
    rating:1098,
    overall:54.9,
    skillClass:"GOLD",
    scores:{reaction:90.0,flick:51.4,tracking:49.5,switching:50.8,precision:54.0,click:46.1}
  },
  {
    username:"DEMO_BALANCED",
    badge:"DEMO",
    rating:1036,
    overall:51.8,
    skillClass:"GOLD",
    scores:{reaction:52.0,flick:53.4,tracking:50.7,switching:51.1,precision:52.8,click:47.5}
  }
];

const SKILL_RAW={
  reaction:[
    {username:"HOUSE_REFLEX",badge:"HOUSE",score:94.8,raw:{medianMs:163}},
    {username:"DEMO_RIVAL",badge:"DEMO",score:88.0,raw:{medianMs:180}},
    {username:"HOUSE_BASE",badge:"HOUSE",score:76.0,raw:{medianMs:210}}
  ],
  flick:[
    {username:"HOUSE_FLICK",badge:"HOUSE",score:92.0,raw:{avgMs:326,accuracy:96.0}},
    {username:"DEMO_RIVAL",badge:"DEMO",score:83.7,raw:{avgMs:382,accuracy:94.0}},
    {username:"HOUSE_BASE",badge:"HOUSE",score:70.5,raw:{avgMs:455,accuracy:91.0}}
  ],
  tracking:[
    {username:"DEMO_TRACKER",badge:"DEMO",score:91.2,raw:{accuracy:91.2}},
    {username:"HOUSE_RIVAL",badge:"HOUSE",score:82.4,raw:{accuracy:82.4}},
    {username:"HOUSE_BASE",badge:"HOUSE",score:71.0,raw:{accuracy:71.0}}
  ],
  switching:[
    {username:"HOUSE_SWITCH",badge:"HOUSE",score:90.1,raw:{avgMs:327,accuracy:96.0}},
    {username:"DEMO_RIVAL",badge:"DEMO",score:82.5,raw:{avgMs:373,accuracy:94.0}},
    {username:"HOUSE_BASE",badge:"HOUSE",score:69.2,raw:{avgMs:451,accuracy:90.0}}
  ],
  precision:[
    {username:"HOUSE_PIXEL",badge:"HOUSE",score:92.3,raw:{precision:95.0,avgMs:425}},
    {username:"DEMO_RIVAL",badge:"DEMO",score:84.0,raw:{precision:87.5,avgMs:510}},
    {username:"HOUSE_BASE",badge:"HOUSE",score:72.5,raw:{precision:76.0,avgMs:610}}
  ],
  click:[
    {username:"HOUSE_CPS",badge:"HOUSE",score:94.0,raw:{cps:9.58}},
    {username:"DEMO_RIVAL",badge:"DEMO",score:80.0,raw:{cps:8.60}},
    {username:"HOUSE_BASE",badge:"HOUSE",score:62.0,raw:{cps:7.34}}
  ]
};

function fillProfiles(realRows,minRows=8){
  const real=Array.isArray(realRows)?realRows:[];
  if(real.length>=minRows)return real;
  const needed=minRows-real.length;
  return real.concat(HOUSE_PROFILES.slice(0,needed).map(row=>({...row,isHouse:true})));
}

function fillSkill(test,realRows,minRows=5){
  const real=Array.isArray(realRows)?realRows:[];
  if(real.length>=minRows)return real;
  const seeds=SKILL_RAW[test]||[];
  const needed=minRows-real.length;
  return real.concat(seeds.slice(0,needed).map(row=>({...row,isHouse:true})));
}

window.BMSHouse={HOUSE_PROFILES,SKILL_RAW,fillProfiles,fillSkill};
})();