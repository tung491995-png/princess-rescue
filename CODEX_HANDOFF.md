# Princess Rescue V10.25 — Codex Handoff

Last updated: 2026-08-28 02:43 (Asia/Bangkok)  
Milestone: V10.25 visual acceptance and final release packaging complete

## Mandatory checkpoint — final refreshed V10.25 Release ZIP

Status: **COMPLETED — the final archive was rebuilt from the post-acceptance
repository state, extracted, hash-compared and launched successfully. No
implementation or QA work remains unfinished.**

Completed phase:

- Rebuilt
  `D:\Princess_Rescue_V10_24\game\Princess_Rescue_V10_25_ECLIPSE_BATTLE_MAGE_COMPLETE.zip`
  from the current verified project state with one
  `Princess_Rescue_V10_25` root.
- Included all 175 release files, including the reference pack, corrected Crown,
  retarget runtime, 10 regenerated animation GLBs, One-Eye correction, Black
  Moon/Zero Hour correction, tests and current checkpoint documents.
- Excluded `node_modules`, nested ZIPs, VCS/cache/temp/coverage directories,
  logs, backups, rejects, bytecode and debug-symbol artifacts.
- Extracted the archive to a fresh directory; all 175 extracted files matched
  the staged source by SHA-256, with zero missing/mismatched files.
- Launched extracted `server.js` on `127.0.0.1:31127` using the workspace
  dependency directory outside the archive. `/healthz` returned `ok:true`,
  `ram-fallback` and `v10.25-eclipse-battle-mage-zero-hour`; `/` returned HTTP
  200 and the V10.25 WebGL page.

Exact files created/modified:

- Recreated the Release ZIP at the exact path above.
- Modified only `CODEX_HANDOFF.md` and `V10_25_PROGRESS.md` for this checkpoint.
- No production code, scene, combat, network or asset file was changed during
  packaging.

Architecture decisions:

- Dependencies remain excluded and are installed from lockfiles on a fresh
  machine; launch verification supplies them externally to test the extracted
  project without contaminating archive contents.
- Repository-owned visual references remain release evidence and are included.
- Final archive is generated only after all visual checkpoints were closed.

Tests passed/failed:

- **PASSED:** one-root archive topology and exclusion scan.
- **PASSED:** 175 source files / 175 archive files / 175 extracted files.
- **PASSED:** 175/175 extracted SHA-256 comparison, zero mismatches.
- **PASSED extracted launch:** `/healthz`, V10.25 network combat-overhaul ID and
  `/` HTTP 200.
- **FAILED then resolved:** first launch attempt pointed `NODE_PATH` at the
  bundled runtime, which does not contain `express`; retry with the workspace
  `node_modules` outside the ZIP passed. This is not a product/archive failure.

Known issues and risks:

- Fresh systems must install dependencies from the lockfile before launch.
- Redis is optional; verification intentionally used documented RAM fallback.
- No implementation, QA, visual acceptance or packaging issue remains open.

Unfinished work:

- None.

Exact next phase:

- **None — V10.25 release is complete.**

Exact commands needed to resume/reverify:

```powershell
Set-Location 'D:\Princess_Rescue_V10_24\game\Princess_Rescue_V10_25'
npm install
npm start
# Open http://127.0.0.1:3000/ (or the configured PORT).
```

## Mandatory checkpoint — Zero Hour / Black Moon and final visual acceptance

Status: **COMPLETED — the mandatory Boss Visual Reference Acceptance &
Correction Pass is closed. Final packaging is now unblocked.**

Completed phase:

- Measured the old ultimate Black Moon implementation: `.72` sphere with peak
  `.80` scale produced only about `1.15 m` diameter and inherited Halo anchor/
  collapse transforms, far outside the approved numeric range.
- Corrected Black Moon to the reference midpoint: diameter `1.50H = 6.675 m`,
  center `0.68H = 3.026 m`, depth `1.35 m` behind Boss (within the required
  `1.20–1.50 m`). Flattened existing sphere along local Z to protect Boss
  occlusion; accepted live thickness is `0.167 m`.
- Made Black Moon a scene-owned ultimate visual root controlled by the existing
  state machine, so animated Halo follow/collapse does not change its world
  center or diameter. No combat/state/network architecture changed.
- Expanded the acceptance preview to show the complete presentation together:
  Ultimate Cast pose, Black Moon, Halo/Orb link, 12 suspended Orb slots and two
  perpendicular safe lanes.
- Final live telemetry: Black Moon visible, size
  `[6.675, 6.675, 0.167]`, center `[0, 3.026, -1.35]`, depth `1.35`;
  12 Orbs; 2 safe lanes.
- Completed all mandatory final views across this pass: FRONT, LEFT, RIGHT,
  BACK, close cameras, Cast, melee, Sweep/Roundhouse/Flip Kick, Teleport,
  One-Eye formation and complete Zero Hour.

Reference files actually read:

- `00_READ_THIS_FIRST_V10_25.md`;
  `source_docs/BOSS_MASTER_REFERENCE_SPEC_VI.md`;
  `source_docs/boss_accessory_layout.json`;
  `source_docs/AI_READ_FIRST.md`; `source_docs/README.md`;
  `source_docs/PROMPT_NOTES.md`; `REFERENCE_INDEX.json`.
- All six files under `images/` and all five files under
  `original_idea_refs/` were inspected.
- Primary visual authority:
  `images/01_master_front_back_full_assembly.png`.
- Numerical constraints used: H `4.45`; Halo `0.50H`, center `0.82H`, depth
  `.22 m`; Orb FOLLOW `.35 m/+0.08 m`; Crown `0.33 head`; cuffs `0.20 forearm`;
  One-Eye `0.38H` and reference slots; Black Moon center `0.68H`, depth
  `1.20–1.50 m`, diameter `1.40–1.60H`. Runtime One-Eye cap remained 3.

Exact files modified:

- `public/index.html` — Black Moon constants, scene-owned placement/flattened
  scaling, complete Zero Hour acceptance preview/telemetry.
- `tests/v10_25_m3_orb_halo_zero_hour.js` — Black Moon numerical/occlusion
  contract.
- `tests/v10_25_m5_webgl_acceptance_contract.js` — complete presentation
  telemetry contract.
- `CODEX_HANDOFF.md` and `V10_25_PROGRESS.md` — checkpoint truth.

Architecture decisions:

- Black Moon is presentation-only and scene-owned. Server-authoritative Zero
  Hour stages, timings, hazards, damage, snapshot/reconnect and Halo collapse
  remain unchanged.
- Existing sphere geometry is retained and flattened rather than rebuilding a
  new model; depthWrite remains disabled and the moon stays behind Boss.
- Final priority order was applied: reference fidelity, coherent animation,
  combat readability, then strict preservation of working gameplay systems.

Tests passed/failed:

- **PASSED:** `tests/v10_25_m3_orb_halo_zero_hour.js`.
- **PASSED:** `tests/v10_25_m5_webgl_acceptance_contract.js`.
- **PASSED:** V10.25 overhaul regression after all visual corrections.
- **PASSED real WebGL:** 256/256 final audit.
- **PASSED visual:** complete Zero Hour/Black Moon telemetry and screenshot.
- **FAILED:** none.

Known issues and remaining visual risks:

- The arena's decorative pale moon remains visible behind the translucent Black
  Moon at some camera angles; it does not alter Black Moon geometry/depth and
  does not occlude gameplay actors.
- Extreme long-dress kick poses have unavoidable transient panel self-occlusion,
  but no detached geometry or persistent clipping.
- No implementation or QA task remains unfinished. The existing ZIP is stale
  because it predates these accepted corrections and must be refreshed.

Unfinished work:

- Recreate and verify the final Release ZIP from this exact checkpoint state.

Exact next phase:

- **Final V10.25 release packaging, extraction/hash comparison and extracted
  launch smoke.**

Exact commands needed to resume:

```powershell
Set-Location 'D:\Princess_Rescue_V10_24\game\Princess_Rescue_V10_25'
$nodeExe='C:\Users\NIWA\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $nodeExe 'tests/v10_25_m3_orb_halo_zero_hour.js'
& $nodeExe 'tests/v10_25_m4_one_eye_assembly_variants.js'
& $nodeExe 'tests/v10_25_m5_webgl_acceptance_contract.js'
# Package one Princess_Rescue_V10_25 root; exclude node_modules, ZIPs,
# temp/cache/non-release artifacts; extract, hash-compare and launch server.js.
```

## Mandatory checkpoint — One-Eye three-actor formation

Status: **COMPLETED — reference scale/slots are applied and verified in real
WebGL while the authoritative max-alive cap remains exactly 3.**

Completed phase:

- Measured the actual prepared `one_eye_mob.glb` instances in WebGL before
  editing. The old intrinsic normalization target was `1.15 m`, below the
  numerical `0.38H = 1.691 m` reference length.
- Set intrinsic model normalization to `4.45 * 0.38`; retained the actual GLB
  geometry/material and existing state pulse/dissolve behavior.
- The former acceptance triangle used an invented center-lower slot hidden by
  the Boss/Orb. Replaced it with three allowed reference positions:
  `Upper_L (-0.58H, 0.73H, -0.60 m)`,
  `Upper_R (+0.58H, 0.73H, -0.60 m)` and
  `Lower_L (-0.62H, 0.46H, -0.72 m)`.
- Verified all three actors from FRONT and BACK. None occludes Face, Crown or
  Nocturne Core; upper pair remains balanced and lower actor is readable.
- Preserved server spawn/orbit/Position/Gaze/Lunge behavior and the hard cap 3;
  the old four-slot reference was used only as scale/spacing/depth guidance.

Exact files modified:

- `public/v10_25/boss-runtime.js` — `0.38H` One-Eye normalization and fresh
  One-Eye cache key.
- `public/index.html` — reference-slot acceptance formation and measured bounds
  telemetry.
- `tests/v10_25_m4_one_eye_assembly_variants.js` — reference scale/cache
  contract; existing authoritative cap-3 assertion retained.
- `tests/v10_25_m5_webgl_acceptance_contract.js` — three accepted reference
  slots contract.
- `CODEX_HANDOFF.md` and `V10_25_PROGRESS.md` — checkpoint truth.

Architecture decisions:

- Actual GLB geometry remains authoritative; no attempt was made to rebuild or
  independently rescale the eye/head subgeometry from the image.
- Overall intrinsic visual length follows the numeric reference. Dynamic state
  pulse can temporarily enlarge the world AABB, which is intentional VFX.
- Runtime remains three independent server-owned actors, not a four-child Boss
  accessory hierarchy.

Tests passed/failed:

- **PASSED:** V10.25 overhaul regression.
- **PASSED:** M4 One-Eye/assembly/variant regression.
- **PASSED:** M5 WebGL acceptance contract.
- **PASSED real WebGL:** 256/256 audit after cache-key reload.
- **PASSED visual:** FRONT and BACK three-actor formation visibility/depth.
- **FAILED:** none.

Known issues and risks:

- Rotated/pulsing instances report axis-aligned world bounds up to about
  `1.95 m`; intrinsic unrotated normalization remains the specified `1.691 m`.
- The supplied model's eye/head proportions are preserved even where they do
  not exactly equal the old `0.16H` illustration guideline.
- Zero Hour/Black Moon remains unfinished.

Unfinished work:

- Complete Zero Hour presentation and correct Black Moon depth/scale against
  `center 0.68H`, `behind 1.20–1.50 m`, `diameter 1.40–1.60H`.
- Close the overall visual-reference acceptance and decide final packaging.

Exact next phase:

- **Boss Visual Reference Acceptance — complete Zero Hour and Black Moon.**

Exact commands needed to resume:

```powershell
Set-Location 'D:\Princess_Rescue_V10_24\game\Princess_Rescue_V10_25'
$nodeExe='C:\Users\NIWA\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $nodeExe 'tests/v10_25_m4_one_eye_assembly_variants.js'
& $nodeExe 'tests/v10_25_m5_webgl_acceptance_contract.js'
# Reuse http://127.0.0.1:3000/?visualaudit=1 and call
# window.__v1025VisualAcceptance.sampleZeroHour().
```

## Mandatory checkpoint — required action/view clipping matrix

Status: **COMPLETED — all required action families now use distinct intended
motion where distinct FBX sources exist, render coherently in real WebGL and
retain Crown/Orb/Halo attachment behavior.**

Completed phase:

- Inspected keyframes rather than arbitrary midpoints for Idle, Cast, three
  Dodge directions, Jab Cross, Knee Jab, Uppercut, Leg Sweep, Roundhouse,
  Flip Kick, Teleport/Dash and Heavy Slam.
- Found that 10 production GLBs were byte-identical despite the manifest naming
  10 different FBX sources: `dodge_back`, `dodge_left`, `dodge_right`,
  `flip_kick`, `floating`, `knee_jab`, `leg_sweep`, `roundhouse`, `taunt` and
  `uppercut`. The actual source FBXs exist and all have distinct SHA-256 values.
- Classified the mismatch as `asset selection/conversion`: an old Assimp output
  had been copied across unrelated logical animation files.
- Regenerated only those 10 GLBs from their exact manifest-provenance FBXs with
  `FBX2glTF v0.13.1`, binary GLB and baked 30 FPS animation. Each corrected file
  has a distinct SHA-256, one animation, 66-node Mixamo hierarchy and 43–53
  animation channels.
- Added an asset-uniqueness regression and bumped only the animation cache key
  to `10.25-animation-fidelity-1`, ensuring existing browsers receive the fixed
  binaries without changing product/combat version.
- Repeated the live key-pose matrix. Knee/Uppercut/Sweep/Roundhouse/Flip Kick
  now show their intended distinct motion; Dodge left/right/back are distinct;
  no limb detachment or Crown drop occurs.

Exact files created/modified:

- Replaced binary assets:
  `public/assets/boss_v10_25/animations/dodge_back.glb`,
  `dodge_left.glb`, `dodge_right.glb`, `flip_kick.glb`, `floating.glb`,
  `knee_jab.glb`, `leg_sweep.glb`, `roundhouse.glb`, `taunt.glb`,
  `uppercut.glb`.
