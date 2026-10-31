# SpeakWise: project analysis and design review

Reviewed 31 Oct 2026 against Apple's Human Interface Guidelines (the `apple-design` skill). SpeakWise is a web app (one `index.html`, vanilla JS, plus a Node/Vercel endpoint), so the review applies Apple's principles and foundations (accessibility, color, type, layout, writing). Apple's platform conventions are used as guidance, since a phone browser is the main place students will open it.

---

## 1. The idea

**Rating: 7.5 / 10 for the idea, 6.5 / 10 for how it's built today.**

| | |
|---|---|
| **Problem** | Indian engineering and management students go through campus placements (HR rounds, GDs, "tell me about yourself") with little chance to practise speaking and get honest feedback. Mock interviews depend on seniors or paid coaching. |
| **Audience** | Very large, easy to reach through placement cells and college WhatsApp groups. It costs nothing to try, and that matters for this audience. |
| **What sets it apart** | The topic bank is written for Indian placements (UPI, Make in India, relocation and shifts). It supports Hindi and Marathi. Audio, pitch and eye contact are analysed on the device. It's free, needs no sign-up and runs in the browser. |
| **Competition** | Yoodli, Orai, Poised and Google Interview Warmup. None of them targets Indian campus placements or regional languages. |
| **Risks** | The scoring is mostly heuristic. "Relevance" means keyword hits, and "structure" means spotting phrases like "in conclusion". Students will learn to game it. The Web Speech API only works properly in Chrome and Edge, and it mishears Indian accents. The AI step depends on Gemini's free tier. |

The code shows good product judgement. Every score has a "Why?". Scores are labelled *measured* or *estimated*. You can correct a misheard transcript and re-score it. The AI rephrase is told never to make up achievements. It explains clearly what leaves the device. The main weaknesses are a 50 KB single-file app with no tests, scoring that is easy to game, and a visual design that looks like a template.

## 2. Bugs found while reading the code

| # | Where | Problem | Status |
|---|---|---|---|
| B1 | `index.html` wipe handler | "Delete all my data" removed only `sw` (sessions). Saved topics (`sb`) and topic history (`sr`) stayed, so the privacy promise was broken. | **Fixed** |
| B2 | `README.md` | Told people to set `ANTHROPIC_API_KEY`, but `api/coach.js` reads `GEMINI_API_KEY` and `GEMINI_MODEL`. Following the README left the AI coach broken. | **Fixed** |
| B3 | Streak and session dates | Used `toISOString()` (UTC). In India (UTC+5:30), practice before 5:30 am counted toward the previous day, which broke streaks. | **Fixed** (local date) |
| B4 | `api/coach.js` rate limit | The `hits` Map is in memory. On Vercel each serverless instance has its own copy, so the 30/hour limit doesn't really apply. | **Fixed** (v3): `api/_ratelimit.js` uses Upstash Redis / Vercel KV when configured, memory otherwise |
| B5 | Prep countdown | Recording started automatically after 15 s with no way to skip or extend it. | **Fixed** ("Start speaking now") |
| B6 | Tokeniser | Words were split with `[^a-z]`, so Hindi and Marathi transcripts (Devanagari) became zero words and were rejected as "too little speech". | **Fixed** (v3): Unicode-aware tokeniser |
| B7 | Typed answers | Typed text got a free 10/10 for fluency (and estimated pace and time), inflating the overall score. | **Fixed** (v3): those scores are skipped and listed as "not scored" |
| B8 | Fillers | "like" and "kind of" were always fillers, so "I like coding" or "what kind of role" was penalised. | **Fixed** (v3): only counted in filler position |

## 3. Design review

### Summary
**Rating before the redesign: Needs work.** What the product is about is clear: "speak, get an honest mirror, improve". But the visuals were a template (near-black page, one amber accent, a high-contrast serif). Glass was used on every card. A full-page animated canvas competed with the content. The page supported dark mode only, and some information relied on color alone. The one thing people should remember is the voice waveform. It was buried in the background instead of being where you speak.

### Critical
- **Eye-contact timeline used color alone.** Green, orange and grey bars of the same height, with the meaning only in a `title` tooltip.
  *`accessibility.md › Vision`: "Convey information with more than color alone."*
  **Fix:** the bars now also differ in height (tall = looking, short = away, flat = no face), and the strip has a text summary as its `aria-label`.
