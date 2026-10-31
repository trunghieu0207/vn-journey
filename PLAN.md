# Kế hoạch: "Hành trình 3 miền – Chiếm tỉnh trong sương mù"

> Mini game theo team cho Ngày Văn hóa Việt Nam 24/11/2026.
> Ngày lập plan: 27/10/2026 · Còn khoảng 4 tuần đến sự kiện.

> [!IMPORTANT]
> **NGUYÊN TẮC BẮT BUỘC: CHỈ DÙNG JAVASCRIPT THUẦN, KHÔNG THÊM DEPENDENCY KHI CHƯA ĐƯỢC CHO PHÉP**
>
> - **Frontend:** chỉ HTML/CSS/JS thuần. Không framework (React, Vue…), không thư viện UI, không CDN, không bundler, không CSS framework.
> - **Backend:** chỉ dùng module built-in của Node.js (`node:http`, `node:crypto`, `node:fs`, `node:path`, `node:url`, `node:test`…). Không Express, không ORM, không thư viện tiện ích.
> - **Hiện tại project có 0 dependency.** Database dùng `node:sqlite` built-in của Node.js (đã bỏ `mysql2`, xem [12.5](#125-nhật-ký-dependency)).
> - **Muốn thêm bất kỳ package nào khác** (kể cả devDependency, tool test, linter, formatter): phải **hỏi và được chủ dự án đồng ý trước**, ghi lý do vào mục [12.5. Nhật ký dependency](#125-nhật-ký-dependency).
> - **Chỉ dùng `pnpm` để quản lý package** (máy dev đã có sẵn pnpm). **Không dùng `npm`, không dùng `npx`.**
>   - Cài package: `pnpm add <pkg>` (không `npm install <pkg>`)
>   - Cài theo lockfile: `pnpm install --frozen-lockfile` (không `npm ci`)
>   - Chạy script: `pnpm run <script>` (không `npm run`)
>   - Chỉ commit `pnpm-lock.yaml`, không để `package-lock.json` trong repo
>   - Khai báo `"packageManager": "pnpm@<version>"` trong `package.json`
> - Không cài package global, không dùng `pnpm dlx` để chạy tool tải từ internet.
> - Mỗi lần review code: kiểm tra `package.json` chỉ có các dependency đã được duyệt.

---

## 0. Trạng thái & bàn giao — ĐỌC TRƯỚC KHI MỞ SESSION MỚI

> Cập nhật: **31/10/2026** (trang quản trị `/quan-tri` — tài khoản admin, mọi phòng, người chơi, bảng xếp hạng; luật: xếp hạng cộng dồn, bão, đóng băng 1/3; deploy VPS + git; **143 test**) · trước đó **30/10/2026 tối** (Phase 5 rà bảo mật; tách cookie theo vai; khung diễn biến màn chiếu; đồng hồ câu hỏi +1 giây; số câu mỗi tỉnh; cược số hiệp thử tài; phòng công khai / riêng tư; trang chủ dạng landing; bảng xếp hạng cá nhân; câu hỏi đợt 3 → 910 câu; **129 test**; các dòng bên dưới ghi ngày làm riêng). Sự kiện: **24/11/2026**. Thư mục project: thư mục gốc của repo.
> **Code Phase 1–4 đã xong nhưng CHƯA được thử trên trình duyệt thật** (Claude không có công cụ điều khiển trình duyệt trong session 27/10 — tiện ích Claude cho Chrome/Edge chưa kết nối; thử `/chrome` ở session mới). Mọi thứ dưới đây đã qua test tự động + chạy thử qua HTTP/SSE, phần giao diện chỉ được kiểm tra cú pháp.

### 0.1. Đã xong
| Hạng mục | Kết quả | Xem ở |
|---|---|---|
| Thiết kế | **Bản đồ thật** (chỉ lãnh thổ VN) + **phong cách Hoạt hình** kiểu Duolingo. Font **Nunito** lưu trong project (đã duyệt). **Icon linh vật** 8 team tự vẽ SVG | Mục 5.2, 5.10, 12.5; `public/shared/mascots.js` |
| Dữ liệu bản đồ / tỉnh | 34 tỉnh, 58 cặp giáp ranh, đảo + Hoàng Sa/Trường Sa; 9 TP trực thuộc TW; 6 bộ sưu tập | `data/map-geo.json`, `data/provinces.json` |
| **Câu hỏi** | **910 câu** sau đợt 3 (30/10: +404 câu, mỗi câu ≥ 2 nguồn độc lập đã kiểm chứng chéo — `docs/question-sourcing/README.md` mục Đợt 3; còn thiếu ~110 câu để đủ 22 thường + 8 công thành mỗi tỉnh). Trước đó **506 câu** (372 thường + 134 công thành). 204 câu đợt 1 (chưa lưu link nguồn) + **302 câu đợt 2 có `sources`**, đã kiểm chứng chéo (xem 0.5 "Câu hỏi") | `data/questions.json`, `docs/question-sourcing/` |
| Phase 2 – Backend | ✅ Luật chơi, bảo mật, SSE realtime, **63/63 test** | `server/`, `tests/`, mục 7 |
| **Phòng chơi (Room)** | ✅ Ai cũng tạo phòng; nhiều phòng song song; vào bằng mã phòng + tên + chọn team; nhiều người/team (ai nhanh hơn thắng, máy đến sau tự đồng bộ) | Mục **3.0** |
| Luật mới (27/10) | ✅ **Giờ trả lời trừ điểm** (3.3) · **Bỏ qua** = lùi về + khóa 10 s + thời gian đã xem (3.3) · **Chọn chủ đề** (chủ phòng bật/tắt, 3.3) · **Bằng điểm → tổng thời gian trả lời ít hơn xếp trên** (3.5) | Mục 3.3, 3.5 |
| Phase 3 – Màn team | 🟡 Code xong: tạo/vào phòng, bản đồ + sương mù + **camera bay tới tỉnh (van Wijk flyTo)** + khung câu hỏi neo phải, chọn chủ đề, bỏ qua, công thành, thẻ bài, khóa, Esc che màn hình, âm thanh, tổng kết | `public/team.*`, `public/shared/*` |
| **Bộ icon tự vẽ (27/10 tối)** | ✅ 41 icon SVG thay **toàn bộ emoji** ở 3 màn (cờ theo màu team, nón lá = vị trí, đèn lồng = lễ hội, trống = văn hóa…). Cỡ theo chữ (`1.25em`); HTML tĩnh dùng `<span data-icon="tên">` + `fillIcons()`; JS dùng `icon()` / `labeled()`. Không dùng emoji nữa. Đã xem qua Edge headless cùng đợt chất vẽ tay | `public/shared/icons.js`, xem trước `mockup/icons.html` (file tĩnh, không tự cập nhật) |
| **Mây che sương mù (27/10 tối)** | ✅ Bản A "mây cục" (mục 5.2, bảng Bản đồ). Đã xem qua Edge headless: mây hiện ở tỉnh sương mù, đi sang tỉnh khác thì tỉnh vừa bị phủ lại hiện mây dần | `public/shared/map.js`, `style.css`; mockup `mockup/fog-clouds.html` |
| **Chuyển động (27/10 tối)** | ✅ Áp 10 hiệu ứng + camera "bay nảy" (chi tiết mục 5.2). Đã chạy thật bằng Edge headless: đếm ngược bắt đầu, nón lá nhảy + camera, trả lời đúng (tích xanh, sao, "Chính xác!", đếm điểm, mảnh sticker dập lên tỉnh), trả lời sai (gạch chéo, "Chưa đúng"), lật thẻ bay vào khay, biển Lễ hội, vượt hạng trên màn chiếu. **Chưa thử**: hiệu ứng mất tỉnh (cần đội khác công thành), Bão, thao tác tay thật. Sửa kèm: khung câu hỏi bị SSE đóng sớm trước khi diễn xong kết quả | `public/shared/fx.js` (mới, đã thêm vào `server/static.js`), `public/shared/map.js`, `team.js`, `screen.js`, `admin.js`, `style.css` (mục CHUYỂN ĐỘNG); mockup `mockup/animations.html` |
| **Chất vẽ tay "sticker phác tay" (27/10 tối)** | ✅ Áp bản A+B ② cho cả 3 màn (team, chủ phòng, màn chiếu) + bản đồ — chi tiết mục 5.2. Đã chụp kiểm tra bằng **Edge headless** (đăng nhập, bản đồ, khung câu hỏi, trang chủ phòng, màn chiếu 1920×1080). Icon đổi sang sticker run nét cùng đợt. Sửa luôn lỗi cũ: nhãn sự kiện "Bão" bị ẩn (trùng lớp `.storm` của bản đồ). Chưa thử thao tác tay (rê chuột, bấm) trên trình duyệt thật | `public/style.css` (mục CHẤT VẼ TAY), `public/shared/map.js` (`wobble`, lớp `layer-paper`, `.sketch`), `<svg class="hand-defs">` trong 3 file HTML; mockup `mockup/hand-drawn.html` |
| **Phase 5 – Rà bảo mật (30/10)** | ✅ Checklist mục 9 đạt; sửa 6 lỗi: **vào lại bằng tên chiếm được quyền chủ phòng** (nặng nhất), cookie lạ làm hỏng API, SSE không giới hạn kết nối/phiên, sau Nginx mọi người chung 1 IP (`TRUST_PROXY`), tên có ký tự đảo chiều/vô hình, bản sao lưu 644. **113/113 test**. Còn chờ: chạy `/gkit-review-security`, quyết mã cá nhân khi vào lại | `docs/security-review-2026-10-30.md` |
| **3 việc chốt 30/10** | ✅ **Mỗi vai một cookie** (`vnj_player` / `vnj_owner` / `vnj_screen`): cùng cửa sổ vừa chủ phòng, vừa chơi, vừa mở màn chiếu không đè nhau; trang gửi header `X-Vnj-Page` (`shared/api.js`) để server chọn đúng phiên; Thoát chỉ xóa vai của trang đó; chủ phòng mở màn chiếu cùng trình duyệt không cần mã. **Khung "Diễn biến mới nhất"** trên màn chiếu (3.8). **Đồng hồ câu hỏi bắt đầu sau khi phát 1 giây** (`RULES.questionLeadMs`, 3.3). Kèm sửa lỗi cũ: icon tĩnh của màn chiếu không hiện (`fillIcons()` chưa gọi). **Chưa xem trên trình duyệt** | `server/app.js`, `server/security.js`, `public/shared/api.js`, `public/screen.*`, `css/pages.css` |
| **Phòng đơn — phần còn dở (30/10)** | ✅ Bản đồ ghi **số người có tem** dưới tên tỉnh (màn chơi: tỉnh đã ghé / ống nhòm; màn chiếu + trang chủ phòng: bản đồ nhiệt) · **Trang chủ phòng riêng**: danh sách lữ khách theo hạng + ô tìm tên + Sửa tên / ±điểm / Mời ra từng dòng (`ownerView` thêm `pioneers`) · mockup `solo.html` vẽ lại có sương mù. **Chưa xem trên trình duyệt** | `docs/solo-mode.md`, `public/admin.js`, `public/shared/map.js` (`notes`, `heatNotes`) |
| **Số câu mỗi tỉnh + cược số hiệp thử tài (30/10)** | ✅ Chọn 1–3 câu/tỉnh lúc tạo phòng, giữ tiến độ khi sai; thử tài: hai đội cược 1–3 hiệp, thắng đa số, hòa chủ nhà giữ (3.3). 123 test. **Chưa thử trên trình duyệt** (nhất là nhiều hiệp: khung cược hai bên, chuyển hiệp, kết quả hiệp) | `server/game/actions.js` (`progressOf`, `answer`), `public/team/question.js` |
| **Phòng công khai, trang chủ landing, bảng xếp hạng (30/10)** | ✅ Tạo phòng chọn **Công khai / Riêng tư** (công khai hiện ở danh sách "Phòng đang mở"). Trang `/` thành **landing** (giới thiệu + khu Vào chơi; danh sách phòng gọn có lọc Tất cả / Theo team / Chơi đơn + tìm tên). **Bảng xếp hạng cá nhân cả sự kiện** (chỉ phòng đơn, giữ 7 ngày): trang `/leaderboard` + nút trên màn chiếu. Chi tiết: các dòng cùng tên ở mục 3. Đã chụp Edge headless trang chủ (1280px, 600px); **chưa thử bấm thật** (danh sách phòng, lọc, ô mã ở đầu trang, bảng xếp hạng) | `public/team.html` + `team/entry.js` + `css/landing.css`, `public/leaderboard.*`, `server/game/rooms.js` (`publicRooms`, `leaderboard`), `server/game/room.js` (`recordBoard`) |
| Phase 4 – Màn chiếu + chủ phòng | 🟡 Code xong: **trang chủ phòng** `/admin.html` (điều khiển trận, sự kiện, chọn chủ đề, thành viên + kick, sửa điểm, thống kê câu hỏi, tổng kết) · **màn chiếu** `/screen.html` (sảnh chờ mã phòng to, đồng hồ, bản đồ bí ẩn, bản tin, bảng điểm + đóng băng, tua lại → công bố → pháo hoa) | `public/admin.*`, `public/screen.*` |

### 0.2. Cách chạy
```bash
cd vn-journey          # thư mục gốc của repo
pnpm run data:check   # 0 lỗi; 4 cảnh báo cũ (câu công thành mức Dễ)
pnpm run review:build # dựng lại docs/questions-review.html sau khi sửa câu hỏi
pnpm run db:reset     # tạo lại var/game.db — XÓA mọi phòng; bắt buộc sau khi đổi schema hoặc câu hỏi
pnpm run test         # 115 test
pnpm run dev          # http://127.0.0.1:3000 — / tạo hoặc vào phòng · /admin.html chủ phòng · /screen.html màn chiếu
curl --noproxy 127.0.0.1 http://127.0.0.1:3000/api/health   # LUÔN --noproxy (xem 0.4)
kill $(lsof -ti tcp:3000 -sTCP:LISTEN)                      # tắt server — CHỈ tiến trình LISTEN (xem 0.4)
```
Thử trọn 1 trận: mở `http://127.0.0.1:3000/` (đúng `127.0.0.1`, không `localhost` — server kiểm tra Origin) → "Tạo phòng" → "Mở trang chủ phòng" + "📺 Mở màn chiếu" → vào phòng bằng mã (cùng cửa sổ được — mỗi vai một cookie từ 30/10; muốn thử nhiều người chơi thì mỗi người một cửa sổ ẩn danh / trình duyệt khác) → Bắt đầu → chơi → Kết thúc.

### 0.3. Việc tiếp theo (theo thứ tự ưu tiên)
1. **Chủ dự án thử trên trình duyệt** (Chrome + Edge, 1366×768; màn chiếu 1920×1080 zoom 100%/150%): một trận đủ vai, 2 người cùng team bấm cùng lúc, chọn chủ đề, bỏ qua, hết giờ, kết thúc → tổng kết. Lỗi → F12 Console gửi Claude. Nếu có công cụ trình duyệt (`/chrome`), Claude tự làm: đo FPS camera bay (Performance), bắt lỗi Console, soát giao diện.
2. ~~**Phase 0 — báo IT/SOC**~~ — **quyết định 31/10: không gửi**, deploy lên VPS ngoài (xem `docs/DEPLOY.md`). Ghi chú cũ giữ lại nếu sau này cần gửi: Email mẫu mục 12.1 **đã cũ** (còn mô tả PIN team, 1 trận) → sửa theo mô hình phòng (ai cũng tạo phòng, nhiều phòng, mã phòng là vào được; phòng công khai hiện ở danh sách) trước khi gửi. **Phải nêu thêm:** bảng xếp hạng cá nhân lưu tên hiển thị + điểm người chơi phòng đơn 7 ngày, công khai ở `/leaderboard`.
3. ~~Phase 5 — rà bảo mật~~ ✅ 30/10 (`docs/security-review-2026-10-30.md`). Còn: chạy `/gkit-review-security`; chủ dự án quyết có thêm **mã cá nhân khi vào lại** không (mục 2.1 báo cáo).
4. **Script còn thiếu** mà PLAN nhắc: `scripts/simulate-teams.js` (bước 7.3), `scripts/recalibrate-levels.mjs` (bước 7.9 — chấm lại độ khó theo % đúng sau tổng duyệt).
5. **Phase 6 — deploy**: ✅ tài liệu `docs/DEPLOY.md` (31/10 — Node 1 tiến trình + Nginx HTTPS/SSE + systemd + ufw, checklist ngày sự kiện, khôi phục backup, gỡ host). Còn: thuê VPS + domain, lấy IP public văn phòng; **quyết lại 6.7** (đề xuất: chặn IP văn phòng ở Nginx); thử sớm proxy công ty có chặn domain mới/SSE không.
6. Phase 7 tổng duyệt **21/11** → sự kiện 24/11 → Phase 9 gỡ host.
7. **Câu hỏi**: (a) chạy bù ~110 câu còn thiếu để đủ 22 thường + 8 công thành mỗi tỉnh (danh sách tỉnh thiếu: `docs/question-sourcing/README.md` mục Đợt 3) — cần WebSearch, thử một lượt trước xem hạn mức còn không; (b) **bổ sung nguồn cho 204 câu cũ + 139 câu đợt 2 chỉ 1 nguồn** (chủ dự án chọn làm sau 1000 câu), đồng thời **viết lại 14 câu cũ bị câu mới lộ đáp án** (dạng "vốn của tỉnh cũ nào?" / "dân tộc nào?" — danh sách ở README mục Đợt 3); (c) chủ dự án duyệt câu ở `docs/questions-review.html`.

### 0.4. Quy tắc làm việc (bắt buộc)
- **0 dependency**: chỉ HTML/CSS/JS thuần + module `node:*`. Thêm package/font/file ngoài phải hỏi trước (mục 12.5). Chỉ **pnpm**, không `npm`/`npx`.
- **Không gọi mạng** khi dev, server chỉ bind `127.0.0.1`. **Máy có proxy công ty nhưng không có `no_proxy`** → `curl` tới localhost phải có `--noproxy 127.0.0.1`. (`fetch` của Node không đi qua proxy.)
- **Tắt server: `kill $(lsof -ti tcp:3000 -sTCP:LISTEN)`**. **Không** dùng `kill $(lsof -ti tcp:3000)` — trả về cả trình duyệt đang kết nối (Edge Helper, WebKit Networking) → giết tiến trình mạng của trình duyệt → các trang web khác bị đăng xuất (đã xảy ra ~8 lần ngày 27/10).
- Không chạy tool quét bảo mật, không `sudo`, không cài global. **Không gửi request thăm dò / tấn công vào server, kể cả localhost** (curl đường dẫn cấm, cookie giả, tái hiện chiếm phiên…) — kiểm chứng bảo mật **chỉ bằng test tự động** (chốt 30/10).
- Đáp án **không bao giờ** gửi client; sai/bỏ qua không lộ đáp án; team không thấy vị trí/tên team khác; màn chiếu chỉ dữ liệu ẩn danh (kể cả khi mở bằng phiên chủ phòng — trang tự xin `/api/stream?view=screen`).
- **Mỗi vai một cookie** (30/10): `vnj_player` / `vnj_owner` / `vnj_screen`. Gọi API phải qua `api()` trong `shared/api.js` (gửi header `X-Vnj-Page`); route mới nhận `{ session, sessions }` — `session` là phiên đúng vai của trang.
- **Thêm file vào `public/` phải thêm vào whitelist `server/static.js`.** Đổi schema → `pnpm run db:reset` (xóa phòng). Đổi file `server/*` → khởi động lại server; chỉ đổi `public/*` thì chỉ cần tải lại trang.
- **Hiệu ứng SVG:** không dựa vào CSS `filter: brightness()/drop-shadow()` trên phần tử SVG (có trình duyệt bỏ qua — khối nổi tỉnh đã từng mất bóng) → tính màu bằng JS + dùng bộ lọc SVG gốc (`<feDropShadow>`). Camera bay: không đo `getBoundingClientRect` / đổi class / xếp nhãn mỗi khung hình (giật) — chỉ phần nhẹ `placeMovers`, xếp nhãn đầy đủ khi bay xong.
- **Câu hỏi mới bắt buộc có `sources`** (link bài viết thật, không tự chế) — `data:check` báo lỗi nếu thiếu. Quy trình soạn + kiểm chứng chéo: `docs/question-sourcing/README.md`. Nội dung: ưu tiên ẩm thực, đời sống, phong tục, làng nghề, lễ hội; không câu hành chính; không lộ đáp án (kể cả **lộ chéo** giữa các câu cùng tỉnh).
- **Hạn mức WebSearch ~200 lượt/phiên, dùng chung mọi trợ lý** (hồi ~100 lượt/giờ) — soạn câu theo đợt nhỏ.
- **Tránh phân biệt vùng miền — mọi nội dung đều có kiểm soát** (chốt 29/10): không hiện chữ người chơi tự gõ cho người khác; không ghép đôi / gọi tên một cá nhân. **Quê** (chốt lại 29/10): chỉ chọn từ danh sách 34 tỉnh, không bắt buộc, **chỉ đồng đội trong team thấy** — không lên màn chiếu, không lộ cho team khác, không gom người theo vùng. Tính năng giao lưu chỉ dùng kho câu đã duyệt + số liệu gộp. Câu hỏi không so sánh / xếp hạng vùng miền, không gán tính cách cho người một vùng, không chế giễu giọng địa phương.
- **Không dùng emoji** trong giao diện — thêm icon mới vào `public/shared/icons.js` (cùng phong cách: khối màu phẳng, mảng tối tạo khối, không viền đen).
- Người dùng không thích: viền đen, viền dày, nét đứt vàng, họa tiết rối mắt, hộp thoại mặc định của trình duyệt (`confirm`), link gạch chân tím mặc định; thích gọn, nhẹ, giống game, đồng nhất style.

### 0.5. Đang chờ / vấn đề đã biết
| Việc | Trạng thái |
|---|---|
| **Đề xuất: tính năng văn hóa + phòng chơi đơn** (29/10) | Phòng team (trước 24/11 nếu chốt): **Câu hỏi chung cả phòng ✅ ĐÃ LÀM 29/10** (luật ở 3.7; 96/96 test; đã chạy thử Edge headless cả 3 màn) · **Sảnh chờ "Bạn có biết?" ✅ ĐÃ LÀM 29/10** (luật ở 3.0; 97/97 test) · **Tổng kết "Hành trình văn hóa", "Đã từng / Muốn thử", giảm áp lực tốc độ ✅ ĐÃ LÀM 29/10** (luật ở 3.3; 98/98 test). **Về quê: ✅ ĐÃ LÀM 29/10** (luật ở 3.3; 93/93 test; đã chạy thử Edge headless — mockup `mockup/home.html`). **Đã bỏ** (29/10, tránh phân biệt vùng miền — xem 0.4): Hỏi người bản xứ, Giao lưu ghép đôi, chữ tự gõ, sảnh chờ theo quê · **Phòng chơi đơn ✅ ĐÃ LÀM 29/10** (kiểu B "mỗi người một hành trình": sưu tầm tem, Tiên phong, sổ tay; 105/105 test; luật ở `public/rules.html` mục 11; **6 câu hỏi mở đã chốt 29/10**: tên tự gõ + chủ phòng sửa được, Tiên phong không nêu tên trên màn chiếu, giữ sương mù, đua tỉnh, tối đa 50 người, câu công thành làm câu vàng). Chi tiết: `docs/solo-mode.md`; mockup `mockup/culture.html`, `mockup/solo.html` |
| **Lỗi "bấm tỉnh → camera vào rồi ra, không hiện khung chọn chủ đề, bấm lại không được"** | Nguyên nhân gốc **chưa xác định** (nghi do 2 người cùng team bấm gần như cùng lúc). Đã thêm cơ chế tự phục hồi: lỗi mở khung → lấy lại trạng thái và mở lại; nút "Mở lại câu hỏi" ở thanh bên; máy đến sau bay sang tỉnh đồng đội vừa tới. Nếu còn gặp: lấy lỗi F12 Console |
| Camera bay giật (FPS) | Đã tối ưu + **đã đo** (28/10, Edge headless GPU M4 Pro): camera bằng CSS transform + `will-change`, chuyển động trang trí có hạn — xem 5.2. Còn chờ thử tay trên MacBook 120 Hz (Safari chưa đo) |
| **Câu hỏi — đợt 2** | Soạn 306 → giữ 216, sửa 86, bỏ 4 → +302. Hạn mức tìm kiếm hết giữa chừng → **nhiều câu chỉ 1 nguồn / báo địa phương** (Thanh Hóa–Huế, Hưng Yên, Ninh Bình, Lai Châu, Đắk Lắk, Cà Mau). Thiếu so với mục tiêu 11 thường + 4 công thành: **thai-nguyen** (10 + 3), **quang-ninh** (11 + 3), **da-nang** (10 + 4). Chưa đạt "3 chủ đề × 2 câu" (chọn chủ đề ít lựa chọn): **lai-chau, lang-son, hai-phong, ninh-binh, nghe-an** |
| **204 câu cũ chưa có link nguồn** | Nằm trong `legacyUnsourced` của `questions.json`. Bổ sung nguồn ở session sau nếu muốn (theo quy trình `docs/question-sourcing/`) |
| **Câu hỏi — đợt 3** (30/10) | Workflow 34 trợ lý: soạn 413 → giữ 326, sửa 78, bỏ 9 → +404, tổng **910**. Mỗi câu ≥ 2 nguồn độc lập (≥ 1 chính thống), người kiểm chứng khác người soạn. **Thiếu ~110 câu** (hết hạn mức WebSearch): nặng ở son-la, dong-nai, ho-chi-minh, phu-tho, gia-lai, dong-thap, can-tho, ca-mau, tay-ninh. Còn: nhãn "(… cũ)" lộ đáp án 14 câu cũ; vài lời giải nhắc đáp án câu khác. Hạn mức WebSearch tính theo phiên hay tài khoản **chưa rõ** — mở phiên mới thử 1 lượt trước |
| 1.7 Chủ dự án duyệt câu hỏi | Chờ — `docs/questions-review.html` (910 câu, 706 có link nguồn), lọc "Câu mới (có link nguồn)" |
| 4 câu công thành mức Dễ (quang-ninh-s2, nghe-an-s1, dak-lak-s2, ho-chi-minh-s2) | Chấm lại theo % đúng sau tổng duyệt (7.9) |
| D2: màu miền Trung / Nam gần nhau | Xem trên máy chiếu thật lúc tổng duyệt |
| Khuyến nghị `export NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost` trong `~/.zshrc` | Chủ dự án tự làm |

---

## Mục lục

0. [Trạng thái & bàn giao](#0-trạng-thái--bàn-giao--đọc-trước-khi-mở-session-mới) — **đọc trước**
1. [Tổng quan](#1-tổng-quan)
2. [Giả định cần chốt](#2-giả-định-cần-chốt)
3. [Luật chơi chi tiết](#3-luật-chơi-chi-tiết)
4. [Kiến trúc kỹ thuật](#4-kiến-trúc-kỹ-thuật)
5. [Thiết kế hình ảnh & bản đồ](#5-thiết-kế-hình-ảnh--bản-đồ) — ✅ đã chốt (mục 5.10)
6. [Thiết kế dữ liệu (SQLite)](#6-thiết-kế-dữ-liệu-sqlite)
7. [Thiết kế API & realtime](#7-thiết-kế-api--realtime)
8. [Nguyên tắc bảo mật](#8-nguyên-tắc-bảo-mật)
9. [Các phase triển khai](#9-các-phase-triển-khai)
10. [Timeline tổng hợp](#10-timeline-tổng-hợp)
11. [Rủi ro & phương án dự phòng](#11-rủi-ro--phương-án-dự-phòng)
12. [Phụ lục](#12-phụ-lục)

---

## 1. Tổng quan

| Hạng mục | Nội dung |
|---|---|
| Concept | Các team chơi song song trên bản đồ 34 tỉnh/thành sau sáp nhập. Mỗi team chỉ thấy hành trình của mình, phần còn lại bị "sương mù" che |
| Mục tiêu | Vui, gắn kết, lan tỏa kiến thức văn hóa Việt + cập nhật bản đồ hành chính mới |
| Thiết bị | Mỗi team 1 laptop · 1 laptop nối máy chiếu · 1 laptop/điện thoại cho MC |
| Hình thức | Web app, truy cập qua trình duyệt |
| Hosting | Phát triển trên máy local → deploy **tạm thời** lên host → **gỡ xuống sau sự kiện** |
| Stack | Frontend: HTML/CSS/JS thuần (không thư viện) · Backend: Node.js built-in (`node:http`, `node:sqlite`…) · DB: SQLite (1 file) · Package manager: pnpm · **0 dependency** |
| Phiên bản Node | Cố định **v22.23.4** cho cả máy dev và host (`node:sqlite` còn ở trạng thái experimental, tránh lệch phiên bản) |
| Dependency | **JS thuần. Không thêm dependency khi chưa được cho phép** (xem nguyên tắc bắt buộc ở đầu file) |

---

## 2. Giả định cần chốt

Các giả định dưới đây đang được dùng để lập plan. **Sửa lại nếu khác.**

| # | Giả định | Giá trị tạm | Ảnh hưởng nếu đổi |
|---|---|---|---|
| A1 | Số team | 6 | Số tỉnh xuất phát, màu team, test tải |
| A2 | Thời lượng chơi | 45 phút | Số câu hỏi cần soạn, thời điểm đóng băng bảng điểm |
| A3 | Có thẻ bài | Có | Thêm logic + UI (khoảng +2 ngày) |
| A4 | Người soạn câu hỏi | Claude soạn, bạn duyệt | Thời gian Phase 1 |
| A5 | Số người/team | 5–10 | Không ảnh hưởng kỹ thuật |
| A6 | Người chơi ở đâu | Tất cả tại văn phòng | Có thể giới hạn truy cập theo IP văn phòng |
| A7 | Host | **VPS thuê ngoài** (quyết định 31/10) | Phase 6 – Deploy |
| A8 | Kiểu bản đồ | ✅ **Đã chốt: Bản đồ thật** (dữ liệu GeoJSON) | Mục 5 |
| A9 | Số thành phố trực thuộc TW | ✅ **9** — theo dữ liệu repo, chủ dự án đã tra cứu xác nhận (27/10/2026) | Bảng điểm, số thẻ bài rơi ra |
| A10 | Phong cách hình ảnh | ✅ **Hoạt hình** (kiểu Duolingo) — chốt 27/10/2026, có gì sửa sau | Mục 5.2, 5.10 |
| A11 | Font Nunito tự lưu trong project | ✅ Đã duyệt 27/10/2026 — `public/fonts/nunito.ttf` | Mục 5.2, 12.5 |

---

## 3. Luật chơi chi tiết

> **Từ ngữ hiển thị — bộ "Lữ hành" (chốt 28/10, có cả các bạn nhỏ chơi → tránh từ quân sự / bạo lực).** PLAN và code vẫn dùng tên luật cũ, **màn hình** dùng tên mới: Công thành → **Ghé thăm thử tài** (nhãn ngắn "Thử tài") · Đấu tay đôi → **So tài** · Cướp tỉnh → **thành chủ nhà mới** · Đội giữ tỉnh → **Chủ nhà** · Đội công thành → **Đoàn khách** · Khung phòng thủ → **Đón khách** · Bị đẩy lui → **được mời về** · Rút lui → **Quay lại** · Thẻ Trinh sát → **Ống nhòm** · Thẻ Phòng thủ → **Hàng rào** · Hành quân gấp → **Xe tốc hành** · Liều → **Mạo hiểm** · Mất tỉnh → **<tỉnh> đã đổi chủ** · Chiếm tỉnh → **Cắm cờ** · Bị khóa → **Nghỉ chân**. Icon công thành: ngôi nhà nhỏ (thay hai kiếm chéo). Chữ mới cũng phải theo bộ này.

> **Trang luật chơi cho người chơi** (28/10): `/rules` (`public/rules.html` + `rules.js` + `css/rules.css`) — 11 mục, mỗi mục có khung hoạt cảnh minh họa (CSS, chỉ chạy khi cuộn tới; máy giảm chuyển động thì đứng yên). Link ở trang vào phòng, thanh trên màn team và trang chủ phòng (mở tab mới). **Đổi luật ở mục 3 này thì sửa cả `rules.html`.**

### 3.0. Phòng chơi (Room) — chốt 27/10/2026

| Hạng mục | Quy tắc |
|---|---|
| Tạo phòng | **Ai cũng tạo được** tại trang `/` (tab "Tạo phòng"): tên phòng (≤ 40 ký tự), **số team 2–8**, thời lượng 10–90 phút (mặc định 45), **cho chọn chủ đề** (mặc định tắt), **đặt cược** (mặc định bật). Hai tùy chọn sau chủ phòng bật/tắt được bất cứ lúc nào trên trang chủ phòng (áp dụng từ lần tới tỉnh kế tiếp). Người tạo là **chủ phòng** (= MC của phòng đó) |
| Mã khi tạo | **Mã phòng** (6 ký tự, gửi người chơi; link `/?room=MÃ`) · **Mã chủ phòng** (8 ký tự, băm scrypt, **chỉ hiện 1 lần**, để đăng nhập lại trang chủ phòng) · **Mã màn chiếu** (6 ký tự, chủ phòng xem lại được) |
| Team | Tự đặt theo linh vật: Team Rồng, Lân, Rùa, Phượng, Hạc, Trâu, Voi, Hổ (theo thứ tự) |
| Vào phòng | Mã phòng → nhập tên → **chọn quê** (không bắt buộc, xem "Về quê" ở 3.3) → chọn team còn chỗ. **Tên không trùng trong phòng** (không phân biệt dấu/hoa thường). Tối đa **12 người/team**. Vào được cả khi đang chơi (đến muộn); phòng đã kết thúc thì không |
| Sảnh chờ "Bạn có biết?" (làm 29/10) | Lúc chờ bắt đầu, **màn chiếu + máy người chơi** chạy luân phiên **12 câu trong kho** (4 câu mỗi miền, xếp xen kẽ Bắc · Trung · Nam; chủ đề ẩm thực / đời sống / văn hóa / di sản, mức 1–2, có lời giải). Mỗi câu 12 giây: 6 giây đầu chỉ có câu hỏi ("Đoán thử xem"), 6 giây sau hiện **đáp án + lời giải**; mọi máy theo giờ server nên cùng một câu; màn chiếu nháy sóng tỉnh của câu. Chọn cố định theo mã phòng (băm, không ghi DB). **Các câu này không phát cho team trong phòng đó** (đáp án đã lộ; tỉnh hết câu khác mới lặp lại), cũng không dùng làm câu hỏi chung. Code: `public/shared/facts.js`, `lobbyFacts` trong `server/game/questions.js` |
| Chủ phòng sửa tên (làm 29/10) | Tên người chơi tự gõ nên **chủ phòng kiểm soát**: trang chủ phòng có nút **"Sửa"** cạnh mỗi thành viên (hộp đổi tên riêng, không dùng `prompt()`). Cùng chuẩn hóa + không trùng như lúc vào phòng. Tên cũ được thay ở mọi chỗ (danh sách thành viên, nhật ký team, nhật ký chủ phòng); máy người chơi báo "Chủ phòng đã đổi tên bạn thành …". Nhật ký chủ phòng ghi dòng sửa tên (chỉ tên mới); màn xem lại sau trận không có dòng này. Vào lại bằng tên mới nhận lại đúng chỗ. `POST /api/owner/rename { playerId, name }` |
| **Phòng chơi đơn** (làm 29/10) | Tạo phòng chọn **Theo team / Chơi đơn** (không đổi giữa trận; chơi đơn có tùy chọn Tem Tiên phong). Mỗi người là một **team ẩn 1 người** (`rooms.mode = 'solo'`, avatar chữ cái đầu, màu xoay vòng), tối đa 50 người; vào muộn thì xuất phát ngay. Tỉnh không thuộc riêng ai: bảng `stamps` thay `ownership`. Luật chi tiết + những gì khác bản đề xuất: `docs/solo-mode.md`; luật cho người chơi: `public/rules.html` mục 11. API thêm: `GET /api/journal` (sổ tay của chính mình) |
| **Phòng chơi đơn có sẵn** (làm 29/10) | 4 phòng chơi đơn luôn có sẵn (`RULES.presetRooms`: Phòng Sen, Mai, Đào, Trúc; 30 phút, bật Đặt cược + Tiên phong), hiện ở màn "Tham gia phòng" (tên, trạng thái, số người, đã có chủ phòng chưa — không có tên người chơi; tự cập nhật 10 giây). **Ai vào trước làm chủ phòng**: phiên người chơi đó có thêm quyền chủ phòng của phòng mình (nút **"Trang chủ phòng"** trên thanh trên mở `/admin.html` cùng phiên — vừa chơi vừa điều khiển). Chủ phòng rời / bị mời ra → người vào sớm nhất còn lại nhận quyền. Phòng kết thúc quá 30 phút (hoặc quá 24 giờ) thì làm mới (mã mới, sạch người). Tắt bằng `PRESET_ROOMS=0`. Cột `rooms.preset`, `rooms.host_player_id`; `GET /api/rooms/preset` |
| **Danh sách phòng đang mở** (làm 30/10) | Lúc tạo phòng chọn **Công khai** (mặc định) / **Riêng tư** (chốt 30/10). Riêng tư: không hiện ở đâu, phải có mã phòng mới vào. Phòng công khai hiện ở mục **"Phòng đang mở"** trên cột phải màn Tham gia, phía trên phòng có sẵn: tên, kiểu (team / chơi đơn), trạng thái, số người / sức chứa, thời lượng, nút Vào — không có tên người chơi; phòng kết thúc thì rời danh sách; mới tạo đứng trước. Màn Tham gia lấy cả hai danh sách bằng **một** lời gọi `GET /api/rooms/list` → `{ preset, open }` (tự làm mới 10 giây, hạn mức riêng 300 lượt/phút/IP để không ăn vào lượt vào phòng). Cột `rooms.listed` |
| **Bảng xếp hạng cá nhân cả sự kiện** (làm 30/10) | **Chỉ phòng chơi đơn** (chốt 30/10: phòng team giữ nguyên chỉ xếp hạng team — không gọi tên cá nhân). Phòng đơn kết thúc (hết giờ hoặc chủ phòng bấm Kết thúc) → ghi mỗi người một dòng (tên, màu, điểm, số tem) vào bảng `leaderboard`; bỏ người 0 tem 0 điểm; Chơi lại rồi kết thúc lần nữa = thêm một trận. **Cùng tên (bỏ dấu, hoa thường) ở nhiều phòng = một người**, **cộng dồn điểm + tem mọi trận** (chốt 31/10 — luật mỗi phòng do phòng đó quyết, không chuẩn hóa), tên + màu theo trận gần nhất, kèm số trận; bằng điểm: nhiều tem hơn, rồi ai đạt tổng đó trước; bằng điểm + bằng tem thì cùng hạng. **Giữ 7 ngày** (`RULES.leaderboardKeepMs`, không xóa theo phòng — phòng tự xóa sau 24 giờ), top 100 (`leaderboardSize`). Trang công khai **`/leaderboard`** (bục top 3, bảng, ô tìm tên, tự làm mới 30 giây; link ở màn vào phòng); **màn chiếu** phòng đơn sau trận có nút **"Xếp hạng sự kiện"** (top 10). `GET /api/leaderboard`. Muốn đổi tên xấu thì chủ phòng sửa tên **trước khi kết thúc** — đã ghi thì không sửa được |
| **Trang quản trị `/quan-tri`** (làm 31/10, mockup `mockup/admin.html`) | Chốt 31/10: **một vai Quản trị** (mọi tài khoản cùng quyền), mỗi người **một tài khoản** (tên đăng nhập + mật khẩu ≥ 12 ký tự, scrypt). Tài khoản đầu tiên tạo bằng **`pnpm run admin:create -- <tên> "<Tên hiển thị>"`** trên máy chủ (in mật khẩu tạm, không có trang đăng ký); chưa có tài khoản nào thì `/quan-tri` trả 404. Mật khẩu tạm phải đổi trước khi dùng (API trả `must-change`). Sai 5 lần liên tiếp → khóa tài khoản 15 phút; tên không tồn tại / sai mật khẩu cùng một thông báo. Phiên 8 giờ, cookie riêng `vnj_sysadmin`. **Làm đợt 1:** Tổng quan (số phòng, người chơi, kết nối realtime, lượt chơi đơn hôm nay, thao tác gần đây) · **Phòng** (mọi phòng kể cả riêng tư; tạo phòng; sửa tên / hiển thị / đặt cược / chọn chủ đề lúc nào cũng được, thời lượng + số câu mỗi tỉnh chỉ trước khi bắt đầu, kiểu phòng + số team không đổi; **xem mã phòng, mã màn chiếu, mã chủ phòng** — chốt 31/10: admin xem được mọi phòng cho tới khi phòng bị xóa; mã chủ phòng lưu thêm bản **mã hóa AES-256-GCM** `rooms.owner_key_sealed`, khóa ở `var/secret.key` hoặc `SECRET_KEY`; "Tạo mã chủ phòng mới" làm mã cũ + phiên chủ phòng cũ hết hiệu lực; **Điều khiển** = cấp phiên chủ phòng của phòng đó rồi mở `/admin.html?from=quan-tri` (đủ chức năng điều khiển trận, có nút "← Quản trị"); xóa phòng) · **Người chơi** (mọi phòng, đang trực tuyến, sửa tên, mời ra) · **Bảng xếp hạng** (đổi tên — trùng thì gộp, ẩn khỏi bảng công khai `leaderboard.hidden`, xóa) · **Tài khoản admin** (thêm → mật khẩu tạm, đặt lại mật khẩu, khóa / mở khóa — phiên người bị khóa hết hiệu lực ngay, không tự khóa mình) · **Nhật ký** (`admin_log`, giữ 30 ngày; xem mã phòng cũng ghi). **Đợt 2 (31/10):** **Câu hỏi** — sửa trực tiếp trong DB (chốt 31/10): lưới 34 tỉnh (số câu đang dùng / 30, số câu thiếu nguồn), lọc theo trạng thái duyệt / chủ đề / loại / số nguồn / tìm; trình sửa (nội dung, 2–4 lựa chọn + đáp án đúng, Đúng/Sai, tự điền nhiều cách viết, lời giải, link nguồn), kiểm tra như `data:check` (`server/question-rules.js`: lỗi chặn lưu, cảnh báo ≥ 2 nguồn / https / lộ đáp án / "(… cũ)"), trạng thái **Chờ duyệt / Cần sửa / Đã duyệt** (cột `questions.status`, thay việc duyệt ở `docs/questions-review.html`), số lần phát + % đúng + **mức đề xuất** theo 7.9 (≥ 3 lượt) có nút Áp dụng; thêm câu (mã tự đặt `<tỉnh>-NN` / `<tỉnh>-sN`); **ẩn** câu (`questions.hidden` — không phát cho phòng nào nữa, không ẩn được câu cuối của tỉnh); không đổi tỉnh / loại câu đã có. **"Xuất questions.json"** ra đúng định dạng file gốc (chưa sửa gì thì giống hệt từng byte; có `status` / `hidden` thì nạp lại giữ nguyên) — **phải xuất rồi thay `data/questions.json` trong git trước khi `db:reset`**. Lưu ý: kho câu sảnh chờ "Bạn có biết?" đọc lúc khởi động — ẩn câu thì khởi động lại server mới bỏ khỏi sảnh chờ. **Hệ thống** — số liệu trong bộ nhớ (chốt 31/10, khởi động lại thì mất): thời gian chạy, kết nối realtime, yêu cầu/phút 30 phút gần nhất, thời gian phản hồi (trung vị / 95% / chậm nhất), bộ nhớ, 50 lỗi máy chủ gần nhất (chỉ đường dẫn + thông báo lỗi), **ai đang bị chặn** vì gửi quá nhiều (15 phút) + nút **Bỏ chặn** (IP văn phòng chung), dung lượng DB, bản sao lưu + tải bản mới nhất. **Cài đặt** (bảng `settings`): bật/tắt cho mọi người tạo phòng (tắt: `POST /api/rooms` trả `create-off`, trang chủ báo ngay trên form; quản trị vẫn tạo được), bật/tắt phòng có sẵn, **thông báo chung** (dải vàng trên cùng trang chủ / màn chơi / màn chiếu / trang chủ phòng / bảng xếp hạng / luật, `shared/notice.js` hỏi `/api/notice` mỗi phút), **từ cấm** trong tên (so bỏ dấu, theo cả từ → gắn cờ ở Người chơi / Bảng xếp hạng / Tổng quan, không tự chặn), xóa mọi phòng đã xong, tải CSV bảng xếp hạng (có BOM cho Excel, chống công thức `=…`), tải questions.json, tải bản sao lưu. Tổng quan thêm mục **Cần xử lý** (tên có từ cấm, câu cần sửa, câu thiếu nguồn, câu chưa duyệt). **Chưa làm:** điều khiển trận ngay trong trang quản trị (đang mở trang chủ phòng); giới hạn số phòng / số người chỉnh trong trang. Code `server/sysadmin.js`, `public/quan-tri.html` + `sysadmin.js` + `css/sysadmin.css`, test `tests/sysadmin.test.js` |
| **Trang chủ dạng landing** (làm 30/10) | `/` (team.html `#entry`) theo `mockup/landing.html`: thanh trên cố định (Cách chơi / Kiểu phòng / Phòng đang mở / Bảng xếp hạng / Luật chơi + nút Vào chơi) → **hero** (tiêu đề, 2 câu giới thiệu, ô **"Có mã phòng?"** vào thẳng, số liệu, linh vật, **bản đồ minh họa** vẽ từ `/data/map-geo.json` — vài tỉnh có cờ, còn lại sương mù, nón lá nhảy; 3 bong bóng ví dụ, không phải dữ liệu thật) → Chơi trong 3 bước → Hai kiểu phòng → Không chỉ là đố vui → **khu Vào chơi `#play`** (màn vào phòng 2 cột cũ, giữ nguyên form) → chân trang. **Danh sách phòng** (cột phải, `mockup/room-list.html` kiểu A): một danh sách gọn, lọc **Tất cả / Theo team / Chơi đơn** (nhớ trên máy) + tìm tên; nhóm "Mọi người tạo" (đang chờ trước) rồi "Phòng có sẵn"; phòng team có hàng linh vật + số người từng team (team đủ 12 người mờ), phòng đơn có thanh số người; nút Vào / Đang chọn / Đầy / Đang làm mới. Link mời `/?room=MÃ`, lỗi phiên, vừa thoát phòng → cuộn xuống khu Vào chơi. `public/css/landing.css`; CSS thẻ phòng cũ (`.room*`) đã bỏ. Chụp Edge headless 1280px / 600px ổn (headless không thu hẹp được tới 390px) |
| **Chủ phòng chơi luôn** (làm 29/10) | Tạo phòng xong (cả phòng team lẫn phòng đơn) có nút **"Vào chơi luôn"**: người tạo phòng vào phòng như mọi người (nhập tên, chọn team) và **giữ quyền chủ phòng** — server thấy phiên chủ phòng của chính phòng đó lúc `/api/join` → ghi `rooms.host_player_id`; nút **"Chủ phòng ▾"** chỉ hiện trên máy người đó (đồng đội cùng team không có quyền) — mở **bảng điều khiển ngay trong màn chơi** (ngăn kéo bên phải, bản đồ vẫn chạy; `public/team/host.js`): Bắt đầu / Tạm dừng / Tiếp tục, Kết thúc và Chơi lại (bấm 2 lần trong 4 giây, không dùng `confirm()`), tung sự kiện, câu hỏi chung, mã phòng + mã màn chiếu + mở màn chiếu, link trang chủ phòng đầy đủ (sửa tên, mời ra, sửa điểm, thống kê). Khung câu hỏi chung trên máy chủ phòng có thêm "Công bố ngay" / "Tiếp tục trận". **Chuyển qua lại**: trang chủ phòng có nút xanh trên thanh trên — đang chơi thì **"← Quay lại chơi"**, chưa chơi thì **"Vào chơi"** (mở màn vào phòng với mã điền sẵn; vào xong vẫn giữ quyền chủ phòng); link "Trang chủ phòng đầy đủ" trong bảng chủ phòng mở cùng tab. Đổi team trước khi bắt đầu: phiên chủ phòng được trả lại, vào team khác vẫn giữ quyền. Mã chủ phòng vẫn dùng được để đăng nhập trang chủ phòng ở máy khác. Nút phụ "Chỉ mở trang chủ phòng" cho MC không chơi |
| **Màn ngoài 2 cột** (làm 29/10; 30/10 thành khu "Vào chơi" của trang landing) | Theo `mockup/entry.html` phương án A. Trái: tên game + linh vật, tab Tham gia (mã phòng → bước 2 tên / quê / chọn team) / Tạo phòng. Phải: tab Tham gia → **lưới thẻ phòng chơi đơn có sẵn** (trạng thái, thanh số người /50, thời lượng, có chủ phòng chưa, nút Vào; phòng đang chọn tô xanh; phòng đã kết thúc mờ "Đang làm mới"); tab Tạo phòng → **giải thích kiểu phòng đang chọn** bên trái (không bấm chọn ở cột phải), tạo xong → mã phòng / mã chủ phòng / mã màn chiếu. Màn hẹp (≤ 960px) 2 cột xếp chồng |
| **Điện thoại & máy tính bảng** (làm 29/10) | Theo `mockup/mobile.html`; CSS ở `public/css/mobile.css` (nạp cuối). Điểm gãy: **< 700px điện thoại**; 700–1099px dọc = máy tính bảng dọc; từ 1100px hoặc máy tính bảng ngang giữ bố cục máy tính. **Màn chơi điện thoại**: thanh trên một dòng (linh vật, tên, điểm, tỉnh/tem, đồng hồ, nút **≡**); bản đồ chiếm phần giữa, **chụm 2 ngón để phóng to** (`shared/map.js`); ngăn "Đang ở" ở đáy với nút các tỉnh đi được; **thanh tab dưới** Bản đồ / Thẻ bài (chấm đỏ số thẻ) / Đội (phòng đơn: Sổ tay) / Nhật ký; menu ≡ gom Chủ phòng, Sổ tay, Luật chơi, Âm thanh, Che màn hình, Thoát (`public/team/menu.js`). Mọi hộp thoại và bảng chủ phòng **trượt lên từ đáy**, rộng hết màn; khung câu hỏi cao tối đa 64% để camera đặt tỉnh vào phần trên (`dockReserve` → `focusOn({ reserveBottom })`). Màn che: "Chạm 2 lần để mở lại" trên máy cảm ứng. **Máy tính bảng dọc**: bản đồ trên, các thẻ 2 cột dưới, nút phụ vào ≡. **Màn ngoài**: tab dạng công tắc, phòng có sẵn mỗi phòng một dòng. **Trang chủ phòng điện thoại**: thanh trên cố định (tên, trạng thái, đồng hồ, mã phòng, mã màn chiếu), 4 tab Trận đấu / Team (gồm sửa điểm, thống kê) / Sự kiện (gồm diễn biến) / Bản đồ, nút Vào chơi · Màn chiếu · Thoát ở đáy. **Luật chơi**: đầu trang gọn, mục lục mờ mép phải và tự cuộn tới mục đang đọc. **Màn chiếu** giữ nguyên, màn đăng nhập nhắc mở trên máy tính khi màn < 900px |
| Đổi team / mất phiên | Trước khi bắt đầu: "Đổi team / rời phòng" rồi vào lại. Sau khi bắt đầu: vào lại bằng **đúng tên + đúng team cũ** thì nhận lại chỗ (đổi máy, mất cookie); tên đó ở team khác thì bị từ chối. **Bảo mật (30/10):** tên đó đang mở trang ở máy khác → từ chối ("đang chơi trên một máy khác"); vào lại bằng tên của **chủ phòng** chỉ được quyền người chơi (`sessions.no_host`) — người tạo phòng lấy lại quyền bằng mã chủ phòng; chủ phòng bấm **Thoát** thì nhả quyền (phòng có sẵn: người vào tiếp theo nhận) |
| Nhiều người một team | Mọi thành viên cùng thấy bản đồ, câu hỏi, kết quả realtime. **Ai thao tác trước được tính** (server xử lý tuần tự); người trả lời sau nhận "Đồng đội đã trả lời câu này trước bạn". Nhật ký team ghi tên người thao tác |
| Chủ phòng | Bắt đầu / tạm dừng / tiếp tục / kết thúc / chơi lại, sự kiện, sửa điểm, xem thành viên, **kick** người chơi (phiên + kết nối realtime bị đóng ngay) |
| **Phòng bị bỏ / treo** (chốt 31/10, `server/housekeeping.js`) | Theo dõi ai đang mở trang (kết nối realtime), số liệu trong bộ nhớ — khởi động lại server thì tính lại từ đầu. (1) Phòng tự tạo **chưa bắt đầu** mà không ai mở trang (kể cả trang chủ phòng) liên tục **30 phút** → tự xóa; phòng **quản trị tạo hộ** thì giữ (settings `keepRooms`). Phòng có sẵn có người vào rồi bỏ đó 30 phút → làm mới (mã mới); phòng có sẵn trống thì để nguyên. Phòng đang chơi không bị dọn (hết giờ tự kết thúc). (2) **Phòng có sẵn**: chủ phòng đóng trang / mất mạng quá **2 phút** → quyền chủ phòng chuyển cho người đang mở trang vào sớm nhất. (3) Phòng có sẵn đang chờ có **≥ 2 người đang mở trang** mà chủ phòng chưa bấm Bắt đầu sau **3 phút** → **tự bắt đầu** (màn chờ hiện "Trận tự bắt đầu sau m:ss…"; một người đóng trang thì hủy đếm, đếm lại từ đầu). (4) Mỗi trình duyệt giữ tối đa **3 phòng chưa kết thúc** do mình tạo (cookie ngẫu nhiên `vnj_creator`, 30 ngày; xóa cookie thì lách được nhưng vẫn vướng giới hạn 5 phòng/phút/IP) → lỗi `too-many-own`. `RULES.idleRoomMs / hostAwayMs / autoStartMs / maxRoomsPerCreator` |
| Nhiều phòng song song | Mỗi phòng là một trận độc lập (sở hữu tỉnh, đồng hồ, sự kiện, bản tin, màn chiếu riêng). Tối đa **50 phòng chưa kết thúc**. Phòng **tự xóa sau 24 giờ** kể từ lúc tạo |
| Chống spam | Tạo phòng ≤ 5 lần/phút/IP; tra mã phòng + vào phòng ≤ 150 lần/phút/IP (cả văn phòng chung 1 IP); đăng nhập chủ phòng / màn chiếu ≤ 10 lần/phút/IP; API sau đăng nhập giới hạn **theo phiên** (60 lần/10 giây) chứ không theo IP |

### 3.1. Bắt đầu
- Chủ phòng bấm **Bắt đầu** → đồng hồ chạy theo thời lượng của phòng.
- Mỗi team được gán ngẫu nhiên **1 tỉnh xuất phát bí mật**, không trùng nhau, rải đều 3 miền (ví dụ: 2 team miền Bắc, 2 miền Trung, 2 miền Nam), không phải thành phố trực thuộc TW. **Thứ tự miền và thứ tự team xáo mỗi trận** (sửa 29/10: trước đó team đầu luôn ở miền Bắc, phòng 2 team không ai ở miền Nam); trong cùng miền ưu tiên tỉnh **không giáp** tỉnh xuất phát của team khác.
- Tỉnh xuất phát được tính là đã chiếm (không cần trả lời).

### 3.2. Di chuyển
- Team đứng ở 1 tỉnh, được chọn đi sang **1 tỉnh giáp ranh**.
- Đến tỉnh mới → nhận **1 câu hỏi** về tỉnh đó.
- Không giới hạn lượt — các team chơi song song, ai nhanh thì đi được nhiều.
- Team có thể đi qua tỉnh của chính mình mà không cần trả lời.

### 3.3. Chiếm tỉnh
| Tình huống | Kết quả |
|---|---|
| Tỉnh trống, trả lời **đúng** | Chiếm tỉnh, cắm cờ màu team |
| **Bắt đầu trận** (chốt 28/10) | Chủ phòng bấm Bắt đầu → trận **chạy sau 3,5 giây** (`RULES.startCountdownMs`, mốc `startedAt` của server). Màn team và màn chiếu đếm ngược 3·2·1 theo đúng mốc đó (đồng bộ giờ server), "Bắt đầu!" hiện cùng lúc trên mọi máy dù nhận tin sớm hay muộn; mở / tải lại trang giữa chừng thì đếm tiếp phần còn lại. Trước mốc này server từ chối mọi thao tác của người chơi (`counting`) — không ai đi trước được. Đồng hồ trận tính từ mốc "Bắt đầu!" |
| **Chọn câu hỏi** (chốt 28/10) | Mỗi lần phát câu: chỉ lấy câu **team chưa gặp** ở tỉnh đó (kể cả câu đã thấy khi phòng thủ); trong số đó ưu tiên câu **ít ra nhất trong phòng** (các team ngồi gần nhau nhận câu khác nhau — đỡ nghe lỏm), rồi câu **ít được hỏi nhất từ trước tới giờ** (`questions.asked_count`, xoay vòng qua các trận — người chơi nhiều lần khó thuộc); bằng nhau thì bốc ngẫu nhiên. Hết câu chưa gặp thì cho lặp. Mô phỏng 20 trận × 6 team cùng tới một tỉnh: 0 trận có 2 team trùng câu (cách cũ ~81%), 11 câu được hỏi đều 10–11 lần. **Kho câu** (31/10): 910 câu, ~27 câu mỗi tỉnh (mục tiêu 22 thường + 8 công thành; còn vài tỉnh thiếu — xem §0.5) |
| Tỉnh trống, trả lời **sai** | Bị khóa 30 giây (vẫn đứng ở tỉnh đó), sau đó chọn: **"Trả lời lại ở <tỉnh>"** → nhận câu hỏi khác ngay tại chỗ (cùng luật như vừa tới tỉnh: phòng bật chọn chủ đề thì chọn chủ đề; không lặp câu đã gặp ở tỉnh này trừ khi hết câu), hoặc đi tỉnh khác. Trong lúc khóa tỉnh bị đội khác chiếm → "Trả lời lại" chuyển sang lựa chọn công thành (`POST /api/retry`, 28/10) |
| **Chọn chủ đề** (chốt 27/10) | Chủ phòng bật/tắt "Cho chọn chủ đề" (lúc tạo phòng hoặc bất kỳ lúc nào trên trang chủ phòng; mặc định **tắt** = ngẫu nhiên như cũ). Khi bật: tới tỉnh **trống** mà còn ≥ 2 chủ đề chưa gặp → khung chọn chủ đề (+ 🎲 Ngẫu nhiên); chọn xong mới phát câu, **đồng hồ tính từ lúc chọn**. Đang chọn thì không đi/rút lui được; "Bỏ qua" cùng luật bỏ qua câu. Câu công thành luôn ngẫu nhiên. Kho đã mở rộng lên ~27 câu/tỉnh (31/10) nên mỗi chủ đề thường có vài câu để bốc ngẫu nhiên |
| **Bỏ qua câu hỏi** (chốt 27/10) | Nút "Bỏ qua ✕" trong khung câu hỏi (bấm 2 lần): câu bị hủy và **không gặp lại**, team **lùi về tỉnh trước + khóa 10 giây cộng thời gian đã xem câu hỏi** (tối đa bằng khóa khi sai: 30 giây, công thành 45 giây — chờ gần hết giờ mới bỏ qua không có lợi); đã quá giờ thì tính như hết giờ; không lộ đáp án, không tính vào thống kê % đúng. Áp dụng cả câu công thành. Đang có câu hỏi thì **không Rút lui được** (tránh né câu hỏi không bị phạt) |
| **Số câu mỗi tỉnh** (chốt 30/10) | Lúc tạo phòng chọn **1–3 câu** (mặc định 1 = luật gốc; `rooms.quiz_count`, `RULES.quizCount`). Tỉnh trống phải trả lời **đúng đủ N câu** mới cắm cờ / nhận tem; đúng chưa đủ → khung kết quả "Đúng 1/3", nút **"Câu tiếp theo"** (= `POST /api/retry`, giờ câu sau tính từ lúc bấm). **Sai / hết giờ giữ tiến độ** (nghỉ chân như thường, rồi trả lời tiếp); **đi sang tỉnh khác thì mất**. Tỉnh bị đội khác cắm cờ trước → mất tiến độ (thành ghé thăm thử tài). **Điểm tỉnh giữ nguyên.** Mạo hiểm chọn 1 lần ở câu đầu (sai câu nào cũng nghỉ thêm); siêu tốc, câu vàng, trừ chậm **lấy trung bình** các câu; mỗi câu đúng vẫn tính chuỗi đúng. Tiến độ lưu `teams.progress` (JSON). **Giao diện (chốt 30/10, `mockup/quiz-steps.html` kiểu A + S1):** dòng tiến độ (vạch + "Câu 1/2 · đúng đủ 2 câu để cắm cờ") dưới tiêu đề khung chọn và khung câu hỏi; khung chọn tách hai mục "1 · Mức cược" / "2 · Chủ đề". Thử tài: xem "Cược số hiệp khi thử tài" |
| **Giờ trả lời** (chốt 27/10) | Câu thường **30 giây**, câu công thành **45 giây**, server bấm giờ. **Đồng hồ bắt đầu sau khi phát câu 1 giây** (30/10, `RULES.questionLeadMs` — camera bay tới tỉnh ~1 giây không ăn vào khoảng đủ điểm; áp dụng mọi câu kể cả đấu tay đôi; máy team đứng ở 00:30 trong giây đó). **15 giây đầu** (công thành 20 giây) được đủ điểm (29/10: nới từ 10/15 giây — giảm áp lực tốc độ, có thời gian đọc và bàn); sau đó **trừ dần đều đến 100% điểm tỉnh** lúc hết giờ — trừ **một lần vào điểm thưởng** khi chiếm được tỉnh (bị cướp lại vẫn giữ khoản trừ). **Hết giờ = trả lời sai** (khóa 30/45 giây, công thành bị đẩy về); server tự xử kể cả khi team không bấm gì, cho thêm 2 giây trễ mạng. Tạm dừng thì đồng hồ câu hỏi đứng yên |
| **Đặt cược** (chốt 28/10) | Phòng bật (mặc định khi tạo phòng): tới tỉnh **trống**, trước khi xem câu hỏi team chọn **"Chắc ăn"** (điểm thường) hoặc **"Liều"**: trả lời đúng và chiếm được tỉnh → **thưởng thêm 50% điểm tỉnh**; sai / hết giờ → **khóa thêm 30 giây** (thường: 60 giây). Gộp chung khung với "chọn chủ đề" (phòng bật cả hai: chọn mức cược rồi bấm chủ đề). Đồng hồ trả lời chỉ chạy sau khi chọn. Không áp dụng cho câu công thành. Câu "Liều" có nhãn đỏ "Liều +50%" |
| **Cả team cùng chốt đáp án** (chốt 28/10) | Câu trắc nghiệm / Đúng-Sai: bấm một đáp án là **bỏ phiếu** — đồng đội thấy tên người chọn trên từng đáp án (đổi ý thoải mái). Khi **mọi thành viên đang mở trang cùng chọn một đáp án → tự chốt**; hoặc **bất kỳ ai bấm "Chốt đáp án"** (phím Enter) thì nộp đáp án người đó đang chọn. Team chỉ 1 người đang mở trang thì bấm là nộp ngay. Đồng hồ vẫn chạy trong lúc bàn — bàn lâu thì bị trừ điểm chậm như thường. Câu tự điền: ai bấm "Trả lời" thì nộp luôn |
| **Về quê** (chốt 29/10) | Lúc vào phòng chọn **quê** trong 34 tỉnh (danh sách, không ô tự gõ; không bắt buộc). Trước khi bắt đầu đổi được (vào lại); **sau khi bắt đầu khóa** — ai chưa chọn thì chọn được một lần. Team **cắm cờ** (tỉnh trống hoặc thử tài thành công) ở tỉnh quê của một thành viên → **+50** (`RULES.homeBonus`), thưởng tích lũy, **mỗi tỉnh 1 lần**, **tối đa 3 tỉnh/team** (`RULES.homeMax`; nhiều người cùng quê = 1 tỉnh). **Chỉ đồng đội thấy quê**: ghim hồng trên bản đồ team (cả tỉnh còn sương mù), tên trong danh sách thành viên, "Về quê N/3" trên thanh trên, dòng thưởng trong khung kết quả + nhật ký team. Màn chiếu / bản tin / tua lại / team khác không có gì về quê; trang chủ phòng chỉ thấy "về quê ở <tỉnh>: +50", không tên. Nguyên tắc tránh phân biệt vùng miền: xem 0.4 |
| **Siêu tốc** (chốt 28/10) | Trả lời **đúng trong 5 giây đầu** (tính từ lúc hiện câu) và chiếm được tỉnh → **thưởng thêm 10% điểm tỉnh** (29/10: giảm từ 20% — bớt áp lực tốc độ). Áp dụng cả câu thường lẫn công thành |
| **"Đã từng / Muốn thử"** (làm 29/10) | Sau câu **trả lời đúng** về **ẩm thực** ("Bạn đã từng ăn đặc sản X chưa?" → Đã từng ăn / Muốn thử) hoặc **di sản** ("Bạn đã từng đến X chưa?" → Đã từng đến / Muốn đến), khung kết quả có 2 nút — **không bắt buộc**, mỗi người tự bấm, bấm lại để bỏ, đổi ý được. Chỉ hiện **số đếm gộp cả phòng** ("Cả phòng: 3 người đã từng ăn · 5 người muốn thử"), không ai thấy ai chọn gì, không theo team; không đưa lên màn chiếu lúc đang chơi (lộ vị trí đội). Server chỉ nhận cho tỉnh mà team của người đó đã trả lời đúng câu chủ đề tương ứng. Bảng `reactions`; chơi lại thì xóa |
| **Tổng kết "Hành trình văn hóa"** (làm 29/10) | Sau khi kết thúc, dưới bảng xếp hạng (máy team, trang chủ phòng) và nút **"Hành trình văn hóa"** trên màn chiếu (MC bấm để chiếu): số câu cả phòng đã trả lời + % đúng, số tỉnh cả phòng đã ghé, số lượt Đã từng / Muốn thử; **2 câu khó nhất trận** (tỉ lệ đúng thấp nhất, có đáp án + lời giải — trận đã xong mới công bố); các **câu hỏi chung** và % cả phòng đúng; top 3 tỉnh theo Muốn thử / Đã từng ăn / Muốn đến / Đã từng đến; **cặp đội so tài nhiều nhất** (≥ 2 lần — lúc này mới nêu tên đội). Chỉ số gộp, không tên người, không so sánh miền. `culture` trong `/api/replay`, `public/shared/culture.js` |
| **Chuỗi đúng** (chốt 28/10) | Đếm số câu trả lời **đúng liên tiếp** của team (cả câu thường lẫn công thành; đúng mà tỉnh vừa bị đội khác chiếm trước vẫn tính). Cứ đủ **3 câu** (3, 6, 9…) → nhận **1 thẻ trợ giúp ngẫu nhiên** (50:50 hoặc Thêm giờ, xem 3.6); khay đã đủ 3 thẻ thì nhận **+50 điểm thưởng** thay thẻ. **Trả lời sai, hết giờ hoặc bỏ qua → chuỗi về 0** (rút lui, đi tỉnh của mình, dùng thẻ không ảnh hưởng). Thanh trạng thái hiện "🔥 N câu liền"; màn chiếu đưa tin ẩn danh "Một đội vừa đúng 3 câu liền!" (không nêu tỉnh, không nêu đội) |
| Tỉnh **đã có chủ** (team khác) | Hiện "Tỉnh này đã có chủ" (không nói là ai). Chọn **Công thành** hoặc **Rút lui** |
| **Cược số hiệp khi thử tài** (chốt 30/10) | Bấm Thử tài → **chưa phát câu**: cả hai đội **cược kín 1–3 hiệp trong 10 giây** (`RULES.siegeBetMs`, khung cược `public/team/siege-bet.js`; ai trong team bấm trước thì tính, cược rồi không đổi). Số hiệp = **cược lớn hơn**; một bên không cược thì theo bên kia; không ai cược: 1. Cả hai đã cược → vào đấu ngay; không thì hết hạn (server `settleSiegeBets` mỗi giây). Đội công thành đứng chờ (`choosing_at`), "Thôi thử tài" = bỏ qua (lùi về, nghỉ 10 giây, chủ nhà được miễn 60 giây). **Thắng đa số**: đoàn khách cần 1/1, **2/2**, 2/3 hiệp — **hòa (cược 2, 1–1) thì chủ nhà giữ tỉnh** (chốt 30/10; nếu đấu thêm câu quyết định thì cược 2 = cược 3). Mỗi hiệp: luật đấu tay đôi dưới đây — đoàn khách đúng trước chủ nhà thì thắng hiệp; chủ nhà đúng trước, hoặc đoàn khách sai / hết giờ, thì chủ nhà thắng hiệp. Ngã ngũ sớm thì dừng. Giữa hai hiệp câu mới phát sớm `duelRoundGapMs` (2,5 giây, chưa tính giờ) — hai bên cùng mở câu lúc giờ bắt đầu. **Đấu 1 hiệp: mọi luật cũ giữ nguyên.** Đấu nhiều hiệp: bên thắng **+50 × số hiệp** (thắng hiệp lẻ không thưởng), đoàn khách thua → mời về + nghỉ chân **30 giây × số hiệp** (hiệp cuối là câu vàng: ×2, chốt 31/10); bỏ qua giữa trận = bỏ cuộc. Cột `duels.phase / bet_until / bet_att / bet_def / rounds / round_no / att_wins / def_wins`; `POST /api/siege-bet { duelId, rounds }`; `/api/defend` thêm `round` |
| **Đấu tay đôi khi công thành** (chốt 28/10) | Bấm Công thành → **đội giữ tỉnh nhận cùng câu hỏi ngay lúc đó** (thứ tự đáp án xáo riêng, cùng hạn chót 45 giây): khung "Phòng thủ" bật lên ưu tiên trước mọi khung khác (camera bay tới tỉnh, có âm báo; đồng hồ câu của chính họ vẫn chạy). Đội giữ tỉnh **không biết đội nào** đang công thành. **Ai trả lời đúng trước thắng.** Phòng thủ không bỏ phiếu — ai trong team bấm trước thì tính; có thể "Bỏ qua" lượt phòng thủ. Khung câu của đội công thành có nhãn "Đấu tay đôi". **Thanh kéo co** trên khung câu của cả hai bên (đội mình ← dây → huy hiệu "?" — chỉ đội mình hiện linh vật, đối thủ luôn ẩn danh). **Đội giữ tỉnh trả lời sai → đội công thành được báo "Đối thủ trượt rồi!"** (nút dây trượt về phía mình; không nêu đội, không lộ đáp án — `pendingQuestion.duel.foeMissed`, chốt 28/10); ngược lại đội công thành sai thì đội giữ tỉnh thấy "Đội lạ trượt rồi! Đúng vẫn +50" |
| Công thành, trả lời **đúng** câu khó (trước đội giữ tỉnh) | Cướp được tỉnh, +50 điểm thưởng. Chủ cũ: khung phòng thủ đóng, nhận thông báo "Bạn vừa mất <tỉnh>!" |
| Đội giữ tỉnh trả lời **đúng trước** | **Giữ tỉnh, +50 điểm thưởng.** Đội công thành mất câu, **bị đẩy về tỉnh trước + khóa 30 giây** (không tính là trả lời sai: không mất chuỗi đúng, không vào thống kê). Màn chiếu: "<tỉnh> đứng vững trước đợt công thành!" |
| Đội giữ tỉnh trả lời **sai** | Không bị phạt (không khóa); hết quyền phòng thủ lượt này — chỉ còn trông vào đội công thành trả lời sai |
| **Chống bị công thành liên tục** (chốt 28/10) | (1) Lượt công thành kết thúc mà tỉnh **không đổi chủ** (đội giữ tỉnh đúng trước, hoặc đội công thành sai / hết giờ / bỏ qua) → tỉnh **được miễn công thành 60 giây**: đội tới tỉnh thấy "Tỉnh vừa đứng vững — chờ N giây", nút Công thành bị khóa (không lộ đội nào giữ). Tỉnh bị cướp thì không có thời gian miễn. (2) **Mỗi tỉnh chỉ một lượt công thành tại một thời điểm**: đội thứ hai tới thấy "Một đội khác đang công thành tỉnh này — chờ một chút". (3) Bị đẩy lui khóa 30 giây (không phải 15) để công thành có giá. Kết quả: mỗi tỉnh bị làm phiền tối đa ~1 lần/phút; team giữ nhiều tỉnh bị đánh cùng lúc thì các khung phòng thủ hiện lần lượt. Tạm dừng thì thời gian miễn cũng đứng yên |
| Công thành, trả lời **sai** / hết giờ / bỏ qua | Sai / hết giờ: khóa 45 giây; bỏ qua: khóa 10 giây + thời gian đã xem câu (tối đa 45 giây); "Thôi thử tài" lúc đang cược: khóa 10 giây. Cả ba đều bị đẩy về tỉnh vừa đi tới. Đội giữ tỉnh được báo "Giữ được <tỉnh>"; **khung phòng thủ vẫn mở tới hết giờ** (dòng báo chuyển xanh "Đội công thành đã trả lời sai — trả lời đúng vẫn được +50"): trả lời đúng → +50, sai / bỏ qua → không sao. Để +50 không phụ thuộc đội công thành sai nhanh hay chậm (chốt 28/10, kể cả khi đội giữ tỉnh đang bị khóa) |
| Tỉnh đang được **Phòng thủ** | Không thể công thành, chỉ thấy "Tỉnh đang được phòng thủ" |

### 3.4. Sương mù (fog of war)
- Team **chỉ thấy**: tỉnh của mình, vị trí hiện tại và các tỉnh **đã ghé** (biết "của mình / có chủ / trống", không biết của team nào; trạng thái cập nhật theo thời gian thực). Tỉnh giáp ranh chỉ được tô viền để chọn đi, không lộ có chủ hay chưa.
- Các tỉnh còn lại hiển thị xám, **không biết có chủ hay chưa** cho đến khi đặt chân đến.
- Sương mù được thực hiện **ở server** (server không gửi dữ liệu team khác về client), không phải chỉ che bằng CSS.

### 3.5. Điểm số
Điểm cuối cùng = **điểm các tỉnh đang sở hữu lúc hết giờ** + **điểm thưởng tích lũy**.

| Hạng mục | Điểm | Ghi chú |
|---|---|---|
| Tỉnh giữ nguyên (không sáp nhập) | 100 | Câu dễ–trung bình |
| Tỉnh sáp nhập từ 2 tỉnh cũ | 150 | |
| Tỉnh sáp nhập từ 3 tỉnh cũ trở lên | 200 | Câu khó hơn |
| Thành phố trực thuộc TW (9) | 300 | Câu khó, rơi thẻ bài |
| Cướp tỉnh thành công | +50 | Thưởng tích lũy, không mất khi bị cướp lại |
| Bộ sưu tập (ví dụ: 3 tỉnh có di sản UNESCO) | +300 | **Tính theo tỉnh đang giữ** — mất tỉnh có thể mất khoản này (chốt 31/10) |
| Xuyên 3 miền (có ít nhất 1 tỉnh mỗi miền) | +500 | **Tính theo tỉnh đang giữ**, không cộng nhiều lần (chốt 31/10) |
| Chiếm tỉnh trong sự kiện "Lễ hội" | +100 | Thưởng tích lũy |
| Câu hỏi vàng trả lời đúng (chiếm được tỉnh) | + điểm tỉnh (= ×2) | Thưởng tích lũy, xem 3.7 |
| Chuỗi 3 câu đúng khi khay thẻ đã đầy | +50 | Thưởng tích lũy, xem "Chuỗi đúng" ở 3.3 |
| Về quê: cắm cờ ở tỉnh quê của một thành viên | +50 | Thưởng tích lũy, mỗi tỉnh 1 lần, tối đa 3 tỉnh/team — xem "Về quê" ở 3.3 |
| Câu hỏi chung cả phòng: cả phòng đúng ≥ 70% | +100 cho **mọi team** | Thưởng tích lũy, xem 3.7 |
| Phòng thủ thành công (đấu tay đôi) | +50 | Thưởng tích lũy, xem "Đấu tay đôi" ở 3.3 |
| "Liều" trả lời đúng (chiếm được tỉnh) | +50% điểm tỉnh | Thưởng tích lũy, xem "Đặt cược" ở 3.3 |
| Siêu tốc: đúng trong 5 giây đầu (chiếm được tỉnh) | +10% điểm tỉnh | Thưởng tích lũy |
| Trả lời chậm | −0 → −100% điểm tỉnh | Trừ vào thưởng tích lũy, xem "Giờ trả lời" ở 3.3 |

> Các khoản thưởng theo câu **cộng dồn**, mỗi khoản tính trên điểm tỉnh gốc. Ví dụ tỉnh 300 điểm, câu vàng + Liều + siêu tốc: 300 (tỉnh) + 300 (vàng) + 150 (Liều) + 30 (siêu tốc) = 780. Khóa khi sai cũng cộng: câu vàng ×2, Liều +30 giây (câu vàng + Liều sai: 60 + 30 = 90 giây).

> Vì điểm tỉnh tính theo **chủ sở hữu lúc hết giờ**, việc cướp tỉnh ở phút cuối tạo kịch tính.
>
> **Bằng điểm (chốt 27/10/2026):** team có **tổng thời gian trả lời ít hơn** xếp trên. Mỗi câu tính từ lúc hiện câu hỏi tới lúc bấm đáp án (gồm câu sai và câu bỏ qua; hết giờ tính đủ 30/45 giây; thời gian chọn chủ đề không tính). Thời gian **không** cộng/trừ vào điểm — chỉ dùng phân hạng. Hiện ở bảng điểm màn chiếu, trang chủ phòng và bảng tổng kết (cột "⏱ Thời gian").
>
> **9 thành phố trực thuộc TW:** Hà Nội, Hải Phòng, Huế, Đà Nẵng, TP. Hồ Chí Minh, Cần Thơ, Quảng Ninh, Bắc Ninh, Đồng Nai — lấy từ trường `isCity` trong `data/map-geo.json` (repo v5.2.0), chủ dự án đã tra cứu xác nhận ngày 27/10/2026.

### 3.6. Thẻ bài
- Nhận thẻ: chiếm được **thành phố trực thuộc TW** → 1 thẻ ngẫu nhiên trong **5 loại** dưới đây; **đúng 3 câu liên tiếp** → 1 **thẻ trợ giúp** ngẫu nhiên (chốt 28/10).
- Mỗi team giữ tối đa **3 thẻ** (khay đầy: thành phố không rơi thẻ; chuỗi đúng đổi thành +50 điểm).
- Thẻ dùng một lần. Mọi thành viên trong team cùng thấy và cùng dùng được khay thẻ.

| Thẻ | Loại | Hiệu ứng | Dùng khi |
|---|---|---|---|
| 🔭 Trinh sát | Chiến thuật | Nhìn xuyên sương mù của 1 miền trong 10 giây (thấy tỉnh nào đã có chủ, không thấy là team nào) | Bất cứ lúc nào đang chơi |
| 🛡️ Phòng thủ | Chiến thuật | Khóa 1 tỉnh của mình trong 5 phút, không ai công thành được | Bất cứ lúc nào đang chơi |
| ⚡ Hành quân gấp | Chiến thuật | Lượt di chuyển kế tiếp được đi xa 2 tỉnh | Bất cứ lúc nào đang chơi |
| **50:50** | Trợ giúp | Bỏ **2 đáp án sai** của câu trắc nghiệm đang trả lời (server chọn; vẫn không lộ đáp án đúng). Mỗi câu dùng 1 lần; không dùng cho câu Đúng/Sai hay câu tự điền | Trong khung câu hỏi |
| **Thêm giờ** | Trợ giúp | Câu đang trả lời được **+15 giây** — cả hạn chót lẫn khoảng được đủ điểm (câu thường: đủ điểm 30 giây, hết giờ 45 giây). Mỗi câu dùng 1 lần | Trong khung câu hỏi |

> Thẻ trợ giúp hiện thành nút ngay trong khung câu hỏi (chỉ hiện thẻ dùng được cho câu đó). Một người dùng thì đồng đội thấy ngay (2 đáp án bị gạch / đồng hồ cộng giờ). Dùng thẻ có thể kết hợp: 50:50 + Thêm giờ trên cùng một câu.

### 3.7. Sự kiện ngẫu nhiên (MC kích hoạt)
| Sự kiện | Hiệu ứng | Thời gian |
|---|---|---|
| 🎉 Lễ hội miền X | Chiếm tỉnh ở miền X được +100 | 5 phút |
| 🌪️ Bão miền X | Không đi từ miền khác vào miền X; team đang ở trong miền X vẫn đi lại được (chốt 31/10 — trước đó bị đứng im 3 phút) | 3 phút |
| 🪙 **Câu hỏi vàng** (chốt 28/10) | **Cả bản đồ, không theo miền.** Mọi câu hỏi **phát ra trong lúc sự kiện** (câu thường và công thành) là câu vàng: trả lời đúng và chiếm được tỉnh → **thưởng thêm bằng điểm tỉnh (×2)**; trả lời sai / hết giờ → **khóa gấp đôi** (60 giây, công thành 90 giây). Câu đã phát trước sự kiện vẫn tính thường; câu vàng phát ra sát giờ hết sự kiện vẫn giữ luật vàng tới khi trả lời xong. Khung câu hỏi có nhãn "Câu hỏi vàng ×2" và viền vàng | 2 phút |
| 📢 Tin đồn | Bản tin công bố số tỉnh của team dẫn đầu (không nêu tên). **Khóa khi bảng điểm đã đóng băng** (chốt 31/10 — không lộ bảng điểm ẩn) | Tức thì |
| ❓ **Câu hỏi chung cả phòng** (làm 29/10) | **Trận tạm dừng** (khóa, giờ câu đang chờ… dời lại như tạm dừng thường). Server chọn 1 câu trắc nghiệm mức 1–2 chủ đề ẩm thực / đời sống / văn hóa, chưa ra trong phòng (câu đã ra không phát lại cho team). **Mỗi người chọn trên máy mình**, đổi được tới hết giờ; không tính tốc độ. Màn chiếu và mọi máy chỉ thấy **số người đã chọn**; hết giờ (hoặc MC bấm "Công bố ngay") thì công bố **tỉ lệ chọn từng đáp án + đáp án đúng + lời giải**. Cả phòng đúng **≥ 70%** (trong số người đã chọn) → **mọi team +100**. Chỉ có số gộp: không ai bị nêu tên, không chia theo team (khuyến khích bàn với cả team khác). MC dẫn 1–2 phút rồi bấm "Tiếp tục trận" (chưa công bố thì công bố luôn). Code: `server/game/shared.js`, `public/shared/shared-q.js`, `public/team/shared.js` | 30 giây + MC dẫn |

> Câu hỏi chung cả phòng không phải sự kiện có thời hạn (không thay sự kiện đang chạy); nút riêng ở trang chủ phòng, chỉ bấm được khi trận đang chạy.
> Chỉ có **một sự kiện có thời hạn** tại một thời điểm (Lễ hội / Bão / Câu hỏi vàng); tung sự kiện mới thì thay sự kiện cũ. Trang chủ phòng: chọn loại sự kiện (+ miền với Lễ hội / Bão) rồi bấm "Tung sự kiện".

### 3.8. Màn chiếu chung
- Đồng hồ lớn + bản tin ẩn danh chạy chữ: "Một đội vừa chiếm Đà Nẵng!", "Huế vừa đổi chủ!".
- **Khung "Diễn biến mới nhất"** (30/10): góc trái dưới bản đồ, 5 tin gần nhất (icon theo loại tin, "vừa xong / N giây trước"), tin mới nảy vào từ trên, tin cũ nhạt dần. Cùng nội dung ẩn danh với bản tin chạy chữ (`news()` — thêm trường `sub` cho loại sự kiện). Chỉ hiện lúc đang chơi; sảnh chờ, tạm dừng, câu hỏi chung, cuối trận thì ẩn.
- **10 phút cuối: đóng băng bảng điểm** ("Bảng điểm đã đóng băng"). Trận ngắn: tối đa **1/3 thời lượng** (chốt 31/10 — phòng 10 phút trước đó bị đóng băng từ đầu).
- Hết giờ → **màn công bố**: tua lại hành trình từng team trên bản đồ → lộ bảng xếp hạng.

---

## 4. Kiến trúc kỹ thuật

### 4.1. Sơ đồ

```
Môi trường DEV (máy bạn)
  Trình duyệt ──► Node :3000 (bind 127.0.0.1) ──► var/game.db (file SQLite)

Môi trường HOST tạm thời
  Laptop team / Máy chiếu / MC
         │ HTTPS 443
         ▼
  Reverse proxy (Nginx/Caddy) ── TLS Let's Encrypt, giới hạn IP, rate limit
         │ http 127.0.0.1:3000
         ▼
  Node server (chỉ module built-in)
         │ node:sqlite (gọi trực tiếp, không qua mạng)
         ▼
  var/game.db (file SQLite, không có port, không có user DB)
```

### 4.2. Cấu trúc thư mục (thực tế, cập nhật 27/10)

```
vn-journey/
├── PLAN.md                   # tài liệu này — đọc mục 0 trước
├── package.json              # 0 dependency; scripts: dev, start, data:check, review:build, db:init, db:reset, test
├── .node-version             # 22.23.4
├── .env.example              # mẫu biến môi trường (sao chép thành .env, KHÔNG commit)
├── .gitignore                # .env, var/, node_modules, mockup/.v*.html
├── server/
│   ├── index.js              # khởi động http server (127.0.0.1), tick 1s, sao lưu định kỳ
│   ├── app.js                # bảng định tuyến API, phân quyền, rate limit, broadcast SSE
│   ├── config.js             # đọc biến môi trường; hàm sinh mã ngẫu nhiên
│   ├── db.js                 # mở node:sqlite, transaction, tạo bảng + nạp dữ liệu (seedDatabase), backup
│   ├── auth.js               # mã chủ phòng (scrypt), phiên theo phòng (token 32 byte, lưu SHA-256), so sánh an toàn
│   ├── game.js               # điểm vào luật chơi: createGame() ghép các phần trong game/ (API không đổi)
│   ├── game/                 # luật chơi tách theo phần (28/10)
│   │   ├── rules.js          # hằng số luật, màu team, GameError, chuẩn hóa chữ
│   │   ├── data.js           # nạp tỉnh / giáp ranh / bộ sưu tập + câu lệnh SQL dùng chung
│   │   ├── rooms.js          # tạo / tìm / vào phòng, dọn phòng, hết hạn câu hỏi, thống kê câu hỏi
│   │   ├── room.js           # phạm vi một phòng: ghép questions + actions + views + owner
│   │   ├── questions.js      # chọn câu, xáo đáp án, chấm, lưu kết quả
│   │   ├── actions.js        # hành động team: đi, chọn chủ đề, công thành, rút lui, trả lời, bỏ qua, dùng thẻ
│   │   ├── views.js          # dữ liệu theo quyền: team / màn chiếu / chủ phòng / tua lại, bảng điểm
│   │   └── owner.js          # chủ phòng: bắt đầu / tạm dừng / kết thúc / chơi lại, sự kiện, sửa điểm, kick
│   ├── sse.js                # kết nối realtime, gửi dữ liệu theo quyền, heartbeat 15s
│   ├── static.js             # phục vụ file tĩnh theo whitelist cố định
│   └── security.js           # header bảo mật, đọc body ≤ 10KB, cookie, kiểm tra Origin, rate limiter
├── public/                   # giao diện (mọi file phải có trong whitelist server/static.js)
│   ├── team.html / team.js   # màn chơi (/): team.js nhận trạng thái từ server + phím tắt + khởi động
│   ├── team/                 # phần còn lại của màn team, tách theo chức năng (28/10)
│   │   ├── state.js          # trạng thái dùng chung (object `state`) + phép kiểm tra: đang chơi, bị khóa, đi được…
│   │   ├── entry.js          # vào phòng / tạo phòng / thoát, mở bản đồ + kết nối realtime
│   │   ├── render.js         # vẽ bản đồ theo trạng thái, cột phải, lớp phủ, đồng hồ
│   │   ├── actions.js        # đi tới tỉnh, công thành, rút lui
│   │   ├── dialogs.js        # mở / đóng hộp thoại (khung câu hỏi neo phải)
│   │   ├── question.js       # câu hỏi, trả lời (hiệu ứng đúng / sai), bỏ qua, kết quả, chọn chủ đề
│   │   ├── cards.js          # thẻ bài + hiệu ứng lật thẻ
│   │   ├── final.js          # tổng kết khi hết trận
│   │   └── notify.js         # thông báo, nhật ký team, cảnh báo mất tỉnh
│   ├── admin.html / admin.js # trang chủ phòng (MC)
│   ├── screen.html / screen.js # màn chiếu: sảnh chờ, bảng điểm, bản tin, tua lại + công bố + pháo hoa
│   ├── style.css             # điểm vào CSS: @import các file trong css/ theo ĐÚNG thứ tự (phần sau ghi đè phần trước)
│   ├── css/                  # base (màu, nút, thẻ) → team (bố cục, hộp thoại) → map (SVG) → pages (chủ phòng, màn chiếu,
│   │                         #   tổng kết) → play (trong trận) → hand (chất vẽ tay) → motion (chuyển động, mây)
│   ├── fonts/                # nunito.ttf + OFL-Nunito.txt (giấy phép; không phục vụ)
│   └── shared/
│       ├── map.js            # bản đồ thật dùng chung: dựng lớp SVG, render trạng thái, nhãn chống chồng, khối nổi, camera
│       ├── map/              # phần tách ra của bản đồ: assets (dữ liệu tĩnh, <defs>, mây), geometry (hình học, SVG),
│       │                     #   camera-path (đường bay van Wijk), effects (hiệu ứng), tooltip
│       ├── fx.js             # hiệu ứng chuyển động dùng chung (thông báo, đếm ngược, biển sự kiện, lật thẻ…)
│       ├── dom.js            # $, el, button dùng chung 3 màn
│       ├── events.js         # chữ cho sự kiện MC tung (Lễ hội / Bão / Câu hỏi vàng) dùng chung 3 màn
│       ├── select.js         # ô chọn sticker thay danh sách xổ xuống của hệ điều hành (<select> gốc vẫn là nguồn dữ liệu)
│       ├── icons.js          # bộ icon tự vẽ (sticker run nét)
│       ├── api.js            # gọi API + SSE tự kết nối lại (?view=team|screen|owner), đồng hồ theo giờ server
│       ├── sound.js          # âm thanh Web Audio tự tổng hợp
│       ├── mascots.js        # 8 icon linh vật SVG
│       └── results.js        # màn tổng kết dùng chung (bục top 3 + bảng xếp hạng)
├── db/
│   └── schema.sql            # schema SQLite — NGUỒN CHUẨN
├── data/
│   ├── provinces.json        # 34 tỉnh: sáp nhập, trung tâm hành chính, điểm, 9 TP trực thuộc TW, 6 bộ sưu tập
│   ├── map-geo.json          # hình tỉnh + đảo + giáp ranh (sinh bởi build-map.mjs) — được phục vụ cho client
│   └── questions.json        # 506 câu (có đáp án — KHÔNG được phục vụ cho client); câu mới có `sources`, 204 câu cũ trong `legacyUnsourced`
├── scripts/
│   ├── build-map.mjs         # GeoJSON → data/map-geo.json (chiếu, đơn giản hóa, giáp ranh)
│   ├── validate-data.mjs     # kiểm tra dữ liệu tỉnh + câu hỏi (pnpm run data:check) — câu mới thiếu nguồn = lỗi
│   ├── build-review.mjs      # dựng lại docs/questions-review.html (pnpm run review:build)
│   ├── merge-questions.mjs   # gộp câu mới đã kiểm chứng chéo vào questions.json (docs/question-sourcing/)
│   ├── init-db.mjs           # tạo var/game.db (pnpm run db:init / db:reset)
│   ├── recalibrate-levels.mjs # (CHƯA LÀM — bước 7.9)
│   └── simulate-teams.js     # (CHƯA LÀM — bước 7.3, chỉ chạy vào localhost)
├── tests/
│   ├── helpers.js            # DB trong bộ nhớ, đồng hồ giả, random có hạt giống
│   ├── game.test.js          # test luật chơi (phòng, giờ trả lời, bỏ qua, chọn chủ đề, xếp hạng…)
│   └── app.test.js           # test HTTP + bảo mật (server tạm 127.0.0.1, cổng ngẫu nhiên) — tổng 63 test
├── var/                      # KHÔNG commit: game.db, backups/
├── docs/
│   ├── factcheck-2026-10-27.md   # báo cáo đối chiếu nguồn câu hỏi
│   ├── questions-review.html     # trang duyệt câu hỏi (độ khó, link nguồn, lọc câu mới) — mở bằng trình duyệt
│   └── question-sourcing/        # quy trình soạn câu có nguồn + kiểm chứng chéo: README, RULES, VERIFY
└── mockup/
    ├── map-styles.html       # BẢN THAM CHIẾU THIẾT KẾ (bản đồ thật + Hoạt hình) cho Phase 3–4
    └── map-data.js           # dữ liệu bản đồ cho mockup
```

### 4.3. Lựa chọn công nghệ & lý do

| Thành phần | Chọn | Lý do |
|---|---|---|
| HTTP server | `node:http` | Không cần framework, ít dependency |
| Realtime | Server-Sent Events | Trình duyệt hỗ trợ sẵn, 1 chiều server → client đủ dùng, đi qua proxy dễ hơn WebSocket |
| Database | `node:sqlite` (SQLite) | Built-in, 0 dependency, DB là 1 file: không cài server, không port, không user/mật khẩu; deploy và gỡ chỉ là copy/xóa file |
| Test | `node:test` | Built-in, không cần Jest/Mocha |
| Bản đồ | SVG `<path>` từ dữ liệu GeoJSON, xử lý trước bằng script tự viết | Đúng ranh giới thật, giáp ranh tính tự động, file nhỏ (~64 KB), không cần thư viện bản đồ |
| Âm thanh | Web Audio API | Không cần file âm thanh |
| Mật khẩu/PIN | `node:crypto` (`scrypt`, `randomUUID`, `timingSafeEqual`) | Built-in |

---

## 5. Thiết kế hình ảnh & bản đồ

> Toàn bộ phần vẽ dùng **SVG + CSS + JS thuần**, không thư viện vẽ bản đồ/biểu đồ/animation, không ảnh hay font tải từ ngoài.

### 5.1. Kiểu bản đồ — ĐÃ CHỐT: Bản đồ thật

> **Quyết định (27/10/2026):** dùng **bản đồ thật** — vẽ hình 34 tỉnh/thành theo ranh giới thật từ dữ liệu GeoJSON (nguồn và quy tắc tải ở mục 5.8 và 12.5). Các kiểu khác chỉ còn trong mockup để tham khảo.

| # | Kiểu | Kết quả |
|---|---|---|
| 1 | **Bản đồ thật** (ranh giới tỉnh từ dữ liệu) | ✅ **Đã chọn.** Quen mắt, đúng địa lý; đảo và quần đảo lấy từ dữ liệu; giáp ranh tính tự động. Sau sáp nhập các tỉnh đều đủ lớn để bấm; khu vực dày đặc (đồng bằng sông Hồng) xử lý bằng phóng to (mục 5.7) |
| 2 | Lục giác (hex tile map) | Không chọn — méo hình, phải nhập tay bố cục và giáp ranh |
| 3 | Ô vuông | Không chọn |
| 4 | Tuyến đường (node – edge) | Không chọn |
| 5 | Lai: Hex + đường hành trình | Không chọn |

> **Quy tắc:** luật di chuyển dựa trên danh sách giáp ranh **tính tự động từ đường biên chung** trong `data/map-geo.json` (58 cặp). Bản nháp nhập tay trước đó khớp 100% với dữ liệu.

### 5.2. Phong cách hình ảnh (art direction) — ĐÃ CHỐT 27/10/2026

**Chủ đề: "Hoạt hình" kiểu game casual, lấy cảm hứng từ Duolingo** — màu tươi, khối bo tròn, nút "3D" có gờ đáy, chữ bo tròn đậm, chuyển động nảy. Nét văn hóa Việt thể hiện qua màu 3 miền theo hoa Tết, huy hiệu thủ đô kiểu quốc kỳ, nón lá, linh vật team, hoa văn trống đồng.

> - Bản tham chiếu chính thức: `mockup/map-styles.html` (mặc định mở đúng thiết kế đã chốt: **Bản đồ thật + Hoạt hình**). Khi code Phase 3–4, bám theo mockup này.
> - Hai phong cách "Hiện đại phẳng" và "Giấy dó cổ" vẫn giữ trong mockup làm phương án dự phòng; đổi qua lại chỉ bằng bộ biến màu CSS (`body[data-theme]`).
> - Có gì sẽ chỉnh tiếp sau (xem mục 5.10).
> - **Chất vẽ tay "sticker phác tay" (chốt 27/10 tối, bản A+B ② trong `mockup/hand-drawn.html`)** — giữ nguyên màu, gờ đáy, font, bố cục; chỉ thêm chất vẽ tay nhẹ:
>   - Nút / thẻ / thông báo / nhãn như **mẩu sticker**: mép trắng 3px, viền hơi run (bộ lọc SVG `#hand-wob-s`), gờ đáy + bóng giấy nhẹ, góc bo lệch. Thêm **nét phác thứ hai mờ** chạy ngoài mép (`#hand-wob2`). Bộ lọc khai báo trong `<svg class="hand-defs">` ở mỗi trang, **chỉ áp lên lớp nền `::before/::after`** → chữ vẫn sắc nét.
>   - Màu nút / thẻ đặt qua biến `--fill` (nền), `--bd` (viền), `--ledge` (gờ, mặc định = `--bd`); thêm biến thể mới thì chỉ đổi biến, **không** đặt `background`/`box-shadow` trực tiếp.
>   - Hơi nghiêng (±0,3–2°): nút trong hàng, thẻ cột phải, khung câu hỏi, thông báo, nhãn; nút đứng thẳng khi rê chuột. **Không nghiêng khung bản đồ** (kéo/zoom tính theo tọa độ màn hình).
>   - Băng dính trên thông báo và khung câu hỏi; tiêu đề thẻ gạch chân lượn sóng; thanh trạng thái kẻ dưới lượn sóng.
>   - Khung tự cuộn / có `overflow` (khung bản đồ, hộp thoại, tooltip) không dùng `::before` (bị cắt) → mép trắng + gờ vẽ thẳng bằng `box-shadow`.
>   - **Icon (sticker run nét, bản B trong `mockup/icons-hand.html`)**: `icons.js` tự sinh mép trắng + bóng giấy từ chính hình icon (`silhouette()`), cả icon run nhẹ qua bộ lọc `#hand-ic-wob` (tính theo lưới 32 → độ run tỉ lệ với cỡ icon). Icon nút điều khiển (`currentColor`) chỉ run, không mép. Vẽ icon mới: chỉ vẽ hình phẳng như cũ, mép sticker có sẵn. Trang nào dùng icon phải có `<svg class="hand-defs">`.
>   - **Chuyển động (chốt 27/10 tối, `mockup/animations.html` ô 1–10 + 15)**: hiệu ứng dùng chung ở `shared/fx.js` (thông báo dán vào/bóc ra, đóng dấu, dấu tích/gạch chéo vẽ tay, sao, giấy vụn, đếm số, đếm ngược 3·2·1, biển treo sự kiện, lật thẻ); hiệu ứng bản đồ trong `map.js` (`tap`, `arrive` nón lá nhảy vòng cung + đường đi dài theo, `capture` mảnh sticker dập xuống, `lose` lớp màu bị bóc). Camera **"bay nảy"**: lấy đà lùi ra ~7% → bay van Wijk → phóng quá ~12% rồi bật lại; nút + / − zoom mượt giảm tốc dần, **không** lò xo (28/10: lò xo ở zoom thường bị cảm nhận là giật); cuộn chuột / trackpad / chụm hai ngón zoom theo độ lớn cú cuộn, giữ điểm dưới con trỏ, trượt mượt; về toàn quốc / về vị trí team cũng bay. **Hiệu năng (28/10)**: chuyển động trang trí trên bản đồ (nón lá nảy, đường đi chạy, mây nhấp nhô) chỉ chạy ~2,4 giây sau khi tới tỉnh (`.map.lively`), xong trước khi người chơi kịp trả lời; hiệu ứng chiếm / mất tỉnh (mảnh sticker, giấy vụn, vòng sóng, chữ điểm) là phần tử HTML chồng lên khung bản đồ (GPU ghép, không vẽ lại SVG) — chuyển động trong SVG buộc vẽ lại cả bản đồ mỗi khung; mỗi lớp mây là 1 path; Bão / Lễ hội chỉ tạo phần tử khi đang diễn ra; bóng đổ khối nổi là hình tính sẵn (không bộ lọc); **camera chuyển động (bay / zoom / cuộn / kéo) không đổi viewBox từng khung** mà dời / phóng cả `<svg>` bằng CSS transform, không đụng gì bên trong SVG (đo: luồng chính khi bay ~240 → ~40 ms/giây, Layout ~170 → ~3) — nhãn / mây co giãn theo bản đồ, zoom quá ~1,35 lần thì mờ đi, dừng mới đặt viewBox thật + xếp nhãn (`setCamera` / `commitCamera` trong `map.js`). Lúc chuyển động `<svg>` có `will-change: transform` (`.map.moving`) → trình duyệt co giãn ảnh đã vẽ thay vì vẽ lại cả bản đồ ở tỉ lệ mới mỗi khung (GPU khi bay ~300 → ~40 ms/giây; giữa lúc phóng to hơi mềm nét, dừng là nét lại). Xoáy bão / đèn lồng lễ hội chỉ chạy 2 nhịp lúc bắt đầu + mỗi lần tới tỉnh mới rồi đứng yên (chạy mãi suốt 3–5 phút sự kiện: máy nặng gấp ~5 lần lúc nghỉ). AudioContext tạo ngay lần chạm / gõ phím đầu tiên (`sound.js`) — tạo lúc phát tiếng đầu tiên chặn luồng chính ~100 ms đúng lúc camera bắt đầu bay. Lý do: MacBook có màn 120 Hz → mỗi khung chỉ 8,3 ms. Chỉ transform + opacity; máy bật "giảm chuyển động" thì bỏ hết. Tỉnh đang đứng: mặt sáng hẳn + **viền vàng 4px** (thay quầng vàng mờ). **Đường biên tỉnh mềm như nét bút** (28/10): run nhẹ theo vị trí rồi nối bằng đường cong Catmull-Rom (`smoothRings` trong `map/geometry.js`), tính một lần lúc tạo bản đồ — hai tỉnh chung ranh giới ra cùng đường cong nên vẫn khít; không dùng bộ lọc SVG (đo lại: hiệu năng camera không đổi). Trả lời sai **không** hiện đáp án đúng (server không gửi). **Chiếm tỉnh (sửa 28/10)**: mảnh sticker đáp trùng khít mặt trên khối nổi (cùng vị trí, độ nghiêng, viền vàng); khối nổi giữ màu cũ tới lúc mảnh chạm rồi đổi một lần (trước: mảnh biến mất rồi tỉnh mới đổi màu dần 0,5 giây + khối nổi bật lên lệch chỗ); bỏ nhịp cờ bật trong SVG. Bỏ **nét phác thứ hai** quanh tỉnh đi được (lệch tới 5 đơn vị nên lấn ra biển, trông như vẽ thừa) — tỉnh đi được chỉ còn viền đậm liền.
>   - **Công thành (chốt 28/10, `mockup/siege.html`, code `team/siege-fx.js`)**: đội mình hiện linh vật thật, đối thủ luôn là huy hiệu xám **"?"** (luật ẩn danh). **Mở màn "giành cờ"** (~2 giây, không che bản đồ): hai lá cờ rơi cắm xuống hai bên tỉnh, bụi bay, va nhau 3 nhịp tóe tia lửa, dải chữ "Công thành <tỉnh>!" / "<tỉnh> đang bị công thành!" — đội công thành diễn ngay khi bấm (camera đã ở tỉnh), đội giữ tỉnh diễn **sau khi camera bay tới**; kết quả tới sớm / đóng khung thì bỏ mở màn. **Thanh kéo co** trên khung câu (xem 3.3). **Kết quả trên tỉnh**: công thành thắng → huy hiệu bên công thành húc văng bên giữ tỉnh (cùng lúc mảnh sticker dập; bên mất tỉnh: khung phòng thủ giữ thêm 1,7 giây cho cảnh này rồi mới đóng); giữ được → khiên bật lên, bên công thành đập vào rồi bật ngược ra (bên bị đẩy lui: giữ khung 1,7 giây, màn "Bị khóa" hiện sau). Tất cả là phần tử HTML chồng lên khung bản đồ, chỉ transform + opacity.
>   - Bản đồ: viền tỉnh **run nhẹ tính sẵn một lần** (`wobble()` trong `map.js`, nhiễu mượt theo vị trí → ranh giới chung vẫn khít; **không dùng bộ lọc** → camera bay không bị ảnh hưởng); khe trắng giữa tỉnh 3,2px như mảnh giấy rời; bóng giấy dưới tỉnh đã thấy; tỉnh có thể đi thêm nét phác thứ hai; tỉnh đang đứng nghiêng −4° như mảnh giấy được nhấc lên.

**Bản đồ**

| Thành phần | Thiết kế | Cách làm (thuần) |
|---|---|---|
| Nền khung bản đồ | Xanh da trời nhạt `#DDF4FF`. **Chỉ vẽ lãnh thổ Việt Nam** (đất liền, đảo, quần đảo). **Không vẽ các nước xung quanh**, không vẽ nền biển; chỉ ghi tên vùng biển "Biển Đông", "Vịnh Bắc Bộ", "Vịnh Thái Lan" (chữ xanh `#1CB0F6`, viền trắng) | CSS + SVG `<text>` |
| Khối bản đồ "sticker" | **Viền ngoài trắng dày 6px** quanh đất liền + **bóng khối xanh nhạt `#8CCBEA` lệch xuống 6px** → bản đồ nổi như miếng sticker. **Không dùng viền đen** (làm tối bản đồ) | 2 lớp SVG `layer-outline`, `layer-shadow` (bản sao hình tỉnh, chỉ đất liền + đảo lớn) |
| Ranh giới tỉnh | Nét **trắng 3,2px** (khe giữa các "mảnh giấy"; trước 27/10 tối là 2px), luôn cố định dù zoom (`vector-effect: non-scaling-stroke`); vẫn thấy dưới lớp sương mù | CSS `stroke` |
| Màu 3 miền | **Bắc: hồng hoa đào** `#FFC2D1` (sắc hoa đào ngày xuân se lạnh) · **Trung: vàng ấm/trầm** `#F6CD72` (chắt chiu, vững vàng — hoa mai, hoa cúc trong khí hậu khắc nghiệt) · **Nam: vàng tươi** `#FFE65C` (rực rỡ, phóng khoáng — hoa mai vàng ngày Tết) | Biến CSS `--tile-n/c/s` |
| Tỉnh có thể đi | Hiện màu miền (không sương mù); **ranh giới tô đậm bằng sắc đậm của chính màu tỉnh** (`--tile-n/c/s-dark`), nét liền 3px + nét phác thứ hai mờ 1,2px. **Không dùng nét đứt vàng** | CSS |
| Tỉnh đang đứng | **Nổi khối ~18px**: mặt trên sáng hơn + ánh bóng chéo, thành khối tối, quầng sáng vàng nhẹ + bóng đổ; **viền mảnh, không viền dày**; bật nảy khi vừa đến (chi tiết mục 5.4) | Lớp `layer-lift` |
| Sương mù | Nền xám xanh nhạt `#DCE5EC` + **mây sticker** (chốt 27/10 tối, `mockup/fog-clouds.html` bản A): mỗi tỉnh 1 đám mây ở nhãn (mép trắng, bụng xanh xám, bóng giấy), tỉnh lớn thêm tối đa 2 đám khi đã phóng to; cỡ pixel cố định như nhãn; nhấp nhô chậm (dừng khi camera bay). Tên tỉnh vẫn hiện, chữ nhạt, nằm đè phần dưới mây. Tan sương: mây phồng lên, bay vút lên rồi tan; phủ lại: mây hiện dần | `map.js` lớp `layer-clouds`, `setClouds()` |
| **Hoàng Sa, Trường Sa** | **Bắt buộc thể hiện.** Hình đảo lấy từ dữ liệu (thuộc TP. Đà Nẵng và tỉnh Khánh Hòa); đảo quá nhỏ vẽ **chấm tượng trưng** cỡ cố định; khung nét đứt xanh mảnh + nhãn "QĐ. Hoàng Sa (TP. Đà Nẵng)", "QĐ. Trường Sa (tỉnh Khánh Hòa)". Đảo đổi màu theo team chiếm tỉnh | SVG |
| Đảo ven bờ | Đảo đủ lớn: vẽ đúng hình + ghi tên. **Đảo quá nhỏ: không vẽ, không ghi tên** (tránh rối). Đảo nhỏ có ý nghĩa (**Bạch Long Vĩ** – TP. Hải Phòng): **hình đảo cách điệu ~12px**, đổi màu theo tỉnh | SVG; danh sách `STYLIZED_ISLANDS` |
| Thủ đô Hà Nội | **Huy hiệu tròn nền đỏ cờ `#DA251D` + sao vàng `#FFCD00` + vòng trắng** (như quốc kỳ thu nhỏ) → nổi trên mọi màu nền | SVG |
| Thành phố trực thuộc TW (9) | Chấm vàng viền trắng | SVG |
| Cờ chiếm tỉnh | **Cờ màu team trên huy hiệu tròn nền trắng** → không chìm khi tỉnh mang cùng màu team. Tỉnh có chủ khác: cờ đen dấu "?" trên huy hiệu trắng. Cờ **bật nảy** khi vừa chiếm | SVG `<symbol>` + `<use>` |
| Đường hành trình | **Nền trắng 7px + nét đứt màu team 3px** (chạy chậm) + chấm trắng viền màu team tại mỗi tỉnh đã ghé → không chìm khi đi qua tỉnh cùng màu | SVG `<polyline>` |
| Nón lá (vị trí team) | Vàng, viền nâu vàng, **nhảy tưng tưng co giãn** (squash & stretch) | CSS `@keyframes hop` |
| Nhãn tỉnh | Chữ **xám đậm `#3C3C3C` viền trắng 4px**, đậm 800; điểm màu cam `#FF9600`; trên tỉnh màu team: chữ trắng viền tối nhẹ. Cỡ chữ và cơ chế tránh chồng chữ: mục 5.7 | CSS `paint-order: stroke` |
| Màn chiếu | Hoa văn trống đồng (vòng đồng tâm, ngôi sao 14 cánh) nét mảnh, mờ, làm nền, xoay rất chậm | SVG + CSS |
| Icon | Cờ, khiên, kính viễn vọng, tia sét, nón lá, trống, đèn lồng, mây bão | **Tự vẽ inline SVG**, không thư viện icon, không emoji trên bản đồ |

**Giao diện (khung, nút, thẻ)**

| Thành phần | Thiết kế |
|---|---|
| Nút | Bo tròn 14px, viền 2px `#E5E5E5`, **gờ đáy 4px** (`box-shadow: 0 4px 0`), chữ đậm 800; **bấm thì lún xuống 4px**. Nút đang chọn: xanh dương `#1CB0F6` chữ trắng; nút bật (sự kiện): vàng `#FFC800` |
| Thẻ / panel | Nền trắng, bo 18px, viền 2px, gờ đáy 4px |
| Khung bản đồ | Bo 20px, viền 2px, gờ đáy 6px |
| Tiêu đề | Xanh lá Duolingo `#58CC02`, chữ siêu đậm 900 |
| Số liệu (điểm, số tỉnh, giờ) | Xanh lá `#58CC02`, 22px, đậm 900 |
| Thông báo (toast) | Nền xanh lá, bo 16px, gờ đáy xanh đậm `#58A700` |
| Bản tin chạy chữ (màn chiếu) | Nền xanh dương `#1CB0F6` |

**Bảng màu chủ đạo**

| Tên | Mã | Dùng cho |
|---|---|---|
| Nền trang | `#F7F7F7` | Nền |
| Khối nội dung | `#FFFFFF` | Panel, thẻ, popup |
| Chữ chính | `#3C3C3C` | Chữ, nhãn tỉnh |
| Chữ phụ | `#777777` | Ghi chú |
| Đường kẻ | `#E5E5E5` | Viền, gờ đáy nút/thẻ |
| Nền bản đồ | `#DDF4FF` | Khung bản đồ |
| Bóng khối bản đồ | `#8CCBEA` | Bóng sticker |
| Xanh lá / xanh lá đậm | `#58CC02` / `#58A700` | Tiêu đề, số liệu, toast |
| Xanh dương / xanh dương đậm | `#1CB0F6` / `#1899D6` | Nút đang chọn, tên biển, khung quần đảo |
| Vàng | `#FFC800` | Nút bật, quầng sáng tỉnh đang đứng, nón lá |
| Cam | `#FF9600` | Điểm số trên bản đồ |
| Đỏ | `#FF4B4B` | Cảnh báo mất tỉnh |
| Miền Bắc / Trung / Nam | `#FFC2D1` / `#F6CD72` / `#FFE65C` | Nền tỉnh chưa có chủ |
| Viền đậm Bắc / Trung / Nam | `#E07A96` / `#C8992F` / `#D9B70F` | Ranh giới tỉnh có thể đi |
| Xám sương | `#D5DEE6` | Sương mù |
| Xám "có chủ" | `#AFAFAF` | Tỉnh đã ghé, có chủ khác |
| Huy hiệu thủ đô | `#DA251D` + `#FFCD00` | Hà Nội |

**Màu + linh vật cho 6 team** (vừa có màu vừa có hình để người mù màu vẫn phân biệt được)

| Team | Linh vật | Màu |
|---|---|---|
| 1 | Rồng | Đỏ `#C0392B` |
| 2 | Lân | Cam `#E67E22` |
| 3 | Rùa | Xanh lá `#27AE60` |
| 4 | Phượng | Tím `#8E44AD` |
| 5 | Hạc | Xanh dương `#2E86C1` |
| 6 | Trâu | Nâu `#8D6E63` |

**Font chữ:** chữ bo tròn, đậm (kiểu Duolingo), hỗ trợ đầy đủ dấu tiếng Việt:
- **Nunito** lưu trong project (`public/fonts/nunito.ttf`, SIL OFL, đã duyệt 27/10/2026 — mục 12.5), khai báo `@font-face` trong `public/style.css`. Dự phòng: `ui-rounded, "SF Pro Rounded", "Segoe UI", system-ui, sans-serif`. Không tải font từ Google Fonts/CDN lúc chạy.

### 5.3. Kỹ thuật vẽ bản đồ thật

**Luồng dữ liệu**
```
34 file GeoJSON (tải 1 lần, không commit)
        │  node scripts/build-map.mjs <thư mục geojson>
        ▼
data/map-geo.json (~64 KB, commit)  ──►  trình duyệt vẽ SVG
        └─ adjacency (58 cặp) ──────────►  init-db.mjs nạp vào bảng adjacency
```

**`scripts/build-map.mjs`** (chỉ module built-in của Node):

| Bước | Cách làm |
|---|---|
| Đọc dữ liệu | `JSON.parse` 34 file, kiểm tra đúng 1 Feature/file, kiểu Polygon/MultiPolygon |
| Chiếu tọa độ | Equirectangular, hiệu chỉnh `cos(16°)`: `x = (lon − 101.8)·cos16°·60`, `y = (23.6 − lat)·60` |
| Đơn giản hóa | Douglas–Peucker tự viết, sai số 0,5 đơn vị (~0,9 km) → giảm từ 7,9 MB xuống ~64 KB |
| Đảo rất nhỏ | Vòng nhỏ hơn 3 đơn vị → lưu thành **chấm đảo** (`islets`), gộp các chấm gần nhau |
| Điểm đặt nhãn | Điểm nằm sâu nhất trong phần đất liền lớn nhất (dò lưới + tinh chỉnh) |
| Giáp ranh | Hai tỉnh có ≥ 5 điểm biên cách nhau < 300 m → giáp ranh |
| Đầu ra | `.json` cho game; `.js` (bọc `window.MAP_DATA`) cho mockup mở bằng `file://` |

**Cấu trúc `data/map-geo.json`**
```json
{
  "source": "ThangLeQuoc/vietnamese-provinces-database v5.2.0 (MIT) — dữ liệu gốc từ sapnhap.bando.com.vn",
  "projection": { "lon0": 101.8, "lat0": 23.6, "k": 60, "cos": 0.961 },
  "bounds": [x0, y0, x1, y1],
  "provinces": [
    { "id": "da-nang", "code": "48", "name": "Đà Nẵng", "fullName": "Thành phố Đà Nẵng",
      "isCity": true, "areaKm2": 11859.6, "d": "M…Z", "label": [x, y], "islets": [[x, y], …] }
  ],
  "adjacency": [["da-nang", "hue", 535], …]
}
```

**Vẽ trên trình duyệt**
- Mỗi tỉnh là một nhóm:
  ```html
  <g class="prov is-neighbor" data-id="hue" tabindex="0" role="button" aria-label="Huế – 300 điểm">
    <path class="geo" d="M…Z"/>
    <circle class="islet" …/>   <!-- các đảo nhỏ của tỉnh -->
    <use href="#icon-flag" class="flag"/>
  </g>
  ```
- Trạng thái đổi bằng **class CSS** (`is-mine`, `is-current`, `is-neighbor`…) → JS chỉ đổi class.
- `viewBox` lấy từ `bounds`; phóng to/kéo bằng cách đổi `viewBox` (con lăn chuột, kéo thả, nút +/−, nút 📍 về vị trí team).
- Tooltip tự vẽ (không dùng `title` mặc định): tên tỉnh, các tỉnh cũ sáp nhập, điểm.

**Thứ tự các lớp SVG (dưới → trên)**

| # | Lớp | Nội dung |
|---|---|---|
| 1 | `layer-bg` | Tên vùng biển, khung + nhãn 2 quần đảo (không vẽ nước láng giềng) |
| 1a | `layer-shadow`, `layer-outline` | Bóng khối xanh + viền trắng dày quanh đất liền (hiệu ứng sticker) |
| 2 | `layer-tiles` | Hình các tỉnh + chấm đảo (tô màu theo trạng thái), cờ, khiên |
| 3 | `layer-borders` | Đường biên phân chia 3 miền |
| 4 | `layer-trail` | Đường hành trình của team: **nền trắng 7px + nét đứt màu team 3px** (để không chìm khi đi qua tỉnh cùng màu team), có hiệu ứng chạy |
| 5 | `layer-fog` | Sương mù: phủ màu xám phẳng (không họa tiết) lên các tỉnh chưa biết |
| 5a | `layer-lift` | Khối nổi của tỉnh đang đứng (thành khối, mặt trên, ánh bóng) |
| 6 | `layer-labels` | Tên tỉnh, điểm, sao thủ đô, chấm thành phố, tên đảo (nằm trên sương mù) |
| 7 | `layer-marker` | Nón lá (vị trí hiện tại); màn MC: chấm số của từng team |
| 8 | `layer-fx` | Hiệu ứng: bão, lễ hội, sóng lan, pháo hoa |

### 5.4. Trạng thái ô tỉnh

**Trên màn hình team**

| Trạng thái | Class | Hiển thị |
|---|---|---|
| Của mình | `is-mine` | Tô màu team, cờ + linh vật |
| Vị trí hiện tại | `is-current` | **Nổi khối lên ~18px**: mặt trên **sáng hơn màu tỉnh + ánh bóng chéo**, viền mảnh như tỉnh thường (**không dùng viền dày**), **quầng sáng vàng** quanh khối, thành khối tối màu xếp chồng + bóng đổ phía dưới — để vẫn nổi bật khi xung quanh toàn tỉnh cùng màu team; khi di chuyển, tỉnh mới **bật nảy lên**. Tên tỉnh và nón lá nằm trên mặt khối. Độ nổi tính theo pixel màn hình nên không đổi khi zoom |
| Giáp ranh, đi được | `is-neighbor` | Không bị sương mù (hiện màu miền), **đường ranh giới tô đậm bằng sắc đậm của chính màu tỉnh** (nét liền 2,5px, **không dùng nét đứt vàng**); rê chuột thì sáng lên; con trỏ dạng tay |
| Đã ghé, có chủ khác | `is-taken` | Xám đậm + cờ đen có dấu "?" (biết có chủ, **không biết ai**) |
| Đã ghé, còn trống | `is-free` | Màu nền tỉnh, không sương mù |
| Chưa biết (sương mù) | `is-fog` | Phủ màu xám phẳng, không thấy gì bên dưới (tên tỉnh vẫn hiện, chữ nhạt) |
| Đang bị bão | `is-storm` | Vằn chéo + icon mây xoáy, không bấm được |
| Mình đang phòng thủ | `is-shielded` | Thêm biểu tượng khiên |
| Đang trinh sát | `is-scouted` | Sương mù tan tạm thời 10 giây, hiện cờ xám ở tỉnh có chủ |
| Đang bị khóa (trả lời sai) | `is-locked` (cả bản đồ) | Bản đồ mờ đi + đồng hồ đếm ngược ở giữa |

**Trên màn chiếu (trong lúc chơi)**
- Bản đồ "bí ẩn": tất cả ô cùng một màu giấy, **không hiện màu team**.
- Có tin mới → ô liên quan nháy sóng lan tỏa màu vàng (không lộ team).
- Lúc công bố mới hiện màu thật.

**Trên màn MC:** bản đồ thật với màu tất cả team, vị trí hiện tại của từng team.

### 5.5. Hiệu ứng & animation

| Sự kiện | Hiệu ứng | Cách làm |
|---|---|---|
| Di chuyển | Nón lá trượt từ ô cũ sang ô mới, đường hành trình kéo dài | CSS `transition: transform 400ms`; `stroke-dashoffset` |
| Chiếm tỉnh | Màu team lan ra từ tâm ô, cờ cắm xuống nảy nhẹ, tiếng trống | SVG `<clipPath>` hình tròn phóng to; CSS `@keyframes`; Web Audio |
| Mất tỉnh | Ô rung, nháy đỏ son, phai về xám, hiện thông báo lớn | `@keyframes shake` |
| Trả lời sai | Khung câu hỏi rung, bản đồ mờ + đồng hồ khóa | CSS |
| Sương tan | Lớp xám mờ dần | `opacity` |
| Lễ hội | Đèn lồng bay lên ở các ô của miền đó | SVG + `@keyframes` |
| Bão | Mây xoáy quay trên các ô của miền đó | SVG + `@keyframes rotate` |
| Bản tin màn chiếu | Chữ chạy ngang | CSS `@keyframes` + `translateX` |
| Màn công bố | Tua lại hành trình (xem dưới) + pháo hoa | `requestAnimationFrame` + `<canvas>` tự viết |

**Màn công bố (replay):**
1. Bản đồ trống → phát lại `events_log` theo thứ tự thời gian, tốc độ ×20 (45 phút ≈ 2 phút 15 giây).
2. Mỗi team một đường hành trình màu riêng, ô đổi màu khi bị chiếm hoặc cướp.
3. Dừng lại 2–3 giây ở các khoảnh khắc "cướp tỉnh".
4. Hết replay → hiện bảng xếp hạng **từ hạng 6 lên hạng 1**, mỗi hạng cách nhau vài giây.
5. Hạng 1: pháo hoa + tiếng trống.

- Tôn trọng `prefers-reduced-motion`: giảm hoặc tắt animation nếu máy người dùng bật chế độ giảm chuyển động.
- Chỉ animate `transform` và `opacity` để mượt trên laptop cấu hình yếu.

### 5.6. Bố cục màn hình (wireframe)

**Màn hình team** (tối thiểu 1366×768)
```
┌───────────────────────────────────────────────────────────────────────┐
│ [Rồng] Team Rồng │ 1.250 điểm │ 7 tỉnh │ ⏱ 23:41 │ Lễ hội miền Trung 03:12 │
├───────────────────────────────────────────────┬───────────────────────┤
│                                               │ Đang ở: Huế           │
│                                               │ Có thể đi:            │
│                                               │  • Quảng Trị          │
│           BẢN ĐỒ THẬT (~70% chiều rộng)       │  • Đà Nẵng            │
│                                               ├───────────────────────┤
│                                               │ Thẻ bài               │
│                                               │ [Trinh sát][Phòng thủ]│
│                                               ├───────────────────────┤
│                                               │ Nhật ký team          │
│                                               │  10:21 Chiếm Huế      │
│                                               │  10:18 Mất Quảng Trị! │
└───────────────────────────────────────────────┴───────────────────────┘
```

**Khung câu hỏi** (hiện đè lên bản đồ)
```
┌──────────────── Trạm: Phú Thọ · 200 điểm ────────────────┐
│ ⏱ 00:25                                                   │
│                                                           │
│ Tỉnh Phú Thọ mới được hợp nhất từ những tỉnh nào?         │
│                                                           │
│  [1] Phú Thọ, Vĩnh Phúc, Hòa Bình                         │
│  [2] Phú Thọ, Yên Bái, Tuyên Quang                        │
│  [3] Phú Thọ, Hà Nam, Ninh Bình                           │
│  [4] Phú Thọ, Thái Nguyên, Bắc Kạn                        │
└───────────────────────────────────────────────────────────┘
```

**Màn chiếu** (1920×1080)
```
┌─────────────────────────────────────────────────────────────────┐
│  HÀNH TRÌNH 3 MIỀN                                    ⏱ 23:41    │
├──────────────────────────────────┬──────────────────────────────┤
│                                  │  BẢNG ĐIỂM                    │
│   Bản đồ "bí ẩn"                 │  [Rồng]   ██████████  1.250   │
│   (không màu team, chỉ nháy      │  [Hạc]    ████████    1.050   │
│    khi có tin)                   │  [Lân]    ██████        800   │
│                                  │  ...                          │
│   nền hoa văn trống đồng         │  (10 phút cuối: ĐÃ ĐÓNG BĂNG) │
├──────────────────────────────────┴──────────────────────────────┤
│ 📢 Một đội vừa chiếm Đà Nẵng! · Huế vừa đổi chủ! · Bão miền Bắc! │
└─────────────────────────────────────────────────────────────────┘
```

**Màn MC**
```
┌──────────────────────────────────────────┬──────────────────────┐
│                                          │ [Bắt đầu] [Tạm dừng] │
│   BẢN ĐỒ THẬT (màu tất cả team,          │ [Kết thúc] [Reset]   │
│   vị trí hiện tại từng team)             ├──────────────────────┤
│                                          │ Sự kiện: [Lễ hội ▾]  │
│                                          │ Miền: [Trung ▾] [Tung]│
│                                          ├──────────────────────┤
│                                          │ Điểm chi tiết + sửa  │
│                                          ├──────────────────────┤
│                                          │ Log thời gian thực   │
└──────────────────────────────────────────┴──────────────────────┘
```

### 5.7. Hiển thị & khả năng tiếp cận

| Hạng mục | Yêu cầu |
|---|---|
| Kích thước chữ | Team: tối thiểu 16px · Màn chiếu: tối thiểu 28px, đồng hồ ≥ 120px |
| Độ tương phản | Đạt WCAG AA (≥ 4.5:1 cho chữ) |
| Phân biệt team | Màu **và** linh vật, không chỉ dựa vào màu |
| Bàn phím | Tab chuyển giữa các tỉnh giáp ranh, Enter để đi, phím 1–4 chọn đáp án, Esc che màn hình |
| Màn chiếu | Kiểm tra hiển thị ở 100% và 150% zoom; xem thử trên máy chiếu thật lúc tổng duyệt |
| Phóng to bản đồ | Màn team mặc định phóng tới khu vực quanh vị trí team; nút 📍 quay về vị trí; khi xem toàn bộ thì thu nhỏ/ẩn bớt nhãn ở khu vực dày đặc (đồng bằng sông Hồng) |
| Nhãn bản đồ (tránh chồng chữ) | 1) Nhãn, biểu tượng, nón lá **to dần khi phóng to nhưng chậm hơn bản đồ**: hệ số = √(mức zoom), tối thiểu 1×, tối đa 2,4× (ví dụ zoom 4× → chữ to 2×). Nhờ vậy phóng to thì chữ dễ đọc hơn mà vẫn còn chỗ trống, thu nhỏ thì chữ không bé hơn cỡ gốc (12px). 2) **Xếp nhãn theo độ ưu tiên** (quần đảo → vị trí hiện tại → tỉnh của mình, tỉnh có thể đi → thủ đô, thành phố → tỉnh lớn → tên biển → tên đảo); nhãn nào đè lên nhãn đã đặt thì bỏ dòng điểm, vẫn đè thì ẩn (rê chuột vẫn xem được). Phóng to → nhiều nhãn hiện ra hơn. 3) Chữ có **viền sáng** (`paint-order: stroke`), trên nền màu team thì chữ trắng viền tối. 4) Biểu tượng (sao, chấm thành phố, cờ, khiên) gom thành **một hàng phía trên tên**; nón lá đặt phía trên hàng biểu tượng và được tính là vùng cấm khi xếp nhãn. Tính lại khi zoom/kéo/đổi kích thước cửa sổ |

### 5.8. Quy trình dựng & cập nhật dữ liệu bản đồ (chi tiết cho Phase 1.3)

1. **Tải dữ liệu** theo quy tắc an toàn: chỉ 34 file `json/geojson/<mã>_<tên>/<mã>_<tên>.geojson` cấp tỉnh của tag đã chọn; không clone repo, không chạy script của repo; lưu vào thư mục tạm ngoài project; ghi SHA-256 từng file.
2. **Kiểm tra đầu vào:** đúng 34 file JSON hợp lệ; đủ 34 tỉnh; mỗi file 1 Feature; Hoàng Sa nằm trong TP. Đà Nẵng, Trường Sa nằm trong tỉnh Khánh Hòa.
3. **Chạy** `node scripts/build-map.mjs <thư mục> data/map-geo.json` (và `mockup/map-data.js` nếu cần mockup).
4. **Kiểm tra đầu ra:** 34 tỉnh; số cặp giáp ranh (hiện tại 58) và danh sách cặp hợp lý; đối chiếu bằng mắt với bản đồ chính thức tại sapnhap.bando.com.vn; đảo và quần đảo hiển thị đủ.
5. **Commit** `data/map-geo.json`; cập nhật mục 12.5 (tag, ngày tải, SHA-256).
6. **Khi có nghị quyết mới** (đổi tên, nâng cấp thành phố…): tải tag mới của repo → lặp lại bước 1–5 → cập nhật bảng điểm (mục 3.5).

**Đã làm ngày 27/10/2026:** tag `v5.2.0`, 34 file (7,9 MB) → `data/map-geo.json` 64 KB, 58 cặp giáp ranh, 201 chấm đảo nhỏ.

### 5.9. Mockup (đã làm 27/10/2026)

- File `mockup/map-styles.html` + `mockup/map-data.js` (HTML/CSS/JS thuần, mở trực tiếp bằng trình duyệt, không gọi URL ngoài).
- So sánh 4 kiểu (Lục giác, Tuyến đường, Lai, **Bản đồ thật**) × 3 phong cách (Giấy dó cổ, Hiện đại phẳng, **Hoạt hình** – lấy cảm hứng từ Duolingo: màu tươi, viền dày, khối 3D có gờ đáy, chữ bo tròn đậm, nón lá nhảy co giãn) × 3 màn hình (Team, Máy chiếu, MC); thử được di chuyển, chiếm tỉnh, bão, lễ hội, phóng to.
- **Kết quả:** chốt **Bản đồ thật** + phong cách **Hoạt hình**. Mockup mặc định mở theo lựa chọn này.


### 5.10. Chốt thiết kế (27/10/2026) & việc để chỉnh sau

**Đã chốt** — bản tham chiếu: `mockup/map-styles.html` + `mockup/map-data.js`

| Hạng mục | Quyết định |
|---|---|
| Kiểu bản đồ | Bản đồ thật từ dữ liệu GeoJSON, chỉ vẽ lãnh thổ Việt Nam (mục 5.1, 5.3, 5.8) |
| Phong cách | Hoạt hình kiểu Duolingo, khối bản đồ "sticker" viền trắng, không viền đen (mục 5.2) |
| Màu 3 miền | Bắc hồng hoa đào · Trung vàng trầm · Nam vàng tươi hoa mai |
| Tỉnh đang đứng | Nổi khối ~18px, mặt sáng + ánh bóng + quầng vàng nhẹ, không viền dày |
| Tỉnh có thể đi | Tô đậm ranh giới bằng sắc đậm của màu tỉnh, không nét đứt vàng |
| Nhãn | To dần khi phóng to (√zoom, tối đa 2,4×), xếp theo ưu tiên để không chồng chữ (mục 5.7) |
| Biểu tượng | Huy hiệu thủ đô kiểu quốc kỳ; cờ trên huy hiệu tròn trắng; nón lá nhảy co giãn |
| Đường hành trình | Nền trắng + nét đứt màu team + chấm dừng |
| Đảo | Đảo lớn vẽ hình; đảo nhỏ ven bờ bỏ; Hoàng Sa/Trường Sa chấm tượng trưng; Bạch Long Vĩ hình cách điệu |

**Để chỉnh sau (không chặn Phase 1–2)**

| # | Việc | Ghi chú |
|---|---|---|
| D1 | Font Nunito tự lưu trong project | ✅ 27/10 (A11) |
| D2 | Trung (vàng trầm) và Nam (vàng tươi) khá gần nhau | Kiểm tra trên máy chiếu thật lúc tổng duyệt; nếu khó phân biệt thì đẩy Trung sang vàng cam đậm hơn |
| D3 | Chấm thành phố và nón lá màu vàng kém nổi trên tỉnh miền Nam vàng tươi | ✅ 27/10: chấm thành phố đặt trên huy hiệu tròn nền trắng; nón lá có viền trắng |
| D4 | Ở mức xem toàn bộ, vài tỉnh nhỏ (Hưng Yên, Bắc Ninh, Vĩnh Long…) bị ẩn tên | ✅ 27/10: thêm mức tên viết tắt (HY, BN, VL, HCM…; tên một từ giữ nguyên) giữa "bỏ dòng điểm" và "ẩn" |
| D5 | Màn chiếu: hoa văn trống đồng nền và màn công bố (replay) chưa có trong mockup | ✅ Đã làm trong `public/screen.*` (27/10) — chờ xem trên máy chiếu thật |
| D6 | Linh vật team (Rồng, Lân, Rùa, Phượng, Hạc, Trâu) mới là số thứ tự trong mockup | ✅ 27/10: 8 icon SVG tự vẽ (`public/shared/mascots.js`, huy hiệu tròn màu team + hình trắng), thay ô màu ở màn team, chọn team, trang chủ phòng, màn chiếu, tổng kết. Chấm vị trí team trên bản đồ MC vẫn là số |
| D7 | Chú giải trong mockup còn dòng của kiểu lục giác ("cạnh không thông", "đường nối") | ✅ Game thật không dùng chú giải của mockup |
| D8 | Tinh chỉnh màu cho phong cách dự phòng (Hiện đại phẳng, Giấy dó cổ) | Chỉ làm nếu đổi phong cách |

---

## 6. Thiết kế dữ liệu (SQLite)

> Dùng module **`node:sqlite`** có sẵn trong Node.js (đã kiểm tra chạy được trên máy dev: Node v22.23.4, SQLite 3.53). **Không cần package nào.**
> DB là **một file duy nhất** `var/game.db`, nằm **ngoài** thư mục `public/`.

### 6.1. Cấu hình kết nối

```js
import { DatabaseSync } from 'node:sqlite'

const db = new DatabaseSync(process.env.DB_PATH) // ./var/game.db
db.exec(`
  PRAGMA journal_mode = WAL;     -- đọc/ghi đồng thời mượt hơn
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
  PRAGMA synchronous = NORMAL;
`)
// Mọi query dùng prepared statement:
const getOwner = db.prepare('SELECT team_id, shield_until FROM ownership WHERE province_id = ?')
```

### 6.2. Schema

> **Nguồn chuẩn: `db/schema.sql`** (đọc file đó thay vì chép lại ở đây để tránh lệch).

| Bảng | Vai trò |
|---|---|
| `provinces`, `adjacency`, `collections`, `collection_members`, `questions` | Dữ liệu tĩnh, nạp từ `data/*.json` (câu hỏi có `level` 1–3, `answer` dạng JSON — không bao giờ gửi cho client). **Câu hỏi sửa được trong trang quản trị (31/10)**: thêm cột `sources`, `status` (new/ok/fix), `hidden`, `updated_at`, `updated_by` — DB là bản đang dùng, `data/questions.json` là bản trong git (xuất từ trang quản trị để cập nhật) |
| `rooms` | Phòng: mã phòng, tên, `owner_key_hash` (scrypt), `owner_key_sealed` (mã chủ phòng mã hóa AES-GCM — trang quản trị xem lại được), mã màn chiếu, thời lượng, kiểu phòng, `quiz_count` (số câu mỗi tỉnh), `listed` (công khai), `preset` / `host_player_id` (phòng có sẵn), trạng thái trận, đồng hồ, sự kiện đang diễn ra (thay bảng `game_state` cũ) |
| `teams` | Team thuộc phòng: màu, linh vật, vị trí hiện tại/trước, câu đang chờ + `pending_order` + `pending_at`, khóa, điểm thưởng, `march_ready`, `last_result` (để đồng đội cùng thấy kết quả) |
| `players` | Người chơi: phòng, team, tên (không trùng trong phòng) |
| `sessions` | Phiên đăng nhập (chỉ lưu SHA-256 của token), role player/screen/owner/**sysadmin**, gắn phòng (+ team, người chơi) hoặc gắn tài khoản quản trị (`admin_id`, `room_id` NULL). Xóa phòng / kick / khóa tài khoản → phiên xóa theo (`ON DELETE CASCADE`) |
| `admins` | Tài khoản quản trị (31/10): `username`, `display_name`, `password_hash` (scrypt), `must_change` (mật khẩu tạm), `disabled`, `failed_count` + `locked_until` (sai 5 lần → khóa 15 phút), `last_login_at` |
| `admin_log` | Nhật ký thao tác quản trị + đăng nhập, giữ 30 ngày |
| `settings` | Cài đặt chỉnh trong trang quản trị (khóa → JSON): `allowCreate`, `presetRooms`, `notice`, `noticeOn`, `bannedWords` |
| `ownership` | Tỉnh nào của team nào, khiên phòng thủ |
| `visits` | Tỉnh team đã đặt chân tới (để biết "có chủ"/"trống" mà không lộ team nào) |
| `cards` | Thẻ bài (scout/shield/march) |
| `answered` | Lịch sử trả lời (chống lặp câu + thống kê % đúng) |
| `events_log` | Nhật ký (bản tin màn chiếu, cảnh báo mất tỉnh, tua lại) |
| `duels` | Thử tài (đấu tay đôi): câu chung, giai đoạn `bet` / `play`, hạn cược, cược hai bên, số hiệp, hiệp hiện tại, số hiệp thắng mỗi bên |
| `stamps` | Phòng đơn: tem từng người (tỉnh không thuộc riêng ai) |
| `reactions` | "Đã từng / Muốn thử" (chỉ dùng số đếm gộp) |
| `leaderboard` | Bảng xếp hạng cá nhân cả sự kiện: phòng đơn kết thúc → mỗi người một dòng (tên, màu, điểm, số tem; `hidden` = quản trị ẩn khỏi bảng công khai). **Không khóa ngoại tới `rooms`** (phòng tự xóa sau 24 giờ), tự xóa sau 7 ngày |
| `game_state` | Trạng thái trận (1 dòng): status, giờ bắt đầu/kết thúc/đóng băng, sự kiện đang diễn ra |

### 6.3. Khởi tạo & nạp dữ liệu

- `scripts/init-db.mjs` (Node built-in): nếu đã có file DB thì dừng lại, chỉ xóa và tạo lại khi chạy với cờ `--reset` → chạy `db/schema.sql` → đọc `data/*.json` → insert trong 1 transaction.
- Không cần file `seed.sql` trung gian, không cần tạo user/mật khẩu DB.
- Quyền file: `var/` chỉ user chạy server đọc/ghi được (`chmod 700 var`, `chmod 600 var/game.db`).

### 6.4. Sao lưu

- Trong lúc chơi: mỗi 5 phút server chạy `VACUUM INTO 'var/backup-<giờ>.db'` → có bản sao nhất quán, không cần dừng game.
- Khôi phục: dừng server → copy bản backup thành `var/game.db` → chạy lại.

### 6.5. Xem / sửa dữ liệu

- Dùng `sqlite3` có sẵn trên macOS: `sqlite3 var/game.db` rồi `.tables`, `SELECT * FROM teams;`.
- App GUI (ví dụ DB Browser for SQLite) là phần mềm cài thêm → **hỏi duyệt trước**.
- Câu hỏi và dữ liệu tỉnh sửa trong `data/*.json` rồi chạy lại `init-db` (trước giờ chơi), không sửa trực tiếp trong DB.

---

## 7. Thiết kế API & realtime

### 7.1. REST API (thực tế — nguồn chuẩn: bảng `routes` trong `server/app.js`)

| Method | Endpoint | Quyền | Input | Output |
|---|---|---|---|---|
| GET | `/api/health` | Công khai | – | `{ ok: true }` |
| POST | `/api/rooms` | Công khai (≤ 5 lần/phút/IP) | `{ name, mode, teamCount, durationMin?, quizCount?, topicChoice?, betChoice?, pioneer?, listed? }` | Cookie chủ phòng, `{ code, ownerKey, screenCode }` — `ownerKey` **chỉ trả 1 lần** |
| GET | `/api/rooms/list` | Công khai (≤ 300 lần/phút/IP, hạn mức riêng) | – | `{ preset, open }`: phòng chơi đơn có sẵn + phòng công khai chưa kết thúc (tên, mã, kiểu, trạng thái, số người; phòng team kèm linh vật + số người từng team) — không tên người chơi. Màn vào phòng tự gọi 10 giây/lần |
| GET | `/api/rooms/preset` | Công khai (≤ 150 lần/phút/IP) | – | Chỉ phòng có sẵn (giữ cho tương thích) |
| GET | `/api/leaderboard` | Công khai (≤ 300 lần/phút/IP) | – | `{ entries: [{ rank, name, color, score, stamps, games }], players, plays, keepDays }` — top 100 |
| POST | `/api/rooms/lookup` | Công khai (≤ 150 lần/phút/IP) | `{ code }` | Tên phòng, trạng thái, danh sách team + số người (không có vị trí/điểm) |
| POST | `/api/join` | Công khai (như trên) | `{ code, name, teamId }` | Cookie người chơi, `{ role, teamId, name }` |
| POST | `/api/owner/login` | Công khai (≤ 10 lần/phút/IP) | `{ code, ownerKey }` | Cookie chủ phòng |
| POST | `/api/screen/login` | Công khai (như trên) | `{ code, screenCode }` | Cookie màn chiếu |
| POST | `/api/logout` | Đã đăng nhập | – | Xóa phiên (người chơi vẫn giữ chỗ trong team) |
| POST | `/api/leave` | Người chơi, chỉ trước khi bắt đầu | – | Rời phòng (để đổi team) |
| GET | `/api/provinces` | Mọi role đã đăng nhập | – | Thông tin tĩnh 34 tỉnh: tên, miền, điểm, sáp nhập, thành phố/thủ đô (`data/provinces.json` vẫn không phục vụ trực tiếp) |
| GET | `/api/me` | Người chơi | – | View của team: vị trí, giáp ranh, tỉnh của mình, `known` (mine/taken/free), câu đang chờ (không đáp án), thẻ, khóa, sự kiện, cảnh báo mất tỉnh, điểm, `trail` (đường hành trình), `members`, `log` (nhật ký team, có tên người thao tác), `lastResult`, `room`, `me` |
| POST | `/api/move` | Người chơi | `{ provinceId }` | `{ status: 'question' \| 'owned' \| 'own' \| 'shielded', question? }` |
| POST | `/api/retry` | Người chơi | – | Trả lời lại ở tỉnh đang đứng (hết khóa, tỉnh còn trống): kết quả như `/api/move` (`question` / `choose` / `owned` / `shielded`). Lỗi `own-province` nếu tỉnh đã là của đội; `locked` / `pending` / `choosing` như `/api/move`. View team có `canRetry` |
| POST | `/api/siege` | Người chơi | – | Câu hỏi công thành |
| POST | `/api/siege-bet` | Người chơi | `{ duelId, rounds }` (1–3) | Cược số hiệp khi thử tài (cả đội công thành lẫn đội giữ tỉnh); lỗi `bet-closed` / `bad-bet` / `bet-done` |
| POST | `/api/question` | Người chơi | `{ topic, bet }` (mã chủ đề hoặc `random`; `bet: true` = "Liều") | Khi đang chọn: phát câu hỏi `{ status: 'question', question }`. `/api/move` trả `{ status: 'choose', topics, bet }` nếu phòng bật chọn chủ đề (`topics`) và / hoặc đặt cược (`bet`) |
| POST | `/api/defend` | Người chơi | `{ duelId, answer }` (theo thứ tự đáp án của câu phòng thủ) | Đúng trước: `{ correct, held, bonus, province, correctAnswer, explanation }` · Sai: `{ correct:false }`. Lượt phòng thủ đang chờ có trong `defense: [{ duelId, province, …câu hỏi }]` của trạng thái team; câu công thành có `duel: true` |
| POST | `/api/vote` | Người chơi | `{ questionId, answer }` (choice / truefalse) | Chưa đủ người đồng ý: `{ voted, votes: [{ name, answer }] }`; mọi người đang mở trang cùng chọn → tự chốt, trả kết quả như `/api/answer`. Phiếu của cả team có trong `pendingQuestion.votes` |
| POST | `/api/skip` | Người chơi | – | Bỏ câu đang chờ: lùi về tỉnh trước, khóa 10 giây + thời gian đã xem (tối đa 30/45 giây) → `{ skipped, lockedUntil, province }`; quá giờ → như hết giờ |
| POST | `/api/retreat` | Người chơi | – | Quay về tỉnh trước |
| POST | `/api/answer` | Người chơi | `{ questionId, answer }` (choice: chỉ số theo thứ tự đã xáo; truefalse: boolean; text: chuỗi) | Đúng: `{ correct, captured, bonus, penalty, card, goldenBonus, betBonus, speedBonus, streak, correctAnswer, explanation }` · Sai/hết giờ: `{ correct:false, timeout, lockedUntil, pushedBack }` (không lộ đáp án). Câu hỏi gửi cho team có `issuedAt`, `freeUntil`, `deadline` (giờ server) |
| POST | `/api/card` | Người chơi | `{ cardId, target }` (scout: miền; shield: tỉnh của mình; march / fifty / time: –). fifty / time chỉ khi đang có câu hỏi | Kết quả dùng thẻ (fifty: `{ hidden }` vị trí 2 đáp án sai; time: `{ extraMs }`) |
| GET | `/api/stream` | Mọi role đã đăng nhập | – | SSE `event: state` — dữ liệu theo quyền |
| GET | `/api/screen` | Màn chiếu, chủ phòng | – | Đồng hồ, bảng điểm (null khi đóng băng), bản tin ẩn danh, sự kiện |
| GET | `/api/replay` | Màn chiếu, chủ phòng | – | Toàn bộ diễn biến — **chỉ sau khi kết thúc** |
| GET | `/api/owner/overview` | Chủ phòng | – | Toàn cảnh phòng: team, thành viên, vị trí, sở hữu, điểm, log, mã màn chiếu |
| GET | `/api/owner/question-stats` | Chủ phòng | – | % đúng từng câu trong phòng + mức đề xuất (bước 4.11, 7.9) |
| POST | `/api/owner/game` | Chủ phòng | `{ action: start \| pause \| resume \| end \| reset }` | Trạng thái |
| POST | `/api/owner/event` | Chủ phòng | `{ kind: festival \| storm \| golden \| rumor, region }` (golden / rumor: không cần miền) | Sự kiện |
| POST | `/api/owner/score` | Chủ phòng | `{ teamId, delta, reason }` (bắt buộc lý do, ghi log) | – |
| POST | `/api/owner/settings` | Chủ phòng | `{ topicChoice?, betChoice? }` | Bật/tắt cho chọn chủ đề / đặt cược |
| POST | `/api/owner/kick` | Chủ phòng | `{ playerId }` | Xóa người chơi + phiên, đóng kết nối realtime |
| GET | `/api/sys/session` | Công khai (luôn 200) | – | `{ admin: { username, displayName, mustChange } \| null }` |
| POST | `/api/sys/login` | Công khai (≤ 10 lần/phút/IP; sai 5 lần → khóa tài khoản 15 phút) | `{ username, password }` | Cookie `vnj_sysadmin`, `{ mustChange }` |
| POST | `/api/sys/logout`, `/api/sys/password` | Quản trị (dùng được cả khi chưa đổi mật khẩu tạm) | password: `{ current, next }` | – |
| GET | `/api/sys/overview`, `/api/sys/rooms`, `/api/sys/players`, `/api/sys/leaderboard`, `/api/sys/admins`, `/api/sys/log` | Quản trị | – | Tổng quan / mọi phòng / mọi người chơi / bảng xếp hạng (cả người bị ẩn) / tài khoản (không có mật khẩu băm) / nhật ký |
| POST | `/api/sys/rooms` | Quản trị | như `POST /api/rooms` | `{ roomId, code, ownerKey, screenCode }` |
| POST | `/api/sys/room/codes` · `/owner-key` · `/update` · `/delete` · `/control` | Quản trị | `{ roomId, … }` | Xem mã (ghi nhật ký) · tạo mã chủ phòng mới · sửa cấu hình · xóa · nhận phiên chủ phòng để mở `/admin.html` |
| POST | `/api/sys/player/rename` · `/kick` | Quản trị | `{ playerId, name? }` | Như chủ phòng, cho mọi phòng |
| POST | `/api/sys/leaderboard/rename` · `/hide` · `/delete` | Quản trị | `{ nameKey, name? \| hidden? }` | Đổi tên (trùng thì gộp) / ẩn / xóa mọi trận của tên đó |
| GET | `/api/sys/questions` · POST `/api/sys/question/get` · `/question/save` · `/question/hide` | Quản trị | `{ id }` · câu hỏi đầy đủ (id trống = thêm) · `{ id, hidden }` | Danh sách gọn (không đáp án) + chủ đề + tỉnh / câu đầy đủ / `{ id, warnings }` |
| GET | `/api/sys/questions/export` · `/api/sys/leaderboard.csv` · `/api/sys/backup` | Quản trị | – | Tải file: questions.json (định dạng gốc) / CSV bảng xếp hạng / bản sao lưu DB mới nhất |
| GET | `/api/sys/system` · POST `/api/sys/system/unblock` | Quản trị | `{ limiter, key }` | Số liệu server + danh sách bị chặn / bỏ chặn |
| GET · POST | `/api/sys/settings` · POST `/api/sys/rooms/delete-ended` | Quản trị | các khóa cài đặt | Cài đặt / số phòng đã xóa |
| GET | `/api/notice` | Công khai (≤ 300 lần/phút/IP) | – | `{ text }` thông báo chung đang bật, hoặc `null` |
| POST | `/api/sys/admins` · `/admins/reset` · `/admins/disable` | Quản trị | `{ username, displayName }` · `{ id }` · `{ id, disabled }` | Mật khẩu tạm (chỉ hiện một lần); không tự khóa mình |

### 7.2. Kênh SSE (lọc theo quyền ở server)

| Người nhận | Nhận được |
|---|---|
| Người chơi | Trạng thái team của mình (mọi thành viên cùng nhận), "Bạn vừa mất X", sự kiện của phòng, đồng hồ |
| Màn chiếu | Bản tin ẩn danh, đồng hồ, bảng điểm (trừ khi đang đóng băng), tín hiệu kết thúc |
| Chủ phòng | Mọi thứ **trong phòng của mình** |

Trang tự chọn loại dữ liệu bằng `/api/stream?view=team|screen|owner`; server kiểm tra vai được phép (chủ phòng xem được `screen` và `owner`, màn chiếu chỉ `screen`, người chơi chỉ `team`). Mỗi lần gửi, server kiểm tra phiên còn hiệu lực (bị kick / phòng bị xóa → đóng kết nối). Chỉ gửi cho các kết nối của phòng vừa thay đổi.

### 7.3. Xử lý tranh chấp
Chiếm/cướp tỉnh chạy trong **transaction**:
```
BEGIN IMMEDIATE
  SELECT team_id, shield_until FROM ownership WHERE province_id = ?
  kiểm tra: tỉnh còn trống / chủ hiện tại / shield
  INSERT ... ON CONFLICT(province_id) DO UPDATE ...
  UPDATE teams (bonus, vị trí)
  INSERT events_log
COMMIT   (lỗi → ROLLBACK)
```
- `node:sqlite` dùng API **đồng bộ** (`DatabaseSync`) và server chạy **1 process** → các request được xử lý lần lượt, không có hai transaction xen kẽ nhau. `BEGIN IMMEDIATE` là lớp an toàn thêm.
- Hai team trả lời đúng cùng lúc: request đến trước thắng, team sau nhận "Tỉnh vừa có chủ".
- Mỗi transaction rất ngắn (vài query) nên không làm chậm các team khác.

---

## 8. Nguyên tắc bảo mật

### 8.1. Bảo mật trong quá trình phát triển (trên máy bạn)

| Nguyên tắc | Chi tiết |
|---|---|
| Server dev chỉ bind `127.0.0.1` | Không máy nào khác truy cập được, không bật hộp thoại firewall |
| 0 dependency | Chỉ dùng module built-in của Node, kể cả DB (`node:sqlite`). **Thêm bất kỳ package nào phải được cho phép trước** |
| Không cài global, không `sudo` | Mọi thứ nằm trong thư mục project |
| Không tải script/binary lạ | Không `curl ... \| bash` |
| Không dùng tool quét bảo mật | Không `nmap`, `sqlmap`, `nikto`… Test gian lận bằng DevTools + `curl` vào localhost |
| Script giả lập tải chỉ chạy vào localhost | Không bắn tải vào host thật từ mạng công ty |
| **Proxy công ty** | Máy dev có `http_proxy` trỏ tới proxy công ty nhưng **không có `no_proxy`** → `curl` tới `127.0.0.1` sẽ đi vòng qua proxy (đã xảy ra 1 lần ngày 27/10: 4 request tới `127.0.0.1:3917`, proxy trả 503). Khuyến nghị thêm `export NO_PROXY=127.0.0.1,localhost` / `no_proxy=…` vào shell; khi gọi tay dùng `curl --noproxy 127.0.0.1`. `fetch` của Node trong test không dùng proxy |
| Secret không vào repo | `.env` trong `.gitignore`, repo để private |
| Khuyến nghị | Tắt auto mode của Claude Code để duyệt từng lệnh trước khi chạy |

### 8.2. Những thứ code sẽ KHÔNG có

| ❌ Không có | Lý do |
|---|---|
| `child_process`, `eval`, `new Function`, `vm` | Thực thi lệnh/mã động |
| Kết nối ra internet, CDN, telemetry, analytics | Nghi ngờ rò rỉ dữ liệu |
| Quét mạng, mDNS, tự dò tìm máy | Giống hành vi trinh sát |
| Chạy quyền admin/root, port < 1024 | Leo thang đặc quyền |
| Tự khởi động cùng máy, service ẩn | Hành vi bám trụ |
| Sửa firewall/antivirus/cấu hình hệ thống | Vi phạm chính sách |
| Code minify/obfuscate | Khó kiểm tra |
| Ghi file ngoài thư mục project | Hành vi bất thường |

### 8.3. Bảo mật ứng dụng

| Rủi ro | Biện pháp |
|---|---|
| Xem đáp án qua F12 | Đáp án chỉ ở server, client chỉ nhận câu hỏi + lựa chọn |
| Xem vị trí team khác | Sương mù lọc ở server, SSE gửi dữ liệu theo quyền |
| Giả danh team | Token ngẫu nhiên (`crypto.randomBytes(32)`), lưu **hash** trong DB, cookie `HttpOnly; Secure; SameSite=Strict` |
| Dò mã phòng / mã chủ phòng | Mã phòng 6 ký tự, mã chủ phòng 8 ký tự (bảng 32 ký tự, scrypt), rate limit theo IP; sai mã phòng và sai mã chủ phòng trả cùng một lỗi, cùng thời gian xử lý |
| Spam tạo phòng | ≤ 5 phòng/phút/IP, tối đa 50 phòng chưa kết thúc, phòng tự xóa sau 24 giờ |
| Người lạ vào phòng | Chỉ cần mã phòng là vào được (chấp nhận cho sự kiện nội bộ). Chủ phòng thấy danh sách người chơi và **kick** được |
| Sửa request để gian lận | Server kiểm tra: giáp ranh, khóa, câu hỏi đang chờ, trạng thái game |
| Spam đáp án | Khóa 30–45 giây khi sai, rate limit theo token |
| SQL injection | 100% prepared statement, không ghép chuỗi SQL |
| XSS (tên team chứa script) | Dùng `textContent`, không `innerHTML` với dữ liệu động; giới hạn độ dài và ký tự tên team |
| Path traversal | Phục vụ file tĩnh theo whitelist cố định |
| Payload lớn | Giới hạn body 10KB, `JSON.parse` trong try/catch |
| CSRF | Cookie `SameSite=Strict` + kiểm tra header `Origin` với request POST |
| Clickjacking | `X-Frame-Options: DENY` / CSP `frame-ancestors 'none'` |
| Headers | `Content-Security-Policy: default-src 'self'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, HSTS (trên host) |
| Trang chủ phòng | Đăng nhập bằng mã phòng + mã chủ phòng; mỗi chủ phòng chỉ điều khiển được phòng của mình |
| Lỗi lộ thông tin | Không trả stack trace về client, chỉ log ở server |

### 8.4. Bảo mật khi deploy host tạm thời

| Hạng mục | Biện pháp |
|---|---|
| HTTPS | Let's Encrypt qua Nginx/Caddy |
| Giới hạn truy cập | Chỉ cho IP public văn phòng (nếu được); nếu không → thêm "mã sự kiện" trước đăng nhập |
| Firewall host | Chỉ mở 443 (và 80 để redirect). SSH 22 chỉ cho IP của bạn, dùng SSH key, tắt đăng nhập bằng mật khẩu |
| Node, SQLite | Node bind `127.0.0.1`, chạy bằng user thường (không root); file DB trong `var/` quyền `600`, nằm ngoài thư mục được phục vụ |
| Cập nhật | Vá OS, Node bản LTS mới nhất trước khi deploy |
| Log | Bật access log để phát hiện truy cập lạ |
| Thời gian sống | Deploy trước tổng duyệt, **gỡ ngay sau sự kiện** |

---

## 9. Các phase triển khai

### Phase 0 – Chuẩn bị & thông báo IT/SOC

> ✖ **Bỏ (quyết định 31/10/2026): deploy VPS ngoài.** Ghi chú cũ: ⏸ **Hoãn (quyết định 27/10/2026): làm sau cùng, trước Phase 6 – Deploy.** Trong lúc phát triển, server chỉ chạy `127.0.0.1` trên máy dev, không mở port ra mạng, không deploy — nên chưa cần báo IT/SOC. Khi làm, cập nhật email mẫu (mục 12.1) theo stack hiện tại: Node built-in + SQLite, 0 dependency, dữ liệu GeoJSON tải một lần.
**Thời gian:** 27/10 – 31/10 · **Người làm:** Bạn (Claude soạn email)

| # | Công việc | Đầu ra |
|---|---|---|
| 0.1 | Chốt các giả định ở mục 2 | Bảng giả định đã cập nhật |
| 0.2 | Gửi email/ticket báo IT/SOC (mẫu ở Phụ lục 12.1) | Email/ticket |
| 0.3 | Hỏi IT: có server nội bộ dùng được không? IP public văn phòng? Có chặn domain mới không? | Thông tin hạ tầng |
| 0.4 | Chọn host (server nội bộ / VPS) | Quyết định host |
| 0.5 | Kiểm tra môi trường dev: Node v22.23.4 (có `node:sqlite`), pnpm, `sqlite3` CLI — **đã kiểm tra ngày 27/10: OK** | Ghi phiên bản vào README, `.node-version` |

**Điều kiện hoàn thành:** IT/SOC đã nắm thông tin, giả định đã chốt.

---

### Phase 1 – Dữ liệu & nội dung
**Thời gian:** 28/10 – 6/11 · **Người làm:** Claude soạn, bạn duyệt

| # | Công việc | Đầu ra |
|---|---|---|
| 1.1 | ✅ **Bản nháp xong 27/10** — danh sách 34 tỉnh/thành: tên, miền, tỉnh cũ sáp nhập, nơi đặt trung tâm hành chính, điểm, thành phố trực thuộc TW (9). Chờ duyệt `adminCenterAt` | `data/provinces.json` |
| 1.2 | Giáp ranh: **lấy tự động** từ `data/map-geo.json` (58 cặp) — rà lại các cặp chỉ giáp qua sông/biển (ví dụ Đồng Tháp – TP.HCM) | Trong `map-geo.json` |
| 1.3 | Dựng dữ liệu bản đồ theo **mục 5.8** — ✅ bản đầu đã xong 27/10; còn: thêm đường biên 3 miền, đối chiếu bằng mắt với sapnhap.bando.com.vn | `scripts/build-map.mjs`, `data/map-geo.json` |
| 1.4 | Soạn câu hỏi thường: 4 câu/tỉnh, trộn dạng (trắc nghiệm, điền chữ, đúng/sai). **Định hướng nội dung: ưu tiên ẩm thực, đời sống, phong tục, làng nghề, lễ hội** (ẩm thực + đời sống ≥ 35%); lịch sử, địa lý, di sản vừa phải; **hạn chế câu hành chính/sáp nhập (≤ 10%)**. ✅ **Bản nháp đủ 34 tỉnh xong 27/10** (Bắc 15, Trung 11, Nam 8 — 136 câu thường). Tránh câu lộ đáp án (đáp án là chính tỉnh đang đứng) — script tự cảnh báo | `data/questions.json` |
| 1.5 | Soạn câu công thành: 2 câu/tỉnh, khó hơn. ✅ **Bản nháp đủ 34 tỉnh xong 27/10** (68 câu) | Trong `questions.json` |
| 1.11 | ✅ **Chấm mức độ khó ban đầu 27/10** — trường `level` (1 Dễ / 2 Vừa / 3 Khó) cho 204 câu, **dựa trên đánh giá chủ quan** về độ phổ biến của kiến thức (con số/năm chính xác, tên tiếng dân tộc, chi tiết rất địa phương → Khó). Trang duyệt: `docs/questions-review.html`. **Sẽ chấm lại theo số liệu thật sau tổng duyệt (bước 7.9)** | `level` trong `questions.json` |
| 1.6 | ✅ **Bản nháp xong 27/10** — 6 bộ sưu tập: Di sản UNESCO, Biển đảo tiền tiêu, Nóc nhà Tây Bắc, Đại ngàn Tây Nguyên, Chín rồng Cửu Long, Kinh đô xưa (cần ≥ 3 tỉnh/bộ, thưởng +300) | Trong `provinces.json` |
| 1.7 | Duyệt nội dung. **27/10: sub agent đối chiếu nguồn chính thống** (gov.vn, UNESCO, báo lớn) — 1 đáp án sai (Then Kin Pang: người Thái, không phải Lự), 2 lỗi diễn giải, 2 câu viết lại → **đã sửa**; `adminCenterAt` khớp NQ 60-NQ/TW; Bắc Ninh thuộc bộ UNESCO là đúng (ghi danh 12/7/2025). Còn: chủ dự án đọc duyệt văn phong/độ khó | `docs/factcheck-2026-10-27.md` |
| 1.8 | ✅ **Xong 27/10** — `db/schema.sql` + `scripts/init-db.mjs`: tạo `var/game.db` (thư mục quyền 700, file 600), nạp 34 tỉnh, 58 cặp giáp ranh, 6 bộ sưu tập, 204 câu; nạp trong 1 transaction, lỗi thì xóa DB dở dang; `--reset` chỉ xóa được file trong `var/`. Khung project: `package.json` (0 dependency), `.node-version`, `.gitignore`, `.env.example` | `pnpm run db:init` / `db:reset` |
| 1.9 | ✅ Mockup so sánh kiểu bản đồ (**mục 5.9**) — ✅ đã chốt Bản đồ thật + phong cách Hoạt hình (mục 5.10) | `mockup/map-styles.html` |
| 1.10 | ✅ Script kiểm tra dữ liệu (34 tỉnh khớp bản đồ, điểm đúng quy tắc, câu hỏi hợp lệ, độ phủ, phân bố đáp án) — chạy `node scripts/validate-data.mjs` | `scripts/validate-data.mjs` |

**Điều kiện hoàn thành:** 100% dữ liệu sáp nhập đã đối chiếu văn bản chính thức; mọi câu hỏi có đáp án + giải thích; bạn đã duyệt.

---

### Phase 2 – Backend
**Thời gian:** 3/11 – 10/11 · **Người làm:** Claude

| # | Công việc | Đầu ra |
|---|---|---|
| 2.1 | ✅ Khởi tạo project: `package.json` (0 dependency, `engines`, `packageManager`, scripts), `.node-version`, `.gitignore`, `.env.example` | Khung project |
| 2.2 | ✅ `db/schema.sql` + `server/db.js` (PRAGMA, prepared statement, transaction, backup định kỳ) + chạy `init-db` | `var/game.db` sẵn sàng |
| 2.3 | ✅ `server/index.js`: http server bind `127.0.0.1`, router, xử lý lỗi tập trung | Server chạy |
| 2.4 | ✅ `security.js`: headers, giới hạn body, rate limit | Middleware |
| 2.5 | ✅ `static.js`: phục vụ file theo whitelist | |
| 2.6 | ✅ `auth.js`: login PIN (scrypt), token, khóa sau 5 lần sai, admin password — **27/10 thay bằng phòng (mục 3.0)** | |
| 2.7 | ✅ `game.js`: move, answer, siege, retreat, capture (transaction), scoring, bộ sưu tập, xuyên 3 miền. **Xáo trộn thứ tự lựa chọn mỗi lần phát câu hỏi** (server giữ ánh xạ đáp án) để người chơi không đoán theo vị trí | Luật chơi đầy đủ |
| 2.8 | ✅ Thẻ bài: scout, shield, march | |
| 2.9 | ✅ (gộp vào `game.js` + `app.js` tick) `events.js`: timer game, đóng băng, Lễ hội/Bão/Tin đồn, kết thúc | |
| 2.10 | ✅ `sse.js`: quản lý kết nối, gửi theo quyền, heartbeat 15 giây, tự kết nối lại | |
| 2.11 | ✅ API admin + replay | |
| 2.12 | ✅ Unit test luật chơi bằng `node:test` | `tests/game.test.js` |
| 2.13 | ✅ Test tầng HTTP + bảo mật (header, whitelist file tĩnh, cookie, giới hạn đăng nhập, Origin, giới hạn body, phân quyền, không lộ đáp án) — **40/40 test qua (27/10)** | `tests/app.test.js` |

**Điều kiện hoàn thành:** Mọi API test được bằng `curl` trên localhost; unit test pass; không có đáp án trong bất kỳ response nào của team.

---

### Phase 3 – Màn hình team
**Thời gian:** 8/11 – 14/11 · **Người làm:** Claude

> Thiết kế hình ảnh, trạng thái ô, hiệu ứng và bố cục theo **mục 5**.

| # | Công việc |
|---|---|
| 3.0 | Dựng `shared/map.js`: vẽ bản đồ thật từ `map-geo.json`, 8 lớp SVG, đổi trạng thái bằng class CSS, phóng to/kéo + nút 📍 (mục 5.3, 5.4, 5.7) |
| 3.1 | ~~Màn đăng nhập PIN~~ → màn **Tạo phòng / Vào phòng** (mã phòng + tên + chọn team), sảnh chờ, danh sách thành viên |
| 3.2 | Bản đồ SVG: tỉnh của mình (màu team), vị trí hiện tại, tỉnh giáp ranh (sáng lên, bấm được), sương mù |
| 3.3 | Popup câu hỏi theo 4 dạng + đồng hồ đếm ngược + hiện giải thích sau khi trả lời |
| 3.4 | Màn "Tỉnh đã có chủ" → Công thành / Rút lui |
| 3.5 | Trạng thái bị khóa (đếm ngược) |
| 3.6 | Thông báo "Bạn vừa mất X!" |
| 3.7 | Khu thẻ bài + chọn mục tiêu |
| 3.8 | Thanh trạng thái: điểm của mình, số tỉnh, thời gian còn lại, sự kiện đang diễn ra |
| 3.9 | Phím Esc che màn hình |
| 3.10 | Âm thanh: đúng, sai, chiếm tỉnh, mất tỉnh, sự kiện |
| 3.11 | Tự kết nối lại khi rớt mạng, khôi phục trạng thái từ `/api/me` |

**Điều kiện hoàn thành:** Chơi trọn 1 vòng trên Chrome + Edge, độ phân giải từ 1366×768.

---

### Phase 4 – Màn chiếu & màn MC
**Thời gian:** 12/11 – 16/11 · **Người làm:** Claude

**Màn chiếu**
| # | Công việc |
|---|---|
| 4.1 | Đồng hồ lớn, tên sự kiện, sự kiện đang diễn ra |
| 4.2 | Bản tin ẩn danh chạy chữ |
| 4.3 | Bảng điểm (ẩn tên tỉnh), chuyển sang "Đã đóng băng" ở 10 phút cuối |
| 4.4 | Màn công bố: tua lại hành trình từng team trên bản đồ → bảng xếp hạng → hiệu ứng chúc mừng |

**Màn MC**
| # | Công việc |
|---|---|
| 4.5 | Trang chủ phòng: đăng nhập lại bằng mã phòng + mã chủ phòng; hiện mã phòng, link mời, mã màn chiếu |
| 4.6 | Bắt đầu / tạm dừng / tiếp tục / kết thúc / reset |
| 4.7 | Danh sách thành viên từng team, kick người chơi (tạo team đã chuyển sang lúc tạo phòng) |
| 4.8 | Kích hoạt sự kiện |
| 4.9 | Xem bản đồ thật, điểm chi tiết từng team |
| 4.10 | Sửa điểm có lý do (ghi log) |
| 4.11 | **Thống kê theo câu hỏi** (chỉ MC/admin): số lượt trả lời, % đúng, mức hiện tại, mức đề xuất theo % đúng — lấy từ bảng `answered` |

**Điều kiện hoàn thành:** MC điều khiển trọn 1 game từ đầu đến màn công bố.

---

### Phase 5 – Tăng cường bảo mật & review
**Thời gian:** 16/11 – 18/11 · **Người làm:** Claude, bạn kiểm tra lại

**Checklist:**
- [x] `package.json` không có `dependencies`/`devDependencies` (hoặc chỉ có package đã duyệt ở mục 12.5)
- [x] Repo chỉ có `pnpm-lock.yaml`, không có `package-lock.json`; tài liệu/script không dùng `npm`, `npx`
- [x] Frontend không có `<script src="http...">`, `<link href="http...">`, `import` từ URL ngoài
- [x] Backend chỉ `require`/`import` module `node:*` và file nội bộ
- [x] 100% query dùng prepared statement (grep không có SQL ghép chuỗi)
- [x] Node bind `127.0.0.1`
- [x] File DB nằm trong `var/`, ngoài `public/`; thử truy cập `/var/game.db`, `/../var/game.db` qua web đều bị chặn
- [x] Quyền `var/` là `700`, `game.db` là `600`; `var/` có trong `.gitignore`
- [x] `.env` trong `.gitignore`, có `.env.example`
- [x] Không response nào của team/screen chứa `answer`
- [x] Sương mù lọc ở server (kiểm tra bằng DevTools → Network)
- [x] Không `innerHTML` với dữ liệu động (grep)
- [x] Không `child_process`, `eval`, `new Function`, kết nối ra ngoài (grep)
- [x] Static whitelist, thử `/../` bị chặn
- [x] Giới hạn body, `JSON.parse` an toàn
- [x] Rate limit + khóa đăng nhập sai
- [x] Cookie `HttpOnly; Secure; SameSite=Strict`, kiểm tra `Origin`
- [x] Đủ security headers
- [x] Không lộ stack trace
- [x] `pnpm audit` sạch — không áp dụng (0 dependency, không lockfile)
- [ ] Chạy `/gkit-review-security` và sửa các phát hiện

**Đầu ra:** Báo cáo review bảo mật (gửi IT/SOC nếu cần) — ✅ `docs/security-review-2026-10-30.md` (30/10). Kiểm chứng chỉ bằng test tự động, không thăm dò server.

---

### Phase 6 – Deploy host tạm thời
> Hướng dẫn chi tiết từng bước: **`docs/DEPLOY.md`**. Quyết định 31/10: VPS thuê ngoài + Nginx; không dùng Vercel/Supabase (phải viết lại backend: SQLite→Postgres, SSE→Realtime, cookie cross-site).

**Thời gian:** 18/11 – 19/11 · **Người làm:** Bạn + Claude hướng dẫn

| # | Công việc |
|---|---|
| 6.1 | ~~Báo IT trước khi SSH/deploy~~ — bỏ (quyết định 31/10). Thuê VPS + domain |
| 6.2 | Chuẩn bị host: cập nhật OS, tạo user thường, SSH key, tắt đăng nhập mật khẩu |
| 6.3 | Firewall: chỉ mở 80/443, SSH chỉ cho IP của bạn |
| 6.4 | Cài đúng Node v22.23.4 (không cần cài database) |
| 6.5 | Lấy code từ git (repo private → deploy key chỉ đọc; 0 dependency nên không có bước install), tạo `.env` trên host |
| 6.6 | Reverse proxy + HTTPS; cấu hình SSE (`proxy_buffering off`, timeout dài) |
| 6.7 | Giới hạn IP văn phòng (hoặc mã sự kiện) |
| 6.8 | Chạy server bằng user thường (systemd tạm thời hoặc chạy tay trong `tmux`) |
| 6.9 | Kiểm tra từ mạng công ty và từ 4G (xác nhận chặn IP hoạt động) |

**Điều kiện hoàn thành:** Truy cập được qua HTTPS từ mạng công ty, realtime hoạt động, bên ngoài bị chặn.

---

### Phase 7 – Kiểm thử & tổng duyệt
**Thời gian:** 19/11 – 21/11 · **Người làm:** Bạn + 6–8 đồng nghiệp

| # | Loại test | Nội dung |
|---|---|---|
| 7.1 | Luật chơi | Giáp ranh, chiếm, cướp, phòng thủ, thẻ bài, sự kiện, đóng băng, hết giờ, tính điểm |
| 7.2 | Gian lận | DevTools, sửa request, dùng token team khác, gửi đáp án liên tục, đi tỉnh không giáp ranh |
| 7.3 | Đồng thời | `simulate-teams.js` (localhost): 6 team cùng chiếm 1 tỉnh |
| 7.4 | Sự cố | Restart server giữa game → tiếp tục đúng; laptop rớt wifi → kết nối lại |
| 7.5 | Trình duyệt | Chrome, Edge trên laptop công ty |
| 7.6 | **Tổng duyệt** | 6–8 người chơi thật 20 phút trên host, từ mạng công ty |
| 7.7 | Xác nhận SOC | Hỏi IT/SOC có cảnh báo gì trong buổi tổng duyệt không |
| 7.8 | Sửa lỗi + điều chỉnh cân bằng | Điểm, thời gian khóa, độ khó câu hỏi |
| 7.9 | **Chấm lại mức độ khó theo số liệu thật** | Sau tổng duyệt chạy `node scripts/recalibrate-levels.mjs` (đọc bảng `answered`): **% đúng > 70% → Dễ, 40–70% → Vừa, < 40% → Khó**; câu có < 3 lượt trả lời giữ mức cũ. Script chỉ **in đề xuất**, chủ dự án duyệt rồi mới ghi vào `questions.json`. Câu công thành bị thành Dễ → đổi chỗ với câu thường khó cùng tỉnh |

**Điều kiện hoàn thành:** Tổng duyệt không có lỗi chặn; góp ý đã xử lý.

---

### Phase 8 – Ngày sự kiện
**Thời gian:** 24/11

**Trước giờ chơi (T–60 phút)**
- [ ] Kiểm tra host đang chạy, HTTPS hợp lệ
- [ ] Tạo phòng mới, chiếu mã phòng / link mời lên màn hình cho mọi người vào
- [ ] Mở `team.html` trên 6 laptop, `screen.html` trên máy chiếu, `admin.html` trên máy MC
- [ ] Kiểm tra âm thanh máy chiếu
- [ ] Bố trí chỗ ngồi: các team ở góc riêng, màn hình quay vào tường
- [ ] Chuẩn bị phương án dự phòng (PDF câu hỏi + bảng chấm điểm tay)

**Trong giờ chơi**
- MC phổ biến luật (5 phút) → bắt đầu → kích hoạt sự kiện ở phút ~15 và ~30 → đóng băng ở phút 35 → kết thúc → màn công bố.

**Phân công**
| Vai trò | Người |
|---|---|
| MC | _(điền)_ |
| Kỹ thuật trực (theo dõi server, log) | _(điền)_ |
| Trọng tài (xử lý tranh chấp đáp án) | _(điền)_ |

---

### Phase 9 – Gỡ bỏ & dọn dẹp
**Thời gian:** 24/11 – 25/11

- [ ] Xuất kết quả + `events_log` (nếu muốn lưu kỷ niệm)
- [ ] Dừng server
- [ ] **Xóa host / VPS**, xóa bản ghi DNS (nếu có)
- [ ] Xóa `var/game.db` và các file backup trên host (cùng với việc xóa host)
- [ ] Thu hồi SSH key đã thêm vào host
- [ ] Báo IT/SOC: đã kết thúc, đã gỡ
- [ ] Ghi lại bài học kinh nghiệm

---

## 10. Timeline tổng hợp

| Tuần | Ngày | Phase | Mốc |
|---|---|---|---|
| 1 | 27/10 – 2/11 | 1. Dữ liệu (gần xong 27/10) · bắt đầu 2. Backend | Thiết kế + dữ liệu chốt |
| 2 | 3/11 – 9/11 | 1. Duyệt nội dung · 2. Backend | **6/11: nội dung duyệt xong** |
| 3 | 10/11 – 16/11 | 2. Hoàn thiện backend · 3. Màn team · 4. Màn chiếu/MC | **16/11: chơi được trọn vẹn trên local** |
| 4 | 17/11 – 23/11 | 5. Bảo mật · 6. Deploy · 7. Tổng duyệt | **21/11: tổng duyệt** · 22–23/11: buffer sửa lỗi |
| – | 24/11 | 8. Sự kiện · 9. Gỡ bỏ | 🎉 |

---

## 11. Rủi ro & phương án dự phòng

| Rủi ro | Khả năng | Ảnh hưởng | Phương án |
|---|---|---|---|
| Dữ liệu sáp nhập sai → tranh cãi | Trung bình | Cao | Đối chiếu văn bản chính thức; trọng tài có quyền sửa điểm |
| Dữ liệu bản đồ (nguồn cộng đồng) sai hoặc lỗi thời | Thấp | Cao | Dữ liệu gốc từ sapnhap.bando.com.vn; đối chiếu bằng mắt; ghi tag + SHA-256; có nghị quyết mới thì tải tag mới (mục 5.8) |
| Nhãn tỉnh chồng chữ ở khu vực dày đặc | Cao | Thấp | Mặc định phóng tới khu vực quanh team; thu nhỏ/ẩn bớt nhãn khi xem toàn bộ |
| IT/SOC không duyệt host bên ngoài | Trung bình | Cao | Xin server nội bộ; hoặc quay về phương án LAN |
| Phase 0 làm muộn → IT/SOC phản hồi không kịp trước tổng duyệt (21/11) | Trung bình | Cao | Gửi email **chậm nhất ~10/11**; chuẩn bị sẵn phương án LAN (server chạy trên 1 laptop trong phòng) nếu chưa được duyệt host |
| Proxy công ty chặn domain hoặc SSE | Trung bình | Cao | Báo IT whitelist sớm; test ở Phase 6; fallback polling 2 giây |
| Wifi sự kiện yếu | Trung bình | Trung bình | SSE nhẹ; tự kết nối lại; chuẩn bị router/hotspot dự phòng |
| Server sập giữa game | Thấp | Cao | Trạng thái lưu trong file SQLite, restart là chơi tiếp; có backup 5 phút/lần; MC tạm dừng game |
| `node:sqlite` thay đổi API (đang experimental) | Thấp | Trung bình | Cố định Node v22.23.4 ở cả dev và host; test lại trên host trước tổng duyệt |
| Team nhìn trộm màn hình nhau | Cao | Thấp | Bố trí chỗ ngồi; phím Esc che màn hình |
| Không kịp tiến độ | Trung bình | Cao | Cắt theo thứ tự: sự kiện Bão → thẻ bài → màn tua lại → bộ sưu tập |
| Câu hỏi quá khó/dễ | Trung bình | Trung bình | Điều chỉnh sau tổng duyệt |

---

## 12. Phụ lục

### 12.1. Mẫu email gửi IT/SOC

> **Tiêu đề:** [Thông báo] Web mini game nội bộ cho sự kiện Ngày Văn hóa Việt Nam 24/11
>
> Chào team IT/SOC,
>
> Mình đang phát triển một web mini game nội bộ phục vụ sự kiện Ngày Văn hóa Việt Nam 24/11. Mình gửi thông tin để team nắm và hỗ trợ nếu cần:
>
> - **Mục đích:** Game đố vui theo team, không thu thập dữ liệu cá nhân (chỉ có tên team và điểm). *(Cần sửa khi viết lại email — 30/10: phòng chơi đơn lưu **tên hiển thị người chơi tự nhập + điểm** vào bảng xếp hạng cả sự kiện, công khai ở `/leaderboard`, giữ 7 ngày rồi tự xóa; không email, không tài khoản.)*
> - **Công nghệ:** Node.js v22.23.4 chỉ dùng module có sẵn (database SQLite dạng file qua `node:sqlite`), **không cài package bên ngoài nào**. Frontend HTML/CSS/JS thuần, không dùng CDN hay dịch vụ bên ngoài.
> - **Môi trường dev:** Máy `<tên máy>`, server chỉ chạy trên localhost (127.0.0.1).
> - **Host tạm thời:** `<server nội bộ / VPS / domain / IP>`, chỉ mở HTTPS 443, giới hạn truy cập theo IP văn phòng.
> - **Thời gian host chạy:** `<ngày deploy>` đến 25/11/2026, sau đó gỡ bỏ hoàn toàn.
> - **Kết nối từ máy công ty:** SSH tới host để deploy; các laptop team truy cập HTTPS tới host vào buổi tổng duyệt (`<ngày>`) và ngày sự kiện 24/11.
> - **Source code:** `<link repo private>` — team có thể review nếu cần.
>
> Nhờ team cho mình biết:
> 1. Công ty có server nội bộ nào mình dùng được không?
> 2. IP public của văn phòng để mình giới hạn truy cập?
> 3. Có cần whitelist domain/IP trên proxy không?
>
> Cảm ơn team!

### 12.2. Biến môi trường (`.env.example`)

```
HOST=127.0.0.1
PORT=3000
DB_PATH=./var/game.db
BACKUP_INTERVAL_MIN=5
COOKIE_SECURE=false          # true trên host (HTTPS)
ALLOWED_ORIGIN=http://127.0.0.1:3000
TRUST_PROXY=false            # true trên host sau Nginx (lấy IP từ X-Real-IP)
GAME_DURATION_MIN=45         # thời lượng mặc định khi chủ phòng không chọn
FREEZE_BEFORE_END_MIN=10
# SECRET_KEY=                # (không bắt buộc) 64 ký tự hex — khóa mã hóa mã chủ phòng; bỏ trống thì tự tạo var/secret.key
```

### 12.3. Lệnh chạy dev (dự kiến)

```bash
cp .env.example .env
pnpm run data:check                   # kiểm tra dữ liệu tỉnh + câu hỏi
pnpm run db:init                      # tạo var/game.db từ schema + data/*.json
pnpm run db:reset                     # xóa và tạo lại DB (trước mỗi lần chơi thử) — XÓA CẢ TÀI KHOẢN QUẢN TRỊ
pnpm run admin:create -- <tên> "<Tên hiển thị>"   # tạo tài khoản quản trị, in mật khẩu tạm
pnpm run dev                          # http://127.0.0.1:3000
pnpm run test                         # chạy unit test (node:test)
sqlite3 var/game.db                   # xem dữ liệu
```

`package.json`: xem file thật trong project (0 dependency, `packageManager: pnpm@10.29.3`, `engines.node: 22.23.4`). Các lệnh `dev`/`start` sẽ thêm khi có server (Phase 2).

### 12.4. URL các màn hình

| Màn hình | URL |
|---|---|
| Tạo phòng / vào phòng / chơi | `/` (hoặc `/team.html`); link mời `/?room=MÃ` |
| Máy chiếu | `/screen.html` (mã phòng + mã màn chiếu) |
| Chủ phòng (MC) | `/admin.html` (mã phòng + mã chủ phòng) — Phase 4 |
| Quản trị (ban tổ chức) | `/quan-tri` (tài khoản admin; 404 khi chưa có tài khoản nào) |
| Bảng xếp hạng cá nhân | `/leaderboard` |

### 12.5. Nhật ký dependency

Mọi dependency phải được ghi ở đây **trước khi** cài. Package không có trong bảng này với trạng thái "Đã duyệt" thì không được cài.

| Package | Phiên bản | Loại | Lý do | Người duyệt | Ngày | Trạng thái |
|---|---|---|---|---|---|---|
| `mysql2` | – | dependency | Driver MySQL | Chủ dự án | 27/10/2026 | ❌ Đã bỏ — chuyển sang `node:sqlite` built-in (27/10/2026) |
| Font **Nunito** — [google/fonts `ofl/nunito`](https://github.com/google/fonts/tree/main/ofl/nunito) | bản `main` tải 27/10/2026 | asset (font, không phải code) | Chữ bo tròn đều trên mọi máy (Windows không có SF Rounded). Giấy phép SIL OFL 1.1. Tải 1 lần, lưu `public/fonts/nunito.ttf` (font biến thiên 200–1000, 277 KB, SHA-256 `bb55a5ca…5207`) + `public/fonts/OFL-Nunito.txt` (SHA-256 `580df76c…fdf65`); phục vụ qua whitelist, không tải từ CDN | Chủ dự án | 27/10/2026 | ✅ Đã duyệt |
| Dữ liệu GeoJSON 34 tỉnh — [ThangLeQuoc/vietnamese-provinces-database](https://github.com/ThangLeQuoc/vietnamese-provinces-database) | tag `v5.2.0` | dữ liệu (không phải code) | Vẽ bản đồ thật + tính giáp ranh tự động. Giấy phép MIT, dữ liệu gốc từ sapnhap.bando.com.vn. Chỉ tải 34 file `json/geojson/*/*.geojson` cấp tỉnh, không clone repo, không chạy script nào của repo. File gốc không commit; chỉ commit `data/map-geo.json` đã xử lý bằng `scripts/build-map.mjs` | Chủ dự án | 27/10/2026 | ✅ Đã duyệt |
