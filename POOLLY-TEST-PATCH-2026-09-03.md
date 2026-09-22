# Poolly test branch patch — 2026-09-03

Applied to the supplied `D6.5-test.zip` baseline.

## Designer interaction changes
- Removed the parent page's right-hand Design Controls panel on desktop and mobile; the embedded designer now owns its editing panels and the 3D viewport expands into the freed space.
- Added an in-designer feature tile grid including Curved wall.
- Curved wall is a toggle editing mode; legacy Customise, Confirm, Revert to Square Corner, and curve-radius slider UI were removed.
- Selecting two adjacent walls applies a curved corner automatically.
- Existing curved walls expose a blue direct 3D radius handle; drag the handle to preview/commit the radius.
- Curved-corner rebuilds explicitly preserve normal wall height when no wall was intentionally raised.

## Spa / paving fixes
- Spa size/elevation edits now refresh water void, ground void, channel and paving immediately and again on the next animation frame so dependent geometry follows the final spa footprint.
- L-shape entry paving now matches the outer offset segment geometrically rather than by raw contour index, preventing concave notch index mismatches.

## Acrylic window changes
- Acrylic window requires a raised pool. The feature is unavailable when the pool is in-ground and is removed cleanly if the pool is lowered.
- Acrylic windows cannot occupy the entry-step / bench wall.
- Horizontal return surfaces immediately above the acrylic opening use a non-tiled material.
- Length drag handles use independent side limits so reaching one wall return stops that end rather than transferring stretch to the opposite end.

## Selection / UX
- Step selection resolves the actual step mesh before highlighting and dragging, so the highlighted stair/bench matches the object that will move.
- Main-site navigation remains geometrically centred in the viewport.
- Poolly logo/wordmark sizing was increased and rebalanced.
- Main-site header waits longer before hiding on downward scroll; the 3D designer retains its separate faster header behaviour.

## Validation
- `npm run check` passes.
- `npm run build` passes and produces the Cloudflare `dist/` publish directory.