- **Destructive action styled as the primary button, with no confirmation.** "Delete all my data" used the amber primary style and deleted immediately (and only partly, see B1).
  *`feedback.md › Best practices`: "Warn people when they initiate a task that can cause data loss that's unexpected and irreversible."*
  **Fix:** the button is now red and destructive, asks for confirmation, and clears all three storage keys. "Done" is the primary action in the dialog.

### Improvements
- **High: dark mode only.** `color-scheme: dark` with no light palette. *`dark-mode.md › Best practices`: "Ensure that your app looks good in both appearance modes."* The redesign uses semantic tokens with light and dark values that follow the system setting. There's no in-app toggle, as Apple advises.
- **High: glass on content.** Every `.card` had `backdrop-filter: blur(14px)`. *`liquid-glass.md › Where the material belongs`: "Don't use Liquid Glass in the content layer."* Now only the floating tab bar uses glass. It falls back to an opaque fill when `prefers-reduced-transparency` is on, and gets a stronger fill with `prefers-contrast: more`.
- **High: navigation.** The three section buttons sat at the top and wrapped on phones, with no `aria-current`. *`tab-bars.md`: "Use a tab bar to support navigation, not to provide actions… Include tab labels."* The redesign has a floating tab bar with icons and labels: at the bottom on compact widths (thumb reach), at the top centre on wide screens (`layout.md › Size classes`). It sets `aria-current="page"`.
- **High: constant background motion.** A full-screen animated canvas, a cursor-following spotlight and an optional video. *`motion.md`: "Add motion purposefully… Don't add motion for the sake of adding motion."* Removed. The waveform now lives on the practice card and moves only when the microphone hears you.
- **Medium: actions mixed into a selection control.** "Live topic" and "My bank" sat inside the category picker. *`segmented-controls.md › Best practices`: "Don't assign actions to segments in a control that otherwise represents selection state."* They're now in the row of topic actions. Categories are `aria-pressed` chips marked by a checkmark as well as an inverted fill.
- **Medium: duration picker.** Three closely related choices in a `<select>`. It's now a segmented control (`segmented-controls.md`: "closely related choices that affect an object, state, or view").
- **Medium: time-boxed prep.** *`accessibility.md › Cognitive`: "Minimize use of time-boxed interface elements."* Added "Start speaking now".
- **Medium: score grid.** Number tiles with "Why?" disclosures. They're now a grouped list in the style of Apple Health. Each row has a status icon (check, dash or warning triangle), a meter bar and the reason when you tap the row. Color always comes with shape and text.
- **Medium: AI disclosure and retry.** *`generative-ai.md`: "Clearly identify when and where you use AI… surfacing controls like Edit, Undo, Retry."* Added a "uses AI" tag, named the provider in the consent line, made the progress message specific ("Checking relevance and rewriting your answer…"), and the button becomes "Rephrase again" after a result.
- **Low: home statistics.** Four big numbers over small labels (a template pattern). Replaced with a "Your next session" card that names your weakest area and has one button to practise it.

### Craft notes
- **Before:** Fraunces, DM Sans and amber on navy matches the "near-black with one warm accent and a serif" look that most generated interfaces now share. Nothing in it came from the product.
- **After:** the identity comes from SpeakWise's own logo (teal and amber voice bars). Teal is the single brand accent for primary actions and the selected tab. Amber appears only inside the waveform gradient and the logo. Display text uses a rounded face (`ui-rounded`/SF Pro Rounded, with Nunito as fallback) for a friendly coaching voice. Body and controls use the system font.
- **Signature element:** the live waveform on the practice card, which fills as you speak and stays afterwards as the shape of your answer. Everything around it is quiet.
- **Removed:** the background video, the canvas glow, the cursor spotlight and the second Google font.

### What works (keep it)
- The *measured* and *estimated* tags plus a "Why?" for every score. That's honest and specific.
- The privacy copy and the on-device analysis.
- Correcting the transcript and re-analysing it.
- The AI prompt rules (no invented facts, placeholders like `[your project name]`).
- Dark-mode contrast in the original palette was fine: `#9AA6C0` on `#0D1220` is 7.6:1 and `#EEF1F8` is 16.5:1.

## 4. Design tokens (as built)