- `public/v10_25/boss-runtime.js` — corrected animation asset cache key.
- `public/index.html` — matching QA source-diagnostic cache key.
- `tests/v10_25_eclipse_battle_mage_overhaul.js` — require unique SHA-256 for
  each distinct manifest animation source and require the corrected cache key.
- `CODEX_HANDOFF.md` and `V10_25_PROGRESS.md` — checkpoint truth.
- Conversion staging/tool directories were created outside the project release
  root and are not production/release artifacts.

Architecture decisions:

- Keep manifest IDs, trims, categories, fallbacks, variants and all authoritative
  combat timing unchanged; correct only the mismatched binary selection.
- Bake source animation at 30 FPS to match the retarget sampler contract.
- Preserve the skinned production dress. Extreme Flip Kick/Sweep poses may
  naturally self-occlude panels, but no rigid replacement or gameplay redesign
  is justified.

Tests passed/failed:

- **PASSED:** `node --check public/v10_25/boss-runtime.js`.
- **PASSED:** V10.25 overhaul regression with 28 unique source GLBs.
- **PASSED:** M4 One-Eye/assembly/variant regression.
- **PASSED:** M5 WebGL acceptance contract.
- **PASSED real WebGL after fresh cache key:** 256/256 audit.
- **PASSED visual matrix:** Idle, Cast, Dodge L/R/Back, Jab Cross, Knee,
  Uppercut, Sweep, Roundhouse, Flip Kick, Teleport/Dash and Heavy Slam.
- **FAILED:** none.

Known issues and risks:

- Wide/inverted kicks cause expected skinned long-dress self-occlusion at peak
  frames; no detached mesh, head/skull penetration or persistent clipping was
  observed. This remains a readability risk at very close camera distance.
- The animation correction happened after the already-delivered recreated ZIP;
  do not silently overwrite that archive before the final visual pass closes.
- One-Eye formation and Zero Hour/Black Moon acceptance remain unfinished.

Unfinished work:

- Three-actor One-Eye formation scale, spacing, depth and occlusion acceptance,
  keeping runtime max alive = 3.
- Complete Zero Hour and Black Moon depth/scale acceptance.
- Final visual-reference checkpoint and only then final packaging decision.

Exact next phase:

- **Boss Visual Reference Acceptance — One-Eye three-actor combat formation.**

Exact commands needed to resume:

```powershell
Set-Location 'D:\Princess_Rescue_V10_24\game\Princess_Rescue_V10_25'
$nodeExe='C:\Users\NIWA\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $nodeExe 'tests/v10_25_eclipse_battle_mage_overhaul.js'
& $nodeExe 'tests/v10_25_m4_one_eye_assembly_variants.js'
& $nodeExe 'tests/v10_25_m5_webgl_acceptance_contract.js'
# Reuse http://127.0.0.1:3000/?visualaudit=1 and call
# window.__v1025VisualAcceptance.sampleOneEyeFormation().
```

## Mandatory checkpoint — retarget clip-start/world-delta correction

Status: **COMPLETED — the systemic limb/dress folding found during Crown
verification is corrected and the directly affected tests plus representative
real-WebGL poses pass. The complete required pose matrix remains unfinished.**

Completed phase:

- Reproduced the deformation independently of Crown, camera, Orb/Halo and V10.6
  additive offsets. Added QA telemetry and measured target limb deviations up to
  approximately 179°.
- Measured source GLBs before retarget and proved that their neutral GLB node
  transforms do not share the basis of the absolute animation tracks. Static
  export/bind offsets near 180° were being transferred as authored motion.
- Normalized every retargeted clip against its authored source pose at the
  manifest trim boundary, preventing static export-axis offsets from entering
  the target pose.
- Corrected quaternion composition to apply source world delta on the left:
  `sourceCurrentWorld * inverse(sourceStartWorld) * targetRestWorld`. This makes
  inherited parent motion cancel coherently when target locals are rebuilt.
- Kept the sampler on `THREE.LoopOnce` with `clampWhenFinished=true`, preventing
  the last sample from wrapping to frame zero.
- Rechecked live WebGL after a clean reload: `combat_idle` no longer folds
  limbs (largest non-hand deviation about 15°); Cast, Roundhouse, Sweep,
  Flip Kick and Death are coherent, and Crown remains attached to `Head`.

Exact files modified:

- `public/v10_25/boss-runtime.js` — clip-start source reference, left-composed
  world delta, hip vertical reference and `clipStartNormalized` metadata.
- `public/index.html` — QA-only additive-offset reset, `diagnosePose()` and
  `diagnoseSourcePose()` telemetry used for live root-cause verification.
- `tests/v10_25_eclipse_battle_mage_overhaul.js` — mismatched bind/export-axis,
  clip-start normalization, endpoint and world-delta composition regression.
- `tests/v10_25_m5_webgl_acceptance_contract.js` — QA controller contract.
- `CODEX_HANDOFF.md` and `V10_25_PROGRESS.md` — this mandatory checkpoint.

Architecture decisions:

- Preserve all 28 animation assets, logical animation IDs, variants, masks and
  server-authoritative timing. Correct the retarget basis once at sampling time;
  do not replace clips or add arbitrary per-action damping.
- Treat manifest `trim[0]` as the authored clip reference pose because the
  animation-only GLB neutral node state is not a reliable bind basis.
- Preserve target rest pose, root X/Z locking, scale-track exclusion and all
  existing fallbacks.

Tests passed/failed:

- **PASSED:** `node --check public/v10_25/boss-runtime.js`.
- **PASSED:** `tests/v10_25_eclipse_battle_mage_overhaul.js`.
- **PASSED:** `tests/v10_25_m4_one_eye_assembly_variants.js`.
- **PASSED:** `tests/v10_25_m5_webgl_acceptance_contract.js`.
- **PASSED real WebGL:** 256/256 audit after final correction reload.
- **PASSED representative visual checks:** Idle, Cast, Roundhouse, Sweep,
  Flip Kick and Death; no detached limbs, Crown drop or Halo interaction.
- **FAILED:** none. An attempted stale filename
  `tests/v10_25_m4_accessory_acceptance.js` did not exist and therefore was not
  a product test result; the actual M4 command above passed.

Known issues and risks:

- The full required action/view matrix is not yet complete; Dodge, Jab Cross,
  Knee, Uppercut, Teleport and Heavy Slam still require live visual inspection.
- Cast contains a deep authored turn/crouch and should be checked at additional
  time samples for dress/hair occlusion, although the skeleton is now coherent.
- One-Eye formation scale/placement and Zero Hour Black Moon depth/scale remain
  separate unfinished visual-reference tasks.
- The recreated ZIP predates this later correction and must not be silently
  overwritten; final packaging remains blocked until visual acceptance closes.

Unfinished work:

- Finish the required pose/clipping matrix in real WebGL, then checkpoint.
- Verify/correct the three-actor One-Eye formation while keeping max alive = 3.
- Verify/correct complete Zero Hour and Black Moon numerical depth/scale.

Exact next phase:

- **Boss Visual Reference Acceptance — complete the live action/view clipping
  matrix, beginning with Dodge, Jab Cross, Knee, Uppercut, Teleport and Heavy
  Slam; rerun only tests for any correction actually required.**

Exact commands needed to resume:

```powershell
Set-Location 'D:\Princess_Rescue_V10_24\game\Princess_Rescue_V10_25'
$nodeExe='C:\Users\NIWA\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $nodeExe --check 'public/v10_25/boss-runtime.js'
& $nodeExe 'tests/v10_25_eclipse_battle_mage_overhaul.js'
& $nodeExe 'tests/v10_25_m4_one_eye_assembly_variants.js'
& $nodeExe 'tests/v10_25_m5_webgl_acceptance_contract.js'
# Reuse http://127.0.0.1:3000/?visualaudit=1 and
# window.__v1025VisualAcceptance.samplePose()/diagnosePose().
```

## Mandatory checkpoint — current-state Release ZIP recreation

Status: **COMPLETED — the deleted ZIP was recreated and verified from the
exact current project state without changing production code. The mandatory
visual-reference pass remains unfinished and resumes only after ZIP delivery.**

Completed phase:

- Created `D:\Princess_Rescue_V10_24\game\Princess_Rescue_V10_25_ECLIPSE_BATTLE_MAGE_COMPLETE.zip`
  with exactly one `Princess_Rescue_V10_25` root.
- Included 175 current source/runtime/test/reference/checkpoint files; excluded
  `node_modules`, nested ZIPs, temp/log/backup/reject files and cache folders.
- Listed all 199 archive entries, extracted successfully, and compared SHA-256
  for all 175 extracted files against the release-source inventory: zero
  mismatches.
- Launched `server.js` from the extracted archive using installed dependencies
  supplied outside the archive. `/healthz` returned `ok:true`, RAM fallback and
  the V10.25 Eclipse Battle Mage combat-overhaul identifier; `/` returned HTTP
  200 and the V10.25 WebGL entrypoint.

Exact files created/modified:

- Created/refreshed `D:\Princess_Rescue_V10_24\game\Princess_Rescue_V10_25_ECLIPSE_BATTLE_MAGE_COMPLETE.zip`.
- Modified only `CODEX_HANDOFF.md` and `V10_25_PROGRESS.md` for this checkpoint.
- No production source, asset, combat, networking, animation or scene file was
  modified during ZIP recreation.

Architecture decisions:

- Preserve one self-contained project root and keep dependencies reproducible
  from the lockfiles instead of shipping machine-local `node_modules`.
- Include the reference pack because it is repository-owned acceptance evidence,
  not a cache or temporary artifact.
- This archive is the requested exact current-state deliverable. Its creation
  does not falsely close the still-open visual-reference acceptance phase.

Tests passed/failed:

- **PASSED:** archive topology, exclusion and required-file inspection.
- **PASSED:** extraction and 175/175 source-to-extracted SHA-256 comparison.
- **PASSED from extracted archive:** `node --check server.js`.
- **PASSED from extracted archive:** M4 assembly/variant regression.
- **PASSED from extracted archive:** M5 WebGL acceptance contract.
- **PASSED extracted launch:** `/healthz` `ok:true`; `/` HTTP 200.
- **FAILED:** none. One initial background-launch wrapper was blocked before
  execution by local command policy; the terminal-session launch then passed.

Known issues and risks:

- Dependencies remain intentionally excluded; install from the lockfile before
  launching on a fresh machine.
- The Boss Visual Reference Acceptance & Correction phase remains open; this
  current-state ZIP does not erase the visual issues recorded below.

Unfinished work:

- Resume the exact interrupted live pose/retarget visual diagnosis, then finish
  One-Eye formation, Zero Hour/Black Moon and the final view matrix.

Exact next phase:

- **Boss Visual Reference Acceptance — diagnose and correct the actual logical
  retarget pose deformation discovered during Crown pose verification.**

Exact commands needed to resume:

```powershell
Set-Location 'D:\Princess_Rescue_V10_24\game\Princess_Rescue_V10_25'
$nodeExe='C:\Users\NIWA\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $nodeExe 'tests/v10_25_m4_one_eye_assembly_variants.js'
& $nodeExe 'tests/v10_25_m5_webgl_acceptance_contract.js'
# Reuse http://127.0.0.1:3000/?visualaudit=1 and the QA samplePose controller.
```

## Mandatory checkpoint — Crown export-axis correction

Status: **COMPLETED for Crown geometry/attachment — verified in real WebGL.
Overall pose acceptance remains IN PROGRESS because logical retarget poses show
severe body/skirt deformation unrelated to the Crown hierarchy.**

Completed phase:

- Verified `crown.glb` mesh local bounds and the exact
  `tripo_node_af82cae1` `+90° X` export matrix.
- Implemented `Head → CrownSocket → CrownAxisCorrection → crown.glb`.
  `CrownAxisCorrection.rotation.x = -Math.PI/2`; no compensating Y rotation was
  required. Original geometry, material, UV and GLB node transform are intact;
  only `CrownSocket` position and uniform reference scale are tuned.
- Crown world bounds in accepted Idle were approximately
  `0.230 × 0.212 × 0.256 m`, with its base seated at the top of the hair/head.
- Added FRONT/BACK/LEFT/RIGHT/TOP and close-side QA cameras, isolated-accessory
  suppression of Orb/Halo occluders, and live Crown hierarchy/axis assertions.
- Verified the Crown upright in isolated WebGL and attached to `Head` in Idle,
  Cast, Roundhouse, Teleport and Death samples. It remained bone-parented with
  no drop; no arbitrary Head offset or 180° Y correction was applied.

Exact files modified:

- `public/v10_25/boss-runtime.js` — Crown load, socket hierarchy, inverse
  export-axis correction, Head parenting and uniform reference scale.
- `public/index.html` — TOP/close-side QA cameras, Crown live audit, clean
  isolated accessory mode.
- `tests/v10_25_m4_one_eye_assembly_variants.js` — hierarchy/axis/external
  Crown assembly contract.
- `tests/v10_25_m5_webgl_acceptance_contract.js` — live Crown/QA contract.
- `CODEX_HANDOFF.md` and `V10_25_PROGRESS.md` — checkpoint truth.

Architecture decisions:

- External `crown.glb` is authoritative; the baked production spike is not
  reported as the logical V10.25 Crown.
- Axis correction is isolated on `CrownAxisCorrection`; all fit tuning remains
  on `CrownSocket`, preserving asset geometry/material/UV/node data.
- Direct Head parenting guarantees stable animation blending/follow behavior
  without a second scene-space follow controller.

Tests passed/failed:

- **PASSED:** M4 and M5 directly affected tests.
- **PASSED real WebGL:** 256/256 live audit after final reload.
- **PASSED Crown visual:** isolated axes and combined required action samples.
- **FAILED overall action-quality acceptance:** logical `combat_idle`,
  `quick_cast_a`, `roundhouse`, `dash` and `death` samples keep the Crown on the
  Head but fold limbs/dress around the torso/head. This is classified as a
  retarget pose-correction issue, not Crown clipping or drop.

