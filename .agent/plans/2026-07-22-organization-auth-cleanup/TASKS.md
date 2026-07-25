# Frontend Tasks

Working branch: `frontend-organization-auth-cleanup`, created from current `main`.

## ORG-AUTH-FE-01 — Remove unrelated product surfaces

- [x] Remove Google/GitHub buttons, provider config and provider API methods.
- [x] Remove the support-widget demo route, configuration and feature bundle.
- [x] Remove the legacy `/demo` route from the application entry.
- [x] Remove corresponding environment examples and README sections.

Acceptance: the app exposes only register, verify, login and authenticated chat; `npm run build` passes.

Commit: `task(org-auth-cleanup.01): remove unrelated frontend flows`

## ORG-AUTH-FE-02 — Align auth and session contracts

- [x] Match request/response types to the final backend OpenAPI contract.
- [x] Remove browser-supplied tenant/organization identity.
- [x] Preserve the current refresh token when refresh returns only a new access token.
- [x] Keep messaging access token use consistent for REST and WebSocket.
- [x] Normalize backend error payloads without exposing account existence.

Acceptance: login, refresh, reload, logout and expired-access recovery work against the backend contract.

Commit: `task(org-auth-cleanup.02): align auth session contract`

## ORG-AUTH-FE-03 — Add email verification flow

- [x] After registration, show an OTP verification screen instead of entering chat.
- [x] Add verify and resend API calls and UI states.
- [x] Store tokens only after successful verification or verified login.
- [x] Route a verification-required login response to the OTP screen.
- [x] Never display whether an arbitrary email already has an account.

Acceptance: unverified registration cannot render chat; successful OTP verification enters the authenticated application.

Commit: `task(org-auth-cleanup.03): add registration otp flow`

## ORG-AUTH-FE-04 — Use authenticated user/contact routes

- [x] Replace legacy `/contacts` calls with `/me/contacts` calls.
- [x] Remove demo-user naming and APIs from the main client.
- [x] Use registered users in search and direct-conversation UI.
- [x] Confirm WebSocket reconnect uses the refreshed messaging access token.

Acceptance: two verified browser users can find each other, open a conversation and exchange messages.

Commit: `task(org-auth-cleanup.04): align authenticated chat routes`

## ORG-AUTH-FE-05 — Final cleanup and checks

- [x] Remove dead imports, styles, files and environment declarations.
- [x] Update README and the two-browser manual checklist.
- [x] Run `npm install` and `npm run build`.
- [x] Record that lint/tests are unavailable unless scripts are added by an explicit task.
- [x] Update task state and `.agent/state/HANDOFF.md`.

Acceptance: production build succeeds and documentation describes only the supported organization flow.

Commit: `task(org-auth-cleanup.05): verify organization frontend flow`
