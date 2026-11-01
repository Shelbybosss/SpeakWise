import { TOPICS, PACKS, DOMAINS, GD_CATEGORIES, INTERVIEW_DEFAULT } from "./topics.js";
import { LABEL, MEASURED, LANGS, scoreSession, summarizeScores, compareSessions, isStoryQuestion, keywordsFrom, tokenize, countFillers,
  fillerSegments, localDate, streakDays, skillAverages, topFillers, summarize, avg } from "./scoring.js";
import * as store from "./store.js";
import { createMedia } from "./media.js";
import { createWave } from "./wave.js";
import { askCoach, NoServer, getApiKey, setApiKey } from "./coach.js";
import { questionsFromResume } from "./resume.js";

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const SM = () => matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
const fmt = s => String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(Math.floor(s % 60)).padStart(2, "0");
const wait = ms => new Promise(r => setTimeout(r, ms));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const durSel = () => +document.querySelector("input[name=dur]:checked").value;
const langSel = () => $("lang").value;
const langOf = k => LANGS[k] || LANGS["en-IN"];

const RESUME = "My resume";
const MODE_NAME = { topic: "Single topic", interview: "Mock interview", gd: "Group discussion" };
const ROUNDS = { interview: 4, gd: 2 };
const STANCE = { for: "For", against: "Against", balanced: "Balanced" };
const STRUCTURE_HINT = "Structure tip: 1 line introduction, 2 points with an example each, 1 line conclusion.";
const STAR_HINT = "STAR tip: Situation, Task, Action, Result. Spend most of your time on what you did.";
const GD_HINT = "GD tip: state your side in the first sentence, give two reasons with an example, and end with a clear position.";
const NOSERVER_HTML = "The AI coach needs the backend. Run <code>node server.js</code> and open <b>http://localhost:3000</b>, or deploy on Vercel (see README).";
const REL_TAG = { on_topic: "On topic", partly: "Partly on topic", off_topic: "Off topic" };
const ICON = {
  ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="m7.8 12.4 2.9 2.9 5.6-6"/></svg>',
  mid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="M8 12h8"/></svg>',
  low: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.2 2 20.5h20z"/><path d="M12 10v4.5M12 17.6v.1"/></svg>'
};
const level = v => v >= 7 ? "ok" : v >= 4 ? "mid" : "low";
const LEVEL_TEXT = { ok: "good", mid: "fair", low: "needs work" };

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const wave = createWave($("wave"));
const media = createMedia({
  video: $("vid"),
  onLevel(lv, v) { $("vol").style.width = lv + "%"; $("lvl").setAttribute("aria-valuenow", lv); if (v != null) wave.push(v); }
});

let extra = {};
const S = { cat: Object.keys(TOPICS)[0], cur: null, mode: "topic", stance: "for", flow: null, target: 60, pending: null };
let rec = null, tick = 0, prepT = 0, t0 = 0, speech = { final: "", interim: "", evs: [], conf: [] }, watchFillers = [];
const busy = () => !!(tick || prepT);

/* ---------- Small UI helpers ---------- */

let toastT = 0;
function toast(msg) { const el = $("toast"); el.textContent = msg; el.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove("on"), 3400); }

