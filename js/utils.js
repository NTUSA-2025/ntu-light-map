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

