# Thiết kế: chế độ "Chạy trạm" (tìm key, mở map lịch sử)

Ngày: 09/11/2026 · Branch: `custom-gameplay` · Người quyết định: chủ dự án.
Ký hiệu: **[CĐA]** = chủ dự án đã chốt trong buổi trao đổi · **[Claude]** = Claude tự quyết, chủ dự án xem lại khi đọc.

## 1. Ý định

Thêm một **kiểu phòng mới** bên cạnh "Theo team" và "Chơi đơn": luật đơn giản hơn, **không có đối kháng** giữa các team. Mỗi team tự chạy trên bản đồ Việt Nam như một trò **chạy trạm**: trả lời câu hỏi ở các tỉnh, đọc **câu đố gợi ý** để tìm các tỉnh giữ **key**, gom đủ key thì mở **map đặc biệt** là một thời kỳ lịch sử của dân tộc và giải câu đố cuối. [CĐA]

Lý do: luật hiện tại nhiều (thử tài, cược, thẻ, sự kiện…), người chơi khó hiểu vì sao được/mất điểm; bản đồ kín nhanh và trận biến thành chuỗi thử tài. Mode mới giữ phần hay (bản đồ, sương mù, câu hỏi văn hóa) nhưng mục tiêu rõ ràng: **tìm key → về đích**. Kỹ năng chính là **đọc gợi ý đúng và đi thẳng** — ghé ít trạm thì giữ được nhiều điểm.

## 2. Mục tiêu / không làm / không được xảy ra

**Mục tiêu**
- Một kiểu phòng mới, chọn lúc tạo phòng; hai kiểu cũ chạy y nguyên.
- Người mới hiểu luật trong ~1 phút.
- Mỗi team một trải nghiệm riêng (vị trí key, thời kỳ lịch sử random riêng).
- Đây là **chế độ thêm**, chạy cạnh hai kiểu phòng cũ [CĐA]. Cố gắng kịp **24/11/2026** (tổng duyệt 21/11), nhưng không bắt buộc đủ nội dung: thời kỳ nào xong nội dung thì mới được random tới [Claude].

**Không làm (mode này)**
- Thử tài / đấu tay đôi, cướp tỉnh, thẻ bài, chuỗi đúng, đặt cược Chắc ăn/Liều, chọn chủ đề, sự kiện MC (Lễ hội, Bão, Vàng, Tin đồn, Câu hỏi chung), về quê, bộ sưu tập, xuyên 3 miền, siêu tốc.
- Thông báo "Team X đã mở map" trên màn chiếu (chủ dự án không chọn ý này).
- Chế độ chơi đơn cho mode này (để sau).

**Không được xảy ra**
- Làm hỏng / đổi hành vi hai kiểu phòng cũ (toàn bộ test hiện có phải qua).
- Gửi đáp án, vị trí key chưa lộ, tên thời kỳ chưa mở xuống client (giữ nguyên tắc bảo mật hiện có).
- Nội dung lịch sử mang tính chiến tranh / bạo lực nặng, chính trị nhạy cảm, so sánh vùng miền (có trẻ em chơi; giữ bộ từ "Lữ hành").
- Thêm dependency (luật 0 dependency của PLAN.md vẫn áp dụng).

## 3. Luật chơi

### 3.1. Phòng
- Tạo phòng chọn kiểu **"Chạy trạm"** [CĐA: mode mới]. Số team 2–8, thời lượng như hiện tại (mặc định 45 phút). Tùy chọn mới: **số key cần gom**, mặc định **5** [CĐA], cho chỉnh 3–7 [Claude].
- Vào phòng, nhiều người một team, bỏ phiếu / chốt đáp án như hiện tại [Claude: giữ nguyên].

### 3.2. Bắt đầu và di chuyển
- Mỗi team xuất phát ở một tỉnh random (luật rải 3 miền hiện có) [Claude].
- Đi sang tỉnh **giáp ranh** như hiện tại; có **sương mù** như hiện tại (chỉ thấy tỉnh đã ghé + tỉnh kề) [Claude].
- Không có tỉnh "của team khác": mỗi team chơi trên bản đồ riêng, không thấy team khác [CĐA].
- Ghé lại tỉnh đã có điểm → đi qua, không hỏi lại [Claude].

