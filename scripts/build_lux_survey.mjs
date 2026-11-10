import fs from "node:fs";
import path from "node:path";

// Raw survey CSVs stay out of git (reference/ is ignored); only aggregated outputs are committed.
const SURVEY_DIRECTORY = "reference/survey";
const ROAD_HEX_PATH = "data/hex_hit_with_safe.geojson";
const HEX_OUTPUT_PATH = "data/lux_survey_hexes.geojson";
const TRACK_OUTPUT_PATH = "data/lux_survey_track.geojson";
const EARTH_RADIUS = 6378137;
const RADIANS = Math.PI / 180;
// Power-law fit of the ESP32 sensor against a reference lux meter (8 paired readings, 4.6–395 lux):
// real = 1.166 * raw^0.910. Raw 0 means below the 0.46 lux step and stays 0.
const CALIBRATION_SCALE = 1.1659;
const CALIBRATION_EXPONENT = 0.9103;
const MAX_SNAP_METERS = 25;
const CELL_PROPERTIES = [
  "id", "left", "top", "right", "bottom", "row_index", "col_index",
];
const CRS = {
  type: "name",
  properties: { name: "urn:ogc:def:crs:OGC:1.3:CRS84" },
};
const counts = {
  rows: 0,
  nonFinite: 0,
  negativeLux: 0,
  accuracy: 0,
  dropout: 0,
  assigned: 0,
  unassigned: 0,
};

function number(value) {
  return value === undefined || value.trim() === "" ? NaN : Number(value);
}

function round(value, decimals = 2) {
  return Number(value.toFixed(decimals));
}

function readSurvey(filePath) {
  const lines = fs.readFileSync(filePath, "utf8").trim().split(/\r?\n/);
  const columns = Object.fromEntries(
    lines[0].split(",").map((name, index) => [name.trim(), index]),
  );
  const rows = [];
  for (const line of lines.slice(1)) {
    if (line.trim() === "") continue;
    counts.rows += 1;
    const values = line.split(",");
    const latitude = number(values[columns.latitude]);
    const longitude = number(values[columns.longitude]);
    const lux = number(values[columns.lux]);
    const accuracy = number(values[columns.accuracy_m]);
    if (![latitude, longitude, lux].every(Number.isFinite)) {
      counts.nonFinite += 1;
      continue;
    }
    if (lux < 0) {
      counts.negativeLux += 1;
      continue;
    }
    if (accuracy > 15) {
      counts.accuracy += 1;
      continue;
    }
    rows.push({
      latitude,
      longitude,
      lux,
      t: values[columns.recorded_at_taipei],
      time: Date.parse(values[columns.recorded_at]),
    });
  }
  rows.sort((a, b) => a.time - b.time);
  // Detect isolated dropouts simultaneously, without joining separate survey files.
  const kept = rows.filter((row, index) => {
    if (row.lux === 0 && rows[index - 1]?.lux >= 5 && rows[index + 1]?.lux >= 5) {
      counts.dropout += 1;
      return false;
    }
    return true;
  });
  // Cleaning thresholds above apply to raw sensor values; convert only the kept rows.
  return kept.map((row) => ({ ...row, lux: calibrate(row.lux) }));
}

function calibrate(rawLux) {
  return CALIBRATION_SCALE * rawLux ** CALIBRATION_EXPONENT;
}

function mercator(longitude, latitude) {
  return {
    x: EARTH_RADIUS * longitude * RADIANS,
    y: EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + latitude * RADIANS / 2)),
  };
}

function contains(hex, x, y) {
  const dx = Math.abs(x - hex.x);
  const dy = Math.abs(y - hex.y);
  const epsilon = 1e-7;
  // The diagonal edges clip the two corners of each bounding-box half.
  return dx <= hex.width / 2 + epsilon
    && dy <= hex.height / 2 + epsilon
    && dx + dy * hex.width / (2 * hex.height) <= hex.width / 2 + epsilon;
}

