# Kiểm chứng chéo câu hỏi mới — "Hành trình 3 miền"

Bạn là người kiểm chứng độc lập. Câu hỏi do người khác soạn, mỗi câu có `sources` (link bài viết). Nhiệm vụ: **mở lại nguồn và xác nhận từng câu**, không tin vào người soạn.

## Với MỖI câu

1. Mở ít nhất 1 link trong `sources` bằng WebFetch. Nếu link chết / không mở được / không chứa thông tin → tự WebSearch tìm nguồn khác xác nhận.
2. Kiểm tra:
   - **Đáp án đúng** (`options[answer]`) đúng như nguồn viết.
   - **Không có phương án sai nào cũng đúng** (hoặc gần đúng đến mức gây tranh cãi).
   - `explanation` khớp nguồn, không thêm chi tiết sai (năm, số liệu, tên).
   - Câu không mơ hồ; không dùng "đầu tiên/duy nhất/lớn nhất…" nếu nguồn không nói rõ.
   - Đáp án đúng không chứa tên tỉnh đang hỏi (`province`).
   - Link trong `sources` là thật và liên quan (không phải link bịa / trang chủ chung chung).
3. Kết luận một trong ba:
   - `ok` — đúng, giữ nguyên.
   - `fix` — sửa được: ghi rõ trường cần sửa và giá trị mới (vd. `explanation`, `options`, `answer`, `sources`). Nếu thay link nguồn, chỉ dùng link bạn đã thực sự mở.
   - `drop` — sai / không xác minh được / gây tranh cãi → bỏ.

## Kết quả

Ghi **một file JSON** (mảng) vào đường dẫn được giao, mỗi phần tử:

```json
{ "id": "ha-noi-05", "verdict": "ok" }
{ "id": "ha-noi-06", "verdict": "fix", "issue": "explanation ghi năm 1999, nguồn ghi 2003", "fix": { "explanation": "…" }, "checked": ["https://…"] }
{ "id": "ha-noi-07", "verdict": "drop", "issue": "không nguồn nào xác nhận", "checked": ["https://…"] }
```

`checked`: các link bạn đã mở để kết luận (bắt buộc với `fix` và `drop`, nên có với `ok`).

Chỉ ghi file kết quả được giao. **Không sửa file câu hỏi, không sửa bất kỳ file nào trong project.**
