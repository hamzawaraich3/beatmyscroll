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
const MAX_SPEED_MULTIPLIER = 8;

const BOOST_REQUIRED = 650;
const BOOST_WINDOW = 1250;
const BOOST_FIRST_DELAY = 4000;
const BOOST_MIN_GAP = 3400;
const BOOST_MAX_GAP = 5200;
const COMBO_MAX = 5;
const COMBO_DURATION = 7000;

const HYPERSPACE_MULTIPLIER = 6.25;
const HYPERSPACE_RATE = 2600;


/* =========================================================
   ELEMENTS
========================================================= */

const body = document.body;

const startScreen = document.getElementById("start-screen");
const gameScreen = document.getElementById("game-screen");
const gameOverScreen = document.getElementById("game-over");

const scoreDisplay = document.getElementById("score");
const timerDisplay = document.getElementById("timer");
const multiplierDisplay = document.getElementById("multiplier");
const comboDisplay = document.getElementById("combo-display");
const bestScoreDisplay = document.getElementById("best-score");

const finalScoreDisplay = document.getElementById("final-score");
const finalTimeDisplay = document.getElementById("final-time");
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
const boostToast = document.getElementById("boost-toast");


/* =========================================================
   GAME STATE
========================================================= */

let state = "waiting";

let score = 0;
let scrollRate = 0;
let multiplier = 1;
let maxMultiplier = 1;

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

const urlParams = new URLSearchParams(window.location.search);
const parsedChallengeScore = Number(urlParams.get("score"));

const challengeScore =
  Number.isFinite(parsedChallengeScore) && parsedChallengeScore > 0
    ? Math.min(Math.floor(parsedChallengeScore), 1000000000000)
    : 0;

let challengeBeaten = false;
let challengeMessageLockUntil = 0;


/* =========================================================
   PERSONAL BEST + CHALLENGE
========================================================= */

let personalBest =
  Number(localStorage.getItem("beatMyScrollBest")) || 0;

bestScoreDisplay.textContent =
  personalBest.toLocaleString();

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

