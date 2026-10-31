// Renders video.html frame by frame in headless Edge/Chrome.
//   node render.mjs stills 2.5 9.2 ...   -> work/stills/t-<time>.png
//   node render.mjs frames               -> work/frames/f00000.jpg ... (30 fps)
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FPS = 30, PORT = 9361, WEB = 3188;
const URL = `http://localhost:${WEB}/brag-output/work/video.html` + (process.env.SITE_URL ? "?url=" + encodeURIComponent(process.env.SITE_URL) : "");
const server = spawn(process.execPath, [path.join(HERE, "..", "..", "server.js")], { env: { ...process.env, PORT: String(WEB) }, stdio: "ignore" });
const BROWSER = [process.env.BROWSER, "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"].filter(Boolean).find(existsSync);
const [mode, ...rest] = process.argv.slice(2);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const profile = path.join(HERE, "profile");
const edge = spawn(BROWSER, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--no-first-run", "--disable-gpu", "--hide-scrollbars", "--force-color-profile=srgb", "about:blank"], { stdio: "ignore" });
let list;
for (let i = 0; i < 60; i++) { try { list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (list.find(t => t.type === "page")) break; } catch {} await sleep(250); }
const ws = new WebSocket(list.find(t => t.type === "page").webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map(), errors = [];
ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.exception?.description); };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => (await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result.result?.value;

await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }, { name: "prefers-reduced-motion", value: "reduce" }] });
await send("Page.navigate", { url: URL }); await sleep(1500);
const duration = await ev("window.ready");
if (!duration) { console.error("video.html did not load"); edge.kill(); server.kill(); process.exit(1); }
const grab = async (t, file, format) => {
  await ev(`renderAt(${t})`);
  const r = await send("Page.captureScreenshot", format === "png" ? { format: "png" } : { format: "jpeg", quality: 93 });
  writeFileSync(file, Buffer.from(r.result.data, "base64"));
};

if (mode === "eval") {
  await ev(`renderAt(${rest[0]})`);
  console.log(JSON.stringify(await ev(rest[1]), null, 1));
} else if (mode === "stills") {
  const dir = path.join(HERE, "stills"); mkdirSync(dir, { recursive: true });
  for (const t of rest.map(Number)) await grab(t, path.join(dir, `t-${t.toFixed(2)}.png`), "png");
} else {
  const dir = path.join(HERE, "frames"); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const n = Math.round(duration * FPS), t0 = Date.now();
  for (let f = 0; f < n; f++) {
    await grab(f / FPS, path.join(dir, `f${String(f).padStart(5, "0")}.jpg`), "jpeg");
    if (f % 150 === 0) console.log(`frame ${f}/${n} (${Math.round((Date.now() - t0) / 1000)} s)`);
  }
  console.log(`${n} frames`);
}
ws.close(); edge.kill(); server.kill();
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
process.exit(0);
