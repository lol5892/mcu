# Наш Marvel 2.2 — Visual Polish

## Scope and evidence

Preserves the existing design, backend, family data and PWA identity. Backup branch `backup/v2-1-before-2-2`, tag `v2.1-stable-before-2.2` reference the stable release.

| Finding | Evidence | Correction |
| --- | --- | --- |
| Favourite SVG off centre | Chromium measured default button padding `1px 6px`, 30px outer box, 17px SVG, horizontal centre error 0.5px | Explicit zero padding/line-height and block SVG; no device-specific transform |
| Scrolled content visible under translucent iOS status area | Only initial topbar reserved safe area; no fixed cover after scrolling. No sticky catalogue rule was found | Fixed background cover using actual top safe inset; shared inset tokens |
| Six navigation items exceed narrow available width | Six 54px minimum widths plus panel padding exceed 320px | Flexible equal-width items with zero minimum width, preserving height and styling |
| Focused chat can reach top system area | Fixed VisualViewport chat had only 8px padding | Add remaining safe top inset after viewport offset; preserve keyboard handling and drafts |

The reason this was more visible on one physical phone is not established. iOS version, text scale and installed cached CSS were not available for measurement. No claim of physical-device verification is made.

## Verification

Visual tests measure nine widths (320, 375, 390, 393, 402, 414, 428, 430, 440), with separate 414×896 and 402×874 DPR3 projects. They cover SVG geometry, horizontal overflow, navigation bounds, family routes and focused chat. Landscape is checked at 896×414. Safe insets are injected test values, not an emulated physical notch or keyboard.

Reviewed screenshots: catalogue, family chat, letters, moments, calendar, sessions, notification settings and account settings. Existing family functional tests exercise populated sessions, photos, letter editor, welcome replay, ratings and offline state using synthetic accounts. These are not a substitute for actual iOS keyboard/APNs tests.

Local WebKit launch was blocked by missing shared libraries. Automatic installation required unavailable root authentication. CI installs WebKit dependencies with the standard Playwright installer. CI screenshots are saved as the visual-polish-screenshots artifact.

PWA lifecycle implementation, manifest, installation icons, Auth, SQL, RLS, Storage and push keys are unchanged. New CSS participates in the existing hashed atomic application cache. No real family records are used by write tests.

## Physical iPhone acceptance

Open the existing icon online when no draft/upload/viewing session is active. Verify version 2.2.0 in settings. On both phones scroll the catalogue through the status area, toggle a favourite, open a long film detail and close it. Open chat, type with the iOS keyboard, send a photo and return to navigation. Confirm existing login, old records and push delivery. No reinstall or Safari clearing is required. Updates cannot execute while iOS has terminated the application.
