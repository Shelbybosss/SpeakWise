import { test } from "node:test";
import assert from "node:assert/strict";
import { tokenize, countFillers, fillerSegments, LANGS, mattr, structureCheck, starCheck, isStoryQuestion, relevanceCheck, rebuttalCheck,
  pausesFromVolume, scoreSession, compareSessions, streakDays, localDate, topFillers, summarize, keywordsFrom } from "../js/scoring.js";

const EN = LANGS["en-IN"].fillers;

test("tokenize keeps Devanagari and other Indian scripts", () => {
  assert.deepEqual(tokenize("मेरा नाम राहुल है"), ["मेरा", "नाम", "राहुल", "है"]);
  assert.deepEqual(tokenize("আমি ছাত্র"), ["আমি", "ছাত্র"]);
  assert.deepEqual(tokenize("I don’t know, UPI!"), ["i", "don't", "know", "upi"]);
});

test("'like' and 'kind of' only count in filler position", () => {
  assert.equal(countFillers(tokenize("I like coding and I would like to learn"), EN).total, 0);
  assert.equal(countFillers(tokenize("languages like python are popular"), EN).total, 0);
  assert.equal(countFillers(tokenize("what kind of role is this"), EN).total, 0);
  const f = countFillers(tokenize("it was like um really kind of hard you know"), EN);
  assert.equal(f.total, 4);
  assert.deepEqual(f.byWord, { like: 1, um: 1, "kind of": 1, "you know": 1 });
});

test("Hindi and Hinglish fillers are detected", () => {
  assert.equal(countFillers(tokenize("मतलब मैं यह कहना चाहता हूँ है ना"), LANGS["hi-IN"].fillers).total, 2);
  assert.equal(countFillers(tokenize("matlab I was basically saying yaani"), LANGS.hinglish.fillers).total, 3);
});

test("fillerSegments highlights fillers and keeps the original text", () => {
  const text = "Um, I think, you know, it works.";
  const segs = fillerSegments(text, EN);
  assert.equal(segs.map(s => s.text).join(""), text);
  assert.deepEqual(segs.filter(s => s.filler).map(s => s.text), ["Um", "you know"]);
});

test("MATTR rewards varied words over repetition", () => {
  const varied = "cloud servers storage scale pay network data apps users security backup region latency cost billing compute memory disk virtual machine container queue cache database load balancer gateway function event stream metric alert log trace deploy release rollback region zone edge cdn".split(" ");
  const repeated = Array(45).fill("cloud data good").join(" ").split(" ");
  assert.ok(mattr(varied) > .9);
  assert.ok(mattr(repeated) < .2);
});

test("structure needs the conclusion at the end, not anywhere", () => {
  const body = "cloud computing lets companies rent servers because buying hardware is expensive for example a startup can launch an app in a day and pay only for what it uses another benefit is that it scales during a sale".split(" ");
  const good = structureCheck(tokenize("Today I will talk about cloud computing. " + body.join(" ") + " In conclusion the cloud saves money and time."), tokenize("cloud server"));
  assert.ok(good.intro && good.example && good.reason && good.end);
  assert.ok(good.score >= 9);
  const early = structureCheck(tokenize("In conclusion cloud computing. " + body.join(" ") + " " + body.join(" ")), tokenize("cloud server"));
  assert.equal(early.end, false);
  assert.equal(early.early, true);
  assert.ok(early.score < good.score);
});

test("stuffing linking phrases is penalised", () => {
  const stuffed = structureCheck(tokenize("firstly secondly also because for example however in conclusion firstly secondly also because for example however moreover because but also finally overall in conclusion"));
  assert.ok(stuffed.stuffed);
});

test("STAR detection finds all four parts in order", () => {
  const s = starCheck(tokenize("In my third year our college fest had no sponsors. My role was to raise funds. I reached out to 20 local shops and I convinced five of them. As a result we raised 40000 rupees and the fest ran on time."));
  assert.deepEqual([s.s, s.t, s.a, s.r, s.orderOk], [true, true, true, true, true]);
  assert.equal(s.score, 10);
  assert.equal(starCheck(tokenize("As sponsorship lead, my goal was to raise forty thousand rupees.")).t, true);
  const partial = starCheck(tokenize("I am a hard working person and I always give my best to every team I join."));
  assert.ok(partial.missing.includes("s") && partial.missing.includes("r"));
  assert.ok(partial.score < 5);
});

test("story questions are recognised", () => {
  assert.ok(isStoryQuestion("Describe a time you led a team"));
  assert.ok(isStoryQuestion("Tell me about a failure and what you learned"));
  assert.ok(!isStoryQuestion("Explain cloud computing to a beginner"));
  assert.ok(!isStoryQuestion("Where do you see yourself in five years?"));
});

