# Đề xuất: Phòng chơi đơn (kiểu B — "mỗi người một hành trình")

> **Trạng thái: ĐÃ LÀM 29/10/2026** (105/105 test; đã chạy thử Edge headless: vào phòng, nhận tem + Tiên phong, sổ tay, màn chiếu top 10 + bản đồ nhiệt, trang chủ phòng, công bố cuối trận). Đã chốt 6 câu hỏi mở (§6).
> Khác với bản đề xuất: màn chiếu cuối trận **không tua bản đồ**, công bố thẳng top 10; sửa tên vẫn dùng hộp đổi tên chung (chưa có ô lý do).
> **Làm thêm 30/10:** mockup `solo.html` vẽ lại có sương mù + bản tin Tiên phong không nêu tên · **trang chủ phòng riêng cho phòng đơn**: danh sách lữ khách xếp theo hạng (số tem, số Tiên phong, đang ở đâu), ô tìm tên, nút Sửa tên / ±điểm / Mời ra trên từng dòng, bản đồ không chấm vị trí 50 người · **bản đồ ghi số người có tem dưới tên tỉnh** ("12 người" / "chưa ai") ở màn chơi (tỉnh đã ghé / đang vén ống nhòm), màn chiếu và trang chủ phòng (thay dòng điểm; điểm vẫn có khi rê chuột).
> Thứ tự đã thống nhất: làm **tính năng văn hóa cho phòng team trước 24/11**, phòng chơi đơn làm **sau sự kiện**.
> Mockup: `mockup/solo.html` (phòng đơn). `mockup/culture.html` (Quê tôi / Giao lưu) **đã bỏ hướng đó**, xem §4. Mở thẳng từ ổ đĩa, không cần server.
> Từ ngữ hiển thị theo bộ **"Lữ hành"** (PLAN §3, ghi chú dưới tiêu đề): không dùng từ quân sự / bạo lực.

---

## 1. Vì sao có phòng chơi đơn, vì sao chọn kiểu B

Mục tiêu của chủ dự án: game để mọi người **giao lưu và tìm hiểu văn hóa nhiều hơn**, không phải "chơi rồi thôi". Phòng team hợp sự kiện 24/11; phòng đơn cho nhóm nhỏ, cho cả công ty mỗi người một máy, hoặc chơi lại sau sự kiện.

"Mỗi team 1 người" (kiểu A) **không chạy được** với nhiều người: tối đa 8 team (8 linh vật, 8 màu), bản đồ chỉ 34 tỉnh. 30 người giành tỉnh trên một bản đồ thì sau vài phút gần như không còn tỉnh trống, ai cũng liên tục bị ghé thăm / đón khách, 30 màu không phân biệt được.

| | A. Đơn, giành tỉnh như team | **B. Đơn, mỗi người một hành trình** (đã chọn) |
|---|---|---|
| Luật | Giống hệt phòng team, mỗi người là một "team" | Tỉnh **không thuộc riêng ai**; mỗi người tự sưu tầm **tem** vào sổ tay |
| Số người | Tối đa ~8 (thiếu màu, thiếu tỉnh) | Không giới hạn (mục tiêu thử: 50) |
| Ganh đua | Ghé thăm thử tài, giành tỉnh | Điểm, số tem, tem **Tiên phong**; bảng xếp hạng |
| Công sức | Ít (tùy chọn "1 người/team") | ~1,5–2 ngày |

Lý do chọn B: chơi đơn không có đồng đội để bàn, nên phần chung của cả phòng đến từ **tính năng văn hóa** (Câu hỏi chung cả phòng, Tổng kết — §4). Sổ tay hành trình chính là "bảng điểm" của mỗi người, nên kiến thức được giữ lại sau trận.

