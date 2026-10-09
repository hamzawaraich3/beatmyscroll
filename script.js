/* =========================================================
   BEAT MY SCROLL
   Speed-based scoring + rush combos + hyperspace
========================================================= */

const INACTIVITY_LIMIT = 1500;
const MAX_INPUT = 180;

const BASE_SCORE_RATE = 0.045;
const SPEED_REFERENCE = 850;
const SPEED_CURVE = 1.25;
const SPEED_GAIN = 1.6;
const MAX_SCORE_MULTIPLIER = 8;

// One game "scroll" is 100 normalized input units.
// This gives us a device-agnostic-ish speed stat similar to WPM.
const SCROLL_UNIT = 100;

const BOOST_EVENT_CAP = 45;
const BOOST_PROGRESS_COOLDOWN = 24;
const BOOST_FIRST_DELAY = 4000;
const BOOST_MIN_GAP = 3400;
const BOOST_MAX_GAP = 5200;
const COMBO_DURATION = 7000;

const BOOST_TIERS = [
  {
    multiplier: 1.2,
    weight: 34,
    required: 180,
    window: 2050,
    minRate: 650,
    color: "#b7ff32"
  },
  {
    multiplier: 1.3,
    weight: 26,
    required: 240,
    window: 1900,
    minRate: 800,
    color: "#21e6ff"
  },
  {
    multiplier: 1.5,
    weight: 18,
    required: 330,
    window: 1700,
    minRate: 1050,
    color: "#8a5cff"
  },
  {
    multiplier: 2,
    weight: 12,
    required: 470,
    window: 1500,
    minRate: 1400,
    color: "#ff2bd6"
  },
  {
    multiplier: 4,
    weight: 7,
    required: 650,
    window: 1300,
    minRate: 1800,
    color: "#ff9d2e"
  },
  {
    multiplier: 5,
    weight: 3,
    required: 800,
    window: 1150,
    minRate: 2200,
    color: "#ff3b3b"
  }
];

const HYPERSPACE_RATE = 5200;

const SONIC_AVG_SPEED = 10;
const SONIC_CURRENT_SPEED = 12;

const GOKU_CURRENT_SPEED = 27;
const GOKU_AVG_SPEED = 14;
const GOKU_TRIGGER_HOLD = 700;
const GOKU_DURATION = 5000;

const NEAR_MAX_MIN_SPEED = 35;
const NEAR_MAX_TOLERANCE = 20;
const ALQUIMIA_HOLD = 5500;
const AURA_HOLD = 11000;
const AURA_SLOW_EXIT_SPEED = 25;
const STAGE_DROP_GRACE = 1200;


/* =========================================================
   ELEMENTS
========================================================= */

const body = document.body;

const qualityOverride =
  new URLSearchParams(window.location.search).get("quality");

const reportedMemory =
  Number(navigator.deviceMemory || 0);

const reportedCores =
  Number(navigator.hardwareConcurrency || 0);

const prefersReducedMotion =
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const saveDataEnabled =
  Boolean(
    navigator.connection &&
    navigator.connection.saveData
  );

let liteMode =
  qualityOverride !== "full" &&
  (
    qualityOverride === "lite" ||
    saveDataEnabled ||
    prefersReducedMotion ||
    (reportedMemory > 0 && reportedMemory <= 4) ||
    (reportedCores > 0 && reportedCores <= 4)
  );

body.classList.toggle("lite-mode", liteMode);

let slowFrameCount = 0;
let lastVisualPaint = 0;
let lastHudPaint = 0;
let lastTimerPaint = 0;
let visualLineLimit = liteMode ? 10 : 24;
let lastSpeedBand = -1;
let dangerCritical = false;
let lastBoostPaint = 0;

const scoreFormatter =
  new Intl.NumberFormat();

function enableLiteMode() {
  if (liteMode || qualityOverride === "full") return;

  liteMode = true;
  visualLineLimit = 10;
  body.classList.add("lite-mode");
}

const startScreen = document.getElementById("start-screen");
const gameScreen = document.getElementById("game-screen");
const gameOverScreen = document.getElementById("game-over");
const startButton = document.getElementById("start-button");
const startButtonBottom = document.getElementById("start-button-bottom");

const scoreDisplay = document.getElementById("score");
const timerDisplay = document.getElementById("timer");
const speedDisplay = document.getElementById("speed-display");
const comboDisplay = document.getElementById("combo-display");
const bestScoreDisplay = document.getElementById("best-score");

const finalScoreDisplay = document.getElementById("final-score");
const finalTimeDisplay = document.getElementById("final-time");
const finalAvgSpeedDisplay = document.getElementById("final-avg-speed");
const finalSpeedDisplay = document.getElementById("final-speed");
const finalComboDisplay = document.getElementById("final-combo");
const finalBestDisplay = document.getElementById("final-best");

const gameMessage = document.getElementById("game-message");
const distanceMarker = document.getElementById("distance-marker");
const dangerFill = document.getElementById("danger-fill");

const retryButton = document.getElementById("retry-button");
const shareButton = document.getElementById("share-button");
const shareStatus = document.getElementById("share-status");
const newBestDisplay = document.getElementById("new-best");

const grid = document.querySelector(".grid");
const speedLinesContainer = document.getElementById("speed-lines");

const challengeBox = document.getElementById("challenge-box");
const challengeScoreDisplay = document.getElementById("challenge-score");
const challengeTarget = document.getElementById("challenge-target");
const challengeTargetScore = document.getElementById("challenge-target-score");

const boostTarget = document.getElementById("boost-target");
const boostApproach = document.getElementById("boost-approach");
const boostCore = document.getElementById("boost-core");
const boostProgressDisplay = document.getElementById("boost-progress");
const boostRewardDisplay = document.getElementById("boost-reward");
const boostToast = document.getElementById("boost-toast");

const momentCard = document.getElementById("moment-card");
const momentImage = document.getElementById("moment-image");
const momentLabel = document.getElementById("moment-label");
const soundToggle = document.getElementById("sound-toggle");


/* =========================================================
   GAME STATE
========================================================= */

let state = "waiting";

let score = 0;

// scrollRate = uncapped raw input speed for stats / visuals.
// scoringRate = normalized capped speed for fair score scaling.
let scrollRate = 0;
let scoringRate = 0;
let multiplier = 1;

let currentSpeed = 0;
let maxSpeed = 0;
let totalScrollDistance = 0;

let comboMultiplier = 1;
let maxCombo = 1;
let comboExpiresAt = 0;

let startTime = 0;
let lastInputTime = 0;
let lastInputEventTime = 0;
let lastFrameTime = performance.now();

let visualDistance = 0;
let velocity = 0;

let previousTouchY = null;
let finalElapsed = 0;
let lastMilestone = -1;

let boostActive = false;
let boostProgress = 0;
let boostStartedAt = 0;
let boostDeadline = 0;
let nextBoostAt = Infinity;
let boostToastTimer = null;
let lastBoostProgressAt = 0;
let currentBoostTier = BOOST_TIERS[0];

