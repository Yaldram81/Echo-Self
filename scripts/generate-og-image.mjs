/**
 * Generates public/og-image.png (1200x630) — a warm terracotta/paper gradient
 * matching the app's design system. Pure Node (zlib), no image dependencies.
 * Run with: node scripts/generate-og-image.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const W = 1200;
const H = 630;

// Design-system colors: paper #F7F3EB (top-left) → terracotta #B87559 (bottom-right),
// with a soft deep-terracotta #9A5A40 wash toward the corner.
const PAPER = [247, 243, 235];
const TERRA = [184, 117, 89];
const DEEP = [154, 90, 64];

function pixel(x, y) {
  const t = (x / W + y / H) / 2;
  const wash = Math.max(0, ((x / W + y / H) / 2 - 0.55) * 2) * 0.5;
  const base = PAPER.map((p, i) => p + (TERRA[i] - p) * t);
  return base.map((b, i) => Math.round(b + (DEEP[i] - b) * wash));
}

const raw = Buffer.alloc(H * (1 + W * 3));
for (let y = 0; y < H; y++) {
  const rowStart = y * (1 + W * 3);
  raw[rowStart] = 0; // filter: none
  for (let x = 0; x < W; x++) {
    const [r, g, b] = pixel(x, y);
    const i = rowStart + 1 + x * 3;
    raw[i] = r; raw[i + 1] = g; raw[i + 2] = b;
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;  // bit depth
ihdr[9] = 2;  // color type: truecolor RGB

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

mkdirSync('public', { recursive: true });
writeFileSync('public/og-image.png', png);
console.log(`public/og-image.png written (${W}x${H}, ${png.length} bytes)`);