function assignHex(point, hexes) {
  const { x, y } = mercator(point.longitude, point.latitude);
  let nearest = null;
  let nearestDistanceSquared = Infinity;
  for (const hex of hexes) {
    if (contains(hex, x, y)) return hex;
    const distanceSquared = (x - hex.x) ** 2 + (y - hex.y) ** 2;
    if (distanceSquared < nearestDistanceSquared) {
      nearest = hex;
      nearestDistanceSquared = distanceSquared;
    }
  }
  // 25 m covers sidewalks on both sides of wide roads (椰林大道 sidewalks sit up to ~21 m from the nearest centre hex).
  return Math.sqrt(nearestDistanceSquared) * Math.cos(point.latitude * RADIANS) <= MAX_SNAP_METERS
    ? nearest
    : null;
}

function writeCollection(filePath, name, features) {
  fs.writeFileSync(filePath, [
    "{",
    '"type": "FeatureCollection",',
    `"name": ${JSON.stringify(name)},`,
    `"crs": ${JSON.stringify(CRS)},`,
    '"features": [',
    features.map((feature) => JSON.stringify(feature)).join(",\n"),
    "]",
    "}",
    "",
  ].join("\n"));
}

const hexes = JSON.parse(fs.readFileSync(ROAD_HEX_PATH, "utf8")).features
  .sort((a, b) => a.properties.id - b.properties.id)
  .map((feature) => {
    const { left, top, right, bottom } = feature.properties;
    return {
      feature,
      x: (left + right) / 2,
      y: (top + bottom) / 2,
      width: right - left,
      height: top - bottom,
      sum: 0,
      count: 0,
    };
  });
const points = fs.readdirSync(SURVEY_DIRECTORY)
  .filter((file) => file.endsWith(".csv"))
  .sort()
  .flatMap((file) => readSurvey(path.join(SURVEY_DIRECTORY, file)))
  .sort((a, b) => a.time - b.time);

for (const point of points) {
  const hex = assignHex(point, hexes);
  if (hex) {
    hex.sum += point.lux;
    hex.count += 1;
    counts.assigned += 1;
  } else {
    counts.unassigned += 1;
  }
}

const observed = hexes.filter((hex) => hex.count > 0);
const brightnessFeatures = [];
let knnCount = 0;
for (const hex of hexes) {
  let value;
  if (hex.count > 0) {
    value = hex.sum / hex.count;
  } else {
    let weightedSum = 0;
    let weightSum = 0;
    // Only original observations can contribute; filled cells never propagate.
    for (const neighbour of observed) {
      const distance = Math.hypot(hex.x - neighbour.x, hex.y - neighbour.y);
      if (distance > 1.05 * hex.height) continue;
      const weight = 1 / distance;
      weightedSum += (neighbour.sum / neighbour.count) * weight;
      weightSum += weight;
    }
    if (weightSum === 0) continue;
    value = weightedSum / weightSum;
    knnCount += 1;
  }
  brightnessFeatures.push({
    type: "Feature",
    properties: {
      ...Object.fromEntries(CELL_PROPERTIES.map((key) => [key, hex.feature.properties[key]])),
      brightness_mean: hex.count > 0 ? round(value) : null,
      brightness_count: hex.count,
      brightness_filled: round(value),
      _filled_from: hex.count > 0 ? "observed" : "knn",
    },
    geometry: hex.feature.geometry,
  });
}

writeCollection(HEX_OUTPUT_PATH, "lux_survey_hexes", brightnessFeatures);
writeCollection(TRACK_OUTPUT_PATH, "lux_survey_track", points.map((point) => ({
  type: "Feature",
  properties: { t: point.t, lux: round(point.lux) },
  geometry: {
    type: "Point",
    coordinates: [round(point.longitude, 7), round(point.latitude, 7)],
  },
})));

console.log(`Rows read: ${counts.rows}`);
console.log(`Rule 1 dropped: ${counts.nonFinite + counts.negativeLux + counts.accuracy} (non-finite lat/lon/lux: ${counts.nonFinite}, negative lux: ${counts.negativeLux}, accuracy > 15 m: ${counts.accuracy})`);
console.log(`Rule 2 dropped (isolated zero dropout): ${counts.dropout}`);
console.log(`Assigned: ${counts.assigned}; unassigned: ${counts.unassigned}`);
console.log(`Observed hexes: ${observed.length}; KNN hexes: ${knnCount}`);
for (const filePath of [HEX_OUTPUT_PATH, TRACK_OUTPUT_PATH]) {
  console.log(`${filePath}: ${fs.statSync(filePath).size} bytes`);
}