let powerStage = "normal";
let gokuTriggered = false;
let gokuUntil = 0;
let highBurstStart = 0;
let nearMaxHoldStart = 0;
let stageDropStart = 0;
let wasHyperspace = false;

let lastScorePopBucket = -1;
let lastSpeedPopBucket = -1;
let messageAnimTimer = null;

const urlParams = new URLSearchParams(window.location.search);
const parsedChallengeScore = Number(urlParams.get("score"));

const challengeScore =
  Number.isFinite(parsedChallengeScore) && parsedChallengeScore > 0
    ? Math.min(Math.floor(parsedChallengeScore), 1000000000000)
    : 0;

let challengeBeaten = false;
let challengeMessageLockUntil = 0;


/* =========================================================
   MEDIA + SOUND
========================================================= */


window.BMS_MEDIA = window.BMS_MEDIA || {};
const MEDIA = window.BMS_MEDIA;

const MOMENT_MEDIA_SCRIPTS = {
  sonicImage: "media/sonic-image.js",
  gokuImage: "media/goku-image.js",
  knightImage: "media/knight-image.js",
  auraImage: "media/aura-image.js"
};

const momentMediaPromises = new Map();

function loadMomentMedia(imageKey) {
  if (MEDIA[imageKey]) {
    return Promise.resolve(MEDIA[imageKey]);
  }

  if (momentMediaPromises.has(imageKey)) {
    return momentMediaPromises.get(imageKey);
  }

  const src = MOMENT_MEDIA_SCRIPTS[imageKey];

  if (!src) {
    return Promise.reject(
      new Error("Unknown moment media: " + imageKey)
    );
  }

  const promise = new Promise(function(resolve, reject) {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;

    script.onload = function() {
      if (MEDIA[imageKey]) {
        resolve(MEDIA[imageKey]);
      } else {
        reject(new Error("Moment media did not register."));
      }
    };

    script.onerror = function() {
      reject(new Error("Moment media failed to load."));
    };

    document.head.appendChild(script);
  });

  momentMediaPromises.set(imageKey, promise);
  return promise;
}

// Full-quality MP3s are real static files now, so no legacy audio
// scripts or availability probe is needed.
const HQ_AUDIO = {
  click: "audio/click.mp3",
  sonic: "audio/sonic.mp3",
  goku: "audio/goku.mp3",
  alquimia: "audio/alquimia.mp3",
  aura: "audio/aura.mp3",
  fahh: "audio/fahh.mp3"
};

// Auditory balance based on measured levels in the user-provided
// recordings. Alquimia is much louder than Sonic at the source.
const AUDIO_VOLUME = {
  click: 0.42,
  sonic: 0.68,
  goku: 0.40,
  alquimia: 0.16,
  aura: 0.36,
  fahh: 0.80
};

let audioUnlocked = false;
let audioUnlockInFlight = false;

let currentMusicKey = null;
let desiredMusicKey = null;
let musicRequestId = 0;
let sonicDropStartedAt = 0;
let musicRetryTimer = null;

const musicFades = new Map();
const playingEffects = new Set();

let soundEnabled =
  localStorage.getItem("beatMyScrollSound") !== "off";

function createAudioBank() {
  const bank = {};

  for (const key of Object.keys(HQ_AUDIO)) {
    const element = new Audio();

    // Create every media element synchronously at page load so the first
    // genuine user gesture can unlock it reliably. Large files still do not
    // download until needed.
    element.preload =
      key === "click"
        ? "auto"
        : "none";

    element.src = HQ_AUDIO[key];
    element.volume = AUDIO_VOLUME[key];
    element.loop =
      ["sonic", "alquimia", "aura"].includes(key);

    bank[key] = element;
  }

  return bank;
}

// Important: synchronous construction removes the old race where the first
// click happened before the audio elements existed.
const audioBank = createAudioBank();

function ensureAudioBank() {
  return Promise.resolve(audioBank);
}

function warmAudioForRun() {
  // Sonic is the first long track players normally reach. Start fetching it
  // once PLAY has been pressed, not on landing-page load.
  const sonic = audioBank.sonic;

  if (
    sonic &&
    sonic.preload !== "auto"
  ) {
    sonic.preload = "auto";

    try {
      sonic.load();
    } catch (error) {}
  }

  // Small one-shot effects are cheap enough to prepare after PLAY.
  ["goku", "fahh"].forEach(function(key) {
    const track = audioBank[key];

    if (!track || track.preload === "auto") {
      return;
    }

    track.preload = "auto";

    try {
      track.load();
    } catch (error) {}
  });
}

function updateSoundButton() {
  soundToggle.textContent = soundEnabled
    ? (audioUnlocked ? "SOUND: ON" : "TAP FOR SOUND")
    : "SOUND: OFF";

  soundToggle.classList.toggle("muted", !soundEnabled);
}

function unlockAudio() {
  if (
    !soundEnabled ||
    audioUnlocked ||
    audioUnlockInFlight
  ) {
    return;
  }

  audioUnlockInFlight = true;

  // This call happens synchronously inside pointer/touch/key/click gestures.
  const click = audioBank.click;
  const normalVolume = click.volume;
  const normalMuted = click.muted;

  click.muted = true;
  click.volume = 0;

  const finishUnlock = function() {
    click.pause();

    try {
      click.currentTime = 0;
    } catch (error) {}

    click.muted = normalMuted;
    click.volume = normalVolume;

    audioUnlockInFlight = false;
    audioUnlocked = true;

    updateSoundButton();

    if (state === "playing") {
      syncStageMedia();
    }
  };

  const failUnlock = function() {
    click.muted = normalMuted;
    click.volume = normalVolume;

    audioUnlockInFlight = false;
    audioUnlocked = false;

    updateSoundButton();
  };

  try {
    const playing = click.play();

    // Older browsers sometimes return undefined instead of a Promise.
    if (
      playing &&
      typeof playing.then === "function"
    ) {
      playing
        .then(finishUnlock)
        .catch(failUnlock);
    } else {
      finishUnlock();
    }
  } catch (error) {
    failUnlock();
  }
}

function cancelFade(track) {
  const id = musicFades.get(track);
  if (id !== undefined) {
    cancelAnimationFrame(id);
    musicFades.delete(track);
  }
}

function fadeTrack(track, destination, duration, pauseWhenDone) {
  if (!track) return;

  cancelFade(track);

  const initial = track.volume;
  const started = performance.now();

  function tick(now) {
    const progress = Math.min(1, (now - started) / duration);
    const eased = progress * progress * (3 - 2 * progress);
    track.volume = Math.max(0, Math.min(1,
      initial + (destination - initial) * eased
    ));

    if (progress >= 1) {
      musicFades.delete(track);
      if (pauseWhenDone) track.pause();
      return;
    }

    musicFades.set(track, requestAnimationFrame(tick));
  }

  musicFades.set(track, requestAnimationFrame(tick));
}

function clearMusicRetry() {
  if (musicRetryTimer) {
    clearTimeout(musicRetryTimer);
    musicRetryTimer = null;
  }
}

