import fs from "node:fs";

const R = 6378137;
const ROWS_PER_COL = 89;
const AREA_PATH = "data/ntu_area.geojson";
const REFERENCE_HEX_PATH = "data/hex_hit_with_safe.geojson";
const EXTRA_HEX_PATHS = [
  "data/hex_hit_with_safe.geojson",
  "data/merge_sur_zhoushan.geojson",
];
const OUTPUT_PATH = "data/report_hex_4326.geojson";

function toMercator([lon, lat]) {
  return [
    R * lon * Math.PI / 180,
    R * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)),
  ];
}

function toLonLat([x, y]) {
  return [
    x / R * 180 / Math.PI,
    (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * 180 / Math.PI,
  ];
}

function key(point) {
  return point.map((value) => value.toFixed(7)).join(",");
}

function buildBoundaryRing(areaGeojson) {
  const edges = areaGeojson.features.map((feature, index) => {
    const coords = feature.geometry.coordinates;
    return {
      index,
      start: key(coords[0]),
      end: key(coords[coords.length - 1]),
      coords,
    };
  });

  const adjacency = new Map();
  edges.forEach((edge) => {
    for (const endpoint of [edge.start, edge.end]) {
      if (!adjacency.has(endpoint)) adjacency.set(endpoint, []);
      adjacency.get(endpoint).push(edge);
    }
  });

  const used = new Set();
  const ring = [];
  let edge = edges[0];
  let cursor = edge.start;

  while (edge && !used.has(edge.index)) {
    used.add(edge.index);
    let segment;
    if (edge.start === cursor) {
      segment = edge.coords;
      cursor = edge.end;
    } else {
      segment = [...edge.coords].reverse();
      cursor = edge.start;
    }

    ring.push(...(ring.length ? segment.slice(1) : segment));
    edge = adjacency.get(cursor).find((candidate) => !used.has(candidate.index));
  }

  if (key(ring[0]) !== key(ring[ring.length - 1])) {
    throw new Error("NTU boundary did not form a closed ring");
  }

  return ring;
}

function pointInRing(point, ring) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = ((yi > y) !== (yj > y))
      && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function lineIntersects(a, b, c, d) {
  function orient(p, q, r) {
    return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  }

  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  return (o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0);
}

function polygonIntersectsRing(hex, ring) {
  if (hex.some((point) => pointInRing(point, ring))) return true;
  if (ring.some((point) => pointInRing(point, hex))) return true;

  for (let i = 0; i < hex.length - 1; i += 1) {
    for (let j = 0; j < ring.length - 1; j += 1) {
      if (lineIntersects(hex[i], hex[i + 1], ring[j], ring[j + 1])) return true;
    }
  }
  return false;
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => a - b);
}

function deriveGrid(referenceGeojson) {
  const features = referenceGeojson.features;
  const sample = features[0].properties;
  const width = sample.right - sample.left;
  const height = sample.top - sample.bottom;

  const columns = uniqueSorted(features.map((feature) => feature.properties.col_index));
  const leftByCol = new Map();
  features.forEach((feature) => {
    const { col_index: col, left } = feature.properties;
    if (!leftByCol.has(col)) leftByCol.set(col, left);
  });

  const xSteps = columns.slice(1)
    .filter((col, index) => leftByCol.has(columns[index]))
    .map((col, index) => leftByCol.get(col) - leftByCol.get(columns[index]));
  const xStep = xSteps.reduce((sum, value) => sum + value, 0) / xSteps.length;
  const xOrigin = sample.left - sample.col_index * xStep;

  const baseByParity = { 0: [], 1: [] };
  features.forEach((feature) => {
    const { col_index: col, row_index: row, top } = feature.properties;
    baseByParity[col % 2].push(top + row * height);
  });

  const yBaseByParity = {
    0: baseByParity[0].reduce((sum, value) => sum + value, 0) / baseByParity[0].length,
    1: baseByParity[1].reduce((sum, value) => sum + value, 0) / baseByParity[1].length,
  };

  return { width, height, xStep, xOrigin, yBaseByParity };
}

function hexMercator({ col, row, grid }) {
  const left = grid.xOrigin + col * grid.xStep;
  const right = left + grid.width;
  const top = grid.yBaseByParity[col % 2] - row * grid.height;
  const bottom = top - grid.height;
  const midY = (top + bottom) / 2;

  return {
    properties: {
      id: col * ROWS_PER_COL + row + 1,
      left,
      top,
      right,
      bottom,
      row_index: row,
      col_index: col,
    },
    ring: [
      [left, midY],
      [left + grid.width / 4, top],
      [left + grid.width * 3 / 4, top],
      [right, midY],
      [left + grid.width * 3 / 4, bottom],
      [left + grid.width / 4, bottom],
      [left, midY],
    ],
  };
}

const areaGeojson = JSON.parse(fs.readFileSync(AREA_PATH, "utf8"));
const referenceGeojson = JSON.parse(fs.readFileSync(REFERENCE_HEX_PATH, "utf8"));
const boundary = buildBoundaryRing(areaGeojson);
const boundaryMercator = boundary.map(toMercator);
const grid = deriveGrid(referenceGeojson);

const xs = boundaryMercator.map(([x]) => x);
const ys = boundaryMercator.map(([, y]) => y);
const minX = Math.min(...xs) - grid.width;
const maxX = Math.max(...xs) + grid.width;
const minY = Math.min(...ys) - grid.height;
const maxY = Math.max(...ys) + grid.height;

const minCol = Math.floor((minX - grid.xOrigin) / grid.xStep) - 1;
const maxCol = Math.ceil((maxX - grid.xOrigin) / grid.xStep) + 1;
const featureById = new Map();

for (let col = minCol; col <= maxCol; col += 1) {
  const yBase = grid.yBaseByParity[((col % 2) + 2) % 2];
  const minRow = Math.floor((yBase - maxY) / grid.height) - 1;
  const maxRow = Math.ceil((yBase - minY) / grid.height) + 1;

  for (let row = minRow; row <= maxRow; row += 1) {
    const hex = hexMercator({ col, row, grid });
    if (!polygonIntersectsRing(hex.ring, boundaryMercator)) continue;

    featureById.set(hex.properties.id, {
      type: "Feature",
      properties: hex.properties,
      geometry: {
        type: "Polygon",
        coordinates: [hex.ring.map(toLonLat)],
      },
    });
  }
}

for (const path of EXTRA_HEX_PATHS) {
  const geojson = JSON.parse(fs.readFileSync(path, "utf8"));
  for (const feature of geojson.features) {
    const {
      id,
      left,
      top,
      right,
      bottom,
      row_index,
      col_index,
    } = feature.properties;

    if (!featureById.has(id)) {
      featureById.set(id, {
        type: "Feature",
        properties: { id, left, top, right, bottom, row_index, col_index },
        geometry: feature.geometry,
      });
    }
  }
}

const features = [...featureById.values()];
const output = {
  type: "FeatureCollection",
  name: "report_hex_4326",
  crs: areaGeojson.crs,
  features: features.sort((a, b) => a.properties.id - b.properties.id),
};

fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output)}\n`);
console.log(`Wrote ${features.length} report hexes to ${OUTPUT_PATH}`);
