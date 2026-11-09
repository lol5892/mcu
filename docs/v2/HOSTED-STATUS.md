# Hosted provisioning — 9 November 2026

Free Supabase project `our-marvel-family`, Frankfurt, ref `bvzyiidmxlzrvhfvxdid`.

Applied foundation, social, operations, delivery/storage, privacy, media notifications, catalog and delivery Vault migrations. Catalog: 81 projects. Zero public app tables without RLS. No family accounts created yet. Owner bootstrap and original greeting provisioned privately; neither text nor delivery secrets are in this repository.

Deployed media-upload and push-dispatch with authentication inside each handler. Live unauthorized POST checks: both 401. Authorized dispatcher invocation: HTTP 200, processed=0, accepted=0 (no registered devices). This does not verify push delivery. Scheduled dispatcher every minute; secrets encrypted in Vault, read only by service role.

Security advisor findings: private deny-all tables intentionally have no policies; authenticated SECURITY DEFINER RPCs intentionally expose guarded atomic operations. These require continued review; the advisor is not a proof of security. https://supabase.com/docs/guides/database/database-linter

Owner reports Auth Site URL and redirect configured for the existing Pages URL. Auth settings endpoint verified: email enabled, confirmation required. Owner configured Yandex custom SMTP; initial SMTP 535 access denial resolved after enabling mail clients in Yandex settings. A fresh real Auth OTP request returned HTTP 200 on 9 November 2026. Owner confirmed inbox receipt. Successful authenticated session remains unverified; never request codes in chat.

Cloud-configured frontend build succeeds. GitHub Actions variables API remains unavailable to the current integration (HTTP 403); release configuration still needs a supported path.

Still pending: inbox receipt, live two-account integration tests, real device subscriptions and delivery, final release. Separate preview is being published at /mcu/preview/ while v1 remains at the existing root URL. Production v1 remains unchanged.

Preview browser smoke: 390×844 auth screen, no JavaScript errors, offline shell, existing production cache preserved. Production v1 rebuilt separately: 11 tests pass. Public publishable key and VAPID public key are intentionally browser-visible; private keys remain in Vault.
