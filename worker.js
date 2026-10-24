import { DurableObject } from "cloudflare:workers";

/**
 * BeatMyScroll global leaderboard.
 *
 * One SQLite-backed Durable Object is shared by every player.
 * No Cloudflare D1 database ID or third-party leaderboard is required.
 */

const COOKIE_NAME = "bms_player";
const COOKIE_LIFETIME = 60 * 60 * 24 * 180;
const USERNAME_PATTERN = /^[A-Za-z0-9_-]{1,15}$/;
const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff"
};

function reply(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders }
  });
}

function extractSession(request) {
  const cookie = request.headers.get("cookie") || "";
  const field = cookie.split(";").map(s => s.trim()).find(
    part => part.startsWith(COOKIE_NAME + "=")
  );
  const value = field ? field.slice(COOKIE_NAME.length + 1) : "";
  return /^[a-f0-9]{48}$/.test(value) ? value : null;
}

function makeSession() {
  const random = crypto.getRandomValues(new Uint8Array(24));
  return [...random].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function digestSession(value) {
  const data = new TextEncoder().encode(value);
  const buffer = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buffer)]
    .map(byte => byte.toString(16).padStart(2, "0")).join("");
}

const BMS_TESTS = [
  "reaction",
  "flick",
  "tracking",
  "switching",
  "precision",
  "click"
];

const BMS_WEIGHTS = {
  reaction: 0.20,
  flick: 0.25,
  tracking: 0.20,
  switching: 0.15,
  precision: 0.15,
  click: 0.05
};

function clampScore(value) {
  return Math.max(0, Math.min(100, value));
}

function bmsRatingFromScores(scores) {
  let weighted = 0;
  let weightTotal = 0;
  let completed = 0;

  for (const test of BMS_TESTS) {
    const score = Number(scores[test] || 0);

    if (score > 0) {
      completed += 1;
      weighted += score * BMS_WEIGHTS[test];
      weightTotal += BMS_WEIGHTS[test];
    }
  }

  const overall =
    weightTotal > 0
      ? weighted / weightTotal
      : 0;

  const rating =
    Math.round(
      Math.max(
        0,
        Math.min(
          2000,
          1000 + (overall - 50) * 20
        )
      )
    );

  let skillClass = "RECRUIT";

  if (rating >= 1950) skillClass = "DEMON";
  else if (rating >= 1800) skillClass = "IMMORTAL";
  else if (rating >= 1600) skillClass = "ASCENDANT";
  else if (rating >= 1400) skillClass = "DIAMOND";
  else if (rating >= 1200) skillClass = "PLATINUM";
  else if (rating >= 1000) skillClass = "GOLD";
  else if (rating >= 800) skillClass = "SILVER";
  else if (rating >= 600) skillClass = "BRONZE";

  return {
    overall: Math.round(overall * 10) / 10,
    rating,
    skillClass,
    completed,
    complete: completed === BMS_TESTS.length
  };
}