function scheduleMusicRetry(key, requestId, delay) {
  clearMusicRetry();

  musicRetryTimer = setTimeout(function() {
    musicRetryTimer = null;

    if (
      !soundEnabled ||
      state !== "playing" ||
      desiredMusicKey !== key ||
      requestId !== musicRequestId
    ) {
      return;
    }

    // Force a fresh attempt even if the stage itself never changed.
    desiredMusicKey = null;
    playMusic(key);
  }, delay || 500);
}

function stopMusic() {
  clearMusicRetry();
  desiredMusicKey = null;
  musicRequestId += 1;
  currentMusicKey = null;

  if (!audioBank) return;

  ["sonic", "alquimia", "aura"].forEach(function(key) {
    const track = audioBank[key];
    if (!track.paused) {
      fadeTrack(track, 0, 360, true);
    }
  });
}

function playMusic(key) {
  if (!soundEnabled) return;

  if (
    desiredMusicKey === key &&
    currentMusicKey === key &&
    audioBank[key] &&
    !audioBank[key].paused
  ) {
    return;
  }

  clearMusicRetry();

  desiredMusicKey = key;
  const requestId = ++musicRequestId;
  const incoming = audioBank[key];

  if (!incoming) return;

  const outgoing =
    currentMusicKey
      ? audioBank[currentMusicKey]
      : null;

  cancelFade(incoming);

  // Ask the browser for the file now. This keeps landing-page load light but
  // avoids waiting until the exact millisecond the stage transition happens.
  if (incoming.preload !== "auto") {
    incoming.preload = "auto";

    try {
      incoming.load();
    } catch (error) {}
  }

  incoming.volume = 0;

  if (incoming.paused) {
    try {
      incoming.currentTime = 0;
    } catch (error) {}
  }

  const onStarted = function() {
    if (
      requestId !== musicRequestId ||
      desiredMusicKey !== key ||
      state !== "playing"
    ) {
      incoming.pause();
      return;
    }

    currentMusicKey = key;
    audioUnlocked = true;
    updateSoundButton();

    fadeTrack(
      incoming,
      AUDIO_VOLUME[key],
      440,
      false
    );

    if (outgoing && outgoing !== incoming) {
      fadeTrack(outgoing, 0, 350, true);
    }
  };

  const onFailed = function(error) {
    if (
      requestId !== musicRequestId ||
      desiredMusicKey !== key
    ) {
      return;
    }

    currentMusicKey = null;

    // NotAllowedError means the browser wants another user gesture.
    // Network/ready-state failures are retried automatically.
    if (
      error &&
      error.name === "NotAllowedError"
    ) {
      audioUnlocked = false;
      updateSoundButton();
      return;
    }

    scheduleMusicRetry(key, requestId, 450);
  };

  try {
    const playing = incoming.play();

    if (
      playing &&
      typeof playing.then === "function"
    ) {
      playing
        .then(onStarted)
        .catch(onFailed);
    } else {
      onStarted();
    }
  } catch (error) {
    onFailed(error);
  }
}

function playSfx(key, playbackRate) {
  if (!soundEnabled) return;

  const requestId = musicRequestId;

  // Prevent simultaneous overlapping copies of the same scream / click.
  for (const effect of playingEffects) {
    if (effect.dataset && effect.dataset.effect === key) {
      effect.pause();
      playingEffects.delete(effect);
    }
  }

  void ensureAudioBank().then(function(bank) {
    if (!bank || !soundEnabled) return;
    if (
      requestId !== musicRequestId &&
      key !== "fahh" &&
      key !== "click"
    ) {
      return;
    }

    const original = bank[key];
    if (!original) return;

    const sound = new Audio(original.src);
    sound.preload = "auto";
    sound.volume = AUDIO_VOLUME[key] || 0.5;
    sound.playbackRate = playbackRate || 1;
    sound.dataset.effect = key;

    playingEffects.add(sound);

    const cleanup = function() {
      playingEffects.delete(sound);
    };

    sound.addEventListener("ended", cleanup, { once: true });
    sound.addEventListener("error", cleanup, { once: true });

    try {
      const playing = sound.play();
      if (playing && typeof playing.catch === "function") {
        playing.catch(cleanup);
      }
    } catch (error) {
      cleanup();
    }
  });
}

function stopAllAudio() {
  clearMusicRetry();
  desiredMusicKey = null;
  currentMusicKey = null;
  musicRequestId += 1;

  for (const track of musicFades.keys()) {
    cancelFade(track);
  }

  if (audioBank) {
    for (const track of Object.values(audioBank)) {
      track.pause();
      try { track.currentTime = 0; } catch (error) {}
    }
  }

  for (const effect of playingEffects) {
    effect.pause();
  }
  playingEffects.clear();
}

soundToggle.addEventListener("click", function() {
  soundEnabled = !soundEnabled;
  localStorage.setItem(
    "beatMyScrollSound",
    soundEnabled ? "on" : "off"
  );

  if (soundEnabled) {
    unlockAudio();
    playSfx("click");
    if (state === "playing") syncStageMedia();
  } else {
    stopAllAudio();
  }
  updateSoundButton();
});

["pointerdown", "touchstart", "keydown", "wheel"].forEach(function(name) {
  window.addEventListener(name, unlockAudio, { passive: true });
});

momentImage.addEventListener(
  "error",
  function() {
    momentCard.classList.add("hidden");
  }
);

updateSoundButton();


/* =========================================================
   PERSONAL BEST + CHALLENGE
========================================================= */

let personalBest =
  Number(localStorage.getItem("beatMyScrollBest")) || 0;

bestScoreDisplay.textContent =
  scoreFormatter.format(personalBest);

if (challengeScore > 0) {
  challengeBox.classList.remove("hidden");
  challengeScoreDisplay.textContent = challengeScore.toLocaleString();
  challengeTargetScore.textContent = challengeScore.toLocaleString();
}


/* =========================================================
   MESSAGES
========================================================= */

const messages = [
  "KEEP SCROLLING",
  "FASTER.",
  "DON'T STOP",
  "OKAY...",
  "YOU'RE ACTUALLY TRYING",
  "KEEP GOING",
  "NO BREAKS",
  "YOUR THUMB IS WARMING UP",
  "THERE IS NO BOTTOM",
  "THIS WAS YOUR IDEA",
  "WHY ARE YOU DOING THIS?",
  "TOO LATE TO QUIT",
  "YOUR MOUSE IS BEGGING YOU",
  "SCROLL HARDER",
  "YOU HAVE A PROBLEM",
  "PLEASE SEEK GRASS",
  "THIS IS YOUR LIFE NOW",
  "THE INTERNET WAS A MISTAKE",
  "ERROR: PLAYER REFUSES TO STOP",
  "YOU'VE GONE TOO FAR"
];


/* =========================================================
   SPEED LINES
========================================================= */

const speedLines = [];

for (let i = 0; i < 24; i++) {
  const line = document.createElement("div");

  line.className = "speed-line";
  line.style.left = (Math.random() * 100) + "%";
  line.style.height = (12 + Math.random() * 44) + "px";
  line.dataset.offset = Math.random() * window.innerHeight;

  speedLinesContainer.appendChild(line);
  speedLines.push(line);
}


