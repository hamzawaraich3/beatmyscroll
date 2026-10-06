/* =========================================================
   BEAT MY SCROLL
   Infinite scrolling endurance game
========================================================= */


/* =========================================================
   SETTINGS
========================================================= */

const INACTIVITY_LIMIT = 1500;

// Higher = faster score growth.
const BASE_SCROLL_POWER = 1.15;

// Controls how quickly the multiplier increases.
// Smaller number = faster acceleration.
const ACCELERATION_RATE = 1100;

// Mouse / trackpad input is capped per event.
// Prevents giant trackpad events from giving absurd scores.
const MAX_WHEEL_INPUT = 150;

// Touch sensitivity.
const TOUCH_POWER = 1.15;


/* =========================================================
   ELEMENTS
========================================================= */

const body =
  document.body;

const startScreen =
  document.getElementById("start-screen");

const gameScreen =
  document.getElementById("game-screen");

const gameOverScreen =
  document.getElementById("game-over");

const scoreDisplay =
  document.getElementById("score");

const timerDisplay =
  document.getElementById("timer");

const multiplierDisplay =
  document.getElementById("multiplier");

const bestScoreDisplay =
  document.getElementById("best-score");

const gameMessage =
  document.getElementById("game-message");

const distanceMarker =
  document.getElementById("distance-marker");

const dangerFill =
  document.getElementById("danger-fill");

const grid =
  document.querySelector(".grid");

const speedLinesContainer =
  document.getElementById("speed-lines");

const finalScoreDisplay =
  document.getElementById("final-score");

const finalTimeDisplay =
  document.getElementById("final-time");

const finalSpeedDisplay =
  document.getElementById("final-speed");

const finalBestDisplay =
  document.getElementById("final-best");

const newBestDisplay =
  document.getElementById("new-best");

const retryButton =
  document.getElementById("retry-button");

const shareButton =
  document.getElementById("share-button");

const shareStatus =
  document.getElementById("share-status");


/* =========================================================
   GAME STATE
========================================================= */

let gameState = "waiting";

let score = 0;

let rawEffort = 0;

let visualDistance = 0;

let currentMultiplier = 1;

let maxMultiplier = 1;

let velocity = 0;

let startTime = 0;

let lastScrollTime = 0;

let finalElapsedTime = 0;

let previousTouchY = null;

let lastMessageMilestone = 0;

let animationFrame;


/* =========================================================
   PERSONAL BEST
========================================================= */

let personalBest =
  Number(
    localStorage.getItem("beatMyScrollBest")
  ) || 0;

bestScoreDisplay.textContent =
  personalBest.toLocaleString();


/* =========================================================
   MESSAGES
========================================================= */

const earlyMessages = [

  "KEEP SCROLLING",

  "THAT'S IT",

  "DON'T STOP",

  "FASTER",

  "OKAY...",

  "YOU'RE ACTUALLY TRYING",

  "YOUR THUMB IS WARMING UP",

  "STILL EASY",

  "KEEP GOING",

  "NO BREAKS",

  "SCROLL.",

  "SCROLL HARDER.",

  "THERE IS NO BOTTOM",

  "THIS WAS YOUR IDEA",

  "WHY ARE YOU DOING THIS?",

  "TOO LATE TO QUIT",

  "FASTER.",

  "DO NOT BLINK",

  "YOU CAN REST WHEN YOU LOSE",

  "KEEP. MOVING."

];


const highScoreMessages = [

  "YOU'RE COOKING",

  "THIS IS GETTING STUPID",

  "YOUR MOUSE IS BEGGING YOU",

  "ABSOLUTELY UNNECESSARY",

  "YOU HAVE A PROBLEM",

  "THE BOTTOM DOES NOT EXIST",

  "PLEASE SEEK GRASS",

  "YOUR SCROLL WHEEL FEARS YOU",

  "THIS IS YOUR LIFE NOW",

  "THERE'S NOTHING DOWN HERE",

  "YOU STILL BELIEVE THERE'S AN END?",

  "THE INTERNET WAS A MISTAKE",

  "YOUR FINGER HAS ASCENDED",

  "WE DIDN'T EXPECT YOU TO GET THIS FAR",

  "ERROR: PLAYER REFUSES TO STOP",

  "SCROLL HARDER",

  "SPEED IS EVERYTHING",

  "YOU'VE GONE TOO FAR",

  "THERE IS NO ESCAPE",

  "KEEP GOING."
];


