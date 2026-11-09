# Hosted provisioning — 9 November 2026

Free Supabase project `our-marvel-family`, Frankfurt, ref `bvzyiidmxlzrvhfvxdid`.

Applied foundation, social, operations, delivery/storage, privacy, media notifications, catalog and delivery Vault migrations. Catalog: 81 projects. Zero public app tables without RLS. No family accounts created yet. Owner bootstrap and original greeting provisioned privately; neither text nor delivery secrets are in this repository.

Deployed media-upload and push-dispatch with authentication inside each handler. Live unauthorized POST checks: both 401. Authorized dispatcher invocation: HTTP 200, processed=0, accepted=0 (no registered devices). This does not verify push delivery. Scheduled dispatcher every minute; secrets encrypted in Vault, read only by service role.

Security advisor findings: private deny-all tables intentionally have no policies; authenticated SECURITY DEFINER RPCs intentionally expose guarded atomic operations. These require continued review; the advisor is not a proof of security. https://supabase.com/docs/guides/database/database-linter

Still pending: Auth redirect and production SMTP configuration, live two-account integration tests, real device subscriptions and delivery, frontend public configuration, final release. Production v1 remains unchanged.