Known issues and risks:

- The Crown is correct and stable, but overall action visuals cannot be accepted
  until the retarget deformation is fixed and the required pose matrix reruns.
- Primary-reference black hair remains impossible as a safe per-part material
  tweak because the production body uses one skinned mesh/material.

Unfinished work and exact next phase:

- Diagnose the rest/world quaternion composition in `BossRetargeter`, apply the
  smallest mathematically correct correction, rerun only retarget/M4/M5 and the
  affected real-WebGL poses, then checkpoint before One-Eye/Zero Hour.

> **Superseding correction (2026-08-27 22:14):** the earlier conclusion that
> `crown.glb` had an invalid crescent/loop silhouette is withdrawn. Direct asset
> inspection established that `tripo_node_af82cae1` carries an approximately
> `+90° X` export rotation, mapping Crown local `+Y` to world `+Z`. The required
> next work is the explicit hierarchy
> `Head → CrownSocket → CrownAxisCorrection → crown.glb`, with the inverse
> approximately `-90° X` correction on `CrownAxisCorrection`. The baked-Crown
> fallback is no longer accepted. Pose/clipping acceptance is paused until this
> correction is verified in isolated and combined real WebGL views.

## Mandatory checkpoint — Boss Visual Reference Acceptance / close accessory and material correction

Status: **COMPLETED — corrected accessory role/scale decisions are saved and
verified in real WebGL; pose/clipping acceptance has not started. Final
packaging remains blocked.**

Completed phase:

- Restored the combined `CLOSE_FRONT` and `CLOSE_BACK` views after the prior
  isolated-asset inspection and compared them against the primary assembly.
- Confirmed from the actual GLB that `nocturne_core.glb` is a two-lobed rigid
  shoulder/collar silhouette, not a central jewel. Classified the mismatch as
  `asset selection / logical role`, not missing geometry.
- Mapped that external asset only to `HIGH_COLLAR`; mapped the visible central
  chest gems already present in the skinned production body to
  `NOCTURNE_CORE`. This removes the false alias without duplicating geometry.
- Measured the accepted boss skeleton directly: `L_Hand` is `0.11754` raw
  units from `L_Forearm` and `R_Hand` is `0.12896`; at the `4.45 m` accepted
  boss scale these are approximately `0.536 m` and `0.589 m` forearms. The
  reference `0.20 × forearm length` gives approximately `0.107–0.118 m`, so
  both imported Witch Cuffs were reduced from `.31 m` to `.115 m`.
- Repaired the WebGL audit contract so it separately requires external
  High Collar/Choker/Cuffs and baked Mantle/Crown/Nocturne Core.
- **SUPERSEDED:** the initial isolated inspection misclassified the edge-on
  export-axis presentation as invalid geometry. See the correction note above;
  `crown.glb` must be retained and axis-corrected.

Exact files modified:

- `public/v10_25/boss-runtime.js` — external High Collar-only role, baked
  Nocturne Core disposition, and `.115 m` Witch Cuff target size.
- `public/index.html` — assembly audit distinguishes attached and baked roles.
- `tests/v10_25_m4_one_eye_assembly_variants.js` — updated assembly-role and
  cuff-scale contracts.
- `tests/v10_25_m5_webgl_acceptance_contract.js` — updated live assembly-audit
  contract.
- `CODEX_HANDOFF.md` and `V10_25_PROGRESS.md` — this mandatory checkpoint.

Architecture decisions:

- Actual model geometry remains the authority for asset-role selection:
  `nocturne_core.glb` supplies `HIGH_COLLAR`; the production skinned body
  supplies `NOCTURNE_CORE`.
- **SUPERSEDED:** external `crown.glb` is now required through a dedicated
  `CrownAxisCorrection`; do not use the baked Crown as runtime fallback.
- Rigid cuff controllers and forearm anchors remain unchanged; only their
  measured visual scale changed. No rig, animation, hitbox or combat state was
  altered.

Tests passed/failed:

- **PASSED:** `node --check public/v10_25/boss-runtime.js`.
- **PASSED:** `node tests/v10_25_m4_one_eye_assembly_variants.js`.
- **PASSED:** `node tests/v10_25_m5_webgl_acceptance_contract.js`.
- **PASSED real WebGL:** rerun of all 256 live audit checks after reload.
- **PASSED visual:** corrected combined `CLOSE_FRONT` and `CLOSE_BACK` views;
  cuff bulk no longer dominates/occludes the forearms, and the collar/choker/
  baked core remain finite and attached to their intended body regions.
- The first live rerun **FAILED one audit contract only** with
  `V1025_ACCESSORY_MISSING · NOCTURNE_CORE`; the cause was the obsolete
  attached-only assertion. After correcting the audit to accept verified baked
  geometry, the same 256-check audit passed.

Known issues and risks:

- Primary-reference black hair still cannot be reproduced by a safe placement
  tweak because the production body is one skinned mesh/material. The Crown
  portion of the earlier risk is superseded: the valid `crown.glb` must receive
  its inverse export-axis correction and be worn visibly.
- The long production dress and very dense silver back-hair silhouette differ
  from the primary reference. They are working skinned geometry; no rebuild was
  attempted during this smallest-fix phase.
- Pose-dependent collar/choker/cuff clipping is not yet accepted; static close
  views do not substitute for the mandatory action samples.

Unfinished work:

- Mandatory live pose/clipping views: Idle, Cast, Dodge, Jab Cross, Knee,
  Uppercut, Sweep, Roundhouse, Flip Kick, Teleport and Heavy Slam.
- Three-actor One-Eye formation scale/placement acceptance; cap remains 3.
- Complete Zero Hour and Black Moon depth/scale acceptance.
- Final front/left/right/back/close/casting/melee/wide-leg/teleport/formation/
  Zero Hour acceptance matrix and checkpoint. Final ZIP remains blocked.

Exact next phase (superseded by the 22:14 correction above):

- **Boss Visual Reference Acceptance — live pose/clipping correction.** Sample
  logical clips through `window.__v1025VisualAcceptance.samplePose(...)`, use
  close cameras for upper-body accessories and full-body cameras for kicks,
  classify any clipping, and make only directly justified corrections.

Exact commands needed to resume:

```powershell
Set-Location 'D:\Princess_Rescue_V10_24\game\Princess_Rescue_V10_25'
$nodeExe='C:\Users\NIWA\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $nodeExe --check 'public/v10_25/boss-runtime.js'
& $nodeExe 'tests/v10_25_m4_one_eye_assembly_variants.js'
& $nodeExe 'tests/v10_25_m5_webgl_acceptance_contract.js'
# Reuse http://127.0.0.1:3000/?visualaudit=1; server is already running.
```

## Mandatory checkpoint — Boss Visual Reference Acceptance / Halo and Orb correction

Status: **COMPLETED — geometry/placement correction verified in real WebGL;
the next accessory/pose phase has not started. Final packaging remains blocked.**

Completed phase:

- Parsed the actual GLB JSON/bounds/hierarchy for the production boss, Orb,
  Halo, One-Eye and four accessory assets before selecting a correction.
- Captured the pre-fix live FRONT/RIGHT/BACK/LEFT Animation Lab baseline.
- Identified an exact Halo mismatch: the root followed the upper torso, but the
  visible ring orbited far left/right during its idle spin and sat over one
  metre behind the boss.
- Classified the causes as:
  - `rotation/pivot`: the raw Halo geometry spans local `Y=0…0.981` and has an
    off-centre source pivot; centring it with `model.position` and then rotating
    that same object made its geometric centre orbit around the source origin;
  - `scale`: `2.74 m` rather than reference `0.50H = 2.225 m`;
  - `offset/depth`: `1.12 m` behind rather than `0.22 m`;
  - Orb `offset`: `.46 m / +.26 m` rather than `.35 m / +.08 m`.
- Implemented the smallest correction: keep geometry centring on the imported
  child, animate a zero-centred wrapper Group, and replace only the documented
  Halo/Orb placement constants. No GLB, rig, animation or server combat code
  was changed.
- Reloaded the real WebGL build and reran its 256-check audit. FRONT/BACK now
  keep the Halo centred behind the head/upper torso while rotating; RIGHT/LEFT
  show the ring plane at the constrained back depth without the old metre-wide
  gap. The live audit remains PASS.

Exact files modified:

- `public/index.html` — centred Orb/Halo animation wrapper; Halo `0.50H`,
  `0.22 m` depth and `0.82H` center constants; Orb FOLLOW `.35 m / +.08 m`.
- `tests/v10_16_1_halo_back_socket_fix.js` — replaced inherited broad/old
  ranges with exact master-reference numerical constraints and pivot contract.
- `tests/v10_16_orb_state_spirit_weapon.js` — updated the directly affected
  Orb FOLLOW placement contract.
- `tests/v10_25_m5_webgl_acceptance_contract.js` — added reference placement
  and centred-pivot assertions.
- `CODEX_HANDOFF.md` and `V10_25_PROGRESS.md` — this checkpoint.

Architecture decisions:

- Keep Orb and Halo as independent scene-owned actors/controllers. The wrapper
  corrects only visual pivot authority; it does not parent either prop into the
  boss skeleton or hitbox tree.
- Preserve all state-specific Orb/Halo animation and VFX. The base reference
  constants are corrected without changing combat-state transitions.
- Use actual H=`4.45 m` from the accepted production boss target height, giving
  Halo diameter `2.225 m` and center `3.649 m`.

Tests passed/failed:

- **PASSED:** `node tests/v10_15_orb_halo_foundation.js`.
- **PASSED:** `node tests/v10_16_1_halo_back_socket_fix.js` — 19 clips × 32
  yaw samples, `2.23 m` Halo, `0.22 m` behind, center `3.65 m`.
- **PASSED:** `node tests/v10_16_orb_state_spirit_weapon.js` — `.359 m`
  reference FOLLOW separation and synchronized live Spirit Orb.
- **PASSED:** `node tests/v10_25_m3_orb_halo_zero_hour.js`.
- **PASSED:** `node tests/v10_25_m5_webgl_acceptance_contract.js`.
- **PASSED real WebGL:** 256-check audit after reload; FRONT, RIGHT, BACK and
  LEFT correction views visually inspected.
- **FAILED but unrelated/not modified:** an accidentally included historical
  `tests/v10_16_2_eclipse_waltz_intro.js` exact-string assertion still expects
  obsolete `if(ms<V1019_INTRO_CUES.revealEnd)`. It is outside the canonical
  chain and unrelated to the Halo/Orb correction, so it was not changed.
- One ad-hoc inline-parser command failed because its shell-escaped RegExp was
  malformed; every directly affected JS test subsequently parsed the full
  inline script successfully.

Known issues and risks:

- The four-view lab is full-body and relatively distant. Close accessory
  acceptance for Crown, Collar, Choker, Core, Cuffs, face and hair is still
  pending.
- The Halo reference base scale is now fixed, but special combat-language
  states intentionally scale/collapse it. Each requested pose and Zero Hour
  stage still requires visual acceptance before deciding whether any special
  state exceeds the approved design language.
- Orb close hand clearance and wide-pose clipping remain to be visually sampled
  even though the exact offset and live controller test pass.

Unfinished work:

- Close front/back accessory and material acceptance.
- All requested cast, dodge, melee, wide-leg, teleport and Heavy Slam poses.
- Three-actor One-Eye formation and complete Zero Hour/Black Moon acceptance.
- Any additional smallest corrections and only their directly affected tests.

Exact next phase:

- **Boss Visual Reference Acceptance — close accessory/material and pose
  clipping pass.**

Exact commands needed to resume (PowerShell from this project directory):

```powershell
$node = 'C:\Users\NIWA\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $node tests\v10_16_1_halo_back_socket_fix.js
& $node tests\v10_25_m5_webgl_acceptance_contract.js
& $node server.js
```

## Mandatory checkpoint — Boss Visual Reference Acceptance / reference intake

Status: **IN PROGRESS — reference intake and repository re-audit complete;
live visual comparison has not started. Final release packaging is blocked.**

Completed phase work at this stable milestone:

- Read the mandatory reference sources in the exact requested order before any
  production code or scene edit:
  1. `references/boss_master_reference_pack/references/boss_master_reference_pack/00_READ_THIS_FIRST_V10_25.md`
  2. `source_docs/BOSS_MASTER_REFERENCE_SPEC_VI.md`
  3. `source_docs/boss_accessory_layout.json`
  4. `source_docs/AI_READ_FIRST.md`
  5. `source_docs/README.md`
  6. `source_docs/PROMPT_NOTES.md`
  7. `REFERENCE_INDEX.json`
  8. every file in `images/`, including the raster overview, all four numbered
     references and the SVG ratio-map source;
  9. all five files in `original_idea_refs/` to verify Orb, Halo and One-Eye
     shape authority.
- Also read `README_REFERENCE.md` and `CODEX_VISUAL_ACCEPTANCE_PROMPT.md` after
  completing the mandatory sequence.
- Confirmed the primary visual design authority is
  `images/01_master_front_back_full_assembly.png`; other pack images are
  secondary depth, placement, ratio and occlusion references.
- Re-audited the current checkpoint/source snapshot. M1–M5 production work and
  focused regression evidence are present. The former M5 256-check WebGL audit
  is a technical runtime audit and does not constitute the new reference-pack
  visual acceptance requested by the user.
- Confirmed the current project still contains the production boss, Orb, Halo,
  four accessory GLBs, 28 animation GLBs and the One-Eye GLB. No production
  file or scene has been edited during reference intake.
- Confirmed this source snapshot still has no readable `.git` metadata; exact
  continuation state must be reconstructed from files and checkpoints.

Numerical constraints accepted for geometry-aware comparison:

