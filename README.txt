PRINCESS RESCUE 3D — V10.17.4 ARMAMENT RUNTIME HOTFIX

V10.17.4 RUNTIME FIX
====================
- Fixes `ReferenceError: d2 is not defined` in the per-frame boss armament
  target selection revealed by both V10.17.3 debug bundles.
- Orb and halo updates no longer stop when Hero/Princess enter the live match.
- Model, textures, animations, camera, server balance and debug ZIP format are
  unchanged.

RUNTIME BLACK BOX
=================
- Records a rolling 120-second diagnostic timeline while the game runs.
- Detects all major historical error classes: Tripo/fallback/model swapping,
  ROOT XZ, halo/orb, camera/full-body, animations, controls, VFX, WebGL,
  networking, HUD bounds, frame stalls and low FPS.
- Captures only on an exception, a detected visual anomaly, or manual Capture.
- Each capture is a separate JPEG file, at most 1280 px wide, quality 0.75.
- Maximum 20 screenshots per run. The JSON stores only filename/path,
  timestamp, game state, camera, entity transforms and the triggering event.
- Reports survive a reload through device-local IndexedDB.
- Press TẢI DEBUG ZIP and upload the ZIP containing debug_log.json plus the
  separate screenshots/ directory.
- Session tokens, room codes, invite links and battle chat are never recorded.

FULL VISUAL QA
==============
- The home-screen QA button scans all 19 source animations, nine gameplay
  transitions, presentation segments and five boss-skill VFX timelines.
- A successful audit does not create screenshots; only a detected anomaly does.
- The recorder keeps preserveDrawingBuffer disabled to protect phone FPS.

INTRO STABILITY HOTFIX
======================
- Intro camera is now driven only by its 10.5 s cinematic timeline. The old
  per-frame full-body correction no longer pulls and pushes the camera.
- Portrait-phone camera radii were recalculated to contain the complete Tripo
  boss, crown and halo without a dynamic correction.
- Boss outer root is fixed to one authoritative anchor throughout the intro;
  network snapshots and idle bob cannot move it between rendered frames.
- Render scale and canvas size stay unchanged throughout the cinematic.
- Mobile browser resize events are deferred and applied once after the intro.
- Camera trauma, camera kick and stale hit-stop are cleared and blocked.
- Rune, black-moon, tether, halo and orb programs are precompiled before reveal.
- AnimationMixer uses cinematic frame time during the intro so clips 16/17 do
  not fall behind the real-time camera timeline on a 20–30 FPS phone.

PRESERVED FROM V10.17
=====================
- Hero/Princess royal swords, three-hit server-authoritative melee, Royal Bolt
  ranged skill, concept HUD/chat/buttons, Tripo boss, orb, halo and Boss AI.

ROYAL BLADE COMBAT
==================
- Hero and Princess now carry distinct royal swords at all times.
- Basic Attack is a three-hit, server-authoritative melee combo with 2.62 m
  reach; the third strike extends to 2.85 m and deals the strongest damage.
- Basic Attack never creates a ranged projectile.
- Skill remains ranged and fires five faceted Royal Bolt sword-crystals with
  bright role-colored trails: cyan/violet for Hero, pink/gold for Princess.
- Sword glow, arc trail, sparkles, charge ring, hit flash and combo callouts
  are pooled/persistent effects and do not allocate a new 3D object per hit.

CONCEPT HUD
===========
- Hero and Princess status cards are grouped at the left edge with ornate
  portraits, HP, stamina, weapon sigils and level labels.
- Boss health/phase stays centered at the top.
- Chat is a compact three-line panel at the bottom center.
- Mobile action buttons use gold fantasy frames: Slash, Arc Shot and Dash.
- The center of the screen remains open for boss readability.

PRESERVED FROM V10.16.2
=======================
- 10.5 s Eclipse Waltz, authoritative 11 s co-op lock, Tripo boss, scene-owned
  virtual Spine02/Head halo, orb weapon, Spirit Orb, 19 animations, ROOT XZ,
  full-body camera, hitboxes, revive, Royal Trust and network recovery.

ECLIPSE WALTZ CINEMATIC
=======================
- Replaces the 4.25 s reveal with a 10.5 s synchronized boss cinematic.
- Clip 16 supplies the authored dance; clip 17 supplies the final pose.
- The title waits until the climax instead of covering the first animation.
- A slow 50–60 degree camera orbit holds the complete boss and halo in frame.
- The server locks movement, attacks, boss AI and timers for 11.0 seconds.

VIRTUAL HALO ATTACHMENT
=======================
- Halo remains scene-owned and never becomes a child of the skeleton.
- Each rendered frame samples Spine02 and Head world positions.
- Their blended position becomes a virtual upper-body anchor, so the halo
  follows leaning, turning and dance motion with a soft 90 ms spring.
- Vertical and horizontal safety clamps prevent extreme clips from pulling the
  halo into the skirt, feet or outside the mobile camera.
- A restrained roll follows upper-body tilt while halo runes spin independently.

SCOPE
=====
- No demon/familiar model was added.
- Combat AI, damage, hitboxes, orb weapon, Spirit Orb, ROOT XZ and co-op
  synchronization remain unchanged.

HALO POSITION REPAIR
====================
- Halo is normalized upright before scaling, including future Tripo exports
  whose ring plane uses a different axis.
- Its visual height is reduced from 3.62 m to 2.74 m so it frames the head and
  shoulders instead of extending toward the feet.
- A scene-owned upper-back socket keeps its center 3.70 m above the boss root
  and 1.12 m behind the facing direction.
- Gentle 0.055 m hover is clamped to 3.62–3.78 m above the boss root.
- No hand, hip, skirt, root-motion or animation bone can move the halo socket.
- Mobile full-body camera bounds include the halo top and rear depth.

PRESERVED FROM V10.16
=====================
- Orb state machine, Spirit Orb projectile, 19 animation clips, ROOT XZ lock,
  hitboxes, co-op synchronization and combat balance are unchanged.

LATEST UPGRADE
==========
- The optimized Tripo orb now floats about 0.53 m from the left palm, leaving a visible air gap outside its 0.42 m radius.
- Idle 18, Combat Idle 08, Quick Cast 13, AOE 14, Teleport 12, Spin Kick 07, Ultimate 17 and Death 15 each drive a distinct orb/halo state.
- Light boss hits create an orb shield without rig recoil. Heavy hits use only clip 09 from 0.62–1.48 s with 60–80 ms hit-stop, orb spring recoil and halo shards.
- Quick Cast releases a large pooled Spirit Orb that homes into its server-selected target; both clients receive the same projectile and hit event.
- The permanent hand-orb GLB is never cloned, reparented or used as a projectile/hitbox.
- The supplied ornamental halo follows the authoritative boss root without joining the skin, skeleton or hitbox.
- Orb and halo load before the client reports `bossAssetReady`, so intro never starts with missing armament.
- A torso-separation guard prevents long animation clips from burying the floating orb inside the corset.
- Halo-inclusive camera bounds keep the complete body and crown ring inside the mobile frame.
- Orb source reduced from 1,894,640 to 31,387 triangles and from 58 MB to 1.2 MB; all textures are 1K.
- Halo remains 14,160 triangles and 1.6 MB with 1K textures.
- The built-in `?visualaudit=1` route now validates Tripo + orb + halo at five samples across every source clip.
- The Tripo boss is validated once from static bind-pose bounds and then locked visible.
- All 19 source clips, nine gameplay transitions, five presentation segments and five skill VFX have a built-in visual audit route (`?visualaudit=1`).
- Additive shoulder/head/arm acting is cleared before AnimationMixer sampling, eliminating crossfade pose contamination.
- Faded actions are stopped and disabled after their transition instead of remaining active in the mixer.
- Cast and evade payloads sanitize non-finite coordinates/timestamps before they can reach Three.js transforms.
- Boss VFX subsystems are isolated so one failed effect cannot skip every later pose, material, environment or camera update.
- Runtime recovery keeps the accepted Tripo model and never swaps to the procedural placeholder.
- Animated SkinnedMesh bounds no longer decide between Tripo and the procedural fallback.
- Repeated visual/VFX recovery cannot replace an already accepted Tripo model.
- Hero can start only after both clients report that their Tripo boss is parsed and precompiled.
- Intro waits for the accepted Tripo rig and plays cropped 05/06 segments on that rig.
- Approved animation map: 18 Idle, 08 Combat Idle, 13 Quick Cast, 14 AOE, 09 Hit, 15 Death, 17 Ultimate.
- Server-authoritative projectile evasion: clip 03 strafes; clip 12 teleports in later phases/crowded fire.
- Fair warningAt → releaseAt telegraph payloads and synchronized warning/impact VFX.
- Only clean ranges of long clips 05/06/11/16 are used for intro and phase presentations.
- V10.13.2 world-XZ root lock, exact-Hip anchor, full-body camera and mobile 2K → 1K retry are preserved.
- See V10_14_BOSS_AI_ANIMATION_INTEGRATION.txt for validation details.

