# Frontend Decisions

- Backend configuration controls `STRICT_DOMAIN`; the frontend does not duplicate domain validation.
- The UI may display organization guidance, but backend validation remains authoritative.
- Google Drive integration is a later independent settings feature.
- No generic auth-profile or multi-product frontend configuration is introduced.
- The existing session-storage approach is retained for this cleanup.