- Body visual height `H` excludes Crown and floating assets.
- Halo: `UpperChest/Spine2` visual root, center `U=0.82H`, `0.22 m` behind,
  diameter `0.50H` / approximately `1.50× shoulderWidth`.
- Orb FOLLOW: `LeftHandSocket`, anatomical-left `0.35 m`, up `0.08 m`, sphere
  diameter `0.14H`, ring tilt approximately `18°`.
- Wearables: Crown `0.33× headHeight`; Moon Talisman `0.10× headHeight`; Mantle
  span `1.35× shoulderWidth`; Nocturne Core `0.16× headHeight`; cuffs
  `0.20× forearmLength`; skirt rear clearance `0.04–0.07 m`.
- One-Eye geometry: visual length approximately `0.38H`, eye/head
  approximately `0.16H`; four reference slots are spacing/depth guides only.
  Runtime `max alive` remains **3** and must not be changed to 4.
- Black Moon: Ultimate only, `1.20–1.50 m` behind, center `U≈0.68H`, diameter
  `1.40–1.60H`.

Exact files modified at this checkpoint:

- `CODEX_HANDOFF.md` — reopened release state and recorded reference intake.
- `V10_25_PROGRESS.md` — added the mandatory visual-reference phase as in
  progress and marked the prior packaging artifact provisional.
- No production, scene, asset or test file has been modified.

Architecture decisions:

- Current V10.25 repository/spec remains gameplay and combat authority.
- The new reference pack is visual-design authority; actual project GLBs remain
  geometry authority. Orb, Halo and One-Eye geometry will not be rebuilt from
  generated reference images.
- Preserve all current rig, retarget, animation, Combo Graph, Adaptive AI,
  Poise/Super Armor/Critical Break, Orb/Halo, One-Eye, multiplayer,
  reconnect/snapshot and Zero Hour systems. Apply only the smallest verified
  visual correction after actual geometry and live-WebGL diagnosis.
- Treat
  `D:/Princess_Rescue_V10_24/game/Princess_Rescue_V10_25_ECLIPSE_BATTLE_MAGE_COMPLETE.zip`
  as provisional because it predates this mandatory pass. Do not create a new
  final archive until the pass is complete.

Tests passed/failed:

- No test was rerun during reference intake because no production behavior was
  changed and the user required only incomplete, failed, uncertain or directly
  affected tests to be rerun.
- Live visual acceptance: **NOT STARTED** at this checkpoint.
- Failed tests: none.

Known issues and risks:

- Current source constants visibly differ from some numerical constraints
  (notably Orb FOLLOW offset and dynamic Halo scale), but these are candidate
  mismatches only until measured against actual GLB bounds and live poses.
- The production body may already bake the Crown, Mantle, High Collar, dress
  and hair; loading duplicate geometry is forbidden without live/asset proof.
- Reference imagery shows four One-Eyes, while runtime remains capped at three;
  final composition must use three actors without weakening reference spacing,
  symmetry and occlusion readability.
- Prior ZIP packaging is no longer final acceptance evidence.

Unfinished work:

- Measure actual GLB bounds, axes, hierarchy and body proportions.
- Compare the live WebGL boss against the reference in every required view and
  pose, including wide-leg melee, One-Eye formation and complete Zero Hour.
- Classify each observed mismatch, implement only the smallest correction,
  reverify in real WebGL and rerun only directly affected tests.
- Complete this checkpoint in both continuity files before any new final ZIP.

Exact next phase:

- **Boss Visual Reference Acceptance — geometry inspection and live baseline.**

Exact commands needed to resume (PowerShell from this project directory):

```powershell
$node = 'C:\Users\NIWA\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
rg -n "BossAssetAssembler|prepareBossPropModel|updateBossArmament|OneEyeMobVisuals|visualaudit" public\v10_25\boss-runtime.js public\index.html server.js
& $node server.js
```

## Continuation state verification — 2026-08-26

- This workspace is a source snapshot with no readable `.git` metadata at the
  workspace root or inside `game/Princess_Rescue_V10_25`. Recent work was
  reconstructed from file timestamps, continuity notes and direct source/test
  inspection; no diff or commit history is available.
- Read the complete V10.25 implementation specification in
  `docs/V10.25 IMPLEMENTATION SPEC — ECLIPSE BATTLE MAGE COMPLETE BOSS PIPELINE.md`
  plus `V10_25_ECLIPSE_BATTLE_MAGE_COMPLETE.txt` and `V10_25_PROGRESS.md`.
- Verified that the documented overhaul is implemented in the repository:
  `lib/v10_25_combat.js` contains the logical action library, adaptive memory,
  weighted selection and 12 Combo Graphs; `server.js` owns trajectories,
  teleports, damage, Orb/Halo state, One-Eye attacks/hazards and the eight Zero
  Hour stages; `public/v10_25/boss-runtime.js` contains rest-pose retargeting,
  layer masks, controlled accessory anchors, One-Eye visuals, pooled impacts
  and debug state; `public/index.html` loads and drives those systems.
- Verified that all 28 catalogued animation GLBs, four accessory GLBs and the
  One-Eye GLB referenced by the manifest exist in the release tree. The V10.25
  package metadata and UI title are also present at `10.25.0` / V10.25.
- The most recent functional edits match the interrupted investigation:
  `server.js` (18:04), `tests/v10_20_combat_feel_upgrade.js` (18:05), and
  `tests/v10_19_4_movement_input_stability.js` (18:00). The continuity files
  were last written at 18:06.
- Durable prior-session JSONL confirms the last full chain passed through
  V10.19.3 and stopped at V10.19.4's exact-string dash-event guard, not at a
  live timeout. The subsequent isolated live timeout was a deterministic
  single-client harness deadlock: it created a normal co-op room and waited for
  a Princess client that did not exist. After switching that probe to
  `testMode:'boss-only-damage'`, it passed in 13.82 s. The timeout/debug cleanup
  changed the script after that pass, so the current file still needs coverage
  in the pending complete-chain run. V10.20's final 13.20 s pass is current and
  is not being rerun individually.
- No source or asset files were reverted or replaced during this verification.

## Mandatory checkpoint — Phase L1 / V10.21 regression

Status: **COMPLETED — V10.22 has not started.**

Completed checkpoint work:

- Reconstructed the source snapshot and verified the V10.25 implementation and
  assets against the specification.
- Updated this handoff before beginning inherited regression execution.
- Ran only the first previously unverified test,
  `tests/v10_21_boss_phase_combat_director.js`.
- Reproduced a deterministic inherited-test harness failure before its live
  health check: the VM context that extracts `hitBoss()` did not provide the
  V10.25 dependency `V1025_HIT_STOP_MS`.
- Added the missing hit-stop fixture to that isolated VM context and reran the
  test through its live server `/healthz` assertion successfully.

Files modified at this checkpoint:

- `CODEX_HANDOFF.md` — continuation audit and V10.21 failure evidence.
- `V10_25_PROGRESS.md` — phase/status ledger and current regression state.
- `tests/v10_21_boss_phase_combat_director.js` — added the V10.25 hit-stop
  constant fixture required by the extracted `hitBoss()` unit context.

Architecture decision:

- Preserve the production hit-stop hierarchy in `server.js`. Repair the
  isolated inherited VM harness by supplying the same V10.25 hit-stop constants
  it now depends on; do not weaken or duplicate production combat behavior.

Tests:

- **FAILED:**
  `node tests/v10_21_boss_phase_combat_director.js`
  — `ReferenceError: V1025_HIT_STOP_MS is not defined` at the extracted
  `hitBoss()` combat-event payload before the harness repair.
- **PASSED after repair:**
  `node tests/v10_21_boss_phase_combat_director.js`
  — three authored phase decks, no immediate skill repeats, 70/35 thresholds,
  phase lock, ×1.30 punish window, HUD timer and live `/healthz` metadata.
- **NOT STARTED:** V10.22, V10.23 and V10.23.1 continuation checks.

Known issues and risks:

- V10.21's synthetic fixture duplicates the production hit-stop values. If the
  production hierarchy changes, this inherited unit context must be updated in
  step; its live health assertion still guards production metadata/startup.
- The current post-fix V10.19.4 script has not run inside a complete chain, so
  its final scheduling stability remains unresolved.
- Real-WebGL visual QA remains pending.

Unfinished work:

- Run the previously unverified V10.22 player-combat/VFX regression. Fix only a
  concrete failure, then update both continuity files before V10.23.

Exact next phase:

- **Phase L2:** V10.22 player combat animation/skill-VFX regression.

Exact resume commands (PowerShell from this project directory):

```powershell
$node = 'C:\Users\NIWA\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $node tests\v10_22_player_combat_animation_skill_vfx.js
```

## Mandatory checkpoint — Phase L2 / V10.22 regression

Status: **COMPLETED — V10.23 has not started.**

Completed phase:

- Ran the previously unverified V10.22 inherited player combat animation and
  skill-VFX regression against the current V10.25 source snapshot.
- Verified contact-frame sword damage authority, three slash/combo poses,
  pooled crescents and dash afterimages, Hero/Princess skill effects, pause
  clock shifting and synchronized hit recoil metadata.

Exact files modified:

- `CODEX_HANDOFF.md` — recorded the Phase L2 evidence and resume point.
- `V10_25_PROGRESS.md` — marked L2 complete and L3 as the next phase.
- No production or test source file required modification for V10.22.

Architecture decisions:

- Preserve the V10.22 contact-frame scheduling and server-authored impact
  events unchanged. V10.25's combat additions remain layered on top of this
  inherited player-combat contract.

Tests:

- **PASSED:**
  `node tests/v10_22_player_combat_animation_skill_vfx.js`
  — contact-frame sword authority, three slash poses, pooled
  crescents/afterimages, role skill blooms and synchronized recoil.

Known issues and risks:

- This inherited check is a static/isolated contract test; the final live
  two-client WebSocket smoke is still required later in Phase L.
- V10.23/V10.23.1, full-chain stability and real-WebGL QA remain unverified.

Unfinished work:

- Run V10.23 against the current post-V10.25 files, then checkpoint its result
  before starting V10.23.1.

Exact next phase:

- **Phase L3:** V10.23 boss combat intelligence/combo regression.

Exact resume commands (PowerShell from this project directory):

```powershell
$node = 'C:\Users\NIWA\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $node tests\v10_23_boss_combat_intelligence_combo_overhaul.js
```

## Mandatory checkpoint — Phase L3 / V10.23 regression

Status: **COMPLETED — V10.23.1 has not started.**

Completed phase:

- Ran the V10.23 inherited boss intelligence/combo regression against the
  current V10.25 server and browser source.
- Verified Super Armor/Poise, rare weak-point criticals, Critical Break
  anti-stun-lock behavior, adaptive punish metadata and the inherited 12 normal
  + 3 signature + 1 ultimate combo contract.

Exact files modified:

- `CODEX_HANDOFF.md` — recorded Phase L3 evidence and the next resume point.
- `V10_25_PROGRESS.md` — marked L3 complete and L4 next.
- No production or test source file required modification for V10.23.

Architecture decisions:

- Retain the inherited V10.23 combo-library contract as compatibility coverage
  while V10.25's `lib/v10_25_combat.js` graph director supplies the active new
  choreography. Do not delete historical combo metadata merely because the new
  selector supersedes it at runtime.

Tests:

- **PASSED:**
  `node tests/v10_23_boss_combat_intelligence_combo_overhaul.js`
  — Poise/Super Armor, weak critical, anti stun-lock, 12+3+1 combo AI and
  adaptive punish.

Known issues and risks:

- This inherited test validates structural and isolated combat contracts; the
  pending complete suite and WebSocket smoke remain the cross-system checks.
- V10.23.1 reliability, current-file V10.19.4 chain stability and real-WebGL QA
  remain unverified.

Unfinished work:

- Run V10.23.1, checkpoint both continuity files, then prepare the full-suite
  checkpoint before launching the long chain.

Exact next phase:

- **Phase L4:** V10.23.1 runtime reliability regression.

Exact resume commands (PowerShell from this project directory):

```powershell
$node = 'C:\Users\NIWA\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $node tests\v10_23_1_runtime_reliability_hotfix.js
```

## Mandatory checkpoint — Phase L4 / V10.23.1 regression

Status: **COMPLETED — the final complete suite has not started.**

Completed phase:

- Ran the V10.23.1 inherited reliability regression against the current V10.25
  browser/server/assets snapshot.
- Verified filtering of all 779 redundant boss scale channels in the fixture,
  accepted-Tripo persistence, cache-recovery fallback, fake-open socket
  reconnect guards and the iPhone animation/render budget.

Exact files modified:

- `CODEX_HANDOFF.md` — recorded Phase L4 evidence and the long-test resume
  command.
- `V10_25_PROGRESS.md` — marked L4 complete and the final suite in progress.
- No production or test source file required modification for V10.23.1.

Architecture decisions:

- Preserve V10.23.1's validated-body lock and watchdog/budget safeguards as the
  reliability substrate beneath the optional V10.25 retarget/accessory layers.
  Optional V10.25 load failures must continue to degrade without replacing the
  accepted production boss.

Tests:

- **PASSED:**
  `node tests/v10_23_1_runtime_reliability_hotfix.js`
  — 779/2337 scale channels filtered, Tripo lock, cache recovery, fake-open
  socket reconnect and iPhone budget.

Known issues and risks:

- The final complete chain has never passed against the current V10.25 files.
  It is also the required post-cleanup confirmation for V10.19.4.
- HTTP/WebSocket final smoke and real-WebGL visual QA remain separate pending
  phases after the chain.

Unfinished work:

- Run the complete package test command. If it fails, stop at the first concrete
  failure, checkpoint it, and repair only that regression. Do not start final
  network or visual smoke until both continuity files record the suite result.

Exact next phase:

- **Phase L5/L6:** current-file V10.19.4 confirmation within the final complete
  inherited + V10.25 regression chain.

Exact resume commands (PowerShell from this project directory):

```powershell
$pnpm = 'C:\Users\NIWA\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd'
$env:Path = 'C:\Users\NIWA\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;' + $env:Path
& $pnpm test
```

