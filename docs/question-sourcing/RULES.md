# Quy tắc soạn câu hỏi mới — "Hành trình 3 miền"

Mini game văn hóa cho nhân viên văn phòng (Ngày Văn hóa Việt Nam 24/11/2026). Mỗi tỉnh/thành (34 đơn vị sau sáp nhập 2025) có bộ câu hỏi riêng; người chơi trả lời khi "đặt chân" tới tỉnh.

## Yêu cầu bắt buộc: mọi câu phải có nguồn thật trên Internet

- Mỗi câu dựa trên **ít nhất 1 bài viết cụ thể** bạn đã thực sự mở (WebFetch) hoặc thấy rõ nội dung trong kết quả WebSearch. Ghi URL vào `sources`. Ưu tiên 2 nguồn độc lập.
- **KHÔNG bịa URL, KHÔNG đoán URL.** Chỉ ghi URL bạn đã thấy. Nếu không tìm được nguồn xác nhận → bỏ câu đó, soạn câu khác.
- Nguồn ưu tiên: cổng thông tin tỉnh/thành (.gov.vn), Bộ VHTTDL, Cục Di sản (dsvh.gov.vn), UNESCO, báo chính thống (Nhân Dân, VnExpress, Tuổi Trẻ, Thanh Niên, VOV, VTV, Báo Chính phủ, Báo Văn hóa, VietnamPlus, báo địa phương). Wikipedia chỉ làm nguồn phụ, không làm nguồn duy nhất.
- Thông tin mà các nguồn ghi khác nhau (năm, số liệu) → không dùng làm đáp án.
- Không dùng thông tin mang tính chính trị nhạy cảm, tranh cãi, hay thông tin hành chính/sáp nhập.

## Nội dung

- Ưu tiên: **ẩm thực & đặc sản, đời sống – phong tục – làng nghề, lễ hội – nghệ thuật**, rồi di sản – danh thắng; lịch sử, địa lý ít hơn. **Không** soạn câu chủ đề `sap-nhap`.
- Được hỏi về các tỉnh cũ đã sáp nhập vào tỉnh mới (xem `mergedFrom`) — ghi rõ, ví dụ "(Bắc Giang cũ)".
- Kiến thức thú vị, người Việt bình thường có thể đoán/biết, không đánh đố số liệu khô khan.
- **Không trùng** ý với câu đã có của tỉnh (xem `existing` trong file context).
- **Không lộ đáp án:** đáp án đúng không được là / chứa tên tỉnh mới đang hỏi (người chơi đang đứng ở tỉnh đó).
- Tránh "đầu tiên / duy nhất / lớn nhất / cao nhất" trừ khi nguồn ghi rõ đúng như vậy.
- 4 phương án, phương án sai phải hợp lý (cùng loại) nhưng **chắc chắn sai** theo nguồn; không có 2 phương án cùng đúng. Rải đáp án đúng ở các vị trí 0–3 (không dồn vào một chỗ).
- Viết tiếng Việt có dấu, câu hỏi ngắn gọn (≤ 220 ký tự), phương án ≤ 60 ký tự.
- `explanation`: 1–2 câu, nêu điều thú vị, khớp với nguồn.

## Số lượng cho MỖI tỉnh trong nhóm của bạn

- **7 câu thường** (`difficulty: "normal"`), id `<tỉnh>-05` … `<tỉnh>-11`. Sau khi cộng với 4 câu cũ (`existingTopics`), mỗi tỉnh nên có **ít nhất 3 chủ đề, mỗi chủ đề ≥ 2 câu**. Mức `level`: trộn 1 (dễ) / 2 (vừa) / 3 (khó).
- **2 câu công thành** (`difficulty: "siege"`), id `<tỉnh>-s3`, `<tỉnh>-s4`: khó hơn (`level` 2 hoặc 3), vẫn có nguồn.

## Định dạng kết quả

Ghi **một file JSON** (mảng) vào đường dẫn được giao, mỗi phần tử:

```json
{
  "id": "ha-noi-05",
  "province": "ha-noi",
  "difficulty": "normal",
  "topic": "am-thuc",
  "kind": "choice",
  "content": "…?",
  "options": ["…", "…", "…", "…"],
  "answer": 2,
  "explanation": "…",
  "level": 2,
  "sources": ["https://…", "https://…"]
}
```

- `topic` ∈ `am-thuc`, `doi-song`, `van-hoa`, `di-san`, `lich-su`, `dia-ly`.
- `kind` = `"choice"` (dùng cho gần như mọi câu). `answer` là chỉ số 0–3 của phương án đúng.
- Chỉ ghi file kết quả được giao. **Không sửa bất kỳ file nào trong project.**