### 3.3. Trạm tỉnh
- Tới tỉnh chưa có điểm → 1 câu hỏi từ kho hiện có (`difficulty: normal`) [Claude: 1 câu/tỉnh].
- **Giờ trả lời + điểm theo tốc độ** — cơ chế hiện có (`timePenalty`), giờ riêng cho mọi câu Chạy trạm (trạm tỉnh + map đặc biệt): mỗi câu **10 giây**, 5 giây đầu đủ điểm, giây 5→10 giảm đều về 0 [CĐA, 12/11: 30 giây là nhiều, chốt 10 giây; `RULES.answerLimitMs.tram` / `answerFreeMs.tram`, chọn qua `timeKey`]. Thẻ Thêm giờ / Siêu tốc không có ở phòng tram.
- **Sai / hết giờ: không trừ điểm**, nghỉ chân **20 giây** [CĐA, 12/11: 30 giây như phòng team là quá lâu, chốt 20 giây — áp cho mọi chặng Chạy trạm, `RULES.tram.lockMs`]. Hết khóa có thể "Trả lời lại" tại chỗ (câu khác) hoặc đi tiếp [Claude: giữ nút hiện có].
- "Bỏ qua" giữ như hiện tại (lùi về + khóa) [Claude].
- Trả lời đúng ở tỉnh từng sai → nhận điểm bình thường (tỉnh không còn là "đã ghé mà không có điểm") [Claude].

### 3.4. Ngôi sao hy vọng
- Mỗi team **1 lần cả trận** [CĐA]. Bật **trước khi xem câu hỏi** [Claude]: nút "Ngôi sao hy vọng" ở thanh bên dạng **nạp sẵn** (bật/tắt được, áp cho câu kế tiếp được phát; có bước xác nhận trong giao diện, không `confirm()`; đồng đội thấy trạng thái). Không thêm bước chọn ở mỗi tỉnh.
- **Bỏ qua** khi câu đang có ngôi sao = tính như **sai** (bị trừ, ngôi sao đã dùng) — tránh lách luật bật sao rồi bỏ qua câu khó [Claude].
- Dùng được ở trạm tỉnh **và** ở câu hỏi map đặc biệt [Claude] (không dùng cho câu ghép mảnh).
- Đúng → điểm câu đó **×2** (sau khi trừ theo tốc độ) [CĐA ×2; Claude: nhân sau khi trừ].
- Sai / hết giờ → **bị trừ** điểm gốc của câu đó (điểm tỉnh) [CĐA]. Vẫn nghỉ chân như câu sai.
- Chỉ dùng ở **trạm tỉnh**, không dùng ở map đặc biệt [CĐA, 12/11]. Đang bật mà mở map đặc biệt thì sao về lại chưa dùng.