## Mandatory checkpoint — automated Phase L pass and implementation re-audit

Status: **AUTOMATED REGRESSION COMPLETED; V10.25 REMEDIATION IN PROGRESS.**
Real-WebGL QA and release packaging have not started.

Completed checkpoint work:

- Ran the entire `pnpm test` chain against the current snapshot. Every inherited
  V10.17–V10.23.1 test and the V10.25 contract passed.
- Confirmed V10.19.4 in the clean chain on its current post-cleanup script:
  3.63 m movement, 1.02 m boss gap and exactly one dash echo.
- Confirmed final HTTP `/healthz` metadata in the chain's live V10.21 test and
  final two-client create/join, readiness, start and state snapshots in its live
  V10.20 test. The pending network smoke is therefore complete.
- Compared the actual V10.25 tree with the bundled V10.23.1 baseline and audited
  the changed production paths against the full specification. The overhaul is
  substantive, but several completion claims exceed the implemented behavior.

Exact files modified in this continuation so far:

- `tests/v10_21_boss_phase_combat_director.js` — added the missing V10.25
  hit-stop constant to the inherited isolated VM fixture.
- `CODEX_HANDOFF.md` — reconstructed history and mandatory checkpoints.
- `V10_25_PROGRESS.md` — explicit phase/status ledger.
- No production source or asset has yet been modified in the continuation.

Architecture decisions:

- Preserve all working server-authoritative combat, retarget, Orb/Halo,
  One-Eye, multiplayer and inherited behavior. Automated passes are a baseline,
  not proof of live choreography or spec completion.
- Remediate correctness in this order: (M1) authoritative action timing,
  reconnect recovery and interrupt invariants; (M2) feint/teleport/moving-cast
  choreography; (M3) Zero Hour and Orb/Halo completeness; (M4) One-Eye visual
  language, assembly and animation variants; (M5) live WebGL/multiplayer QA.
- Add behavioral tests for each concrete repair rather than weakening existing
  historical string/schema assertions.

Tests passed/failed:

- **PASSED:** bundled-runtime `pnpm test`, including the full inherited chain,
  live V10.19.4/V10.20/V10.21 coverage and the V10.25 contract.
- **FAILED:** none in the current automated suite.
- **COVERAGE GAP:** the V10.25 contract is mostly source/schema validation plus
  a synthetic retarget; it does not exercise actual GLBs, WebGL choreography,
  missed-event animation recovery, live Zero Hour or visual hazard readability.

Known implementation issues and risks:

- Retargeted clips are not fitted to authoritative action durations, and client
  playback starts at local event receipt rather than authoritative server time
  (`lib/v10_25_combat.js`, `public/index.html`). Reconnect/missed-event snapshots
  restore cast metadata without starting/seeking the logical animation.
- False Opening selects a later branch but never cancels the scheduled heavy
  impact. Zero Hour interruption removes tasks but can leave `activeUltimate`
  stale (`server.js`). Perfect Parry lacks a lower active-window bound.
- Zero Hour has no Orb Sky Array client handler, uses no actual slam animation,
  lacks safe-lane semantics and maps Halo collapse to an expanding visual.
- Orb autonomous projectile origin does not match its displayed orbit; recall is
  represented by outward waves; `orb_trap` and `taunt` actions are unreachable.
- Gaze Beam deals line damage but renders as a circular ring. One-Eye stagger /
  despawn states, true moving-cast lower-body locomotion, mirror/variant
  generation and speed curves remain absent or incomplete.
- The logical master hierarchy mostly contains metadata/empty groups; Mantle and
  High Collar are not attached, and the extra Crown may overlap a crown already
  present in the accepted boss model until real-WebGL inspection.
- Production files retain inert historical string sentinels required by exact-
  match inherited tests. Do not remove them until those tests are modernized.

Unfinished work:

- Complete remediation phases M1–M5 with a checkpoint after each.
- Run real-WebGL and live multiplayer animation/ultimate/mob readability QA.
- Audit the final release inventory and create/verify the runnable ZIP without
  `node_modules` only after implementation and visual verification are complete.

Exact next phase:

- **Phase M1 — authoritative timing and state recovery:** fit logical animation
  playback to `endMs`, carry/seek authoritative cast progress on event and
  snapshot recovery, clear Zero Hour state on interruption, and bound Perfect
  Parry to the actual melee active window while preserving all current passes.

Exact resume commands (PowerShell from this project directory):

```powershell
$node = 'C:\Users\NIWA\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
rg -n "function setBossCast|v1025PlayLogicalAction|function interruptBossCombo|perfectParry" public\index.html server.js
& $node --check server.js
& $node tests\v10_25_eclipse_battle_mage_overhaul.js
```

## Mandatory checkpoint — Phase M1 implementation / pre-full-regression

Status: **IN PROGRESS — implementation and focused verification are complete;
the canonical full regression has not started. Phase M2 has not started.**

Completed phase work at this stable milestone:

- Logical V10.25 clips are fitted to the authoritative server interval
  `[startAt, endAt)` and seek to `serverNow()` progress on event, snapshot and
  reconnect recovery.
- Repeated unchanged snapshots are idempotent. A same-ID cast whose timestamps
  shift after Pause is re-fitted and sought in place without resetting the
  action or replaying warning/teleport/kick/impact presentation.
- Late rig/library readiness repairs an active logical cast once it is safe.
  Recovery is blocked during intro, death, stagger, authored presentation
  segments and outside the authoritative cast interval. Legacy casts with no
  `actionId` keep the inherited animation timing path.
- V10.6 additive acting no longer overwrites authoritative logical clip speed.
  Moving-cast lower locomotion remains an independent loop; its actual
  server-authored trajectory is deliberately deferred to M2.
- Perfect Parry now has an inclusive, startup/recovery-derived active window
  for `MELEE` casts, preserves the interrupted `actionId`, and retains the
  145 ms Perfect Parry hit-stop. `AERIAL` remains excluded because the shipped
  contract specifies active melee rather than all physical categories.
- Interrupting Zero Hour now clears `activeCast`, `activeCombo` and
  `activeUltimate`, broadcasts explicit interruption state, and removes only
  hazards/projectiles with the interrupted `castId`.
- Pause clock shifting now covers logical casts, the active ultimate, existing
  arena hazards, boss trajectories, Orb/Halo expiry/cooldown, One-Eye state and
  lunge clocks, scheduled tasks, pending hits and projectile birth metadata.
- Client interruption and authoritative `cast:null` clear logical layers,
  time dilation, Zero Hour art/zoom/vignette and active phantoms without
  modifying the following authoritative stagger window.

Exact files created or modified for M1:

- `server.js` — bounded parry timing, cast-scoped ultimate interruption cleanup,
  Zero Hour hazard tags and complete Pause clock shifting.
- `public/index.html` — authoritative logical playback fit/seek, idempotent
  snapshot/reconnect repair, recovered milestone seeding, legacy-speed guard
  and interruption presentation cleanup.
- `public/v10_25/boss-runtime.js` — idempotent pooled-phantom cleanup reused by
  runtime disposal.
- `tests/v10_25_m1_server_invariants.js` — new server behavioral coverage.
- `tests/v10_25_m1_animation_recovery.js` — new browser-source/VM behavioral
  coverage.
- `package.json` — added both M1 tests to the canonical `test` command.
- `CODEX_HANDOFF.md` and `V10_25_PROGRESS.md` — this mandatory checkpoint.

Architecture decisions:

- Server timestamps remain the sole combat clock. Client animation rate is
  `clipDuration / ((endAt - startAt) / 1000)` and playback position is derived
  from server-time progress; no client-only duration multiplier is introduced.
- Cast identity is `(cast id, actionId)`. Timing fields are mutable authority
  for that identity so Pause/resume can refit in place, while one-shot visual
  flags are monotonic and cannot replay.
- Ultimate transient cleanup is scoped by `castId`; unrelated hazards and
  projectiles survive an interrupt.
- Full-body logical playback is allowed to remain until the ensuing server hit
  or stagger event replaces it; interruption cleanup does not overwrite that
  higher-priority reaction.

Tests passed/failed at this milestone:

- **PASSED:** `node --check server.js`.
- **PASSED:** `node --check public/v10_25/boss-runtime.js`.
- **PASSED:** `node tests/v10_25_m1_server_invariants.js`.
- **PASSED:** `node tests/v10_25_m1_animation_recovery.js`.
- **PASSED:** inherited V10.17.3, V10.17.7, V10.19.1, V10.21, V10.23 and
  V10.23.1 focused regressions.
- **PASSED:** `node tests/v10_25_eclipse_battle_mage_overhaul.js`.
- **FAILED:** none after the final M1 edits.
- **PENDING:** the updated canonical `pnpm test` chain containing both new M1
  tests. The earlier pre-M1 full-chain pass remains valid baseline evidence but
  does not verify these production changes.

Known issues and risks:

- Fitting `power_up` across the full 9.8-second Zero Hour interval produces a
  deliberately slow channel (roughly one third authored speed). Real-WebGL M5
  must judge it; any later adjustment must use an explicit authoritative
  animation interval rather than a client-only speed override.
- M2–M4 gaps from the implementation audit remain: real False Opening cancel,
  timestamped teleport/moving-cast choreography, complete Zero Hour/Orb/Halo
  presentation, and One-Eye/assembly/variant work.
- The focused browser tests execute extracted functions and parse all inline
  scripts, but they are not a substitute for M5 real-WebGL visual acceptance.

Unfinished work:

- Finish M1 by running the canonical full regression with the two new tests in
  sequence. If it passes, update both checkpoint files and only then start M2.
- Do not begin feint, teleport or moving-cast implementation before that final
  M1 checkpoint.

Exact next phase:

- **Phase M1 final verification:** canonical full regression. Phase M2 remains
  blocked on the M1 completion checkpoint.

Exact commands needed to resume (PowerShell from this project directory):

```powershell
$pnpm = 'C:\Users\NIWA\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd'
$env:Path = 'C:\Users\NIWA\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;' + $env:Path
& $pnpm test
```

## Mandatory checkpoint — Phase M1 completion

Status: **COMPLETED — Phase M2 has not started.**

Completed phase:

- Completed authoritative V10.25 logical-animation duration fitting,
  server-time seek, reconnect/snapshot repair, same-ID Pause refitting and
  recovered one-shot suppression.
- Completed bounded inclusive Perfect Parry timing and preservation of the
  interrupted action identity.
- Completed cast-scoped Zero Hour interruption, client presentation cleanup,
  and authoritative Pause clock shifting for active ultimate transients.
- Added the focused M1 server and client behavioral tests to the canonical test
  chain and ran that entire chain successfully after the final production edits.

Exact files created or modified:

- `server.js`
- `public/index.html`
- `public/v10_25/boss-runtime.js`
- `tests/v10_25_m1_server_invariants.js` (created)
- `tests/v10_25_m1_animation_recovery.js` (created)
- `package.json`
- `CODEX_HANDOFF.md`
- `V10_25_PROGRESS.md`

Architecture decisions made:

- Server `[startAt, endAt)` timestamps govern logical playback speed and seek.
  Cast identity excludes mutable timestamps so Pause shifts refit an existing
  action rather than replay it.
- Snapshot milestone flags are monotonic. Authoritative `cast:null` clears
  stale logical presentation immediately; legacy casts without `actionId`
  retain their inherited timing and teleport behavior.
- Perfect Parry is restricted to the existing `MELEE` category and uses a
  startup/recovery-derived inclusive window. `AERIAL` remains outside that
  contract.
- Interrupt cleanup removes only transient objects tagged with the interrupted
  ultimate `castId`; unrelated hazards/projectiles are preserved.
- Pause/resume shifts every active wall-clock field involved in M1, including
  ultimate/hazard, trajectory, Orb/Halo and One-Eye action clocks.
- Zero Hour phantom cleanup is an idempotent runtime primitive and is reused by
  full impact-stack disposal.

Tests passed/failed:

- **PASSED:** final bundled-runtime `pnpm test` after all M1 edits.
- **PASSED in that chain:** V10.17.3, V10.17.6, V10.17.7, V10.17.8,
  V10.17.9, V10.17.9.1, V10.18, V10.19, V10.19.1, V10.19.2,
  V10.19.3, current V10.19.4, V10.20, V10.21, V10.22, V10.23,
  V10.23.1, both M1 tests and the V10.25 contract.
- **PASSED live:** V10.19.4 movement/dash stability (3.63 m movement,
  1.02 m boss gap, one dash echo), V10.20 two-client combat smoke
  (combo 0→1→2, 2.02 m boss gap), and V10.21 `/healthz` metadata.
- **FAILED:** none in the final M1 verification.

Known issues and risks:

- Real-WebGL judgment of the fitted long Zero Hour `power_up` channel remains
  deferred to M5. If its roughly one-third authored rate is visually poor, use
  a new server-authored animation interval rather than a local override.
- M2–M4 audited gaps remain untouched: False Opening impact cancellation,
  authoritative teleport/moving-cast choreography, complete Zero Hour and
  Orb/Halo presentation, and One-Eye/assembly/variant work.
- The source snapshot has no readable Git metadata; the files and these two
  checkpoints are the only authoritative continuation state.

Unfinished work:

- Implement and behaviorally test M2 only: False Opening cancellation,
  timestamped logical teleports and real moving-cast locomotion/layering.
- Then update both checkpoint files before beginning M3.

Exact next phase:

- **Phase M2 — feint, teleport and moving-cast choreography.**

Exact commands needed to resume (PowerShell from this project directory):

```powershell
$node = 'C:\Users\NIWA\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
rg -n "bossFakeOpening|fake:|runBossComboStep|v1025Teleport|teleportAt|upperBody|trajectory" server.js lib\v10_25_combat.js public\index.html tests
& $node --check server.js
& $node --check lib\v10_25_combat.js
& $node tests\v10_25_m1_server_invariants.js
& $node tests\v10_25_m1_animation_recovery.js
```