for (let i = 0; i < 36; i++) {
  const line = document.createElement("div");

  line.className = "speed-line";
  line.style.left = (Math.random() * 100) + "%";
  line.style.height = (50 + Math.random() * 190) + "px";
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

function calculateSpeedMultiplier() {
  const normalized =
    Math.max(0, scrollRate) / SPEED_REFERENCE;

  return (
    1 +
    Math.min(
      MAX_SPEED_MULTIPLIER - 1,
      Math.pow(normalized, SPEED_CURVE) * SPEED_GAIN
    )
  );
}

function updateHUD() {
  const roundedScore = Math.floor(score);

  scoreDisplay.textContent =
    roundedScore.toLocaleString();

  distanceMarker.textContent =
    roundedScore.toLocaleString();

  multiplierDisplay.textContent =
    multiplier.toFixed(2) + "×";

  comboDisplay.textContent =
    "×" + comboMultiplier;

  if (
    challengeScore > 0 &&
    !challengeBeaten &&
    roundedScore >= challengeScore
  ) {
    challengeBeaten = true;
    challengeMessageLockUntil = performance.now() + 1200;

    challengeTarget.classList.add("hidden");

    gameMessage.textContent = "TARGET DESTROYED";
    gameMessage.style.color = "#b7ff32";
    gameMessage.style.opacity = "1";
    gameMessage.style.transform =
      "translate(-50%, -50%) scale(1.08)";

    setTimeout(function() {
      gameMessage.style.transform =
        "translate(-50%, -50%) scale(1)";
      gameMessage.style.color = "";
    }, 900);
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
  boostStartedAt = now;
  boostDeadline = now + BOOST_WINDOW;

  const left = 22 + Math.random() * 56;
  const top = 34 + Math.random() * 34;

  boostTarget.style.left = left + "%";
  boostTarget.style.top = top + "%";

  boostCore.style.setProperty("--boost-fill", "0deg");
  boostProgressDisplay.textContent = "0%";

  boostApproach.style.transform = "scale(1.8)";
  boostApproach.style.opacity = "0.9";

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
      Math.min(COMBO_MAX, comboMultiplier + 1);

    maxCombo =
      Math.max(maxCombo, comboMultiplier);

    comboExpiresAt =
      now + COMBO_DURATION;

    showBoostToast(
      "RUSH ×" + comboMultiplier,
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

  const timeRatio =
    clamp(
      (now - boostStartedAt) / BOOST_WINDOW,
      0,
      1
    );

  const progressRatio =
    clamp(
      boostProgress / BOOST_REQUIRED,
      0,
      1
    );

  const approachScale =
    1.8 - timeRatio * 0.8;

  boostApproach.style.transform =
    "scale(" + approachScale.toFixed(3) + ")";

  boostApproach.style.opacity =
    String(0.95 - timeRatio * 0.35);

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

  state = "playing";

  score = 0;
  scrollRate = 0;
  multiplier = 1;
  maxMultiplier = 1;

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

  body.classList.add("playing");
  body.classList.remove("hyperspace");

  gameMessage.textContent = "GO.";
  gameMessage.style.color = "";

  updateHUD();
}


/* =========================================================
   SCROLL INPUT + SPEED-BASED SCORING
========================================================= */

function handleScrollInput(amount) {
  if (state === "gameover") return;

  amount = Math.abs(amount);

  if (amount < 1) return;

  amount = Math.min(amount, MAX_INPUT);

  if (state === "waiting") {
    startGame();
  }

  const now = performance.now();

  const eventDelta =
    lastInputEventTime > 0
      ? clamp(now - lastInputEventTime, 16, 250)
      : 100;

  lastInputEventTime = now;
  lastInputTime = now;

  const instantRate =
    (amount / eventDelta) * 1000;

  scrollRate =
    scrollRate * 0.72 +
    instantRate * 0.28;

  multiplier =
    calculateSpeedMultiplier();

  maxMultiplier =
    Math.max(maxMultiplier, multiplier);

  if (boostActive) {
    boostProgress += amount;

    if (boostProgress >= BOOST_REQUIRED) {
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
    if (
      state === "gameover" &&
      event.key === "Enter"
    ) {
      resetGame();
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

  gameMessage.style.opacity = "0";
  gameMessage.style.transform =
    "translate(-50%, -50%) scale(1.12)";

  setTimeout(
    function() {
      if (performance.now() < challengeMessageLockUntil) {
        return;
      }

      gameMessage.textContent = message;
      gameMessage.style.opacity = "1";
      gameMessage.style.transform =
        "translate(-50%, -50%) scale(1)";
    },
    80
  );
}


/* =========================================================
   MAIN LOOP
========================================================= */

function gameLoop(now) {
  const frameDelta =
    clamp(now - lastFrameTime, 1, 50);

  lastFrameTime = now;

  if (state === "playing") {
    const elapsed =
      now - startTime;

    const idleTime =
      now - lastInputTime;

    timerDisplay.textContent =
      (elapsed / 1000).toFixed(1) + "s";

    const remaining =
      Math.max(
        0,
        1 -
        idleTime / INACTIVITY_LIMIT
      );

    dangerFill.style.transform =
      "scaleX(" + remaining + ")";

    if (remaining < 0.35) {
      dangerFill.style.background =
        "#ff3b3b";
    } else {
      dangerFill.style.background =
        "#b7ff32";
    }

    if (idleTime >= INACTIVITY_LIMIT) {
      endGame(now);

      requestAnimationFrame(gameLoop);
      return;
    }

    // Current speed fades if the player eases off.
    scrollRate *=
      Math.exp(-frameDelta / 650);

    multiplier =
      calculateSpeedMultiplier();

    maxMultiplier =
      Math.max(maxMultiplier, multiplier);

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
        5 +
        scrollRate / 10,
        5,
        320
      );

    velocity +=
      (targetVelocity - velocity) *
      0.12;

    visualDistance +=
      velocity *
      (frameDelta / 16.67);

    const gridMovement =
      visualDistance % 140;

    grid.style.backgroundPosition =
      "0 " + gridMovement + "px";

    const lineOpacity =
      Math.min(
        velocity / 125,
        0.92
      );

    speedLinesContainer.style.opacity =
      lineOpacity;

    speedLines.forEach(
      function(line, index) {
        const startingPoint =
          Number(line.dataset.offset);

        const y =
          (
            startingPoint +
            visualDistance *
            (
              0.7 +
              index / 38
            )
          ) %
          (
            window.innerHeight +
            340
          );

        line.style.transform =
          "translateY(" + (y - 280) + "px)";
      }
    );

    body.classList.remove(
      "speed-2",
      "speed-3",
      "speed-4"
    );

    if (multiplier >= 2.2) {
      body.classList.add("speed-2");
    }

    if (multiplier >= 4) {
      body.classList.add("speed-3");
    }

    if (multiplier >= 6) {
      body.classList.add("speed-4");
    }

    const hyperspace =
      multiplier >= HYPERSPACE_MULTIPLIER &&
      scrollRate >= HYPERSPACE_RATE;

    body.classList.toggle(
      "hyperspace",
      hyperspace
    );

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
    roundedScore.toLocaleString();

  finalTimeDisplay.textContent =
    (finalElapsed / 1000).toFixed(1) + "s";

  finalSpeedDisplay.textContent =
    maxMultiplier.toFixed(2) + "×";

  finalComboDisplay.textContent =
    "×" + maxCombo;

  finalBestDisplay.textContent =
    personalBest.toLocaleString();

  bestScoreDisplay.textContent =
    personalBest.toLocaleString();

  if (newRecord) {
    newBestDisplay.classList.add("visible");
  } else {
    newBestDisplay.classList.remove("visible");
  }

  boostActive = false;
  boostTarget.classList.add("hidden");
  challengeTarget.classList.add("hidden");

  body.classList.remove(
    "playing",
    "speed-2",
    "speed-3",
    "speed-4",
    "hyperspace"
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
}


/* =========================================================
   RESET
========================================================= */

function resetGame() {
  state = "waiting";

  score = 0;
  scrollRate = 0;
  multiplier = 1;
  maxMultiplier = 1;

  comboMultiplier = 1;
  maxCombo = 1;
  comboExpiresAt = 0;

  velocity = 0;
  visualDistance = 0;

  previousTouchY = null;
  challengeBeaten = false;
  challengeMessageLockUntil = 0;

  boostActive = false;
  boostProgress = 0;
  nextBoostAt = Infinity;

  scoreDisplay.textContent = "0";
  timerDisplay.textContent = "0.0s";
  multiplierDisplay.textContent = "1.00×";
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
    "hyperspace"
  );

  gameOverScreen.classList.remove("active");
  gameScreen.classList.remove("active");
  startScreen.classList.add("active");
}


/* =========================================================
   TRY AGAIN
========================================================= */

retryButton.addEventListener(
  "click",
  function() {
    resetGame();
  }
);


/* =========================================================
   SHARE
========================================================= */

shareButton.addEventListener(
  "click",
  async function() {
    const roundedScore =
      Math.floor(score);

    const seconds =
      (finalElapsed / 1000).toFixed(1);

    const shareUrl =
      "https://beatmyscroll.com/?score=" +
      roundedScore;

    const shareText =
      "I scored " +
      roundedScore.toLocaleString() +
      " on BeatMyScroll and lasted " +
      seconds +
      " seconds. Think you can beat me?";

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
