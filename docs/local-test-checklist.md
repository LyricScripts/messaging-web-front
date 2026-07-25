# Local Test Checklist

Use this checklist after starting the backend and frontend. Use two independent
browser sessions, such as a normal window and a private window, so each account
has its own session storage.

## Setup

- [ ] Backend is running on `http://<host-ip>:8080`.
- [ ] Frontend is running on `http://<host-ip>:5173`.
- [ ] Browser can open the frontend from the Ubuntu PC.
- [ ] Another device on the same network can open the frontend.
- [ ] Backend CORS allows the frontend origin.

## Backend Connectivity

- [ ] API base URL is `http://<host-ip>:8080`.
- [ ] WebSocket URL is `ws://<host-ip>:8080/ws`.
- [ ] Backend health and readiness endpoints return ok.

## Two Accounts

- [ ] Browser A registers user A and shows the email verification screen.
- [ ] Browser A verifies user A with the OTP and enters authenticated chat.
- [ ] Browser B registers user B and shows the email verification screen.
- [ ] Browser B verifies user B with the OTP and enters authenticated chat.
- [ ] Verified existing users can sign in without seeing the verification screen.
- [ ] A verification-required sign-in routes back to the OTP screen without exposing whether arbitrary emails exist.
- [ ] Each header shows the correct `/auth/me` profile.
- [ ] Refreshing either page restores only that browser session.
- [ ] Signing out clears the session and returns to the auth screen.

## Contacts And Conversation

- [ ] User A searches for user B by email or username.
- [ ] User A adds user B and the contact appears in the list.
- [ ] Adding the same contact again shows a clean conflict state.
- [ ] Selecting the contact resolves a direct conversation.
- [ ] Both browsers show connected, joined, and disconnected states accurately.
- [ ] Selecting the conversation loads existing message history.

## Messaging

- [ ] User A sends a text message and both browsers render it on the correct side.
- [ ] User B sends a reply and both browsers render it on the correct side.
- [ ] Delivered and seen receipts update without a page refresh.
- [ ] Reopening the conversation preserves message ordering and history.
- [ ] Disconnecting the socket does not show a false successful send.

## Files

- [ ] User A selects a file and sees its pending state.
- [ ] Upload uses the messaging session and shows in-progress state.
- [ ] The resulting file message includes its attachment metadata and link.
- [ ] User B receives and can inspect the same attachment message.
- [ ] Oversized and unsupported files show clear errors when rejected by the backend.

## Docker Frontend

- [ ] `docker compose config` passes.
- [ ] `docker compose up --build` serves the frontend.
- [ ] Static frontend opens at `http://<host-ip>:5173`.
- [ ] API and WebSocket URLs are correct for the LAN host.
