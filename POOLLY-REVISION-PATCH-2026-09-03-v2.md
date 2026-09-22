# Poolly revision patch — 2026-09-03 v2

- Restored the right-hand external Design Controls workflow and made the internal left 3D sidebar hide immediately in external-controls mode.
- Fixed custom/curved wall base Z so in-ground curved walls finish at coping datum rather than projecting above it.
- Curved Wall is now an actual curve on/off feature: enabling starts curve creation/editing; disabling reverts the active curved edge to square.
- Curved walls reselect after application so the blue direct radius pull handle is immediately available.
- Restored the previously stable acrylic wall-edge targeting near corners while retaining raised-pool eligibility, step/bench exclusion, independent resize limits and the untiled top return.
- Changed 23 mm tile swatch preview from the prior 4x4 appearance to an 8x8 appearance by doubling texture repetition.
- Added one automatic spa light. Its visible glow is wall-local and no beam mesh is generated, preventing lighting geometry from protruding through spa walls.
- Preserved the prior square entry paving, L-shape paving, spa void/channel refresh, Poolly branding and header/navigation fixes.
