// Scoring for SpeakWise. Pure functions with no DOM access, so the same code runs in the browser and under `node --test`.

export const LABEL = { pace: "Pace", fillers: "Fillers", fluency: "Fluency", vocab: "Vocabulary", structure: "Structure", relevance: "Relevance", time: "Time use", voice: "Voice variety", eye: "Eye contact", rebuttal: "Rebuttal" };
export const MEASURED = new Set(["pace", "fillers", "fluency", "time", "voice", "eye"]);

const EN_FILLERS = ["um", "umm", "uh", "uhh", "erm", "hmm", "like", "basically", "actually", "literally", "you know", "i mean", "sort of", "kind of", "so yeah"];

// `english: false` means the topic keywords and structure cues (which are English) can't be checked, so those scores are skipped.
// Filler lists outside English are short on purpose: only words that are almost always used as fillers.
export const LANGS = {
  "en-IN": { label: "English", sr: "en-IN", english: true, fillers: EN_FILLERS },
  "hinglish": { label: "Hinglish", sr: "en-IN", english: true, fillers: [...EN_FILLERS, "matlab", "yaani", "yani", "haina", "hai na", "kya bolte hain", "kya kehte hain"] },
  "hi-IN": { label: "Hindi", sr: "hi-IN", english: false, fillers: ["मतलब", "यानी", "है ना", "क्या बोलते हैं", "क्या कहते हैं", "बेसिकली", "एक्चुअली"] },
  "mr-IN": { label: "Marathi", sr: "mr-IN", english: false, fillers: ["म्हणजे", "बेसिकली", "एक्चुअली"] },
  "ta-IN": { label: "Tamil", sr: "ta-IN", english: false, fillers: ["அதாவது"] },
  "te-IN": { label: "Telugu", sr: "te-IN", english: false, fillers: ["అంటే"] },
  "bn-IN": { label: "Bengali", sr: "bn-IN", english: false, fillers: ["মানে", "আসলে"] }
};

export const STOP = new Set("the a an and or but of to in on for with is are was were be been it its this that i you we they he she my our your their as at by from so very can will would could should have has had not do does did me us them there here then than just also about into".split(" "));
const GENERIC = new Set("tell describe explain what which your would about time think words simple example someone something give share make does when where why how".split(" "));
const XS = new Set("which their these those other about where there first called known after between used using being while also into over such more most many some than then when what".split(" "));

export const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const r1 = x => Math.round(x * 10) / 10;
const c10 = x => Math.max(0, Math.min(10, x));
const yn = b => b ? "yes" : "no";

// Letters and combining marks from any script, so Devanagari, Tamil, Bengali etc. tokenise correctly.
const WORD = /[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}]+)*/gu;
const norm = w => w.toLowerCase().replace(/’/g, "'");
export const tokenize = text => Array.from(String(text ?? "").matchAll(WORD), m => norm(m[0]));

function positions(tokens, phrase) {
  const p = phrase.split(" "), out = [];
  for (let i = 0; i + p.length <= tokens.length; i++) if (p.every((w, k) => tokens[i + k] === w)) out.push(i);
  return out;
}
const allAt = (tokens, list) => list.flatMap(p => positions(tokens, p));
const firstAt = (tokens, list) => { const a = allAt(tokens, list); return a.length ? Math.min(...a) : -1; };
const lastAt = (tokens, list) => { const a = allAt(tokens, list); return a.length ? Math.max(...a) : -1; };

// Keyword matching by stem ("learn" matches "learning"); very short keywords like "ai" or "upi" must match exactly.
const matcher = k => k.length <= 3 ? w => w === k : (s => w => w.startsWith(s))(k.slice(0, Math.max(4, k.length - 2)));

/* ---------- Fillers ---------- */

// "like" and "kind of" are often real words ("I like coding", "what kind of role"), so they only count as fillers in filler position.
const LIKE_OK_BEFORE = new Set(["i", "you", "we", "they", "would", "i'd", "we'd", "to", "don't", "dont", "didn't", "didnt", "really", "also", "not", "people", "feel", "feels", "felt", "look", "looks", "looked", "seem", "seems", "sounds", "sound", "something", "anything", "nothing", "more", "much", "just", "exactly"]);
const KIND_OK_BEFORE = new Set(["what", "this", "that", "any", "some", "the", "a", "which", "every", "same", "one", "these", "those", "all", "different", "right", "wrong", "new"]);

