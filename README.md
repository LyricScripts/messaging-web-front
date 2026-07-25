# Messaging Web Front

Simple chat frontend for the reusable messaging backend service.

This repository is **frontend only**.

Backend repository:

```text
https://github.com/almas-alright/messaging-service
```

## Goal

Build a simple WhatsApp-like chat UI that can run on your Ubuntu PC and connect to the local messaging backend through configurable URLs.

Standalone local chat:

- Vite + React + TypeScript
- Configurable backend API base URL
- Configurable WebSocket URL
- Email/password registration, OTP verification, and login through the messaging backend
- Messaging access/refresh token session lifecycle
- Authenticated contacts and one-to-one conversations
- Message list
- Emoji support
- File upload/send
- Attachment preview/link
- Local network testing from other computers

Future direction:

- Compact floating chat window
- Voice message sending
- Optional AI bot per chat side
- Human takeover from AI bot

## Not In This Frontend

- Full marketplace frontend
- AI bot implementation
- Voice messages
- Production support-agent dashboard

Those are future phases.

## Local Installation Plan

Both backend and frontend can run on the same Ubuntu PC.

Prerequisites:

- Node.js 20 or newer
- npm
- Docker with Docker Compose
- Running messaging backend on port `8080`

Backend example:

```bash
git clone https://github.com/almas-alright/messaging-service.git
cd messaging-service
docker compose up --build
```

Frontend local run:

```bash
git clone https://github.com/almas-alright/messaging-web-front.git
cd messaging-web-front
cp .env.example .env.local
npm install
npm run dev -- --host 0.0.0.0
```

The app defaults to:

```env
VITE_API_BASE_URL=http://localhost:8080
VITE_WS_BASE_URL=ws://localhost:8080/ws
```

For LAN testing, create a local `.env.local` file:

```env
VITE_API_BASE_URL=http://192.168.1.10:8080
VITE_WS_BASE_URL=ws://192.168.1.10:8080/ws
```

Use your Ubuntu PC LAN IP instead of `192.168.1.10`.

Other computers on the same local network can open:

```text
http://192.168.1.10:5173
```

## Local Network Test Guide

Use this when the backend and frontend run on one Ubuntu PC and other devices
on the same Wi-Fi/LAN need to test the chat.

1. Find the Ubuntu PC LAN IP:

```bash
hostname -I
```

Use the first address that matches your local network, for example
`192.168.1.10` or `10.10.33.97`.

2. Start the backend from the backend repository:

```bash
cd ../messaging-service
docker compose up --build
```

Backend URLs should be reachable from the Ubuntu PC:

```text
http://<host-ip>:8080/health
http://<host-ip>:8080/ready
```

3. Configure the frontend for LAN access.

Create `.env.local` in this repository:

```bash
cp .env.example .env.local
```

Then edit `.env.local`:

```env
VITE_API_BASE_URL=http://<host-ip>:8080
VITE_WS_BASE_URL=ws://<host-ip>:8080/ws
```

4. Start the frontend dev server:

```bash
npm install
npm run dev -- --host 0.0.0.0
```

Open from the Ubuntu PC:

```text
http://localhost:5173
```

Open from another device on the same network:

```text
http://<host-ip>:5173
```

5. Authenticated organization chat flow:

- Register two accounts in separate browser sessions and complete OTP verification, or sign in to two verified accounts.
- Search for the other user by email or username and add them as a contact.
- Select the contact to resolve the direct conversation and connect live chat.
- Confirm message history loads, then send text and file messages.
- Confirm delivered/seen receipts update in both browser sessions.

The main app is served at `/`.

Make sure firewall rules allow inbound traffic to ports `5173` and `8080` on
the Ubuntu PC during local testing.

For a repeatable walkthrough, use
[docs/local-test-checklist.md](docs/local-test-checklist.md).

For frontend/backend ownership details, see
[docs/config-boundary.md](docs/config-boundary.md).

Release notes are in [docs/release-notes.md](docs/release-notes.md).

## Frontend Checks

Run:

```bash
npm install
npm run build
```

`npm run lint` is not configured yet.

## Docker Static Frontend

Build and run the frontend as a static Nginx container:

```bash
docker compose up --build
```

Open:

```text
http://localhost:5173
```

For LAN test builds, pass the backend URLs at build time:

```bash
VITE_API_BASE_URL=http://<host-ip>:8080 \
VITE_WS_BASE_URL=ws://<host-ip>:8080/ws \
FRONTEND_PORT=5173 \
docker compose up --build
```

Vite embeds these values during the Docker image build.

## Backend CORS Requirement

The backend must allow local frontend origins during LAN testing, for example:

```text
http://localhost:5173
http://127.0.0.1:5173
http://192.168.1.10:5173
```

For production, CORS should be restricted to approved domains only.

## Agent Workflow

Start from:

```text
AGENTS.md
.agent/CURRENT_PLAN.md
<active-plan>/TASKS.md
```

Rules:

- One plan = one branch
- One task = one commit
- Stop after each task
- Keep this repository frontend-only
