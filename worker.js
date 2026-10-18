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
