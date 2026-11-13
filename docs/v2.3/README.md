# Наш Marvel 2.3 — Наша легенда

82 fixed, versioned achievement definitions in `src/legend/registry.json` reference the frozen 81-project collection `catalog-v1.json`. Categories: Avengers path, MCU film phases, heroes, series/episodes, critics, personalized family collections. All definitions concern viewing or ratings. Phase six includes future projects and cannot unlock early. Seasons and episode counts are frozen; later catalog additions do not change the award conditions. Future-release collection metadata must be reviewed when releases actually occur; planned dates alone do not unlock projects marked future.

## Ratings

Project and season scores are independent of watched state, partner confirmation and sessions. Mark/unmark operations preserve scores. Pair average requires two project scores. Server membership, identity assignment, score constraints, season validation, CAS versions and idempotency remain enforced. The new migration changes the existing private operation implementation rather than replacing the public session/media/confirmation wrapper.

## Persistence and privacy

`mv_achievements` has one row per family and stable achievement ID. Server-side calculation assigns owner and XP from trusted immutable definitions, never client XP. A unique key and per-family transaction advisory lock make refreshes and concurrent operations idempotent. Triggers evaluate changes to confirmed entries, episodes and saved ratings. Pending watch requests do not count. Historical awards remain after unwatching or deleting a score; live progress reflects current confirmed facts.

`mv_legend_seen` tracks notification acknowledgements per authenticated account. Initial scan produces one summary, no push blast. Award notifications wait for inputs, dialogs, active sessions and PWA safety guards. Realtime INSERT subscription plus foreground polling refresh history; offline history is cached per family/account. Offline actions qualify only after server acceptance. No private messages or media are read by achievement calculation.

New tables use RLS; only family reads are granted. Award and XP writes are exclusively server-side. Private evaluators are not executable by clients. Existing schema and API remain compatible with 2.2. Manifest, scopes, icons, push keys and login storage are unchanged.

## Deployment and recovery

Apply independent-ratings then legend-history migrations only after disposable SQL tests and CI pass. Save current private/public operation definitions outside Git before applying. Existing rows need no rewrite. To roll back frontend, deploy stable v2.2.0 while leaving additive tables in place; independent rating acceptance is backwards compatible. To disable evaluation, drop only the three new `legend_entry`, `legend_episode`, `legend_rating` triggers (after stopping new clients). Preserve award tables. Restore the captured `apply_core` definition only if independently required, after accounting for newly saved scores. No reset, account deletion or application storage clearing is part of recovery.

## Validation limits

Chromium and WebKit geometry/flow checks use isolated fixtures and 414×896 / 402×874 configurations. SQL tests execute in the disposable integration container, including personal ownership, unavailable phase six, duplicate XP, persistent historical phase awards and cross-family denial. These are not physical iPhone or real APNs delivery checks.

On both installed iPhones open the existing icon online at a safe moment, check version 2.3.0, rate an unwatched project, open Universe → Наша легенда → phases and tap a missing film. Verify partner sync, old data, keyboard, active viewing and push. No reinstall or Safari clearing is required.
