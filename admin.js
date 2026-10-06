const byId = id => document.getElementById(id);

const status = byId('admin-status');
const loginSection = byId('admin-login');
const deniedSection = byId('admin-denied');
const consoleSection = byId('admin-console');
const adminEmailInput = byId('admin-email');
const adminCodeInput = byId('admin-code');
const adminCodeField = byId('admin-code-field');
const requestCodeButton = byId('btn-admin-request-code');
const verifyCodeButton = byId('btn-admin-verify-code');
const logoutButton = byId('admin-logout');
const list = byId('admin-list');
const filter = byId('admin-status-filter');
const countLabel = byId('admin-count');
const deniedEmail = byId('admin-denied-email');
const whitelistList = byId('admin-whitelist-list');
const whitelistCount = byId('admin-whitelist-count');
const whitelistForm = byId('admin-whitelist-form');
const whitelistEmailInput = byId('admin-whitelist-email');

let incidents = [];
let whitelistEntries = [];
let authenticatedEmail = '';

function setStatus(message, kind = '') {
  status.textContent = message;
  status.className = `admin-status ${kind}`.trim();
}

function showSection(section) {
  loginSection.hidden = section !== loginSection;
  deniedSection.hidden = section !== deniedSection;
  consoleSection.hidden = section !== consoleSection;
}

async function readJson(response) {
  return response.json().catch(() => ({}));
}

async function checkAdminAccess() {
  const sessionResponse = await fetch('/api/protected/session', {
    headers: { accept: 'application/json' }
  });
  if (!sessionResponse.ok) {
    showSection(loginSection);
    logoutButton.hidden = true;
    setStatus('請先使用 NTU／NTUSA Email 驗證登入');
    return;
  }

  const session = await readJson(sessionResponse);
  if (!session.authenticated || !session.email) {
    showSection(loginSection);
    logoutButton.hidden = true;
    setStatus('請先使用 NTU／NTUSA Email 驗證登入');
    return;
  }

  authenticatedEmail = session.email;
  const [incidentsResponse, whitelistResponse] = await Promise.all([
    fetch('/api/admin/incidents', { headers: { accept: 'application/json' } }),
    fetch('/api/admin/users', { headers: { accept: 'application/json' } })
  ]);
  if (incidentsResponse.status === 403 || whitelistResponse.status === 403) {
    showSection(deniedSection);
    deniedEmail.textContent = authenticatedEmail;
    logoutButton.hidden = true;
    setStatus('登入成功，但帳號不在管理白名單中', 'error');
    return;
  }
  if (incidentsResponse.status === 401 || whitelistResponse.status === 401) {
    showSection(loginSection);
    logoutButton.hidden = true;
    setStatus('登入狀態已失效，請重新驗證', 'error');
    return;
  }
  if (!incidentsResponse.ok || !whitelistResponse.ok) {
    showSection(loginSection);
    logoutButton.hidden = false;
    setStatus('無法載入管理資料，請稍後重試', 'error');
    return;
  }

  const [incidentData, whitelistData] = await Promise.all([
    readJson(incidentsResponse),
    readJson(whitelistResponse)
  ]);
  incidents = Array.isArray(incidentData.incidents) ? incidentData.incidents : [];
  whitelistEntries = Array.isArray(whitelistData.users) ? whitelistData.users : [];
  showSection(consoleSection);
  logoutButton.hidden = false;
  setStatus(`已以 ${authenticatedEmail} 登入管理頁`);
  renderWhitelist();
  renderIncidents();
}

function textElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

function makeSelect(options, value, ariaLabel) {
  const select = document.createElement('select');
  select.setAttribute('aria-label', ariaLabel);
  options.forEach(([optionValue, label]) => {
    const option = document.createElement('option');
    option.value = optionValue;
    option.textContent = label;
    select.append(option);
  });
  select.value = value;
  return select;
}