/* =========================================================
   HELPERS
========================================================= */

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomBoostGap() {
  return (
    BOOST_MIN_GAP +
    Math.random() * (BOOST_MAX_GAP - BOOST_MIN_GAP)
  );
}

function formatCombo(value) {
  return (
    "×" +
    Number(value.toFixed(1)).toString()
  );
}

function pickBoostTier() {
  const totalWeight =
    BOOST_TIERS.reduce(
      function(sum, tier) {
        return sum + tier.weight;
      },
      0
    );

  let roll =
    Math.random() * totalWeight;

  for (const tier of BOOST_TIERS) {
    roll -= tier.weight;

    if (roll <= 0) {
      return tier;
    }
  }

  return BOOST_TIERS[0];
}

function getAverageSpeed(now) {
  if (state !== "playing") {
    return 0;
  }

  const seconds =
    Math.max(
      (now - startTime) / 1000,
      0.001
    );

  return (
    totalScrollDistance /
    SCROLL_UNIT /
    seconds
  );
}

function animateNumber(element) {
  if (liteMode) return;

  element.classList.remove("number-pop");

  void element.offsetWidth;

  element.classList.add("number-pop");

  setTimeout(function() {
    element.classList.remove("number-pop");
  }, 260);
}

function slamGameMessage(message, color) {
  if (liteMode) {
    gameMessage.textContent = message;
    gameMessage.style.color = color || "";
    return;
  }

  if (messageAnimTimer) {
    clearTimeout(messageAnimTimer);
  }

  gameMessage.classList.remove(
    "crumble-text",
    "slam-text"
  );

  gameMessage.textContent = message;
  gameMessage.style.color = color || "";

  void gameMessage.offsetWidth;

  gameMessage.classList.add("slam-text");

  messageAnimTimer = setTimeout(
    function() {
      gameMessage.classList.remove("slam-text");
    },
    380
  );
}

function crumbleToMessage(message) {
  if (liteMode) {
    gameMessage.textContent = message;
    gameMessage.style.color = "";
    return;
  }

  if (messageAnimTimer) {
    clearTimeout(messageAnimTimer);
  }

  gameMessage.classList.remove("slam-text");
  gameMessage.classList.add("crumble-text");

  messageAnimTimer = setTimeout(
    function() {
      gameMessage.classList.remove("crumble-text");
      gameMessage.textContent = message;
      gameMessage.style.color = "";

      void gameMessage.offsetWidth;

      gameMessage.classList.add("slam-text");

      messageAnimTimer = setTimeout(
        function() {
          gameMessage.classList.remove("slam-text");
        },
        360
      );
    },
    175
  );
}

function impactBurst(kind, count, gap) {
  const total =
    liteMode
      ? 1
      : (count || 2);

  const spacing = gap || 150;

  for (let i = 0; i < total; i++) {
    setTimeout(function() {
      triggerImpact(kind);
    }, i * spacing);
  }
}

function triggerImpact(kind) {
  if (liteMode) {
    body.classList.remove(
      "impact-frame",
      "impact-gold",
      "impact-cyan",
      "impact-pink",
      "impact-green"
    );

    body.classList.add(
      "impact-frame",
      "impact-" + kind
    );

    setTimeout(function() {
      body.classList.remove(
        "impact-frame",
        "impact-gold",
        "impact-cyan",
        "impact-pink",
        "impact-green"
      );
    }, 260);

    return;
  }

  body.classList.remove(
    "impact-frame",
    "impact-gold",
    "impact-cyan",
    "impact-pink",
    "impact-green"
  );

  void body.offsetWidth;

  body.classList.add(
    "impact-frame",
    "impact-" + kind
  );

  setTimeout(function() {
    body.classList.remove(
      "impact-frame",
      "impact-gold",
      "impact-cyan",
      "impact-pink",
      "impact-green"
    );
  }, 520);
}

function showMoment(imageKey, label, color) {
  momentCard.style.setProperty(
    "--moment-color",
    color
  );

  momentImage.alt = label;
  momentLabel.textContent = label;
  momentCard.classList.remove("hidden");

  if (MEDIA[imageKey]) {
    momentImage.src = MEDIA[imageKey];
    return;
  }

  momentImage.removeAttribute("src");

  void loadMomentMedia(imageKey)
    .then(function(src) {
      if (momentLabel.textContent === label) {
        momentImage.src = src;
      }
    })
    .catch(function() {
      // Keep the stage label/effect even if optional art fails.
      momentImage.removeAttribute("src");
    });
}

function hideMoment() {
  momentCard.classList.add("hidden");
}

function syncStageMedia() {
  if (!soundEnabled) return;

  if (powerStage === "sonic") {
    playMusic("sonic");
  } else if (powerStage === "alquimia") {
    playMusic("alquimia");
  } else if (powerStage === "aura") {
    playMusic("aura");
  } else if (
    powerStage === "normal" ||
    powerStage === "goku"
  ) {
    stopMusic();
  }
}

function setPowerStage(nextStage, now) {
  if (powerStage === nextStage) {
    if (nextStage === "sonic") sonicDropStartedAt = 0;
    return;
  }

  // A tiny dip around the speed threshold should not restart a song.
  if (powerStage === "sonic" && nextStage === "normal") {
    if (!sonicDropStartedAt) sonicDropStartedAt = now;
    if (now - sonicDropStartedAt < 1100) return;
  } else {
    sonicDropStartedAt = 0;
  }

  powerStage = nextStage;

  body.classList.remove(
    "stage-sonic",
    "stage-goku",
    "stage-alquimia",
    "stage-aura"
  );

  if (nextStage === "normal") {
    hideMoment();
    stopMusic();
    return;
  }

  body.classList.add(
    "stage-" + nextStage
  );

  if (nextStage === "sonic") {
    showMoment(
      "sonicImage",
      "GOTTA GO FAST",
      "#21e6ff"
    );

    playMusic("sonic");
  }

  if (nextStage === "goku") {
    stopMusic();

    showMoment(
      "gokuImage",
      "POWERING UP",
      "#ffe75d"
    );

    playSfx("goku");

    gokuUntil =
      now + GOKU_DURATION;

    impactBurst("gold", 3, 145);
    slamGameMessage("POWER UP", "#ffe75d");
  }

  if (nextStage === "alquimia") {
    showMoment(
      "knightImage",
      "LOCKED IN",
      "#ff2bd6"
    );

    playMusic("alquimia");

    impactBurst("pink", 2, 170);
    slamGameMessage("LOCKED IN", "#ff2bd6");
  }

  if (nextStage === "aura") {
    showMoment(
      "auraImage",
      "AURA MODE",
      "#b7ff32"
    );

    playMusic("aura");

    impactBurst("green", 3, 125);
    slamGameMessage("AURA MONSTER", "#b7ff32");
  }
}

