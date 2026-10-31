// Points every [data-app-path] link at the app, so the site works next to the app ("../") or on its own domain.
const app = document.documentElement.dataset.app || "../";
document.querySelectorAll("[data-app-path]").forEach(a => { a.href = app + a.dataset.appPath; });

const btn = document.getElementById("menubtn"), menu = document.getElementById("menu");
btn.addEventListener("click", () => {
  const open = menu.classList.toggle("open");
  btn.setAttribute("aria-expanded", String(open));
});
menu.addEventListener("click", e => { if (e.target.closest("a")) { menu.classList.remove("open"); btn.setAttribute("aria-expanded", "false"); } });

// Hero waveform: bar heights follow a speech-like envelope, so it reads as a voice rather than an equaliser.
const wave = document.getElementById("wave");
for (let i = 0; i < 64; i++) {
  const x = i / 63, env = Math.sin(Math.PI * x) ** .6 * (.55 + .45 * Math.sin(i * 1.7) ** 2);
  const bar = document.createElement("i");
  bar.style.setProperty("--h", Math.round(10 + env * 46) + "px");
  bar.style.setProperty("--d", (-(i * 97) % 1600) + "ms");
  wave.append(bar);
}

const io = "IntersectionObserver" in window && new IntersectionObserver(es => es.forEach(e => {
  if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
}), { rootMargin: "0px 0px -8% 0px" });
document.querySelectorAll(".reveal").forEach(el => io ? io.observe(el) : el.classList.add("in"));

document.getElementById("yr").textContent = new Date().getFullYear();