PRINCESS RESCUE 3D — V10.9 BOSS PRESENTATION REPAIR

PRINCESS RESCUE 3D — SERVER MULTIPLAYER V3

V3 ADDS TWO PRODUCTION NETWORK LAYERS
=====================================

A) REDIS PERSISTENCE + RECONNECT AFTER SERVER RESTART
------------------------------------------------------
- Room state is serialized to Redis every ~250 ms.
- Critical operations (create/join/start/resume/disconnect) also persist immediately.
- Session tokens are indexed separately:
    princess-rescue:v3:session:<token> -> { room code, role }
- Room snapshots:
    princess-rescue:v3:room:<CODE>
- A browser refresh still resumes the same role via localStorage token.
- If the Node server restarts/redeploys:
    1. phones lose WebSocket,
    2. existing client auto-reconnect runs,
    3. client sends its session token,
    4. new Node process resolves token from Redis,
    5. room snapshot is lazily restored,
    6. running match stays PAUSED until both players reconnect,
    7. both clients receive resumePlay and continue from persisted state.
- Redis room/session TTL: 6 hours.
- Disconnected role reservation: 120 seconds.

IMPORTANT:
Redis must have persistence suitable for your host if you also want survival across
a Redis process restart. Managed Redis normally handles this according to its plan.

B) LAG COMPENSATION FOR COMBAT / HIT DETECTION
-----------------------------------------------
The server is still authoritative.

1. Action timestamp
   - Client already estimates server clock using ping.
   - Attack / Skill / Dash now sends:
       st = Date.now() + serverOffset

2. Server rewind
   - Server keeps ~1 second of Hero / Princess / Boss position history.
   - Action timestamp is untrusted and clamped.
   - Maximum rewind: 220 ms.

3. Projectile compensation
   - Attack starts from the attacker's historical position at action time.
   - Aim uses historical boss position.
   - Projectile is fast-forwarded by measured action delay, capped at 150 ms.
   - Segment-vs-circle collision is used during fast-forward so it cannot skip through boss.

4. Dash / Perfect Dash fairness
   - Enemy projectile collision is not applied immediately.
   - It enters a short hit-confirm queue: 90 ms.
   - If a Dash packet arrives during that window and its timestamp proves Dash started
     before the hit, the hit becomes PERFECT DASH instead of damage.
   - Dash iframe validation window: 340 ms.
   - This specifically reduces "I dashed on my screen but still got hit" under moderate ping.

5. Server-side swept collisions
   - Moving projectiles use segment-circle collision from previous -> current position.
   - This reduces tunneling when projectile speed is high or a tick is delayed.

PERSISTED GAME DETAILS
======================
Redis snapshot includes:
- room code
- Hero / Princess session tokens
- HP / stamina / food weapon
- positions / cooldowns / revive state
- boss HP / phase / current boss timers
- projectiles
- pickups
- Royal Trust
- pending hit confirmations
- scheduled boss tasks / delayed pickup spawns

Boss delayed attacks were changed from setTimeout-only logic to persisted scheduled tasks,
so a Node restart does not silently delete a pending Giấc Mơ Vỡ / Ba Giờ Sáng wave.

REDIS SETUP
===========
Set:
  REDIS_URL=redis://...
or:
  REDIS_URL=rediss://...   (TLS providers)

The app has a RAM-only fallback for local development, but restart persistence is disabled
when REDIS_URL is missing. /healthz reports whether Redis persistence is active.

RENDER / RAILWAY / FLY / VPS
==============================
Deploy the Node service and a managed Redis instance.

Set the Web Service environment variable:
  REDIS_URL=<connection string from your Redis provider>

Then deploy/redeploy normally.

The included render.yaml leaves REDIS_URL as a secret you must fill in.
The included Docker Compose is convenient for VPS/local testing.

LOCAL WITH DOCKER
=================
docker compose up --build

Open:
http://localhost:3000

LOCAL WITHOUT DOCKER
====================
1. Run Redis on localhost:6379.
2. npm install
3. set REDIS_URL=redis://localhost:6379
4. npm start

HEALTH
======
GET /healthz

Example:
{
  "ok": true,
  "rooms": 1,
  "redis": true,
  "persistence": "redis",
  "uptime": 123
}

FILES
=====
server.js
package.json
render.yaml
Dockerfile
docker-compose.yml
.env.example
public/index.html
README.txt


V4 — ADAPTIVE NETWORK LAB
=========================

ADAPTIVE INTERPOLATION
----------------------
Remote rendering no longer uses a fixed 100 ms buffer.

The client continuously estimates:
- RTT (round-trip ping)
- RTT jitter
- state/snapshot arrival jitter
- missing snapshot ratio from server snapshot sequence numbers

Policy:
- 80 ms  = GOOD network
  roughly RTT < 70 ms, jitter < 12 ms, loss < 1%
- 100 ms = NORMAL network
- 140 ms = ROUGH network
  used when RTT > 130 ms OR jitter > 28 ms OR loss > 3.5%

A candidate buffer must remain preferred for ~1.2 seconds before switching.
This prevents constant 80/100/140 oscillation when the network sits near a threshold.

NETWORK LAB
-----------
Open the deployed game with:
  ?nettest=1

Examples:
  https://YOUR-GAME.example/?nettest=1
  https://YOUR-GAME.example/?room=ABC123&join=1&nettest=1

The hidden lab provides:
- artificial state snapshot loss: 0 / 5 / 10 / 20 / 35%
- artificial inbound delay: 0 / 50 / 100 / 180 / 250 ms
- artificial delay jitter: ±0 / 15 / 40 / 80 ms
- forced 3-second socket outage
- forced 5-second socket outage
- refresh/session-resume test
- server-restart/Redis-resume arming test
- live RTT / RTT jitter / snapshot jitter / loss / active buffer

PACKET-LOSS SIMULATION
----------------------
WebSocket itself is reliable, so this harness deliberately drops selected incoming
STATE SNAPSHOTS at the application layer. Server snapshot messages now have a runtime
sequence number. The next delivered snapshot exposes the gap, allowing the same
adaptive buffer code to measure the simulated loss.

Delay/jitter simulation is applied to STATE and PONG processing. This allows RTT/jitter
and snapshot-jitter logic to react as if the connection had become worse.

RECONNECT HARNESS
-----------------
DROP 3s / DROP 5s:
- captures current room, role, boss HP and match state
- forcibly closes WebSocket
- blocks reconnect for the selected duration
- normal auto reconnect then resumes through the session token
- harness prints PASS/FAIL after resume

REFRESH TEST:
- stores expected room/role in sessionStorage
- reloads the page
- localStorage session token reconnects to the same server room
- harness prints PASS/FAIL after resume

ARM RESTART:
- records current state
- operator then restarts/redeploys Node server
- Redis V3 persistence restores room/session
- automatic reconnect resumes the room
- harness prints PASS/FAIL when resumed

SERVER STATE SEQUENCE
---------------------
Server adds a runtime snapshot sequence:
  { type:"state", seq:123, state:{...} }