export function findFillers(tokens, fillers) {
  const list = fillers.map(f => f.split(" ")).sort((a, b) => b.length - a.length), out = [];
  for (let i = 0; i < tokens.length;) {
    const m = list.find(f => f.every((w, k) => tokens[i + k] === w));
    if (m) {
      const w = m.join(" "), prev = tokens[i - 1] || "";
      let real = false;
      if (w === "like") real = LIKE_OK_BEFORE.has(prev) || (prev.length > 3 && prev.endsWith("s") && prev !== "this" && prev !== "thus");
      if (w === "kind of" || w === "sort of") real = KIND_OK_BEFORE.has(prev);
      if (!real) { out.push({ start: i, len: m.length, word: w }); i += m.length; continue; }
    }
    i++;
  }
  return out;
}

export function countFillers(tokens, fillers) {
  const byWord = {};
  const hits = findFillers(tokens, fillers);
  hits.forEach(h => byWord[h.word] = (byWord[h.word] || 0) + 1);
  return { total: hits.length, byWord };
}

// Splits text into plain and filler segments for highlighting, keeping the original spelling and spacing.
export function fillerSegments(text, fillers) {
  text = String(text ?? "");
  const ms = Array.from(text.matchAll(WORD)), hits = findFillers(ms.map(m => norm(m[0])), fillers), segs = [];
  let pos = 0;
  for (const h of hits) {
    const a = ms[h.start].index, last = ms[h.start + h.len - 1], b = last.index + last[0].length;
    if (a > pos) segs.push({ text: text.slice(pos, a), filler: false });
    segs.push({ text: text.slice(a, b), filler: true });
    pos = b;
  }
  if (pos < text.length) segs.push({ text: text.slice(pos), filler: false });
  return segs;
}

/* ---------- Vocabulary ---------- */

// Moving-average type-token ratio: unlike plain TTR it doesn't drop just because an answer is longer.
export function mattr(words, win = 40) {
  if (!words.length) return 0;
  if (words.length <= win) return new Set(words).size / words.length;
  let sum = 0, n = 0;
  for (let i = 0; i + win <= words.length; i++) { sum += new Set(words.slice(i, i + win)).size / win; n++; }
  return sum / n;
}

/* ---------- Structure ---------- */

const OPEN = ["today i", "let me begin", "to begin", "to start", "firstly", "first of all", "i would like to", "i'd like to", "my name", "in my opinion", "i believe", "i think", "i feel", "according to me", "the topic", "i will talk", "i'm going to talk", "i am going to talk", "let me start"];
const POINTS = {
  sequence: ["firstly", "first", "secondly", "second", "thirdly", "third", "another", "next", "lastly", "moreover", "additionally", "also", "apart from"],
  example: ["for example", "for instance", "such as", "take the case", "in my case", "i remember", "once"],
  reason: ["because", "since", "due to", "which means", "so that", "the reason"],
  contrast: ["however", "on the other hand", "but", "although", "whereas", "even though"]
};
const CLOSE = ["in conclusion", "to conclude", "to sum up", "to summarise", "to summarize", "in short", "overall", "finally", "that's why", "that is why", "thank you", "to wrap up", "in the end"];

export function structureCheck(tokens, kwTokens = []) {
  const n = tokens.length, head = Math.max(20, Math.round(n * .15)), tail = n - Math.max(20, Math.round(n * .2));
  const opens = allAt(tokens, OPEN), closes = allAt(tokens, CLOSE);
  const intro = opens.some(i => i < head) || kwTokens.some(k => tokens.slice(0, 15).some(matcher(k)));
  const found = Object.fromEntries(Object.entries(POINTS).map(([k, l]) => [k, allAt(tokens, l)]));
  const kinds = Object.values(found).filter(a => a.length).length;
  const example = found.example.length > 0, reason = found.reason.length > 0;
  const body = (example ? 2 : 0) + (reason ? 1 : 0) + (kinds >= 2 ? 1 : 0);
  const end = closes.some(i => i >= tail), early = !end && closes.length > 0;
  const cues = opens.length + closes.length + Object.values(found).reduce((s, a) => s + a.length, 0);
  const stuffed = n >= 20 && cues > Math.max(6, n / 8);
  const score = c10((intro ? 3 : 0) + body + (end ? 3 : 0) - (stuffed ? 2 : 0));
  let why = `Opening: ${yn(intro)}, example: ${yn(example)}, reasoning: ${yn(reason)}, conclusion at the end: ${yn(end)}.`;
  if (early) why += " Your closing phrase came before the end, so it doesn't count as a conclusion.";
  if (stuffed) why += " Lots of linking phrases with little content between them.";
  return { intro, example, reason, end, early, stuffed, score, why };
}

