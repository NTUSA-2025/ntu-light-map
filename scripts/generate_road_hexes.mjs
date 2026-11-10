import fs from "node:fs";

const R = 6378137;
const ROAD_PATH = "data/ntu_road.geojson";
const CELL_PATH = "data/report_hex_cells_4326.geojson";
const OUTPUT_PATH = "data/hex_hit_with_safe.geojson";

function toMercator([lon, lat]) {
  return [
    R * lon * Math.PI / 180,
    R * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)),
  ];
}

function roadLines(geometry) {
  if (geometry.type === "LineString") return [geometry.coordinates];
  if (geometry.type === "MultiLineString") return geometry.coordinates;
  throw new Error(`Unsupported road geometry: ${geometry.type}`);
}

// Flat-top hexes with odd columns shifted down (rows grow southward): "odd-q" offset coordinates.
function offsetToCube(col, row) {
  const q = col;
  const r = row - (col - (col & 1)) / 2;
  return [q, r, -q - r];
}

function cubeToOffset(q, r) {
  return [q, r + (q - (q & 1)) / 2];
}

function cubeRound(q, r, s) {
  let rq = Math.round(q);
  let rr = Math.round(r);
  let rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  else rs = -rq - rr;
  return [rq, rr, rs];
}

// Minimal edge-connected chain of hexes between two cells, so each road is one hex wide.
function hexLine(from, to) {
  const a = offsetToCube(...from);
  const b = offsetToCube(...to);
  const steps = Math.max(...a.map((value, index) => Math.abs(value - b[index])));
  const chain = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = steps === 0 ? 0 : i / steps;
    // A tiny nudge keeps rounding deterministic when the line runs exactly along a hex edge.
    const [q, r] = cubeRound(
      a[0] + (b[0] - a[0]) * t + 1e-6,
      a[1] + (b[1] - a[1]) * t + 1e-6,
      a[2] + (b[2] - a[2]) * t - 2e-6,
    );
    chain.push(cubeToOffset(q, r));
  }
  return chain;
}

const roadGeojson = JSON.parse(fs.readFileSync(ROAD_PATH, "utf8"));
const cells = JSON.parse(fs.readFileSync(CELL_PATH, "utf8")).features;
const cellByOffset = new Map(cells.map((cell) => [
  `${cell.properties.col_index},${cell.properties.row_index}`,
  cell,
]));
const centres = cells.map((cell) => {
  const { left, top, right, bottom } = cell.properties;
  return { cell, x: (left + right) / 2, y: (top + bottom) / 2 };
});

function cellAt([x, y]) {
  let nearest = null;
  let nearestDistance = Infinity;
  for (const centre of centres) {
    const distance = (centre.x - x) ** 2 + (centre.y - y) ** 2;
    if (distance < nearestDistance) {
      nearest = centre.cell;
      nearestDistance = distance;
    }
  }
  return [nearest.properties.col_index, nearest.properties.row_index];
}

const safetyByCell = new Map();
for (const road of roadGeojson.features) {
  // Roads surveyed but not yet rated carry `safety: null`; they add hexes without affecting safety scores.
  const safety = road.properties.safety == null ? null : Number(road.properties.safety);
  const roadCells = new Set();
  for (const line of roadLines(road.geometry)) {
    const vertices = line.map(toMercator).map(cellAt);
    for (let i = 1; i < vertices.length; i += 1) {
      for (const [col, row] of hexLine(vertices[i - 1], vertices[i])) {
        const cell = cellByOffset.get(`${col},${row}`);
        if (cell) roadCells.add(cell);
      }
    }
  }
  for (const cell of roadCells) {
    if (!safetyByCell.has(cell)) safetyByCell.set(cell, []);
    if (safety !== null) safetyByCell.get(cell).push(safety);
  }
}

const features = [...safetyByCell].map(([cell, ratings]) => ({
  type: "Feature",
  properties: {
    ...cell.properties,
    safe_worst: ratings.length ? Math.max(...ratings) : null,
    safe_mean: ratings.length ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length : null,
  },
  geometry: cell.geometry,
}));

features.sort((a, b) => a.properties.id - b.properties.id);
const output = [
  "{",
  '"type": "FeatureCollection",',
  '"name": "hex_hit_with_safe",',
  '"crs": { "type": "name", "properties": { "name": "urn:ogc:def:crs:OGC:1.3:CRS84" } },',
  '"features": [',
  features.map((feature) => JSON.stringify(feature)).join(",\n"),
  "]",
  "}",
  "",
].join("\n");
fs.writeFileSync(OUTPUT_PATH, output);
console.log(`Wrote ${features.length} road hexes to ${OUTPUT_PATH}`);
