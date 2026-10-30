# HWID Admin Dashboard (Web + Backend)

Express + sql.js (pure-JS SQLite) backend with an admin-only dashboard.
Works with the Electron desktop tool in `../hwid-tool`.

## Endpoints

Device-facing (used by desktop tool):
- `POST /api/heartbeat` body `{ hwid, cpu?, gpu?, ram?, os? }` -> auto-registers device, updates last_seen, returns `{ active, status, message }`
- `GET  /api/device/status?hwid=` -> same as above (also touches last_seen)
- `POST /api/device/info` body `{ hwid, cpu, gpu, ram, os }`
- `GET  /api/device/:hwid`

Admin (header `x-admin-token` or `?token=`):
- `GET  /api/admin/devices` -> list with online/offline computed
- `POST /api/admin/activate` body `{ hwid }`
- `POST /api/admin/deactivate` body `{ hwid }`
- `POST /api/admin/device/add` body `{ hwid }` (manual add)
- `DELETE /api/admin/device/:hwid`

Online = last heartbeat within 20s.

## Run
```bash
cd hwid-web
npm install
npm start   # http://localhost:3000
```
Default admin token: `change-me-admin-token` (override with `ADMIN_TOKEN`).

## Flow
1. Desktop tool opens -> sends heartbeat every 5s with HWID + hardware info.
2. Server auto-registers device as `not_active` if new.
3. Admin opens dashboard, enters token -> sees all devices with Online/Offline (green/red), HWID, CPU, GPU, RAM, OS, Last Seen.
4. Admin activates/deactivates with one click.
5. Tool's next heartbeat/status reflects the new status and updates its UI.