| Token | Light | Dark | Contrast |
|---|---|---|---|
| `--bg` | `#F2F2F7` | `#000000` | |
| `--surface` | `#FFFFFF` | `#1C1C1E` | |
| `--label` | `#1C1C1E` | `#F5F5F7` | 17.0 / 15.6 on surface |
| `--label2` | `#6C6C70` | `#A1A1A6` | 5.2 / 6.6 on surface; 4.7 on light bg |
| `--tint` (brand teal) | `#0F766E` | `#2DD4BF` | 5.5 / 9.1 on surface |
| `--on-tint` | `#FFFFFF` | `#04211E` | 5.5 / 9.1 |
| `--rec` (record/destructive) | `#D70015` | `#FF6961` | text on it: white 5.4 / `#2B0505` 6.6 |
| `--good` / `--warn` | `#15803D` / `#C2410C` | `#4ADE80` / `#FB923C` | ≥ 5.0 / ≥ 7.5 |
| `--amber` (waveform only) | `#B45309` | `#FBBF24` | |

Type scale (rem, so it follows the browser's text size): Large Title 34 px, Title 22 px, Headline/Body 17 px, Subhead 15 px, Footnote 13 px, Caption 12 px minimum. Controls are at least 44 px tall.

## 5. Version 3 status

Everything in the roadmap below has been built, with these limits:

| Item | What was built | Limits |
|---|---|---|
| 1. Mock interview | 4 chained questions with a summary. Built-in follow-ups, or AI follow-ups (`mode: "followup"`) if the student turns on the switch | AI follow-ups are off by default because they send the transcript |
| 2. GD practice | For / Against / Balanced stance, opening round, 30 s rebuttal to a counter-argument, Rebuttal score | Built-in counter-arguments are generic; the AI writes specific ones (`mode: "counter"`) |
| 3. Retry and compare | "Try this topic again"; any report on a topic you've done before shows a before/now table | |
| 4. STAR detection | For story questions ("Tell me about a time…"), with order checking and a tip for the missing part | English and Hinglish only |
| 5. Personal filler list | Progress card, plus a live warning while speaking that flags your usual filler | |
| 6. Company packs | IT services, Product & startups, Banking & finance, Core engineering, each with round tips | Style-based, not tied to named companies |
| 7. Placement cell dashboard | Students download a progress file (scores only); `dashboard.html` combines the files in the officer's browser | No server-side accounts; files are shared by hand |
| 8. Languages | Hinglish, Tamil, Telugu and Bengali added | Outside English and Hinglish, relevance needs the AI coach and structure isn't checked |
| 9. PWA | Manifest, icons, offline cache, shortcuts, install button, daily reminder as a calendar file | Live transcription itself still needs internet in Chrome |
| 10. Resume questions | Projects, internships and skills are picked out on device; only the questions are saved | Heuristic parsing; works best with a "Projects" heading |
| Engineering | Split into ES modules, 29 tests (`npm test`), AI relevance replaces keyword relevance, durable rate limit | |

Scoring is now harder to game. The opening and conclusion only count in the right place, stacking linking phrases is penalised, and relevance is capped when the answer just repeats the keywords. Vocabulary uses a moving-window type-token ratio, so long answers aren't penalised.

## 6. Feature roadmap (original suggestions)

**Next (high value, fits the current design)**
1. **Mock-interview mode.** Chain the existing follow-up questions into a 3 to 5 question interview. The AI picks the next question from what you just said.
2. **Group-discussion (GD) practice.** Placement-specific: a 2-minute stance on a topic, then a counter-argument from the AI that you rebut.
3. **Retry the same topic and compare.** Show the two attempts side by side (pace, fillers, structure). This is what makes improvement visible.
4. **STAR detection for behavioural answers.** Situation, Task, Action, Result: a better structure check than hunting for "in conclusion".
5. **Personal filler list.** Track which filler *you* use most ("basically", "actually") and warn about it live while you speak.

**Later**
6. Company question packs (service companies, product companies, banks), plus tips per interview round.
7. A dashboard for the college placement cell (TPO), where students choose to share their progress.
8. Hinglish and code-switching support, plus Tamil, Telugu and Bengali.
9. A PWA (installable, offline topic bank, daily-challenge reminder).
10. Paste your resume (on-device) to generate questions about your own projects.

**Engineering**
- Split `index.html` into modules (`topics.js`, `analyse.js`, `media.js`, `ui.js`) and add unit tests for the scoring functions.
- Make relevance scoring use the AI response when it's available, and keyword hits only as a fallback.
- Use a durable rate limiter on Vercel (B4).
