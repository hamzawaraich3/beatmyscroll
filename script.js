const scoreDisplay = document.getElementById("score");
const finalScoreDisplay = document.getElementById("final-score");
const shareButton = document.getElementById("share-button");
const shareMessage = document.getElementById("share-message");

let currentScore = 0;

function updateScore() {
  const scrollTop =
    window.scrollY ||
    document.documentElement.scrollTop;

  currentScore = Math.floor(scrollTop);

  scoreDisplay.textContent =
    currentScore.toLocaleString();

  finalScoreDisplay.textContent =
    currentScore.toLocaleString();
}

window.addEventListener("scroll", updateScore);

updateScore();

shareButton.addEventListener("click", async () => {

  const text =
    `I scored ${currentScore.toLocaleString()} on BeatMyScroll.com. Beat me.`;

  const shareData = {
    title: "Beat My Scroll",
    text: text,
    url: window.location.origin
  };

  try {

    if (navigator.share) {

      await navigator.share(shareData);

    } else {

      await navigator.clipboard.writeText(
        `${text} ${window.location.origin}`
      );

      shareMessage.textContent =
        "Copied to clipboard 👀";

    }

  } catch (error) {

    console.log("Sharing cancelled.");

  }

});
