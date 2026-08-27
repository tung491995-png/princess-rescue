# Boss Ma Vương Mất Ngủ — Master Assembly & Placement Spec

## 1. Mục đích

Đây là tài liệu tích hợp boss Witch Queen/Eclipse Battle Mage sau khi model và rig đã hoàn tất. Pack khóa:

- vị trí của toàn bộ phụ kiện mặc trên người;
- tỷ lệ và khoảng cách của Halo, Orb và bốn minimob;
- asset nào gắn xương, asset nào follow transform và asset nào spawn độc lập;
- quy tắc chống che mặt, chống xuyên váy và chống nhập nhầm asset.

Ảnh concept không thay thế model 3D. Với `Orb`, `Halo` và `Minimob_OneEye`, model hiện có là nguồn hình học duy nhất.

## 2. Hệ tọa độ chuẩn

- `H = 1.0`: chiều cao visual của cơ thể boss từ đế giày đến đỉnh đầu, không tính crown và asset bay.
- `R`: hướng phải giải phẫu của boss.
- `L = -R`: hướng trái giải phẫu của boss.
- `U`: hướng lên.
- `F`: hướng boss nhìn.
- `Behind = -F`: phía sau lưng boss.

Nếu trục model khác với engine, chuyển đổi trục một lần ở `BossVisualRoot`; không đổi dấu rải rác trong từng component.

## 3. Phụ kiện mặc trên boss

| Thành phần | Kiểu tích hợp | Anchor | Tỷ lệ / vị trí khóa |
| --- | --- | --- | --- |
| Crown | Bone-follow hoặc skinned accessory | `Head` | Cao `0.33 × headHeight`; tâm trùng trục đầu; đáy cách đường lông mày/tóc `2–3 cm`; không rung theo tóc |
| Moon Choker | Bone-follow | `Neck` | Ôm chân cổ; charm trăng cao khoảng `0.10 × headHeight`; luôn nằm trên Nocturne Core |
| High Collar | Skinned/weighted | `Neck + UpperChest` | Mép trên dưới dái tai; không chạm hàm; không che tóc/face |
| Witch Mantle | Skinned/weighted | `UpperChest/Spine2` | Tổng bề ngang `1.35 × shoulderWidth`; độ sâu nhỏ; chừa toàn bộ biên quay của cánh tay |
| Nocturne Core | Bone-follow/VFX socket | `UpperChest` | Chính giữa xương ức; rộng `0.16 × headHeight`; tách rõ khỏi choker |
| Witch Cuff L/R | Bone-follow hoặc weighted | `LeftForeArm`, `RightForeArm` | Hai bên giống hệt; dài `0.20 × forearmLength`; không chạm khuỷu hoặc khóa cổ tay |
| Six-panel Skirt | Skinned cloth | `Hips` | 6 panel; khe trước mở; panel trước tới giữa bắp chân; panel sau cách sàn `4–7 cm` |

## 4. Halo — model đã có

- Không sửa model, material, UV hoặc silhouette.
- Tạo `BossHaloRoot` là object riêng, follow smoothed transform của `UpperChest/Spine2`, không parent trực tiếp vào `Head`.
- Tâm Halo: `U = 0.82H`, `Behind = 0.22 m` tính từ trục sống lưng.
- Đường kính ngoài: `0.50H`, tương đương khoảng `1.50 × shoulderWidth`.
- Mặt phẳng Halo thẳng đứng, song song với mặt phẳng lưng.
- Đỉnh Halo cao hơn đỉnh crown khoảng `0.30 × headHeight`; đáy không thấp hơn xương bả vai dưới.
- Halo không được chạy qua mắt, mặt, crown hoặc rơi xuống chân trong animation/death.
- Halo chỉ đổi VFX/material theo state; không đổi scale hình học giữa các phase.

## 5. Orb — model đã có

- Không sửa model, material, UV hoặc vòng quỹ đạo.
- Tạo `BossOrbRoot` riêng; không gắn cứng vào bone bàn tay.
- Ở state `FOLLOW`, tâm Orb nằm ngoài bàn tay trái giải phẫu: `0.35 m` theo hướng `L` và `0.08 m` theo `U` từ `LeftHandSocket`.
- Đường kính quả cầu: `0.14H`. Vòng quỹ đạo giữ nguyên model; góc trình bày mặc định khoảng `18°`.
- Chỉ có một Orb. Không tạo Orb thứ hai cho tay còn lại.
- Các state giữ nguyên: `FOLLOW`, `ORBIT`, `CHARGE`, `PROJECTILE`, `AUTONOMOUS`, `TRAP`, `RECALL`, `ULTIMATE`.
- Khi Orb rời tay để tấn công, socket chỉ là điểm xuất phát; chuyển động do Orb controller quản lý.