function makeField(labelText, control) {
  const label = document.createElement('label');
  label.className = 'admin-field';
  label.append(textElement('span', '', labelText), control);
  return label;
}
function whitelistErrorMessage(code) {
  if (code === 'whitelist_entry_exists') return '這個白名單項目已存在';
  if (code === 'cannot_remove_last_whitelist_entry') return '至少需要保留一個白名單項目';
  if (code === 'cannot_remove_current_access') return '請先新增另一個可保留目前管理權限的項目';
  if (code === 'invalid_whitelist_email') return '只接受有效的 NTU Email 或指定的 NTUSA 萬用網域';
  return code || '白名單操作失敗';
}

function renderWhitelist() {
  whitelistList.replaceChildren();
  whitelistCount.textContent = `${whitelistEntries.length} 個項目`;

  if (whitelistEntries.length === 0) {
    whitelistList.append(textElement('p', 'admin-empty', '目前沒有白名單項目'));
    return;
  }

  whitelistEntries.forEach(entry => {
    const row = document.createElement('div');
    row.className = 'admin-whitelist-row';
    const details = document.createElement('div');
    details.append(
      textElement('strong', 'admin-whitelist-email-entry', entry.email),
      textElement('small', 'admin-whitelist-meta', `新增者：${entry.created_by || '系統'} · ${entry.created_at || ''}`)
    );
    const removeButton = textElement('button', 'admin-danger', '移除');
    removeButton.type = 'button';
    removeButton.addEventListener('click', async () => {
      if (!window.confirm(`確定移除白名單項目 ${entry.email}？`)) return;
      removeButton.disabled = true;
      try {
        const response = await fetch('/api/admin/users', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ email: entry.email })
        });
        const data = await readJson(response);
        if (!response.ok) throw new Error(whitelistErrorMessage(data.error));
        whitelistEntries = whitelistEntries.filter(item => item.email.toLowerCase() !== entry.email.toLowerCase());
        renderWhitelist();
        setStatus(`已移除白名單項目 ${entry.email}`, 'success');
      } catch (error) {
        setStatus(error.message, 'error');
        removeButton.disabled = false;
      }
    });
    row.append(details, removeButton);
    whitelistList.append(row);
  });
}