### Cơ sở từ khảo sát cộng đồng (tìm 29/10/2026)
- VnExpress khảo sát 1.500 độc giả: **82% không thích team building**, 25% từng phải chơi trò phản cảm; nỗi sợ lớn là **tiết mục văn nghệ bắt buộc**. Office Angels (Anh): hơn nửa thấy hoạt động gắn kết "trẻ con, ngại".
- Được ưa: giải đố phải nói chuyện mới qua, **kể chuyện quê và món ăn theo nhóm nhỏ** (A Taste of Harmony), ghép người khác nhóm nói chuyện ngắn (Coffee Roulette), kênh **viết thay vì nói** cho người hướng nội.
- Tổng quan 93 nghiên cứu về Kahoot: **áp lực thời gian** là khó khăn chính; chấm theo tốc độ làm giảm suy nghĩ, khiến đoán bừa.
- Nguyên tắc rút ra: **mời chứ không ép**. Mọi hoạt động chung đều có lối thoát; không bao giờ gọi một cá nhân lên biểu diễn.

---

## 2. Luật phòng chơi đơn

| Hạng mục | Luật đề xuất |
|---|---|
| Tạo phòng | Tab "Tạo phòng" thêm **Kiểu phòng: Theo team / Chơi đơn**. Chọn lúc tạo, **không đổi giữa trận**. Chơi đơn: ẩn "Số team"; thêm tùy chọn **Tem Tiên phong** (mặc định bật). Chọn chủ đề, Đặt cược, thời lượng: như phòng team |
| Vào phòng | Mã phòng → **tên tự gõ** (không trùng trong phòng; chốt 29/10). Không chọn team. Mỗi người một avatar chữ cái đầu + màu từ bảng màu xoay vòng. Tên lên màn chiếu nên **chủ phòng kiểm soát được**: sửa tên bất kỳ người chơi nào (máy người đó và màn chiếu đổi theo), mời ra khỏi phòng; người chơi không tự đổi tên giữa trận |
| Xuất phát | Mỗi người xuất phát ở **một tỉnh ngẫu nhiên** (nhiều người trùng tỉnh được; tối đa **50 người**/phòng — chốt 29/10) |
| Sương mù | **Giữ** (chốt 29/10 — giữ cảm giác khám phá): tỉnh mình chưa đặt chân tới bị mây che như phòng team. Tỉnh đã ghé / có tem thì hết mây và ghi **số người đã có tem** ("12 người", "chưa ai") |
| Di chuyển | Như phòng team: chỉ đi sang tỉnh giáp ranh. Tỉnh **đã có tem** của mình: đi qua được, không hỏi lại |
| Nhận tem | Tới tỉnh chưa có tem → câu hỏi (30 giây, cùng luật giờ trả lời / trừ điểm chậm). Đúng → **tem + điểm tỉnh** (100 / 150 / 200 / 300 như PLAN §3.5). Cảnh **đóng dấu** + "Ghi vào sổ tay" (lời giải của câu) + nút **"Muốn thử món này"** |
| Tiên phong | **Người đầu tiên trong phòng** có tem một tỉnh → tem vàng **+50** (chốt 29/10). **Đua tỉnh** (chốt 29/10): nhiều người cùng ở một tỉnh chưa ai có tem thì **ai trả lời đúng trước** được Tiên phong, người đúng sau vẫn có tem thường. Màn chiếu **không nêu tên**: "Một lữ khách vừa là người đầu tiên tới X!"; tên + lời khen chỉ hiện trên máy người đó. Đây là chỗ ganh đua chính, thay cho ghé thăm thử tài |
| Sai / hết giờ / bỏ qua | Như phòng team: **nghỉ chân** 30 giây, rồi "Trả lời lại" ở tỉnh đó hoặc đi tỉnh khác; bỏ qua = lùi về + nghỉ |
| Không có | Ghé thăm thử tài / đón khách, chủ nhà, bỏ phiếu chốt đáp án (một người thì bấm là nộp) |
| Giữ nguyên | Chọn chủ đề, Đặt cược (Liều), Siêu tốc, Chuỗi đúng, Bộ sưu tập (+300), Xuyên 3 miền (+500), đóng băng bảng điểm 10 phút cuối, bằng điểm → tổng thời gian trả lời ít hơn xếp trên |
| Thẻ | Giữ **50:50**, **Thêm giờ**, **Xe tốc hành**, **Ống nhòm** (giữ sương mù nên vẫn dùng được: vén mây 1 miền 10 giây, thấy số người có tem từng tỉnh). Bỏ **Hàng rào** (không còn ai ghé thăm). Thành phố trực thuộc TW rơi thẻ trong 4 loại còn lại |
| Sự kiện MC | Lễ hội, Bão, Câu hỏi vàng: giữ nguyên. Tin đồn → "Người dẫn đầu đang có N tem" (không nêu tên). Câu hỏi chung cả phòng: xem §4 |
| Câu hỏi | Dùng câu thường. Cơ chế "ưu tiên câu ít ra trong phòng" vẫn giúp người ngồi gần nhau nhận câu khác nhau. **134 câu công thành dùng làm câu vàng** (chốt 29/10): trong sự kiện Câu hỏi vàng, câu phát ra lấy từ kho công thành của tỉnh đó (khó hơn, giờ trả lời 45 giây như câu công thành), luật vàng giữ nguyên (đúng ×2 điểm tỉnh, sai nghỉ chân ×2); tỉnh hết câu công thành thì dùng câu thường |