The sequence is not persisted and may reset after server restart. Clients reset their
loss estimator on session resume, so a restart is not misclassified as massive packet loss.


V5 — PERFORMANCE / BOSS-SKILL HITCH FIX
=======================================

The main freeze was rendering-side, not network-side.

WHY V4 HITCHED WHEN A BOSS USED A SKILL
----------------------------------------
V4 created a new THREE.Geometry + Material + Mesh for each newly visible projectile.
A radial skill can add 20–42 projectiles at once. On mobile Safari this can trigger:
- many JS allocations in one frame
- material/shader setup
- WebGL object creation
- garbage collection shortly afterward

V4 also rebuilt temporary projectile Maps every render frame and touched the HTML HUD
at display refresh rate.

V5 FIXES
--------
1. PROJECTILES -> GPU INSTANCING
   - one InstancedMesh for normal food projectiles
   - one InstancedMesh for glass shards
   - one InstancedMesh for thought rings
   - capacity 128 visible projectiles
   - shared low-poly geometry
   - shared MeshBasicMaterial
   - per-instance color
   - no new projectile Geometry / Material / Mesh during combat
   - roughly 3 projectile draw calls even when a boss fires dozens of bullets

2. PICKUPS -> GPU INSTANCING
   - food pickups share one Octahedron geometry/material batch
   - no pickup object creation while rendering snapshots

3. PREWARM
   - projectile shaders/materials are compiled in setup3D()
   - first boss cast no longer has to initialize projectile rendering paths

4. LOWER PER-FRAME GARBAGE
   - projectile ID maps are cached per network snapshot
   - no new Map from both projectile arrays every animation frame

5. HUD THROTTLING
   - 3D remains full frame rate
   - HTML HP/Trust/Food HUD updates at 20 Hz
   - removes unnecessary style/text/layout work

6. SNAPSHOT RATE
   - server snapshots: 20 Hz -> 15 Hz
   - interpolation remains active, so remote movement stays smooth
   - ~25% less JSON parsing / state processing

7. DYNAMIC RESOLUTION
   - mobile starts around 1.10 DPR
   - desktop around 1.35 DPR
   - sustained slow frames reduce render scale down to ~0.82 on mobile
   - sustained fast frames slowly restore quality
   - changes are rate-limited to avoid framebuffer resize thrashing

8. MOBILE RENDERER
   - no antialias on mobile
   - shadow map disabled (the game had no actual cast-shadow pipeline)
   - simpler arena geometry
   - slightly lighter fog/lights

9. VĨNH DẠ DOM
   - 12 eye elements are created once at startup
   - skill activation only repositions/toggles them
   - no DOM-node burst during the cast

NETWORK LAB
-----------
Use ?nettest=1.
V5 adds:
- current frame time EMA
- dynamic render scale
- WebGL draw call count

This makes it easy to distinguish network jitter from actual GPU/main-thread stalls.


V6 — COMBAT FEEL
================

1. SERVER-SYNCHRONIZED BOSS TELEGRAPH
-------------------------------------
Every boss skill now creates a persisted cast envelope:
  {
    id,
    i,          // skill index
    startAt,
    impactAt,
    endAt
  }

The same cast is:
- broadcast as `bossCast`
- stored in room state / Redis
- included in snapshots

Both phones render the telegraph against the synchronized server clock.
If one client receives the event slightly later, it jumps to the correct cast progress
instead of starting its own independent timer.

Skill timing:
- Bóng Đêm Lan Ra: impact ~480 ms
- Giấc Mơ Vỡ: impact ~650 ms
- Ba Giờ Sáng: impact ~950 ms
- Vĩnh Dạ: first wave ~620 ms

Bóng Đêm's actual damaging pool now starts after the telegraph rather than immediately.

2. ATTACK / SKILL CLIENT-SIDE PROJECTILE PREDICTION
---------------------------------------------------
When Attack or Skill is pressed:
- local projectile(s) appear immediately
- no round-trip wait
- local predicted shot uses predicted player position and current displayed boss position
- one action ID (`aid`) is sent to server
- authoritative server projectile carries the same `aid`
- server returns `actionAck` with accepted/rejected state and projectile IDs
- predicted projectile is reconciled to server trajectory
- once the authoritative projectile appears in a snapshot, the prediction is removed

Prediction reuses the V5 InstancedMesh batch, so it does NOT bring back the
Geometry/Material allocation hitch.

3. ANTICIPATION / RELEASE / RECOVERY
------------------------------------
Hero and Princess root transforms now have lightweight attack poses:
- anticipation: slight squash / backward lean
- release: fast forward pop
- recovery: spring back to neutral
- Skill has a longer/stronger anticipation curve

Remote player's attack animation is triggered from an authoritative `actionAnim` event
using the server action timestamp.

No bones, new meshes or expensive tween objects are created during combat.

4. HIT-STOP
-----------
Server emits `combatHit` only after authoritative boss damage is confirmed.

Visual hit-stop:
- local confirmed hit: roughly 44–68 ms depending on damage
- teammate hit: ~30 ms
- freezes 3D visual update only
- server simulation/network continue normally
- after the micro-freeze, interpolation catches up
- adds tiny boss squash + camera kick + light flash

This gives attack weight without blocking the JavaScript main thread.

5. SERVER-DRIVEN TELEGRAPH SURVIVES REDIS / RECONNECT
-----------------------------------------------------
`activeCast` is persisted to Redis.
A reconnecting phone can reconstruct an in-progress telegraph from snapshot state.

6. V5 PERFORMANCE RETAINED
--------------------------
- projectile InstancedMesh
- shared geometry/materials
- prewarming
- 15 Hz server snapshots
- 20 Hz HUD
- dynamic resolution
- adaptive interpolation
- reconnect harness
- Redis persistence
- 220 ms combat rewind
- 90 ms hit-confirm grace


V7 — HEAVY COMBAT RENDERER
==========================

WHY
---
V5/V6 already removed per-projectile Mesh allocation, but enemy projectiles still occupied
separate InstancedMesh batches by visual type (shard / thought / generic).

V7 collapses ALL boss projectiles into one GPU draw path.

1. SINGLE BOSS PROJECTILE INSTANCEDMESH
---------------------------------------
All enemy projectiles use:
- one PlaneGeometry
- one RawShaderMaterial
- one InstancedMesh
- up to 128 visible instances

Per-instance attributes:
- aKind
- aColor
- aPulse
- instanceMatrix

`aKind` selects the projectile silhouette in the fragment shader:
- 0: glowing orb
- 1: dream/glass shard
- 2: thought ring

The quad is billboarded to the current camera using its instance transform.

Effect:
20, 40 or 80 mixed enemy bullets remain ONE enemy projectile draw call.

Player food projectiles remain a separate InstancedMesh because they use their own
prediction/reconciliation path and food colors.

2. SHADER VISUALS
-----------------
The fragment shader draws:
- soft orb radial falloff
- angular diamond/glass shard
- hollow thought ring
- cheap additive halo

No texture upload is required and no new Material/Geometry is created during combat.

3. AUTOMATIC BOSS OUTLINE CULLING
---------------------------------
Character outlines are now tagged when they are created.

Only the BOSS outline is disabled when combat becomes heavy:
- 16+ enemy bullets
- phase 3 with 10+ enemy bullets
- Vĩnh Dạ active

Hero and Princess outlines remain on.

Hysteresis:
- after the heavy load ends,
- enemy count must drop below 8,
- and stay quiet for ~650 ms,
- then boss outline turns back on.

This avoids repeatedly toggling outline every frame near the threshold.

4. NETWORK LAB
--------------
?nettest=1 now also displays:
- enemy batch count
- boss outline ON/OFF
- heavy-combat status

Example:
  enemy batch 42 · boss outline OFF · heavy YES

