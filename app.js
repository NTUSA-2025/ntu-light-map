import { dom } from './js/dom.js';
import { state } from './js/state.js';
import { map, makeToggle, loadCampusBoundary, loadMapLayers } from './js/map.js';
import { renderAdminIncidentList, renderAdminUserList, renderIncidents } from './js/render.js';

const L = window.L;
const {
  panel,
  btnPanel,
  btnReport,
  btnLogout,
  btnAdmin,
  panelTitle,
  dashboardPanel,
  adminPanel,
  adminStatus,
  adminUsersList,
  adminIncidentsList,
  adminEmail,
  btnAdminAdd,
  btnAdminClose,
  btnPanelClose,
  incFab,
  incDialog,
  dlgClose,
  authSec,
  reportSec,
  authStatus,
  reportStatus,
  authEmail,
  authCode,
  btnRequestCode,
  btnVerifyCode,
  authStepEmail,
  authStepCode,
  authCodeField,
  authVerifyActions,
  incType,
  incTypeOptions,
  incDesc,
  incDescCount,
  reportLocationValue,
  reportStepLocation,
  reportStepDetails,
  btnReselect,
  btnSubmit,
  btnCancel,
  hexTooltip,
  reportHint,
  btnPickCancel,
} = dom;

makeToggle('tog-brightness', 'brightness');
makeToggle('tog-safety', 'safety');
makeToggle('tog-incident', 'incident');
makeToggle('tog-protect', 'protect');

function syncPanelButtonState(open) {
  btnPanel.classList.toggle('active', open);
  btnPanel.setAttribute('aria-pressed', String(open));
}

