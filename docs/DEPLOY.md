# Deploy — Hành trình 3 miền

Tài liệu Phase 6 (PLAN.md). Mô hình: **một tiến trình Node** chạy trên **một VPS thuê ngoài** (Linux), **Nginx** đứng trước làm HTTPS, **systemd** giữ server chạy. Không tách frontend/backend, không dùng Vercel/Supabase.

```
Laptop người chơi ──HTTPS 443──▶ Nginx ──HTTP 127.0.0.1:3000──▶ node server/index.js ──▶ var/game.db (SQLite)
                                  (TLS, chặn IP, SSE không buffer)                        var/backups/ (5 phút/lần)
```

> **Quyết định 31/10:** deploy lên VPS thuê ngoài. Mục 11 tóm tắt dữ liệu nào được lưu và giữ bao lâu.

---

## 1. Lịch

| Ngày | Việc |
|---|---|
| ≤ 15/11 | Thuê VPS, mua/chọn domain, lấy IP public văn phòng (mục 2) |
| 18–19/11 | Dựng host theo mục 3–8, kiểm tra theo mục 9 |
| 19–21/11 | Tổng duyệt 6–8 người trên host (PLAN Phase 7) |
| 24/11 | Sự kiện — checklist mục 10 |
| 25/11 | Gỡ host — mục 12 |

## 2. Cần chuẩn bị

| Thứ | Ghi chú |
|---|---|
| VPS | Ubuntu 22.04/24.04, 1 vCPU, 1 GB RAM, 10 GB đĩa là dư cho ~100–200 người. Chọn vùng gần Việt Nam (Singapore / Việt Nam) cho độ trễ thấp |
| Domain | Bắt buộc để có HTTPS hợp lệ. Trỏ bản ghi `A` về IP của VPS. Ghi lại chính xác — dùng cho `ALLOWED_ORIGIN` |
| Chứng chỉ HTTPS | Let's Encrypt qua certbot, miễn phí, tự gia hạn (mục 6) |
| IP public văn phòng | Từ một máy trong mạng văn phòng, mở trang xem IP (vd `https://ifconfig.me`) vài lần, vài ngày khác nhau. Nếu IP đổi hoặc ra nhiều IP → văn phòng dùng nhiều đường mạng, phải liệt kê hết |
| Khóa SSH | Tạo cặp key riêng cho VPS này (`ssh-keygen -t ed25519`) |

**Quyết định 6.7 (đề xuất):** VPS nhìn thấy được từ Internet → **chặn theo IP văn phòng** ở Nginx (mục 6), người ngoài không vào được dù đoán ra mã phòng. Đánh đổi: người chơi dùng 4G hoặc wifi khác sẽ bị chặn. Nếu không lấy được IP văn phòng ổn định thì bỏ chặn IP, chỉ dựa vào mã phòng (khi đó ai có link cũng xem được trang chủ, danh sách phòng công khai và `/leaderboard`).

---

## 3. Chuẩn bị host (một lần)

VPS mới thường cho đăng nhập `root`. Bước đầu tạo user quản trị riêng:

```bash
# đăng nhập lần đầu bằng root (key hoặc mật khẩu nhà cung cấp gửi)
adduser <tên-bạn>
usermod -aG sudo <tên-bạn>
mkdir -p /home/<tên-bạn>/.ssh && cp ~/.ssh/authorized_keys /home/<tên-bạn>/.ssh/
chown -R <tên-bạn>:<tên-bạn> /home/<tên-bạn>/.ssh && chmod 700 /home/<tên-bạn>/.ssh
```

Từ đây đăng nhập bằng `<tên-bạn>`. Nếu nhà cung cấp có **firewall/security group** ở bảng điều khiển, mở giống mục 7 (22 cho IP của bạn, 80, 443).

```bash
# cập nhật hệ điều hành
sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx sqlite3 git

# user riêng để chạy game, không có quyền sudo, không đăng nhập được
# --no-create-home: thư mục /opt/vn-journey phải trống để git clone vào (mục 4)
sudo useradd --system --no-create-home --home-dir /opt/vn-journey --shell /usr/sbin/nologin vnj
sudo install -d -o vnj -g vnj -m 750 /opt/vn-journey
```