5. EVERYTHING FROM V6 IS RETAINED
---------------------------------
- server-clock boss telegraphs
- anticipation / release / recovery
- hit-stop
- client projectile prediction
- V5 dynamic resolution
- adaptive 80/100/140 ms interpolation
- Redis persistence
- server restart recovery
- lag compensation / rewind
- reconnect harness

V7.1 CONNECTION HOTFIX
======================
- WebSocket now uses explicit /ws path.
- /diag reports Redis + WebSocket status.
- Create-room UI no longer waits for Redis persistence.
- Visible 8-second WebSocket timeout/error instead of infinite 'Đang kết nối server...'.
- Server logs: [ws] connected, [ws] create room, [redis] room persisted.

After deploy test:
  /healthz
  /diag
Then create a Hero room and watch Render logs.

V7.2 START-MATCH HOTFIX
=======================
- Match start no longer awaits Redis before broadcasting `start`.
- Redis start snapshot persists asynchronously.
- Server emits `startAck`.
- Server logs:
    [ws] start requested ABC123 princess=true/false
- If Princess disconnected, Hero gets a visible message instead of a dead button.
- Start button shows ĐANG VÀO TRẬN…
- Client catches 3D/game boot exceptions and prints the actual runtime error in the lobby.
- 8-second start timeout prevents infinite waiting.

V7.3 RUNTIME HOTFIX
===================
Fixes:
  ReferenceError: spin is not defined

Cause:
V7 collapsed boss projectiles into a single shader batch and removed the old local
`spin` variable. Pickup instance rotation still referenced `spin` inside syncEntities().

Fix:
A single cached frame timestamp now drives both:
- boss projectile shader pulse
- pickup instance rotation

No network/gameplay behavior changed.

V7.4 LEAVE ROOM HOTFIX
======================
Fixes the result-screen RỜI PHÒNG button.

Root cause:
V4 used remoteProj / remotePick Maps.
V5+ moved projectiles and pickups to InstancedMesh and removed those Maps,
but leaveRoom() still called:
  remoteProj.clear()
  remotePick.clear()

That caused a ReferenceError before navigation ran.

V7.4:
- removes stale Map cleanup
- clears V7 InstancedMesh counts safely
- clears prediction/input state
- closes WebSocket
- clears local session
- uses location.replace(pathname) so invite query params are removed
- cleanup is guarded, so a visual cleanup error cannot prevent leaving the room

V7.5 MOBILE START + PROJECTILE/SKILL VISIBILITY
===============================================

1. MOBILE START RACE FIX
- One idempotent enterGameFromState() handles start/resume/state repair.
- WebGL scene creation and lobby->game swap are separated across animation frames.
- If THREE is not ready, client retries instead of silently remaining in lobby.
- If `start` event is missed/races with scene initialization, the next authoritative
  `state.started=true` snapshot automatically enters the match.
- Reload is no longer required to enter an already-started match.

2. PROJECTILE TRAILS
- One additional GPU InstancedMesh batch for ALL projectile trails.
- Boss projectiles, authoritative player shots, and predicted local shots get trails.
- Mobile trails are longer/brighter to remain visible under reduced render resolution.
- No per-projectile Mesh/Geometry/Material creation.

3. MOBILE SKILL VISIBILITY
- Boss projectiles slightly larger/brighter on mobile.
- Boss telegraph opacity and scale increased on mobile.
- Giấc Mơ Vỡ moon telegraph increased on mobile.
- Minimum dynamic render scale raised from 0.82 -> 0.92 on mobile so VFX do not disappear
  into a low-resolution buffer.

All Redis/WebSocket/reconnect/lagcomp/combat-feel systems are retained.


V7.6 TOUCH UI LAYOUT
====================

MOBILE CONTROL LAYOUT
- Bên trái: chỉ còn joystick kéo/trượt để di chuyển nhân vật.
- Bên phải góc màn hình: cụm 3 nút ATTACK / DASH / SKILL.
- Cả Hero và Princess đều dùng cùng một layout, không còn lệch theo role.

TECHNICAL NOTES
- showGameUI() luôn hiện cả ctl1 (move) và ctl2 (actions).
- bind() được sửa để hoạt động ngay cả khi một panel chỉ có joystick hoặc chỉ có buttons.
- Kích thước touch target được tăng để bấm dễ hơn trên điện thoại.


V7.9 STABLE MOBILE + DESKTOP CONTROLS
====================================

MOBILE / TOUCH
- Joystick duy nhất ở góc trái.
- ATTACK / DASH / SKILL ở góc phải.
- Tự nhận diện pointer coarse / maxTouchPoints.

DESKTOP
- Touch HUD tự ẩn.
- WASD / Arrow Keys: di chuyển.
- Mouse Left / F / J: Attack.
- Mouse Right / Shift: Dash.
- Space / E: Skill.
- Q: Royal Duo khi đủ Trust.

IMPORTANT STABILITY CHANGE
- KHÔNG còn window-level pointerdown/mousedown combat listener.
- Mouse Attack/Dash chỉ bind trực tiếp lên renderer.domElement (WebGL canvas).
- Lobby/menu HTML nằm z-index cao hơn canvas nên Create Room / Join Room không thể bị desktop combat listener chặn.
- Có query override để test:
    ?controls=desktop
    ?controls=touch


V8.0 ROYAL MOBILE VFX
=====================

ROYAL FEAST — BÌNH MINH ĐẠI TIỆC
- Full-screen 1.58s cinematic overlay.
- 10 canonical food sigils orbit around the duo.
- Cyan/pink crossing beams.
- Golden core rings.
- Gold/pink/cyan staged flashes.
- Screen edge glow.
- Stronger camera punch.
- Mobile vibration feedback when supported.
- Mobile-specific scaling / larger text and food icons.
- Extra compact landscape tuning for phones with low screen height.
- Royal button itself is brighter and more readable at 100% Trust.

PERFORMANCE
-----------
Royal FX uses pre-existing DOM elements and CSS transform/opacity animations.
No new Three.js geometry/material/projectile allocations are created during activation.

Canonical final name:
ROYAL FEAST — BÌNH MINH ĐẠI TIỆC

V9 — MA VƯƠNG MẤT NGỦ CHARACTER ART + FULL COMBAT PASS
V9.1 — DIALOGUE OVERLAY PASS
- Dialogue is now a compact fixed overlay near the bottom edge.
- Desktop: centered above the bottom hint, small translucent card.
- Mobile: centered ~9px above the safe-area bottom, 72vw max, single-line ellipsis.
- pointer-events:none so it never captures gameplay input.
- Reduced font, padding, opacity and shadow so movement/combat sightlines remain clear.

=========================================

ADDED BOSS TIMELINE
-------------------
1. Bóng Đêm Lan Ra — synchronized moon rune telegraph + galaxy dark pool.
2. Giấc Mơ Vỡ — silver moon shatter + radial glass shards + dream crack screen FX.
3. Ba Giờ Sáng — 02:59 -> 03:00 visual freeze + edge projectile pattern.
4. Mộng Du Truy Kích — target cone telegraph + directional dream slash fan.
5. Vĩnh Dạ — Đêm Không Kết Thúc — phase 3 ultimate with night-wave/projectile layers and dream summons.

DIALOGUE
--------
Server-synchronized dialogue events show boss / hero / princess subtitles during casts and phase changes.
Lines are intentionally short during combat to avoid blocking the mobile controls.

SUMMON
------
Tiểu Mộng Ảnh is persisted in room state and restored through Redis snapshots.
Up to three lightweight 3D summon meshes are preallocated on the client.
Summons chase the nearer player, fire thought projectiles, and can be damaged by player projectiles.

MOBILE PERFORMANCE
------------------
- Enemy projectiles remain a single InstancedMesh shader batch.
- Dream summons are capped at three and use low-poly geometry.
- Boss outline is disabled during heavy projectile phases.
- Telegraph meshes are preallocated once.


============================================================
V9.2 — RIGGED CHARACTER RUNTIME
============================================================