function updatePowerStage(now) {
  const averageSpeed =
    getAverageSpeed(now);

  const sonicReady =
    averageSpeed >= SONIC_AVG_SPEED &&
    currentSpeed >= SONIC_CURRENT_SPEED;

  const gokuReady =
    averageSpeed >= GOKU_AVG_SPEED &&
    currentSpeed >= GOKU_CURRENT_SPEED;

  if (!gokuTriggered) {
    if (gokuReady) {
      if (!highBurstStart) {
        highBurstStart = now;
      }

      if (
        now - highBurstStart >=
        GOKU_TRIGGER_HOLD
      ) {
        gokuTriggered = true;
        setPowerStage("goku", now);
      }
    } else {
      highBurstStart = 0;
    }
  }

  const recentPeak =
    Math.min(maxSpeed, 75);

  const nearMaxThreshold =
    Math.max(
      NEAR_MAX_MIN_SPEED,
      recentPeak - NEAR_MAX_TOLERANCE
    );

  const nearMax =
    currentSpeed >= nearMaxThreshold;

  if (nearMax) {
    stageDropStart = 0;

    if (!nearMaxHoldStart) {
      nearMaxHoldStart = now;
    }
  } else if (powerStage !== "aura") {
    if (
      powerStage === "alquimia"
    ) {
      if (!stageDropStart) {
        stageDropStart = now;
      }

      if (
        now - stageDropStart >=
        STAGE_DROP_GRACE
      ) {
        nearMaxHoldStart = 0;

        setPowerStage(
          sonicReady ? "sonic" : "normal",
          now
        );
      }
    } else if (powerStage !== "goku") {
      nearMaxHoldStart = 0;
    }
  }

  const heldNearMax =
    nearMaxHoldStart
      ? now - nearMaxHoldStart
      : 0;

  if (powerStage === "aura") {
    if (currentSpeed < AURA_SLOW_EXIT_SPEED) {
      if (!stageDropStart) {
        stageDropStart = now;
      }

      if (
        now - stageDropStart >=
        STAGE_DROP_GRACE
      ) {
        nearMaxHoldStart = 0;
        stageDropStart = 0;

        setPowerStage(
          sonicReady ? "sonic" : "normal",
          now
        );
      }
    } else {
      stageDropStart = 0;
    }

    return;
  }

  if (
    gokuTriggered &&
    heldNearMax >= AURA_HOLD
  ) {
    setPowerStage("aura", now);
    return;
  }

  if (
    gokuTriggered &&
    heldNearMax >= ALQUIMIA_HOLD &&
    powerStage !== "goku"
  ) {
    setPowerStage("alquimia", now);
    return;
  }

  if (powerStage === "goku") {
    if (now < gokuUntil) {
      return;
    }

    if (heldNearMax >= ALQUIMIA_HOLD) {
      setPowerStage("alquimia", now);
    } else {
      setPowerStage(
        sonicReady ? "sonic" : "normal",
        now
      );
    }

    return;
  }

  if (
    powerStage !== "alquimia"
  ) {
    setPowerStage(
      sonicReady ? "sonic" : "normal",
      now
    );
  }
}

function calculateSpeedMultiplier() {
  const normalized =
    Math.max(0, scoringRate) / SPEED_REFERENCE;

  return (
    1 +
    Math.min(
      MAX_SCORE_MULTIPLIER - 1,
      Math.pow(normalized, SPEED_CURVE) * SPEED_GAIN
    )
  );
}

function updateHUD(force) {
  const now = performance.now();
  const interval = liteMode ? 90 : 45;

  if (!force && now - lastHudPaint < interval) {
    return;
  }

  lastHudPaint = now;

  const roundedScore = Math.floor(score);

  scoreDisplay.textContent =
    scoreFormatter.format(roundedScore);

  distanceMarker.textContent =
    scoreFormatter.format(roundedScore);

  const scorePopBucket =
    Math.floor(roundedScore / 100);

  if (scorePopBucket > lastScorePopBucket) {
    lastScorePopBucket = scorePopBucket;

    if (roundedScore > 0) {
      animateNumber(scoreDisplay);
    }
  }

  currentSpeed =
    Math.max(0, scrollRate) / SCROLL_UNIT;

  speedDisplay.innerHTML =
    currentSpeed.toFixed(1) +
    ' <small>scrolls/s</small>';

  const speedPopBucket =
    Math.floor(currentSpeed / 10);

  if (
    speedPopBucket > lastSpeedPopBucket &&
    currentSpeed >= 10
  ) {
    lastSpeedPopBucket = speedPopBucket;
    animateNumber(speedDisplay);
  }

  comboDisplay.textContent =
    formatCombo(comboMultiplier);

  if (
    challengeScore > 0 &&
    !challengeBeaten &&
    roundedScore >= challengeScore
  ) {
    challengeBeaten = true;
    challengeMessageLockUntil = performance.now() + 1200;

    challengeTarget.classList.add("hidden");

    triggerImpact("green");
    slamGameMessage(
      "TARGET DESTROYED",
      "#b7ff32"
    );
  }
}


/* =========================================================
   RUSH COMBO TARGETS
========================================================= */

function scheduleNextBoost(now, first) {
  if (first) {
    nextBoostAt = now + BOOST_FIRST_DELAY;
  } else {
    nextBoostAt = now + randomBoostGap();
  }
}

function spawnBoost(now) {
  if (state !== "playing" || boostActive) return;

  boostActive = true;
  boostProgress = 0;
  lastBoostProgressAt = 0;
  lastBoostPaint = 0;
  currentBoostTier = pickBoostTier();
  boostStartedAt = now;
  boostDeadline =
    now + currentBoostTier.window;

  const left = 22 + Math.random() * 56;
  const top = 34 + Math.random() * 34;

  boostTarget.style.left = left + "%";
  boostTarget.style.top = top + "%";

  boostTarget.style.setProperty(
    "--rush-color",
    currentBoostTier.color
  );

  boostCore.style.setProperty("--boost-fill", "0deg");
  boostRewardDisplay.textContent =
    formatCombo(currentBoostTier.multiplier);

  boostProgressDisplay.textContent = "0%";

  boostApproach.style.transform = "scale(1.8)";
  boostApproach.style.opacity = "0.38";

  boostTarget.classList.remove("hidden");
}

function showBoostToast(text, missed) {
  if (boostToastTimer) {
    clearTimeout(boostToastTimer);
  }

  boostToast.textContent = text;
  boostToast.classList.toggle("missed", Boolean(missed));
  boostToast.classList.add("visible");

  boostToastTimer = setTimeout(function() {
    boostToast.classList.remove("visible");
  }, 850);
}

function finishBoost(success, now) {
  if (!boostActive) return;

  boostActive = false;
  boostTarget.classList.add("hidden");

  if (success) {
    comboMultiplier =
      Math.max(
        comboMultiplier,
        currentBoostTier.multiplier
      );

    maxCombo =
      Math.max(maxCombo, comboMultiplier);

    comboExpiresAt =
      now + COMBO_DURATION;

    showBoostToast(
      "RUSH " + formatCombo(currentBoostTier.multiplier),
      false
    );
  } else {
    comboMultiplier = 1;
    comboExpiresAt = 0;

    showBoostToast(
      "RUSH MISSED",
      true
    );
  }

  scheduleNextBoost(now, false);
  updateHUD();
}

