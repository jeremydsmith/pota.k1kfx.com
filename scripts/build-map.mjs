#!/usr/bin/env node
// One-time generator for the States Worked Map:  node scripts/build-map.mjs
//
// Downloads US state shapes from us-atlas (pinned version, already projected
// into the usual US layout with Alaska and Hawaii insets), turns each state
// into an SVG path, finds the visual middle for its 2-letter label, and writes
// map/data/states.json. The output is committed, so the site itself has no
// build step and loads no map libraries.
//
// us-atlas: ISC license, Mike Bostock. Data: US Census Bureau cartographic
// boundary files (public domain).

import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SOURCE = 'https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/states-albers-10m.json';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'map', 'data', 'states.json');

// FIPS code -> postal code. Exactly the 50 states plus DC.
const FIPS = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO', '09': 'CT',
  '10': 'DE', '11': 'DC', '12': 'FL', '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL',
  '18': 'IN', '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME', '24': 'MD',
  '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS', '29': 'MO', '30': 'MT', '31': 'NE',
  '32': 'NV', '33': 'NH', '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND',
  '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI', '45': 'SC', '46': 'SD',
  '47': 'TN', '48': 'TX', '49': 'UT', '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV',
  '55': 'WI', '56': 'WY',
};

// Too small to label on the map: these get a tappable box off the East Coast.
const BOXED = ['VT', 'NH', 'MA', 'RI', 'CT', 'NJ', 'DE', 'MD', 'DC'];

// Hand-placed label spots where the automatic one looks wrong (map units,
// the middle of the label). The build stops if one would poke out of its state.
const LABEL_OVERRIDE = {};

// Half the width of each label as a share of its font size, measured in the
// browser in Archivo Black (IL is narrow, WV is wide). Codes not listed use
// LABEL_HALF_W. LABEL_HALF_H is half the height of a capital letter, and
// LABEL_MARGIN is the clear space to keep between the label and the state's
// border (map units).
const LABEL_WIDTHS = {
  AL: 0.72, AK: 0.81, AZ: 0.75, AR: 0.78, CA: 0.78, CO: 0.81, FL: 0.67, GA: 0.81, HI: 0.61,
  ID: 0.58, IL: 0.53, IN: 0.61, IA: 0.59, KS: 0.78, KY: 0.81, LA: 0.73, ME: 0.83, MI: 0.67,
  MN: 0.89, MS: 0.83, MO: 0.89, MT: 0.83, NE: 0.78, NV: 0.81, NM: 0.89, NY: 0.81, NC: 0.81,
  ND: 0.81, OH: 0.83, OK: 0.84, OR: 0.81, PA: 0.71, SC: 0.75, SD: 0.75, TN: 0.78, TX: 0.76,
  UT: 0.78, VA: 0.76, WA: 0.89, WV: 0.89, WI: 0.69, WY: 0.89,
};
const LABEL_HALF_W = 0.9, LABEL_HALF_H = 0.4, LABEL_MARGIN = 2;

const res = await fetch(SOURCE);
if (!res.ok) throw new Error(`Download failed: ${res.status} ${SOURCE}`);
const topo = await res.json();

// ── TopoJSON decoding (just enough for polygons) ──
const tf = topo.transform;
const arcs = topo.arcs.map((arc) => {
  let x = 0, y = 0;
  return arc.map(([a, b]) => {
    if (!tf) return [a, b];
    x += a; y += b;
    return [x * tf.scale[0] + tf.translate[0], y * tf.scale[1] + tf.translate[1]];
  });
});
function ring(indexes) {
  const pts = [];
  for (const i of indexes) {
    const arc = i < 0 ? arcs[~i].slice().reverse() : arcs[i];
    arc.forEach((p, k) => { if (k > 0 || pts.length === 0) pts.push(p); });
  }
  return pts;
}
function polygons(geom) {
  if (geom.type === 'Polygon') return [geom.arcs.map(ring)];
  if (geom.type === 'MultiPolygon') return geom.arcs.map((poly) => poly.map(ring));
  return [];
}

