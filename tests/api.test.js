import { test } from "node:test";
import assert from "node:assert/strict";
import { rateLimit, clientId } from "../api/_ratelimit.js";
import handler from "../api/coach.js";

test("memory limiter blocks after the limit and resets in the next window", async () => {
  const env = {}, now = 1_800_000_000_000;
  for (let i = 0; i < 3; i++) assert.equal((await rateLimit("a", 3, 3600, { env, now })).ok, true);
  const blocked = await rateLimit("a", 3, 3600, { env, now });
  assert.equal(blocked.ok, false); assert.equal(blocked.store, "memory");
  assert.equal((await rateLimit("b", 3, 3600, { env, now })).ok, true, "limits are per client");
  assert.equal((await rateLimit("a", 3, 3600, { env, now: now + 3600_000 })).ok, true);
});

test("Redis limiter sends INCR and EXPIRE and trusts the shared count", async () => {
  let sent = null;
  const fetchImpl = async (url, opts) => { sent = { url, opts }; return { ok: true, json: async () => [{ result: 31 }, { result: 1 }] }; };
  const r = await rateLimit("1.2.3.4", 30, 3600, { env: { UPSTASH_REDIS_REST_URL: "https://x.upstash.io/", UPSTASH_REDIS_REST_TOKEN: "t" }, fetchImpl, now: 0 });
  assert.equal(r.ok, false); assert.equal(r.store, "redis");
  assert.equal(sent.url, "https://x.upstash.io/pipeline");
  assert.equal(sent.opts.headers.authorization, "Bearer t");
  assert.deepEqual(JSON.parse(sent.opts.body).map(c => c[0]), ["INCR", "EXPIRE"]);
});

test("Redis errors fall back to memory instead of failing", async () => {
  const fetchImpl = async () => { throw new Error("down"); };
  const r = await rateLimit("c", 5, 60, { env: { KV_REST_API_URL: "https://kv", KV_REST_API_TOKEN: "t" }, fetchImpl });
  assert.equal(r.ok, true); assert.equal(r.store, "memory");
});

test("clientId takes the first forwarded address", () => {
  assert.equal(clientId({ headers: { "x-forwarded-for": "9.9.9.9, 10.0.0.1" } }), "9.9.9.9");
  assert.equal(clientId({ headers: {} }), "local");
});

function call(req) {
  return new Promise(resolve => {
    const res = { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; },
      json(o) { resolve({ status: this.statusCode, body: o }); }, end() { resolve({ status: this.statusCode }); } };
    handler({ headers: {}, ...req }, res);
  });
}

test("API rejects bad requests before calling the AI", async () => {
  assert.equal((await call({ method: "GET" })).status, 405);
  assert.equal((await call({ method: "OPTIONS" })).status, 204);
  assert.equal((await call({ method: "POST", body: { mode: "hack" } })).status, 400);
  assert.equal((await call({ method: "POST", body: { transcript: "too short" } })).status, 400);
  assert.equal((await call({ method: "POST", body: { mode: "followup", history: [] } })).status, 400);
});

test("API explains a missing key", async () => {
  const saved = process.env.GEMINI_API_KEY; delete process.env.GEMINI_API_KEY;
  const r = await call({ method: "POST", body: { mode: "counter", stance: "for", topic: "UPI", transcript: "I think UPI is great because it is fast and cheap for everyone" } });
  assert.equal(r.status, 500); assert.match(r.body.error, /GEMINI_API_KEY/);
  if (saved) process.env.GEMINI_API_KEY = saved;
});