### 3.5. Key và gợi ý
- Đầu trận, server rải **N key** (mặc định 5) cho **từng team riêng**, vị trí random mỗi trận [CĐA]. Ràng buộc [Claude]: không ở tỉnh xuất phát và các tỉnh kề nó; mỗi miền ít nhất 1 key; hai key không kề nhau.
- Team **không thấy** vị trí key trên bản đồ (server không gửi) cho tới khi nhặt được.
- Cứ đạt mốc **3, 6, 9… tỉnh trả lời đúng** → nhận **1 câu đố gợi ý** về một tỉnh đang giữ key [CĐA]. Gợi ý trỏ tới **key chưa có gợi ý gần vị trí hiện tại nhất** (số bước trên đồ thị giáp ranh; bằng nhau thì ngẫu nhiên) [Claude, sửa sau review: đúng tinh thần "đi thẳng"]. Khi mọi key còn lại đã có gợi ý → mốc tiếp theo cho **gợi ý thứ hai** (câu đố khác, dễ hơn) cho key chưa nhặt có gợi ý sớm nhất [Claude].
- **Luật cứu** [CĐA]: khi trận qua **một nửa thời lượng** (ví dụ phút 22 của trận 45 phút, tính theo giờ chạy, không tính lúc tạm dừng), team nào còn key chưa có gợi ý thì được phát **hết các gợi ý còn thiếu** cùng lúc (mỗi key 1 gợi ý; mốc 3, 6, 9… sau đó vẫn cho gợi ý thứ hai như trên). Lý do: team trả lời đúng ~40% không kịp mở map, mà team mở map gần như chắc xếp trên mọi team chưa mở.
- Gợi ý là **câu đố văn hóa** nêu 2–3 đặc điểm của tỉnh (món ăn, lễ hội, danh thắng, làng nghề…), **không quá dễ, không quá khó**, không nêu tên tỉnh mới / tỉnh cũ [CĐA]. Tránh đặc điểm ai cũng biết (thủ đô, "thành phố lớn nhất").
- Các gợi ý đã nhận hiện trong một **sổ gợi ý** trên màn team (mọi thành viên thấy) [Claude].
- **Nhặt key**: tới tỉnh giữ key và **trả lời đúng** câu của tỉnh đó [CĐA]. Tình cờ ghé đúng tỉnh có key (chưa có gợi ý) và trả lời đúng → cũng nhặt được [Claude]. Sai → khóa, "Trả lời lại" để thử tiếp.
- Mỗi key nhặt được lộ ra **1 mảnh ghép** của câu đố cuối (xem 3.6) [CĐA chọn ý "mảnh ghép"]. Server gán key → mảnh **ngẫu nhiên** lúc rải key; client chỉ nhận chữ của mảnh, không kèm vị trí (thứ tự nhặt không được trùng lời giải) [Claude].
- **Rải key** [Claude, sửa 12/11 sau khi CĐA chơi thử: luật cũ "mỗi miền ≥ 1 key" bắt chạy dọc đất nước ~20 bước cho 5 key, quá lâu]: chỉ ở tỉnh có ≥ 1 câu đố gợi ý đã duyệt, không phải tỉnh xuất phát / tỉnh kề, không hai key kề nhau. Rải theo **chuỗi**: key đầu cách tỉnh xuất phát đúng 2 bước, mỗi key sau cách key trước đúng 2 bước → đường đi ngắn nhất qua mọi key ≤ 2N bước, như nhau cho mọi team. Bí đường thì nới bước nhảy 2 → 2–3 → 2–4 → N tỉnh bất kỳ. Số tỉnh có gợi ý đã duyệt < N + 3 → **không cho tạo phòng Chạy trạm** với N đó, báo rõ cho chủ phòng.

