import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { deflateSync } from "node:zlib";

const outputDir = resolve(import.meta.dirname, "../public/icons");
const sizes = [16, 32, 48, 128];
const superSampling = 4;

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeBuffer = Buffer.from(type, "ascii");
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function encodePng(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    pixels.copy(raw, row + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function mixColor(a, b, t) {
  return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
}

function insideRoundedRect(x, y, inset, radius) {
  const left = inset;
  const top = inset;
  const right = 1 - inset;
  const bottom = 1 - inset;
  if (x < left || x > right || y < top || y > bottom) return false;
  const cornerX = x < left + radius ? left + radius : x > right - radius ? right - radius : x;
  const cornerY = y < top + radius ? top + radius : y > bottom - radius ? bottom - radius : y;
  return Math.hypot(x - cornerX, y - cornerY) <= radius;
}

function segmentDistance(x, y, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = clamp(((x - ax) * dx + (y - ay) * dy) / lengthSquared);
  return Math.hypot(x - (ax + dx * t), y - (ay + dy * t));
}

function blend(base, color, alpha) {
  return [
    mix(base[0], color[0], alpha),
    mix(base[1], color[1], alpha),
    mix(base[2], color[2], alpha),
  ];
}

const backgroundTop = [20, 23, 36];
const backgroundBottom = [7, 8, 14];
const border = [46, 51, 72];
const violet = [139, 124, 255];
const cyan = [94, 234, 212];
const lensFill = [12, 14, 22];
const white = [255, 255, 255];

function sample(u, v) {
  if (!insideRoundedRect(u, v, 0, 0.22)) return [0, 0, 0, 0];

  let color = mixColor(backgroundTop, backgroundBottom, clamp(v * 0.7 + u * 0.3));

  if (!insideRoundedRect(u, v, 0.018, 0.205)) {
    color = blend(color, border, 0.9);
  }

  const lensX = 0.48;
  const lensY = 0.45;
  const distance = Math.hypot(u - lensX, v - lensY);
  const ringRadius = 0.27;
  const ringWidth = 0.075;
  const gradient = clamp((u + v) / 2);

  if (segmentDistance(u, v, 0.67, 0.65, 0.84, 0.82) < 0.05) {
    color = blend(color, mixColor(violet, cyan, gradient), 0.95);
  }

  if (distance < ringRadius - ringWidth / 2) {
    color = blend(color, lensFill, 0.94);
    if (distance < 0.16) {
      color = blend(color, mixColor(violet, cyan, gradient), 0.1);
    }
    if (Math.hypot(u - 0.39, v - 0.36) < 0.06) {
      color = blend(color, white, 0.16);
    }
  }

  if (Math.abs(distance - ringRadius) < ringWidth / 2) {
    color = mixColor(color, mixColor(violet, cyan, gradient), 1);
  }

  if (distance < 0.07) {
    color = blend(color, mixColor(violet, cyan, gradient), 0.55);
  }

  return [...color, 255];
}

function generateIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const scale = size * superSampling;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < superSampling; sy += 1) {
        for (let sx = 0; sx < superSampling; sx += 1) {
          const [sr, sg, sb, sa] = sample(
            (x * superSampling + sx + 0.5) / scale,
            (y * superSampling + sy + 0.5) / scale,
          );
          r += sr * sa;
          g += sg * sa;
          b += sb * sa;
          a += sa;
        }
      }
      const offset = (y * size + x) * 4;
      const alpha = a / (superSampling * superSampling);
      const divisor = a || 1;
      pixels[offset] = Math.round(r / divisor);
      pixels[offset + 1] = Math.round(g / divisor);
      pixels[offset + 2] = Math.round(b / divisor);
      pixels[offset + 3] = Math.round(alpha);
    }
  }
  return encodePng(size, pixels);
}

await mkdir(outputDir, { recursive: true });
for (const size of sizes) {
  await writeFile(resolve(outputDir, `icon${size}.png`), generateIcon(size));
}
console.log(`Generated ${sizes.length} icons in public/icons.`);
