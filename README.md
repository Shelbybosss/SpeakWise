# SpeakWise - Placement Speaking Coach
Practise placement interviews out loud and get honest feedback on pace, fillers, pauses, pitch, structure (including STAR) and eye contact. Analysis runs on your device. An optional AI coach checks relevance and rephrases your answer.

Three ways to practise:
- **Single topic**: one question, one report. Retry it and the report compares both attempts.
- **Mock interview**: four questions in a row, with follow-ups (built in, or written by the AI from what you said).
- **Group discussion**: pick a side, give your opening, then answer a counter-argument.

Also: company question packs (IT services, product companies, banking, core engineering), questions generated from your own resume (on device), English, Hinglish, Hindi, Marathi, Tamil, Telugu and Bengali, a live warning when you repeat your usual filler, a progress file for your placement cell plus a dashboard for them, a daily calendar reminder, and an installable app that works offline.

## Run locally (with AI coach)
1. Install Node.js 18+ (nodejs.org). No `npm install` is needed: there are no dependencies.
2. Create a file named `.env` containing: `GEMINI_API_KEY=your-key-here` (key from aistudio.google.com)
3. In a terminal in this folder run: `npm start` (or `node server.js`). Set `PORT` to use a port other than 3000.
4. Open http://localhost:3000 in Chrome or Edge.

Without the key everything works except the AI buttons. The app uses JavaScript modules, so open it through the server (or Vercel), not by double-clicking `index.html`.

## Deploy (Vercel, hosts site + AI endpoint)
Push to GitHub, import the repo at vercel.com, add the environment variable `GEMINI_API_KEY`, and deploy.

Optional environment variables:
- `GEMINI_MODEL`: preferred Gemini model.
- `ALLOWED_ORIGIN`: restrict CORS to your site.
- `RATE_LIMIT_PER_HOUR`: AI requests per IP per hour (default 30).
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (or Vercel KV's `KV_REST_API_URL` and `KV_REST_API_TOKEN`): makes the rate limit hold across all serverless instances. Without them the limit is per instance only.

Never commit your key. `.env` is in .gitignore.

## Tests
`npm test` runs the scoring, resume, rate-limit and API tests with Node's built-in test runner.

## Project layout
| Path | What it is |
|---|---|
| `index.html`, `css/app.css` | The app's markup and styles (light and dark) |
| `js/app.js` | UI: practice flows, report, progress |
| `js/scoring.js` | All scoring, with no DOM access so it can be tested |
| `js/topics.js`, `topics.json` | Topic bank, company packs; `topics.json` adds extra categories |
| `js/media.js`, `js/wave.js` | Microphone, camera, recording, face analysis, waveform |
| `js/resume.js` | Resume-to-questions, on device |
| `js/store.js` | Everything stored in localStorage |
| `js/coach.js`, `api/coach.js`, `api/_ratelimit.js` | AI client and server endpoint, rate limiter |
| `dashboard.html`, `js/dashboard.js` | Placement cell dashboard (reads students' progress files in the browser) |
| `sw.js`, `manifest.webmanifest`, `icons/` | Installable app and offline support (`npm run icons` regenerates the PNGs) |

See DESIGN_REVIEW.md for the design review, bug list and roadmap. `index.before-redesign.html` and `index.before-modules.html` are earlier single-file versions.