### 3.6. Map đặc biệt
- Mỗi team được gán **1 thời kỳ lịch sử random** lúc bắt đầu trận, giữ kín (server không gửi tên) cho tới khi mở map [Claude]. Hai team có thể trùng thời kỳ [Claude].
- Gom đủ key → mở **map đặc biệt riêng** của team: khung cảnh thời kỳ đó [CĐA].
- **Ngay lúc mở map**: cộng **điểm tỉnh của mọi tỉnh chưa đặt chân tới** [CĐA]. Tỉnh **đã ghé mà không có điểm** (sai, hết giờ, bỏ qua, bỏ đi) → **mất** điểm tỉnh đó [CĐA] — nghĩa là **không được cộng (0), không bị trừ âm** [Claude hiểu theo CĐA]. "Đã ghé" = tỉnh team từng đặt chân tới (đã được phát câu / khung chọn), không tính tỉnh chỉ nhìn thấy qua sương mù. Không đi lại trên bản đồ sau khi mở map [Claude].
- Trả lời **3 câu** về thời kỳ đó [CĐA], lần lượt. Điểm mỗi câu **500** (tỉnh cao nhất 300) [Claude: "lớn hơn nhiều" theo CĐA]. Giờ trả lời và trừ theo tốc độ như câu trạm tỉnh: 10 giây, 5 giây đầu đủ điểm [CĐA, 12/11]. Sai / hết giờ → nghỉ chân 20 giây rồi câu khác cùng thời kỳ; không trừ điểm [Claude].
- Đúng đủ 3 câu → **câu đố ghép mảnh**: các mảnh từ key (N mảnh) hiện xáo trộn, team sắp lại đúng thứ tự để ra một câu / cụm từ về thời kỳ đó [CĐA ý 1]. Đúng → **+1000** [Claude] và **thưởng về đích sớm = số phút còn lại × 30** (làm tròn xuống theo phút, tính lúc giải xong câu ghép) [CĐA đồng ý công thức], team **về đích**. Sai → nghỉ chân 20 giây, sắp lại; không giới hạn lần [Claude]. Không tính giờ / không trừ theo tốc độ cho câu ghép [Claude].
- Mảnh ghép lộ dần từ đầu (theo từng key) nên team có thể đoán thời kỳ trước khi vào map — chấp nhận, coi là phần vui [Claude].
- Về đích → chờ hết trận; bảng điểm hiện trạng thái "Đã về đích" [Claude].
- Ở map đặc biệt, "Bỏ qua" = tính như sai (nghỉ chân 20 giây, câu khác), không có lùi về [Claude].
- Câu ghép nhiều người một team: mỗi người sắp trên máy mình, ai bấm "Chốt" thì nộp thứ tự của người đó (giống câu tự điền), không dùng trạng thái kéo-thả chung. Giao diện **bấm lần lượt** từng mảnh (không kéo-thả) cho chắc trên điện thoại [Claude].
- Câu ghép lưu sẵn **cách chia cho từng N (3–7)** trong dữ liệu; không tự gộp mảnh lúc chạy [Claude].
- Khoảnh khắc nhặt key cuối: client diễn xong hiệu ứng kết quả ("Chính xác" + key + mảnh) rồi mới chuyển sang màn map đặc biệt (tránh lỗi cũ SSE đóng khung sớm) [Claude].

### 3.7. Kết thúc và xếp hạng
- Trận kết thúc khi **hết giờ** hoặc **mọi team đã về đích** [Claude], hoặc chủ phòng bấm Kết thúc.
- Điểm = điểm các tỉnh đã trả lời đúng (sau trừ tốc độ) ± ngôi sao + (nếu đã mở map) điểm tỉnh chưa đi + điểm câu map đặc biệt + (nếu về đích) 1000 + thưởng về đích sớm [CĐA + Claude].
- Lý do có thưởng về đích sớm: tỉnh chưa đi được cộng đủ điểm khi mở map, nên nếu không có khoản này thì hai team không sai câu nào sẽ gần như bằng điểm dù về đích cách nhau 20 phút.
- Team chưa mở map lúc hết giờ: chỉ có điểm tỉnh đã trả lời đúng (± ngôi sao) [Claude].
- Xếp hạng theo tổng điểm; bằng điểm → về đích trước xếp trên (cột thời điểm về đích; chưa về đích xếp sau); còn bằng → tổng thời gian trả lời ít hơn, tính cả câu map đặc biệt (luật hiện có) [Claude].
- Thời lượng phòng Chạy trạm tối thiểu **30 phút** [Claude].
- Lúc tạo phòng Chạy trạm ẩn các tùy chọn không áp dụng (số câu/tỉnh, cược, chủ đề, Theo team/Chơi đơn). Sảnh chờ "Bạn có biết?" giữ nguyên. "Chơi lại" xóa sạch key, gợi ý, thời kỳ, mảnh, trạng thái map. Sửa điểm của chủ phòng đi vào điểm thưởng như hiện tại [Claude].

### 3.8. Màn chiếu và chủ phòng
- Màn chiếu: đồng hồ, bảng điểm, mỗi team hiện **số key / N** và "Đã về đích"; đóng băng bảng điểm 10 phút cuối như hiện tại [Claude]. Không bản tin công thành / đổi chủ (không còn). Cuối trận: bảng xếp hạng (bỏ tua lại hành trình nếu tốn công — để builder quyết).
- Trang chủ phòng: Bắt đầu / tạm dừng / kết thúc / chơi lại, thành viên, kick, sửa điểm như hiện tại; ẩn các nút sự kiện [Claude].