- GLTFLoader + DRACOLoader.
- SkinnedMesh / Skeleton / AnimationMixer.
- Cross-fade animation state machine.
- Player: Idle/Run/Dash/Attack/Skill/Hit/Down/Revive/Royal.
- Boss: Idle/Move/Cast_AOE/Cast_Shatter/Cast_3AM/Teleport/Summon/
  Ultimate/Hit/PhaseChange/Death.
- WeaponSocket tự tìm bone tay.
- VFXSocket tự tìm chest/spine.
- Model tự normalize chiều cao.
- Texture sRGB + emissive polish nhẹ cho eye/gem/halo.
- GLB load bất đồng bộ; không chặn start trận.
- Nếu model/loader/animation lỗi: procedural V9 vẫn là fallback.
- Multiplayer root A/B/boss không bị thay đổi nên prediction/interpolation giữ nguyên.

ASSET PATH:
public/assets/characters/hero.glb
public/assets/characters/princess.glb
public/assets/characters/ma_vuong_mat_ngu.glb

Lưu ý: ZIP này triển khai runtime để nhận asset production thật.
Nó không giả lập rằng đã có artist-quality GLB nếu chưa cung cấp model nguồn.


============================================================
V9.3 — MA VƯƠNG REAL RIGGED BOSS ASSET
============================================================

BUNDLED ASSET
public/assets/characters/ma_vuong_mat_ngu.glb

Đây không còn là runtime chờ model:
- GLB boss thật đã nằm trong ZIP.
- 20 bones.
- 11 animation clips:
  Idle, Move, Cast_AOE, Cast_Shatter, Cast_3AM, Teleport, Summon, Ultimate, Hit, PhaseChange, Death
- 8 PBR materials:
  Skin, HairSilverLavender, DressNight, SilverTrim, MoonGlow, EyeDark, LipRose, CrownGold

Boss visual:
- silver/lavender hair
- anime face + emissive purple eyes
- layered dark royal dress
- silver trim
- crescent crown
- eclipse moon halo
- magic orb + star/rune ornaments

Tích hợp:
- Cast_AOE -> Bóng Đêm Lan Ra
- Cast_Shatter -> Giấc Mơ Vỡ
- Cast_3AM -> Ba Giờ Sáng
- Teleport -> Mộng Du Truy Kích
- Summon -> Tiểu Mộng Ảnh
- Ultimate -> Vĩnh Dạ
- PhaseChange -> phase transition
- Hit -> boss hit
- Death -> defeat
- Idle / Move -> base locomotion

Khi load thành công game hiện:
MA VƯƠNG GLB — RIG READY ✓

Hero/Princess GLB vẫn là optional ở bản này; nếu thiếu thì dùng procedural
character fallback như V9.2.


============================================================
V9.4 — MA VƯƠNG BOSS ART POLISH
============================================================

BUNDLED PRODUCTION GLB
public/assets/characters/ma_vuong_mat_ngu.glb

TECH
- glTF Binary 2.0
- 20 bones/joints
- 11 embedded animation clips
- 90 mesh primitives
- ~12,966 vertices
- 17 PBR materials
- compact GLB size: 925.7 KB

ART PASS
1. FACE
- anime porcelain face volume
- separate eye whites
- amethyst emissive irises
- pupils + highlights
- eyebrows
- lips
- forehead jewel

2. HAIR
- silver/lavender layered long hair
- individual back strands
- side locks
- short front bangs that keep the face readable
- root-to-tip vertex color gradient
- HairRoot bone animation retained

3. COSTUME
- dark velvet / plum bodice
- shoulder volumes
- sleeves + cuffs
- layered segmented royal skirt over a solid inner skirt
- rear cape panels
- pearl/silver belt + hem
- moon chest emblem

4. CROWN / HALO
- crescent crown
- amethyst center jewel
- star accents
- triple eclipse halo rings
- twelve orbiting rune/star/jewel markers
- HaloRoot animation retained

5. COMBAT ANIMATION
- all V9.3 skill mappings retained
- boss Hit animation is now wired to combatHit with a 280ms throttle
- Summon / Ultimate / PhaseChange / Death remain wired

MOBILE
The polished boss asset is still under 1 MB.
Procedural model remains fallback if GLB loading fails.

Load confirmation:
MA VƯƠNG V9.4 — ART + RIG READY ✓


============================================================
V9.5 — ANIMATION POLISH + BOSS INTRO CINEMATIC
============================================================

BOSS INTRO
- Server-authoritative 4.4s intro grace.
- Both clients cannot move / attack / dash during the reveal.
- Boss AI and boss skill timers are held during the cinematic.
- Cinematic 4-stage camera:
  1) low 3/4 silhouette reveal
  2) close face / crown / eye reveal
  3) orbit to full-body + halo reveal
  4) smooth pull-back into normal gameplay camera
- Letterbox bars.
- rotating moon sigil.
- crescent/eclipse reveal.
- lower-third boss title:
  MA VƯƠNG MẤT NGỦ
  THE SLEEPLESS MOON
- intro dialogue remains small at the bottom through V9.1 dialogue overlay.
- mobile landscape receives compact title/sigil sizing.

ANIMATION POLISH
- Boss cast animation timing profiles:
  Bóng Đêm Lan Ra -> heavier anticipation
  Giấc Mơ Vỡ -> slower dramatic release
  Ba Giờ Sáng -> longest anticipation
  Mộng Du Truy Kích -> fast/snappy teleport
  Vĩnh Dạ -> slow ultimate presentation
- crossfade profiles tuned per cast.
- SkirtRoot secondary sway layer.
- HaloRoot intro pulse.
- PhaseChange animation is reused for the cinematic reveal.
- Hit / Summon / Ultimate / Death mapping from V9.4 retained.

NETWORK SAFETY
- introUntil is included in authoritative state snapshots.
- input/action handlers reject gameplay during intro.
- mobile start/reconnect logic remains.
- Redis persistence and WebSocket /ws remain.


============================================================
V9.6 — BOSS COMBAT PRESENTATION POLISH
============================================================

SKILL-SPECIFIC IMPACT PRESENTATION
- Bóng Đêm Lan Ra:
  purple radial pulse + low trauma + chest magic pulse.
- Giấc Mơ Vỡ:
  white-violet slash/shatter flash + stronger camera response.
- Ba Giờ Sáng:
  violet chromatic split + clock impact response.
- Mộng Du Truy Kích:
  fast diagonal slash + short zoom punch + high-frequency camera trauma.
- Vĩnh Dạ:
  dark edge compression + large halo/chest pulse + deep camera trauma.

SCREEN FX
- One reusable DOM impact overlay.
- No per-hit DOM creation.
- radial shock ring
- slash streak
- edge light/dark compression
- pseudo chromatic split
- tuned separately for mobile.

CAMERA
- Replaced raw random shake with trauma-based deterministic shake.
- Amplitude decays smoothly.
- Skill-specific trauma strengths.
- Small roll, X/Y/Z displacement.
- Existing legacy cameraKick events feed into trauma instead of raw jitter.

BOSS BODY / SOCKET VFX
- One reusable Three.js impact aura.
- Automatically attaches to VFXSocket (Chest/Spine) on the rigged GLB.
- Procedural fallback uses world-space boss position.
- Player damage on boss produces chest/torso magic pulses.
- Strong hits use warmer highlight.

ANIMATION / RECOVERY
- Dash now correctly uses Dash animation rather than Attack animation.
- Attack / Dash / Skill each have their own duration / crossfade / speed profile.
- Dash gets its own squash/stretch fallback presentation.
- Small hit reactions DO NOT cancel telegraphed boss casts.
- Boss Hit only interrupts when no boss cast is active.

DEATH CINEMATIC
- Victory no longer immediately opens the result modal.
- 3.8s boss defeat presentation:
  close-up -> moon/full-body orbit -> sunrise pullback.
- Death animation continues through AnimationMixer.
- Halo collapses during defeat.
- GLB material fades into stardust-like disappearance.
- cracked moon overlay + sunrise screen wash.
- small bottom dialogue remains non-blocking:
  Boss -> Princess -> Hero.
- Result screen appears only after the cinematic completes.