// ── Geometry helpers ──
function area(r) {
  let s = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]);
  return Math.abs(s / 2);
}
const r1 = (n) => Math.round(n * 10) / 10;
function pathD(polys) {
  let d = '';
  for (const poly of polys) {
    for (const r of poly) {
      let last = '';
      const parts = [];
      for (const [x, y] of r) {
        const s = `${r1(x)} ${r1(y)}`;
        if (s !== last) parts.push(s);
        last = s;
      }
      if (parts.length > 2) d += 'M' + parts.join(' ') + 'Z';
    }
  }
  return d;
}
function bbox(polys) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const poly of polys) for (const [x, y] of poly[0]) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return [x0, y0, x1, y1];
}

// Pole of inaccessibility: the point inside a polygon farthest from its edges.
// (Same idea as mapbox/polylabel, ISC.) Returns [x, y, distance].
function polylabel(poly, precision = 0.5) {
  const [minX, minY, maxX, maxY] = bbox([poly]);
  const w = maxX - minX, h = maxY - minY;
  const size = Math.min(w, h);
  if (size === 0) return [minX, minY, 0];
  const cells = [];
  const cell = (x, y, half) => {
    const d = pointDist(x, y, poly);
    return { x, y, half, d, max: d + half * Math.SQRT2 };
  };
  for (let x = minX; x < maxX; x += size) for (let y = minY; y < maxY; y += size) {
    cells.push(cell(x + size / 2, y + size / 2, size / 2));
  }
  let best = cell(minX + w / 2, minY + h / 2, 0);
  while (cells.length) {
    cells.sort((a, b) => a.max - b.max);
    const c = cells.pop();
    if (c.d > best.d) best = c;
    if (c.max - best.d <= precision) continue;
    const q = c.half / 2;
    cells.push(cell(c.x - q, c.y - q, q), cell(c.x + q, c.y - q, q), cell(c.x - q, c.y + q, q), cell(c.x + q, c.y + q, q));
  }
  return [best.x, best.y, best.d];
}
function pointDist(x, y, poly) {
  let inside = false, min = Infinity;
  for (const r of poly) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const a = r[i], b = r[j];
      if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
      min = Math.min(min, segDist(x, y, a, b));
    }
  }
  return (inside ? 1 : -1) * min;
}
function segDist(px, py, a, b) {
  let x = a[0], y = a[1];
  let dx = b[0] - x, dy = b[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = Math.max(0, Math.min(1, ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy)));
    x += dx * t; y += dy * t;
  }
  return Math.hypot(px - x, py - y);
}

// Area centroid of a polygon (outer ring minus holes): where the eye puts the
// middle of a shape.
function centroid(poly) {
  let a = 0, cx = 0, cy = 0;
  poly.forEach((r, k) => {
    let ra = 0, rx = 0, ry = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const f = r[j][0] * r[i][1] - r[i][0] * r[j][1];
      ra += f; rx += (r[j][0] + r[i][0]) * f; ry += (r[j][1] + r[i][1]) * f;
    }
    const sign = (k === 0 ? 1 : -1) * Math.sign(ra);
    a += sign * ra; cx += sign * rx; cy += sign * ry;
  });
  return [cx / (3 * a), cy / (3 * a)];
}
// How far the label's box at (x, y) stays from the border: negative if it pokes out.
function labelRoom(x, y, size, poly, code) {
  const hw = size * (LABEL_WIDTHS[code] || LABEL_HALF_W), hh = size * LABEL_HALF_H;
  let min = Infinity;
  for (let i = -4; i <= 4; i++) for (let j = -2; j <= 2; j++) {
    if (Math.abs(i) !== 4 && Math.abs(j) !== 2) continue; // edge of the box only
    min = Math.min(min, pointDist(x + (hw * i) / 4, y + (hh * j) / 2, poly));
  }
  return min;
}
// The label goes at the area centroid (the visual middle). If the label would
// not fit there (Florida, Louisiana, Idaho ...) it slides toward the pole of
// inaccessibility, the roomiest spot, and stops as soon as it fits. If it does
// not fit even there (West Virginia, Hawaii) the text shrinks until it does.
// Returns [x, y, share of the way slid, font size].
function labelSpot(poly, size, pole, code) {
  const [cx, cy] = centroid(poly);
  const STEPS = 40;
  for (let k = 0; k <= STEPS; k++) {
    const t = k / STEPS;
    const x = cx + (pole[0] - cx) * t, y = cy + (pole[1] - cy) * t;
    if (labelRoom(x, y, size, poly, code) >= LABEL_MARGIN) return [x, y, t, size];
  }
  while (size > 8 && labelRoom(pole[0], pole[1], size, poly, code) < LABEL_MARGIN) size = Math.max(8, size - 0.5);
  return [pole[0], pole[1], 1, size];
}

