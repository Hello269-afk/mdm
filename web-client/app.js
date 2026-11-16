// Admin console logic. Talks to the server REST API and listens on a WebSocket
// for live events so the dashboard updates the moment a device enrols or reports.

const api = {
  async get(p) { return (await fetch(p)).json(); },
  async post(p, body) {
    const r = await fetch(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    if (!r.ok) throw new Error((await r.json()).error || r.statusText);
    return r.json();
  },
};

const el = (id) => document.getElementById(id);
let policies = [];

function log(msg) {
  const box = el('log');
  const row = document.createElement('div');
  const time = new Date().toLocaleTimeString();
  row.innerHTML = `<span class="t">${time}</span> &nbsp;${msg}`;
  box.prepend(row);
}

function fmtTime(ts) {
  if (!ts) return '—';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return new Date(ts).toLocaleString();
}

// --- policies ---------------------------------------------------------------
async function loadPolicies() {
  const { policies: p } = await api.get('/api/policies');
  policies = p;
  const sel = el('policySelect');
  sel.innerHTML = '';
  for (const pol of p) {
    const o = document.createElement('option');
    o.value = pol.name;
    o.textContent = pol.displayName || pol.name;
    sel.appendChild(o);
  }
  renderDisclosure();
}

function renderDisclosure() {
  const name = el('policySelect').value;
  const pol = policies.find((p) => p.name === name);
  const box = el('disclosure');
  if (!pol || !pol.disclosures) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `<strong>What the owner is told</strong><ul>${pol.disclosures.map((d) => `<li>${d}</li>`).join('')}</ul>`;
}

// --- enrolment --------------------------------------------------------------
async function generateToken() {
  const policyName = el('policySelect').value;
  try {
    const { qrDataUrl, qrPayload } = await api.post('/api/enroll-tokens', { policyName });
    el('qrImg').src = qrDataUrl;
    el('qrBox').hidden = false;
    el('qrLink').textContent = qrPayload.startsWith('http') ? qrPayload : '(Google provisioning payload)';
    log(`Enrolment QR created for policy <b>${policyName}</b>`);
  } catch (e) {
    log(`<span style="color:var(--red)">Error: ${e.message}</span>`);
  }
}

// --- devices ----------------------------------------------------------------
async function loadDevices() {
  const { devices } = await api.get('/api/devices');
  renderDevices(devices);
}

function renderDevices(devices) {
  const wrap = el('devices');
  const live = devices.filter((d) => d.state !== 'DELETED');
  if (!live.length) {
    wrap.innerHTML = '<div class="empty" id="emptyState">No devices enrolled yet. Generate a QR and enrol one.</div>';
    return;
  }
  wrap.innerHTML = '';
  for (const d of live) wrap.appendChild(deviceCard(d));
}

function deviceCard(d) {
  const card = document.createElement('div');
  card.className = 'device-card';
  const c = d.compliance || {};
  const compliant = c.passwordCompliant !== false && c.encryptionEnabled !== false;

  card.innerHTML = `
    <div class="head">
      <div>
        <div class="name">${d.name}</div>
        <div class="meta">${d.model || ''} · Android ${d.androidVersion || '—'}</div>
      </div>
      <span class="badge ${compliant ? 'ok' : 'warn'}">${compliant ? 'Compliant' : 'Attention'}</span>
    </div>
    <div class="meta"><span class="status-dot ${d.state === 'ACTIVE' ? 'active' : 'deleted'}"></span>${d.state} · policy: <b>${d.policyName || '—'}</b></div>
    <div class="meta">Last check-in: ${fmtTime(d.lastReportAt)}${typeof d.battery === 'number' ? ` · 🔋 ${d.battery}%` : ''}${d.locked ? ' · 🔒 locked' : ''}</div>
    <div class="compliance">
      ${c.encryptionEnabled !== false ? '<span class="badge ok">Encrypted</span>' : '<span class="badge warn">Not encrypted</span>'}
      ${c.passwordCompliant !== false ? '<span class="badge ok">Passcode set</span>' : '<span class="badge warn">No passcode</span>'}
    </div>
    <div class="card-actions">
      <button class="secondary small" data-cmd="LOCK">Lock</button>
      <button class="secondary small" data-cmd="RESET_PASSWORD">Reset passcode</button>
      <button class="secondary small" data-cmd="REBOOT">Reboot</button>
      <button class="danger small" data-cmd="WIPE">Wipe company data</button>
    </div>
  `;

  card.querySelectorAll('button[data-cmd]').forEach((b) => {
    b.addEventListener('click', async () => {
      const type = b.dataset.cmd;
      if (type === 'WIPE' && !confirm(`Wipe company data from ${d.name}? This removes it from management.`)) return;
      try {
        await api.post(`/api/devices/${d.id}/commands`, { type });
        log(`Command <b>${type}</b> sent to ${d.name}`);
      } catch (e) {
        log(`<span style="color:var(--red)">Error: ${e.message}</span>`);
      }
    });
  });
  return card;
}

// --- live events ------------------------------------------------------------
function connectWs() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    switch (msg.type) {
      case 'hello':
        setMode(msg.mode); break;
      case 'device-enrolled':
        log(`📱 Device enrolled: <b>${msg.device.name}</b>`); loadDevices(); break;
      case 'device-reported':
        loadDevices(); break;
      case 'command-issued':
        log(`✓ ${msg.command.type} acknowledged by device`); loadDevices(); break;
      case 'token-created':
        break;
      case 'policy-updated':
        log(`Policy updated: <b>${msg.policy.name}</b>`); loadPolicies(); break;
    }
  };
  ws.onclose = () => setTimeout(connectWs, 1500);
}

function setMode(mode) {
  const pill = el('modePill');
  pill.textContent = mode === 'real' ? 'REAL · Android Management API' : 'SIMULATION';
  pill.className = `mode-pill ${mode}`;
}

// --- init -------------------------------------------------------------------
el('genToken').addEventListener('click', generateToken);
el('refresh').addEventListener('click', loadDevices);
el('policySelect').addEventListener('change', renderDisclosure);

(async function init() {
  try {
    const health = await api.get('/api/health');
    setMode(health.mode);
  } catch {}
  await loadPolicies();
  await loadDevices();
  connectWs();
  log('Console ready.');
})();
