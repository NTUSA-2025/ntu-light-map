import { assetUrl } from './config.js';
import { dom } from './dom.js';
import { state } from './state.js';
import { escapeHtml } from './utils.js';

const L = window.L;

const CAMPUS_CENTER = [25.0168654, 121.53955895];
const CAMPUS_BOUNDS = [
  [25.0115824, 121.5329385],
  [25.0221484, 121.5461794]
];

export const map = L.map('map', {
  zoomControl: false,
  minZoom: 14,
  maxBounds: L.latLngBounds(CAMPUS_BOUNDS),
  maxBoundsViscosity: 0.85
}).setView(CAMPUS_CENTER, 15);

function waitForMapLayout() {
  return new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

function fitCampusBounds(bounds) {
  map.invalidateSize();
  map.fitBounds(bounds, { padding: [20, 20], maxZoom: 16 });
}

map.createPane('brightnessPane'); map.getPane('brightnessPane').style.zIndex = 350;
map.createPane('safetyPane');     map.getPane('safetyPane').style.zIndex = 300;
map.createPane('protectPane');    map.getPane('protectPane').style.zIndex = 250;
map.createPane('incidentPane');   map.getPane('incidentPane').style.zIndex = 400;

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19
}).addTo(map);

export const layerMap = {};
export const incidentHexLayer = L.layerGroup().addTo(map);
layerMap.incident = incidentHexLayer;

export function makeToggle(id, layerKey) {
  const btn = document.getElementById(id);
  btn.addEventListener('click', () => {
    btn.classList.toggle('off');
    btn.setAttribute('aria-pressed', String(!btn.classList.contains('off')));
    const layer = layerMap[layerKey];
    if (!layer) return;
    if (btn.classList.contains('off')) map.removeLayer(layer);
    else layer.addTo(map);
  });
}

async function loadJSON(url) {
  const response = await fetch(url);
  return response.json();
}

export async function loadCampusBoundary() {
  try {
    const response = await fetch(assetUrl('/data/ntu_area.geojson'));
    if (!response.ok) throw new Error(`boundary_http_${response.status}`);
    const geo = await response.json();
    const ntuLine = L.geoJSON(geo, {
      style: { color: '#eef2f7', weight: 1.05, opacity: 0.9 }
    }).addTo(map);
    await waitForMapLayout();
    fitCampusBounds(ntuLine.getBounds());
  } catch (error) {
    console.error('campus_boundary_load_failed', error);
    await waitForMapLayout();
    map.invalidateSize();
    map.setView(CAMPUS_CENTER, 15);
  }
}

export async function loadMapLayers(onSelectReportHex, hexTooltip) {
  const geoBrightness = await loadJSON(assetUrl('/data/merge_sur_zhoushan.geojson'));
  const rawVals = geoBrightness.features
    .map(feature => Number(feature.properties?.brightness_filled))
    .filter(value => Number.isFinite(value) && value >= 0);

  if (!rawVals.length) return;

  const ramp = ['#0b1020', '#1f2a5a', '#2f6f9f', '#6fd0c2', '#f3f6ff'];
  const getColor = value => !Number.isFinite(value)
    ? '#7b8492'
    : value <= 1 ? ramp[0]
    : value <= 12 ? ramp[1]
    : value <= 29 ? ramp[2]
    : value <= 54 ? ramp[3]
    : ramp[4];

  const brightLayer = L.geoJSON(geoBrightness, {
    pane: 'brightnessPane',
    style: feature => ({
      color: 'rgba(6,10,18,.55)',
      weight: 0.25,
      fillColor: getColor(Number(feature.properties?.brightness_filled)),
      fillOpacity: 0.9
    }),
    onEachFeature: (feature, layer) => {
      const value = Number(feature.properties?.brightness_filled);
      const id = feature.properties?.id ?? '-';
      layer.on('mouseover', () => {
        hexTooltip.textContent = `Hex ${id}  ·  ${Number.isFinite(value) ? value.toFixed(2) : 'N/A'} lux`;
        hexTooltip.classList.add('show');
      });
      layer.on('mouseout', () => hexTooltip.classList.remove('show'));
      layer.bindPopup(`<div style="font:12px/1.5 system-ui;min-width:120px;"><b style="font-size:13px">Hex ${escapeHtml(String(id))}</b><br><span style="background:#f1f5fb;padding:3px 6px;border-radius:5px;display:inline-block;margin-top:4px;">${Number.isFinite(value) ? value.toFixed(2) : 'N/A'} lux</span></div>`);
    }
  }).addTo(map);
  layerMap.brightness = brightLayer;

  const geoSafety = await loadJSON(assetUrl('/data/hex_hit_with_safe.geojson'));
  const safeColor = score => score === 1 ? '#7bcfa1' : score === 2 ? '#e6c07a' : score === 3 ? '#e08a8a' : '#8aa2d6';
  const safetyLayer = L.geoJSON(geoSafety, {
    pane: 'safetyPane',
    style: feature => ({
      color: safeColor(Number(feature.properties?.safe_worst)),
      weight: 1.05,
      opacity: 0.9,
      fillOpacity: 0,
      fill: false
    }),
    onEachFeature: (feature, layer) => {
      const id = feature.properties?.id ?? '-';
      layer.bindPopup(`<div style="font:12px/1.5 system-ui;"><b>Hex ${escapeHtml(String(id))}</b><br>safe_worst: ${feature.properties?.safe_worst}<br>safe_mean: ${feature.properties?.safe_mean != null ? Number(feature.properties.safe_mean).toFixed(2) : 'N/A'}</div>`);
    }
  }).addTo(map);
  layerMap.safety = safetyLayer;

  const geoProtect = await loadJSON(assetUrl('/data/protect_square_4326.geojson'));
  const protectLayer = L.geoJSON(geoProtect, {
    pane: 'protectPane',
    style: { color: '#b79af5', fillColor: '#b79af5', fillOpacity: 0.18, weight: 0 }
  }).addTo(map);
  layerMap.protect = protectLayer;

  const geoReport = await loadJSON(assetUrl('/data/report_hex_4326.geojson'));
  state.reportHexFeatureById.clear();
  geoReport.features.forEach(feature => {
    const id = Number(feature.properties?.id);
    if (Number.isInteger(id)) state.reportHexFeatureById.set(id, feature);
  });

  state.reportHexLayer = L.geoJSON(geoReport, {
    pane: 'incidentPane',
    style: {
      color: '#f1f6f4',
      weight: 0.8,
      opacity: 0.42,
      fillColor: '#9ce7d8',
      fillOpacity: 0.035
    },
    onEachFeature: (feature, layer) => {
      layer.on('click', () => onSelectReportHex(feature, layer));
      layer.on('mouseover', () => layer.setStyle({
        color: '#f0997b',
        opacity: 0.95,
        fillOpacity: 0.13,
        weight: 1.35
      }));
      layer.on('mouseout', () => layer.setStyle({
        color: '#f1f6f4',
        opacity: 0.42,
        fillOpacity: 0.035,
        weight: 0.8
      }));
    }
  });

  if (
    dom.incDialog.classList.contains('show') &&
    !dom.reportSec.classList.contains('hidden') &&
    !map.hasLayer(state.reportHexLayer)
  ) {
    state.reportHexLayer.addTo(map);
  }
}