## 4. Nội dung cần soạn mới

Theo quy trình `docs/question-sourcing/` (mỗi mục ≥ 2 nguồn độc lập, ≥ 1 chính thống; người kiểm chứng khác người soạn; không bịa link). Hạn mức WebSearch ~200 lượt/phiên → chia đợt.

### 4.1. Thời kỳ lịch sử [Claude chọn danh sách; CĐA nêu ví dụ Văn Lang / Âu Lạc]
7 thời kỳ, nghiêng về **văn hóa, đời sống, công trình, chữ viết, giáo dục, nghệ thuật**, hạn chế chiến trận:
1. Văn Lang (thời Hùng Vương) 2. Âu Lạc 3. Hoa Lư (Đinh – Tiền Lê) 4. Nhà Lý (Thăng Long) 5. Nhà Trần 6. Nhà Hậu Lê 7. Nhà Nguyễn (Phú Xuân – Huế).
Không lấy giai đoạn từ 1858 trở đi (tránh nội dung chính trị hiện đại).

Mỗi thời kỳ:
- **12 câu** trắc nghiệm 4 phương án (đủ cho 3 câu + trả lời lại + nhiều team trùng thời kỳ), trộn mức 2–3, định dạng giống `questions.json` + trường `period`.
- **1 câu ghép mảnh**: một câu / cụm từ có ý nghĩa của thời kỳ, chia được thành **3–7 mảnh** (để khớp số key chủ phòng chọn; mặc định 5) — ví dụ chia theo từ. Có lời giải + nguồn.
- **Khung cảnh map**: mô tả ngắn + 3 hình ảnh tiêu biểu. Dùng **một khung cảnh chung** (nền + tên thời kỳ + 3 icon sticker trong `shared/icons.js`, đổi màu theo thời kỳ), không vẽ 7 tranh riêng [Claude, sau review: tiết kiệm thời gian].
- **Tiêu chí loại trừ** khi soạn: không hỏi trận đánh, vũ khí, người chết, tranh cãi lịch sử; ưu tiên công trình, chữ viết, giáo dục, nghệ thuật, phong tục, nhân vật văn hóa.

Tổng: 84 câu + 7 câu ghép.

**Thứ tự ưu tiên (MVP cho 24/11)** [Claude]: (1) **68 câu đố gợi ý** là đường găng — không có gợi ý đã duyệt thì không rải được key; (2) **2–3 thời kỳ** đã duyệt là đủ chơi (team trùng thời kỳ chấp nhận được), các thời kỳ còn lại làm tiếp; (3) phần còn lại sau. Mốc: server + test ~14/11, giao diện ~18/11, chạy thử tay 19/11; không đạt thì tổng duyệt 21/11 dùng hai kiểu phòng cũ.

### 4.2. Câu đố gợi ý key [CĐA: câu đố văn hóa, độ khó vừa]
- **34 tỉnh × 2 câu đố** (câu 1 vừa, câu 2 dễ hơn — dùng cho "gợi ý thứ hai") = 68 câu đố.
- Ưu tiên dựng từ **sự thật đã có nguồn** trong `questions.json` của chính tỉnh đó (dùng lại `sources` đã kiểm chứng) → ít tốn lượt tìm kiếm. Không trích nguyên văn câu hỏi trạm (tránh team vừa nhận gợi ý vừa gặp đúng câu đó).
- Mỗi câu đố phải **chỉ khớp đúng 1 tỉnh** (bước kiểm "có tỉnh nào khác cũng đúng không" khi kiểm chứng và khi duyệt) — ví dụ "chợ nổi" khớp nhiều tỉnh Nam Bộ là không đạt.
- Không nêu tên tỉnh mới, tỉnh cũ, trung tâm hành chính. **Được** nhắc đặc sản / lễ hội / danh thắng của tỉnh cũ đã sáp nhập [Claude]; bù lại, sổ gợi ý và tooltip bản đồ của mode này hiện **các tỉnh cũ đã gộp** vào mỗi tỉnh mới (`mergedFrom`) để người chơi lần ra được [Claude].

