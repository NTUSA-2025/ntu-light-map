import { dom } from './js/dom.js';
import { state } from './js/state.js';
import { map, makeToggle, loadCampusBoundary, loadMapLayers } from './js/map.js';
import { renderIncidents } from './js/render.js';
import { findReportHexForCoords } from './js/utils.js';



const L = window.L;
const {
  panel,
  btnPanel,
  btnReport,
  btnLogout,
  btnPanelClose,
  incFab,
  incFabMenu,
  incActionsGroup,
  incDialog,
  dlgClose,
  authSec,
  reportSec,
  authStatus,
  reportStatus,
  authEmail,
  authCode,
  authCodeField,
  authVerifyActions,
  btnRequestCode,
  btnVerifyCode,
  authStepEmail,
  authStepCode,
  incType,
  incTypeOptions,
  incDesc,
  incDescCount,
  reporterEmail,
  followupConsent,
  reportLocationValue,
  reportStepLocation,
  reportStepDetails,
  btnReselect,
  btnSubmit,
  btnCancel,
  hexTooltip,
  reportHint,
  btnPickCancel,
  btnPickGps,
  btnGps,
  btnEventVisibility,
  eventVisibilityLabel,
  mapInfoToggle,
  mapInfo,
  mapInfoClose,
} = dom;

function syncVisualViewport() {
  const viewport = window.visualViewport;
  if (!viewport) return;

  document.documentElement.style.setProperty(
    '--visual-viewport-height',
    `${Math.round(viewport.height)}px`,
  );
  document.documentElement.style.setProperty(
    '--visual-viewport-offset-top',
    `${Math.round(viewport.offsetTop)}px`,
  );
}

const keyboardFields = [authEmail, authCode, incDesc];

let incidentFlowPending = false;


if (window.visualViewport) {
  syncVisualViewport();
  window.visualViewport.addEventListener('resize', syncVisualViewport);
  window.visualViewport.addEventListener('scroll', syncVisualViewport);
}

keyboardFields.forEach(field => {
  field.addEventListener('focus', () => {
    document.documentElement.classList.add('keyboard-open');
    syncVisualViewport();
  });
  field.addEventListener('blur', () => {
    window.setTimeout(() => {
      if (!keyboardFields.includes(document.activeElement)) {
        document.documentElement.classList.remove('keyboard-open');
      }
    }, 150);
  });
});

makeToggle('tog-brightness', 'brightness');
makeToggle('tog-safety', 'safety');
makeToggle('tog-incident', 'incident');
makeToggle('tog-protect', 'protect');

function syncPanelButtonState(open) {
  btnPanel.classList.toggle('active', open);
  btnPanel.setAttribute('aria-pressed', String(open));
}

btnPanel.addEventListener('click', () => {
  setMapInfoOpen(false);
  const closed = panel.classList.toggle('closed');
  syncPanelButtonState(!closed);
  window.setTimeout(() => map.invalidateSize(), 280);
});

btnPanelClose.addEventListener('click', () => {
  setMapInfoOpen(false);

  panel.classList.add('closed');
  syncPanelButtonState(false);
  window.setTimeout(() => map.invalidateSize(), 280);
});

btnReport.addEventListener('click', () => {
  const active = !btnReport.classList.contains('active');
  btnReport.classList.toggle('active', active);
  btnReport.setAttribute('aria-pressed', String(active));
  beginIncidentFlow();
});


function setStatus(el, message, state = '') {
  el.textContent = message;
  el.className = `dlg-status ${state}`.trim();
}
function setMapInfoOpen(open) {
  if (open && !panel.classList.contains('closed')) {
    panel.classList.add('closed');
    syncPanelButtonState(false);
    window.setTimeout(() => map.invalidateSize(), 280);
  }

  mapInfo.hidden = !open;
  mapInfoToggle.setAttribute('aria-expanded', String(open));
  mapInfoToggle.setAttribute('aria-label', open ? '關閉地圖說明' : '開啟地圖說明');
  mapInfoToggle.classList.toggle('active', open);
}
function setFabMenuOpen(open) {
  const expanded = Boolean(open) && !incDialog.classList.contains('show');
  incFabMenu.setAttribute('aria-hidden', String(!expanded));
  incFab.setAttribute('aria-expanded', String(expanded));
  incFab.setAttribute('aria-label', expanded ? '關閉地圖快速操作' : '開啟地圖快速操作');
  incFabMenu.querySelectorAll('button').forEach(button => {
    button.tabIndex = expanded ? 0 : -1;
  });
}

