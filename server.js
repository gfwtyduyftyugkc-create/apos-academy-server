const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'apos-academy-secret-change-me';

// Demo credentials
const DEMO_USER = 'valori';
const DEMO_PASS = '2378';

app.set('trust proxy', true);
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8, httpOnly: true, sameSite: 'lax' },
}));

// ---------- Auth ----------
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  if (username === DEMO_USER && password === DEMO_PASS) {
    req.session.user = username;
    return res.json({ ok: true, user: username });
  }
  res.status(401).json({ ok: false, error: 'Invalid username or password' });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.get('/api/auth/me', (req, res) => {
  if (req.session && req.session.user) {
    return res.json({ authenticated: true, user: req.session.user });
  }
  res.json({ authenticated: false });
});

function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  return res.redirect('/login.html');
}

// ---------- Device-facing (desktop tool) ----------
app.post('/api/heartbeat', (req, res) => {
  const { hwid, cpu, gpu, ram, os, osInstallDate } = req.body || {};
  if (!hwid || typeof hwid !== 'string') {
    return res.status(400).json({ ok: false, error: 'hwid is required' });
  }
  const device = db.touchDevice(hwid.trim(), { cpu, gpu, ram, os, osInstallDate });
  res.json({
    ok: true,
    active: device.status === 'active',
    status: device.status,
    message: device.status === 'active' ? 'Device is active.' : 'Device is not active. Contact admin.',
  });
});

app.get('/api/device/status', (req, res) => {
  const { hwid } = req.query;
  if (!hwid) return res.status(400).json({ ok: false, error: 'hwid is required' });
  const device = db.touchDevice(hwid.trim(), null);
  res.json({
    active: device.status === 'active',
    status: device.status,
    message: device.status === 'active' ? 'Device is active.' : 'Device is not active. Contact admin.',
  });
});

// Close session (called by desktop app on Exit from tray)
app.post('/api/device/close', (req, res) => {
  const { hwid } = req.body || {};
  if (!hwid) return res.status(400).json({ ok: false, error: 'hwid is required' });
  db.closeSession(hwid.trim());
  res.json({ ok: true, message: 'Session closed.' });
});

app.post('/api/device/info', (req, res) => {
  const { hwid, cpu, gpu, ram, os, osInstallDate } = req.body || {};
  if (!hwid) return res.status(400).json({ ok: false, error: 'hwid is required' });
  db.touchDevice(hwid.trim(), { cpu, gpu, ram, os, osInstallDate });
  res.json({ ok: true, message: 'System information saved.' });
});

app.get('/api/device/:hwid', (req, res) => {
  const device = db.getDevice(req.params.hwid);
  if (!device) return res.status(404).json({ ok: false, error: 'Device not found' });
  res.json({ ok: true, device, online: db.isOnline(device) });
});

// ---------- Admin (session-protected) ----------
app.get('/api/admin/devices', requireAuth, (req, res) => {
  const devices = db.listDevices().map((d) => ({ ...d, online: db.isOnline(d) }));
  res.json({ ok: true, devices, onlineThresholdMs: db.ONLINE_THRESHOLD_MS });
});

app.post('/api/admin/activate', requireAuth, (req, res) => {
  const { hwid, discordUsername, discordId, discordAvatar } = req.body || {};
  if (!hwid) return res.status(400).json({ ok: false, error: 'hwid is required' });
  if (!discordUsername) return res.status(400).json({ ok: false, error: 'discordUsername is required' });
  const code = hwid.trim();
  if (!db.getDevice(code)) {
    return res.status(404).json({ ok: false, error: 'Device not registered. The user must open the app first.' });
  }
  const avatar = (discordAvatar && discordAvatar.trim()) ? discordAvatar.trim() : null;
  db.setDiscord(code, discordId ? discordId.trim() : null, discordUsername.trim(), avatar);
  db.setStatus(code, 'active');
  res.json({ ok: true, message: 'Device activated.', device: db.getDevice(code) });
});

app.post('/api/admin/deactivate', requireAuth, (req, res) => {
  const { hwid } = req.body || {};
  if (!hwid) return res.status(400).json({ ok: false, error: 'hwid is required' });
  if (!db.getDevice(hwid)) return res.status(404).json({ ok: false, error: 'Device not found' });
  db.setStatus(hwid.trim(), 'not_active');
  res.json({ ok: true, message: 'Device deactivated.', device: db.getDevice(hwid.trim()) });
});

app.post('/api/admin/device/add', requireAuth, (req, res) => {
  const { hwid, discordUsername, discordAvatar } = req.body || {};
  if (!hwid || typeof hwid !== 'string') {
    return res.status(400).json({ ok: false, error: 'hwid is required' });
  }
  const code = hwid.trim();
  const existing = db.getDevice(code);
  if (!existing) db.upsertDevice(code);
  if (discordUsername) {
    const avatar = (discordAvatar && discordAvatar.trim()) ? discordAvatar.trim() : null;
    db.setDiscord(code, null, discordUsername.trim(), avatar);
  }
  res.json({ ok: true, message: existing ? 'Device already exists (updated).' : 'Device added.', device: db.getDevice(code) });
});

// Link Discord ID to an existing device (without changing status)
app.post('/api/admin/device/link', requireAuth, (req, res) => {
  const { hwid, discordUsername, discordAvatar } = req.body || {};
  if (!hwid || !discordUsername) return res.status(400).json({ ok: false, error: 'hwid and discordUsername are required' });
  const code = hwid.trim();
  if (!db.getDevice(code)) db.upsertDevice(code);
  const avatar = (discordAvatar && discordAvatar.trim()) ? discordAvatar.trim() : null;
  db.setDiscord(code, null, discordUsername.trim(), avatar);
  res.json({ ok: true, message: 'Discord linked.', device: db.getDevice(code) });
});

app.delete('/api/admin/device/:hwid', requireAuth, (req, res) => {
  const hwid = req.params.hwid;
  if (!db.getDevice(hwid)) return res.status(404).json({ ok: false, error: 'Device not found' });
  db.deleteDevice(hwid);
  res.json({ ok: true, message: 'Device deleted.' });
});

// Archive (last 3 days open/close history)
app.get('/api/admin/device/:hwid/archive', requireAuth, (req, res) => {
  const data = db.getArchive(req.params.hwid);
  if (!data) return res.status(404).json({ ok: false, error: 'Device not found' });
  res.json({ ok: true, ...data });
});

// ---------- Page routes ----------
app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});
app.get('/login', (req, res) => res.redirect('/login.html'));

// Protect dashboard root
app.get('/', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Static files (login assets etc.) served after auth check for protected pages
app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
  if (req.session && req.session.user) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  } else {
    res.redirect('/login.html');
  }
});

(async () => {
  await db.initDb();
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Demo login: ${DEMO_USER} / ${DEMO_PASS}`);
  });
})();
