const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'devices.json');

const ONLINE_THRESHOLD_MS = 20 * 1000; // 20s without heartbeat -> offline

let devices = {}; // hwid -> device record

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function load() {
  ensureDir();
  if (fs.existsSync(DB_PATH)) {
    try {
      const raw = fs.readFileSync(DB_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      devices = (parsed && typeof parsed === 'object') ? parsed : {};
      // Migration: normalize legacy session fields (start/end -> openTime/closeTime)
      Object.values(devices).forEach((d) => {
        if (!Array.isArray(d.sessions)) d.sessions = [];
        d.sessions = d.sessions.map((s) => ({
          openTime: s.openTime || s.start || null,
          closeTime: s.closeTime || s.end || null,
        })).filter((s) => s.openTime);
        if (d.osInstallDate === undefined) d.osInstallDate = null;
        if (d.discordId === undefined) d.discordId = null;
        if (d.discordUsername === undefined) d.discordUsername = null;
        if (d.discordAvatar === undefined) d.discordAvatar = null;
      });
    } catch (e) {
      console.error('Failed to read devices.json, starting fresh:', e.message);
      devices = {};
    }
  } else {
    devices = {};
  }
}

function save() {
  ensureDir();
  // Atomic-ish write: write to temp then rename
  const tmp = DB_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(devices, null, 2));
  fs.renameSync(tmp, DB_PATH);
}

function now() { return new Date().toISOString(); }

async function initDb() {
  load();
  return devices;
}

function getDevice(hwid) {
  return devices[hwid] ? { ...devices[hwid] } : null;
}

function upsertDevice(hwid) {
  if (devices[hwid]) return { ...devices[hwid] };
  const t = now();
  devices[hwid] = {
    hwid,
    status: 'not_active',
    cpu: null,
    gpu: null,
    ram: null,
    os: null,
    osInstallDate: null,
    discordId: null,
    discordUsername: null,
    discordAvatar: null,
    last_seen: null,
    created_at: t,
    updated_at: t,
    activated_at: null,
    sessions: [],
  };
  save();
  return { ...devices[hwid] };
}

const SESSION_GAP_MS = 20 * 1000;
const ARCHIVE_DAYS = 3;

function touchDevice(hwid, info) {
  if (!devices[hwid]) upsertDevice(hwid);
  const d = devices[hwid];
  const t = now();
  const nowMs = Date.now();
  const prevLast = d.last_seen ? new Date(d.last_seen).getTime() : null;

  if (!Array.isArray(d.sessions)) d.sessions = [];

  // Session tracking based on heartbeat gaps
  if (prevLast === null || (nowMs - prevLast) > SESSION_GAP_MS) {
    // Finalize previous open session (if any) with its last heartbeat time
    if (d.sessions.length) {
      const last = d.sessions[d.sessions.length - 1];
      if (last.closeTime === null) last.closeTime = d.last_seen || t;
    }
    d.sessions.push({ openTime: t, closeTime: null });
  } else if (d.sessions.length) {
    // Keep closeTime null while running (do not stamp until close)
    const last = d.sessions[d.sessions.length - 1];
    if (last.closeTime !== null) {
      // reopen? shouldn't happen; ensure null while active
      last.closeTime = null;
    }
  } else {
    d.sessions.push({ openTime: t, closeTime: null });
  }

  // Prune sessions older than ARCHIVE_DAYS
  const cutoff = nowMs - ARCHIVE_DAYS * 24 * 60 * 60 * 1000;
  d.sessions = d.sessions.filter((s) => new Date(s.openTime).getTime() >= cutoff);

  if (info) {
    if (info.cpu) d.cpu = info.cpu;
    if (info.gpu) d.gpu = info.gpu;
    if (info.ram) d.ram = info.ram;
    if (info.os) d.os = info.os;
    if (info.osInstallDate) d.osInstallDate = info.osInstallDate;
  }
  d.last_seen = t;
  d.updated_at = t;
  save();
  return { ...d };
}

function getArchive(hwid) {
  const d = devices[hwid];
  if (!d) return null;
  const cutoff = Date.now() - ARCHIVE_DAYS * 24 * 60 * 60 * 1000;
  const online = isOnline(d);
  const sessions = (d.sessions || [])
    .filter((s) => new Date(s.openTime).getTime() >= cutoff)
    .map((s) => {
      let closeTime = s.closeTime;
      // If session still open but device offline -> treat as timed-out close
      if (closeTime === null && !online) {
        closeTime = d.last_seen || s.openTime;
      }
      return { openTime: s.openTime, closeTime, running: closeTime === null };
    })
    .sort((a, b) => new Date(b.openTime) - new Date(a.openTime));
  return { hwid, sessions, online };
}

function setStatus(hwid, status) {
  const d = devices[hwid];
  if (!d) return null;
  const t = now();
  d.status = status;
  d.updated_at = t;
  if (status === 'active') d.activated_at = t;
  save();
  return { ...d };
}

function saveInfo(hwid, info) {
  const d = devices[hwid];
  if (!d) return null;
  const t = now();
  if (info.cpu !== undefined) d.cpu = info.cpu;
  if (info.gpu !== undefined) d.gpu = info.gpu;
  if (info.ram !== undefined) d.ram = info.ram;
  if (info.os !== undefined) d.os = info.os;
  if (info.osInstallDate !== undefined) d.osInstallDate = info.osInstallDate;
  d.updated_at = t;
  save();
  return { ...d };
}

function listDevices() {
  const nowMs = Date.now();
  return Object.values(devices)
    .map((d) => {
      const online = !!d.last_seen && (nowMs - new Date(d.last_seen).getTime()) <= ONLINE_THRESHOLD_MS;
      return { ...d, online };
    })
    .sort((a, b) => new Date(b.last_seen || b.created_at) - new Date(a.last_seen || a.created_at));
}

function isOnline(device) {
  if (!device || !device.last_seen) return false;
  return Date.now() - new Date(device.last_seen).getTime() <= ONLINE_THRESHOLD_MS;
}

function deleteDevice(hwid) {
  if (devices[hwid]) {
    delete devices[hwid];
    save();
  }
}

function setDiscord(hwid, discordId, discordUsername, discordAvatar) {
  const d = devices[hwid];
  if (!d) return null;
  const t = now();
  d.discordId = discordId || d.discordId;
  d.discordUsername = discordUsername || d.discordUsername;
  if (discordAvatar !== undefined) d.discordAvatar = discordAvatar;
  d.updated_at = t;
  save();
  return { ...d };
}

function closeSession(hwid) {
  const d = devices[hwid];
  if (!d) return null;
  const t = now();
  if (Array.isArray(d.sessions) && d.sessions.length) {
    const last = d.sessions[d.sessions.length - 1];
    if (last.closeTime === null) last.closeTime = t;
  }
  d.last_seen = t;
  d.updated_at = t;
  save();
  return { ...d };
}

function persist() { save(); }

module.exports = {
  initDb,
  getDevice,
  upsertDevice,
  touchDevice,
  setStatus,
  saveInfo,
  listDevices,
  isOnline,
  deleteDevice,
  getArchive,
  closeSession,
  setDiscord,
  persist,
  ONLINE_THRESHOLD_MS,
};
