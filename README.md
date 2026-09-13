# Nexus Chat

A self-hosted, Discord-like app with the essentials: servers, text channels, markdown chat, presence, WebRTC voice channels, and WebRTC screen sharing.

- **Backend:** Django + Django Channels + Daphne (REST + WebSocket, SQLite, token auth)
- **Frontend:** React + Vite + Tailwind CSS v4 + Zustand

## Features

- Username/password auth (token based)
- Servers with auto-created `#general` text channel + `General Voice` voice channel
- Text channels with markdown messages (bold, italic, code blocks, tables, multiline) and history
- Online/offline member list, live presence updates
- Add members via the **UserPlus** button in the members sidebar (lists all registered users)
- Voice channels: WebRTC mesh audio, mute, deafen, live participant list
- Screen sharing: WebRTC `getDisplayMedia` video with renegotiation, live tiles with LIVE badges, multiple simultaneous presenters supported

## Run it

### Backend (port 8000)

```bash
cd backend
uv sync
cp ../env.sample ../.env   # optional; defaults work for local dev
uv run python manage.py migrate
uv run daphne -b 0.0.0.0 -p 8000 config.asgi:application
```

### Frontend (port 5173, proxies /api and /ws to backend)

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173, register two users (two browsers or normal + incognito), create a server, add the second user via the members sidebar, then chat and jump on voice.

For LAN testing, open `http://<your-lan-ip>:5173` on other devices (Vite listens on all interfaces). Mic/screen permissions require `localhost` or HTTPS — plain-IP HTTP works in most browsers for mic but Chrome may block `getDisplayMedia` on insecure origins; use `localhost` or a tunnel (e.g. `ngrok http 5173`) in that case.

### Notes

- ICE uses a public STUN server (`stun:stun.l.google.com:19302`); for internet-facing deployments add a TURN server (`coturn`) to `frontend/src/ws/rtc.js`.
- Django admin available at `/admin/` (create a superuser with `uv run python manage.py createsuperuser`).
- Reset everything: delete `backend/db.sqlite3` and re-run migrations.

## How WebRTC works here

Each server has an RTC signaling WebSocket (`/ws/rtc/<server>/`). The server tracks voice participants and relays SDP/ICE between peers (full mesh). When a user joins voice, everyone already in voice receives `peer-joined` and initiates a `RTCPeerConnection` to the newcomer — exactly one side initiates, so there are no offer collisions. Screen sharing adds a `getDisplayMedia` video track to every existing connection and renegotiates; receivers render incoming video tracks as live tiles. Mute/deafen states are broadcast through the same channel so the participant list shows mic/screen icons for everyone.

## Project layout

```
backend/
  config/          Django settings, ASGI, URLs
  core/            models, REST views, WS consumers, routing
frontend/
  src/
    components/    UI (shell, sidebar, chat, members, video stage, modals)
    stores/        Zustand stores (auth, app, voice)
    ws/            chat relay + WebRTC mesh manager
    lib/           api client, formatting
```
