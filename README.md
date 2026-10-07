# BeatMyScroll

A one-page scroll endurance game with opt-in worldwide rankings.

## Better sound quality (optional high-quality upgrade)

The game selects the best audio source available:

1. Full-quality `audio/*.mp3` files on the website (user-provided original recordings).
2. The original embedded clips in `media/*.js` until the HQ audio is uploaded.

The music manager avoids unnecessary restarts and fades between stages rather
than abruptly cutting and replaying tracks at every speed fluctuation.

To activate **full-quality** audio, extract the supplied
`BeatMyScroll-HQ-Audio.zip` archive, navigate to the existing `audio`
folder in GitHub, and use **Add file → Upload files** to upload all six MP3s.
Required filenames (case-sensitive):

```text
audio/sonic.mp3
audio/goku.mp3
audio/alquimia.mp3
audio/aura.mp3
audio/click.mp3
audio/fahh.mp3
```

After committing, Cloudflare redeploys the assets; the JS player selects them
automatically and streams long songs as needed. All files must be present
for reliable results. The fallback soundtrack remains available until upload.

IMPORTANT: These recordings may be protected by copyright. Obtain the
appropriate licenses before using them on a monetized public website, or
replace them with music you are permitted to distribute.

## Side advertisements

The start screen and game-over screen share two **side-only** ad placements
(left and right). They never cover the center or active gameplay, and no
new ad request is made when a run finishes or a player retries.

Ads are intentionally hidden on narrow windows (<1360px) or short windows
(<690px). During actual gameplay, both rails are hidden. This means mobile
players see no ads and the game remains uncluttered.

The layout and optional Google AdSense integration are ready, but **ads are
NOT live until you activate your own approved Google AdSense account**:

1. Apply for Google AdSense at https://www.google.com/adsense/start/ and
   add `beatmyscroll.com` for approval.
2. Choose **Ads → By ad unit → Display ads** and make two units:
   `BeatMyScroll Left` and `BeatMyScroll Right`.
3. Edit `ads-config.js` to paste your real `ca-pub-...` publisher ID
   and the two numeric slot IDs.
4. Commit to GitHub and deploy through Cloudflare; allow time for Google
   to approve the site and start serving creative content.
5. Leave **Auto ads**, anchor/overlay ads, interstitials, and vignette ads
   switched off so ads do not unexpectedly appear during gameplay.
6. Follow Google's `ads.txt` instructions for your own publisher ID once
   an AdSense account is approved.

No third-party script loads while the publisher/slot settings are empty.
Until configured, clearly marked, understated `AD SPACE` placeholders are
shown on desktop only. AdSense policies prohibit encouraging ad clicks or
placing ads close to play controls.

## Leaderboard

After the first run, a player can choose a username (1–15 characters; letters,
numbers, hyphen, underscore) and submit their run. A private, secure,
180-day browser cookie remembers the username; subsequent runs automatically
update that player's **best raw score**, **best average scrolls/sec**, and
**best maximum scrolls/sec**. Each ranking shows the top 15 unique usernames.

Each player keeps their own bests. Registration is optional; players can
continue playing without a name. Browser cookies are not cross-device logins.
If a player clears cookies or changes devices, their username can't be recovered
without a future account-recovery feature.

Storage: one Cloudflare SQLite-backed Durable Object. The namespace is created
automatically from the `wrangler.toml` configuration on deployment. No separate
D1 database or API key is required.

## Deploy

The Cloudflare Worker is named `beatmyscroll` and serves static assets plus
the API from the same hostname. In Cloudflare **Workers & Pages > beatmyscroll
> Settings > Build**, the recommended deploy command is:

```bash
npx wrangler deploy
```

The old deploy command with `--assets=.` may override the configured assets
directory, so prefer the simpler command above. No build command is needed.
The repo's `.assetsignore` excludes Worker source, the deployment config,
and Git metadata from public assets.

Test after deployment:

- `https://beatmyscroll.com/api/leaderboard` — JSON with `score`,
  `average` and `maximum` arrays.
- `https://beatmyscroll.com/api/me` — JSON with `username: null`
  until a player registers.
- Play a run, register a username, see results appear in the top-15 list.
- Play again in the same browser; best records update automatically.
- Test the Game Over screen's independent scrolling on iOS/Android.

## A note on fairness

The API validates type/ranges, limits usernames, and keeps one entry per
browser-generated server-side session. The browser still reports its own
speed and score values. This is **not an anti-cheat system**: modified browsers
can forge results. Consider server-verified run events, rate limiting,
moderation and a reset/admin workflow before serious public competition.
