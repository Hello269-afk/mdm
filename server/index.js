// MDM demo server.
//
// Loads either the simulation backend (default) or the real Android Management API
// backend, and exposes a small REST API plus a WebSocket for live dashboard updates.
//
//   MODE=sim  (default) — fully self-contained, no external services.
//   MODE=real           — talks to Google's Android Management API.
//
// This is an EDUCATIONAL MDM demo. It is enrolment-based and consent-based by design:
// a device becomes managed only after its owner scans a QR and accepts the terms.
// There is no screen streaming, no remote input injection, and no covert install.

const express = require('express');
const http = require('http');
const os = require('os');
const path = require('path');
const QRCode = require('qrcode');
const { WebSocketServer } = require('ws');

const MODE = process.env.MODE === 'real' ? 'real' : 'sim';

let backend;
if (MODE === 'real') {
  const { RealBackend } = require('./backends/real');
  backend = new RealBackend();
} else {
  const { SimBackend } = require('./backends/sim');
  backend = new SimBackend();
}

const app = express();
app.use(express.json());
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// --- live updates -----------------------------------------------------------
function broadcast(event) {
  const data = JSON.stringify(event);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(data);
  }
}
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'hello', mode: MODE }));
});

// --- helpers ----------------------------------------------------------------
function getLanIP() {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}
const LAN_IP = getLanIP();
const PORT = process.env.PORT || 4000;

// Wrap async route handlers so errors become clean 400s instead of crashes.
const h = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((e) => {
    console.error('[error]', e.message);
    res.status(400).json({ error: e.message });
  });
};

// --- API --------------------------------------------------------------------
app.get('/api/health', (_, res) => res.json({ ok: true, mode: MODE }));

app.get('/api/enterprise', h(async (_, res) => {
  res.json({ mode: MODE, enterprise: await backend.getEnterprise() });
}));

app.get('/api/policies', h(async (_, res) => {
  res.json({ policies: await backend.listPolicies() });
}));

app.get('/api/policies/:name', h(async (req, res) => {
  const p = await backend.getPolicy(req.params.name);
  if (!p) return res.status(404).json({ error: 'Policy not found' });
  res.json({ policy: p });
}));

app.put('/api/policies', h(async (req, res) => {
  const policy = await backend.upsertPolicy(req.body);
  broadcast({ type: 'policy-updated', policy });
  res.json({ policy });
}));

// Create an enrolment token and a scannable QR. In sim mode the QR points at the
// device simulator page; in real mode the QR carries Google's provisioning payload.
app.post('/api/enroll-tokens', h(async (req, res) => {
  const policyName = req.body.policyName;
  const token = await backend.createEnrollmentToken(policyName);

  let qrPayload;
  if (MODE === 'real') {
    qrPayload = token.qrCode; // Google-provided provisioning JSON
  } else {
    // Point the phone (or a second browser tab) at our device simulator.
    // Hosted (e.g. Render): use the public URL. Local: use the LAN IP so a phone on
    // the same wifi can reach it.
    const base = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL
      || `http://${LAN_IP}:${PORT}`;
    qrPayload = `${base.replace(/\/$/, '')}/device.html?token=${token.value}`;
  }
  const qrDataUrl = await QRCode.toDataURL(qrPayload, { width: 320, margin: 1 });
  broadcast({ type: 'token-created', token: { value: token.value, policyName } });
  res.json({ token, qrPayload, qrDataUrl });
}));

app.get('/api/devices', h(async (_, res) => {
  res.json({ devices: await backend.listDevices() });
}));

app.get('/api/devices/:id', h(async (req, res) => {
  const d = await backend.getDevice(req.params.id);
  if (!d) return res.status(404).json({ error: 'Device not found' });
  res.json({ device: d });
}));

// Sim-only: a device simulator calls this to provision itself against a token.
app.post('/api/devices/enroll', h(async (req, res) => {
  const device = await backend.enrollDevice(req.body.token, req.body.deviceInfo || {});
  broadcast({ type: 'device-enrolled', device });
  res.json({ device });
}));

// Sim-only: a device simulator checks in with a status report.
app.post('/api/devices/:id/report', h(async (req, res) => {
  const device = await backend.reportStatus(req.params.id, req.body || {});
  broadcast({ type: 'device-reported', device });
  res.json({ device });
}));

// Issue a management command (LOCK, WIPE, REBOOT, RESET_PASSWORD, ...).
app.post('/api/devices/:id/commands', h(async (req, res) => {
  const command = await backend.issueCommand(req.params.id, req.body.type);
  const device = await backend.getDevice(req.params.id);
  broadcast({ type: 'command-issued', deviceId: req.params.id, command, device });
  res.json({ command, device });
}));

// Sim-only convenience: device clears its own lock.
app.post('/api/devices/:id/unlock', h(async (req, res) => {
  const device = await backend.unlockDevice(req.params.id);
  broadcast({ type: 'device-reported', device });
  res.json({ device });
}));

// --- static web client ------------------------------------------------------
app.use(express.static(path.join(__dirname, '../web-client')));

server.listen(PORT, () => {
  console.log('');
  console.log(`  MDM demo server running in ${MODE.toUpperCase()} mode`);
  console.log(`  Admin console:  http://localhost:${PORT}`);
  console.log(`  On your LAN:     http://${LAN_IP}:${PORT}`);
  console.log('');
  if (MODE === 'sim') {
    console.log('  Sim mode: open the admin console, create an enrolment token,');
    console.log('  then scan the QR (or open the link) to enrol a simulated device.');
  }
  console.log('');
});
