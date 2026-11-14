# Наш Marvel 2.4 — После титров

Communication composers and routes no longer expose chat, project/moment discussions or letter exchange. Historical tables, attachments and objects are retained. Old communication routes show the photo archive; old project links open the existing catalogue card. Existing welcome-letter replay remains private and available. Session photos now upload directly with `kind=session`, and previous message-linked photos remain visible in session history and the photo archive. No file copies are required.

`mv_impressions` stores one current personal impression per family/user/project. Null body is a deletion tombstone retaining its CAS version. RLS grants family-only reads; the authenticated RPC derives family/user from server identity and serializes writes by user/project. Version checks protect edits from stale clients. Body length is 1–200 Unicode code points, counted by JavaScript `Array.from` and PostgreSQL `char_length`, including combining characters separately. Whitespace-only submissions are rejected. This is not a chat: there are no replies, text reactions, read receipts or impression notifications.

Drafts persist per family/user/project on the device; errors retain text. Offline writes are not shown as saved. Realtime and foreground polling refresh impressions using a separate read path, preserving family revision guards. Optional prompts follow server acceptance of watched requests/confirmations; a series prompts only when complete. Skipping never reverses watched progress. Ratings remain independent.

The six navigation items are Home, Catalogue, Ours, Achievements, Universe, Settings. Existing statistics render unchanged through the Statistics switch inside Achievements. `/legend` and `/legend/stats` are supported. Award definitions, earned rows and XP are unchanged.

The scheduler no longer delivers scheduled letters. Central notification creation and push job selection suppress message/comment/letter/letter_nudge types without deleting historical records or jobs. Subscription endpoints and VAPID keys are untouched. Existing queued communication operations are retained locally as archived failed actions and are never sent automatically.

JSON export retains original content and adds impressions and achievement history. Migration is additive: a new table/RPC and narrowly changed notification/scheduler/export functions. No existing messages, letters, photos, ratings or watch rows are rewritten.

Tests for retired communication UI are explicitly skipped, not represented as passed. Archive authorization stays tested by SQL; new browser cases cover independent impressions, Unicode limits, drafts, six-tab navigation, statistics, session photos without messages and archive access. Chromium/WebKit visual tests use 414×896 and 402×874 plus the existing width matrix. Physical keyboard, installed PWA update and real APNs delivery still require both iPhones.

Recovery: redeploy tag v2.3.0 and preserve additive tables. Restore only backed-up scheduler/notification/export function definitions if resuming communication is deliberately desired. Do not reset the database or clear browser storage. The existing manifest identity, start URL, scope, icons and safe PWA update lifecycle remain unchanged.

Archived failed communication operations remain durable in IndexedDB but no longer veto future safe PWA updates. Queued operations still block until archived; active impressions, photos, views and real synchronization work retain their safety guards. Unicode whitespace validation also matches the JavaScript trim set, including figure and narrow no-break spaces.
