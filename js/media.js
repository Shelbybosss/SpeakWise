// Microphone, camera, recording and on-device face analysis. Nothing here leaves the device.
const VISION = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const FACE_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const EYE = ["eyeLookOutLeft", "eyeLookInLeft", "eyeLookOutRight", "eyeLookInRight", "eyeLookUpLeft", "eyeLookUpRight", "eyeLookDownLeft", "eyeLookDownRight"];

export function createMedia({ video, onLevel }) {
  let AC = null, an = null, stream = null, mr = null, chunks = [], loopT = 0, camT = 0, testT = 0, face = null;
  let url = null, oldUrl = null, mime = "";
  let data = { vol: [], pit: [], eye: [], smile: [], brow: [] };

  async function open(cam) {
    close();
    stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: cam ? { width: 480 } : false });
    AC = new AudioContext(); an = AC.createAnalyser(); an.fftSize = 2048;
    AC.createMediaStreamSource(stream).connect(an);
    if (cam) { video.srcObject = stream; video.classList.remove("hide"); await video.play(); }
  }

  function close() {
    clearInterval(loopT); clearInterval(camT); clearTimeout(testT); loopT = camT = testT = 0;
    if (stream) stream.getTracks().forEach(t => t.stop());
    if (AC) AC.close().catch(() => {});
    stream = AC = an = null;
    video.classList.add("hide"); video.srcObject = null;
    onLevel(0, null);
  }

  // Returns [rms, pitchHz]. Pitch is found by autocorrelation between 70 and 400 Hz, and is 0 when unvoiced.
  function sample() {
    const b = new Float32Array(an.fftSize); an.getFloatTimeDomainData(b);
    let e = 0; for (const x of b) e += x * x;
    const r = Math.sqrt(e / b.length);
    onLevel(Math.round(Math.min(100, r * 500)), Math.min(1, r * 6));
    let p = 0;
    if (r > .015) {
      const sr = AC.sampleRate, mn = Math.floor(sr / 400), mx = Math.floor(sr / 70);
      let best = 0, bl = 0;
      for (let l = mn; l < mx; l++) { let c = 0; for (let i = 0; i < b.length - l; i += 2) c += b[i] * b[i + l]; if (c > best) { best = c; bl = l; } }
      if (bl && best / (e / 2) > .5) p = sr / bl;
    }
    return [r, p];
  }

  function startCapture(record, cam) {
    if (!stream) return;
    chunks = []; mr = null;
    if (record) {
      try { mr = new MediaRecorder(stream); mr.ondataavailable = e => e.data.size && chunks.push(e.data); mr.start(); } catch { mr = null; }
    }
    loopT = setInterval(() => { const [r, p] = sample(); data.vol.push(r); if (p) data.pit.push(p); }, 100);
    if (cam && face) camT = setInterval(faceTick, 250);
  }

  function stopCapture() {
    return new Promise(resolve => {
      const done = () => { close(); resolve(url); };
      if (!mr || mr.state === "inactive") return done();
      mr.onstop = () => {
        mime = mr.mimeType || "video/webm";
        url = chunks.length ? URL.createObjectURL(new Blob(chunks, { type: mime })) : null;
        mr = null; done();
      };
      mr.stop();
    });
  }

  async function loadFace() {
    if (face) return;
    const m = await import(VISION + "/vision_bundle.mjs");
    const files = await m.FilesetResolver.forVisionTasks(VISION + "/wasm");
    face = await m.FaceLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: FACE_MODEL }, runningMode: "VIDEO", outputFaceBlendshapes: true, numFaces: 1 });
  }

  function faceTick() {
    try {
      const r = face.detectForVideo(video, performance.now()), c = r.faceBlendshapes && r.faceBlendshapes[0];
      if (!c) { data.eye.push(null); return; }
      const g = n => c.categories.find(x => x.categoryName === n).score, a = (x, y) => (g(x) + g(y)) / 2;
      data.eye.push(Math.max(...EYE.map(g)) < .35 ? 1 : 0);
      data.smile.push(a("mouthSmileLeft", "mouthSmileRight") > .3 ? 1 : 0);
      data.brow.push(a("browDownLeft", "browDownRight") > .4 ? 1 : 0);
    } catch { /* a dropped frame */ }
  }

  async function test(ms = 5000) {
    await open(false);
    loopT = setInterval(sample, 100);
    return new Promise(res => { testT = setTimeout(() => { close(); res(); }, ms); });
  }

  // Each recording gets fresh arrays, so a report keeps the data it was built from.
  // The previous recording stays playable while the next one is made; the one before that is released.
  function reset() {
    data = { vol: [], pit: [], eye: [], smile: [], brow: [] };
    if (oldUrl) URL.revokeObjectURL(oldUrl);
    oldUrl = url; url = null; mime = "";
  }

  return { open, close, startCapture, stopCapture, loadFace, test, reset,
    get data() { return data; }, get url() { return url; }, get mime() { return mime; } };
}