V9.5 intro cinematic, V9.4 rigged GLB art, dialogue overlay,
mobile controls, Redis and WebSocket multiplayer are retained.


============================================================
V9.7 — MA VƯƠNG SKILL VFX ART PASS
============================================================

1. BÓNG ĐÊM LAN RA
- Flat purple cylinder material replaced by animated galaxy-ink shader.
- rotating/swirl ink structure
- blue/violet nebula variation
- tiny star flecks
- illuminated galaxy rim
- one existing dark-pool draw call retained
- moon/rune procedural ground telegraph added

2. GIẤC MƠ VỠ
- silver shard GPU projectile shader redesigned
- asymmetric glass silhouette
- animated white spine/glint
- floating moon has synchronized 3D crack lines
- stronger crack overlay on impact
- rune telegraph includes radial fracture/spoke language

3. BA GIỜ SÁNG
- clock receives outer rune/tick circles
- ground telegraph uses twelve clock-like marks
- synchronized 02:59 -> 03:00 scale tension
- impact creates clock fracture ring
- thought glyphs: “…”, “?”, crescent
- lateral thought streaks
- thought projectiles gain hollow memory ring + orbiting dots

4. MỘNG DU TRUY KÍCH
- GPU projectile is now a crescent slash rather than generic line
- one reusable world-space double crescent arc at impact
- crescent/rune telegraph art
- no runtime geometry allocation per cast

5. VĨNH DẠ — ĐÊM KHÔNG KẾT THÚC
- rotating void-vortex overlay
- three synchronized visual night waves
- drifting void-star field
- red eye-beam accents
- night projectile shader gains black core + violet corona + red eye slit
- multi-ring/rune ground telegraph remains synchronized with server cast
- all decoration pointer-events:none and mobile-scaled

6. TIỂU MỘNG ẢNH
- server summonSpawn now includes authoritative spawn positions
- 3 pooled world-space summon glyph/column effects
- summon death sends authoritative position
- 3 pooled crystal/star death bursts
- no per-summon geometry allocation
- Summon rig animation from V9.6 retained

PERFORMANCE
- existing enemy projectile InstancedMesh remains ONE projectile batch
- telegraph rune art is ONE shader plane
- galaxy pool remains ONE mesh
- crescent slash is preallocated
- summon spawn/death effects are pooled
- no shader/geometry creation when a skill is cast
- mobile-specific CSS scaling retained

V9.6 combat presentation, V9.5 intro cinematic, V9.4 rigged boss,
dialogue overlay, stable controls, Redis and WebSocket are retained.


============================================================
V10.1 — BOSS MODEL / MATERIAL TARGET PASS
============================================================

THIS PASS CHANGES THE ACTUAL BUNDLED BOSS GLB
- 15 GLB material definitions patched.
- Skin / Face / Hair / Velvet / Plum cloth / Silver / Gold / Iris / Gem /
  Moon / Stars receive dedicated PBR targets.
- GLB SHA256:
  0177b5ad4c947f800f7d648851908b85ec4868d8b5e6199da0ab0671d182cdd8

PBR TARGET
- skin / face: softer high-roughness porcelain
- hair: silver-lavender, lower roughness, moon rim
- dark velvet: high roughness, almost no metallic
- plum layer: slightly clearer specular separation
- crown gold: metallic .88 / roughness .34
- silver trim: metallic premium highlight
- iris / amethyst / moon: stronger emissive identity

RUNTIME SIGNATURE SILHOUETTE
- 6 dark-energy ribbons behind the boss
- triple eclipse / clock halo
- crescent moon ornament
- 12 clock/rune marks in ONE InstancedMesh
- 10 orbit crystals in ONE InstancedMesh
- cheap anime Fresnel/rim injected into the boss MeshStandardMaterials

PHASE VISUAL STATES
PHASE 1
- 2 ribbons on low mobile / up to 6 on desktop depending quality
- 4 crystals
- restrained halo / eye emissive

PHASE 2
- 7 crystal target
- stronger ribbons, halo and jewel
- iris/jewel emissive increases

PHASE 3
- full ribbon silhouette
- up to 10 crystals
- strong eclipse halo
- maximum eye / moon / amethyst glow

MOBILE ADAPTIVE QUALITY
HIGH
- 6 ribbons
- 10 crystals

MEDIUM
- 4 ribbons
- 7 crystals

LOW
- 2 ribbons
- 4 crystals

Quality reacts to renderScale / frameEma, so the first effects removed on a stressed
phone are extra ribbons and crystals—not the boss, controls or telegraphs.

All V9.7 skill VFX, V9.6 combat presentation, V9.5 cinematics, rigging,
multiplayer, Redis and WebSocket systems remain.


============================================================
V10.2 — MOON VOID PALACE ENVIRONMENT + LIGHTING
============================================================

GOAL
Move the encounter away from a flat prototype arena and make the V10.1 boss
read like a premium anime boss while staying within a mobile web budget.

ENVIRONMENT
- procedural Moon Void Palace sky dome: 1 shader draw
- large shader moon / phase-3 eclipse: 1 draw
- dark stone arena base: 1 draw
- fake reflective moon-marble floor: 1 draw
- 12 ruined palace pillars: 1 InstancedMesh draw
- 8 broken celestial obelisks: 1 InstancedMesh draw
- 18 crystal-ruin pieces: 1 InstancedMesh draw
- up to 90 atmosphere motes: 1 Points draw

FAKE REFLECTIVE FLOOR
No RenderTarget and no second scene render.
The floor shader produces:
- moon-marble pattern
- three arena rune rings
- moon path highlight
- elongated fake boss reflection
- smaller Hero/Princess reflected glow
This preserves the visual idea of a reflective palace floor at a tiny GPU cost.

LIGHTING
- cool Hemisphere world light
- directional moon key
- boss-following violet rim PointLight
- player fill PointLight
- ACES tone mapping retained
- no shadow-map pass
- environment/boss lighting changes by phase

PHASE 1
- pale silver moonlight
- restrained violet fog
- 8 crystal target
- cleaner readable arena

PHASE 2
- stronger purple atmospheric depth
- stronger boss rim / crystal emission
- denser fog
- 13 crystal target

PHASE 3
- moon becomes eclipse
- darker fog and exposure
- boss rim goes magenta-violet
- maximum crystal emissive
- environment grading shifts darker
- up to 18 crystals

MOBILE ADAPTIVE ENVIRONMENT
HIGH:
- 12 ruins
- 8 obelisks
- 18 crystals
- 90 atmospheric motes

MEDIUM:
- 8 ruins
- 5 obelisks
- 12 crystals
- 58 motes

LOW:
- 5 ruins
- 3 obelisks
- 7 crystals
- 30 motes
- full-screen bloom overlay disabled

Quality uses the existing renderScale + frameEma system.
Critical gameplay readability, boss model, telegraphs and controls are never
removed by this quality system.

POST / ATMOSPHERE
- inexpensive CSS moon bloom
- atmospheric color grade
- phase-reactive grade
- low mobile automatically disables the expensive blend mode/bloom layer

V10.1 boss model/material, V9.7 skill VFX, V9.6 combat presentation,
V9.5 cinematics, rigging, dialogue, Redis and WebSocket are retained.


============================================================
V10.3 — BOSS FACE / HAIR / COSTUME REFINEMENT
============================================================

THIS IS NOT ONLY A SHADER PASS.
The bundled ma_vuong_mat_ngu.glb has actual vertex-position refinement while
its skin, skeleton and 11 animation clips are preserved.

ACTUAL GLB GEOMETRY REFINEMENT
- Face:
  V-shaped lower jaw; restrained temple width; subtle centre/nose definition.
- Eyes:
  more mature horizontal proportions; iris/pupil slightly smaller;
  very small upward outer-corner angle.
- Lips:
  slightly narrower / cleaner.
- Hair:
  long back strands fan wider near the tips;
  side locks frame the face more strongly;
  bangs gain small length/asymmetry variation.