## 6. Bốn minimob một mắt — model đã có

- Spawn đúng `4` actor ở đội hình đầy đủ; mỗi actor dùng cùng model có sẵn.
- Không scale/deform để biến thành Orb. Minimob là nhánh bóng tối hữu cơ một mắt; Orb là hành tinh tròn có vòng vàng.
- Không parent minimob vào boss rig, Halo hoặc skirt.
- Mỗi minimob có root, AI, hitbox, health, animation/VFX và lifecycle riêng.
- Tỷ lệ visual của toàn thân nhánh/tail: khoảng `0.38H`; riêng đầu-mắt khoảng `0.16H`.
- Vị trí formation idle chuẩn, tính theo Boss Root:

| Slot | R/L | U | Behind | Ghi chú |
| --- | ---: | ---: | ---: | --- |
| `Upper_L` | `0.58H` về L | `0.73H` | `0.60 m` | Mắt ngang vùng vai; không ngang mặt |
| `Upper_R` | `0.58H` về R | `0.73H` | `0.60 m` | Đối xứng Upper_L |
| `Lower_L` | `0.62H` về L | `0.46H` | `0.72 m` | Mắt ngang hông; tail cong ra ngoài váy |
| `Lower_R` | `0.62H` về R | `0.46H` | `0.72 m` | Đối xứng Lower_L |

- Formation chỉ là vị trí chờ. Khi combat, actor có thể `hover`, `orbit`, `projectile`, `beam`, `lunge`, `stagger`, `death`, rồi quay về slot trống.
- Giới hạn cùng lúc: `4`. Không spawn bản thứ năm nếu slot cũ chưa giải phóng.
- Khi camera đổi góc, dùng screen-space separation nhỏ để minimob không che face/core; không teleport qua cơ thể boss.

## 7. Thứ tự lớp và chống che khuất

1. Face và mắt boss phải luôn đọc được.
2. Crown, Moon Choker và Nocturne Core phải tách nhau.
3. Bàn tay trái và Orb không được hòa thành một khối sáng.
4. Halo nằm sau tóc/lưng; không cắt qua mặt.
5. Minimob nằm sau Halo/boss ở formation idle, chỉ vượt lớp khi thực hiện đòn tấn công.
6. Tail minimob không xuyên panel váy.
7. Black Moon nằm sau tất cả và chỉ xuất hiện trong Ultimate.

## 8. Black Moon — Ultimate only

- Không nằm trong base prefab/GLB của boss.
- Spawn ở `Behind = 1.20–1.50 m` so với boss, tâm gần `U = 0.68H`.
- Đường kính `1.40–1.60H`.
- Khi bật Black Moon, giảm độ sáng Halo/Orb vừa đủ để mặt boss và telegraph vẫn rõ.
- Tắt hoàn toàn khi Ultimate kết thúc, boss death hoặc room reset.

## 9. Cấu trúc scene đề xuất

```text
BossRoot
├── BossRig_Base
│   ├── Crown
│   ├── Moon_Talisman
│   ├── Witch_Mantle_High_Collar
│   ├── Nocturne_Core
│   ├── Witch_Cuff_L
│   ├── Witch_Cuff_R
│   └── Skirt_6Panel
├── BossHaloRoot -> existing Halo model
└── BossOrbRoot  -> existing Orb model

CombatActorsRoot
├── Minimob_Upper_L
├── Minimob_Upper_R
├── Minimob_Lower_L
└── Minimob_Lower_R

UltimateVFXRoot
└── BlackMoon (disabled by default)
```

## 10. Tiêu chí nghiệm thu

- Đúng một Halo, một Orb và tối đa bốn minimob.
- Không asset nào che mặt trong idle, cast, teleport, stagger, death hoặc Ultimate.
- Orb `FOLLOW` trở lại đúng tay trái sau `RECALL`.
- Halo không đổi vị trí theo tóc và không rơi xuống chân khi animation blend.
- Bốn minimob giữ slot hợp lệ, không dính vào boss rig và không xuyên váy khi orbit.
- Pause/Resume và room reset dọn sạch state Orb/minimob/Black Moon nhưng giữ đúng model boss.
- Trên iPhone, có thể giảm particle/trail; không được thay model hoặc tỷ lệ khóa.

