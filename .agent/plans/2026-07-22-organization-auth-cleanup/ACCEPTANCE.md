# Frontend Acceptance

- No social-auth, support-widget or legacy-demo entry remains.
- Registration leads to OTP verification, not chat.
- Tokens are stored only after verification or verified login.
- Refresh and WebSocket reconnection use the backend contract correctly.
- Contact calls use authenticated current-user routes.
- Two verified browser users can exchange messages.
- `npm run build` passes.
