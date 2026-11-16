// Simulated device (the "phone" side of the demo).
//
// Opened by scanning the enrolment QR in sim mode: device.html?token=XXX.
// It shows the management terms the owner must ACCEPT before anything happens —
// that consent step is the whole point. After enrolling it reports status
// periodically and reflects any command the admin issues (lock, wipe, reboot).

const el = (id) => document.getElementById(id);
const api = {
  async get(p) { return (await fetch(p)).json(); },
  async post(p, body) {
    const r = await fetch(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    if (!r.ok) throw new Error((await r.json()).error || r.statusText);
    return r.json();
  },
};

const token = new URLSearchParams(location.search).get('token');
let deviceId = null;
let policy = null;
let battery = 92;

const APP_ICONS = { 'com.google.android.gm': '✉️', 'com.microsoft.teams': '👥', 'com.slack': '💬', 'com.example.kioskapp': '🖥️' };

async function loadTerms() {
  // Show what this enrolment will allow, pulled from the chosen policy.
  try {
    const { policies } = await api.get('/api/policies');
    // We don't know the policy name from the token alone in this simple demo,
    // so show the standard disclosures as a representative example.
    policy = policies[0];
    const disclosures = policy?.disclosures || ['This device will be managed by your organisation.'];
    el('terms').innerHTML = `This enrolment will allow your organisation to:
      <ul>${disclosures.map((d) => `<li>${d}</li>`).join('')}</ul>`;
  } catch {
    el('terms').textContent = 'Could not reach the management server.';
  }
}

async function enrol() {
  try {
    const { device } = await api.post('/api/devices/enroll', {
      token,
      deviceInfo: { name: 'Pixel 8 (Simulated)', model: 'Pixel 8', androidVersion: '15' },
    });
    deviceId = device.id;
    showHome(device);
    startReporting();
    pollState();
  } catch (e) {
    el('terms').innerHTML = `<span style="color:var(--red)">Enrolment failed: ${e.message}</span>`;
  }
}

function showHome(device) {
  el('consentPane').hidden = true;
  el('homePane').hidden = false;
  el('homeMeta').textContent = `${device.model} · Android ${device.androidVersion} · policy: ${device.policyName}`;
  const apps = (policy?.applications) || [];
  el('appGrid').innerHTML = apps.map((a) =>
    `<div class="app-icon"><div class="ic">${APP_ICONS[a.packageName] || '📦'}</div>${a.displayName || a.packageName}</div>`
  ).join('');
}

// Periodic status report — benign telemetry only.
function startReporting() {
  setInterval(async () => {
    if (!deviceId) return;
    battery = Math.max(5, battery - 1);
    try {
      await api.post(`/api/devices/${deviceId}/report`, {
        battery,
        compliance: { passwordCompliant: true, encryptionEnabled: true, unknownSourcesDisabled: true },
      });
    } catch {}
  }, 5000);
}

// Poll our own state so admin commands (lock/wipe) show up on the "phone".
function pollState() {
  setInterval(async () => {
    if (!deviceId) return;
    try {
      const { device } = await api.get(`/api/devices/${deviceId}`);
      el('statusbar').textContent = `Simulated device · 🔋 ${device.battery ?? battery}%`;
      el('lockOverlay').hidden = !device.locked;
      if (device.state === 'DELETED' || device.wiped) {
        document.body.innerHTML = '<div class="panel" style="max-width:360px;text-align:center;"><h2>Company data wiped</h2><p style="color:var(--muted)">This device has been removed from management. Personal data on a real device would be untouched.</p></div>';
      }
    } catch {}
  }, 2000);
}

el('acceptBtn').addEventListener('click', enrol);
el('declineBtn').addEventListener('click', () => {
  document.body.innerHTML = '<div class="panel" style="max-width:360px;text-align:center;"><h2>Enrolment declined</h2><p style="color:var(--muted)">Nothing was installed. On a real device you simply keep using it unmanaged.</p></div>';
});
el('unlockBtn').addEventListener('click', async () => {
  try { await api.post(`/api/devices/${deviceId}/unlock`, {}); } catch {}
});

if (!token) {
  el('terms').innerHTML = '<span style="color:var(--red)">No enrolment token. Open this page by scanning the QR in the admin console.</span>';
  el('acceptBtn').disabled = true;
} else {
  loadTerms();
}
