# BOSS WITCH QUEEN — CODEX READ FIRST

Mục tiêu của pack này là **gắn và bố trí các model đã có**, không tạo lại hình học.

## Quy tắc bắt buộc

1. Model `Orb`, `Halo` và `Minimob_OneEye` đã hoàn chỉnh và phải giữ nguyên hình dáng, vật liệu, UV và topology.
2. Các ảnh trong `original_idea_refs/` là nguồn hình dáng chính xác cho ba model trên.
3. Các ảnh trong `images/` chỉ khóa bố cục, vị trí, tỷ lệ và thứ tự lớp quanh boss.
4. Không nhập Orb, Halo hoặc minimob vào skinned mesh của boss.
5. Halo là model riêng follow `UpperChest/Spine2` qua một visual root.
6. Orb là model riêng có state machine; chỉ follow bàn tay ở trạng thái `FOLLOW`.
7. Bốn minimob là bốn actor độc lập có AI/collision riêng; không parent vào xương boss.
8. Black Moon không thuộc base assembly; chỉ bật trong Ultimate và luôn ở lớp xa nhất phía sau.
9. Ưu tiên không che khuất: `Face > Crown/Core > Hands/Orb > Halo > Minimob > Skirt > Black Moon`.

Đọc tiếp `BOSS_MASTER_REFERENCE_SPEC_VI.md` và `boss_accessory_layout.json` trước khi sửa code hoặc scene.

