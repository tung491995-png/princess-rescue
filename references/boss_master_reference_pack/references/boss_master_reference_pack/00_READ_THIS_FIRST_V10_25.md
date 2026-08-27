# V10.25 BOSS VISUAL REFERENCE — READ THIS FIRST

## Mục đích

Folder này là **visual-reference acceptance pack** cho Boss V10.25 —
**Eclipse Battle Mage / Ma Vương Mất Ngủ**.

Dùng pack này **trước final release packaging** để Codex đối chiếu Boss đang
render trong real WebGL với thiết kế đã được duyệt.

## Thứ tự quyền ưu tiên

1. **Gameplay / architecture authority:** repository V10.25 hiện tại +
   `V10.25 IMPLEMENTATION SPEC — ECLIPSE BATTLE MAGE COMPLETE BOSS PIPELINE`.
2. **Visual design authority:** các ảnh reference trong pack này.
3. **Geometry authority:** GLB/model hiện có trong project cho Boss, Orb, Halo,
   One-Eye Mob và accessories.
4. Các tài liệu gốc trong `source_docs/` chỉ là nguồn tham khảo thiết kế ban đầu;
   không được dùng để vô tình thay đổi một gameplay contract V10.25 đã chốt.

## Primary design authority

`images/01_master_front_back_full_assembly.png`

Đây là ảnh chuẩn chính để khóa:
- silhouette tổng thể,
- tỷ lệ boss,
- bố cục front/back,
- quan hệ Crown / Collar / Mantle / Choker / Core / Cuffs,
- tỷ lệ tương đối Orb / Halo / One-Eye quanh Boss.

## Secondary references

- `images/02_side_depth_and_three_quarter.png`
  - chiều sâu, khoảng cách sau lưng, chống che mặt và váy.
- `images/03_upper_body_accessory_placement.png`
  - placement vùng đầu/ngực/tay; Crown, Collar, Choker, Core, Cuffs, Orb, Halo.
- `images/04_placement_ratio_map.png`
  - tỷ lệ và khoảng cách tham khảo.
- `original_idea_refs/`
  - nguồn hình dáng gốc của Orb / Halo / One-Eye; không rebuild geometry từ ảnh.

## Quy tắc visual acceptance

Codex phải kiểm tra ít nhất:
- front,
- left side,
- right side,
- back,
- close combat camera,
- casting pose,
- melee pose,
- teleport pose,
- Zero Hour presentation.

Không được PASS chỉ vì:
- không có console error,
- asset load thành công,
- không crash.

Boss còn phải **visually match** reference về silhouette, placement, scale,
rotation, overlap và combat readability.

## Không rebuild hệ thống đang chạy

Không sửa lại vô cớ:
- rig,
- retarget pipeline,
- animation architecture,
- Combo Graphs,
- Adaptive AI,
- server-authoritative multiplayer,
- Orb/Halo combat,
- One-Eye combat logic,
- Zero Hour.

Nếu có mismatch, ưu tiên **smallest correct production fix**:
asset selection → scale → offset → rotation → anchor → pose correction →
material/presentation → chỉ cuối cùng mới đụng sâu vào rig/animation.

## Lưu ý quan trọng: số lượng One-Eye Mob

Bộ reference gốc có **4 slot bố cục** để mô tả formation/silhouette.
Trong V10.25 implementation hiện tại, gameplay spec/runtime đã chốt
**max alive = 3**.

**Không tự thay đổi gameplay cap từ 3 thành 4 chỉ vì ảnh reference có 4 mob.**
Hãy dùng các slot reference để giữ tỷ lệ, khoảng cách và occlusion tốt cho số
mob đang active. Chỉ thay đổi cap nếu user yêu cầu rõ ràng.

## Black Moon

Black Moon:
- chỉ dùng trong Ultimate,
- không thuộc base boss assembly,
- luôn ở lớp xa phía sau,
- không được làm mất readability của Face / Halo / Orb / safe lanes.

## Checkpoint

Sau khi acceptance/correction xong, cập nhật:
- `CODEX_HANDOFF.md`
- `V10_25_PROGRESS.md`

Ghi:
- reference images used,
- mismatches found,
- files modified,
- corrections made,
- visual checks passed/failed,
- remaining risks.

Không final-package cho tới khi visual-reference acceptance hoàn tất.