SSH: chỉ đăng nhập bằng key, tắt mật khẩu và root (`/etc/ssh/sshd_config`):

```
PasswordAuthentication no
PermitRootLogin no
```

`sudo systemctl reload ssh` — **giữ một phiên SSH đang mở** trong lúc thử phiên mới, phòng khóa mình ra ngoài.

### Cài Node đúng phiên bản

Project cần **Node v22.23.4** (`package.json` → `engines`; tối thiểu 22.9 vì dùng `--env-file-if-exists` và `node:sqlite`). Cài từ tarball chính thức, không cần nvm:

```bash
cd /tmp
curl -fsSLO https://nodejs.org/dist/v22.23.4/node-v22.23.4-linux-x64.tar.xz
curl -fsSLO https://nodejs.org/dist/v22.23.4/SHASUMS256.txt
grep node-v22.23.4-linux-x64.tar.xz SHASUMS256.txt | sha256sum -c -   # phải ra OK
sudo tar -xJf node-v22.23.4-linux-x64.tar.xz -C /opt
sudo ln -sf /opt/node-v22.23.4-linux-x64/bin/node /usr/local/bin/node
node --version   # v22.23.4
```

Không cần cài pnpm trên host: project **0 dependency**, không có bước `install`. Server chạy thẳng bằng `node`.

---

## 4. Lấy code từ git

Code lấy từ repo git — **không copy file tay** lên VPS. `.gitignore` đã loại `var/` (DB) và `.env`, nên trên VPS hai thứ này tạo riêng và `git pull` không đụng tới.

### Trên máy dev — trước mỗi lần đưa lên

```bash
pnpm run test && pnpm run data:check          # phải xanh hết
git push
git tag deploy-$(date +%Y%m%d-%H%M) && git push --tags   # mốc để quay lại nếu bản mới lỗi
```

### Trên VPS — lần đầu

**Repo private** → dùng *deploy key*: khóa SSH riêng của VPS, **chỉ đọc**, chỉ cho đúng repo này (không dùng khóa cá nhân của bạn trên VPS).

```bash
# khóa nằm ngoài thư mục code, chỉ user vnj đọc được
sudo install -d -o vnj -g vnj -m 700 /etc/vn-journey
sudo -u vnj ssh-keygen -t ed25519 -N "" -C vn-journey-vps -f /etc/vn-journey/deploy_key
sudo cat /etc/vn-journey/deploy_key.pub
```

Dán khóa public vào repo: GitHub → *Settings → Deploy keys → Add deploy key* (GitLab: *Settings → Repository → Deploy keys*), **không** tick "Allow write access".

```bash
SSHCMD="ssh -i /etc/vn-journey/deploy_key -o IdentitiesOnly=yes -o UserKnownHostsFile=/etc/vn-journey/known_hosts -o StrictHostKeyChecking=accept-new"
sudo -u vnj GIT_SSH_COMMAND="$SSHCMD" git clone git@github.com:<org>/<repo>.git /opt/vn-journey
sudo -u vnj git -C /opt/vn-journey config core.sshCommand "$SSHCMD"   # các lần pull sau tự dùng deploy key
```

