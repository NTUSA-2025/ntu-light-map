import { dom } from './dom.js';
import { state } from './state.js';
import { incidentHexLayer } from './map.js';
import { escapeHtml, incidentColor, incidentLabel, incidentStatusLabel } from './utils.js';

const L = window.L;

export function updateStatsPanel() {
  const total = state.allIncidents.length;
  const accidentCount = state.allIncidents.filter(incident => incident.type === 'accident').length;
  const harassmentCount = state.allIncidents.filter(incident => incident.type === 'harassment').length;
  const maxCount = Math.max(accidentCount, harassmentCount, 1);

  document.getElementById('stat-incident-count').innerHTML =
    `${total}<span class="stat-unit">件</span>`;
  document.getElementById('bar-accident').style.width =
    `${Math.round(accidentCount / maxCount * 100)}%`;
  document.getElementById('bar-accident-num').textContent = accidentCount;
  document.getElementById('bar-harassment').style.width =
    `${Math.round(harassmentCount / maxCount * 100)}%`;
  document.getElementById('bar-harassment-num').textContent = harassmentCount;
}

export function renderAdminIncidentList() {
  if (state.allAdminIncidents.length === 0) {
    dom.adminIncidentsList.innerHTML = '<div class="admin-status">目前沒有事件</div>';
    return;
  }

  dom.adminIncidentsList.innerHTML = state.allAdminIncidents.map(incident => {
    const isHidden = incident.status === 'hidden';
    const nextStatus = isHidden ? 'public' : 'hidden';
    const actionLabel = isHidden ? '恢復' : '封存';
    const actionClass = isHidden ? 'btn-restore' : 'btn-danger';
    return `
      <article class="admin-item ${isHidden ? 'hidden-incident' : ''}" data-incident-id="${escapeHtml(incident.id)}">
        <div class="admin-item-head">
          <div class="admin-item-title">${escapeHtml(incidentLabel(incident.type))} · #${escapeHtml(incident.id)}</div>
          <span class="admin-badge ${escapeHtml(incident.status)}">${incidentStatusLabel(incident.status)}</span>
        </div>
        <div class="admin-desc">${escapeHtml(incident.description)}</div>
        <div class="admin-meta">區域 ${escapeHtml(incident.report_hex_id)} · ${escapeHtml(incident.created_at)}</div>
        <div class="admin-actions">
          <button class="${actionClass}" data-incident-status="${nextStatus}">${actionLabel}</button>
        </div>
      </article>
    `;
  }).join('');
}

export function renderAdminUserList() {
  if (state.allAdminUsers.length === 0) {
    dom.adminUsersList.innerHTML = '<div class="admin-status">目前沒有管理員</div>';
    return;
  }

  dom.adminUsersList.innerHTML = state.allAdminUsers.map(user => `
    <article class="admin-item" data-admin-email="${escapeHtml(user.email)}">
      <div class="admin-item-head">
        <div class="admin-item-title">${escapeHtml(user.email)}</div>
        <span class="admin-badge admin-role">admin</span>
      </div>
      <div class="admin-meta">新增者 ${escapeHtml(user.created_by || '-')} · ${escapeHtml(user.created_at)}</div>
      <div class="admin-actions">
        <button class="btn-danger" data-delete-admin="${escapeHtml(user.email)}">刪除</button>
      </div>
    </article>
  `).join('');
}

export function renderIncidents() {
  incidentHexLayer.clearLayers();
  const grouped = new Map();

  state.allIncidents.forEach(incident => {
    const key = Number(incident.report_hex_id);
    if (!Number.isInteger(key)) return;
    const list = grouped.get(key) || [];
    list.push(incident);
    grouped.set(key, list);
  });

  grouped.forEach((incidents, reportHexId) => {
    const feature = state.reportHexFeatureById.get(reportHexId);
    if (!feature) return;

    const latest = incidents[0];
    const color = incidentColor(latest.type);
    const rows = incidents.slice(0, 5).map(incident => `
      <div style="border-top:1px solid rgba(15,23,42,.12); padding-top:5px; margin-top:5px;">
        <b>${escapeHtml(incidentLabel(incident.type))}</b><br/>
        ${escapeHtml(incident.description)}<br/>
        <span style="color:#64748b;">${escapeHtml(incident.created_at)}</span>
      </div>
    `).join('');

    const layer = L.geoJSON(feature, {
      pane: 'incidentPane',
      style: {
        color,
        weight: 1.4,
        opacity: 0.95,
        fillColor: color,
        fillOpacity: Math.min(0.62, 0.28 + incidents.length * 0.08)
      }
    });

    layer.bindPopup(`
      <div style="font:12px/1.5 system-ui,sans-serif; min-width:180px;">
        <b>回報區 ${reportHexId}</b><br/>
        回報數：${incidents.length}
        ${rows}
      </div>
    `);
    incidentHexLayer.addLayer(layer);
  });

  updateStatsPanel();
}
