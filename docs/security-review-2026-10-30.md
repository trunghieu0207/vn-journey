# Báo cáo review bảo mật (Phase 5) — 30/10/2026

Phạm vi: toàn bộ `server/` (~2.700 dòng), `public/` (grep), `package.json`, cấu hình, quyền file. Cách làm: đọc code + grep + test tự động (`pnpm run test`: **113/113**). Không dùng tool quét, không gửi request thăm dò vào server (xem lưu ý cuối).

## 1. Checklist Phase 5

| Mục | Kết quả |
|---|---|
| `package.json` không có dependency | ✅ 0 dependency |
| Chỉ pnpm, không `package-lock.json`, tài liệu/script không dùng `npm`/`npx` | ✅ (chưa có `pnpm-lock.yaml` vì 0 dependency) |
| Frontend không tải script/style/font từ URL ngoài | ✅ grep `src=`/`href=`/`import`/`url()` không có `http` |
| Backend chỉ import `node:*` + file nội bộ | ✅ `node:crypto, fs, fs/promises, http, path, sqlite, url` |
| 100% prepared statement | ✅ 5 chỗ nội suy SQL đều là hằng trong code (tên bảng / câu con cố định), không có dữ liệu người dùng |
| Node bind `127.0.0.1` | ✅ `HOST` mặc định `127.0.0.1` |
| DB trong `var/`, ngoài `public/`; quyền `var/` 700, `game.db` 600; `var/` trong `.gitignore` | ✅ — **sửa**: bản sao lưu trước đây 644, nay `chmod 600` sau mỗi lần sao lưu |
| `.env` trong `.gitignore`, có `.env.example` | ✅ |
| Không response team/màn chiếu nào chứa đáp án | ✅ test sẵn có (`game.test.js`, `app.test.js`) |
| Sương mù lọc ở server | ✅ `teamView` chỉ gửi tỉnh đã ghé + "mine/taken/free"; test sẵn có |
| Không `innerHTML` với dữ liệu động | ✅ 4 chỗ `innerHTML` đều gán chuỗi hằng (icon, mây, defs SVG) |
| Không `child_process`, `eval`, `new Function`, kết nối ra ngoài | ✅ |
| File tĩnh theo whitelist, `/../` bị chặn | ✅ `server/static.js` tra bảng cố định; test sẵn có |
| Giới hạn body 10KB, `JSON.parse` an toàn, bắt buộc `application/json` | ✅ |
| Rate limit + khóa đăng nhập sai | ✅ tạo phòng 5/phút/IP, đăng nhập 10/phút/IP, vào phòng 150/phút/IP, API 60/10 giây/phiên — **xem 2.4** khi chạy sau Nginx |
| Cookie `HttpOnly; SameSite=Strict` (+ `Secure` khi `COOKIE_SECURE=true`), kiểm tra `Origin` | ✅ |
| Security headers | ✅ CSP `default-src 'self'` … `frame-ancestors 'none'`, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, COOP/CORP; HSTS khi HTTPS |
| Không lộ stack trace | ✅ lỗi 500 chỉ trả "Lỗi máy chủ", chi tiết ghi log server |
| `pnpm audit` | Không áp dụng: 0 dependency, không có lockfile (lệnh này còn gọi mạng ra registry) |
| `/gkit-review-security` | **Chưa chạy** — chờ chủ dự án quyết |

## 2. Phát hiện và đã sửa

### 2.1. [Cao] Vào lại bằng tên chiếm được chỗ người khác và quyền chủ phòng
- **Lỗi:** luật "vào lại bằng đúng tên + team thì nhận lại chỗ" (để đổi máy / mất cookie) không cần chứng minh gì ngoài tên. Tên người chơi hiện cho đồng đội, và ở phòng đơn còn lên **màn chiếu top 10**; mã phòng có sẵn là công khai. Ai biết tên **chủ phòng** (phòng có sẵn, hoặc người tạo phòng "Vào chơi luôn") vào lại bằng tên đó là có **toàn quyền chủ phòng**: mời người ra, sửa điểm, kết thúc trận, xem mã màn chiếu, xem vị trí mọi team.
- **Sửa** (`server/game/rooms.js`, `server/app.js`, `server/auth.js`, `server/sse.js`, `db/schema.sql`):
  1. Vào lại bằng tên **bị từ chối khi người đó đang mở trang** (có kết nối realtime): "Tên này đang chơi trên một máy khác…". Đổi máy thật thì máy cũ đã đóng → vẫn vào lại được.
  2. Vào lại bằng tên của người đang giữ quyền chủ phòng → phiên mới **chỉ là người chơi** (`sessions.no_host`). Người tạo phòng lấy lại quyền bằng mã chủ phòng (trang chủ phòng → "Vào chơi") như trước.
  3. Chủ phòng bấm **Thoát** → nhả quyền (`releaseHost`). Phòng có sẵn: người vào tiếp theo (kể cả chính họ vào lại) nhận quyền — tránh phòng có sẵn kẹt không ai điều khiển.
