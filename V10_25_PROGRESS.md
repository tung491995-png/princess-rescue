# V10.25 Long-Term Progress

Last updated: 2026-08-28 01:35 (Asia/Bangkok)

## Mandatory phase status

- [x] **Phase A — Asset inspection: COMPLETED.**
- [x] **Phase B — Boss master assembly: COMPLETED.** M4 maps baked production
  mantle/core honestly, maps `nocturne_core.glb` only to High Collar, and loads
  the valid external Crown through `Head/CrownSocket/CrownAxisCorrection`.
- [x] **Phase C — Retarget foundation: COMPLETED.**
- [x] **Phase D — Animation library: COMPLETED.** M4 adds all eight
  lazy variants, piecewise Heavy timing, rest-relative semantic mirroring,
  deterministic server selection and safe BASE fallback. M5 sampled three
  real-WebGL poses for each of the eight variants without runtime faults.
- [x] **Phase E — Motion quality/layering: COMPLETED.** M1 authoritative
  action-duration fit, server-time seek/recovery and independent lower-body
  looping are full-suite verified. M2 server-owned strafe/floating layers and
  airborne slam timing are regression-clean; M5 real-WebGL variant/motion
  sampling passed.
- [x] **Phase F — Choreography/Combo Graph: COMPLETED in code.** M2 makes False
  Opening's selected cancel branch remove its heavy impact; M3 makes Orb Trap
  reachable through Witch Hunt. Focused and impacted regressions pass.
- [x] **Phase G — Orb/Halo combat: COMPLETED.**
  M3 completes authoritative detached origins, launch provenance, damaging
  outbound/return Recall, reachable Trap and inward Halo Collapse; M5 verified
  the production Orb/Halo render path and inward Halo Collapse scale.
- [x] **Phase H — One-Eye Mob/support director: COMPLETED.** M4 adds the
  full authoritative lifecycle, line Gaze, interruptible charge, Position
  coordination, Ultimate readability throttling, dash trail, hit spark and
  GLB/fallback death dissolve. M5 exercised seven representative lifecycle
  states in real WebGL and repaired the ring mesh/material contract.
- [x] **Phase I — VFX/presentation: COMPLETED.**
  M3 adds bounded safe-lane, laser, Orb Array, linked starfall, slam and
  Halo-collapse presentation; M4 adds line Gaze, One-Eye charge/trail/hit/
  dissolve and variant-aware playback. M5 verified the pooled production paths.
- [x] **Phase J — Adaptive AI: COMPLETED in code.**
- [x] **Phase K — Eternal Eclipse · Zero Hour: COMPLETED.** M3 links
  authoritative safe lanes, 12 suspended Orb slots,
  impact-timed Heavy Slam, slot-matched starfall and inward Halo collapse with
  snapshot/Pause/interruption recovery; M5 real-WebGL checks pass.
- [x] **Phase L — Regression/acceptance verification: COMPLETED.**
  - [x] L0 repository/spec/implementation checkpoint reconstructed.
  - [x] L1 V10.21 boss-director regression: COMPLETED after supplying the
    extracted VM context with its V10.25 hit-stop dependency; live `/healthz`
    and all inherited assertions pass.
  - [x] L2 V10.22 player combat/VFX regression: COMPLETED unchanged; all
    inherited static/isolated assertions pass.
  - [x] L3 V10.23 combat intelligence regression: COMPLETED unchanged; Poise,
    weak critical, anti-stun-lock and inherited 12+3+1 combo assertions pass.
  - [x] L4 V10.23.1 reliability regression: COMPLETED unchanged; scale-filter,
    Tripo-lock, cache-recovery, watchdog and iPhone-budget assertions pass.
  - [x] L5 V10.19.4 current-file/full-chain confirmation: COMPLETED — clean
    in-sequence pass (3.63 m, 1.02 m gap, one dash echo).
  - [x] L6 final complete suite: COMPLETED without failures.
  - [x] L7 HTTP health/WebSocket snapshot smoke: COMPLETED through the clean
    chain's live V10.21 health and V10.20 two-client start/state coverage.
  - [x] L8 real-WebGL accessory/clipping and combat visual smoke: COMPLETED —
    256-check V10.25 audit and stable solo lobby→arena path pass.
- [x] **Phase M — post-regression spec remediation: COMPLETED.**
  - [x] M1 authoritative animation timing/state recovery and interrupt/parry
    invariants: COMPLETED — focused and canonical full regressions pass.
  - [x] M2 feint/teleport/moving-cast choreography: COMPLETED — focused and
    targeted inherited regressions pass.
  - [x] M3 Zero Hour and Orb/Halo completion: COMPLETED — focused, live Orb and
    impacted inherited regressions pass.
  - [x] M4 One-Eye visuals, assembly and variants: COMPLETED — focused,
    impacted and live director regressions pass.
  - [x] M5 real-WebGL/live multiplayer acceptance: COMPLETED — concrete lobby
    prewarm and One-Eye ring failures repaired; focused regressions, 256-check
    WebGL audit and supported solo network path pass.
