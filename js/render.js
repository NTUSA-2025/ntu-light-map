import { dom } from './dom.js';
import { state } from './state.js';
import { incidentHexLayer, incidentHexRenderer } from './map.js';
import { escapeHtml, incidentColor, incidentLabel, clipPolygonY } from './utils.js';


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
export function renderReportList() {
  dom.reportListMeta.textContent = `${state.allIncidents.length} 件`;

  if (state.allIncidents.length === 0) {
    dom.reportList.innerHTML = '<div class="report-list-empty">目前沒有公開回報</div>';
    return;
  }

  dom.reportList.innerHTML = state.allIncidents.map(incident => `
    <article class="report-list-item">
      <div class="report-list-item-head">
        <span class="report-list-type">
          <span class="report-list-dot" style="background:${escapeHtml(incidentColor(incident.type))};"></span>
          ${escapeHtml(incidentLabel(incident.type))}
        </span>
        <time class="report-list-time">${escapeHtml(incident.created_at || '-')}</time>
      </div>
      <p class="report-list-description">${escapeHtml(incident.description || '沒有描述')}</p>
      <div class="report-list-meta">回報區 ${escapeHtml(incident.report_hex_id ?? '-')}</div>
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

    const hasAccident = incidents.some(i => i.type === 'accident');
    const hasHarassment = incidents.some(i => i.type === 'harassment');
    const isMixed = hasAccident && hasHarassment;
    const fillOpacity = Math.min(0.72, 0.42 + incidents.length * 0.08);

    let layer;
    if (isMixed) {
      // Render split upper (harassment pink #f43f5e) and lower (accident orange #ff8a5c)
      layer = L.featureGroup();
      const coords = feature.geometry.type === 'MultiPolygon' 
        ? feature.geometry.coordinates.map(poly => poly[0]) 
        : [feature.geometry.coordinates[0]];

      coords.forEach(ring => {
        const lats = ring.map(pt => pt[1]);
        const minLat = Math.min(...lats), maxLat = Math.max(...lats);
        const midLat = (minLat + maxLat) / 2;
        const openRing = ring.slice(0, -1);
        const upperRing = clipPolygonY(openRing, midLat, true);
        const lowerRing = clipPolygonY(openRing, midLat, false);

        if (upperRing.length >= 3) {
          L.polygon(upperRing.map(pt => [pt[1], pt[0]]), {
            pane: 'incidentPane',
            renderer: incidentHexRenderer,
            color: '#f43f5e',
            weight: 2,
            opacity: 1,
            fillColor: '#f43f5e',
            fillOpacity
          }).addTo(layer);
        }
        if (lowerRing.length >= 3) {
          L.polygon(lowerRing.map(pt => [pt[1], pt[0]]), {
            pane: 'incidentPane',
            renderer: incidentHexRenderer,
            color: '#ff8a5c',
            weight: 2,
            opacity: 1,
            fillColor: '#ff8a5c',
            fillOpacity
          }).addTo(layer);
        }
      });
    } else {
      const latest = incidents[0];
      const color = incidentColor(latest.type);
      layer = L.geoJSON(feature, {
        pane: 'incidentPane',
        renderer: incidentHexRenderer,
        style: {
          color,
          weight: 1.6,
          opacity: 1,
          fillColor: color,
          fillOpacity
        }
      });
    }

    const rows = incidents.slice(0, 5).map(incident => `
      <div style="border-top:1px solid rgba(15,23,42,.12); padding-top:5px; margin-top:5px;">
        <b>${escapeHtml(incidentLabel(incident.type))}</b><br/>
        ${escapeHtml(incident.description)}<br/>
        <span style="color:#64748b;">${escapeHtml(incident.created_at)}</span>
      </div>
    `).join('');

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
  renderReportList();
}