function updateBoost(now) {
  if (!boostActive) return;

  if (
    liteMode &&
    now - lastBoostPaint < 33
  ) {
    if (now >= boostDeadline) {
      finishBoost(false, now);
    }
    return;
  }

  lastBoostPaint = now;

  const timeRatio =
    clamp(
      (now - boostStartedAt) / currentBoostTier.window,
      0,
      1
    );

  const progressRatio =
    clamp(
      boostProgress / currentBoostTier.required,
      0,
      1
    );

  const approachScale =
    1.8 - timeRatio * 0.8;

  boostApproach.style.transform =
    "scale(" + approachScale.toFixed(3) + ")";

  boostApproach.style.opacity =
    String(Math.max(0.14, 0.38 - timeRatio * 0.12));

  boostCore.style.setProperty(
    "--boost-fill",
    (progressRatio * 360) + "deg"
  );

  boostProgressDisplay.textContent =
    Math.floor(progressRatio * 100) + "%";

  if (now >= boostDeadline) {
    finishBoost(false, now);
  }
}


/* =========================================================
   START GAME
========================================================= */

function startGame() {
  if (state !== "waiting") return;

  const now = performance.now();

  if (window.BMSLeaderboard) {
    window.BMSLeaderboard.onGameStart();
  }

  state = "playing";

  score = 0;
  scrollRate = 0;
  scoringRate = 0;
  multiplier = 1;

  currentSpeed = 0;
  maxSpeed = 0;
  totalScrollDistance = 0;

  comboMultiplier = 1;
  maxCombo = 1;
  comboExpiresAt = 0;

  velocity = 0;
  visualDistance = 0;

  boostActive = false;
  boostProgress = 0;
  boostTarget.classList.add("hidden");

  lastMilestone = -1;
  challengeBeaten = false;
  challengeMessageLockUntil = 0;

  powerStage = "normal";
  gokuTriggered = false;
  gokuUntil = 0;
  highBurstStart = 0;
  nearMaxHoldStart = 0;
  stageDropStart = 0;
  wasHyperspace = false;

  lastScorePopBucket = -1;
  lastSpeedPopBucket = -1;

  lastVisualPaint = 0;
  lastHudPaint = 0;
  lastTimerPaint = 0;
  slowFrameCount = 0;
  lastSpeedBand = -1;
  dangerCritical = false;
  lastBoostPaint = 0;

  startTime = now;
  lastInputTime = now;
  lastInputEventTime = 0;
  lastFrameTime = now;

  scheduleNextBoost(now, true);

  if (challengeScore > 0) {
    challengeTarget.classList.remove("hidden");
  }

  startScreen.classList.remove("active");
  gameOverScreen.classList.remove("active");
  gameScreen.classList.add("active");

  body.classList.remove("landing");
  body.classList.add("playing");

  body.classList.remove(
    "hyperspace",
    "stage-sonic",
    "stage-goku",
    "stage-alquimia",
    "stage-aura"
  );

  unlockAudio();
  warmAudioForRun();

  gameMessage.textContent = "GO.";
  gameMessage.style.color = "";

  updateHUD(true);
}


/* =========================================================
   SCROLL INPUT + SPEED-BASED SCORING
========================================================= */

function handleScrollInput(amount) {
  if (state === "gameover") return;

  const signedAmount = amount;

  const rawAmount =
    Math.abs(amount);

  if (rawAmount < 1) return;

  amount =
    Math.min(rawAmount, MAX_INPUT);

  if (state !== "playing") {
    return;
  }

  const now = performance.now();

  const rawEventDelta =
    lastInputEventTime > 0
      ? clamp(now - lastInputEventTime, 1, 250)
      : 100;

  const scoringEventDelta =
    clamp(rawEventDelta, 16, 250);

  lastInputEventTime = now;
  lastInputTime = now;

  const instantRawRate =
    (rawAmount / rawEventDelta) * 1000;

  const instantRate =
    (amount / scoringEventDelta) * 1000;

  scrollRate =
    scrollRate * 0.72 +
    instantRawRate * 0.28;

  scoringRate =
    scoringRate * 0.72 +
    instantRate * 0.28;

  multiplier =
    calculateSpeedMultiplier();

  currentSpeed =
    Math.max(0, scrollRate) / SCROLL_UNIT;

  maxSpeed =
    Math.max(maxSpeed, currentSpeed);

  totalScrollDistance += rawAmount;

  if (
    boostActive &&
    signedAmount > 0 &&
    instantRate >= currentBoostTier.minRate &&
    (
      lastBoostProgressAt === 0 ||
      now - lastBoostProgressAt >= BOOST_PROGRESS_COOLDOWN
    )
  ) {
    lastBoostProgressAt = now;

    const rushAmount =
      Math.min(amount, BOOST_EVENT_CAP);

    const rateBonus =
      clamp(
        instantRate / 5000,
        0.8,
        1.35
      );

    boostProgress +=
      rushAmount * rateBonus;

    if (boostProgress >= currentBoostTier.required) {
      finishBoost(true, now);
    }
  }

  const gained =
    amount *
    BASE_SCORE_RATE *
    multiplier *
    comboMultiplier;

  score += gained;

  velocity +=
    Math.min(70, gained * 0.35 + amount * 0.05);

  velocity =
    Math.min(velocity, 340);

  updateHUD();
  updateMessage();
}


/* =========================================================
   MOUSE + TRACKPAD
========================================================= */

window.addEventListener(
  "wheel",
  function(event) {
    if (state !== "playing") return;
    event.preventDefault();
    handleScrollInput(event.deltaY);
  },
  {
    passive: false
  }
);


/* =========================================================
   TOUCH
========================================================= */

window.addEventListener(
  "touchstart",
  function(event) {
    if (state !== "playing") return;
    if (!event.touches.length) return;

    previousTouchY =
      event.touches[0].clientY;
  },
  {
    passive: false
  }
);

window.addEventListener(
  "touchmove",
  function(event) {
    // Landing content and results must scroll normally on phones.
    if (state !== "playing") return;
    event.preventDefault();

    if (
      previousTouchY === null ||
      !event.touches.length
    ) {
      return;
    }

    const currentY =
      event.touches[0].clientY;

    const difference =
      previousTouchY - currentY;

    previousTouchY = currentY;

    handleScrollInput(
      difference * 1.4
    );
  },
  {
    passive: false
  }
);

window.addEventListener(
  "touchend",
  function() {
    previousTouchY = null;
  }
);


/* =========================================================
   KEYBOARD
========================================================= */

window.addEventListener(
  "keydown",
  function(event) {
    if (state !== "playing") {
      // Preserve normal keyboard navigation on the landing/results screens.
      return;
    }

    const scrollKeys = [
      "ArrowDown",
      "PageDown",
      " "
    ];

    if (scrollKeys.includes(event.key)) {
      event.preventDefault();

      // Keyboard remains usable, but is intentionally weaker
      // than rapid wheel / touch input.
      handleScrollInput(40);
    }

    if (
      event.key === "End" ||
      event.key === "Home" ||
      event.key === "PageUp" ||
      event.key === "ArrowUp"
    ) {
      event.preventDefault();
    }
  }
);