/* =========================================================
   SPEED LINES
========================================================= */

const speedLines = [];

function createSpeedLines() {

  const amount = 28;

  for (let i = 0; i < amount; i++) {

    const line =
      document.createElement("div");

    line.className =
      "speed-line";

    const left =
      Math.random() * 100;

    const height =
      40 + Math.random() * 160;

    const offset =
      Math.random() * window.innerHeight;

    line.style.left =
      `${left}%`;

    line.style.height =
      `${height}px`;

    line.dataset.offset =
      offset;

    speedLinesContainer.appendChild(line);

    speedLines.push(line);

  }

}

createSpeedLines();


/* =========================================================
   MULTIPLIER
========================================================= */

function calculateMultiplier() {

  /*
    Square-root growth means:

    early game = noticeable acceleration

    late game = still keeps increasing forever

    but doesn't become completely uncontrollable
    immediately.
  */

  return (
    1 +
    Math.sqrt(
      rawEffort / ACCELERATION_RATE
    )
  );

}


/* =========================================================
   START GAME
========================================================= */

function startGame() {

  if (gameState !== "waiting") {
    return;
  }

  gameState = "playing";

  score = 0;

  rawEffort = 0;

  visualDistance = 0;

  currentMultiplier = 1;

  maxMultiplier = 1;

  velocity = 0;

  lastMessageMilestone = 0;

  startTime =
    performance.now();

  lastScrollTime =
    performance.now();

  startScreen.classList.remove("active");

  gameOverScreen.classList.remove("active");

  gameScreen.classList.add("active");

  body.classList.add("playing");

  gameMessage.textContent =
    "GO.";

}


/* =========================================================
   REGISTER SCROLL
========================================================= */

function registerScroll(amount) {

  if (amount <= 0) {
    return;
  }

  if (gameState === "gameover") {
    return;
  }

  if (gameState === "waiting") {
    startGame();
  }

  const now =
    performance.now();

  lastScrollTime =
    now;

  /*
    Raw effort represents actual physical scrolling.

    The multiplier then converts that effort into more
    virtual distance as the player accelerates.
  */

  rawEffort +=
    amount;

  currentMultiplier =
    calculateMultiplier();

  maxMultiplier =
    Math.max(
      maxMultiplier,
      currentMultiplier
    );

  const gainedDistance =
    amount *
    BASE_SCROLL_POWER *
    currentMultiplier;

  score +=
    gainedDistance;

  visualDistance +=
    gainedDistance;

  /*
    Velocity powers visual effects.

    More scrolling = more apparent speed.
  */

  velocity +=
    gainedDistance * 0.055;

  velocity =
    Math.min(
      velocity,
      250
    );

  updateDisplays();

  updateMessage();

}


/* =========================================================
   MOUSE / TRACKPAD
========================================================= */

