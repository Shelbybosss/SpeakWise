// Signature: a voice waveform that fills only while the mic hears you, and keeps the shape of your answer afterwards.
export function createWave(cv) {
  const cx = cv.getContext("2d"), hist = [], GAP = 6;
  let W = 0, H = 0;

  function size() {
    const r = devicePixelRatio || 1;
    W = cv.clientWidth; H = cv.clientHeight;
    if (!W) return;
    cv.width = W * r; cv.height = H * r; cx.setTransform(r, 0, 0, r, 0, 0);
    draw();
  }

  function draw() {
    if (!W) return;
    // Colours come from the canvas's own context, so the stage panel can restyle the waveform.
    const cs = getComputedStyle(cv), n = Math.floor(W / GAP), g = cx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, cs.getPropertyValue("--wave-a").trim());
    g.addColorStop(1, cs.getPropertyValue("--wave-b").trim());
    cx.clearRect(0, 0, W, H);
    const idle = cs.getPropertyValue("--wave-idle").trim(), off = n - hist.length;
    for (let i = 0; i < n; i++) {
      const v = i >= off ? hist[i - off] : null, h = v == null ? 4 : Math.max(4, Math.min(1, v) * H * .94), x = i * GAP + (GAP - 3) / 2, y = (H - h) / 2;
      cx.fillStyle = v == null || v < .02 ? idle : g;
      cx.beginPath();
      if (cx.roundRect) cx.roundRect(x, y, 3, h, 1.5); else cx.rect(x, y, 3, h);
      cx.fill();
    }
  }

  addEventListener("resize", size);
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", draw);
  return {
    size,
    push(v) { hist.push(v); const n = Math.floor(W / GAP) || 200; if (hist.length > n) hist.shift(); draw(); },
    reset() { hist.length = 0; draw(); }
  };
}