### 4.3. Chủ dự án tự duyệt [CĐA]
- Câu hỏi lịch sử, câu ghép mảnh và câu đố gợi ý đều qua **chủ dự án duyệt** trước khi dùng trong game (sau bước kiểm chứng chéo).
- Dựng trang duyệt tĩnh giống `docs/questions-review.html` (mở rộng `scripts/build-review.mjs` hoặc script riêng) [Claude].
- Mỗi thời kỳ / mỗi tỉnh có cờ `reviewed: true` do chủ dự án bật sau khi duyệt; game chỉ random tới thời kỳ đã duyệt và chỉ rải key ở tỉnh có gợi ý đã duyệt [Claude]. Nội dung nên giao theo đợt để chủ dự án duyệt dần, không dồn sát 21/11.

### 4.4. Định dạng dữ liệu [Claude]
- `data/periods.json`: danh sách thời kỳ { id, name, years, scene, questions[], puzzle { text, pieces[], explanation, sources } }.
- `data/key-hints.json`: { provinceId: [hint1, hint2] }, mỗi hint có `text`, `sources`.
- `scripts/validate-data.mjs` kiểm tra thêm hai file này (có nguồn, đủ số lượng, không chứa tên tỉnh).
- Hai file này **không** đặt trong `public/` (người chơi tra ngược được gợi ý → tỉnh); client chỉ nhận phần đã lộ qua view [Claude].
- Mode này hiện tỉnh cũ đã gộp trên bản đồ → **không phát** các câu hỏi "vốn là đặc sản của tỉnh cũ nào" (hiện có 6 câu: `hai-phong-03`, `ninh-binh-04`, `dak-lak-02`, `dong-thap-04`, `can-tho-02`, `can-tho-03`) — đánh cờ trong dữ liệu và lọc khi phát câu ở mode này [Claude].

## 5. Ràng buộc kỹ thuật

- 0 dependency, JS thuần, chỉ `node:*`; chỉ pnpm (PLAN.md).
- Server quyết mọi thứ: vị trí key, thời kỳ, đáp án, kiểm tra thứ tự mảnh ghép — client chỉ nhận phần đã lộ.
- Thêm cột / bảng DB → `pnpm run db:reset` (xóa phòng). Thêm file `public/` → whitelist `server/static.js`. Mọi API qua `api()` (`shared/api.js`).
- Không class/id kiểu quảng cáo; không emoji (icon mới vào `shared/icons.js`: key, ngôi sao hy vọng, cuộn mật thư); không `confirm()`.
- Đổi luật thì cập nhật `public/rules.html` (thêm mục cho mode mới) và PLAN.md.
- Test tự động cho luật mới (`tests/`), kiểu `tests/game.test.js`.

## 6. Để builder quyết
- Cách tổ chức code (module riêng `server/game/tram.js` hay mở rộng `actions.js`), cấu trúc bảng DB (vị trí key, gợi ý đã phát, thời kỳ, mảnh đã lộ, trạng thái map đặc biệt).
- Bố cục UI sổ gợi ý, khay key/mảnh ghép, màn map đặc biệt và câu ghép (kéo-thả hay bấm lần lượt), miễn đồng nhất phong cách hiện có và chạy được trên điện thoại.
- Có giữ màn "tua lại hành trình" cuối trận cho mode này không.
- Thứ tự làm: luật server + test trước, UI sau, nội dung song song.
- Gợi ý từ review: mode này giống **phòng chơi đơn** hơn phòng team (không có chủ tỉnh, "đi qua tỉnh đã có điểm", sương mù theo tỉnh đã ghé) — cân nhắc mở rộng nhánh `isSolo()` cho phần di chuyển / tem thay vì tách từ nhánh team.