/* =========================================================
   MESSAGE SYSTEM
========================================================= */

function updateMessage() {
  if (performance.now() < challengeMessageLockUntil) {
    return;
  }

  const milestone =
    Math.floor(score / 750);

  if (milestone === lastMilestone) {
    return;
  }

  lastMilestone = milestone;

  let message;

  if (milestone < messages.length) {
    message = messages[milestone];
  } else {
    message =
      messages[
        Math.floor(
          Math.random() * messages.length
        )
      ];
  }

  crumbleToMessage(message);
}


/* =========================================================
   MAIN LOOP
========================================================= */

function gameLoop(now) {
  const rawFrameDelta =
    now - lastFrameTime;

  const frameDelta =
    clamp(rawFrameDelta, 1, 50);

  lastFrameTime = now;

  if (state === "playing") {
    // Devices that cannot sustain ~35fps automatically shed expensive
    // decoration. Gameplay timing/scoring remains on every animation frame.
    if (!liteMode && rawFrameDelta > 28) {
      slowFrameCount += 1;

      if (slowFrameCount >= 18) {
        enableLiteMode();
      }
    } else if (!liteMode) {
      slowFrameCount =
        Math.max(0, slowFrameCount - 1);
    }
    const elapsed =
      now - startTime;

    const idleTime =
      now - lastInputTime;

    const visualInterval =
      liteMode ? 33 : 16;

    const shouldPaintVisual =
      now - lastVisualPaint >= visualInterval;

    if (
      now - lastTimerPaint >=
      (liteMode ? 100 : 50)
    ) {
      lastTimerPaint = now;

      timerDisplay.textContent =
        (elapsed / 1000).toFixed(1) + "s";
    }

    const remaining =
      Math.max(
        0,
        1 -
        idleTime / INACTIVITY_LIMIT
      );

    if (shouldPaintVisual) {
      dangerFill.style.transform =
        "scaleX(" + remaining.toFixed(3) + ")";

      const isCritical =
        remaining < 0.35;

      if (isCritical !== dangerCritical) {
        dangerCritical = isCritical;
        dangerFill.style.background =
          isCritical
            ? "#ff3b3b"
            : "#b7ff32";
      }
    }

    if (idleTime >= INACTIVITY_LIMIT) {
      endGame(now);

      requestAnimationFrame(gameLoop);
      return;
    }

    // Current speed fades if the player eases off.
    scrollRate *=
      Math.exp(-frameDelta / 360);

    scoringRate *=
      Math.exp(-frameDelta / 360);

    multiplier =
      calculateSpeedMultiplier();

    currentSpeed =
      Math.max(0, scrollRate) / SCROLL_UNIT;

    updatePowerStage(now);

    if (
      comboMultiplier > 1 &&
      now >= comboExpiresAt
    ) {
      comboMultiplier = 1;
      comboExpiresAt = 0;

      showBoostToast(
        "COMBO LOST",
        true
      );
    }

    if (!boostActive && now >= nextBoostAt) {
      spawnBoost(now);
    }

    updateBoost(now);

    const targetVelocity =
      clamp(
        scrollRate / 11,
        0,
        340
      );

    velocity +=
      (targetVelocity - velocity) *
      0.12;

    visualDistance +=
      velocity *
      (frameDelta / 16.67);

    if (shouldPaintVisual) {
      lastVisualPaint = now;

      const gridMovement =
        visualDistance % 140;

      grid.style.backgroundPosition =
        "0 " + gridMovement + "px";

      const speedIntensity =
        clamp(
          scrollRate / 5200,
          0,
          1
        );

      const lineOpacity =
        0.10 +
        speedIntensity * 0.84;

      const lineStretch =
        0.65 +
        speedIntensity * 10.5;

      speedLinesContainer.style.opacity =
        lineOpacity;

      if (!liteMode) {
        const lineBlur =
          speedIntensity * 1.8;

        const lineBrightness =
          0.75 +
          speedIntensity * 1.9;

        speedLinesContainer.style.setProperty(
          "--speed-blur",
          lineBlur.toFixed(2) + "px"
        );

        speedLinesContainer.style.setProperty(
          "--speed-brightness",
          lineBrightness.toFixed(2)
        );

        speedLinesContainer.style.setProperty(
          "--speed-glow",
          (
            3 +
            speedIntensity * 16
          ).toFixed(1) + "px"
        );
      }

      const viewportLoop =
        window.innerHeight + 340;

      for (
        let index = 0;
        index < visualLineLimit;
        index++
      ) {
        const line = speedLines[index];

        const startingPoint =
          Number(line.dataset.offset);

        const y =
          (
            startingPoint +
            visualDistance *
            (
              0.42 +
              speedIntensity * 1.25 +
              index / 65
            )
          ) %
          viewportLoop;

        line.style.transform =
          "translate3d(0," +
          (y - 120).toFixed(1) +
          "px,0) scaleY(" +
          lineStretch.toFixed(2) +
          ")";
      }
    }

    if (shouldPaintVisual) {
      const speedBand =
        currentSpeed >= 40
          ? 3
          : currentSpeed >= 24
            ? 2
            : currentSpeed >= 10
              ? 1
              : 0;

      if (speedBand !== lastSpeedBand) {
        lastSpeedBand = speedBand;

        body.classList.remove(
          "speed-2",
          "speed-3",
          "speed-4"
        );

        if (speedBand >= 1) {
          body.classList.add("speed-2");
        }

        if (speedBand >= 2) {
          body.classList.add("speed-3");
        }

        if (speedBand >= 3) {
          body.classList.add("speed-4");
        }
      }

      const hyperspace =
        powerStage === "aura" ||
        scrollRate >= HYPERSPACE_RATE;

      if (hyperspace !== wasHyperspace) {
        body.classList.toggle(
          "hyperspace",
          hyperspace
        );

        if (hyperspace) {
          triggerImpact(
            powerStage === "aura"
              ? "green"
              : "cyan"
          );
        }

        wasHyperspace = hyperspace;
      }
    }

    updateHUD();
  }

  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);


/* =========================================================
   END GAME
========================================================= */