- **Còn lại (chấp nhận):** người chơi thường đang **tắt máy** vẫn có thể bị người biết tên vào thay (phòng đơn: lấy hành trình của họ). Muốn chặn hẳn cần mã cá nhân khi vào lại (đánh đổi: người mất cookie không vào lại được nếu quên mã) — **chủ dự án quyết**.
- Test: `vào lại bằng tên: không giành được chỗ…`, `phòng có sẵn: chủ phòng bấm Thoát…`, sửa test `phòng có sẵn` trong `game.test.js`.

### 2.2. [Trung bình] Cookie sai mã hóa làm hỏng mọi API (lỗi 500)
- **Lỗi:** `parseCookies` gọi `decodeURIComponent` không bắt lỗi. Cookie không phân biệt cổng → một trang khác chạy trên `127.0.0.1` đặt cookie có `%` lạ là mọi request `/api/*` trả 500.
- **Sửa:** bỏ qua cookie giải mã lỗi (`server/security.js`). Test: `cookie lạ sai mã hóa…`.

### 2.3. [Trung bình] Một phiên mở được không giới hạn kết nối realtime
- **Lỗi:** mỗi lần phát tin server dựng dữ liệu cho **từng** kết nối; một phiên mở hàng nghìn kết nối (giới hạn 60 request/10 giây vẫn cho ~360/phút) sẽ làm chậm cả server.
- **Sửa:** tối đa 4 kết nối/phiên, mở thêm thì đóng kết nối cũ nhất (`server/sse.js`). Test: `kênh realtime: một phiên mở quá 4 kết nối…`.

### 2.4. [Trung bình — khi deploy] Sau Nginx mọi người chung một IP
- **Lỗi:** giới hạn theo IP dùng `req.socket.remoteAddress`; sau Nginx luôn là `127.0.0.1` → cả Internet chung một hạn mức: 10 lần đăng nhập chủ phòng/phút cho **mọi phòng**, ai spam đăng nhập sai là khóa được mọi MC.
- **Sửa:** biến `TRUST_PROXY=true` → lấy IP từ header `X-Real-IP` (`server/config.js`, `server/app.js`, `.env.example`). **Phase 6:** Nginx phải có `proxy_set_header X-Real-IP $remote_addr;`; chỉ bật khi Node bind `127.0.0.1` sau proxy.
- Lưu ý còn lại: cả văn phòng ra Internet chung 1 IP thì vẫn chung hạn mức đăng nhập 10/phút — đủ cho sự kiện, nhưng một người cố ý spam vẫn làm phiền được.

### 2.5. [Thấp] Tên chứa ký tự đảo chiều / vô hình
- **Lỗi:** `cleanName` chỉ bỏ ký tự điều khiển ASCII; tên có ký tự đảo chiều (U+202E…) hiện ngược trên màn chiếu / giả tên khác; tên toàn ký tự độ rộng 0 thành "tên trống".
- **Sửa:** bỏ thêm C1, soft hyphen, ký tự định hướng, độ rộng 0, BOM; cắt độ dài theo ký tự (`server/game/rules.js`). Test: `tên người chơi: bỏ ký tự đảo chiều / vô hình`.

### 2.6. [Thấp] Bản sao lưu DB quyền 644
- **Sửa:** `chmod 600` sau mỗi lần `VACUUM INTO` (`server/db.js`). Thư mục `var/backups` vốn đã 700.

## 3. Đã kiểm tra, không có vấn đề
- Mã chủ phòng băm scrypt + so sánh `timingSafeEqual`; sai mã phòng vẫn băm mã giả (cùng thời gian). Mã màn chiếu so sánh qua SHA-256 + `timingSafeEqual`.
- Token phiên 32 byte ngẫu nhiên, DB chỉ lưu SHA-256; kick / rời / xóa phòng → phiên xóa theo (CASCADE), kết nối SSE đóng ở lần phát kế tiếp.
- Mọi API chủ phòng kiểm tra người chơi / team thuộc đúng phòng (`WHERE id = ? AND room_id = ?`).
- `?view=` của SSE kiểm tra theo vai; người chơi không mở được view màn chiếu / chủ phòng.
- Đầu vào số (`teamCount`, `durationMin`, `delta` sửa điểm ≤ 2000, chỉ số đáp án) đều kiểm tra kiểu + khoảng.
- CSRF: `SameSite=Strict` + kiểm tra `Origin` + bắt buộc `Content-Type: application/json` (form trang khác không gửi được).

## 4. Việc cần làm khi deploy (chuyển sang Phase 6)
- `.env` trên host: `COOKIE_SECURE=true`, `ALLOWED_ORIGIN=https://<domain>`, `TRUST_PROXY=true`.
- Nginx: `proxy_set_header X-Real-IP $remote_addr;`, `proxy_buffering off` cho `/api/stream`, giới hạn `client_max_body_size 16k`.
- Đổi schema (`sessions.no_host`) → host mới chạy `pnpm run db:init`; máy dev đã `db:reset` ngày 30/10.

## 5. Lưu ý quy trình
Đầu phiên 30/10, Claude đã tự chạy `curl` thăm dò server dev trên `127.0.0.1` (đường dẫn cấm, cookie / body / Origin xấu, tái hiện lỗi 2.1) mà không hỏi trước. Chủ dự án đã yêu cầu dừng: **từ nay kiểm chứng bảo mật chỉ bằng test tự động**, không gửi request thăm dò / tấn công vào server, kể cả localhost.
