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

function roadSegments(geometry) {
  let lines;
  if (geometry.type === "LineString") {
    lines = [geometry.coordinates];
  } else if (geometry.type === "MultiLineString") {
    lines = geometry.coordinates;
  } else {
    throw new Error(`Unsupported road geometry: ${geometry.type}`);
  }

  const segments = [];
  for (const line of lines) {
    const points = line.map(toMercator);
    for (let i = 1; i < points.length; i += 1) {
      const [ax, ay] = points[i - 1];
      const [bx, by] = points[i];
      const dx = bx - ax;
      const dy = by - ay;
      segments.push({
        ax,
        ay,
        dx,
        dy,
        length: Math.hypot(dx, dy),
        left: Math.min(ax, bx),
        right: Math.max(ax, bx),
        bottom: Math.min(ay, by),
        top: Math.max(ay, by),
      });
    }
  }
  return segments;
}

function hexRing({ left, top, right, bottom }) {
  const midY = (top + bottom) / 2;
  const width = right - left;
  return [
    [left, midY],
    [left + width / 4, top],
    [left + width * 3 / 4, top],
    [right, midY],
    [left + width * 3 / 4, bottom],
    [left + width / 4, bottom],
    [left, midY],
  ];
}

function clippedLength(segment, edges) {
  let enter = 0;
  let leave = 1;

  // The ring is clockwise: each interior half-plane has cross(edge, point) <= 0.
  for (const { x, y, dx, dy } of edges) {
    const distance = dx * (segment.ay - y) - dy * (segment.ax - x);
    const rate = dx * segment.dy - dy * segment.dx;
    if (rate === 0) {
      if (distance > 0) return null;
      continue;
    }

    const crossing = -distance / rate;
    if (rate < 0) {
      enter = Math.max(enter, crossing);
    } else {
      leave = Math.min(leave, crossing);
    }
    if (enter > leave) return null;
  }

  // A zero-length intersection still counts as a hit at an edge or vertex.
  return (leave - enter) * segment.length;
}

const roadGeojson = JSON.parse(fs.readFileSync(ROAD_PATH, "utf8"));
const cellGeojson = JSON.parse(fs.readFileSync(CELL_PATH, "utf8"));
const roads = roadGeojson.features.map((road) => ({
  safety: Number(road.properties.safety),
  segments: roadSegments(road.geometry),
}));
const features = [];

for (const cell of cellGeojson.features) {
  const { left, top, right, bottom } = cell.properties;
  const ring = hexRing(cell.properties);
  const edges = ring.slice(0, -1).map(([x, y], index) => ({
    x,
    y,
    dx: ring[index + 1][0] - x,
    dy: ring[index + 1][1] - y,
  }));
  let worst = -Infinity;
  let safetySum = 0;
  let hitCount = 0;
  let totalLength = 0;
  let weightedSafety = 0;

  for (const road of roads) {
    let hit = false;
    let roadLength = 0;
    for (const segment of road.segments) {
      if (
        segment.right < left || segment.left > right ||
        segment.top < bottom || segment.bottom > top
      ) continue;

      const length = clippedLength(segment, edges);
      if (length !== null) {
        hit = true;
        roadLength += length;
      }
    }
    if (!hit) continue;

    worst = Math.max(worst, road.safety);
    safetySum += road.safety;
    hitCount += 1;
    totalLength += roadLength;
    weightedSafety += road.safety * roadLength;
  }

  if (hitCount === 0) continue;
  features.push({
    type: "Feature",
    properties: {
      ...cell.properties,
      safe_worst: worst,
      safe_mean: totalLength > 0 ? weightedSafety / totalLength : safetySum / hitCount,
    },
    geometry: cell.geometry,
  });
}

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