function download(text, name, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ---------- Topics ---------- */

const allCats = () => ({ ...TOPICS, ...extra });
function topicsOf(c) {
  if (c === RESUME) return store.resumeTopics();
  return allCats()[c] || (PACKS[c] && PACKS[c].topics) || null;
}
const toTopic = (cat, a) => ({ cat, title: a[0], kw: a[1] || "", follow: a[2] || "" });
const hintFor = (c, title) => PACKS[c] ? PACKS[c].tips : S.mode === "gd" ? GD_HINT : isStoryQuestion(title) ? STAR_HINT : STRUCTURE_HINT;

function chipRow(el, names) {
  el.replaceChildren(...names.map(c => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = c; b.dataset.cat = c; b.onclick = () => pick(c);
    return b;
  }));
}
function renderCats() {
  const cats = Object.keys(allCats());
  if (store.resumeTopics().length) cats.push(RESUME);
  chipRow($("cats"), cats);
  chipRow($("packchips"), Object.keys(PACKS));
  markCats(); bankCount(); renderHomeGrids();
  $("clrq").classList.toggle("hide", !store.resumeTopics().length);
}
function markCats() { document.querySelectorAll("#cats button, #packchips button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.cat === S.cat))); }
const bankCount = () => $("bankB").textContent = "My bank (" + store.bank().length + ")";

function pick(c = S.cat, seed) {
  let list = topicsOf(c);
  if (!list || !list.length) { c = Object.keys(TOPICS)[0]; list = TOPICS[c]; }
  S.cat = c; markCats();
  let i;
  if (seed != null) i = seed % list.length;
  else {
    const recent = store.recent();
    let free = list.map((_, k) => k).filter(k => !recent.includes(c + "|" + k));
    if (!free.length) { store.clearRecent(c); free = list.map((_, k) => k); }
    i = free[Math.floor(Math.random() * free.length)];
    store.pushRecent(c + "|" + i);
  }
  setTopic(toTopic(c, list[i]), { label: c, hint: hintFor(c, list[i][0]) });
}

function setTopic(t, { label = t.cat, hint = "", hintHTML = null, keepFlow = false } = {}) {
  if (!keepFlow) endFlow();
  S.cur = t;
  $("tcat").textContent = label;
  $("topic").textContent = t.title;
  if (hintHTML != null) $("hint").innerHTML = hintHTML; else $("hint").textContent = hint;
  $("counter").classList.toggle("hide", !t.counter);
  $("counter").textContent = t.counter ? "“" + t.counter + "”" : "";
  if (!busy()) { $("clock").textContent = "00:00"; wave.reset(); }
  syncStage();
}

$("newT").onclick = () => pick();
$("useOwn").onclick = () => {
  const t = $("own").value.trim();
  if (t.length < 3) { toast("Type a topic of at least 3 characters."); return; }
  setTopic({ cat: "My topics", title: t, kw: keywordsFrom(t) || "topic", follow: "Why did you choose this topic, and what would you add if you had two more minutes?" },
    { label: "Your topic", hint: "Your own topic. Relevance is judged by whether you use its key words, so mention them naturally." });
};
$("own").onkeydown = e => { if (e.key === "Enter") $("useOwn").click(); };
$("daily").onclick = daily;
function daily() {
  const d = Math.floor(Date.now() / 864e5), k = Object.keys(TOPICS);
  pick(k[d % k.length], d);
  $("tcat").textContent = "Daily challenge: " + S.cur.cat;
}
$("smart").onclick = () => {
  const w = weakestCat();
  if (!w) { pick(); toast("Smart pick needs 2+ sessions. Random topic chosen."); return; }
  pick(w.cat);
  $("hint").textContent = `Smart pick: “${w.cat}” is your lowest-scoring category (average ${w.avg.toFixed(1)} out of 10).`;
};
function weakestCat() {
  const s = store.sessions();
  if (s.length < 2) return null;
  const m = {};
  s.filter(x => topicsOf(x.cat)).forEach(x => (m[x.cat] = m[x.cat] || []).push(x.o));
  const best = Object.entries(m).map(([cat, v]) => ({ cat, avg: avg(v) })).sort((a, b) => a.avg - b.avg)[0];
  return best || null;
}

async function live() {
  const q = $("own").value.trim() || DOMAINS[Math.floor(Math.random() * DOMAINS.length)];
  endFlow();
  $("tcat").textContent = "Live topic"; $("topic").textContent = "Finding a topic about “" + q + "”…"; $("hint").textContent = "";
  try {
    const j = await (await fetch("https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=25&srsearch=" + encodeURIComponent(q))).json();
    const r = j.query.search.filter(x => !/disambiguation|list of/i.test(x.title + x.snippet));
    if (!r.length) throw new Error("none");
    const t = r[Math.floor(Math.random() * r.length)].title;
    const s = await (await fetch("https://en.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(t))).json();
    const u = s.content_urls && s.content_urls.desktop.page;
    setTopic({ cat: "Live topics", title: "Explain “" + s.title + "” in your own words and say why it matters", kw: keywordsFrom((s.extract || "") + " " + s.title) || "topic", follow: "Where might you see or use this in a real job?" },
      { label: "Live topic", hintHTML: "Live topic from “" + esc(q) + "”. Verify facts afterwards at <a href=\"" + esc(u) + "\" target=\"_blank\" rel=\"noopener\">Wikipedia</a>. Press Save topic to keep it." });
  } catch {
    $("topic").textContent = "Couldn't reach Wikipedia. Check your connection, or pick a category instead.";
    S.cur = null;
  }
}
$("liveB").onclick = live;

$("saveT").onclick = () => {
  if (!S.cur) { toast("Pick or type a topic first."); return; }
  if (store.addToBank([S.cur.title, S.cur.kw, S.cur.follow])) { bankCount(); toast("Saved to My bank (" + store.bank().length + ")."); }
  else toast("Already in My bank.");
};
$("bankB").onclick = () => {
  const b = store.bank();
  if (!b.length) { toast("Your bank is empty. Pick or type a topic, then press Save topic."); return; }
  const t = b[Math.floor(Math.random() * b.length)];
  setTopic(toTopic("My bank", t), { label: "My bank", hint: "From your saved topics." });
};

/* ---------- Resume questions ---------- */

$("mkq").onclick = () => {
  const qs = questionsFromResume($("resume").value);
  if (!qs.length) { toast("Couldn't find projects or skills. Paste the full text, including a Projects or Skills section."); return; }
  store.setResumeTopics(qs);
  $("resume").value = "";
  renderCats(); pick(RESUME);
  toast(`Made ${qs.length} questions from your resume.`);
  $("topic").scrollIntoView({ behavior: SM(), block: "center" });
};
$("clrq").onclick = () => { store.setResumeTopics([]); if (S.cat === RESUME) pick(Object.keys(TOPICS)[0]); renderCats(); toast("Resume questions removed."); };

/* ---------- Modes: single topic, mock interview, group discussion ---------- */

document.querySelectorAll("input[name=mode]").forEach(r => r.onchange = () => setMode(r.value));
function setMode(m) {
  S.mode = m; $("m-" + m).checked = true;
  endFlow();
  $("aiRow").classList.toggle("hide", m === "topic");
  $("gohint").textContent = m === "interview" ? "Four questions in a row, each with 15 seconds to plan." : m === "gd" ? "Pick your side, give your opening, then answer a counter-argument." : "You get 15 seconds to plan, then recording starts.";
  const c = S.cur && !S.cur.counter ? S.cur.cat : null;
  // Interviews chain the bank's follow-ups, so they need a bank topic; a GD can also use a topic the student typed.
  if (m === "gd" && !GD_CATEGORIES.includes(c) && c !== "My topics") pick(GD_CATEGORIES[0]);
  else if (m === "interview" && !topicsOf(c)) pick(INTERVIEW_DEFAULT);
  else if (!c) pick();
  else $("hint").textContent = hintFor(S.cur.cat, S.cur.title);
  syncStage();
}

function endFlow() {
  const F = S.flow;
  if (F && F.rounds.length && F.rounds.length < F.total) toast(`${MODE_NAME[F.kind]} ended. Your answers are saved in Progress.`);
  S.flow = null;
}
function ensureFlow() {
  if (S.flow && S.flow.rounds.length >= S.flow.total) S.flow = null;
  if (S.mode !== "topic" && !S.flow) S.flow = { kind: S.mode, total: ROUNDS[S.mode], rounds: [], stance: S.stance };
}
const roundLabel = (F, i) => F.kind === "gd" ? (i ? "Your rebuttal" : "Your opening") : `Question ${i + 1} of ${F.total}`;
const stanceText = s => s === "balanced" ? "a balanced view" : s;

function syncStage() {
  const on = S.mode !== "topic", F = S.flow, total = ROUNDS[S.mode] || 0, done = F ? F.rounds.length : 0, complete = F && done >= total;
  $("flowbar").classList.toggle("hide", !on);
  if (on) {
    const k = Math.min(done + 1, total);
    const step = S.mode === "gd" ? (complete ? "complete" : k === 1 ? "your opening" : "your rebuttal") : (complete ? "complete" : `question ${k} of ${total}`);
    $("flowlbl").textContent = MODE_NAME[S.mode] + ", " + step + (S.mode === "gd" && F ? ` (arguing ${stanceText(F.stance)})` : "");
    if (S.mode === "gd") $("gohint").textContent = done === 1 && !complete ? "15 seconds to plan, then 30 seconds to respond." : "Pick your side, give your opening, then answer a counter-argument.";
    $("dots").innerHTML = Array.from({ length: total }, (_, i) => `<i class="${i < done ? "done" : i === done && !complete ? "now" : ""}"></i>`).join("");
    $("endflow").classList.toggle("hide", !F || complete || !done || busy());
  }
  $("stance").classList.toggle("hide", !(S.mode === "gd" && !done && !busy()));
}
$("endflow").onclick = () => { endFlow(); S.mode === "gd" ? pick(S.cat) : pick(); };
document.querySelectorAll("#stance button").forEach(b => b.onclick = () => {
  S.stance = b.dataset.s;
  document.querySelectorAll("#stance button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
});

async function nextInterviewQuestion(F) {
  const rounds = F.rounds, first = rounds[0].topic, last = rounds[rounds.length - 1].topic;
  if ($("aif").checked) {
    try {
      const j = await askCoach("followup", { topic: first.title, lang: langOf(langSel()).label, history: rounds.map(r => ({ q: r.topic.title, a: r.text.slice(0, 1200) })) });
      if (j && j.question) return { cat: first.cat, title: j.question, kw: [keywordsFrom(j.question, 4), last.kw].join(" ").trim(), follow: "", source: "AI follow-up" };
    } catch (e) { toast(e instanceof NoServer ? "AI follow-ups need the backend. Using a built-in question." : "AI follow-up unavailable. Using a built-in question."); }
  }
  // Built-in chain: each new question is followed by its own follow-up.
  if (rounds.length % 2 === 1 && last.follow) return { cat: last.cat, title: last.follow, kw: last.kw, follow: "", source: "Follow-up" };
  const used = new Set(rounds.map(r => r.topic.title));
  const pool = (topicsOf(first.cat) || TOPICS[INTERVIEW_DEFAULT]).filter(a => !used.has(a[0]));
  const a = pool[Math.floor(Math.random() * pool.length)] || TOPICS[INTERVIEW_DEFAULT][0];
  return { ...toTopic(first.cat, a), source: "New question" };
}

function builtinCounter(stance, follow) {
  const base = {
    for: "I see it differently. The downsides are bigger than you suggest, and the people who pay for them are usually the ones with the least say.",
    against: "I disagree. The benefits are bigger than you suggest, and the problems you raised can be managed with the right rules.",
    balanced: "Staying in the middle avoids the real question. If you had to choose one side today, which would it be, and why?"
  }[stance];
  return follow ? base + " Also: " + follow : base;
}

async function gdRebuttal(F) {
  const open = F.rounds[0];
  let counter = null, source = "Another participant";
  if ($("aif").checked) {
    try {
      const j = await askCoach("counter", { topic: open.topic.title, stance: F.stance, transcript: open.text.slice(0, 2000), lang: langOf(langSel()).label });
      if (j && j.counter) { counter = j.counter; source = "Another participant (AI)"; }
    } catch (e) { toast(e instanceof NoServer ? "AI counter-arguments need the backend. Using a built-in one." : "AI counter-argument unavailable. Using a built-in one."); }
  }
  if (!counter) counter = builtinCounter(F.stance, open.topic.follow);
  return { cat: open.topic.cat, title: "Respond to this point on “" + open.topic.title + "”", kw: [open.topic.kw, keywordsFrom(counter, 4)].join(" "), follow: "", counter, rebuttal: true, dur: 30, source };
}

async function nextRound() {
  const F = S.flow, b = $("nextQ");
  b.disabled = true;
  b.textContent = F.kind === "gd" ? "Preparing a counter-argument…" : "Choosing the next question…";
  const t = F.kind === "gd" ? await gdRebuttal(F) : await nextInterviewQuestion(F);
  setTopic(t, {
    label: t.source,
    hint: t.counter ? "You have 30 seconds. Acknowledge their point, then counter it with a reason or example." : isStoryQuestion(t.title) ? STAR_HINT : "Answer directly in the first sentence, then give one specific example.",
    keepFlow: true
  });
  b.textContent = F.kind === "gd" ? "Your rebuttal is ready above" : "Next question is ready above";
  $("topic").scrollIntoView({ behavior: SM(), block: "center" });
}

/* ---------- Recording ---------- */

$("go").onclick = async () => {
  if (!S.cur) pick();
  ensureFlow();
  S.target = S.cur.dur || durSel();
  $("go").classList.add("hide"); $("gohint").classList.add("hide"); $("fillwarn").classList.add("hide");
  wave.reset(); media.reset(); S.pending = null;
  prepT = -1; syncStage();
  try {
    await media.open($("cam").checked);
    if ($("cam").checked) { $("live").textContent = "Loading face model (needs internet)…"; await media.loadFace(); }
    $("live").textContent = "";
  } catch (e) {
    $("live").textContent = "Could not use mic/camera: " + e.message + ". Continuing with speech only.";
    media.close();
  }
  if (!S.cur.counter) $("hint").textContent = isStoryQuestion(S.cur.title) ? "Prep time: plan the situation, what you did, and the result." : "Prep time: plan your intro, two points, and a conclusion.";
  $("skip").classList.remove("hide");
  let p = 15;
  $("clock").textContent = "Prep " + p;
  prepT = setInterval(() => { p--; $("clock").textContent = "Prep " + p; if (p <= 0) startNow(); }, 1000);
};
function startNow() { if (!prepT) return; clearInterval(prepT); prepT = 0; $("skip").classList.add("hide"); begin(); }
$("skip").onclick = startNow;

function begin() {
  speech = { final: "", interim: "", evs: [], conf: [] }; t0 = Date.now();
  watchFillers = topFillers(store.sessions(), 3).map(f => f.word);
  media.startCapture($("rc").checked, $("cam").checked);
  $("clock").classList.add("rec"); $("stop").classList.remove("hide"); $("live").textContent = SR ? "Listening…" : "Speak now. You'll type what you said afterwards.";
  if (!S.cur.counter) $("hint").textContent = hintFor(S.cur.cat, S.cur.title);
  if (SR) {
    rec = new SR(); rec.continuous = true; rec.interimResults = true; rec.lang = langOf(langSel()).sr;
    rec.onresult = e => {
      let interim = "";
      for (let k = e.resultIndex; k < e.results.length; k++) {
        const r = e.results[k];
        if (r.isFinal) { speech.final += r[0].transcript + " "; if (r[0].confidence > 0) speech.conf.push(r[0].confidence); }
        else interim += r[0].transcript;
      }
      speech.interim = interim;
      speech.evs.push((Date.now() - t0) / 1000);
      liveUpdate();
    };
    rec.onend = () => { if (tick) try { rec.start(); } catch { /* already restarting */ } };
    rec.onerror = e => { if (e.error === "not-allowed") $("live").textContent = "Microphone blocked. Allow it in the address bar."; };
    try { rec.start(); } catch { /* ignore */ }
  }
  tick = setInterval(() => { const s = (Date.now() - t0) / 1000; $("clock").textContent = fmt(s) + " / " + fmt(S.target); if (s >= S.target) finish(); }, 250);
  syncStage();
}

// Live nudge when one filler keeps coming back, so the student can correct it mid-answer.
function liveUpdate() {
  const text = speech.final + speech.interim;
  $("live").textContent = text.slice(-200);
  const { byWord } = countFillers(tokenize(text), langOf(langSel()).fillers);
  const top = Object.entries(byWord).sort((a, b) => b[1] - a[1])[0];
  const el = $("fillwarn");
  if (top && top[1] >= 2) {
    el.textContent = `“${top[0]}” ×${top[1]}${watchFillers.includes(top[0]) ? ", your usual filler" : ""}. Try a short pause instead.`;
    el.classList.remove("hide");
  }
}

$("stop").onclick = () => finish();
async function finish() {
  if (!tick) return;
  clearInterval(tick); tick = 0;
  const dur = (Date.now() - t0) / 1000;
  $("clock").classList.remove("rec"); $("stop").classList.add("hide"); $("live").textContent = "Analysing…";
  const srDone = new Promise(res => { if (!rec) return res(); rec.onend = res; try { rec.stop(); } catch { res(); } });
  await Promise.all([media.stopCapture(), Promise.race([srDone, wait(1500)])]);
  rec = null;
  $("go").classList.remove("hide"); $("gohint").classList.remove("hide"); $("fillwarn").classList.add("hide"); $("live").textContent = "";
  syncStage();
  const text = (speech.final + speech.interim).trim();
  const mediaData = media.data, url = media.url;
  if (!SR) {
    S.pending = { dur, mediaData, url, evs: [] };
    $("manualbox").open = true;
    $("manual").focus();
    toast("Now type what you said and press Analyse.");
    return;
  }
  analyse({ text, dur, typed: false, confidence: speech.conf.length ? avg(speech.conf) : null, mediaData, evs: speech.evs, url });
}

$("an").onclick = () => {
  const text = $("manual").value.trim();
  if (!text) { toast("Type or paste your answer first."); return; }
  if (!S.cur) pick();
  ensureFlow();
  const P = S.pending; S.pending = null;
  if (!P) S.target = S.cur.dur || durSel();
  analyse({ text, dur: P ? P.dur : 0, typed: !P, mediaData: P ? P.mediaData : null, evs: [], url: P ? P.url : null });
};

$("mt").onclick = async () => {
  if (busy()) return;
  try { wave.reset(); $("live").textContent = "Speak now: the level should move."; await media.test(5000); $("live").textContent = "Mic test finished."; }
  catch (e) { $("live").textContent = "Mic problem: " + e.message; }
};

/* ---------- Analysis and report ---------- */

function analyse({ text, dur, typed, confidence = null, mediaData = null, evs = [], url = null, topic = S.cur, replace = null }) {
  const lang = replace ? replace.session.lang : langSel();
  const target = replace ? replace.target : S.target || durSel();
  const md = mediaData || {};
  const res = scoreSession({ text, dur, target, lang, typed, title: topic.title, keywords: topic.kw, story: isStoryQuestion(topic.title), rebuttal: !!topic.rebuttal,
    vol: md.vol || [], pit: md.pit || [], eye: md.eye || [], evs, confidence });
  if (res.tooShort) {
    showReport(`<p class="warn">Too little speech detected to analyse. ${typed ? "Type at least a few sentences." : "Check that the microphone level moves when you speak, then try again."}</p>`);
    return;
  }
  const flow = replace ? replace.flow : S.flow;
  const session = {
    id: replace ? replace.session.id : uid(), d: replace ? replace.session.d : localDate(), ts: Date.now(),
    cat: topic.cat, t: topic.title, mode: replace ? replace.session.mode : flow ? flow.kind : "topic", lang, typed,
    o: res.o, sc: res.sc, wpm: typed ? null : res.wpm, fills: res.fills, fb: res.fillByWord, weak: res.weak
  };
  store.saveSession(session);
  const R = { session, res, text, dur, typed, target, topic, prev: store.lastAttempt(topic.title, session.id), media: mediaData, evs, url,
    mime: replace ? replace.mime : media.mime, ai: null, aiError: null, flow };
  if (replace && flow) { const i = flow.rounds.indexOf(replace); if (i >= 0) flow.rounds[i] = R; }
  else if (flow) flow.rounds.push(R);
  renderReport(R);
  refreshProgress(); syncStage();
}

function showReport(html, scroll = true) {
  $("rep").innerHTML = html;
  $("rep").classList.remove("hide");
  if (scroll) $("rep").scrollIntoView({ behavior: SM() });
}

function metricRows(res) {
  return Object.keys(res.sc).map(k => {
    const v = res.sc[k], s = level(v);
    const tag = k === "relevance" && res.aiRelevance ? "AI-checked" : MEASURED.has(k) ? "measured" : "estimated";
    return `<details class="metric ${s}"><summary><span>${LABEL[k]}${k === "structure" && res.star ? " (STAR)" : ""}<span class="tag">${tag}</span></span><span class="mv">${ICON[s]}<b>${v.toFixed(1)}</b><span class="vh"> out of 10, ${LEVEL_TEXT[s]}</span></span><span class="bar" aria-hidden="true"><i style="width:${Math.round(v * 10)}%"></i></span></summary><p class="sub">${esc(res.why[k])}</p></details>`;
  }).join("");
}

function starHTML(star) {
  const parts = [["s", "Situation"], ["t", "Task"], ["a", "Action"], ["r", "Result"]];
  return `<div class="callout"><h3>STAR check</h3><div class="star">${parts.map(([k, n]) => `<div class="${star[k] ? "y" : "n"}"><b aria-hidden="true">${n[0]}</b><span>${n}</span><small>${star[k] ? "Found" : "Missing"}</small></div>`).join("")}</div><p class="sub">${esc(star.tip)}</p></div>`;
}

function compareHTML(prev, now) {
  const c = compareSessions(prev, now);
  if (!c.rows.length) return "";
  const change = d => d > 0 ? `<span class="up"><span aria-hidden="true">▲</span> ${d.toFixed(1)}<span class="vh"> up</span></span>` : d < 0 ? `<span class="down"><span aria-hidden="true">▼</span> ${Math.abs(d).toFixed(1)}<span class="vh"> down</span></span>` : `<span class="sub">same</span>`;
  const head = c.overall > 0 ? `Up ${c.overall} overall` : c.overall < 0 ? `Down ${Math.abs(c.overall)} overall` : "Same overall score";
  return `<div class="callout"><h3>Compared with your last try</h3><p class="sub">${head}: ${prev.o.toFixed(1)} on ${esc(prev.d)}, ${now.o.toFixed(1)} now.</p><div class="scroll-x"><table><tr><th>Skill</th><th class="num">Before</th><th class="num">Now</th><th class="num">Change</th></tr>${c.rows.map(r => `<tr><td>${LABEL[r.k]}</td><td class="num">${r.before.toFixed(1)}</td><td class="num">${r.now.toFixed(1)}</td><td class="num">${change(r.delta)}</td></tr>`).join("")}</table></div></div>`;
}

function mediaHTML(R) {
  let h = "";
  if (R.url) {
    const ext = /mp4/.test(R.mime || "") ? "mp4" : "webm";
    h += `<h3>Playback</h3><video id="pl" controls src="${R.url}"></video><p><a class="btn" href="${R.url}" download="speakwise-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.${ext}">Download recording (.${ext})</a></p>`;
    if (R.res.pauseTimes.length) h += `<p class="sub row">Long pauses at: ${R.res.pauseTimes.map(t => `<button class="mini" data-t="${t}" aria-label="Jump to ${t.toFixed(0)} seconds">${t.toFixed(0)} s</button>`).join(" ")}</p>`;
  }
  const e = (R.media && R.media.eye) || [];
  if (e.length > 8) {
    const n = 20, sz = Math.ceil(e.length / n), k = { on: 0, off: 0, none: 0 };
    let bars = "";
    for (let i = 0; i < n; i++) {
      const s = e.slice(i * sz, (i + 1) * sz).filter(x => x != null), v = s.length ? avg(s) : null, c = v == null ? "none" : v > .6 ? "on" : "off";
      k[c]++; bars += `<i class="${c}" title="${v == null ? "no face" : Math.round(v * 100) + "% eye contact"}"></i>`;
    }
    h += `<h3>Camera insights</h3><div class="eyes" role="img" aria-label="Eye contact timeline: ${k.on} of ${n} moments looking at the camera, ${k.off} looking away, ${k.none} with no face visible">${bars}</div><p class="foot">Tall green = looking at the camera, short orange = looking away, flat grey = face not visible. Smiling ${Math.round(avg(R.media.smile) * 100)}% of the time; brow tension ${Math.round(avg(R.media.brow) * 100)}%. Look at the camera lens, not the screen.</p>`;
  }
  return h;
}

function aiOutput(R) {
  if (R.aiError) return `<p class="warn">${R.aiError}</p>`;
  const j = R.ai;
  if (!j) return "";
  const iss = Array.isArray(j.issues) ? j.issues : [], out = Array.isArray(j.outline) ? j.outline : [];
  return `<p><span class="tag flat">${REL_TAG[j.relevance] || "Checked"}</span> ${esc(j.relevance_note)}</p>`
    + (iss.length ? `<h3>What to fix</h3><ul>${iss.map(x => `<li>“${esc(x.quote)}” <span class="tag">${esc(x.problem)}</span> ${esc(x.fix)}</li>`).join("")}</ul>` : "")
    + `<h3>Your answer, rephrased</h3><blockquote class="quote">${esc(j.rephrased)}</blockquote><p class="row"><button id="cp">Copy</button><button id="ls">Listen</button></p>`
    + (out.length ? `<h3>Simple structure to follow</h3><ol>${out.map(x => `<li>${esc(x)}</li>`).join("")}</ol>` : "")
    + (j.caution ? `<p class="warn">${esc(j.caution)}</p>` : "")
    + `<p class="foot">AI suggestions can be wrong. Keep your own real examples and check any facts.</p>`;
}

function flowSummaryHTML(F) {
  const os = F.rounds.map(r => r.session.o), skills = skillAverages(F.rounds.map(r => r.session), F.total);
  const ks = Object.keys(skills).sort((a, b) => skills[a] - skills[b]);
  const name = F.kind === "gd" ? "Group discussion" : "Mock interview";
  return `<div class="callout summary"><h3>${name} complete</h3><p class="figure">${avg(os).toFixed(1)}</p><p class="sub">Average out of 10 across ${os.length} answers${F.kind === "gd" ? ", arguing " + stanceText(F.stance) : ""}.</p>
   <div class="scroll-x"><table class="stack"><tr><th>Round</th><th>Question</th><th class="num">Score</th><th>Fix first</th></tr>${F.rounds.map((r, i) => `<tr><td data-label="Round">${F.kind === "gd" ? (i ? "Rebuttal" : "Opening") : "Q" + (i + 1)}</td><td class="clip whole" title="${esc(r.topic.title)}">${esc(r.topic.title)}</td><td class="num" data-label="Score">${r.session.o}</td><td data-label="Fix first">${LABEL[r.session.weak]}</td></tr>`).join("")}</table></div>
   ${ks.length ? `<p class="sub">Across the ${F.kind === "gd" ? "discussion" : "interview"}, your strongest skill was <b>${LABEL[ks[ks.length - 1]]}</b> and the one to work on is <b>${LABEL[ks[0]]}</b>.</p>` : ""}</div>`;
}

function renderReport(R, { scrollTo = null } = {}) {
  const { res, session: s, topic: t } = R, F = R.flow, lang = langOf(s.lang);
  const idx = F ? F.rounds.indexOf(R) : -1, complete = F && F.rounds.length >= F.total && idx === F.rounds.length - 1;
  const isLatest = !F || idx === F.rounds.length - 1;
  const C = 2 * Math.PI * 52;
  const tx = fillerSegments(R.text, lang.fillers).map(g => g.filler ? `<span class="f">${esc(g.text)}</span>` : esc(g.text)).join("");
  let actions;
  if (F && !complete && isLatest) actions = `<button class="p" id="nextQ">${F.kind === "gd" ? "Hear the counter-argument" : "Next question"}</button>`;
  else if (complete) actions = `<button class="p" id="again">Start another ${F.kind === "gd" ? "discussion" : "interview"}</button>`;
  else actions = `<button class="p" id="nextT">Next topic</button><button id="retry">Try this topic again</button>`;
  actions += `<button id="pdf">Save as PDF</button>`;

  const html = `${complete ? flowSummaryHTML(F) : ""}
   <h2>Feedback</h2><p class="sub qline">${F ? esc(MODE_NAME[F.kind] + ", " + roundLabel(F, idx).toLowerCase()) + ": " : ""}${esc(t.title)}</p>
   ${res.lowConf ? `<p class="warn">Transcription confidence is low (${Math.round(res.confidence * 100)}%). Some scores may be unfair. Fix the transcript below and press Re-analyse.</p>` : ""}
   <div class="sum"><svg class="ring" viewBox="0 0 120 120" role="img" aria-label="Overall score ${res.o} out of 10"><circle cx="60" cy="60" r="52" class="rt"/><circle cx="60" cy="60" r="52" class="rv" stroke-dasharray="${(res.o / 10 * C).toFixed(1)} ${C.toFixed(1)}"/><text x="60" y="64" text-anchor="middle" class="rn">${res.o.toFixed(1)}</text><text x="60" y="84" text-anchor="middle" class="rd">of 10</text></svg>
    <div><p class="lead">Strongest: <b>${LABEL[res.top]}</b><br>Fix first: <b>${LABEL[res.weak]}</b></p><p class="sub">${esc(res.tip)}</p></div></div>
   <div class="metrics">${metricRows(res)}</div>
   <p class="foot">Select a score to see why. Check = good (7+), dash = fair (4 to 7), triangle = needs work.${res.notScored.length ? " Not scored: " + res.notScored.map(n => LABEL[n.k] + " (" + esc(n.reason) + ")").join(", ") + "." : ""}</p>
   ${res.star ? starHTML(res.star) : ""}
   ${R.prev ? compareHTML(R.prev, s) : ""}
   ${res.load != null ? `<div class="callout"><h3>Nervousness estimate: ${res.load}%</h3><p class="sub">${res.load > 60 ? "Tense or hard topic. Try slow breathing: in 4 s, hold 4 s, out 6 s, three times." : "Comfortable. Try a harder category next."}</p></div>` : ""}
   ${mediaHTML(R)}
   <h3>Your transcript</h3><p id="tx">${tx}</p><p class="foot"><span class="f">Highlighted</span> words are fillers.</p>
   <details><summary>Correct a misheard word, then re-analyse</summary><textarea id="fix" aria-label="Transcript">${esc(R.draft ?? R.text)}</textarea><button id="re">Re-analyse</button></details>
   ${!F && t.follow ? `<div class="callout"><h3>Interviewer follow-up</h3><p>${esc(t.follow)}</p><p class="foot">Answer it aloud for 30 s, or try a full Mock interview.</p></div>` : ""}
   <div class="callout" id="aic"><h3>AI coach <span class="tag">uses AI</span></h3><p class="sub">Checks whether your answer was relevant and accurate, then rewrites it in better words. Its relevance verdict replaces the keyword estimate. Pressing the button sends your transcript text (not audio or video) to Google's Gemini API.</p><p><button class="p" id="aib">${R.ai ? "Rephrase again" : "Rephrase my answer"}</button></p><div id="aio">${aiOutput(R)}</div></div>
   <div class="row actions">${actions}</div>`;
  showReport(html, !scrollTo);

  $("re").onclick = () => analyse({ text: $("fix").value, dur: R.dur, typed: R.typed, mediaData: R.media, evs: R.evs, url: R.url, topic: R.topic, replace: R });
  $("aib").onclick = () => runCoach(R);
  $("pdf").onclick = () => print();
  if ($("nextQ")) $("nextQ").onclick = nextRound;
  if ($("again")) $("again").onclick = () => { S.flow = null; S.mode === "gd" ? pick(GD_CATEGORIES[Math.floor(Math.random() * GD_CATEGORIES.length)]) : pick(INTERVIEW_DEFAULT); $("topic").scrollIntoView({ behavior: SM(), block: "center" }); };
  if ($("nextT")) $("nextT").onclick = () => { pick(topicsOf(t.cat) ? t.cat : S.cat); $("topic").scrollIntoView({ behavior: SM(), block: "center" }); };
  if ($("retry")) $("retry").onclick = () => { setTopic(t, { label: "Try again: " + t.cat, hint: "Same topic. Your next report will compare both attempts." }); $("topic").scrollIntoView({ behavior: SM(), block: "center" }); };
  if ($("cp")) $("cp").onclick = () => { navigator.clipboard.writeText(R.ai.rephrased); toast("Copied."); };
  if ($("ls")) $("ls").onclick = () => { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(R.ai.rephrased); u.lang = lang.sr; speechSynthesis.speak(u); };
  $("rep").querySelectorAll("[data-t]").forEach(b => b.onclick = () => { const v = $("pl"); v.currentTime = +b.dataset.t; v.play(); });
  if (scrollTo) $(scrollTo).scrollIntoView({ behavior: SM(), block: "start" });
}

async function runCoach(R) {
  const b = $("aib"), o = $("aio");
  b.disabled = true;
  o.innerHTML = '<p class="sub" role="status">Checking relevance and rewriting your answer…</p><div class="sk"></div><div class="sk w2"></div><div class="sk w3"></div>';
  R.draft = $("fix").value;
  try {
    R.ai = await askCoach("rephrase", { topic: R.topic.title, transcript: R.draft, lang: langOf(R.session.lang).label });
    R.aiError = null;
    applyAiRelevance(R);
  } catch (e) {
    R.aiError = e instanceof NoServer ? NOSERVER_HTML : esc(e.message);
  }
  renderReport(R, { scrollTo: "aic" });
}

// The AI's on/off-topic verdict is a better relevance measure than keyword hits, so it replaces them when available.
function applyAiRelevance(R) {
  const v = { on_topic: 9, partly: 6, off_topic: 2 }[R.ai.relevance];
  if (v == null) return;
  const res = R.res;
  res.sc.relevance = v;
  res.why.relevance = "AI check: " + REL_TAG[R.ai.relevance] + ". " + (R.ai.relevance_note || "");
  res.aiRelevance = true;
  res.notScored = res.notScored.filter(n => n.k !== "relevance");
  Object.assign(res, summarizeScores(res.sc, { wpm: res.wpm }));
  Object.assign(R.session, { o: res.o, sc: res.sc, weak: res.weak });
  store.saveSession(R.session);
  refreshProgress();
}

/* ---------- Progress ---------- */

function refreshProgress() { progress(); skills(); fillersCard(); history(); homeStats(); }

function progress() {
  const s = store.sessions();
  const st = streakDays(s.map(x => x.d));
  $("streakn").textContent = st.days + "-day streak";
  $("streak").title = st.doneToday ? "You've practised today." : "Practise today to keep your streak.";
  $("streak").classList.toggle("hide", !st.days);
  if (!s.length) { $("prog").textContent = "Complete a session to see your learner profile."; return; }
  const last = s.slice(-15), py = v => 8 + (10 - v) * 10.4, px = i => 22 + i * (570 / Math.max(last.length - 1, 1));
  const cnt = {}; s.forEach(x => cnt[x.weak] = (cnt[x.weak] || 0) + 1);
  const rw = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0][0];
  const c = {}; s.forEach(x => (c[x.cat] = c[x.cat] || []).push(x.o));
  $("prog").innerHTML = `<svg class="chart" viewBox="0 0 600 124" role="img" aria-label="Overall score for the last ${last.length} sessions, from ${last[0].o} to ${last[last.length - 1].o} out of 10">${[0, 5, 10].map(v => `<line x1="22" x2="596" y1="${py(v)}" y2="${py(v)}" class="gl"/><text x="4" y="${py(v) + 3}" class="gt">${v}</text>`).join("")}<polyline class="pl" points="${last.map((x, i) => px(i).toFixed(1) + "," + py(x.o).toFixed(1)).join(" ")}"/>${last.map((x, i) => `<circle class="pd" r="3.2" cx="${px(i).toFixed(1)}" cy="${py(x.o).toFixed(1)}"/>`).join("")}</svg>
   <p>${s.length} session${s.length > 1 ? "s" : ""}. Recurring weak spot: <b>${LABEL[rw] || esc(rw)}</b>. It will keep getting targeted tips.</p>
   <ul class="avgs">${Object.entries(c).map(([k, v]) => `<li><span>${esc(k)}</span><b>${avg(v).toFixed(1)}</b></li>`).join("")}</ul>`;
}

function skills() {
  const a = skillAverages(store.sessions(), 10), ks = Object.keys(a);
  $("skills").innerHTML = ks.length ? ks.map(k => `<div class="skill ${level(a[k])}"><span>${LABEL[k]}</span><span class="track" aria-hidden="true"><i style="width:${a[k] * 10}%"></i></span><b>${a[k].toFixed(1)}</b></div>`).join("") : "No sessions yet.";
}

function fillersCard() {
  const f = topFillers(store.sessions(), 6);
  $("myfills").innerHTML = f.length ? `<ul class="avgs">${f.map(x => `<li><span><span class="f">${esc(x.word)}</span></span><span>${x.count}× in ${x.sessions} session${x.sessions > 1 ? "s" : ""}</span></li>`).join("")}</ul>` : "No fillers recorded yet. Nice.";
}

function history() {
  const all = store.sessions(), s = all.slice().reverse().slice(0, 20);
  $("hist").innerHTML = s.length ? `<div class="scroll-x"><table class="stack"><tr><th>Date</th><th>Topic</th><th>Mode</th><th class="num">Score</th><th class="num">WPM</th><th class="num">Fillers</th><th>Fix first</th></tr>${s.map(x => `<tr><td data-label="Date">${esc(x.d)}</td><td class="clip whole" title="${esc(x.t || x.cat)}">${esc(x.t || x.cat)}</td><td data-label="Mode">${MODE_NAME[x.mode || "topic"]}</td><td class="num" data-label="Score">${x.o}</td><td class="num" data-label="WPM">${x.wpm ?? "n/a"}</td><td class="num" data-label="Fillers">${x.fills}</td><td data-label="Fix first">${LABEL[x.weak] || esc(x.weak)}</td></tr>`).join("")}</table></div><p><button id="csv">Export CSV</button></p>` : "No sessions yet. Practise once and it appears here.";
  if (s.length) $("csv").onclick = () => {
    const q = v => /[",\n]/.test(String(v ?? "")) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v ?? "");
    const rows = [["date", "category", "topic", "mode", "language", "overall", "wpm", "fillers", "weakest"], ...all.map(x => [x.d, x.cat, x.t, x.mode || "topic", x.lang || "en-IN", x.o, x.wpm, x.fills, x.weak])];
    download(rows.map(r => r.map(q).join(",")).join("\n"), "speakwise-sessions.csv", "text/csv");
  };
}

/* ---------- Placement cell sharing and reminders ---------- */

const prof = store.profile();
[["pname", "name"], ["proll", "roll"], ["pcol", "college"]].forEach(([id, k]) => {
  $(id).value = prof[k] || "";
  $(id).oninput = () => store.setProfile({ ...store.profile(), [k]: $(id).value.trim() });
});
$("share").onclick = () => {
  const s = store.sessions();
  if (!s.length) { toast("Practise at least once first."); return; }
  const p = store.profile();
  if (!p.name) { toast("Add your name so your placement cell knows whose file it is."); $("pname").focus(); return; }
  const file = {
    app: "SpeakWise", kind: "progress-share", version: 1, exported: new Date().toISOString(),
    student: { name: p.name || "", roll: p.roll || "", college: p.college || "" },
    summary: summarize(s),
    sessions: s.map(x => ({ d: x.d, cat: x.cat, mode: x.mode || "topic", o: x.o, sc: x.sc, wpm: x.wpm, fills: x.fills, weak: x.weak }))
  };
  download(JSON.stringify(file, null, 1), `speakwise-${(p.roll || p.name).replace(/[^\w-]+/g, "-").toLowerCase()}.json`, "application/json");
  toast("Progress file downloaded. Send it to your placement cell.");
};

$("remind").onclick = () => {
  const [h, m] = ($("rtime").value || "19:00").split(":").map(Number), d = new Date();
  if (d.getHours() * 60 + d.getMinutes() >= h * 60 + m) d.setDate(d.getDate() + 1);
  const pad = n => String(n).padStart(2, "0"), url = location.origin + location.pathname;
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//SpeakWise//Daily practice//EN", "BEGIN:VEVENT", "UID:" + uid() + "@speakwise",
    "DTSTAMP:" + new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z", `DTSTART:${localDate(d).replace(/-/g, "")}T${pad(h)}${pad(m)}00`, "DURATION:PT10M", "RRULE:FREQ=DAILY",
    "SUMMARY:SpeakWise daily challenge", "DESCRIPTION:Speak for one minute on today's challenge at " + url + "?daily=1", "URL:" + url + "?daily=1",
    "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Time for your SpeakWise daily challenge", "TRIGGER:PT0M", "END:VALARM", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  download(ics, "speakwise-daily-reminder.ics", "text/calendar");
  toast("Open the downloaded file to add the reminder to your calendar.");
};

/* ---------- Navigation and home ---------- */

function view(v) {
  document.querySelectorAll(".view").forEach(e => e.classList.toggle("hide", e.id !== "v-" + v));
  document.querySelectorAll("#nav button").forEach(b => { const on = b.dataset.v === v; b.classList.toggle("on", on); on ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current"); });
  document.body.dataset.view = v;
  if (v === "practice") requestAnimationFrame(wave.size);
  scrollTo({ top: 0, behavior: SM() });
}
document.querySelectorAll("#nav button").forEach(b => b.onclick = () => view(b.dataset.v));
$("cta").onclick = () => view("practice");
$("cta2").onclick = () => { const k = Object.keys(allCats()); view("practice"); pick(k[Math.floor(Math.random() * k.length)]); };
document.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => { view("practice"); setMode(b.dataset.mode); });

function card(name, sub, onclick) {
  const b = document.createElement("button");
  b.className = "cat"; b.innerHTML = esc(name) + "<small>" + esc(sub) + "</small>"; b.onclick = onclick;
  return b;
}
function renderHomeGrids() {
  const go = c => () => { view("practice"); pick(c); };
  $("chips").replaceChildren(...Object.keys(allCats()).map(c => card(c, allCats()[c].length + " topics", go(c))),
    card("Live topic", "Fresh from Wikipedia", () => { view("practice"); live(); }));
  $("packs").replaceChildren(...Object.keys(PACKS).map(c => card(c, PACKS[c].topics.length + " questions, with round tips", go(c))));
}

function homeStats() {
  const s = store.sessions();
  if (!s.length) { $("homestats").innerHTML = '<div><h2>New here?</h2><p class="sub">Press Start practising, pick a topic and speak for one minute. Your first report appears right after.</p></div>'; return; }
  const best = Math.max(...s.map(x => x.o)), last = s[s.length - 1], cnt = {};
  s.forEach(x => cnt[x.weak] = (cnt[x.weak] || 0) + 1);
  const rw = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0][0], wc = weakestCat(), st = streakDays(s.map(x => x.d));
  $("homestats").innerHTML = `<div><h2>Work on ${LABEL[rw] || esc(rw)}</h2>${st.days && !st.doneToday ? `<p class="sub">Practise today to keep your ${st.days}-day streak.</p>` : ""}</div>
   <dl class="figs"><div><dt>Sessions</dt><dd>${s.length}</dd></div><div><dt>Last score</dt><dd>${last.o}</dd></div><div><dt>Best</dt><dd>${best}</dd></div></dl>
   <div class="row">${wc ? `<button type="button" class="p" id="nextB">Practise ${esc(wc.cat)}</button>` : ""}<button type="button" id="dailyB">Daily challenge</button></div>`;
  if (wc) $("nextB").onclick = () => { view("practice"); pick(wc.cat); };
  $("dailyB").onclick = () => { view("practice"); daily(); };
}

/* ---------- Privacy, settings and install ---------- */

$("privacy").onclick = () => {
  if ($("gemini_key_input")) $("gemini_key_input").value = getApiKey();
  $("dlg").showModal();
};
if ($("gemini_key_save")) $("gemini_key_save").onclick = () => {
  setApiKey($("gemini_key_input").value);
  toast("Gemini API key saved.");
};
$("cl").onclick = () => $("dlg").close();
$("wipe").onclick = () => {
  if (!confirm("Delete all sessions, saved topics, resume questions, topic history and your placement-cell details from this browser? This can't be undone.")) return;
  store.wipe(); location.reload();
};

function updateLangNote() {
  const L = langOf(langSel());
  $("langnote").textContent = L.english ? "" : `In ${L.label}, pace, fillers, pauses, vocabulary, voice and eye contact are scored. Relevance needs the AI coach, and structure isn't checked yet.`;
  $("langnote").classList.toggle("hide", L.english);
}
const prefs = store.settings();
if (prefs.lang && LANGS[prefs.lang]) $("lang").value = prefs.lang;
if (prefs.dur && $("d" + prefs.dur)) $("d" + prefs.dur).checked = true;
["rc", "cam", "aif"].forEach(id => { if (typeof prefs[id] === "boolean") $(id).checked = prefs[id]; $(id).onchange = () => store.saveSettings({ [id]: $(id).checked }); });
$("lang").onchange = () => { store.saveSettings({ lang: langSel() }); updateLangNote(); };
document.querySelectorAll("input[name=dur]").forEach(r => r.onchange = () => store.saveSettings({ dur: +r.value }));
updateLangNote();

let installEvt = null;
addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvt = e; $("install").classList.remove("hide"); });
$("install").onclick = async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; $("install").classList.add("hide"); };
addEventListener("appinstalled", () => $("install").classList.add("hide"));
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});

/* ---------- Start ---------- */

// Decorative home waveform: bar heights follow a speech-like envelope; it settles once, in under half a second.
for (let i = 0; i < 48; i++) {
  const x = i / 47, env = Math.sin(Math.PI * x) ** .6 * (.55 + .45 * Math.sin(i * 1.7) ** 2), bar = document.createElement("i");
  bar.style.setProperty("--h", Math.round(10 + env * 88) + "%");
  bar.style.setProperty("--d", i * 8 + "ms");
  $("herowave").append(bar);
}

if (!SR) $("nosr").classList.remove("hide");
renderCats(); pick(); setMode("topic"); refreshProgress();
fetch("topics.json").then(r => r.ok ? r.json() : {}).then(j => { extra = j || {}; renderCats(); }).catch(() => {});

const params = new URLSearchParams(location.search);
if (params.get("mode") && ROUNDS[params.get("mode")]) { view("practice"); setMode(params.get("mode")); }
else if (params.has("daily")) { view("practice"); daily(); }
else if (params.get("view") === "progress") view("progress");
