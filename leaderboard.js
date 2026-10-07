/* BeatMyScroll: global, opt-in leaderboard.
   Loaded after script.js; does not affect the scrolling game if the API fails. */
(function () {
  "use strict";

  const form = document.getElementById("leaderboard-register");
  const nameInput = document.getElementById("leaderboard-username");
  const submitButton = document.getElementById("leaderboard-submit");
  const skipButton = document.getElementById("leaderboard-skip");
  const identity = document.getElementById("leaderboard-player");
  const feedback = document.getElementById("leaderboard-feedback");
  const list = document.getElementById("leaderboard-list");
  const tabs = Array.from(document.querySelectorAll("[data-leaderboard]"));

  const boards = {
    score: [],
    average: [],
    maximum: []
  };

  let currentCategory = "score";
  let currentRun = null;
  let currentPlayer = null;
  let screenGeneration = 0;
  let submitting = false;
  let boardLoaded = false;
  let boardRevision = 0;

  function showFeedback(message, error = false) {
    feedback.textContent = message || "";
    feedback.classList.toggle("is-error", error);
  }

  function showForm(visible) {
    form.hidden = !visible;
  }

  function updateIdentity() {
    if (currentPlayer) {
      identity.hidden = false;
      identity.textContent = "PLAYING AS " + currentPlayer;
    } else {
      identity.hidden = true;
      identity.textContent = "";
    }
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      credentials: "same-origin",
      cache: "no-store",
      ...options
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        typeof body.error === "string"
          ? body.error
          : "Leaderboard is temporarily offline."
      );
    }
    return body;
  }

  const profilePromise = api("/api/me")
    .then(data => {
      if (typeof data.username === "string" && data.username.length) {
        currentPlayer = data.username;
      }
      updateIdentity();
      return currentPlayer;
    })
    .catch(() => null);

  function formatValue(value, category) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "—";

    if (category === "score") {
      return Math.floor(number).toLocaleString();
    }

    return number.toFixed(1) + " /s";
  }

  function renderLeaderboard() {
    list.replaceChildren();

    const rows = boards[currentCategory] || [];

    if (!boardLoaded) {
      const placeholder = document.createElement("li");
      placeholder.className = "leaderboard-placeholder";
      placeholder.textContent = "Loading worldwide scores…";
      list.appendChild(placeholder);
      return;
    }

    if (!rows.length) {
      const placeholder = document.createElement("li");
      placeholder.className = "leaderboard-placeholder";
      placeholder.textContent = "No records yet. Be the first to claim the throne.";
      list.appendChild(placeholder);
      return;
    }

    rows.slice(0, 15).forEach((row, index) => {
      const li = document.createElement("li");
      li.className = "leaderboard-row";

      if (
        currentPlayer &&
        String(row.username).toLowerCase() === currentPlayer.toLowerCase()
      ) {
        li.classList.add("is-you");
      }

      const rank = document.createElement("span");
      rank.className = "leaderboard-rank";
      rank.textContent = String(index + 1).padStart(2, "0");

      const name = document.createElement("span");
      name.className = "leaderboard-name";
      // Usernames are deliberately rendered as text, never HTML.
      name.textContent = String(row.username);

      const value = document.createElement("strong");
      value.className = "leaderboard-value";
      value.textContent = formatValue(row.value, currentCategory);

      li.append(rank, name, value);
      list.appendChild(li);
    });
  }

  function setBoards(data) {
    if (!data || typeof data !== "object") return;

    for (const category of ["score", "average", "maximum"]) {
      boards[category] = Array.isArray(data[category])
        ? data[category].slice(0, 15)
        : [];
    }

    boardLoaded = true;
    renderLeaderboard();
  }

  async function loadLeaderboard() {
    const revision = ++boardRevision;

    try {
      const data = await api("/api/leaderboard");
      if (revision !== boardRevision) return;
      setBoards(data);
    } catch (error) {
      if (revision !== boardRevision) return;
      boardLoaded = false;
      list.replaceChildren();
      const item = document.createElement("li");
      item.className = "leaderboard-placeholder";
      item.textContent =
        "Global rankings are temporarily unavailable. Your game still works!";
      list.appendChild(item);
    }
  }

  tabs.forEach(button => {
    button.addEventListener("click", () => {
      currentCategory = button.dataset.leaderboard;
      tabs.forEach(tab => {
        const active = tab === button;
        tab.classList.toggle("is-active", active);
        tab.setAttribute("aria-selected", String(active));
      });
      renderLeaderboard();
    });
  });

  async function submitRun(username, generation) {
    if (!currentRun || submitting) return;

    submitting = true;
    submitButton.disabled = true;
    showFeedback("Saving your record…");

    try {
      const payload = { ...currentRun };
      if (!currentPlayer) payload.username = username;

      const result = await api("/api/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      currentPlayer = result.username;
      ++boardRevision;
      setBoards(result.leaderboards);

      if (generation === screenGeneration) {
        updateIdentity();
        showForm(false);
        showFeedback("SAVED! Your best scores will update after future runs.");
      }
    } catch (error) {
      if (generation !== screenGeneration) return;

      showFeedback(error.message || "Couldn't save your run.", true);
      if (!currentPlayer) {
        showForm(true);
      }
    } finally {
      submitting = false;
      submitButton.disabled = false;
    }
  }

  form.addEventListener("submit", event => {
    event.preventDefault();
    if (submitting || !currentRun) return;

    const proposedName = nameInput.value.trim();
    if (!/^[A-Za-z0-9_-]{1,15}$/.test(proposedName)) {
      showFeedback(
        "Username must be 1–15 characters: letters, numbers, - or _.",
        true
      );
      nameInput.focus();
      return;
    }
    void submitRun(proposedName, screenGeneration);
  });

  skipButton.addEventListener("click", () => {
    showForm(false);
    showFeedback("No problem. Play another run whenever you're ready.");
  });

  function onGameOver(run) {
    const generation = ++screenGeneration;
    currentRun = {
      score: Math.max(0, Math.floor(Number(run.score) || 0)),
      avgSpeed: Math.max(0, Number(run.avgSpeed) || 0),
      maxSpeed: Math.max(0, Number(run.maxSpeed) || 0),
      duration: Math.max(0, Number(run.duration) || 0)
    };

    nameInput.value = "";
    showForm(false);
    showFeedback("");
    updateIdentity();

    // Rankings remain visible even if the user chooses not to register.
    void loadLeaderboard();

    void profilePromise.then(() => {
      if (generation !== screenGeneration) return;

      if (currentPlayer) {
        void submitRun(null, generation);
      } else {
        showForm(true);
        showFeedback("Your first run is ready. Enter a name to post it.");
      }
    });
  }

  function onGameStart() {
    ++screenGeneration;
    showForm(false);
    showFeedback("");
  }

  window.BMSLeaderboard = { onGameOver, onGameStart };
})();
