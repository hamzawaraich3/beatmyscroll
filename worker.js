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

  getTop15(field) {
    const allowed = ["best_score", "best_avg_speed", "best_max_speed"];
    if (!allowed.includes(field)) {
      throw new Error("Invalid leaderboard metric");
    }
    return this.sql.exec(
      `SELECT username, ${field} AS value
         FROM players
         WHERE runs > 0
         ORDER BY ${field} DESC, updated_at ASC, username COLLATE NOCASE ASC
         LIMIT 15`
    ).toArray().map(row => ({
      username: row.username,
      value: Number(row.value)
    }));
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
          score: this.getTop15("best_score"),
          average: this.getTop15("best_avg_speed"),
          maximum: this.getTop15("best_max_speed")
        });
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
            score: this.getTop15("best_score"),
            average: this.getTop15("best_avg_speed"),
            maximum: this.getTop15("best_max_speed")
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
      return env.ASSETS.fetch(request);
    }

    if (!env.LEADERBOARD) {
      return reply({ error: "Leaderboard storage is not configured." }, 503);
    }

    const stub = env.LEADERBOARD.getByName("global-top15-v1");
    return stub.fetch(request);
  }
};