window.addEventListener(
  "wheel",
  (event) => {

    event.preventDefault();

    let amount =
      event.deltaY;

    /*
      Only downward scrolling counts.
    */

    if (amount <= 0) {
      return;
    }

    /*
      Normalize extremely large wheel events.
    */

    amount =
      Math.min(
        amount,
        MAX_WHEEL_INPUT
      );

    registerScroll(amount);

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
  (event) => {

    if (!event.touches.length) {
      return;
    }

    previousTouchY =
      event.touches[0].clientY;

  },
  {
    passive: false
  }
);


window.addEventListener(
  "touchmove",
  (event) => {

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
      previousTouchY -
      currentY;

    previousTouchY =
      currentY;

    if (difference > 0) {

      registerScroll(
        Math.min(
          difference * TOUCH_POWER,
          MAX_WHEEL_INPUT
        )
      );

    }

  },
  {
    passive: false
  }
);


window.addEventListener(
  "touchend",
  () => {

    previousTouchY = null;

  },
  {
    passive: false
  }
);


/* =========================================================
   KEYBOARD
========================================================= */

window.addEventListener(
  "keydown",
  (event) => {

    if (
      gameState === "gameover" &&
      event.key === "Enter"
    ) {

      resetGame();

      return;

    }

    const downwardKeys = [

      "ArrowDown",

      "PageDown",

      " "

    ];

    if (
      downwardKeys.includes(
        event.key
      )
    ) {

      event.preventDefault();

      registerScroll(70);

    }

  }
);


/* =========================================================
   DISPLAY
========================================================= */

function updateDisplays() {

  scoreDisplay.textContent =
    Math.floor(score)
      .toLocaleString();

  multiplierDisplay.textContent =
    `${currentMultiplier.toFixed(2)}×`;

  distanceMarker.textContent =
    Math.floor(score)
      .toLocaleString();

}


/* =========================================================
   MESSAGE SYSTEM
========================================================= */

function updateMessage() {

  /*
    New message approximately every 2,500 score.

    Because score accelerates, messages also begin arriving
    faster as the run becomes more intense.
  */

  const milestone =
    Math.floor(score / 2500);

  if (
    milestone <=
    lastMessageMilestone
  ) {
    return;
  }

  lastMessageMilestone =
    milestone;

  let message;

  if (milestone < earlyMessages.length) {

    message =
      earlyMessages[milestone];

  } else {

    const index =
      Math.floor(
        Math.random() *
        highScoreMessages.length
      );

    message =
      highScoreMessages[index];

  }

  gameMessage.style.opacity =
    "0";

  gameMessage.style.transform =
    "translate(-50%, -50%) scale(1.12)";

  setTimeout(() => {

    gameMessage.textContent =
      message;

    gameMessage.style.opacity =
      "1";

    gameMessage.style.transform =
      "translate(-50%, -50%) scale(1)";

  }, 90);

}


/* =========================================================
   MAIN ANIMATION LOOP
========================================================= */

function animate(now) {

  if (gameState === "playing") {

    const elapsed =
      now - startTime;

    const timeSinceScroll =
      now - lastScrollTime;

    /*
      TIMER
    */

    timerDisplay.textContent =
      `${(elapsed / 1000).toFixed(1)}s`;


    /*
      1.5 SECOND DEATH TIMER
    */

    const remaining =
      Math.max(
        0,
        1 -
        timeSinceScroll /
        INACTIVITY_LIMIT
      );

    dangerFill.style.transform =
      `scaleX(${remaining})`;


    /*
      Bar becomes red as you're about to lose.
    */

    if (remaining < 0.33) {

      dangerFill.style.background =
        "#ff3b3b";

    } else {

      dangerFill.style.background =
        "#b7ff32";

    }


    /*
      If no scroll input for 1.5 seconds:
      GAME OVER.
    */

    if (
      timeSinceScroll >=
      INACTIVITY_LIMIT
    ) {

      endGame(now);

    }


    /*
      MOMENTUM DECAY

      Scrolling makes velocity shoot upward.

      Velocity then gradually falls between inputs.
    */

    velocity *= 0.94;

    if (velocity < 0.05) {
      velocity = 0;
    }


    /*
      MOVE THE INFINITE WORLD

      We only use modulo values so the page can visually
      continue forever without needing a gigantic DOM.
    */

    visualDistance +=
      velocity;

    const gridOffset =
      visualDistance % 140;

    grid.style.backgroundPosition =
      `0 ${gridOffset}px`;


    /*
      SPEED LINES
    */

    const speedOpacity =
      Math.min(
        velocity / 65,
        0.8
      );

    speedLinesContainer.style.opacity =
      speedOpacity;

    speedLines.forEach(
      (line, index) => {

        const originalOffset =
          Number(
            line.dataset.offset
          );

        const movement =
          (
            originalOffset +
            visualDistance *
            (
              0.7 +
              index / 35
            )
          ) %
          (
            window.innerHeight +
            250
          );

        line.style.transform =
          `translateY(${movement - 200}px)`;

      }
    );


    /*
      VISUAL SPEED LEVELS
    */

    body.classList.remove(
      "speed-2",
      "speed-3",
      "speed-4"
    );

    if (
      currentMultiplier >= 2
    ) {

      body.classList.add(
        "speed-2"
      );

    }

    if (
      currentMultiplier >= 3
    ) {

      body.classList.add(
        "speed-3"
      );

    }

    if (
      currentMultiplier >= 4.5
    ) {

      body.classList.add(
        "speed-4"
      );

    }

  }

  animationFrame =
    requestAnimationFrame(
      animate
    );

}


/* =========================================================
   END GAME
========================================================= */

function endGame(now) {

  if (
    gameState !== "playing"
  ) {
    return;
  }

  gameState =
    "gameover";

  finalElapsedTime =
    now - startTime;

  const finalScore =
    Math.floor(score);

  let isNewBest =
    false;

  if (
    finalScore >
    personalBest
  ) {

    personalBest =
      finalScore;

    localStorage.setItem(
      "beatMyScrollBest",
      personalBest
    );

    isNewBest =
      true;

  }


  /*
    UPDATE RESULTS
  */

  finalScoreDisplay.textContent =
    finalScore.toLocaleString();

  finalTimeDisplay.textContent =
    `${(
      finalElapsedTime /
      1000
    ).toFixed(1)}s`;

  finalSpeedDisplay.textContent =
    `${maxMultiplier.toFixed(2)}×`;

  finalBestDisplay.textContent =
    personalBest.toLocaleString();

  bestScoreDisplay.textContent =
    personalBest.toLocaleString();


  /*
    NEW BEST MESSAGE
  */

  if (isNewBest) {

    newBestDisplay.classList.add(
      "visible"
    );

  } else {

    newBestDisplay.classList.remove(
      "visible"
    );

  }


  /*
    SHOW GAME OVER
  */

  body.classList.remove(
    "playing",
    "speed-2",
    "speed-3",
    "speed-4"
  );

  gameScreen.classList.remove(
    "active"
  );

  gameOverScreen.classList.add(
    "active"
  );

}


/* =========================================================
   RESET
========================================================= */

function resetGame() {

  gameState =
    "waiting";

  score =
    0;

  rawEffort =
    0;

  visualDistance =
    0;

  velocity =
    0;

  currentMultiplier =
    1;

  maxMultiplier =
    1;

  previousTouchY =
    null;

  lastMessageMilestone =
    0;

  scoreDisplay.textContent =
    "0";

  timerDisplay.textContent =
    "0.0s";

  multiplierDisplay.textContent =
    "1.00×";

  distanceMarker.textContent =
    "0";

  dangerFill.style.transform =
    "scaleX(1)";

  dangerFill.style.background =
    "#b7ff32";

  shareStatus.textContent =
    "";

  gameMessage.textContent =
    "KEEP SCROLLING";

  grid.style.backgroundPosition =
    "0 0";

  speedLinesContainer.style.opacity =
    "0";

  body.classList.remove(
    "playing",
    "speed-2",
    "speed-3",
    "speed-4"
  );

  gameOverScreen.classList.remove(
    "active"
  );

  gameScreen.classList.remove(
    "active"
  );

  startScreen.classList.add(
    "active"
  );

}


/* =========================================================
   BUTTONS
========================================================= */

retryButton.addEventListener(
  "click",
  resetGame
);


shareButton.addEventListener(
  "click",
  async () => {

    const finalScore =
      Math.floor(score);

    const seconds =
      (
        finalElapsedTime /
        1000
      ).toFixed(1);

    const shareText =
      `I scored ${finalScore.toLocaleString()} on BeatMyScroll.com and survived ${seconds} seconds. Beat me.`;

    const shareData = {

      title:
        "Beat My Scroll",

      text:
        shareText,

      url:
        "https://beatmyscroll.com"

    };

    try {

      if (navigator.share) {

        await navigator.share(
          shareData
        );

      } else {

        await navigator.clipboard.writeText(
          `${shareText} https://beatmyscroll.com`
        );

        shareStatus.textContent =
          "Score copied to clipboard.";

      }

    } catch (error) {

      /*
        User cancelled native share.
        No error needed.
      */

    }

  }
);


/* =========================================================
   PREVENT OTHER SCROLLING SHORTCUTS
========================================================= */

window.addEventListener(
  "keydown",
  (event) => {

    const blockedKeys = [

      "End",

      "Home",

      "ArrowUp",

      "PageUp"

    ];

    if (
      blockedKeys.includes(
        event.key
      )
    ) {

      event.preventDefault();

    }

  }
);


/* =========================================================
   PREVENT CONTEXTUAL DRAGGING
========================================================= */

window.addEventListener(
  "dragstart",
  (event) => {

    event.preventDefault();

  }
);


/* =========================================================
   START ANIMATION LOOP
========================================================= */

animationFrame =
  requestAnimationFrame(
    animate
  );