---

## 3. Màn hình (theo `mockup/solo.html`)

1. **Tạo phòng** — hai thẻ chọn "Theo team" / "Chơi đơn", mỗi thẻ ghi 3 điểm khác biệt; chọn Chơi đơn thì hiện tùy chọn Tem Tiên phong và dòng "Không có: số team, ghé thăm thử tài, bỏ phiếu".
2. **Màn chơi** — thanh trên: avatar, tên · Điểm · Tem N/34 · Hạng N/tổng · Chuỗi. Bản đồ: tỉnh chưa ghé có mây (mockup cần vẽ lại phần này — mockup cũ bỏ sương mù), tỉnh có tem tô xanh, tỉnh đang đứng viền đậm, tỉnh đi được viền xanh dương, tỉnh đã ghé ghi số người có tem. Thanh bên: "Đang ở …", **Mục tiêu của bạn** (Xuyên 3 miền, bộ sưu tập, tem theo miền — thanh tiến độ), **Bản tin phòng** (có tên, chỉ tin vui).
3. **Sổ tay hành trình** — bìa: tên, phòng, số tem / Tiên phong / số miền / điểm, danh sách **Muốn thử**. Trang: tab 3 miền (đếm tem từng miền), lưới con dấu (có tem: dấu đỏ nghiêng; Tiên phong: dấu vàng + nhãn; chưa có: ô xám ghi tên tỉnh). Bấm một tem → điều đã học; ô trống chỉ ghi tên tỉnh. **Mở lại được sau trận** bằng link riêng tới khi phòng tự xoá (24 giờ).
4. **Màn chiếu** — **Top 10** lữ khách (hạng, avatar, tên tự gõ — chủ phòng sửa được, số tem, điểm; người vừa lên hạng có viền xanh) + "và N lữ khách khác · mỗi người xem hạng của mình trên máy". Bản đồ nhiệt "Cả phòng đang đi đâu" (số người có tem mỗi tỉnh). Bản tin Tiên phong **không nêu tên**.
5. **Trang chủ phòng** (đã làm 30/10, không có mockup riêng) — như phòng team nhưng danh sách là từng người: **sửa tên** (ô sửa ngay trên dòng, có lý do không bắt buộc, ghi nhật ký), kick, sửa điểm theo người, thống kê câu hỏi; không có cột team.

---

## 4. Tính năng văn hóa dùng chung

