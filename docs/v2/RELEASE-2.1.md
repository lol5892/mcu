# Наш Marvel 2.1

URL, manifest id/start_url/scope, worker URL, icons, Supabase Auth storage,
IndexedDB schema and VAPID keys are retained. Never uninstall or clear Safari
storage for this update. No real account password/email or welcome flags changed.
Backup branch: backup/v2-before-2-1; tag: v2.0-stable-before-2.1.

## User flows

StartTogether is first in project details; Sessions provides search/selection.
An active viewing is visible on both home screens. Concurrent starts resolve to
one active session on the server under a family advisory lock and unique index.
Series sessions optionally reference a valid released episode. Finish opens an
explicit watched/rating/photos/comments summary and never sets watched itself.
New watched requests await the other member's approval. Ratings remain personal.
Chat offers camera/gallery, previews, caption and real queued/error/ACK status.
Moments upload selected images before atomic publication; failed uploads leave
no empty parent in the feed. Existing files can be linked without reuploading.
Uploads use stable IDs/source hashes, JPEG validation/re-encoding, private storage,
25MB browser input and 3MB sanitized upload limits. Browser HEIC decoding is used
when supported; a readable conversion message appears otherwise. Blob URLs are
revoked. No third-party conversion sends private photographs elsewhere.

## Automatic updates

Registration checks update on launch, foreground, pageshow and online. Generated
worker embeds the push handler, hashes every public build resource and refuses
partial/mismatched installation. Navigations use the complete controlled shell.
Waiting activation asks all open clients for consent; drafts, pending sync,
photo uploads and active sessions defer activation/reload. controllerchange reads
the actual worker version and reloads safely once per version. Old cache cleanup
only removes shells known to predate this worker, after clients adopt it. Push
receipts are outside that namespace. Private API/media never enter shell cache.

An old installation must open online to obtain the new lifecycle. iOS cannot be
forced to execute a terminated app in the background. Physical iOS keyboard,
HEIC variants, APNs delivery and OS installation identity need device verification.
Chromium lifecycle tests exercise actual old/new worker installation and UI launch;
they preserve auth sentinel storage/IDB/receipt cache, not a real APNs subscription.

## Hosted verification

52 real Supabase checks passed using three isolated confirmed test accounts,
including actual Realtime, private JPEG upload/download authorization, watched
approval, concurrent starts, staged photo privacy, atomic parent rollback, upload
retry, attachment reuse/author preservation, session finish and attachment export.
Disposable accounts/family/files removed; release-smoke disabled with HTTP410.
Real family messages, letters, photos and greeting flags were not modified.

Full test totals and deployment status are recorded after final CI completion.

Local checks completed: 29 unit, 109 SQL assertions, 3 image tests, 7 legacy
E2E and 9 old-to-new worker lifecycle scenarios. 18 existing family UI scenarios
passed before final new-flow checks; final CI status remains authoritative.

Final local mobile contracts: all six new 2.1 scenarios passed, including
photo-first retry with both authors, inline photos in project/common/session
chats, reduced viewport keyboard simulation and mobile section overflow audit.