- [~] **Boss Visual Reference Acceptance & Correction: IN PROGRESS.**
  - [x] Mandatory reference documents read in the requested order.
  - [x] All `images/` references and all five Orb/Halo/One-Eye original idea
    references inspected.
  - [x] Primary authority and numerical constraints recorded in
    `CODEX_HANDOFF.md`.
  - [x] Repository/checkpoint state re-audited; no production edit made during
    intake.
  - [x] Actual GLB bounds/hierarchy/axis inspection.
  - [x] Live reference-baseline views: front, left, right and back.
  - [x] Close accessory geometry/scale: High Collar/Core roles and `.115 m`
    Witch Cuffs verified; Crown is externally loaded and Head-parented.
  - [x] Crown export-axis correction: **COMPLETED** — explicit inverse `-90° X`
    hierarchy, isolated FRONT/BACK/LEFT/RIGHT/TOP, required action follow and
    256-check WebGL audit pass; no Crown drop or compensating Y rotation.
  - [x] Halo/Orb correction: centred prop animation pivot; Halo `0.50H`,
    `0.22 m` behind, center `0.82H`; Orb FOLLOW `.35 m / +.08 m`; directly
    affected tests and real-WebGL four-view audit pass.
  - [ ] Live pose/clipping views: Idle, Cast, Dodge, Jab Cross, Knee,
    Uppercut, Sweep, Roundhouse, Flip Kick, Teleport and Heavy Slam.
  - [ ] Three-actor One-Eye formation visual acceptance; runtime cap stays 3.
  - [ ] Complete Zero Hour and Black Moon depth/scale acceptance.
  - [ ] Smallest verified corrections and directly affected regression tests.
  - [~] Retarget pose quality correction: **IN PROGRESS** — live logical Idle,
    Cast, Roundhouse, Teleport and Death reveal severe limb/dress folding while
    the Crown remains correctly attached. Diagnose before further pose matrix.
- [x] **Current-state Release ZIP recreation: COMPLETED.** The deleted archive
  was recreated with 175 files / 199 entries, cleanly extracted, hash-compared,
  M4/M5 checked and launched from the extracted copy. Visual acceptance remains
  open and resumes from the retarget checkpoint; no completed phase is redone.

## Specification and assets

- [x] Read the complete V10.25 implementation specification.
- [x] Inventory all supplied archives and FBX files.
- [x] Inspect animation skeleton hierarchy, FPS and clip presence.
- [x] Inspect accessory and One-Eye mesh/skeleton/animation properties.
- [x] Document asset integration and rejection decisions.

## Animation and boss assembly

- [x] Curate and convert 28 representative source animations.
- [x] Create animation manifest with provenance, trim and fallback data.
- [x] Implement rest-pose-aware world-space retargeting.
- [x] Exclude scale and gameplay root X/Z tracks.
- [x] Add representative-first loading and legacy fallback.
- [x] Add full/upper/lower animation masks and aim layer.
- [x] Add logical boss hierarchy and controlled accessory anchors.
- [x] Preserve skinned production dress/hair and document static-skirt decision.
- [x] Perform final real-WebGL accessory/clipping visual smoke.

## Combat and AI

- [x] Add data-driven logical action library.
- [x] Add 12 named Combo Graph families.
- [x] Add fresh-condition branches and designed cancels.
- [x] Add adaptive action/dodge/parry/distance memory.
- [x] Add weighted anti-repeat selection and debug weights.
- [x] Add server-controlled trajectories and teleports.
- [x] Add Perfect Parry and hit-stop hierarchy.
- [x] Preserve Super Armor, Poise, weak points and Critical Break.

## Orb, Halo, mobs, ultimate and VFX

- [x] Expand Orb authoritative combat states.
- [x] Expand Halo authoritative visual-language states.
- [x] Add One-Eye support director and hard cap of three.
- [x] Add Void Bolt, Gaze Beam and Abyss Lunge.
- [x] Add eight-stage Eternal Eclipse · Zero Hour.
- [x] Keep time dilation presentation-only.
- [x] Add pooled hazards and layered impact stack.
- [x] Add cleanup and expanded runtime telemetry.

## Release metadata and documentation

- [x] Set package/version/title to V10.25 / 10.25.0.
- [x] Update README with run, verify and V10.25 feature summary.
- [x] Add complete implementation/asset decision notes.
- [x] Add `CODEX_HANDOFF.md`.
- [x] Add this long-term progress checklist.
- [~] Record final test evidence in both continuity files: M1–M5 evidence is
  current; release packaging evidence remains.

