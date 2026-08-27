# CODEX PROMPT — V10.25 BOSS VISUAL REFERENCE ACCEPTANCE

Trước khi final release packaging, hãy thực hiện một mandatory
**Boss Visual Reference Acceptance & Correction Pass** cho V10.25.

Reference pack nằm tại:

`references/boss_master_reference_pack/`

Đọc theo thứ tự:
1. `00_READ_THIS_FIRST_V10_25.md`
2. `REFERENCE_INDEX.json`
3. toàn bộ ảnh reference
4. `source_docs/` khi cần làm rõ

Treat `images/01_master_front_back_full_assembly.png` as the
**primary visual design authority**.

Các ảnh còn lại là secondary references cho side/back depth, accessory
placement và tỷ lệ.

Quan trọng:
- visual references không được tự override gameplay architecture đã chốt;
- giữ nguyên V10.25 server-authoritative combat;
- One-Eye reference có 4 visual formation slots, nhưng không thay runtime
  max-alive cap hiện tại khỏi 3 nếu user chưa yêu cầu.

So sánh current live WebGL Boss với reference và kiểm tra:
- overall silhouette and proportions
- face / head / hair silhouette
- long dress / skirt silhouette
- Witch Mantle
- High Collar
- Crown
- Witch Cuffs
- Moon Choker
- Nocturne Core
- Orb
- Halo
- front / side / back visual balance
- scale / rotation / position / overlap
- clipping during Idle, Cast, Dodge, Jab Cross, Knee, Uppercut, Sweep,
  Roundhouse, Flip Kick, Teleport and Heavy Slam
- One-Eye scale, formation spacing and occlusion
- Zero Hour presentation, Black Moon depth and readability

Preserve:
- existing rig
- retarget pipeline
- animation system
- Combo Graphs
- Adaptive AI
- Orb/Halo combat
- One-Eye combat system
- multiplayer/server authority
- Zero Hour

Nếu có mismatch:
1. xác định mismatch cụ thể;
2. xác định nguyên nhân: asset selection / scale / offset / rotation /
   bone anchor / pose correction / material / animation clipping;
3. thực hiện smallest correct production fix;
4. verify lại bằng real WebGL;
5. rerun only directly affected tests.

Không accept chỉ vì không có console error hoặc clipping rõ ràng.
Boss phải visually match approved design.

Acceptance views bắt buộc:
- front
- left side
- right side
- back
- close combat camera
- casting pose
- melee pose
- teleport pose
- Zero Hour presentation

Sau khi hoàn thành:
- update `CODEX_HANDOFF.md`
- update `V10_25_PROGRESS.md`
- record references used
- record mismatches
- record files modified
- record corrections
- record visual checks passed/failed
- record remaining risks

Do not begin final ZIP packaging until this visual-reference acceptance pass
is complete.

Continue now.