function endGame(now) {
  if (state !== "playing") {
    return;
  }

  state = "gameover";

  finalElapsed =
    now - startTime;

  const roundedScore =
    Math.floor(score);

  let newRecord = false;

  if (roundedScore > personalBest) {
    personalBest = roundedScore;

    localStorage.setItem(
      "beatMyScrollBest",
      personalBest
    );

    newRecord = true;
  }

  finalScoreDisplay.textContent =
    scoreFormatter.format(roundedScore);

  finalTimeDisplay.textContent =
    (finalElapsed / 1000).toFixed(1) + "s";

  const activeSeconds =
    Math.max(
      (lastInputTime - startTime) / 1000,
      0.001
    );

  const averageSpeed =
    (totalScrollDistance / SCROLL_UNIT) /
    activeSeconds;

  finalAvgSpeedDisplay.textContent =
    averageSpeed.toFixed(1) + "/s";

  finalSpeedDisplay.textContent =
    maxSpeed.toFixed(1) + "/s";

  finalComboDisplay.textContent =
    formatCombo(maxCombo);

  finalBestDisplay.textContent =
    scoreFormatter.format(personalBest);

  bestScoreDisplay.textContent =
    scoreFormatter.format(personalBest);

  if (newRecord) {
    newBestDisplay.classList.add("visible");
  } else {
    newBestDisplay.classList.remove("visible");
  }

  boostActive = false;
  boostTarget.classList.add("hidden");
  challengeTarget.classList.add("hidden");

  stopAllAudio();
  playSfx("fahh");

  hideMoment();
  triggerImpact("pink");

  body.classList.remove(
    "playing",
    "speed-2",
    "speed-3",
    "speed-4",
    "hyperspace",
    "stage-sonic",
    "stage-goku",
    "stage-alquimia",
    "stage-aura"
  );

  gameScreen.classList.remove("active");
  gameOverScreen.classList.add("active");

  if (challengeScore > 0) {
    if (roundedScore >= challengeScore) {
      shareStatus.textContent =
        "Challenge beaten by " +
        (roundedScore - challengeScore).toLocaleString() +
        " points.";
    } else {
      shareStatus.textContent =
        (challengeScore - roundedScore).toLocaleString() +
        " points short of the challenge.";
    }
  }

  if (window.BMSLeaderboard) {
    window.BMSLeaderboard.onGameOver({
      score: roundedScore,
      avgSpeed: averageSpeed,
      maxSpeed: maxSpeed,
      duration: finalElapsed / 1000
    });
  }
}


/* =========================================================
   RESET
========================================================= */

function resetGame() {
  state = "waiting";

  score = 0;
  scrollRate = 0;
  scoringRate = 0;
  multiplier = 1;

  currentSpeed = 0;
  maxSpeed = 0;
  totalScrollDistance = 0;

  comboMultiplier = 1;
  maxCombo = 1;
  comboExpiresAt = 0;

  velocity = 0;
  visualDistance = 0;

  previousTouchY = null;
  challengeBeaten = false;
  challengeMessageLockUntil = 0;

  powerStage = "normal";
  gokuTriggered = false;
  gokuUntil = 0;
  highBurstStart = 0;
  nearMaxHoldStart = 0;
  stageDropStart = 0;
  wasHyperspace = false;

  lastScorePopBucket = -1;
  lastSpeedPopBucket = -1;

  lastVisualPaint = 0;
  lastHudPaint = 0;
  lastTimerPaint = 0;
  slowFrameCount = 0;
  lastSpeedBand = -1;
  dangerCritical = false;
  lastBoostPaint = 0;

  stopAllAudio();
  hideMoment();

  boostActive = false;
  boostProgress = 0;
  lastBoostProgressAt = 0;
  nextBoostAt = Infinity;

  scoreDisplay.textContent = "0";
  timerDisplay.textContent = "0.0s";
  speedDisplay.innerHTML =
    '0.0 <small>scrolls/s</small>';
  comboDisplay.textContent = "×1";
  distanceMarker.textContent = "0";

  dangerFill.style.transform =
    "scaleX(1)";

  dangerFill.style.background =
    "#b7ff32";

  gameMessage.textContent =
    "KEEP SCROLLING";

  gameMessage.style.color = "";

  boostTarget.classList.add("hidden");
  boostToast.classList.remove(
    "visible",
    "missed"
  );

  challengeTarget.classList.add("hidden");

  shareStatus.textContent = "";

  grid.style.backgroundPosition =
    "0 0";

  speedLinesContainer.style.opacity =
    "0";

  body.classList.remove(
    "playing",
    "speed-2",
    "speed-3",
    "speed-4",
    "hyperspace",
    "stage-sonic",
    "stage-goku",
    "stage-alquimia",
    "stage-aura"
  );
  body.classList.add("landing");

  gameOverScreen.classList.remove("active");
  gameScreen.classList.remove("active");
  startScreen.classList.add("active");
  startScreen.scrollTop = 0;
}


/* =========================================================
   LANDING PAGE START BUTTONS
========================================================= */

[startButton, startButtonBottom].forEach(function(button) {
  if (!button) return;

  // pointerdown happens earlier than click and gives mobile Safari the most
  // reliable opportunity to grant media playback.
  button.addEventListener(
    "pointerdown",
    unlockAudio,
    { passive: true }
  );

  button.addEventListener("click", function() {
    unlockAudio();
    warmAudioForRun();
    playSfx("click");
    startGame();
  });
});


/* =========================================================
   TRY AGAIN
========================================================= */

retryButton.addEventListener(
  "pointerdown",
  unlockAudio,
  { passive: true }
);

retryButton.addEventListener(
  "click",
  function() {
    unlockAudio();
    warmAudioForRun();
    playSfx("click");
    resetGame();
  }
);


/* =========================================================
   SHARE
========================================================= */

shareButton.addEventListener(
  "click",
  async function() {
    unlockAudio();
    playSfx("click");

    const roundedScore =
      Math.floor(score);

    const seconds =
      (finalElapsed / 1000).toFixed(1);

    const shareUrl =
      "https://beatmyscroll.com/?score=" +
      roundedScore;

    const shareText =
      "I scored " +
      scoreFormatter.format(roundedScore) +
      " on BeatMyScroll and lasted " +
      seconds +
      " seconds with a max speed of " +
      maxSpeed.toFixed(1) +
      " scrolls/s. Think you can beat me?";

    const shareData = {
      title: "Beat My Scroll",
      text: shareText,
      url: shareUrl
    };

    shareStatus.textContent = "";

    try {
      if (
        navigator.share &&
        (
          !navigator.canShare ||
          navigator.canShare(shareData)
        )
      ) {
        await navigator.share(shareData);

        shareStatus.textContent =
          "Shared!";

        return;
      }
    } catch (error) {
      if (error.name === "AbortError") {
        return;
      }

      console.log(
        "Native share failed:",
        error
      );
    }

    const fullText =
      shareText + "\n" + shareUrl;

    try {
      if (
        navigator.clipboard &&
        window.isSecureContext
      ) {
        await navigator.clipboard.writeText(
          fullText
        );

        shareStatus.textContent =
          "Score + challenge link copied!";

        return;
      }
    } catch (error) {
      console.log(
        "Clipboard API failed:",
        error
      );
    }

    try {
      const textArea =
        document.createElement(
          "textarea"
        );

      textArea.value = fullText;
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      textArea.style.top = "-9999px";

      document.body.appendChild(
        textArea
      );

      textArea.focus();
      textArea.select();

      const successful =
        document.execCommand("copy");

      document.body.removeChild(
        textArea
      );

      if (successful) {
        shareStatus.textContent =
          "Score + challenge link copied!";
      } else {
        shareStatus.textContent =
          "Couldn't share. Copy beatmyscroll.com manually.";
      }
    } catch (error) {
      shareStatus.textContent =
        "Couldn't share. Copy beatmyscroll.com manually.";
    }
  }
);