## Verification

- [x] Server syntax check.
- [x] Combat module syntax check.
- [x] Browser runtime syntax check.
- [x] V10.25 static/asset/retarget contract test.
- [x] Inherited tests through V10.19.3.
- [x] V10.19.4 movement test: current post-cleanup script passes in the clean
  full chain (3.63 m, 1.02 m gap, one dash echo).
- [x] Fix V10.20 combat-feel live-test timeout and verify combo 0→1→2.
- [x] Run V10.21 boss director test (passed after isolated VM fixture repair).
- [x] Run V10.22 player combat/VFX test (passed unchanged).
- [x] Run V10.23 intelligence test (passed unchanged).
- [x] Run V10.23.1 reliability test (passed unchanged).
- [x] Run final complete test command without failures.
- [x] Run final HTTP health and WebSocket snapshot smoke (covered by live V10.21
  health and V10.20 two-client start/state checks in the clean full chain).
- [x] M1 focused server invariants: bounded/inclusive Perfect Parry,
  cast-scoped ultimate cleanup, Zero Hour hazard tags and Pause clock shifting.
- [x] M1 focused client invariants: authoritative duration/seek, duplicate and
  pause-shift snapshot idempotency, recovered milestones, late readiness,
  interruption cleanup and legacy timing preservation.
- [x] Run the updated canonical full suite containing both M1 tests; all tests
  passed after the final M1 production edits.
- [x] M2 focused choreography: real cast-scoped False Opening cancel, shared
  logical teleport timestamps, authoritative altitude/slam landing and fitted
  strafe/floating lower layers.
- [x] Run the M2-impacted inherited regression set; final results pass after
  updating only obsolete V10.14 harness expectations.
- [x] M3 focused Orb/Halo/Zero Hour regression: controller-aligned launch
  origins, executable two-leg damaging Recall, reachable/cast-scoped Trap,
  safe-lane exclusion, recoverable 12-Orb sky array, authoritative slam,
  slot-linked starfall, inward Halo collapse, Pause clocks and delayed-FX
  interruption cleanup.
- [x] Run the M3-impacted inherited regression set: M1 server, M2 choreography,
  V10.15/15.1 Orb, V10.16/16.1 Orb/Halo, live V10.21 director, V10.23
  intelligence and the V10.25 contract all pass. Obsolete V10.15/V10.16 test
  sentinels and a live event-correlation race were repaired without reverting
  production behavior.
- [x] M4 focused One-Eye/assembly/variant regression: executable three-mob cap,
  Charge/Gaze line collision, Stagger cancellation, retained Death/Despawn,
  Position coordination, Ultimate single-bolt pressure, eight synthetic
  variant profiles, mirrored tracks, lazy layers and single-instance
  collar/core assembly all pass.
- [x] Run the M4-impacted regression set: M1 server/client, M2, M3, V10.22,
  live V10.21, V10.23 and the V10.25 contract all pass after making isolated
  M1/M2 VM fixtures aware of existing Zero Hour and new variant dependencies.
- [x] M5 regression set passes: V10.14 visual audit, M3, M4, the new
  `tests/v10_25_m5_webgl_acceptance_contract.js`, and the main V10.25 contract.
- [x] M5 real-WebGL audit passes 256 checks with no console warning/error:
  19 production clips, eight V10.25 variants, assembly/accessories, seven
  representative One-Eye states, Gaze line, safe lane, 12 Zero Hour Orbs and
  inward Halo Collapse.
- [x] Supported solo network acceptance passes from fresh origin: lobby asset
  gate reaches ready, arena starts, network remains connected at 11 ms and the
  production intro renders without console warning/error.
- [x] M5 repaired two concrete runtime faults discovered by WebGL: shipped
  Three.js lacks `removeFromParent()` on the pooled impact objects, and the
  One-Eye ring controller previously stored a wrapper Group instead of its
  material-owning Mesh.

## Packaging

- [x] Audit final release tree for temporary files: 154 source/runtime/test files,
  no temporary log/backup/reject/screenshot artifact and no secret pattern.
- [x] Exclude `node_modules` and prior/nested ZIP files.
- [x] Create `Princess_Rescue_V10_25_ECLIPSE_BATTLE_MAGE_COMPLETE.zip` in the
  parent `game` directory.
- [x] Verify the ZIP contains one `Princess_Rescue_V10_25` root folder and 171
  entries, extracts cleanly, and contains all required runtime/checkpoint files.
- [x] Run `server.js --check`, the M5 contract and the main V10.25 contract from
  the extracted archive; all pass.