/* ---------- STAR (Situation, Task, Action, Result) for story questions ---------- */

const STAR_CUES = {
  s: ["when i was", "when we were", "during my", "during our", "in my first year", "in my second year", "in my third year", "in my final year", "last year", "last semester", "last summer", "at my internship", "in my internship", "in college", "in our college", "in my previous", "there was a time", "back in", "while working on", "while i was", "a few months ago", "in my project", "in our project"],
  t: ["my role", "i was responsible", "my responsibility", "i had to", "we had to", "the goal was", "our goal", "my goal", "the task", "my task", "the challenge was", "i needed to", "we needed to", "the problem was", "my job was", "i was asked to", "the target was", "my target", "our target", "we were supposed to", "our aim", "my aim", "i wanted to", "we wanted to"],
  a: ["i decided", "i started", "i created", "i built", "i organised", "i organized", "i spoke", "i talked", "i proposed", "i suggested", "i divided", "i set up", "i reached out", "i took", "i made", "i planned", "i led", "i asked", "i convinced", "i wrote", "i designed", "i fixed", "i tested", "so i", "then i"],
  r: ["as a result", "in the end", "eventually", "we won", "we achieved", "which led to", "resulted in", "we managed", "we completed", "we delivered", "the result", "the outcome", "improved", "increased", "reduced", "saved", "got selected", "we finished", "on time", "i learned", "i learnt", "percent"]
};
const STAR_TIPS = {
  s: "Start with the situation: when and where it happened, in one sentence.",
  t: "Say what you had to achieve or what your role was.",
  a: "Spend most of the answer on what you did, using “I” rather than “we”.",
  r: "End with the result, ideally a number or a clear outcome, and what you learned."
};
const STORY = /\b(a time|time when|time you|describe a|tell me about a|an example|share an example|biggest achievement|failure|conflict|led a team|final-year project|experience|walk me through|hardest problem|something you built)\b/i;
export const isStoryQuestion = title => STORY.test(String(title || ""));

export function starCheck(tokens) {
  // "I fixed", "we launched": a subject followed by a past-tense verb is an action even without a listed cue.
  const verbs = [];
  tokens.forEach((w, i) => { if ((w === "i" || w === "we") && /^[\p{L}]{3,}ed$/u.test(tokens[i + 1] || "")) verbs.push(i); });
  const s = firstAt(tokens, STAR_CUES.s), t = firstAt(tokens, STAR_CUES.t);
  const aCue = firstAt(tokens, STAR_CUES.a), a = [aCue, ...verbs].filter(x => x >= 0).sort((x, y) => x - y)[0] ?? -1;
  const numberAfterAction = a >= 0 ? tokens.findIndex((w, i) => i > a && /^\d/.test(w)) : -1;
  const r = Math.max(lastAt(tokens, STAR_CUES.r), numberAfterAction);
  const has = { s: s >= 0, t: t >= 0, a: a >= 0, r: r >= 0 };
  const orderOk = (!has.s || !has.a || s <= a) && (!has.a || !has.r || r > a);
  const score = c10((has.s ? 2 : 0) + (has.t ? 2 : 0) + (has.a ? 3 : 0) + (has.r ? 3 : 0) - (orderOk ? 0 : 1));
  const missing = ["s", "t", "a", "r"].filter(k => !has[k]);
  const tip = missing.length ? STAR_TIPS[missing[0]] : orderOk ? "All four parts are there. Make the result concrete with a number if you can." : "Tell it in order: situation, task, what you did, then the result.";
  const names = { s: "Situation", t: "Task", a: "Action", r: "Result" };
  const why = "STAR check: " + Object.keys(names).map(k => `${names[k]} ${yn(has[k])}`).join(", ") + "." + (orderOk ? "" : " The result came before the action.");
  return { ...has, orderOk, score, missing, tip, why };
}