## Mandatory checkpoint — Phase M2 implementation / pre-regression

Status: **IN PROGRESS — focused M2 verification passes; impacted inherited
regressions are pending. Phase M3 has not started.**

Completed work at this stable milestone:

- False Opening now converts an aggressive/perfect-dodge branch into a real
  server-side cancel at 74% of heavy anticipation, before the damaging impact.
  The cancel removes only that cast's queued effects, telegraph hazards and
  projectiles, keeps the combo alive, then releases the selected Teleport
  Behind transition immediately.
- Logical teleports now expose one authoritative `teleportAt` in both the cast
  and scheduled task/event. Teleport events include cast identity, source and
  destination coordinates, entry timing and server-owned altitude.
- Teleport Above sets boss altitude to 2.6 m. The following Aerial Slam owns a
  three-dimensional server trajectory that lands at ground height on its
  authoritative impact frame; client snapshots interpolate that Y coordinate.
- Strafe Cast now uses a server-owned lateral trajectory plus the lower-body
  `dodge_left` clip under upper-body Quick Cast A. Floating Cast now layers
  upper-body Heavy Cast over looping `floating` locomotion.
- Late animation-library readiness detects and repairs a moving cast that had
  temporarily fallen back to idle legs.
- Legacy skill-3 Teleport → Spin Kick timestamps and presentation paths were
  left unchanged.

Exact files created or modified for M2 so far:

- `lib/v10_25_combat.js` — moving/floating layer metadata, strafe trajectory
  and impact-timed Aerial Slam descent.
- `server.js` — authoritative boss Y, teleport metadata, feint cancellation,
  cast movement fields and Pause shifting of the new timestamps.
- `public/index.html` — moving lower-body selection/fitting/repair, boss Y
  interpolation, recovered feint UI and cancel presentation handling.
- `tests/v10_25_m2_choreography.js` (created) — focused graph, server and
  browser-layer behavior.
- `package.json` — added the M2 test to the canonical chain.
- `CODEX_HANDOFF.md` and `V10_25_PROGRESS.md` — this checkpoint.

Architecture decisions:

- A feint is cancellation of an already-authored cast, not a cosmetic branch.
  Its cancel task is scheduled before its impact tasks and every transient is
  keyed by `castId` so unrelated combat state survives.
- Teleport position and altitude are server state. Root animation X/Z remains
  stripped; the client only interpolates replicated coordinates.
- Moving-cast upper and lower clips use separate authoritative intervals. The
  upper clip fits the cast; the lower clip fits the movement trajectory (or the
  cast interval for looping float), preserving M1 server-time recovery.
- Aerial Slam's trajectory ends at `impactAt`, preventing an early visual
  landing before server damage.

Tests passed/failed:

- **PASSED:** syntax checks for `server.js`, `lib/v10_25_combat.js` and the new
  M2 test.
- **PASSED:** `node tests/v10_25_m2_choreography.js`.
- **PASSED after one compatibility repair:**
  `node tests/v10_25_m1_animation_recovery.js`. Its first run failed only
  because a new feint statement split a historical exact-source sentinel;
  statement order was adjusted without changing behavior, then the test passed.
- **PASSED:** `node tests/v10_25_m1_server_invariants.js` before the final
  action-metadata-only Aerial Slam adjustment; server M1 paths are unchanged by
  that metadata edit.
- **PENDING:** impacted legacy teleport, Pause, boss-director, combo and V10.25
  contract regressions.

Known issues and risks:

- Real-WebGL inspection of strafe foot contact, airborne height and the
  teleport dissolve remains M5 work.
- False Opening's cancel selection remains condition-controlled by the existing
  adaptive graph and 22-second combo cooldown; M2 changes only make the already
  selected cancel branch mechanically real.
- Orb-origin and complete Zero Hour/Halo issues remain explicitly deferred to
  M3. One-Eye/assembly/variant issues remain deferred to M4.

Unfinished work:

- Run only the regressions impacted by M2's server/client choreography changes.
- Fix any concrete regression, rerun only failed/affected checks, then write the
  M2 completion checkpoint before starting M3.

Exact next phase:

- **Phase M2 final verification:** targeted inherited regression set. M3 is
  blocked until both checkpoint files record M2 complete.

Exact commands needed to resume (PowerShell from this project directory):

```powershell
$node = 'C:\Users\NIWA\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $node tests\v10_14_boss_ai_animation_integration.js
& $node tests\v10_17_3_debug_smoke.js
& $node tests\v10_19_1_pause_exit_match.js
& $node tests\v10_21_boss_phase_combat_director.js
& $node tests\v10_23_boss_combat_intelligence_combo_overhaul.js
& $node tests\v10_25_eclipse_battle_mage_overhaul.js
```

## Mandatory checkpoint — Phase M2 completion

Status: **COMPLETED — Phase M3 has not started.**

Completed phase:

- Implemented real False Opening cancellation, timestamped/three-dimensional
  logical teleports and authoritative moving/floating cast layering.
- Added focused behavioral coverage to the canonical package test inventory.
- Ran only the M2-focused and inherited tests made uncertain by the changed
  server/client choreography; all final results pass.

Exact files created or modified:

- `lib/v10_25_combat.js`
- `server.js`
- `public/index.html`
- `tests/v10_25_m2_choreography.js` (created)
- `tests/v10_14_boss_ai_animation_integration.js` — repaired three stale
  pre-V10.19/pre-V10.23 harness assumptions; production behavior was not
  changed for those failures.
- `package.json`
- `CODEX_HANDOFF.md`
- `V10_25_PROGRESS.md`

Architecture decisions made:

- False Opening's branch selection stays in the adaptive graph. When that
  graph selects cancel, the server creates a cast-scoped cancellation task at
  74% of anticipation, before impact, and immediately transitions to the
  already-selected teleport node.
- Logical teleport `teleportAt`, cast/task/event identity, source/destination
  and altitude all originate on the server. The client interpolates snapshots
  and never derives gameplay displacement from animation root motion.
- Teleport Above uses 2.6 m server altitude and Aerial Slam reaches `y=0` at
  its impact timestamp.
- Strafe Cast fits lower `dodge_left` to the server trajectory while fitting
  upper Quick Cast A to the cast interval. Floating Cast layers upper Heavy
  Cast over looping `floating`; late-loaded preferred lower clips replace idle
  fallback safely.
- Legacy skill-3 Teleport → Spin Kick remains on its inherited 250/360/860 ms
  chained timeline.

Tests passed/failed:

- **PASSED:** `node tests/v10_25_m2_choreography.js`.
- **PASSED:** M1 server/client focused invariants after the M2 edits.
- **PASSED:** `node tests/v10_14_boss_ai_animation_integration.js` live smoke
  after repairing its obsolete harness expectations.
- **PASSED:** inherited V10.17.3 browser smoke, V10.19.1 Pause/Exit, live
  V10.21 boss director/health, V10.23 combat intelligence and the V10.25
  overhaul contract.
- **FAILED then repaired (test harness only):** V10.14 first expected the old
  10.8 s intro instead of the protected 9.0 s timeline, then expected the old
  standalone 1280 ms forced-cast profile instead of V10.23's 860 ms chain, then
  hard-coded Hero rather than the role chosen by the authoritative teleport.
- **FAILED in final verification:** none.
- The full package chain was intentionally not rerun: the user requested only
  incomplete/failed/uncertain tests, and the targeted set covers every file and
  inherited contract changed by M2.

Known issues and risks:

- Foot contact, teleport dissolve and airborne silhouette still require M5
  real-WebGL judgment.
- The additional authoritative `boss.y` field is backward-compatible with old
  snapshots through a zero default, but only the new focused test currently
  exercises the airborne-to-ground sequence.
- M3 gaps remain untouched: Orb visual/authoritative origin mismatch, Recall
  behavior, Orb Trap reachability, Orb Sky Array, safe lanes, slam choreography
  and true Halo collapse.

Unfinished work:

- Implement and behaviorally test M3 only: Zero Hour and Orb/Halo completion.
- Update both checkpoint files before beginning M4.

Exact next phase:

- **Phase M3 — Zero Hour and Orb/Halo completion.**

Exact commands needed to resume (PowerShell from this project directory):

```powershell
$node = 'C:\Users\NIWA\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
rg -n "runZeroHourStage|zeroHourOrbArray|zeroHourSlam|bossOrbState|bossHaloState|ORB_TRAP|ORB_RECALL|arenaHazard" server.js lib\v10_25_combat.js public\index.html public\v10_25\boss-runtime.js tests
& $node --check server.js
& $node --check lib\v10_25_combat.js
& $node tests\v10_25_m2_choreography.js
```

## Mandatory checkpoint — Phase M3 completion

Status: **COMPLETED — Phase M4 has not started.**

Completed phase:

- Reconciled detached Orb presentation and gameplay around one replicated,
  world-space controller. ORBIT, AUTONOMOUS, FREE_FLOAT, TRAP, RECALL and
  ULTIMATE visuals consume the server's `x/y/z`; all Orb clone, radial and
  Spirit Orb attacks now launch from those same authoritative coordinates and
  publish their launch origin/timestamp.
- Replaced the placeholder Recall crescent waves with a server-simulated
  outbound-and-returning Orb path. Each leg has its own collision key, the
  permanent Orb follows the path, both clients receive the path contract, and
  the client renders a strong trail without cloning/reparenting the GLB Orb.
- Made Orb Trap reachable as the final Witch Hunt graph node. Its detached
  hover position and delayed danger zone are server-authored and cast-scoped.
- Completed Zero Hour stage linkage: Stage 2 authors six laser warnings plus
  two non-damaging safe lanes; Stage 4 snapshots/broadcasts 12 suspended Orbs;
  Stage 5 owns a 3D impact-timed Heavy Slam trajectory; Stage 6 drops the same
  12 Orb slots while preserving safe corridors; Stage 7 gives Halo Collapse a
  server interval and inward scale; Stage 8 retains recoverable ultimate state
  until cast completion.
- Added pooled client Orb-array presentation, line/lane hazard rendering,
  snapshot-recoverable slam playback and interrupt-safe delayed impact timers.
- Extended Pause clock shifting to every new nested Orb/Halo/ultimate,
  starfall and Recall timestamp.
- Added focused M3 behavioral coverage to the package test inventory and ran
  only the inherited contracts made uncertain by these files.

Exact files created or modified:

- `lib/v10_25_combat.js` — Witch Hunt now reaches `orb_trap`.
- `server.js` — authoritative Orb controller/origins, two-leg Recall, cast-tagged
  Trap, linked Zero Hour stage state, safe lanes, slam/starfall/collapse, and
  Pause/recovery cleanup.
- `public/index.html` — authoritative detached Orb positioning, server-age
  muzzle reconciliation, Recall trail, pooled sky array, line/safe-lane
  hazards, snapshot-recovered slam, inward Halo collapse and cancellable Zero
  Hour presentation timers.
- `tests/v10_25_m3_orb_halo_zero_hour.js` (created) — focused graph, controller,
  Recall motion, Trap, Zero Hour linkage, safe-lane, collapse, client and Pause
  invariants.
- `tests/v10_25_m1_server_invariants.js` — updated the Zero Hour hazard fixture
  for the new safe-lane/laser/12-slot contract.
- `tests/v10_15_orb_halo_foundation.js` — updated an obsolete one-argument
  armament-load sentinel to the existing parallel-buffer warmup call.
- `tests/v10_15_1_orb_projectile_combat.js` — updated the obsolete 880 ms
  standalone cast expectation to the current 680 ms chain and now validates
  authoritative Orb origins.
- `tests/v10_16_orb_state_spirit_weapon.js` — updated stale post-V10.20 source
  sentinels, included the Recall hit-radius branch, and correlated live Spirit
  Orb launches/hits by projectile id instead of racing the newest events.
- `package.json` — added the M3 focused regression.
- `CODEX_HANDOFF.md`
- `V10_25_PROGRESS.md`

Architecture decisions made:

- The server owns detached Orb world coordinates and every gameplay projectile
  launch origin. FOLLOW/CHARGE remain visually anchored to the actual animated
  hand; their lightweight projectile visuals use server birth time for a
  bounded 165/220 ms hand-to-authoritative-path blend, so late snapshots never
  replay a stale muzzle transition.
- Recall is one persistent server projectile with explicit start/turn/end
  timestamps and per-role/per-leg damage keys. The permanent scene-owned GLB
  follows it; no weapon clone, Skeleton mutation or client hit authority was
  introduced.
- Safe lanes are authoritative, non-damaging line hazards. Suspended Orb slots
  are selected outside those corridors, stored in `activeUltimate`, and reused
  verbatim for Stage 6 starfall damage rather than generating unrelated waves.
- Zero Hour sub-actions remain inside the one ultimate cast. A nested slam
  interval temporarily drives Heavy Slam playback and server Y/X/Z trajectory,
  while snapshot recovery prevents the long `power_up` channel from overwriting
  it mid-slam.
- Halo Collapse is a server-timestamped inward scale to 8% before its radial
  impact. Delayed client-only flashes/trauma are tracked and canceled by the
  existing ultimate interruption cleanup.
- The hazard and sky-Orb presentation stays bounded (24 reusable hazard
  groups, 12 reusable Orb meshes); no per-stage unbounded allocation was added.

Tests passed/failed:

- **PASSED:** final syntax checks for `server.js`, `lib/v10_25_combat.js`, all
  inline browser scripts and `tests/v10_25_m3_orb_halo_zero_hour.js`.
- **PASSED:** focused M3 behavioral regression, including executable Recall
  motion, safe-lane exclusion, linked starfall and new Pause clocks.
- **PASSED:** impacted M1 server invariants and M2 choreography.
- **PASSED live:** V10.15.1 authoritative Orb projectile synchronization and
  V10.16 homing Spirit Orb synchronization on both clients.
- **PASSED:** V10.15 foundation, V10.16.1 Halo socket, live V10.21 boss
  director/health, V10.23 intelligence and the V10.25 overhaul contract.
