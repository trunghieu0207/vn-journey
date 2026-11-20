# Quy trình soạn câu hỏi có nguồn (đợt 2, 27/10/2026)

Dùng lại khi soạn bù / soạn thêm câu hỏi. Yêu cầu của chủ dự án: **mọi câu mới phải có nguồn thật trên Internet, không tự chế**.

1. **Chuẩn bị** (thư mục làm việc tạm, ngoài project): mỗi nhóm 4–5 tỉnh một file `batch-N-context.json` gồm `id, name, region, mergedFrom, existing` (các câu đã có của tỉnh, để tránh trùng).
2. **Soạn** — mỗi nhóm một trợ lý, theo `RULES.md`: mỗi câu dựa trên bài viết đã mở thật, ghi link vào `sources`; không bịa/đoán link; thông tin nguồn ghi lệch nhau thì không dùng. Kết quả: `batch-N-new.json`.
3. **Kiểm chứng chéo** — trợ lý KHÁC người soạn, theo `VERIFY.md`: mở lại link, kết luận `ok / fix / drop`. Kết quả: `batch-N-verify.json`. Chủ trì xem tay các `fix` chỉ có ghi chú (không có trường sửa) và các nguồn yếu (trang du lịch / trang giải bài tập không được là nguồn xác nhận duy nhất → bỏ).
4. **Gộp**: `node scripts/merge-questions.mjs <thư mục> data/questions.json` (chạy thử) → thêm `--write`. Script đọc `batch-1` … `batch-40`. Script giữ đúng định dạng dòng của file, chèn câu theo nhóm tỉnh.
5. **Kiểm tra**: `pnpm run data:check` (báo lỗi nếu câu mới thiếu `sources`, link sai, trùng nội dung; cảnh báo đáp án chứa tên tỉnh) → soát tay **lộ đáp án chéo** giữa các câu cùng tỉnh (câu này nêu đáp án của câu kia) → `pnpm run test` → `pnpm run review:build` → `pnpm run db:reset`.

**Lưu ý hạn mức:** WebSearch có giới hạn — **quan sát** ở đợt 2 là ~200 lượt cho cả phiên (dùng chung mọi trợ lý), hồi lại khoảng 100 lượt/giờ; đây là ước lượng, **chưa có tài liệu xác nhận** tính theo phiên hay theo tài khoản (mở phiên mới chưa chắc được trả lại) → trước khi chạy đợt lớn, gọi thử 1 lượt WebSearch. Đợt 2 hết hạn mức giữa chừng → nhiều câu chỉ 1 nguồn / dựa báo địa phương. Lượt kiểm chứng chủ yếu dùng WebFetch (không tốn hạn mức tìm kiếm). Nên soạn ít tỉnh mỗi phiên hoặc chia đợt.

Kết quả đợt 2: 306 câu soạn → giữ 216, sửa 86 (2 câu sai đáp án: dong-nai-05, dak-lak-05; sai sự thật: quang-ninh-11, lang-son-07, son-la-10…), bỏ 4 (thai-nguyen-s3, thai-nguyen-11, da-nang-08, quang-ninh-s3) → **+302 câu**.

## Đợt 3 (30/10/2026) — lên 910 câu

Chạy bằng workflow (script mẫu: workflow "question-sourcing-1000" — mỗi nhóm một file ngữ cảnh `group-N.json` gồm `id, name, region, mergedFrom, existing, newIds.normal, newIds.siege`; trợ lý tự Read file đó; kết quả tách ra `batch-N-new.json` / `batch-N-verify.json` rồi gộp như bước 4): 17 nhóm × 2 tỉnh, mỗi nhóm 1 trợ lý soạn + 1 trợ lý KHÁC kiểm chứng (34 trợ lý). Luật siết thêm so với RULES.md: **mỗi câu ≥ 2 nguồn độc lập, ≥ 1 nguồn chính thống** (.gov.vn, Cục Di sản, UNESCO, báo lớn / báo tỉnh); Wikipedia, trang du lịch, blog không tính; người kiểm chứng mở cả 2 link, không chắc thì bỏ. Mục tiêu 22 câu thường + 8 công thành mỗi tỉnh (514 câu).

