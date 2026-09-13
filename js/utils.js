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

export function incidentStatusLabel(status) {
  return status === 'hidden' ? '已封存' : '公開';
}
