// Captures real screenshots of the app for the intro site (site/assets). Run: npm run screenshots
// Needs Edge or Chrome. A generated speech-like WAV is fed to a fake microphone, so the waveform and audio scores are real.
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { summarize, localDate } from "../js/scoring.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "site", "assets"), TMP = path.join(tmpdir(), "speakwise-shots");
const PORT = 3177, BASE = `http://localhost:${PORT}/`, DEBUG = 9355;
const BROWSERS = [process.env.BROWSER, "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean);
const browser = BROWSERS.find(p => existsSync(p));
if (!browser) { console.error("Edge or Chrome not found. Set BROWSER to its path."); process.exit(1); }
mkdirSync(OUT, { recursive: true }); rmSync(TMP, { recursive: true, force: true }); mkdirSync(TMP, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- Speech-like audio: syllables with a falling pitch contour per phrase, short gaps between words ---------- */
function speechWav(seconds = 60, sr = 16000) {
  const n = seconds * sr, pcm = new Int16Array(n);
  let t = 0, seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  while (t < n) {
    const phrase = (2.5 + rnd() * 2) * sr, start = t, base = 150 + rnd() * 70;
    while (t < start + phrase && t < n) {
      const syl = Math.floor((.16 + rnd() * .14) * sr), amp = .25 + rnd() * .25;
      for (let i = 0; i < syl && t < n; i++, t++) {
        const p = (t - start) / phrase, f = base * (1.25 - .45 * p) * (1 + .06 * Math.sin(t / sr * 9)), env = Math.sin(Math.PI * i / syl);
        const ph = 2 * Math.PI * f * t / sr;
        pcm[t] = 32767 * amp * env * (.7 * Math.sin(ph) + .2 * Math.sin(2 * ph) + .1 * Math.sin(3 * ph));
      }
      t += Math.floor((.03 + rnd() * .06) * sr);
    }
    t += Math.floor((.35 + rnd() * .5) * sr);
  }
  const head = Buffer.alloc(44);
  head.write("RIFF", 0); head.writeUInt32LE(36 + n * 2, 4); head.write("WAVEfmt ", 8); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
  head.writeUInt32LE(sr, 24); head.writeUInt32LE(sr * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34); head.write("data", 36); head.writeUInt32LE(n * 2, 40);
  return Buffer.concat([head, Buffer.from(pcm.buffer)]);
}
const wav = path.join(TMP, "speech.wav");
writeFileSync(wav, speechWav());

/* ---------- Seed history so Progress has a story ---------- */
const day = n => { const d = new Date(); d.setDate(d.getDate() - n); return localDate(d); };
const SEED_TOPICS = [["Tell me about yourself", "HR & Behavioural"], ["Explain cloud computing to a beginner", "Tech & AI"], ["Why should we hire you?", "HR & Behavioural"], ["Digital payments and UPI in everyday life", "Current affairs"],
  ["Explain the four pillars of OOP with examples", "IT services"], ["What is your biggest achievement?", "HR & Behavioural"], ["Remote work vs office work", "Current affairs"], ["What is a database and why do we need one?", "Computer Science Basics"],
  ["How do you handle pressure and deadlines?", "HR & Behavioural"], ["Pick an app you use daily. How would you improve it?", "Product & startups"], ["Is AI replacing software engineers?", "Tech & AI"], ["Where do you see yourself in five years?", "HR & Behavioural"]];
function history(scale = 1, offset = 0, days = 12) {
  return SEED_TOPICS.slice(0, days).map(([t, cat], i) => {
    const g = (i / days) * 2.6 * scale + offset;
    const sc = { pace: 5.2 + g, fillers: 3.8 + g * 1.4, fluency: 5 + g, vocab: 6.5 + g * .6, structure: 3.5 + g * 1.5, relevance: 5.5 + g * .9, time: 7 + g * .8, voice: 4.5 + g * .9 };
    Object.keys(sc).forEach(k => sc[k] = Math.round(Math.min(10, Math.max(0, sc[k] + Math.sin(i * 3 + k.length) * .7)) * 10) / 10);
    const ks = Object.keys(sc).sort((a, b) => sc[a] - sc[b]), o = Math.round(Object.values(sc).reduce((a, b) => a + b) / 8 * 10) / 10;
    return { id: "seed" + i, d: day(days - i), ts: Date.now() - (days - i) * 864e5, cat, t, mode: i % 4 === 3 ? "interview" : "topic", lang: "en-IN", typed: false, o, sc,
      wpm: Math.round(108 + g * 9), fills: Math.max(1, Math.round(9 - g * 2.4)), fb: { basically: Math.max(0, Math.round(4 - g)), like: Math.max(0, Math.round(3 - g * .8)), um: Math.max(1, Math.round(3 - g * .6)) }, weak: ks[0] };
  });
}
const STORY_TOPIC = ["Describe a time you led a team", "lead team goal decision result", "What would you do differently?"];
const seed = { sw: JSON.stringify({ s: history() }), sb: JSON.stringify([STORY_TOPIC]), sx: JSON.stringify({ rc: false, cam: false, dur: 60 }) };

/* ---------- Browser plumbing ---------- */
const server = spawn(process.execPath, [path.join(ROOT, "server.js")], { env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
const edge = spawn(browser, ["--headless=new", `--remote-debugging-port=${DEBUG}`, `--user-data-dir=${path.join(TMP, "profile")}`, "--no-first-run", "--disable-gpu",
  "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${wav}`, "--autoplay-policy=no-user-gesture-required", "about:blank"], { stdio: "ignore" });
let list;
for (let i = 0; i < 60; i++) { try { list = await (await fetch(`http://127.0.0.1:${DEBUG}/json/list`)).json(); if (list.find(t => t.type === "page")) break; } catch {} await sleep(250); }
const ws = new WebSocket(list.find(t => t.type === "page").webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map(), errors = [];
ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.exception?.description); };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => { const r = await send("Runtime.evaluate", { expression: `(async()=>{${e}})()`, awaitPromise: true, returnByValue: true, userGesture: true }); if (r.result.exceptionDetails) errors.push(e.slice(0, 60) + ": " + r.result.exceptionDetails.exception?.description); return r.result.result?.value; };
const scheme = s => send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: s }, { name: "prefers-reduced-motion", value: "reduce" }] });
const viewport = (w, h, mobile) => send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile });
const scrollTo = (sel, dy = 0) => ev(`const el=document.querySelector(${JSON.stringify(sel)});scrollTo(0,el.getBoundingClientRect().top+scrollY-${dy})`);
async function shot(name) {
  for (const s of ["light", "dark"]) {
    await scheme(s); await sleep(350);
    const r = await send("Page.captureScreenshot", { format: "webp", quality: 82 });
    writeFileSync(path.join(OUT, `${name}-${s}.webp`), Buffer.from(r.result.data, "base64"));
    if (process.env.PREVIEW) writeFileSync(path.join(TMP, `${name}-${s}.png`), Buffer.from((await send("Page.captureScreenshot", { format: "png" })).result.data, "base64"));
  }
  await scheme("light");
  console.log("  " + name);
}
const typed = async text => { await ev(`document.querySelector('#manualbox').open=true;document.querySelector('#manual').value=${JSON.stringify(text)};document.querySelector('#an').click()`); await sleep(400); };

