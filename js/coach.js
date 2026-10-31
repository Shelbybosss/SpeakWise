// Client for the AI endpoint (api/coach.js). Only text is ever sent, never audio or video.
const API = window.SW_API || "/api/coach";

export class NoServer extends Error {}

export async function askCoach(mode, payload) {
  let r;
  try {
    r = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode, ...payload }) });
  } catch { throw new NoServer("NOSERVER"); }
  const j = await r.json().catch(() => null);
  if (!j || r.status === 404 || r.status === 405) throw new NoServer("NOSERVER");
  if (!r.ok) throw new Error(j.error || "Server replied " + r.status);
  return j;
}
