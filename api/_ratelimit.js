// Fixed-window rate limiter. Uses Upstash Redis (or Vercel KV, which exposes the same REST API) when configured,
// so the limit holds across serverless instances. Falls back to per-instance memory for local runs.
// Files starting with "_" in /api are not deployed as endpoints on Vercel.
const memory = new Map();

export async function rateLimit(id, max, windowSec, { now = Date.now(), env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const bucket = Math.floor(now / 1000 / windowSec), key = `speakwise:rl:${id}:${bucket}`;
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL, token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;

  if (url && token) {
    try {
      const r = await fetchImpl(url.replace(/\/+$/, "") + "/pipeline", {
        method: "POST",
        headers: { authorization: "Bearer " + token, "content-type": "application/json" },
        body: JSON.stringify([["INCR", key], ["EXPIRE", key, String(windowSec)]])
      });
      if (r.ok) {
        const out = await r.json(), count = Number(out && out[0] && out[0].result);
        if (Number.isFinite(count)) return { ok: count <= max, count, remaining: Math.max(0, max - count), store: "redis" };
      }
    } catch { /* Redis unreachable: fall through to memory rather than blocking every request */ }
  }

  for (const [k, v] of memory) if (v.bucket !== bucket) memory.delete(k);
  const e = memory.get(key) || { bucket, count: 0 };
  e.count++; memory.set(key, e);
  return { ok: e.count <= max, count: e.count, remaining: Math.max(0, max - e.count), store: "memory" };
}

export function clientId(req) {
  const h = req.headers || {};
  return String(h["x-forwarded-for"] || h["x-real-ip"] || (req.socket && req.socket.remoteAddress) || "local").split(",")[0].trim();
}