// ── Build ──
const geoms = topo.objects.states.geometries;
const states = [];
const seen = new Set();
const bounds = {};
const report = [];
for (const g of geoms) {
  const code = FIPS[String(g.id).padStart(2, '0')];
  if (!code) continue;
  seen.add(code);
  let polys = polygons(g);
  // The far western Aleutian specks land left of the map's edge; leave them off.
  if (code === 'AK') polys = polys.filter((p) => bbox([p])[2] > -2);
  bounds[code] = bbox(polys);
  // Label goes in the biggest piece (Michigan's lower peninsula, Hawaii's Big Island).
  const main = polys.reduce((a, b) => (area(b[0]) > area(a[0]) ? b : a));
  const pole = polylabel(main);
  const dist = pole[2];
  let size = r1(Math.max(8, Math.min(20, dist * 1.1)));
  const boxed = BOXED.includes(code);
  // Boxed states show no label on the map; their point is where the leader
  // line ends, so the roomiest spot is the right one.
  let [lx, ly, slid] = [pole[0], pole[1], 1];
  if (!boxed) [lx, ly, slid, size] = labelSpot(main, size, pole, code);
  if (LABEL_OVERRIDE[code]) {
    [lx, ly] = LABEL_OVERRIDE[code];
    if (!boxed && labelRoom(lx, ly, size, main, code) < 0) throw new Error(`LABEL_OVERRIDE for ${code} pokes out of the state`);
  }
  report.push(`${code} ${r1(lx)},${r1(ly)} size ${size} room ${r1(labelRoom(lx, ly, size, main, code))}${boxed ? ' (boxed)' : slid ? ` slid ${Math.round(slid * 100)}% to pole` : ''}`);
  states.push({
    code,
    name: g.properties?.name || code,
    d: pathD(polys),
    label: [r1(lx), r1(ly)],
    size,
    boxed,
  });
}
const missing = Object.values(FIPS).filter((c) => !seen.has(c));
if (missing.length) throw new Error('Missing states: ' + missing.join(', '));
states.sort((a, b) => a.name.localeCompare(b.name));

// Frames around the Alaska and Hawaii insets.
const pad = 8;
const frame = (c) => {
  const [x0, y0, x1, y1] = bounds[c];
  return { code: c, x: r1(x0 - pad), y: r1(y0 - pad), w: r1(x1 - x0 + pad * 2), h: r1(y1 - y0 + pad * 2) };
};

const data = {
  source: SOURCE,
  license: 'us-atlas: ISC (Mike Bostock). Shapes: US Census Bureau, public domain.',
  width: 975,
  height: 610,
  insets: [frame('AK'), frame('HI')],
  states,
};
await mkdir(path.dirname(out), { recursive: true });
const json = JSON.stringify(data);
await writeFile(out, json + '\n');
if (process.argv.includes('--report')) console.log(report.sort().join('\n'));
console.log(`Wrote ${path.relative(root, out)}: ${states.length} shapes, ${(json.length / 1024).toFixed(0)} KB`);
