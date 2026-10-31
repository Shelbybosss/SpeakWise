// Scores the demo answers with the app's real scoring engine, so the numbers in the video are genuine output.
import { scoreSession, isStoryQuestion, compareSessions } from "../../js/scoring.js";

const TITLE = "Tell me about a time you learned a new technology quickly";
const KW = "learn technology quickly practice project";
const STRONG = "In my third year, our team had two weeks to build a placement portal, and none of us knew React. My task was to get the front end working. I decided to learn by building: I followed the official docs for two days, then I rebuilt one page every evening and asked a senior to review my code. As a result we shipped the portal on time, two hundred students used it, and I learned that I pick up new technology fastest by building a real project.";
const WEAK = "Um so basically we had to make a portal and like I didn't know React. I watched some videos and um it was actually hard but basically we finished it in the end. So yeah.";

// Speech-like audio measures: loud 100 ms frames with short gaps, and a pitch track with the given spread in semitones.
function audio(seconds, pauses, spread) {
  const vol = [];
  for (let i = 0; i < seconds * 10; i++) vol.push(i % 9 === 8 ? .005 : .08);
  pauses.forEach(p => { for (let i = 0; i < 26; i++) vol[p * 10 + i] = .004; });
  const pit = Array.from({ length: seconds * 6 }, (_, i) => 160 * 2 ** ((spread * Math.sin(i * .7) * 1.4) / 12));
  return { vol, pit };
}
const run = (text, dur, a) => scoreSession({ text, dur, target: 60, title: TITLE, keywords: KW, story: isStoryQuestion(TITLE), ...a });
const strong = run(STRONG, 47, audio(47, [], 3.4)), weak = run(WEAK, 26, audio(26, [6, 15], 1.6));
console.log(JSON.stringify({ strong: { o: strong.o, sc: strong.sc, star: strong.star && { s: strong.star.s, t: strong.star.t, a: strong.star.a, r: strong.star.r }, wpm: strong.wpm, top: strong.top, weak: strong.weak, tip: strong.tip },
  weak: { o: weak.o, sc: weak.sc }, compare: compareSessions({ o: weak.o, sc: weak.sc }, { o: strong.o, sc: strong.sc }) }, null, 1));