await send("Runtime.enable"); await send("Page.enable");
// Seed storage, hide install prompt and toasts, and take away speech recognition so the "type what you said" path keeps real audio timings.
await send("Page.addScriptToEvaluateOnNewDocument", { source: `
  if (location.port === "${PORT}" && !localStorage.getItem("seeded")) { ${Object.entries(seed).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join("")} localStorage.setItem("seeded","1"); }
  delete window.SpeechRecognition; delete window.webkitSpeechRecognition;
  addEventListener("DOMContentLoaded", () => { const s = document.createElement("style"); s.textContent = "#install,#nosr,.toast{display:none!important}html{scrollbar-width:none}::-webkit-scrollbar{display:none}"; document.head.append(s); });` });
await viewport(390, 844, true); await scheme("light");
await send("Page.navigate", { url: BASE }); await sleep(2500);
console.log("Capturing:");

// Two real recordings on the same story question, so the report shows a comparison.
const WEAK = "Um so basically in my third year we had a college fest and like there were no sponsors at all. I was kind of the lead so basically I had to find the money. I talked to some shops and um some of them said yes. It was actually really hard but we did it in the end.";
const STRONG = "In my third year, our college fest had no sponsors two weeks before the event. As sponsorship lead, my goal was to raise forty thousand rupees with a team of four. I made a decision to split the city into areas, I prepared a one page pitch and I reached out to twenty local shops myself. As a result we raised 40000 rupees, the fest ran on time, and I learned to pitch clearly and lead under pressure.";
async function record(seconds, text, during) {
  await ev(`document.querySelector('#go').click()`);
  await ev(`while(document.querySelector('#skip').classList.contains('hide'))await new Promise(r=>setTimeout(r,100))`);
  await ev(`document.querySelector('#skip').click()`);
  const t0 = Date.now();
  if (during) await during();
  await sleep(Math.max(0, seconds * 1000 - (Date.now() - t0)));
  await ev(`document.querySelector('#stop').click()`); await sleep(1200);
  await typed(text);
}
await ev(`document.querySelector('[data-v=practice]').click()`); await sleep(400);
await ev(`document.querySelector('#bankB').click()`);
await record(30, WEAK);
await ev(`document.querySelector('#retry').click()`); await sleep(400);
await record(38, STRONG, async () => {
  await sleep(14000);
  await ev(`document.querySelector('#live').textContent='…as sponsorship lead, my goal was to raise forty thousand rupees with a team of four. I made a decision to split the city into areas…'`);
  await scrollTo(".stage", 78); await shot("app-recording");
});
await scrollTo("#rep", 78); await shot("app-report");
await scrollTo("#rep .callout", 78); await shot("app-star-compare");

