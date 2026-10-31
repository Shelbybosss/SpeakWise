// Placement-cell dashboard: reads students' progress files in the browser and summarises the batch. Nothing is uploaded or stored.
import { LABEL, avg, summarize, localDate } from "./scoring.js";

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const students = new Map();

const daysSince = d => d ? Math.floor((Date.parse(localDate()) - Date.parse(d)) / 864e5) : Infinity;

async function addFiles(list) {
  let added = 0, bad = 0;
  for (const f of list) {
    try {
      const j = JSON.parse(await f.text());
      if (j.kind !== "progress-share" || !Array.isArray(j.sessions)) throw new Error("not a progress file");
      const st = j.student || {}, key = (st.roll || st.name || f.name).toLowerCase();
      // Recompute from the sessions rather than trusting the summary block in the file.
      students.set(key, { name: st.name || f.name.replace(/\.json$/, ""), roll: st.roll || "", college: st.college || "", sum: summarize(j.sessions), exported: j.exported });
      added++;
    } catch { bad++; }
  }
  $("msg").textContent = `${added} file${added === 1 ? "" : "s"} added${bad ? `, ${bad} skipped because ${bad === 1 ? "it isn't a" : "they aren't"} SpeakWise progress file${bad === 1 ? "" : "s"}` : ""}. ${students.size} student${students.size === 1 ? "" : "s"} in total.`;
  render();
}

function rows() {
  const by = $("sort").value, list = [...students.values()];
  const cmp = { avg: (a, b) => (b.sum.avg || 0) - (a.sum.avg || 0), sessions: (a, b) => (b.sum.sessions || 0) - (a.sum.sessions || 0),
    last: (a, b) => String(b.sum.lastDate || "").localeCompare(String(a.sum.lastDate || "")), name: (a, b) => a.name.localeCompare(b.name) }[by];
  return list.sort(cmp);
}

function render() {
  const list = rows();
  $("out").classList.toggle("hide", !list.length);
  if (!list.length) return;
  const active = list.filter(s => s.sum.sessions);
  const weak = {};
  active.forEach(s => weak[s.sum.weakest] = (weak[s.sum.weakest] || 0) + 1);
  const topWeak = Object.entries(weak).sort((a, b) => b[1] - a[1])[0];
  const total = active.reduce((n, s) => n + s.sum.sessions, 0);
  $("stats").innerHTML = [
    ["Students", list.length],
    ["Sessions", total],
    ["Batch average", active.length ? avg(active.map(s => s.sum.avg)).toFixed(1) : "n/a"],
    ["Most common weak spot", topWeak ? LABEL[topWeak[0]] || topWeak[0] : "n/a"]
  ].map(([k, v]) => `<div class="stat"><p class="label">${k}</p><b>${esc(v)}</b></div>`).join("");

  const sk = {};
  active.forEach(s => Object.entries(s.sum.skills || {}).forEach(([k, v]) => (sk[k] = sk[k] || []).push(v)));
  $("bskills").innerHTML = Object.keys(LABEL).filter(k => sk[k]).map(k => { const v = avg(sk[k]); return `<div class="skill ${v >= 7 ? "ok" : v >= 4 ? "mid" : "low"}"><span>${LABEL[k]}</span><span class="track" aria-hidden="true"><i style="width:${v * 10}%"></i></span><b>${v.toFixed(1)}</b></div>`; }).join("") || '<p class="sub">No sessions yet.</p>';

  const attn = list.filter(s => !s.sum.sessions || daysSince(s.sum.lastDate) > 7 || s.sum.avg < 5);
  $("attn").innerHTML = attn.length ? `<ul class="avgs">${attn.map(s => `<li><span>${esc(s.name)}${s.roll ? " (" + esc(s.roll) + ")" : ""}</span><span>${!s.sum.sessions ? "no sessions" : daysSince(s.sum.lastDate) > 7 ? daysSince(s.sum.lastDate) + " days inactive" : "average " + s.sum.avg}</span></li>`).join("")}</ul>` : "Everyone is practising regularly.";

  const trend = t => t == null ? "n/a" : t > 0 ? `<span class="up"><span aria-hidden="true">▲</span> ${t}<span class="vh"> up</span></span>` : t < 0 ? `<span class="down"><span aria-hidden="true">▼</span> ${Math.abs(t)}<span class="vh"> down</span></span>` : "same";
  $("tbl").className = "stack";
  $("tbl").innerHTML = `<tr><th>Student</th><th>Roll</th><th class="num">Sessions</th><th class="num">Average</th><th class="num">Best</th><th class="num">Trend</th><th>Weakest skill</th><th>Top filler</th><th>Last practised</th></tr>` +
    list.map(s => { const u = s.sum; return `<tr><td class="whole">${esc(s.name)}</td><td data-label="Roll">${esc(s.roll)}</td><td class="num" data-label="Sessions">${u.sessions || 0}</td><td class="num" data-label="Average">${u.avg ?? "n/a"}</td><td class="num" data-label="Best">${u.best ?? "n/a"}</td><td class="num" data-label="Trend">${trend(u.trend)}</td><td data-label="Weakest">${esc(LABEL[u.weakest] || u.weakest || "n/a")}</td><td data-label="Top filler">${u.fillers && u.fillers[0] ? esc(u.fillers[0].word) : "n/a"}</td><td data-label="Last practised">${esc(u.lastDate || "n/a")}</td></tr>`; }).join("");
}

function exportCsv() {
  const q = v => /[",\n]/.test(String(v ?? "")) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v ?? "");
  const head = ["name", "roll", "college", "sessions", "average", "best", "trend", "weakest", "last_practised", ...Object.keys(LABEL).map(k => "avg_" + k)];
  const body = rows().map(s => { const u = s.sum; return [s.name, s.roll, s.college, u.sessions || 0, u.avg, u.best, u.trend, u.weakest, u.lastDate, ...Object.keys(LABEL).map(k => (u.skills || {})[k])]; });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([[head, ...body].map(r => r.map(q).join(",")).join("\n")], { type: "text/csv" }));
  a.download = "speakwise-batch-" + localDate() + ".csv"; a.click();
}

$("files").onchange = e => { addFiles([...e.target.files]); e.target.value = ""; };
const drop = $("drop");
["dragenter", "dragover"].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", e => addFiles([...e.dataTransfer.files]));
$("sort").onchange = render;
$("csv").onclick = exportCsv;
$("clear").onclick = () => { students.clear(); $("msg").textContent = "Cleared."; render(); };