- Costume:
  skirt panels become wider toward the lower hem;
  cape becomes longer/wider and sits farther behind the body.
- Crown:
  lunar tiara widened/tallened;
  central jewel keeps the focal point.
- Chest ornament:
  enlarged slightly to strengthen the eyes → crown → chest focal triangle.

GLB SHA256
e7ac2b73cd2fb463fd34fba83d95c5b54597d44aaca95ad54c0caaa888f78e7e

RUNTIME RIG-ATTACHED CHARACTER DETAIL
- 6 additional moon-hair masses in ONE InstancedMesh.
- 4 crown constellation ornaments in ONE InstancedMesh.
- 4 celestial outer costume panels in ONE InstancedMesh.
- Phase-reactive magical energy hem: ONE shader draw.
- Chest constellation / chain: ONE line draw.
- Small head-attached face fill light:
  keeps the anime face readable under changing moon/void lighting;
  automatically disabled on low mobile quality.

SECONDARY MOTION
- Existing HairRoot now sways independently.
- Existing SkirtRoot has stronger but restrained follow-through.
- Ultimate motion multiplier: 1.8x.
- Teleport motion multiplier: 1.45x.
- Added hair layers and outer panels get deterministic lightweight sway;
  no cloth physics engine.

PHASE CHARACTER STATES
P1 — MOON QUEEN
- restrained hair/crown emissive
- minimal energy hem
- clean face lighting

P2 — SLEEPLESS
- stronger hair moonlight
- stronger crown/chest ornament
- outer panels more luminous

P3 — ETERNAL NIGHT
- highest iris/gem/hair glow
- full energy hem
- character silhouette reads much more aggressively against V10.2 environment

MOBILE QUALITY
HIGH
- 6 extra hair locks / 4 outer panels / 4 crown stars / face fill

MEDIUM
- 5 hair locks / 3 panels / 4 stars / face fill

LOW
- 4 hair locks / 2 panels / 2 stars
- face fill disabled
- energy hem only forced visible in Phase 3

V10.2 environment/lighting, V10.1 signature boss art,
V9.7 skill VFX, V9.6 combat presentation, V9.5 cinematics,
Redis and WebSocket multiplayer are retained.


============================================================
V10.4 — PREMIUM CHARACTER SHADER PASS
============================================================

GOAL
Push the V10.3 character closer to premium anime/gacha presentation without
adding expensive mobile post-processing or extra shadow passes.

ACTUAL GLB MATERIAL TARGET UPDATE
Patched 15 material targets inside ma_vuong_mat_ngu.glb.
GLB SHA256:
fd44617b412e677f004c93d5df6e5d45784dcd13bb11f9992d18f3effe7a00b4

FACE / SKIN
- soft anime face-light ramp
- subtle fake subsurface warmth
- stable moon-rim contribution
- keeps facial planes readable under V10.2 phase lighting

HAIR
- directional moonlight band
- anisotropic-style sheen without physical anisotropic shader
- silver-lavender rim
- stronger phase-3 moon response

VELVET / NIGHT CLOTH
- dark frontal response
- soft purple grazing sheen
- visually separated from silk/plum cloth

SILK / PLUM CLOTH
- longer, cleaner highlight
- lower roughness than velvet
- gentle violet edge response

GOLD / SILVER
- premium moon glint
- higher metallic separation
- antique-gold edge warmth retained

AMETHYST / MOON GEM
- phase-reactive inner violet depth
- animated low-cost pulse
- white moon sparkle

EYES
- stronger iris depth
- phase-reactive emissive
- fake cornea highlight
- two small additive eye-lens instances in ONE InstancedMesh
- eye-lens draw automatically disabled on low mobile

HAIR MOON BAND
- one tiny LineSegments draw around upper hair
- makes the head silhouette separate from dark backgrounds
- disabled on low mobile

MOBILE QUALITY
HIGH    = shader factor 1.00 + eye lens + hair moon band
MEDIUM  = shader factor 0.72 + eye lens + subtler hair band
LOW     = shader factor 0.38, no eye lens, no hair moon band

No SSR, real subsurface scattering, transmission, refraction or shadow map
was added. V10.2 environment, V10.3 geometry refinement, V9.7 skill VFX,
V9.5 cinematics, multiplayer, Redis and WebSocket remain intact.


============================================================
V10.5 — BOSS UI / PORTRAIT / SKILL ICON PASS
============================================================

GOAL
Turn the boss HUD from functional UI into a visual system authored specifically
for Ma Vương Mất Ngủ, while preserving the mobile-web performance budget.

ORIGINAL UI ART
- 1 original vector boss portrait:
  public/assets/ui/ma_vuong/boss_portrait.svg
- 5 original vector skill icons:
  Bóng Đêm Lan Ra
  Giấc Mơ Vỡ
  Ba Giờ Sáng
  Mộng Du Truy Kích
  Vĩnh Dạ
- SVG is lightweight and remains sharp at phone resolutions.
- No third-party artwork is bundled.

PREMIUM BOSS HUD
- portrait medallion
- THE SLEEPLESS MOON subtitle
- lunar phase chip
- custom multi-stop boss HP bar
- live HP percentage
- five-skill icon strip
- phase-reactive violet/magenta art direction
- subtle reusable HUD sheen

SYNCHRONIZED CAST CARD
Uses the existing authoritative bossCast timeline.
- current skill icon
- full Vietnamese skill name
- cast countdown
- cast fill until impact
- recovery/impact state after impact
- corresponding icon highlights in the five-skill strip

PHASE IDENTITY
Phase I   — MOON QUEEN
Phase II  — SLEEPLESS
Phase III — ETERNAL NIGHT

Phase changes pulse the boss frame and update the visual identity immediately.

MOBILE LANDSCAPE
On short landscape screens:
- portrait shrinks
- subtitle is removed
- skill icons reduce in size
- cast card becomes shorter
- duplicate floating phase badge hides
Gameplay controls and telegraphs retain priority.

No extra WebGL render pass is introduced by V10.5.
The new portrait/icons are SVG and the HUD is DOM/CSS only.

V10.4 premium character shaders, V10.3 geometry refinement,
V10.2 environment, V9.7 skill VFX, cinematics, Redis and WebSocket are retained.


============================================================
V10.6 — ANIMATION ACTING + SECONDARY MOTION PASS
============================================================

GOAL
Make Ma Vương Mất Ngủ perform like a character rather than simply play clips.
The 11 source GLB clips remain intact. V10.6 layers small additive acting on
the actual rig after AnimationMixer sampling.

GLB
- 20-bone skin preserved
- 11 source animation clips preserved
- no server/root-motion authority changed
- SHA256:
  321658c08653489a6c518126de1ddc23964bf79eec2061416a5603c10a97866d

ADDITIVE ACTING BONES
Hips / Spine / Chest / Neck / Head
Left + Right UpperArm / ForeArm / Hand

The additive layer subtracts its previous-frame offset before applying the new
offset. It therefore does not accumulate rotations or destroy the source clip.

SKILL PERFORMANCE

BÓNG ĐÊM LAN RA
- restrained queenly anticipation
- symmetric arm sweep
- chest release at impact
- soft recovery into idle

GIẤC MƠ VỠ
- head looks toward the moon
- arms lift/open
- torso expands at fracture
- slower elegant recovery

BA GIỜ SÁNG
- intentionally eerie stillness
- slight neck/head turn during 02:59
- crisp head snap at 03:00
- returns slowly rather than popping to idle

MỘNG DU TRUY KÍCH
- body leans into movement
- stronger shoulder/forearm slash line
- fastest release timing
- short recovery crossfade

VĨNH DẠ
- slow sovereign anticipation
- open-arm throne silhouette
- chest/head performance at eclipse
- largest secondary-motion response

DYNAMIC ACTION TIME-WARP
The existing server bossCast timestamps drive:
- anticipation speed
- release speed
- recovery speed

A cast clip that finishes before the authoritative recovery window now holds
its final clamped pose instead of snapping back to idle. The visual returns to
idle only when the cast ends.

