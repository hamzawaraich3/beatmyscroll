/* =========================================================
   BEAT MY SCROLL
========================================================= */

const INACTIVITY_LIMIT = 1500;
const MAX_INPUT = 180;
const ACCELERATION_RATE = 900;


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
const bestScoreDisplay = document.getElementById("best-score");

const finalScoreDisplay = document.getElementById("final-score");
const finalTimeDisplay = document.getElementById("final-time");
const finalSpeedDisplay = document.getElementById("final-speed");
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


/* =========================================================
   STATE
========================================================= */

let state = "waiting";

let score = 0;
let effort = 0;

let multiplier = 1;
let maxMultiplier = 1;

let startTime = 0;
let lastInputTime = 0;

let visualDistance = 0;
let velocity = 0;

let previousTouchY = null;

let finalElapsed = 0;

let lastMilestone = -1;


/* =========================================================
   PERSONAL BEST
========================================================= */

let personalBest =
  Number(localStorage.getItem("beatMyScrollBest")) || 0;

bestScoreDisplay.textContent =
  personalBest.toLocaleString();


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

for (let i = 0; i < 30; i++) {

  const line = document.createElement("div");

  line.className = "speed-line";

  line.style.left =
    `${Math.random() * 100}%`;

  line.style.height =
    `${50 + Math.random() * 160}px`;

  line.dataset.offset =
    Math.random() * window.innerHeight;

  speedLinesContainer.appendChild(line);

  speedLines.push(line);
}


/* =========================================================
   START GAME
========================================================= */

function startGame() {

  if (state !== "waiting") return;

  state = "playing";

  score = 0;
  effort = 0;

  multiplier = 1;
  maxMultiplier = 1;

  velocity = 0;
  visualDistance = 0;

  lastMilestone = -1;

  startTime = performance.now();
  lastInputTime = performance.now();

  startScreen.classList.remove("active");
  gameOverScreen.classList.remove("active");
  gameScreen.classList.add("active");

  body.classList.add("playing");

  gameMessage.textContent = "GO.";

  updateHUD();
}


/* =========================================================
   SCROLL INPUT
========================================================= */

