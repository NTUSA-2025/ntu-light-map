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



export function updateFilterUI() {
  const filter = state.incidentFilter || 'all';
  const titleEl = document.getElementById('filter-card-title');
  const legendEl = document.getElementById('incident-filter-legend');
  const tabs = document.querySelectorAll('.incident-filter-tab');

  tabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.filter === filter);
  });

  if (filter === 'all') {
    if (titleEl) titleEl.textContent = '全部事件';
    if (legendEl) {
      legendEl.innerHTML = `
        <div class="filter-legend-row">
          <div class="filter-legend-item">
            <span class="filter-legend-swatch" style="background:#ff4d6d;"></span>
            <span>上半：夜間騷擾</span>
          </div>
          <div class="filter-legend-item">
            <span class="filter-legend-swatch" style="background:#fb923c;"></span>
            <span>下半：夜間事故</span>
          </div>
        </div>
      `;
    }
  } else if (filter === 'harassment') {
    if (titleEl) titleEl.textContent = '只看夜間騷擾';
    if (legendEl) {
      legendEl.innerHTML = `
        <div class="filter-legend-row">
          <span>夜間騷擾</span>
          <div class="filter-legend-levels">
            <span class="filter-legend-level"><span class="filter-legend-swatch swatch-hex" style="background:#ff8da1;"></span>少</span>
            <span class="filter-legend-level"><span class="filter-legend-swatch swatch-hex" style="background:#ff4d6d;"></span>中</span>
            <span class="filter-legend-level"><span class="filter-legend-swatch swatch-hex" style="background:#a31638;"></span>多</span>
          </div>
        </div>
      `;
    }
  } else if (filter === 'accident') {
    if (titleEl) titleEl.textContent = '只看夜間事故';
    if (legendEl) {
      legendEl.innerHTML = `
        <div class="filter-legend-row">
          <span>夜間事故</span>
          <div class="filter-legend-levels">
            <span class="filter-legend-level"><span class="filter-legend-swatch swatch-hex" style="background:#fed7aa;"></span>少</span>
            <span class="filter-legend-level"><span class="filter-legend-swatch swatch-hex" style="background:#fb923c;"></span>中</span>
            <span class="filter-legend-level"><span class="filter-legend-swatch swatch-hex" style="background:#c2410c;"></span>多</span>
          </div>
        </div>
      `;
    }
  }
}

export function getTierColor(type, count) {
  if (type === 'harassment') {
    if (count <= 1) return '#ff8da1'; // 少
    if (count <= 2) return '#ff4d6d'; // 中
    return '#a31638';                 // 多
  }
  if (type === 'accident') {
    if (count <= 1) return '#fed7aa'; // 少
    if (count <= 2) return '#fb923c'; // 中
    return '#c2410c';                 // 多
  }
  return '#94a3b8';
}

export function renderIncidents() {
  incidentHexLayer.clearLayers();
  const filter = state.incidentFilter || 'all';
  updateFilterUI();

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

    const accidentIncidents = incidents.filter(i => i.type === 'accident');
    const harassmentIncidents = incidents.filter(i => i.type === 'harassment');

    // Filtering logic based on active tab
    if (filter === 'harassment' && harassmentIncidents.length === 0) return;
    if (filter === 'accident' && accidentIncidents.length === 0) return;

    let layer;

    if (filter === 'all' && accidentIncidents.length > 0 && harassmentIncidents.length > 0) {
      // Mixed hex: Upper half harassment, Lower half accident
      layer = L.featureGroup();
      const coords = feature.geometry.type === 'MultiPolygon' 
        ? feature.geometry.coordinates.map(poly => poly[0]) 
        : [feature.geometry.coordinates[0]];

      const upperColor = getTierColor('harassment', harassmentIncidents.length);
      const lowerColor = getTierColor('accident', accidentIncidents.length);

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
            stroke: false,
            fillColor: upperColor,
            fillOpacity: 0.95
          }).addTo(layer);
        }
        if (lowerRing.length >= 3) {
          L.polygon(lowerRing.map(pt => [pt[1], pt[0]]), {
            pane: 'incidentPane',
            renderer: incidentHexRenderer,
            stroke: false,
            fillColor: lowerColor,
            fillOpacity: 0.95
          }).addTo(layer);
        }

        function addPerimeterStrokes(ringPoly, strokeColor) {
          for (let i = 0; i < ringPoly.length - 1; i++) {
            const p1 = ringPoly[i];
            const p2 = ringPoly[i + 1];
            const isCutEdge = Math.abs(p1[1] - midLat) < 1e-9 && Math.abs(p2[1] - midLat) < 1e-9;
            if (!isCutEdge) {
              L.polyline([[p1[1], p1[0]], [p2[1], p2[0]]], {
                pane: 'incidentPane',
                renderer: incidentHexRenderer,
                color: strokeColor,
                weight: 2,
                opacity: 1,
                interactive: false
              }).addTo(layer);
            }
          }
        }

        addPerimeterStrokes(upperRing, upperColor);
        addPerimeterStrokes(lowerRing, lowerColor);
      });
    } else {
      // Single type mode or single incident on this hex
      let targetType;
      let count;
      if (filter === 'harassment') {
        targetType = 'harassment';
        count = harassmentIncidents.length;
      } else if (filter === 'accident') {
        targetType = 'accident';
        count = accidentIncidents.length;
      } else {
        // filter === 'all', but only one kind occurred here
        targetType = harassmentIncidents.length > 0 ? 'harassment' : 'accident';
        count = targetType === 'harassment' ? harassmentIncidents.length : accidentIncidents.length;
      }

      const color = getTierColor(targetType, count);

      layer = L.geoJSON(feature, {
        pane: 'incidentPane',
        renderer: incidentHexRenderer,
        style: {
          color,
          weight: 2,
          opacity: 1,
          fillColor: color,
          fillOpacity: 0.92
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