PHASE PERFORMANCE
Phase II and III now trigger:
- dedicated additive phase pose
- arm expansion
- chest lift / head angle
- camera trauma
- restrained zoom pulse
- Phase III gets the strongest performance

HIT ACTING
When the boss is not actively casting:
- light torso recoil
- alternating left/right head response
- does not interrupt a telegraphed cast

SUMMON ACTING
Summon clip now receives:
- slower elegant timing
- open-arm additive gesture
- stronger hair/skirt follow-through

SECONDARY MOTION
HairRoot / SkirtRoot / HaloRoot now use damped angular springs rather than
simple independent sine rotation.

The springs react to:
- normal idle drift
- cast anticipation
- impact
- teleport
- ultimate
- phase transition

This gives actual delayed follow-through:
body moves first → hair/cloth catches up → settles afterward.

MOBILE
No physics engine is added.
No extra animation clips or draw calls are required by the acting layer.

LOW mobile:
- keeps head/spine/chest acting
- skips forearm/hand additive offsets

V10.5 UI, V10.4 premium shader, V10.3 character geometry,
V10.2 environment, V9.7 skill VFX, cinematics, Redis and WebSocket remain.


============================================================
V10.7 — FINAL VISUAL POLISH + MOBILE OPTIMIZATION
============================================================

FINAL SYSTEM-LEVEL PASS FOR THE V10 MA VƯƠNG ENCOUNTER.

COLOR / PRESENTATION
- final phase-aware grading layer
- restrained contrast/saturation lift
- lower grade strength on short landscape phones
- no expensive WebGL post-process chain added

CAMERA
- encounter framing now considers Hero + Princess + Boss
- target is biased toward Boss to keep her visually dominant
- target uses a damped spring, so teleport/movement does not jerk the camera
- gameplay/server positions are never modified

UNIFIED QUALITY MANAGER
The older environment/model/shader/animation quality systems now read ONE
V10.7 LOW / MEDIUM / HIGH quality state.

Signals:
- frameEma
- hardwareConcurrency
- deviceMemory where supported
- coarse/touch pointer

Hysteresis prevents rapid quality oscillation.

ADAPTIVE PIXEL RATIO
Mobile LOW:    ~0.74–0.94
Mobile MEDIUM: ~0.80–1.10
Mobile HIGH:   ~0.88–1.25

Dynamic resolution continues to move inside the current tier based on frame time.

LOW-TIER CUTS ONLY DECORATION
- hides 03:00 thought glyph decoration
- hides Eternal Night decorative stars
- hides chromatic-split decoration
- hides boss HUD sheen / rotating portrait ornament
- existing V10.2–V10.4 subsystems also switch to their low instance counts

NEVER CUT
- gameplay telegraphs
- boss cast timing
- controls
- boss HP / cast UI
- core boss model
- server simulation / collision

PHONE APP/TAB SWITCH
- zeroes movement input while hidden
- clears keyboard state
- resets frame timing/hysteresis on return
This reduces large-dt artifacts after switching apps on iPhone.

GLB
- 20-bone rig retained
- 11 source clips retained
- V10.6 geometry/animation content retained
- SHA256:
  948e69e97dac65f0f983aef8d670adaa615c006f895cb4145d81abcd17778fc6

IMPORTANT:
Static validation confirms code/asset integrity. It does NOT prove a 98% visual
match to the reference image. The final gap must now be judged from real
deployed screenshots and FPS on the target iPhone; that is the correct next
stage for shot-by-shot polish.


============================================================
V10.7.1 — CONTROLS + BOSS VISIBILITY HOTFIX
============================================================
Confirmed source-level faults fixed:
1. V10 rim shader used literal `\\n` text inside GLSL. Replaced with valid newline escapes.
2. V10/V10.4 shaders referenced Three.js `worldPosition` where r128 may not define it.
   Both now compute `(modelMatrix * vec4(transformed,1.0)).xyz` explicitly.
3. Input heartbeat runs before all decorative visual work.
4. RAF is always rescheduled from `finally`, so one VFX/render failure cannot kill controls.
5. Intro input lock now follows authoritative server `introUntil`.
6. WebGL canvas is focusable and focuses on mouse input.
7. Fixed V10.7 visibilitychange ReferenceError (`input` -> `localInput`).
8. Boss fallback remains available until rig bounds/shader health pass the watchdog.
9. Repeated visual errors switch to LOW + procedural boss instead of freezing gameplay.

GLB SHA256: bd87670e8caecde8383b59af5b03e235b8a746f70545ede0416aee5bb70761d4


============================================================
V10.8 — SMOOTH INTRO + REAL RIG BOSS FIX
============================================================

LATEST USER-REPORTED STATE ADDRESSED
- Boss intro camera felt laggy / jerky.
- The visible boss was the blocky procedural emergency fallback, not the
  bundled 20-bone / 11-animation GLB.
- Controls must remain functional after the authoritative intro lock.

RIG RELIABILITY
- The bundled boss GLB is decoded and compiled behind the lobby before battle.
- Two missing optional Hero/Princess GLB requests were removed from startup.
- The fragile custom MeshStandardMaterial GLSL injections are disabled in the
  shipped path. Stable Three.js PBR materials retain the actual GLB colors,
  metal/roughness, emissive eyes/gems and V10 silhouette attachments.
- Procedural boss remains only as an emergency fallback when the GLB genuinely
  cannot load or has invalid bounds.
- The real rig is made visible only after one-time program compilation, so the
  intro does not hot-swap from fallback to GLB in shot one.

INTRO SMOOTHNESS
- The cinematic camera captures one boss anchor at intro start. Network
  snapshot interpolation can no longer move the camera origin every 67 ms.
- Camera position and look target use frame-rate-independent damping.
- Dynamic resolution and quality-tier changes are frozen during the reveal.
- Mobile uses one conservative pixel ratio for the whole intro, then restores
  normal adaptive quality after the cinematic.
- Intro overlay layers use paint containment and compositor hints.
- Server intro grace is 5.0 seconds; the client reveals controls only after the
  authoritative lock ends, preventing the first joystick/key press feeling dead.

VALIDATION
- server.js syntax: PASS
- inline browser JavaScript syntax: PASS
- bundled GLB header / size: PASS (954,052 bytes)
- two-client WebSocket create -> join -> start: PASS
- authoritative intro window: PASS (5,000 ms)
- post-intro movement: PASS (3.00 world units in protocol test)
- boss state present: PASS (2,200 HP)

GLB SHA256
bd87670e8caecde8383b59af5b03e235b8a746f70545ede0416aee5bb70761d4


============================================================
V10.9 — BOSS PRESENTATION REPAIR
============================================================

LATEST SCREENSHOT REVIEW
- The real 20-bone GLB is visible and stable.
- The Idle clip does not contain LeftUpperArm / RightUpperArm channels, which
  leaves those bones in their authored horizontal bind pose.
- The boss reads too small and too flat against the purple arena.

POSE / ANIMATION
- A post-mixer queen stance lowers both upper arms, bends the forearms and adds
  a restrained chest/head attitude during idle.
- The stance automatically fades down during casts, summon gestures and phase
  acting so the existing 11 authored action clips retain their silhouettes.
- No GLB bones, clips or timing data were removed.

BOSS READABILITY
- Visual boss scale increases from 1.12 to 1.42 (+26.8%).
- This is presentation-only: server hitboxes, collision radii, HP, movement,
  projectile logic and encounter balance are unchanged.
- Stable built-in PBR remains enabled. Palette separation now distinguishes
  porcelain skin, moonlit hair, dark dress, gold crown and silver trim.

CAMERA / LIGHTING
- Gameplay camera moves closer and slightly lower (12.7 / 7.55) and looks
  higher toward the boss body.
- Encounter focus is biased more strongly toward the boss.
- A no-shadow warm key light follows the boss while the existing cool rim is
  strengthened; phase grading lowers ambient flattening.
- No post-processing pass or shadow map was added, preserving mobile cost.
