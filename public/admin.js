const tokenInput = document.getElementById('token');
const loadBtn = document.getElementById('load-btn');
const devicesEl = document.getElementById('devices');

function token() { return tokenInput.value.trim(); }

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { ...(options.headers || {}), 'x-admin-token': token() },
  });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function renderDevice(d) {
  const active = d.status === 'active';
  const info = (d.cpu || d.gpu || d.ram || d.os)
    ? `<div class="info-grid">
         <div><strong>CPU</strong><br>${escapeHtml(d.cpu || '-')}</div>
         <div><strong>GPU</strong><br>${escapeHtml(d.gpu || '-')}</div>
         <div><strong>RAM</strong><br>${escapeHtml(d.ram || '-')}</div>
         <div><strong>OS</strong><br>${escapeHtml(d.os || '-')}</div>
       </div>`
    : '<p style="color:#6b7280;font-size:13px;margin-top:8px;">No hardware info received yet.</p>';
  return `
    <div class="device">
      <div class="row">
        <code>${escapeHtml(d.hwid)}</code>
        <span class="badge ${active ? 'active' : 'inactive'}">${active ? 'Active' : 'Not Active'}</span>
      </div>
      ${info}
      <div style="margin-top:10px;display:flex;gap:8px;">
        ${active
          ? `<button class="danger" data-action="deactivate" data-hwid="${escapeAttr(d.hwid)}">Deactivate</button>`
          : `<button class="success" data-action="activate" data-hwid="${escapeAttr(d.hwid)}">Activate</button>`}
      </div>
    </div>
  `;
}

function escapeHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escapeAttr(s) { return String(s).replace(/"/g,'&quot;'); }

async function loadDevices() {
  devicesEl.innerHTML = 'Loading...';
  try {
    const data = await api('/api/admin/devices');
    if (!data.devices.length) {
      devicesEl.innerHTML = '<p>No devices registered yet.</p>';
      return;
    }
    devicesEl.innerHTML = data.devices.map(renderDevice).join('');
    devicesEl.querySelectorAll('button[data-action]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const hwid = btn.dataset.hwid;
        const action = btn.dataset.action;
        try {
          if (action === 'activate') await api('/api/admin/activate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hwid }) });
          else await api('/api/admin/deactivate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hwid }) });
          await loadDevices();
        } catch (err) {
          alert(err.message);
        }
      });
    });
  } catch (err) {
    devicesEl.innerHTML = `<p style="color:#dc2626;">${err.message}</p>`;
  }
}

loadBtn.addEventListener('click', loadDevices);