function handleScrollInput(amount) {

  if (state === "gameover") return;

  /*
    We only care about magnitude.

    This makes it work more reliably across
    mouse wheels, trackpads and different OS settings.
  */

  amount = Math.abs(amount);

  if (amount < 1) return;

  amount =
    Math.min(amount, MAX_INPUT);

  if (state === "waiting") {
    startGame();
  }

  lastInputTime =
    performance.now();

  effort += amount;

  /*
    Multiplier grows forever.
  */

  multiplier =
    1 +
    Math.sqrt(
      effort /
      ACCELERATION_RATE
    );

  maxMultiplier =
    Math.max(
      maxMultiplier,
      multiplier
    );

  /*
    More multiplier =
    more score per physical scroll.
  */

  const gained =
    amount *
    multiplier;

  score += gained;

  /*
    Visual speed.
  */

  velocity +=
    gained * 0.06;

  velocity =
    Math.min(
      velocity,
      300
    );

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

    handleScrollInput(
      event.deltaY
    );

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
      previousTouchY -
      currentY;

    previousTouchY =
      currentY;

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

    if (
      scrollKeys.includes(
        event.key
      )
    ) {

      event.preventDefault();

      handleScrollInput(75);

    }

    /*
      Stop instant jumping.
    */

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
   UPDATE HUD
========================================================= */

function updateHUD() {

  const roundedScore =
    Math.floor(score);

  scoreDisplay.textContent =
    roundedScore.toLocaleString();

  distanceMarker.textContent =
    roundedScore.toLocaleString();

  multiplierDisplay.textContent =
    `${multiplier.toFixed(2)}×`;
}


/* =========================================================
   MESSAGES
========================================================= */

function updateMessage() {

  const milestone =
    Math.floor(score / 2500);

  if (
    milestone === lastMilestone
  ) {
    return;
  }

  lastMilestone = milestone;

  let message;

  if (
    milestone <
    messages.length
  ) {

    message =
      messages[milestone];

  } else {

    message =
      messages[
        Math.floor(
          Math.random() *
          messages.length
        )
      ];

  }

  gameMessage.style.opacity = "0";

  gameMessage.style.transform =
    "translate(-50%, -50%) scale(1.12)";

  setTimeout(
    function() {

      gameMessage.textContent =
        message;

      gameMessage.style.opacity =
        "1";

      gameMessage.style.transform =
        "translate(-50%, -50%) scale(1)";

    },
    80
  );
}


/* =========================================================
   MAIN GAME LOOP
========================================================= */

function gameLoop(now) {

  if (state === "playing") {

    const elapsed =
      now - startTime;

    const idleTime =
      now - lastInputTime;


    /* TIMER */

    timerDisplay.textContent =
      `${(elapsed / 1000).toFixed(1)}s`;


    /* 1.5 SECOND LIFE BAR */

    const remaining =
      Math.max(
        0,
        1 -
        idleTime /
        INACTIVITY_LIMIT
      );

    dangerFill.style.transform =
      `scaleX(${remaining})`;

    if (remaining < 0.35) {

      dangerFill.style.background =
        "#ff3b3b";

    } else {

      dangerFill.style.background =
        "#b7ff32";

    }


    /* GAME OVER */

    if (
      idleTime >=
      INACTIVITY_LIMIT
    ) {

      endGame(now);

    }


    /* MOMENTUM */

    velocity *= 0.95;

    visualDistance +=
      velocity;


    /* MOVE GRID */

    const gridMovement =
      visualDistance % 140;

    grid.style.backgroundPosition =
      `0 ${gridMovement}px`;


    /* SPEED LINES */

    const opacity =
      Math.min(
        velocity / 80,
        0.85
      );

    speedLinesContainer.style.opacity =
      opacity;

    speedLines.forEach(
      function(line, index) {

        const startingPoint =
          Number(
            line.dataset.offset
          );

        const y =
          (
            startingPoint +
            visualDistance *
            (
              0.6 +
              index / 35
            )
          ) %
          (
            window.innerHeight +
            300
          );

        line.style.transform =
          `translateY(${y - 250}px)`;

      }
    );


    /* SPEED EFFECTS */

    body.classList.remove(
      "speed-2",
      "speed-3",
      "speed-4"
    );

    if (multiplier >= 2) {
      body.classList.add(
        "speed-2"
      );
    }

    if (multiplier >= 3) {
      body.classList.add(
        "speed-3"
      );
    }

    if (multiplier >= 4.5) {
      body.classList.add(
        "speed-4"
      );
    }

  }

  requestAnimationFrame(
    gameLoop
  );
}

requestAnimationFrame(
  gameLoop
);


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

  let newRecord =
    false;


  if (
    roundedScore >
    personalBest
  ) {

    personalBest =
      roundedScore;

    localStorage.setItem(
      "beatMyScrollBest",
      personalBest
    );

    newRecord = true;
  }


  finalScoreDisplay.textContent =
    roundedScore.toLocaleString();

  finalTimeDisplay.textContent =
    `${(
      finalElapsed /
      1000
    ).toFixed(1)}s`;

  finalSpeedDisplay.textContent =
    `${maxMultiplier.toFixed(2)}×`;

  finalBestDisplay.textContent =
    personalBest.toLocaleString();

  bestScoreDisplay.textContent =
    personalBest.toLocaleString();


  if (newRecord) {

    newBestDisplay.classList.add(
      "visible"
    );

  } else {

    newBestDisplay.classList.remove(
      "visible"
    );

  }


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

  state = "waiting";

  score = 0;
  effort = 0;

  multiplier = 1;
  maxMultiplier = 1;

  velocity = 0;
  visualDistance = 0;

  previousTouchY = null;

  scoreDisplay.textContent = "0";
  timerDisplay.textContent = "0.0s";
  multiplierDisplay.textContent = "1.00×";
  distanceMarker.textContent = "0";

  dangerFill.style.transform =
    "scaleX(1)";

  dangerFill.style.background =
    "#b7ff32";

  gameMessage.textContent =
    "KEEP SCROLLING";

  shareStatus.textContent =
    "";

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

/* =========================================================
   SHARE
========================================================= */

shareButton.addEventListener(
  "click",
  async function () {

    const roundedScore =
      Math.floor(score);

    const seconds =
      (finalElapsed / 1000).toFixed(1);

    const shareUrl =
      `https://beatmyscroll.com/?score=${roundedScore}`;

    const shareText =
      `I scored ${roundedScore.toLocaleString()} on BeatMyScroll and lasted ${seconds} seconds. Think you can beat me?`;

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

        await navigator.share(
          shareData
        );

        shareStatus.textContent =
          "Shared!";

        return;
      }

    } catch (error) {

      if (
        error.name === "AbortError"
      ) {
        return;
      }

      console.log(
        "Native share failed:",
        error
      );
    }

    const fullText =
      `${shareText}\n${shareUrl}`;

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

      textArea.value =
        fullText;

      textArea.style.position =
        "fixed";

      textArea.style.left =
        "-9999px";

      textArea.style.top =
        "-9999px";

      document.body.appendChild(
        textArea
      );

      textArea.focus();
      textArea.select();

      const successful =
        document.execCommand(
          "copy"
        );

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