/* ---------- Relevance ---------- */

export function relevanceCheck(tokens, keywords, title = "") {
  const content = tokens.filter(w => !STOP.has(w));
  const kw = [...new Set(tokenize(keywords))].filter(k => !STOP.has(k));
  const titleKw = [...new Set(tokenize(title))].filter(w => w.length > 3 && !STOP.has(w) && !GENERIC.has(w) && !kw.includes(w));
  const hits = kw.filter(k => content.some(matcher(k)));
  const titleHit = titleKw.some(k => content.some(matcher(k)));
  const all = [...kw, ...titleKw].map(matcher);
  const density = content.length ? content.filter(w => all.some(m => m(w))).length / content.length : 0;
  const stuffed = content.length >= 10 && density > .3, short = content.length < 25;
  // With fewer than 3 keywords (typed-in topics) a single miss would swing the score to 0, so only a rough estimate is given.
  const few = kw.length < 3;
  let score = few ? (hits.length || titleHit ? 8 : 4) : c10(hits.length / kw.length * 11 + (titleHit ? 1 : 0));
  if (stuffed) score = Math.min(score, 5);
  if (short) score = Math.min(score, 6);
  let why = `${hits.length} of ${kw.length} expected topic ideas appeared.`;
  if (stuffed) why += " Most of your words were the topic keywords themselves. Explain and give examples instead of repeating them.";
  else if (short) why += " The answer was too short to judge relevance fully.";
  else if (few) why += " This topic has few keywords to check, so this is a rough estimate. The AI coach can check it properly.";
  return { score, hits: hits.length, total: kw.length, stuffed, short, why };
}

/* ---------- Group-discussion rebuttal ---------- */

const ACK = ["i agree", "i understand", "fair point", "good point", "valid point", "i see your point", "you are right", "you're right", "i respect", "building on", "that's true", "that is true", "while it is true", "i accept"];
const COUNTER = ["however", "but", "on the other hand", "although", "even so", "the problem is", "i disagree", "i'd argue", "i would argue", "my point is", "yet"];

export function rebuttalCheck(tokens) {
  const ack = allAt(tokens, ACK).length > 0, counter = allAt(tokens, COUNTER).length > 0;
  const evidence = allAt(tokens, POINTS.example).length > 0 || tokens.some(w => /^\d/.test(w));
  return { ack, counter, evidence, score: (ack ? 4 : 0) + (counter ? 4 : 0) + (evidence ? 2 : 0),
    why: `Acknowledged the other side: ${yn(ack)}, gave a counter-point: ${yn(counter)}, backed it with an example or number: ${yn(evidence)}.` };
}

/* ---------- Audio and camera measures ---------- */

// Volume samples every 100 ms; 22 quiet samples in a row after speech has started = a pause over 2 s. Returns pause start times in seconds.
export function pausesFromVolume(vol, { quiet = .012, minRun = 22, step = .1 } = {}) {
  const out = []; let run = 0, spoke = false;
  vol.forEach((r, i) => { if (r < quiet) run++; else { if (spoke && run >= minRun) out.push(r1((i - run) * step)); run = 0; spoke = true; } });
  return out;
}
export function pausesFromEvents(evs, gap = 2.5) { let n = 0, prev = 0; evs.forEach(t => { if (t - prev > gap) n++; prev = t; }); return n; }

export function pitchStd(pitches) {
  const p = pitches.map(f => 12 * Math.log2(f)).sort((a, b) => a - b);
  if (p.length < 30) return null;
  const m = p[p.length >> 1], q = p.filter(x => Math.abs(x - m) < 8), mu = avg(q);
  return Math.sqrt(avg(q.map(x => (x - mu) ** 2)));
}
export function eyeShare(eye) { const f = eye.filter(x => x != null); return f.length < 8 ? null : avg(f); }

/* ---------- Putting it together ---------- */