> **Cập nhật 29/10/2026 — nguyên tắc: tránh phân biệt vùng miền, mọi nội dung có kiểm soát** (PLAN §0.4). Bản đầu (`mockup/culture.html`: Quê tôi, Hỏi người bản xứ, Giao lưu ghép đôi, câu "Một điều về quê bạn") **đã bỏ**: thu quê từng người và gom người theo nơi xuất thân dễ dẫn tới chuyện vùng miền; chữ tự gõ lên màn chiếu không kiểm soát được; ghép đôi / gọi tên ép người tham gia. Mockup đó chỉ giữ để tham khảo.

Thay bằng các tính năng **chỉ dùng kho câu đã duyệt + số liệu gộp**. Ngoại lệ duy nhất là **Về quê** (chủ dự án chốt lại 29/10): quê chọn từ danh sách, chỉ dùng **trong nội bộ team**:

| Tính năng | Phòng team | Phòng đơn |
|---|---|---|
| **Về quê** | Lúc vào phòng chọn quê trong 34 tỉnh (không bắt buộc, khóa khi trận bắt đầu). Bản đồ team đánh dấu tỉnh quê của đồng đội ("Quê của Lan"). Team chiếm được tỉnh quê của một thành viên (cắm cờ hoặc thắng thử tài) → **+50 "Về quê" cố định** (chốt 29/10), mỗi tỉnh 1 lần, **tối đa 3 tỉnh/team**; thưởng tích lũy, không mất khi tỉnh đổi chủ. Mockup `mockup/home.html`. **Phòng team: đã làm 29/10** (PLAN §3.3). Không lên màn chiếu, không lộ cho team khác | Người chơi có tem tỉnh quê mình → thưởng |
| **Câu hỏi chung cả phòng** (sự kiện MC) — ✅ phòng team đã làm 29/10 (PLAN 3.7) | Mọi team cùng nhận một câu (ẩm thực / phong tục). Hết giờ màn chiếu hiện % chọn từng đáp án + đáp án đúng + lời giải; MC dẫn 1–2 phút, ai muốn kể thì kể. Cả phòng đúng ≥ 70% → mọi team cùng được thưởng | Như team |
| **Sảnh chờ "Bạn có biết?"** — ✅ phòng team đã làm 29/10 (PLAN 3.0) | Màn chiếu trước trận chạy luân phiên lời giải hay trong kho câu (kèm tỉnh trên bản đồ) | Như team |
| **"Đã từng / Muốn thử"** — ✅ phòng team đã làm 29/10 | Nút cố định sau câu ẩm thực / du lịch; màn chiếu chỉ hiện số gộp ("14 người đã từng ăn mì Quảng"), không tên | Như team; "Muốn thử" vào sổ tay |
| **Tổng kết "Hành trình văn hóa"** — ✅ phòng team đã làm 29/10 | Câu cả phòng sai nhiều nhất + lời giải, món được "Muốn thử" nhiều nhất, các cặp team so tài nhiều nhất (lúc này mới mở danh tính team) | Bỏ phần cặp team |
| **Giảm áp lực tốc độ** — ✅ phòng team đã làm 29/10 | Nới khoảng đủ điểm 10 → 15 giây, giảm thưởng Siêu tốc | Như team |

Không làm: thử thách biểu diễn (hát, nói giọng miền), câu gợi chuyện về khác biệt vùng miền, mục tiêu so sánh giữa các miền.

---

## 5. Kỹ thuật dự kiến (phác, chưa thiết kế chi tiết)