- **FAILED then repaired (test harness only):** the first M3 run lacked a
  `markDirty` VM stub; V10.15 expected the pre-parallel-warmup armament call;
  V10.15.1 expected the obsolete 880 ms timeline; V10.16 had four obsolete
  post-V10.20 exact-source sentinels and paired the newest launch with an older
  hit. Production behavior was not reverted for any of these failures.
- **FAILED in final M3 verification:** none.
- The canonical full chain was intentionally not rerun: the user requested only
  incomplete, failed or uncertain tests, and the listed focused/inherited set
  covers every M3 production and compatibility surface changed here.

Known issues and risks:

- Real-WebGL judgment of safe-lane width, suspended-Orb depth, slam contact,
  Recall trail readability and Halo collapse remains M5 work.
- The server cannot sample an animated GLB palm. FOLLOW/CHARGE therefore use
  the actual client rig socket while gameplay launches use the replicated
  server anchor plus the bounded visual muzzle blend; detached states are exact
  world-coordinate matches.
- Automated M3 coverage executes server/controller/client source contracts and
  inherited two-client Orb tests, but does not force the full eight-stage
  ultimate in a real browser. M5 must observe the complete sequence.
- One-Eye Gaze Beam shape/readability, stagger/despawn presentation, accessory
  assembly gaps and animation variants are deliberately untouched M4 work.
- This source snapshot has no readable Git metadata; repository files and these
  checkpoints remain the only authoritative continuation state.

Unfinished work:

- Implement and behaviorally test M4 only: One-Eye visuals, assembly gaps and
  missing animation variants.
- Update both checkpoint files again before starting M5.

Exact next phase:

- **Phase M4 — One-Eye visuals, boss assembly and animation variants.**

Exact commands needed to resume (PowerShell from this project directory):

```powershell
$node = 'C:\Users\NIWA\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
rg -n "OneEyeMobVisuals|makeDreamSummon|oneEyeAttack|GAZE_BEAM|ABYSS_LUNGE|BossAssetAssembler|accessor|mantle|collar|mirror|variant" server.js lib\v10_25_combat.js public\index.html public\v10_25\boss-runtime.js public\assets\boss_v10_25 tests
& $node --check server.js
& $node --check public\v10_25\boss-runtime.js
& $node tests\v10_25_m3_orb_halo_zero_hour.js
```

## Mandatory checkpoint — Phase M4 completion

Status: **COMPLETED — Phase M5 has not started.**

Completed phase:

- Replaced the transient One-Eye death behavior with a server-authoritative
  state machine covering `SPAWN`, `IDLE_HOVER`, `ORBIT_BOSS`, `POSITION`,
  `CHARGE`, `VOID_BOLT`, `GAZE_BEAM`, `LUNGE`, `STAGGER`, `DEATH` and
  `DESPAWN`. Death and despawn intervals now remain in snapshots long enough
  for both clients to render them.
- Centralized sword/projectile damage through one summon-damage function.
  Nonlethal hits can cancel a mob-owned Gaze/Lunge and enter bounded Stagger;
  lethal hits publish authoritative death/despawn clocks and award trust once.
- Changed Gaze Beam from a circular warning to a cast/mob-scoped line hazard
  with a 760 ms authoritative charge, visible width/length and line collision.
  Entering Zero Hour cancels an outstanding mob beam/lunge/position and limits
  subsequent support to one readable Void Bolt at a time.
- Added support-coordinator `POSITION` movement for Vortex, Heavy Cast, melee
  crossfire and Critical Break protection cues without exceeding three total
  live/presentation slots.
- Completed One-Eye presentation with per-instance cloned GLB materials,
  authoritative spawn/death progress, charge eye/bloom, target tracking,
  stagger shake, lunge lean and dash trail, tentacle response, pooled hit spark
  and GLB/procedural-fallback dissolve.
- Implemented eight lazy animation variants: `BASE`, `FAST`, `HEAVY`,
  `MIRROR`, `TELEPORT_ENTRY`, `MAGIC_FINISHER`, `PHASE2` and `PHASE3`.
  Heavy uses a piecewise slow-anticipation/fast-release/slow-follow-through
  curve. Mirroring swaps left/right semantic tracks and reflects rest-relative
  quaternion/position deltas rather than duplicating source GLBs.
- Added deterministic server variant selection to every logical cast while
  retaining M1's authoritative interval fit/seek. Full and upper/lower variant
  actions are created only when first requested.
- Resolved the assembly audit from actual GLB contents. The accepted production
  boss is one skinned mesh with baked dress/mantle/crown; the external Crown is
  therefore not stacked. The supplied mantle/nocturne archive contains one
  generic-node rigid collar-like mesh, so it is attached exactly once at
  `Spine02` under `HIGH_COLLAR` and shared logically with `NOCTURNE_CORE`.
  Moon Choker and both Witch Cuffs retain controlled neck/forearm anchors.
- Added focused M4 behavioral coverage to the canonical package test command
  and ran only the inherited contracts made uncertain by M4.

Exact files created or modified:

- `server.js` — One-Eye state/damage/support authority, line Gaze hazard,
  Pause-safe mob clocks, readable Ultimate behavior and cast variant metadata.
- `lib/v10_25_combat.js` — deterministic action/phase animation-variant policy.
- `public/v10_25/boss-runtime.js` — variant generator/library integration,
  evidence-based assembly dispositions and complete One-Eye motion/dissolve.
- `public/index.html` — One-Eye dash-trail pool, authoritative mob clock input,
  pooled hit sparks and variant-aware full/layered playback/recovery.
- `tests/v10_25_m4_one_eye_assembly_variants.js` (created) — executable mob
  lifecycle/hazard/support tests plus synthetic Three.js retiming, mirroring,
  lazy-layer registration and assembly-disposition coverage.
- `tests/v10_25_m1_animation_recovery.js` — supplied the extracted VM with the
  M3 Zero Hour cleanup dependencies and layer-aware variant-library fixture.
- `tests/v10_25_m2_choreography.js` — supplied the extracted layered-playback
  VM with a layer-aware variant-library fixture.
- `package.json` — added the focused M4 regression.
- `CODEX_HANDOFF.md`
- `V10_25_PROGRESS.md`

Architecture decisions made:

- Mob HP, attack transitions, hazard ownership, Stagger, Death and removal
  remain server-owned. Clients only interpolate/present replicated state.
- The hard cap counts retained presentation objects as well as live mobs, so a
  death dissolve cannot be displaced by a newly spawned fourth object.
- Gaze is interruptible during charge and its hazard is identified by `mobId`
  and `castId`; snapshots remove canceled telegraphs without client hit logic.
- Zero Hour suppresses beam/lunge clutter and permits only a single-bolt support
  pattern so safe lanes, danger areas and the boss silhouette remain readable.
- Variant clips are generated from already-retargeted clips, preserve the
  root-X/Z lock, and are cached lazily. Server timestamps still determine
  normalized animation progress, so a variant changes choreography shape but
  never combat timing or authority.
- Mirroring is target-rest-relative and semantic left/right aware. If a
  requested variant cannot be generated, the library reports a variant
  fallback and uses the validated BASE action.
- The production skinned boss remains the source of truth for baked
  mantle/crown geometry. A single rigid source cannot honestly occupy three
  independent transforms, so the combined collar/core mesh has one physical
  holder and multiple logical roles instead of duplicate geometry.

Tests passed/failed:

- **PASSED:** final syntax checks for `server.js`, `lib/v10_25_combat.js` and
  `public/v10_25/boss-runtime.js`.
- **PASSED:** `tests/v10_25_m4_one_eye_assembly_variants.js` after its synthetic
  fixture was given the same base upper action a normally loaded animation
  family has.
- **PASSED:** impacted M1 server invariants, final M1 animation recovery, M2
  choreography, M3 Orb/Halo/Zero Hour, V10.22 player combat, V10.23 combat
  intelligence and the V10.25 overhaul contract.
- **PASSED live:** V10.21 boss director and `/healthz` startup against the M4
  support-director/server changes.
- **FAILED then repaired (test harness only):** the initial M4 test omitted a
  base upper action; M1's extracted contexts omitted the existing M3 Zero Hour
  helpers and returned a full-body key for an upper-layer request; M2's
  extracted context omitted the new animation-library variable. These fixtures
  were made faithful; no production behavior was reverted.
- **FAILED diagnostic command:** one ad-hoc Node inline-script parser command
  was malformed by PowerShell regex escaping. Both the M4 and V10.25 tests then
  parsed every inline browser script successfully.
- **FAILED in final M4 verification:** none.
- The full package chain was intentionally not rerun because the user requested
  only incomplete, failed, timed-out, uncertain or directly impacted tests.

Known issues and risks:

- Real-WebGL alignment/readability is still unverified: combined collar/core,
  Moon Choker, cuffs, baked crown/mantle, Gaze width, dash trail, dissolve and
  mirrored/heavy pose quality require M5 visual acceptance.
- The supplied combined accessory has generic nodes, no Skeleton and no
  animation. Its `HIGH_COLLAR`/`NOCTURNE_CORE` mapping is based on inspected
  bounds and source-archive provenance; there is no separate mantle mesh to
  animate, and no secondary mantle bone exists in the production rig.
- MIRROR is mathematically/rest-pose validated with synthetic Three.js
  coverage, but each representative melee pose still needs live visual
  judgment. Generation safely falls back to BASE on an exception.
- This source snapshot has no readable Git metadata; repository files and these
  two checkpoint documents remain the authoritative continuation state.

Unfinished work:

- Run M5 real-WebGL/live multiplayer acceptance only.
- Validate representative BASE/FAST/HEAVY/MIRROR/TELEPORT/phase poses,
  accessory clipping, full One-Eye lifecycle, Gaze readability, Orb/Halo and
  complete Zero Hour in a real browser with both roles or the supported solo
  combat-test path.
- Record visual/network evidence and any concrete repair in both checkpoint
  files before release inventory/packaging.

Exact next phase:

- **Phase M5 — real-WebGL/live multiplayer acceptance.**

Exact commands needed to resume (PowerShell from this project directory):

```powershell
$node = 'C:\Users\NIWA\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $node tests\v10_25_m4_one_eye_assembly_variants.js
& $node server.js --port 3137
```

Then open `http://127.0.0.1:3137/`, use the built-in solo combat-test path for
deterministic boss acceptance, and use a second browser role for the final
server-authoritative multiplayer/reconnect check. Inspect the V10.25 debug
overlay and browser console after each representative scenario.

## Completed work

- Audited the supplied implementation specification and all Boss Animation,
  Accessories, Weapons and One-Eye source packs.
- Converted and shipped 28 curated Mixamo animation clips as GLB with a source,
  trim, category and fallback manifest.
- Converted and integrated Crown, Witch Cuff, Moon Choker, Nocturne Core and the
  One-Eye source mesh.
- Added the server-authoritative V10.25 logical action library, adaptive player
  memory, weighted anti-repeat selection and 12 named Combo Graph families.
- Added server-controlled dash/dodge/chase/teleport trajectories with animation
  root X/Z removed.
- Added authoritative Orb/Halo states, up to three coordinated One-Eye mobs,
  pooled hazards, Perfect Parry and the eight-stage Eternal Eclipse · Zero Hour.
- Added runtime rest-pose retargeting, 30 FPS sampling, finite validation,
  full/upper/lower animation masks, restrained aim layering and legacy fallback.
- Added logical boss hierarchy and controlled bone-following accessory anchors.
- Added layered impacts, hazard/mob visuals, Zero Hour presentation and expanded
  debug/QA telemetry.
- Updated product title/package/version to 10.25.0, README and release notes.
- Added the V10.25 contract test and updated inherited version guards to permit
  the new release while retaining their historical behavior checks.
- Fixed a 30 Hz boundary rejection in chained player sword attacks by accepting
  inputs within one authoritative tick of cooldown expiry.

## Modified or created files

Core implementation:

- `server.js`
- `lib/v10_25_combat.js` (new)
- `public/index.html`
- `public/v10_25/boss-runtime.js` (new)
- `package.json`
- `package-lock.json`
- `pnpm-lock.yaml` (created by dependency installation)
- `README.txt`
- `V10_25_ECLIPSE_BATTLE_MAGE_COMPLETE.txt` (new)

Assets:

- `public/assets/boss_v10_25/animation_manifest.json` (new)
- `public/assets/boss_v10_25/animations/*.glb` (28 new files)
- `public/assets/boss_v10_25/accessories/*.glb` (4 new files)
- `public/assets/boss_v10_25/mobs/one_eye_mob.glb` (new)

Tests:

- `tests/v10_25_eclipse_battle_mage_overhaul.js` (new)
- Inherited version assertions updated in V10.18–V10.23.1 tests to accept
  `10.25.0` without removing their historical assertions.
- `tests/v10_19_4_movement_input_stability.js`: live timeout raised to 30 s.
- `tests/v10_20_combat_feel_upgrade.js`: pins `BOSS_TEST_SKILL=0` to isolate the
  player-combat contract and uses deterministic 400/450 ms combo links.

Continuity:

- `CODEX_HANDOFF.md` (new; keep current after every major milestone)
- `V10_25_PROGRESS.md` (new; long-term checklist)

## Current architecture decisions

- Server remains authoritative for movement, damage, hit validation, AI,
  branches, mob attacks, hazards and ultimate stage timing.
- Client time dilation is presentation-only and never changes authoritative time.
- Runtime retargeting composes target-rest × inverse(source-rest) × animated
  source world rotation, then converts through the actual target parent chain.
- Only bone rotations and clamped hips Y are transferred. Root/hips X/Z and all
  scale tracks are excluded.
- Existing 19 production boss clips remain fallback actions; a failed optional
  V10.25 clip or accessory cannot block the match or replace the accepted body.
- Static accessories use scene-owned controlled anchors, not reparenting into the
  live Skeleton. The static supplied skirt is intentionally not rigid-bound over
  the already skinned production dress.