- Lần kết nối đầu, SSH lưu vân tay máy chủ git vào `/etc/vn-journey/known_hosts` — so với vân tay công bố chính thức (GitHub: trang *GitHub's SSH key fingerprints* trong docs).
- **Repo public** → bỏ deploy key: `sudo -u vnj git clone https://github.com/<org>/<repo>.git /opt/vn-journey`.

Chạy test trên VPS để chắc đúng phiên bản Node:

```bash
sudo -u vnj -H bash -c 'cd /opt/vn-journey && node --disable-warning=ExperimentalWarning --test tests/*.test.js'
```

### Cấu hình `.env`

```bash
sudo -u vnj cp /opt/vn-journey/.env.example /opt/vn-journey/.env
sudo -u vnj chmod 600 /opt/vn-journey/.env
sudo -u vnj nano /opt/vn-journey/.env
```

| Biến | Giá trị trên host | Vì sao |
|---|---|---|
| `HOST` | `127.0.0.1` | **Giữ nguyên.** Node chỉ nghe nội bộ, mọi truy cập phải qua Nginx |
| `PORT` | `3000` | |
| `DB_PATH` | `var/game.db` | Phải nằm trong `var/` (script `db:init` từ chối đường dẫn khác) |
| `BACKUP_INTERVAL_MIN` | `5` | Giữ 12 bản gần nhất = 1 giờ |
| `COOKIE_SECURE` | `true` | Cookie chỉ gửi qua HTTPS; bật luôn header HSTS |
| `ALLOWED_ORIGIN` | `https://<domain>` | **Khớp chính xác** địa chỉ người chơi gõ: có `https://`, không dấu `/` cuối, có port nếu không phải 443. Sai là mọi nút bấm (POST) bị từ chối `bad-origin` |
| `TRUST_PROXY` | `true` | Lấy IP thật từ `X-Real-IP` do Nginx đặt — không thì cả văn phòng chung một giới hạn tần suất. **Chỉ bật khi `HOST=127.0.0.1`** |
| `GAME_DURATION_MIN` | `45` | |
| `FREEZE_BEFORE_END_MIN` | `10` | |
| `PRESET_ROOMS` | bỏ trống | Đặt `0` nếu không muốn có phòng chơi đơn sẵn |

### Tạo database

```bash
sudo -u vnj -H bash -c 'cd /opt/vn-journey && node --disable-warning=ExperimentalWarning scripts/init-db.mjs'
# → Đã tạo var/game.db: ... tỉnh, ... câu hỏi.
```

---

## 5. systemd

`/etc/systemd/system/vn-journey.service`:

```ini
[Unit]
Description=Hanh trinh 3 mien (game Ngay Van hoa Viet Nam)
After=network.target

[Service]
Type=simple
User=vnj
Group=vnj
WorkingDirectory=/opt/vn-journey
ExecStart=/usr/local/bin/node --env-file=.env --disable-warning=ExperimentalWarning server/index.js
Restart=on-failure
RestartSec=2
KillSignal=SIGTERM
TimeoutStopSec=10
UMask=0077

# khóa bớt quyền: chỉ ghi được var/
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/opt/vn-journey/var

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now vn-journey
systemctl status vn-journey          # active (running)
journalctl -u vn-journey -f          # xem log: "Hành trình 3 miền đang chạy: http://127.0.0.1:3000"
```

Server bắt `SIGTERM` (đóng SSE, đóng DB gọn gàng) nên `systemctl restart` an toàn.

---

## 6. Nginx

`/etc/nginx/sites-available/vn-journey`:

```nginx
# HTTP → HTTPS
server {
    listen 80;
    server_name <domain>;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    http2 on;
    server_name <domain>;

    ssl_certificate     /etc/nginx/certs/vn-journey.crt;
    ssl_certificate_key /etc/nginx/certs/vn-journey.key;
    ssl_protocols TLSv1.2 TLSv1.3;

    # Quyết định 6.7 — chỉ cho IP văn phòng (bỏ khối này nếu chọn chỉ dựa vào mã phòng)
    allow <dải IP văn phòng, vd 203.0.113.0/24>;
    deny  all;

    client_max_body_size 16k;     # server chỉ nhận body ≤ 10 KB
    server_tokens off;

    # Ghi đè X-Real-IP bằng IP thật — người dùng không tự giả được
    proxy_set_header Host      $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_http_version 1.1;
    proxy_set_header Connection "";

    # SSE realtime: không buffer, giữ kết nối lâu (server gửi ping mỗi 15 giây)
    location = /api/stream {
        proxy_pass http://127.0.0.1:3000;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 1h;
        proxy_send_timeout 1h;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_read_timeout 30s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/vn-journey /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

Ghi chú:
- Header bảo mật (CSP, HSTS, X-Frame-Options…) **do Node đặt**, không cần thêm ở Nginx.
- Mỗi người chơi giữ 1 kết nối SSE, màn chiếu và chủ phòng thêm vài kết nối. Mặc định `worker_connections 768` của Nginx đủ cho ~300 người; đông hơn thì tăng trong `/etc/nginx/nginx.conf`.
- **Chứng chỉ Let's Encrypt** — làm trước khi bật khối `allow/deny` (certbot cần port 80 truy cập được từ Internet):
  ```bash
  sudo apt install -y certbot python3-certbot-nginx
  sudo certbot --nginx -d <domain>      # tự sửa đường dẫn ssl_certificate trong file cấu hình
  sudo certbot renew --dry-run          # kiểm tra tự gia hạn
  ```
  Khối `allow/deny` đặt trong `server` 443 nên không ảnh hưởng gia hạn qua port 80.

---

## 7. Firewall

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from <IP máy bạn> to any port 22 proto tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

Port 3000 **không** mở — Node chỉ nghe `127.0.0.1`. Không chặn 80 theo IP ở ufw — Let's Encrypt cần port 80 để gia hạn chứng chỉ.

---

## 8. Cập nhật code sau khi đã deploy

Máy dev: test + `git push` + tag như mục 4. Trên VPS:

```bash
G="sudo -u vnj git -C /opt/vn-journey"     # thư mục code chỉ user vnj vào được (quyền 750)
$G fetch --tags
$G diff --stat HEAD origin/main -- db/schema.sql data/   # có dòng nào → xem cảnh báo bên dưới
$G pull --ff-only
sudo systemctl restart vn-journey
journalctl -u vn-journey -n 20
```

- **Không sửa file trực tiếp trên VPS** (trừ `.env`). Sửa ở máy dev → push → pull. Nếu `git pull --ff-only` báo lỗi, xem `$G status` — có file bị sửa tay trên VPS.
- Bản cập nhật **có sửa `db/schema.sql` hoặc `data/`** (câu hỏi, tỉnh) → phải tạo lại DB vì dữ liệu được nạp lúc tạo:
  ```bash
  sudo systemctl stop vn-journey
  sudo -u vnj -H bash -c 'cd /opt/vn-journey && node --disable-warning=ExperimentalWarning scripts/init-db.mjs --reset'
  sudo systemctl start vn-journey
  ```
  **Mất toàn bộ phòng và bảng xếp hạng.** Không làm việc này từ 23/11 trở đi.
- **Quay lại bản trước** khi bản mới lỗi:
  ```bash
  $G tag --list 'deploy-*'                 # chọn mốc trước đó
  $G checkout deploy-<ngày-giờ>
  sudo systemctl restart vn-journey
  ```
  Sửa xong ở máy dev thì về lại nhánh chính: `$G checkout main && $G pull --ff-only` (nhánh chính tên khác `main` thì đổi tên ở các lệnh trên).
- Từ 22/11: chỉ đưa lên bản sửa lỗi, đã test, và đã thử trên VPS trước buổi sự kiện.

---

## 9. Kiểm tra sau khi dựng (6.9)

Chỉ dùng trình duyệt như người chơi bình thường — **không chạy script thăm dò/tấn công** (PLAN §0.4).

| # | Kiểm tra | Mong đợi |
|---|---|---|
| 1 | Mở `http://<domain>` | Tự chuyển sang `https://`, không cảnh báo chứng chỉ |
| 2 | Trang chủ | Landing hiện, danh sách phòng tải được |
| 3 | Tạo phòng → vào bằng 2 trình duyệt khác nhau | Vào được; bấm nút không bị lỗi "Yêu cầu không hợp lệ" (nếu bị → `ALLOWED_ORIGIN` sai) |
| 4 | Realtime | Một bên trả lời, bên kia thấy ngay (< 1–2 giây). Để yên 5 phút vẫn còn cập nhật |
| 5 | Màn chiếu `/screen.html`, chủ phòng `/admin.html` | Hiện đúng |
| 6 | `sudo systemctl restart vn-journey` giữa trận | Trang tự kết nối lại sau vài giây, trận tiếp tục đúng |
| 7 | Điện thoại dùng 4G (ngoài mạng công ty) | Bị chặn (403 hoặc không kết nối được) — nếu đã chặn IP |
| 8 | Từ laptop công ty qua proxy công ty | Vào được và realtime vẫn chạy. Nếu proxy công ty chặn domain mới hoặc cắt kết nối SSE → phải nhờ IT whitelist (xem PLAN rủi ro "proxy chặn SSE") — **thử sớm**, càng sớm càng có thời gian xử lý |
| 9 | `ls -l /opt/vn-journey/var /opt/vn-journey/var/backups` | Chủ sở hữu `vnj`, quyền `700`/`600`; sau 5 phút có file `backup-*.db` |

---

## 10. Ngày sự kiện (24/11)

**Sáng sớm**
- [ ] `systemctl status vn-journey` → running; `journalctl -u vn-journey --since today` không có lỗi
- [ ] Mở trang chủ từ laptop công ty, tạo 1 phòng thử, chơi 1 câu
- [ ] Màn chiếu đã mở trên máy chiếu, đúng phòng
- [ ] Còn chỗ trống đĩa: `df -h /opt`
- [ ] **Không** chạy `db:reset` sau khi mọi người bắt đầu tạo phòng

**Khi có sự cố**

| Triệu chứng | Làm gì |
|---|---|
| Trang không vào được | `systemctl status vn-journey nginx`; `sudo systemctl restart vn-journey` |
| Vào được nhưng không cập nhật realtime | Kiểm tra cấu hình `location = /api/stream` (buffering); người chơi tải lại trang |
| Bấm gì cũng "Yêu cầu không hợp lệ" | `ALLOWED_ORIGIN` khác địa chỉ đang dùng → sửa `.env`, restart |
| Cả phòng bị "thử lại sau" (giới hạn tần suất) | `TRUST_PROXY` chưa bật hoặc Nginx thiếu `X-Real-IP` |
| DB hỏng / lỡ xóa dữ liệu | Khôi phục bản sao lưu (dưới) |

**Khôi phục bản sao lưu** (mất tối đa 5 phút dữ liệu):

```bash
sudo systemctl stop vn-journey
cd /opt/vn-journey/var
sudo -u vnj cp game.db game.db.broken
sudo -u vnj cp backups/$(ls backups | sort | tail -1) game.db
sudo -u vnj rm -f game.db-wal game.db-shm
sudo systemctl start vn-journey
```

---

## 11. Dữ liệu trên host

| Dữ liệu | Giữ bao lâu |
|---|---|
| Phòng, team, người chơi, câu trả lời | Tự xóa 24 giờ sau khi tạo phòng (phòng đơn có sẵn: 30 phút sau khi kết thúc) |
| Bảng xếp hạng cá nhân (tên tự nhập + điểm, phòng đơn) | Tự xóa sau 7 ngày, công khai ở `/leaderboard` |
| Bản sao lưu | 12 bản gần nhất (1 giờ) |
| Log Nginx | IP + URL truy cập, theo cấu hình logrotate của máy |

Không có email, mật khẩu hay tài khoản người dùng. Dữ liệu nằm trên VPS của nhà cung cấp bên ngoài — nên chọn nhà cung cấp có cam kết xóa đĩa khi hủy máy.

## 12. Gỡ bỏ (25/11)

Nếu muốn giữ kết quả: trước khi gỡ, copy `var/game.db` về máy (chứa tên người chơi — xóa sau khi dùng xong):

```bash
# trên VPS: dừng server để dữ liệu trong WAL được ghi hết vào game.db
sudo systemctl stop vn-journey
# DB thuộc user vnj, quyền 600 → chép ra home của bạn trước
sudo cp /opt/vn-journey/var/game.db ~/ket-qua.db && sudo chown $USER ~/ket-qua.db
# trên máy bạn:
scp <tên-bạn>@<domain>:ket-qua.db ./ket-qua-24-11.db
```

Sau đó **hủy (destroy) VPS** trong bảng điều khiển nhà cung cấp — xóa luôn code, DB, bản sao lưu, `.env`, log. Không cần gỡ từng phần. Xóa thêm: bản ghi DNS trỏ về VPS, **deploy key** trong cài đặt repo, khóa SSH đã tạo cho VPS này.