test("relevance uses word stems and caps keyword stuffing", () => {
  const kw = "cloud server storage internet scalable pay";
  const real = relevanceCheck(tokenize("The cloud means renting servers and storage over the internet. It is scalable, so a small company can grow quickly and only pay for what it uses, for example during a festival sale when traffic jumps. That flexibility is why most startups begin there."), kw, "Explain cloud computing to a beginner");
  assert.equal(real.hits, 6);
  assert.ok(real.score >= 9);
  const stuffed = relevanceCheck(tokenize("cloud server storage internet scalable pay cloud server storage internet scalable pay cloud server storage internet"), kw);
  assert.ok(stuffed.stuffed);
  assert.ok(stuffed.score <= 5);
  // "art" must not match inside "start".
  assert.equal(relevanceCheck(tokenize("we start the day early and then we start again"), "art").hits, 0);
});

test("topics with few keywords get a rough estimate instead of 0", () => {
  const r = relevanceCheck(tokenize("In my third year our fest had no sponsors, so I reached out to local shops and convinced five of them to support us, and we raised enough money in the end."), "team", "Describe a time you led a team");
  assert.equal(r.hits, 0);
  assert.equal(r.score, 4);
});

test("rebuttal rewards acknowledging and countering", () => {
  const r = rebuttalCheck(tokenize("That's a fair point, but I would argue that for example UPI fraud fell after two factor checks."));
  assert.deepEqual([r.ack, r.counter, r.evidence], [true, true, true]);
  assert.equal(r.score, 10);
});

test("pausesFromVolume finds gaps over 2 s after speech starts", () => {
  const loud = Array(10).fill(.1), quiet = n => Array(n).fill(0);
  assert.deepEqual(pausesFromVolume([...quiet(30), ...loud, ...quiet(25), ...loud, ...quiet(10), ...loud]), [4]);
});

test("typed answers don't get free scores for pace, fluency or time", () => {
  const r = scoreSession({ text: "Cloud computing means renting servers over the internet so companies can scale and pay only for what they use, for example during a sale.", typed: true, keywords: "cloud server internet", title: "Explain cloud computing" });
  assert.equal(r.sc.pace, undefined);
  assert.equal(r.sc.fluency, undefined);
  assert.equal(r.sc.time, undefined);
  assert.deepEqual(r.notScored.map(n => n.k), ["pace", "fluency", "time"]);
});

test("a Hindi transcript is scored instead of being rejected as too short", () => {
  const r = scoreSession({ text: "मेरा नाम राहुल है और मैं कंप्यूटर इंजीनियरिंग का छात्र हूँ मतलब मुझे कोडिंग पसंद है", dur: 20, target: 30, lang: "hi-IN" });
  assert.equal(r.tooShort, false);
  assert.equal(r.fills, 1);
  assert.equal(r.sc.relevance, undefined);
  assert.ok(r.notScored.some(n => n.k === "relevance"));
});

test("too little speech is reported", () => {
  assert.equal(scoreSession({ text: "hello there" }).tooShort, true);
});

test("compareSessions reports per-skill change", () => {
  const c = compareSessions({ o: 5, sc: { pace: 4, fillers: 6 } }, { o: 6.5, sc: { pace: 7, fillers: 6, eye: 8 } });
  assert.equal(c.overall, 1.5);
  assert.deepEqual(c.rows.map(r => [r.k, r.delta]), [["pace", 3], ["fillers", 0]]);
});

test("streaks use local dates and survive until you practise today", () => {
  const now = new Date(2026, 9, 31, 4, 0);
  const d = n => localDate(new Date(2026, 9, 31 - n, 12));
  assert.deepEqual(streakDays([d(0), d(1), d(2)], now), { days: 3, doneToday: true });
  assert.deepEqual(streakDays([d(1), d(2)], now), { days: 2, doneToday: false });
  assert.equal(streakDays([d(3)], now).days, 0);
  assert.equal(localDate(new Date(2026, 9, 31, 4, 0)), "2026-10-31");
});

test("topFillers and summarize aggregate history", () => {
  const s = [
    { d: "2026-10-01", cat: "Tech & AI", o: 5, sc: { pace: 5 }, weak: "pace", fb: { basically: 3, um: 1 } },
    { d: "2026-10-02", cat: "Tech & AI", o: 7, sc: { pace: 7 }, weak: "pace", fb: { basically: 2 } }
  ];
  assert.deepEqual(topFillers(s)[0], { word: "basically", count: 5, sessions: 2 });
  const sum = summarize(s, new Date(2026, 9, 2, 12));
  assert.equal(sum.sessions, 2); assert.equal(sum.avg, 6); assert.equal(sum.weakest, "pace"); assert.equal(sum.streak, 2);
  assert.equal(summarize([]).sessions, 0);
});

test("keywordsFrom picks frequent content words", () => {
  assert.equal(keywordsFrom("Quantum computing uses qubits. Qubits can hold many states, so quantum machines solve some problems faster.", 3), "quantum qubits computing");
});