btnPanel.addEventListener('click', () => {
  if (!adminPanel.classList.contains('hidden')) {
    showDashboardPanel();
    return;
  }

  if (dashboardPanel.classList.contains('hidden')) {
    showDashboardPanel();
    return;
  }

  const closed = panel.classList.toggle('closed');
  syncPanelButtonState(!closed);
  window.setTimeout(() => map.invalidateSize(), 280);
});
btnPanelClose.addEventListener('click', () => {
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

btnAdmin.addEventListener('click', () => {
  if (!adminPanel.classList.contains('hidden')) {
    showDashboardPanel();
    return;
  }

  showAdminPanel();
});

btnAdminClose.addEventListener('click', showDashboardPanel);

btnAdminAdd.addEventListener('click', () => {
  createAdminUser();
});

function setStatus(el, message, state = '') {
  el.textContent = message;
  el.className = `dlg-status ${state}`.trim();
}

function setAuthSession(session) {
  state.authSession = session?.authenticated ? session : null;
  btnLogout.disabled = !state.authSession;
  setAdminButtonVisible(Boolean(state.authSession?.admin));
  if (!state.authSession?.admin && !adminPanel.classList.contains('hidden')) showDashboardPanel();
}

function setAdminStatus(message) {
  adminStatus.textContent = message;
}

function setAdminButtonVisible(visible) {
  btnAdmin.classList.toggle('hidden', !visible);
}

function showDashboardPanel() {
  panel.classList.remove('closed');
  dashboardPanel.classList.remove('hidden');
  adminPanel.classList.add('hidden');
  syncPanelButtonState(true);
  btnAdmin.classList.remove('active');
  btnAdmin.setAttribute('aria-pressed', 'false');
  panelTitle.textContent = '圖層';
  window.setTimeout(() => map.invalidateSize(), 280);
}

async function showAdminPanel() {
  state.authSession = state.authSession || await getAuthSession();
  if (!state.authSession?.admin) {
    setAuthSession(state.authSession);
    showDashboardPanel();
    return;
  }

  if (incDialog.classList.contains('show')) closeDialog();
  panel.classList.remove('closed');
  dashboardPanel.classList.remove('hidden');
  adminPanel.classList.remove('hidden');
  syncPanelButtonState(true);
  btnAdmin.classList.add('active');
  btnAdmin.setAttribute('aria-pressed', 'true');
  panelTitle.textContent = '圖層';
  window.setTimeout(() => map.invalidateSize(), 280);

  if (state.allAdminIncidents.length === 0 && state.allAdminUsers.length === 0) {
    await loadAdminData();
  }
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
  incFab.classList.remove('active');
  btnReport.classList.remove('active');
  btnReport.setAttribute('aria-pressed', 'false');
  authSec.classList.remove('hidden');
  reportSec.classList.add('hidden');
  setReportPickMode(false);
  clearSelectedReportHex();
  incDesc.value = '';
  authCode.value = '';
  updateDescriptionCount();
  setAuthStep('email');
  btnSubmit.disabled = true;
  setStatus(reportStatus, '請在地圖上點選回報區');
  if (state.reportHexLayer && map.hasLayer(state.reportHexLayer)) map.removeLayer(state.reportHexLayer);
}

function updateSubmitState() {
  btnSubmit.disabled = !state.selectedHex || incDesc.value.trim().length === 0;
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

async function loadIncidents() {
  const response = await fetch('/api/incidents', { headers: { accept: 'application/json' } });
  if (!response.ok) return;
  const data = await response.json();
  state.allIncidents = Array.isArray(data.incidents) ? data.incidents : [];
  renderIncidents();
}

async function loadAdminData() {
  setAdminStatus('載入中');

  try {
    const [incidentsResponse, usersResponse] = await Promise.all([
      fetch('/api/admin/incidents', { headers: { accept: 'application/json' } }),
      fetch('/api/admin/users', { headers: { accept: 'application/json' } })
    ]);

    if (
      incidentsResponse.status === 401 ||
      incidentsResponse.status === 403 ||
      usersResponse.status === 401 ||
      usersResponse.status === 403
    ) {
      setAuthSession(null);
      showDashboardPanel();
      return;
    }
    if (!incidentsResponse.ok || !usersResponse.ok) {
      setAdminStatus('載入失敗');
      return;
    }

    const incidentsData = await incidentsResponse.json();
    const usersData = await usersResponse.json();
    state.allAdminIncidents = Array.isArray(incidentsData.incidents) ? incidentsData.incidents : [];
    state.allAdminUsers = Array.isArray(usersData.admins) ? usersData.admins : [];
    renderAdminIncidentList();
    renderAdminUserList();
    setAdminStatus('載入完成');
  } catch {
    setAdminStatus('載入失敗');
  }
}

async function createAdminUser() {
  const email = adminEmail.value.trim().toLowerCase();
  if (!email.endsWith('@ntu.edu.tw')) {
    setAdminStatus('請輸入 @ntu.edu.tw email');
    return;
  }

  btnAdminAdd.disabled = true;
  setAdminStatus('新增管理員中');

  try {
    const response = await fetch('/api/admin/users', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json'
      },
      body: JSON.stringify({ email })
    });

    if (response.status === 401 || response.status === 403) {
      setAuthSession(null);
      showDashboardPanel();
      return;
    }
    if (!response.ok) {
      setAdminStatus('新增管理員失敗');
      return;
    }

    const data = await response.json();
    state.allAdminUsers = [
      data.admin,
      ...state.allAdminUsers.filter(user => user.email !== data.admin.email)
    ];
    adminEmail.value = '';
    renderAdminUserList();
    setAdminStatus('管理員已新增');
  } catch {
    setAdminStatus('新增管理員失敗');
  } finally {
    btnAdminAdd.disabled = false;
  }
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
  if (!adminPanel.classList.contains('hidden')) showDashboardPanel();
  if (window.matchMedia('(max-width: 760px)').matches) {
    panel.classList.add('closed');
    syncPanelButtonState(false);
    window.setTimeout(() => map.invalidateSize(), 280);
  }

  if (incDialog.classList.contains('show')) {
    closeDialog();
    return;
  }
  if (!state.authSession) await refreshAuthSession();
  incDialog.classList.add('show');
  incFab.classList.add('active');
  btnReport.setAttribute('aria-pressed', 'true');
  if (state.authSession?.authenticated) {
    showReport();
    setReportPickMode(true);
  } else {
    showAuth();
  }
}

incFab.addEventListener('click', beginIncidentFlow);
dlgClose.addEventListener('click', closeDialog);
btnPickCancel.addEventListener('click', closeDialog);
btnCancel.addEventListener('click', closeDialog);
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

btnRequestCode.addEventListener('click', async () => {
  const email = authEmail.value.trim().toLowerCase();
  if (!email.endsWith('@ntu.edu.tw')) {
    setStatus(authStatus, '請輸入 @ntu.edu.tw email', 'err');
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
      setStatus(authStatus, errorData.message || errorData.error || '寄送失敗', 'err');
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
  if (!email.endsWith('@ntu.edu.tw') || !/^\d{6}$/.test(code)) {
    setStatus(authStatus, '請輸入 NTU email 與 6 位數驗證碼', 'err');
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
      setStatus(authStatus, errorData.message || errorData.error || '驗證失敗', 'err');
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

adminIncidentsList.addEventListener('click', async event => {
  const button = event.target.closest('[data-incident-status]');
  if (!button) return;

  const item = button.closest('[data-incident-id]');
  const id = Number(item?.dataset.incidentId);
  const nextStatus = button.dataset.incidentStatus;
  if (!Number.isInteger(id)) return;
  if (nextStatus !== 'public' && nextStatus !== 'hidden') return;

  const isRestoring = nextStatus === 'public';
  const actionLabel = isRestoring ? '恢復' : '封存';

  button.disabled = true;
  setAdminStatus(`${actionLabel}中`);

  try {
    const response = await fetch(`/api/admin/incidents/${id}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json'
      },
      body: JSON.stringify({ status: nextStatus })
    });

    if (response.status === 401 || response.status === 403) {
      setAuthSession(null);
      showDashboardPanel();
      return;
    }
    if (!response.ok) {
      setAdminStatus(`${actionLabel}失敗`);
      button.disabled = false;
      return;
    }

    const data = await response.json();
    state.allAdminIncidents = state.allAdminIncidents.map(incident =>
      Number(incident.id) === id ? data.incident : incident
    );
    if (isRestoring) {
      state.allIncidents = [
        data.incident,
        ...state.allIncidents.filter(incident => Number(incident.id) !== id)
      ].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    } else {
      state.allIncidents = state.allIncidents.filter(incident => Number(incident.id) !== id);
    }
    renderAdminIncidentList();
    renderIncidents();
    setAdminStatus(`${actionLabel}完成`);
  } catch {
    setAdminStatus(`${actionLabel}失敗`);
    button.disabled = false;
  }
});

adminUsersList.addEventListener('click', async event => {
  const button = event.target.closest('[data-delete-admin]');
  if (!button) return;

  const email = button.dataset.deleteAdmin;
  if (!email) return;
  if (!window.confirm(`確定刪除管理員 ${email}？`)) return;

  button.disabled = true;
  setAdminStatus('刪除管理員中');

  try {
    const response = await fetch(`/api/admin/users/${encodeURIComponent(email)}`, {
      method: 'DELETE',
      headers: { accept: 'application/json' }
    });

    if (response.status === 401 || response.status === 403) {
      setAuthSession(null);
      showDashboardPanel();
      return;
    }
    if (response.status === 409) {
      setAdminStatus('不能刪除最後一位管理員');
      button.disabled = false;
      return;
    }
    if (!response.ok) {
      setAdminStatus('刪除管理員失敗');
      button.disabled = false;
      return;
    }

    state.allAdminUsers = state.allAdminUsers.filter(user => user.email !== email);
    renderAdminUserList();
    setAdminStatus('管理員已刪除');
  } catch {
    setAdminStatus('刪除管理員失敗');
    button.disabled = false;
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
        description: incDesc.value.trim()
      })
    });

    if (response.status === 401 || response.status === 403) {
      setAuthSession(null);
      showAuth();
      setStatus(authStatus, '請先驗證 NTU Email', 'err');
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