function syncFabEventVisibility() {
  const layerToggle = document.getElementById('tog-incident');
  const visible = !layerToggle.classList.contains('off');
  btnEventVisibility.setAttribute('aria-pressed', String(visible));
  btnEventVisibility.setAttribute('aria-label', visible ? '關閉事件顯示' : '開啟事件顯示');
  eventVisibilityLabel.textContent = `事件顯示：${visible ? '開' : '關'}`;
}

document.getElementById('tog-incident').addEventListener('click', syncFabEventVisibility);
syncFabEventVisibility();

mapInfoToggle.addEventListener('click', () => {
  setMapInfoOpen(mapInfo.hidden);
});
mapInfoClose.addEventListener('click', () => setMapInfoOpen(false));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !mapInfo.hidden) setMapInfoOpen(false);
});


function setAuthSession(session) {
  state.authSession = session?.authenticated ? session : null;
  reporterEmail.value = state.authSession?.email || '';
  btnLogout.disabled = !state.authSession;
  updateSubmitState();
}



function setAuthStep(step) {
  const emailComplete = step === 'code' || step === 'complete';
  const codeVisible = step !== 'email';
  authStepEmail.classList.toggle('is-active', step === 'email');
  authStepEmail.classList.toggle('is-complete', emailComplete);
  authStepCode.classList.toggle('is-active', step === 'code');
  authStepCode.classList.toggle('is-complete', step === 'complete');
  authCodeField.hidden = !codeVisible;
  authVerifyActions.hidden = !codeVisible;
}

function setReportStep(step) {
  const details = step === 'details';
  reportStepLocation.classList.toggle('is-active', !details);
  reportStepLocation.classList.toggle('is-complete', details);
  reportStepDetails.classList.toggle('is-active', details);
}

function updateDescriptionCount() {
  incDescCount.textContent = `${incDesc.value.length} / ${incDesc.maxLength}`;
}

function clearSelectedReportHex() {
  state.selectedHex = null;
  if (state.selectedHexLayer) {
    state.selectedHexLayer.remove();
    state.selectedHexLayer = null;
  }
  reportLocationValue.textContent = '尚未選擇';
  btnReselect.disabled = true;
  setReportStep('location');
}

function setIncidentType(type) {
  const selectedType = type === 'harassment' ? 'harassment' : 'accident';
  incType.value = selectedType;
  incTypeOptions.forEach(option => {
    const selected = option.dataset.incidentType === selectedType;
    option.classList.toggle('is-selected', selected);
    option.setAttribute('aria-checked', String(selected));
    option.tabIndex = selected ? 0 : -1;
  });
}

function showAuth() {
  authSec.classList.remove('hidden');
  reportSec.classList.add('hidden');
  setAuthStep('email');
  clearSelectedReportHex();
  setReportPickMode(false);
  if (state.reportHexLayer && map.hasLayer(state.reportHexLayer)) map.removeLayer(state.reportHexLayer);
}

function showReport() {
  authSec.classList.add('hidden');
  reportSec.classList.remove('hidden');
  setReportStep(state.selectedHex ? 'details' : 'location');
  if (state.reportHexLayer && !map.hasLayer(state.reportHexLayer)) state.reportHexLayer.addTo(map);
}

function setReportPickMode(active) {
  const picking = Boolean(active && window.matchMedia('(max-width: 760px)').matches);
  incDialog.classList.toggle('pick-mode', picking);
  reportHint.classList.toggle('show', picking);
  map.getContainer().classList.toggle('report-picking', picking);
}

function closeDialog() {
  incDialog.classList.remove('show');
  document.documentElement.classList.remove('keyboard-open');
  document.documentElement.classList.remove('report-dialog-open');

  incFab.classList.remove('active');
  setFabMenuOpen(false);
  btnReport.classList.remove('active');
  btnReport.setAttribute('aria-pressed', 'false');
  authSec.classList.remove('hidden');
  reportSec.classList.add('hidden');
  setReportPickMode(false);
  clearSelectedReportHex();
  incDesc.value = '';
  authCode.value = '';
  followupConsent.checked = false;
  updateDescriptionCount();
  setAuthStep('email');
  updateSubmitState();
  setStatus(reportStatus, '請在地圖上點選回報區');
  if (state.reportHexLayer && map.hasLayer(state.reportHexLayer)) map.removeLayer(state.reportHexLayer);
}

function updateSubmitState() {
  const hasVerifiedEmail = Boolean(state.authSession?.authenticated && state.authSession.email && reporterEmail.value);
  btnSubmit.disabled = !hasVerifiedEmail || !state.selectedHex || incDesc.value.trim().length === 0;
}

