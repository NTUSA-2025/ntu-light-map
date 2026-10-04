import { incidentTypeMeta } from './config.js';

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

export function incidentLabel(type) {
  return incidentTypeMeta[type]?.label || incidentTypeMeta.accident.label;
}

export function incidentColor(type) {
  return incidentTypeMeta[type]?.color || incidentTypeMeta.accident.color;
}
export function pointInPolygon(point, vs) {
  const x = point[0];
  const y = point[1];
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i][0];
    const yi = vs[i][1];
    const xj = vs[j][0];
    const yj = vs[j][1];
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function findReportHexForCoords(lat, lng, features) {
  const pt = [lng, lat];
  for (const feature of features) {
    const geom = feature.geometry;
    if (geom.type === 'Polygon') {
      if (pointInPolygon(pt, geom.coordinates[0])) return feature;
    } else if (geom.type === 'MultiPolygon') {
      for (const poly of geom.coordinates) {
        if (pointInPolygon(pt, poly[0])) return feature;
      }
    }
  }
  return null;
}

export function clipPolygonY(polygon, yCut, keepUpper) {
  const outputList = [];
  for (let i = 0; i < polygon.length; i++) {
    const cur = polygon[i];
    const prev = polygon[(i - 1 + polygon.length) % polygon.length];
    const curInside = keepUpper ? cur[1] >= yCut : cur[1] <= yCut;
    const prevInside = keepUpper ? prev[1] >= yCut : prev[1] <= yCut;

    if (curInside) {
      if (!prevInside) {
        const t = (yCut - prev[1]) / (cur[1] - prev[1]);
        const x = prev[0] + t * (cur[0] - prev[0]);
        outputList.push([x, yCut]);
      }
      outputList.push(cur);
    } else if (prevInside) {
      const t = (yCut - prev[1]) / (cur[1] - prev[1]);
      const x = prev[0] + t * (cur[0] - prev[0]);
      outputList.push([x, yCut]);
    }
  }
  if (outputList.length > 0) outputList.push(outputList[0]);
  return outputList;
}