Kết quả: soạn 413 (thiếu nguồn → không soạn ~100, hết hạn mức WebSearch giữa chừng) → giữ 326, sửa 78 (chủ yếu bỏ chi tiết nguồn không ghi, thay phương án nhiễu gần đúng, bỏ chỗ lộ đáp án câu khác), bỏ 9 → **+404 câu, tổng 910**. Sau gộp: đổi 10 link `http://` → `https://` (`data:check` chỉ nhận https); sửa câu chữ 16 câu mới nêu thẳng đáp án của câu khác cùng tỉnh (Mộc Châu, Thác Bản Giốc, Tiên Yên, Kinh Bắc, S'tiêng, phố cổ Hội An…).

**Còn lại:** (1) ~110 câu chưa soạn được — nặng ở son-la, dong-nai, ho-chi-minh, phu-tho, tay-ninh, dong-thap, can-tho, ca-mau, gia-lai; chạy bù khi hạn mức hồi. (2) Nhãn "(… cũ)" trong câu mới (theo RULES) để lộ đáp án của ~11 câu cũ dạng "đặc sản này vốn của tỉnh cũ nào?" (hai-phong-03, ninh-binh-04, ninh-binh-s2, dak-lak-02, gia-lai-s2, dong-thap-04, vinh-long-s2, can-tho-02, can-tho-03, an-giang-04, lam-dong-04) và câu "dân tộc nào?" (Khmer: vinh-long-02, an-giang-02, can-tho-04) — xử lý khi bổ sung nguồn cho 204 câu cũ (viết lại các câu đó). (3) Một số lời giải nhắc đáp án của câu khác (chỉ hiện sau khi trả lời).

## Đợt 4 (13/11/2026) — câu văn hóa tỉnh mức khó, lên 1083 câu

Chủ dự án thấy câu tỉnh còn dễ → thêm câu **văn hóa** (ẩm thực, phong tục – làng nghề, lễ hội – nghệ thuật, di sản) **mức 3**, 5 câu/tỉnh. Luật như đợt 3 (≥ 2 nguồn, ≥ 1 chính thống) cộng thêm: **không nhắc tên tỉnh/huyện cũ đã sáp nhập 2025** trong câu hỏi, phương án; không nêu đáp án câu cũ cùng tỉnh (kể cả trong lời giải) và câu map đặc biệt (`data/periods.json`). Soạn: 10 trợ lý (8 nhóm + 2 nhóm soạn bù); lọc: mô hình **Fable**, mỗi nhóm một lượt, mở lại link, sửa / bỏ, câu còn dễ hạ xuống mức 2. Chủ trì dò tự động lộ đáp án chéo với câu cũ cùng tỉnh rồi sửa tay.

Lượt chính: soạn 114 → gộp 106, bỏ 5 (trùng câu map đặc biệt / trùng ý câu cũ / còn dễ). WebSearch hết hạn mức sau ~15 phút (chung mọi trợ lý) → nhiều tỉnh chưa đủ 5 câu.

Lượt soạn bù (khi hạn mức hồi): 7 trợ lý soạn 64 câu cho các tỉnh còn thiếu, Fable lọc → gộp 55; bỏ 6 (trùng câu cũ / có trong SGK / nguồn không đúng tỉnh / danh nhân phổ thông / cùng khuôn "tên sử thi của dân tộc X"). Câu chờ nguồn: lai-chau-22 tìm được nguồn thứ hai → gộp; son-la-18 (nguồn thay thế là bản đăng lại, không độc lập) và gia-lai-22 bỏ.

Lượt bù thứ hai: 2 trợ lý soạn 9 câu cho 8 tỉnh còn thiếu → Fable lọc → gộp 8 (bỏ da-nang-32: trùng khuôn dệt cườm với hue-29); 3 câu giữ chờ nguồn (son-la-20, ninh-binh-29, da-nang-30) tìm được nguồn chính thống thứ hai → gộp.

Tổng đợt 4: **+173 câu** (140 câu mức 3, còn lại Fable thấy dễ → mức 2). Cả 34 tỉnh có ≥ 5 câu mới (Lai Châu, Sơn La, Ninh Bình 6).

**Còn lại:** các câu cũ dạng "… của dân tộc nào?" (đáp án Khmer, Nùng, Thái…) bị nhiều câu khác nêu tên dân tộc trong đề → nên viết lại các câu cũ đó.

## Đợt 5 (13/11/2026) — viết lại 23 câu cũ bị lộ đáp án

Dò tự động: đáp án câu A xuất hiện trong `content` của câu khác cùng tỉnh. Hai dạng lộ nặng nhất được viết lại (giữ `id`, `difficulty`, thường giữ chủ đề nhưng hỏi góc khác):
- 11 câu "… vốn thuộc tỉnh cũ nào?" (nội dung sáp nhập, giờ bị cấm; tên tỉnh cũ có trong 8–13 câu khác cùng tỉnh): hai-phong-03, ninh-binh-04, ninh-binh-s2, gia-lai-s2, dak-lak-02, dong-thap-04, vinh-long-s2, can-tho-02, can-tho-03, lam-dong-04, an-giang-04.
- 12 câu "… của dân tộc nào?": lai-chau-s2, lang-son-08, lang-son-s6, phu-tho-04, nghe-an-10, khanh-hoa-03, khanh-hoa-s1, vinh-long-02, an-giang-02, can-tho-04, dong-nai-s2, ninh-binh-14.

Mỗi câu mới có ≥ 2 nguồn (≥ 1 chính thống), Fable lọc (chủ yếu thay phương án sai chưa chắc sai, sửa lời giải cho khớp nguồn). 19 câu trong số này vốn chưa có nguồn → `legacyUnsourced` còn 185.

**Còn lại:** các câu dễ bị lộ bởi tên địa danh trong câu khác (vd. cao-bang-01 Thác Bản Giốc, son-la-02 Mộc Châu, hung-yen-02 Phố Hiến, da-nang-02 Hội An, tay-ninh-04 Cao Đài, can-tho-01 Cái Răng, an-giang-03 Núi Sam) — phần lớn là câu mức Dễ, ít ảnh hưởng.
