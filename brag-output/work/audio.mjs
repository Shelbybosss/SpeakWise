// Synthesises the soundtrack: a warm D-major bed at 120 BPM (every scene cut lands on a beat) with sound effects
// in the same key, sent through one shared reverb so they sit inside the music. Output: work/audio.wav
import { writeFileSync } from "node:fs";

const SR = 44100, DUR = 41, N = SR * DUR, BEAT = .5;
const L = new Float32Array(N), R = new Float32Array(N);       // dry mix
const SL = new Float32Array(N), SRb = new Float32Array(N);     // reverb send
const PAD = new Float32Array(N * 2);                            // pad bus (stereo interleaved), ducked by the kick
const KENV = new Float32Array(N);                               // kick envelope for ducking
const hz = m => 440 * 2 ** ((m - 69) / 12);
let seed = 1; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647 * 2 - 1;
const put = (i, v, pan = 0, send = 0) => { if (i < 0 || i >= N) return; const l = Math.cos((pan + 1) * Math.PI / 4), r = Math.sin((pan + 1) * Math.PI / 4); L[i] += v * l; R[i] += v * r; SL[i] += v * l * send; SRb[i] += v * r * send; };

// D maj9 · B m9 · G maj9 · A add9 — two seconds each.
const CHORDS = [[50, 57, 61, 64, 66], [47, 54, 57, 61, 62], [43, 50, 54, 57, 62], [45, 52, 57, 59, 61]];
const level = t => t < 4 ? .55 + .1 * t / 4 : t < 37 ? .75 : .8;

/* Pad: detuned saws through a soft low-pass, overlapping chords */
for (let bar = 0; bar < DUR / 2; bar++) {
  const t0 = bar * 2, notes = CHORDS[bar % 4];
  notes.forEach((m, ni) => [-.07, .07].forEach((det, di) => {
    const f = hz(m) * 2 ** (det / 12); let ph = Math.random(), y = 0;
    const a = 1 - Math.exp(-2 * Math.PI * (700 + 500 * Math.sin(bar * .7)) / SR);
    const start = Math.floor(t0 * SR), len = Math.floor(2.9 * SR);
    for (let j = 0; j < len; j++) {
      const t = j / SR, env = Math.min(1, t / .5) * (t > 2 ? Math.max(0, 1 - (t - 2) / .9) : 1);
      ph += f / SR; ph -= Math.floor(ph);
      y += a * ((2 * ph - 1) - y);
      const i = start + j; if (i >= N) break;
      const v = y * env * .022 * level(i / SR), pan = (ni - 2) * .25 + (di ? .15 : -.15);
      PAD[i * 2] += v * Math.cos((pan + 1) * Math.PI / 4); PAD[i * 2 + 1] += v * Math.sin((pan + 1) * Math.PI / 4);
    }
  }));
}

/* Notes and drums */
function tone(t, f, dur, amp, { pan = 0, send = .3, decay = 6, harm = .25, attack = .004, bell = false } = {}) {
  const s = Math.floor(t * SR), n = Math.floor(dur * SR);
  for (let j = 0; j < n; j++) {
    const x = j / SR, env = Math.min(1, x / attack) * Math.exp(-x * decay);
    const ph = 2 * Math.PI * f * x;
    const v = bell ? Math.sin(ph) + .35 * Math.sin(ph * 2.76) * Math.exp(-x * 3) + .18 * Math.sin(ph * 5.4) * Math.exp(-x * 6) : Math.sin(ph) + harm * Math.sin(2 * ph);
    put(s + j, v * env * amp, pan, send);
  }
}
function kick(t, amp = .42) {
  const s = Math.floor(t * SR);
  let ph = 0;
  for (let j = 0; j < SR * .35; j++) {
    const x = j / SR, f = 45 + 85 * Math.exp(-x * 28), env = Math.exp(-x * 9);
    ph += 2 * Math.PI * f / SR;
    put(s + j, Math.sin(ph) * env * amp, 0, 0);
    if (s + j < N) KENV[s + j] = Math.max(KENV[s + j], Math.exp(-x * 7));
  }
}
function noiseHit(t, dur, amp, { hp = true, decay = 60, pan = 0, send = .1, lp = .5 } = {}) {
  const s = Math.floor(t * SR); let y = 0;
  for (let j = 0; j < dur * SR; j++) {
    const x = j / SR, w = rnd(); y += lp * (w - y);
    put(s + j, (hp ? w - y : y) * Math.exp(-x * decay) * amp, pan, send);
  }
}
function whoosh(t, dur = .55, amp = .05) {
  const s = Math.floor(t * SR), n = Math.floor(dur * SR); let y = 0;
  for (let j = 0; j < n; j++) {
    const k = j / n, fc = 300 + 3800 * k, a = 1 - Math.exp(-2 * Math.PI * fc / SR);
    y += a * (rnd() - y);
    put(s + j, y * Math.sin(Math.PI * k) ** 2 * amp, Math.sin(k * 3) * .4, .5);
  }
}
function riser(t0, t1, amp = .05) {
  const s = Math.floor(t0 * SR), n = Math.floor((t1 - t0) * SR); let y = 0, ph = 0;
  for (let j = 0; j < n; j++) {
    const k = j / n, a = 1 - Math.exp(-2 * Math.PI * (200 + 5000 * k * k) / SR);
    y += a * (rnd() - y); ph += 2 * Math.PI * (hz(74) * (1 + k)) / SR;
    put(s + j, (y * .8 + Math.sin(ph) * .15) * k * k * amp, 0, .6);
  }
}

