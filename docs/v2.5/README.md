# Наш Marvel 2.5 — Новая киновселенная

## Result and assets

All 81 catalogue projects use new original cinematic illustrations in `public/covers-v25`, with project-specific compositions. The collection covers films, series, specials and clearly categorized future projects. No third-party poster files were downloaded. Art was generated as original painted scenes, sometimes as two independent panels then cropped and optimized. Contact sheets cover all 81 outputs; `poster-manifest.json` records scene descriptions, unique SHA-256 hashes, sizes and concept status. Future art is a creative concept rather than a claim about an unreleased story.

The current WebP collection is 9,939,550 bytes (9.48 MiB), maximum 238,696 bytes per file. Images are 672×1008 or 768×1152, suitable for the mobile catalogue's Retina thumbnails. Original SVG files remain available for compatibility but no current project references them. The only new SVG poster-like graphic is a local error fallback, not a catalogue replacement. Every current image path and uniqueness/size budget is covered by a unit test.

All project fields except poster URLs were compared with the stable 2.4 snapshot and match. No project IDs, canon sections, dates, season definitions or release status were changed. No Supabase migrations or live family-data operations are part of this release.

## Design system

`src/design25.css` layers the new design over the established functional components. Midnight surfaces, restrained cosmic gradients, metallic borders, consistent control geometry, readable type and six phase accent themes replace the previous presentation. Phase themes use red/gold, electric blue, orange/gold, violet, cyan and fire red respectively. No heavy UI dependency was added.

The next-film artwork now appears prominently on Home, alongside the existing active-session entry. Family progress and the last-trophy link remain on the page. The catalogue uses full poster art, responsive two-column cards, larger titles, aligned flexible card bodies and 44px controls. Film details use an illustrated header, readable independent rating fields and sticky close controls. Achievement emblems use thematic linework and phase colors; award IDs, rules, XP and server history are unchanged. Family, photo, calendar, impression and settings surfaces share the same tokens. Communication features stay archived.

## Close-button diagnosis — limits of the evidence

Stable 2.4 measured a 34×34 close button with native `1px 6px` padding and a 19×24 SVG viewport. Chromium's SVG and painted-path centres were nevertheless aligned at both 414×896 and 402×874. Thus those inconsistencies are confirmed; they are not proof of the exact cause of the physical iPhone 11 Pro Max offset. The phone's iOS/WebKit version, Display Zoom and actual rasterization were not available.

The new component has an explicit square 20×20 SVG inside a 44×44 button with zero padding, zero line height, explicit grid centering and native appearance disabled. Both DOM rectangles and the visible X-path transformed with `getScreenCTM()` are checked. Its sticky action rail is also tested after scrolling. No model-specific translate or device detection is used. Physical optical alignment remains an acceptance check on both phones.

## Audit register

| Screen/component | Finding/evidence | Change | Validation |
| --- | --- | --- | --- |
| Film close control | 19×24 SVG viewport and native button padding; physical offset not reproduced in Chromium | Explicit 20×20 SVG, appearance reset, zero padding, 44px grid target | Rectangles and painted X centre; two phone profiles, Chromium/WebKit |
| Film close control | 34px target and absolute positioning lost after scrolling | 44px sticky action rail | Size and scroll-position assertion |
| Profile/calendar/delete/photo controls | Inconsistent 33–40px targets and reliance on native button metrics | Shared icon-only control rules, square SVGs and 44px targets | Icon-only controls audit across primary routes |
| Main artwork | Old SVG background treatment applied blur(24px), saturation .5 and opacity .22 to new paintings | Remove blur/scale/fade; use a deliberate readable gradient | Decoded screenshots and manual review |
| Catalogue art | Abstract geometric covers did not meet the cinematic direction | 81 individual scene illustrations | All-file validation, hashes, contact-sheet review |
| Catalogue typography | Two-line truncation and very small title/body text | Larger titles with up to three lines and flexible card bodies | Width matrix, screenshots, overflow assertions |
| Partner rating | Disabled value lacked contrast | Readable disabled text fill; editing rights unchanged | Detail screenshots and family regression suite |
| Native selects | Small mobile select type risked focus zoom and poor readability | 16px filter/select text | Mobile geometry and visual review |
| Home progress | Several meaningful labels were 6–9px | 10–14px labels and narrow-screen stacked layout | 320–440px geometry and primary phone screenshots |
| Last-trophy link | Unicode arrow rendered as a missing glyph during redesign | Inline SVG arrow | Manual screenshot review |
| Dialog focus | Programmatically focused dialog could show native container outline | Remove only container outline; preserve keyboard focus rings on controls | Detail screenshots, functional modal tests |
| Screenshot methodology | Async image decoding could produce a transient blank poster capture | Wait for visible images and decode() before taking reference screenshots | Screenshot helper and fallback test |

## Performance and PWA

The larger art package necessarily increases the first full offline download. Images stay lazy-loaded/async-decoded in catalogue views, with reserved aspect ratios to prevent layout shifts. New static gradients avoid continuous particle work; large modal backdrop blur was removed. The JS bundle changed only modestly (an earlier production measurement was 342.4→345.2 kB uncompressed, about +1 kB gzip); no dependency was introduced. A pre-existing dev lockfile version label was corrected to match its unchanged resolved 2.3.0 archive.

A local Chromium diagnostic at 414×896 measured a 16.7ms median animation-frame interval in stable 2.4 and about 16.8ms in the redesigned catalogue. Automated detail-open measurements were 218ms vs 251ms. JS heap readings were roughly 23.2 vs 23.4 MB; they do not include decoded image/GPU memory. These are synthetic-family, local Vite, headless desktop measurements, not physical iPhone performance guarantees. JSON diagnostics include the environment limitation. CI artifacts also contain the WebKit measurements.

The generated worker reuses a public cached resource only when its SHA-256 matches the complete new release manifest. Changed or corrupted resources are fetched and verified. New HTML/JS/artwork must all be ready before activation. A regression test proves unchanged art is not downloaded again for a UI update and a corrupt cached image is repaired. Existing auth, IDB, push receipt, multi-tab and busy-input update checks continue to run. Scope, manifest identity, icons and installed-app URLs are unchanged; private API/photo responses remain outside the public shell cache.

## Verification and physical acceptance

The regular suites cover TypeScript, unit/catalogue, SQL authorization, family/After Credits/session-photo flows, legacy E2E, image validation, PWA lifecycle, Chromium and WebKit. Retired communication UI tests remain explicitly skipped. Visual configuration includes separate 414×896 and 402×874 DPR3 projects; the existing width sweep covers 320, 375, 390, 393, 402, 414, 428, 430 and 440, with landscape review. Before images include the exact stable `v2.4.0-final` checkout. New screenshots wait for decoded artwork, and geometry tests complement visual review.

On both installed iPhones open the existing icon online at a safe moment and verify 2.5.0. Inspect the X in Iron Man and Thor: The Dark World, including after scrolling; inspect hearts in the catalogue. Check the last catalogue row above navigation, a long title, After Credits with the actual keyboard, photo full-screen close and landscape. Verify retained login, ratings, XP, photos and an important push. Check smooth scrolling after artwork warms, using the actual Display Zoom/text settings. No reinstall, Safari clearing or re-registration is required. iOS cannot update an application while it is fully terminated.
