#!/usr/bin/env node
// One-time generator for the States Worked Map home-screen icons:
//   node scripts/make-icon.mjs
// Draws a black check mark on green (the map's "reached" color) and writes
// map/icon-192.png, map/icon-512.png and map/icon.svg. No packages needed.
import { writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'map');
const GREEN = [0x22, 0xc5, 0x5e], INK = [0x0e, 0x0e, 0x0e];
// Check mark in a 100x100 box, kept inside the maskable safe zone.
const CHECK = [[29, 52], [44, 67], [72, 35]];
const STROKE = 11; // half-width

function segDist(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

function png(size) {
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3);
    for (let x = 0; x < size; x++) {
      const u = ((x + 0.5) / size) * 100, v = ((y + 0.5) / size) * 100;
      const d = Math.min(segDist(u, v, CHECK[0], CHECK[1]), segDist(u, v, CHECK[1], CHECK[2]));
      const a = Math.max(0, Math.min(1, (STROKE - d) * (size / 100) + 0.5)); // anti-aliased edge
      for (let c = 0; c < 3; c++) row[1 + x * 3 + c] = Math.round(GREEN[c] * (1 - a) + INK[c] * a);
    }
    rows.push(row);
  }
  const chunk = (type, body) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
    const td = Buffer.concat([Buffer.from(type), body]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#22c55e"/><path d="M${CHECK.map((p) => p.join(' ')).join(' L')}" fill="none" stroke="#0e0e0e" stroke-width="${STROKE * 2}" stroke-linecap="round" stroke-linejoin="round"/></svg>\n`;

await writeFile(path.join(dir, 'icon-192.png'), png(192));
await writeFile(path.join(dir, 'icon-512.png'), png(512));
await writeFile(path.join(dir, 'icon.svg'), svg);
console.log('Wrote map/icon-192.png, map/icon-512.png, map/icon.svg');