function incidentSubmitErrorMessage(errorData) {
  if (errorData?.error === 'rate_limited') return '近期回報次數已達上限，請稍後再試';
  if (errorData?.error === 'incident_create_failed') return '系統暫時無法儲存，請稍後再試';
  if (errorData?.message === 'invalid_incident') return '回報資料無效，請重新選擇回報區';
  return errorData?.message || errorData?.error || '送出失敗';
}

function selectReportHex(feature, layer) {
  const id = Number(feature.properties?.id);
  if (!Number.isInteger(id)) return;

  state.selectedHex = { id, center: layer.getBounds().getCenter(), feature };
  if (state.selectedHexLayer) state.selectedHexLayer.remove();

  state.selectedHexLayer = L.geoJSON(feature, {
    pane: 'incidentPane',
    interactive: false,
    className: 'selected-report-cell',
    style: {
      color: '#F0997B',
      weight: 2.5,
      opacity: 1,
      fillColor: '#D85A30',
      fillOpacity: 0.35
    }
  }).addTo(map);
  setReportPickMode(false);
  reportLocationValue.textContent = `Hex ${id}`;
  btnReselect.disabled = false;
  setReportStep('details');

  setStatus(reportStatus, `已選回報區 ${id}`, 'ok');
  updateSubmitState();
}
function updateUserLocationMarker(lat, lng, accuracy) {
  state.userLocation = { lat, lng, accuracy };

  if (state.userAccuracyCircle) {
    state.userAccuracyCircle.setLatLng([lat, lng]);
    state.userAccuracyCircle.setRadius(accuracy || 30);
  } else {
    state.userAccuracyCircle = L.circle([lat, lng], {
      radius: accuracy || 30,
      color: '#9ce7d8',
      fillColor: '#9ce7d8',
      fillOpacity: 0.15,
      weight: 1,
      pane: 'incidentPane',
      interactive: false
    }).addTo(map);
  }

  if (state.userLocationMarker) {
    state.userLocationMarker.setLatLng([lat, lng]);
  } else {
    state.userLocationMarker = L.circleMarker([lat, lng], {
      radius: 7,
      color: '#ffffff',
      fillColor: '#2563eb',
      fillOpacity: 1,
      weight: 2,
      pane: 'incidentPane',
      interactive: false
    }).addTo(map);
  }
}

function requestUserLocation({ pan = true, onFound = null, onError = null } = {}) {
  if (!navigator.geolocation) {
    alert('你的瀏覽器不支援 GPS 定位功能');
    return;
  }

  if (btnGps) btnGps.classList.add('loading');
  if (btnPickGps) btnPickGps.disabled = true;

  navigator.geolocation.getCurrentPosition(
    position => {
      if (btnGps) btnGps.classList.remove('loading');
      if (btnPickGps) btnPickGps.disabled = false;

      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const accuracy = position.coords.accuracy;

      updateUserLocationMarker(lat, lng, accuracy);

      if (pan) {
        map.flyTo([lat, lng], Math.max(map.getZoom(), 16), { duration: 1 });
      }

      if (typeof onFound === 'function') {
        onFound({ lat, lng, accuracy });
      }
    },
    error => {
      if (btnGps) btnGps.classList.remove('loading');
      if (btnPickGps) btnPickGps.disabled = false;

      console.warn('geolocation_error', error);
      let msg = '無法取得目前位置，請確認定位權限';
      if (error.code === 1) { // PERMISSION_DENIED
        msg = '定位權限被拒絕，請在瀏覽器設定中允許網站存取位置';
      } else if (error.code === 2) { // POSITION_UNAVAILABLE
        msg = '目前無法取得位置訊號，請稍候再試';
      } else if (error.code === 3) { // TIMEOUT
        msg = '定位逾時，請至收訊良好處重試';
      }

      if (typeof onError === 'function') {
        onError(msg);
      } else {
        alert(msg);
      }
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 30000
    }
  );
}

function selectHexByCurrentLocation() {
  requestUserLocation({
    pan: true,
    onFound: ({ lat, lng }) => {
      const features = Array.from(state.reportHexFeatureById.values());
      const targetFeature = findReportHexForCoords(lat, lng, features);
      if (targetFeature) {
        // Find layer corresponding to this feature
        let targetLayer = null;
        if (state.reportHexLayer) {
          state.reportHexLayer.eachLayer(l => {
            if (l.feature?.properties?.id === targetFeature.properties.id) {
              targetLayer = l;
            }
          });
        }
        if (targetLayer) {
          selectReportHex(targetFeature, targetLayer);
        } else {
          // Synthetic fallback
          const bounds = L.geoJSON(targetFeature).getBounds();
          selectReportHex(targetFeature, { getBounds: () => bounds });
        }
      } else {
        alert('目前位置不在台大校園回報區內，請手動點選地圖上的六角格');
      }
    },
    onError: msg => {
      alert(msg);
    }
  });
}

