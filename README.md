# BeatMyScroll

A one-page scroll endurance game with opt-in worldwide rankings.

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
