const devicesEl = document.getElementById('devices');
const countEl = document.getElementById('count');
let currentTab = 'active';
let allDevices = [];
const connStatus = document.getElementById('conn-status');
const newHwidInput = document.getElementById('new-hwid');
const addBtn = document.getElementById('add-btn');
const logoutBtn = document.getElementById('logout-btn');
const userLabel = document.getElementById('user-label');

async function api(path, options = {}) {
  const res = await fetch(path, { ...options, credentials: 'same-origin' });
  if (res.status === 401) {
    window.location.href = '/login.html';
    throw new Error('Unauthorized');
  }
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function timeAgo(iso) {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return 'just now';
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function escapeHtml(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escapeAttr(s) { return String(s ?? '').replace(/"/g,'&quot;'); }

function renderDevice(d, index) {
  const active = d.status === 'active';
  const online = !!d.online;
  const displayName = d.discordUsername || 'Unknown';
  const avatar = d.discordAvatar || 'https://cdn.discordapp.com/embed/avatars/0.png';
  return `
    <div class="device">
      <h3 class="device-title">Device ${index + 1}</h3>
      <div class="row">
        <div class="user-block">
          <span class="dot ${online ? 'online' : 'offline'}"></span>
          <img src="${escapeAttr(avatar)}" class="discord-avatar" alt="" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'" />
          <strong class="device-name">${escapeHtml(displayName)}</strong>
        </div>
        <span class="badge ${active ? 'active' : 'inactive'}">${active ? 'Active' : 'Not Active'}</span>
      </div>
      <div class="hwid-sub"><code>${escapeHtml(d.hwid)}</code></div>
      <div class="info-grid">
        <div><strong>CPU</strong><br>${escapeHtml(d.cpu || '-')}</div>
        <div><strong>GPU</strong><br>${escapeHtml(d.gpu || '-')}</div>
        <div><strong>RAM</strong><br>${escapeHtml(d.ram || '-')}</div>
        <div><strong>OS</strong><br>${escapeHtml(d.os || '-')}</div>
        <div><strong>OS Install</strong><br>${escapeHtml(d.osInstallDate || '-')}</div>
        <div><strong>Last Seen</strong><br>${escapeHtml(timeAgo(d.last_seen))}</div>
        <div><strong>Status</strong><br>${online ? 'Online' : 'Offline'}</div>
      </div>
      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
        ${active
          ? `<button class="danger" data-action="deactivate" data-hwid="${escapeAttr(d.hwid)}">Deactivate</button>`
          : `<button class="success" data-action="activate" data-hwid="${escapeAttr(d.hwid)}">Activate</button>`}
        <button class="info" data-action="archive" data-hwid="${escapeAttr(d.hwid)}">Archive</button>
        <button class="danger" data-action="delete" data-hwid="${escapeAttr(d.hwid)}">Delete</button>
      </div>
    </div>
  `;
}

function applyFilters(devices) {
  const q = (document.getElementById('search-input').value || '').trim().toLowerCase();
  return devices.filter((d) => {
    if ((d.status === 'active') !== (currentTab === 'active')) return false;
    if (!q) return true;
    const name = (d.discordUsername || '').toLowerCase();
    const id = (d.discordId || '').toLowerCase();
    return name.includes(q) || id.includes(q) || (d.hwid || '').toLowerCase().includes(q);
  });
}

function renderDevicesList() {
  const filtered = applyFilters(allDevices);
  countEl.textContent = filtered.length;
  if (!filtered.length) {
    devicesEl.innerHTML = '<p>No devices found.</p>';
    return;
  }
  devicesEl.innerHTML = filtered.map((d, i) => renderDevice(d, i)).join('');
  devicesEl.querySelectorAll('button[data-action]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const hwid = btn.dataset.hwid;
      const action = btn.dataset.action;
      try {
        if (action === 'activate') {
          openActivationModal(hwid);
          return;
        } else if (action === 'deactivate') await api('/api/admin/deactivate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hwid }) });
        else if (action === 'delete') {
          if (!confirm('Delete ' + hwid + '?')) return;
          await api('/api/admin/device/' + encodeURIComponent(hwid), { method: 'DELETE' });
        } else if (action === 'archive') {
          await openArchive(hwid);
          return;
        }
        await loadDevices();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

async function loadDevices() {
  try {
    const data = await api('/api/admin/devices');
    allDevices = data.devices || [];
    renderDevicesList();
    connStatus.classList.remove('err');
    connStatus.classList.add('ok');
  } catch (err) {
    devicesEl.innerHTML = `<p style="color:#dc2626;">${escapeHtml(err.message)}</p>`;
    connStatus.classList.remove('ok');
    connStatus.classList.add('err');
  }
}

async function addDevice() {
  const hwid = newHwidInput.value.trim();
  const discordId = document.getElementById('new-discord').value.trim();
  if (!hwid) return;
  if (!discordId) { alert('Discord User ID is required.'); return; }
  try {
    await api('/api/admin/device/add', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hwid, discordId: discordId || undefined }) });
    newHwidInput.value = '';
    document.getElementById('new-discord').value = '';
    await loadDevices();
  } catch (err) {
    alert(err.message);
  }
}

addBtn.addEventListener('click', addDevice);
logoutBtn.addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  window.location.href = '/login.html';
});

// Show logged-in user
(async () => {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
    const data = await res.json();
    if (data.authenticated) userLabel.textContent = data.user;
    else window.location.href = '/login.html';
  } catch (e) {
    window.location.href = '/login.html';
  }
})();

// ---------- Archive Modal ----------
const archiveModal = document.getElementById('archive-modal');
const modalBody = document.getElementById('modal-body');
const modalClose = document.getElementById('modal-close');

function closeModal() { archiveModal.classList.add('hidden'); }
modalClose.addEventListener('click', closeModal);
archiveModal.querySelector('.modal-backdrop').addEventListener('click', closeModal);

function formatTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleString();
}

async function openArchive(hwid) {
  modalBody.innerHTML = 'Loading...';
  archiveModal.classList.remove('hidden');
  try {
    const data = await api('/api/admin/device/' + encodeURIComponent(hwid) + '/archive');
    const sessions = data.sessions || [];
    if (!sessions.length) {
      modalBody.innerHTML = '<p>No activity recorded in the last 3 days.</p>';
      return;
    }
    // Group by date
    const byDate = {};
    sessions.forEach((s) => {
      const open = s.openTime || s.start;
      const day = new Date(open).toLocaleDateString();
      if (!byDate[day]) byDate[day] = [];
      byDate[day].push(s);
    });
    let html = '';
    Object.keys(byDate).forEach((day) => {
      html += `<div class="archive-day"><h4>${escapeHtml(day)}</h4>`;
      byDate[day].forEach((s) => {
        const open = s.openTime || s.start;
        const close = s.closeTime || s.end;
        html += `<div class="archive-row">
          <span class="archive-label">Open:</span> ${escapeHtml(formatTime(open))}
          <span class="archive-sep">|</span>
          <span class="archive-label">Close:</span> ${escapeHtml(s.running ? 'Still Running' : (close ? formatTime(close) : 'Closed (timeout)'))}
        </div>`;
      });
      html += '</div>';
    });
    modalBody.innerHTML = html;
  } catch (err) {
    modalBody.innerHTML = `<p style="color:#fca5a5;">${escapeHtml(err.message)}</p>`;
  }
}

// ---------- Activation Modal ----------
const activationModal = document.getElementById('activation-modal');
const actHwidInput = document.getElementById('act-hwid');
const actDiscordInput = document.getElementById('act-discord');
const activationError = document.getElementById('activation-error');
const activationClose = document.getElementById('activation-close');
const activationCancel = document.getElementById('activation-cancel');
const activationSubmit = document.getElementById('activation-submit');
const openActivateModalBtn = document.getElementById('open-activate-modal');

function closeActivationModal() {
  activationModal.classList.add('hidden');
  activationError.classList.add('hidden');
  activationError.textContent = '';
}

function openActivationModal(prefillHwid) {
  actHwidInput.value = prefillHwid || '';
  actDiscordInput.value = '';
  activationError.classList.add('hidden');
  activationError.textContent = '';
  activationModal.classList.remove('hidden');
}

openActivateModalBtn.addEventListener('click', () => openActivationModal(''));
activationClose.addEventListener('click', closeActivationModal);
activationCancel.addEventListener('click', closeActivationModal);
activationModal.querySelector('.modal-backdrop').addEventListener('click', closeActivationModal);

activationSubmit.addEventListener('click', async () => {
  const hwid = actHwidInput.value.trim();
  const combined = actDiscordInput.value.trim();
  if (!hwid) { activationError.textContent = 'HWID is required.'; activationError.classList.remove('hidden'); return; }
  if (!combined) { activationError.textContent = 'Discord (Username ID) is required.'; activationError.classList.remove('hidden'); return; }
  // Parse "Username 123456789": last token is ID, rest is username
  const parts = combined.split(/\s+/);
  const discordId = parts.length > 1 ? parts[parts.length - 1] : '';
  const username = parts.length > 1 ? parts.slice(0, -1).join(' ') : combined;
  if (!username) { activationError.textContent = 'Username is required.'; activationError.classList.remove('hidden'); return; }
  try {
    await api('/api/admin/activate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hwid, discordUsername: username, discordId: discordId || undefined }) });
    closeActivationModal();
    await loadDevices();
  } catch (err) {
    activationError.textContent = err.message;
    activationError.classList.remove('hidden');
  }
});

// Tabs
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    currentTab = tab.dataset.tab;
    renderDevicesList();
  });
});
// Search
const searchInput = document.getElementById('search-input');
if (searchInput) searchInput.addEventListener('input', renderDevicesList);

setInterval(loadDevices, 5000);
loadDevices();
