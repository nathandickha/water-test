# Pool Designer workspace update

This package updates only the Pool Designer experience and its bundled Three.js integration.

## Included
- Full-height modelling workspace with the 3D canvas as the primary focus.
- Narrow collapsible desktop control panel.
- Mobile bottom toolbar and bottom-sheet controls.
- Direct `window.postMessage()` bridge to the bundled Three.js designer.
- Three.js state remains authoritative and returns `DESIGN_STATE_CHANGED` messages.
- Auto-started embedded designer with duplicate internal panels minimised.
- Pool, spa, steps, bench, finish, tile, camera, screenshot and share controls.
- Pool Designer-only auto-hiding header and desktop top-edge reveal zone.
- Loading, connection status and iframe error states.
- No Base44 dependency.

## Main changed files
- `pool-designer/index.html`
- `assets/css/site.css`
- `assets/js/designer-page.js`
- `pool-designer-app/frontend/js/designer-bridge.js`
- `pool-designer-app/frontend/js/main.js`
- `pool-designer-app/frontend/css/styles.css`
## Raised pool entry paving platform

- When Raised Pool is enabled, the full perimeter paving is hidden.
- A localised paving platform is generated only behind the entry steps.
- The platform top follows the selected raised-pool height.
- Its vertical paving faces extend down to the unchanged ground/paving level.
- Lowering the pool restores the normal full perimeter paving.


## Camera-aware 3D manipulation handles
- Replaced circular Unicode-arrow sprites with compact Pool Designer-style capsule gizmos.
- Each gizmo is labelled by its world axis (X, Y or Z).
- Gizmos rotate on screen from the current camera projection, so dragging follows the visible world-axis direction.
- Pool and spa X/Y resizing now projects pointer movement onto the relevant world axis rather than assuming horizontal/vertical screen movement.
- Added a Z-axis elevation gizmo for raised pools, allowing the raised height to be adjusted directly in the model from 0.1 m to 1.5 m.
- Section-view depth handles use the same Z-axis visual language.

## 2026-08-30 — Supabase enquiry / project portal / builder quotation system
- Added customer-facing **Submit for Quote** action to the existing designer controls and standalone designer sidebar.
- Added three-step enquiry workflow: verified client details + builder selection, equipment, review/submission.
- Added authoritative 3D project snapshot + PNG preview + generated structured project specification.
- Added Supabase schema/migration with clients, builders, service areas, projects, immutable design versions, specifications, equipment, per-builder invitations, messages, attachments, quotes, quote versions, line items, activity and notifications.
- Added one-active-project-per-verified-email enforcement and cryptographically random project access tokens.
- Added RLS/security-definer RPCs separating client access from builder access and preventing competing builders from seeing each other's messages or quotations.
- Added client Project Portal (`/project/`) with 3D reopen, current version/specification/equipment/builders/activity/messages, quote viewing, attachments, and explicit quote acceptance.
- Added builder dashboard (`/builder/`) with enquiry statuses, accept/decline, 3D inspection, messaging, structured quotation entry, custom line items, quote attachments, and immutable quote revisions linked to exact design versions.
- Added client design revision path: reopening a submitted model changes the action to **Save Project Revision** and creates Version 2/3/etc. without overwriting prior versions.
- Added Supabase Edge Function notification architecture with email delivery through Resend when deployment secrets are configured.
- Added `SUPABASE-SETUP.md` and runtime `supabase-config.js`.

## 2026-08-31 security, freeform lighting and cleanup patch

- Hardened Supabase builder access so an `invited` builder can see only its invitation summary; full project access now requires `accepted` status.
- Isolated messages, attachments, quotations and private Storage objects by accepted builder/project scope.
- Added Storage checks that allow builders to upload only to message threads belonging to their accepted project relationship.
- Changed freeform automatic curved-wall lights to distribute across each continuous run of adjacent curved edges instead of restarting spacing on every edge.
- Replaced the obsolete `/pool-designer-app/` copy with a redirect to the authoritative `/pool-designer-app/frontend/` entry.
- Removed 59 confirmed unused/duplicate files. See `REMOVED-UNUSED-FILES.txt`.
- Added `scripts/validate-project-structure.mjs` and wired it into `npm run check` to validate all remaining JS syntax/local imports plus local HTML/CSS references and guard against legacy duplicate paths returning.