- `rooms.mode` = `'team' | 'solo'`. Cách ít đụng code nhất: phòng đơn tạo **một team ẩn cho mỗi người** (team size 1) để giữ nguyên vị trí, nghỉ chân, câu hỏi đang mở, chuỗi, thẻ… Linh vật/màu thay bằng avatar chữ cái + bảng màu.
- Sở hữu tỉnh: phòng đơn **không ghi vào bảng chủ tỉnh**; thêm bảng `stamps(room_id, team_id, province_id, first, question_id, at)` (`question_id` để sổ tay lấy lời giải; đáp án vẫn không gửi client — chỉ lời giải). "Muốn thử" trong sổ tay đọc từ bảng `reactions` đã có.
- Giữ sương mù như phòng team (tỉnh đã ghé = `visits`); view gửi **số người có tem** cho tỉnh đã ghé (không gửi ai). Ống nhòm: gửi thêm số người có tem các tỉnh trong miền được vén.
- Sửa tên: `POST /api/owner/rename { playerId, name }` (cùng chuẩn hóa + kiểm tra trùng như lúc vào phòng), đổi cả `players.name` lẫn `teams.name` của team ẩn; ghi `events_log` `rename` (chỉ chủ phòng thấy). Có thể dùng luôn cho phòng team.
- Câu vàng: `pickQuestion` khi `pending_golden` ở phòng đơn lấy `difficulty = 'siege'` (giờ 45 giây), hết câu thì về câu thường.
- Tiên phong / đua tỉnh: kiểm tra trong cùng transaction lúc ghi tem (server xử lý tuần tự nên ai được ghi trước là người đúng trước, không tranh chấp).
- Màn chiếu: chỉ gửi top 10 + tổng số người; mỗi người nhận hạng của mình qua view riêng.
- Sổ tay sau trận: route `/journal?room=…` dùng phiên người chơi; hết 24 giờ thì xoá cùng phòng.
- Câu hỏi chung, sảnh chờ, "Đã từng / Muốn thử" (bảng `reactions`), tổng kết văn hóa: **đã có sẵn** từ phòng team, dùng lại.
- Test: phòng 50 người (simulate), Tiên phong khi 2 người đúng gần như cùng lúc, sổ tay không lộ đáp án.

Ước lượng: tính năng văn hóa **đã xong** (29/10); phòng đơn còn ~1,5–2 ngày (+ ~0,5 ngày nếu vẽ lại mockup có sương mù và trang chủ phòng).

---

## 5b. Phòng chơi đơn có sẵn (làm 29/10/2026)

Chủ dự án đề xuất: có sẵn một số phòng chơi đơn, **ai vào trước là chủ phòng**. Đã làm: 4 phòng (Sen, Mai, Đào, Trúc) hiện ở màn vào phòng; người vào đầu tiên giữ quyền chủ phòng ngay trong phiên chơi của mình (nút "Trang chủ phòng"); rời thì người vào sớm nhất kế tiếp nhận; phòng kết thúc quá 30 phút thì làm mới. Chi tiết: PLAN §3.0.

## 6. Đã chốt (29/10/2026)

| Câu hỏi | Chốt |
|---|---|
| Tên trên màn chiếu | **Cho tự gõ**, nhưng **chủ phòng kiểm soát được**: sửa tên bất kỳ ai (máy người đó + màn chiếu đổi theo), mời ra khỏi phòng. Xem §2 Vào phòng, §3 mục 5 |
| Tiên phong có nêu tên trên màn chiếu | **Không**: "Một lữ khách vừa là người đầu tiên tới X!"; tên chỉ hiện trên máy người đó |
| Sương mù | **Giữ**. Tỉnh đã ghé ghi số người có tem; giữ luôn thẻ Ống nhòm. Mockup `mockup/solo.html` cần vẽ lại phần bản đồ |
| Đua tỉnh | **Có**: ai trả lời đúng trước được Tiên phong |
| Số người tối đa | **50** |
| 134 câu công thành | Dùng làm **câu vàng** (giờ 45 giây, luật vàng giữ nguyên) |
| Mức điểm Tiên phong | +50 (giữ theo đề xuất) |

Sửa tên của chủ phòng: **đã làm cho cả phòng team** (29/10, PLAN §3.0) — phòng đơn dùng lại, chỉ cần màn chiếu top 10 đọc tên mới.