function parseBmsTest(data) {
  if (
    typeof data !== "object" ||
    data === null ||
    Array.isArray(data)
  ) {
    return null;
  }

  const test =
    typeof data.test === "string"
      ? data.test
      : "";

  const raw =
    typeof data.raw === "object" &&
    data.raw !== null &&
    !Array.isArray(data.raw)
      ? data.raw
      : null;

  if (!BMS_TESTS.includes(test) || !raw) {
    return null;
  }

  let score = 0;
  let cleanRaw = null;

  if (test === "reaction") {
    const medianMs = Number(raw.medianMs);

    if (
      !Number.isFinite(medianMs) ||
      medianMs < 80 ||
      medianMs > 1500
    ) return null;

    score =
      clampScore(
        ((400 - medianMs) / 250) * 100
      );

    cleanRaw = {
      medianMs: Math.round(medianMs)
    };
  }

  if (test === "click") {
    const cps = Number(raw.cps);

    if (
      !Number.isFinite(cps) ||
      cps < 0 ||
      cps > 40
    ) return null;

    score =
      clampScore(
        ((cps - 3) / 7) * 100
      );

    cleanRaw = {
      cps: Math.round(cps * 100) / 100
    };
  }

  if (test === "tracking") {
    const accuracy = Number(raw.accuracy);

    if (
      !Number.isFinite(accuracy) ||
      accuracy < 0 ||
      accuracy > 100
    ) return null;

    score =
      clampScore(accuracy);

    cleanRaw = {
      accuracy: Math.round(accuracy * 10) / 10
    };
  }

  if (test === "flick") {
    const avgMs = Number(raw.avgMs);
    const accuracy = Number(raw.accuracy);

    if (
      !Number.isFinite(avgMs) ||
      avgMs < 100 ||
      avgMs > 5000 ||
      !Number.isFinite(accuracy) ||
      accuracy < 0 ||
      accuracy > 100
    ) return null;

    const speedScore =
      clampScore(
        ((900 - avgMs) / 650) * 100
      );

    score =
      clampScore(
        speedScore *
        (
          0.55 +
          0.45 * (accuracy / 100)
        )
      );

    cleanRaw = {
      avgMs: Math.round(avgMs),
      accuracy: Math.round(accuracy * 10) / 10
    };
  }

  if (test === "switching") {
    const avgMs = Number(raw.avgMs);
    const accuracy = Number(raw.accuracy);

    if (
      !Number.isFinite(avgMs) ||
      avgMs < 100 ||
      avgMs > 5000 ||
      !Number.isFinite(accuracy) ||
      accuracy < 0 ||
      accuracy > 100
    ) return null;

    const speedScore =
      clampScore(
        ((850 - avgMs) / 600) * 100
      );

    score =
      clampScore(
        speedScore *
        (
          0.62 +
          0.38 * (accuracy / 100)
        )
      );

    cleanRaw = {
      avgMs: Math.round(avgMs),
      accuracy: Math.round(accuracy * 10) / 10
    };
  }

  if (test === "precision") {
    const precision = Number(raw.precision);
    const avgMs = Number(raw.avgMs);

    if (
      !Number.isFinite(precision) ||
      precision < 0 ||
      precision > 100 ||
      !Number.isFinite(avgMs) ||
      avgMs < 100 ||
      avgMs > 8000
    ) return null;

    const speedScore =
      clampScore(
        ((1400 - avgMs) / 1100) * 100
      );

    score =
      clampScore(
        precision * 0.78 +
        speedScore * 0.22
      );

    cleanRaw = {
      precision: Math.round(precision * 10) / 10,
      avgMs: Math.round(avgMs)
    };
  }

  return {
    test,
    score: Math.round(score * 10) / 10,
    raw: cleanRaw
  };
}

function parseRun(data) {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return null;
  }
  const score = data.score;
  const avgSpeed = data.avgSpeed;
  const maxSpeed = data.maxSpeed;
  const duration = data.duration;
  if (
    !Number.isSafeInteger(score) || score < 0 || score > 1000000000 ||
    typeof avgSpeed !== "number" || !Number.isFinite(avgSpeed) ||
    avgSpeed < 0 || avgSpeed > 10000000 ||
    typeof maxSpeed !== "number" || !Number.isFinite(maxSpeed) ||
    maxSpeed < 0 || maxSpeed > 10000000 ||
    typeof duration !== "number" || !Number.isFinite(duration) ||
    duration < 1.4 || duration > 7200
  ) {
    return null;
  }
  return {
    score,
    avgSpeed: Math.round(avgSpeed * 10) / 10,
    maxSpeed: Math.round(maxSpeed * 10) / 10,
    duration: Math.round(duration * 10) / 10
  };
}

