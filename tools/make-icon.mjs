// node tools/make-icon.mjs: draws the kit menu's app icon (web/public/icon-*.png and icon.svg): a pixel grass block
// on a night sky. Original art in the spirit of the game, not its logo. Edit the colors below and run it again.
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../web/public/", import.meta.url));
const hash = (/** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ c = 0) => { let h = (a * 374761393 + b * 668265263 + c * 2147483647) >>> 0; h = ((h ^ (h >>> 13)) * 1274126177) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
const mix = (/** @type {number[]} */ a, /** @type {number[]} */ b, /** @type {number} */ t) => a.map((v, i) => v + (b[i] - v) * t);
const shade = (/** @type {number[]} */ c, /** @type {number} */ k) => c.map((v) => Math.min(255, v * k));

const GRASS = [[106, 168, 56], [92, 150, 48], [124, 190, 66], [80, 135, 42]];
const DIRT = [[134, 96, 67], [118, 82, 56], [150, 108, 76], [104, 72, 49]];
const pick = (/** @type {number[][]} */ palette, /** @type {number} */ r) => palette[Math.min(palette.length - 1, Math.floor(r * palette.length))];

/** The 16×16 texture of each face; (u, v) in 0..1, v down. Sides: dirt under a ragged grass edge. */
function top(u, v) { return pick(GRASS, hash(Math.floor(u * 16), Math.floor(v * 16), 1)); }
function side(u, v, face) {
  const x = Math.floor(u * 16), y = Math.floor(v * 16);
  const edge = 3 + Math.floor(hash(x, 7, face) * 3); // grass reaches 3–5 rows down, ragged
  if (y < edge) return pick(GRASS, hash(x, y, 2));
  if (y === edge) return shade(pick(DIRT, hash(x, y, 3)), 0.8); // a dark line under the grass
  return pick(DIRT, hash(x, y, 4));
}

/** @param {number} size @returns {Uint8Array} RGB pixels */
function render(size) {
  const px = new Uint8Array(size * size * 3);
  const L = size * 0.4, w = L * 0.866, h = L * 0.5, d = L; // cube edge L, drawn isometric: 80% of the icon, so a round mask keeps it
  const ox = size / 2, oy = (size - (2 * h + d)) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = y / size;
      let c = mix([22, 24, 64], [96, 52, 120], t); // night sky: navy to purple
      const sx = Math.floor(x / (size / 128)), sy = Math.floor(y / (size / 128)); // stars: one pixel of a 128 grid
      if (hash(sx * 2, sy * 2, 9) > 0.97 && hash(sx, sy, 5) > 0.5) c = [255, 244, 190]; 
      // top face
      let dx = x - ox, dy = y - oy;
      const u = (dx / w + dy / h) / 2, v = (dy / h - dx / w) / 2;
      if (u >= 0 && u < 1 && v >= 0 && v < 1) c = top(u, v);
      else {
        // left face (below the diamond's lower-left edge), then right
        dx = x - ox; dy = y - (oy + h);
        let s = (dx + w) / w; let tt = (dy - s * h) / d; // from the left vertex O+Y
        const ly = y - (oy + h);
        s = (x - (ox - w)) / w; tt = (ly - s * h) / d;
        if (s >= 0 && s < 1 && tt >= 0 && tt < 1) c = shade(side(s, tt, 1), 0.82);
        else {
          s = (ox + w - x) / w; tt = (y - (oy + h) - s * h) / d; // from the right vertex O+X, going left
          if (s > 0 && s <= 1 && tt >= 0 && tt < 1) c = shade(side(1 - s, tt, 2), 0.62);
        }
      }
      px.set(c.map(Math.round), (y * size + x) * 3);
    }
  }
  return px;
}

/** @param {number} size */
function png(size) {
  const rgb = render(size);
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 3 + 1)] = 0; Buffer.from(rgb.buffer, y * size * 3, size * 3).copy(raw, y * (size * 3 + 1) + 1); }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (/** @type {Buffer} */ buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (/** @type {string} */ type, /** @type {Buffer} */ data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const head = Buffer.alloc(13); head.writeUInt32BE(size, 0); head.writeUInt32BE(size, 4); head[8] = 8; head[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", head), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

for (const size of [512, 192, 180]) writeFileSync(`${OUT}icon-${size}.png`, png(size));

// The small icon for browser tabs: the same block, flat.
writeFileSync(`${OUT}icon.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#3a2a6a"/><path d="M32 8L52 20L32 32L12 20Z" fill="#6aa838"/><path d="M12 20L32 32V56L12 44Z" fill="#7d5a3f"/><path d="M12 20L32 32V37L12 25Z" fill="#5c9630"/><path d="M52 20L32 32V56L52 44Z" fill="#5c4130"/><path d="M52 20L32 32V37L52 25Z" fill="#437227"/></svg>\n`);
console.log("Wrote icon-512.png, icon-192.png, icon-180.png and icon.svg in web/public/");
