import fs from "node:fs";

const SOURCE_PATH = "data/report_hex_cells_4326.geojson";
const OUTPUT_PATH = "data/report_hex_4326.geojson";
const MEMBERS_PATH = "data/report_hex_members.json";
const VALID_IDS_MODULE_PATH = "functions/_shared/reportHexIds.js";

const CLOSED_NEIGHBORHOOD = [
  [0, 0],
  [1, 0],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [0, -1],
  [1, -1],
];

function mod(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function offsetToAxial(col, row) {
  return {
    q: col,
    r: row - (col - mod(col, 2)) / 2,
  };
}

function axialToOffset(q, r) {
  return {
    col: q,
    row: r + (q - mod(q, 2)) / 2,
  };
}

function reportClusterColor({ q, r }) {
  return mod(q + 3 * r, 7);
}

function reportClusterCenter(axial) {
  for (const [dq, dr] of CLOSED_NEIGHBORHOOD) {
    const candidate = { q: axial.q + dq, r: axial.r + dr };
    if (reportClusterColor(candidate) === 0) return candidate;
  }
  throw new Error(`No report cluster center found for ${axial.q},${axial.r}`);
}

function pointKey(point) {
  return point.map((value) => Number(value).toFixed(10)).join(",");
}

function edgeKey(aKey, bKey) {
  return aKey < bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`;
}

function collectBoundaryEdges(features) {
  const edges = new Map();

  for (const feature of features) {
    const ring = feature.geometry.coordinates[0];
    for (let index = 0; index < ring.length - 1; index += 1) {
      const a = ring[index];
      const b = ring[index + 1];
      const aKey = pointKey(a);
      const bKey = pointKey(b);
      const key = edgeKey(aKey, bKey);
      if (edges.has(key)) {
        edges.delete(key);
      } else {
        edges.set(key, { a, b, aKey, bKey });
      }
    }
  }

  return [...edges.values()];
}

function boundaryLoops(features) {
  const edges = collectBoundaryEdges(features);
  const adjacency = new Map();
  edges.forEach((edge, index) => {
    for (const key of [edge.aKey, edge.bKey]) {
      if (!adjacency.has(key)) adjacency.set(key, []);
      adjacency.get(key).push(index);
    }
  });

  const unused = new Set(edges.map((_, index) => index));
  const loops = [];

  while (unused.size > 0) {
    const firstIndex = unused.values().next().value;
    unused.delete(firstIndex);

    const first = edges[firstIndex];
    const startKey = first.aKey;
    let currentKey = first.bKey;
    const loop = [first.a, first.b];

    while (currentKey !== startKey) {
      const nextIndex = (adjacency.get(currentKey) || []).find((index) => unused.has(index));
      if (nextIndex == null) {
        throw new Error(`Open report cluster boundary near ${currentKey}`);
      }

      unused.delete(nextIndex);
      const edge = edges[nextIndex];
      const nextPoint = edge.aKey === currentKey ? edge.b : edge.a;
      currentKey = edge.aKey === currentKey ? edge.bKey : edge.aKey;
      loop.push(nextPoint);
    }

    loops.push(loop);
  }

  return loops;
}

function bounds(features) {
  const values = features.flatMap((feature) => feature.geometry.coordinates[0].slice(0, -1));
  const lngs = values.map(([lng]) => lng);
  const lats = values.map(([, lat]) => lat);
  return {
    min_lng: Math.min(...lngs),
    min_lat: Math.min(...lats),
    max_lng: Math.max(...lngs),
    max_lat: Math.max(...lats),
  };
}

const source = JSON.parse(fs.readFileSync(SOURCE_PATH, "utf8"));
const groupsByCenter = new Map();

for (const feature of source.features) {
  const { id, col_index: col, row_index: row } = feature.properties;
  const axial = offsetToAxial(col, row);
  const center = reportClusterCenter(axial);
  const centerOffset = axialToOffset(center.q, center.r);
  const key = `${center.q},${center.r}`;

  if (!groupsByCenter.has(key)) {
    groupsByCenter.set(key, {
      center,
      centerOffset,
      features: [],
    });
  }

  groupsByCenter.get(key).features.push(feature);
}

const groups = [...groupsByCenter.values()]
  .sort((a, b) => {
    if (a.centerOffset.col !== b.centerOffset.col) return a.centerOffset.col - b.centerOffset.col;
    return a.centerOffset.row - b.centerOffset.row;
  });

const members = {};
const outputFeatures = groups.map((group, index) => {
  const id = index + 1;
  const memberIds = group.features
    .map((feature) => Number(feature.properties.id))
    .sort((a, b) => a - b);
  const loops = boundaryLoops(group.features);
  const geometry = loops.length === 1
    ? { type: "Polygon", coordinates: loops }
    : { type: "MultiPolygon", coordinates: loops.map((loop) => [loop]) };

  members[id] = memberIds;

  return {
    type: "Feature",
    properties: {
      id,
      member_count: memberIds.length,
      member_ids: memberIds,
      center_col_index: group.centerOffset.col,
      center_row_index: group.centerOffset.row,
      ...bounds(group.features),
    },
    geometry,
  };
});

const output = {
  type: "FeatureCollection",
  name: "report_hex_4326",
  crs: source.crs,
  features: outputFeatures,
};

fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output)}\n`);
fs.writeFileSync(MEMBERS_PATH, `${JSON.stringify(members, null, 2)}\n`);
fs.writeFileSync(
  VALID_IDS_MODULE_PATH,
  [
    "export const REPORT_HEX_IDS = new Set([",
    outputFeatures.map((feature) => `  ${feature.properties.id},`).join("\n"),
    "]);",
    "",
  ].join("\n"),
);

console.log(`Wrote ${outputFeatures.length} report hex clusters to ${OUTPUT_PATH}`);