export class LeaderboardStore extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;

    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT COLLATE NOCASE NOT NULL UNIQUE,
        session_hash TEXT NOT NULL UNIQUE,
        best_score INTEGER NOT NULL DEFAULT 0,
        best_avg_speed REAL NOT NULL DEFAULT 0,
        best_max_speed REAL NOT NULL DEFAULT 0,
        runs INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    this.sql.exec(
      "CREATE INDEX IF NOT EXISTS score_rank ON players(best_score DESC)"
    );
    this.sql.exec(
      "CREATE INDEX IF NOT EXISTS avg_rank ON players(best_avg_speed DESC)"
    );
    this.sql.exec(
      "CREATE INDEX IF NOT EXISTS max_rank ON players(best_max_speed DESC)"
    );

    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS benchmark_profiles (
        player_id INTEGER PRIMARY KEY,
        reaction_score REAL NOT NULL DEFAULT 0,
        reaction_raw TEXT,
        flick_score REAL NOT NULL DEFAULT 0,
        flick_raw TEXT,
        tracking_score REAL NOT NULL DEFAULT 0,
        tracking_raw TEXT,
        switching_score REAL NOT NULL DEFAULT 0,
        switching_raw TEXT,
        precision_score REAL NOT NULL DEFAULT 0,
        precision_raw TEXT,
        click_score REAL NOT NULL DEFAULT 0,
        click_raw TEXT,
        submissions INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY(player_id) REFERENCES players(id)
      )
    `);

    this.sql.exec(
      "CREATE INDEX IF NOT EXISTS benchmark_updated ON benchmark_profiles(updated_at DESC)"
    );
  }

  getTop(field, limit = 15) {
    const allowed = ["best_score", "best_avg_speed", "best_max_speed"];
    if (!allowed.includes(field)) {
      throw new Error("Invalid leaderboard metric");
    }

    const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));

    return this.sql.exec(
      `SELECT username, ${field} AS value, runs, updated_at
         FROM players
         WHERE runs > 0
         ORDER BY ${field} DESC, updated_at ASC, username COLLATE NOCASE ASC
         LIMIT ?`,
      safeLimit
    ).toArray().map(row => ({
      username: row.username,
      value: Number(row.value),
      runs: Number(row.runs),
      updatedAt: Number(row.updated_at)
    }));
  }

  getQuantiles(field) {
    const allowed = ["best_score", "best_avg_speed", "best_max_speed"];
    if (!allowed.includes(field)) {
      throw new Error("Invalid benchmark metric");
    }

    const countRow = this.sql.exec(
      `SELECT COUNT(*) AS count FROM players WHERE runs > 0 AND ${field} > 0`
    ).toArray()[0];

    const count = Number(countRow ? countRow.count : 0);

    if (!count) {
      return {
        count: 0,
        p10: 0,
        p25: 0,
        p50: 0,
        p75: 0,
        p90: 0,
        p95: 0,
        p99: 0
      };
    }

    const quantile = percentile => {
      const offset = Math.max(
        0,
        Math.min(
          count - 1,
          Math.ceil((percentile / 100) * count) - 1
        )
      );

      const row = this.sql.exec(
        `SELECT ${field} AS value
           FROM players
           WHERE runs > 0 AND ${field} > 0
           ORDER BY ${field} ASC
           LIMIT 1 OFFSET ?`,
        offset
      ).toArray()[0];

      return Number(row ? row.value : 0);
    };

    return {
      count,
      p10: quantile(10),
      p25: quantile(25),
      p50: quantile(50),
      p75: quantile(75),
      p90: quantile(90),
      p95: quantile(95),
      p99: quantile(99)
    };
  }

  getPublicStats() {
    const totals = this.sql.exec(
      `SELECT
         COUNT(*) AS players,
         COALESCE(SUM(runs), 0) AS submitted_runs,
         COALESCE(AVG(best_score), 0) AS avg_best_score,
         COALESCE(AVG(best_avg_speed), 0) AS avg_best_avg_speed,
         COALESCE(AVG(best_max_speed), 0) AS avg_best_max_speed,
         COALESCE(AVG(runs), 0) AS avg_runs_per_player
       FROM players
       WHERE runs > 0`
    ).toArray()[0] || {};

    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    const activity = this.sql.exec(
      `SELECT
         SUM(CASE WHEN updated_at >= ? THEN 1 ELSE 0 END) AS active_7d,
         SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS new_30d
       FROM players
       WHERE runs > 0`,
      sevenDaysAgo,
      thirtyDaysAgo
    ).toArray()[0] || {};

    return {
      players: Number(totals.players || 0),
      submittedRuns: Number(totals.submitted_runs || 0),
      averages: {
        bestScore: Number(totals.avg_best_score || 0),
        bestAverageSpeed: Number(totals.avg_best_avg_speed || 0),
        bestMaxSpeed: Number(totals.avg_best_max_speed || 0),
        runsPerPlayer: Number(totals.avg_runs_per_player || 0)
      },
      activity: {
        active7d: Number(activity.active_7d || 0),
        new30d: Number(activity.new_30d || 0)
      },
      records: {
        score: this.getTop("best_score", 1)[0] || null,
        average: this.getTop("best_avg_speed", 1)[0] || null,
        maximum: this.getTop("best_max_speed", 1)[0] || null
      },
      benchmarks: {
        averageSpeed: this.getQuantiles("best_avg_speed"),
        maxSpeed: this.getQuantiles("best_max_speed")
      },
      generatedAt: Date.now()
    };
  }

  getPercentile(field, value) {
    const allowed = ["best_avg_speed", "best_max_speed", "best_score"];

    if (!allowed.includes(field)) {
      throw new Error("Invalid benchmark metric");
    }

    const rows = this.sql.exec(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN ${field} <= ? THEN 1 ELSE 0 END) AS at_or_below
       FROM players
       WHERE runs > 0 AND ${field} > 0`,
      value
    ).toArray()[0] || {};

    const total = Number(rows.total || 0);
    const atOrBelow = Number(rows.at_or_below || 0);

    return {
      total,
      percentile: total
        ? Math.max(0, Math.min(100, (atOrBelow / total) * 100))
        : 0
    };
  }

  benchmarkRowToProfile(row) {
    if (!row) {
      return {
        scores: {
          reaction: 0,
          flick: 0,
          tracking: 0,
          switching: 0,
          precision: 0,
          click: 0
        },
        raw: {},
        rating: bmsRatingFromScores({})
      };
    }

    const scores = {
      reaction: Number(row.reaction_score || 0),
      flick: Number(row.flick_score || 0),
      tracking: Number(row.tracking_score || 0),
      switching: Number(row.switching_score || 0),
      precision: Number(row.precision_score || 0),
      click: Number(row.click_score || 0)
    };

    const raw = {};

    for (const test of BMS_TESTS) {
      const value = row[test + "_raw"];

      if (value) {
        try {
          raw[test] = JSON.parse(value);
        } catch {}
      }
    }

    return {
      scores,
      raw,
      submissions: Number(row.submissions || 0),
      updatedAt: Number(row.updated_at || 0),
      rating: bmsRatingFromScores(scores)
    };
  }

  getBenchmarkProfileByPlayerId(playerId) {
    const row = this.sql.exec(
      "SELECT * FROM benchmark_profiles WHERE player_id = ?",
      playerId
    ).toArray()[0] || null;

    return this.benchmarkRowToProfile(row);
  }

  getBenchmarkLeaderboard(limit = 50) {
    const safeLimit =
      Math.max(
        1,
        Math.min(100, Math.floor(limit))
      );

    const rows = this.sql.exec(
      `SELECT p.username, b.*
         FROM benchmark_profiles b
         JOIN players p ON p.id = b.player_id
         WHERE b.reaction_score > 0
           AND b.flick_score > 0
           AND b.tracking_score > 0
           AND b.switching_score > 0
           AND b.precision_score > 0
           AND b.click_score > 0`
    ).toArray();

    return rows
      .map(row => {
        const profile =
          this.benchmarkRowToProfile(row);

        return {
          username: row.username,
          rating: profile.rating.rating,
          overall: profile.rating.overall,
          skillClass: profile.rating.skillClass,
          scores: profile.scores,
          updatedAt: profile.updatedAt
        };
      })
      .sort((a, b) => {
        if (b.rating !== a.rating) {
          return b.rating - a.rating;
        }

        if (b.overall !== a.overall) {
          return b.overall - a.overall;
        }

        return a.username.localeCompare(b.username);
      })
      .slice(0, safeLimit);
  }

  getBenchmarkPercentile(rating) {
    const rows =
      this.getBenchmarkLeaderboard(10000);

    if (!rows.length) {
      return {
        total: 0,
        percentile: 0
      };
    }

    const atOrBelow =
      rows.filter(row => row.rating <= rating).length;

    return {
      total: rows.length,
      percentile:
        Math.round(
          (atOrBelow / rows.length) *
          1000
        ) / 10
    };
  }

  async findPlayer(request) {
    const session = extractSession(request);
    if (!session) return null;
    const hash = await digestSession(session);
    return this.sql.exec(
      "SELECT id, username, runs FROM players WHERE session_hash = ?",
      hash
    ).toArray()[0] || null;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === "/api/leaderboard" && request.method === "GET") {
        return reply({
          score: this.getTop("best_score", 15),
          average: this.getTop("best_avg_speed", 15),
          maximum: this.getTop("best_max_speed", 15)
        });
      }
      if (path === "/api/stats" && request.method === "GET") {
        return reply(
          this.getPublicStats(),
          200,
          {
            "Cache-Control": "public, max-age=60, stale-while-revalidate=300"
          }
        );
      }

      if (path === "/api/records" && request.method === "GET") {
        const requested = Number(url.searchParams.get("limit") || "50");
        const limit = Number.isFinite(requested)
          ? Math.max(1, Math.min(100, Math.floor(requested)))
          : 50;

        return reply(
          {
            score: this.getTop("best_score", limit),
            average: this.getTop("best_avg_speed", limit),
            maximum: this.getTop("best_max_speed", limit),
            limit,
            generatedAt: Date.now()
          },
          200,
          {
            "Cache-Control": "public, max-age=60, stale-while-revalidate=300"
          }
        );
      }

      if (path === "/api/benchmark" && request.method === "GET") {
        const metricMap = {
          average: "best_avg_speed",
          maximum: "best_max_speed",
          score: "best_score"
        };

        const metric = url.searchParams.get("metric") || "average";
        const field = metricMap[metric];
        const value = Number(url.searchParams.get("value"));

        if (!field || !Number.isFinite(value) || value < 0 || value > 1000000000) {
          return reply({ error: "Invalid benchmark request." }, 422);
        }

        const result = this.getPercentile(field, value);

        return reply(
          {
            metric,
            value,
            total: result.total,
            percentile: Math.round(result.percentile * 10) / 10,
            generatedAt: Date.now()
          },
          200,
          {
            "Cache-Control": "public, max-age=30, stale-while-revalidate=120"
          }
        );
      }


      if (path === "/api/bms-leaderboard" && request.method === "GET") {
        const requested =
          Number(url.searchParams.get("limit") || "50");

        const limit =
          Number.isFinite(requested)
            ? Math.max(1, Math.min(100, Math.floor(requested)))
            : 50;

        return reply(
          {
            leaderboard:
              this.getBenchmarkLeaderboard(limit),
            generatedAt: Date.now()
          },
          200,
          {
            "Cache-Control":
              "public, max-age=60, stale-while-revalidate=300"
          }
        );
      }

      if (path === "/api/bms-user" && request.method === "GET") {
        const username =
          (url.searchParams.get("username") || "").trim();

        if (!USERNAME_PATTERN.test(username)) {
          return reply({
            error: "Invalid username."
          }, 422);
        }

        const player =
          this.sql.exec(
            "SELECT id, username FROM players WHERE username = ? COLLATE NOCASE",
            username
          ).toArray()[0];

        if (!player) {
          return reply({
            error: "Profile not found."
          }, 404);
        }

        const profile =
          this.getBenchmarkProfileByPlayerId(
            player.id
          );

        const percentile =
          profile.rating.complete
            ? this.getBenchmarkPercentile(
                profile.rating.rating
              )
            : {
                total:
                  this.getBenchmarkLeaderboard(10000).length,
                percentile: 0
              };

        return reply(
          {
            username: player.username,
            profile,
            percentile
          },
          200,
          {
            "Cache-Control":
              "public, max-age=60, stale-while-revalidate=300"
          }
        );
      }

      if (path === "/api/bms-profile" && request.method === "GET") {
        const player =
          await this.findPlayer(request);

        if (!player) {
          return reply({
            username: null,
            profile:
              this.benchmarkRowToProfile(null),
            percentile: {
              total: 0,
              percentile: 0
            }
          });
        }

        const profile =
          this.getBenchmarkProfileByPlayerId(
            player.id
          );

        const percentile =
          profile.rating.complete
            ? this.getBenchmarkPercentile(
                profile.rating.rating
              )
            : {
                total:
                  this.getBenchmarkLeaderboard(10000).length,
                percentile: 0
              };

        return reply({
          username: player.username,
          profile,
          percentile
        });
      }

      if (path === "/api/bms-submit" && request.method === "POST") {
        const origin =
          request.headers.get("origin");

        if (origin && origin !== url.origin) {
          return reply({
            error: "Cross-site submission denied."
          }, 403);
        }

        if (
          !(request.headers.get("content-type") || "")
            .includes("application/json")
        ) {
          return reply({
            error: "Expected JSON."
          }, 415);
        }

        const bodyText =
          await request.text();

        if (bodyText.length > 4096) {
          return reply({
            error: "Request too large."
          }, 413);
        }

        let payload;

        try {
          payload = JSON.parse(bodyText);
        } catch {
          return reply({
            error: "Invalid JSON."
          }, 400);
        }

        const result =
          parseBmsTest(payload);

        if (!result) {
          return reply({
            error: "Invalid benchmark result."
          }, 422);
        }

        const now = Date.now();

        let player =
          await this.findPlayer(request);

        let cookieHeader = null;

        if (!player) {
          const username =
            typeof payload.username === "string"
              ? payload.username.trim()
              : "";

          if (!USERNAME_PATTERN.test(username)) {
            return reply({
              error:
                "Choose a username with 1–15 letters, numbers, - or _.",
              code: "NAME_REQUIRED"
            }, 422);
          }

          const alreadyExists =
            this.sql.exec(
              "SELECT id FROM players WHERE username = ? COLLATE NOCASE",
              username
            ).toArray()[0];

          if (alreadyExists) {
            return reply({
              error:
                "That username is taken. Try another!",
              code: "NAME_TAKEN"
            }, 409);
          }

          const session = makeSession();
          const hash =
            await digestSession(session);

          this.sql.exec(
            `INSERT INTO players
               (username, session_hash, created_at, updated_at)
               VALUES (?, ?, ?, ?)`,
            username,
            hash,
            now,
            now
          );

          player =
            this.sql.exec(
              "SELECT id, username, runs FROM players WHERE session_hash = ?",
              hash
            ).toArray()[0];

          cookieHeader =
            `${COOKIE_NAME}=${session}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_LIFETIME}`;
        }

        this.sql.exec(
          `INSERT INTO benchmark_profiles
             (player_id, updated_at)
             VALUES (?, ?)
             ON CONFLICT(player_id) DO NOTHING`,
          player.id,
          now
        );

        const scoreColumn =
          result.test + "_score";

        const rawColumn =
          result.test + "_raw";

        const current =
          this.sql.exec(
            `SELECT ${scoreColumn} AS score
               FROM benchmark_profiles
               WHERE player_id = ?`,
            player.id
          ).toArray()[0];

        const previousScore =
          Number(current ? current.score : 0);

        if (result.score > previousScore) {
          this.sql.exec(
            `UPDATE benchmark_profiles
               SET ${scoreColumn} = ?,
                   ${rawColumn} = ?,
                   submissions = submissions + 1,
                   updated_at = ?
               WHERE player_id = ?`,
            result.score,
            JSON.stringify(result.raw),
            now,
            player.id
          );
        } else {
          this.sql.exec(
            `UPDATE benchmark_profiles
               SET submissions = submissions + 1,
                   updated_at = ?
               WHERE player_id = ?`,
            now,
            player.id
          );
        }

        const profile =
          this.getBenchmarkProfileByPlayerId(
            player.id
          );

        const percentile =
          profile.rating.complete
            ? this.getBenchmarkPercentile(
                profile.rating.rating
              )
            : {
                total:
                  this.getBenchmarkLeaderboard(10000).length,
                percentile: 0
              };

        return reply(
          {
            success: true,
            username: player.username,
            result: {
              test: result.test,
              score: result.score,
              raw: result.raw,
              personalBest:
                result.score > previousScore
            },
            profile,
            percentile
          },
          200,
          cookieHeader
            ? { "Set-Cookie": cookieHeader }
            : {}
        );
      }

      if (path === "/api/me" && request.method === "GET") {
        const player = await this.findPlayer(request);
        return reply({
          username: player ? player.username : null,
          runs: player ? player.runs : 0
        });
      }

      if (path === "/api/scores" && request.method === "POST") {
        const origin = request.headers.get("origin");
        if (origin && origin !== url.origin) {
          return reply({ error: "Cross-site submission denied." }, 403);
        }
        if (!(request.headers.get("content-type") || "").includes("application/json")) {
          return reply({ error: "Expected JSON." }, 415);
        }
        const contentLength = Number(request.headers.get("content-length") || "0");
        if (contentLength > 2048) {
          return reply({ error: "Request too large." }, 413);
        }
        const bodyText = await request.text();
        if (bodyText.length > 2048) {
          return reply({ error: "Request too large." }, 413);
        }

        let payload;
        try {
          payload = JSON.parse(bodyText);
        } catch {
          return reply({ error: "Invalid JSON." }, 400);
        }
        const run = parseRun(payload);
        if (!run) {
          return reply({ error: "Invalid run statistics." }, 422);
        }

        const now = Date.now();
        let player = await this.findPlayer(request);
        let cookieHeader = null;

        if (!player) {
          const username =
            typeof payload.username === "string" ?
              payload.username.trim() : "";
          if (!USERNAME_PATTERN.test(username)) {
            return reply({
              error: "Choose a username with 1–15 letters, numbers, - or _.",
              code: "NAME_REQUIRED"
            }, 422);
          }
          const alreadyExists = this.sql.exec(
            "SELECT id FROM players WHERE username = ? COLLATE NOCASE",
            username
          ).toArray()[0];
          if (alreadyExists) {
            return reply({
              error: "That username is taken. Try another!",
              code: "NAME_TAKEN"
            }, 409);
          }

          const session = makeSession();
          const hash = await digestSession(session);
          try {
            this.sql.exec(
              `INSERT INTO players
                 (username, session_hash, created_at, updated_at)
                 VALUES (?, ?, ?, ?)`,
              username, hash, now, now
            );
          } catch {
            return reply({
              error: "That username is unavailable. Try another!",
              code: "NAME_TAKEN"
            }, 409);
          }
          player = this.sql.exec(
            "SELECT id, username, runs FROM players WHERE session_hash = ?",
            hash
          ).toArray()[0];

          cookieHeader =
            `${COOKIE_NAME}=${session}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_LIFETIME}`;
        } else if (
          payload.username &&
          payload.username !== player.username
        ) {
          // A returning player cannot rename by sending a new username.
          return reply({
            error: "This browser already has a leaderboard username."
          }, 409);
        }

        this.sql.exec(
          `UPDATE players
             SET best_score = MAX(best_score, ?),
                 best_avg_speed = MAX(best_avg_speed, ?),
                 best_max_speed = MAX(best_max_speed, ?),
                 runs = runs + 1,
                 updated_at = ?
             WHERE id = ?`,
          run.score, run.avgSpeed, run.maxSpeed, now, player.id
        );

        return reply({
          success: true,
          username: player.username,
          message: "Your best scores are saved!",
          leaderboards: {
            score: this.getTop("best_score", 15),
            average: this.getTop("best_avg_speed", 15),
            maximum: this.getTop("best_max_speed", 15)
          }
        }, 200, cookieHeader ? { "Set-Cookie": cookieHeader } : {});
      }

      return reply({ error: "Not found." }, 404);
    } catch (error) {
      console.error("Leaderboard storage error:", error);
      return reply({ error: "Leaderboard is temporarily unavailable." }, 503);
    }
  }
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;

    if (!pathname.startsWith("/api/")) {
      const response = await env.ASSETS.fetch(request);

      if (
        request.method !== "GET" ||
        !response.ok
      ) {
        return response;
      }

      const headers =
        new Headers(response.headers);

      if (/\.(mp3|gif|webp|png|jpg|jpeg)$/i.test(pathname)) {
        headers.set(
          "Cache-Control",
          "public, max-age=86400, stale-while-revalidate=604800"
        );
      } else if (/\.(css|js)$/i.test(pathname)) {
        headers.set(
          "Cache-Control",
          "public, max-age=3600, stale-while-revalidate=86400"
        );
      } else if (/\.(txt|xml)$/i.test(pathname)) {
        headers.set(
          "Cache-Control",
          "public, max-age=3600"
        );
      }

      return new Response(
        response.body,
        {
          status: response.status,
          statusText: response.statusText,
          headers
        }
      );
    }

    if (!env.LEADERBOARD) {
      return reply({ error: "Leaderboard storage is not configured." }, 503);
    }

    const stub = env.LEADERBOARD.getByName("global-top15-v1");
    return stub.fetch(request);
  }
};
