// Local server: serves the site and the AI endpoint. Run: node server.js
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import handler from "./api/coach.js";

const root = process.cwd() || path.dirname(fileURLToPath(import.meta.url));
try {
  fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/).forEach(l => {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  });
} catch { /* no .env */ }

const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json",
  ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".ico": "image/x-icon", ".mp4": "video/mp4" };
const PRIVATE = /^\/(server\.js|api\/|tests\/|scripts\/|node_modules\/|package(-lock)?\.json)/;
const port = Number(process.env.PORT) || 3000;

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/coach")) {
    let b = "", size = 0;
    req.on("data", c => { size += c.length; if (size > 64 * 1024) { res.statusCode = 413; res.end("Too large"); req.destroy(); } else b += c; });
    req.on("end", () => {
      try { req.body = b ? JSON.parse(b) : {}; } catch { req.body = {}; }
      res.status = c => { res.statusCode = c; return res; };
      res.json = o => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(o)); };
      handler(req, res);
    });
    return;
  }
  let p;
  try { p = decodeURIComponent(req.url.split("?")[0]); } catch { res.statusCode = 400; return res.end("Bad request"); }
  if (p.endsWith("/")) p += "index.html";
  let f = path.join(root, path.normalize(p));
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) { res.statusCode = 301; res.setHeader("location", p + "/"); return res.end(); }
  const hidden = /(^|[\\/])\./.test(p) || PRIVATE.test(p.replace(/\\/g, "/"));
  if (hidden || !f.startsWith(root) || !fs.existsSync(f)) { res.statusCode = 404; return res.end("Not found"); }
  res.setHeader("content-type", types[path.extname(f)] || "application/octet-stream");
  res.setHeader("cache-control", "no-cache");
  fs.createReadStream(f).pipe(res);
});

server.listen(port, () => console.log(`SpeakWise running at http://localhost:${port}`));

export default server;