// Mock interview summary (typed answers are enough for the summary table).
await ev(`document.querySelector('#m-interview').click()`); await sleep(300);
const ANSWERS = [STRONG, "I would involve the team earlier. Because I planned alone, two volunteers felt left out. For example, next time I would hold a ten minute kickoff, share the targets, and let each person choose an area. In conclusion, I would lead with the team, not for it.",
  "Today I want to talk about what motivates me. Firstly, I enjoy building things people use, for example my attendance app is used by two hundred students. Secondly, I like learning fast because technology changes quickly. Overall, impact and learning keep me going.",
  "What demotivates me is unclear goals. For instance, in one project nobody knew who owned testing, so bugs slipped through. However, I learned to ask for clear owners early. In the end, clarity is something I now create rather than wait for."];
for (let i = 0; i < 4; i++) { await typed(ANSWERS[i]); if (i < 3) { await ev(`document.querySelector('#nextQ').click()`); await sleep(500); } }
await scrollTo("#rep", 78); await shot("app-interview");

// Group discussion rebuttal round.
await ev(`document.querySelector('#again').click()`); await sleep(300);
await ev(`document.querySelector('#m-gd').click(); document.querySelector('#stance [data-s=for]').click()`); await sleep(300);
await typed("I am for digital payments. Firstly, UPI is fast and free, for example my local vegetable seller now gets paid instantly. Secondly, it brings small shops into the formal economy, because every payment leaves a record. In conclusion, digital payments make everyday life simpler and fairer.");
await ev(`document.querySelector('#nextQ').click()`); await sleep(600);
await scrollTo(".stage", 78); await shot("app-gd");

// Progress.
await ev(`document.querySelector('[data-v=progress]').click()`); await sleep(500);
await shot("app-progress");
await scrollTo("#skills", 134); await shot("app-skills");

// Placement cell dashboard, desktop.
const NAMES = [["Priya Sharma", "CE-042", 1.2, .4], ["Arjun Rao", "CE-007", .6, -.6], ["Sneha Kulkarni", "CE-019", 1, .2], ["Mohammed Faiz", "CE-031", 1.4, .8], ["Ananya Iyer", "CE-011", .8, 0], ["Rohit Verma", "CE-055", .3, -1.1]];
const files = NAMES.map(([name, roll, scale, off], i) => {
  const sessions = history(scale, off, i === 1 ? 5 : 12).map(s => ({ d: i === 1 ? day(12 + Number(s.id.slice(4))) : s.d, cat: s.cat, mode: s.mode, o: s.o, sc: s.sc, wpm: s.wpm, fills: s.fills, weak: s.weak }));
  const f = path.join(TMP, roll + ".json");
  writeFileSync(f, JSON.stringify({ app: "SpeakWise", kind: "progress-share", version: 1, student: { name, roll, college: "Demo College of Engineering" }, summary: summarize(sessions), sessions }));
  return f;
});
await viewport(1280, 800, false);
await send("Page.navigate", { url: BASE + "dashboard.html" }); await sleep(1500);
const doc = await send("DOM.getDocument"), node = await send("DOM.querySelector", { nodeId: doc.result.root.nodeId, selector: "#files" });
await send("DOM.setFileInputFiles", { nodeId: node.result.nodeId, files });
await sleep(800);
await scrollTo("#out", 88); await shot("dashboard");

ws.close(); edge.kill(); server.kill();
if (errors.length) { console.error("Errors:\n" + errors.join("\n")); process.exit(1); }
console.log("Screenshots written to site/assets" + (process.env.PREVIEW ? `; PNG previews in ${TMP}` : ""));
process.exit(0);