export function tipFor(k, { wpm = 140 } = {}) {
  return {
    pace: wpm < 120 ? "Speak a little faster; practise with a 2-minute read-aloud." : "Slow down and breathe between ideas.",
    fillers: "Replace fillers with a silent pause. Notice the one you use most.",
    fluency: "Plan your 3 points in prep time so you never search for the next idea.",
    vocab: "Swap repeated words for precise ones and add one domain term.",
    structure: "Open with a one-line intro, give an example, and end with a clear conclusion.",
    relevance: "Name the topic's key ideas in your first two sentences, then explain them.",
    time: "Use the full time: add a second example.",
    voice: "Vary your pitch: stress key words and drop your voice at the end of a point.",
    eye: "Look at the camera lens when making your main points.",
    rebuttal: "Acknowledge their point first (“That's fair, but…”), then counter it with a reason or example."
  }[k];
}

export function summarizeScores(sc, ctx = {}) {
  const ks = Object.keys(sc).sort((a, b) => sc[a] - sc[b]);
  const weak = ks[0], top = ks[ks.length - 1];
  return { o: r1(avg(Object.values(sc))), top, weak, tip: tipFor(weak, ctx) };
}

export function scoreSession(input) {
  const { text = "", dur = 0, target = 60, lang = "en-IN", typed = false, title = "", keywords = "", story = false, rebuttal = false,
    vol = [], pit = [], eye = [], evs = [], confidence = null } = input;
  const L = LANGS[lang] || LANGS["en-IN"];
  const tokens = tokenize(text);
  if (tokens.length < 8) return { tooShort: true };

  const min = typed ? Math.max(tokens.length / 140, .1) : Math.max(dur / 60, .1);
  const wpm = Math.round(tokens.length / min);
  const fl = countFillers(tokens, L.fillers), fpm = fl.total / min;
  const pauseTimes = typed ? [] : vol.length > 50 ? pausesFromVolume(vol) : null;
  const pauses = typed ? 0 : pauseTimes ? pauseTimes.length : pausesFromEvents(evs);
  const pst = pitchStd(pit), eyeS = eyeShare(eye);

  const content = L.english ? tokens.filter(w => !STOP.has(w)) : tokens.filter(w => w.length > 1);
  const m = mattr(content), uniq = new Set(content).size;
  const rep = {}; content.forEach(w => rep[w] = (rep[w] || 0) + 1);
  const reps = Object.entries(rep).filter(([w, c]) => c >= 4 && w.length > 3).sort((a, b) => b[1] - a[1]).slice(0, 3);
  let vocab = c10((m - (L.english ? .5 : .4)) * 25);
  if (content.length < 25) vocab = Math.min(vocab, 7);

  const kwTokens = tokenize(keywords);
  const st = L.english && !story ? structureCheck(tokens, kwTokens) : null;
  const star = L.english && story ? starCheck(tokens) : null;
  const rel = L.english ? relevanceCheck(tokens, keywords, title) : null;
  const reb = L.english && rebuttal ? rebuttalCheck(tokens) : null;

  const sc = {}, why = {}, notScored = [];
  const put = (k, v, w) => { sc[k] = r1(c10(v)); why[k] = w; };
  const topF = Object.entries(fl.byWord).sort((a, b) => b[1] - a[1])[0];

  if (typed) notScored.push({ k: "pace", reason: "typed text" });
  else put("pace", 10 - Math.max(0, Math.abs(wpm - 140) - 20) / 8, `${wpm} words a minute (ideal 120 to 160).`);
  put("fillers", 10 - Math.max(0, fpm - 2) * 1.2, `${fl.total} filler${fl.total === 1 ? "" : "s"} = ${fpm.toFixed(1)} per minute (aim under 3).${topF ? ` Most used: “${topF[0]}” ×${topF[1]}.` : ""}`);
  if (typed) notScored.push({ k: "fluency", reason: "typed text" });
  else put("fluency", 10 - pauses / min * 2, `${pauses} gap${pauses === 1 ? "" : "s"} over 2 s (${(pauses / min).toFixed(1)} per minute).`);
  put("vocab", vocab, `${uniq} distinct words out of ${content.length}.${reps.length ? " Overused: " + reps.map(r => r[0] + " ×" + r[1]).join(", ") + "." : ""}`);
  if (star) put("structure", star.score, star.why);
  else if (st) put("structure", st.score, st.why);
  else notScored.push({ k: "structure", reason: L.label + " cues aren't checked yet" });
  if (rel) put("relevance", rel.score, rel.why);
  else notScored.push({ k: "relevance", reason: "use the AI coach in " + L.label });
  if (typed) notScored.push({ k: "time", reason: "typed text" });
  else put("time", Math.min(dur / target, 1) * 10, `Spoke ${Math.round(dur)} s of ${target} s.`);
  if (pst != null) put("voice", (pst - 1) * 3.3, `Pitch varied by about ${pst.toFixed(1)} semitones (lively speech is roughly 3 or more).`);
  if (eyeS != null) put("eye", eyeS * 10, `Looking toward the camera ${Math.round(eyeS * 100)}% of the time.`);
  if (reb) put("rebuttal", reb.score, reb.why);

  const load = typed ? null : Math.round(Math.min(100, fpm * 8 + pauses * 12 + ((sc.fluency ?? 10) < 6 ? 10 : 0)));
  return {
    tooShort: false, words: tokens.length, wpm, fills: fl.total, fillByWord: fl.byWord, fpm, pauses, pauseTimes: pauseTimes || [],
    sc, why, notScored, star, structure: st, relevance: rel, rebuttal: reb, load,
    lowConf: confidence != null && confidence > 0 && confidence < .75, confidence,
    ...summarizeScores(sc, { wpm })
  };
}

