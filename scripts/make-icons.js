// Renders the SpeakWise mark to PNG app icons with no dependencies. Run: npm run icons
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const BG = [4, 47, 46], TEAL = [45, 212, 191], AMBER = [255, 181, 71];
// The logo's bars in its 28-unit viewBox: x, y, w, h, radius, colour.
const BARS = [[2, 11, 4, 8, 2, TEAL], [9, 5, 4, 18, 2, AMBER], [16, 8, 4, 12, 2, TEAL], [23, 12, 3, 6, 1.5, AMBER]];

const inRound = (x, y, rx, ry, w, h, r) => {
  if (x < rx || y < ry || x > rx + w || y > ry + h) return false;
  const cx = Math.min(Math.max(x, rx + r), rx + w - r), cy = Math.min(Math.max(y, ry + r), ry + h - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};

function render(size, { corner, logoScale }) {
  const px = Buffer.alloc(size * size * 4), SS = 4;
  const unit = size * logoScale / 28, off = (size - 28 * unit) / 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const X = x + (sx + .5) / SS, Y = y + (sy + .5) / SS;
      if (!inRound(X, Y, 0, 0, size, size, corner * size)) continue;
      const lx = (X - off) / unit, ly = (Y - off) / unit;
      const bar = BARS.find(([bx, by, bw, bh, br]) => inRound(lx, ly, bx, by, bw, bh, br));
      const c = bar ? bar[5] : BG;
      r += c[0]; g += c[1]; b += c[2]; a += 255;
    }
    const n = SS * SS, i = (y * size + x) * 4, cov = a / n;
    if (cov) { px[i] = r / (a / 255); px[i + 1] = g / (a / 255); px[i + 2] = b / (a / 255); }
    px[i + 3] = cov;
  }
  return png(size, px);
}

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = buf => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4), body = Buffer.concat([Buffer.from(type), data]), crc = Buffer.alloc(4);
  len.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

mkdirSync("icons", { recursive: true });
writeFileSync("icons/icon-192.png", render(192, { corner: .22, logoScale: .75 }));
writeFileSync("icons/icon-512.png", render(512, { corner: .22, logoScale: .75 }));
// Maskable icons are cropped to a circle or squircle by the OS, so the mark sits inside the central safe zone.
writeFileSync("icons/icon-maskable-512.png", render(512, { corner: 0, logoScale: .55 }));
writeFileSync("icons/apple-touch-icon.png", render(180, { corner: 0, logoScale: .7 }));
console.log("Icons written to icons/");