// Bass + drums run from the reveal (4 s) to the outro (37 s), on the same beat grid as the scene cuts.
for (let b = 8; b < 74; b++) {
  const t = b * BEAT, bar = Math.floor(t / 2), root = CHORDS[bar % 4][0] - 12;
  kick(t, b % 2 ? .3 : .4);
  if (t >= 7.5) tone(t, hz(root), .45, .16, { decay: 5, harm: .4, send: 0 });
  if (t >= 12) noiseHit(t + .25, .05, .045, { decay: 70, pan: .3 });
  if (t >= 17.5 && t < 33.5 && b % 2 === 1) noiseHit(t, .12, .06, { hp: false, lp: .25, decay: 28, pan: -.1, send: .25 });
}
// Arpeggio: chord tones an octave up, eighth notes, alternating sides.
for (let e = 15; e < 148; e++) {
  const t = e * BEAT / 2, notes = CHORDS[Math.floor(t / 2) % 4];
  tone(t, hz(notes[(e * 3) % notes.length] + 24), .3, .035, { decay: 12, pan: e % 2 ? .45 : -.45, send: .45 });
}

/* Sound effects, all tuned to the key */
const HOOK_TYPE = [1.45, 3.3];
for (let t = HOOK_TYPE[0]; t < HOOK_TYPE[1]; t += .13) noiseHit(t, .015, .018, { decay: 300, pan: .2, send: .05 });
[1.55, 2.0, 2.45, 3.05].forEach((t, i) => tone(t, hz([81, 78, 81, 85][i]), .2, .05, { decay: 18, pan: (i - 1.5) * .3, send: .35 }));  // filler pops
riser(3.0, 4.0);
tone(4.05, hz(74), 1.6, .05, { bell: true, decay: 2.2, send: .6 }); tone(4.15, hz(78), 1.5, .04, { bell: true, decay: 2.2, send: .6, pan: .2 });
[4.1, 4.19, 4.28, 4.37].forEach((t, i) => tone(t, hz([62, 66, 69, 74][i]), .5, .05, { decay: 7, pan: (i - 1.5) * .25, send: .4 }));  // logo bars
[7.5, 12, 17.5, 24, 29, 33.5].forEach(t => whoosh(t - .2));
[9.0, 10.5].forEach(t => { tone(t, hz(93), .06, .05, { decay: 60, send: .15 }); noiseHit(t, .01, .03, { decay: 400 }); }); // cursor clicks
[[19.0, 74], [19.1, 78], [19.2, 81], [19.3, 86]].forEach(([t, m]) => tone(t, hz(m), 1.4, .045, { bell: true, decay: 2.6, send: .6 })); // score lands
[24.6, 24.85, 25.1, 25.35].forEach((t, i) => tone(t, hz([74, 78, 81, 86][i]), .25, .035, { decay: 14, send: .3, pan: (i - 1.5) * .3 })); // STAR tiles
[25.7, 25.9, 26.1, 26.3, 26.5].forEach(t => noiseHit(t, .012, .02, { decay: 300, send: .05 })); // rows
// Outro: drums drop, a final chord blooms and rings out.
[50, 57, 62, 66, 69, 73].forEach((m, i) => tone(37 + i * .05, hz(m + 12), 3.8, .03, { bell: true, decay: .9, send: .7, pan: (i - 2.5) * .2 }));

/* Duck the pad under the kick, add it to the mix */
for (let i = 0; i < N; i++) { const d = 1 - .35 * KENV[i]; L[i] += PAD[i * 2] * d; R[i] += PAD[i * 2 + 1] * d; SL[i] += PAD[i * 2] * d * .35; SRb[i] += PAD[i * 2 + 1] * d * .35; }

/* Schroeder reverb on the send bus */
function reverb(inp, offs) {
  const out = new Float32Array(N), combs = [1116, 1188, 1277, 1356].map(d => ({ d: d + offs, buf: new Float32Array(d + offs), i: 0, lp: 0 }));
  for (let n = 0; n < N; n++) {
    let s = 0;
    for (const c of combs) { const y = c.buf[c.i]; c.lp = y * .75 + c.lp * .25; c.buf[c.i] = inp[n] + c.lp * .8; c.i = (c.i + 1) % c.d; s += y; }
    out[n] = s * .25;
  }
  for (const d of [556 + offs, 441 + offs]) {
    const buf = new Float32Array(d); let k = 0;
    for (let n = 0; n < N; n++) { const b = buf[k], x = out[n]; const y = -x + b; buf[k] = x + b * .5; k = (k + 1) % d; out[n] = y; }
  }
  return out;
}
const WL = reverb(SL, 0), WR = reverb(SRb, 23);

/* Master: sum, gentle saturation, fades, normalise to -1 dBFS */
let peak = 0;
for (let i = 0; i < N; i++) {
  const t = i / SR, fade = Math.min(1, t / .3) * Math.min(1, (DUR - t) / 2.5);
  L[i] = Math.tanh((L[i] + WL[i] * .45) * 1.15) * fade;
  R[i] = Math.tanh((R[i] + WR[i] * .45) * 1.15) * fade;
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const g = .89 / peak, pcm = Buffer.alloc(44 + N * 4);
pcm.write("RIFF", 0); pcm.writeUInt32LE(36 + N * 4, 4); pcm.write("WAVEfmt ", 8); pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(2, 22);
pcm.writeUInt32LE(SR, 24); pcm.writeUInt32LE(SR * 4, 28); pcm.writeUInt16LE(4, 32); pcm.writeUInt16LE(16, 34); pcm.write("data", 36); pcm.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) { pcm.writeInt16LE(Math.round(L[i] * g * 32767), 44 + i * 4); pcm.writeInt16LE(Math.round(R[i] * g * 32767), 46 + i * 4); }
writeFileSync(new URL("./audio.wav", import.meta.url), pcm);
console.log("audio.wav written, peak gain", g.toFixed(2));
