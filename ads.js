/**
 * Two persistent sidebar placements on the start and results screens.
 * Deliberately NEVER reload ads for each game/retry.
 *
 * This file only makes ad requests after you add actual AdSense IDs
 * to ads-config.js. Without IDs, slots remain tasteful placeholders.
 */
(function () {
  "use strict";

  const config = window.BEAT_MY_SCROLL_ADS || {};
  const publisher = String(config.publisherId || "").trim();
  const leftSlot = String(config.leftSlotId || "").trim();
  const rightSlot = String(config.rightSlotId || "").trim();

  // IDs are supplied by the site owner, never generated or guessed.
  const validPublisher = /^ca-pub-[0-9]{10,20}$/.test(publisher);
  const validSlot = id => /^[0-9]{5,20}$/.test(id);

  if (!validPublisher || !validSlot(leftSlot) || !validSlot(rightSlot)) {
    // Do not load third-party scripts or request ads before configuration.
    return;
  }

  const spaciousScreen = window.matchMedia(
    "(min-width: 1360px) and (min-height: 690px)"
  );
  let started = false;

  function placeAd(id, slotId) {
    const container = document.getElementById(id);
    if (!container) return false;

    const unit = document.createElement("ins");
    unit.className = "adsbygoogle";
    unit.style.display = "block";
    unit.style.width = "100%";
    unit.style.height = "100%";
    unit.dataset.adClient = publisher;
    unit.dataset.adSlot = slotId;
    unit.dataset.adFormat = "auto";
    unit.dataset.fullWidthResponsive = "false";

    container.replaceChildren(unit);
    container.classList.add("is-live");

    return true;
  }

  function initializeAds() {
    if (
      started ||
      !spaciousScreen.matches ||
      document.body.classList.contains("playing")
    ) {
      return;
    }

    if (
      !placeAd("ad-left-slot", leftSlot) ||
      !placeAd("ad-right-slot", rightSlot)
    ) {
      return;
    }

    started = true;

    // AdSense is loaded once in <head> for site verification.
    // Only request manual ads after both ad-unit IDs are configured.
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      window.adsbygoogle.push({});
    } catch (error) {
      console.warn("Unable to initialize sidebar ads.", error);
    }
  }

  initializeAds();

  // If somebody starts on a narrow display and resizes, ads may initialize
  // once on a spacious screen; never request additional impressions on retry.
  if (typeof spaciousScreen.addEventListener === "function") {
    spaciousScreen.addEventListener("change", initializeAds);
  } else if (typeof spaciousScreen.addListener === "function") {
    spaciousScreen.addListener(initializeAds);
  }

  // If the user happened to start scrolling before initialization,
  // try again at the next game-over transition.
  const mutation = new MutationObserver(initializeAds);
  mutation.observe(document.body, {
    attributes: true,
    attributeFilter: ["class"]
  });
})();