/* ---------- History helpers ---------- */

export function compareSessions(prev, now) {
  const rows = Object.keys(now.sc || {}).filter(k => prev.sc && typeof prev.sc[k] === "number")
    .map(k => ({ k, before: prev.sc[k], now: now.sc[k], delta: r1(now.sc[k] - prev.sc[k]) }));
  return { overall: r1(now.o - prev.o), rows };
}

export const localDate = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);

// A streak stays alive until the end of the day after the last practice, so it isn't lost before you practise today.
export function streakDays(dates, now = new Date()) {
  const set = new Set(dates), d = new Date(now), doneToday = set.has(localDate(d));
  if (!doneToday) d.setDate(d.getDate() - 1);
  let days = 0;
  while (set.has(localDate(d))) { days++; d.setDate(d.getDate() - 1); }
  return { days, doneToday };
}

export function skillAverages(sessions, n = 10) {
  const sums = {};
  sessions.slice(-n).forEach(s => Object.entries(s.sc || {}).forEach(([k, v]) => (sums[k] = sums[k] || []).push(v)));
  return Object.fromEntries(Object.keys(LABEL).filter(k => sums[k]).map(k => [k, r1(avg(sums[k]))]));
}

export function topFillers(sessions, n = 5) {
  const t = {}, used = {};
  sessions.forEach(s => Object.entries(s.fb || {}).forEach(([w, c]) => { t[w] = (t[w] || 0) + c; used[w] = (used[w] || 0) + 1; }));
  return Object.entries(t).sort((a, b) => b[1] - a[1]).slice(0, n).map(([word, count]) => ({ word, count, sessions: used[word] }));
}

export function keywordsFrom(text, n = 6) {
  const c = {};
  tokenize(text).filter(w => w.length > 3 && !STOP.has(w) && !XS.has(w) && !GENERIC.has(w) && !/^\d+$/.test(w)).forEach(w => c[w] = (c[w] || 0) + 1);
  return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, n).map(x => x[0]).join(" ");
}

// The summary a student can share with their placement cell. Scores only: no transcripts or topics.
export function summarize(sessions, now = new Date()) {
  const s = sessions.filter(x => typeof x.o === "number");
  if (!s.length) return { sessions: 0 };
  const os = s.map(x => x.o), weak = {}, cats = {};
  s.forEach(x => { weak[x.weak] = (weak[x.weak] || 0) + 1; (cats[x.cat] = cats[x.cat] || []).push(x.o); });
  return {
    sessions: s.length, avg: r1(avg(os)), best: Math.max(...os), last: os[os.length - 1],
    trend: s.length >= 6 ? r1(avg(os.slice(-5)) - avg(os.slice(0, 5))) : null,
    firstDate: s[0].d, lastDate: s[s.length - 1].d, streak: streakDays(s.map(x => x.d), now).days,
    weakest: Object.entries(weak).sort((a, b) => b[1] - a[1])[0][0],
    skills: skillAverages(s, 10),
    categories: Object.fromEntries(Object.entries(cats).map(([k, v]) => [k, r1(avg(v))])),
    fillers: topFillers(s, 5)
  };
}