function renderIncidents() {
  list.replaceChildren();
  const visible = incidents.filter(incident => filter.value === 'all' || incident.status === filter.value);
  countLabel.textContent = `${visible.length} / ${incidents.length} 筆`;

  if (visible.length === 0) {
    list.append(textElement('p', 'admin-empty', incidents.length ? '此狀態沒有回報' : '目前沒有回報資料'));
    return;
  }

  visible.forEach(incident => {
    const card = document.createElement('article');
    card.className = 'admin-incident';

    const header = document.createElement('div');
    header.className = 'admin-incident-head';
    header.append(
      textElement('h3', '', `回報 #${incident.id} · Hex ${incident.report_hex_id}`),
      textElement('time', '', incident.created_at || '')
    );
    card.append(header);

    const details = document.createElement('div');
    details.className = 'admin-incident-details';
    details.append(
      textElement('p', '', `回報人 Email：${incident.reporter_email || '未記錄（舊回報）'}`),
      textElement('p', '', `學權部後續聯繫：${incident.followup_requested ? '同意' : '未同意'}`),
      textElement('p', '', `座標：${Number(incident.lat).toFixed(6)}, ${Number(incident.lng).toFixed(6)}`)
    );
    card.append(details);

    const fields = document.createElement('div');
    fields.className = 'admin-incident-fields';
    const typeInput = makeSelect([
      ['accident', '夜間事故'],
      ['harassment', '夜間騷擾']
    ], incident.type, `回報 #${incident.id} 事件類型`);
    const descriptionInput = document.createElement('textarea');
    descriptionInput.value = incident.description || '';
    descriptionInput.maxLength = 300;
    descriptionInput.rows = 3;
    descriptionInput.setAttribute('aria-label', `回報 #${incident.id} 描述`);
    const statusInput = makeSelect([
      ['public', '公開'],
      ['hidden', '已隱藏']
    ], incident.status, `回報 #${incident.id} 狀態`);
    fields.append(
      makeField('事件類型', typeInput),
      makeField('回報內容', descriptionInput),
      makeField('公開狀態', statusInput)
    );
    card.append(fields);

    const actions = document.createElement('div');
    actions.className = 'admin-incident-actions';
    const saveButton = textElement('button', 'admin-primary', '儲存修改');
    saveButton.type = 'button';
    saveButton.addEventListener('click', async () => {
      saveButton.disabled = true;
      try {
        const response = await fetch(`/api/admin/incidents/${incident.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({
            type: typeInput.value,
            description: descriptionInput.value,
            status: statusInput.value
          })
        });
        const data = await readJson(response);
        if (!response.ok) throw new Error(data.error || 'save_failed');
        incidents = incidents.map(item => item.id === incident.id ? data.incident : item);
        setStatus(`回報 #${incident.id} 已更新`, 'success');
        renderIncidents();
      } catch (error) {
        setStatus(`儲存失敗：${error.message}`, 'error');
        saveButton.disabled = false;
      }
    });

    const deleteButton = textElement('button', 'admin-danger', '刪除回報');
    deleteButton.type = 'button';
    deleteButton.addEventListener('click', async () => {
      if (!window.confirm(`確定永久刪除回報 #${incident.id}？`)) return;
      deleteButton.disabled = true;
      try {
        const response = await fetch(`/api/admin/incidents/${incident.id}`, {
          method: 'DELETE',
          headers: { accept: 'application/json' }
        });
        const data = await readJson(response);
        if (!response.ok) throw new Error(data.error || 'delete_failed');
        incidents = incidents.filter(item => item.id !== incident.id);
        setStatus(`回報 #${incident.id} 已刪除`, 'success');
        renderIncidents();
      } catch (error) {
        setStatus(`刪除失敗：${error.message}`, 'error');
        deleteButton.disabled = false;
      }
    });
    actions.append(saveButton, deleteButton);
    card.append(actions);
    list.append(card);
  });
}

requestCodeButton.addEventListener('click', async () => {
  const email = adminEmailInput.value.trim().toLowerCase();
  if (!email) {
    setStatus('請輸入 NTU／NTUSA Email', 'error');
    return;
  }
  requestCodeButton.disabled = true;
  try {
    const response = await fetch('/api/auth/request-code', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await readJson(response);
    if (!response.ok) throw new Error(data.message || data.error || '寄送驗證碼失敗');
    adminCodeField.hidden = false;
    verifyCodeButton.hidden = false;
    setStatus('驗證碼已寄出，請檢查 Email');
    adminCodeInput.focus();
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    requestCodeButton.disabled = false;
  }
});

verifyCodeButton.addEventListener('click', async () => {
  const email = adminEmailInput.value.trim().toLowerCase();
  const code = adminCodeInput.value.trim();
  if (!/^\d{6}$/.test(code)) {
    setStatus('請輸入 6 位數驗證碼', 'error');
    return;
  }
  verifyCodeButton.disabled = true;
  try {
    const response = await fetch('/api/auth/verify-code', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ email, code })
    });
    const data = await readJson(response);
    if (!response.ok) throw new Error(data.message || data.error || '驗證失敗');
    await checkAdminAccess();
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    verifyCodeButton.disabled = false;
  }
});
whitelistForm.addEventListener('submit', async event => {
  event.preventDefault();
  const email = whitelistEmailInput.value.trim().toLowerCase();
  if (!email) {
    setStatus('請輸入 Email 或 *@ntusa.ntu.edu.tw', 'error');
    return;
  }
  const submitButton = byId('btn-add-admin');
  submitButton.disabled = true;
  try {
    const response = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await readJson(response);
    if (!response.ok) throw new Error(whitelistErrorMessage(data.error || data.message));
    whitelistEntries.push(data.user);
    whitelistEmailInput.value = '';
    renderWhitelist();
    setStatus(`已新增白名單項目 ${data.user.email}`, 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    submitButton.disabled = false;
  }
});


async function logout() {
  await fetch('/api/auth/logout', { method: 'POST', headers: { accept: 'application/json' } });
  window.location.reload();
}

logoutButton.addEventListener('click', logout);
byId('btn-admin-denied-logout').addEventListener('click', logout);
filter.addEventListener('change', renderIncidents);

checkAdminAccess().catch(error => {
  showSection(loginSection);
  setStatus(`無法載入管理頁：${error.message}`, 'error');
});