async function loadIncidents() {
  const response = await fetch('/api/incidents', { headers: { accept: 'application/json' } });
  if (!response.ok) return;
  const data = await response.json();
  state.allIncidents = Array.isArray(data.incidents) ? data.incidents : [];
  renderIncidents();
}


async function getAuthSession() {
  try {
    const response = await fetch('/api/protected/session', {
      headers: { accept: 'application/json' }
    });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

async function refreshAuthSession() {
  setAuthSession(await getAuthSession());
}

async function beginIncidentFlow() {
  if (incidentFlowPending) return;
  incidentFlowPending = true;

  try {
    setFabMenuOpen(false);
    document.documentElement.classList.add('report-dialog-open');
    panel.classList.add('closed');
    syncPanelButtonState(false);
    window.setTimeout(() => map.invalidateSize(), 280);

    if (incDialog.classList.contains('show')) {
      closeDialog();
      return;
    }
    if (!state.authSession) await refreshAuthSession();
    incDialog.classList.add('show');
    setMapInfoOpen(false);
    incFab.classList.add('active');
    btnReport.setAttribute('aria-pressed', 'true');
    if (state.authSession?.authenticated) {
      showReport();
      setReportPickMode(true);
    } else {
      showAuth();
    }
    if (!incDialog.classList.contains('pick-mode')) dlgClose.focus();
  } finally {
    incidentFlowPending = false;
  }
}

incFab.addEventListener('click', () => {
  setFabMenuOpen(incFab.getAttribute('aria-expanded') !== 'true');
});
document.addEventListener('click', event => {
  if (!incActionsGroup.contains(event.target) && incFab.getAttribute('aria-expanded') === 'true') {
    setFabMenuOpen(false);
  }
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && incFab.getAttribute('aria-expanded') === 'true') {
    setFabMenuOpen(false);
  }
});
dlgClose.addEventListener('click', closeDialog);
btnPickCancel.addEventListener('click', closeDialog);
btnCancel.addEventListener('click', closeDialog);
btnGps.addEventListener('click', () => {
  setFabMenuOpen(false);
  requestUserLocation({ pan: true });
});
btnEventVisibility.addEventListener('click', () => {
  document.getElementById('tog-incident').click();
  setFabMenuOpen(false);
});
if (btnPickGps) {
  btnPickGps.addEventListener('click', selectHexByCurrentLocation);
}
btnReselect.addEventListener('click', () => {
  if (!state.authSession?.authenticated) return;
  clearSelectedReportHex();
  setStatus(reportStatus, '請重新選擇回報區');
  setReportPickMode(true);
});
incDesc.addEventListener('input', () => {
  updateDescriptionCount();
  updateSubmitState();
});
incTypeOptions.forEach((option, index) => {
  option.addEventListener('click', () => setIncidentType(option.dataset.incidentType));
  option.addEventListener('keydown', event => {
    const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown'
      ? 1
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
        ? -1
        : 0;
    if (!direction) return;
    event.preventDefault();
    const nextIndex = (index + direction + incTypeOptions.length) % incTypeOptions.length;
    const nextOption = incTypeOptions[nextIndex];
    setIncidentType(nextOption.dataset.incidentType);
    nextOption.focus();
  });
});
authEmail.addEventListener('keydown', event => {
  if (event.key === 'Enter') btnRequestCode.click();
});
authCode.addEventListener('keydown', event => {
  if (event.key === 'Enter') btnVerifyCode.click();
});
setIncidentType(incType.value);
updateDescriptionCount();

btnLogout.addEventListener('click', async () => {
  if (btnLogout.disabled) return;
  const previousSession = state.authSession;
  btnLogout.disabled = true;

  try {
    const response = await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { accept: 'application/json' }
    });
    if (!response.ok) throw new Error('logout_failed');

    setAuthSession(null);
    closeDialog();
    setStatus(authStatus, '已登出，請重新登入');
  } catch {
    setAuthSession(previousSession);
    if (!incDialog.classList.contains('show')) {
      incDialog.classList.add('show');
      btnReport.setAttribute('aria-pressed', 'true');
    }
    showReport();
    setReportPickMode(true);
    setStatus(reportStatus, '登出失敗，請稍後再試', 'err');
  }
});

function isAllowedNtuEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  const parts = normalized.split('@');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false;

  const domain = parts[1];
  return domain === 'ntu.edu.tw'
    || domain === 'ntusa.ntu.edu.tw'
    || domain.endsWith('.ntusa.ntu.edu.tw');
}

btnRequestCode.addEventListener('click', async () => {
  const email = authEmail.value.trim().toLowerCase();
  if (!isAllowedNtuEmail(email)) {
    setStatus(authStatus, '請輸入有效的 NTU 或 NTUSA Email', 'err');
    return;
  }


  btnRequestCode.disabled = true;
  setStatus(authStatus, '寄送中');

  try {
    const response = await fetch('/api/auth/request-code', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json'
      },
      body: JSON.stringify({ email })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 429 || errorData.error === 'rate_limited') {
        setStatus(authStatus, '近期寄送次數已達上限，請 10 分鐘後再試', 'err');
      } else if (response.status === 502 || errorData.error === 'email_send_failed') {
        setStatus(authStatus, '驗證碼寄送失敗，請確認信箱正確或稍後再試', 'err');
      } else if (errorData.detail === 'missing_hash_salt' || errorData.error === 'server_misconfigured') {
        setStatus(authStatus, '系統伺服器未完成安全性配置，請聯繫管理員', 'err');
      } else {
        setStatus(authStatus, errorData.message || errorData.error || '寄送失敗', 'err');
      }
      return;
    }

    setStatus(authStatus, '驗證碼已寄出，請檢查信箱', 'ok');
    setAuthStep('code');
    authCode.focus();
  } catch {
    setStatus(authStatus, '寄送失敗', 'err');
  } finally {
    btnRequestCode.disabled = false;
  }
});

btnVerifyCode.addEventListener('click', async () => {
  const email = authEmail.value.trim().toLowerCase();
  const code = authCode.value.trim();
  if (!isAllowedNtuEmail(email) || !/^\d{6}$/.test(code)) {
    setStatus(authStatus, '請輸入 NTU 或 NTUSA Email 與 6 位數驗證碼', 'err');
    return;
  }

  btnVerifyCode.disabled = true;
  setStatus(authStatus, '驗證中');

  try {
    const response = await fetch('/api/auth/verify-code', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json'
      },
      body: JSON.stringify({ email, code })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (errorData.error === 'invalid_code') {
        setStatus(authStatus, '驗證碼錯誤或已過期，請重新輸入', 'err');
      } else {
        setStatus(authStatus, errorData.message || errorData.error || '驗證失敗', 'err');
      }
      return;
    }

    setAuthSession(await response.json());
    setAuthStep('complete');
    setStatus(authStatus, '驗證完成', 'ok');
    showReport();
    setReportPickMode(true);
    setStatus(reportStatus, '請在地圖上點選回報區');
  } catch {
    setStatus(authStatus, '驗證失敗', 'err');
  } finally {
    btnVerifyCode.disabled = false;
  }
});


btnSubmit.addEventListener('click', async () => {
  if (reportSec.classList.contains('hidden')) return;
  if (!state.selectedHex) {
    setStatus(reportStatus, '請先點選回報區', 'err');
    return;
  }

  btnSubmit.disabled = true;
  setStatus(reportStatus, '送出中');

  try {
    const response = await fetch('/api/protected/incidents', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json'
      },
      body: JSON.stringify({
        report_hex_id: state.selectedHex.id,
        lat: state.selectedHex.center.lat,
        lng: state.selectedHex.center.lng,
        type: incType.value,
        description: incDesc.value.trim(),
        followup_requested: followupConsent.checked
      })
    });

    if (response.status === 401 || response.status === 403) {
      setAuthSession(null);
      showAuth();
      setStatus(authStatus, '請先驗證 NTU Email，再送出回報', 'err');
      return;
    }
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      setStatus(reportStatus, incidentSubmitErrorMessage(errorData), 'err');
      updateSubmitState();
      return;
    }

    const data = await response.json();
    if (data.incident) {
      state.allIncidents.unshift(data.incident);
      renderIncidents();
    }
    closeDialog();
  } catch {
    setStatus(reportStatus, '網路連線失敗，請稍後再試', 'err');
    updateSubmitState();
  }
});

refreshAuthSession();
loadCampusBoundary();
loadMapLayers(selectReportHex, hexTooltip).then(() => loadIncidents()).then(() => {
  if (window.location.hash === '#new-incident') {
    history.replaceState(null, '', location.pathname + location.search);
    beginIncidentFlow();
  }
});