- Combo Graph branches read fresh context at every node. Selection uses range,
  phase, dodge/perfect-dodge direction, aggression/defense, action preference,
  cooldowns and anti-repeat history.
- Mob count is hard-capped at three. Hazards and impact effects are pooled or
  bounded and cleared between matches.

## Tests passed

- `node --check server.js`
- `node --check lib/v10_25_combat.js`
- `node --check public/v10_25/boss-runtime.js`
- `node tests/v10_25_eclipse_battle_mage_overhaul.js`
  - PASS: 12 Combo Graphs, 28 animation GLBs, all selected asset GLBs,
    eight-stage Zero Hour, One-Eye cap, finite rest-pose retarget and ROOT X/Z.
- Inherited suite passes through:
  - V10.19 short smoke
  - V10.17.6 combat lab
  - V10.17.7 debug repair
  - V10.17.8 lobby connection-first
  - V10.17.9 parallel warmup
  - desktop 1K startup
  - V10.18 core combat/stability
  - V10.19 camera sync
  - V10.19.1 Pause/Exit
  - V10.19.2 camera regression
  - V10.19.3 occlusion/VFX
- `tests/v10_19_4_movement_input_stability.js` now passes in the clean full
  chain on its current file: moved 3.63 m, maintained 1.02 m boss gap and emitted
  exactly one dash echo.
- `tests/v10_20_combat_feel_upgrade.js` now passes live with sword combo 0→1→2,
  Hero 3-wave and Princess 5-wave skills, timed impacts and 2.22 m boss gap.
- V10.21, V10.22, V10.23 and V10.23.1 pass against the current V10.25 files.
- Final bundled-runtime `pnpm test` passes the complete inherited + V10.25 chain.

## Tests pending or incomplete coverage

- No automated regression currently fails.
- M1–M5 now behaviorally and visually cover missed-event recovery, interruption, feint,
  teleport, moving casts, authoritative Orb/Recall/Trap, safe lanes, linked
  Zero Hour stages, Halo collapse, One-Eye lifecycle/beam/support, evidence-
  based assembly disposition and lazy animation variants. The 256-check
  real-GLB/WebGL audit and supported solo network path pass.

## Known bugs and risks

- M1–M5 are resolved and regression-clean. Packaging is no longer blocked on
  implementation or acceptance.
- Converted static accessories are large. They load after critical gameplay
  readiness and degrade safely, but network/memory behavior should be watched.
- A congested multi-tab WebGL automation run triggered adaptive low quality and
  `SUSTAINED_LOW_FPS`; retain low-end/mobile GPU performance as a release risk.
- `node_modules` exists locally for testing but must be excluded from the final
  release archive. Source staging directories live outside the release folder.

## Unfinished work

- Inspect final file inventory and ensure no temporary/test-only instrumentation.
- Update this handoff and `V10_25_PROGRESS.md` with final test evidence.
- Create the final runnable ZIP without `node_modules`.

## Exact next implementation step

Run release inventory/packaging only. Preserve the completed M1–M5 behavior,
exclude `node_modules` and prior archives, verify one runnable project folder,
then checkpoint both continuity files with the final archive evidence.

## Commands to resume testing

PowerShell from `D:\Princess_Rescue_V10_24\game\Princess_Rescue_V10_25`:

```powershell
$node = 'C:\Users\NIWA\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $node tests\v10_25_m4_one_eye_assembly_variants.js
& $node tests\v10_25_m5_webgl_acceptance_contract.js
rg --files -g '!node_modules/**' -g '!*.zip' | Sort-Object
```

If dependencies are absent:

```powershell
& $pnpm install --no-frozen-lockfile
```

## Mandatory checkpoint — Phase M5 completion

Status: **COMPLETED — release inventory/packaging has not started.**

Completed phase:

- Ran the production client in a real Chromium/WebGL session instead of relying
  on static/synthetic coverage alone.
- Reproduced the lobby asset gate stalling at 25%. The swallowed exception was
  `TypeError: entry.group.removeFromParent is not a function` from
  `BossImpactStack.dispose()` during `clearDynamic()`.
- Added bounded lobby prewarm telemetry and made impact/phantom/light disposal
  compatible with both `removeFromParent()` and the shipped Three.js
  `parent.remove(object)` path. The lobby then reached
  `TRIPO BOSS READY · 1K ✓` with no console warning/error.
- Extended the repository-owned `visualaudit` from its V10.19-only coverage to
  a V10.25 M5 acceptance pass. It now waits for all 28 logical animations,
  accessory assembly and One-Eye GLB readiness, then samples all eight variants,
  the controlled assembly, seven One-Eye lifecycle states, Gaze/safe-lane
  geometry, 12 Zero Hour Orbs and inward Halo Collapse in the production WebGL
  renderer.
- The first expanded audit reached 249 checks and found a second concrete
  runtime fault: `makeDreamSummon()` stored the ring wrapper Group while
  `OneEyeMobVisuals.update()` wrote `ring.material.opacity`. The controller now
  stores the material-owning Mesh and retains a wrapper-compatible runtime guard.
- The final real-WebGL audit passes **256 checks** with the report
  `19 clip · 8 V10.25 variants · One-Eye · Zero Hour` and no console
  warning/error.
- The supported solo multiplayer path passes in one uninterrupted browser
  session: fresh lobby, 1K asset readiness, enabled start, arena entry,
  `ONLINE CO-OP — START`, 11 ms network badge and rendered production intro with
  no reconnect or console warning/error.

Exact files created/modified during M5:

- `public/index.html`
  - Added lobby prewarm failure telemetry.
  - Added the V10.25 M5 real-WebGL audit stages/results/report.
  - Extracted `updateV1025ArenaHazards()` so live sync and visual acceptance use
    the same pooled hazard renderer.
  - Corrected the One-Eye ring reference from the wrapper Group to its Mesh.
- `public/v10_25/boss-runtime.js`
  - Added Three.js-compatible pooled-object detachment.
  - Added a safe One-Eye ring material lookup for older wrapper roots.
- `tests/v10_25_m4_one_eye_assembly_variants.js`
  - Added executable impact-stack disposal coverage against the shipped
    Three.js runtime.
- `tests/v10_25_m5_webgl_acceptance_contract.js` — new M5 contract test.
- `package.json` — added the M5 contract test to the canonical chain.
- `CODEX_HANDOFF.md` — this checkpoint.
- `V10_25_PROGRESS.md` — all V10.25 implementation/acceptance phases marked
  complete; release packaging remains not started.

Architecture decisions:

- Keep `visualaudit` as the authoritative in-repository M5 harness. It calls the
  same production animation library, asset assembler, One-Eye controller,
  hazard pool, Orb Array controller and Halo controller used by live combat.
- Keep the server authoritative. The M5 audit creates presentation samples only;
  it does not change server combat, damage, AI, Pause or multiplayer state.
- Keep disposal compatible with the actual bundled Three.js runtime rather than
  requiring a library upgrade during the release checkpoint.
- Preserve the GLB One-Eye model and procedural fallback contract by accepting
  either a material-owning Mesh or a legacy wrapper with a material child.
- Preserve adaptive quality behavior. Performance warnings from the heavily
  instrumented multi-tab browser run are recorded as a release risk, not hidden
  or converted into a false functional failure.

Tests passed/failed:

- **PASSED:** `node --check public/v10_25/boss-runtime.js`.
- **PASSED:** all five non-empty inline scripts in `public/index.html` parse.
- **PASSED:** `tests/v10_14_2_visual_error_audit.js`.
- **PASSED:** `tests/v10_25_m3_orb_halo_zero_hour.js`.
- **PASSED:** `tests/v10_25_m4_one_eye_assembly_variants.js` after adding the
  shipped-Three.js disposal regression.
- **PASSED:** `tests/v10_25_m5_webgl_acceptance_contract.js`.
- **PASSED:** `tests/v10_25_eclipse_battle_mage_overhaul.js`.
- **PASSED real WebGL:** final 256-check V10.25 M5 audit; zero console
  warning/error.
- **PASSED live supported-solo network smoke:** asset-ready → start → arena,
  network connected at 11 ms, no reconnect and zero console warning/error.
- **FAILED then repaired:** lobby prewarm initially stalled at 25% because the
  bundled Three.js object lacked `removeFromParent()`.
- **FAILED then repaired:** first expanded audit stopped at 249 checks because
  the One-Eye ring reference did not own a `material`.
- **FAILED in final M5 verification:** none.
- The canonical full package chain was intentionally not rerun: the user asked
  to rerun only incomplete, failed, timed-out, uncertain or directly impacted
  tests, and the focused set covers every M5 production change.

Known issues and risks:

- A browser run with many simultaneous WebGL tabs recorded one initial
  `FRAME_STALL` and later `SUSTAINED_LOW_FPS`; adaptive quality correctly fell
  to `low` at render scale 0.86. This environment was rendering roughly
  241k–244k triangles across an instrumented, congested session. The clean
  single-session functional path stayed connected and error-free, but final
  release notes should retain the mobile/low-end GPU performance risk.
- The supported solo path fulfills the handoff's allowed M5 route. Historical
  two-client WebSocket behavior remains covered by the already-passed V10.20
  live smoke and was not rerun because M5 did not change server networking.
- The source snapshot still has no readable Git metadata. Repository files and
  these two checkpoint documents are the only authoritative continuation state.
- `node_modules` is local test material and must not enter the release ZIP.

Unfinished work:

- Audit the final release tree for temporary/debug/generated files without
  removing source diagnostics or M5 tests that are part of the product.
- Create `Princess_Rescue_V10_25_ECLIPSE_BATTLE_MAGE_COMPLETE.zip` without
  `node_modules` or prior ZIPs.
- Verify the archive contains exactly one runnable project folder, extract/list
  it non-destructively, and record the final inventory/archive evidence in both
  checkpoint files.

Exact next phase:

- **Release packaging — final inventory and runnable ZIP.** Do not alter combat,
  retarget, Orb/Halo, One-Eye, multiplayer or M1–M5 behavior unless the release
  inventory exposes a concrete packaging defect.

Exact commands needed to resume (PowerShell from this project directory):

```powershell
$node = 'C:\Users\NIWA\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $node tests\v10_25_m5_webgl_acceptance_contract.js
& $node tests\v10_25_eclipse_battle_mage_overhaul.js
rg --files -g '!node_modules/**' -g '!*.zip' | Sort-Object
Get-ChildItem -LiteralPath . -Force | Select-Object Name,Length,LastWriteTime
```

## Mandatory checkpoint — Release packaging completion

Status: **COMPLETED — no required V10.25 phase remains.**

Completed phase:

- Audited the final project tree: 154 files and 89,281,435 uncompressed bytes
  before the final checkpoint update. No temporary log/backup/reject/screenshot
  artifact or secret-key/password pattern was found.
- Preserved all runtime assets, V10.25 source, regression tests, tools,
  documentation and checkpoint files.
- Created
  `D:\Princess_Rescue_V10_24\game\Princess_Rescue_V10_25_ECLIPSE_BATTLE_MAGE_COMPLETE.zip`
  with exactly one root folder, `Princess_Rescue_V10_25`.
- Excluded `node_modules` and all prior/nested ZIP files.
- Listed and extracted the archive into a validated temporary directory. The
  verified archive contained 171 entries and 154 files before the final
  checkpoint refresh; the final refresh changes only these two existing
  checkpoint file contents, not the entry/file count or archive topology.
- Ran release verification directly against the extracted copy.

Exact files created/modified during release packaging:

- Created:
  `D:\Princess_Rescue_V10_24\game\Princess_Rescue_V10_25_ECLIPSE_BATTLE_MAGE_COMPLETE.zip`.
- Modified: `CODEX_HANDOFF.md`.
- Modified: `V10_25_PROGRESS.md`.
- No combat, networking, retarget, Orb/Halo, One-Eye, VFX or server source file
  was changed during packaging.

Architecture decisions:

- Ship one self-contained project folder rather than flattening the archive.
- Exclude installed dependencies so the release stays reproducible from
  `package.json` plus lockfiles and does not ship machine-local `node_modules`.
- Include tests, tools and continuity files because they are part of the
  verifiable V10.25 source release, not temporary artifacts.
- Keep the previous V10.23.1 ZIP beside the release untouched; it is outside the
  V10.25 project folder and is not nested in the new archive.

Tests passed/failed:

- **PASSED archive topology:** one `Princess_Rescue_V10_25` root; no
  `node_modules`; no nested ZIP; required runtime/checkpoint/test files present.
- **PASSED extraction/CRC:** archive extracted without error into a validated
  temporary path.
- **PASSED from extracted archive:** `node --check server.js`.
- **PASSED from extracted archive:**
  `tests/v10_25_m5_webgl_acceptance_contract.js`.
- **PASSED from extracted archive:**
  `tests/v10_25_eclipse_battle_mage_overhaul.js`.
- **FAILED:** none.

Known issues and risks:

- Dependencies are intentionally excluded. A fresh recipient must run
  `pnpm install --frozen-lockfile` (or the documented npm equivalent) before
  starting the server.
- The M5 multi-tab browser performance warning remains documented; adaptive
  quality correctly mitigates it, but low-end/mobile GPU performance should
  still be monitored in distribution builds.
- This source snapshot has no readable Git metadata, so the ZIP and repository
  checkpoint files are the final continuity artifacts.

Unfinished work:

- None required for the V10.25 implementation/release objective.
- Optional future work is distribution/deployment or a separately authorized
  performance optimization phase; neither is part of this completed checkpoint.

Exact next phase:

- **None. V10.25 is complete and packaged.**

Exact commands needed to verify/resume (PowerShell):

```powershell
$zip = 'D:\Princess_Rescue_V10_24\game\Princess_Rescue_V10_25_ECLIPSE_BATTLE_MAGE_COMPLETE.zip'
tar.exe -tf $zip
Get-FileHash -Algorithm SHA256 -LiteralPath $zip
```
